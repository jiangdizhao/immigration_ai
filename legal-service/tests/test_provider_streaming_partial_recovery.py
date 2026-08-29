from __future__ import annotations

import time
from datetime import date
from types import SimpleNamespace

import anyio

from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
from app.schemas.query import QueryRequest
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.agent_runtime_service import AgentRuntimeService, ProviderResponse
from app.services.openai_responses_adapter import OpenAIResponsesAdapter
from app.services.openai_responses_adapter import consume_responses_stream
from app.services.premium_direct_answer_service import PremiumDirectAnswerService
from app.services.request_evidence_registry import create_registry
from app.services.tool_executor_service import ToolExecutorContext, ToolExecutorService


class FakeStream:
    def __init__(self, events, error: BaseException | None = None) -> None:
        self.events = events
        self.error = error

    def __iter__(self):
        yield from self.events
        if self.error is not None:
            raise self.error


class FakeMonotonic:
    def __init__(self) -> None:
        self.value = 0.0

    def __call__(self) -> float:
        return self.value


class TimedStream:
    def __init__(self, clock: FakeMonotonic, events: list[tuple[float, object]]) -> None:
        self.clock = clock
        self.events = events
        self.closed = False

    def __iter__(self):
        for at, event in self.events:
            self.clock.value = at
            yield event

    def close(self) -> None:
        self.closed = True


class CleanupErrorStream(TimedStream):
    def close(self) -> None:
        self.closed = True
        self.clock.value = 9.0
        raise RuntimeError("late cleanup failure")


class FakeResponses:
    def __init__(self, stream) -> None:
        self.stream = stream
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.stream


def _adapter(stream: FakeStream):
    responses = FakeResponses(stream)
    adapter = OpenAIResponsesAdapter(
        client=SimpleNamespace(responses=responses),
    )
    return adapter, responses


def _call(adapter: OpenAIResponsesAdapter, registry=None, tools=None):
    async def run():
        return await adapter.call(
            system_prompt="Answer the question.",
            user_text="What is the current visa fee?",
            model="gpt-5.6-luna",
            tools=tools or [{"type": "web_search"}],
            timeout_ms=1000,
            registry=registry or create_registry(),
        )

    return anyio.run(run)


def test_completed_stream_accumulates_text_and_sources() -> None:
    url = "https://www.example.gov.au/visa-fees"
    stream = FakeStream([
        SimpleNamespace(type="response.created", response=SimpleNamespace(id="resp-1")),
        SimpleNamespace(type="response.output_text.delta", delta="The fee is "),
        SimpleNamespace(type="response.output_text.delta", delta="supported by the source."),
        SimpleNamespace(
            type="response.output_item.done",
            item=SimpleNamespace(
                type="web_search_call",
                id="search-1",
                status="completed",
                action=SimpleNamespace(
                    queries=["current visa fee"],
                    sources=[{"type": "url", "url": url, "title": "Official fee page"}],
                ),
            ),
        ),
        SimpleNamespace(
            type="response.completed",
            response=SimpleNamespace(id="resp-1", output=[]),
        ),
    ])
    adapter, responses = _adapter(stream)
    registry = create_registry()

    result = _call(adapter, registry)

    assert result.status == "ok"
    assert result.text == "The fee is supported by the source."
    assert result.partial is False
    assert result.native_web_source_count == 1
    assert len(registry.get_all_refs()) == 1
    assert responses.calls[0]["stream"] is True


def test_timeout_preserves_completed_sources_but_marks_text_partial() -> None:
    url = "https://www.example.gov.au/visa-fees"
    stream = FakeStream(
        [
            SimpleNamespace(type="response.created", response=SimpleNamespace(id="resp-2")),
            SimpleNamespace(type="response.output_text.delta", delta="A partial answer"),
            SimpleNamespace(
                type="response.output_item.done",
                item=SimpleNamespace(
                    type="web_search_call",
                    id="search-2",
                    status="completed",
                    action=SimpleNamespace(
                        queries=["official visa fee"],
                        sources=[{"url": url, "title": "Official fee page"}],
                    ),
                ),
            ),
            SimpleNamespace(
                type="response.output_text.annotation.added",
                annotation=SimpleNamespace(
                    type="url_citation",
                    url=url,
                    title="Official fee page",
                    start_index=0,
                    end_index=15,
                ),
            ),
        ],
        error=TimeoutError("stream timeout"),
    )
    adapter, _responses = _adapter(stream)
    registry = create_registry()

    result = _call(adapter, registry)

    assert result.status == "timeout"
    assert result.partial is True
    assert result.partial_text == "A partial answer"
    assert result.native_web_source_count == 1
    assert result.native_web_citation_count == 1
    assert result.stream_error == "stream timeout"
    assert len(registry.get_all_refs()) == 1


