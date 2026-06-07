from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.semantic_contracts import SemanticTurnAnalysis


class FastTriageResponseService:
    """LLM-authored compact response for generic triage turns.

    This service is intentionally used only after the semantic/full-context layer
    has identified a generic intake/triage turn. It avoids the expensive legal
    retrieval/reasoning/rewrite pipeline while still letting the LLM craft the
    customer-facing wording.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv(
            "FAST_TRIAGE_MODEL",
            os.getenv("GENERAL_QA_MODEL", "gpt-5.4-mini"),
        )
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    def build(
        self,
        *,
        raw_user_message: str,
        semantic_turn: SemanticTurnAnalysis,
        response_language: str,
    ) -> tuple[str, dict[str, Any]]:
        """Return a short public triage answer and debug metadata.

        If the LLM call fails, a conservative fallback is used. This fallback is
        only a service-availability fallback, not a semantic classifier.
        """

        is_zh = response_language == "zh"
        payload = {
            "raw_user_message": raw_user_message,
            "response_language": response_language,
            "semantic_turn": semantic_turn.model_dump(),
        }
        system_prompt = "\n".join(
            [
                "You write the first short reply for an Australian immigration-law website assistant.",
                "The semantic resolver has already determined that this is a generic visa-consultation triage turn, not a concrete legal assessment.",
                "Do not retrieve law. Do not cite sources. Do not pretend eligibility can be assessed.",
                "Answer helpfully in 2-4 short paragraphs or compact bullets.",
                "Ask exactly one broad next question at the end: which visa type/subclass and what specific issue the user wants help with.",
                "Do not mention internal systems or backend routing.",
                "Write in Simplified Chinese." if is_zh else "Write in English.",
            ]
        )
        try:
            result = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            )
            text = (result.output_text or "").strip()
            if text:
                return text, {"used_llm": True, "model": self.model}
        except Exception as exc:
            return self._fallback(is_zh), {"used_llm": False, "model": self.model, "error": str(exc)[:500]}

        return self._fallback(is_zh), {"used_llm": False, "model": self.model, "error": "empty_output"}

    def _fallback(self, is_zh: bool) -> str:
        if is_zh:
            return (
                "可以，我可以先帮你做澳洲签证问题的初步分流。\n\n"
                "目前你还没有说明具体签证类别或问题，所以我不能判断是否符合某个条件、是否有拒签风险，或是否需要复审。\n\n"
                "一个关键问题：你想咨询的是哪个签证类别或具体问题？例如 500 学签、485、配偶签、桥签、拒签、复审、签证条件或续签。"
            )
        return (
            "I can help you triage an Australian visa issue first.\n\n"
            "At this stage I do not yet know the visa subclass or the specific problem, so I cannot assess eligibility, refusal risk, review options, or deadlines.\n\n"
            "One key question: which visa type or issue do you want help with, such as Student 500, 485, partner visa, bridging visa, refusal, review, visa conditions, or renewal?"
        )
