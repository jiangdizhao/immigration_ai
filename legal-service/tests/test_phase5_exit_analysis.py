from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.phase5_exit_analysis import (
    ExitAnalysisError,
    analyze,
    merge_result_files,
    percentile,
)


MANIFEST = {
    "manifest_version": "test",
    "scope": "phase5_exit_pilot",
    "cases": [
        {"case_id": "stable", "category": "stable_general"},
        {"case_id": "legal", "category": "difficult_legislation_cross_reference"},
    ],
}


def _accepted(case_id: str, arm: str, duration: float) -> dict:
    return {
        "case_id": case_id,
        "category": "stable_general",
        "arm": arm,
        "status": "completed",
        "postcondition_status": "passed",
        "provider_call_count": 1,
        "tool_call_count": 1,
        "tool_round_count": 1,
        "native_web_search_call_count": 0,
        "flat_rag_call_count": 1 if arm == "luna_flat_web" else 0,
        "total_duration_ms": duration,
        "research_status": "complete",
        "submission_attempts": [{"accepted": True}],
        "provider_calls": [{
            "remaining_deadline_before_call_ms": 40000,
            "input_tokens": 10,
            "output_tokens": 20,
            "reasoning_tokens": 30,
        }],
        "search_privacy_violation_count": 0,
    }


def test_percentile_is_deterministic():
    assert percentile([100, 200, 300, 400], 0.5) == 250.0
    assert percentile([], 0.5) is None


def test_analysis_keeps_arms_paired_and_marks_unmeasured_gates():
    rows = [
        _accepted("stable", "luna_web", 1000),
        _accepted("stable", "luna_flat_web", 1200),
        {
            "case_id": "legal",
            "category": "difficult_legislation_cross_reference",
            "arm": "luna_web",
            "status": "incomplete",
            "postcondition_status": "failed",
            "provider_call_count": 1,
            "tool_call_count": 2,
            "tool_round_count": 2,
            "total_duration_ms": 2000,
            "submission_error_codes": {"EVIDENCE_POSTCONDITION_FAILED": 1},
            "submission_attempts": [{
                "accepted": False,
                "postcondition_status": "failed",
                "postcondition_reason_categories": {
                    "NO_DOCUMENT_VERSION": 1,
                    "NO_EFFECTIVE_INTERVAL": 1,
                },
                "claim_evidence_classification": {
                    "c1": {
                        "source_authenticity_counts": {"canonical_official": 2},
                        "authority_kind_counts": {"delegated_legislation": 2},
                        "binding_status_counts": {"binding": 2},
                        "controlling_candidate_count": 2,
                        "suitable_evidence_count": 0,
                    }
                },
            }],
            "provider_calls": [{"remaining_deadline_before_call_ms": 40000}],
            "search_privacy_violation_count": 0,
        },
        {
            "case_id": "legal",
            "category": "difficult_legislation_cross_reference",
            "arm": "luna_flat_web",
            "status": "completed",
            "postcondition_status": "passed",
            "provider_call_count": 1,
            "tool_call_count": 2,
            "tool_round_count": 2,
            "total_duration_ms": 2100,
            "submission_attempts": [{"accepted": True}],
            "provider_calls": [{"remaining_deadline_before_call_ms": 40000}],
            "search_privacy_violation_count": 0,
        },
    ]

    report = analyze(MANIFEST, rows)

    assert report["pilot_case_count"] == 2
    assert report["ab_comparison"]["paired_case_count"] == 2
    assert report["by_arm"]["luna_flat_web"]["flat_rag_calls"] == 1
    assert report["exact_applicability_gap"]["applicability_gap_case_count"] == 1
    assert report["exact_applicability_gap"]["cooccurring_candidate_claim_count"] == 1
    gates = {gate["name"]: gate for gate in report["hard_gates"]}
    assert len(gates) == len(report["hard_gates"])
    assert gates["privacy_leakage"]["status"] == "unmeasured"
    assert gates["cross_request_evidence_use"]["status"] == "unmeasured"
    assert report["failure_taxonomy"]["deterministic_counts"]["A9"] == 1
    assert report["failure_taxonomy"]["deterministic_counts"]["A10"] == 0
    assert report["by_arm"]["luna_web"]["token_usage"]["input_tokens"]["value"] == 10
    assert report["by_arm"]["luna_web"]["token_usage"]["output_tokens"]["value"] == 20
    assert report["by_arm"]["luna_web"]["token_usage"]["reasoning_tokens"]["value"] == 30


