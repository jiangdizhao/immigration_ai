"""Phase 7 learning contracts.

Only the Experience Archive is implemented in Phase 7.1.  The review,
evaluation, and lesson models below are typed future-facing contracts; they do
not have persistence or runtime consumers yet.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field, BaseModel, model_validator


ExperienceOrigin = Literal["live_interaction", "synthetic_test", "manual_fixture"]
ProvenanceKind = Literal["lawyer_reviewed", "user_feedback", "synthetic_test", "system_generated"]
LessonLifecycle = Literal["candidate", "approved", "shadow", "active", "retired"]


class LearningStrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ExperienceSnapshot(LearningStrictContract):
    """Canonical, JSON-serializable Phase 7.1 experience envelope."""

    schema_version: Literal["phase7.experience.v1"] = "phase7.experience.v1"
    request: dict[str, Any] = Field(default_factory=dict)
    matter: dict[str, Any] = Field(default_factory=dict)
    answer: dict[str, Any] = Field(default_factory=dict)
    research: dict[str, Any] = Field(default_factory=dict)
    evidence: dict[str, Any] = Field(default_factory=dict)
    phase6: dict[str, Any] = Field(default_factory=dict)
    system: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, Any] = Field(default_factory=dict)


class ReviewRecord(LearningStrictContract):
    """Future supervision contract; not a Phase 7.1 persistence model."""

    schema_version: Literal["phase7.review.v1"] = "phase7.review.v1"
    review_id: str = Field(min_length=1, max_length=255)
    experience_record_id: str | None = Field(default=None, max_length=255)
    answer_trace_id: str | None = Field(default=None, max_length=255)
    provenance: ProvenanceKind
    origin: ExperienceOrigin
    review_status: Literal["unreviewed", "in_review", "submitted", "superseded"] = "submitted"
    reviewer_name: str | None = Field(default=None, max_length=255)
    rating: str | None = Field(default=None, max_length=100)
    comment: str | None = None
    corrected_answer: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def synthetic_provenance_is_explicit(self):
        if self.origin == "synthetic_test" and self.provenance == "lawyer_reviewed":
            raise ValueError("synthetic input cannot have lawyer_reviewed provenance")
        return self


class EvaluationCase(LearningStrictContract):
    """Future lawyer-reviewed regression case contract."""

    schema_version: Literal["phase7.evaluation_case.v1"] = "phase7.evaluation_case.v1"
    case_id: str = Field(min_length=1, max_length=255)
    provenance: ProvenanceKind
    origin: ExperienceOrigin
    question: str = Field(min_length=1, max_length=4000)
    expected_answer: str | None = None
    expected_claims: list[dict[str, Any]] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def synthetic_provenance_is_explicit(self):
        if self.origin == "synthetic_test" and self.provenance == "lawyer_reviewed":
            raise ValueError("synthetic input cannot have lawyer_reviewed provenance")
        return self


class ReasoningLessonCandidate(LearningStrictContract):
    """Future candidate lesson contract, never runtime knowledge in 7.1."""

    schema_version: Literal["phase7.reasoning_lesson_candidate.v1"] = "phase7.reasoning_lesson_candidate.v1"
    candidate_id: str = Field(min_length=1, max_length=255)
    provenance: ProvenanceKind
    origin: ExperienceOrigin
    lifecycle: Literal["candidate"] = "candidate"
    lesson_text: str = Field(min_length=1, max_length=8000)
    supporting_experience_ids: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def synthetic_provenance_is_explicit(self):
        if self.origin == "synthetic_test" and self.provenance == "lawyer_reviewed":
            raise ValueError("synthetic input cannot have lawyer_reviewed provenance")
        return self


class ReasoningLesson(LearningStrictContract):
    """Future curated lesson contract; no storage/retrieval is implemented."""

    schema_version: Literal["phase7.reasoning_lesson.v1"] = "phase7.reasoning_lesson.v1"
    lesson_id: str = Field(min_length=1, max_length=255)
    provenance: ProvenanceKind
    origin: ExperienceOrigin
    lifecycle: LessonLifecycle = "candidate"
    lesson_text: str = Field(min_length=1, max_length=8000)
    approved_by: str | None = Field(default=None, max_length=255)
    supporting_experience_ids: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def synthetic_provenance_is_explicit(self):
        if self.origin == "synthetic_test" and self.provenance == "lawyer_reviewed":
            raise ValueError("synthetic input cannot have lawyer_reviewed provenance")
        return self
