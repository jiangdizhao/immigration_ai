from __future__ import annotations

from types import SimpleNamespace

from app.schemas.query import QueryRequest, QueryResponse
from app.services.agent_observability_service import AgentObservabilityService
from app.services.review_trace_service import ReviewTraceService


class CapturingSession:
    def __init__(self, *, existing_matter_ids=None) -> None:
        self.added = None
        self.existing_matter_ids = set(existing_matter_ids or ())

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def add(self, value) -> None:
        self.added = value

    def commit(self) -> None:
        return None

    def refresh(self, _value) -> None:
        return None

    def get(self, _model, matter_id):
        return SimpleNamespace(id=matter_id) if matter_id in self.existing_matter_ids else None


def response() -> QueryResponse:
    return QueryResponse(
        matter_id="matter-1",
        answer="Legacy answer",
        response_language="en",
        confidence="medium",
        next_action="answer",
    )


def test_review_trace_contains_exact_observability_fields(monkeypatch) -> None:
    import app.services.review_trace_service as review_module

    session = CapturingSession(existing_matter_ids={"matter-1"})
    monkeypatch.setattr(review_module, "SessionLocal", lambda: session)
    service = ReviewTraceService()
    service.settings = SimpleNamespace(enable_lawyer_review_trace=True)
    observer = AgentObservabilityService()
    token = observer.begin_turn(mode="default", turn_deadline_ms=40000)
    try:
        observer.mark_agent_started()
        observer.record_logical_stage("answer_research")
        observer.record_provider_call(stage="answer", duration_ms=1, status="ok")
        observer.record_tool_call(
            tool_name="web_search",
            round_index=1,
            status="ok",
            duration_ms=1,
        )
        observer.record_terminal_submission(missing=True, continuation_count=1)
        service.safe_record_answer_trace(
            matter=SimpleNamespace(id="matter-1", session_id="session-1"),
            payload=QueryRequest(question="Question"),
            response=response(),
            state=None,
        )
    finally:
        observer.reset_turn(token)

    metrics = session.added.trace_json["execution_metrics"]
    required = {
        "logical_llm_stage_count",
        "provider_api_call_count",
        "tool_call_count",
        "tool_round_count",
        "web_search_call_count",
        "exact_lookup_call_count",
        "lightrag_call_count",
        "flat_rag_call_count",
        "utility_call_count",
        "retry_count",
        "backend_total_latency_ms",
        "pre_agent_latency_ms",
        "answer_agent_latency_ms",
        "fact_check_latency_ms",
        "total_latency_ms",
        "turn_deadline_ms",
        "remaining_deadline_before_call_ms",
        "deadline_exceeded_stage",
        "terminal_submission_missing",
        "terminal_submission_continuation_count",
    }
    assert required <= metrics.keys()
    assert metrics["provider_api_call_count"] == 1
    assert metrics["tool_call_count"] == 1
    assert metrics["terminal_submission_missing"] is True
    assert session.added.matter_id == "matter-1"


def test_invalid_matter_fk_skips_answer_trace_but_archives_diagnostics(monkeypatch) -> None:
    import app.services.review_trace_service as review_module

    session = CapturingSession()
    monkeypatch.setattr(review_module, "SessionLocal", lambda: session)
    captured = []

    class ArchiveSpy:
        def safe_capture(self, **kwargs):
            captured.append(kwargs)

    service = ReviewTraceService(experience_archive_service=ArchiveSpy())
    service.settings = SimpleNamespace(enable_lawyer_review_trace=True)
    public_response = response().model_copy(update={
        "retrieval_debug": {"checker": {"status": "failed", "reason": "diagnostic"}},
    })
    before = public_response.model_dump()
    trace_id = service.safe_record_answer_trace(
        matter=SimpleNamespace(id="nonexistent-matter", session_id="session-1"),
        payload=QueryRequest(question="Question", matter_id="nonexistent-matter"),
        response=public_response,
        state=None,
    )

    assert trace_id is None
    assert session.added is None
    assert public_response.model_dump() == before
    assert len(captured) == 1
    assert captured[0]["matter"].id is None
    assert captured[0]["payload"].matter_id is None
    assert captured[0]["response"].matter_id is None
    assert captured[0]["response"].retrieval_debug["checker"]["status"] == "failed"


