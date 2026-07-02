from __future__ import annotations

import inspect

from app.schemas.semantic_contracts import SemanticTurnAnalysis
from app.services.query_service import QueryService

service = QueryService()

general = SemanticTurnAnalysis(
    domain_routing={
        "domain_type": "general_non_political",
        "should_use_general_answer": True,
        "should_block_for_politics": False,
        "should_use_legal_pipeline": False,
        "reason": "ordinary general question",
    }
)
assert service._should_use_general_topic_fast_path(semantic_turn=general) is True
assert service._is_politics_sensitive_general_turn(
    semantic_turn=general,
    raw_user_message="this argument must not be inspected",
) is False

politics = SemanticTurnAnalysis(
    domain_routing={
        "domain_type": "politics_sensitive",
        "should_use_general_answer": False,
        "should_block_for_politics": True,
        "should_use_legal_pipeline": False,
        "reason": "politics-sensitive request",
    }
)
assert service._should_use_general_topic_fast_path(semantic_turn=politics) is False
assert service._is_politics_sensitive_general_turn(
    semantic_turn=politics,
    raw_user_message="this argument must not be inspected",
) is True

unclear = SemanticTurnAnalysis()
assert service._should_use_general_topic_fast_path(semantic_turn=unclear) is False
assert service._is_politics_sensitive_general_turn(
    semantic_turn=unclear,
    raw_user_message="this argument must not be inspected",
) is False

general_fn = inspect.getsource(QueryService._should_use_general_topic_fast_path)
politics_fn = inspect.getsource(QueryService._is_politics_sensitive_general_turn)
combined = general_fn + "\n" + politics_fn

banned_fragments = [
    "user_goal",
    "topic_relation",
    "rationale",
    "safety_notes",
    "persuasion_phrases",
    "political_terms",
    "general_goals",
    ".lower()",
    " in text",
    "raw_user_message.lower",
]
for banned in banned_fragments:
    assert banned not in combined, f"routing predicate still contains keyword/label/phrase logic: {banned}"

assert "domain_routing" in combined
assert "should_use_general_answer" in combined
assert "should_block_for_politics" in combined

print("OK: domain routing contract is first-class; runtime predicates use domain_routing only")
