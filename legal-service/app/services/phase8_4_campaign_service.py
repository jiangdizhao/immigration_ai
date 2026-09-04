"""Phase 8.4 M3 transfer/regression campaign orchestration."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.schemas.learning import EvaluationCase
from app.schemas.phase8_4_campaign import (
    Phase84CampaignCandidate,
    Phase84CampaignFixture,
    Phase84GroupSummary,
    Phase84ScenarioResult,
    SimulationValidationReport,
)
from app.schemas.phase8_4_experiment import ExperimentArm
from app.schemas.phase8_4_simulation import SimulationScenario
from app.services.phase7_replay_service import Phase7ReplayService
from app.services.phase8_4_experiment_service import (
    Phase84ExperimentError,
    Phase84ExperimentResult,
    Phase84ExperimentRunner,
)
from app.services.phase8_4_simulation_service import (
    Phase84SimulationError,
    Phase84SimulationResult,
)


class Phase84CampaignError(ValueError):
    """The campaign fixture or campaign integrity contract is invalid."""


@dataclass(frozen=True)
class Phase84CampaignRun:
    reports: tuple[SimulationValidationReport, ...]
    scenario_results: tuple[Phase84ScenarioResult, ...]
    provider_api_call_count: int


class Phase84CampaignService:
    """Orchestrate M1 materialization and M2 pair evaluation in one transaction."""

    def __init__(
        self,
        *,
        simulation_service: Any | None = None,
        experiment_runner_factory: Callable[..., Phase84ExperimentRunner] | None = None,
        replay_service: Phase7ReplayService | None = None,
    ) -> None:
        from app.services.phase8_4_simulation_service import Phase84SimulationService

        self.simulation_service = simulation_service or Phase84SimulationService()
        self.experiment_runner_factory = experiment_runner_factory or Phase84ExperimentRunner
        self.replay_service = replay_service or Phase7ReplayService()

    async def run(
        self,
        *,
        db: Session,
        fixture: Phase84CampaignFixture,
        provider_factory: Callable[
            [Phase84CampaignCandidate, SimulationScenario, ExperimentArm], Any
        ],
        experiment_id: str = "campaign",
        as_of_date: date,
        response_language: str = "en",
    ) -> Phase84CampaignRun:
        source_fixtures = {item.fixture_id: item for item in fixture.source_fixtures}
        reports: list[SimulationValidationReport] = []
        scenario_results: list[Phase84ScenarioResult] = []
        provider_call_count = 0

        for candidate in fixture.candidates:
            source = source_fixtures[candidate.source_fixture_id]
            try:
                simulation = self.simulation_service.run(db, source.fixture)
                report, results, calls = await self._run_candidate(
                    db=db,
                    candidate=candidate,
                    simulation=simulation,
                    provider_factory=provider_factory,
                    experiment_id=experiment_id,
                    as_of_date=as_of_date,
                    response_language=response_language,
                )
            except (Phase84CampaignError, Phase84ExperimentError, Phase84SimulationError) as exc:
                report = self._invalid_report(
                    candidate.candidate_campaign_id,
                    reason_code=self._error_reason_code(exc),
                )
                results = []
                calls = 0
            reports.append(report)
            scenario_results.extend(results)
            provider_call_count += calls

        return Phase84CampaignRun(
            reports=tuple(reports),
            scenario_results=tuple(scenario_results),
            provider_api_call_count=provider_call_count,
        )

    def run_sync(self, **kwargs: Any) -> Phase84CampaignRun:
        return asyncio.run(self.run(**kwargs))

    async def _run_candidate(
        self,
        *,
        db: Session,
        candidate: Phase84CampaignCandidate,
        simulation: Phase84SimulationResult,
        provider_factory: Callable[[Phase84CampaignCandidate, SimulationScenario, ExperimentArm], Any],
        experiment_id: str,
        as_of_date: date,
        response_language: str,
    ) -> tuple[SimulationValidationReport, list[Phase84ScenarioResult], int]:
        source_scenario_id = simulation.scenario_id
        if source_scenario_id not in {scenario.scenario_id for scenario in candidate.scenarios}:
            raise Phase84CampaignError("source scenario is not assigned to its candidate")

        results: list[Phase84ScenarioResult] = []
        provider_calls = 0
        for scenario in candidate.scenarios:
            evaluation_case = self._evaluation_case(candidate, scenario)

            def arm_provider(arm: ExperimentArm, *, scenario=scenario):
                return provider_factory(candidate, scenario, arm)

            runner = self.experiment_runner_factory(provider_factory=arm_provider)
            pair = await runner.run(
                db=db,
                scenario=scenario,
                evaluation_case=evaluation_case,
                rule_key=simulation.rule_key,
                experiment_id=f"{experiment_id}-{candidate.candidate_campaign_id}-{scenario.scenario_id}",
                as_of_date=as_of_date,
                response_language=response_language,
            )
            provider_calls += (
                pair.baseline.runtime_result.metrics.provider_api_call_count
                + pair.treatment.runtime_result.metrics.provider_api_call_count
            )
            results.append(self._scenario_result(pair, scenario, simulation.rule_key))

        report = self._build_report(candidate, simulation, results)
        return report, results, provider_calls

    @staticmethod
    def _evaluation_case(
        candidate: Phase84CampaignCandidate, scenario: SimulationScenario
    ) -> EvaluationCase:
        return EvaluationCase(
            case_id=f"phase84-m3-{candidate.candidate_campaign_id}-{scenario.scenario_id}",
            provenance="synthetic_test",
            origin="synthetic_test",
            question=scenario.question,
            relevant_matter_state={"facts": dict(scenario.facts)},
            expected_claim_ids=list(scenario.expected_claim_ids),
            prohibited_claim_ids=list(scenario.prohibited_claim_ids),
            prohibited_behaviors=list(scenario.prohibited_behaviors),
            tags=["phase8.4", "m3", scenario.group],
            source_integrity="legacy_trace_only",
        )

    @staticmethod
    def _scenario_result(
        pair: Phase84ExperimentResult,
        scenario: SimulationScenario,
        rule_key: str,
    ) -> Phase84ScenarioResult:
        architecture: list[str] = []
        architecture.extend(pair.baseline.observation.architecture_invariant_violations)
        architecture.extend(pair.treatment.observation.architecture_invariant_violations)
        runtime_failures: list[str] = []
        for label, arm in (("baseline", pair.baseline.runtime_result), ("treatment", pair.treatment.runtime_result)):
            if arm.status != "completed":
                runtime_failures.append(f"{label}_not_completed")
        parity_failures: list[str] = []
        if pair.baseline.runtime_result.model != pair.treatment.runtime_result.model:
            parity_failures.append("model_mismatch")
        if pair.baseline.guidance.guidance_injected:
            architecture.append("baseline_guidance_injected")
        if not pair.treatment.guidance.guidance_injected:
            architecture.append("treatment_guidance_missing")
        if pair.treatment.guidance.rule_key != rule_key:
            architecture.append("treatment_rule_mismatch")
        if pair.treatment.guidance.bank_namespace != "simulation":
            architecture.append("treatment_namespace_mismatch")
        return Phase84ScenarioResult(
            scenario_id=scenario.scenario_id,
            group=scenario.group,
            baseline_replay=pair.baseline.replay_report,
            treatment_replay=pair.treatment.replay_report,
            pair_delta=pair.comparison,
            baseline_status=pair.baseline.runtime_result.status,
            treatment_status=pair.treatment.runtime_result.status,
            baseline_model=pair.baseline.runtime_result.model,
            treatment_model=pair.treatment.runtime_result.model,
            baseline_provider_api_call_count=pair.baseline.runtime_result.metrics.provider_api_call_count,
            treatment_provider_api_call_count=pair.treatment.runtime_result.metrics.provider_api_call_count,
            baseline_tool_call_count=pair.baseline.runtime_result.metrics.tool_call_count,
            treatment_tool_call_count=pair.treatment.runtime_result.metrics.tool_call_count,
            baseline_checker_status=pair.baseline.runtime_result.checker_status,
            treatment_checker_status=pair.treatment.runtime_result.checker_status,
            architecture_invariant_violations=sorted(set(architecture)),
            runtime_failure_codes=runtime_failures,
            parity_failure_codes=parity_failures,
        )

    @classmethod
    def _build_report(
        cls,
        candidate: Phase84CampaignCandidate,
        simulation: Phase84SimulationResult,
        results: list[Phase84ScenarioResult],
    ) -> SimulationValidationReport:
        summaries = {
            group: cls._summary([item for item in results if item.group == group])
            for group in ("source", "transfer", "negative_control", "control")
        }
        architecture = sorted(
            {
                code
                for item in results
                for code in item.architecture_invariant_violations
            }
        )
        runtime_failures = sum(bool(item.runtime_failure_codes) for item in results)
        parity_failures = sum(bool(item.parity_failure_codes) for item in results)
        invalid = bool(architecture or runtime_failures or parity_failures)
        regressed = [
            item.scenario_id
            for item in results
            if item.pair_delta.overall in {"regressed", "mixed"}
        ]
        improved = [item.scenario_id for item in results if item.pair_delta.overall == "improved"]
        mixed = [item.scenario_id for item in results if item.pair_delta.overall == "mixed"]
        inconclusive = [
            item.scenario_id for item in results if item.pair_delta.overall == "inconclusive"
        ]
        transfer_improved = any(
            item.group == "transfer" and item.pair_delta.overall == "improved" for item in results
        )
        control_regression = any(
            item.group in {"negative_control", "control"}
            and item.pair_delta.overall in {"regressed", "mixed"}
            for item in results
        )
        if invalid:
            label = "simulation_invalid"
            reasons = ["experiment_integrity_failure"]
        elif control_regression or regressed:
            label = "simulation_regression"
            reasons = ["treatment_regression_observed"]
        elif transfer_improved:
            label = "simulation_promising"
            reasons = ["transfer_improvement_observed"]
        else:
            label = "simulation_inconclusive"
            reasons = ["transfer_improvement_not_observed"]
        if not results:
            label = "simulation_invalid"
            reasons = ["no_scenarios_evaluated"]
        return SimulationValidationReport(
            candidate_campaign_id=candidate.candidate_campaign_id,
            simulation_rule_key=simulation.rule_key,
            rule_version=1,
            source_summary=summaries["source"],
            transfer_summary=summaries["transfer"],
            negative_control_summary=summaries["negative_control"],
            control_summary=summaries["control"],
            total_cases=len(results),
            architecture_invariant_violations=architecture,
            runtime_failure_count=runtime_failures,
            parity_failure_count=parity_failures,
            improved_case_ids=improved,
            regressed_case_ids=regressed,
            mixed_case_ids=mixed,
            inconclusive_case_ids=inconclusive,
            final_label=label,
            reason_codes=reasons,
        )

    @staticmethod
    def _summary(results: list[Phase84ScenarioResult]) -> Phase84GroupSummary:
        counts = {key: 0 for key in ("improved", "unchanged", "regressed", "mixed", "inconclusive")}
        fixed = 0
        regressed = 0
        for item in results:
            counts[item.pair_delta.overall] += 1
            fixed += len(item.pair_delta.fixed_metrics)
            regressed += len(item.pair_delta.regressed_metrics)
        return Phase84GroupSummary(
            total=len(results),
            improved=counts["improved"],
            unchanged=counts["unchanged"],
            regressed=counts["regressed"],
            mixed=counts["mixed"],
            inconclusive=counts["inconclusive"],
            fixed_transition_count=fixed,
            regression_transition_count=regressed,
        )

    @staticmethod
    def _invalid_report(candidate_campaign_id: str, *, reason_code: str) -> SimulationValidationReport:
        return SimulationValidationReport(
            candidate_campaign_id=candidate_campaign_id,
            final_label="simulation_invalid",
            reason_codes=[reason_code],
        )

    @staticmethod
    def _error_reason_code(exc: Exception) -> str:
        if isinstance(exc, Phase84SimulationError):
            return "source_rule_materialization_failed"
        if isinstance(exc, Phase84ExperimentError):
            return "pair_execution_failed"
        return "campaign_integrity_failure"


def load_campaign_fixture(path: str | Path) -> Phase84CampaignFixture:
    fixture_path = Path(path)
    try:
        return Phase84CampaignFixture.model_validate(json.loads(fixture_path.read_text(encoding="utf-8")))
    except Exception as exc:
        raise Phase84CampaignError("campaign fixture failed strict validation") from exc


def default_m3_campaign_path() -> Path:
    return Path(__file__).resolve().parents[2] / "simulations" / "phase8_4" / "m3_campaign.json"


__all__ = [
    "Phase84CampaignError",
    "Phase84CampaignRun",
    "Phase84CampaignService",
    "default_m3_campaign_path",
    "load_campaign_fixture",
]
