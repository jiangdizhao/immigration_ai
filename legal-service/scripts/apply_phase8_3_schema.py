"""Apply the narrow Phase 8.3 bridge receipt schema to the local legal DB.

Run only through the reviewed local database procedure; this script never
uses metadata.create_all and does not alter corpus or Phase-7 tables.
"""

from pathlib import Path

from sqlalchemy import text

from app.db.session import engine


def main() -> None:
    migration = Path(__file__).parent / "migrations" / "20260903_phase8_learning_bridge.sql"
    statements = [item.strip() for item in migration.read_text().split(";") if item.strip()]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
    print("Phase 8.3 legal-service bridge schema applied.")


if __name__ == "__main__":
    main()
