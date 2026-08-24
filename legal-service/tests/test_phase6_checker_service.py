from __future__ import annotations

import asyncio
import hashlib
import time
from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.agent import AgentClaim, AgentRuntimeRequest, AgentSubmissionV2
from app.schemas.checker import (
    Phase6AcceptedDraft,
    Phase6CheckerEvidence,
    Phase6CheckerInput,
    Phase6CheckerResult,
    Phase6MaterialClaim,
)
from app.schemas.evidence import NativeWebEvidenceRef
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.agent_runtime_service import ProviderInterface, ProviderResponse
from app.services.compact_checker_contract_service import (
    Phase6CheckerContractError,
    build_phase6_checker_input,
)
from app.services.phase6_compact_checker_service import (
    PHASE6_CHECKER_RESULT_TOOL,
    PHASE6_CHECKER_SYSTEM_PROMPT,
    PHASE6_CHECKER_TOOL_NAME,
    Phase6CheckerService,
    build_phase6_checker_filter_plan,
)
from app.services.request_evidence_registry import create_registry
from app.services.tool_executor_service import ToolCallRequest


def _request(request_id: str = "checker-request") -> AgentRuntimeRequest:
    from app.schemas.agent import ExecutionBudget

    return AgentRuntimeRequest(
        request_id=request_id,
        turn_id="checker-turn",
        mode="default",
        user_text="Which rule applies?",
        response_language="en",
        as_of_date=date(2026, 8, 24),
        matter_state={},
        execution_budget=ExecutionBudget(
            turn_deadline_ms=60000,
            answer_research_target_ms=32000,
            checker_target_ms=8000,
        ),
    )


def _native_record(authority_kind: str = "operational_guidance") -> NativeWebEvidenceRef:
    return NativeWebEvidenceRef(
        evidence_origin="openai_web_native",
        evidence_ref="web:pending",
        source_type="web_page",
        source_authenticity="official_copy",
        authority_kind=authority_kind,
        jurisdiction="Cth",
        binding_status="not_applicable",
        court_or_tribunal_level=None,
        retrieved_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
        provenance_complete=True,
        search_call_id="search-1",
        url="https://example.gov.au/rule",
        title="Official rule",
        native_web_citation=None,
        canonical_source_id=None,
        document_version=None,
        effective_from=None,
        effective_to=None,
        text=None,
        content_hash=None,
    )


def _evidence(
    *,
    ref: str,
    origin: str = "openai_web_native",
    text: str | None = None,
    authority_kind: str = "statute",
) -> Phase6CheckerEvidence:
    content_hash = hashlib.sha256(text.encode()).hexdigest() if text is not None else None
    return Phase6CheckerEvidence(
        evidence_ref=ref,
        evidence_origin=origin,
        source_type="legislation",
        source_authenticity="canonical_official",
        authority_kind=authority_kind,
        jurisdiction="Cth",
        binding_status="binding",
        court_or_tribunal_level=None,
        retrieved_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
        provenance_complete=True,
        registry_tool_name="exact_legal_lookup" if origin != "openai_web_native" else "web_search",
        registry_tool_call_id="tool-1",
        registered_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
        canonical_source_id="source-1" if origin != "openai_web_native" else None,
        canonical_chunk_id="chunk-1" if origin == "canonical_local" else None,
        document_id="document-1" if origin == "canonical_local" else None,
        document_version="F2026C00667" if origin == "canonical_local" else None,
        provision_or_span="section 1" if origin != "openai_web_native" else None,
        canonical_url="https://example.gov.au/act" if origin == "canonical_local" else None,
        url="https://example.gov.au/act" if origin != "canonical_local" else None,
        title="Evidence",
        search_call_id="search-1" if origin == "openai_web_native" else None,
        native_web_citation=None,
        effective_from=None,
        effective_to=None,
        content_hash=content_hash,
        text=text,
    )