def test_incomplete_function_arguments_are_not_executable() -> None:
    stream = FakeStream(
        [
            SimpleNamespace(type="response.created", response=SimpleNamespace(id="resp-3")),
            SimpleNamespace(
                type="response.function_call_arguments.delta",
                item_id="call-1",
                delta='{"operation":"arithmetic"',
            ),
        ],
        error=TimeoutError("function call interrupted"),
    )
    adapter, _responses = _adapter(stream)

    result = _call(adapter)

    assert result.status == "timeout"
    assert result.partial is False
    assert result.tool_calls == []


def test_completed_function_arguments_are_accumulated_once() -> None:
    stream = FakeStream([
        SimpleNamespace(type="response.created", response=SimpleNamespace(id="resp-4")),
        SimpleNamespace(
            type="response.function_call_arguments.delta",
            item_id="fc_item_123",
            delta='{"operation":"arithmetic",',
        ),
        SimpleNamespace(
            type="response.function_call_arguments.done",
            item_id="fc_item_123",
            name="deterministic_utility",
            arguments='{"operation":"arithmetic","operands":[2,3],"expression":"2 + 3"}',
        ),
        SimpleNamespace(
            type="response.output_item.done",
            item=SimpleNamespace(
                type="function_call",
                id="fc_item_123",
                call_id="call_real_456",
                name="deterministic_utility",
                status="completed",
                arguments='{"operation":"arithmetic","operands":[2,3],"expression":"2 + 3"}',
            ),
        ),
        SimpleNamespace(
            type="response.completed",
            response=SimpleNamespace(id="resp-4", output=[]),
        ),
    ])
    adapter, _responses = _adapter(stream)

    result = _call(adapter)

    assert result.status == "ok"
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].call_id == "call_real_456"
    assert result.tool_calls[0].arguments["operands"] == [2, 3]
    executed = ToolExecutorService().execute_tool(
        result.tool_calls[0],
        ToolExecutorContext(request_id="stream-function-test", registry=create_registry()),
    )
    assert executed.tool_call_id == "call_real_456"


def test_function_arguments_done_without_output_item_done_is_not_executable() -> None:
    stream = FakeStream([
        SimpleNamespace(type="response.function_call_arguments.done", item_id="fc-item", name="submit_answer", arguments="{}"),
    ])
    adapter, _responses = _adapter(stream)

    result = _call(adapter)

    assert result.status == "timeout"
    assert result.tool_calls == []


def test_incomplete_snapshot_with_valid_json_is_not_executable() -> None:
    stream = FakeStream([
        SimpleNamespace(
            type="response.incomplete",
            response=SimpleNamespace(
                id="incomplete-response",
                output=[SimpleNamespace(
                    type="function_call",
                    id="fc-item-2",
                    call_id="call-real-2",
                    name="submit_answer",
                    status=None,
                    arguments="{}",
                )],
            ),
        ),
    ])
    adapter, _responses = _adapter(stream)

    result = _call(adapter)

    assert result.status == "timeout"
    assert result.tool_calls == []
    assert result.partial is False


def test_completed_response_is_not_downgraded_by_later_transport_error() -> None:
    stream = FakeStream(
        [
            SimpleNamespace(type="response.output_text.delta", delta="completed answer"),
            SimpleNamespace(
                type="response.completed",
                response=SimpleNamespace(id="completed-response", output=[]),
            ),
        ],
        error=TimeoutError("late transport close"),
    )
    adapter, _responses = _adapter(stream)

    result = _call(adapter)

    assert result.status == "ok"
    assert result.text == "completed answer"
    assert result.partial is False
    assert result.stream_error is None


