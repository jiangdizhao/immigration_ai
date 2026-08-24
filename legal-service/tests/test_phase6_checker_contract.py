from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.agent import AgentClaim, AgentRuntimeRequest, AgentSubmissionV2, ExecutionBudget
from app.schemas.checker import (
    Phase6CheckerDecision,
    Phase6CheckerEvidence,
    Phase6CheckerReasonCode,
    Phase6CheckerResult,
    Phase6CheckerVerdict,
)
from app.schemas.evidence import NativeWebEvidenceRef
from app.services.compact_checker_contract_service import (
    Phase6CheckerContractError,
    build_phase6_checker_input,
    evaluate_phase6_checker_gate,
    should_run_phase6_checker,
    validate_phase6_checker_result,
)
from app.services.request_evidence_registry import create_registry


def _request() -> AgentRuntimeRequest:
    return AgentRuntimeRequest(
        request_id="phase6-request",
        turn_id="phase6-turn",
        mode="default",
        user_text="What rule applies to this visa question?",
        response_language="en",
        as_of_date=date(2026, 8, 24),
        matter_state={},
        execution_budget=ExecutionBudget(
            turn_deadline_ms=60000,
            answer_research_target_ms=32000,
            checker_target_ms=8000,
        ),
    )


def _submission(
    *,
    draft: str = "The legal rule applies.",
    claims: list[AgentClaim] | None = None,
    answer_class: str = "substantive_legal",
) -> AgentSubmissionV2:
    if claims is None:
        claims = [AgentClaim(
            claim_id="c1",
            claim_type="legal_rule",
            materiality="decisive",
            text=draft,
            draft_start=0,
            draft_end=len(draft),
            evidence_refs=["web:registered"],
        )]
    return AgentSubmissionV2(
        schema_version="agent_submission.v2",
        answer_class=answer_class,
        draft_markdown=draft,
        claims=claims,
        citations=[],
        research_status="complete",
        state_patch=[],
    )


def _native_evidence(*, ref: str = "web:pending") -> NativeWebEvidenceRef:
    return NativeWebEvidenceRef(
        evidence_origin="openai_web_native",
        evidence_ref=ref,
        source_type="web_page",
        source_authenticity="official_copy",
        authority_kind="operational_guidance",
        jurisdiction="Cth",
        binding_status="not_applicable",
        court_or_tribunal_level=None,
        retrieved_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
        provenance_complete=True,
        search_call_id="search-1",
        url="https://example.gov.au/immigration/rule",
        title="Official rule page",
        native_web_citation=None,
        canonical_source_id=None,
        document_version=None,
        effective_from=None,
        effective_to=None,
        text=None,
        content_hash=None,
    )


def _registered_registry(ref: str = "web:registered"):
    registry = create_registry("phase6-request")
    registered_ref = registry.register_native_web_evidence(
        evidence=_native_evidence(),
        tool_call_id="search-1",
    )
    # Tests use the server-issued value rather than model-authored ref.
    return registry, registered_ref


def _packet(*, submission: AgentSubmissionV2 | None = None):
    registry, registered_ref = _registered_registry()
    submission = submission or _submission(
        claims=[AgentClaim(
            claim_id="c1",
            claim_type="legal_rule",
            materiality="decisive",
            text="The legal rule applies.",
            draft_start=0,
            draft_end=len("The legal rule applies."),
            evidence_refs=[registered_ref],
        )]
    )
    return build_phase6_checker_input(
        request=_request(),
        submission=submission,
        registry=registry,
        compact_matter_facts={"confirmed": "fact"},
    )


def test_phase6_verdict_contract_is_exactly_keep_flag_block() -> None:
    assert {verdict.value for verdict in Phase6CheckerVerdict} == {"KEEP", "FLAG", "BLOCK"}
    assert set(Phase6CheckerResult.model_fields) == {
        "schema_version", "decisions", "material_omission_suspected", "escalate",
    }


def test_phase6_contract_has_no_qualification_or_rewrite_fields() -> None:
    assert "qualification" not in Phase6CheckerDecision.model_fields
    assert "replacement_text" not in Phase6CheckerDecision.model_fields
    assert "rewritten_claim" not in Phase6CheckerDecision.model_fields
    assert "rewritten_answer" not in Phase6CheckerResult.model_fields
    with pytest.raises(ValidationError):
        Phase6CheckerDecision(
            claim_id="c1",
            verdict="KEEP",
            reason_codes=["SUPPORTED"],
            qualification=None,
        )


