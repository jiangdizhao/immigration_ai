"""Bounded, transactional installation of the F2026C00667 compilation.

This is a maintenance script, not a general ingestion entry point.  It is
deliberately limited to the four tracked F2026C00667 volume payloads and does
not call ``IngestionService.ingest_source_payload`` because that method
commits internally.

Default mode is dry-run.  Database mutation requires the explicit ``--apply``
flag.  Embeddings are intentionally outside this workflow.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Callable, Iterable

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.orm import Session

from app.db.models import LegalSource, SourceChunk
from app.db.session import SessionLocal
from app.schemas.tools import ExactLegalLookupRequest
from app.services.exact_legal_source_service import ExactLegalSourceService
from app.services.ingestion_service import IngestionService
from app.services.request_evidence_registry import create_registry


EXPECTED_VERSION = "F2026C00667"
EXPECTED_EFFECTIVE_DATE = date(2026, 7, 1)
PREVIOUS_VERSION = "F2026C00266"
EXPECTED_VOLUME_DIR = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "raw"
    / "legislation"
    / "migration_regulations_1994_F2026C00667"
)
EXPECTED_FILES = (
    "F2026C00667VOL01.json",
    "F2026C00667VOL02.json",
    "F2026C00667VOL03.json",
    "F2026C00667VOL04.json",
)
EXPECTED_CHUNK_COUNTS = {
    "F2026C00667VOL01.json": 2007,
    "F2026C00667VOL02.json": 1389,
    "F2026C00667VOL03.json": 1082,
    "F2026C00667VOL04.json": 1318,
}
EXPECTED_URLS = {
    filename: (
        "local://data/acquired/legislation/"
        f"migration_regulations_1994_schedules_updates/{filename.removesuffix('.json')}.pdf"
    )
    for filename in EXPECTED_FILES
}
EXPECTED_TITLES = {
    filename: f"Migration Regulations 1994 - F2026C00667 Volume {index}"
    for index, filename in enumerate(EXPECTED_FILES, start=1)
}
REGULATION_SOURCE_TYPES = ("legislation", "regulation", "regulations")


class SynchronizationError(RuntimeError):
    """A precondition, invariant, or verification failure."""


@dataclass(slots=True, frozen=True)
class VolumePayload:
    filename: str
    path: Path
    payload: dict[str, Any]
    expected_chunks: int


@dataclass(slots=True)
class SyncPlan:
    volumes: list[VolumePayload]
    existing_new_sources: list[dict[str, Any]]
    insert_files: list[str]
    retire_sources: list[dict[str, Any]]
    expected_new_chunk_count: int
    current_previous_source_count: int
    current_previous_chunk_count: int
    current_versionless_regulation_source_count: int
    current_versionless_regulation_chunk_count: int
    current_new_source_count: int
    current_new_chunk_count: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "expected_version": EXPECTED_VERSION,
            "expected_effective_date": EXPECTED_EFFECTIVE_DATE.isoformat(),
            "volumes": [
                {
                    "file": volume.filename,
                    "url": volume.payload["url"],
                    "document_version": volume.payload["document_version"],
                    "status": volume.payload["status"],
                    "effective_date": volume.payload["effective_date"],
                    "expected_chunks": volume.expected_chunks,
                }
                for volume in self.volumes
            ],
            "existing_f2026c00667_sources": self.existing_new_sources,
            "current_state": {
                "f2026c00266_source_count": self.current_previous_source_count,
                "f2026c00266_chunk_count": self.current_previous_chunk_count,
                "versionless_regulation_source_count": self.current_versionless_regulation_source_count,
                "versionless_regulation_chunk_count": self.current_versionless_regulation_chunk_count,
                "f2026c00667_source_count": self.current_new_source_count,
                "f2026c00667_chunk_count": self.current_new_chunk_count,
            },
            "insert_files": self.insert_files,
            "retire_sources": self.retire_sources,
            "expected_new_chunk_count": self.expected_new_chunk_count,
            "post_sync_invariants": {
                "active_f2026c00667_source_count": 4,
                "active_f2026c00667_chunk_count": self.expected_new_chunk_count,
                "active_previous_version_source_count": 0,
                "active_versionless_regulation_source_count": 0,
                "embeddings_performed": False,
            },
        }


def _json_payloads(data_dir: Path = EXPECTED_VOLUME_DIR) -> list[VolumePayload]:
    actual = sorted(path.name for path in data_dir.glob("*.json"))
    expected = sorted(EXPECTED_FILES)
    if actual != expected:
        raise SynchronizationError(
            f"Expected exactly four tracked volume JSON files {expected}; found {actual}"
        )

    ingestion = IngestionService()
    volumes: list[VolumePayload] = []
    for filename in EXPECTED_FILES:
        path = data_dir / filename
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover - filesystem failure
            raise SynchronizationError(f"Could not read {path}: {exc}") from exc

        try:
            ingestion._validate_payload(payload)
        except Exception as exc:
            raise SynchronizationError(f"Invalid payload {filename}: {exc}") from exc

        if payload.get("title") != EXPECTED_TITLES[filename]:
            raise SynchronizationError(
                f"Unexpected title for {filename}: {payload.get('title')!r}"
            )
        if payload.get("url") != EXPECTED_URLS[filename]:
            raise SynchronizationError(
                f"Unexpected URL for {filename}: {payload.get('url')!r}"
            )
        if payload.get("document_version") != EXPECTED_VERSION:
            raise SynchronizationError(
                f"{filename} has document_version={payload.get('document_version')!r}"
            )
        if payload.get("status") != "active":
            raise SynchronizationError(
                f"{filename} has status={payload.get('status')!r}, expected 'active'"
            )
        if payload.get("effective_date") != EXPECTED_EFFECTIVE_DATE.isoformat():
            raise SynchronizationError(
                f"{filename} has effective_date={payload.get('effective_date')!r}"
            )
        if payload.get("repeal_date") is not None:
            raise SynchronizationError(f"{filename} must have a NULL repeal_date")

        # Build exactly as normal ingestion does, but only to validate the
        # tracked expected chunk count; no Session or database is involved.
        source = LegalSource(
            title=payload["title"],
            source_type=payload["source_type"],
            authority=payload["authority"],
            jurisdiction=payload.get("jurisdiction") or "Cth",
            document_version=payload["document_version"],
            effective_date=EXPECTED_EFFECTIVE_DATE,
            status="active",
            metadata_json=payload.get("metadata_json") or {},
        )
        generated_count = len(ingestion._build_chunks(source, payload))
        expected_count = EXPECTED_CHUNK_COUNTS[filename]
        if generated_count != expected_count:
            raise SynchronizationError(
                f"{filename} generated {generated_count} chunks, expected {expected_count}"
            )
        volumes.append(
            VolumePayload(
                filename=filename,
                path=path,
                payload=payload,
                expected_chunks=expected_count,
            )
        )
    return volumes


def _source_summary(db: Session, source: LegalSource) -> dict[str, Any]:
    chunk_count = db.scalar(
        select(func.count(SourceChunk.id)).where(SourceChunk.source_id == source.id)
    )
    return {
        "id": str(source.id),
        "title": source.title,
        "url": source.url,
        "document_version": source.document_version,
        "status": source.status,
        "effective_date": source.effective_date.isoformat() if source.effective_date else None,
        "repeal_date": source.repeal_date.isoformat() if source.repeal_date else None,
        "source_chunks": int(chunk_count or 0),
    }


def _active_retirement_sources(db: Session) -> list[LegalSource]:
    statement = select(LegalSource).where(
        LegalSource.status == "active",
        LegalSource.source_type.in_(REGULATION_SOURCE_TYPES),
        or_(
            LegalSource.document_version == PREVIOUS_VERSION,
            and_(
                LegalSource.document_version.is_(None),
                func.upper(LegalSource.title).like("MIGRATION REGULATIONS 1994%"),
            ),
        ),
    )
    return list(db.scalars(statement))


def build_plan(db: Session, volumes: list[VolumePayload]) -> SyncPlan:
    """Validate database preconditions and describe the bounded change set."""
    urls = [volume.payload["url"] for volume in volumes]
    titles = [volume.payload["title"] for volume in volumes]
    if len(set(urls)) != 4 or len(set(titles)) != 4:
        raise SynchronizationError("Tracked volume titles and URLs must be distinct")

    by_url = {
        source.url: source
        for source in db.scalars(select(LegalSource).where(LegalSource.url.in_(urls)))
    }
    existing_version_rows = list(
        db.scalars(
            select(LegalSource).where(LegalSource.document_version == EXPECTED_VERSION)
        )
    )
    existing_urls = set(by_url)
    expected_urls = set(urls)
    if existing_version_rows and (
        len(existing_version_rows) != 4
        or {source.url for source in existing_version_rows} != expected_urls
    ):
        raise SynchronizationError(
            "Conflicting partial F2026C00667 installation exists; refusing to continue"
        )

    for volume in volumes:
        existing = by_url.get(volume.payload["url"])
        if existing is None:
            continue
        if (
            existing.document_version != EXPECTED_VERSION
            or existing.title != volume.payload["title"]
            or existing.effective_date != EXPECTED_EFFECTIVE_DATE
        ):
            raise SynchronizationError(
                f"URL already belongs to conflicting source: {volume.payload['url']}"
            )
        actual_chunks = int(
            db.scalar(
                select(func.count(SourceChunk.id)).where(SourceChunk.source_id == existing.id)
            )
            or 0
        )
        if actual_chunks != volume.expected_chunks:
            raise SynchronizationError(
                f"Existing {volume.filename} has {actual_chunks} chunks; "
                f"expected {volume.expected_chunks}"
            )

    retirement = _active_retirement_sources(db)
    previous_sources = [
        source for source in retirement if source.document_version == PREVIOUS_VERSION
    ]
    versionless_sources = [source for source in retirement if source.document_version is None]
    current_new_chunk_count = sum(
        int(
            db.scalar(
                select(func.count(SourceChunk.id)).where(SourceChunk.source_id == source.id)
            )
            or 0
        )
        for source in existing_version_rows
    )
    existing_new_sources = [
        _source_summary(db, source)
        for source in sorted(existing_version_rows, key=lambda item: item.title)
    ]
    return SyncPlan(
        volumes=volumes,
        existing_new_sources=existing_new_sources,
        insert_files=[volume.filename for volume in volumes if volume.payload["url"] not in existing_urls],
        retire_sources=[
            _source_summary(db, source)
            for source in sorted(retirement, key=lambda item: (item.title, str(item.id)))
        ],
        expected_new_chunk_count=sum(volume.expected_chunks for volume in volumes),
        current_previous_source_count=len(previous_sources),
        current_previous_chunk_count=sum(
            int(
                db.scalar(
                    select(func.count(SourceChunk.id)).where(SourceChunk.source_id == source.id)
                )
                or 0
            )
            for source in previous_sources
        ),
        current_versionless_regulation_source_count=len(versionless_sources),
        current_versionless_regulation_chunk_count=sum(
            int(
                db.scalar(
                    select(func.count(SourceChunk.id)).where(SourceChunk.source_id == source.id)
                )
                or 0
            )
            for source in versionless_sources
        ),
        current_new_source_count=len(existing_version_rows),
        current_new_chunk_count=current_new_chunk_count,
    )


def _insert_missing_volumes(db: Session, plan: SyncPlan) -> None:
    ingestion = IngestionService()
    for volume in plan.volumes:
        existing = db.scalar(
            select(LegalSource).where(LegalSource.url == volume.payload["url"])
        )
        if existing is not None:
            continue
        payload = volume.payload
        source = LegalSource(
            title=payload["title"],
            source_type=payload["source_type"],
            authority=payload["authority"],
            jurisdiction=payload.get("jurisdiction") or "Cth",
            citation_text=payload.get("citation_text"),
            url=payload["url"],
            effective_date=EXPECTED_EFFECTIVE_DATE,
            repeal_date=None,
            document_version=EXPECTED_VERSION,
            language=payload.get("language", "en"),
            status="active",
            metadata_json=payload.get("metadata_json") or {},
        )
        db.add(source)
        db.flush()
        chunks = ingestion._build_chunks(source, payload)
        if len(chunks) != volume.expected_chunks:
            raise SynchronizationError(
                f"{volume.filename} generated {len(chunks)} chunks during insert; "
                f"expected {volume.expected_chunks}"
            )
        db.add_all(chunks)
        db.flush()


def _retire_previous_sources(db: Session) -> None:
    db.execute(
        update(LegalSource)
        .where(
            LegalSource.status == "active",
            LegalSource.source_type.in_(REGULATION_SOURCE_TYPES),
            or_(
                LegalSource.document_version == PREVIOUS_VERSION,
                and_(
                    LegalSource.document_version.is_(None),
                    func.upper(LegalSource.title).like("MIGRATION REGULATIONS 1994%"),
                ),
            ),
        )
        .values(status="superseded")
    )


def _activate_new_sources(db: Session, plan: SyncPlan) -> None:
    db.execute(
        update(LegalSource)
        .where(
            LegalSource.document_version == EXPECTED_VERSION,
            LegalSource.url.in_([volume.payload["url"] for volume in plan.volumes]),
        )
        .values(status="active")
    )


def _active_sources(db: Session, version: str | None = None) -> list[LegalSource]:
    statement = select(LegalSource).where(LegalSource.status == "active")
    if version is not None:
        statement = statement.where(LegalSource.document_version == version)
    return list(db.scalars(statement))


def verify_post_sync_invariants(db: Session, plan: SyncPlan) -> None:
    new_sources = _active_sources(db, EXPECTED_VERSION)
    expected_urls = {volume.payload["url"] for volume in plan.volumes}
    if len(new_sources) != 4 or {source.url for source in new_sources} != expected_urls:
        raise SynchronizationError("Post-sync F2026C00667 active-source invariant failed")
    for source in new_sources:
        if source.effective_date != EXPECTED_EFFECTIVE_DATE or source.status != "active":
            raise SynchronizationError("Post-sync F2026C00667 metadata invariant failed")
        actual_chunks = int(
            db.scalar(
                select(func.count(SourceChunk.id)).where(SourceChunk.source_id == source.id)
            )
            or 0
        )
        filename = next(
            volume.filename for volume in plan.volumes if volume.payload["url"] == source.url
        )
        if actual_chunks != EXPECTED_CHUNK_COUNTS[filename]:
            raise SynchronizationError(f"Post-sync chunk count failed for {filename}")

    if _active_retirement_sources(db):
        raise SynchronizationError("An active legacy Migration Regulations source remains")


PROBES: tuple[tuple[str, dict[str, Any], str], ...] = (
    ("schedule3_3001", {"schedule": "3", "provision": "3001"}, EXPECTED_VERSION),
    ("schedule3_3003", {"schedule": "3", "provision": "3003"}, EXPECTED_VERSION),
    ("schedule3_3004", {"schedule": "3", "provision": "3004"}, EXPECTED_VERSION),
    (
        "schedule2_485_211",
        {"schedule": "2", "provision": "485.211", "subclass": "485"},
        EXPECTED_VERSION,
    ),
    (
        "regulation_1_03",
        {"document_id": "Migration Regulations 1994", "provision": "1.03"},
        EXPECTED_VERSION,
    ),
    ("pic_4019", {"schedule": "4", "provision": "4019"}, EXPECTED_VERSION),
    ("condition_8101", {"schedule": "8", "provision": "8101"}, EXPECTED_VERSION),
    (
        "migration_act_section_48",
        {"document_id": "Migration Act 1958", "provision": "48"},
        "C2026C00090",
    ),
)


def verify_exact_probes(db: Session) -> list[dict[str, Any]]:
    service = ExactLegalSourceService(db)
    results: list[dict[str, Any]] = []
    for name, fields, expected_version in PROBES:
        request = ExactLegalLookupRequest(
            **fields,
            source_types=["legislation"],
            as_of_date=EXPECTED_EFFECTIVE_DATE,
            max_hits=8,
        )
        registry = create_registry(f"sync-{name}")
        output = service.lookup(request, registry=registry, tool_call_id=f"sync-{name}")
        source_versions: list[str] = []
        for match in output.matches:
            source_id = match.canonical_evidence_ref.canonical_source_id
            if not source_id:
                raise SynchronizationError(f"{name} returned evidence without canonical_source_id")
            source = db.get(LegalSource, source_id)
            if source is None:
                raise SynchronizationError(f"{name} returned an unknown canonical source")
            source_versions.append(source.document_version or "")
        actual_versions = sorted(set(source_versions))
        if not output.matches or actual_versions != [expected_version]:
            raise SynchronizationError(
                f"{name} expected matches exclusively from {expected_version}; "
                f"got matches={len(output.matches)} versions={actual_versions}"
            )
        results.append(
            {
                "probe": name,
                "expected_document_version": expected_version,
                "actual_document_versions": actual_versions,
                "match_count": len(output.matches),
            }
        )
    return results


def dry_run(
    db: Session,
    *,
    data_dir: Path = EXPECTED_VOLUME_DIR,
) -> dict[str, Any]:
    """Build and print a plan, then explicitly roll back the read transaction."""
    volumes = _json_payloads(data_dir)
    try:
        plan = build_plan(db, volumes)
        return plan.as_dict()
    finally:
        # SELECTs can open a transaction in SQLAlchemy.  Dry-run must not
        # commit even an otherwise empty transaction.
        db.rollback()


def apply_sync(
    db: Session,
    *,
    data_dir: Path = EXPECTED_VOLUME_DIR,
    probe_runner: Callable[[Session], list[dict[str, Any]]] = verify_exact_probes,
) -> dict[str, Any]:
    """Apply the complete version switch in one transaction."""
    volumes = _json_payloads(data_dir)
    with db.begin():
        plan = build_plan(db, volumes)
        _insert_missing_volumes(db, plan)
        _retire_previous_sources(db)
        _activate_new_sources(db, plan)
        verify_post_sync_invariants(db, plan)
        probes = probe_runner(db)
        result = plan.as_dict()
        result["exact_probe_results"] = probes
        result["transaction"] = "committed"
        return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Validate and print the plan (default)")
    mode.add_argument("--apply", action="store_true", help="Apply the bounded switch atomically")
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    args = _parser().parse_args(list(argv) if argv is not None else None)
    db = SessionLocal()
    try:
        if args.apply:
            result = apply_sync(db)
        else:
            result = dry_run(db)
        print(json.dumps(result, indent=2, sort_keys=True, default=str))
        return 0
    except SynchronizationError as exc:
        db.rollback()
        print(json.dumps({"status": "aborted", "reason": str(exc)}, indent=2))
        return 2
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
