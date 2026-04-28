from __future__ import annotations

from typing import Any

from app.schemas.query import QueryResponse
from app.schemas.source import CitationOut
from app.schemas.state import EvidencePackage, MatterState, PolicyDecision, SufficiencyGateResult
from app.services.pre_llm_router_service import PreLLMTurnAnalysis


class LightweightResponseService:
    """Compose safe, compact responses for turns that do not require full LLM reasoning."""

    def can_answer_without_llm(
        self,
        *,
        analysis: PreLLMTurnAnalysis,
        chunks: list[Any] | None = None,
        sufficiency_gate: SufficiencyGateResult | None = None,
    ) -> bool:
        if not analysis.can_skip_answer_llm:
            return False
        if analysis.turn_type in {"greeting", "booking_request", "guided_intake_update"}:
            return True
        if analysis.turn_type == "simple_definition_query":
            # Definition queries still need at least some legal/official source context unless
            # we are using a very conservative fallback wording.
            return bool(chunks)
        return False

    def build_response(
        self,
        *,
        analysis: PreLLMTurnAnalysis,
        state: MatterState,
        effective_question: str,
        chunks: list[Any] | None = None,
        retrieval_debug: dict[str, Any] | None = None,
        matter_id: str | None = None,
    ) -> QueryResponse:
        chunks = chunks or []
        retrieval_debug = dict(retrieval_debug or {})
        retrieval_debug["pre_llm_router"] = {
            "turn_type": analysis.turn_type,
            "display_mode": analysis.display_mode,
            "no_llm_needed": analysis.no_llm_needed,
            "reasons": analysis.reasons,
            "extracted_facts": analysis.extraction.facts,
            "fact_confidence": analysis.extraction.fact_confidence,
        }

        if analysis.turn_type == "greeting":
            return QueryResponse(
                matter_id=matter_id,
                answer=(
                    "Hi, I can help with general Australian visa questions and prepare you for a lawyer consultation. "
                    "Tell me what visa issue you are dealing with, such as a Student visa 500 refusal, a 485 question, a visa condition, or a bridging-visa travel issue."
                ),
                confidence="high",
                issue_type=state.issue_type,
                missing_facts=[],
                follow_up_questions=["What visa issue would you like help with?"],
                citations=[],
                escalate=False,
                next_action="ask_followup",
                user_display_mode="direct_short",
                retrieval_debug=retrieval_debug,
            )

        if analysis.turn_type == "booking_request":
            return QueryResponse(
                matter_id=matter_id,
                answer=(
                    "I can help you prepare for a consultation. Before booking, it helps to have your visa subclass, any refusal or grant notice, key dates, and a short summary of what you need help with. "
                    "You can continue here, or use the consultation booking option to speak with a lawyer."
                ),
                confidence="high",
                issue_type=state.issue_type,
                missing_facts=[],
                follow_up_questions=["Would you like to tell me the visa subclass and the main issue before booking?"],
                citations=[],
                escalate=True,
                next_action="suggest_consultation",
                user_display_mode="booking_handoff",
                retrieval_debug=retrieval_debug,
            )

        if analysis.turn_type == "guided_intake_update":
            return QueryResponse(
                matter_id=matter_id,
                answer=(
                    "Thanks, I’ve noted that detail. I can still give general guidance if you are unsure about some information, but any specific deadline or legal option should be checked against the actual notice or document."
                ),
                confidence="medium",
                issue_type=state.issue_type,
                missing_facts=[],
                follow_up_questions=[],
                citations=[],
                escalate=False,
                next_action="ask_followup",
                user_display_mode="answer_then_ask",
                retrieval_debug=retrieval_debug,
            )

        if analysis.turn_type == "simple_definition_query":
            condition_no = analysis.extraction.facts.get("visa_condition_number")
            answer = self._condition_answer(condition_no=condition_no, chunks=chunks)
            citations = self._citations_from_chunks(chunks[:3])
            return QueryResponse(
                matter_id=matter_id,
                answer=answer,
                confidence="medium" if citations else "low",
                issue_type=state.issue_type or "visa_conditions",
                missing_facts=[],
                follow_up_questions=["Do you want me to explain how this condition affects your specific visa?"],
                citations=citations,
                escalate=False,
                next_action="answer",
                user_display_mode="direct_short",
                retrieval_debug=retrieval_debug,
            )

        return QueryResponse(
            matter_id=matter_id,
            answer="I can give general guidance, but I need a little more context to make it useful.",
            confidence="low",
            issue_type=state.issue_type,
            missing_facts=[],
            follow_up_questions=["What visa subclass or issue are you asking about?"],
            citations=[],
            escalate=False,
            next_action="ask_followup",
            user_display_mode="ask_one_question",
            retrieval_debug=retrieval_debug,
        )

    def build_policy_for_lightweight_response(
        self,
        *,
        analysis: PreLLMTurnAnalysis,
        response: QueryResponse,
    ) -> PolicyDecision:
        return PolicyDecision(
            answer_allowed=True,
            escalate=response.escalate,
            next_action=response.next_action,
            confidence_cap=response.confidence,
            reasons=["pre_llm_lightweight_response", analysis.turn_type],
            answer_mode="direct_answer" if response.next_action == "answer" else "qualified_general",
            coverage_summary={"pre_llm_router": analysis.reasons},
        )

    def evidence_for_lightweight_response(
        self,
        *,
        analysis: PreLLMTurnAnalysis,
        response: QueryResponse,
        state: MatterState,
    ) -> EvidencePackage:
        return EvidencePackage(
            is_in_domain=True,
            is_context_sufficient=response.next_action == "answer",
            issue_type=response.issue_type or state.issue_type,
            operation_type=state.operation_type,
            missing_information=list(response.missing_facts or []),
            follow_up_questions=list(response.follow_up_questions or []),
        )

    def _condition_answer(self, *, condition_no: Any, chunks: list[Any]) -> str:
        condition = str(condition_no or "").strip()
        text_blob = "\n".join(str(getattr(chunk, "text", "") or "") for chunk in chunks[:4]).lower()

        if condition == "8501" or "health insurance" in text_blob:
            return (
                "Condition 8501 generally means the visa holder must maintain adequate health insurance while in Australia. "
                "For Student visa and similar cases, this is commonly about keeping appropriate health cover such as OSHC for the required period. "
                "Check your visa grant notice for the exact wording and dates that apply to you."
            )
        if condition == "8503":
            return (
                "Condition 8503 is commonly known as a 'No Further Stay' condition. In general, it can restrict a person from applying for many other visas while in Australia unless a waiver or exception applies. "
                "You should check the exact visa grant notice and get advice before relying on this in a specific case."
            )
        if condition in {"8104", "8105"} or "work" in text_blob:
            return (
                f"Condition {condition or 'this condition'} appears to relate to work rights or work restrictions. "
                "The practical effect depends on the exact condition wording and your visa type, so check the visa grant notice before acting on it."
            )
        if condition:
            return (
                f"Condition {condition} is a visa condition attached to a visa grant. The exact practical effect depends on the wording in the visa grant notice and the relevant official source. "
                "I can explain it more specifically if you paste the condition wording or tell me your visa subclass."
            )
        return (
            "A visa condition is a rule attached to a visa grant. The exact effect depends on the condition number and the wording in your visa grant notice."
        )

    def _citations_from_chunks(self, chunks: list[Any]) -> list[CitationOut]:
        citations: list[CitationOut] = []
        for chunk in chunks:
            source = getattr(chunk, "source", None)
            if source is None:
                continue
            source_id = str(getattr(source, "id", "") or "")
            title = str(getattr(source, "title", "") or "Untitled source")
            url = str(getattr(source, "url", "") or "")
            authority = str(getattr(source, "authority", "") or "Official source")
            if not source_id or not url:
                continue
            quote = str(getattr(chunk, "text", "") or "")[:280].strip()
            citations.append(
                CitationOut(
                    source_id=source_id,
                    chunk_id=str(getattr(chunk, "id", "") or "") or None,
                    title=title,
                    authority=authority,
                    citation_text=str(getattr(source, "citation_text", "") or title),
                    section_ref=getattr(chunk, "section_ref", None),
                    url=url,
                    quote_text=quote or None,
                    rationale="Source considered for a simple definition answer.",
                    confidence_score=None,
                )
            )
        return citations
