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
RuleBankNamespace = Literal["real", "simulation"]
RuleProposalOrigin = Literal["manual", "compiler_generated", "synthetic_simulation"]
RuleType = Literal[
    "research_strategy",
    "evidence_strategy",
    "fact_elicitation",
    "reasoning_strategy",
    "failure_avoidance",
]
RuleGovernanceState = Literal["normal", "conflicted", "quarantined"]
RuleValidationState = Literal["unvalidated", "validation_pending", "validated", "failed"]
RuleDecisionAction = Literal[
    "approve_new",
    "merge_support",
    "revise_existing",
    "mark_conflict",
    "reject",
]
ReviewOutcome = Literal["correct", "minor_issue", "material_issue", "unclassified"]
ReviewStatus = Literal["unreviewed", "in_review", "submitted", "superseded"]
ArtifactStatus = Literal["draft", "active", "superseded", "failed"]
ReplayResult = Literal["PASS", "FAIL", "NOT_SCORED"]


class LearningStrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class RuleCompilerMetadata(LearningStrictContract):
    """Small compiler envelope; never a case or model-output archive."""

    compiler_kind: Literal["offline_rule_compiler"]
    compiler_version: str = Field(pattern=r"^[A-Za-z0-9_.:-]{1,64}$")
    prompt_template_version: str = Field(pattern=r"^[A-Za-z0-9_.:-]{1,64}$")
    formation_mode: Literal["manual_offline", "synthetic_offline"]
    generated_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}T")


class ReasoningRuleMetadata(LearningStrictContract):
    """Bounded operational metadata for a canonical rule."""

    transfer_validation: Literal["deferred_to_phase7_3b"] = "deferred_to_phase7_3b"
    governance_reason_code: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_.-]{0,63}$")


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
    source_experience_snapshot_sha256: str | None = Field(
        default=None, min_length=64, max_length=64
    )
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
        if (
            self.origin in {"synthetic_test", "manual_fixture"}
            and self.provenance == "lawyer_reviewed"
        ):
            raise ValueError("synthetic/manual input cannot have lawyer_reviewed provenance")
        return self


class EvaluationCase(LearningStrictContract):
    """Typed deterministic/offline regression case, never legal authority."""

    schema_version: Literal["phase7.evaluation_case.v1"] = "phase7.evaluation_case.v1"
    artifact_type: Literal["phase7_evaluation_case"] = "phase7_evaluation_case"
    case_id: str = Field(min_length=1, max_length=255)
    source_experience_id: str | None = Field(default=None, max_length=255)
    source_experience_record_id: str | None = Field(default=None, max_length=255)
    source_experience_snapshot_sha256: str | None = Field(
        default=None, min_length=64, max_length=64
    )
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
    source_integrity: Literal["experience_record", "legacy_trace_only", "invalid_snapshot_hash"] = (
        "legacy_trace_only"
    )
    canonical_payload_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    artifact_version: int = Field(default=1, ge=1)
    artifact_created_at: str | None = None
    supersedes_artifact_id: str | None = Field(default=None, max_length=255)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_provenance(self):
        if (
            self.origin in {"synthetic_test", "manual_fixture"}
            and self.provenance == "lawyer_reviewed"
        ):
            raise ValueError("synthetic/manual input cannot have lawyer_reviewed provenance")
        return self


class ReasoningLessonCandidate(LearningStrictContract):
    """Exact lawyer-supplied strategy candidate; never runtime knowledge."""

    schema_version: Literal["phase7.reasoning_lesson_candidate.v1"] = (
        "phase7.reasoning_lesson_candidate.v1"
    )
    artifact_type: Literal["phase7_reasoning_lesson_candidate"] = (
        "phase7_reasoning_lesson_candidate"
    )
    candidate_id: str = Field(min_length=1, max_length=255)
    source_review_id: str | None = Field(default=None, max_length=255)
    source_answer_trace_id: str | None = Field(default=None, max_length=255)
    source_experience_record_id: str | None = Field(default=None, max_length=255)
    source_experience_snapshot_sha256: str | None = Field(
        default=None, min_length=64, max_length=64
    )
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
        if (
            self.origin in {"synthetic_test", "manual_fixture"}
            and self.provenance == "lawyer_reviewed"
        ):
            raise ValueError("synthetic/manual input cannot have lawyer_reviewed provenance")
        return self


