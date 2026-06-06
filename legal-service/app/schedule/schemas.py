from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


SectionKind = Literal[
    "interpretation",
    "primary_criteria",
    "time_of_application",
    "time_of_decision",
    "secondary_criteria",
    "circumstances_applicable_to_grant",
    "visa_effect",
    "conditions",
    "schedule1_validity",
    "other",
]

MatchType = Literal[
    "exact_subclass",
    "alias",
    "clause_keyword",
    "semantic",
    "online_mapped",
    "fallback",
]

AnswerTier = Literal[
    "orientation_answer",
    "provisional_schedule2_answer",
    "specific_clause_answer",
    "lawyer_escalation",
]


class ScheduleClause(BaseModel):
    """A rough but auditable clause/section unit from Schedule 1 or Schedule 2.

    The indexer intentionally keeps extraction conservative. The clause text is
    the source of truth; downstream packs should not invent criteria that cannot
    be anchored to these clauses.
    """

    schedule_no: Literal["1", "2"]
    subclass: str | None = None
    class_code: str | None = None
    title: str | None = None
    clause_ref: str
    heading: str = ""
    section_kind: SectionKind = "other"
    text: str = ""
    source_file: str = ""
    source_title: str | None = None
    start_index: int | None = None
    end_index: int | None = None
    deferred_dependencies: list[str] = Field(default_factory=list)

    def compact_text(self, max_chars: int = 800) -> str:
        text = " ".join((self.text or "").split())
        return text[:max_chars]


class ScheduleCandidate(BaseModel):
    """Ranked Schedule 2 candidate selected before legal reasoning."""

    subclass: str
    title: str | None = None
    confidence: Literal["low", "medium", "high"] = "medium"
    match_type: MatchType = "fallback"
    matched_clauses: list[str] = Field(default_factory=list)
    reason: str = ""
    score: float = 0.0
    source: str = "schedule2_candidate_search"
    deferred_dependencies: list[str] = Field(default_factory=list)


class ScheduleFrame(BaseModel):
    """Generic schedule-derived legal frame used when no enhanced pack exists."""

    subclass: str | None = None
    title: str | None = None
    schedule_no: Literal["1", "2"] = "2"
    active_clauses: list[ScheduleClause] = Field(default_factory=list)
    likely_operation: str | None = None
    required_facts: list[str] = Field(default_factory=list)
    optional_facts: list[str] = Field(default_factory=list)
    next_best_fact: str | None = None
    next_best_question: str | None = None
    answer_tier: AnswerTier = "provisional_schedule2_answer"
    deferred_dependencies: list[str] = Field(default_factory=list)
    debug: dict[str, Any] = Field(default_factory=dict)
