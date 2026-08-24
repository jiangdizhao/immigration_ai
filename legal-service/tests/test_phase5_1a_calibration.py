"""Phase 5.1A — Luna calibration / observability correction tests.

All tests use mocked provider output. No live OpenAI calls.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.core.config import Settings
from app.schemas.agent import ProviderCallObservation
from app.services.agent_observability_service import AgentObservabilityService
from app.services.agent_policy_service import AgentPolicyService
from app.services.agent_runtime_service import ProviderResponse
from app.services.request_evidence_registry import create_registry


def _settings(*, reasoning_effort: str | None = None) -> Settings:
    kwargs = {
        "DATABASE_URL": "postgresql://test",
        "OPENAI_API_KEY": "test",
    }
    if reasoning_effort is not None:
        kwargs["DEFAULT_AGENT_REASONING_EFFORT"] = reasoning_effort
    return Settings(**kwargs)


# --- A. Reason-effort configuration and flow ---


def test_default_reasoning_effort_is_low() -> None:
    assert _settings().default_agent_reasoning_effort == "low"


def test_reasoning_effort_can_be_overridden_to_low() -> None:
    assert _settings(reasoning_effort="low").default_agent_reasoning_effort == "low"


def test_reasoning_effort_can_be_overridden_to_none() -> None:
    assert _settings(reasoning_effort="none").default_agent_reasoning_effort == "none"


def test_reasoning_effort_reaches_agent_policy() -> None:
    settings = _settings(reasoning_effort="low")
    with patch("app.services.agent_policy_service.get_settings", return_value=settings):
        policy_service = AgentPolicyService()
        policy = policy_service.build_policy(mode="default", experiment_arm="A")
    assert policy.reasoning_effort == "low"
    assert policy.model == "gpt-5.6-luna"
    assert policy.tool_choice == "auto"


def test_agent_policy_default_effort_is_low_baseline() -> None:
    settings = _settings()
    with patch("app.services.agent_policy_service.get_settings", return_value=settings):
        policy = AgentPolicyService().build_policy(mode="default", experiment_arm="A")
    assert policy.reasoning_effort == "low"


async def test_responses_adapter_sends_reasoning_effort() -> None:
    from app.services.openai_responses_adapter import OpenAIResponsesAdapter

    captured: dict = {}

    class FakeResponses:
        def create(self, **kwargs):
            captured["params"] = kwargs
            return SimpleNamespace(id="resp-1", output=[], usage=None)

    adapter = OpenAIResponsesAdapter(client=SimpleNamespace(responses=FakeResponses()))
    await adapter.call(
        system_prompt="test", user_text="test", model="gpt-5.6-luna",
        tools=[], reasoning_effort="low", timeout_ms=1000,
        registry=create_registry("effort-adapter"),
    )
    assert captured["params"]["reasoning"] == {"effort": "low"}


def test_provider_observation_records_configured_effort() -> None:
    resp = ProviderResponse(response_id="resp-1", model="gpt-5.6-luna", status="ok", effort="medium")
    observation = ProviderCallObservation(
        stage="answer_research", call_index=1, model="gpt-5.6-luna",
        effort=resp.effort, duration_ms=10.0, remaining_deadline_before_call_ms=32000.0,
    )
    assert observation.effort == "medium"


def test_observability_provider_call_records_effort() -> None:
    class _Clock:
        def __init__(self) -> None:
            self.value = 0.0

        def __call__(self) -> float:
            return self.value

    service = AgentObservabilityService(clock=_Clock())
    token = service.begin_turn(mode="default", turn_deadline_ms=40000)
    try:
        service.record_provider_call(
            stage="answer_research", response_id="resp-1", model="gpt-5.6-luna",
            effort="low", duration_ms=100, status="ok",
        )
        metrics = service.snapshot()
        assert metrics is not None
        assert metrics.provider_calls[0].effort == "low"
    finally:
        service.reset_turn(token)


# --- B. Provider-native web-search telemetry ---


def _native_web_response(*, calls: int = 1, sources: int = 1, citations: int = 1) -> dict:
    output = []
    for i in range(calls):
        srcs = [
            SimpleNamespace(type="url", url=f"https://example.gov.au/page-{i}-{j}", title=f"Page {i}-{j}")
            for j in range(sources)
        ]
        output.append(
            SimpleNamespace(
                type="web_search_call", id=f"ws-{i}",
                action=SimpleNamespace(type="search", queries=["some legal research query"], sources=srcs),
            )
        )
    annotations = [
        SimpleNamespace(type="url_citation", start_index=0, end_index=10, title="Cited page", url=f"https://example.gov.au/cited-{k}")
        for k in range(citations)
    ]
    output.append(
        SimpleNamespace(
            type="message",
            content=[SimpleNamespace(type="output_text", text="The cited page helps.", annotations=annotations)],
        )
    )
    return {"id": "resp-native", "output": output, "usage": None}


async def _run_adapter(resp: dict) -> ProviderResponse:
    from app.services.openai_responses_adapter import OpenAIResponsesAdapter

    class FakeResponses:
        def create(self, **kwargs):
            return SimpleNamespace(**resp)

    adapter = OpenAIResponsesAdapter(client=SimpleNamespace(responses=FakeResponses()))
    result = await adapter.call(
        system_prompt="test", user_text="test", model="gpt-5.6-luna",
        tools=[{"type": "web_search"}], timeout_ms=1000,
        registry=create_registry("native-web"),
    )
    assert result.status == "ok"
    return result


async def test_single_native_web_search_call_counted() -> None:
    resp = await _run_adapter(_native_web_response(calls=1, sources=1, citations=0))
    assert resp.native_web_search_call_count == 1
    assert resp.native_web_source_count == 1
    assert resp.native_web_citation_count == 0


async def test_multiple_native_web_search_calls_counted() -> None:
    resp = await _run_adapter(_native_web_response(calls=3, sources=1, citations=0))
    assert resp.native_web_search_call_count == 3


async def test_native_sources_counted() -> None:
    resp = await _run_adapter(_native_web_response(calls=1, sources=4, citations=0))
    assert resp.native_web_source_count == 4


async def test_native_citation_annotations_counted() -> None:
    resp = await _run_adapter(_native_web_response(calls=1, sources=0, citations=3))
    assert resp.native_web_citation_count == 3


async def test_flat_rag_does_not_increment_native_web_search() -> None:
    from app.services.openai_responses_adapter import OpenAIResponsesAdapter

    class FakeResponses:
        def create(self, **kwargs):
            return SimpleNamespace(
                id="resp-flat",
                output=[SimpleNamespace(type="function_call", call_id="flat-1", name="flat_rag_search", arguments='{"query":"test"}')],
                usage=None,
            )

    adapter = OpenAIResponsesAdapter(client=SimpleNamespace(responses=FakeResponses()))
    result = await adapter.call(
        system_prompt="test", user_text="test", model="gpt-5.6-luna",
        tools=[{"type": "function", "name": "flat_rag_search"}], timeout_ms=1000,
        registry=create_registry("flat-no-native"),
    )
    assert result.native_web_search_call_count == 0
    assert result.native_web_source_count == 0
    assert result.native_web_citation_count == 0


async def test_model_prose_url_does_not_increment_native_web_search() -> None:
    from app.services.openai_responses_adapter import OpenAIResponsesAdapter

    class FakeResponses:
        def create(self, **kwargs):
            return SimpleNamespace(
                id="resp-prose",
                output=[SimpleNamespace(
                    type="message",
                    content=[SimpleNamespace(type="output_text", text="See https://example.gov.au/page for details.", annotations=[])],
                )],
                usage=None,
            )

    adapter = OpenAIResponsesAdapter(client=SimpleNamespace(responses=FakeResponses()))
    result = await adapter.call(
        system_prompt="test", user_text="test", model="gpt-5.6-luna",
        tools=[], timeout_ms=1000, registry=create_registry("prose-url"),
    )
    assert result.native_web_search_call_count == 0
    assert result.native_web_source_count == 0
    assert result.native_web_citation_count == 0


def test_native_web_metrics_aggregated_into_execution_metrics() -> None:
    obs = ProviderCallObservation(
        stage="answer_research", call_index=1, model="gpt-5.6-luna",
        native_web_search_call_count=2, native_web_source_count=3, native_web_citation_count=4,
        duration_ms=10.0, remaining_deadline_before_call_ms=32000.0,
    )
    assert obs.native_web_search_call_count == 2
    assert obs.native_web_source_count == 3
    assert obs.native_web_citation_count == 4


def test_eval_runner_serializes_native_web_and_effort_fields() -> None:
    from scripts.run_architecture_eval import summarize

    rows = [{
        "arm": "luna_web", "status": "completed", "total_duration_ms": 1000,
        "web_search_call_count": 1, "native_web_search_call_count": 1,
        "native_web_source_count": 3, "native_web_citation_count": 2,
        "reasoning_effort": "medium", "flat_rag_call_count": 0,
        "canonical_local_evidence_count": 0, "native_web_evidence_count": 3,
    }]
    arm = summarize(rows)["by_arm"]["luna_web"]
    assert arm["native_web_search_calls"] == 1
    assert arm["native_web_sources"] == 3
    assert arm["native_web_citations"] == 2


# --- C. Regression behavior ---


def test_arm_a_tools_unchanged() -> None:
    settings = _settings()
    with patch("app.services.agent_policy_service.get_settings", return_value=settings):
        policy_service = AgentPolicyService()
        policy = policy_service.build_policy(mode="default", experiment_arm="A")
    names = policy_service.get_tool_names(policy)
    assert "web_search" in names
    assert "deterministic_utility" in names
    assert "submit_answer" in names
    assert "flat_rag_search" not in names
    assert "lightrag_search" not in names


def test_arm_b_tools_unchanged() -> None:
    settings = _settings()
    settings.flat_rag_tool_enabled = True
    with patch("app.services.agent_policy_service.get_settings", return_value=settings):
        policy_service = AgentPolicyService()
        policy = policy_service.build_policy(mode="default", experiment_arm="B")
    names = policy_service.get_tool_names(policy)
    assert "web_search" in names
    assert "flat_rag_search" in names
    assert "deterministic_utility" in names
    assert "submit_answer" in names
    assert "lightrag_search" not in names


def test_flat_rag_cap_and_deadlines_unchanged() -> None:
    settings = _settings()
    assert settings.agent_max_flat_rag_calls == 1
    assert settings.default_turn_deadline_ms == 60000
    assert settings.default_answer_research_target_ms == 32000
    assert settings.agent_retry_viability_threshold_ms == 8000
