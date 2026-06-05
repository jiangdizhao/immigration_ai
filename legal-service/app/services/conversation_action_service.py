from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.schemas.semantic_contracts import SemanticTurnAnalysis
from app.schemas.state import MatterState
from app.services.semantic_turn_service import SemanticTurnService


@dataclass(slots=True)
class ConversationAction:
    """
    Compatibility action object derived from SemanticTurnAnalysis.

    Important:
    This class no longer uses regex or phrase matching. It only reflects the
    structured semantic form filled by SemanticTurnService.
    """

    action_type: str = "legal_question"
    should_handle_as_task: bool = False
    task_type: str | None = None
    confidence: str = "low"
    reason: str = ""
    matched_phrases: list[str] = field(default_factory=list)
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
    """
    Semantic-action adapter.

    This service intentionally does NOT interpret flexible user language with
    regex. Flexible language is handled by SemanticTurnService, which fills a
    strict JSON form. This adapter only converts the validated semantic form into
    the older ConversationAction shape used by QueryService and TaskFulfillmentService.
    """

    ACT_TO_DEFAULT_TASK: dict[str, str] = {
        "draft_request": "draft_user_statement",
        "checklist_request": "document_checklist",
        "lawyer_summary_request": "lawyer_brief",
        "timeline_request": "timeline_plan",
        "booking_request": "booking_handoff",
        "accept_previous_offer": "next_step_plan",
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
        allowed_case_frames: list[str] | None = None,
        allowed_operations: list[str] | None = None,
        response_language: str | None = None,
    ) -> ConversationAction:
        """
        Backward-compatible entrypoint.

        QueryService should normally call SemanticTurnService directly and then
        call from_semantic_turn(). This method remains for compatibility and still
        avoids regex.
        """
        semantic_turn = self.semantic_turn_service.analyze(
            raw_user_message=raw_user_message,
            internal_question_en=internal_question_en,
            current_state=current_state,
            pending_offer=pending_offer,
            conversation_history=conversation_history or [],
            allowed_case_frames=allowed_case_frames or [],
            allowed_operations=allowed_operations or [],
            response_language=response_language,
        )
        return self.from_semantic_turn(
            semantic_turn=semantic_turn,
            pending_offer=pending_offer,
        )

    def from_semantic_turn(
        self,
        *,
        semantic_turn: SemanticTurnAnalysis,
        pending_offer: dict[str, Any] | None = None,
    ) -> ConversationAction:
        act = semantic_turn.conversation_act
        task_type = semantic_turn.task_intent.task_type

        if task_type == "none":
            if act == "accept_previous_offer" and isinstance(pending_offer, dict):
                task_type = str(pending_offer.get("offer_type") or "next_step_plan")  # type: ignore[assignment]
            else:
                task_type = self.ACT_TO_DEFAULT_TASK.get(act, "none")  # type: ignore[assignment]

        should_handle = bool(
            semantic_turn.should_handle_as_task
            or semantic_turn.task_intent.uses_pending_offer
            or task_type != "none"
            or act in {
                "accept_previous_offer",
                "draft_request",
                "checklist_request",
                "lawyer_summary_request",
                "timeline_request",
                "booking_request",
            }
        )

        accepted_offer = pending_offer if semantic_turn.task_intent.uses_pending_offer else None

        return ConversationAction(
            action_type=act,
            should_handle_as_task=should_handle,
            task_type=task_type if task_type != "none" else None,
            confidence=semantic_turn.confidence,
            reason=semantic_turn.rationale or "derived_from_semantic_turn_analysis",
            matched_phrases=[],
            accepted_offer=accepted_offer,
            semantic_turn=semantic_turn.model_dump(),
        )