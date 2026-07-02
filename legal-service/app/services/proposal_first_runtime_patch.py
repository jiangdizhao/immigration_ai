from __future__ import annotations

"""Runtime integration for proposal-first verified answers.

Importing this module monkey-patches QueryService.handle_query behind an env flag.
It does not add subclass-specific routing. The route is:
free proposal memo -> search/verification -> final answer.
"""

import logging
import os
import re
from typing import Any

from sqlalchemy.orm import Session

from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.state import AnswerPackage, MatterState, PolicyDecision, EvidencePackage
from app.services.proposal_first_verified_answer_service import ProposalFirstVerifiedAnswerService
from app.services.query_service import QueryService, _QueryStageTimer

logger = logging.getLogger(__name__)
_PATCHED = False
_SERVICE: ProposalFirstVerifiedAnswerService | None = None
_ORIGINAL_HANDLE_QUERY = None


def _enabled() -> bool:
    return os.getenv("PROPOSAL_FIRST_VERIFIED_ENABLED", "false").strip().lower() not in {"0", "false", "no", "off"}


def _service() -> ProposalFirstVerifiedAnswerService:
    global _SERVICE
    if _SERVICE is None:
        _SERVICE = ProposalFirstVerifiedAnswerService()
    return _SERVICE


def _politics_sensitive(text: str) -> bool:
    """Very narrow political-persuasion guard; not triggered by immigration law mentions of Minister/government."""
    q = (text or "").lower()
    persuasion_terms = [
        "vote for", "vote against", "who should i vote", "campaign for", "campaign against",
        "persuade voters", "political party", "election campaign", "attack ad", "donate to party",
    ]
    return any(term in q for term in persuasion_terms)


def _should_use_proposal_first(question: str, state: MatterState | None) -> bool:
    q = (question or "").lower()
    if _politics_sensitive(q):
        return True
    if state is not None and getattr(state, "conversation_history", None):
        # Existing immigration conversation: let the stronger proposal-first path handle follow-ups.
        return True
    legal_terms = [
        "visa", "subclass", "immigration", "migration", "home affairs", "schedule 1", "schedule 2",
        "bridging", "student visa", "temporary", "permanent residency", "sponsor", "nomination",
        "refusal", "refused", "review", "appeal", "tribunal", "art", "condition", "work in australia",
        "留学", "签证", "移民", "拒签", "上诉", "复审", "澳洲", "澳大利亚",
    ]
    return any(term in q for term in legal_terms)


def _politics_filter_response(payload: QueryRequest, matter_id: str | None, response_language: str) -> QueryResponse:
    if response_language == "zh":
        answer = "我不能帮助进行政治竞选、投票劝说或针对选民的政治说服。但我可以继续帮助你处理澳大利亚移民、签证和预约咨询相关问题。"
    else:
        answer = "I can’t help with political campaigning, voting persuasion, or targeted political messaging. I can still help with Australian immigration, visa, and consultation-booking questions."
    return QueryResponse(
        matter_id=matter_id,
        answer=answer,
        response_language="zh" if response_language == "zh" else "en",
        confidence="high",
        issue_type=None,
        missing_facts=[],
        follow_up_questions=[],
        citations=[],
        compact_sources=[],
        escalate=False,
        next_action="answer",
        user_display_mode="direct_short",
        retrieval_debug={"proposal_first_verified_answer": {"used": False, "politics_sensitive_filter": True}},
    )