def _canonical_lesson_text(
    trigger_conditions: list[str],
    applicability_conditions: list[str],
    action_steps: list[str],
    verification_steps: list[str],
    prohibited_behaviors: list[str],
    exceptions_or_limits: list[str],
) -> str:
    def section(label: str, values: list[str]) -> str:
        return f"{label}:\n" + "\n".join(f"- {value.strip()}" for value in values)

    return "\n\n".join(
        [
            section("WHEN", trigger_conditions),
            section("APPLY IF", applicability_conditions),
            section("DO", action_steps),
            section("VERIFY", verification_steps),
            section("AVOID", prohibited_behaviors),
            section("LIMITS", exceptions_or_limits),
        ]
    )


class ReasoningLesson(LearningStrictContract):
    """Canonical structured rule; it is a control-plane artifact, not serving memory."""

    schema_version: Literal["phase7.reasoning_lesson.v1"] = "phase7.reasoning_lesson.v1"
    artifact_type: Literal["phase7_reasoning_lesson"] = "phase7_reasoning_lesson"
    lesson_id: str = Field(min_length=1, max_length=255)
    rule_key: str = Field(min_length=1, max_length=255)
    rule_version: int = Field(default=1, ge=1)
    bank_namespace: RuleBankNamespace
    provenance: ProvenanceKind
    origin: ExperienceOrigin
    lifecycle: LessonLifecycle
    governance_state: RuleGovernanceState = "normal"
    validation_state: RuleValidationState = "unvalidated"
    rule_type: RuleType
    title: str = Field(min_length=1, max_length=180)
    trigger_conditions: list[str] = Field(min_length=1, max_length=8)
    applicability_conditions: list[str] = Field(min_length=1, max_length=8)
    action_steps: list[str] = Field(min_length=1, max_length=8)
    verification_steps: list[str] = Field(min_length=1, max_length=8)
    prohibited_behaviors: list[str] = Field(min_length=1, max_length=8)
    exceptions_or_limits: list[str] = Field(min_length=1, max_length=8)
    lesson_text: str = Field(min_length=1, max_length=2000)
    source_proposal_id: str = Field(min_length=1, max_length=255)
    source_candidate_ids: list[str] = Field(min_length=1, max_length=100)
    supporting_review_ids: list[str] = Field(default_factory=list, max_length=100)
    supporting_experience_ids: list[str] = Field(default_factory=list, max_length=100)
    supporting_evaluation_case_ids: list[str] = Field(default_factory=list, max_length=100)
    negative_control_case_ids: list[str] = Field(default_factory=list, max_length=100)
    approved_by: str | None = Field(default=None, max_length=255)
    approval_mode: Literal["trusted_lawyer", "simulation_offline"] | None = None
    approved_at: str | None = None
    system_version_approved: str | None = Field(default=None, max_length=255)
    conflict_group_id: str | None = Field(default=None, max_length=255)
    canonical_payload_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    artifact_version: int = Field(default=1, ge=1)
    artifact_created_at: str | None = None
    supersedes_artifact_id: str | None = Field(default=None, max_length=255)
    metadata: ReasoningRuleMetadata = Field(default_factory=ReasoningRuleMetadata)

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_synthetic_lawyer_claim(cls, value):
        if (
            isinstance(value, dict)
            and value.get("origin") in {"synthetic_test", "manual_fixture"}
            and value.get("provenance") == "lawyer_reviewed"
        ):
            raise ValueError("synthetic/manual input cannot have lawyer_reviewed provenance")
        return value

    @model_validator(mode="after")
    def validate_rule_boundaries(self):
        if self.lifecycle in {"shadow", "active"}:
            raise ValueError("Phase 7.3A cannot create shadow or active rules")
        if (
            self.origin in {"synthetic_test", "manual_fixture"}
            and self.provenance == "lawyer_reviewed"
        ):
            raise ValueError("synthetic/manual input cannot have lawyer_reviewed provenance")
        if self.bank_namespace == "real":
            if self.provenance != "lawyer_reviewed" or self.origin != "live_interaction":
                raise ValueError("real rules require live lawyer-reviewed provenance")
            if self.approval_mode != "trusted_lawyer":
                raise ValueError("real rules require trusted lawyer approval")
        elif self.provenance != "synthetic_test" or self.origin not in {
            "synthetic_test",
            "manual_fixture",
        }:
            raise ValueError("simulation rules require synthetic provenance")
        for field_name in (
            "trigger_conditions",
            "applicability_conditions",
            "action_steps",
            "verification_steps",
            "prohibited_behaviors",
            "exceptions_or_limits",
        ):
            if any(len(item) > 400 for item in getattr(self, field_name)):
                raise ValueError(f"{field_name} items must be at most 400 characters")
        if all(
            (
                self.trigger_conditions,
                self.applicability_conditions,
                self.action_steps,
                self.verification_steps,
                self.prohibited_behaviors,
                self.exceptions_or_limits,
            )
        ) and self.lesson_text != _canonical_lesson_text(
            self.trigger_conditions,
            self.applicability_conditions,
            self.action_steps,
            self.verification_steps,
            self.prohibited_behaviors,
            self.exceptions_or_limits,
        ):
            raise ValueError(
                "lesson_text must be the canonical rendering of structured rule fields"
            )
        if len(self.model_dump_json().encode("utf-8")) > 24000:
            raise ValueError("canonical rule exceeds the 24KB operational size limit")
        return self


