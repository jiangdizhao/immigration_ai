from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import DBSession, verify_api_key
from app.schemas.escalation import EscalationRequest, EscalationResponse
from app.services.escalation_service import EscalationService

router = APIRouter(dependencies=[Depends(verify_api_key)])
service = EscalationService()


@router.post("", response_model=EscalationResponse)
def escalate(payload: EscalationRequest, db: DBSession) -> EscalationResponse:
    try:
        return service.flag(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
