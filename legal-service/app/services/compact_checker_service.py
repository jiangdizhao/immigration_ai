from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Literal

from app.schemas.agent import AgentClaim, AgentRuntimeRequest, AgentSubmissionV2
from app.schemas.checker import CompactCheckerResult
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.request_evidence_registry import RequestEvidenceRegistry


CHECKER_RESULT_TOOL = {
    "type": "function",
    "name": "submit_compact_checker_result",
    "description": (
        "Return one KEEP or DROP decision for every supplied claim. Use qualification "
        "only when the weaker wording is directly supported by the supplied evidence "
        "and adds no new substantive fact. Do not research or invent sources."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "schema_version": {
                "type": "string",
                "enum": ["compact_checker.result.v1"],
            },
            "decisions": {
                "type": "array",
                "minItems": 1,
                "maxItems": 100,
                "items": {
                    "type": "object",
                    "properties": {
                        "claim_id": {"type": "string", "maxLength": 100},
                        "decision": {"type": "string", "enum": ["keep", "drop"]},
                        "reason_code": {"type": "string", "maxLength": 100},
                        "qualification": {
                            "anyOf": [
                                {"type": "string", "maxLength": 8000},
                                {"type": "null"},
                            ]
                        },
                        "original_claim_sha256": {
                            "anyOf": [
                                {"type": "string", "maxLength": 64},
                                {"type": "null"},
                            ]
                        },
                    },
                    "required": [
                        "claim_id",
                        "decision",
                        "reason_code",
                        "qualification",
                        "original_claim_sha256",
                    ],
                    "additionalProperties": False,
                },
            },
            "escalate": {"type": "boolean"},
        },
        "required": ["schema_version", "decisions", "escalate"],
        "additionalProperties": False,
    },
}


CHECKER_SYSTEM_PROMPT = """You are the compact evidence-only checker for an Australian immigration assistant.

You receive a completed draft, material claims, claim dependencies, collected evidence, source/provenance metadata, and compact matter state. You do not have research tools and must not search, retrieve, fetch, or invent evidence.

For every supplied claim, return exactly one decision:
- keep: the existing wording is reasonably supported and coherent;
- drop: the claim is unsupported, contradicted, materially stale, logically invalid, based on a non-genuine/too-weak source, or depends on a dropped premise.

A qualification is allowed only when the weaker wording is directly supported by the supplied evidence, adds no substantive fact, and narrows certainty or scope. Otherwise drop the claim. Do not send claims back to the answer agent. Do not rewrite the whole draft. Preserve independent claims.

Missing document_version, effective dates, or exact statutory spans are not automatic failures. Consider whether that metadata is material to this particular proposition. Historical, transitional, exact-wording, and date-specific claims need stronger support than broad current propositions.

Finish with submit_compact_checker_result.
"""


@dataclass(slots=True)
class CheckerRunResult:
    status: Literal["completed", "failed"]
    submission: AgentSubmissionV2 | None
    provider_response: Any | None
    duration_ms: float
    dropped_claim_ids: list[str] = field(default_factory=list)
    dependency_dropped_claim_ids: list[str] = field(default_factory=list)
    error: str | None = None


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _checker_evidence(registry: RequestEvidenceRegistry) -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    for evidence_ref in registry.get_all_refs():
        try:
            record = registry.resolve_evidence(evidence_ref)
        except Exception:
            continue
        evidence.append(record.model_dump(mode="json"))
    return evidence


def _find_unique_span(draft: str, text: str) -> tuple[int, int] | None:
    first = draft.find(text)
    if first < 0:
        return None
    second = draft.find(text, first + 1)
    if second >= 0:
        return None
    return first, first + len(text)


def _dependency_drop_ids(
    claims: list[AgentClaim],
    decisions: CompactCheckerResult,
) -> tuple[set[str], set[str], str | None]:
    claim_ids = {claim.claim_id for claim in claims}
    dependencies = {claim.claim_id: set(claim.depends_on) for claim in claims}
    missing = sorted(
        dependency
        for claim_dependencies in dependencies.values()
        for dependency in claim_dependencies
        if dependency not in claim_ids
    )
    if missing:
        return set(), set(), "unknown claim dependency"

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(claim_id: str) -> bool:
        if claim_id in visiting:
            return False
        if claim_id in visited:
            return True
        visiting.add(claim_id)
        for dependency in dependencies[claim_id]:
            if not visit(dependency):
                return False
        visiting.remove(claim_id)
        visited.add(claim_id)
        return True

    if not all(visit(claim_id) for claim_id in claim_ids):
        return set(), set(), "cyclic claim dependency"

    initial_drop = {
        decision.claim_id
        for decision in decisions.decisions
        if decision.decision == "drop"
    }
    propagated = set(initial_drop)
    changed = True
    while changed:
        changed = False
        for claim_id, claim_dependencies in dependencies.items():
            if claim_id in propagated:
                continue
            if claim_dependencies & propagated:
                propagated.add(claim_id)
                changed = True

    return propagated, propagated - initial_drop, None


