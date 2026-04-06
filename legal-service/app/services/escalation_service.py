from sqlalchemy.orm import Session

from app.db.models import Matter
from app.schemas.escalation import EscalationRequest, EscalationResponse


class EscalationService:
    def flag(self, db: Session, payload: EscalationRequest) -> EscalationResponse:
        matter = db.get(Matter, payload.matter_id)
        if matter is None:
            raise ValueError("Matter not found")

        matter.status = "needs_lawyer_review"
        matter.risk_level = payload.urgency
        matter.metadata_json = {
            **(matter.metadata_json or {}),
            "escalation": {
                "reason": payload.reason,
                "urgency": payload.urgency,
                "preferred_contact_email": payload.preferred_contact_email,
                "preferred_contact_phone": payload.preferred_contact_phone,
                "notes": payload.notes,
            },
        }
        db.commit()

        return EscalationResponse(
            matter_id=matter.id,
            status=matter.status,
            escalation_flagged=True,
            next_step="Lawyer review should be arranged from the website workflow or CRM.",
        )
