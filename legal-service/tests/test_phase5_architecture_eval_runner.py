from __future__ import annotations

import csv
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from scripts.run_architecture_eval import (
    _execution_provenance,
    is_stateful_manual_case,
    load_manifest,
    parse_arms,
    select_cases,
    summarize,
    validate_stage_arms,
)


REAL_MANIFEST = Path(__file__).parent / "eval" / "architecture_v2" / "pilot_manifest.json"


def test_phase5_runner_accepts_only_phase5_arms():
    assert parse_arms("luna_web,luna_flat_web") == ["luna_web", "luna_flat_web"]
    with pytest.raises(ValueError, match="supports only"):
        parse_arms("luna_web,luna_lightrag_exact_web")
    with pytest.raises(ValueError, match="supports only"):
        parse_arms("sol_web")


def test_manifest_selection_is_bounded_and_reproducible(tmp_path: Path):
    path = tmp_path / "manifest.json"
    path.write_text(
        json.dumps({
            "scope": "phase5_ab_subset",
            "complete_pilot": False,
            "cases": [
                {"case_id": "a", "question": "Hello"},
                {"case_id": "b", "question": "What is the capital of Australia?"},
                {"case_id": "c", "question": "Explain a legal rule"},
            ],
        }),
        encoding="utf-8",
    )
    manifest = load_manifest(path)
    assert [case["case_id"] for case in select_cases(manifest, limit=2)] == ["a", "b"]
    assert [case["case_id"] for case in select_cases(manifest, case_ids=["c"])] == ["c"]
    with pytest.raises(ValueError, match="unknown case ids"):
        select_cases(manifest, case_ids=["missing"])


def test_manifest_stage_selection_is_reproducible():
    manifest = {
        "cases": [
            {"case_id": "a", "question": "One"},
            {"case_id": "b", "question": "Two"},
            {"case_id": "c", "question": "Three"},
        ],
        "stages": {
            "stage_1": {"case_ids": ["b"]},
            "stage_3": {"selection": "All cases not listed in stage_1"},
        },
    }
    assert [case["case_id"] for case in select_cases(manifest, stage="stage_1")] == ["b"]
    assert [case["case_id"] for case in select_cases(manifest, stage="stage_3")] == ["a", "c"]
    with pytest.raises(ValueError, match="unknown stage"):
        select_cases(manifest, stage="stage_9")


def test_exit_manifest_separates_automated_and_stateful_cases():
    manifest = load_manifest(REAL_MANIFEST)
    stage_1 = select_cases(manifest, stage="stage_1")
    stage_2 = select_cases(manifest, stage="stage_2")
    stage_3 = select_cases(manifest, stage="stage_3")
    stateful_ids = {
        case["case_id"] for case in manifest["cases"] if is_stateful_manual_case(case)
    }
    all_ids = {case["case_id"] for case in manifest["cases"]}
    stage_1_ids = {case["case_id"] for case in stage_1}

    assert len(manifest["cases"]) == 39
    assert len(stage_1) == 8
    assert all(not is_stateful_manual_case(case) for case in stage_1)
    assert {case["case_id"] for case in stage_2} == stage_1_ids
    assert not ({case["case_id"] for case in stage_3} & stage_1_ids)
    assert not ({case["case_id"] for case in stage_3} & stateful_ids)
    assert len(stage_3) == 27
    assert stateful_ids == {
        "p5_followup_ordinal_en",
        "p5_followup_ordinal_zh",
        "p5_followup_correction_en",
        "p5_followup_topic_switch_en",
    }
    assert stage_1_ids | {case["case_id"] for case in stage_3} | stateful_ids == all_ids


def test_stage_to_arm_contract_is_strict():
    validate_stage_arms("stage_1", ["luna_web"])
    validate_stage_arms("stage_2", ["luna_flat_web"])
    validate_stage_arms("stage_3", ["luna_web", "luna_flat_web"])
    with pytest.raises(ValueError, match="stage_1 requires exactly"):
        validate_stage_arms("stage_1", ["luna_web", "luna_flat_web"])
    with pytest.raises(ValueError, match="stage_2 requires exactly"):
        validate_stage_arms("stage_2", ["luna_web"])
    with pytest.raises(ValueError, match="stage_3 requires exactly"):
        validate_stage_arms("stage_3", ["luna_web"])
    validate_stage_arms(None, ["luna_web", "luna_flat_web"])


def test_stage_one_provenance_is_not_a_completed_full_pilot():
    manifest = load_manifest(REAL_MANIFEST)
    provenance = _execution_provenance(
        manifest=manifest,
        cases=select_cases(manifest, stage="stage_1"),
        arms=["luna_web"],
    )
    assert provenance["manifest_defines_complete_pilot_scope"] is True
    assert provenance["selected_case_count"] == 8
    assert provenance["execution_covers_complete_revised_default"] is False
    assert provenance["execution_covers_complete_historical_ab"] is False
    assert provenance["execution_completion_status"] == "partial_or_staged_execution"


