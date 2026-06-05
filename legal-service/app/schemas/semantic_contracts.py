from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import BaseSchema


ConfidenceLevel = Literal["low", "medium", "high"]
ResponseLanguage = Literal["en", "zh"]

ConversationAct = Literal[
    "smalltalk",
    "legal_question",
    "fact_update",
    "answer_to_previous_question",
    "accept_previous_offer",
    "draft_request",
    "checklist_request",
    "lawyer_summary_request",
    "timeline_request",
    "booking_request",
    "topic_switch",
    "clarification_request",
    "other",
]

TaskType = Literal[
    "none",
    "draft_user_statement",
    "draft_email_or_message",
    "document_checklist",
    "lawyer_brief",
    "status_action_plan",
    "timeline_plan",
    "booking_handoff",
]

FrameAction = Literal[
    "stay_triage",
    "continue_active_frame",
    "switch_frame",
    "create_new_frame",
    "ask_clarifying_category",
]

FactExplicitness = Literal[
    "explicit",
    "directly_implied",
    "not_stated",
    "contradicted",
]

FactFillStatus = Literal[
    "filled",
    "not_filled",
    "user_unsure",
    "not_applicable",
    "conflicting",
]

TopicRelation = Literal[
    "same_matter",
    "topic_switch",
    "unclear",
]


class SemanticFactValue(BaseSchema):
    """A fact filled from flexible user language.

    If the user did not provide the fact, value must be None and status must be
    not_filled. The model must not convert absence into a negative fact.
    """

    fact_key: str
    value: Any | None = None
    status: FactFillStatus = "not_filled"
    confidence: ConfidenceLevel = "low"
    explicitness: FactExplicitness = "not_stated"

    evidence_text: str | None = None
    evidence_source: Literal[
        "latest_user_turn",
        "conversation_history",
        "structured_intake",
        "pending_offer",
        "system_context",
    ] | None = None

    not_filled_reason: str | None = None


class SemanticTaskIntent(BaseSchema):
    """What the user wants the assistant to do now."""

    task_type: TaskType = "none"
    uses_pending_offer: bool = False
    pending_offer_id: str | None = None

    target_language: ResponseLanguage | None = None
    output_audience: Literal[
        "user",
        "lawyer",
        "home_affairs",
        "school_provider",
        "employer",
        "unknown",
    ] = "user"

    requested_format: Literal[
        "plain_answer",
        "draft_statement",
        "email",
        "checklist",
        "timeline",
        "summary",
        "brief",
        "unknown",
    ] = "unknown"

    task_constraints: dict[str, Any] = Field(default_factory=dict)


class SemanticCaseRouting(BaseSchema):
    """Proposed legal frame and operation.

    The LLM proposes these values. Backend validators must still check frame ids,
    allowed facts, topic switches, and high-risk positive evidence.
    """

    frame_action: FrameAction = "ask_clarifying_category"
    proposed_case_frame_id: str | None = None

    issue_type: str | None = None
    visa_type: str | None = None
    operation_type: str | None = None

    user_goal: str | None = None
    topic_relation: TopicRelation = "unclear"

    confidence: ConfidenceLevel = "low"
    rationale: str | None = None


class SemanticRiskSignals(BaseSchema):
    """Positive risk signals only.

    Each true signal should be supported by user text, history, or structured
    intake evidence. Missing information should not become a positive signal.
    """

    deadline_sensitive: bool = False
    possible_unlawful_status: bool = False
    visa_expiry_or_status_problem: bool = False
    refusal_or_review: bool = False
    cancellation_or_noicc: bool = False
    detention_related: bool = False
    character_related: bool = False
    pic4020_or_integrity: bool = False
    health_or_public_interest: bool = False
    family_or_minor_welfare: bool = False
    requires_lawyer_handoff: bool = False

    evidence: dict[str, str] = Field(default_factory=dict)


class CurrentPolicyNeed(BaseSchema):
    """Structured current-policy need.

    This is intended to replace phrase-based live-trigger matching.
    """

    requires_current_policy_check: bool = False
    policy_area: str | None = None
    source_classes_required: list[str] = Field(default_factory=list)
    preferred_domains: list[str] = Field(default_factory=list)
    reason: str | None = None


class PendingOfferDirective(BaseSchema):
    """Whether to create, use, clear, or leave a pending service offer."""

    action: Literal["none", "create", "use_existing", "clear"] = "none"
    offer_type: TaskType = "none"
    label: str | None = None
    offer_id: str | None = None
    reason: str | None = None


