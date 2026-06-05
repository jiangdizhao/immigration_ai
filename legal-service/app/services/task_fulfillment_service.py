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
    """
    Executes user-requested service actions from structured semantic state.

    This service does not classify natural language. It receives a task_type
    already derived from SemanticTurnAnalysis and completes the requested service.
    """

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
        task_type = action.task_type or "next_step_plan"

        generated = self._generate(
            action=action,
            task_type=task_type,
            state=state,
            raw_user_message=raw_user_message,
            internal_question_en=internal_question_en,
            is_zh=is_zh,
        )

        if not generated:
            generated = self._fallback(
                task_type=task_type,
                state=state,
                is_zh=is_zh,
            )

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
                "semantic_turn_analysis": action.semantic_turn,
                "task_fulfillment": {
                    "task_type": task_type,
                    "handled_without_retrieval": True,
                    "semantic_regex_used": False,
                },
            },
        )

    def propose_pending_offer(
        self,
        *,
        response: QueryResponse,
        state: MatterState,
        original_question: str,
        response_language: str,
    ) -> dict[str, Any] | None:
        """
        Deprecated compatibility method.

        Pending offers are now created from CommunicationPlanService, not by
        regex-scanning the assistant's public answer.
        """
        return None

    def _generate(
        self,
        *,
        action: ConversationAction,
        task_type: str,
        state: MatterState,
        raw_user_message: str,
        internal_question_en: str,
        is_zh: bool,
    ) -> str | None:
        language_rule = "Write in Simplified Chinese." if is_zh else "Write in English."
        facts = dict(state.carried_intake_facts or {})
        history = [turn.model_dump() for turn in state.conversation_history[-8:]]

        system_prompt = (
            "You are a senior Australian migration-law intake assistant.\n"
            "Complete the user's requested service action directly.\n"
            "Do not restart generic legal Q&A.\n"
            "Use only the structured task_type, semantic_turn_analysis, known facts, and recent history.\n"
            "Do not invent legal conclusions, exact deadlines, risk percentages, or guaranteed outcomes.\n"
            "Do not mention internal systems, retrieval, evidence packages, source classes, backend, or policy gates.\n"
            "Write naturally and case-specifically, not as a reusable template.\n"
            "If the task is a draft, produce an editable draft first.\n"
            "If the task is a lawyer brief, produce a concise consultation summary and key issues for the lawyer to check.\n"
            "If the task is a checklist, make it practical and specific to the known facts.\n"
            "If the task is an action plan or timeline, give ordered next steps and keep legal certainty bounded.\n"
            f"{language_rule}\n"
        )

        user_payload = {
            "task_type": task_type,
            "conversation_action": action.to_debug_dict(),
            "semantic_turn_analysis": action.semantic_turn,
            "raw_user_message": raw_user_message,
            "internal_question_en": internal_question_en,
            "active_state": {
                "conversation_state": state.conversation_state,
                "issue_type": state.issue_type,
                "operation_type": state.operation_type,
                "visa_type": state.visa_type,
                "risk_flags": state.risk_flags.model_dump(),
                "known_facts": facts,
            },
            "recent_history": history,
            "output_requirements": [
                "Complete the requested service action.",
                "Do not only acknowledge the request.",
                "Do not ask another question unless required to complete the task safely.",
                "No fake numeric risk scores.",
                "Preserve uncertainty and recommend lawyer review for high-risk status, refusal, cancellation, or deadline matters.",
            ],
        }

        try:
            result = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                ],
            )
            text = (result.output_text or "").strip()
            return text or None
        except Exception:
            return None

    def _fallback(self, *, task_type: str, state: MatterState, is_zh: bool) -> str:
        facts_text = self._facts_text(state.carried_intake_facts or {}, is_zh=is_zh)

        if is_zh:
            if task_type == "lawyer_brief":
                return (
                    "下面是一份可发给律师或注册移民代理的简短案情摘要：\n\n"
                    f"当前问题：{state.issue_type or '签证/移民问题'}；当前处理方向：{state.operation_type or '需要进一步确认'}。\n"
                    f"已知事实：{facts_text}\n\n"
                    "请律师重点核对：当前 VEVO/ImmiAccount 状态、关键日期、是否存在逾期或过桥签证风险、是否仍可境内递交申请，以及需要马上准备哪些文件。"
                )
            if task_type == "document_checklist":
                return (
                    "可以先准备：护照、VEVO 截图、最近一次签证 grant letter、学校文件、completion letter、成绩单、保险、英文或 AFP/体检记录，以及任何 Home Affairs/学校/agent 邮件。"
                )
            if task_type in {"status_action_plan", "timeline_plan", "next_step_plan"}:
                return (
                    "可以。下一步建议先确认当前身份：查 VEVO 和 ImmiAccount，保存关键截图和文件；在身份和工作权利确认前，不要默认可以继续工作或旅行；如果涉及逾期、拒签、取消或 BVE 风险，应尽快让律师或注册移民代理核对。"
                )
            return (
                "可以。下面是一版可修改的说明草稿：\n\n"
                "我希望说明我的学习和签证安排是基于真实的学习及职业规划。我会结合自己的过往学习、课程选择、未来目标和实际情况，解释为什么当前安排具有合理性。请根据你的真实经历补充课程名称、学习原因、职业目标和相关证据。"
            )

        if task_type == "lawyer_brief":
            return (
                "Here is a concise lawyer-brief draft:\n\n"
                f"Issue: {state.issue_type or 'visa / migration issue'}.\n"
                f"Working direction: {state.operation_type or 'to be confirmed'}.\n"
                f"Known facts: {facts_text}.\n\n"
                "Please check current VEVO/ImmiAccount status, key dates, any unlawful-status or bridging-visa risk, whether an onshore application remains available, and what documents must be prepared urgently."
            )

        return (
            "Here is a practical next-step plan: check VEVO and ImmiAccount, save key documents and screenshots, do not assume work or travel rights until current status is confirmed, and get urgent advice from a lawyer or registered migration agent if the matter involves expiry, unlawful status, refusal, cancellation, or BVE."
        )

    def _facts_text(self, facts: dict[str, Any], *, is_zh: bool) -> str:
        if not facts:
            return "暂未整理" if is_zh else "not yet organized"

        hidden = {
            "active_case_frame_id",
            "case_family",
            "operation_type",
            "answer_preference",
            "answer_tier",
            "pending_offer",
        }

        parts = []
        for key, value in facts.items():
            if key in hidden or value in (None, ""):
                continue
            parts.append(f"{key}={value}")

        return "; ".join(parts[:12]) if parts else ("暂未整理" if is_zh else "not yet organized")

    def _sanitize(self, text: str) -> str:
        cleaned = (text or "").strip()
        internal_words = [
            "retrieval",
            "source classes",
            "evidence package",
            "local corpus",
            "backend",
            "policy gate",
            "operation answerability",
        ]
        for word in internal_words:
            cleaned = cleaned.replace(word, "available information")
            cleaned = cleaned.replace(word.title(), "available information")

        kept = []
        for token in cleaned.split():
            stripped = token.strip(".,;:()[]{}")
            if stripped.endswith("%") and stripped[:-1].isdigit():
                continue
            if "/100" in stripped:
                continue
            kept.append(token)

        return " ".join(kept).strip()

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
        if not text:
            return False
        return any("\u3400" <= ch <= "\ufaff" for ch in text)