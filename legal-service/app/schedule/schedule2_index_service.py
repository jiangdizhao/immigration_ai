from __future__ import annotations

import json
import re
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Mapping

from app.schedule.schemas import ScheduleClause

ROOT_DIR = Path(__file__).resolve().parents[2]
RAW_LEGISLATION_DIR = ROOT_DIR / "data" / "raw" / "legislation"
PROCESSED_INDEX_DIR = ROOT_DIR / "data" / "processed" / "schedule_index"
SCHEDULE2_INDEX_PATH = PROCESSED_INDEX_DIR / "schedule2_clauses.jsonl"
SCHEDULE1_INDEX_PATH = PROCESSED_INDEX_DIR / "schedule1_clauses.jsonl"

SUBCLASS_RE = re.compile(r"(?:^|\n)\s*Subclass\s+([0-9A-Z]{3,4})\s*[-–—]{1,2}\s*([^\n]+)", re.I)
SCHEDULE1_ITEM_RE = re.compile(r"(?:^|\n)\s*([0-9]{4}[A-Z]{0,3})\s+([^\n]{2,160})")
SECTION_RE = re.compile(
    r"(?:^|\n)\s*((?:[0-9A-Z]{3,4}\.)[0-9A-Z]+(?:\([^\)]*\))?)\s*(?:[-–—]{1,2}\s*([^\n]+))?",
    re.I,
)


def norm_text(text: str) -> str:
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _source_identity(source_title: str | None, source_file: str | None) -> str:
    return f"{source_title or ''} {source_file or ''}".lower()


def looks_like_schedule_source(*, schedule_no: str, source_title: str | None, source_file: str | None, metadata: Mapping[str, Any] | None = None) -> bool:
    """Return true when a DB/source record appears to be a Schedule 1 or 2 source.

    The database is the preferred source for the Schedule index when the user has
    already ingested and embedded Schedule PDFs. The matcher is intentionally
    title/path/metadata based so ordinary references to Schedule 2 inside other
    guidance pages do not get treated as the authoritative Schedule 2 corpus.
    """

    blob = _source_identity(source_title, source_file)
    if metadata:
        blob += " " + json.dumps(dict(metadata), ensure_ascii=False).lower()
    wanted = f"schedule {schedule_no}"
    compact = re.sub(r"\s+", " ", blob)
    return (
        wanted in compact
        and "migration regulations" in compact
        and ("schedule" in compact or "sch" in compact)
    )


def section_kind_from_heading(heading: str, clause_ref: str, text: str = "") -> str:
    blob = f"{heading} {clause_ref} {text[:300]}".lower()
    if "interpretation" in blob:
        return "interpretation"
    if "primary criteria" in blob:
        return "primary_criteria"
    if "time of application" in blob or "at time of application" in blob:
        return "time_of_application"
    if "time of decision" in blob or "at time of decision" in blob:
        return "time_of_decision"
    if "secondary criteria" in blob:
        return "secondary_criteria"
    if "circumstances applicable to grant" in blob:
        return "circumstances_applicable_to_grant"
    if "when visa is in effect" in blob or "visa is in effect" in blob:
        return "visa_effect"
    if "conditions" in blob:
        return "conditions"
    return "other"


def detect_deferred_dependencies(text: str) -> list[str]:
    low = (text or "").lower()
    deps: set[str] = set()
    if "schedule 3" in low or re.search(r"\b30\d{2}\b", low):
        deps.add("schedule3_unlawful_or_bridging_special_criteria")
    if "public interest criterion" in low or re.search(r"\b4\d{3}[a-z]?\b", low):
        deps.add("pic_4000_series")
    if re.search(r"\b8\d{3}\b", low) or "condition " in low:
        deps.add("schedule8_visa_conditions")
    if "health" in low:
        deps.add("health_requirement")
    if "character" in low or "criminal" in low:
        deps.add("character_or_criminal_issue")
    if "security" in low:
        deps.add("security_assessment")
    return sorted(deps)


def _read_source_json(path: Path) -> tuple[str, str, list[dict]] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return None
    title = str(data.get("title") or path.stem)
    source_title = str(data.get("citation_text") or title)
    sections = data.get("sections") or []
    if not isinstance(sections, list):
        sections = []
    return title, source_title, [s for s in sections if isinstance(s, dict)]


