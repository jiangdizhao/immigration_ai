"""v2.1.2 — NativeWebLocator resolver + tool-contract tests.  No live OpenAI calls."""

from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.evidence import NativeWebEvidenceRef
from app.services.native_web_locator_resolver import (
    NativeWebLocator,
    NativeWebLocatorResolver,
    normalize_source_url,
)
from app.services.request_evidence_registry import create_registry
from app.services.agent_policy_service import SUBMIT_ANSWER_TOOL, AgentPolicyService
from app.services.evidence_postcondition_service import evaluate_native_web_applicability
from app.services.tool_executor_service import ToolCallRequest, ToolExecutorContext, ToolExecutorService


def _register(registry, url: str, call: str = "s1"):
    ev = NativeWebEvidenceRef(
        evidence_origin="openai_web_native", evidence_ref="web:pending",
        source_type="web_page", source_authenticity="unverified",
        authority_kind="commentary", jurisdiction=None,
        binding_status="non_binding", court_or_tribunal_level=None,
        retrieved_at=datetime.now(timezone.utc), provenance_complete=True,
        search_call_id=call, url=url, title="t", native_web_citation=None,
        canonical_source_id=None, document_version=None, effective_from=None,
        effective_to=None, text=None, content_hash=None,
    )
    return registry.register_native_web_evidence(evidence=ev, tool_call_id=call)


def test_normalize_url() -> None:
    assert normalize_source_url("HTTPS://Example.com/path/") == "https://example.com/path"
    # Trailing slash is stripped deterministically; root slash normalizes away.
    assert normalize_source_url("https://x.y/#frag") == "https://x.y"
    assert normalize_source_url("https://x.y/") == "https://x.y"
    assert normalize_source_url("https://x.y") == "https://x.y"


def test_url_userinfo_and_port_hardening() -> None:
    reg = create_registry("v212-hard")
    _register(reg, "https://example.gov.au/page")
    r = NativeWebLocatorResolver(reg)
    userinfo = r.resolve([NativeWebLocator(url="https://u:p@example.gov.au/page")])
    assert userinfo.resolved_count == 0
    assert "NATIVE_WEB_LOCATOR_NOT_OBSERVED" in userinfo.rejection_codes
    assert r.resolve([NativeWebLocator(url="https://example.gov.au:8443/page")]).resolved_count == 0
    assert r.resolve([NativeWebLocator(url="https://example.gov.au:443/page")]).resolved_count == 1
    malformed = r.resolve([NativeWebLocator(url="https://example.gov.au:99999/page")])
    assert malformed.resolved_count == 0
    assert "NATIVE_WEB_LOCATOR_NOT_OBSERVED" in malformed.rejection_codes


def test_same_request_resolves() -> None:
    reg = create_registry("v212a")
    ref = _register(reg, "https://example.gov.au/page")
    r = NativeWebLocatorResolver(reg).resolve([NativeWebLocator(url="https://example.gov.au/page")])
    assert r.resolved_count == 1 and list(r.resolved.values()) == [ref]
    assert r.match_category_counts == {"exact_locator_match": 1}


def test_equivalent_trailing_slash_locator_resolves_as_normalized_match() -> None:
    reg = create_registry("v212-normalized")
    ref = _register(reg, "https://example.gov.au/page")
    result = NativeWebLocatorResolver(reg).resolve(
        [NativeWebLocator(url="https://example.gov.au/page/")]
    )
    assert result.resolved_count == 1
    assert list(result.resolved.values()) == [ref]
    assert result.match_category_counts == {"normalized_locator_match": 1}


def test_unobserved_rejected() -> None:
    reg = create_registry("v212b")
    _register(reg, "https://example.gov.au/real")
    r = NativeWebLocatorResolver(reg).resolve([NativeWebLocator(url="https://x/fake")])
    assert r.resolved_count == 0
    assert "NATIVE_WEB_LOCATOR_NOT_OBSERVED" in r.rejection_codes
    assert r.match_category_counts == {"locator_not_observed": 1}