def test_absolute_stream_deadline_preserves_safe_artifacts_and_rejects_late_event() -> None:
    clock = FakeMonotonic()
    source_url = "https://www.example.gov.au/fee"
    stream = TimedStream(clock, [
        (0.0, SimpleNamespace(type="response.created", response=SimpleNamespace(id="timed"))),
        (3.0, SimpleNamespace(type="response.output_text.delta", delta="partial text")),
        (6.0, SimpleNamespace(
            type="response.output_item.done",
            item=SimpleNamespace(
                type="web_search_call",
                id="timed-search",
                status="completed",
                action=SimpleNamespace(sources=[{"url": source_url, "title": "Fee source"}]),
            ),
        )),
        (7.0, SimpleNamespace(
            type="response.function_call_arguments.done",
            item_id="incomplete-function",
            name="submit_answer",
            arguments="{}",
        )),
        (9.0, SimpleNamespace(type="response.output_text.delta", delta="late text")),
    ])

    accumulator = consume_responses_stream(
        stream,
        allocated_timeout_seconds=8.0,
        clock=clock,
    )

    assert accumulator.status == "timeout"
    assert accumulator.partial is True
    assert "partial text" in "".join(accumulator.text_parts)
    assert "late text" not in "".join(accumulator.text_parts)
    assert [source["url"] for source in accumulator.materialized_sources()] == [source_url]
    assert accumulator.completed_function_calls == []
    assert stream.closed is True


def test_completed_stream_stays_ok_when_cleanup_fails_after_deadline() -> None:
    clock = FakeMonotonic()
    stream = CleanupErrorStream(clock, [
        (0.0, SimpleNamespace(type="response.output_text.delta", delta="complete text")),
        (7.0, SimpleNamespace(
            type="response.completed",
            response=SimpleNamespace(id="complete-timed", output=[]),
        )),
    ])

    accumulator = consume_responses_stream(
        stream,
        allocated_timeout_seconds=8.0,
        clock=clock,
    )

    assert accumulator.status == "ok"
    assert accumulator.completed is True
    assert "complete text" == "".join(accumulator.text_parts)
    assert stream.closed is True


def test_stream_source_result_citation_and_duplicate_url_parity() -> None:
    url = "https://www.example.gov.au/current-fee"
    stream = FakeStream([
        SimpleNamespace(
            type="response.output_item.done",
            item=SimpleNamespace(
                type="web_search_call",
                id="search-results",
                status="completed",
                action=SimpleNamespace(
                    queries=["current fee"],
                    sources=[{"url": f"{url}/", "title": "Action source"}],
                    results=[{"url": url, "title": "Action result"}],
                ),
                results=[{"url": url, "title": "Item result"}],
            ),
        ),
        SimpleNamespace(
            type="response.output_text.annotation.added",
            annotation=SimpleNamespace(
                type="url_citation",
                url="https://www.example.gov.au/citation-only",
                title="Citation-only source",
                start_index=0,
                end_index=10,
            ),
        ),
        SimpleNamespace(
            type="response.completed",
            response=SimpleNamespace(id="source-response", output=[]),
        ),
    ])
    adapter, _responses = _adapter(stream)
    registry = create_registry()

    result = _call(adapter, registry)

    assert result.status == "ok"
    assert result.native_web_source_count == 2
    assert result.native_web_citation_count == 1
    assert len(registry.get_all_refs()) == 2


def test_incomplete_with_zero_artifacts_has_no_partial_available() -> None:
    stream = FakeStream([
        SimpleNamespace(
            type="response.incomplete",
            response=SimpleNamespace(id="empty-incomplete", output=[]),
        ),
    ])
    adapter, _responses = _adapter(stream)

    result = _call(adapter)

    assert result.status == "timeout"
    assert result.partial is False
    assert result.partial_text is None


