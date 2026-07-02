
from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field
class VerifiedCandidate(BaseModel):
    subclass:str; title:str|None=None; status:str; fit:str; evidence_strength:str; reasons_for:list[str]=Field(default_factory=list); reasons_against:list[str]=Field(default_factory=list); missing_decisive_facts:list[str]=Field(default_factory=list); evidence_refs:list[str]=Field(default_factory=list); official_guidance_urls:list[str]=Field(default_factory=list)
class GoldStandardVerificationResult(BaseModel):
    verified_candidates:list[VerifiedCandidate]=Field(default_factory=list); ranking_reason:str|None=None; final_answer_allowed:bool=True
class GoldStandardCandidateVerifierService:
    def verify(self,*,bundles:dict[str,Any],question:str,memory_packet:Any|None=None)->GoldStandardVerificationResult:
        q=(question or "").lower(); verified=[]
        for subclass,bundle in bundles.items():
            score=float(bundle.discovery_score or 0.0); reasons_for=list(bundle.matched_terms or [])[:6]; reasons_against=[]; fit="possible"; status="supported" if bundle.schedule2_clauses else "not_found_in_schedule2_bundle"
            if subclass=="400":
                if any(x in q for x in ["short","special","specialist","special skills"]): score+=10; reasons_for.append("short-term/specialist-work fact pattern")
                fit="likely" if score>=12 else "possible"
            elif subclass=="482":
                if "employer" in q: score+=4; reasons_for.append("Australian employer wants worker")
                if "short" in q: reasons_against.append("may be less aligned if the work is genuinely short-term and non-ongoing")
                if "sponsor" not in q and "nomination" not in q: reasons_against.append("requires sponsorship/nomination if pursued as a sponsored skilled-work pathway")
                fit="possible" if score>=5 else "weak"
            elif subclass=="600": reasons_against.append("visitor/business visitor pathways are weak if the person will perform productive work"); fit="weak"
            elif subclass in {"408","403","407","417","462"}: fit="possible" if score>=5 else "weak"; reasons_against.append("depends on fitting a specific stream, activity, passport, age, or program context")
            strength="high" if bundle.schedule2_clauses and score>=12 else "medium" if bundle.schedule2_clauses else "low"
            verified.append(VerifiedCandidate(subclass=subclass,title=bundle.title,status=status,fit=fit,evidence_strength=strength,reasons_for=sorted(set([r for r in reasons_for if r]))[:8],reasons_against=reasons_against[:6],missing_decisive_facts=bundle.missing_decisive_facts[:4],evidence_refs=[c.get("clause_ref") for c in bundle.schedule2_clauses[:6] if c.get("clause_ref")],official_guidance_urls=bundle.official_guidance_urls))
        rank_order={"likely":0,"possible":1,"weak":2,"excluded":3}; verified.sort(key=lambda c:(rank_order.get(c.fit,9),0 if c.subclass=="400" else 1,c.subclass))
        return GoldStandardVerificationResult(verified_candidates=verified,ranking_reason="ranked by Schedule 2 evidence, fact overlap, and pathway limitations")
