"""Phase 4B — AgentSubmissionV2 validation service.

Validates terminal submit_answer payloads:
- Schema conformance
- Answer class validity
- Claim structure and span bounds
- Claim text/span correspondence
- Citation/evidence-ref membership in request registry
- State-patch structure (via existing validator contracts)
- Research status
- Duplicate IDs
- Malformed/overlapping claim locations

No DB write occurs from submit_answer itself.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.schemas.agent import AgentSubmissionV2
from app.schemas.tools import SubmissionError
from app.services.request_evidence_registry import (
    RequestEvidenceRegistry,
)

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ValidationResult:
    """Result of submission validation."""

    valid: bool
    errors: list[SubmissionError] = field(default_factory=list)

    def add_error(
        self,
        code: str,
        field_path: str,
        affected_claim_ids: list[str] | None = None,
    ) -> None:
        self.errors.append(
            SubmissionError(
                code=code,
                field=field_path,
                affected_claim_ids=affected_claim_ids or [],
            )
        )
        self.valid = False


class AgentSubmissionValidator:
    """Validates AgentSubmissionV2 against registry and contracts.

    This validator does NOT:
    - Classify raw user text
    - Choose visa pathways
    - Make LLM calls
    - Persist state
    """

    def __init__(self, registry: RequestEvidenceRegistry) -> None:
        self._registry = registry

    def validate(self, submission: AgentSubmissionV2) -> ValidationResult:
        """Validate a submission.

        Returns ValidationResult with valid=True if all checks pass.
        """
        result = ValidationResult(valid=True)

        # 1. Validate claim structure
        self._validate_claims(submission, result)

        # 2. Validate evidence refs are registered
        self._validate_evidence_refs(submission, result)

        # 3. Validate citations
        self._validate_citations(submission, result)

        # 4. Validate research status consistency
        self._validate_research_status(submission, result)

        # 5. Validate state patch structure (basic checks)
        self._validate_state_patch(submission, result)

        return result

    def _validate_claims(
        self,
        submission: AgentSubmissionV2,
        result: ValidationResult,
    ) -> None:
        """Validate claim structure and spans."""
        draft_length = len(submission.draft_markdown)
        seen_spans: list[tuple[int, int, str]] = []

        for claim in submission.claims:
            # Check span bounds
            if claim.draft_start < 0:
                result.add_error(
                    code="CLAIM_SPAN_NEGATIVE",
                    field_path=f"claims.{claim.claim_id}.draft_start",
                    affected_claim_ids=[claim.claim_id],
                )

            if claim.draft_end > draft_length:
                result.add_error(
                    code="CLAIM_SPAN_OUT_OF_BOUNDS",
                    field_path=f"claims.{claim.claim_id}.draft_end",
                    affected_claim_ids=[claim.claim_id],
                )

            if claim.draft_end < claim.draft_start:
                result.add_error(
                    code="CLAIM_SPAN_INVALID",
                    field_path=f"claims.{claim.claim_id}",
                    affected_claim_ids=[claim.claim_id],
                )

            # Check text correspondence (claim text should match span)
            if claim.draft_end <= draft_length:
                span_text = submission.draft_markdown[claim.draft_start : claim.draft_end]
                # Allow whitespace normalization differences only.
                normalized_claim = " ".join(claim.text.split())
                normalized_span = " ".join(span_text.split())
                if normalized_claim and normalized_span and normalized_claim != normalized_span:
                    result.add_error(
                        code="CLAIM_TEXT_SPAN_MISMATCH",
                        field_path=f"claims.{claim.claim_id}",
                        affected_claim_ids=[claim.claim_id],
                    )

            # Check for overlapping spans (decisive claims shouldn't overlap)
            for start, end, other_id in seen_spans:
                if claim.draft_start < end and claim.draft_end > start:
                    result.add_error(
                        code="CLAIM_SPAN_OVERLAP",
                        field_path=f"claims.{claim.claim_id}",
                        affected_claim_ids=[claim.claim_id, other_id],
                    )

            seen_spans.append((claim.draft_start, claim.draft_end, claim.claim_id))

            # Check evidence_refs for duplicates (already in schema, but verify)
            if len(set(claim.evidence_refs)) != len(claim.evidence_refs):
                result.add_error(
                    code="DUPLICATE_EVIDENCE_REF",
                    field_path=f"claims.{claim.claim_id}.evidence_refs",
                    affected_claim_ids=[claim.claim_id],
                )

        claim_ids = {claim.claim_id for claim in submission.claims}
        dependencies = {
            claim.claim_id: set(claim.depends_on) for claim in submission.claims
        }
        for claim_id, claim_dependencies in dependencies.items():
            for dependency in sorted(claim_dependencies - claim_ids):
                result.add_error(
                    code="CLAIM_DEPENDENCY_UNKNOWN",
                    field_path=f"claims.{claim_id}.depends_on",
                    affected_claim_ids=[claim_id],
                )

        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(claim_id: str) -> bool:
            if claim_id in visiting:
                return False
            if claim_id in visited:
                return True
            visiting.add(claim_id)
            for dependency in dependencies[claim_id] & claim_ids:
                if not visit(dependency):
                    return False
            visiting.remove(claim_id)
            visited.add(claim_id)
            return True

        for claim_id in claim_ids:
            if not visit(claim_id):
                result.add_error(
                    code="CLAIM_DEPENDENCY_CYCLE",
                    field_path="claims",
                )
                break

    def _validate_evidence_refs(
        self,
        submission: AgentSubmissionV2,
        result: ValidationResult,
    ) -> None:
        """Validate all evidence refs are registered in this request's registry."""
        if self._registry.is_disposed:
            result.add_error(
                code="REGISTRY_DISPOSED",
                field_path="evidence_refs",
            )
            return

        all_refs: set[str] = set()

        # Collect refs from claims
        for claim in submission.claims:
            all_refs.update(claim.evidence_refs)

        # Collect refs from citations
        for citation in submission.citations:
            all_refs.add(citation.evidence_ref)

        # Validate each ref
        for ref in all_refs:
            # Check format
            if not (ref.startswith("exact:") or ref.startswith("web:")):
                result.add_error(
                    code="INVALID_EVIDENCE_REF_FORMAT",
                    field_path="evidence_refs",
                )
                continue

            # Check registration
            if not self._registry.is_registered(ref):
                result.add_error(
                    code="EVIDENCE_NOT_REGISTERED",
                    field_path="evidence_refs",
                )

    def _validate_citations(
        self,
        submission: AgentSubmissionV2,
        result: ValidationResult,
    ) -> None:
        """Validate citation structure."""
        seen_refs: set[str] = set()

        for i, citation in enumerate(submission.citations):
            # Check for duplicate citations
            if citation.evidence_ref in seen_refs:
                result.add_error(
                    code="DUPLICATE_CITATION",
                    field_path=f"citations.{i}",
                )
            seen_refs.add(citation.evidence_ref)

    def _validate_research_status(
        self,
        submission: AgentSubmissionV2,
        result: ValidationResult,
    ) -> None:
        """Validate research status consistency."""
        answer_class = submission.answer_class
        research_status = submission.research_status

        # Substantive legal claims should not have not_required
        if answer_class == "substantive_legal" and research_status == "not_required":
            result.add_error(
                code="RESEARCH_STATUS_INCONSISTENT",
                field_path="research_status",
            )

        # Safety blocked should not require research
        if answer_class == "safety_blocked" and research_status == "complete":
            # This is unusual but not necessarily invalid
            pass

    def _validate_state_patch(
        self,
        submission: AgentSubmissionV2,
        result: ValidationResult,
    ) -> None:
        """Validate state patch structure (basic checks).

        Full patch validation happens when patch is applied.
        Here we check basic structure.
        """
        for i, op in enumerate(submission.state_patch):
            if not isinstance(op, dict):
                result.add_error(
                    code="INVALID_STATE_PATCH_OP",
                    field_path=f"state_patch.{i}",
                )
                continue

            # Check required fields
            if "op" not in op:
                result.add_error(
                    code="STATE_PATCH_MISSING_OP",
                    field_path=f"state_patch.{i}",
                )

            if "path" not in op:
                result.add_error(
                    code="STATE_PATCH_MISSING_PATH",
                    field_path=f"state_patch.{i}",
                )

            # Check for forbidden paths
            path = op.get("path", "")
            if path.startswith("identity") or path == "schema_version":
                result.add_error(
                    code="STATE_PATCH_IMMUTABLE_PATH",
                    field_path=f"state_patch.{i}",
                )


def validate_submission(
    submission: AgentSubmissionV2,
    registry: RequestEvidenceRegistry,
) -> ValidationResult:
    """Convenience function to validate a submission."""
    validator = AgentSubmissionValidator(registry)
    return validator.validate(submission)
