from __future__ import annotations

from dataclasses import asdict, dataclass, field
import json
import os
from typing import Any

from openai import OpenAI

from app.core.config import get_settings


@dataclass(slots=True)
class RestrictedTurnAnalysis:
    turn_intent: str = "broad_visa_inquiry"
    frame_action: str = "ask_clarifying_category"
    frame_id: str = "visa_topic_triage"
    confidence: str = "low"
    positive_evidence: list[str] = field(default_factory=list)
    negative_evidence: list[str] = field(default_factory=list)
    extracted_facts: dict[str, Any] = field(default_factory=dict)
    fact_confidence: dict[str, str] = field(default_factory=dict)
    positive_issue_flags: dict[str, bool] = field(default_factory=dict)
    reason: str = ""
    raw_model_output: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class RestrictedLLMTurnAnalysisService:
    """
    Restricted LLM semantic interpreter.

    The LLM may understand flexible language, but it cannot mutate legal state.
    It must choose from a fixed frame registry and return strict JSON. The
    deterministic CaseFrameService validates transitions, allowed facts, and
    forbidden facts afterwards.
    """

    VALID_INTENTS = {
        "greeting",
        "broad_visa_inquiry",
        "concrete_case_scenario",
        "fact_update",
        "answer_to_previous_question",
        "recommendation_request",
        "topic_switch",
        "booking_request",
        "document_update",
        "other",
    }

    VALID_ACTIONS = {
        "stay_triage",
        "continue_active_frame",
        "switch_frame",
        "create_new_frame",
        "ask_clarifying_category",
    }

    VALID_CONFIDENCE = {"low", "medium", "high"}

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv("FRAME_ROUTER_MODEL", os.getenv("GENERAL_QA_MODEL", "gpt-5.4-mini"))
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
        previous_frame_id: str | None,
        known_facts: dict[str, Any],
        frame_registry: dict[str, dict[str, Any]],
    ) -> RestrictedTurnAnalysis:
        allowed_frames = sorted(frame_registry.keys())
        if not allowed_frames:
            return RestrictedTurnAnalysis(reason="empty_frame_registry")

        system_prompt = (
            "You are a restricted semantic router for an Australian immigration assistant.\n"
            "Your task is to understand the user's latest message and propose one case frame.\n"
            "You do NOT answer the user. You do NOT decide legal outcomes.\n"
            "You MUST choose frame_id from the allowed frame registry only.\n"
            "Return ONLY valid JSON with exactly these keys:\n"
            "{\n"
            '  "turn_intent": "greeting|broad_visa_inquiry|concrete_case_scenario|fact_update|answer_to_previous_question|recommendation_request|topic_switch|booking_request|document_update|other",\n'
            '  "frame_action": "stay_triage|continue_active_frame|switch_frame|create_new_frame|ask_clarifying_category",\n'
            '  "frame_id": string,\n'
            '  "confidence": "low|medium|high",\n'
            '  "positive_evidence": string[],\n'
            '  "negative_evidence": string[],\n'
            '  "extracted_facts": object,\n'
            '  "fact_confidence": object,\n'
            '  "positive_issue_flags": {\n'
            '    "refusal_or_review": boolean,\n'
            '    "cancellation": boolean,\n'
            '    "student_compliance": boolean,\n'
            '    "visa_expiry_or_status": boolean,\n'
            '    "temporary_graduate_485": boolean,\n'
            '    "student_500": boolean,\n'
            '    "bridging_travel": boolean,\n'
            '    "visa_condition": boolean\n'
            "  },\n"
            '  "reason": string\n'
            "}\n\n"
            "Critical rules:\n"
            "1. Classify primarily from raw_user_message. internal_question_en is only a translation aid and may contain meta text.\n"
            "2. Do NOT treat absent categories as positive evidence. For example, text like 'has not provided refusal/cancellation/review details' means refusal_or_review=false and cancellation=false.\n"
            "3. Only set refusal_or_review=true if the user positively says they were refused, wants review/appeal/ART, has a refusal notice, or asks about a review deadline.\n"
            "4. If previous_frame_id is visa_topic_triage and the latest user message gives concrete case facts, choose the concrete frame and frame_action=switch_frame.\n"
            "5. If previous_frame_id is a concrete frame and the latest user message only supplies a missing fact, choose previous_frame_id and frame_action=continue_active_frame.\n"
            "6. extracted_facts must contain only facts explicitly stated by the user or directly implied by a literal number/date/subclass. Do not include absent facts.\n"
            "7. If the message is just a broad visa question with no concrete facts, choose visa_topic_triage.\n"
        )

        user_prompt = json.dumps(
            {
                "raw_user_message": raw_user_message,
                "internal_question_en": internal_question_en,
                "previous_frame_id": previous_frame_id,
                "known_facts": known_facts,
                "allowed_frames": allowed_frames,
                "frame_registry": frame_registry,
            },
            ensure_ascii=False,
        )

        try:
            result = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            parsed = self._extract_json_object(result.output_text or "")
        except Exception as exc:
            return self._safe_fallback(
                previous_frame_id=previous_frame_id,
                allowed_frames=allowed_frames,
                reason=f"llm_turn_analysis_failed:{type(exc).__name__}",
            )

        if not isinstance(parsed, dict):
            return self._safe_fallback(
                previous_frame_id=previous_frame_id,
                allowed_frames=allowed_frames,
                reason="llm_turn_analysis_returned_no_json",
            )

        return self._coerce(parsed, allowed_frames=allowed_frames, previous_frame_id=previous_frame_id)

    def _coerce(self, parsed: dict[str, Any], *, allowed_frames: list[str], previous_frame_id: str | None) -> RestrictedTurnAnalysis:
        frame_id = str(parsed.get("frame_id") or "").strip()
        if frame_id not in allowed_frames:
            frame_id = previous_frame_id if previous_frame_id in allowed_frames else "visa_topic_triage"

        turn_intent = str(parsed.get("turn_intent") or "other").strip()
        if turn_intent not in self.VALID_INTENTS:
            turn_intent = "other"

        frame_action = str(parsed.get("frame_action") or "ask_clarifying_category").strip()
        if frame_action not in self.VALID_ACTIONS:
            frame_action = "ask_clarifying_category"

        confidence = str(parsed.get("confidence") or "low").strip().lower()
        if confidence not in self.VALID_CONFIDENCE:
            confidence = "low"

        extracted_facts = parsed.get("extracted_facts") if isinstance(parsed.get("extracted_facts"), dict) else {}
        fact_confidence = parsed.get("fact_confidence") if isinstance(parsed.get("fact_confidence"), dict) else {}
        positive_flags = parsed.get("positive_issue_flags") if isinstance(parsed.get("positive_issue_flags"), dict) else {}
        normalized_flags = {
            "refusal_or_review": bool(positive_flags.get("refusal_or_review", False)),
            "cancellation": bool(positive_flags.get("cancellation", False)),
            "student_compliance": bool(positive_flags.get("student_compliance", False)),
            "visa_expiry_or_status": bool(positive_flags.get("visa_expiry_or_status", False)),
            "temporary_graduate_485": bool(positive_flags.get("temporary_graduate_485", False)),
            "student_500": bool(positive_flags.get("student_500", False)),
            "bridging_travel": bool(positive_flags.get("bridging_travel", False)),
            "visa_condition": bool(positive_flags.get("visa_condition", False)),
        }

        return RestrictedTurnAnalysis(
            turn_intent=turn_intent,
            frame_action=frame_action,
            frame_id=frame_id,
            confidence=confidence,
            positive_evidence=[str(x) for x in (parsed.get("positive_evidence") or []) if str(x).strip()],
            negative_evidence=[str(x) for x in (parsed.get("negative_evidence") or []) if str(x).strip()],
            extracted_facts={str(k): v for k, v in extracted_facts.items() if v not in (None, "")},
            fact_confidence={str(k): str(v) for k, v in fact_confidence.items() if str(k).strip()},
            positive_issue_flags=normalized_flags,
            reason=str(parsed.get("reason") or ""),
            raw_model_output=parsed,
        )

    def _safe_fallback(self, *, previous_frame_id: str | None, allowed_frames: list[str], reason: str) -> RestrictedTurnAnalysis:
        if previous_frame_id and previous_frame_id in allowed_frames and previous_frame_id != "visa_topic_triage":
            return RestrictedTurnAnalysis(
                turn_intent="fact_update",
                frame_action="continue_active_frame",
                frame_id=previous_frame_id,
                confidence="low",
                reason=reason + "; preserving previous concrete frame",
            )
        return RestrictedTurnAnalysis(
            turn_intent="broad_visa_inquiry",
            frame_action="ask_clarifying_category",
            frame_id="visa_topic_triage" if "visa_topic_triage" in allowed_frames else allowed_frames[0],
            confidence="low",
            reason=reason + "; safe triage fallback",
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
