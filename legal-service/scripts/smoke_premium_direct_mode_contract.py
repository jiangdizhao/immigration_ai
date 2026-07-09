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

    politics_index = runtime_patch.index("_is_politics_sensitive_general_turn")
    premium_index = runtime_patch.index('assistant_mode == "premium_direct_gpt55_high"')
    general_index = runtime_patch.index("_should_use_general_topic_fast_path")
    assert politics_index < premium_index < general_index, (
        "premium direct mode must run after politics filter and before the other legal/general pipelines"
    )

    assert "PremiumDirectAnswerService" in runtime_patch
    assert "fallback_to_slow_legal_pipeline" in runtime_patch
    assert "reasoning={\"effort\": self.reasoning_effort}" in direct_service
    assert "source_verified" in direct_service
    assert "PREMIUM_DIRECT_MODEL" in direct_service

    print("OK: premium direct backend mode contract is installed")


if __name__ == "__main__":
    main()
