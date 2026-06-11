from __future__ import annotations

from sqlalchemy import text

from app.db.session import SessionLocal


def main() -> None:
    statements = [
        "ALTER TABLE matters ADD COLUMN IF NOT EXISTS frontend_chat_id VARCHAR(255)",
        "ALTER TABLE matters ADD COLUMN IF NOT EXISTS frontend_user_id VARCHAR(255)",
        "CREATE INDEX IF NOT EXISTS ix_matters_frontend_chat_id ON matters (frontend_chat_id)",
        "CREATE INDEX IF NOT EXISTS ix_matters_frontend_user_id ON matters (frontend_user_id)",
    ]

    with SessionLocal() as db:
        for statement in statements:
            db.execute(text(statement))
        db.commit()

    print("Phase 0 legal-service schema migration applied.")


if __name__ == "__main__":
    main()
