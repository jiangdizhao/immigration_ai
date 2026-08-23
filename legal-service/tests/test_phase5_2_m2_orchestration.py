"""Mocked/offline M2 orchestration tests for experimental Arm N."""

from __future__ import annotations

import asyncio
import json
import time
from datetime import date, datetime, timezone
from unittest.mock import patch

from app.core.config import Settings
from app.legal_map_experimental.schedule2_navigation_sidecar import (
    GraphEdge,
    GraphNode,
    NavigationSidecar,
    Schedule2NavigationMap,
)
from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
from app.schemas.evidence import CanonicalLocalEvidenceRef
from app.schemas.tools import CorpusCoverage, ExactLegalLookupOutput, ExactLegalMatch
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.agent_policy_service import AgentPolicyService
from app.services.agent_runtime_service import (
    AgentRuntimeService,
    ProviderInterface,
    ProviderResponse,
)
from app.services.request_evidence_registry import create_registry
from app.services.tool_executor_service import ToolCallRequest


def _settings() -> Settings:
    return Settings(
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        FLAT_RAG_TOOL_ENABLED=True,
        COMPACT_CHECKER_ENABLED=False,
        DEFAULT_AGENT_REASONING_EFFORT="low",
    )


def _navigation_map() -> Schedule2NavigationMap:
    nodes = [
        GraphNode("s2x:subclass:485", "subclass", "Subclass 485", subclass="485", locator="485"),
        GraphNode(
            "s2x:provision:485.211",
            "provision",
            "485.211",
            subclass="485",
            provision_ref="485.211",
            locator="485.211",
        ),
    ]
    edges = [
        GraphEdge("contains", "s2x:subclass:485", "CONTAINS", "s2x:provision:485.211"),
    ]
    return Schedule2NavigationMap(NavigationSidecar(nodes=nodes, edges=edges, manifest={}))


def _call(name: str, arguments: dict, call_id: str) -> ToolCallRequest:
    return ToolCallRequest(call_id=call_id, name=name, arguments=arguments)


def _navigation_args() -> dict:
    return {
        "requests": [{
            "operation": "subclass_map",
            "subclass": "485",
            "provision_ref": None,
            "max_targets": 5,
        }],
    }


def _exact_args() -> dict:
    return {
        "requests": [{
            "query": "485.211",
            "document_id": None,
            "source_types": [],
            "schedule": "2",
            "provision": "485.211",
            "case_citation": None,
            "subclass": "485",
            "follow_cross_references": True,
            "max_hits": 8,
        }],
    }


def _canonical_output(
    *,
    registry,
    tool_call_id: str,
    unresolved_cross_references: list[str] | None = None,
) -> ExactLegalLookupOutput:
    evidence = CanonicalLocalEvidenceRef(
        evidence_ref="exact:placeholder-replaced-by-registry",
        evidence_origin="canonical_local",
        source_type="legislation",
        source_authenticity="canonical_official",
        authority_kind="delegated_legislation",
        jurisdiction="Cth",
        binding_status="binding",
        court_or_tribunal_level=None,
        retrieved_at=datetime.now(timezone.utc),
        provenance_complete=True,
        canonical_source_id="source-1",
        canonical_chunk_id="chunk-1",
        document_id="Migration Regulations 1994",
        document_version="F2026C00667",
        provision_or_span="485.211",
        content_hash="0" * 64,
        text="Exact canonical Schedule 2 text.",
    )
    ref = registry.register_canonical_evidence(evidence=evidence, tool_call_id=tool_call_id)
    return ExactLegalLookupOutput(
        matches=[ExactLegalMatch(
            canonical_evidence_ref=registry.resolve_evidence(ref),
            match_type="exact",
        )],
        unresolved_cross_references=unresolved_cross_references or [],
        coverage=CorpusCoverage(
            family="Migration Regulations Schedule 2",
            status="available_complete",
            report_version="coverage-1",
        ),
        corpus_version="corpus-1",
        index_version="index-1",
    )


def _unresolved_output(**_kwargs) -> ExactLegalLookupOutput:
    return ExactLegalLookupOutput(
        matches=[],
        unresolved_cross_references=["regulation 99.99"],
        coverage=CorpusCoverage(
            family="Migration Regulations Schedule 2",
            status="available_partial",
            report_version="coverage-partial",
            gap_reason="Target family is not sufficiently covered locally",
        ),
        corpus_version="corpus-1",
        index_version="index-1",
    )


