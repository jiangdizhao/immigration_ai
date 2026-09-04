"""Focused Phase 8.4 M1 tests; all data is temporary SQLite and synthetic."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, Matter, ReviewArtifact
from app.schemas.phase8_4_simulation import SimulationFixture
from app.services.phase7_3a_reasoning_bank import (
    CandidatePoolService,
    Phase73RuleCompilerService,
    ReasoningBankService,
    RuleFormationError,
)
from app.services.phase7_artifact_service import Phase7ArtifactService
from app.services.phase7_3b_synthetic_world import SimulationStore
from app.services.phase8_4_simulation_service import (
    Phase84SimulationError,
    Phase84SimulationService,
    default_m1_fixture_path,
    load_simulation_fixture,
)
from app.services.reasoning_bank_runtime_service import ReasoningBankRuntimeService
from app.schemas.learning import ReasoningBankRuntimeQuery


def _raw_fixture() -> dict:
    return json.loads(default_m1_fixture_path().read_text(encoding="utf-8"))


def _fixture(**updates) -> SimulationFixture:
    raw = _raw_fixture()
    raw.update(updates)
    return SimulationFixture.model_validate(raw)


def test_m1_fixture_is_strict_and_server_owned_fields_are_forbidden():
    raw = _raw_fixture()
    with pytest.raises(ValidationError):
        SimulationFixture.model_validate({**raw, "provenance": "lawyer_reviewed"})
    with pytest.raises(ValidationError):
        SimulationFixture.model_validate(
            {
                **raw,
                "scenario": {**raw["scenario"], "bank_namespace": "real"},
            }
        )
    with pytest.raises(ValidationError):
        SimulationFixture.model_validate({**raw, "unexpected": True})


def test_m1_fixture_validates_group_and_bounds_procedural_lesson():
    raw = _raw_fixture()
    raw["scenario"]["group"] = "not-a-group"
    with pytest.raises(ValidationError):
        SimulationFixture.model_validate(raw)

    raw = _raw_fixture()
    raw["synthetic_review"]["procedural_lesson"] = "x" * 8001
    with pytest.raises(ValidationError):
        SimulationFixture.model_validate(raw)


def test_m1_service_materializes_complete_isolated_lineage_and_never_commits():
    fixture = load_simulation_fixture(default_m1_fixture_path())
    with SimulationStore() as store:
        with store.session() as db:
            db.commit = lambda: pytest.fail("Phase84SimulationService must not commit")
            before = ReasoningBankService().state(db, bank_namespace="real")
            before_candidates = len(
                CandidatePoolService().list_candidates(db, bank_namespace="real")
            )
            result = Phase84SimulationService().run(db, fixture)
            db.flush()

            assert result.provider_call_count == 0
            assert db.get(Matter, result.matter_id) is not None
            assert db.get(AnswerTrace, result.answer_trace_id) is not None
            assert db.get(AnswerReview, result.review_id) is not None
            experience = db.get(ExperienceRecord, result.experience_record_id)
            assert experience is not None
            assert experience.origin == "synthetic_test"
            assert experience.snapshot_sha256 == Phase7ArtifactService.snapshot_sha256(
                experience.snapshot_json
            )

            simulation_candidates = CandidatePoolService().list_candidates(
                db, bank_namespace="simulation"
            )
            assert [item.candidate_id for item in simulation_candidates] == [result.candidate_id]
            assert CandidatePoolService().list_candidates(db, bank_namespace="real") == []

            with pytest.raises(RuleFormationError, match="missing or incompatible"):
                Phase73RuleCompilerService().build_packet(
                    db,
                    candidate_ids=[result.candidate_id],
                    bank_namespace="real",
                )

            artifacts = [db.get(ReviewArtifact, row_id) for row_id in result.disposable_ids[4:]]
            assert all(row is not None for row in artifacts)
            assert all(
                "lawyer_reviewed" not in json.dumps(row.artifact_payload)
                and "live_interaction" not in json.dumps(row.artifact_payload)
                for row in artifacts
                if row is not None
            )
            assert all(
                row.artifact_payload.get("provenance") == "synthetic_test"
                for row in artifacts
                if row is not None and "provenance" in row.artifact_payload
            )

            runtime = ReasoningBankRuntimeService(
                settings=SimpleNamespace(phase7_reasoning_bank_runtime_mode="shadow"),
                bank_service=ReasoningBankService(),
            ).retrieve(
                db,
                ReasoningBankRuntimeQuery(
                    question="operative dates version verification process",
                    compact_facts={},
                ),
            )
            assert runtime.selected_rule_keys == []
            assert runtime.bank_digest == before.bank_digest
            assert len(ReasoningBankService().list_rules(db, bank_namespace="real")) == before.current_rule_count
            assert len(CandidatePoolService().list_candidates(db, bank_namespace="real")) == before_candidates
            assert result.rule_key not in runtime.selected_rule_keys

            with pytest.raises(ValidationError):
                proposal = db.get(ReviewArtifact, result.proposal_artifact_id).artifact_payload
                from app.schemas.learning import ReasoningRuleProposal

                ReasoningRuleProposal.model_validate(
                    {**proposal, "bank_namespace": "real"}
                )

            db.rollback()

        with store.session() as db:
            assert db.get(Matter, result.matter_id) is None
            assert db.get(AnswerTrace, result.answer_trace_id) is None
            assert db.get(AnswerReview, result.review_id) is None
            assert db.get(ExperienceRecord, result.experience_record_id) is None
            assert all(db.get(ReviewArtifact, row_id) is None for row_id in result.disposable_ids[4:])
            assert ReasoningBankService().state(db, bank_namespace="real").bank_digest == before.bank_digest


def test_m1_missing_procedural_lesson_creates_no_candidate():
    raw = _raw_fixture()
    raw["synthetic_review"]["procedural_lesson"] = None
    fixture = SimulationFixture.model_validate(raw)
    with SimulationStore() as store:
        with store.session() as db:
            with pytest.raises(Phase84SimulationError, match="explicit procedural lesson"):
                Phase84SimulationService().run(db, fixture)
            assert CandidatePoolService().list_candidates(db, bank_namespace="simulation") == []
            db.rollback()


def test_m1_corrected_answer_alone_does_not_create_reasoning_candidate():
    raw = _raw_fixture()
    raw["synthetic_review"]["procedural_lesson"] = None
    raw["synthetic_review"]["corrected_answer"] = "Synthetic corrected answer only."
    fixture = SimulationFixture.model_validate(raw)
    with SimulationStore() as store:
        with store.session() as db:
            with pytest.raises(Phase84SimulationError):
                Phase84SimulationService().run(db, fixture)
            evaluations = [
                row
                for row in db.query(ReviewArtifact).all()
                if row.artifact_type == "phase7_evaluation_case"
            ]
            assert len(evaluations) == 1
            assert evaluations[0].artifact_payload["reference_answer"] == "Synthetic corrected answer only."
            assert CandidatePoolService().list_candidates(db, bank_namespace="simulation") == []
            db.rollback()


def test_m1_bad_synthetic_rule_fails_existing_quality_gate_and_does_not_persist():
    raw = _raw_fixture()
    raw["compiler_rule_draft"]["title"] = "Use https://example.test for request-m1 on 2026-09-04"
    fixture = SimulationFixture.model_validate(raw)
    with SimulationStore() as store:
        with store.session() as db:
            with pytest.raises(Phase84SimulationError, match="quality gate failed"):
                Phase84SimulationService().run(db, fixture)
            assert ReasoningBankService().list_rules(db, bank_namespace="simulation") == []
            db.rollback()


def test_m1_fixture_loader_returns_a_validated_contract():
    fixture = load_simulation_fixture(default_m1_fixture_path())
    assert fixture.scenario.group == "source"
    assert fixture.synthetic_review.procedural_lesson
