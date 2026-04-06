from typing import Any

from pydantic import EmailStr, Field

from app.schemas.common import BaseSchema


class EscalationRequest(BaseSchema):
    matter_id: str
    reason: str = Field(min_length=3, max_length=2000)
    urgency: str = Field(default="normal", max_length=50)
    preferred_contact_email: EmailStr | None = None
    preferred_contact_phone: str | None = Field(default=None, max_length=50)
    notes: dict[str, Any] = Field(default_factory=dict)


class EscalationResponse(BaseSchema):
    matter_id: str
    status: str
    escalation_flagged: bool
    next_step: str
