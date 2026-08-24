"""Isolated Phase 6 evidence-only checker and non-serving filter preview.

This module intentionally does not import or activate the legacy compact
checker.  It makes one provider request, accepts one structured Phase 6 result,
and produces a deterministic filter plan without mutating a customer answer.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from app.schemas.agent import AgentCitation
from app.schemas.checker import (
    Phase6CheckerInput,
    Phase6CheckerResult,
    Phase6CheckerVerdict,
    Phase6MaterialClaim,
)
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.compact_checker_contract_service import (
    Phase6CheckerContractError,
    validate_phase6_checker_result,
)


PHASE6_CHECKER_TOOL_NAME = "submit_phase6_checker_result"

PHASE6_CHECKER_RESULT_TOOL = {
    "type": "function",
    "name": PHASE6_CHECKER_TOOL_NAME,
    "description": (
        "Return exactly one structured KEEP, FLAG, or BLOCK verdict for every "
        "supplied material claim using only the supplied checker packet."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "schema_version": {
                "type": "string",
                "enum": ["phase6_checker.result.v1"],
            },
            "decisions": {
                "type": "array",
                "minItems": 1,
                "maxItems": 100,
                "items": {
                    "type": "object",
                    "properties": {
                        "claim_id": {"type": "string", "minLength": 1, "maxLength": 100},
                        "verdict": {"type": "string", "enum": ["KEEP", "FLAG", "BLOCK"]},
                        "reason_codes": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 8,
                            "items": {
                                "type": "string",
                                "enum": [
                                    "SUPPORTED",
                                    "INSUFFICIENT_SUPPORT",
                                    "APPLICABILITY_UNCLEAR",
                                    "AUTHORITY_WEAK_OR_MISMATCHED",
                                    "POSSIBLY_STALE",
                                    "OVERSTATED",
                                    "CONTRADICTED_BY_APPLICABLE_EVIDENCE",
                                ],
                            },
                        },
                        "supporting_evidence_refs": {
                            "type": "array",
                            "maxItems": 30,
                            "items": {"type": "string"},
                        },
                    },
                    "required": [
                        "claim_id",
                        "verdict",
                        "reason_codes",
                        "supporting_evidence_refs",
                    ],
                    "additionalProperties": False,
                },
            },
            "material_omission_suspected": {"type": "boolean"},
            "material_omission_evidence_refs": {
                "type": "array",
                "maxItems": 30,
                "items": {"type": "string"},
            },
            "escalate": {"type": "boolean"},
        },
        "required": [
            "schema_version",
            "decisions",
            "material_omission_suspected",
            "material_omission_evidence_refs",
            "escalate",
        ],
        "additionalProperties": False,
    },
}


PHASE6_CHECKER_SYSTEM_PROMPT = """You are a conservative evidence-only legal-claim checker for an Australian immigration assistant.

The answer/research stage is already complete. You may use ONLY the supplied Phase6 checker packet. You may NOT search, retrieve, browse, call legal tools, infer missing source content, invent evidence, invent a URL, invent legal authority, or write a replacement answer.

For every supplied claim return exactly one structured verdict.

KEEP: The existing proposition is adequately supported and applicable on the supplied evidence. KEEP uses exactly the SUPPORTED reason code.

FLAG: There is a material weakness, uncertainty, applicability issue, authority problem, possible staleness, insufficiency, or overstatement, but the supplied evidence does not justify destructive intervention. When uncertain, use FLAG rather than BLOCK.

BLOCK: Use only when strong applicable evidence in the packet clearly contradicts the material proposition or makes it indefensible. A BLOCK requires packet evidence with backend-held source text. There is no reward for intervention.

Missing document version, effective-date metadata, canonical URL, or local coverage alone is never enough for BLOCK. Different dates, visa streams, transitional regimes, factual branches, and legal source roles must not be collapsed into contradictions.

MATERIAL_OMISSION_SUSPECTED may be true only where evidence already in the packet indicates a potentially omitted material branch. Do not research or write that branch.