def _input(
    *,
    draft: str = "The rule applies.",
    claims: list[tuple[str, str, int, int, list[str], list[str]]] | None = None,
    evidence: list[Phase6CheckerEvidence] | None = None,
) -> Phase6CheckerInput:
    claims = claims or [("c1", "The rule applies.", 0, len(draft), [], [
        evidence[0].evidence_ref if evidence else "web:native"
    ])]
    material_claims = [Phase6MaterialClaim(
        claim_id=claim_id,
        claim_type="legal_application",
        materiality="decisive",
        text=text,
        draft_start=start,
        draft_end=end,
        text_sha256=hashlib.sha256(text.encode()).hexdigest(),
        depends_on=depends_on,
        evidence_refs=evidence_refs,
    ) for claim_id, text, start, end, depends_on, evidence_refs in claims]
    return Phase6CheckerInput(
        schema_version="phase6_checker.input.v1",
        request_id="checker-request",
        turn_id="checker-turn",
        question="Which rule applies?",
        compact_matter_facts={"confirmed": "fact"},
        as_of_date=date(2026, 8, 24),
        accepted_draft=Phase6AcceptedDraft(
            draft_markdown=draft,
            answer_class="substantive_legal",
            research_status="complete",
        ),
        material_claims=material_claims,
        evidence=evidence or [_evidence(ref="web:native")],
    )


def _result(
    *,
    claim_id: str = "c1",
    verdict: str = "KEEP",
    reason_codes: list[str] | None = None,
    refs: list[str] | None = None,
    omission_refs: list[str] | None = None,
    omission: bool = False,
    **extra,
) -> dict:
    if reason_codes is None:
        reason_codes = {
            "KEEP": ["SUPPORTED"],
            "FLAG": ["INSUFFICIENT_SUPPORT"],
            "BLOCK": ["CONTRADICTED_BY_APPLICABLE_EVIDENCE"],
        }[verdict]
    return {
        "schema_version": "phase6_checker.result.v1",
        "decisions": [{
            "claim_id": claim_id,
            "verdict": verdict,
            "reason_codes": reason_codes,
            "supporting_evidence_refs": refs or (["web:native"] if verdict == "KEEP" else []),
        }],
        "material_omission_suspected": omission,
        "material_omission_evidence_refs": omission_refs or [],
        "escalate": False,
        **extra,
    }


def _multi_result(decisions: list[dict]) -> Phase6CheckerResult:
    return Phase6CheckerResult(
        schema_version="phase6_checker.result.v1",
        decisions=decisions,
    )


def _decision(claim_id: str, verdict: str, refs: list[str] | None = None) -> dict:
    return {
        "claim_id": claim_id,
        "verdict": verdict,
        "reason_codes": {
            "KEEP": ["SUPPORTED"],
            "FLAG": ["INSUFFICIENT_SUPPORT"],
            "BLOCK": ["CONTRADICTED_BY_APPLICABLE_EVIDENCE"],
        }[verdict],
        "supporting_evidence_refs": refs or [],
    }


class FakeProvider(ProviderInterface):
    def __init__(self, response: ProviderResponse | None = None, error: Exception | None = None):
        self.response = response
        self.error = error
        self.call_count = 0
        self.calls: list[dict] = []

    async def call(self, **kwargs):
        self.call_count += 1
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.response or ProviderResponse(
            response_id="response-1", model="gpt-5.6-luna", status="ok", tool_calls=[]
        )


def _provider_response(arguments: dict, *, tool_name: str = PHASE6_CHECKER_TOOL_NAME, calls: int = 1):
    return ProviderResponse(
        response_id="response-1",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[ToolCallRequest(
            call_id=f"call-{index}", name=tool_name, arguments=arguments,
        ) for index in range(calls)],
    )


def _run(provider: FakeProvider, checker_input: Phase6CheckerInput | None = None, *, deadline=None):
    return asyncio.run(Phase6CheckerService().run(
        checker_input=checker_input or _input(),
        provider=provider,
        deadline=deadline or AbsoluteTurnDeadline(time.perf_counter(), 60000),
        checker_target_ms=8000,
        model="gpt-5.6-luna",
        reasoning_effort="low",
    ))


