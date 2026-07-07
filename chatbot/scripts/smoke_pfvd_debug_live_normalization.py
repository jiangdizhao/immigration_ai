#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app/api/widget-chat/route.ts"
text = SOURCE.read_text(encoding="utf-8")

required = [
    "function pfvdLiveChunkCountFromDebug",
    "normalizedLiveFetchUsedFromDebug(dbg)",
    "normalizedLiveResultCountFromDebug(dbg)",
    "pfvdEvidenceSummary",
]
missing = [item for item in required if item not in text]
if missing:
    raise SystemExit(f"PFVD live debug smoke failed; missing: {missing}")
print("OK: PFVD live debug normalization is installed")
