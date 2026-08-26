"""Safely initialize only the additive Phase 7.1 archive table.

This script is intentionally not run by development validation.  Execute it
only through the environment's approved database procedure after reviewing the
target DATABASE_URL.  It uses CREATE TABLE IF NOT EXISTS semantics through
SQLAlchemy metadata and does not alter corpus or existing review tables.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.models import ExperienceRecord  # noqa: F401
from app.db.phase7_schema import ensure_phase7_1_append_only_trigger
from app.db.session import engine


if __name__ == "__main__":
    ExperienceRecord.__table__.create(bind=engine, checkfirst=True)
    ensure_phase7_1_append_only_trigger(engine)
    print("Phase 7.1 experience_records table ensured.")
