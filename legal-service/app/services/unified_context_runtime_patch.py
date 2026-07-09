from __future__ import annotations

import logging
import time
from typing import Any

from app.schemas.query import QueryRequest, QueryResponse
from app.services.conversation_memory_service import ConversationMemoryService
from app.services.premium_direct_answer_service import PremiumDirectAnswerService
from app.services.proposal_first_verification_depth_answer_service import (
    ProposalFirstVerificationDepthAnswerService,
)
from app.services.query_service import QueryService, _QueryStageTimer

logger = logging.getLogger(__name__)
_PATCHED = False


def apply_patch() -> None:
    global _PATCHED
    if _PATCHED:
        return
    _PATCHED = True
    original_handle_query = QueryService.handle_query

    def premium_direct_fallback_response(
        *,
        error: Exception,
        matter_id: str | None,
        original_question: str,
        response_language: str,
    ) -> QueryResponse:
        return QueryResponse(
            matter_id=matter_id,
            answer=(
                "抱歉，GPT-5.5 快速答复暂时不可用。请切换到默认法律核对模式，或联系律师人工确认。"
                if response_language == "zh"
                else "Sorry, the GPT-5.5 quick answer is temporarily unavailable. Please switch to the default legal-check mode, or contact the lawyer for manual confirmation."
            ),
            response_language="zh" if response_language == "zh" else "en",
            confidence="low",
            user_display_mode="general_with_warning",
            issue_type="premium_direct_answer",
            missing_facts=[],
            follow_up_questions=[],
            citations=[],
            compact_sources=[],
            escalate=True,
            next_action="suggest_consultation",
            retrieval_debug={
                "original_question": original_question,
                "effective_question": original_question,
                "premium_direct_answer": {
                    "used": False,
                    "error": str(error)[:500],
                    "error_type": error.__class__.__name__,
                    "fallback_to_slow_legal_pipeline": False,
                    "semantic_turn_router_skipped": True,
                    "answer_model_input": "lightweight_history_plus_latest_user_question",
                },
            },
        )

    def handle_premium_direct_query(self: QueryService, db: Any, payload: QueryRequest):
        original_question = payload.question
        response_language = self.language_service.detect_response_language(
            original_question,
            payload.response_language,
        )
        direct_payload = QueryRequest(
            **{
                **payload.model_dump(),
                "question": original_question,
                "response_language": response_language,
            }
        )
        matter_id: str | None = getattr(payload, "matter_id", None)

        try:
            matter = self._get_or_create_matter(db, direct_payload)
            matter_id = matter.id
            current_state = self.state_machine.hydrate_state(matter.metadata_json)
            premium_service = (
                getattr(self, "premium_direct_answer_service", None)
                or PremiumDirectAnswerService()
            )
            self.premium_direct_answer_service = premium_service
            response = premium_service.answer(
                payload=QueryRequest(**{**direct_payload.model_dump(), "matter_id": matter.id}),
                original_question=original_question,
                effective_question=original_question,
                response_language=response_language,
                matter_id=matter.id,
                semantic_turn_debug={
                    "skipped_full_semantic_turn_router": True,
                    "reason": "premium_direct_mode_uses_local_politics_filter_lightweight_history_and_latest_question",
                },
            )
            response.matter_id = matter.id

            state = current_state.model_copy(deep=True)
            state.latest_question = original_question
            state.last_contextualized_question = original_question
            state.issue_type = response.issue_type
            state.operation_type = "premium_direct_gpt55_high"
            state.next_action = response.next_action
            state.last_answer_type = "premium_direct_model_only"
            state.carried_intake_facts = dict(state.carried_intake_facts or {})
            state.carried_intake_facts["last_assistant_mode"] = "premium_direct_gpt55_high"
            state.carried_intake_facts["premium_direct_semantic_turn_skipped"] = True
            state = self.state_machine.append_turn_pair(
                state=state,
                user_question=original_question,
                effective_question=original_question,
                assistant_answer=response.answer,
                next_action=response.next_action,
                confidence=response.confidence,
            )
            self._update_matter_from_state(
                matter=matter,
                payload=direct_payload,
                state=state,
                effective_question=original_question,
            )
            db.commit()
            db.refresh(matter)
            try:
                self.review_trace_service.safe_record_answer_trace(
                    matter=matter,
                    payload=payload,
                    response=response,
                    state=state,
                    original_question=original_question,
                    effective_question=original_question,
                    stage_timing={
                        "engine": "premium_direct_gpt55_high",
                        "workflow": "local_politics_filter_lightweight_history_latest_question",
                    },
                    extra_debug={
                        "runtime_patch": "unified_context_runtime_patch",
                        "answer_trace_source": "premium_direct_gpt55_high",
                        "semantic_turn_router_skipped": True,
                    },
                )
            except Exception:  # pragma: no cover - ReviewTraceService should already be defensive.
                logger.exception(
                    "Premium direct answer trace recording failed; public response is unchanged."
                )
            return response
        except Exception as exc:  # pragma: no cover - production safety fallback
            logger.exception(
                "Premium direct path failed; returning direct-lane fallback without slow legal pipeline: %s",
                exc,
            )
            return premium_direct_fallback_response(
                error=exc,
                matter_id=matter_id,
                original_question=original_question,
                response_language=response_language,
            )

    def unified_handle_query(self: QueryService, db: Any, payload: QueryRequest):
        if payload.assistant_mode == "premium_direct_gpt55_high":
            logger.info(
                "Unified runtime selected premium direct path before semantic router; local politics filter and lightweight history are retained"
            )
            return handle_premium_direct_query(self, db, payload)

        original_question = payload.question
        language_context = self.language_service.prepare_turn(
            question=payload.question,
            requested_language=payload.response_language,
        )
        effective_payload = payload
        if (
            language_context.internal_question_en.strip() != payload.question.strip()
            or payload.response_language != language_context.response_language
        ):
            effective_payload = QueryRequest(
                **{
                    **payload.model_dump(),
                    "question": language_context.internal_question_en,
                    "response_language": language_context.response_language,
                }
            )

        try:
            matter = self._get_or_create_matter(db, effective_payload)
            current_state = self.state_machine.hydrate_state(matter.metadata_json)
            timing = _QueryStageTimer(
                request_id=f"unified-preflight-{int(time.time() * 1000)}"
            )
            timing.matter_id = matter.id
            timing.mark("language_context", response_language=language_context.response_language)
            timing.mark("state_load")

            pending_offer = (current_state.carried_intake_facts or {}).get("pending_offer")
            semantic_turn = self._analyze_semantic_turn(
                original_question=original_question,
                payload=effective_payload,
                current_state=current_state,
                pending_offer=pending_offer if isinstance(pending_offer, dict) else None,
                response_language=language_context.response_language,
            )
            timing.mark("semantic_turn", conversation_act=semantic_turn.conversation_act)

            if self._is_politics_sensitive_general_turn(
                semantic_turn=semantic_turn,
                raw_user_message=original_question,
            ):
                logger.info("Unified runtime selected politics-sensitive fast path before PFVD")
                return self._handle_politics_sensitive_fast_path(
                    db=db,
                    matter=matter,
                    payload=effective_payload,
                    original_question=original_question,
                    current_state=current_state,
                    response_language=language_context.response_language,
                    semantic_turn=semantic_turn,
                    timing=timing,
                )

            if self._should_use_general_topic_fast_path(semantic_turn=semantic_turn):
                logger.info("Unified runtime selected general-topic fast path before PFVD")
                return self._handle_general_topic_fast_path(
                    db=db,
                    matter=matter,
                    payload=effective_payload,
                    original_question=original_question,
                    current_state=current_state,
                    response_language=language_context.response_language,
                    semantic_turn=semantic_turn,
                    timing=timing,
                )

            memory_service = (
                getattr(self, "unified_conversation_memory_service", None)
                or ConversationMemoryService()
            )
            self.unified_conversation_memory_service = memory_service
            memory_packet = memory_service.build(
                matter=matter,
                current_state=current_state,
                latest_user_message_raw=original_question,
                latest_user_message_internal_en=effective_payload.question,
                frontend_messages=getattr(payload, "frontend_messages", []) or [],
            )

            service = (
                getattr(self, "proposal_first_verification_depth_answer_service", None)
                or ProposalFirstVerificationDepthAnswerService()
            )
            self.proposal_first_verification_depth_answer_service = service
            response = service.answer(
                db=db,
                payload=QueryRequest(**{**effective_payload.model_dump(), "matter_id": matter.id}),
                original_question=original_question,
                effective_question=effective_payload.question,
                memory_packet=memory_packet,
                response_language=language_context.response_language,
                matter_id=matter.id,
            )
            response.matter_id = matter.id

            state = current_state.model_copy(deep=True)
            state.latest_question = effective_payload.question
            state.last_contextualized_question = effective_payload.question
            state.issue_type = response.issue_type
            state.operation_type = "proposal_first_verification_depth"
            state.next_action = response.next_action
            state.last_answer_type = "specific_grounded"
            state.carried_intake_facts = dict(state.carried_intake_facts or {})
            pfvd = (response.retrieval_debug or {}).get(
                "proposal_first_verification_depth", {}
            )
            state.carried_intake_facts["last_verification_plan"] = pfvd.get(
                "verification_plan"
            )
            state = self.state_machine.append_turn_pair(
                state=state,
                user_question=effective_payload.question,
                effective_question=effective_payload.question,
                assistant_answer=response.answer,
                next_action=response.next_action,
                confidence=response.confidence,
            )
            self._update_matter_from_state(
                matter=matter,
                payload=effective_payload,
                state=state,
                effective_question=effective_payload.question,
            )
            db.commit()
            db.refresh(matter)
            try:
                self.review_trace_service.safe_record_answer_trace(
                    matter=matter,
                    payload=payload,
                    response=response,
                    state=state,
                    original_question=original_question,
                    effective_question=effective_payload.question,
                    stage_timing={
                        "engine": "proposal_first_verification_depth",
                        "workflow": "proposal_first_then_verification_depth",
                    },
                    extra_debug={
                        "runtime_patch": "unified_context_runtime_patch",
                        "answer_trace_source": "proposal_first_verification_depth",
                    },
                )
            except Exception:  # pragma: no cover - ReviewTraceService should already be defensive.
                logger.exception(
                    "Proposal-first answer trace recording failed; public response is unchanged."
                )
            return response
        except Exception as exc:  # pragma: no cover - production safety fallback
            fallback_started = time.perf_counter()
            logger.exception(
                "Proposal-first verification-depth path failed; falling back to original handler: %s",
                exc,
            )
            response = original_handle_query(self, db, payload)
            fallback_ms = round((time.perf_counter() - fallback_started) * 1000, 2)
            debug = dict(response.retrieval_debug or {})
            debug.setdefault("proposal_first_verification_depth", {})
            debug["proposal_first_verification_depth"].update(
                {
                    "used": False,
                    "fallback_to_original_handler": True,
                    "error": str(exc)[:500],
                    "error_type": exc.__class__.__name__,
                    "fallback_original_handler_ms": fallback_ms,
                    "warning": (
                        "PFVD crashed before completion. The public answer came from the original "
                        "handler and must not be used to evaluate the scope/live-retrieval patch."
                    ),
                }
            )
            response.retrieval_debug = debug
            return response

    QueryService.handle_query = unified_handle_query
    logger.info("Proposal-first verification-depth runtime patch applied")


apply_patch()
