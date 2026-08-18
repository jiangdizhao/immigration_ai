"""Check Phase 2's authoritative outer political policy contract statically."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    route = (ROOT / "app/api/routes/query.py").read_text(encoding="utf-8")
    matcher = (ROOT / "app/services/political_failsafe_service.py").read_text(encoding="utf-8")
    premium = (ROOT / "app/services/premium_direct_answer_service.py").read_text(encoding="utf-8")

    assert "political_failsafe_service.evaluate_payload(payload)" in route
    assert "record_political_gate" in route
    assert "QueryService()" in route
    assert route.index("political_failsafe_service.evaluate_payload(payload)") < route.index(
        "QueryService()"
    )
    assert "frontend_messages" in matcher
    assert "intake_facts" in matcher
    assert "POLITICS_SENSITIVE_TERMS" not in premium
    assert "_politics_block_response" not in premium

    print("OK: shared outer policy protects default and premium paths before dispatch")


if __name__ == "__main__":
    main()