class SemanticTurnAnalysis(BaseSchema):
    """Authoritative semantic form filled by the backend LLM.

    This replaces semantic regex/keyword authority. Deterministic backend code
    should validate this object but should not re-infer flexible user meaning
    from raw language.
    """

    response_language: ResponseLanguage = "en"

    conversation_act: ConversationAct = "legal_question"
    task_intent: SemanticTaskIntent = Field(default_factory=SemanticTaskIntent)
    case_routing: SemanticCaseRouting = Field(default_factory=SemanticCaseRouting)

    extracted_facts: list[SemanticFactValue] = Field(default_factory=list)

    risk_signals: SemanticRiskSignals = Field(default_factory=SemanticRiskSignals)
    current_policy_need: CurrentPolicyNeed = Field(default_factory=CurrentPolicyNeed)
    pending_offer: PendingOfferDirective = Field(default_factory=PendingOfferDirective)

    should_contextualize_with_history: bool = True
    should_retrieve_legal_sources: bool = True
    should_handle_as_task: bool = False

    confidence: ConfidenceLevel = "low"
    rationale: str | None = None

    safety_notes: list[str] = Field(default_factory=list)
    raw_model_output: dict[str, Any] = Field(default_factory=dict)


DecisionConfidence = ConfidenceLevel

UrgencyLevel = Literal[
    "low",
    "medium",
    "high",
    "urgent",
]

CriterionStatus = Literal[
    "satisfied",
    "not_satisfied",
    "unknown",
    "not_applicable",
    "needs_user_fact",
    "needs_evidence",
    "needs_current_policy_check",
]

EvidenceSufficiency = Literal[
    "none",
    "weak",
    "partial",
    "sufficient",
    "current_official_sufficient",
]

LegalAnswerMode = Literal[
    "direct_answer",
    "qualified_general",
    "answer_with_warning",
    "answer_then_ask",
    "ask_followup",
    "task_fulfillment",
    "lawyer_handoff",
    "booking_handoff",
    "cannot_answer_safely",
]

NextBestAction = Literal[
    "answer",
    "ask_one_fact",
    "prepare_task_output",
    "suggest_consultation",
    "book_consultation",
    "retrieve_current_policy",
    "do_not_continue_without_lawyer",
]


class KnownFact(BaseSchema):
    fact_key: str
    value: Any
    confidence: DecisionConfidence = "medium"
    source: Literal[
        "user",
        "conversation_history",
        "structured_intake",
        "system_inferred",
        "llm_extracted",
    ] = "user"
    evidence_text: str | None = None


class MissingFact(BaseSchema):
    fact_key: str
    label: str | None = None
    why_needed: str | None = None
    blocking: bool = False
    ask_priority: int = 50
    user_question: str | None = None


class LegalCriterionAssessment(BaseSchema):
    criterion_id: str
    label: str
    layer: Literal[
        "schedule1_validity",
        "schedule2_grant",
        "current_policy_overlay",
        "cross_subclass_dependency",
        "procedure",
        "general_guidance",
    ]

    status: CriterionStatus = "unknown"

    known_facts_used: list[str] = Field(default_factory=list)
    missing_facts: list[str] = Field(default_factory=list)

    required_source_classes: list[str] = Field(default_factory=list)
    evidence_chunk_ids: list[str] = Field(default_factory=list)
    evidence_titles: list[str] = Field(default_factory=list)

    can_explain_to_user: bool = True
    customer_ask_priority: int = 50

    reasoning_note: str | None = None


class EvidenceCoverage(BaseSchema):
    evidence_sufficiency: EvidenceSufficiency = "none"

    source_classes_required: list[str] = Field(default_factory=list)
    source_classes_present: list[str] = Field(default_factory=list)
    source_classes_missing: list[str] = Field(default_factory=list)

    local_retrieval_used: bool = False
    live_retrieval_used: bool = False
    current_official_source_used: bool = False

    citation_ids: list[str] = Field(default_factory=list)
    citation_titles: list[str] = Field(default_factory=list)

    evidence_gaps: list[str] = Field(default_factory=list)


class LegalPosition(BaseSchema):
    provisional_conclusion: str | None = None

    can_say: list[str] = Field(default_factory=list)
    cannot_say: list[str] = Field(default_factory=list)

    uncertainty_reasons: list[str] = Field(default_factory=list)
    required_caveats: list[str] = Field(default_factory=list)

    forbidden_overclaims: list[str] = Field(default_factory=list)


class RiskAssessment(BaseSchema):
    urgency: UrgencyLevel = "medium"

    risk_band: Literal[
        "low",
        "medium",
        "high",
        "critical",
        "unknown",
    ] = "unknown"

    deadline_sensitive: bool = False
    status_sensitive: bool = False
    cancellation_sensitive: bool = False
    review_sensitive: bool = False
    current_policy_sensitive: bool = False

    should_escalate_to_lawyer: bool = False
    escalation_reason: str | None = None

    user_safe_warning: str | None = None


