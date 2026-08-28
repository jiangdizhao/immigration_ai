from __future__ import annotations

import asyncio
import hashlib
import time
from datetime import date, datetime, timezone

import pytest

from app.core.config import Settings
from app.schemas.agent import AgentRuntimeRequest, ExecutionBudget
from app.schemas.evidence import FetchedWebEvidenceRef
from app.services.agent_runtime_service import AgentRuntimeService, ProviderResponse
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.request_evidence_registry import create_registry
from app.services.tool_executor_service import ToolCallRequest


def _budget() -> ExecutionBudget:
    return ExecutionBudget(
        max_tool_rounds=2,
        max_provider_calls=3,
        max_retries=1,
        turn_deadline_ms=60000,
        answer_research_target_ms=32000,
        checker_target_ms=8000,
        max_flat_rag_calls=1,
        retry_viability_threshold_ms=8000,
    )


def _request(*, arm: str = "L", answer_class: str = "substantive_legal") -> AgentRuntimeRequest:
    return AgentRuntimeRequest(
        request_id="runtime-checker-request",
        turn_id="runtime-checker-turn",
        mode="default",
        user_text="Which legal rule applies?",
        response_language="en",
        as_of_date=date(2026, 8, 24),
        matter_state={"confirmed": "fact"},
        execution_budget=_budget(),
        experiment_arm=arm,
    )


def _fetched_evidence() -> FetchedWebEvidenceRef:
    text = "The applicable rule contradicts the submitted proposition."
    return FetchedWebEvidenceRef(
        evidence_origin="fetched_web",
        evidence_ref="web:pending",
        source_type="legislation",
        source_authenticity="canonical_official",
        authority_kind="statute",
        jurisdiction="Cth",
        binding_status="binding",
        court_or_tribunal_level=None,
        retrieved_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
        provenance_complete=True,
        fetch_call_id="fetch-1",
        url="https://example.gov.au/act",
        title="Fetched Act",
        canonical_source_id="act-1",
        document_version="F2026C00667",
        provision_or_span="section 1",
        effective_from=None,
        effective_to=None,
        text=text,
        content_hash=hashlib.sha256(text.encode()).hexdigest(),
    )


class ShadowCheckerProvider:
    def __init__(self, *, verdict: str = "KEEP", omission: bool = False, native_search: bool = False,
                 checker_error: Exception | None = None, with_evidence: bool = False,
                 answer_class: str = "substantive_legal", checker_tool_name: str =
                 "submit_phase6_checker_result", checker_result_calls: int = 1,
                 native_source_count: int = 0, native_citation_count: int = 0):
        self.verdict = verdict
        self.omission = omission
        self.native_search = native_search
        self.checker_error = checker_error
        self.with_evidence = with_evidence
        self.answer_class = answer_class
        self.checker_tool_name = checker_tool_name
        self.checker_result_calls = checker_result_calls
        self.native_source_count = native_source_count
        self.native_citation_count = native_citation_count
        self.calls: list[dict] = []
        self.call_count = 0
        self.evidence_ref: str | None = None

    async def call(self, **kwargs):
        self.call_count += 1
        self.calls.append(kwargs)
        if self.call_count == 1:
            registry = kwargs["registry"]
            if self.with_evidence:
                self.evidence_ref = registry.register_fetched_web_evidence(
                    evidence=_fetched_evidence(), tool_call_id="fetch-1", tool_name="web_fetch"
                )
            claim = {
                "claim_id": "c1",
                "claim_type": "legal_rule",
                "materiality": "decisive",
                "text": "Legal claim.",
                "draft_start": 0,
                "draft_end": 12,
                "evidence_refs": [self.evidence_ref] if self.evidence_ref else [],
            }
            answer_claims = [claim] if self.answer_class == "substantive_legal" else []
            return ProviderResponse(
                response_id="answer-response",
                model="gpt-5.6-luna",
                status="ok",
                tool_calls=[ToolCallRequest(
                    call_id="answer-submit",
                    name="submit_answer",
                    arguments={
                        "schema_version": "agent_submission.v2",
                        "answer_class": self.answer_class,
                        "draft_markdown": "Legal claim." if answer_claims else "OK.",
                        "claims": answer_claims,
                        "citations": [],
                        "research_status": "complete" if answer_claims else "not_required",
                        "state_patch": [],
                    },
                )],
            )
        if self.checker_error:
            raise self.checker_error
        refs = [self.evidence_ref] if self.evidence_ref else []
        reason = "SUPPORTED" if self.verdict == "KEEP" else (
            "INSUFFICIENT_SUPPORT" if self.verdict == "FLAG"
            else "CONTRADICTED_BY_APPLICABLE_EVIDENCE"
        )
        result = {
            "schema_version": "phase6_checker.result.v1",
            "decisions": [{
                "claim_id": "c1",
                "verdict": self.verdict,
                "reason_codes": [reason],
                "supporting_evidence_refs": refs if self.verdict != "FLAG" else [],
            }],
            "material_omission_suspected": self.omission,
            "material_omission_evidence_refs": refs if self.omission else [],
            "escalate": False,
        }
        return ProviderResponse(
            response_id="checker-response",
            model="gpt-5.6-luna",
            status="ok",
            text=None,
            tool_calls=[ToolCallRequest(
                call_id=f"checker-result-{index}",
                name=self.checker_tool_name,
                arguments=result,
            ) for index in range(self.checker_result_calls)],
            input_tokens=100,
            cached_input_tokens=10,
            reasoning_tokens=20,
            output_tokens=30,
            duration_ms=4.0,
            native_web_search_call_count=1 if self.native_search else 0,
            native_web_source_count=self.native_source_count,
            native_web_citation_count=self.native_citation_count,
        )


