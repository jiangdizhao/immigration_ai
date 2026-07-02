
from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Any
@dataclass(slots=True)
class LLMContextBundle:
    stage_name: str; context_text: str; sent_full_history: bool; sent_turn_count: int; full_history_turn_count: int; used_running_summary: bool; estimated_context_tokens: int; reason: str | None = None
    def to_debug(self) -> dict[str, Any]:
        return {"stage_name": self.stage_name, "sent_full_history": self.sent_full_history, "sent_turn_count": self.sent_turn_count, "full_history_turn_count": self.full_history_turn_count, "used_running_summary": self.used_running_summary, "estimated_context_tokens": self.estimated_context_tokens, "reason": self.reason}
class ContextBudgetService:
    def __init__(self, *, max_context_tokens: int | None = None) -> None:
        self.max_context_tokens = max_context_tokens or int(os.getenv("UNIFIED_CONTEXT_MAX_TOKENS", "60000")); self.reserve_tokens = int(os.getenv("UNIFIED_CONTEXT_RESERVED_OUTPUT_TOKENS", "8000"))
    def estimate_tokens(self, text: str) -> int: return max(1, len(text or "") // 4)
    def build_llm_context(self, *, memory_packet: Any, stage_name: str) -> LLMContextBundle:
        full_history = list(getattr(memory_packet, "full_conversation_history", []) or []); full_text = str(getattr(memory_packet, "full_dialogue_text", "") or ""); estimated = self.estimate_tokens(full_text); allowed = max(4000, self.max_context_tokens - self.reserve_tokens)
        if estimated <= allowed: return LLMContextBundle(stage_name, full_text, True, len(full_history), len(full_history), False, estimated)
        prefix_parts: list[str] = []
        if getattr(memory_packet, "running_case_summary", None): prefix_parts.append("Running case summary:\n" + str(memory_packet.running_case_summary))
        stable_facts = getattr(memory_packet, "stable_facts", None) or {}
        if stable_facts: prefix_parts.append("Stable facts:\n" + repr(stable_facts))
        active_focus = getattr(memory_packet, "active_focus", None) or {}
        if active_focus: prefix_parts.append("Active focus:\n" + repr(active_focus))
        commitments = getattr(memory_packet, "previous_assistant_commitments", None) or []
        if commitments: prefix_parts.append("Previous assistant commitments:\n" + "\n".join(map(str, commitments[-8:])))
        unresolved = getattr(memory_packet, "unresolved_references", None) or []
        if unresolved: prefix_parts.append("Potential unresolved references: " + ", ".join(unresolved))
        prefix = "\n\n".join(prefix_parts).strip(); budget_chars = max(8000, (allowed - self.estimate_tokens(prefix)) * 4); recent_chunks: list[str] = []; sent_turns = 0; used_chars = 0
        for item in reversed(full_history):
            role = item.get("role") if isinstance(item, dict) else getattr(item, "role", ""); content = item.get("content") if isinstance(item, dict) else getattr(item, "content", ""); turn_text = f"{role}: {content}".strip()
            if recent_chunks and used_chars + len(turn_text) > budget_chars: break
            recent_chunks.append(turn_text); used_chars += len(turn_text) + 2; sent_turns += 1
        recent_chunks.reverse(); context_text = "\n\n".join(part for part in [prefix, "Recent dialogue:\n" + "\n".join(recent_chunks)] if part)
        return LLMContextBundle(stage_name, context_text, False, sent_turns, len(full_history), bool(prefix), self.estimate_tokens(context_text), "model_context_window_limit")