def _mixed_output(*, registry, tool_call_id: str) -> ExactLegalLookupOutput:
    return _canonical_output(
        registry=registry,
        tool_call_id=tool_call_id,
        unresolved_cross_references=["regulation 99.99"],
    )


class ExactBackend:
    def __init__(self, output_factory=None) -> None:
        self.calls: list[str] = []
        self.requests = []
        self.output_factory = output_factory

    def lookup(self, request, *, registry, tool_call_id):
        self.calls.append(tool_call_id)
        self.requests.append(request)
        if self.output_factory is not None:
            return self.output_factory(registry=registry, tool_call_id=tool_call_id)
        return _canonical_output(registry=registry, tool_call_id=tool_call_id)


class ScriptedProvider(ProviderInterface):
    def __init__(self, first_response, continuation_factory) -> None:
        self.first_response = first_response
        self.continuation_factory = continuation_factory
        self.calls = 0
        self.seen_tools: list[list[str]] = []
        self.timeouts: list[float] = []

    async def call(self, **kwargs):
        self.calls += 1
        self.seen_tools.append([
            str(tool.get("name") or tool.get("type"))
            for tool in kwargs["tools"]
        ])
        self.timeouts.append(kwargs["timeout_ms"])
        if self.calls == 1:
            return self.first_response
        return self.continuation_factory(kwargs)


def _request(*, user_text: str = "Which provision matters?", max_tool_rounds: int = 2):
    return AgentRuntimeRequest(
        request_id="m2-request",
        turn_id="m2-turn",
        mode="default",
        user_text=user_text,
        response_language="en",
        as_of_date=date(2026, 8, 23),
        matter_state={},
        execution_budget=ExecutionBudget(
            max_tool_rounds=max_tool_rounds,
            max_provider_calls=3,
            max_retries=0,
            turn_deadline_ms=4000,
            answer_research_target_ms=3000,
            checker_target_ms=1000,
            max_flat_rag_calls=1,
            retry_viability_threshold_ms=100,
        ),
        experiment_arm="N",
    )


def _run(provider, *, exact=None, navigation=None, request=None):
    registry = create_registry("m2-request")
    with patch("app.services.agent_policy_service.get_settings", return_value=_settings()):
        result = asyncio.run(AgentRuntimeService(provider=provider).run_shadow(
            request or _request(),
            deadline=AbsoluteTurnDeadline(time.perf_counter(), 4000),
            registry=registry,
            schedule2_navigation_map=navigation or _navigation_map(),
            exact_legal_lookup_service=exact,
        ))
    return result, registry


def _submission_from_exact_ref(kwargs, *, research_status="complete", draft=None):
    refs = []
    for message in kwargs["messages_history"] or []:
        if message.get("role") != "tool":
            continue
        payload = json.loads(message["content"])
        for lookup in payload.get("data", {}).get("lookups", []):
            refs.extend(
                match["canonical_evidence_ref"]["evidence_ref"]
                for match in lookup.get("matches", [])
            )
    ref = refs[0] if refs else None
    draft = draft or "The exact local rule applies."
    claims = []
    citations = []
    if ref:
        claims = [{
            "claim_id": "c1",
            "claim_type": "legal_rule",
            "materiality": "decisive",
            "text": draft,
            "draft_start": 0,
            "draft_end": len(draft),
            "evidence_refs": [ref],
            "depends_on": [],
        }]
        citations = [{"evidence_ref": ref, "display_label": "Exact local source"}]
    else:
        claims = [{
            "claim_id": "c1",
            "claim_type": "legal_rule",
            "materiality": "supporting",
            "text": draft,
            "draft_start": 0,
            "draft_end": len(draft),
            "evidence_refs": [],
            "depends_on": [],
        }]
    return ProviderResponse(
        response_id="continuation",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[_call("submit_answer", {
            "schema_version": "agent_submission.v2",
            "answer_class": "substantive_legal",
            "draft_markdown": draft,
            "claims": claims,
            "citations": citations,
            "research_status": research_status,
            "state_patch": [],
        }, "submit-final")],
    )


