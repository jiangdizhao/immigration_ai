from typing import Any, Literal

from pydantic import Field

from app.core.config import get_settings
from app.schemas.common import BaseSchema
from app.schemas.source import CitationOut

settings = get_settings()

class QueryRequest(BaseSchema):
    question: str = Field(min_length=3, max_length=4000)
    matter_id: str | None = None
    session_id: str | None = None
    #preferred_jurisdiction: str | None = Field(default="Cth")
    preferred_jurisdiction: str | None = Field(default=settings.canonical_jurisdiction)
    preferred_source_types: list[str] = Field(default_factory=list)
    intake_facts: dict[str, Any] = Field(default_factory=dict)
    top_k: int | None = Field(default=None, ge=1, le=20)


class QueryResponse(BaseSchema):
    matter_id: str | None = None
    answer: str
    confidence: Literal["low", "medium", "high"]
    issue_type: str | None = None
    missing_facts: list[str] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)
    citations: list[CitationOut] = Field(default_factory=list)
    escalate: bool = False
    next_action: Literal["answer", "ask_followup", "suggest_consultation"]
    retrieval_debug: dict[str, Any] = Field(default_factory=dict)