def test_valid_keep_result_is_completed_and_uses_one_forced_tool() -> None:
    provider = FakeProvider(_provider_response(_result()))
    outcome = _run(provider)
    assert outcome.status == "completed"
    assert outcome.checker_result is not None
    assert outcome.filter_plan is not None
    assert outcome.provider_call_count == 1
    assert provider.call_count == 1
    assert provider.calls[0]["tools"] == [PHASE6_CHECKER_RESULT_TOOL]
    assert provider.calls[0]["tool_choice"] == {"type": "function", "name": PHASE6_CHECKER_TOOL_NAME}
    assert provider.calls[0]["registry"] is None
    assert "search" in PHASE6_CHECKER_SYSTEM_PROMPT
    assert "chain-of-thought" in PHASE6_CHECKER_SYSTEM_PROMPT


def test_valid_flag_result_is_completed_without_deletion() -> None:
    provider = FakeProvider(_provider_response(_result(verdict="FLAG")))
    outcome = _run(provider)
    assert outcome.status == "completed"
    assert outcome.filter_plan is not None
    assert outcome.filter_plan.flagged_claim_ids == ["c1"]
    assert outcome.filter_plan.delete_spans == []


def test_mixed_keep_flag_block_result_is_completed() -> None:
    packet = _input(
        draft="Keep. Flag. Block.",
        claims=[
            ("keep", "Keep.", 0, 5, [], ["web:native"]),
            ("flag", "Flag.", 6, 11, [], ["web:native"]),
            ("block", "Block.", 12, 18, [], ["web:fetched"]),
        ],
        evidence=[
            _evidence(ref="web:native"),
            _evidence(ref="web:fetched", origin="fetched_web", text="Contrary source text."),
        ],
    )
    result = {
        "schema_version": "phase6_checker.result.v1",
        "decisions": [
            _result(claim_id="keep")["decisions"][0],
            _result(claim_id="flag", verdict="FLAG")["decisions"][0],
            _result(claim_id="block", verdict="BLOCK", refs=["web:fetched"])["decisions"][0],
        ],
        "material_omission_suspected": False,
        "material_omission_evidence_refs": [],
        "escalate": False,
    }
    outcome = _run(FakeProvider(_provider_response(result)), packet)
    assert outcome.status == "completed"
    assert outcome.filter_plan is not None
    assert outcome.filter_plan.directly_blocked_claim_ids == ["block"]
    assert outcome.filter_plan.flagged_claim_ids == ["flag"]


def test_text_grounded_block_result_is_completed() -> None:
    packet = _input(
        evidence=[_evidence(ref="web:fetched", origin="fetched_web", text="The contrary rule.")],
    )
    provider = FakeProvider(_provider_response(_result(
        verdict="BLOCK", refs=["web:fetched"],
    )))
    outcome = _run(provider, packet)
    assert outcome.status == "completed"
    assert outcome.filter_plan is not None
    assert outcome.filter_plan.directly_blocked_claim_ids == ["c1"]


def test_keep_requires_supporting_evidence() -> None:
    with pytest.raises(ValidationError):
        Phase6CheckerResult(**_multi_result([_decision("c1", "KEEP")]).model_dump(
            mode="python"
        ))


def test_keep_own_evidence_and_transitive_dependency_evidence_are_valid() -> None:
    packet = _input(
        draft="A. B. C.",
        claims=[
            ("a", "A.", 0, 2, [], ["web:a"]),
            ("b", "B.", 3, 5, ["a"], ["web:b"]),
            ("c", "C.", 6, 8, ["b"], ["web:c"]),
        ],
        evidence=[_evidence(ref="web:a"), _evidence(ref="web:b"), _evidence(ref="web:c")],
    )
    own = _multi_result([
        _decision("a", "KEEP", ["web:a"]),
        _decision("b", "KEEP", ["web:b"]),
        _decision("c", "KEEP", ["web:a"]),
    ])
    build_phase6_checker_filter_plan(packet, own)


