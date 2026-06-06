from __future__ import annotations

from app.schedule.schedule2_index_service import (
    SCHEDULE1_INDEX_PATH,
    SCHEDULE2_INDEX_PATH,
    build_index_from_raw,
    write_index,
)


def main() -> None:
    schedule2 = build_index_from_raw("2")
    schedule1 = build_index_from_raw("1")

    write_index(SCHEDULE2_INDEX_PATH, schedule2)
    write_index(SCHEDULE1_INDEX_PATH, schedule1)

    subclasses = sorted({clause.subclass for clause in schedule2 if clause.subclass})
    print("Schedule index build summary")
    print(f"  schedule2_clauses={len(schedule2)}")
    print(f"  schedule2_subclasses={len(subclasses)}")
    print(f"  schedule2_index={SCHEDULE2_INDEX_PATH}")
    print(f"  schedule1_clauses={len(schedule1)}")
    print(f"  schedule1_index={SCHEDULE1_INDEX_PATH}")
    if len(schedule2) < 50:
        print("WARNING: Schedule 2 index is small. Check whether the Schedule 2 PDF/JSON was ingested correctly.")


if __name__ == "__main__":
    main()
