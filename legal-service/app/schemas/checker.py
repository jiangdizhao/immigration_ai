from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.evidence import NativeWebCitation


class StrictCheckerContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class CheckerDecision(StrictCheckerContract):
    claim_id: str = Field(min_length=1, max_length=100)
    decision: Literal["keep", "drop"]
    reason_code: str = Field(min_length=1, max_length=100)
    supporting_evidence_refs: list[str] = Field(default_factory=list, max_length=30)
    qualification: str | None = Field(default=None, max_length=8000)
    original_claim_sha256: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def validate_qualification(self):
        if self.qualification is not None and self.decision != "keep":
            raise ValueError("only kept claims may carry a qualification")
        if self.qualification is not None and self.original_claim_sha256 is None:
            raise ValueError("qualification requires original_claim_sha256")
        return self


class CompactCheckerResult(StrictCheckerContract):
    schema_version: Literal["compact_checker.result.v1"]
    decisions: list[CheckerDecision] = Field(min_length=1, max_length=100)
    escalate: bool = False


# ---------------------------------------------------------------------------
# Phase 6 contract
# ---------------------------------------------------------------------------
# The legacy models above remain import-compatible for the dormant Phase 5
# prototype.  Phase 6 uses a separate, versioned contract so the old DROP /
# qualification semantics cannot be activated accidentally by an import.


PHASE6_CHECKER_INPUT_SCHEMA_VERSION = "phase6_checker.input.v1"
PHASE6_CHECKER_RESULT_SCHEMA_VERSION = "phase6_checker.result.v1"


class Phase6CheckerVerdict(str, Enum):
    KEEP = "KEEP"
    FLAG = "FLAG"
    BLOCK = "BLOCK"


class Phase6CheckerReasonCode(str, Enum):
    SUPPORTED = "SUPPORTED"
    INSUFFICIENT_SUPPORT = "INSUFFICIENT_SUPPORT"
    APPLICABILITY_UNCLEAR = "APPLICABILITY_UNCLEAR"
    AUTHORITY_WEAK_OR_MISMATCHED = "AUTHORITY_WEAK_OR_MISMATCHED"
    POSSIBLY_STALE = "POSSIBLY_STALE"
    OVERSTATED = "OVERSTATED"
    CONTRADICTED_BY_APPLICABLE_EVIDENCE = "CONTRADICTED_BY_APPLICABLE_EVIDENCE"


class Phase6CheckerClaimType(str, Enum):
    GENERAL = "general"
    LEGAL_RULE = "legal_rule"
    LEGAL_APPLICATION = "legal_application"
    PROCEDURE = "procedure"
    CURRENT_FACT = "current_fact"
    CALCULATION = "calculation"


class Phase6CheckerMateriality(str, Enum):
    DECISIVE = "decisive"
    SUPPORTING = "supporting"


Phase6CheckerVerdictValue = Literal["KEEP", "FLAG", "BLOCK"]
Phase6CheckerReasonCodeValue = Literal[
    "SUPPORTED",
    "INSUFFICIENT_SUPPORT",
    "APPLICABILITY_UNCLEAR",
    "AUTHORITY_WEAK_OR_MISMATCHED",
    "POSSIBLY_STALE",
    "OVERSTATED",
    "CONTRADICTED_BY_APPLICABLE_EVIDENCE",
]
Phase6CheckerClaimTypeValue = Literal[
    "general", "legal_rule", "legal_application", "procedure", "current_fact", "calculation"
]
Phase6CheckerMaterialityValue = Literal["decisive", "supporting"]


