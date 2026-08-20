"""Phase 5.1A.2 — terminal-submission diagnostic extraction tests.

Evaluates content-safe submission-attempt extraction in
scripts.run_architecture_eval using lightweight fake traces consistent with
ShadowTrace's serialized tool_calls/tool_outputs.  No live OpenAI calls.
"""

from __future__ import annotations

from types import SimpleNamespace

from scripts.run_architecture_eval import (
    _aggregate_submission_errors,
    _extract_submission_attempts,
    _submission_error_code_counts,
)


def _trace(tool_calls: list[dict], tool_outputs: list[dict]) -> SimpleNamespace:
    return SimpleNamespace(tool_calls=tool_calls, tool_outputs=tool_outputs)


def _submit_call(tool_call_id: str, round_index: int = 1) -> dict:
    return {"tool_name": "submit_answer", "tool_call_id": tool_call_id,
            "round_index": round_index}


def _submit_output(tool_call_id: str, *, status: str,
                   error_code: str | None = "SUBMISSION_INVALID",
                   data: dict | None = None) -> dict:
    return {"tool_call_id": tool_call_id, "status": status,
            "error": ({"code": error_code} if error_code else None),
            "data": data or {}}


def _rejection(code: str) -> dict:
    return {"accepted": False, "postcondition_status": "failed",
            "errors": [{"code": code}],
            "available_evidence_refs": [], "available_native_web_evidence": []}


def test_first_rejected_submission() -> None:
    trace = _trace(
        tool_calls=[_submit_call("s1", 1)],
        tool_outputs=[_submit_output("s1", status="invalid_request",
                                      data=_rejection("EVIDENCE_NOT_REGISTERED"))],
    )
    a = _extract_submission_attempts(trace)[0]
    assert a["attempt_index"] == 1
    assert a["tool_call_id"] == "s1"
    assert a["round_index"] == 1
    assert a["accepted"] is False
    assert a["tool_error_code"] == "SUBMISSION_INVALID"
    assert "EVIDENCE_NOT_REGISTERED" in a["submission_error_codes"]


def test_two_independent_attempts() -> None:
    trace = _trace(
        tool_calls=[_submit_call("s1", 1), _submit_call("s2", 2)],
        tool_outputs=[
            _submit_output("s1", status="invalid_request",
                           data=_rejection("EVIDENCE_NOT_REGISTERED")),
            _submit_output("s2", status="invalid_request",
                           data=_rejection("EVIDENCE_POSTCONDITION_FAILED")),
        ],
    )
    a = _extract_submission_attempts(trace)
    assert len(a) == 2
    assert a[0]["attempt_index"] == 1
    assert a[1]["attempt_index"] == 2
    assert a[0]["submission_error_codes"] == ["EVIDENCE_NOT_REGISTERED"]
    assert a[1]["submission_error_codes"] == ["EVIDENCE_POSTCONDITION_FAILED"]


def test_tool_call_id_correlation_out_of_order() -> None:
    trace = _trace(
        tool_calls=[_submit_call("late", 2), _submit_call("early", 1)],
        tool_outputs=[
            _submit_output("early", status="invalid_request", data=_rejection("A")),
            _submit_output("late", status="invalid_request", data=_rejection("B")),
        ],
    )
    by_id = {x["tool_call_id"]: x["submission_error_codes"]
             for x in _extract_submission_attempts(trace)}
    assert by_id["early"] == ["A"]
    assert by_id["late"] == ["B"]


def test_non_submit_tools_excluded() -> None:
    trace = _trace(
        tool_calls=[
            {"tool_name": "deterministic_utility", "tool_call_id": "u1", "round_index": 1},
            {"tool_name": "flat_rag_search", "tool_call_id": "f1", "round_index": 1},
            _submit_call("s1"),
        ],
        tool_outputs=[
            {"tool_call_id": "u1", "status": "ok", "error": None, "data": {"result": 1}},
            {"tool_call_id": "f1", "status": "ok", "error": None, "data": {}},
            _submit_output("s1", status="ok", error_code=None,
                           data={"accepted": True, "postcondition_status": "passed",
                                 "errors": []}),
        ],
    )
    a = _extract_submission_attempts(trace)
    assert [x["tool_call_id"] for x in a] == ["s1"]


