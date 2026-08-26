from __future__ import annotations

from copy import deepcopy
from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.deps import verify_lawyer_review_assertion
from app.db.base import Base
from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, ReviewArtifact
from app.schemas.learning import (
    CandidateRunObservation,
    EvaluationCase,
    ReasoningLessonCandidate,
    ReviewRecord,
    ReplayReport,
)
from app.schemas.agent import AgentClaim, AgentRuntimeRequest, AgentSubmissionV2, ExecutionBudget
from app.schemas.review import AnswerReviewCreate
from app.services.compact_checker_contract_service import build_phase6_checker_input
from app.services.evaluation_bank_service import EvaluationBankService
from app.services.phase7_artifact_service import Phase7ArtifactService
from app.services.phase7_replay_service import Phase7ReplayService
from app.services.request_evidence_registry import create_registry
from app.services.review_service import ReviewService


@pytest.fixture(autouse=True)
def forbid_configured_session_factory(monkeypatch):
    """Phase 7.2 unit tests must never fall back to real SessionLocal."""

    import app.db.session as db_module

    def forbidden_session_factory():
        raise AssertionError("Phase 7.2 tests must inject a fake session")

    monkeypatch.setattr(db_module, "SessionLocal", forbidden_session_factory)


class _FakeQuery:
    def __init__(self, session: "_FakeSession", model):
        self.session = session
        self.model = model
        self.predicates = []

    def filter(self, *predicates):
        self.predicates.extend(predicates)
        return self

    def order_by(self, *_args):
        return self

    def offset(self, _value):
        return self

    def limit(self, _value):
        return self

    def _matches(self, row, predicate):
        if hasattr(predicate, "clauses"):
            return all(self._matches(row, clause) for clause in predicate.clauses)
        key = getattr(getattr(predicate, "left", None), "key", None)
        value = getattr(getattr(predicate, "right", None), "value", None)
        return key is None or getattr(row, key, None) == value

    def all(self):
        rows = list(self.session.rows_for(self.model))
        return [row for row in rows if all(self._matches(row, item) for item in self.predicates)]

    def first(self):
        rows = self.all()
        return rows[0] if rows else None

    def one_or_none(self):
        rows = self.all()
        if len(rows) > 1:
            raise AssertionError("fake query expected at most one row")
        return rows[0] if rows else None


class _FakeSession:
    def __init__(self):
        self.rows = {AnswerReview: [], AnswerTrace: [], ExperienceRecord: [], ReviewArtifact: []}
        self.lock_requests = []

    def rows_for(self, model):
        return self.rows.setdefault(model, [])

    def query(self, model):
        self.lock_requests.append(("query", model))
        return _FakeQuery(self, model)

    def get(self, model, row_id, *, with_for_update=False):
        if with_for_update:
            self.lock_requests.append((model, row_id))
        return next((row for row in self.rows_for(model) if row.id == row_id), None)

    def add(self, row):
        if getattr(row, "id", None) is None:
            row.id = str(uuid4())
        rows = self.rows_for(type(row))
        if row not in rows:
            rows.append(row)

    def flush(self):
        for rows in self.rows.values():
            for row in rows:
                if getattr(row, "id", None) is None:
                    row.id = str(uuid4())

    def commit(self):
        return None

    def rollback(self):
        return None

    def refresh(self, _row):
        return None


def _trace(trace_id="trace-1", *, request_id="request-1"):
    return AnswerTrace(
        id=trace_id,
        matter_id="matter-1",
        session_id="session-1",
        user_message="What visa rule applies?",
        assistant_answer="The accepted answer.",
        response_language="en",
        confidence="medium",
        issue_type="visa",
        trace_json={
            "request": {"request_id": request_id},
            "agent_observability": {"request_id": request_id},
            "response": {
                "legal_reasoning_trace": {
                    "claims": [{"claim_id": "c1", "text": "A claim"}]
                }
            },
            "architecture_version": "phase7-test.v1",
        },
    )


