"""Bounded Phase-6 M4 live checker calibration.

This is an evaluation harness, not serving code.  It intentionally uses the
frozen packet builder, checker service, and OpenAI Responses adapter.  It
records only bounded, content-safe evaluation metadata.
"""

from __future__ import annotations

import asyncio
import argparse
import hashlib
import inspect
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import get_settings
from app.schemas.agent import AgentClaim, AgentRuntimeRequest, AgentSubmissionV2, ExecutionBudget
from app.schemas.evidence import CanonicalLocalEvidenceRef, NativeWebEvidenceRef
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.agent_runtime_service import AgentRuntimeService
from app.services.compact_checker_contract_service import build_phase6_checker_input
from app.services.openai_responses_adapter import create_openai_adapter
from app.services.phase6_compact_checker_service import Phase6CheckerService
from app.services.request_evidence_registry import create_registry
from app.services.shadow_agent_service import ShadowAgentService


ROOT = Path(__file__).resolve().parents[1]
M4_ARTIFACT_DIR = ROOT / "artifacts" / "phase6_m4"
CASE_RESULTS_DIR = M4_ARTIFACT_DIR / "cases"
RESULTS_PATH = M4_ARTIFACT_DIR / "phase6_m4_checker_results.jsonl"
REPORT_PATH = M4_ARTIFACT_DIR / "phase6_m4_report.json"
TODAY = date(2026, 8, 24)
MAX_LIVE_CASES = 14
_STAGE_ORDER = {"A": 0, "B": 1, "C": 2}
_CHECKER_CASE_IDS = tuple(f"A{index}" for index in range(1, 7)) + tuple(
    f"B{index}" for index in range(1, 7)
)
_RESULT_CASE_IDS = _CHECKER_CASE_IDS + ("N1", "N2", "N2R")


@dataclass(frozen=True)
class Case:
    case_id: str
    stage: str
    category: str
    expected_verdict: str
    expected_omission: bool
    rationale: str
    question: str
    claim_specs: tuple[dict[str, Any], ...]
    evidence_specs: tuple[dict[str, Any], ...] = ()
    additional_evidence_keys: tuple[str, ...] = ()
    matter_facts: dict[str, Any] = field(default_factory=dict)
    target_claim_id: str | None = None


@dataclass(slots=True)
class StagedExecution:
    """Content-free staged execution state used by the M4 harness."""

    live_rows: list[dict[str, Any]] = field(default_factory=list)
    stage_a_rows: list[dict[str, Any]] = field(default_factory=list)
    stage_b_rows: list[dict[str, Any]] = field(default_factory=list)
    arm_n_rows: list[dict[str, Any]] = field(default_factory=list)
    attempted_case_ids: list[str] = field(default_factory=list)
    unexecuted_case_ids: list[str] = field(default_factory=list)
    stage_a_hard_stop: bool = False
    stage_b_hard_stop: bool = False
    stage_b_eligible: bool = False
    arm_n_eligible: bool = False
    stop_reason: str | None = None


def _source_section(file_name: str, section_ref: str) -> dict[str, Any]:
    path = ROOT / "data" / "raw" / "legislation" / "migration_regulations_1994_F2026C00667" / file_name
    payload = json.loads(path.read_text(encoding="utf-8"))
    for section in payload["sections"]:
        if section.get("section_ref") == section_ref:
            return {
                "title": payload["title"],
                "section_ref": section_ref,
                "heading": section.get("heading") or section_ref,
                "text": section["text"].strip(),
                "source_id": f"local:{file_name}",
                "document_version": payload.get("document_version"),
            }
    raise RuntimeError(f"missing local corpus section: {file_name} {section_ref}")


def _local_evidence_spec(key: str, file_name: str, section_ref: str) -> dict[str, Any]:
    section = _source_section(file_name, section_ref)
    return {"key": key, "kind": "local", "section": section}


def _native_metadata_spec(key: str, *, url: str, title: str) -> dict[str, Any]:
    return {
        "key": key,
        "kind": "native_metadata_fixture",
        "url": url,
        "title": title,
    }


def _claim_specs(*items: tuple[str, str, str, list[str], list[str]]) -> tuple[dict[str, Any], ...]:
    return tuple({
        "claim_id": claim_id,
        "claim_type": claim_type,
        "text": text,
        "materiality": materiality,
        "depends_on": depends_on,
        "evidence_keys": evidence_keys,
    } for claim_id, claim_type, materiality, text, depends_on, evidence_keys in items)


