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
from app.services.experience_archive_service import ExperienceArchiveService
from app.core.config import get_settings

router = APIRouter(dependencies=[Depends(verify_api_key)])
observability_service = AgentObservabilityService()
political_failsafe_service = get_political_failsafe_service()
logger = logging.getLogger(__name__)

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
    """Schedule a non-blocking shadow Luna run in a daemon thread.

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
            max_flat_rag_calls=get_settings().agent_max_flat_rag_calls,
            retry_viability_threshold_ms=get_settings().agent_retry_viability_threshold_ms,
        )

        def _run_in_thread() -> None:
            """Run the async shadow task in a dedicated event loop."""
            try:
                shadow_started_at = time.perf_counter()
                logger.info(
                    "Shadow Luna run started: start_delay_ms=%.0f initial_remaining_deadline_ms=%.0f turn_deadline_ms=%d",
                    max(0.0, (shadow_started_at - accepted_at) * 1000),
                    deadline.remaining_ms(),
                    deadline.turn_deadline_ms,
                )
                asyncio.run(_run_shadow())
            except Exception:
                logger.exception("Shadow Luna background task failed")

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
    background_tasks: BackgroundTasks = None,
    db=Depends(get_db),
) -> QueryResponse:
    # This is the backend timing origin: before engine selection, service
    # construction, matter/state loading, or agent setup.
    accepted_at = time.perf_counter()
    settings = get_settings()
    default_agent_selected = (
        getattr(settings, "default_agent_serving_enabled", False)
        and payload.assistant_mode in {"default", "default_legal_pipeline"}
    )
    token = observability_service.begin_turn(
        mode=payload.assistant_mode,
        started_at=accepted_at,
        architecture_version=(
            "phase2.default_agent_runtime" if default_agent_selected else "legacy.v1"
        ),
    )
    try:
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

            # Keep defense-in-depth history hygiene for callers that bypass
            # Next.js.  The current submission was checked above; only blocked
            # carried history is removed here before any engine can consume it.
            payload = political_failsafe_service.sanitize_payload_history(payload)

        # Launch the non-serving shadow after the political gate and before
        # legacy work.  The shadow receives only immutable request data and
        # owns its DB/provider resources, so legacy state mutation cannot race
        # with a shared Matter/session snapshot.
        if (
            settings.agent_shadow_enabled
            and not politically_blocked
            and not default_agent_selected
        ):
            is_premium = payload.assistant_mode in (
                "premium", "premium_direct_gpt55_high",
            )
            shadow_kwargs = {
                "question": payload.question,
                "mode": "premium" if is_premium else "default",
                "response_language": payload.response_language or "en",
                "accepted_at": accepted_at,
                "turn_deadline_ms": (
                    settings.premium_turn_deadline_ms if is_premium
                    else settings.default_turn_deadline_ms
                ),
                "answer_research_target_ms": (
                    settings.premium_answer_research_target_ms if is_premium
                    else settings.default_answer_research_target_ms
                ),
                "checker_target_ms": settings.legal_fact_check_target_ms,
                "experiment_arm": None,
            }
            _schedule_shadow_run(**shadow_kwargs)

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
        observability_service.mark_metrics_complete()

        # The normal Default service paths archive through ReviewTraceService
        # with richer state.  This ingress fallback covers Default fast paths
        # that intentionally do not create an AnswerTrace.  It is idempotent
        # with the richer sidecar capture and never runs for Premium.
        if payload.assistant_mode in {"default", "default_legal_pipeline"}:
            archive_observability = observability_service.trace_payload() or {}
            archive_request_id = archive_observability.get("request_id") or payload.client_turn_id
            if not ExperienceArchiveService.capture_scheduled_for(archive_request_id):
                ExperienceArchiveService().safe_capture_async(
                    payload=payload,
                    response=response,
                    request_id=archive_request_id,
                    execution_metrics=archive_observability.get("execution_metrics"),
                )

        return response
    finally:
        observability_service.reset_turn(token)
