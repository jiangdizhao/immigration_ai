from __future__ import annotations

import inspect

from app.schemas.semantic_contracts import SemanticTurnAnalysis
from app.services.query_service import QueryService

analysis = SemanticTurnAnalysis(
    domain_routing={
        "domain_type": "general_non_political",
        "should_use_general_answer": True,
        "should_block_for_politics": False,
        "should_use_legal_pipeline": False,
        "reason": "ordinary general question",
    }
)
service = QueryService()
assert service._should_use_general_topic_fast_path(semantic_turn=analysis) is True
assert service._is_politics_sensitive_general_turn(
    semantic_turn=analysis,
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

general_fn = inspect.getsource(QueryService._should_use_general_topic_fast_path)
politics_fn = inspect.getsource(QueryService._is_politics_sensitive_general_turn)
combined = general_fn + "
" + politics_fn
for banned in [
    "rationale",
    "user_goal",
    "topic_relation",
    "raw_user_message.lower",
    " in text",
    "persuasion_phrases",
    "political_terms",
    "general_goals",
]:
    assert banned not in combined, f"routing predicate still contains keyword/label/phrase logic: {banned}"

print("OK: domain routing contract is first-class; runtime predicates use domain_routing only")
