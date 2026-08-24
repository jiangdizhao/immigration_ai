"""Provider-free Phase 6 checker contracts, packet construction, and gating.

This module deliberately has no provider or retrieval dependency.  It defines
the deterministic boundary that a later evidence-only checker call may consume;
it does not activate that call or alter customer answers.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from app.schemas.agent import AgentClaim, AgentRuntimeRequest, AgentSubmissionV2
from app.schemas.checker import (
    PHASE6_CHECKER_INPUT_SCHEMA_VERSION,
    Phase6AcceptedDraft,
    Phase6CheckerClaimType,
    Phase6CheckerDecision,
    Phase6CheckerEvidence,
    Phase6CheckerInput,
    Phase6CheckerMateriality,
    Phase6CheckerReasonCode,
    Phase6CheckerResult,
    Phase6CheckerVerdict,
    Phase6MaterialClaim,
)
from app.schemas.evidence import (
    CanonicalLocalEvidenceRef,
    FetchedWebEvidenceRef,
    NativeWebEvidenceRef,
    EvidenceRef,
)
from app.services.request_evidence_registry import RequestEvidenceRegistry


MATERIAL_LEGAL_CLAIM_TYPES = frozenset({
    "legal_rule",
    "legal_application",
    "procedure",
    "current_fact",
})
LEGAL_CONCLUSION_TYPES = frozenset({
    "legal_rule",
    "legal_application",
    "procedure",
})


class Phase6CheckerContractError(ValueError):
    """A deterministic Phase 6 input/output contract violation."""


@dataclass(frozen=True, slots=True)
class Phase6CheckerGateDecision:
    checker_required: bool
    reason: str
    material_claim_ids: tuple[str, ...] = ()


def _checker_root_claims(submission: AgentSubmissionV2) -> list[AgentClaim]:
    if submission.answer_class != "substantive_legal":
        return []
    return [
        claim
        for claim in submission.claims
        if claim.materiality == "decisive" and claim.claim_type in MATERIAL_LEGAL_CLAIM_TYPES
    ]


def evaluate_phase6_checker_gate(submission: AgentSubmissionV2) -> Phase6CheckerGateDecision:
    """Return the deterministic, metadata-only checker requirement decision."""

    roots = _checker_root_claims(submission)
    if not roots:
        return Phase6CheckerGateDecision(
            checker_required=False,
            reason="no_material_substantive_legal_claim",
        )

    current_fact_ids = {claim.claim_id for claim in roots if claim.claim_type == "current_fact"}
    legal_claims = [claim for claim in roots if claim.claim_type in LEGAL_CONCLUSION_TYPES]
    if current_fact_ids and legal_claims:
        affects_conclusion = any(
            current_fact_id in claim.depends_on
            for claim in legal_claims
            for current_fact_id in current_fact_ids
        )
        if affects_conclusion:
            reason = "decisive_current_fact_affects_legal_conclusion"
        else:
            reason = "material_substantive_legal_claim"
    else:
        reason = "material_substantive_legal_claim"
    return Phase6CheckerGateDecision(
        checker_required=True,
        reason=reason,
        material_claim_ids=tuple(claim.claim_id for claim in roots),
    )


def should_run_phase6_checker(submission: AgentSubmissionV2) -> bool:
    """Boolean convenience wrapper for callers and offline fixtures."""

    return evaluate_phase6_checker_gate(submission).checker_required


def _claim_dependency_closure(
    submission: AgentSubmissionV2,
    root_ids: set[str],
) -> set[str]:
    claims_by_id = {claim.claim_id: claim for claim in submission.claims}
    selected = set(root_ids)
    pending = list(root_ids)
    while pending:
        claim_id = pending.pop()
        claim = claims_by_id.get(claim_id)
        if claim is None:
            raise Phase6CheckerContractError(f"unknown dependency for claim {claim_id}")
        for dependency in claim.depends_on:
            if dependency not in claims_by_id:
                raise Phase6CheckerContractError(f"unknown dependency for claim {claim_id}")
            if dependency not in selected:
                selected.add(dependency)
                pending.append(dependency)
    return selected


def _compact_claim(claim: AgentClaim) -> Phase6MaterialClaim:
    return Phase6MaterialClaim(
        claim_id=claim.claim_id,
        claim_type=Phase6CheckerClaimType(claim.claim_type),
        materiality=Phase6CheckerMateriality(claim.materiality),
        text=claim.text,
        draft_start=claim.draft_start,
        draft_end=claim.draft_end,
        text_sha256=hashlib.sha256(claim.text.encode("utf-8")).hexdigest(),
        depends_on=list(claim.depends_on),
        evidence_refs=list(claim.evidence_refs),
    )


def _compact_evidence(
    record: EvidenceRef,
    *,
    registry_tool_name: str,
    registry_tool_call_id: str,
    registered_at,
) -> Phase6CheckerEvidence:
    common = {
        "evidence_ref": record.evidence_ref,
        "evidence_origin": record.evidence_origin,
        "source_type": record.source_type,
        "source_authenticity": record.source_authenticity,
        "authority_kind": record.authority_kind,
        "jurisdiction": record.jurisdiction,
        "binding_status": record.binding_status,
        "court_or_tribunal_level": record.court_or_tribunal_level,
        "retrieved_at": record.retrieved_at,
        "provenance_complete": record.provenance_complete,
        "registry_tool_name": registry_tool_name,
        "registry_tool_call_id": registry_tool_call_id,
        "registered_at": registered_at,
        "canonical_source_id": getattr(record, "canonical_source_id", None),
        "document_version": getattr(record, "document_version", None),
        "effective_from": getattr(record, "effective_from", None),
        "effective_to": getattr(record, "effective_to", None),
    }
    if isinstance(record, CanonicalLocalEvidenceRef):
        common.update({
            "canonical_chunk_id": record.canonical_chunk_id,
            "document_id": record.document_id,
            "provision_or_span": record.provision_or_span,
            "canonical_url": record.canonical_url,
            "content_hash": record.content_hash,
            "text": record.text,
        })
    elif isinstance(record, NativeWebEvidenceRef):
        common.update({
            "url": record.url,
            "title": record.title,
            "search_call_id": record.search_call_id,
            "native_web_citation": record.native_web_citation,
        })
    elif isinstance(record, FetchedWebEvidenceRef):
        common.update({
            "url": record.url,
            "title": record.title,
            "provision_or_span": record.provision_or_span,
            "content_hash": record.content_hash,
            "text": record.text,
        })
    else:  # pragma: no cover - EvidenceRef is a closed discriminated union.
        raise Phase6CheckerContractError("unsupported evidence origin")
    return Phase6CheckerEvidence(**common)


def build_phase6_checker_input(
    *,
    request: AgentRuntimeRequest,
    submission: AgentSubmissionV2,
    registry: RequestEvidenceRegistry,
    compact_matter_facts: dict[str, object] | None = None,
    additional_relevant_evidence_refs: list[str] | None = None,
    max_evidence_items: int = 60,
) -> Phase6CheckerInput:
    """Build a bounded checker packet from actual current-request evidence.

    Unknown/cross-request refs fail closed.  Graph/navigation data has no input
    path here and therefore cannot be promoted into legal evidence.  The
    optional additional refs are deliberately explicit; this M1 builder does
    not infer semantic relevance from raw research traces.
    """

    gate = evaluate_phase6_checker_gate(submission)
    if not gate.checker_required:
        raise Phase6CheckerContractError("checker packet requested for a non-checker turn")

    selected_ids = _claim_dependency_closure(submission, set(gate.material_claim_ids))
    selected_claims = [claim for claim in submission.claims if claim.claim_id in selected_ids]
    compact_claims = [_compact_claim(claim) for claim in selected_claims]

    refs: list[str] = []
    for claim in compact_claims:
        for evidence_ref in claim.evidence_refs:
            if evidence_ref not in refs:
                refs.append(evidence_ref)
    for evidence_ref in additional_relevant_evidence_refs or []:
        if evidence_ref not in refs:
            refs.append(evidence_ref)
    if len(refs) > max_evidence_items:
        raise Phase6CheckerContractError("checker evidence packet exceeds deterministic bound")

    evidence: list[Phase6CheckerEvidence] = []
    for evidence_ref in refs:
        if not registry.is_registered(evidence_ref):
            raise Phase6CheckerContractError(
                f"evidence ref is unknown or belongs to another request: {evidence_ref}"
            )
        try:
            record = registry.resolve_evidence(evidence_ref)
            entry = registry.resolve(evidence_ref)
            evidence.append(_compact_evidence(
                record,
                registry_tool_name=entry.tool_name,
                registry_tool_call_id=entry.tool_call_id,
                registered_at=entry.registered_at,
            ))
        except Exception as exc:
            raise Phase6CheckerContractError(
                f"evidence ref could not be resolved: {evidence_ref}"
            ) from exc

    return Phase6CheckerInput(
        schema_version=PHASE6_CHECKER_INPUT_SCHEMA_VERSION,
        request_id=request.request_id,
        turn_id=request.turn_id,
        question=request.user_text,
        compact_matter_facts=dict(compact_matter_facts or {}),
        as_of_date=request.as_of_date,
        accepted_draft=Phase6AcceptedDraft(
            draft_markdown=submission.draft_markdown,
            answer_class=submission.answer_class,
            research_status=submission.research_status,
        ),
        material_claims=compact_claims,
        evidence=evidence,
    )


def validate_phase6_checker_result(
    result: Phase6CheckerResult,
    checker_input: Phase6CheckerInput,
) -> Phase6CheckerResult:
    """Validate result identity against the exact current checker packet."""

    expected_claim_ids = {claim.claim_id for claim in checker_input.material_claims}
    actual_claim_ids = [decision.claim_id for decision in result.decisions]
    if len(set(actual_claim_ids)) != len(actual_claim_ids):
        raise Phase6CheckerContractError("duplicate checker decision claim ID")
    if set(actual_claim_ids) != expected_claim_ids:
        raise Phase6CheckerContractError("checker must decide every supplied material claim")
    packet_evidence_refs = {item.evidence_ref for item in checker_input.evidence}
    for decision in result.decisions:
        unknown_refs = set(decision.supporting_evidence_refs) - packet_evidence_refs
        if unknown_refs:
            raise Phase6CheckerContractError("checker used evidence outside the packet")
        if decision.verdict == Phase6CheckerVerdict.BLOCK:
            if Phase6CheckerReasonCode.CONTRADICTED_BY_APPLICABLE_EVIDENCE not in decision.reason_codes:
                raise Phase6CheckerContractError("BLOCK lacks contradiction reason")
    return result


# A descriptive alias for callers that prefer the packet terminology.
build_compact_checker_packet = build_phase6_checker_input
