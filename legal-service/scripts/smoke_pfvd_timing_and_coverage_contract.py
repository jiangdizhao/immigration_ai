#!/usr/bin/env python3
from __future__ import annotations

from app.services.customer_answer_plan_service import CustomerAnswerPlanService
from app.services.proposal_first_verification_depth_answer_service import ProposalFirstVerificationDepthAnswerService

service = ProposalFirstVerificationDepthAnswerService()
items = service._dict_list([{"subclass": "400"}, "bad", None])
assert items == [{"subclass": "400"}], items

question = (
    "Please advise on and provide all the possible options on how a specialised overseas "
    "worker can come to Australia to do some short term work for an Australian employer."
)
plan_service = CustomerAnswerPlanService()
contract = plan_service._answer_scope_contract(
    original_question=question,
    effective_question=question,
    proposal={},
)
assert contract["user_requested_scope"] == "all_possible_options", contract

rules = plan_service.final_answer_prompt_rules(
    {
        "answer_scope_contract": contract,
        "public_option_coverage_map": [
            {"bucket": "training_alternative", "subclasses": ["407"], "show_to_customer": True},
            {"bucket": "independent_work_rights_if_eligible", "subclasses": ["417", "462"], "show_to_customer": True},
        ],
        "ranked_candidate_map": {"ranked_candidates": []},
        "answer_composition_plan": {"table_allowed": True, "answer_shape": "ranked_options_with_boundary"},
    }
)
assert "public_option_coverage_map" in rules
assert "tiered option map" in rules
print("OK: PFVD timing helper and broad-scope coverage prompt contract are present")