class Phase6CheckerEvidence(StrictCheckerContract):
    """Compact, backend-held evidence metadata supplied to the checker.

    The origin deliberately excludes graph/navigation records.  Optional
    metadata remains optional because absence is an evidence-strength signal,
    not proof that the proposition is false.
    """

    evidence_ref: str = Field(pattern=r"^(exact|web):[A-Za-z0-9._~-]+$", max_length=255)
    evidence_origin: Literal["canonical_local", "openai_web_native", "fetched_web"]
    source_type: str | None = Field(default=None, max_length=100)
    source_authenticity: str | None = Field(default=None, max_length=100)
    authority_kind: str | None = Field(default=None, max_length=100)
    jurisdiction: str | None = Field(default=None, max_length=100)
    binding_status: str | None = Field(default=None, max_length=100)
    court_or_tribunal_level: str | None = Field(default=None, max_length=100)
    retrieved_at: datetime | None = None
    provenance_complete: bool | None = None

    # Registry/tool provenance.
    registry_tool_name: str = Field(min_length=1, max_length=100)
    registry_tool_call_id: str = Field(min_length=1, max_length=255)
    registered_at: datetime

    # Source identity and locator metadata.
    canonical_source_id: str | None = Field(default=None, max_length=255)
    canonical_chunk_id: str | None = Field(default=None, max_length=255)
    document_id: str | None = Field(default=None, max_length=500)
    document_version: str | None = Field(default=None, max_length=255)
    provision_or_span: str | None = Field(default=None, max_length=1000)
    canonical_url: str | None = Field(default=None, pattern=r"^https://", max_length=2000)
    url: str | None = Field(default=None, pattern=r"^https://", max_length=2000)
    title: str | None = Field(default=None, max_length=1000)
    search_call_id: str | None = Field(default=None, max_length=255)
    native_web_citation: NativeWebCitation | None = None
    effective_from: date | None = None
    effective_to: date | None = None

    # Exact text/hash are present only where the backend genuinely holds them.
    content_hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    text: str | None = Field(default=None, max_length=20000)

    @model_validator(mode="after")
    def validate_source_shape(self):
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValueError("effective_to must not precede effective_from")
        if self.evidence_origin == "openai_web_native" and (
            self.text is not None or self.content_hash is not None
        ):
            raise ValueError("native web evidence cannot claim backend-held exact text")
        if self.evidence_origin == "canonical_local" and not self.evidence_ref.startswith("exact:"):
            raise ValueError("canonical local evidence must use an exact ref")
        if self.evidence_origin != "canonical_local" and not self.evidence_ref.startswith("web:"):
            raise ValueError("web evidence must use a web ref")
        return self


class Phase6AcceptedDraft(StrictCheckerContract):
    draft_markdown: str = Field(min_length=1, max_length=50000)
    answer_class: Literal["general", "procedural", "substantive_legal", "safety_blocked"]
    research_status: Literal["not_required", "complete", "incomplete"]


class Phase6MaterialClaim(StrictCheckerContract):
    claim_id: str = Field(min_length=1, max_length=100)
    claim_type: Phase6CheckerClaimTypeValue
    materiality: Phase6CheckerMaterialityValue
    text: str = Field(min_length=1, max_length=8000)
    draft_start: int = Field(ge=0)
    draft_end: int = Field(ge=1)
    text_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    depends_on: list[str] = Field(default_factory=list, max_length=30)
    evidence_refs: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def validate_claim_identity(self):
        import hashlib

        if self.draft_end <= self.draft_start:
            raise ValueError("draft_end must be greater than draft_start")
        if hashlib.sha256(self.text.encode("utf-8")).hexdigest() != self.text_sha256:
            raise ValueError("text_sha256 does not match claim text")
        if len(set(self.depends_on)) != len(self.depends_on):
            raise ValueError("depends_on must not contain duplicates")
        if self.claim_id in self.depends_on:
            raise ValueError("claim must not depend on itself")
        if len(set(self.evidence_refs)) != len(self.evidence_refs):
            raise ValueError("evidence_refs must not contain duplicates")
        if any(not (ref.startswith("exact:") or ref.startswith("web:")) for ref in self.evidence_refs):
            raise ValueError("evidence_refs must be opaque exact or web refs")
        return self


