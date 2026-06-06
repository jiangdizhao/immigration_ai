from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.db.models import LegalSource, SourceChunk
from app.db.session import SessionLocal
from app.schedule.schedule2_index_service import (
    SCHEDULE1_INDEX_PATH,
    SCHEDULE2_INDEX_PATH,
    build_index_from_db_records,
    write_index,
)


def _fetch_records() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with SessionLocal() as db:
        rows = db.execute(
            select(LegalSource, SourceChunk)
            .join(SourceChunk, SourceChunk.source_id == LegalSource.id)
            .where(LegalSource.status == "active")
            .order_by(LegalSource.title.asc(), SourceChunk.chunk_index.asc())
        ).all()
        for source, chunk in rows:
            meta = dict(source.metadata_json or {})
            records.append(
                {
                    "source_id": source.id,
                    "chunk_id": chunk.id,
                    "source_title": source.title,
                    "source_file": meta.get("source_path") or source.url,
                    "url": source.url,
                    "authority": source.authority,
                    "source_type": source.source_type,
                    "metadata_json": meta,
                    "chunk_index": chunk.chunk_index,
                    "section_ref": chunk.section_ref,
                    "heading": chunk.heading,
                    "text": chunk.text,
                    "has_embedding": chunk.embedding is not None,
                }
            )
    return records


def main() -> None:
    records = _fetch_records()
    schedule1 = build_index_from_db_records("1", records)
    schedule2 = build_index_from_db_records("2", records)

    write_index(SCHEDULE1_INDEX_PATH, schedule1)
    write_index(SCHEDULE2_INDEX_PATH, schedule2)

    print("Schedule index built from database")
    print(f"  input_records={len(records)}")
    print(f"  schedule1_clauses={len(schedule1)} -> {SCHEDULE1_INDEX_PATH}")
    print(f"  schedule2_clauses={len(schedule2)} -> {SCHEDULE2_INDEX_PATH}")

    subclasses = sorted({c.subclass for c in schedule2 if c.subclass})[:40]
    print(f"  schedule2_subclass_sample={subclasses}")

    if not schedule2:
        print("WARNING: no Schedule 2 clauses were parsed. Check legal_sources titles/metadata and source chunk text.")


if __name__ == "__main__":
    main()