def test_unrelated_claim_evidence_is_rejected_for_keep_and_flag() -> None:
    packet = _input(
        draft="A. B.",
        claims=[
            ("a", "A.", 0, 2, [], ["web:a"]),
            ("b", "B.", 3, 5, [], ["web:b"]),
        ],
        evidence=[_evidence(ref="web:a"), _evidence(ref="web:b")],
    )
    for verdict in ("KEEP", "FLAG"):
        with pytest.raises(Phase6CheckerContractError, match="dependency scope"):
            build_phase6_checker_filter_plan(
                packet,
                _multi_result([
                    _decision("a", "KEEP", ["web:a"]),
                    _decision("b", verdict, ["web:a"]),
                ]),
            )


def test_flag_without_evidence_is_valid() -> None:
    packet = _input()
    result = _multi_result([_decision("c1", "FLAG")])
    plan = build_phase6_checker_filter_plan(packet, result)
    assert plan.flagged_claim_ids == ["c1"]


def test_block_own_or_dependency_text_is_valid_but_unrelated_text_is_not() -> None:
    dependency_packet = _input(
        draft="A. B.",
        claims=[
            ("a", "A.", 0, 2, [], ["web:text"]),
            ("b", "B.", 3, 5, ["a"], []),
        ],
        evidence=[_evidence(ref="web:text", origin="fetched_web", text="Contrary text.")],
    )
    build_phase6_checker_filter_plan(dependency_packet, _multi_result([
        _decision("a", "KEEP", ["web:text"]),
        _decision("b", "BLOCK", ["web:text"]),
    ]))

    unrelated_packet = _input(
        draft="A. B.",
        claims=[
            ("a", "A.", 0, 2, [], ["web:text"]),
            ("b", "B.", 3, 5, [], ["web:other"]),
        ],
        evidence=[
            _evidence(ref="web:text", origin="fetched_web", text="Contrary text."),
            _evidence(ref="web:other", origin="fetched_web", text="Other text."),
        ],
    )
    with pytest.raises(Phase6CheckerContractError, match="dependency scope"):
        build_phase6_checker_filter_plan(unrelated_packet, _multi_result([
            _decision("a", "KEEP", ["web:text"]),
            _decision("b", "BLOCK", ["web:text"]),
        ]))


@pytest.mark.parametrize("arguments", [
    {"schema_version": "phase6_checker.result.v1", "decisions": []},
    _result(verdict="KEEP", extra_field="bad"),
    {**_result(), "schema_version": "compact_checker.result.v1"},
    {**_result(), "decisions": [{**_result()["decisions"][0], "qualification": "rewrite"}]},
])
def test_malformed_legacy_or_rewrite_result_fails_without_retry(arguments: dict) -> None:
    provider = FakeProvider(_provider_response(arguments))
    outcome = _run(provider)
    assert outcome.status == "failed"
    assert outcome.checker_result is None
    assert outcome.provider_call_count == 1
    assert provider.call_count == 1


@pytest.mark.parametrize("arguments", [
    {**_result(), "decisions": [_result()["decisions"][0], _result()["decisions"][0]]},
    {**_result(), "decisions": []},
    {**_result(), "decisions": [{**_result()["decisions"][0], "claim_id": "unknown"}]},
    {**_result(), "decisions": [{**_result()["decisions"][0], "supporting_evidence_refs": ["web:unknown"]}]},
    {**_result(omission=True, omission_refs=["web:unknown"]), "material_omission_suspected": True},
])
def test_identity_and_omission_failures_do_not_retry(arguments: dict) -> None:
    provider = FakeProvider(_provider_response(arguments))
    outcome = _run(provider)
    assert outcome.status == "failed"
    assert outcome.provider_call_count == 1


def test_provider_exception_and_timeout_are_single_call_failures() -> None:
    for error, code in [(RuntimeError("offline"), "provider_exception"), (TimeoutError("slow"), "provider_timeout")]:
        provider = FakeProvider(error=error)
        outcome = _run(provider)
        assert outcome.status == "failed"
        assert outcome.error_code == code
        assert outcome.provider_call_count == 1
        assert provider.call_count == 1


