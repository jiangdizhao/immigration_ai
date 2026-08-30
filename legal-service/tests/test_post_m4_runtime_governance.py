"""Offline regression tests for post-M4 Default AgentRuntime governance."""

from __future__ import annotations

import asyncio
import time
from datetime import date
from unittest.mock import patch

from app.core.config import Settings
from app.legal_map_experimental.schedule2_navigation_sidecar import (
    NavigationSidecar,
    Schedule2NavigationMap,
)
from app.schemas.agent import AgentExecutionMetrics, AgentRuntimeRequest, ExecutionBudget
from app.schemas.tools import CorpusCoverage, ExactLegalLookupOutput
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.agent_policy_service import AgentPolicyService
from app.services.agent_runtime_service import (
    AgentRuntimeService,
    ProviderInterface,
    ProviderResponse,
)
from app.services.request_evidence_registry import create_registry
from app.services.tool_executor_service import ToolCallRequest, ToolExecutorContext, ToolExecutorService


def _context(*, navigation=True, exact=None) -> ToolExecutorContext:
    return ToolExecutorContext(
        request_id="post-m4",
        registry=create_registry("post-m4"),
        as_of_date=date(2026, 8, 30),
        schedule2_navigation_map=(Schedule2NavigationMap(NavigationSidecar([], [], {})) if navigation else None),
        exact_legal_lookup_service=exact,
    )


def _nav_args() -> dict:
    return {"requests": [{
        "operation": "provision_context",
        "subclass": None,
        "provision_ref": "999.999",
        "locator_type": None,
        "locator": None,
        "target_document": None,
        "max_targets": 1,
    }]}


class ZeroExact:
    def __init__(self) -> None:
        self.requests = []

    def lookup(self, request, *, registry, tool_call_id):
        self.requests.append(request)
        return ExactLegalLookupOutput(
            matches=[],
            coverage=CorpusCoverage(
                family="Migration Regulations Schedule 2",
                status="available_partial",
                report_version="post-m4",
            ),
            corpus_version="corpus-1",
            index_version="index-1",
        )


def _exact_call(call_id: str, query: str) -> ToolCallRequest:
    return ToolCallRequest(call_id, "exact_legal_lookup", {"requests": [{"query": query}]})


def _structured_exact_call(call_id: str, provision: str) -> ToolCallRequest:
    return ToolCallRequest(
        call_id,
        "exact_legal_lookup",
        {
            "requests": [
                {
                    "locator_type": "schedule2_provision",
                    "locator": f"Schedule 2 clause {provision}",
                    "target_document": "Schedule 2",
                    "node_type": "provision",
                    "provision_ref": provision,
                    "schedule": "2",
                    "provision": provision,
                    "subclass": provision.split(".", 1)[0],
                    "source_type": "legislation",
                    "source_types": ["legislation"],
                    "query": None,
                }
            ]
        },
    )


def _nav_call(call_id: str) -> ToolCallRequest:
    return ToolCallRequest(call_id, "schedule2_navigation", _nav_args())


def _submit_call(call_id: str = "submit") -> ToolCallRequest:
    return ToolCallRequest(call_id, "submit_answer", {
        "schema_version": "agent_submission.v2",
        "answer_class": "general",
        "draft_markdown": "Done.",
        "claims": [],
        "citations": [],
        "research_status": "not_required",
        "state_patch": [],
    })


def test_navigation_invalid_does_not_burn_two_execution_slots_then_third_is_denied():
    context = _context()
    executor = ToolExecutorService()
    invalid = executor.execute_tool(
        ToolCallRequest("invalid", "schedule2_navigation", {"requests": []}), context
    )
    assert invalid.result.status == "invalid_request"
    assert context.schedule2_navigation_call_count == 0

    assert executor.execute_tool(_nav_call("nav-1"), context).result.status == "ok"
    assert executor.execute_tool(_nav_call("nav-2"), context).result.status == "ok"
    denied = executor.execute_tool(_nav_call("nav-3"), context)
    assert denied.result.error.code == "SCHEDULE2_NAVIGATION_BUDGET_EXHAUSTED"
    assert context.schedule2_navigation_call_count == 2


def test_valid_zero_result_navigation_consumes_one_execution_slot():
    context = _context()
    result = ToolExecutorService().execute_tool(_nav_call("nav-zero"), context)
    assert result.result.status == "ok"
    assert result.result.data["results"]
    assert context.schedule2_navigation_call_count == 1


