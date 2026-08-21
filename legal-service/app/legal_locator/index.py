from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Mapping, Sequence

ROOT_DIR = Path(__file__).resolve().parents[2]
PROCESSED_DIR = ROOT_DIR / "data" / "processed" / "legal_locator_index"
DEFAULT_INDEX_PATH = PROCESSED_DIR / "migration_regulations_F2026C00667.jsonl"
DEFAULT_MANIFEST_PATH = PROCESSED_DIR / "migration_regulations_F2026C00667_manifest.json"

SCHEMA_VERSION = 1
DOCUMENT_FAMILY = "Migration Regulations 1994"

REGULATION_HEADING_RE = re.compile(
    r"^\s*(?P<ref>[1-5]\.\d{1,3}[A-Z]{0,3})\s*(?:[-–—]\s*)?(?P<tail>[^\n]*)$",
    re.I,
)
SCHEDULE_CODE_RE = {
    "3": re.compile(r"^\s*(?P<ref>3\d{3}[A-Z]{0,2})\s*(?P<tail>[^\n]*)$", re.I),
    "4": re.compile(r"^\s*(?P<ref>4\d{3}[A-Z]{0,2})\s*(?P<tail>[^\n]*)$", re.I),
    "8": re.compile(r"^\s*(?P<ref>8\d{3}[A-Z]{0,2})\s*(?P<tail>[^\n]*)$", re.I),
}
SCHEDULE_HEADER_RE = re.compile(r"^\s*Schedule\s+([0-9]+[A-Z]?)\b", re.I)
DOT_LEADER_RE = re.compile(r"\.{3,}")
PAGE_REF_RE = re.compile(r"^page_(\d+)$", re.I)


@dataclass(slots=True)
class LegalLocatorRecord:
    locator: str
    normalized_locator: str
    locator_type: str
    provision_ref: str
    schedule_no: str | None
    document_family: str
    document_version: str
    compilation_number: str
    effective_date: str
    volume: int
    page_start: int
    page_end: int
    page_refs: list[str]
    heading: str
    aliases: list[str]
    source_file: str
    source_title: str

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: Mapping[str, object]) -> "LegalLocatorRecord":
        return cls(
            locator=str(payload["locator"]),
            normalized_locator=str(payload["normalized_locator"]),
            locator_type=str(payload["locator_type"]),
            provision_ref=str(payload["provision_ref"]),
            schedule_no=(
                str(payload["schedule_no"])
                if payload.get("schedule_no") is not None
                else None
            ),
            document_family=str(payload["document_family"]),
            document_version=str(payload["document_version"]),
            compilation_number=str(payload["compilation_number"]),
            effective_date=str(payload["effective_date"]),
            volume=int(payload["volume"]),
            page_start=int(payload["page_start"]),
            page_end=int(payload["page_end"]),
            page_refs=[str(value) for value in payload.get("page_refs", [])],
            heading=str(payload.get("heading") or ""),
            aliases=[str(value) for value in payload.get("aliases", [])],
            source_file=str(payload["source_file"]),
            source_title=str(payload["source_title"]),
        )


@dataclass(slots=True, frozen=True)
class _Page:
    ordinal: int
    section_ref: str
    text: str


@dataclass(slots=True, frozen=True)
class _Candidate:
    provision_ref: str
    page_pos: int
    line_pos: int
    tail: str
    score: int