def _cases() -> list[Case]:
    v2 = "F2026C00667VOL02.json"
    v3 = "F2026C00667VOL03.json"
    student_primary = _local_evidence_spec("student_primary", v2, "page_392")
    student_funds = _local_evidence_spec("student_funds", v2, "page_393")
    transition = _local_evidence_spec("transition", v3, "page_415")
    guardian = _local_evidence_spec("guardian", v2, "page_398")
    official_gs = _native_metadata_spec(
        "official_gs",
        url="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/genuine-student-requirement",
        title="Genuine Student requirement | Immigration and citizenship | Department of Home Affairs",
    )
    weak_blog = _native_metadata_spec(
        "weak_blog",
        url="https://example.invalid/old-student-visa-blog",
        title="Archived commentary about student visa applications",
    )

    return [
        Case(
            "A1", "A", "clear_keep_legal_rule", "KEEP", False,
            "Current official compilation text states the timing rule directly.",
            "Assess only whether the supplied proposition is supported by the supplied evidence.",
            _claim_specs(("c1", "legal_rule", "decisive", "All criteria must be satisfied at the time a decision is made on the application.", [], ["student_primary"])),
            (student_primary,),
        ),
        Case(
            "A2", "A", "clear_keep_dependency", "KEEP", False,
            "The conclusion follows through an explicit legal-rule dependency.",
            "Assess the legal conclusion using the supplied rule and its dependency.",
            _claim_specs(
                ("rule", "legal_rule", "supporting", "All criteria must be satisfied at the time a decision is made on the application.", [], ["student_primary"]),
                ("application", "legal_application", "decisive", "The Subclass 500 primary criteria must therefore be satisfied when the decision is made.", ["rule"], []),
            ),
            (student_primary,),
        ),
        Case(
            "A3", "A", "clear_flag_insufficient_support", "FLAG", False,
            "The material proposition has no supporting evidence in the packet.",
            "Assess whether the supplied evidence supports the proposition.",
            _claim_specs(("c1", "legal_application", "decisive", "The applicant is automatically entitled to a Subclass 500 visa without satisfying the criteria.", [], [])),
        ),
        Case(
            "A4", "A", "clear_flag_applicability_ambiguity", "FLAG", False,
            "The transitional text depends on the unknown application date and commencement facts.",
            "Assess applicability conservatively; the application date and transitional regime are unresolved.",
            _claim_specs(("c1", "legal_application", "decisive", "The 2026 amendment applies to this application.", [], ["transition"])),
            (transition,),
            matter_facts={"application_date": "unknown", "transitional_regime": "unresolved"},
        ),
        Case(
            "A5", "A", "true_block_primary_criteria_timing", "BLOCK", False,
            "The official text directly contradicts the proposition and is backend-held exact text.",
            "Assess whether the supplied proposition is directly contradicted by applicable evidence.",
            _claim_specs(("c1", "legal_rule", "decisive", "The primary criteria for a Subclass 500 visa do not need to be satisfied at the time of decision.", [], ["student_primary"])),
            (student_primary,),
        ),
        Case(
            "A6", "A", "anti_false_block_different_stream", "FLAG", False,
            "Subclass 500 evidence does not establish a rule for the different Subclass 590 stream.",
            "Do not collapse visa streams; assess the Subclass 590 proposition using only applicable evidence.",
            _claim_specs(("c1", "legal_application", "decisive", "A Subclass 590 applicant automatically falls under the Subclass 500 primary criteria in this provision.", [], ["student_primary"])),
            (student_primary,),
        ),
        Case(
            "B1", "B", "keep_native_metadata_only", "KEEP", False,
            "The genuine official native-web metadata is relevant to the narrowly stated proposition; exact text is intentionally absent.",
            "Assess whether the supplied official metadata adequately supports this narrowly framed proposition; metadata alone cannot justify BLOCK.",
            _claim_specs(("c1", "legal_rule", "decisive", "The supplied official Department page concerns the Genuine Student requirement for Student visa applicants.", [], ["official_gs"])),
            (official_gs,),
        ),
        Case(
            "B2", "B", "flag_weak_or_stale_authority", "FLAG", False,
            "The packet contains only weak archived commentary metadata, not applicable authoritative text.",
            "Assess conservatively; the supplied source is commentary and may be stale.",
            _claim_specs(("c1", "legal_application", "decisive", "This archived commentary alone proves that the applicant satisfies every mandatory Subclass 500 criterion.", [], ["weak_blog"])),
            (weak_blog,),
        ),
        Case(
            "B3", "B", "true_block_funds_requirement", "BLOCK", False,
            "The official compilation text directly states the genuine-access-to-funds requirement.",
            "Assess whether the supplied proposition is directly contradicted by applicable exact text.",
            _claim_specs(("c1", "legal_rule", "decisive", "A Subclass 500 applicant is not required to have genuine access to funds.", [], ["student_funds"])),
            (student_funds,),
        ),
        Case(
            "B4", "B", "unrelated_evidence_trap", "FLAG", False,
            "Evidence for the Subclass 500 claim must not be used for the unrelated Subclass 590 claim.",
            "Assess each claim only within its own evidence/dependency scope; the Subclass 500 evidence is unrelated to the Subclass 590 claim.",
            _claim_specs(
                ("a", "legal_rule", "decisive", "A Subclass 500 applicant must satisfy the primary criteria at decision time.", [], ["student_primary"]),
                ("b", "legal_application", "decisive", "A Subclass 590 applicant automatically satisfies the Subclass 500 enrolment criterion.", [], ["guardian"]),
            ),
            (student_primary, guardian),
            target_claim_id="b",
        ),
        Case(
            "B5", "B", "material_omission_positive", "KEEP", True,
            "The packet contains an additional material primary-criteria branch beyond the enrollment branch.",
            "Assess the supplied enrollment conclusion and report a material omission only if the packet itself evidences one.",
            _claim_specs(("c1", "legal_application", "decisive", "The applicant satisfies the Subclass 500 primary criteria because the applicant is enrolled in a course of study.", [], ["student_primary"])),
            (student_primary, student_funds),
            additional_evidence_keys=("student_funds",),
        ),
        Case(
            "B6", "B", "material_omission_negative", "KEEP", False,
            "The narrow timing proposition has no evidenced omitted branch in the packet.",
            "Assess only whether the timing proposition is supported; no material omitted branch is evidenced by this packet.",
            _claim_specs(("c1", "legal_rule", "decisive", "All criteria must be satisfied at the time a decision is made on the application.", [], ["student_primary"])),
            (student_primary,),
            matter_facts={"evaluation_scope": "timing proposition only; no omitted branch evidenced"},
        ),
    ]