def _iter_schedule_source_files(schedule_no: str) -> Iterable[Path]:
    if not RAW_LEGISLATION_DIR.exists():
        return []
    patterns = [
        f"*SCHEDULE {schedule_no}*.json",
        f"*Schedule {schedule_no}*.json",
        f"*schedule {schedule_no}*.json",
    ]
    seen: set[Path] = set()
    out: list[Path] = []
    for pattern in patterns:
        for path in RAW_LEGISLATION_DIR.rglob(pattern):
            if path not in seen:
                seen.add(path)
                out.append(path)
    return sorted(out)


def _subclass_title_at(text: str, pos: int) -> tuple[str | None, str | None]:
    last: tuple[str | None, str | None] = (None, None)
    for match in SUBCLASS_RE.finditer(text[: pos + 1]):
        last = (match.group(1).upper(), norm_text(match.group(2))[:160])
    return last


def parse_schedule2_text(text: str, *, source_file: str, source_title: str) -> list[ScheduleClause]:
    text = norm_text(text)
    if not text:
        return []

    matches = list(SECTION_RE.finditer(text))
    clauses: list[ScheduleClause] = []

    if not matches:
        subclass_matches = list(SUBCLASS_RE.finditer(text))
        for idx, sub_match in enumerate(subclass_matches):
            next_match = subclass_matches[idx + 1] if idx + 1 < len(subclass_matches) else None
            start = sub_match.start()
            end = next_match.start() if next_match else len(text)
            sub = sub_match.group(1).upper()
            title = norm_text(sub_match.group(2))[:160]
            body = text[start:end].strip()
            if len(body) < 40:
                continue
            clauses.append(
                ScheduleClause(
                    schedule_no="2",
                    subclass=sub,
                    title=title,
                    clause_ref=f"{sub}.block",
                    heading=f"Subclass {sub} -- {title}",
                    section_kind="other",
                    text=body,
                    source_file=source_file,
                    source_title=source_title,
                    start_index=start,
                    end_index=end,
                    deferred_dependencies=detect_deferred_dependencies(body),
                )
            )
        return clauses

    for idx, match in enumerate(matches):
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        clause_ref = match.group(1).strip()
        heading = norm_text(match.group(2) or "")
        body = text[start:end].strip()
        if len(body) < 20:
            continue
        subclass, subclass_title = _subclass_title_at(text, start)
        clauses.append(
            ScheduleClause(
                schedule_no="2",
                subclass=subclass or clause_ref.split(".", 1)[0].upper(),
                title=subclass_title,
                clause_ref=clause_ref,
                heading=heading or clause_ref,
                section_kind=section_kind_from_heading(heading, clause_ref, body),
                text=body,
                source_file=source_file,
                source_title=source_title,
                start_index=start,
                end_index=end,
                deferred_dependencies=detect_deferred_dependencies(body),
            )
        )
    return clauses


def parse_schedule1_text(text: str, *, source_file: str, source_title: str) -> list[ScheduleClause]:
    text = norm_text(text)
    matches = list(SCHEDULE1_ITEM_RE.finditer(text))
    clauses: list[ScheduleClause] = []
    for idx, match in enumerate(matches):
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        class_code = match.group(1).upper()
        title = norm_text(match.group(2))[:160]
        body = text[start:end].strip()
        if len(body) < 40:
            continue
        subclass_numbers = sorted(set(re.findall(r"\bSubclass\s+([0-9A-Z]{3,4})\b", body, flags=re.I)))
        subclass = subclass_numbers[0].upper() if len(subclass_numbers) == 1 else None
        clauses.append(
            ScheduleClause(
                schedule_no="1",
                subclass=subclass,
                class_code=class_code,
                title=title,
                clause_ref=class_code,
                heading=title,
                section_kind="schedule1_validity",
                text=body,
                source_file=source_file,
                source_title=source_title,
                start_index=start,
                end_index=end,
                deferred_dependencies=detect_deferred_dependencies(body),
            )
        )
    return clauses


# Backwards-compatible private aliases used by earlier patch scripts/tests.
_parse_schedule2_text = parse_schedule2_text
_parse_schedule1_text = parse_schedule1_text


def build_index_from_raw(schedule_no: str) -> list[ScheduleClause]:
    clauses: list[ScheduleClause] = []
    for path in _iter_schedule_source_files(schedule_no):
        source = _read_source_json(path)
        if not source:
            continue
        _title, source_title, sections = source
        full_text = "\n\n".join(str(section.get("text") or "") for section in sections)
        if schedule_no == "2":
            clauses.extend(parse_schedule2_text(full_text, source_file=str(path), source_title=source_title))
        elif schedule_no == "1":
            clauses.extend(parse_schedule1_text(full_text, source_file=str(path), source_title=source_title))
    return clauses