def test_cross_request_rejected() -> None:
    other = create_registry("v212c-other")
    _register(other, "https://example.gov.au/page")
    r = NativeWebLocatorResolver(create_registry("v212c")).resolve(
        [NativeWebLocator(url="https://example.gov.au/page")]
    )
    assert r.resolved_count == 0


def test_ambiguous_rejected() -> None:
    reg = create_registry("v212d")
    _register(reg, "https://example.gov.au/p", call="a")
    _register(reg, "https://example.gov.au/p", call="b")
    r = NativeWebLocatorResolver(reg).resolve([NativeWebLocator(url="https://example.gov.au/p")])
    assert "NATIVE_WEB_LOCATOR_AMBIGUOUS" in r.rejection_codes
    assert r.match_category_counts == {"locator_ambiguous": 1}


def test_source_only_can_resolve() -> None:
    reg = create_registry("v212e")
    _register(reg, "https://example.gov.au/nocite")
    r = NativeWebLocatorResolver(reg).resolve([NativeWebLocator(url="https://example.gov.au/nocite")])
    assert r.resolved_count == 1


def test_tool_schema_exposes_locators() -> None:
    claims = SUBMIT_ANSWER_TOOL["parameters"]["properties"]["claims"]["items"]["properties"]
    assert "native_web_locators" in claims and "evidence_refs" in claims
    citations = SUBMIT_ANSWER_TOOL["parameters"]["properties"]["citations"]["items"]["properties"]
    assert "native_web_locator" in citations and "evidence_ref" in citations


def test_arm_a_schema_is_native_locator_only_and_arm_b_keeps_canonical_refs() -> None:
    arm_a = AgentPolicyService().build_policy(mode="default", experiment_arm="A")
    arm_b = AgentPolicyService().build_policy(mode="default", experiment_arm="B")
    arm_a_submit = next(tool for tool in arm_a.tools if tool.get("name") == "submit_answer")
    arm_b_submit = next(tool for tool in arm_b.tools if tool.get("name") == "submit_answer")
    arm_a_claims = arm_a_submit["parameters"]["properties"]["claims"]["items"]["properties"]
    arm_a_citations = arm_a_submit["parameters"]["properties"]["citations"]["items"]["properties"]
    arm_b_claims = arm_b_submit["parameters"]["properties"]["claims"]["items"]["properties"]
    arm_b_citations = arm_b_submit["parameters"]["properties"]["citations"]["items"]["properties"]
    assert arm_a_claims["evidence_refs"]["maxItems"] == 0
    assert "native_web_locators" in arm_a_claims
    assert "evidence_ref" not in arm_a_citations
    assert "evidence_refs" in arm_b_claims
    assert "evidence_ref" in arm_b_citations


def test_arm_a_guessed_canonical_ref_is_rejected_without_ref_disclosure() -> None:
    registry = create_registry("arm-a-contract")
    context = ToolExecutorContext(
        request_id="arm-a-contract",
        registry=registry,
        allow_model_canonical_refs=False,
    )
    result = ToolExecutorService().execute_tool(
        ToolCallRequest(
            call_id="submit-guessed-ref",
            name="submit_answer",
            arguments={
                "schema_version": "agent_submission.v2",
                "answer_class": "substantive_legal",
                "draft_markdown": "A legal statement.",
                "claims": [{
                    "claim_id": "c1",
                    "claim_type": "legal_rule",
                    "materiality": "decisive",
                    "text": "A legal statement.",
                    "draft_start": 0,
                    "draft_end": 18,
                    "evidence_refs": ["web:guessed"],
                }],
                "citations": [],
                "research_status": "complete",
                "state_patch": [],
            },
        ),
        context,
    )
    assert result.result.data["errors"][0]["code"] == "CANONICAL_EVIDENCE_REF_NOT_ALLOWED"
    assert "available_evidence_refs" not in result.result.data
    assert "guessed" not in str(result.result.data)
    assert result.result.data["terminal_contract_diagnostics"]["unregistered_evidence_ref_count"] == 1