def test_exact_invalid_and_empty_requests_do_not_burn_slots_then_two_valid_calls_are_allowed():
    exact = ZeroExact()
    context = _context(navigation=False, exact=exact)
    executor = ToolExecutorService()

    invalid = executor.execute_tool(
        ToolCallRequest("oversize", "exact_legal_lookup", {"requests": [{"query": "x"}] * 9}),
        context,
    )
    assert invalid.result.status == "invalid_request"
    assert context.exact_legal_lookup_call_count == 0

    empty = executor.execute_tool(
        ToolCallRequest("empty", "exact_legal_lookup", {"requests": [{"query": None}]}),
        context,
    )
    assert empty.result.error.code == "EXACT_NO_USABLE_LOCATOR"
    assert context.exact_legal_lookup_call_count == 0

    assert executor.execute_tool(_exact_call("exact-1", "new locator one"), context).result.status == "ok"
    assert executor.execute_tool(_exact_call("exact-2", "new locator two"), context).result.status == "ok"
    denied = executor.execute_tool(_exact_call("exact-3", "new locator three"), context)
    assert denied.result.error.code == "EXACT_LEGAL_LOOKUP_BUDGET_EXHAUSTED"
    assert context.exact_legal_lookup_call_count == 2
    assert [request.query for request in exact.requests] == ["new locator one", "new locator two"]


def test_valid_zero_result_exact_lookup_consumes_one_execution_slot():
    exact = ZeroExact()
    context = _context(navigation=False, exact=exact)
    result = ToolExecutorService().execute_tool(_exact_call("exact-zero", "unmatched locator"), context)
    assert result.result.status == "ok"
    assert result.result.data["lookups"][0]["matches"] == []
    assert context.exact_legal_lookup_call_count == 1


def test_denied_exact_lookup_records_sanitized_attempt_without_consuming_slot():
    exact = ZeroExact()
    context = _context(navigation=False, exact=exact)
    context.max_exact_legal_lookup_calls = 1
    executor = ToolExecutorService()

    allowed = executor.execute_tool(_structured_exact_call("exact-1", "010.511"), context)
    denied_call = ToolCallRequest(
        "exact-2",
        "exact_legal_lookup",
        {
            "requests": [
                {
                    "locator_type": "schedule2_provision",
                    "provision_ref": "010.611",
                    "schedule": "2",
                    "provision": "010.611",
                    "subclass": "010",
                    "query": "PRIVATE MATTER TEXT MUST NOT BE RECORDED",
                }
            ]
        },
    )
    denied = executor.execute_tool(denied_call, context)

    assert allowed.result.status == "ok"
    assert denied.result.error.code == "EXACT_LEGAL_LOOKUP_BUDGET_EXHAUSTED"
    assert context.exact_legal_lookup_call_count == 1
    assert context.exact_legal_lookup_denied_call_count == 1
    trace = next(item for item in context.exact_lookup_requests if item["tool_call_id"] == "exact-2")
    assert trace["execution_status"] == "governor_denied"
    assert trace["governor_denied"] is True
    assert trace["denial_code"] == "EXACT_LOOKUP_BUDGET_EXHAUSTED"
    assert trace["requested_item_count"] == 1
    assert trace["model_requests"][0]["provision_ref"] == "010.611"
    assert trace["model_requests"][0]["query_present"] is True
    assert trace["model_requests"][0]["query_length"] == len(
        "PRIVATE MATTER TEXT MUST NOT BE RECORDED"
    )
    assert "PRIVATE MATTER TEXT MUST NOT BE RECORDED" not in str(context.exact_lookup_requests)


def test_invalid_exact_request_remains_distinguishable_from_governor_denial():
    exact = ZeroExact()
    context = _context(navigation=False, exact=exact)
    result = ToolExecutorService().execute_tool(
        ToolCallRequest("invalid", "exact_legal_lookup", {"requests": [{"query": "x"} for _ in range(9)]}),
        context,
    )

    assert result.result.status == "invalid_request"
    assert context.exact_legal_lookup_denied_call_count == 0
    assert context.exact_lookup_requests == []


