from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas.common import BaseSchema
from app.schemas.learning import ExperienceOrigin, ProvenanceKind, ReviewOutcome


class AnswerTraceBase(BaseSchema):
    matter_id: str
    session_id: str | None = None
    turn_index: int | None = None
    user_message: str | None = None
    assistant_answer: str | None = None
    response_language: str | None = None
    confidence: str | None = None
    next_action: str | None = None
    escalate: bool = False
    user_display_mode: str | None = None
    issue_type: str | None = None
    visa_type: str | None = None
    operation_type: str | None = None
    conversation_state: str | None = None
    review_status: str = "unreviewed"


class AnswerTraceOut(AnswerTraceBase):
    id: str
    trace_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ReviewConversationItem(BaseSchema):
    matter_id: str
    session_id: str | None = None
    frontend_chat_id: str | None = None
    issue_summary: str | None = None
    issue_type: str | None = None
    visa_type: str | None = None
    risk_level: str | None = None
    first_user_message: str | None = None
    latest_user_message: str | None = None
    latest_assistant_answer_preview: str | None = None
    trace_count: int = 0
    reviewed_trace_count: int = 0
    unreviewed_trace_count: int = 0
    critical_review_count: int = 0
    comment_status: str = "uncommented"
    created_at: datetime | None = None
    last_trace_at: datetime | None = None