def normalize_query(value: str) -> str:
    text = (value or "").strip().casefold()
    text = text.replace("public interest criterion", "pic")
    text = text.replace("visa condition", "condition")
    text = re.sub(r"\bregulations?\b", "reg", text)
    text = re.sub(r"[-–—_:,/]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _normalized_identity(locator_type: str, provision_ref: str) -> str:
    return f"{locator_type}:{provision_ref.casefold()}"


def _page_number(section_ref: str, fallback: int) -> int:
    match = PAGE_REF_RE.match(section_ref or "")
    if match:
        return int(match.group(1))
    return fallback


def _pages(sections: Sequence[Mapping[str, object]]) -> list[_Page]:
    pages: list[_Page] = []
    for fallback, section in enumerate(sections, start=1):
        text = str(section.get("text") or "").strip()
        if not text:
            continue
        section_ref = str(section.get("section_ref") or f"page_{fallback}")
        pages.append(
            _Page(
                ordinal=_page_number(section_ref, fallback),
                section_ref=section_ref,
                text=text,
            )
        )
    return pages


def _nonempty_lines(text: str) -> list[str]:
    return [line.strip() for line in (text or "").splitlines() if line.strip()]


def _looks_like_contents_page(text: str) -> bool:
    lines = _nonempty_lines(text)
    if not lines:
        return False
    head = " ".join(lines[:8]).casefold()
    if "contents" in head or "table of provisions" in head:
        return True
    dot_leaders = sum(bool(DOT_LEADER_RE.search(line)) for line in lines[:80])
    return dot_leaders >= 4


def _page_schedule(text: str) -> str | None:
    lines = _nonempty_lines(text)
    for line in lines[:20]:
        match = SCHEDULE_HEADER_RE.match(line)
        if match:
            return match.group(1).upper()
    return None


def _candidate_score(*, tail: str, raw_line: str, next_line: str, regulation: bool) -> int:
    tail = tail.strip()
    if DOT_LEADER_RE.search(raw_line):
        return -100
    if tail.startswith((",", ";", ")", "]")):
        return -100

    score = 0
    if regulation:
        if not tail or tail.startswith("("):
            return -100
        if re.search(r"[A-Za-z]", tail):
            score += 4
        if any(mark in raw_line for mark in ("—", "–")):
            score += 2
    else:
        if not tail:
            score += 6
        elif tail.startswith("("):
            score += 5
        elif re.search(r"[A-Za-z]", tail):
            score += 2

    if next_line.startswith("("):
        score += 3
    elif re.match(r"^(The|If|For|In|An?|Subject|Despite|Unless)\b", next_line):
        score += 1
    return score


def _collect_candidates(
    pages: Sequence[_Page],
    *,
    pattern: re.Pattern[str],
    regulation: bool,
    required_schedule: str | None = None,
) -> tuple[list[_Candidate], list[int]]:
    candidates: list[_Candidate] = []
    eligible_page_positions: list[int] = []
    carried_schedule: str | None = None

    for page_pos, page in enumerate(pages):
        if _looks_like_contents_page(page.text):
            continue

        detected = _page_schedule(page.text)
        if detected:
            carried_schedule = detected

        if required_schedule is not None and carried_schedule != required_schedule:
            continue

        eligible_page_positions.append(page_pos)
        lines = _nonempty_lines(page.text)
        for line_pos, line in enumerate(lines):
            match = pattern.match(line)
            if not match:
                continue
            tail = (match.groupdict().get("tail") or "").strip()
            next_line = lines[line_pos + 1] if line_pos + 1 < len(lines) else ""
            score = _candidate_score(
                tail=tail,
                raw_line=line,
                next_line=next_line,
                regulation=regulation,
            )
            if score < 0:
                continue
            candidates.append(
                _Candidate(
                    provision_ref=match.group("ref").upper(),
                    page_pos=page_pos,
                    line_pos=line_pos,
                    tail=tail,
                    score=score,
                )
            )

    return candidates, eligible_page_positions


def _select_unique_candidates(candidates: Iterable[_Candidate]) -> list[_Candidate]:
    grouped: dict[str, list[_Candidate]] = defaultdict(list)
    for candidate in candidates:
        grouped[candidate.provision_ref].append(candidate)

    selected: list[_Candidate] = []
    for items in grouped.values():
        best = sorted(
            items,
            key=lambda item: (-item.score, item.page_pos, item.line_pos),
        )[0]
        selected.append(best)

    return sorted(
        selected,
        key=lambda item: (item.page_pos, item.line_pos, item.provision_ref),
    )


def _heading_for_candidate(candidate: _Candidate) -> str:
    tail = candidate.tail.strip(" -–—\t")
    return tail[:300] if tail else candidate.provision_ref


def _aliases(locator_type: str, provision_ref: str) -> list[str]:
    if locator_type == "regulation":
        values = [provision_ref, f"regulation {provision_ref}", f"reg {provision_ref}"]
    elif locator_type == "schedule3_criterion":
        values = [provision_ref, f"criterion {provision_ref}", f"Schedule 3 criterion {provision_ref}"]
    elif locator_type == "schedule4_pic":
        values = [
            provision_ref,
            f"PIC {provision_ref}",
            f"Public Interest Criterion {provision_ref}",
            f"Schedule 4 criterion {provision_ref}",
        ]
    elif locator_type == "schedule8_condition":
        values = [
            provision_ref,
            f"condition {provision_ref}",
            f"visa condition {provision_ref}",
            f"Schedule 8 condition {provision_ref}",
        ]
    else:
        values = [provision_ref]
    return list(dict.fromkeys(values))


def _display_locator(locator_type: str, provision_ref: str) -> str:
    if locator_type == "regulation":
        return f"regulation {provision_ref}"
    if locator_type == "schedule3_criterion":
        return f"Schedule 3 criterion {provision_ref}"
    if locator_type == "schedule4_pic":
        return f"PIC {provision_ref}"
    if locator_type == "schedule8_condition":
        return f"condition {provision_ref}"
    return provision_ref


def _records_from_candidates(
    *,
    pages: Sequence[_Page],
    candidates: Sequence[_Candidate],
    eligible_page_positions: Sequence[int],
    locator_type: str,
    schedule_no: str | None,
    document_version: str,
    compilation_number: str,
    effective_date: str,
    volume: int,
    source_file: str,
    source_title: str,
) -> list[LegalLocatorRecord]:
    if not candidates:
        return []

    eligible = set(eligible_page_positions)
    last_eligible = max(eligible_page_positions) if eligible_page_positions else len(pages) - 1
    records: list[LegalLocatorRecord] = []

    for idx, candidate in enumerate(candidates):
        if idx + 1 < len(candidates):
            next_page = candidates[idx + 1].page_pos
            end_pos = next_page if next_page > candidate.page_pos else candidate.page_pos
        else:
            end_pos = last_eligible

        page_refs = [
            pages[pos].section_ref
            for pos in range(candidate.page_pos, min(end_pos, len(pages) - 1) + 1)
            if pos in eligible
        ]
        if not page_refs:
            page_refs = [pages[candidate.page_pos].section_ref]

        page_numbers = [_page_number(ref, pages[candidate.page_pos].ordinal) for ref in page_refs]
        provision_ref = candidate.provision_ref
        records.append(
            LegalLocatorRecord(
                locator=_display_locator(locator_type, provision_ref),
                normalized_locator=_normalized_identity(locator_type, provision_ref),
                locator_type=locator_type,
                provision_ref=provision_ref,
                schedule_no=schedule_no,
                document_family=DOCUMENT_FAMILY,
                document_version=document_version,
                compilation_number=compilation_number,
                effective_date=effective_date,
                volume=volume,
                page_start=min(page_numbers),
                page_end=max(page_numbers),
                page_refs=page_refs,
                heading=_heading_for_candidate(candidate),
                aliases=_aliases(locator_type, provision_ref),
                source_file=source_file,
                source_title=source_title,
            )
        )
    return records


def build_locator_records(
    *,
    volume1_sections: Sequence[Mapping[str, object]],
    volume3_sections: Sequence[Mapping[str, object]],
    document_version: str,
    compilation_number: str,
    effective_date: str,
    volume1_source_file: str,
    volume3_source_file: str,
) -> list[LegalLocatorRecord]:
    volume1_pages = _pages(volume1_sections)
    volume3_pages = _pages(volume3_sections)

    reg_candidates, reg_pages = _collect_candidates(
        volume1_pages,
        pattern=REGULATION_HEADING_RE,
        regulation=True,
    )
    selected_regs = _select_unique_candidates(reg_candidates)

    records = _records_from_candidates(
        pages=volume1_pages,
        candidates=selected_regs,
        eligible_page_positions=reg_pages,
        locator_type="regulation",
        schedule_no=None,
        document_version=document_version,
        compilation_number=compilation_number,
        effective_date=effective_date,
        volume=1,
        source_file=volume1_source_file,
        source_title=f"{DOCUMENT_FAMILY} {document_version} Volume 1",
    )

    for schedule_no, locator_type in (
        ("3", "schedule3_criterion"),
        ("4", "schedule4_pic"),
        ("8", "schedule8_condition"),
    ):
        candidates, page_positions = _collect_candidates(
            volume3_pages,
            pattern=SCHEDULE_CODE_RE[schedule_no],
            regulation=False,
            required_schedule=schedule_no,
        )
        selected = _select_unique_candidates(candidates)
        records.extend(
            _records_from_candidates(
                pages=volume3_pages,
                candidates=selected,
                eligible_page_positions=page_positions,
                locator_type=locator_type,
                schedule_no=schedule_no,
                document_version=document_version,
                compilation_number=compilation_number,
                effective_date=effective_date,
                volume=3,
                source_file=volume3_source_file,
                source_title=f"{DOCUMENT_FAMILY} {document_version} Volume 3",
            )
        )

    return sorted(
        records,
        key=lambda record: (
            record.volume,
            record.page_start,
            record.page_end,
            record.locator_type,
            record.provision_ref,
        ),
    )


def validate_records(records: Sequence[LegalLocatorRecord]) -> list[str]:
    errors: list[str] = []
    normalized = [record.normalized_locator for record in records]
    duplicates = sorted(key for key, count in Counter(normalized).items() if count > 1)
    if duplicates:
        errors.append(f"duplicate normalized locators: {duplicates[:20]}")

    for record in records:
        if not record.page_refs:
            errors.append(f"{record.normalized_locator}: empty page_refs")
            continue
        if record.page_start > record.page_end:
            errors.append(f"{record.normalized_locator}: page_start > page_end")
        page_numbers = [_page_number(ref, -1) for ref in record.page_refs]
        if any(value < 1 for value in page_numbers):
            errors.append(f"{record.normalized_locator}: invalid page ref")
        if page_numbers != sorted(dict.fromkeys(page_numbers)):
            errors.append(f"{record.normalized_locator}: page refs are not ordered/unique")
        if record.page_start != min(page_numbers):
            errors.append(f"{record.normalized_locator}: page_start mismatch")
        if record.page_end != max(page_numbers):
            errors.append(f"{record.normalized_locator}: page_end mismatch")

        if record.locator_type == "regulation":
            if record.schedule_no is not None or record.volume != 1:
                errors.append(f"{record.normalized_locator}: invalid regulation placement")
        elif record.locator_type == "schedule3_criterion":
            if record.schedule_no != "3" or not record.provision_ref.startswith("3"):
                errors.append(f"{record.normalized_locator}: invalid Schedule 3 identity")
        elif record.locator_type == "schedule4_pic":
            if record.schedule_no != "4" or not record.provision_ref.startswith("4"):
                errors.append(f"{record.normalized_locator}: invalid Schedule 4 identity")
        elif record.locator_type == "schedule8_condition":
            if record.schedule_no != "8" or not record.provision_ref.startswith("8"):
                errors.append(f"{record.normalized_locator}: invalid Schedule 8 identity")
        else:
            errors.append(f"{record.normalized_locator}: unsupported locator type {record.locator_type}")
    return errors


def write_index(path: Path, records: Sequence[LegalLocatorRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record.to_dict(), ensure_ascii=False, sort_keys=True) + "\n")
    tmp.replace(path)


def read_index(path: Path) -> list[LegalLocatorRecord]:
    if not path.exists():
        return []
    records: list[LegalLocatorRecord] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if line:
            records.append(LegalLocatorRecord.from_dict(json.loads(line)))
    return records


def build_manifest(
    *,
    records: Sequence[LegalLocatorRecord],
    document_version: str,
    compilation_number: str,
    effective_date: str,
    source_files: Sequence[str],
) -> dict:
    counts = Counter(record.locator_type for record in records)
    return {
        "schema_version": SCHEMA_VERSION,
        "document_family": DOCUMENT_FAMILY,
        "document_version": document_version,
        "compilation_number": compilation_number,
        "effective_date": effective_date,
        "source_files": list(source_files),
        "record_count": len(records),
        "counts_by_type": dict(sorted(counts.items())),
    }


def write_manifest(path: Path, manifest: Mapping[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(dict(manifest), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)


def lookup(query: str, records: Sequence[LegalLocatorRecord]) -> list[LegalLocatorRecord]:
    needle = normalize_query(query)
    if not needle:
        return []
    matches: list[LegalLocatorRecord] = []
    for record in records:
        candidates = [record.locator, *record.aliases]
        if any(normalize_query(candidate) == needle for candidate in candidates):
            matches.append(record)
    return matches
