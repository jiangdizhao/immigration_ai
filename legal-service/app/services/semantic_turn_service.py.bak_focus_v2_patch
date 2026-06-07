from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas.semantic_contracts import SemanticTurnAnalysis
from app.schemas.state import MatterState


class SemanticTurnService:
    """Robust LLM form-filling semantic router.

    This service is the semantic authority for flexible user language. It does
    not classify raw user text with regex or keyword lists. The LLM fills a JSON
    form; this service then normalizes schema-near-miss outputs and preserves
    structured task intent even if some non-critical field fails validation.
    """

    TASK_ACTS = {
        "accept_previous_offer",
        "draft_request",
        "checklist_request",
        "lawyer_summary_request",
        "timeline_request",
        "booking_request",
    }

    TASK_ALIASES: dict[Any, str] = {
        "draft": "draft_user_statement",
        "draft_statement": "draft_user_statement",
        "draft_user_statement": "draft_user_statement",
        "statement": "draft_user_statement",
        "student_statement": "draft_user_statement",
        "explanation": "draft_user_statement",
        "explanation_letter": "draft_user_statement",
        "study_plan": "draft_user_statement",
        "draft_email": "draft_email_or_message",
        "email": "draft_email_or_message",
        "message": "draft_email_or_message",
        "draft_message": "draft_email_or_message",
        "checklist": "document_checklist",
        "document_checklist": "document_checklist",
        "documents": "document_checklist",
        "document_list": "document_checklist",
        "lawyer_brief": "lawyer_brief",
        "lawyer_summary": "lawyer_brief",
        "summary_for_lawyer": "lawyer_brief",
        "consultation_summary": "lawyer_brief",
        "case_summary": "lawyer_brief",
        "lawyer_case_summary": "lawyer_brief",
        "timeline": "timeline_plan",
        "timeline_plan": "timeline_plan",
        "time_plan": "timeline_plan",
        "action_plan": "status_action_plan",
        "status_action_plan": "status_action_plan",
        "next_step_plan": "status_action_plan",
        "next_steps": "status_action_plan",
        "booking": "booking_handoff",
        "book": "booking_handoff",
        "booking_handoff": "booking_handoff",
        "none": "none",
        "null": "none",
        "": "none",
        None: "none",
    }

    TASK_TO_ACT = {
        "draft_user_statement": "draft_request",
        "draft_email_or_message": "draft_request",
        "document_checklist": "checklist_request",
        "lawyer_brief": "lawyer_summary_request",
        "status_action_plan": "timeline_request",
        "timeline_plan": "timeline_request",
        "booking_handoff": "booking_request",
    }

    ACT_ALIASES = {
        "small_talk": "smalltalk",
        "chat": "smalltalk",
        "general_question": "legal_question",
        "question": "legal_question",
        "visa_question": "legal_question",
        "legal": "legal_question",
        "legal_question": "legal_question",
        "fact": "fact_update",
        "fact_update": "fact_update",
        "answer": "answer_to_previous_question",
        "answer_to_question": "answer_to_previous_question",
        "answer_to_previous_question": "answer_to_previous_question",
        "continue_previous_offer": "accept_previous_offer",
        "continue_next_step": "accept_previous_offer",
        "use_pending_offer": "accept_previous_offer",
        "accept_offer": "accept_previous_offer",
        "accept_previous_offer": "accept_previous_offer",
        "draft": "draft_request",
        "draft_statement": "draft_request",
        "draft_request": "draft_request",
        "write_request": "draft_request",
        "checklist": "checklist_request",
        "document_checklist": "checklist_request",
        "checklist_request": "checklist_request",
        "lawyer_brief": "lawyer_summary_request",
        "lawyer_summary": "lawyer_summary_request",
        "summary_for_lawyer": "lawyer_summary_request",
        "consultation_summary": "lawyer_summary_request",
        "case_summary": "lawyer_summary_request",
        "lawyer_summary_request": "lawyer_summary_request",
        "timeline": "timeline_request",
        "action_plan": "timeline_request",
        "timeline_request": "timeline_request",
        "booking": "booking_request",
        "book": "booking_request",
        "booking_request": "booking_request",
        "topic_switch": "topic_switch",
        "switch_topic": "topic_switch",
        "clarification": "clarification_request",
        "clarification_request": "clarification_request",
        "other": "other",
        None: "legal_question",
    }

    CONFIDENCE_ALIASES = {
        "high": "high",
        "strong": "high",
        "certain": "high",
        "confident": "high",
        "medium": "medium",
        "med": "medium",
        "moderate": "medium",
        "mid": "medium",
        "low": "low",
        "weak": "low",
        "uncertain": "low",
        "unknown": "low",
        "": "low",
        None: "low",
    }

    FACT_STATUS_ALIASES = {
        "filled": "filled",
        "known": "filled",
        "provided": "filled",
        "available": "filled",
        "present": "filled",
        "yes": "filled",
        "true": "filled",
        "not_filled": "not_filled",
        "missing": "not_filled",
        "unknown": "not_filled",
        "not stated": "not_filled",
        "not_stated": "not_filled",
        "not provided": "not_filled",
        "not_provided": "not_filled",
        "none": "not_filled",
        "null": "not_filled",
        "unsure": "user_unsure",
        "not sure": "user_unsure",
        "not_sure": "user_unsure",
        "user_unsure": "user_unsure",
        "uncertain": "user_unsure",
        "not_applicable": "not_applicable",
        "not applicable": "not_applicable",
        "n/a": "not_applicable",
        "na": "not_applicable",
        "irrelevant": "not_applicable",
        "conflicting": "conflicting",
        "contradictory": "conflicting",
        "conflict": "conflicting",
        "": "not_filled",
        None: "not_filled",
    }

    EXPLICITNESS_ALIASES = {
        "explicit": "explicit",
        "direct": "explicit",
        "stated": "explicit",
        "directly_implied": "directly_implied",
        "directly implied": "directly_implied",
        "implied": "directly_implied",
        "not_stated": "not_stated",
        "not stated": "not_stated",
        "missing": "not_stated",
        "unknown": "not_stated",
        "contradicted": "contradicted",
        "contradiction": "contradicted",
        "conflicting": "contradicted",
        "": "not_stated",
        None: "not_stated",
    }

    EVIDENCE_SOURCE_ALIASES = {
        "latest_user_turn": "latest_user_turn",
        "latest user turn": "latest_user_turn",
        "latest_message": "latest_user_turn",
        "user_message": "latest_user_turn",
        "user": "latest_user_turn",
        "conversation_history": "conversation_history",
        "history": "conversation_history",
        "prior_context": "conversation_history",
        "context": "conversation_history",
        "structured_intake": "structured_intake",
        "intake": "structured_intake",
        "guided_intake": "structured_intake",
        "pending_offer": "pending_offer",
        "offer": "pending_offer",
        "system_context": "system_context",
        "state": "system_context",
        "system": "system_context",
        "": None,
        None: None,
    }

    AUDIENCE_ALIASES = {
        "user": "user",
        "client": "user",
        "applicant": "user",
        "lawyer": "lawyer",
        "solicitor": "lawyer",
        "migration_agent": "lawyer",
        "agent": "lawyer",
        "registered_migration_agent": "lawyer",
        "rma": "lawyer",
        "home_affairs": "home_affairs",
        "department": "home_affairs",
        "immi": "home_affairs",
        "dha": "home_affairs",
        "school": "school_provider",
        "provider": "school_provider",
        "university": "school_provider",
        "education_provider": "school_provider",
        "employer": "employer",
        "workplace": "employer",
        "unknown": "unknown",
        "": "user",
        None: "user",
    }

    FORMAT_ALIASES = {
        "plain_answer": "plain_answer",
        "answer": "plain_answer",
        "draft": "draft",
        "draft_statement": "draft_statement",
        "statement": "draft_statement",
        "email": "email",
        "message": "email",
        "checklist": "checklist",
        "document_checklist": "checklist",
        "timeline": "timeline",
        "plan": "timeline",
        "summary": "summary",
        "case_summary": "summary",
        "brief": "brief",
        "lawyer_brief": "brief",
        "unknown": "unknown",
        "": "unknown",
        None: "unknown",
    }

    FRAME_ACTION_ALIASES = {
        "continue_active_frame": "continue_active_frame",
        "continue": "continue_active_frame",
        "same_frame": "continue_active_frame",
        "same": "continue_active_frame",
        "switch_frame": "switch_frame",
        "switch": "switch_frame",
        "topic_switch": "switch_frame",
        "create_new_frame": "create_new_frame",
        "new_frame": "create_new_frame",
        "create": "create_new_frame",
        "new": "create_new_frame",
        "stay_triage": "stay_triage",
        "triage": "stay_triage",
        "ask_clarifying_category": "ask_clarifying_category",
        "clarify": "ask_clarifying_category",
        "ask": "ask_clarifying_category",
        "": "ask_clarifying_category",
        None: "ask_clarifying_category",
    }

    TOPIC_RELATION_ALIASES = {
        "same_matter": "same_matter",
        "same": "same_matter",
        "same_topic": "same_matter",
        "continue": "same_matter",
        "related": "same_matter",
        "topic_switch": "topic_switch",
        "switch": "topic_switch",
        "new_topic": "topic_switch",
        "different": "topic_switch",
        "unclear": "unclear",
        "unknown": "unclear",
        "": "unclear",
        None: "unclear",
    }

    PENDING_ACTION_ALIASES = {
        "none": "none",
        "create": "create",
        "offer": "create",
        "use_existing": "use_existing",
        "use": "use_existing",
        "accept": "use_existing",
        "accepted": "use_existing",
        "clear": "clear",
        "remove": "clear",
        "": "none",
        None: "none",
    }

    RISK_KEY_ALIASES = {
        "deadline_sensitive": "deadline_sensitive",
        "time_sensitive": "deadline_sensitive",
        "urgent_deadline": "deadline_sensitive",
        "possible_unlawful_status": "possible_unlawful_status",
        "unlawful_status": "possible_unlawful_status",
        "unlawful": "possible_unlawful_status",
        "visa_expiry_or_status_problem": "visa_expiry_or_status_problem",
        "status_sensitive": "visa_expiry_or_status_problem",
        "expired_visa": "visa_expiry_or_status_problem",
        "visa_expired": "visa_expiry_or_status_problem",
        "refusal_or_review": "refusal_or_review",
        "review_related": "refusal_or_review",
        "refusal_related": "refusal_or_review",
        "cancellation_or_noicc": "cancellation_or_noicc",
        "cancellation_related": "cancellation_or_noicc",
        "noicc": "cancellation_or_noicc",
        "detention_related": "detention_related",
        "character_related": "character_related",
        "character_issue": "character_related",
        "pic4020_or_integrity": "pic4020_or_integrity",
        "pic4020_issue": "pic4020_or_integrity",
        "health_or_public_interest": "health_or_public_interest",
        "family_or_minor_welfare": "family_or_minor_welfare",
        "requires_lawyer_handoff": "requires_lawyer_handoff",
        "lawyer_handoff": "requires_lawyer_handoff",
        "escalate": "requires_lawyer_handoff",
    }

    RISK_FIELDS = (
        "deadline_sensitive",
        "possible_unlawful_status",
        "visa_expiry_or_status_problem",
        "refusal_or_review",
        "cancellation_or_noicc",
        "detention_related",
        "character_related",
        "pic4020_or_integrity",
        "health_or_public_interest",
        "family_or_minor_welfare",
        "requires_lawyer_handoff",
    )

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv(
            "SEMANTIC_TURN_MODEL",
            os.getenv("FRAME_ROUTER_MODEL", os.getenv("GENERAL_QA_MODEL", "gpt-5.4-mini")),
        )
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    def analyze(
        self,
        *,
        raw_user_message: str,
        internal_question_en: str,
        current_state: MatterState,
        pending_offer: dict[str, Any] | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
        allowed_case_frames: list[str] | None = None,
        allowed_operations: list[str] | None = None,
        response_language: str | None = None,
    ) -> SemanticTurnAnalysis:
        payload = {
            "latest_user_message_raw": raw_user_message,
            "latest_user_message_internal_en": internal_question_en,
            "response_language_hint": response_language,
            "pending_offer": pending_offer or None,
            "current_state": {
                "conversation_state": current_state.conversation_state,
                "issue_type": current_state.issue_type,
                "operation_type": current_state.operation_type,
                "visa_type": current_state.visa_type,
                "carried_intake_facts": current_state.carried_intake_facts,
                "risk_flags": current_state.risk_flags.model_dump(),
                "case_hypothesis": current_state.case_hypothesis.model_dump(),
                "interaction_plan": current_state.interaction_plan.model_dump(),
            },
            "recent_conversation_history": conversation_history or [],
            "allowed_case_frames": allowed_case_frames or [],
            "allowed_operations": allowed_operations or [],
        }

        try:
            result = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": self._system_prompt()},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            )
            raw_text = result.output_text or ""
            parsed = self._extract_json_object(raw_text)
            if not isinstance(parsed, dict):
                return self._fallback(
                    raw_user_message=raw_user_message,
                    response_language=response_language,
                    reason="no_json",
                    raw_debug={"raw_text": raw_text[:2000]},
                )

            normalized = self._normalize_model_output(
                parsed,
                response_language=response_language,
                pending_offer=pending_offer,
            )
            normalized["raw_model_output"] = {
                "raw_model_output": parsed,
                "normalized_candidate": self._debug_safe(normalized),
            }
            return self._coerce(
                normalized,
                raw_user_message=raw_user_message,
                response_language=response_language,
                raw_candidate=parsed,
            )
        except Exception as exc:
            return self._fallback(
                raw_user_message=raw_user_message,
                response_language=response_language,
                reason=f"semantic_llm_failed:{type(exc).__name__}",
                raw_debug={"exception": str(exc)[:1000]},
            )

    def _system_prompt(self) -> str:
        return (
            "You are the semantic form-filling layer for an Australian immigration-law assistant.\n"
            "You do NOT answer the user. You only fill JSON.\n"
            "Interpret flexible English, Chinese, and mixed-language messages.\n"
            "Return exactly the requested JSON shape. Do not use markdown.\n"
            "Use pending_offer and recent history to resolve short replies and service requests.\n"
            "If the user asks for a draft, checklist, lawyer brief, case summary, timeline, or booking, mark should_handle_as_task=true.\n"
            "Only fill facts explicitly stated by the user, directly implied by the user, present in structured intake, or already confirmed in state.\n"
            "If a fact is not stated, omit it or set status='not_filled'; never invent missing facts.\n"
            "For risk flags, set true only when supported by positive evidence.\n"
            "Do not decide legal outcomes, exact deadlines, visa eligibility, or current policy.\n"
            "JSON shape:\n"
            "{\n"
            "  \"response_language\": \"en|zh\",\n"
            "  \"conversation_act\": \"smalltalk|legal_question|fact_update|answer_to_previous_question|accept_previous_offer|draft_request|checklist_request|lawyer_summary_request|timeline_request|booking_request|topic_switch|clarification_request|other\",\n"
            "  \"task_intent\": {\"task_type\": \"none|draft_user_statement|draft_email_or_message|document_checklist|lawyer_brief|status_action_plan|timeline_plan|booking_handoff\", \"uses_pending_offer\": false, \"pending_offer_id\": null, \"target_language\": null, \"output_audience\": \"user|lawyer|home_affairs|school_provider|employer|unknown\", \"requested_format\": \"plain_answer|draft_statement|email|checklist|timeline|summary|brief|unknown\", \"task_constraints\": {}},\n"
            "  \"case_routing\": {\"frame_action\": \"stay_triage|continue_active_frame|switch_frame|create_new_frame|ask_clarifying_category\", \"proposed_case_frame_id\": null, \"issue_type\": null, \"visa_type\": null, \"operation_type\": null, \"user_goal\": null, \"topic_relation\": \"same_matter|topic_switch|unclear\", \"confidence\": \"low|medium|high\", \"rationale\": null},\n"
            "  \"extracted_facts\": [{\"fact_key\": \"example\", \"value\": null, \"status\": \"filled|not_filled|user_unsure|not_applicable|conflicting\", \"confidence\": \"low|medium|high\", \"explicitness\": \"explicit|directly_implied|not_stated|contradicted\", \"evidence_text\": null, \"evidence_source\": \"latest_user_turn|conversation_history|structured_intake|pending_offer|system_context\", \"not_filled_reason\": null}],\n"
            "  \"risk_signals\": {\"deadline_sensitive\": false, \"possible_unlawful_status\": false, \"visa_expiry_or_status_problem\": false, \"refusal_or_review\": false, \"cancellation_or_noicc\": false, \"detention_related\": false, \"character_related\": false, \"pic4020_or_integrity\": false, \"health_or_public_interest\": false, \"family_or_minor_welfare\": false, \"requires_lawyer_handoff\": false, \"evidence\": {}},\n"
            "  \"current_policy_need\": {\"requires_current_policy_check\": false, \"policy_area\": null, \"source_classes_required\": [], \"preferred_domains\": [], \"reason\": null},\n"
            "  \"pending_offer\": {\"action\": \"none|create|use_existing|clear\", \"offer_type\": \"none|draft_user_statement|draft_email_or_message|document_checklist|lawyer_brief|status_action_plan|timeline_plan|booking_handoff\", \"label\": null, \"offer_id\": null, \"reason\": null},\n"
            "  \"should_contextualize_with_history\": true,\n"
            "  \"should_retrieve_legal_sources\": true,\n"
            "  \"should_handle_as_task\": false,\n"
            "  \"confidence\": \"low|medium|high\",\n"
            "  \"rationale\": null,\n"
            "  \"safety_notes\": []\n"
            "}\n"
            "For '请帮我整理一份律师要看的案情摘要' or similar, use conversation_act='lawyer_summary_request', task_type='lawyer_brief', output_audience='lawyer', requested_format='brief', should_handle_as_task=true.\n"
        )

    # ------------------------------------------------------------------
    # Normalization
    # ------------------------------------------------------------------
    def _normalize_model_output(
        self,
        parsed: dict[str, Any],
        *,
        response_language: str | None,
        pending_offer: dict[str, Any] | None,
    ) -> dict[str, Any]:
        normalized: dict[str, Any] = dict(parsed)

        normalized["response_language"] = self._normalize_language(
            response_language or normalized.get("response_language") or normalized.get("output_language") or normalized.get("language")
        )

        task_intent = self._normalize_task_intent(normalized.get("task_intent"), normalized, pending_offer)
        normalized["task_intent"] = task_intent

        act = normalized.get("conversation_act") or normalized.get("intent") or normalized.get("turn_intent")
        act_norm = self._normalize_conversation_act(act)
        if task_intent["task_type"] != "none" and act_norm == "legal_question":
            act_norm = self.TASK_TO_ACT.get(task_intent["task_type"], act_norm)
        if task_intent.get("uses_pending_offer") and act_norm == "legal_question":
            act_norm = "accept_previous_offer"
        normalized["conversation_act"] = act_norm

        normalized["case_routing"] = self._normalize_case_routing(normalized.get("case_routing"), normalized, task_intent)
        normalized["extracted_facts"] = self._normalize_facts(
            normalized.get("extracted_facts"),
            normalized.get("filled_slots"),
            normalized["case_routing"],
        )
        normalized["risk_signals"] = self._normalize_risk_signals(
            normalized.get("risk_signals"),
            normalized.get("high_risk_flags"),
        )
        normalized["current_policy_need"] = self._normalize_current_policy_need(normalized.get("current_policy_need"))
        normalized["pending_offer"] = self._normalize_pending_offer(normalized.get("pending_offer"), task_intent["task_type"])

        should_task = bool(
            normalized.get("should_handle_as_task")
            or task_intent.get("should_handle_as_task")
            or task_intent.get("uses_pending_offer")
            or task_intent["task_type"] != "none"
            or act_norm in self.TASK_ACTS
        )
        normalized["should_handle_as_task"] = should_task
        normalized["should_contextualize_with_history"] = self._boolish(normalized.get("should_contextualize_with_history"), True)
        normalized["should_retrieve_legal_sources"] = self._boolish(normalized.get("should_retrieve_legal_sources"), not should_task)
        normalized["confidence"] = self._normalize_confidence(normalized.get("confidence"))
        normalized["rationale"] = self._str_or_none(normalized.get("rationale"))
        normalized["safety_notes"] = self._as_str_list(normalized.get("safety_notes"))

        # Remove common old-schema fields so they cannot confuse Pydantic/debug consumers.
        for key in ("filled_slots", "high_risk_flags", "requested_service", "output_language", "language", "intent", "turn_intent"):
            normalized.pop(key, None)
        return normalized

    def _normalize_task_intent(self, value: Any, top: dict[str, Any], pending_offer: dict[str, Any] | None) -> dict[str, Any]:
        task_intent = dict(value) if isinstance(value, dict) else {}
        requested = (
            task_intent.get("task_type")
            or task_intent.get("requested_service")
            or task_intent.get("service")
            or task_intent.get("requested_task")
            or top.get("requested_service")
            or top.get("task_type")
        )
        uses_pending = self._boolish(task_intent.get("uses_pending_offer") or top.get("uses_pending_offer"), False)
        if uses_pending and (requested in (None, "", "none")) and isinstance(pending_offer, dict):
            requested = pending_offer.get("offer_type")
        task_type = self._normalize_task_type(requested)
        return {
            "task_type": task_type,
            "uses_pending_offer": uses_pending,
            "pending_offer_id": self._str_or_none(task_intent.get("pending_offer_id") or task_intent.get("offer_id")),
            "target_language": self._normalize_optional_language(task_intent.get("target_language") or task_intent.get("output_language") or top.get("output_language")),
            "output_audience": self._normalize_audience(task_intent.get("output_audience") or task_intent.get("audience")),
            "requested_format": self._normalize_format(task_intent.get("requested_format") or task_intent.get("format") or self._format_from_task(task_type)),
            "task_constraints": task_intent.get("task_constraints") if isinstance(task_intent.get("task_constraints"), dict) else {},
            "should_handle_as_task": self._boolish(task_intent.get("should_handle_as_task"), False),
        }

    def _normalize_case_routing(self, value: Any, top: dict[str, Any], task_intent: dict[str, Any]) -> dict[str, Any]:
        case_routing = dict(value) if isinstance(value, dict) else {}
        for src, dst in {
            "frame_id": "proposed_case_frame_id",
            "case_frame_id": "proposed_case_frame_id",
            "operation": "operation_type",
            "visa": "visa_type",
        }.items():
            if src in top and not case_routing.get(dst):
                case_routing[dst] = top.get(src)
            if src in case_routing and not case_routing.get(dst):
                case_routing[dst] = case_routing.get(src)
        if task_intent.get("operation_type") and not case_routing.get("operation_type"):
            case_routing["operation_type"] = task_intent.get("operation_type")
        if task_intent.get("topic") == "student_visa" and not case_routing.get("issue_type"):
            case_routing["issue_type"] = "student_visa"
        issue_type = self._canonical_issue_type(case_routing.get("issue_type"))
        visa_type = self._canonical_visa_type(case_routing.get("visa_type"))
        operation_type = self._canonical_operation_type(case_routing.get("operation_type"))
        return {
            "frame_action": self._normalize_frame_action(case_routing.get("frame_action")),
            "proposed_case_frame_id": self._str_or_none(case_routing.get("proposed_case_frame_id")),
            "issue_type": issue_type,
            "visa_type": visa_type,
            "operation_type": operation_type,
            "user_goal": self._str_or_none(case_routing.get("user_goal")),
            "topic_relation": self._normalize_topic_relation(case_routing.get("topic_relation")),
            "confidence": self._normalize_confidence(case_routing.get("confidence") or top.get("confidence")),
            "rationale": self._str_or_none(case_routing.get("rationale")),
        }

    def _normalize_facts(self, facts_value: Any, filled_slots: Any, case_routing: dict[str, Any]) -> list[dict[str, Any]]:
        facts: list[dict[str, Any]] = []
        if isinstance(facts_value, dict):
            filled_slots = {**facts_value, **(filled_slots if isinstance(filled_slots, dict) else {})}
        elif isinstance(facts_value, list):
            for item in facts_value:
                if isinstance(item, dict) and item.get("fact_key"):
                    facts.append(self._normalize_fact_item(item))

        if isinstance(filled_slots, dict):
            for key, raw in filled_slots.items():
                if not key:
                    continue
                if isinstance(raw, dict):
                    item = dict(raw)
                    item.setdefault("fact_key", str(key))
                else:
                    item = {"fact_key": str(key), "value": raw}
                facts.append(self._normalize_fact_item(item))

        for key in ("issue_type", "operation_type", "visa_type"):
            if case_routing.get(key):
                facts.append(self._normalize_fact_item({
                    "fact_key": key,
                    "value": case_routing[key],
                    "status": "filled",
                    "confidence": case_routing.get("confidence", "medium"),
                    "explicitness": "directly_implied",
                    "evidence_text": case_routing.get("rationale"),
                    "evidence_source": "system_context",
                }))

        deduped: dict[str, dict[str, Any]] = {}
        for item in facts:
            key = str(item.get("fact_key") or "").strip()
            if not key:
                continue
            if key not in deduped or item.get("status") == "filled":
                deduped[key] = item
        return list(deduped.values())

    def _normalize_fact_item(self, item: dict[str, Any]) -> dict[str, Any]:
        fact_key = str(item.get("fact_key") or item.get("key") or "").strip()
        value = item.get("value")
        if fact_key == "issue_type":
            value = self._canonical_issue_type(value) or value
        elif fact_key == "visa_type":
            value = self._canonical_visa_type(value) or value
        elif fact_key == "operation_type":
            value = self._canonical_operation_type(value) or value
        status_raw = item.get("status")
        if status_raw in (None, ""):
            status_raw = "filled" if value not in (None, "") else "not_filled"
        status = self._normalize_fact_status(status_raw)
        return {
            "fact_key": fact_key,
            "value": value,
            "status": status,
            "confidence": self._normalize_confidence(item.get("confidence")),
            "explicitness": self._normalize_explicitness(item.get("explicitness")),
            "evidence_text": self._str_or_none(item.get("evidence_text") or item.get("evidence")),
            "evidence_source": self._normalize_evidence_source(item.get("evidence_source") or item.get("source")),
            "not_filled_reason": self._str_or_none(item.get("not_filled_reason") or item.get("reason")),
        }

    def _normalize_risk_signals(self, risk_value: Any, high_risk_flags: Any) -> dict[str, Any]:
        risk: dict[str, Any] = {key: False for key in self.RISK_FIELDS}
        evidence: dict[str, str] = {}
        for source in (risk_value, high_risk_flags):
            if isinstance(source, dict):
                if isinstance(source.get("evidence"), dict):
                    evidence.update({str(k): str(v) for k, v in source["evidence"].items()})
                for key, value in source.items():
                    if key == "evidence":
                        continue
                    mapped = self.RISK_KEY_ALIASES.get(str(key), str(key))
                    if mapped in risk:
                        risk[mapped] = self._boolish(value, False)
        risk["evidence"] = evidence
        return risk

    def _normalize_current_policy_need(self, value: Any) -> dict[str, Any]:
        value = dict(value) if isinstance(value, dict) else {}
        return {
            "requires_current_policy_check": self._boolish(value.get("requires_current_policy_check"), False),
            "policy_area": self._str_or_none(value.get("policy_area")),
            "source_classes_required": self._as_str_list(value.get("source_classes_required")),
            "preferred_domains": self._as_str_list(value.get("preferred_domains")),
            "reason": self._str_or_none(value.get("reason")),
        }

    def _normalize_pending_offer(self, value: Any, task_type: str) -> dict[str, Any]:
        value = dict(value) if isinstance(value, dict) else {}
        return {
            "action": self._normalize_pending_action(value.get("action")),
            "offer_type": self._normalize_task_type(value.get("offer_type") or (task_type if task_type != "none" else "none")),
            "label": self._str_or_none(value.get("label")),
            "offer_id": self._str_or_none(value.get("offer_id")),
            "reason": self._str_or_none(value.get("reason")),
        }

    # ------------------------------------------------------------------
    # Coercion and fallback
    # ------------------------------------------------------------------
    def _coerce(
        self,
        candidate: dict[str, Any],
        *,
        raw_user_message: str,
        response_language: str | None,
        raw_candidate: dict[str, Any] | None = None,
    ) -> SemanticTurnAnalysis:
        try:
            analysis = SemanticTurnAnalysis(**candidate)
        except ValidationError as exc:
            repaired = self._repair_candidate(candidate, exc)
            try:
                analysis = SemanticTurnAnalysis(**repaired)
            except ValidationError as exc2:
                return self._fallback_from_candidate(
                    candidate=repaired,
                    raw_user_message=raw_user_message,
                    response_language=response_language,
                    reason=f"schema_validation_failed_after_repair:{type(exc2).__name__}",
                    validation_error=str(exc2)[:3000],
                    raw_candidate=raw_candidate,
                )
        if response_language in {"en", "zh"}:
            analysis.response_language = response_language  # type: ignore[assignment]
        return analysis

    def _repair_candidate(self, candidate: dict[str, Any], exc: ValidationError) -> dict[str, Any]:
        # The normalizer should already repair almost everything. Re-run it through
        # a conservative round that drops malformed fact rows and re-normalizes enums.
        repaired = dict(candidate)
        repaired["conversation_act"] = self._normalize_conversation_act(repaired.get("conversation_act"))
        repaired["confidence"] = self._normalize_confidence(repaired.get("confidence"))
        repaired["response_language"] = self._normalize_language(repaired.get("response_language"))
        repaired["task_intent"] = self._normalize_task_intent(repaired.get("task_intent"), repaired, None)
        repaired["case_routing"] = self._normalize_case_routing(repaired.get("case_routing"), repaired, repaired["task_intent"])
        repaired["extracted_facts"] = [
            self._normalize_fact_item(item)
            for item in (repaired.get("extracted_facts") or [])
            if isinstance(item, dict) and (item.get("fact_key") or item.get("key"))
        ]
        repaired["risk_signals"] = self._normalize_risk_signals(repaired.get("risk_signals"), None)
        repaired["current_policy_need"] = self._normalize_current_policy_need(repaired.get("current_policy_need"))
        repaired["pending_offer"] = self._normalize_pending_offer(repaired.get("pending_offer"), repaired["task_intent"]["task_type"])
        repaired["should_contextualize_with_history"] = self._boolish(repaired.get("should_contextualize_with_history"), True)
        repaired["should_retrieve_legal_sources"] = self._boolish(repaired.get("should_retrieve_legal_sources"), repaired["task_intent"]["task_type"] == "none")
        repaired["should_handle_as_task"] = self._boolish(
            repaired.get("should_handle_as_task"),
            repaired["task_intent"]["task_type"] != "none" or repaired["conversation_act"] in self.TASK_ACTS,
        )
        debug = dict(repaired.get("raw_model_output") or {})
        debug["first_validation_error"] = str(exc)[:3000]
        debug["repair_attempted"] = True
        repaired["raw_model_output"] = debug
        return repaired

    def _fallback_from_candidate(
        self,
        *,
        candidate: dict[str, Any],
        raw_user_message: str,
        response_language: str | None,
        reason: str,
        validation_error: str,
        raw_candidate: dict[str, Any] | None,
    ) -> SemanticTurnAnalysis:
        task_intent = self._normalize_task_intent(candidate.get("task_intent"), candidate, None)
        act = self._normalize_conversation_act(candidate.get("conversation_act"))
        if task_intent["task_type"] != "none" and act == "legal_question":
            act = self.TASK_TO_ACT.get(task_intent["task_type"], act)
        should_task = bool(task_intent["task_type"] != "none" or act in self.TASK_ACTS or task_intent.get("uses_pending_offer"))

        if should_task:
            return SemanticTurnAnalysis(
                response_language=self._normalize_language(response_language),  # type: ignore[arg-type]
                conversation_act=act,  # type: ignore[arg-type]
                task_intent={
                    "task_type": task_intent["task_type"],
                    "uses_pending_offer": bool(task_intent.get("uses_pending_offer")),
                    "pending_offer_id": task_intent.get("pending_offer_id"),
                    "target_language": task_intent.get("target_language"),
                    "output_audience": task_intent.get("output_audience", "user"),
                    "requested_format": task_intent.get("requested_format", "unknown"),
                    "task_constraints": task_intent.get("task_constraints", {}),
                },
                should_contextualize_with_history=True,
                should_retrieve_legal_sources=False,
                should_handle_as_task=True,
                confidence="low",
                rationale=reason,
                safety_notes=[
                    "Semantic validation failed, but structured task intent was preserved.",
                    validation_error[:1000],
                ],
                raw_model_output={
                    "raw_model_output": raw_candidate or {},
                    "normalized_candidate": self._debug_safe(candidate),
                    "validation_error": validation_error,
                    "fallback_mode": "task_preserved",
                },
            )

        return self._fallback(
            raw_user_message=raw_user_message,
            response_language=response_language,
            reason=reason,
            raw_debug={
                "raw_model_output": raw_candidate or {},
                "normalized_candidate": self._debug_safe(candidate),
                "validation_error": validation_error,
                "fallback_mode": "legal_question",
            },
        )

    def _fallback(
        self,
        *,
        raw_user_message: str,
        response_language: str | None,
        reason: str,
        raw_debug: dict[str, Any] | None = None,
    ) -> SemanticTurnAnalysis:
        return SemanticTurnAnalysis(
            response_language=self._normalize_language(response_language),  # type: ignore[arg-type]
            conversation_act="legal_question",
            should_contextualize_with_history=True,
            should_retrieve_legal_sources=True,
            should_handle_as_task=False,
            confidence="low",
            rationale=reason,
            safety_notes=["Semantic analysis fallback used; downstream legal routing should remain conservative."],
            raw_model_output=raw_debug or {},
        )

    # ------------------------------------------------------------------
    # Scalar normalization helpers
    # ------------------------------------------------------------------
    def _canonical_issue_type(self, value: Any) -> str | None:
        value_s = str(value or "").strip().lower().replace("-", "_")
        if not value_s:
            return None
        if "student" in value_s or "500" in value_s:
            return "student_visa"
        if "485" in value_s or "temporary_graduate" in value_s or "temporary graduate" in value_s:
            return "temporary_graduate_visa"
        if "bridging" in value_s or value_s in {"bva", "bvb", "bvc", "bve"}:
            return "bridging_visa"
        if "refusal" in value_s or "review" in value_s:
            return "visa_refusal"
        if "cancel" in value_s or "noicc" in value_s:
            return "visa_cancellation"
        return str(value).strip()

    def _canonical_visa_type(self, value: Any) -> str | None:
        value_s = str(value or "").strip().lower().replace("-", "_")
        if not value_s:
            return None
        if value_s in {"500", "subclass_500"} or "student" in value_s:
            return "student"
        if value_s in {"485", "subclass_485"} or "temporary_graduate" in value_s or "temporary graduate" in value_s:
            return "temporary_graduate"
        if value_s in {"010", "020", "030", "050", "bva", "bvb", "bvc", "bve"} or "bridging" in value_s:
            return "bridging"
        if "partner" in value_s:
            return "partner"
        if "visitor" in value_s or value_s == "600":
            return "visitor"
        return str(value).strip()

    def _canonical_operation_type(self, value: Any) -> str | None:
        value_s = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
        if not value_s:
            return None
        if value_s in {"status_risk", "expiry_status_risk", "student_visa_expiry_status_risk"}:
            return "500_expiry_or_extension"
        if "student" in value_s and ("expiry" in value_s or "expired" in value_s or "status" in value_s):
            return "500_expiry_or_extension"
        if value_s in {"lawyer_brief", "lawyer_summary", "case_summary"}:
            return "lawyer_brief"
        if value_s in {"document_checklist", "checklist"}:
            return "document_checklist"
        if value_s in {"485_eligibility", "485_eligibility_overview"}:
            return "485_eligibility_overview"
        return str(value).strip()

    def _normalize_language(self, value: Any) -> str:
        value_s = str(value or "").lower()
        return "zh" if value_s.startswith("zh") else "en"

    def _normalize_optional_language(self, value: Any) -> str | None:
        if value in (None, ""):
            return None
        return self._normalize_language(value)

    def _normalize_conversation_act(self, value: Any) -> str:
        return self.ACT_ALIASES.get(str(value).strip().lower() if value is not None else None, "legal_question")

    def _normalize_task_type(self, value: Any) -> str:
        return self.TASK_ALIASES.get(str(value).strip().lower() if value is not None else None, "none")

    def _normalize_confidence(self, value: Any) -> str:
        return self.CONFIDENCE_ALIASES.get(str(value).strip().lower() if value is not None else None, "low")

    def _normalize_fact_status(self, value: Any) -> str:
        return self.FACT_STATUS_ALIASES.get(str(value).strip().lower() if value is not None else None, "not_filled")

    def _normalize_explicitness(self, value: Any) -> str:
        return self.EXPLICITNESS_ALIASES.get(str(value).strip().lower() if value is not None else None, "not_stated")

    def _normalize_evidence_source(self, value: Any) -> str | None:
        return self.EVIDENCE_SOURCE_ALIASES.get(str(value).strip().lower() if value is not None else None, None)

    def _normalize_audience(self, value: Any) -> str:
        return self.AUDIENCE_ALIASES.get(str(value).strip().lower() if value is not None else None, "user")

    def _normalize_format(self, value: Any) -> str:
        return self.FORMAT_ALIASES.get(str(value).strip().lower() if value is not None else None, "unknown")

    def _normalize_frame_action(self, value: Any) -> str:
        return self.FRAME_ACTION_ALIASES.get(str(value).strip().lower() if value is not None else None, "ask_clarifying_category")

    def _normalize_topic_relation(self, value: Any) -> str:
        return self.TOPIC_RELATION_ALIASES.get(str(value).strip().lower() if value is not None else None, "unclear")

    def _normalize_pending_action(self, value: Any) -> str:
        return self.PENDING_ACTION_ALIASES.get(str(value).strip().lower() if value is not None else None, "none")

    def _format_from_task(self, task_type: str) -> str:
        return {
            "draft_user_statement": "draft_statement",
            "draft_email_or_message": "email",
            "document_checklist": "checklist",
            "lawyer_brief": "brief",
            "status_action_plan": "timeline",
            "timeline_plan": "timeline",
            "booking_handoff": "plain_answer",
        }.get(task_type, "unknown")

    def _boolish(self, value: Any, default: bool = False) -> bool:
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        value_s = str(value).strip().lower()
        if value_s in {"true", "yes", "y", "1", "needed", "required", "required_yes"}:
            return True
        if value_s in {"false", "no", "n", "0", "none", "not_needed", "not required", ""}:
            return False
        return default

    def _as_str_list(self, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value] if value.strip() else []
        if isinstance(value, list):
            return [str(item) for item in value if str(item).strip()]
        if isinstance(value, (tuple, set)):
            return [str(item) for item in value if str(item).strip()]
        return [str(value)] if str(value).strip() else []

    def _str_or_none(self, value: Any) -> str | None:
        if value is None:
            return None
        value_s = str(value).strip()
        return value_s or None

    def _debug_safe(self, value: Any) -> Any:
        """Return a JSON-serializable deep copy for debug payloads.

        Important: never return the original dict/list object. The caller may
        insert this value back into the same object as raw_model_output. Returning
        the original object can create a circular reference, which FastAPI/Pydantic
        cannot serialize in QueryResponse.
        """
        try:
            return json.loads(json.dumps(value, ensure_ascii=False, default=str))
        except Exception:
            return str(value)

    def _extract_json_object(self, text: str) -> dict[str, Any] | None:
        text = (text or "").strip()
        if not text:
            return None
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:].strip()
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