class ReviewQueueItem(AnswerTraceBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    review_count: int = 0
    latest_review_rating: str | None = None
    latest_review_severity: str | None = None


class AnswerReviewCreate(BaseSchema):
    reviewer_name: str | None = None
    reviewer_role: str | None = "lawyer"
    rating: str = "unrated"
    severity: str = "medium"
    error_categories: list[str] = Field(default_factory=list)
    lawyer_comment: str | None = None
    corrected_answer: str | None = None
    lesson_candidate: str | None = None
    should_create_eval_case: bool = False
    should_create_lesson: bool = False
    should_create_patch_task: bool = False
    review_status: str = "submitted"
    # Phase 7.2 fields are opt-in. The authenticated Next.js proxy overrides
    # review_provenance after checking LAWYER_REVIEW_TOKEN.
    review_provenance: ProvenanceKind | None = None
    review_outcome: ReviewOutcome | None = None
    review_origin: ExperienceOrigin | None = None
    affected_claim_ids: list[str] = Field(default_factory=list)
    preferred_reasoning_or_research_approach: str | None = None
    add_to_evaluation_bank: bool = False
    create_reasoning_lesson_candidate: bool = False
    expected_claim_ids: list[str] = Field(default_factory=list)
    prohibited_claim_ids: list[str] = Field(default_factory=list)
    expected_evidence_characteristics: dict[str, Any] = Field(default_factory=dict)
    expected_checker_behavior: dict[str, Any] = Field(default_factory=dict)
    prohibited_behaviors: list[str] = Field(default_factory=list)
    max_latency_ms: int | None = Field(default=None, ge=0)
    max_tool_calls: int | None = Field(default=None, ge=0)
    tags: list[str] = Field(default_factory=list)
    phase7_metadata: dict[str, Any] = Field(default_factory=dict)


class AnswerReviewUpdate(BaseSchema):
    reviewer_name: str | None = None
    reviewer_role: str | None = None
    rating: str | None = None
    severity: str | None = None
    error_categories: list[str] | None = None
    lawyer_comment: str | None = None
    corrected_answer: str | None = None
    lesson_candidate: str | None = None
    should_create_eval_case: bool | None = None
    should_create_lesson: bool | None = None
    should_create_patch_task: bool | None = None
    review_status: str | None = None
    review_provenance: ProvenanceKind | None = None
    review_outcome: ReviewOutcome | None = None
    review_origin: ExperienceOrigin | None = None
    affected_claim_ids: list[str] | None = None
    preferred_reasoning_or_research_approach: str | None = None
    add_to_evaluation_bank: bool | None = None
    create_reasoning_lesson_candidate: bool | None = None
    expected_claim_ids: list[str] | None = None
    prohibited_claim_ids: list[str] | None = None
    expected_evidence_characteristics: dict[str, Any] | None = None
    expected_checker_behavior: dict[str, Any] | None = None
    prohibited_behaviors: list[str] | None = None
    max_latency_ms: int | None = Field(default=None, ge=0)
    max_tool_calls: int | None = Field(default=None, ge=0)
    tags: list[str] | None = None
    phase7_metadata: dict[str, Any] | None = None


class AnswerReviewOut(BaseSchema):
    id: str
    answer_trace_id: str
    matter_id: str
    reviewer_name: str | None = None
    reviewer_role: str | None = None
    rating: str
    severity: str
    error_categories: list[str] = Field(default_factory=list)
    lawyer_comment: str | None = None
    corrected_answer: str | None = None
    lesson_candidate: str | None = None
    should_create_eval_case: bool = False
    should_create_lesson: bool = False
    should_create_patch_task: bool = False
    review_status: str = "submitted"
    phase7_provenance: ProvenanceKind | None = None
    phase7_review_outcome: ReviewOutcome | None = None
    phase7_artifacts: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ReviewArtifactOut(BaseSchema):
    id: str
    answer_review_id: str
    artifact_type: str
    artifact_payload: dict[str, Any] = Field(default_factory=dict)
    artifact_status: str = "draft"
    created_at: datetime | None = None
    updated_at: datetime | None = None


class MatterReviewOut(BaseSchema):
    matter_id: str
    matter: dict[str, Any] = Field(default_factory=dict)
    conversation_history: list[dict[str, Any]] = Field(default_factory=list)
    traces: list[AnswerTraceOut] = Field(default_factory=list)
    reviews: list[AnswerReviewOut] = Field(default_factory=list)


class MaterializeLearningRequest(BaseSchema):
    review_provenance: ProvenanceKind | None = None
    review_outcome: ReviewOutcome | None = None
    review_origin: ExperienceOrigin | None = None
    add_to_evaluation_bank: bool = False
    create_reasoning_lesson_candidate: bool = False
    preferred_reasoning_or_research_approach: str | None = None
    affected_claim_ids: list[str] = Field(default_factory=list)
    expected_claim_ids: list[str] = Field(default_factory=list)
    prohibited_claim_ids: list[str] = Field(default_factory=list)
    expected_evidence_characteristics: dict[str, Any] = Field(default_factory=dict)
    expected_checker_behavior: dict[str, Any] = Field(default_factory=dict)
    prohibited_behaviors: list[str] = Field(default_factory=list)
    max_latency_ms: int | None = Field(default=None, ge=0)
    max_tool_calls: int | None = Field(default=None, ge=0)
    tags: list[str] = Field(default_factory=list)
    phase7_metadata: dict[str, Any] = Field(default_factory=dict)


class Phase8LearningBridgeRequest(BaseSchema):
    phase8_request_id: str = Field(min_length=1, max_length=255)
    answer_trace_id: str = Field(min_length=1, max_length=255)
    legal_matter_id: str | None = Field(default=None, max_length=255)
    chatbot_chat_id: str | None = Field(default=None, max_length=255)
    chatbot_assistant_message_id: str | None = Field(default=None, max_length=255)
    acting_staff_role: str = Field(pattern="^(lawyer|admin)$")
    reviewer_id: str = Field(min_length=1, max_length=255)
    outcome: str = Field(pattern="^(confirmed|corrected)$")
    lawyer_comment: str | None = Field(default=None, max_length=8000)
    corrected_answer: str | None = Field(default=None, max_length=12000)
    preferred_reasoning_or_research_approach: str | None = Field(default=None, max_length=8000)
    create_reasoning_lesson_candidate: bool = False


class EvaluationBankCaseOut(BaseSchema):
    artifact_id: str
    artifact_status: str
    eligible_for_default_regression: bool = False
    case: dict[str, Any]
