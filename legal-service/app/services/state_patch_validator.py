"""Deterministic state-patch validator for CompactMatterStateV2.

Enforces the allowlisted mutation families, revision checks, and
cardinality/size limits defined in the v2.1.1 specification.
"""

from __future__ import annotations

from typing import Any

from app.schemas.compact_matter_state import (
    MAX_CONFIRMED_FACTS,
    MAX_OPTION_SETS,
    MAX_RESEARCH_LEDGER_ENTRIES,
    MAX_RECENT_TURNS,
    CompactMatterStateV2,
    StatePatch,
    StatePatchOperation,
)

# ---------------------------------------------------------------------------
# Allowlisted operation names (specification §15)
# ---------------------------------------------------------------------------

ALLOWED_OPS: set[str] = {
    "set_fact",
    "confirm_fact",
    "mark_fact_conflicting",
    "set_active_thread",
    "set_pending_action",
    "clear_pending_action",
    "add_option_set",
    "append_research_ledger",
    "append_recent_turn",
    "set_rolling_summary",
    "add_risk_flag",
    "clear_risk_flag",
    "add_unresolved_reference",
}

# Operations that must never touch identity
IDENTITY_MUTATING_OPS: set[str] = set()

# Paths that are immutable
IMMUTABLE_PATHS: set[str] = {
    "identity",
    "identity.matter_id",
    "identity.session_id",
    "identity.frontend_chat_id",
    "schema_version",
}


class PatchValidationError(ValueError):
    """Raised when a state patch fails validation."""

    def __init__(self, message: str, *, code: str = "INVALID_PATCH") -> None:
        super().__init__(message)
        self.code = code


class PatchRejectedError(PatchValidationError):
    """Patch was rejected (stale revision, unknown op, etc.)."""

    pass


class PatchApplyError(PatchValidationError):
    """Patch was valid but could not be applied safely."""

    pass


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------


