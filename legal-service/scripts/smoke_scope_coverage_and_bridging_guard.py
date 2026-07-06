from __future__ import annotations

from types import SimpleNamespace

from app.services.customer_answer_plan_service import CustomerAnswerPlanService
from app.services.schedule2_ranked_candidate_service import Schedule2RankedCandidateService

question = (
    "Please advise on and provide all the possible options on how a specialised overseas "
    "worker can come to Australia to do some short term work for an Australian employer."
)
ranked_map = Schedule2RankedCandidateService().build(
    original_question=question,
    effective_question=question,
    known_facts={},
    proposal={"known_facts": []},
)
subclasses = [candidate.subclass for candidate in ranked_map.ranked_candidates]
assert subclasses[0] == "400", subclasses
assert "010" not in subclasses and "020" not in subclasses and "050" not in subclasses, subclasses
assert ranked_map.legal_intent.bridging_or_status_issue is False
if "482" in subclasses:
    candidate_482 = next(candidate for candidate in ranked_map.ranked_candidates if candidate.subclass == "482")
    assert candidate_482.fit in {"possible", "weak", "uncertain"}, candidate_482

plan = CustomerAnswerPlanService().build(
    original_question=question,
    effective_question=question,
    known_facts={},
    proposal={
        "proposal_summary": "Compare all possible short-term work options.",
        "answer_scope_contract": {
            "user_requested_scope": "all_possible_options",
            "breadth_required": "broad",
            "must_include_buckets": [],
            "may_include_buckets": [],
            "must_not_include_buckets": [],
            "completeness_standard": "Include conditional options.",
            "compactness_standard": "Use tiered option map.",
        },
        "known_facts": [],
    },
    verification={"confidence": "medium", "verified_candidates": []},
    evidence=SimpleNamespace(local_chunks=[], live_chunks=[], schedule_clauses=[]),
    verification_plan={"verification_depth": "exhaustive_schedule2"},
    ranked_candidate_map=ranked_map,
)
coverage_codes = {code for item in plan.public_option_coverage_map for code in item.get("subclasses", [])}
for code in ["400", "482", "407", "408", "403", "417", "462", "600", "601", "651"]:
    assert code in coverage_codes, (code, plan.public_option_coverage_map)
assert plan.answer_scope_contract["user_requested_scope"] == "all_possible_options"
print("OK: scope coverage and bridging guard smoke passed")
