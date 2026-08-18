#!/usr/bin/env python3
"""Phase 4A — read-only canonical corpus coverage audit.

This offline developer tool inventories the *authoritative local PostgreSQL*
canonical corpus. It never ingests, downloads, or updates source data. The
only write it can make is the requested generated report artifact.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping
from urllib.parse import urlparse

_HERE = Path(__file__).resolve().parent
_PROJECT = _HERE.parent
if str(_PROJECT) not in sys.path:
    sys.path.insert(0, str(_PROJECT))

from sqlalchemy import func, select, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.db.models import Case, LegalSource, SourceChunk  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.schemas.canonical_corpus_coverage import (  # noqa: E402
    CanonicalCorpusCoverageReport,
    compute_report_hash,
)

DEFAULT_ARTIFACT = _PROJECT / "artifacts" / "canonical_corpus_coverage_report.json"
SCHEDULE_INDEX_DIR = _PROJECT / "data" / "processed" / "schedule_index"
SCHEDULE_INDEX_PATHS = (
    SCHEDULE_INDEX_DIR / "schedule1_clauses.jsonl",
    SCHEDULE_INDEX_DIR / "schedule2_clauses.jsonl",
)

REQUIRED_FAMILY_IDS = (
    "migration_act",
    "migration_regulations",
    "migration_regulations_schedule_1",
    "migration_regulations_schedule_2",
    "migration_regulations_schedule_3",
    "legislative_instruments",
    "court_decisions",
    "art_tribunal_material",
    "home_affairs_guidance",
    "historical_versions",
)

_LEGISLATION_TYPES = {
    "act",
    "legislation",
    "legislative_instrument",
    "instrument",
    "regulation",
    "regulations",
}
_COURT_TYPES = {"case", "case_law", "court_decision", "decision"}
_ART_TYPES = {
    "administrative_appeals_tribunal",
    "administrative_review_tribunal",
    "art",
    "tribunal",
}
_SCHEDULE_LOCATOR_RE = re.compile(r"\bschedule\s*[-_/]?\s*(\d+[a-z]?)\b", re.IGNORECASE)
_MIGRATION_REGULATIONS_RE = re.compile(r"\bmigration\s+regulations\s+1994\b", re.IGNORECASE)
_MIGRATION_ACT_RE = re.compile(r"\bmigration\s+act\s+1958\b", re.IGNORECASE)
_HOME_AFFAIRS_RE = re.compile(r"\b(?:department\s+of\s+)?home\s+affairs\b", re.IGNORECASE)
_TRIBUNAL_RE = re.compile(
    r"\b(?:administrative\s+(?:appeals|review)\s+tribunal|a(?:a|r)t|tribunal)\b",
    re.IGNORECASE,
)


class AuditUnavailableError(RuntimeError):
    """Raised when the authoritative local corpus cannot be safely audited."""


@dataclass(frozen=True, slots=True)
class SourceSnapshot:
    """The bounded LegalSource fields needed after the read-only session closes."""

    id: str
    title: str
    source_type: str
    authority: str
    url: str | None
    effective_date: date | None
    document_version: str | None
    metadata: Mapping[str, Any]
    content_hash: str | None


@dataclass(frozen=True, slots=True)
class ChunkSnapshot:
    """The bounded SourceChunk fields needed for coverage metadata only."""

    id: str
    source_id: str
    chunk_index: int
    section_ref: str | None
    heading: str | None


@dataclass(frozen=True, slots=True)
class CaseSnapshot:
    """The bounded Case fields needed for the court-decision inventory."""

    id: str
    title: str
    court: str | None
    decision_date: date | None
    url: str | None
    primary_source_id: str | None


@dataclass(frozen=True, slots=True)
class IndexInventory:
    """A hash-only inventory of the existing Schedule indexes."""

    relative_path: str
    record_count: int
    sha256: str


@dataclass(frozen=True, slots=True)
class AuditSnapshot:
    """Detached, plain audit input.

    All classification, aggregation, hashing, and report generation use this
    structure. ORM entities are deliberately not retained after the session is
    rolled back and closed.
    """

    sources: tuple[SourceSnapshot, ...] = ()
    chunks: tuple[ChunkSnapshot, ...] = ()
    cases: tuple[CaseSnapshot, ...] = ()
    index_inventory: tuple[IndexInventory, ...] = ()
    corpus_version: str | None = None
    table_counts_before: Mapping[str, int] | None = None
    table_counts_after: Mapping[str, int] | None = None


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _safe_metadata(value: Any) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        return {}
    allowed = {
        "act",
        "content_hash",
        "document_family",
        "document_type",
        "family",
        "family_id",
        "instrument_kind",
        "schedule",
        "schedule_no",
        "schedule_number",
        "source_family",
    }
    return {str(key): item for key, item in value.items() if isinstance(key, str) and key in allowed}


def _metadata_text(metadata: Mapping[str, Any]) -> str:
    return " ".join(_safe_text(value) for value in metadata.values())


def _is_canonical_url(value: str | None) -> bool:
    return bool(value and urlparse(value).scheme.lower() in {"http", "https"})


def _schedule_family_id(value: Any) -> str | None:
    match = re.fullmatch(r"\s*(\d+[a-z]?)\s*", _safe_text(value), re.IGNORECASE)
    if not match:
        return None
    return f"migration_regulations_schedule_{match.group(1).lower()}"


def _metadata_for(source: SourceSnapshot | Any) -> dict[str, Any]:
    return _safe_metadata(
        getattr(source, "metadata", None) or getattr(source, "metadata_json", None)
    )


def _is_migration_regulations(source: SourceSnapshot | Any) -> bool:
    title = _safe_text(source.title)
    url = _safe_text(source.url)
    structured = _metadata_text(_metadata_for(source))
    document_version = _safe_text(getattr(source, "document_version", None)).upper()
    return bool(
        _MIGRATION_REGULATIONS_RE.search(title)
        or _MIGRATION_REGULATIONS_RE.search(structured)
        or "migration_regulations_1994" in url.lower()
        or "f1996b03551" in url.lower()
        or "f2026c00266" in url.lower()
        or document_version == "F2026C00266"
    )


def _structured_family(source: SourceSnapshot | Any) -> str | None:
    metadata = _metadata_for(source)
    for key in ("family_id", "source_family", "document_family", "family"):
        raw = _safe_text(metadata.get(key)).lower().replace("-", "_").replace(" ", "_")
        if raw in REQUIRED_FAMILY_IDS:
            return raw
        if raw.startswith("migration_regulations_schedule_"):
            return _schedule_family_id(raw.removeprefix("migration_regulations_schedule_"))
    if _is_migration_regulations(source):
        for key in ("schedule_number", "schedule_no", "schedule"):
            family_id = _schedule_family_id(metadata.get(key))
            if family_id:
                return family_id
    return None


def _classify_source(source: SourceSnapshot | Any) -> str | None:
    """Classify a canonical source by structured data, then bounded locators.

    This is corpus inventory parsing only. It never inspects legal body/chunk
    text and does not decide legal relevance or eligibility.
    """

    structured = _structured_family(source)
    if structured:
        return structured

    title = _safe_text(source.title)
    url = _safe_text(source.url)
    authority = _safe_text(source.authority)
    source_type = _safe_text(source.source_type).lower().replace("-", "_")
    searchable = " ".join((title, url))

    # No loose substring match such as ``"art" in "Department"`` is used.
    if source_type == "guidance" and _HOME_AFFAIRS_RE.search(authority):
        return "home_affairs_guidance"
    if source_type in _ART_TYPES or _TRIBUNAL_RE.search(authority) or _TRIBUNAL_RE.search(title):
        return "art_tribunal_material"
    if source_type in _COURT_TYPES:
        return "court_decisions"
    if source_type not in _LEGISLATION_TYPES:
        return f"other_{source_type}" if source_type else None

    if _is_migration_regulations(source):
        schedule_match = _SCHEDULE_LOCATOR_RE.search(title)
        if schedule_match:
            return _schedule_family_id(schedule_match.group(1))
        return "migration_regulations"

    document_version = _safe_text(getattr(source, "document_version", None)).upper()
    if (
        _MIGRATION_ACT_RE.search(searchable)
        or "c1958a00062" in searchable.lower()
        or document_version == "C2026C00090"
    ):
        return "migration_act"

    metadata = _metadata_for(source)
    words = ("legislative instrument", "instrument", "determination", "direction")
    if source_type in {"legislative_instrument", "instrument"} or any(
        word in f"{title} {_metadata_text(metadata)}".lower() for word in words
    ):
        return "legislative_instruments"
    return "other_legislation"


def _family_display_name(family_id: str) -> str:
    names = {
        "migration_act": "Migration Act 1958",
        "migration_regulations": "Migration Regulations 1994",
        "legislative_instruments": "Legislative Instruments",
        "court_decisions": "Court Decisions",
        "art_tribunal_material": "ART / Tribunal Material",
        "home_affairs_guidance": "Home Affairs Guidance",
        "historical_versions": "Historical Versions",
    }
    if family_id in names:
        return names[family_id]
    schedule = re.fullmatch(r"migration_regulations_schedule_(\d+[a-z]?)", family_id)
    if schedule:
        return f"Migration Regulations — Schedule {schedule.group(1).upper()}"
    return family_id.replace("_", " ").title()


def _source_sort_key(source: SourceSnapshot | Any) -> tuple[str, str]:
    return (_safe_text(source.id), _safe_text(source.title))


def _chunks_by_source(chunks: Iterable[ChunkSnapshot | Any]) -> dict[str, list[ChunkSnapshot | Any]]:
    grouped: dict[str, list[ChunkSnapshot | Any]] = defaultdict(list)
    for chunk in chunks:
        grouped[_safe_text(chunk.source_id)].append(chunk)
    for values in grouped.values():
        values.sort(key=lambda item: (int(item.chunk_index or 0), _safe_text(item.id)))
    return grouped


def _empty_family_record(family_id: str, reason: str = "No canonical sources found for this family") -> dict[str, Any]:
    return {
        "family_id": family_id,
        "family": _family_display_name(family_id),
        "available": False,
        "coverage_status": "absent",
        "source_count": 0,
        "chunk_count": 0,
        "versions": [],
        "effective_date_metadata_complete": False,
        "provision_boundaries_available": False,
        "canonical_urls_available": False,
        "gap_reason": reason,
        "sample_source_ids": [],
        "sample_titles": [],
        "sample_canonical_urls": [],
    }


def _build_family_records(
    sources: Iterable[SourceSnapshot | Any],
    chunks_by_source: Mapping[str, list[ChunkSnapshot | Any]],
    cases: Iterable[CaseSnapshot | Any],
) -> dict[str, dict[str, Any]]:
    """Aggregate detached snapshots into conservative coverage records."""

    families: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "sources": [],
            "chunk_count": 0,
            "versions": set(),
            "all_have_effective_date": True,
            "all_have_url": True,
            "any_provision_boundaries": False,
        }
    )
    classified_source_ids: set[str] = set()
    for source in sorted(sources, key=_source_sort_key):
        family_id = _classify_source(source)
        if family_id is None:
            continue
        classified_source_ids.add(_safe_text(source.id))
        family = families[family_id]
        family["sources"].append(source)
        source_chunks = chunks_by_source.get(_safe_text(source.id), [])
        family["chunk_count"] += len(source_chunks)
        version = _safe_text(source.document_version)
        if version:
            family["versions"].add(version)
        if source.effective_date is None:
            family["all_have_effective_date"] = False
        if not _is_canonical_url(source.url):
            family["all_have_url"] = False
        if any(_safe_text(chunk.section_ref) or _safe_text(chunk.heading) for chunk in source_chunks):
            family["any_provision_boundaries"] = True

    # Case rows are decision records. Add a bounded pseudo-source only when a
    # classified LegalSource does not already represent that primary source.
    for case in sorted(cases, key=_source_sort_key):
        if _safe_text(case.primary_source_id) in classified_source_ids:
            continue
        synthetic = SourceSnapshot(
            id=f"case:{_safe_text(case.id)}",
            title=_safe_text(case.title),
            source_type="case",
            authority=_safe_text(case.court),
            url=case.url,
            effective_date=case.decision_date,
            document_version=str(case.decision_date.year) if case.decision_date else None,
            metadata={},
            content_hash=None,
        )
        family = families["court_decisions"]
        family["sources"].append(synthetic)
        if synthetic.document_version:
            family["versions"].add(synthetic.document_version)
        if synthetic.effective_date is None:
            family["all_have_effective_date"] = False
        if not _is_canonical_url(synthetic.url):
            family["all_have_url"] = False

    records: dict[str, dict[str, Any]] = {}
    for family_id in sorted(families):
        family = families[family_id]
        family_sources = sorted(family["sources"], key=_source_sort_key)
        source_count = len(family_sources)
        versions = sorted(family["versions"])
        complete = bool(
            source_count
            and family["all_have_effective_date"]
            and family["all_have_url"]
            and family["any_provision_boundaries"]
            and versions
        )
        gaps: list[str] = []
        if not family["all_have_effective_date"]:
            gaps.append("Some sources missing effective_date")
        if not family["all_have_url"]:
            gaps.append("Some sources missing canonical URL")
        if not family["any_provision_boundaries"]:
            gaps.append("No provision/section boundaries in chunks")
        if not versions:
            gaps.append("No document versions recorded")
        records[family_id] = {
            "family_id": family_id,
            "family": _family_display_name(family_id),
            "available": True,
            "coverage_status": "available_complete" if complete else "available_partial",
            "source_count": source_count,
            "chunk_count": family["chunk_count"],
            "versions": versions,
            "effective_date_metadata_complete": bool(family["all_have_effective_date"]),
            "provision_boundaries_available": bool(family["any_provision_boundaries"]),
            "canonical_urls_available": bool(family["all_have_url"]),
            "gap_reason": "; ".join(gaps) if gaps else None,
            "sample_source_ids": [_safe_text(source.id) for source in family_sources[:5]],
            "sample_titles": [_safe_text(source.title) for source in family_sources[:5]],
            "sample_canonical_urls": [
                _safe_text(source.url) for source in family_sources if _is_canonical_url(source.url)
            ][:5],
        }
    return records


def _historical_key(source: SourceSnapshot | Any) -> str:
    metadata = _metadata_for(source)
    for key in ("document_family", "family_id", "source_family"):
        value = _safe_text(metadata.get(key))
        if value:
            return value.lower()
    title = _safe_text(source.title).lower()
    title = re.sub(r"\bvol(?:ume)?\s*\d+\b", "", title)
    title = re.sub(r"\b(?:compilation|as amended|current)\b", "", title)
    return " ".join(title.split())


def _discover_historical_versions(
    sources: Iterable[SourceSnapshot | Any],
    chunks_by_source: Mapping[str, list[ChunkSnapshot | Any]] | None = None,
) -> dict[str, Any]:
    """Report actual multi-version groups without assuming history exists."""

    chunks_by_source = chunks_by_source or {}
    grouped: dict[str, list[SourceSnapshot | Any]] = defaultdict(list)
    for source in sources:
        key = _historical_key(source)
        if key:
            grouped[key].append(source)
    historical_groups: list[list[SourceSnapshot | Any]] = []
    for grouped_sources in grouped.values():
        markers = {
            _safe_text(source.document_version) or _safe_text(source.effective_date)
            for source in grouped_sources
            if _safe_text(source.document_version) or _safe_text(source.effective_date)
        }
        if len(markers) > 1:
            historical_groups.append(grouped_sources)
    historical_sources = sorted(
        [source for values in historical_groups for source in values], key=_source_sort_key
    )
    if not historical_sources:
        return _empty_family_record(
            "historical_versions",
            "No multi-version document groups found in canonical sources",
        )

    source_chunks = [
        chunk
        for source in historical_sources
        for chunk in chunks_by_source.get(_safe_text(source.id), [])
    ]
    versions = sorted(
        {_safe_text(source.document_version) for source in historical_sources if _safe_text(source.document_version)}
    )
    all_effective = all(source.effective_date is not None for source in historical_sources)
    all_urls = all(_is_canonical_url(source.url) for source in historical_sources)
    boundaries = any(_safe_text(chunk.section_ref) or _safe_text(chunk.heading) for chunk in source_chunks)
    complete = bool(all_effective and all_urls and boundaries and versions)
    gaps: list[str] = []
    if not all_effective:
        gaps.append("Some historical sources missing effective_date")
    if not all_urls:
        gaps.append("Some historical sources missing canonical URL")
    if not boundaries:
        gaps.append("No provision boundaries in historical chunks")
    if not versions:
        gaps.append("No document versions recorded for historical sources")
    return {
        "family_id": "historical_versions",
        "family": _family_display_name("historical_versions"),
        "available": True,
        "coverage_status": "available_complete" if complete else "available_partial",
        "source_count": len(historical_sources),
        "chunk_count": len(source_chunks),
        "versions": versions,
        "effective_date_metadata_complete": all_effective,
        "provision_boundaries_available": boundaries,
        "canonical_urls_available": all_urls,
        "gap_reason": "; ".join(gaps) if gaps else None,
        "sample_source_ids": [_safe_text(source.id) for source in historical_sources[:5]],
        "sample_titles": [_safe_text(source.title) for source in historical_sources[:5]],
        "sample_canonical_urls": [
            _safe_text(source.url) for source in historical_sources if _is_canonical_url(source.url)
        ][:5],
    }


def _compute_input_fingerprint(
    sources: Iterable[SourceSnapshot | Any],
    chunks_by_source: Mapping[str, list[ChunkSnapshot | Any]],
    cases: Iterable[CaseSnapshot | Any],
    index_inventory: Iterable[IndexInventory] = (),
) -> str:
    """Hash the non-text canonical inventory and index manifest deterministically."""

    records: list[dict[str, Any]] = []
    for source in sorted(sources, key=_source_sort_key):
        records.append(
            {
                "kind": "source",
                "id": _safe_text(source.id),
                "title": _safe_text(source.title),
                "source_type": _safe_text(source.source_type),
                "authority": _safe_text(source.authority),
                "url": _safe_text(source.url),
                "document_version": _safe_text(source.document_version),
                "effective_date": _safe_text(source.effective_date),
                "content_hash": _safe_text(getattr(source, "content_hash", None)),
                "chunk_count": len(chunks_by_source.get(_safe_text(source.id), [])),
            }
        )
    for source_id in sorted(chunks_by_source):
        for chunk in chunks_by_source[source_id]:
            records.append(
                {
                    "kind": "chunk",
                    "id": _safe_text(chunk.id),
                    "source_id": _safe_text(chunk.source_id),
                    "chunk_index": int(chunk.chunk_index or 0),
                    "section_ref": _safe_text(chunk.section_ref),
                    "heading": _safe_text(chunk.heading),
                }
            )
    for case in sorted(cases, key=_source_sort_key):
        records.append(
            {
                "kind": "case",
                "id": _safe_text(case.id),
                "title": _safe_text(case.title),
                "court": _safe_text(case.court),
                "decision_date": _safe_text(case.decision_date),
                "url": _safe_text(case.url),
                "primary_source_id": _safe_text(case.primary_source_id),
            }
        )
    for item in sorted(index_inventory, key=lambda value: value.relative_path):
        records.append(
            {
                "kind": "index",
                "path": item.relative_path,
                "record_count": item.record_count,
                "sha256": item.sha256,
            }
        )
    from app.schemas.canonical_corpus_coverage import canonical_json

    return _sha256_hex(canonical_json(records))


def _index_inventory() -> tuple[IndexInventory, ...]:
    """Read only a hash/count manifest for the existing Schedule indexes."""

    records: list[IndexInventory] = []
    for path in SCHEDULE_INDEX_PATHS:
        if not path.is_file():
            continue
        data = path.read_bytes()
        records.append(
            IndexInventory(
                relative_path=str(path.relative_to(_PROJECT)),
                record_count=data.count(b"\n"),
                sha256=_sha256_hex(data),
            )
        )
    return tuple(records)


def _index_version(index_inventory: Iterable[IndexInventory]) -> str | None:
    values = list(index_inventory)
    if not values:
        return None
    payload = "\n".join(
        f"{item.relative_path}:{item.record_count}:{item.sha256}"
        for item in sorted(values, key=lambda value: value.relative_path)
    )
    return f"sha256:{_sha256_hex(payload.encode('utf-8'))}"


def _count_tables(db: Session) -> dict[str, int]:
    return {
        "legal_sources": int(db.scalar(select(func.count()).select_from(LegalSource)) or 0),
        "source_chunks": int(db.scalar(select(func.count()).select_from(SourceChunk)) or 0),
        "cases": int(db.scalar(select(func.count()).select_from(Case)) or 0),
    }


def _load_audit_snapshot(session_factory: Callable[[], Session] = SessionLocal) -> AuditSnapshot:
    """Read and detach exactly the fields required by the audit.

    PostgreSQL read-only mode is mandatory. If it cannot be established, the
    audit refuses to continue rather than merely hoping no write occurs.
    """

    db = session_factory()
    try:
        try:
            db.execute(text("SET TRANSACTION READ ONLY"))
        except Exception as exc:
            raise AuditUnavailableError(
                "Could not establish a PostgreSQL read-only transaction for the canonical corpus audit"
            ) from exc
        counts_before = _count_tables(db)
        source_rows = db.execute(
            select(
                LegalSource.id,
                LegalSource.title,
                LegalSource.source_type,
                LegalSource.authority,
                LegalSource.url,
                LegalSource.effective_date,
                LegalSource.document_version,
                LegalSource.metadata_json,
            ).order_by(LegalSource.id)
        ).mappings().all()
        chunk_rows = db.execute(
            select(
                SourceChunk.id,
                SourceChunk.source_id,
                SourceChunk.chunk_index,
                SourceChunk.section_ref,
                SourceChunk.heading,
            ).order_by(SourceChunk.source_id, SourceChunk.chunk_index, SourceChunk.id)
        ).mappings().all()
        case_rows = db.execute(
            select(
                Case.id,
                Case.title,
                Case.court,
                Case.decision_date,
                Case.url,
                Case.primary_source_id,
            ).order_by(Case.id)
        ).mappings().all()
        counts_after = _count_tables(db)
        if counts_before != counts_after:
            raise AuditUnavailableError(
                "Canonical table counts changed during the read-only audit; retry only after the corpus is stable"
            )
        sources = tuple(
            SourceSnapshot(
                id=_safe_text(row["id"]),
                title=_safe_text(row["title"]),
                source_type=_safe_text(row["source_type"]),
                authority=_safe_text(row["authority"]),
                url=_safe_text(row["url"]) or None,
                effective_date=row["effective_date"],
                document_version=_safe_text(row["document_version"]) or None,
                metadata=_safe_metadata(row["metadata_json"]),
                content_hash=_safe_text(_safe_metadata(row["metadata_json"]).get("content_hash")) or None,
            )
            for row in source_rows
        )
        chunks = tuple(
            ChunkSnapshot(
                id=_safe_text(row["id"]),
                source_id=_safe_text(row["source_id"]),
                chunk_index=int(row["chunk_index"] or 0),
                section_ref=_safe_text(row["section_ref"]) or None,
                heading=_safe_text(row["heading"]) or None,
            )
            for row in chunk_rows
        )
        cases = tuple(
            CaseSnapshot(
                id=_safe_text(row["id"]),
                title=_safe_text(row["title"]),
                court=_safe_text(row["court"]) or None,
                decision_date=row["decision_date"],
                url=_safe_text(row["url"]) or None,
                primary_source_id=_safe_text(row["primary_source_id"]) or None,
            )
            for row in case_rows
        )
        return AuditSnapshot(
            sources=sources,
            chunks=chunks,
            cases=cases,
            index_inventory=_index_inventory(),
            table_counts_before=counts_before,
            table_counts_after=counts_after,
        )
    except AuditUnavailableError:
        raise
    except Exception as exc:
        raise AuditUnavailableError(
            "The authoritative local PostgreSQL canonical corpus is unavailable for a read-only audit"
        ) from exc
    finally:
        db.rollback()
        db.close()


def run_audit(
    *,
    output_path: Path | None = None,
    audit_time: datetime | None = None,
    dry_run: bool = False,
    snapshot: AuditSnapshot | None = None,
    session_factory: Callable[[], Session] = SessionLocal,
) -> CanonicalCorpusCoverageReport:
    """Build a schema-validated report from detached canonical snapshots."""

    audit_time = audit_time or datetime.now(timezone.utc)
    snapshot = snapshot or _load_audit_snapshot(session_factory)
    chunks_by_source = _chunks_by_source(snapshot.chunks)
    family_records = _build_family_records(snapshot.sources, chunks_by_source, snapshot.cases)
    family_records["historical_versions"] = _discover_historical_versions(
        snapshot.sources, chunks_by_source
    )
    for family_id in REQUIRED_FAMILY_IDS:
        family_records.setdefault(family_id, _empty_family_record(family_id))
    report_dict: dict[str, Any] = {
        "schema_version": "canonical_corpus_coverage.v1",
        "audit_time_utc": audit_time.astimezone(timezone.utc).isoformat(),
        "corpus_version": snapshot.corpus_version,
        "index_version": _index_version(snapshot.index_inventory),
        "source_families": sorted(family_records.values(), key=lambda item: item["family_id"]),
        "overall_input_fingerprint": _compute_input_fingerprint(
            snapshot.sources, chunks_by_source, snapshot.cases, snapshot.index_inventory
        ),
        "report_hash": "",
    }
    report_dict["report_hash"] = compute_report_hash(report_dict)
    report = CanonicalCorpusCoverageReport.model_validate(report_dict)
    if not dry_run and output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = output_path.with_suffix(f"{output_path.suffix}.tmp")
        temporary_path.write_text(
            report.model_dump_json(indent=2, exclude_none=False) + "\n", encoding="utf-8"
        )
        temporary_path.replace(output_path)
    return report


def _print_summary(report: CanonicalCorpusCoverageReport, snapshot: AuditSnapshot) -> None:
    print("\n=== Phase 4A — Canonical Corpus Coverage Audit ===\n")
    print("Audited input    : local PostgreSQL legal_sources, source_chunks, and cases")
    if snapshot.index_inventory:
        print(f"Schedule indexes  : {len(snapshot.index_inventory)} local read-only file inventories")
    if snapshot.table_counts_before is not None:
        print(f"Counts before     : {dict(snapshot.table_counts_before)}")
        print(f"Counts after      : {dict(snapshot.table_counts_after or {})}")
    print(f"Corpus version   : {report.corpus_version or 'unknown'}")
    print(f"Index version    : {report.index_version or 'unknown'}")
    print(f"Input fingerprint: {report.overall_input_fingerprint}")
    print(f"Report hash      : {report.report_hash}\n")
    for family in report.source_families:
        print(
            f"{family.family:<44} {family.coverage_status:<20} "
            f"sources={family.source_count:<4} chunks={family.chunk_count:<5} "
            f"versions={len(family.versions)}"
        )
    print("\n=== Manual Review Checklist ===\n")
    for family in report.source_families:
        print(f"[ ] {family.family}: {family.coverage_status}")
        if family.available:
            print(f"    sample IDs: {family.sample_source_ids[:3]}")
            print(f"    sample titles: {family.sample_titles[:3]}")
            if family.sample_canonical_urls:
                print(f"    sample canonical URLs: {family.sample_canonical_urls[:3]}")
        if family.gap_reason:
            print(f"    gap: {family.gap_reason}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 4A canonical corpus coverage audit")
    parser.add_argument("--output", type=Path, default=DEFAULT_ARTIFACT)
    parser.add_argument("--no-write", action="store_true")
    parser.add_argument("--audit-time", type=str, default=None)
    args = parser.parse_args()
    audit_time = datetime.fromisoformat(args.audit_time) if args.audit_time else None
    if audit_time is not None and audit_time.tzinfo is None:
        audit_time = audit_time.replace(tzinfo=timezone.utc)
    try:
        snapshot = _load_audit_snapshot()
    except AuditUnavailableError as exc:
        print(f"DECISION REQUIRED: {exc}", file=sys.stderr)
        raise SystemExit(2) from None
    report = run_audit(
        output_path=None if args.no_write else args.output,
        audit_time=audit_time,
        dry_run=args.no_write,
        snapshot=snapshot,
    )
    _print_summary(report, snapshot)
    print("\nDry run — no artifact written." if args.no_write else f"\nReport written to: {args.output}")


if __name__ == "__main__":
    main()
