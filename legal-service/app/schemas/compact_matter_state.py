"""CompactMatterStateV2 — bounded, versioned working-memory structure.

Persisted under ``Matter.metadata_json["compact_state_v2"]`` during additive
dual-read/dual-write migration.  This schema is infrastructure for future
Luna/Sol agents; it must NOT become a new answering engine in Phase 3.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import ConfigDict, Field, field_validator

from app.schemas.common import BaseSchema

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCHEMA_VERSION = "matter_state.v2"

# Hard bounds (specification §10 / §8)
MAX_SERIALIZED_BYTES = 16 * 1024  # 16 KiB
MAX_RECENT_TURNS = 8
MAX_CONFIRMED_FACTS = 40
MAX_OPTION_SETS = 3
MAX_RESEARCH_LEDGER_ENTRIES = 30

# Allowed fact statuses
FactStatus = Literal["confirmed", "user_unsure", "conflicting"]

# Allowed active-thread statuses
ThreadStatus = Literal["open", "waiting_for_user", "answered", "escalated"]

# Allowed option statuses
OptionStatus = Literal["possible", "selected", "rejected", "superseded"]

# Allowed turn roles
TurnRole = Literal["user", "assistant"]


# ---------------------------------------------------------------------------
# Sub-schemas
# ---------------------------------------------------------------------------


class CompactIdentity(BaseSchema):
    """Immutable matter/session/frontend identity."""

    matter_id: str
    session_id: str | None = None
    frontend_chat_id: str | None = None


class CompactActiveThread(BaseSchema):
    """Current active topic / conversation thread."""

    topic_id: str
    user_goal: str = ""
    issue_type: str | None = None
    status: ThreadStatus = "open"


class CompactConfirmedFact(BaseSchema):
    """A single user-provided or user-confirmed fact."""

    value: Any
    status: FactStatus = "confirmed"
    source_turn_id: str
    updated_at: str  # RFC 3339


class CompactRiskFlag(BaseSchema):
    """A risk flag raised during the conversation."""

    code: str
    source_turn_id: str
    active: bool = True


class CompactOption(BaseSchema):
    """A single option within an option set."""

    option_id: str
    ordinal: int = Field(ge=1)
    label: str
    status: OptionStatus = "possible"


class CompactOptionSet(BaseSchema):
    """A set of options presented to the user."""

    set_id: str
    topic_id: str
    created_turn_id: str
    options: list[CompactOption] = Field(default_factory=list, max_length=20)


class CompactUnresolvedReference(BaseSchema):
    """An unresolved anaphoric / ordinal reference."""

    surface: str  # e.g. "the second", "第二个"
    turn_id: str
    resolved_to: str | None = None  # stable option_id or null


class CompactPendingAction(BaseSchema):
    """A pending action / offer awaiting user response."""

    type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_turn_id: str


class CompactResearchLedgerEntry(BaseSchema):
    """A record of evidence retrieved during research."""

    evidence_ref: str
    as_of_date: str | None = None  # YYYY-MM-DD
    retrieved_at: str  # RFC 3339


class CompactRecentTurn(BaseSchema):
    """A bounded summary of a recent conversation turn."""

    turn_id: str
    role: TurnRole
    summary: str = ""
    option_ids: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Top-level schema
# ---------------------------------------------------------------------------


class CompactMatterStateV2(BaseSchema):
    """Versioned compact working memory for a matter.

    All fields are bounded; no chain-of-thought, hidden reasoning, or
    model-internal scratchpad may be stored here.
    """

    model_config = ConfigDict(
        from_attributes=True,
        extra="forbid",
    )

    schema_version: Literal["matter_state.v2"] = "matter_state.v2"

    revision: int = Field(default=1, ge=1)

    identity: CompactIdentity

    active_thread: CompactActiveThread

    confirmed_facts: dict[str, CompactConfirmedFact] = Field(default_factory=dict)

    risk_flags: list[CompactRiskFlag] = Field(default_factory=list)

    option_sets: list[CompactOptionSet] = Field(default_factory=list)

    unresolved_references: list[CompactUnresolvedReference] = Field(
        default_factory=list
    )

    pending_action: CompactPendingAction | None = None

    research_ledger: list[CompactResearchLedgerEntry] = Field(default_factory=list)

    rolling_summary: str = ""

    recent_turns: list[CompactRecentTurn] = Field(default_factory=list)

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @field_validator("confirmed_facts")
    @classmethod
    def _cap_confirmed_facts(
        cls, v: dict[str, CompactConfirmedFact]
    ) -> dict[str, CompactConfirmedFact]:
        if len(v) > MAX_CONFIRMED_FACTS:
            raise ValueError(
                f"confirmed_facts exceeds maximum {MAX_CONFIRMED_FACTS} "
                f"(got {len(v)})"
            )
        return v

    @field_validator("option_sets")
    @classmethod
    def _cap_option_sets(
        cls, v: list[CompactOptionSet]
    ) -> list[CompactOptionSet]:
        if len(v) > MAX_OPTION_SETS:
            raise ValueError(
                f"option_sets exceeds maximum {MAX_OPTION_SETS} (got {len(v)})"
            )
        return v

    @field_validator("research_ledger")
    @classmethod
    def _cap_research_ledger(
        cls, v: list[CompactResearchLedgerEntry]
    ) -> list[CompactResearchLedgerEntry]:
        if len(v) > MAX_RESEARCH_LEDGER_ENTRIES:
            raise ValueError(
                f"research_ledger exceeds maximum {MAX_RESEARCH_LEDGER_ENTRIES} "
                f"(got {len(v)})"
            )
        return v

    @field_validator("recent_turns")
    @classmethod
    def _cap_recent_turns(
        cls, v: list[CompactRecentTurn]
    ) -> list[CompactRecentTurn]:
        if len(v) > MAX_RECENT_TURNS:
            raise ValueError(
                f"recent_turns exceeds maximum {MAX_RECENT_TURNS} (got {len(v)})"
            )
        return v

    # ------------------------------------------------------------------
    # Serialization helpers
    # ------------------------------------------------------------------

    def serialized_size(self) -> int:
        """Return the UTF-8 byte length of the JSON representation."""
        return len(self.model_dump_json().encode("utf-8"))

    def check_size(self) -> None:
        """Raise ValueError if serialized size exceeds the hard cap."""
        size = self.serialized_size()
        if size > MAX_SERIALIZED_BYTES:
            raise ValueError(
                f"CompactMatterStateV2 serialized size {size} bytes "
                f"exceeds maximum {MAX_SERIALIZED_BYTES} bytes"
            )

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------

    @classmethod
    def create_initial(
        cls,
        *,
        matter_id: str,
        session_id: str | None = None,
        frontend_chat_id: str | None = None,
        topic_id: str | None = None,
    ) -> CompactMatterStateV2:
        """Create a minimal valid initial state for a new matter."""
        return cls(
            revision=1,
            identity=CompactIdentity(
                matter_id=matter_id,
                session_id=session_id,
                frontend_chat_id=frontend_chat_id,
            ),
            active_thread=CompactActiveThread(
                topic_id=topic_id or _new_topic_id(),
                user_goal="",
                issue_type=None,
                status="open",
            ),
        )


# ---------------------------------------------------------------------------
# State patch schema (for allowlisted mutations)
# ---------------------------------------------------------------------------


class StatePatchOperation(BaseSchema):
    """A single allowlisted mutation to CompactMatterStateV2."""

    op: str  # e.g. "set_fact", "confirm_fact", "mark_fact_conflicting", ...
    path: str  # dotted path within the state
    value: Any | None = None
    turn_id: str | None = None


class StatePatch(BaseSchema):
    """A batch of allowlisted mutations with expected revision."""

    expected_revision: int = Field(ge=1)
    operations: list[StatePatchOperation] = Field(
        default_factory=list, max_length=20
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _new_topic_id() -> str:
    return f"topic-{uuid4().hex[:12]}"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()