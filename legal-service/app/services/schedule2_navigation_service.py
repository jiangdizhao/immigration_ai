"""Thin, evidence-free adapter for the experimental Schedule-2 sidecar.

The sidecar is a derived navigation artifact.  This adapter deliberately
projects only structural edges and target-resolution metadata; it never
registers evidence and never exposes graph provenance as legal authority.
"""

from __future__ import annotations

from typing import Any

from app.legal_map_experimental.schedule2_navigation_sidecar import (
    ALLOWED_RELATIONS,
    Schedule2NavigationMap,
)
from app.schemas.tools import Schedule2NavigationBatchRequest, Schedule2NavigationRequest


class Schedule2NavigationService:
    """Bounded read-only facade used only by experimental Arm N."""

    def __init__(self, navigation_map: Schedule2NavigationMap) -> None:
        self._map = navigation_map

    def query(self, request: Schedule2NavigationBatchRequest) -> dict[str, Any]:
        results = [self._query_one(item) for item in request.requests]
        return {
            "navigation_only": True,
            "evidence_refs": [],
            "results": results,
        }

    def _query_one(self, request: Schedule2NavigationRequest) -> dict[str, Any]:
        if request.operation == "subclass_map":
            raw = self._map.subclass_map(
                request.subclass or "",
                max_provisions=request.max_targets,
                max_references=request.max_targets,
            )
            return self._edge_result(request, raw)
        if request.operation == "provision_context":
            raw = self._map.provision_context(
                request.provision_ref or "",
                max_edges=request.max_targets,
            )
            return self._edge_result(request, raw)
        raw = self._map.follow_references(
            request.provision_ref or "",
            max_targets=request.max_targets,
        )
        targets = []
        for item in raw.get("targets", []):
            if not isinstance(item, dict) or not isinstance(item.get("node"), dict):
                continue
            relation = str(item.get("relation", ""))
            if relation not in ALLOWED_RELATIONS:
                continue
            target = item["node"]
            targets.append({
                "source": self._source_summary(request.provision_ref or ""),
                "relation": relation,
                "target": self._node_summary(target),
                "surface_form": item.get("surface_form"),
            })
        return {
            "operation": request.operation,
            "provision_ref": str(raw.get("provision_ref", request.provision_ref or "")),
            "found": bool(raw.get("found")),
            "targets": targets,
            "navigation_only": True,
        }

    def _edge_result(self, request: Schedule2NavigationRequest, raw: dict[str, Any]) -> dict[str, Any]:
        nodes = {
            str(node.get("id")): node
            for node in raw.get("nodes", [])
            if isinstance(node, dict) and node.get("id")
        }
        edges = []
        for edge in raw.get("edges", []):
            if not isinstance(edge, dict):
                continue
            relation = str(edge.get("relation", ""))
            if relation not in ALLOWED_RELATIONS:
                continue
            source = nodes.get(str(edge.get("source")), {"id": edge.get("source")})
            target = nodes.get(str(edge.get("target")), {"id": edge.get("target")})
            edges.append({
                "source": self._node_summary(source),
                "relation": relation,
                "target": self._node_summary(target),
                "surface_form": edge.get("surface_form"),
            })
        edges.sort(key=lambda item: (
            str(item["source"].get("locator", "")),
            str(item["relation"]),
            str(item["target"].get("locator", "")),
        ))
        result: dict[str, Any] = {
            "operation": request.operation,
            "found": bool(raw.get("found")),
            "edges": edges,
            "navigation_only": True,
        }
        if request.operation == "subclass_map":
            result["subclass"] = str(raw.get("subclass", request.subclass or ""))
        else:
            result["provision_ref"] = str(raw.get("provision_ref", request.provision_ref or ""))
        return result

    @staticmethod
    def _source_summary(provision_ref: str) -> dict[str, Any]:
        return {
            "node_type": "provision",
            "locator": provision_ref.strip().upper(),
            "provision_ref": provision_ref.strip().upper(),
        }

    @staticmethod
    def _node_summary(node: dict[str, Any]) -> dict[str, Any]:
        # Do not pass through occurrences/provenance: those are graph
        # metadata, not source evidence and are unnecessary for navigation.
        keys = (
            "id", "node_type", "label", "subclass", "provision_ref", "locator_type",
            "locator", "target_document", "local_available", "resolution_status", "ambiguous",
        )
        return {key: node[key] for key in keys if key in node}


def create_schedule2_navigation_service(
    navigation_map: Schedule2NavigationMap,
) -> Schedule2NavigationService:
    return Schedule2NavigationService(navigation_map)
