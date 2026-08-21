from __future__ import annotations

from pathlib import Path

from app.legal_locator.index import LegalLocatorRecord
from app.legal_map.schedule2_graph import (
    GraphEdge,
    Schedule2Graph,
    Schedule2LegalMap,
    build_schedule2_graph,
    load_graph,
    validate_graph,
    write_graph,
)
from app.schedule.schemas import ScheduleClause


COMPILATION = "F2026C00667"
CLAUSE_485_212_TEXT = (
    "See regulation 1.15F and Schedule 3 criterion 3001. "
    "Schedule 3 also applies. Section 48 of the Act may be relevant."
)


def _row(
    ref: str,
    *,
    subclass: str,
    text: str,
    start: int,
    source_file: str = "F2026C00667VOL02.pdf",
) -> ScheduleClause:
    return ScheduleClause(
        schedule_no="2",
        subclass=subclass,
        title=f"Test subclass {subclass}",
        clause_ref=ref,
        heading=f"Heading {ref}",
        section_kind="primary_criteria",
        text=text,
        source_file=source_file,
        source_title=f"Migration Regulations 1994 {COMPILATION}",
        start_index=start,
        end_index=start + len(text),
    )


def _locator(locator_type: str, provision: str, schedule: str | None) -> LegalLocatorRecord:
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
        volume=3 if schedule else 1,
        page_start=1,
        page_end=1,
        page_refs=["page_1"],
        heading=provision,
        aliases=[provision],
        source_file=f"{COMPILATION}VOL03.pdf" if schedule else f"{COMPILATION}VOL01.pdf",
        source_title="Migration Regulations 1994",
    )


def _fixture_rows() -> list[ScheduleClause]:
    return [
        _row(
            "485.211",
            subclass="485",
            text="The applicant must satisfy Public Interest Criterion 4005 and condition 8501.",
            start=10,
        ),
        _row(
            "485.211",
            subclass="485",
            text="The applicant must satisfy PIC 4005 and visa condition 8501.",
            start=20,
            source_file="F2026C00667VOL03.pdf",
        ),
        _row(
            "485.212",
            subclass="485",
            text=CLAUSE_485_212_TEXT,
            start=30,
        ),
        _row(
            "500.211",
            subclass="500",
            text="See Instrument F2026L00001.",
            start=40,
        ),
    ]


def _fixture_locators() -> list[LegalLocatorRecord]:
    return [
        _locator("regulation", "1.15F", None),
        _locator("schedule3_criterion", "3001", "3"),
        _locator("schedule4_pic", "4005", "4"),
        _locator("schedule8_condition", "8501", "8"),
    ]


def _fixture_graph() -> Schedule2Graph:
    return build_schedule2_graph(
        _fixture_rows(),
        locator_records=_fixture_locators(),
        compilation_number=COMPILATION,
    )


def test_build_collapses_duplicate_clause_occurrences_without_losing_provenance() -> None:
    graph = _fixture_graph()
    clause_nodes = [node for node in graph.nodes if node.node_type == "clause"]
    assert graph.manifest["input_rows"] == 4
    assert graph.manifest["unique_clause_refs"] == 3
    assert len(clause_nodes) == 3

    clause = next(node for node in clause_nodes if node.provision_ref == "485.211")
    assert clause.occurrence_count == 2
    assert len(clause.occurrences) == 2
    assert all("text_sha256" in occurrence for occurrence in clause.occurrences)
    assert "text" not in clause.to_dict()


def test_graph_uses_only_navigation_relations_and_resolves_local_locator_availability() -> None:
    graph = _fixture_graph()
    assert validate_graph(graph, expected_unique_clause_refs=3) == []

    relations = {edge.relation for edge in graph.edges}
    assert "CONTAINS" in relations
    assert "REFERENCES_PIC" in relations
    assert "REFERENCES_CONDITION" in relations
    assert "REFERENCES_REGULATION" in relations
    assert "REFERENCES_SCHEDULE3_CRITERION" in relations
    assert "REFERENCES_SCHEDULE" in relations
    assert "REFERENCES_ACT" in relations
    assert "REFERENCES_INSTRUMENT" in relations
    assert "ELIGIBLE_IF" not in relations
    assert "EXCEPTION_TO" not in relations

    by_id = {node.id: node for node in graph.nodes}
    assert by_id["external:schedule4-pic:4005"].local_available is True
    assert by_id["external:schedule8-condition:8501"].local_available is True
    assert by_id["external:regulation:1.15F"].local_available is True
    assert by_id["external:schedule3-criterion:3001"].local_available is True
    assert by_id["external:schedule:3"].local_available is True
    assert by_id["external:instrument:F2026L00001"].local_available is False


def test_graph_build_is_deterministic_across_input_and_locator_order() -> None:
    first = _fixture_graph()
    second = build_schedule2_graph(
        list(reversed(_fixture_rows())),
        locator_records=list(reversed(_fixture_locators())),
        compilation_number=COMPILATION,
    )

    assert [node.to_dict() for node in first.nodes] == [node.to_dict() for node in second.nodes]
    assert [edge.to_dict() for edge in first.edges] == [edge.to_dict() for edge in second.edges]
    assert first.manifest == second.manifest


def test_write_load_and_read_only_queries(tmp_path: Path) -> None:
    graph = _fixture_graph()
    nodes = tmp_path / "nodes.jsonl"
    edges = tmp_path / "edges.jsonl"
    manifest = tmp_path / "manifest.json"
    write_graph(graph, nodes_path=nodes, edges_path=edges, manifest_path=manifest)
    loaded = load_graph(nodes_path=nodes, edges_path=edges, manifest_path=manifest)
    assert [node.to_dict() for node in loaded.nodes] == [node.to_dict() for node in graph.nodes]
    assert [edge.to_dict() for edge in loaded.edges] == [edge.to_dict() for edge in graph.edges]
    assert loaded.manifest == graph.manifest

    legal_map = Schedule2LegalMap(loaded)
    subclass_map = legal_map.subclass_map("485")
    assert subclass_map["found"] is True
    assert {node.get("provision_ref") for node in subclass_map["nodes"]} >= {"485.211", "485.212"}

    context = legal_map.provision_context("485.211")
    assert context["found"] is True
    references = legal_map.follow_references("485.211")
    assert references["found"] is True
    assert {target["relation"] for target in references["targets"]} >= {
        "REFERENCES_PIC",
        "REFERENCES_CONDITION",
    }


def test_validator_rejects_dangling_edge() -> None:
    graph = _fixture_graph()
    graph.edges.append(
        GraphEdge(
            id="edge:dangling",
            source="s2:clause:485.211",
            relation="REFERENCES",
            target="external:missing:X",
        )
    )
    graph.manifest["edge_count"] += 1
    errors = validate_graph(graph, expected_unique_clause_refs=3)
    assert any("dangling edge target" in error for error in errors)
