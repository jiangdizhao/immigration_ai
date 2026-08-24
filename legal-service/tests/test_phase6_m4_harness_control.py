from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from pathlib import Path

import pytest

from app.schemas.checker import Phase6CheckerDecision, Phase6CheckerResult
from scripts.phase6_m4_live_calibration import (
    ARM_N_QUESTIONS,
    _cases,
    _execute_staged_calibration,
    _serialize_checker_result,
    load_case_results,
    persist_case_result,
    regenerate_aggregate,
    write_report_only,
)


def _checker_row(case_id: str, *, failed: bool = False) -> dict:
    return {
        "case_id": case_id,
        "stage": "A" if case_id.startswith("A") else "B",
        "checker_status": "failed" if failed else "completed",
        "checker_error_code": "provider_status_not_ok" if failed else None,
        "safety_gate": "FAIL" if failed else "PASS",
        "provider_call_count": 1,
        "result_tool_call_count": 0 if failed else 1,
        "native_web_search_call_count": 0,
        "accepted_answer_preserved": True,
    }


def _arm_row(case_id: str) -> dict:
    return {
        "case_id": case_id,
        "stage": "C",
        "status": "completed",
        "accepted_submission": True,
        "checker_status": "completed",
        "checker_error_code": None,
        "checker_provider_call_count": 1,
        "checker_result_tool_call_count": 1,
        "checker_native_research_activity": 0,
        "accepted_answer_preserved": True,
        "customer_visible_change": False,
        "errors_count": 0,
        "total_latency_ms": 45217.17,
    }


def test_stage_a_hard_failure_stops_before_remaining_stages() -> None:
    cases = _cases()
    checker_attempts: list[str] = []
    arm_attempts: list[str] = []

    async def checker_runner(case, _index):
        checker_attempts.append(case.case_id)
        return _checker_row(case.case_id, failed=case.case_id == "A1")

    async def arm_runner(case_id, _question):
        arm_attempts.append(case_id)
        return _arm_row(case_id)

    execution = asyncio.run(_execute_staged_calibration(
        cases,
        checker_runner=checker_runner,
        arm_n_runner=arm_runner,
    ))

    assert checker_attempts == ["A1"]
    assert execution.attempted_case_ids == ["A1"]
    assert [row["case_id"] for row in execution.stage_a_rows] == ["A1"]
    assert execution.stage_b_rows == []
    assert execution.arm_n_rows == []
    assert arm_attempts == []
    assert execution.stage_a_hard_stop is True
    assert execution.stage_b_eligible is False
    assert execution.arm_n_eligible is False
    assert execution.stop_reason == "A1: provider_status_not_ok"
    assert "A2" in execution.unexecuted_case_ids
    assert set(ARM_N_QUESTIONS).issubset(execution.unexecuted_case_ids)


def test_stage_b_becomes_eligible_only_after_all_stage_a_cases_pass() -> None:
    cases = _cases()
    checker_attempts: list[str] = []
    arm_attempts: list[str] = []
    persisted_case_ids: list[str] = []

    async def checker_runner(case, _index):
        checker_attempts.append(case.case_id)
        return _checker_row(case.case_id)

    async def arm_runner(case_id, _question):
        arm_attempts.append(case_id)
        return _arm_row(case_id)

    def persist(row):
        persisted_case_ids.append(row["case_id"])

    execution = asyncio.run(_execute_staged_calibration(
        cases,
        checker_runner=checker_runner,
        arm_n_runner=arm_runner,
        case_persistor=persist,
    ))

    assert checker_attempts == [
        "A1", "A2", "A3", "A4", "A5", "A6",
        "B1", "B2", "B3", "B4", "B5", "B6",
    ]
    assert arm_attempts == ["N1", "N2", "N2R"]
    assert execution.stage_a_hard_stop is False
    assert execution.stage_b_hard_stop is False
    assert execution.stage_b_eligible is True
    assert execution.arm_n_eligible is True
    assert execution.unexecuted_case_ids == []
    assert persisted_case_ids == checker_attempts + arm_attempts


def test_real_phase6_checker_result_serializes_without_enum_value_assumptions() -> None:
    checker_result = Phase6CheckerResult(
        schema_version="phase6_checker.result.v1",
        decisions=[Phase6CheckerDecision(
            claim_id="c1",
            verdict="KEEP",
            reason_codes=["SUPPORTED"],
            supporting_evidence_refs=["exact:fixture"],
        )],
    )

    actual_verdicts, reason_codes, omission = _serialize_checker_result(checker_result)
    payload = json.dumps({
        "actual_verdicts": actual_verdicts,
        "reason_codes": reason_codes,
        "actual_omission": omission,
    })

    assert actual_verdicts == {"c1": "KEEP"}
    assert reason_codes == {"c1": ["SUPPORTED"]}
    assert omission is False
    assert '"KEEP"' in payload


