from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import DBSession, verify_api_key
from app.schemas.intake import MatterOut
from app.services.intake_service import IntakeService

router = APIRouter(dependencies=[Depends(verify_api_key)])
service = IntakeService()


@router.get("/{matter_id}", response_model=MatterOut)
def get_matter(matter_id: str, db: DBSession) -> MatterOut:
    matter = service.get_matter(db, matter_id)
    if matter is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matter not found")
    return MatterOut.model_validate(matter)
