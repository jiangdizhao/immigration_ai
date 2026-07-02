from __future__ import annotations

"""Proposal-first, verification-after legal answer service.

This service deliberately keeps the original GPT-style proposal memo intact and
uses JSON only as a machine index for search and verification. It is designed to
avoid the old failure mode where routing/fact gates suppress the LLM before it
can generate a useful legal map.
"""

from dataclasses import dataclass, field
import json
import os
import re
from typing import Any

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.source import CitationOut
from app.services.live_retrieval_service import LiveRetrievalService
from app.services.retrieval_service import RetrievalService
from app.schedule.schedule2_candidate_service import Schedule2CandidateSearchService
from app.schedule.schedule2_index_service import ScheduleIndexService


@dataclass(slots=True)
class EvidenceBundle:
    local_chunks: list[Any] = field(default_factory=list)
    live_chunks: list[Any] = field(default_factory=list)
    schedule_clauses: list[dict[str, Any]] = field(default_factory=list)
    schedule_candidates: list[dict[str, Any]] = field(default_factory=list)
    retrieval_runs: list[dict[str, Any]] = field(default_factory=list)
    live_debug: list[dict[str, Any]] = field(default_factory=list)


class ProposalFirstVerifiedAnswerService:
    """Free legal proposal first; strict source verification before final answer."""

    DEFAULT_MODEL = "gpt-5.4-mini"
    MAX_PROPOSAL_CHARS = 7000
    MAX_EVIDENCE_CHUNKS = 18
    MAX_SCHEDULE_CLAUSES = 28
    MAX_SEARCH_QUERIES = 10
    MAX_LIVE_QUERIES = 4

    def __init__(
        self,
        *,
        retrieval_service: RetrievalService | None = None,
        live_retrieval_service: LiveRetrievalService | None = None,
        schedule_candidate_service: Schedule2CandidateSearchService | None = None,
        schedule_index_service: ScheduleIndexService | None = None,
    ) -> None:
        self.settings = get_settings()
        self.model = os.getenv("PROPOSAL_FIRST_MODEL", os.getenv("REASONING_MODEL", self.DEFAULT_MODEL))
        self.verifier_model = os.getenv("PROPOSAL_FIRST_VERIFIER_MODEL", self.model)
        self.final_model = os.getenv("PROPOSAL_FIRST_FINAL_MODEL", self.model)
        self.retrieval_service = retrieval_service or RetrievalService()
        self.live_retrieval_service = live_retrieval_service or LiveRetrievalService()
        self.schedule_candidate_service = schedule_candidate_service or Schedule2CandidateSearchService()
        self.schedule_index_service = schedule_index_service or ScheduleIndexService()
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    def answer(
        self,
        *,
        db: Session,
        payload: QueryRequest,
        original_question: str,
        effective_question: str,
        conversation_history: list[dict[str, Any]] | None,
        known_facts: dict[str, Any] | None,
        response_language: str,
        matter_id: str | None,
    ) -> QueryResponse:
        known_facts = known_facts or {}
        conversation_history = conversation_history or []

        proposal = self._build_free_proposal(
            original_question=original_question,
            effective_question=effective_question,
            conversation_history=conversation_history,
            known_facts=known_facts,
            response_language=response_language,
        )

        if not bool(proposal.get("is_immigration_related", True)):
            politics_sensitive = self._is_politics_sensitive_text(
                original_question,
                effective_question,
                proposal.get("user_goal"),
                proposal.get("proposal_summary"),
                " ".join(self._string_list(proposal.get("risk_flags"))),
            )
            answer_text = (
                self._politics_sensitive_general_answer(response_language)
                if politics_sensitive
                else self._answer_general_question_directly(original_question or effective_question, response_language)
            )
            return QueryResponse(
                matter_id=matter_id,
                answer=answer_text,
                response_language="zh" if response_language == "zh" else "en",
                confidence="high" if politics_sensitive else "medium",
                issue_type="politics_sensitive_topic" if politics_sensitive else "general_topic",
                missing_facts=[],
                follow_up_questions=[],
                citations=[],
                compact_sources=[],
                escalate=False,
                next_action="answer",
                user_display_mode="direct_short",
                retrieval_debug={
                    "proposal_first_verified_answer": {
                        "used": True,
                        "non_immigration_fast_path": True,
                        "politics_sensitive": politics_sensitive,
                        "proposal": proposal,
                    }
                },
            )

        evidence = self._collect_evidence(
            db=db,
            payload=payload,
            effective_question=effective_question,
            known_facts=known_facts,
            proposal=proposal,
        )
        citations = self._build_citations(evidence)
        evidence_text = self._format_evidence_for_llm(evidence)

        verification = self._verify_proposal(
            original_question=original_question,
            effective_question=effective_question,
            known_facts=known_facts,
            proposal=proposal,
            evidence_text=evidence_text,
            response_language=response_language,
        )

        final = self._draft_verified_answer(
            original_question=original_question,
            effective_question=effective_question,
            known_facts=known_facts,
            proposal=proposal,
            verification=verification,
            evidence_text=evidence_text,
            response_language=response_language,
        )

        answer_text = str(final.get("answer") or "").strip()
        if not answer_text:
            answer_text = self._fallback_answer_from_verification(proposal=proposal, verification=verification, response_language=response_language)

        missing_facts = self._string_list(final.get("missing_facts")) or self._string_list(proposal.get("missing_decisive_facts"))[:6]
        follow_ups = self._one_question(self._string_list(final.get("follow_up_questions")) or [str(proposal.get("one_decisive_question") or "")])
        next_action = "ask_followup" if follow_ups else self._normalize_next_action(final.get("next_action"))
        confidence = self._normalize_confidence(final.get("confidence") or verification.get("confidence"))

        debug = {
            "proposal_first_verified_answer": {
                "used": True,
                "paradigm": "free_proposal_memo_plus_structured_search_index_then_verification",
                "proposal": proposal,
                "verification": verification,
                "evidence_summary": {
                    "local_chunk_count": len(evidence.local_chunks),
                    "live_chunk_count": len(evidence.live_chunks),
                    "schedule_clause_count": len(evidence.schedule_clauses),
                    "schedule_candidate_count": len(evidence.schedule_candidates),
                    "retrieval_run_count": len(evidence.retrieval_runs),
                },
                "retrieval_runs": evidence.retrieval_runs,
                "live_debug": evidence.live_debug,
                "final_json": final,
            },
            "reasoning_model": self.model,
            "reasoning_mode": "proposal_first_verified_answer",
            "original_question": original_question,
            "effective_question": effective_question,
        }

        compact_sources = []
        seen_titles: set[str] = set()
        for citation in citations:
            if citation.title and citation.title not in seen_titles:
                seen_titles.add(citation.title)
                compact_sources.append(citation.title)
            if len(compact_sources) >= 5:
                break

        return QueryResponse(
            matter_id=matter_id,
            answer=answer_text,
            response_language="zh" if response_language == "zh" else "en",
            confidence=confidence,
            user_display_mode="answer_then_ask" if follow_ups else "general_with_warning",
            issue_type=str(final.get("issue_type") or verification.get("issue_type") or "visa_options_or_legal_discovery"),
            missing_facts=missing_facts,
            follow_up_questions=follow_ups,
            citations=citations[:10],
            compact_sources=compact_sources,
            escalate=bool(final.get("escalate", False)),
            next_action=next_action,
            retrieval_debug=debug,
        )



    def _is_politics_sensitive_text(self, *parts: object) -> bool:
        text = " ".join(str(part or "") for part in parts).lower()
        semantic_markers = (
            "politics_sensitive",
            "political_sensitive",
            "political_persuasion",
            "election_persuasion",
            "election_related",
            "partisan",
        )
        if any(marker in text for marker in semantic_markers):
            return True

        persuasion_phrases = (
            "who should i vote",
            "which party should i vote",
            "which candidate should i vote",
            "tell me who to vote",
            "convince me to vote",
            "persuade me to vote",
            "should i vote for",
            "vote for trump",
            "vote for biden",
            "vote for albanese",
            "vote for dutton",
            "support labor party",
            "support liberal party",
            "support the greens",
        )
        if any(phrase in text for phrase in persuasion_phrases):
            return True

        political_terms = (
            " election",
            " elections",
            " voting",
            " political party",
            " candidate",
            " campaign",
            " president",
            " prime minister",
            " parliament",
            " labor party",
            " liberal party",
            " the greens",
            " republican",
            " democrat",
            " trump",
            " biden",
            " albanese",
            " dutton",
        )
        opinion_or_action_terms = (
            "should",
            "better",
            "worse",
            "support",
            "oppose",
            "vote",
            "trust",
            "prefer",
            "best",
            "worst",
            "recommend",
            "persuade",
            "convince",
        )
        return any(term in text for term in political_terms) and any(
            term in text for term in opinion_or_action_terms
        )

    def _politics_sensitive_general_answer(self, response_language: str) -> str:
        if response_language == "zh":
            return (
                "我不能协助政治敏感、选举投票建议、党派立场或政治说服类问题。"
                "你可以继续询问普通非政治问题，或澳洲移民、签证和预约律师相关问题。"
            )
        return (
            "I can’t help with politically sensitive, election-voting, partisan, "
            "or political persuasion topics. You can ask an ordinary non-political "
            "general question, or an Australian immigration, visa, or lawyer appointment question."
        )

    def _answer_general_question_directly(self, question: str, response_language: str = "en") -> str:
        language_rule = (
            "Write the answer in Simplified Chinese."
            if response_language == "zh"
            else "Write the answer in English."
        )
        system_prompt = (
            "You are a helpful general assistant. Answer the user's ordinary non-political general question directly and concisely. "
            "Do not mention immigration-law retrieval, legal sources, citations, or internal routing. "
            "Do not answer politically sensitive, election-voting, partisan, or political persuasion questions. "
            f"{language_rule}"
        )
        try:
            response = self.client.responses.create(
                model=self.final_model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"User question:\n{question}\n"},
                ],
            )
            text = (response.output_text or "").strip()
            if text:
                return text
        except Exception:
            pass
        return (
            "抱歉，我现在无法回答这个问题。"
            if response_language == "zh"
            else "I’m sorry, but I couldn’t answer that question right now."
        )

    # ------------------------------------------------------------------
    # Stage 1: free proposal memo + structured search index
    # ------------------------------------------------------------------
    def _build_free_proposal(
        self,
        *,
        original_question: str,
        effective_question: str,
        conversation_history: list[dict[str, Any]],
        known_facts: dict[str, Any],
        response_language: str,
    ) -> dict[str, Any]:
        history_text = self._conversation_history_text(conversation_history)
        known_facts_json = json.dumps(known_facts, ensure_ascii=False)
        language_rule = self._language_rule(response_language)
        system_prompt = (
            "You are an expert Australian immigration legal research assistant.\n"
            "This is the FIRST internal proposal stage, before source verification.\n"
            "Do NOT be timid. Do NOT require all facts before proposing possible legal pathways.\n"
            "Generate a rich, original-ChatGPT-style legal exploration memo first.\n"
            "The memo should include likely options, alternative options, weak/excluded options, edge cases, practical warnings, and decisive facts.\n"
            "Then provide a structured index used only for search and verification.\n"
            "Do not pretend the proposal is final legal advice. Mark it as a proposal needing verification.\nIf the user request is not about Australian immigration, visas, migration law, or booking a lawyer appointment, set is_immigration_related=false. Ordinary non-immigration general questions are allowed through backend fast answering. For election-voting advice, partisan persuasion, or political persuasion, include 'politics_sensitive' in risk_flags.\n"
            "Return ONLY valid JSON with this exact top-level shape:\n"
            "{\n"
            '  "is_immigration_related": boolean,\n'
            '  "non_immigration_response": string | null,\n'
            '  "proposal_memo_markdown": string,\n'
            '  "proposal_summary": string,\n'
            '  "candidate_index": [\n'
            '    {"candidate_label": string, "subclass": string | null, "stream_or_activity": string | null, "confidence_before_verification": "high" | "medium" | "low", "why_possible": string[], "why_maybe_not": string[], "must_verify": string[], "search_queries": string[]}\n'
            '  ],\n'
            '  "search_plan": string[],\n'
            '  "missing_decisive_facts": string[],\n'
            '  "one_decisive_question": string | null,\n'
            '  "risk_flags": string[]\n'
            "}\n"
            "Preserve abundance in proposal_memo_markdown. JSON must not compress away useful reasoning.\n"
        )
        system_prompt += language_rule
        user_prompt = (
            f"Original user message:\n{original_question}\n\n"
            f"Effective standalone question:\n{effective_question}\n\n"
            f"Known facts JSON:\n{known_facts_json}\n\n"
            f"Recent conversation history:\n{history_text or 'N/A'}\n"
        )
        parsed = self._call_json(model=self.model, system_prompt=system_prompt, user_prompt=user_prompt)
        if not parsed:
            return {
                "is_immigration_related": True,
                "non_immigration_response": None,
                "proposal_memo_markdown": f"Initial proposal could not be generated cleanly. User question: {effective_question}",
                "proposal_summary": effective_question,
                "candidate_index": [],
                "search_plan": [effective_question],
                "missing_decisive_facts": [],
                "one_decisive_question": None,
                "risk_flags": ["proposal_json_parse_failed"],
            }
        parsed["proposal_memo_markdown"] = str(parsed.get("proposal_memo_markdown") or "")[: self.MAX_PROPOSAL_CHARS]
        parsed["candidate_index"] = self._normalize_candidate_index(parsed.get("candidate_index"))
        parsed["search_plan"] = self._string_list(parsed.get("search_plan"))
        parsed["missing_decisive_facts"] = self._string_list(parsed.get("missing_decisive_facts"))
        parsed["risk_flags"] = self._string_list(parsed.get("risk_flags"))
        return parsed

    # ------------------------------------------------------------------
    # Stage 2: comprehensive local Schedule/RAG + official live search
    # ------------------------------------------------------------------
    def _collect_evidence(
        self,
        *,
        db: Session,
        payload: QueryRequest,
        effective_question: str,
        known_facts: dict[str, Any],
        proposal: dict[str, Any],
    ) -> EvidenceBundle:
        bundle = EvidenceBundle()
        queries = self._search_queries_from_proposal(effective_question, proposal)

        # 1. Local hybrid RAG over legal_sources/source_chunks.
        for query in queries[: self.MAX_SEARCH_QUERIES]:
            try:
                search_payload = QueryRequest(**{**payload.model_dump(), "question": query, "top_k": max(payload.top_k or 8, 8)})
                chunks, debug = self.retrieval_service.retrieve(db, search_payload)
                bundle.retrieval_runs.append({"query": query, "debug": self._thin_debug(debug)})
                self._extend_unique_chunks(bundle.local_chunks, chunks, limit=self.MAX_EVIDENCE_CHUNKS)
            except Exception as exc:
                bundle.retrieval_runs.append({"query": query, "error": str(exc)[:300]})

        # 2. Schedule 2 candidate search using proposal terms and candidate labels.
        schedule_query = "\n".join([effective_question, proposal.get("proposal_summary") or "", "\n".join(queries[:8])])
        try:
            candidates = self.schedule_candidate_service.search(question=schedule_query, known_facts=known_facts, limit=12)
        except Exception:
            candidates = []
        for candidate in candidates:
            item = candidate.model_dump() if hasattr(candidate, "model_dump") else dict(candidate)
            bundle.schedule_candidates.append(item)

        # 3. Direct Schedule 1 / Schedule 2 clauses for candidate subclass numbers.
        subclass_nums = self._candidate_subclass_numbers(proposal, bundle.schedule_candidates)
        for subclass in subclass_nums[:14]:
            for schedule_no in ("1", "2"):
                try:
                    clauses = self.schedule_index_service.clauses_for_subclass(subclass, schedule_no=schedule_no)
                except Exception:
                    clauses = []
                for clause in clauses[:8 if schedule_no == "2" else 4]:
                    row = {
                        "schedule_no": schedule_no,
                        "subclass": getattr(clause, "subclass", None),
                        "title": getattr(clause, "title", None),
                        "clause_ref": getattr(clause, "clause_ref", None),
                        "heading": getattr(clause, "heading", None),
                        "section_kind": getattr(clause, "section_kind", None),
                        "text": self._clip(" ".join(str(getattr(clause, "text", "") or "").split()), 1300),
                    }
                    bundle.schedule_clauses.append(row)
                    if len(bundle.schedule_clauses) >= self.MAX_SCHEDULE_CLAUSES:
                        break
                if len(bundle.schedule_clauses) >= self.MAX_SCHEDULE_CLAUSES:
                    break
            if len(bundle.schedule_clauses) >= self.MAX_SCHEDULE_CLAUSES:
                break

        # 4. Controlled official-source live retrieval. This verifies current guidance,
        # but the proposal memo is already preserved above.
        for query in queries[: self.MAX_LIVE_QUERIES]:
            try:
                live = self.live_retrieval_service.retrieve(
                    question=query,
                    preferred_domains=["immi.homeaffairs.gov.au", "www.homeaffairs.gov.au", "legislation.gov.au", "art.gov.au"],
                    issue_type="visa_options_or_legal_discovery",
                    operation_type="legal_discovery",
                    known_facts=known_facts,
                    max_urls=5,
                    max_chunks=6,
                )
                bundle.live_debug.append({"query": query, "debug": live.debug, "used_live_fetch": live.used_live_fetch})
                self._extend_unique_chunks(bundle.live_chunks, self._live_chunks_to_shims(live.chunks), limit=10)
            except Exception as exc:
                bundle.live_debug.append({"query": query, "error": str(exc)[:300]})

        return bundle

    # ------------------------------------------------------------------
    # Stage 3: verify proposal against gathered evidence
    # ------------------------------------------------------------------
    def _verify_proposal(
        self,
        *,
        original_question: str,
        effective_question: str,
        known_facts: dict[str, Any],
        proposal: dict[str, Any],
        evidence_text: str,
        response_language: str,
    ) -> dict[str, Any]:
        system_prompt = (
            "You are a strict Australian immigration legal verifier.\n"
            "You are checking a rich internal GPT proposal against retrieved Schedule 1, Schedule 2, local guidance, and official live evidence.\n"
            "Do not erase useful proposal content, but classify every important claim as supported, partially_supported, contradicted, not_found, or needs_lawyer_check.\n"
            "Correct the proposal when sources show a narrower rule.\n"
            "If evidence is incomplete, allow a provisional answer with clear uncertainty rather than refusing to help.\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{\n"
            '  "issue_type": string | null,\n'
            '  "confidence": "low" | "medium" | "high",\n'
            '  "verified_candidates": [{"candidate_label": string, "status": "supported" | "partially_supported" | "contradicted" | "not_found" | "needs_lawyer_check", "fit": "likely" | "possible" | "weak" | "excluded", "supported_points": string[], "corrections": string[], "missing_verification": string[], "evidence_numbers": number[]}],\n'
            '  "unsupported_or_contradicted_claims": string[],\n'
            '  "must_remove_or_qualify": string[],\n'
            '  "final_answer_allowed": boolean,\n'
            '  "one_decisive_question": string | null\n'
            "}\n"
        )
        system_prompt += self._language_rule(response_language)
        proposal_json = json.dumps(proposal, ensure_ascii=False)
        user_prompt = (
            f"Original question:\n{original_question}\n\n"
            f"Effective question:\n{effective_question}\n\n"
            f"Known facts JSON:\n{json.dumps(known_facts, ensure_ascii=False)}\n\n"
            f"Proposal JSON including full proposal memo:\n{proposal_json}\n\n"
            f"Evidence package:\n{evidence_text}\n"
        )
        parsed = self._call_json(model=self.verifier_model, system_prompt=system_prompt, user_prompt=user_prompt)
        if not parsed:
            return {
                "issue_type": "visa_options_or_legal_discovery",
                "confidence": "low",
                "verified_candidates": [],
                "unsupported_or_contradicted_claims": [],
                "must_remove_or_qualify": ["verification_json_parse_failed"],
                "final_answer_allowed": True,
                "one_decisive_question": proposal.get("one_decisive_question"),
            }
        return parsed

    # ------------------------------------------------------------------
    # Stage 4: final answer preserving richness but source-corrected
    # ------------------------------------------------------------------
    def _draft_verified_answer(
        self,
        *,
        original_question: str,
        effective_question: str,
        known_facts: dict[str, Any],
        proposal: dict[str, Any],
        verification: dict[str, Any],
        evidence_text: str,
        response_language: str,
    ) -> dict[str, Any]:
        system_prompt = (
            "You are drafting the final customer-facing answer for an Australian immigration service.\n"
            "Preserve the abundance and usefulness of the original proposal memo, but apply the verifier's corrections.\n"
            "Do not expose unsupported claims as facts. Qualify or remove them.\n"
            "Do not ask for every missing fact before answering. Answer first with a ranked option map if plausible options exist.\n"
            "Ask at most ONE decisive follow-up question.\n"
            "Do not mention internal JSON, internal proposal memo, retrieval debug, or source classes.\n"
            "Do not give guarantees or final legal advice.\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{\n"
            '  "answer": string,\n'
            '  "confidence": "low" | "medium" | "high",\n'
            '  "issue_type": string | null,\n'
            '  "missing_facts": string[],\n'
            '  "follow_up_questions": string[],\n'
            '  "escalate": boolean,\n'
            '  "next_action": "answer" | "ask_followup" | "suggest_consultation"\n'
            "}\n"
        )
        system_prompt += self._language_rule(response_language)
        user_prompt = (
            f"Original question:\n{original_question}\n\n"
            f"Effective question:\n{effective_question}\n\n"
            f"Known facts JSON:\n{json.dumps(known_facts, ensure_ascii=False)}\n\n"
            f"Original rich proposal JSON:\n{json.dumps(proposal, ensure_ascii=False)}\n\n"
            f"Verification JSON:\n{json.dumps(verification, ensure_ascii=False)}\n\n"
            f"Evidence package:\n{evidence_text}\n"
        )
        return self._call_json(model=self.final_model, system_prompt=system_prompt, user_prompt=user_prompt) or {}

    # ------------------------------------------------------------------
    # Evidence formatting and utility helpers
    # ------------------------------------------------------------------
    def _format_evidence_for_llm(self, evidence: EvidenceBundle) -> str:
        rows: list[str] = []
        n = 1
        for clause in evidence.schedule_clauses[: self.MAX_SCHEDULE_CLAUSES]:
            rows.append(
                f"[{n}] Schedule {clause.get('schedule_no')} subclass {clause.get('subclass')} {clause.get('clause_ref')} | {clause.get('title') or ''}\n"
                f"Heading: {clause.get('heading') or ''}\nText: {clause.get('text') or ''}"
            )
            n += 1
        for chunk in evidence.live_chunks[:10]:
            source = getattr(chunk, "source", None)
            rows.append(
                f"[{n}] LIVE/OFFICIAL | {getattr(source, 'title', '')} | {getattr(source, 'authority', '')} | {getattr(source, 'url', '')}\n"
                f"Heading: {getattr(chunk, 'heading', '') or getattr(chunk, 'section_ref', '') or ''}\nText: {self._clip(' '.join(str(getattr(chunk, 'text', '') or '').split()), 1400)}"
            )
            n += 1
        for chunk in evidence.local_chunks[: self.MAX_EVIDENCE_CHUNKS]:
            source = getattr(chunk, "source", None)
            rows.append(
                f"[{n}] LOCAL | {getattr(source, 'title', '')} | {getattr(source, 'authority', '')} | {getattr(source, 'url', '')}\n"
                f"Heading: {getattr(chunk, 'heading', '') or getattr(chunk, 'section_ref', '') or ''}\nText: {self._clip(' '.join(str(getattr(chunk, 'text', '') or '').split()), 1200)}"
            )
            n += 1
        return "\n\n".join(rows)[:36000]

    def _build_citations(self, evidence: EvidenceBundle) -> list[CitationOut]:
        citations: list[CitationOut] = []
        seen: set[str] = set()
        for chunk in [*evidence.live_chunks, *evidence.local_chunks]:
            source = getattr(chunk, "source", None)
            if not source:
                continue
            key = "|".join([
                str(getattr(source, "id", "") or ""),
                str(getattr(chunk, "id", "") or ""),
                str(getattr(source, "title", "") or ""),
            ])
            if key in seen:
                continue
            seen.add(key)
            text = " ".join(str(getattr(chunk, "text", "") or "").split())
            citations.append(
                CitationOut(
                    source_id=str(getattr(source, "id", "") or "ephemeral-source"),
                    chunk_id=str(getattr(chunk, "id", "") or "ephemeral-chunk"),
                    title=str(getattr(source, "title", "") or "Official/source material"),
                    authority=str(getattr(source, "authority", "") or "Unknown authority"),
                    citation_text=getattr(source, "citation_text", None),
                    section_ref=getattr(chunk, "section_ref", None) or getattr(chunk, "heading", None),
                    url=str(getattr(source, "url", "") or ""),
                    quote_text=text[:420] if text else None,
                    rationale="Used to verify the proposal-first answer.",
                    confidence_score=0.75,
                )
            )
            if len(citations) >= 12:
                break
        return citations

    def _live_chunks_to_shims(self, live_chunks: list[Any]) -> list[Any]:
        # QueryService already has similar internal shims. These local shims keep
        # this service independent and avoid importing private QueryService classes.
        out: list[Any] = []
        for idx, chunk in enumerate(live_chunks or [], start=1):
            source = type(
                "ProposalFirstLiveSourceShim",
                (),
                {
                    "id": f"proposal-live-source-{idx}-{abs(hash(getattr(chunk, 'url', '')))}",
                    "title": getattr(chunk, "title", "Official live source"),
                    "authority": getattr(chunk, "authority", "Official source"),
                    "citation_text": getattr(chunk, "title", None),
                    "url": getattr(chunk, "url", ""),
                    "source_type": getattr(chunk, "source_type", "guidance"),
                    "metadata_json": {**(getattr(chunk, "metadata_json", None) or {}), "bucket": "live_official", "sub_type": "live_official"},
                },
            )()
            shim = type(
                "ProposalFirstLiveChunkShim",
                (),
                {
                    "id": f"proposal-live-chunk-{idx}-{abs(hash((getattr(chunk, 'url', ''), getattr(chunk, 'heading', ''))))}",
                    "source_id": source.id,
                    "section_ref": getattr(chunk, "section_ref", None),
                    "heading": getattr(chunk, "heading", None),
                    "text": getattr(chunk, "text", ""),
                    "source": source,
                },
            )()
            out.append(shim)
        return out

    def _search_queries_from_proposal(self, effective_question: str, proposal: dict[str, Any]) -> list[str]:
        queries: list[str] = [effective_question]
        for item in proposal.get("candidate_index") or []:
            if not isinstance(item, dict):
                continue
            label = str(item.get("candidate_label") or "").strip()
            subclass = str(item.get("subclass") or "").strip()
            stream = str(item.get("stream_or_activity") or "").strip()
            if label:
                queries.append(label)
            if subclass:
                queries.append(f"Subclass {subclass} Schedule 2 criteria")
                queries.append(f"Subclass {subclass} Home Affairs eligibility requirements")
            if stream:
                queries.append(stream)
            for query in item.get("search_queries") or []:
                if isinstance(query, str) and query.strip():
                    queries.append(query.strip())
        for query in proposal.get("search_plan") or []:
            if isinstance(query, str) and query.strip():
                queries.append(query.strip())
        out: list[str] = []
        seen: set[str] = set()
        for query in queries:
            query = " ".join(str(query).split())
            if len(query) < 3:
                continue
            key = query.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(query[:400])
            if len(out) >= self.MAX_SEARCH_QUERIES:
                break
        return out

    def _candidate_subclass_numbers(self, proposal: dict[str, Any], schedule_candidates: list[dict[str, Any]]) -> list[str]:
        nums: list[str] = []
        text_blobs: list[str] = [proposal.get("proposal_memo_markdown") or "", proposal.get("proposal_summary") or ""]
        for item in proposal.get("candidate_index") or []:
            if isinstance(item, dict):
                text_blobs.append(" ".join(str(item.get(k) or "") for k in ["candidate_label", "subclass", "stream_or_activity"]))
        for item in schedule_candidates:
            text_blobs.append(str(item.get("subclass") or ""))
        for blob in text_blobs:
            for match in re.finditer(r"\b(?:subclass\s*)?([0-9]{3,4}[A-Z]?)\b", blob, flags=re.I):
                val = match.group(1).upper()
                if val not in nums:
                    nums.append(val)
        return nums

    def _normalize_candidate_index(self, raw: Any) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        if not isinstance(raw, list):
            return out
        for item in raw:
            if not isinstance(item, dict):
                continue
            out.append({
                "candidate_label": str(item.get("candidate_label") or "").strip(),
                "subclass": str(item.get("subclass") or "").strip() or None,
                "stream_or_activity": str(item.get("stream_or_activity") or "").strip() or None,
                "confidence_before_verification": self._normalize_confidence(item.get("confidence_before_verification")),
                "why_possible": self._string_list(item.get("why_possible")),
                "why_maybe_not": self._string_list(item.get("why_maybe_not")),
                "must_verify": self._string_list(item.get("must_verify")),
                "search_queries": self._string_list(item.get("search_queries")),
            })
        return out

    def _call_json(self, *, model: str, system_prompt: str, user_prompt: str) -> dict[str, Any] | None:
        try:
            response = self.client.responses.create(
                model=model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return self._extract_json_object((response.output_text or "").strip())
        except Exception:
            return None

    def _extract_json_object(self, text: str) -> dict[str, Any] | None:
        text = (text or "").strip()
        if not text:
            return None
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            pass
        match = re.search(r"\{.*\}", text, flags=re.S)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

    def _extend_unique_chunks(self, target: list[Any], chunks: list[Any], *, limit: int) -> None:
        seen = {self._chunk_key(chunk) for chunk in target}
        for chunk in chunks or []:
            key = self._chunk_key(chunk)
            if key in seen:
                continue
            seen.add(key)
            target.append(chunk)
            if len(target) >= limit:
                return

    def _chunk_key(self, chunk: Any) -> str:
        source = getattr(chunk, "source", None)
        return "|".join([
            str(getattr(source, "title", "") or ""),
            str(getattr(source, "url", "") or ""),
            str(getattr(chunk, "section_ref", "") or ""),
            str(getattr(chunk, "heading", "") or ""),
            str(getattr(chunk, "text", "") or "")[:160],
        ])

    def _thin_debug(self, debug: dict[str, Any] | None) -> dict[str, Any]:
        debug = debug or {}
        return {
            "strategy": debug.get("strategy"),
            "result_count": debug.get("result_count"),
            "matched_terms": debug.get("matched_terms"),
            "top_titles": debug.get("top_titles"),
            "source_type_counts": debug.get("source_type_counts"),
            "authority_counts": debug.get("authority_counts"),
        }

    def _conversation_history_text(self, history: list[dict[str, Any]]) -> str:
        rows: list[str] = []
        for item in history[-10:]:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or item.get("speaker") or "turn")
            content = str(item.get("content") or item.get("user_question") or item.get("assistant_answer") or "")
            if content:
                rows.append(f"{role}: {content[:900]}")
        return "\n".join(rows)

    def _fallback_answer_from_verification(self, *, proposal: dict[str, Any], verification: dict[str, Any], response_language: str) -> str:
        memo = str(proposal.get("proposal_memo_markdown") or "").strip()
        if response_language == "zh":
            prefix = "我可以先给出一个需要核验的初步路径图：\n\n"
        else:
            prefix = "I can give a preliminary pathway map, subject to source verification:\n\n"
        return prefix + (memo[:1800] if memo else "No reliable proposal could be drafted from the available information.")

    def _language_rule(self, response_language: str) -> str:
        if response_language == "zh":
            return "\nWrite user-facing memo/answer content in Simplified Chinese unless official visa names are clearer in English.\n"
        return "\nWrite user-facing memo/answer content in English.\n"

    def _normalize_confidence(self, value: Any) -> str:
        val = str(value or "").lower().strip()
        if val in {"high", "medium", "low"}:
            return val
        return "medium"

    def _normalize_next_action(self, value: Any) -> str:
        val = str(value or "").strip()
        if val in {"answer", "ask_followup", "suggest_consultation"}:
            return val
        return "answer"

    def _string_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(x).strip() for x in value if str(x).strip()]
        if isinstance(value, str) and value.strip():
            return [value.strip()]
        return []

    def _one_question(self, questions: list[str]) -> list[str]:
        for question in questions:
            q = str(question or "").strip()
            if q:
                return [q]
        return []

    def _clip(self, text: str, max_chars: int) -> str:
        text = text or ""
        return text if len(text) <= max_chars else text[:max_chars] + "..."
