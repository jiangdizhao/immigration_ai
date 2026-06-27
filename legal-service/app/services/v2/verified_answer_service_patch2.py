from __future__ import annotations

import json
import os
import re
from typing import Any

from app.services.v2.verified_answer_service import (
    Confidence,
    QueryServiceV2,
    V2RenderedAnswer,
    V2VerificationResult,
)


class QueryServiceV2Patch2(QueryServiceV2):
    """V2 LLM-verified answer path with disciplined final-answer formatting.

    This class intentionally does NOT use deterministic legal verification. Local
    and live sources are only evidence for the LLM verifier. The final answer is
    repaired/finalized under a strict public-answer format contract so the
    chatbot does not dump mixed source content into chaotic paragraphs.
    """

    GENERIC_DRAFT_PATTERNS = [
        r"i can help with australian immigration-law questions",
        r"i can help with australian immigration law questions",
        r"need to verify the key legal basis",
        r"before giving a reliable answer",
        r"无法生成可靠回复",
        r"需要先核对关键法律依据",
        r"不能给出可靠回答",
    ]

    INTERNAL_PUBLIC_PATTERNS = [
        r"verification indicates",
        r"add the missing decisive point",
        r"missing decisive keyword",
        r"source pack",
        r"numbered sources",
        r"answer contract",
        r"verifier",
        r"draft contract",
        r"retrieved chunks",
    ]

    FORMAT_REPAIR_PATTERNS = [
        r"\bkey requirement\b",
        r"\bmain requirement\b",
        r"\brequirement for\b",
        r"\brequirements for\b",
        r"\bwhat.*requirement",
        r"\bwhat.*requirements",
        r"\bsponsor\b",
        r"\bcriteria\b",
        r"\bcriterion\b",
    ]

    def __init__(self) -> None:
        super().__init__()
        self.repair_model = os.getenv("V2_REPAIR_MODEL", self.verifier_model)
        self._last_source_pack: list[dict[str, Any]] = []
        self._last_question: str = ""

    def _verify(self, db, payload, contract):
        self._last_question = payload.question or ""
        result, citations, debug = super()._verify(db, payload, contract)
        result.coverage_report.update(
            {
                "deterministic_verifier_removed": True,
                "final_answer_format_patch": True,
                "draft_quality": self._draft_quality(contract),
            }
        )
        return result, citations, debug

    def _source_pack(self, chunks, live_chunks):
        pack = super()._source_pack(chunks, live_chunks)
        self._last_source_pack = pack
        return pack

    def _verifier_prompt(self) -> str:
        return (
            "You are a strict legal verification layer for an Australian immigration-law website assistant. "
            "You do not write the final public answer. Work only from the answer contract and numbered sources. "
            "Do not verify merely by keyword overlap. Decide whether the draft is legally complete enough for the user's exact question. "
            "Schedule text can be fragmented or technical; if it is not enough to support a complete customer-facing answer, mark the claim partially_supported or not_found and require repair. "
            "Separate generic legal requirements from subclass-specific, stream-specific, sponsor-approval-specific, or special-process requirements. "
            "If a source appears to apply only to one subclass, stream, sponsor-approval scheme, income test, disclosure process, adverse-information rule, public-health-debt check, residence-history rule, or special process, do not let it become a generic rule. "
            "If the draft mixes generic requirements with subclass-specific add-ons without clearly labelling them, mark overall_verdict='repair'. "
            "If the draft is generic, fallback-like, says it needs to verify first, or does not directly answer the user's question, mark overall_verdict='repair'. "
            "If a personal yes/no conclusion lacks decisive facts, set overall_verdict='ask_decisive_question' or 'repair'. "
            "If sources contradict the claim, mark contradicted. If sources are incomplete, do not overstate confidence. "
            "Return ONLY JSON: {\"claim_verdicts\": [{\"claim_id\": string, \"verdict\": \"supported|partially_supported|contradicted|not_found\", \"confidence\": \"low|medium|high\", \"supporting_sources\": [{\"title\": string, \"authority\": string, \"source_type\": string, \"url\": string|null, \"section_ref\": string|null, \"quote_or_summary\": string|null, \"source_id\": string|null, \"chunk_id\": string|null}], \"required_correction\": string|null}], \"condition_verdicts\": [{\"condition_id\": string, \"blocks_general_rule_answer\": boolean, \"blocks_case_specific_conclusion\": boolean, \"required_next_question\": string|null, \"explanation\": string|null}], \"wrong_topic_or_frame_detected\": boolean, \"missing_decisive_keywords\": string[], \"overall_verdict\": \"pass|repair|ask_decisive_question|escalate|cannot_verify\", \"final_confidence\": \"low|medium|high\", \"coverage_report\": object}"
        )

    def _render(self, contract, verification: V2VerificationResult, guard) -> V2RenderedAnswer:
        if self._needs_repair_finalization(contract, verification, guard):
            repaired = self._repair_final_answer(contract, verification, guard)
            if repaired:
                return repaired
        rendered = super()._render(contract, verification, guard)
        rendered.answer = self._remove_internal_public_text(rendered.answer)
        rendered.confidence = self._calibrate_confidence(contract, verification, guard)
        return rendered

    def _needs_repair_finalization(self, contract, verification: V2VerificationResult, guard) -> bool:
        if guard.action in {"repair", "ask_decisive_question", "escalate"}:
            return True
        if verification.overall_verdict in {"repair", "ask_decisive_question", "escalate", "cannot_verify"}:
            return True
        if verification.missing_decisive_keywords:
            return True
        if self._draft_quality(contract)["is_generic_or_fallback"]:
            return True
        if self._format_repair_needed(self._last_question):
            return True
        rendered_text = "\n".join(
            [
                contract.answer_draft.direct_answer or "",
                contract.answer_draft.explanation or "",
                contract.answer_draft.practical_meaning or "",
                contract.answer_draft.caution or "",
            ]
        ).lower()
        return any(re.search(pattern, rendered_text, flags=re.I) for pattern in self.INTERNAL_PUBLIC_PATTERNS)

    def _repair_final_answer(self, contract, verification: V2VerificationResult, guard) -> V2RenderedAnswer | None:
        lang = contract.response_language
        q = guard.required_next_question or contract.answer_draft.one_next_question
        try:
            payload = {
                "latest_user_question": self._last_question,
                "answer_contract": contract.model_dump(exclude={"raw_model_output"}),
                "verification_result": verification.model_dump(exclude={"raw_model_output"}),
                "condition_guard": guard.model_dump(),
                "numbered_sources": (getattr(self, "_last_source_pack", []) or [])[:6],
                "public_output_language": lang,
                "format_profile": self._format_profile(self._last_question),
            }
            res = self.client.responses.create(
                model=self.repair_model,
                input=[
                    {"role": "system", "content": self._repair_prompt(lang)},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
            )
            text = self._remove_internal_public_text((res.output_text or "").strip())
            if not text:
                return None
            confidence = self._calibrate_confidence(contract, verification, guard)
            next_action = "answer"
            follow: list[str] = []
            missing: list[str] = []
            if guard.action == "ask_decisive_question":
                next_action = "ask_followup"
                if q:
                    follow = [q]
                    missing = [q]
            if guard.action == "escalate" or contract.risk_flags.requires_lawyer_handoff:
                next_action = "suggest_consultation"
                confidence = "low"
            return V2RenderedAnswer(
                answer=text,
                confidence=confidence,
                next_action=next_action,
                escalate=next_action == "suggest_consultation",
                follow_up_questions=follow,
                missing_facts=missing,
                user_display_mode=(
                    "ask_one_question"
                    if next_action == "ask_followup"
                    else ("escalate_with_brief_reason" if next_action == "suggest_consultation" else "direct_short")
                ),
                compact_sources=self._compact_sources(verification),
            )
        except Exception:
            return None

    def _repair_prompt(self, lang: str) -> str:
        language_rule = "Write in Simplified Chinese." if lang == "zh" else "Write in English."
        return (
            "You write the final public answer for an Australian immigration-law website assistant. "
            "Use the answer contract, verifier result, condition guard, and numbered sources. Your job is to produce the corrected customer-facing answer, not to discuss the internal verification process. "
            "Most importantly: do not dump all source information into the answer. Answer only the user's exact question. "
            "Separate generic requirements from subclass-specific, stream-specific, sponsor-approval-specific, income, disclosure, public-health-debt, residence-history, adverse-information, or special-process requirements. "
            "Do not present subclass-specific conditions as generic law. If a condition appears to apply only to a specific subclass, stream, sponsor-approval scheme, or process, put it under 'Important distinction' or omit it. "
            "For a direct rule, key requirement, criterion, sponsor requirement, or checklist-like question, use exactly this structure when possible: "
            "### Short answer\nOne or two direct sentences. "
            "### Key requirements\n2 to 5 concise bullet points, each containing one rule only. "
            "### Important distinction\nOnly if some retrieved conditions are subclass-specific, stream-specific, or process-specific. "
            "### Next step\nOnly if one short clarification is genuinely useful. "
            "Do not use a separate 'Practical meaning' section for criterion lookup questions unless the user asks for practical steps. "
            "Never mention: verification indicates, missing keywords, source pack, numbered sources, answer contract, verifier, retrieved chunks, or draft. "
            "Do not say 'I need to verify first'. Do not start with a caveat. Start with the answer. "
            "Use bullets for requirement lists. Avoid long paragraphs. Avoid repeating the same rule in multiple sections. "
            "If facts are insufficient for a personal eligibility conclusion, explain the general rule first and ask one decisive question. "
            + language_rule
        )

    def _draft_quality(self, contract) -> dict[str, Any]:
        answer = "\n".join(
            part
            for part in [
                contract.answer_draft.direct_answer,
                contract.answer_draft.explanation or "",
                contract.answer_draft.practical_meaning or "",
                contract.answer_draft.caution or "",
            ]
            if part
        )
        generic = contract.answer_scope == "cannot_answer" or any(
            re.search(pattern, answer, flags=re.I) for pattern in self.GENERIC_DRAFT_PATTERNS
        )
        return {
            "is_generic_or_fallback": bool(generic),
            "answer_scope": contract.answer_scope,
            "direct_answer_chars": len(contract.answer_draft.direct_answer or ""),
        }

    def _format_repair_needed(self, question: str) -> bool:
        return any(re.search(pattern, question or "", flags=re.I) for pattern in self.FORMAT_REPAIR_PATTERNS)

    def _format_profile(self, question: str) -> dict[str, Any]:
        return {
            "is_direct_criterion_or_requirement_question": self._format_repair_needed(question),
            "preferred_sections": ["Short answer", "Key requirements", "Important distinction", "Next step"],
            "bullet_requirements": True,
            "avoid_practical_meaning_for_criterion_lookup": True,
        }

    def _remove_internal_public_text(self, text: str) -> str:
        out = self._clean(text or "")
        for pattern in self.INTERNAL_PUBLIC_PATTERNS:
            out = re.sub(pattern, "", out, flags=re.I)
        return re.sub(r"\n{3,}", "\n\n", out).strip()

    def _calibrate_confidence(self, contract, verification: V2VerificationResult, guard) -> Confidence:
        if guard.action == "escalate" or contract.risk_flags.any_high_risk():
            return "low"
        if any(v.verdict in {"contradicted", "not_found"} for v in verification.claim_verdicts):
            return "low"
        if verification.overall_verdict == "cannot_verify":
            return "low"
        if guard.action == "ask_decisive_question":
            return "medium" if verification.final_confidence == "high" else verification.final_confidence
        if verification.overall_verdict == "repair" or verification.missing_decisive_keywords:
            return "medium"
        if verification.final_confidence == "high":
            return "high"
        if any(v.verdict == "supported" for v in verification.claim_verdicts):
            return "medium"
        return verification.final_confidence
