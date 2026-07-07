#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
route = ROOT / "app" / "api" / "widget-chat" / "route.ts"
text = route.read_text(encoding="utf-8")

required_literals = [
    "function normalizedLiveFetchUsedFromDebug",
    "function normalizedLiveResultCountFromDebug",
    "function pfvdLiveChunkCountFromDebug",
    "live_fetch_used: normalizedLiveFetchUsedFromDebug(dbg)",
    "live_result_count: normalizedLiveResultCountFromDebug(dbg)",
    'console.log("liveFetchUsed:", normalizedLiveFetchUsedFromDebug(dbg));',
    'console.log("liveResultCount:",normalizedLiveResultCountFromDebug(dbg));',
]

missing = [item for item in required_literals if item not in text]
if missing:
    print(f"PFVD live debug smoke failed; missing: {missing}")
    sys.exit(1)

bad_patterns = [
    r"live_fetch_used:\s*dbg\.live_fetch_used\s*\?\?",
    r"live_result_count:\s*dbg\.live_result_count\s*\?\?",
    r'console\.log\("liveFetchUsed:",\s*dbg\.live_fetch_used',
    r'console\.log\("liveResultCount:",\s*dbg\.live_result_count',
]
bad = [pattern for pattern in bad_patterns if re.search(pattern, text)]
if bad:
    print(f"PFVD live debug smoke failed; stale direct top-level fallback remains: {bad}")
    sys.exit(1)

print("OK: PFVD live debug normalization is installed")
