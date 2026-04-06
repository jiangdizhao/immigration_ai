from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import LegalSource


class SourceService:
    def get_source(self, db: Session, source_id: str) -> LegalSource | None:
        return db.scalar(
            select(LegalSource)
            .options(selectinload(LegalSource.chunks))
            .where(LegalSource.id == source_id)
        )
