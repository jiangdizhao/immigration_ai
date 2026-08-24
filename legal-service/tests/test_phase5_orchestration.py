from __future__ import annotations

from datetime import date
from unittest.mock import patch
import time

from app.core.config import Settings
from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.agent_runtime_service import AgentRuntimeService, ProviderResponse
from app.services.tool_executor_service import ToolCallRequest


class FakeProvider:
    def __init__(self, responses: list[ProviderResponse]):
        self.responses = list(responses)
        self.seen_tools: list[list[str]] = []
        self.seen_tool_choices: list[object] = []
        self.call_count = 0

    async def call(self, **kwargs):
        self.call_count += 1
        self.seen_tools.append([
            str(tool.get("name") or tool.get("type"))
            for tool in kwargs["tools"]
        ])
        self.seen_tool_choices.append(kwargs["tool_choice"])
        return self.responses.pop(0)


class AdvancingClock:
    def __init__(self):
        self.value = 0.0

    def __call__(self):
        return self.value


class AdvancingProvider(FakeProvider):
    def __init__(self, responses, clock, advances):
        super().__init__(responses)
        self.clock = clock
        self.advances = list(advances)

    async def call(self, **kwargs):
        response = await super().call(**kwargs)
        self.clock.value += self.advances.pop(0)
        return response


def _budget(*, max_tool_rounds: int = 2) -> ExecutionBudget:
    return ExecutionBudget(
        max_tool_rounds=max_tool_rounds,
        max_provider_calls=3,
        max_retries=1,
        turn_deadline_ms=40000,
        answer_research_target_ms=32000,
        checker_target_ms=8000,
        max_flat_rag_calls=1,
        retry_viability_threshold_ms=8000,
    )


def _request(*, answer_class: str = "general", budget: ExecutionBudget | None = None):
    return AgentRuntimeRequest(
        request_id="orchestration-request",
        turn_id="orchestration-turn",
        mode="default",
        user_text="Question",
        response_language="en",
        as_of_date=date(2026, 8, 21),
        matter_state={},
        execution_budget=budget or _budget(),
        experiment_arm="L",
    )


def _flat_response(call_id: str = "flat-1") -> ProviderResponse:
    return ProviderResponse(
        response_id=f"response-{call_id}",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[ToolCallRequest(
            call_id=call_id,
            name="flat_rag_search",
            arguments={"query": "legal issue", "top_k": None, "preferred_source_types": None},
        )],
    )


def _utility_response(call_id: str = "utility-1") -> ProviderResponse:
    return ProviderResponse(
        response_id=f"response-{call_id}",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[ToolCallRequest(
            call_id=call_id,
            name="deterministic_utility",
            arguments={
                "operation": "arithmetic",
                "operands": [1, 2],
                "expression": "1 + 2",
                "calendar": "calendar_days",
                "timezone": "Australia/Sydney",
                "rounding": "none",
                "precision": 2,
            },
        )],
    )


def _submit_response(*, answer_class: str = "general", call_id: str = "submit-1") -> ProviderResponse:
    return ProviderResponse(
        response_id=f"response-{call_id}",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[ToolCallRequest(
            call_id=call_id,
            name="submit_answer",
            arguments={
                "schema_version": "agent_submission.v2",
                "answer_class": answer_class,
                "draft_markdown": "OK.",
                "claims": [],
                "citations": [],
                "research_status": "not_required" if answer_class == "general" else "incomplete",
                "state_patch": [],
            },
        )],
    )


def _run(
    provider: FakeProvider,
    *,
    budget: ExecutionBudget | None = None,
    flat_calls: list[str] | None = None,
    checker_enabled: bool = False,
):
    settings = Settings(
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        FLAT_RAG_TOOL_ENABLED=True,
        DEFAULT_AGENT_REASONING_EFFORT="low",
        COMPACT_CHECKER_ENABLED=checker_enabled,
    )

    def fake_flat_rag_search(**kwargs):
        if flat_calls is not None:
            flat_calls.append(kwargs["query"])
        from app.tools.flat_rag_search import FlatRagResult
        return FlatRagResult(chunks=[], evidence_refs=[], debug={}, duration_ms=1.0)

    async def execute():
        with patch("app.services.agent_policy_service.get_settings", return_value=settings), patch(
            "app.services.agent_runtime_service.get_settings", return_value=settings
        ):
            runtime = AgentRuntimeService(provider=provider)
            return await runtime.run_shadow(
                _request(budget=budget),
                deadline=AbsoluteTurnDeadline(time.perf_counter(), 40000),
                registry=__import__("app.services.request_evidence_registry", fromlist=["create_registry"]).create_registry("orchestration-request"),
                flat_rag_search_fn=fake_flat_rag_search,
            )
    import asyncio
    return asyncio.run(execute())


def test_submit_without_research_has_zero_research_rounds():
    result = _run(FakeProvider([_submit_response()]))
    assert result.status == "completed"
    assert result.metrics.tool_round_count == 0
    assert result.metrics.submit_answer_call_count == 1


def test_submit_remains_allowed_after_one_local_round_and_flat_is_hidden():
    provider = FakeProvider([_flat_response(), _submit_response()])
    result = _run(provider, flat_calls=[])
    assert result.status == "completed"
    assert result.metrics.tool_round_count == 1
    assert result.metrics.submit_answer_call_count == 1
    assert "flat_rag_search" in provider.seen_tools[0]
    assert "flat_rag_search" not in provider.seen_tools[1]
    assert "web_search" in provider.seen_tools[1]


