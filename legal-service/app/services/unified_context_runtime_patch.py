
from __future__ import annotations
import logging
from typing import Any
from app.schemas.query import QueryRequest
from app.services.query_service import QueryService
from app.services.conversation_memory_service import ConversationMemoryService
from app.services.reasoning_depth_router_service import ReasoningDepthRouter
from app.services.proposal_first_exhaustive_discovery_answer_service import ProposalFirstExhaustiveDiscoveryAnswerService
logger=logging.getLogger(__name__); _PATCHED=False
def apply_patch()->None:
    global _PATCHED
    if _PATCHED: return
    _PATCHED=True; original_handle_query=QueryService.handle_query
    def unified_handle_query(self:QueryService,db:Any,payload:QueryRequest):
        original_question=payload.question; language_context=self.language_service.prepare_turn(question=payload.question,requested_language=payload.response_language); effective_payload=payload
        if language_context.internal_question_en.strip()!=payload.question.strip() or payload.response_language!=language_context.response_language: effective_payload=QueryRequest(**{**payload.model_dump(),"question":language_context.internal_question_en,"response_language":language_context.response_language})
        matter=self._get_or_create_matter(db,effective_payload); current_state=self.state_machine.hydrate_state(matter.metadata_json); memory_service=getattr(self,"unified_conversation_memory_service",None) or ConversationMemoryService(); self.unified_conversation_memory_service=memory_service
        memory_packet=memory_service.build(matter=matter,current_state=current_state,latest_user_message_raw=original_question,latest_user_message_internal_en=effective_payload.question,frontend_messages=getattr(payload,"frontend_messages",[]) or [])
        router=getattr(self,"unified_reasoning_depth_router",None) or ReasoningDepthRouter(); self.unified_reasoning_depth_router=router; tier=router.classify(memory_packet=memory_packet,current_state=current_state)
        if tier.tier=="exhaustive_discovery":
            deep=getattr(self,"unified_deep_discovery_answer_service",None) or ProposalFirstExhaustiveDiscoveryAnswerService(); self.unified_deep_discovery_answer_service=deep; response=deep.answer(payload=QueryRequest(**{**effective_payload.model_dump(),"matter_id":matter.id}),memory_packet=memory_packet,response_language=language_context.response_language); response.matter_id=matter.id
            state=current_state.model_copy(deep=True); state.latest_question=effective_payload.question; state.last_contextualized_question=effective_payload.question; state.issue_type=response.issue_type; state.operation_type="exhaustive_visa_discovery"; state.next_action=response.next_action; state.last_answer_type="specific_grounded"; state.carried_intake_facts=dict(state.carried_intake_facts or {}); state.carried_intake_facts["last_reasoning_tier"]=tier.model_dump(); state=self.state_machine.append_turn_pair(state=state,user_question=effective_payload.question,effective_question=effective_payload.question,assistant_answer=response.answer,next_action=response.next_action,confidence=response.confidence); self._update_matter_from_state(matter=matter,payload=effective_payload,state=state,effective_question=effective_payload.question); db.commit(); db.refresh(matter); return response
        response=original_handle_query(self,db,payload); debug=dict(response.retrieval_debug or {}); debug.setdefault("unified_context",{}); debug["unified_context"].update({"enabled":True,"reasoning_depth":tier.model_dump(),"memory_packet":memory_packet.context_packaging_debug,"conversation_identity":{"matter_id_in":payload.matter_id,"matter_id_out":response.matter_id,"same_matter_reused":bool(payload.matter_id and response.matter_id and payload.matter_id==response.matter_id),"backend_history_turn_count":len(memory_packet.full_conversation_history),"frontend_message_count":len(memory_packet.frontend_messages)}}); response.retrieval_debug=debug; return response
    QueryService.handle_query=unified_handle_query; logger.info("Unified context + tiered discovery runtime patch applied")
apply_patch()
