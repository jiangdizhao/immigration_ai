from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from app.legal_map_experimental.schedule2_navigation_sidecar import (
    GraphEdge,
    GraphNode,
    NavigationSidecar,
    Schedule2NavigationMap,
)
from app.schemas.tools import Schedule2NavigationBatchRequest, Schedule2NavigationRequest
from app.services.agent_policy_service import SCHEDULE2_NAVIGATION_TOOL
from app.services.request_evidence_registry import create_registry
from app.services.schedule2_navigation_service import Schedule2NavigationService
from app.services.tool_executor_service import ToolCallRequest, ToolExecutorContext, ToolExecutorService


def _provision(ref: str) -> GraphNode:
    return GraphNode(
        id=f"s2x:provision:{ref}",
        node_type="provision",
        label=ref,
        subclass=ref.split(".", 1)[0],
        provision_ref=ref,
    )


def _reverse_map() -> Schedule2NavigationMap:
    sources = [_provision(ref) for ref in ("010.611", "020.611", "030.613", "116.224", "186.223", "186.233")]
    nodes = sources + [
        GraphNode("s2x:subclass:482", "subclass", "Subclass 482", subclass="482", locator="482"),
        GraphNode(
            "s2x:external:VISA_CLASS:EN",
            "external_locator",
            "Class EN",
            locator_type="visa_class",
            provision_ref="EN",
            locator="Class EN",
            local_available=True,
            resolution_status="resolved_local",
        ),
        GraphNode(
            "s2x:external:SCHEDULE_PROVISION:SCHEDULE-1:1114B(3)(D)",
            "external_locator",
            "paragraph 1114B(3)(d) of \nSchedule 1",
            locator_type="schedule_provision",
            provision_ref="1114B(3)(D)",
            locator="paragraph 1114B(3)(d) of \nSchedule 1",
            target_document="Schedule 1",
            local_available=False,
            resolution_status="unresolved_external",
        ),
        GraphNode(
            "s2x:external:SUBCLASS:482",
            "external_locator",
            "Subclass 482",
            locator_type="subclass",
            provision_ref="482",
            locator="Subclass 482",
            local_available=False,
            resolution_status="unresolved_external",
        ),
        GraphNode(
            "s2x:external:SPECIAL_RETURN_CRITERION:5001",
            "external_locator",
            "special return criterion 5001",
            locator_type="special_return_criterion",
            provision_ref="5001",
            locator="special return criterion 5001",
            local_available=False,
            resolution_status="unresolved_external",
        ),
        GraphNode(
            "s2x:schedule2-locator:010.211(4)",
            "schedule2_locator",
            "subclause 010.211(4)",
            provision_ref="010.211(4)",
            locator_type="schedule2_provision",
            locator="subclause 010.211(4)",
            target_document="Schedule 2",
        ),
        _provision("485.232"),
        GraphNode(
            "s2x:external:INSTRUMENT_DEPENDENCY:050.613A-123-638",
            "external_locator",
            "legislative instrument",
            locator_type="instrument_dependency",
            provision_ref="050.613A@123:638",
            locator="legislative instrument",
            local_available=False,
            resolution_status="unresolved_external",
        ),
        GraphNode(
            "s2x:external:VISA_CLASS:ZZ",
            "external_locator",
            "Class ZZ",
            locator_type="visa_class",
            provision_ref="ZZ",
            locator="Class ZZ",
            local_available=False,
            resolution_status="unresolved_external",
        ),
    ]
    edges = [
        GraphEdge("en-010", "s2x:provision:010.611", "REFERENCES_VISA_CLASS", "s2x:external:VISA_CLASS:EN", "Class EN"),
        GraphEdge("en-020", "s2x:provision:020.611", "REFERENCES_VISA_CLASS", "s2x:external:VISA_CLASS:EN", "Class EN"),
        GraphEdge("en-030", "s2x:provision:030.613", "REFERENCES_VISA_CLASS", "s2x:external:VISA_CLASS:EN", "Class EN"),
        GraphEdge("not-reference", "s2x:subclass:482", "CONTAINS", "s2x:external:VISA_CLASS:EN"),
        GraphEdge("external-source", "s2x:external:VISA_CLASS:ZZ", "REFERENCES_VISA_CLASS", "s2x:external:VISA_CLASS:EN", "Class EN"),
        GraphEdge("compound-186", "s2x:provision:186.223", "REFERENCES_SCHEDULE_PROVISION", "s2x:external:SCHEDULE_PROVISION:SCHEDULE-1:1114B(3)(D)", "paragraph 1114B(3)(d) of \nSchedule 1"),
        GraphEdge("compound-186b", "s2x:provision:186.233", "REFERENCES_SCHEDULE_PROVISION", "s2x:external:SCHEDULE_PROVISION:SCHEDULE-1:1114B(3)(D)", "paragraph 1114B(3)(d) of Schedule 1"),
        GraphEdge("subclass-010", "s2x:provision:010.611", "REFERENCES_SUBCLASS", "s2x:external:SUBCLASS:482", "Subclass 482"),
        GraphEdge("criterion-116", "s2x:provision:116.224", "REFERENCES_SPECIAL_RETURN_CRITERION", "s2x:external:SPECIAL_RETURN_CRITERION:5001", "special return criterion 5001"),
        GraphEdge("nested-010", "s2x:provision:010.611", "REFERENCES_SCHEDULE2_PROVISION", "s2x:schedule2-locator:010.211(4)", "subclause 010.211(4)"),
        GraphEdge("structural-485", "s2x:provision:010.611", "REFERENCES_SCHEDULE2_PROVISION", "s2x:provision:485.232", "clause 485.232"),
        GraphEdge("dependency-050", "s2x:provision:050.613A", "REFERENCES_INSTRUMENT_DEPENDENCY", "s2x:external:INSTRUMENT_DEPENDENCY:050.613A-123-638", "legislative instrument"),
    ]
    return Schedule2NavigationMap(NavigationSidecar(nodes=nodes, edges=edges, manifest={}))


