from types import SimpleNamespace

import pytest
from pydantic import ValidationError

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


def test_query_schema_accepts_the_bounded_conversation_document_budget():
    documents = []
    for document_index in range(8):
        units = [
            {
                "ordinal": ordinal,
                "locator": {"kind": "page", "page": ordinal},
                "text": "x" * 1000,
                "extractionMethod": "native",
            }
            for ordinal in range(1, 9)
        ]
        documents.append({
            "documentId": f"doc-{document_index}",
            "runId": f"run-{document_index}",
            "originalFilename": f"file-{document_index}.pdf",
            "mimeType": "application/pdf",
            "runStatus": "complete",
            "extractionMethod": "native",
            "truncated": False,
            "includedUnitOrdinals": [unit["ordinal"] for unit in units],
            "locators": [unit["locator"] for unit in units],
            "units": units,
        })

    payload = QueryRequest(
        question="Summarize my documents",
        customer_document_evidence={"documents": documents},
    )
    assert len(payload.customer_document_evidence.documents) == 8
    assert sum(
        len(unit.text)
        for document in payload.customer_document_evidence.documents
        for unit in document.units
    ) == 64_000

    one_full_document = documents[0].copy()
    one_full_document["units"] = [
        {
            "ordinal": ordinal,
            "locator": {"kind": "page", "page": ordinal},
            "text": "x" * 1250,
            "extractionMethod": "native",
        }
        for ordinal in range(1, 17)
    ]
    one_full_document["includedUnitOrdinals"] = list(range(1, 17))
    one_full_document["locators"] = [unit["locator"] for unit in one_full_document["units"]]
    assert len(
        QueryRequest(
            question="Summarize this document",
            customer_document_evidence={"documents": [one_full_document]},
        ).customer_document_evidence.documents[0].units
    ) == 16


def test_query_schema_rejects_document_evidence_above_each_bound():
    base = _payload().customer_document_evidence.documents[0].model_dump(by_alias=True)
    too_long_unit = {**base, "units": [{**base["units"][0], "text": "x" * 6001}]}
    too_many_units = {
        **base,
        "units": [
            {**base["units"][0], "ordinal": ordinal, "locator": {"page": ordinal}}
            for ordinal in range(17)
        ],
        "includedUnitOrdinals": list(range(17)),
        "locators": [{"page": ordinal} for ordinal in range(17)],
    }
    too_many_document_chars = {
        **base,
        "units": [
            {
                **base["units"][0],
                "ordinal": ordinal,
                "locator": {"page": ordinal},
                "text": "x" * 6000,
            }
            for ordinal in range(4)
        ],
        "includedUnitOrdinals": list(range(4)),
        "locators": [{"page": ordinal} for ordinal in range(4)],
    }
    too_many_total_units = []
    for document_index in range(8):
        document = {**base}
        document["documentId"] = f"doc-{document_index}"
        document["runId"] = f"run-{document_index}"
        document["units"] = [
            {**base["units"][0], "ordinal": ordinal, "locator": {"page": ordinal}}
            for ordinal in range(9)
        ]
        document["includedUnitOrdinals"] = list(range(9))
        document["locators"] = [{"page": ordinal} for ordinal in range(9)]
        too_many_total_units.append(document)
    too_many_total_chars = []
    for document_index in range(8):
        document = {**base}
        document["documentId"] = f"doc-{document_index}"
        document["runId"] = f"run-{document_index}"
        document["units"] = [
            {
                **base["units"][0],
                "ordinal": ordinal,
                "locator": {"page": ordinal},
                "text": "x" * 6000,
            }
            for ordinal in range(2)
        ]
        document["includedUnitOrdinals"] = [0, 1]
        document["locators"] = [{"page": ordinal} for ordinal in range(2)]
        too_many_total_chars.append(document)
    with pytest.raises(ValidationError):
        QueryRequest(question="What is this?", customer_document_evidence={"documents": [too_long_unit]})
    with pytest.raises(ValidationError):
        QueryRequest(question="What is this?", customer_document_evidence={"documents": [too_many_units]})
    with pytest.raises(ValidationError):
        QueryRequest(question="What is this?", customer_document_evidence={"documents": [too_many_document_chars]})
    with pytest.raises(ValidationError):
        QueryRequest(question="What is this?", customer_document_evidence={"documents": [base] * 9})
    with pytest.raises(ValidationError):
        QueryRequest(question="What is this?", customer_document_evidence={"documents": too_many_total_units})
    with pytest.raises(ValidationError):
        QueryRequest(question="What is this?", customer_document_evidence={"documents": too_many_total_chars})
