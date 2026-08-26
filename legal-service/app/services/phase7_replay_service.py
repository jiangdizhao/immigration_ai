"""Deterministic offline replay comparison for Phase 7.2 cases."""

from __future__ import annotations

from app.schemas.learning import (
    CandidateRunObservation,
    EvaluationCase,
    ReplayMetricResult,
    ReplayReport,
)


class Phase7ReplayService:
    """Compare explicit machine-checkable observations without invoking tools."""

    def compare(
        self,
        case: EvaluationCase,
        observation: CandidateRunObservation,
        *,
        candidate_system_version: str | None = None,
    ) -> ReplayReport:
        results: list[ReplayMetricResult] = []
        not_scored: list[str] = []

        if case.expected_claim_ids:
            actual = set(observation.claim_ids)
            expected = set(case.expected_claim_ids)
            results.append(
                ReplayMetricResult(
                    metric="expected_claim_ids",
                    result="PASS" if expected.issubset(actual) else "FAIL",
                    detail=None if expected.issubset(actual) else f"missing={sorted(expected - actual)}",
                )
            )
        else:
            not_scored.append("expected_claim_ids not specified")

        if case.prohibited_claim_ids:
            actual = set(observation.claim_ids)
            prohibited = set(case.prohibited_claim_ids)
            results.append(
                ReplayMetricResult(
                    metric="prohibited_claim_ids",
                    result="PASS" if not actual.intersection(prohibited) else "FAIL",
                    detail=None if not actual.intersection(prohibited) else f"present={sorted(actual & prohibited)}",
                )
            )
        else:
            not_scored.append("prohibited_claim_ids not specified")

        expected_checker = case.expected_checker_behavior.get("outcome")
        if case.provenance == "lawyer_reviewed" and case.review_outcome == "correct":
            if observation.checker_outcome is None:
                not_scored.append("positive-case checker outcome not supplied")
            else:
                results.append(
                    ReplayMetricResult(
                        metric="false_block_on_positive_case",
                        result="FAIL" if observation.checker_outcome == "BLOCK" else "PASS",
                        detail=f"observed={observation.checker_outcome}",
                    )
                )

        if expected_checker:
            results.append(
                ReplayMetricResult(
                    metric="checker_behavior",
                    result="PASS" if observation.checker_outcome == expected_checker else "FAIL",
                    detail=f"expected={expected_checker}, actual={observation.checker_outcome}",
                )
            )
        else:
            if not (case.provenance == "lawyer_reviewed" and case.review_outcome == "correct"):
                not_scored.append("checker behavior not specified")

        if case.prohibited_behaviors:
            actual = set(observation.prohibited_behavior_flags)
            expected = set(case.prohibited_behaviors)
            results.append(
                ReplayMetricResult(
                    metric="prohibited_behaviors",
                    result="PASS" if not actual.intersection(expected) else "FAIL",
                    detail=None if not actual.intersection(expected) else f"observed={sorted(actual & expected)}",
                )
            )
        else:
            not_scored.append("prohibited behaviors not specified")

        if case.max_latency_ms is not None and observation.latency_ms is not None:
            results.append(
                ReplayMetricResult(
                    metric="latency_threshold",
                    result="PASS" if observation.latency_ms <= case.max_latency_ms else "FAIL",
                    detail=f"max={case.max_latency_ms}, actual={observation.latency_ms}",
                )
            )
        else:
            not_scored.append("latency threshold or observation not supplied")

        if case.max_tool_calls is not None and observation.tool_call_count is not None:
            results.append(
                ReplayMetricResult(
                    metric="tool_call_threshold",
                    result="PASS" if observation.tool_call_count <= case.max_tool_calls else "FAIL",
                    detail=f"max={case.max_tool_calls}, actual={observation.tool_call_count}",
                )
            )
        else:
            not_scored.append("tool-call threshold or observation not supplied")

        if case.expected_evidence_characteristics:
            mismatches = {
                key: (expected, observation.evidence_characteristics.get(key))
                for key, expected in case.expected_evidence_characteristics.items()
                if observation.evidence_characteristics.get(key) != expected
            }
            results.append(
                ReplayMetricResult(
                    metric="evidence_characteristics",
                    result="PASS" if not mismatches else "FAIL",
                    detail=None if not mismatches else str(mismatches),
                )
            )
        else:
            not_scored.append("evidence characteristics not specified")

        if observation.architecture_invariant_violations:
            results.append(
                ReplayMetricResult(
                    metric="architecture_invariants",
                    result="FAIL",
                    detail=str(observation.architecture_invariant_violations),
                )
            )
        else:
            not_scored.append("architecture invariant observation not supplied")

        failed = any(item.result == "FAIL" for item in results)
        overall = "FAIL" if failed else "PASS" if results else "NOT_SCORED"
        return ReplayReport(
            case_id=case.case_id,
            provenance=case.provenance,
            origin=case.origin,
            source_system_version=case.system_version_reviewed,
            candidate_system_version=candidate_system_version,
            per_metric_results=results,
            overall_result=overall,
            not_scored_reasons=not_scored,
        )
