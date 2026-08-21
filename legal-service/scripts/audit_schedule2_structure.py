#!/usr/bin/env python3
"""Read-only structural audit for the official Schedule 2 derived index.

This script intentionally does not write indexes, graph artifacts, or database
rows.  It compares the existing full-volume parser path with a page-delimited
Schedule-2-only view of the official compilation and reports structural warning
signals that deterministic rebuild-equality checks cannot detect.

The audit is syntax/structure only.  It does not decide legal applicability or
change the serving architecture.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.schedule.schedule2_index_service import (  # noqa: E402
    SCHEDULE2_INDEX_PATH,
    parse_schedule2_text,
    read_index,
)
from app.schedule.schemas import ScheduleClause  # noqa: E402
from scripts.build_corpus_json import read_pdf_sections  # noqa: E402

DEFAULT_SOURCE_DIR = (
    PROJECT_ROOT
    / "data"
    / "acquired"
    / "legislation"
    / "migration_regulations_1994_schedules_updates"
)
DEFAULT_COMPILATION = "F2026C00667"

SCHEDULE_HEADER_RE = re.compile(
    r"^\s*Schedule\s+(?P<schedule>\d{1,2}[A-Z]?)"
    r"(?:\s*$|\s*[-–—:]\s*.*$)",
    re.IGNORECASE,
)
CLAUSE_PREFIX_RE = re.compile(r"^(?P<prefix>[0-9A-Z]{3,4})\.", re.IGNORECASE)
SUBCLASS_HEADING_RE = re.compile(r"^\s*Subclass\s+([0-9A-Z]{3,4})\b", re.IGNORECASE)
DOT_LEADER_RE = re.compile(r"\.{3,}")


@dataclass(frozen=True, slots=True)
class AuditPage:
    volume: int
    section_ref: str
    heading: str
    text: str
    detected_schedule: str | None


@dataclass(frozen=True, slots=True)
class RowAudit:
    rows: int
    unique_refs: int
    subclasses: int
    prefix_mismatches: tuple[tuple[str, str | None], ...]
    conflicting_owners: tuple[tuple[str, tuple[str, ...]], ...]
    duplicate_refs: tuple[tuple[str, int], ...]


def _nonempty_lines(text: str) -> list[str]:
    return [line.strip() for line in (text or "").splitlines() if line.strip()]


def looks_like_contents_page(text: str) -> bool:
    """Conservatively exclude obvious table-of-contents pages."""
    lines = _nonempty_lines(text)
    if not lines:
        return False
    head = " ".join(lines[:8]).casefold()
    if "contents" in head or "table of provisions" in head:
        return True
    return sum(bool(DOT_LEADER_RE.search(line)) for line in lines[:80]) >= 4


def detect_structural_schedule_header(text: str) -> str | None:
    """Detect a page-level Schedule heading, not an inline cross-reference.

    Only the first twenty non-empty lines are considered because Federal
    Register page furniture can precede the legal heading.  The line itself
    must be an isolated/heading-shaped ``Schedule N`` form; ordinary prose such
    as ``Schedule 3 applies ...`` is deliberately not accepted.
    """
    if looks_like_contents_page(text):
        return None
    for line in _nonempty_lines(text)[:20]:
        match = SCHEDULE_HEADER_RE.match(line)
        if match:
            return match.group("schedule").upper()
    return None


def pages_from_sections(sections: Sequence[dict], *, volume: int) -> list[AuditPage]:
    pages: list[AuditPage] = []
    for section in sections:
        text = str(section.get("text") or "")
        if not text.strip():
            continue
        pages.append(
            AuditPage(
                volume=volume,
                section_ref=str(section.get("section_ref") or ""),
                heading=str(section.get("heading") or ""),
                text=text,
                detected_schedule=detect_structural_schedule_header(text),
            )
        )
    return pages


def delimit_schedule2_pages(pages: Sequence[AuditPage]) -> list[AuditPage]:
    """Select pages structurally owned by Schedule 2 within one PDF volume.

    Ownership starts at a detected Schedule 2 header and carries across pages
    until a different Schedule header appears.  No subclass/provision-specific
    exception is used.
    """
    active_schedule: str | None = None
    selected: list[AuditPage] = []
    for page in pages:
        if page.detected_schedule is not None:
            active_schedule = page.detected_schedule
        if active_schedule == "2" and not looks_like_contents_page(page.text):
            selected.append(page)
    return selected


def _joined_text(pages: Iterable[AuditPage]) -> str:
    return "\n\n".join(page.text for page in pages if page.text.strip())


def _prefix(clause_ref: str) -> str | None:
    match = CLAUSE_PREFIX_RE.match((clause_ref or "").strip().upper())
    return match.group("prefix").upper() if match else None


def audit_rows(rows: Sequence[ScheduleClause]) -> RowAudit:
    by_ref: dict[str, list[ScheduleClause]] = defaultdict(list)
    prefix_mismatches: list[tuple[str, str | None]] = []

    for row in rows:
        ref = (row.clause_ref or "").strip().upper()
        by_ref[ref].append(row)
        prefix = _prefix(ref)
        subclass = (row.subclass or "").strip().upper() or None
        if prefix is not None and subclass is not None and prefix != subclass:
            prefix_mismatches.append((ref, subclass))

    conflicting: list[tuple[str, tuple[str, ...]]] = []
    for ref, items in by_ref.items():
        owners = tuple(
            sorted(
                {
                    (item.subclass or "").strip().upper()
                    for item in items
                    if (item.subclass or "").strip()
                }
            )
        )
        if len(owners) > 1:
            conflicting.append((ref, owners))

    duplicates = sorted(
        ((ref, len(items)) for ref, items in by_ref.items() if len(items) > 1),
        key=lambda item: (-item[1], item[0]),
    )
    subclasses = {
        (row.subclass or "").strip().upper()
        for row in rows
        if (row.subclass or "").strip()
    }
    return RowAudit(
        rows=len(rows),
        unique_refs=len(by_ref),
        subclasses=len(subclasses),
        prefix_mismatches=tuple(sorted(set(prefix_mismatches))),
        conflicting_owners=tuple(sorted(conflicting)),
        duplicate_refs=tuple(duplicates),
    )


def _ref_counter(rows: Sequence[ScheduleClause]) -> Counter[str]:
    return Counter((row.clause_ref or "").strip().upper() for row in rows)


def _sample(values: Sequence, limit: int) -> list:
    return list(values[: max(0, limit)])


def _print_row_audit(label: str, audit: RowAudit, *, sample_limit: int) -> None:
    print(f"\n=== {label} ===")
    print(f"rows={audit.rows}")
    print(f"unique_refs={audit.unique_refs}")
    print(f"subclasses={audit.subclasses}")
    print(f"prefix_subclass_mismatch_rows={len(audit.prefix_mismatches)}")
    print(f"conflicting_owner_refs={len(audit.conflicting_owners)}")
    print(f"duplicate_refs={len(audit.duplicate_refs)}")
    if audit.prefix_mismatches:
        print("prefix_subclass_mismatch_sample=" + json.dumps(_sample(audit.prefix_mismatches, sample_limit)))
    if audit.conflicting_owners:
        print("conflicting_owner_sample=" + json.dumps(_sample(audit.conflicting_owners, sample_limit)))
    if audit.duplicate_refs:
        print("duplicate_ref_sample=" + json.dumps(_sample(audit.duplicate_refs, sample_limit)))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only structural audit of Schedule 2 parsing for an official compilation."
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--compilation", default=DEFAULT_COMPILATION)
    parser.add_argument("--volume2", type=Path, default=None)
    parser.add_argument("--volume3", type=Path, default=None)
    parser.add_argument("--persisted-index", type=Path, default=SCHEDULE2_INDEX_PATH)
    parser.add_argument("--sample-limit", type=int, default=30)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
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

    for path in (volume2, volume3, args.persisted_index):
        if not path.exists() or path.stat().st_size == 0:
            raise SystemExit(f"missing or empty required file: {path}")

    vol2_pages = pages_from_sections(read_pdf_sections(volume2), volume=2)
    vol3_pages = pages_from_sections(read_pdf_sections(volume3), volume=3)
    scoped2 = delimit_schedule2_pages(vol2_pages)
    scoped3 = delimit_schedule2_pages(vol3_pages)
    scoped_pages = scoped2 + scoped3

    print("Schedule 2 structural audit — READ ONLY")
    print(f"compilation={args.compilation}")
    print(f"volume2_pages={len(vol2_pages)}")
    print(f"volume3_pages={len(vol3_pages)}")
    print(f"scoped_schedule2_pages_vol2={len(scoped2)}")
    print(f"scoped_schedule2_pages_vol3={len(scoped3)}")
    print(
        "schedule_headers_vol2="
        + json.dumps(
            [(page.section_ref, page.detected_schedule) for page in vol2_pages if page.detected_schedule]
        )
    )
    print(
        "schedule_headers_vol3="
        + json.dumps(
            [(page.section_ref, page.detected_schedule) for page in vol3_pages if page.detected_schedule]
        )
    )
    if not scoped_pages:
        print("ERROR: no Schedule 2 pages were structurally delimited")
        return 2

    full_text = _joined_text(vol2_pages + vol3_pages)
    scoped_text = _joined_text(scoped_pages)
    full_rows = parse_schedule2_text(
        full_text,
        source_file=f"{volume2}|{volume3}",
        source_title=f"Migration Regulations 1994 {args.compilation} full Volumes 2-3 audit",
    )
    scoped_rows = parse_schedule2_text(
        scoped_text,
        source_file=f"{volume2}|{volume3}",
        source_title=f"Migration Regulations 1994 {args.compilation} structurally delimited Schedule 2 audit",
    )
    persisted_rows = read_index(args.persisted_index)

    full_audit = audit_rows(full_rows)
    scoped_audit = audit_rows(scoped_rows)
    persisted_audit = audit_rows(persisted_rows)

    _print_row_audit("Current full-volume parse", full_audit, sample_limit=args.sample_limit)
    _print_row_audit("Page-delimited Schedule-2 parse", scoped_audit, sample_limit=args.sample_limit)
    _print_row_audit("Persisted Schedule-2 index", persisted_audit, sample_limit=args.sample_limit)

    full_counter = _ref_counter(full_rows)
    scoped_counter = _ref_counter(scoped_rows)
    persisted_counter = _ref_counter(persisted_rows)

    full_only = sorted(set(full_counter) - set(scoped_counter))
    scoped_only = sorted(set(scoped_counter) - set(full_counter))
    persisted_only_vs_scoped = sorted(set(persisted_counter) - set(scoped_counter))
    scoped_missing_from_persisted = sorted(set(scoped_counter) - set(persisted_counter))
    multiplicity_diffs = sorted(
        (
            ref,
            full_counter.get(ref, 0),
            scoped_counter.get(ref, 0),
            persisted_counter.get(ref, 0),
        )
        for ref in set(full_counter) | set(scoped_counter) | set(persisted_counter)
        if len(
            {
                full_counter.get(ref, 0),
                scoped_counter.get(ref, 0),
                persisted_counter.get(ref, 0),
            }
        )
        > 1
    )

    print("\n=== Cross-view comparison ===")
    print(f"full_only_unique_refs={len(full_only)}")
    print(f"scoped_only_unique_refs={len(scoped_only)}")
    print(f"persisted_only_vs_scoped={len(persisted_only_vs_scoped)}")
    print(f"scoped_missing_from_persisted={len(scoped_missing_from_persisted)}")
    print(f"multiplicity_differences={len(multiplicity_diffs)}")
    if full_only:
        print("full_only_sample=" + json.dumps(_sample(full_only, args.sample_limit)))
    if scoped_only:
        print("scoped_only_sample=" + json.dumps(_sample(scoped_only, args.sample_limit)))
    if persisted_only_vs_scoped:
        print(
            "persisted_only_vs_scoped_sample="
            + json.dumps(_sample(persisted_only_vs_scoped, args.sample_limit))
        )
    if scoped_missing_from_persisted:
        print(
            "scoped_missing_from_persisted_sample="
            + json.dumps(_sample(scoped_missing_from_persisted, args.sample_limit))
        )
    if multiplicity_diffs:
        print("multiplicity_difference_sample=" + json.dumps(_sample(multiplicity_diffs, args.sample_limit)))

    print("\nInterpretation guardrails")
    print("  This audit does not modify the corpus, indexes, graph, or serving path.")
    print("  A mismatch is a structural warning, not a legal conclusion.")
    print("  Do not change the expected 2385 graph count until these warnings are reviewed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
