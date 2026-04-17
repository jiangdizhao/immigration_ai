from typing import Any, Literal

from pydantic import Field

from app.schemas.common import BaseSchema


ConversationState = Literal[
    "NEW",
    "FACT_GATHERING",
    "READY_FOR_ANALYSIS",
    "ANSWERED_GENERAL",
    "FOLLOW_UP_PENDING",
    "ESCALATION_READY",
    "BOOKING_PENDING",
    "CLOSED",
]

ConfidenceLevel = Literal["low", "medium", "high"]
NextAction = Literal["answer", "ask_followup", "suggest_consultation"]
TurnRole = Literal["user", "assistant", "system"]


class ConversationTurn(BaseSchema):
    role: TurnRole
    content: str
    effective_question: str | None = None
    next_action: NextAction | None = None
    confidence: ConfidenceLevel | None = None
    timestamp: str | None = None


class RiskFlags(BaseSchema):
    deadline_sensitive: bool = False
    cancellation_related: bool = False
    detention_related: bool = False
    character_issue: bool = False
    pic4020_issue: bool = False
    review_related: bool = False


class MatterState(BaseSchema):
    conversation_state: ConversationState = "NEW"
    issue_type: str | None = None
    operation_type: str | None = None
    visa_type: str | None = None
    carried_intake_facts: dict[str, Any] = Field(default_factory=dict)
    fact_status: dict[str, str] = Field(default_factory=dict)
    risk_flags: RiskFlags = Field(default_factory=RiskFlags)
    latest_question: str | None = None
    last_contextualized_question: str | None = None
    last_answer_type: str | None = None
    next_action: NextAction | None = None
    conversation_history: list[ConversationTurn] = Field(default_factory=list)


class ContextualizationResult(BaseSchema):
    standalone_question: str
    used_history: bool = False
    reason: str | None = None
    carried_facts: dict[str, Any] = Field(default_factory=dict)


class IssueAndOperation(BaseSchema):
    issue_type: str | None = None
    operation_type: str | None = None
    visa_type: str | None = None
    jurisdiction: str | None = None


class FactExtractionResult(BaseSchema):
    new_facts: dict[str, Any] = Field(default_factory=dict)
    fact_confidence: dict[str, ConfidenceLevel] = Field(default_factory=dict)


class SufficiencyGateResult(BaseSchema):
    local_sufficient: bool = False
    reason: str | None = None
    need_live_fetch: bool = False
    preferred_domains: list[str] = Field(default_factory=list)
    preferred_source_types: list[str] = Field(default_factory=list)


class SupportedFact(BaseSchema):
    fact: str
    source_numbers: list[int] = Field(default_factory=list)


class EvidencePackage(BaseSchema):
    is_in_domain: bool = True
    is_context_sufficient: bool = False
    issue_type: str | None = None
    operation_type: str | None = None
    supported_facts: list[SupportedFact] = Field(default_factory=list)
    unsupported_requests: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)


class PolicyDecision(BaseSchema):
    answer_allowed: bool = True
    escalate: bool = False
    next_action: NextAction = "ask_followup"
    confidence_cap: ConfidenceLevel | None = None
    reasons: list[str] = Field(default_factory=list)


class AnswerPackage(BaseSchema):
    answer_type: Literal[
        "general_guidance",
        "specific_grounded",
        "followup_only",
        "escalation",
    ] = "general_guidance"
    answer: str
    confidence: ConfidenceLevel
    issue_type: str | None = None
    operation_type: str | None = None
    escalate: bool = False
    next_action: NextAction


class LiveSourceChunk(BaseSchema):
    title: str
    authority: str
    url: str
    source_type: str
    jurisdiction: str = "Cth"
    bucket: str | None = None
    sub_type: str | None = None
    section_ref: str | None = None
    heading: str | None = None
    text: str
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class LiveRetrievalResult(BaseSchema):
    used_live_fetch: bool = False
    domains_used: list[str] = Field(default_factory=list)
    fetched_url_count: int = 0
    chunks: list[LiveSourceChunk] = Field(default_factory=list)
    debug: dict[str, Any] = Field(default_factory=dict)
