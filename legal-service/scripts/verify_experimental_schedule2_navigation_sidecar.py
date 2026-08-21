#!/usr/bin/env python3
"""Verify persisted experimental Schedule-2 sidecar artifacts."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.legal_map_experimental.schedule2_navigation_sidecar import (  # noqa: E402
    DEFAULT_EDGES_PATH,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_NODES_PATH,
    DEFAULT_SOURCE_PATHS,
    LOCATOR_INDEX_PATH,
    LOCATOR_MANIFEST_PATH,
    build_sidecar,
    load_sidecar,
    normalized_sidecar,
    read_locator_records,
    verify_artifacts,
)
from app.legal_map_experimental.schedule2_structural_oracle import (  # noqa: E402
    build_structural_oracle,
    compare_structural_oracle,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify an experimental Schedule-2 navigation sidecar")
    parser.add_argument("--source", action="append", type=Path, dest="sources")
    parser.add_argument("--locator-index", type=Path, default=LOCATOR_INDEX_PATH)
    parser.add_argument("--locator-manifest", type=Path, default=LOCATOR_MANIFEST_PATH)
    parser.add_argument("--nodes", type=Path, default=DEFAULT_NODES_PATH)
    parser.add_argument("--edges", type=Path, default=DEFAULT_EDGES_PATH)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sources = tuple(args.sources or DEFAULT_SOURCE_PATHS)
    required = (*sources, args.locator_index, args.nodes, args.edges, args.manifest)
    missing = [str(path) for path in required if not path.exists() or path.stat().st_size == 0]
    if missing:
        raise SystemExit("missing or empty required file: " + ", ".join(missing))

    actual = load_sidecar(nodes_path=args.nodes, edges_path=args.edges, manifest_path=args.manifest)
    errors = verify_artifacts(actual, nodes_path=args.nodes, edges_path=args.edges)
    expected = build_sidecar(
        sources,
        locator_records=read_locator_records(args.locator_index),
        locator_index_path=args.locator_index,
        locator_manifest_path=args.locator_manifest,
    )
    expected.manifest["generated_artifact_sha256"] = actual.manifest.get("generated_artifact_sha256")
    if normalized_sidecar(actual) != normalized_sidecar(expected):
        errors.append("persisted sidecar differs from deterministic rebuild")
    oracle = build_structural_oracle(sources)
    oracle_report = compare_structural_oracle(oracle, actual)
    if oracle_report["missing_from_sidecar"]:
        errors.append("independent oracle found provisions missing from sidecar")
    if oracle_report["extra_in_sidecar"]:
        errors.append("independent oracle found extra sidecar provisions")
    if oracle_report["ownership_mismatches"]:
        errors.append("independent oracle found ownership mismatches")
    if oracle_report["source_order_mismatches"]:
        errors.append("independent oracle found source-order mismatches")
    if oracle_report["next_clause_mismatches"]:
        errors.append("independent oracle found NEXT_CLAUSE mismatches")
    if oracle_report["previous_clause_mismatches"]:
        errors.append("independent oracle found PREVIOUS_CLAUSE mismatches")

    print("Experimental Schedule-2 legal navigation sidecar verification")
    print(json.dumps(actual.manifest, ensure_ascii=False, sort_keys=True, indent=2))
    print("Independent structural oracle")
    print(json.dumps(oracle_report, ensure_ascii=False, sort_keys=True, indent=2))
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("OK: persisted nodes, edges, manifest, and endpoints are valid")
    print("OK: persisted artifact exactly matches deterministic rebuild")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
