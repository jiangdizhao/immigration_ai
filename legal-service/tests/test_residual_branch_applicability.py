from __future__ import annotations

from datetime import date, datetime, timezone
import hashlib

import pytest

from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
from app.schemas.evidence import CanonicalLocalEvidenceRef
from app.services.agent_policy_service import AgentPolicyService
from app.services.compact_checker_contract_service import build_phase6_checker_input
from app.services.request_evidence_registry import create_registry
from app.services.tool_executor_service import ToolCallRequest, ToolExecutorContext, ToolExecutorService


def _evidence(text: str, *, chunk: str) -> CanonicalLocalEvidenceRef:
    return CanonicalLocalEvidenceRef(
        evidence_origin="canonical_local",
        evidence_ref="exact:pending",
        source_type="legislation",
        source_authenticity="canonical_official",
        authority_kind="delegated_legislation",
        jurisdiction="Cth",
        binding_status="binding",
        court_or_tribunal_level=None,
        retrieved_at=datetime(2026, 8, 30, tzinfo=timezone.utc),
        provenance_complete=True,
        canonical_source_id="synthetic-regulation",
        canonical_chunk_id=chunk,
        document_id="synthetic-regulation",
        document_version="F2026C00667",
        provision_or_span=chunk,
        effective_from=None,
        effective_to=None,
        canonical_url="https://example.gov.au/synthetic-regulation",
        content_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
        text=text,
    )


def _context(*, enabled: bool = True):
    registry = create_registry("residual-guard-test")
    return registry, ToolExecutorContext(
        request_id=registry.request_id,
        registry=registry,
        residual_branch_guard_enabled=enabled,
    )


def _register(registry, text: str, chunk: str) -> str:
    return registry.register_canonical_evidence(
        evidence=_evidence(text, chunk=chunk),
        tool_call_id=f"exact-{chunk}",
    )


def _payload(residual_ref: str, *, other_refs: list[str] | None = None, resolution=None):
    draft = "The residual branch controls condition Y."
    payload = {
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
            "evidence_refs": [residual_ref] + list(other_refs or []),
            "depends_on": [],
        }],
        "citations": [],
        "research_status": "complete",
        "state_patch": [],
    }
    if resolution is not None:
        payload["applicability_resolutions"] = [resolution]
    return payload


def _submit(context, payload):
    return ToolExecutorService().execute_tool(
        ToolCallRequest("submit-1", "submit_answer", payload),
        context,
    )


def _assert_guard_rejection(result):
    assert result.result.status == "invalid_request"
    assert result.result.data["errors"][0]["code"] == (
        "APPLICABILITY_EVIDENCE_UNRESOLVED"
    )


def test_residual_without_resolution_is_rejected():
    registry, context = _context()
    residual = _register(registry, "123.456(3) In any other case, condition Y.", "123.456(3)")
    result = _submit(context, _payload(residual))
    _assert_guard_rejection(result)
    assert context.residual_branch_guard_trigger_count == 1
    assert context.unresolved_applicability_count == 1


def test_protocol_off_accepts_residual_without_resolution():
    registry, context = _context(enabled=False)
    residual = _register(registry, "123.456(3) In any other case, condition Y.", "off-residual")
    result = _submit(context, _payload(residual))
    assert result.result.status == "ok"
    assert result.submission_action is not None
    assert result.submission_action.action == "accept_submission"
    assert context.residual_branch_guard_trigger_count == 0


def test_protocol_off_accepts_specific_branch_without_applicability_basis():
    registry, context = _context(enabled=False)
    specific = _register(registry, "123.456(2) Legal Class X produces result Y.", "off-specific")
    result = _submit(context, _payload(specific))
    assert result.result.status == "ok"
    assert context.residual_branch_guard_trigger_count == 0


def test_protocol_off_keeps_ordinary_evidence_provenance_validation():
    _, context = _context(enabled=False)
    result = _submit(context, _payload("exact:not-registered"))
    assert result.result.status == "invalid_request"
    assert result.result.data["errors"][0]["code"] == "EVIDENCE_NOT_REGISTERED"