class DependencyShadowCheckerProvider(ShadowCheckerProvider):
    async def call(self, **kwargs):
        if self.call_count == 0:
            self.call_count += 1
            self.calls.append(kwargs)
            registry = kwargs["registry"]
            self.evidence_ref = registry.register_fetched_web_evidence(
                evidence=_fetched_evidence(), tool_call_id="fetch-1", tool_name="web_fetch"
            )
            return ProviderResponse(
                response_id="answer-response",
                model="gpt-5.6-luna",
                status="ok",
                tool_calls=[ToolCallRequest(
                    call_id="answer-submit",
                    name="submit_answer",
                    arguments={
                        "schema_version": "agent_submission.v2",
                        "answer_class": "substantive_legal",
                        "draft_markdown": "A. B.",
                        "claims": [
                            {
                                "claim_id": "A",
                                "claim_type": "legal_rule",
                                "materiality": "decisive",
                                "text": "A.",
                                "draft_start": 0,
                                "draft_end": 2,
                                "evidence_refs": [self.evidence_ref],
                            },
                            {
                                "claim_id": "B",
                                "claim_type": "legal_application",
                                "materiality": "decisive",
                                "text": "B.",
                                "draft_start": 3,
                                "draft_end": 5,
                                "depends_on": ["A"],
                                "evidence_refs": [self.evidence_ref],
                            },
                        ],
                        "citations": [],
                        "research_status": "complete",
                        "state_patch": [],
                    },
                )],
            )
        self.call_count += 1
        self.calls.append(kwargs)
        result = {
            "schema_version": "phase6_checker.result.v1",
            "decisions": [
                {
                    "claim_id": "A",
                    "verdict": "BLOCK",
                    "reason_codes": ["CONTRADICTED_BY_APPLICABLE_EVIDENCE"],
                    "supporting_evidence_refs": [self.evidence_ref],
                },
                {
                    "claim_id": "B",
                    "verdict": "KEEP",
                    "reason_codes": ["SUPPORTED"],
                    "supporting_evidence_refs": [self.evidence_ref],
                },
            ],
            "material_omission_suspected": False,
            "material_omission_evidence_refs": [],
            "escalate": False,
        }
        return ProviderResponse(
            response_id="checker-response",
            model="gpt-5.6-luna",
            status="ok",
            tool_calls=[ToolCallRequest(
                call_id="checker-result",
                name="submit_phase6_checker_result",
                arguments=result,
            )],
            duration_ms=4.0,
        )


def _run(provider: ShadowCheckerProvider, *, arm: str = "L", deadline=None,
         answer_class: str = "substantive_legal"):
    settings = Settings(
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        COMPACT_CHECKER_ENABLED=True,
        COMPACT_CHECKER_MODEL="gpt-5.6-luna",
        COMPACT_CHECKER_REASONING_EFFORT="low",
    )

    async def execute():
        from unittest.mock import patch

        with patch("app.services.agent_policy_service.get_settings", return_value=settings), \
             patch("app.services.agent_runtime_service.get_settings", return_value=settings):
            return await AgentRuntimeService(provider=provider).run_shadow(
                _request(arm=arm, answer_class=answer_class),
                deadline=deadline or AbsoluteTurnDeadline(time.perf_counter(), 60000),
                registry=create_registry("runtime-checker-request"),
            )

    return asyncio.run(execute())


