from __future__ import annotations

import logging
import os
import re
import time
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryRequest, QueryResponse
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.openai_responses_adapter import (
    ResponsesStreamAccumulator,
    consume_responses_stream,
)
from app.services.evidence_salvage_finalizer import EvidenceSalvageFinalizer

logger = logging.getLogger(__name__)

HIGH_RISK_TERMS = (
    "refusal",
    "refused",
    "cancel",
    "cancellation",
    "section 48",
    "s48",
    "bridging visa e",
    "bve",
    "unlawful",
    "overstay",
    "detention",
    "character",
    "501",
    "health waiver",
    "deadline",
    "appeal",
    "review",
    "aat",
    "art",
    "tribunal",
    "ministerial intervention",
    "拒签",
    "拒绝",
    "复审",
    "行政复审",
    "签证被拒",
)

REFERENCE_HEADING_MARKERS = (
    "reference",
    "references",
    "source",
    "sources",
    "sources to verify",
    "参考",
    "来源",
    "核对来源",
)

# These broad mutable-fact indicators only control timeout-degraded answer
# policy. They are not eligibility or research-routing rules.
CURRENT_FACT_MARKERS = (
    "current", "currently", "latest", "today", "as of", "up to date", "recent",
    "fee", "fees", "charge", "charges", "cost", "amount", "threshold",
    "processing time", "processing times", "waiting time", "deadline", "deadlines",
    "expiry", "expires", "requirement", "requirements", "condition", "conditions",
    "policy", "policies", "有效期", "费用", "金额", "门槛", "处理时间", "截止日期",
    "要求", "条件", "政策",
)