def _experience(
    trace_id="trace-1",
    *,
    valid=True,
    origin="live_interaction",
    request_id="request-1",
):
    snapshot = {
        "request": {"original_question": "What visa rule applies?"},
        "matter": {"compact_state": {"visa_type": "test"}},
        "answer": {
            "accepted_customer_answer": "The accepted answer.",
            "claims": [{"claim_id": "c1", "text": "A claim"}],
            "claim_dependencies": [],
        },
        "system": {"architecture_version": "phase7-test.v1"},
    }
    digest = Phase7ArtifactService.snapshot_sha256(snapshot)
    return ExperienceRecord(
        id=f"experience-{trace_id}",
        answer_trace_id=trace_id,
        request_id=request_id,
        origin=origin,
        experience_schema_version="phase7.experience.v1",
        snapshot_json=snapshot,
        snapshot_sha256=digest if valid else "0" * 64,
    )


def _phase7_payload(**kwargs):
    return AnswerReviewCreate(
        reviewer_name="Authorized reviewer",
        reviewer_role="lawyer",
        rating="correct",
        severity="low",
        review_provenance="lawyer_reviewed",
        review_outcome="correct",
        **kwargs,
    )


def test_old_legacy_review_does_not_auto_materialize_learning_artifacts():
    db = _FakeSession()
    trace = _trace()
    db.add(trace)
    result = ReviewService().create_answer_review(
        db,
        trace_id=trace.id,
        payload=AnswerReviewCreate(error_categories=["wrong_legal_conclusion"], should_create_eval_case=True),
    )
    assert result is not None
    assert db.rows_for(ReviewArtifact) == []


