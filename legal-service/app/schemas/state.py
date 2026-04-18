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

ClassificationStage = Literal["provisional", "refining", "stable"]

FactSlotStatus = Literal[
    "missing",
    "known",
    "user_unsure",
    "document_unavailable",
    "not_applicable",
    "conflicting",
]

FactValueSource = Literal[
    "user_input",
    "carried_context",
    "llm_extraction",
    "system_inferred",
    "unknown",
]

FactInputType = Literal[
    "boolean",
    "single_select",
    "date",
    "short_text",
    "long_text",
    "document",
]

InteractionMode = Literal[
    "guided_intake",
    "analysis_ready",
    "answer",
    "escalation",
]

# keep compatibility with the earlier answerability patch
AnswerMode = Literal[
    "direct_answer",
    "qualified_general",
    "ask_followup",
    "live_fetch_then_retry",
    "answer_with_warning",
    "escalate",
]


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


class CaseCandidate(BaseSchema):
    operation_type: str
    score: float = Field(default=0.0, ge=0.0, le=1.0)
    why_it_fits: str | None = None
    missing_decisive_facts: list[str] = Field(default_factory=list)


class CaseHypothesis(BaseSchema):
    issue_type: str | None = None
    visa_type: str | None = None
    primary_operation_type: str | None = None
    confidence_label: ConfidenceLevel = "low"
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)
    stage: ClassificationStage = "provisional"
    needs_refinement: bool = True
    candidates: list[CaseCandidate] = Field(default_factory=list)
    decisive_next_facts: list[str] = Field(default_factory=list)
    summary: str | None = None


class FactSlotState(BaseSchema):
    fact_key: str
    label: str
    status: FactSlotStatus = "missing"
    value: Any | None = None
    value_display: str | None = None
    source: FactValueSource | None = None
    confidence: ConfidenceLevel | None = None
    required: bool = False
    blocking: bool = False
    required_for_operations: list[str] = Field(default_factory=list)
    why_needed: str | None = None
    question_priority: int | None = None


class InteractionFactRequest(BaseSchema):
    fact_key: str
    label: str
    prompt: str
    input_type: FactInputType = "short_text"
    options: list[str] = Field(default_factory=list)
    required: bool = True
    blocking: bool = False
    why_needed: str | None = None


class InteractionProgress(BaseSchema):
    collected_required: int = 0
    total_required: int = 0


class InteractionPlan(BaseSchema):
    mode: InteractionMode = "guided_intake"
    answer_mode: AnswerMode = "ask_followup"
    conversation_state: ConversationState = "NEW"
    next_action: NextAction = "ask_followup"
    primary_prompt: str = "Please provide a little more information so I can guide you properly."
    requested_facts: list[InteractionFactRequest] = Field(default_factory=list)
    missing_required_facts: list[str] = Field(default_factory=list)
    missing_blocking_facts: list[str] = Field(default_factory=list)
    known_facts_summary: dict[str, Any] = Field(default_factory=dict)
    progress: InteractionProgress = Field(default_factory=InteractionProgress)
    warnings: list[str] = Field(default_factory=list)
    can_answer_with_partial_information: bool = True


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
    case_hypothesis: CaseHypothesis = Field(default_factory=CaseHypothesis)
    fact_slot_states: list[FactSlotState] = Field(default_factory=list)
    interaction_plan: InteractionPlan = Field(default_factory=InteractionPlan)


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


# ---- compatibility layer for the earlier operation-answerability patch ----
class AnswerabilityAssessment(BaseSchema):
    profile_name: str | None = None
    operation_contract_satisfied: bool = False
    answer_mode: AnswerMode = "ask_followup"
    allowed_answer_modes: list[AnswerMode] = Field(default_factory=list)
    fact_coverage: dict[str, bool] = Field(default_factory=dict)
    source_coverage: dict[str, bool] = Field(default_factory=dict)
    source_classes_present: list[str] = Field(default_factory=list)
    required_facts_missing: list[str] = Field(default_factory=list)
    required_source_classes_missing: list[str] = Field(default_factory=list)
    freshness_required: bool = False
# -------------------------------------------------------------------------


class SufficiencyGateResult(BaseSchema):
    local_sufficient: bool = False
    reason: str | None = None
    need_live_fetch: bool = False
    preferred_domains: list[str] = Field(default_factory=list)
    preferred_source_types: list[str] = Field(default_factory=list)
    # compatibility field used by earlier policy/query code
    answerability: AnswerabilityAssessment = Field(default_factory=AnswerabilityAssessment)


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
    # compatibility fields used by earlier answerability/query code
    answer_mode: AnswerMode = "ask_followup"
    coverage_summary: dict[str, Any] = Field(default_factory=dict)


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