def test_arm_a_observed_locator_still_resolves() -> None:
    registry = create_registry("arm-a-locator")
    ref = _register(registry, "https://example.gov.au/observed")
    context = ToolExecutorContext(
        request_id="arm-a-locator",
        registry=registry,
        allow_model_canonical_refs=False,
    )
    claim = {
        "claim_id": "c1",
        "claim_type": "current_fact",
        "materiality": "decisive",
        "text": "x",
        "draft_start": 0,
        "draft_end": 1,
        "native_web_locators": [{"url": "https://example.gov.au/observed"}],
    }
    error = ToolExecutorService()._resolve_native_web_locators(
        args={"claims": [claim], "citations": []}, context=context
    )
    assert error is None
    assert claim["evidence_refs"] == [ref]


def test_duplicate_citations_remain_a_strict_rejection() -> None:
    registry = create_registry("duplicate-citation")
    ref = _register(registry, "https://example.gov.au/citation")
    result = ToolExecutorService().execute_tool(
        ToolCallRequest(
            call_id="duplicate-citation-submit",
            name="submit_answer",
            arguments={
                "schema_version": "agent_submission.v2",
                "answer_class": "general",
                "draft_markdown": "Answer.",
                "claims": [],
                "citations": [
                    {"evidence_ref": ref, "display_label": "Source"},
                    {"evidence_ref": ref, "display_label": "Source"},
                ],
                "research_status": "not_required",
                "state_patch": [],
            },
        ),
        ToolExecutorContext(request_id="duplicate-citation", registry=registry),
    )
    assert result.result.status == "invalid_request"
    assert result.result.data["errors"][0]["code"] == "DUPLICATE_CITATION"
    assert result.result.data["terminal_contract_diagnostics"]["duplicate_citation_count"] == 1


def test_tool_all_or_nothing() -> None:
    reg = create_registry("v212-e2e")
    _register(reg, "https://example.gov.au/ok")
    ctx = ToolExecutorContext(request_id="v212-e2e-ctx", registry=reg)
    claim = {"claim_id": "c1", "claim_type": "current_fact", "materiality": "decisive",
             "text": "x", "draft_start": 0, "draft_end": 1, "evidence_refs": [],
             "native_web_locators": [
                 {"url": "https://example.gov.au/ok"},
                 {"url": "https://example.gov.au/missing"},
             ]}
    err = ToolExecutorService()._resolve_native_web_locators(
        args={"claims": [claim], "citations": []}, context=ctx)
    assert err is not None and err.code == "NATIVE_WEB_LOCATOR_NOT_OBSERVED"


def _submit_with_evidence(*, evidence_refs, native_web_locators=None, citations=None, materiality="decisive"):
    draft = "The observed source supports this current fact."
    claim = {
        "claim_id": "c1",
        "claim_type": "current_fact",
        "materiality": materiality,
        "text": draft,
        "draft_start": 0,
        "draft_end": len(draft),
        "evidence_refs": list(evidence_refs),
        "depends_on": [],
    }
    if native_web_locators is not None:
        claim["native_web_locators"] = native_web_locators
    return ToolCallRequest(
        call_id="submit-reconcile",
        name="submit_answer",
        arguments={
            "schema_version": "agent_submission.v2",
            "answer_class": "substantive_legal",
            "draft_markdown": draft,
            "claims": [claim],
            "citations": citations or [],
            "research_status": "incomplete",
            "state_patch": [],
        },
    )


def test_submit_reconciles_mixed_registered_and_fabricated_refs() -> None:
    registry = create_registry("reconcile-mixed-ref")
    valid_ref = _register(registry, "https://example.gov.au/valid")
    context = ToolExecutorContext(request_id="reconcile-mixed-ref", registry=registry)
    result = ToolExecutorService().execute_tool(
        _submit_with_evidence(
            evidence_refs=[valid_ref, "web:model-fabricated"],
            citations=[
                {"evidence_ref": valid_ref, "display_label": "Observed source"},
                {"evidence_ref": "web:model-fabricated", "display_label": "Fabricated source"},
            ],
        ),
        context,
    )

    assert result.result.status == "ok"
    assert result.submission is not None
    assert result.submission.claims[0].evidence_refs == [valid_ref]
    assert [citation.evidence_ref for citation in result.submission.citations] == [valid_ref]
    assert result.result.data["terminal_contract_diagnostics"]["submission_invalid_evidence_refs_removed"] >= 2
    assert not context.registry.is_registered("web:model-fabricated")


