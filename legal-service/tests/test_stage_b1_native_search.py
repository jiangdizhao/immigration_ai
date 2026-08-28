from __future__ import annotations

import asyncio
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from app.core.config import Settings
from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.agent_policy_service import AgentPolicyService
from app.services.openai_responses_adapter import consume_responses_stream
from app.services.search_privacy_guard import SearchPrivacyGuard
from app.services.agent_runtime_service import AgentRuntimeService, ProviderResponse
from app.services.request_evidence_registry import create_registry
from app.services.tool_executor_service import ToolCallRequest, normalized_tool_call_key
from scripts.stage_b1_control_harness import (
    _authoritative_database_guard,
    build_direct_request_shape,
)


class FakeClock:
    def __init__(self) -> None:
        self.value = 0.0

    def __call__(self) -> float:
        return self.value


class TimedEvents:
    def __init__(self, clock: FakeClock, events: list[tuple[float, object]]) -> None:
        self.clock = clock
        self.events = events
        self.closed = False

    def __iter__(self):
        for at, event in self.events:
            self.clock.value = at
            yield event

    def close(self) -> None:
        self.closed = True


def test_default_arm_n_exposes_optional_research_capabilities_and_required_submit():
    settings = Settings(
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        FLAT_RAG_TOOL_ENABLED=True,
    )
    with patch("app.services.agent_policy_service.get_settings", return_value=settings):
        policy = AgentPolicyService().build_policy(mode="default", experiment_arm="N")

    names = AgentPolicyService().get_tool_names(policy)
    assert names == [
        "web_search",
        "flat_rag_search",
        "schedule2_navigation",
        "exact_legal_lookup",
        "deterministic_utility",
        "submit_answer",
    ]
    assert "minimum sufficient" in policy.system_prompt
    assert "not mandatory" in policy.system_prompt
    assert "no mandatory tool combination" in policy.system_prompt
    assert "not legal evidence" in policy.system_prompt
    assert "preferred structural orientation" in policy.system_prompt
    assert "need not be the literal first tool call" in policy.system_prompt
    assert policy.tool_choice == "auto"


def test_luna_prompt_does_not_require_local_and_web_together():
    settings = Settings(
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        FLAT_RAG_TOOL_ENABLED=True,
    )
    with patch("app.services.agent_policy_service.get_settings", return_value=settings):
        policy = AgentPolicyService().build_policy(mode="default", experiment_arm="N")
    prompt = policy.system_prompt.lower()
    assert "use both available local legal retrieval and agentic web search" not in prompt
    assert "do not force local retrieval and web search together" in prompt
    assert "submit_answer" in prompt


def test_default_budget_defaults_are_calibrated_without_changing_premium_controls():
    settings = Settings(
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
    )
    assert settings.default_turn_deadline_ms == 75000
    assert settings.default_answer_research_target_ms == 45000
    assert settings.default_terminal_synthesis_target_ms == 20000
    assert settings.default_final_response_reserve_ms == 5000
    assert settings.premium_turn_deadline_ms == 90000
    assert settings.premium_answer_research_target_ms == 40000
    assert settings.terminal_synthesis_target_ms == 15000
    assert settings.final_response_reserve_ms == 3000


def test_same_round_duplicate_normalization_is_structural_only():
    first = ToolCallRequest(
        call_id="one",
        name="flat_rag_search",
        arguments={"query": "  visa   criteria ", "top_k": None, "preferred_source_types": None},
    )
    duplicate = ToolCallRequest(
        call_id="two",
        name="flat_rag_search",
        arguments={"preferred_source_types": None, "top_k": None, "query": "visa criteria"},
    )
    distinct_args = ToolCallRequest(
        call_id="three",
        name="flat_rag_search",
        arguments={"query": "visa fee", "top_k": None, "preferred_source_types": None},
    )
    different_tool = ToolCallRequest(
        call_id="four",
        name="exact_legal_lookup",
        arguments=first.arguments,
    )
    assert normalized_tool_call_key(first) == normalized_tool_call_key(duplicate)
    assert normalized_tool_call_key(first) != normalized_tool_call_key(distinct_args)
    assert normalized_tool_call_key(first) != normalized_tool_call_key(different_tool)


