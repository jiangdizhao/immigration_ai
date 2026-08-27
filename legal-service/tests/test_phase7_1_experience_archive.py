from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.schemas.learning import (
    EvaluationCase,
    ReasoningLesson,
    ReasoningLessonCandidate,
    ReviewRecord,
)
from app.schemas.query import QueryRequest, QueryResponse
from app.db.models import ExperienceRecord
from app.services.experience_archive_service import ExperienceArchiveService
from app.services.review_trace_service import ReviewTraceService


@pytest.fixture(autouse=True)
def _forbid_real_archive_session_factory(monkeypatch):
    """Phase 7.1 unit tests must inject a deterministic archive DB boundary."""

    import app.services.experience_archive_service as archive_module

    def forbidden_session_factory():
        raise AssertionError(
            "Phase 7.1 tests must inject a fake ExperienceArchiveService session_factory"
        )

    monkeypatch.setattr(archive_module, "SessionLocal", forbidden_session_factory)


class _Query:
    def __init__(self, records):
        self.records = records

    def filter(self, expression):
        self.expression = expression
        return self

    def one_or_none(self):
        # The fake only needs the request-id lookup used by the writer.
        request_id = getattr(self.expression.right, "value", None)
        return next((item for item in self.records if item.request_id == request_id), None)


class _Session:
    records = []
    fail = False

    def __enter__(self):
        if self.fail:
            raise RuntimeError("archive database unavailable")
        return self

    def __exit__(self, *_args):
        return False

    def query(self, _model):
        return _Query(self.records)

    def add(self, record):
        self.records.append(record)

    def commit(self):
        return None

    def rollback(self):
        return None


def _settings(enabled: bool = True):
    return SimpleNamespace(
        phase7_experience_archive_enabled=enabled,
        compact_checker_enabled=False,
    )


def _response(answer="The accepted answer.", **debug):
    return QueryResponse(
        matter_id="matter-1",
        answer=answer,
        response_language="en",
        confidence="medium",
        next_action="answer",
        retrieval_debug=debug,
    )


def _payload(mode="default_legal_pipeline"):
    return QueryRequest(
        question="What visa rule applies?",
        assistant_mode=mode,
        session_id="session-1",
        client_turn_id="client-turn-1",
    )


def test_snapshot_schema_and_hash_are_canonical_and_serializable():
    service = ExperienceArchiveService(settings=_settings())
    first = service.build_snapshot(
        payload=_payload(),
        response=_response(),
        request_id="request-1",
    )
    second = first.model_copy(deep=True)
    second.answer = {"accepted_customer_answer": "The accepted answer.", "confidence": "medium"}
    # Hashing is based on canonical JSON rather than dict insertion order.
    assert first.schema_version == "phase7.experience.v1"
    assert service.snapshot_sha256({"b": 2, "a": 1}) == service.snapshot_sha256({"a": 1, "b": 2})
    assert isinstance(first.model_dump(mode="json"), dict)
    assert service.snapshot_sha256(first) != service.snapshot_sha256(second)


def test_enabled_archive_is_idempotent_and_does_not_rewrite_snapshot():
    _Session.records = []
    service = ExperienceArchiveService(session_factory=_Session, settings=_settings())
    first_id = service.safe_capture(
        payload=_payload(),
        response=_response(),
        request_id="request-1",
    )
    first_snapshot = _Session.records[0].snapshot_json
    second_id = service.safe_capture(
        payload=_payload(),
        response=_response(answer="different answer"),
        request_id="request-1",
    )
    assert first_id == second_id
    assert len(_Session.records) == 1
    assert _Session.records[0].snapshot_json == first_snapshot


def test_disabled_archive_writes_nothing():
    _Session.records = []
    service = ExperienceArchiveService(session_factory=_Session, settings=_settings(False))
    assert service.safe_capture(payload=_payload(), response=_response(), request_id="request-1") is None
    assert _Session.records == []


def test_archive_failure_is_fail_open_and_does_not_mutate_response():
    _Session.records = []
    _Session.fail = True
    try:
        service = ExperienceArchiveService(session_factory=_Session, settings=_settings())
        response = _response()
        before = response.model_dump()
        assert service.safe_capture(payload=_payload(), response=response, request_id="request-1") is None
        assert response.model_dump() == before
    finally:
        _Session.fail = False


