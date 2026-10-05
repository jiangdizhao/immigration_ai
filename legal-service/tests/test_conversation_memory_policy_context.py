from types import SimpleNamespace

from app.services.conversation_memory_service import ConversationMemoryService


def test_policy_topic_context_is_used_but_not_added_to_frontend_history():
    question = "How might this affect me?"
    policy_hint = "Topic reference only. Policy title: Example update."
    packet = ConversationMemoryService().build(
        matter=SimpleNamespace(id="matter-1", session_id="session-1"),
        current_state=SimpleNamespace(
            conversation_history=[{"role": "user", "content": "Earlier question"}],
            carried_intake_facts={},
        ),
        latest_user_message_raw=question,
        latest_user_message_internal_en=question,
        frontend_messages=[
            {
                "role": "system",
                "policy_topic_reference": True,
                "text": policy_hint,
            },
            {"role": "user", "text": question},
        ],
    )

    assert policy_hint in packet.full_dialogue_text
    assert packet.latest_user_message_raw == question
    assert all(message.get("policy_topic_reference") is not True for message in packet.frontend_messages)
    assert all(message.get("policy_topic_reference") is not True for message in packet.full_conversation_history)
