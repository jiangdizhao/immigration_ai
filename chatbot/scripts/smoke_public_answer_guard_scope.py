#!/usr/bin/env python3
from pathlib import Path

route = Path("app/api/widget-chat/route.ts")
text = route.read_text(encoding="utf-8")
patterns_start = text.index("const FORBIDDEN_PUBLIC_ANSWER_PATTERNS")
patterns_end = text.index("];", patterns_start)
patterns_block = text[patterns_start:patterns_end]
for forbidden_broad in ["evidence package", "does not support", "not supported by", "source classes", "/retrieval/i"]:
    if forbidden_broad in patterns_block:
        raise SystemExit(f"Public answer guard is still too broad: {forbidden_broad}")
for required_narrow in ["proposal_first_verification_depth", "CustomerAnswerPlan JSON", "raw_model_output"]:
    if required_narrow not in patterns_block:
        raise SystemExit(f"Public answer guard missing catastrophic leak pattern: {required_narrow}")
print("OK: public answer guard is narrow")