class RuleCompilerCandidateSummary(LearningStrictContract):
    candidate_id: str = Field(min_length=1, max_length=255)
    provenance: ProvenanceKind
    origin: ExperienceOrigin
    lesson_text: str = Field(min_length=1, max_length=2000)
    issue_categories: list[str] = Field(default_factory=list, max_length=20)
    scope_applicability: dict[str, str | int | bool] = Field(default_factory=dict)


class RuleCompilerCaseSummary(LearningStrictContract):
    case_id: str = Field(min_length=1, max_length=255)
    provenance: ProvenanceKind
    origin: ExperienceOrigin
    review_outcome: ReviewOutcome = "unclassified"
    issue_categories: list[str] = Field(default_factory=list, max_length=20)
    expected_checker_behavior: dict[str, str | int | bool] = Field(default_factory=dict)


class RuleCompilerPacket(LearningStrictContract):
    """Allowlisted compiler input. It deliberately has no evidence text."""

    schema_version: Literal["phase7.rule_compiler_packet.v1"] = "phase7.rule_compiler_packet.v1"
    artifact_type: Literal["phase7_rule_compiler_packet"] = "phase7_rule_compiler_packet"
    packet_id: str = Field(min_length=1, max_length=255)
    bank_namespace: RuleBankNamespace
    candidates: list[RuleCompilerCandidateSummary] = Field(default_factory=list, max_length=100)
    issue_categories: list[str] = Field(default_factory=list, max_length=50)
    affected_claim_ids: list[str] = Field(default_factory=list, max_length=100)
    scope_applicability: dict[str, str | int | bool | list[str]] = Field(default_factory=dict)
    source_review_outcomes: list[ReviewOutcome] = Field(default_factory=list, max_length=100)
    evaluation_cases: list[RuleCompilerCaseSummary] = Field(default_factory=list, max_length=20)
    contrast_cases: list[RuleCompilerCaseSummary] = Field(default_factory=list, max_length=20)
    negative_controls: list[RuleCompilerCaseSummary] = Field(default_factory=list, max_length=20)


class RuleCompilerProposalDraft(LearningStrictContract):
    """Compiler semantic output. Authority and lineage are server-derived."""

    rule_type: RuleType
    title: str = Field(min_length=1, max_length=180)
    trigger_conditions: list[str] = Field(min_length=1, max_length=8)
    applicability_conditions: list[str] = Field(min_length=1, max_length=8)
    action_steps: list[str] = Field(min_length=1, max_length=8)
    verification_steps: list[str] = Field(min_length=1, max_length=8)
    prohibited_behaviors: list[str] = Field(min_length=1, max_length=8)
    exceptions_or_limits: list[str] = Field(min_length=1, max_length=8)
    transfer_targets: list[str] = Field(default_factory=list, max_length=20)
    supporting_evaluation_case_ids: list[str] = Field(default_factory=list, max_length=100)
    negative_control_case_ids: list[str] = Field(default_factory=list, max_length=100)
    case_erasure_confirmation: bool = False
    procedural_only_confirmation: bool = False
    source_specific_residue: list[str] = Field(default_factory=list, max_length=20)
    legal_proposition_residue: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def validate_size(self):
        for field_name in (
            "trigger_conditions",
            "applicability_conditions",
            "action_steps",
            "verification_steps",
            "prohibited_behaviors",
            "exceptions_or_limits",
        ):
            if any(len(item) > 400 for item in getattr(self, field_name)):
                raise ValueError(f"{field_name} items must be at most 400 characters")
        if len(self.model_dump_json().encode("utf-8")) > 16000:
            raise ValueError("compiler proposal draft exceeds the 16KB operational size limit")
        return self


