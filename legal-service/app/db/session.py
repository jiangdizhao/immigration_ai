import logging
from collections.abc import Generator

from pgvector.psycopg import register_vector
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

engine: Engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
)


@event.listens_for(engine, "connect")
def _register_pgvector(dbapi_connection, _connection_record) -> None:
    try:
        register_vector(dbapi_connection)
    except Exception as exc:  # pragma: no cover - driver/runtime dependent
        logger.warning("Could not register pgvector types: %s", exc)


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

        
def get_db_session() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_vector_extension() -> None:
    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
