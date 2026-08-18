from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def _assert_guard_precedes(source: str, later: str) -> None:
    assert source.index("const gateDecision = evaluateWidgetSubmission") < source.index(later)


def _between(source: str, start: str, end: str) -> str:
    start_index = source.index(start)
    end_index = source.index(end, start_index)
    return source[start_index:end_index]


def main() -> None:
    wrapper = _read("components/premium-answer-mode-workspace.tsx")
    workspace = _read("components/immigration-ai-workspace.tsx")
    page = _read("app/(chat)/ai-workspace/page.tsx")
    default_route = _read("app/api/widget-chat/route.ts")
    direct_route = _read("app/api/widget-chat-direct/route.ts")

    assert "PremiumAnswerModeWorkspace" in page
    assert "ImmigrationAIWorkspace" in wrapper
    assert "assistantMode" in wrapper
    assert 'assistantMode === "premium"' in wrapper
    assert "normalizeAssistantMode" in wrapper
    assert "window.fetch =" not in wrapper
    assert "originalFetch" not in wrapper
    assert "widgetRouteForAssistantMode" in workspace
    assert 'assistantMode: "default"' not in workspace
    assert "assistantMode," in workspace
    for component_path in (ROOT / "components").rglob("*.tsx"):
        assert "window.fetch =" not in component_path.read_text(encoding="utf-8")

    direct_submit = _between(
        workspace, "const submitMessage = async", "const handleDraftChange"
    )
    assert "evaluateWidgetSubmission" in direct_submit
    assert direct_submit.index("const submissionDecision = evaluateWidgetSubmission") < direct_submit.index(
        "const activeConversationId = conversationId ?? (await createConversation())"
    )
    assert direct_submit.index("const submissionDecision = evaluateWidgetSubmission") < direct_submit.index(
        "setMessages(nextMessages)"
    )

    guided_submit = _between(
        workspace, "const handleSubmitDraftFacts = async", "const handleBookConsultation"
    )
    assert "evaluateWidgetSubmission" in guided_submit
    assert guided_submit.index("const submissionDecision = evaluateWidgetSubmission") < guided_submit.index(
        "const activeConversationId = conversationId ?? (await createConversation())"
    )
    assert guided_submit.index("const submissionDecision = evaluateWidgetSubmission") < guided_submit.index(
        "setMessages(visibleMessages)"
    )

    assert "evaluateWidgetSubmission" in default_route
    assert "political_gate_version" in default_route
    assert 'assistant_mode: assistantMode' in default_route
    for later in (
        "await checkIpRateLimit",
        "const session = await auth()",
        "const legalServiceResult = await fetchLegalServiceJson",
        "await saveMessages",
    ):
        _assert_guard_precedes(default_route, later)

    assert "assistant_mode" in direct_route
    assert "evaluateWidgetSubmission" in direct_route
    assert "political_gate_version" in direct_route
    assert 'assistant_mode: assistantMode' in direct_route
    for later in (
        "await checkIpRateLimit",
        "const session = await auth()",
        "const legalServiceResult = await fetchLegalServiceDirect",
        "await saveMessages",
    ):
        _assert_guard_precedes(direct_route, later)
    assert "fetchLegalServiceDirect" in direct_route
    assert "saveMessages" in direct_route

    print("OK: premium direct UI mode is installed")


if __name__ == "__main__":
    main()