def test_snapshot_captures_claim_dependencies_evidence_and_phase6_without_research():
    service = ExperienceArchiveService(settings=_settings())
    response = _response(
        accepted_submission={
            "claims": [
                {
                    "claim_id": "c2",
                    "claim_type": "legal_application",
                    "materiality": "decisive",
                    "text": "Conclusion",
                    "depends_on": ["c1"],
                    "evidence_refs": ["exact:opaque-ref"],
                }
            ]
        },
        phase6_checker={
            "status": "completed",
            "decisions": [{
                "claim_id": "c2",
                "claim_type": "legal_application",
                "materiality": "decisive",
                "claim_text": "Conclusion",
                "verdict": "KEEP",
                "reason_codes": ["SUPPORTED"],
                "evidence_refs": ["exact:opaque-ref"],
            }],
            "material_omission_suspected": True,
            "material_omission_evidence_refs": ["exact:opaque-ref"],
            "checker_packet": {
                "material_claim_count": 1,
                "checker_evidence_count": 1,
                "canonical_local_count": 1,
                "native_web_count": 0,
                "evidence_with_backend_text_count": 1,
                "checker_evidence_text_chars": 20,
                "matter_fact_chars": 2,
                "serialized_packet_chars": 300,
                "evidence": [{
                    "evidence_ref": "exact:opaque-ref",
                    "origin": "canonical_local",
                    "backend_text_available": True,
                    "evidence_text_chars": 20,
                    "claim_ids": ["c2"],
                }],
            },
        },
    )
    snapshot = service.build_snapshot(payload=_payload(), response=response, request_id="request-1")
    assert snapshot.answer["claims"][0]["depends_on"] == ["c1"]
    assert snapshot.answer["claim_dependencies"] == [{"claim_id": "c2", "depends_on": ["c1"]}]
    assert snapshot.evidence["reported_evidence_refs"] == ["exact:opaque-ref"]
    assert snapshot.phase6["status"] == "completed"
    assert snapshot.phase6["decisions"][0]["verdict"] == "KEEP"
    assert snapshot.phase6["decisions"][0]["claim_type"] == "legal_application"
    assert snapshot.phase6["decisions"][0]["evidence_refs"] == ["exact:opaque-ref"]
    assert snapshot.phase6["material_omission_suspected"] is True
    assert snapshot.phase6["checker_packet"]["checker_evidence_count"] == 1
    assert snapshot.phase6["checker_packet"]["evidence"][0]["origin"] == "canonical_local"
    assert snapshot.research["tool_calls"] == []


def test_disabled_phase6_is_recorded_without_fabricating_result():
    service = ExperienceArchiveService(settings=_settings())
    snapshot = service.build_snapshot(
        payload=_payload(),
        response=_response(),
        request_id="request-1",
    )
    assert snapshot.phase6 == {"status": "disabled", "result": None}


def test_legacy_fact_check_status_is_not_phase6_metadata():
    service = ExperienceArchiveService(settings=_settings())
    response = QueryResponse(
        matter_id="matter-1",
        answer="The accepted answer.",
        response_language="en",
        confidence="medium",
        next_action="answer",
        fact_check_status="pass",
    )
    snapshot = service.build_snapshot(payload=_payload(), response=response, request_id="request-1")
    assert snapshot.phase6 == {"status": "disabled", "result": None}