def test_arm_n_policy_isolated_and_coverage_closure_is_prompt_only():
    with patch("app.services.agent_policy_service.get_settings", return_value=_settings()):
        service = AgentPolicyService()
        arm_n = service.build_policy(mode="default", experiment_arm="N")
        arm_l = service.build_policy(mode="default", experiment_arm="L")
        premium = service.build_policy(mode="premium", experiment_arm="N")
        public_default = service.build_policy(mode="default")

    assert arm_n.prompt_version.endswith(".arm-n-research")
    assert "Arm-N Bounded Research Policy" in arm_n.system_prompt
    assert "Arm-N Coverage Closure" in arm_n.system_prompt
    assert "RESOLVED" in arm_n.system_prompt
    assert "UNRESOLVED" in arm_n.system_prompt
    assert "Arm-N Coverage Closure" not in arm_l.system_prompt
    assert "Arm-N Coverage Closure" not in premium.system_prompt
    assert "Arm-N Coverage Closure" not in public_default.system_prompt
    assert "schedule2_navigation" not in AgentPolicyService().get_tool_names(arm_l)
    assert "exact_legal_lookup" not in AgentPolicyService().get_tool_names(premium)
    assert "schedule2_navigation" not in AgentPolicyService().get_tool_names(public_default)


def test_graph_exact_answer_uses_same_registered_evidence_and_one_llm_stage():
    exact = ExactBackend()
    first = ProviderResponse(
        response_id="research",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[
            _call("schedule2_navigation", _navigation_args(), "nav-1"),
            _call("exact_legal_lookup", _exact_args(), "exact-1"),
        ],
    )
    provider = ScriptedProvider(
        first,
        lambda kwargs: _submission_from_exact_ref(kwargs),
    )
    result, registry = _run(provider, exact=exact)

    assert result.status == "completed"
    assert result.submission is not None
    assert result.submission.research_status == "complete"
    assert result.submission.citations
    ref = result.submission.citations[0].evidence_ref
    assert ref.startswith("exact:")
    assert registry.is_registered(ref)
    assert result.submission.claims[0].evidence_refs == [ref]
    assert len(registry.get_refs_by_origin("canonical_local")) == 1
    assert result.metrics.schedule2_navigation_call_count == 1
    assert result.metrics.schedule2_navigation_target_count == 1
    assert result.metrics.exact_lookup_call_count == 1
    assert result.metrics.exact_lookup_requested_locator_count == 1
    assert result.metrics.exact_lookup_resolved_locator_count == 1
    assert result.metrics.exact_lookup_unresolved_locator_count == 0
    assert exact.requests[0].schedule == "2"
    assert exact.requests[0].provision == "485.211"
    assert exact.requests[0].query is None
    assert result.metrics.exact_lookup_requests[0]["normalized_request"]["schedule"] == "2"
    assert result.metrics.exact_lookup_requests[0]["result"]["matches_count"] == 1
    assert result.shadow_trace["exact_lookup_requests"][0]["normalized_request"]["provision"] == "485.211"
    assert result.metrics.logical_llm_stage_count == 1
    assert result.metrics.provider_api_call_count == 2
    assert all("s2x:" not in citation.evidence_ref for citation in result.submission.citations)


def test_graph_unresolved_branch_requires_incomplete_submission():
    exact = ExactBackend(output_factory=_unresolved_output)
    first = ProviderResponse(
        response_id="research-unresolved",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[
            _call("schedule2_navigation", _navigation_args(), "nav-unresolved"),
            _call("exact_legal_lookup", _exact_args(), "exact-unresolved"),
        ],
    )
    provider = ScriptedProvider(
        first,
        lambda kwargs: _submission_from_exact_ref(
            kwargs,
            research_status="incomplete",
            draft="I could not verify whether the unresolved external reference changes this answer.",
        ),
    )
    result, registry = _run(provider, exact=exact)

    assert result.status == "completed"
    assert result.submission is not None
    assert result.submission.research_status == "incomplete"
    assert "unresolved external reference" in result.submission.draft_markdown
    assert registry.entry_count == 0
    assert result.metrics.exact_lookup_requested_locator_count == 1
    assert result.metrics.exact_lookup_resolved_locator_count == 0
    assert result.metrics.exact_lookup_unresolved_locator_count == 1
    assert result.metrics.exact_lookup_unresolved_cross_reference_count == 1
    assert result.metrics.logical_llm_stage_count == 1


def test_mixed_exact_result_separates_locator_resolution_from_cross_reference_gap():
    exact = ExactBackend(output_factory=_mixed_output)
    first = ProviderResponse(
        response_id="research-mixed",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[_call("exact_legal_lookup", _exact_args(), "exact-mixed")],
    )
    provider = ScriptedProvider(
        first,
        lambda kwargs: _submission_from_exact_ref(kwargs),
    )
    result, registry = _run(provider, exact=exact)

    assert result.status == "completed"
    assert result.submission is not None
    assert result.submission.citations
    assert registry.is_registered(result.submission.citations[0].evidence_ref)
    assert result.metrics.exact_lookup_requested_locator_count == 1
    assert result.metrics.exact_lookup_resolved_locator_count == 1
    assert result.metrics.exact_lookup_unresolved_locator_count == 0
    assert result.metrics.exact_lookup_unresolved_cross_reference_count == 1