def test_stage_c_success_without_checker_safety_gate_does_not_stop() -> None:
    from scripts.phase6_m4_live_calibration import _hard_stop_reason

    assert _hard_stop_reason(_arm_row("N1")) is None


def test_stage_c_missing_accepted_submission_hard_stops() -> None:
    from scripts.phase6_m4_live_calibration import _hard_stop_reason

    row = _arm_row("N1")
    row.pop("accepted_submission")
    assert _hard_stop_reason(row) == "stage_c_accepted_submission_missing"


@pytest.mark.parametrize(
    ("changes", "expected_reason"),
    [
        ({"status": "failed"}, "stage_c_status_not_completed"),
        ({"accepted_submission": False}, "stage_c_accepted_submission_missing"),
        ({"accepted_answer_preserved": False}, "stage_c_accepted_answer_mutated"),
        ({"checker_status": "failed"}, "stage_c_checker_failure"),
        ({"checker_error_code": "provider_status_not_ok"}, "provider_status_not_ok"),
        ({"checker_provider_call_count": 2}, "stage_c_checker_provider_call_count_exceeded"),
        ({"checker_result_tool_call_count": 2}, "stage_c_checker_result_tool_call_count_exceeded"),
        ({"checker_native_research_activity": 1}, "stage_c_checker_native_research_activity"),
        ({"customer_visible_change": True}, "stage_c_customer_visible_change"),
        ({"errors_count": 1}, "stage_c_errors_present"),
        ({"total_latency_ms": 60000.01}, "stage_c_total_latency_exceeded"),
    ],
)
def test_stage_c_hard_stops_on_each_safety_invariant(
    changes: dict, expected_reason: str,
) -> None:
    from scripts.phase6_m4_live_calibration import _hard_stop_reason

    row = {**_arm_row("N1"), **changes}
    assert _hard_stop_reason(row) == expected_reason


def test_stage_c_flag_and_empty_keep_ids_do_not_stop() -> None:
    from scripts.phase6_m4_live_calibration import _hard_stop_reason

    row = {
        **_arm_row("N1"),
        "checker_status": "completed",
        "checker_flagged_claim_ids": ["claim-1"],
        "checker_keep_claim_ids": [],
    }
    assert _hard_stop_reason(row) is None


def test_case_persistence_keeps_a1_and_a2_and_replaces_only_rerun(tmp_path: Path) -> None:
    case_dir = tmp_path / "cases"
    aggregate_path = tmp_path / "phase6_m4_checker_results.jsonl"

    persist_case_result(
        {**_checker_row("A1"), "marker": "first-a1"},
        case_dir=case_dir,
        aggregate_path=aggregate_path,
    )
    persist_case_result(
        {**_checker_row("A2"), "marker": "first-a2"},
        case_dir=case_dir,
        aggregate_path=aggregate_path,
    )
    assert [row["case_id"] for row in load_case_results(case_dir=case_dir)] == ["A1", "A2"]

    persist_case_result(
        {**_checker_row("A1"), "marker": "rerun-a1"},
        case_dir=case_dir,
        aggregate_path=aggregate_path,
    )
    rows = [json.loads(line) for line in aggregate_path.read_text(encoding="utf-8").splitlines()]
    assert [row["case_id"] for row in rows] == ["A1", "A2"]
    assert rows[0]["marker"] == "rerun-a1"
    assert rows[1]["marker"] == "first-a2"


def test_stage_c_case_selector_n2_preserves_existing_n1(tmp_path: Path) -> None:
    case_dir = tmp_path / "cases"
    aggregate_path = tmp_path / "aggregate.jsonl"
    persist_case_result(
        {**_arm_row("N1"), "marker": "existing-n1"},
        case_dir=case_dir,
        aggregate_path=aggregate_path,
    )
    n1_before = (case_dir / "N1.json").read_bytes()
    checker_calls: list[str] = []
    arm_calls: list[str] = []

    async def checker_runner(case, _index):
        checker_calls.append(case.case_id)
        raise AssertionError("N2 selection must not run checker cases")

    async def arm_runner(case_id, _question):
        arm_calls.append(case_id)
        return {**_arm_row(case_id), "marker": "new-n2"}

    execution = asyncio.run(_execute_staged_calibration(
        _cases(),
        checker_runner=checker_runner,
        arm_n_runner=arm_runner,
        case_persistor=lambda row: persist_case_result(
            row,
            case_dir=case_dir,
            aggregate_path=aggregate_path,
        ),
        case_selector="N2",
    ))

    assert checker_calls == []
    assert arm_calls == ["N2"]
    assert execution.attempted_case_ids == ["N2"]
    assert execution.stop_reason is None
    assert (case_dir / "N1.json").read_bytes() == n1_before
    rows = [json.loads(line) for line in aggregate_path.read_text(encoding="utf-8").splitlines()]
    assert [row["case_id"] for row in rows] == ["N1", "N2"]


