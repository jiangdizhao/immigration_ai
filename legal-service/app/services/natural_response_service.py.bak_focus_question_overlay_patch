from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryResponse
from app.schemas.semantic_contracts import CommunicationPlan, LegalDecisionObject


class NaturalResponseService:
    """Rewrite legal answers into polished consultant-style public wording.

    This service is not a legal decision maker. It receives the already validated
    LegalDecisionObject and CommunicationPlan, then rewrites the public answer to
    avoid canned wording while preserving legal uncertainty and constraints.
    """

    INTERNAL_WORDS = (
        "retrieval",
        "retrieved material",
        "source classes",
        "evidence package",
        "operation answerability",
        "local corpus",
        "backend",
        "policy gate",
    )

    BANNED_LINE_FRAGMENTS = (
        "Outcome Graphic",
        "Risk Pie",
        "AMEC-style",
        "YouTube",
        "donate",
        "抖內",
        "電台",
        "电台",
    )

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv(
            "NATURAL_RESPONSE_MODEL",
            os.getenv("RECOMMENDATION_MODEL", os.getenv("REASONING_MODEL", "gpt-5.4-mini")),
        )
        self.enabled = os.getenv("NATURAL_RESPONSE_REWRITE_ENABLED", "true").strip().lower() not in {
            "0",
            "false",
            "no",
        }
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    def apply_to_response(
        self,
        *,
        response: QueryResponse,
        legal_decision: LegalDecisionObject,
        communication_plan: CommunicationPlan,
        original_question: str,
        effective_question: str,
        known_facts: dict[str, Any],
    ) -> tuple[QueryResponse, dict[str, Any]]:
        debug: dict[str, Any] = {"applied": False, "reason": "disabled_or_not_needed"}
        if not self.enabled:
            debug["reason"] = "disabled_by_env"
            return response, debug
        if not response.answer or not response.answer.strip():
            debug["reason"] = "empty_answer"
            return response, debug

        generated = self._generate(
            current_answer=response.answer,
            legal_decision=legal_decision,
            communication_plan=communication_plan,
            original_question=original_question,
            effective_question=effective_question,
            known_facts=known_facts,
            compact_sources=response.compact_sources or [],
        )
        if not generated:
            debug["reason"] = "generation_failed"
            return response, debug

        response.answer = self._light_sanitize(generated)
        debug.update(
            {
                "applied": True,
                "reason": "natural_response_rewrite",
                "strategy": communication_plan.strategy,
            }
        )
        return response, debug

    def _generate(
        self,
        *,
        current_answer: str,
        legal_decision: LegalDecisionObject,
        communication_plan: CommunicationPlan,
        original_question: str,
        effective_question: str,
        known_facts: dict[str, Any],
        compact_sources: list[str],
    ) -> str | None:
        is_zh = communication_plan.response_language == "zh"
        language_rule = "Write in Simplified Chinese." if is_zh else "Write in English."
        payload = {
            "original_question": original_question,
            "effective_question": effective_question,
            "current_answer": current_answer,
            "known_facts": known_facts,
            "legal_decision": legal_decision.model_dump(),
            "communication_plan": communication_plan.model_dump(),
            "compact_sources": compact_sources,
        }
        system_prompt = "\n".join(
            [
                "You are the final public-answer writer for an Australian immigration-law website assistant.",
                "You do not decide legal truth. You rewrite the supplied answer using only the LegalDecisionObject and CommunicationPlan.",
                "Write like a helpful professional intake consultant: direct, practical, friendly, and not canned.",
                "Use a polished layout: short section headings, concise paragraphs, and bullets where they improve readability.",
                "Do not force every answer into the same template; choose headings that fit the case.",
                "For urgent visa-status matters, prefer a layout like: initial view, why it is urgent, what to do now, documents to prepare, next service/consultation. You may vary the exact headings.",
                "Start with the most useful case-specific point, not a generic disclaimer.",
                "Commit to facts the user already gave. Do not re-ask known facts.",
                "Preserve caveats, uncertainty, and escalation warnings.",
                "Do not invent deadlines, risk percentages, legal provisions, citations, outcomes, outcome graphics, risk pies, or AMEC-style scores.",
                "Do not include marketing, donation requests, YouTube messages, or unrelated links.",
                "Do not mention internal systems, retrieval, evidence packages, source classes, backend, or policy gates.",
                "Ask at most one useful next question, and only if the plan says to ask one.",
                "If the plan offers a next service, include it naturally in one short sentence.",
                "Return only the final answer text.",
                language_rule,
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
            return text or None
        except Exception:
            return None

    def _light_sanitize(self, text: str) -> str:
        """Remove unsafe/marketing fragments while preserving Markdown layout."""
        out = (text or "").strip()
        for word in self.INTERNAL_WORDS:
            out = out.replace(word, "available information")
            out = out.replace(word.title(), "available information")

        raw_lines: list[str] = []
        for line in out.splitlines():
            if any(fragment.lower() in line.lower() for fragment in self.BANNED_LINE_FRAGMENTS):
                continue
            raw_lines.append(line.rstrip())

        cleaned_lines: list[str] = []
        for line in raw_lines:
            kept_tokens: list[str] = []
            for token in line.split():
                stripped = token.strip(".,;:()[]{}|｜")
                if stripped.endswith("%") and stripped[:-1].isdigit():
                    continue
                if "/100" in stripped:
                    continue
                kept_tokens.append(token)
            cleaned_lines.append(" ".join(kept_tokens).rstrip())

        compacted: list[str] = []
        blank_seen = False
        for line in cleaned_lines:
            if line.strip():
                compacted.append(line)
                blank_seen = False
            elif not blank_seen:
                compacted.append("")
                blank_seen = True
        return "\n".join(compacted).strip()
