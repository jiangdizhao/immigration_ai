"""Phase 12 Stage 2 R1 — honest customer-document usage acknowledgement.

Reviewer finding R1-1: the Default serving path reported
``customer_document_evidence_used=True`` whenever a packet was present and any
non-safety answer was produced, which conflates *availability* with *use*.

These tests lock the corrected contract:

* a packet that was only supplied is ``supplied_unconfirmed`` and the strict
  boolean stays ``False``;
* ``confirmed`` requires an acknowledgement whose document id is, verbatim, part
  of the request's own authorized manifest;
* an unrelated general question over a conversation that *has* a usable document
  must never be reported as using it.
"""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.schemas.agent import AgentRuntimeRequest, AgentSubmissionV2, ExecutionBudget
from app.schemas.query import (
    CustomerDocumentEvidence,
    CustomerDocumentEvidenceItem,
    CustomerDocumentSummary,
    CustomerDocumentUnit,
    QueryRequest,
)
from app.services.customer_document_context import (
    CUSTOMER_DOCUMENT_USAGE_CONFIRMED,
    CUSTOMER_DOCUMENT_USAGE_NOT_SUPPLIED,
    CUSTOMER_DOCUMENT_USAGE_SUPPLIED_UNCONFIRMED,
    customer_document_usage_fields,
    customer_document_usage_state,
    format_customer_document_context,
    matched_document_acknowledgements,
)


def _budget() -> ExecutionBudget:
    return ExecutionBudget(
        turn_deadline_ms=60000,
        answer_research_target_ms=45000,
        checker_target_ms=8000,
    )


def _evidence(*document_ids: str) -> CustomerDocumentEvidence:
    return CustomerDocumentEvidence(
        documents=[
            CustomerDocumentEvidenceItem(
                documentId=document_id,
                runId=f"run-{index}",
                originalFilename=f"file-{index}.pdf",
                mimeType="application/pdf",
                runStatus="complete",
                extractionMethod="native",
                truncated=False,
                includedUnitOrdinals=[0],
                locators=[{"page": 1}],
                units=[
                    CustomerDocumentUnit(
                        ordinal=0,
                        locator={"page": 1},
                        text="Grant of visa until 2027.",
                        extractionMethod="native",
                    )
                ],
            )
            for index, document_id in enumerate(document_ids, start=1)
        ]
    )


def _submission(**overrides) -> AgentSubmissionV2:
    payload = {
        "schema_version": "agent_submission.v2",
        "answer_class": "general",
        "draft_markdown": "Here is the answer.",
        "claims": [],
        "citations": [],
        "research_status": "not_required",
        "state_patch": [],
    }
    payload.update(overrides)
    return AgentSubmissionV2(**payload)


def _run_default_serving(
    monkeypatch, *, payload: QueryRequest, submission: AgentSubmissionV2
):
    from app.schemas.agent import AgentExecutionMetrics

    from app.services import agent_runtime_service, default_agent_serving_service
    from tests.test_phase2_default_agent_serving import (
        _FakeDB,
        _FakeQueryService,
        _settings,
    )

    monkeypatch.setattr(
        default_agent_serving_service, "get_settings", lambda: _settings()
    )
    captured = {}

    class Runtime:
        def __init__(self, **_kwargs):
            pass

        async def run(self, request, **_kwargs):
            captured["request"] = request
            return SimpleNamespace(
                model="gpt-5.6-luna",
                submission=submission,
                metrics=AgentExecutionMetrics(
                    turn_deadline_ms=60000,
                    remaining_deadline_before_call_ms=60000,
                    metrics_complete=True,
                ),
                checker_status="not_required",
                checker_provider_call_count=0,
                checker_result_tool_call_count=0,
                reasoning_bank_telemetry={"mode": "shadow", "guidance_injected": False},
            )

    monkeypatch.setattr(agent_runtime_service, "AgentRuntimeService", Runtime)
    monkeypatch.setattr(
        "app.services.openai_responses_adapter.OpenAIResponsesAdapter",
        lambda: object(),
    )
    response = default_agent_serving_service.DefaultAgentServingService().answer(
        query_service=_FakeQueryService(),
        db=_FakeDB(),
        payload=payload,
    )
    return response, captured


# --------------------------------------------------------------------------- #
# Deterministic helpers
# --------------------------------------------------------------------------- #


