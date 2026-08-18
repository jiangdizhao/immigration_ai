"""Phase 5 — Agent policy service.

Concise system/tool policy for the Luna answer agent.

Responsibilities:
- Tool visibility by experiment arm
- No visa-specific routing
- Language behavior
- Research/evidence rules
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.core.config import get_settings
from app.services.luna_prompts import LUNA_SYSTEM_PROMPT_V2, LUNA_PROMPT_VERSION

ExperimentArm = Literal["A", "B", "C", "D"] | None


# ---------------------------------------------------------------------------
# Tool definitions for OpenAI function calling
# ---------------------------------------------------------------------------

SUBMIT_ANSWER_TOOL = {
    "type": "function",
    "name": "submit_answer",
    "description": "Terminal function to submit the completed answer. Must be called exactly once at the end of every response. Claim text must be copied verbatim as a contiguous excerpt from draft_markdown; the backend verifies and derives its span.",
    "strict": False,
    "parameters": {
        "type": "object",
        "properties": {
            "schema_version": {
                "type": "string",
                "enum": ["agent_submission.v2"],
                "description": "Schema version identifier",
            },
            "answer_class": {
                "type": "string",
                "enum": ["general", "procedural", "substantive_legal", "safety_blocked"],
                "description": "Classification of the answer",
            },
            "draft_markdown": {
                "type": "string",
                "description": "The complete answer in Markdown format",
            },
            "as_of_date": {
                "type": "string",
                "description": "ISO date (YYYY-MM-DD) the answer is current as of, or null",
            },
            "claims": {
                "type": "array",
                "description": "Typed claims with evidence references. For each claim, text must be an exact contiguous excerpt from draft_markdown; do not paraphrase. Use an empty array for general/procedural answers without claims.",
                "items": {
                    "type": "object",
                    "properties": {
                        "claim_id": {"type": "string"},
                        "claim_type": {
                            "type": "string",
                            "enum": ["general", "legal_rule", "legal_application", "procedure", "current_fact", "calculation"],
                        },
                        "materiality": {
                            "type": "string",
                            "enum": ["decisive", "supporting"],
                        },
                        "text": {"type": "string", "description": "Exact contiguous excerpt copied from draft_markdown; never a paraphrase"},
                        "draft_start": {"type": "integer", "minimum": 0, "description": "Advisory offset; backend derives and validates the authoritative span"},
                        "draft_end": {"type": "integer", "minimum": 0, "description": "Advisory offset; backend derives and validates the authoritative span"},
                        "evidence_refs": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["claim_id", "claim_type", "materiality", "text", "draft_start", "draft_end", "evidence_refs"],
                    "additionalProperties": False,
                },
            },
            "citations": {
                "type": "array",
                "description": "Citations with evidence refs and display labels",
                "items": {
                    "type": "object",
                    "properties": {
                        "evidence_ref": {"type": "string"},
                        "display_label": {"type": "string"},
                    },
                    "required": ["evidence_ref", "display_label"],
                    "additionalProperties": False,
                },
            },
            "research_status": {
                "type": "string",
                "enum": ["not_required", "complete", "incomplete"],
                "description": "Status of legal research",
            },
            "state_patch": {
                "type": "array",
                "description": "Proposed state updates (shadow only, not applied to real Matter)",
                "items": {"type": "object"},
            },
        },
        "required": ["schema_version", "answer_class", "draft_markdown", "claims", "citations", "research_status", "state_patch"],
        "additionalProperties": False,
    },
}

DETERMINISTIC_UTILITY_TOOL = {
    "type": "function",
    "name": "deterministic_utility",
    "description": "Perform arithmetic, date, percentage, or unit calculations. Use for any computation — never guess a number or date.",
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "operation": {
                "type": "string",
                "enum": ["arithmetic", "percentage", "date_add", "date_difference", "unit_convert"],
            },
            "operands": {
                "type": "array",
                "items": {
                    "anyOf": [
                        {"type": "string"},
                        {"type": "number"},
                    ]
                },
                "minItems": 1,
                "maxItems": 20,
            },
            "expression": {"anyOf": [{"type": "string"}, {"type": "null"}]},
            "calendar": {
                "type": "string",
                "enum": ["calendar_days", "business_days"],
            },
            "timezone": {
                "type": "string",
                "enum": ["Australia/Sydney"],
            },
            "rounding": {
                "type": "string",
                "enum": ["none", "floor", "ceil", "half_up"],
            },
            "precision": {"type": "integer", "minimum": 0, "maximum": 12},
        },
        "required": ["operation", "operands", "expression", "calendar", "timezone", "rounding", "precision"],
        "additionalProperties": False,
    },
}

FLAT_RAG_SEARCH_TOOL = {
    "type": "function",
    "name": "flat_rag_search",
    "description": "Search the local canonical legal corpus for relevant provisions, schedules, and guidance. Returns exact source spans with evidence references.",
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query for legal content"},
            "top_k": {
                "anyOf": [
                    {"type": "integer", "minimum": 1, "maximum": 20},
                    {"type": "null"},
                ],
                "description": "Number of results to return, or null for the configured default",
            },
            "preferred_source_types": {
                "anyOf": [
                    {"type": "array", "items": {"type": "string"}},
                    {"type": "null"},
                ],
                "description": "Optional source-type filters, or null when no filter is requested",
            },
        },
        # OpenAI strict function schemas require every declared property to be
        # present in required. Nullable fields preserve optional semantics.
        "required": ["query", "top_k", "preferred_source_types"],
        "additionalProperties": False,
    },
}

# OpenAI built-in web search tool reference
WEB_SEARCH_TOOL = {
    "type": "web_search",
    "search_context_size": "medium",
}


@dataclass(slots=True)
class AgentPolicy:
    """Policy configuration for a single agent execution."""

    system_prompt: str
    prompt_version: str
    model: str
    tools: list[dict[str, Any]]
    tool_choice: Literal["auto"] = "auto"
    experiment_arm: ExperimentArm = None
    max_tool_rounds: int = 2
    max_provider_calls: int = 3
    max_retries: int = 1


class AgentPolicyService:
    """Deterministic agent policy service.

    Selects tools and configuration based on mode and experiment arm.
    No LLM calls, no semantic routing, no visa-specific logic.
    """

    def build_policy(
        self,
        *,
        mode: Literal["default", "premium"],
        experiment_arm: ExperimentArm = None,
    ) -> AgentPolicy:
        """Build agent policy for the given mode and experiment arm.

        Returns AgentPolicy with appropriate tools and configuration.
        """
        settings = get_settings()

        if mode == "premium":
            # Premium: web search + utility + submit only
            tools = [WEB_SEARCH_TOOL, DETERMINISTIC_UTILITY_TOOL, SUBMIT_ANSWER_TOOL]
            model = settings.premium_agent_model
        else:
            # Default: tools depend on experiment arm
            tools = self._build_default_tools(experiment_arm)
            model = settings.default_agent_model

        return AgentPolicy(
            system_prompt=LUNA_SYSTEM_PROMPT_V2,
            prompt_version=LUNA_PROMPT_VERSION,
            model=model,
            tools=tools,
            tool_choice="auto",
            experiment_arm=experiment_arm,
            max_tool_rounds=settings.agent_max_tool_rounds,
            max_provider_calls=settings.agent_max_provider_calls,
            max_retries=settings.agent_max_retries,
        )

    def _build_default_tools(self, experiment_arm: ExperimentArm) -> list[dict[str, Any]]:
        """Build tool list for default mode based on experiment arm.

        Arm A: web_search + deterministic_utility + submit_answer
        Arm B: web_search + flat_rag_search + deterministic_utility + submit_answer
        """
        settings = get_settings()

        if experiment_arm == "B":
            # Arm B: web + flat RAG + utility + submit
            tools = [WEB_SEARCH_TOOL]
            if settings.flat_rag_tool_enabled:
                tools.append(FLAT_RAG_SEARCH_TOOL)
            tools.extend([DETERMINISTIC_UTILITY_TOOL, SUBMIT_ANSWER_TOOL])
            return tools

        # Arm A (default): web + utility + submit
        return [WEB_SEARCH_TOOL, DETERMINISTIC_UTILITY_TOOL, SUBMIT_ANSWER_TOOL]

    def get_tool_names(self, policy: AgentPolicy) -> list[str]:
        """Extract tool names from policy for observability."""
        names: list[str] = []
        for tool in policy.tools:
            name = tool.get("name") or tool.get("type")
            if name:
                names.append(name)
        return names


def create_agent_policy_service() -> AgentPolicyService:
    """Create a new agent policy service."""
    return AgentPolicyService()