def test_async_hook_builds_once_before_persistence_and_crosses_only_pure_data(monkeypatch):
    import app.services.experience_archive_service as archive_module

    captured = []

    class CaptureOnlyExecutor:
        def submit(self, _function, argument):
            captured.append(argument)
            # This test verifies only the request-thread/persistence boundary.
            # Do not execute the persistence callback or touch SessionLocal.
            archive_module._ARCHIVE_SLOTS.release()
            return None

    monkeypatch.setattr(archive_module, "_ARCHIVE_EXECUTOR", CaptureOnlyExecutor())
    service = ExperienceArchiveService(settings=_settings())
    matter = SimpleNamespace(id="matter-1", session_id="session-1")
    service.safe_capture_async(
        payload=_payload(),
        response=_response(),
        matter=matter,
        request_id="async-request-1",
    )
    # The request-thread payload contains scalar IDs and a Pydantic/JSON
    # snapshot, never the SQLAlchemy Matter object or a request registry.
    assert len(captured) == 1
    assert captured[0].matter_id == "matter-1"
    assert captured[0].session_id == "session-1"
    assert captured[0].snapshot_json["request"]["request_id"] == "async-request-1"
    assert not hasattr(captured[0], "matter")


def test_rich_capture_claim_prevents_route_fallback_capture(monkeypatch):
    import app.services.experience_archive_service as archive_module

    submitted = []

    class CaptureOnlyExecutor:
        def submit(self, _function, argument):
            submitted.append(argument)
            archive_module._ARCHIVE_SLOTS.release()

    monkeypatch.setattr(archive_module, "_ARCHIVE_EXECUTOR", CaptureOnlyExecutor())
    service = ExperienceArchiveService(settings=_settings())
    service.safe_capture_async(
        payload=_payload(), response=_response(), request_id="one-capture-request"
    )
    assert service.capture_scheduled_for("one-capture-request") is True
    service.safe_capture_async(
        payload=_payload(), response=_response(answer="fallback"), request_id="one-capture-request"
    )
    assert len(submitted) == 1


def test_observability_context_is_materialized_before_async_boundary(monkeypatch):
    import app.services.experience_archive_service as archive_module
    import app.services.agent_observability_service as observability_module

    captured = []

    class CaptureOnlyExecutor:
        def submit(self, _function, argument):
            captured.append(argument)
            archive_module._ARCHIVE_SLOTS.release()

    monkeypatch.setattr(archive_module, "_ARCHIVE_EXECUTOR", CaptureOnlyExecutor())
    observer = observability_module.AgentObservabilityService()
    token = observer.begin_turn(
        mode="default", request_id="context-request", architecture_version="phase7-test.v1"
    )
    try:
        service = ExperienceArchiveService(settings=_settings())
        service.safe_capture_async(payload=_payload(), response=_response())
    finally:
        observer.reset_turn(token)
    assert captured[0].request_id == "context-request"
    assert captured[0].snapshot_json["system"]["architecture_version"] == "phase7-test.v1"


def test_registry_snapshot_is_authoritative_and_excludes_graph_navigation():
    service = ExperienceArchiveService(settings=_settings())
    evidence = SimpleNamespace(
        model_dump=lambda mode="json": {
            "evidence_ref": "exact:real-ref",
            "evidence_origin": "canonical_local",
            "source_type": "legislation",
            "text": "permitted evidence",
        }
    )
    registry = SimpleNamespace(
        get_all_refs=lambda: ["exact:real-ref", "exact:graph-ref"],
        resolve=lambda ref: SimpleNamespace(
            tool_name="schedule2_navigation" if ref.endswith("graph-ref") else "exact_legal_lookup",
            tool_call_id="call-1",
            registered_at="2026-08-26T00:00:00Z",
            unresolved_cross_references=("485.211",),
            evidence_record=None if ref.endswith("graph-ref") else evidence,
        ),
    )
    snapshot = service.build_snapshot(
        payload=_payload(),
        response=_response(evidence_refs=["exact:reported-only", "web:reported-only"]),
        request_id="registry-request",
        evidence_registry=registry,
    )
    assert snapshot.evidence["registered_evidence_refs"] == ["exact:real-ref"]
    assert snapshot.evidence["registered_evidence"][0]["unresolved_cross_references"] == ["485.211"]
    assert snapshot.evidence["reported_evidence_refs"] == ["exact:reported-only", "web:reported-only"]


