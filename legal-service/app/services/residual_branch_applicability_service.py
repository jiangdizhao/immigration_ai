"""Deterministic guard for decisive legal branch applicability.

This module checks only evidence identity, evidence shape, and the presence of
structured applicability bookkeeping.  It does not determine which legal
branch applies or whether the submitted conclusion is substantively correct.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.schemas.agent import AgentSubmissionV2, ApplicabilityResolution
from app.schemas.evidence import CanonicalLocalEvidenceRef, FetchedWebEvidenceRef
from app.schemas.tools import SubmissionError
from app.services.request_evidence_registry import RequestEvidenceRegistry


STRONG_RESIDUAL_MARKER_PATTERN = re.compile(
    r"\bin\s+any\s+other\s+case\b|"
    r"\bin\s+all\s+other\s+cases\b|"
    r"\botherwise\b",
    re.IGNORECASE,
)

DECISIVE_LEGAL_CLAIM_TYPES = frozenset({
    "legal_rule",
    "legal_application",
    "procedure",
})


@dataclass(slots=True)
class ApplicabilityGuardResult:
    errors: list[SubmissionError] = field(default_factory=list)
    trigger_count: int = 0
    applicability_resolution_count: int = 0
    unresolved_count: int = 0

    @property
    def valid(self) -> bool:
        return not self.errors


def evidence_contains_strong_residual_marker(text: object) -> bool:
    """Return whether backend-held evidence text has a conservative marker."""

    return isinstance(text, str) and STRONG_RESIDUAL_MARKER_PATTERN.search(text) is not None


def _is_authoritative_branch_evidence(record: object) -> bool:
    """Match canonical legal evidence types permitted by current postconditions.

    Source-authenticity and effective-date suitability remain checker concerns.
    In particular, the local canonical corpus may carry ``unverified`` source
    metadata while still providing genuine request-scoped exact evidence.
    """

    if not isinstance(record, (CanonicalLocalEvidenceRef, FetchedWebEvidenceRef)):
        return False
    return (
        record.provenance_complete
        and record.source_type in {
            "legislation",
            "legislative_instrument",
            "court_decision",
        }
        and record.authority_kind in {"statute", "delegated_legislation", "binding_precedent"}
        and record.binding_status == "binding"
    )


def _resolution_error(claim_id: str) -> SubmissionError:
    return SubmissionError(
        code="APPLICABILITY_EVIDENCE_UNRESOLVED",
        field="applicability_resolutions",
        affected_claim_ids=[claim_id],
    )


def _resolve_record(
    registry: RequestEvidenceRegistry,
    evidence_ref: str,
) -> object | None:
    if not isinstance(evidence_ref, str) or not registry.is_registered(evidence_ref):
        return None
    try:
        return registry.resolve_evidence(evidence_ref)
    except Exception:
        return None


def evaluate_applicability_guard(
    submission: AgentSubmissionV2,
    registry: RequestEvidenceRegistry,
) -> ApplicabilityGuardResult:
    """Validate declared applicability records without interpreting the law.

    Residual branches are detected from backend-held evidence text.  Specific
    branches are checked only when the model declares a structured resolution;
    this keeps the backend from attempting semantic conditional-language
    detection or legal classification.
    """

    result = ApplicabilityGuardResult()
    claims_by_id = {claim.claim_id: claim for claim in submission.claims}
    resolutions_by_claim: dict[str, list[ApplicabilityResolution]] = {}
    for resolution in submission.applicability_resolutions:
        resolutions_by_claim.setdefault(resolution.claim_id, []).append(resolution)

    # Every declared resolution must be attached to a decisive legal claim and
    # must be structurally complete, even when no residual marker is present.
    for resolution in submission.applicability_resolutions:
        claim = claims_by_id.get(resolution.claim_id)
        selected_record = _resolve_record(registry, resolution.selected_branch_evidence_ref)
        valid = (
            claim is not None
            and claim.materiality == "decisive"
            and claim.claim_type in DECISIVE_LEGAL_CLAIM_TYPES
            and resolution.status == "resolved"
            and resolution.selected_branch_evidence_ref in claim.evidence_refs
            and _is_authoritative_branch_evidence(selected_record)
            and bool(resolution.applicability_basis_evidence_refs)
            and resolution.selected_branch_evidence_ref
            not in resolution.applicability_basis_evidence_refs
            and resolution.selected_branch_evidence_ref
            not in resolution.competing_branch_evidence_refs
        )
        if not valid:
            result.unresolved_count += 1
            result.errors.append(_resolution_error(resolution.claim_id))
            continue

        basis_records = [
            _resolve_record(registry, ref)
            for ref in resolution.applicability_basis_evidence_refs
        ]
        competing_records = [
            _resolve_record(registry, ref)
            for ref in resolution.competing_branch_evidence_refs
        ]
        if not all(_is_authoritative_branch_evidence(item) for item in basis_records):
            result.unresolved_count += 1
            result.errors.append(_resolution_error(resolution.claim_id))
            continue
        if not all(_is_authoritative_branch_evidence(item) for item in competing_records):
            result.unresolved_count += 1
            result.errors.append(_resolution_error(resolution.claim_id))
            continue

        selected_text = getattr(selected_record, "text", None)
        if resolution.resolution_kind == "residual_branch":
            if not evidence_contains_strong_residual_marker(selected_text):
                result.unresolved_count += 1
                result.errors.append(_resolution_error(resolution.claim_id))
                continue
            if not resolution.competing_branch_evidence_refs:
                result.unresolved_count += 1
                result.errors.append(_resolution_error(resolution.claim_id))
                continue
        elif evidence_contains_strong_residual_marker(selected_text):
            # A residual text marker cannot be relabeled as a specific branch.
            result.unresolved_count += 1
            result.errors.append(_resolution_error(resolution.claim_id))
            continue

        result.applicability_resolution_count += 1

    # Preserve the deterministic residual trigger: every decisive claim whose
    # evidence contains a residual marker must have exactly one valid residual
    # resolution.  The declaration loop above validates its generic fields;
    # this loop adds the residual-specific competing-branch requirement.
    for claim in submission.claims:
        if (
            claim.materiality != "decisive"
            or claim.claim_type not in DECISIVE_LEGAL_CLAIM_TYPES
        ):
            continue

        residual_refs: list[str] = []
        for evidence_ref in claim.evidence_refs:
            record = _resolve_record(registry, evidence_ref)
            if record is not None and evidence_contains_strong_residual_marker(
                getattr(record, "text", None)
            ):
                residual_refs.append(evidence_ref)
        if not residual_refs:
            continue

        result.trigger_count += 1
        claim_resolutions = resolutions_by_claim.get(claim.claim_id, [])
        valid_records = 0
        for residual_ref in residual_refs:
            matching = [
                item
                for item in claim_resolutions
                if item.selected_branch_evidence_ref == residual_ref
            ]
            if len(matching) != 1:
                continue
            resolution = matching[0]
            if resolution.resolution_kind == "residual_branch":
                valid_records += 1

        if valid_records != len(residual_refs):
            if not any(error.affected_claim_ids == [claim.claim_id] for error in result.errors):
                result.unresolved_count += 1
                result.errors.append(_resolution_error(claim.claim_id))

    return result