def test_default_native_web_search_max_tool_calls_is_propagated(monkeypatch) -> None:
    import app.services.openai_responses_adapter as adapter_module

    stream = FakeStream([
        SimpleNamespace(
            type="response.completed",
            response=SimpleNamespace(id="cap-response", output=[]),
        ),
    ])
    adapter, responses = _adapter(stream)
    monkeypatch.setattr(
        adapter_module,
        "get_settings",
        lambda: SimpleNamespace(default_web_search_max_tool_calls=2),
    )

    result = _call(adapter)

    assert responses.calls[0]["max_tool_calls"] == 2
    assert result.native_web_max_tool_calls == 2


def test_default_native_web_search_max_tool_calls_is_omitted_when_unlimited(monkeypatch) -> None:
    import app.services.openai_responses_adapter as adapter_module

    stream = FakeStream([
        SimpleNamespace(
            type="response.completed",
            response=SimpleNamespace(id="unlimited-response", output=[]),
        ),
    ])
    adapter, responses = _adapter(stream)
    monkeypatch.setattr(
        adapter_module,
        "get_settings",
        lambda: SimpleNamespace(default_web_search_max_tool_calls=None),
    )

    result = _call(adapter)

    assert result.native_web_max_tool_calls is None
    assert "max_tool_calls" not in responses.calls[0]


def test_default_native_web_search_context_baseline_is_low_in_actual_request(monkeypatch) -> None:
    import app.services.agent_policy_service as policy_module
    import app.services.openai_responses_adapter as adapter_module
    from app.core.config import Settings
    from app.services.agent_policy_service import AgentPolicyService

    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
    )
    monkeypatch.setattr(policy_module, "get_settings", lambda: settings)
    monkeypatch.setattr(
        adapter_module,
        "get_settings",
        lambda: SimpleNamespace(default_web_search_max_tool_calls=2),
    )
    policy = AgentPolicyService().build_policy(mode="default")
    adapter, responses = _adapter(FakeStream([
        SimpleNamespace(
            type="response.completed",
            response=SimpleNamespace(id="context-low", output=[]),
        ),
    ]))

    _call(adapter, tools=[policy.tools[0]])

    request_tool = responses.calls[0]["tools"][0]
    assert request_tool["type"] == "web_search"
    assert request_tool["search_context_size"] == "low"
    assert responses.calls[0]["max_tool_calls"] == 2


def test_default_native_web_search_context_explicit_medium_override_propagates(monkeypatch) -> None:
    import app.services.agent_policy_service as policy_module
    import app.services.openai_responses_adapter as adapter_module
    from app.core.config import Settings
    from app.services.agent_policy_service import AgentPolicyService

    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        DEFAULT_WEB_SEARCH_CONTEXT_SIZE="medium",
    )
    monkeypatch.setattr(policy_module, "get_settings", lambda: settings)
    monkeypatch.setattr(
        adapter_module,
        "get_settings",
        lambda: SimpleNamespace(default_web_search_max_tool_calls=2),
    )
    policy = AgentPolicyService().build_policy(mode="default")
    adapter, responses = _adapter(FakeStream([
        SimpleNamespace(
            type="response.completed",
            response=SimpleNamespace(id="context-medium", output=[]),
        ),
    ]))

    _call(adapter, tools=[policy.tools[0]])

    assert responses.calls[0]["tools"][0]["search_context_size"] == "medium"
    assert responses.calls[0]["max_tool_calls"] == 2


