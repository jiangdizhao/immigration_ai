from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryResponse
from app.schemas.state import MatterState


class TaskFulfillmentService:
    """Executes user-requested service actions from structured semantic state.

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
        action: Any,
        state: MatterState,
        raw_user_message: str,
        internal_question_en: str,
        response_language: str,
        matter_id: str | None,
    ) -> QueryResponse:
        is_zh = self._is_zh(response_language, raw_user_message)
        task_type = getattr(action, "task_type", None) or "next_step_plan"

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
                "conversation_action": action.to_debug_dict() if hasattr(action, "to_debug_dict") else {},
                "semantic_turn_analysis": getattr(action, "semantic_turn", None),
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
        """Deprecated compatibility method.

        Pending offers are now created from CommunicationPlanService, not by
        regex-scanning the assistant's public answer.
        """
        return None

    def _generate(
        self,
        *,
        action: Any,
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
            "Do not restart generic legal Q&A and do not merely acknowledge the request.\n"
            "Use only the structured task_type, semantic_turn_analysis, known facts, and recent history.\n"
            "Do not invent legal conclusions, exact deadlines, risk percentages, scores, charts, or guaranteed outcomes.\n"
            "Do not mention internal systems, retrieval, evidence packages, source classes, backend, or policy gates.\n"
            "Write naturally and case-specifically. Use a polished layout with headings and bullets where useful.\n"
            "If the task is a lawyer brief, produce a concise document with sections: case summary, known facts, urgent issues to check, documents to attach, and questions for the lawyer.\n"
            "If the task is a draft, produce an editable draft first and then a short customization note.\n"
            "If the task is a checklist, group materials by purpose.\n"
            "If the task is an action plan or timeline, give ordered next steps and keep legal certainty bounded.\n"
            f"{language_rule}\n"
        )

        user_payload = {
            "task_type": task_type,
            "conversation_action": action.to_debug_dict() if hasattr(action, "to_debug_dict") else {},
            "semantic_turn_analysis": getattr(action, "semantic_turn", None),
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
                "Use clear headings and bullets; make the output easy to copy.",
                "Do not ask another question unless required to complete the task safely.",
                "No fake numeric risk scores or marketing content.",
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
                    "## 给律师看的案情摘要\n\n"
                    f"**当前问题：** {state.issue_type or '签证/移民问题'}\n"
                    f"**当前处理方向：** {state.operation_type or '需要进一步确认'}\n\n"
                    "### 已知事实\n"
                    f"{facts_text}\n\n"
                    "### 请律师重点核对\n"
                    "- 当前 VEVO / ImmiAccount 显示的签证状态；\n"
                    "- 关键到期日、是否已经出现 unlawful 或过桥签证风险；\n"
                    "- 是否仍可在境内递交申请，或是否需要先处理 BVE / 其他补救路径；\n"
                    "- 哪些文件需要马上准备，以及是否有紧急期限。\n\n"
                    "### 建议一并发送的文件\n"
                    "护照、VEVO 截图、签证 grant letter、学校文件、completion letter、成绩单、保险，以及任何 Home Affairs / 学校 / agent 邮件。"
                )
            if task_type == "document_checklist":
                return (
                    "## 材料清单\n\n"
                    "### 身份和签证状态\n"
                    "- 护照首页\n- VEVO 截图\n- 最近一次签证 grant letter\n\n"
                    "### 学校和学习材料\n"
                    "- CoE、completion letter、成绩单\n- 学校或 agent 的相关邮件\n\n"
                    "### 其他可能相关材料\n"
                    "- 保险、英文成绩、AFP 或体检记录（如已准备）"
                )
            if task_type in {"status_action_plan", "timeline_plan", "next_step_plan"}:
                return (
                    "## 下一步行动\n\n"
                    "### 先确认身份\n"
                    "马上查 VEVO 和 ImmiAccount，保存当前状态截图和关键日期。\n\n"
                    "### 暂时不要冒险\n"
                    "在身份和工作权利确认前，不要默认可以继续工作或旅行。\n\n"
                    "### 尽快让专业人士核对\n"
                    "如果涉及逾期、拒签、取消或 BVE 风险，应尽快让律师或注册移民代理核对。"
                )
            return (
                "## 可修改说明草稿\n\n"
                "我希望说明，我的学习和签证安排是基于真实的学习及职业规划。我会结合自己的过往学习、课程选择、未来目标和实际情况，解释为什么当前安排具有合理性。\n\n"
                "请根据你的真实经历补充课程名称、学习原因、职业目标和相关证据。"
            )

        if task_type == "lawyer_brief":
            return (
                "## Lawyer brief\n\n"
                f"**Issue:** {state.issue_type or 'visa / migration issue'}\n"
                f"**Working direction:** {state.operation_type or 'to be confirmed'}\n\n"
                f"**Known facts:** {facts_text}\n\n"
                "**Please check:** current VEVO / ImmiAccount status, key dates, unlawful-status or bridging-visa risk, whether an onshore application remains available, and what documents must be prepared urgently."
            )

        return (
            "## Practical next steps\n\n"
            "- Check VEVO and ImmiAccount.\n"
            "- Save key documents and screenshots.\n"
            "- Do not assume work or travel rights until current status is confirmed.\n"
            "- Get urgent advice from a lawyer or registered migration agent if the matter involves expiry, unlawful status, refusal, cancellation, or BVE."
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
            parts.append(f"- {key}: {value}" if is_zh else f"- {key}: {value}")

        return "\n".join(parts[:12]) if parts else ("暂未整理" if is_zh else "not yet organized")

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

        banned_fragments = ("Outcome Graphic", "Risk Pie", "AMEC-style", "YouTube", "donate", "抖內", "電台", "电台")
        lines = [line for line in cleaned.splitlines() if not any(b.lower() in line.lower() for b in banned_fragments)]
        cleaned = "\n".join(lines)

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
