"""Strict Phase 7 learning control-plane contracts.

These contracts are used only by authenticated review/admin and offline
evaluation code. They are never evidence, prompt context, or serving state.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


ExperienceOrigin = Literal["live_interaction", "synthetic_test", "manual_fixture"]
ProvenanceKind = Literal["lawyer_reviewed", "user_feedback", "synthetic_test", "system_generated"]
LessonLifecycle = Literal["candidate", "approved", "shadow", "active", "retired"]
ReviewOutcome = Literal["correct", "minor_issue", "material_issue", "unclassified"]
ReviewStatus = Literal["unreviewed", "in_review", "submitted", "superseded"]
ArtifactStatus = Literal["draft", "active", "superseded", "failed"]
ReplayResult = Literal["PASS", "FAIL", "NOT_SCORED"]


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
    """Canonical typed supervision record stored inside ReviewArtifact."""

    schema_version: Literal["phase7.review.v1"] = "phase7.review.v1"
    artifact_type: Literal["phase7_review_record"] = "phase7_review_record"
    review_id: str = Field(min_length=1, max_length=255)
    source_review_id: str | None = Field(default=None, max_length=255)
    source_answer_trace_id: str | None = Field(default=None, max_length=255)
    experience_record_id: str | None = Field(default=None, max_length=255)
    answer_trace_id: str | None = Field(default=None, max_length=255)
    source_experience_record_id: str | None = Field(default=None, max_length=255)
    source_experience_snapshot_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    provenance: ProvenanceKind = "system_generated"
    origin: ExperienceOrigin = "live_interaction"
    review_outcome: ReviewOutcome = "unclassified"
    review_status: ReviewStatus = "submitted"
    reviewer_name: str | None = Field(default=None, max_length=255)
    reviewer_role: str | None = Field(default=None, max_length=100)
    rating: str | None = Field(default=None, max_length=100)
    severity: str | None = Field(default=None, max_length=50)
    issue_categories: list[str] = Field(default_factory=list, max_length=50)
    affected_claim_ids: list[str] = Field(default_factory=list, max_length=100)
    lawyer_comment: str | None = None
    comment: str | None = None
    corrected_answer: str | None = None
    preferred_reasoning_or_research_approach: str | None = None
    system_version_reviewed: str | None = Field(default=None, max_length=255)
    canonical_payload_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    artifact_version: int = Field(default=1, ge=1)
    artifact_created_at: str | None = None
    supersedes_artifact_id: str | None = Field(default=None, max_length=255)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_provenance(self):
        if self.origin in {"synthetic_test", "manual_fixture"} and self.provenance == "lawyer_reviewed":
            raise ValueError("synthetic/manual input cannot have lawyer_reviewed provenance")
        return self


class EvaluationCase(LearningStrictContract):
    """Typed deterministic/offline regression case, never legal authority."""

    schema_version: Literal["phase7.evaluation_case.v1"] = "phase7.evaluation_case.v1"
    artifact_type: Literal["phase7_evaluation_case"] = "phase7_evaluation_case"
    case_id: str = Field(min_length=1, max_length=255)
    source_experience_id: str | None = Field(default=None, max_length=255)
    source_experience_record_id: str | None = Field(default=None, max_length=255)
    source_experience_snapshot_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    source_review_id: str | None = Field(default=None, max_length=255)
    source_answer_trace_id: str | None = Field(default=None, max_length=255)
    provenance: ProvenanceKind = "system_generated"
    origin: ExperienceOrigin = "live_interaction"
    review_outcome: ReviewOutcome = "unclassified"
    question: str = Field(min_length=1, max_length=4000)
    relevant_matter_state: dict[str, Any] = Field(default_factory=dict)
    source_customer_answer: str = ""
    reference_answer: str | None = None
    # Compatibility aliases for the original future-only contract. New
    # artifacts use source_customer_answer and source_material_claims.
    expected_answer: str | None = None
    expected_claims: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    source_material_claims: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    source_claim_dependencies: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    affected_claim_ids: list[str] = Field(default_factory=list, max_length=100)
    issue_categories: list[str] = Field(default_factory=list, max_length=50)
    expected_evidence_characteristics: dict[str, Any] = Field(default_factory=dict)
    expected_checker_behavior: dict[str, Any] = Field(default_factory=dict)
    prohibited_behaviors: list[str] = Field(default_factory=list, max_length=50)
    expected_claim_ids: list[str] = Field(default_factory=list, max_length=100)
    prohibited_claim_ids: list[str] = Field(default_factory=list, max_length=100)
    max_latency_ms: int | None = Field(default=None, ge=0)
    max_tool_calls: int | None = Field(default=None, ge=0)
    tags: list[str] = Field(default_factory=list, max_length=50)
    system_version_reviewed: str | None = Field(default=None, max_length=255)
    source_integrity: Literal["experience_record", "legacy_trace_only", "invalid_snapshot_hash"] = "legacy_trace_only"
    canonical_payload_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    artifact_version: int = Field(default=1, ge=1)
    artifact_created_at: str | None = None
    supersedes_artifact_id: str | None = Field(default=None, max_length=255)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_provenance(self):
        if self.origin in {"synthetic_test", "manual_fixture"} and self.provenance == "lawyer_reviewed":
            raise ValueError("synthetic/manual input cannot have lawyer_reviewed provenance")
        return self


class ReasoningLessonCandidate(LearningStrictContract):
    """Exact lawyer-supplied strategy candidate; never runtime knowledge."""

    schema_version: Literal["phase7.reasoning_lesson_candidate.v1"] = "phase7.reasoning_lesson_candidate.v1"
    artifact_type: Literal["phase7_reasoning_lesson_candidate"] = "phase7_reasoning_lesson_candidate"
    candidate_id: str = Field(min_length=1, max_length=255)
    source_review_id: str | None = Field(default=None, max_length=255)
    source_answer_trace_id: str | None = Field(default=None, max_length=255)
    source_experience_record_id: str | None = Field(default=None, max_length=255)
    source_experience_snapshot_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    provenance: ProvenanceKind = "system_generated"
    origin: ExperienceOrigin = "live_interaction"
    lifecycle: Literal["candidate"] = "candidate"
    lesson_text: str = Field(min_length=1, max_length=8000)
    supporting_experience_ids: list[str] = Field(default_factory=list, max_length=100)
    affected_claim_ids: list[str] = Field(default_factory=list, max_length=100)
    issue_categories: list[str] = Field(default_factory=list, max_length=50)
    scope_applicability: dict[str, Any] = Field(default_factory=dict)
    system_version_reviewed: str | None = Field(default=None, max_length=255)
    canonical_payload_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    artifact_version: int = Field(default=1, ge=1)
    artifact_created_at: str | None = None
    supersedes_artifact_id: str | None = Field(default=None, max_length=255)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_provenance(self):
        if self.origin in {"synthetic_test", "manual_fixture"} and self.provenance == "lawyer_reviewed":
            raise ValueError("synthetic/manual input cannot have lawyer_reviewed provenance")
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
        if self.origin in {"synthetic_test", "manual_fixture"} and self.provenance == "lawyer_reviewed":
            raise ValueError("synthetic/manual input cannot have lawyer_reviewed provenance")
        return self


class CandidateRunObservation(LearningStrictContract):
    """Machine-observable replay input; it contains no model invocation hook."""

    claim_ids: list[str] = Field(default_factory=list, max_length=100)
    prohibited_claim_ids: list[str] = Field(default_factory=list, max_length=100)
    checker_outcome: str | None = Field(default=None, max_length=50)
    prohibited_behavior_flags: list[str] = Field(default_factory=list, max_length=100)
    latency_ms: int | None = Field(default=None, ge=0)
    tool_call_count: int | None = Field(default=None, ge=0)
    evidence_characteristics: dict[str, Any] = Field(default_factory=dict)
    architecture_invariant_violations: list[str] = Field(default_factory=list, max_length=100)


class ReplayMetricResult(LearningStrictContract):
    metric: str = Field(min_length=1, max_length=100)
    result: ReplayResult
    detail: str | None = None


class ReplayReport(LearningStrictContract):
    case_id: str
    provenance: ProvenanceKind
    origin: ExperienceOrigin
    source_system_version: str | None = None
    candidate_system_version: str | None = None
    per_metric_results: list[ReplayMetricResult] = Field(default_factory=list)
    overall_result: ReplayResult
    not_scored_reasons: list[str] = Field(default_factory=list)