def test_web_and_graph_cooperate_without_extra_reasoning_stage():
    first = ProviderResponse(
        response_id="web-graph",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[
            _call("web_search", {}, "web-1"),
            _call("schedule2_navigation", _navigation_args(), "nav-web"),
        ],
        native_web_search_call_count=1,
        native_web_source_count=2,
    )
    provider = ScriptedProvider(
        first,
        lambda kwargs: ProviderResponse(
            response_id="submit-general",
            model="gpt-5.6-luna",
            status="ok",
            tool_calls=[_call("submit_answer", {
                "schema_version": "agent_submission.v2",
                "answer_class": "general",
                "draft_markdown": "No legal research was needed.",
                "claims": [],
                "citations": [],
                "research_status": "not_required",
                "state_patch": [],
            }, "submit-web-graph")],
        ),
    )
    result, _ = _run(provider, exact=ExactBackend())

    assert result.status == "completed"
    assert result.metrics.native_web_search_call_count == 1
    assert result.metrics.native_web_source_count == 2
    assert result.metrics.schedule2_navigation_call_count == 1
    assert result.metrics.exact_lookup_call_count == 0
    assert result.metrics.logical_llm_stage_count == 1
    assert result.metrics.provider_api_call_count == 2
    assert result.metrics.tool_round_count == 1


def test_arm_n_does_not_mechanically_fan_out_exact_lookup_after_navigation():
    exact = ExactBackend()
    first = ProviderResponse(
        response_id="navigation-only",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[_call("schedule2_navigation", _navigation_args(), "nav-only")],
    )
    provider = ScriptedProvider(
        first,
        lambda kwargs: ProviderResponse(
            response_id="submit-only",
            model="gpt-5.6-luna",
            status="ok",
            tool_calls=[_call("submit_answer", {
                "schema_version": "agent_submission.v2",
                "answer_class": "general",
                "draft_markdown": "The question did not require exact lookup.",
                "claims": [], "citations": [],
                "research_status": "not_required", "state_patch": [],
            }, "submit-only")],
        ),
    )
    result, _ = _run(provider, exact=exact)

    assert result.status == "completed"
    assert exact.calls == []
    assert result.metrics.schedule2_navigation_call_count == 1
    assert result.metrics.exact_lookup_call_count == 0


def test_stable_general_arm_n_can_submit_without_legal_tools():
    first = ProviderResponse(
        response_id="general",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[_call("submit_answer", {
            "schema_version": "agent_submission.v2",
            "answer_class": "general",
            "draft_markdown": "Hello.",
            "claims": [], "citations": [],
            "research_status": "not_required", "state_patch": [],
        }, "submit-general")],
    )
    provider = ScriptedProvider(first, lambda kwargs: first)
    result, _ = _run(
        provider,
        exact=ExactBackend(),
        request=_request(user_text="Hello"),
    )

    assert result.status == "completed"
    assert result.metrics.schedule2_navigation_call_count == 0
    assert result.metrics.exact_lookup_call_count == 0
    assert result.metrics.flat_rag_call_count == 0


def test_terminal_submit_remains_available_after_arm_n_research_budget_exhaustion():
    first = ProviderResponse(
        response_id="budget-exhausted",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[_call("schedule2_navigation", _navigation_args(), "nav-budget")],
    )
    provider = ScriptedProvider(
        first,
        lambda kwargs: ProviderResponse(
            response_id="terminal-after-budget",
            model="gpt-5.6-luna",
            status="ok",
            tool_calls=[_call("submit_answer", {
                "schema_version": "agent_submission.v2",
                "answer_class": "general",
                "draft_markdown": "Terminal synthesis remains possible.",
                "claims": [], "citations": [],
                "research_status": "not_required", "state_patch": [],
            }, "submit-terminal")],
        ),
    )
    result, _ = _run(
        provider,
        exact=ExactBackend(),
        request=_request(max_tool_rounds=0),
    )

    assert result.status == "completed"
    assert result.submission is not None
    assert result.metrics.submit_answer_call_count == 1
    assert result.metrics.logical_llm_stage_count == 1
