"""Verify Phase 2 keeps domain routing separate from political enforcement."""

from __future__ import annotations

import inspect
from pathlib import Path

from app.schemas.semantic_contracts import SemanticTurnAnalysis
from app.services.query_service import QueryService


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
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

    # This is intentionally a legacy semantic field.  It cannot become a
    # second safety policy or override an allow decision from the shared gate.
    legacy_label = SemanticTurnAnalysis(
        domain_routing={
            "domain_type": "politics_sensitive",
            "should_use_general_answer": True,
            "should_block_for_politics": True,
            "should_use_legal_pipeline": False,
            "reason": "legacy model label",
        }
    )
    assert service._should_use_general_topic_fast_path(semantic_turn=legacy_label) is True

    general_fn = inspect.getsource(QueryService._should_use_general_topic_fast_path)
    assert "should_block_for_politics" not in general_fn

    query_service = (ROOT / "app/services/query_service.py").read_text(encoding="utf-8")
    unified_patch = (ROOT / "app/services/unified_context_runtime_patch.py").read_text(
        encoding="utf-8"
    )
    assert "_handle_politics_sensitive_fast_path" not in query_service
    assert "_handle_politics_sensitive_fast_path" not in unified_patch

    route = (ROOT / "app/api/routes/query.py").read_text(encoding="utf-8")
    gate_index = route.index("political_failsafe_service.evaluate_payload(payload)")
    engine_index = route.index('engine = os.getenv("ANSWER_ENGINE"')
    service_index = route.index("service = QueryService()")
    assert gate_index < engine_index < service_index

    print("OK: domain routing cannot supersede the shared deterministic political gate")


if __name__ == "__main__":
    main()
