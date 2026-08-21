"""Evidence suitability diagnostics for the v2.1.3 checker.

This service classifies evidence suitability and applicability for checker input
and evaluation diagnostics. It is not a universal terminal admission gate.

For substantive legal submissions, it reports:
- Every decisive legal rule/application claim must have suitable evidence
- Every change-sensitive current factual claim must have suitable current evidence

The following do NOT satisfy the postcondition:
- Model memory
- Unregistered URL
- Guessed evidence ref
- Cross-request evidence
- LightRAG relationship alone (derived_relationship)
- Unresolved cross-reference
- Unverified derived relationship
- Evidence outside applicable time/version without qualification

For general stable conversation:
- postcondition may be not_required

This service does NOT:
- Call an LLM
- Classify raw user text
- Choose visa pathways
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse

from app.schemas.agent import AgentClaim, AgentSubmissionV2
from app.schemas.evidence import (
    CanonicalLocalEvidenceRef,
    EvidenceRef,
    NativeWebEvidenceRef,
)
from app.services.request_evidence_registry import (
    EvidenceNotRegisteredError,
    RegistryDisposedError,
    RequestEvidenceRegistry,
)

logger = logging.getLogger(__name__)

PostconditionStatus = Literal["passed", "failed", "not_required"]


def _increment_count(counter: dict[str, Any], key: Any) -> None:
    """Increment a content-free category counter (diagnostics only)."""
    label = str(key)
    counter[label] = counter.get(label, 0) + 1


# Claim types that require evidence for decisive materiality
EVIDENCE_REQUIRED_CLAIM_TYPES = {
    "legal_rule",
    "legal_application",
    "current_fact",  # Change-sensitive
}

# Claim types that don't require evidence
EVIDENCE_NOT_REQUIRED_CLAIM_TYPES = {
    "general",
    "procedure",
    "calculation",  # Calculations use utility, not evidence
}

_FEDERAL_REGISTER_CURRENT_ENDPOINT_RE = re.compile(
    r"^/(?:C\d{4}[AC]\d+|F\d{4}[A-Z]\d+)/latest(?:/text)?/?$",
    re.IGNORECASE,
)
_HOME_AFFAIRS_DOMAINS = {
    "homeaffairs.gov.au",
    "immi.homeaffairs.gov.au",
    "www.homeaffairs.gov.au",
}


@dataclass(frozen=True, slots=True)
class NativeWebApplicability:
    """Deterministic applicability basis for native, non-exact web evidence."""

    applicable: bool
    basis: Literal[
        "explicit_metadata",
        "official_current_latest",
        "official_current_retrieved",
        "unknown",
    ]
    limitations: tuple[str, ...] = ()


def evaluate_native_web_applicability(
    evidence: NativeWebEvidenceRef,
    as_of_date: date | None,
) -> NativeWebApplicability:
    """Evaluate native web applicability without inventing version/date data.

    Explicit provider metadata is handled by the ordinary version/effective
    interval checks.  Without that metadata, a Federal Register ``/latest``
    URL is still only an observed locator: URL shape alone does not prove the
    legal version/effective interval applicable to the claim.  Current Home
    Affairs operational guidance retrieved on the claim date may receive the
    narrower ``official_current_retrieved`` basis.
    """
    if not isinstance(evidence, NativeWebEvidenceRef):
        raise TypeError("native web applicability requires NativeWebEvidenceRef")

    has_explicit_metadata = any(
        value is not None
        for value in (
            evidence.document_version,
            evidence.effective_from,
            evidence.effective_to,
        )
    )
    if has_explicit_metadata:
        return NativeWebApplicability(
            applicable=False,
            basis="explicit_metadata",
        )

    if not evidence.provenance_complete:
        return NativeWebApplicability(applicable=False, basis="unknown")
    if as_of_date is None:
        return NativeWebApplicability(applicable=False, basis="unknown")

    retrieved_at = evidence.retrieved_at
    retrieved_date = (
        retrieved_at.astimezone(timezone.utc).date()
        if retrieved_at.tzinfo is not None
        else retrieved_at.date()
    )
    if as_of_date != retrieved_date:
        return NativeWebApplicability(applicable=False, basis="unknown")

    parsed = urlparse(evidence.url)
    if (
        parsed.netloc.lower() in {"legislation.gov.au", "www.legislation.gov.au"}
        and not parsed.query
        and not parsed.fragment
        and _FEDERAL_REGISTER_CURRENT_ENDPOINT_RE.fullmatch(parsed.path)
        and evidence.source_authenticity == "canonical_official"
        and evidence.authority_kind in {"statute", "delegated_legislation"}
        and evidence.binding_status == "binding"
    ):
        # A current-looking endpoint is not a substitute for actual version or
        # effective-interval metadata.  Preserve the uncertainty so the later
        # semantic checker, rather than the mechanical layer, can judge it.
        return NativeWebApplicability(applicable=False, basis="unknown")

    if (
        parsed.netloc.lower() in _HOME_AFFAIRS_DOMAINS
        and evidence.source_authenticity == "canonical_official"
        and evidence.authority_kind == "operational_guidance"
        and evidence.binding_status == "non_binding"
    ):
        return NativeWebApplicability(
            applicable=True,
            basis="official_current_retrieved",
            limitations=("Official guidance is non-binding",),
        )

    return NativeWebApplicability(applicable=False, basis="unknown")


@dataclass(slots=True)
class ClaimEvaluation:
    """Evaluation of a single claim's evidence support."""

    claim_id: str
    claim_type: str
    materiality: str
    status: Literal["supported", "insufficient", "not_required", "invalid_ref"]
    reasons: list[str] = field(default_factory=list)
    evidence_refs: list[str] = field(default_factory=list)
    # Phase-5 content-safe classification of evidence attached to this claim.
    # Counts ONLY (authenticity/authority-kind/binding-status/type/native
    # applicability basis); never refs, URLs, titles, or text.  This is
    # diagnostic observability only and does not affect acceptance.
    evidence_classification: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class PostconditionResult:
    """Result of evidence postcondition evaluation."""

    status: PostconditionStatus
    claim_evaluations: list[ClaimEvaluation] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return self.status == "passed"

    @property
    def not_required(self) -> bool:
        return self.status == "not_required"


