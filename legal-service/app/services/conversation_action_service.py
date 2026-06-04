from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any

from app.schemas.state import MatterState


@dataclass(slots=True)
class ConversationAction:
    """
    User-level conversation action, separate from legal case-frame routing.

    CaseFrameService answers: "what legal issue is this?"
    ConversationActionService answers: "what does the user want the assistant to DO now?"
    """

    action_type: str = "legal_question"
    should_handle_as_task: bool = False
    task_type: str | None = None
    confidence: str = "low"
    reason: str = ""
    matched_phrases: list[str] = field(default_factory=list)
    accepted_offer: dict[str, Any] | None = None

    def to_debug_dict(self) -> dict[str, Any]:
        return {
            "action_type": self.action_type,
            "should_handle_as_task": self.should_handle_as_task,
            "task_type": self.task_type,
            "confidence": self.confidence,
            "reason": self.reason,
            "matched_phrases": list(self.matched_phrases),
            "accepted_offer": self.accepted_offer,
        }


class ConversationActionService:
    """
    Detect service/action intents without deciding legal outcomes.

    This keeps legal reasoning rigid, but lets the assistant behave like a real
    consultant when the user says things like:
    - "帮我写成中文版本"
    - "可以继续下一步"
    - "整理给律师"
    - "列材料清单"
    """

    DRAFT_PATTERNS = (
        re.compile(
            r"\b(draft|write|rewrite|compose|prepare|polish)\b.*\b(statement|letter|explanation|submission|email|template|genuine student|study plan)\b",
            re.I,
        ),
        re.compile(
            r"\b(statement|letter|explanation|submission|email|template|study plan)\b.*\b(draft|write|rewrite|compose|prepare|polish)\b",
            re.I,
        ),
        re.compile(r"帮我写|写成|整理成|改成|润色|草稿|说明信|解释信|个人陈述|学习计划|中文版本|英文版本"),
    )

    CHECKLIST_PATTERNS = (
        re.compile(r"\b(checklist|document list|documents? to prepare|what documents|materials to prepare)\b", re.I),
        re.compile(r"材料清单|文件清单|准备哪些材料|需要哪些文件|需要什么材料"),
    )

    LAWYER_SUMMARY_PATTERNS = (
        re.compile(r"\b(lawyer brief|consultation summary|case summary|summari[sz]e.*lawyer|send.*lawyer)\b", re.I),
        re.compile(r"律师.*摘要|摘要.*律师|案情摘要|咨询摘要|发给律师|给律师看"),
    )

    TIMELINE_PATTERNS = (
        re.compile(r"\b(timeline|time plan|schedule|step-by-step plan|next steps plan)\b", re.I),
        re.compile(r"时间安排|时间表|步骤安排|下一步计划|处理顺序|行动计划"),
    )

    ACCEPT_PATTERNS = (
        re.compile(
            r"^(yes|yes please|ok|okay|sure|go ahead|continue|continue please|next step|please continue|let'?s continue)\.?$",
            re.I,
        ),
        re.compile(r"^(可以|可以的|好|好的|行|继续|继续吧|下一步|可以继续|可以继续下一步|麻烦继续|请继续|开始吧|就这样做)[。！!]*$"),
        re.compile(r"继续下一步|可以继续|帮我继续|那就继续|按这个继续"),
    )

    def analyze(
        self,
        *,
        raw_user_message: str,
        internal_question_en: str,
        current_state: MatterState,
        pending_offer: dict[str, Any] | None,
        conversation_history: list[dict[str, Any]] | None = None,
    ) -> ConversationAction:
        raw = (raw_user_message or "").strip()
        internal = (internal_question_en or "").strip()
        combined = "\n".join(part for part in [raw, internal] if part).strip()

        if not combined:
            return ConversationAction(reason="empty_turn")

        pending = pending_offer if isinstance(pending_offer, dict) else None
        pending_type = str((pending or {}).get("offer_type") or "").strip() or None

        matched = self._first_match(combined, self.DRAFT_PATTERNS)
        if matched:
            return ConversationAction(
                action_type="draft_request",
                should_handle_as_task=True,
                task_type=pending_type if pending_type and pending_type.startswith("draft") else "draft_user_statement",
                confidence="high",
                reason="user_asked_for_drafting_or_rewriting",
                matched_phrases=[matched],
                accepted_offer=pending,
            )

        matched = self._first_match(combined, self.CHECKLIST_PATTERNS)
        if matched:
            return ConversationAction(
                action_type="checklist_request",
                should_handle_as_task=True,
                task_type="document_checklist",
                confidence="high",
                reason="user_asked_for_document_checklist",
                matched_phrases=[matched],
                accepted_offer=pending,
            )

        matched = self._first_match(combined, self.LAWYER_SUMMARY_PATTERNS)
        if matched:
            return ConversationAction(
                action_type="lawyer_summary_request",
                should_handle_as_task=True,
                task_type="lawyer_brief",
                confidence="high",
                reason="user_asked_for_lawyer_or_consultation_summary",
                matched_phrases=[matched],
                accepted_offer=pending,
            )

        matched = self._first_match(combined, self.TIMELINE_PATTERNS)
        if matched:
            return ConversationAction(
                action_type="timeline_request",
                should_handle_as_task=True,
                task_type="timeline_plan",
                confidence="high",
                reason="user_asked_for_timeline_or_action_plan",
                matched_phrases=[matched],
                accepted_offer=pending,
            )

        matched = self._first_match(raw, self.ACCEPT_PATTERNS)
        if matched:
            if pending:
                return ConversationAction(
                    action_type="accept_previous_offer",
                    should_handle_as_task=True,
                    task_type=pending_type or self._default_task_type(current_state),
                    confidence="high",
                    reason="user_accepted_pending_offer",
                    matched_phrases=[matched],
                    accepted_offer=pending,
                )

            if self._has_prior_assistant_offer(conversation_history):
                return ConversationAction(
                    action_type="continue_next_step",
                    should_handle_as_task=True,
                    task_type=self._default_task_type(current_state),
                    confidence="medium",
                    reason="user_requested_continuation_without_explicit_pending_offer",
                    matched_phrases=[matched],
                    accepted_offer=None,
                )

        return ConversationAction(
            action_type="legal_question",
            should_handle_as_task=False,
            confidence="medium",
            reason="ordinary_legal_question_or_fact_update",
        )

    def _first_match(self, text: str, patterns: tuple[re.Pattern[str], ...]) -> str | None:
        for pattern in patterns:
            match = pattern.search(text or "")
            if match:
                return match.group(0)
        return None

    def _has_prior_assistant_offer(self, history: list[dict[str, Any]] | None) -> bool:
        for item in reversed(history or []):
            if not isinstance(item, dict) or item.get("role") != "assistant":
                continue

            text = str(item.get("content") or "")
            if re.search(
                r"如果你愿意|我下一步可以|我可以直接帮你|I can next|I can help you (?:next|prepare|draft|write|summari[sz]e)",
                text,
                re.I,
            ):
                return True

            return False

        return False

    def _default_task_type(self, state: MatterState) -> str:
        op = str(state.operation_type or "")
        facts = state.carried_intake_facts or {}
        frame = str(facts.get("active_case_frame_id") or "")
        combined = f"{op} {frame}".lower()

        if any(token in combined for token in ["expired", "expiry", "status", "unlawful", "bve", "refusal", "review", "cancellation"]):
            return "status_action_plan"

        if any(token in combined for token in ["genuine_student", "study", "course", "application_readiness"]):
            return "draft_user_statement"

        if "document" in combined or "checklist" in combined:
            return "document_checklist"

        return "next_step_plan"
