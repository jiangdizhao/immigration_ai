"""Deterministic M1 plumbing tests for experimental Arm N.

These tests use only tracked sidecar-shaped fixtures and mocked exact lookup;
they do not call OpenAI, the network, or a writable database.
"""

from __future__ import annotations

import json
import time
from datetime import date, datetime, timezone
from unittest.mock import patch

import pytest

from app.core.config import Settings
from app.legal_map_experimental.schedule2_navigation_sidecar import (
    GraphEdge,
    GraphNode,
    NavigationSidecar,
    Schedule2NavigationMap,
)
from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
from app.schemas.evidence import CanonicalLocalEvidenceRef
from app.schemas.tools import (
    CorpusCoverage,
    ExactLegalLookupOutput,
    ExactLegalMatch,
)
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.agent_policy_service import AgentPolicyService
from app.services.agent_runtime_service import AgentRuntimeService, ProviderInterface, ProviderResponse
from app.services.request_evidence_registry import create_registry
from app.services.tool_executor_service import ToolCallRequest, ToolExecutorContext, ToolExecutorService


def _navigation_map() -> Schedule2NavigationMap:
    nodes = [
        GraphNode("s2x:subclass:485", "subclass", "Subclass 485", subclass="485", locator="485"),
        GraphNode("s2x:provision:485.211", "provision", "485.211", subclass="485", provision_ref="485.211", locator="485.211"),
        GraphNode(
            "s2x:external:REGULATION:1.03",
            "external_locator",
            "regulation 1.03",
            provision_ref="1.03",
            locator="regulation 1.03",
            locator_type="regulation",
            local_available=False,
            resolution_status="unresolved",
        ),
        GraphNode(
            "s2x:external:ITEM:1",
            "external_locator",
            "item 1",
            provision_ref="1",
            locator="item 1",
            locator_type="item",
            ambiguous=True,
            local_available=False,
            resolution_status="ambiguous",
        ),
    ]
    edges = [
        GraphEdge("contains", "s2x:subclass:485", "CONTAINS", "s2x:provision:485.211"),
        GraphEdge("references", "s2x:provision:485.211", "REFERENCES_REGULATION", "s2x:external:REGULATION:1.03", "regulation 1.03"),
        GraphEdge("ambiguous", "s2x:provision:485.211", "REFERENCES", "s2x:external:ITEM:1", "item 1"),
        GraphEdge("forbidden", "s2x:provision:485.211", "ELIGIBLE_IF", "s2x:external:ITEM:1"),
    ]
    return Schedule2NavigationMap(NavigationSidecar(nodes=nodes, edges=edges, manifest={}))


def _settings() -> Settings:
    return Settings(
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        FLAT_RAG_TOOL_ENABLED=True,
        COMPACT_CHECKER_ENABLED=False,
        DEFAULT_AGENT_REASONING_EFFORT="low",
    )


def _exact_output(*, registry, tool_call_id: str) -> ExactLegalLookupOutput:
    evidence = CanonicalLocalEvidenceRef(
        evidence_ref="exact:backend-issued-placeholder",
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
        text="Exact canonical text.",
    )
    ref = registry.register_canonical_evidence(evidence=evidence, tool_call_id=tool_call_id)
    evidence = registry.resolve_evidence(ref)
    return ExactLegalLookupOutput(
        matches=[ExactLegalMatch(canonical_evidence_ref=evidence, match_type="exact")],
        coverage=CorpusCoverage(
            family="Migration Regulations Schedule 2",
            status="available_complete",
            report_version="report-1",
        ),
        corpus_version="corpus-1",
        index_version="index-1",
    )


class FakeExactLookup:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.requests = []

    def lookup(self, request, *, registry, tool_call_id):
        self.calls.append(tool_call_id)
        self.requests.append(request)
        return _exact_output(registry=registry, tool_call_id=tool_call_id)


class PassthroughExactLookup:
    def __init__(self, output: ExactLegalLookupOutput) -> None:
        self.output = output

    def lookup(self, request, *, registry, tool_call_id):
        return self.output


def _coverage_output(
    *,
    status: str,
    gap_reason: str | None = None,
    unresolved: list[str] | None = None,
) -> ExactLegalLookupOutput:
    return ExactLegalLookupOutput(
        matches=[],
        unresolved_cross_references=unresolved or [],
        coverage=CorpusCoverage(
            family="Migration Regulations Schedule 2",
            status=status,  # type: ignore[arg-type]
            report_version="report-coverage",
            gap_reason=gap_reason,
        ),
        corpus_version="corpus-coverage",
        index_version="index-coverage",
    )


