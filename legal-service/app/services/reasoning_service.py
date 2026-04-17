from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.db.models import SourceChunk
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.source import CitationOut
from app.schemas.state import EvidencePackage, SufficiencyGateResult
from app.services.operation_profiles import (
    ANSWER_MODE_ESCALATE,
    ANSWER_MODE_FOLLOWUP,
    ANSWER_MODE_QUALIFIED,
    ANSWER_MODE_WARNING,
    canonical_operation_type,
    infer_source_classes_from_parts,
)


class ReasoningService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv("REASONING_MODEL", "gpt-5.4-mini")
        self.general_model = os.getenv("GENERAL_QA_MODEL", self.model)
        self.max_context_chunks = int(os.getenv("REASONING_MAX_CONTEXT_CHUNKS", "6"))
        self.max_quote_chars = int(os.getenv("REASONING_MAX_QUOTE_CHARS", "400"))
        self.max_supported_facts = int(os.getenv("REASONING_MAX_SUPPORTED_FACTS", "8"))
        self.max_history_turns = int(os.getenv("REASONING_MAX_HISTORY_TURNS", "8"))
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client

    # ------------------------------------------------------------------
    # Turn contextualization
    # ------------------------------------------------------------------
    def contextualize_question(
        self,
        question: str,
        conversation_history: list[dict[str, Any]] | None = None,
        issue_summary: str | None = None,
        issue_type: str | None = None,
        visa_type: str | None = None,
        intake_facts: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        history = [item for item in (conversation_history or []) if isinstance(item, dict)][-self.max_history_turns :]
        carried_facts = intake_facts or {}

        if not history or self._should_contextualize(question) is False:
            return {
                "standalone_question": question.strip(),
                "used_history": False,
                "carried_facts": carried_facts,
                "reason": "no_contextualization_needed",
            }

        system_prompt = (
            "You rewrite the user's latest message into a standalone immigration-law query.\n"
            "Use prior conversation only to resolve references like dates, pronouns, visa subclass, refusals, review questions, travel questions, or prior asked issues.\n"
            "Do NOT change the user's intent.\n"
            "Do NOT answer the question.\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{\n"
            '  "standalone_question": string,\n'
            '  "used_history": boolean,\n'
            '  "reason": string,\n'
            '  "carried_facts": object\n'
            "}\n"
        )

        history_text = self._conversation_context_text({"history": history})
        user_prompt = (
            f"Issue summary: {issue_summary or 'unknown'}\n"
            f"Issue type: {issue_type or 'unknown'}\n"
            f"Visa type: {visa_type or 'unknown'}\n"
            f"Known intake facts JSON: {json.dumps(carried_facts, ensure_ascii=False)}\n\n"
            f"Recent conversation turns:\n{history_text}\n\n"
            f"Latest user message:\n{question}\n"
        )

        try:
            response = self.client.responses.create(
                model=self.general_model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            parsed = self._extract_json_object((response.output_text or "").strip())
            if not parsed:
                raise ValueError("contextualization returned no JSON")

            standalone_question = str(parsed.get("standalone_question") or "").strip() or question.strip()
            return {
                "standalone_question": standalone_question,
                "used_history": bool(parsed.get("used_history", True)),
                "reason": str(parsed.get("reason") or "contextualized"),
                "carried_facts": self._normalize_fact_dict(parsed.get("carried_facts")) or carried_facts,
            }
        except Exception:
            return {
                "standalone_question": question.strip(),
                "used_history": False,
                "carried_facts": carried_facts,
                "reason": "contextualization_failed",
            }

    # ------------------------------------------------------------------
    # Main answer path
    # ------------------------------------------------------------------
    def answer_from_chunks(
        self,
        payload: QueryRequest,
        chunks: list[SourceChunk],
        retrieval_debug: dict[str, object],
        conversation_context: dict[str, Any] | None = None,
    ) -> QueryResponse:
        conversation_context = conversation_context or {}
        effective_question = str(conversation_context.get("effective_question") or payload.question).strip()
        issue_type = str(conversation_context.get("issue_type") or self._classify_issue(effective_question) or "") or None
        operation_type = canonical_operation_type(str(conversation_context.get("operation_type") or self._infer_operation_type(effective_question) or "") or None)
        answerability_raw = conversation_context.get("answerability") or retrieval_debug.get("sufficiency_gate") or {}
        if isinstance(answerability_raw, dict) and isinstance(answerability_raw.get("answerability"), dict):
            answerability = answerability_raw.get("answerability") or {}
        elif isinstance(answerability_raw, dict):
            answerability = answerability_raw
        else:
            answerability = {}
        contract_answer_mode = str(answerability.get("answer_mode") or "direct_answer")
        citations = [self._to_citation(chunk) for chunk in chunks]

        if not chunks:
            return QueryResponse(
                matter_id=payload.matter_id,
                answer=(
                    "I do not have enough retrieved immigration-law material to answer this reliably. "
                    "Please provide more details or arrange a consultation with the lawyer."
                ),
                confidence="low",
                issue_type=issue_type,
                missing_facts=self._infer_missing_facts(effective_question),
                follow_up_questions=self._follow_up_questions(effective_question, issue_type),
                citations=[],
                escalate=self._should_escalate(effective_question, []),
                next_action="suggest_consultation",
                retrieval_debug={
                    **retrieval_debug,
                    "reasoning_model": self.model,
                    "reasoning_mode": "no_context",
                },
            )

        evidence = self._extract_evidence(
            payload=payload,
            chunks=chunks[: self.max_context_chunks],
            citations=citations[: self.max_context_chunks],
            issue_type=issue_type,
            operation_type=operation_type,
            effective_question=effective_question,
            conversation_context=conversation_context,
            answerability=answerability,
        )

        if evidence is None:
            return self._fallback_insufficient_response(
                payload=payload,
                issue_type=issue_type,
                citations=citations,
                retrieval_debug=retrieval_debug,
                reason="evidence_extraction_failed",
            )

        if not bool(evidence.get("is_in_domain", False)):
            general_answer = self._answer_general_question_directly(payload.question)
            return QueryResponse(
                matter_id=payload.matter_id,
                answer=general_answer,
                confidence="medium",
                issue_type=None,
                missing_facts=[],
                follow_up_questions=[],
                citations=[],
                escalate=False,
                next_action="answer",
                retrieval_debug={
                    **retrieval_debug,
                    "reasoning_model": self.general_model,
                    "reasoning_mode": "out_of_domain_llm",
                    "evidence": evidence,
                },
            )

        supported_facts = self._normalize_supported_facts(evidence.get("supported_facts"))
        unsupported_items = self._normalize_string_list(evidence.get("unsupported_requests"))
        missing_facts = self._normalize_string_list(evidence.get("missing_information"))
        follow_up_questions = self._normalize_string_list(evidence.get("follow_up_questions"))

        is_context_sufficient = bool(evidence.get("is_context_sufficient", False))
        specific_user_marker = self._extract_specific_marker(effective_question)
        marker_supported = True
        if specific_user_marker:
            marker_supported = self._facts_support_marker(
                supported_facts, specific_user_marker
            ) or self._chunks_support_marker(chunks, specific_user_marker)

        question_is_specific = self._is_specific_question(effective_question)
        partial_answer_allowed = contract_answer_mode in {
            ANSWER_MODE_QUALIFIED,
            ANSWER_MODE_WARNING,
            ANSWER_MODE_FOLLOWUP,
        }

        insufficient = False
        reason = "insufficient_evidence"
        if not supported_facts:
            insufficient = True
        elif specific_user_marker and not marker_supported and not partial_answer_allowed:
            insufficient = True
            reason = f"specific_marker_not_supported:{specific_user_marker}"
        elif question_is_specific and not is_context_sufficient and not partial_answer_allowed:
            insufficient = True
            reason = "specific_question_context_insufficient"

        if insufficient:
            answer = self._build_insufficient_answer(
                payload=payload,
                supported_facts=supported_facts,
                unsupported_items=unsupported_items,
                specific_marker=specific_user_marker,
                reason=reason,
                answerability=answerability,
                operation_type=operation_type,
            )
            next_action = self._fallback_next_action(answerability)
            return QueryResponse(
                matter_id=payload.matter_id,
                answer=answer,
                confidence="low",
                issue_type=evidence.get("issue_type") or issue_type,
                missing_facts=missing_facts or self._infer_missing_facts(effective_question),
                follow_up_questions=follow_up_questions or self._follow_up_questions(effective_question, issue_type),
                citations=citations[: self.max_context_chunks],
                escalate=next_action == "suggest_consultation",
                next_action=next_action,
                retrieval_debug={
                    **retrieval_debug,
                    "reasoning_model": self.model,
                    "reasoning_mode": "insufficient_context",
                    "reason": reason,
                    "question_is_specific": question_is_specific,
                    "evidence": evidence,
                },
            )

        final_answer = self._synthesize_answer(
            payload=payload,
            evidence=evidence,
            issue_type=evidence.get("issue_type") or issue_type,
            operation_type=evidence.get("operation_type") or operation_type,
            effective_question=effective_question,
            conversation_context=conversation_context,
            answerability=answerability,
        )

        if final_answer is None:
            return QueryResponse(
                matter_id=payload.matter_id,
                answer=self._build_grounded_general_answer(payload, supported_facts, unsupported_items, answerability=answerability, operation_type=operation_type),
                confidence="medium" if supported_facts else "low",
                issue_type=evidence.get("issue_type") or issue_type,
                missing_facts=missing_facts,
                follow_up_questions=follow_up_questions or self._follow_up_questions(effective_question, issue_type),
                citations=citations[: self.max_context_chunks],
                escalate=bool(missing_facts),
                next_action="ask_followup" if missing_facts else "answer",
                retrieval_debug={
                    **retrieval_debug,
                    "reasoning_model": self.model,
                    "reasoning_mode": "python_grounded_fallback",
                    "evidence": evidence,
                },
            )

        return QueryResponse(
            matter_id=payload.matter_id,
            answer=final_answer.get("answer", "").strip() or self._build_insufficient_answer(
                payload, supported_facts, unsupported_items, specific_user_marker, answerability=answerability, operation_type=operation_type
            ),
            confidence=self._normalize_confidence(final_answer.get("confidence")),
            issue_type=final_answer.get("issue_type") or evidence.get("issue_type") or issue_type,
            missing_facts=missing_facts,
            follow_up_questions=follow_up_questions or self._follow_up_questions(effective_question, issue_type),
            citations=citations[: self.max_context_chunks],
            escalate=bool(final_answer.get("escalate")),
            next_action=self._normalize_next_action(final_answer.get("next_action")),
            retrieval_debug={
                **retrieval_debug,
                "reasoning_model": self.model,
                "reasoning_mode": "two_stage_grounded",
                "evidence": evidence,
            },
        )

    # ------------------------------------------------------------------
    # New bounded node: sufficiency judge
    # ------------------------------------------------------------------
    def judge_evidence_sufficiency(
        self,
        *,
        payload: QueryRequest,
        chunks: list[SourceChunk],
        citations: list[CitationOut],
        issue_type: str | None,
        operation_type: str | None,
        effective_question: str,
        conversation_context: dict[str, Any] | None = None,
    ) -> SufficiencyGateResult:
        if not chunks:
            return SufficiencyGateResult(
                local_sufficient=False,
                reason="no_local_results",
                need_live_fetch=True,
                preferred_domains=[],
                preferred_source_types=[],
            )

        context_text = self._build_context_text(chunks[: self.max_context_chunks], citations[: self.max_context_chunks])
        system_prompt = (
            "You are a strict immigration-law retrieval sufficiency judge.\n"
            "Work only from the provided retrieved sources.\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{\n"
            '  "local_sufficient": boolean,\n'
            '  "reason": string | null,\n'
            '  "need_live_fetch": boolean,\n'
            '  "preferred_domains": string[],\n'
            '  "preferred_source_types": string[]\n'
            "}\n"
            "If sources are too generic, incomplete, or obviously not enough for a specific answer, set need_live_fetch=true.\n"
            "Prefer legislation.gov.au, immi.homeaffairs.gov.au, art.gov.au, and fedcourt.gov.au only when needed.\n"
        )
        user_prompt = (
            f"Effective question:\n{effective_question}\n\n"
            f"Issue type: {issue_type or 'unknown'}\n"
            f"Operation type: {operation_type or 'unknown'}\n\n"
            f"Retrieved sources:\n{context_text}\n"
        )
        try:
            response = self.client.responses.create(
                model=self.general_model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            parsed = self._extract_json_object((response.output_text or "").strip())
            if parsed:
                return SufficiencyGateResult(**parsed)
        except Exception:
            pass
        return SufficiencyGateResult(local_sufficient=True, reason="llm_sufficiency_fallback", need_live_fetch=False)

    # ------------------------------------------------------------------
    # Evidence extraction / drafting
    # ------------------------------------------------------------------
    def _extract_evidence(
        self,
        payload: QueryRequest,
        chunks: list[SourceChunk],
        citations: list[CitationOut],
        issue_type: str | None,
        operation_type: str | None = None,
        effective_question: str | None = None,
        conversation_context: dict[str, Any] | None = None,
        answerability: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        context_text = self._build_context_text(chunks, citations)
        intake_facts = json.dumps((conversation_context or {}).get("intake_facts") or payload.intake_facts or {}, ensure_ascii=False)
        conversation_text = self._conversation_context_text(conversation_context)
        answerability_json = json.dumps(answerability or {}, ensure_ascii=False)

        system_prompt = (
            "You are a strict legal-retrieval evidence extractor.\n"
            "You MUST work only from the provided retrieved sources.\n"
            "Do NOT answer from background knowledge.\n"
            "Do NOT infer visa-specific rules unless the retrieved sources explicitly support them.\n"
            "If the question is outside immigration/visa/legal-service scope, mark is_in_domain=false.\n"
            "If the retrieved material is too generic or does not support the user's specific request, mark is_context_sufficient=false.\n"
            "Use the operation answerability JSON as a contract: if decisive fact slots or source classes are missing, reflect that in missing_information and follow_up_questions.\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{\n"
            '  "is_in_domain": boolean,\n'
            '  "is_context_sufficient": boolean,\n'
            '  "issue_type": string | null,\n'
            '  "operation_type": string | null,\n'
            '  "supported_facts": [{"fact": string, "source_numbers": number[]}],\n'
            '  "unsupported_requests": string[],\n'
            '  "missing_information": string[],\n'
            '  "follow_up_questions": string[]\n'
            "}\n"
            "supported_facts must be directly grounded in the retrieved text.\n"
            "Keep supported_facts short and factual.\n"
        )
        user_prompt = (
            f"Original user question:\n{payload.question}\n\n"
            f"Effective standalone question:\n{effective_question or payload.question}\n\n"
            f"Issue type:\n{issue_type or 'unknown'}\n\n"
            f"Operation type:\n{operation_type or 'unknown'}\n\n"
            f"Conversation context:\n{conversation_text or 'N/A'}\n\n"
            f"Operation answerability JSON:\n{answerability_json}\n\n"
            f"Intake facts JSON:\n{intake_facts}\n\n"
            f"Retrieved sources:\n{context_text}\n"
        )
        try:
            response = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return self._extract_json_object((response.output_text or "").strip())
        except Exception:
            return None

    def _synthesize_answer(
        self,
        payload: QueryRequest,
        evidence: dict[str, Any],
        issue_type: str | None,
        operation_type: str | None = None,
        effective_question: str | None = None,
        conversation_context: dict[str, Any] | None = None,
        answerability: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        supported_facts = self._normalize_supported_facts(evidence.get("supported_facts"))
        unsupported_items = self._normalize_string_list(evidence.get("unsupported_requests"))
        missing_facts = self._normalize_string_list(evidence.get("missing_information"))
        follow_up_questions = self._normalize_string_list(evidence.get("follow_up_questions"))

        evidence_json = json.dumps(
            {
                "issue_type": issue_type,
                "operation_type": operation_type,
                "supported_facts": supported_facts,
                "unsupported_requests": unsupported_items,
                "missing_information": missing_facts,
                "follow_up_questions": follow_up_questions,
            },
            ensure_ascii=False,
        )
        answerability_json = json.dumps(answerability or {}, ensure_ascii=False)

        system_prompt = (
            "You are a strict legal answer drafter.\n"
            "You MUST write the answer using ONLY the supported_facts provided to you.\n"
            "Do NOT introduce any new legal rule, deadline, visa requirement, or assumption.\n"
            "Honor the operation answerability contract. If the contract says ask_followup or qualified_general, do not draft a final rights/deadline answer.\n"
            "If supported_facts are general, the answer must stay general.\n"
            "If unsupported_requests are present, explicitly say those points are not supported by the retrieved material.\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{\n"
            '  "answer": string,\n'
            '  "confidence": "low" | "medium" | "high",\n'
            '  "issue_type": string | null,\n'
            '  "escalate": boolean,\n'
            '  "next_action": "answer" | "ask_followup" | "suggest_consultation"\n'
            "}\n"
            "Keep the answer concise and grounded.\n"
        )
        user_prompt = (
            f"Original question:\n{payload.question}\n\n"
            f"Effective question:\n{effective_question or payload.question}\n\n"
            f"Operation answerability JSON:\n{answerability_json}\n\n"
            f"Evidence package JSON:\n{evidence_json}\n"
        )
        try:
            response = self.client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return self._extract_json_object((response.output_text or "").strip())
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Fallbacks / serialization helpers
    # ------------------------------------------------------------------
    def _answer_general_question_directly(self, question: str) -> str:
        system_prompt = (
            "You are a helpful general assistant.\n"
            "Answer the user's question directly and naturally.\n"
            "Do not mention immigration-law retrieval, sources, citations, or legal corpus.\n"
            "Keep the answer concise and useful.\n"
        )
        user_prompt = f"User question:\n{question}\n"
        try:
            response = self.client.responses.create(
                model=self.general_model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            text = (response.output_text or "").strip()
            if text:
                return text
        except Exception:
            pass
        return "I’m sorry, but I couldn’t answer that question right now."

    def _build_grounded_general_answer(
        self,
        payload: QueryRequest,
        supported_facts: list[dict[str, Any]],
        unsupported_items: list[str],
        *,
        answerability: dict[str, Any] | None = None,
        operation_type: str | None = None,
    ) -> str:
        if not supported_facts:
            return (
                "I could not reliably generate a fully grounded answer from the retrieved material. "
                "Please provide more details or arrange a consultation with the lawyer."
            )
        fact_text = " ".join(
            item["fact"].strip()
            for item in supported_facts[:3]
            if isinstance(item, dict) and item.get("fact")
        ).strip()
        parts = []
        if fact_text:
            parts.append(fact_text)
        if unsupported_items:
            parts.append(
                "Some parts of your question are not specifically supported by the retrieved material, so this answer should be treated as general guidance only."
            )
        else:
            parts.append(
                "This is general guidance based on the retrieved material only, and the exact next step will depend on the refusal notice, dates, and stated reasons."
            )
        coverage_gap_text = self._coverage_gap_text(answerability, operation_type=operation_type)
        if coverage_gap_text:
            parts.append(coverage_gap_text)
        parts.append(
            "Please review the refusal notice carefully and gather the decision record, relevant correspondence, and key dates before taking further action or arranging a consultation."
        )
        return "\n\n".join(parts)

    def _build_insufficient_answer(
        self,
        payload: QueryRequest,
        supported_facts: list[dict[str, Any]],
        unsupported_items: list[str],
        specific_marker: str | None,
        reason: str | None = None,
        *,
        answerability: dict[str, Any] | None = None,
        operation_type: str | None = None,
    ) -> str:
        parts: list[str] = []
        if supported_facts:
            fact_lines = [f"- {item['fact']}" for item in supported_facts[:3] if item.get("fact")]
            if fact_lines:
                parts.append("I found some retrieved material that may be relevant:\n" + "\n".join(fact_lines))
        if reason and reason.startswith("specific_marker_not_supported:"):
            parts.append(f"I do not have enough retrieved source material specifically supporting the part of your question about '{specific_marker}'.")
        elif unsupported_items:
            parts.append("Some parts of your question are not specifically supported by the retrieved material.")
        else:
            parts.append("I have some relevant retrieved material, but not enough to give a fully specific answer with confidence.")
        coverage_gap_text = self._coverage_gap_text(answerability, operation_type=operation_type)
        if coverage_gap_text:
            parts.append(coverage_gap_text)
        parts.append("Please provide the refusal notice, relevant dates, and stated refusal reason, or arrange a consultation with the lawyer.")
        return "\n\n".join(parts)

    def _coverage_gap_text(self, answerability: dict[str, Any] | None, *, operation_type: str | None = None) -> str:
        if not isinstance(answerability, dict):
            return ""
        required_facts_missing = answerability.get("required_facts_missing") or []
        required_source_classes_missing = answerability.get("required_source_classes_missing") or []
        parts: list[str] = []
        if required_source_classes_missing:
            joined = ", ".join(str(item) for item in required_source_classes_missing[:6])
            parts.append(
                f"For this operation{f' ({operation_type})' if operation_type else ''}, the retrieved material does not yet cover the key source classes needed for a final answer: {joined}."
            )
        if required_facts_missing:
            joined = ", ".join(str(item) for item in required_facts_missing[:6])
            parts.append(f"I still need these decisive facts before I can answer more specifically: {joined}.")
        return " ".join(parts).strip()

    def _fallback_next_action(self, answerability: dict[str, Any] | None) -> str:
        if not isinstance(answerability, dict):
            return "ask_followup"
        answer_mode = str(answerability.get("answer_mode") or "")
        if answer_mode == ANSWER_MODE_ESCALATE:
            return "suggest_consultation"
        return "ask_followup"

    def _fallback_insufficient_response(
        self,
        payload: QueryRequest,
        issue_type: str | None,
        citations: list[CitationOut],
        retrieval_debug: dict[str, object],
        reason: str,
    ) -> QueryResponse:
        return QueryResponse(
            matter_id=payload.matter_id,
            answer=(
                "I could not reliably generate a fully grounded answer from the retrieved material. "
                "Please provide more details or arrange a consultation with the lawyer."
            ),
            confidence="low",
            issue_type=issue_type,
            missing_facts=self._infer_missing_facts(payload.question),
            follow_up_questions=self._follow_up_questions(payload.question, issue_type),
            citations=citations[: self.max_context_chunks],
            escalate=True,
            next_action="suggest_consultation",
            retrieval_debug={
                **retrieval_debug,
                "reasoning_model": self.model,
                "reasoning_mode": "fallback_insufficient",
                "reason": reason,
            },
        )

    def _build_context_text(self, chunks: list[SourceChunk], citations: list[CitationOut]) -> str:
        blocks: list[str] = []
        for idx, (chunk, citation) in enumerate(zip(chunks, citations), start=1):
            bucket = None
            sub_type = None
            source_classes: list[str] = []
            if getattr(chunk, "source", None) is not None:
                meta = getattr(chunk.source, "metadata_json", None) or {}
                bucket = meta.get("bucket")
                sub_type = meta.get("sub_type")
                source_classes = infer_source_classes_from_parts(
                    title=getattr(chunk.source, "title", None),
                    authority=getattr(chunk.source, "authority", None),
                    source_type=getattr(chunk.source, "source_type", None),
                    bucket=bucket,
                    sub_type=sub_type,
                    section_ref=getattr(chunk, "section_ref", None),
                    heading=getattr(chunk, "heading", None),
                    text=getattr(chunk, "text", None),
                    metadata_json={**meta, **(getattr(chunk, "metadata_json", None) or {})},
                )
            blocks.append(
                "\n".join(
                    [
                        f"[Source {idx}]",
                        f"Title: {citation.title}",
                        f"Authority: {citation.authority}",
                        f"Source type: {getattr(chunk.source, 'source_type', 'unknown')}",
                        f"Bucket: {bucket or 'N/A'}",
                        f"Sub type: {sub_type or 'N/A'}",
                        f"Source classes: {', '.join(source_classes) if source_classes else 'N/A'}",
                        f"Section ref: {citation.section_ref or 'N/A'}",
                        f"URL: {citation.url}",
                        f"Heading: {getattr(chunk, 'heading', None) or 'N/A'}",
                        "Extract:",
                        (getattr(chunk, "text", "") or "").strip(),
                    ]
                )
            )
        return "\n\n".join(blocks)

    def _to_citation(self, chunk: SourceChunk) -> CitationOut:
        source = chunk.source
        return CitationOut(
            source_id=source.id,
            chunk_id=chunk.id,
            case_id=None,
            title=source.title,
            authority=source.authority,
            citation_text=getattr(source, "citation_text", None),
            section_ref=getattr(chunk, "section_ref", None),
            url=source.url,
            quote_text=(getattr(chunk, "text", "") or "")[: self.max_quote_chars],
            rationale="Used as grounded support for the generated answer.",
            confidence_score=None,
        )

    # ------------------------------------------------------------------
    # Generic helpers
    # ------------------------------------------------------------------
    def _extract_json_object(self, text: str) -> dict[str, Any] | None:
        if not text:
            return None
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None

    def _normalize_supported_facts(self, value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        cleaned: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, dict):
                continue
            fact = item.get("fact")
            source_numbers = item.get("source_numbers")
            if not isinstance(fact, str):
                continue
            fact = fact.strip()
            if not fact or fact in seen:
                continue
            if not isinstance(source_numbers, list):
                source_numbers = []
            normalized_sources = [int(x) for x in source_numbers if isinstance(x, (int, float))]
            cleaned.append({"fact": fact, "source_numbers": normalized_sources})
            seen.add(fact)
            if len(cleaned) >= self.max_supported_facts:
                break
        return cleaned

    def _normalize_confidence(self, value: Any) -> str:
        return value if value in {"low", "medium", "high"} else "low"

    def _normalize_next_action(self, value: Any) -> str:
        return value if value in {"answer", "ask_followup", "suggest_consultation"} else "ask_followup"

    def _normalize_string_list(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, str):
                continue
            text = item.strip()
            if not text or text in seen:
                continue
            cleaned.append(text)
            seen.add(text)
        return cleaned

    def _conversation_context_text(self, conversation_context: dict[str, Any] | None) -> str:
        if not conversation_context:
            return ""
        lines: list[str] = []
        issue_summary = conversation_context.get("issue_summary")
        issue_type = conversation_context.get("issue_type")
        operation_type = conversation_context.get("operation_type")
        visa_type = conversation_context.get("visa_type")
        intake_facts = conversation_context.get("intake_facts")
        history = conversation_context.get("history") or []
        if issue_summary:
            lines.append(f"Issue summary: {issue_summary}")
        if issue_type:
            lines.append(f"Issue type: {issue_type}")
        if operation_type:
            lines.append(f"Operation type: {operation_type}")
        if visa_type:
            lines.append(f"Visa type: {visa_type}")
        if intake_facts:
            lines.append(f"Known intake facts: {json.dumps(intake_facts, ensure_ascii=False)}")
        recent = [item for item in history if isinstance(item, dict)][-self.max_history_turns :]
        for item in recent:
            role = str(item.get("role") or "unknown").capitalize()
            content = str(item.get("content") or "").strip()
            if content:
                lines.append(f"{role}: {content}")
        return "\n".join(lines).strip()

    def _normalize_fact_dict(self, value: Any) -> dict[str, Any]:
        if not isinstance(value, dict):
            return {}
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                continue
            if item in (None, "", [], {}):
                continue
            cleaned[key] = item
        return cleaned

    def _should_contextualize(self, question: str) -> bool:
        q = (question or "").strip().lower()
        if len(q) < 40:
            return True
        cue_terms = [
            "it", "that", "this", "they", "them", "he", "she",
            "what about", "and if", "then can", "in that case",
            "the date is", "it was", "yes", "no",
        ]
        return any(term in q for term in cue_terms)

    def _classify_issue(self, question: str) -> str | None:
        lowered = question.lower()
        if "refusal" in lowered:
            return "visa_refusal"
        if "cancel" in lowered or "cancellation" in lowered:
            return "visa_cancellation"
        if "partner visa" in lowered:
            return "partner_visa"
        if "student visa" in lowered:
            return "student_visa"
        if "485" in lowered or "temporary graduate" in lowered:
            return "temporary_graduate_visa"
        if "skilled" in lowered:
            return "skilled_migration"
        return None

    def _infer_operation_type(self, question: str) -> str | None:
        q = question.lower()
        if "how many days" in q or ("review" in q and ("deadline" in q or "still" in q)):
            return canonical_operation_type("review_deadline")
        if "review" in q or "appeal" in q:
            return canonical_operation_type("review_rights")
        if "travel" in q or ("leave" in q and "come back" in q) or "bridging visa" in q:
            return canonical_operation_type("bridging_travel")
        if "genuine student" in q or ("student visa" in q and "refused" in q):
            return canonical_operation_type("student_refusal_next_steps")
        if "485" in q or "temporary graduate" in q:
            return canonical_operation_type("485_eligibility_overview")
        if "4020" in q or "misleading" in q or "incorrect information" in q:
            return canonical_operation_type("pic4020_risk")
        return None

    def _infer_missing_facts(self, question: str) -> list[str]:
        lowered = question.lower()
        missing: list[str] = []
        if "visa" not in lowered:
            missing.append("Which visa class or migration pathway is involved?")
        if "student visa" in lowered and "subclass" not in lowered:
            missing.append("What student visa subclass or application stage is involved?")
        if "485" in lowered and "date" not in lowered:
            missing.append("What is the date on the 485 refusal decision?")
        if "refusal" in lowered and "date" not in lowered:
            missing.append("What is the date of the refusal decision?")
        if ("cancel" in lowered or "cancellation" in lowered) and "notice" not in lowered and "noicc" not in lowered:
            missing.append("Have you received a formal cancellation notice or NOICC?")
        if "department" not in lowered and "tribunal" not in lowered and "art" not in lowered:
            missing.append("Was the decision made by the Department, ART, or another body?")
        return missing

    def _follow_up_questions(self, question: str, issue_type: str | None) -> list[str]:
        lowered = question.lower()
        questions: list[str] = []
        if "485" in lowered:
            questions.append("What is the date on the subclass 485 refusal decision?")
            questions.append("What refusal reason is stated in the 485 refusal notice?")
        if issue_type == "student_visa" or "student" in lowered:
            questions.append("What is the student visa subclass or application stage?")
        if issue_type == "visa_refusal" or "refusal" in lowered:
            questions.append("What refusal reason was given in the decision record?")
            questions.append("What is the date on the refusal decision?")
        if issue_type == "visa_cancellation" or "cancel" in lowered or "cancellation" in lowered:
            questions.append("Have you received a NOICC or formal cancellation notice?")
        if "documents" not in lowered:
            questions.append("Do you have the decision record, correspondence, and application reference details?")
        if not questions:
            questions.append("Which exact visa type or migration pathway are you asking about?")
        deduped: list[str] = []
        seen: set[str] = set()
        for q in questions:
            if q not in seen:
                deduped.append(q)
                seen.add(q)
        return deduped

    def _should_escalate(self, question: str, missing_facts: list[str]) -> bool:
        lowered = question.lower()
        high_risk_terms = ["refusal", "cancel", "cancellation", "deadline", "review", "tribunal", "art"]
        return any(term in lowered for term in high_risk_terms) or len(missing_facts) >= 2

    def _extract_specific_marker(self, question: str) -> str | None:
        lowered = question.lower()
        for marker in ["485", "500", "820", "801", "189", "190", "491"]:
            if marker in lowered:
                return marker
        for phrase in ["student visa", "partner visa", "visitor visa", "skilled visa"]:
            if phrase in lowered:
                return phrase
        return None

    def _facts_support_marker(self, supported_facts: list[dict[str, Any]], marker: str) -> bool:
        m = marker.lower()
        for item in supported_facts:
            fact = item.get("fact")
            if isinstance(fact, str) and m in fact.lower():
                return True
        return False

    def _chunks_support_marker(self, chunks: list[SourceChunk], marker: str) -> bool:
        m = marker.lower()
        for chunk in chunks:
            haystack = " ".join([
                getattr(chunk, "text", "") or "",
                getattr(chunk, "heading", "") or "",
                getattr(chunk, "section_ref", "") or "",
                getattr(chunk.source, "title", "") if getattr(chunk, "source", None) else "",
                getattr(chunk.source, "authority", "") if getattr(chunk, "source", None) else "",
            ]).lower()
            if m in haystack:
                return True
        return False

    def _is_specific_question(self, question: str) -> bool:
        lowered = question.lower()
        specific_markers = [
            "485", "500", "820", "801", "189", "190", "491",
            "deadline", "time limit", "review period", "art", "tribunal",
            "waiver", "schedule 3", "noicc", "section 116", "s116", "regulation",
        ]
        if any(marker in lowered for marker in specific_markers):
            return True
        specific_phrases = [
            "am i eligible", "can i appeal", "can i apply", "how many days",
            "what deadline", "what are my review rights", "can this be waived", "does this apply",
        ]
        return any(phrase in lowered for phrase in specific_phrases) and ("my " in lowered or "i " in lowered)
