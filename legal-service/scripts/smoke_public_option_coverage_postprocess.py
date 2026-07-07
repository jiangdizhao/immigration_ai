#!/usr/bin/env python3
from pathlib import Path

path = Path("app/services/proposal_first_verification_depth_answer_service.py")
text = path.read_text(encoding="utf-8")

required = [
    "def _ensure_public_option_coverage_in_answer(",
    "answer_scope_contract",
    "public_option_coverage_map",
    "Additional options to keep on the map",
]

missing = [item for item in required if item not in text]
if missing:
    raise SystemExit(f"public option coverage smoke failed; missing: {missing}")

print("OK: public option coverage postprocess is installed")
