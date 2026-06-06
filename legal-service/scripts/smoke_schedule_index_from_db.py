from __future__ import annotations

from pathlib import Path

from app.schedule.schedule2_index_service import SCHEDULE1_INDEX_PATH, SCHEDULE2_INDEX_PATH, ScheduleIndexService


def main() -> None:
    service = ScheduleIndexService()
    s1 = list(service.schedule1_clauses())
    s2 = list(service.schedule2_clauses())
    print(f"schedule1_index_exists={Path(SCHEDULE1_INDEX_PATH).exists()} clauses={len(s1)}")
    print(f"schedule2_index_exists={Path(SCHEDULE2_INDEX_PATH).exists()} clauses={len(s2)}")

    for subclass in ["010", "020", "485", "500", "820"]:
        clauses = service.clauses_for_subclass(subclass, schedule_no="2")
        sample = [c.clause_ref for c in clauses[:8]]
        print(f"subclass_{subclass}_schedule2_clause_count={len(clauses)} sample={sample}")


if __name__ == "__main__":
    main()
