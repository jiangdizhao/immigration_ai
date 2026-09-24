from types import SimpleNamespace

from app.schemas.query import QueryRequest
from app.services.reasoning_service import ReasoningService


def _payload():
    return QueryRequest(question="What does this say?", customer_document_evidence={"documents": [{
        "documentId": "doc-1", "runId": "run-1", "originalFilename": "letter.txt", "mimeType": "text/plain",
        "runStatus": "complete", "extractionMethod": "native", "truncated": False,
        "includedUnitOrdinals": [1], "locators": [{"kind": "page", "page": 1}],
        "units": [{"ordinal": 1, "locator": {"kind": "page", "page": 1}, "text": "document text", "extractionMethod": "native"}],
    }]})


def test_default_document_only_success_acknowledges_usage():
    service = object.__new__(ReasoningService)
    service.model = "test"
    service.max_context_chunks = 2
    service._client = SimpleNamespace(responses=SimpleNamespace(create=lambda **kwargs: SimpleNamespace(output_text="It appears to say this.")))
    response = service.answer_from_chunks(_payload(), [], {})
    assert response.customer_document_evidence_used is True
    assert response.answer == "It appears to say this."
    assert response.citations == []


def test_default_document_only_provider_fallback_does_not_acknowledge_usage():
    def fail(**kwargs):
        raise RuntimeError("offline")
    service = object.__new__(ReasoningService)
    service.model = "test"
    service.max_context_chunks = 2
    service._client = SimpleNamespace(responses=SimpleNamespace(create=fail))
    response = service.answer_from_chunks(_payload(), [], {})
    assert response.customer_document_evidence_used is False
    assert "could not assess" in response.answer


def test_experience_archive_build_receives_document_sanitized_query_request(monkeypatch):
    from app.services.experience_archive_service import ExperienceArchiveService
    service = object.__new__(ExperienceArchiveService)
    captured = {}
    class Snapshot:
        schema_version = "test"
        def model_dump(self, **kwargs): return {"ok": True}
    def build_snapshot(**kwargs):
        captured["payload"] = kwargs["payload"]
        return Snapshot()
    service.build_snapshot = build_snapshot
    persistence = service._build_persistence_payload(
        payload=_payload(), response=SimpleNamespace(matter_id="matter-1", answer="answer"), matter=None
    )
    assert captured["payload"].customer_document_evidence.documents == []
    assert persistence.snapshot_json == {"ok": True}


def test_default_final_synthesis_uses_documents_only_when_nonempty_answer_returns():
    from app.schemas.source import CitationOut
    service = object.__new__(ReasoningService)
    service.model = "test"
    service.max_context_chunks = 2
    service.max_supported_facts = 8
    service.max_quote_chars = 400
    captured = {}
    evidence = {"is_in_domain": True, "is_context_sufficient": True, "supported_facts": [{"fact": "official rule"}], "unsupported_requests": [], "missing_information": [], "follow_up_questions": [], "issue_type": "visa"}
    service._to_citation = lambda _chunk: CitationOut(source_id="source", title="Source", authority="Official", url="https://example.gov")
    service._extract_evidence = lambda **_kwargs: evidence
    def synthesize(**kwargs):
        captured["payload"] = kwargs["payload"]
        return {"answer": "The letter appears to say this.", "confidence": "medium"}
    service._synthesize_answer = synthesize
    response = service.answer_from_chunks(_payload(), [object()], {})
    assert captured["payload"].customer_document_evidence.documents
    assert response.customer_document_evidence_used is True


def test_default_evidence_extraction_fallback_does_not_acknowledge_ignored_documents():
    from app.schemas.source import CitationOut
    service = object.__new__(ReasoningService)
    service.model = "test"
    service.max_context_chunks = 2
    service._to_citation = lambda _chunk: CitationOut(source_id="source", title="Source", authority="Official", url="https://example.gov")
    service._extract_evidence = lambda **_kwargs: None
    response = service.answer_from_chunks(_payload(), [object()], {})
    assert response.customer_document_evidence_used is False
    assert response.retrieval_debug["reasoning_mode"] == "fallback_insufficient"
