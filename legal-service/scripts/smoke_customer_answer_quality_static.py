from __future__ import annotations

import inspect
from types import SimpleNamespace

from app.schemas.customer_answer import VerificationValueSummary
from app.services.customer_answer_plan_service import CustomerAnswerPlanService
from app.services.proposal_first_verified_answer_service import ProposalFirstVerifiedAnswerService


service = CustomerAnswerPlanService()
plan = service.build(
    original_question="Which visa stream fits?",
    effective_question="Which visa pathway fits?",
    known_facts={},
    proposal={"proposal_summary": "Explain streams plainly.", "candidate_index": []},
    verification={},
    evidence=SimpleNamespace(local_chunks=[], live_chunks=[], schedule_clauses=[]),
    verification_plan={"verification_depth": "light"},
)
trace = service.trace_fields(plan)

required_trace_keys = {
    "customer_answer_plan",
    "verification_value_summary",
    "unsupported_claims_removed",
    "customer_terms_avoided",
    "examples_allowed_or_blocked",
    "checklist_items_allowed_or_blocked",
}
missing_trace_keys = required_trace_keys - set(trace)
assert not missing_trace_keys, f"missing customer answer trace fields: {missing_trace_keys}"

summary = VerificationValueSummary(
    checking_depth="exhaustive_schedule2",
    checked_candidate_count=2,
    checked_source_count=4,
)
assert summary.checked_candidate_count == 2

prompt_rules = service.final_answer_prompt_rules(plan)
required_prompt_markers = [
    "CustomerAnswerPlan",
    "normal customer",
    "practical bottom line",
    "plain English",
    "Do not invent examples",
    "If allowed_examples is empty, do not include examples",
    "If allowed_checklist_items is empty, do not include a document checklist",
    "Ask at most one decisive follow-up question",
]
for marker in required_prompt_markers:
    assert marker in prompt_rules, f"final-answer prompt rules missing marker: {marker}"

for term, replacement in service.PLAIN_LANGUAGE_REPLACEMENTS.items():
    assert term in plan.customer_terms_to_avoid
    assert plan.required_plain_language_replacements[term] == replacement
    assert replacement

draft_fn = inspect.signature(ProposalFirstVerifiedAnswerService._draft_verified_answer)
assert "customer_answer_plan" in draft_fn.parameters

draft_source = inspect.getsource(ProposalFirstVerifiedAnswerService._draft_verified_answer)
for marker in [
    "final_answer_prompt_rules",
    "CustomerAnswerPlan JSON",
    "customer_answer_plan",
]:
    assert marker in draft_source, f"_draft_verified_answer missing customer plan marker: {marker}"

print("OK: customer-answer quality static integration markers are present")
