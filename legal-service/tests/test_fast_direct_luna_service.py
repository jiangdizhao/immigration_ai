from __future__ import annotations

from types import SimpleNamespace

from app.core.config import Settings
from app.schemas.query import QueryRequest
from app.schemas.query import QueryResponse
from app.api.routes import query as query_route
from app.services import fast_direct_luna_service as fast_module
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.fast_direct_luna_service import FastDirectLunaService


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        fast_luna_model="gpt-5.6-luna",
        fast_luna_reasoning_effort="low",
        fast_luna_provider_timeout_ms=38000,
        fast_luna_max_output_tokens=None,
        fast_luna_max_tool_calls=2,
        fast_luna_web_search_context_size="low",
        fast_luna_service_tier=None,
        openai_api_key="test-key",
    )


class _Response:
    id = "resp-fast-test"
    output_text = "A concise answer."
    output = [
        {
            "type": "message",
            "content": [
                {
                    "type": "output_text",
                    "text": output_text,
                    "annotations": [
                        {
                            "type": "url_citation",
                            "title": "Home Affairs",
                            "url": "https://immi.homeaffairs.gov.au/example",
                        }
                    ],
                }
            ],
        }
    ]

    def model_dump(self):
        return {"output": self.output}


class _NoSearchResponse:
    id = "resp-fast-no-search"
    output_text = "A stable answer."
    output: list[dict] = []


def _payload() -> QueryRequest:
    return QueryRequest(
        question="Can I apply?",
        response_language="en",
        assistant_mode="fast",
        frontend_messages=[
            {"role": "system", "text": "must not be sent"},
            {"role": "user", "text": "Can I apply?"},
        ],
    )


def test_fast_max_output_tokens_defaults_to_unset_without_env_override(monkeypatch):
    monkeypatch.delenv("FAST_LUNA_MAX_OUTPUT_TOKENS", raising=False)
    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
    )

    assert settings.fast_luna_max_output_tokens is None


def test_fast_explicit_max_output_tokens_override_is_accepted(monkeypatch):
    monkeypatch.setenv("FAST_LUNA_MAX_OUTPUT_TOKENS", "4000")
    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
    )

    assert settings.fast_luna_max_output_tokens == 4000


def test_fast_uses_one_luna_request_with_only_optional_native_web_search(monkeypatch):
    monkeypatch.setattr(fast_module, "get_settings", _settings)
    calls: list[dict] = []

    class _Responses:
        def create(self, **kwargs):
            calls.append(kwargs)
            return _Response()

    class _Client:
        def __init__(self, **kwargs):
            self.responses = _Responses()

    monkeypatch.setattr(fast_module, "OpenAI", _Client)
    service = FastDirectLunaService()
    response = service.answer(
        payload=_payload(),
        deadline=AbsoluteTurnDeadline(started_at=0, turn_deadline_ms=45000, clock=lambda: 1),
    )

    assert response.answer == "A concise answer."
    assert response.research_status == "complete"
    assert len(response.citations) == 1
    assert response.citations[0].url == "https://immi.homeaffairs.gov.au/example"
    assert len(calls) == 1
    assert calls[0]["model"] == "gpt-5.6-luna"
    assert calls[0]["reasoning"] == {"effort": "low"}
    assert "max_output_tokens" not in calls[0]
    assert calls[0]["tools"] == [{"type": "web_search", "search_context_size": "low"}]
    assert calls[0]["tool_choice"] == "auto"
    assert calls[0]["max_tool_calls"] == 2
    assert "must not be sent" not in calls[0]["input"]


def test_fast_provider_failure_is_neutral_and_does_not_retry_or_enter_slow(monkeypatch):
    monkeypatch.setattr(fast_module, "get_settings", _settings)
    call_count = 0

    class _Responses:
        def create(self, **kwargs):
            nonlocal call_count
            call_count += 1
            raise TimeoutError("provider timeout")

    class _Client:
        def __init__(self, **kwargs):
            self.responses = _Responses()

    monkeypatch.setattr(fast_module, "OpenAI", _Client)
    response = FastDirectLunaService().answer(
        payload=_payload(),
        deadline=AbsoluteTurnDeadline(started_at=0, turn_deadline_ms=45000, clock=lambda: 1),
    )

    assert call_count == 1
    assert response.architecture_version == "fast.direct_luna"
    assert response.retrieval_debug["fast_direct_luna"]["completion_status"] == "timeout"
    assert response.retrieval_debug["fast_direct_luna"]["stream_end_reason"] == "transport_timeout"
    assert "Legal Check" in response.answer


