from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.semantic_contracts import SemanticTurnAnalysis
from app.schemas.state import MatterState


class SemanticTurnService:
    """LLM form-filling semantic router.

    This service is the semantic authority for flexible user language. It asks the
    backend model to fill a strict JSON form, then normalizes common model output
    variants before Pydantic validation. Regex/keyword matching is intentionally
    not used for user intent classification here.
    """

    TASK_ALIASES = {
        "draft": "draft_user_statement",
        "draft_statement": "draft_user_statement",
        "draft_user_statement": "draft_user_statement",
        "draft_email": "draft_email_or_message",
        "email": "draft_email_or_message",
        "message": "draft_email_or_message",
        "checklist": "document_checklist",
        "document_checklist": "document_checklist",
        "documents": "document_checklist",
        "lawyer_brief": "lawyer_brief",
        "lawyer_summary": "lawyer_brief",
        "consultation_summary": "lawyer_brief",
        "case_summary": "lawyer_brief",
        "summary_for_lawyer": "lawyer_brief",
        "timeline": "timeline_plan",
        "timeline_plan": "timeline_plan",
        "action_plan": "status_action_plan",
        "status_action_plan": "status_action_plan",
        "next_step_plan": "status_action_plan",
        "booking": "booking_handoff",
        "booking_handoff": "booking_handoff",
        "none": "none",
        None: "none",
    }

    ACT_ALIASES = {
        "continue_previous_offer": "accept_previous_offer",
        "continue_next_step": "accept_previous_offer",
        "use_pending_offer": "accept_previous_offer",
        "draft": "draft_request",
        "draft_statement": "draft_request",
        "checklist": "checklist_request",
        "document_checklist": "checklist_request",
        "lawyer_brief": "lawyer_summary_request",
        "lawyer_summary": "lawyer_summary_request",
        "consultation_summary": "lawyer_summary_request",
        "timeline": "timeline_request",
        "action_plan": "timeline_request",
        "book": "booking_request",
        "booking": "booking_request",
    }

    RISK_KEY_ALIASES = {
        "deadline_sensitive": "deadline_sensitive",
        "possible_unlawful_status": "possible_unlawful_status",
        "unlawful_status": "possible_unlawful_status",
        "visa_expiry_or_status_problem": "visa_expiry_or_status_problem",
        "status_sensitive": "visa_expiry_or_status_problem",
        "refusal_or_review": "refusal_or_review",
        "review_related": "refusal_or_review",
        "cancellation_or_noicc": "cancellation_or_noicc",
        "cancellation_related": "cancellation_or_noicc",
        "detention_related": "detention_related",
        "character_related": "character_related",
        "character_issue": "character_related",
        "pic4020_or_integrity": "pic4020_or_integrity",
        "pic4020_issue": "pic4020_or_integrity",
        "requires_lawyer_handoff": "requires_lawyer_handoff",
        "lawyer_handoff": "requires_lawyer_handoff",
    }

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

        system_prompt = self._system_prompt()

        try:
            result = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            )
            parsed = self._extract_json_object(result.output_text or "")
            if not isinstance(parsed, dict):
                return self._fallback(raw_user_message=raw_user_message, response_language=response_language, reason="no_json")
            normalized = self._normalize_model_output(parsed, response_language=response_language)
            normalized["raw_model_output"] = parsed
            return self._coerce(normalized, raw_user_message=raw_user_message, response_language=response_language)
        except Exception as exc:
            return self._fallback(
                raw_user_message=raw_user_message,
                response_language=response_language,
                reason=f"semantic_llm_failed:{type(exc).__name__}",
            )

    def _system_prompt(self) -> str:
        return (
            "You are the semantic form-filling layer for an Australian immigration-law assistant.\n"
            "You do NOT answer the user. You only fill JSON.\n"
            "Interpret flexible English, Chinese, and mixed-language messages.\n"
            "Use pending_offer and recent history to resolve short replies.\n"
            "Only fill facts that the user explicitly stated, directly implied, provided via structured intake, or that are already confirmed in state.\n"
            "If a fact is not stated, do not invent it. Leave it out or mark it not_filled.\n"
            "Do not invent legal outcomes, exact deadlines, eligibility, or current policy.\n"
            "For risk flags, set true only when there is positive evidence.\n"
            "Return ONLY valid JSON. Prefer this exact shape:\n"
            "{\n"
            "  \"response_language\": \"en|zh\",\n"
            "  \"conversation_act\": \"legal_question|fact_update|answer_to_previous_question|accept_previous_offer|draft_request|checklist_request|lawyer_summary_request|timeline_request|booking_request|topic_switch|clarification_request|smalltalk|other\",\n"
            "  \"task_intent\": {\n"
            "    \"task_type\": \"none|draft_user_statement|draft_email_or_message|document_checklist|lawyer_brief|status_action_plan|timeline_plan|booking_handoff\",\n"
            "    \"uses_pending_offer\": false,\n"
            "    \"target_language\": null,\n"
            "    \"output_audience\": \"user|lawyer|home_affairs|school_provider|employer|unknown\",\n"
            "    \"requested_format\": \"plain_answer|draft_statement|email|checklist|timeline|summary|brief|unknown\",\n"
            "    \"task_constraints\": {}\n"
            "  },\n"
            "  \"case_routing\": {\n"
            "    \"frame_action\": \"continue_active_frame|switch_frame|create_new_frame|stay_triage|ask_clarifying_category\",\n"
            "    \"proposed_case_frame_id\": null,\n"
            "    \"issue_type\": null,\n"
            "    \"visa_type\": null,\n"
            "    \"operation_type\": null,\n"
            "    \"user_goal\": null,\n"
            "    \"topic_relation\": \"same_matter|topic_switch|unclear\",\n"
            "    \"confidence\": \"low|medium|high\",\n"
            "    \"rationale\": null\n"
            "  },\n"
            "  \"extracted_facts\": [\n"
            "    {\"fact_key\": \"example\", \"value\": null, \"status\": \"filled|not_filled|user_unsure|not_applicable|conflicting\", \"confidence\": \"low|medium|high\", \"explicitness\": \"explicit|directly_implied|not_stated|contradicted\", \"evidence_text\": null, \"evidence_source\": \"latest_user_turn|conversation_history|structured_intake|pending_offer|system_context\"}\n"
            "  ],\n"
            "  \"risk_signals\": {\"deadline_sensitive\": false, \"possible_unlawful_status\": false, \"visa_expiry_or_status_problem\": false, \"refusal_or_review\": false, \"cancellation_or_noicc\": false, \"detention_related\": false, \"character_related\": false, \"pic4020_or_integrity\": false, \"requires_lawyer_handoff\": false, \"evidence\": {}},\n"
            "  \"current_policy_need\": {\"requires_current_policy_check\": false, \"policy_area\": null, \"source_classes_required\": [], \"preferred_domains\": [], \"reason\": null},\n"
            "  \"pending_offer\": {\"action\": \"none|create|use_existing|clear\", \"offer_type\": \"none|draft_user_statement|document_checklist|lawyer_brief|status_action_plan|timeline_plan|booking_handoff\", \"label\": null, \"offer_id\": null, \"reason\": null},\n"
            "  \"should_contextualize_with_history\": true,\n"
            "  \"should_retrieve_legal_sources\": true,\n"
            "  \"should_handle_as_task\": false,\n"
            "  \"confidence\": \"low|medium|high\",\n"
            "  \"rationale\": null,\n"
            "  \"safety_notes\": []\n"
            "}\n"
            "If you accidentally use keys like filled_slots, high_risk_flags, or requested_service, the backend will normalize them, but prefer the exact shape above.\n"
        )

    def _normalize_model_output(self, parsed: dict[str, Any], *, response_language: str | None) -> dict[str, Any]:
        normalized: dict[str, Any] = dict(parsed)

        if response_language in {"en", "zh"}:
            normalized["response_language"] = response_language
        elif normalized.get("response_language") not in {"en", "zh"}:
            out_lang = (normalized.get("output_language") or normalized.get("language") or "").lower()
            normalized["response_language"] = "zh" if out_lang.startswith("zh") else "en"

        act = normalized.get("conversation_act") or normalized.get("intent") or normalized.get("turn_intent") or "legal_question"
        normalized["conversation_act"] = self.ACT_ALIASES.get(str(act), str(act))

        task_intent = normalized.get("task_intent")
        if not isinstance(task_intent, dict):
            task_intent = {}
        requested_service = (
            task_intent.get("task_type")
            or task_intent.get("requested_service")
            or task_intent.get("service")
            or normalized.get("requested_service")
        )
        task_type = self.TASK_ALIASES.get(str(requested_service) if requested_service is not None else None, "none")
        task_intent["task_type"] = task_type
        task_intent["uses_pending_offer"] = bool(task_intent.get("uses_pending_offer") or normalized.get("uses_pending_offer"))
        output_lang = task_intent.get("target_language") or task_intent.get("output_language") or normalized.get("output_language")
        if output_lang:
            task_intent["target_language"] = "zh" if str(output_lang).lower().startswith("zh") else "en"
        task_intent.setdefault("output_audience", self._normalize_audience(task_intent.get("audience") or task_intent.get("output_audience")))
        task_intent.setdefault("requested_format", self._format_from_task(task_type))
        task_intent.setdefault("task_constraints", {})
        normalized["task_intent"] = task_intent

        case_routing = normalized.get("case_routing")
        if not isinstance(case_routing, dict):
            case_routing = {}
        for src, dst in {
            "frame_id": "proposed_case_frame_id",
            "case_frame_id": "proposed_case_frame_id",
            "operation": "operation_type",
            "visa": "visa_type",
        }.items():
            if src in normalized and dst not in case_routing:
                case_routing[dst] = normalized.get(src)
            if src in case_routing and dst not in case_routing:
                case_routing[dst] = case_routing.get(src)
        if task_intent.get("operation_type") and not case_routing.get("operation_type"):
            case_routing["operation_type"] = task_intent.get("operation_type")
        if task_intent.get("topic") == "student_visa" and not case_routing.get("issue_type"):
            case_routing["issue_type"] = "student_visa"
        case_routing.setdefault("frame_action", "ask_clarifying_category")
        case_routing.setdefault("topic_relation", "unclear")
        case_routing.setdefault("confidence", normalized.get("confidence", "low"))
        normalized["case_routing"] = case_routing

        normalized["extracted_facts"] = self._normalize_facts(
            normalized.get("extracted_facts"),
            normalized.get("filled_slots"),
            case_routing,
        )
        normalized["risk_signals"] = self._normalize_risk_signals(
            normalized.get("risk_signals"),
            normalized.get("high_risk_flags"),
        )
        normalized["current_policy_need"] = self._normalize_current_policy_need(normalized.get("current_policy_need"))
        normalized["pending_offer"] = self._normalize_pending_offer(normalized.get("pending_offer"), task_type)

        normalized["should_handle_as_task"] = bool(
            normalized.get("should_handle_as_task")
            or task_intent.get("should_handle_as_task")
            or task_intent.get("uses_pending_offer")
            or task_type != "none"
            or normalized["conversation_act"] in {
                "accept_previous_offer",
                "draft_request",
                "checklist_request",
                "lawyer_summary_request",
                "timeline_request",
                "booking_request",
            }
        )
        normalized.setdefault("should_contextualize_with_history", True)
        normalized.setdefault("should_retrieve_legal_sources", not normalized["should_handle_as_task"])
        normalized.setdefault("confidence", "low")
        normalized.setdefault("safety_notes", [])
        return normalized

    def _normalize_facts(self, facts_value: Any, filled_slots: Any, case_routing: dict[str, Any]) -> list[dict[str, Any]]:
        facts: list[dict[str, Any]] = []

        if isinstance(facts_value, list):
            for item in facts_value:
                if isinstance(item, dict) and item.get("fact_key"):
                    clean = dict(item)
                    clean.setdefault("status", "filled" if clean.get("value") not in (None, "") else "not_filled")
                    clean.setdefault("confidence", "medium")
                    clean.setdefault("explicitness", "explicit")
                    clean.setdefault("evidence_source", "latest_user_turn")
                    facts.append(clean)
        elif isinstance(facts_value, dict):
            filled_slots = {**facts_value, **(filled_slots if isinstance(filled_slots, dict) else {})}

        if isinstance(filled_slots, dict):
            for key, raw in filled_slots.items():
                if not key:
                    continue
                if isinstance(raw, dict):
                    value = raw.get("value")
                    status = raw.get("status") or ("filled" if value not in (None, "") else "not_filled")
                    confidence = raw.get("confidence") or "medium"
                    evidence = raw.get("evidence") or raw.get("evidence_text")
                else:
                    value = raw
                    status = "filled" if value not in (None, "") else "not_filled"
                    confidence = "medium"
                    evidence = None
                facts.append({
                    "fact_key": str(key),
                    "value": value,
                    "status": status,
                    "confidence": confidence,
                    "explicitness": "explicit" if status == "filled" else "not_stated",
                    "evidence_text": evidence,
                    "evidence_source": "latest_user_turn",
                })

        for key in ("issue_type", "operation_type", "visa_type"):
            if case_routing.get(key):
                facts.append({
                    "fact_key": key,
                    "value": case_routing[key],
                    "status": "filled",
                    "confidence": case_routing.get("confidence", "medium"),
                    "explicitness": "directly_implied",
                    "evidence_text": case_routing.get("rationale"),
                    "evidence_source": "system_context",
                })

        deduped: dict[str, dict[str, Any]] = {}
        for item in facts:
            key = str(item.get("fact_key") or "").strip()
            if not key:
                continue
            if key not in deduped or item.get("status") == "filled":
                deduped[key] = item
        return list(deduped.values())

    def _normalize_risk_signals(self, risk_value: Any, high_risk_flags: Any) -> dict[str, Any]:
        risk: dict[str, Any] = {}
        for source in (risk_value, high_risk_flags):
            if isinstance(source, dict):
                for key, value in source.items():
                    mapped = self.RISK_KEY_ALIASES.get(str(key), str(key))
                    risk[mapped] = bool(value)
        risk.setdefault("evidence", {})
        return risk

    def _normalize_current_policy_need(self, value: Any) -> dict[str, Any]:
        if not isinstance(value, dict):
            return {
                "requires_current_policy_check": False,
                "policy_area": None,
                "source_classes_required": [],
                "preferred_domains": [],
                "reason": None,
            }
        value = dict(value)
        value.setdefault("requires_current_policy_check", False)
        value.setdefault("policy_area", None)
        value.setdefault("source_classes_required", [])
        value.setdefault("preferred_domains", [])
        value.setdefault("reason", None)
        return value

    def _normalize_pending_offer(self, value: Any, task_type: str) -> dict[str, Any]:
        if not isinstance(value, dict):
            value = {}
        action = value.get("action") or "none"
        offer_type = self.TASK_ALIASES.get(str(value.get("offer_type") or task_type), "none")
        return {
            "action": action if action in {"none", "create", "use_existing", "clear"} else "none",
            "offer_type": offer_type,
            "label": value.get("label"),
            "offer_id": value.get("offer_id"),
            "reason": value.get("reason"),
        }

    def _normalize_audience(self, value: Any) -> str:
        value_s = str(value or "user").lower()
        if value_s in {"lawyer", "migration_agent", "agent", "solicitor"}:
            return "lawyer"
        if value_s in {"home_affairs", "department", "immi"}:
            return "home_affairs"
        if value_s in {"school", "provider", "university"}:
            return "school_provider"
        if value_s in {"employer", "workplace"}:
            return "employer"
        if value_s in {"unknown"}:
            return "unknown"
        return "user"

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

    def _coerce(self, parsed: dict[str, Any], *, raw_user_message: str, response_language: str | None) -> SemanticTurnAnalysis:
        try:
            analysis = SemanticTurnAnalysis(**parsed)
        except Exception as exc:
            return self._fallback(
                raw_user_message=raw_user_message,
                response_language=response_language,
                reason=f"schema_validation_failed:{type(exc).__name__}",
            )
        if response_language in {"en", "zh"}:
            analysis.response_language = response_language  # type: ignore[assignment]
        return analysis

    def _fallback(self, *, raw_user_message: str, response_language: str | None, reason: str) -> SemanticTurnAnalysis:
        lang = "zh" if str(response_language or "").lower().startswith("zh") else "en"
        return SemanticTurnAnalysis(
            response_language=lang,  # type: ignore[arg-type]
            conversation_act="legal_question",
            should_contextualize_with_history=True,
            should_retrieve_legal_sources=True,
            should_handle_as_task=False,
            confidence="low",
            rationale=reason,
            safety_notes=["Semantic analysis fallback used; downstream legal routing should remain conservative."],
        )

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
