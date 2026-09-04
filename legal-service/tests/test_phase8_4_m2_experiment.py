"""Focused Phase 8.4 M2 tests; provider and data are deterministic/offline."""

from __future__ import annotations

import asyncio
from datetime import date

import pytest

import scripts.phase8_4_m2_experiment_smoke as m2_smoke
from app.db.models import ReviewArtifact
from app.schemas.agent import AgentClaim
from app.schemas.learning import CandidateRunObservation, EvaluationCase
from app.schemas.phase8_4_simulation import SimulationFixture
from app.services.agent_runtime_service import ProviderInterface, ProviderResponse
from app.services.phase7_3a_reasoning_bank import ReasoningBankService
from app.services.phase7_replay_service import Phase7ReplayService
from app.services.phase8_4_experiment_service import (
    Phase84ExperimentError,
    Phase84ExperimentRunner,
    Phase84SimulationGuidanceService,
)
from app.services.phase8_4_simulation_service import (
    Phase84SimulationService,
    default_m1_fixture_path,
    load_simulation_fixture,
)
from app.services.phase7_3b_synthetic_world import SimulationStore
from app.services.tool_executor_service import ToolCallRequest


class _M2Provider(ProviderInterface):
    def __init__(self, *, treatment: bool) -> None:
        self.treatment = treatment
        self.calls: list[dict] = []

    async def call(self, **kwargs):
        self.calls.append(
            {
                "model": kwargs["model"],
                "reasoning_effort": kwargs.get("reasoning_effort"),
                "system_prompt": kwargs["system_prompt"],
            }
        )
        draft = "Synthetic procedural result."
        claims = (
            [
                AgentClaim(
                    claim_id="process-date-check",
                    claim_type="procedure",
                    materiality="supporting",
                    text=draft,
                    draft_start=0,
                    draft_end=len(draft),
                ).model_dump(mode="json")
            ]
            if self.treatment
            else []
        )
        return ProviderResponse(
            response_id=f"m2-{len(self.calls)}",
            model=kwargs["model"],
            status="ok",
            tool_calls=[
                ToolCallRequest(
                    call_id=f"submit-{len(self.calls)}",
                    name="submit_answer",
                    arguments={
                        "schema_version": "agent_submission.v2",
                        "answer_class": "procedural",
                        "draft_markdown": draft,
                        "claims": claims,
                        "citations": [],
                        "research_status": "not_required",
                    },
                )
            ],
        )


def _fixture() -> SimulationFixture:
    return load_simulation_fixture(default_m1_fixture_path())


def _evaluation_case(db) -> EvaluationCase:
    row = next(
        item
        for item in db.query(ReviewArtifact).all()
        if item.artifact_type == "phase7_evaluation_case"
    )
    return EvaluationCase.model_validate(row.artifact_payload)


def test_m2_runner_uses_real_runtime_with_parity_and_one_simulation_rule():
    fixture = _fixture()
    providers: dict[str, _M2Provider] = {}

    def provider_factory(arm):
        provider = _M2Provider(treatment=arm == "treatment")
        providers[arm] = provider
        return provider

    with SimulationStore() as store:
        with store.session() as db:
            simulation = Phase84SimulationService().run(db, fixture)
            case = _evaluation_case(db)
            before_real = ReasoningBankService().state(db, bank_namespace="real")
            db.commit = lambda: pytest.fail("M2 runner must not commit")

            result = asyncio.run(
                Phase84ExperimentRunner(provider_factory=provider_factory).run(
                    db=db,
                    scenario=fixture.scenario,
                    evaluation_case=case,
                    rule_key=simulation.rule_key,
                    experiment_id="test-pair",
                    as_of_date=date(2026, 9, 5),
                )
            )

            assert result.config.experiment_arm == "N"
            assert result.config.config_fingerprint == result.config.config_fingerprint
            assert result.baseline.runtime_result.status == "completed"
            assert result.treatment.runtime_result.status == "completed"
            assert result.baseline.guidance.guidance_injected is False
            assert result.treatment.guidance.guidance_injected is True
            assert result.treatment.guidance.rule_key == simulation.rule_key
            assert result.treatment.guidance.rule_version == 1
            assert result.baseline.observation.claim_ids == []
            assert result.treatment.observation.claim_ids == ["process-date-check"]
            assert result.comparison.overall == "improved"
            assert result.comparison.fixed_metrics == ["expected_claim_ids"]
            assert providers["baseline"].calls[0]["model"] == providers["treatment"].calls[0]["model"]
            assert providers["baseline"].calls[0]["reasoning_effort"] == providers["treatment"].calls[0]["reasoning_effort"]
            assert "SIMULATION PROCESS GUIDANCE" not in providers["baseline"].calls[0]["system_prompt"]
            treatment_prompt = providers["treatment"].calls[0]["system_prompt"]
            assert "SIMULATION PROCESS GUIDANCE" in treatment_prompt
            assert simulation.rule_key not in treatment_prompt
            assert simulation.rule_artifact_id not in treatment_prompt
            if fixture.synthetic_review.corrected_answer:
                assert fixture.synthetic_review.corrected_answer not in treatment_prompt
            guidance_block = treatment_prompt.split("SIMULATION PROCESS GUIDANCE", 1)[1]
            assert "evidence" not in guidance_block.lower()
            assert ReasoningBankService().state(db, bank_namespace="real").bank_digest == before_real.bank_digest
            db.rollback()

        with store.session() as db:
            assert ReasoningBankService().state(db, bank_namespace="real").bank_digest == before_real.bank_digest


