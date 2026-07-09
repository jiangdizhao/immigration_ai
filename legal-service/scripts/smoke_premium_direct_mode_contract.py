from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def main() -> None:
    query_schema = _read("app/schemas/query.py")
    runtime_patch = _read("app/services/unified_context_runtime_patch.py")
    direct_service = _read("app/services/premium_direct_answer_service.py")

    assert "assistant_mode" in query_schema
    assert "premium_direct_gpt55_high" in query_schema
    assert "default_legal_pipeline" in query_schema

    premium_gate_index = runtime_patch.index('payload.assistant_mode == "premium_direct_gpt55_high"')
    semantic_index = runtime_patch.index("_analyze_semantic_turn")
    assert premium_gate_index < semantic_index, (
        "premium direct mode must be intercepted before the full semantic-turn router"
    )

    assert "PremiumDirectAnswerService" in runtime_patch
    assert "fallback_to_slow_legal_pipeline" in runtime_patch
    assert "semantic_turn_router_skipped" in runtime_patch
    assert '"frontend_messages": []' not in runtime_patch

    assert "source_verified" in direct_service
    assert "POLITICS_SENSITIVE_TERMS" in direct_service
    assert "_history_text" in direct_service
    assert "lightweight_history_plus_latest_user_question" in direct_service
    assert "system_prompt_sent_to_answer_model" in direct_service
    assert "frontend_history_sent_to_answer_model" in direct_service

    assert "PREMIUM_DIRECT_PRIMARY_MODEL" in direct_service
    assert "PREMIUM_DIRECT_PRIMARY_REASONING_EFFORT" in direct_service
    assert "PREMIUM_DIRECT_FALLBACK_MODEL" in direct_service
    assert '"gpt-5.5"' in direct_service
    assert '"gpt-5.4-mini"' in direct_service
    assert "_answer_with_silent_fallback" in direct_service
    assert "used_fallback_model" in direct_service
    assert "serving_model" in direct_service
    assert "AI quick answer" in direct_service
    assert "GPT-5.5 quick answer" not in direct_service

    print("OK: premium direct backend mode contract is installed")


if __name__ == "__main__":
    main()
