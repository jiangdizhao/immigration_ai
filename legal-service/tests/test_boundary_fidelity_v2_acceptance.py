from __future__ import annotations

from app.services.agent_policy_service import AgentPolicyService
from app.services.luna_prompts import LUNA_PROMPT_VERSION, LUNA_SYSTEM_PROMPT_V2


def test_boundary_fidelity_prompt_contract_is_generic_and_gap_driven() -> None:
    prompt = LUNA_SYSTEM_PROMPT_V2.casefold()

    assert "explicit internal or external legal dependency" in prompt
    assert "do not silently ignore" in prompt
    assert "find_mentions" in prompt
    assert "explicit textual references only" in prompt
    assert "does not establish applicability" in prompt
    assert "locator_index_available" in prompt
    assert "law or source is absent" in prompt
    assert "schedule-2 navigation is never legal evidence" in prompt
    assert "exact, current, authoritative evidence" in prompt
    assert "direct conclusion" in prompt
    assert "controlling rule" in prompt
    assert "application" in prompt
    assert "material qualification" in prompt
    assert "fixed combination or sequence" in prompt
    assert "subclass 417" not in prompt
    assert "subclass 186" not in prompt
    assert "417 -> 186" not in prompt
    assert LUNA_PROMPT_VERSION.endswith("b3-default-runtime-governance")


def test_boundary_fidelity_prompt_does_not_change_tool_autonomy() -> None:
    policy = AgentPolicyService().build_policy(mode="default", experiment_arm="N")
    assert policy.tool_choice == "auto"
    tool_names = {tool["name"] for tool in policy.tools if tool.get("type") == "function"}
    assert "schedule2_navigation" in tool_names
    assert "exact_legal_lookup" in tool_names
    assert "flat_rag_search" in tool_names
