from __future__ import annotations

import hashlib
import logging
import time
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.source import CitationOut
from app.services.agent_observability_service import AbsoluteTurnDeadline
from app.services.openai_responses_adapter import (
    ResponsesStreamAccumulator,
    consume_responses_stream,
)

logger = logging.getLogger(__name__)


class FastDirectLunaService:
    """One-call, speed-first Luna lane with only hosted native web search.

    This service deliberately has no QueryService, DB, evidence registry,
    retrieval, graph, Schedule, checker, ReasoningBank, or application tool
    dependency. A provider failure is converted into a Fast-specific response;
    it never retries through another mode.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self.model = settings.fast_luna_model
        self.reasoning_effort = settings.fast_luna_reasoning_effort
        self.provider_timeout_ms = settings.fast_luna_provider_timeout_ms
        self.max_output_tokens = settings.fast_luna_max_output_tokens
        self.max_tool_calls = settings.fast_luna_max_tool_calls
        self.web_search_context_size = settings.fast_luna_web_search_context_size
        self.service_tier = settings.fast_luna_service_tier
        self.api_key = settings.openai_api_key

    def answer(
        self,
        *,
        payload: QueryRequest,
        deadline: AbsoluteTurnDeadline,
        observability: Any | None = None,
    ) -> QueryResponse:
        started = time.perf_counter()
        language = self._response_language(payload)
        question = payload.question.strip()
        model_input = self._model_input(payload, question)
        native_web_used = False
        source_count = 0
        completion_status = "error"
        response_id: str | None = None
        provider_elapsed_ms = 0.0
        accumulator: ResponsesStreamAccumulator | None = None

        try:
            if not self.api_key:
                raise RuntimeError("Fast Luna provider is not configured")
            remaining_ms = deadline.remaining_ms()
            if remaining_ms <= 0:
                raise TimeoutError("Fast turn deadline exhausted before provider call")
            timeout_ms = min(float(self.provider_timeout_ms), remaining_ms)
            request_kwargs: dict[str, Any] = {
                "model": self.model,
                "input": model_input,
                "instructions": self._instructions(language),
                "reasoning": {"effort": self.reasoning_effort},
                "max_output_tokens": self.max_output_tokens,
                "tools": [
                    {
                        "type": "web_search",
                        "search_context_size": self.web_search_context_size,
                    }
                ],
                "tool_choice": "auto",
                "include": [
                    "web_search_call.action.sources",
                    "web_search_call.results",
                ],
                "max_tool_calls": self.max_tool_calls,
                "stream": True,
            }
            if self.service_tier:
                request_kwargs["service_tier"] = self.service_tier

            client = OpenAI(
                api_key=self.api_key,
                timeout=timeout_ms / 1000.0,
                max_retries=0,
            )
            provider_started = time.perf_counter()
            response = client.responses.create(**request_kwargs)
            if self._is_stream_iterable(response):
                accumulator = consume_responses_stream(
                    response,
                    allocated_timeout_seconds=timeout_ms / 1000.0,
                )
            else:
                accumulator = ResponsesStreamAccumulator()
                accumulator.consume_response(response)
            provider_elapsed_ms = (time.perf_counter() - provider_started) * 1000.0
            response_id = accumulator.response_id or None
            native_web_used = bool(
                accumulator.search_call_ids
                or accumulator.native_sources
                or accumulator.citation_annotations
            )
            sources = self._sources(accumulator.materialized_sources())
            source_count = len(sources)
            if accumulator.completed and accumulator.status == "ok":
                answer = "".join(accumulator.text_parts).strip()
                if answer:
                    completion_status = "complete"
                    self._record_provider(
                        observability=observability,
                        started=started,
                        response_id=response_id,
                        status="ok",
                        accumulator=accumulator,
                        provider_elapsed_ms=provider_elapsed_ms,
                    )
                    return self._success_response(
                        payload=payload,
                        answer=answer,
                        language=language,
                        sources=sources,
                        started=started,
                        native_web_used=native_web_used,
                        completion_status=completion_status,
                        response_id=response_id,
                        provider_elapsed_ms=provider_elapsed_ms,
                    )
            completion_status = "incomplete" if accumulator.status == "timeout" else "error"
            raise RuntimeError("Fast Luna response did not complete with answer text")
        except Exception as exc:
            provider_elapsed_ms = provider_elapsed_ms or ((time.perf_counter() - started) * 1000.0)
            logger.warning(
                "fast_direct_luna_failed error_type=%s",
                exc.__class__.__name__,
            )
            self._record_provider(
                observability=observability,
                started=started,
                response_id=response_id,
                status="timeout" if self._is_timeout_exception(exc) else "error",
                accumulator=accumulator,
                provider_elapsed_ms=provider_elapsed_ms,
            )
            return self._fallback_response(
                payload=payload,
                language=language,
                started=started,
                native_web_used=native_web_used,
                source_count=source_count,
                completion_status=(
                    "timeout" if self._is_timeout_exception(exc) else completion_status
                ),
            )

    def _success_response(
        self,
        *,
        payload: QueryRequest,
        answer: str,
        language: str,
        sources: list[CitationOut],
        started: float,
        native_web_used: bool,
        completion_status: str,
        response_id: str | None,
        provider_elapsed_ms: float,
    ) -> QueryResponse:
        return QueryResponse(
            matter_id=payload.matter_id,
            answer=answer,
            response_language=language,
            confidence="medium",
            user_display_mode="general_with_warning",
            issue_type="fast_direct_luna",
            citations=sources,
            compact_sources=self._compact_sources(sources),
            next_action="answer",
            architecture_version="fast.direct_luna",
            research_status="complete" if native_web_used else "not_required",
            retrieval_debug=self._debug(
                elapsed_ms=(time.perf_counter() - started) * 1000.0,
                native_web_used=native_web_used,
                source_count=len(sources),
                completion_status=completion_status,
                response_id=response_id,
                provider_elapsed_ms=provider_elapsed_ms,
            ),
        )

    def _fallback_response(
        self,
        *,
        payload: QueryRequest,
        language: str,
        started: float,
        native_web_used: bool,
        source_count: int,
        completion_status: str,
    ) -> QueryResponse:
        answer = (
            "快速答复暂时不可用。请稍后重试；如需更深入的来源核对，请登录后切换到 Legal Check，或安排律师咨询。"
            if language == "zh"
            else "Quick Answer is temporarily unavailable. Please try again shortly. If you need deeper source checking, sign in and switch to Legal Check, or arrange a lawyer consultation."
        )
        return QueryResponse(
            matter_id=payload.matter_id,
            answer=answer,
            response_language=language,
            confidence="low",
            user_display_mode="general_with_warning",
            issue_type="fast_direct_luna",
            escalate=False,
            next_action="ask_followup",
            architecture_version="fast.direct_luna",
            research_status="incomplete" if native_web_used else "not_required",
            retrieval_debug=self._debug(
                elapsed_ms=(time.perf_counter() - started) * 1000.0,
                native_web_used=native_web_used,
                source_count=source_count,
                completion_status=completion_status,
                response_id=None,
                provider_elapsed_ms=None,
            ),
        )

    def _record_provider(
        self,
        *,
        observability: Any | None,
        started: float,
        response_id: str | None,
        status: str,
        accumulator: ResponsesStreamAccumulator | None,
        provider_elapsed_ms: float,
    ) -> None:
        if observability is None:
            return
        try:
            observability.record_provider_call(
                stage="fast_direct_luna",
                duration_ms=provider_elapsed_ms or (time.perf_counter() - started) * 1000.0,
                response_id=response_id,
                model=self.model,
                effort=self.reasoning_effort,
                native_web_search_call_count=len(accumulator.search_call_ids) if accumulator else 0,
                native_web_source_count=len(accumulator.materialized_sources())
                if accumulator
                else 0,
                native_web_citation_count=len(accumulator.citation_annotations)
                if accumulator
                else 0,
                output_tokens=None,
                status=status,
            )
        except RuntimeError:
            # Standalone service tests may not install an ingress observation.
            return

    @staticmethod
    def _response_language(payload: QueryRequest) -> str:
        if payload.response_language:
            return payload.response_language
        return "zh" if any("\u4e00" <= char <= "\u9fff" for char in payload.question) else "en"

    @staticmethod
    def _model_input(payload: QueryRequest, question: str) -> str:
        lines: list[str] = []
        total = 0
        latest_question_included = False
        for message in (payload.frontend_messages or [])[-8:]:
            role = message.get("role")
            text = message.get("text")
            if role not in {"user", "assistant"} or not isinstance(text, str):
                continue
            clean = " ".join(text.split())[:900]
            if not clean:
                continue
            line = f"{'User' if role == 'user' else 'Assistant'}: {clean}"
            if total + len(line) > 6000:
                break
            lines.append(line)
            total += len(line)
            latest_question_included = latest_question_included or (
                role == "user" and text.strip() == question
            )
        if not latest_question_included:
            lines.append(f"User: {question[:4000]}")
        return "\n".join(lines)

    @staticmethod
    def _instructions(language: str) -> str:
        language_rule = (
            "Answer in Simplified Chinese."
            if language == "zh"
            else "Answer in the user's language, normally English."
        )
        return (
            "You are the Fast — Quick Answer assistant for Australian immigration questions. "
            "Give a concise, useful first answer and distinguish general information from individualized legal advice. "
            f"{language_rule} "
            "Use the hosted native web_search tool only when current, recent, date-sensitive, or legal-rule information needs freshness; do not search merely because it is available. "
            "When searching, prefer primary Australian sources such as immi.homeaffairs.gov.au and legislation.gov.au where relevant. "
            "Never invent legislation, citations, URLs, or search results; state uncertainty. "
            "For deeper source verification, suggest Legal Check to a registered user or signing in to access it; suggest a real lawyer for genuinely case-specific or high-risk matters."
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

    @staticmethod
    def _sources(raw_sources: list[dict[str, Any]]) -> list[CitationOut]:
        result: list[CitationOut] = []
        seen: set[str] = set()
        for raw in raw_sources:
            url = str(raw.get("url") or "").strip()
            if not url.startswith("https://"):
                continue
            key = url.rstrip("/").lower()
            if key in seen:
                continue
            seen.add(key)
            source_id = "fast-web-" + hashlib.sha256(url.encode()).hexdigest()[:16]
            result.append(
                CitationOut(
                    source_id=source_id,
                    title=str(raw.get("title") or url).strip(),
                    authority="Native web source",
                    url=url,
                )
            )
        return result

    @staticmethod
    def _compact_sources(sources: list[CitationOut]) -> list[str]:
        return [source.title for source in sources]

    def _debug(
        self,
        *,
        elapsed_ms: float,
        native_web_used: bool,
        source_count: int,
        completion_status: str,
        response_id: str | None,
        provider_elapsed_ms: float | None,
    ) -> dict[str, Any]:
        return {
            "fast_direct_luna": {
                "model": self.model,
                "reasoning_effort": self.reasoning_effort,
                "elapsed_ms": round(elapsed_ms),
                "provider_elapsed_ms": round(provider_elapsed_ms)
                if provider_elapsed_ms is not None
                else None,
                "native_web_used": native_web_used,
                "native_web_source_count": source_count,
                "completion_status": completion_status,
                "response_id": response_id,
                "tool_contract": ["web_search"],
                "application_research_loop": False,
                "skipped_pipeline": [
                    "default_agent_runtime",
                    "flat_rag",
                    "local_legal_retrieval",
                    "schedule_navigation",
                    "graph_navigation",
                    "exact_legal_lookup",
                    "phase6_checker",
                    "reasoning_bank",
                    "pfvd",
                ],
            }
        }
