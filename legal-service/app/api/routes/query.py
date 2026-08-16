import os
import time

from fastapi import APIRouter, Depends

from app.api.deps import verify_api_key
from app.db.session import get_db
from app.schemas.query import QueryRequest, QueryResponse
from app.services.query_service import QueryService
from app.services.agent_observability_service import AgentObservabilityService

router = APIRouter(dependencies=[Depends(verify_api_key)])
observability_service = AgentObservabilityService()


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
        # Additive public aliases use the existing legacy engines in Phase 1.
        # Frontend explicit-mode wiring remains a separately gated Phase 2 task.
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