def _context(*, exact=None, navigation=None):
    return ToolExecutorContext(
        request_id="m1-request",
        registry=create_registry("m1-request"),
        as_of_date=date(2026, 8, 23),
        exact_legal_lookup_service=exact,
        schedule2_navigation_map=navigation,
    )


def _call(name: str, arguments: dict, call_id: str = "call-1") -> ToolCallRequest:
    return ToolCallRequest(call_id=call_id, name=name, arguments=arguments)


def test_arm_n_isolated_from_control_premium_and_public_default_policy():
    with patch("app.services.agent_policy_service.get_settings", return_value=_settings()):
        service = AgentPolicyService()
        arm_l = service.get_tool_names(service.build_policy(mode="default", experiment_arm="L"))
        arm_n = service.get_tool_names(service.build_policy(mode="default", experiment_arm="N"))
        premium = service.get_tool_names(service.build_policy(mode="premium", experiment_arm="N"))
        public_default = service.get_tool_names(service.build_policy(mode="default"))
    assert "schedule2_navigation" not in arm_l
    assert "exact_legal_lookup" not in arm_l
    assert {"schedule2_navigation", "exact_legal_lookup"}.issubset(arm_n)
    assert "schedule2_navigation" not in premium
    assert "exact_legal_lookup" not in premium
    assert "schedule2_navigation" not in public_default
    assert "exact_legal_lookup" not in public_default


def test_navigation_is_structural_only_and_is_capped():
    context = _context(navigation=_navigation_map())
    executor = ToolExecutorService()
    result = executor.execute_tool(
        _call(
            "schedule2_navigation",
            {"requests": [
                {"operation": "subclass_map", "subclass": "485", "provision_ref": None, "max_targets": 20},
                {"operation": "follow_references", "subclass": None, "provision_ref": "485.211", "max_targets": 20},
            ]},
        ),
        context,
    )
    assert result.result.status == "ok"
    assert context.registry.entry_count == 0
    payload = json.dumps(result.result.data)
    assert "ELIGIBLE_IF" not in payload
    assert '"evidence_ref":' not in payload
    assert result.result.data["evidence_refs"] == []
    assert "unresolved" in payload and "ambiguous" in payload

    second = executor.execute_tool(
        _call("schedule2_navigation", {"requests": [{"operation": "provision_context", "subclass": None, "provision_ref": "485.211", "max_targets": 20}]}, "call-2"),
        context,
    )
    assert second.result.status == "ok"
    denied = executor.execute_tool(
        _call("schedule2_navigation", {"requests": [{"operation": "provision_context", "subclass": None, "provision_ref": "485.211", "max_targets": 20}]}, "call-3"),
        context,
    )
    assert denied.result.status == "partial"
    assert denied.result.error.code == "SCHEDULE2_NAVIGATION_BUDGET_EXHAUSTED"


def test_exact_lookup_batch_registers_genuine_refs_and_caps():
    exact = FakeExactLookup()
    context = _context(exact=exact)
    executor = ToolExecutorService()
    args = {"requests": [{
        "query": "485.211",
        "document_id": None,
        "source_types": [],
        "schedule": "2",
        "provision": "485.211",
        "case_citation": None,
        "subclass": "485",
        "follow_cross_references": True,
        "max_hits": 8,
    }] * 8}
    result = executor.execute_tool(_call("exact_legal_lookup", args), context)
    assert result.result.status == "ok"
    assert len(result.result.data["lookups"]) == 8
    refs = [item["matches"][0]["canonical_evidence_ref"]["evidence_ref"] for item in result.result.data["lookups"]]
    assert all(context.registry.is_registered(ref) for ref in refs)
    assert len(exact.calls) == 8

    second = executor.execute_tool(_call("exact_legal_lookup", args, "call-2"), context)
    assert second.result.status == "ok"
    denied = executor.execute_tool(_call("exact_legal_lookup", args, "call-3"), context)
    assert denied.result.status == "partial"
    assert denied.result.error.code == "EXACT_LEGAL_LOOKUP_BUDGET_EXHAUSTED"

    oversize = _context(exact=FakeExactLookup())
    invalid = executor.execute_tool(
        _call("exact_legal_lookup", {"requests": [args["requests"][0]] * 9}),
        oversize,
    )
    assert invalid.result.status == "invalid_request"
    assert invalid.result.error.code == "INVALID_EXACT_LEGAL_LOOKUP_REQUEST"