def test_provider_not_ok_zero_calls_and_unrelated_tool_fail() -> None:
    cases = [
        ProviderResponse(response_id="r", model="m", status="error"),
        _provider_response(_result(), tool_name="wrong_tool"),
        _provider_response(_result(), calls=2),
    ]
    for response in cases:
        provider = FakeProvider(response)
        outcome = _run(provider)
        assert outcome.status == "failed"
        assert outcome.provider_call_count == 1


def test_ordinary_prose_and_malformed_arguments_fail_without_retry() -> None:
    prose_response = _provider_response(_result())
    prose_response.text = "I checked the evidence."
    malformed_response = ProviderResponse(
        response_id="response-1",
        model="gpt-5.6-luna",
        status="ok",
        tool_calls=[ToolCallRequest(
            call_id="call-1", name=PHASE6_CHECKER_TOOL_NAME, arguments="not-json",
        )],
    )
    for response, error_code in [
        (prose_response, "ordinary_prose_present"),
        (malformed_response, "malformed_result_arguments"),
    ]:
        provider = FakeProvider(response)
        outcome = _run(provider)
        assert outcome.status == "failed"
        assert outcome.error_code == error_code
        assert outcome.provider_call_count == 1
        assert provider.call_count == 1


def test_deadline_exhaustion_happens_before_provider_call() -> None:
    provider = FakeProvider(_provider_response(_result()))
    outcome = _run(provider, deadline=AbsoluteTurnDeadline(0.0, 1))
    assert outcome.status == "failed"
    assert outcome.error_code == "deadline_exhausted"
    assert outcome.provider_call_count == 0
    assert provider.call_count == 0


def test_timeout_allocation_is_capped_by_target_and_absolute_deadline() -> None:
    provider = FakeProvider(_provider_response(_result()))
    outcome = asyncio.run(Phase6CheckerService().run(
        checker_input=_input(), provider=provider,
        deadline=AbsoluteTurnDeadline(time.perf_counter(), 1000),
        checker_target_ms=8000, model="gpt-5.6-luna", reasoning_effort="low",
    ))
    assert provider.calls[0]["timeout_ms"] <= 8000
    assert outcome.provider_call_count == 1


class _MutableClock:
    def __init__(self) -> None:
        self.value = 0.0

    def __call__(self) -> float:
        return self.value


def test_post_checker_reserve_is_enforced_after_packet_processing(monkeypatch) -> None:
    clock = _MutableClock()
    deadline = AbsoluteTurnDeadline(0.0, 1000, clock=clock)
    original_dumps = __import__(
        "app.services.phase6_compact_checker_service",
        fromlist=["json"],
    ).json.dumps

    def consuming_dumps(*args, **kwargs):
        encoded = original_dumps(*args, **kwargs)
        clock.value += 0.5
        return encoded

    monkeypatch.setattr(
        "app.services.phase6_compact_checker_service.json.dumps", consuming_dumps
    )
    provider = FakeProvider(_provider_response(_result()))
    outcome = asyncio.run(Phase6CheckerService().run(
        checker_input=_input(), provider=provider, deadline=deadline,
        checker_target_ms=800, model="gpt-5.6-luna", reasoning_effort="low",
        post_checker_reserve_ms=400,
    ))
    assert outcome.status == "completed"
    assert provider.calls[0]["timeout_ms"] <= 100
    assert outcome.timeout_allocated_ms <= 100


def test_post_checker_reserve_exhaustion_makes_zero_provider_calls(monkeypatch) -> None:
    clock = _MutableClock()
    deadline = AbsoluteTurnDeadline(0.0, 1000, clock=clock)
    original_dumps = __import__(
        "app.services.phase6_compact_checker_service",
        fromlist=["json"],
    ).json.dumps

    def consuming_dumps(*args, **kwargs):
        encoded = original_dumps(*args, **kwargs)
        clock.value += 0.7
        return encoded

    monkeypatch.setattr(
        "app.services.phase6_compact_checker_service.json.dumps", consuming_dumps
    )
    provider = FakeProvider(_provider_response(_result()))
    outcome = asyncio.run(Phase6CheckerService().run(
        checker_input=_input(), provider=provider, deadline=deadline,
        checker_target_ms=800, model="gpt-5.6-luna", reasoning_effort="low",
        post_checker_reserve_ms=400,
    ))
    assert outcome.status == "failed"
    assert outcome.error_code == "insufficient_post_checker_reserve"
    assert outcome.provider_call_count == 0
    assert provider.call_count == 0


