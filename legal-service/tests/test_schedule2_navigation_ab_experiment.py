from __future__ import annotations

import json
from pathlib import Path

from experiments.schedule2_navigation_ab.run_schedule2_navigation_ab import (
    FORBIDDEN_HINT_TERMS,
    SHARED_RESEARCH_CONFIGURATION,
    base_record,
    load_cases,
    navigation_hints,
    render_hint_text,
)
from app.legal_map_experimental.schedule2_navigation_sidecar import (
    DEFAULT_EDGES_PATH,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_NODES_PATH,
    load_sidecar,
)


ROOT = Path(__file__).resolve().parents[1]
CASE_PATH = ROOT / "experiments" / "schedule2_navigation_ab" / "cases.json"


def test_case_set_is_small_and_explicit() -> None:
    cases = load_cases(CASE_PATH)
    assert 12 <= len(cases) <= 20
    assert all(case["starting_subclass"] and case["starting_provision"] for case in cases)


def test_baseline_has_no_hints_and_navigation_has_only_explicit_relationships() -> None:
    sidecar = load_sidecar(
        nodes_path=DEFAULT_NODES_PATH,
        edges_path=DEFAULT_EDGES_PATH,
        manifest_path=DEFAULT_MANIFEST_PATH,
    )
    cases = load_cases(CASE_PATH)
    for case in cases:
        hints = navigation_hints(
            sidecar,
            subclass=case["starting_subclass"],
            provision=case["starting_provision"],
        )
        assert all(item["relation"].startswith("REFERENCES") for item in hints)
        assert "Schedule-2 navigation hints:" in render_hint_text(hints)
        lowered = render_hint_text(hints).casefold()
        assert not any(term in lowered for term in FORBIDDEN_HINT_TERMS)


def test_hint_text_explicitly_excludes_evidence_and_legal_conclusions() -> None:
    sidecar = load_sidecar(
        nodes_path=DEFAULT_NODES_PATH,
        edges_path=DEFAULT_EDGES_PATH,
        manifest_path=DEFAULT_MANIFEST_PATH,
    )
    hints = navigation_hints(sidecar, subclass="010", provision="010.1")
    text = render_hint_text(hints).casefold()
    assert "navigation metadata only" in text
    assert "not legal evidence" in text
    assert "eligible" not in text
    assert "requirement satisfied" not in text


def test_arm_records_keep_baseline_hint_free_and_share_configuration() -> None:
    case = load_cases(CASE_PATH)[0]
    sidecar = load_sidecar(
        nodes_path=DEFAULT_NODES_PATH,
        edges_path=DEFAULT_EDGES_PATH,
        manifest_path=DEFAULT_MANIFEST_PATH,
    )
    hints = navigation_hints(
        sidecar,
        subclass=case["starting_subclass"],
        provision=case["starting_provision"],
    )
    baseline = base_record(case, "baseline", hints, mode="offline")
    navigation = base_record(case, "navigation", hints, mode="offline")

    assert baseline["navigation_hints_used"] == []
    assert baseline["navigation_prompt_appendix"] is None
    assert navigation["navigation_hints_used"] == hints
    assert navigation["navigation_prompt_appendix"]
    assert baseline["research_configuration"] == SHARED_RESEARCH_CONFIGURATION
    assert navigation["research_configuration"] == SHARED_RESEARCH_CONFIGURATION
    assert baseline["evidence_source_information"]["sources_exposed"] == []
    assert navigation["evidence_source_information"]["graph_data_is_not_evidence"] is True


def test_case_fixture_is_machine_readable() -> None:
    payload = json.loads(CASE_PATH.read_text(encoding="utf-8"))
    assert payload["schema_version"] == "schedule2_navigation_ab.cases.v1"
