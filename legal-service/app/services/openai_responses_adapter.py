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


# Fresh terminal recovery must carry enough completed local evidence to remain
# useful, but must not replay the old Responses protocol envelope.  Keep this
# bounded so a large tool result cannot consume the terminal request budget.
FRESH_RECOVERY_TOOL_CONTEXT_MAX_CHARS = 12000
FRESH_RECOVERY_TOOL_RESULT_MAX_CHARS = 5000


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


@dataclass(slots=True)
class ResponsesStreamAccumulator:
    """Accumulate safe artifacts from one Responses API stream.

    The accumulator is intentionally provider-level and shared by Default and
    Premium. Only completed function arguments and completed web-search output
    items are promoted to executable/registered artifacts. Text that arrived
    before interruption is retained as context, never as a final answer.
    """

    text_parts: list[str] = field(default_factory=list)
    response_id: str = ""
    completed: bool = False
    partial: bool = False
    status: str = "ok"
    stream_error: str | None = None
    native_sources: list[dict[str, Any]] = field(default_factory=list)
    citation_annotations: list[dict[str, Any]] = field(default_factory=list)
    search_call_ids: list[str] = field(default_factory=list)
    search_queries: list[str] = field(default_factory=list)
    function_buffers: dict[str, str] = field(default_factory=dict)
    function_names: dict[str, str] = field(default_factory=dict)
    function_call_ids: dict[str, str] = field(default_factory=dict)
    function_arguments_done: set[str] = field(default_factory=set)
    completed_function_item_ids: set[str] = field(default_factory=set)
    completed_function_calls: list[ToolCallRequest] = field(default_factory=list)
    completed_item_ids: set[str] = field(default_factory=set)
    completed_output_item_count: int = 0
    final_response: Any = None

    @staticmethod
    def _get(value: Any, key: str, default: Any = None) -> Any:
        if isinstance(value, dict):
            return value.get(key, default)
        return getattr(value, key, default)

    @classmethod
    def _as_dict(cls, value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return dict(value)
        model_dump = getattr(value, "model_dump", None)
        if callable(model_dump):
            try:
                dumped = model_dump(mode="json")
            except TypeError:
                dumped = model_dump()
            if isinstance(dumped, dict):
                return dumped
        return {
            key: getattr(value, key)
            for key in ("url", "title", "type", "start_index", "end_index")
            if getattr(value, key, None) is not None
        }

    def consume(self, event: Any) -> None:
        if self.completed:
            return
        event_type = self._get(event, "type", "")
        if event_type in {"response.created", "response.in_progress"}:
            self._capture_response_identity(self._get(event, "response"))
        elif event_type == "response.output_text.delta":
            delta = self._get(event, "delta", "")
            if delta:
                self.text_parts.append(str(delta))
        elif event_type == "response.output_text.done":
            text = self._get(event, "text", "")
            if text and not self.text_parts:
                self.text_parts.append(str(text))
        elif event_type == "response.output_text.annotation.added":
            self._add_annotation(self._get(event, "annotation"))
        elif event_type == "response.function_call_arguments.delta":
            item_id = str(self._get(event, "item_id", ""))
            if item_id:
                self.function_buffers[item_id] = (
                    self.function_buffers.get(item_id, "") + str(self._get(event, "delta", ""))
                )
        elif event_type == "response.function_call_arguments.done":
            item_id = str(self._get(event, "item_id", ""))
            if item_id:
                self.function_buffers[item_id] = str(self._get(event, "arguments", ""))
                self.function_names[item_id] = str(self._get(event, "name", ""))
                self.function_arguments_done.add(item_id)
                self._maybe_add_function_call(item_id)
        elif event_type == "response.output_item.done":
            self._consume_completed_item(
                self._get(event, "item"),
                confirmed_completed=True,
            )
        elif event_type == "response.completed":
            response = self._get(event, "response")
            self._capture_response_identity(response)
            self._consume_response_output(
                response,
                include_text=not bool(self.text_parts),
                allow_implicit_function_completion=True,
            )
            self.completed = True
            self.partial = False
            self.status = "ok"
            self.final_response = response
        elif event_type == "response.incomplete":
            response = self._get(event, "response")
            self._capture_response_identity(response)
            self._consume_response_output(
                response,
                include_text=not bool(self.text_parts),
                allow_implicit_function_completion=False,
            )
            self.partial = self._has_salvageable_artifacts()
            self.status = "timeout"
            self.final_response = response
        elif event_type == "response.failed":
            response = self._get(event, "response")
            self._capture_response_identity(response)
            self._consume_response_output(
                response,
                include_text=not bool(self.text_parts),
                allow_implicit_function_completion=False,
            )
            self.partial = self._has_salvageable_artifacts()
            self.status = "error"
            self.stream_error = self._response_error_text(response) or "Responses API response failed"
            self.final_response = response
        elif event_type == "error":
            self.partial = self._has_salvageable_artifacts()
            self.status = "error"
            self.stream_error = str(self._get(event, "message", "Responses API stream error"))

    def consume_response(self, response: Any) -> None:
        """Normalize a non-stream fixture/response through the same parser."""
        self._capture_response_identity(response)
        output_text = self._get(response, "output_text", "")
        if output_text and not self.text_parts:
            self.text_parts.append(str(output_text))
        self._consume_response_output(
            response,
            include_text=not bool(self.text_parts),
            allow_implicit_function_completion=True,
        )
        self.completed = True
        self.status = "ok"
        self.final_response = response

    def mark_interrupted(self, *, timeout: bool, error: BaseException | None = None) -> None:
        if self.completed:
            return
        self.partial = self._has_salvageable_artifacts()
        self.status = "timeout" if timeout else "error"
        if error is not None:
            self.stream_error = str(error)[:1000]

    def _capture_response_identity(self, response: Any) -> None:
        response_id = self._get(response, "id", "") if response is not None else ""
        if response_id:
            self.response_id = str(response_id)

    def _has_salvageable_artifacts(self) -> bool:
        return bool(
            self.text_parts
            or self.native_sources
            or self.citation_annotations
            or self.completed_function_calls
        )

    def _consume_response_output(
        self,
        response: Any,
        *,
        include_text: bool,
        allow_implicit_function_completion: bool,
    ) -> None:
        if response is None:
            return
        for item in self._get(response, "output", []) or []:
            item_type = self._get(item, "type", "")
            if item_type == "message":
                if include_text:
                    for block in self._get(item, "content", []) or []:
                        if self._get(block, "type", "") == "output_text":
                            text = self._get(block, "text", "")
                            if text:
                                self.text_parts.append(str(text))
                for block in self._get(item, "content", []) or []:
                    for annotation in self._get(block, "annotations", []) or []:
                        self._add_annotation(annotation)
            elif item_type in {"function_call", "web_search_call"}:
                self._consume_completed_item(
                    item,
                    allow_implicit_completion=allow_implicit_function_completion,
                )

    def _consume_completed_item(
        self,
        item: Any,
        *,
        confirmed_completed: bool = False,
        allow_implicit_completion: bool = False,
    ) -> None:
        if item is None:
            return
        output_item_id = str(self._get(item, "id", ""))
        item_identity = output_item_id or f"anonymous:{self._get(item, 'call_id', '')}"
        if item_identity in self.completed_item_ids:
            return
        self.completed_item_ids.add(item_identity)
        self.completed_output_item_count += 1
        item_type = self._get(item, "type", "")
        if item_type == "function_call":
            item_status = self._get(item, "status")
            if item_status == "incomplete":
                return
            item_confirmed_completed = (
                confirmed_completed
                or item_status == "completed"
                or (allow_implicit_completion and item_status is None)
            )
            if not item_confirmed_completed:
                return
            call_id = str(self._get(item, "call_id", ""))
            if not call_id:
                return
            self.function_call_ids[item_identity] = call_id
            self.function_names[item_identity] = str(self._get(item, "name", ""))
            arguments = self._get(item, "arguments")
            if arguments is not None:
                self.function_buffers[item_identity] = str(arguments)
            self.function_arguments_done.add(item_identity)
            self.completed_function_item_ids.add(item_identity)
            self._maybe_add_function_call(item_identity)
        elif item_type == "web_search_call":
            if not (
                confirmed_completed
                or self._get(item, "status") == "completed"
                or (allow_implicit_completion and self._get(item, "status") is None)
            ):
                return
            self._consume_web_search_item(item)

    def _consume_web_search_item(self, item: Any) -> None:
        search_id = str(self._get(item, "id", ""))
        if search_id and search_id not in self.search_call_ids:
            self.search_call_ids.append(search_id)
        action = self._get(item, "action")
        for query in self._get(action, "queries", []) or []:
            if isinstance(query, str) and query not in self.search_queries:
                self.search_queries.append(query)
        source_lists = [
            self._get(action, "sources", []) or [],
            self._get(action, "results", []) or [],
            self._get(item, "sources", []) or [],
            self._get(item, "results", []) or [],
        ]
        for sources in source_lists:
            for source in sources:
                source_dict = self._as_dict(source)
                url = str(source_dict.get("url") or "").strip()
                if url and not any(
                    str(existing.get("url") or "").rstrip("/").lower()
                    == url.rstrip("/").lower()
                    for existing in self.native_sources
                ):
                    source_dict["search_call_id"] = search_id
                    self.native_sources.append(source_dict)

    def materialized_sources(self) -> list[dict[str, Any]]:
        """Return deduplicated source metadata, including citation-only URLs."""
        sources = list(self.native_sources)
        for annotation in self.citation_annotations:
            url = str(annotation.get("url") or "").strip()
            if not url or any(
                str(source.get("url") or "").rstrip("/").lower()
                == url.rstrip("/").lower()
                for source in sources
            ):
                continue
            sources.append({
                "url": url,
                "title": annotation.get("title") or url,
                "citation": {
                    "start_index": annotation.get("start_index"),
                    "end_index": annotation.get("end_index"),
                },
            })
        return sources

    def _add_annotation(self, annotation: Any) -> None:
        annotation_dict = self._as_dict(annotation)
        nested = annotation_dict.get("url_citation")
        if isinstance(nested, dict):
            annotation_dict = {**annotation_dict, **nested}
        url = str(annotation_dict.get("url") or "").strip()
        if not url.startswith("https://"):
            return
        key = (
            url.rstrip("/").lower(),
            annotation_dict.get("start_index"),
            annotation_dict.get("end_index"),
        )
        if not any(
            (
                str(existing.get("url") or "").rstrip("/").lower(),
                existing.get("start_index"),
                existing.get("end_index"),
            )
            == key
            for existing in self.citation_annotations
        ):
            self.citation_annotations.append(annotation_dict)

    def _maybe_add_function_call(self, item_id: str) -> None:
        if item_id not in self.function_arguments_done:
            return
        if item_id not in self.completed_function_item_ids:
            return
        name = self.function_names.get(item_id, "")
        arguments_text = self.function_buffers.get(item_id, "")
        if not name or not arguments_text:
            return
        try:
            arguments = json.loads(arguments_text)
        except (TypeError, json.JSONDecodeError):
            return
        if not isinstance(arguments, dict):
            return
        call_id = self.function_call_ids.get(item_id)
        if not call_id:
            return
        if any(call.call_id == call_id for call in self.completed_function_calls):
            return
        self.completed_function_calls.append(
            ToolCallRequest(call_id=call_id, name=name, arguments=arguments)
        )

    @classmethod
    def _response_error_text(cls, response: Any) -> str | None:
        error = cls._get(response, "error") if response is not None else None
        message = cls._get(error, "message") if error is not None else None
        return str(message) if message else None


def _is_timeout_exception(exc: BaseException) -> bool:
    return isinstance(exc, TimeoutError) or "timeout" in exc.__class__.__name__.lower()


def consume_responses_stream(
    stream: Any,
    *,
    allocated_timeout_seconds: float,
    clock: Any = time.perf_counter,
) -> ResponsesStreamAccumulator:
    """Consume one Responses stream under a monotonic total-duration deadline.

    The SDK timeout remains the transport/read guard. This helper adds the
    caller's total per-call wall-clock guard and is shared by Default and
    Premium. A stream close is best-effort and can never discard artifacts or
    downgrade an already completed response.
    """
    accumulator = ResponsesStreamAccumulator()
    provider_deadline = clock() + max(0.0, allocated_timeout_seconds)

    def close_stream() -> None:
        close = getattr(stream, "close", None)
        if not callable(close):
            return
        try:
            close()
        except Exception:
            logger.debug("Responses stream close failed", exc_info=True)

    try:
        try:
            iterator = iter(stream)
        except Exception as exc:
            accumulator.mark_interrupted(
                timeout=_is_timeout_exception(exc),
                error=exc,
            )
            return accumulator
        while not accumulator.completed:
            if clock() >= provider_deadline:
                accumulator.mark_interrupted(
                    timeout=True,
                    error=TimeoutError("Responses stream absolute deadline exhausted"),
                )
                break
            try:
                event = next(iterator)
            except StopIteration:
                if not accumulator.completed and accumulator.stream_error is None:
                    accumulator.mark_interrupted(
                        timeout=True,
                        error=TimeoutError(
                            "Responses stream ended before response.completed"
                        ),
                    )
                break
            except Exception as exc:
                if not accumulator.completed:
                    accumulator.mark_interrupted(
                        timeout=_is_timeout_exception(exc),
                        error=exc,
                    )
                break

            # The event was produced after the deadline, so it must not be
            # accepted. In particular, do not accidentally accept a late
            # function-call completion or response.completed event.
            if clock() >= provider_deadline:
                accumulator.mark_interrupted(
                    timeout=True,
                    error=TimeoutError("Responses stream absolute deadline exhausted"),
                )
                break

            accumulator.consume(event)
            if not accumulator.completed and clock() >= provider_deadline:
                accumulator.mark_interrupted(
                    timeout=True,
                    error=TimeoutError("Responses stream absolute deadline exhausted"),
                )
                break
    finally:
        # Closing is also attempted after normal completion so a cleanup error
        # is exercised without ever changing the successful accumulator state.
        close_stream()

    return accumulator


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
                params["include"] = [
                    "web_search_call.action.sources",
                    "web_search_call.results",
                ]
                params["max_tool_calls"] = get_settings().default_web_search_max_tool_calls
            for ft in function_tools:
                params["tools"].append(ft)
            if previous_response_id:
                params["previous_response_id"] = previous_response_id
            if timeout_ms > 0:
                params["timeout"] = timeout_ms / 1000.0

            response = self._client.responses.create(**params, stream=True)
            if self._is_stream_iterable(response):
                accumulator = consume_responses_stream(
                    response,
                    allocated_timeout_seconds=max(0.0, timeout_ms / 1000.0),
                )
            else:
                # Keep the compatibility path for existing injected response
                # fixtures and SDK-shaped non-stream test doubles. Production
                # requests always ask the SDK for stream=True.
                accumulator = ResponsesStreamAccumulator()
                accumulator.consume_response(response)

            duration_ms = (time.perf_counter() - start) * 1000.0
            self._copy_stream_artifacts_to_context(accumulator, ctx)
            self._register_native_web_evidence(ctx)

            response_id = accumulator.response_id
            response = accumulator.final_response
            status = accumulator.status
            if ctx.pii_violation_count:
                status = "error"

            usage = getattr(response, "usage", None) if response is not None else None
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
            materialized_sources = accumulator.materialized_sources()

            return ProviderResponse(
                response_id=response_id, model=model, status=status,
                text="".join(accumulator.text_parts) or None,
                tool_calls=list(accumulator.completed_function_calls),
                input_tokens=input_tokens, cached_input_tokens=cached_input_tokens,
                reasoning_tokens=reasoning_tokens, output_tokens=output_tokens,
                duration_ms=duration_ms, raw_response=response,
                pii_violation_count=ctx.pii_violation_count,
                search_privacy_violation_categories=dict(ctx.search_privacy_violation_categories),
                effort=reasoning_effort,
                native_web_search_call_count=len(ctx.search_call_ids),
                native_web_source_count=len(ctx.native_sources),
                native_web_citation_count=len(ctx.citation_annotations),
                partial=accumulator.partial,
                partial_text=("".join(accumulator.text_parts) or None)
                if accumulator.partial
                else None,
                partial_sources=(materialized_sources if accumulator.partial else []),
                partial_citations=(list(accumulator.citation_annotations)
                                   if accumulator.partial else []),
                completed_output_item_count=accumulator.completed_output_item_count,
                stream_error=accumulator.stream_error,
            )
        except Exception as exc:
            duration_ms = (time.perf_counter() - start) * 1000.0
            logger.exception("OpenAI Responses API call failed")
            return ProviderResponse(
                response_id="", model=model,
                status="timeout" if self._is_timeout_exception(exc) else "error",
                text=None,
                duration_ms=duration_ms, pii_violation_count=ctx.pii_violation_count,
                search_privacy_violation_categories=dict(ctx.search_privacy_violation_categories),
                effort=reasoning_effort,
                native_web_search_call_count=len(ctx.search_call_ids),
                native_web_source_count=len(ctx.native_sources),
                native_web_citation_count=len(ctx.citation_annotations),
                stream_error=str(exc)[:1000],
            )

    @staticmethod
    def _is_stream_iterable(response: Any) -> bool:
        return (
            not isinstance(response, (dict, list, tuple))
            and hasattr(response, "__iter__")
            and not hasattr(response, "output_text")
        )

    @staticmethod
    def _is_timeout_exception(exc: BaseException) -> bool:
        return isinstance(exc, TimeoutError) or "timeout" in exc.__class__.__name__.lower()

    def _copy_stream_artifacts_to_context(
        self,
        accumulator: ResponsesStreamAccumulator,
        ctx: AdapterCallContext,
    ) -> None:
        ctx.search_call_ids = list(accumulator.search_call_ids)
        ctx.native_sources = accumulator.materialized_sources()
        ctx.citation_annotations = list(accumulator.citation_annotations)
        for query in accumulator.search_queries:
            result = ctx.privacy_guard.check_query(query)
            if result.allowed:
                continue
            ctx.pii_violation_count += 1
            for category, count in result.violation_categories.items():
                ctx.search_privacy_violation_categories[category] = (
                    ctx.search_privacy_violation_categories.get(category, 0) + count
                )
            logger.warning(
                "PII detected in generated web_search query (violation #%d)",
                ctx.pii_violation_count,
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
            terminal_instruction: dict[str, Any] | None = None
            partial_provider_messages: list[dict[str, Any]] = []
            for message in messages_history:
                if message.get("role") == "user":
                    if message.get("partial_provider_text") is True:
                        partial_provider_messages.append(message)
                    else:
                        latest_user_message = message
                if message.get("terminal_instruction") is True:
                    terminal_instruction = message
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
            for message in partial_provider_messages:
                items.append({
                    "role": "user",
                    "content": [{
                        "type": "input_text",
                        "text": str(message.get("content") or ""),
                    }],
                })
            if terminal_instruction is not None:
                items.append({
                    "role": "user",
                    "content": [{
                        "type": "input_text",
                        "text": str(terminal_instruction.get("content") or ""),
                    }],
                })
            return items
        fresh_terminal_recovery = any(
            message.get("terminal_fresh_request") is True
            for message in messages_history
        )
        fresh_tool_context = (
            self._build_fresh_recovery_tool_context(messages_history)
            if fresh_terminal_recovery
            else None
        )
        terminal_instructions: list[str] = []
        for msg in messages_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                continue
            if msg.get("terminal_instruction") is True:
                terminal_instructions.append(str(content))
                continue
            if role == "assistant" and "tool_calls" in msg:
                continue
            elif role == "tool":
                if fresh_terminal_recovery:
                    # An interrupted response cannot be resumed with a fresh
                    # previous_response_id=None request.  Replaying these as
                    # function_call_output would create orphaned call IDs in
                    # the Responses API request.  The bounded context item
                    # below carries their completed evidence instead.
                    continue
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
        if fresh_tool_context:
            items.append({
                "role": "user",
                "content": [{"type": "input_text", "text": fresh_tool_context}],
            })
        for instruction in terminal_instructions:
            items.append({
                "role": "user",
                "content": [{"type": "input_text", "text": instruction}],
            })
        return items

    @staticmethod
    def _json_text(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)

    @classmethod
    def _bounded_recovery_value(cls, value: Any, limit: int) -> Any:
        """Bound nested tool data while retaining structured evidence fields."""

        if limit <= 0:
            return "[truncated]"
        if isinstance(value, str):
            if len(value) <= limit:
                return value
            return value[: max(0, limit - 15)] + "…[truncated]"
        if value is None or isinstance(value, (bool, int, float)):
            return value
        if isinstance(value, list):
            bounded: list[Any] = []
            for item in value:
                candidate = cls._bounded_recovery_value(item, max(80, limit // 3))
                trial = bounded + [candidate]
                if len(cls._json_text(trial)) > limit:
                    break
                bounded.append(candidate)
            return bounded
        if isinstance(value, dict):
            priority = (
                "evidence_refs",
                "canonical_evidence_refs",
                "source_refs",
                "chunks",
                "lookups",
                "results",
                "resolved_cross_references",
                "unresolved_cross_references",
                "coverage",
                "provenance",
                "corpus_version",
                "index_version",
            )
            keys = list(dict.fromkeys([*priority, *value.keys()]))
            bounded_dict: dict[str, Any] = {}
            for key in keys:
                if key not in value:
                    continue
                remaining = limit - len(cls._json_text(bounded_dict)) - 8
                if remaining < 80:
                    break
                candidate = cls._bounded_recovery_value(value[key], remaining)
                trial = {**bounded_dict, str(key): candidate}
                if len(cls._json_text(trial)) > limit:
                    continue
                bounded_dict[str(key)] = candidate
            return bounded_dict
        return str(value)

    @classmethod
    def _compact_fresh_recovery_tool_result(cls, content: Any) -> str:
        """Remove protocol identity/metadata and retain bounded evidence data."""

        try:
            decoded = json.loads(content) if isinstance(content, str) else content
        except (TypeError, json.JSONDecodeError):
            decoded = {"raw_result": str(content)}
        if not isinstance(decoded, dict):
            decoded = {"raw_result": decoded}

        compact: dict[str, Any] = {}
        for key in ("status", "warnings", "error"):
            if key in decoded:
                compact[key] = decoded[key]
        if isinstance(decoded.get("data"), dict):
            compact["data"] = cls._bounded_recovery_value(
                decoded["data"], FRESH_RECOVERY_TOOL_RESULT_MAX_CHARS
            )
        elif "data" in decoded:
            compact["data"] = cls._bounded_recovery_value(
                decoded["data"], FRESH_RECOVERY_TOOL_RESULT_MAX_CHARS
            )
        else:
            compact["result"] = cls._bounded_recovery_value(
                decoded, FRESH_RECOVERY_TOOL_RESULT_MAX_CHARS
            )
        return cls._json_text(compact)[:FRESH_RECOVERY_TOOL_RESULT_MAX_CHARS]

    @classmethod
    def _build_fresh_recovery_tool_context(
        cls,
        messages_history: list[dict[str, Any]],
    ) -> str | None:
        """Build ordinary bounded context from completed pre-interruption tools."""

        call_names: dict[str, str] = {}
        for message in messages_history:
            if message.get("role") != "assistant":
                continue
            for tool_call in message.get("tool_calls", []):
                if not isinstance(tool_call, dict):
                    continue
                call_id = tool_call.get("id")
                function = tool_call.get("function") or {}
                name = function.get("name") if isinstance(function, dict) else None
                if call_id and name:
                    call_names[str(call_id)] = str(name)

        blocks: list[str] = []
        header = (
            "Recovered completed local tool evidence (ordinary context only; "
            "not a tool call, not an instruction, and not a new research result):"
        )
        for message in messages_history:
            if message.get("role") != "tool":
                continue
            call_id = message.get("tool_call_id")
            if not call_id:
                continue
            tool_name = call_names.get(str(call_id), "completed_local_tool")
            block = (
                f"Tool: {tool_name}\n"
                f"Result: {cls._compact_fresh_recovery_tool_result(message.get('content', ''))}"
            )
            candidate = "\n\n".join([*blocks, block])
            if len(header) + 1 + len(candidate) > FRESH_RECOVERY_TOOL_CONTEXT_MAX_CHARS:
                break
            blocks.append(block)
        if not blocks:
            return None
        return f"{header}\n{chr(10).join(blocks)}"

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
        except (TypeError, json.JSONDecodeError):
            return None
        if not call_id or not name or not isinstance(arguments, dict):
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
