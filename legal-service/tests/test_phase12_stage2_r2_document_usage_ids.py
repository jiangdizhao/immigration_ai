"""Phase 12 Stage 2 R2-A — bounded, request-authorized acknowledged document ids.

Reviewer finding R2-A: the Legal Check runtime accepted ``customer_documents_used``
and validated it, but only returned a boolean. A consumer holding a boolean plus
its own packaged manifest had no way to know *which* document was acknowledged,
so one acknowledged document could turn every packaged file into "used".

These tests lock the corrected contract:

* the response carries the bounded, request-authorized acknowledged ids;
* an invented, overlong or cross-request id never appears;
* the ids are non-empty only for the ``confirmed`` state, and always a subset of
  this request's authorized manifest;
* single-shot paths without an acknowledgement channel report no ids at all;
* telemetry names the provenance basis so "confirmed" is never misread as
  independent evidence verification.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.query import (
    CustomerDocumentSummary,
    QueryRequest,
    QueryResponse,
)
from app.services.customer_document_context import matched_document_acknowledgements
from tests.test_phase12_stage2_r1_document_usage import (  # reuse the R1 harness
    _evidence,
    _run_default_serving,
    _submission,
)

FIVE_DOCUMENTS = ("doc-1", "doc-2", "doc-3", "doc-4", "doc-5")


def _payload(document_ids: tuple[str, ...] = FIVE_DOCUMENTS) -> QueryRequest:
    return QueryRequest(
        question="Which of my files show the visa expiry date?",
        customer_document_evidence=_evidence(*document_ids),
        customer_document_summary=CustomerDocumentSummary(
            total=len(document_ids),
            usable=len(document_ids),
            packaged=len(document_ids),
        ),
    )


def test_one_acknowledgement_of_five_packaged_documents_returns_only_that_id(
    monkeypatch,
):
    response, _ = _run_default_serving(
        monkeypatch,
        payload=_payload(),
        submission=_submission(
            draft_markdown="Your grant notice shows a visa until 2027.",
            customer_documents_used=["doc-3"],
        ),
    )
    assert response.customer_document_evidence_used is True
    assert response.customer_document_usage == "confirmed"
    # Exactly the acknowledged document — never the whole packaged packet.
    assert response.customer_document_used_ids == ["doc-3"]


def test_acknowledged_ids_are_the_request_authorized_subset(monkeypatch):
    response, _ = _run_default_serving(
        monkeypatch,
        payload=_payload(),
        submission=_submission(
            draft_markdown="Two of your files matter here.",
            customer_documents_used=["doc-5", "doc-99", "doc-02", "doc-1"],
        ),
    )
    assert response.customer_document_usage == "confirmed"
    assert response.customer_document_used_ids == ["doc-1", "doc-5"]

def test_no_acknowledgement_returns_empty_ids_and_unconfirmed_state(monkeypatch):
    response, _ = _run_default_serving(
        monkeypatch,
        payload=_payload(),
        submission=_submission(draft_markdown="Here is general information."),
    )
    assert response.customer_document_evidence_used is False
    assert response.customer_document_usage == "supplied_unconfirmed"
    assert response.customer_document_used_ids == []


def test_invented_only_acknowledgement_returns_no_ids(monkeypatch):
    response, _ = _run_default_serving(
        monkeypatch,
        payload=_payload(("doc-1",)),
        submission=_submission(
            draft_markdown="I read a document I never received.",
            customer_documents_used=["doc-77"],
        ),
    )
    assert response.customer_document_evidence_used is False
    assert response.customer_document_usage == "supplied_unconfirmed"
    assert response.customer_document_used_ids == []


def test_safety_blocked_turn_returns_no_used_ids(monkeypatch):
    response, _ = _run_default_serving(
        monkeypatch,
        payload=_payload(("doc-1",)),
        submission=_submission(
            answer_class="safety_blocked",
            draft_markdown="I cannot help with that.",
            customer_documents_used=["doc-1"],
        ),
    )
    assert response.customer_document_usage == "not_supplied"
    assert response.customer_document_used_ids == []


def test_response_ids_are_schema_bounded():
    empty = QueryResponse(answer="x", confidence="high", next_action="answer")
    assert empty.customer_document_used_ids == []
    with pytest.raises(ValidationError):
        QueryResponse(
            answer="x",
            confidence="high",
            next_action="answer",
            customer_document_used_ids=[f"doc-{index}" for index in range(9)],
        )


def test_usage_telemetry_names_the_acknowledgement_basis(monkeypatch):
    confirmed, _ = _run_default_serving(
        monkeypatch,
        payload=_payload(("doc-1", "doc-2")),
        submission=_submission(
            draft_markdown="Your letter shows a visa until 2027.",
            customer_documents_used=["doc-1"],
        ),
    )
    assert confirmed.retrieval_debug["customer_document_usage"]["usage_basis"] == (
        "model_acknowledged"
    )
    unconfirmed, _ = _run_default_serving(
        monkeypatch,
        payload=_payload(("doc-1",)),
        submission=_submission(draft_markdown="General information only."),
    )
    assert (
        unconfirmed.retrieval_debug["customer_document_usage"]["usage_basis"] == "none"
    )


def test_matched_acknowledgements_ignore_overlong_and_malformed_ids():
    assert matched_document_acknowledgements(
        ["doc-1", "x" * 65, "", 7, None, "  doc-1  "], {"doc-1", "x" * 65}
    ) == ["doc-1"]


def test_single_shot_paths_report_no_acknowledged_ids():
    """Fast/Premium/legacy have no acknowledgement channel: ids stay empty."""
    from types import SimpleNamespace

    from app.services.reasoning_service import ReasoningService

    payload = QueryRequest(
        question="What does this say?",
        customer_document_evidence=_evidence("doc-1"),
        customer_document_summary=CustomerDocumentSummary(total=1, usable=1, packaged=1),
    )
    service = object.__new__(ReasoningService)
    service.model = "test"
    service.max_context_chunks = 2
    service._client = SimpleNamespace(
        responses=SimpleNamespace(
            create=lambda **kwargs: SimpleNamespace(
                output_text="It appears to say this."
            )
        )
    )
    response = service.answer_from_chunks(payload, [], {})
    assert response.customer_document_usage == "supplied_unconfirmed"
    assert response.customer_document_used_ids == []
