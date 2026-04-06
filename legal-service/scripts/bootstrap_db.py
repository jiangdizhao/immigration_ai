from app.db import models  # noqa: F401
from app.db.base import Base
from app.db.session import engine, ensure_vector_extension


if __name__ == "__main__":
    ensure_vector_extension()
    Base.metadata.create_all(bind=engine)
    print("Database schema created.")
