from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.schemas.query import QueryRequest
from app.services import premium_direct_answer_service as premium_module
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.premium_direct_answer_service import PremiumDirectAnswerService


class FakeClock:
    def __init__(self, value: float = 100.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value

    def advance_ms(self, milliseconds: float) -> None:
        self.value += milliseconds / 1000.0


class FakeResponse:
    def __init__(self, output_text: str, output: list[dict] | None = None) -> None:
        self.output_text = output_text
        self.id = "resp-test"
        self._data = {"output": output or []}

    def model_dump(self) -> dict:
        return self._data


def _service(monkeypatch, **values: str) -> PremiumDirectAnswerService:
    defaults = {
        "PREMIUM_DIRECT_WEB_SEARCH_ENABLED": "true",
        "PREMIUM_DIRECT_WEB_SEARCH_REQUIRED": "false",
        "PREMIUM_DIRECT_LANE_BUDGET_MS": "45000",
        "PREMIUM_DIRECT_RESEARCH_TARGET_MS": "40000",
        "PREMIUM_DIRECT_TERMINAL_TARGET_MS": "20000",
        "PREMIUM_DIRECT_FINAL_RESPONSE_RESERVE_MS": "3000",
        "PREMIUM_DIRECT_TERMINAL_MIN_START_BUDGET_MS": "5000",
        "PREMIUM_DIRECT_PRIMARY_TIMEOUT_SECONDS": "50",
        "PREMIUM_DIRECT_FALLBACK_TIMEOUT_SECONDS": "55",
        "PREMIUM_DIRECT_MAX_TOOL_CALLS": "2",
        "PREMIUM_DIRECT_PRIMARY_MAX_RETRIES": "0",
        "PREMIUM_DIRECT_FALLBACK_MAX_RETRIES": "0",
    }
    defaults.update(values)
    for name, value in defaults.items():
        monkeypatch.setenv(name, value)
    return PremiumDirectAnswerService()


def _capturing_client(monkeypatch, service: PremiumDirectAnswerService, response: FakeResponse):
    calls: list[dict] = []

    class FakeResponses:
        def create(self, **kwargs):
            calls.append(kwargs)
            return response

    monkeypatch.setattr(
        service,
        "_client",
        lambda **kwargs: (
            calls.append({"client": kwargs}) or SimpleNamespace(responses=FakeResponses())
        ),
    )
    return calls


def test_stage_a_premium_research_defaults_are_bounded(monkeypatch) -> None:
    for name in (
        "PREMIUM_DIRECT_PRIMARY_REASONING_EFFORT",
        "PREMIUM_DIRECT_REASONING_EFFORT",
        "PREMIUM_DIRECT_WEB_SEARCH_CONTEXT_SIZE",
        "PREMIUM_DIRECT_MAX_TOOL_CALLS",
        "PREMIUM_DIRECT_RESEARCH_TARGET_MS",
        "PREMIUM_DIRECT_FALLBACK_MIN_START_BUDGET_MS",
        "PREMIUM_DIRECT_MIN_FALLBACK_BUDGET_MS",
    ):
        monkeypatch.delenv(name, raising=False)
    service = PremiumDirectAnswerService()

    assert service.primary_model == "gpt-5.6-sol"
    assert service.primary_reasoning_effort == "medium"
    assert service.web_search_context_size == "medium"
    assert service.max_tool_calls == 2
    assert service.research_stage_target_ms == 40000
    assert service.minimum_fallback_budget_ms == 10000
    assert service.terminal_reasoning_effort == "low"
    assert service.terminal_synthesis_target_ms == 20000


def test_normal_premium_exposes_optional_web_search_with_auto_tool_choice(monkeypatch) -> None:
    service = _service(monkeypatch)
    calls = _capturing_client(monkeypatch, service, FakeResponse("answer"))

    service._call_model(
        model="gpt-5.6-sol",
        reasoning_effort="high",
        timeout_seconds=10,
        max_retries=0,
        model_input="question",
    )

    request = calls[-1]
    assert request["tools"] == [{"type": "web_search", "search_context_size": "medium"}]
    assert request["tool_choice"] == "auto"
    assert request["max_tool_calls"] == 2
    assert request["include"] == [
        "web_search_call.action.sources",
        "web_search_call.results",
    ]


def test_search_can_be_disabled_without_search_request_fields(monkeypatch) -> None:
    service = _service(monkeypatch, PREMIUM_DIRECT_WEB_SEARCH_ENABLED="false")
    calls = _capturing_client(monkeypatch, service, FakeResponse("answer"))

    service._call_model(
        model="gpt-5.6-sol",
        reasoning_effort="high",
        timeout_seconds=10,
        max_retries=0,
        model_input="question",
    )

    request = calls[-1]
    assert "tools" not in request
    assert "include" not in request
    assert "tool_choice" not in request
    assert "max_tool_calls" not in request


def test_max_tool_calls_is_configurable_with_safe_default(monkeypatch) -> None:
    assert _service(monkeypatch).max_tool_calls == 2
    service = _service(monkeypatch, PREMIUM_DIRECT_MAX_TOOL_CALLS="2")
    calls = _capturing_client(monkeypatch, service, FakeResponse("answer"))

    service._call_model(
        model="gpt-5.6-sol",
        reasoning_effort="high",
        timeout_seconds=10,
        max_retries=0,
        model_input="question",
    )

    assert calls[-1]["max_tool_calls"] == 2


@pytest.mark.parametrize("value", ["0", "11", "not-an-int"])
def test_max_tool_calls_invalid_values_use_safe_default(monkeypatch, value: str) -> None:
    assert _service(monkeypatch, PREMIUM_DIRECT_MAX_TOOL_CALLS=value).max_tool_calls == 2


def test_required_search_is_only_an_explicit_override(monkeypatch) -> None:
    service = _service(monkeypatch, PREMIUM_DIRECT_WEB_SEARCH_REQUIRED="true")
    calls = _capturing_client(monkeypatch, service, FakeResponse("answer"))

    service._call_model(
        model="gpt-5.6-sol",
        reasoning_effort="high",
        timeout_seconds=10,
        max_retries=0,
        model_input="question",
    )

    assert calls[-1]["tool_choice"] == "required"

    normal_service = _service(monkeypatch)
    assert normal_service.web_search_enabled is True
    assert normal_service.web_search_required is False


def test_no_search_answer_succeeds_without_fallback(monkeypatch) -> None:
    service = _service(monkeypatch)
    calls: list[str] = []

    def fake_call(**kwargs):
        calls.append(kwargs["model"])
        return "closed-book answer", [], {"web_search_request_mode": "web_search"}

    monkeypatch.setattr(service, "_call_model", fake_call)
    response = service.answer(
        payload=QueryRequest(question="What is a visa?"),
        original_question="What is a visa?",
        effective_question="What is a visa?",
        response_language="en",
        matter_id=None,
    )

    assert response.answer.endswith("closed-book answer")
    assert calls == [service.primary_model]
    assert response.compact_sources == []
    assert response.retrieval_debug["premium_direct_answer"]["live_web_search_used"] is False


def test_model_input_removes_duplicate_optimistic_user_message_and_keeps_history(
    monkeypatch,
) -> None:
    service = _service(monkeypatch)
    captured: dict[str, str] = {}

    def fake_call(**kwargs):
        captured["input"] = kwargs["model_input"]
        captured["instructions"] = kwargs["instructions"]
        return "answer", [], {}

    monkeypatch.setattr(service, "_call_model", fake_call)
    current_question = "Can I apply for this visa?"
    response = service.answer(
        payload=QueryRequest(
            question=current_question,
            frontend_messages=[
                {"role": "user", "text": "I finished my studies last year."},
                {"role": "assistant", "text": "That may be relevant."},
                {"role": "user", "text": "  Can I apply for this visa?  "},
            ],
        ),
        original_question=current_question,
        effective_question=current_question,
        response_language="en",
        matter_id=None,
    )

    assert response.answer.endswith("answer")
    assert captured["input"].count(current_question) == 1
    assert "I finished my studies last year." in captured["input"]
    assert "That may be relevant." in captured["input"]
    assert "Use available web search" not in captured["input"]
    assert "stop researching once the material issues are sufficiently supported" in captured["instructions"]


def test_instructions_are_separate_from_lightweight_input(monkeypatch) -> None:
    service = _service(monkeypatch)
    calls = _capturing_client(monkeypatch, service, FakeResponse("answer"))

    service._call_model(
        model="gpt-5.6-sol",
        reasoning_effort="high",
        timeout_seconds=10,
        max_retries=0,
        model_input="Latest question only",
        instructions=service._model_instructions(is_zh=False),
    )

    request = calls[-1]
    assert request["input"] == "Latest question only"
    assert request["instructions"] == service._model_instructions(is_zh=False)
    assert "Latest question only" not in request["instructions"]


def test_searched_answer_preserves_all_actual_sources_without_cap(monkeypatch) -> None:
    service = _service(monkeypatch)
    sources = [
        {"title": f"Source {index}", "url": f"https://example.test/{index}"}
        for index in range(12)
    ]
    monkeypatch.setattr(
        service,
        "_call_model",
        lambda **_kwargs: ("searched answer", sources, {
            "web_search_request_mode": "web_search",
            "web_search_returned_sources": True,
        }),
    )

    response = service.answer(
        payload=QueryRequest(question="What changed recently?"),
        original_question="What changed recently?",
        effective_question="What changed recently?",
        response_language="en",
        matter_id=None,
    )

    assert len(response.compact_sources) == 12
    assert "https://example.test/11" in response.answer
    assert response.retrieval_debug["premium_direct_answer"]["live_web_search_used"] is True


def test_primary_and_fallback_clients_are_created_with_zero_retries(monkeypatch) -> None:
    service = _service(
        monkeypatch,
        PREMIUM_DIRECT_PRIMARY_MAX_RETRIES="3",
        PREMIUM_DIRECT_FALLBACK_MAX_RETRIES="2",
    )
    assert service.primary_max_retries == 0
    assert service.fallback_max_retries == 0
    service.settings = SimpleNamespace(openai_api_key="test-key")
    client_args: list[dict] = []

    class FakeOpenAI:
        def __init__(self, **kwargs):
            client_args.append(kwargs)

    monkeypatch.setattr(premium_module, "OpenAI", FakeOpenAI)
    service._client(timeout_seconds=3, max_retries=service.primary_max_retries)
    service._client(timeout_seconds=4, max_retries=service.fallback_max_retries)

    assert [item["max_retries"] for item in client_args] == [0, 0]


def test_quick_primary_failure_gets_bounded_fallback_budget(monkeypatch) -> None:
    service = _service(
        monkeypatch,
        PREMIUM_DIRECT_LANE_BUDGET_MS="10000",
        PREMIUM_DIRECT_PRIMARY_TIMEOUT_SECONDS="10",
        PREMIUM_DIRECT_FALLBACK_TIMEOUT_SECONDS="10",
        PREMIUM_DIRECT_MIN_FALLBACK_BUDGET_MS="1000",
    )
    clock = FakeClock()
    deadline = AbsoluteTurnDeadline(100.0, 10000, clock=clock)
    calls: list[dict] = []

    def fake_call(**kwargs):
        calls.append(kwargs)
        if kwargs["model"] == service.primary_model:
            clock.advance_ms(1500)
            raise TimeoutError("primary failed")
        return "fallback answer", [], {}

    monkeypatch.setattr(service, "_call_model", fake_call)
    answer, _sources, debug = service._answer_with_fallback(
        model_input="question", deadline=deadline
    )

    assert answer == "fallback answer"
    assert [call["model"] for call in calls] == [service.primary_model, service.fallback_model]
    assert calls[0]["timeout_seconds"] == pytest.approx(10)
    assert calls[1]["timeout_seconds"] == pytest.approx(8.5)
    assert debug["fallback_budget_ms"] == pytest.approx(8500)
    assert debug["fallback_skipped_due_to_budget"] is False


def test_exhausted_primary_budget_uses_protected_terminal_synthesis(monkeypatch) -> None:
    service = _service(
        monkeypatch,
        PREMIUM_DIRECT_LANE_BUDGET_MS="10000",
        PREMIUM_DIRECT_RESEARCH_TARGET_MS="6500",
        PREMIUM_DIRECT_TERMINAL_TARGET_MS="3000",
        PREMIUM_DIRECT_FINAL_RESPONSE_RESERVE_MS="1000",
        PREMIUM_DIRECT_TERMINAL_MIN_START_BUDGET_MS="500",
        PREMIUM_DIRECT_PRIMARY_TIMEOUT_SECONDS="10",
        PREMIUM_DIRECT_FALLBACK_TIMEOUT_SECONDS="55",
    )
    clock = FakeClock()
    deadline = AbsoluteTurnDeadline(100.0, 10000, clock=clock)
    calls: list[dict] = []

    def fake_call(**kwargs):
        calls.append(kwargs)
        if kwargs["model"] == service.primary_model:
            clock.advance_ms(6000)
            raise TimeoutError("primary consumed research window")
        return "terminal best-effort answer", [], {
            "web_search_request_mode": "disabled",
        }

    monkeypatch.setattr(service, "_call_model", fake_call)
    answer, sources, debug = service._answer_with_fallback(
        model_input="question", deadline=deadline
    )

    assert answer == "terminal best-effort answer"
    assert sources == []
    assert [call["model"] for call in calls] == [
        service.primary_model,
        service.terminal_model,
    ]
    assert debug["fallback_skipped_due_to_budget"] is True
    assert debug["fallback_budget_ms"] < service.minimum_fallback_budget_ms
    assert debug["terminal_recovery_triggered"] is True
    assert debug["terminal_web_search_enabled"] is False
    assert debug["research_status"] == "incomplete"
    assert debug["completion_status"] == "partial_timeout"


def test_fallback_is_skipped_when_only_three_seconds_research_budget_remains(monkeypatch) -> None:
    service = _service(
        monkeypatch,
        PREMIUM_DIRECT_LANE_BUDGET_MS="20000",
        PREMIUM_DIRECT_RESEARCH_TARGET_MS="10000",
        PREMIUM_DIRECT_TERMINAL_TARGET_MS="3000",
        PREMIUM_DIRECT_FINAL_RESPONSE_RESERVE_MS="1000",
        PREMIUM_DIRECT_TERMINAL_MIN_START_BUDGET_MS="500",
    )
    clock = FakeClock()
    deadline = AbsoluteTurnDeadline(100.0, 20000, clock=clock)
    calls: list[str] = []

    def fake_call(**kwargs):
        calls.append(kwargs["model"])
        if kwargs["model"] == service.primary_model:
            clock.advance_ms(7000)
            raise TimeoutError("research timeout")
        return "terminal answer", [], {"provider_status": "ok"}

    monkeypatch.setattr(service, "_call_model", fake_call)
    answer, _sources, debug = service._answer_with_fallback(
        model_input="question",
        deadline=deadline,
    )

    assert answer == "terminal answer"
    assert calls == [service.primary_model, service.terminal_model]
    assert debug["fallback_skipped_due_to_budget"] is True
    assert debug["fallback_budget_ms"] == pytest.approx(3000)


def test_terminal_call_forcibly_omits_all_web_search_fields(monkeypatch) -> None:
    service = _service(monkeypatch)
    calls = _capturing_client(monkeypatch, service, FakeResponse("answer"))

    service._call_model(
        model=service.terminal_model,
        reasoning_effort=service.terminal_reasoning_effort,
        timeout_seconds=3,
        max_retries=0,
        model_input="question",
        instructions=service._terminal_instructions(),
        web_search_enabled=False,
    )

    request = calls[-1]
    assert "tools" not in request
    assert "web_search" not in str(request)
    assert "web_search_preview" not in str(request)
    assert "include" not in request
    assert "tool_choice" not in request
    assert "max_tool_calls" not in request


def test_terminal_failure_returns_deterministic_non_empty_safe_failure(monkeypatch) -> None:
    service = _service(
        monkeypatch,
        PREMIUM_DIRECT_LANE_BUDGET_MS="10000",
        PREMIUM_DIRECT_RESEARCH_TARGET_MS="6500",
        PREMIUM_DIRECT_TERMINAL_TARGET_MS="3000",
        PREMIUM_DIRECT_FINAL_RESPONSE_RESERVE_MS="1000",
        PREMIUM_DIRECT_TERMINAL_MIN_START_BUDGET_MS="500",
    )
    clock = FakeClock()
    calls: list[dict] = []

    def fake_call(**kwargs):
        calls.append(kwargs)
        if kwargs["model"] == service.primary_model:
            clock.advance_ms(6500)
        raise TimeoutError("provider failed")

    monkeypatch.setattr(service, "_call_model", fake_call)
    response = service.answer(
        payload=QueryRequest(question="What is the deadline?"),
        original_question="What is the deadline?",
        effective_question="What is the deadline?",
        response_language="en",
        matter_id=None,
    )

    assert response.answer.strip()
    assert response.research_status == "incomplete"
    assert "couldn't complete the research" in response.answer.lower()
    assert len(calls) == 2


def test_timeout_zero_sources_does_not_serve_exact_current_fee_from_memory(monkeypatch) -> None:
    service = _service(
        monkeypatch,
        PREMIUM_DIRECT_RESEARCH_TARGET_MS="1",
        PREMIUM_DIRECT_TERMINAL_TARGET_MS="3000",
        PREMIUM_DIRECT_FINAL_RESPONSE_RESERVE_MS="1000",
        PREMIUM_DIRECT_TERMINAL_MIN_START_BUDGET_MS="500",
    )
    calls: list[dict] = []

    def fake_call(**kwargs):
        calls.append(kwargs)
        if kwargs["model"] == service.primary_model:
            raise TimeoutError("research timed out")
        return "The latest amount I can reliably state is AUD 2,000.", [], {}

    monkeypatch.setattr(service, "_call_model", fake_call)
    response = service.answer(
        payload=QueryRequest(question="What is the current student visa fee?"),
        original_question="What is the current student visa fee?",
        effective_question="What is the current student visa fee?",
        response_language="en",
        matter_id=None,
    )

    assert response.answer.strip()
    assert response.research_status == "incomplete"
    assert "AUD 2,000" not in response.answer
    assert "latest amount" not in response.answer.lower()
    assert len(calls) == 2
    debug = response.retrieval_debug["premium_direct_answer"]
    assert debug["verified_source_count"] == 0
    assert debug["terminal_output_suppressed_due_to_unverified_current_fact"] is True


def test_timeout_with_genuine_source_metadata_allows_supported_terminal_fact(monkeypatch) -> None:
    service = _service(
        monkeypatch,
        PREMIUM_DIRECT_RESEARCH_TARGET_MS="500",
        PREMIUM_DIRECT_TERMINAL_TARGET_MS="3000",
        PREMIUM_DIRECT_FINAL_RESPONSE_RESERVE_MS="1000",
        PREMIUM_DIRECT_TERMINAL_MIN_START_BUDGET_MS="500",
        PREMIUM_DIRECT_MIN_FALLBACK_BUDGET_MS="1000",
    )
    clock = FakeClock()
    deadline = AbsoluteTurnDeadline(100.0, 10000, clock=clock)
    source = {"title": "Official fee page", "url": "https://example.gov.au/fees"}
    calls: list[dict] = []

    def fake_call(**kwargs):
        calls.append(kwargs)
        if kwargs["model"] == service.primary_model:
            return "", [source], {}
        return "The supported amount is AUD 2,000.", [], {}

    monkeypatch.setattr(service, "_call_model", fake_call)
    answer, sources, debug = service._answer_with_fallback(
        model_input="What is the current fee?",
        deadline=deadline,
        current_fact_request=True,
    )

    assert answer == "The supported amount is AUD 2,000."
    assert sources == [source]
    assert debug["verified_source_count"] == 1
    assert "verified_source_count=1" in calls[-1]["instructions"]
    assert "https://example.gov.au/fees" in calls[-1]["instructions"]


def test_timeout_stable_general_question_keeps_useful_terminal_answer(monkeypatch) -> None:
    service = _service(
        monkeypatch,
        PREMIUM_DIRECT_RESEARCH_TARGET_MS="1",
        PREMIUM_DIRECT_TERMINAL_TARGET_MS="3000",
        PREMIUM_DIRECT_FINAL_RESPONSE_RESERVE_MS="1000",
        PREMIUM_DIRECT_TERMINAL_MIN_START_BUDGET_MS="500",
    )
    monkeypatch.setattr(
        service,
        "_call_model",
        lambda **kwargs: (
            "Generally, a visa is permission to enter or remain subject to its conditions.",
            [],
            {},
        )
        if kwargs["model"] != service.primary_model
        else (_ for _ in ()).throw(TimeoutError("research timed out")),
    )

    response = service.answer(
        payload=QueryRequest(question="What is a visa?"),
        original_question="What is a visa?",
        effective_question="What is a visa?",
        response_language="en",
        matter_id=None,
    )

    assert "Generally, a visa" in response.answer
    assert response.research_status == "incomplete"
    assert response.retrieval_debug["premium_direct_answer"]["completion_status"] == "partial_timeout"


def test_terminal_failure_with_recovered_sources_uses_deterministic_salvage(monkeypatch) -> None:
    service = _service(monkeypatch)
    sources = [
        {"title": "Official fee page", "url": "https://example.gov.au/fees"},
        {"title": "Official fee page duplicate", "url": "https://example.gov.au/fees/"},
    ]
    monkeypatch.setattr(
        service,
        "_answer_with_fallback",
        lambda **_kwargs: (
            "",
            sources,
            {
                "terminal_recovery_triggered": True,
                "completion_status": "safe_failure",
                "research_status": "incomplete",
                "recovered_citation_count": 1,
            },
        ),
    )

    response = service.answer(
        payload=QueryRequest(question="What is the current fee?"),
        original_question="What is the current fee?",
        effective_question="What is the current fee?",
        response_language="en",
        matter_id=None,
    )

    debug = response.retrieval_debug["premium_direct_answer"]
    assert response.research_status == "incomplete"
    assert debug["completion_status"] == "evidence_salvage"
    assert debug["evidence_salvage_triggered"] is True
    assert response.escalate is True
    assert len(response.compact_sources) == 1
    assert "https://example.gov.au/fees" in response.answer
    assert "safe failure" not in response.answer.lower()
    assert "AUD" not in response.answer


def test_fallback_success_is_served_with_shared_budget_debug(monkeypatch) -> None:
    service = _service(monkeypatch, PREMIUM_DIRECT_LANE_BUDGET_MS="12000")
    clock = FakeClock()
    deadline = AbsoluteTurnDeadline(100.0, 12000, clock=clock)

    def fake_call(**kwargs):
        if kwargs["model"] == service.primary_model:
            clock.advance_ms(200)
            raise RuntimeError("primary unavailable")
        return "Luna fallback answer", [], {"web_search_request_mode": "web_search"}

    monkeypatch.setattr(service, "_call_model", fake_call)
    answer, _sources, debug = service._answer_with_fallback(
        model_input="question", deadline=deadline
    )

    assert answer == "Luna fallback answer"
    assert debug["serving_model"] == service.fallback_model
    assert debug["used_fallback_model"] is True
    assert debug["premium_lane_budget_ms"] == 12000
    assert 0 < debug["fallback_budget_ms"] <= service.fallback_timeout_seconds * 1000


def test_premium_prompt_uses_epistemic_need_policy_in_english_and_chinese(monkeypatch) -> None:
    service = _service(monkeypatch)
    english = service._model_instructions(is_zh=False)
    chinese = service._model_instructions(is_zh=True)

    for prompt in (english, chinese):
        assert "current" in prompt.lower() or "当前" in prompt
        assert "exact" in prompt.lower() or "准确" in prompt
        assert "authoritative" in prompt.lower() or "权威" in prompt
        assert (
            "unnecessarily" in prompt.lower()
            or "不必要" in prompt
            or "不要调用研究工具" in prompt
        )
        assert (
            "fabricate" in prompt.lower()
            or "invent" in prompt.lower()
            or "编造" in prompt
        )

    assert "use the available web-search tool proactively" not in english.lower()
    assert "do not stop merely because one relevant result" not in english.lower()
    assert "主动检索" not in chinese
    assert "不要因为找到第一个相关页面就停止" not in chinese
    assert "stop researching once the material issues are sufficiently supported" in english.lower()
    assert "一旦足以回答实质问题就停止" in chinese


def test_premium_response_records_direct_isolation_contract(monkeypatch) -> None:
    service = _service(monkeypatch)
    monkeypatch.setattr(
        service,
        "_call_model",
        lambda **_kwargs: ("answer", [], {}),
    )

    response = service.answer(
        payload=QueryRequest(question="Explain a visa term"),
        original_question="Explain a visa term",
        effective_question="Explain a visa term",
        response_language="en",
        matter_id=None,
    )
    debug = response.retrieval_debug["premium_direct_answer"]

    assert response.retrieval_debug["semantic_turn_analysis"] == {}
    assert debug["system_prompt_sent_to_answer_model"] is False
    assert "local_rag_retrieval" in debug["skipped_pipeline"]
    assert "customer_answer_plan_helper_chain" in debug["skipped_pipeline"]