class StatePatchValidator:
    """Validates and applies allowlisted patches to CompactMatterStateV2."""

    def validate(self, patch: StatePatch, current: CompactMatterStateV2) -> None:
        """Validate a patch against the current state without applying it.

        Raises PatchValidationError on any violation.
        """
        # Revision check
        if patch.expected_revision != current.revision:
            raise PatchRejectedError(
                f"Expected revision {patch.expected_revision} but current "
                f"revision is {current.revision}",
                code="STALE_REVISION",
            )

        for i, op in enumerate(patch.operations):
            self._validate_operation(op, idx=i)

    def apply(
        self, patch: StatePatch, current: CompactMatterStateV2
    ) -> CompactMatterStateV2:
        """Validate and apply a patch, returning the new state.

        The original *current* is not mutated; a deep copy is modified.
        Raises PatchValidationError on any violation.
        """
        self.validate(patch, current)

        # Work on a dict copy to allow path-based updates
        data = current.model_dump()
        data["revision"] = current.revision + 1

        for op in patch.operations:
            self._apply_operation(op, data)

        # Re-validate the result through the schema
        try:
            new_state = CompactMatterStateV2(**data)
        except Exception as exc:
            raise PatchApplyError(
                f"Patch produced invalid state: {exc}",
                code="INVALID_RESULT_STATE",
            ) from exc

        # Size check
        try:
            new_state.check_size()
        except ValueError as exc:
            raise PatchApplyError(
                str(exc), code="SIZE_EXCEEDED"
            ) from exc

        return new_state

    # ------------------------------------------------------------------
    # Operation validation
    # ------------------------------------------------------------------

    def _validate_operation(self, op: StatePatchOperation, *, idx: int) -> None:
        if op.op not in ALLOWED_OPS:
            raise PatchRejectedError(
                f"Operation {idx}: unknown op '{op.op}'",
                code="UNKNOWN_OPERATION",
            )

        # Identity / immutable path guard
        if op.path in IMMUTABLE_PATHS or op.path.startswith("identity."):
            raise PatchRejectedError(
                f"Operation {idx}: cannot mutate immutable path '{op.path}'",
                code="IMMUTABLE_PATH",
            )

        # Hidden reasoning / arbitrary key guard
        if op.path.startswith("_") or "chain_of_thought" in op.path.lower():
            raise PatchRejectedError(
                f"Operation {idx}: path '{op.path}' is not allowed "
                f"(no hidden reasoning fields)",
                code="FORBIDDEN_PATH",
            )

        # Top-level key must be a known field
        top_key = op.path.split(".")[0]
        known_fields = set(CompactMatterStateV2.model_fields.keys())
        if top_key not in known_fields:
            raise PatchRejectedError(
                f"Operation {idx}: unknown top-level field '{top_key}'",
                code="UNKNOWN_FIELD",
            )

    # ------------------------------------------------------------------
    # Operation application
    # ------------------------------------------------------------------

    def _apply_operation(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        """Apply a single validated operation to the state dict."""
        if op.op == "set_fact":
            self._apply_set_fact(op, data)
        elif op.op == "confirm_fact":
            self._apply_confirm_fact(op, data)
        elif op.op == "mark_fact_conflicting":
            self._apply_mark_fact_conflicting(op, data)
        elif op.op == "set_active_thread":
            self._apply_set_active_thread(op, data)
        elif op.op == "set_pending_action":
            self._apply_set_pending_action(op, data)
        elif op.op == "clear_pending_action":
            data["pending_action"] = None
        elif op.op == "add_option_set":
            self._apply_add_option_set(op, data)
        elif op.op == "append_research_ledger":
            self._apply_append_research_ledger(op, data)
        elif op.op == "append_recent_turn":
            self._apply_append_recent_turn(op, data)
        elif op.op == "set_rolling_summary":
            data["rolling_summary"] = str(op.value or "")
        elif op.op == "add_risk_flag":
            self._apply_add_risk_flag(op, data)
        elif op.op == "clear_risk_flag":
            self._apply_clear_risk_flag(op, data)
        elif op.op == "add_unresolved_reference":
            self._apply_add_unresolved_reference(op, data)

    # ------------------------------------------------------------------
    # Per-operation helpers
    # ------------------------------------------------------------------

    def _apply_set_fact(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        fact_key = op.path.split(".", 1)[1] if "." in op.path else op.path
        if not fact_key or fact_key == "confirmed_facts":
            raise PatchApplyError(
                "set_fact requires a fact key in path (e.g. confirmed_facts.visa_type)",
                code="INVALID_PATH",
            )
        facts: dict[str, Any] = data.setdefault("confirmed_facts", {})
        if len(facts) >= MAX_CONFIRMED_FACTS and fact_key not in facts:
            raise PatchApplyError(
                f"Cannot add fact '{fact_key}': confirmed_facts at maximum "
                f"{MAX_CONFIRMED_FACTS}",
                code="CARDINALITY_EXCEEDED",
            )
        from app.schemas.compact_matter_state import _utc_now_iso

        facts[fact_key] = {
            "value": op.value,
            "status": "confirmed",
            "source_turn_id": op.turn_id or "unknown",
            "updated_at": _utc_now_iso(),
        }

    def _apply_confirm_fact(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        fact_key = op.path.split(".", 1)[1] if "." in op.path else op.path
        facts: dict[str, Any] = data.get("confirmed_facts", {})
        if fact_key not in facts:
            raise PatchApplyError(
                f"Cannot confirm unknown fact '{fact_key}'",
                code="UNKNOWN_FACT",
            )
        from app.schemas.compact_matter_state import _utc_now_iso

        facts[fact_key]["status"] = "confirmed"
        facts[fact_key]["updated_at"] = _utc_now_iso()
        if op.turn_id:
            facts[fact_key]["source_turn_id"] = op.turn_id

    def _apply_mark_fact_conflicting(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        fact_key = op.path.split(".", 1)[1] if "." in op.path else op.path
        facts: dict[str, Any] = data.get("confirmed_facts", {})
        if fact_key not in facts:
            raise PatchApplyError(
                f"Cannot mark unknown fact '{fact_key}' as conflicting",
                code="UNKNOWN_FACT",
            )
        from app.schemas.compact_matter_state import _utc_now_iso

        facts[fact_key]["status"] = "conflicting"
        facts[fact_key]["updated_at"] = _utc_now_iso()

    def _apply_set_active_thread(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        if not isinstance(op.value, dict):
            raise PatchApplyError(
                "set_active_thread requires a dict value",
                code="INVALID_VALUE",
            )
        thread = data.setdefault("active_thread", {})
        thread.update(op.value)

    def _apply_set_pending_action(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        if not isinstance(op.value, dict):
            raise PatchApplyError(
                "set_pending_action requires a dict value",
                code="INVALID_VALUE",
            )
        data["pending_action"] = dict(op.value)

    def _apply_add_option_set(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        if not isinstance(op.value, dict):
            raise PatchApplyError(
                "add_option_set requires a dict value",
                code="INVALID_VALUE",
            )
        option_sets: list[dict[str, Any]] = data.setdefault("option_sets", [])
        if len(option_sets) >= MAX_OPTION_SETS:
            raise PatchApplyError(
                f"Cannot add option set: maximum {MAX_OPTION_SETS} reached",
                code="CARDINALITY_EXCEEDED",
            )
        option_sets.append(dict(op.value))

    def _apply_append_research_ledger(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        if not isinstance(op.value, dict):
            raise PatchApplyError(
                "append_research_ledger requires a dict value",
                code="INVALID_VALUE",
            )
        ledger: list[dict[str, Any]] = data.setdefault("research_ledger", [])
        if len(ledger) >= MAX_RESEARCH_LEDGER_ENTRIES:
            # Prune oldest entry
            ledger.pop(0)
        ledger.append(dict(op.value))

    def _apply_append_recent_turn(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        if not isinstance(op.value, dict):
            raise PatchApplyError(
                "append_recent_turn requires a dict value",
                code="INVALID_VALUE",
            )
        turns: list[dict[str, Any]] = data.setdefault("recent_turns", [])
        if len(turns) >= MAX_RECENT_TURNS:
            turns.pop(0)
        turns.append(dict(op.value))

    def _apply_add_risk_flag(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        if not isinstance(op.value, dict):
            raise PatchApplyError(
                "add_risk_flag requires a dict value",
                code="INVALID_VALUE",
            )
        flags: list[dict[str, Any]] = data.setdefault("risk_flags", [])
        flags.append(dict(op.value))

    def _apply_clear_risk_flag(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        code = op.value if isinstance(op.value, str) else str(op.value or "")
        flags: list[dict[str, Any]] = data.get("risk_flags", [])
        for flag in flags:
            if flag.get("code") == code:
                flag["active"] = False

    def _apply_add_unresolved_reference(
        self, op: StatePatchOperation, data: dict[str, Any]
    ) -> None:
        if not isinstance(op.value, dict):
            raise PatchApplyError(
                "add_unresolved_reference requires a dict value",
                code="INVALID_VALUE",
            )
        refs: list[dict[str, Any]] = data.setdefault(
            "unresolved_references", []
        )
        refs.append(dict(op.value))