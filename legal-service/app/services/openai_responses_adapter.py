"""Phase 5 — OpenAI Responses API adapter.

Concrete provider implementation wrapping the OpenAI Responses API
for GPT-5.6 Luna shadow execution.

Supports:
- tool_choice=auto
- built-in web_search (provider-native, NOT a custom function)
- custom function tools (navigation, exact lookup, deterministic utility,
  flat RAG, submit_answer)
- native citation annotations from assistant message output_text
- PII inspection of generated search-action queries (retroactive gate)
- Responses continuation via previous_response_id

Does NOT:
- invent API keys
- print secrets
- use Chat Completions instead of Responses
- implement fake web search
- treat web_search as a custom function_call
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.services.agent_runtime_service import ProviderInterface, ProviderResponse
from app.services.request_evidence_registry import RequestEvidenceRegistry
from app.services.search_privacy_guard import SearchPrivacyGuard
from app.services.tool_executor_service import ToolCallRequest
from app.services.web_evidence_normalizer import WebEvidenceNormalizer

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class AdapterCallContext:
    """Per-call context carrying the request-scoped registry and guards."""

    registry: RequestEvidenceRegistry
    privacy_guard: SearchPrivacyGuard
    web_normalizer: WebEvidenceNormalizer
    pii_violation_count: int = 0
    # Phase 5.1A.1: content-free aggregated violation category counts.
    # Keys are stable guard categories (name_indicator, phone, ...); values are
    # counts.  Never stores raw query text, snippets, hashes, names, or values.
    search_privacy_violation_categories: dict[str, int] = field(default_factory=dict)
    # Collected first and normalized after the complete provider output is
    # available.  This lets action.sources records inherit a real URL
    # citation annotation without registering a second record for the same
    # URL, and lets us retain the actual search-call provenance.
    search_call_ids: list[str] = field(default_factory=list)
    native_sources: list[dict[str, Any]] = field(default_factory=list)
    citation_annotations: list[dict[str, Any]] = field(default_factory=list)


class OpenAIResponsesAdapter(ProviderInterface):
    """OpenAI Responses API adapter for GPT-5.6 Luna.

    Wraps the real OpenAI client.  For implementation tests, inject MockProvider
    via dependency injection — there is NO automatic production fallback.
    """

    def __init__(
        self,
        *,
        client: OpenAI | None = None,
        privacy_guard: SearchPrivacyGuard | None = None,
        web_normalizer: WebEvidenceNormalizer | None = None,
    ) -> None:
        settings = get_settings()
        self._client = client or OpenAI(api_key=settings.openai_api_key, max_retries=0)
        self._privacy_guard = privacy_guard or SearchPrivacyGuard()
        self._web_normalizer = web_normalizer or WebEvidenceNormalizer()

    async def call(
        self,
        *,
        system_prompt: str,
        user_text: str,
        model: str,
        tools: list[dict[str, Any]],
        tool_choice: str | dict[str, Any] = "auto",
        reasoning_effort: str | None = None,
        messages_history: list[dict[str, Any]] | None = None,
        timeout_ms: float,
        registry: RequestEvidenceRegistry | None = None,
        previous_response_id: str | None = None,
    ) -> ProviderResponse:
        """Make a provider call through the OpenAI Responses API."""
        start = time.perf_counter()

        if registry is None:
            return ProviderResponse(
                response_id="", model=model, status="error", text=None, duration_ms=0,
            )

        ctx = AdapterCallContext(
            registry=registry,
            privacy_guard=self._privacy_guard,
            web_normalizer=self._web_normalizer,
        )

        try:
            input_items = self._build_input(
                system_prompt=system_prompt,
                messages_history=messages_history,
                previous_response_id=previous_response_id,
            )

            web_search_tool = None
            function_tools: list[dict[str, Any]] = []
            for tool in tools:
                if tool.get("type") == "web_search":
                    web_search_tool = tool
                elif tool.get("type") == "function":
                    function_tools.append(tool)

            params: dict[str, Any] = {
                "model": model, "input": input_items, "tools": [], "tool_choice": tool_choice,
            }
            # Phase 5.1A: explicitly send the configured reasoning effort (default
            # "medium" for Luna). This is a calibration feature, not a hidden
            # inference change; the default preserves the current baseline.
            if reasoning_effort:
                params["reasoning"] = {"effort": reasoning_effort}
            if web_search_tool:
                params["tools"].append(web_search_tool)
                # The Responses API returns the complete provider source list
                # only when this explicit include is requested.
                params["include"] = ["web_search_call.action.sources"]
            for ft in function_tools:
                params["tools"].append(ft)
            if previous_response_id:
                params["previous_response_id"] = previous_response_id
            if timeout_ms > 0:
                params["timeout"] = timeout_ms / 1000.0

            response = self._client.responses.create(**params)
            duration_ms = (time.perf_counter() - start) * 1000.0

            custom_tool_calls: list[ToolCallRequest] = []
            text_output: str | None = None
            response_id = getattr(response, "id", "")

            for output_item in getattr(response, "output", []):
                item_type = getattr(output_item, "type", None)
                if item_type == "message":
                    text_output = self._extract_message_text(output_item)
                    self._normalize_message_citations(output_item, ctx)
                elif item_type == "function_call":
                    tc = self._parse_function_call(output_item)
                    if tc is not None:
                        custom_tool_calls.append(tc)
                elif item_type == "web_search_call":
                    self._handle_web_search_call(output_item, ctx)

            self._register_native_web_evidence(ctx)

            if ctx.pii_violation_count:
                return ProviderResponse(
                    response_id=response_id, model=model, status="error",
                    text=None, tool_calls=[], duration_ms=duration_ms,
                    raw_response=response,
                    pii_violation_count=ctx.pii_violation_count,
                    search_privacy_violation_categories=dict(ctx.search_privacy_violation_categories),
                    effort=reasoning_effort,
                    native_web_search_call_count=len(ctx.search_call_ids),
                    native_web_source_count=len(ctx.native_sources),
                    native_web_citation_count=len(ctx.citation_annotations),
                )

            usage = getattr(response, "usage", None)
            input_tokens = getattr(usage, "input_tokens", None) if usage else None
            output_tokens = getattr(usage, "output_tokens", None) if usage else None
            input_details = getattr(usage, "input_tokens_details", None) if usage else None
            output_details = getattr(usage, "output_tokens_details", None) if usage else None
            cached_input_tokens = (
                getattr(input_details, "cached_tokens", None) if input_details else None
            )
            reasoning_tokens = (
                getattr(output_details, "reasoning_tokens", None) if output_details else None
            )

            return ProviderResponse(
                response_id=response_id, model=model, status="ok",
                text=text_output, tool_calls=custom_tool_calls,
                input_tokens=input_tokens, cached_input_tokens=cached_input_tokens,
                reasoning_tokens=reasoning_tokens, output_tokens=output_tokens,
                duration_ms=duration_ms, raw_response=response,
                pii_violation_count=ctx.pii_violation_count,
                search_privacy_violation_categories=dict(ctx.search_privacy_violation_categories),
                effort=reasoning_effort,
                native_web_search_call_count=len(ctx.search_call_ids),
                native_web_source_count=len(ctx.native_sources),
                native_web_citation_count=len(ctx.citation_annotations),
            )
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000.0
            logger.exception("OpenAI Responses API call failed")
            return ProviderResponse(
                response_id="", model=model, status="error", text=None,
                duration_ms=duration_ms, pii_violation_count=ctx.pii_violation_count,
                search_privacy_violation_categories=dict(ctx.search_privacy_violation_categories),
                effort=reasoning_effort,
                native_web_search_call_count=len(ctx.search_call_ids),
                native_web_source_count=len(ctx.native_sources),
                native_web_citation_count=len(ctx.citation_annotations),
            )

    def _build_input(
        self,
        *,
        system_prompt: str,
        messages_history: list[dict[str, Any]] | None,
        previous_response_id: str | None = None,
    ) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        if not previous_response_id:
            items.append({"role": "system", "content": [{"type": "input_text", "text": system_prompt}]})
        if not messages_history:
            return items
        if previous_response_id:
            latest_user_message: dict[str, Any] | None = None
            for message in messages_history:
                if message.get("role") == "user":
                    latest_user_message = message
            for message in messages_history:
                if message.get("role") == "tool":
                    call_id = message.get("tool_call_id")
                    if call_id:
                        items.append({
                            "type": "function_call_output",
                            "call_id": call_id,
                            "output": str(message.get("content") or ""),
                        })
            if latest_user_message is not None and not any(
                message.get("role") == "tool" for message in messages_history
            ):
                items.append({
                    "role": "user",
                    "content": [{"type": "input_text", "text": str(latest_user_message.get("content") or "")}],
                })
            return items
        for msg in messages_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                continue
            if role == "assistant" and "tool_calls" in msg:
                continue
            elif role == "tool":
                call_id = msg.get("tool_call_id")
                if call_id:
                    items.append({
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": str(content),
                    })
            else:
                items.append({"role": role if role in ("user", "assistant") else "user",
                              "content": [{"type": "input_text", "text": str(content)}]})
        return items

    @staticmethod
    def _extract_message_text(message_item: Any) -> str | None:
        for content_block in getattr(message_item, "content", []):
            if getattr(content_block, "type", None) == "output_text":
                return getattr(content_block, "text", None)
        return None

    @staticmethod
    def _parse_function_call(item: Any) -> ToolCallRequest | None:
        call_id = getattr(item, "call_id", "")
        name = getattr(item, "name", "")
        arguments_str = getattr(item, "arguments", "{}")
        try:
            arguments = json.loads(arguments_str)
        except json.JSONDecodeError:
            arguments = {}
        if not call_id or not name:
            return None
        return ToolCallRequest(call_id=call_id, name=name, arguments=arguments)

    def _handle_web_search_call(self, item: Any, ctx: AdapterCallContext) -> None:
        search_call_id = getattr(item, "id", "")
        if search_call_id:
            ctx.search_call_ids.append(search_call_id)
        action = getattr(item, "action", None)
        if action is not None:
            queries = getattr(action, "queries", None) or []
            for q in queries:
                if isinstance(q, str):
                    result = ctx.privacy_guard.check_query(q)
                    if not result.allowed:
                        ctx.pii_violation_count += 1
                        for category, count in result.violation_categories.items():
                            ctx.search_privacy_violation_categories[category] = (
                                ctx.search_privacy_violation_categories.get(category, 0) + count
                            )
                        logger.warning("PII detected in generated web_search query (violation #%d)", ctx.pii_violation_count)

        # In the current Responses SDK, sources are nested under
        # web_search_call.action.sources.  Keep a top-level fallback for
        # older/fixture response shapes.
        sources = getattr(action, "sources", None) or getattr(item, "sources", None) or []
        for source in sources:
            source_dict = self._provider_object_to_dict(source)
            if source_dict.get("url"):
                source_dict["search_call_id"] = search_call_id
                ctx.native_sources.append(source_dict)

    def _normalize_message_citations(self, message_item: Any, ctx: AdapterCallContext) -> None:
        for content_block in getattr(message_item, "content", []):
            annotations = getattr(content_block, "annotations", None) or []
            for ann in annotations:
                ann_type = getattr(ann, "type", None)
                if ann_type == "url_citation":
                    ann_dict = self._provider_object_to_dict(ann)
                    nested = ann_dict.get("url_citation")
                    if isinstance(nested, dict):
                        ann_dict = {**ann_dict, **nested}
                    url = ann_dict.get("url", "")
                    if url and url.startswith("https://"):
                        ctx.citation_annotations.append(ann_dict)

    @staticmethod
    def _provider_object_to_dict(value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return dict(value)
        model_dump = getattr(value, "model_dump", None)
        if callable(model_dump):
            dumped = model_dump(mode="json")
            if isinstance(dumped, dict):
                return dumped
        return {
            key: getattr(value, key)
            for key in ("url", "title", "type", "start_index", "end_index")
            if getattr(value, key, None) is not None
        }

    def _register_native_web_evidence(self, ctx: AdapterCallContext) -> None:
        """Join provider source metadata and URL annotations, then register."""
        if not ctx.search_call_ids:
            return

        source_by_url: dict[str, dict[str, Any]] = {}
        for source in ctx.native_sources:
            url = str(source.get("url") or "").strip()
            if not url:
                continue
            key = url.rstrip("/").lower()
            source_by_url.setdefault(key, dict(source))

        for annotation in ctx.citation_annotations:
            url = str(annotation.get("url") or "").strip()
            if not url:
                continue
            key = url.rstrip("/").lower()
            source = source_by_url.get(key)
            if source is None:
                # A URL annotation is attributable to the only search call in
                # the response.  With multiple calls and no source-list link,
                # provenance is ambiguous and must not be guessed.
                if len(ctx.search_call_ids) != 1:
                    continue
                source = {"url": url, "search_call_id": ctx.search_call_ids[0]}
                source_by_url[key] = source
            source.setdefault("search_call_id", ctx.search_call_ids[0])
            source.setdefault("title", annotation.get("title") or url)
            source.setdefault("citation", {
                "start_index": annotation.get("start_index"),
                "end_index": annotation.get("end_index"),
            })

        if not source_by_url:
            return

        try:
            ctx.web_normalizer.normalize_search_output(
                search_output={"sources": list(source_by_url.values())},
                search_call_id=ctx.search_call_ids[0],
                tool_call_id=ctx.search_call_ids[0],
                registry=ctx.registry,
            )
        except Exception:
            logger.exception("Failed to normalize web search results")


def create_openai_adapter(*, client: OpenAI | None = None) -> OpenAIResponsesAdapter:
    """Create a new OpenAI Responses adapter."""
    return OpenAIResponsesAdapter(client=client)
