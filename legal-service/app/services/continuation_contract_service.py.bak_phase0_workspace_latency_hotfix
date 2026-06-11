from __future__ import annotations

import json
import os
import re
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryResponse
from app.schemas.semantic_contracts import SemanticTurnAnalysis
from app.schemas.state import MatterState


class ContinuationContractService:
    """General continuation / previous-commitment fulfillment service.

    This service deliberately avoids an expanding task taxonomy.  It asks one
    bounded question: is the latest user turn asking us to fulfill something the
    assistant already offered or committed to in the recent conversation?  If so,
    it generates that requested output directly from the recent history and the
    current MatterState, without going through the normal RAG/legal-QA pipeline.

    Design rules:
    - No scenario-specific service types.
    - No legal semantic routing by regex; regex is only a cheap prefilter for
      short acceptance/continuation turns.
    - The LLM receives the prior assistant turn and the latest user turn, then
      creates a free-text requested_action contract.
    - The output generator completes that requested_action and must not restart
      generic visa-status triage or import unrelated visa frames.
    """

    ACCEPTANCE_HINTS = (
        "好的",
        "好",
        "可以",
        "继续",
        "帮我",
        "整理",
        "按你说",
        "按上面",
        "三种情况",
        "分析",
        "列出来",
        "做一个",
        "yes",
        "ok",
        "okay",
        "please",
        "go ahead",
        "do it",
        "continue",
        "as you said",
        "as above",
        "make it",
        "prepare it",
        "summarise",
        "summarize",
        "checklist",
        "analyse",
        "analyze",
    )

    OFFER_HINTS = (
        "我可以",
        "如果你愿意",
        "下一步",
        "继续",
        "帮你",
        "整理",
        "清单",
        "分析",
        "三种情况",
        "I can",
        "if you want",
        "next",
        "prepare",
        "summarise",
        "summarize",
        "checklist",
        "analyse",
        "analyze",
    )

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv(
            "CONTINUATION_CONTRACT_MODEL",
            os.getenv("TASK_FULFILLMENT_MODEL", os.getenv("REASONING_MODEL", "gpt-5.4-mini")),
        )
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    def try_fulfill(
        self,
        *,
        raw_user_message: str,
        internal_question_en: str,
        response_language: str,
        current_state: MatterState,
        semantic_turn: SemanticTurnAnalysis,
        matter_id: str | None,
    ) -> QueryResponse | None:
        history = [turn.model_dump() for turn in current_state.conversation_history[-8:]]
        previous_assistant = self._last_assistant_text(history)
        if not previous_assistant:
            return None

        if not self._looks_like_continuation_candidate(
            raw_user_message=raw_user_message,
            semantic_turn=semantic_turn,
            previous_assistant=previous_assistant,
        ):
            return None

        contract = self._build_contract(
            raw_user_message=raw_user_message,
            internal_question_en=internal_question_en,
            previous_assistant=previous_assistant,
            history=history,
            current_state=current_state,
            semantic_turn=semantic_turn,
            response_language=response_language,
        )
        if not contract.get("should_fulfill_immediately"):
            return None

        answer = self._generate_output(
            contract=contract,
            raw_user_message=raw_user_message,
            previous_assistant=previous_assistant,
            history=history,
            current_state=current_state,
            response_language=response_language,
        )
        if not answer:
            return None

        is_zh = response_language == "zh" or self._contains_chinese(raw_user_message)
        return QueryResponse(
            matter_id=matter_id,
            answer=answer,
            response_language="zh" if is_zh else "en",
            confidence=self._confidence(contract.get("confidence")),
            user_display_mode="direct_short",
            issue_type=current_state.issue_type,
            missing_facts=[],
            follow_up_questions=[],
            citations=[],
            compact_sources=[],
            escalate=False,
            next_action="answer",
            conversation_state=current_state.conversation_state,
            case_hypothesis=current_state.case_hypothesis,
            fact_slot_states=current_state.fact_slot_states,
            interaction_plan=current_state.interaction_plan,
            legal_reasoning_trace={},
            retrieval_debug={
                "continuation_contract": contract,
                "handled_by": "ContinuationContractService",
                "normal_legal_pipeline_skipped": True,
                "semantic_turn_analysis": semantic_turn.model_dump(),
            },
        )

    def _looks_like_continuation_candidate(
        self,
        *,
        raw_user_message: str,
        semantic_turn: SemanticTurnAnalysis,
        previous_assistant: str,
    ) -> bool:
        if semantic_turn.conversation_act == "accept_previous_offer":
            return True
        if semantic_turn.task_intent.uses_pending_offer:
            return True
        if semantic_turn.pending_offer.action == "use_existing":
            return True

        text = (raw_user_message or "").strip()
        if not text:
            return False
        lowered = text.lower()
        previous_lower = previous_assistant.lower()
        has_user_hint = any(hint.lower() in lowered for hint in self.ACCEPTANCE_HINTS)
        has_offer_hint = any(hint.lower() in previous_lower for hint in self.OFFER_HINTS)
        if has_user_hint and has_offer_hint:
            return True
        # Very short confirmations after an offer should be checked by the LLM.
        return len(text) <= 32 and has_offer_hint and bool(re.search(r"^(好|好的|可以|行|yes|ok|okay|please)\b", lowered, flags=re.I))

    def _build_contract(
        self,
        *,
        raw_user_message: str,
        internal_question_en: str,
        previous_assistant: str,
        history: list[dict[str, Any]],
        current_state: MatterState,
        semantic_turn: SemanticTurnAnalysis,
        response_language: str,
    ) -> dict[str, Any]:
        payload = {
            "latest_user_message_raw": raw_user_message,
            "latest_user_message_internal_en": internal_question_en,
            "previous_assistant_message": previous_assistant[-3500:],
            "recent_history": history,
            "current_state": {
                "conversation_state": current_state.conversation_state,
                "issue_type": current_state.issue_type,
                "operation_type": current_state.operation_type,
                "visa_type": current_state.visa_type,
                "carried_intake_facts": current_state.carried_intake_facts,
                "case_hypothesis": current_state.case_hypothesis.model_dump(),
            },
            "semantic_turn_analysis": semantic_turn.model_dump(),
            "response_language": response_language,
        }
        system_prompt = "\n".join(
            [
                "You are a continuation-contract judge for an immigration-law website assistant.",
                "Do not answer the user. Decide whether the latest user turn asks the assistant to fulfill a previous assistant offer or commitment.",
                "Do not use a fixed service taxonomy. Express the requested action in free text.",
                "Return JSON only with this shape:",
                "{\"should_fulfill_immediately\": boolean, \"turn_kind\": \"fulfill_previous_commitment|continue_previous_answer|answer_new_question|update_facts|topic_switch|clarify\", \"requested_action\": string|null, \"target_scope\": string|null, \"must_use_context\": [string], \"must_not_do\": [string], \"response_style\": string|null, \"confidence\": \"low|medium|high\", \"reason\": string|null}",
                "Set should_fulfill_immediately=true only when the latest user message clearly asks to continue/fulfill something already offered or promised by the assistant.",
                "For short replies like '好的', '帮我整理', '按你说的三种情况分析', resolve them against the previous assistant message.",
                "When fulfilling a previous commitment, include must_not_do constraints that prevent switching topics or importing unrelated visa categories.",
            ]
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
            if isinstance(parsed, dict):
                return self._normalize_contract(parsed)
        except Exception as exc:
            return self._fallback_contract(raw_user_message, previous_assistant, reason=f"contract_llm_failed:{type(exc).__name__}")
        return self._fallback_contract(raw_user_message, previous_assistant, reason="contract_llm_no_json")

    def _generate_output(
        self,
        *,
        contract: dict[str, Any],
        raw_user_message: str,
        previous_assistant: str,
        history: list[dict[str, Any]],
        current_state: MatterState,
        response_language: str,
    ) -> str | None:
        is_zh = response_language == "zh" or self._contains_chinese(raw_user_message)
        language_rule = "Write in Simplified Chinese." if is_zh else "Write in English."
        payload = {
            "requested_action": contract.get("requested_action"),
            "target_scope": contract.get("target_scope"),
            "must_use_context": contract.get("must_use_context") or [],
            "must_not_do": contract.get("must_not_do") or [],
            "response_style": contract.get("response_style"),
            "latest_user_message": raw_user_message,
            "previous_assistant_message": previous_assistant[-3500:],
            "recent_history": history,
            "current_state": {
                "issue_type": current_state.issue_type,
                "operation_type": current_state.operation_type,
                "visa_type": current_state.visa_type,
                "known_facts": current_state.carried_intake_facts,
            },
        }
        system_prompt = "\n".join(
            [
                "You are a professional Australian migration-law intake assistant.",
                "Complete the requested output now. Do not restart generic legal Q&A.",
                "Use the latest user message, the previous assistant commitment, recent history, and known facts.",
                "Do not introduce unrelated visa categories, document lists, or warnings that are outside the target scope.",
                "If the requested action refers to items/situations mentioned by the previous assistant, structure the answer around those exact items/situations.",
                "Preserve legal uncertainty. Do not invent exact deadlines, provisions, risk percentages, guaranteed outcomes, or unsupported eligibility conclusions.",
                "Do not say 'I can do this next' or offer to complete the same output later; the output itself is the answer.",
                "Use natural, non-template wording. Use headings or bullets only when they help the requested output.",
                "Return only the final answer text.",
                language_rule,
            ]
        )
        try:
            result = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            )
            text = (result.output_text or "").strip()
            return self._sanitize(text) if text else None
        except Exception:
            return None

    def _fallback_contract(self, raw_user_message: str, previous_assistant: str, *, reason: str) -> dict[str, Any]:
        return {
            "should_fulfill_immediately": True,
            "turn_kind": "fulfill_previous_commitment",
            "requested_action": (
                "Fulfill the previous assistant offer or commitment that the user just accepted. "
                f"Latest user message: {raw_user_message}"
            ),
            "target_scope": None,
            "must_use_context": [previous_assistant[-1200:]],
            "must_not_do": [
                "Do not restart generic visa-status triage.",
                "Do not import unrelated visa subclasses or document lists.",
                "Do not offer to complete the same task later; complete it now.",
            ],
            "response_style": "complete the requested continuation directly",
            "confidence": "low",
            "reason": reason,
        }

    def _normalize_contract(self, value: dict[str, Any]) -> dict[str, Any]:
        allowed = {
            "fulfill_previous_commitment",
            "continue_previous_answer",
            "answer_new_question",
            "update_facts",
            "topic_switch",
            "clarify",
        }
        turn_kind = str(value.get("turn_kind") or "").strip()
        if turn_kind not in allowed:
            turn_kind = "fulfill_previous_commitment" if value.get("should_fulfill_immediately") else "answer_new_question"
        should = bool(value.get("should_fulfill_immediately")) and turn_kind == "fulfill_previous_commitment"
        return {
            "should_fulfill_immediately": should,
            "turn_kind": turn_kind,
            "requested_action": self._str_or_none(value.get("requested_action")),
            "target_scope": self._str_or_none(value.get("target_scope")),
            "must_use_context": self._as_str_list(value.get("must_use_context"))[:8],
            "must_not_do": self._as_str_list(value.get("must_not_do"))[:12],
            "response_style": self._str_or_none(value.get("response_style")),
            "confidence": self._confidence(value.get("confidence")),
            "reason": self._str_or_none(value.get("reason")),
        }

    def _last_assistant_text(self, history: list[dict[str, Any]]) -> str | None:
        for turn in reversed(history or []):
            if turn.get("role") == "assistant":
                content = str(turn.get("content") or "").strip()
                if content:
                    return content
        return None

    def _extract_json_object(self, text: str) -> dict[str, Any] | None:
        text = (text or "").strip()
        if not text:
            return None
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass
        match = re.search(r"\{.*\}", text, flags=re.S)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None

    def _sanitize(self, text: str) -> str:
        lines: list[str] = []
        for line in (text or "").splitlines():
            if re.search(r"retrieval|backend|evidence package|source class|policy gate", line, flags=re.I):
                continue
            lines.append(line.rstrip())
        return "\n".join(lines).strip()

    def _contains_chinese(self, text: str) -> bool:
        return bool(re.search(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]", text or ""))

    def _confidence(self, value: Any) -> str:
        value_s = str(value or "").strip().lower()
        return value_s if value_s in {"low", "medium", "high"} else "medium"

    def _as_str_list(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    def _str_or_none(self, value: Any) -> str | None:
        text = str(value or "").strip()
        return text or None
