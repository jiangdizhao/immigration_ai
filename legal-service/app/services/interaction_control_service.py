from __future__ import annotations

import re
from typing import Any

from app.schemas.query import QueryResponse


class InteractionControlService:
    """
    Last-mile interaction controller for live guided-intake flows.

    PublicAnswerGuard removes machine/RAG wording. This service prevents legal-workflow drift:
    - keep an active 485 flow active unless the user explicitly changes topic;
    - remove refusal/review questions from 485 eligibility flows;
    - stop asking customers legal-classification questions;
    - mark 485 flows as analysis-ready once the core required facts are known.
    """

    REFUSAL_FACT_KEYS = {
        "notification_date",
        "refusal_notice_available",
        "onshore_offshore",
        "refusal_reason_if_known",
        "refusal_reason_hint",
        "refusal_date",
        "decision_date",
    }
    USER_UNFRIENDLY_FACT_KEYS = {"minister_specified_qualification_status"}

    def apply_customer_flow_guards(
        self,
        *,
        response: QueryResponse,
        fact_slot_states: list[Any],
        interaction_plan: Any,
        state: Any,
        known_facts: dict[str, Any],
        case_hypothesis: Any,
        question: str,
    ) -> tuple[QueryResponse, list[Any], Any, dict[str, Any]]:
        operation = self._operation(case_hypothesis, state, known_facts)
        active_485 = self._is_485_context(operation, known_facts, question)
        explicit_refusal_or_review = self._explicit_refusal_or_review(question)
        debug: dict[str, Any] = {
            "active_485": active_485,
            "operation": operation,
            "explicit_refusal_or_review": explicit_refusal_or_review,
            "removed_fact_keys": [],
            "ready_for_485_analysis": False,
            "answer_sanitized": False,
        }

        if not active_485:
            return response, fact_slot_states, interaction_plan, debug

        blocked_keys = set(self.USER_UNFRIENDLY_FACT_KEYS)
        if not explicit_refusal_or_review:
            blocked_keys.update(self.REFUSAL_FACT_KEYS)

        original_slot_count = len(fact_slot_states or [])
        fact_slot_states = [
            slot for slot in (fact_slot_states or [])
            if str(getattr(slot, "fact_key", "") or "") not in blocked_keys
        ]
        if original_slot_count != len(fact_slot_states):
            debug["removed_fact_keys"] = sorted(blocked_keys)

        requested = list(getattr(interaction_plan, "requested_facts", []) or [])
        requested = [
            fact for fact in requested
            if str(getattr(fact, "fact_key", None) or getattr(fact, "key", "") or "") not in blocked_keys
        ]
        self._set_attr(interaction_plan, "requested_facts", requested)

        self._set_attr(
            interaction_plan,
            "missing_required_facts",
            [key for key in (getattr(interaction_plan, "missing_required_facts", []) or []) if key not in blocked_keys],
        )
        self._set_attr(
            interaction_plan,
            "missing_blocking_facts",
            [key for key in (getattr(interaction_plan, "missing_blocking_facts", []) or []) if key not in blocked_keys],
        )

        response.follow_up_questions = self._filter_followups(response.follow_up_questions or [], blocked_keys)
        response.answer = self._sanitize_485_answer(
            answer=response.answer,
            known_facts=known_facts,
            explicit_refusal_or_review=explicit_refusal_or_review,
        )
        debug["answer_sanitized"] = True

        ready = self._ready_for_485_analysis(operation=operation, known_facts=known_facts)
        debug["ready_for_485_analysis"] = ready
        if ready:
            self._set_attr(interaction_plan, "mode", "analysis_ready")
            self._set_attr(interaction_plan, "answer_mode", "answer_with_warning")
            self._set_attr(interaction_plan, "requested_facts", [])
            self._set_attr(interaction_plan, "missing_required_facts", [])
            self._set_attr(interaction_plan, "missing_blocking_facts", [])
            self._set_attr(
                interaction_plan,
                "primary_prompt",
                "I have the key 485 facts needed to give a more useful assessment now.",
            )
            response.missing_facts = []
            response.follow_up_questions = [
                q for q in (response.follow_up_questions or [])
                if not self._is_forbidden_followup(q, blocked_keys)
            ][:2]
            response.next_action = "answer"
            response.user_display_mode = response.user_display_mode or "answer_with_warning"

        return response, fact_slot_states, interaction_plan, debug

    def _operation(self, case_hypothesis: Any, state: Any, known_facts: dict[str, Any]) -> str | None:
        for obj, key in [(case_hypothesis, "primary_operation_type"), (state, "operation_type")]:
            value = getattr(obj, key, None)
            if value:
                return str(value)
        value = known_facts.get("operation_type")
        return str(value) if value else None

    def _is_485_context(self, operation: str | None, facts: dict[str, Any], question: str) -> bool:
        q = (question or "").lower()
        return (
            bool(operation and operation.startswith("485_"))
            or str(facts.get("visa_subclass") or "") == "485"
            or str(facts.get("visa_type") or "") == "temporary_graduate"
            or "485" in q
            or "temporary graduate" in q
        )

    def _explicit_refusal_or_review(self, question: str) -> bool:
        q = (question or "").lower()
        return bool(re.search(r"\b(refus(?:ed|al|e)|review|appeal|tribunal|art|deadline|time limit|refusal notice)\b", q))

    def _ready_for_485_analysis(self, *, operation: str | None, known_facts: dict[str, Any]) -> bool:
        if not (operation and operation.startswith("485_")):
            return False
        if operation == "485_higher_education_stream":
            return (
                self._has_fact(known_facts, "qualification_level")
                and self._has_any_fact(known_facts, ["completion_date", "course_completion_date"])
                and self._has_fact(known_facts, "course_cricos_registered")
            )
        if operation == "485_vocational_stream":
            return (
                self._has_fact(known_facts, "qualification_level")
                and self._has_any_fact(known_facts, ["completion_date", "course_completion_date"])
                and self._has_any_fact(known_facts, ["skills_assessment_status", "nominated_occupation"])
            )
        if operation == "485_stream_selection":
            return self._has_fact(known_facts, "qualification_level")
        return self._has_fact(known_facts, "qualification_level") and self._has_any_fact(
            known_facts, ["completion_date", "course_completion_date"]
        )

    def _has_any_fact(self, facts: dict[str, Any], keys: list[str]) -> bool:
        return any(self._has_fact(facts, key) for key in keys)

    def _has_fact(self, facts: dict[str, Any], key: str) -> bool:
        value = facts.get(key)
        if value is None:
            return False
        if isinstance(value, str):
            lowered = value.strip().lower()
            return bool(lowered) and lowered not in {"not_sure", "not sure", "unknown", "unsure", "n/a", "na"}
        return True

    def _filter_followups(self, questions: list[str], blocked_keys: set[str]) -> list[str]:
        out: list[str] = []
        for question in questions:
            if self._is_forbidden_followup(question, blocked_keys):
                continue
            if question not in out:
                out.append(question)
        return out[:3]

    def _is_forbidden_followup(self, question: str, blocked_keys: set[str]) -> bool:
        q = (question or "").lower()
        if blocked_keys & self.REFUSAL_FACT_KEYS:
            if any(term in q for term in ["refusal notice", "notified", "notification date", "refusal reason", "tribunal", "review deadline"]):
                return True
        if "minister-specified" in q or "minister specified" in q:
            return True
        return False

    def _sanitize_485_answer(self, *, answer: str, known_facts: dict[str, Any], explicit_refusal_or_review: bool) -> str:
        text = (answer or "").strip()
        if not text:
            return text
        if not explicit_refusal_or_review:
            text = re.sub(
                r"(?is)\bPlease provide the refusal notice, relevant dates, and stated refusal reason,? or arrange a consultation with the lawyer\.?",
                "I can continue the 485 assessment using the facts you provided. A lawyer can review documents if you want a final eligibility opinion.",
                text,
            )
            text = re.sub(r"(?is)\bPlease provide the refusal notice[^.]*\.", "", text)
            text = re.sub(r"(?is)\b[^.]*refusal notice[^.]*\.", "", text)

        if self._has_fact(known_facts, "qualification_level"):
            qual = str(known_facts.get("qualification_level"))
            text = re.sub(r"(?is)\byour qualification level is missing\b", f"your qualification level is recorded as {qual}", text)
            text = re.sub(
                r"(?is)\bqualification level and several other required facts are missing\b",
                f"qualification level is recorded as {qual}, but some other facts may still affect the final assessment",
                text,
            )

        text = re.sub(
            r"(?is)whether your qualification is covered by the current Minister-specified list(?: or instrument)?",
            "whether your course and institution match the current official 485 rules",
            text,
        )
        text = re.sub(
            r"(?is)Is your master's by coursework qualification covered by the current Minister-specified qualification list or instrument\?",
            "What is the course name and institution?",
            text,
        )
        return re.sub(r"\n{3,}", "\n\n", text).strip()

    def _set_attr(self, obj: Any, key: str, value: Any) -> None:
        try:
            setattr(obj, key, value)
        except Exception:
            if isinstance(obj, dict):
                obj[key] = value
