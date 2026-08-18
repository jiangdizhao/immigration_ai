"""Phase 4B — Terminal submission policy (provider-agnostic).

Implements the v2.1.1 terminal submit_answer contract foundation:

- submit_answer is terminal, structured, side-effect free, validated
- Provider finishes without submit_answer → raw text NOT served
- terminal_submission_missing = true
- ONE bounded continuation permitted: "Submit the completed answer using submit_answer."
- Second miss/rejection/timeout → controlled incomplete/error
- Continuation counts against provider API calls, tool rounds, ORIGINAL deadline

This is a PROVIDER-AGNOSTIC policy/state helper. Phase 5 AgentRuntimeService
will consume it. Phase 4B does NOT implement the agent loop or OpenAI calls.

There is ONE shared terminal-submission correction allowance:
- Missing terminal call consumes it
- Invalid submission consumes it (if spec specifies)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class TerminalSubmissionState(str, Enum):
    """State of terminal submission handling."""

    PENDING = "pending"  # No submission received yet
    RECEIVED_VALID = "received_valid"  # Valid submission received
    RECEIVED_INVALID = "received_invalid"  # Invalid submission received
    MISSING = "missing"  # Provider completed without submission
    CORRECTION_ISSUED = "correction_issued"  # Continuation issued
    CORRECTION_FAILED = "correction_failed"  # Second miss after correction
    DEADLINE_EXCEEDED = "deadline_exceeded"  # Deadline passed


@dataclass(slots=True)
class TerminalSubmissionRecord:
    """Record of terminal submission handling for one request."""

    state: TerminalSubmissionState = TerminalSubmissionState.PENDING
    submission_received: bool = False
    submission_valid: bool = False
    correction_issued: bool = False
    correction_count: int = 0
    terminal_submission_missing: bool = False
    raw_text_publishable: bool = False  # NEVER true without valid submission
    errors: list[str] = field(default_factory=list)


class TerminalSubmissionPolicy:
    """Provider-agnostic terminal submission policy.

    Usage in Phase 5:
        policy = TerminalSubmissionPolicy()

        # Provider completes
        if not submission_received:
            action = policy.handle_missing_submission(record)
            if action.can_continue:
                # Issue continuation: "Submit the completed answer using submit_answer."
                ...
            else:
                # Return controlled incomplete/error
                ...

        # After continuation
        if still_no_submission:
            result = policy.handle_second_miss(record)
            # result.can_continue is always False
    """

    # Maximum correction continuations allowed (v2.1.1: exactly one)
    MAX_CORRECTION_CONTINUATIONS = 1

    def handle_missing_submission(
        self,
        record: TerminalSubmissionRecord,
        *,
        deadline_remaining_ms: float | None = None,
    ) -> TerminalSubmissionAction:
        """Handle provider completion without submit_answer.

        Returns action indicating whether continuation is allowed.

        CRITICAL: Raw provider text is NEVER publishable.
        """
        record.terminal_submission_missing = True
        record.raw_text_publishable = False  # NEVER serve raw text

        # Check if correction allowance already consumed
        if record.correction_count >= self.MAX_CORRECTION_CONTINUATIONS:
            record.state = TerminalSubmissionState.CORRECTION_FAILED
            return TerminalSubmissionAction(
                can_continue=False,
                action="fail_closed",
                reason="Correction allowance already consumed",
            )

        # Check deadline
        if deadline_remaining_ms is not None and deadline_remaining_ms <= 0:
            record.state = TerminalSubmissionState.DEADLINE_EXCEEDED
            return TerminalSubmissionAction(
                can_continue=False,
                action="fail_closed",
                reason="Deadline exceeded; no continuation allowed",
            )

        # Allow exactly one continuation
        record.state = TerminalSubmissionState.MISSING
        record.correction_issued = True
        record.correction_count += 1

        return TerminalSubmissionAction(
            can_continue=True,
            action="issue_continuation",
            continuation_message="Submit the completed answer using submit_answer.",
            reason="First missing terminal submission; one correction allowed",
        )

    def handle_invalid_submission(
        self,
        record: TerminalSubmissionRecord,
        *,
        errors: list[str],
        deadline_remaining_ms: float | None = None,
    ) -> TerminalSubmissionAction:
        """Handle invalid submission (consumes correction allowance).

        Per v2.1.1: invalid submission consumes the shared correction allowance.
        """
        record.submission_received = True
        record.submission_valid = False
        record.errors.extend(errors)
        record.raw_text_publishable = False

        # Invalid submission consumes correction allowance
        if record.correction_count >= self.MAX_CORRECTION_CONTINUATIONS:
            record.state = TerminalSubmissionState.CORRECTION_FAILED
            return TerminalSubmissionAction(
                can_continue=False,
                action="fail_closed",
                reason="Correction allowance consumed by invalid submission",
            )

        # Check deadline
        if deadline_remaining_ms is not None and deadline_remaining_ms <= 0:
            record.state = TerminalSubmissionState.DEADLINE_EXCEEDED
            return TerminalSubmissionAction(
                can_continue=False,
                action="fail_closed",
                reason="Deadline exceeded; no continuation allowed",
            )

        # Allow one correction
        record.state = TerminalSubmissionState.RECEIVED_INVALID
        record.correction_issued = True
        record.correction_count += 1

        return TerminalSubmissionAction(
            can_continue=True,
            action="issue_continuation",
            continuation_message="The submission was invalid. Submit a corrected answer using submit_answer.",
            reason="Invalid submission; one correction allowed",
        )

    def handle_valid_submission(
        self,
        record: TerminalSubmissionRecord,
    ) -> TerminalSubmissionAction:
        """Handle valid submission (terminal success)."""
        record.submission_received = True
        record.submission_valid = True
        record.state = TerminalSubmissionState.RECEIVED_VALID
        record.raw_text_publishable = False  # Use structured submission, not raw

        return TerminalSubmissionAction(
            can_continue=False,
            action="accept_submission",
            reason="Valid terminal submission received",
        )

    def handle_second_miss(
        self,
        record: TerminalSubmissionRecord,
    ) -> TerminalSubmissionAction:
        """Handle second missing/invalid submission after correction.

        Always fails closed; no third attempt.
        """
        record.state = TerminalSubmissionState.CORRECTION_FAILED
        record.raw_text_publishable = False

        return TerminalSubmissionAction(
            can_continue=False,
            action="fail_closed",
            reason="Second missing/invalid terminal submission; controlled error",
        )

    def get_metrics(self, record: TerminalSubmissionRecord) -> dict[str, Any]:
        """Get observability metrics for terminal submission handling."""
        return {
            "terminal_submission_missing": record.terminal_submission_missing,
            "terminal_submission_continuation_count": record.correction_count,
            "submission_received": record.submission_received,
            "submission_valid": record.submission_valid,
            "state": record.state.value,
        }


@dataclass(slots=True)
class TerminalSubmissionAction:
    """Action to take based on terminal submission state."""

    can_continue: bool
    action: str  # "issue_continuation", "fail_closed", "accept_submission"
    continuation_message: str | None = None
    reason: str = ""


def create_terminal_submission_record() -> TerminalSubmissionRecord:
    """Create a new terminal submission record."""
    return TerminalSubmissionRecord()