def test_no_research_tools_are_exposed_and_no_continuation_is_used() -> None:
    provider = FakeProvider(_provider_response(_result()))
    _run(provider)
    tool_names = {tool["name"] for tool in provider.calls[0]["tools"]}
    assert tool_names == {PHASE6_CHECKER_TOOL_NAME}
    assert provider.calls[0]["previous_response_id"] is None
    assert provider.call_count == 1


@pytest.mark.parametrize("origin", ["canonical_local", "fetched_web"])
def test_text_grounded_block_is_valid_for_backend_held_sources(origin: str) -> None:
    evidence = _evidence(ref="exact:local" if origin == "canonical_local" else "web:fetched", origin=origin, text="Contradiction.")
    packet = _input(evidence=[evidence])
    result = Phase6CheckerResult(**_result(verdict="BLOCK", refs=[evidence.evidence_ref]))
    plan = build_phase6_checker_filter_plan(packet, result)
    assert plan.safe_to_apply is True


def test_metadata_only_native_block_is_invalid() -> None:
    packet = _input(evidence=[_evidence(ref="web:native")])
    result = Phase6CheckerResult(**_result(verdict="BLOCK", refs=["web:native"]))
    with pytest.raises(Phase6CheckerContractError, match="backend-held source text"):
        build_phase6_checker_filter_plan(packet, result)


def test_block_with_unknown_evidence_is_invalid() -> None:
    packet = _input()
    result = Phase6CheckerResult(**_result(verdict="BLOCK", refs=["web:unknown"]))
    with pytest.raises(Phase6CheckerContractError):
        build_phase6_checker_filter_plan(packet, result)


def test_derived_graph_evidence_is_invalid_even_with_text() -> None:
    evidence = _evidence(ref="web:graph", origin="fetched_web", text="Graph relation.")
    evidence = evidence.model_copy(update={"authority_kind": "derived_relationship"})
    packet = Phase6CheckerInput.model_construct(
        schema_version="phase6_checker.input.v1",
        request_id="checker-request",
        turn_id="checker-turn",
        question="Which rule applies?",
        compact_matter_facts={},
        as_of_date=date(2026, 8, 24),
        accepted_draft=Phase6AcceptedDraft(
            draft_markdown="The rule applies.", answer_class="substantive_legal", research_status="complete",
        ),
        material_claims=[Phase6MaterialClaim(
            claim_id="c1", claim_type="legal_application", materiality="decisive",
            text="The rule applies.", draft_start=0, draft_end=17,
            text_sha256=hashlib.sha256(b"The rule applies.").hexdigest(),
            evidence_refs=["web:graph"],
        )],
        evidence=[evidence],
    )
    result = Phase6CheckerResult(**_result(verdict="BLOCK", refs=["web:graph"]))
    with pytest.raises(Phase6CheckerContractError):
        build_phase6_checker_filter_plan(packet, result)


def test_checker_model_configuration_defaults_are_explicit_and_disabled() -> None:
    settings = Settings(DATABASE_URL="postgresql://test", OPENAI_API_KEY="test")
    assert settings.compact_checker_model == "gpt-5.6-luna"
    assert settings.compact_checker_reasoning_effort == "low"
    assert settings.compact_checker_enabled is False


def test_checker_run_does_not_mutate_the_accepted_packet() -> None:
    packet = _input()
    before = packet.model_dump(mode="json")
    outcome = _run(FakeProvider(_provider_response(_result())), packet)
    assert outcome.status == "completed"
    assert packet.model_dump(mode="json") == before
