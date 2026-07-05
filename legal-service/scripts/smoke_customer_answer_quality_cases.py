from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from app.services.customer_answer_plan_service import CustomerAnswerPlanService


def fake_evidence() -> SimpleNamespace:
    source = SimpleNamespace(title="Home Affairs Temporary Work guidance", url="https://immi.example/400")
    chunk = SimpleNamespace(source=source, section_ref="Eligibility", heading="Temporary specialist work")
    return SimpleNamespace(
        local_chunks=[chunk],
        live_chunks=[],
        schedule_clauses=[
            {
                "schedule_no": "2",
                "subclass": "400",
                "clause_ref": "400.2",
                "heading": "Temporary specialist work",
            },
            {
                "schedule_no": "2",
                "subclass": "482",
                "clause_ref": "482.2",
                "heading": "Skills in demand",
            },
        ],
        schedule_candidates=[],
        retrieval_runs=[],
        live_debug=[],
    )


def base_proposal(**overrides: Any) -> dict[str, Any]:
    proposal = {
        "proposal_summary": "Compare practical Australian work visa pathways.",
        "proposal_memo_markdown": (
            "The proposal compares Subclass 400 and Subclass 482. For example, "
            "some work may be a short specialist project, but examples need verification."
        ),
        "candidate_index": [
            {"candidate_label": "Subclass 400", "subclass": "400"},
            {"candidate_label": "Subclass 482", "subclass": "482"},
        ],
        "missing_decisive_facts": ["whether the work is a fixed temporary project"],
        "one_decisive_question": "Is the work a fixed temporary project or an ongoing role?",
        "risk_flags": [],
        "known_facts": [{"fact": "Australian employer wants an overseas worker", "source": "latest_user_turn"}],
    }
    proposal.update(overrides)
    return proposal


def verification(candidates: list[dict[str, Any]], **overrides: Any) -> dict[str, Any]:
    data = {
        "confidence": "medium",
        "verified_candidates": candidates,
        "unsupported_or_contradicted_claims": [],
        "must_remove_or_qualify": [],
        "one_decisive_question": "Is the work a fixed temporary project or an ongoing role?",
    }
    data.update(overrides)
    return data


service = CustomerAnswerPlanService()

short_term_plan = service.build(
    original_question="We need a short-term specialist overseas worker for an Australian employer.",
    effective_question="Short-term specialist overseas worker visa options.",
    known_facts={"duration": "short term", "employer": "Australian employer"},
    proposal=base_proposal(),
    verification=verification(
        [
            {
                "candidate_label": "Subclass 400",
                "fit": "likely",
                "supported_points": ["Subclass 400 may fit fixed short-term specialist work."],
                "evidence_numbers": [1],
            },
            {
                "candidate_label": "Subclass 482",
                "fit": "possible",
                "supported_points": ["Subclass 482 may matter if the role is ongoing."],
                "evidence_numbers": [2],
            },
            {
                "candidate_label": "Visitor/business visitor",
                "fit": "weak",
                "supported_points": [],
                "missing_verification": ["whether the person will actually perform work"],
            },
        ]
    ),
    evidence=fake_evidence(),
    verification_plan={"verification_depth": "exhaustive_schedule2"},
)
assert short_term_plan.answer_style == "ranked_options"
assert "ranked_option_map" in short_term_plan.recommended_modules
assert "unsuitable_option_warning" in short_term_plan.recommended_modules
assert short_term_plan.allowed_examples == []
assert short_term_plan.blocked_examples
assert short_term_plan.verification_value_summary.checked_candidate_count == 3
assert short_term_plan.verification_value_summary.checked_source_count >= 2
assert short_term_plan.one_decisive_question

