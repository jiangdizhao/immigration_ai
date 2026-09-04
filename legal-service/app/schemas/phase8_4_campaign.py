"""Strict, non-persistent contracts for the Phase 8.4 M3 campaign."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from app.schemas.learning import LearningStrictContract, ReplayReport
from app.schemas.phase8_4_experiment import Phase84PairComparison
from app.schemas.phase8_4_simulation import SimulationFixture, SimulationScenario


CampaignLabel = Literal[
    "simulation_promising",
    "simulation_inconclusive",
    "simulation_regression",
    "simulation_invalid",
]


class Phase84CampaignSourceFixture(LearningStrictContract):
    fixture_id: str = Field(min_length=1, max_length=120, pattern=r"^[a-z0-9][a-z0-9_.-]*$")
    fixture: SimulationFixture


class Phase84CampaignCandidate(LearningStrictContract):
    candidate_campaign_id: str = Field(
        min_length=1, max_length=120, pattern=r"^[a-z0-9][a-z0-9_.-]*$"
    )
    source_fixture_id: str = Field(min_length=1, max_length=120)
    scenarios: list[SimulationScenario] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def validate_scenarios(self) -> "Phase84CampaignCandidate":
        ids = [scenario.scenario_id for scenario in self.scenarios]
        if len(ids) != len(set(ids)):
            raise ValueError("campaign scenario IDs must be unique per candidate")
        groups = {scenario.group for scenario in self.scenarios}
        required = {"source", "transfer", "negative_control", "control"}
        if not required.issubset(groups):
            raise ValueError("each candidate requires source, transfer, negative_control, and control")
        return self


class Phase84CampaignFixture(LearningStrictContract):
    schema_version: Literal["phase8.4.m3.campaign_fixture.v1"] = (
        "phase8.4.m3.campaign_fixture.v1"
    )
    source_fixtures: list[Phase84CampaignSourceFixture] = Field(min_length=1, max_length=6)
    candidates: list[Phase84CampaignCandidate] = Field(min_length=4, max_length=6)

    @model_validator(mode="after")
    def validate_fixture_links(self) -> "Phase84CampaignFixture":
        fixture_ids = [item.fixture_id for item in self.source_fixtures]
        if len(fixture_ids) != len(set(fixture_ids)):
            raise ValueError("campaign source fixture IDs must be unique")
        candidate_ids = [item.candidate_campaign_id for item in self.candidates]
        if len(candidate_ids) != len(set(candidate_ids)):
            raise ValueError("campaign candidate IDs must be unique")
        available = set(fixture_ids)
        if any(item.source_fixture_id not in available for item in self.candidates):
            raise ValueError("campaign candidate references an unknown source fixture")
        return self


class Phase84GroupSummary(LearningStrictContract):
    total: int = Field(default=0, ge=0)
    improved: int = Field(default=0, ge=0)
    unchanged: int = Field(default=0, ge=0)
    regressed: int = Field(default=0, ge=0)
    mixed: int = Field(default=0, ge=0)
    inconclusive: int = Field(default=0, ge=0)
    fixed_transition_count: int = Field(default=0, ge=0)
    regression_transition_count: int = Field(default=0, ge=0)


class Phase84ScenarioResult(LearningStrictContract):
    scenario_id: str = Field(min_length=1, max_length=120)
    group: Literal["source", "transfer", "negative_control", "control"]
    baseline_replay: ReplayReport
    treatment_replay: ReplayReport
    pair_delta: Phase84PairComparison
    baseline_status: str = Field(min_length=1, max_length=40)
    treatment_status: str = Field(min_length=1, max_length=40)
    baseline_model: str = Field(min_length=1, max_length=255)
    treatment_model: str = Field(min_length=1, max_length=255)
    baseline_provider_api_call_count: int = Field(default=0, ge=0)
    treatment_provider_api_call_count: int = Field(default=0, ge=0)
    baseline_tool_call_count: int = Field(default=0, ge=0)
    treatment_tool_call_count: int = Field(default=0, ge=0)
    baseline_checker_status: str = Field(min_length=1, max_length=40)
    treatment_checker_status: str = Field(min_length=1, max_length=40)
    architecture_invariant_violations: list[str] = Field(default_factory=list, max_length=50)
    runtime_failure_codes: list[str] = Field(default_factory=list, max_length=50)
    parity_failure_codes: list[str] = Field(default_factory=list, max_length=50)


class SimulationValidationReport(LearningStrictContract):
    schema_version: Literal["phase8.4.m3.validation_report.v1"] = (
        "phase8.4.m3.validation_report.v1"
    )
    candidate_campaign_id: str = Field(min_length=1, max_length=120)
    simulation_rule_key: str | None = Field(default=None, max_length=255)
    rule_version: int | None = Field(default=None, ge=1)
    source_summary: Phase84GroupSummary = Field(default_factory=Phase84GroupSummary)
    transfer_summary: Phase84GroupSummary = Field(default_factory=Phase84GroupSummary)
    negative_control_summary: Phase84GroupSummary = Field(default_factory=Phase84GroupSummary)
    control_summary: Phase84GroupSummary = Field(default_factory=Phase84GroupSummary)
    total_cases: int = Field(default=0, ge=0)
    architecture_invariant_violations: list[str] = Field(default_factory=list, max_length=100)
    runtime_failure_count: int = Field(default=0, ge=0)
    parity_failure_count: int = Field(default=0, ge=0)
    improved_case_ids: list[str] = Field(default_factory=list, max_length=12)
    regressed_case_ids: list[str] = Field(default_factory=list, max_length=12)
    mixed_case_ids: list[str] = Field(default_factory=list, max_length=12)
    inconclusive_case_ids: list[str] = Field(default_factory=list, max_length=12)
    final_label: CampaignLabel
    reason_codes: list[str] = Field(default_factory=list, max_length=50)


__all__ = [
    "CampaignLabel",
    "Phase84CampaignCandidate",
    "Phase84CampaignFixture",
    "Phase84CampaignSourceFixture",
    "Phase84GroupSummary",
    "Phase84ScenarioResult",
    "SimulationValidationReport",
]