def _sources(result: dict[str, object]) -> list[str]:
    return [
        mention["source"]["provision_ref"]
        for target in result["matches"]
        for mention in target["mentions"]
    ]


def test_find_mentions_matches_normalized_identities_and_reference_sources_only() -> None:
    navigation = _reverse_map()

    class_en = navigation.find_mentions("visa_class", "Class EN")
    bare_en = navigation.find_mentions("visa_class", "EN")

    assert class_en["found"] is True
    assert _sources(class_en) == ["010.611", "020.611", "030.613"]
    assert _sources(bare_en) == _sources(class_en)
    assert navigation.find_mentions("visa_class", "EN", max_mentions=2)["matches"][0]["mentions"]
    assert len(_sources(navigation.find_mentions("visa_class", "EN", max_mentions=2))) == 2


def test_find_mentions_supports_compound_subclass_special_return_and_schedule2_targets() -> None:
    navigation = _reverse_map()

    compound = navigation.find_mentions("schedule_provision", "1114B(3)(D)", target_document="schedule 1")
    assert _sources(compound) == ["186.223", "186.233"]
    assert navigation.find_mentions("schedule_provision", "1114B(3)(d)", target_document="Schedule 2")["found"] is False
    assert _sources(navigation.find_mentions("subclass", "Subclass 482")) == ["010.611"]
    assert _sources(navigation.find_mentions("schedule5_special_return_criterion", "5001")) == ["116.224"]
    assert _sources(navigation.find_mentions("schedule2_provision", "010.211(4)")) == ["010.611"]
    assert _sources(navigation.find_mentions("schedule2_provision", "485.232")) == ["010.611"]


def test_find_mentions_is_exact_bounded_and_does_not_fabricate_sources() -> None:
    navigation = _reverse_map()

    assert navigation.find_mentions("visa_class", "E")["found"] is False
    assert navigation.find_mentions("visa_class", "Class UNKNOWN")["matches"] == []
    no_mentions = navigation.find_mentions("visa_class", "ZZ")
    assert no_mentions["found"] is True
    assert no_mentions["matches"] == []

    first = navigation.find_mentions("visa_class", "EN", max_mentions=3)
    second = navigation.find_mentions("visa_class", "EN", max_mentions=3)
    assert first == second
    assert all(
        mention["relation"].startswith("REFERENCES")
        for target in first["matches"]
        for mention in target["mentions"]
    )