def test_submit_reconciles_observed_and_unobserved_native_locators() -> None:
    registry = create_registry("reconcile-mixed-locator")
    valid_ref = _register(registry, "https://example.gov.au/valid")
    context = ToolExecutorContext(request_id="reconcile-mixed-locator", registry=registry)
    result = ToolExecutorService().execute_tool(
        _submit_with_evidence(
            evidence_refs=[valid_ref],
            native_web_locators=[
                {"url": "https://example.gov.au/valid"},
                {"url": "https://example.gov.au/not-observed"},
            ],
            citations=[{"evidence_ref": valid_ref, "display_label": "Observed source"}],
        ),
        context,
    )

    assert result.result.status == "ok"
    assert result.submission is not None
    assert result.submission.claims[0].evidence_refs == [valid_ref]
    assert result.result.data["terminal_contract_diagnostics"]["submission_unobserved_locators_removed"] == 1


def test_submit_keeps_all_invalid_material_evidence_on_hard_rejection_path() -> None:
    registry = create_registry("reconcile-invalid-only")
    context = ToolExecutorContext(request_id="reconcile-invalid-only", registry=registry)
    result = ToolExecutorService().execute_tool(
        _submit_with_evidence(
            evidence_refs=["web:model-fabricated"],
            native_web_locators=[{"url": "https://example.gov.au/not-observed"}],
        ),
        context,
    )

    assert result.result.status == "invalid_request"
    codes = {error["code"] for error in result.result.data["errors"]}
    assert "EVIDENCE_NOT_REGISTERED" in codes or "NATIVE_WEB_LOCATOR_NOT_OBSERVED" in codes


def test_submit_drops_all_invalid_evidence_from_supporting_claim() -> None:
    registry = create_registry("reconcile-supporting-invalid")
    context = ToolExecutorContext(request_id="reconcile-supporting-invalid", registry=registry)
    result = ToolExecutorService().execute_tool(
        _submit_with_evidence(
            evidence_refs=["web:model-fabricated"],
            materiality="supporting",
        ),
        context,
    )

    assert result.result.status == "ok"
    assert result.submission is not None
    assert result.submission.claims[0].evidence_refs == []
    assert not context.registry.is_registered("web:model-fabricated")


def test_tool_dedup() -> None:
    reg = create_registry("v212-dedup")
    ref = _register(reg, "https://example.gov.au/dup")
    ctx = ToolExecutorContext(request_id="v212-dedup-ctx", registry=reg)
    claim = {"claim_id": "c1", "claim_type": "current_fact", "materiality": "decisive",
             "text": "x", "draft_start": 0, "draft_end": 1, "evidence_refs": [ref],
             "native_web_locators": [{"url": "https://example.gov.au/dup"}]}
    err = ToolExecutorService()._resolve_native_web_locators(
        args={"claims": [claim], "citations": []}, context=ctx)
    assert err is None
    assert claim["evidence_refs"] == [ref]
    assert "native_web_locators" not in claim


def test_citation_neither_and_both() -> None:
    reg = create_registry("v212-cite")
    _register(reg, "https://example.gov.au/cite")
    ctx = ToolExecutorContext(request_id="v212-cite-ctx", registry=reg)
    svc = ToolExecutorService()
    neither = svc._resolve_native_web_locators(
        args={"claims": [], "citations": [{"display_label": "L"}]}, context=ctx)
    assert neither is not None and neither.code == "CITATION_EVIDENCE_MISSING"
    both = svc._resolve_native_web_locators(
        args={"claims": [], "citations": [{"display_label": "L", "evidence_ref": "web:whatever",
                                            "native_web_locator": {"url": "https://example.gov.au/cite"}}]},
        context=ctx)
    assert both is not None and both.code == "CITATION_EVIDENCE_AMBIGUOUS"


