from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone

import pytest

from app.schemas.agent import AgentCitation
from app.schemas.checker import (
    Phase6AcceptedDraft,
    Phase6CheckerEvidence,
    Phase6CheckerInput,
    Phase6CheckerResult,
    Phase6MaterialClaim,
)
from app.services.compact_checker_contract_service import Phase6CheckerContractError
from app.services.phase6_compact_checker_service import (
    apply_phase6_filter_preview,
    build_phase6_checker_filter_plan,
)


def _evidence(ref: str, *, text: str | None = None) -> Phase6CheckerEvidence:
    return Phase6CheckerEvidence(
        evidence_ref=ref,
        evidence_origin="fetched_web" if text else "openai_web_native",
        source_type="legislation",
        source_authenticity="canonical_official",
        authority_kind="statute",
        jurisdiction="Cth",
        binding_status="binding",
        court_or_tribunal_level=None,
        retrieved_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
        provenance_complete=True,
        registry_tool_name="web_fetch" if text else "web_search",
        registry_tool_call_id="tool-1",
        registered_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
        canonical_source_id="source-1" if text else None,
        canonical_chunk_id=None,
        document_id=None,
        document_version=None,
        provision_or_span="section 1" if text else None,
        canonical_url=None,
        url="https://example.gov.au/source",
        title="Source",
        search_call_id="search-1" if not text else None,
        native_web_citation=None,
        effective_from=None,
        effective_to=None,
        content_hash=hashlib.sha256(text.encode()).hexdigest() if text else None,
        text=text,
    )


def _input(
    draft: str,
    specs: list[tuple[str, str, int, int, list[str], list[str]]],
    evidence: list[Phase6CheckerEvidence] | None = None,
) -> Phase6CheckerInput:
    claims = [Phase6MaterialClaim(
        claim_id=claim_id,
        claim_type="legal_application",
        materiality="decisive",
        text=text,
        draft_start=start,
        draft_end=end,
        text_sha256=hashlib.sha256(text.encode()).hexdigest(),
        depends_on=depends_on,
        evidence_refs=evidence_refs,
    ) for claim_id, text, start, end, depends_on, evidence_refs in specs]
    return Phase6CheckerInput(
        schema_version="phase6_checker.input.v1",
        request_id="request",
        turn_id="turn",
        question="Question",
        compact_matter_facts={},
        as_of_date=date(2026, 8, 24),
        accepted_draft=Phase6AcceptedDraft(
            draft_markdown=draft,
            answer_class="substantive_legal",
            research_status="complete",
        ),
        material_claims=claims,
        evidence=evidence or [_evidence("web:native")],
    )


def _result(decisions: list[dict]) -> Phase6CheckerResult:
    return Phase6CheckerResult(
        schema_version="phase6_checker.result.v1",
        decisions=decisions,
    )


def _decision(claim_id: str, verdict: str, refs: list[str] | None = None) -> dict:
    return {
        "claim_id": claim_id,
        "verdict": verdict,
        "reason_codes": {
            "KEEP": ["SUPPORTED"],
            "FLAG": ["OVERSTATED"],
            "BLOCK": ["CONTRADICTED_BY_APPLICABLE_EVIDENCE"],
        }[verdict],
        "supporting_evidence_refs": refs or (['web:native'] if verdict == "KEEP" else []),
    }


def test_keep_preview_preserves_text_claims_and_citations() -> None:
    packet = _input("The rule applies.", [("c1", "The rule applies.", 0, 17, [], ["web:native"])])
    plan = build_phase6_checker_filter_plan(packet, _result([_decision("c1", "KEEP")]));
    citation = AgentCitation(evidence_ref="web:native", display_label="Source")
    candidate = apply_phase6_filter_preview(packet, plan, citations=[citation])
    assert candidate.draft_markdown == packet.accepted_draft.draft_markdown
    assert candidate.material_claims[0].draft_start == 0
    assert candidate.material_claims[0].draft_end == 17
    assert candidate.citations == [citation]


def test_flag_preview_preserves_text_without_deletion() -> None:
    packet = _input("The rule applies.", [("c1", "The rule applies.", 0, 17, [], ["web:native"])])
    plan = build_phase6_checker_filter_plan(packet, _result([_decision("c1", "FLAG")]));
    candidate = apply_phase6_filter_preview(packet, plan)
    assert candidate.draft_markdown == "The rule applies."
    assert candidate.material_claims[0].text == "The rule applies."
    assert plan.delete_spans == []


def test_direct_block_plan_deletes_exact_validated_span() -> None:
    packet = _input(
        "Blocked. Independent.",
        [
            ("blocked", "Blocked.", 0, 8, [], ["web:source"]),
            ("independent", "Independent.", 9, 21, [], ["web:native"]),
        ],
        evidence=[_evidence("web:source", text="Contradiction."), _evidence("web:native")],
    )
    result = _result([
        _decision("blocked", "BLOCK", ["web:source"]),
        _decision("independent", "KEEP"),
    ])
    plan = build_phase6_checker_filter_plan(packet, result)
    candidate = apply_phase6_filter_preview(packet, plan)
    assert plan.delete_spans == [(0, 8)]
    assert candidate.draft_markdown == " Independent."
    assert [claim.claim_id for claim in candidate.material_claims] == ["independent"]
    assert candidate.material_claims[0].draft_start == 1


