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
    V2ConditionVerdict,
    V2LegalClaim,
    V2LawyerLesson,
    V2RenderedAnswer,
    V2VerificationResult,
    _extract_json_object,
)


class QueryServiceV2Patch2(QueryServiceV2):
    """V2 precision/latency patch.

    This patch avoids case-by-case shortcuts. The optional deterministic verifier
    shortcut is evidence-driven: it uses the model's own claims, active lawyer
    lessons, retrieved source text, source authority, and condition/risk state.
    If generic evidence coverage is weak, it falls back to the existing verifier
    LLM path.
    """

    STOP_TERMS = {
        "the", "and", "or", "for", "with", "from", "that", "this", "they",
        "them", "their", "what", "when", "where", "which", "does", "need",
        "have", "has", "applicant", "application", "visa", "subclass",
        "requirement", "requirements", "usually", "generally", "legal", "rule",
        "answer", "person", "people", "current", "relevant", "australia",
        "australian", "must", "should", "can", "could", "would", "about",
    }

    def __init__(self) -> None:
        super().__init__()
        self.deterministic_verifier_enabled = os.getenv(
            "V2_DETERMINISTIC_VERIFIER_ENABLED", "true"
        ).strip().lower() in {"1", "true", "yes"}
        self._active_lessons: list[V2LawyerLesson] = []

    def _lessons(self, db: Session, question: str) -> list[V2LawyerLesson]:
        lessons = super()._lessons(db, question)
        self._active_lessons = lessons
        return lessons

    def _verify(self, db: Session, payload: QueryRequest, contract):
        lessons = getattr(self, "_active_lessons", []) or []
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
        citations = self._citations(chunks, live_chunks)
        if not pack:
            result = V2VerificationResult(
                claim_verdicts=[
                    V2ClaimVerdict(claim_id=c.claim_id, verdict="not_found", confidence="low")
                    for c in contract.legal_claims_to_verify
                ],
                overall_verdict="cannot_verify",
                final_confidence="low",
                coverage_report={"source_pack_available": False, "verification_mode": "no_sources"},
            )
            return result, citations, {
                "local_retrieval": local_debug,
                "live_retrieval": live_debug,
                "source_pack": [],
                "verification_mode": "no_sources",
            }

        deterministic = self._try_deterministic_verification(contract, lessons, pack, live_chunks)
        if deterministic is not None:
            deterministic.coverage_report.update(
                {
                    "local_chunk_count": len(chunks),
                    "live_chunk_count": len(live_chunks),
                    "online_enabled": self.online_enabled,
                    "checked_claim_count": len(contract.legal_claims_to_verify),
                    "verification_mode": "deterministic_local_evidence",
                }
            )
            return deterministic, citations, {
                "local_retrieval": local_debug,
                "live_retrieval": live_debug,
                "source_pack": pack,
                "verification_mode": "deterministic_local_evidence",
            }

        try:
            msg = {
                "answer_contract": contract.model_dump(exclude={"raw_model_output"}),
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
                "verification_mode": result.coverage_report.get("verification_mode") or "llm_verifier",
            }
        )
        return result, citations, {
            "local_retrieval": local_debug,
            "live_retrieval": live_debug,
            "source_pack": pack,
            "verification_mode": result.coverage_report.get("verification_mode"),
        }

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
                for x in [
                    claim.claim,
                    claim.topic or "",
                    claim.subclass or "",
                    claim.stream or "",
                    payload.question,
                ]
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
        claim_text = " ".join([payload.question, *[c.claim for c in contract.legal_claims_to_verify]]).lower()
        allow_schedule_9 = any(
            term in claim_text
            for term in ["schedule 9", "special entry", "clearance", "special entry and clearance"]
        )

        def score(chunk) -> tuple[float, str]:
            source = chunk.source
            title = (source.title if source else "") or ""
            authority = (source.authority if source else "") or ""
            source_type = (source.source_type if source else "") or ""
            section = chunk.section_ref or ""
            text = " ".join(
                [title, authority, source_type, section, chunk.heading or "", chunk.text or ""]
            ).lower()
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
            if "schedule 9" in title.lower() and not allow_schedule_9:
                value -= 6.0
            if "special entry and clearance" in title.lower() and not allow_schedule_9:
                value -= 4.0
            return value, title

        return sorted(chunks, key=score, reverse=True)

    def _try_deterministic_verification(
        self,
        contract,
        lessons: list[V2LawyerLesson],
        pack: list[dict[str, Any]],
        live_chunks: list[LiveSourceChunk],
    ) -> V2VerificationResult | None:
        if not self.deterministic_verifier_enabled:
            return None
        if contract.risk_flags.any_high_risk() or contract.risk_flags.requires_lawyer_handoff:
            return None
        if contract.case_specific_yes_no_given and self._has_unknown_blocking_condition(contract):
            return None
        if not pack:
            return None

        answer_text = self._answer_text(contract)
        source_text = self._pack_text(pack)
        missing_terms = []
        for term in self._lesson_must_include_terms(lessons):
            if not self._contains_phrase(answer_text.lower(), term):
                missing_terms.append(term)
        if missing_terms:
            return V2VerificationResult(
                claim_verdicts=[
                    V2ClaimVerdict(
                        claim_id=c.claim_id,
                        verdict="partially_supported",
                        confidence="medium",
                        supporting_sources=[self._support_from_pack(x) for x in pack[:3]],
                        required_correction="Add the missing decisive point(s): "
                        + ", ".join(missing_terms[:5]),
                    )
                    for c in contract.legal_claims_to_verify
                ],
                missing_decisive_keywords=missing_terms[:8],
                overall_verdict="repair",
                final_confidence="medium",
                coverage_report={
                    "deterministic_gate": "lesson_terms_missing_from_answer",
                    "missing_terms": missing_terms[:8],
                },
            )

        claim_verdicts = []
        claim_debug = []
        decisive_failures = 0
        all_decisive_high = True
        for claim in contract.legal_claims_to_verify or []:
            claim_terms = self._claim_terms(claim)
            source_coverage = self._term_coverage(claim_terms, source_text.lower())
            authoritative = self._has_authoritative_source(pack)
            enough = bool(claim_terms) and (
                source_coverage["ratio"] >= 0.42
                or source_coverage["matched_count"] >= min(3, max(1, len(claim_terms)))
            )
            if enough:
                confidence: Confidence = "high" if authoritative and source_coverage["ratio"] >= 0.6 else "medium"
                verdict = "supported"
            else:
                confidence = "low"
                verdict = "not_found" if claim.importance == "decisive" else "partially_supported"
                if claim.importance == "decisive":
                    decisive_failures += 1
            if confidence != "high" and claim.importance == "decisive":
                all_decisive_high = False
            claim_verdicts.append(
                V2ClaimVerdict(
                    claim_id=claim.claim_id,
                    verdict=verdict,
                    confidence=confidence,
                    supporting_sources=[self._support_from_pack(x) for x in pack[:3]] if verdict != "not_found" else [],
                )
            )
            claim_debug.append(
                {
                    "claim_id": claim.claim_id,
                    "terms": sorted(claim_terms),
                    "matched_terms": source_coverage["matched"],
                    "missing_terms": source_coverage["missing"],
                    "ratio": source_coverage["ratio"],
                    "authoritative_source": authoritative,
                    "verdict": verdict,
                }
            )
        if not claim_verdicts or decisive_failures:
            return None

        condition_verdicts = [
            V2ConditionVerdict(
                condition_id=cond.condition_id,
                blocks_general_rule_answer=False,
                blocks_case_specific_conclusion=cond.known_status in {"unknown", "contradicted"}
                and cond.required_for in {"case_specific_conclusion", "deadline_advice"},
                required_next_question=self._condition_question(contract.response_language, cond.condition)
                if cond.known_status in {"unknown", "contradicted"}
                and cond.required_for in {"case_specific_conclusion", "deadline_advice"}
                else None,
                explanation=cond.effect_if_missing,
            )
            for cond in contract.decisive_conditions
        ]
        blocking = any(v.blocks_case_specific_conclusion for v in condition_verdicts)
        final_confidence: Confidence = "high" if all_decisive_high and not blocking else "medium"
        return V2VerificationResult(
            claim_verdicts=claim_verdicts,
            condition_verdicts=condition_verdicts,
            wrong_topic_or_frame_detected=False,
            missing_decisive_keywords=[],
            overall_verdict="ask_decisive_question" if contract.case_specific_yes_no_given and blocking else "pass",
            final_confidence=final_confidence,
            coverage_report={
                "deterministic_gate": "passed",
                "claim_term_coverage": claim_debug,
                "authoritative_source_present": self._has_authoritative_source(pack),
                "source_count": len(pack),
                "live_source_count": len(live_chunks),
            },
        )

    def _render(self, contract, verification: V2VerificationResult, guard) -> V2RenderedAnswer:
        rendered = super()._render(contract, verification, guard)
        rendered.confidence = self._calibrate_confidence(contract, verification, guard)
        if guard.action == "ask_decisive_question" and rendered.confidence == "high":
            rendered.confidence = "medium"
        if guard.action == "escalate" and rendered.confidence == "medium":
            rendered.confidence = "low"
        return rendered

    # ----- generic term/source helpers -----
    def _answer_text(self, contract) -> str:
        return "\n".join(
            part
            for part in [
                contract.answer_draft.direct_answer,
                contract.answer_draft.explanation or "",
                contract.answer_draft.practical_meaning or "",
                contract.answer_draft.caution or "",
            ]
            if part
        )

    def _pack_text(self, pack: list[dict[str, Any]]) -> str:
        return "\n".join(
            " ".join(str(item.get(key) or "") for key in ["title", "authority", "source_type", "section_ref", "heading", "text"])
            for item in pack
        )

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

    def _claim_terms(self, claim) -> set[str]:
        return self._significant_terms(" ".join([claim.claim, claim.topic or "", claim.subclass or "", claim.stream or ""]))

    def _lesson_must_include_terms(self, lessons: list[V2LawyerLesson]) -> list[str]:
        out = []
        seen = set()
        for lesson in lessons:
            for item in lesson.must_include:
                term = self._normalize_phrase(item)
                if term and term not in seen:
                    out.append(term)
                    seen.add(term)
        return out

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

    def _term_coverage(self, terms: set[str], text: str) -> dict[str, Any]:
        if not terms:
            return {"matched": [], "missing": [], "matched_count": 0, "total": 0, "ratio": 0.0}
        matched = sorted(term for term in terms if self._contains_phrase(text, term))
        missing = sorted(term for term in terms if term not in matched)
        return {
            "matched": matched,
            "missing": missing,
            "matched_count": len(matched),
            "total": len(terms),
            "ratio": round(len(matched) / max(len(terms), 1), 3),
        }

    def _has_authoritative_source(self, pack: list[dict[str, Any]]) -> bool:
        for item in pack:
            hay = " ".join(str(item.get(k) or "") for k in ["authority", "title", "url", "source_type"]).lower()
            if any(term in hay for term in ["home affairs", "immi.homeaffairs", "legislation", "federal register"]):
                return True
        return False

    def _has_unknown_blocking_condition(self, contract) -> bool:
        return any(
            cond.known_status in {"unknown", "contradicted"}
            and cond.required_for in {"case_specific_conclusion", "deadline_advice"}
            for cond in contract.decisive_conditions
        )

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
