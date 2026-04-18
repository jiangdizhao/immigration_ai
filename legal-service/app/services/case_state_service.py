from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from app.schemas.state import (
    CaseCandidate,
    CaseHypothesis,
    ConfidenceLevel,
    EvidencePackage,
    FactInputType,
    FactSlotState,
    InteractionFactRequest,
    InteractionPlan,
    InteractionProgress,
    MatterState,
    PolicyDecision,
)


@dataclass(frozen=True)
class FactSpec:
    key: str
    label: str
    prompt: str
    why_needed: str
    input_type: FactInputType = "short_text"
    options: tuple[str, ...] = ()
    aliases: tuple[str, ...] = ()
    false_status: str | None = None


@dataclass(frozen=True)
class OperationProfile:
    key: str
    required_facts: tuple[str, ...]
    optional_facts: tuple[str, ...] = ()
    blocking_facts: tuple[str, ...] = ()
    followup_intro: str = "I need a few more details before I can guide you properly."
    escalation_intro: str = "This may be time-sensitive or high-risk, so legal review may be needed."


FACT_SPECS: dict[str, FactSpec] = {
    "notification_date": FactSpec(
        key="notification_date",
        label="Notification date",
        prompt="What date were you notified of the decision?",
        why_needed="Timing can affect review and next-step options.",
        input_type="date",
    ),
    "refusal_notice_available": FactSpec(
        key="refusal_notice_available",
        label="Refusal notice available",
        prompt="Do you have the refusal notice?",
        why_needed="The refusal notice usually contains the refusal basis and review-related details.",
        input_type="boolean",
        options=("yes", "no", "not_sure"),
        false_status="document_unavailable",
    ),
    "onshore_offshore": FactSpec(
        key="onshore_offshore",
        label="Location at decision",
        prompt="Were you in Australia or outside Australia when the decision happened?",
        why_needed="Location at decision can affect what options are available next.",
        input_type="single_select",
        options=("in_australia", "outside_australia", "not_sure"),
        aliases=("in_australia",),
    ),
    "refusal_reason_if_known": FactSpec(
        key="refusal_reason_if_known",
        label="Refusal reason if known",
        prompt="Do you know the main reason given for the refusal?",
        why_needed="The reason for refusal can change what evidence or legal pathway matters most.",
        input_type="short_text",
        aliases=("refusal_reason", "refusal_reason_hint"),
    ),
    "visa_subclass": FactSpec(
        key="visa_subclass",
        label="Visa subclass",
        prompt="What visa subclass is involved?",
        why_needed="The subclass helps narrow the legal pathway and practical requirements.",
        input_type="short_text",
    ),
    "current_visa": FactSpec(
        key="current_visa",
        label="Current visa/status",
        prompt="What visa or immigration status do you currently hold?",
        why_needed="Current status can affect travel, lawful stay, and available next steps.",
        input_type="short_text",
    ),
    "travel_need": FactSpec(
        key="travel_need",
        label="Travel plan",
        prompt="Are you planning to leave Australia and return, or asking generally?",
        why_needed="Travel intent affects the guidance about bridging visas and return travel.",
        input_type="single_select",
        options=("leave_and_return", "general_question", "not_sure"),
    ),
    "completion_date": FactSpec(
        key="completion_date",
        label="Course completion date",
        prompt="When did you complete, or expect to complete, your studies?",
        why_needed="Timing can matter for Temporary Graduate visa questions.",
        input_type="date",
    ),
    "incorrect_information_issue": FactSpec(
        key="incorrect_information_issue",
        label="Incorrect information concern",
        prompt="What information or document is being questioned?",
        why_needed="PIC 4020-type risk depends heavily on what information was said to be incorrect or misleading.",
        input_type="long_text",
    ),
}