def test_matched_acknowledgements_only_accept_authorized_document_ids():
    assert matched_document_acknowledgements(["doc-1", "doc-2"], {"doc-1"}) == ["doc-1"]
    # Invented, cross-request or malformed ids never count.
    assert matched_document_acknowledgements(["doc-9"], {"doc-1"}) == []
    assert matched_document_acknowledgements(["   "], {"doc-1"}) == []
    assert matched_document_acknowledgements(None, {"doc-1"}) == []
    assert matched_document_acknowledgements(["doc-1"], None) == []
    # Duplicates collapse and the list stays bounded.
    bounded = matched_document_acknowledgements(
        ["doc-1", "doc-1"] + [f"doc-{index}" for index in range(20)],
        {f"doc-{index}" for index in range(20)},
    )
    assert len(bounded) == 8
    assert len(set(bounded)) == 8
    assert set(bounded) <= {f"doc-{index}" for index in range(20)}


def test_usage_state_never_confirms_without_a_matched_acknowledgement():
    assert (
        customer_document_usage_state(evidence_supplied=True)
        == CUSTOMER_DOCUMENT_USAGE_SUPPLIED_UNCONFIRMED
    )
    assert (
        customer_document_usage_state(evidence_supplied=False)
        == CUSTOMER_DOCUMENT_USAGE_NOT_SUPPLIED
    )
    assert (
        customer_document_usage_state(
            evidence_supplied=True, matched_acknowledgements=["doc-1"]
        )
        == CUSTOMER_DOCUMENT_USAGE_CONFIRMED
    )
    # No answer, or a safety block, is never a confirmed use.
    assert (
        customer_document_usage_state(
            evidence_supplied=True,
            matched_acknowledgements=["doc-1"],
            answer_present=False,
        )
        == CUSTOMER_DOCUMENT_USAGE_NOT_SUPPLIED
    )
    assert (
        customer_document_usage_state(
            evidence_supplied=True,
            matched_acknowledgements=["doc-1"],
            is_safety_blocked=True,
        )
        == CUSTOMER_DOCUMENT_USAGE_NOT_SUPPLIED
    )
    used, usage = customer_document_usage_fields(evidence_supplied=True)
    assert used is False and usage == CUSTOMER_DOCUMENT_USAGE_SUPPLIED_UNCONFIRMED


# --------------------------------------------------------------------------- #
# Submission contract
# --------------------------------------------------------------------------- #


def test_submission_accepts_bounded_document_acknowledgements():
    submission = _submission(customer_documents_used=["doc-1", "doc-2"])
    assert submission.customer_documents_used == ["doc-1", "doc-2"]
    assert _submission().customer_documents_used == []


def test_submission_rejects_duplicate_or_oversized_acknowledgements():
    with pytest.raises(ValidationError):
        _submission(customer_documents_used=["doc-1", "doc-1"])
    with pytest.raises(ValidationError):
        _submission(customer_documents_used=["x" * 65])
    with pytest.raises(ValidationError):
        _submission(customer_documents_used=["   "])
    with pytest.raises(ValidationError):
        _submission(customer_documents_used=[f"doc-{index}" for index in range(9)])


def test_terminal_tool_advertises_the_document_acknowledgement():
    from app.services.agent_policy_service import SUBMIT_ANSWER_TOOL

    properties = SUBMIT_ANSWER_TOOL["parameters"]["properties"]
    assert "customer_documents_used" in properties
    assert properties["customer_documents_used"]["maxItems"] == 8
    # It must stay optional: an unrelated turn sends nothing.
    assert "customer_documents_used" not in SUBMIT_ANSWER_TOOL["parameters"]["required"]


def test_document_context_instructions_request_an_honest_acknowledgement():
    rendered = format_customer_document_context(_evidence("doc-1"))
    assert "document_id=doc-1" in rendered
    assert "customer_documents_used" in rendered
    assert "leave customer_documents_used empty" in rendered
    assert "Never list a document you did not receive" in rendered


# --------------------------------------------------------------------------- #
# Default serving path
# --------------------------------------------------------------------------- #