def test_blocked_prerequisite_propagates_transitively_and_independent_survives() -> None:
    draft = "A. B. C. I."
    packet = _input(
        draft,
        [
            ("a", "A.", 0, 2, [], ["web:source"]),
            ("b", "B.", 3, 5, ["a"], ["web:native"]),
            ("c", "C.", 6, 8, ["b"], ["web:native"]),
            ("i", "I.", 9, 11, [], ["web:native"]),
        ],
        evidence=[_evidence("web:source", text="Contradiction."), _evidence("web:native")],
    )
    result = _result([
        _decision("a", "BLOCK", ["web:source"]),
        _decision("b", "KEEP"),
        _decision("c", "KEEP"),
        _decision("i", "KEEP"),
    ])
    plan = build_phase6_checker_filter_plan(packet, result)
    assert plan.directly_blocked_claim_ids == ["a"]
    assert plan.dependency_blocked_claim_ids == ["b", "c"]
    candidate = apply_phase6_filter_preview(packet, plan)
    assert [claim.claim_id for claim in candidate.material_claims] == ["i"]
    assert candidate.draft_markdown == "   I."


def test_overlapping_blocked_spans_are_merged() -> None:
    # Use a valid overlapping pair with nested claim spans over the same text.
    draft = "Contradiction."
    packet = _input(
        draft,
        [
            ("a", "Contradiction.", 0, 14, [], ["web:source"]),
            ("b", "Contradict", 0, 10, [], ["web:source"]),
        ],
        evidence=[_evidence("web:source", text="Contradiction.")],
    )
    plan = build_phase6_checker_filter_plan(packet, _result([
        _decision("a", "BLOCK", ["web:source"]),
        _decision("b", "BLOCK", ["web:source"]),
    ]))
    assert plan.safe_to_apply is True
    assert plan.delete_spans == [(0, 14)]


def test_blocked_span_overlapping_surviving_claim_is_unsafe() -> None:
    draft = "Contradiction."
    packet = _input(
        draft,
        [
            ("blocked", "Contradiction.", 0, 14, [], ["web:source"]),
            ("survivor", "Contradict", 0, 10, [], ["web:native"]),
        ],
        evidence=[_evidence("web:source", text="Contradiction."), _evidence("web:native")],
    )
    plan = build_phase6_checker_filter_plan(packet, _result([
        _decision("blocked", "BLOCK", ["web:source"]),
        _decision("survivor", "KEEP"),
    ]))
    assert plan.safe_to_apply is False
    with pytest.raises(Phase6CheckerContractError, match="overlaps"):
        apply_phase6_filter_preview(packet, plan)


def test_repeated_identical_claim_wording_uses_original_spans_not_find() -> None:
    draft = "Same. Same."
    packet = _input(
        draft,
        [
            ("first", "Same.", 0, 5, [], ["web:native"]),
            ("second", "Same.", 6, 11, [], ["web:source"]),
        ],
        evidence=[_evidence("web:native"), _evidence("web:source", text="Contradiction.")],
    )
    plan = build_phase6_checker_filter_plan(packet, _result([
        _decision("first", "KEEP"),
        _decision("second", "BLOCK", ["web:source"]),
    ]))
    candidate = apply_phase6_filter_preview(packet, plan)
    assert candidate.draft_markdown == "Same. "
    assert candidate.material_claims[0].draft_start == 0
    assert candidate.material_claims[0].draft_end == 5


def test_citations_for_blocked_only_claims_are_removed_and_survivors_remain() -> None:
    packet = _input(
        "Blocked. Kept.",
        [
            ("blocked", "Blocked.", 0, 8, [], ["web:blocked"]),
            ("kept", "Kept.", 9, 14, [], ["web:kept"]),
        ],
        evidence=[
            _evidence("web:blocked", text="Contradiction."),
            _evidence("web:kept"),
        ],
    )
    citations = [
        AgentCitation(evidence_ref="web:blocked", display_label="Blocked source"),
        AgentCitation(evidence_ref="web:kept", display_label="Kept source"),
    ]
    plan = build_phase6_checker_filter_plan(packet, _result([
        _decision("blocked", "BLOCK", ["web:blocked"]),
        _decision("kept", "KEEP", ["web:kept"]),
    ]))
    candidate = apply_phase6_filter_preview(packet, plan, citations=citations)
    assert [citation.evidence_ref for citation in candidate.citations] == ["web:kept"]


def test_preview_does_not_mutate_input_packet_or_add_claims_or_wording() -> None:
    packet = _input("Blocked. Kept.", [
        ("blocked", "Blocked.", 0, 8, [], ["web:blocked"]),
        ("kept", "Kept.", 9, 14, [], ["web:kept"]),
    ], evidence=[_evidence("web:blocked", text="Contradiction."), _evidence("web:kept")])
    before = packet.model_dump(mode="json")
    plan = build_phase6_checker_filter_plan(packet, _result([
        _decision("blocked", "BLOCK", ["web:blocked"]),
        _decision("kept", "KEEP", ["web:kept"]),
    ]))
    apply_phase6_filter_preview(packet, plan)
    assert packet.model_dump(mode="json") == before
