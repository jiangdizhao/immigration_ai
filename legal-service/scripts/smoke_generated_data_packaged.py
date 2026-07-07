#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

REQUIRED = [
    Path("/app/data/generated/schedule2_subclass_skeletons.json"),
    Path("/app/data/generated/official_visa_source_seed_map_v0_1.json"),
]


def main() -> None:
    missing = [str(path) for path in REQUIRED if not path.exists() or path.stat().st_size == 0]
    if missing:
        raise SystemExit("Missing generated data files in legal-service image: " + ", ".join(missing))
    print("OK: generated PFVD data files are packaged")


if __name__ == "__main__":
    main()