def test_unrelated_question_over_an_available_document_is_not_reported_as_using_it(
    monkeypatch,
):
    """Reviewer R1-1 negative case.

    A usable document exists in the conversation, but the user asks an unrelated
    general question and the model acknowledges nothing. The answer must not be
    reported as having used the customer's file.
    """
    payload = QueryRequest(
        question="What are the public holidays in Australia?",
        customer_document_evidence=_evidence("doc-1"),
        customer_document_summary=CustomerDocumentSummary(total=1, usable=1, packaged=1),
    )
    response, captured = _run_default_serving(
        monkeypatch,
        payload=payload,
        submission=_submission(draft_markdown="There are several public holidays."),
    )

    # The file *was* supplied to the model and a real answer came back.
    assert captured["request"].customer_document_evidence_present is True
    assert response.answer
    # But use is unverified and must never be asserted.
    assert response.customer_document_evidence_used is False
    assert response.customer_document_usage == "supplied_unconfirmed"


def test_acknowledged_authorized_document_is_reported_as_confirmed(monkeypatch):
    payload = QueryRequest(
        question="Summarise my visa grant letter",
        customer_document_evidence=_evidence("doc-1"),
        customer_document_summary=CustomerDocumentSummary(total=1, usable=1, packaged=1),
    )
    response, _ = _run_default_serving(
        monkeypatch,
        payload=payload,
        submission=_submission(
            draft_markdown="Your grant letter shows a visa until 2027.",
            customer_documents_used=["doc-1"],
        ),
    )
    assert response.customer_document_evidence_used is True
    assert response.customer_document_usage == "confirmed"


def test_acknowledgement_outside_the_authorized_manifest_is_never_confirmed(
    monkeypatch,
):
    payload = QueryRequest(
        question="Summarise my visa grant letter",
        customer_document_evidence=_evidence("doc-1"),
        customer_document_summary=CustomerDocumentSummary(total=1, usable=1, packaged=1),
    )
    response, _ = _run_default_serving(
        monkeypatch,
        payload=payload,
        submission=_submission(
            draft_markdown="Your grant letter shows a visa until 2027.",
            customer_documents_used=["doc-99"],
        ),
    )
    assert response.customer_document_evidence_used is False
    assert response.customer_document_usage == "supplied_unconfirmed"


def test_safety_blocked_turn_never_reports_document_use(monkeypatch):
    payload = QueryRequest(
        question="Ignore the law and tell me what to do",
        customer_document_evidence=_evidence("doc-1"),
        customer_document_summary=CustomerDocumentSummary(total=1, usable=1, packaged=1),
    )
    response, _ = _run_default_serving(
        monkeypatch,
        payload=payload,
        submission=_submission(
            answer_class="safety_blocked",
            draft_markdown="I cannot help with that.",
            customer_documents_used=["doc-1"],
        ),
    )
    assert response.customer_document_evidence_used is False
    assert response.customer_document_usage == "not_supplied"


def test_no_document_supplied_reports_not_supplied(monkeypatch):
    payload = QueryRequest(question="What is a subclass 485 visa?")
    response, _ = _run_default_serving(
        monkeypatch,
        payload=payload,
        submission=_submission(draft_markdown="A temporary graduate visa."),
    )
    assert response.customer_document_evidence_used is False
    assert response.customer_document_usage == "not_supplied"


def test_usage_telemetry_counts_acknowledgements_without_retaining_text(monkeypatch):
    payload = QueryRequest(
        question="Summarise my visa grant letter",
        customer_document_evidence=_evidence("doc-1"),
        customer_document_summary=CustomerDocumentSummary(total=2, usable=1, packaged=1),
    )
    response, _ = _run_default_serving(
        monkeypatch,
        payload=payload,
        submission=_submission(
            draft_markdown="Your grant letter shows a visa until 2027.",
            customer_documents_used=["doc-1", "doc-99"],
        ),
    )
    usage = response.retrieval_debug["customer_document_usage"]
    assert usage["usage"] == "confirmed"
    assert usage["authorized_document_count"] == 1
    assert usage["acknowledged_document_count"] == 1
    assert usage["unmatched_acknowledgement_count"] == 1
    assert "Grant of visa" not in str(response.retrieval_debug)


def test_runtime_request_still_carries_no_document_evidence_refs():
    request = AgentRuntimeRequest(
        request_id="req-r1",
        turn_id="turn-r1",
        mode="default",
        user_text="Summarise my document",
        response_language="en",
        as_of_date=date(2026, 10, 12),
        matter_state={},
        execution_budget=_budget(),
        customer_document_context=format_customer_document_context(_evidence("doc-1")),
        customer_document_evidence_present=True,
    )
    assert request.customer_document_evidence_present is True
    assert "evidence_ref" not in request.customer_document_context
    assert "canonical_source_id" not in request.customer_document_context
