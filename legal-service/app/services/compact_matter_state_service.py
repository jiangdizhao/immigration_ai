"""Compact matter state service — dual-read/dual-write, ordinal resolution.

Provides deterministic state maintenance for CompactMatterStateV2 without
any new LLM/model/tool calls.  Handles:

- Loading / initializing compact state from Matter.metadata_json
- Dual-write: updating compact state alongside legacy state
- Ordinal / anaphoric reference resolution
- Topic switch detection
- Bounded pruning of recent turns, research ledger, option sets
- Fact provenance enforcement
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.schemas.compact_matter_state import (
    MAX_CONFIRMED_FACTS,
    MAX_OPTION_SETS,
    MAX_RECENT_TURNS,
    CompactMatterStateV2,
    StatePatch,
)
from app.services.state_patch_validator import StatePatchValidator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Ordinal patterns — general syntactic, not immigration-specific
# ---------------------------------------------------------------------------

# English ordinals: "the first", "the second", "the third", "option 1", etc.
_ENGLISH_ORDINAL_WORDS: dict[str, int] = {
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
    "seventh": 7,
    "eighth": 8,
    "ninth": 9,
    "tenth": 10,
}

# Chinese ordinals: 第一, 第二, 第三, etc.
_CHINESE_ORDINAL_PATTERN = re.compile(r"第\s*([一二三四五六七八九十\d]+)\s*[个项种条]?")

# Chinese digit mapping
_CHINESE_DIGITS: dict[str, int] = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
}

# Anaphoric references
_ANAPHORIC_PATTERNS = [
    re.compile(r"\bthat\s+one\b", re.I),
    re.compile(r"\bthat\s+option\b", re.I),
    re.compile(r"\bthis\s+one\b", re.I),
    re.compile(r"\bthis\s+option\b", re.I),
    re.compile(r"\bthe\s+same\s+(?:one|option)\b", re.I),
    re.compile(r"\bprevious\s+(?:one|option)\b", re.I),
]


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class CompactMatterStateService:
    """Deterministic compact-state maintenance service.

    No LLM calls, no tool calls, no provider calls.
    """

    def __init__(self) -> None:
        self._patch_validator = StatePatchValidator()

    # ------------------------------------------------------------------
    # Load / initialize
    # ------------------------------------------------------------------

    def load_or_create(
        self,
        *,
        metadata_json: dict[str, Any] | None,
        matter_id: str,
        session_id: str | None = None,
        frontend_chat_id: str | None = None,
    ) -> CompactMatterStateV2 | None:
        """Load existing CompactMatterStateV2 from metadata, or return None.

        Returns None when:
        - metadata_json is None/empty
        - compact_state_v2 key is absent
        - stored state fails validation (logged, not raised)
        """
        metadata = metadata_json or {}
        raw = metadata.get("compact_state_v2")
        if raw is None:
            return None

        if isinstance(raw, CompactMatterStateV2):
            return raw

        if isinstance(raw, dict):
            try:
                return CompactMatterStateV2(**raw)
            except Exception as exc:
                logger.warning(
                    "Failed to parse existing compact_state_v2 for matter %s: %s",
                    matter_id,
                    exc,
                )
                return None

        return None

    def initialize_state(
        self,
        *,
        matter_id: str,
        session_id: str | None = None,
        frontend_chat_id: str | None = None,
    ) -> CompactMatterStateV2:
        """Create a fresh initial CompactMatterStateV2."""
        return CompactMatterStateV2.create_initial(
            matter_id=matter_id,
            session_id=session_id,
            frontend_chat_id=frontend_chat_id,
        )

    # ------------------------------------------------------------------
    # Dual-write: update compact state from legacy state + turn info
    # ------------------------------------------------------------------

    def update_after_turn(
        self,
        *,
        compact: CompactMatterStateV2,
        legacy_state: Any,  # MatterState
        turn_id: str,
        user_question: str,
        assistant_answer: str,
        issue_type: str | None = None,
        operation_type: str | None = None,
        visa_type: str | None = None,
        next_action: str | None = None,
        carried_facts: dict[str, Any] | None = None,
        pending_offer: dict[str, Any] | None = None,
        option_candidates: list[dict[str, Any]] | None = None,
    ) -> CompactMatterStateV2:
        """Update compact state after a completed turn.

        This is deterministic: no LLM calls, no tool calls.
        Only user-origin / structured information is used.
        """
        data = compact.model_dump()
        data["revision"] = compact.revision + 1

        # --- identity stays unchanged ---

        # --- active thread ---
        thread = data.setdefault("active_thread", {})
        if issue_type:
            thread["issue_type"] = issue_type
        if next_action == "answer":
            thread["status"] = "answered"
        elif next_action == "ask_followup":
            thread["status"] = "waiting_for_user"
        elif next_action == "suggest_consultation":
            thread["status"] = "escalated"

        # --- confirmed facts: only user-origin facts ---
        self._update_confirmed_facts_from_legacy(
            data, carried_facts, turn_id, legacy_state
        )

        # --- risk flags ---
        self._update_risk_flags_from_legacy(data, legacy_state, turn_id)

        # --- option sets ---
        if option_candidates:
            self._add_option_set_from_candidates(
                data, option_candidates, turn_id, thread.get("topic_id", "")
            )

        # --- pending action ---
        if pending_offer:
            data["pending_action"] = {
                "type": pending_offer.get("offer_type", "unknown"),
                "payload": dict(pending_offer),
                "created_turn_id": turn_id,
            }
        elif next_action == "answer":
            data["pending_action"] = None

        # --- recent turns ---
        self._append_recent_turn(
            data,
            turn_id=turn_id,
            role="user",
            summary=self._truncate(user_question, 200),
        )
        self._append_recent_turn(
            data,
            turn_id=turn_id,
            role="assistant",
            summary=self._truncate(assistant_answer, 200),
        )

        # --- rolling summary ---
        data["rolling_summary"] = self._build_rolling_summary(data, user_question)

        # --- ordinal resolution ---
        self._resolve_ordinals(data, user_question, turn_id)

        # Re-validate
        try:
            new_state = CompactMatterStateV2(**data)
        except Exception as exc:
            logger.error(
                "Compact state update produced invalid state: %s", exc
            )
            # Return the original unchanged
            return compact

        try:
            new_state.check_size()
        except ValueError:
            logger.warning(
                "Compact state size exceeded after turn; pruning and retrying"
            )
            # Prune and retry
            pruned = self._prune_for_size(data)
            try:
                new_state = CompactMatterStateV2(**pruned)
                new_state.check_size()
            except Exception as exc:
                logger.error(
                    "Compact state still invalid after pruning: %s", exc
                )
                return compact

        return new_state

    # ------------------------------------------------------------------
    # Ordinal / anaphoric reference resolution
    # ------------------------------------------------------------------

    def resolve_ordinal(
        self,
        user_text: str,
        compact: CompactMatterStateV2,
        turn_id: str,
    ) -> str | None:
        """Attempt to resolve an ordinal/anaphoric reference to a stable option_id.

        Returns the option_id if resolved, None if ambiguous or no reference.
        """
        ordinal = self._detect_ordinal(user_text)
        if ordinal is not None:
            return self._resolve_by_ordinal(ordinal, compact)

        if self._is_anaphoric(user_text):
            return self._resolve_anaphoric(compact)

        return None

    def _detect_ordinal(self, text: str) -> int | None:
        """Detect an ordinal number from English or Chinese text."""
        lowered = text.lower()

        # English word ordinals
        for word, num in _ENGLISH_ORDINAL_WORDS.items():
            if re.search(rf"\b{word}\b", lowered):
                return num

        # English numeric ordinals: "option 2", "#2", "number 2"
        m = re.search(r"(?:option|#|number|no\.?)\s*(\d+)", lowered)
        if m:
            return int(m.group(1))

        # Chinese ordinals
        m = _CHINESE_ORDINAL_PATTERN.search(text)
        if m:
            digit_str = m.group(1).strip()
            if digit_str.isdigit():
                return int(digit_str)
            if digit_str in _CHINESE_DIGITS:
                return _CHINESE_DIGITS[digit_str]

        return None

    def _is_anaphoric(self, text: str) -> bool:
        """Check if text contains an anaphoric reference."""
        return any(pat.search(text) for pat in _ANAPHORIC_PATTERNS)

    def _resolve_by_ordinal(
        self, ordinal: int, compact: CompactMatterStateV2
    ) -> str | None:
        """Resolve an ordinal to an option_id from the current topic's option set."""
        topic_id = compact.active_thread.topic_id

        # Find the option set for the current topic (most recent first)
        relevant_sets = [
            s for s in compact.option_sets if s.topic_id == topic_id
        ]
        if not relevant_sets:
            return None

        # Use the most recent option set for the current topic
        option_set = relevant_sets[-1]

        # Find option with matching ordinal
        for opt in option_set.options:
            if opt.ordinal == ordinal:
                return opt.option_id

        return None

    def _resolve_anaphoric(
        self, compact: CompactMatterStateV2
    ) -> str | None:
        """Resolve an anaphoric reference using the last unambiguous reference."""
        # Check unresolved_references for the most recent resolved one
        for ref in reversed(compact.unresolved_references):
            if ref.resolved_to is not None:
                return ref.resolved_to

        # Fall back to the last option in the current topic's option set
        topic_id = compact.active_thread.topic_id
        relevant_sets = [
            s for s in compact.option_sets if s.topic_id == topic_id
        ]
        if relevant_sets:
            last_set = relevant_sets[-1]
            if last_set.options:
                return last_set.options[-1].option_id

        return None

    def _resolve_ordinals(
        self,
        data: dict[str, Any],
        user_text: str,
        turn_id: str,
    ) -> None:
        """Detect and record ordinal/anaphoric references in the state dict."""
        ordinal = self._detect_ordinal(user_text)
        is_anaphoric = self._is_anaphoric(user_text)

        if ordinal is None and not is_anaphoric:
            return

        # Build a temporary CompactMatterStateV2 for resolution
        try:
            temp = CompactMatterStateV2(**data)
        except Exception:
            return

        resolved = self.resolve_ordinal(user_text, temp, turn_id)

        refs: list[dict[str, Any]] = data.setdefault(
            "unresolved_references", []
        )
        refs.append({
            "surface": self._truncate(user_text, 100),
            "turn_id": turn_id,
            "resolved_to": resolved,
        })

    # ------------------------------------------------------------------
    # Fact provenance helpers
    # ------------------------------------------------------------------

    def _update_confirmed_facts_from_legacy(
        self,
        data: dict[str, Any],
        carried_facts: dict[str, Any] | None,
        turn_id: str,
        legacy_state: Any,
    ) -> None:
        """Update confirmed_facts from legacy state, respecting provenance.

        Only facts with source='user_input' or explicitly user-confirmed
        are promoted.  LLM-inferred facts are NOT promoted.
        """
        facts: dict[str, Any] = data.setdefault("confirmed_facts", {})

        # Inspect legacy fact_slot_states for user-origin facts
        fact_slots = getattr(legacy_state, "fact_slot_states", []) or []
        for slot in fact_slots:
            if not hasattr(slot, "fact_key"):
                continue
            key = slot.fact_key
            source = getattr(slot, "source", None)
            status = getattr(slot, "status", "missing")
            value = getattr(slot, "value", None)

            # Only promote user_input facts
            if source != "user_input":
                continue

            if key in facts:
                continue  # already present

            if len(facts) >= MAX_CONFIRMED_FACTS:
                break

            fact_status = "confirmed"
            if status == "user_unsure":
                fact_status = "user_unsure"
            elif status == "conflicting":
                fact_status = "conflicting"

            facts[key] = {
                "value": value,
                "status": fact_status,
                "source_turn_id": turn_id,
                "updated_at": _utc_now_iso(),
            }

        # Also check carried_intake_facts for user-supplied facts
        carried = carried_facts or {}
        legacy_carried = dict(
            getattr(legacy_state, "carried_intake_facts", {}) or {}
        )
        # Merge: carried_facts passed in take precedence
        all_carried = {**legacy_carried, **carried}

        # Only promote facts that have a known user origin in fact_status
        fact_status_map = getattr(legacy_state, "fact_status", {}) or {}
        for key, value in all_carried.items():
            if key in facts:
                continue
            if key.startswith("_"):
                continue
            if value is None or value == "":
                continue

            status = fact_status_map.get(key, "")
            # Only promote if status indicates user origin
            if not isinstance(status, str):
                continue
            if not status.startswith("known"):
                continue

            if len(facts) >= MAX_CONFIRMED_FACTS:
                break

            facts[key] = {
                "value": value,
                "status": "confirmed",
                "source_turn_id": turn_id,
                "updated_at": _utc_now_iso(),
            }

    def _update_risk_flags_from_legacy(
        self,
        data: dict[str, Any],
        legacy_state: Any,
        turn_id: str,
    ) -> None:
        """Mirror legacy risk flags into compact state."""
        legacy_flags = getattr(legacy_state, "risk_flags", None)
        if legacy_flags is None:
            return

        flag_dict = {}
        if hasattr(legacy_flags, "model_dump"):
            flag_dict = legacy_flags.model_dump()
        elif isinstance(legacy_flags, dict):
            flag_dict = legacy_flags

        flags: list[dict[str, Any]] = data.setdefault("risk_flags", [])
        for code, active in flag_dict.items():
            if active:
                # Avoid duplicates
                if not any(f.get("code") == code and f.get("active") for f in flags):
                    flags.append({
                        "code": code,
                        "source_turn_id": turn_id,
                        "active": True,
                    })

    # ------------------------------------------------------------------
    # Option set helpers
    # ------------------------------------------------------------------

    def _add_option_set_from_candidates(
        self,
        data: dict[str, Any],
        candidates: list[dict[str, Any]],
        turn_id: str,
        topic_id: str,
    ) -> None:
        """Add an option set derived from structured candidate information."""
        option_sets: list[dict[str, Any]] = data.setdefault("option_sets", [])
        if len(option_sets) >= MAX_OPTION_SETS:
            # Prune oldest
            option_sets.pop(0)

        set_id = f"optset-{uuid4().hex[:12]}"
        options = []
        duplicate_counts: dict[str, int] = {}
        for i, cand in enumerate(candidates[:20], start=1):
            base_option_id = self._stable_option_id(cand)
            duplicate_counts[base_option_id] = duplicate_counts.get(base_option_id, 0) + 1
            duplicate_number = duplicate_counts[base_option_id]
            opt_id = (
                base_option_id
                if duplicate_number == 1
                else f"{base_option_id}#{duplicate_number}"
            )
            label = cand.get("label") or cand.get("visa_type") or str(cand.get("operation_type", ""))
            options.append({
                "option_id": str(opt_id),
                "ordinal": i,
                "label": str(label),
                "status": "possible",
            })

        option_sets.append({
            "set_id": set_id,
            "topic_id": topic_id,
            "created_turn_id": turn_id,
            "options": options,
        })

    @staticmethod
    def _stable_option_id(candidate: dict[str, Any]) -> str:
        """Return a stable ID from the candidate's canonical structured identity.

        CaseCandidate currently supplies ``operation_type`` but not an option
        ID or visa type.  Scores and explanatory prose deliberately do not
        participate, so reranking or rewritten explanations cannot change a
        recurring option's identity.
        """
        explicit_option_id = str(candidate.get("option_id") or "").strip()
        if explicit_option_id:
            return explicit_option_id

        canonical_visa = str(candidate.get("visa_type") or "").strip()
        if canonical_visa:
            return canonical_visa

        operation_type = CompactMatterStateService._normalise_identifier(
            candidate.get("operation_type")
        )
        if operation_type:
            return f"operation:{operation_type}"

        # Generic structured candidates may expose a composite canonical
        # identity instead.  Keep this fallback restricted to stable identity
        # fields; do not include rank, score, prose, or missing-fact wording.
        identity = {
            field: value
            for field in (
                "subclass",
                "subclass_id",
                "stream",
                "pathway",
                "category",
                "code",
            )
            if (value := CompactMatterStateService._normalise_identifier(candidate.get(field)))
        }
        canonical_identity = json.dumps(
            identity or {"candidate": "unidentified"},
            separators=(",", ":"),
            sort_keys=True,
        )
        digest = hashlib.sha256(canonical_identity.encode("utf-8")).hexdigest()[:16]
        return f"candidate:{digest}"

    @staticmethod
    def _normalise_identifier(value: Any) -> str:
        """Normalize an existing structured identifier without parsing prose."""
        normalized = re.sub(r"[^a-z0-9]+", "-", str(value or "").casefold())
        return normalized.strip("-")

    # ------------------------------------------------------------------
    # Recent turns
    # ------------------------------------------------------------------

    def _append_recent_turn(
        self,
        data: dict[str, Any],
        *,
        turn_id: str,
        role: str,
        summary: str,
    ) -> None:
        turns: list[dict[str, Any]] = data.setdefault("recent_turns", [])
        if len(turns) >= MAX_RECENT_TURNS:
            turns.pop(0)
        turns.append({
            "turn_id": turn_id,
            "role": role,
            "summary": summary,
            "option_ids": [],
        })

    # ------------------------------------------------------------------
    # Rolling summary
    # ------------------------------------------------------------------

    def _build_rolling_summary(
        self, data: dict[str, Any], latest_question: str
    ) -> str:
        """Build a bounded neutral rolling summary from structured data only."""
        parts: list[str] = []

        thread = data.get("active_thread", {})
        goal = thread.get("user_goal", "")
        if goal:
            parts.append(f"Goal: {self._truncate(goal, 100)}")

        issue = thread.get("issue_type", "")
        if issue:
            parts.append(f"Issue: {issue}")

        facts = data.get("confirmed_facts", {})
        if facts:
            fact_strs = []
            for key, f in list(facts.items())[:5]:
                val = f.get("value", "")
                fact_strs.append(f"{key}={val}")
            parts.append(f"Facts: {'; '.join(fact_strs)}")

        parts.append(f"Latest: {self._truncate(latest_question, 150)}")

        return " | ".join(parts)

    # ------------------------------------------------------------------
    # Pruning
    # ------------------------------------------------------------------

    def _prune_for_size(self, data: dict[str, Any]) -> dict[str, Any]:
        """Aggressively prune to fit within size bounds."""
        pruned = deepcopy(data)

        # Trim recent turns to 4
        turns = pruned.get("recent_turns", [])
        if len(turns) > 4:
            pruned["recent_turns"] = turns[-4:]

        # Trim research ledger to 10
        ledger = pruned.get("research_ledger", [])
        if len(ledger) > 10:
            pruned["research_ledger"] = ledger[-10:]

        # Trim rolling summary
        summary = pruned.get("rolling_summary", "")
        if len(summary) > 500:
            pruned["rolling_summary"] = summary[:497] + "..."

        # Trim unresolved references to 10
        refs = pruned.get("unresolved_references", [])
        if len(refs) > 10:
            pruned["unresolved_references"] = refs[-10:]

        return pruned

    # ------------------------------------------------------------------
    # Topic switch detection
    # ------------------------------------------------------------------

    def detect_topic_switch(
        self,
        compact: CompactMatterStateV2,
        new_issue_type: str | None,
        new_operation_type: str | None,
    ) -> bool:
        """Detect if the current turn represents a genuine topic switch.

        Uses existing structured information only — no LLM call.
        """
        current_issue = compact.active_thread.issue_type
        if new_issue_type and current_issue and new_issue_type != current_issue:
            # Different issue type suggests a topic switch
            return True

        return False

    def switch_topic(
        self,
        compact: CompactMatterStateV2,
        new_topic_id: str | None = None,
        new_issue_type: str | None = None,
        new_user_goal: str = "",
    ) -> CompactMatterStateV2:
        """Create a new state with a switched active thread.

        Old option sets remain but are associated with the old topic_id,
        so ordinals cannot accidentally bind across topics.
        """
        data = compact.model_dump()
        data["revision"] = compact.revision + 1
        data["active_thread"] = {
            "topic_id": new_topic_id or f"topic-{uuid4().hex[:12]}",
            "user_goal": new_user_goal,
            "issue_type": new_issue_type,
            "status": "open",
        }
        # Clear pending action on topic switch
        data["pending_action"] = None
        return CompactMatterStateV2(**data)

    # ------------------------------------------------------------------
    # Patch application
    # ------------------------------------------------------------------

    def apply_patch(
        self, patch: StatePatch, compact: CompactMatterStateV2
    ) -> CompactMatterStateV2:
        """Apply an allowlisted state patch."""
        return self._patch_validator.apply(patch, compact)

    # ------------------------------------------------------------------
    # Serialization for storage
    # ------------------------------------------------------------------

    def to_metadata_value(
        self, compact: CompactMatterStateV2
    ) -> dict[str, Any]:
        """Serialize compact state for storage in metadata_json."""
        return compact.model_dump()

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    @staticmethod
    def _truncate(text: str, max_len: int) -> str:
        if len(text) <= max_len:
            return text
        return text[: max_len - 3] + "..."


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
