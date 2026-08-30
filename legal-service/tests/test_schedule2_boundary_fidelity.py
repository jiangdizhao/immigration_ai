from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.legal_locator.index import LegalLocatorRecord
from app.legal_map_experimental.schedule2_navigation_sidecar import (
    _extract_references,
    build_sidecar,
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