def test_n1_official_latest_url_without_version_metadata_uses_current_endpoint_basis() -> None:
    now = datetime.now(timezone.utc)
    ev = NativeWebEvidenceRef(
        evidence_origin="openai_web_native", evidence_ref="web:x", source_type="legislation",
        source_authenticity="canonical_official", authority_kind="statute",
        jurisdiction="Cth", binding_status="binding", court_or_tribunal_level=None,
        retrieved_at=now, provenance_complete=True,
        search_call_id="s", url="https://www.legislation.gov.au/C2026C00001/latest",
        title="t", native_web_citation=None, canonical_source_id=None,
        document_version=None, effective_from=None, effective_to=None,
        text=None, content_hash=None,
    )
    basis = evaluate_native_web_applicability(ev, now.date())
    assert basis.basis == "official_current_latest"
    assert basis.applicable is True


def test_malformed_evidence_refs_not_silently_repaired() -> None:
    reg = create_registry("v212-malrefs")
    _register(reg, "https://example.gov.au/ok")
    ctx = ToolExecutorContext(request_id="v212-malrefs-ctx", registry=reg)
    claim = {"claim_id": "c1", "claim_type": "current_fact", "materiality": "decisive",
             "text": "x", "draft_start": 0, "draft_end": 1,
             "evidence_refs": "web:bad",
             "native_web_locators": [{"url": "https://example.gov.au/ok"}]}
    err = ToolExecutorService()._resolve_native_web_locators(
        args={"claims": [claim], "citations": []}, context=ctx)
    assert err is not None and err.code == "SUBMISSION_SCHEMA_INVALID"
    assert err.field == "claims.0.evidence_refs"
    assert claim.get("evidence_refs") == "web:bad"


def test_absent_evidence_refs_treated_as_empty_for_merge() -> None:
    reg = create_registry("v212-absentrefs")
    ref = _register(reg, "https://example.gov.au/ok")
    ctx = ToolExecutorContext(request_id="v212-absentrefs-ctx", registry=reg)
    claim = {"claim_id": "c1", "claim_type": "current_fact", "materiality": "decisive",
             "text": "x", "draft_start": 0, "draft_end": 1,
             "native_web_locators": [{"url": "https://example.gov.au/ok"}]}
    err = ToolExecutorService()._resolve_native_web_locators(
        args={"claims": [claim], "citations": []}, context=ctx)
    assert err is None
    assert claim["evidence_refs"] == [ref]


def test_valid_evidence_refs_plus_locator_merge_dedupe() -> None:
    reg = create_registry("v212-merge")
    ref = _register(reg, "https://example.gov.au/page")
    ctx = ToolExecutorContext(request_id="v212-merge-ctx", registry=reg)
    claim = {"claim_id": "c1", "claim_type": "current_fact", "materiality": "decisive",
             "text": "x", "draft_start": 0, "draft_end": 1,
             "evidence_refs": ["exact:existing", ref, "exact:existing"],
             "native_web_locators": [{"url": "https://example.gov.au/page"}]}
    err = ToolExecutorService()._resolve_native_web_locators(
        args={"claims": [claim], "citations": []}, context=ctx)
    assert err is None
    assert claim["evidence_refs"] == ["exact:existing", ref]
    assert "native_web_locators" not in claim


def test_oversized_locator_rejected_as_schema_invalid() -> None:
    reg = create_registry("v212-big")
    ctx = ToolExecutorContext(request_id="v212-big-ctx", registry=reg)
    big_url = "https://example.gov.au/" + ("a" * 2100)
    claim = {"claim_id": "c1", "claim_type": "current_fact", "materiality": "decisive",
             "text": "x", "draft_start": 0, "draft_end": 1,
             "evidence_refs": [],
             "native_web_locators": [{"url": big_url}]}
    err = ToolExecutorService()._resolve_native_web_locators(
        args={"claims": [claim], "citations": []}, context=ctx)
    assert err is not None and err.code == "NATIVE_WEB_LOCATOR_SCHEMA_INVALID"
    assert err.field == "claims.0.native_web_locators"


