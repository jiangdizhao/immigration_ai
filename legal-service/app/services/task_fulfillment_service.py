from __future__ import annotations

import json
import os
import re
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryResponse
from app.schemas.state import MatterState
from app.services.conversation_action_service import ConversationAction


class TaskFulfillmentService:
    """
    Executes user-requested service actions.

    This is not the legal reasoning layer. It converts already-known facts,
    active case state, and a user service request into useful artifacts:
    - draft explanation / statement
    - document checklist
    - lawyer brief
    - urgent action plan
    - timeline / next-step plan

    The generation is flexible, but bounded by safety rules.
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

        generated = self._generate(
            action=action,
            state=state,
            raw_user_message=raw_user_message,
            internal_question_en=internal_question_en,
            is_zh=is_zh,
        )

        if not generated:
            generated = self._fallback(
                action=action,
                state=state,
                is_zh=is_zh,
            )

        generated = self._sanitize(generated, is_zh=is_zh)

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
        Store a lightweight pending offer when the assistant has just offered
        to perform a useful next service.

        This lets the next user turn "可以 / continue / 帮我写" resolve to a real task.
        """
        answer = str(response.answer or "")
        if not answer:
            return None

        is_zh = self._is_zh(response_language, original_question)
        op = str(state.operation_type or "")
        frame = str((state.carried_intake_facts or {}).get("active_case_frame_id") or "")

        offered = bool(
            re.search(r"如果你愿意|我下一步可以|我可以直接帮你|I can help you|I can next", answer, re.I)
        )

        task_type = None
        label_zh = None
        label_en = None

        if re.search(r"律师|lawyer|consultation summary|case summary|案情摘要|咨询摘要", answer, re.I):
            task_type = "lawyer_brief"
            label_zh = "整理一份给律师看的案情摘要"
            label_en = "prepare a lawyer consultation summary"
        elif re.search(r"材料清单|文件清单|checklist|documents", answer, re.I):
            task_type = "document_checklist"
            label_zh = "整理材料清单"
            label_en = "prepare a document checklist"
        elif re.search(r"时间|步骤|timeline|next step|action plan|行动", answer, re.I):
            task_type = "status_action_plan"
            label_zh = "整理下一步行动清单"
            label_en = "prepare a next-step action plan"
        elif re.search(r"写|草稿|说明|statement|draft|letter|explanation", answer, re.I):
            task_type = "draft_user_statement"
            label_zh = "起草一份说明文字"
            label_en = "draft a written explanation"

        if task_type is None:
            if any(token in f"{op} {frame}".lower() for token in ["expired", "expiry", "status", "unlawful", "refusal", "review", "cancellation"]):
                task_type = "lawyer_brief"
                label_zh = "整理一份给律师看的案情摘要"
                label_en = "prepare a lawyer consultation summary"
            elif "student_500" in f"{op} {frame}".lower():
                task_type = "draft_user_statement"
                label_zh = "起草一份学生签证说明文字"
                label_en = "draft a student-visa explanation"
            else:
                task_type = "next_step_plan"
                label_zh = "整理下一步计划"
                label_en = "prepare a next-step plan"

        if not offered and response.next_action != "answer":
            return None

        return {
            "offer_type": task_type,
            "label": label_zh if is_zh else label_en,
            "source_operation_type": op,
            "source_frame_id": frame,
            "language": "zh" if is_zh else "en",
            "status": "offered",
        }

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
        facts = dict(state.carried_intake_facts or {})
        history = [turn.model_dump() for turn in state.conversation_history[-8:]]

        system_prompt = (
            "You are a senior Australian migration-law intake assistant.\n"
            "Your job is to complete the user's requested service action, not to restart generic legal Q&A.\n"
            "Use only the user-provided facts, active case state, and conversation history.\n"
            "You may give practical preparation help, but you must not give final legal advice, guaranteed outcomes, exact deadlines, or invented risk percentages.\n"
            "Do not mention internal systems, retrieval, source classes, evidence package, policy gates, or backend logic.\n"
            "Do not use a rigid reusable template. Write naturally for this case.\n"
            "If drafting a statement or explanation, produce an editable draft first, then a short note on what facts the user should customize.\n"
            "If preparing a checklist or lawyer brief, make it practical and case-specific.\n"
            "If the matter involves expired visa, unlawful status, refusal, review, cancellation, NOICC, or BVE, make urgency clear but avoid absolute claims unless the facts prove them.\n"
            f"{language_rule}\n"
        )

        user_payload = {
            "task_type": action.task_type,
            "conversation_action": action.to_debug_dict(),
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
                "Complete the requested service action directly.",
                "Do not just say you can help.",
                "Do not ask for another fact unless absolutely needed; if needed, put the question at the end.",
                "No fake numeric risk scores or arbitrary percentages.",
                "Keep legal certainty bounded.",
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

    def _fallback(self, *, action: ConversationAction, state: MatterState, is_zh: bool) -> str:
        facts = state.carried_intake_facts or {}
        op = str(state.operation_type or "")

        if is_zh:
            if action.task_type == "lawyer_brief":
                return (
                    "下面是一份可发给律师/移民代理的案情摘要草稿：\n\n"
                    "【案情摘要】\n"
                    f"- 当前问题类型：{state.issue_type or '签证/移民问题'}\n"
                    f"- 当前判断方向：{op or '需要进一步确认'}\n"
                    f"- 已知事实：{self._facts_text(facts, is_zh=True)}\n\n"
                    "【希望律师重点核对】\n"
                    "1. 当前 VEVO / ImmiAccount 显示的签证状态；\n"
                    "2. 是否存在逾期停留、过桥签证或 BVE 风险；\n"
                    "3. 是否仍可在境内递交目标签证申请；\n"
                    "4. 需要立即准备哪些文件，以及是否有紧急期限。\n\n"
                    "你可以把 passport、VEVO 截图、签证 grant letter、学校文件、成绩单、保险和任何 Home Affairs/学校邮件一起发给律师。"
                )

            if action.task_type == "document_checklist":
                return (
                    "你可以先准备这些材料，方便下一步判断：\n\n"
                    "1. 护照首页；\n"
                    "2. VEVO 当前状态截图；\n"
                    "3. 当前或最近一次签证 grant letter；\n"
                    "4. 学校 CoE、completion letter、official transcript；\n"
                    "5. 保险证明；\n"
                    "6. 英文成绩或考试预约记录；\n"
                    "7. AFP / 体检 / 已递交申请回执；\n"
                    "8. 任何 Home Affairs、学校或 agent 发来的邮件。\n\n"
                    "如果涉及签证过期、拒签、取消或 review，请优先准备带日期的通知文件。"
                )

            if action.task_type in {"status_action_plan", "timeline_plan", "next_step_plan"}:
                return (
                    "可以。按现在的信息，我建议你先这样处理：\n\n"
                    "1. 今天先查 VEVO 和 ImmiAccount，确认当前签证状态；\n"
                    "2. 保存所有关键文件和截图，包括签证到期日、学校文件、completion letter、CoE、成绩单和保险；\n"
                    "3. 在身份和工作权利确认前，不要默认可以继续工作或旅行；\n"
                    "4. 如果涉及逾期、unlawful、BVE、拒签或取消风险，尽快让律师/注册移民代理核对；\n"
                    "5. 再根据当前身份决定是补救当前状态、递交新申请，还是准备离境/过桥安排。\n\n"
                    "这个计划不能替代正式法律意见，但可以作为今天的处理顺序。"
                )

            return (
                "可以。下面是一版可修改的中文说明草稿：\n\n"
                "【说明草稿】\n"
                "我希望说明我的学习和签证安排是基于真实的学习及职业规划。我之前的学习经历和目前计划之间并不是随意转换，而是希望在已有背景基础上进一步提升管理、协调和职业发展能力。\n\n"
                "我理解签证申请需要说明学习目的、课程选择和未来规划的一致性。因此，我会结合自己的过往学习、工作经历、课程内容以及未来职业目标，解释为什么当前课程对我的发展是合理和必要的。\n\n"
                "【需要你按真实情况补充】\n"
                "1. 你之前具体学了什么；\n"
                "2. 为什么选择现在这个课程；\n"
                "3. 课程和未来职业目标如何连接；\n"
                "4. 学完后计划在澳洲或回国如何使用这些能力。"
            )

        if action.task_type == "lawyer_brief":
            return (
                "Here is a concise lawyer-brief draft:\n\n"
                "Case summary:\n"
                f"- Issue type: {state.issue_type or 'visa / migration issue'}\n"
                f"- Working issue: {op or 'to be confirmed'}\n"
                f"- Known facts: {self._facts_text(facts, is_zh=False)}\n\n"
                "Questions for the lawyer:\n"
                "1. What is the current VEVO / ImmiAccount status?\n"
                "2. Is there any unlawful-status, bridging-visa, or BVE risk?\n"
                "3. Can the target visa still be lodged onshore?\n"
                "4. What documents and deadlines should be treated as urgent?"
            )

        return (
            "Here is a practical next-step plan:\n\n"
            "1. Check VEVO and ImmiAccount today.\n"
            "2. Save key documents and screenshots.\n"
            "3. Do not assume work or travel rights until current status is confirmed.\n"
            "4. If this involves expiry, unlawful status, refusal, cancellation, or BVE, get urgent advice from a lawyer or registered migration agent.\n"
            "5. Then decide whether the next step is a new application, status repair, bridging arrangement, or consultation preparation."
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

    def _sanitize(self, text: str, *, is_zh: bool) -> str:
        cleaned = (text or "").strip()
        cleaned = re.sub(r"\b(retrieval|source classes|evidence package|local corpus|backend|policy gate)\b", "", cleaned, flags=re.I)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
        cleaned = re.sub(r"\b\d{1,3}\s*/\s*100\b", "较高风险" if is_zh else "elevated risk", cleaned)
        cleaned = re.sub(r"\b\d{1,3}\s*%\b", "较高风险" if is_zh else "elevated risk", cleaned)
        return cleaned

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
        return bool(text and re.search(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]", text))
