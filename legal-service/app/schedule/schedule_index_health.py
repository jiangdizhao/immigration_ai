from __future__ import annotations

import logging
import os

from app.schedule.schedule2_index_service import ScheduleIndexService

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def validate_schedule_index_ready() -> dict:
    """Fail fast when the legal Schedule 2 index is unavailable.

    The proposal-first verification-depth engine depends on Schedule 2 as a
    post-proposal verification source. Returning an answer with 0 Schedule 2
    clauses is worse than failing deployment, because it looks authoritative but
    is not verified.
    """

    guard_enabled = _env_bool("SCHEDULE_INDEX_STARTUP_GUARD", True)
    min_schedule2 = _env_int("SCHEDULE2_MIN_CLAUSES", 1000)

    service = ScheduleIndexService()
    schedule2 = list(service.schedule2_clauses())
    schedule1 = list(service.schedule1_clauses())
    diagnostics = service.diagnostics()
    diagnostics.update(
        {
            "startup_guard_enabled": guard_enabled,
            "min_schedule2_clauses": min_schedule2,
            "schedule2_clauses": len(schedule2),
            "schedule1_clauses": len(schedule1),
        }
    )

    if len(schedule2) < min_schedule2:
        message = (
            "Schedule index startup self-test failed: "
            f"schedule2_clauses={len(schedule2)} < {min_schedule2}; "
            f"schedule1_clauses={len(schedule1)}; diagnostics={diagnostics}"
        )
        if guard_enabled:
            raise RuntimeError(message)
        logger.error(message)
    else:
        logger.info(
            "Schedule index startup self-test passed: schedule2_clauses=%s schedule1_clauses=%s diagnostics=%s",
            len(schedule2),
            len(schedule1),
            diagnostics,
        )

    return diagnostics
