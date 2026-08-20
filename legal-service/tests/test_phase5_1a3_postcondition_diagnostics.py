"""Phase-5.1A.3 — content-safe postcondition diagnostic propagation tests.

Verifies that EVIDENCE_POSTCONDITION_FAILED exposes content-safe diagnostics
(counts, claim-status counts, affected claim IDs, stable reason categories,
and per-claim evidence classification) through:
1. ToolExecutorService rejection data (the submit_answer tool path).
2. scripts.run_architecture_eval._extract_submission_attempts (results.jsonl).

Never exposes claim text, URLs, raw evidence refs, source titles, search
queries, or PII.  No live OpenAI calls.
"""

from __future__ import annotations

from types import SimpleNamespace

from app.services.evidence_postcondition_service import (
    ClaimEvaluation,
    PostconditionResult,
)
from app.services.tool_executor_service import (
    _POSTCONDITION_REASON_CODES,
    _postcondition_diagnostics,
    _reason_category,
)
from scripts.run_architecture_eval import _extract_submission_attempts


def _claim_evaluation(
    claim_id: str,
    status: str,
    reasons: list[str],
    evidence_classification: dict | None = None,
) -> ClaimEvaluation:
    return ClaimEvaluation(
        claim_id=claim_id,
        claim_type="legal_rule",
        materiality="decisive",
        status=status,  # type: ignore[arg-type]
        reasons=reasons,
        evidence_classification=evidence_classification or {},
    )


# Every deterministic reason string emitted by
# evidence_postcondition_service.py must map to a stable code, not OTHER.
KNOWN_REASONS = [
    "No evidence refs for decisive claim",
    "No suitable evidence found",
    "Evidence ref not registered: exact:abc123...",
    "Research marked complete despite unresolved cross-references",
    "Decisive legal claims require controlling binding legal authority",
    "Legal claims require verified official evidence",
    "Evidence is not binding legal authority",
    "Evidence authority kind is not controlling law",
    "Official guidance is supplementary, not controlling",
    "Native web evidence lacks exact text/hash",
    "Native evidence applicability basis: official_current_retrieved",
    "LightRAG relationship alone cannot support legal claims",
    "Official guidance is non-binding",
    "Evidence provenance incomplete",
    "Evidence has no applicable document version",
    "Evidence has no effective interval for claim date",
    "Evidence not yet effective as of claim date",
    "Evidence no longer effective as of claim date",
    "Complete legal claims require an applicable effective interval",
    "Current facts require verified evidence",
    "Canonical evidence has no document version",
    "Current evidence has no document version",
    "Canonical evidence has no effective interval",
    "Current evidence has no effective interval",
    "Supporting claim; evidence optional",
    "Applicability unknown",
]


class TestExhaustiveReasonMapping:
    def test_known_reasons_map_to_stable_codes(self) -> None:
        for reason in KNOWN_REASONS:
            assert _reason_category(reason) != "OTHER", reason

    def test_expected_codes_are_used(self) -> None:
        expected = {
            "NO_EVIDENCE",
            "NO_SUITABLE_EVIDENCE",
            "EVIDENCE_REF_NOT_REGISTERED",
            "UNRESOLVED_CROSS_REFERENCE",
            "NO_CONTROLLING_AUTHORITY",
            "UNVERIFIED_SOURCE",
            "NON_BINDING_AUTHORITY",
            "NON_CONTROLLING_AUTHORITY_KIND",
            "SUPPLEMENTARY_GUIDANCE_ONLY",
            "NATIVE_WEB_NO_EXACT_TEXT",
            "NATIVE_WEB_APPLICABILITY",
            "DERIVED_RELATIONSHIP_ONLY",
            "PROVENANCE_INCOMPLETE",
            "NO_DOCUMENT_VERSION",
            "NO_EFFECTIVE_INTERVAL",
            "NOT_YET_EFFECTIVE",
            "NO_LONGER_EFFECTIVE",
            "NO_APPLICABLE_INTERVAL",
            "CURRENT_FACT_UNVERIFIED",
            "SUPPORTING_CLAIM_OPTIONAL",
            "APPLICABILITY_UNKNOWN",
        }
        assert expected <= set(_POSTCONDITION_REASON_CODES.values())

    def test_unknown_reason_maps_to_other(self) -> None:
        assert _reason_category("Some novel unsupported reason") == "OTHER"

    def test_all_codes_are_content_free(self) -> None:
        allowed = set(_POSTCONDITION_REASON_CODES.values()) | {"OTHER"}
        # Stable codes must be uppercase identifiers (never embed raw content).
        for code in allowed:
            assert code == code.upper(), code
            assert " " not in code and "/" not in code and ":" not in code


