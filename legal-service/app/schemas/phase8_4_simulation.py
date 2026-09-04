"""Strict, non-production contracts for the Phase 8.4 M1 simulation loop."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.schemas.learning import LearningStrictContract, ReviewOutcome, RuleType


SimulationGroup = Literal["source", "transfer", "negative_control", "control"]
_RESERVED_PROVENANCE_FIELDS = {
    "provenance",
    "origin",
    "bank_namespace",
    "trusted_lawyer_review",
    "runtime_mode",
}


class SimulationScenario(LearningStrictContract):
    """Small scenario descriptor; it contains no authority or runtime state."""

    scenario_id: str = Field(min_length=1, max_length=120, pattern=r"^[a-z0-9][a-z0-9_.-]*$")
    group: SimulationGroup
    question: str = Field(min_length=1, max_length=4000)
    facts: dict[str, str | int | float | bool | None] = Field(default_factory=dict, max_length=40)
    expected_behaviors: list[str] = Field(default_factory=list, max_length=20)
    prohibited_behaviors: list[str] = Field(default_factory=list, max_length=20)
    expected_claim_ids: list[str] = Field(default_factory=list, max_length=50)
    prohibited_claim_ids: list[str] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_scenario(self) -> "SimulationScenario":
        _validate_strings(
            {
                "expected_behaviors": self.expected_behaviors,
                "prohibited_behaviors": self.prohibited_behaviors,
                "expected_claim_ids": self.expected_claim_ids,
                "prohibited_claim_ids": self.prohibited_claim_ids,
            },
            maximum=400,
        )
        _reject_reserved_keys(self.facts)
        return self


class SyntheticReviewFixture(LearningStrictContract):
    review_outcome: ReviewOutcome
    error_categories: list[str] = Field(default_factory=list, max_length=20)
    corrected_answer: str | None = Field(default=None, max_length=12000)
    procedural_lesson: str | None = Field(default=None, max_length=8000)
    expected_checker_behavior: dict[str, str | int | bool] = Field(
        default_factory=dict, max_length=20
    )
    expected_evidence_characteristics: dict[str, str | int | bool] = Field(
        default_factory=dict, max_length=20
    )

    @model_validator(mode="after")
    def validate_review(self) -> "SyntheticReviewFixture":
        _validate_strings({"error_categories": self.error_categories}, maximum=200)
        return self


class CompilerRuleDraftFixture(LearningStrictContract):
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

    @model_validator(mode="after")
    def validate_rule_draft(self) -> "CompilerRuleDraftFixture":
        _validate_strings(
            {
                "title": [self.title],
                "trigger_conditions": self.trigger_conditions,
                "applicability_conditions": self.applicability_conditions,
                "action_steps": self.action_steps,
                "verification_steps": self.verification_steps,
                "prohibited_behaviors": self.prohibited_behaviors,
                "exceptions_or_limits": self.exceptions_or_limits,
                "transfer_targets": self.transfer_targets,
                "source_specific_residue": self.source_specific_residue,
                "legal_proposition_residue": self.legal_proposition_residue,
            },
            maximum=400,
        )
        return self


class SimulationFixture(LearningStrictContract):
    """Complete M1 input; all authority and namespace fields are server-owned."""

    model_config = ConfigDict(extra="forbid", strict=True)

    scenario: SimulationScenario
    synthetic_source_answer: str = Field(min_length=1, max_length=12000)
    synthetic_review: SyntheticReviewFixture
    compiler_rule_draft: CompilerRuleDraftFixture

    @model_validator(mode="before")
    @classmethod
    def reject_authority_overrides(cls, value: Any) -> Any:
        if isinstance(value, dict):
            forbidden = sorted(_RESERVED_PROVENANCE_FIELDS.intersection(value))
            if forbidden:
                raise ValueError(f"simulation fixture cannot set server-owned fields: {forbidden}")
        return value


def _validate_strings(groups: dict[str, list[str]], *, maximum: int) -> None:
    for field_name, values in groups.items():
        if any(not isinstance(value, str) or not value.strip() for value in values):
            raise ValueError(f"{field_name} entries must be non-empty strings")
        if any(len(value) > maximum for value in values):
            raise ValueError(f"{field_name} entries must be at most {maximum} characters")


def _reject_reserved_keys(value: Any) -> None:
    if isinstance(value, dict):
        forbidden = _RESERVED_PROVENANCE_FIELDS.intersection(str(key) for key in value)
        if forbidden:
            raise ValueError(f"scenario facts cannot set server-owned fields: {sorted(forbidden)}")
        for child in value.values():
            _reject_reserved_keys(child)
    elif isinstance(value, list):
        for child in value:
            _reject_reserved_keys(child)


__all__ = [
    "CompilerRuleDraftFixture",
    "SimulationFixture",
    "SimulationGroup",
    "SimulationScenario",
    "SyntheticReviewFixture",
]
