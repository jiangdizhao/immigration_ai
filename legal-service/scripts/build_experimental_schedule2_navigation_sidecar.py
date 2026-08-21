#!/usr/bin/env python3
"""Build the isolated offline Schedule-2 navigation sidecar.

This script writes only the experimental artifact directory supplied on the
command line (the default is under data/processed/experimental).  It does not
touch the shared Schedule indexes, the database, or any serving configuration.
"""

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
    read_locator_records,
    validate_sidecar,
    write_sidecar,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build an experimental Schedule-2 navigation sidecar")
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
    missing = [str(path) for path in (*sources, args.locator_index) if not path.exists() or path.stat().st_size == 0]
    if missing:
        raise SystemExit("missing or empty required input: " + ", ".join(missing))
    sidecar = build_sidecar(
        sources,
        locator_records=read_locator_records(args.locator_index),
        locator_index_path=args.locator_index,
        locator_manifest_path=args.locator_manifest,
    )
    errors = validate_sidecar(sidecar)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    write_sidecar(sidecar, nodes_path=args.nodes, edges_path=args.edges, manifest_path=args.manifest)
    print("Experimental Schedule-2 legal navigation sidecar")
    print(json.dumps(sidecar.manifest, ensure_ascii=False, sort_keys=True, indent=2))
    print(f"nodes={args.nodes}")
    print(f"edges={args.edges}")
    print(f"manifest={args.manifest}")
    print("OK: isolated offline sidecar built; serving_path_integrated=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
