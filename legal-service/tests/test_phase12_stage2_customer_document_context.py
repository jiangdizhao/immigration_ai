"""Phase 12 Stage 2 — consistent customer document context.

Fast, Legal Check (AgentRuntime) and Premium must all receive the same bounded
view of the conversation's own files, and no path may imply it read a file whose
extraction produced nothing usable. These tests are deterministic and make no
provider calls.
"""
from __future__ import annotations

from datetime import date

from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
from app.schemas.query import (
    CustomerDocumentEvidence,
    CustomerDocumentEvidenceItem,
    CustomerDocumentSummary,
    CustomerDocumentUnit,
    QueryRequest,
)
from app.services.customer_document_context import (
    format_customer_document_context,
    format_customer_document_prompt_section,
    format_customer_document_status_context,
)


def _budget() -> ExecutionBudget:
    return ExecutionBudget(
        turn_deadline_ms=60000,
        answer_research_target_ms=45000,
        checker_target_ms=8000,
    )


def _evidence() -> CustomerDocumentEvidence:
    return CustomerDocumentEvidence(
        documents=[
            CustomerDocumentEvidenceItem(
                documentId="doc-1",
                runId="run-1",
                originalFilename="visa-grant.pdf",
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
        ]
    )


def test_usable_evidence_is_rendered_as_untrusted_customer_data():
    rendered = format_customer_document_context(_evidence())
    assert "CUSTOMER-PROVIDED DOCUMENT CONTEXT" in rendered
    assert "UNTRUSTED DATA" in rendered
    assert "Grant of visa until 2027." in rendered
    assert "document_id=doc-1" in rendered
    assert "run_id=run-1" in rendered
    # The packet may not be presented as law or as verified fact.
    assert "NOT OFFICIAL LAW" in rendered


def test_no_evidence_and_no_files_produces_no_context():
    empty = QueryRequest(question="What is a visa?")
    assert format_customer_document_prompt_section(empty) == ""
    assert format_customer_document_status_context(None) == ""


def test_usable_files_never_add_an_availability_denial():
    usable = QueryRequest(
        question="Summarise my document",
        customer_document_evidence=_evidence(),
        customer_document_summary=CustomerDocumentSummary(total=1, usable=1),
    )
    section = format_customer_document_prompt_section(usable)
    assert "Grant of visa until 2027." in section
    assert "CUSTOMER FILE AVAILABILITY" not in section


def test_files_without_usable_text_produce_an_honest_limitation():
    summary = CustomerDocumentSummary(
        total=2,
        usable=0,
        noUsableContent=1,
        failed=1,
        unusableFilenames=["scanned-page.png"],
    )
    request = QueryRequest(question="What does my file say?", customer_document_summary=summary)
    section = format_customer_document_prompt_section(request)
    assert "CUSTOMER FILE AVAILABILITY" in section
    assert "no readable" in section
    assert "Do not describe, summarise, quote or reason about the contents" in section
    assert "do not claim to have read them" in section
    assert "scanned-page.png" in section
    # A concrete recovery step is required, not a vague apology.
    assert "re-upload a supported text-based file" in section


def test_processing_files_are_reported_as_pending_not_as_unreadable():
    summary = CustomerDocumentSummary(total=1, usable=0, processing=1)
    rendered = format_customer_document_status_context(summary)
    assert "still processing=1" in rendered
    assert "no usable extracted content=0" in rendered


def test_document_summary_bounds_its_input():
    oversized = ["x" * 121]
    try:
        CustomerDocumentSummary(total=1, unusableFilenames=oversized)
    except ValueError:
        pass
    else:
        raise AssertionError("an over-long filename must be rejected")

    try:
        CustomerDocumentSummary(total=1, unusableFilenames=["a", "b", "c", "d"])
    except ValueError:
        pass
    else:
        raise AssertionError("the filename list must be bounded")


def test_agent_runtime_request_carries_document_context_without_evidence_refs():
    request = AgentRuntimeRequest(
        request_id="req-1",
        turn_id="turn-1",
        mode="default",
        user_text="Summarise my document",
        response_language="en",
        as_of_date=date(2026, 10, 11),
        matter_state={},
        execution_budget=_budget(),
        customer_document_context=format_customer_document_prompt_section(
            QueryRequest(question="q", customer_document_evidence=_evidence())
        ),
        customer_document_evidence_present=True,
    )
    assert request.customer_document_evidence_present is True
    assert "Grant of visa until 2027." in request.customer_document_context
    # The document section must not look like an evidence reference.
    assert "evidence_ref" not in request.customer_document_context
    assert "canonical_source_id" not in request.customer_document_context


def test_agent_runtime_message_labels_documents_as_customer_data():
    from app.services.agent_runtime_service import AgentRuntimeService

    request = AgentRuntimeRequest(
        request_id="req-1",
        turn_id="turn-1",
        mode="default",
        user_text="Summarise my document",
        response_language="en",
        as_of_date=date(2026, 10, 11),
        matter_state={},
        execution_budget=_budget(),
        customer_document_context="Document 1: visa-grant.pdf",
        customer_document_evidence_present=True,
    )
    runtime = AgentRuntimeService.__new__(AgentRuntimeService)
    message = runtime._build_user_message(request)
    assert "## Conversation Customer Documents" in message
    assert "NOT legal authority" in message
    assert "Document 1: visa-grant.pdf" in message

    without_documents = AgentRuntimeRequest(
        request_id="req-2",
        turn_id="turn-2",
        mode="default",
        user_text="What is a visa?",
        response_language="en",
        as_of_date=date(2026, 10, 11),
        matter_state={},
        execution_budget=_budget(),
    )
    assert (
        "Conversation Customer Documents"
        not in runtime._build_user_message(without_documents)
    )


def test_default_agent_serving_passes_and_reports_document_evidence(monkeypatch):
    """Legal Check (AgentRuntime) must receive the conversation's own evidence.

    Before this Stage the Default runtime ignored `customer_document_evidence`
    entirely: the customer's file never reached the model even though Fast and
    Premium consumed it. This test locks the request contract and the truthful
    usage flag.
    """
    from types import SimpleNamespace

    from app.schemas.agent import AgentExecutionMetrics, AgentSubmissionV2
    from app.services import agent_runtime_service, default_agent_serving_service
    from app.services.agent_runtime_service import (
        AgentRuntimeService as RealAgentRuntimeService,
    )
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
            submission = AgentSubmissionV2(
                schema_version="agent_submission.v2",
                answer_class="general",
                draft_markdown="Answers from the supplied customer document.",
                claims=[],
                citations=[],
                research_status="not_required",
                state_patch=[],
            )
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

    payload = QueryRequest(
        question="Summarise my file",
        customer_document_evidence=_evidence(),
        customer_document_summary=CustomerDocumentSummary(total=1, usable=1),
    )
    response = default_agent_serving_service.DefaultAgentServingService().answer(
        query_service=_FakeQueryService(),
        db=_FakeDB(),
        payload=payload,
    )

    request = captured["request"]
    assert request.customer_document_evidence_present is True
    assert "Grant of visa until 2027." in request.customer_document_context
    # The customer's document is supplied as data, never as legal authority.
    runtime = RealAgentRuntimeService.__new__(RealAgentRuntimeService)
    user_message = runtime._build_user_message(request)
    assert "## Conversation Customer Documents" in user_message
    assert "NOT legal authority" in user_message
    # R1: supplying a packet is not proof of use. Without an acknowledgement
    # that matches the authorized manifest the honest state is unconfirmed.
    assert response.customer_document_evidence_used is False
    assert response.customer_document_usage == "supplied_unconfirmed"


def test_default_agent_serving_never_claims_unusable_files_were_read(monkeypatch):
    from types import SimpleNamespace

    from app.schemas.agent import AgentExecutionMetrics, AgentSubmissionV2
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
            submission = AgentSubmissionV2(
                schema_version="agent_submission.v2",
                answer_class="general",
                draft_markdown="I could not read that file; here is how to fix it.",
                claims=[],
                citations=[],
                research_status="not_required",
                state_patch=[],
            )
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

    payload = QueryRequest(
        question="What does my scanned file say?",
        customer_document_summary=CustomerDocumentSummary(
            total=1,
            usable=0,
            noUsableContent=1,
            unusableFilenames=["scan.png"],
        ),
    )
    response = default_agent_serving_service.DefaultAgentServingService().answer(
        query_service=_FakeQueryService(),
        db=_FakeDB(),
        payload=payload,
    )

    request = captured["request"]
    assert request.customer_document_evidence_present is False
    assert "CUSTOMER FILE AVAILABILITY" in request.customer_document_context
    assert "do not claim to have read them" in request.customer_document_context
    # No evidence was supplied, so no file may be reported as analysed.
    assert response.customer_document_evidence_used is False
    assert response.customer_document_usage == "not_supplied"
