from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.legal_locator.index import (  # noqa: E402
    build_locator_records,
    build_manifest,
    validate_records,
    write_index,
    write_manifest,
)
from scripts.build_corpus_json import read_pdf_sections  # noqa: E402

DEFAULT_SOURCE_DIR = (
    PROJECT_ROOT
    / "data"
    / "acquired"
    / "legislation"
    / "migration_regulations_1994_schedules_updates"
)
DEFAULT_COMPILATION = "F2026C00667"
DEFAULT_COMPILATION_NUMBER = "288"
DEFAULT_EFFECTIVE_DATE = "2026-07-01"


def _require_minimums(records) -> None:
    counts = Counter(record.locator_type for record in records)
    minimums = {
        "regulation": 50,
        "schedule3_criterion": 3,
        "schedule4_pic": 3,
        "schedule8_condition": 3,
    }
    failures = {
        kind: (counts.get(kind, 0), minimum)
        for kind, minimum in minimums.items()
        if counts.get(kind, 0) < minimum
    }
    if failures:
        detail = ", ".join(
            f"{kind}={actual} (<{minimum})"
            for kind, (actual, minimum) in sorted(failures.items())
        )
        raise SystemExit(f"ERROR: locator extraction is unexpectedly small: {detail}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Build a page-aware exact legal locator index directly from the "
            "official Migration Regulations compilation PDFs. The index covers "
            "regulations plus Schedule 3 criteria, Schedule 4 PICs and Schedule 8 "
            "conditions. It is a derived navigation layer; it does not replace "
            "PostgreSQL canonical evidence."
        )
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--compilation", default=DEFAULT_COMPILATION)
    parser.add_argument("--compilation-number", default=DEFAULT_COMPILATION_NUMBER)
    parser.add_argument("--effective-date", default=DEFAULT_EFFECTIVE_DATE)
    parser.add_argument("--volume1", type=Path, default=None)
    parser.add_argument("--volume3", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--manifest", type=Path, default=None)
    args = parser.parse_args()

    source_dir = args.source_dir.expanduser().resolve()
    volume1 = (
        args.volume1.expanduser().resolve()
        if args.volume1
        else source_dir / f"{args.compilation}VOL01.pdf"
    )
    volume3 = (
        args.volume3.expanduser().resolve()
        if args.volume3
        else source_dir / f"{args.compilation}VOL03.pdf"
    )
    output = (
        args.output.expanduser().resolve()
        if args.output
        else PROJECT_ROOT
        / "data"
        / "processed"
        / "legal_locator_index"
        / f"migration_regulations_{args.compilation}.jsonl"
    )
    manifest = (
        args.manifest.expanduser().resolve()
        if args.manifest
        else output.with_name(output.stem + "_manifest.json")
    )

    for path in (volume1, volume3):
        if not path.exists():
            raise SystemExit(f"ERROR: official compilation PDF not found: {path}")

    print("Official compilation legal locator build")
    print(f"  compilation={args.compilation}")
    print(f"  volume1={volume1}")
    print(f"  volume3={volume3}")

    volume1_sections = read_pdf_sections(volume1)
    volume3_sections = read_pdf_sections(volume3)
    records = build_locator_records(
        volume1_sections=volume1_sections,
        volume3_sections=volume3_sections,
        document_version=args.compilation,
        compilation_number=args.compilation_number,
        effective_date=args.effective_date,
        volume1_source_file=volume1.name,
        volume3_source_file=volume3.name,
    )

    errors = validate_records(records)
    if errors:
        for error in errors[:50]:
            print(f"ERROR: {error}")
        raise SystemExit(f"ERROR: locator validation failed with {len(errors)} error(s)")
    _require_minimums(records)

    write_index(output, records)
    manifest_payload = build_manifest(
        records=records,
        document_version=args.compilation,
        compilation_number=args.compilation_number,
        effective_date=args.effective_date,
        source_files=[volume1.name, volume3.name],
    )
    write_manifest(manifest, manifest_payload)

    counts = Counter(record.locator_type for record in records)
    print("\nBuild summary")
    print(f"  records={len(records)}")
    for kind in sorted(counts):
        print(f"  {kind}={counts[kind]}")
    print(f"  index={output}")
    print(f"  manifest={manifest}")


if __name__ == "__main__":
    main()
