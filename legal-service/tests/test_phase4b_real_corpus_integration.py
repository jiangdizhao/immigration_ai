"""Read-only Phase-4B integration smoke against the configured local corpus.

These tests intentionally discover source rows from the canonical database
instead of hard-coding source or chunk IDs.  They skip when the developer's
configured local PostgreSQL corpus is unavailable, which keeps CI/networkless
environments safe while allowing an explicit local acceptance run.
"""

from __future__ import annotations

import statistics
import time
import re
from datetime import date

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import Case, LegalSource, SourceChunk
from app.db.session import engine
from app.schemas.tools import ExactLegalLookupRequest
from app.services.exact_legal_source_service import ExactLegalSourceService
from app.services.request_evidence_registry import RequestEvidenceRegistry


def _counts(db: Session) -> tuple[int, int, int]:
    return (
        int(db.scalar(select(func.count()).select_from(LegalSource)) or 0),
        int(db.scalar(select(func.count()).select_from(SourceChunk)) or 0),
        int(db.scalar(select(func.count()).select_from(Case)) or 0),
    )


@pytest.fixture(scope="module")
def canonical_read_only_db():
    """Expose the configured corpus through a PostgreSQL read-only transaction."""
    try:
        connection = engine.connect()
        transaction = connection.begin()
        connection.execute(text("SET TRANSACTION READ ONLY"))
        db = Session(bind=connection, autoflush=False, autocommit=False)
        before = _counts(db)
    except SQLAlchemyError as exc:
        pytest.skip(f"configured local canonical corpus is unavailable: {exc.__class__.__name__}")

    try:
        yield db, before
    finally:
        db.close()
        transaction.rollback()
        connection.close()


def _lookup(
    db: Session,
    *,
    request: ExactLegalLookupRequest,
    call_id: str,
):
    registry = RequestEvidenceRegistry(request_id=f"real-corpus-{call_id}")
    output = ExactLegalSourceService(db).lookup(
        request,
        registry=registry,
        tool_call_id=call_id,
    )
    return output, registry


def _has_exact_schedule_locator(value: str | None, schedule: str) -> bool:
    """Return whether text names exactly this Schedule locator."""
    return bool(
        re.search(
            rf"(?i)(?<![A-Z0-9])schedule\s+{re.escape(schedule)}(?![A-Z0-9])",
            value or "",
        )
    )


def _chunk_is_structurally_in_schedule(
    source: LegalSource,
    chunk: SourceChunk,
    schedule: str,
) -> bool:
    """Accept both legacy schedule-per-source and current volume-based corpora."""
    if _has_exact_schedule_locator(source.title, schedule):
        return True
    if _has_exact_schedule_locator(chunk.heading, schedule):
        return True
    return bool(
        re.search(
            rf"(?im)^\s*schedule\s+{re.escape(schedule)}(?![A-Z0-9])",
            chunk.text or "",
        )
    )


@pytest.mark.parametrize("schedule", ["1", "2", "3", "8", "10", "13", "7A", "6D"])
def test_schedule_lookup_returns_registered_real_canonical_rows(
    canonical_read_only_db, schedule: str
):
    db, _ = canonical_read_only_db
    output, registry = _lookup(
        db,
        request=ExactLegalLookupRequest(
            schedule=schedule,
            as_of_date=date.today(),
            max_hits=2,
        ),
        call_id=f"schedule-{schedule}",
    )

    assert output.coverage.status == "available_partial"
    assert output.matches, f"Schedule {schedule} was covered but returned no canonical rows"
    for match in output.matches:
        evidence = match.canonical_evidence_ref
        assert registry.resolve_evidence(evidence.evidence_ref) == evidence
        source = db.get(LegalSource, evidence.canonical_source_id)
        chunk = db.get(SourceChunk, evidence.canonical_chunk_id)
        assert source is not None
        assert chunk is not None
        assert _chunk_is_structurally_in_schedule(source, chunk, schedule)
        assert evidence.authority_kind == "delegated_legislation"


@pytest.mark.parametrize(
    ("requested", "forbidden"),
    [
        ("1", ("10", "13")),
        ("10", ("1",)),
        ("13", ("1",)),
        ("7A", ("1",)),
        ("6D", ("1",)),
    ],
)
def test_schedule_lookup_never_crosses_schedule_locator_families(
    canonical_read_only_db, requested: str, forbidden: tuple[str, ...]
):
    db, _ = canonical_read_only_db
    output, _ = _lookup(
        db,
        request=ExactLegalLookupRequest(
            schedule=requested,
            as_of_date=date.today(),
            max_hits=8,
        ),
        call_id=f"schedule-isolation-{requested}",
    )

    assert output.matches
    resolved_rows: list[tuple[LegalSource, SourceChunk]] = []
    for match in output.matches:
        evidence = match.canonical_evidence_ref
        source = db.get(LegalSource, evidence.canonical_source_id)
        chunk = db.get(SourceChunk, evidence.canonical_chunk_id)
        assert source is not None and chunk is not None
        resolved_rows.append((source, chunk))

    assert all(
        _chunk_is_structurally_in_schedule(source, chunk, requested)
        for source, chunk in resolved_rows
    )
    for wrong_schedule in forbidden:
        assert not any(
            _chunk_is_structurally_in_schedule(source, chunk, wrong_schedule)
            for source, chunk in resolved_rows
        )