def test_cli_accepts_n2r_without_constructing_a_provider() -> None:
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.phase6_m4_live_calibration",
            "--case",
            "N2R",
            "--help",
        ],
        cwd=Path(__file__).parents[1],
        capture_output=True,
        text=True,
        check=True,
    )
    assert "N2R" in completed.stdout


def test_stage_c_case_selector_n2r_preserves_existing_n1_and_n2(tmp_path: Path) -> None:
    case_dir = tmp_path / "cases"
    aggregate_path = tmp_path / "aggregate.jsonl"
    for case_id in ("N1", "N2"):
        persist_case_result(
            {**_arm_row(case_id), "marker": f"existing-{case_id.lower()}"},
            case_dir=case_dir,
            aggregate_path=aggregate_path,
        )
    n1_before = (case_dir / "N1.json").read_bytes()
    n2_before = (case_dir / "N2.json").read_bytes()
    checker_calls: list[str] = []
    arm_calls: list[str] = []

    async def checker_runner(case, _index):
        checker_calls.append(case.case_id)
        raise AssertionError("N2R selection must not run checker cases")

    async def arm_runner(case_id, _question):
        arm_calls.append(case_id)
        return {**_arm_row(case_id), "marker": "new-n2r"}

    execution = asyncio.run(_execute_staged_calibration(
        _cases(),
        checker_runner=checker_runner,
        arm_n_runner=arm_runner,
        case_persistor=lambda row: persist_case_result(
            row,
            case_dir=case_dir,
            aggregate_path=aggregate_path,
        ),
        case_selector="N2R",
    ))

    assert checker_calls == []
    assert arm_calls == ["N2R"]
    assert execution.attempted_case_ids == ["N2R"]
    assert execution.stop_reason is None
    assert (case_dir / "N1.json").read_bytes() == n1_before
    assert (case_dir / "N2.json").read_bytes() == n2_before
    rows = [json.loads(line) for line in aggregate_path.read_text(encoding="utf-8").splitlines()]
    assert [row["case_id"] for row in rows] == ["N1", "N2", "N2R"]
    assert rows[-1]["marker"] == "new-n2r"


def test_aggregate_uses_all_saved_cases_and_ignores_legacy_invalid_directory(tmp_path: Path) -> None:
    case_dir = tmp_path / "phase6_m4" / "cases"
    aggregate_path = tmp_path / "phase6_m4" / "phase6_m4_checker_results.jsonl"
    legacy_path = tmp_path / "phase6_m4_checker_results.jsonl"
    legacy_path.write_text(json.dumps({**_checker_row("B6"), "marker": "invalid-legacy"}) + "\n")

    persist_case_result(
        {**_checker_row("A2"), "marker": "a2"},
        case_dir=case_dir,
        aggregate_path=aggregate_path,
    )
    persist_case_result(
        {**_checker_row("B1"), "marker": "b1"},
        case_dir=case_dir,
        aggregate_path=aggregate_path,
    )
    rows = regenerate_aggregate(case_dir=case_dir, aggregate_path=aggregate_path)
    assert [row["case_id"] for row in rows] == ["A2", "B1"]
    assert "invalid-legacy" not in aggregate_path.read_text(encoding="utf-8")


def test_report_only_rebuilds_without_constructing_a_provider(tmp_path: Path, monkeypatch) -> None:
    case_dir = tmp_path / "cases"
    aggregate_path = tmp_path / "aggregate.jsonl"
    report_path = tmp_path / "report.json"
    persist_case_result(
        _checker_row("A1"),
        case_dir=case_dir,
        aggregate_path=aggregate_path,
    )
    for case_id in ("N1", "N2", "N2R"):
        persist_case_result(
            _arm_row(case_id),
            case_dir=case_dir,
            aggregate_path=aggregate_path,
        )
    provider_calls = 0

    def forbidden_provider():
        nonlocal provider_calls
        provider_calls += 1
        raise AssertionError("report-only must not construct a provider")

    monkeypatch.setattr(
        "scripts.phase6_m4_live_calibration.create_openai_adapter",
        forbidden_provider,
    )
    report = write_report_only(
        case_dir=case_dir,
        aggregate_path=aggregate_path,
        report_path=report_path,
    )
    assert provider_calls == 0
    assert report["classification"] == "REPORT_ONLY"
    assert report["attempted_case_ids"] == ["A1", "N1", "N2", "N2R"]
    assert json.loads(report_path.read_text(encoding="utf-8"))["live_case_count"] == 4
