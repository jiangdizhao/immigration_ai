import os

from fastapi import APIRouter, Depends

from app.api.deps import verify_api_key
from app.db.session import get_db
from app.schemas.query import QueryRequest, QueryResponse
from app.services.query_service import QueryService

router = APIRouter(dependencies=[Depends(verify_api_key)])


@router.post("", response_model=QueryResponse)
def run_query(payload: QueryRequest, db=Depends(get_db)) -> QueryResponse:
    engine = os.getenv("ANSWER_ENGINE", "v1").strip().lower()
    if engine in {"v2", "verified", "verified_answer", "v2_verified_answer"}:
        from app.services.v2.verified_answer_service import QueryServiceV2

        service = QueryServiceV2()
        return service.handle_query(db, payload)

    service = QueryService()
    return service.handle_query(db, payload)