def test_phase7_review_record_and_explicit_artifacts_are_typed_and_allowlisted():
    db = _FakeSession()
    trace = _trace()
    db.add(trace)
    result = ReviewService().create_answer_review(
        db,
        trace_id=trace.id,
        payload=_phase7_payload(
            add_to_evaluation_bank=True,
            create_reasoning_lesson_candidate=True,
            preferred_reasoning_or_research_approach="Check the decisive facts first.",
            phase7_metadata={"notes": "safe", "api_key": "must not persist"},
        ),
        trusted_lawyer_review=True,
    )
    assert result is not None
    assert {row.artifact_type for row in db.rows_for(ReviewArtifact)} == {
        "phase7_review_record",
        "phase7_evaluation_case",
        "phase7_reasoning_lesson_candidate",
    }
    review_artifact = next(row for row in db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_review_record")
    assert review_artifact.artifact_payload["provenance"] == "lawyer_reviewed"
    assert review_artifact.artifact_payload["source_review_id"] == result.id
    assert "api_key" not in str(review_artifact.artifact_payload)
    assert all(item["status"] in {"draft", "active", "skipped"} for item in result.phase7_artifacts)


def test_body_provenance_and_reviewer_identity_cannot_mint_lawyer_review():
    db = _FakeSession()
    trace = _trace()
    db.add(trace)
    result = ReviewService().create_answer_review(
        db,
        trace_id=trace.id,
        payload=_phase7_payload(add_to_evaluation_bank=True),
    )
    assert result is not None
    review_record = next(
        row for row in db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_review_record"
    )
    assert review_record.artifact_payload["provenance"] == "system_generated"
    case = next(
        row for row in db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_evaluation_case"
    )
    assert case.artifact_status == "draft"


def test_valid_private_assertion_is_the_only_lawyer_authority():
    settings = SimpleNamespace(lawyer_review_assertion_secret="independent-secret")
    assert verify_lawyer_review_assertion(settings, assertion=None) is False
    assert verify_lawyer_review_assertion(settings, assertion="wrong") is False
    assert verify_lawyer_review_assertion(settings, assertion="independent-secret") is True


def test_identical_materialization_is_idempotent_and_changed_content_versions_payload():
    db = _FakeSession()
    trace = _trace()
    db.add(trace)
    review = AnswerReview(id="review-1", answer_trace_id=trace.id, matter_id=trace.matter_id)
    db.add(review)
    options = _phase7_payload(add_to_evaluation_bank=True)
    service = Phase7ArtifactService()
    service.ensure_review_record(db, review=review, trace=trace, options=options)
    db.commit()
    first = service.materialize_evaluation_case(db, review=review, trace=trace, options=options)
    db.commit()
    second = service.materialize_evaluation_case(db, review=review, trace=trace, options=options)
    assert first.artifact is second.artifact
    assert len([row for row in db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_evaluation_case"]) == 1

    review.corrected_answer = "A lawyer-corrected answer."
    third = service.materialize_evaluation_case(db, review=review, trace=trace, options=options)
    assert third.artifact is not first.artifact
    assert first.artifact.artifact_payload["source_customer_answer"] == "The accepted answer."
    assert first.artifact.artifact_status == "superseded"
    assert third.artifact.artifact_payload["supersedes_artifact_id"] == first.artifact.id


def test_materialization_locks_parent_review_before_artifact_idempotency_query():
    db = _FakeSession()
    trace = _trace()
    db.add(trace)
    review = AnswerReview(id="review-lock", answer_trace_id=trace.id, matter_id=trace.matter_id)
    db.add(review)
    Phase7ArtifactService().ensure_review_record(
        db,
        review=review,
        trace=trace,
        options=_phase7_payload(),
        trusted_lawyer_review=True,
    )
    lock_index = db.lock_requests.index((AnswerReview, review.id))
    artifact_query_index = db.lock_requests.index(("query", ReviewArtifact))
    assert lock_index < artifact_query_index


def test_hashing_is_deterministic_and_tampering_is_rejected_on_bank_read():
    first = {"z": "Unicode é", "a": [1, None]}
    second = {"a": [1, None], "z": "Unicode é"}
    assert Phase7ArtifactService.canonical_json_bytes(first) == Phase7ArtifactService.canonical_json_bytes(second)
    assert Phase7ArtifactService.snapshot_sha256(first) == Phase7ArtifactService.snapshot_sha256(second)

    db = _FakeSession()
    trace = _trace()
    db.add(trace)
    db.add(_experience())
    ReviewService().create_answer_review(
        db,
        trace_id=trace.id,
        payload=_phase7_payload(add_to_evaluation_bank=True),
        trusted_lawyer_review=True,
    )
    bank = EvaluationBankService()
    assert len(bank.list_default_regression_cases(db)) == 1
    case = next(row for row in db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_evaluation_case")
    original_payload = deepcopy(case.artifact_payload)
    for field, value in (
        ("metadata", {"notes": "tampered"}),
        ("source_customer_answer", "tampered answer"),
        ("artifact_version", 999),
        ("canonical_payload_sha256", "0" * 64),
        ("canonical_payload_sha256", "malformed"),
    ):
        case.artifact_payload = deepcopy(original_payload)
        if field == "metadata":
            case.artifact_payload[field] = value
        else:
            case.artifact_payload[field] = value
        with pytest.raises(ValueError):
            bank.list_default_regression_cases(db)
    case.artifact_payload = original_payload
    assert len(bank.list_default_regression_cases(db)) == 1


def test_review_artifact_orm_guard_allows_status_only_and_rejects_content_changes():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        review = AnswerReview(id="orm-review", answer_trace_id="trace", matter_id="matter")
        artifact = ReviewArtifact(
            id="orm-artifact",
            answer_review_id=review.id,
            artifact_type="phase7_evaluation_case",
            artifact_payload={"canonical_payload_sha256": "0" * 64},
            artifact_status="draft",
        )
        db.add_all([review, artifact])
        db.commit()
        artifact.artifact_status = "superseded"
        db.commit()
        artifact.artifact_payload = {"canonical_payload_sha256": "1" * 64}
        with pytest.raises(ValueError, match="artifact_payload is immutable"):
            db.commit()
        db.rollback()


def test_valid_experience_record_produces_active_case_and_bad_hash_does_not():
    db = _FakeSession()
    trace = _trace()
    db.add(trace)
    db.add(_experience())
    result = ReviewService().create_answer_review(
        db,
        trace_id=trace.id,
        payload=_phase7_payload(add_to_evaluation_bank=True),
        trusted_lawyer_review=True,
    )
    case = next(row for row in db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_evaluation_case")
    assert case.artifact_status == "active"
    assert case.artifact_payload["source_integrity"] == "experience_record"
    assert result is not None

    bad_db = _FakeSession()
    bad_trace = _trace("trace-bad")
    bad_db.add(bad_trace)
    bad_db.add(_experience("trace-bad", valid=False))
    bad_result = ReviewService().create_answer_review(
        bad_db,
        trace_id=bad_trace.id,
        payload=_phase7_payload(add_to_evaluation_bank=True),
        trusted_lawyer_review=True,
    )
    assert bad_result is not None
    assert not [row for row in bad_db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_evaluation_case"]
    assert any(item["status"] == "failed" for item in bad_result.phase7_artifacts)


def test_ambiguous_experience_links_fail_closed():
    db = _FakeSession()
    trace = _trace()
    db.add(trace)
    db.add(_experience(trace.id, request_id="backend-a"))
    db.add(_experience(trace.id, request_id="backend-b"))
    result = ReviewService().create_answer_review(
        db,
        trace_id=trace.id,
        payload=_phase7_payload(add_to_evaluation_bank=True),
        trusted_lawyer_review=True,
    )
    assert result is not None
    assert not [row for row in db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_evaluation_case"]
    assert any(item["status"] == "failed" for item in result.phase7_artifacts)


def test_only_trusted_backend_request_id_can_be_fallback_linkage():
    db = _FakeSession()
    trace = _trace("trace-no-direct-match", request_id="backend-request")
    db.add(trace)
    db.add(_experience("different-trace", request_id="backend-request"))
    result = ReviewService().create_answer_review(
        db,
        trace_id=trace.id,
        payload=_phase7_payload(add_to_evaluation_bank=True),
        trusted_lawyer_review=True,
    )
    assert result is not None
    case = next(row for row in db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_evaluation_case")
    assert case.artifact_payload["source_integrity"] == "experience_record"

    client_only_db = _FakeSession()
    client_only_trace = AnswerTrace(
        id="trace-client-only",
        matter_id="matter-1",
        user_message="Question",
        assistant_answer="Answer",
        trace_json={"request": {"client_turn_id": "client-only"}},
    )
    client_only_db.add(client_only_trace)
    client_only_db.add(_experience("different-trace", request_id="client-only"))
    client_only_result = ReviewService().create_answer_review(
        client_only_db,
        trace_id=client_only_trace.id,
        payload=_phase7_payload(add_to_evaluation_bank=True),
        trusted_lawyer_review=True,
    )
    assert client_only_result is not None
    client_only_case = next(
        row
        for row in client_only_db.rows_for(ReviewArtifact)
        if row.artifact_type == "phase7_evaluation_case"
    )
    assert client_only_case.artifact_payload["source_integrity"] == "legacy_trace_only"
    assert client_only_case.artifact_status == "draft"

    ambiguous_fallback_db = _FakeSession()
    fallback_trace = _trace("trace-fallback", request_id="backend-ambiguous")
    ambiguous_fallback_db.add(fallback_trace)
    ambiguous_fallback_db.add(_experience("other-a", request_id="backend-ambiguous"))
    ambiguous_fallback_db.add(_experience("other-b", request_id="backend-ambiguous"))
    ambiguous_result = ReviewService().create_answer_review(
        ambiguous_fallback_db,
        trace_id=fallback_trace.id,
        payload=_phase7_payload(add_to_evaluation_bank=True),
        trusted_lawyer_review=True,
    )
    assert ambiguous_result is not None
    assert not [
        row
        for row in ambiguous_fallback_db.rows_for(ReviewArtifact)
        if row.artifact_type == "phase7_evaluation_case"
    ]
    assert any(item["status"] == "failed" for item in ambiguous_result.phase7_artifacts)


def test_provenance_rules_and_direct_legacy_defaults():
    with pytest.raises(ValueError, match="synthetic/manual"):
        ReviewRecord(review_id="review-1", origin="synthetic_test", provenance="lawyer_reviewed")
    assert ReviewRecord(review_id="review-2").provenance == "system_generated"
    assert ReviewRecord(review_id="review-3", provenance="user_feedback").provenance != "lawyer_reviewed"

    db = _FakeSession()
    trace = _trace()
    db.add(trace)
    result = ReviewService().create_answer_review(
        db,
        trace_id=trace.id,
        payload=AnswerReviewCreate(add_to_evaluation_bank=True, review_outcome="correct"),
    )
    assert result is not None
    case = next(row for row in db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_evaluation_case")
    assert case.artifact_status == "draft"
    assert case.artifact_payload["provenance"] == "system_generated"
    assert case.artifact_payload["source_integrity"] == "legacy_trace_only"


def test_evaluation_bank_filters_synthetic_and_revalidates_payloads():
    db = _FakeSession()
    trace = _trace()
    db.add(trace)
    db.add(_experience(origin="synthetic_test"))
    ReviewService().create_answer_review(
        db,
        trace_id=trace.id,
        payload=AnswerReviewCreate(
            review_provenance="synthetic_test",
            review_origin="synthetic_test",
            review_outcome="correct",
            add_to_evaluation_bank=True,
        ),
    )
    bank = EvaluationBankService()
    assert bank.list_cases(db) == []
    assert len(bank.list_cases(db, artifact_status="active", provenance="synthetic_test", include_synthetic=True)) == 1

    malformed = ReviewArtifact(
        id="malformed",
        answer_review_id="review-malformed",
        artifact_type="phase7_evaluation_case",
        artifact_payload={"case_id": "bad"},
        artifact_status="active",
    )
    db.add(malformed)
    with pytest.raises(ValueError, match="Malformed evaluation artifact"):
        bank.list_cases(db, artifact_status="active", provenance=None, include_synthetic=True)


def test_default_regression_bank_requires_active_lawyer_reviewed_non_synthetic_cases():
    db = _FakeSession()
    trace = _trace()
    db.add(trace)
    db.add(_experience())
    ReviewService().create_answer_review(
        db,
        trace_id=trace.id,
        payload=_phase7_payload(add_to_evaluation_bank=True),
        trusted_lawyer_review=True,
    )
    original = next(
        row for row in db.rows_for(ReviewArtifact) if row.artifact_type == "phase7_evaluation_case"
    )
    variants = (
        ("draft", "lawyer_reviewed", "live_interaction"),
        ("active", "system_generated", "live_interaction"),
        ("active", "synthetic_test", "synthetic_test"),
    )
    for index, (status, provenance, origin) in enumerate(variants):
        payload = deepcopy(original.artifact_payload)
        payload["case_id"] = f"variant-{index}"
        payload["provenance"] = provenance
        payload["origin"] = origin
        payload["canonical_payload_sha256"] = None
        payload["canonical_payload_sha256"] = Phase7ArtifactService.payload_hash(payload)
        db.add(
            ReviewArtifact(
                id=f"variant-artifact-{index}",
                answer_review_id=original.answer_review_id,
                artifact_type="phase7_evaluation_case",
                artifact_payload=payload,
                artifact_status=status,
            )
        )

    default_cases = EvaluationBankService().list_default_regression_cases(db)
    assert [item["case"]["case_id"] for item in default_cases] == [original.artifact_payload["case_id"]]
    assert all(item["eligible_for_default_regression"] for item in default_cases)
    synthetic_cases = EvaluationBankService().list_cases(
        db,
        artifact_status="active",
        provenance="synthetic_test",
        include_synthetic=True,
    )
    assert [item["case"]["case_id"] for item in synthetic_cases] == ["variant-2"]


@pytest.mark.parametrize(
    ("outcome", "expected"),
    [("PASS", "PASS"), ("FAIL", "FAIL"), ("NOT_SCORED", "NOT_SCORED")],
)
def test_replay_is_deterministic_and_provider_free(outcome, expected):
    case = EvaluationCase(
        case_id="case-1",
        source_review_id="review-1",
        provenance="lawyer_reviewed",
        origin="live_interaction",
        review_outcome="correct",
        question="Question",
        expected_checker_behavior={"outcome": "KEEP"} if outcome != "NOT_SCORED" else {},
    )
    observation = CandidateRunObservation(
        checker_outcome="KEEP" if outcome == "PASS" else "BLOCK" if outcome == "FAIL" else None
    )
    report = Phase7ReplayService().compare(case, observation)
    assert isinstance(report, ReplayReport)
    assert report.overall_result == expected


def test_positive_false_block_is_scored_independently_of_expected_checker_behavior():
    case = EvaluationCase(
        case_id="positive-case",
        provenance="lawyer_reviewed",
        origin="live_interaction",
        review_outcome="correct",
        question="Question",
        expected_checker_behavior={"outcome": "BLOCK"},
    )
    report = Phase7ReplayService().compare(
        case,
        CandidateRunObservation(checker_outcome="BLOCK"),
    )
    metrics = {item.metric: item.result for item in report.per_metric_results}
    assert metrics["false_block_on_positive_case"] == "FAIL"
    assert metrics["checker_behavior"] == "PASS"
    assert report.overall_result == "FAIL"


def test_learning_contracts_cannot_be_evidence_or_phase6_input():
    with pytest.raises(ValueError):
        EvaluationCase(
            case_id="case-1",
            source_review_id="review-1",
            question="Question",
            evidence_ref="must-not-be-accepted",
        )
    assert "RequestEvidenceRegistry" not in EvaluationCase.model_fields


def test_real_phase6_packet_builder_has_no_phase7_artifact_input_path():
    review_record = ReviewRecord(review_id="review-not-input")
    evaluation_case = EvaluationCase(case_id="case-not-input", question="Question")
    lesson = ReasoningLessonCandidate(candidate_id="lesson-not-input", lesson_text="Strategy")
    artifact = ReviewArtifact(
        id="artifact-not-input",
        answer_review_id="review-not-input",
        artifact_type="phase7_review_record",
        artifact_payload=review_record.model_dump(mode="json"),
        artifact_status="active",
    )
    request = AgentRuntimeRequest(
        request_id="runtime-request",
        turn_id="turn-1",
        mode="default",
        user_text="Question",
        response_language="en",
        as_of_date=date(2026, 8, 26),
        matter_state={"confirmed_fact": "value"},
        execution_budget=ExecutionBudget(
            turn_deadline_ms=10000,
            answer_research_target_ms=7000,
            checker_target_ms=2000,
        ),
        experiment_arm="L",
    )
    submission = AgentSubmissionV2(
        schema_version="agent_submission.v2",
        answer_class="substantive_legal",
        draft_markdown="A claim",
        research_status="complete",
        claims=[
            AgentClaim(
                claim_id="claim-1",
                claim_type="legal_rule",
                materiality="decisive",
                text="A claim",
                draft_start=0,
                draft_end=len("A claim"),
            )
        ],
    )
    registry = create_registry(request.request_id)
    packet = build_phase6_checker_input(
        request=request,
        submission=submission,
        registry=registry,
    )
    packet_text = str(packet.model_dump(mode="json"))
    assert packet.evidence == []
    assert "phase7.review.v1" not in packet_text
    assert evaluation_case.case_id not in packet_text
    assert lesson.candidate_id not in packet_text
    assert artifact.id not in packet_text
