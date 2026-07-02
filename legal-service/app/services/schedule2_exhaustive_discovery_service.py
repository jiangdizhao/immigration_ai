
from __future__ import annotations
import re
from collections import defaultdict
from typing import Any
from pydantic import BaseModel, Field
from app.schedule.schedule2_index_service import ScheduleIndexService
class Schedule2DiscoveredCandidate(BaseModel):
    subclass: str; title: str | None = None; score: float; fit_status: str = "possible"; matched_clauses: list[str] = Field(default_factory=list); matched_terms: list[str] = Field(default_factory=list); matched_concepts: list[str] = Field(default_factory=list); evidence_snippets: list[str] = Field(default_factory=list); reasons_for: list[str] = Field(default_factory=list); reasons_against: list[str] = Field(default_factory=list); missing_decisive_facts: list[str] = Field(default_factory=list)
class Schedule2ExhaustiveDiscoveryResult(BaseModel):
    enabled: bool = True; total_clauses_scanned: int = 0; total_subclasses_scanned: int = 0; query_terms: list[str] = Field(default_factory=list); legal_concepts: list[str] = Field(default_factory=list); candidates: list[Schedule2DiscoveredCandidate] = Field(default_factory=list)
class Schedule2ExhaustiveDiscoveryService:
    def __init__(self, *, index_service: ScheduleIndexService | None = None) -> None: self.index_service=index_service or ScheduleIndexService()
    def discover(self, *, question: str, proposal_index: dict[str, Any] | None=None, memory_packet: Any | None=None, limit: int=8) -> Schedule2ExhaustiveDiscoveryResult:
        text="\n".join([question or "", str(proposal_index or ""), getattr(memory_packet,"recent_dialogue_text","") or ""]); terms, concepts=self._expand_terms(text); clauses=list(self.index_service.schedule2_clauses()); scores=defaultdict(float); refs=defaultdict(list); snippets=defaultdict(list); hit_terms=defaultdict(set); titles={}
        for clause in clauses:
            subclass=str(getattr(clause,"subclass","") or "").upper().strip()
            if not subclass: continue
            titles.setdefault(subclass, getattr(clause,"title",None) or ""); blob=" ".join([str(getattr(clause,"title","") or ""), str(getattr(clause,"heading","") or ""), str(getattr(clause,"text","") or "")[:2500]]).lower(); local_score=0.0
            for term in terms:
                if term and term in blob: local_score+=1.0; hit_terms[subclass].add(term)
            for concept in concepts:
                if self._concept_match(concept, blob): local_score+=3.0; hit_terms[subclass].add(concept)
            if local_score<=0: continue
            if str(getattr(clause,"section_kind","") or "") in {"primary_criteria","time_of_application","time_of_decision","circumstances_applicable_to_grant"}: local_score+=1.5
            scores[subclass]+=local_score; ref=str(getattr(clause,"clause_ref","") or "")
            if ref and ref not in refs[subclass]: refs[subclass].append(ref)
            if len(snippets[subclass])<3: snippets[subclass].append(" ".join(str(getattr(clause,"text","") or "").split())[:500])
        candidates=[]
        for subclass, score in scores.items():
            if score<2.5: continue
            fit="likely" if score>=12 else "possible" if score>=5 else "weak"; hits=sorted(hit_terms[subclass])
            candidates.append(Schedule2DiscoveredCandidate(subclass=subclass,title=titles.get(subclass) or None,score=round(score,2),fit_status=fit,matched_clauses=refs[subclass][:10],matched_terms=hits[:12],matched_concepts=[c for c in concepts if c in hit_terms[subclass]][:8],evidence_snippets=snippets[subclass],reasons_for=[f"Schedule 2 matched: {', '.join(hits[:6])}"],missing_decisive_facts=self._missing_facts_for(text)))
        candidates.sort(key=lambda c:c.score, reverse=True)
        return Schedule2ExhaustiveDiscoveryResult(total_clauses_scanned=len(clauses), total_subclasses_scanned=len({str(getattr(c,"subclass","") or "") for c in clauses if getattr(c,"subclass",None)}), query_terms=terms, legal_concepts=concepts, candidates=candidates[:limit])
    def _expand_terms(self,text:str)->tuple[list[str],list[str]]:
        low=(text or "").lower(); base=[t for t in re.findall(r"[a-z][a-z0-9-]{2,}",low) if t not in {"the","and","visa","work","worker","australia","australian","what","which","that","this","with","for"}]; terms=list(dict.fromkeys(base[:35])); concepts=[]
        def add(*items):
            for item in items:
                if item not in concepts: concepts.append(item)
        if "short" in low or "temporary" in low: add("short stay","short term","temporary","non-ongoing","non ongoing")
        if "special" in low or "specialist" in low or "specialised" in low or "specialized" in low: add("specialist","highly specialised","highly specialized","not generally available")
        if "employer" in low or "sponsor" in low or "nomination" in low: add("sponsor","nomination","approved sponsor","employer")
        if "business" in low or "visitor" in low: add("business visitor","visitor")
        if "activity" in low: add("temporary activity","activity")
        return terms, concepts
    def _concept_match(self, concept:str, blob:str)->bool:
        if concept in blob: return True
        if concept=="not generally available": return "not generally available" in blob or "available in australia" in blob or "labour market" in blob
        if concept=="non-ongoing": return "non-ongoing" in blob or "non ongoing" in blob or "not ongoing" in blob
        return False
    def _missing_facts_for(self,text:str)->list[str]:
        low=text.lower(); out=[]
        if not re.search(r"\b(month|week|day|year|duration|long)\b",low): out.append("exact duration of the intended work/activity")
        if "sponsor" not in low and "nomination" not in low: out.append("whether the Australian business is willing to sponsor/nominate/support")
        if "paid" not in low and "productive" not in low: out.append("whether the person will perform productive paid work in Australia")
        return out[:3]
