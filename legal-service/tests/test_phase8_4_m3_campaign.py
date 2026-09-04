"""Focused Phase 8.4 M3 campaign tests; all providers are deterministic."""

from __future__ import annotations

import asyncio
from datetime import date
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

import scripts.phase8_4_m3_campaign_smoke as m3_smoke
from app.db.models import ExperienceRecord
from app.schemas.phase8_4_campaign import (
    Phase84CampaignFixture,
    SimulationValidationReport,
)
from app.services.phase7_3a_reasoning_bank import CandidatePoolService, ReasoningBankService
from app.services.phase7_3b_synthetic_world import SimulationStore
from app.services.reasoning_bank_runtime_service import ReasoningBankRuntimeService
from app.services.phase8_4_campaign_service import (
    Phase84CampaignService,
    default_m3_campaign_path,
    load_campaign_fixture,
)
from app.services.phase8_4_simulation_service import Phase84SimulationService
from scripts.phase8_4_m3_campaign_smoke import ScriptedM3Provider


def _fixture():
    return load_campaign_fixture(default_m3_campaign_path())


def _provider_factory(candidate, scenario, arm):
    return ScriptedM3Provider(
        candidate_id=candidate.candidate_campaign_id,
        scenario=scenario,
        treatment=arm == "treatment",
    )


def test_m3_fixture_contract_is_strict_and_has_five_candidates_35_cases():
    fixture = _fixture()
    assert len(fixture.candidates) == 5
    assert sum(len(candidate.scenarios) for candidate in fixture.candidates) == 35
    raw = fixture.model_dump(mode="json")
    raw["unexpected"] = True
    with pytest.raises(ValidationError):
        Phase84CampaignFixture.model_validate(raw)

    raw = fixture.model_dump(mode="json")
    raw["candidates"][0]["scenarios"][0]["group"] = "invalid"
    with pytest.raises(ValidationError):
        Phase84CampaignFixture.model_validate(raw)

    raw = fixture.model_dump(mode="json")
    raw["source_fixtures"][0]["fixture"]["provenance"] = "lawyer_reviewed"
    with pytest.raises(ValidationError):
        Phase84CampaignFixture.model_validate(raw)


def test_m3_campaign_reuses_m1_m2_and_aggregates_all_groups_without_commit():
    fixture = _fixture()
    with SimulationStore() as store:
        with store.session() as db:
            before_real = ReasoningBankService().state(db, bank_namespace="real")
            before_experiences = db.query(ExperienceRecord).count()
            before_candidates = len(CandidatePoolService().list_candidates(db, bank_namespace="real"))
            db.commit = lambda: pytest.fail("M3 campaign must not commit")
            run = asyncio.run(
                Phase84CampaignService().run(
                    db=db,
                    fixture=fixture,
                    provider_factory=_provider_factory,
                    as_of_date=date(2026, 9, 5),
                )
            )
            assert len(run.reports) == 5
            assert len(run.scenario_results) == 35
            assert run.provider_api_call_count == 70
            labels = {report.final_label for report in run.reports}
            assert labels == {
                "simulation_promising",
                "simulation_inconclusive",
                "simulation_regression",
            }
            assert sum(report.final_label == "simulation_promising" for report in run.reports) == 2
            assert sum(report.final_label == "simulation_inconclusive" for report in run.reports) == 2
            assert sum(report.final_label == "simulation_regression" for report in run.reports) == 1
            for report in run.reports:
                assert report.total_cases == 7
                assert report.source_summary.total == 1
                assert report.transfer_summary.total == 2
                assert report.negative_control_summary.total == 2
                assert report.control_summary.total == 2
            c1 = next(report for report in run.reports if report.candidate_campaign_id == "m3-c1-dates")
            c2 = next(report for report in run.reports if report.candidate_campaign_id == "m3-c2-applicability")
            c3 = next(report for report in run.reports if report.candidate_campaign_id == "m3-c3-authority")
            c4 = next(report for report in run.reports if report.candidate_campaign_id == "m3-c4-locator")
            assert c1.final_label == "simulation_promising"
            assert c2.final_label == "simulation_inconclusive"
            assert c3.final_label == "simulation_regression"
            assert c4.final_label == "simulation_inconclusive"
            assert c4.source_summary.improved == 1
            assert c4.transfer_summary.unchanged == 2
            assert c3.control_summary.regressed == 2
            assert ReasoningBankService().state(db, bank_namespace="real").bank_digest == before_real.bank_digest
            assert len(CandidatePoolService().list_candidates(db, bank_namespace="real")) == before_candidates
            assert db.query(ExperienceRecord).count() == before_experiences + 5
            db.rollback()

        with store.session() as db:
            assert db.query(ExperienceRecord).count() == before_experiences
            assert ReasoningBankService().state(db, bank_namespace="real").bank_digest == before_real.bank_digest


def test_m3_report_labels_are_restricted_and_invalid_integrity_is_distinct():
    with pytest.raises(ValidationError):
        SimulationValidationReport(
            candidate_campaign_id="c",
            final_label="not-a-label",
        )

    report = SimulationValidationReport(
        candidate_campaign_id="c",
        final_label="simulation_invalid",
        reason_codes=["model_mismatch"],
    )
    assert report.final_label == "simulation_invalid"


def test_m3_existing_quality_gate_rejects_case_specific_and_substantive_rules():
    fixture = _fixture()
    for residue_field, residue in (
        ("source_specific_residue", ["request_12345"]),
        ("legal_proposition_residue", ["This rule establishes a legal entitlement."]),
    ):
        raw = fixture.source_fixtures[0].fixture.model_dump(mode="json")
        raw["compiler_rule_draft"][residue_field] = residue
        from app.schemas.phase8_4_simulation import SimulationFixture

        invalid = SimulationFixture.model_validate(raw)
        with SimulationStore() as store:
            with store.session() as db:
                with pytest.raises(ValueError, match="quality gate failed"):
                    Phase84SimulationService().run(db, invalid)


def test_m3_production_runtime_stays_real_namespace_only():
    fixture = _fixture()
    with SimulationStore() as store:
        with store.session() as db:
            simulation = Phase84SimulationService().run(db, fixture.source_fixtures[0].fixture)
            runtime = ReasoningBankRuntimeService(
                settings=SimpleNamespace(
                    phase7_reasoning_bank_runtime_mode="shadow",
                    phase7_reasoning_bank_max_rules=150,
                    phase7_reasoning_bank_max_rules_per_type=50,
                ),
            )
            from app.schemas.learning import ReasoningBankRuntimeQuery

            result = runtime.retrieve(
                db,
                ReasoningBankRuntimeQuery(question="process", compact_facts={}),
            )
            assert result.bank_namespace == "real"
            assert simulation.rule_key not in result.selected_rule_keys
            db.rollback()


def test_m3_smoke_help_exits_before_db_or_provider(monkeypatch, capsys):
    def fail(*args, **kwargs):
        raise AssertionError("--help must not access the DB or run the campaign")

    monkeypatch.setattr(m3_smoke, "_target", fail)
    monkeypatch.setattr(m3_smoke, "load_campaign_fixture", fail)
    with pytest.raises(SystemExit) as exc_info:
        m3_smoke.main(["--help"])
    assert exc_info.value.code == 0
    assert "--live" in capsys.readouterr().out
