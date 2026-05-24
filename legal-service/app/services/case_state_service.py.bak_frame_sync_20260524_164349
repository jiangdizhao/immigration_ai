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
    "visa_condition_number": FactSpec(
        key="visa_condition_number",
        label="Visa condition number",
        prompt="Which visa condition number are you asking about?",
        why_needed="The condition number determines the exact meaning and practical effect.",
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
    "qualification_level": FactSpec(
        key="qualification_level",
        label="Qualification level",
        prompt="What qualification did you complete? For example diploma, trade qualification, Bachelor, Masters or PhD.",
        why_needed="The qualification level helps classify the 485 stream.",
        input_type="single_select",
        options=("trade", "diploma", "associate_degree", "bachelor", "masters", "phd", "not_sure"),
    ),
    "first_485_or_subsequent": FactSpec(
        key="first_485_or_subsequent",
        label="First or subsequent 485",
        prompt="Is this your first 485 application, a second/regional 485, or a replacement/subsequent application?",
        why_needed="The 485 pathway changes depending on whether this is a first, second, subsequent, or replacement application.",
        input_type="single_select",
        options=("first_485", "second_485", "subsequent_485", "replacement", "not_sure"),
    ),
    "current_location": FactSpec(
        key="current_location",
        label="Current location",
        prompt="Are you currently in Australia or outside Australia?",
        why_needed="Location can affect application validity and practical options.",
        input_type="single_select",
        options=("in_australia", "outside_australia", "not_sure"),
    ),
    "application_timing": FactSpec(
        key="application_timing",
        label="Application timing",
        prompt="When do you plan to lodge the 485 application, or have you already lodged it?",
        why_needed="Timing can affect validity and completion-window issues.",
        input_type="short_text",
    ),
    "skills_assessment_status": FactSpec(
        key="skills_assessment_status",
        label="Skills assessment status",
        prompt="Have you applied for or obtained a skills assessment?",
        why_needed="Skills assessment is a key issue for the vocational 485 stream.",
        input_type="single_select",
        options=("not_applied", "applied", "obtained", "negative", "not_sure"),
    ),
    "nominated_occupation": FactSpec(
        key="nominated_occupation",
        label="Nominated occupation",
        prompt="What nominated occupation are you using or considering?",
        why_needed="The vocational stream may depend on nominated occupation and qualification relevance.",
        input_type="short_text",
    ),
    "qualification_related_to_occupation": FactSpec(
        key="qualification_related_to_occupation",
        label="Qualification related to occupation",
        prompt="Is your qualification closely related to your nominated occupation?",
        why_needed="A mismatch between qualification and nominated occupation is a common refusal risk.",
        input_type="single_select",
        options=("yes", "no", "not_sure"),
    ),
    "course_cricos_registered": FactSpec(
        key="course_cricos_registered",
        label="CRICOS course",
        prompt="Was your course CRICOS registered?",
        why_needed="CRICOS study is relevant to 485 study requirements.",
        input_type="single_select",
        options=("yes", "no", "not_sure"),
    ),
    "australian_study_requirement_met": FactSpec(
        key="australian_study_requirement_met",
        label="Australian Study Requirement",
        prompt="Did you complete at least two academic years / 16 months of study in Australia?",
        why_needed="The Australian Study Requirement is central to many 485 pathways.",
        input_type="single_select",
        options=("yes", "no", "not_sure"),
    ),
    "previous_485_held": FactSpec(
        key="previous_485_held",
        label="Previous 485 held",
        prompt="Have you previously held a Subclass 485 visa?",
        why_needed="Prior 485 history affects second, subsequent and replacement pathways.",
        input_type="boolean",
        options=("yes", "no", "not_sure"),
    ),
    "regional_study_location": FactSpec(
        key="regional_study_location",
        label="Regional study location",
        prompt="Did you study in a regional area? If yes, which area?",
        why_needed="Regional study and residence can affect second 485 eligibility.",
        input_type="short_text",
    ),
    "regional_residence_duration": FactSpec(
        key="regional_residence_duration",
        label="Regional residence duration",
        prompt="How long did you live/work/study in the regional area before applying?",
        why_needed="Regional extension pathways may require evidence of regional residence/work/study.",
        input_type="short_text",
    ),
    "replacement_reason": FactSpec(
        key="replacement_reason",
        label="Replacement reason",
        prompt="What disruption or reason makes you think the replacement stream applies?",
        why_needed="Replacement stream eligibility depends on previous 485 history and disruption facts.",
        input_type="long_text",
    ),
    "health_insurance_status": FactSpec(
        key="health_insurance_status",
        label="Health insurance",
        prompt="Do you currently have adequate health insurance for the relevant period?",
        why_needed="Health insurance can be relevant to visa conditions and 485 evidence.",
        input_type="single_select",
        options=("yes", "no", "not_sure"),
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
        required_facts=(),
        optional_facts=("current_visa", "travel_need", "onshore_offshore"),
        blocking_facts=(),
        followup_intro="Travel on a bridging visa depends on the visa and what you are trying to do, so I need a little more detail first.",
    ),
    "485_eligibility_overview": OperationProfile(
        key="485_eligibility_overview",
        required_facts=("visa_subclass", "completion_date"),
        optional_facts=("notification_date",),
        blocking_facts=(),
        followup_intro="I can give a more useful Temporary Graduate overview if I know a little more about your situation.",
    ),
    "485_stream_selection": OperationProfile(
        key="485_stream_selection",
        required_facts=("qualification_level", "first_485_or_subsequent"),
        optional_facts=("current_location", "current_visa", "completion_date"),
        blocking_facts=("qualification_level",),
        followup_intro="I can help classify the right 485 pathway first, because vocational, higher education, regional and replacement pathways use different criteria.",
    ),
    "485_vocational_stream": OperationProfile(
        key="485_vocational_stream",
        required_facts=("qualification_level", "completion_date", "skills_assessment_status", "nominated_occupation"),
        optional_facts=("qualification_related_to_occupation", "australian_study_requirement_met", "current_visa"),
        blocking_facts=("skills_assessment_status", "nominated_occupation"),
        followup_intro="For the 485 vocational stream, skills assessment and nominated occupation are key issues.",
    ),
    "485_higher_education_stream": OperationProfile(
        key="485_higher_education_stream",
        required_facts=("qualification_level", "completion_date", "course_cricos_registered"),
        optional_facts=("australian_study_requirement_met", "current_visa", "first_485_or_subsequent"),
        blocking_facts=("qualification_level", "completion_date"),
        followup_intro="For the 485 higher education pathway, the qualification type and study/completion timing are central.",
    ),
    "485_regional_extension": OperationProfile(
        key="485_regional_extension",
        required_facts=("previous_485_held", "regional_study_location", "regional_residence_duration"),
        optional_facts=("current_location", "current_visa"),
        blocking_facts=("previous_485_held", "regional_residence_duration"),
        followup_intro="For a second or regional 485 pathway, prior 485 history and regional residence evidence are decisive.",
    ),
    "485_replacement_stream": OperationProfile(
        key="485_replacement_stream",
        required_facts=("previous_485_held", "replacement_reason"),
        optional_facts=("current_location", "current_visa", "application_timing"),
        blocking_facts=("previous_485_held", "replacement_reason"),
        followup_intro="For a replacement 485 pathway, I need to understand your previous 485 and the disruption reason.",
    ),
    "document_checklist": OperationProfile(
        key="document_checklist",
        required_facts=("visa_subclass",),
        optional_facts=("refusal_notice_available", "refusal_reason_if_known"),
        blocking_facts=(),
        followup_intro="I can suggest a more relevant document checklist if I know the visa context.",
    ),
    "visa_condition_explainer": OperationProfile(
        key="visa_condition_explainer",
        required_facts=(),
        optional_facts=("visa_condition_number", "visa_subclass"),
        blocking_facts=(),
        followup_intro="I can explain the condition more accurately if I know the exact condition number.",
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


KNOWN_STATUSES = {"known", "not_applicable", "document_unavailable", "user_unsure"}


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
        inferred_operation = self._infer_primary_operation(
            question=question,
            issue_type=state.issue_type,
            visa_type=state.visa_type,
        )
        primary_operation = inferred_operation or state.operation_type or self._infer_primary_operation(
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
        profile = self._resolve_profile(state.operation_type, state.issue_type, state.visa_type)
        ordered_keys: list[str] = []

        if profile is not None:
            ordered_keys.extend(profile.required_facts)
            ordered_keys.extend(profile.optional_facts)

        for item in (missing_facts or []):
            canonical_key = self._canonical_fact_key_from_text(item)
            if canonical_key and canonical_key not in ordered_keys:
                ordered_keys.append(canonical_key)

        if not ordered_keys:
            ordered_keys.extend(
                key
                for key in known_facts.keys()
                if isinstance(key, str)
                and key in FACT_SPECS
                and key not in {"issue_type", "operation_type", "visa_type", "has_refusal", "has_cancellation", "seeking_review"}
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

        primary_operation = case_hypothesis.primary_operation_type or state.operation_type
        force_485_analysis_ready = (
            bool(primary_operation)
            and str(primary_operation).startswith("485_")
            and not required_missing
            and not blocking_missing
        )

        warnings: list[str] = []
        if state.risk_flags.deadline_sensitive and "notification_date" in required_missing:
            warnings.append("The timing may matter here, so it is safer to clarify the notification date as early as possible.")
        if policy.reasons:
            for reason in policy.reasons:
                pretty = self._humanize_reason(reason)
                if pretty and pretty not in warnings:
                    warnings.append(pretty)
        # The public widget should not feel like a technical audit log. Keep only
        # the most important warning; detailed reasons remain in retrieval_debug.
        warnings = warnings[:1]
        if evidence.unsupported_requests:
            warning = "Some of the exact next-step questions are not yet fully supported by the current evidence."
            if warning not in warnings:
                warnings.append(warning)

        if policy.escalate or policy.next_action == "suggest_consultation":
            mode = "escalation"
            answer_mode = "escalate"
            primary_prompt = profile.escalation_intro if profile is not None else "This matter may be time-sensitive or high-risk, so legal review is sensible."
        elif force_485_analysis_ready:
            mode = "analysis_ready"
            answer_mode = "answer_with_warning"
            primary_prompt = "I have the key 485 pathway facts needed to give a more useful assessment now."
        elif policy.next_action == "ask_followup":
            mode = "guided_intake"
            answer_mode = "answer_then_ask"
            primary_prompt = profile.followup_intro if profile is not None else "I can still give general guidance, but one detail would help me be more specific."
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

        requested_facts: list[InteractionFactRequest] = []
        if mode == "guided_intake":
            requested_slots = self._select_requested_slots(fact_slot_states)
            if not requested_slots and required_missing:
                fallback_slots = [slot for slot in fact_slot_states if slot.fact_key in required_missing]
                fallback_slots.sort(key=lambda slot: (not slot.blocking, slot.question_priority or 999))
                requested_slots = fallback_slots[:1]
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

        if mode in {"answer", "analysis_ready"}:
            required_missing = []
            blocking_missing = []
            requested_facts = []

        progress = InteractionProgress(
            collected_required=sum(1 for slot in required_slots if slot.status in KNOWN_STATUSES),
            total_required=len(required_slots) if mode == "guided_intake" else 0,
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

    def _resolve_profile(
        self,
        operation_type: str | None,
        issue_type: str | None,
        visa_type: str | None,
    ) -> OperationProfile | None:
        if operation_type and operation_type in OPERATION_PROFILES:
            return OPERATION_PROFILES[operation_type]
        # Do not default every Student visa matter to refusal/review.
        # The CaseFrameRouter chooses student_refusal_next_steps only when refusal/review is explicit.
        if issue_type == "visa_conditions":
            return OPERATION_PROFILES["visa_condition_explainer"]
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
        if self._extract_condition_number(question) or "visa condition" in q:
            candidates.append("visa_condition_explainer")
        if "485" in q or "temporary graduate" in q:
            candidates.append("485_eligibility_overview")
        if "document" in q or "prepare" in q or "checklist" in q:
            candidates.append("document_checklist")
        if "4020" in q or "misleading" in q or "false information" in q:
            candidates.append("pic4020_risk")

        if not candidates and issue_type == "student_visa":
            candidates.append("student_refusal_next_steps")
        if not candidates and issue_type == "visa_conditions":
            candidates.append("visa_condition_explainer")
        if not candidates and visa_type == "bridging":
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
        if self._extract_condition_number(question) or "visa condition" in q:
            return "visa_condition_explainer"
        if "review" in q and ("deadline" in q or "time" in q):
            return "review_deadline"
        if "review" in q or "appeal" in q or "tribunal" in q:
            return "review_rights"
        if "refus" in q and ("what should i do" in q or "next" in q):
            return "student_refusal_next_steps"
        if "485" in q or "temporary graduate" in q:
            if "replacement" in q:
                return "485_replacement_stream"
            if "regional" in q or "second 485" in q:
                return "485_regional_extension"
            if any(term in q for term in ["diploma", "trade", "associate degree", "skills assessment", "vocational"]):
                return "485_vocational_stream"
            if any(term in q for term in ["bachelor", "master", "masters", "phd", "degree", "higher education"]):
                return "485_higher_education_stream"
            return "485_stream_selection"
        if "document" in q or "prepare" in q or "checklist" in q:
            return "document_checklist"
        if "4020" in q or "misleading" in q or "false information" in q:
            return "pic4020_risk"
        if issue_type == "student_visa":
            return "student_refusal_next_steps"
        if issue_type == "visa_conditions":
            return "visa_condition_explainer"
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
        if operation == "visa_condition_explainer" and (self._extract_condition_number(question) or "visa condition" in q):
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
        if operation == "visa_condition_explainer" and (self._extract_condition_number(question) or "visa condition" in q):
            return "The question appears to ask for an explanation of a visa condition."
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
        source = self._infer_fact_source(fact_key=fact_key, value=value, explicit_status=explicit_status)

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

    def _canonical_fact_key_from_text(self, value: str | None) -> str | None:
        text = str(value or "").strip().lower()
        if not text:
            return None
        if text in FACT_SPECS:
            return text

        keyword_map = {
            "notification_date": (
                "notification date",
                "notified of the refusal",
                "notified of the decision",
                "date you were notified",
            ),
            "refusal_notice_available": (
                "refusal notice",
                "refusal reasons",
                "quote the refusal notice",
                "upload or quote the refusal notice",
            ),
            "onshore_offshore": (
                "onshore",
                "offshore",
                "in australia",
                "outside australia",
            ),
            "refusal_reason_if_known": (
                "refusal reason",
                "decision-maker say caused the refusal",
                "main reason given",
            ),
            "current_visa": (
                "current visa",
                "visa or immigration status",
                "bridging visa subclass",
                "bva",
                "bvb",
                "vevo",
            ),
            "visa_condition_number": (
                "visa condition",
                "condition number",
                "8501",
                "8503",
                "8201",
            ),
            "travel_need": (
                "travel plan",
                "leave australia and return",
                "asking generally",
            ),
            "visa_subclass": ("visa subclass", "subclass"),
            "completion_date": ("complete your studies", "completion date"),
            "qualification_level": ("qualification level", "qualification", "diploma", "bachelor", "masters", "phd", "trade"),
            "first_485_or_subsequent": ("first 485", "second 485", "subsequent 485", "replacement stream"),
            "skills_assessment_status": ("skills assessment", "skills assessment status"),
            "nominated_occupation": ("nominated occupation", "occupation"),
            "regional_residence_duration": ("regional residence", "two years residence", "regional duration"),
            "incorrect_information_issue": ("incorrect information", "misleading", "4020"),
        }
        for canonical_key, patterns in keyword_map.items():
            if any(pattern in text for pattern in patterns):
                return canonical_key
        return None

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


    def _infer_fact_source(self, *, fact_key: str, value: Any | None, explicit_status: str) -> str | None:
        if value is None or value == "":
            return None
        if fact_key in {"current_visa", "travel_need"}:
            return "system_inferred"
        if explicit_status in {"user_unsure", "document_unavailable", "conflicting", "not_applicable"}:
            return "user_input"
        return "carried_context"

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
        if missing_required:
            return missing_required[:1]
        missing_optional = [slot for slot in slots if slot.status not in KNOWN_STATUSES]
        missing_optional.sort(key=lambda slot: (not slot.blocking, slot.question_priority or 999))
        return missing_optional[:1]

    def _extract_condition_number(self, text: str) -> str | None:
        import re

        match = re.search(r"(?:visa\s+)?condition\s*(\d{4})\b", text or "", flags=re.I)
        return match.group(1) if match else None

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
