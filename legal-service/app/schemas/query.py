from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from app.core.config import get_settings
from app.schemas.common import BaseSchema
from app.schemas.source import CitationOut
from app.schemas.state import CaseHypothesis, FactSlotState, InteractionPlan, ConversationState

settings = get_settings()


class CustomerDocumentUnit(BaseSchema):
    ordinal: int = Field(ge=0)
    locator: dict[str, str | int] = Field(default_factory=dict, max_length=16)
    text: str = Field(min_length=1, max_length=4000)
    extractionMethod: str = Field(max_length=32)

    @field_validator("locator")
    @classmethod
    def bounded_locator(cls, value: dict[str, str | int]) -> dict[str, str | int]:
        if any(len(key) > 64 or (isinstance(item, str) and len(item) > 256) for key, item in value.items()):
            raise ValueError("customer document locator exceeds its bounds")
        return value


class CustomerDocumentEvidenceItem(BaseSchema):
    documentId: str = Field(min_length=1, max_length=64)
    runId: str = Field(min_length=1, max_length=64)
    originalFilename: str = Field(min_length=1, max_length=255)
    mimeType: str = Field(min_length=1, max_length=128)
    runStatus: Literal["complete", "partial", "needs_review"]
    extractionMethod: str = Field(max_length=32)
    truncated: bool
    includedUnitOrdinals: list[int] = Field(max_length=8)
    locators: list[dict[str, str | int]] = Field(max_length=8)
    units: list[CustomerDocumentUnit] = Field(min_length=1, max_length=8)

    @field_validator("locators")
    @classmethod
    def bounded_locators(cls, values: list[dict[str, str | int]]) -> list[dict[str, str | int]]:
        if any(
            len(key) > 64 or (isinstance(value, str) and len(value) > 256)
            for locator in values
            for key, value in locator.items()
        ):
            raise ValueError("customer document locator exceeds its bounds")
        return values


class CustomerDocumentEvidence(BaseSchema):
    documents: list[CustomerDocumentEvidenceItem] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def bounded_packet(self):
        units = [unit for document in self.documents for unit in document.units]
        if len(units) > 24 or sum(len(unit.text) for unit in units) > 24000:
            raise ValueError("customer document evidence exceeds packet limits")
        for document in self.documents:
            if sum(len(unit.text) for unit in document.units) > 8000:
                raise ValueError("customer document exceeds packet limits")
            if len(document.includedUnitOrdinals) != len(document.units) or len(document.locators) != len(document.units):
                raise ValueError("customer document provenance must match included units")
            if document.includedUnitOrdinals != [unit.ordinal for unit in document.units]:
                raise ValueError("customer document ordinal manifest must match included units")
            if document.locators != [unit.locator for unit in document.units]:
                raise ValueError("customer document locator manifest must match included units")
        return self

class QueryRequest(BaseSchema):
    question: str = Field(min_length=1, max_length=4000)

    response_language: Literal["en", "zh"] | None = None
    matter_id: str | None = None
    session_id: str | None = None
    frontend_chat_id: str | None = None
    frontend_user_id: str | None = None
    #preferred_jurisdiction: str | None = Field(default="Cth")
    preferred_jurisdiction: str | None = Field(default=settings.canonical_jurisdiction)
    preferred_source_types: list[str] = Field(default_factory=list)
    intake_facts: dict[str, Any] = Field(default_factory=dict)
    # Facts belonging to the current guided submission.  ``None`` preserves
    # compatibility for direct/stale clients that only send intake_facts.
    current_intake_facts: dict[str, Any] | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)
    answer_preference: Literal["auto", "answer_first", "continue_intake", "final_recommendation"] = "answer_first"
    # Public UI processing lane. The default keeps the full legal verification pipeline.
    # The premium lane is still pre-screened for politics-sensitive content, then answers
    # directly with a high-reasoning model without Schedule/RAG/source verification.
    assistant_mode: Literal[
        "fast",
        "default",
        "premium",
        "default_legal_pipeline",
        "premium_direct_gpt55_high",
    ] = "default_legal_pipeline"
    political_gate_version: str | None = Field(default=None, max_length=100)
    political_gate_decision_id: str | None = Field(default=None, max_length=255)
    client_turn_id: str | None = Field(default=None, max_length=255)
    # Optional full frontend-visible message history.
    frontend_messages: list[dict[str, Any]] = Field(default_factory=list)
    customer_document_evidence: CustomerDocumentEvidence = Field(default_factory=CustomerDocumentEvidence)

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("question must not be blank")
        return value


class QueryResponse(BaseSchema):
    matter_id: str | None = None
    answer: str
    response_language: Literal["en", "zh"] = "en"
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
    legal_reasoning_trace: dict[str, Any] = Field(default_factory=dict)
    retrieval_debug: dict[str, Any] = Field(default_factory=dict)
    architecture_version: str | None = None
    research_status: Literal["not_required", "complete", "incomplete"] | None = None
    fact_check_status: Literal["not_required", "pass", "fix", "uncertain", "failed"] | None = None
    trace_id: str | None = None
