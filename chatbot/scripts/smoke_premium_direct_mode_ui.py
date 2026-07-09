from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def main() -> None:
    wrapper = _read("components/premium-answer-mode-workspace.tsx")
    page = _read("app/(chat)/ai-workspace/page.tsx")
    direct_route = _read("app/api/widget-chat-direct/route.ts")

    assert "PremiumAnswerModeWorkspace" in page
    assert "ImmigrationAIWorkspace" in wrapper
    assert "assistantMode" in wrapper
    assert "premium_direct_gpt55_high" in wrapper
    assert 'originalFetch("/api/widget-chat-direct"' in wrapper

    assert "assistant_mode" in direct_route
    assert "premium_direct_gpt55_high" in direct_route
    assert "fetchLegalServiceDirect" in direct_route
    assert "saveMessages" in direct_route

    print("OK: premium direct UI mode is installed")


if __name__ == "__main__":
    main()