def test_keep_flag_and_block_targets_are_structured() -> None:
    packet = _packet()
    keep = Phase6CheckerResult(
        schema_version="phase6_checker.result.v1",
        decisions=[{
            "claim_id": "c1",
            "verdict": "KEEP",
            "reason_codes": ["SUPPORTED"],
            "supporting_evidence_refs": [packet.evidence[0].evidence_ref],
        }],
    )
    flag = Phase6CheckerResult(
        schema_version="phase6_checker.result.v1",
        decisions=[{
            "claim_id": "c1",
            "verdict": "FLAG",
            "reason_codes": ["APPLICABILITY_UNCLEAR"],
            "supporting_evidence_refs": [],
        }],
    )
    block = Phase6CheckerResult(
        schema_version="phase6_checker.result.v1",
        decisions=[{
            "claim_id": "c1",
            "verdict": "BLOCK",
            "reason_codes": ["CONTRADICTED_BY_APPLICABLE_EVIDENCE"],
            "supporting_evidence_refs": [packet.evidence[0].evidence_ref],
        }],
    )
    assert [keep.decisions[0].verdict, flag.decisions[0].verdict, block.decisions[0].verdict] == [
        Phase6CheckerVerdict.KEEP, Phase6CheckerVerdict.FLAG, Phase6CheckerVerdict.BLOCK,
    ]


def test_block_requires_strong_contradiction_reason_and_support() -> None:
    with pytest.raises(ValidationError):
        Phase6CheckerDecision(
            claim_id="c1",
            verdict="BLOCK",
            reason_codes=["INSUFFICIENT_SUPPORT"],
            supporting_evidence_refs=[],
        )


@pytest.mark.parametrize("reason", [
    "APPLICABILITY_UNCLEAR",
    "INSUFFICIENT_SUPPORT",
])
def test_uncertainty_and_weak_evidence_target_flag(reason: str) -> None:
    packet = _packet()
    result = Phase6CheckerResult(
        schema_version="phase6_checker.result.v1",
        decisions=[{
            "claim_id": "c1", "verdict": "FLAG", "reason_codes": [reason],
        }],
    )
    validate_phase6_checker_result(result, packet)
    assert result.decisions[0].verdict == Phase6CheckerVerdict.FLAG


@pytest.mark.parametrize("field", ["canonical_url", "document_version", "effective_from"])
def test_missing_evidence_metadata_is_unknown_not_automatic_block(field: str) -> None:
    registry, registered_ref = _registered_registry()
    submission = _submission(claims=[AgentClaim(
        claim_id="c1", claim_type="legal_rule", materiality="decisive",
        text="The legal rule applies.", draft_start=0, draft_end=23,
        evidence_refs=[registered_ref],
    )])
    packet = build_phase6_checker_input(
        request=_request(), submission=submission, registry=registry,
    )
    assert getattr(packet.evidence[0], field) is None
    result = Phase6CheckerResult(
        schema_version="phase6_checker.result.v1",
        decisions=[{
            "claim_id": "c1", "verdict": "KEEP", "reason_codes": ["SUPPORTED"],
            "supporting_evidence_refs": [registered_ref],
        }],
    )
    validate_phase6_checker_result(result, packet)
    assert result.decisions[0].verdict != Phase6CheckerVerdict.BLOCK


def test_unknown_checker_evidence_ref_is_structurally_invalid() -> None:
    registry, _ = _registered_registry()
    submission = _submission()
    with pytest.raises(Phase6CheckerContractError):
        build_phase6_checker_input(request=_request(), submission=submission, registry=registry)


def test_cross_request_evidence_ref_is_structurally_invalid() -> None:
    source_registry, source_ref = _registered_registry()
    target_registry = create_registry("different-request")
    submission = _submission(claims=[AgentClaim(
        claim_id="c1", claim_type="legal_rule", materiality="decisive",
        text="The legal rule applies.", draft_start=0, draft_end=23,
        evidence_refs=[source_ref],
    )])
    assert source_registry.request_id != target_registry.request_id
    with pytest.raises(Phase6CheckerContractError):
        build_phase6_checker_input(request=_request(), submission=submission, registry=target_registry)


def test_graph_navigation_cannot_be_constructed_as_checker_evidence() -> None:
    with pytest.raises(ValidationError):
        Phase6CheckerEvidence(
            evidence_ref="web:graph-node",
            evidence_origin="derived_relationship",
            registry_tool_name="schedule2_navigation",
            registry_tool_call_id="graph-1",
            registered_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
        )


