"""Strict in-memory contracts for the Phase 8.4 M2 experiment runner."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import Field

from app.schemas.agent import ExecutionBudget
from app.schemas.learning import LearningStrictContract


ExperimentArm = Literal["baseline", "treatment"]
ExperimentComparison = Literal["improved", "unchanged", "regressed", "mixed", "inconclusive"]


class Phase84ExperimentConfig(LearningStrictContract):
    """Parity configuration shared by both offline arms."""

    schema_version: Literal["phase8.4.m2.experiment_config.v1"] = (
        "phase8.4.m2.experiment_config.v1"
    )
    scenario_id: str = Field(min_length=1, max_length=120)
    question: str = Field(min_length=1, max_length=4000)
    matter_state: dict[str, object]
    response_language: str = Field(min_length=2, max_length=35)
    as_of_date: date
    mode: Literal["default"] = "default"
    experiment_arm: Literal["N"] = "N"
    applicability_protocol_enabled: bool = True
    execution_budget: ExecutionBudget
    model: str = Field(min_length=1, max_length=255)
    reasoning_effort: str = Field(min_length=1, max_length=50)
    prompt_version: str = Field(min_length=1, max_length=255)
    tool_names: list[str] = Field(default_factory=list, max_length=20)
    checker_enabled: bool = False
    checker_model: str = Field(min_length=1, max_length=255)
    checker_reasoning_effort: str = Field(min_length=1, max_length=50)
    config_fingerprint: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class Phase84GuidanceResult(LearningStrictContract):
    """M2 guidance metadata; no production runtime result is faked."""

    schema_version: Literal["phase8.4.m2.guidance_result.v1"] = (
        "phase8.4.m2.guidance_result.v1"
    )
    arm: ExperimentArm
    bank_namespace: Literal["simulation"] = "simulation"
    rule_key: str | None = Field(default=None, max_length=255)
    rule_version: int | None = Field(default=None, ge=1)
    guidance_injected: bool = False
    query_fingerprint: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class Phase84PairComparison(LearningStrictContract):
    """Unweighted deterministic pairwise replay delta."""

    schema_version: Literal["phase8.4.m2.pair_comparison.v1"] = (
        "phase8.4.m2.pair_comparison.v1"
    )
    fixed_metrics: list[str] = Field(default_factory=list, max_length=100)
    regressed_metrics: list[str] = Field(default_factory=list, max_length=100)
    unchanged_metrics: list[str] = Field(default_factory=list, max_length=100)
    overall: ExperimentComparison


__all__ = [
    "ExperimentArm",
    "ExperimentComparison",
    "Phase84ExperimentConfig",
    "Phase84GuidanceResult",
    "Phase84PairComparison",
]