class TestPostconditionDiagnostics:
    def test_counts_status_and_reasons(self) -> None:
        result = PostconditionResult(
            status="failed",
            claim_evaluations=[
                _claim_evaluation(
                    "c1", "insufficient",
                    ["No evidence refs for decisive claim"],
                ),
                _claim_evaluation(
                    "c2", "insufficient",
                    [
                        "Decisive legal claims require controlling binding legal authority",
                        "Native web evidence lacks exact text/hash",
                    ],
                ),
                _claim_evaluation("c3", "invalid_ref", ["Evidence ref not registered: exact:x..."]),
                _claim_evaluation("c4", "supported", ["Supported claim"]),
            ],
        )
        diagnostics = _postcondition_diagnostics(result)

        assert diagnostics["evaluated_claim_count"] == 4
        assert diagnostics["insufficient_claim_count"] == 2
        assert diagnostics["invalid_ref_claim_count"] == 1
        assert diagnostics["claim_status_counts"] == {
            "insufficient": 2,
            "invalid_ref": 1,
            "supported": 1,
        }
        assert diagnostics["affected_claim_ids"] == ["c1", "c2", "c3"]
        assert diagnostics["postcondition_reason_categories"] == {
            "NO_EVIDENCE": 1,
            "NO_CONTROLLING_AUTHORITY": 1,
            "NATIVE_WEB_NO_EXACT_TEXT": 1,
            "EVIDENCE_REF_NOT_REGISTERED": 1,
        }

    def test_evidence_classification_counts(self) -> None:
        classification = {
            "evidence_count": 2,
            "source_authenticity_counts": {"canonical_official": 2},
            "authority_kind_counts": {"delegated_legislation": 1, "commentary": 1},
            "binding_status_counts": {"binding": 1, "non_binding": 1},
            "evidence_type_counts": {"canonical_local": 1, "openai_web_native": 1},
            "native_applicability_basis_counts": {"unknown": 1},
            "controlling_candidate_count": 1,
            "suitable_evidence_count": 0,
        }
        result = PostconditionResult(
            status="failed",
            claim_evaluations=[
                _claim_evaluation(
                    "c1",
                    "insufficient",
                    ["Decisive legal claims require controlling binding legal authority"],
                    evidence_classification=classification,
                ),
            ],
        )
        diagnostics = _postcondition_diagnostics(result)
        assert diagnostics["claim_evidence_classification"] == {"c1": classification}

    def test_evidence_classification_distinguishes_selection_vs_attachment(self) -> None:
        # Non-controlling selection vs. a controlling candidate present.
        non_controlling = {
            "evidence_count": 2,
            "source_authenticity_counts": {"canonical_official": 2},
            "authority_kind_counts": {"commentary": 2},
            "binding_status_counts": {"non_binding": 2},
            "evidence_type_counts": {"openai_web_native": 2},
            "native_applicability_basis_counts": {"unknown": 2},
            "controlling_candidate_count": 0,
            "suitable_evidence_count": 0,
        }
        with_controlling = dict(non_controlling)
        with_controlling["authority_kind_counts"] = {"delegated_legislation": 1, "commentary": 1}
        with_controlling["binding_status_counts"] = {"binding": 1, "non_binding": 1}
        with_controlling["controlling_candidate_count"] = 1
        result = PostconditionResult(
            status="failed",
            claim_evaluations=[
                _claim_evaluation("a", "insufficient", ["NO_CONTROLLING_AUTHORITY"], non_controlling),
                _claim_evaluation("b", "insufficient", ["NO_CONTROLLING_AUTHORITY"], with_controlling),
            ],
        )
        classifications = _postcondition_diagnostics(result)["claim_evidence_classification"]
        assert classifications["a"]["controlling_candidate_count"] == 0
        assert classifications["b"]["controlling_candidate_count"] == 1

    def test_no_content_leak(self) -> None:
        # Sensitive values that must never surface.
        classification = {
            "evidence_count": 1,
            "source_authenticity_counts": {"unverified": 1},
            "authority_kind_counts": {"commentary": 1},
            "binding_status_counts": {"non_binding": 1},
            "evidence_type_counts": {"openai_web_native": 1},
            "native_applicability_basis_counts": {"unknown": 1},
            "controlling_candidate_count": 0,
            "suitable_evidence_count": 0,
        }
        result = PostconditionResult(
            status="failed",
            claim_evaluations=[
                _claim_evaluation(
                    "aff_id", "insufficient",
                    ["No evidence refs for decisive claim"],
                    evidence_classification=classification,
                ),
            ],
        )
        diagnostics = _postcondition_diagnostics(result)
        blob = str(diagnostics)
        assert "aff_id" in blob  # claim IDs are allowed by existing policy
        assert "claim text" not in blob
        assert "http://" not in blob and "https://" not in blob
        assert "SENSITIVE" not in blob
        assert "url" not in blob.lower()
        assert "title" not in blob.lower()
        # No raw evidence-ref VALUES/tokens may surface; the diagnostic field
        # name "invalid_ref_claim_count" legitimately contains "ref", so the
        # check targets actual ref tokens (exact:/web:/raw values) not the
        # substring in the field name.
        assert "exact:" not in blob
        assert "web:" not in blob
        assert "SENSITIVE_REF" not in blob