def test_runtime_suppresses_only_material_same_round_duplicates():
    settings = Settings(
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        FLAT_RAG_TOOL_ENABLED=True,
        AGENT_MAX_FLAT_RAG_CALLS=2,
        COMPACT_CHECKER_ENABLED=False,
    )
    calls: list[str] = []

    class Provider:
        def __init__(self) -> None:
            self.responses = [
                ProviderResponse(
                    response_id="research",
                    model="gpt-5.6-luna",
                    status="ok",
                    tool_calls=[
                        ToolCallRequest(
                            call_id="flat-1",
                            name="flat_rag_search",
                            arguments={"query": "  visa   criteria ", "top_k": None, "preferred_source_types": None},
                        ),
                        ToolCallRequest(
                            call_id="flat-2",
                            name="flat_rag_search",
                            arguments={"preferred_source_types": None, "top_k": None, "query": "visa criteria"},
                        ),
                    ],
                ),
                ProviderResponse(
                    response_id="submit",
                    model="gpt-5.6-luna",
                    status="ok",
                    tool_calls=[
                        ToolCallRequest(
                            call_id="submit-1",
                            name="submit_answer",
                            arguments={
                                "schema_version": "agent_submission.v2",
                                "answer_class": "general",
                                "draft_markdown": "Done.",
                                "as_of_date": None,
                                "claims": [],
                                "citations": [],
                                "research_status": "not_required",
                                "state_patch": [],
                            },
                        )
                    ],
                ),
            ]
            self.index = 0

        async def call(self, **kwargs):
            response = self.responses[self.index]
            self.index += 1
            return response

    def flat_search(**kwargs):
        calls.append(kwargs["query"])
        from app.tools.flat_rag_search import FlatRagResult

        return FlatRagResult(chunks=[], evidence_refs=[], debug={}, duration_ms=0.0)

    request = AgentRuntimeRequest(
        request_id=str(uuid4()),
        turn_id=str(uuid4()),
        mode="default",
        user_text="Find the relevant rule.",
        response_language="en",
        as_of_date=date.today(),
        matter_state={},
        experiment_arm="N",
        execution_budget=ExecutionBudget(
            max_tool_rounds=2,
            max_provider_calls=3,
            max_retries=0,
            turn_deadline_ms=75000,
            answer_research_target_ms=45000,
            checker_target_ms=8000,
            max_flat_rag_calls=2,
        ),
    )
    with patch("app.services.agent_policy_service.get_settings", return_value=settings), patch(
        "app.services.agent_runtime_service.get_settings", return_value=settings
    ):
        result = asyncio.run(
            AgentRuntimeService(provider=Provider()).run_shadow(
                request,
                deadline=AbsoluteTurnDeadline(
                    started_at=0.0,
                    turn_deadline_ms=75000,
                    clock=lambda: 0.0,
                ),
                registry=create_registry(f"duplicate-{uuid4()}"),
                flat_rag_search_fn=flat_search,
            )
        )

    assert calls == ["  visa   criteria "]
    assert result.submission is not None
    assert result.metrics.duplicate_tool_call_suppressed_count == 1
    assert result.metrics.duplicate_tool_names == ["flat_rag_search"]
    assert result.metrics.flat_rag_call_count == 1
    assert result.metrics.custom_tool_calls_per_round == [2, 1]
    assert any(
        item.error and item.error.code == "DUPLICATE_TOOL_CALL_SUPPRESSED"
        for item in result.tool_outputs
    )


def test_historical_and_sol_direct_control_shapes_only_change_model():
    model_input = "Latest user question: What is the current visa fee?"
    historical = build_direct_request_shape(model="gpt-5.6-terra", model_input=model_input)
    sol = build_direct_request_shape(model="gpt-5.6-sol", model_input=model_input)
    assert historical["model"] != sol["model"]
    historical_without_model = {key: value for key, value in historical.items() if key != "model"}
    sol_without_model = {key: value for key, value in sol.items() if key != "model"}
    assert historical_without_model == sol_without_model
    assert historical["reasoning"] == {"effort": "medium"}
    assert historical["tools"] == [{"type": "web_search", "search_context_size": "high"}]
    assert historical["tool_choice"] == "auto"
    assert all(item.get("name") != "submit_answer" for item in historical["tools"])


