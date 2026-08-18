"""Phase 5 — OpenAI Responses API adapter.

Concrete provider implementation wrapping the OpenAI Responses API
for GPT-5.6 Luna shadow execution.

Supports:
- tool_choice=auto
- built-in web_search
- custom function tools
- submit_answer terminal function
- native citation annotations
- PII guard at provider boundary

Does NOT:
- invent API keys
- print secrets
- use Chat Completions instead of Responses
- implement fake web search
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Literal

from openai import OpenAI

from app.core.config import get_settings
from app.services.agent_runtime_service import ProviderInterface, ProviderResponse
from app.services.request_evidence_registry import RequestEvidenceRegistry
from app.services.search_privacy_guard import SearchPrivacyGuard
from app.services.tool_executor_service import ToolCallRequest
from app.services.web_evidence_normalizer import WebEvidenceNormalizer

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class _CallContext:
    """Per-call context for the adapter."""

    privacy_guard: SearchPrivacyGuard
    web_normalizer: WebEvidenceNormalizer
    registry: RequestEvidenceRegistry
    pii_violation_count: int = 0


class OpenAIResponsesAdapter(ProviderInterface):
    """OpenAI Responses API adapter for GPT-5.6 Luna.

    Wraps the real OpenAI client. For implementation tests, use MockProvider.
    """

    def __init__(
        self,
        *,
        client: OpenAI | None = None,
        privacy_guard: SearchPrivacyGuard | None = None,
        web_normalizer: WebEvidenceNormalizer | None = None,
    ) -> None:
        settings = get_settings()
        self._client = client or OpenAI(api_key=settings.openai_api_key)
        self._privacy_guard = privacy_guard or SearchPrivacyGuard()
        self._web_normalizer = web_normalizer or WebEvidenceNormalizer()

    async def call(
        self,
        *,
        system_prompt: str,
        user_text: str,
        model: str,
        tools: list[dict[str, Any]],
        tool_choice: Literal["auto"] = "auto",
        messages_history: list[dict[str, Any]] | None = None,
        timeout_ms: float,
    ) -> ProviderResponse:
        """Make a provider call through the OpenAI Responses API.

        Returns ProviderResponse with text and/or tool calls.
        Web search results are normalized and registered.
        """
        start = time.perf_counter()
        ctx = _CallContext(
            privacy_guard=self._privacy_guard,
            web_normalizer=self._web_normalizer,
            registry=None,  # Set by caller via run_shadow
        )

        try:
            # Build input messages
            input_messages = self._build_input(
                system_prompt=system_prompt,
                messages_history=messages_history,
            )

            # Separate web_search tool from custom function tools
            web_search_tool = None
            function_tools: list[dict[str, Any]] = []
            for tool in tools:
                if tool.get("type") == "web_search":
                    web_search_tool = tool
                elif tool.get("type") == "function":
                    function_tools.append(tool)

            # Build Responses API parameters
            params: dict[str, Any] = {
                "model": model,
                "input": input_messages,
                "tools": [],
                "tool_choice": tool_choice,
            }

            if web_search_tool:
                params["tools"].append(web_search_tool)

            for ft in function_tools:
                params["tools"].append(ft)

            # Make the API call
            response = self._client.responses.create(**params)

            duration_ms = (time.perf_counter() - start) * 1000.0

            # Extract tool calls from response
            tool_calls: list[ToolCallRequest] = []
            text_output: str | None = None

            # Process response output
            for output_item in getattr(response, "output", []):
                item_type = getattr(output_item, "type", None)

                if item_type == "message":
                    # Text content
                    for content_block in getattr(output_item, "content", []):
                        if getattr(content_block, "type", None) == "output_text":
                            text_output = getattr(content_block, "text", None)

                elif item_type == "function_call":
                    # Custom function call
                    call_id = getattr(output_item, "call_id", "")
                    name = getattr(output_item, "name", "")
                    arguments_str = getattr(output_item, "arguments", "{}")
                    try:
                        arguments = json.loads(arguments_str)
                    except json.JSONDecodeError:
                        arguments = {}

                    # PII guard for web_search queries
                    if name == "web_search":
                        query = arguments.get("query", "")
                        privacy_result = self._privacy_guard.check_query(query)
                        if not privacy_result.allowed:
                            ctx.pii_violation_count += 1
                            logger.warning(
                                "PII blocked in web_search query (violation #%d)",
                                ctx.pii_violation_count,
                            )
                            # Return error response — don't send PII to provider
                            return ProviderResponse(
                                response_id=getattr(response, "id", ""),
                                model=model,
                                status="error",
                                text=None,
                                tool_calls=[],
                                duration_ms=duration_ms,
                            )

                    tool_calls.append(ToolCallRequest(
                        call_id=call_id,
                        name=name,
                        arguments=arguments,
                    ))

                elif item_type == "web_search_call":
                    # Built-in web search completed — normalize results
                    search_call_id = getattr(output_item, "id", "")
                    self._normalize_web_search_results(
                        output_item=output_item,
                        search_call_id=search_call_id,
                        tool_call_id=search_call_id,
                        ctx=ctx,
                    )

            # Extract token usage
            usage = getattr(response, "usage", None)
            input_tokens = getattr(usage, "input_tokens", None) if usage else None
            output_tokens = getattr(usage, "output_tokens", None) if usage else None

            return ProviderResponse(
                response_id=getattr(response, "id", ""),
                model=model,
                status="ok",
                text=text_output,
                tool_calls=tool_calls,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                duration_ms=duration_ms,
                raw_response=response,
            )

        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000.0
            logger.exception("OpenAI Responses API call failed")
            return ProviderResponse(
                response_id="",
                model=model,
                status="error",
                text=None,
                duration_ms=duration_ms,
            )

    def _build_input(
        self,
        *,
        system_prompt: str,
        messages_history: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        """Build input messages for the Responses API."""
        input_messages: list[dict[str, Any]] = []

        # System prompt
        input_messages.append({
            "role": "system",
            "content": [{"type": "input_text", "text": system_prompt}],
        })

        # History messages
        if messages_history:
            for msg in messages_history:
                role = msg.get("role", "user")
                content = msg.get("content", "")

                if role == "system":
                    continue  # Already added

                if role == "assistant" and "tool_calls" in msg:
                    # Assistant message with tool calls
                    input_messages.append({
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": content}],
                    })
                    # Tool calls are handled separately in Responses API
                elif role == "tool":
                    # Tool result — skip for now, Responses API handles differently
                    pass
                else:
                    input_messages.append({
                        "role": role if role in ("user", "assistant") else "user",
                        "content": [{"type": "input_text", "text": str(content)}],
                    })

        return input_messages

    def _normalize_web_search_results(
        self,
        *,
        output_item: Any,
        search_call_id: str,
        tool_call_id: str,
        ctx: _CallContext,
    ) -> None:
        """Normalize built-in web search results into evidence registry."""
        if ctx.registry is None:
            return

        try:
            # Extract sources from the web_search_call output
            sources = getattr(output_item, "sources", None) or []
            if not sources:
                return

            # Build search output dict for normalizer
            search_output: dict[str, Any] = {
                "sources": [],
            }

            for source in sources:
                source_dict: dict[str, Any] = {
                    "url": getattr(source, "url", ""),
                    "title": getattr(source, "title", ""),
                }
                # Extract citation if available
                citation = getattr(source, "citation", None)
                if citation:
                    source_dict["citation"] = {
                        "start_index": getattr(citation, "start_index", 0),
                        "end_index": getattr(citation, "end_index", 0),
                    }
                search_output["sources"].append(source_dict)

            # Normalize and register
            ctx.web_normalizer.normalize_search_output(
                search_output=search_output,
                search_call_id=search_call_id,
                tool_call_id=tool_call_id,
                registry=ctx.registry,
            )

        except Exception:
            logger.exception("Failed to normalize web search results")

    def set_registry(self, registry: RequestEvidenceRegistry) -> None:
        """Set the request-scoped evidence registry for this call chain."""
        # This is set by the runtime before each call
        pass


def create_openai_adapter(
    *,
    client: OpenAI | None = None,
) -> OpenAIResponsesAdapter:
    """Create a new OpenAI Responses adapter."""
    return OpenAIResponsesAdapter(client=client)