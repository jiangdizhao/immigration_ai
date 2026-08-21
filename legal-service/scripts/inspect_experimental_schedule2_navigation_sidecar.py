#!/usr/bin/env python3
"""Read-only inspection utility for the experimental sidecar."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.legal_map_experimental.schedule2_navigation_sidecar import (  # noqa: E402
    Schedule2NavigationMap,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect an experimental Schedule-2 navigation sidecar")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--subclass")
    group.add_argument("--provision")
    parser.add_argument("--references-only", action="store_true")
    parser.add_argument("--nodes", type=Path)
    parser.add_argument("--edges", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--max-provisions", type=int, default=40)
    parser.add_argument("--max-references", type=int, default=40)
    parser.add_argument("--max-edges", type=int, default=30)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    kwargs = {key: value for key, value in {"nodes_path": args.nodes, "edges_path": args.edges, "manifest_path": args.manifest}.items() if value}
    legal_map = Schedule2NavigationMap.from_files(**kwargs)
    if args.subclass:
        result = legal_map.subclass_map(args.subclass, max_provisions=max(0, args.max_provisions), max_references=max(0, args.max_references))
    elif args.references_only:
        result = legal_map.follow_references(args.provision, max_targets=max(0, args.max_references))
    else:
        result = legal_map.provision_context(args.provision, max_edges=max(0, args.max_edges))
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result.get("found") else 2


if __name__ == "__main__":
    raise SystemExit(main())