def test_stateful_case_ids_are_rejected_from_direct_automated_selection():
    manifest = load_manifest(REAL_MANIFEST)
    with pytest.raises(ValueError, match="stateful_manual"):
        select_cases(manifest, case_ids=["p5_followup_ordinal_en"])


def test_frozen_manifest_dates_are_consistent():
    manifest = load_manifest(REAL_MANIFEST)
    dated_cases = [case for case in manifest["cases"] if case.get("as_of_date")]
    assert {case["as_of_date"] for case in dated_cases} == {"2026-08-20"}
    assert all("As of today" not in case["question"] for case in manifest["cases"])


def test_manual_review_slice_contains_all_stateful_cases_and_fifteen_rows():
    review_path = REAL_MANIFEST.parent / "manual_review_template.csv"
    with review_path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 15
    assert {
        "p5_followup_ordinal_en",
        "p5_followup_ordinal_zh",
        "p5_followup_correction_en",
        "p5_followup_topic_switch_en",
    } <= {row["case_id"] for row in rows}


def test_taxonomy_documents_a9_as_automatic_and_a10_as_adjudicated():
    taxonomy_path = REAL_MANIFEST.parent / "phase5_exit_failure_taxonomy.json"
    taxonomy = json.loads(taxonomy_path.read_text(encoding="utf-8"))
    categories = {item["code"]: item for item in taxonomy["categories"]}
    assert categories["A9"]["automatic"] is True
    assert categories["A10"]["automatic"] is False
    assert "A1-A5 and A9" in taxonomy["classification_policy"]
    assert "A6-A8 and A10-A12" in taxonomy["classification_policy"]


def test_runbook_uses_approved_module_commands_and_frozen_settings():
    runbook = (REAL_MANIFEST.parent / "phase5_exit_runbook.md").read_text(encoding="utf-8")
    assert "export IMMIGRATION_AI_PYTHON=/home/rico/anaconda3/envs/torch/bin/python" in runbook
    assert '"$IMMIGRATION_AI_PYTHON" -m scripts.run_architecture_eval' in runbook
    assert '"$IMMIGRATION_AI_PYTHON" -m scripts.phase5_exit_analysis' in runbook
    assert "export DEFAULT_AGENT_REASONING_EFFORT=low" in runbook
    assert "export AGENT_MAX_FLAT_RAG_CALLS=1" in runbook
    assert "export AGENT_RETRY_VIABILITY_THRESHOLD_MS=8000" in runbook


def test_manifest_rejects_duplicates(tmp_path: Path):
    path = tmp_path / "manifest.json"
    path.write_text(
        json.dumps({
            "cases": [
                {"case_id": "same", "question": "One"},
                {"case_id": "same", "question": "Two"},
            ]
        }),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="duplicate case_id"):
        load_manifest(path)


def test_summary_keeps_a_and_b_metrics_separate():
    rows = [
        {
            "arm": "luna_web",
            "status": "completed",
            "total_duration_ms": 1000,
            "web_search_call_count": 1,
            "flat_rag_call_count": 0,
            "canonical_local_evidence_count": 0,
            "native_web_evidence_count": 2,
        },
        {
            "arm": "luna_flat_web",
            "status": "completed",
            "total_duration_ms": 1200,
            "web_search_call_count": 1,
            "flat_rag_call_count": 1,
            "canonical_local_evidence_count": 3,
            "native_web_evidence_count": 1,
        },
    ]
    summary = summarize(rows)
    assert summary["by_arm"]["luna_web"]["flat_rag_calls"] == 0
    assert summary["by_arm"]["luna_flat_web"]["flat_rag_calls"] == 1
    assert summary["by_arm"]["luna_flat_web"]["canonical_local_evidence"] == 3


def test_arm_b_flat_rag_schema_is_strict_compatible():
    from app.core.config import Settings
    from app.services.agent_policy_service import AgentPolicyService

    settings = Settings(
        DATABASE_URL="postgresql://test",
        OPENAI_API_KEY="test",
        FLAT_RAG_TOOL_ENABLED=True,
    )
    with patch("app.services.agent_policy_service.get_settings", return_value=settings):
        policy = AgentPolicyService().build_policy(mode="default", experiment_arm="B")

    flat_tool = next(tool for tool in policy.tools if tool.get("name") == "flat_rag_search")
    parameters = flat_tool["parameters"]
    assert flat_tool["strict"] is True
    assert set(parameters["required"]) == set(parameters["properties"])
    assert any(item.get("type") == "null" for item in parameters["properties"]["top_k"]["anyOf"])
    assert any(
        item.get("type") == "null"
        for item in parameters["properties"]["preferred_source_types"]["anyOf"]
    )
