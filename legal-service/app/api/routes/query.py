import os
import time
import logging

from fastapi import APIRouter, Depends

from app.api.deps import verify_api_key
from app.db.session import get_db
from app.schemas.query import QueryRequest, QueryResponse
from app.services.query_service import QueryService
from app.services.agent_observability_service import AgentObservabilityService
from app.services.political_failsafe_service import get_political_failsafe_service
from app.core.config import get_settings

router = APIRouter(dependencies=[Depends(verify_api_key)])
observability_service = AgentObservabilityService()
political_failsafe_service = get_political_failsafe_service()
logger = logging.getLogger(__name__)


@router.post("", response_model=QueryResponse)
def run_query(payload: QueryRequest, db=Depends(get_db)) -> QueryResponse:
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
        if settings.backend_political_failsafe_enabled:
            political_gate = political_failsafe_service.evaluate_payload(payload)
            observability_service.record_political_gate(
                decision=political_gate.decision,
                policy_version=political_gate.policy_version,
                policy_hash=political_gate.policy_hash,
                latency_ms=political_gate.timings.total_ms,
            )
            if political_gate.decision == "block":
                # This event intentionally uses only the YAML-approved,
                # content-free telemetry fields.  Do not pass payload/gate
                # match data to logs, state, traces, models, or services.
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
        # Phase 2's explicit frontend mode remains compatible with the legacy
        # serving aliases while ANSWER_ENGINE=v1 stays authoritative.
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
        return response
    finally:
        observability_service.reset_turn(token)