def test_residual_only_is_rejected():
    registry, context = _context()
    residual = _register(registry, "123.456(3) In any other case, condition Y.", "residual")
    result = _submit(context, _payload(residual))
    _assert_guard_rejection(result)


def test_competing_branch_without_applicability_basis_is_rejected():
    registry, context = _context()
    residual = _register(registry, "123.456(3) In any other case, condition Y.", "residual")
    competing = _register(registry, "123.456(2) If Legal Class X, nil.", "specific")
    result = _submit(
        context,
        _payload(
            residual,
            other_refs=[competing],
            resolution={
                "claim_id": "c1",
                "selected_branch_evidence_ref": residual,
                "resolution_kind": "residual_branch",
                "status": "resolved",
                "competing_branch_evidence_refs": [competing],
            },
        ),
    )
    _assert_guard_rejection(result)


def test_competing_branch_and_separate_applicability_basis_are_accepted():
    registry, context = _context()
    residual = _register(registry, "123.456(3) In any other case, condition Y.", "residual")
    competing = _register(registry, "123.456(2) If Legal Class X, nil.", "specific")
    basis = _register(registry, "The authoritative classification resolves Legal Class X.", "basis")
    resolution = {
        "claim_id": "c1",
        "selected_branch_evidence_ref": residual,
        "resolution_kind": "residual_branch",
        "status": "resolved",
        "competing_branch_evidence_refs": [competing],
        "applicability_basis_evidence_refs": [basis],
    }
    result = _submit(
        context,
        _payload(residual, other_refs=[competing], resolution=resolution),
    )
    assert result.result.status == "ok"
    assert result.submission_action is not None
    assert result.submission_action.action == "accept_submission"
    assert context.applicability_resolution_count == 1
    assert context.residual_branch_submission_rejection_count == 0


def test_specific_branch_evidence_does_not_trigger_residual_guard():
    registry, context = _context()
    specific = _register(registry, "123.456(2) If Legal Class X, nil.", "specific")
    result = _submit(context, _payload(specific))
    assert result.result.status == "ok"
    assert context.residual_branch_guard_trigger_count == 0


def test_specific_branch_with_separate_applicability_basis_is_accepted():
    registry, context = _context()
    specific = _register(registry, "123.456(2) Legal Class X produces result Y.", "specific")
    basis = _register(registry, "The authoritative classification establishes Legal Class X.", "basis")
    result = _submit(
        context,
        _payload(
            specific,
            resolution={
                "claim_id": "c1",
                "selected_branch_evidence_ref": specific,
                "resolution_kind": "specific_branch",
                "status": "resolved",
                "applicability_basis_evidence_refs": [basis],
            },
        ),
    )
    assert result.result.status == "ok"
    assert context.applicability_resolution_count == 1


def test_specific_branch_without_applicability_basis_is_rejected():
    registry, context = _context()
    specific = _register(registry, "123.456(2) Legal Class X produces result Y.", "specific")
    result = _submit(
        context,
        _payload(
            specific,
            resolution={
                "claim_id": "c1",
                "selected_branch_evidence_ref": specific,
                "resolution_kind": "specific_branch",
                "status": "resolved",
            },
        ),
    )
    _assert_guard_rejection(result)


def test_specific_branch_reusing_selected_ref_as_basis_is_rejected_by_schema():
    registry, context = _context()
    specific = _register(registry, "123.456(2) Legal Class X produces result Y.", "specific")
    result = _submit(
        context,
        _payload(
            specific,
            resolution={
                "claim_id": "c1",
                "selected_branch_evidence_ref": specific,
                "resolution_kind": "specific_branch",
                "status": "resolved",
                "applicability_basis_evidence_refs": [specific],
            },
        ),
    )
    assert result.result.status == "invalid_request"


def test_specific_branch_with_unregistered_basis_is_rejected():
    registry, context = _context()
    specific = _register(registry, "123.456(2) Legal Class X produces result Y.", "specific")
    result = _submit(
        context,
        _payload(
            specific,
            resolution={
                "claim_id": "c1",
                "selected_branch_evidence_ref": specific,
                "resolution_kind": "specific_branch",
                "status": "resolved",
                "applicability_basis_evidence_refs": ["exact:not-registered"],
            },
        ),
    )
    _assert_guard_rejection(result)


