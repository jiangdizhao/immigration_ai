#!/usr/bin/env python3
"""Inspect the derived Schedule 2 map without registering any serving-path tool."""

from __future__ import annotations

import argparse
import json

from app.legal_map.schedule2_graph import Schedule2LegalMap


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--subclass")
    group.add_argument("--provision")
    parser.add_argument("--references-only", action="store_true")
    parser.add_argument("--max-clauses", type=int, default=40)
    parser.add_argument("--max-external", type=int, default=40)
    parser.add_argument("--max-edges", type=int, default=30)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    legal_map = Schedule2LegalMap.from_files()

    if args.subclass:
        result = legal_map.subclass_map(
            args.subclass,
            max_clauses=max(0, args.max_clauses),
            max_external=max(0, args.max_external),
        )
    elif args.references_only:
        result = legal_map.follow_references(
            args.provision,
            max_targets=max(0, args.max_external),
        )
    else:
        result = legal_map.provision_context(
            args.provision,
            max_edges=max(0, args.max_edges),
        )

    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result.get("found") else 2


if __name__ == "__main__":
    raise SystemExit(main())