def _register_evidence(registry: Any, spec: dict[str, Any], index: int) -> str:
    if spec["kind"] == "local":
        section = spec["section"]
        record = CanonicalLocalEvidenceRef(
            evidence_origin="canonical_local",
            evidence_ref="exact:pending",
            source_type="legislation",
            source_authenticity="canonical_official",
            authority_kind="statute",
            jurisdiction="Cth",
            binding_status="binding",
            court_or_tribunal_level=None,
            retrieved_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
            provenance_complete=True,
            canonical_source_id=section["source_id"],
            canonical_chunk_id=section["section_ref"],
            document_id=section["title"],
            document_version=section["document_version"],
            provision_or_span=section["heading"],
            canonical_url=None,
            content_hash=hashlib.sha256(section["text"].encode("utf-8")).hexdigest(),
            text=section["text"],
        )
        return registry.register_canonical_evidence(
            evidence=record,
            tool_call_id=f"m4-local-{index}",
            tool_name="m4_stored_local_corpus_fixture",
        )
    record = NativeWebEvidenceRef(
        evidence_origin="openai_web_native",
        evidence_ref="web:pending",
        source_type="web_page",
        source_authenticity="canonical_official" if spec["key"] == "official_gs" else "verified_secondary_copy",
        authority_kind="operational_guidance" if spec["key"] == "official_gs" else "commentary",
        jurisdiction="Cth",
        binding_status="not_applicable",
        court_or_tribunal_level=None,
        retrieved_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
        provenance_complete=True,
        search_call_id=f"m4-stored-search-{index}",
        url=spec["url"],
        title=spec["title"],
        native_web_citation=None,
        canonical_source_id=None,
        document_version=None,
        effective_from=None,
        effective_to=None,
        text=None,
        content_hash=None,
    )
    return registry.register_native_web_evidence(
        evidence=record,
        tool_call_id=f"m4-native-{index}",
        tool_name="m4_stored_official_metadata_fixture",
    )


def _build_checker_case(case: Case, index: int):
    request_id = f"m4-{case.case_id.lower()}-{uuid4().hex[:8]}"
    registry = create_registry(request_id)
    refs: dict[str, str] = {}
    for spec in case.evidence_specs:
        refs[spec["key"]] = _register_evidence(registry, spec, index)

    draft_parts: list[str] = []
    claims: list[AgentClaim] = []
    cursor = 0
    for spec in case.claim_specs:
        if draft_parts:
            draft_parts.append(" ")
            cursor += 1
        text = spec["text"]
        start = cursor
        end = start + len(text)
        claims.append(AgentClaim(
            claim_id=spec["claim_id"],
            claim_type=spec["claim_type"],
            materiality=spec["materiality"],
            text=text,
            draft_start=start,
            draft_end=end,
            evidence_refs=[refs[key] for key in spec["evidence_keys"]],
            depends_on=list(spec["depends_on"]),
        ))
        draft_parts.append(text)
        cursor = end
    draft = "".join(draft_parts)
    submission = AgentSubmissionV2(
        schema_version="agent_submission.v2",
        answer_class="substantive_legal",
        draft_markdown=draft,
        claims=claims,
        citations=[],
        research_status="complete",
        state_patch=[],
    )
    request = AgentRuntimeRequest(
        request_id=request_id,
        turn_id=f"turn-{case.case_id.lower()}-{uuid4().hex[:8]}",
        mode="default",
        user_text=case.question,
        response_language="en",
        as_of_date=TODAY,
        matter_state=dict(case.matter_facts),
        execution_budget=ExecutionBudget(
            turn_deadline_ms=15000,
            answer_research_target_ms=7000,
            checker_target_ms=8000,
        ),
    )
    additional = [refs[key] for key in case.additional_evidence_keys]
    checker_input = build_phase6_checker_input(
        request=request,
        submission=submission,
        registry=registry,
        compact_matter_facts=case.matter_facts,
        additional_relevant_evidence_refs=additional,
    )
    return checker_input, registry, submission


def _semantic_severity(expected: str, actual: str | None, status: str) -> str:
    if status != "completed":
        return "contract_or_provider_failure"
    if actual == expected:
        return "match"
    if actual == "BLOCK" and expected != "BLOCK":
        return "CRITICAL"
    if expected == "BLOCK" and actual == "KEEP":
        return "MAJOR"
    if expected in {"KEEP", "FLAG"} and actual in {"KEEP", "FLAG"}:
        return "CONSERVATIVE_MODERATE"
    return "MAJOR"


