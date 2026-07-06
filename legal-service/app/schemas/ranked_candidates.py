from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import BaseSchema


ScreeningStatus = Literal["activated", "adjacent", "excluded", "uncertain"]
CandidateFit = Literal["likely", "possible", "weak", "excluded", "uncertain"]
CandidateConfidence = Literal["low", "medium", "high"]


class LegalIntent(BaseSchema):
    matter_domain: str | None = None
    person_role: str | None = None
    australian_party_role: str | None = None
    activity_type: str | None = None
    duration_intent: str | None = None
    specialisation: str | None = None
    regional_issue: bool = False
    permanent_residence_intent: bool = False
    employer_involvement: bool | None = None
    actual_work_in_australia: bool | None = None
    ongoing_role: bool | None = None
    training_purpose: bool | None = None
    business_meetings_only: bool | None = None
    family_relationship_issue: bool = False
    study_issue: bool = False
    graduate_issue: bool = False
    protection_or_humanitarian_issue: bool = False
    refusal_or_review_issue: bool = False
    bridging_or_status_issue: bool = False
    explicitly_mentioned_subclasses: list[str] = Field(default_factory=list)
    uncertainty_notes: list[str] = Field(default_factory=list)


class SkeletonScreeningResult(BaseSchema):
    subclass: str
    title: str | None = None
    family: str | None = None
    status: ScreeningStatus
    score: float = 0.0
    positive_reasons: list[str] = Field(default_factory=list)
    negative_reasons: list[str] = Field(default_factory=list)
    missing_decisive_facts: list[str] = Field(default_factory=list)
    matched_tags: list[str] = Field(default_factory=list)
    conflicted_tags: list[str] = Field(default_factory=list)


class RankedCandidate(BaseSchema):
    subclass: str
    title: str | None = None
    rank: int
    fit: CandidateFit
    confidence: CandidateConfidence = "medium"
    legal_fit_score: float = 0.0
    why_likely_or_possible: list[str] = Field(default_factory=list)
    why_maybe_not: list[str] = Field(default_factory=list)
    missing_decisive_facts: list[str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)


class RankedCandidateMap(BaseSchema):
    legal_intent: LegalIntent
    screened_subclass_count: int = 0
    activated_count: int = 0
    adjacent_count: int = 0
    excluded_count: int = 0
    uncertain_count: int = 0
    ranked_candidates: list[RankedCandidate] = Field(default_factory=list)
    excluded_candidates: list[SkeletonScreeningResult] = Field(default_factory=list)
    noisy_or_rejected_candidates: list[SkeletonScreeningResult] = Field(default_factory=list)
    primary_decision_boundary: str | None = None
    confidence_floor: CandidateConfidence = "medium"


class AnswerCompositionPlan(BaseSchema):
    answer_shape: Literal[
        "direct_recommendation",
        "ranked_options_with_boundary",
        "eligibility_explanation",
        "risk_handoff",
        "document_guidance",
        "appointment_intake",
    ] = "eligibility_explanation"
    opening_style: Literal[
        "bottom_line_first",
        "risk_first",
        "clarify_scope_first",
    ] = "bottom_line_first"
    customer_goal_summary: str | None = None
    practical_bottom_line: str | None = None
    primary_decision_boundary: str | None = None
    required_sections: list[str] = Field(default_factory=list)
    optional_sections: list[str] = Field(default_factory=list)
    forbidden_sections: list[str] = Field(default_factory=list)
    table_allowed: bool = False
    table_purpose: str | None = None
    examples_allowed: bool = False
    checklist_allowed: bool = False
    tone_rules: list[str] = Field(default_factory=list)
    length_target: Literal["short", "medium", "detailed"] = "medium"