ongoing_plan = service.build(
    original_question="The employer cannot find a local worker and needs someone overseas for 12 months.",
    effective_question="Australian employer needs overseas worker for 12 months.",
    known_facts={"duration": "12 months"},
    proposal=base_proposal(proposal_memo_markdown="Compare 482 with a warning about 400."),
    verification=verification(
        [
            {"candidate_label": "Subclass 482", "fit": "likely", "supported_points": ["482 may fit an ongoing sponsored role."]},
            {"candidate_label": "Subclass 400", "fit": "weak", "corrections": ["400 should not be presented as a normal ongoing work option."]},
        ]
    ),
    evidence=fake_evidence(),
    verification_plan={"verification_depth": "exhaustive_schedule2"},
)
assert ongoing_plan.answer_style == "ranked_options"
assert ongoing_plan.verification_value_summary.important_corrections
assert "unsuitable_option_warning" in ongoing_plan.recommended_modules

meetings_plan = service.build(
    original_question="The overseas expert is only attending meetings in Australia.",
    effective_question="Visa options for attending meetings only.",
    known_facts={"activity": "meetings only"},
    proposal=base_proposal(candidate_index=[{"candidate_label": "Business visitor", "subclass": None}]),
    verification=verification(
        [
            {
                "candidate_label": "Business visitor",
                "fit": "possible",
                "supported_points": ["Meetings may be different from actually doing work."],
            }
        ],
        one_decisive_question="Will the person actually do work or only attend meetings?",
    ),
    evidence=fake_evidence(),
    verification_plan={"verification_depth": "targeted_rag"},
)
assert meetings_plan.answer_style == "eligibility_explanation"
assert meetings_plan.one_decisive_question == "Will the person actually do work or only attend meetings?"

student_refusal_plan = service.build(
    original_question="My student visa was refused. What should I do next?",
    effective_question="Student visa refusal next steps.",
    known_facts={},
    proposal=base_proposal(risk_flags=["refusal"], proposal_memo_markdown="Refusal and review risk."),
    verification=verification([], one_decisive_question="What date were you notified of the refusal?"),
    evidence=fake_evidence(),
    verification_plan={"verification_depth": "high_risk_handoff"},
)
assert student_refusal_plan.answer_style == "lawyer_handoff"
assert "lawyer_handoff" in student_refusal_plan.recommended_modules

parent_sponsor_plan = service.build(
    original_question="What does the parent visa sponsor requirement mean?",
    effective_question="Parent visa sponsor requirement.",
    known_facts={},
    proposal=base_proposal(
        proposal_summary="Explain sponsor and nomination in plain English.",
        candidate_index=[{"candidate_label": "Parent visa sponsorship", "subclass": None}],
    ),
    verification=verification(
        [{"candidate_label": "Parent visa sponsorship", "fit": "possible", "supported_points": ["A sponsor is relevant."]}]
    ),
    evidence=fake_evidence(),
    verification_plan={"verification_depth": "targeted_rag"},
)
assert (
    parent_sponsor_plan.required_plain_language_replacements["sponsor"]
    == "the person or organisation supporting the visa application"
)
assert "stream" in parent_sponsor_plan.customer_terms_to_avoid

subclass_485_plan = service.build(
    original_question="Can I apply for a 485 pathway after study?",
    effective_question="Subclass 485 pathway after study.",
    known_facts={"recent_study": True},
    proposal=base_proposal(
        proposal_summary="Explain the 485 pathway without unsupported dates or thresholds.",
        candidate_index=[{"candidate_label": "Subclass 485", "subclass": "485"}],
    ),
    verification=verification(
        [{"candidate_label": "Subclass 485", "fit": "possible", "supported_points": ["485 may be relevant after study."]}],
        unsupported_or_contradicted_claims=["Do not state a current age limit or date without current official evidence."],
    ),
    evidence=fake_evidence(),
    verification_plan={"verification_depth": "targeted_rag"},
)
assert "Do not state a current age limit or date without current official evidence." in subclass_485_plan.unsupported_or_do_not_say
assert subclass_485_plan.allowed_checklist_items == []

print("OK: customer-answer quality deterministic case smoke tests passed")