class PremiumDirectAnswerService:
    """Agentic direct-answer lane for the UI's premium LLM option.

    Contract for this lane:
    - no Schedule/PFVD/RAG/helper prompt chain;
    - no full semantic-turn router;
    - recent chat history is preserved for follow-up continuity;
    - the authoritative deterministic political gate runs at FastAPI ingress
      before this service is constructed;
    - the configured Premium primary model is attempted first, then the
      configured fallback model;
    - the Responses API web_search tool is enabled for agentic live research;
    - actual web-search sources are captured without an artificial cap;
    - research attempts share one non-resetting research deadline inside the
      absolute lane deadline;
    - terminal synthesis has its own protected, tool-free budget and uses zero
      SDK retries.
    """

    def __init__(self) -> None:
        self.settings = get_settings()

        self.primary_model = os.getenv(
            "PREMIUM_DIRECT_PRIMARY_MODEL",
            os.getenv("PREMIUM_DIRECT_MODEL", "gpt-5.6-sol"),
        )
        self.primary_reasoning_effort = os.getenv(
            "PREMIUM_DIRECT_PRIMARY_REASONING_EFFORT",
            os.getenv("PREMIUM_DIRECT_REASONING_EFFORT", "medium"),
        ).strip()
        self.primary_timeout_seconds = float(
            os.getenv(
                "PREMIUM_DIRECT_PRIMARY_TIMEOUT_SECONDS",
                os.getenv("PREMIUM_DIRECT_TIMEOUT_SECONDS", "60"),
            )
        )
        configured_primary_retries = int(
            os.getenv(
                "PREMIUM_DIRECT_PRIMARY_MAX_RETRIES",
                os.getenv("PREMIUM_DIRECT_OPENAI_MAX_RETRIES", "0"),
            )
        )
        if configured_primary_retries:
            logger.warning(
                "Premium Direct primary retries are fixed at zero; configured value=%s ignored",
                configured_primary_retries,
            )
        self.primary_max_retries = 0

        self.fallback_model = os.getenv(
            "PREMIUM_DIRECT_FALLBACK_MODEL",
            "gpt-5.6-luna",
        )
        self.fallback_reasoning_effort = os.getenv(
            "PREMIUM_DIRECT_FALLBACK_REASONING_EFFORT",
            "medium",
        ).strip()
        self.fallback_timeout_seconds = float(
            os.getenv("PREMIUM_DIRECT_FALLBACK_TIMEOUT_SECONDS", "55")
        )
        configured_fallback_retries = int(
            os.getenv("PREMIUM_DIRECT_FALLBACK_MAX_RETRIES", "0")
        )
        if configured_fallback_retries:
            logger.warning(
                "Premium Direct fallback retries are fixed at zero; configured value=%s ignored",
                configured_fallback_retries,
            )
        self.fallback_max_retries = 0

        # Premium research has a non-resetting stage budget inside the absolute
        # 90-second lane. Both values remain overrideable for short deterministic
        # tests and controlled local smoke tests.
        self.lane_budget_ms = int(
            os.getenv(
                "PREMIUM_DIRECT_LANE_BUDGET_MS",
                str(self.settings.premium_turn_deadline_ms),
            )
        )
        self.research_stage_target_ms = int(
            os.getenv(
                "PREMIUM_DIRECT_RESEARCH_TARGET_MS",
                str(self.settings.premium_answer_research_target_ms),
            )
        )
        self.terminal_model = os.getenv(
            "PREMIUM_DIRECT_TERMINAL_MODEL",
            self.fallback_model,
        )
        self.terminal_reasoning_effort = os.getenv(
            "PREMIUM_DIRECT_TERMINAL_REASONING_EFFORT",
            "low",
        ).strip()
        self.terminal_synthesis_target_ms = int(
            os.getenv(
                "PREMIUM_DIRECT_TERMINAL_TARGET_MS",
                "20000",
            )
        )
        self.final_response_reserve_ms = int(
            os.getenv(
                "PREMIUM_DIRECT_FINAL_RESPONSE_RESERVE_MS",
                str(getattr(self.settings, "final_response_reserve_ms", 3000)),
            )
        )
        self.terminal_min_start_budget_ms = int(
            os.getenv(
                "PREMIUM_DIRECT_TERMINAL_MIN_START_BUDGET_MS",
                str(getattr(self.settings, "terminal_synthesis_min_start_budget_ms", 5000)),
            )
        )
        self.minimum_fallback_budget_ms = int(
            os.getenv(
                "PREMIUM_DIRECT_FALLBACK_MIN_START_BUDGET_MS",
                os.getenv("PREMIUM_DIRECT_MIN_FALLBACK_BUDGET_MS", "10000"),
            )
        )
        self.max_tool_calls = self._env_int(
            "PREMIUM_DIRECT_MAX_TOOL_CALLS",
            default=2,
            minimum=1,
            maximum=10,
        )

        self.web_search_enabled = self._env_bool(
            "PREMIUM_DIRECT_WEB_SEARCH_ENABLED",
            default=True,
        )
        self.web_search_required = self._env_bool(
            "PREMIUM_DIRECT_WEB_SEARCH_REQUIRED",
            default=False,
        )
        self.web_search_context_size = (
            os.getenv("PREMIUM_DIRECT_WEB_SEARCH_CONTEXT_SIZE", "medium").strip().lower()
            or "medium"
        )
        if self.web_search_context_size not in {"low", "medium", "high"}:
            logger.warning(
                "Invalid PREMIUM_DIRECT_WEB_SEARCH_CONTEXT_SIZE=%s; using medium",
                self.web_search_context_size,
            )
            self.web_search_context_size = "medium"

        self.service_tier = os.getenv("PREMIUM_DIRECT_SERVICE_TIER", "").strip()
        self.max_history_turns = int(os.getenv("PREMIUM_DIRECT_MAX_HISTORY_TURNS", "8"))
        self.max_history_chars_per_turn = int(
            os.getenv("PREMIUM_DIRECT_MAX_HISTORY_CHARS_PER_TURN", "900")
        )
        self.max_history_total_chars = int(
            os.getenv("PREMIUM_DIRECT_MAX_HISTORY_TOTAL_CHARS", "6000")
        )

    @staticmethod
    def _env_bool(name: str, *, default: bool) -> bool:
        raw = os.getenv(name)
        if raw is None:
            return default
        return raw.strip().lower() in {"1", "true", "yes", "on"}

    @staticmethod
    def _env_int(name: str, *, default: int, minimum: int, maximum: int) -> int:
        raw = os.getenv(name)
        try:
            value = default if raw is None else int(raw)
        except ValueError:
            logger.warning("Invalid %s=%r; using %s", name, raw, default)
            return default
        if not minimum <= value <= maximum:
            logger.warning(
                "Invalid %s=%s; expected %s..%s, using %s",
                name,
                value,
                minimum,
                maximum,
                default,
            )
            return default
        return value

    def _client(self, *, timeout_seconds: float, max_retries: int) -> OpenAI:
        if not self.settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
        return OpenAI(
            api_key=self.settings.openai_api_key,
            max_retries=max_retries,
            timeout=timeout_seconds,
        )

    def answer(
        self,
        *,
        payload: QueryRequest,
        original_question: str,
        effective_question: str,
        response_language: str,
        matter_id: str | None,
        semantic_turn_debug: dict[str, Any] | None = None,
    ) -> QueryResponse:
        is_zh = response_language == "zh"
        question_for_model = original_question.strip() or effective_question.strip()

        if not question_for_model:
            return self._empty_question_response(is_zh=is_zh, matter_id=matter_id)

        # Start the direct lane budget before history/prompt assembly and carry
        # this same monotonic deadline through both provider attempts.
        lane_deadline = AbsoluteTurnDeadline(
            started_at=time.perf_counter(),
            turn_deadline_ms=self.lane_budget_ms,
        )

        history_text = self._history_text(
            getattr(payload, "frontend_messages", []) or [],
            latest_question=question_for_model,
        )
        model_input = self._model_input(
            history_text=history_text,
            latest_question=question_for_model,
            is_zh=is_zh,
        )
        instructions = self._model_instructions(is_zh=is_zh)
        high_risk = self._looks_high_risk(original_question) or self._looks_high_risk(
            effective_question
        )

        answer_text, web_sources, model_debug = self._answer_with_fallback(
            model_input=model_input,
            instructions=instructions,
            deadline=lane_deadline,
            current_fact_request=self._is_current_fact_request(question_for_model),
        )

        salvage = None
        if (
            not answer_text
            and model_debug.get("terminal_recovery_triggered")
            and model_debug.get("completion_status") == "safe_failure"
        ):
            salvage = EvidenceSalvageFinalizer.build(
                is_zh=is_zh,
                web_sources=web_sources,
                citation_count=int(model_debug.get("recovered_citation_count", 0) or 0),
            )
            if salvage is not None:
                model_debug.update({
                    **salvage.telemetry,
                    "completion_status": "evidence_salvage",
                })
                answer_text = salvage.answer
                # The finalizer has already rendered the bounded recovered
                # source list; do not append the full provider list again.
                web_sources = []

        research_status = model_debug.get(
            "research_status",
            "complete" if self.web_search_enabled else "not_required",
        )
        if not answer_text:
            answer_text = self._safe_failure_text(
                is_zh=is_zh,
                current_fact_unverified=bool(
                    model_debug.get("terminal_output_suppressed_due_to_unverified_current_fact")
                ),
            )

        if web_sources:
            answer_text = self._append_actual_web_sources(
                answer_text=answer_text,
                sources=web_sources,
                is_zh=is_zh,
            )
            compact_sources = self._format_compact_sources(web_sources)
        elif salvage is not None:
            compact_sources = salvage.compact_sources
        elif model_debug.get("terminal_recovery_triggered"):
            # Terminal synthesis cannot introduce model-authored URLs or
            # references. Only genuine sources returned by a research response
            # are ever rendered.
            compact_sources = []
        else:
            compact_sources = self._extract_reference_lines(answer_text)

        answer_text = self._with_research_notice(
            answer_text,
            is_zh=is_zh,
            live_web_search_used=bool(web_sources) or salvage is not None,
        )

        return QueryResponse(
            matter_id=matter_id,
            answer=answer_text,
            response_language="zh" if is_zh else "en",
            confidence="medium" if not high_risk else "low",
            user_display_mode="general_with_warning",
            issue_type="premium_direct_answer",
            missing_facts=[],
            follow_up_questions=[],
            citations=[],
            compact_sources=compact_sources,
            escalate=high_risk or salvage is not None,
            next_action=(
                "suggest_consultation"
                if high_risk or salvage is not None
                else "answer"
            ),
            retrieval_debug={
                "original_question": original_question,
                "effective_question": effective_question,
                "semantic_turn_analysis": semantic_turn_debug or {},
                "premium_direct_answer": {
                    "used": True,
                    "source_verified": False,
                    "live_web_search_enabled": self.web_search_enabled,
                    "live_web_search_required": self.web_search_required,
                    "live_web_search_used": bool(web_sources),
                    "web_search_context_size": self.web_search_context_size,
                    "references_are_model_provided": not bool(web_sources),
                    "reference_extraction": (
                        "openai_responses_web_search_sources_without_cap"
                        if web_sources
                        else "from_direct_llm_answer_body_without_cap"
                    ),
                    "reference_count": len(compact_sources),
                    "reference_provenance": (
                        "request_scoped_native_web"
                        if web_sources
                        else "model_text_extracted"
                    ),
                    "politics_filter_preserved": True,
                    "politics_filter_type": "local_lightweight_gate",
                    "answer_model_input": (
                        "lightweight_history_plus_latest_user_question_with_agentic_web_research_instruction"
                    ),
                    "answer_model_input_char_count": len(model_input),
                    "answer_model_instructions_char_count": len(instructions),
                    "latest_question_char_count": len(question_for_model),
                    "history_char_count": len(history_text),
                    "frontend_history_sent_to_answer_model": bool(history_text),
                    "system_prompt_sent_to_answer_model": False,
                    "max_history_turns": self.max_history_turns,
                    "max_history_chars_per_turn": self.max_history_chars_per_turn,
                    "max_history_total_chars": self.max_history_total_chars,
                    "high_risk_detected": high_risk,
                    "max_tool_calls": self.max_tool_calls,
                    "premium_lane_budget_ms": self.lane_budget_ms,
                    "absolute_deadline_ms": self.lane_budget_ms,
                    "research_stage_target_ms": self.research_stage_target_ms,
                    "final_response_reserve_ms": self.final_response_reserve_ms,
                    "research_status": research_status,
                    **model_debug,
                    "skipped_pipeline": [
                        "semantic_turn_router",
                        "proposal_first_verification_depth",
                        "schedule2_ranked_candidate_map",
                        "local_rag_retrieval",
                        "local_citation_packaging",
                        "customer_answer_plan_helper_chain",
                    ],
                },
            },
            research_status=research_status,
        )

    def _answer_with_fallback(
        self,
        *,
        model_input: str,
        instructions: str = "",
        deadline: AbsoluteTurnDeadline | None = None,
        current_fact_request: bool = False,
    ) -> tuple[str, list[dict[str, str]], dict[str, Any]]:
        deadline = deadline or AbsoluteTurnDeadline(
            started_at=time.perf_counter(),
            turn_deadline_ms=self.lane_budget_ms,
        )
        research_remaining_ms = deadline.stage_remaining_ms(self.research_stage_target_ms)
        primary_budget_ms = min(
            max(0.0, self.primary_timeout_seconds * 1000.0),
            deadline.remaining_ms(),
            research_remaining_ms,
        )
        primary_debug = {
            "primary_model": self.primary_model,
            "primary_reasoning_effort": self.primary_reasoning_effort or None,
            "primary_timeout_seconds": self.primary_timeout_seconds,
            "primary_max_retries": self.primary_max_retries,
            "fallback_model": self.fallback_model,
            "fallback_reasoning_effort": self.fallback_reasoning_effort or None,
            "fallback_timeout_seconds": self.fallback_timeout_seconds,
            "fallback_max_retries": self.fallback_max_retries,
            "service_tier": self.service_tier or None,
            "premium_lane_budget_ms": self.lane_budget_ms,
            "absolute_deadline_ms": self.lane_budget_ms,
            "research_stage_target_ms": self.research_stage_target_ms,
            "research_stage_remaining_before_ms": research_remaining_ms,
            "final_response_reserve_ms": self.final_response_reserve_ms,
            "primary_budget_ms": primary_budget_ms,
            "fallback_budget_ms": 0.0,
            "fallback_min_start_budget_ms": self.minimum_fallback_budget_ms,
            "fallback_skipped_due_to_budget": False,
            "terminal_recovery_triggered": False,
            "terminal_web_search_enabled": False,
            "current_fact_request": current_fact_request,
        }
        verified_sources: list[dict[str, str]] = []
        partial_research_text = ""

        if primary_budget_ms <= 0:
            return self._terminal_synthesis(
                model_input=model_input,
                deadline=deadline,
                base_debug={
                    **primary_debug,
                    "primary_failed": True,
                    "primary_error_type": "PremiumResearchBudgetExhausted",
                    "fallback_skipped_due_to_budget": True,
                },
                verified_sources=verified_sources,
                current_fact_request=current_fact_request,
            )

        logger.info(
            "premium_direct_primary_request model=%s reasoning_effort=%s timeout_seconds=%s "
            "max_retries=%s web_search=%s search_context_size=%s input_chars=%s "
            "fallback_model=%s research_target_ms=%s",
            self.primary_model,
            self.primary_reasoning_effort or None,
            primary_budget_ms / 1000.0,
            self.primary_max_retries,
            self.web_search_enabled,
            self.web_search_context_size,
            len(model_input),
            self.fallback_model,
            self.research_stage_target_ms,
        )

        try:
            primary_text, primary_sources, primary_call_debug = self._call_model(
                model=self.primary_model,
                reasoning_effort=self.primary_reasoning_effort,
                timeout_seconds=primary_budget_ms / 1000.0,
                max_retries=self.primary_max_retries,
                model_input=model_input,
                instructions=instructions,
                deadline=deadline,
            )
            verified_sources = self._merge_sources(verified_sources, primary_sources)
            if primary_call_debug.get("provider_status", "ok") == "ok" and primary_text:
                return primary_text, primary_sources, {
                    **primary_debug,
                    **primary_call_debug,
                    "serving_model": self.primary_model,
                    "used_fallback_model": False,
                    "primary_failed": False,
                    "research_status": "complete" if self.web_search_enabled else "not_required",
                    "completion_status": "complete",
                }
            if primary_text:
                partial_research_text = primary_text
            raise RuntimeError(
                "primary model stream did not complete" if primary_text
                else "primary model returned empty output_text"
            )
        except Exception as exc:
            logger.warning(
                "premium_direct_primary_failed; evaluating fallback model=%s "
                "error_type=%s error=%s",
                self.fallback_model,
                exc.__class__.__name__,
                str(exc)[:500],
            )
            primary_error_debug = {
                "primary_failed": True,
                "primary_error_type": exc.__class__.__name__,
                "primary_error": str(exc)[:1000],
            }

        fallback_research_remaining_ms = deadline.stage_remaining_ms(
            self.research_stage_target_ms
        )
        fallback_budget_ms = min(
            max(0.0, self.fallback_timeout_seconds * 1000.0),
            deadline.remaining_ms(),
            fallback_research_remaining_ms,
        )
        if fallback_budget_ms < self.minimum_fallback_budget_ms:
            logger.info(
                "premium_direct_fallback_skipped_due_to_research_budget remaining_ms=%s",
                fallback_budget_ms,
            )
            return self._terminal_synthesis(
                model_input=model_input,
                deadline=deadline,
                base_debug={
                    **primary_debug,
                    **primary_error_debug,
                    "fallback_budget_ms": fallback_budget_ms,
                    "fallback_skipped_due_to_budget": True,
                    "fallback_skipped_due_to_research_budget": True,
                },
                verified_sources=verified_sources,
                partial_research_text=partial_research_text,
                current_fact_request=current_fact_request,
            )

        primary_debug["fallback_budget_ms"] = fallback_budget_ms
        logger.info(
            "premium_direct_fallback_request model=%s reasoning_effort=%s "
            "timeout_seconds=%s max_retries=%s web_search=%s "
            "search_context_size=%s input_chars=%s",
            self.fallback_model,
            self.fallback_reasoning_effort or None,
            fallback_budget_ms / 1000.0,
            self.fallback_max_retries,
            self.web_search_enabled,
            self.web_search_context_size,
            len(model_input),
        )

        try:
            fallback_text, fallback_sources, fallback_call_debug = self._call_model(
                model=self.fallback_model,
                reasoning_effort=self.fallback_reasoning_effort,
                timeout_seconds=fallback_budget_ms / 1000.0,
                max_retries=self.fallback_max_retries,
                model_input=model_input,
                instructions=instructions,
                deadline=deadline,
            )
            verified_sources = self._merge_sources(verified_sources, fallback_sources)
            if fallback_call_debug.get("provider_status", "ok") == "ok" and fallback_text:
                return fallback_text, fallback_sources, {
                    **primary_debug,
                    **primary_error_debug,
                    **fallback_call_debug,
                    "serving_model": self.fallback_model,
                    "used_fallback_model": True,
                    "research_status": "complete" if self.web_search_enabled else "not_required",
                    "completion_status": "complete",
                }
            if fallback_text:
                partial_research_text = self._merge_partial_text(
                    partial_research_text,
                    fallback_text,
                )
            raise RuntimeError(
                "fallback model stream did not complete" if fallback_text
                else "fallback model returned empty output_text"
            )
        except Exception as exc:
            logger.warning(
                "premium_direct_fallback_failed error_type=%s error=%s",
                exc.__class__.__name__,
                str(exc)[:500],
            )
            return self._terminal_synthesis(
                model_input=model_input,
                deadline=deadline,
                base_debug={
                    **primary_debug,
                    **primary_error_debug,
                    **(fallback_call_debug if "fallback_call_debug" in locals() else {}),
                    "fallback_budget_ms": fallback_budget_ms,
                    "fallback_failed": True,
                    "fallback_error_type": exc.__class__.__name__,
                    "fallback_error": str(exc)[:1000],
                },
                verified_sources=verified_sources,
                partial_research_text=partial_research_text,
                current_fact_request=current_fact_request,
            )

    def _terminal_synthesis(
        self,
        *,
        model_input: str,
        deadline: AbsoluteTurnDeadline,
        base_debug: dict[str, Any],
        verified_sources: list[dict[str, str]] | None = None,
        partial_research_text: str = "",
        current_fact_request: bool = False,
    ) -> tuple[str, list[dict[str, str]], dict[str, Any]]:
        verified_sources = verified_sources or []
        remaining_before_ms = deadline.remaining_ms()
        usable_budget_ms = max(
            0.0,
            remaining_before_ms - float(self.final_response_reserve_ms),
        )
        debug = {
            **base_debug,
            "terminal_recovery_triggered": True,
            "terminal_recovery_reason": "research_timeout_or_exhaustion",
            "interrupted_response_continuation_skipped": True,
            "terminal_fresh_request": True,
            "terminal_model": self.terminal_model,
            "terminal_web_search_enabled": False,
            "terminal_remaining_budget_before_ms": remaining_before_ms,
            "terminal_timeout_allocated_ms": 0.0,
            "terminal_remaining_budget_after_ms": remaining_before_ms,
            "research_status": "incomplete",
            "research_incomplete": True,
            "verified_source_count": len(verified_sources),
            "current_fact_request": current_fact_request,
            "recovered_partial_text_chars": len(partial_research_text),
            "recovered_source_count": len(verified_sources),
            "recovered_citation_count": int(
                base_debug.get("stream_citation_count", 0) or 0
            ),
        }
        if usable_budget_ms < self.terminal_min_start_budget_ms:
            debug.update({
                "completion_status": "safe_failure",
                "terminal_skipped_due_to_budget": True,
            })
            return "", verified_sources, debug

        terminal_timeout_ms = min(
            float(self.terminal_synthesis_target_ms),
            usable_budget_ms,
        )
        debug["terminal_timeout_allocated_ms"] = terminal_timeout_ms
        terminal_instructions = self._terminal_instructions(
            current_fact_request=current_fact_request,
            verified_source_count=len(verified_sources),
            verified_sources=verified_sources,
        )
        terminal_model_input = self._terminal_model_input(
            model_input=model_input,
            partial_research_text=partial_research_text,
        )
        logger.info(
            "premium_direct_terminal_request model=%s timeout_ms=%s "
            "web_search=false remaining_before_ms=%s reserve_ms=%s",
            self.terminal_model,
            terminal_timeout_ms,
            remaining_before_ms,
            self.final_response_reserve_ms,
        )
        try:
            terminal_text, _ignored_sources, terminal_call_debug = self._call_model(
                model=self.terminal_model,
                reasoning_effort=self.terminal_reasoning_effort,
                timeout_seconds=terminal_timeout_ms / 1000.0,
                max_retries=0,
                model_input=terminal_model_input,
                instructions=terminal_instructions,
                deadline=deadline,
                web_search_enabled=False,
            )
            debug.update(terminal_call_debug)
            debug["research_stream_source_count"] = len(verified_sources)
            debug["terminal_stream_source_count"] = terminal_call_debug.get(
                "stream_source_count", 0
            )
            debug["stream_source_count"] = max(
                int(terminal_call_debug.get("stream_source_count", 0) or 0),
                len(verified_sources),
            )
            debug["terminal_remaining_budget_after_ms"] = deadline.remaining_ms()
            if terminal_call_debug.get("provider_status", "ok") != "ok":
                raise RuntimeError("terminal synthesis stream did not complete")
            if not terminal_text:
                raise RuntimeError("terminal synthesis returned empty output_text")
            if current_fact_request and not verified_sources:
                # Model confidence cannot turn memory into verification. Keep
                # this policy deterministic even if terminal prose is overly
                # certain or claims to be current/reliable.
                debug.update({
                    "completion_status": "safe_failure",
                    "terminal_output_suppressed_due_to_unverified_current_fact": True,
                })
                return "", verified_sources, debug
            debug["completion_status"] = "partial_timeout"
            return terminal_text, verified_sources, debug
        except Exception as exc:
            logger.warning(
                "premium_direct_terminal_failed error_type=%s error=%s",
                exc.__class__.__name__,
                str(exc)[:500],
            )
            debug.update({
                "completion_status": "safe_failure",
                "terminal_failed": True,
                "terminal_error_type": exc.__class__.__name__,
                "terminal_error": str(exc)[:1000],
                "terminal_remaining_budget_after_ms": deadline.remaining_ms(),
            })
            return "", verified_sources, debug

    def _terminal_instructions(
        self,
        *,
        current_fact_request: bool = False,
        verified_source_count: int = 0,
        verified_sources: list[dict[str, str]] | None = None,
    ) -> str:
        source_lines = "\n".join(
            f"- {source.get('title') or 'Source'} — {source.get('url')}"
            for source in (verified_sources or [])
            if source.get("url")
        )
        if current_fact_request and verified_source_count == 0:
            mutable_fact_rule = (
                "The user requested a current or mutable fact. Do not state an exact figure, date, threshold, "
                "requirement, condition, processing time, or policy setting from memory or describe it as "
                "current, latest, reliable, or verified. Explain that the requested current fact could not be "
                "verified within the available research time."
            )
        elif current_fact_request:
            mutable_fact_rule = (
                "Use current or mutable facts only when supported by the genuine material already available; do "
                "not fill gaps from memory."
            )
        else:
            mutable_fact_rule = (
                "Stable/general information may be useful, but do not introduce unsupported current claims."
            )
        return (
            "Research was incomplete because the protected research budget ended or a research provider failed. "
            "Do not use web search or perform any further research.\n"
            "research_incomplete=true\n"
            f"verified_source_count={verified_source_count}\n"
            f"genuine_source_metadata_already_returned:\n{source_lines or '(none)'}\n"
            f"current_fact_request={str(current_fact_request).lower()}\n"
            f"{mutable_fact_rule}\n"
            "Use only the original question, bounded conversation context, and genuinely returned material "
            "already present. Give the best useful best-effort answer possible, state uncertainty where "
            "verification is incomplete, and do not fabricate citations or URLs."
        )

    @staticmethod
    def _merge_partial_text(existing: str, additional: str) -> str:
        if not existing:
            return additional
        if not additional or additional == existing:
            return existing
        return f"{existing}\n\n{additional}"

    @staticmethod
    def _terminal_model_input(*, model_input: str, partial_research_text: str) -> str:
        if not partial_research_text:
            return model_input
        return (
            f"{model_input}\n\n"
            "Unverified partial provider research notes (context only; not evidence, not a citation, "
            "and not permission to state a current fact without genuine supporting material):\n"
            f"{partial_research_text}"
        )

    @staticmethod
    def _safe_failure_text(
        *,
        is_zh: bool,
        current_fact_unverified: bool = False,
    ) -> str:
        if current_fact_unverified:
            return (
                "我未能在可用时间内核实你所询问的当前或可变信息，因此不会把未经核实的金额、日期、门槛或要求当作最新事实提供。请重试或缩小问题范围，并核对相关官方来源；如需结合个人情况判断，也可以安排律师咨询。"
                if is_zh
                else "I couldn't verify the current or changeable fact you asked about within the available research time, so I won't present an unverified fee, date, threshold, requirement, or policy setting as current. Please retry or narrow the question, check the relevant official source, or arrange a lawyer consultation."
            )
        return (
            "我未能在可用时间内完成研究，因此没有足够的已核实材料给出完整答复。你可以重试、缩小问题范围，"
            "或安排律师咨询。"
            if is_zh
            else "I couldn't complete the research within the available time, so I don't have enough verified material to give you a complete answer. You can retry the question, narrow its scope, or arrange a lawyer consultation."
        )

    @staticmethod
    def _is_current_fact_request(question: str) -> bool:
        normalized = re.sub(r"\s+", " ", question.lower()).strip()
        return any(marker in normalized for marker in CURRENT_FACT_MARKERS)

    @staticmethod
    def _merge_sources(
        existing: list[dict[str, str]],
        additional: list[dict[str, str]],
    ) -> list[dict[str, str]]:
        merged = list(existing)
        seen = {str(source.get("url") or "").rstrip("/").lower() for source in merged}
        for source in additional:
            url = str(source.get("url") or "").strip()
            key = url.rstrip("/").lower()
            if url and key not in seen:
                merged.append(source)
                seen.add(key)
        return merged

    def _call_model(
        self,
        *,
        model: str,
        reasoning_effort: str,
        timeout_seconds: float,
        max_retries: int,
        model_input: str,
        instructions: str = "",
        deadline: AbsoluteTurnDeadline | None = None,
        web_search_enabled: bool | None = None,
    ) -> tuple[str, list[dict[str, str]], dict[str, Any]]:
        def create_response(request_kwargs: dict[str, Any]) -> Any:
            request_timeout_seconds = timeout_seconds
            if deadline is not None:
                remaining_ms = deadline.remaining_ms()
                if remaining_ms <= 0:
                    raise TimeoutError("Premium Direct lane deadline exhausted")
                request_timeout_seconds = min(timeout_seconds, remaining_ms / 1000.0)
            client = self._client(
                timeout_seconds=request_timeout_seconds,
                max_retries=max_retries,
            )
            return client.responses.create(**request_kwargs, stream=True)

        def consume_response(
            response: Any,
        ) -> tuple[str, list[dict[str, str]], dict[str, Any]]:
            if self._is_stream_iterable(response):
                allocated_timeout_seconds = max(0.0, timeout_seconds)
                if deadline is not None:
                    allocated_timeout_seconds = min(
                        allocated_timeout_seconds,
                        max(0.0, deadline.remaining_ms() / 1000.0),
                    )
                accumulator = consume_responses_stream(
                    response,
                    allocated_timeout_seconds=allocated_timeout_seconds,
                )
            else:
                accumulator = ResponsesStreamAccumulator()
                accumulator.consume_response(response)
            answer_text = "".join(accumulator.text_parts).strip()
            web_sources = self._stream_sources(accumulator.materialized_sources())
            return answer_text, web_sources, {
                "response_id": accumulator.response_id or None,
                "provider_status": accumulator.status,
                "stream_partial_available": accumulator.partial,
                "stream_partial_text_chars": len(answer_text) if accumulator.partial else 0,
                "stream_source_count": len(web_sources),
                "stream_citation_count": len(accumulator.citation_annotations),
                "stream_completed_function_call": bool(
                    accumulator.completed_function_calls
                ),
                "stream_completed_output_item_count": accumulator.completed_output_item_count,
                "stream_timeout_after_partial": (
                    accumulator.status == "timeout" and accumulator.partial
                ),
                "stream_error": accumulator.stream_error,
            }

        request_kwargs: dict[str, Any] = {
            "model": model,
            "input": model_input,
        }
        if instructions:
            request_kwargs["instructions"] = instructions

        effort = (reasoning_effort or "").strip()
        if effort and effort.lower() not in {"none", "off", "false", "0"}:
            request_kwargs["reasoning"] = {"effort": effort}

        if self.service_tier:
            request_kwargs["service_tier"] = self.service_tier

        effective_web_search_enabled = (
            self.web_search_enabled if web_search_enabled is None else web_search_enabled
        )
        effective_web_search_required = (
            self.web_search_required if effective_web_search_enabled else False
        )
        search_mode = "disabled"
        if effective_web_search_enabled:
            search_mode = "web_search"
            request_kwargs.update(
                {
                    "tools": [
                        {
                            "type": "web_search",
                            "search_context_size": self.web_search_context_size,
                        }
                    ],
                    "tool_choice": "required" if effective_web_search_required else "auto",
                    "max_tool_calls": self.max_tool_calls,
                    "include": [
                        "web_search_call.action.sources",
                        "web_search_call.results",
                    ],
                }
            )

        try:
            response = create_response(request_kwargs)
        except TypeError as exc:
            if not effective_web_search_enabled:
                raise
            logger.warning(
                "premium_direct_web_search_modern_sdk_type_error; "
                "trying legacy web_search_preview model=%s error=%s",
                model,
                str(exc)[:300],
            )
            legacy_kwargs = dict(request_kwargs)
            legacy_kwargs.pop("include", None)
            legacy_kwargs["tools"] = [
                {
                    "type": "web_search_preview",
                    "search_context_size": self.web_search_context_size,
                }
            ]
            search_mode = "web_search_preview"
            try:
                response = create_response(legacy_kwargs)
            except TypeError:
                if effective_web_search_required:
                    raise
                logger.warning(
                    "premium_direct_web_search_unavailable; using closed-book request model=%s",
                    model,
                )
                closed_book_kwargs = dict(request_kwargs)
                closed_book_kwargs.pop("include", None)
                closed_book_kwargs.pop("tools", None)
                closed_book_kwargs.pop("tool_choice", None)
                search_mode = "closed_book_after_search_tool_unavailable"
                response = create_response(closed_book_kwargs)

        answer_text, web_sources, stream_debug = consume_response(response)
        return answer_text, web_sources, {
            **stream_debug,
            "web_search_request_mode": search_mode,
            "web_search_source_count": len(web_sources),
            "web_search_returned_sources": bool(web_sources),
        }

    @staticmethod
    def _is_stream_iterable(response: Any) -> bool:
        return (
            not isinstance(response, (dict, list, tuple))
            and hasattr(response, "__iter__")
            and not hasattr(response, "output_text")
        )

    @staticmethod
    def _is_timeout_exception(exc: BaseException) -> bool:
        return isinstance(exc, TimeoutError) or "timeout" in exc.__class__.__name__.lower()

    @staticmethod
    def _stream_sources(raw_sources: list[dict[str, Any]]) -> list[dict[str, str]]:
        sources: list[dict[str, str]] = []
        seen: set[str] = set()
        for raw in raw_sources:
            url = str(raw.get("url") or "").strip()
            if not url:
                continue
            key = url.rstrip("/").lower()
            if key in seen:
                continue
            seen.add(key)
            sources.append({
                "title": str(raw.get("title") or raw.get("name") or url).strip(),
                "url": url,
            })
        return sources

    def _history_text(
        self,
        frontend_messages: list[dict[str, Any]],
        *,
        latest_question: str = "",
    ) -> str:
        rows: list[str] = []
        total_chars = 0
        latest_history_item_seen = False

        for item in reversed(frontend_messages):
            if len(rows) >= self.max_history_turns:
                break
            if not isinstance(item, dict):
                continue

            role = str(item.get("role") or "user").strip().lower()
            if role not in {"user", "assistant"}:
                continue

            text = str(item.get("text") or "").strip()
            if not text:
                parts = item.get("parts")
                if isinstance(parts, list):
                    text = "\n".join(
                        str(part.get("text") or "").strip()
                        for part in parts
                        if isinstance(part, dict) and part.get("type") == "text"
                    ).strip()

            if not text:
                continue

            if not latest_history_item_seen:
                latest_history_item_seen = True
                if (
                    role == "user"
                    and self._normalized_context_text(text)
                    == self._normalized_context_text(latest_question)
                ):
                    continue

            clipped = text[: self.max_history_chars_per_turn]
            row = f"{role}: {clipped}"
            if total_chars + len(row) > self.max_history_total_chars:
                break

            rows.append(row)
            total_chars += len(row)

        rows.reverse()
        return "\n".join(rows)

    @staticmethod
    def _normalized_context_text(value: str) -> str:
        return " ".join(value.split()).casefold()

    def _model_input(
        self,
        *,
        history_text: str,
        latest_question: str,
        is_zh: bool,
    ) -> str:
        if history_text:
            return (
                "Recent conversation context:\n"
                f"{history_text}\n\n"
                "Latest user question:\n"
                f"{latest_question}"
            )
        return latest_question

    def _model_instructions(self, *, is_zh: bool) -> str:
        if is_zh:
            return (
                "请直接、准确、完整地回答用户最新问题。仅当答案实质上依赖当前或近期变化的信息、"
                "准确的法规或立法文书措辞、决定性法律交叉引用、模型不确定的事实，或需要权威核实时，"
                "才使用可用的网页搜索工具；如果无需研究即可可靠回答，不要调用研究工具。"
                "需要研究时，优先使用澳大利亚联邦立法登记册、澳大利亚内政部、联邦法院及其他官方政府来源。"
                "必要时追踪具有实质意义的法律交叉引用；普通法律咨询通常以2至5个权威来源为宜，"
                "一旦足以回答实质问题就停止，不要为了增加来源数量继续检索。这是接待/客户答复流程，"
                "不是详尽的法律研究备忘录。"
                "不要因为工具可用就穷尽式研究，不要猜测，也不要编造引用或链接。"
            )
        return (
            "Answer the user's latest question directly, accurately, and completely. Use available web search "
            "only when needed to verify current or changing legal requirements, exact legal wording, material "
            "cross-references, uncertain facts, or information requiring authoritative verification. Do not use "
            "research unnecessarily. When research is needed, prefer authoritative Australian primary and official "
            "sources such as the Federal Register of Legislation, the Department of Home Affairs, Federal Court "
            "decisions, and other official government sources. For ordinary legal intake questions, usually 2-5 "
            "strong authoritative sources are sufficient. Follow a material cross-reference only when needed "
            "to answer the user's actual question, and stop researching once the material issues are sufficiently "
            "supported. Do not collect sources merely for breadth. This is an intake/customer-answer workflow, "
            "not an exhaustive legal research memorandum. Do not guess or fabricate citations or URLs."
        )

    @staticmethod
    def _response_to_dict(response: Any) -> dict[str, Any]:
        if isinstance(response, dict):
            return response
        model_dump = getattr(response, "model_dump", None)
        if callable(model_dump):
            dumped = model_dump()
            if isinstance(dumped, dict):
                return dumped
        return {}

    def _extract_web_sources(self, response: Any) -> list[dict[str, str]]:
        data = self._response_to_dict(response)
        found: list[dict[str, str]] = []
        seen: set[str] = set()

        def add_source(raw: Any) -> None:
            if not isinstance(raw, dict):
                return

            nested = raw.get("url_citation")
            if isinstance(nested, dict):
                candidate = {**raw, **nested}
            else:
                candidate = raw

            url = str(candidate.get("url") or "").strip()
            if not url:
                return

            title = str(
                candidate.get("title")
                or candidate.get("name")
                or candidate.get("site_name")
                or url
            ).strip()
            key = url.rstrip("/").lower()
            if key in seen:
                return
            seen.add(key)
            found.append({"title": title or url, "url": url})

        output = data.get("output")
        if not isinstance(output, list):
            return found

        for item in output:
            if not isinstance(item, dict):
                continue

            action = item.get("action")
            if isinstance(action, dict):
                for key in ("sources", "results"):
                    values = action.get(key)
                    if isinstance(values, list):
                        for value in values:
                            add_source(value)

            for key in ("sources", "results"):
                values = item.get(key)
                if isinstance(values, list):
                    for value in values:
                        add_source(value)

            content = item.get("content")
            if isinstance(content, list):
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    annotations = part.get("annotations")
                    if isinstance(annotations, list):
                        for annotation in annotations:
                            add_source(annotation)

        return found

    @staticmethod
    def _format_compact_sources(sources: list[dict[str, str]]) -> list[str]:
        return [
            f"{source['title']} — {source['url']}"
            for source in sources
            if source.get("url")
        ]

    def _append_actual_web_sources(
        self,
        *,
        answer_text: str,
        sources: list[dict[str, str]],
        is_zh: bool,
    ) -> str:
        if not sources:
            return answer_text

        heading = "## 实际网页搜索来源" if is_zh else "## Actual web-search sources"
        lines = [heading]
        for source in sources:
            title = source.get("title") or source.get("url") or "Source"
            url = source.get("url") or ""
            if url:
                lines.append(f"- [{title}]({url})")

        return f"{answer_text.rstrip()}\n\n" + "\n".join(lines)

    def _extract_reference_lines(self, answer_text: str) -> list[str]:
        lines = answer_text.splitlines()
        start_index: int | None = None

        for idx, line in enumerate(lines):
            normalized = line.strip().lower().strip("#*:： ")
            if any(marker in normalized for marker in REFERENCE_HEADING_MARKERS):
                start_index = idx + 1

        if start_index is None:
            return []

        references: list[str] = []
        for line in lines[start_index:]:
            stripped = line.strip()
            if not stripped:
                if references:
                    break
                continue

            normalized = stripped.lower().strip("#*:： ")
            if references and any(
                marker in normalized for marker in REFERENCE_HEADING_MARKERS
            ):
                continue

            cleaned = re.sub(r"^[-*•\u2022\s]+", "", stripped)
            cleaned = re.sub(r"^\d+[.)、]\s*", "", cleaned).strip()
            if cleaned:
                references.append(cleaned)

        return references

    def _looks_high_risk(self, text: str) -> bool:
        lowered = text.lower()
        return any(term in lowered for term in HIGH_RISK_TERMS)

    def _empty_question_response(
        self,
        *,
        is_zh: bool,
        matter_id: str | None,
    ) -> QueryResponse:
        answer = "请先输入一个问题。" if is_zh else "Please enter a question first."
        return QueryResponse(
            matter_id=matter_id,
            answer=answer,
            response_language="zh" if is_zh else "en",
            confidence="high",
            user_display_mode="direct_short",
            issue_type="premium_direct_answer",
            missing_facts=[],
            follow_up_questions=[],
            citations=[],
            compact_sources=[],
            escalate=False,
            next_action="ask_followup",
            retrieval_debug={
                "premium_direct_answer": {
                    "used": False,
                    "answer_model_called": False,
                    "reason": "empty_question",
                }
            },
        )

    def _with_research_notice(
        self,
        answer_text: str,
        *,
        is_zh: bool,
        live_web_search_used: bool,
    ) -> str:
        if live_web_search_used:
            notice = (
                "提示：这是使用实时网页搜索生成的 AI 快速研究答复，但未经过本地法规库的独立核对；"
                "用于个案决策前仍应由律师确认。"
                if is_zh
                else "Note: this AI quick research answer used live web search, but it has not been independently checked against the local legal database. Have the lawyer confirm it before using it for case-specific decisions."
            )
        else:
            notice = (
                "提示：这是 AI 快速答复，本次未获得可确认的实时网页搜索来源，也未经过本地法规库核对；"
                "请作为一般信息，并由律师确认后再用于个案决策。"
                if is_zh
                else "Note: this is an AI quick answer. No confirmable live web-search sources were returned, and it has not been checked against the local legal database. Treat it as general information and have the lawyer confirm it before using it for case-specific decisions."
            )

        if answer_text.startswith(notice):
            return answer_text
        return f"{notice}\n\n{answer_text}"
