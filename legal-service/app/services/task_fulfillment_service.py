from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryResponse
from app.schemas.state import MatterState
from app.services.conversation_action_service import ConversationAction


class TaskFulfillmentService:
    """Execute user-requested service actions from structured semantic analysis.

    This file deliberately does not use fixed phrase lists to detect intent or
    task type. ConversationActionService supplies structured task_type from the
    SemanticTurnAnalysis form. This service only completes that requested task.
    """

    INTERNAL_WORDS = (
        "retrieval",
        "retrieved material",
        "source classes",
        "evidence package",
        "operation answerability",
        "backend",
        "policy gate",
    )

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv("TASK_FULFILLMENT_MODEL", os.getenv("REASONING_MODEL", "gpt-5.4-mini"))
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    def build_response(
        self,
        *,
        action: ConversationAction,
        state: MatterState,
        raw_user_message: str,
        internal_question_en: str,
        response_language: str,
        matter_id: str | None,
    ) -> QueryResponse:
        is_zh = self._is_zh(response_language, raw_user_message)
        generated = self._generate(
            action=action,
            state=state,
            raw_user_message=raw_user_message,
            internal_question_en=internal_question_en,
            is_zh=is_zh,
        )
        if not generated:
            generated = self._fallback(action=action, state=state, is_zh=is_zh)
        generated = self._sanitize(generated)
        return QueryResponse(
            matter_id=matter_id,
            answer=generated,
            response_language="zh" if is_zh else "en",
            confidence="medium",
            user_display_mode="general_with_warning",
            issue_type=state.issue_type,
            missing_facts=[],
            follow_up_questions=[],
            citations=[],
            compact_sources=[],
            escalate=self._should_escalate(state),
            next_action="answer",
            conversation_state=state.conversation_state,
            case_hypothesis=state.case_hypothesis,
            fact_slot_states=state.fact_slot_states,
            interaction_plan=state.interaction_plan,
            legal_reasoning_trace={},
            retrieval_debug={
                "conversation_action": action.to_debug_dict(),
                "task_fulfillment": {
                    "task_type": action.task_type,
                    "handled_without_retrieval": True,
                    "semantic_regex_authority": False,
                },
            },
        )

    def propose_pending_offer(self, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        """Deprecated compatibility method.

        Pending offers are now created from CommunicationPlan structured metadata,
        not inferred by scanning assistant answer text.
        """
        return None

    def _generate(
        self,
        *,
        action: ConversationAction,
        state: MatterState,
        raw_user_message: str,
        internal_question_en: str,
        is_zh: bool,
    ) -> str | None:
        language_rule = "Write in Simplified Chinese." if is_zh else "Write in English."
        payload = {
            "task_type": action.task_type or "next_step_plan",
            "conversation_action": action.to_debug_dict(),
            "raw_user_message": raw_user_message,
            "internal_question_en": internal_question_en,
            "active_state": {
                "conversation_state": state.conversation_state,
                "issue_type": state.issue_type,
                "operation_type": state.operation_type,
                "visa_type": state.visa_type,
                "risk_flags": state.risk_flags.model_dump(),
                "known_facts": state.carried_intake_facts,
            },
            "recent_history": [turn.model_dump() for turn in state.conversation_history[-8:]],
        }
        system_prompt = (
            "You are a senior Australian migration-law intake assistant.\n"
            "Complete the user's requested service action directly. Do not restart generic legal Q&A.\n"
            "Use only user-provided facts, confirmed matter state, and conversation history.\n"
            "If the user requested a draft, produce the draft first, then a short note on what to customize.\n"
            "If the user requested a checklist, lawyer brief, timeline, or action plan, produce that practical artifact.\n"
            "Keep legal certainty bounded. Do not guarantee outcomes, exact deadlines, or visa eligibility.\n"
            "Do not invent fake percentages or scores.\n"
            "Do not mention internal systems, retrieval, evidence package, source classes, backend, or policy gates.\n"
            "Write naturally and case-specifically; do not use a rigid reusable template.\n"
            f"{language_rule}\n"
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
            return text or None
        except Exception:
            return None

    def _fallback(self, *, action: ConversationAction, state: MatterState, is_zh: bool) -> str:
        # Minimal emergency fallback only. Normal operation should use LLM task generation.
        if is_zh:
            return (
                "可以。我可以根据目前已经记录的信息整理下一步材料。"
                "不过这一步需要保持谨慎：如果涉及签证过期、拒签、取消、NOICC、BVE 或复审期限，"
                "请尽快让律师或注册移民代理核对原始文件和关键日期。"
            )
        return (
            "I can help organize the next step from the information already recorded. "
            "If this involves visa expiry, refusal, cancellation, a NOICC, BVE, or a review deadline, "
            "a lawyer or registered migration agent should check the original documents and key dates promptly."
        )

    def _sanitize(self, text: str) -> str:
        out = (text or "").strip()
        for word in self.INTERNAL_WORDS:
            out = out.replace(word, "available information")
            out = out.replace(word.title(), "available information")
        pieces = []
        for token in out.split():
            stripped = token.strip(".,;:()[]{}")
            if stripped.endswith("%") and stripped[:-1].isdigit():
                continue
            if "/100" in stripped:
                continue
            pieces.append(token)
        return " ".join(pieces).strip()

    def _should_escalate(self, state: MatterState) -> bool:
        flags = state.risk_flags
        return bool(
            flags.deadline_sensitive
            or flags.cancellation_related
            or flags.detention_related
            or flags.character_issue
            or flags.pic4020_issue
            or flags.review_related
        )

    def _is_zh(self, response_language: str | None, text: str | None = None) -> bool:
        if str(response_language or "").lower().startswith("zh"):
            return True
        return any("\u3400" <= ch <= "\u9fff" or "\uf900" <= ch <= "\ufaff" for ch in (text or ""))
