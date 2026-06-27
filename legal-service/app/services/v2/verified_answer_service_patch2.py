from __future__ import annotations

import json
import os
import re
from typing import Any

from sqlalchemy.orm import Session

from app.schemas.query import QueryRequest
from app.schemas.state import LiveSourceChunk
from app.services.v2.verified_answer_service import (
    Confidence,
    QueryServiceV2,
    V2ClaimVerdict,
    V2LegalClaim,
    V2LawyerLesson,
    V2RenderedAnswer,
    V2VerificationResult,
    _extract_json_object,
)


class QueryServiceV2Patch2(QueryServiceV2):
    """V2 LLM-verified legal answer path.

    This version deliberately removes the earlier deterministic verifier shortcut.
    Retrieved local/live sources are evidence for the LLM verifier, not a
    deterministic pass/fail authority. If verification finds a bad, incomplete,
    or fallback-like draft, a controlled repair/finalization LLM writes the final
    customer-facing answer before it is returned.
    """

    STOP_TERMS = {
        "the", "and", "or", "for", "with", "from", "that", "this", "they",
        "them", "their", "what", "when", "where", "which", "does", "need",
        "have", "has", "applicant", "application", "visa", "subclass",
        "requirement", "requirements", "usually", "generally", "legal", "rule",
        "answer", "person", "people", "current", "relevant", "australia",
        "australian", "must", "should", "can", "could", "would", "about",
    }

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

    def __init__(self) -> None:
        super().__init__()
        self.repair_model = os.getenv("V2_REPAIR_MODEL", self.verifier_model)
        self._active_lessons: list[V2LawyerLesson] = []
        self._last_source_pack: list[dict[str, Any]] = []

    def _lessons(self, db: Session, question: str) -> list[V2LawyerLesson]:
        lessons = super()._lessons(db, question)
        self._active_lessons = lessons
        return lessons

    def _verify(self, db: Session, payload: QueryRequest, contract):
        chunks, local_debug = self._retrieve_chunks(db, payload, contract)
        live_chunks: list[LiveSourceChunk] = []
        live_debug: dict[str, Any] = {"used_live_fetch": False}

        if self.online_enabled and (
            not chunks
            or any(
                "home_affairs" in c.source_priority or "policy" in c.source_priority
                for c in contract.legal_claims_to_verify
            )
        ):
            try:
                live = self.live_retrieval_service.retrieve(
                    question=self._verification_query(payload, contract),
                    preferred_domains=["immi.homeaffairs.gov.au", "legislation.gov.au"],
                    known_facts={"v2_contract": contract.model_dump()},
                    max_urls=4,
                    max_chunks=6,
                )
                live_chunks = live.chunks
                live_debug = live.model_dump()
            except Exception as exc:
                live_debug = {"used_live_fetch": False, "error": str(exc)[:500]}

        pack = self._source_pack(chunks, live_chunks)
        self._last_source_pack = pack
        citations = self._citations(chunks, live_chunks)
        if not pack:
            result = V2VerificationResult(
                claim_verdicts=[
                    V2ClaimVerdict(claim_id=c.claim_id, verdict="not_found", confidence="low")
                    for c in contract.legal_claims_to_verify
                ],
                overall_verdict="cannot_verify",
                final_confidence="low",
                coverage_report={
                    "source_pack_available": False,
                    "verification_mode": "no_sources",
                    "deterministic_verifier_removed": True,
                    "draft_quality": self._draft_quality(contract),
                },
            )
            return result, citations, {
                "local_retrieval": local_debug,
                "live_retrieval": live_debug,
                "source_pack": [],
                "verification_mode": "no_sources",
            }

        try:
            msg = {
                "answer_contract": contract.model_dump(exclude={"raw_model_output"}),
                "draft_quality": self._draft_quality(contract),
                "relevant_lawyer_lessons": [lesson.model_dump() for lesson in getattr(self, "_active_lessons", [])],
                "numbered_sources": pack,
            }
            res = self.client.responses.create(
                model=self.verifier_model,
                input=[
                    {"role": "system", "content": self._verifier_prompt()},
                    {"role": "user", "content": json.dumps(msg, ensure_ascii=False)},
                ],
            )
            parsed = _extract_json_object(res.output_text or "")
            if not isinstance(parsed, dict):
                raise ValueError("no JSON object")
            result = V2VerificationResult.model_validate(parsed)
            result.raw_model_output = parsed
        except Exception as exc:
            supports = [self._support_from_pack(x) for x in pack[:3]]
            result = V2VerificationResult(
                claim_verdicts=[
                    V2ClaimVerdict(
                        claim_id=c.claim_id,
                        verdict="partially_supported",
                        confidence="low",
                        supporting_sources=supports,
                        required_correction=(
                            "The answer must be rewritten from the available sources; "
                            "do not display fallback or internal verification wording."
                        ),
                    )
                    for c in contract.legal_claims_to_verify
                ],
                overall_verdict="repair",
                final_confidence="low",
                coverage_report={"verifier_fallback": True, "error": str(exc)[:500]},
            )

        result.coverage_report.update(
            {
                "local_chunk_count": len(chunks),
                "live_chunk_count": len(live_chunks),
                "online_enabled": self.online_enabled,
                "checked_claim_count": len(contract.legal_claims_to_verify),
                "verification_mode": result.coverage_report.get("verification_mode") or "llm_verifier_mandatory",
                "deterministic_verifier_removed": True,
                "draft_quality": self._draft_quality(contract),
            }
        )
        return result, citations, {
            "local_retrieval": local_debug,
            "live_retrieval": live_debug,
            "source_pack": pack,
            "verification_mode": result.coverage_report.get("verification_mode"),
        }

    def _verifier_prompt(self) -> str:
        return (
            "You are a strict legal verification layer for an Australian immigration-law website assistant. "
            "You do not write the final public answer. Work only from the answer contract, relevant lawyer lessons, draft quality, and numbered sources. "
            "Do not verify merely by keyword overlap. Decide whether the draft is legally complete enough for the user's exact question. "
            "Schedule text can be fragmented or technical; if it is not enough to support a complete customer-facing answer, mark the claim partially_supported or not_found and require repair. "
            "If the draft is generic, fallback-like, says it needs to verify first, or does not directly answer the user's question, mark overall_verdict='repair'. "
            "If relevant lawyer lessons list must_include terms and the draft misses them, require repair. "
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
        rendered_text = "\n".join([
            contract.answer_draft.direct_answer or "",
            contract.answer_draft.explanation or "",
            contract.answer_draft.practical_meaning or "",
            contract.answer_draft.caution or "",
        ]).lower()
        return any(re.search(pattern, rendered_text, flags=re.I) for pattern in self.INTERNAL_PUBLIC_PATTERNS)

    def _repair_final_answer(self, contract, verification: V2VerificationResult, guard) -> V2RenderedAnswer | None:
        lang = contract.response_language
        q = guard.required_next_question or contract.answer_draft.one_next_question
        try:
            payload = {
                "answer_contract": contract.model_dump(exclude={"raw_model_output"}),
                "verification_result": verification.model_dump(exclude={"raw_model_output"}),
                "condition_guard": guard.model_dump(),
                "relevant_lawyer_lessons": [lesson.model_dump() for lesson in getattr(self, "_active_lessons", [])],
                "numbered_sources": (getattr(self, "_last_source_pack", []) or [])[:6],
                "public_output_language": lang,
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
            follow = []
            missing = []
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
            "Use the answer contract, verifier result, lawyer lessons, and numbered sources. "
            "Your job is to produce the corrected customer-facing answer, not to discuss the internal verification process. "
            "Start with the direct answer. Include any required correction naturally in the Short answer or Why section, not as an internal warning. "
            "Never mention verification, missing keywords, source pack, numbered sources, answer contract, verifier, retrieved chunks, or draft. "
            "If the facts are insufficient for a personal eligibility conclusion, explain the general rule first and ask only one decisive question. "
            "If source coverage is incomplete, say this is general information and recommend lawyer review only when genuinely needed. "
            "Use short Markdown sections: ### Short answer, ### Why, ### Practical meaning, and ### Important caution only if needed. "
            + language_rule
        )

    def _retrieve_chunks(self, db: Session, payload: QueryRequest, contract):
        by_id = {}
        debug = []
        claims = contract.legal_claims_to_verify or [
            V2LegalClaim(
                claim_id="c1",
                claim=payload.question,
                source_priority=["home_affairs", "legislation", "local_guidance"],
            )
        ]
        for claim in claims[:4]:
            query = " ".join(
                x
                for x in [claim.claim, claim.topic or "", claim.subclass or "", claim.stream or "", payload.question]
                if x
            )
            try:
                qp = QueryRequest(
                    **{
                        **payload.model_dump(),
                        "question": query,
                        "top_k": min(max(payload.top_k or self.max_chunks, 4), self.max_chunks),
                    }
                )
                chunks, dbg = self.retrieval_service.retrieve(db, qp)
                debug.append({"query": query, "debug": dbg})
                for chunk in chunks:
                    by_id[chunk.id] = chunk
            except Exception as exc:
                debug.append({"query": query, "error": str(exc)[:500]})
        ranked = self._rank_chunks(list(by_id.values()), payload, contract, getattr(self, "_active_lessons", []))
        return ranked[: self.max_chunks], {
            "queries": debug,
            "reranked_chunk_ids": [chunk.id for chunk in ranked[: self.max_chunks]],
        }

    def _rank_chunks(self, chunks, payload: QueryRequest, contract, lessons: list[V2LawyerLesson]):
        if not chunks:
            return []
        positive_terms = self._query_terms(payload.question, contract, lessons)
        negative_terms = self._negative_terms(contract, lessons)

        def score(chunk) -> tuple[float, str]:
            source = chunk.source
            title = (source.title if source else "") or ""
            authority = (source.authority if source else "") or ""
            source_type = (source.source_type if source else "") or ""
            section = chunk.section_ref or ""
            text = " ".join([title, authority, source_type, section, chunk.heading or "", chunk.text or ""]).lower()
            matched = sum(1 for term in positive_terms if self._contains_phrase(text, term))
            negative = sum(1 for term in negative_terms if self._contains_phrase(text, term))
            value = matched * 3.0 - negative * 4.0
            if "home affairs" in authority.lower() or "immi.homeaffairs" in (source.url if source else ""):
                value += 3.0
            if "federal register" in authority.lower() or "legislation" in authority.lower():
                value += 2.0
            if source_type.lower() in {"guidance", "procedure"}:
                value += 1.5
            if source_type.lower() == "legislation":
                value += 1.0
            return value, title

        return sorted(chunks, key=score, reverse=True)

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

    def _query_terms(self, question: str, contract, lessons: list[V2LawyerLesson]) -> set[str]:
        text = " ".join(
            [
                question,
                *[c.claim for c in contract.legal_claims_to_verify],
                *[c.topic or "" for c in contract.legal_claims_to_verify],
                *[c.subclass or "" for c in contract.legal_claims_to_verify],
                *[c.stream or "" for c in contract.legal_claims_to_verify],
                *[term for lesson in lessons for term in lesson.must_include],
            ]
        )
        return self._significant_terms(text)

    def _negative_terms(self, contract, lessons: list[V2LawyerLesson]) -> set[str]:
        terms = set()
        for lesson in lessons:
            terms.update(self._significant_terms(" ".join(lesson.must_not_include)))
        terms.update(self._significant_terms(" ".join(contract.topic_control.must_not_use_previous_topics)))
        return terms

    def _significant_terms(self, text: str) -> set[str]:
        normalized = self._normalize_phrase(text)
        terms = set()
        for phrase in re.findall(r"[a-z0-9]+(?:\s+[a-z0-9]+){0,3}|[\u3400-\u9fff]{2,}", normalized):
            phrase = phrase.strip()
            pieces = phrase.split()
            if len(pieces) == 1:
                token = pieces[0]
                if token in self.STOP_TERMS or len(token) < 3:
                    continue
                terms.add(token)
            elif any(piece not in self.STOP_TERMS for piece in pieces):
                terms.add(phrase)
        for number in re.findall(r"\b[0-9]{3}[a-z]?\b", normalized):
            terms.add(number)
        return {x for x in terms if x}

    def _normalize_phrase(self, value: str) -> str:
        return re.sub(r"\s+", " ", (value or "").strip().lower())

    def _contains_phrase(self, text: str, phrase: str) -> bool:
        phrase = self._normalize_phrase(phrase)
        return True if not phrase else phrase in self._normalize_phrase(text)

    def _remove_internal_public_text(self, text: str) -> str:
        out = self._clean(text or "")
        for pattern in self.INTERNAL_PUBLIC_PATTERNS:
            out = re.sub(pattern, "", out, flags=re.I)
        out = re.sub(r"\n{3,}", "\n\n", out).strip()
        return out

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
