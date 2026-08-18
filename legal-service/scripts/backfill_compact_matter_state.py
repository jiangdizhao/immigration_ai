#!/usr/bin/env python3
"""Backfill CompactMatterStateV2 for existing matters.

Deterministic, idempotent, additive only.  Never deletes legacy state.
Never invents confirmed-fact provenance.

Usage:
    python -m scripts.backfill_compact_matter_state --dry-run
    python -m scripts.backfill_compact_matter_state --apply
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.models import Matter
from app.schemas.compact_matter_state import CompactMatterStateV2
from app.services.compact_matter_state_service import CompactMatterStateService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def backfill(
    *,
    session: Session,
    dry_run: bool = True,
    batch_size: int = 100,
) -> dict[str, int]:
    """Run the backfill and return counts.

    Returns dict with keys: migrated, skipped, invalid, total
    """
    service = CompactMatterStateService()
    counts = {"migrated": 0, "skipped": 0, "invalid": 0, "total": 0}

    offset = 0
    while True:
        matters = (
            session.query(Matter)
            .order_by(Matter.created_at.asc())
            .offset(offset)
            .limit(batch_size)
            .all()
        )
        if not matters:
            break

        for matter in matters:
            counts["total"] += 1
            metadata = dict(matter.metadata_json or {})

            # Skip if already has valid compact_state_v2
            existing = metadata.get("compact_state_v2")
            if existing is not None:
                # Verify it's valid
                try:
                    if isinstance(existing, dict):
                        CompactMatterStateV2(**existing)
                    counts["skipped"] += 1
                    continue
                except Exception:
                    logger.warning(
                        "Matter %s has invalid compact_state_v2, will regenerate",
                        matter.id,
                    )
                    counts["invalid"] += 1
                    # Fall through to regenerate

            if dry_run:
                counts["migrated"] += 1
                continue

            # Create initial compact state
            try:
                compact = service.initialize_state(
                    matter_id=str(matter.id),
                    session_id=matter.session_id,
                    frontend_chat_id=matter.frontend_chat_id,
                )

                # Carry forward any user-confirmed facts from legacy state
                # Only facts with source='user_input' are promoted
                from app.services.state_machine import StateMachine
                sm = StateMachine()
                legacy_state = sm.hydrate_state(metadata)

                # Update compact state with available legacy information
                compact = service.update_after_turn(
                    compact=compact,
                    legacy_state=legacy_state,
                    turn_id=f"backfill-{uuid4().hex[:12]}",
                    user_question=metadata.get("initial_question", ""),
                    assistant_answer="",
                    issue_type=legacy_state.issue_type,
                    operation_type=legacy_state.operation_type,
                    visa_type=legacy_state.visa_type,
                    next_action=legacy_state.next_action,
                    carried_facts=dict(legacy_state.carried_intake_facts or {}),
                )

                metadata["compact_state_v2"] = service.to_metadata_value(compact)
                matter.metadata_json = metadata
                counts["migrated"] += 1
            except Exception as exc:
                logger.error(
                    "Failed to backfill matter %s: %s", matter.id, exc
                )
                counts["invalid"] += 1

        if not dry_run:
            session.commit()
            logger.info(
                "Committed batch: offset=%d, migrated=%d, skipped=%d, invalid=%d",
                offset,
                counts["migrated"],
                counts["skipped"],
                counts["invalid"],
            )

        offset += batch_size

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill CompactMatterStateV2 for existing matters"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Preview without writing (default)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        default=False,
        help="Actually write to the database",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of matters per batch (default: 100)",
    )
    args = parser.parse_args()

    dry_run = not args.apply

    if dry_run:
        logger.info("DRY RUN — no database writes will be performed")
    else:
        logger.info("APPLY mode — database will be modified")
        confirm = input("Type 'yes' to confirm: ")
        if confirm.strip().lower() != "yes":
            logger.info("Aborted")
            sys.exit(0)

    settings = get_settings()
    engine = create_engine(settings.database_url)
    SessionLocal = sessionmaker(bind=engine)

    with SessionLocal() as session:
        counts = backfill(
            session=session,
            dry_run=dry_run,
            batch_size=args.batch_size,
        )

    logger.info(
        "Backfill complete: total=%d, migrated=%d, skipped=%d, invalid=%d",
        counts["total"],
        counts["migrated"],
        counts["skipped"],
        counts["invalid"],
    )

    if dry_run:
        logger.info(
            "This was a dry run. Use --apply to write changes."
        )


if __name__ == "__main__":
    main()