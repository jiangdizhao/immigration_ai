"""Deterministic Phase 8.4 M1 synthetic feedback loop.

This service is an offline control-plane orchestrator.  It deliberately does
not commit, call providers, or expose simulation artifacts to the real bank.
The caller owns the transaction and should normally roll it back.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy.orm import Session

from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, Matter, ReviewArtifact
from app.schemas.learning import (
    EvaluationCase,
    ExperienceSnapshot,
    ReasoningLessonCandidate,
    RuleCompilerOutput,
    RuleCompilerProposalDraft,
)
from app.schemas.phase8_4_simulation import SimulationFixture
from app.services.phase7_3a_reasoning_bank import (
    Phase73RuleCompilerService,
    ReasoningBankManager,
    RuleFormationError,
)
from app.services.phase7_artifact_service import Phase7ArtifactService


class Phase84SimulationError(ValueError):
    """A deterministic M1 simulation could not be safely materialized."""


@dataclass(frozen=True)
class Phase84SimulationResult:
    scenario_id: str
    matter_id: str
    answer_trace_id: str
    review_id: str
    experience_record_id: str
    review_artifact_id: str
    evaluation_artifact_id: str
    lesson_artifact_id: str | None
    candidate_id: str | None
    packet_id: str
    proposal_artifact_id: str
    proposal_id: str
    decision_artifact_id: str
    rule_artifact_id: str
    rule_key: str
    provider_call_count: int = 0

    @property
    def disposable_ids(self) -> tuple[str, ...]:
        return (
            self.matter_id,
            self.answer_trace_id,
            self.review_id,
            self.experience_record_id,
            self.review_artifact_id,
            self.evaluation_artifact_id,
            *(([self.lesson_artifact_id]) if self.lesson_artifact_id else []),
            self.proposal_artifact_id,
            self.decision_artifact_id,
            self.rule_artifact_id,
        )


class Phase84SimulationService:
    """Build one complete, synthetic, rollback-scoped learning lineage."""

    def __init__(
        self,
        *,
        artifact_service: Phase7ArtifactService | None = None,
        compiler_service: Phase73RuleCompilerService | None = None,
        bank_manager: ReasoningBankManager | None = None,
    ) -> None:
        self.artifact_service = artifact_service or Phase7ArtifactService()
        self.compiler_service = compiler_service or Phase73RuleCompilerService()
        self.bank_manager = bank_manager or ReasoningBankManager()

    def run(self, db: Session, fixture: SimulationFixture) -> Phase84SimulationResult:
        if not isinstance(fixture, SimulationFixture):
            raise Phase84SimulationError("run requires a validated SimulationFixture")

        scenario = fixture.scenario
        ids = {
            kind: self._id(scenario.scenario_id, kind)
            for kind in ("matter", "trace", "review", "experience")
        }
        self._require_absent(db, Matter, ids["matter"])
        self._require_absent(db, AnswerTrace, ids["trace"])
        self._require_absent(db, AnswerReview, ids["review"])
        self._require_absent(db, ExperienceRecord, ids["experience"])

        matter = Matter(
            id=ids["matter"],
            session_id=f"phase84-m1-{scenario.scenario_id}",
            issue_summary=scenario.question,
            issue_type="synthetic_process",
            status="open",
            metadata_json={
                "phase": "8.4-m1",
                "scenario_id": scenario.scenario_id,
                "simulation": True,
            },
        )
        trace = AnswerTrace(
            id=ids["trace"],
            matter_id=matter.id,
            session_id=matter.session_id,
            turn_index=1,
            user_message=scenario.question,
            assistant_answer=fixture.synthetic_source_answer,
            response_language="en",
            confidence="synthetic",
            issue_type="synthetic_process",
            review_status="unreviewed",
            trace_json={
                "phase": "8.4-m1",
                "scenario_id": scenario.scenario_id,
                "synthetic": True,
                "expected_claim_ids": list(scenario.expected_claim_ids),
                "prohibited_claim_ids": list(scenario.prohibited_claim_ids),
            },
        )
        review = AnswerReview(
            id=ids["review"],
            answer_trace_id=trace.id,
            matter_id=matter.id,
            reviewer_name="phase84-m1-synthetic-reviewer",
            reviewer_role="simulation",
            rating="synthetic_fixture",
            severity="low",
            error_categories=list(fixture.synthetic_review.error_categories),
            corrected_answer=fixture.synthetic_review.corrected_answer,
            lesson_candidate=fixture.synthetic_review.procedural_lesson,
            should_create_eval_case=True,
            should_create_lesson=bool(fixture.synthetic_review.procedural_lesson),
            review_status="submitted",
        )
        snapshot = self._snapshot(fixture, ids["experience"])
        experience = ExperienceRecord(
            id=ids["experience"],
            experience_schema_version=snapshot.schema_version,
            request_id=f"phase84-m1-{scenario.scenario_id}",
            matter_id=matter.id,
            session_id=matter.session_id,
            answer_trace_id=trace.id,
            origin="synthetic_test",
            snapshot_json=snapshot.model_dump(mode="json"),
            snapshot_sha256=Phase7ArtifactService.snapshot_sha256(snapshot.model_dump(mode="json")),
        )
        for row in (matter, trace, review, experience):
            db.add(row)
        db.flush()

        options = self._artifact_options(fixture)
        review_result = self.artifact_service.ensure_review_record(
            db,
            review=review,
            trace=trace,
            options=options,
            trusted_lawyer_review=False,
        )
        db.flush()
        evaluation_result = self.artifact_service.materialize_evaluation_case(
            db,
            review=review,
            trace=trace,
            options=options,
            trusted_lawyer_review=False,
        )
        db.flush()
        lesson_result = None
        if options.create_reasoning_lesson_candidate:
            lesson_result = self.artifact_service.materialize_lesson_candidate(
                db,
                review=review,
                trace=trace,
                options=options,
                trusted_lawyer_review=False,
            )
            db.flush()

        review_artifact = self._require_artifact(review_result.artifact, "review record")
        evaluation_artifact = self._require_artifact(evaluation_result.artifact, "evaluation case")
        lesson_artifact = lesson_result.artifact if lesson_result is not None else None
        evaluation_case = EvaluationCase.model_validate(evaluation_artifact.artifact_payload)
        candidate = (
            ReasoningLessonCandidate.model_validate(lesson_artifact.artifact_payload)
            if lesson_artifact is not None
            else None
        )
        self._assert_synthetic_lineage(evaluation_case, candidate)

        packet = self.compiler_service.build_packet(
            db,
            candidate_ids=[candidate.candidate_id] if candidate else [],
            bank_namespace="simulation",
        )
        if candidate is None:
            raise Phase84SimulationError("M1 fixture must contain an explicit procedural lesson")
        draft = RuleCompilerProposalDraft(
            **fixture.compiler_rule_draft.model_dump(mode="json"),
            supporting_evaluation_case_ids=[evaluation_case.case_id],
        )
        compiler_output = RuleCompilerOutput(
            output_id=f"phase84-m1-output-{scenario.scenario_id}",
            packet_id=packet.packet_id,
            proposals=[draft],
        )
        try:
            proposal_artifacts = self.compiler_service.create_proposals_from_output(
                db,
                source_candidate_ids=[candidate.candidate_id],
                compiler_output=compiler_output,
                namespace="simulation",
                trusted_lawyer_review=False,
            )
            db.flush()
            proposal_artifact = self._require_artifact(proposal_artifacts[0], "simulation proposal")
            proposal_id = proposal_artifact.artifact_payload["proposal_id"]
            rule = self.bank_manager.approve_new(
                db,
                proposal_id,
                decided_by="phase84-m1-simulation",
                trusted_lawyer_review=False,
                case_erasure_confirmed=True,
                procedural_only_confirmed=True,
                decision_reason_code="phase84_m1_smoke",
            )
            db.flush()
        except (IndexError, KeyError, RuleFormationError) as exc:
            raise Phase84SimulationError(str(exc)) from exc

        proposal_row = proposal_artifact
        decision_row = self._latest_artifact_for_anchor(db, "phase7_reasoning_rule_decision", review.id)
        rule_row = self._latest_artifact_for_anchor(db, "phase7_reasoning_lesson", review.id)
        self._assert_rule_lineage(rule)
        if decision_row is None or rule_row is None:
            raise Phase84SimulationError("simulation governance did not materialize decision and rule")
        return Phase84SimulationResult(
            scenario_id=scenario.scenario_id,
            matter_id=matter.id,
            answer_trace_id=trace.id,
            review_id=review.id,
            experience_record_id=experience.id,
            review_artifact_id=review_artifact.id,
            evaluation_artifact_id=evaluation_artifact.id,
            lesson_artifact_id=lesson_artifact.id if lesson_artifact else None,
            candidate_id=candidate.candidate_id if candidate else None,
            packet_id=packet.packet_id,
            proposal_artifact_id=proposal_row.id,
            proposal_id=proposal_id,
            decision_artifact_id=decision_row.id,
            rule_artifact_id=rule_row.id,
            rule_key=rule.rule_key,
        )

    @staticmethod
    def _snapshot(fixture: SimulationFixture, experience_id: str) -> ExperienceSnapshot:
        scenario = fixture.scenario
        claims = [
            {"claim_id": claim_id, "text": "Synthetic claim placeholder; not legal authority."}
            for claim_id in scenario.expected_claim_ids
        ]
        return ExperienceSnapshot(
            request={
                "request_id": f"phase84-m1-{scenario.scenario_id}",
                "original_question": scenario.question,
                "assistant_mode": "synthetic_offline",
                "client_turn_id": experience_id,
            },
            matter={
                "scenario_id": scenario.scenario_id,
                "group": scenario.group,
                "facts": dict(scenario.facts),
            },
            answer={
                "accepted_customer_answer": fixture.synthetic_source_answer,
                "claims": claims,
                "claim_dependencies": [],
            },
            research={},
            evidence={},
            phase6={},
            system={
                "architecture_version": "phase8.4-m1.synthetic.v1",
                "simulation": True,
            },
            provenance={"origin": "synthetic_test", "notice": "not legal authority"},
        )

    @staticmethod
    def _artifact_options(fixture: SimulationFixture) -> SimpleNamespace:
        scenario = fixture.scenario
        review = fixture.synthetic_review
        return SimpleNamespace(
            review_origin="synthetic_test",
            review_provenance="synthetic_test",
            review_outcome=review.review_outcome,
            add_to_evaluation_bank=True,
            create_reasoning_lesson_candidate=bool(review.procedural_lesson),
            preferred_reasoning_or_research_approach=review.procedural_lesson,
            affected_claim_ids=list(scenario.expected_claim_ids),
            expected_claim_ids=list(scenario.expected_claim_ids),
            prohibited_claim_ids=list(scenario.prohibited_claim_ids),
            expected_evidence_characteristics=dict(review.expected_evidence_characteristics),
            expected_checker_behavior=dict(review.expected_checker_behavior),
            prohibited_behaviors=list(scenario.prohibited_behaviors),
            max_latency_ms=None,
            max_tool_calls=None,
            tags=["phase8.4", "m1", scenario.group],
            phase7_metadata={
                "evaluation_name": "phase8.4_m1_synthetic",
                "source_system": "phase84_simulation",
                "source_assistant_mode": "synthetic_offline",
                "scope_applicability": {"topic": "synthetic_process", "phase": "8.4-m1"},
            },
        )

    @staticmethod
    def _assert_synthetic_lineage(
        evaluation_case: EvaluationCase, candidate: ReasoningLessonCandidate | None
    ) -> None:
        if evaluation_case.provenance != "synthetic_test" or evaluation_case.origin != "synthetic_test":
            raise Phase84SimulationError("evaluation case escaped synthetic provenance")
        if candidate is not None and (
            candidate.provenance != "synthetic_test" or candidate.origin != "synthetic_test"
        ):
            raise Phase84SimulationError("lesson candidate escaped synthetic provenance")

    @staticmethod
    def _assert_rule_lineage(rule: Any) -> None:
        if (
            rule.bank_namespace != "simulation"
            or rule.provenance != "synthetic_test"
            or rule.origin != "synthetic_test"
            or rule.lifecycle != "approved"
            or rule.approval_mode != "simulation_offline"
        ):
            raise Phase84SimulationError("simulation governance produced invalid rule lineage")

    @staticmethod
    def _require_artifact(artifact: ReviewArtifact | None, label: str) -> ReviewArtifact:
        if artifact is None:
            raise Phase84SimulationError(f"missing {label} artifact")
        return artifact

    @staticmethod
    def _require_absent(db: Session, model: Any, row_id: str) -> None:
        if db.get(model, row_id) is not None:
            raise Phase84SimulationError(f"disposable {model.__name__} ID already exists")

    @staticmethod
    def _latest_artifact_for_anchor(
        db: Session, artifact_type: str, answer_review_id: str
    ) -> ReviewArtifact | None:
        rows = (
            db.query(ReviewArtifact)
            .filter(
                ReviewArtifact.artifact_type == artifact_type,
                ReviewArtifact.answer_review_id == answer_review_id,
            )
            .order_by(ReviewArtifact.created_at.desc())
            .all()
        )
        return rows[-1] if rows else None

    @staticmethod
    def _id(scenario_id: str, kind: str) -> str:
        return str(uuid5(NAMESPACE_URL, f"phase8.4-m1:{scenario_id}:{kind}"))


def load_simulation_fixture(path: str | Path) -> SimulationFixture:
    fixture_path = Path(path)
    try:
        raw = json.loads(fixture_path.read_text(encoding="utf-8"))
        return SimulationFixture.model_validate(raw)
    except Exception as exc:
        if isinstance(exc, Phase84SimulationError):
            raise
        raise Phase84SimulationError(f"invalid simulation fixture: {fixture_path}") from exc


def default_m1_fixture_path() -> Path:
    return Path(__file__).resolve().parents[2] / "simulations" / "phase8_4" / "m1_fixtures.json"


__all__ = [
    "Phase84SimulationError",
    "Phase84SimulationResult",
    "Phase84SimulationService",
    "default_m1_fixture_path",
    "load_simulation_fixture",
]