def test_default_runtime_uses_partial_text_only_as_terminal_context() -> None:
    from app.services.agent_runtime_service import TERMINAL_RECOVERY_INSTRUCTION

    terminal_submission = {
        "schema_version": "agent_submission.v2",
        "answer_class": "general",
        "draft_markdown": "I could not complete current-fact research.",
        "as_of_date": None,
        "claims": [],
        "citations": [],
        "research_status": "complete",
        "state_patch": [],
    }

    class Provider:
        def __init__(self) -> None:
            self.calls: list[dict] = []

        async def call(self, **kwargs):
            self.calls.append(kwargs)
            if len(self.calls) == 1:
                return ProviderResponse(
                    response_id="partial-response",
                    model="gpt-5.6-luna",
                    status="timeout",
                    text="AUD 2,000",
                    partial=True,
                    partial_text="AUD 2,000",
                )
            from app.services.tool_executor_service import ToolCallRequest

            return ProviderResponse(
                response_id="terminal-response",
                model="gpt-5.6-luna",
                status="ok",
                tool_calls=[ToolCallRequest(
                    call_id="submit-1",
                    name="submit_answer",
                    arguments=terminal_submission,
                )],
            )

    provider = Provider()
    runtime = AgentRuntimeService(provider=provider)
    request = AgentRuntimeRequest(
        request_id="stream-test-request",
        turn_id="stream-test-turn",
        mode="default",
        user_text="What is the current visa fee?",
        response_language="en",
        as_of_date=date.today(),
        matter_state={},
        execution_budget=ExecutionBudget(
            max_tool_rounds=2,
            max_provider_calls=3,
            max_retries=0,
            turn_deadline_ms=10000,
            answer_research_target_ms=5000,
            checker_target_ms=1000,
        ),
        experiment_arm="N",
    )

    async def run():
        return await runtime.run(
            request,
            deadline=AbsoluteTurnDeadline(
                started_at=time.perf_counter(),
                turn_deadline_ms=10000,
            ),
            registry=create_registry(),
        )

    result = anyio.run(run)

    assert result.submission is not None
    assert result.submission.research_status == "incomplete"
    assert result.metrics.stream_partial_call_count == 1
    assert result.metrics.stream_timeout_after_partial_count == 1
    assert any(
        TERMINAL_RECOVERY_INSTRUCTION in str(message.get("content"))
        for message in provider.calls[1]["messages_history"]
    )
    assert any(
        "AUD 2,000" in str(message.get("content"))
        and message.get("partial_provider_text") is True
        for message in provider.calls[1]["messages_history"]
    )


def test_premium_call_uses_stream_accumulator_for_partial_timeout(monkeypatch) -> None:
    service = PremiumDirectAnswerService()
    stream = FakeStream(
        [SimpleNamespace(type="response.output_text.delta", delta="partial premium text")],
        error=TimeoutError("premium stream timeout"),
    )
    responses = FakeResponses(stream)
    monkeypatch.setattr(
        service,
        "_client",
        lambda **_kwargs: SimpleNamespace(responses=responses),
    )

    text, sources, debug = service._call_model(
        model="gpt-5.6-sol",
        reasoning_effort="high",
        timeout_seconds=1,
        max_retries=0,
        model_input="question",
        web_search_enabled=False,
    )

    assert text == "partial premium text"
    assert sources == []
    assert debug["provider_status"] == "timeout"
    assert debug["stream_partial_available"] is True
    assert debug["stream_timeout_after_partial"] is True
    assert responses.calls[0]["stream"] is True


def test_premium_partial_research_uses_context_only_terminal_recovery(monkeypatch) -> None:
    service = PremiumDirectAnswerService()
    service.minimum_fallback_budget_ms = 100_000
    service.final_response_reserve_ms = 0
    service.terminal_min_start_budget_ms = 1
    service.terminal_synthesis_target_ms = 1_000
    calls: list[dict] = []
    partial_text = "raw partial Sol text"
    source = {"url": "https://www.example.gov.au/official", "title": "Official source"}

    def fake_call_model(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            assert kwargs["model"] == service.primary_model
            return partial_text, [source], {
                "provider_status": "timeout",
                "stream_partial_available": True,
                "stream_timeout_after_partial": True,
            }
        assert kwargs["web_search_enabled"] is False
        assert partial_text in kwargs["model_input"]
        return "Useful terminal answer based on the available context.", [], {
            "provider_status": "ok",
            "stream_partial_available": False,
        }

    monkeypatch.setattr(service, "_call_model", fake_call_model)

    response = service.answer(
        payload=QueryRequest(question="Explain the available visa options."),
        original_question="Explain the available visa options.",
        effective_question="Explain the available visa options.",
        response_language="en",
        matter_id=None,
    )

    assert response.answer
    assert "Useful terminal answer" in response.answer
    assert partial_text not in response.answer
    assert response.research_status == "incomplete"
    premium_debug = response.retrieval_debug["premium_direct_answer"]
    assert premium_debug["terminal_recovery_triggered"] is True
    assert premium_debug["terminal_web_search_enabled"] is False
    assert len(calls) == 2