def test_exact_lookup_skips_empty_items_and_preserves_valid_batch_entries():
    exact = FakeExactLookup()
    context = _context(exact=exact)
    valid = {
        "query": "485.211",
        "schedule": "2",
        "provision": "485.211",
        "subclass": "485",
        "follow_cross_references": True,
        "max_hits": 8,
    }
    empty = {
        "query": None,
        "document_id": None,
        "source_types": [],
        "source_type": None,
        "locator_type": None,
        "locator": None,
        "target_document": None,
        "node_type": None,
        "provision_ref": None,
        "schedule": None,
        "provision": None,
        "case_citation": None,
        "subclass": None,
        "follow_cross_references": True,
        "max_hits": 8,
    }
    result = ToolExecutorService().execute_tool(
        _call("exact_legal_lookup", {"requests": [empty, valid]}),
        context,
    )

    assert result.result.status == "ok"
    assert result.result.data["skipped_empty_locator_count"] == 1
    assert len(result.result.data["lookups"]) == 1
    assert len(exact.calls) == 1
    assert context.exact_invalid_empty_request_count == 1


def test_all_empty_exact_lookup_is_bounded_and_deterministic():
    context = _context(exact=FakeExactLookup())
    result = ToolExecutorService().execute_tool(
        _call("exact_legal_lookup", {"requests": [{"query": None}]}),
        context,
    )

    assert result.result.status == "partial"
    assert result.result.error.code == "EXACT_NO_USABLE_LOCATOR"
    assert result.result.data["lookups"] == []
    assert context.exact_legal_lookup_call_count == 0
    assert context.exact_legal_lookup_denied_call_count == 0


def test_exact_tools_remain_visible_until_execution_budget_is_reached():
    from app.services.agent_runtime_service import AgentRuntimeService

    tools = [{"name": "exact_legal_lookup"}, {"name": "flat_rag_search"}, {"name": "submit_answer"}]
    after_one = AgentRuntimeService._provider_tools_for_round(
        tools,
        flat_rag_executed_count=0,
        max_flat_rag_calls=1,
        exact_legal_lookup_call_count=1,
        max_exact_legal_lookup_calls=2,
    )
    assert [tool["name"] for tool in after_one] == ["exact_legal_lookup", "flat_rag_search", "submit_answer"]
    after_two = AgentRuntimeService._provider_tools_for_round(
        tools,
        flat_rag_executed_count=0,
        max_flat_rag_calls=1,
        exact_legal_lookup_call_count=2,
        max_exact_legal_lookup_calls=2,
    )
    assert [tool["name"] for tool in after_two] == ["flat_rag_search", "submit_answer"]


def test_arm_n_terminal_normalization_allows_nested_claim_spans_and_deduplicates_lists():
    context = _context()
    context.allow_model_canonical_refs = True
    context.allow_overlapping_claims = True
    draft = "Alpha beta"
    result = ToolExecutorService().execute_tool(
        _call("submit_answer", {
            "schema_version": "agent_submission.v2",
            "answer_class": "general",
            "draft_markdown": draft,
            "claims": [
                {
                    "claim_id": "c1", "claim_type": "general", "materiality": "supporting",
                    "text": "Alpha beta", "draft_start": 0, "draft_end": len(draft),
                    "evidence_refs": [], "depends_on": [],
                },
                {
                    "claim_id": "c2", "claim_type": "general", "materiality": "supporting",
                    "text": "beta", "draft_start": 6, "draft_end": len(draft),
                    "evidence_refs": [], "depends_on": ["c1", "c1"],
                },
            ],
            "citations": [],
            "research_status": "not_required",
            "state_patch": [],
        }),
        context,
    )

    assert result.result.status == "ok"
    assert result.submission is not None
    assert result.submission.claims[1].depends_on == ["c1"]


def test_navigation_style_locator_is_normalized_before_exact_service_and_traced():
    exact = FakeExactLookup()
    context = _context(exact=exact)
    result = ToolExecutorService().execute_tool(
        _call("exact_legal_lookup", {
            "requests": [{
                "query": None,
                "document_id": None,
                "source_types": [],
                "source_type": None,
                "locator_type": "schedule3_criterion",
                "locator": "Schedule 3 criterion 3001",
                "target_document": "Schedule 3",
                "node_type": "external_locator",
                "provision_ref": "3001",
                "schedule": None,
                "provision": None,
                "case_citation": None,
                "subclass": None,
                "follow_cross_references": True,
                "max_hits": 8,
            }],
        }),
        context,
    )

    assert result.result.status == "ok"
    assert exact.requests[0].schedule == "3"
    assert exact.requests[0].provision == "3001"
    assert exact.requests[0].query is None
    trace = context.exact_lookup_requests[0]
    assert trace["normalized_locator_type"] == "schedule3_criterion"
    assert trace["normalized_request"]["schedule"] == "3"
    assert trace["result"]["matches_count"] == 1
    assert context.registry.entry_count == 1