OPERATION_PROFILES: dict[str, OperationProfile] = {
    "student_refusal_next_steps": OperationProfile(
        key="student_refusal_next_steps",
        required_facts=("refusal_notice_available", "notification_date", "onshore_offshore"),
        optional_facts=("refusal_reason_if_known", "visa_subclass", "current_visa"),
        blocking_facts=("notification_date", "onshore_offshore"),
        followup_intro="I can help work through the next steps, but I first need a few details that can affect review timing and lawful status.",
        escalation_intro="Because refusal next steps can be time-sensitive, legal review may be needed if key details are still missing.",
    ),
    "review_rights": OperationProfile(
        key="review_rights",
        required_facts=("notification_date", "onshore_offshore", "refusal_notice_available"),
        optional_facts=("visa_subclass",),
        blocking_facts=("notification_date", "onshore_offshore"),
        followup_intro="To assess review rights properly, I need a few details first.",
        escalation_intro="Review rights can depend on very specific facts, so legal review may be needed if the key details are unclear.",
    ),
    "review_deadline": OperationProfile(
        key="review_deadline",
        required_facts=("notification_date", "onshore_offshore"),
        optional_facts=("refusal_notice_available",),
        blocking_facts=("notification_date",),
        followup_intro="To say anything useful about timing, I need the notification details first.",
        escalation_intro="If the timing is unclear, it is safer to treat the matter as potentially time-sensitive.",
    ),
    "bridging_travel": OperationProfile(
        key="bridging_travel",
        required_facts=("current_visa", "travel_need"),
        optional_facts=("onshore_offshore",),
        blocking_facts=("current_visa",),
        followup_intro="Travel on a bridging visa depends on the visa and what you are trying to do, so I need a little more detail first.",
    ),
    "485_eligibility_overview": OperationProfile(
        key="485_eligibility_overview",
        required_facts=("visa_subclass", "completion_date"),
        optional_facts=("notification_date",),
        blocking_facts=(),
        followup_intro="I can give a more useful Temporary Graduate overview if I know a little more about your situation.",
    ),
    "document_checklist": OperationProfile(
        key="document_checklist",
        required_facts=("visa_subclass",),
        optional_facts=("refusal_notice_available", "refusal_reason_if_known"),
        blocking_facts=(),
        followup_intro="I can suggest a more relevant document checklist if I know the visa context.",
    ),
    "pic4020_risk": OperationProfile(
        key="pic4020_risk",
        required_facts=("incorrect_information_issue",),
        optional_facts=("notification_date", "refusal_notice_available"),
        blocking_facts=("incorrect_information_issue",),
        followup_intro="I need to know what information or document is being questioned before I can say anything useful about this risk.",
        escalation_intro="Incorrect-information or PIC 4020 issues can be serious, so legal review may be sensible early.",
    ),
}


KNOWN_STATUSES = {"known", "not_applicable"}