def test_native_web_action_metrics_are_content_free_and_capture_lifecycle_timings():
    clock = FakeClock()
    stream = TimedEvents(clock, [
        (1.0, SimpleNamespace(
            type="response.web_search_call.in_progress",
            item_id="web-action-1",
            action=SimpleNamespace(type="search", queries=["private query omitted from telemetry"]),
        )),
        (3.0, SimpleNamespace(
            type="response.web_search_call.completed",
            item_id="web-action-1",
            action=SimpleNamespace(type="search", queries=["private query omitted from telemetry"]),
        )),
        (5.0, SimpleNamespace(type="response.output_text.delta", delta="Answer")),
        (6.0, SimpleNamespace(
            type="response.completed",
            response=SimpleNamespace(id="response-1", output=[]),
        )),
    ])

    accumulator = consume_responses_stream(
        stream,
        allocated_timeout_seconds=10.0,
        clock=clock,
    )

    assert accumulator.status == "ok"
    assert accumulator.web_action_search_count == 1
    assert accumulator.web_action_open_page_count == 0
    assert accumulator.web_action_find_in_page_count == 0
    assert accumulator.web_search_query_count == 1
    assert accumulator.first_web_action_started_ms == 1000.0
    assert accumulator.first_web_action_completed_ms == 3000.0
    assert accumulator.last_web_action_completed_ms == 3000.0
    assert accumulator.first_output_text_after_web_ms == 5000.0
    assert accumulator.post_web_action_provider_ms == 3000.0
    assert stream.closed is True
    assert not hasattr(accumulator, "telemetry_query_text")


def test_native_web_timing_stays_null_when_sdk_omits_start_lifecycle_event():
    clock = FakeClock()
    stream = TimedEvents(clock, [
        (2.0, SimpleNamespace(
            type="response.output_item.done",
            item=SimpleNamespace(
                type="web_search_call",
                id="web-action-2",
                status="completed",
                action=SimpleNamespace(type="search", queries=[]),
            ),
        )),
        (3.0, SimpleNamespace(
            type="response.completed",
            response=SimpleNamespace(id="response-2", output=[]),
        )),
    ])

    accumulator = consume_responses_stream(
        stream,
        allocated_timeout_seconds=10.0,
        clock=clock,
    )

    assert accumulator.web_action_search_count == 1
    assert accumulator.first_web_action_started_ms is None
    assert accumulator.first_web_action_completed_ms == 2000.0


def test_search_privacy_guard_allows_ordinary_legal_status_and_location_phrases():
    guard = SearchPrivacyGuard()
    for query in (
        "applicant is in Australia",
        "applicant is outside Australia",
        "applicant is eligible for review",
        "client is in detention",
    ):
        result = guard.check_query(query)
        assert result.allowed is True
        assert "name_indicator" not in result.violation_categories


def test_search_privacy_guard_keeps_explicit_name_detection():
    guard = SearchPrivacyGuard()
    for query in ("applicant name is John Smith", "client name: Jane Doe"):
        result = guard.check_query(query)
        assert result.allowed is False
        assert result.violation_categories.get("name_indicator") == 1


def test_harness_database_guard_accepts_only_authoritative_loopback_forms():
    good_urls = (
        "postgresql+psycopg://rico_local@localhost:5432/immigration_legal",
        "postgresql+psycopg://rico_local@127.0.0.1:5432/immigration_legal",
    )
    for database_url in good_urls:
        with patch(
            "scripts.stage_b1_control_harness.get_settings",
            return_value=Settings(DATABASE_URL=database_url, OPENAI_API_KEY="test"),
        ):
            _authoritative_database_guard()

    for database_url in (
        "postgresql+psycopg://rico_local@remote.example:5432/immigration_legal",
        "postgresql+psycopg://rico_local@127.0.0.1:5433/immigration_legal",
        "postgresql+psycopg://rico_local@127.0.0.1:5432/other_database",
    ):
        with patch(
            "scripts.stage_b1_control_harness.get_settings",
            return_value=Settings(DATABASE_URL=database_url, OPENAI_API_KEY="test"),
        ):
            try:
                _authoritative_database_guard()
            except RuntimeError:
                pass
            else:
                raise AssertionError("non-authoritative database was accepted")


def test_custom_tool_round_telemetry_is_content_free():
    observations = [
        SimpleNamespace(
            stage="answer_research",
            returned_tool_names=[
                "schedule2_navigation",
                "flat_rag_search",
                "exact_legal_lookup",
                "deterministic_utility",
            ],
        ),
        SimpleNamespace(stage="answer_research", returned_tool_names=["web_search"]),
        SimpleNamespace(stage="terminal_synthesis", returned_tool_names=["submit_answer"]),
        SimpleNamespace(stage="phase6_checker", returned_tool_names=["submit_phase6_checker_result"]),
    ]
    counts, names = AgentRuntimeService._custom_tool_round_telemetry(observations)
    assert counts == [4, 1]
    assert names == [
        ["schedule2_navigation", "flat_rag_search", "exact_legal_lookup", "deterministic_utility"],
        ["submit_answer"],
    ]
    assert all("current private query" not in str(item) for item in names)
