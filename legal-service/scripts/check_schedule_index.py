from __future__ import annotations

import json
import os

from app.schedule.schedule2_index_service import ScheduleIndexService


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def main() -> None:
    min_schedule2 = _env_int("SCHEDULE2_MIN_CLAUSES", 1000)
    service = ScheduleIndexService()
    schedule2 = list(service.schedule2_clauses())
    schedule1 = list(service.schedule1_clauses())

    diagnostics = service.diagnostics()
    diagnostics.update(
        {
            "schedule2_clauses": len(schedule2),
            "schedule1_clauses": len(schedule1),
            "min_schedule2_clauses": min_schedule2,
        }
    )

    print("Schedule index self-test")
    print(json.dumps(diagnostics, indent=2, default=str))

    if len(schedule2) < min_schedule2:
        raise SystemExit(
            f"ERROR: Schedule 2 index is missing or too small: {len(schedule2)} < {min_schedule2}"
        )

    print("OK: Schedule index is ready")


if __name__ == "__main__":
    main()
