from __future__ import annotations

import re
from typing import Any

from app.schedule.schemas import ScheduleCandidate, ScheduleClause, ScheduleFrame
from app.services.legal_reasoning_kernel import (
    CriterionAssessment,
    CriterionNode,
    LegalReasoningKernel,
    ScheduleAwareAssessment,
)


class GenericSchedule2CriterionPack:
    """Generic Schedule-2-derived criterion pack for subclasses without a hand-built tree.

    It is intentionally rough but auditable. It does not invent a full legal tree;
    it extracts a small number of active clauses and turns them into generic
    criterion nodes. Enhanced packs such as 485 and 500 should still be preferred.
    """

    def __init__(self, *, candidate: ScheduleCandidate, clauses: list[ScheduleClause], kernel: LegalReasoningKernel | None = None) -> None:
        self.candidate = candidate
        self.clauses = clauses
        self.kernel = kernel or LegalReasoningKernel()

    def is_relevant(self, *, question: str, facts: dict[str, Any], visa_type: str | None = None) -> bool:
        return bool(self.candidate and self.candidate.subclass)

    def active_nodes_preview(self, *, question: str, facts: dict[str, Any], visa_type: str | None = None) -> list[CriterionNode]:
        frame = self._build_schedule_frame(question=question, facts=facts)
        return self._nodes_from_frame(frame)

    def evidence_queries_for_nodes(self, nodes: list[CriterionNode]) -> dict[str, list[str]]:
        return {node.id: list(node.source_queries) for node in nodes if node.source_queries}

    def assess(
        self,
        *,
        question: str,
        facts: dict[str, Any],
        evidence_by_node: dict[str, Any] | None = None,
        visa_type: str | None = None,
    ) -> ScheduleAwareAssessment:
        frame = self._build_schedule_frame(question=question, facts=facts)
        nodes = self._nodes_from_frame(frame)
        evidence_by_node = evidence_by_node or {}
        criteria: list[CriterionAssessment] = []
        for node in nodes:
            criteria.append(self.kernel.evaluate_node(node, facts, evidence=evidence_by_node.get(node.id)))

        next_fact, next_question = self.kernel.select_next_fact(criteria)
        counts = self.kernel.summarize_counts(criteria)
        missing_facts: list[str] = []
        risk_flags: list[str] = []
        for item in criteria:
            for fact in item.missing_facts:
                if fact not in missing_facts:
                    missing_facts.append(fact)
            for dep in frame.deferred_dependencies:
                if dep not in risk_flags:
                    risk_flags.append(dep)

        return ScheduleAwareAssessment(
            is_active=True,
            subclass=self.candidate.subclass,
            user_goal=frame.likely_operation,
            candidate_pathways=[self.candidate.subclass],
            active_pathway=frame.likely_operation or "generic_schedule2",
            criteria=criteria,
            recommended_next_fact=next_fact or frame.next_best_fact,
            recommended_next_question=next_question or frame.next_best_question,
            missing_facts=missing_facts,
            risk_flags=risk_flags,
            satisfied_count=counts.get("satisfied", 0),
            missing_count=counts.get("missing", 0),
            risk_count=counts.get("risk", 0),
            failed_count=counts.get("failed", 0),
            policy_overlay_count=counts.get("policy_overlay", 0),
            policy_overlays=[],
            current_policy_flags=[],
            answer_blocking_missing_facts=self.kernel.answer_blocking_missing_facts(criteria),
            answerable_provisionally=True,
            summary=self._summary(frame, next_fact or frame.next_best_fact),
            debug={
                "schedule_frame": frame.model_dump(),
                "candidate": self.candidate.model_dump(),
                "design_note": "Generic Schedule 2 pack. It gives a bounded provisional answer and asks one decisive fact; it should be promoted to an enhanced pack if this subclass becomes high-value.",
            },
        )

    def _build_schedule_frame(self, *, question: str, facts: dict[str, Any]) -> ScheduleFrame:
        active = self._select_active_clauses(question=question, facts=facts)
        required = self._infer_required_facts(active, question=question, facts=facts)
        next_fact = self._first_missing(required, facts)
        return ScheduleFrame(
            subclass=self.candidate.subclass,
            title=self.candidate.title,
            active_clauses=active,
            likely_operation=self._infer_operation(question, facts),
            required_facts=required,
            optional_facts=self._infer_optional_facts(active),
            next_best_fact=next_fact,
            next_best_question=self._question_for(next_fact),
            answer_tier="provisional_schedule2_answer" if active else "orientation_answer",
            deferred_dependencies=sorted({dep for clause in active for dep in clause.deferred_dependencies}),
            debug={"selected_clause_refs": [clause.clause_ref for clause in active]},
        )

    def _select_active_clauses(self, *, question: str, facts: dict[str, Any]) -> list[ScheduleClause]:
        q = (question or "").lower()
        ranked: list[tuple[int, ScheduleClause]] = []
        for clause in self.clauses:
            score = 0
            kind = clause.section_kind
            blob = " ".join([clause.clause_ref, clause.heading, clause.text[:1400]]).lower()
            if kind in {"primary_criteria", "time_of_application", "time_of_decision"}:
                score += 20
            if kind == "circumstances_applicable_to_grant":
                score += 14
            if kind == "visa_effect" and any(x in q for x in ["stay", "remain", "effect", "until", "travel", "留", "停留"]):
                score += 20
            if kind == "conditions" and ("condition" in q or "条件" in q or re.search(r"\b8\d{3}\b", q)):
                score += 25
            if any(term in q for term in ["apply", "lodge", "valid", "境内", "申请"]):
                if kind in {"time_of_application", "primary_criteria"}:
                    score += 12
            if any(term in q for term in ["grant", "approved", "refused", "拒签", "获批"]):
                if kind in {"time_of_decision", "primary_criteria"}:
                    score += 12
            if any(tok in blob for tok in self._query_tokens(q)):
                score += 5
            if score:
                ranked.append((score, clause))
        ranked.sort(key=lambda x: x[0], reverse=True)
        selected: list[ScheduleClause] = []
        seen: set[str] = set()
        for _score, clause in ranked:
            if clause.clause_ref in seen:
                continue
            seen.add(clause.clause_ref)
            selected.append(clause)
            if len(selected) >= 8:
                break
        if not selected:
            selected = self.clauses[:6]
        return selected

    def _nodes_from_frame(self, frame: ScheduleFrame) -> list[CriterionNode]:
        nodes: list[CriterionNode] = []
        for idx, clause in enumerate(frame.active_clauses[:8]):
            required = tuple(self._required_facts_for_clause(clause, frame.required_facts))
            node_id = f"schedule2.{frame.subclass}.{self._safe_clause_ref(clause.clause_ref)}"
            nodes.append(
                CriterionNode(
                    id=node_id,
                    label=clause.heading or f"Schedule 2 clause {clause.clause_ref}",
                    layer="schedule2_grant" if clause.section_kind != "conditions" else "practical_consequence",
                    legal_basis=(f"Migration Regulations 1994 Schedule 2 clause {clause.clause_ref}",),
                    required_facts=required,
                    optional_facts=tuple(frame.optional_facts),
                    source_queries=(
                        f"Migration Regulations Schedule 2 Subclass {frame.subclass} {clause.clause_ref} {clause.heading}",
                        f"Subclass {frame.subclass} {clause.heading}",
                    ),
                    source_classes=("legislation_primary", "schedule2_clause"),
                    next_question=self._question_for(required[0] if required else None),
                    customer_explanation="This is a Schedule 2 clause-derived criterion. It should be used for provisional guidance unless promoted to an enhanced subclass pack.",
                    lawyer_note=clause.compact_text(500),
                    answer_blocking=idx == 0 and bool(required),
                    customer_ask_priority=10 + idx,
                    default_customer_action="answer_with_caveat",
                )
            )
        return nodes

    def _infer_operation(self, question: str, facts: dict[str, Any]) -> str:
        q = (question or "").lower()
        if any(x in q for x in ["travel", "leave", "re-enter", "回国", "出境", "回澳"]):
            return "travel_or_reentry_effect"
        if any(x in q for x in ["refused", "refusal", "review", "art", "拒签", "复审"]):
            return "refusal_or_review_dependency"
        if any(x in q for x in ["apply", "lodge", "valid", "申请", "递交"]):
            return "validity_and_grant_triage"
        if any(x in q for x in ["condition", "8503", "8501", "8105", "8202", "条件"]):
            return "condition_explainer"
        return "generic_schedule2_triage"

    def _infer_required_facts(self, clauses: list[ScheduleClause], *, question: str, facts: dict[str, Any]) -> list[str]:
        q = (question or "").lower()
        required: list[str] = []

        def add(key: str) -> None:
            if key not in required:
                required.append(key)

        if any(x in q for x in ["travel", "leave", "re-enter", "回国", "出境", "回澳"]):
            add("current_visa")
            add("travel_need")
        if any(x in q for x in ["partner", "spouse", "married", "820", "配偶", "结婚", "伴侣"]):
            add("sponsor_status")
            add("relationship_status")
            add("current_visa")
        if any(x in q for x in ["refused", "refusal", "review", "art", "拒签", "复审"]):
            add("refusal_notice_available")
            add("notification_date")
            add("onshore_offshore")
        if any(x in q for x in ["apply", "lodge", "valid", "申请", "递交"]):
            add("current_location")
            add("current_visa")
        for clause in clauses:
            blob = f"{clause.heading}\n{clause.text[:1800]}".lower()
            if "sponsor" in blob or "sponsored" in blob:
                add("sponsor_status")
            if "spouse" in blob or "de facto" in blob or "partner" in blob:
                add("relationship_status")
            if "substantive visa" in blob:
                add("current_visa")
            if "in australia" in blob or "outside australia" in blob:
                add("current_location")
            if "substantial" in blob and "reason" in blob:
                add("travel_reason")
            if "review" in blob or "tribunal" in blob:
                add("notification_date")
        return required[:5]

    def _required_facts_for_clause(self, clause: ScheduleClause, frame_required: list[str]) -> list[str]:
        blob = f"{clause.heading}\n{clause.text[:1800]}".lower()
        out: list[str] = []
        for key in frame_required:
            if key in {"sponsor_status", "relationship_status"} and any(x in blob for x in ["sponsor", "spouse", "de facto", "partner"]):
                out.append(key)
            elif key in {"current_visa", "current_location"} and any(x in blob for x in ["substantive visa", "in australia", "outside australia", "bridging"]):
                out.append(key)
            elif key in {"travel_need", "travel_reason"} and any(x in blob for x in ["travel", "leave", "re-enter", "substantial"]):
                out.append(key)
            elif key in {"refusal_notice_available", "notification_date", "onshore_offshore"} and any(x in blob for x in ["refus", "review", "tribunal", "decision"]):
                out.append(key)
        return out or frame_required[:1]

    def _infer_optional_facts(self, clauses: list[ScheduleClause]) -> list[str]:
        optional: list[str] = []
        blob = "\n".join(clause.text[:800] for clause in clauses).lower()
        if "condition" in blob:
            optional.append("condition_numbers")
        if "family" in blob:
            optional.append("family_member_type")
        if "public interest" in blob:
            optional.append("public_interest_issue")
        return optional

    def _first_missing(self, required: list[str], facts: dict[str, Any]) -> str | None:
        for key in required:
            value = facts.get(key)
            if value is None or (isinstance(value, str) and not value.strip()):
                return key
        return None

    def _question_for(self, fact_key: str | None) -> str | None:
        questions = {
            "current_visa": "What visa or bridging visa do you currently hold according to VEVO?",
            "current_location": "Are you currently in Australia or outside Australia?",
            "travel_need": "Are you trying to leave Australia and then re-enter, or only asking about leaving?",
            "travel_reason": "What is the reason for the travel, and when do you plan to leave and return?",
            "sponsor_status": "Is your sponsor an Australian citizen, Australian permanent resident, or eligible New Zealand citizen?",
            "relationship_status": "Are you legally married, de facto, or engaged/prospective marriage, and are you still together?",
            "refusal_notice_available": "Do you have the refusal notice available?",
            "notification_date": "What date were you notified of the decision?",
            "onshore_offshore": "Were you in Australia or outside Australia when the decision was made?",
        }
        return questions.get(fact_key)

    def _summary(self, frame: ScheduleFrame, next_fact: str | None) -> str:
        clauses = ", ".join(clause.clause_ref for clause in frame.active_clauses[:4])
        base = f"Schedule 2 candidate Subclass {frame.subclass}; active clauses: {clauses or 'not resolved'}."
        if frame.deferred_dependencies:
            base += f" Deferred lawyer-check dependencies: {', '.join(frame.deferred_dependencies)}."
        if next_fact:
            base += f" Next decisive fact: {next_fact}."
        return base

    def _query_tokens(self, q: str) -> list[str]:
        return [tok for tok in re.findall(r"[a-z0-9]{3,}|[\u4e00-\u9fff]{2,}", q.lower()) if tok not in {"visa", "the", "and", "for", "can"}]

    def _safe_clause_ref(self, ref: str) -> str:
        return re.sub(r"[^a-zA-Z0-9]+", "_", ref).strip("_") or "clause"
