from __future__ import annotations

from datetime import date, datetime, timezone
import time

from app.schemas.agent import AgentClaim, AgentRuntimeRequest, AgentSubmissionV2, ExecutionBudget
from app.schemas.checker import CompactCheckerResult
from app.schemas.evidence import NativeWebEvidenceRef
from app.services.agent_runtime_service import ProviderResponse
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.compact_checker_service import CHECKER_RESULT_TOOL, CompactCheckerService, apply_checker_result
from app.services.request_evidence_registry import create_registry
from app.services.tool_executor_service import ToolCallRequest, ToolExecutorContext, ToolExecutorService


def _submission() -> AgentSubmissionV2:
    draft = "Conclusion. Premise. Independent."
    return AgentSubmissionV2(
        schema_version="agent_submission.v2",
        answer_class="substantive_legal",
        draft_markdown=draft,
        claims=[
            AgentClaim(
                claim_id="c1",
                claim_type="legal_application",
                materiality="decisive",
                text="Conclusion.",
                draft_start=draft.index("Conclusion."),
                draft_end=draft.index("Conclusion.") + len("Conclusion."),
                depends_on=["c2"],
            ),
            AgentClaim(
                claim_id="c2",
                claim_type="legal_rule",
                materiality="decisive",
                text="Premise.",
                draft_start=draft.index("Premise."),
                draft_end=draft.index("Premise.") + len("Premise."),
            ),
            AgentClaim(
                claim_id="c3",
                claim_type="procedure",
                materiality="supporting",
                text="Independent.",
                draft_start=draft.index("Independent."),
                draft_end=draft.index("Independent.") + len("Independent."),
            ),
        ],
        citations=[],
        research_status="incomplete",
        state_patch=[],
    )


def test_drop_propagates_to_materially_dependent_conclusion():
    result = CompactCheckerResult(
        schema_version="compact_checker.result.v1",
        decisions=[
            {"claim_id": "c1", "decision": "keep", "reason_code": "supported_current"},
            {"claim_id": "c2", "decision": "drop", "reason_code": "unsupported"},
            {"claim_id": "c3", "decision": "keep", "reason_code": "supported_current"},
        ],
    )
    filtered, dropped, propagated, error = apply_checker_result(_submission(), result)
    assert error is None
    assert filtered is not None
    assert dropped == ["c1", "c2"]
    assert propagated == ["c1"]
    assert [claim.claim_id for claim in filtered.claims] == ["c3"]
    assert filtered.draft_markdown == "Independent."


def test_qualification_requires_existing_claim_hash_and_is_targeted():
    submission = _submission()
    claim = submission.claims[2]
    result = CompactCheckerResult(
        schema_version="compact_checker.result.v1",
        decisions=[
            {"claim_id": "c1", "decision": "drop", "reason_code": "unsupported"},
            {"claim_id": "c2", "decision": "drop", "reason_code": "unsupported"},
            {
                "claim_id": "c3",
                "decision": "keep",
                "reason_code": "supported_current",
                "qualification": "Independent, bounded.",
                "original_claim_sha256": __import__("hashlib").sha256(claim.text.encode()).hexdigest(),
            },
        ],
    )
    filtered, dropped, _, error = apply_checker_result(submission, result)
    assert error is None
    assert filtered is not None
    assert dropped == ["c1", "c2"]
    assert filtered.claims[0].text == "Independent, bounded."


def test_checker_provider_receives_only_checker_tool():
    submission = AgentSubmissionV2(
        schema_version="agent_submission.v2",
        answer_class="substantive_legal",
        draft_markdown="A claim.",
        claims=[AgentClaim(
            claim_id="c1",
            claim_type="legal_rule",
            materiality="decisive",
            text="A claim.",
            draft_start=0,
            draft_end=len("A claim."),
        )],
        citations=[],
        research_status="incomplete",
        state_patch=[],
    )
    captured: dict[str, object] = {}

    class FakeProvider:
        async def call(self, **kwargs):
            captured.update(kwargs)
            return ProviderResponse(
                response_id="checker-response",
                model="gpt-5.6-luna",
                status="ok",
                tool_calls=[ToolCallRequest(
                    call_id="checker-call",
                    name="submit_compact_checker_result",
                    arguments={
                        "schema_version": "compact_checker.result.v1",
                        "decisions": [{
                            "claim_id": "c1",
                            "decision": "keep",
                            "reason_code": "supported_current",
                            "qualification": None,
                            "original_claim_sha256": None,
                        }],
                        "escalate": False,
                    },
                )],
            )

    request = AgentRuntimeRequest(
        request_id="checker-request",
        turn_id="checker-turn",
        mode="default",
        user_text="Question",
        response_language="en",
        as_of_date=date(2026, 8, 21),
        matter_state={},
        execution_budget=ExecutionBudget(
            turn_deadline_ms=40000,
            answer_research_target_ms=32000,
            checker_target_ms=8000,
        ),
        experiment_arm="L",
    )
    import asyncio
    outcome = asyncio.run(CompactCheckerService().run(
        provider=FakeProvider(),
        submission=submission,
        request=request,
        registry=create_registry("checker-request"),
        deadline=AbsoluteTurnDeadline(time.perf_counter(), 40000),
        checker_target_ms=8000,
        model="gpt-5.6-luna",
        reasoning_effort="low",
    ))
    assert outcome.status == "completed"
    assert captured["tools"] == [CHECKER_RESULT_TOOL]
    assert captured["tool_choice"] == "auto"


def test_semantic_evidence_failure_becomes_checker_input_not_terminal_rejection():
    registry = create_registry("integrity-only")
    evidence_ref = registry.register_native_web_evidence(
        evidence=NativeWebEvidenceRef(
            evidence_origin="openai_web_native",
            evidence_ref="web:pending",
            source_type="web_page",
            source_authenticity="unverified",
            authority_kind="commentary",
            jurisdiction=None,
            binding_status="unknown",
            court_or_tribunal_level=None,
            retrieved_at=datetime.now(timezone.utc),
            provenance_complete=True,
            search_call_id="search-1",
            url="https://example.com/source",
            title="Source",
            native_web_citation=None,
            canonical_source_id=None,
            document_version=None,
            effective_from=None,
            effective_to=None,
            text=None,
            content_hash=None,
        ),
        tool_call_id="search-1",
    )
    result = ToolExecutorService().execute_tool(
        ToolCallRequest(
            call_id="submit-integrity-only",
            name="submit_answer",
            arguments={
                "schema_version": "agent_submission.v2",
                "answer_class": "substantive_legal",
                "draft_markdown": "A legal claim.",
                "claims": [{
                    "claim_id": "c1",
                    "claim_type": "legal_rule",
                    "materiality": "decisive",
                    "text": "A legal claim.",
                    "draft_start": 0,
                    "draft_end": len("A legal claim."),
                    "evidence_refs": [evidence_ref],
                }],
                "citations": [{"evidence_ref": evidence_ref, "display_label": "Source"}],
                "research_status": "complete",
                "state_patch": [],
            },
        ),
        ToolExecutorContext(request_id="integrity-only", registry=registry),
    )
    assert result.result.status == "ok"
    assert result.result.data["accepted"] is True
    assert result.result.data["postcondition_status"] == "integrity_passed"
    assert result.result.data["semantic_review_required"] is True
