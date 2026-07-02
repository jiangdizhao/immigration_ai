
from __future__ import annotations
import re
from typing import Any
from pydantic import BaseModel, Field
from app.services.context_budget_service import ContextBudgetService, LLMContextBundle
class ConversationMemoryPacket(BaseModel):
    matter_id: str | None = None; session_id: str | None = None; latest_user_message_raw: str; latest_user_message_internal_en: str; full_conversation_history: list[dict[str, Any]] = Field(default_factory=list); frontend_messages: list[dict[str, Any]] = Field(default_factory=list); full_dialogue_text: str = ""; recent_dialogue_text: str = ""; running_case_summary: str | None = None; carried_intake_facts: dict[str, Any] = Field(default_factory=dict); stable_facts: dict[str, Any] = Field(default_factory=dict); fact_ledger: list[dict[str, Any]] = Field(default_factory=list); active_focus: dict[str, Any] = Field(default_factory=dict); candidate_visa_entities: list[dict[str, Any]] = Field(default_factory=list); pending_offer: dict[str, Any] | None = None; previous_assistant_commitments: list[str] = Field(default_factory=list); unresolved_references: list[str] = Field(default_factory=list); context_packaging_debug: dict[str, Any] = Field(default_factory=dict)
class ConversationMemoryService:
    def __init__(self) -> None: self.budget = ContextBudgetService()
    def build(self, *, matter: Any, current_state: Any, latest_user_message_raw: str, latest_user_message_internal_en: str, frontend_messages: list[dict[str, Any]] | None = None) -> ConversationMemoryPacket:
        backend_history = [turn.model_dump() if hasattr(turn, "model_dump") else dict(turn) for turn in (getattr(current_state, "conversation_history", []) or [])]; frontend_history = [m for m in (frontend_messages or []) if isinstance(m, dict) and str(m.get("text") or "").strip()]; use_frontend_repair = len(frontend_history) > len(backend_history) and not backend_history; full_history = frontend_history if use_frontend_repair else backend_history; carried = dict(getattr(current_state, "carried_intake_facts", {}) or {})
        packet = ConversationMemoryPacket(matter_id=str(getattr(matter, "id", None)) if getattr(matter, "id", None) else None, session_id=str(getattr(matter, "session_id", None)) if getattr(matter, "session_id", None) else None, latest_user_message_raw=latest_user_message_raw, latest_user_message_internal_en=latest_user_message_internal_en, full_conversation_history=full_history, frontend_messages=frontend_history, full_dialogue_text=self._dialogue_text(full_history, include_current=(latest_user_message_raw, latest_user_message_internal_en)), recent_dialogue_text=self._dialogue_text(full_history[-24:], include_current=(latest_user_message_raw, latest_user_message_internal_en)), running_case_summary=str(carried.get("running_case_summary") or "") or None, carried_intake_facts=carried, stable_facts={k: v for k, v in carried.items() if not str(k).startswith("_")}, fact_ledger=list(carried.get("fact_ledger") or []), active_focus={"issue_type": getattr(current_state, "issue_type", None), "operation_type": getattr(current_state, "operation_type", None), "visa_type": getattr(current_state, "visa_type", None), "conversation_state": getattr(current_state, "conversation_state", None)}, candidate_visa_entities=list(carried.get("candidate_visa_entities") or []), pending_offer=carried.get("pending_offer") if isinstance(carried.get("pending_offer"), dict) else None, previous_assistant_commitments=self._assistant_commitments(full_history), unresolved_references=self._unresolved_references(latest_user_message_raw))
        bundle = self.context_for_stage(packet, "conversation_memory_default"); packet.context_packaging_debug = bundle.to_debug() | {"backend_history_turn_count": len(backend_history), "frontend_message_count": len(frontend_history), "history_repair_used": use_frontend_repair}; return packet
    def context_for_stage(self, packet: ConversationMemoryPacket, stage_name: str) -> LLMContextBundle: return self.budget.build_llm_context(memory_packet=packet, stage_name=stage_name)
    def _dialogue_text(self, history: list[dict[str, Any]], *, include_current: tuple[str, str] | None = None) -> str:
        lines=[]
        for item in history:
            role=str(item.get("role") or "user"); text=str(item.get("content") or item.get("text") or "").strip()
            if text: lines.append(f"{role}: {text}")
        if include_current:
            raw, internal = include_current; latest = internal or raw
            if latest and (not lines or not lines[-1].endswith(latest)): lines.append(f"user: {latest}")
        return "\n".join(lines)
    def _assistant_commitments(self, history: list[dict[str, Any]]) -> list[str]:
        out=[]
        for item in history:
            if str(item.get("role")) != "assistant": continue
            for line in str(item.get("content") or "").splitlines():
                if any(x in line.lower() for x in ["i can", "next question", "one question", "help you"]): out.append(line.strip()[:300])
        return out[-12:]
    def _unresolved_references(self, text: str) -> list[str]:
        low=(text or "").lower(); refs=[]
        for word in ["that", "this", "it", "he", "she", "they", "that one", "this option", "previous"]:
            if re.search(rf"\b{re.escape(word)}\b", low): refs.append(word)
        return sorted(set(refs))