def test_evidence_counts() -> None:
    trace = _trace(
        tool_calls=[_submit_call("s1")],
        tool_outputs=[_submit_output("s1", status="invalid_request", data={
            "accepted": False, "postcondition_status": "failed",
            "errors": [{"code": "EVIDENCE_NOT_REGISTERED"}],
            "available_evidence_refs": ["r1", "r2", "r3"],
            "available_native_web_evidence": [
                {"evidence_ref": "w1", "native_web_citation": None},
                {"evidence_ref": "w2", "native_web_citation": {"start_index": 0}},
                {"evidence_ref": "w3", "native_web_citation": None},
            ],
        })],
    )
    a = _extract_submission_attempts(trace)[0]
    assert a["available_evidence_ref_count"] == 3
    assert a["available_native_web_evidence_count"] == 3
    assert a["available_native_web_cited_evidence_count"] == 1
    assert "r1" not in str(a) and "w1" not in str(a)


def test_content_safety() -> None:
    trace = _trace(
        tool_calls=[_submit_call("s1")],
        tool_outputs=[_submit_output("s1", status="invalid_request", data={
            "accepted": False, "postcondition_status": "failed",
            "errors": [{"code": "EVIDENCE_NOT_REGISTERED"}],
            "available_evidence_refs": ["SENSITIVE_REF"],
            "available_native_web_evidence": [
                {"evidence_ref": "SENSITIVE_REF", "url": "SENSITIVE_URL",
                 "title": "SENSITIVE_TITLE", "native_web_citation": None}
            ],
            "repair_instruction": "SENSITIVE_STATE_PATCH",
        })],
    )
    a = _extract_submission_attempts(trace)[0]
    blob = str(a)
    assert "SENSITIVE_REF" not in blob
    assert "SENSITIVE_URL" not in blob
    assert "SENSITIVE_TITLE" not in blob
    assert "SENSITIVE_STATE_PATCH" not in blob
    assert "available_evidence_refs" not in a
    assert "available_native_web_evidence" not in a
    assert "repair_instruction" not in a


def test_successful_submission() -> None:
    trace = _trace(
        tool_calls=[_submit_call("s1")],
        tool_outputs=[_submit_output("s1", status="ok", error_code=None,
                                     data={"accepted": True,
                                           "postcondition_status": "passed",
                                           "errors": []})],
    )
    a = _extract_submission_attempts(trace)[0]
    assert a["accepted"] is True
    assert a["postcondition_status"] == "passed"
    assert a["submission_error_codes"] == []
    assert a["tool_error_code"] is None
    assert a["available_evidence_ref_count"] == 0
    assert a["available_native_web_evidence_count"] == 0
    assert a["available_native_web_cited_evidence_count"] == 0


def test_error_code_aggregation() -> None:
    attempts = [
        {"submission_error_codes": ["EVIDENCE_NOT_REGISTERED"]},
        {"submission_error_codes": ["EVIDENCE_NOT_REGISTERED",
                                     "EVIDENCE_POSTCONDITION_FAILED"]},
    ]
    assert _submission_error_code_counts(attempts) == {
        "EVIDENCE_NOT_REGISTERED": 2,
        "EVIDENCE_POSTCONDITION_FAILED": 1,
    }


def test_summary_aggregation() -> None:
    rows = [
        {"submission_error_codes": {"EVIDENCE_NOT_REGISTERED": 1}},
        {"submission_error_codes": {"EVIDENCE_NOT_REGISTERED": 1,
                                     "EVIDENCE_POSTCONDITION_FAILED": 1}},
    ]
    assert _aggregate_submission_errors(rows) == {
        "EVIDENCE_NOT_REGISTERED": 2,
        "EVIDENCE_POSTCONDITION_FAILED": 1,
    }


def test_empty_trace() -> None:
    trace = _trace(tool_calls=[], tool_outputs=[])
    assert _extract_submission_attempts(trace) == []
    assert _submission_error_code_counts([]) == {}