def test_fast_incomplete_fallback_preserves_content_free_stream_diagnostics(monkeypatch):
    monkeypatch.setattr(fast_module, "get_settings", _settings)

    class _Stream:
        def __iter__(self):
            yield SimpleNamespace(
                type="response.created",
                response=SimpleNamespace(id="fast-incomplete-response"),
            )
            yield SimpleNamespace(
                type="response.output_text.delta",
                delta="partial provider text that must not be served",
            )
            yield SimpleNamespace(
                type="response.incomplete",
                response=SimpleNamespace(
                    id="fast-incomplete-response",
                    incomplete_details=SimpleNamespace(reason="max_tokens"),
                    output=[],
                ),
            )

    class _Responses:
        def create(self, **kwargs):
            return _Stream()

    class _Client:
        def __init__(self, **kwargs):
            self.responses = _Responses()

    monkeypatch.setattr(fast_module, "OpenAI", _Client)
    response = FastDirectLunaService().answer(
        payload=_payload(),
        deadline=AbsoluteTurnDeadline(started_at=0, turn_deadline_ms=45000, clock=lambda: 1),
    )

    debug = response.retrieval_debug["fast_direct_luna"]
    assert "Quick Answer is temporarily unavailable" in response.answer
    assert "partial provider text" not in response.answer
    assert debug["stream_end_reason"] == "response_incomplete"
    assert debug["provider_incomplete_reason"] == "max_tokens"
    assert debug["response_id"] == "fast-incomplete-response"
    assert debug["provider_elapsed_ms"] is not None
    assert debug["allocated_provider_timeout_ms"] == 38000
    assert debug["outer_deadline_ms"] == 45000
    assert debug["response_completed_observed"] is False
    assert debug["response_incomplete_observed"] is True
    assert debug["response_failed_observed"] is False
    assert debug["native_web_max_tool_calls"] == 2
    assert debug["max_output_tokens"] is None


def test_fast_explicit_max_output_tokens_override_is_sent(monkeypatch):
    settings = _settings()
    settings.fast_luna_max_output_tokens = 4000
    monkeypatch.setattr(fast_module, "get_settings", lambda: settings)
    calls: list[dict] = []

    class _Responses:
        def create(self, **kwargs):
            calls.append(kwargs)
            return _Response()

    class _Client:
        def __init__(self, **kwargs):
            self.responses = _Responses()

    monkeypatch.setattr(fast_module, "OpenAI", _Client)
    response = FastDirectLunaService().answer(
        payload=_payload(),
        deadline=AbsoluteTurnDeadline(started_at=0, turn_deadline_ms=45000, clock=lambda: 1),
    )

    assert response.answer == "A concise answer."
    assert calls[0]["max_output_tokens"] == 4000
    assert response.retrieval_debug["fast_direct_luna"]["max_output_tokens"] == 4000


def test_fast_does_not_force_native_search(monkeypatch):
    monkeypatch.setattr(fast_module, "get_settings", _settings)

    class _Responses:
        def create(self, **kwargs):
            return _NoSearchResponse()

    class _Client:
        def __init__(self, **kwargs):
            self.responses = _Responses()

    monkeypatch.setattr(fast_module, "OpenAI", _Client)
    response = FastDirectLunaService().answer(
        payload=_payload(),
        deadline=AbsoluteTurnDeadline(started_at=0, turn_deadline_ms=45000, clock=lambda: 1),
    )

    assert response.research_status == "not_required"
    assert response.citations == []


def test_fast_api_dispatches_before_query_service_construction(monkeypatch):
    settings = SimpleNamespace(
        fast_turn_deadline_ms=45000,
        backend_political_failsafe_enabled=False,
        agent_shadow_enabled=True,
        default_agent_serving_enabled=False,
        app_version="test",
    )
    monkeypatch.setattr(query_route, "get_settings", lambda: settings)

    class _UnexpectedQueryService:
        def __init__(self):
            raise AssertionError("Fast must not construct QueryService")

    monkeypatch.setattr(query_route, "QueryService", _UnexpectedQueryService)
    from app.services.fast_direct_luna_service import FastDirectLunaService

    monkeypatch.setattr(
        FastDirectLunaService,
        "answer",
        lambda self, **kwargs: QueryResponse(
            answer="fast answer",
            confidence="medium",
            next_action="answer",
            architecture_version="fast.direct_luna",
        ),
    )

    response = query_route.run_query(
        QueryRequest(question="hi", assistant_mode="fast"),
        db=object(),
        request=None,
    )

    assert response.answer == "fast answer"
    assert response.architecture_version == "fast.direct_luna"
