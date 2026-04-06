from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import DBSession, verify_api_key
from app.schemas.source import LegalSourceOut
from app.services.source_service import SourceService

router = APIRouter(dependencies=[Depends(verify_api_key)])
service = SourceService()


@router.get("/{source_id}", response_model=LegalSourceOut)
def get_source(source_id: str, db: DBSession) -> LegalSourceOut:
    source = service.get_source(db, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    return LegalSourceOut.model_validate(source)