def test_applicability_gap_requires_same_attempt_cooccurrence():
    row = _accepted("legal", "luna_web", 1000)
    qualifying_classification = {
        "c1": {
            "source_authenticity_counts": {"canonical_official": 1},
            "authority_kind_counts": {"delegated_legislation": 1},
            "binding_status_counts": {"binding": 1},
            "controlling_candidate_count": 1,
            "suitable_evidence_count": 0,
        }
    }
    row["submission_attempts"] = [
        {
            "accepted": False,
            "postcondition_reason_categories": {"NO_DOCUMENT_VERSION": 1},
        },
        {
            "accepted": False,
            "claim_evidence_classification": qualifying_classification,
        },
    ]
    report = analyze(MANIFEST, [row])
    assert report["exact_applicability_gap"]["applicability_gap_case_count"] == 0


def test_token_availability_is_complete_partial_or_unmeasured():
    complete = _accepted("stable", "luna_web", 1000)
    partial = _accepted("legal", "luna_web", 1000)
    partial["provider_calls"] = [
        {"input_tokens": 10, "output_tokens": 20, "reasoning_tokens": 30},
        {"input_tokens": 40, "reasoning_tokens": 50},
    ]
    unmeasured = _accepted("stable", "luna_flat_web", 1000)
    unmeasured["provider_calls"] = [{"remaining_deadline_before_call_ms": 40000}]
    complete_report = analyze(MANIFEST, [complete])
    assert complete_report["by_arm"]["luna_web"]["token_usage"]["input_tokens"]["availability"] == "complete"
    report = analyze(MANIFEST, [complete, partial, unmeasured])
    assert report["by_arm"]["luna_web"]["token_usage"]["input_tokens"]["availability"] == "complete"
    assert report["by_arm"]["luna_web"]["token_usage"]["input_tokens"]["value"] == 60
    assert report["by_arm"]["luna_web"]["token_usage"]["output_tokens"]["availability"] == "partial"
    assert report["by_arm"]["luna_web"]["token_usage"]["output_tokens"]["value"] == 40
    assert report["by_arm"]["luna_web"]["token_usage"]["reasoning_tokens"]["availability"] == "complete"
    assert report["by_arm"]["luna_web"]["token_usage"]["reasoning_tokens"]["value"] == 110
    assert report["by_arm"]["luna_flat_web"]["token_usage"]["input_tokens"]["availability"] == "unmeasured"


def test_partial_token_totals_do_not_produce_paired_delta():
    arm_a = _accepted("stable", "luna_web", 1000)
    arm_b = _accepted("stable", "luna_flat_web", 1000)
    arm_b["provider_calls"] = [
        {"input_tokens": 10},
        {"output_tokens": 20},
    ]
    report = analyze(MANIFEST, [arm_a, arm_b])
    outcome = report["ab_comparison"]["paired_outcomes"][0]
    assert outcome["token_delta_b_minus_a"]["input_tokens"] is None


def test_deadline_increase_is_reported_as_a_reset():
    row = _accepted("stable", "luna_web", 1000)
    row["provider_calls"] = [
        {"remaining_deadline_before_call_ms": 40000},
        {"remaining_deadline_before_call_ms": 40100},
    ]
    report = analyze(MANIFEST, [row])
    gates = {gate["name"]: gate for gate in report["hard_gates"]}
    assert gates["deadline_reset"]["observed_count"] == 1
    assert gates["deadline_reset"]["status"] == "fail"


def test_gate_names_are_unique_and_guard_violation_is_not_leakage():
    row = _accepted("stable", "luna_web", 1000)
    row["search_privacy_violation_count"] = 2
    report = analyze(MANIFEST, [row])
    gates = report["hard_gates"]
    assert len({gate["name"] for gate in gates}) == len(gates)
    assert next(gate for gate in gates if gate["name"] == "privacy_leakage")["status"] == "unmeasured"
    assert report["by_arm"]["luna_web"]["search_privacy_guard_violations"] == 2


def test_a10_requires_explicit_adjudication_and_generic_error_is_not_a1():
    row = _accepted("stable", "luna_web", 1000)
    row["status"] = "error"
    row["failure_codes"] = ["A10"]
    report = analyze(MANIFEST, [row])
    counts = report["failure_taxonomy"]["deterministic_counts"]
    assert counts["A1"] == 0
    assert counts["A10"] == 1
    assert counts["A12"] == 0


