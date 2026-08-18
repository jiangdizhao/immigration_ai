from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from scripts.run_architecture_eval import load_manifest, parse_arms, select_cases, summarize


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
