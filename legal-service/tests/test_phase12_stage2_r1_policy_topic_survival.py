"""Phase 12 Stage 2 R1 — the policy topic survives unpublication and revision changes.

Reviewer finding R1-2: the widget routes rebuilt the model-side topic hint from a
*live* lookup of the bound slug, so once the original policy was archived,
withdrawn or superseded the conversation lost its topic and follow-ups such as
"这项政策" stopped resolving.

These tests consume the exact `frontend_messages` entry the widget now builds
from the persisted binding snapshot and prove that every serving mode's model
input still carries the topic — with the historical revision labelled as a
snapshot and the current revision kept separate.
"""
from __future__ import annotations

from typing import Any

from app.schemas.query import QueryRequest

TOPIC_TEXT = "\n".join(
    [
        "This conversation was created from the Legal Update topic below. Resolve references such as 'this policy' or '这项政策' to that topic. It is topic context only — never proof of current law and never legal evidence. Independently verify the current status and wording in official sources before any substantive legal conclusion.",
        "Topic slug: evisitor-application-arrangements-lin-26-061",
        "Topic title (English): eVisitor application arrangements",
        "Topic title (Chinese): eVisitor 申请安排更新",
        "Official source title: eVisitor application arrangements",
        "Official source URL: https://immi.homeaffairs.gov.au/visas/evisitor",
        "Topic snapshot captured when this conversation was created: revision 3, published 2026-10-01T02:01:00.000Z, publication status announced",
        "The originally referenced publication is not currently available in the published index (it may have been withdrawn, archived or superseded). The conversation topic above is unchanged; verify the current position from official sources and say plainly that the original publication could not be re-confirmed.",
    ]
)

TOPIC_ENTRY = {
    "id": "policy-topic-reference",
    "role": "system",
    "policy_topic_reference": True,
    "text": TOPIC_TEXT,
}


def _frontend_messages(
    *, question: str, extra_history: list[dict[str, Any]] | None = None
):
    """The exact shape the widget routes build: history + one topic entry."""
    return [
        {"id": "u1", "role": "user", "text": "这项政策对我意味着什么？"},
        {"id": "a1", "role": "assistant", "text": "Here is what the update says."},
        *(extra_history or []),
        {"id": "u2", "role": "user", "text": question},
        TOPIC_ENTRY,
    ]

def test_fast_mode_model_input_still_carries_the_removed_publication_topic():
    from app.services.fast_direct_luna_service import FastDirectLunaService

    payload = QueryRequest(
        question="这项政策",
        response_language="zh",
        frontend_messages=_frontend_messages(question="这项政策"),
    )
    model_input = FastDirectLunaService._model_input(payload, payload.question)
    assert "eVisitor application arrangements" in model_input
    assert "这项政策" in model_input
    assert (
        "Topic snapshot captured when this conversation was created: revision 3"
        in model_input
    )
    # The snapshot is explicitly not current law.
    assert "never proof of current law" in model_input
    assert "not currently available in the published index" in model_input


def test_premium_mode_history_still_carries_the_removed_publication_topic():
    from app.services.premium_direct_answer_service import PremiumDirectAnswerService

    service = object.__new__(PremiumDirectAnswerService)
    service.max_history_turns = 8
    service.max_history_chars_per_turn = 1200
    service.max_history_total_chars = 6000
    history = service._history_text(
        _frontend_messages(question="这项政策"),
        latest_question="这项政策",
    )
    assert "eVisitor 申请安排更新" in history
    assert "这项政策" in history
    assert "not currently available in the published index" in history


def test_legacy_default_dialogue_still_carries_the_topic():
    from app.services.conversation_memory_service import ConversationMemoryService

    packet = ConversationMemoryService().build(
        matter=None,
        current_state=object(),
        latest_user_message_raw="这项政策",
        latest_user_message_internal_en="this policy",
        frontend_messages=_frontend_messages(question="这项政策"),
    )
    assert "eVisitor application arrangements" in packet.recent_dialogue_text
    assert (
        "Topic snapshot captured when this conversation was created: revision 3"
        in packet.full_dialogue_text
    )
    # The topic entry must not be replayed as a dialogue turn.
    assert all(
        message.get("policy_topic_reference") is not True
        for message in packet.frontend_messages
    )


def test_a_revised_publication_keeps_both_revisions_distinguishable():
    revised = "\n".join(
        [
            TOPIC_TEXT.split("\n")[0],
            "Topic slug: evisitor-application-arrangements-lin-26-061",
            "Topic title (English): eVisitor application arrangements",
            "Topic title (Chinese): eVisitor 申请安排更新",
            "Official source title: eVisitor application arrangements",
            "Official source URL: https://immi.homeaffairs.gov.au/visas/evisitor",
            "Topic snapshot captured when this conversation was created: revision 3, published 2026-10-01T02:01:00.000Z, publication status announced",
            "Currently published revision of this topic (separate from the conversation snapshot above): revision 5, published 2026-10-20T00:00:00.000Z.",
            "The topic has been revised since this conversation started. The conversation snapshot is not the current revision; check the current revision before relying on any rule, date or status.",
        ]
    )
    messages = _frontend_messages(question="这项政策")
    messages[-1] = {**TOPIC_ENTRY, "text": revised}

    from app.services.fast_direct_luna_service import FastDirectLunaService

    payload = QueryRequest(question="这项政策", frontend_messages=messages)
    model_input = FastDirectLunaService._model_input(payload, payload.question)
    assert "revision 3" in model_input
    assert "revision 5" in model_input
    assert "The conversation snapshot is not the current revision" in model_input


def test_no_topic_entry_means_no_invented_topic():
    from app.services.fast_direct_luna_service import FastDirectLunaService

    payload = QueryRequest(
        question="What is a subclass 485 visa?",
        frontend_messages=[{"id": "u1", "role": "user", "text": "Hello"}],
    )
    model_input = FastDirectLunaService._model_input(payload, payload.question)
    assert "eVisitor" not in model_input
    assert "Topic slug" not in model_input
