#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app/services/proposal_first_verification_depth_answer_service.py"
text = SOURCE.read_text(encoding="utf-8")

required = [
    "def _ensure_public_option_coverage_in_answer",
    "public_option_coverage_map",
    "Additional options to check for completeness",
    "answer_text = self._ensure_public_option_coverage_in_answer",
]
missing = [item for item in required if item not in text]
if missing:
    raise SystemExit(f"coverage postprocess smoke failed; missing: {missing}")
print("OK: public option coverage postprocess is installed")
