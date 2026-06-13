from __future__ import annotations

from app.db import models  # noqa: F401
from app.db.base import Base
from app.db.session import engine, ensure_vector_extension


def main() -> None:
    ensure_vector_extension()
    Base.metadata.create_all(bind=engine)
    print("Phase 1B legal-service base schema is present.")


if __name__ == "__main__":
    main()
