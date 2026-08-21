#!/usr/bin/env python3
"""Compare the experimental sidecar inventory with an independent oracle."""

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
    load_sidecar,
)
from app.legal_map_experimental.schedule2_structural_oracle import (  # noqa: E402
    build_structural_oracle,
    compare_structural_oracle,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare sidecar structure with an independent raw-source oracle")
    parser.add_argument("--source", action="append", type=Path, dest="sources")
    parser.add_argument("--nodes", type=Path, default=DEFAULT_NODES_PATH)
    parser.add_argument("--edges", type=Path, default=DEFAULT_EDGES_PATH)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sources = tuple(args.sources or DEFAULT_SOURCE_PATHS)
    sidecar = load_sidecar(nodes_path=args.nodes, edges_path=args.edges, manifest_path=args.manifest)
    report = compare_structural_oracle(build_structural_oracle(sources), sidecar)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2))
    clean = all(
        not report[key]
        for key in (
            "missing_from_sidecar",
            "extra_in_sidecar",
            "ownership_mismatches",
            "source_order_mismatches",
            "next_clause_mismatches",
            "previous_clause_mismatches",
        )
    )
    print("OK: independent structural oracle matches sidecar" if clean else "ERROR: independent structural oracle mismatch")
    return 0 if clean else 1


if __name__ == "__main__":
    raise SystemExit(main())
