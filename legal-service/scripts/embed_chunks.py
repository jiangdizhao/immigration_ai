from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import SourceChunk
from app.db.session import SessionLocal
from app.services.embedding_service import EmbeddingService


settings = get_settings()


@dataclass(slots=True)
class EmbedRunSummary:
    processed_chunks: int = 0
    embedded_chunks: int = 0
    skipped_chunks: int = 0


def fetch_pending_chunks(db: Session, batch_size: int) -> list[SourceChunk]:
    stmt: Select[tuple[SourceChunk]] = (
        select(SourceChunk)
        .where(SourceChunk.embedding.is_(None))
        .order_by(SourceChunk.created_at.asc(), SourceChunk.chunk_index.asc())
        .limit(batch_size)
    )
    return list(db.scalars(stmt))


def count_pending_chunks(db: Session) -> int:
    return int(db.scalar(select(func.count()).select_from(SourceChunk).where(SourceChunk.embedding.is_(None))) or 0)


def main() -> None:
    batch_size = int(getattr(settings, 'embedding_batch_size', 64))
    service = EmbeddingService()
    summary = EmbedRunSummary()

    with SessionLocal() as db:
        pending_before = count_pending_chunks(db)
        print(f'model={service.model}')
        print(f'dimension={service.dimension}')
        print(f'batch_size={batch_size}')
        print(f'pending_before={pending_before}')

        while True:
            chunks = fetch_pending_chunks(db, batch_size=batch_size)
            if not chunks:
                break

            texts: list[str] = []
            chunk_ids: list[str] = []

            for chunk in chunks:
                text = (chunk.text or '').strip()
                summary.processed_chunks += 1
                if not text:
                    summary.skipped_chunks += 1
                    continue
                texts.append(text)
                chunk_ids.append(chunk.id)

            if not texts:
                db.commit()
                continue

            vectors = service.embed_texts(texts)
            by_id = dict(zip(chunk_ids, vectors))

            for chunk in chunks:
                if chunk.id in by_id:
                    chunk.embedding = by_id[chunk.id]
                    summary.embedded_chunks += 1

            db.commit()
            remaining = count_pending_chunks(db)
            print(
                f'embedded_batch={len(chunk_ids)} '
                f'total_embedded={summary.embedded_chunks} '
                f'remaining={remaining}'
            )

        pending_after = count_pending_chunks(db)
        print('\nEmbedding summary')
        print(f'  processed_chunks={summary.processed_chunks}')
        print(f'  embedded_chunks={summary.embedded_chunks}')
        print(f'  skipped_chunks={summary.skipped_chunks}')
        print(f'  pending_after={pending_after}')


if __name__ == '__main__':
    main()