class EvidencePostconditionService:
    """Deterministic evidence postcondition evaluator.

    Operates only on:
    - AgentSubmissionV2
    - RequestEvidenceRegistry
    - Typed EvidenceRef
    - as_of_date
    - Coverage/applicability metadata

    Does NOT call an LLM.
    """

    def __init__(self, registry: RequestEvidenceRegistry) -> None:
        self._registry = registry

    def evaluate(
        self,
        submission: AgentSubmissionV2,
        *,
        as_of_date: date | None = None,
    ) -> PostconditionResult:
        """Evaluate evidence postcondition for a submission.

        Returns PostconditionResult with status and claim evaluations.
        """
        answer_class = submission.answer_class

        # General/procedural submissions may not require evidence
        if answer_class == "general":
            # Check if there are any substantive claims
            has_substantive_claims = any(
                claim.claim_type in EVIDENCE_REQUIRED_CLAIM_TYPES
                and claim.materiality == "decisive"
                for claim in submission.claims
            )
            if not has_substantive_claims:
                return PostconditionResult(
                    status="not_required",
                    claim_evaluations=[
                        ClaimEvaluation(
                            claim_id=c.claim_id,
                            claim_type=c.claim_type,
                            materiality=c.materiality,
                            status="not_required",
                        )
                        for c in submission.claims
                    ],
                )

        if answer_class == "safety_blocked":
            return PostconditionResult(status="not_required")

        # Evaluate each claim
        evaluations: list[ClaimEvaluation] = []
        all_passed = True

        for claim in submission.claims:
            evaluation = self._evaluate_claim(
                claim=claim,
                as_of_date=as_of_date or submission.as_of_date,
                research_status=submission.research_status,
            )
            evaluations.append(evaluation)

            if evaluation.status == "insufficient" and claim.materiality == "decisive":
                all_passed = False
            elif evaluation.status == "invalid_ref":
                all_passed = False

        status: PostconditionStatus = "passed" if all_passed else "failed"

        return PostconditionResult(
            status=status,
            claim_evaluations=evaluations,
        )

    def _evaluate_claim(
        self,
        claim: AgentClaim,
        *,
        as_of_date: date | None,
        research_status: str,
    ) -> ClaimEvaluation:
        """Evaluate evidence support for a single claim."""
        # Determine if evidence is required
        if claim.claim_type not in EVIDENCE_REQUIRED_CLAIM_TYPES:
            return ClaimEvaluation(
                claim_id=claim.claim_id,
                claim_type=claim.claim_type,
                materiality=claim.materiality,
                status="not_required",
                evidence_refs=claim.evidence_refs,
            )

        # Supporting claims have lower bar
        if claim.materiality == "supporting":
            return ClaimEvaluation(
                claim_id=claim.claim_id,
                claim_type=claim.claim_type,
                materiality=claim.materiality,
                status="supported",
                reasons=["Supporting claim; evidence optional"],
                evidence_refs=claim.evidence_refs,
            )

        # Decisive claims require evidence
        if not claim.evidence_refs:
            return ClaimEvaluation(
                claim_id=claim.claim_id,
                claim_type=claim.claim_type,
                materiality=claim.materiality,
                status="insufficient",
                reasons=["No evidence refs for decisive claim"],
            )

        # Resolve and evaluate evidence
        reasons: list[str] = []
        valid_evidence_count = 0
        controlling_evidence_count = 0
        # Phase-5 content-safe aggregate classification of attached evidence.
        evidence_classification: dict[str, Any] = {
            "evidence_count": len(claim.evidence_refs),
            "source_authenticity_counts": {},
            "authority_kind_counts": {},
            "binding_status_counts": {},
            "evidence_type_counts": {},
            "native_applicability_basis_counts": {},
            "controlling_candidate_count": 0,
            "suitable_evidence_count": 0,
        }

        for ref in claim.evidence_refs:
            try:
                evidence = self._registry.resolve_evidence(ref)
            except (EvidenceNotRegisteredError, RegistryDisposedError):
                reasons.append(f"Evidence ref not registered: {ref[:20]}...")
                continue

            # A genuine local span remains evidence for the bounded wording it
            # contains, but a claim cannot represent research as complete if
            # that lookup disclosed unresolved decisive dependencies.
            unresolved = self._registry.unresolved_cross_references_for(ref)
            if research_status == "complete" and unresolved:
                reasons.append(
                    "Research marked complete despite unresolved cross-references"
                )
                continue

            # Evaluate evidence suitability
            suitability = self._evaluate_evidence_suitability(
                evidence=evidence,
                claim_type=claim.claim_type,
                as_of_date=as_of_date,
                research_status=research_status,
            )

            if suitability["suitable"]:
                valid_evidence_count += 1
            if suitability.get("controlling"):
                controlling_evidence_count += 1
            # Limitations are part of the deterministic review trace even
            # when the exact span is sufficient for this bounded claim.
            reasons.extend(suitability["reasons"])

            # Content-safe evidence classification (counts only; no
            # refs/URLs/titles/text).  Distinguishes source-selection from
            # normalization/attachment defects without changing acceptance.
            _increment_count(evidence_classification["source_authenticity_counts"], evidence.source_authenticity)
            _increment_count(evidence_classification["authority_kind_counts"], evidence.authority_kind)
            _increment_count(evidence_classification["binding_status_counts"], evidence.binding_status)
            _increment_count(evidence_classification["evidence_type_counts"], evidence.evidence_origin)
            if isinstance(evidence, NativeWebEvidenceRef):
                _increment_count(
                    evidence_classification["native_applicability_basis_counts"],
                    evaluate_native_web_applicability(evidence, as_of_date).basis,
                )
            if (
                evidence.source_authenticity in {"canonical_official", "official_copy"}
                and evidence.authority_kind in {"statute", "delegated_legislation", "binding_precedent"}
                and evidence.binding_status == "binding"
            ):
                evidence_classification["controlling_candidate_count"] += 1
            if suitability.get("suitable"):
                evidence_classification["suitable_evidence_count"] += 1

        if claim.claim_type in ("legal_rule", "legal_application") and controlling_evidence_count == 0:
            reasons.append(
                "Decisive legal claims require controlling binding legal authority"
            )
            return ClaimEvaluation(
                claim_id=claim.claim_id,
                claim_type=claim.claim_type,
                materiality=claim.materiality,
                status="insufficient",
                reasons=reasons,
                evidence_refs=claim.evidence_refs,
                evidence_classification=evidence_classification,
            )

        if valid_evidence_count > 0:
            return ClaimEvaluation(
                claim_id=claim.claim_id,
                claim_type=claim.claim_type,
                materiality=claim.materiality,
                status="supported",
                reasons=reasons,
                evidence_refs=claim.evidence_refs,
                evidence_classification=evidence_classification,
            )
        else:
            return ClaimEvaluation(
                claim_id=claim.claim_id,
                claim_type=claim.claim_type,
                materiality=claim.materiality,
                status="insufficient",
                reasons=reasons or ["No suitable evidence found"],
                evidence_refs=claim.evidence_refs,
                evidence_classification=evidence_classification,
            )

    def _evaluate_evidence_suitability(
        self,
        evidence: EvidenceRef,
        *,
        claim_type: str,
        as_of_date: date | None,
        research_status: str,
    ) -> dict:
        """Evaluate whether evidence is suitable for a claim type."""
        reasons: list[str] = []
        controlling = False

        if isinstance(evidence, CanonicalLocalEvidenceRef) and not evidence.provenance_complete:
            reasons.append("Evidence provenance incomplete")

        native_applicability = (
            evaluate_native_web_applicability(evidence, as_of_date)
            if isinstance(evidence, NativeWebEvidenceRef)
            else NativeWebApplicability(applicable=False, basis="unknown")
        )
        native_current = native_applicability.applicable
        if native_current:
            reasons.append(
                f"Native evidence applicability basis: {native_applicability.basis}"
            )
            reasons.extend(native_applicability.limitations)
        if isinstance(evidence, NativeWebEvidenceRef):
            reasons.append("Native web evidence lacks exact text/hash")

        # LightRAG derived relationships are never sufficient
        if evidence.authority_kind == "derived_relationship":
            return {
                "suitable": False,
                "controlling": False,
                "reasons": ["LightRAG relationship alone cannot support legal claims"],
            }

        effective_interval_invalid = False

        # Legal claims need a known authoritative source.  Authenticity and
        # binding status are independent: an unverified URL cannot become a
        # controlling rule merely by carrying a statute label.
        if claim_type in ("legal_rule", "legal_application"):
            authoritative_authenticity = evidence.source_authenticity in {
                "canonical_official",
                "official_copy",
            }
            controlling = (
                authoritative_authenticity
                and evidence.authority_kind
                in {"statute", "delegated_legislation", "binding_precedent"}
                and evidence.binding_status == "binding"
            )
            if not authoritative_authenticity:
                reasons.append("Legal claims require verified official evidence")
            if evidence.binding_status != "binding":
                reasons.append("Evidence is not binding legal authority")
            if evidence.authority_kind not in {
                "statute",
                "delegated_legislation",
                "binding_precedent",
            }:
                reasons.append("Evidence authority kind is not controlling law")

            # Operational guidance may supplement a legal application, but it
            # cannot be its sole controlling basis.
            supplementary_guidance = (
                claim_type == "legal_application"
                and evidence.authority_kind == "operational_guidance"
                and evidence.source_authenticity
                in {"canonical_official", "official_copy"}
                and evidence.binding_status == "non_binding"
                and (
                    not isinstance(evidence, NativeWebEvidenceRef)
                    or native_current
                )
            )
            if supplementary_guidance:
                reasons.append("Official guidance is supplementary, not controlling")

            version_unknown = not evidence.document_version or evidence.document_version == "unknown"
            if version_unknown and not native_current:
                reasons.append("Evidence has no applicable document version")
                effective_interval_invalid = True

            if as_of_date and not native_current:
                if evidence.effective_from is None and evidence.effective_to is None:
                    reasons.append("Evidence has no effective interval for claim date")
                    effective_interval_invalid = True
                if evidence.effective_from and evidence.effective_from > as_of_date:
                    reasons.append("Evidence not yet effective as of claim date")
                    effective_interval_invalid = True
                if evidence.effective_to and evidence.effective_to < as_of_date:
                    reasons.append("Evidence no longer effective as of claim date")
                    effective_interval_invalid = True
            elif (
                not as_of_date
                and research_status == "complete"
                and evidence.effective_from is None
                and evidence.effective_to is None
            ):
                reasons.append("Complete legal claims require an applicable effective interval")
                effective_interval_invalid = True

            suitable = (controlling or supplementary_guidance) and not effective_interval_invalid
            return {
                "suitable": suitable,
                "controlling": controlling and not effective_interval_invalid,
                "reasons": reasons,
            }

        # Change-sensitive current facts retain a strict applicability gate,
        # while official operational guidance may remain non-binding evidence.
        if claim_type == "current_fact":
            if evidence.source_authenticity == "unverified":
                reasons.append("Current facts require verified evidence")
                effective_interval_invalid = True
            if (
                not native_current
                and (not evidence.document_version or evidence.document_version == "unknown")
            ):
                reasons.append(
                    "Canonical evidence has no document version"
                    if isinstance(evidence, CanonicalLocalEvidenceRef)
                    else "Current evidence has no document version"
                )
                effective_interval_invalid = True
            if as_of_date and not native_current:
                if evidence.effective_from is None and evidence.effective_to is None:
                    reasons.append(
                        "Canonical evidence has no effective interval"
                        if isinstance(evidence, CanonicalLocalEvidenceRef)
                        else "Current evidence has no effective interval"
                    )
                    effective_interval_invalid = True
                if evidence.effective_from and evidence.effective_from > as_of_date:
                    reasons.append("Evidence not yet effective as of claim date")
                    effective_interval_invalid = True
                if evidence.effective_to and evidence.effective_to < as_of_date:
                    reasons.append("Evidence no longer effective as of claim date")
                    effective_interval_invalid = True

        suitable = True

        if effective_interval_invalid:
            suitable = False

        return {"suitable": suitable, "controlling": controlling, "reasons": reasons}


def evaluate_postcondition(
    submission: AgentSubmissionV2,
    registry: RequestEvidenceRegistry,
    *,
    as_of_date: date | None = None,
) -> PostconditionResult:
    """Convenience function to evaluate evidence postcondition."""
    service = EvidencePostconditionService(registry)
    return service.evaluate(submission, as_of_date=as_of_date)
