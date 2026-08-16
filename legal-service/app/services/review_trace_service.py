from __future__ import annotations

import json
import logging
import os
from typing import Any

from app.core.config import get_settings
from app.db.models import AnswerTrace, Matter
from app.db.session import SessionLocal
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.state import MatterState
from app.schemas.agent import AgentExecutionMetrics
from app.services.agent_observability_service import AgentObservabilityService

logger = logging.getLogger(__name__)


class ReviewTraceService:
    """Passive answer-trace recorder for lawyer review.

    This service must never affect the public answer path. It opens its own DB
    session and catches all failures so review logging cannot roll back or fail
    /api/v1/query.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.git_commit_sha = os.getenv("GIT_COMMIT_SHA") or os.getenv("APP_GIT_SHA")

    def safe_record_answer_trace(
        self,
        *,
        matter: Matter,
        payload: QueryRequest,
        response: QueryResponse,
        state: MatterState | None,
        semantic_turn: Any | None = None,
        original_question: str | None = None,
        effective_question: str | None = None,
        stage_timing: dict[str, Any] | None = None,
        legal_decision: Any | None = None,
        communication_plan: Any | None = None,
        extra_debug: dict[str, Any] | None = None,
        execution_metrics: AgentExecutionMetrics | dict[str, Any] | None = None,
    ) -> str | None:
        if not getattr(self.settings, "enable_lawyer_review_trace", False):
            return None

        try:
            state_dump = self._safe_json(state)
            response_dump = self._safe_json(response)
            active_observability = AgentObservabilityService().trace_payload()
            metrics_dump = self._safe_json(execution_metrics)
            if metrics_dump is None and active_observability is not None:
                metrics_dump = active_observability.get("execution_metrics")
            trace_payload = {
                "request": self._safe_json(payload),
                "response": response_dump,
                "state": state_dump,
                "semantic_turn": self._safe_json(semantic_turn),
                "legal_decision_object": self._safe_json(legal_decision),
                "communication_plan": self._safe_json(communication_plan),
                "retrieval_debug": self._safe_json(response.retrieval_debug or {}),
                "legal_reasoning_trace": self._safe_json(response.legal_reasoning_trace or {}),
                "case_hypothesis": self._safe_json(response.case_hypothesis),
                "fact_slot_states": self._safe_json(response.fact_slot_states or []),
                "interaction_plan": self._safe_json(response.interaction_plan),
                "citations": self._safe_json(response.citations or []),
                "compact_sources": self._safe_json(response.compact_sources or []),
                "stage_timing": self._safe_json(stage_timing or {}),
                "extra_debug": self._safe_json(extra_debug or {}),
                "git_commit_sha": self.git_commit_sha,
                "architecture_version": (
                    active_observability.get("architecture_version")
                    if active_observability is not None
                    else getattr(response, "architecture_version", None)
                ),
                "agent_observability": self._safe_json(active_observability),
                "execution_metrics": metrics_dump,
            }

            operation_type = None
            if state is not None:
                operation_type = state.operation_type
            if not operation_type and isinstance(state_dump, dict):
                operation_type = state_dump.get("operation_type")

            turn_index = self._assistant_turn_count(state_dump)
            with SessionLocal() as db:
                trace = AnswerTrace(
                    matter_id=matter.id,
                    session_id=matter.session_id or payload.session_id,
                    turn_index=turn_index,
                    user_message=original_question or payload.question,
                    assistant_answer=response.answer,
                    response_language=response.response_language,
                    confidence=response.confidence,
                    next_action=response.next_action,
                    escalate=bool(response.escalate),
                    user_display_mode=response.user_display_mode,
                    issue_type=response.issue_type or (state.issue_type if state is not None else None),
                    visa_type=(state.visa_type if state is not None else None),
                    operation_type=operation_type,
                    conversation_state=str(response.conversation_state or (state.conversation_state if state is not None else "") or "") or None,
                    review_status="unreviewed",
                    trace_json={
                        **trace_payload,
                        "original_question": original_question,
                        "effective_question": effective_question,
                    },
                )
                db.add(trace)
                db.commit()
                db.refresh(trace)
                return trace.id
        except Exception:
            logger.exception("Review trace recording failed; public response is unchanged.")
            return None

    def _safe_json(self, value: Any) -> Any:
        if value is None:
            return None
        if hasattr(value, "model_dump"):
            value = value.model_dump()
        elif isinstance(value, list):
            value = [self._safe_json(item) for item in value]
        elif isinstance(value, tuple):
            value = [self._safe_json(item) for item in value]
        elif isinstance(value, dict):
            value = {str(key): self._safe_json(item) for key, item in value.items()}
        try:
            return json.loads(json.dumps(value, ensure_ascii=False, default=str))
        except Exception:
            return str(value)

    def _assistant_turn_count(self, state_dump: Any) -> int | None:
        if not isinstance(state_dump, dict):
            return None
        history = state_dump.get("conversation_history") or []
        if not isinstance(history, list):
            return None
        count = 0
        for item in history:
            if not isinstance(item, dict):
                continue
            if item.get("role") == "assistant":
                count += 1
        return count or None
