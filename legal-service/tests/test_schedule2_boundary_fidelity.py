from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.legal_locator.index import LegalLocatorRecord
from app.legal_map_experimental.schedule2_navigation_sidecar import (
    _extract_references,
    build_sidecar,
    normalized_sidecar,
    validate_sidecar,
)


def _references(text: str):
    return _extract_references(text)


def _regulation_locator(provision: str) -> LegalLocatorRecord:
    return LegalLocatorRecord(
        locator=provision,
        normalized_locator=f"regulation:{provision.lower()}",
        locator_type="regulation",
        provision_ref=provision,
        schedule_no=None,
        document_family="Migration Regulations 1994",
        document_version="F2026C00667",
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


def _schedule2_source(tmp_path: Path, body: str) -> Path:
    source = tmp_path / "F2026C00667VOL02.json"
    source.write_text(
        json.dumps(
            {
                "document_version": "F2026C00667",
                "sections": [
                    {
                        "section_ref": "page_1",
                        "heading": "Provisions with respect to the grant of Subclasses of visas Schedule 2",
                        "text": body,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return source


def _build_fixture(tmp_path: Path, body: str):
    return build_sidecar(
        (_schedule2_source(tmp_path, body),),
        locator_index_path=None,
        locator_manifest_path=None,
    )


@pytest.mark.parametrize(
    ("text", "provision", "target"),
    (
        ("paragraph 1114B(3)(d) of Schedule 1", "1114B(3)(d)", "Schedule 1"),
        ("paragraph 1306(3)(d) of Schedule 1", "1306(3)(d)", "Schedule 1"),
        ("subitem 1229(4) of Schedule 1", "1229(4)", "Schedule 1"),
        ("item 6D101 of Schedule 6D", "6D101", "Schedule 6D"),
    ),
)
def test_compound_schedule_locator_is_one_specific_reference(text: str, provision: str, target: str) -> None:
    references = _references(text)

    assert len(references) == 1
    reference = references[0]
    assert reference.locator_type == "schedule_provision"
    assert reference.provision_ref == provision.upper()
    assert reference.target_document == target
    assert reference.surface_form == text


def test_compound_schedule_locator_builds_specific_edge_without_generic_overlap(tmp_path: Path) -> None:
    source = tmp_path / "F2026C00667VOL02.json"
    source.write_text(
        json.dumps(
            {
                "document_version": "F2026C00667",
                "sections": [
                    {
                        "section_ref": "page_1",
                        "heading": "Provisions with respect to the grant of Subclasses of visas Schedule 2",
                        "text": (
                            "Schedule 2—Provisions\n"
                            "Subclass 111—Synthetic\n"
                            "111.1—Interpretation\n"
                            "See paragraph 1114B(3)(d) of Schedule 1."
                        ),
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    sidecar = build_sidecar(
        (source,),
        locator_index_path=None,
        locator_manifest_path=None,
    )
    targets = [
        edge
        for edge in sidecar.edges
        if edge.source == "s2x:provision:111.1" and edge.relation.startswith("REFERENCES")
    ]

    assert [(edge.relation, edge.target) for edge in targets] == [
        (
            "REFERENCES_SCHEDULE_PROVISION",
            "s2x:external:SCHEDULE_PROVISION:SCHEDULE-1:1114B(3)(D)",
        )
    ]
    target_node = next(node for node in sidecar.nodes if node.id == targets[0].target)
    assert target_node.provision_ref == "1114B(3)(D)"
    assert target_node.target_document == "Schedule 1"


@pytest.mark.parametrize(
    "text, expected",
    (
        ("subregulation 2.21A(1)", "2.21A(1)"),
        ("subregulation 2.20B(2)", "2.20B(2)"),
        ("subregulation 2.20(14)", "2.20(14)"),
        ("subsection 140(1)", "140(1)"),
    ),
)
def test_nested_regulation_and_act_locators_retain_complete_reference(text: str, expected: str) -> None:
    references = _references(text)

    assert len(references) == 1
    assert references[0].provision_ref == expected


@pytest.mark.parametrize(
    "text",
    (
        "subregulation 2.21A(1),",
        "subregulation 2.21A(1);",
        "subregulation 2.21A(1):",
        "subregulation 2.21A(1).",
        "subregulation 2.21A(1))",
        "subregulation 2.21A(1)",
    ),
)
def test_nested_locator_terminates_at_punctuation_or_end(text: str) -> None:
    references = _references(text)

    assert len(references) == 1
    assert references[0].provision_ref == "2.21A(1)"


def test_existing_typed_references_still_extract() -> None:
    references = _references(
        "public interest criterion 4007; condition 8107; regulation 1.03; "
        "section 137J; section 48A"
    )

    assert {(reference.locator_type, reference.provision_ref) for reference in references} >= {
        ("schedule4_pic", "4007"),
        ("schedule8_condition", "8107"),
        ("regulation", "1.03"),
        ("section", "137J"),
        ("section", "48A"),
    }


def test_nested_locator_availability_uses_parent_without_changing_graph_identity(tmp_path: Path) -> None:
    source = tmp_path / "F2026C00667VOL02.json"
    source.write_text(
        json.dumps(
            {
                "document_version": "F2026C00667",
                "sections": [
                    {
                        "section_ref": "page_1",
                        "heading": "Provisions with respect to the grant of Subclasses of visas Schedule 2",
                        "text": (
                            "Schedule 2—Provisions\n"
                            "Subclass 111—Synthetic\n"
                            "111.1—Interpretation\n"
                            "See subregulation 2.21A(1)."
                        ),
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    sidecar = build_sidecar(
        (source,),
        locator_records=[_regulation_locator("2.21A")],
        locator_index_path=None,
        locator_manifest_path=None,
    )
    target = next(node for node in sidecar.nodes if node.node_type == "external_locator")

    assert target.provision_ref == "2.21A(1)"
    assert target.local_available is True
    assert target.resolution_status == "resolved_local"


def test_internal_schedule2_references_resolve_direct_and_nested_targets(tmp_path: Path) -> None:
    sidecar = _build_fixture(
        tmp_path,
        "\n".join(
            (
                "Schedule 2—Provisions",
                "Subclass 010—Bridging A",
                "010.211—Base provision",
                "010.611—References",
                "The applicant meets the requirements of subclause 010.211(4) and see clause 485.232.",
                "Subclass 485—Skilled",
                "485.232—Target provision",
            )
        ),
    )
    assert validate_sidecar(sidecar) == []

    edges = [edge for edge in sidecar.edges if edge.source == "s2x:provision:010.611"]
    nested = next(edge for edge in edges if edge.target == "s2x:schedule2-locator:010.211(4)")
    direct = next(edge for edge in edges if edge.target == "s2x:provision:485.232")

    assert nested.relation == "REFERENCES_SCHEDULE2_PROVISION"
    assert direct.relation == "REFERENCES_SCHEDULE2_PROVISION"
    assert nested.surface_form == "subclause 010.211(4)"
    assert direct.surface_form == "clause 485.232"
    locator = next(node for node in sidecar.nodes if node.id == nested.target)
    assert locator.node_type == "schedule2_locator"
    assert locator.locator_type == "schedule2_provision"
    assert locator.provision_ref == "010.211(4)"
    assert locator.target_document == "Schedule 2"
    assert not any(
        node.node_type == "external_locator" and node.provision_ref == "485.232"
        for node in sidecar.nodes
    )


def test_structural_clause_and_subclass_headings_are_not_references() -> None:
    references = _references(
        "Clause 010.211\n"
        "Subclass 010\n"
        "Subclass 010—Bridging A\n"
        "a person who holds a Subclass 020 visa"
    )

    assert [(item.locator_type, item.provision_ref) for item in references] == [
        ("subclass", "020")
    ]


def test_subclass_references_link_current_and_retain_unresolved_targets(tmp_path: Path) -> None:
    sidecar = _build_fixture(
        tmp_path,
        "\n".join(
            (
                "Schedule 2—Provisions",
                "Subclass 010—Bridging A",
                "010.611—References",
                "A person holds a Subclass 482 visa and a Subclass 457 visa.",
                "Subclass 482—Skills",
                "482.211—Target provision",
            )
        ),
    )
    edges = [edge for edge in sidecar.edges if edge.source == "s2x:provision:010.611"]

    assert ("REFERENCES_SUBCLASS", "s2x:subclass:482") in {
        (edge.relation, edge.target) for edge in edges
    }
    unresolved = next(edge for edge in edges if edge.relation == "REFERENCES_SUBCLASS" and "SUBCLASS:457" in edge.target)
    assert unresolved.target == "s2x:external:SUBCLASS:457"
    assert not any(node.id == "s2x:external:SUBCLASS:482" for node in sidecar.nodes)
    assert next(node for node in sidecar.nodes if node.id == unresolved.target).target_document == "Schedule 2"


def test_visa_class_references_require_uppercase_class_code() -> None:
    references = _references("Class EN; Class WA; Class WB; class of persons; class is")

    assert [(item.locator_type, item.provision_ref) for item in references] == [
        ("visa_class", "EN"),
        ("visa_class", "WA"),
        ("visa_class", "WB"),
    ]
    assert all(item.target_document == "Migration Regulations 1994 — Schedule 1" for item in references)


@pytest.mark.parametrize(
    "text, expected",
    (
        ("special return criterion 5001", ["5001"]),
        ("special return criterion 5010", ["5010"]),
        ("special return criteria 5001, 5002 and 5010", ["5001", "5002", "5010"]),
    ),
)
def test_special_return_criteria_are_explicitly_typed(text: str, expected: list[str]) -> None:
    references = [item for item in _references(text) if item.locator_type == "special_return_criterion"]

    assert [item.provision_ref for item in references] == expected
    assert all(item.target_document == "Schedule 5" for item in references)


def test_named_instrument_wins_and_unnamed_dependencies_are_source_scoped(tmp_path: Path) -> None:
    named = _references("legislative instrument F2026L00001")
    assert [(item.locator_type, item.provision_ref) for item in named] == [
        ("instrument", "F2026L00001")
    ]
    assert not any(item.locator_type == "instrument_dependency" for item in named)

    body = "\n".join(
        (
            "Schedule 2—Provisions",
            "Subclass 050—Bridging",
            "050.613A—First",
            "specified by a legislative instrument and another legislative instrument",
            "050.613B—Second",
            "specified by legislative instrument made for this paragraph",
        )
    )
    first = _build_fixture(tmp_path, body)
    second = _build_fixture(tmp_path, body)
    assert normalized_sidecar(first) == normalized_sidecar(second)

    dependencies = [node for node in first.nodes if node.locator_type == "instrument_dependency"]
    assert len(dependencies) == 3
    assert len({node.id for node in dependencies}) == 3
    assert sum("050.613A@" in node.provision_ref for node in dependencies) == 2
    assert sum("050.613B@" in node.provision_ref for node in dependencies) == 1
    assert all(node.id.startswith("s2x:instrument-dependency:") for node in dependencies)
    assert not any(
        edge.relation == "REFERENCES_INSTRUMENT_DEPENDENCY"
        and edge.surface_form == "legislative instrument F2026L00001"
        for edge in first.edges
    )


def test_internal_reference_without_structural_base_remains_generic() -> None:
    references = _references("see subclause 999.999(1)")

    assert [(item.locator_type, item.provision_ref) for item in references] == [
        ("subclause", "999.999(1)")
    ]