def apply_checker_result(
    submission: AgentSubmissionV2,
    checker_result: CompactCheckerResult,
) -> tuple[AgentSubmissionV2 | None, list[str], list[str], str | None]:
    """Apply KEEP/DROP decisions and dependencies without an LLM rewrite."""

    claims_by_id = {claim.claim_id: claim for claim in submission.claims}
    decisions_by_id = {decision.claim_id: decision for decision in checker_result.decisions}
    if len(decisions_by_id) != len(checker_result.decisions):
        return None, [], [], "duplicate checker decision"
    if set(decisions_by_id) != set(claims_by_id):
        return None, [], [], "checker did not decide every claim"

    drop_ids, propagated_ids, dependency_error = _dependency_drop_ids(
        submission.claims,
        checker_result,
    )
    if dependency_error:
        return None, [], [], dependency_error

    edits: list[tuple[int, int, str]] = []
    for claim in submission.claims:
        decision = decisions_by_id[claim.claim_id]
        if claim.claim_id in drop_ids:
            edits.append((claim.draft_start, claim.draft_end, ""))
            continue
        if decision.qualification is not None:
            if decision.original_claim_sha256 != _sha256(claim.text):
                return None, [], [], "checker qualification hash mismatch"
            edits.append((claim.draft_start, claim.draft_end, decision.qualification))

    filtered_draft = submission.draft_markdown
    for start, end, replacement in sorted(edits, reverse=True):
        filtered_draft = filtered_draft[:start] + replacement + filtered_draft[end:]
    filtered_draft = filtered_draft.strip()
    if not filtered_draft:
        return None, sorted(drop_ids), sorted(propagated_ids), "all draft content was removed"

    surviving_claims: list[AgentClaim] = []
    for claim in submission.claims:
        if claim.claim_id in drop_ids:
            continue
        decision = decisions_by_id[claim.claim_id]
        claim_text = decision.qualification or claim.text
        span = _find_unique_span(filtered_draft, claim_text)
        if span is None:
            return None, [], [], "surviving claim span could not be rebuilt"
        surviving_claims.append(
            claim.model_copy(
                update={
                    "text": claim_text,
                    "draft_start": span[0],
                    "draft_end": span[1],
                    "depends_on": [
                        dependency
                        for dependency in claim.depends_on
                        if dependency not in drop_ids
                    ],
                }
            )
        )

    surviving_refs = {
        evidence_ref
        for claim in surviving_claims
        for evidence_ref in claim.evidence_refs
    }
    citations = [
        citation
        for citation in submission.citations
        if citation.evidence_ref in surviving_refs
    ]
    try:
        filtered = submission.model_copy(
            update={
                "draft_markdown": filtered_draft,
                "claims": surviving_claims,
                "citations": citations,
            }
        )
    except Exception as exc:
        return None, [], [], f"filtered submission invalid: {exc}"
    return filtered, sorted(drop_ids), sorted(propagated_ids), None


class CompactCheckerService:
    """One evidence-only checker call and deterministic finalization."""

    async def run(
        self,
        *,
        provider: Any,
        submission: AgentSubmissionV2,
        request: AgentRuntimeRequest,
        registry: RequestEvidenceRegistry,
        deadline: AbsoluteTurnDeadline,
        checker_target_ms: int,
        model: str,
        reasoning_effort: str | None,
    ) -> CheckerRunResult:
        import time

        started = time.perf_counter()
        remaining = deadline.remaining_ms()
        if remaining <= 0:
            return CheckerRunResult("failed", None, None, 0.0, error="checker deadline exhausted")

        payload = {
            "draft_markdown": submission.draft_markdown,
            "claims": [claim.model_dump(mode="json") for claim in submission.claims],
            "evidence": _checker_evidence(registry),
            "matter_state": request.matter_state,
            "as_of_date": request.as_of_date.isoformat(),
        }
        try:
            response = await provider.call(
                system_prompt=CHECKER_SYSTEM_PROMPT,
                user_text="",
                model=model,
                tools=[CHECKER_RESULT_TOOL],
                tool_choice="auto",
                reasoning_effort=reasoning_effort,
                messages_history=[
                    {"role": "system", "content": CHECKER_SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
                timeout_ms=min(remaining, float(checker_target_ms)),
                registry=registry,
                previous_response_id=None,
            )
        except Exception as exc:
            return CheckerRunResult(
                "failed", None, None, (time.perf_counter() - started) * 1000.0,
                error=f"checker provider failure: {exc}",
            )

        checker_calls = [
            call for call in getattr(response, "tool_calls", []) or []
            if getattr(call, "name", None) == "submit_compact_checker_result"
        ]
        if response.status != "ok" or len(checker_calls) != 1:
            return CheckerRunResult(
                "failed", None, response, (time.perf_counter() - started) * 1000.0,
                error="checker did not return exactly one result",
            )
        try:
            checker_result = CompactCheckerResult(**checker_calls[0].arguments)
            filtered, dropped, propagated, error = apply_checker_result(
                submission,
                checker_result,
            )
        except Exception as exc:
            filtered, dropped, propagated, error = None, [], [], f"checker result invalid: {exc}"
        if error or filtered is None:
            return CheckerRunResult(
                "failed", None, response, (time.perf_counter() - started) * 1000.0,
                error=error or "checker finalization failed",
            )
        return CheckerRunResult(
            "completed", filtered, response, (time.perf_counter() - started) * 1000.0,
            dropped_claim_ids=dropped,
            dependency_dropped_claim_ids=propagated,
        )
