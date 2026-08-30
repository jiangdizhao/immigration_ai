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
        if request.operation == "follow_references":
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
                    "surface_form": self._display_text(item.get("surface_form")),
                })
            return {
                "operation": request.operation,
                "provision_ref": str(raw.get("provision_ref", request.provision_ref or "")),
                "found": bool(raw.get("found")),
                "targets": targets,
                "navigation_only": True,
            }
        if request.operation == "find_mentions":
            raw = self._map.find_mentions(
                request.locator_type or "",
                request.locator or "",
                target_document=request.target_document,
                max_mentions=request.max_targets,
            )
            matches = []
            for item in raw.get("matches", []):
                if not isinstance(item, dict) or not isinstance(item.get("node"), dict):
                    continue
                mentions = []
                for mention in item.get("mentions", []):
                    if not isinstance(mention, dict) or not isinstance(mention.get("source"), dict):
                        continue
                    relation = str(mention.get("relation", ""))
                    if relation not in ALLOWED_RELATIONS:
                        continue
                    mentions.append({
                        "source": self._node_summary(mention["source"]),
                        "relation": relation,
                        "surface_form": self._display_text(mention.get("surface_form")),
                    })
                if mentions:
                    matches.append({
                        "target": self._node_summary(item["node"]),
                        "mentions": mentions,
                    })
            return {
                "operation": request.operation,
                "query": {
                    "locator_type": request.locator_type,
                    "locator": self._display_text(request.locator),
                    "target_document": request.target_document,
                },
                "found": bool(raw.get("found")),
                "matches": matches,
                "navigation_only": True,
            }
        raise ValueError(f"unsupported Schedule-2 navigation operation: {request.operation}")

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
                "surface_form": self._display_text(edge.get("surface_form")),
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
    def _display_text(value: object) -> str | None:
        if value is None:
            return None
        return " ".join(str(value).split()).strip()

    @classmethod
    def _node_summary(cls, node: dict[str, Any]) -> dict[str, Any]:
        # Do not pass through occurrences/provenance: those are graph
        # metadata, not source evidence and are unnecessary for navigation.
        keys = (
            "id", "node_type", "label", "subclass", "provision_ref", "locator_type",
            "locator", "target_document", "ambiguous", "title",
        )
        summary = {}
        for key in keys:
            if key not in node:
                continue
            value = node[key]
            if key in {"label", "locator"}:
                value = cls._display_text(value)
            summary[key] = value
        if "local_available" in node:
            summary["locator_index_available"] = node["local_available"]
        if "resolution_status" in node:
            status = str(node["resolution_status"])
            if node.get("locator_type") == "instrument_dependency" and status in {
                "unresolved_external", "unresolved", "unresolved_dependency",
            }:
                status = "unresolved_dependency"
            else:
                status = {
                    "resolved_local": "resolved_in_locator_index",
                    "unresolved_external": "unresolved_in_locator_index",
                    "unresolved": "unresolved_in_locator_index",
                    "ambiguous": "ambiguous",
                }.get(status, status)
            summary["locator_resolution_status"] = status
        return summary


def create_schedule2_navigation_service(
    navigation_map: Schedule2NavigationMap,
) -> Schedule2NavigationService:
    return Schedule2NavigationService(navigation_map)