@pytest.mark.parametrize(
    ("document_id", "expected_family", "expected_authority_kind"),
    [
        ("Migration Act", "Migration Act 1958", "statute"),
        ("Migration Regulations", "Migration Regulations 1994", "delegated_legislation"),
    ],
)
def test_act_and_regulations_lookup_are_coverage_scoped(
    canonical_read_only_db,
    document_id: str,
    expected_family: str,
    expected_authority_kind: str,
):
    db, _ = canonical_read_only_db
    output, _ = _lookup(
        db,
        request=ExactLegalLookupRequest(
            document_id=document_id,
            as_of_date=date.today(),
            max_hits=2,
        ),
        call_id=document_id.lower().replace(" ", "-"),
    )

    assert output.coverage.family == expected_family
    assert output.coverage.status == "available_partial"
    assert output.matches
    assert {
        match.canonical_evidence_ref.authority_kind for match in output.matches
    } == {expected_authority_kind}


def test_absent_families_are_honest_coverage_gaps(canonical_read_only_db):
    db, _ = canonical_read_only_db
    output, registry = _lookup(
        db,
        request=ExactLegalLookupRequest(
            case_citation="[2099] FCA 9999",
            as_of_date=date.today(),
        ),
        call_id="absent-court",
    )

    assert output.coverage.status == "absent"
    assert output.matches == []
    assert registry.entry_count == 0


def test_schedule_two_cross_references_are_resolved_or_explicitly_unresolved(
    canonical_read_only_db,
):
    db, _ = canonical_read_only_db
    schedule_two_chunk = db.scalar(
        select(SourceChunk)
        .join(LegalSource, LegalSource.id == SourceChunk.source_id)
        .where(ExactLegalSourceService._family_source_condition("migration_regulations_schedule_2"))
        .where(ExactLegalSourceService._schedule_chunk_condition("2"))
        .where(
            SourceChunk.text.ilike("%Schedule 3%")
            | SourceChunk.text.ilike("%Migration Act%")
            | SourceChunk.text.ilike("%the Act%")
        )
        .order_by(LegalSource.title, SourceChunk.chunk_index)
        .limit(1)
    )
    if schedule_two_chunk is None:
        pytest.skip("local Schedule 2 corpus has no deterministic Schedule 3/Act reference sample")

    text_lower = schedule_two_chunk.text.lower()
    if "schedule 3" in text_lower:
        query_text = expected_surface = "Schedule 3"
    elif "migration act" in text_lower:
        query_text = expected_surface = "Migration Act"
    else:
        # The parser retains the actual surface form while resolving it to the
        # Migration Act document family, so use the source text for lookup.
        query_text, expected_surface = "the Act", "the Act"
    output, registry = _lookup(
        db,
        request=ExactLegalLookupRequest(
            schedule="2",
            query=query_text,
            provision=schedule_two_chunk.section_ref,
            as_of_date=date.today(),
            max_hits=8,
        ),
        call_id="schedule-2-cross-reference",
    )

    resolved = [item for item in output.resolved_cross_references if item.locator == expected_surface]
    unresolved = [item for item in output.unresolved_cross_references if item == expected_surface]
    assert resolved or unresolved
    for item in resolved:
        for evidence_ref in item.evidence_refs:
            registry.resolve_evidence(evidence_ref)


def test_representative_exact_lookup_stays_inside_the_component_timeout(
    canonical_read_only_db,
):
    db, _ = canonical_read_only_db
    durations_ms: list[float] = []
    for index in range(5):
        started = time.perf_counter()
        output, _ = _lookup(
            db,
            request=ExactLegalLookupRequest(
                schedule="2",
                as_of_date=date.today(),
                max_hits=2,
            ),
            call_id=f"latency-{index}",
        )
        durations_ms.append((time.perf_counter() - started) * 1000)
        assert output.matches

    assert max(durations_ms) <= 1000
    assert statistics.quantiles(durations_ms, n=20, method="inclusive")[18] <= 500


def test_canonical_counts_are_unchanged_after_read_only_lookups(canonical_read_only_db):
    db, before = canonical_read_only_db
    assert _counts(db) == before
