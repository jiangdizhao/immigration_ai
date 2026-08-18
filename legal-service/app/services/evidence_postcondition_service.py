"""Phase 4B — Evidence postcondition service.

Deterministic evidence/applicability postcondition for agent submissions.

For substantive legal submissions:
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
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

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


@dataclass(slots=True)
class ClaimEvaluation:
    """Evaluation of a single claim's evidence support."""

    claim_id: str
    claim_type: str
    materiality: str
    status: Literal["supported", "insufficient", "not_required", "invalid_ref"]
    reasons: list[str] = field(default_factory=list)
    evidence_refs: list[str] = field(default_factory=list)


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
            )

            if suitability["suitable"]:
                valid_evidence_count += 1
            # Limitations are part of the deterministic review trace even
            # when the exact span is sufficient for this bounded claim.
            reasons.extend(suitability["reasons"])

        if valid_evidence_count > 0:
            return ClaimEvaluation(
                claim_id=claim.claim_id,
                claim_type=claim.claim_type,
                materiality=claim.materiality,
                status="supported",
                reasons=reasons,
                evidence_refs=claim.evidence_refs,
            )
        else:
            return ClaimEvaluation(
                claim_id=claim.claim_id,
                claim_type=claim.claim_type,
                materiality=claim.materiality,
                status="insufficient",
                reasons=reasons or ["No suitable evidence found"],
                evidence_refs=claim.evidence_refs,
            )

    def _evaluate_evidence_suitability(
        self,
        evidence: EvidenceRef,
        *,
        claim_type: str,
        as_of_date: date | None,
    ) -> dict:
        """Evaluate whether evidence is suitable for a claim type."""
        reasons: list[str] = []

        # LightRAG derived relationships are never sufficient
        if evidence.authority_kind == "derived_relationship":
            return {
                "suitable": False,
                "reasons": ["LightRAG relationship alone cannot support legal claims"],
            }

        # Check binding status for legal claims
        if claim_type in ("legal_rule", "legal_application"):
            if evidence.binding_status == "non_binding":
                # Non-binding evidence may still be suitable for some claims
                # (e.g., guidance claims), but flag it
                reasons.append("Evidence is non-binding")

        effective_interval_invalid = False
        # Check effective dates for current_fact claims
        if claim_type == "current_fact" and as_of_date:
            if evidence.effective_from and evidence.effective_from > as_of_date:
                reasons.append("Evidence not yet effective as of claim date")
                effective_interval_invalid = True
            if evidence.effective_to and evidence.effective_to < as_of_date:
                reasons.append("Evidence no longer effective as of claim date")
                effective_interval_invalid = True

        # Native web evidence limitations
        if isinstance(evidence, NativeWebEvidenceRef):
            # Native web evidence cannot support exact-wording claims
            # This is a limitation, not automatic disqualification
            reasons.append("Native web evidence lacks exact text/hash")

        # Canonical local evidence is generally suitable
        if isinstance(evidence, CanonicalLocalEvidenceRef):
            # Check provenance completeness
            if not evidence.provenance_complete:
                reasons.append("Evidence provenance incomplete")

            # A local partial-family span may still prove its own wording, but
            # it cannot establish a change-sensitive current fact when its
            # own version/effective applicability is unknown.
            if claim_type == "current_fact":
                if evidence.document_version == "unknown":
                    reasons.append("Canonical evidence has no document version")
                    effective_interval_invalid = True
                if evidence.effective_from is None and evidence.effective_to is None:
                    reasons.append("Canonical evidence has no effective interval")
                    effective_interval_invalid = True

        suitable = True

        if effective_interval_invalid:
            suitable = False

        # Disqualify if only non-binding evidence for legal_rule
        if claim_type == "legal_rule" and evidence.binding_status == "non_binding":
            # Non-binding alone is insufficient for legal rules
            suitable = False
            reasons.append("Legal rule claims require binding authority")

        return {"suitable": suitable, "reasons": reasons}


def evaluate_postcondition(
    submission: AgentSubmissionV2,
    registry: RequestEvidenceRegistry,
    *,
    as_of_date: date | None = None,
) -> PostconditionResult:
    """Convenience function to evaluate evidence postcondition."""
    service = EvidencePostconditionService(registry)
    return service.evaluate(submission, as_of_date=as_of_date)
