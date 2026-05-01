from typing import Any, Literal

from pydantic import Field

from app.core.config import get_settings
from app.schemas.common import BaseSchema
from app.schemas.source import CitationOut
from app.schemas.state import CaseHypothesis, FactSlotState, InteractionPlan, ConversationState

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
    user_display_mode: Literal[
        "direct_short",
        "general_with_warning",
        "answer_then_ask",
        "ask_one_question",
        "escalate_with_brief_reason",
        "booking_handoff",
    ] | None = None
    issue_type: str | None = None
    missing_facts: list[str] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)
    citations: list[CitationOut] = Field(default_factory=list)
    compact_sources: list[str] = Field(default_factory=list)
    escalate: bool = False
    next_action: Literal["answer", "ask_followup", "suggest_consultation"]
    conversation_state: ConversationState | None = None
    case_hypothesis: CaseHypothesis | None = None
    fact_slot_states: list[FactSlotState] = Field(default_factory=list)
    interaction_plan: InteractionPlan | None = None
    retrieval_debug: dict[str, Any] = Field(default_factory=dict)
