from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import BaseSchema


AnswerStyle = Literal[
    "direct_short",
    "ranked_options",
    "eligibility_explanation",
    "risk_warning",
    "document_guidance",
    "lawyer_handoff",
]

AnswerModule = Literal[
    "bottom_line",
    "ranked_option_map",
    "decision_boundary",
    "verified_examples",
    "verified_checklist",
    "unsuitable_option_warning",
    "one_follow_up_question",
    "lawyer_handoff",
]

SupportSource = Literal[
    "user_fact",
    "verified_evidence",
    "official_guidance",
    "schedule_material",
    "lawyer_approved_static",
    "verification",
]

ConfidenceLevel = Literal["low", "medium", "high"]


class SupportedFact(BaseSchema):
    text: str
    source: SupportSource = "verification"
    evidence_numbers: list[int] = Field(default_factory=list)
    confidence: ConfidenceLevel = "medium"


class SupportedExample(BaseSchema):
    text: str
    support_source: SupportSource
    evidence_numbers: list[int] = Field(default_factory=list)
    source_note: str | None = None


class SupportedChecklistItem(BaseSchema):
    item: str
    support_source: SupportSource
    evidence_numbers: list[int] = Field(default_factory=list)
    source_note: str | None = None


class VerificationValueSummary(BaseSchema):
    checking_depth: str = "targeted_rag"
    checked_candidate_count: int = 0
    checked_source_count: int = 0
    important_corrections: list[str] = Field(default_factory=list)
    unsupported_claims_removed: list[str] = Field(default_factory=list)
    key_uncertainties: list[str] = Field(default_factory=list)
    customer_visible_summary: str | None = None
    lawyer_visible_summary: str | None = None


class CustomerAnswerPlan(BaseSchema):
    """Internal plan for customer wording after legal verification.

    This object is never displayed directly to customers. It keeps legal
    verification, customer-facing wording, and lawyer-review value tracing as
    separate concerns.
    """

    answer_style: AnswerStyle = "eligibility_explanation"
    plain_english_bottom_line: str | None = None
    recommended_modules: list[AnswerModule] = Field(default_factory=list)

    customer_terms_to_avoid: list[str] = Field(default_factory=list)
    required_plain_language_replacements: dict[str, str] = Field(default_factory=dict)

    supported_customer_facts: list[SupportedFact] = Field(default_factory=list)
    unsupported_or_do_not_say: list[str] = Field(default_factory=list)

    allowed_examples: list[SupportedExample] = Field(default_factory=list)
    blocked_examples: list[str] = Field(default_factory=list)

    allowed_checklist_items: list[SupportedChecklistItem] = Field(default_factory=list)
    blocked_checklist_items: list[str] = Field(default_factory=list)

    verification_value_summary: VerificationValueSummary = Field(
        default_factory=VerificationValueSummary
    )
    one_decisive_question: str | None = None