def _hard_stop_reason(row: dict[str, Any]) -> str | None:
    """Return a schema-aware deterministic stop reason for an M4 result row."""
    if row.get("stage") == "C":
        if row.get("status") != "completed":
            return "stage_c_status_not_completed"
        if row.get("accepted_submission") is not True:
            return "stage_c_accepted_submission_missing"
        if row.get("accepted_answer_preserved") is not True:
            return "stage_c_accepted_answer_mutated"
        if row.get("checker_status") == "failed":
            return "stage_c_checker_failure"
        if row.get("checker_error_code") is not None:
            return str(row["checker_error_code"])
        if int(row.get("checker_provider_call_count", 0) or 0) > 1:
            return "stage_c_checker_provider_call_count_exceeded"
        if int(row.get("checker_result_tool_call_count", 0) or 0) > 1:
            return "stage_c_checker_result_tool_call_count_exceeded"
        if int(row.get("checker_native_research_activity", 0) or 0) > 0:
            return "stage_c_checker_native_research_activity"
        if row.get("customer_visible_change") is True:
            return "stage_c_customer_visible_change"
        if int(row.get("errors_count", 0) or 0) > 0:
            return "stage_c_errors_present"
        if float(row.get("total_latency_ms", 0) or 0) > 60000:
            return "stage_c_total_latency_exceeded"
        return None

    if row.get("safety_gate") != "PASS":
        return str(row.get("checker_error_code") or row.get("safety_gate") or "safety_gate_failure")
    if row.get("checker_status") == "failed":
        return str(row.get("checker_error_code") or "checker_failure")
    if row.get("checker_error_code"):
        return str(row["checker_error_code"])
    if int(row.get("provider_call_count", 0) or 0) > 1:
        return "checker_provider_call_count_exceeded"
    if int(row.get("checker_provider_call_count", 0) or 0) > 1:
        return "checker_provider_call_count_exceeded"
    if int(row.get("retry_count", 0) or 0) > 0:
        return "checker_retry_detected"
    if int(row.get("continuation_count", 0) or 0) > 0:
        return "checker_continuation_detected"
    if int(row.get("native_web_search_call_count", 0) or 0) > 0:
        return "checker_native_research_activity"
    if int(row.get("checker_native_research_activity", 0) or 0) > 0:
        return "checker_native_research_activity"
    if row.get("accepted_answer_preserved") is False:
        return "accepted_answer_mutation"
    if row.get("customer_visible_change") is True:
        return "customer_visible_change"
    return None


def _string_like(value: Any) -> str:
    """Serialize current Literal fields and compatible enum-like values."""
    return str(getattr(value, "value", value))


def _serialize_checker_result(checker_result: Any) -> tuple[dict[str, str], dict[str, list[str]], bool]:
    """Return JSON-safe verdict/reason-code telemetry from a checker result."""
    actual_verdicts = {
        decision.claim_id: _string_like(decision.verdict)
        for decision in checker_result.decisions
    }
    reason_codes = {
        decision.claim_id: [_string_like(code) for code in decision.reason_codes]
        for decision in checker_result.decisions
    }
    return actual_verdicts, reason_codes, checker_result.material_omission_suspected


ARM_N_QUESTIONS = {
    "N1": "What primary criteria must an applicant satisfy for an Australian Subclass 500 Student visa as at 24 August 2026?",
    "N2": "For an Australian Subclass 500 Student visa applicant, how do the primary criteria, genuine access to funds, and public interest criteria interact at decision time, and what missing facts prevent a reliable assessment?",
    "N2R": (
        "A Subclass 500 Student visa applicant can show the required amount of money "
        "in a relative’s bank account, but there is uncertainty about whether the "
        "applicant genuinely has access to those funds. At the time the visa is decided, "
        "does having the required amount on paper satisfy the financial requirement, "
        "or must the decision-maker also be satisfied that the applicant genuinely has "
        "access to it? Explain how the relevant criteria interact and what facts would "
        "determine the outcome."
    ),
}


