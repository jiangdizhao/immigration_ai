from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
checks = {
    "unified preflight gate": ROOT / "app/services/unified_context_runtime_patch.py",
    "query general fast path": ROOT / "app/services/query_service.py",
    "PFVD general fallback helpers": ROOT / "app/services/proposal_first_verification_depth_answer_service.py",
}

required = {
    "unified preflight gate": [
        "_analyze_semantic_turn",
        "_is_politics_sensitive_general_turn",
        "_should_use_general_topic_fast_path",
        "ProposalFirstVerificationDepthAnswerService",
    ],
    "query general fast path": [
        "general_topic_fast_answer",
        "politics_sensitive_block_only",
        "_handle_general_topic_fast_path",
    ],
    "PFVD general fallback helpers": [
        "_answer_general_question_directly",
        "_politics_sensitive_general_answer",
        "_is_politics_sensitive_text",
    ],
}

for name, rel in checks.items():
    text = rel.read_text(encoding="utf-8")
    missing = [needle for needle in required[name] if needle not in text]
    if missing:
        raise SystemExit(f"{name} missing markers: {missing}")

print("OK: general-topic/politics-only fast routing markers are present")
