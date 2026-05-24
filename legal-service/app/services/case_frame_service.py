
from __future__ import annotations

from dataclasses import asdict, dataclass, field
import json
import os
import re
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.services.llm_turn_analysis_service import RestrictedLLMTurnAnalysisService
from app.schemas.state import CaseHypothesis, FactSlotState, InteractionFactRequest, InteractionPlan, MatterState, RiskFlags


AnswerPreference = str


@dataclass(frozen=True, slots=True)
class CaseFrameDefinition:
    frame_id: str
    case_family: str
    operation_type: str
    user_goal: str
    issue_type: str | None = None
    visa_type: str | None = None
    response_tier: str = "provisional_recommendation"
    valid_fact_keys: tuple[str, ...] = ()
    askable_fact_keys: tuple[str, ...] = ()
    forbidden_fact_keys: tuple[str, ...] = ()
    live_current_sensitive: bool = False
    risk_level: str = "medium"
    default_next_question_en: str | None = None
    default_next_question_zh: str | None = None


@dataclass(slots=True)
class CaseFrameDecision:
    frame_id: str
    case_family: str
    operation_type: str
    user_goal: str
    issue_type: str | None
    visa_type: str | None
    response_tier: str
    route_action: str
    confidence: str
    score: float
    answer_preference: AnswerPreference
    valid_fact_keys: list[str] = field(default_factory=list)
    askable_fact_keys: list[str] = field(default_factory=list)
    forbidden_fact_keys: list[str] = field(default_factory=list)
    accepted_facts: list[str] = field(default_factory=list)
    rejected_facts: list[str] = field(default_factory=list)
    candidate_frames: list[dict[str, Any]] = field(default_factory=list)
    reason: str = ""
    default_next_question: str | None = None
    risk_level: str = "medium"
    live_current_sensitive: bool = False
    semantic_turn_intent: str | None = None
    semantic_frame_action: str | None = None
    semantic_router_confidence: str | None = None
    positive_evidence: list[str] = field(default_factory=list)
    negative_evidence: list[str] = field(default_factory=list)
    positive_issue_flags: dict[str, bool] = field(default_factory=dict)
    extracted_facts: dict[str, Any] = field(default_factory=dict)
    fact_confidence: dict[str, str] = field(default_factory=dict)
    semantic_router_debug: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class CaseFrameService:
    """
    Case-frame controller for customer-friendly, recommendation-first immigration conversations.

    The frame is the single source of truth for what this turn is about. It prevents
    stale refusal/review facts from contaminating 500/485 timing/compliance flows.
    """

    COMMON_REFUSAL_FACTS = (
        "notification_date",
        "decision_date",
        "refusal_date",
        "refusal_notice_available",
        "refusal_reason_if_known",
        "refusal_reason_hint",
        "review_deadline",
        "seeking_review",
        "has_refusal",
    )

    COMMON_500_FACTS = (
        "visa_subclass",
        "visa_type",
        "current_visa",
        "student_visa_expiry_date",
        "student_visa_expired_days",
        "work_hours_issue",
        "work_hours_per_fortnight",
        "attendance_warning",
        "attendance_rate",
        "school_warning",
        "home_affairs_notice_received",
        "current_enrolment_status",
        "course_progress_issue",
        "current_location",
        "onshore_offshore",
    )

    COMMON_485_FACTS = (
        "visa_subclass",
        "visa_type",
        "current_visa",
        "current_location",
        "onshore_offshore",
        "qualification_level",
        "qualification",
        "completion_date",
        "course_completion_date",
        "course_cricos_registered",
        "australian_study_requirement_met",
        "first_485_or_subsequent",
        "application_timing",
        "student_visa_expiry_date",
        "student_visa_expired_days",
        "student_visa_expires_in_days",
        "lodged_485_already",
        "english_test_status",
        "pte_status",
        "completion_letter_available",
        "official_transcript_available",
        "health_insurance_status",
        "age",
    )

    FACT_PROMPTS: dict[str, dict[str, str]] = {
        "home_affairs_notice_received": {
            "en": "Have you received any formal notice from Home Affairs, or only the school/university email?",
            "zh": "你目前只收到学校邮件，还是也收到了 Home Affairs 的正式通知？",
        },
        "current_location": {
            "en": "Are you currently in Australia or outside Australia?",
            "zh": "你现在人在澳大利亚境内还是境外？",
        },
        "student_visa_expiry_date": {
            "en": "What was or is the expiry date of your Student visa?",
            "zh": "你的 Student visa 到期日是哪一天？",
        },
        "lodged_485_already": {
            "en": "Have you already lodged the 485 application?",
            "zh": "你是否已经递交了 485 申请？",
        },
        "completion_letter_available": {
            "en": "Do you already have the completion letter and official transcript?",
            "zh": "你是否已经拿到 completion letter 和 official transcript？",
        },
        "qualification_level": {
            "en": "What qualification did you complete: diploma, Bachelor, Masters, PhD, or another qualification?",
            "zh": "你完成的是什么学历：diploma、Bachelor、Masters、PhD，还是其他学历？",
        },
        "visa_subclass": {
            "en": "Which visa subclass or visa type is involved?",
            "zh": "你想咨询的是哪个签证类别或 subclass？",
        },
    }

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv("FRAME_ROUTER_MODEL", os.getenv("GENERAL_QA_MODEL", "gpt-5.4-mini"))
        self._client: OpenAI | None = None
        self.llm_turn_analysis_service = RestrictedLLMTurnAnalysisService()
        refusal_forbidden = self.COMMON_REFUSAL_FACTS
        self.frames: dict[str, CaseFrameDefinition] = {
            "visa_topic_triage": CaseFrameDefinition(
                frame_id="visa_topic_triage",
                case_family="unknown_visa_topic",
                operation_type="visa_topic_triage",
                user_goal="choose_visa_topic",
                response_tier="triage_question",
                valid_fact_keys=("preferred_language",),
                askable_fact_keys=("visa_subclass",),
                forbidden_fact_keys=refusal_forbidden,
                default_next_question_en="What type of visa issue do you want to discuss?",
                default_next_question_zh="你想咨询哪一类签证问题？",
                risk_level="low",
            ),
            "student_visa_general_triage": CaseFrameDefinition(
                frame_id="student_visa_general_triage",
                case_family="student_visa",
                operation_type="student_visa_general_triage",
                user_goal="student_visa_general_question",
                issue_type="student_visa",
                visa_type="student",
                response_tier="provisional_recommendation",
                valid_fact_keys=self.COMMON_500_FACTS,
                askable_fact_keys=("visa_subclass", "student_visa_expiry_date", "current_location"),
                forbidden_fact_keys=(),
                default_next_question_en="What Student visa issue are you most worried about?",
                default_next_question_zh="你最担心的 Student visa 问题是什么？",
            ),
            "student_500_compliance_risk": CaseFrameDefinition(
                frame_id="student_500_compliance_risk",
                case_family="student_visa",
                operation_type="student_500_compliance_risk",
                user_goal="risk_assessment_and_next_steps",
                issue_type="student_visa",
                visa_type="student",
                response_tier="provisional_recommendation",
                valid_fact_keys=self.COMMON_500_FACTS,
                askable_fact_keys=("home_affairs_notice_received", "current_enrolment_status", "attendance_rate"),
                forbidden_fact_keys=refusal_forbidden,
                default_next_question_en="Have you received a formal Home Affairs notice, or only a school/university warning?",
                default_next_question_zh="你目前只收到学校邮件，还是也收到了 Home Affairs 的正式通知？",
                risk_level="high",
                live_current_sensitive=True,
            ),
            "500_expiry_or_extension": CaseFrameDefinition(
                frame_id="500_expiry_or_extension",
                case_family="student_visa",
                operation_type="500_expiry_or_extension",
                user_goal="current_status_and_next_steps",
                issue_type="student_visa",
                visa_type="student",
                response_tier="urgent_provisional_recommendation",
                valid_fact_keys=self.COMMON_500_FACTS + self.COMMON_485_FACTS,
                askable_fact_keys=("student_visa_expiry_date", "current_location", "lodged_485_already"),
                forbidden_fact_keys=refusal_forbidden,
                default_next_question_en="Are you currently in Australia, and what does VEVO show as your current status?",
                default_next_question_zh="你现在人在澳洲境内吗？VEVO 显示你的当前身份是什么？",
                risk_level="high",
                live_current_sensitive=True,
            ),
            "500_refusal_review": CaseFrameDefinition(
                frame_id="500_refusal_review",
                case_family="refusal_review",
                operation_type="student_refusal_next_steps",
                user_goal="review_or_next_steps",
                issue_type="visa_refusal",
                visa_type="student",
                response_tier="warning_answer",
                valid_fact_keys=self.COMMON_500_FACTS + self.COMMON_REFUSAL_FACTS,
                askable_fact_keys=("refusal_notice_available", "notification_date", "onshore_offshore"),
                forbidden_fact_keys=(),
                default_next_question_en="Do you have the refusal notice, and what date were you notified?",
                default_next_question_zh="你有拒签通知吗？是哪一天收到的？",
                risk_level="high",
                live_current_sensitive=True,
            ),
            "485_general_triage": CaseFrameDefinition(
                frame_id="485_general_triage",
                case_family="temporary_graduate_485",
                operation_type="485_stream_selection",
                user_goal="identify_485_pathway",
                issue_type="temporary_graduate_visa",
                visa_type="temporary_graduate",
                response_tier="provisional_recommendation",
                valid_fact_keys=self.COMMON_485_FACTS,
                askable_fact_keys=("qualification_level", "first_485_or_subsequent", "current_location"),
                forbidden_fact_keys=refusal_forbidden,
                default_next_question_en="What qualification did you complete, and is this your first 485 application?",
                default_next_question_zh="你完成的是什么学历？这是你的第一次 485 申请吗？",
                live_current_sensitive=True,
            ),
            "485_post_higher_education": CaseFrameDefinition(
                frame_id="485_post_higher_education",
                case_family="temporary_graduate_485",
                operation_type="485_higher_education_stream",
                user_goal="eligibility_and_next_steps",
                issue_type="temporary_graduate_visa",
                visa_type="temporary_graduate",
                response_tier="provisional_recommendation",
                valid_fact_keys=self.COMMON_485_FACTS,
                askable_fact_keys=("completion_date", "course_cricos_registered", "current_location"),
                forbidden_fact_keys=refusal_forbidden,
                default_next_question_en="Do you have your completion date and CRICOS course details?",
                default_next_question_zh="你是否知道课程完成日期，以及课程是否是 CRICOS registered？",
                live_current_sensitive=True,
            ),
            "485_age_qualification_policy": CaseFrameDefinition(
                frame_id="485_age_qualification_policy",
                case_family="temporary_graduate_485",
                operation_type="485_higher_education_stream",
                user_goal="focused_age_qualification_policy",
                issue_type="temporary_graduate_visa",
                visa_type="temporary_graduate",
                response_tier="focused_policy_recommendation",
                valid_fact_keys=self.COMMON_485_FACTS,
                askable_fact_keys=("current_location", "completion_date", "course_cricos_registered"),
                forbidden_fact_keys=refusal_forbidden,
                default_next_question_en="Do you want to check whether any exception or transitional rule may apply?",
                default_next_question_zh="你是否想进一步核对是否有例外或过渡规则适用？",
                risk_level="high",
                live_current_sensitive=True,
            ),
            "485_timing_and_lodgement": CaseFrameDefinition(
                frame_id="485_timing_and_lodgement",
                case_family="temporary_graduate_485",
                operation_type="485_timing_and_lodgement",
                user_goal="lodgement_timing_and_next_steps",
                issue_type="temporary_graduate_visa",
                visa_type="temporary_graduate",
                response_tier="provisional_recommendation",
                valid_fact_keys=self.COMMON_485_FACTS,
                askable_fact_keys=("completion_date", "current_visa", "current_location", "lodged_485_already"),
                forbidden_fact_keys=refusal_forbidden,
                default_next_question_en="Are you currently in Australia, and have you already lodged the 485 application?",
                default_next_question_zh="你现在人在澳洲境内吗？是否已经递交了 485 申请？",
                risk_level="medium",
                live_current_sensitive=True,
            ),
            "485_student_visa_expired_or_status_risk": CaseFrameDefinition(
                frame_id="485_student_visa_expired_or_status_risk",
                case_family="temporary_graduate_485",
                operation_type="485_student_visa_expired_or_status_risk",
                user_goal="current_status_and_485_lodgement_risk",
                issue_type="temporary_graduate_visa",
                visa_type="temporary_graduate",
                response_tier="urgent_provisional_recommendation",
                valid_fact_keys=self.COMMON_485_FACTS,
                askable_fact_keys=("current_location", "lodged_485_already", "student_visa_expiry_date"),
                forbidden_fact_keys=refusal_forbidden,
                default_next_question_en="Are you currently in Australia, and what does VEVO show as your current visa status?",
                default_next_question_zh="你现在人在澳洲境内吗？VEVO 显示你的当前签证状态是什么？",
                risk_level="high",
                live_current_sensitive=True,
            ),
            "485_english_test_or_pte_timing": CaseFrameDefinition(
                frame_id="485_english_test_or_pte_timing",
                case_family="temporary_graduate_485",
                operation_type="485_english_test_or_pte_timing",
                user_goal="english_test_timing_and_lodgement_strategy",
                issue_type="temporary_graduate_visa",
                visa_type="temporary_graduate",
                response_tier="provisional_recommendation",
                valid_fact_keys=self.COMMON_485_FACTS,
                askable_fact_keys=("completion_letter_available", "official_transcript_available", "current_location"),
                forbidden_fact_keys=refusal_forbidden,
                default_next_question_en="Do you already have your completion letter and official transcript?",
                default_next_question_zh="你是否已经拿到 completion letter 和 official transcript？",
                risk_level="high",
                live_current_sensitive=True,
            ),
            "485_refusal_review": CaseFrameDefinition(
                frame_id="485_refusal_review",
                case_family="refusal_review",
                operation_type="review_rights",
                user_goal="review_or_next_steps",
                issue_type="visa_refusal",
                visa_type="temporary_graduate",
                response_tier="warning_answer",
                valid_fact_keys=self.COMMON_485_FACTS + self.COMMON_REFUSAL_FACTS,
                askable_fact_keys=("refusal_notice_available", "notification_date", "onshore_offshore"),
                forbidden_fact_keys=(),
                default_next_question_en="Do you have the refusal notice, and what date were you notified?",
                default_next_question_zh="你有拒签通知吗？是哪一天收到的？",
                risk_level="high",
                live_current_sensitive=True,
            ),
            "visa_condition_explainer": CaseFrameDefinition(
                frame_id="visa_condition_explainer",
                case_family="visa_condition",
                operation_type="visa_condition_explainer",
                user_goal="condition_meaning_and_practical_effect",
                issue_type="visa_conditions",
                response_tier="direct_explainer",
                valid_fact_keys=("visa_condition_number", "visa_subclass", "current_visa"),
                askable_fact_keys=("visa_subclass",),
                forbidden_fact_keys=refusal_forbidden,
                default_next_question_en="Do you want me to explain how it affects your specific visa subclass?",
                default_next_question_zh="你想让我说明这个条件对你具体签证的影响吗？",
                risk_level="low",
            ),
            "other_visa_general": CaseFrameDefinition(
                frame_id="other_visa_general",
                case_family="other_visa",
                operation_type="other_visa_general",
                user_goal="general_intake_and_handoff",
                response_tier="provisional_recommendation",
                valid_fact_keys=("visa_subclass", "current_visa", "current_location", "preferred_language"),
                askable_fact_keys=("visa_subclass", "current_location"),
                forbidden_fact_keys=(),
                default_next_question_en="Which visa subclass or issue should we focus on?",
                default_next_question_zh="我们应该重点看哪个签证类别或问题？",
                risk_level="medium",
            ),
        }


    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client


    def route(
        self,
        *,
        question: str,
        original_question: str | None,
        current_state: MatterState,
        known_facts: dict[str, Any] | None,
        answer_preference: str | None = None,
    ) -> CaseFrameDecision:
        """
        Restricted-LLM authoritative semantic routing.

        Regex helpers may still exist as legacy fallback utilities, but they are
        no longer the authoritative semantic classifier. The LLM proposes the
        frame from a fixed registry; deterministic transition validation decides
        whether to keep, switch, or create the frame.
        """
        known_facts = dict(known_facts or {})
        preference = self._normalize_answer_preference(answer_preference, question, original_question)
        previous_frame = self._current_frame_id(current_state, known_facts)
        raw_message = original_question or question or ""
        internal_question = question or ""
        is_zh = self._looks_zh(raw_message)

        semantic = self.llm_turn_analysis_service.analyze(
            raw_user_message=raw_message,
            internal_question_en=internal_question,
            previous_frame_id=previous_frame,
            known_facts=known_facts,
            frame_registry=self._frame_registry_for_llm(),
        )
        semantic_dict = semantic.to_dict()

        selected, route_action, confidence, transition_reason = self._select_frame_from_semantic(
            semantic=semantic_dict,
            previous_frame=previous_frame,
        )
        definition = self.frames[selected]
        filtered_facts, filtered_confidence, rejected_llm_facts = self._filter_llm_facts(
            facts=semantic.extracted_facts,
            fact_confidence=semantic.fact_confidence,
            definition=definition,
        )

        facts_for_partition = {**known_facts, **filtered_facts}
        next_question = self._dynamic_next_question(definition, facts_for_partition, is_zh=is_zh) or (
            definition.default_next_question_zh if is_zh else definition.default_next_question_en
        )
        accepted_facts, rejected_facts = self._partition_facts(facts_for_partition, definition)
        if rejected_llm_facts:
            rejected_facts = sorted(set(rejected_facts) | set(rejected_llm_facts))

        score = {"high": 0.9, "medium": 0.65, "low": 0.35}.get(confidence, 0.65)
        candidate_debug = [
            {
                "source": "restricted_llm_turn_analysis",
                "frame_id": semantic.frame_id,
                "turn_intent": semantic.turn_intent,
                "frame_action": semantic.frame_action,
                "confidence": semantic.confidence,
                "selected": semantic.frame_id == selected,
                "reason": semantic.reason,
            }
        ]
        if previous_frame:
            candidate_debug.append(
                {
                    "source": "previous_active_frame",
                    "frame_id": previous_frame,
                    "selected": previous_frame == selected,
                }
            )

        return CaseFrameDecision(
            frame_id=definition.frame_id,
            case_family=definition.case_family,
            operation_type=definition.operation_type,
            user_goal=definition.user_goal,
            issue_type=definition.issue_type,
            visa_type=definition.visa_type,
            response_tier=definition.response_tier,
            route_action=route_action,
            confidence=confidence,
            score=score,
            answer_preference=preference,
            valid_fact_keys=list(definition.valid_fact_keys),
            askable_fact_keys=list(definition.askable_fact_keys),
            forbidden_fact_keys=list(definition.forbidden_fact_keys),
            accepted_facts=accepted_facts,
            rejected_facts=rejected_facts,
            candidate_frames=candidate_debug,
            reason=transition_reason,
            default_next_question=next_question,
            risk_level=definition.risk_level,
            live_current_sensitive=definition.live_current_sensitive,
            semantic_turn_intent=semantic.turn_intent,
            semantic_frame_action=semantic.frame_action,
            semantic_router_confidence=semantic.confidence,
            positive_evidence=semantic.positive_evidence,
            negative_evidence=semantic.negative_evidence,
            positive_issue_flags=semantic.positive_issue_flags,
            extracted_facts=filtered_facts,
            fact_confidence=filtered_confidence,
            semantic_router_debug=semantic_dict,
        )

    def apply_to_state(
        self,
        *,
        state: MatterState,
        known_facts: dict[str, Any],
        decision: CaseFrameDecision,
    ) -> tuple[MatterState, dict[str, Any], dict[str, Any]]:
        facts = dict(known_facts or {})
        original_keys = set(facts.keys())

        for key, value in (decision.extracted_facts or {}).items():
            if self._fact_present(value):
                facts[key] = value

        for key in decision.forbidden_fact_keys:
            facts.pop(key, None)

        facts["active_case_frame_id"] = decision.frame_id
        facts["case_family"] = decision.case_family
        facts["operation_type"] = decision.operation_type
        facts["answer_preference"] = decision.answer_preference
        facts["answer_tier"] = decision.response_tier
        if decision.issue_type:
            facts["issue_type"] = decision.issue_type
        if decision.visa_type:
            facts["visa_type"] = decision.visa_type

        updated = state.model_copy(deep=True)
        updated.operation_type = decision.operation_type
        if decision.issue_type:
            updated.issue_type = decision.issue_type
        if decision.visa_type:
            updated.visa_type = decision.visa_type
        updated.carried_intake_facts = facts

        for key in decision.forbidden_fact_keys:
            updated.fact_status.pop(key, None)
        for key, confidence in (decision.fact_confidence or {}).items():
            if key in facts and self._fact_present(facts.get(key)):
                label = confidence if confidence in {"low", "medium", "high"} else "medium"
                updated.fact_status[key] = f"known:{label}"

        updated.risk_flags = self._risk_flags_for_decision(decision)

        debug = decision.to_dict()
        debug["removed_fact_keys"] = sorted(original_keys - set(facts.keys()))
        return updated, facts, debug

    def align_case_hypothesis(self, case_hypothesis: CaseHypothesis, decision: CaseFrameDecision) -> CaseHypothesis:
        try:
            return case_hypothesis.model_copy(
                update={
                    "issue_type": decision.issue_type or case_hypothesis.issue_type,
                    "visa_type": decision.visa_type or case_hypothesis.visa_type,
                    "primary_operation_type": decision.operation_type,
                    "confidence_label": decision.confidence,
                    "confidence_score": decision.score,
                    "stage": "stable" if decision.confidence == "high" else "refining",
                    "needs_refinement": decision.confidence != "high",
                    "summary": f"Active case frame: {decision.frame_id}. User goal: {decision.user_goal}.",
                }
            )
        except Exception:
            case_hypothesis.primary_operation_type = decision.operation_type
            case_hypothesis.issue_type = decision.issue_type or case_hypothesis.issue_type
            case_hypothesis.visa_type = decision.visa_type or case_hypothesis.visa_type
            return case_hypothesis

    def apply_interaction_policy(
        self,
        *,
        fact_slot_states: list[FactSlotState],
        interaction_plan: InteractionPlan,
        known_facts: dict[str, Any],
        decision: CaseFrameDecision,
        response_language: str = "en",
    ) -> tuple[list[FactSlotState], InteractionPlan, dict[str, Any]]:
        forbidden = set(decision.forbidden_fact_keys)
        before_slots = [getattr(slot, "fact_key", "") for slot in fact_slot_states]
        fact_slot_states = [slot for slot in fact_slot_states if getattr(slot, "fact_key", "") not in forbidden]
        before_requested = [getattr(req, "fact_key", "") for req in (getattr(interaction_plan, "requested_facts", []) or [])]
        requested = [req for req in (getattr(interaction_plan, "requested_facts", []) or []) if getattr(req, "fact_key", "") not in forbidden]

        if decision.response_tier == "triage_question":
            self._set_attr(interaction_plan, "mode", "answer")
            self._set_attr(interaction_plan, "answer_mode", "direct_answer")
            self._set_attr(interaction_plan, "next_action", "answer")
            self._set_attr(interaction_plan, "requested_facts", [])
            self._set_attr(interaction_plan, "missing_required_facts", [])
            self._set_attr(interaction_plan, "missing_blocking_facts", [])
            self._set_attr(interaction_plan, "primary_prompt", decision.default_next_question or "What visa issue should we focus on?")
        elif decision.answer_preference in {"answer_first", "final_recommendation", "auto"}:
            self._set_attr(interaction_plan, "mode", "analysis_ready")
            self._set_attr(interaction_plan, "answer_mode", "answer_with_warning")
            self._set_attr(interaction_plan, "next_action", "answer")
            self._set_attr(interaction_plan, "requested_facts", [])
            self._set_attr(interaction_plan, "missing_required_facts", [])
            self._set_attr(interaction_plan, "missing_blocking_facts", [])
            self._set_attr(interaction_plan, "primary_prompt", decision.default_next_question or "I can answer with the current information and refine it if you add more details.")
        else:
            # User explicitly wants intake. Ask exactly one frame-valid fact.
            next_request = self._build_next_request(decision, known_facts, response_language=response_language)
            self._set_attr(interaction_plan, "mode", "guided_intake")
            self._set_attr(interaction_plan, "answer_mode", "answer_then_ask")
            self._set_attr(interaction_plan, "requested_facts", [next_request] if next_request else requested[:1])
            self._set_attr(interaction_plan, "missing_required_facts", [next_request.fact_key] if next_request else [])
            self._set_attr(interaction_plan, "missing_blocking_facts", [])
            self._set_attr(interaction_plan, "primary_prompt", decision.default_next_question or "One more detail would help.")

        debug = {
            "frame_id": decision.frame_id,
            "answer_preference": decision.answer_preference,
            "removed_slot_keys": sorted(set(before_slots) - {getattr(slot, "fact_key", "") for slot in fact_slot_states}),
            "removed_requested_fact_keys": sorted(set(before_requested) - {getattr(req, "fact_key", "") for req in (getattr(interaction_plan, "requested_facts", []) or [])}),
            "mode_after_frame_policy": getattr(interaction_plan, "mode", None),
        }
        return fact_slot_states, interaction_plan, debug


    def _frame_registry_for_llm(self) -> dict[str, dict[str, Any]]:
        registry: dict[str, dict[str, Any]] = {}
        for frame_id, definition in self.frames.items():
            registry[frame_id] = {
                "frame_id": definition.frame_id,
                "case_family": definition.case_family,
                "operation_type": definition.operation_type,
                "user_goal": definition.user_goal,
                "issue_type": definition.issue_type,
                "visa_type": definition.visa_type,
                "response_tier": definition.response_tier,
                "valid_fact_keys": list(definition.valid_fact_keys),
                "askable_fact_keys": list(definition.askable_fact_keys),
                "forbidden_fact_keys": list(definition.forbidden_fact_keys),
                "risk_level": definition.risk_level,
                "description": self._frame_description(definition),
            }
        return registry

    def _frame_description(self, definition: CaseFrameDefinition) -> str:
        if definition.frame_id == "visa_topic_triage":
            return "Temporary entry frame for broad, vague visa questions without concrete facts."
        if definition.frame_id == "485_student_visa_expired_or_status_risk":
            return "485 question involving expired/recently expired Student visa, unlawful-status concern, completion letter misunderstanding, or urgent current-status risk."
        if definition.frame_id == "485_english_test_or_pte_timing":
            return "485 timing question involving PTE/English test preparation near visa expiry."
        if definition.frame_id == "student_500_compliance_risk":
            return "Student visa 500 compliance risk involving work hours, attendance, school warning, or course progress."
        if definition.case_family == "refusal_review":
            return "Only for positive refusal, review, ART, appeal, or decision-notice facts."
        return f"{definition.case_family}: {definition.user_goal}"

    def _select_frame_from_semantic(
        self,
        *,
        semantic: dict[str, Any],
        previous_frame: str | None,
    ) -> tuple[str, str, str, str]:
        candidate = self._valid_frame_id(semantic.get("frame_id"))
        turn_intent = str(semantic.get("turn_intent") or "other")
        frame_action = str(semantic.get("frame_action") or "ask_clarifying_category")
        confidence = str(semantic.get("confidence") or "low")
        if confidence not in {"low", "medium", "high"}:
            confidence = "low"
        flags = semantic.get("positive_issue_flags") if isinstance(semantic.get("positive_issue_flags"), dict) else {}

        if candidate and self.frames[candidate].case_family == "refusal_review" and not bool(flags.get("refusal_or_review")):
            candidate = None

        if previous_frame == "visa_topic_triage":
            if candidate and candidate != "visa_topic_triage" and turn_intent in {
                "concrete_case_scenario",
                "recommendation_request",
                "topic_switch",
                "document_update",
                "answer_to_previous_question",
            }:
                return candidate, "switch_frame", confidence if confidence != "low" else "medium", "LLM classified a concrete case after temporary triage; switching frame."
            return "visa_topic_triage", "continue_active_frame", confidence if confidence != "low" else "medium", "Still broad/vague after triage; staying in triage."

        if previous_frame and previous_frame in self.frames and previous_frame != "visa_topic_triage":
            if turn_intent in {"fact_update", "answer_to_previous_question"} or frame_action == "continue_active_frame":
                return previous_frame, "continue_active_frame", confidence if confidence != "low" else "medium", "Fact update; preserving active concrete frame."
            if frame_action == "switch_frame" and candidate and candidate != previous_frame:
                return candidate, "switch_frame", confidence, "LLM proposed explicit topic switch."
            if candidate == previous_frame:
                return previous_frame, "continue_active_frame", confidence, "LLM confirmed active frame."
            if candidate and confidence == "high" and turn_intent in {"concrete_case_scenario", "topic_switch", "recommendation_request"}:
                return candidate, "switch_frame", confidence, "High-confidence new concrete frame."
            return previous_frame, "continue_active_frame", "medium", "No validated switch; preserving active concrete frame."

        if candidate:
            action = "create_new_frame" if candidate != "visa_topic_triage" else "stay_triage"
            return candidate, action, confidence, "LLM selected initial frame."

        return "visa_topic_triage", "stay_triage", "low", "Safe triage fallback."

    def _filter_llm_facts(
        self,
        *,
        facts: dict[str, Any],
        fact_confidence: dict[str, str],
        definition: CaseFrameDefinition,
    ) -> tuple[dict[str, Any], dict[str, str], list[str]]:
        allowed = set(definition.valid_fact_keys) | {
            "issue_type",
            "visa_type",
            "operation_type",
            "active_case_frame_id",
            "case_family",
            "answer_preference",
            "answer_tier",
        }
        forbidden = set(definition.forbidden_fact_keys)
        accepted: dict[str, Any] = {}
        accepted_conf: dict[str, str] = {}
        rejected: list[str] = []
        for key, value in (facts or {}).items():
            key_s = str(key)
            if key_s in forbidden or (definition.valid_fact_keys and key_s not in allowed):
                rejected.append(key_s)
                continue
            if not self._fact_present(value):
                continue
            accepted[key_s] = value
            conf = str((fact_confidence or {}).get(key_s) or "medium").lower()
            accepted_conf[key_s] = conf if conf in {"low", "medium", "high"} else "medium"
        return accepted, accepted_conf, sorted(set(rejected))

    def _risk_flags_for_decision(self, decision: CaseFrameDecision) -> RiskFlags:
        review_related = decision.case_family == "refusal_review"
        urgent_status = decision.response_tier == "urgent_provisional_recommendation"
        return RiskFlags(
            deadline_sensitive=bool(review_related or urgent_status),
            cancellation_related=bool(decision.issue_type == "visa_cancellation"),
            detention_related=False,
            character_issue=False,
            pic4020_issue=bool(decision.operation_type == "pic4020_risk"),
            review_related=review_related,
        )

    # ------------------------------------------------------------------
    # Transition-first routing helpers
    # ------------------------------------------------------------------
    def _select_frame_by_transition(
        self,
        *,
        lowered: str,
        previous_frame: str | None,
        deterministic: str | None,
        llm_candidate: dict[str, Any] | None,
    ) -> tuple[str, str, str, str]:
        concrete_signal = self._has_concrete_case_signal(lowered)
        short_update = self._is_short_fact_update(lowered)
        llm_frame = self._valid_frame_id(llm_candidate.get("frame_id") if llm_candidate else None)
        proposed = deterministic or llm_frame

        if previous_frame == "visa_topic_triage":
            if concrete_signal:
                selected = self._valid_frame_id(proposed) or "other_visa_general"
                if selected == "visa_topic_triage":
                    selected = "other_visa_general"
                return selected, "switch_frame", "high", "Triage frame is temporary; concrete facts require switching to a case frame."
            return "visa_topic_triage", "continue_active_frame", "high", "Still a broad triage turn without concrete case facts."

        if previous_frame and previous_frame in self.frames and not self._clear_topic_shift(lowered, previous_frame):
            if short_update or not concrete_signal:
                return previous_frame, "continue_active_frame", "high", "Short fact update; preserving active concrete frame."

        if proposed and proposed in self.frames:
            action = "create_new_frame" if not previous_frame else ("continue_active_frame" if previous_frame == proposed else "switch_frame")
            return proposed, action, "high" if deterministic else "medium", "Selected proposed concrete frame after transition validation."

        if self._broad_visa_inquiry(lowered):
            return "visa_topic_triage", "create_new_frame" if not previous_frame else "switch_frame", "high", "Broad visa inquiry; use temporary triage frame."

        if previous_frame and previous_frame in self.frames and not self._clear_topic_shift(lowered, previous_frame):
            return previous_frame, "continue_active_frame", "medium", "No better concrete frame; preserving active frame."

        return "other_visa_general", "create_new_frame" if not previous_frame else "switch_frame", "low", "Fallback general visa frame."

    def _deterministic_frame_candidate(self, *, lowered: str, known_facts: dict[str, Any]) -> str | None:
        has_500 = self._has_student_500(lowered, known_facts)
        has_485 = self._has_485(lowered, known_facts)
        if self._broad_visa_inquiry(lowered) and not self._has_concrete_case_signal(lowered):
            return "visa_topic_triage"
        if self._condition_query(lowered):
            return "visa_condition_explainer"
        if self._explicit_refusal_or_review(lowered):
            if has_485:
                return "485_refusal_review"
            if has_500:
                return "500_refusal_review"
            return "500_refusal_review"
        if has_500 and self._student_compliance_risk(lowered):
            return "student_500_compliance_risk"
        if has_485 and self._student_expired_485_status(lowered):
            return "485_student_visa_expired_or_status_risk"
        if has_485 and self._pte_or_english_timing(lowered):
            return "485_english_test_or_pte_timing"
        if has_485 and self._age_qualification(lowered):
            return "485_age_qualification_policy"
        if has_485 and self._higher_ed_485(lowered):
            return "485_post_higher_education"
        if has_500 and self._student_expiry_or_extension(lowered):
            return "500_expiry_or_extension"
        if has_485:
            return "485_general_triage"
        if has_500:
            return "student_visa_general_triage"
        return None

    def _llm_frame_candidate(self, *, text: str, previous_frame: str | None, known_facts: dict[str, Any]) -> dict[str, Any] | None:
        """LLM proposes a frame; deterministic transition rules still decide."""
        if not text.strip():
            return None
        try:
            system_prompt = (
                "Classify the latest Australian migration-law chat turn into exactly one case frame.\n"
                "Return ONLY valid JSON with keys: turn_intent, frame_id, confidence, reason.\n"
                "If previous_frame is visa_topic_triage and the latest turn gives concrete case facts, choose a concrete frame.\n"
                "If latest turn is a short fact update and previous_frame is concrete, choose previous_frame.\n"
            )
            user_prompt = json.dumps(
                {
                    "latest_turn": text,
                    "previous_frame": previous_frame,
                    "known_facts": known_facts,
                    "allowed_frames": sorted(self.frames.keys()),
                },
                ensure_ascii=False,
            )
            result = self.client.responses.create(
                model=self.model,
                input=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            )
            parsed = self._extract_json_object(result.output_text or "")
            if not isinstance(parsed, dict):
                return None
            frame_id = self._valid_frame_id(parsed.get("frame_id"))
            if not frame_id:
                return None
            parsed["frame_id"] = frame_id
            return parsed
        except Exception:
            return None

    def _valid_frame_id(self, value: Any) -> str | None:
        frame_id = str(value or "").strip()
        return frame_id if frame_id in self.frames else None

    def _extract_json_object(self, text: str) -> dict[str, Any] | None:
        text = (text or "").strip()
        if not text:
            return None
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            pass
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                parsed = json.loads(text[start : end + 1])
                return parsed if isinstance(parsed, dict) else None
            except Exception:
                return None
        return None

    def _has_concrete_case_signal(self, text: str) -> bool:
        q = (text or "").lower()
        concrete_terms = [
            "485", "500", "subclass", "student visa", "temporary graduate",
            "bachelor", "master", "masters", "phd", "degree", "diploma",
            "expired", "expires", "unlawful", "completion letter", "pte",
            "english test", "work hours", "work limit", "attendance", "school warning",
            "refused", "refusal", "cancel", "cancellation", "bridging", "condition",
            "学士", "本科", "硕士", "博士", "过期", "到期", "签证过期",
            "非法", "completion", "工作时间", "出勤", "学校", "拒签", "取消",
            "过桥签", "签证条件", "英语", "语言", "考试",
        ]
        return any(term in q for term in concrete_terms)

    def _is_short_fact_update(self, text: str) -> bool:
        q = (text or "").strip().lower()
        if not q:
            return False
        if len(q.split()) <= 12 and any(term in q for term in [
            "in australia", "outside australia", "onshore", "offshore", "yes", "no", "not yet", "not sure",
            "已经", "还没", "没有", "在澳洲", "在澳大利亚", "境内", "境外", "递交了", "没递交",
            "只有学校", "home affairs", "vevo",
        ]):
            return True
        return False

    # ------------------------------------------------------------------
    # Candidate routing
    # ------------------------------------------------------------------
    def _candidate_frames(self, *, lowered: str, known_facts: dict[str, Any], current_state: MatterState) -> list[tuple[str, float, str]]:
        out: list[tuple[str, float, str]] = []
        has_500 = self._has_student_500(lowered, known_facts)
        has_485 = self._has_485(lowered, known_facts)
        explicit_refusal = self._explicit_refusal_or_review(lowered)
        broad_visa = self._broad_visa_inquiry(lowered)

        if broad_visa:
            out.append(("visa_topic_triage", 0.94, "Broad visa inquiry without a concrete factual scenario."))

        if self._condition_query(lowered):
            out.append(("visa_condition_explainer", 0.88, "User asks about a visa condition."))

        if explicit_refusal:
            frame = "485_refusal_review" if has_485 else "500_refusal_review" if has_500 else "500_refusal_review"
            out.append((frame, 0.86, "Explicit refusal/review/deadline cue."))

        if has_500 and self._student_compliance_risk(lowered):
            out.append(("student_500_compliance_risk", 0.91, "Student 500 work, attendance, school warning, or compliance-risk scenario."))

        if has_500 and self._student_expiry_or_extension(lowered):
            out.append(("500_expiry_or_extension", 0.82, "Student visa expiry/extension/current-status scenario."))

        if has_485 and self._student_expired_485_status(lowered):
            out.append(("485_student_visa_expired_or_status_risk", 0.94, "485 question with expired/possibly expired Student visa or unlawful-status concern."))

        if has_485 and self._pte_or_english_timing(lowered):
            out.append(("485_english_test_or_pte_timing", 0.90, "485 question with PTE/English timing and visa expiry pressure."))

        if has_485 and self._age_qualification(lowered):
            out.append(("485_age_qualification_policy", 0.88, "485 age and qualification current-policy issue."))

        if has_485 and self._higher_ed_485(lowered):
            out.append(("485_post_higher_education", 0.80, "485 question with Bachelor/Masters/PhD or degree-level qualification."))

        if has_485:
            out.append(("485_general_triage", 0.65, "General 485/Temporary Graduate visa question."))

        if has_500:
            out.append(("student_visa_general_triage", 0.56, "General Student visa question."))

        active_frame = self._current_frame_id(current_state, known_facts)
        if active_frame and active_frame in self.frames and not self._clear_topic_shift(lowered, active_frame):
            out.append((active_frame, 0.97, "Continue existing active frame with full historical context; no clear topic shift was detected."))

        if not out:
            out.append(("other_visa_general", 0.42, "Fallback general visa frame."))

        # Deterministic validator: do not let refusal/review win without explicit cues.
        filtered: list[tuple[str, float, str]] = []
        for fid, score, why in out:
            if self.frames[fid].case_family == "refusal_review" and not explicit_refusal:
                continue
            filtered.append((fid, score, why))
        filtered = filtered or [("visa_topic_triage", 0.5, "Safe triage fallback after validation.")]
        filtered.sort(key=lambda item: item[1], reverse=True)
        return filtered

    def _rejected_candidate_debug(self, candidates: list[tuple[str, float, str]], *, selected: str, lowered: str) -> list[dict[str, Any]]:
        rejected: list[dict[str, Any]] = []
        if not self._explicit_refusal_or_review(lowered):
            for fid in ("500_refusal_review", "485_refusal_review"):
                if fid != selected:
                    rejected.append({
                        "frame_id": fid,
                        "score": 0.0,
                        "selected": False,
                        "rejected": True,
                        "rejection_reason": "No refusal/review/ART/decision-notice cue in the current turn.",
                    })
        return rejected

    # ------------------------------------------------------------------
    # Recommendation helpers
    # ------------------------------------------------------------------
    def _build_next_request(self, decision: CaseFrameDecision, known_facts: dict[str, Any], *, response_language: str) -> InteractionFactRequest | None:
        is_zh = response_language.lower().startswith("zh")
        for key in decision.askable_fact_keys:
            if self._fact_present(known_facts.get(key)):
                continue
            prompt = self.FACT_PROMPTS.get(key, {}).get("zh" if is_zh else "en") or decision.default_next_question or key.replace("_", " ")
            label = key.replace("_", " ")
            return InteractionFactRequest(
                fact_key=key,
                label=label,
                prompt=prompt,
                input_type="short_text",
                options=[],
                required=False,
                blocking=False,
                why_needed="This can make the recommendation more precise, but I can still give a provisional answer from current information.",
            )
        return None


    def _dynamic_next_question(self, definition: CaseFrameDefinition, known_facts: dict[str, Any], *, is_zh: bool) -> str | None:
        """Choose the next askable fact, skipping facts already known."""
        language = "zh" if is_zh else "en"
        for key in definition.askable_fact_keys:
            if self._fact_present(known_facts.get(key)):
                continue
            prompt = self.FACT_PROMPTS.get(key, {}).get(language)
            if prompt:
                return prompt
        return None

    def _partition_facts(self, facts: dict[str, Any], definition: CaseFrameDefinition) -> tuple[list[str], list[str]]:
        accepted, rejected = [], []
        valid = set(definition.valid_fact_keys) | {"issue_type", "visa_type", "operation_type", "active_case_frame_id", "case_family", "answer_preference", "answer_tier"}
        forbidden = set(definition.forbidden_fact_keys)
        for key, value in facts.items():
            if not self._fact_present(value):
                continue
            if key in forbidden:
                rejected.append(key)
            elif not definition.valid_fact_keys or key in valid:
                accepted.append(key)
        return sorted(set(accepted)), sorted(set(rejected))

    def _current_frame_id(self, state: MatterState, facts: dict[str, Any]) -> str | None:
        frame_id = facts.get("active_case_frame_id") or (state.carried_intake_facts or {}).get("active_case_frame_id")
        return str(frame_id) if frame_id else None

    def _normalize_answer_preference(self, answer_preference: str | None, question: str, original_question: str | None) -> str:
        value = (answer_preference or "answer_first").strip().lower()
        if value not in {"auto", "answer_first", "continue_intake", "final_recommendation"}:
            value = "answer_first"
        text = f"{question or ''}\n{original_question or ''}".lower()
        if any(term in text for term in ["current information", "with current info", "answer now", "final recommendation", "direct recommendation", "只有这些信息", "直接给建议", "现有信息", "有什么建议"]):
            value = "final_recommendation"
        return value

    # ------------------------------------------------------------------
    # Pattern helpers
    # ------------------------------------------------------------------
    def _looks_zh(self, text: str) -> bool:
        return bool(re.search(r"[\u3400-\u4dbf\u4e00-\u9fff]", text or ""))

    def _has_student_500(self, text: str, facts: dict[str, Any]) -> bool:
        return str(facts.get("visa_subclass") or "") == "500" or "subclass 500" in text or "student visa" in text or "学生签证" in text or "student 500" in text

    def _has_485(self, text: str, facts: dict[str, Any]) -> bool:
        return str(facts.get("visa_subclass") or "") == "485" or "485" in text or "temporary graduate" in text or "毕业生签证" in text

    def _explicit_refusal_or_review(self, text: str) -> bool:
        return bool(re.search(r"\b(refus(?:ed|al|e)|review|appeal|tribunal|art|deadline|decision notice|refusal notice)\b", text)) or any(term in text for term in ["拒签", "复审", "上诉", "tribunal", "art", "通知书", "决定信"])

    def _broad_visa_inquiry(self, text: str) -> bool:
        cleaned = re.sub(r"\s+", " ", text).strip()
        broad_terms = ["签证问题", "咨询签证", "签证咨询", "visa question", "ask about visa", "questions about visa", "immigration question"]
        return any(term in cleaned for term in broad_terms) and len(cleaned) <= 80 and not any(term in cleaned for term in ["485", "500", "refus", "cancel", "过期", "到期", "工作", "出勤", "pte"])

    def _student_compliance_risk(self, text: str) -> bool:
        return any(term in text for term in ["work limit", "work hours", "62 hour", "62小时", "62 小时", "attendance", "出勤", "school warning", "学校", "course progress", "工作时间"])

    def _student_expiry_or_extension(self, text: str) -> bool:
        return any(term in text for term in ["student visa expired", "student visa expires", "500 expired", "500 expires", "到期", "过期", "completion letter", "自动延长", "extend"])

    def _student_expired_485_status(self, text: str) -> bool:
        return self._has_485(text, {}) and any(term in text for term in ["expired", "expires", "unlawful", "过期", "到期", "unlaw", "completion letter", "自动延长"])

    def _pte_or_english_timing(self, text: str) -> bool:
        return self._has_485(text, {}) and any(term in text for term in ["pte", "english", "英语", "语言", "test", "考试"])

    def _age_qualification(self, text: str) -> bool:
        return self._has_485(text, {}) and (bool(re.search(r"\b(?:3[5-9]|4[0-9])\b", text)) or "age" in text or "年龄" in text) and any(term in text for term in ["master", "masters", "bachelor", "phd", "coursework", "degree", "学历"])

    def _higher_ed_485(self, text: str) -> bool:
        return self._has_485(text, {}) and any(term in text for term in ["bachelor", "master", "masters", "phd", "degree", "学士", "硕士", "博士"])

    def _condition_query(self, text: str) -> bool:
        return bool(re.search(r"\bcondition\s*\d{4}\b|\b\d{4}\s*condition\b", text)) or any(term in text for term in ["签证条件", "condition 8501", "condition 8105", "8501", "8105", "8503"])


    def _clear_topic_shift(self, text: str, active_frame_id: str) -> bool:
        """
        Return True only for clear topic shifts. Short fact updates must preserve
        the active frame.
        """
        q = (text or "").lower().strip()
        if not q:
            return False
        if active_frame_id.startswith("485") and any(term in q for term in ["student visa refusal", "拒签", "review", "appeal", "art", "tribunal", "复审", "上诉"]):
            return True
        if active_frame_id.startswith(("485", "500")) and any(term in q for term in ["bridging travel", "bvb", "bridging visa b", "leave australia", "come back", "离境", "回来", "过桥签旅行"]):
            return True
        if active_frame_id.startswith("500") and ("485" in q or "temporary graduate" in q or "毕业生签证" in q):
            return True
        if active_frame_id.startswith("485") and self._has_student_500(q, {}) and self._student_compliance_risk(q):
            return True
        if self._broad_visa_inquiry(q):
            return False
        return False

    def _fact_present(self, value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip()) and value.strip().lower() not in {"not_sure", "not sure", "unknown", "unsure", "n/a", "na"}
        if isinstance(value, (list, tuple, set, dict)):
            return bool(value)
        return True

    def _set_attr(self, obj: Any, key: str, value: Any) -> None:
        try:
            setattr(obj, key, value)
        except Exception:
            if isinstance(obj, dict):
                obj[key] = value
