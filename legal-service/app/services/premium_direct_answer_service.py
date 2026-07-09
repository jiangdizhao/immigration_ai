from __future__ import annotations

import os
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryRequest, QueryResponse


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
    """Direct model-only lane for the UI's GPT-5.5 option.

    Contract for this lane:
    - no Schedule/PFVD/RAG/helper prompt chain;
    - no full semantic-turn router;
    - lightweight recent chat history is kept for continuity;
    - local politics-sensitive gate before the model call;
    - the answer-model input is compact history plus the latest user question.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv("PREMIUM_DIRECT_MODEL", "gpt-5.5")
        self.reasoning_effort = os.getenv("PREMIUM_DIRECT_REASONING_EFFORT", "high")
        self.timeout_seconds = float(os.getenv("PREMIUM_DIRECT_TIMEOUT_SECONDS", "90"))
        self.max_retries = int(
            os.getenv("PREMIUM_DIRECT_OPENAI_MAX_RETRIES", os.getenv("OPENAI_MAX_RETRIES", "1"))
        )
        self.max_history_turns = int(os.getenv("PREMIUM_DIRECT_MAX_HISTORY_TURNS", "6"))
        self.max_history_chars_per_turn = int(
            os.getenv("PREMIUM_DIRECT_MAX_HISTORY_CHARS_PER_TURN", "700")
        )
        self.max_history_total_chars = int(
            os.getenv("PREMIUM_DIRECT_MAX_HISTORY_TOTAL_CHARS", "3000")
        )
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(
                api_key=self.settings.openai_api_key,
                max_retries=self.max_retries,
                timeout=self.timeout_seconds,
            )
        return self._client

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

        try:
            response = self.client.responses.create(
                model=self.model,
                reasoning={"effort": self.reasoning_effort},
                input=model_input,
            )
        except TypeError:
            # Compatibility fallback for older SDK signatures.
            response = self.client.responses.create(
                model=self.model,
                input=model_input,
            )

        answer_text = (getattr(response, "output_text", "") or "").strip()
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
            compact_sources=[],
            escalate=high_risk,
            next_action="suggest_consultation" if high_risk else "answer",
            retrieval_debug={
                "original_question": original_question,
                "effective_question": effective_question,
                "semantic_turn_analysis": semantic_turn_debug or {},
                "premium_direct_answer": {
                    "used": True,
                    "model": self.model,
                    "reasoning_effort": self.reasoning_effort,
                    "timeout_seconds": self.timeout_seconds,
                    "max_retries": self.max_retries,
                    "source_verified": False,
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
            compact_sources=[],
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
            notice = "提示：这是 GPT-5.5 快速答复，未经过本地法规库、Schedule 2 或官方来源核对；请作为一般信息，并由律师确认后再用于个案决策。"
        else:
            notice = "Note: this is a GPT-5.5 quick answer. It has not been checked against the local legal database, Schedule 2, or official sources. Treat it as general information and have the lawyer confirm it before using it for case-specific decisions."
        if answer_text.startswith(notice):
            return answer_text
        return f"{notice}\n\n{answer_text}"
