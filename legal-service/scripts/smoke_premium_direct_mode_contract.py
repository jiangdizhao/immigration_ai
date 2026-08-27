from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def main() -> None:
    query_schema = _read("app/schemas/query.py")
    runtime_patch = _read("app/services/unified_context_runtime_patch.py")
    direct_service = _read("app/services/premium_direct_answer_service.py")
    query_route = _read("app/api/routes/query.py")

    # Existing frontend/backend mode contract remains backward-compatible.
    assert "assistant_mode" in query_schema
    assert "premium_direct_gpt55_high" in query_schema
    assert "default_legal_pipeline" in query_schema

    premium_gate_index = runtime_patch.index(
        'payload.assistant_mode == "premium_direct_gpt55_high"'
    )
    semantic_index = runtime_patch.index("_analyze_semantic_turn")
    assert (
        premium_gate_index < semantic_index
    ), "premium direct mode must be intercepted before the full semantic-turn router"

    assert "PremiumDirectAnswerService" in runtime_patch
    assert "fallback_to_slow_legal_pipeline" in runtime_patch
    assert "semantic_turn_router_skipped" in runtime_patch
    assert '"frontend_messages": []' not in runtime_patch

    # The shared FastAPI ingress guard is authoritative for both serving
    # lanes.  Premium must not retain an independently-maintained lexical
    # politics filter that can disagree with the reviewed YAML policy.
    assert "political_failsafe_service.evaluate_payload(payload)" in query_route
    assert query_route.index(
        "political_failsafe_service.evaluate_payload(payload)"
    ) < query_route.index("QueryService()")
    assert "POLITICS_SENSITIVE_TERMS" not in direct_service
    assert "_politics_block_response" not in direct_service

    # Direct-lane conversation continuity.
    assert "_history_text" in direct_service
    assert "frontend_history_sent_to_answer_model" in direct_service
    assert "system_prompt_sent_to_answer_model" in direct_service
    assert "Recent conversation context:" in direct_service
    assert "Latest user question:" in direct_service
    assert "material cross-references" in direct_service

    # Sol primary, Luna fallback and explicit serving-model diagnostics.
    assert "PREMIUM_DIRECT_PRIMARY_MODEL" in direct_service
    assert "PREMIUM_DIRECT_PRIMARY_REASONING_EFFORT" in direct_service
    assert "PREMIUM_DIRECT_PRIMARY_MAX_RETRIES" in direct_service
    assert "PREMIUM_DIRECT_FALLBACK_MODEL" in direct_service
    assert "PREMIUM_DIRECT_FALLBACK_REASONING_EFFORT" in direct_service
    assert "PREMIUM_DIRECT_FALLBACK_MAX_RETRIES" in direct_service
    assert '"gpt-5.6-sol"' in direct_service
    assert '"gpt-5.6-luna"' in direct_service
    assert "_answer_with_fallback" in direct_service
    assert "used_fallback_model" in direct_service
    assert "serving_model" in direct_service

    # Genuine Responses API agentic web search and actual-source extraction.
    assert "PREMIUM_DIRECT_WEB_SEARCH_ENABLED" in direct_service
    assert "PREMIUM_DIRECT_WEB_SEARCH_REQUIRED" in direct_service
    assert "PREMIUM_DIRECT_WEB_SEARCH_CONTEXT_SIZE" in direct_service
    assert "PREMIUM_DIRECT_MAX_TOOL_CALLS" in direct_service
    assert '"type": "web_search"' in direct_service
    assert '"type": "web_search_preview"' in direct_service
    assert '"tool_choice": "required" if self.web_search_required else "auto"' in direct_service
    assert '"include": ["web_search_call.action.sources"]' in direct_service
    assert "_extract_web_sources" in direct_service
    assert "_append_actual_web_sources" in direct_service
    assert "Actual web-search sources" in direct_service
    assert "实际网页搜索来源" in direct_service
    assert "web_search_source_count" in direct_service
    assert "web_search_returned_sources" in direct_service
    assert "live_web_search_used" in direct_service
    assert "openai_responses_web_search_sources_without_cap" in direct_service
    assert "references_are_model_provided" in direct_service
    assert "source_verified" in direct_service

    # The old closed-book model defaults must no longer be the direct-lane defaults.
    assert '"gpt-5.5"' not in direct_service
    assert '"gpt-5.4-mini"' not in direct_service
    assert "AI quick research answer used live web search" in direct_service

    print("OK: premium direct Sol/Luna agentic web-search contract is installed")


if __name__ == "__main__":
    main()
