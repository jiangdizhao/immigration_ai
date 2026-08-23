"""Phase 5 — Agent policy service.

Concise system/tool policy for the Luna answer agent.

Responsibilities:
- Tool visibility by experiment arm
- No visa-specific routing
- Language behavior
- Research/evidence rules
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Literal

from app.core.config import get_settings
from app.services.luna_prompts import LUNA_SYSTEM_PROMPT_V2, LUNA_PROMPT_VERSION

ExperimentArm = Literal["A", "B", "L", "N", "C", "D"] | None
ReasoningEffort = Literal["none", "low", "medium", "high"]


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
                        "native_web_locators": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {"url": {"type": "string", "pattern": "^https://", "maxLength": 2000}},
                                "required": ["url"],
                                "additionalProperties": False,
                            },
                        },
                        "depends_on": {
                            "type": "array",
                            "items": {"type": "string"},
                            "maxItems": 30,
                            "description": "Claim IDs of material premises required by this claim",
                        },
                    },
                    "required": ["claim_id", "claim_type", "materiality", "text", "draft_start", "draft_end"],
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
                        "native_web_locator": {
                            "type": "object",
                            "properties": {"url": {"type": "string", "pattern": "^https://", "maxLength": 2000}},
                            "required": ["url"],
                            "additionalProperties": False,
                        },
                        "display_label": {"type": "string"},
                    },
                    "required": ["display_label"],
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

SCHEDULE2_NAVIGATION_TOOL = {
    "type": "function",
    "name": "schedule2_navigation",
    "description": (
        "Read-only structural navigation over the experimental Schedule-2 sidecar. "
        "Returns explicit clause/reference targets and local resolution metadata "
        "as navigation hints only. It never returns legal evidence and cannot "
        "establish eligibility, applicability, or a pathway. Use exact_legal_lookup "
        "to obtain genuine source evidence for a target."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "requests": {
                "type": "array",
                "minItems": 1,
                "maxItems": 8,
                "items": {
                    "type": "object",
                    "properties": {
                        "operation": {
                            "type": "string",
                            "enum": ["subclass_map", "provision_context", "follow_references"],
                        },
                        "subclass": {"anyOf": [{"type": "string", "maxLength": 20}, {"type": "null"}]},
                        "provision_ref": {"anyOf": [{"type": "string", "maxLength": 255}, {"type": "null"}]},
                        "max_targets": {"type": "integer", "minimum": 1, "maximum": 30},
                    },
                    "required": ["operation", "subclass", "provision_ref", "max_targets"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["requests"],
        "additionalProperties": False,
    },
}

EXACT_LEGAL_LOOKUP_TOOL = {
    "type": "function",
    "name": "exact_legal_lookup",
    "description": (
        "Look up exact local legal source content for up to 8 known locators. "
        "The backend owns the request date, database session, and opaque evidence "
        "refs. Preserve available_complete, available_partial, absent, unknown, "
        "and unresolved cross-reference states; local absence never proves that "
        "law does not exist. Returned evidence_refs are genuine request-scoped "
        "refs and may be used in submit_answer."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "requests": {
                "type": "array",
                "minItems": 1,
                "maxItems": 8,
                "items": {
                    "type": "object",
                    "properties": {
                        "query": {"anyOf": [{"type": "string", "maxLength": 2000}, {"type": "null"}]},
                        "document_id": {"anyOf": [{"type": "string", "maxLength": 500}, {"type": "null"}]},
                        "source_types": {"type": "array", "items": {"type": "string"}, "maxItems": 20},
                        "schedule": {"anyOf": [{"type": "string", "maxLength": 100}, {"type": "null"}]},
                        "provision": {"anyOf": [{"type": "string", "maxLength": 255}, {"type": "null"}]},
                        "case_citation": {"anyOf": [{"type": "string", "maxLength": 500}, {"type": "null"}]},
                        "subclass": {"anyOf": [{"type": "string", "maxLength": 50}, {"type": "null"}]},
                        "follow_cross_references": {"type": "boolean"},
                        "max_hits": {"type": "integer", "minimum": 1, "maximum": 20},
                    },
                    "required": [
                        "query", "document_id", "source_types", "schedule", "provision",
                        "case_citation", "subclass", "follow_cross_references", "max_hits",
                    ],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["requests"],
        "additionalProperties": False,
    },
}

# OpenAI built-in web search tool reference
WEB_SEARCH_TOOL = {
    "type": "web_search",
    "search_context_size": "medium",
}


def build_submit_answer_tool(
    *,
    allow_canonical_refs: bool = True,
    lightweight_claims: bool = False,
) -> dict[str, Any]:
    """Build the model-facing terminal contract for an evidence context.

    Arms A and L do not expose model-authored canonical evidence bookkeeping in
    their initial answer contracts. Arm L is normalized further by the backend
    and the checker selects final support refs. Arm B and callers with genuine
    custom evidence tools retain canonical-ref fields.
    """

    tool = deepcopy(SUBMIT_ANSWER_TOOL)
    if allow_canonical_refs:
        return tool

    claims = tool["parameters"]["properties"]["claims"]["items"]["properties"]
    claims["evidence_refs"] = {
        "type": "array",
        "maxItems": 0,
        "items": {"type": "string"},
        "description": "Not available in this lightweight arm; backend/checker owns evidence associations.",
    }
    citations = tool["parameters"]["properties"]["citations"]["items"]["properties"]
    citations.pop("evidence_ref", None)
    if lightweight_claims:
        claims.pop("evidence_refs", None)
        claims.pop("native_web_locators", None)
        citations.pop("native_web_locator", None)
        claim_required = tool["parameters"]["properties"]["claims"]["items"]["required"]
        if "text" in claim_required:
            claim_required.remove("text")
    tool["description"] = (
        f"{tool['description']} Lightweight evidence contract: do not furnish canonical "
        "evidence_refs or citation evidence_ref values. For provider-native web "
        "sources, use only observed native_web_locators; the backend resolves "
        "them within this request."
    )
    return tool


ARM_A_NATIVE_WEB_PROMPT_SUFFIX = """