def build_index_from_db_records(schedule_no: str, records: Iterable[Mapping[str, Any]]) -> list[ScheduleClause]:
    """Build a Schedule index from already-ingested DB chunks.

    Expected record keys are intentionally plain so the function can be tested
    without a database: source_id, chunk_id, source_title, source_file,
    chunk_index, section_ref, heading, text, metadata_json.
    """

    grouped: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    source_titles: dict[str, str] = {}
    source_files: dict[str, str] = {}

    for record in records:
        source_title = str(record.get("source_title") or record.get("title") or "")
        source_file = str(record.get("source_file") or record.get("url") or "")
        metadata = record.get("metadata_json") if isinstance(record.get("metadata_json"), Mapping) else {}
        if not looks_like_schedule_source(schedule_no=schedule_no, source_title=source_title, source_file=source_file, metadata=metadata):
            continue
        source_id = str(record.get("source_id") or source_title or source_file or "unknown_source")
        grouped[source_id].append(record)
        source_titles[source_id] = source_title or source_id
        source_files[source_id] = source_file or source_id

    clauses: list[ScheduleClause] = []
    for source_id, items in grouped.items():
        ordered = sorted(items, key=lambda item: int(item.get("chunk_index") or 0))
        parts: list[str] = []
        for item in ordered:
            heading = str(item.get("heading") or "").strip()
            section_ref = str(item.get("section_ref") or "").strip()
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            # Preserve headings/page refs to help regex boundaries without
            # inventing legal structure.
            if heading and heading.lower() not in text[:120].lower():
                parts.append(f"\n{heading}\n{text}")
            elif section_ref:
                parts.append(f"\n{section_ref}\n{text}")
            else:
                parts.append(text)
        full_text = norm_text("\n\n".join(parts))
        if not full_text:
            continue
        if schedule_no == "2":
            clauses.extend(parse_schedule2_text(full_text, source_file=source_files[source_id], source_title=source_titles[source_id]))
        elif schedule_no == "1":
            clauses.extend(parse_schedule1_text(full_text, source_file=source_files[source_id], source_title=source_titles[source_id]))
    return clauses


def write_index(path: Path, clauses: list[ScheduleClause]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for clause in clauses:
            f.write(json.dumps(clause.model_dump(), ensure_ascii=False) + "\n")


def read_index(path: Path) -> list[ScheduleClause]:
    if not path.exists():
        return []
    clauses: list[ScheduleClause] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            clauses.append(ScheduleClause(**json.loads(line)))
        except Exception:
            continue
    return clauses


class ScheduleIndexService:
    """Load or lazily build Schedule 1 / Schedule 2 clause indexes.

    Runtime code reads the processed JSONL files. Build those files from the DB
    with scripts/build_schedule_index_from_db.py. If no processed index exists,
    this service falls back to local raw JSON files so the package remains useful
    in offline/dev environments.
    """

    def __init__(self, *, schedule2_path: Path | None = None, schedule1_path: Path | None = None) -> None:
        self.schedule2_path = schedule2_path or SCHEDULE2_INDEX_PATH
        self.schedule1_path = schedule1_path or SCHEDULE1_INDEX_PATH

    @lru_cache(maxsize=1)
    def schedule2_clauses(self) -> tuple[ScheduleClause, ...]:
        clauses = read_index(self.schedule2_path)
        if not clauses:
            clauses = build_index_from_raw("2")
        return tuple(clauses)

    @lru_cache(maxsize=1)
    def schedule1_clauses(self) -> tuple[ScheduleClause, ...]:
        clauses = read_index(self.schedule1_path)
        if not clauses:
            clauses = build_index_from_raw("1")
        return tuple(clauses)

    def clauses_for_subclass(self, subclass: str, *, schedule_no: str = "2") -> list[ScheduleClause]:
        subclass = str(subclass or "").strip().upper()
        if not subclass:
            return []
        clauses = self.schedule2_clauses() if schedule_no == "2" else self.schedule1_clauses()
        return [clause for clause in clauses if str(clause.subclass or "").upper() == subclass]

    def top_titles(self, subclass: str, *, schedule_no: str = "2") -> list[str]:
        titles: list[str] = []
        for clause in self.clauses_for_subclass(subclass, schedule_no=schedule_no):
            if clause.title and clause.title not in titles:
                titles.append(clause.title)
        return titles[:3]
