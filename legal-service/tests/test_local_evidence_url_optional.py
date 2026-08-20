from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch
import hashlib

import pytest

from app.db.models import LegalSource, SourceChunk
from app.schemas.evidence import FetchedWebEvidenceRef, NativeWebEvidenceRef
from app.services.canonical_evidence_service import (
    CanonicalEvidenceService,
    ChunkNotFoundError,
    ChunkSourceMismatchError,
    SourceNotFoundError,
)
from app.services.ingestion_service import IngestionService
from app.schemas.tools import ExactLegalLookupRequest
from app.services.exact_legal_source_service import ExactLegalSourceService
from app.services.request_evidence_registry import create_registry


def _source(*, source_id: str = "source-1", url: str | None = None, metadata=None):
    return SimpleNamespace(
        id=source_id,
        title="Migration Regulations 1994 - Schedule 2",
        source_type="regulation",
        authority="local corpus",
        jurisdiction="Cth",
        metadata_json=metadata or {},
        url=url,
        effective_date=None,
        repeal_date=None,
        document_version=None,
        status="active",
    )


def _chunk(*, source_id: str = "source-1", chunk_id: str = "chunk-1"):
    return SimpleNamespace(
        id=chunk_id,
        source_id=source_id,
        section_ref="500.211",
        heading="Primary criteria",
        chunk_index=0,
        text="Exact local Schedule text.",
    )


class FakeDb:
    def __init__(self, source=None, chunk=None):
        self.source = source
        self.chunk = chunk

    def get(self, model, identifier):
        if model is LegalSource:
            return self.source if self.source is not None and self.source.id == identifier else None
        if model is SourceChunk:
            return self.chunk if self.chunk is not None and self.chunk.id == identifier else None
        return None


def test_url_less_local_chunk_builds_and_registers_exact_evidence():
    registry = create_registry("local-url-less")
    evidence, ref = CanonicalEvidenceService(FakeDb(_source(), _chunk())).build_evidence_from_chunk(
        source_id="source-1",
        chunk_id="chunk-1",
        tool_call_id="local-search-1",
        registry=registry,
    )
    assert ref is not None and ref.startswith("exact:")
    assert evidence.canonical_url is None
    assert evidence.canonical_source_id == "source-1"
    assert evidence.canonical_chunk_id == "chunk-1"
    assert evidence.text == "Exact local Schedule text."
    assert evidence.content_hash == hashlib.sha256(evidence.text.encode()).hexdigest()
    assert evidence.provenance_complete is True
    assert evidence.source_authenticity == "unverified"
    assert registry.resolve_evidence(ref).canonical_chunk_id == "chunk-1"


def test_direct_url_and_explicit_authenticity_remain_optional_metadata():
    source = _source(
        url="https://www.legislation.gov.au/example",
        metadata={"source_authenticity": "canonical_official"},
    )
    evidence, _ = CanonicalEvidenceService(FakeDb(source, _chunk())).build_evidence_from_chunk(
        source_id="source-1",
        chunk_id="chunk-1",
        tool_call_id="local-search-2",
    )
    assert evidence.canonical_url == source.url
    assert evidence.source_authenticity == "canonical_official"


def test_source_chunk_integrity_failures_remain_structural():
    service = CanonicalEvidenceService(FakeDb(_source(), _chunk(source_id="other")))
    with pytest.raises(ChunkSourceMismatchError):
        service.build_evidence_from_chunk(
            source_id="source-1", chunk_id="chunk-1", tool_call_id="x"
        )
    with pytest.raises(SourceNotFoundError):
        CanonicalEvidenceService(FakeDb(None, _chunk())).build_evidence_from_chunk(
            source_id="source-1", chunk_id="chunk-1", tool_call_id="x"
        )
    with pytest.raises(ChunkNotFoundError):
        CanonicalEvidenceService(FakeDb(_source(), None)).build_evidence_from_chunk(
            source_id="source-1", chunk_id="missing", tool_call_id="x"
        )


def test_url_less_source_exact_span_registers_without_url():
    source = _source()
    registry = create_registry("source-span")
    evidence, ref = CanonicalEvidenceService(FakeDb(source, None)).build_evidence_from_source(
        source_id="source-1",
        text_span="Exact source span.",
        provision="Schedule 3 criterion 3001",
        tool_call_id="exact-1",
        registry=registry,
    )
    assert evidence.canonical_url is None
    assert evidence.canonical_chunk_id is None
    assert evidence.provision_or_span == "Schedule 3 criterion 3001"
    assert registry.is_registered(ref)