def test_missing_matter_id_is_fail_neutral_without_creating_matter(monkeypatch) -> None:
    import app.services.review_trace_service as review_module

    session = CapturingSession()
    monkeypatch.setattr(review_module, "SessionLocal", lambda: session)
    captured = []

    class ArchiveSpy:
        def safe_capture(self, **kwargs):
            captured.append(kwargs)

    service = ReviewTraceService(experience_archive_service=ArchiveSpy())
    service.settings = SimpleNamespace(enable_lawyer_review_trace=True)
    public_response = response()
    before = public_response.model_dump()
    assert service.safe_record_answer_trace(
        matter=SimpleNamespace(id=None, session_id="session-1"),
        payload=QueryRequest(question="Question"),
        response=public_response,
        state=None,
    ) is None

    assert public_response.model_dump() == before
    assert session.added is None
    assert len(captured) == 1
    assert captured[0]["matter"].id is None


def test_review_trace_failure_remains_passive(monkeypatch) -> None:
    import app.services.review_trace_service as review_module

    def fail_session():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(review_module, "SessionLocal", fail_session)
    service = ReviewTraceService()
    service.settings = SimpleNamespace(enable_lawyer_review_trace=True)
    public_response = response()
    before = public_response.model_dump()
    trace_id = service.safe_record_answer_trace(
        matter=SimpleNamespace(id="matter-1", session_id="session-1"),
        payload=QueryRequest(question="Question"),
        response=public_response,
        state=None,
    )
    assert trace_id is None
    assert public_response.model_dump() == before


def test_review_trace_sanitizes_postgresql_forbidden_nul_recursively(monkeypatch) -> None:
    import app.services.review_trace_service as review_module

    session = CapturingSession(existing_matter_ids={"matter-1"})
    monkeypatch.setattr(review_module, "SessionLocal", lambda: session)

    class ArchiveSpy:
        def safe_capture(self, **_kwargs):
            return None

    service = ReviewTraceService(experience_archive_service=ArchiveSpy())
    service.settings = SimpleNamespace(enable_lawyer_review_trace=True)

    payload = QueryRequest(
        question="Question\x00with NUL",
        assistant_mode="default",
    )
    public_response = response().model_copy(
        update={
            "answer": "Answer\x00with NUL",
            "retrieval_debug": {
                "nested": {
                    "text": "tool\x00result",
                    "key\x00part": "value\x00part",
                }
            },
        }
    )
    before_answer = public_response.answer

    service.safe_record_answer_trace(
        matter=SimpleNamespace(id="matter-1", session_id="session-1"),
        payload=payload,
        response=public_response,
        state=None,
        original_question="Original\x00question",
        effective_question="Effective\x00question",
    )

    assert session.added is not None

    # Persistence sanitization must not mutate the public response object.
    assert public_response.answer == before_answer
    assert "\x00" in public_response.answer

    # PostgreSQL text columns are sanitized.
    assert session.added.user_message == "Original\uFFFDquestion"
    assert session.added.assistant_answer == "Answer\uFFFDwith NUL"

    # Nested JSON values and keys are sanitized recursively.
    assert (
        session.added.trace_json["retrieval_debug"]["nested"]["text"]
        == "tool\uFFFDresult"
    )
    assert (
        session.added.trace_json["retrieval_debug"]["nested"]["key\uFFFDpart"]
        == "value\uFFFDpart"
    )
    assert session.added.trace_json["original_question"] == "Original\uFFFDquestion"
    assert session.added.trace_json["effective_question"] == "Effective\uFFFDquestion"

    def assert_no_nul(value):
        if isinstance(value, str):
            assert "\x00" not in value
        elif isinstance(value, dict):
            for key, item in value.items():
                assert_no_nul(key)
                assert_no_nul(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                assert_no_nul(item)

    assert_no_nul(session.added.trace_json)
