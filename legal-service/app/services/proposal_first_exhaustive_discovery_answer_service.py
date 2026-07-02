
from __future__ import annotations
from typing import Any
from app.schemas.query import QueryRequest, QueryResponse
from app.services.schedule2_exhaustive_discovery_service import Schedule2ExhaustiveDiscoveryService
from app.services.candidate_evidence_bundle_service import CandidateEvidenceBundleService
from app.services.gold_standard_candidate_verifier_service import GoldStandardCandidateVerifierService
class ProposalFirstExhaustiveDiscoveryAnswerService:
    def __init__(self)->None: self.discovery=Schedule2ExhaustiveDiscoveryService(); self.bundles=CandidateEvidenceBundleService(); self.verifier=GoldStandardCandidateVerifierService()
    def answer(self,*,payload:QueryRequest,memory_packet:Any,response_language:str="en")->QueryResponse:
        discovery=self.discovery.discover(question=payload.question,memory_packet=memory_packet,limit=8); bundle_map=self.bundles.build(candidates=discovery.candidates,limit_per_candidate=8); verification=self.verifier.verify(bundles=bundle_map,question=payload.question,memory_packet=memory_packet); answer=self._draft_answer(verification,response_language=response_language); follow_up=self._best_followup(verification,response_language=response_language); compact=[]
        for c in verification.verified_candidates[:4]: compact.append(f"Subclass {c.subclass}" + (f" — {c.title}" if c.title else ""))
        debug={"unified_context":{"enabled":True,"reasoning_depth":{"tier":"exhaustive_discovery","requires_exhaustive_schedule2":True,"requires_candidate_comparison":True},"memory_packet":memory_packet.context_packaging_debug,"conversation_identity":{"matter_id":memory_packet.matter_id,"session_id":memory_packet.session_id,"backend_history_turn_count":len(memory_packet.full_conversation_history),"frontend_message_count":len(memory_packet.frontend_messages)},"schedule2_exhaustive_discovery":discovery.model_dump(),"candidate_evidence_bundles":{k:v.model_dump() for k,v in bundle_map.items()},"gold_standard_verification":verification.model_dump()}}
        return QueryResponse(matter_id=payload.matter_id,answer=answer,response_language="zh" if response_language=="zh" else "en",confidence="high" if verification.verified_candidates else "medium",user_display_mode="answer_then_ask" if follow_up else "general_with_warning",issue_type="visa_options_discovery",missing_facts=[],follow_up_questions=[follow_up] if follow_up else [],citations=[],compact_sources=compact[:4],escalate=False,next_action="ask_followup" if follow_up else "answer",retrieval_debug=debug)
    def _draft_answer(self,verification:Any,*,response_language:str)->str:
        cands=verification.verified_candidates
        if response_language=="zh":
            if not cands: return "我没有在当前 Schedule 2 索引中找到足够清晰的候选签证类别。建议把工作内容、时长、是否雇主愿意担保/提名补充给律师核查。"
            lines=["根据你提供的信息，我会先这样排序：",""]
            for i,c in enumerate(cands[:5],1):
                lines.append(f"{i}. **Subclass {c.subclass}"+(f" — {c.title}" if c.title else "")+f"**（{c.fit}）")
                if c.reasons_for: lines.append("   - 符合点："+"；".join(c.reasons_for[:3]))
                if c.reasons_against: lines.append("   - 限制/风险："+"；".join(c.reasons_against[:3]))
            lines.append(""); lines.append("这只是初步方向，最终仍要按 Schedule 1/2、官方指南和具体事实核查。"); return "\n".join(lines)
        if not cands: return "I could not identify a sufficiently clear visa candidate from the current Schedule 2 index. The work activity, duration, payment, and employer sponsorship/support position should be checked with a lawyer."
        lines=["Based on the facts provided, I would check the options in this order:",""]
        for i,c in enumerate(cands[:5],1):
            lines.append(f"{i}. **Subclass {c.subclass}"+(f" — {c.title}" if c.title else "")+f"** — {c.fit.replace('_',' ')}")
            if c.reasons_for: lines.append("   - Why it may fit: "+"; ".join(c.reasons_for[:3]))
            if c.reasons_against: lines.append("   - Limitations: "+"; ".join(c.reasons_against[:3]))
        lines.append(""); lines.append("This is a provisional pathway map. The final position still depends on Schedule 1 validity, Schedule 2 grant criteria, and the precise activity/duration/sponsorship facts."); return "\n".join(lines)
    def _best_followup(self,verification:Any,*,response_language:str)->str|None:
        facts=[]
        for c in verification.verified_candidates[:3]: facts.extend(c.missing_decisive_facts)
        if not facts: return None
        return "这个工作是否是真正短期、非持续性的，并且预计会在 6 个月以内完成？" if response_language=="zh" else "Is the work genuinely short-term and non-ongoing, and is it expected to be completed within 6 months or less?"
