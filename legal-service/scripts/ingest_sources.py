from __future__ import annotations

from pathlib import Path

from app.db.session import SessionLocal
from app.services.ingestion_service import IngestionService


RAW_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"


def main() -> None:
    service = IngestionService()
    json_files = sorted(RAW_DATA_DIR.rglob("*.json"))

    if not json_files:
        print(f"No JSON source files found under {RAW_DATA_DIR}")
        return

    inserted_sources = 0
    skipped_sources = 0
    inserted_chunks = 0

    db = SessionLocal()
    try:
        for path in json_files:
            try:
                result = service.ingest_json_file(db, path)
                if result.inserted:
                    inserted_sources += 1
                    inserted_chunks += result.chunk_count
                else:
                    skipped_sources += 1
                print(
                    f"[{result.status}] title={result.source_title!r} chunks={result.chunk_count} "
                    f"path={result.path} message={result.message}"
                )
            except Exception as exc:
                db.rollback()
                print(f"[error] path={path} error={exc}")

        print("\nIngestion summary")
        print(f"  inserted_sources={inserted_sources}")
        print(f"  skipped_sources={skipped_sources}")
        print(f"  inserted_chunks={inserted_chunks}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