class ActionRecommendation(BaseSchema):
    next_best_action: NextBestAction = "answer"

    today_actions: list[str] = Field(default_factory=list)
    document_preparation: list[str] = Field(default_factory=list)

    one_next_question: str | None = None
    one_next_fact_key: str | None = None

    pending_offer_to_create: dict[str, Any] | None = None


class LegalDecisionObject(BaseSchema):
    matter_id: str | None = None

    case_frame_id: str | None = None
    issue_type: str | None = None
    visa_type: str | None = None
    operation_type: str | None = None

    answer_mode: LegalAnswerMode = "qualified_general"
    confidence: DecisionConfidence = "low"

    known_facts: list[KnownFact] = Field(default_factory=list)
    missing_facts: list[MissingFact] = Field(default_factory=list)

    criterion_assessments: list[LegalCriterionAssessment] = Field(default_factory=list)
    evidence_coverage: EvidenceCoverage = Field(default_factory=EvidenceCoverage)

    legal_position: LegalPosition = Field(default_factory=LegalPosition)
    risk_assessment: RiskAssessment = Field(default_factory=RiskAssessment)
    action_recommendation: ActionRecommendation = Field(default_factory=ActionRecommendation)

    public_answer_constraints: list[str] = Field(default_factory=list)
    internal_debug_notes: list[str] = Field(default_factory=list)

    validated: bool = False
    validation_errors: list[str] = Field(default_factory=list)


CommunicationStrategy = Literal[
    "direct_consultant_answer",
    "urgent_status_triage",
    "answer_then_one_question",
    "task_fulfillment",
    "lawyer_handoff",
    "booking_handoff",
    "careful_explainer",
    "cannot_answer_safely",
]

Tone = Literal[
    "professional_friendly",
    "urgent_but_calm",
    "supportive",
    "direct",
    "careful_formal",
]

SourcePresentation = Literal[
    "none",
    "compact_sources",
    "short_citations",
    "full_debug_only",
]

QuestionPolicy = Literal[
    "ask_none",
    "ask_one_optional_question",
    "ask_one_required_question",
]


class CommunicationContentPlan(BaseSchema):
    must_include_points: list[str] = Field(default_factory=list)
    should_include_points: list[str] = Field(default_factory=list)
    must_not_include_points: list[str] = Field(default_factory=list)

    known_fact_commitments: list[str] = Field(default_factory=list)
    caveats_to_include: list[str] = Field(default_factory=list)

    practical_actions: list[str] = Field(default_factory=list)
    documents_to_prepare: list[str] = Field(default_factory=list)

    optional_next_question: str | None = None
    optional_next_question_reason: str | None = None


class CommunicationStyleRules(BaseSchema):
    tone: Tone = "professional_friendly"

    answer_first: bool = True
    be_direct: bool = True
    be_friendly: bool = True
    avoid_canned_structure: bool = True

    do_not_reask_known_facts: bool = True
    do_not_invent_percentages: bool = True
    do_not_guarantee_outcome: bool = True
    do_not_mention_internal_systems: bool = True
    do_not_overstate_law: bool = True

    vary_wording_naturally: bool = True

    max_next_questions: int = 1


class TaskOutputPlan(BaseSchema):
    task_type: TaskType = "none"

    output_format: Literal[
        "plain_answer",
        "draft",
        "checklist",
        "timeline",
        "summary",
        "brief",
    ] = "plain_answer"

    complete_task_first: bool = False
    editable_by_user: bool = True

    audience: Literal[
        "user",
        "lawyer",
        "home_affairs",
        "school_provider",
        "employer",
        "unknown",
    ] = "user"


class CallToActionPlan(BaseSchema):
    show_booking_cta: bool = False
    booking_reason: str | None = None

    soft_cta_text: str | None = None
    urgent_cta_text: str | None = None

    offer_next_service: bool = False
    offered_service_type: str | None = None
    offered_service_label: str | None = None


class CommunicationPlan(BaseSchema):
    response_language: ResponseLanguage = "en"

    strategy: CommunicationStrategy = "direct_consultant_answer"
    source_presentation: SourcePresentation = "compact_sources"
    question_policy: QuestionPolicy = "ask_one_optional_question"

    content: CommunicationContentPlan = Field(default_factory=CommunicationContentPlan)
    style_rules: CommunicationStyleRules = Field(default_factory=CommunicationStyleRules)
    task_output: TaskOutputPlan = Field(default_factory=TaskOutputPlan)
    call_to_action: CallToActionPlan = Field(default_factory=CallToActionPlan)

    final_answer_generation_prompt: str | None = None

    safety_check_required: bool = True
    public_answer_guard_required: bool = True