class CaseStateService:
    """
    Builds the three new backend objects that will later drive the user-friendly frontend:
    - CaseHypothesis
    - FactSlotState
    - InteractionPlan

    This service is intentionally deterministic for now. The backend LLM can later be used
    to *phrase* user-facing follow-up questions, while this layer stays responsible for
    selecting the fact slots and tracking partial case state.
    """

    def build_case_hypothesis(
        self,
        *,
        question: str,
        state: MatterState,
        known_facts: dict[str, Any] | None = None,
    ) -> CaseHypothesis:
        known_facts = known_facts or {}
        primary_operation = state.operation_type or self._infer_primary_operation(
            question=question,
            issue_type=state.issue_type,
            visa_type=state.visa_type,
        )
        profile = self._resolve_profile(primary_operation, state.issue_type, state.visa_type)
        candidate_ops = self._candidate_operations(
            question=question,
            primary_operation=primary_operation,
            issue_type=state.issue_type,
            visa_type=state.visa_type,
        )

        candidates: list[CaseCandidate] = []
        for rank, operation in enumerate(candidate_ops):
            profile_for_candidate = self._resolve_profile(operation, state.issue_type, state.visa_type)
            if profile_for_candidate is not None:
                decisive_facts = list(profile_for_candidate.blocking_facts or profile_for_candidate.required_facts)
            else:
                decisive_facts = []
            missing_decisive = [
                fact_key
                for fact_key in decisive_facts
                if self._slot_status_for_fact(fact_key, known_facts, {}).status not in KNOWN_STATUSES
            ]
            score = self._score_candidate(
                operation=operation,
                rank=rank,
                primary_operation=primary_operation,
                question=question,
            )
            candidates.append(
                CaseCandidate(
                    operation_type=operation,
                    score=score,
                    why_it_fits=self._candidate_reason(operation, question, rank),
                    missing_decisive_facts=missing_decisive,
                )
            )

        decisive_next_facts = []
        if profile is not None:
            decisive_next_facts = [
                fact_key
                for fact_key in (profile.blocking_facts or profile.required_facts)
                if self._slot_status_for_fact(fact_key, known_facts, {}).status not in KNOWN_STATUSES
            ]

        top_score = candidates[0].score if candidates else 0.35
        if primary_operation and not decisive_next_facts:
            stage = "stable"
        elif primary_operation:
            stage = "refining"
        else:
            stage = "provisional"

        confidence_penalty = min(0.12 * len(decisive_next_facts), 0.24)
        confidence_score = min(max(top_score - confidence_penalty, 0.0), 1.0)
        confidence_label = self._label_for_score(confidence_score)
        summary = self._build_hypothesis_summary(
            primary_operation=primary_operation,
            stage=stage,
            decisive_next_facts=decisive_next_facts,
            issue_type=state.issue_type,
        )

        return CaseHypothesis(
            issue_type=state.issue_type,
            visa_type=state.visa_type,
            primary_operation_type=primary_operation,
            confidence_label=confidence_label,
            confidence_score=confidence_score,
            stage=stage,
            needs_refinement=stage != "stable",
            candidates=candidates,
            decisive_next_facts=decisive_next_facts,
            summary=summary,
        )

    def build_fact_slot_states(
        self,
        *,
        state: MatterState,
        known_facts: dict[str, Any] | None = None,
        missing_facts: Iterable[str] | None = None,
    ) -> list[FactSlotState]:
        known_facts = known_facts or {}
        missing_fact_keys = [item for item in (missing_facts or []) if isinstance(item, str) and item.strip()]
        profile = self._resolve_profile(state.operation_type, state.issue_type, state.visa_type)
        ordered_keys: list[str] = []

        if profile is not None:
            ordered_keys.extend(profile.required_facts)
            ordered_keys.extend(profile.optional_facts)

        for key in missing_fact_keys:
            if key not in ordered_keys:
                ordered_keys.append(key)

        if not ordered_keys:
            ordered_keys.extend(
                k
                for k in known_facts.keys()
                if isinstance(k, str) and k not in {"issue_type", "operation_type", "visa_type", "has_refusal", "has_cancellation", "seeking_review"}
            )

        slots: list[FactSlotState] = []
        for idx, fact_key in enumerate(self._unique(ordered_keys), start=1):
            slot = self._slot_status_for_fact(
                fact_key,
                known_facts,
                state.fact_status,
                required=(profile is not None and fact_key in profile.required_facts),
                blocking=(profile is not None and fact_key in profile.blocking_facts),
                required_for_operations=[profile.key] if profile is not None else ([state.operation_type] if state.operation_type else []),
                question_priority=idx,
            )
            slots.append(slot)
        return slots

    def build_interaction_plan(
        self,
        *,
        state: MatterState,
        case_hypothesis: CaseHypothesis,
        fact_slot_states: list[FactSlotState],
        policy: PolicyDecision,
        evidence: EvidencePackage,
    ) -> InteractionPlan:
        profile = self._resolve_profile(
            case_hypothesis.primary_operation_type,
            state.issue_type,
            state.visa_type,
        )
        required_slots = [slot for slot in fact_slot_states if slot.required]
        required_missing = [slot.fact_key for slot in required_slots if slot.status not in KNOWN_STATUSES]
        blocking_missing = [slot.fact_key for slot in fact_slot_states if slot.blocking and slot.status not in KNOWN_STATUSES]
        known_summary = {
            slot.fact_key: (slot.value_display if slot.value_display is not None else slot.value)
            for slot in fact_slot_states
            if slot.status in KNOWN_STATUSES
        }
        requested_slots = self._select_requested_slots(fact_slot_states)
        requested_facts = [
            InteractionFactRequest(
                fact_key=slot.fact_key,
                label=slot.label,
                prompt=self._fact_prompt(slot.fact_key),
                input_type=self._fact_spec(slot.fact_key).input_type,
                options=list(self._fact_spec(slot.fact_key).options),
                required=slot.required,
                blocking=slot.blocking,
                why_needed=slot.why_needed,
            )
            for slot in requested_slots
        ]

        warnings: list[str] = []
        if state.risk_flags.deadline_sensitive and "notification_date" in required_missing:
            warnings.append("The timing may matter here, so it is safer to clarify the notification date as early as possible.")
        if policy.reasons:
            for reason in policy.reasons:
                pretty = self._humanize_reason(reason)
                if pretty and pretty not in warnings:
                    warnings.append(pretty)
        if evidence.unsupported_requests:
            warnings.append("Some of the exact next-step questions are not yet fully supported by the current evidence.")

        if policy.escalate or policy.next_action == "suggest_consultation":
            mode = "escalation"
            answer_mode = "escalate"
            primary_prompt = profile.escalation_intro if profile is not None else "This matter may be time-sensitive or high-risk, so legal review is sensible."
        elif policy.next_action == "ask_followup":
            mode = "guided_intake"
            answer_mode = "qualified_general" if evidence.supported_facts else "ask_followup"
            primary_prompt = profile.followup_intro if profile is not None else "I can help further, but I first need a few key details."
        elif policy.next_action == "answer":
            if warnings or policy.confidence_cap == "low":
                mode = "analysis_ready"
                answer_mode = "answer_with_warning"
            else:
                mode = "answer"
                answer_mode = "direct_answer"
            primary_prompt = "I have enough of the key details to give a more targeted answer now."
        else:
            mode = "guided_intake"
            answer_mode = "ask_followup"
            primary_prompt = "Please provide a little more information so I can guide you properly."

        progress = InteractionProgress(
            collected_required=sum(1 for slot in required_slots if slot.status in KNOWN_STATUSES),
            total_required=len(required_slots),
        )

        return InteractionPlan(
            mode=mode,
            answer_mode=answer_mode,
            conversation_state=state.conversation_state,
            next_action=policy.next_action,
            primary_prompt=primary_prompt,
            requested_facts=requested_facts,
            missing_required_facts=required_missing,
            missing_blocking_facts=blocking_missing,
            known_facts_summary=known_summary,
            progress=progress,
            warnings=warnings,
            can_answer_with_partial_information=not policy.escalate,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _resolve_profile(
        self,
        operation_type: str | None,
        issue_type: str | None,
        visa_type: str | None,
    ) -> OperationProfile | None:
        if operation_type and operation_type in OPERATION_PROFILES:
            return OPERATION_PROFILES[operation_type]
        if issue_type == "student_visa":
            return OPERATION_PROFILES["student_refusal_next_steps"]
        if visa_type == "bridging":
            return OPERATION_PROFILES["bridging_travel"]
        return None

    def _candidate_operations(
        self,
        *,
        question: str,
        primary_operation: str | None,
        issue_type: str | None,
        visa_type: str | None,
    ) -> list[str]:
        q = (question or "").lower()
        candidates: list[str] = []
        if primary_operation:
            candidates.append(primary_operation)

        if "refus" in q and ("what should i do" in q or "next" in q):
            candidates.extend(["student_refusal_next_steps", "review_rights", "review_deadline"])
        if "review" in q or "appeal" in q or "tribunal" in q:
            candidates.extend(["review_rights", "review_deadline"])
        if "bridging" in q and ("travel" in q or "leave" in q or "come back" in q):
            candidates.append("bridging_travel")
        if "485" in q or "temporary graduate" in q:
            candidates.append("485_eligibility_overview")
        if "document" in q or "prepare" in q or "checklist" in q:
            candidates.append("document_checklist")
        if "4020" in q or "misleading" in q or "false information" in q:
            candidates.append("pic4020_risk")

        if issue_type == "student_visa" and "student_refusal_next_steps" not in candidates:
            candidates.append("student_refusal_next_steps")
        if visa_type == "bridging" and "bridging_travel" not in candidates:
            candidates.append("bridging_travel")

        return self._unique(candidates)[:3] or ["document_checklist"]

    def _infer_primary_operation(
        self,
        *,
        question: str,
        issue_type: str | None,
        visa_type: str | None,
    ) -> str | None:
        q = (question or "").lower()
        if "bridging" in q and ("travel" in q or "leave" in q or "come back" in q):
            return "bridging_travel"
        if "review" in q and ("deadline" in q or "time" in q):
            return "review_deadline"
        if "review" in q or "appeal" in q or "tribunal" in q:
            return "review_rights"
        if "refus" in q and ("what should i do" in q or "next" in q):
            return "student_refusal_next_steps"
        if "485" in q or "temporary graduate" in q:
            return "485_eligibility_overview"
        if "document" in q or "prepare" in q or "checklist" in q:
            return "document_checklist"
        if "4020" in q or "misleading" in q or "false information" in q:
            return "pic4020_risk"
        if issue_type == "student_visa":
            return "student_refusal_next_steps"
        if visa_type == "bridging":
            return "bridging_travel"
        return None

    def _score_candidate(
        self,
        *,
        operation: str,
        rank: int,
        primary_operation: str | None,
        question: str,
    ) -> float:
        score = 0.45
        if operation == primary_operation:
            score = 0.82
        else:
            score = max(0.55 - rank * 0.08, 0.28)
        q = question.lower()
        if operation == "student_refusal_next_steps" and "refus" in q:
            score += 0.08
        if operation in {"review_rights", "review_deadline"} and ("review" in q or "appeal" in q or "tribunal" in q):
            score += 0.08
        if operation == "bridging_travel" and "bridging" in q and ("travel" in q or "leave" in q):
            score += 0.08
        return min(score, 0.95)

    def _candidate_reason(self, operation: str, question: str, rank: int) -> str:
        q = question.lower()
        if operation == "student_refusal_next_steps" and "refus" in q:
            return "The question mentions refusal and asks what to do next."
        if operation == "review_rights" and ("review" in q or "appeal" in q or "tribunal" in q):
            return "The question appears to be asking about review options."
        if operation == "review_deadline" and ("deadline" in q or "when" in q or "time" in q):
            return "The question appears to involve timing or deadline concerns."
        if operation == "bridging_travel" and "bridging" in q:
            return "The question appears to be about bridging visa travel."
        if rank == 0:
            return "This is the best current fit based on the known facts."
        return "This remains a plausible alternative classification while facts are still incomplete."

    def _build_hypothesis_summary(
        self,
        *,
        primary_operation: str | None,
        stage: str,
        decisive_next_facts: list[str],
        issue_type: str | None,
    ) -> str:
        if not primary_operation:
            return "The case classification is still provisional and should become clearer after a few key facts are collected."
        op_text = primary_operation.replace("_", " ")
        if decisive_next_facts:
            fact_text = ", ".join(decisive_next_facts)
            return f"Current case hypothesis: {op_text}. Classification stage: {stage}. The next decisive facts are: {fact_text}."
        suffix = f" within {issue_type.replace('_', ' ')}" if issue_type else ""
        return f"Current case hypothesis: {op_text}{suffix}. The classification looks stable on the current facts."

    def _label_for_score(self, score: float) -> ConfidenceLevel:
        if score >= 0.8:
            return "high"
        if score >= 0.58:
            return "medium"
        return "low"

    def _slot_status_for_fact(
        self,
        fact_key: str,
        known_facts: dict[str, Any],
        fact_status: dict[str, str],
        *,
        required: bool = False,
        blocking: bool = False,
        required_for_operations: list[str] | None = None,
        question_priority: int | None = None,
    ) -> FactSlotState:
        spec = self._fact_spec(fact_key)
        explicit_status = str(fact_status.get(fact_key) or "").strip().lower()
        value = self._read_fact_value(fact_key, known_facts)
        status = self._derive_status(spec, value, explicit_status)
        confidence = self._parse_confidence(explicit_status)
        value_display = self._display_value(spec, value)
        source = "carried_context" if value is not None else None

        return FactSlotState(
            fact_key=fact_key,
            label=spec.label,
            status=status,
            value=value,
            value_display=value_display,
            source=source,
            confidence=confidence,
            required=required,
            blocking=blocking,
            required_for_operations=required_for_operations or [],
            why_needed=spec.why_needed,
            question_priority=question_priority,
        )

    def _fact_spec(self, fact_key: str) -> FactSpec:
        if fact_key in FACT_SPECS:
            return FACT_SPECS[fact_key]
        return FactSpec(
            key=fact_key,
            label=self._humanize_fact_key(fact_key),
            prompt=f"Please provide {self._humanize_fact_key(fact_key).lower()}.",
            why_needed="This detail may affect the next-step guidance.",
            input_type="short_text",
        )

    def _fact_prompt(self, fact_key: str) -> str:
        return self._fact_spec(fact_key).prompt

    def _read_fact_value(self, fact_key: str, known_facts: dict[str, Any]) -> Any | None:
        spec = self._fact_spec(fact_key)
        keys_to_try = (fact_key, *spec.aliases)
        for key in keys_to_try:
            if key not in known_facts:
                continue
            value = known_facts.get(key)
            if key == "in_australia":
                if value is True:
                    return "in_australia"
                if value is False:
                    return "outside_australia"
                return value
            return value
        return None

    def _derive_status(self, spec: FactSpec, value: Any | None, explicit_status: str) -> str:
        if explicit_status in {"user_unsure", "document_unavailable", "not_applicable", "conflicting"}:
            return explicit_status
        if value is None or value == "":
            return "missing"
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"not_sure", "unknown", "unsure", "don't know", "dont know"}:
                return "user_unsure"
            if lowered in {"n/a", "na", "not_applicable"}:
                return "not_applicable"
            if spec.false_status == "document_unavailable" and lowered in {"no", "false"}:
                return "document_unavailable"
            if lowered == "conflicting":
                return "conflicting"
            return "known"
        if isinstance(value, bool):
            if value is False and spec.false_status:
                return spec.false_status
            return "known"
        return "known"

    def _display_value(self, spec: FactSpec, value: Any | None) -> str | None:
        if value is None:
            return None
        if spec.key == "onshore_offshore":
            if value == "in_australia":
                return "In Australia"
            if value == "outside_australia":
                return "Outside Australia"
            if value == "not_sure":
                return "Not sure"
        if spec.key == "refusal_notice_available":
            if value is True or value == "yes":
                return "Yes"
            if value is False or value == "no":
                return "No"
            if value == "not_sure":
                return "Not sure"
        if isinstance(value, bool):
            return "Yes" if value else "No"
        return str(value)

    def _parse_confidence(self, explicit_status: str) -> ConfidenceLevel | None:
        if explicit_status.startswith("known:"):
            label = explicit_status.split(":", 1)[1].strip().lower()
            if label in {"low", "medium", "high"}:
                return label  # type: ignore[return-value]
        return None

    def _select_requested_slots(self, slots: list[FactSlotState]) -> list[FactSlotState]:
        missing_required = [slot for slot in slots if slot.required and slot.status not in KNOWN_STATUSES]
        missing_required.sort(key=lambda slot: (not slot.blocking, slot.question_priority or 999))
        return missing_required[:1]

    def _humanize_fact_key(self, key: str) -> str:
        return key.replace("_", " ").strip().title()

    def _humanize_reason(self, reason: str) -> str | None:
        text = (reason or "").strip()
        if not text:
            return None
        mapping = {
            "deadline_sensitive": "This looks like a timing-sensitive matter.",
            "missing_information": "Some key facts are still missing.",
            "context_insufficient": "The current evidence is not yet specific enough for a confident answer.",
            "unsupported_specificity": "Some of the exact requested details are not yet grounded in the current evidence.",
            "missing_notification_date": "The notification date is especially important here.",
            "live_fetch_needed_but_not_used": "More official-source checking may still be needed.",
            "high_risk_issue": "This looks like a higher-risk matter.",
        }
        if text in mapping:
            return mapping[text]
        if text.startswith("specific_marker_not_supported"):
            return "The current evidence does not yet support the exact specific detail being asked."
        return text.replace("_", " ").capitalize() + "."

    def _unique(self, values: Iterable[str]) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for value in values:
            if not value or value in seen:
                continue
            seen.add(value)
            ordered.append(value)
        return ordered
