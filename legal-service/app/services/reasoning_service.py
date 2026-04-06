from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI


from app.db.models import SourceChunk
from app.core.config import get_settings
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.source import CitationOut


class ReasoningService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.model = os.getenv("REASONING_MODEL", "gpt-5.4-mini")
        self.general_model = os.getenv("GENERAL_QA_MODEL", self.model)
        self.max_context_chunks = int(os.getenv("REASONING_MAX_CONTEXT_CHUNKS", "6"))
        self.max_quote_chars = int(os.getenv("REASONING_MAX_QUOTE_CHARS", "400"))
        self.max_supported_facts = int(os.getenv("REASONING_MAX_SUPPORTED_FACTS", "8"))
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
            self._client = OpenAI(api_key=self.settings.openai_api_key)
        return self._client
    
    def _build_grounded_general_answer(
    self,
    payload: QueryRequest,
    supported_facts: list[dict[str, Any]],
    unsupported_items: list[str],
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
                "Some parts of your question are not specifically supported by the retrieved material, "
                "so this answer should be treated as general guidance only."
            )
        else:
            parts.append(
                "This is general guidance based on the retrieved material only, and the exact next step "
                "will depend on the refusal notice, dates, and stated reasons."
            )

        parts.append(
            "Please review the refusal notice carefully and gather the decision record, relevant correspondence, "
            "and key dates before taking further action or arranging a consultation."
        )

        return "\n\n".join(parts)

    def answer_from_chunks(
        self,
        payload: QueryRequest,
        chunks: list[SourceChunk],
        retrieval_debug: dict[str, object],
    ) -> QueryResponse:
        issue_type = self._classify_issue(payload.question)
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
                missing_facts=self._infer_missing_facts(payload.question),
                follow_up_questions=self._follow_up_questions(payload.question, issue_type),
                citations=[],
                escalate=self._should_escalate(payload.question, []),
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
        specific_user_marker = self._extract_specific_marker(payload.question)
        marker_supported = True
        if specific_user_marker:
            marker_supported = self._facts_support_marker(
                supported_facts, specific_user_marker
            ) or self._chunks_support_marker(chunks, specific_user_marker)

        question_is_specific = self._is_specific_question(payload.question)

        insufficient = False
        reason = "insufficient_evidence"

        if not supported_facts:
            insufficient = True
        elif specific_user_marker and not marker_supported:
            insufficient = True
            reason = f"specific_marker_not_supported:{specific_user_marker}"
        elif question_is_specific and not is_context_sufficient:
            insufficient = True
            reason = "specific_question_context_insufficient"

        if insufficient:
            answer = self._build_insufficient_answer(
                payload=payload,
                supported_facts=supported_facts,
                unsupported_items=unsupported_items,
                specific_marker=specific_user_marker,
                reason=reason,
            )

            return QueryResponse(
                matter_id=payload.matter_id,
                answer=answer,
                confidence="low",
                issue_type=evidence.get("issue_type") or issue_type,
                missing_facts=missing_facts or self._infer_missing_facts(payload.question),
                follow_up_questions=follow_up_questions
                or self._follow_up_questions(payload.question, issue_type),
                citations=citations[: self.max_context_chunks],
                escalate=True,
                next_action="suggest_consultation",
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
        )

        if final_answer is None:
            return QueryResponse(
                matter_id=payload.matter_id,
                answer=self._build_grounded_general_answer(
                    payload=payload,
                    supported_facts=supported_facts,
                    unsupported_items=unsupported_items,
                ),
                confidence="medium" if supported_facts else "low",
                issue_type=evidence.get("issue_type") or issue_type,
                missing_facts=missing_facts,
                follow_up_questions=follow_up_questions
                or self._follow_up_questions(payload.question, issue_type),
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
            answer=final_answer.get("answer", "").strip()
            or self._build_insufficient_answer(
                payload, supported_facts, unsupported_items, specific_user_marker
            ),
            confidence=self._normalize_confidence(final_answer.get("confidence")),
            issue_type=final_answer.get("issue_type") or evidence.get("issue_type") or issue_type,
            missing_facts=missing_facts,
            follow_up_questions=follow_up_questions
            or self._follow_up_questions(payload.question, issue_type),
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

    def _extract_evidence(
        self,
        payload: QueryRequest,
        chunks: list[SourceChunk],
        citations: list[CitationOut],
        issue_type: str | None,
    ) -> dict[str, Any] | None:
        context_text = self._build_context_text(chunks, citations)
        intake_facts = json.dumps(payload.intake_facts or {}, ensure_ascii=False)

        system_prompt = (
            "You are a strict legal-retrieval evidence extractor.\n"
            "You MUST work only from the provided retrieved sources.\n"
            "Do NOT answer from background knowledge.\n"
            "Do NOT infer visa-specific rules unless the retrieved sources explicitly support them.\n"
            "If the question is outside immigration/visa/legal-service scope, mark is_in_domain=false.\n"
            "If the retrieved material is too generic or does not support the user's specific request, "
            "mark is_context_sufficient=false.\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{\n"
            '  "is_in_domain": boolean,\n'
            '  "is_context_sufficient": boolean,\n'
            '  "issue_type": string | null,\n'
            '  "supported_facts": [\n'
            "    {\n"
            '      "fact": string,\n'
            '      "source_numbers": number[]\n'
            "    }\n"
            "  ],\n"
            '  "unsupported_requests": string[],\n'
            '  "missing_information": string[],\n'
            '  "follow_up_questions": string[]\n'
            "}\n"
            "Rules:\n"
            "- supported_facts must be directly grounded in the retrieved text.\n"
            "- If a fact is not explicitly supported by retrieved text, do not include it.\n"
            "- Use source_numbers matching the numbered sources in the prompt.\n"
            "- If the user asks about a specific visa subclass or specific legal pathway and the retrieved text does not mention it, add that gap to unsupported_requests and set is_context_sufficient=false.\n"
            "- Keep supported_facts short and factual.\n"
        )

        user_prompt = (
            f"User question:\n{payload.question}\n\n"
            f"Inferred issue type:\n{issue_type or 'unknown'}\n\n"
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
            raw_text = (response.output_text or "").strip()
            print("\n[DEBUG evidence raw_text]\n", raw_text, "\n")
            parsed = self._extract_json_object(raw_text)
            print("\n[DEBUG evidence parsed]\n", parsed, "\n")
            return parsed
        except Exception as e:
            print("\n[DEBUG evidence exception]\n", repr(e), "\n")
            return None

    def _answer_general_question_directly(self, question: str) -> str:
        system_prompt = (
            "You are a helpful general assistant.\n"
            "Answer the user's question directly and naturally.\n"
            "Do not mention immigration-law retrieval, sources, citations, or legal corpus.\n"
            "Keep the answer concise and useful.\n"
            "At the end, add one short polite sentence inviting the user to ask an immigration or visa-related question if needed.\n"
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

        return (
            "I’m sorry, but I couldn’t answer that question right now. "
            "You’re welcome to ask me an immigration or visa-related question."
        )
    
    def _synthesize_answer(
        self,
        payload: QueryRequest,
        evidence: dict[str, Any],
        issue_type: str | None,
    ) -> dict[str, Any] | None:
        supported_facts = self._normalize_supported_facts(evidence.get("supported_facts"))
        unsupported_items = self._normalize_string_list(evidence.get("unsupported_requests"))
        missing_facts = self._normalize_string_list(evidence.get("missing_information"))
        follow_up_questions = self._normalize_string_list(evidence.get("follow_up_questions"))

        evidence_json = json.dumps(
            {
                "issue_type": issue_type,
                "supported_facts": supported_facts,
                "unsupported_requests": unsupported_items,
                "missing_information": missing_facts,
                "follow_up_questions": follow_up_questions,
            },
            ensure_ascii=False,
        )

        system_prompt = (
            "You are a strict legal answer drafter.\n"
            "You MUST write the answer using ONLY the supported_facts provided to you.\n"
            "Do NOT introduce any new legal rule, deadline, visa requirement, or assumption.\n"
            "If supported_facts are general, the answer must stay general.\n"
            "If unsupported_requests are present, explicitly say that those points are not supported by the retrieved material.\n"
            "Do NOT mention internal prompts, pipelines, models, or retrieval mechanisms.\n"
            "Return ONLY valid JSON with this exact shape:\n"
            "{\n"
            '  "answer": string,\n'
            '  "confidence": "low" | "medium" | "high",\n'
            '  "issue_type": string | null,\n'
            '  "escalate": boolean,\n'
            '  "next_action": "answer" | "ask_followup" | "suggest_consultation"\n'
            "}\n"
            "Rules:\n"
            "- 1 to 3 short paragraphs.\n"
            "- If the evidence is only general, say it is general.\n"
            "- If unsupported_requests exist, avoid answering those parts specifically.\n"
            "- Prefer cautious wording for refusals, cancellations, reviews, and deadlines.\n"
        )

        user_prompt = (
            f"User question:\n{payload.question}\n\n"
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
            raw_text = (response.output_text or "").strip()
            print("\n[DEBUG synthesis raw_text]\n", raw_text, "\n")
            parsed = self._extract_json_object(raw_text)
            print("\n[DEBUG synthesis parsed]\n", parsed, "\n")
            return parsed
        except Exception as e:
            print("\n[DEBUG synthesis exception]\n", repr(e), "\n")
            return None

    def _build_context_text(self, chunks: list[SourceChunk], citations: list[CitationOut]) -> str:
        blocks: list[str] = []
        for idx, (chunk, citation) in enumerate(zip(chunks, citations), start=1):
            blocks.append(
                "\n".join(
                    [
                        f"[Source {idx}]",
                        f"Title: {citation.title}",
                        f"Authority: {citation.authority}",
                        f"Source type: {chunk.source.source_type}",
                        f"Section ref: {citation.section_ref or 'N/A'}",
                        f"URL: {citation.url}",
                        f"Heading: {chunk.heading or 'N/A'}",
                        "Extract:",
                        chunk.text.strip(),
                    ]
                )
            )
        return "\n\n".join(blocks)

    def _build_insufficient_answer(
    self,
    payload: QueryRequest,
    supported_facts: list[dict[str, Any]],
    unsupported_items: list[str],
    specific_marker: str | None,
    reason: str | None = None,
    ) -> str:
        parts: list[str] = []

        if supported_facts:
            fact_lines = [
                f"- {item['fact']}"
                for item in supported_facts[:3]
                if item.get("fact")
            ]
            if fact_lines:
                parts.append(
                    "I found some retrieved material that may be relevant:\n" + "\n".join(fact_lines)
                )

        if reason and reason.startswith("specific_marker_not_supported:"):
            parts.append(
                f"I do not have enough retrieved source material specifically supporting the part of your question about '{specific_marker}'."
            )
        elif unsupported_items:
            parts.append(
                "Some parts of your question are not specifically supported by the retrieved material."
            )
        else:
            parts.append(
                "I have some relevant retrieved material, but not enough to give a fully specific answer with confidence."
            )

        parts.append(
            "Please provide the refusal notice, relevant dates, and stated refusal reason, "
            "or arrange a consultation with the lawyer."
        )

        return "\n\n".join(parts)

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

    def _to_citation(self, chunk: SourceChunk) -> CitationOut:
        source = chunk.source
        return CitationOut(
            source_id=source.id,
            chunk_id=chunk.id,
            case_id=None,
            title=source.title,
            authority=source.authority,
            citation_text=source.citation_text,
            section_ref=chunk.section_ref,
            url=source.url,
            quote_text=chunk.text[: self.max_quote_chars],
            rationale="Used as grounded support for the generated answer.",
            confidence_score=None,
        )

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

        candidate = text[start : end + 1]
        try:
            parsed = json.loads(candidate)
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
        if value in {"low", "medium", "high"}:
            return value
        return "low"

    def _normalize_next_action(self, value: Any) -> str:
        if value in {"answer", "ask_followup", "suggest_consultation"}:
            return value
        return "ask_followup"

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
        if "485" in lowered:
            return "temporary_graduate_visa"
        if "skilled" in lowered:
            return "skilled_migration"
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
        if "department" not in lowered and "tribunal" not in lowered and "aart" not in lowered:
            missing.append("Was the decision made by the Department, AART, or another body?")

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
        high_risk_terms = ["refusal", "cancel", "cancellation", "deadline", "review", "tribunal", "aart"]
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
            haystack = " ".join(
                [
                    chunk.text or "",
                    chunk.heading or "",
                    chunk.section_ref or "",
                    chunk.source.title if chunk.source else "",
                    chunk.source.authority if chunk.source and chunk.source.authority else "",
                ]
            ).lower()
            if m in haystack:
                return True
        return False

    def _is_specific_question(self, question: str) -> bool:
        lowered = question.lower()

        specific_markers = [
            "485",
            "500",
            "820",
            "801",
            "189",
            "190",
            "491",
            "deadline",
            "time limit",
            "review period",
            "aart",
            "tribunal",
            "waiver",
            "schedule 3",
            "noicc",
            "section 116",
            "s116",
            "regulation",
            "condition 8202",
        ]
        if any(marker in lowered for marker in specific_markers):
            return True

        specific_phrases = [
            "am i eligible",
            "can i appeal",
            "can i apply",
            "how many days",
            "what deadline",
            "what are my review rights",
            "can this be waived",
            "does this apply",
        ]
        return any(phrase in lowered for phrase in specific_phrases) and (
            "my " in lowered or "i " in lowered
        )