@pytest.mark.parametrize("arm", ["L", "N"])
def test_default_l_and_n_valid_phase6_checker_runs_once_and_preserves_answer(arm: str) -> None:
    # Revised Arm L deliberately strips model-authored evidence bookkeeping;
    # FLAG is the valid evidence-insufficient outcome for that packet. Arm N
    # retains server-issued evidence refs and exercises KEEP.
    expected_verdict = "FLAG" if arm == "L" else "KEEP"
    provider = ShadowCheckerProvider(verdict=expected_verdict, with_evidence=arm == "N")
    result = _run(provider, arm=arm)
    assert result.status == "completed"
    assert result.checker_status == "completed"
    assert result.checker_provider_call_count == 1
    assert result.checker_result_tool_call_count == 1
    assert provider.call_count == 2
    assert result.submission is not None
    assert result.submission.draft_markdown == "Legal claim."
    assert result.submission.claims[0].claim_id == "c1"
    assert result.metrics.logical_llm_stage_count == 2
    assert result.metrics.provider_api_call_count == 2
    assert result.metrics.checker_keep_count == (1 if expected_verdict == "KEEP" else 0)
    assert result.metrics.checker_flag_count == (1 if expected_verdict == "FLAG" else 0)
    assert result.checker_decisions[0]["claim_id"] == "c1"
    assert result.checker_decisions[0]["claim_type"] == "legal_rule"
    assert result.checker_decisions[0]["materiality"] == "decisive"
    assert result.checker_decisions[0]["verdict"] == expected_verdict
    assert result.checker_decisions[0]["reason_codes"] == [
        "SUPPORTED" if expected_verdict == "KEEP" else "INSUFFICIENT_SUPPORT"
    ]
    assert result.checker_decisions[0]["evidence_refs"] == (
        [provider.evidence_ref] if expected_verdict == "KEEP" else []
    )
    assert result.checker_packet_manifest["material_claim_count"] == 1
    assert result.checker_packet_manifest["checker_evidence_count"] == (
        1 if arm == "N" else 0
    )
    assert result.checker_packet_manifest["graph_evidence_count"] == 0
    assert "reasoning_bank" not in result.checker_packet_manifest
    if arm == "N":
        assert result.checker_packet_manifest["evidence"][0]["origin"] == "fetched_web"
        assert result.checker_packet_manifest["evidence"][0]["backend_text_available"] is True
        assert "text" not in result.checker_packet_manifest["evidence"][0]
    assert result.metrics.retry_count == 0
    assert result.metrics.continuation_count == 0
    assert result.metrics.answer_provider_call_count == 1
    assert result.metrics.tool_calls[-1].tool_name == "submit_phase6_checker_result"


def test_block_and_omission_are_telemetry_only() -> None:
    provider = ShadowCheckerProvider(verdict="BLOCK", omission=True, with_evidence=True)
    # Arm N permits the server-issued evidence reference in this offline
    # fixture; Arm L's lightweight submission contract intentionally strips
    # model-authored refs that were not surfaced by a preceding tool result.
    result = _run(provider, arm="N")
    assert result.status == "completed"
    assert result.checker_status == "completed"
    assert result.checker_blocked_claim_ids == ["c1"]
    assert result.checker_material_omission_suspected is True
    assert result.checker_filter_plan_safe_to_apply is True
    assert result.checker_call_count == 1
    assert result.checker_provider_call_count == 1
    assert result.checker_result_tool_call_count == 1
    assert result.checker_dropped_claim_ids == []
    assert result.checker_dependency_dropped_claim_ids == []
    assert result.submission is not None
    assert result.submission.draft_markdown == "Legal claim."
    assert result.submission.claims[0].claim_id == "c1"


def test_phase6_dependency_block_uses_only_new_block_fields_and_preserves_answer() -> None:
    provider = DependencyShadowCheckerProvider()
    result = _run(provider, arm="N")
    assert result.status == "completed"
    assert result.checker_status == "completed"
    assert result.checker_blocked_claim_ids == ["A"]
    assert result.checker_dependency_blocked_claim_ids == ["B"]
    assert result.checker_dropped_claim_ids == []
    assert result.checker_dependency_dropped_claim_ids == []
    assert result.submission is not None
    assert result.submission.draft_markdown == "A. B."
    assert [claim.claim_id for claim in result.submission.claims] == ["A", "B"]


def test_checker_failure_preserves_answer_without_retry_or_legacy_fallback() -> None:
    provider = ShadowCheckerProvider(checker_error=TimeoutError("timeout"))
    result = _run(provider)
    assert result.status == "completed"
    assert result.checker_status == "failed"
    assert result.checker_error_code == "provider_timeout"
    assert result.checker_provider_call_count == 1
    assert result.checker_result_tool_call_count == 0
    assert result.checker_call_count == 0
    assert provider.call_count == 2
    assert result.submission is not None
    assert result.submission.draft_markdown == "Legal claim."
    assert all("compact_checker" not in call["tools"][0].get("name", "") for call in provider.calls)


