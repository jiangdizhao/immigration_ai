from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class ConditionStatus:
    condition_key: str
    condition_label: str
    status: str
    based_on_facts: dict[str, Any] = field(default_factory=dict)
    reason: str = ""
    must_say: str | None = None
    must_not_ask_patterns: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class FactStatusReasoningService:
    """
    Generic fact-status / answer-control layer.

    It resolves whether policy conditions are known true, known false, unknown,
    not applicable, or contradicted by user facts, then prevents the final answer
    from asking the user to confirm a condition that is already known or
    contradicted.
    """

    def evaluate(
        self,
        *,
        known_facts: dict[str, Any] | None,
        focused_policy_finding: dict[str, Any] | None = None,
        focused_policy_issue: dict[str, Any] | None = None,
        legal_reasoning_trace: dict[str, Any] | None = None,
        question: str | None = None,
    ) -> dict[str, Any]:
        facts = self._normalise_facts(known_facts or {})
        statuses: list[ConditionStatus] = []
        statuses.extend(self._qualification_condition_statuses(facts))
        statuses.extend(self._relationship_condition_statuses(facts))
        statuses.extend(self._refusal_condition_statuses(facts))

        must_not_ask_patterns: list[str] = []
        must_say: list[str] = []
        known_false: list[str] = []
        known_true: list[str] = []
        not_applicable: list[str] = []

        for status in statuses:
            if status.status in {"known_false", "contradicted_by_user_fact"}:
                known_false.append(status.condition_key)
            if status.status == "known_true":
                known_true.append(status.condition_key)
            if status.status == "not_applicable":
                not_applicable.append(status.condition_key)
            for pattern in status.must_not_ask_patterns:
                if pattern not in must_not_ask_patterns:
                    must_not_ask_patterns.append(pattern)
            if status.must_say and status.must_say not in must_say:
                must_say.append(status.must_say)

        return {
            "condition_statuses": [item.to_dict() for item in statuses],
            "known_false_conditions": known_false,
            "known_true_conditions": known_true,
            "not_applicable_conditions": not_applicable,
            "must_not_ask_patterns": must_not_ask_patterns,
            "must_say": must_say,
            "facts_used": facts,
        }

    def apply_to_response(
        self,
        *,
        response: Any,
        fact_status_report: dict[str, Any] | None,
        known_facts: dict[str, Any] | None = None,
    ) -> tuple[Any, dict[str, Any]]:
        if not fact_status_report:
            return response, {"triggered": False, "reason": "no_fact_status_report"}

        original_answer = str(getattr(response, "answer", "") or "")
        answer = original_answer
        triggered_patterns: list[str] = []

        for pattern in fact_status_report.get("must_not_ask_patterns") or []:
            if re.search(pattern, answer, flags=re.I):
                triggered_patterns.append(pattern)

        statuses = fact_status_report.get("condition_statuses") or []
        for status in statuses:
            key = status.get("condition_key")
            state = status.get("status")
            if key == "qualification.masters_research_exception" and state in {"known_false", "contradicted_by_user_fact"}:
                answer = self._repair_masters_research_answer(answer, status.get("must_say") or "")
            if key == "relationship.spouse_partner_dependency" and state in {"known_false", "not_applicable"}:
                answer = self._repair_spouse_answer(answer, status.get("must_say") or "")
            if key == "refusal.review_workflow" and state in {"known_false", "not_applicable"}:
                answer = self._repair_refusal_answer(answer, status.get("must_say") or "")

        for sentence in fact_status_report.get("must_say") or []:
            if sentence and sentence.lower() not in answer.lower():
                answer = self._insert_before_final_caveat(answer, sentence)

        response.answer = self._clean_answer(answer)

        original_followups = list(getattr(response, "follow_up_questions", []) or [])
        filtered_followups: list[str] = []
        for question in original_followups:
            if self._question_violates_report(question, fact_status_report):
                continue
            filtered_followups.append(question)
        response.follow_up_questions = filtered_followups[:3]

        missing = list(getattr(response, "missing_facts", []) or [])
        blocked_missing = self._blocked_missing_fact_keys(fact_status_report)
        response.missing_facts = [item for item in missing if item not in blocked_missing]

        debug = {
            "triggered": bool(triggered_patterns or original_answer != response.answer or len(original_followups) != len(filtered_followups)),
            "triggered_patterns": triggered_patterns,
            "answer_changed": original_answer != response.answer,
            "removed_followups": len(original_followups) - len(filtered_followups),
            "blocked_missing_fact_keys": sorted(blocked_missing),
        }
        return response, debug

    def _qualification_condition_statuses(self, facts: dict[str, Any]) -> list[ConditionStatus]:
        out: list[ConditionStatus] = []
        qualification_blob = " ".join(
            str(facts.get(key) or "")
            for key in ["qualification", "qualification_level", "course_type", "degree_type"]
        ).lower()

        is_coursework = any(term in qualification_blob for term in ["coursework", "course_work", "master_by_coursework", "masters_coursework"])
        is_research = any(term in qualification_blob for term in ["masters_research", "master_by_research", "master_research", "masters_(research)", "research"])

        if is_coursework:
            out.append(
                ConditionStatus(
                    condition_key="qualification.masters_research_exception",
                    condition_label="Masters (research) exception",
                    status="known_false",
                    based_on_facts={key: facts.get(key) for key in ["qualification", "qualification_level", "course_type"] if facts.get(key) is not None},
                    reason="The user stated a Master by coursework, which is different from Masters (research).",
                    must_say="A Master by coursework is different from a Masters (research); based on the stated qualification, the Masters (research) exception is not indicated.",
                    must_not_ask_patterns=[
                        r"confirm(?:ing)?\s+whether\s+your\s+qualification\s+is\s+a\s+Masters?\s*\(research\)",
                        r"whether\s+your\s+qualification\s+is\s+a\s+Masters?\s*\(research\)",
                        r"whether\s+.*Masters?\s*\(research\)",
                        r"confirm\s+.*Masters?\s*\(research\)",
                    ],
                )
            )
        elif is_research:
            out.append(
                ConditionStatus(
                    condition_key="qualification.masters_research_exception",
                    condition_label="Masters (research) exception",
                    status="known_true",
                    based_on_facts={key: facts.get(key) for key in ["qualification", "qualification_level", "course_type"] if facts.get(key) is not None},
                    reason="The user stated a Masters/research qualification.",
                    must_not_ask_patterns=[r"whether\s+your\s+qualification\s+is\s+a\s+Masters?\s*\(research\)"],
                )
            )
        return out

    def _relationship_condition_statuses(self, facts: dict[str, Any]) -> list[ConditionStatus]:
        relationship = str(facts.get("relationship_status") or facts.get("marital_status") or "").lower()
        if relationship in {"single", "not_married", "unmarried", "no_partner", "no_spouse"}:
            return [
                ConditionStatus(
                    condition_key="relationship.spouse_partner_dependency",
                    condition_label="Spouse / partner dependency",
                    status="not_applicable",
                    based_on_facts={"relationship_status": relationship},
                    reason="The user stated they are single / have no partner.",
                    must_say="Spouse or partner criteria do not appear relevant based on the stated single/no-partner status.",
                    must_not_ask_patterns=[r"spouse", r"partner.*visa", r"your\s+partner"],
                )
            ]
        return []

    def _refusal_condition_statuses(self, facts: dict[str, Any]) -> list[ConditionStatus]:
        has_refusal = facts.get("has_refusal")
        if has_refusal is False or str(has_refusal).lower() in {"false", "no", "none"}:
            return [
                ConditionStatus(
                    condition_key="refusal.review_workflow",
                    condition_label="Refusal/review workflow",
                    status="not_applicable",
                    based_on_facts={"has_refusal": has_refusal},
                    reason="The user indicated there is no refusal.",
                    must_say="Refusal/review questions do not appear relevant because no refusal has been indicated.",
                    must_not_ask_patterns=[r"refusal notice", r"notification date", r"refusal reason", r"review deadline"],
                )
            ]
        return []

    def _repair_masters_research_answer(self, answer: str, must_say: str) -> str:
        text = answer
        text = re.sub(r"without confirming whether your qualification is a Masters?\s*\(research\),?\s*", "", text, flags=re.I)
        text = re.sub(r"without confirming whether your qualification is a Masters?\s*\(research\)", "", text, flags=re.I)
        text = re.sub(r"whether your qualification is a Masters?\s*\(research\),?\s*", "", text, flags=re.I)
        text = re.sub(r"confirming whether your qualification is a Masters?\s*\(research\),?\s*", "", text, flags=re.I)
        text = re.sub(r"\s+,", ",", text)
        text = re.sub(r"\s{2,}", " ", text)
        if must_say and must_say.lower() not in text.lower():
            text = self._insert_before_final_caveat(text, must_say)
        return text

    def _repair_spouse_answer(self, answer: str, must_say: str) -> str:
        text = re.sub(r"[^.]*\bspouse\b[^.]*\.", "", answer, flags=re.I)
        text = re.sub(r"[^.]*\bpartner\b[^.]*\.", "", text, flags=re.I)
        if must_say and must_say.lower() not in text.lower():
            text = self._insert_before_final_caveat(text, must_say)
        return text

    def _repair_refusal_answer(self, answer: str, must_say: str) -> str:
        text = re.sub(r"[^.]*refusal notice[^.]*\.", "", answer, flags=re.I)
        text = re.sub(r"[^.]*notification date[^.]*\.", "", text, flags=re.I)
        text = re.sub(r"[^.]*refusal reason[^.]*\.", "", text, flags=re.I)
        if must_say and must_say.lower() not in text.lower():
            text = self._insert_before_final_caveat(text, must_say)
        return text

    def _insert_before_final_caveat(self, answer: str, sentence: str) -> str:
        text = (answer or "").strip()
        if not text:
            return sentence
        caveat_markers = [
            "I cannot give a definitive eligibility answer",
            "A full eligibility check",
            "For a full eligibility",
            "This does not replace",
        ]
        for marker in caveat_markers:
            idx = text.lower().find(marker.lower())
            if idx > 0:
                return (text[:idx].rstrip() + "\n\n" + sentence.strip() + "\n\n" + text[idx:].lstrip()).strip()
        return (text.rstrip() + "\n\n" + sentence.strip()).strip()

    def _question_violates_report(self, question: str, report: dict[str, Any]) -> bool:
        for pattern in report.get("must_not_ask_patterns") or []:
            if re.search(pattern, question or "", flags=re.I):
                return True
        return False

    def _blocked_missing_fact_keys(self, report: dict[str, Any]) -> set[str]:
        blocked: set[str] = set()
        for status in report.get("condition_statuses") or []:
            key = status.get("condition_key")
            state = status.get("status")
            if key == "qualification.masters_research_exception" and state in {"known_false", "contradicted_by_user_fact"}:
                blocked.update({"masters_research_status", "minister_specified_qualification_status"})
            if key == "relationship.spouse_partner_dependency" and state in {"known_false", "not_applicable"}:
                blocked.update({"spouse_status", "partner_visa_status"})
            if key == "refusal.review_workflow" and state in {"known_false", "not_applicable"}:
                blocked.update({"notification_date", "refusal_notice_available", "refusal_reason_if_known"})
        return blocked

    def _normalise_facts(self, facts: dict[str, Any]) -> dict[str, Any]:
        out = dict(facts or {})
        for key in ["qualification", "qualification_level", "course_type", "relationship_status", "marital_status"]:
            if key in out and isinstance(out[key], str):
                out[key] = out[key].strip().lower().replace(" ", "_")
        return out

    def _clean_answer(self, answer: str) -> str:
        text = re.sub(r"\s+\.", ".", answer or "")
        text = re.sub(r"\s+,", ",", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        return text.strip()