def test_submit_remains_allowed_after_two_research_rounds():
    provider = FakeProvider([_flat_response(), _utility_response(), _submit_response()])
    result = _run(provider, budget=_budget(max_tool_rounds=2))
    assert result.status == "completed"
    assert result.metrics.tool_round_count == 1
    assert result.metrics.submit_answer_call_count == 1


def test_already_exhausted_flat_request_does_not_consume_another_round():
    provider = FakeProvider([_flat_response(), _flat_response("flat-2"), _submit_response()])
    result = _run(provider)
    assert result.status == "completed"
    assert result.metrics.tool_round_count == 1
    assert result.metrics.flat_rag_call_count == 1
    assert result.metrics.submit_answer_call_count == 1
    assert "flat_rag_search" not in provider.seen_tools[1]


def test_web_remains_visible_after_local_retrieval():
    web = ProviderResponse(
        response_id="response-web",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[ToolCallRequest(call_id="web-1", name="web_search", arguments={})],
    )
    provider = FakeProvider([_flat_response(), web, _submit_response()])
    result = _run(provider)
    assert result.status == "completed"
    assert "web_search" in provider.seen_tools[1]
    assert result.metrics.flat_rag_call_count == 1


def test_substantive_arm_l_finishes_with_checker_disabled():
    draft = "Safe context. Legal claim."
    substantive = ProviderResponse(
        response_id="response-legal",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[ToolCallRequest(
            call_id="submit-legal",
            name="submit_answer",
            arguments={
                "schema_version": "agent_submission.v2",
                "answer_class": "substantive_legal",
                "draft_markdown": draft,
                "claims": [
                    {
                        "claim_id": "c1",
                        "claim_type": "procedure",
                        "materiality": "supporting",
                        "text": "Safe context.",
                        "draft_start": 0,
                        "draft_end": 13,
                    },
                    {
                        "claim_id": "c2",
                        "claim_type": "legal_rule",
                        "materiality": "decisive",
                        "text": "Legal claim.",
                        "draft_start": 14,
                        "draft_end": 26,
                    },
                ],
                "citations": [],
                "research_status": "incomplete",
                "state_patch": [],
            },
        )],
    )
    checker = ProviderResponse(
        response_id="response-checker",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[ToolCallRequest(
            call_id="checker-1",
            name="submit_compact_checker_result",
            arguments={
                "schema_version": "compact_checker.result.v1",
                "decisions": [
                    {"claim_id": "c1", "decision": "keep", "reason_code": "supported_current", "qualification": None, "original_claim_sha256": None},
                    {"claim_id": "c2", "decision": "drop", "reason_code": "insufficient_evidence", "qualification": None, "original_claim_sha256": None},
                ],
                "escalate": False,
            },
        )],
    )
    provider = FakeProvider([substantive, checker])
    result = _run(provider)
    assert result.status == "completed"
    assert result.checker_status == "not_required"
    assert result.checker_call_count == 0
    assert result.metrics.fact_check_latency_ms == 0
    assert provider.call_count == 1


def test_isolated_supporting_claim_does_not_start_phase6_checker_when_enabled():
    draft = "Safe context. Legal claim."
    substantive = ProviderResponse(
        response_id="response-legal-enabled",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[ToolCallRequest(
            call_id="submit-legal-enabled",
            name="submit_answer",
            arguments={
                "schema_version": "agent_submission.v2",
                "answer_class": "substantive_legal",
                "draft_markdown": draft,
                "claims": [{
                    "claim_id": "c1",
                    "claim_type": "procedure",
                    "materiality": "supporting",
                    "text": "Safe context.",
                    "draft_start": 0,
                    "draft_end": 13,
                }],
                "citations": [],
                "research_status": "incomplete",
                "state_patch": [],
            },
        )],
    )
    result = _run(FakeProvider([substantive]), checker_enabled=True)
    assert result.status == "completed"
    assert result.checker_status == "not_required"
    assert result.checker_call_count == 0
    assert result.metrics.provider_api_call_count == 1


def test_last_viable_continuation_transitions_to_terminal_only_tools():
    clock = AdvancingClock()
    provider = AdvancingProvider(
        [_flat_response(), _utility_response(), _submit_response()],
        clock,
        [31.0, 2.0, 0.0],
    )
    settings = Settings(
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        FLAT_RAG_TOOL_ENABLED=True,
        DEFAULT_AGENT_REASONING_EFFORT="low",
        COMPACT_CHECKER_ENABLED=False,
    )

    def fake_flat_rag_search(**kwargs):
        from app.tools.flat_rag_search import FlatRagResult
        return FlatRagResult(chunks=[], evidence_refs=[], debug={}, duration_ms=1.0)

    async def execute():
        with patch("app.services.agent_policy_service.get_settings", return_value=settings), patch(
            "app.services.agent_runtime_service.get_settings", return_value=settings
        ):
            runtime = AgentRuntimeService(provider=provider)
            return await runtime.run_shadow(
                _request(),
                deadline=AbsoluteTurnDeadline(0.0, 40000, clock=clock),
                registry=__import__("app.services.request_evidence_registry", fromlist=["create_registry"]).create_registry("terminal-phase"),
                flat_rag_search_fn=fake_flat_rag_search,
            )

    import asyncio
    result = asyncio.run(execute())
    assert result.status == "completed"
    assert provider.seen_tools[2] == ["submit_answer"]
    assert provider.seen_tool_choices[2] == {"type": "function", "name": "submit_answer"}
    assert result.metrics.tool_round_count == 1
    assert result.metrics.submit_answer_call_count == 1