def test_unexpected_checker_native_search_is_rejected_and_answer_survives() -> None:
    provider = ShadowCheckerProvider(native_search=True)
    result = _run(provider)
    assert result.status == "completed"
    assert result.checker_status == "failed"
    assert result.checker_error_code == "unexpected_checker_research_activity"
    assert result.submission is not None
    assert result.submission.draft_markdown == "Legal claim."


@pytest.mark.parametrize("provider_kwargs", [
    {"native_source_count": 1},
    {"native_citation_count": 1},
])
def test_unexpected_checker_native_sources_or_citations_are_rejected(provider_kwargs: dict) -> None:
    provider = ShadowCheckerProvider(**provider_kwargs)
    result = _run(provider)
    assert result.status == "completed"
    assert result.checker_status == "failed"
    assert result.checker_error_code == "unexpected_checker_research_activity"
    assert result.submission is not None
    assert result.submission.draft_markdown == "Legal claim."


@pytest.mark.parametrize("provider_kwargs", [
    {"checker_tool_name": "wrong_tool"},
    {"checker_result_calls": 2},
])
def test_wrong_or_multiple_checker_result_tools_fail_neutral(provider_kwargs: dict) -> None:
    provider = ShadowCheckerProvider(**provider_kwargs)
    result = _run(provider)
    assert result.status == "completed"
    assert result.checker_status == "failed"
    assert result.checker_error_code in {"wrong_result_tool", "result_tool_call_count_invalid"}
    assert result.checker_provider_call_count == 1
    assert result.submission is not None
    assert result.submission.draft_markdown == "Legal claim."


def test_insufficient_remaining_budget_uses_safe_failure_before_terminal_call() -> None:
    provider = ShadowCheckerProvider()
    deadline = AbsoluteTurnDeadline(time.perf_counter() - 59.0, 60000)
    result = _run(provider, deadline=deadline)
    assert result.status == "error"
    assert result.submission is None
    assert result.checker_status == "not_required"
    assert result.checker_provider_call_count == 0
    assert result.metrics.logical_llm_stage_count == 1
    assert provider.call_count == 0
    assert "Insufficient budget to start terminal synthesis" in result.errors


def test_general_turn_and_disabled_checker_have_zero_checker_calls() -> None:
    provider = ShadowCheckerProvider()
    settings = Settings(
        DATABASE_URL="postgresql://test", OPENAI_API_KEY="test", COMPACT_CHECKER_ENABLED=False
    )
    from unittest.mock import patch

    async def execute():
        with patch("app.services.agent_policy_service.get_settings", return_value=settings), \
             patch("app.services.agent_runtime_service.get_settings", return_value=settings):
            return await AgentRuntimeService(provider=provider).run_shadow(
                _request(),
                deadline=AbsoluteTurnDeadline(time.perf_counter(), 60000),
                registry=create_registry("runtime-checker-request"),
            )

    disabled = asyncio.run(execute())
    assert disabled.checker_status == "not_required"
    assert disabled.checker_provider_call_count == 0
    assert provider.call_count == 1

    general_provider = ShadowCheckerProvider(answer_class="general")
    general = _run(general_provider, answer_class="general")
    assert general.checker_status == "not_required"
    assert general.checker_provider_call_count == 0
    assert general_provider.call_count == 1


class ContinuationProvider:
    def __init__(self) -> None:
        self.call_count = 0

    async def call(self, **_kwargs):
        self.call_count += 1
        if self.call_count == 1:
            return ProviderResponse(
                response_id="answer-initial",
                model="gpt-5.6-luna",
                status="ok",
                text="A draft without terminal submission.",
            )
        return ProviderResponse(
            response_id="answer-continuation",
            model="gpt-5.6-luna",
            status="ok",
            tool_calls=[ToolCallRequest(
                call_id="answer-submit",
                name="submit_answer",
                arguments={
                    "schema_version": "agent_submission.v2",
                    "answer_class": "general",
                    "draft_markdown": "OK.",
                    "claims": [],
                    "citations": [],
                    "research_status": "not_required",
                    "state_patch": [],
                },
            )],
        )


def test_runtime_continuation_is_not_counted_as_retry() -> None:
    provider = ContinuationProvider()
    result = _run(provider, answer_class="general")

    assert result.status == "completed"
    assert result.metrics.retry_count == 0
    assert result.metrics.continuation_count == 1
    assert result.metrics.answer_provider_call_count == 2
    assert result.metrics.provider_api_call_count == 2
