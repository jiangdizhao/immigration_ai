"""Focused tests for bounded Schedule-2 provision-block lookup."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from app.db.models import LegalSource, SourceChunk
from app.schemas.tools import ExactLegalLookupRequest
from app.services.exact_legal_source_service import ExactLegalSourceService
from app.services.request_evidence_registry import create_registry


def _source() -> SimpleNamespace:
    return SimpleNamespace(
        id="source-1",
        title="Migration Regulations 1994 - F2026C00667 Volume 2",
        source_type="legislation",
        authority="canonical corpus",
        jurisdiction="Cth",
        metadata_json={},
        url=None,
        effective_date=date(2026, 7, 1),
        repeal_date=None,
        document_version="F2026C00667",
        status="active",
    )


def _chunk(index: int, heading: str, text: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=f"chunk-{index}",
        source_id="source-1",
        chunk_index=index,
        section_ref=f"page_{index}",
        heading=heading,
        text=text,
        source=_source(),
    )


class _BlockDb:
    def __init__(self, candidates, ordered_chunks) -> None:
        self.source = _source()
        self.candidates = candidates
        self.ordered_chunks = ordered_chunks
        self.scalars_calls = 0

    def scalars(self, _statement):
        self.scalars_calls += 1
        return self.candidates if self.scalars_calls == 1 else self.ordered_chunks

    def get(self, model, identifier):
        if model is LegalSource:
            return self.source if identifier == self.source.id else None
        if model is SourceChunk:
            return next(
                (chunk for chunk in self.ordered_chunks if chunk.id == identifier),
                None,
            )
        return None


def _lookup(
    chunks,
    *,
    requested="123.456",
    subclass="123",
    max_hits=8,
    candidate_indices=None,
    block_metadata=None,
):
    candidate_indices = candidate_indices or [0]
    db = _BlockDb([chunks[index] for index in candidate_indices], chunks)
    request = ExactLegalLookupRequest(
        schedule="2",
        provision=requested,
        subclass=subclass,
        as_of_date=date(2026, 8, 30),
        max_hits=max_hits,
    )
    matches = ExactLegalSourceService(db)._find_matches(
        request=request,
        family_id="migration_regulations_schedule_2",
        registry=create_registry("exact-blocks"),
        tool_call_id="exact-blocks-call",
        block_metadata=block_metadata,
    )
    return matches


def test_provision_block_includes_continuations_and_excludes_next_peer():
    chunks = [
        _chunk(
            10,
            "Schedule 2 — Subclass 123 — Clause 123.456",
            "Clause 123.456\n(1) First rule.",
        ),
        _chunk(11, "Schedule 2 — Subclass 123", "(2) Decisive continuation phrase."),
        _chunk(12, "Schedule 2 — Subclass 123", "(3) Further continuation."),
        _chunk(
            13,
            "Schedule 2 — Subclass 123 — Clause 123.457",
            "Clause 123.457\n(1) Next peer provision.",
        ),
    ]

    matches = _lookup(chunks)

    assert [match[0].canonical_chunk_id for match in matches] == [
        "chunk-10",
        "chunk-11",
        "chunk-12",
    ]
    assert "Decisive continuation phrase" in matches[1][0].text
    assert all(match[0].canonical_chunk_id != "chunk-13" for match in matches)


def test_provision_block_stops_at_next_subclass_boundary():
    chunks = [
        _chunk(
            20,
            "Schedule 2 — Subclass 123 — Clause 123.456",
            "Clause 123.456\n(1) First rule.",
        ),
        _chunk(21, "Schedule 2 — Subclass 123", "(2) Continuation."),
        _chunk(
            22,
            "Schedule 2 — Subclass 124 — Clause 124.211",
            "Clause 124.211\n(1) Other subclass.",
        ),
    ]

    matches = _lookup(chunks)

    assert [match[0].canonical_chunk_id for match in matches] == [
        "chunk-20",
        "chunk-21",
    ]


def test_provision_block_ignores_model_max_hits_without_peer_leakage():
    chunks = [
        _chunk(
            30,
            "Schedule 2 — Subclass 123 — Clause 123.456",
            "Clause 123.456\n(1) First rule.",
        ),
        _chunk(31, "Schedule 2 — Subclass 123", "(2) Continuation."),
        _chunk(32, "Schedule 2 — Subclass 123", "(3) Continuation."),
        _chunk(
            33,
            "Schedule 2 — Subclass 123 — Clause 123.457",
            "Clause 123.457\n(1) Next peer provision.",
        ),
    ]

    block_metadata = {}
    matches = _lookup(chunks, max_hits=2, block_metadata=block_metadata)

    assert len(matches) == 3
    assert [match[0].canonical_chunk_id for match in matches] == [
        "chunk-30",
        "chunk-31",
        "chunk-32",
    ]
    assert block_metadata == {
        "provision_block_complete": True,
        "provision_block_backend_cap_reached": False,
    }


def test_provision_block_reports_backend_cap_before_continuation_boundary():
    chunks = [
        _chunk(
            70,
            "Schedule 2 — Subclass 123 — Clause 123.456",
            "Clause 123.456\n(1) First rule.",
        ),
        *[
            _chunk(index, "Schedule 2 — Subclass 123", f"({index - 69}) Continuation.")
            for index in range(71, 91)
        ],
        _chunk(91, "Schedule 2 — Subclass 123", "(22) Continuation beyond cap."),
        _chunk(
            92,
            "Schedule 2 — Subclass 123 — Clause 123.457",
            "Clause 123.457\n(1) Next peer provision.",
        ),
    ]

    block_metadata = {}
    matches = _lookup(chunks, max_hits=1, block_metadata=block_metadata)

    assert len(matches) == 20
    assert [match[0].canonical_chunk_id for match in matches] == [
        f"chunk-{index}" for index in range(70, 90)
    ]
    assert all(match[0].canonical_chunk_id != "chunk-92" for match in matches)
    assert block_metadata == {
        "provision_block_complete": False,
        "provision_block_backend_cap_reached": True,
    }


def test_line_broken_incidental_reference_does_not_beat_bare_structural_start():
    chunks = [
        _chunk(
            40,
            "Schedule 2 — Subclass 123",
            "Some preceding rule says:\nsee the applicable rule\n123.456\ncontinued prose.",
        ),
        _chunk(41, "Schedule 2 — Subclass 123", "Unrelated intervening text."),
        _chunk(
            42,
            "Schedule 2 — Subclass 123",
            "123.456\n(1) Genuine first subsection.",
        ),
        _chunk(43, "Schedule 2 — Subclass 123", "(2) Continuation."),
        _chunk(
            44,
            "Schedule 2 — Subclass 123 — Clause 123.457",
            "Clause 123.457\n(1) Next peer provision.",
        ),
    ]

    matches = _lookup(chunks, candidate_indices=[0, 2])

    assert [match[0].canonical_chunk_id for match in matches] == [
        "chunk-42",
        "chunk-43",
    ]
    assert all(match[0].canonical_chunk_id != "chunk-40" for match in matches)
    assert all(match[0].canonical_chunk_id != "chunk-41" for match in matches)


def test_genuine_bare_provision_start_is_recognized():
    chunks = [
        _chunk(
            50,
            "Schedule 2 — Subclass 123",
            "123.456\n(1) Genuine bare provision start.",
        ),
        _chunk(51, "Schedule 2 — Subclass 123", "(2) Continuation."),
    ]

    matches = _lookup(chunks)

    assert [match[0].canonical_chunk_id for match in matches] == [
        "chunk-50",
        "chunk-51",
    ]


def test_explicit_clause_provision_start_remains_recognized():
    chunks = [
        _chunk(
            60,
            "Schedule 2 — Subclass 123",
            "Clause 123.456\n(1) Explicit clause start.",
        ),
        _chunk(61, "Schedule 2 — Subclass 123", "(2) Continuation."),
    ]

    matches = _lookup(chunks)

    assert [match[0].canonical_chunk_id for match in matches] == [
        "chunk-60",
        "chunk-61",
    ]
