from __future__ import annotations

import os
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryRequest, QueryResponse


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
    """Fast public-facing answer lane for the UI's GPT-5.5 High option.

    This intentionally avoids the Schedule/PFVD/RAG helper chain. The unified
    runtime still performs the politics-sensitive pre-filter before calling this
    service. The answer is labelled as model-only and not source-verified so the
    lawyer-facing product keeps a clear boundary between speed and verification.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv("PREMIUM_DIRECT_MODEL", "gpt-5.5")
        self.reasoning_effort = os.getenv("PREMIUM_DIRECT_REASONING_EFFORT", "high")
        self.timeout_seconds = float(os.getenv("PREMIUM_DIRECT_TIMEOUT_SECONDS", "60"))
        self.max_history_turns = int(os.getenv("PREMIUM_DIRECT_MAX_HISTORY_TURNS", "12"))
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(
                api_key=self.settings.openai_api_key,
                max_retries=int(os.getenv("OPENAI_MAX_RETRIES", "0")),
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
        history_text = self._history_text(getattr(payload, "frontend_messages", []) or [])
        high_risk = self._looks_high_risk(original_question) or self._looks_high_risk(effective_question)

        system_prompt = self._system_prompt(is_zh=is_zh, high_risk=high_risk)
        user_prompt = (
            f"Recent frontend conversation, newest last:\n{history_text or '(none)'}\n\n"
            f"Latest user question, original wording:\n{original_question}\n\n"
            f"Internal English version if translated/contextualised:\n{effective_question}\n\n"
            "Write the public answer now. Do not return JSON."
        )

        try:
            response = self.client.responses.create(
                model=self.model,
                reasoning={"effort": self.reasoning_effort},
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
        except TypeError:
            # Compatibility fallback for older SDK signatures. Keep the public
            # lane alive instead of falling back to the much slower legal chain.
            response = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
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
                    "source_verified": False,
                    "politics_filter_preserved": True,
                    "high_risk_detected": high_risk,
                    "skipped_pipeline": [
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

    def _system_prompt(self, *, is_zh: bool, high_risk: bool) -> str:
        language = "Chinese" if is_zh else "English"
        high_risk_instruction = (
            "This looks potentially deadline-sensitive or case-specific. Recommend lawyer review clearly."
            if high_risk
            else "Recommend lawyer review where facts, documents, timing, or eligibility are uncertain."
        )
        return (
            "You are a public-facing Australian immigration information assistant for a migration law firm.\n"
            "Give useful general information, not final legal advice.\n"
            "Do not guarantee eligibility, grant outcome, deadlines, or legal strategy.\n"
            "Do not invent citations and do not claim that you checked official sources.\n"
            "When asked for visa options, compare likely options and explain when each option may or may not fit.\n"
            "State practical next steps and one decisive follow-up question if needed.\n"
            "Keep the answer customer-friendly and structured.\n"
            f"{high_risk_instruction}\n"
            f"Answer language: {language}."
        )

    def _history_text(self, frontend_messages: list[dict[str, Any]]) -> str:
        rows: list[str] = []
        for item in frontend_messages[-self.max_history_turns :]:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "user")
            text = str(item.get("text") or "").strip()
            if not text:
                parts = item.get("parts")
                if isinstance(parts, list):
                    text = "\n".join(
                        str(part.get("text") or "").strip()
                        for part in parts
                        if isinstance(part, dict) and part.get("type") == "text"
                    ).strip()
            if text:
                rows.append(f"{role}: {text[:1800]}")
        return "\n".join(rows)

    def _looks_high_risk(self, text: str) -> bool:
        lowered = text.lower()
        return any(term in lowered for term in HIGH_RISK_TERMS)

    def _with_model_only_notice(self, answer_text: str, *, is_zh: bool) -> str:
        if is_zh:
            notice = "提示：这是 GPT-5.5 High 快速答复，未经过本地法规库、Schedule 2 或官方来源核对；请作为一般信息，并由律师确认后再用于个案决策。"
        else:
            notice = "Note: this is a GPT-5.5 High quick answer. It has not been checked against the local legal database, Schedule 2, or official sources. Treat it as general information and have the lawyer confirm it before using it for case-specific decisions."
        if answer_text.startswith(notice):
            return answer_text
        return f"{notice}\n\n{answer_text}"
