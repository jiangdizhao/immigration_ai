from __future__ import annotations

import json

from app.schemas.semantic_contracts import SemanticFactValue, SemanticTaskIntent, SemanticTurnAnalysis
from app.schemas.state import MatterState
from app.services.full_context_turn_resolver_service import FullContextTurnResolverService


class _FakeResponse:
    output_text: str

    def __init__(self, output_text: str) -> None:
        self.output_text = output_text


class _FakeResponses:
    def create(self, **_: object) -> _FakeResponse:
        return _FakeResponse(json.dumps({
            "response_language": "zh",
            "turn_purpose": "fact_update",
            "contains_substantive_new_facts": True,
            "substantive_fact_keys": ["application_location", "family_location", "study_purpose_argument", "case_officer_comment"],
            "visa_entities_update": [
                {
                    "subclass": "500",
                    "merge_with_existing_entity": None,
                    "label": "Student visa",
                    "add_roles": ["refused_application", "applied_visa"],
                    "add_facts": {"application_location": "overseas", "family_location": "overseas"},
                    "confidence": "high",
                    "reason": "500 was the refused application",
                },
                {
                    "subclass": "485",
                    "merge_with_existing_entity": None,
                    "label": "Temporary Graduate visa",
                    "add_roles": ["previous_visa"],
                    "add_facts": {},
                    "confidence": "high",
                    "reason": "485 is prior history only",
                },
            ],
            "current_focus": {
                "focus_id": "focus_test",
                "user_request_summary": "User added facts about a refused 500 Student visa.",
                "primary_visa_entity_id": None,
                "primary_subclass": "500",
                "primary_role": "refused_application",
                "supporting_entities": [{"entity_id": None, "subclass": "485", "role_in_this_focus": "previous_visa_history", "reason": "prior visa"}],
                "candidate_focuses": [],
                "issue_family": "visa_refusal",
                "operation": "student_refusal_next_steps",
                "suggested_case_frame_id": "500_refusal_review",
                "schedule2_candidate_subclasses": ["500", "485"],
                "schedule1_relevance": "none",
                "deferred_dependencies": [],
                "next_best_question": "你是哪一天收到拒签通知的？拒签信里是否写了 review rights / ART？",
                "answer_strategy": "answer_first_then_ask",
                "confidence": "high",
                "reason": "refused/applied visa beats previous visa for refusal focus",
            },
            "artifact_request": {"requested": False, "artifact_type": "none", "explicit_acceptance": False, "uses_pending_offer": False, "reason": None},
            "pending_offer_accepted": False,
            "pending_offer_rejected_or_ignored": True,
            "execution_path": "legal_reasoning_pipeline",
            "force_schedule2_search": True,
            "force_fact_merge_before_artifact": True,
            "schedule2_candidates": [],
            "new_fact_updates": {"application_location": "overseas", "family_location": "overseas"},
            "reasons": ["smoke_fixture"],
            "raw_model_output": {},
        }, ensure_ascii=False))


class _FakeClient:
    responses = _FakeResponses()


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
    service = FullContextTurnResolverService(client=_FakeClient())
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
    print(json.dumps(result.model_dump(mode="json"), ensure_ascii=False, indent=2))
    print("\nProjected intake facts:")
    for key, value in result.to_intake_facts().items():
        if key in {"legal_focus_frame", "visa_entity_updates"}:
            continue
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