class TestEvalRunnerPropagation:
    def _trace_with_diagnostics(self) -> SimpleNamespace:
        return SimpleNamespace(
            tool_calls=[
                {"tool_name": "submit_answer", "tool_call_id": "s1", "round_index": 1}
            ],
            tool_outputs=[
                {
                    "tool_call_id": "s1",
                    "status": "invalid_request",
                    "error": {"code": "EVIDENCE_POSTCONDITION_FAILED"},
                    "data": {
                        "accepted": False,
                        "postcondition_status": "failed",
                        "errors": [{"code": "EVIDENCE_POSTCONDITION_FAILED"}],
                        "available_evidence_refs": ["SENSITIVE_REF"],
                        "available_native_web_evidence": [],
                        "postcondition_diagnostics": {
                            "evaluated_claim_count": 2,
                            "insufficient_claim_count": 1,
                            "invalid_ref_claim_count": 1,
                            "claim_status_counts": {
                                "insufficient": 1,
                                "invalid_ref": 1,
                            },
                            "affected_claim_ids": ["c1", "c2"],
                            "postcondition_reason_categories": {
                                "NO_EVIDENCE": 1,
                                "UNRESOLVED_CROSS_REFERENCE": 1,
                            },
                            "claim_evidence_classification": {
                                "c1": {
                                    "evidence_count": 2,
                                    "source_authenticity_counts": {"canonical_official": 2},
                                    "authority_kind_counts": {"delegated_legislation": 1, "commentary": 1},
                                    "binding_status_counts": {"binding": 1, "non_binding": 1},
                                    "evidence_type_counts": {"openai_web_native": 2},
                                    "native_applicability_basis_counts": {"unknown": 2},
                                    "controlling_candidate_count": 1,
                                    "suitable_evidence_count": 0,
                                },
                            },
                        },
                    },
                }
            ],
        )

    def test_diagnostics_flow_into_attempts(self) -> None:
        attempt = _extract_submission_attempts(self._trace_with_diagnostics())[0]
        assert attempt["evaluated_claim_count"] == 2
        assert attempt["insufficient_claim_count"] == 1
        assert attempt["invalid_ref_claim_count"] == 1
        assert attempt["claim_status_counts"] == {"insufficient": 1, "invalid_ref": 1}
        assert attempt["affected_claim_ids"] == ["c1", "c2"]
        assert attempt["postcondition_reason_categories"] == {
            "NO_EVIDENCE": 1,
            "UNRESOLVED_CROSS_REFERENCE": 1,
        }
        assert attempt["claim_evidence_classification"]["c1"]["controlling_candidate_count"] == 1
        assert attempt["claim_evidence_classification"]["c1"]["authority_kind_counts"] == {
            "delegated_legislation": 1,
            "commentary": 1,
        }

    def test_diagnostics_are_content_safe_in_attempts(self) -> None:
        attempt = _extract_submission_attempts(self._trace_with_diagnostics())[0]
        blob = str(attempt)
        assert "available_evidence_refs" not in attempt
        assert "available_native_web_evidence" not in attempt
        assert "SENSITIVE_REF" not in blob
        assert "SENSITIVE_URL" not in blob
        assert "SENSITIVE_TITLE" not in blob
        assert "http://" not in blob and "https://" not in blob

    def test_no_diagnostics_when_absent(self) -> None:
        trace = SimpleNamespace(
            tool_calls=[
                {"tool_name": "submit_answer", "tool_call_id": "s1", "round_index": 1}
            ],
            tool_outputs=[
                {
                    "tool_call_id": "s1",
                    "status": "ok",
                    "error": None,
                    "data": {"accepted": True, "postcondition_status": "passed", "errors": []},
                }
            ],
        )
        attempt = _extract_submission_attempts(trace)[0]
        assert attempt["evaluated_claim_count"] is None
        assert attempt["insufficient_claim_count"] is None
        assert attempt["invalid_ref_claim_count"] is None
        assert attempt["claim_status_counts"] is None
        assert attempt["affected_claim_ids"] is None
        assert attempt["postcondition_reason_categories"] is None
        assert attempt["claim_evidence_classification"] is None