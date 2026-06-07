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


def test_fact_update_does_not_accept_pending_lawyer_brief() -> None:
    service = FullContextTurnResolverService(use_llm=False)
    state = MatterState(carried_intake_facts={"pending_offer": {"offer_type": "lawyer_brief"}})
    semantic = SemanticTurnAnalysis(
        response_language="zh",
        conversation_act="lawyer_summary_request",
        task_intent=SemanticTaskIntent(task_type="lawyer_brief", uses_pending_offer=True),
        should_handle_as_task=True,
        extracted_facts=[
            fact("applying_location", "海外"),
            fact("family_location", "海外"),
            fact("explanation_given", "课程能帮我回国找工作"),
            fact("refusal_officer_comment", "想留在澳洲"),
            fact("applied_visa_type", "500"),
            fact("previous_visa_type", "485"),
            fact("visa_application_outcome", "refused"),
        ],
    )
    result = service.resolve(
        raw_user_message="我申请的时候在海外，家人也都在海外。我解释了这个课程能帮我回国找工作，但是拒签官只说我想留在澳洲",
        internal_question_en="The user adds refusal facts.",
        current_state=state,
        semantic_turn=semantic,
        pending_offer={"offer_type": "lawyer_brief"},
        response_language="zh",
    )
    assert result.execution_path == "legal_reasoning_pipeline"
    assert result.artifact_request.requested is False
    assert result.allow_early_task_execution is False
    assert result.current_focus.primary_subclass == "500"
    assert result.current_focus.suggested_case_frame_id == "500_refusal_review"


def test_explicit_lawyer_brief_can_be_artifact_only() -> None:
    service = FullContextTurnResolverService(use_llm=False)
    semantic = SemanticTurnAnalysis(response_language="zh", conversation_act="lawyer_summary_request")
    result = service.resolve(
        raw_user_message="好，帮我整理一份给律师看的案情摘要",
        internal_question_en="Prepare a lawyer brief.",
        current_state=MatterState(carried_intake_facts={}),
        semantic_turn=semantic,
        pending_offer={"offer_type": "lawyer_brief"},
        response_language="zh",
    )
    assert result.artifact_request.requested is True
    assert result.artifact_request.artifact_type == "lawyer_brief"
    assert result.allow_early_task_execution is True


def test_refused_500_beats_previous_485() -> None:
    service = FullContextTurnResolverService(use_llm=False)
    semantic = SemanticTurnAnalysis(
        response_language="zh",
        conversation_act="fact_update",
        extracted_facts=[
            fact("previous_visa_type", "485"),
            fact("applied_visa_type", "500"),
            fact("visa_application_outcome", "refused"),
            fact("refusal_reason", "not a genuine student"),
        ],
    )
    result = service.resolve(
        raw_user_message="我之前是485，后来申请500学生签证，被拒了，说我不是真正的学生",
        internal_question_en="500 refusal after previous 485.",
        current_state=MatterState(carried_intake_facts={}),
        semantic_turn=semantic,
        response_language="zh",
    )
    assert result.current_focus.primary_subclass == "500"
    assert result.current_focus.primary_role == "refused_application"
    facts = result.to_intake_facts()
    assert facts["visa_subclass"] == "500"
    assert facts["previous_visa_subclass"] == "485"
    assert facts["active_case_frame_id"] == "500_refusal_review"