def test_packet_preserves_independent_claims_and_dependency_structure() -> None:
    registry, registered_ref = _registered_registry()
    draft = "Conclusion. Premise. Independent."
    claims = [
        AgentClaim(
            claim_id="conclusion", claim_type="legal_application", materiality="decisive",
            text="Conclusion.", draft_start=0, draft_end=11,
            evidence_refs=[registered_ref], depends_on=["premise"],
        ),
        AgentClaim(
            claim_id="premise", claim_type="legal_rule", materiality="supporting",
            text="Premise.", draft_start=12, draft_end=20,
            evidence_refs=[registered_ref],
        ),
        AgentClaim(
            claim_id="independent", claim_type="legal_rule", materiality="decisive",
            text="Independent.", draft_start=21, draft_end=33,
            evidence_refs=[registered_ref],
        ),
    ]
    packet = build_phase6_checker_input(
        request=_request(),
        submission=_submission(draft=draft, claims=claims),
        registry=registry,
    )
    by_id = {claim.claim_id: claim for claim in packet.material_claims}
    assert set(by_id) == {"conclusion", "premise", "independent"}
    assert by_id["conclusion"].depends_on == ["premise"]
    assert by_id["independent"].depends_on == []


def test_packet_rejects_cyclic_material_claim_dependencies() -> None:
    registry, registered_ref = _registered_registry()
    draft = "First. Second."
    claims = [
        AgentClaim(
            claim_id="first", claim_type="legal_rule", materiality="decisive",
            text="First.", draft_start=0, draft_end=6,
            evidence_refs=[registered_ref], depends_on=["second"],
        ),
        AgentClaim(
            claim_id="second", claim_type="legal_rule", materiality="decisive",
            text="Second.", draft_start=7, draft_end=14,
            evidence_refs=[registered_ref], depends_on=["first"],
        ),
    ]
    with pytest.raises(ValueError, match="acyclic"):
        build_phase6_checker_input(
            request=_request(),
            submission=_submission(draft=draft, claims=claims),
            registry=registry,
        )


@pytest.mark.parametrize("answer_class, claim_type", [
    ("general", "general"),
    ("procedural", "procedure"),
    ("general", "calculation"),
])
def test_stable_general_or_non_substantive_turn_skips_checker(answer_class: str, claim_type: str) -> None:
    draft = "A simple answer."
    claim = AgentClaim(
        claim_id="c1", claim_type=claim_type, materiality="supporting",
        text=draft, draft_start=0, draft_end=len(draft),
    )
    decision = evaluate_phase6_checker_gate(_submission(
        draft=draft, claims=[claim], answer_class=answer_class,
    ))
    assert decision.checker_required is False
    assert should_run_phase6_checker(_submission(
        draft=draft, claims=[claim], answer_class=answer_class,
    )) is False


def test_substantive_legal_answer_requires_checker() -> None:
    registry, registered_ref = _registered_registry()
    claim = AgentClaim(
        claim_id="c1", claim_type="legal_rule", materiality="decisive",
        text="The legal rule applies.", draft_start=0, draft_end=23,
        evidence_refs=[registered_ref],
    )
    decision = evaluate_phase6_checker_gate(_submission(claims=[claim]))
    assert decision.checker_required is True
    assert decision.material_claim_ids == ("c1",)


def test_decisive_current_fact_affecting_legal_conclusion_requires_checker() -> None:
    registry, registered_ref = _registered_registry()
    draft = "The fact is current. The legal rule applies."
    current_fact = AgentClaim(
        claim_id="fact", claim_type="current_fact", materiality="decisive",
        text="The fact is current.", draft_start=0, draft_end=20,
        evidence_refs=[registered_ref],
    )
    conclusion = AgentClaim(
        claim_id="rule", claim_type="legal_application", materiality="decisive",
        text="The legal rule applies.", draft_start=21, draft_end=44,
        evidence_refs=[registered_ref], depends_on=["fact"],
    )
    decision = evaluate_phase6_checker_gate(_submission(draft=draft, claims=[current_fact, conclusion]))
    assert decision.checker_required is True
    assert decision.reason == "decisive_current_fact_affects_legal_conclusion"


def test_material_omission_signal_is_representable_without_rewrite_or_research() -> None:
    packet = _packet()
    result = Phase6CheckerResult(
        schema_version="phase6_checker.result.v1",
        decisions=[{
            "claim_id": "c1", "verdict": "FLAG", "reason_codes": ["OVERSTATED"],
        }],
        material_omission_suspected=True,
        escalate=True,
    )
    validate_phase6_checker_result(result, packet)
    assert result.material_omission_suspected is True
    assert not hasattr(result.decisions[0], "replacement_text")


def test_phase6_default_absolute_deadline_is_60000_and_checker_remains_off() -> None:
    settings = Settings(
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
    )
    assert settings.default_turn_deadline_ms == 60000
    assert settings.compact_checker_enabled is False
