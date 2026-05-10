from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.schemas.query import QueryResponse


@dataclass(slots=True)
class PublicAnswerGuardResult:
    answer: str
    triggered: bool
    matched_patterns: list[str]
    strategy: str

    def to_debug_dict(self) -> dict[str, Any]:
        return {
            "triggered": self.triggered,
            "matched_patterns": self.matched_patterns,
            "strategy": self.strategy,
        }


class PublicAnswerGuard:
    """
    Deterministic last-mile customer-answer firewall.

    Internal RAG / evidence-audit wording may exist in retrieval_debug, policy
    reasons, and developer logs. It must not appear in QueryResponse.answer,
    because the frontend displays that field to customers.
    """

    FORBIDDEN_PATTERNS: tuple[re.Pattern[str], ...] = (
        re.compile(r"\bretrieved material\b", re.I),
        re.compile(r"\bretrieved source(?:s)?\b", re.I),
        re.compile(r"\bsource material\b", re.I),
        re.compile(r"\bprovided sources?\b", re.I),
        re.compile(r"\bdoes not provide\b", re.I),
        re.compile(r"\bdoes not support\b", re.I),
        re.compile(r"\bnot supported by (?:the )?(?:retrieved|provided)\b", re.I),
        re.compile(r"\bsupported by the retrieved\b", re.I),
        re.compile(r"\bnot specifically supported\b", re.I),
        re.compile(r"\bI found some retrieved\b", re.I),
        re.compile(r"\bfully grounded answer\b", re.I),
        re.compile(r"\bgrounded answer from\b", re.I),
        re.compile(r"\boperation answerability\b", re.I),
        re.compile(r"\bsource classes?\b", re.I),
        re.compile(r"\brequired source classes?\b", re.I),
        re.compile(r"\bevidence package\b", re.I),
        re.compile(r"\bcontext insufficient\b", re.I),
        re.compile(r"\bunsupported specificity\b", re.I),
        re.compile(r"\blocal corpus\b", re.I),
        re.compile(r"\blegal corpus\b", re.I),
        re.compile(r"\bretrieval\b", re.I),
    )

    def sanitize_response(
        self,
        *,
        response: QueryResponse,
        response_language: str,
        original_question: str,
        effective_question: str,
        policy: Any | None = None,
        case_hypothesis: Any | None = None,
        interaction_plan: Any | None = None,
        fact_slot_states: list[Any] | None = None,
    ) -> tuple[QueryResponse, dict[str, Any]]:
        result = self.sanitize_answer(
            answer=response.answer,
            response_language=response_language,
            original_question=original_question,
            effective_question=effective_question,
            policy=policy,
            case_hypothesis=case_hypothesis,
            interaction_plan=interaction_plan,
            fact_slot_states=fact_slot_states or [],
        )
        response.answer = result.answer
        debug = result.to_debug_dict()
        if result.triggered and response.user_display_mode is None:
            response.user_display_mode = "answer_then_ask"
        return response, debug

    def sanitize_answer(
        self,
        *,
        answer: str | None,
        response_language: str,
        original_question: str,
        effective_question: str,
        policy: Any | None = None,
        case_hypothesis: Any | None = None,
        interaction_plan: Any | None = None,
        fact_slot_states: list[Any] | None = None,
    ) -> PublicAnswerGuardResult:
        text = (answer or "").strip()
        matched = self._matched_patterns(text)
        if text and not matched:
            return PublicAnswerGuardResult(
                answer=text,
                triggered=False,
                matched_patterns=[],
                strategy="pass_through",
            )

        replacement, strategy = self._replacement_answer(
            response_language=response_language,
            original_question=original_question,
            effective_question=effective_question,
            policy=policy,
            case_hypothesis=case_hypothesis,
            interaction_plan=interaction_plan,
            fact_slot_states=fact_slot_states or [],
        )
        return PublicAnswerGuardResult(
            answer=replacement,
            triggered=True,
            matched_patterns=matched or ["blank_or_machine_style_answer"],
            strategy=strategy,
        )

    def _matched_patterns(self, text: str) -> list[str]:
        if not text:
            return []
        return [pattern.pattern for pattern in self.FORBIDDEN_PATTERNS if pattern.search(text)]

    def _replacement_answer(
        self,
        *,
        response_language: str,
        original_question: str,
        effective_question: str,
        policy: Any | None,
        case_hypothesis: Any | None,
        interaction_plan: Any | None,
        fact_slot_states: list[Any],
    ) -> tuple[str, str]:
        language = (response_language or "en").lower()
        is_zh = language.startswith("zh")
        op = self._operation_type(case_hypothesis)
        next_question = self._next_question(interaction_plan, fact_slot_states)
        question = (original_question or effective_question or "").lower()

        if (op and op.startswith("485")) or "485" in question or "temporary graduate" in question:
            return self._template_485(is_zh=is_zh, next_question=next_question, question=question)

        if self._policy_next_action(policy) == "suggest_consultation":
            return self._template_consultation(is_zh=is_zh, next_question=next_question)

        if next_question:
            return self._template_answer_then_ask(is_zh=is_zh, next_question=next_question)

        return self._template_general(is_zh=is_zh)

    def _template_485(self, *, is_zh: bool, next_question: str | None, question: str) -> tuple[str, str]:
        higher_ed_hint = any(term in question for term in ["master", "masters", "bachelor", "phd", "degree"])
        if is_zh:
            if higher_ed_hint:
                answer = (
                    "根据你提供的信息，这个问题很可能和 Subclass 485 的 Post-Higher Education Work stream 有关，"
                    "因为你提到完成了 degree-level qualification。\n\n"
                    "我可以先给你一个谨慎的方向判断，但还不能只凭这些信息确认最终资格。485 通常还需要核对完成课程的时间、"
                    "当前签证/近期学生签证记录、课程是否符合要求，以及是否有适用的例外或过渡规则。"
                )
            else:
                answer = (
                    "根据你提供的信息，这个问题和 Subclass 485 Temporary Graduate visa 有关。"
                    "我可以先帮你判断可能的 stream，但最终资格还需要核对关键事实。"
                )
            if next_question:
                answer += f"\n\n一个简单问题：{next_question}"
            return answer, "485_customer_safe_template_zh"

        if higher_ed_hint:
            answer = (
                "Based on what you told me, this likely relates to the Subclass 485 Post-Higher Education Work stream, "
                "because you mentioned a degree-level qualification.\n\n"
                "I can give a cautious first view, but I cannot confirm final eligibility from those facts alone. "
                "For 485, timing, current/recent visa history, course details, and any exception or transitional rule may still matter."
            )
        else:
            answer = (
                "Based on what you told me, this appears to be a Subclass 485 Temporary Graduate visa question. "
                "I can help identify the likely pathway first, but final eligibility depends on several facts."
            )
        if next_question:
            answer += f"\n\nOne quick question: {next_question}"
        return answer, "485_customer_safe_template_en"

    def _template_answer_then_ask(self, *, is_zh: bool, next_question: str) -> tuple[str, str]:
        if is_zh:
            return (
                "我可以先给你一般性方向，但还需要一个关键信息，才能把说明更准确地对应到你的情况。"
                f"\n\n一个简单问题：{next_question}",
                "answer_then_ask_template_zh",
            )
        return (
            "I can give general guidance, but I need one key detail before making it more specific to your situation."
            f"\n\nOne quick question: {next_question}",
            "answer_then_ask_template_en",
        )

    def _template_consultation(self, *, is_zh: bool, next_question: str | None) -> tuple[str, str]:
        if is_zh:
            answer = "这个问题可能需要律师根据你的文件和关键日期进一步核对。我可以先帮你整理咨询前需要准备的信息。"
            if next_question:
                answer += f"\n\n一个简单问题：{next_question}"
            return answer, "consultation_template_zh"
        answer = "This may need a lawyer to check the documents and key dates. I can help you prepare the main details first."
        if next_question:
            answer += f"\n\nOne quick question: {next_question}"
        return answer, "consultation_template_en"

    def _template_general(self, *, is_zh: bool) -> tuple[str, str]:
        if is_zh:
            return (
                "我可以提供一般性移民信息，但还需要更多背景才能把说明准确对应到你的情况。"
                "\n\n请告诉我你的签证类别、关键日期，以及你最担心的问题。",
                "general_customer_safe_template_zh",
            )
        return (
            "I can provide general immigration information, but I need a little more context to make it specific to your situation."
            "\n\nPlease tell me the visa subclass, the key date, and the main issue you are worried about.",
            "general_customer_safe_template_en",
        )

    def _operation_type(self, case_hypothesis: Any | None) -> str | None:
        if case_hypothesis is None:
            return None
        value = getattr(case_hypothesis, "primary_operation_type", None)
        if value is None and isinstance(case_hypothesis, dict):
            value = case_hypothesis.get("primary_operation_type")
        return str(value) if value else None

    def _policy_next_action(self, policy: Any | None) -> str | None:
        if policy is None:
            return None
        value = getattr(policy, "next_action", None)
        if value is None and isinstance(policy, dict):
            value = policy.get("next_action")
        return str(value) if value else None

    def _next_question(self, interaction_plan: Any | None, fact_slot_states: list[Any]) -> str | None:
        requested = getattr(interaction_plan, "requested_facts", None)
        if requested is None and isinstance(interaction_plan, dict):
            requested = interaction_plan.get("requested_facts")
        if requested:
            first = requested[0]
            prompt = getattr(first, "prompt", None)
            if prompt is None and isinstance(first, dict):
                prompt = first.get("prompt")
            if isinstance(prompt, str) and prompt.strip():
                return prompt.strip()

        for slot in fact_slot_states or []:
            status = getattr(slot, "status", None)
            required = bool(getattr(slot, "required", False))
            label = getattr(slot, "label", None)
            if required and status not in {"known", "not_applicable", "document_unavailable", "user_unsure"}:
                if label:
                    return f"Please provide {str(label).lower()}."
        return None