def apply_patch() -> None:
    global _PATCHED, _ORIGINAL_HANDLE_QUERY
    if _PATCHED:
        return
    _PATCHED = True
    _ORIGINAL_HANDLE_QUERY = QueryService.handle_query

    def patched_handle_query(self: QueryService, db: Session, payload: QueryRequest) -> QueryResponse:
        if not _enabled():
            return _ORIGINAL_HANDLE_QUERY(self, db, payload)

        original_payload = payload
        original_question = payload.question
        timing = _QueryStageTimer(request_id=f"proposal-first-{__import__('time').time_ns()}")

        language_context = self.language_service.prepare_turn(
            question=payload.question,
            requested_language=payload.response_language,
        )
        response_language = language_context.response_language
        internal_payload = payload
        if (
            language_context.internal_question_en.strip() != payload.question.strip()
            or payload.response_language != response_language
        ):
            internal_payload = QueryRequest(
                **{
                    **payload.model_dump(),
                    "question": language_context.internal_question_en,
                    "response_language": response_language,
                }
            )
        timing.mark("proposal_first_language_context", response_language=response_language)

        matter = self._get_or_create_matter(db, internal_payload)
        timing.matter_id = matter.id
        current_state = self.state_machine.hydrate_state(matter.metadata_json)
        timing.mark("proposal_first_state_load")

        if _politics_sensitive(original_question):
            response = _politics_filter_response(internal_payload, matter.id, response_language)
            response.retrieval_debug["stage_timing"] = timing.to_debug_dict()
            return response

        if not _should_use_proposal_first(original_question, current_state):
            return _ORIGINAL_HANDLE_QUERY(self, db, original_payload)

        known_facts: dict[str, Any] = {
            **(current_state.carried_intake_facts or {}),
            **(internal_payload.intake_facts or {}),
        }
        history = [turn.model_dump() for turn in current_state.conversation_history]

        try:
            response = _service().answer(
                db=db,
                payload=QueryRequest(**{**internal_payload.model_dump(), "matter_id": matter.id, "top_k": max(internal_payload.top_k or 8, 8)}),
                original_question=original_question,
                effective_question=internal_payload.question,
                conversation_history=history,
                known_facts=known_facts,
                response_language=response_language,
                matter_id=matter.id,
            )
            timing.mark("proposal_first_verified_answer")
        except Exception:
            logger.exception("Proposal-first verified answer path failed; falling back to original QueryService")
            return _ORIGINAL_HANDLE_QUERY(self, db, original_payload)

        new_state = current_state.model_copy(deep=True)
        new_state.latest_question = internal_payload.question
        new_state.last_contextualized_question = internal_payload.question
        new_state.next_action = response.next_action
        new_state.last_answer_type = "specific_grounded" if response.next_action == "answer" else "general_guidance"
        new_state.conversation_state = "FOLLOW_UP_PENDING" if response.next_action == "ask_followup" else "ANSWERED_GENERAL"
        new_state.carried_intake_facts = dict(new_state.carried_intake_facts or {})
        new_state.carried_intake_facts.update(internal_payload.intake_facts or {})
        proposal_debug = (response.retrieval_debug or {}).get("proposal_first_verified_answer") or {}
        proposal_obj = proposal_debug.get("proposal") if isinstance(proposal_debug, dict) else None
        if isinstance(proposal_obj, dict):
            candidate_labels = []
            for item in proposal_obj.get("candidate_index") or []:
                if isinstance(item, dict) and item.get("candidate_label"):
                    candidate_labels.append(str(item.get("candidate_label")))
            if candidate_labels:
                new_state.carried_intake_facts["last_proposal_candidate_labels"] = candidate_labels[:10]
        new_state = self.state_machine.append_turn_pair(
            state=new_state,
            user_question=internal_payload.question,
            effective_question=internal_payload.question,
            assistant_answer=response.answer,
            next_action=response.next_action,
            confidence=response.confidence,
        )
        response.conversation_state = new_state.conversation_state
        response.case_hypothesis = new_state.case_hypothesis
        response.fact_slot_states = new_state.fact_slot_states
        response.interaction_plan = new_state.interaction_plan
        response.response_language = response_language

        debug = dict(response.retrieval_debug or {})
        debug["language"] = language_context.to_debug_dict()
        debug["stage_timing"] = timing.to_debug_dict()
        debug["trace_path"] = "proposal_first_verified_answer"
        response.retrieval_debug = debug

        self._update_matter_from_state(
            matter=matter,
            payload=internal_payload,
            state=new_state,
            effective_question=internal_payload.question,
        )
        # Do not persist citations here: this path may include ephemeral live citations.
        # Review trace still records the public citations for lawyer audit.
        db.commit()
        db.refresh(matter)
        self._record_review_trace(
            matter=matter,
            payload=internal_payload,
            response=response,
            state=new_state,
            semantic_turn=None,
            timing=timing,
            original_question=original_question,
            effective_question=internal_payload.question,
            legal_decision=None,
            communication_plan=None,
            extra_debug={"trace_path": "proposal_first_verified_answer"},
        )
        return response

    QueryService.handle_query = patched_handle_query
    logger.info("Proposal-first verified answer runtime patch applied")


apply_patch()
