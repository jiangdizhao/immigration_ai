from types import SimpleNamespace

from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, Phase8LearningBridgeReceipt
from app.schemas.review import Phase8LearningBridgeRequest
from app.services.phase7_artifact_service import Phase7ArtifactService
from app.services.phase8_learning_bridge_service import Phase8LearningBridgeService


class Query:
    def __init__(self, session, model):
        self.session = session
        self.model = model
        self.predicates = []

    def filter(self, *predicates):
        self.predicates.extend(predicates)
        return self

    def with_for_update(self):
        return self

    def order_by(self, *_args):
        return self

    def _matches(self, row, predicate):
        if hasattr(predicate, "clauses"):
            return all(self._matches(row, item) for item in predicate.clauses)
        key = getattr(getattr(predicate, "left", None), "key", None)
        value = getattr(getattr(predicate, "right", None), "value", None)
        return key is None or getattr(row, key, None) == value

    def all(self):
        return [
            row
            for row in self.session.rows.get(self.model, [])
            if all(self._matches(row, predicate) for predicate in self.predicates)
        ]

    def one_or_none(self):
        rows = self.all()
        assert len(rows) <= 1
        return rows[0] if rows else None


class Session:
    def __init__(self):
        self.rows = {}

    def query(self, model):
        return Query(self, model)

    def get(self, model, row_id, **_kwargs):
        return next((row for row in self.rows.get(model, []) if row.id == row_id), None)

    def add(self, row):
        self.rows.setdefault(type(row), []).append(row)

    def flush(self):
        return None

    def commit(self):
        return None

    def rollback(self):
        return None

    def refresh(self, _row):
        return None


class Artifacts:
    snapshot_sha256 = staticmethod(Phase7ArtifactService.snapshot_sha256)

    def __init__(self):
        self.options = []

    def materialize_requested(self, db, *, review, **kwargs):
        self.options.append(kwargs["options"])
        review_record = SimpleNamespace(id="review-record")
        evaluation = SimpleNamespace(id="evaluation")
        lesson = (
            SimpleNamespace(id="lesson")
            if kwargs["options"].create_reasoning_lesson_candidate
            else None
        )
        return {
            "phase7_review_record": SimpleNamespace(artifact=review_record, status="active"),
            "phase7_evaluation_case": SimpleNamespace(artifact=evaluation, status="active"),
            "phase7_reasoning_lesson_candidate": SimpleNamespace(
                artifact=lesson, status="draft" if lesson else "skipped"
            ),
        }


def trace_and_experience():
    trace = AnswerTrace(id="trace-1", matter_id="matter-1", assistant_answer="Original")
    snapshot = {"request": {"original_question": "Question"}, "answer": {"accepted_customer_answer": "Original"}}
    experience = ExperienceRecord(
        id="experience-1",
        answer_trace_id=trace.id,
        origin="live_interaction",
        experience_schema_version="phase7.experience.v1",
        snapshot_json=snapshot,
        snapshot_sha256=Phase7ArtifactService.snapshot_sha256(snapshot),
    )
    return trace, experience


def payload(**overrides):
    values = {
        "phase8_request_id": "request-1",
        "answer_trace_id": "trace-1",
        "acting_staff_role": "lawyer",
        "reviewer_id": "lawyer-1",
        "outcome": "confirmed",
    }
    values.update(overrides)
    return Phase8LearningBridgeRequest(**values)


def test_confirmed_bridge_is_idempotent_and_does_not_create_lesson_by_default():
    db = Session()
    trace, experience = trace_and_experience()
    db.add(trace)
    db.add(experience)
    artifacts = Artifacts()
    service = Phase8LearningBridgeService(artifacts)

    first = service.materialize(db, payload=payload(), trusted_lawyer_review=True)
    second = service.materialize(db, payload=payload(), trusted_lawyer_review=True)

    assert first["status"] == second["status"] == "completed"
    assert first["answer_review_id"] == second["answer_review_id"]
    assert first["evaluation_artifact_id"] == "evaluation"
    assert first["lesson_artifact_id"] is None
    assert len(db.rows[AnswerReview]) == 1


def test_missing_experience_fails_closed_and_explicit_strategy_is_the_only_lesson_input():
    db = Session()
    trace, _experience = trace_and_experience()
    db.add(trace)
    service = Phase8LearningBridgeService(Artifacts())
    blocked = service.materialize(db, payload=payload(), trusted_lawyer_review=True)
    assert blocked["status"] == "blocked_missing_experience"
    assert db.rows.get(AnswerReview, []) == []

    db = Session()
    trace, experience = trace_and_experience()
    db.add(trace)
    db.add(experience)
    artifacts = Artifacts()
    corrected = Phase8LearningBridgeService(artifacts)
    result = corrected.materialize(
        db,
        payload=payload(
            phase8_request_id="request-2",
            outcome="corrected",
            corrected_answer="Corrected reference",
            lawyer_comment="Review comment",
            preferred_reasoning_or_research_approach="Check the decisive facts first.",
            create_reasoning_lesson_candidate=True,
        ),
        trusted_lawyer_review=True,
    )
    assert result["status"] == "completed"
    assert result["lesson_artifact_id"] == "lesson"
    assert "Corrected reference" not in artifacts.options[0].preferred_reasoning_or_research_approach


def test_bridge_preserves_authoritative_source_mode_from_experience_snapshot():
    db = Session()
    trace, experience = trace_and_experience()
    experience.snapshot_json["request"]["assistant_mode"] = "premium_direct_gpt55_high"
    experience.snapshot_sha256 = Phase7ArtifactService.snapshot_sha256(
        experience.snapshot_json
    )
    db.add(trace)
    db.add(experience)
    artifacts = Artifacts()

    result = Phase8LearningBridgeService(artifacts).materialize(
        db, payload=payload(), trusted_lawyer_review=True
    )

    assert result["status"] == "completed"
    assert artifacts.options[0].phase7_metadata["source_assistant_mode"] == (
        "premium_direct_gpt55_high"
    )


def test_untrusted_bridge_cannot_create_a_review():
    db = Session()
    try:
        Phase8LearningBridgeService().materialize(
            db, payload=payload(), trusted_lawyer_review=False
        )
    except PermissionError:
        pass
    else:
        raise AssertionError("untrusted bridge unexpectedly succeeded")
    assert db.rows.get(Phase8LearningBridgeReceipt, []) == []
