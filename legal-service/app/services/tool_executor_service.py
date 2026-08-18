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

import logging
import re
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from uuid import uuid4

from app.schemas.agent import AgentSubmissionV2
from app.schemas.tools import (
    DeterministicUtilityRequest,
    SubmissionError,
    SubmitAnswerAccepted,
    SubmitAnswerRejected,
    ToolResultEnvelope,
)
from app.services.agent_submission_validator import AgentSubmissionValidator
from app.services.evidence_postcondition_service import EvidencePostconditionService
from app.services.request_evidence_registry import RequestEvidenceRegistry
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
        claim_text = claim.get("text")
        if not isinstance(claim_text, str) or not claim_text:
            errors.append(
                SubmissionError(
                    code="CLAIM_TEXT_INVALID",
                    field=f"claims.{claim_id or '<unknown>'}.text",
                    affected_claim_ids=[claim_id] if claim_id else [],
                )
            )
            normalized_claims.append(claim)
            continue

        matches = _find_claim_text_spans(draft=draft, claim_text=claim_text)
        if len(matches) == 1:
            start, end = matches[0]
            raw_start = claim.get("draft_start")
            raw_end = claim.get("draft_end")
            raw_span_is_valid = (
                isinstance(raw_start, int)
                and not isinstance(raw_start, bool)
                and isinstance(raw_end, int)
                and not isinstance(raw_end, bool)
                and 0 <= raw_start <= raw_end <= len(draft)
                and " ".join(draft[raw_start:raw_end].split())
                == " ".join(claim_text.split())
            )
            if not raw_span_is_valid:
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


@dataclass(slots=True)
class ToolExecutorContext:
    """Context for tool execution within a single agent run."""

    request_id: str
    registry: RequestEvidenceRegistry
    as_of_date: date | None = None
    corpus_version: str | None = None
    index_version: str | None = None
    deadline_monotonic: float | None = None
    # Terminal submission tracking
    terminal_record: TerminalSubmissionRecord = field(default_factory=lambda: TerminalSubmissionRecord())
    terminal_policy: TerminalSubmissionPolicy = field(default_factory=TerminalSubmissionPolicy)
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

        try:
            if tool_call.name == "deterministic_utility":
                result = self._execute_deterministic_utility(tool_call, context)
            elif tool_call.name == "flat_rag_search":
                result = self._execute_flat_rag_search(tool_call, context)
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
        """Execute flat_rag_search tool (Arm B only)."""
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

        Validates the submission against the evidence registry and
        evidence postcondition. Records terminal submission state.
        """
        try:
            args = dict(tool_call.arguments)
            normalized_claims, span_errors = _normalize_claim_spans(
                draft=args.get("draft_markdown"),
                claims=args.get("claims"),
            )
            if span_errors:
                return self._reject_submission(
                    tool_call=tool_call,
                    context=context,
                    errors=span_errors,
                )
            args["claims"] = normalized_claims

            try:
                submission = AgentSubmissionV2(**args)
            except (TypeError, ValueError):
                return self._reject_submission(
                    tool_call=tool_call,
                    context=context,
                    errors=[
                        SubmissionError(
                            code="SUBMISSION_SCHEMA_INVALID",
                            field="submission",
                        )
                    ],
                )

            # Validate against registry
            validator = AgentSubmissionValidator(context.registry)
            validation_result = validator.validate(submission)

            if not validation_result.valid:
                # Invalid submission
                errors = [
                    {"code": e.code, "field": e.field, "affected_claim_ids": e.affected_claim_ids}
                    for e in validation_result.errors
                ]
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

                return build_tool_result(
                    tool_call_id=tool_call.call_id,
                    status="invalid_request",
                    data=rejected.model_dump(mode="json"),
                    duration_ms=0,
                    error={"code": "SUBMISSION_INVALID", "message": "Submission validation failed"},
                ), submission, _action

            # Run evidence postcondition
            postcondition = EvidencePostconditionService(context.registry)
            postcondition_result = postcondition.evaluate(
                submission,
                as_of_date=context.as_of_date or submission.as_of_date,
            )

            if postcondition_result.status == "failed":
                # Evidence postcondition failed
                errors = [
                    SubmissionError(
                        code="EVIDENCE_POSTCONDITION_FAILED",
                        field="claims",
                        affected_claim_ids=[
                            e.claim_id for e in postcondition_result.claim_evaluations
                            if e.status in ("insufficient", "invalid_ref")
                        ],
                    )
                ]
                _action = context.terminal_policy.handle_invalid_submission(
                    context.terminal_record,
                    errors=["Evidence postcondition failed"],
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

                return build_tool_result(
                    tool_call_id=tool_call.call_id,
                    status="invalid_request",
                    data=rejected.model_dump(mode="json"),
                    duration_ms=0,
                    error={"code": "EVIDENCE_POSTCONDITION_FAILED", "message": "Evidence postcondition failed"},
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
                data=accepted.model_dump(mode="json"),
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

    def _reject_submission(
        self,
        *,
        tool_call: ToolCallRequest,
        context: ToolExecutorContext,
        errors: list[SubmissionError],
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
                data=rejected.model_dump(mode="json"),
                duration_ms=0,
                error={
                    "code": "SUBMISSION_INVALID",
                    "message": "Submission validation failed",
                },
            ),
            None,
            action,
        )

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