def test_token_usage_survives_but_credentials_do_not():
    service = ExperienceArchiveService(settings=_settings())
    snapshot = service.build_snapshot(
        payload=_payload(),
        response=_response(),
        request_id="metrics-request",
        execution_metrics={
            "input_tokens": 10,
            "cached_input_tokens": 2,
            "reasoning_tokens": 3,
            "output_tokens": 4,
            "authorization": "Bearer should-not-appear",
            "api_key": "secret-key",
        },
    )
    metrics = snapshot.system["execution_metrics"]
    assert metrics["input_tokens"] == 10
    assert metrics["cached_input_tokens"] == 2
    assert metrics["reasoning_tokens"] == 3
    assert metrics["output_tokens"] == 4
    assert "authorization" not in metrics
    assert "api_key" not in metrics


@pytest.mark.parametrize("status", ["not_required", "skipped", "completed", "failed"])
def test_actual_phase6_statuses_are_preserved(status):
    service = ExperienceArchiveService(settings=_settings())
    snapshot = service.build_snapshot(
        payload=_payload(),
        response=_response(phase6_checker={"status": status, "result": None}),
        request_id=f"phase6-{status}",
    )
    assert snapshot.phase6["status"] == status
    assert snapshot.phase6["result"] is None


def test_archive_identifiers_are_immutable_values_not_mutating_foreign_keys():
    assert not ExperienceRecord.__table__.c.matter_id.foreign_keys
    assert not ExperienceRecord.__table__.c.answer_trace_id.foreign_keys
    assert not hasattr(ExperienceArchiveService, "update")
    assert not hasattr(ExperienceArchiveService, "delete")


@pytest.mark.parametrize("contract", [ReviewRecord, EvaluationCase, ReasoningLessonCandidate, ReasoningLesson])
def test_synthetic_origin_cannot_masquerade_as_lawyer_reviewed(contract):
    kwargs = {
        "provenance": "lawyer_reviewed",
        "origin": "synthetic_test",
    }
    if contract is ReviewRecord:
        kwargs.update(review_id="review-1")
    elif contract is EvaluationCase:
        kwargs.update(case_id="case-1", question="Question")
    elif contract is ReasoningLessonCandidate:
        kwargs.update(candidate_id="candidate-1", lesson_text="Lesson")
    else:
        kwargs.update(lesson_id="lesson-1", lesson_text="Lesson")
    with pytest.raises(ValueError, match="synthetic"):
        contract(**kwargs)


def test_premium_is_not_archived_by_phase7_1_serving_writer():
    _Session.records = []
    service = ExperienceArchiveService(session_factory=_Session, settings=_settings())
    assert service.safe_capture(
        payload=_payload(mode="premium_direct_gpt55_high"),
        response=_response(),
        request_id="premium-request",
    ) is None
    assert _Session.records == []


def test_review_sidecar_links_archive_without_changing_customer_response():
    captured = []

    class ArchiveSpy:
        def safe_capture(self, **kwargs):
            captured.append(kwargs)
            return "experience-1"

    service = ReviewTraceService(experience_archive_service=ArchiveSpy())
    service.settings = SimpleNamespace(enable_lawyer_review_trace=False)
    public_response = _response()
    before = public_response.model_dump()
    assert service.safe_record_answer_trace(
        matter=SimpleNamespace(id="matter-1", session_id="session-1"),
        payload=_payload(),
        response=public_response,
        state=None,
    ) is None
    assert public_response.model_dump() == before
    assert len(captured) == 1
    assert captured[0]["answer_trace_id"] is None


def test_archive_does_not_copy_reasoning_lessons_or_call_runtime_dependencies():
    service = ExperienceArchiveService(settings=_settings())
    snapshot = service.build_snapshot(
        payload=_payload(),
        response=_response(
            reasoning_lessons=[{"lesson_id": "lesson-1", "lesson_text": "never runtime"}],
            checker_input={"experiential_context": "must not enter checker"},
        ),
        request_id="request-1",
    )
    snapshot.answer["legal_reasoning_trace"] = {
        "chain_of_thought": "must not be archived",
        "raw_model_output": "must not be archived",
    }
    serialized = str(snapshot.model_dump(mode="json"))
    assert "lesson-1" not in serialized
    assert "experiential_context" not in serialized
    sanitized = service._safe_json(snapshot.answer["legal_reasoning_trace"])
    assert "chain_of_thought" not in sanitized
    assert "raw_model_output" not in sanitized
