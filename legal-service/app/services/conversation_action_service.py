from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.schemas.state import MatterState
from app.services.semantic_turn_service import SemanticTurnService


@dataclass(slots=True)
class ConversationAction:
    """Conversation-level action, separate from legal case-frame routing."""

    action_type: str = "legal_question"
    should_handle_as_task: bool = False
    task_type: str | None = None
    confidence: str = "low"
    reason: str = ""
    matched_phrases: list[str] = field(default_factory=list)  # retained for compatibility; no semantic regex is used
    accepted_offer: dict[str, Any] | None = None
    semantic_turn: dict[str, Any] | None = None

    def to_debug_dict(self) -> dict[str, Any]:
        return {
            "action_type": self.action_type,
            "should_handle_as_task": self.should_handle_as_task,
            "task_type": self.task_type,
            "confidence": self.confidence,
            "reason": self.reason,
            "matched_phrases": list(self.matched_phrases),
            "accepted_offer": self.accepted_offer,
            "semantic_turn": self.semantic_turn,
        }


class ConversationActionService:
    """LLM-backed conversation-act router.

    No fixed phrase list decides whether the user wants drafting, continuation,
    a checklist, a lawyer summary, or a timeline. The backend LLM fills the
    SemanticTurnAnalysis form; this service only maps allowed enum values to the
    old ConversationAction interface expected by QueryService.
    """

    TASK_CONVERSATION_ACTS = {
        "accept_previous_offer",
        "draft_request",
        "checklist_request",
        "lawyer_summary_request",
        "timeline_request",
        "booking_request",
    }

    def __init__(self, semantic_turn_service: SemanticTurnService | None = None) -> None:
        self.semantic_turn_service = semantic_turn_service or SemanticTurnService()

    def analyze(
        self,
        *,
        raw_user_message: str,
        internal_question_en: str,
        current_state: MatterState,
        pending_offer: dict[str, Any] | None,
        conversation_history: list[dict[str, Any]] | None = None,
    ) -> ConversationAction:
        semantic = self.semantic_turn_service.analyze(
            raw_user_message=raw_user_message,
            internal_question_en=internal_question_en,
            current_state=current_state,
            pending_offer=pending_offer,
            conversation_history=conversation_history,
            response_language="zh" if self._has_cjk(raw_user_message) else None,
        )

        semantic_dict = semantic.model_dump()
        task_type = semantic.task_intent.task_type
        should_task = bool(
            semantic.should_handle_as_task
            or semantic.conversation_act in self.TASK_CONVERSATION_ACTS
            or task_type != "none"
        )

        accepted_offer = pending_offer if semantic.task_intent.uses_pending_offer else None
        if semantic.pending_offer.action == "use_existing" and pending_offer:
            accepted_offer = pending_offer

        return ConversationAction(
            action_type=semantic.conversation_act,
            should_handle_as_task=should_task,
            task_type=None if task_type == "none" else task_type,
            confidence=semantic.confidence,
            reason=semantic.rationale or "semantic_turn_analysis",
            matched_phrases=[],
            accepted_offer=accepted_offer,
            semantic_turn=semantic_dict,
        )

    def _has_cjk(self, text: str | None) -> bool:
        return any("\u3400" <= ch <= "\u9fff" or "\uf900" <= ch <= "\ufaff" for ch in (text or ""))
