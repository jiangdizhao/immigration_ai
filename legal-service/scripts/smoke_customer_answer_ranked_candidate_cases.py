from __future__ import annotations

from types import SimpleNamespace

from app.services.customer_answer_plan_service import CustomerAnswerPlanService
from app.services.schedule2_ranked_candidate_service import Schedule2RankedCandidateService


def fake_evidence() -> SimpleNamespace:
    return SimpleNamespace(local_chunks=[], live_chunks=[], schedule_clauses=[])


question = (
    "Australian business needs an overseas specialist worker to come for a few weeks "
    "for a fixed short-term specialist task with clear end date, not an ongoing role."
)

ranked_map = Schedule2RankedCandidateService().build(
    original_question=question,
    effective_question=question,
    known_facts={},
    proposal={},
)

service = CustomerAnswerPlanService()
plan = service.build(
    original_question=question,
    effective_question=question,
    known_facts={"duration": "few weeks", "activity": "specialist task"},
    proposal={
        "proposal_summary": "Compare the short-term specialist and sponsored skilled pathways.",
        "candidate_index": [
            {"candidate_label": "Subclass 400", "subclass": "400"},
            {"candidate_label": "Subclass 482", "subclass": "482"},
        ],
    },
    verification={"confidence": "high", "verified_candidates": []},
    evidence=fake_evidence(),
    verification_plan={"verification_depth": "exhaustive_schedule2"},
    ranked_candidate_map=ranked_map,
)

assert plan.ranked_candidate_map is not None
assert [candidate.subclass for candidate in plan.ranked_candidate_map.ranked_candidates[:2]] == [
    "400",
    "482",
]
assert plan.answer_style == "ranked_options"
assert plan.answer_composition_plan.answer_shape == "ranked_options_with_boundary"
assert plan.answer_composition_plan.table_allowed is True
assert "ranked_option_map" in plan.answer_composition_plan.required_sections
assert plan.one_decisive_question
assert "fixed short-term specialist task" in plan.one_decisive_question
assert "ongoing sponsored job role" in plan.one_decisive_question

prompt_rules = service.final_answer_prompt_rules(plan)
assert "ranked_candidate_map.ranked_candidates order exactly" in prompt_rules
assert "answer_composition_plan.table_allowed is true" in prompt_rules

citations = [
    SimpleNamespace(
        source_id="schedule-2-400",
        title="Migration Regulations 1994 Schedule 2 Subclass 400",
        section_ref="400.2",
        citation_text="Subclass 400 primary criteria",
        quote_text="",
    ),
    SimpleNamespace(
        source_id="schedule-2-482",
        title="Migration Regulations 1994 Schedule 2 Subclass 482",
        section_ref="482.2",
        citation_text="Subclass 482 primary criteria",
        quote_text="",
    ),
    SimpleNamespace(
        source_id="schedule-2-500",
        title="Migration Regulations 1994 Schedule 2 Subclass 500",
        section_ref="500.2",
        citation_text="Subclass 500 student criteria",
        quote_text="",
    ),
]
visible = service.filter_customer_visible_citations(citations, plan)
assert [citation.source_id for citation in visible] == ["schedule-2-400", "schedule-2-482"]

trace = service.trace_fields(plan)
assert trace["answer_composition_plan"]["table_allowed"] is True
assert set(trace["customer_visible_source_refs"]) >= {"schedule-2-400", "schedule-2-482"}
assert "schedule-2-500" not in trace["customer_visible_source_refs"]

print("OK: customer answer ranked-candidate composition cases passed")