class MultiHopProvider(ProviderInterface):
    def __init__(self) -> None:
        self.responses = [
            ProviderResponse("r1", "gpt-5.6-luna", "ok", tool_calls=[_nav_call("nav-1")]),
            ProviderResponse("r2", "gpt-5.6-luna", "ok", tool_calls=[_exact_call("exact-1", "first")]),
            ProviderResponse("r3", "gpt-5.6-luna", "ok", tool_calls=[_nav_call("nav-2")]),
            ProviderResponse("r4", "gpt-5.6-luna", "ok", tool_calls=[_exact_call("exact-2", "second")]),
            ProviderResponse("r5", "gpt-5.6-luna", "ok", tool_calls=[_submit_call()]),
        ]
        self.calls = []

    async def call(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


def test_default_runtime_allows_four_research_rounds_and_fifth_terminal_call():
    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        FLAT_RAG_TOOL_ENABLED=False,
        DEFAULT_AGENT_REASONING_EFFORT="high",
        AGENT_MAX_TOOL_ROUNDS=4,
        AGENT_MAX_PROVIDER_CALLS=5,
        AGENT_MAX_SCHEDULE2_NAVIGATION_CALLS=2,
        AGENT_MAX_EXACT_LEGAL_LOOKUP_CALLS=2,
        COMPACT_CHECKER_ENABLED=False,
    )
    request = AgentRuntimeRequest(
        request_id="multi-hop",
        turn_id="multi-hop-turn",
        mode="default",
        user_text="Find the relevant rule.",
        response_language="en",
        as_of_date=date(2026, 8, 30),
        matter_state={},
        execution_budget=ExecutionBudget(
            max_tool_rounds=4,
            max_provider_calls=5,
            max_retries=0,
            turn_deadline_ms=300000,
            answer_research_target_ms=240000,
            checker_target_ms=8000,
            max_flat_rag_calls=1,
            max_schedule2_navigation_calls=2,
            max_exact_legal_lookup_calls=2,
            retry_viability_threshold_ms=100,
            terminal_synthesis_target_ms=45000,
            final_response_reserve_ms=15000,
            terminal_synthesis_min_start_budget_ms=5000,
        ),
        experiment_arm="N",
    )
    provider = MultiHopProvider()
    with patch("app.services.agent_policy_service.get_settings", return_value=settings):
        result = asyncio.run(AgentRuntimeService(provider=provider).run_shadow(
            request,
            deadline=AbsoluteTurnDeadline(time.perf_counter(), 300000),
            registry=create_registry("multi-hop"),
            schedule2_navigation_map=Schedule2NavigationMap(NavigationSidecar([], [], {})),
            exact_legal_lookup_service=ZeroExact(),
        ))

    assert result.status == "completed"
    assert result.submission is not None
    assert len(provider.calls) == 5
    assert result.metrics.schedule2_navigation_call_count == 2
    assert result.metrics.exact_lookup_call_count == 2
    assert result.metrics.tool_round_count == 4
    assert result.metrics.submit_answer_call_count == 1
    assert result.metrics.schedule2_navigation_denied_call_count == 0
    assert result.metrics.exact_lookup_denied_call_count == 0
    assert all(not observation.governor_denied for observation in result.metrics.tool_calls)
    assert result.metrics.applicability_protocol_enabled is True
    assert result.shadow_trace["applicability_protocol_enabled"] is True


def test_applicability_protocol_off_preserves_policy_tools_budgets_and_observability():
    service = AgentPolicyService()
    on = service.build_policy(
        mode="default", experiment_arm="N", applicability_protocol_enabled=True
    )
    off = service.build_policy(
        mode="default", experiment_arm="N", applicability_protocol_enabled=False
    )

    assert service.get_tool_names(on) == service.get_tool_names(off)
    assert on.model == off.model
    assert on.reasoning_effort == off.reasoning_effort
    assert on.max_tool_rounds == off.max_tool_rounds
    assert on.max_provider_calls == off.max_provider_calls
    assert on.max_retries == off.max_retries
    assert on.max_flat_rag_calls == off.max_flat_rag_calls
    assert on.retry_viability_threshold_ms == off.retry_viability_threshold_ms

    on_context = _context(exact=ZeroExact())
    off_context = _context(exact=ZeroExact())
    executor = ToolExecutorService()
    for context, suffix in ((on_context, "on"), (off_context, "off")):
        assert executor.execute_tool(_nav_call(f"nav-{suffix}"), context).result.status == "ok"
        assert executor.execute_tool(_exact_call(f"exact-{suffix}", "same locator"), context).result.status == "ok"
    assert on_context.schedule2_navigation_call_count == off_context.schedule2_navigation_call_count == 1
    assert on_context.exact_legal_lookup_call_count == off_context.exact_legal_lookup_call_count == 1

    metrics_kwargs = {"turn_deadline_ms": 60000, "remaining_deadline_before_call_ms": 60000}
    assert AgentExecutionMetrics(
        applicability_protocol_enabled=True, **metrics_kwargs
    ).applicability_protocol_enabled is True
    assert AgentExecutionMetrics(
        applicability_protocol_enabled=False, **metrics_kwargs
    ).applicability_protocol_enabled is False


def test_default_source_defaults_and_premium_controls_are_explicit_without_dotenv():
    settings = Settings(_env_file=None, DATABASE_URL="postgresql://test", OPENAI_API_KEY="test")
    assert settings.default_agent_reasoning_effort == "high"
    assert settings.default_turn_deadline_ms == 300000
    assert settings.default_answer_research_target_ms == 240000
    assert settings.default_terminal_synthesis_target_ms == 45000
    assert settings.default_final_response_reserve_ms == 15000
    assert settings.agent_max_provider_calls == 5
    assert settings.agent_max_tool_rounds == 4
    assert settings.agent_max_flat_rag_calls == 1
    assert settings.agent_max_schedule2_navigation_calls == 2
    assert settings.agent_max_exact_legal_lookup_calls == 2
    assert settings.premium_turn_deadline_ms == 90000
    assert settings.premium_answer_research_target_ms == 40000
