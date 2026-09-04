"""Phase 8.4 M2 baseline-versus-treatment experiment runner.

This module is an offline evaluation adapter.  It runs the real bounded
AgentRuntimeService in memory and deliberately has no persistence path.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
from app.schemas.learning import (
    CandidateRunObservation,
    EvaluationCase,
    ReasoningBankRuntimeQuery,
    ReasoningLesson,
    ReplayReport,
)
from app.schemas.phase8_4_experiment import (
    ExperimentArm,
    Phase84ExperimentConfig,
    Phase84GuidanceResult,
    Phase84PairComparison,
)
from app.schemas.phase8_4_simulation import SimulationScenario
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.agent_runtime_service import AgentRuntimeService, ProviderInterface
from app.services.agent_policy_service import AgentPolicyService
from app.services.phase7_3a_reasoning_bank import ReasoningBankService
from app.services.phase7_replay_service import Phase7ReplayService


class Phase84ExperimentError(ValueError):
    """The offline experiment inputs or treatment rule are unsafe."""


def _fingerprint(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _compact_facts(value: dict[str, Any]) -> dict[str, str | int | float | bool | None]:
    """Keep the runtime query contract flat and primitive."""
    compact: dict[str, str | int | float | bool | None] = {}
    for key, item in value.items():
        if isinstance(item, (str, int, float, bool)) or item is None:
            compact[key] = item
        elif isinstance(item, dict):
            for child_key, child in item.items():
                if isinstance(child, (str, int, float, bool)) or child is None:
                    compact[f"{key}.{child_key}"] = child
    return compact


@dataclass(frozen=True)
class Phase84ArmRun:
    arm: ExperimentArm
    guidance: Phase84GuidanceResult
    runtime_result: Any
    observation: CandidateRunObservation
    replay_report: ReplayReport


@dataclass(frozen=True)
class Phase84ExperimentResult:
    config: Phase84ExperimentConfig
    baseline: Phase84ArmRun
    treatment: Phase84ArmRun
    comparison: Phase84PairComparison


class Phase84SimulationGuidanceService:
    """Expose exactly one validated simulation rule to one M2 arm."""

    def __init__(self, *, db: Session | None, arm: ExperimentArm, rule_key: str) -> None:
        self.arm = arm
        self._db = db
        self._rule: ReasoningLesson | None = None
        if arm == "treatment":
            if db is None:
                raise Phase84ExperimentError("treatment requires a local simulation database session")
            rules = ReasoningBankService().list_rules(db, bank_namespace="simulation")
            self._rule = next((rule for rule in rules if rule.rule_key == rule_key), None)
            if self._rule is None:
                raise Phase84ExperimentError("exact simulation rule was not found")
            self._validate_rule(self._rule)

    def retrieve(
        self, db: Session | None, query: ReasoningBankRuntimeQuery
    ) -> Phase84GuidanceResult:
        del db
        return Phase84GuidanceResult(
            arm=self.arm,
            rule_key=self._rule.rule_key if self._rule else None,
            rule_version=self._rule.rule_version if self._rule else None,
            guidance_injected=self._rule is not None,
            query_fingerprint=_fingerprint(
                {"question": query.question, "compact_facts": query.compact_facts}
            ),
        )

    def prompt_block(self, result: Phase84GuidanceResult) -> str:
        if not result.guidance_injected or self._rule is None:
            return ""
        rule = self._rule
        # Only generalized structured rule-body fields enter the prompt.  Do
        # not expose lineage identifiers, corrected answers, or evidence.
        sections = (
            ("WHEN", rule.trigger_conditions),
            ("APPLY IF", rule.applicability_conditions),
            ("DO", rule.action_steps),
            ("VERIFY", rule.verification_steps),
            ("AVOID", rule.prohibited_behaviors),
            ("LIMITS", rule.exceptions_or_limits),
        )
        body = "\n\n".join(
            f"{label}:\n" + "\n".join(f"- {item}" for item in values)
            for label, values in sections
        )
        return (
            "SIMULATION PROCESS GUIDANCE — OFFLINE EXPERIMENT ONLY\n"
            "This synthetic guidance is not lawyer-approved, legal authority, or production memory.\n"
            f"Title: {rule.title}\n"
            f"Rule type: {rule.rule_type}\n\n{body}"
        )

    def telemetry(self, result: Phase84GuidanceResult) -> dict[str, Any]:
        return result.model_dump(mode="json")

    @staticmethod
    def _validate_rule(rule: ReasoningLesson) -> None:
        if (
            rule.bank_namespace != "simulation"
            or rule.provenance != "synthetic_test"
            or rule.origin not in {"synthetic_test", "manual_fixture"}
            or rule.lifecycle != "approved"
            or rule.governance_state != "normal"
            or rule.validation_state == "failed"
        ):
            raise Phase84ExperimentError("exact simulation rule failed M2 treatment validation")


class Phase84ExperimentRunner:
    """Run two parity-configured AgentRuntime executions without committing."""

    def __init__(
        self,
        *,
        provider_factory: Callable[[ExperimentArm], ProviderInterface],
        replay_service: Phase7ReplayService | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.provider_factory = provider_factory
        self.replay_service = replay_service or Phase7ReplayService()
        self.settings = settings or get_settings()

    async def run(
        self,
        *,
        db: Session,
        scenario: SimulationScenario,
        evaluation_case: EvaluationCase,
        rule_key: str,
        experiment_id: str,
        as_of_date: date,
        response_language: str = "en",
    ) -> Phase84ExperimentResult:
        if scenario.question != evaluation_case.question:
            raise Phase84ExperimentError("scenario and evaluation case questions differ")
        policy = AgentPolicyService().build_policy(
            mode="default",
            experiment_arm="N",
            applicability_protocol_enabled=self.settings.default_applicability_protocol_enabled,
        )
        budget = self._budget(self.settings)
        matter_state = dict(evaluation_case.relevant_matter_state)
        config_payload = {
            "scenario_id": scenario.scenario_id,
            "question": scenario.question,
            "matter_state": matter_state,
            "response_language": response_language,
            "as_of_date": as_of_date,
            "mode": "default",
            "experiment_arm": "N",
            "applicability_protocol_enabled": self.settings.default_applicability_protocol_enabled,
            "execution_budget": budget.model_dump(mode="json"),
            "model": policy.model,
            "reasoning_effort": policy.reasoning_effort,
            "prompt_version": policy.prompt_version,
            "tool_names": sorted(AgentPolicyService().get_tool_names(policy)),
            "checker_enabled": self.settings.compact_checker_enabled,
            "checker_model": self.settings.compact_checker_model,
            "checker_reasoning_effort": self.settings.compact_checker_reasoning_effort,
        }
        config = Phase84ExperimentConfig(
            **config_payload,
            config_fingerprint=_fingerprint(config_payload),
        )

        # Resolve and validate the selected rule before either arm runs.  This
        # prevents a baseline result from being mistaken for a valid pair.
        guidance_services = {
            arm: Phase84SimulationGuidanceService(db=db, arm=arm, rule_key=rule_key)
            for arm in ("baseline", "treatment")
        }
        runs: dict[ExperimentArm, Phase84ArmRun] = {}
        for arm in ("baseline", "treatment"):
            request_id = f"phase84-m2-{experiment_id}-{arm}"
            request = AgentRuntimeRequest(
                request_id=request_id,
                turn_id=f"{request_id}-turn",
                mode="default",
                user_text=config.question,
                response_language=config.response_language,
                as_of_date=config.as_of_date,
                matter_state=config.matter_state,
                execution_budget=config.execution_budget.model_copy(deep=True),
                experiment_arm=config.experiment_arm,
                applicability_protocol_enabled=config.applicability_protocol_enabled,
            )
            provider = self.provider_factory(arm)
            runtime = AgentRuntimeService(
                provider=provider,
                reasoning_bank_runtime_service=guidance_services[arm],
            )
            from app.services.request_evidence_registry import create_registry

            runtime_result = await runtime.run(
                request,
                deadline=AbsoluteTurnDeadline(time.perf_counter(), config.execution_budget.turn_deadline_ms),
                registry=create_registry(request_id),
                db_session=db,
            )
            guidance = guidance_services[arm].retrieve(
                db,
                ReasoningBankRuntimeQuery(
                    question=config.question,
                    compact_facts=_compact_facts(matter_state),
                ),
            )
            observation = self.observation_from_result(runtime_result)
            replay_report = self.replay_service.compare(
                evaluation_case,
                observation,
                candidate_system_version="phase8.4-m2.agent-runtime",
            )
            runs[arm] = Phase84ArmRun(
                arm=arm,
                guidance=guidance,
                runtime_result=runtime_result,
                observation=observation,
                replay_report=replay_report,
            )

        return Phase84ExperimentResult(
            config=config,
            baseline=runs["baseline"],
            treatment=runs["treatment"],
            comparison=self.compare_replays(
                runs["baseline"].replay_report,
                runs["treatment"].replay_report,
            ),
        )

    def run_sync(self, **kwargs: Any) -> Phase84ExperimentResult:
        return asyncio.run(self.run(**kwargs))

    @staticmethod
    def _budget(settings: Settings) -> ExecutionBudget:
        return ExecutionBudget(
            max_tool_rounds=settings.agent_max_tool_rounds,
            max_provider_calls=settings.agent_max_provider_calls,
            max_retries=settings.agent_max_retries,
            turn_deadline_ms=settings.default_turn_deadline_ms,
            answer_research_target_ms=settings.default_answer_research_target_ms,
            checker_target_ms=settings.legal_fact_check_target_ms,
            max_flat_rag_calls=settings.agent_max_flat_rag_calls,
            max_schedule2_navigation_calls=settings.agent_max_schedule2_navigation_calls,
            max_exact_legal_lookup_calls=settings.agent_max_exact_legal_lookup_calls,
            retry_viability_threshold_ms=settings.agent_retry_viability_threshold_ms,
            terminal_synthesis_target_ms=settings.default_terminal_synthesis_target_ms,
            final_response_reserve_ms=settings.default_final_response_reserve_ms,
            terminal_synthesis_min_start_budget_ms=settings.terminal_synthesis_min_start_budget_ms,
        )

    @staticmethod
    def observation_from_result(result: Any) -> CandidateRunObservation:
        submission = result.submission
        if result.checker_blocked_claim_ids:
            checker_outcome = "BLOCK"
        elif result.checker_flagged_claim_ids:
            checker_outcome = "FLAG"
        elif result.checker_status == "completed":
            checker_outcome = "KEEP"
        else:
            checker_outcome = None
        evidence_characteristics = {
            "research_status": submission.research_status if submission else None,
            "citation_count": len(submission.citations) if submission else 0,
            "has_citations": bool(submission and submission.citations),
            "flat_rag_used": result.metrics.flat_rag_call_count > 0,
            "schedule2_navigation_used": result.metrics.schedule2_navigation_call_count > 0,
            "exact_legal_lookup_used": result.metrics.exact_lookup_call_count > 0,
            "native_web_search_used": result.metrics.native_web_search_call_count > 0,
        }
        return CandidateRunObservation(
            claim_ids=[claim.claim_id for claim in submission.claims] if submission else [],
            checker_outcome=checker_outcome,
            latency_ms=max(0, int(round(result.metrics.total_latency_ms))),
            tool_call_count=result.metrics.tool_call_count,
            evidence_characteristics=evidence_characteristics,
            prohibited_behavior_flags=[],
            architecture_invariant_violations=(
                [] if result.status == "completed" and submission is not None else ["runtime_not_completed"]
            ),
        )

    @staticmethod
    def compare_replays(
        baseline: ReplayReport, treatment: ReplayReport
    ) -> Phase84PairComparison:
        baseline_metrics = {item.metric: item.result for item in baseline.per_metric_results}
        treatment_metrics = {item.metric: item.result for item in treatment.per_metric_results}
        fixed: list[str] = []
        regressed: list[str] = []
        unchanged: list[str] = []
        for metric in sorted(set(baseline_metrics) & set(treatment_metrics)):
            before = baseline_metrics[metric]
            after = treatment_metrics[metric]
            if before == "FAIL" and after == "PASS":
                fixed.append(metric)
            elif before == "PASS" and after == "FAIL":
                regressed.append(metric)
            else:
                unchanged.append(metric)
        if not fixed and not regressed and not unchanged:
            overall = "inconclusive"
        elif fixed and regressed:
            overall = "mixed"
        elif fixed:
            overall = "improved"
        elif regressed:
            overall = "regressed"
        else:
            overall = "unchanged"
        return Phase84PairComparison(
            fixed_metrics=fixed,
            regressed_metrics=regressed,
            unchanged_metrics=unchanged,
            overall=overall,
        )


__all__ = [
    "Phase84ArmRun",
    "Phase84ExperimentError",
    "Phase84ExperimentResult",
    "Phase84ExperimentRunner",
    "Phase84SimulationGuidanceService",
]