class RuleCompilerOutput(LearningStrictContract):
    """Strict externally supplied compiler result; Phase 7.3A never produces it."""

    schema_version: Literal["phase7.rule_compiler_output.v1"] = "phase7.rule_compiler_output.v1"
    artifact_type: Literal["phase7_rule_compiler_output"] = "phase7_rule_compiler_output"
    output_id: str = Field(min_length=1, max_length=255)
    packet_id: str = Field(min_length=1, max_length=255)
    proposals: list[RuleCompilerProposalDraft] = Field(default_factory=list, max_length=3)


class RuleCompilerSubmission(LearningStrictContract):
    """Real-bank API input; namespace and authoritative lineage are server-owned."""

    source_candidate_ids: list[str] = Field(min_length=1, max_length=100)
    compiler_output: RuleCompilerOutput


class ReasoningRuleProposal(LearningStrictContract):
    """Strict intermediate between candidate evidence and governance."""

    schema_version: Literal["phase7.reasoning_rule_proposal.v1"] = (
        "phase7.reasoning_rule_proposal.v1"
    )
    artifact_type: Literal["phase7_reasoning_rule_proposal"] = "phase7_reasoning_rule_proposal"
    proposal_id: str = Field(min_length=1, max_length=255)
    bank_namespace: RuleBankNamespace
    source_candidate_ids: list[str] = Field(min_length=1, max_length=100)
    source_review_ids: list[str] = Field(default_factory=list, max_length=100)
    source_experience_ids: list[str] = Field(default_factory=list, max_length=100)
    proposal_origin: RuleProposalOrigin
    provenance: ProvenanceKind
    origin: ExperienceOrigin
    rule_type: RuleType
    title: str = Field(min_length=1, max_length=180)
    trigger_conditions: list[str] = Field(min_length=1, max_length=8)
    applicability_conditions: list[str] = Field(min_length=1, max_length=8)
    action_steps: list[str] = Field(min_length=1, max_length=8)
    verification_steps: list[str] = Field(min_length=1, max_length=8)
    prohibited_behaviors: list[str] = Field(min_length=1, max_length=8)
    exceptions_or_limits: list[str] = Field(min_length=1, max_length=8)
    transfer_targets: list[str] = Field(default_factory=list, max_length=20)
    case_erasure_confirmation: bool = False
    procedural_only_confirmation: bool = False
    source_specific_residue: list[str] = Field(default_factory=list, max_length=20)
    legal_proposition_residue: list[str] = Field(default_factory=list, max_length=20)
    supporting_evaluation_case_ids: list[str] = Field(default_factory=list, max_length=100)
    negative_control_case_ids: list[str] = Field(default_factory=list, max_length=100)
    compiler_metadata: RuleCompilerMetadata = Field(
        default_factory=lambda: RuleCompilerMetadata(
            compiler_kind="offline_rule_compiler",
            compiler_version="manual",
            prompt_template_version="phase7.3a.v1",
            formation_mode="manual_offline",
            generated_at="2000-01-01T00:00:00Z",
        )
    )
    canonical_payload_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    artifact_version: int = Field(default=1, ge=1)
    artifact_created_at: str | None = None
    supersedes_artifact_id: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_provenance(self):
        if self.bank_namespace == "real":
            if self.provenance != "lawyer_reviewed" or self.origin != "live_interaction":
                raise ValueError("real proposals require live lawyer-reviewed provenance")
        else:
            if self.provenance != "synthetic_test" or self.origin not in {
                "synthetic_test",
                "manual_fixture",
            }:
                raise ValueError("simulation proposals require synthetic provenance")
        for field_name in (
            "trigger_conditions",
            "applicability_conditions",
            "action_steps",
            "verification_steps",
            "prohibited_behaviors",
            "exceptions_or_limits",
        ):
            if any(len(item) > 400 for item in getattr(self, field_name)):
                raise ValueError(f"{field_name} items must be at most 400 characters")
        if (
            len(
                _canonical_lesson_text(
                    self.trigger_conditions,
                    self.applicability_conditions,
                    self.action_steps,
                    self.verification_steps,
                    self.prohibited_behaviors,
                    self.exceptions_or_limits,
                )
            )
            > 2000
        ):
            raise ValueError("structured rule renders to more than 2000 characters")
        if len(self.model_dump_json().encode("utf-8")) > 24000:
            raise ValueError("rule proposal exceeds the 24KB operational size limit")
        return self