Return only the structured checker result. Do not provide chain-of-thought."""


@dataclass(slots=True)
class Phase6CheckerFilterPlan:
    directly_blocked_claim_ids: list[str] = field(default_factory=list)
    dependency_blocked_claim_ids: list[str] = field(default_factory=list)
    flagged_claim_ids: list[str] = field(default_factory=list)
    delete_spans: list[tuple[int, int]] = field(default_factory=list)
    safe_to_apply: bool = True
    failure_reason: str | None = None


@dataclass(slots=True)
class Phase6PreviewCandidate:
    draft_markdown: str
    material_claims: list[Phase6MaterialClaim]
    citations: list[AgentCitation]


@dataclass(slots=True)
class Phase6CheckerRunResult:
    status: Literal["completed", "failed"]
    checker_result: Phase6CheckerResult | None
    filter_plan: Phase6CheckerFilterPlan | None
    duration_ms: float
    model: str
    reasoning_effort: str | None
    provider_call_count: int
    provider_response_id: str | None = None
    provider_status: str | None = None
    provider_duration_ms: float = 0.0
    timeout_allocated_ms: float = 0.0
    input_tokens: int | None = None
    cached_input_tokens: int | None = None
    reasoning_tokens: int | None = None
    output_tokens: int | None = None
    native_web_search_call_count: int = 0
    native_web_source_count: int = 0
    native_web_citation_count: int = 0
    returned_tool_call_count: int = 0
    returned_tool_names: list[str] = field(default_factory=list)
    error_code: str | None = None
    error: str | None = None


def _failure(
    *,
    started: float,
    model: str,
    reasoning_effort: str | None,
    provider_call_count: int,
    error_code: str,
    error: str,
    provider_response: Any | None = None,
    timeout_allocated_ms: float = 0.0,
) -> Phase6CheckerRunResult:
    returned_tools = list(getattr(provider_response, "tool_calls", []) or [])
    return Phase6CheckerRunResult(
        status="failed",
        checker_result=None,
        filter_plan=None,
        duration_ms=(time.perf_counter() - started) * 1000.0,
        model=model,
        reasoning_effort=reasoning_effort,
        provider_call_count=provider_call_count,
        provider_response_id=getattr(provider_response, "response_id", None),
        provider_status=getattr(provider_response, "status", None),
        provider_duration_ms=float(getattr(provider_response, "duration_ms", 0.0) or 0.0),
        timeout_allocated_ms=timeout_allocated_ms,
        input_tokens=getattr(provider_response, "input_tokens", None),
        cached_input_tokens=getattr(provider_response, "cached_input_tokens", None),
        reasoning_tokens=getattr(provider_response, "reasoning_tokens", None),
        output_tokens=getattr(provider_response, "output_tokens", None),
        native_web_search_call_count=int(
            getattr(provider_response, "native_web_search_call_count", 0) or 0
        ),
        native_web_source_count=int(getattr(provider_response, "native_web_source_count", 0) or 0),
        native_web_citation_count=int(
            getattr(provider_response, "native_web_citation_count", 0) or 0
        ),
        returned_tool_call_count=len(returned_tools),
        returned_tool_names=[str(getattr(tool, "name", "")) for tool in returned_tools],
        error_code=error_code,
        error=error,
    )


def _validate_block_text_grounding(
    checker_input: Phase6CheckerInput,
    checker_result: Phase6CheckerResult,
) -> None:
    evidence_by_ref = {item.evidence_ref: item for item in checker_input.evidence}
    for decision in checker_result.decisions:
        if decision.verdict != Phase6CheckerVerdict.BLOCK:
            continue
        grounded = any(
            evidence_by_ref[ref].text is not None
            and bool(evidence_by_ref[ref].text.strip())
            and evidence_by_ref[ref].authority_kind != "derived_relationship"
            for ref in decision.supporting_evidence_refs
        )
        if not grounded:
            raise Phase6CheckerContractError(
                "BLOCK requires backend-held source text in supporting packet evidence"
            )


def _merge_spans(spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not spans:
        return []
    merged: list[tuple[int, int]] = []
    for start, end in sorted(spans):
        if not merged or start > merged[-1][1]:
            merged.append((start, end))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
    return merged


def _build_filter_plan_unvalidated(
    checker_input: Phase6CheckerInput,
    checker_result: Phase6CheckerResult,
) -> Phase6CheckerFilterPlan:
    claims_by_id = {claim.claim_id: claim for claim in checker_input.material_claims}
    decisions_by_id = {decision.claim_id: decision for decision in checker_result.decisions}
    directly_blocked = sorted(
        claim_id
        for claim_id, decision in decisions_by_id.items()
        if decision.verdict == Phase6CheckerVerdict.BLOCK
    )
    flagged = sorted(
        claim_id
        for claim_id, decision in decisions_by_id.items()
        if decision.verdict == Phase6CheckerVerdict.FLAG
    )
    blocked = set(directly_blocked)
    dependency_blocked: set[str] = set()
    changed = True
    while changed:
        changed = False
        for claim_id, claim in claims_by_id.items():
            if claim_id in blocked:
                continue
            if set(claim.depends_on) & blocked:
                blocked.add(claim_id)
                dependency_blocked.add(claim_id)
                changed = True

    blocked_spans = [
        (claims_by_id[claim_id].draft_start, claims_by_id[claim_id].draft_end)
        for claim_id in sorted(blocked)
    ]
    delete_spans = _merge_spans(blocked_spans)
    surviving_claims = [claim for claim_id, claim in claims_by_id.items() if claim_id not in blocked]
    for claim in surviving_claims:
        if any(start < claim.draft_end and end > claim.draft_start for start, end in delete_spans):
            return Phase6CheckerFilterPlan(
                directly_blocked_claim_ids=directly_blocked,
                dependency_blocked_claim_ids=sorted(dependency_blocked),
                flagged_claim_ids=flagged,
                delete_spans=delete_spans,
                safe_to_apply=False,
                failure_reason="blocked_span_overlaps_surviving_claim",
            )

    return Phase6CheckerFilterPlan(
        directly_blocked_claim_ids=directly_blocked,
        dependency_blocked_claim_ids=sorted(dependency_blocked),
        flagged_claim_ids=flagged,
        delete_spans=delete_spans,
    )


def build_phase6_checker_filter_plan(
    checker_input: Phase6CheckerInput,
    checker_result: Phase6CheckerResult,
) -> Phase6CheckerFilterPlan:
    """Validate a result and construct a non-serving deterministic plan."""

    validate_phase6_checker_result(checker_result, checker_input)
    _validate_block_text_grounding(checker_input, checker_result)
    return _build_filter_plan_unvalidated(checker_input, checker_result)


def _offset_after_deletions(position: int, delete_spans: list[tuple[int, int]]) -> int:
    return position - sum(end - start for start, end in delete_spans if end <= position)


def apply_phase6_filter_preview(
    checker_input: Phase6CheckerInput,
    filter_plan: Phase6CheckerFilterPlan,
    *,
    citations: list[AgentCitation] | None = None,
) -> Phase6PreviewCandidate:
    """Apply only a safe span plan; this is never called by serving runtime."""

    if not filter_plan.safe_to_apply:
        raise Phase6CheckerContractError(
            filter_plan.failure_reason or "unsafe Phase 6 filter preview"
        )

    draft = checker_input.accepted_draft.draft_markdown
    for start, end in sorted(filter_plan.delete_spans, reverse=True):
        draft = draft[:start] + draft[end:]

    blocked = set(filter_plan.directly_blocked_claim_ids) | set(
        filter_plan.dependency_blocked_claim_ids
    )
    surviving_claims: list[Phase6MaterialClaim] = []
    for claim in checker_input.material_claims:
        if claim.claim_id in blocked:
            continue
        surviving_claims.append(claim.model_copy(update={
            "draft_start": _offset_after_deletions(claim.draft_start, filter_plan.delete_spans),
            "draft_end": _offset_after_deletions(claim.draft_end, filter_plan.delete_spans),
        }))

    surviving_refs = {
        evidence_ref
        for claim in surviving_claims
        for evidence_ref in claim.evidence_refs
    }
    kept_citations = [
        citation
        for citation in citations or []
        if citation.evidence_ref in surviving_refs
    ]
    return Phase6PreviewCandidate(
        draft_markdown=draft,
        material_claims=surviving_claims,
        citations=kept_citations,
    )


class Phase6CheckerService:
    """One-call, evidence-only Phase 6 checker core."""

    async def run(
        self,
        *,
        checker_input: Phase6CheckerInput,
        provider: Any,
        deadline: AbsoluteTurnDeadline,
        checker_target_ms: int,
        model: str,
        reasoning_effort: str | None,
        registry: Any | None = None,
    ) -> Phase6CheckerRunResult:
        started = time.perf_counter()
        remaining = deadline.remaining_ms()
        if remaining <= 0:
            return _failure(
                started=started,
                model=model,
                reasoning_effort=reasoning_effort,
                provider_call_count=0,
                error_code="deadline_exhausted",
                error="checker deadline exhausted before provider call",
            )
        if checker_target_ms <= 0:
            return _failure(
                started=started,
                model=model,
                reasoning_effort=reasoning_effort,
                provider_call_count=0,
                error_code="invalid_checker_target",
                error="checker_target_ms must be positive",
            )

        packet_json = json.dumps(
            checker_input.model_dump(mode="json"),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        # Re-read the absolute deadline immediately before the sole provider
        # request so packet serialization cannot consume an unaccounted slice.
        remaining = deadline.remaining_ms()
        if remaining <= 0:
            return _failure(
                started=started,
                model=model,
                reasoning_effort=reasoning_effort,
                provider_call_count=0,
                error_code="deadline_exhausted",
                error="checker deadline exhausted before provider call",
            )
        timeout_ms = min(remaining, float(checker_target_ms))
        try:
            response = await provider.call(
                system_prompt=PHASE6_CHECKER_SYSTEM_PROMPT,
                user_text="",
                model=model,
                tools=[PHASE6_CHECKER_RESULT_TOOL],
                tool_choice={"type": "function", "name": PHASE6_CHECKER_TOOL_NAME},
                reasoning_effort=reasoning_effort,
                messages_history=[
                    {"role": "system", "content": PHASE6_CHECKER_SYSTEM_PROMPT},
                    {"role": "user", "content": packet_json},
                ],
                timeout_ms=timeout_ms,
                registry=registry,
                previous_response_id=None,
            )
        except TimeoutError as exc:
            return _failure(
                started=started, model=model, reasoning_effort=reasoning_effort,
                provider_call_count=1, error_code="provider_timeout", error=str(exc),
                timeout_allocated_ms=timeout_ms,
            )
        except Exception as exc:
            return _failure(
                started=started, model=model, reasoning_effort=reasoning_effort,
                provider_call_count=1, error_code="provider_exception", error=str(exc),
                timeout_allocated_ms=timeout_ms,
            )

        if deadline.remaining_ms() <= 0:
            return _failure(
                started=started, model=model, reasoning_effort=reasoning_effort,
                provider_call_count=1, error_code="deadline_exhausted",
                error="checker deadline exhausted after provider call",
                provider_response=response, timeout_allocated_ms=timeout_ms,
            )
        native_search_count = int(getattr(response, "native_web_search_call_count", 0) or 0)
        if native_search_count > 0:
            return _failure(
                started=started, model=model, reasoning_effort=reasoning_effort,
                provider_call_count=1, error_code="unexpected_checker_research_activity",
                error="checker provider reported native web research activity",
                provider_response=response, timeout_allocated_ms=timeout_ms,
            )
        if getattr(response, "status", None) != "ok":
            return _failure(
                started=started, model=model, reasoning_effort=reasoning_effort,
                provider_call_count=1, error_code="provider_status_not_ok",
                error="checker provider response was not ok", provider_response=response,
                timeout_allocated_ms=timeout_ms,
            )
        response_text = getattr(response, "text", None)
        if response_text is not None and (
            not isinstance(response_text, str) or response_text.strip()
        ):
            return _failure(
                started=started, model=model, reasoning_effort=reasoning_effort,
                provider_call_count=1, error_code="ordinary_prose_present",
                error="checker response must contain only the structured result tool call",
                provider_response=response,
                timeout_allocated_ms=timeout_ms,
            )
        tool_calls = list(getattr(response, "tool_calls", []) or [])
        if len(tool_calls) != 1:
            return _failure(
                started=started, model=model, reasoning_effort=reasoning_effort,
                provider_call_count=1, error_code="result_tool_call_count_invalid",
                error="checker must return exactly one result tool call", provider_response=response,
                timeout_allocated_ms=timeout_ms,
            )
        tool_call = tool_calls[0]
        if getattr(tool_call, "name", None) != PHASE6_CHECKER_TOOL_NAME:
            return _failure(
                started=started, model=model, reasoning_effort=reasoning_effort,
                provider_call_count=1, error_code="wrong_result_tool",
                error="checker returned an unrelated tool", provider_response=response,
                timeout_allocated_ms=timeout_ms,
            )
        arguments = getattr(tool_call, "arguments", None)
        if not isinstance(arguments, dict):
            return _failure(
                started=started, model=model, reasoning_effort=reasoning_effort,
                provider_call_count=1, error_code="malformed_result_arguments",
                error="checker result arguments must be a JSON object", provider_response=response,
                timeout_allocated_ms=timeout_ms,
            )
        try:
            checker_result = Phase6CheckerResult(**arguments)
            filter_plan = build_phase6_checker_filter_plan(checker_input, checker_result)
        except Exception as exc:
            return _failure(
                started=started, model=model, reasoning_effort=reasoning_effort,
                provider_call_count=1, error_code="invalid_checker_result",
                error=str(exc), provider_response=response,
                timeout_allocated_ms=timeout_ms,
            )

        return Phase6CheckerRunResult(
            status="completed",
            checker_result=checker_result,
            filter_plan=filter_plan,
            duration_ms=(time.perf_counter() - started) * 1000.0,
            model=model,
            reasoning_effort=reasoning_effort,
            provider_call_count=1,
            provider_response_id=getattr(response, "response_id", None),
            provider_status=getattr(response, "status", None),
            provider_duration_ms=float(getattr(response, "duration_ms", 0.0) or 0.0),
            timeout_allocated_ms=timeout_ms,
            input_tokens=getattr(response, "input_tokens", None),
            cached_input_tokens=getattr(response, "cached_input_tokens", None),
            reasoning_tokens=getattr(response, "reasoning_tokens", None),
            output_tokens=getattr(response, "output_tokens", None),
            native_web_search_call_count=int(
                getattr(response, "native_web_search_call_count", 0) or 0
            ),
            native_web_source_count=int(getattr(response, "native_web_source_count", 0) or 0),
            native_web_citation_count=int(
                getattr(response, "native_web_citation_count", 0) or 0
            ),
            returned_tool_call_count=len(tool_calls),
            returned_tool_names=[str(getattr(tool, "name", "")) for tool in tool_calls],
        )
