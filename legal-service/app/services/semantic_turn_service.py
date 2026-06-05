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

    This service replaces regex/keyword semantic authority. It asks the backend
    model to fill a strict JSON form from flexible user language. Backend code
    still validates the form and controls legal state.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv("SEMANTIC_TURN_MODEL", os.getenv("FRAME_ROUTER_MODEL", os.getenv("GENERAL_QA_MODEL", "gpt-5.4-mini")))
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

        system_prompt = (
            "You are the semantic form-filling layer for an Australian immigration-law assistant.\n"
            "You do NOT answer the user. You only fill a JSON form.\n"
            "Interpret flexible English, Chinese, or mixed-language user messages.\n"
            "Use conversation history and pending_offer to resolve short replies such as 'yes', 'continue', or Chinese equivalents.\n"
            "Only fill facts positively stated by the user, directly implied by the user, present in structured intake, or already present in confirmed state.\n"
            "If a fact is not stated, leave its value null and mark status='not_filled'. Do not infer negative facts from absence.\n"
            "Do not invent legal outcomes, exact deadlines, visa eligibility, or current policy.\n"
            "For high-risk flags, set a flag true only when there is positive evidence.\n"
            "If the user asks the assistant to perform a service action, classify conversation_act and task_intent accordingly.\n"
            "If the user accepts a pending offer, set conversation_act='accept_previous_offer', task_intent.uses_pending_offer=true, and should_handle_as_task=true.\n"
            "If the user asks for a draft, checklist, lawyer summary, or timeline/action plan, set should_handle_as_task=true.\n"
            "Return ONLY valid JSON matching the SemanticTurnAnalysis schema. No markdown.\n"
        )

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
            parsed["raw_model_output"] = parsed.copy()
            return self._coerce(parsed, raw_user_message=raw_user_message, response_language=response_language)
        except Exception as exc:
            return self._fallback(raw_user_message=raw_user_message, response_language=response_language, reason=f"semantic_llm_failed:{type(exc).__name__}")

    def _coerce(self, parsed: dict[str, Any], *, raw_user_message: str, response_language: str | None) -> SemanticTurnAnalysis:
        # Do not trust arbitrary JSON blindly. Pydantic will enforce enums and types.
        try:
            analysis = SemanticTurnAnalysis(**parsed)
        except Exception:
            return self._fallback(raw_user_message=raw_user_message, response_language=response_language, reason="schema_validation_failed")

        # If the model did not set the response language, use the caller's hint.
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