def test_registered_error_and_structured_provider_failure_taxonomy_mapping():
    identity_failure = _accepted("stable", "luna_web", 1000)
    identity_failure["submission_attempts"] = [{
        "accepted": False,
        "submission_error_codes": [
            "EVIDENCE_NOT_REGISTERED",
            "INVALID_EVIDENCE_REF_FORMAT",
            "NATIVE_WEB_LOCATOR_NOT_OBSERVED",
        ],
    }]
    provider_failure = _accepted("legal", "luna_web", 1000)
    provider_failure["status"] = "error"
    provider_failure["provider_calls"] = [{"status": "timeout"}]
    report = analyze(MANIFEST, [identity_failure, provider_failure])
    counts = report["failure_taxonomy"]["deterministic_counts"]
    assert counts["A5"] == 1
    assert counts["A1"] == 1


def test_unrelated_postcondition_failure_is_not_a5():
    row = _accepted("stable", "luna_web", 1000)
    row["submission_attempts"] = [{
        "accepted": False,
        "submission_error_codes": ["EVIDENCE_POSTCONDITION_FAILED"],
    }]
    report = analyze(MANIFEST, [row])
    assert report["failure_taxonomy"]["deterministic_counts"]["A5"] == 0


def test_run_metrics_distinguish_accepted_run_from_attempt_acceptance():
    row = _accepted("stable", "luna_web", 1000)
    row["submission_attempts"] = [{"accepted": False}, {"accepted": True}]
    report = analyze(MANIFEST, [row])
    metrics = report["by_arm"]["luna_web"]
    assert metrics["accepted_terminal_run_count"] == 1
    assert metrics["accepted_terminal_run_rate"] == 1.0
    assert metrics["submission_attempt_count"] == 2
    assert metrics["submission_attempt_acceptance_rate"] == 0.5
    assert metrics["failed_without_accepted_submission_count"] == 0


def test_controlled_incomplete_is_only_an_accepted_incomplete_submission():
    row = _accepted("stable", "luna_web", 1000)
    row["research_status"] = "incomplete"
    report = analyze(MANIFEST, [row])
    assert report["by_arm"]["luna_web"]["controlled_incomplete_submission_count"] == 1


def test_combined_results_reject_duplicate_case_arm_and_report_coverage(tmp_path: Path):
    arm_a = tmp_path / "a.jsonl"
    arm_b = tmp_path / "b.jsonl"
    arm_a.write_text(json.dumps(_accepted("stable", "luna_web", 1000)) + "\n", encoding="utf-8")
    arm_b.write_text(json.dumps(_accepted("stable", "luna_flat_web", 1200)) + "\n", encoding="utf-8")
    merged = merge_result_files([arm_a, arm_b])
    report = analyze(MANIFEST, merged)
    assert report["coverage"]["coverage_status"] == "incomplete"
    assert report["coverage"]["automated_expected_case_count"] == 2
    assert report["coverage"]["missing_arm_a_case_ids"] == ["legal"]
    assert report["coverage"]["missing_arm_b_case_ids"] == ["legal"]

    duplicate = tmp_path / "duplicate.jsonl"
    duplicate.write_text(json.dumps(_accepted("stable", "luna_web", 1000)) + "\n", encoding="utf-8")
    with pytest.raises(ExitAnalysisError, match="duplicate result row"):
        merge_result_files([arm_a, duplicate])


def test_full_automated_coverage_is_complete_and_unknown_arm_is_rejected():
    rows = [
        _accepted("stable", "luna_web", 1000),
        _accepted("stable", "luna_flat_web", 1200),
        _accepted("legal", "luna_web", 2000),
        _accepted("legal", "luna_flat_web", 2200),
    ]
    report = analyze(MANIFEST, rows)
    assert report["coverage"]["coverage_status"] == "complete"
    assert report["coverage"]["paired_automated_case_count"] == 2
    rows[0]["arm"] = "unknown"
    with pytest.raises(ExitAnalysisError, match="unknown arm"):
        analyze(MANIFEST, rows)
    rows[0]["arm"] = "luna_web"
    rows[0]["case_id"] = "unknown"
    with pytest.raises(ExitAnalysisError, match="unknown case id"):
        analyze(MANIFEST, rows)
