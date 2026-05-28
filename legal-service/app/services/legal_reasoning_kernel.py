from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

CriterionLayer = Literal[
    "schedule1_validity",
    "schedule2_grant",
    "cross_subclass_dependency",
    "current_policy_overlay",
    "practical_consequence",
]

CriterionStatus = Literal[
    "satisfied",
    "missing",
    "risk",
    "failed",
    "not_applicable",
    "requires_lawyer_review",
    "needs_live_policy_check",
    "unknown_current_policy",
    "current_policy_risk",
    "superseded_policy_risk",
]


@dataclass(frozen=True, slots=True)
class CriterionNode:
    # RAG supports this node; RAG does not invent the node.
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

    # Current-policy overlay metadata.
    policy_key: str | None = None
    affected_nodes: tuple[str, ...] = ()
    freshness_required: bool = False
    preferred_urls: tuple[str, ...] = ()
    live_query_hints: tuple[str, ...] = ()
    last_verified_source: str | None = None

    # Customer-mode controls. These prevent the criterion tree from becoming
    # an interrogation script.
    answer_blocking: bool = False
    customer_ask_priority: int = 50
    ask_only_if_user_wants_full_check: bool = False
    default_customer_action: str = "answer_with_caveat"


@dataclass(slots=True)
class CriterionEvidence:
    chunk_ids: list[str] = field(default_factory=list)
    source_titles: list[str] = field(default_factory=list)
    source_classes: list[str] = field(default_factory=list)
    retrieval_queries: list[str] = field(default_factory=list)
    preferred_urls: list[str] = field(default_factory=list)
    live_query_hints: list[str] = field(default_factory=list)
    freshness_required: bool = False

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

    policy_key: str | None = None
    affected_nodes: list[str] = field(default_factory=list)
    freshness_required: bool = False
    preferred_urls: list[str] = field(default_factory=list)
    live_query_hints: list[str] = field(default_factory=list)
    answer_blocking: bool = False
    customer_ask_priority: int = 50
    ask_only_if_user_wants_full_check: bool = False
    default_customer_action: str = "answer_with_caveat"

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["evidence"] = self.evidence.to_dict()
        return data


@dataclass(slots=True)
class ScheduleAwareAssessment:
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
    policy_overlay_count: int = 0
    policy_overlays: list[dict[str, Any]] = field(default_factory=list)
    current_policy_flags: list[str] = field(default_factory=list)
    answer_blocking_missing_facts: list[str] = field(default_factory=list)
    answerable_provisionally: bool = True
    summary: str = ""
    debug: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["criteria"] = [criterion.to_dict() for criterion in self.criteria]
        return data


