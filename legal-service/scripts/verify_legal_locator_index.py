from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.legal_locator.index import (  # noqa: E402
    build_locator_records,
    read_index,
    validate_records,
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
VOLUME_RE = re.compile(r"\bVolume\s+(\d+)\b", re.I)


def _canonical(record) -> str:
    return json.dumps(record.to_dict(), ensure_ascii=False, sort_keys=True)


def _verify_against_pdfs(expected, actual) -> None:
    expected_map = {record.normalized_locator: record for record in expected}
    actual_map = {record.normalized_locator: record for record in actual}

    missing = sorted(set(expected_map) - set(actual_map))
    extra = sorted(set(actual_map) - set(expected_map))
    changed = sorted(
        key
        for key in set(expected_map) & set(actual_map)
        if _canonical(expected_map[key]) != _canonical(actual_map[key])
    )

    print("\n=== Direct-PDF comparison ===")
    print(f"direct_records={len(expected)}")
    print(f"index_records={len(actual)}")
    print(f"missing={len(missing)}")
    print(f"extra={len(extra)}")
    print(f"changed={len(changed)}")
    if missing:
        print("missing_sample=", missing[:30])
    if extra:
        print("extra_sample=", extra[:30])
    if changed:
        print("changed_sample=", changed[:30])
    if missing or extra or changed:
        raise SystemExit("ERROR: locator index differs from direct official-PDF extraction")


def _verify_page_refs(actual, volume1_sections, volume3_sections) -> None:
    valid = {
        1: {str(section.get("section_ref")) for section in volume1_sections},
        3: {str(section.get("section_ref")) for section in volume3_sections},
    }
    failures: list[str] = []
    for record in actual:
        missing = [ref for ref in record.page_refs if ref not in valid.get(record.volume, set())]
        if missing:
            failures.append(f"{record.normalized_locator}: {missing}")
    print("\n=== PDF page-ref integrity ===")
    print(f"invalid_page_ref_records={len(failures)}")
    if failures:
        for failure in failures[:30]:
            print("  ", failure)
        raise SystemExit("ERROR: locator index contains page refs absent from source PDFs")


def _source_volume(source) -> int | None:
    metadata = source.metadata_json if isinstance(source.metadata_json, dict) else {}
    raw = metadata.get("volume")
    try:
        if raw is not None:
            return int(raw)
    except (TypeError, ValueError):
        pass
    match = VOLUME_RE.search(source.title or "")
    return int(match.group(1)) if match else None


def _verify_db(actual, compilation: str) -> None:
    from sqlalchemy import select

    from app.db.models import LegalSource, SourceChunk
    from app.db.session import SessionLocal

    needed_volumes = sorted({record.volume for record in actual})
    by_volume: dict[int, list] = defaultdict(list)

    with SessionLocal() as db:
        sources = list(
            db.scalars(
                select(LegalSource).where(LegalSource.document_version == compilation)
            ).all()
        )
        for source in sources:
            volume = _source_volume(source)
            if volume in needed_volumes:
                by_volume[volume].append(source)

        print("\n=== PostgreSQL source resolution ===")
        for volume in needed_volumes:
            print(f"volume_{volume}_sources={len(by_volume.get(volume, []))}")
        missing_volumes = [volume for volume in needed_volumes if not by_volume.get(volume)]
        if missing_volumes:
            raise SystemExit(
                f"ERROR: no PostgreSQL {compilation} source for volume(s): {missing_volumes}"
            )

        page_text: dict[tuple[int, str], list[str]] = defaultdict(list)
        for volume, volume_sources in by_volume.items():
            source_ids = [source.id for source in volume_sources]
            rows = db.execute(
                select(SourceChunk.section_ref, SourceChunk.text).where(
                    SourceChunk.source_id.in_(source_ids)
                )
            ).all()
            for section_ref, text in rows:
                if section_ref:
                    page_text[(volume, str(section_ref))].append(str(text or ""))

    missing_pages: list[str] = []
    missing_locator_text: list[str] = []
    for record in actual:
        resolved_text: list[str] = []
        for page_ref in record.page_refs:
            chunks = page_text.get((record.volume, page_ref), [])
            if not chunks:
                missing_pages.append(f"{record.normalized_locator}:{page_ref}")
            resolved_text.extend(chunks)
        joined = "\n".join(resolved_text).casefold()
        if record.provision_ref.casefold() not in joined:
            missing_locator_text.append(record.normalized_locator)

    print("\n=== PostgreSQL page resolution ===")
    print(f"missing_page_refs={len(missing_pages)}")
    print(f"locator_text_not_found={len(missing_locator_text)}")
    if missing_pages:
        print("missing_page_ref_sample=", missing_pages[:30])
    if missing_locator_text:
        print("locator_text_not_found_sample=", missing_locator_text[:30])
    if missing_pages or missing_locator_text:
        raise SystemExit("ERROR: locator index does not resolve cleanly to PostgreSQL chunks")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Verify the derived legal locator index against direct official-PDF "
            "extraction and optionally against the PostgreSQL canonical corpus."
        )
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--compilation", default=DEFAULT_COMPILATION)
    parser.add_argument("--compilation-number", default=DEFAULT_COMPILATION_NUMBER)
    parser.add_argument("--effective-date", default=DEFAULT_EFFECTIVE_DATE)
    parser.add_argument("--volume1", type=Path, default=None)
    parser.add_argument("--volume3", type=Path, default=None)
    parser.add_argument("--index", type=Path, default=None)
    parser.add_argument("--check-db", action="store_true")
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
    index_path = (
        args.index.expanduser().resolve()
        if args.index
        else PROJECT_ROOT
        / "data"
        / "processed"
        / "legal_locator_index"
        / f"migration_regulations_{args.compilation}.jsonl"
    )

    if not index_path.exists():
        raise SystemExit(f"ERROR: locator index not found: {index_path}")

    volume1_sections = read_pdf_sections(volume1)
    volume3_sections = read_pdf_sections(volume3)
    expected = build_locator_records(
        volume1_sections=volume1_sections,
        volume3_sections=volume3_sections,
        document_version=args.compilation,
        compilation_number=args.compilation_number,
        effective_date=args.effective_date,
        volume1_source_file=volume1.name,
        volume3_source_file=volume3.name,
    )
    actual = read_index(index_path)

    errors = validate_records(actual)
    print("=== Structural validation ===")
    print(f"errors={len(errors)}")
    if errors:
        for error in errors[:50]:
            print("  ", error)
        raise SystemExit("ERROR: structural locator validation failed")

    counts = Counter(record.locator_type for record in actual)
    for kind in sorted(counts):
        print(f"{kind}={counts[kind]}")

    _verify_against_pdfs(expected, actual)
    _verify_page_refs(actual, volume1_sections, volume3_sections)
    if args.check_db:
        _verify_db(actual, args.compilation)

    print("\nOK: legal locator index matches official PDFs")
    if args.check_db:
        print("OK: every locator resolves to the PostgreSQL canonical corpus")


if __name__ == "__main__":
    main()
