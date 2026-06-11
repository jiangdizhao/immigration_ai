from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.schemas.query import QueryRequest, QueryResponse
from app.services.query_service import QueryService

router = APIRouter()


@router.post("", response_model=QueryResponse)
def run_query(payload: QueryRequest, db=Depends(get_db)) -> QueryResponse:
    service = QueryService()
    return service.handle_query(db, payload)