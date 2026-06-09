from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas.common import BaseSchema


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