def test_extra_property_locator_rejected() -> None:
    reg = create_registry("v212-extra")
    _register(reg, "https://example.gov.au/page")
    ctx = ToolExecutorContext(request_id="v212-extra-ctx", registry=reg)
    claim = {"claim_id": "c1", "claim_type": "current_fact", "materiality": "decisive",
             "text": "x", "draft_start": 0, "draft_end": 1,
             "evidence_refs": [],
             "native_web_locators": [{"url": "https://example.gov.au/page", "extra": 1}]}
    err = ToolExecutorService()._resolve_native_web_locators(
        args={"claims": [claim], "citations": []}, context=ctx)
    assert err is not None and err.code == "NATIVE_WEB_LOCATOR_SCHEMA_INVALID"


def test_valid_observed_locator_still_resolves() -> None:
    reg = create_registry("v212-obs")
    ref = _register(reg, "https://example.gov.au/ok")
    ctx = ToolExecutorContext(request_id="v212-obs-ctx", registry=reg)
    claim = {"claim_id": "c1", "claim_type": "current_fact", "materiality": "decisive",
             "text": "x", "draft_start": 0, "draft_end": 1,
             "evidence_refs": [], "native_web_locators": [{"url": "https://example.gov.au/ok"}]}
    err = ToolExecutorService()._resolve_native_web_locators(
        args={"claims": [claim], "citations": []}, context=ctx)
    assert err is None
    assert claim["evidence_refs"] == [ref]


def test_unobserved_valid_locator_not_observed() -> None:
    reg = create_registry("v212-unobs")
    _register(reg, "https://example.gov.au/real")
    ctx = ToolExecutorContext(request_id="v212-unobs-ctx", registry=reg)
    claim = {"claim_id": "c1", "claim_type": "current_fact", "materiality": "decisive",
             "text": "x", "draft_start": 0, "draft_end": 1,
             "evidence_refs": [], "native_web_locators": [{"url": "https://x/fake"}]}
    err = ToolExecutorService()._resolve_native_web_locators(
        args={"claims": [claim], "citations": []}, context=ctx)
    assert err is not None and err.code == "NATIVE_WEB_LOCATOR_NOT_OBSERVED"


def test_ambiguous_valid_locator_ambiguous() -> None:
    reg = create_registry("v212-amb")
    _register(reg, "https://example.gov.au/p", call="a")
    _register(reg, "https://example.gov.au/p", call="b")
    ctx = ToolExecutorContext(request_id="v212-amb-ctx", registry=reg)
    claim = {"claim_id": "c1", "claim_type": "current_fact", "materiality": "decisive",
             "text": "x", "draft_start": 0, "draft_end": 1,
             "evidence_refs": [], "native_web_locators": [{"url": "https://example.gov.au/p"}]}
    err = ToolExecutorService()._resolve_native_web_locators(
        args={"claims": [claim], "citations": []}, context=ctx)
    assert err is not None and err.code == "NATIVE_WEB_LOCATOR_AMBIGUOUS"


def test_citation_path_enforces_transient_schema() -> None:
    reg = create_registry("v212-cite-schema")
    _register(reg, "https://example.gov.au/cite")
    ctx = ToolExecutorContext(request_id="v212-cite-schema-ctx", registry=reg)
    svc = ToolExecutorService()
    good = svc._resolve_native_web_locators(
        args={"claims": [], "citations": [{"display_label": "L",
                                           "native_web_locator": {"url": "https://example.gov.au/cite"}}]},
        context=ctx)
    assert good is None
    extra = svc._resolve_native_web_locators(
        args={"claims": [], "citations": [{"display_label": "L",
                                           "native_web_locator": {"url": "https://example.gov.au/cite", "x": 1}}]},
        context=ctx)
    assert extra is not None and extra.code == "NATIVE_WEB_LOCATOR_SCHEMA_INVALID"
    assert extra.field == "citations.0.native_web_locator"


def test_provider_schema_enforces_max_length() -> None:
    claims_items = SUBMIT_ANSWER_TOOL["parameters"]["properties"]["claims"]["items"]["properties"]
    assert claims_items["native_web_locators"]["items"]["properties"]["url"].get("maxLength") == 2000
    citations_items = SUBMIT_ANSWER_TOOL["parameters"]["properties"]["citations"]["items"]["properties"]
    assert citations_items["native_web_locator"]["properties"]["url"].get("maxLength") == 2000
