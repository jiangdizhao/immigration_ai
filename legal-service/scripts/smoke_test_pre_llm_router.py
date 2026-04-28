"""Small local smoke test for the deterministic pre-LLM router.

Run from legal-service root:
    python -m scripts.smoke_test_pre_llm_router

This test does not call OpenAI, the database, retrieval, or live search.
"""

from app.schemas.state import MatterState
from app.services.pre_llm_router_service import PreLLMRouterService


def main() -> None:
    router = PreLLMRouterService()
    examples = [
        "Hi",
        "What does condition 8501 mean?",
        "Guided intake update:\nrefusal_notice_available: False\nnotification_date: 2026-04-20",
        "My student visa was refused. What should I do next?",
        "I need to book a consultation with a lawyer",
    ]

    for question in examples:
        analysis = router.analyze(
            question=question,
            current_state=MatterState(),
            intake_facts={},
            conversation_history=[],
        )
        print("=" * 80)
        print("QUESTION:", question)
        print("turn_type:", analysis.turn_type)
        print("display_mode:", analysis.display_mode)
        print("no_llm_needed:", analysis.no_llm_needed)
        print("retrieval_needed:", analysis.retrieval_needed)
        print("facts:", analysis.extraction.facts)
        print("reasons:", analysis.reasons)


if __name__ == "__main__":
    main()
