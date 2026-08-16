from __future__ import annotations

from types import SimpleNamespace

from app.schemas.query import QueryRequest, QueryResponse
from app.services.agent_observability_service import AgentObservabilityService
from app.services.review_trace_service import ReviewTraceService


class CapturingSession:
    def __init__(self) -> None:
        self.added = None

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

    session = CapturingSession()
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