def test_compound_exact_locator_expands_inside_one_invocation():
    exact = FakeExactLookup()
    context = _context(exact=exact)
    result = ToolExecutorService().execute_tool(
        _call("exact_legal_lookup", {
            "requests": [{
                "query": None,
                "document_id": None,
                "source_types": ["regulations"],
                "source_type": None,
                "locator_type": "schedule3_criterion",
                "locator": None,
                "target_document": "Schedule 3",
                "node_type": None,
                "provision_ref": None,
                "schedule": "Schedule 3",
                "provision": "3003 and 3004",
                "case_citation": None,
                "subclass": None,
                "follow_cross_references": False,
                "max_hits": 8,
            }],
        }),
        context,
    )

    assert result.result.status == "ok"
    assert len(result.result.data["lookups"]) == 2
    assert [request.provision for request in exact.requests] == ["3003", "3004"]
    assert all(request.schedule == "3" for request in exact.requests)
    assert context.exact_lookup_requested_locator_count == 2
    assert context.exact_lookup_resolved_locator_count == 2
    assert context.exact_lookup_unresolved_locator_count == 0
    assert [trace["expanded_index"] for trace in context.exact_lookup_requests] == [0, 1]
    assert all(
        context.registry.resolve(ref).tool_name == "exact_legal_lookup"
        for ref in context.registry.get_all_refs()
    )


@pytest.mark.parametrize(
    ("coverage_status", "gap_reason", "unresolved"),
    [
        ("available_partial", "Schedule 2 family has known local gaps", []),
        ("absent", "Target family is not present in the local corpus", []),
        ("unknown", "Coverage report does not identify this family", []),
        ("available_complete", None, ["regulation 1.03"]),
    ],
)
def test_exact_lookup_passthrough_preserves_coverage_and_unresolved_states(
    coverage_status: str,
    gap_reason: str | None,
    unresolved: list[str],
):
    """The adapter exposes exact-service state without semantic conclusions."""
    output = _coverage_output(
        status=coverage_status,
        gap_reason=gap_reason,
        unresolved=unresolved,
    )
    context = _context(exact=PassthroughExactLookup(output))
    result = ToolExecutorService().execute_tool(
        _call("exact_legal_lookup", {
            "requests": [{
                "query": "regulation 1.03",
                "document_id": None,
                "source_types": [],
                "schedule": "2",
                "provision": None,
                "case_citation": None,
                "subclass": None,
                "follow_cross_references": True,
                "max_hits": 8,
            }],
        }),
        context,
    )

    assert result.result.status == "ok"
    lookup = result.result.data["lookups"][0]
    assert lookup["coverage"]["status"] == coverage_status
    assert lookup["coverage"]["gap_reason"] == gap_reason
    assert lookup["unresolved_cross_references"] == unresolved
    serialized = json.dumps(lookup).lower()
    assert "law does not exist" not in serialized
    if coverage_status in {"absent", "unknown"}:
        assert coverage_status != "available_complete"


def test_arm_n_fabricated_exact_ref_cannot_pass_submit_answer():
    """Arm N still uses the shared request-scoped submission integrity gate."""
    context = _context()
    context.allow_model_canonical_refs = True
    draft = "The exact local rule applies."
    fabricated_ref = "exact:not-produced-by-backend"
    result = ToolExecutorService().execute_tool(
        _call("submit_answer", {
            "schema_version": "agent_submission.v2",
            "answer_class": "substantive_legal",
            "draft_markdown": draft,
            "claims": [{
                "claim_id": "c1",
                "claim_type": "legal_rule",
                "materiality": "decisive",
                "text": draft,
                "draft_start": 0,
                "draft_end": len(draft),
                "evidence_refs": [fabricated_ref],
                "depends_on": [],
            }],
            "citations": [{
                "evidence_ref": fabricated_ref,
                "display_label": "Unregistered exact source",
            }],
            "research_status": "complete",
            "state_patch": [],
        }),
        context,
    )

    assert result.result.status == "invalid_request"
    assert any(
        error["code"] == "EVIDENCE_NOT_REGISTERED"
        for error in result.result.data["errors"]
    )
    assert not context.registry.is_registered(fabricated_ref)


class _Provider(ProviderInterface):
    def __init__(self, responses, continuation_factory=None):
        self.responses = list(responses)
        self.continuation_factory = continuation_factory
        self.timeouts = []

    async def call(self, **kwargs):
        self.timeouts.append(kwargs["timeout_ms"])
        if self.responses:
            return self.responses.pop(0)
        assert self.continuation_factory is not None
        return self.continuation_factory(kwargs)


