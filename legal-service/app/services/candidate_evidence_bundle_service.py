
from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field
from app.schedule.schedule2_index_service import ScheduleIndexService
OFFICIAL_CANDIDATE_URLS={"400":"https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-work-400","408":"https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-activity-408","403":"https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-work-international-relations-403","407":"https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/training-407","482":"https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skills-in-demand-visa-subclass-482","600":"https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600","417":"https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417","462":"https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-462","485":"https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485","500":"https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500"}
class CandidateEvidenceBundle(BaseModel):
    subclass:str; title:str|None=None; schedule2_clauses:list[dict[str,Any]]=Field(default_factory=list); schedule1_clauses:list[dict[str,Any]]=Field(default_factory=list); official_guidance_urls:list[str]=Field(default_factory=list); discovery_score:float=0.0; matched_terms:list[str]=Field(default_factory=list); missing_decisive_facts:list[str]=Field(default_factory=list)
class CandidateEvidenceBundleService:
    def __init__(self,*,index_service:ScheduleIndexService|None=None)->None: self.index_service=index_service or ScheduleIndexService()
    def build(self,*,candidates:list[Any],limit_per_candidate:int=8)->dict[str,CandidateEvidenceBundle]:
        bundles={}
        for c in candidates:
            subclass=str((getattr(c,"subclass",None) if not isinstance(c,dict) else c.get("subclass")) or "").upper()
            if not subclass: continue
            s2=self.index_service.clauses_for_subclass(subclass,schedule_no="2")[:limit_per_candidate]; s1=self.index_service.clauses_for_subclass(subclass,schedule_no="1")[:limit_per_candidate]
            bundles[subclass]=CandidateEvidenceBundle(subclass=subclass,title=getattr(c,"title",None) if not isinstance(c,dict) else c.get("title"),schedule2_clauses=[self._clause_dict(x) for x in s2],schedule1_clauses=[self._clause_dict(x) for x in s1],official_guidance_urls=[OFFICIAL_CANDIDATE_URLS[subclass]] if subclass in OFFICIAL_CANDIDATE_URLS else [],discovery_score=float(getattr(c,"score",0.0) if not isinstance(c,dict) else c.get("score",0.0) or 0.0),matched_terms=list(getattr(c,"matched_terms",[]) if not isinstance(c,dict) else c.get("matched_terms",[]) or []),missing_decisive_facts=list(getattr(c,"missing_decisive_facts",[]) if not isinstance(c,dict) else c.get("missing_decisive_facts",[]) or []))
        return bundles
    def _clause_dict(self,clause:Any)->dict[str,Any]:
        return {"schedule_no":getattr(clause,"schedule_no",None),"subclass":getattr(clause,"subclass",None),"title":getattr(clause,"title",None),"clause_ref":getattr(clause,"clause_ref",None),"heading":getattr(clause,"heading",None),"section_kind":getattr(clause,"section_kind",None),"text":" ".join(str(getattr(clause,"text","") or "").split())[:900],"source_title":getattr(clause,"source_title",None)}