class RuleQualityGateReport(LearningStrictContract):
    schema_version: Literal["phase7.rule_quality_gate.v1"] = "phase7.rule_quality_gate.v1"
    result: Literal["PASS", "FAIL"]
    reason_codes: list[str] = Field(default_factory=list, max_length=50)
    detected_residue: list[str] = Field(default_factory=list, max_length=50)


class ReasoningRuleDecision(LearningStrictContract):
    schema_version: Literal["phase7.reasoning_rule_decision.v1"] = (
        "phase7.reasoning_rule_decision.v1"
    )
    artifact_type: Literal["phase7_reasoning_rule_decision"] = "phase7_reasoning_rule_decision"
    decision_id: str = Field(min_length=1, max_length=255)
    proposal_id: str = Field(min_length=1, max_length=255)
    source_candidate_ids: list[str] = Field(default_factory=list, max_length=100)
    bank_namespace: RuleBankNamespace
    action: RuleDecisionAction
    target_rule_key: str | None = Field(default=None, max_length=255)
    target_rule_version: int | None = Field(default=None, ge=1)
    second_target_rule_key: str | None = Field(default=None, max_length=255)
    resulting_rule_key: str | None = Field(default=None, max_length=255)
    resulting_rule_version: int | None = Field(default=None, ge=1)
    second_resulting_rule_key: str | None = Field(default=None, max_length=255)
    second_resulting_rule_version: int | None = Field(default=None, ge=1)
    decision_reason_code: str = Field(min_length=1, max_length=100)
    decided_by: str = Field(min_length=1, max_length=255)
    decision_mode: Literal["trusted_lawyer", "simulation_offline"]
    decision_fingerprint: str = Field(min_length=64, max_length=64)
    case_erasure_confirmed: bool = False
    procedural_only_confirmed: bool = False
    canonical_payload_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    artifact_version: int = Field(default=1, ge=1)
    artifact_created_at: str | None = None
    supersedes_artifact_id: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def decision_namespace_matches_mode(self):
        if self.bank_namespace == "real" and self.decision_mode != "trusted_lawyer":
            raise ValueError("real decisions require trusted lawyer mode")
        if self.bank_namespace == "simulation" and self.decision_mode != "simulation_offline":
            raise ValueError("simulation decisions require offline simulation mode")
        return self


class ReasoningRuleDecisionRequest(LearningStrictContract):
    """Control-plane request; the server supplies the decision envelope."""

    proposal_id: str = Field(min_length=1, max_length=255)
    action: RuleDecisionAction
    target_rule_key: str | None = Field(default=None, max_length=255)
    decided_by: str = Field(min_length=1, max_length=255)
    decision_reason_code: str = Field(default="other", min_length=1, max_length=100)
    case_erasure_confirmed: bool = False
    procedural_only_confirmed: bool = False


class ReasoningRuleRetirementRequest(LearningStrictContract):
    """Bounded retirement command; no narrative is stored by retirement."""

    reason_code: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_.-]{0,63}$")
    decided_by: str = Field(min_length=1, max_length=255)


class ReasoningBankState(LearningStrictContract):
    schema_version: Literal["phase7.reasoning_bank_state.v1"] = "phase7.reasoning_bank_state.v1"
    bank_namespace: RuleBankNamespace
    max_rules: int = Field(ge=0)
    max_rules_per_type: int = Field(ge=0)
    current_rule_count: int = Field(ge=0)
    approved_count: int = Field(ge=0)
    retired_count: int = Field(ge=0)
    conflicted_count: int = Field(ge=0)
    quarantined_count: int = Field(ge=0)
    counts_by_rule_type: dict[str, int] = Field(default_factory=dict)
    capacity_remaining: int = Field(ge=0)
    unresolved_proposal_count: int = Field(ge=0)
    bank_digest: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


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
