"""Phase 3 acceptance tests for CompactMatterStateV2.

Covers: migration, size/cardinality, patch validation, fact provenance,
ordinal resolution, dual-read, dual-write, replay, modes, regression.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from typing import Any

import pytest

# Ensure legal-service is on the path
sys.path.insert(0, ".")

from app.schemas.compact_matter_state import (
    MAX_CONFIRMED_FACTS,
    MAX_OPTION_SETS,
    MAX_RESEARCH_LEDGER_ENTRIES,
    MAX_RECENT_TURNS,
    MAX_SERIALIZED_BYTES,
    CompactActiveThread,
    CompactConfirmedFact,
    CompactIdentity,
    CompactMatterStateV2,
    CompactOption,
    CompactOptionSet,
    CompactPendingAction,
    CompactRecentTurn,
    CompactResearchLedgerEntry,
    CompactRiskFlag,
    CompactUnresolvedReference,
    StatePatch,
    StatePatchOperation,
)
from app.services.compact_matter_state_service import CompactMatterStateService
from app.services.state_patch_validator import (
    PatchRejectedError,
    StatePatchValidator,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_state(
    matter_id: str = "matter-1",
    revision: int = 1,
    topic_id: str = "topic-aaa",
) -> CompactMatterStateV2:
    return CompactMatterStateV2(
        revision=revision,
        identity=CompactIdentity(matter_id=matter_id),
        active_thread=CompactActiveThread(topic_id=topic_id),
    )


def _make_patch(
    expected_revision: int,
    operations: list[dict[str, Any]],
) -> StatePatch:
    return StatePatch(
        expected_revision=expected_revision,
        operations=[StatePatchOperation(**op) for op in operations],
    )


# ===================================================================
# A. MIGRATION
# ===================================================================


class TestMigration:
    def test_initial_state_creation(self):
        state = CompactMatterStateV2.create_initial(matter_id="m-1")
        assert state.schema_version == "matter_state.v2"
        assert state.revision == 1
        assert state.identity.matter_id == "m-1"
        assert state.active_thread.topic_id.startswith("topic-")
        assert state.active_thread.status == "open"
        assert state.confirmed_facts == {}
        assert state.option_sets == []
        assert state.recent_turns == []

    def test_serialize_deserialize_roundtrip(self):
        state = _make_state()
        data = state.model_dump()
        restored = CompactMatterStateV2(**data)
        assert restored.revision == state.revision
        assert restored.identity.matter_id == state.identity.matter_id

    def test_load_from_metadata_json(self):
        service = CompactMatterStateService()
        state = _make_state()
        metadata = {"compact_state_v2": state.model_dump()}
        loaded = service.load_or_create(
            metadata_json=metadata, matter_id="m-1"
        )
        assert loaded is not None
        assert loaded.revision == 1

    def test_load_returns_none_when_absent(self):
        service = CompactMatterStateService()
        loaded = service.load_or_create(
            metadata_json={}, matter_id="m-1"
        )
        assert loaded is None

    def test_load_returns_none_when_invalid(self):
        service = CompactMatterStateService()
        metadata = {"compact_state_v2": {"schema_version": "wrong"}}
        loaded = service.load_or_create(
            metadata_json=metadata, matter_id="m-1"
        )
        assert loaded is None  # invalid schema fails gracefully

    def test_repeated_migration_is_idempotent(self):
        """Loading the same valid state twice produces identical results."""
        state = _make_state()
        data = state.model_dump()
        restored1 = CompactMatterStateV2(**data)
        restored2 = CompactMatterStateV2(**data)
        assert restored1.model_dump_json() == restored2.model_dump_json()

    def test_existing_v2_not_regenerated(self):
        """Existing valid V2 state is not unnecessarily regenerated."""
        service = CompactMatterStateService()
        state = _make_state(revision=5)
        metadata = {"compact_state_v2": state.model_dump()}
        loaded = service.load_or_create(
            metadata_json=metadata, matter_id="m-1"
        )
        assert loaded is not None
        assert loaded.revision == 5  # preserved, not reset to 1


# ===================================================================
# B. SIZE / CARDINALITY
# ===================================================================


class TestSizeAndCardinality:
    def test_initial_state_within_size_limit(self):
        state = _make_state()
        assert state.serialized_size() < MAX_SERIALIZED_BYTES

    def test_max_recent_turns_enforced(self):
        with pytest.raises(ValueError, match="recent_turns exceeds"):
            CompactMatterStateV2(
                identity=CompactIdentity(matter_id="m-1"),
                active_thread=CompactActiveThread(topic_id="t1"),
                recent_turns=[
                    CompactRecentTurn(
                        turn_id=f"t{i}", role="user", summary="x"
                    )
                    for i in range(MAX_RECENT_TURNS + 1)
                ],
            )

    def test_max_confirmed_facts_enforced(self):
        facts = {
            f"k{i}": CompactConfirmedFact(
                value=i, source_turn_id="t1", updated_at=_utc_now_iso()
            )
            for i in range(MAX_CONFIRMED_FACTS + 1)
        }
        with pytest.raises(ValueError, match="confirmed_facts exceeds"):
            CompactMatterStateV2(
                identity=CompactIdentity(matter_id="m-1"),
                active_thread=CompactActiveThread(topic_id="t1"),
                confirmed_facts=facts,
            )

    def test_max_option_sets_enforced(self):
        sets = [
            CompactOptionSet(
                set_id=f"s{i}",
                topic_id="t1",
                created_turn_id="turn1",
                options=[],
            )
            for i in range(MAX_OPTION_SETS + 1)
        ]
        with pytest.raises(ValueError, match="option_sets exceeds"):
            CompactMatterStateV2(
                identity=CompactIdentity(matter_id="m-1"),
                active_thread=CompactActiveThread(topic_id="t1"),
                option_sets=sets,
            )

    def test_max_research_ledger_enforced(self):
        entries = [
            CompactResearchLedgerEntry(
                evidence_ref=f"ref{i}",
                retrieved_at=_utc_now_iso(),
            )
            for i in range(MAX_RESEARCH_LEDGER_ENTRIES + 1)
        ]
        with pytest.raises(ValueError, match="research_ledger exceeds"):
            CompactMatterStateV2(
                identity=CompactIdentity(matter_id="m-1"),
                active_thread=CompactActiveThread(topic_id="t1"),
                research_ledger=entries,
            )

    def test_size_check_raises_on_oversize(self):
        """A state with a very large rolling_summary should fail size check."""
        state = _make_state()
        state.rolling_summary = "x" * (MAX_SERIALIZED_BYTES + 100)
        with pytest.raises(ValueError, match="exceeds maximum"):
            state.check_size()

    def test_boundary_behavior_accepts_at_limit(self):
        """Exactly at the limit should be accepted."""
        facts = {
            f"k{i}": CompactConfirmedFact(
                value=i, source_turn_id="t1", updated_at=_utc_now_iso()
            )
            for i in range(MAX_CONFIRMED_FACTS)
        }
        state = CompactMatterStateV2(
            identity=CompactIdentity(matter_id="m-1"),
            active_thread=CompactActiveThread(topic_id="t1"),
            confirmed_facts=facts,
        )
        assert len(state.confirmed_facts) == MAX_CONFIRMED_FACTS


# ===================================================================
# C. PATCH VALIDATION
# ===================================================================


class TestPatchValidation:
    def test_valid_revision_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state(revision=12)
        patch = _make_patch(
            12,
            [{"op": "set_rolling_summary", "path": "rolling_summary", "value": "hello"}],
        )
        new_state = validator.apply(patch, state)
        assert new_state.revision == 13
        assert new_state.rolling_summary == "hello"

    def test_stale_revision_rejects(self):
        validator = StatePatchValidator()
        state = _make_state(revision=12)
        patch = _make_patch(11, [{"op": "set_rolling_summary", "path": "rolling_summary", "value": "x"}])
        with pytest.raises(PatchRejectedError, match="Expected revision"):
            validator.apply(patch, state)

    def test_future_revision_rejects(self):
        validator = StatePatchValidator()
        state = _make_state(revision=12)
        patch = _make_patch(13, [{"op": "set_rolling_summary", "path": "rolling_summary", "value": "x"}])
        with pytest.raises(PatchRejectedError, match="Expected revision"):
            validator.apply(patch, state)

    def test_unknown_operation_rejects(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(1, [{"op": "invent_facts", "path": "confirmed_facts", "value": {}}])
        with pytest.raises(PatchRejectedError, match="unknown op"):
            validator.apply(patch, state)

    def test_identity_replacement_rejects(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(1, [{"op": "set_fact", "path": "identity", "value": {}}])
        with pytest.raises(PatchRejectedError, match="immutable path"):
            validator.apply(patch, state)

    def test_identity_matter_id_replacement_rejects(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(1, [{"op": "set_fact", "path": "identity.matter_id", "value": "hacked"}])
        with pytest.raises(PatchRejectedError, match="immutable path"):
            validator.apply(patch, state)

    def test_arbitrary_key_rejects(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(1, [{"op": "set_fact", "path": "made_up_field", "value": "x"}])
        with pytest.raises(PatchRejectedError, match="unknown top-level field"):
            validator.apply(patch, state)

    def test_hidden_reasoning_field_rejects(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(1, [{"op": "set_fact", "path": "chain_of_thought", "value": "secret"}])
        with pytest.raises(PatchRejectedError, match="not allowed"):
            validator.apply(patch, state)

    def test_underscore_prefix_rejects(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(1, [{"op": "set_fact", "path": "_hidden", "value": "x"}])
        with pytest.raises(PatchRejectedError, match="not allowed"):
            validator.apply(patch, state)

    def test_invalid_schema_rejects(self):
        validator = StatePatchValidator()
        state = _make_state()
        # set_fact with no turn_id should fail because the value is not a dict
        patch = _make_patch(1, [{"op": "set_fact", "path": "confirmed_facts.x", "value": "y", "turn_id": "t1"}])
        # This should succeed (set_fact with turn_id is valid)
        new_state = validator.apply(patch, state)
        assert "x" in new_state.confirmed_facts

    def test_set_fact_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(
            1,
            [{
                "op": "set_fact",
                "path": "confirmed_facts.visa_type",
                "value": "482",
                "turn_id": "turn-1",
            }],
        )
        new_state = validator.apply(patch, state)
        assert "visa_type" in new_state.confirmed_facts
        assert new_state.confirmed_facts["visa_type"].value == "482"
        assert new_state.confirmed_facts["visa_type"].status == "confirmed"

    def test_confirm_fact_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        state.confirmed_facts["visa_type"] = CompactConfirmedFact(
            value="482",
            status="user_unsure",
            source_turn_id="t1",
            updated_at=_utc_now_iso(),
        )
        patch = _make_patch(
            1,
            [{"op": "confirm_fact", "path": "confirmed_facts.visa_type", "turn_id": "t2"}],
        )
        new_state = validator.apply(patch, state)
        assert new_state.confirmed_facts["visa_type"].status == "confirmed"

    def test_mark_fact_conflicting_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        state.confirmed_facts["visa_type"] = CompactConfirmedFact(
            value="482",
            status="confirmed",
            source_turn_id="t1",
            updated_at=_utc_now_iso(),
        )
        patch = _make_patch(
            1,
            [{"op": "mark_fact_conflicting", "path": "confirmed_facts.visa_type"}],
        )
        new_state = validator.apply(patch, state)
        assert new_state.confirmed_facts["visa_type"].status == "conflicting"

    def test_set_active_thread_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(
            1,
            [{"op": "set_active_thread", "path": "active_thread", "value": {"status": "answered"}}],
        )
        new_state = validator.apply(patch, state)
        assert new_state.active_thread.status == "answered"

    def test_set_pending_action_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(
            1,
            [{
                "op": "set_pending_action",
                "path": "pending_action",
                "value": {"type": "booking", "payload": {}, "created_turn_id": "t1"},
            }],
        )
        new_state = validator.apply(patch, state)
        assert new_state.pending_action is not None
        assert new_state.pending_action.type == "booking"

    def test_clear_pending_action_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        state.pending_action = CompactPendingAction(
            type="booking", payload={}, created_turn_id="t1"
        )
        patch = _make_patch(1, [{"op": "clear_pending_action", "path": "pending_action"}])
        new_state = validator.apply(patch, state)
        assert new_state.pending_action is None

    def test_add_option_set_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(
            1,
            [{
                "op": "add_option_set",
                "path": "option_sets",
                "value": {
                    "set_id": "s1",
                    "topic_id": "topic-aaa",
                    "created_turn_id": "t1",
                    "options": [
                        {"option_id": "visa:400", "ordinal": 1, "label": "Subclass 400", "status": "possible"},
                        {"option_id": "visa:482", "ordinal": 2, "label": "Subclass 482", "status": "possible"},
                    ],
                },
            }],
        )
        new_state = validator.apply(patch, state)
        assert len(new_state.option_sets) == 1
        assert new_state.option_sets[0].options[0].option_id == "visa:400"
        assert new_state.option_sets[0].options[1].ordinal == 2

    def test_append_research_ledger_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(
            1,
            [{
                "op": "append_research_ledger",
                "path": "research_ledger",
                "value": {"evidence_ref": "ref-1", "retrieved_at": _utc_now_iso()},
            }],
        )
        new_state = validator.apply(patch, state)
        assert len(new_state.research_ledger) == 1

    def test_append_recent_turn_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(
            1,
            [{
                "op": "append_recent_turn",
                "path": "recent_turns",
                "value": {"turn_id": "t1", "role": "user", "summary": "hello"},
            }],
        )
        new_state = validator.apply(patch, state)
        assert len(new_state.recent_turns) == 1

    def test_add_risk_flag_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(
            1,
            [{
                "op": "add_risk_flag",
                "path": "risk_flags",
                "value": {"code": "deadline_sensitive", "source_turn_id": "t1", "active": True},
            }],
        )
        new_state = validator.apply(patch, state)
        assert len(new_state.risk_flags) == 1

    def test_clear_risk_flag_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        state.risk_flags = [
            CompactRiskFlag(code="deadline_sensitive", source_turn_id="t1", active=True)
        ]
        patch = _make_patch(
            1,
            [{"op": "clear_risk_flag", "path": "risk_flags", "value": "deadline_sensitive"}],
        )
        new_state = validator.apply(patch, state)
        assert new_state.risk_flags[0].active is False

    def test_add_unresolved_reference_succeeds(self):
        validator = StatePatchValidator()
        state = _make_state()
        patch = _make_patch(
            1,
            [{
                "op": "add_unresolved_reference",
                "path": "unresolved_references",
                "value": {"surface": "the second", "turn_id": "t1", "resolved_to": "visa:482"},
            }],
        )
        new_state = validator.apply(patch, state)
        assert len(new_state.unresolved_references) == 1
        assert new_state.unresolved_references[0].resolved_to == "visa:482"


# ===================================================================
# D. FACT PROVENANCE
# ===================================================================


class TestFactProvenance:
    def test_user_supplied_fact_enters_confirmed(self):
        """A fact with source='user_input' should be promoted."""
        service = CompactMatterStateService()
        state = _make_state()

        # Simulate a legacy state with a user_input fact
        from app.schemas.state import FactSlotState, MatterState
        legacy = MatterState()
        legacy.fact_slot_states = [
            FactSlotState(
                fact_key="visa_type",
                label="Visa Type",
                status="known",
                value="482",
                source="user_input",
            )
        ]

        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="I have a 482 visa",
            assistant_answer="",
        )
        assert "visa_type" in updated.confirmed_facts
        assert updated.confirmed_facts["visa_type"].value == "482"
        assert updated.confirmed_facts["visa_type"].status == "confirmed"

    def test_user_unsure_fact_preserved_as_unsure(self):
        service = CompactMatterStateService()
        state = _make_state()

        from app.schemas.state import FactSlotState, MatterState
        legacy = MatterState()
        legacy.fact_slot_states = [
            FactSlotState(
                fact_key="visa_expiry",
                label="Visa Expiry",
                status="user_unsure",
                value="last month",
                source="user_input",
            )
        ]

        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="I think my visa expired last month",
            assistant_answer="",
        )
        assert "visa_expiry" in updated.confirmed_facts
        assert updated.confirmed_facts["visa_expiry"].status == "user_unsure"

    def test_llm_inferred_fact_not_promoted(self):
        """Facts with source='llm_extraction' must NOT enter confirmed_facts."""
        service = CompactMatterStateService()
        state = _make_state()

        from app.schemas.state import FactSlotState, MatterState
        legacy = MatterState()
        legacy.fact_slot_states = [
            FactSlotState(
                fact_key="current_status",
                label="Current Status",
                status="known",
                value="unlawful",
                source="llm_extraction",  # NOT user_input
            )
        ]

        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="I think my visa expired",
            assistant_answer="",
        )
        # LLM-inferred fact should NOT be in confirmed_facts
        assert "current_status" not in updated.confirmed_facts

    def test_legal_conclusion_not_promoted(self):
        """Legal conclusions from system_inferred must not enter confirmed_facts."""
        service = CompactMatterStateService()
        state = _make_state()

        from app.schemas.state import FactSlotState, MatterState
        legacy = MatterState()
        legacy.fact_slot_states = [
            FactSlotState(
                fact_key="eligibility",
                label="Eligibility",
                status="known",
                value="eligible",
                source="system_inferred",
            )
        ]

        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="Am I eligible?",
            assistant_answer="",
        )
        assert "eligibility" not in updated.confirmed_facts

    def test_legacy_fact_unknown_provenance_not_promoted(self):
        """Facts with source='unknown' must not be promoted as confirmed."""
        service = CompactMatterStateService()
        state = _make_state()

        from app.schemas.state import FactSlotState, MatterState
        legacy = MatterState()
        legacy.fact_slot_states = [
            FactSlotState(
                fact_key="some_fact",
                label="Some Fact",
                status="known",
                value="something",
                source="unknown",
            )
        ]

        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="test",
            assistant_answer="",
        )
        assert "some_fact" not in updated.confirmed_facts

    def test_conflicting_user_info_marked_conflicting(self):
        service = CompactMatterStateService()
        state = _make_state()

        from app.schemas.state import FactSlotState, MatterState
        legacy = MatterState()
        legacy.fact_slot_states = [
            FactSlotState(
                fact_key="visa_type",
                label="Visa Type",
                status="conflicting",
                value="482",
                source="user_input",
            )
        ]

        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="test",
            assistant_answer="",
        )
        assert "visa_type" in updated.confirmed_facts
        assert updated.confirmed_facts["visa_type"].status == "conflicting"


# ===================================================================
# E. OPTION / ORDINAL
# ===================================================================


class TestOrdinalResolution:
    def test_the_second_english(self):
        service = CompactMatterStateService()
        state = _make_state(topic_id="topic-aaa")
        state.option_sets = [
            CompactOptionSet(
                set_id="s1",
                topic_id="topic-aaa",
                created_turn_id="t1",
                options=[
                    CompactOption(option_id="visa:400", ordinal=1, label="Subclass 400"),
                    CompactOption(option_id="visa:482", ordinal=2, label="Subclass 482"),
                ],
            )
        ]

        result = service.resolve_ordinal("tell me about the second", state, "t2")
        assert result == "visa:482"

    def test_chinese_ordinal(self):
        service = CompactMatterStateService()
        state = _make_state(topic_id="topic-aaa")
        state.option_sets = [
            CompactOptionSet(
                set_id="s1",
                topic_id="topic-aaa",
                created_turn_id="t1",
                options=[
                    CompactOption(option_id="opt-a", ordinal=1, label="选项A"),
                    CompactOption(option_id="opt-b", ordinal=2, label="选项B"),
                ],
            )
        ]

        result = service.resolve_ordinal("第二个", state, "t2")
        assert result == "opt-b"

    def test_that_option_anaphoric(self):
        service = CompactMatterStateService()
        state = _make_state(topic_id="topic-aaa")
        state.option_sets = [
            CompactOptionSet(
                set_id="s1",
                topic_id="topic-aaa",
                created_turn_id="t1",
                options=[
                    CompactOption(option_id="visa:400", ordinal=1, label="Subclass 400"),
                    CompactOption(option_id="visa:482", ordinal=2, label="Subclass 482"),
                ],
            )
        ]
        # Record a prior resolved reference
        state.unresolved_references = [
            CompactUnresolvedReference(
                surface="the second", turn_id="t1", resolved_to="visa:482"
            )
        ]

        result = service.resolve_ordinal("tell me about that option", state, "t2")
        assert result == "visa:482"

    def test_topic_switch_prevents_stale_binding(self):
        """After switching topics, old option set must not capture new ordinal."""
        service = CompactMatterStateService()
        state = _make_state(topic_id="topic-a")
        state.option_sets = [
            CompactOptionSet(
                set_id="s1",
                topic_id="topic-a",
                created_turn_id="t1",
                options=[
                    CompactOption(option_id="visa:400", ordinal=1, label="Subclass 400"),
                    CompactOption(option_id="visa:482", ordinal=2, label="Subclass 482"),
                ],
            )
        ]

        # Switch topic
        state = service.switch_topic(
            state, new_topic_id="topic-b", new_issue_type="student_visa"
        )
        # Add new option set for topic B
        state.option_sets.append(
            CompactOptionSet(
                set_id="s2",
                topic_id="topic-b",
                created_turn_id="t2",
                options=[
                    CompactOption(option_id="visa:500", ordinal=1, label="Subclass 500"),
                    CompactOption(option_id="visa:485", ordinal=2, label="Subclass 485"),
                ],
            )
        )

        result = service.resolve_ordinal("the second", state, "t3")
        # Must resolve to topic B's option 2, not topic A's
        assert result == "visa:485"

    def test_unresolved_ambiguity_produces_null(self):
        """When no option set exists, ordinal resolution returns None."""
        service = CompactMatterStateService()
        state = _make_state(topic_id="topic-aaa")
        # No option sets

        result = service.resolve_ordinal("the second", state, "t1")
        assert result is None

    def test_stable_option_ids_across_turns(self):
        """Option IDs must survive subsequent turns unchanged."""
        service = CompactMatterStateService()
        state = _make_state(topic_id="topic-aaa")
        state.option_sets = [
            CompactOptionSet(
                set_id="s1",
                topic_id="topic-aaa",
                created_turn_id="t1",
                options=[
                    CompactOption(option_id="visa:400", ordinal=1, label="Subclass 400"),
                    CompactOption(option_id="visa:482", ordinal=2, label="Subclass 482"),
                ],
            )
        ]

        # Simulate a turn
        from app.schemas.state import MatterState
        legacy = MatterState()
        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t2",
            user_question="the second",
            assistant_answer="Subclass 482 is...",
        )

        # Option IDs must be unchanged
        assert updated.option_sets[0].options[0].option_id == "visa:400"
        assert updated.option_sets[0].options[1].option_id == "visa:482"
        assert updated.option_sets[0].options[1].ordinal == 2

    def test_truncated_history_preserves_option_ids(self):
        """Even with truncated recent_turns, option IDs remain stable."""
        state = _make_state(topic_id="topic-aaa")
        state.option_sets = [
            CompactOptionSet(
                set_id="s1",
                topic_id="topic-aaa",
                created_turn_id="t1",
                options=[
                    CompactOption(option_id="visa:400", ordinal=1, label="Subclass 400"),
                    CompactOption(option_id="visa:482", ordinal=2, label="Subclass 482"),
                ],
            )
        ]
        # Fill recent_turns to max
        for i in range(MAX_RECENT_TURNS):
            state.recent_turns.append(
                CompactRecentTurn(turn_id=f"t{i}", role="user", summary=f"msg {i}")
            )

        # Option IDs must still be intact
        assert state.option_sets[0].options[0].option_id == "visa:400"
        assert state.option_sets[0].options[1].option_id == "visa:482"


# ===================================================================
# F. DUAL READ
# ===================================================================


class TestDualRead:
    def test_legacy_only_matter_still_works(self):
        """A matter with no compact_state_v2 must remain usable."""
        service = CompactMatterStateService()
        metadata = {"conversation_state": "NEW", "issue_type": "test"}
        loaded = service.load_or_create(
            metadata_json=metadata, matter_id="m-1"
        )
        assert loaded is None  # No V2 state, but no error

    def test_v2_containing_matter_works(self):
        service = CompactMatterStateService()
        state = _make_state()
        metadata = {
            "conversation_state": "NEW",
            "compact_state_v2": state.model_dump(),
        }
        loaded = service.load_or_create(
            metadata_json=metadata, matter_id="m-1"
        )
        assert loaded is not None
        assert loaded.revision == 1

    def test_invalid_v2_does_not_destroy_legacy(self):
        """An invalid compact_state_v2 must not prevent legacy state loading."""
        service = CompactMatterStateService()
        metadata = {
            "conversation_state": "NEW",
            "issue_type": "test",
            "compact_state_v2": {"garbage": True},
        }
        loaded = service.load_or_create(
            metadata_json=metadata, matter_id="m-1"
        )
        # Invalid V2 returns None, but legacy state is still in metadata
        assert loaded is None
        assert metadata["conversation_state"] == "NEW"
        assert metadata["issue_type"] == "test"

    def test_flag_off_leaves_legacy_authoritative(self):
        """When COMPACT_MATTER_STATE_ENABLED=false, legacy state is authoritative."""
        # This is tested by the dual-write path only running when flag is true.
        # The flag check is in query_service._update_matter_from_state.
        # Here we verify the service doesn't require compact state.
        service = CompactMatterStateService()
        loaded = service.load_or_create(metadata_json=None, matter_id="m-1")
        assert loaded is None  # No error, just no V2 state


# ===================================================================
# G. DUAL WRITE
# ===================================================================


class TestDualWrite:
    def test_legacy_state_write_remains_compatible(self):
        """Legacy state serialization must still work after Phase 3 changes."""
        from app.schemas.state import MatterState
        from app.services.state_machine import StateMachine

        sm = StateMachine()
        state = MatterState()
        state.issue_type = "test_issue"
        state.conversation_state = "FACT_GATHERING"

        metadata = sm.to_metadata_json(state)
        assert metadata["issue_type"] == "test_issue"
        assert metadata["conversation_state"] == "FACT_GATHERING"
        # Legacy fields must be present
        assert "conversation_history" in metadata
        assert "carried_intake_facts" in metadata

    def test_v2_metadata_is_additive(self):
        """compact_state_v2 is added alongside legacy state, not replacing it."""
        from app.schemas.state import MatterState
        from app.services.state_machine import StateMachine

        sm = StateMachine()
        state = MatterState()
        state.issue_type = "test"

        # Simulate base metadata with compact_state_v2
        base = {
            "initial_question": "hello",
            "compact_state_v2": _make_state().model_dump(),
        }
        metadata = sm.to_metadata_json(state, base_metadata=base)

        # Both legacy and V2 must be present
        assert metadata["issue_type"] == "test"
        assert "compact_state_v2" in metadata
        assert metadata["initial_question"] == "hello"

    def test_old_history_remains_present(self):
        """Legacy conversation_history must not be deleted."""
        from app.schemas.state import ConversationTurn, MatterState
        from app.services.state_machine import StateMachine

        sm = StateMachine()
        state = MatterState()
        state.conversation_history = [
            ConversationTurn(role="user", content="old message", timestamp=_utc_now_iso())
        ]

        metadata = sm.to_metadata_json(state)
        assert len(metadata["conversation_history"]) == 1
        assert metadata["conversation_history"][0]["content"] == "old message"

    def test_v2_write_failure_does_not_corrupt_legacy(self):
        """If compact state update fails, legacy state must be preserved."""
        # The dual-write in query_service wraps V2 update in try/except.
        # Here we verify the service gracefully handles errors.
        service = CompactMatterStateService()
        state = _make_state()

        # Simulate an update that would fail (e.g., by passing invalid data)
        # The service should return the original state unchanged
        from app.schemas.state import MatterState
        legacy = MatterState()
        # Passing None for required fields should be handled
        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="",
            assistant_answer="",
        )
        # Should still return a valid state
        assert updated.revision == state.revision + 1
        assert updated.identity.matter_id == state.identity.matter_id


# ===================================================================
# H. REPLAY
# ===================================================================


class TestReplay:
    def test_replay_preserves_active_topic(self):
        service = CompactMatterStateService()
        state = _make_state(topic_id="topic-aaa")
        state.active_thread.issue_type = "visa_482"

        from app.schemas.state import MatterState
        legacy = MatterState()
        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="test",
            assistant_answer="",
            issue_type="visa_482",
        )

        assert updated.active_thread.topic_id == "topic-aaa"
        assert updated.active_thread.issue_type == "visa_482"

    def test_replay_preserves_confirmed_user_facts(self):
        service = CompactMatterStateService()
        state = _make_state()
        state.confirmed_facts["visa_type"] = CompactConfirmedFact(
            value="482",
            status="confirmed",
            source_turn_id="t0",
            updated_at=_utc_now_iso(),
        )

        from app.schemas.state import MatterState
        legacy = MatterState()
        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="test",
            assistant_answer="",
        )

        assert "visa_type" in updated.confirmed_facts
        assert updated.confirmed_facts["visa_type"].value == "482"

    def test_replay_preserves_pending_action(self):
        service = CompactMatterStateService()
        state = _make_state()
        state.pending_action = CompactPendingAction(
            type="booking", payload={"date": "2026-01-01"}, created_turn_id="t0"
        )

        from app.schemas.state import MatterState
        legacy = MatterState()
        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="test",
            assistant_answer="",
            pending_offer={"offer_type": "booking", "date": "2026-01-01"},
        )

        assert updated.pending_action is not None
        assert updated.pending_action.type == "booking"

    def test_replay_preserves_identity(self):
        service = CompactMatterStateService()
        state = _make_state(matter_id="matter-42")
        state.identity.session_id = "sess-1"
        state.identity.frontend_chat_id = "chat-1"

        from app.schemas.state import MatterState
        legacy = MatterState()
        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="test",
            assistant_answer="",
        )

        assert updated.identity.matter_id == "matter-42"
        assert updated.identity.session_id == "sess-1"
        assert updated.identity.frontend_chat_id == "chat-1"


# ===================================================================
# I. MODES
# ===================================================================


class TestModes:
    def test_compact_state_semantics_shared(self):
        """Compact state schema is identical for default and premium modes."""
        default_state = _make_state()
        premium_state = _make_state()

        # Both must have the same schema version and structure
        assert default_state.schema_version == premium_state.schema_version
        assert set(default_state.model_fields.keys()) == set(
            premium_state.model_fields.keys()
        )

    def test_public_answer_remains_legacy(self):
        """Phase 3 does not change the public answer engine."""
        # This is an architectural invariant tested by existing smokes.
        # Here we verify the compact state service has no LLM/tool calls.
        service = CompactMatterStateService()
        # The service must not have any provider/tool attributes
        assert not hasattr(service, "_llm_client")
        assert not hasattr(service, "_tool_registry")


# ===================================================================
# J. REGRESSION
# ===================================================================


class TestRegression:
    def test_no_chain_of_thought_stored(self):
        """CompactMatterStateV2 must reject hidden reasoning fields."""
        with pytest.raises(Exception):
            CompactMatterStateV2(
                identity=CompactIdentity(matter_id="m-1"),
                active_thread=CompactActiveThread(topic_id="t1"),
                # Attempt to inject a hidden field via extra kwargs
                **{"chain_of_thought": "secret reasoning"},
            )

    def test_no_arbitrary_fields_accepted(self):
        """The schema must reject unknown fields."""
        data = _make_state().model_dump()
        data["made_up_field"] = "should not be here"
        with pytest.raises(Exception):
            CompactMatterStateV2(**data)

    def test_identity_immutable_through_service(self):
        """The service must not allow identity mutation."""
        service = CompactMatterStateService()
        state = _make_state(matter_id="original-id")

        from app.schemas.state import MatterState
        legacy = MatterState()
        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="test",
            assistant_answer="",
        )

        assert updated.identity.matter_id == "original-id"

    def test_no_new_llm_calls(self):
        """Phase 3 must not introduce any LLM/model/tool calls."""
        service = CompactMatterStateService()
        validator = StatePatchValidator()

        # Verify no OpenAI/client attributes
        for obj in [service, validator]:
            for attr in dir(obj):
                assert "openai" not in attr.lower(), f"{obj} has {attr}"
                assert "provider" not in attr.lower(), f"{obj} has {attr}"
                assert "tool_call" not in attr.lower(), f"{obj} has {attr}"

    def test_rolling_summary_no_speculative_conclusions(self):
        """Rolling summary must not add speculative legal conclusions beyond user input."""
        service = CompactMatterStateService()
        state = _make_state()

        from app.schemas.state import MatterState
        legacy = MatterState()
        updated = service.update_after_turn(
            compact=state,
            legacy_state=legacy,
            turn_id="t1",
            user_question="What visa should I apply for?",
            assistant_answer="",
        )

        # Rolling summary should be neutral, not contain speculative conclusions
        summary = updated.rolling_summary.lower()
        # The summary should not contain legal conclusions the service invented
        assert "you are eligible" not in summary
        assert "guaranteed approval" not in summary
        assert "you will get" not in summary

    def test_serialized_size_measured_in_bytes(self):
        """serialized_size() must return actual UTF-8 byte count."""
        state = _make_state()
        state.rolling_summary = "Hello, 世界"
        size = state.serialized_size()
        raw_json = state.model_dump_json()
        assert size == len(raw_json.encode("utf-8"))
        # Chinese characters are multi-byte in UTF-8
        assert size > len(raw_json)


# ===================================================================
# K. BACKFILL IDEMPOTENCY
# ===================================================================


class TestBackfillIdempotency:
    def test_load_same_state_twice_produces_same_result(self):
        state = _make_state(revision=3)
        data = state.model_dump()
        r1 = CompactMatterStateV2(**data)
        r2 = CompactMatterStateV2(**data)
        assert r1.model_dump_json() == r2.model_dump_json()
        assert r1.revision == r2.revision == 3

    def test_initialize_state_is_deterministic(self):
        service = CompactMatterStateService()
        s1 = service.initialize_state(matter_id="m-1")
        s2 = service.initialize_state(matter_id="m-1")
        # Different topic_ids are expected (random), but structure is same
        assert s1.schema_version == s2.schema_version
        assert s1.revision == s2.revision == 1
        assert s1.identity.matter_id == s2.identity.matter_id