def test_specific_branch_unresolved_status_is_rejected():
    registry, context = _context()
    specific = _register(registry, "123.456(2) Legal Class X produces result Y.", "specific")
    basis = _register(registry, "The authoritative classification establishes Legal Class X.", "basis")
    result = _submit(
        context,
        _payload(
            specific,
            resolution={
                "claim_id": "c1",
                "selected_branch_evidence_ref": specific,
                "resolution_kind": "specific_branch",
                "status": "unresolved",
                "applicability_basis_evidence_refs": [basis],
            },
        ),
    )
    _assert_guard_rejection(result)


def test_specific_branch_without_competing_refs_is_allowed():
    registry, context = _context()
    specific = _register(registry, "123.456(2) Legal Class X produces result Y.", "specific")
    basis = _register(registry, "The authoritative classification establishes Legal Class X.", "basis")
    result = _submit(
        context,
        _payload(
            specific,
            resolution={
                "claim_id": "c1",
                "selected_branch_evidence_ref": specific,
                "resolution_kind": "specific_branch",
                "status": "resolved",
                "applicability_basis_evidence_refs": [basis],
            },
        ),
    )
    assert result.result.status == "ok"


def test_non_decisive_residual_phrase_does_not_trigger_guard():
    registry, context = _context()
    residual = _register(registry, "123.456(3) In any other case, condition Y.", "residual")
    draft = "The provision contains a residual branch."
    result = _submit(context, {
        "schema_version": "agent_submission.v2",
        "answer_class": "substantive_legal",
        "draft_markdown": draft,
        "claims": [{
            "claim_id": "c1",
            "claim_type": "legal_rule",
            "materiality": "supporting",
            "text": draft,
            "draft_start": 0,
            "draft_end": len(draft),
            "evidence_refs": [residual],
            "depends_on": [],
        }],
        "citations": [],
        "research_status": "complete",
        "state_patch": [],
    })
    assert result.result.status == "ok"
    assert context.residual_branch_guard_trigger_count == 0


def test_unless_and_except_are_not_v1_markers():
    registry, context = _context()
    evidence = _register(
        registry,
        "The rule applies unless an exception is established; except in that event.",
        "false-marker",
    )
    result = _submit(context, _payload(evidence))
    assert result.result.status == "ok"
    assert context.residual_branch_guard_trigger_count == 0


def test_invalid_evidence_ref_is_rejected_deterministically():
    _, context = _context()
    result = _submit(context, _payload("exact:not-registered"))
    assert result.result.status == "invalid_request"
    assert result.result.data["errors"][0]["code"] == "EVIDENCE_NOT_REGISTERED"


def test_invalid_residual_submission_uses_existing_correction_allowance():
    registry, context = _context()
    residual = _register(registry, "123.456(3) In any other case, condition Y.", "residual")
    first = _submit(context, _payload(residual))
    assert first.submission_action is not None
    assert first.submission_action.can_continue is True
    assert "structured applicability evidence" in first.result.data["repair_instruction"]

    competing = _register(registry, "123.456(2) If Legal Class X, nil.", "specific")
    basis = _register(registry, "The authoritative classification resolves Legal Class X.", "basis")
    second = _submit(
        context,
        _payload(
            residual,
            other_refs=[competing],
            resolution={
                "claim_id": "c1",
                "selected_branch_evidence_ref": residual,
                "resolution_kind": "residual_branch",
                "status": "resolved",
                "competing_branch_evidence_refs": [competing],
                "applicability_basis_evidence_refs": [basis],
            },
        ),
    )
    assert second.result.status == "ok"
    assert context.terminal_record.correction_count == 1