class LegalReasoningKernel:
    known_status_values = {"known", "not_applicable", "document_unavailable", "user_unsure"}
    policy_status_values = {
        "needs_live_policy_check",
        "unknown_current_policy",
        "current_policy_risk",
        "superseded_policy_risk",
    }

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
        evidence = evidence or CriterionEvidence(
            retrieval_queries=list(node.source_queries),
            preferred_urls=list(node.preferred_urls),
            live_query_hints=list(node.live_query_hints),
            freshness_required=node.freshness_required,
        )

        if forced_status is not None:
            status = forced_status
        elif missing:
            status = "missing"
        elif node.layer == "current_policy_overlay" and node.freshness_required and not self._has_policy_evidence(evidence):
            status = "needs_live_policy_check"
        else:
            status = "satisfied"

        if risk_flags and status == "satisfied":
            status = "risk"
        if status == "risk" and node.layer == "current_policy_overlay":
            status = "current_policy_risk"

        return CriterionAssessment(
            node_id=node.id,
            label=node.label,
            layer=node.layer,
            status=status,
            required_facts=list(node.required_facts),
            missing_facts=missing,
            known_facts=known,
            legal_basis=list(node.legal_basis),
            evidence=evidence,
            reason=reason or self._default_reason(status, missing),
            next_question=node.next_question if missing else None,
            risk_flags=risk_flags or [],
            policy_key=node.policy_key,
            affected_nodes=list(node.affected_nodes),
            freshness_required=node.freshness_required,
            preferred_urls=list(node.preferred_urls),
            live_query_hints=list(node.live_query_hints),
            answer_blocking=node.answer_blocking,
            customer_ask_priority=node.customer_ask_priority,
            ask_only_if_user_wants_full_check=node.ask_only_if_user_wants_full_check,
            default_customer_action=node.default_customer_action,
        )

    def select_next_fact(
        self,
        criteria: list[CriterionAssessment],
        *,
        include_full_check: bool = False,
    ) -> tuple[str | None, str | None]:
        candidates: list[CriterionAssessment] = []
        for criterion in criteria:
            if criterion.status not in {
                "missing",
                "risk",
                "requires_lawyer_review",
                "needs_live_policy_check",
                "unknown_current_policy",
                "current_policy_risk",
            }:
                continue
            if not criterion.missing_facts:
                continue
            if criterion.ask_only_if_user_wants_full_check and not include_full_check:
                continue
            if criterion.answer_blocking or criterion.customer_ask_priority <= 20:
                candidates.append(criterion)

        if not candidates and include_full_check:
            candidates = [
                criterion
                for criterion in criteria
                if criterion.status in {"missing", "risk", "requires_lawyer_review"}
                and criterion.missing_facts
            ]

        candidates.sort(key=lambda item: (0 if item.answer_blocking else 1, item.customer_ask_priority, item.node_id))
        if not candidates:
            return None, None
        chosen = candidates[0]
        return chosen.missing_facts[0], chosen.next_question

    def summarize_counts(self, criteria: list[CriterionAssessment]) -> dict[str, int]:
        return {
            "satisfied": sum(1 for item in criteria if item.status == "satisfied"),
            "missing": sum(1 for item in criteria if item.status == "missing"),
            "risk": sum(1 for item in criteria if item.status in {"risk", "current_policy_risk", "superseded_policy_risk"}),
            "failed": sum(1 for item in criteria if item.status == "failed"),
            "requires_lawyer_review": sum(1 for item in criteria if item.status == "requires_lawyer_review"),
            "needs_live_policy_check": sum(1 for item in criteria if item.status == "needs_live_policy_check"),
            "unknown_current_policy": sum(1 for item in criteria if item.status == "unknown_current_policy"),
            "policy_overlay": sum(1 for item in criteria if item.layer == "current_policy_overlay"),
        }

    def policy_overlays(self, criteria: list[CriterionAssessment]) -> list[dict[str, Any]]:
        return [
            {
                "node_id": item.node_id,
                "label": item.label,
                "policy_key": item.policy_key,
                "status": item.status,
                "freshness_required": item.freshness_required,
                "risk_flags": list(item.risk_flags),
                "affected_nodes": list(item.affected_nodes),
                "preferred_urls": list(item.preferred_urls),
                "live_query_hints": list(item.live_query_hints),
            }
            for item in criteria
            if item.layer == "current_policy_overlay"
        ]

    def current_policy_flags(self, criteria: list[CriterionAssessment]) -> list[str]:
        flags: list[str] = []
        for item in criteria:
            if item.layer != "current_policy_overlay":
                continue
            if item.status in self.policy_status_values:
                flags.append(item.status)
            for risk in item.risk_flags:
                if risk not in flags:
                    flags.append(risk)
        return flags

    def answer_blocking_missing_facts(self, criteria: list[CriterionAssessment]) -> list[str]:
        out: list[str] = []
        for item in criteria:
            if not item.answer_blocking:
                continue
            for fact in item.missing_facts:
                if fact not in out:
                    out.append(fact)
        return out

    def _has_policy_evidence(self, evidence: CriterionEvidence) -> bool:
        if not evidence:
            return False
        return bool(evidence.source_titles or evidence.chunk_ids or evidence.source_classes)

    def _default_reason(self, status: CriterionStatus, missing: list[str]) -> str:
        if status == "missing" and missing:
            return "The criterion cannot be fully assessed until the missing fact(s) are provided."
        if status == "risk":
            return "The known facts suggest a possible refusal or evidentiary risk."
        if status == "current_policy_risk":
            return "The known facts may be affected by a current policy overlay."
        if status == "needs_live_policy_check":
            return "This criterion depends on current policy and should be checked against current official sources."
        if status == "unknown_current_policy":
            return "Current official policy support has not yet been confirmed."
        if status == "superseded_policy_risk":
            return "There is a risk that older guidance or prior assumptions have been superseded by current policy."
        if status == "failed":
            return "The known facts appear inconsistent with this criterion."
        if status == "not_applicable":
            return "This criterion is not applicable on the current pathway."
        if status == "requires_lawyer_review":
            return "This criterion is document-dependent or legally sensitive and should be reviewed by a lawyer."
        return "The currently known facts are enough to treat this criterion as provisionally satisfied."
