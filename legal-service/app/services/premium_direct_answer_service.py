from __future__ import annotations

import logging
import os
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryRequest, QueryResponse

logger = logging.getLogger(__name__)

POLITICS_SENSITIVE_TERMS = (
    "election",
    "vote",
    "voting",
    "voter",
    "candidate",
    "campaign",
    "political party",
    "party politics",
    "persuade voters",
    "who should i vote",
    "how should i vote",
    "referendum",
    "ballot",
    "民主党",
    "共和党",
    "工党",
    "自由党",
    "选举",
    "投票",
    "拉票",
    "竞选",
    "候选人",
    "政党",
    "公投",
)

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
    "aat",
    "art",
    "tribunal",
    "ministerial intervention",
)


class PremiumDirectAnswerService:
    """Direct model-only lane for the UI's direct LLM option.

    Contract for this lane:
    - no Schedule/PFVD/RAG/helper prompt chain;
    - no full semantic-turn router;
    - lightweight recent chat history is kept for continuity;
    - local politics-sensitive gate before the model call;
    - the answer-model input is compact history plus the latest user question;
    - try GPT-5.5 High first, then silently fall back to GPT-5.4-mini;
    - upstream OpenAI failures fail fast so the frontend does not wait for minutes;
    - direct answers show transparent reference status, not invented legal citations.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.primary_model = os.getenv(
            "PREMIUM_DIRECT_PRIMARY_MODEL",
            os.getenv("PREMIUM_DIRECT_MODEL", "gpt-5.5"),
        )
        self.primary_reasoning_effort = os.getenv(
            "PREMIUM_DIRECT_PRIMARY_REASONING_EFFORT",
            os.getenv("PREMIUM_DIRECT_REASONING_EFFORT", "high"),
        )
        self.primary_timeout_seconds = float(
            os.getenv(
                "PREMIUM_DIRECT_PRIMARY_TIMEOUT_SECONDS",
                os.getenv("PREMIUM_DIRECT_TIMEOUT_SECONDS", "45"),
            )
        )
        self.fallback_model = os.getenv("PREMIUM_DIRECT_FALLBACK_MODEL", "gpt-5.4-mini")
        self.fallback_reasoning_effort = os.getenv(
            "PREMIUM_DIRECT_FALLBACK_REASONING_EFFORT",
            "",
        ).strip()
        self.fallback_timeout_seconds = float(
            os.getenv("PREMIUM_DIRECT_FALLBACK_TIMEOUT_SECONDS", "55")
        )
        self.max_retries = int(os.getenv("PREMIUM_DIRECT_OPENAI_MAX_RETRIES", "0"))
        self.max_history_turns = int(os.getenv("PREMIUM_DIRECT_MAX_HISTORY_TURNS", "6"))
        self.max_history_chars_per_turn = int(
            os.getenv("PREMIUM_DIRECT_MAX_HISTORY_CHARS_PER_TURN", "700")
        )
        self.max_history_total_chars = int(
            os.getenv("PREMIUM_DIRECT_MAX_HISTORY_TOTAL_CHARS", "3000")
        )

    def _client(self, *, timeout_seconds: float) -> OpenAI:
        if not self.settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
        return OpenAI(
            api_key=self.settings.openai_api_key,
            max_retries=self.max_retries,
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
        history_text = self._history_text(getattr(payload, "frontend_messages", []) or [])
        model_input = self._model_input(
            history_text=history_text,
            latest_question=question_for_model,
            is_zh=is_zh,
        )
        high_risk = self._looks_high_risk(original_question) or self._looks_high_risk(effective_question)

        if self._is_politics_sensitive(question_for_model):
            return self._politics_block_response(
                is_zh=is_zh,
                matter_id=matter_id,
                original_question=original_question,
                effective_question=effective_question,
            )

        if not question_for_model:
            return self._empty_question_response(is_zh=is_zh, matter_id=matter_id)

        answer_text, model_debug = self._answer_with_silent_fallback(model_input=model_input)
        if not answer_text:
            answer_text = (
                "抱歉，我现在无法生成快速答复。建议改用默认法律核对模式，或请律师人工确认。"
                if is_zh
                else "Sorry, I could not generate a quick answer. Please use the default legal-check mode or ask the lawyer to confirm manually."
            )

        answer_text = self._with_model_only_notice(answer_text, is_zh=is_zh)

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
            compact_sources=self._reference_status_sources(is_zh=is_zh),
            escalate=high_risk,
            next_action="suggest_consultation" if high_risk else "answer",
            retrieval_debug={
                "original_question": original_question,
                "effective_question": effective_question,
                "semantic_turn_analysis": semantic_turn_debug or {},
                "premium_direct_answer": {
                    "used": True,
                    "source_verified": False,
                    "reference_status_shown": True,
                    "politics_filter_preserved": True,
                    "politics_filter_type": "local_lightweight_gate",
                    "answer_model_input": "lightweight_history_plus_latest_user_question",
                    "answer_model_input_char_count": len(model_input),
                    "latest_question_char_count": len(question_for_model),
                    "history_char_count": len(history_text),
                    "frontend_history_sent_to_answer_model": bool(history_text),
                    "system_prompt_sent_to_answer_model": False,
                    "max_history_turns": self.max_history_turns,
                    "max_history_chars_per_turn": self.max_history_chars_per_turn,
                    "max_history_total_chars": self.max_history_total_chars,
                    "high_risk_detected": high_risk,
                    **model_debug,
                    "skipped_pipeline": [
                        "semantic_turn_router",
                        "proposal_first_verification_depth",
                        "schedule2_ranked_candidate_map",
                        "local_rag_retrieval",
                        "live_retrieval",
                        "citation_packaging",
                        "customer_answer_plan_helper_chain",
                    ],
                },
            },
        )

    def _answer_with_silent_fallback(self, *, model_input: str) -> tuple[str, dict[str, Any]]:
        primary_debug = {
            "primary_model": self.primary_model,
            "primary_reasoning_effort": self.primary_reasoning_effort,
            "primary_timeout_seconds": self.primary_timeout_seconds,
            "fallback_model": self.fallback_model,
            "fallback_reasoning_effort": self.fallback_reasoning_effort or None,
            "fallback_timeout_seconds": self.fallback_timeout_seconds,
            "max_retries": self.max_retries,
        }

        logger.info(
            "premium_direct_primary_request model=%s reasoning_effort=%s timeout_seconds=%s max_retries=%s input_chars=%s fallback_model=%s",
            self.primary_model,
            self.primary_reasoning_effort,
            self.primary_timeout_seconds,
            self.max_retries,
            len(model_input),
            self.fallback_model,
        )

        try:
            primary_text = self._call_model(
                model=self.primary_model,
                reasoning_effort=self.primary_reasoning_effort,
                timeout_seconds=self.primary_timeout_seconds,
                model_input=model_input,
            )
            if primary_text:
                return primary_text, {
                    **primary_debug,
                    "serving_model": self.primary_model,
                    "used_fallback_model": False,
                    "primary_failed": False,
                }
            raise RuntimeError("primary model returned empty output_text")
        except Exception as exc:
            logger.warning(
                "premium_direct_primary_failed; silently trying fallback model=%s error_type=%s error=%s",
                self.fallback_model,
                exc.__class__.__name__,
                str(exc)[:300],
            )
            primary_error_debug = {
                "primary_failed": True,
                "primary_error_type": exc.__class__.__name__,
                "primary_error": str(exc)[:500],
            }

        logger.info(
            "premium_direct_fallback_request model=%s reasoning_effort=%s timeout_seconds=%s max_retries=%s input_chars=%s",
            self.fallback_model,
            self.fallback_reasoning_effort or None,
            self.fallback_timeout_seconds,
            self.max_retries,
            len(model_input),
        )
        fallback_text = self._call_model(
            model=self.fallback_model,
            reasoning_effort=self.fallback_reasoning_effort,
            timeout_seconds=self.fallback_timeout_seconds,
            model_input=model_input,
        )
        return fallback_text, {
            **primary_debug,
            **primary_error_debug,
            "serving_model": self.fallback_model,
            "used_fallback_model": True,
        }

    def _call_model(
        self,
        *,
        model: str,
        reasoning_effort: str,
        timeout_seconds: float,
        model_input: str,
    ) -> str:
        client = self._client(timeout_seconds=timeout_seconds)
        effort = (reasoning_effort or "").strip()
        if effort and effort.lower() not in {"none", "off", "false", "0"}:
            try:
                response = client.responses.create(
                    model=model,
                    reasoning={"effort": effort},
                    input=model_input,
                )
                return (getattr(response, "output_text", "") or "").strip()
            except TypeError:
                pass
        response = client.responses.create(
            model=model,
            input=model_input,
        )
        return (getattr(response, "output_text", "") or "").strip()

    def _history_text(self, frontend_messages: list[dict[str, Any]]) -> str:
        rows: list[str] = []
        total_chars = 0
        for item in frontend_messages[-self.max_history_turns :]:
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
            clipped = text[: self.max_history_chars_per_turn]
            row = f"{role}: {clipped}"
            if total_chars + len(row) > self.max_history_total_chars:
                break
            rows.append(row)
            total_chars += len(row)
        return "\n".join(rows)

    def _model_input(self, *, history_text: str, latest_question: str, is_zh: bool) -> str:
        if history_text:
            if is_zh:
                return (
                    "以下是最近对话，只用于理解上下文，不要逐字复述：\n"
                    f"{history_text}\n\n"
                    "用户最新问题：\n"
                    f"{latest_question}"
                )
            return (
                "Recent chat history for context only, do not repeat it verbatim:\n"
                f"{history_text}\n\n"
                "Latest user question:\n"
                f"{latest_question}"
            )
        return latest_question

    def _is_politics_sensitive(self, text: str) -> bool:
        lowered = text.lower()
        return any(term in lowered for term in POLITICS_SENSITIVE_TERMS)

    def _looks_high_risk(self, text: str) -> bool:
        lowered = text.lower()
        return any(term in lowered for term in HIGH_RISK_TERMS)

    def _reference_status_sources(self, *, is_zh: bool) -> list[str]:
        if is_zh:
            return [
                "直接 LLM 快速答复 — 未进行 Schedule 2、本地法规库或官方来源核对；如需正式来源引用，请切换到默认法律核对模式。"
            ]
        return [
            "Direct LLM quick answer — not checked against Schedule 2, the local legal database, or official sources. Use Default legal check for formal source references."
        ]

    def _politics_block_response(
        self,
        *,
        is_zh: bool,
        matter_id: str | None,
        original_question: str,
        effective_question: str,
    ) -> QueryResponse:
        answer = (
            "抱歉，我不能帮助处理政治敏感、选举、投票建议或政治说服类请求。你可以改问澳大利亚移民或签证方面的一般问题。"
            if is_zh
            else "Sorry, I cannot help with politically sensitive, election, voting-advice, or political-persuasion requests. You can ask a general Australian immigration or visa question instead."
        )
        return QueryResponse(
            matter_id=matter_id,
            answer=answer,
            response_language="zh" if is_zh else "en",
            confidence="high",
            user_display_mode="general_with_warning",
            issue_type="politics_sensitive_block",
            missing_facts=[],
            follow_up_questions=[],
            citations=[],
            compact_sources=[
                "Local politics-sensitive safety filter — no answer model was called."
            ],
            escalate=False,
            next_action="answer",
            retrieval_debug={
                "original_question": original_question,
                "effective_question": effective_question,
                "premium_direct_answer": {
                    "used": False,
                    "blocked_by_politics_filter": True,
                    "politics_filter_type": "local_lightweight_gate",
                    "answer_model_called": False,
                    "answer_model_input": None,
                    "reference_status_shown": True,
                },
            },
        )

    def _empty_question_response(self, *, is_zh: bool, matter_id: str | None) -> QueryResponse:
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

    def _with_model_only_notice(self, answer_text: str, *, is_zh: bool) -> str:
        if is_zh:
            notice = "提示：这是 AI 快速答复，未经过本地法规库、Schedule 2 或官方来源核对；请作为一般信息，并由律师确认后再用于个案决策。"
        else:
            notice = "Note: this is an AI quick answer. It has not been checked against the local legal database, Schedule 2, or official sources. Treat it as general information and have the lawyer confirm it before using it for case-specific decisions."
        if answer_text.startswith(notice):
            return answer_text
        return f"{notice}\n\n{answer_text}"
