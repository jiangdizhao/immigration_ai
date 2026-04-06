from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import DBSession, verify_api_key
from app.schemas.intake import IntakeUpsertRequest, IntakeUpsertResponse, MatterOut
from app.services.intake_service import IntakeService

router = APIRouter(dependencies=[Depends(verify_api_key)])
service = IntakeService()


@router.post("", response_model=IntakeUpsertResponse)
def upsert_intake(payload: IntakeUpsertRequest, db: DBSession) -> IntakeUpsertResponse:
    matter, created, updated_answers = service.upsert_matter(db, payload)
    return IntakeUpsertResponse(
        matter=MatterOut.model_validate(matter),
        created=created,
        updated_answers=updated_answers,
    )
