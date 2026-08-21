#!/usr/bin/env python3
"""Build the offline Schedule 2 navigation graph from validated derived indexes."""

from __future__ import annotations

import argparse
from pathlib import Path

from app.legal_locator.index import DEFAULT_INDEX_PATH as DEFAULT_LOCATOR_INDEX_PATH
from app.legal_map.schedule2_graph import (
    DEFAULT_EDGES_PATH,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_NODES_PATH,
    build_schedule2_graph_from_files,
    validate_graph,
    write_graph,
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


def main() -> int:
    args = parse_args()
    if not args.schedule2_index.exists() or args.schedule2_index.stat().st_size == 0:
        raise SystemExit(f"Schedule 2 index missing or empty: {args.schedule2_index}")
    if not args.locator_index.exists() or args.locator_index.stat().st_size == 0:
        raise SystemExit(f"Legal locator index missing or empty: {args.locator_index}")

    graph = build_schedule2_graph_from_files(
        schedule2_path=args.schedule2_index,
        locator_index_path=args.locator_index,
        compilation_number=args.compilation,
    )
    errors = validate_graph(graph, expected_unique_clause_refs=args.expected_unique_refs)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    write_graph(
        graph,
        nodes_path=args.nodes,
        edges_path=args.edges,
        manifest_path=args.manifest,
    )

    print("Schedule 2 offline legal map build")
    print(f"  compilation={args.compilation}")
    print(f"  input_rows={graph.manifest['input_rows']}")
    print(f"  unique_clause_refs={graph.manifest['unique_clause_refs']}")
    print(f"  node_count={graph.manifest['node_count']}")
    print(f"  edge_count={graph.manifest['edge_count']}")
    print(f"  unresolved_external_nodes={graph.manifest['unresolved_external_nodes']}")
    print(f"  node_type_counts={graph.manifest['node_type_counts']}")
    print(f"  relation_counts={graph.manifest['relation_counts']}")
    print(f"  nodes={args.nodes}")
    print(f"  edges={args.edges}")
    print(f"  manifest={args.manifest}")
    print("OK: Schedule 2 navigation graph built as an offline derived artifact")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