def test_m2_treatment_requires_exact_valid_simulation_rule():
    with pytest.raises(Phase84ExperimentError, match="treatment requires"):
        Phase84SimulationGuidanceService(db=None, arm="treatment", rule_key="missing")


def test_m2_observation_maps_checker_and_runtime_telemetry():
    class Result:
        submission = None
        checker_blocked_claim_ids = []
        checker_flagged_claim_ids = ["flagged"]
        checker_status = "completed"
        status = "completed"

        class Metrics:
            total_latency_ms = 11.4
            tool_call_count = 2
            flat_rag_call_count = 0
            schedule2_navigation_call_count = 1
            exact_lookup_call_count = 0
            native_web_search_call_count = 0

        metrics = Metrics()

    observation = Phase84ExperimentRunner.observation_from_result(Result())
    assert observation.checker_outcome == "FLAG"
    assert observation.latency_ms == 11
    assert observation.tool_call_count == 2
    assert observation.evidence_characteristics["schedule2_navigation_used"] is True


def test_m2_pair_comparator_is_unweighted_and_deterministic():
    case = EvaluationCase(
        case_id="case",
        question="q",
        provenance="synthetic_test",
        origin="synthetic_test",
        expected_claim_ids=["expected"],
        prohibited_behaviors=["bad"],
    )
    replay = Phase7ReplayService()
    baseline = replay.compare(
        case,
        CandidateRunObservation(claim_ids=[], prohibited_behavior_flags=["bad"]),
    )
    treatment = replay.compare(case, CandidateRunObservation(claim_ids=["expected"]))
    comparison = Phase84ExperimentRunner.compare_replays(baseline, treatment)
    assert comparison.overall == "improved"
    assert comparison.fixed_metrics == ["expected_claim_ids", "prohibited_behaviors"]
    assert comparison.regressed_metrics == []

    same = Phase84ExperimentRunner.compare_replays(treatment, treatment)
    assert same.overall == "unchanged"
    assert same.fixed_metrics == []


def test_m2_runner_does_not_accept_mismatched_case_question():
    fixture = _fixture()
    case = EvaluationCase(case_id="case", question="different", provenance="synthetic_test", origin="synthetic_test")
    with SimulationStore() as store:
        with store.session() as db:
            with pytest.raises(Phase84ExperimentError, match="questions differ"):
                asyncio.run(
                    Phase84ExperimentRunner(provider_factory=lambda _: _M2Provider(treatment=False)).run(
                        db=db,
                        scenario=fixture.scenario,
                        evaluation_case=case,
                        rule_key="missing",
                        experiment_id="bad-pair",
                        as_of_date=date(2026, 9, 5),
                    )
                )


def test_m2_smoke_help_exits_before_db_or_provider(monkeypatch, capsys):
    def fail(*args, **kwargs):
        raise AssertionError("--help must not access the DB or run the experiment")

    monkeypatch.setattr(m2_smoke, "_target", fail)
    monkeypatch.setattr(m2_smoke, "load_simulation_fixture", fail)
    with pytest.raises(SystemExit) as exc_info:
        m2_smoke.main(["--help"])
    assert exc_info.value.code == 0
    assert "--live" in capsys.readouterr().out
