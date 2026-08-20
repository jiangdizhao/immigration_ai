"""Deterministic analysis for the Phase-5 exit pilot.

This module consumes the existing architecture-eval manifest and results.jsonl.
It never reads question/answer/source content into the output and never makes a
legal judgment from question text. Missing telemetry remains ``unmeasured`` so
an exit decision cannot accidentally treat absent evidence as a passing gate.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean
from typing import Any, Iterable


PHASE5_ARMS = ("luna_web", "luna_flat_web")
DEFAULT_MAX_PROVIDER_CALLS = 3
DEFAULT_MAX_TOOL_ROUNDS = 2
DEFAULT_MAX_RETRIES = 1
INVALID_REF_CODES = {
    "INVALID_EVIDENCE_REF_FORMAT",
    "EVIDENCE_REF_NOT_REGISTERED",
    "NATIVE_WEB_LOCATOR_NOT_OBSERVED",
    "NATIVE_WEB_LOCATOR_AMBIGUOUS",
}
VERSION_GAP_REASONS = {
    "NO_DOCUMENT_VERSION",
    "NO_EFFECTIVE_INTERVAL",
    "NO_APPLICABLE_INTERVAL",
}


class ExitAnalysisError(ValueError):
    """Raised when an evaluation artifact cannot be analyzed safely."""


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ExitAnalysisError(f"invalid JSON at {path}:{line_number}") from exc
        if not isinstance(row, dict):
            raise ExitAnalysisError(f"result row at {path}:{line_number} is not an object")
        rows.append(row)
    return rows


def merge_result_files(paths: Iterable[Path]) -> list[dict[str, Any]]:
    """Merge staged results while rejecting unsafe duplicate or unknown rows."""

    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for path in paths:
        for row in load_jsonl(path):
            case_id = str(row.get("case_id") or "")
            arm = str(row.get("arm") or "")
            if not case_id or not arm:
                raise ExitAnalysisError(f"result row in {path} requires case_id and arm")
            key = (case_id, arm)
            if key in seen:
                raise ExitAnalysisError(
                    f"duplicate result row for case_id={case_id}, arm={arm}"
                )
            seen.add(key)
            merged.append(row)
    return merged


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ExitAnalysisError(f"invalid manifest JSON: {path}") from exc
    if not isinstance(manifest, dict) or not isinstance(manifest.get("cases"), list):
        raise ExitAnalysisError("manifest must contain a cases list")
    case_ids: set[str] = set()
    for case in manifest["cases"]:
        if not isinstance(case, dict) or not str(case.get("case_id") or "").strip():
            raise ExitAnalysisError("each manifest case requires case_id")
        case_id = str(case["case_id"])
        if case_id in case_ids:
            raise ExitAnalysisError(f"duplicate manifest case_id: {case_id}")
        case_ids.add(case_id)
    return manifest


def percentile(values: Iterable[float], fraction: float) -> float | None:
    ordered = sorted(float(value) for value in values)
    if not ordered:
        return None
    if not 0 <= fraction <= 1:
        raise ValueError("fraction must be between 0 and 1")
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return round(ordered[lower] + (ordered[upper] - ordered[lower]) * weight, 3)


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value: Any) -> int | None:
    number = _number(value)
    return None if number is None else int(number)


def _sum_present(rows: Iterable[dict[str, Any]], key: str) -> tuple[int, bool]:
    total = 0
    present = False
    for row in rows:
        value = _int(row.get(key))
        if value is not None:
            present = True
            total += value
    return total, present


def _submission_attempts(row: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in row.get("submission_attempts", []) if isinstance(item, dict)]


def _error_codes(row: dict[str, Any]) -> set[str]:
    codes = set(str(code) for code in row.get("submission_error_codes", {}) or {})
    for attempt in _submission_attempts(row):
        codes.update(str(code) for code in attempt.get("submission_error_codes", []) or [])
    return codes


def _reason_counts(row: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for attempt in _submission_attempts(row):
        reasons = attempt.get("postcondition_reason_categories") or {}
        if not isinstance(reasons, dict):
            continue
        for category, value in reasons.items():
            count = _int(value)
            if count is not None:
                counts[str(category)] = counts.get(str(category), 0) + count
    return counts


def _accepted_attempt(row: dict[str, Any]) -> bool:
    return any(attempt.get("accepted") is True for attempt in _submission_attempts(row))


def _attempt_has_version_gap(attempt: dict[str, Any]) -> bool:
    reasons = attempt.get("postcondition_reason_categories") or {}
    return isinstance(reasons, dict) and any(
        (_int(reasons.get(reason)) or 0) > 0 for reason in VERSION_GAP_REASONS
    )


def _attempt_has_qualifying_classification(attempt: dict[str, Any]) -> bool:
    classifications = attempt.get("claim_evidence_classification") or {}
    if not isinstance(classifications, dict):
        return False
    for classification in classifications.values():
        if not isinstance(classification, dict):
            continue
        official = _int((classification.get("source_authenticity_counts") or {}).get("canonical_official")) or 0
        delegated = _int((classification.get("authority_kind_counts") or {}).get("delegated_legislation")) or 0
        binding = _int((classification.get("binding_status_counts") or {}).get("binding")) or 0
        controlling = _int(classification.get("controlling_candidate_count")) or 0
        suitable = _int(classification.get("suitable_evidence_count"))
        if official > 0 and delegated > 0 and binding > 0 and controlling > 0 and suitable == 0:
            return True
    return False


def _applicability_gap_observed(row: dict[str, Any]) -> bool:
    for attempt in _submission_attempts(row):
        if _attempt_has_version_gap(attempt) and _attempt_has_qualifying_classification(attempt):
            return True
    return False


def _postcondition_rejected(row: dict[str, Any]) -> bool:
    if str(row.get("postcondition_status") or "") in {"failed", "rejected"}:
        return True
    if any(
        str(attempt.get("postcondition_status") or "") in {"failed", "rejected"}
        for attempt in _submission_attempts(row)
    ):
        return True
    return "EVIDENCE_POSTCONDITION_FAILED" in _error_codes(row)


def _deadline_reset_count(row: dict[str, Any]) -> int:
    explicit = _int(row.get("deadline_reset_count"))
    if explicit is not None:
        return explicit
    calls = [call for call in row.get("provider_calls", []) if isinstance(call, dict)]
    remaining = [
        value for call in calls
        if (value := _number(call.get("remaining_deadline_before_call_ms"))) is not None
    ]
    return sum(1 for previous, current in zip(remaining, remaining[1:]) if current > previous + 1.0)


def _bounded_loop_violation(row: dict[str, Any]) -> int:
    explicit = _int(row.get("unbounded_loop_violation_count"))
    if explicit is not None:
        return explicit
    provider_calls = _int(row.get("provider_call_count")) or 0
    tool_rounds = _int(row.get("tool_round_count")) or 0
    retries = _int(row.get("retry_count"))
    attempts = len(_submission_attempts(row))
    return int(
        provider_calls > DEFAULT_MAX_PROVIDER_CALLS
        or tool_rounds > DEFAULT_MAX_TOOL_ROUNDS
        or (retries is not None and retries > DEFAULT_MAX_RETRIES)
        or attempts > DEFAULT_MAX_RETRIES + 1
    )


def _hard_gate(name: str, count: int | None, *, measured: bool) -> dict[str, Any]:
    return {
        "name": name,
        "observed_count": count,
        "measurement_status": "measured" if measured else "unmeasured",
        "status": (
            "pass" if measured and count == 0
            else "fail" if measured
            else "unmeasured"
        ),
    }


def _latency_stats(rows: list[dict[str, Any]]) -> dict[str, float | None]:
    values = [
        value for row in rows
        if str(row.get("status") or "") != "blocked"
        if (value := _number(row.get("total_duration_ms"))) is not None
    ]
    return {
        "p50_ms": percentile(values, 0.50),
        "p90_ms": percentile(values, 0.90),
        "maximum_ms": max(values) if values else None,
    }


def _token_total(rows: list[dict[str, Any]], field: str) -> dict[str, Any]:
    values: list[int] = []
    provider_call_count = 0
    relevant_observation_count = 0
    for row in rows:
        provider_calls = [call for call in row.get("provider_calls", []) if isinstance(call, dict)]
        provider_call_count += len(provider_calls)
        relevant_observation_count += len(provider_calls)
        for call in provider_calls:
            value = _int(call.get(field))
            if value is not None:
                values.append(value)
        if not provider_calls:
            value = _int(row.get(f"total_{field}"))
            if value is not None:
                values.append(value)
                relevant_observation_count += 1
    if not relevant_observation_count:
        availability = "complete" if values else "unmeasured"
    elif not values:
        availability = "unmeasured"
    elif len(values) == relevant_observation_count:
        availability = "complete"
    else:
        availability = "partial"
    return {
        "value": sum(values) if values else None,
        "observed_count": len(values),
        "provider_call_count": provider_call_count,
        "relevant_observation_count": relevant_observation_count,
        "availability": availability,
    }


def _arm_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    durations = _latency_stats(rows)
    eligible_runs = [row for row in rows if row.get("status") != "blocked"]
    completed = sum(row.get("status") == "completed" for row in rows)
    accepted_runs = sum(_accepted_attempt(row) for row in eligible_runs)
    attempts = sum(len(_submission_attempts(row)) for row in rows)
    accepted_attempts = sum(
        sum(attempt.get("accepted") is True for attempt in _submission_attempts(row))
        for row in rows
    )
    return {
        "runs": len(rows),
        "eligible_non_blocked_runs": len(eligible_runs),
        "completed": completed,
        "completion_rate": round(completed / len(rows), 4) if rows else None,
        "accepted_terminal_run_count": accepted_runs,
        "accepted_terminal_run_rate": round(accepted_runs / len(eligible_runs), 4) if eligible_runs else None,
        "submission_attempt_count": attempts,
        "accepted_submission_attempt_count": accepted_attempts,
        "submission_attempt_acceptance_rate": round(accepted_attempts / attempts, 4) if attempts else None,
        "controlled_incomplete_submission_count": sum(
            _accepted_attempt(row) and row.get("research_status") == "incomplete"
            for row in eligible_runs
        ),
        "failed_without_accepted_submission_count": sum(
            not _accepted_attempt(row) for row in eligible_runs
        ),
        "postcondition_passed": sum(
            str(row.get("postcondition_status") or "") == "passed" for row in rows
        ),
        "postcondition_rejected": sum(_postcondition_rejected(row) for row in rows),
        "provider_calls": sum(_int(row.get("provider_call_count")) or 0 for row in rows),
        "tool_calls": sum(_int(row.get("tool_call_count")) or 0 for row in rows),
        "tool_rounds": sum(_int(row.get("tool_round_count")) or 0 for row in rows),
        "native_web_search_calls": sum(
            _int(row.get("native_web_search_call_count")) or 0 for row in rows
        ),
        "native_web_sources": sum(
            _int(row.get("native_web_source_count")) or 0 for row in rows
        ),
        "native_web_citations": sum(
            _int(row.get("native_web_citation_count")) or 0 for row in rows
        ),
        "flat_rag_calls": sum(_int(row.get("flat_rag_call_count")) or 0 for row in rows),
        "search_privacy_guard_violations": sum(
            _int(row.get("search_privacy_violation_count")) or 0 for row in rows
        ),
        "repair_or_continuation_count": sum(
            _int(row.get("repair_count")) or 0 for row in rows
        ),
        "token_usage": {
            "input_tokens": _token_total(rows, "input_tokens"),
            "output_tokens": _token_total(rows, "output_tokens"),
            "reasoning_tokens": _token_total(rows, "reasoning_tokens"),
        },
        "latency": durations,
    }


def _case_category_rows(
    rows: list[dict[str, Any]], manifest: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    metadata = {str(case["case_id"]): case for case in manifest["cases"]}
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        category = row.get("category") or metadata.get(str(row.get("case_id")), {}).get(
            "category", "unknown"
        )
        grouped.setdefault(str(category), []).append(row)
    return {
        category: {
            arm: _arm_metrics([row for row in category_rows if row.get("arm") == arm])
            for arm in PHASE5_ARMS
            if any(row.get("arm") == arm for row in category_rows)
        }
        for category, category_rows in sorted(grouped.items())
    }


def _applicability_gap(rows: list[dict[str, Any]]) -> dict[str, Any]:
    gap_cases: set[str] = set()
    cooccurring_candidates = 0
    reason_totals: dict[str, int] = {}
    inspected_claims = 0
    for row in rows:
        row_has_gap = False
        for attempt in _submission_attempts(row):
            classifications = attempt.get("claim_evidence_classification") or {}
            if not isinstance(classifications, dict):
                continue
            has_version_gap = _attempt_has_version_gap(attempt)
            for classification in classifications.values():
                if not isinstance(classification, dict):
                    continue
                inspected_claims += 1
                official = _int((classification.get("source_authenticity_counts") or {}).get("canonical_official")) or 0
                delegated = _int((classification.get("authority_kind_counts") or {}).get("delegated_legislation")) or 0
                binding = _int((classification.get("binding_status_counts") or {}).get("binding")) or 0
                controlling = _int(classification.get("controlling_candidate_count")) or 0
                suitable = _int(classification.get("suitable_evidence_count"))
                if has_version_gap and official > 0 and delegated > 0 and binding > 0 and controlling > 0 and suitable == 0:
                    row_has_gap = True
                    cooccurring_candidates += 1
        if row_has_gap:
            gap_cases.add(str(row.get("case_id") or "unknown"))
        for reason, count in _reason_counts(row).items():
            if reason in VERSION_GAP_REASONS:
                reason_totals[reason] = reason_totals.get(reason, 0) + count
    return {
        "pattern": "official_binding_delegated_with_version_or_effective_interval_gap",
        "applicability_gap_case_count": len(gap_cases),
        "cooccurring_candidate_claim_count": cooccurring_candidates,
        "gap_case_ids": sorted(gap_cases),
        "version_gap_reason_counts": reason_totals,
        "inspected_claim_classification_count": inspected_claims,
        "measurement_status": "measured" if inspected_claims else "unmeasured",
        "interpretation": "Case-level co-occurrence only; current content-safe telemetry does not correlate reason categories to individual claims. Exact per-claim attribution requires manual review.",
    }


def _provider_failure_observed(row: dict[str, Any]) -> bool:
    explicit_count = _int(row.get("provider_api_failure_count"))
    if explicit_count is not None:
        return explicit_count > 0
    if row.get("provider_api_failure") is True:
        return True
    return bool(row.get("provider_api_failure_codes"))


def _failure_taxonomy(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {f"A{index}": 0 for index in range(1, 13)}
    explicit_counts: dict[str, int] = {}
    for row in rows:
        explicit = row.get("failure_taxonomy") or row.get("failure_codes") or []
        if isinstance(explicit, dict):
            for code, value in explicit.items():
                explicit_counts[str(code)] = explicit_counts.get(str(code), 0) + (_int(value) or 0)
        else:
            for code in explicit:
                explicit_counts[str(code)] = explicit_counts.get(str(code), 0) + 1
        status = str(row.get("status") or "")
        codes = _error_codes(row)
        reasons = _reason_counts(row)
        if status == "timeout" or row.get("deadline_exceeded_stage"):
            counts["A2"] += 1
        elif _provider_failure_observed(row):
            counts["A1"] += 1
        if row.get("terminal_submission_missing") and not _accepted_attempt(row):
            counts["A3"] += 1
        if (_int(row.get("search_privacy_violation_count")) or 0) > 0:
            counts["A4"] += 1
        if codes & INVALID_REF_CODES:
            counts["A5"] += 1
        if any(reasons.get(reason, 0) > 0 for reason in VERSION_GAP_REASONS):
            counts["A9"] += 1
    for code, value in explicit_counts.items():
        if code in counts:
            counts[code] += value
    return {
        "definitions": {
            "A1": "provider/API transient failure supported by explicit provider telemetry",
            "A2": "deadline exhaustion",
            "A3": "missing submit_answer",
            "A4": "privacy-guard violation or separately adjudicated leakage signal",
            "A5": "evidence identity or locator failure",
            "A6": "poor source selection",
            "A7": "source normalization/classification defect",
            "A8": "wrong claim-to-source attachment",
            "A9": "exact/version/applicability evidence unavailable",
            "A10": "evidence postcondition potentially too strict, by evaluator adjudication only",
            "A11": "Luna reasoning/content error",
            "A12": "expected Phase-5 capability limitation, by evaluator assignment only",
        },
        "deterministic_counts": counts,
        "explicit_review_counts": explicit_counts,
        "classification_rule": "A1-A5 and A9 are automatic only where structured telemetry supports them; A1 requires explicit provider/API evidence. A6-A8 and A10-A12 require evaluator adjudication or explicit review codes. Bounded-loop violations remain a hard-gate metric rather than A12.",
    }


def _hard_gates(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    invalid_format = sum("INVALID_EVIDENCE_REF_FORMAT" in _error_codes(row) for row in rows)
    guessed_invalid = sum(len(_error_codes(row) & INVALID_REF_CODES) for row in rows)
    loops = sum(_bounded_loop_violation(row) for row in rows)
    deadline_resets = sum(_deadline_reset_count(row) for row in rows)
    direct_fields = {
        "cross_request_evidence_use": "cross_request_evidence_use_count",
        "privacy_leakage": "privacy_leakage_count",
        "silent_architecture_fallback": "silent_fallback_count",
        "unsupported_decisive_legal_claims_accepted": "unsupported_decisive_claim_accepted_count",
    }
    gates = [
        _hard_gate("guessed_or_invalid_canonical_evidence_ref", guessed_invalid, measured=True),
        _hard_gate("INVALID_EVIDENCE_REF_FORMAT", invalid_format, measured=True),
        _hard_gate("unbounded_retry_or_tool_loop", loops, measured=True),
        _hard_gate("deadline_reset", deadline_resets, measured=True),
    ]
    for name, field in direct_fields.items():
        count, present = _sum_present(rows, field)
        gates.append(_hard_gate(name, count if present else None, measured=present))
    return gates


def _validate_result_rows(manifest: dict[str, Any], rows: list[dict[str, Any]]) -> None:
    cases = {str(case["case_id"]): case for case in manifest["cases"]}
    seen: set[tuple[str, str]] = set()
    for row in rows:
        case_id = str(row.get("case_id") or "")
        arm = str(row.get("arm") or "")
        if case_id not in cases:
            raise ExitAnalysisError(f"results contain unknown case id: {case_id}")
        if arm not in PHASE5_ARMS:
            raise ExitAnalysisError(f"results contain unknown arm: {arm}")
        if str(cases[case_id].get("execution_mode") or "single_turn") == "stateful_manual":
            raise ExitAnalysisError(f"stateful_manual case cannot be automated: {case_id}")
        key = (case_id, arm)
        if key in seen:
            raise ExitAnalysisError(
                f"duplicate result row for case_id={case_id}, arm={arm}"
            )
        seen.add(key)


def _coverage(manifest: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    automated = {
        str(case["case_id"])
        for case in manifest["cases"]
        if str(case.get("execution_mode") or "single_turn") != "stateful_manual"
    }
    stateful = {
        str(case["case_id"])
        for case in manifest["cases"]
        if str(case.get("execution_mode") or "single_turn") == "stateful_manual"
    }
    analyzed = {
        arm: {str(row["case_id"]) for row in rows if row.get("arm") == arm}
        for arm in PHASE5_ARMS
    }
    missing = {
        "arm_a": sorted(automated - analyzed["luna_web"]),
        "arm_b": sorted(automated - analyzed["luna_flat_web"]),
    }
    paired = analyzed["luna_web"] & analyzed["luna_flat_web"]
    complete = not missing["arm_a"] and not missing["arm_b"] and paired == automated
    return {
        "automated_expected_case_count": len(automated),
        "stateful_manual_case_count": len(stateful),
        "stateful_manual_case_ids": sorted(stateful),
        "arm_a_analyzed_case_count": len(analyzed["luna_web"]),
        "arm_b_analyzed_case_count": len(analyzed["luna_flat_web"]),
        "missing_arm_a_case_ids": missing["arm_a"],
        "missing_arm_b_case_ids": missing["arm_b"],
        "paired_automated_case_count": len(paired),
        "coverage_status": "complete" if complete else "incomplete",
    }


def _ab_comparison(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_case_arm = {(str(row.get("case_id")), str(row.get("arm"))): row for row in rows}
    paired = []
    for case_id in sorted({str(row.get("case_id")) for row in rows}):
        arm_a = by_case_arm.get((case_id, "luna_web"))
        arm_b = by_case_arm.get((case_id, "luna_flat_web"))
        if arm_a is None or arm_b is None:
            continue
        latency_a = _number(arm_a.get("total_duration_ms"))
        latency_b = _number(arm_b.get("total_duration_ms"))
        metrics_a = _arm_metrics([arm_a])
        metrics_b = _arm_metrics([arm_b])
        tokens_a = metrics_a["token_usage"]
        tokens_b = metrics_b["token_usage"]
        paired.append({
            "case_id": case_id,
            "completion_delta_b_minus_a": int(arm_b.get("status") == "completed") - int(arm_a.get("status") == "completed"),
            "accepted_terminal_run_delta_b_minus_a": metrics_b["accepted_terminal_run_count"] - metrics_a["accepted_terminal_run_count"],
            "postcondition_pass_delta_b_minus_a": int(arm_b.get("postcondition_status") == "passed") - int(arm_a.get("postcondition_status") == "passed"),
            "postcondition_reject_delta_b_minus_a": int(_postcondition_rejected(arm_b)) - int(_postcondition_rejected(arm_a)),
            "controlled_incomplete_delta_b_minus_a": metrics_b["controlled_incomplete_submission_count"] - metrics_a["controlled_incomplete_submission_count"],
            "latency_delta_ms_b_minus_a": round(latency_b - latency_a, 3) if latency_a is not None and latency_b is not None else None,
            "provider_call_delta_b_minus_a": (_int(arm_b.get("provider_call_count")) or 0) - (_int(arm_a.get("provider_call_count")) or 0),
            "tool_call_delta_b_minus_a": (_int(arm_b.get("tool_call_count")) or 0) - (_int(arm_a.get("tool_call_count")) or 0),
            "tool_round_delta_b_minus_a": (_int(arm_b.get("tool_round_count")) or 0) - (_int(arm_a.get("tool_round_count")) or 0),
            "native_web_call_delta_b_minus_a": (_int(arm_b.get("native_web_search_call_count")) or 0) - (_int(arm_a.get("native_web_search_call_count")) or 0),
            "flat_rag_calls_b": _int(arm_b.get("flat_rag_call_count")) or 0,
            "token_delta_b_minus_a": {
                field: (
                    tokens_b[field]["value"] - tokens_a[field]["value"]
                    if tokens_a[field]["availability"] == "complete"
                    and tokens_b[field]["availability"] == "complete"
                    else None
                )
                for field in ("input_tokens", "output_tokens", "reasoning_tokens")
            },
            "applicability_gap_case_signal_b_minus_a": int(_applicability_gap_observed(arm_b)) - int(_applicability_gap_observed(arm_a)),
            "failed_without_accepted_submission_delta_b_minus_a": metrics_b["failed_without_accepted_submission_count"] - metrics_a["failed_without_accepted_submission_count"],
        })
    deltas = [item["latency_delta_ms_b_minus_a"] for item in paired if item["latency_delta_ms_b_minus_a"] is not None]
    return {
        "paired_case_count": len(paired),
        "mean_latency_delta_ms_b_minus_a": round(mean(deltas), 3) if deltas else None,
        "paired_outcomes": paired,
        "interpretation": "Flat-RAG benefit must be weighed against latency, calls, safe-incomplete outcomes, evidence quality, and manual legal review.",
    }


def analyze(manifest: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    _validate_result_rows(manifest, rows)
    by_arm = {
        arm: _arm_metrics([row for row in rows if row.get("arm") == arm])
        for arm in PHASE5_ARMS
    }
    return {
        "schema_version": "architecture_eval.phase5_exit_analysis.v1",
        "manifest_version": manifest.get("manifest_version"),
        "manifest_scope": manifest.get("scope"),
        "pilot_case_count": len(manifest["cases"]),
        "result_row_count": len(rows),
        "coverage": _coverage(manifest, rows),
        "by_arm": by_arm,
        "by_category": _case_category_rows(rows, manifest),
        "hard_gates": _hard_gates(rows),
        "failure_taxonomy": _failure_taxonomy(rows),
        "exact_applicability_gap": _applicability_gap(rows),
        "ab_comparison": _ab_comparison(rows),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Analyze Phase-5 exit pilot results")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--results", required=True, action="append", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    report = analyze(load_manifest(args.manifest), merge_result_files(args.results))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
