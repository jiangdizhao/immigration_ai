from __future__ import annotations

from app.schemas.semantic_contracts import SemanticFactValue, SemanticTaskIntent, SemanticTurnAnalysis
from app.schemas.state import MatterState
from app.services.full_context_turn_resolver_service import FullContextTurnResolverService


def fact(key: str, value: object) -> SemanticFactValue:
    return SemanticFactValue(
        fact_key=key,
        value=value,
        status="filled",
        confidence="high",
        explicitness="explicit",
        evidence_source="latest_user_turn",
        evidence_text=str(value),
    )


def main() -> None:
    service = FullContextTurnResolverService(use_llm=False)
    semantic = SemanticTurnAnalysis(
        response_language="zh",
        conversation_act="lawyer_summary_request",
        task_intent=SemanticTaskIntent(task_type="lawyer_brief", uses_pending_offer=True),
        should_handle_as_task=True,
        extracted_facts=[
            fact("previous_visa_type", "485"),
            fact("applied_visa_type", "500"),
            fact("visa_application_outcome", "refused"),
            fact("applying_location", "海外"),
            fact("family_location", "海外"),
            fact("explanation_given", "课程能帮我回国找工作"),
            fact("refusal_officer_comment", "想留在澳洲"),
        ],
    )
    result = service.resolve(
        raw_user_message="我申请的时候在海外，家人也都在海外。我解释了这个课程能帮我回国找工作，但是拒签官只说我想留在澳洲",
        internal_question_en="The user adds factual context about a refused 500 application.",
        current_state=MatterState(carried_intake_facts={"pending_offer": {"offer_type": "lawyer_brief"}}),
        semantic_turn=semantic,
        pending_offer={"offer_type": "lawyer_brief"},
        response_language="zh",
    )
    print(result.model_dump_json(indent=2))
    print("\nProjected intake facts:")
    for key, value in result.to_intake_facts().items():
        if key in {"legal_focus_frame", "visa_entity_updates"}:
            continue
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