def test_flat_rag_normalizes_url_less_local_chunk():
    import app.tools.flat_rag_search as flat_module
    from app.tools.flat_rag_search import FlatRagSearchTool

    class Retrieval:
        def retrieve(self, *, db, payload):
            return [_chunk()], {"count": 1}

    db = FakeDb(_source(), _chunk())
    registry = create_registry("flat-local-url-less")
    with patch.object(flat_module.settings, "flat_rag_tool_enabled", True):
        result = FlatRagSearchTool(db, retrieval_service=Retrieval()).search(
            query="Schedule 2",
            registry=registry,
            tool_call_id="flat-1",
        )
    assert len(result.evidence_refs) == 1
    assert result.evidence_refs[0].startswith("exact:")
    assert result.chunks[0]["evidence_ref"] == result.evidence_refs[0]


def test_exact_lookup_registers_url_less_local_schedule_evidence():
    class LookupDb(FakeDb):
        def scalars(self, _statement):
            return [_chunk()]

    request = ExactLegalLookupRequest(
        schedule="3",
        provision="3001",
        as_of_date=date(2026, 8, 21),
    )
    registry = create_registry("exact-local-url-less")
    matches = ExactLegalSourceService(LookupDb(_source(), _chunk()))._find_matches(
        request=request,
        family_id="migration_regulations",
        registry=registry,
        tool_call_id="exact-1",
    )
    assert len(matches) == 1
    assert matches[0][0].canonical_url is None
    assert registry.is_registered(matches[0][1])


def test_native_and_fetched_web_evidence_still_require_https_urls():
    common = {
        "evidence_origin": "openai_web_native",
        "evidence_ref": "web:pending",
        "source_type": "web_page",
        "source_authenticity": "unverified",
        "authority_kind": "commentary",
        "jurisdiction": None,
        "binding_status": "unknown",
        "court_or_tribunal_level": None,
        "retrieved_at": datetime.now(timezone.utc),
        "provenance_complete": True,
        "search_call_id": "search-1",
        "title": "Source",
        "native_web_citation": None,
        "text": None,
        "content_hash": None,
    }
    with pytest.raises(Exception):
        NativeWebEvidenceRef(**{**common, "url": None})
    with pytest.raises(Exception):
        FetchedWebEvidenceRef(
            evidence_origin="fetched_web",
            evidence_ref="web:pending",
            source_type="web_page",
            source_authenticity="unverified",
            authority_kind="commentary",
            jurisdiction=None,
            binding_status="unknown",
            court_or_tribunal_level=None,
            retrieved_at=datetime.now(timezone.utc),
            provenance_complete=True,
            fetch_call_id="fetch-1",
            url=None,
            title="Source",
            provision_or_span="span",
            text="Exact fetched text",
            content_hash=hashlib.sha256(b"Exact fetched text").hexdigest(),
        )


def test_cross_request_exact_refs_remain_isolated():
    first = create_registry("first")
    second = create_registry("second")
    _, ref = CanonicalEvidenceService(FakeDb(_source(), _chunk())).build_evidence_from_chunk(
        source_id="source-1", chunk_id="chunk-1", tool_call_id="local", registry=first
    )
    assert first.is_registered(ref)
    assert not second.is_registered(ref)


def test_local_ingestion_without_url_succeeds_without_synthesizing_url():
    class IngestDb:
        def __init__(self):
            self.source = None
            self.chunks = []

        def scalar(self, _statement):
            return None

        def add(self, source):
            self.source = source

        def flush(self):
            self.source.id = "ingested-local-source"

        def add_all(self, chunks):
            self.chunks.extend(chunks)

        def commit(self):
            return None

    db = IngestDb()
    result = IngestionService().ingest_source_payload(db, {
        "title": "Local Schedule 3",
        "source_type": "legislation",
        "authority": "local corpus",
        "sections": [{"section_ref": "3001", "text": "Local exact text."}],
    })
    assert result.inserted is True
    assert db.source.url is None
    assert db.chunks[0].text == "Local exact text."


def test_url_based_ingestion_duplicate_detection_remains_when_url_supplied():
    class IngestDb:
        def scalar(self, _statement):
            return SimpleNamespace(id="existing", title="Existing", chunks=[])

    result = IngestionService().ingest_source_payload(IngestDb(), {
        "title": "Web Source",
        "source_type": "guidance",
        "authority": "Home Affairs",
        "url": "https://example.gov.au/source",
        "sections": [{"text": "Text."}],
    })
    assert result.inserted is False
    assert result.status == "skipped_existing"