def _atomic_write_text(path: Path, content: str) -> None:
    """Write an artifact atomically so interrupted runs cannot leave partial JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        temporary_path.write_text(content, encoding="utf-8")
        os.replace(temporary_path, path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


def _validate_case_result(row: Any, *, source: Path | None = None) -> dict[str, Any]:
    if not isinstance(row, dict):
        location = f" in {source}" if source else ""
        raise ValueError(f"case result must be a JSON object{location}")
    case_id = row.get("case_id")
    stage = row.get("stage")
    expected_stage = "C" if isinstance(case_id, str) and case_id in ARM_N_QUESTIONS else (
        "A" if isinstance(case_id, str) and case_id.startswith("A") else "B"
    )
    if case_id not in _RESULT_CASE_IDS:
        raise ValueError(f"unknown M4 case id: {case_id!r}")
    if stage != expected_stage:
        raise ValueError(
            f"M4 case {case_id} has stage {stage!r}; expected {expected_stage!r}"
        )
    return row


def _case_result_path(case_id: str, *, case_dir: Path = CASE_RESULTS_DIR) -> Path:
    if case_id not in _RESULT_CASE_IDS:
        raise ValueError(f"unknown M4 case id: {case_id!r}")
    return case_dir / f"{case_id}.json"


def _case_sort_key(row: dict[str, Any]) -> tuple[int, str]:
    return (_STAGE_ORDER.get(str(row["stage"]), 99), str(row["case_id"]))


def load_case_results(*, case_dir: Path = CASE_RESULTS_DIR) -> list[dict[str, Any]]:
    """Load only the new per-case directory; legacy aggregate files are ignored."""
    if not case_dir.exists():
        return []
    rows: list[dict[str, Any]] = []
    seen_case_ids: set[str] = set()
    for path in sorted(case_dir.glob("*.json")):
        row = _validate_case_result(
            json.loads(path.read_text(encoding="utf-8")),
            source=path,
        )
        if path.stem != row["case_id"]:
            raise ValueError(f"M4 case filename does not match case_id: {path}")
        if row["case_id"] in seen_case_ids:
            raise ValueError(f"duplicate M4 case result: {row['case_id']}")
        seen_case_ids.add(row["case_id"])
        rows.append(row)
    return sorted(rows, key=_case_sort_key)


def regenerate_aggregate(
    *,
    case_dir: Path = CASE_RESULTS_DIR,
    aggregate_path: Path = RESULTS_PATH,
) -> list[dict[str, Any]]:
    """Regenerate the aggregate exclusively from valid per-case JSON files."""
    rows = load_case_results(case_dir=case_dir)
    aggregate = "".join(
        json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n"
        for row in rows
    )
    _atomic_write_text(aggregate_path, aggregate)
    return rows


def persist_case_result(
    row: dict[str, Any],
    *,
    case_dir: Path = CASE_RESULTS_DIR,
    aggregate_path: Path = RESULTS_PATH,
) -> list[dict[str, Any]]:
    """Atomically replace one case and rebuild the deterministic aggregate."""
    row = _validate_case_result(row)
    case_path = _case_result_path(row["case_id"], case_dir=case_dir)
    _atomic_write_text(
        case_path,
        json.dumps(row, indent=2, sort_keys=True) + "\n",
    )
    return regenerate_aggregate(case_dir=case_dir, aggregate_path=aggregate_path)


def write_report_only(
    *,
    case_dir: Path = CASE_RESULTS_DIR,
    aggregate_path: Path = RESULTS_PATH,
    report_path: Path = REPORT_PATH,
) -> dict[str, Any]:
    """Rebuild and report stored cases without constructing a provider."""
    rows = regenerate_aggregate(case_dir=case_dir, aggregate_path=aggregate_path)
    report = {
        "schema_version": "phase6_m4_report.v1",
        "classification": "REPORT_ONLY",
        "run_mode": "report_only",
        "previous_results_loaded": bool(rows),
        "live_case_count": len(rows),
        "stage_a_completed": sum(row["stage"] == "A" for row in rows),
        "stage_b_completed": sum(row["stage"] == "B" for row in rows),
        "arm_n_completed": sum(row["stage"] == "C" for row in rows),
        "attempted_case_ids": [row["case_id"] for row in rows],
        "unexecuted_case_ids": [
            case_id for case_id in _RESULT_CASE_IDS
            if case_id not in {row["case_id"] for row in rows}
        ],
        "rows": rows,
    }
    _atomic_write_text(report_path, json.dumps(report, indent=2, sort_keys=True) + "\n")
    return report


async def _persist_row(persistor: Any, row: dict[str, Any]) -> None:
    if persistor is None:
        return
    persisted = persistor(row)
    if inspect.isawaitable(persisted):
        await persisted


async def _execute_staged_calibration(
    cases: list[Case],
    *,
    checker_runner: Any,
    arm_n_runner: Any,
    case_persistor: Any = None,
    stage_selector: str | None = None,
    case_selector: str | None = None,
) -> StagedExecution:
    """Run the staged plan and stop immediately after a hard failure.

    The runner callables are injected so this control flow can be tested
    offline without constructing the provider or making network calls.
    """
    execution = StagedExecution()
    all_case_ids = [case.case_id for case in cases] + list(ARM_N_QUESTIONS)

    if case_selector:
        selected = [case for case in cases if case.case_id == case_selector]
        if selected:
            selected_stage = selected[0].stage
            row = await checker_runner(selected[0], 1)
        elif case_selector in ARM_N_QUESTIONS:
            selected_stage = "C"
            row = await arm_n_runner(case_selector, ARM_N_QUESTIONS[case_selector])
        else:
            raise ValueError(f"unknown M4 case: {case_selector}")
        execution.live_rows.append(row)
        await _persist_row(case_persistor, row)
        execution.attempted_case_ids.append(case_selector)
        if selected_stage == "A":
            execution.stage_a_rows.append(row)
        elif selected_stage == "B":
            execution.stage_b_rows.append(row)
        else:
            execution.arm_n_rows.append(row)
        if _hard_stop_reason(row):
            execution.stop_reason = f"{case_selector}: {_hard_stop_reason(row)}"
            execution.stage_a_hard_stop = selected_stage == "A"
            execution.stage_b_hard_stop = selected_stage == "B"
        execution.unexecuted_case_ids = [case_id for case_id in all_case_ids if case_id not in execution.attempted_case_ids]
        return execution

    if stage_selector == "A":
        stages = ("A",)
    elif stage_selector == "B":
        stages = ("B",)
    elif stage_selector == "C":
        stages = ("C",)
    else:
        stages = ("A", "B", "C")

    if "A" in stages:
        for index, case in enumerate((case for case in cases if case.stage == "A"), 1):
            row = await checker_runner(case, index)
            execution.live_rows.append(row)
            await _persist_row(case_persistor, row)
            execution.stage_a_rows.append(row)
            execution.attempted_case_ids.append(case.case_id)
            reason = _hard_stop_reason(row)
            if reason:
                execution.stage_a_hard_stop = True
                execution.stop_reason = f"{case.case_id}: {reason}"
                break
        if execution.stage_a_hard_stop:
            execution.unexecuted_case_ids = [case_id for case_id in all_case_ids if case_id not in execution.attempted_case_ids]
            return execution
        execution.stage_b_eligible = True
    elif stage_selector == "A":
        execution.stage_b_eligible = False

    if "B" in stages:
        if stage_selector is None and not execution.stage_b_eligible:
            execution.stop_reason = execution.stop_reason or "stage_a_not_complete"
            execution.unexecuted_case_ids = [case_id for case_id in all_case_ids if case_id not in execution.attempted_case_ids]
            return execution
        for index, case in enumerate((case for case in cases if case.stage == "B"), 1):
            row = await checker_runner(case, len(execution.attempted_case_ids) + index)
            execution.live_rows.append(row)
            await _persist_row(case_persistor, row)
            execution.stage_b_rows.append(row)
            execution.attempted_case_ids.append(case.case_id)
            reason = _hard_stop_reason(row)
            if reason:
                execution.stage_b_hard_stop = True
                execution.stop_reason = f"{case.case_id}: {reason}"
                break
        if execution.stage_b_hard_stop:
            execution.unexecuted_case_ids = [case_id for case_id in all_case_ids if case_id not in execution.attempted_case_ids]
            return execution
        if stage_selector is None:
            execution.arm_n_eligible = True

    if "C" in stages:
        if stage_selector is None and not execution.arm_n_eligible:
            execution.stop_reason = execution.stop_reason or "stage_b_not_complete"
            execution.unexecuted_case_ids = [case_id for case_id in all_case_ids if case_id not in execution.attempted_case_ids]
            return execution
        for case_id, question in ARM_N_QUESTIONS.items():
            row = await arm_n_runner(case_id, question)
            execution.live_rows.append(row)
            await _persist_row(case_persistor, row)
            execution.arm_n_rows.append(row)
            execution.attempted_case_ids.append(case_id)
            reason = _hard_stop_reason(row)
            if reason:
                execution.stop_reason = f"{case_id}: {reason}"
                break

    execution.unexecuted_case_ids = [case_id for case_id in all_case_ids if case_id not in execution.attempted_case_ids]
    return execution


async def _run_checker_case(case: Case, provider: Any, index: int) -> dict[str, Any]:
    checker_input, registry, submission = _build_checker_case(case, index)
    deadline = AbsoluteTurnDeadline(started_at=time.perf_counter(), turn_deadline_ms=15000)
    result = await Phase6CheckerService().run(
        checker_input=checker_input,
        provider=provider,
        deadline=deadline,
        checker_target_ms=8000,
        model=get_settings().compact_checker_model,
        reasoning_effort=get_settings().compact_checker_reasoning_effort,
        registry=registry,
        post_checker_reserve_ms=1000,
        minimum_checker_start_budget_ms=3000,
    )
    actual_verdicts: dict[str, str] = {}
    reason_codes: dict[str, list[str]] = {}
    actual_omission = False
    if result.checker_result is not None:
        actual_verdicts, reason_codes, actual_omission = _serialize_checker_result(
            result.checker_result
        )
    root_id = case.target_claim_id or next(
        (c.claim_id for c in checker_input.material_claims if c.materiality == "decisive"),
        checker_input.material_claims[0].claim_id,
    )
    actual = actual_verdicts.get(root_id)
    accepted_unchanged = submission.draft_markdown == checker_input.accepted_draft.draft_markdown
    hard_safety = not (
        result.status != "completed"
        or result.error_code is not None
        or (
        actual == "BLOCK" and case.expected_verdict != "BLOCK"
        )
        or result.native_web_search_call_count
        or result.native_web_source_count
        or result.native_web_citation_count
        or result.provider_call_count > 1
        or result.returned_tool_call_count > 1
        or result.status == "completed" and result.returned_tool_names != ["submit_phase6_checker_result"]
        or not accepted_unchanged
    )
    return {
        "case_id": case.case_id,
        "stage": case.stage,
        "category": case.category,
        "expected_verdict": case.expected_verdict,
        "actual_verdict": actual,
        "actual_verdicts": actual_verdicts,
        "reason_codes": reason_codes,
        "expected_omission": case.expected_omission,
        "actual_omission": actual_omission,
        "checker_status": result.status,
        "checker_error_code": result.error_code,
        "provider_call_count": result.provider_call_count,
        "result_tool_call_count": result.returned_tool_call_count,
        "returned_tool_names": result.returned_tool_names,
        "native_web_search_call_count": result.native_web_search_call_count,
        "native_web_source_count": result.native_web_source_count,
        "native_web_citation_count": result.native_web_citation_count,
        "model": result.model,
        "reasoning_effort": result.reasoning_effort,
        "provider_duration_ms": round(result.provider_duration_ms, 2),
        "checker_total_duration_ms": round(result.duration_ms, 2),
        "timeout_allocated_ms": round(result.timeout_allocated_ms, 2),
        "input_tokens": result.input_tokens,
        "cached_input_tokens": result.cached_input_tokens,
        "reasoning_tokens": result.reasoning_tokens,
        "output_tokens": result.output_tokens,
        "filter_plan_safe_to_apply": (
            result.filter_plan.safe_to_apply if result.filter_plan is not None else None
        ),
        "accepted_answer_preserved": accepted_unchanged,
        "safety_gate": "PASS" if hard_safety else "FAIL",
        "semantic_severity": _semantic_severity(case.expected_verdict, actual, result.status),
    }


async def _run_arm_n(case_id: str, question: str, provider: Any) -> dict[str, Any]:
    settings = get_settings()
    execution_budget = ExecutionBudget(
        max_tool_rounds=settings.agent_max_tool_rounds,
        max_provider_calls=settings.agent_max_provider_calls,
        max_retries=0,
        turn_deadline_ms=60000,
        answer_research_target_ms=min(settings.default_answer_research_target_ms, 45000),
        checker_target_ms=min(settings.legal_fact_check_target_ms, 8000),
        max_flat_rag_calls=settings.agent_max_flat_rag_calls,
        retry_viability_threshold_ms=settings.agent_retry_viability_threshold_ms,
    )
    runtime = AgentRuntimeService(provider=provider)
    trace = await ShadowAgentService(runtime).run_shadow(
        user_text=question,
        mode="default",
        response_language="en",
        as_of_date=TODAY,
        matter_state={},
        turn_id=f"m4-{case_id.lower()}-{uuid4().hex[:8]}",
        experiment_arm="N",
        deadline=AbsoluteTurnDeadline(started_at=time.perf_counter(), turn_deadline_ms=60000),
        execution_budget=execution_budget,
        upstream_gate_allowed=True,
    )
    submission = trace.submission
    checker_provider_calls = trace.checker_provider_call_count
    checker_result_tools = trace.checker_result_tool_call_count
    checker_research = trace.native_web_search_call_count - sum(
        int(call.get("native_web_search_call_count", 0) or 0)
        for call in trace.provider_calls
        if call.get("stage") == "answer_research" or call.get("stage") == "terminal_synthesis"
    )
    return {
        "case_id": case_id,
        "stage": "C",
        "category": "arm_n_end_to_end_shadow",
        "question_defined_before_execution": True,
        "status": trace.status,
        "accepted_submission": submission is not None,
        "accepted_answer_preserved": None if submission is None else True,
        "answer_agent_provider_call_count": sum(
            1 for call in trace.provider_calls if call.get("stage") != "phase6_checker"
        ),
        "checker_provider_call_count": checker_provider_calls,
        "checker_result_tool_call_count": checker_result_tools,
        "checker_status": trace.checker_status,
        "checker_latency_ms": round(trace.checker_latency_ms, 2),
        "total_latency_ms": round(trace.total_duration_ms, 2),
        "checker_native_research_activity": max(0, checker_research),
        "checker_error_code": trace.checker_error_code,
        "checker_blocked_claim_ids": trace.checker_blocked_claim_ids,
        "checker_flagged_claim_ids": trace.checker_flagged_claim_ids,
        "checker_keep_claim_ids": trace.checker_keep_claim_ids,
        "customer_visible_change": False,
        "errors_count": len(trace.errors),
    }


async def main() -> int:
    parser = argparse.ArgumentParser(description="Bounded Phase-6 M4 calibration harness")
    parser.add_argument(
        "--case",
        choices=[case.case_id for case in _cases()] + list(ARM_N_QUESTIONS),
        help="run one checker or Stage-C probe",
    )
    parser.add_argument("--stage", choices=["A", "B", "C"], help="run one isolated stage")
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="rebuild and print the report from stored per-case results without provider calls",
    )
    args = parser.parse_args()
    if args.report_only and (args.case or args.stage):
        parser.error("--report-only cannot be combined with --case or --stage")
    if args.case and args.stage:
        case_stage = (
            "C" if args.case in ARM_N_QUESTIONS
            else next(case.stage for case in _cases() if case.case_id == args.case)
        )
        if case_stage != args.stage:
            parser.error(f"--case {args.case} belongs to Stage {case_stage}")
    if args.report_only:
        report = write_report_only()
        print(json.dumps(report, indent=2, sort_keys=True))
        return 0
    # M4 permits only process-local shadow enablement.  Keep it inside the
    # executable path so importing this harness cannot alter test/config state.
    os.environ.setdefault("COMPACT_CHECKER_ENABLED", "true")
    get_settings.cache_clear()
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured; no live calls were made")
    provider = create_openai_adapter()
    cases = _cases()
    async def checker_runner(case: Case, index: int) -> dict[str, Any]:
        return await _run_checker_case(case, provider, index)

    async def arm_n_runner(case_id: str, question: str) -> dict[str, Any]:
        return await _run_arm_n(case_id, question, provider)

    execution = await _execute_staged_calibration(
        cases,
        checker_runner=checker_runner,
        arm_n_runner=arm_n_runner,
        case_persistor=persist_case_result,
        stage_selector=args.stage,
        case_selector=args.case,
    )
    live_rows = regenerate_aggregate()
    stage_a_rows = execution.stage_a_rows
    stage_b_rows = execution.stage_b_rows
    arm_n_rows = execution.arm_n_rows
    stage_a_hard_stop = execution.stage_a_hard_stop
    stage_b_hard_stop = execution.stage_b_hard_stop

    checker_rows = [row for row in live_rows if row.get("stage") in {"A", "B"}]
    latencies = [row["checker_total_duration_ms"] for row in checker_rows if row["checker_status"] in {"completed", "failed"}]
    false_blocks = [row for row in checker_rows if row["actual_verdict"] == "BLOCK" and row["expected_verdict"] != "BLOCK"]
    true_blocks = [row for row in checker_rows if row["expected_verdict"] == "BLOCK" and row["actual_verdict"] == "BLOCK"]
    clear_keeps = [row for row in checker_rows if row["category"] in {"clear_keep_legal_rule", "clear_keep_dependency", "keep_native_metadata_only"} and row["actual_verdict"] == "KEEP"]
    unsafe_keeps = [row for row in checker_rows if row["expected_verdict"] == "FLAG" and row["actual_verdict"] == "KEEP"]
    omission_positive = [row for row in checker_rows if row["case_id"] == "B5" and row["actual_omission"] is True]
    omission_negative_false = [row for row in checker_rows if row["case_id"] == "B6" and row["actual_omission"] is True]
    valid_completions = [row for row in checker_rows if row["checker_status"] == "completed"]

    hard_safety_pass = (
        len(stage_a_rows) == 6
        and not stage_a_hard_stop
        and len(stage_b_rows) == 6
        and not stage_b_hard_stop
        and not false_blocks
        and all(row["provider_call_count"] <= 1 for row in checker_rows)
        and all(row["result_tool_call_count"] <= 1 for row in checker_rows)
        and all(row["native_web_search_call_count"] == 0 for row in checker_rows)
        and all(row["accepted_answer_preserved"] for row in checker_rows)
        and all(row["checker_provider_call_count"] <= 1 for row in arm_n_rows)
        and all(row["checker_result_tool_call_count"] <= 1 for row in arm_n_rows)
        and all(row["checker_native_research_activity"] == 0 for row in arm_n_rows)
        and all(row["accepted_answer_preserved"] for row in arm_n_rows)
        and all(row["customer_visible_change"] is False for row in arm_n_rows)
    )
    semantic_pass = (
        len(true_blocks) == 2
        and len(clear_keeps) >= 2
        and not unsafe_keeps
        and not omission_negative_false
        and len(omission_positive) == 1
        and len(valid_completions) / max(1, len(checker_rows)) >= 0.9
    )
    median_latency = statistics.median(latencies) if latencies else None
    latency_pass = median_latency is not None and median_latency <= 6000 and all(
        row["checker_total_duration_ms"] <= row["timeout_allocated_ms"] + 1000
        for row in checker_rows if row["timeout_allocated_ms"]
    )
    probe_mode = bool(args.case or args.stage)
    classification = (
        "PROBE_STOPPED" if execution.stop_reason else "PROBE_COMPLETE"
    ) if probe_mode else (
        "M4 PASS" if hard_safety_pass and semantic_pass and latency_pass else (
            "NO-GO" if not hard_safety_pass else "CONTINUE_SHADOW"
        )
    )
    report = {
        "schema_version": "phase6_m4_report.v1",
        "classification": classification,
        "run_mode": "probe" if probe_mode else "full_m4",
        "selected_case": args.case,
        "selected_stage": args.stage,
        "previous_results_loaded": False,
        "live_case_count": len(live_rows),
        "stage_a_completed": len(stage_a_rows),
        "stage_b_completed": len(stage_b_rows),
        "arm_n_completed": len(arm_n_rows),
        "stage_a_hard_stop": stage_a_hard_stop,
        "stage_b_hard_stop": stage_b_hard_stop,
        "stage_b_eligible": execution.stage_b_eligible,
        "arm_n_eligible": execution.arm_n_eligible,
        "stop_reason": execution.stop_reason,
        "attempted_case_ids": execution.attempted_case_ids,
        "unexecuted_case_ids": execution.unexecuted_case_ids,
        "hard_safety_pass": hard_safety_pass,
        "semantic_pass": semantic_pass,
        "latency_pass": latency_pass,
        "false_block_count": len(false_blocks),
        "true_block_count": len(true_blocks),
        "true_block_expected": 2,
        "clear_keep_count": len(clear_keeps),
        "unsafe_keep_count": len(unsafe_keeps),
        "omission_true_positive_count": len(omission_positive),
        "omission_false_positive_count": len(omission_negative_false),
        "structured_completion_count": len(valid_completions),
        "structured_completion_denominator": len(checker_rows),
        "provider_contract_violations": sum(row["safety_gate"] != "PASS" for row in checker_rows),
        "checker_latencies_ms": latencies,
        "checker_latency_min_ms": min(latencies) if latencies else None,
        "checker_latency_median_ms": median_latency,
        "checker_latency_max_ms": max(latencies) if latencies else None,
        "arm_n_total_latencies_ms": [row["total_latency_ms"] for row in arm_n_rows],
        "max_checker_provider_call_count": max((row["provider_call_count"] for row in checker_rows), default=0),
        "checker_retries": 0,
        "checker_native_research_activity": sum(row["native_web_search_call_count"] for row in checker_rows) + sum(row["checker_native_research_activity"] for row in arm_n_rows),
        "answer_mutation_count": sum(
            row.get("accepted_submission") is True and row.get("accepted_answer_preserved") is False
            for row in live_rows
        ),
        "customer_serving_change_count": sum(bool(row.get("customer_visible_change", False)) for row in arm_n_rows),
        "rows": live_rows,
    }
    _atomic_write_text(REPORT_PATH, json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({k: report[k] for k in (
        "classification", "live_case_count", "stage_a_completed", "stage_b_completed",
        "arm_n_completed", "false_block_count", "true_block_count", "clear_keep_count",
        "unsafe_keep_count", "omission_true_positive_count", "omission_false_positive_count",
        "structured_completion_count", "structured_completion_denominator",
        "checker_latency_median_ms", "hard_safety_pass", "semantic_pass", "latency_pass",
    )}, sort_keys=True))
    return 2 if execution.stop_reason else 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except Exception as exc:
        print(f"M4 harness stopped before completion: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise
