#!/usr/bin/env python3
"""Verify the persisted Schedule 2 navigation graph deterministically."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.legal_locator.index import DEFAULT_INDEX_PATH as DEFAULT_LOCATOR_INDEX_PATH
from app.legal_map.schedule2_graph import (
    DEFAULT_EDGES_PATH,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_NODES_PATH,
    build_schedule2_graph_from_files,
    load_graph,
    validate_graph,
)
from app.schedule.schedule2_index_service import SCHEDULE2_INDEX_PATH


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--schedule2-index", type=Path, default=SCHEDULE2_INDEX_PATH)
    parser.add_argument("--locator-index", type=Path, default=DEFAULT_LOCATOR_INDEX_PATH)
    parser.add_argument("--nodes", type=Path, default=DEFAULT_NODES_PATH)
    parser.add_argument("--edges", type=Path, default=DEFAULT_EDGES_PATH)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    parser.add_argument("--compilation", default="F2026C00667")
    parser.add_argument("--expected-unique-refs", type=int, default=2385)
    return parser.parse_args()


def _normalized_nodes(graph) -> list[dict]:
    return [node.to_dict() for node in graph.nodes]


def _normalized_edges(graph) -> list[dict]:
    return [edge.to_dict() for edge in graph.edges]


def main() -> int:
    args = parse_args()
    required = [
        args.schedule2_index,
        args.locator_index,
        args.nodes,
        args.edges,
        args.manifest,
    ]
    missing = [str(path) for path in required if not path.exists() or path.stat().st_size == 0]
    if missing:
        raise SystemExit("missing or empty required files: " + ", ".join(missing))

    actual = load_graph(
        nodes_path=args.nodes,
        edges_path=args.edges,
        manifest_path=args.manifest,
    )
    expected = build_schedule2_graph_from_files(
        schedule2_path=args.schedule2_index,
        locator_index_path=args.locator_index,
        compilation_number=args.compilation,
    )

    errors = validate_graph(actual, expected_unique_clause_refs=args.expected_unique_refs)
    if _normalized_nodes(actual) != _normalized_nodes(expected):
        errors.append("persisted nodes differ from deterministic rebuild")
    if _normalized_edges(actual) != _normalized_edges(expected):
        errors.append("persisted edges differ from deterministic rebuild")
    if actual.manifest != expected.manifest:
        errors.append("persisted manifest differs from deterministic rebuild")

    print("Schedule 2 offline legal map verification")
    print(f"  compilation={args.compilation}")
    print(f"  input_rows={actual.manifest.get('input_rows')}")
    print(f"  unique_clause_refs={actual.manifest.get('unique_clause_refs')}")
    print(f"  node_count={actual.manifest.get('node_count')}")
    print(f"  edge_count={actual.manifest.get('edge_count')}")
    print(f"  unresolved_external_nodes={actual.manifest.get('unresolved_external_nodes')}")
    print("  node_type_counts=" + json.dumps(actual.manifest.get("node_type_counts", {}), sort_keys=True))
    print("  relation_counts=" + json.dumps(actual.manifest.get("relation_counts", {}), sort_keys=True))

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print("OK: persisted Schedule 2 graph exactly matches deterministic rebuild")
    print("OK: graph structure and endpoints are valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