def test_checker_packet_carries_applicability_evidence_and_record():
    registry, context = _context()
    residual = _register(registry, "123.456(3) In any other case, condition Y.", "residual")
    competing = _register(registry, "123.456(2) If Legal Class X, nil.", "specific")
    basis = _register(registry, "The authoritative classification resolves Legal Class X.", "basis")
    payload = _payload(
        residual,
        other_refs=[competing],
        resolution={
            "claim_id": "c1",
            "selected_branch_evidence_ref": residual,
            "resolution_kind": "residual_branch",
            "status": "resolved",
            "competing_branch_evidence_refs": [competing],
            "applicability_basis_evidence_refs": [basis],
        },
    )
    result = _submit(context, payload)
    submission = result.submission
    request = AgentRuntimeRequest(
        request_id=registry.request_id,
        turn_id="turn-1",
        mode="default",
        user_text="Which rule applies?",
        response_language="en",
        as_of_date=date(2026, 8, 30),
        matter_state={},
        execution_budget=ExecutionBudget(
            turn_deadline_ms=60000,
            answer_research_target_ms=45000,
            checker_target_ms=8000,
        ),
    )
    packet = build_phase6_checker_input(
        request=request,
        submission=submission,
        registry=registry,
    )
    assert {item.evidence_ref for item in packet.evidence} >= {residual, competing, basis}
    assert packet.applicability_resolutions[0].claim_id == "c1"


def test_protocol_off_checker_packet_omits_applicability_structures():
    registry, context = _context(enabled=False)
    residual = _register(registry, "123.456(3) In any other case, condition Y.", "off-checker-residual")
    competing = _register(registry, "123.456(2) If Legal Class X, nil.", "off-checker-specific")
    basis = _register(registry, "The authoritative classification resolves Legal Class X.", "off-checker-basis")
    result = _submit(
        context,
        _payload(
            residual,
            other_refs=[],
            resolution={
                "claim_id": "c1",
                "selected_branch_evidence_ref": residual,
                "resolution_kind": "residual_branch",
                "status": "resolved",
                "competing_branch_evidence_refs": [competing],
                "applicability_basis_evidence_refs": [basis],
            },
        ),
    )
    assert result.result.status == "ok"
    submission = result.submission
    request = AgentRuntimeRequest(
        request_id=registry.request_id,
        turn_id="turn-off",
        mode="default",
        user_text="Which rule applies?",
        response_language="en",
        as_of_date=date(2026, 8, 30),
        matter_state={},
        execution_budget=ExecutionBudget(
            turn_deadline_ms=60000,
            answer_research_target_ms=45000,
            checker_target_ms=8000,
            max_schedule2_navigation_calls=2,
            max_exact_legal_lookup_calls=2,
        ),
        applicability_protocol_enabled=False,
    )
    packet = build_phase6_checker_input(
        request=request,
        submission=submission,
        registry=registry,
        applicability_resolutions=submission.applicability_resolutions,
        include_applicability_resolutions=False,
    )
    assert {item.evidence_ref for item in packet.evidence} == {residual}
    assert packet.applicability_resolutions == []


def test_residual_policy_and_guard_are_default_only():
    default = AgentPolicyService().build_policy(mode="default", experiment_arm="N")
    premium = AgentPolicyService().build_policy(mode="premium")
    assert "Branch Applicability" in default.system_prompt
    assert "Branch Applicability" not in premium.system_prompt
    assert default.prompt_version.endswith(".arm-n-research")
    assert premium.prompt_version == "luna.system.v2.1.3.b3-default-runtime-governance"


def test_protocol_off_is_default_only_and_removes_structured_submit_field():
    service = AgentPolicyService()
    on = service.build_policy(
        mode="default", experiment_arm="N", applicability_protocol_enabled=True
    )
    off = service.build_policy(
        mode="default", experiment_arm="N", applicability_protocol_enabled=False
    )
    premium = service.build_policy(
        mode="premium", experiment_arm="N", applicability_protocol_enabled=False
    )

    def submit_tool(policy):
        return next(tool for tool in policy.tools if tool.get("name") == "submit_answer")

    assert "applicability_resolutions" in submit_tool(on)["parameters"]["properties"]
    assert "Branch Applicability" in on.system_prompt
    assert "applicability_resolutions" not in submit_tool(off)["parameters"]["properties"]
    assert "Branch Applicability" not in off.system_prompt
    assert "Prefer an applicable specific provision" in off.system_prompt
    assert submit_tool(premium) is not None
    assert submit_tool(premium) == next(
        tool for tool in service.build_policy(mode="premium").tools
        if tool.get("name") == "submit_answer"
    )
