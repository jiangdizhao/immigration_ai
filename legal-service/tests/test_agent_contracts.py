from __future__ import annotations

from datetime import date, datetime, timezone
import hashlib

import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.agent import AgentSubmissionV2, ExecutionBudget
from app.schemas.evidence import EvidenceRef, NativeWebEvidenceRef
from app.schemas.fact_check import LegalFactCheckResultV2
from app.schemas.tools import ExactLegalLookupRequest, ToolResultEnvelope, WebSearchOutput


def canonical_evidence_payload() -> dict:
    return {
        "evidence_origin": "canonical_local",
        "evidence_ref": "exact:source-1",
        "source_type": "legislation",
        "source_authenticity": "canonical_official",
        "authority_kind": "statute",
        "jurisdiction": "Cth",
        "binding_status": "binding",
        "court_or_tribunal_level": None,
        "retrieved_at": datetime(2026, 8, 16, tzinfo=timezone.utc),
        "provenance_complete": True,
        "canonical_source_id": "source-1",
        "canonical_chunk_id": "chunk-1",
        "document_id": "Migration Act 1958",
        "document_version": "2026-08-16",
        "provision_or_span": "s 1",
        "effective_from": date(2026, 1, 1),
        "effective_to": None,
        "canonical_url": "https://www.legislation.gov.au/example",
        "content_hash": hashlib.sha256(b"bounded exact source text").hexdigest(),
        "text": "bounded exact source text",
    }


def native_web_evidence_payload() -> dict:
    return {
        "evidence_origin": "openai_web_native",
        "evidence_ref": "web:source-1",
        "source_type": "official_guidance",
        "source_authenticity": "canonical_official",
        "authority_kind": "operational_guidance",
        "jurisdiction": "Cth",
        "binding_status": "non_binding",
        "court_or_tribunal_level": None,
        "retrieved_at": datetime(2026, 8, 16, tzinfo=timezone.utc),
        "provenance_complete": True,
        "search_call_id": "ws-1",
        "url": "https://immi.homeaffairs.gov.au/example",
        "title": "Official guidance",
        "native_web_citation": {"start_index": 0, "end_index": 16},
        "canonical_source_id": None,
        "document_version": None,
        "effective_from": None,
        "effective_to": None,
        "text": None,
        "content_hash": None,
    }


def submission_payload() -> dict:
    draft = "The rule applies."
    return {
        "schema_version": "agent_submission.v2",
        "answer_class": "substantive_legal",
        "draft_markdown": draft,
        "as_of_date": date(2026, 8, 16),
        "claims": [
            {
                "claim_id": "c1",
                "claim_type": "legal_rule",
                "materiality": "decisive",
                "text": draft,
                "draft_start": 0,
                "draft_end": len(draft),
                "evidence_refs": ["exact:source-1"],
            }
        ],
        "citations": [{"evidence_ref": "exact:source-1", "display_label": "Migration Act"}],
        "research_status": "complete",
        "state_patch": [],
    }


def test_strict_contracts_round_trip_through_json() -> None:
    evidence_adapter = TypeAdapter(EvidenceRef)
    evidence = evidence_adapter.validate_python(canonical_evidence_payload())
    evidence_round_trip = evidence_adapter.validate_json(evidence_adapter.dump_json(evidence))
    assert evidence_round_trip == evidence

    web_output = WebSearchOutput.model_validate(
        {
            "call_id": "ws-1",
            "status": "completed",
            "queries": ["abstract legal issue"],
            "sources": [{**native_web_evidence_payload(), "domain": "immi.homeaffairs.gov.au"}],
            "citation_annotations": [
                {"evidence_ref": "web:source-1", "start_index": 0, "end_index": 16}
            ],
        }
    )
    assert WebSearchOutput.model_validate_json(web_output.model_dump_json()) == web_output

    submission = AgentSubmissionV2.model_validate(submission_payload())
    assert AgentSubmissionV2.model_validate_json(submission.model_dump_json()) == submission

    result = LegalFactCheckResultV2(
        schema_version="legal_fact_check_result.v2",
        status="pass",
        corrections=[],
        citation_actions=[
            {"action": "keep", "evidence_ref": "exact:source-1", "reason": "supported"}
        ],
        confidence="high",
        escalate=False,
    )
    assert LegalFactCheckResultV2.model_validate_json(result.model_dump_json()) == result


@pytest.mark.parametrize(
    "mutate",
    [
        lambda value: value.update({"unexpected": True}),
        lambda value: value.update({"schema_version": "agent_submission.v1"}),
        lambda value: value["claims"][0].update({"draft_end": 999}),
        lambda value: value["claims"].append(dict(value["claims"][0])),
    ],
)
def test_agent_submission_rejects_invalid_schema(mutate) -> None:
    value = submission_payload()
    mutate(value)
    with pytest.raises(ValidationError):
        AgentSubmissionV2.model_validate(value)


def test_native_web_evidence_cannot_fabricate_exact_text_or_hash() -> None:
    value = native_web_evidence_payload()
    value["text"] = "fabricated exact passage"
    value["content_hash"] = hashlib.sha256(value["text"].encode()).hexdigest()
    with pytest.raises(ValidationError):
        NativeWebEvidenceRef.model_validate(value)


def test_canonical_evidence_requires_exact_text_hash_and_https_url() -> None:
    value = canonical_evidence_payload()
    del value["content_hash"]
    value["canonical_url"] = "http://example.test/not-authoritative"
    with pytest.raises(ValidationError):
        TypeAdapter(EvidenceRef).validate_python(value)


def test_tool_envelope_requires_error_details_for_failure() -> None:
    with pytest.raises(ValidationError):
        ToolResultEnvelope.model_validate(
            {
                "tool_call_id": "tool-1",
                "status": "timeout",
                "data": {},
                "warnings": [],
                "error": None,
                "meta": {
                    "duration_ms": 1000.0,
                    "cache_hit": False,
                    "observed_at": datetime.now(timezone.utc),
                    "corpus_version": None,
                },
            }
        )


def test_exact_lookup_requires_a_query_or_locator() -> None:
    with pytest.raises(ValidationError):
        ExactLegalLookupRequest(
            query=None,
            document_id=None,
            source_types=[],
            schedule=None,
            provision=None,
            case_citation=None,
            subclass=None,
            as_of_date=date(2026, 8, 16),
            follow_cross_references=True,
            max_hits=8,
        )


def test_execution_budget_is_absolute_not_additive() -> None:
    with pytest.raises(ValidationError):
        ExecutionBudget(
            max_tool_rounds=2,
            max_provider_calls=3,
            max_retries=1,
            turn_deadline_ms=40000,
            answer_research_target_ms=35000,
            checker_target_ms=8000,
        )


def test_pass_fact_check_rejects_corrections() -> None:
    with pytest.raises(ValidationError):
        LegalFactCheckResultV2(
            schema_version="legal_fact_check_result.v2",
            status="pass",
            corrections=[
                {
                    "claim_id": "c1",
                    "operation": "replace_span",
                    "start": 0,
                    "end": 4,
                    "original_text_sha256": hashlib.sha256(b"text").hexdigest(),
                    "original_claim": "text",
                    "problem": "problem",
                    "replacement": "replacement",
                    "evidence_refs": ["exact:source-1"],
                }
            ],
            citation_actions=[],
            confidence="high",
            escalate=False,
        )
