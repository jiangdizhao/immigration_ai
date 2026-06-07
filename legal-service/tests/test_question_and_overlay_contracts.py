
from __future__ import annotations

from app.schemas.query import QueryResponse
from app.schemas.state import MatterState
from app.services.communication_plan_service import CommunicationPlanService
from app.services.legal_decision_service import LegalDecisionService
from app.services.policy_rules import PolicyRules


def test_missing_fact_from_answerability_becomes_required_question() -> None:
    response = QueryResponse(
        matter_id="m1",
        answer="Provisional answer.",
        response_language="zh",
        confidence="low",
        issue_type="visa_refusal",
        missing_facts=[],
        follow_up_questions=[],
        citations=[],
        compact_sources=[],
        escalate=True,
        next_action="answer",
        retrieval_debug={
            "policy": {
                "coverage_summary": {
                    "required_facts_missing": ["notification_date", "refusal_notice_available"],
                }
            }
        },
    )
    state = MatterState(
        issue_type="visa_refusal",
        visa_type="student",
        operation_type="student_refusal_next_steps",
        carried_intake_facts={"active_case_frame_id": "500_refusal_review"},
    )
    decision = LegalDecisionService().build(
        response=response,
        state=state,
        semantic_turn=None,
        original_question="500 refused",
        effective_question="500 refused",
        retrieval_debug=response.retrieval_debug,
    )
    assert decision.missing_facts
    assert decision.missing_facts[0].fact_key == "notification_date"
    assert decision.action_recommendation.one_next_question == "你是哪一天收到拒签通知的？"

    plan = CommunicationPlanService().build(decision=decision, semantic_turn=None, response_language="zh")
    assert plan.question_policy == "ask_one_required_question"
    assert plan.content.optional_next_question == "你是哪一天收到拒签通知的？"


def test_critical_technology_overlay_requires_explicit_focus() -> None:
    policy = PolicyRules()
    request = policy._schedule_policy_overlay_live_request(
        {
            "schedule_aware_criterion_reasoning": {
                "active_pathway": "refusal_cancellation",
                "current_policy_flags": ["needs_live_policy_check"],
                "debug": {"fact_snapshot": {"visa_subclass": "500"}},
                "policy_overlays": [
                    {
                        "policy_key": "500_critical_technology_condition8208",
                        "freshness_required": True,
                        "preferred_urls": [
                            "https://www.homeaffairs.gov.au/about-us/our-portfolios/national-security/technology-and-data-security/critical-technology"
                        ],
                    }
                ],
            }
        }
    )
    assert request is None


def test_critical_technology_overlay_allowed_when_explicit() -> None:
    policy = PolicyRules()
    request = policy._schedule_policy_overlay_live_request(
        {
            "schedule_aware_criterion_reasoning": {
                "active_pathway": "critical_technology",
                "current_policy_flags": ["needs_live_policy_check"],
                "debug": {"fact_snapshot": {"visa_subclass": "500", "critical_technology_context": True}},
                "policy_overlays": [
                    {
                        "policy_key": "500_critical_technology_condition8208",
                        "freshness_required": True,
                        "preferred_urls": [
                            "https://www.homeaffairs.gov.au/about-us/our-portfolios/national-security/technology-and-data-security/critical-technology"
                        ],
                    }
                ],
            }
        }
    )
    assert request is not None
    assert "500_critical_technology_condition8208" in request["missing"]
