#!/usr/bin/env python3
"""Small manual Phase 2 A/B request harness.

This is intentionally a developer-run HTTP comparison, not an automated
quality judge or a paid acceptance suite.  It sends the same request envelope
to the Premium Sol reference lane and the Default Luna serving lane.  The
server must already be configured for the desired feature flags.
"""

from __future__ import annotations

import argparse
import json
import os
from urllib.request import Request, urlopen


DEFAULT_QUESTION = "what's the requirement of application for the sub-class 186DE visa?"


def call(base_url: str, payload: dict[str, object], api_key: str | None) -> dict[str, object]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key
    request = Request(
        f"{base_url.rstrip('/')}/api/v1/query",
        data=data,
        headers=headers,
        method="POST",
    )
    with urlopen(request, timeout=75) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Manual Premium Sol vs Default Luna comparison")
    parser.add_argument("--base-url", default="http://127.0.0.1:8001")
    parser.add_argument("--question", default=DEFAULT_QUESTION)
    parser.add_argument("--api-key", default=os.getenv("LEGAL_SERVICE_API_KEY"))
    args = parser.parse_args()

    common = {
        "question": args.question,
        "response_language": "en",
        "session_id": "phase2-manual-ab",
        "frontend_chat_id": "phase2-manual-ab",
        "answer_preference": "answer_first",
    }
    results = {
        "premium_sol_reference": call(
            args.base_url,
            {**common, "assistant_mode": "premium"},
            args.api_key,
        ),
        "default_luna_candidate": call(
            args.base_url,
            {**common, "assistant_mode": "default"},
            args.api_key,
        ),
    }
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