class Phase6CheckerInput(StrictCheckerContract):
    schema_version: Literal["phase6_checker.input.v1"]
    request_id: str = Field(min_length=1, max_length=255)
    turn_id: str = Field(min_length=1, max_length=255)
    question: str = Field(min_length=1, max_length=4000)
    compact_matter_facts: dict[str, Any] = Field(default_factory=dict, max_length=100)
    as_of_date: date
    accepted_draft: Phase6AcceptedDraft
    material_claims: list[Phase6MaterialClaim] = Field(min_length=1, max_length=100)
    evidence: list[Phase6CheckerEvidence] = Field(max_length=60)

    @model_validator(mode="after")
    def validate_claim_spans_and_dependencies(self):
        claim_ids = [claim.claim_id for claim in self.material_claims]
        if len(set(claim_ids)) != len(claim_ids):
            raise ValueError("material claim IDs must be unique")
        claim_id_set = set(claim_ids)
        evidence_refs = [item.evidence_ref for item in self.evidence]
        if len(set(evidence_refs)) != len(evidence_refs):
            raise ValueError("checker evidence refs must be unique")
        evidence_ref_set = set(evidence_refs)
        for claim in self.material_claims:
            if claim.draft_start >= len(self.accepted_draft.draft_markdown):
                raise ValueError(f"claim {claim.claim_id} starts beyond draft_markdown")
            if claim.draft_end > len(self.accepted_draft.draft_markdown):
                raise ValueError(f"claim {claim.claim_id} ends beyond draft_markdown")
            if self.accepted_draft.draft_markdown[claim.draft_start:claim.draft_end] != claim.text:
                raise ValueError(f"claim {claim.claim_id} does not match its draft span")
            unknown_dependencies = set(claim.depends_on) - claim_id_set
            if unknown_dependencies:
                raise ValueError(f"claim {claim.claim_id} has unknown dependencies")
            unknown_evidence = set(claim.evidence_refs) - evidence_ref_set
            if unknown_evidence:
                raise ValueError(f"claim {claim.claim_id} has evidence outside the packet")

        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(claim_id: str) -> bool:
            if claim_id in visiting:
                return False
            if claim_id in visited:
                return True
            visiting.add(claim_id)
            claim = self.material_claims[claim_ids.index(claim_id)]
            if not all(visit(dependency) for dependency in claim.depends_on):
                return False
            visiting.remove(claim_id)
            visited.add(claim_id)
            return True

        if not all(visit(claim_id) for claim_id in claim_ids):
            raise ValueError("material claim dependencies must be acyclic")
        return self


class Phase6CheckerDecision(StrictCheckerContract):
    claim_id: str = Field(min_length=1, max_length=100)
    verdict: Phase6CheckerVerdictValue
    reason_codes: list[Phase6CheckerReasonCodeValue] = Field(min_length=1, max_length=8)
    supporting_evidence_refs: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def validate_decision_threshold(self):
        if len(set(self.reason_codes)) != len(self.reason_codes):
            raise ValueError("reason_codes must not contain duplicates")
        if len(set(self.supporting_evidence_refs)) != len(self.supporting_evidence_refs):
            raise ValueError("supporting_evidence_refs must not contain duplicates")
        if any(
            not (ref.startswith("exact:") or ref.startswith("web:"))
            for ref in self.supporting_evidence_refs
        ):
            raise ValueError("supporting_evidence_refs must be opaque exact or web refs")
        contradiction = Phase6CheckerReasonCode.CONTRADICTED_BY_APPLICABLE_EVIDENCE
        if self.verdict == Phase6CheckerVerdict.BLOCK:
            if contradiction not in self.reason_codes:
                raise ValueError("BLOCK requires applicable contradiction reason")
            if not self.supporting_evidence_refs:
                raise ValueError("BLOCK requires supporting evidence")
        elif contradiction in self.reason_codes:
            raise ValueError("applicable contradiction requires BLOCK")
        if self.verdict == Phase6CheckerVerdict.KEEP:
            if Phase6CheckerReasonCode.SUPPORTED not in self.reason_codes:
                raise ValueError("KEEP requires SUPPORTED reason")
        return self


class Phase6CheckerResult(StrictCheckerContract):
    schema_version: Literal["phase6_checker.result.v1"]
    decisions: list[Phase6CheckerDecision] = Field(min_length=1, max_length=100)
    material_omission_suspected: bool = False
    escalate: bool = False
