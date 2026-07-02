
from __future__ import annotations
import re
from typing import Literal
from pydantic import BaseModel
class ReasoningDepthDecision(BaseModel):
    tier: Literal["fast_admin", "fast_faq", "targeted_rag", "exhaustive_discovery", "high_risk_handoff"]; requires_full_context: bool = True; requires_rag: bool = False; requires_exhaustive_schedule2: bool = False; requires_live_official_check: bool = False; requires_candidate_comparison: bool = False; reason: str
class ReasoningDepthRouter:
    def classify(self, *, memory_packet: object, current_state: object | None = None) -> ReasoningDepthDecision:
        q=(getattr(memory_packet,"latest_user_message_internal_en",None) or getattr(memory_packet,"latest_user_message_raw","") or "").lower(); context=(getattr(memory_packet,"recent_dialogue_text","") or "").lower(); blob=q+"\n"+context[-3000:]
        if re.search(r"\b(refus|review|appeal|tribunal|deadline|cancel|noicc|unlawful|expired|detention|4020|character)\b", blob): return ReasoningDepthDecision(tier="high_risk_handoff", requires_rag=True, requires_live_official_check=True, reason="risk_or_status_sensitive_context")
        if re.search(r"\b(what visa|which visa|visa option|possible visa|other visa|all possible|schedule 2|subclass(?:es)?|what pathway|suggest)", q) or re.search(r"short[- ]term|special skills|specialist work|cannot find.*local|locally", q): return ReasoningDepthDecision(tier="exhaustive_discovery", requires_rag=True, requires_exhaustive_schedule2=True, requires_live_official_check=True, requires_candidate_comparison=True, reason="broad_visa_discovery_or_schedule2_request")
        if re.search(r"\b(book|appointment|consultation|contact|office hour|speak to lawyer|call me)\b", q): return ReasoningDepthDecision(tier="fast_admin", reason="admin_or_booking")
        if re.search(r"\b(what is|what does|explain|meaning of|define)\b", q) and len(q)<220: return ReasoningDepthDecision(tier="fast_faq", reason="short_definition_or_faq")
        return ReasoningDepthDecision(tier="targeted_rag", requires_rag=True, reason="default_targeted_rag")
