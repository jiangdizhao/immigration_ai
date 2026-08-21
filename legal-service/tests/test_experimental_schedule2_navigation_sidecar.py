from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path

import pytest

from app.legal_locator.index import LegalLocatorRecord
from app.legal_map_experimental.schedule2_navigation_sidecar import (
    GraphEdge,
    GraphNode,
    NavigationSidecar,
    SourcePage,
    Schedule2NavigationMap,
    SidecarStructureError,
    build_sidecar,
    extract_source,
    normalized_sidecar,
    validate_sidecar,
    write_sidecar,
    _structural_schedule,
)
from app.legal_map_experimental.schedule2_structural_oracle import (
    build_structural_oracle,
    compare_structural_oracle,
)


COMPILATION = "F2026C00667"


def _document(path: Path, sections: list[dict[str, str]]) -> Path:
    payload = {
        "title": f"Migration Regulations 1994 - {path.stem}",
        "document_version": COMPILATION,
        "sections": sections,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def _locator(locator_type: str, provision: str, schedule: str | None = None) -> LegalLocatorRecord:
    return LegalLocatorRecord(
        locator=provision,
        normalized_locator=f"{locator_type}:{provision.lower()}",
        locator_type=locator_type,
        provision_ref=provision,
        schedule_no=schedule,
        document_family="Migration Regulations 1994",
        document_version=COMPILATION,
        compilation_number="288",
        effective_date="2026-07-01",
        volume=1,
        page_start=1,
        page_end=1,
        page_refs=["page_1"],
        heading=provision,
        aliases=[provision],
        source_file="F2026C00667VOL01.pdf",
        source_title="Migration Regulations 1994",
    )


def _source(tmp_path: Path, *, conflicting: bool = False) -> tuple[Path, Path]:
    vol2 = _document(
        tmp_path / "F2026C00667VOL02.json",
        [
            {
                "section_ref": "page_1",
                "heading": "Migration Regulations 1994 i",
                "text": "Contents\nSchedule 2—Provisions\nSubclass 111—Fake contents",
            },
            {
                "section_ref": "page_2",
                "heading": "Provisions with respect to the grant of Subclasses of visas Schedule 2",
                "text": (
                    "Schedule 2—Provisions with respect to the grant of Subclasses of visas\n"
                    "Subclass 111—Synthetic\n111.1—Interpretation\n"
                    "Note: see regulation 1.03 and Schedule 3 criterion 3001.\n"
                    "111.211\nThe applicant must satisfy public interest criterion 4005 and condition 8501.\n"
                    "A Migration Act 1958 section 48 and Legislative Instrument F2026L00001 are explicit."
                ),
            },
            {
                "section_ref": "page_3",
                "heading": "Provisions with respect to the grant of Subclasses of visas Schedule 2",
                "text": (
                    "Schedule 2 Provisions with respect to the grant of Subclasses of visas\n"
                    "111.211\nDuplicate source occurrence.\n"
                    "103.313(2)\nThis wrapped cross-reference is prose, not a heading.\n"
                    "111.212\nThe applicant must comply with subregulation 2.07(5)."
                ),
            },
        ],
    )
    vol3_text = "Schedule 3—Additional criteria\n3001 (1) Synthetic stop marker."
    if conflicting:
        vol3_text = "Schedule 2—Provisions\nSubclass 222—Other\n111.211\nConflicting owner."
    vol3 = _document(
        tmp_path / "F2026C00667VOL03.json",
        [
            {
                "section_ref": "page_1",
                "heading": "Migration Regulations 1994 i",
                "text": "Contents\nSchedule 2—Provisions",
            },
            {
                "section_ref": "page_2",
                "heading": "Provisions with respect to the grant of Subclasses of visas Schedule 2" if conflicting else "Additional criteria applicable to unlawful non-citizens and certain bridging visa holders Schedule 3",
                "text": vol3_text,
            },
        ],
    )
    return vol2, vol3


def test_structural_scope_excludes_contents_and_stops_at_next_schedule(tmp_path: Path) -> None:
    paths = _source(tmp_path)
    report = extract_source(paths)
    assert [page.page_number for page in report.schedule2_pages] == [2, 3]
    assert all("Contents" not in page.text for page in report.schedule2_pages)


def test_provision_ownership_and_duplicate_occurrence_are_preserved(tmp_path: Path) -> None:
    report = extract_source(_source(tmp_path))
    assert [item.provision_ref for item in report.occurrences] == ["111.1", "111.211", "111.211", "111.212"]
    assert report.duplicate_occurrence_count == 1
    assert all(item.provision_ref != "103.313(2)" for item in report.occurrences)
    assert report.owners_by_ref["111.211"] == ("111",)
    assert report.rejected_candidate_reason_counts["parenthesized_reference"] >= 1


def test_generic_suffixes_and_source_order_drive_adjacency(tmp_path: Path) -> None:
    source = _document(
        tmp_path / "F2026C00667VOL02.json",
        [
            {
                "section_ref": "page_1",
                "heading": "Provisions with respect to the grant of Subclasses of visas Schedule 2",
                "text": (
                    "Schedule 2—Provisions\nSubclass 111—Synthetic\n"
                    "111.2\n111.21\n111.211\n111.22\n111.221\n111.3\n"
                    "111.511AA\n111.511A\n"
                ),
            }
        ],
    )
    sidecar = build_sidecar((source,), locator_index_path=None, locator_manifest_path=None)
    assert {node.provision_ref for node in sidecar.nodes if node.node_type == "provision"} >= {
        "111.511AA",
        "111.511A",
    }
    edges = {(edge.source, edge.target) for edge in sidecar.edges if edge.relation == "NEXT_CLAUSE"}
    expected = [("111.2", "111.21"), ("111.21", "111.211"), ("111.211", "111.22"), ("111.22", "111.221"), ("111.221", "111.3"), ("111.3", "111.511AA"), ("111.511AA", "111.511A")]
    assert {("s2x:provision:" + left, "s2x:provision:" + right) for left, right in expected} <= edges


def test_schedule_heading_variants_and_cross_reference_prose() -> None:
    def page(text: str) -> SourcePage:
        return SourcePage("fixture.json", "fixture.json", "hash", 2, 1, "page_1", "", text)

    assert _structural_schedule(page("Schedule 2—Provisions")) == "2"
    assert _structural_schedule(page("Schedule 2 — Provisions")) == "2"
    assert _structural_schedule(page("Schedule 2: Provisions")) == "2"
    assert _structural_schedule(page("Schedule 2 applies to the applicant")) is None
    assert _structural_schedule(page("see Schedule 2 under the Act")) is None

    def metadata_page(heading: str) -> SourcePage:
        return SourcePage("fixture.json", "fixture.json", "hash", 2, 1, "page_1", heading, "ordinary body text")

    assert _structural_schedule(metadata_page("Schedule 2")) == "2"
    assert _structural_schedule(metadata_page("Schedule 2—Provisions")) == "2"
    assert _structural_schedule(metadata_page("Schedule 2 - Provisions")) == "2"
    assert _structural_schedule(metadata_page("Schedule 2: Provisions")) == "2"
    for prose_heading in (
        "  see Schedule 2  ",
        "UNDER SCHEDULE 2",
        "  Schedule 2: applies to the applicant  ",
        "Schedule 2 — applies to the applicant",
        "Schedule 2 - Applies to the applicant",
        "see Schedule 2",
        "under Schedule 2",
        "criteria in Schedule 2",
        "provisions under Schedule 2",
        "Schedule 2 applies to the applicant",
        "reference to Schedule 2",
    ):
        assert _structural_schedule(metadata_page(prose_heading)) is None

    for prose_line in (
        "Schedule 2: applies to the applicant",
        "Schedule 2 — Applies to the applicant",
        "Schedule 2 – APPLIES TO THE APPLICANT",
        "Schedule 2 - applies to the applicant.",
    ):
        assert _structural_schedule(page(prose_line)) is None


def test_schedule_state_resets_between_source_documents(tmp_path: Path) -> None:
    first = _document(
        tmp_path / "F2026C00667VOL02.json",
        [
            {
                "section_ref": "page_1",
                "heading": "Provisions with respect to the grant of Subclasses of visas Schedule 2",
                "text": "Schedule 2—Provisions\nSubclass 111—Synthetic\n111.1\n",
            }
        ],
    )
    second = _document(
        tmp_path / "F2026C00667VOL03.json",
        [
            {"section_ref": "page_1", "heading": "Unlabeled continuation", "text": "111.2\n"},
            {"section_ref": "page_2", "heading": "Additional criteria Schedule 3", "text": "Schedule 3—Additional criteria\n3001"},
        ],
    )
    report = extract_source((first, second))
    assert [item.provision_ref for item in report.occurrences] == ["111.1"]


def test_explicit_references_keep_ambiguity_and_locator_availability(tmp_path: Path) -> None:
    locator_records = [
        _locator("regulation", "1.03"),
        _locator("schedule3_criterion", "3001", "3"),
        _locator("schedule4_pic", "4005", "4"),
        _locator("schedule8_condition", "8501", "8"),
    ]
    sidecar = build_sidecar(_source(tmp_path), locator_records=locator_records, locator_index_path=None, locator_manifest_path=None)
    assert validate_sidecar(sidecar) == []
    nodes = {node.id: node for node in sidecar.nodes}
    assert nodes["s2x:external:REGULATION:1.03"].local_available is True
    assert nodes["s2x:external:SCHEDULE3_CRITERION:3001"].local_available is True
    assert nodes["s2x:external:SCHEDULE4_PIC:4005"].local_available is True
    assert nodes["s2x:external:SCHEDULE8_CONDITION:8501"].local_available is True
    assert nodes["s2x:external:SECTION:48"].ambiguous is True
    assert nodes["s2x:external:INSTRUMENT:F2026L00001"].resolution_status == "unresolved_external"
    assert all(edge.relation not in {"ELIGIBLE_IF", "EXCEPTION_TO"} for edge in sidecar.edges)


def test_conflicting_owner_is_reported_and_rejected(tmp_path: Path) -> None:
    report = extract_source(_source(tmp_path, conflicting=True))
    assert any(anomaly.kind == "prefix_owner_mismatch" for anomaly in report.anomalies)
    assert report.owners_by_ref["111.211"] == ("111", "222")
    with pytest.raises(SidecarStructureError):
        build_sidecar(_source(tmp_path, conflicting=True), locator_index_path=None, locator_manifest_path=None)


def test_deterministic_double_build_serialization_and_queries(tmp_path: Path) -> None:
    locator_records = [_locator("regulation", "1.03")]
    first = build_sidecar(_source(tmp_path), locator_records=locator_records, locator_index_path=None, locator_manifest_path=None)
    second = build_sidecar(tuple(reversed(_source(tmp_path))), locator_records=list(reversed(locator_records)), locator_index_path=None, locator_manifest_path=None)
    assert normalized_sidecar(first) == normalized_sidecar(second)

    first_nodes = tmp_path / "first-nodes.jsonl"
    first_edges = tmp_path / "first-edges.jsonl"
    first_manifest = tmp_path / "first-manifest.json"
    second_nodes = tmp_path / "second-nodes.jsonl"
    second_edges = tmp_path / "second-edges.jsonl"
    second_manifest = tmp_path / "second-manifest.json"
    write_sidecar(first, nodes_path=first_nodes, edges_path=first_edges, manifest_path=first_manifest)
    write_sidecar(second, nodes_path=second_nodes, edges_path=second_edges, manifest_path=second_manifest)
    assert first_nodes.read_bytes() == second_nodes.read_bytes()
    assert first_edges.read_bytes() == second_edges.read_bytes()
    assert first_manifest.read_bytes() == second_manifest.read_bytes()

    legal_map = Schedule2NavigationMap(first)
    assert legal_map.subclass_map("111")["found"] is True
    assert legal_map.provision_context("111.211")["found"] is True
    assert legal_map.follow_references("111.211")["found"] is True


def test_verifier_rejects_dangling_and_forbidden_edges() -> None:
    sidecar = NavigationSidecar(
        nodes=[GraphNode(id="s2x:provision:111.211", node_type="provision", label="111.211", subclass="111", provision_ref="111.211", provenance=[{"source_file": "fixture"}], occurrences=[{"source_file": "fixture"}], occurrence_count=1)],
        edges=[
            GraphEdge(id="bad-dangling", source="s2x:provision:111.211", relation="ELIGIBLE_IF", target="missing"),
        ],
        manifest={"node_count": 1, "edge_count": 1, "canonical_provision_count": 1, "external_locator_count": 0},
    )
    errors = validate_sidecar(sidecar)
    assert any("forbidden or unsupported relation" in error for error in errors)
    assert any("dangling edge target" in error for error in errors)


def test_independent_oracle_matches_complete_tracked_source() -> None:
    from app.legal_map_experimental.schedule2_navigation_sidecar import build_sidecar

    sidecar = build_sidecar()
    oracle = build_structural_oracle()
    comparison = compare_structural_oracle(oracle, sidecar)
    assert "050.511AA" in oracle.metadata_refs
    assert "050.514AA" in oracle.metadata_refs
    assert comparison["missing_from_sidecar"] == []
    assert comparison["extra_in_sidecar"] == []
    assert comparison["ownership_mismatches"] == []
    assert comparison["source_order_mismatches"] == []
    assert comparison["next_clause_mismatches"] == []
    assert comparison["previous_clause_mismatches"] == []
    assert comparison["independence_audit"]["structural_interpretation_shared"] == []


def test_independent_oracle_detects_inventory_ownership_order_and_adjacency_defects() -> None:
    sidecar = build_sidecar()
    oracle = build_structural_oracle()

    missing = deepcopy(sidecar)
    missing.nodes = [node for node in missing.nodes if node.provision_ref != "010.1"]
    assert "010.1" in compare_structural_oracle(oracle, missing)["missing_from_sidecar"]

    misowned = deepcopy(sidecar)
    next(node for node in misowned.nodes if node.provision_ref == "010.1").subclass = "999"
    assert compare_structural_oracle(oracle, misowned)["ownership_mismatches"]

    misordered = deepcopy(sidecar)
    first = next(node for node in misordered.nodes if node.provision_ref == "010.1")
    first.occurrences[0]["source_order"] = 999999
    assert compare_structural_oracle(oracle, misordered)["source_order_mismatches"]

    next_defect = deepcopy(sidecar)
    next_edges = [edge for edge in next_defect.edges if edge.relation == "NEXT_CLAUSE"]
    target = next_edges[1].target
    broken = next_edges[0]
    next_defect.edges.remove(broken)
    next_defect.edges.append(GraphEdge("deliberate-next-defect", broken.source, "NEXT_CLAUSE", target))
    assert compare_structural_oracle(oracle, next_defect)["next_clause_mismatches"]

    previous_defect = deepcopy(sidecar)
    previous_edges = [edge for edge in previous_defect.edges if edge.relation == "PREVIOUS_CLAUSE"]
    target = previous_edges[1].target
    broken = previous_edges[0]
    previous_defect.edges.remove(broken)
    previous_defect.edges.append(GraphEdge("deliberate-previous-defect", broken.source, "PREVIOUS_CLAUSE", target))
    assert compare_structural_oracle(oracle, previous_defect)["previous_clause_mismatches"]


def test_independent_oracle_detects_cross_source_boundary_leakage(tmp_path: Path) -> None:
    first, second = _source(tmp_path)
    sidecar = build_sidecar((first, second), locator_index_path=None, locator_manifest_path=None)
    leaked = deepcopy(sidecar)
    leaked.nodes.append(
        GraphNode(
            id="s2x:provision:111.2",
            node_type="provision",
            label="111.2",
            subclass="111",
            provision_ref="111.2",
            occurrence_count=1,
            occurrences=[{"source_order": 99}],
        )
    )
    comparison = compare_structural_oracle(build_structural_oracle((first, second)), leaked)
    assert "111.2" in comparison["extra_in_sidecar"]


def test_independent_oracle_rejects_punctuated_prose_metadata_scope(tmp_path: Path) -> None:
    source = _document(
        tmp_path / "F2026C00667VOL02.json",
        [
            {
                "section_ref": "page_1",
                "heading": "Schedule 2 — applies to the applicant",
                "text": "111.1\nProse body, not a Schedule heading.",
            }
        ],
    )
    oracle = build_structural_oracle((source,))
    assert oracle.schedule2_pages_processed == 0
    assert oracle.canonical_refs == set()

    falsely_admitted = NavigationSidecar(
        nodes=[
            GraphNode(
                id="s2x:provision:111.1",
                node_type="provision",
                label="111.1",
                subclass="111",
                provision_ref="111.1",
                occurrence_count=1,
                occurrences=[{"source_order": 1}],
            )
        ],
        edges=[],
        manifest={},
    )
    comparison = compare_structural_oracle(oracle, falsely_admitted)
    assert comparison["extra_in_sidecar"] == ["111.1"]
