from typing import Any

from pydantic import Field

from app.schemas.common import BaseSchema


class IntakeAnswerIn(BaseSchema):
    question_key: str = Field(min_length=1, max_length=100)
    question_label: str | None = Field(default=None, max_length=255)
    answer_text: str | None = None
    answer_json: dict[str, Any] | None = None
    source: str = Field(default="widget", max_length=50)


class IntakeUpsertRequest(BaseSchema):
    matter_id: str | None = None
    session_id: str | None = None
    client_display_name: str | None = None
    contact_email: str | None = None
    issue_summary: str | None = None
    issue_type: str | None = None
    visa_type: str | None = None
    risk_level: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    answers: list[IntakeAnswerIn] = Field(default_factory=list)


class IntakeAnswerOut(BaseSchema):
    id: str
    matter_id: str
    question_key: str
    question_label: str | None = None
    answer_text: str | None = None
    answer_json: dict[str, Any] | None = None
    source: str


class MatterOut(BaseSchema):
    id: str
    session_id: str | None = None
    client_display_name: str | None = None
    contact_email: str | None = None
    issue_summary: str | None = None
    status: str
    issue_type: str | None = None
    visa_type: str | None = None
    risk_level: str | None = None
    metadata_json: dict[str, Any]
    intake_answers: list[IntakeAnswerOut] = Field(default_factory=list)


class IntakeUpsertResponse(BaseSchema):
    matter: MatterOut
    created: bool
    updated_answers: int
