from __future__ import annotations

import argparse
import sys
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
    write_index,
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


def _atomic_write(path: Path, rows) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    write_index(tmp, list(rows))
    tmp.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Build Schedule 1 and Schedule 2 indexes directly from the official "
            "multi-volume Migration Regulations compilation PDFs. This bypasses "
            "DB chunk reconstruction so legal clause boundaries are preserved."
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

    print("Official compilation Schedule index build")
    print(f"  compilation={args.compilation}")
    print(f"  volume2={volume2}")
    print(f"  volume3={volume3}")

    vol2_text = _pdf_text(volume2)
    vol3_text = _pdf_text(volume3)

    schedule1 = parse_schedule1_text(
        vol2_text,
        source_file=str(volume2),
        source_title=f"Migration Regulations 1994 {args.compilation} Volume 2",
    )
    schedule2 = parse_schedule2_text(
        vol2_text + "\n\n" + vol3_text,
        source_file=f"{volume2}|{volume3}",
        source_title=(
            f"Migration Regulations 1994 {args.compilation} Schedule 2 "
            "(Volumes 2-3)"
        ),
    )

    if not schedule1:
        raise SystemExit("ERROR: no Schedule 1 clauses parsed from Volume 2")
    if not schedule2:
        raise SystemExit("ERROR: no Schedule 2 clauses parsed from Volumes 2-3")

    schedule1_refs = {row.clause_ref for row in schedule1 if row.clause_ref}
    schedule2_refs = {row.clause_ref for row in schedule2 if row.clause_ref}
    schedule2_subclasses = {row.subclass for row in schedule2 if row.subclass}

    if len(schedule2_refs) < 1000:
        raise SystemExit(
            f"ERROR: parsed Schedule 2 is unexpectedly small: {len(schedule2_refs)} unique refs"
        )

    _atomic_write(SCHEDULE1_INDEX_PATH, schedule1)
    _atomic_write(SCHEDULE2_INDEX_PATH, schedule2)

    print("\nBuild summary")
    print(f"  schedule1_rows={len(schedule1)}")
    print(f"  schedule1_unique_refs={len(schedule1_refs)}")
    print(f"  schedule1_index={SCHEDULE1_INDEX_PATH}")
    print(f"  schedule2_rows={len(schedule2)}")
    print(f"  schedule2_unique_refs={len(schedule2_refs)}")
    print(f"  schedule2_subclasses={len(schedule2_subclasses)}")
    print(f"  schedule2_index={SCHEDULE2_INDEX_PATH}")


if __name__ == "__main__":
    main()
