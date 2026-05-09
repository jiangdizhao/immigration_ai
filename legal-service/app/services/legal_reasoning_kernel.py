from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

CriterionLayer = Literal[
    "schedule1_validity",
    "schedule2_grant",
    "cross_subclass_dependency",
    "practical_consequence",
]

CriterionStatus = Literal[
    "satisfied",
    "missing",
    "risk",
    "failed",
    "not_applicable",
    "requires_lawyer_review",
]


@dataclass(frozen=True, slots=True)
class CriterionNode:
    """
    A reusable legal criterion node.

    The important design choice is that RAG supports this node; RAG does not
    invent the node. A node may represent a Schedule 1 validity step, a
    Schedule 2 grant criterion, or a cross-subclass dependency.
    """

    id: str
    label: str
    layer: CriterionLayer
    legal_basis: tuple[str, ...] = ()
    applies_to_pathways: tuple[str, ...] = ()
    required_facts: tuple[str, ...] = ()
    optional_facts: tuple[str, ...] = ()
    risk_facts: tuple[str, ...] = ()
    source_queries: tuple[str, ...] = ()
    source_classes: tuple[str, ...] = ()
    next_question: str | None = None
    customer_explanation: str = ""
    lawyer_note: str = ""


@dataclass(slots=True)
class CriterionEvidence:
    chunk_ids: list[str] = field(default_factory=list)
    source_titles: list[str] = field(default_factory=list)
    source_classes: list[str] = field(default_factory=list)
    retrieval_queries: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class CriterionAssessment:
    node_id: str
    label: str
    layer: CriterionLayer
    status: CriterionStatus
    required_facts: list[str] = field(default_factory=list)
    missing_facts: list[str] = field(default_factory=list)
    known_facts: dict[str, Any] = field(default_factory=dict)
    legal_basis: list[str] = field(default_factory=list)
    evidence: CriterionEvidence = field(default_factory=CriterionEvidence)
    reason: str = ""
    next_question: str | None = None
    risk_flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["evidence"] = self.evidence.to_dict()
        return data


@dataclass(slots=True)
class ScheduleAwareAssessment:
    """
    Matter-level trace for schedule-aware criterion reasoning.

    This is deliberately serializable so it can be placed inside
    retrieval_debug / Matter metadata without schema migration.
    """

    is_active: bool
    subclass: str | None = None
    user_goal: str | None = None
    candidate_pathways: list[str] = field(default_factory=list)
    active_pathway: str | None = None
    criteria: list[CriterionAssessment] = field(default_factory=list)
    recommended_next_fact: str | None = None
    recommended_next_question: str | None = None
    missing_facts: list[str] = field(default_factory=list)
    risk_flags: list[str] = field(default_factory=list)
    satisfied_count: int = 0
    missing_count: int = 0
    risk_count: int = 0
    failed_count: int = 0
    summary: str = ""
    debug: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["criteria"] = [criterion.to_dict() for criterion in self.criteria]
        return data


class LegalReasoningKernel:
    """
    Shared helper used by subclass-specific criterion packs.

    It implements status classification and next-fact selection. Subclass
    packs remain responsible for pathway-specific legal content.
    """

    known_status_values = {"known", "not_applicable", "document_unavailable", "user_unsure"}

    def fact_present(self, facts: dict[str, Any], key: str) -> bool:
        value = facts.get(key)
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip()) and value.strip().lower() not in {
                "unknown",
                "not_sure",
                "not sure",
                "unsure",
                "n/a",
                "na",
            }
        if isinstance(value, (list, tuple, set, dict)):
            return bool(value)
        return True

    def known_fact_subset(self, facts: dict[str, Any], keys: tuple[str, ...] | list[str]) -> dict[str, Any]:
        return {key: facts.get(key) for key in keys if self.fact_present(facts, key)}

    def missing_facts(self, facts: dict[str, Any], keys: tuple[str, ...] | list[str]) -> list[str]:
        return [key for key in keys if not self.fact_present(facts, key)]

    def evaluate_node(
        self,
        node: CriterionNode,
        facts: dict[str, Any],
        *,
        forced_status: CriterionStatus | None = None,
        reason: str | None = None,
        risk_flags: list[str] | None = None,
        evidence: CriterionEvidence | None = None,
    ) -> CriterionAssessment:
        missing = self.missing_facts(facts, node.required_facts)
        known = self.known_fact_subset(facts, node.required_facts + node.optional_facts)

        if forced_status is not None:
            status = forced_status
        elif missing:
            status = "missing"
        else:
            status = "satisfied"

        if risk_flags and status == "satisfied":
            status = "risk"

        return CriterionAssessment(
            node_id=node.id,
            label=node.label,
            layer=node.layer,
            status=status,
            required_facts=list(node.required_facts),
            missing_facts=missing,
            known_facts=known,
            legal_basis=list(node.legal_basis),
            evidence=evidence or CriterionEvidence(retrieval_queries=list(node.source_queries)),
            reason=reason or self._default_reason(status, missing),
            next_question=node.next_question if missing else None,
            risk_flags=risk_flags or [],
        )

    def select_next_fact(self, criteria: list[CriterionAssessment]) -> tuple[str | None, str | None]:
        for criterion in criteria:
            if criterion.status in {"missing", "risk", "requires_lawyer_review"} and criterion.missing_facts:
                return criterion.missing_facts[0], criterion.next_question
        return None, None

    def summarize_counts(self, criteria: list[CriterionAssessment]) -> dict[str, int]:
        return {
            "satisfied": sum(1 for item in criteria if item.status == "satisfied"),
            "missing": sum(1 for item in criteria if item.status == "missing"),
            "risk": sum(1 for item in criteria if item.status == "risk"),
            "failed": sum(1 for item in criteria if item.status == "failed"),
            "requires_lawyer_review": sum(1 for item in criteria if item.status == "requires_lawyer_review"),
        }

    def _default_reason(self, status: CriterionStatus, missing: list[str]) -> str:
        if status == "missing" and missing:
            return "The criterion cannot be assessed until the missing fact(s) are provided."
        if status == "risk":
            return "The known facts suggest a possible refusal or evidentiary risk."
        if status == "failed":
            return "The known facts appear inconsistent with this criterion."
        if status == "not_applicable":
            return "This criterion is not applicable on the current pathway."
        if status == "requires_lawyer_review":
            return "This criterion is document-dependent or legally sensitive and should be reviewed by a lawyer."
        return "The currently known facts are enough to treat this criterion as provisionally satisfied."
