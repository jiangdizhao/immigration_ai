"""Phase 5 — OpenAI Responses API adapter.

Concrete provider implementation wrapping the OpenAI Responses API
for GPT-5.6 Luna shadow execution.

Supports:
- tool_choice=auto
- built-in web_search (provider-native, NOT a custom function)
- custom function tools (deterministic_utility, flat_rag_search, submit_answer)
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
class AdapterCallContext:
    """Per-call context carrying the request-scoped registry and guards."""

    registry: RequestEvidenceRegistry
    privacy_guard: SearchPrivacyGuard
    web_normalizer: WebEvidenceNormalizer
    pii_violation_count: int = 0


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
            if web_search_tool:
                params["tools"].append(web_search_tool)
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

            if ctx.pii_violation_count:
                return ProviderResponse(
                    response_id=response_id, model=model, status="error",
                    text=None, tool_calls=[], duration_ms=duration_ms,
                    raw_response=response,
                    pii_violation_count=ctx.pii_violation_count,
                )

            usage = getattr(response, "usage", None)
            input_tokens = getattr(usage, "input_tokens", None) if usage else None
            output_tokens = getattr(usage, "output_tokens", None) if usage else None

            return ProviderResponse(
                response_id=response_id, model=model, status="ok",
                text=text_output, tool_calls=custom_tool_calls,
                input_tokens=input_tokens, output_tokens=output_tokens,
                duration_ms=duration_ms, raw_response=response,
                pii_violation_count=ctx.pii_violation_count,
            )
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000.0
            logger.exception("OpenAI Responses API call failed")
            return ProviderResponse(
                response_id="", model=model, status="error", text=None,
                duration_ms=duration_ms, pii_violation_count=ctx.pii_violation_count,
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
        action = getattr(item, "action", None)
        if action is not None:
            queries = getattr(action, "queries", None) or []
            for q in queries:
                if isinstance(q, str):
                    result = ctx.privacy_guard.check_query(q)
                    if not result.allowed:
                        ctx.pii_violation_count += 1
                        logger.warning("PII detected in generated web_search query (violation #%d)", ctx.pii_violation_count)

        sources = getattr(item, "sources", None) or []
        if not sources:
            return
        search_output: dict[str, Any] = {"sources": []}
        for source in sources:
            source_dict: dict[str, Any] = {
                "url": getattr(source, "url", ""),
                "title": getattr(source, "title", ""),
            }
            citation = getattr(source, "citation", None)
            if citation is not None:
                source_dict["citation"] = {
                    "start_index": getattr(citation, "start_index", 0),
                    "end_index": getattr(citation, "end_index", 0),
                }
            search_output["sources"].append(source_dict)
        try:
            ctx.web_normalizer.normalize_search_output(
                search_output=search_output, search_call_id=search_call_id,
                tool_call_id=search_call_id, registry=ctx.registry,
            )
        except Exception:
            logger.exception("Failed to normalize web search results")

    def _normalize_message_citations(self, message_item: Any, ctx: AdapterCallContext) -> None:
        for content_block in getattr(message_item, "content", []):
            annotations = getattr(content_block, "annotations", None) or []
            for ann in annotations:
                ann_type = getattr(ann, "type", None)
                if ann_type == "url_citation":
                    url = getattr(ann, "url", "")
                    title = getattr(ann, "title", "") or url
                    if url and url.startswith("https://"):
                        self._register_citation_evidence(url=url, title=title, ann=ann, ctx=ctx)

    def _register_citation_evidence(self, *, url: str, title: str, ann: Any, ctx: AdapterCallContext) -> None:
        from datetime import datetime, timezone
        from app.schemas.evidence import NativeWebCitation, NativeWebEvidenceRef
        from app.services.web_evidence_normalizer import (
            classify_source_authenticity, classify_source_type_from_url,
            classify_authority_kind_from_url, classify_binding_status,
        )

        start_idx = getattr(ann, "start_index", 0)
        end_idx = getattr(ann, "end_index", 0)
        source_authenticity = classify_source_authenticity(url)
        source_type = classify_source_type_from_url(url)
        authority_kind = classify_authority_kind_from_url(url)
        binding_status = classify_binding_status(authority_kind)

        evidence = NativeWebEvidenceRef(
            evidence_origin="openai_web_native", evidence_ref="web:pending",
            source_type=source_type, source_authenticity=source_authenticity,
            authority_kind=authority_kind,
            jurisdiction="Cth" if source_authenticity != "unverified" else None,
            binding_status=binding_status, court_or_tribunal_level=None,
            retrieved_at=datetime.now(timezone.utc), provenance_complete=True,
            search_call_id="citation", url=url, title=title,
            native_web_citation=NativeWebCitation(start_index=start_idx, end_index=end_idx),
            canonical_source_id=None, document_version=None,
            effective_from=None, effective_to=None, text=None, content_hash=None,
        )
        try:
            ctx.registry.register_native_web_evidence(
                evidence=evidence, tool_call_id="citation", tool_name="web_search",
            )
        except Exception:
            pass


def create_openai_adapter(*, client: OpenAI | None = None) -> OpenAIResponsesAdapter:
    """Create a new OpenAI Responses adapter."""
    return OpenAIResponsesAdapter(client=client)
