"""Phase 4B — Common tool base contracts.

Provides the shared tool execution context and typed error handling
for all Phase 4B+ tools.  Tool results use the ToolResultEnvelope
schema defined in Phase 1 (app/schemas/tools.py).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.schemas.tools import ToolError, ToolResultEnvelope, ToolResultMeta


class ToolExecutionError(Exception):
    """Typed tool execution error with safe message."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(slots=True)
class ToolContext:
    """Request-scoped tool execution context.

    Carries identity, deadline, and version information without
    exposing user PII or hidden reasoning.
    """

    request_id: str
    tool_call_id: str | None = None
    as_of_date: str | None = None  # YYYY-MM-DD
    corpus_version: str | None = None
    index_version: str | None = None
    deadline_monotonic: float | None = None  # time.monotonic() deadline
    extra: dict[str, Any] = field(default_factory=dict)

    def remaining_deadline_ms(self) -> float | None:
        """Return remaining deadline in ms, or None if no deadline set."""
        if self.deadline_monotonic is None:
            return None
        remaining = self.deadline_monotonic - time.monotonic()
        return max(0.0, remaining * 1000.0)

    def is_deadline_exceeded(self) -> bool:
        """Return True if the deadline has passed."""
        if self.deadline_monotonic is None:
            return False
        return time.monotonic() >= self.deadline_monotonic


def build_tool_result(
    *,
    tool_call_id: str,
    status: str,
    data: dict[str, Any],
    duration_ms: float,
    warnings: list[str] | None = None,
    error: ToolError | None = None,
    corpus_version: str | None = None,
    cache_hit: bool = False,
) -> ToolResultEnvelope:
    """Build a ToolResultEnvelope with deterministic metadata."""
    return ToolResultEnvelope(
        tool_call_id=tool_call_id,
        status=status,  # type: ignore[arg-type]
        data=data,
        warnings=warnings or [],
        error=error,
        meta=ToolResultMeta(
            duration_ms=duration_ms,
            cache_hit=cache_hit,
            observed_at=datetime.now(timezone.utc),
            corpus_version=corpus_version,
        ),
    )


def generate_tool_call_id() -> str:
    """Generate a unique tool call ID."""
    return f"call_{uuid4().hex[:24]}"