def test_runtime_path_keeps_navigation_non_evidence_exact_evidence_and_deadline():
    exact = FakeExactLookup()

    def final_submission(kwargs):
        exact_refs = []
        for message in kwargs["messages_history"] or []:
            if message.get("role") != "tool":
                continue
            payload = json.loads(message["content"])
            for lookup in payload.get("data", {}).get("lookups", []):
                exact_refs.extend(
                    match["canonical_evidence_ref"]["evidence_ref"]
                    for match in lookup.get("matches", [])
                )
        assert len(exact_refs) == 1
        ref = exact_refs[0]
        draft = "The exact local rule applies."
        return ProviderResponse(
            response_id="r2",
            model="gpt-5.6-luna",
            status="ok",
            tool_calls=[_call("submit_answer", {
                "schema_version": "agent_submission.v2",
                "answer_class": "substantive_legal",
                "draft_markdown": draft,
                "claims": [{
                    "claim_id": "c1",
                    "claim_type": "legal_rule",
                    "materiality": "decisive",
                    "text": draft,
                    "draft_start": 0,
                    "draft_end": len(draft),
                    "evidence_refs": [ref],
                    "depends_on": [],
                }],
                "citations": [{
                    "evidence_ref": ref,
                    "display_label": "Exact local Schedule 2 source",
                }],
                "research_status": "complete",
                "state_patch": [],
            })],
        )

    provider = _Provider([
        ProviderResponse(
            response_id="r1",
            model="gpt-5.6-luna",
            status="ok",
            tool_calls=[
                _call("schedule2_navigation", {"requests": [{"operation": "follow_references", "subclass": None, "provision_ref": "485.211", "max_targets": 20}]}),
                _call("exact_legal_lookup", {"requests": [{
                    "query": "485.211", "document_id": None, "source_types": [], "schedule": "2",
                    "provision": "485.211", "case_citation": None, "subclass": "485",
                    "follow_cross_references": True, "max_hits": 8,
                }]}),
            ],
        ),
    ], continuation_factory=final_submission)
    settings = _settings()
    registry = create_registry("runtime-m1")
    request = AgentRuntimeRequest(
        request_id="runtime-m1",
        turn_id="turn-m1",
        mode="default",
        user_text="Find the relevant provision.",
        response_language="en",
        as_of_date=date(2026, 8, 23),
        matter_state={},
        execution_budget=ExecutionBudget(
            max_tool_rounds=2, max_provider_calls=3, max_retries=0,
            turn_deadline_ms=2000, answer_research_target_ms=1500,
            checker_target_ms=500, max_flat_rag_calls=1,
            retry_viability_threshold_ms=100,
        ),
        experiment_arm="N",
    )

    import asyncio
    with patch("app.services.agent_policy_service.get_settings", return_value=settings):
        start = time.perf_counter()
        result = asyncio.run(AgentRuntimeService(provider=provider).run_shadow(
            request,
            deadline=AbsoluteTurnDeadline(start, 2000),
            registry=registry,
            schedule2_navigation_map=_navigation_map(),
            exact_legal_lookup_service=exact,
        ))
    assert result.status == "completed"
    assert result.submission is not None
    assert result.submission.answer_class == "substantive_legal"
    exact_ref = exact.calls[0] and registry.get_all_refs()[0]
    assert exact_ref.startswith("exact:")
    assert registry.is_registered(exact_ref)
    assert result.submission.claims[0].evidence_refs == [exact_ref]
    assert result.submission.citations[0].evidence_ref == exact_ref
    assert result.metrics.schedule2_navigation_call_count == 1
    assert result.metrics.exact_lookup_call_count == 1
    assert any(output.data.get("navigation_only") for output in result.tool_outputs)
    assert any(output.data.get("lookups") for output in result.tool_outputs)
    assert result.metrics.turn_deadline_ms == 2000
    assert provider.timeouts[0] <= 1500
    assert all(timeout <= 2000 for timeout in provider.timeouts)


def test_arm_n_navigation_loads_real_tracked_sidecar_without_evidence():
    navigation = Schedule2NavigationMap.from_files()
    context = _context(navigation=navigation)
    result = ToolExecutorService().execute_tool(
        _call("schedule2_navigation", {
            "requests": [{
                "operation": "subclass_map",
                "subclass": "485",
                "provision_ref": None,
                "max_targets": 5,
            }],
        }),
        context,
    )

    assert result.result.status == "ok"
    assert result.result.data["results"][0]["found"] is True
    assert result.result.data["results"][0]["edges"]
    assert context.registry.entry_count == 0
    assert result.result.data["evidence_refs"] == []