def test_request_contract_validates_find_mentions_without_provision_ref() -> None:
    request = Schedule2NavigationRequest(
        operation="find_mentions",
        locator_type="visa_class",
        locator="Class EN",
        target_document=None,
    )
    assert request.provision_ref is None

    for field in ("locator_type", "locator"):
        with pytest.raises(ValidationError):
            Schedule2NavigationRequest(
                operation="find_mentions",
                locator_type=None if field == "locator_type" else "visa_class",
                locator=None if field == "locator" else "Class EN",
            )
    with pytest.raises(ValidationError):
        Schedule2NavigationRequest(operation="provision_context")
    with pytest.raises(ValidationError):
        Schedule2NavigationRequest(operation="follow_references")
    with pytest.raises(ValidationError):
        Schedule2NavigationRequest(operation="subclass_map", unexpected=True)  # type: ignore[call-arg]

    assert Schedule2NavigationBatchRequest(requests=[Schedule2NavigationRequest(operation="subclass_map", subclass="482")])


def test_agent_tool_schema_declares_nullable_required_navigation_properties() -> None:
    item = SCHEDULE2_NAVIGATION_TOOL["parameters"]["properties"]["requests"]["items"]
    expected = {"operation", "subclass", "provision_ref", "locator_type", "locator", "target_document", "max_targets"}
    assert set(item["properties"]) == expected
    assert set(item["required"]) == expected
    assert item["properties"]["operation"]["enum"][-1] == "find_mentions"
    for name in ("subclass", "provision_ref", "locator_type", "locator", "target_document"):
        assert {"string", "null"} == {branch["type"] for branch in item["properties"][name]["anyOf"]}
    assert item["additionalProperties"] is False
    assert "find_mentions" in SCHEDULE2_NAVIGATION_TOOL["description"]
    assert "legal evidence" in SCHEDULE2_NAVIGATION_TOOL["description"]


def test_service_projection_is_navigation_only_safe_and_whitespace_normalized() -> None:
    service = Schedule2NavigationService(_reverse_map())
    request = Schedule2NavigationBatchRequest(
        requests=[Schedule2NavigationRequest(
            operation="find_mentions",
            locator_type="schedule_provision",
            locator="1114B(3)(d)",
            target_document="Schedule 1",
        )]
    )
    result = service.query(request)
    item = result["results"][0]
    mention = item["matches"][0]["mentions"][0]
    target = item["matches"][0]["target"]

    assert result["navigation_only"] is True
    assert result["evidence_refs"] == []
    assert mention["surface_form"] == "paragraph 1114B(3)(d) of Schedule 1"
    assert target["label"] == "paragraph 1114B(3)(d) of Schedule 1"
    assert "occurrences" not in target and "provenance" not in target
    assert "local_available" not in target
    assert target["locator_index_available"] is False
    assert target["locator_resolution_status"] == "unresolved_in_locator_index"

    raw = _reverse_map().find_mentions("schedule_provision", "1114B(3)(d)", target_document="Schedule 1")
    assert raw["matches"][0]["node"]["label"] == "paragraph 1114B(3)(d) of \nSchedule 1"
    assert raw["matches"][0]["mentions"][0]["surface_form"] == "paragraph 1114B(3)(d) of \nSchedule 1"


def test_tool_executor_counts_find_mentions_target_groups() -> None:
    context = ToolExecutorContext(
        request_id="m3-request",
        registry=create_registry("m3-request"),
        as_of_date=date(2026, 8, 30),
        schedule2_navigation_map=_reverse_map(),
    )
    result = ToolExecutorService().execute_tool(
        ToolCallRequest(
            call_id="m3-navigation",
            name="schedule2_navigation",
            arguments={
                "requests": [{
                    "operation": "find_mentions",
                    "subclass": None,
                    "provision_ref": None,
                    "locator_type": "visa_class",
                    "locator": "Class EN",
                    "target_document": None,
                    "max_targets": 2,
                }],
            },
        ),
        context,
    )
    assert result.result.status == "ok"
    assert context.schedule2_navigation_target_count == 1


@pytest.mark.parametrize(
    ("status", "locator_type", "expected"),
    (
        ("resolved_local", "regulation", "resolved_in_locator_index"),
        ("unresolved_external", "regulation", "unresolved_in_locator_index"),
        ("ambiguous", "regulation", "ambiguous"),
        ("unresolved_external", "instrument_dependency", "unresolved_dependency"),
    ),
)
def test_service_node_summary_maps_resolution_semantics(status: str, locator_type: str, expected: str) -> None:
    node = GraphNode(
        "node",
        "external_locator",
        "target",
        locator_type=locator_type,
        provision_ref="1",
        locator="target",
        local_available=False,
        resolution_status=status,
    )
    summary = Schedule2NavigationService._node_summary(node.to_dict())
    assert summary["locator_resolution_status"] == expected
    assert summary["locator_index_available"] is False
    assert "local_available" not in summary
