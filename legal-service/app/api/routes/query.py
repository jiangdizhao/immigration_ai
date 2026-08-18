import asyncio
import os
import time
import logging
import threading

from fastapi import APIRouter, Depends, BackgroundTasks

from app.api.deps import verify_api_key
from app.db.session import get_db, SessionLocal
from app.schemas.query import QueryRequest, QueryResponse
from app.services.query_service import QueryService
from app.services.agent_observability_service import AgentObservabilityService, AbsoluteTurnDeadline
from app.services.political_failsafe_service import get_political_failsafe_service
from app.core.config import get_settings

router = APIRouter(dependencies=[Depends(verify_api_key)])
observability_service = AgentObservabilityService()
political_failsafe_service = get_political_failsafe_service()
logger = logging.getLogger(__name__)

# Single background event loop for shadow tasks (thread-safe)
_bg_loop: asyncio.AbstractEventLoop | None = None
_bg_loop_lock = threading.Lock()


def _get_bg_loop() -> asyncio.AbstractEventLoop:
    global _bg_loop
    with _bg_loop_lock:
        if _bg_loop is None or _bg_loop.is_closed():
            _bg_loop = asyncio.new_event_loop()
        return _bg_loop


def _schedule_shadow_run(
    *,
    question: str,
    mode: str,
    response_language: str,
    accepted_at: float,
    turn_deadline_ms: int,
    answer_research_target_ms: int,
    checker_target_ms: int,
    experiment_arm: str | None = None,
) -> None:
    """Schedule a non-blocking shadow Luna run via BackgroundTasks.

    Creates a fresh DB session inside the background task.
    Does NOT retain the request-scoped session.
    """
    try:
        from app.schemas.agent import ExecutionBudget
        from app.services.agent_runtime_service import AgentRuntimeService
        from app.services.shadow_agent_service import ShadowAgentService

        deadline = AbsoluteTurnDeadline(
            started_at=accepted_at,
            turn_deadline_ms=turn_deadline_ms,
        )

        budget = ExecutionBudget(
            max_tool_rounds=get_settings().agent_max_tool_rounds,
            max_provider_calls=get_settings().agent_max_provider_calls,
            max_retries=get_settings().agent_max_retries,
            turn_deadline_ms=turn_deadline_ms,
            answer_research_target_ms=answer_research_target_ms,
            checker_target_ms=checker_target_ms,
        )

        def _run_in_thread() -> None:
            """Run the async shadow task in a dedicated event loop."""
            loop = _get_bg_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(_run_shadow())
            except Exception:
                logger.exception("Shadow Luna background task failed")
            finally:
                pass  # Don't close the loop — it's shared

        async def _run_shadow() -> None:
            db = SessionLocal()
            try:
                # Create provider — OpenAI adapter only, NO mock fallback
                from app.services.openai_responses_adapter import OpenAIResponsesAdapter
                provider = OpenAIResponsesAdapter()
                runtime = AgentRuntimeService(provider=provider)
                shadow = ShadowAgentService(runtime)

                trace = await shadow.run_shadow(
                    user_text=question,
                    mode=mode if mode in ("default", "premium") else "default",
                    response_language=response_language,
                    deadline=deadline,
                    execution_budget=budget,
                    upstream_gate_allowed=True,
                    experiment_arm=experiment_arm,
                    db_session_factory=lambda: SessionLocal(),
                )
                logger.debug(
                    "Shadow trace: status=%s arm=%s duration=%.0fms",
                    trace.status, trace.experiment_arm, trace.total_duration_ms,
                )
            except Exception:
                logger.exception("Shadow Luna background task failed")
            finally:
                db.close()

        # Run in a daemon thread so it doesn't block process shutdown
        t = threading.Thread(target=_run_in_thread, daemon=True)
        t.start()

    except Exception:
        logger.exception("Failed to schedule shadow Luna run")


@router.post("", response_model=QueryResponse)
def run_query(
    payload: QueryRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
) -> QueryResponse:
    # This is the backend timing origin: before engine selection, service
    # construction, matter/state loading, or agent setup.
    accepted_at = time.perf_counter()
    token = observability_service.begin_turn(
        mode=payload.assistant_mode,
        started_at=accepted_at,
        architecture_version="legacy.v1",
    )
    try:
        settings = get_settings()
        politically_blocked = False

        if settings.backend_political_failsafe_enabled:
            political_gate = political_failsafe_service.evaluate_payload(payload)
            observability_service.record_political_gate(
                decision=political_gate.decision,
                policy_version=political_gate.policy_version,
                policy_hash=political_gate.policy_hash,
                latency_ms=political_gate.timings.total_ms,
            )
            if political_gate.decision == "block":
                politically_blocked = True
                logger.info(
                    "political gate blocked FastAPI request",
                    extra={
                        "political_gate": political_gate.content_free_telemetry(
                            enforcement_layer="fastapi",
                            application_build=settings.app_version,
                        )
                    },
                )
                observability_service.mark_metrics_complete()
                return QueryResponse(
                    matter_id=None,
                    answer=political_gate.response_text,
                    response_language=political_gate.response_language,
                    confidence="high",
                    user_display_mode="direct_short",
                    issue_type=None,
                    missing_facts=[],
                    follow_up_questions=[],
                    citations=[],
                    compact_sources=[],
                    escalate=False,
                    next_action="answer",
                    retrieval_debug={},
                )

        # Additive public aliases use the existing legacy engines in Phase 1.
        if payload.assistant_mode == "default":
            payload = payload.model_copy(update={"assistant_mode": "default_legal_pipeline"})
        elif payload.assistant_mode == "premium":
            payload = payload.model_copy(update={"assistant_mode": "premium_direct_gpt55_high"})
        engine = os.getenv("ANSWER_ENGINE", "v1").strip().lower()
        if engine in {"v2", "verified", "verified_answer", "v2_verified_answer"}:
            from app.services.v2.verified_answer_service_patch2 import QueryServiceV2Patch2

            service = QueryServiceV2Patch2()
        else:
            service = QueryService()
        observability_service.mark_agent_started("serving_engine_dispatch")
        response = service.handle_query(db, payload)
        observability_service.mark_answer_completed()

        # Schedule Phase-5 shadow Luna run AFTER political gate and AFTER
        # public response is ready.  Shadow is non-blocking and isolated.
        if settings.agent_shadow_enabled and not politically_blocked:
            is_premium = payload.assistant_mode in (
                "premium", "premium_direct_gpt55_high",
            )
            _schedule_shadow_run(
                question=payload.question,
                mode="premium" if is_premium else "default",
                response_language=response.response_language or "en",
                accepted_at=accepted_at,
                turn_deadline_ms=(
                    settings.premium_turn_deadline_ms if is_premium
                    else settings.default_turn_deadline_ms
                ),
                answer_research_target_ms=(
                    settings.premium_answer_research_target_ms if is_premium
                    else settings.default_answer_research_target_ms
                ),
                checker_target_ms=settings.legal_fact_check_target_ms,
                experiment_arm=None,
            )

        return response
    finally:
        observability_service.reset_turn(token)