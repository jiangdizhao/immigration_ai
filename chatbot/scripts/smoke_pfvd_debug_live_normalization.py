#!/usr/bin/env python3
from pathlib import Path

path = Path("app/api/widget-chat/route.ts")
text = path.read_text(encoding="utf-8")

required = [
    "function normalizedLiveFetchUsedFromDebug(",
    "function normalizedLiveResultCountFromDebug(",
    "live_fetch_used: normalizedLiveFetchUsedFromDebug(dbg)",
    "live_result_count: normalizedLiveResultCountFromDebug(dbg)",
    'console.log("liveFetchUsed:", normalizedLiveFetchUsedFromDebug(dbg));',
    'console.log("liveResultCount:", normalizedLiveResultCountFromDebug(dbg));',
]

missing = [item for item in required if item not in text]
if missing:
    raise SystemExit(f"PFVD live debug smoke failed; missing: {missing}")

print("OK: PFVD live debug normalization is installed")
