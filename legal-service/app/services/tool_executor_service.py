"""Phase 5 — Tool executor service.

Executes Phase 4B custom tools within the Luna agent runtime.

Responsibilities:
- Execute custom function tools (deterministic_utility, flat_rag_search, submit_answer)
- Produce typed ToolResultEnvelope
- Maintain request-scoped evidence registry
- No semantic routing
- No LLM calls
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from uuid import uuid4

from pydantic import ValidationError

from app.schemas.agent import AgentSubmissionV2
from app.schemas.tools import (
    DeterministicUtilityRequest,
    ExactLegalLookupBatchRequest,
    SubmissionError,
    Schedule2NavigationBatchRequest,
    SubmitAnswerAccepted,
    SubmitAnswerRejected,
    ToolResultEnvelope,
)
from app.services.agent_submission_validator import AgentSubmissionValidator
from app.services.evidence_postcondition_service import EvidencePostconditionService
from app.services.native_web_locator_resolver import (
    LOCATOR_SCHEMA_INVALID,
    NativeWebLocatorResolver,
    validate_locator_object,
)
from app.services.request_evidence_registry import RequestEvidenceRegistry
from app.services.residual_branch_applicability_service import (
    evaluate_applicability_guard,
)
from app.services.search_privacy_guard import SearchPrivacyGuard
from app.services.terminal_submission_policy import (
    TerminalSubmissionAction,
    TerminalSubmissionPolicy,
    TerminalSubmissionRecord,
)
from app.services.web_evidence_normalizer import WebEvidenceNormalizer
from app.tools.base import ToolExecutionError, build_tool_result
from app.tools.deterministic_utility import execute_utility

logger = logging.getLogger(__name__)


_MAX_SUBMISSION_SCHEMA_ERRORS = 12
_MAX_SCHEMA_ERROR_LOCATION_DEPTH = 8
_MAX_SCHEMA_ERROR_INDEX = 999
_SAFE_SCHEMA_LOCATION_COMPONENTS = frozenset({
    "submission",
    "schema_version",
    "answer_class",
    "draft_markdown",
    "next_action",
    "user_display_mode",
    "as_of_date",
    "claims",
    "claim_id",
    "claim_type",
    "materiality",
    "text",
    "draft_start",
    "draft_end",
    "evidence_refs",
    "depends_on",
    "citations",
    "display_label",
    "native_web_locators",
    "applicability_resolutions",
    "selected_branch_evidence_ref",
    "resolution_kind",
    "status",
    "applicability_basis_evidence_refs",
    "competing_branch_evidence_refs",
    "research_status",
    "state_patch",
})
_SAFE_SCHEMA_ERROR_TYPES = frozenset({
    "missing",
    "extra_forbidden",
    "literal_error",
    "list_type",
    "dict_type",
    "string_type",
    "int_type",
    "bool_type",
    "date_type",
    "model_type",
    "too_short",
    "too_long",
    "value_error",
    "int_parsing",
    "date_parsing",
    "greater_than_equal",
    "less_than_equal",
    "schema_precheck",
    "evidence_ref_shape",
})


def _sanitize_schema_error_location(location: Any) -> str:
    """Convert a Pydantic location into a bounded structural path only."""

    if isinstance(location, str):
        location = location.split(".")
    if not isinstance(location, (tuple, list)):
        return "<unknown>"
    if not location or len(location) > _MAX_SCHEMA_ERROR_LOCATION_DEPTH:
        return "<unknown>"

    components: list[str] = []
    for component in location:
        if isinstance(component, int) and not isinstance(component, bool):
            components.append(str(min(max(component, 0), _MAX_SCHEMA_ERROR_INDEX)))
        elif isinstance(component, str) and component.isdigit():
            components.append(str(min(int(component), _MAX_SCHEMA_ERROR_INDEX)))
        elif (
            isinstance(component, str)
            and len(component) <= 80
            and component in _SAFE_SCHEMA_LOCATION_COMPONENTS
        ):
            components.append(component)
        else:
            components.append("<unknown>")
    return ".".join(components)


def _sanitize_schema_error_type(error_type: Any) -> str:
    """Return only an allowlisted structural error type."""

    if isinstance(error_type, str) and error_type in _SAFE_SCHEMA_ERROR_TYPES:
        return error_type
    return "value_error"


def _record_submission_schema_error(
    diagnostics: dict[str, Any],
    *,
    location: Any,
    error_type: Any,
) -> None:
    """Append bounded, content-free schema diagnostics to terminal telemetry."""

    count = diagnostics.get("submission_schema_error_count", 0)
    if not isinstance(count, int) or isinstance(count, bool):
        count = 0
    if count >= _MAX_SUBMISSION_SCHEMA_ERRORS:
        return

    locations = diagnostics.setdefault("submission_schema_error_locations", [])
    types = diagnostics.setdefault("submission_schema_error_types", [])
    if not isinstance(locations, list) or not isinstance(types, list):
        diagnostics["submission_schema_error_locations"] = locations = []
        diagnostics["submission_schema_error_types"] = types = []
    locations.append(_sanitize_schema_error_location(location))
    types.append(_sanitize_schema_error_type(error_type))
    diagnostics["submission_schema_error_count"] = count + 1


def _dedup_ordered(refs: list[str]) -> list[str]:
    """Deduplicate canonical refs preserving first-occurrence order."""
    seen: set[str] = set()
    out: list[str] = []
    for ref in refs:
        if ref not in seen:
            seen.add(ref)
            out.append(ref)
    return out


def normalized_tool_call_key(tool_call: ToolCallRequest) -> tuple[str, str]:
    """Return a conservative same-round duplicate key.

    Only structural normalization is performed: tool names are exact, object
    keys are ordered, strings are trimmed and internal whitespace is collapsed,
    and list order is preserved. No semantic or embedding comparison occurs.
    """

    def normalize(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                str(key): normalize(value[key])
                for key in sorted(value, key=lambda item: str(item))
            }
        if isinstance(value, list):
            return [normalize(item) for item in value]
        if isinstance(value, str):
            return " ".join(value.strip().split())
        return value

    return (
        tool_call.name,
        json.dumps(normalize(tool_call.arguments), ensure_ascii=False, sort_keys=True, separators=(",", ":")),
    )


_EXACT_IDENTITY_FIELDS = (
    "query",
    "document_id",
    "locator_type",
    "locator",
    "target_document",
    "node_type",
    "provision_ref",
    "schedule",
    "provision",
    "case_citation",
    "subclass",
)


def _has_usable_exact_locator(value: Any) -> bool:
    """Return whether a raw model item contains legal locator identity.

    Advisory fields such as ``source_types`` and ``source_type`` do not make an
    exact request usable. Whitespace-only strings are treated as empty. This
    boundary check intentionally does not invent identity from free-form text.
    """
    if not isinstance(value, dict):
        return False
    return any(
        isinstance(value.get(field), str) and value[field].strip()
        for field in _EXACT_IDENTITY_FIELDS
    )


_EXACT_ATTEMPT_FIELDS = (
    ("locator_type", 100),
    ("locator", 500),
    ("target_document", 500),
    ("node_type", 100),
    ("provision_ref", 255),
    ("schedule", 100),
    ("provision", 255),
    ("subclass", 50),
    ("source_type", 100),
    ("case_citation", 500),
)


def _safe_exact_attempt_text(value: Any, *, limit: int) -> str | None:
    """Return a bounded structured locator value without preserving prose."""
    if not isinstance(value, str):
        return None
    return " ".join(value.split())[:limit] or None


def _summarize_exact_lookup_attempt(tool_call: ToolCallRequest) -> dict[str, Any]:
    """Create content-safe diagnostics before exact-lookup quota enforcement."""
    arguments = tool_call.arguments if isinstance(tool_call.arguments, dict) else {}
    raw_requests = arguments.get("requests")
    if not isinstance(raw_requests, list):
        return {
            "tool_call_id": tool_call.call_id,
            "execution_status": "governor_denied",
            "governor_denied": True,
            "denial_code": "EXACT_LOOKUP_BUDGET_EXHAUSTED",
            "arguments_shape": (
                "missing_requests"
                if "requests" not in arguments
                else type(raw_requests).__name__
            ),
            "requested_item_count": 0,
            "model_requests": [],
        }

    bounded_requests = raw_requests[:8]
    model_requests: list[dict[str, Any]] = []
    for raw_item in bounded_requests:
        if not isinstance(raw_item, dict):
            model_requests.append({"item_shape": type(raw_item).__name__})
            continue

        summary = {
            field: _safe_exact_attempt_text(raw_item.get(field), limit=limit)
            for field, limit in _EXACT_ATTEMPT_FIELDS
        }
        source_types = raw_item.get("source_types")
        summary["source_types"] = (
            [
                _safe_exact_attempt_text(value, limit=100)
                for value in source_types[:20]
                if isinstance(value, str)
            ]
            if isinstance(source_types, list)
            else []
        )
        query = raw_item.get("query")
        summary["query_present"] = query is not None
        summary["query_length"] = len(query) if isinstance(query, str) else 0
        model_requests.append(summary)

    return {
        "tool_call_id": tool_call.call_id,
        "execution_status": "governor_denied",
        "governor_denied": True,
        "denial_code": "EXACT_LOOKUP_BUDGET_EXHAUSTED",
        "arguments_shape": "list",
        "requested_item_count": min(len(raw_requests), 8),
        "requested_item_count_truncated": len(raw_requests) > 8,
        "model_requests": model_requests,
    }


def _find_claim_text_spans(*, draft: str, claim_text: str) -> list[tuple[int, int]]:
    """Find whitespace-equivalent contiguous excerpts in the submitted draft.

    This deliberately allows only whitespace differences. Markdown punctuation,
    Unicode characters, and wording must remain exact; paraphrases are not
    eligible for structural span derivation.
    """
    tokens = claim_text.split()
    if not tokens:
        return []
    pattern = r"\s+".join(re.escape(token) for token in tokens)
    # Lookahead preserves overlapping occurrences (for example, "aa" in
    # "aaa"), so ambiguity can never be hidden by normal regex iteration.
    return [
        (match.start(1), match.end(1))
        for match in re.finditer(f"(?=({pattern}))", draft)
    ]


def _normalize_claim_spans(
    *,
    draft: Any,
    claims: Any,
) -> tuple[list[dict[str, Any]], list[SubmissionError]]:
    """Derive claim spans before strict AgentSubmissionV2 construction.

    Model-provided offsets are advisory. A unique whitespace-equivalent excerpt
    determines the backend-owned span; an ambiguous or absent excerpt is a
    deterministic rejection, never a fuzzy association.
    """
    if not isinstance(draft, str) or not isinstance(claims, list):
        return [], [
            SubmissionError(
                code="SUBMISSION_SCHEMA_INVALID",
                field="submission",
            )
        ]

    normalized_claims: list[dict[str, Any]] = []
    errors: list[SubmissionError] = []
    for raw_claim in claims:
        if not isinstance(raw_claim, dict):
            errors.append(
                SubmissionError(code="SUBMISSION_SCHEMA_INVALID", field="claims")
            )
            continue

        claim = dict(raw_claim)
        claim_id = str(claim.get("claim_id") or "")
        raw_start = claim.get("draft_start")
        raw_end = claim.get("draft_end")
        valid_offsets = (
            isinstance(raw_start, int)
            and not isinstance(raw_start, bool)
            and isinstance(raw_end, int)
            and not isinstance(raw_end, bool)
            and 0 <= raw_start < raw_end <= len(draft)
        )
        if valid_offsets:
            # The submitted draft is authoritative whenever a safe location is
            # supplied. This also repairs duplicate/paraphrased model text.
            claim["text"] = draft[raw_start:raw_end]
            claim["draft_start"] = raw_start
            claim["draft_end"] = raw_end
        else:
            claim_text = claim.get("text")
            if not isinstance(claim_text, str) or not claim_text.strip():
                errors.append(
                    SubmissionError(
                        code="CLAIM_LOCATION_MISSING",
                        field=f"claims.{claim_id or '<unknown>'}",
                        affected_claim_ids=[claim_id] if claim_id else [],
                    )
                )
                normalized_claims.append(claim)
                continue
            matches = _find_claim_text_spans(draft=draft, claim_text=claim_text)
            if len(matches) == 1:
                start, end = matches[0]
                claim["text"] = draft[start:end]
                claim["draft_start"] = start
                claim["draft_end"] = end
            elif len(matches) == 0:
                errors.append(
                    SubmissionError(
                        code="CLAIM_TEXT_NOT_FOUND",
                        field=f"claims.{claim_id or '<unknown>'}.text",
                        affected_claim_ids=[claim_id] if claim_id else [],
                    )
                )
            else:
                errors.append(
                    SubmissionError(
                        code="CLAIM_TEXT_AMBIGUOUS",
                        field=f"claims.{claim_id or '<unknown>'}.text",
                        affected_claim_ids=[claim_id] if claim_id else [],
                    )
                )

        normalized_claims.append(claim)

    return normalized_claims, errors


def _normalize_recoverable_submission_fields(args: dict[str, Any]) -> None:
    """Normalize duplicate list bookkeeping without inventing evidence.

    Repeating the same request-scoped ref or dependency is mechanically
    recoverable and carries no additional meaning. Unknown refs, spans, claim
    IDs, and locator observations are deliberately untouched and remain hard
    validation failures.
    """
    claims = args.get("claims")
    if not isinstance(claims, list):
        return
    for claim in claims:
        if not isinstance(claim, dict):
            continue
        for field_name in ("evidence_refs", "depends_on"):
            values = claim.get(field_name)
            if isinstance(values, list) and all(isinstance(value, str) for value in values):
                claim[field_name] = _dedup_ordered(values)


def _reconcile_submission_evidence(
    args: dict[str, Any],
    context: ToolExecutorContext,
) -> dict[str, int]:
    """Drop invalid evidence only when genuine request evidence survives.

    Model-authored refs and locators are never made authoritative here. A ref
    survives only when the request registry already contains it; a locator
    survives only when the native resolver can map it to an observed ref. If a
    material claim would otherwise be left with no valid evidence, its original
    invalid value is retained so the established validator rejects it.
    """
    claims = args.get("claims") if isinstance(args.get("claims"), list) else []
    resolver = NativeWebLocatorResolver(context.registry)
    removed_refs = 0
    removed_locators = 0

    for claim in claims:
        if not isinstance(claim, dict):
            continue

        refs = claim.get("evidence_refs")
        registered_refs: list[str] = []
        invalid_refs: list[Any] = []
        if isinstance(refs, list):
            for ref in refs:
                if isinstance(ref, str) and context.registry.is_registered(ref):
                    registered_refs.append(ref)
                else:
                    invalid_refs.append(ref)

        locators = claim.get("native_web_locators")
        observed_locators: list[Any] = []
        if isinstance(locators, list):
            resolution = resolver.resolve(locators)
            for locator in locators:
                validated, invalid_code = validate_locator_object(locator)
                if invalid_code is None and validated.url in resolution.resolved:
                    observed_locators.append(locator)

        if invalid_refs and registered_refs:
            claim["evidence_refs"] = _dedup_ordered(registered_refs)
            removed_refs += len(invalid_refs)
        elif invalid_refs and not registered_refs and claim.get("materiality") != "decisive":
            # Supporting claims do not carry the decisive-evidence contract;
            # remove model-authored refs rather than allowing them to poison an
            # otherwise valid submission. Decisive claims intentionally retain
            # their invalid refs so the existing hard rejection remains active.
            del claim["evidence_refs"]
            removed_refs += len(invalid_refs)

        if isinstance(locators, list) and observed_locators:
            if len(observed_locators) != len(locators):
                claim["native_web_locators"] = observed_locators
                removed_locators += len(locators) - len(observed_locators)
        elif isinstance(locators, list) and registered_refs:
            # Genuine registered refs already support this claim; discard only
            # unobserved/malformed transient locators.
            del claim["native_web_locators"]
            removed_locators += len(locators)
        elif isinstance(locators, list) and not observed_locators and claim.get("materiality") != "decisive":
            del claim["native_web_locators"]
            removed_locators += len(locators)
        elif locators is not None and registered_refs:
            del claim["native_web_locators"]
            removed_locators += 1

    # A citation has only one evidence slot. Remove an invalid citation only
    # after another genuine request-scoped ref/observed locator remains in the
    # submission; otherwise leave it for the existing hard rejection path.
    citations = args.get("citations") if isinstance(args.get("citations"), list) else []
    valid_submission_evidence = any(
        isinstance(claim, dict)
        and isinstance(claim.get("evidence_refs"), list)
        and any(
            isinstance(ref, str) and context.registry.is_registered(ref)
            for ref in claim["evidence_refs"]
        )
        for claim in claims
    )
    citation_states: list[tuple[Any, bool, bool]] = []
    for citation in citations:
        if not isinstance(citation, dict):
            citation_states.append((citation, False, False))
            continue
        ref = citation.get("evidence_ref")
        locator = citation.get("native_web_locator")
        valid_ref = isinstance(ref, str) and context.registry.is_registered(ref)
        observed_locator = False
        if locator is not None:
            resolution = resolver.resolve([locator])
            observed_locator = resolution.resolved_count == 1 and not resolution.rejected
        if valid_ref or observed_locator:
            valid_submission_evidence = True
        citation_states.append((citation, valid_ref, observed_locator))

    retained_citations: list[Any] = []
    for citation, valid_ref, observed_locator in citation_states:
        if valid_ref or observed_locator or not valid_submission_evidence:
            retained_citations.append(citation)
        else:
            if isinstance(citation, dict):
                ref = citation.get("evidence_ref")
                locator = citation.get("native_web_locator")
                removed_refs += int(isinstance(ref, str))
                removed_locators += int(locator is not None)
    args["citations"] = retained_citations
    return {
        "submission_invalid_evidence_refs_removed": removed_refs,
        "submission_unobserved_locators_removed": removed_locators,
    }


def _submission_contract_diagnostics(
    args: dict[str, Any],
    context: ToolExecutorContext,
) -> dict[str, int]:
    """Return content-safe structural counts for one submit attempt."""

    claims = args.get("claims") if isinstance(args.get("claims"), list) else []
    citations = args.get("citations") if isinstance(args.get("citations"), list) else []
    claim_refs = [
        claim.get("evidence_refs")
        for claim in claims
        if isinstance(claim, dict)
    ]
    claim_locators = [
        claim.get("native_web_locators")
        for claim in claims
        if isinstance(claim, dict)
    ]
    claims_using_refs = sum(isinstance(refs, list) and bool(refs) for refs in claim_refs)
    claims_using_locators = sum(
        isinstance(locators, list) and bool(locators) for locators in claim_locators
    )
    citations_using_refs = sum(
        isinstance(citation, dict) and bool(citation.get("evidence_ref"))
        for citation in citations
    )
    citations_using_locators = sum(
        isinstance(citation, dict) and bool(citation.get("native_web_locator"))
        for citation in citations
    )
    unregistered_refs = 0
    for refs in claim_refs:
        if isinstance(refs, list):
            unregistered_refs += sum(
                isinstance(ref, str) and not context.registry.is_registered(ref)
                for ref in refs
            )
    for citation in citations:
        if isinstance(citation, dict):
            ref = citation.get("evidence_ref")
            if isinstance(ref, str) and not context.registry.is_registered(ref):
                unregistered_refs += 1

    seen_citations: set[tuple[str, str]] = set()
    duplicate_citations = 0
    for citation in citations:
        if not isinstance(citation, dict):
            continue
        key = (
            str(citation.get("evidence_ref") or ""),
            repr(citation.get("native_web_locator") or ""),
        )
        if key in seen_citations:
            duplicate_citations += 1
        seen_citations.add(key)

    draft = args.get("draft_markdown") if isinstance(args.get("draft_markdown"), str) else ""
    invalid_offsets = 0
    empty_offset_spans = 0
    offset_text_conflicts = 0
    for claim in claims:
        if not isinstance(claim, dict):
            continue
        start = claim.get("draft_start")
        end = claim.get("draft_end")
        if not isinstance(start, int) or isinstance(start, bool) or not isinstance(end, int) or isinstance(end, bool):
            invalid_offsets += 1
            continue
        if start == end:
            empty_offset_spans += 1
        elif start < 0 or end > len(draft) or start > end:
            invalid_offsets += 1
        elif isinstance(claim.get("text"), str) and (
            " ".join(claim["text"].split())
            != " ".join(draft[start:end].split())
        ):
            offset_text_conflicts += 1

    return {
        "claim_count": len(claims),
        "claims_using_evidence_refs_count": claims_using_refs,
        "claims_using_native_web_locators_count": claims_using_locators,
        "claims_using_both_count": sum(
            isinstance(refs, list) and bool(refs)
            and isinstance(locators, list) and bool(locators)
            for refs, locators in zip(claim_refs, claim_locators)
        ),
        "claims_using_neither_count": len(claims) - claims_using_refs - claims_using_locators + sum(
            isinstance(refs, list) and bool(refs)
            and isinstance(locators, list) and bool(locators)
            for refs, locators in zip(claim_refs, claim_locators)
        ),
        "citation_count": len(citations),
        "citations_using_evidence_ref_count": citations_using_refs,
        "citations_using_native_web_locator_count": citations_using_locators,
        "citations_using_both_count": sum(
            isinstance(citation, dict)
            and bool(citation.get("evidence_ref"))
            and bool(citation.get("native_web_locator"))
            for citation in citations
        ),
        "citations_using_neither_count": len(citations) - citations_using_refs - citations_using_locators + sum(
            isinstance(citation, dict)
            and bool(citation.get("evidence_ref"))
            and bool(citation.get("native_web_locator"))
            for citation in citations
        ),
        "unregistered_evidence_ref_count": unregistered_refs,
        "duplicate_citation_count": duplicate_citations,
        "claim_text_not_found_count": 0,
        "citation_evidence_missing_count": sum(
            isinstance(citation, dict)
            and not citation.get("evidence_ref")
            and not citation.get("native_web_locator")
            for citation in citations
        ),
        "invalid_offset_count": invalid_offsets,
        "empty_offset_span_count": empty_offset_spans,
        "text_offset_conflict_normalized_count": offset_text_conflicts,
    }


def _add_submission_error_diagnostics(
    diagnostics: dict[str, Any],
    errors: list[SubmissionError],
) -> dict[str, Any]:
    for error in errors:
        if error.code == "SUBMISSION_SCHEMA_INVALID":
            _record_submission_schema_error(
                diagnostics,
                location=error.field,
                error_type=(
                    "evidence_ref_shape"
                    if str(error.field or "").endswith("evidence_refs")
                    else "schema_precheck"
                ),
            )
        elif error.code == "CLAIM_TEXT_NOT_FOUND":
            diagnostics["claim_text_not_found_count"] = max(
                diagnostics["claim_text_not_found_count"], 1
            )
        elif error.code == "DUPLICATE_CITATION":
            diagnostics["duplicate_citation_count"] = max(
                diagnostics["duplicate_citation_count"], 1
            )
        elif error.code == "CITATION_EVIDENCE_MISSING":
            diagnostics["citation_evidence_missing_count"] = max(
                diagnostics["citation_evidence_missing_count"], 1
            )
    return diagnostics


def _reject_model_canonical_refs(
    *,
    args: dict[str, Any],
    context: ToolExecutorContext,
) -> SubmissionError | None:
    """Reject model-authored canonical refs when the context cannot produce them."""

    if context.allow_model_canonical_refs:
        return None
    claims = args.get("claims") if isinstance(args.get("claims"), list) else []
    for index, claim in enumerate(claims):
        if isinstance(claim, dict) and claim.get("evidence_refs"):
            return SubmissionError(
                code="CANONICAL_EVIDENCE_REF_NOT_ALLOWED",
                field=f"claims.{index}.evidence_refs",
            )
    citations = args.get("citations") if isinstance(args.get("citations"), list) else []
    for index, citation in enumerate(citations):
        if isinstance(citation, dict) and citation.get("evidence_ref"):
            return SubmissionError(
                code="CANONICAL_EVIDENCE_REF_NOT_ALLOWED",
                field=f"citations.{index}.evidence_ref",
            )
    return None


def _strip_lightweight_evidence_bookkeeping(args: dict[str, Any]) -> None:
    """Remove model-authored evidence bookkeeping for revised Arm L."""

    claims = args.get("claims")
    if isinstance(claims, list):
        for claim in claims:
            if isinstance(claim, dict):
                claim.pop("evidence_refs", None)
                claim.pop("native_web_locators", None)
    if isinstance(args.get("citations"), list):
        args["citations"] = []


# ---------------------------------------------------------------------------
# Phase-5 content-safe postcondition diagnostics
#
# Maps the deterministic evidence-postcondition reasons to STABLE, content-free
# reason categories.  These categories explain WHY a submission was rejected
# without exposing claim text, URLs, raw evidence refs, source titles, search
# queries, or PII.  The categories are derived only from the typed
# ClaimEvaluation reasons produced by EvidencePostconditionService, never from
# raw model or evidence content.
#
# This mapping is EXHAUSTIVE over the deterministic reason strings currently
# generated in evidence_postcondition_service.py; expected current reasons must
# not fall into OTHER (OTHER is reserved for genuinely novel/unknown reasons).
# ---------------------------------------------------------------------------

_POSTCONDITION_REASON_CODES: dict[str, str] = {
    # --- evidence-requirement / suitability ---
    "No evidence refs for decisive claim": "NO_EVIDENCE",
    "No suitable evidence found": "NO_SUITABLE_EVIDENCE",
    "Evidence ref not registered": "EVIDENCE_REF_NOT_REGISTERED",
    "Research marked complete despite unresolved cross-references": "UNRESOLVED_CROSS_REFERENCE",
    # --- controlling authority ---
    "Decisive legal claims require controlling binding legal authority": "NO_CONTROLLING_AUTHORITY",
    "Legal claims require verified official evidence": "UNVERIFIED_SOURCE",
    "Evidence is not binding legal authority": "NON_BINDING_AUTHORITY",
    "Evidence authority kind is not controlling law": "NON_CONTROLLING_AUTHORITY_KIND",
    "Official guidance is supplementary, not controlling": "SUPPLEMENTARY_GUIDANCE_ONLY",
    # --- native web / LightRAG ---
    "Native web evidence lacks exact text/hash": "NATIVE_WEB_NO_EXACT_TEXT",
    "Native evidence applicability basis": "NATIVE_WEB_APPLICABILITY",
    "LightRAG relationship alone cannot support legal claims": "DERIVED_RELATIONSHIP_ONLY",
    "Official guidance is non-binding": "SUPPLEMENTARY_GUIDANCE_ONLY",
    # --- provenance / version / effective interval ---
    "Evidence provenance incomplete": "PROVENANCE_INCOMPLETE",
    "Evidence has no applicable document version": "NO_DOCUMENT_VERSION",
    "Evidence has no effective interval for claim date": "NO_EFFECTIVE_INTERVAL",
    "Evidence not yet effective as of claim date": "NOT_YET_EFFECTIVE",
    "Evidence no longer effective as of claim date": "NO_LONGER_EFFECTIVE",
    "Complete legal claims require an applicable effective interval": "NO_APPLICABLE_INTERVAL",
    "Current facts require verified evidence": "CURRENT_FACT_UNVERIFIED",
    "Canonical evidence has no document version": "NO_DOCUMENT_VERSION",
    "Current evidence has no document version": "NO_DOCUMENT_VERSION",
    "Canonical evidence has no effective interval": "NO_EFFECTIVE_INTERVAL",
    "Current evidence has no effective interval": "NO_EFFECTIVE_INTERVAL",
    # --- supporting / informational reasons (not failures) ---
    "Supporting claim; evidence optional": "SUPPORTING_CLAIM_OPTIONAL",
    "Applicability unknown": "APPLICABILITY_UNKNOWN",
}


def _reason_category(reason: str) -> str:
    """Map a postcondition reason string to a stable content-free code."""
    for prefix, code in _POSTCONDITION_REASON_CODES.items():
        if prefix in reason:
            return code
    return "OTHER"


def _postcondition_diagnostics(postcondition_result: Any) -> dict[str, Any]:
    """Build content-safe diagnostics from a postcondition result.

    Returns ONLY structural, non-sensitive metadata:
    - evaluated_claim_count: number of claims evaluated by the postcondition
    - insufficient_claim_count: claims with status == "insufficient"
    - invalid_ref_claim_count: claims with status == "invalid_ref"
    - claim_status_counts: stable claim status -> count (never claim text)
    - affected_claim_ids: claim IDs (IDs only, allowed by existing policy)
    - postcondition_reason_categories: stable reason-category code -> count
    - claim_evidence_classification: per-claim content-safe evidence counts:
      source_authenticity_counts, authority_kind_counts, binding_status_counts,
      evidence_type_counts, native_applicability_basis_counts,
      controlling_candidate_count, suitable_evidence_count,
      evidence_count (from the typed ClaimEvaluation.evidence_classification).

    Structured from the typed ClaimEvaluation objects.  Never exposes claim
    text, URLs, raw evidence refs, source titles, search queries, or PII.
    """
    evaluations = list(getattr(postcondition_result, "claim_evaluations", []) or [])

    claim_status_counts: dict[str, int] = {}
    reason_counts: dict[str, int] = {}
    affected: list[str] = []
    per_claim: dict[str, dict[str, Any]] = {}

    for evaluation in evaluations:
        status = str(getattr(evaluation, "status", "unknown") or "unknown")
        claim_status_counts[status] = claim_status_counts.get(status, 0) + 1
        claim_id = str(getattr(evaluation, "claim_id", "") or "")
        if status in ("insufficient", "invalid_ref") and claim_id:
            affected.append(claim_id)
            for reason in list(getattr(evaluation, "reasons", []) or []):
                category = _reason_category(str(reason))
                reason_counts[category] = reason_counts.get(category, 0) + 1
            # Content-safe per-claim evidence classification (counts only).
            classification = dict(
                getattr(evaluation, "evidence_classification", None) or {}
            )
            if claim_id and classification:
                per_claim[claim_id] = classification

    return {
        "evaluated_claim_count": len(evaluations),
        "insufficient_claim_count": sum(
            1 for e in evaluations if getattr(e, "status", None) == "insufficient"
        ),
        "invalid_ref_claim_count": sum(
            1 for e in evaluations if getattr(e, "status", None) == "invalid_ref"
        ),
        "claim_status_counts": claim_status_counts,
        "affected_claim_ids": affected,
        "postcondition_reason_categories": reason_counts,
        "claim_evidence_classification": per_claim,
    }


@dataclass(slots=True)
class ToolCallRequest:
    """A tool call request from the provider."""

    call_id: str
    name: str
    arguments: dict[str, Any]


@dataclass(slots=True)
class ToolCallResult:
    """Result of executing a tool call."""

    tool_call_id: str
    tool_name: str
    result: ToolResultEnvelope
    duration_ms: float
    # For submit_answer: the parsed submission if valid
    submission: AgentSubmissionV2 | None = None
    submission_action: TerminalSubmissionAction | None = None
    # True once the handler begins the underlying service execution. This
    # distinguishes real zero-result/error executions from invalid or
    # unavailable requests.
    execution_started: bool = False


@dataclass(slots=True)
class ToolExecutorContext:
    """Context for tool execution within a single agent run."""

    request_id: str
    registry: RequestEvidenceRegistry
    as_of_date: date | None = None
    corpus_version: str | None = None
    index_version: str | None = None
    # Arm A exposes provider-native web locators but no custom canonical-ref
    # producer. Keep model-authored canonical refs disabled in that context;
    # resolved locator refs are created internally after same-request checks.
    allow_model_canonical_refs: bool = True
    lightweight_submission: bool = False
    allow_overlapping_claims: bool = False
    residual_branch_guard_enabled: bool = False
    deadline_monotonic: float | None = None
    # Terminal submission tracking
    terminal_record: TerminalSubmissionRecord = field(default_factory=lambda: TerminalSubmissionRecord())
    terminal_policy: TerminalSubmissionPolicy = field(default_factory=TerminalSubmissionPolicy)
    # Set from the first parsed submission.  A repair must not evade the
    # evidence postcondition by deleting decisive evidence-required claims
    # while retaining citations or claiming research is complete.
    repair_requires_evidence: bool = False
    # Accumulated tool outputs
    tool_outputs: list[ToolResultEnvelope] = field(default_factory=list)
    # Web evidence normalizer
    web_normalizer: WebEvidenceNormalizer = field(default_factory=WebEvidenceNormalizer)
    # Privacy guard
    privacy_guard: SearchPrivacyGuard = field(default_factory=SearchPrivacyGuard)
    # Flat RAG search (injected)
    flat_rag_search_fn: Any = None
    # DB session for tools that need it (injected)
    db_session: Any = None
    # Experimental Arm-N research adapters.  Both are request-local and
    # navigation never receives or writes to the evidence registry.
    schedule2_navigation_map: Any = None
    exact_legal_lookup_service: Any = None
    max_schedule2_navigation_calls: int = 2
    schedule2_navigation_call_count: int = 0
    schedule2_navigation_target_count: int = 0
    max_exact_legal_lookup_calls: int = 2
    exact_legal_lookup_call_count: int = 0
    exact_lookup_requested_locator_count: int = 0
    exact_lookup_resolved_locator_count: int = 0
    exact_lookup_unresolved_locator_count: int = 0
    exact_lookup_unresolved_cross_reference_count: int = 0
    exact_invalid_empty_request_count: int = 0
    exact_no_usable_locator_count: int = 0
    # Safe request/result trace for evaluation diagnostics.  The normalizer
    # excludes raw free-form query text and provider reasoning from this data.
    exact_lookup_requests: list[dict[str, Any]] = field(default_factory=list)
    # Content-free outcome counts for the latest native locator resolution.
    native_web_locator_resolution_categories: dict[str, int] = field(default_factory=dict)
    schedule2_navigation_denied_call_count: int = 0
    exact_legal_lookup_denied_call_count: int = 0
    residual_branch_guard_trigger_count: int = 0
    residual_branch_submission_rejection_count: int = 0
    applicability_resolution_count: int = 0
    unresolved_applicability_count: int = 0
    execution_started_tool_call_ids: set[str] = field(default_factory=set)


class ToolExecutorService:
    """Executes custom function tools for the Luna agent runtime.

    Does NOT:
    - Make LLM calls
    - Perform semantic routing
    - Classify user text
    - Choose visa pathways
    """

    def execute_tool(
        self,
        tool_call: ToolCallRequest,
        context: ToolExecutorContext,
    ) -> ToolCallResult:
        """Execute a single tool call and return the result.

        Routes to the appropriate tool handler based on tool name.
        """
        start = time.perf_counter()
        submission: AgentSubmissionV2 | None = None
        submission_action: TerminalSubmissionAction | None = None
        context.execution_started_tool_call_ids.discard(tool_call.call_id)

        try:
            if tool_call.name == "deterministic_utility":
                result = self._execute_deterministic_utility(tool_call, context)
            elif tool_call.name == "flat_rag_search":
                result = self._execute_flat_rag_search(tool_call, context)
            elif tool_call.name == "schedule2_navigation":
                result = self._execute_schedule2_navigation(tool_call, context)
            elif tool_call.name == "exact_legal_lookup":
                result = self._execute_exact_legal_lookup(tool_call, context)
            elif tool_call.name == "submit_answer":
                result, submission, submission_action = self._execute_submit_answer(tool_call, context)
            else:
                result = build_tool_result(
                    tool_call_id=tool_call.call_id,
                    status="invalid_request",
                    data={},
                    duration_ms=0,
                    error={"code": "UNKNOWN_TOOL", "message": f"Unknown tool: {tool_call.name}"},
                )
        except ToolExecutionError as exc:
            result = build_tool_result(
                tool_call_id=tool_call.call_id,
                status="error",
                data={},
                duration_ms=0,
                error={"code": exc.code, "message": exc.message},
            )
        except Exception:
            logger.exception("Unexpected error executing tool %s", tool_call.name)
            result = build_tool_result(
                tool_call_id=tool_call.call_id,
                status="error",
                data={},
                duration_ms=0,
                error={"code": "INTERNAL_ERROR", "message": "Internal tool execution error"},
            )

        duration_ms = (time.perf_counter() - start) * 1000.0
        # Update duration in result
        result = result.model_copy(update={"meta": result.meta.model_copy(update={"duration_ms": duration_ms})})

        context.tool_outputs.append(result)

        return ToolCallResult(
            tool_call_id=tool_call.call_id,
            tool_name=tool_call.name,
            result=result,
            duration_ms=duration_ms,
            submission=submission,
            submission_action=submission_action,
            execution_started=tool_call.call_id in context.execution_started_tool_call_ids,
        )

    @staticmethod
    def _budget_denied(
        *, tool_call: ToolCallRequest, code: str, message: str, data: dict[str, Any]
    ) -> ToolResultEnvelope:
        return build_tool_result(
            tool_call_id=tool_call.call_id,
            status="partial",
            data=data,
            duration_ms=0,
            error={"code": code, "message": message},
        )

    def _execute_schedule2_navigation(
        self,
        tool_call: ToolCallRequest,
        context: ToolExecutorContext,
    ) -> ToolResultEnvelope:
        if context.schedule2_navigation_call_count >= context.max_schedule2_navigation_calls:
            context.schedule2_navigation_denied_call_count += 1
            return self._budget_denied(
                tool_call=tool_call,
                code="SCHEDULE2_NAVIGATION_BUDGET_EXHAUSTED",
                message=(
                    "Schedule-2 navigation execution budget exhausted for this turn."
                ),
                data={"navigation_only": True, "results": [], "denied_reason": "PER_TURN_LIMIT"},
            )
        if context.schedule2_navigation_map is None:
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="unavailable",
                data={"navigation_only": True, "results": [], "evidence_refs": []},
                duration_ms=0,
                error={"code": "SCHEDULE2_NAVIGATION_NOT_AVAILABLE", "message": "Schedule-2 navigation is not available in this configuration"},
            )
        try:
            request = Schedule2NavigationBatchRequest(**tool_call.arguments)
            from app.services.schedule2_navigation_service import Schedule2NavigationService
            service = Schedule2NavigationService(context.schedule2_navigation_map)
        except Exception as exc:
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="invalid_request",
                data={"navigation_only": True, "results": [], "evidence_refs": []},
                duration_ms=0,
                error={"code": "INVALID_SCHEDULE2_NAVIGATION_REQUEST", "message": str(exc)},
            )

        # The allowance is consumed only once the adapter and deterministic
        # request validation have succeeded and execution is about to begin.
        context.schedule2_navigation_call_count += 1
        context.execution_started_tool_call_ids.add(tool_call.call_id)
        try:
            data = service.query(request)
            context.schedule2_navigation_target_count += sum(
                len(item.get("edges", [])) + len(item.get("targets", [])) + len(item.get("matches", []))
                for item in data.get("results", [])
                if isinstance(item, dict)
            )
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="ok",
                data=data,
                duration_ms=0,
            )
        except Exception as exc:
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="error",
                data={"navigation_only": True, "results": [], "evidence_refs": []},
                duration_ms=0,
                error={"code": "SCHEDULE2_NAVIGATION_ERROR", "message": str(exc)},
            )

    def _execute_exact_legal_lookup(
        self,
        tool_call: ToolCallRequest,
        context: ToolExecutorContext,
    ) -> ToolResultEnvelope:
        if context.exact_legal_lookup_call_count >= context.max_exact_legal_lookup_calls:
            context.exact_legal_lookup_denied_call_count += 1
            context.exact_lookup_requests.append(
                _summarize_exact_lookup_attempt(tool_call)
            )
            return self._budget_denied(
                tool_call=tool_call,
                code="EXACT_LEGAL_LOOKUP_BUDGET_EXHAUSTED",
                message="Exact legal lookup execution budget exhausted for this turn.",
                data={"lookups": [], "denied_reason": "PER_TURN_LIMIT"},
            )
        if context.exact_legal_lookup_service is None and context.db_session is None:
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="unavailable",
                data={"lookups": []},
                duration_ms=0,
                error={"code": "EXACT_LEGAL_LOOKUP_NOT_AVAILABLE", "message": "Exact legal lookup requires the request database context"},
            )
        try:
            raw_requests = tool_call.arguments.get("requests")
            if not isinstance(raw_requests, list) or len(raw_requests) > 8:
                return build_tool_result(
                    tool_call_id=tool_call.call_id,
                    status="invalid_request",
                    data={"lookups": []},
                    duration_ms=0,
                    error={
                        "code": "INVALID_EXACT_LEGAL_LOOKUP_REQUEST",
                        "message": "requests must be a list containing at most 8 items",
                    },
                )
            usable_requests = []
            skipped_empty_count = 0
            for raw_item in raw_requests:
                if _has_usable_exact_locator(raw_item):
                    usable_requests.append(raw_item)
                else:
                    skipped_empty_count += 1
            if skipped_empty_count:
                context.exact_invalid_empty_request_count += skipped_empty_count
                context.exact_no_usable_locator_count += 1
            if not usable_requests:
                return build_tool_result(
                    tool_call_id=tool_call.call_id,
                    status="partial",
                    data={
                        "lookups": [],
                        "skipped_empty_locator_count": skipped_empty_count,
                        "denied_reason": "NO_USABLE_EXACT_LOCATOR",
                    },
                    duration_ms=0,
                    warnings=["EXACT_INVALID_EMPTY_LOCATOR"] if skipped_empty_count else [],
                    error={
                        "code": "EXACT_NO_USABLE_LOCATOR",
                        "message": "No usable legal locator was supplied; no exact retrieval was performed",
                    },
                )
            try:
                batch = ExactLegalLookupBatchRequest(requests=usable_requests)
            except Exception as exc:
                return build_tool_result(
                    tool_call_id=tool_call.call_id,
                    status="invalid_request",
                    data={"lookups": []},
                    duration_ms=0,
                    error={"code": "INVALID_EXACT_LEGAL_LOOKUP_REQUEST", "message": str(exc)},
                )
            if context.as_of_date is None:
                return build_tool_result(
                    tool_call_id=tool_call.call_id,
                    status="unavailable",
                    data={"lookups": []},
                    duration_ms=0,
                    error={"code": "EXACT_LOOKUP_DATE_UNAVAILABLE", "message": "The request as-of date is unavailable"},
                )
            if context.exact_legal_lookup_service is None:
                from app.services.exact_legal_source_service import ExactLegalSourceService

                service = ExactLegalSourceService(context.db_session)
            else:
                service = context.exact_legal_lookup_service
            lookups = []
            skipped_normalization_count = 0
            execution_counted = False
            for index, item in enumerate(batch.requests):
                from app.services.exact_lookup_locator_normalizer import (
                    expand_exact_lookup_item,
                )

                try:
                    normalized_items = expand_exact_lookup_item(
                        item,
                        as_of_date=context.as_of_date,
                    )
                except ValueError as exc:
                    # Some structurally non-empty model objects still lose all
                    # legal identity during bounded normalization (for example,
                    # a locator type with no provision or target). Treat only
                    # that deterministic empty outcome as a skipped locator;
                    # preserve all other malformed-request failures.
                    if "at least one query or locator field is required" not in str(exc):
                        raise
                    skipped_normalization_count += 1
                    context.exact_invalid_empty_request_count += 1
                    context.exact_no_usable_locator_count += 1
                    context.exact_lookup_requests.append({
                        "normalization_status": "skipped_empty",
                        "request_index": index,
                        "expanded_index": 0,
                        "tool_call_id": tool_call.call_id,
                        "result": {"error_code": "EXACT_NO_USABLE_LOCATOR"},
                    })
                    continue
                for expanded_index, normalized in enumerate(normalized_items):
                    if not execution_counted:
                        # Count the invocation at the first real lookup. Empty,
                        # malformed, unavailable, and normalization-only calls
                        # therefore leave the allowance untouched.
                        context.exact_legal_lookup_call_count += 1
                        context.execution_started_tool_call_ids.add(tool_call.call_id)
                        execution_counted = True
                    context.exact_lookup_requested_locator_count += 1
                    output = service.lookup(
                        normalized.request,
                        registry=context.registry,
                        # Keep each batched lookup's registry outcome isolated.
                        # The outer tool call remains the model-visible identity;
                        # this deterministic suffix is backend-only provenance.
                        tool_call_id=(
                            f"{tool_call.call_id}:locator:{index}"
                            if len(normalized_items) == 1
                            else f"{tool_call.call_id}:locator:{index}:{expanded_index}"
                        ),
                    )
                    # These counters describe requested canonical locators, not
                    # cross-reference state.  A successful locator with an
                    # unresolved dependency remains resolved here.
                    if output.matches:
                        context.exact_lookup_resolved_locator_count += 1
                    else:
                        context.exact_lookup_unresolved_locator_count += 1
                    context.exact_lookup_unresolved_cross_reference_count += len(
                        output.unresolved_cross_references
                    )
                    request_trace = dict(normalized.trace)
                    request_trace.update({
                        "request_index": index,
                        "expanded_index": expanded_index,
                        "tool_call_id": tool_call.call_id,
                        "registry_tool_call_id": (
                            f"{tool_call.call_id}:locator:{index}"
                            if len(normalized_items) == 1
                            else f"{tool_call.call_id}:locator:{index}:{expanded_index}"
                        ),
                        "as_of_date": context.as_of_date.isoformat(),
                        "result": {
                            "coverage": output.coverage.model_dump(mode="json"),
                            "matches_count": len(output.matches),
                            "resolved_cross_references_count": len(output.resolved_cross_references),
                            "unresolved_cross_references_count": len(output.unresolved_cross_references),
                            "provision_block_complete": output.provision_block_complete,
                            "provision_block_backend_cap_reached": (
                                output.provision_block_backend_cap_reached
                            ),
                            "corpus_version": output.corpus_version,
                            "index_version": output.index_version,
                        },
                    })
                    context.exact_lookup_requests.append(request_trace)
                    lookups.append(output.model_dump(mode="json"))
            if not lookups and skipped_normalization_count:
                return build_tool_result(
                    tool_call_id=tool_call.call_id,
                    status="partial",
                    data={
                        "lookups": [],
                        "skipped_empty_locator_count": skipped_empty_count,
                        "skipped_normalization_count": skipped_normalization_count,
                        "denied_reason": "NO_USABLE_EXACT_LOCATOR",
                    },
                    duration_ms=0,
                    warnings=["EXACT_INVALID_EMPTY_LOCATOR"],
                    error={
                        "code": "EXACT_NO_USABLE_LOCATOR",
                        "message": "No usable legal locator remained after deterministic normalization",
                    },
                )
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="ok",
                data={
                    "lookups": lookups,
                    "skipped_empty_locator_count": skipped_empty_count,
                    "skipped_normalization_count": skipped_normalization_count,
                },
                duration_ms=0,
                warnings=["EXACT_INVALID_EMPTY_LOCATOR"] if skipped_empty_count else [],
            )
        except Exception as exc:
            logger.exception("Exact legal lookup failed")
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="error",
                data={"lookups": []},
                duration_ms=0,
                error={"code": "EXACT_LEGAL_LOOKUP_ERROR", "message": str(exc)},
            )

    def _execute_deterministic_utility(
        self,
        tool_call: ToolCallRequest,
        context: ToolExecutorContext,
    ) -> ToolResultEnvelope:
        """Execute deterministic_utility tool."""
        try:
            request = DeterministicUtilityRequest(**tool_call.arguments)
            output = execute_utility(request)
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="ok",
                data=output.model_dump(mode="json"),
                duration_ms=0,
            )
        except Exception as exc:
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="invalid_request",
                data={},
                duration_ms=0,
                error={"code": "INVALID_UTILITY_REQUEST", "message": str(exc)},
            )

    def _execute_flat_rag_search(
        self,
        tool_call: ToolCallRequest,
        context: ToolExecutorContext,
    ) -> ToolResultEnvelope:
        """Execute the existing flat_rag_search tool when injected."""
        if context.flat_rag_search_fn is None:
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="unavailable",
                data={},
                duration_ms=0,
                error={"code": "FLAT_RAG_NOT_AVAILABLE", "message": "Flat RAG search is not available in this configuration"},
            )

        try:
            query = tool_call.arguments.get("query", "")
            top_k = tool_call.arguments.get("top_k")

            # Privacy check on query
            privacy_result = context.privacy_guard.check_query(query)
            if not privacy_result.allowed:
                return build_tool_result(
                    tool_call_id=tool_call.call_id,
                    status="invalid_request",
                    data={},
                    duration_ms=0,
                    error={"code": "PII_IN_QUERY", "message": "Search query contains prohibited personal information"},
                )

            context.execution_started_tool_call_ids.add(tool_call.call_id)
            result = context.flat_rag_search_fn(
                query=query,
                registry=context.registry,
                tool_call_id=tool_call.call_id,
                top_k=top_k,
            )

            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="ok",
                data={
                    "chunks": result.chunks,
                    "evidence_refs": result.evidence_refs,
                },
                duration_ms=result.duration_ms,
            )
        except Exception as exc:
            logger.exception("Flat RAG search failed")
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="error",
                data={},
                duration_ms=0,
                error={"code": "FLAT_RAG_ERROR", "message": str(exc)},
            )

    def _execute_submit_answer(
        self,
        tool_call: ToolCallRequest,
        context: ToolExecutorContext,
    ) -> tuple[ToolResultEnvelope, AgentSubmissionV2 | None, TerminalSubmissionAction | None]:
        """Execute submit_answer terminal tool.

        Validates mechanical submission/evidence integrity and records semantic
        evidence diagnostics for the compact checker. It does not make semantic
        evidence suitability a terminal integrity rejection.
        """
        try:
            args = dict(tool_call.arguments)
            _normalize_recoverable_submission_fields(args)
            reconciliation = _reconcile_submission_evidence(args, context)
            contract_diagnostics = _submission_contract_diagnostics(args, context)
            contract_diagnostics.update(reconciliation)
            if context.lightweight_submission:
                _strip_lightweight_evidence_bookkeeping(args)
            canonical_ref_error = _reject_model_canonical_refs(
                args=args,
                context=context,
            )
            if canonical_ref_error is not None:
                return self._reject_submission(
                    tool_call=tool_call,
                    context=context,
                    errors=[canonical_ref_error],
                    contract_diagnostics=contract_diagnostics,
                )
            normalized_claims, span_errors = _normalize_claim_spans(
                draft=args.get("draft_markdown"),
                claims=args.get("claims"),
            )
            if span_errors:
                _add_submission_error_diagnostics(contract_diagnostics, span_errors)
                return self._reject_submission(
                    tool_call=tool_call,
                    context=context,
                    errors=span_errors,
                    contract_diagnostics=contract_diagnostics,
                )
            args["claims"] = normalized_claims

            # v2.1.2: resolve transient NativeWebLocators (same-request
            # provider-observed URLs) into canonical web:<opaque> refs BEFORE
            # canonical AgentSubmissionV2 construction.  This is deterministic
            # canonicalization, not a terminal-summission correction.
            locator_error = self._resolve_native_web_locators(
                args=args,
                context=context,
            )
            for category, count in context.native_web_locator_resolution_categories.items():
                contract_diagnostics[f"native_web_locator_{category}_count"] = count
            if locator_error is not None:
                _add_submission_error_diagnostics(
                    contract_diagnostics,
                    [locator_error],
                )
                return self._reject_submission(
                    tool_call=tool_call,
                    context=context,
                    errors=[locator_error],
                    contract_diagnostics=contract_diagnostics,
                )

            try:
                submission = AgentSubmissionV2(**args)
            except ValidationError as exc:
                for error in exc.errors():
                    _record_submission_schema_error(
                        contract_diagnostics,
                        location=error.get("loc"),
                        error_type=error.get("type"),
                    )
                return self._reject_submission(
                    tool_call=tool_call,
                    context=context,
                    errors=[
                        SubmissionError(
                            code="SUBMISSION_SCHEMA_INVALID",
                            field="submission",
                        )
                    ],
                    contract_diagnostics=contract_diagnostics,
                )
            except (TypeError, ValueError):
                _record_submission_schema_error(
                    contract_diagnostics,
                    location="submission",
                    error_type="value_error",
                )
                return self._reject_submission(
                    tool_call=tool_call,
                    context=context,
                    errors=[
                        SubmissionError(
                            code="SUBMISSION_SCHEMA_INVALID",
                            field="submission",
                        )
                    ],
                    contract_diagnostics=contract_diagnostics,
                )

            if any(
                claim.claim_type in {"current_fact", "legal_rule", "legal_application"}
                and claim.materiality == "decisive"
                for claim in submission.claims
            ):
                context.repair_requires_evidence = True

            if (
                context.repair_requires_evidence
                and context.terminal_record.correction_count > 0
                and not submission.claims
                and (submission.citations or submission.research_status == "complete")
            ):
                return self._reject_submission(
                    tool_call=tool_call,
                    context=context,
                    errors=[
                        SubmissionError(
                            code="REPAIR_REMOVED_REQUIRED_CLAIMS",
                            field="claims",
                        )
                    ],
                    contract_diagnostics=contract_diagnostics,
                )

            # Validate against registry
            validator = AgentSubmissionValidator(context.registry)
            validation_result = validator.validate(
                submission,
                # Nested/overlapping addressable spans are a mechanical shape
                # emitted by the answer model, not a semantic contradiction.
                # Keep the established lightweight Arm-L behavior and apply the
                # same safe normalization to Arm-N; impossible spans remain
                # rejected by the validator and AgentSubmissionV2 schema.
                allow_overlapping_claims=(
                    context.lightweight_submission
                    or context.allow_overlapping_claims
                ),
            )

            if not validation_result.valid:
                # Invalid submission
                _add_submission_error_diagnostics(
                    contract_diagnostics,
                    validation_result.errors,
                )
                _action = context.terminal_policy.handle_invalid_submission(
                    context.terminal_record,
                    errors=[e.code for e in validation_result.errors],
                    deadline_remaining_ms=(
                        context.deadline_monotonic
                        and max(0.0, (context.deadline_monotonic - time.monotonic()) * 1000.0)
                    ),
                )

                rejected = SubmitAnswerRejected(
                    accepted=False,
                    submission_id=None,
                    postcondition_status="failed",
                    errors=validation_result.errors,
                )

                rejected_data = self._rejection_data(
                    rejected=rejected,
                    context=context,
                    contract_diagnostics=contract_diagnostics,
                )

                return build_tool_result(
                    tool_call_id=tool_call.call_id,
                    status="invalid_request",
                    data=rejected_data,
                    duration_ms=0,
                    error={"code": "SUBMISSION_INVALID", "message": "Submission validation failed"},
                ), submission, _action

            if context.residual_branch_guard_enabled:
                residual_guard = evaluate_applicability_guard(
                    submission,
                    context.registry,
                )
                context.residual_branch_guard_trigger_count += residual_guard.trigger_count
                context.applicability_resolution_count += (
                    residual_guard.applicability_resolution_count
                )
                context.unresolved_applicability_count += residual_guard.unresolved_count
                if not residual_guard.valid:
                    context.residual_branch_submission_rejection_count += 1
                    return self._reject_submission(
                        tool_call=tool_call,
                        context=context,
                        errors=residual_guard.errors,
                        contract_diagnostics=contract_diagnostics,
                    )

            # Run evidence postcondition
            postcondition = EvidencePostconditionService(context.registry)
            postcondition_result = postcondition.evaluate(
                submission,
                as_of_date=context.as_of_date or submission.as_of_date,
            )

            if postcondition_result.status == "failed":
                # v2.1.3: semantic evidence suitability is checker input, not
                # terminal integrity rejection. Schema, identity, spans, and
                # citation validation already passed above.
                _action = context.terminal_policy.handle_valid_submission(
                    context.terminal_record
                )
                accepted = SubmitAnswerAccepted(
                    accepted=True,
                    submission_id=str(uuid4()),
                    postcondition_status="integrity_passed",
                    errors=[],
                )
                return build_tool_result(
                    tool_call_id=tool_call.call_id,
                    status="ok",
                    data={
                        **accepted.model_dump(mode="json"),
                        "terminal_contract_diagnostics": contract_diagnostics,
                        "postcondition_diagnostics": _postcondition_diagnostics(
                            postcondition_result
                        ),
                        "semantic_review_required": True,
                    },
                    duration_ms=0,
                ), submission, _action

            # Valid submission
            _action = context.terminal_policy.handle_valid_submission(context.terminal_record)

            accepted = SubmitAnswerAccepted(
                accepted=True,
                submission_id=str(uuid4()),
                postcondition_status=postcondition_result.status,
                errors=[],
            )

            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="ok",
                data={
                    **accepted.model_dump(mode="json"),
                    "terminal_contract_diagnostics": contract_diagnostics,
                },
                duration_ms=0,
            ), submission, _action

        except Exception as exc:
            logger.exception("submit_answer execution failed")
            return build_tool_result(
                tool_call_id=tool_call.call_id,
                status="error",
                data={},
                duration_ms=0,
                error={"code": "SUBMIT_ANSWER_ERROR", "message": str(exc)},
            ), None, None

    def _resolve_native_web_locators(
        self,
        *,
        args: dict[str, Any],
        context: ToolExecutorContext,
    ) -> SubmissionError | None:
        """Resolve transient NativeWebLocators into canonical web:<opaque> refs.

        Deterministic same-request canonicalization performed BEFORE canonical
        AgentSubmissionV2 construction and validation.  NOT a correction; does
        not consume the repair allowance.
        """
        resolver = NativeWebLocatorResolver(context.registry)
        context.native_web_locator_resolution_categories = {}

        def record_resolution(resolution: Any) -> None:
            for category, count in resolution.match_category_counts.items():
                context.native_web_locator_resolution_categories[category] = (
                    context.native_web_locator_resolution_categories.get(category, 0)
                    + count
                )

        claims = args.get("claims")
        if isinstance(claims, list):
            for i, claim in enumerate(claims):
                if not isinstance(claim, dict):
                    continue
                locators = claim.get("native_web_locators")
                if not locators:
                    continue
                # evidence_refs absent -> treat as [] for locator merge;
                # present-but-not-list -> never silently repair.
                existing = claim.get("evidence_refs")
                if existing is None:
                    existing = []
                elif not isinstance(existing, list):
                    return SubmissionError(code="SUBMISSION_SCHEMA_INVALID",
                                           field=f"claims.{i}.evidence_refs")
                resolution = resolver.resolve(locators)
                record_resolution(resolution)
                if resolution.schema_invalid_count > 0:
                    return SubmissionError(code=LOCATOR_SCHEMA_INVALID,
                                           field=f"claims.{i}.native_web_locators")
                if resolution.rejected or resolution.resolved_count != len(locators):
                    codes = resolution.rejection_codes or ["NATIVE_WEB_LOCATOR_NOT_OBSERVED"]
                    return SubmissionError(code=codes[0], field=f"claims.{i}.native_web_locators")
                resolved_refs = list(resolution.resolved.values())
                claim["evidence_refs"] = _dedup_ordered(list(existing) + resolved_refs)
                del claim["native_web_locators"]

        citations = args.get("citations")
        if isinstance(citations, list):
            for i, citation in enumerate(citations):
                if not isinstance(citation, dict):
                    continue
                has_ref = bool(citation.get("evidence_ref"))
                has_locator = bool(citation.get("native_web_locator"))
                if not has_ref and not has_locator:
                    return SubmissionError(code="CITATION_EVIDENCE_MISSING", field=f"citations.{i}")
                if has_ref and has_locator:
                    return SubmissionError(code="CITATION_EVIDENCE_AMBIGUOUS", field=f"citations.{i}")
                if not has_locator:
                    continue
                res = resolver.resolve([citation.get("native_web_locator")])
                record_resolution(res)
                if res.schema_invalid_count > 0:
                    return SubmissionError(code=LOCATOR_SCHEMA_INVALID,
                                           field=f"citations.{i}.native_web_locator")
                if res.rejected or res.resolved_count != 1:
                    codes = res.rejection_codes or ["NATIVE_WEB_LOCATOR_NOT_OBSERVED"]
                    return SubmissionError(code=codes[0], field=f"citations.{i}.native_web_locator")
                citation["evidence_ref"] = list(res.resolved.values())[0]
                del citation["native_web_locator"]
        return None

    def _reject_submission(
        self,
        *,
        tool_call: ToolCallRequest,
        context: ToolExecutorContext,
        errors: list[SubmissionError],
        contract_diagnostics: dict[str, int] | None = None,
    ) -> tuple[ToolResultEnvelope, AgentSubmissionV2 | None, TerminalSubmissionAction | None]:
        """Return a bounded structured rejection and consume one repair allowance."""
        action = context.terminal_policy.handle_invalid_submission(
            context.terminal_record,
            errors=[error.code for error in errors],
            deadline_remaining_ms=(
                context.deadline_monotonic
                and max(0.0, (context.deadline_monotonic - time.monotonic()) * 1000.0)
            ),
        )
        rejected = SubmitAnswerRejected(
            accepted=False,
            submission_id=None,
            postcondition_status="failed",
            errors=errors,
        )
        return (
            build_tool_result(
                tool_call_id=tool_call.call_id,
                status="invalid_request",
                data=self._rejection_data(
                    rejected=rejected,
                    context=context,
                    contract_diagnostics=contract_diagnostics,
                ),
                duration_ms=0,
                error={
                    "code": "SUBMISSION_INVALID",
                    "message": "Submission validation failed",
                },
            ),
            None,
            action,
        )

    @staticmethod
    def _rejection_data(
        *,
        rejected: SubmitAnswerRejected,
        context: ToolExecutorContext,
        contract_diagnostics: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        """Add genuine request-scoped evidence to a bounded repair response."""
        data = rejected.model_dump(mode="json")
        if contract_diagnostics is not None:
            data["terminal_contract_diagnostics"] = contract_diagnostics
        refs = context.registry.get_all_refs()
        if context.allow_model_canonical_refs:
            data["available_evidence_refs"] = refs
        web_evidence: list[dict[str, Any]] = []
        for ref in context.registry.get_refs_by_origin("openai_web_native"):
            try:
                evidence = context.registry.resolve_evidence(ref)
            except Exception:
                continue
            if context.allow_model_canonical_refs:
                web_evidence.append({
                    "evidence_ref": ref,
                    "url": evidence.url,
                    "title": evidence.title,
                    "search_call_id": evidence.search_call_id,
                    "provenance_complete": evidence.provenance_complete,
                    "native_web_citation": (
                        evidence.native_web_citation.model_dump(mode="json")
                        if evidence.native_web_citation is not None
                        else None
                    ),
                })
        if context.allow_model_canonical_refs:
            data["available_native_web_evidence"] = web_evidence
        data["repair_instruction"] = (
            "Use backend-verified available evidence for decisive claims. "
            "Controlling legal claims require suitable controlling authority; "
            "source-only native web evidence does not become exact-text evidence. "
            "You may supply a provider-observed same-request URL via "
            "native_web_locators for built-in web_search sources; the backend "
            "verifies and converts it to a canonical web:<opaque> ref. If suitable "
            "verified evidence is unavailable, submit an evidence-insufficient or "
            "incomplete answer rather than inventing evidence."
        )
        if any(
            error.code == "APPLICABILITY_EVIDENCE_UNRESOLVED"
            for error in rejected.errors
        ):
            data["repair_instruction"] += (
                " The decisive legal branch depends on a legal classification or "
                "applicability dependency that is not grounded in authoritative "
                "evidence. Resolve that dependency and provide the structured "
                "applicability evidence before resubmitting."
            )
        if not context.allow_model_canonical_refs:
            data["repair_instruction"] = (
                "This Arm-A run has no model-visible canonical evidence refs. "
                "Use only provider-observed native_web_locators for web sources; "
                "do not furnish evidence_refs or citation evidence_ref values. "
                "The backend resolves observed locators in this request. If "
                "suitable evidence is unavailable, submit an incomplete answer."
            )
        return data

    def handle_missing_submission(
        self,
        context: ToolExecutorContext,
    ) -> TerminalSubmissionAction:
        """Handle provider completion without submit_answer.

        Returns action indicating whether continuation is allowed.
        """
        deadline_remaining = (
            max(0.0, (context.deadline_monotonic - time.monotonic()) * 1000.0)
            if context.deadline_monotonic is not None
            else None
        )
        return context.terminal_policy.handle_missing_submission(
            context.terminal_record,
            deadline_remaining_ms=deadline_remaining,
        )

    def handle_second_miss(
        self,
        context: ToolExecutorContext,
    ) -> TerminalSubmissionAction:
        """Handle second missing/invalid submission."""
        return context.terminal_policy.handle_second_miss(context.terminal_record)


def create_tool_executor_service() -> ToolExecutorService:
    """Create a new tool executor service."""
    return ToolExecutorService()
