from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.build_corpus_json import read_pdf_sections  # noqa: E402
from app.schedule.schedule2_index_service import (  # noqa: E402
    SCHEDULE1_INDEX_PATH,
    SCHEDULE2_INDEX_PATH,
    parse_schedule1_text,
    parse_schedule2_text,
    read_index,
)

DEFAULT_SOURCE_DIR = (
    PROJECT_ROOT
    / "data"
    / "acquired"
    / "legislation"
    / "migration_regulations_1994_schedules_updates"
)
DEFAULT_COMPILATION = "F2026C00667"


def _pdf_text(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(path)
    sections = read_pdf_sections(path)
    if not sections:
        raise RuntimeError(f"No extractable text found in {path}")
    return "\n\n".join(str(section.get("text") or "") for section in sections)


def _audit(name: str, expected_rows, actual_rows) -> bool:
    expected_refs = [row.clause_ref for row in expected_rows if row.clause_ref]
    actual_refs = [row.clause_ref for row in actual_rows if row.clause_ref]

    expected_unique = set(expected_refs)
    actual_unique = set(actual_refs)
    missing_unique = sorted(expected_unique - actual_unique)
    extra_unique = sorted(actual_unique - expected_unique)

    expected_counter = Counter(expected_refs)
    actual_counter = Counter(actual_refs)
    missing_occurrences = list((expected_counter - actual_counter).elements())
    extra_occurrences = list((actual_counter - expected_counter).elements())

    expected_subclasses = {row.subclass for row in expected_rows if row.subclass}
    actual_subclasses = {row.subclass for row in actual_rows if row.subclass}

    print(f"\n=== {name} ===")
    print(f"direct_rows={len(expected_rows)}")
    print(f"index_rows={len(actual_rows)}")
    print(f"direct_unique_refs={len(expected_unique)}")
    print(f"index_unique_refs={len(actual_unique)}")
    print(f"missing_unique_refs={len(missing_unique)}")
    print(f"index_only_unique_refs={len(extra_unique)}")
    print(f"missing_ref_occurrences={len(missing_occurrences)}")
    print(f"extra_ref_occurrences={len(extra_occurrences)}")
    print(f"direct_subclasses={len(expected_subclasses)}")
    print(f"index_subclasses={len(actual_subclasses)}")

    if missing_unique:
        print("missing_unique_ref_sample=", missing_unique[:50])
    if extra_unique:
        print("index_only_unique_ref_sample=", extra_unique[:50])

    missing_subclasses = sorted(expected_subclasses - actual_subclasses)
    extra_subclasses = sorted(actual_subclasses - expected_subclasses)
    if missing_subclasses:
        print("missing_subclasses=", missing_subclasses)
    if extra_subclasses:
        print("index_only_subclasses=", extra_subclasses)

    return not (
        missing_unique
        or extra_unique
        or missing_occurrences
        or extra_occurrences
        or missing_subclasses
        or extra_subclasses
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Verify generated Schedule 1/2 indexes against direct parsing of the "
            "official multi-volume Migration Regulations compilation PDFs."
        )
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--compilation", default=DEFAULT_COMPILATION)
    parser.add_argument("--volume2", type=Path, default=None)
    parser.add_argument("--volume3", type=Path, default=None)
    args = parser.parse_args()

    source_dir = args.source_dir.expanduser().resolve()
    volume2 = (
        args.volume2.expanduser().resolve()
        if args.volume2
        else source_dir / f"{args.compilation}VOL02.pdf"
    )
    volume3 = (
        args.volume3.expanduser().resolve()
        if args.volume3
        else source_dir / f"{args.compilation}VOL03.pdf"
    )

    vol2_text = _pdf_text(volume2)
    vol3_text = _pdf_text(volume3)

    direct_schedule1 = parse_schedule1_text(
        vol2_text,
        source_file=str(volume2),
        source_title=f"Migration Regulations 1994 {args.compilation} Volume 2",
    )
    direct_schedule2 = parse_schedule2_text(
        vol2_text + "\n\n" + vol3_text,
        source_file=f"{volume2}|{volume3}",
        source_title=(
            f"Migration Regulations 1994 {args.compilation} Schedule 2 "
            "(Volumes 2-3)"
        ),
    )

    index_schedule1 = read_index(SCHEDULE1_INDEX_PATH)
    index_schedule2 = read_index(SCHEDULE2_INDEX_PATH)

    ok1 = _audit("Schedule 1", direct_schedule1, index_schedule1)
    ok2 = _audit("Schedule 2", direct_schedule2, index_schedule2)

    if not (ok1 and ok2):
        raise SystemExit("ERROR: generated Schedule indexes differ from direct official-compilation parsing")

    print("\nOK: Schedule 1 and Schedule 2 indexes match direct official-compilation parsing")


if __name__ == "__main__":
    main()