## Arm-A Evidence Contract
- This run has provider-native web search but no custom tool that gives you canonical evidence refs.
- Do not write or guess `web:<opaque>` or `exact:<opaque>` values in `evidence_refs` or citation `evidence_ref`.
- For a provider source you observed in this request, use its observed HTTPS URL only as `native_web_locators: [{"url": "..."}]`.
- The backend resolves that locator to a request-scoped canonical ref. Never use a URL in an evidence-ref field.
"""

ARM_L_LIGHTWEIGHT_PROMPT_SUFFIX = """

## Arm-L Lightweight Submission Contract
- Submit the draft and material claim structure only.
- Do not construct claim evidence_refs or final citation evidence_ref values.
- The backend and compact checker own request-scoped evidence associations.
- Include depends_on claim IDs for material conclusions and keep claim locations addressable in the draft.
"""


@dataclass(slots=True)
class AgentPolicy:
    """Policy configuration for a single agent execution."""

    system_prompt: str
    prompt_version: str
    model: str
    tools: list[dict[str, Any]]
    tool_choice: Literal["auto"] = "auto"
    # Phase 5.1A explicit reasoning effort for the default (Luna) agent.
    # Baseline-preserving default is "medium". Passed verbatim to the
    # OpenAI Responses request as reasoning.effort.
    reasoning_effort: ReasoningEffort = "medium"
    experiment_arm: ExperimentArm = None
    max_tool_rounds: int = 2
    max_provider_calls: int = 3
    max_retries: int = 1
    max_flat_rag_calls: int = 1
    retry_viability_threshold_ms: int = 8000


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

        system_prompt = LUNA_SYSTEM_PROMPT_V2
        prompt_version = LUNA_PROMPT_VERSION
        if mode == "default" and experiment_arm == "A":
            system_prompt += ARM_A_NATIVE_WEB_PROMPT_SUFFIX
            prompt_version = f"{LUNA_PROMPT_VERSION}.arm-a-native-locator"
        elif mode == "default" and experiment_arm == "L":
            system_prompt += ARM_L_LIGHTWEIGHT_PROMPT_SUFFIX
            prompt_version = f"{LUNA_PROMPT_VERSION}.arm-l-lightweight"

        return AgentPolicy(
            system_prompt=system_prompt,
            prompt_version=prompt_version,
            model=model,
            tools=tools,
            tool_choice="auto",
            # Phase 5.1A: explicit, configurable reasoning effort. The default is
            # "medium" so introducing the field does not change inference behavior.
            reasoning_effort=settings.default_agent_reasoning_effort,
            experiment_arm=experiment_arm,
            max_tool_rounds=settings.agent_max_tool_rounds,
            max_provider_calls=settings.agent_max_provider_calls,
            max_retries=settings.agent_max_retries,
            max_flat_rag_calls=settings.agent_max_flat_rag_calls,
            retry_viability_threshold_ms=settings.agent_retry_viability_threshold_ms,
        )

    def _build_default_tools(self, experiment_arm: ExperimentArm) -> list[dict[str, Any]]:
        """Build tool list for default mode based on experiment arm.

        Arm A: web_search + deterministic_utility + native-locator submit
        Arm B: historical web_search + flat_rag_search + utility + submit
        Arm L: revised web_search + flat_rag_search + lightweight submit
        Arm N: Arm-L research baseline + bounded Schedule-2 navigation and exact lookup
        """
        settings = get_settings()

        if experiment_arm in {"B", "L", "N"}:
            # Arm B and revised Default local+web arm L: web + local retrieval
            # + utility + submit. The implementation is shared; the arm names
            # preserve historical B results while making the revised target
            # explicit.
            tools = [WEB_SEARCH_TOOL]
            if settings.flat_rag_tool_enabled:
                tools.append(FLAT_RAG_SEARCH_TOOL)
            if experiment_arm == "N":
                tools.extend([SCHEDULE2_NAVIGATION_TOOL, EXACT_LEGAL_LOOKUP_TOOL])
            tools.extend([
                DETERMINISTIC_UTILITY_TOOL,
                build_submit_answer_tool(
                    allow_canonical_refs=experiment_arm in {"B", "N"},
                    lightweight_claims=experiment_arm == "L",
                ),
            ])
            return tools

        # Arm A (default): web + utility + submit
        return [
            WEB_SEARCH_TOOL,
            DETERMINISTIC_UTILITY_TOOL,
            build_submit_answer_tool(allow_canonical_refs=experiment_arm != "A"),
        ]

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
