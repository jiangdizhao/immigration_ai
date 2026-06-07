from __future__ import annotations

import json

from app.schemas.semantic_contracts import SemanticFactValue, SemanticTaskIntent, SemanticTurnAnalysis
from app.schemas.state import MatterState
from app.services.full_context_turn_resolver_service import FullContextTurnResolverService


class FakeResponse:
    def __init__(self, output_text: str) -> None:
        self.output_text = output_text


class FakeResponses:
    def __init__(self, outputs: list[str]) -> None:
        self.outputs = outputs
        self.calls = 0

    def create(self, **_: object) -> FakeResponse:
        idx = min(self.calls, len(self.outputs) - 1)
        self.calls += 1
        return FakeResponse(self.outputs[idx])


class FakeClient:
    def __init__(self, outputs: list[dict | str]) -> None:
        prepared = [json.dumps(item, ensure_ascii=False) if isinstance(item, dict) else item for item in outputs]
        self.responses = FakeResponses(prepared)


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


def resolution_payload(**overrides: object) -> dict:
    base = {
        "response_language": "zh",
        "turn_purpose": "fact_update",
        "contains_substantive_new_facts": True,
        "substantive_fact_keys": ["application_location", "family_location"],
        "visa_entities_update": [
            {"subclass": "500", "merge_with_existing_entity": None, "label": "Student visa", "add_roles": ["refused_application"], "add_facts": {}, "confidence": "high", "reason": "refused visa"},
            {"subclass": "485", "merge_with_existing_entity": None, "label": "Temporary Graduate visa", "add_roles": ["previous_visa"], "add_facts": {}, "confidence": "high", "reason": "previous visa"},
        ],
        "current_focus": {
            "focus_id": "f1",
            "user_request_summary": "500 refusal fact update",
            "primary_visa_entity_id": None,
            "primary_subclass": "500",
            "primary_role": "refused_application",
            "supporting_entities": [{"entity_id": None, "subclass": "485", "role_in_this_focus": "previous_visa_history", "reason": None}],
            "candidate_focuses": [],
            "issue_family": "visa_refusal",
            "operation": "student_refusal_next_steps",
            "suggested_case_frame_id": "500_refusal_review",
            "schedule2_candidate_subclasses": ["500", "485"],
            "schedule1_relevance": "none",
            "deferred_dependencies": [],
            "next_best_question": "你是哪一天收到拒签通知的？",
            "answer_strategy": "answer_first_then_ask",
            "confidence": "high",
            "reason": "applied/refused visa beats previous visa",
        },
        "artifact_request": {"requested": False, "artifact_type": "none", "explicit_acceptance": False, "uses_pending_offer": False, "reason": None},
        "pending_offer_accepted": False,
        "pending_offer_rejected_or_ignored": True,
        "execution_path": "legal_reasoning_pipeline",
        "force_schedule2_search": True,
        "force_fact_merge_before_artifact": True,
        "schedule2_candidates": [],
        "new_fact_updates": {"application_location": "overseas"},
        "reasons": [],
        "raw_model_output": {},
    }
    base.update(overrides)
    return base


def semantic_with_refusal_facts() -> SemanticTurnAnalysis:
    return SemanticTurnAnalysis(
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
        ],
    )


def test_llm_fact_update_does_not_accept_pending_lawyer_brief() -> None:
    service = FullContextTurnResolverService(client=FakeClient([resolution_payload()]))
    result = service.resolve(
        raw_user_message="我申请的时候在海外，家人也都在海外。我解释了这个课程能帮我回国找工作，但是拒签官只说我想留在澳洲",
        internal_question_en="The user adds refusal facts.",
        current_state=MatterState(carried_intake_facts={"pending_offer": {"offer_type": "lawyer_brief"}}),
        semantic_turn=semantic_with_refusal_facts(),
        pending_offer={"offer_type": "lawyer_brief"},
        response_language="zh",
    )
    assert result.execution_path == "legal_reasoning_pipeline"
    assert result.artifact_request.requested is False
    assert result.allow_early_task_execution is False
    assert result.current_focus.primary_subclass == "500"
    assert result.current_focus.suggested_case_frame_id == "500_refusal_review"
    facts = result.to_intake_facts()
    assert facts["visa_subclass"] == "500"
    assert facts["previous_visa_subclass"] == "485"


def test_invalid_generic_primary_subclass_is_not_projected_to_visa_subclass() -> None:
    bad = resolution_payload(current_focus={**resolution_payload()["current_focus"], "primary_subclass": "visa_general"})
    service = FullContextTurnResolverService(client=FakeClient([bad]))
    result = service.resolve(
        raw_user_message="你好，我想咨询签证问题",
        internal_question_en="General visa consultation.",
        current_state=MatterState(carried_intake_facts={}),
        semantic_turn=SemanticTurnAnalysis(response_language="zh"),
        response_language="zh",
    )
    facts = result.to_intake_facts()
    assert result.current_focus.primary_subclass is None
    assert "visa_subclass" not in facts
    assert "target_visa_subclass" not in facts


def test_schema_repair_pass_can_fix_invalid_focus() -> None:
    bad = resolution_payload(current_focus={**resolution_payload()["current_focus"], "primary_subclass": "visa_general"})
    repaired = resolution_payload()
    service = FullContextTurnResolverService(client=FakeClient([bad, repaired]))
    result = service.resolve(
        raw_user_message="我之前是485，后来申请500学生签证，被拒了",
        internal_question_en="500 refusal after previous 485.",
        current_state=MatterState(carried_intake_facts={}),
        semantic_turn=semantic_with_refusal_facts(),
        response_language="zh",
    )
    assert result.current_focus.primary_subclass == "500"


def test_explicit_lawyer_brief_can_be_artifact_only() -> None:
    payload = resolution_payload(
        turn_purpose="explicit_artifact_request",
        contains_substantive_new_facts=False,
        substantive_fact_keys=[],
        current_focus={**resolution_payload()["current_focus"], "primary_subclass": "500"},
        artifact_request={"requested": True, "artifact_type": "lawyer_brief", "explicit_acceptance": True, "uses_pending_offer": True, "reason": "explicit request"},
        pending_offer_accepted=True,
        execution_path="artifact_only",
        new_fact_updates={},
    )
    service = FullContextTurnResolverService(client=FakeClient([payload]))
    result = service.resolve(
        raw_user_message="好，帮我整理一份给律师看的案情摘要",
        internal_question_en="Prepare a lawyer brief.",
        current_state=MatterState(carried_intake_facts={"pending_offer": {"offer_type": "lawyer_brief"}}),
        semantic_turn=SemanticTurnAnalysis(response_language="zh", conversation_act="lawyer_summary_request"),
        pending_offer={"offer_type": "lawyer_brief"},
        response_language="zh",
    )
    assert result.artifact_request.requested is True
    assert result.artifact_request.artifact_type == "lawyer_brief"
    assert result.allow_early_task_execution is True
