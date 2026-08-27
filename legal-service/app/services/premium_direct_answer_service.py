from __future__ import annotations

import logging
import os
import re
import time
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryRequest, QueryResponse
from app.services.agent_observability_service import AbsoluteTurnDeadline

logger = logging.getLogger(__name__)

HIGH_RISK_TERMS = (
    "refusal",
    "refused",
    "cancel",
    "cancellation",
    "section 48",
    "s48",
    "bridging visa e",
    "bve",
    "unlawful",
    "overstay",
    "detention",
    "character",
    "501",
    "health waiver",
    "deadline",
    "aat",
    "art",
    "tribunal",
    "ministerial intervention",
)

REFERENCE_HEADING_MARKERS = (
    "reference",
    "references",
    "source",
    "sources",
    "sources to verify",
    "参考",
    "来源",
    "核对来源",
)


class PremiumDirectAnswerService:
    """Agentic direct-answer lane for the UI's premium LLM option.

    Contract for this lane:
    - no Schedule/PFVD/RAG/helper prompt chain;
    - no full semantic-turn router;
    - recent chat history is preserved for follow-up continuity;
    - the authoritative deterministic political gate runs at FastAPI ingress
      before this service is constructed;
    - the configured Premium primary model is attempted first, then the
      configured fallback model;
    - the Responses API web_search tool is enabled for agentic live research;
    - actual web-search sources are captured without an artificial cap;
    - primary and fallback requests share one absolute lane deadline and use
      zero SDK retries.
    """

    def __init__(self) -> None:
        self.settings = get_settings()

        self.primary_model = os.getenv(
            "PREMIUM_DIRECT_PRIMARY_MODEL",
            os.getenv("PREMIUM_DIRECT_MODEL", "gpt-5.6-sol"),
        )
        self.primary_reasoning_effort = os.getenv(
            "PREMIUM_DIRECT_PRIMARY_REASONING_EFFORT",
            os.getenv("PREMIUM_DIRECT_REASONING_EFFORT", "high"),
        ).strip()
        self.primary_timeout_seconds = float(
            os.getenv(
                "PREMIUM_DIRECT_PRIMARY_TIMEOUT_SECONDS",
                os.getenv("PREMIUM_DIRECT_TIMEOUT_SECONDS", "50"),
            )
        )
        configured_primary_retries = int(
            os.getenv(
                "PREMIUM_DIRECT_PRIMARY_MAX_RETRIES",
                os.getenv("PREMIUM_DIRECT_OPENAI_MAX_RETRIES", "0"),
            )
        )
        if configured_primary_retries:
            logger.warning(
                "Premium Direct primary retries are fixed at zero; configured value=%s ignored",
                configured_primary_retries,
            )
        self.primary_max_retries = 0

        self.fallback_model = os.getenv(
            "PREMIUM_DIRECT_FALLBACK_MODEL",
            "gpt-5.6-luna",
        )
        self.fallback_reasoning_effort = os.getenv(
            "PREMIUM_DIRECT_FALLBACK_REASONING_EFFORT",
            "medium",
        ).strip()
        self.fallback_timeout_seconds = float(
            os.getenv("PREMIUM_DIRECT_FALLBACK_TIMEOUT_SECONDS", "55")
        )
        configured_fallback_retries = int(
            os.getenv("PREMIUM_DIRECT_FALLBACK_MAX_RETRIES", "0")
        )
        if configured_fallback_retries:
            logger.warning(
                "Premium Direct fallback retries are fixed at zero; configured value=%s ignored",
                configured_fallback_retries,
            )
        self.fallback_max_retries = 0

        # Premium Direct uses the existing 45-second Premium backend contract
        # by default.  A direct-lane override is available for controlled
        # deployments, but primary and fallback always share this one budget;
        # it is intentionally below the frontend's 170-second request timeout.
        self.lane_budget_ms = int(
            os.getenv(
                "PREMIUM_DIRECT_LANE_BUDGET_MS",
                str(self.settings.premium_turn_deadline_ms),
            )
        )
        self.minimum_fallback_budget_ms = int(
            os.getenv("PREMIUM_DIRECT_MIN_FALLBACK_BUDGET_MS", "1000")
        )
        self.max_tool_calls = self._env_int(
            "PREMIUM_DIRECT_MAX_TOOL_CALLS",
            default=3,
            minimum=1,
            maximum=10,
        )

        self.web_search_enabled = self._env_bool(
            "PREMIUM_DIRECT_WEB_SEARCH_ENABLED",
            default=True,
        )
        self.web_search_required = self._env_bool(
            "PREMIUM_DIRECT_WEB_SEARCH_REQUIRED",
            default=False,
        )
        self.web_search_context_size = (
            os.getenv("PREMIUM_DIRECT_WEB_SEARCH_CONTEXT_SIZE", "high").strip().lower()
            or "high"
        )
        if self.web_search_context_size not in {"low", "medium", "high"}:
            logger.warning(
                "Invalid PREMIUM_DIRECT_WEB_SEARCH_CONTEXT_SIZE=%s; using high",
                self.web_search_context_size,
            )
            self.web_search_context_size = "high"

        self.service_tier = os.getenv("PREMIUM_DIRECT_SERVICE_TIER", "").strip()
        self.max_history_turns = int(os.getenv("PREMIUM_DIRECT_MAX_HISTORY_TURNS", "8"))
        self.max_history_chars_per_turn = int(
            os.getenv("PREMIUM_DIRECT_MAX_HISTORY_CHARS_PER_TURN", "900")
        )
        self.max_history_total_chars = int(
            os.getenv("PREMIUM_DIRECT_MAX_HISTORY_TOTAL_CHARS", "6000")
        )

    @staticmethod
    def _env_bool(name: str, *, default: bool) -> bool:
        raw = os.getenv(name)
        if raw is None:
            return default
        return raw.strip().lower() in {"1", "true", "yes", "on"}

    @staticmethod
    def _env_int(name: str, *, default: int, minimum: int, maximum: int) -> int:
        raw = os.getenv(name)
        try:
            value = default if raw is None else int(raw)
        except ValueError:
            logger.warning("Invalid %s=%r; using %s", name, raw, default)
            return default
        if not minimum <= value <= maximum:
            logger.warning(
                "Invalid %s=%s; expected %s..%s, using %s",
                name,
                value,
                minimum,
                maximum,
                default,
            )
            return default
        return value

    def _client(self, *, timeout_seconds: float, max_retries: int) -> OpenAI:
        if not self.settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is missing from backend settings.")
        return OpenAI(
            api_key=self.settings.openai_api_key,
            max_retries=max_retries,
            timeout=timeout_seconds,
        )

    def answer(
        self,
        *,
        payload: QueryRequest,
        original_question: str,
        effective_question: str,
        response_language: str,
        matter_id: str | None,
        semantic_turn_debug: dict[str, Any] | None = None,
    ) -> QueryResponse:
        is_zh = response_language == "zh"
        question_for_model = original_question.strip() or effective_question.strip()

        if not question_for_model:
            return self._empty_question_response(is_zh=is_zh, matter_id=matter_id)

        # Start the direct lane budget before history/prompt assembly and carry
        # this same monotonic deadline through both provider attempts.
        lane_deadline = AbsoluteTurnDeadline(
            started_at=time.perf_counter(),
            turn_deadline_ms=self.lane_budget_ms,
        )

        history_text = self._history_text(
            getattr(payload, "frontend_messages", []) or [],
            latest_question=question_for_model,
        )
        model_input = self._model_input(
            history_text=history_text,
            latest_question=question_for_model,
            is_zh=is_zh,
        )
        instructions = self._model_instructions(is_zh=is_zh)
        high_risk = self._looks_high_risk(original_question) or self._looks_high_risk(
            effective_question
        )

        answer_text, web_sources, model_debug = self._answer_with_fallback(
            model_input=model_input,
            instructions=instructions,
            deadline=lane_deadline,
        )

        if not answer_text:
            answer_text = (
                "抱歉，我现在无法生成快速研究答复。建议改用默认法律核对模式，或请律师人工确认。"
                if is_zh
                else "Sorry, I could not generate a quick research answer. Please use the default legal-check mode or ask the lawyer to confirm manually."
            )

        if web_sources:
            answer_text = self._append_actual_web_sources(
                answer_text=answer_text,
                sources=web_sources,
                is_zh=is_zh,
            )
            compact_sources = self._format_compact_sources(web_sources)
        else:
            compact_sources = self._extract_reference_lines(answer_text)

        answer_text = self._with_research_notice(
            answer_text,
            is_zh=is_zh,
            live_web_search_used=bool(web_sources),
        )

        return QueryResponse(
            matter_id=matter_id,
            answer=answer_text,
            response_language="zh" if is_zh else "en",
            confidence="medium" if not high_risk else "low",
            user_display_mode="general_with_warning",
            issue_type="premium_direct_answer",
            missing_facts=[],
            follow_up_questions=[],
            citations=[],
            compact_sources=compact_sources,
            escalate=high_risk,
            next_action="suggest_consultation" if high_risk else "answer",
            retrieval_debug={
                "original_question": original_question,
                "effective_question": effective_question,
                "semantic_turn_analysis": semantic_turn_debug or {},
                "premium_direct_answer": {
                    "used": True,
                    "source_verified": False,
                    "live_web_search_enabled": self.web_search_enabled,
                    "live_web_search_required": self.web_search_required,
                    "live_web_search_used": bool(web_sources),
                    "web_search_context_size": self.web_search_context_size,
                    "references_are_model_provided": not bool(web_sources),
                    "reference_extraction": (
                        "openai_responses_web_search_sources_without_cap"
                        if web_sources
                        else "from_direct_llm_answer_body_without_cap"
                    ),
                    "reference_count": len(compact_sources),
                    "politics_filter_preserved": True,
                    "politics_filter_type": "local_lightweight_gate",
                    "answer_model_input": (
                        "lightweight_history_plus_latest_user_question_with_agentic_web_research_instruction"
                    ),
                    "answer_model_input_char_count": len(model_input),
                    "answer_model_instructions_char_count": len(instructions),
                    "latest_question_char_count": len(question_for_model),
                    "history_char_count": len(history_text),
                    "frontend_history_sent_to_answer_model": bool(history_text),
                    "system_prompt_sent_to_answer_model": False,
                    "max_history_turns": self.max_history_turns,
                    "max_history_chars_per_turn": self.max_history_chars_per_turn,
                    "max_history_total_chars": self.max_history_total_chars,
                    "high_risk_detected": high_risk,
                    "max_tool_calls": self.max_tool_calls,
                    "premium_lane_budget_ms": self.lane_budget_ms,
                    **model_debug,
                    "skipped_pipeline": [
                        "semantic_turn_router",
                        "proposal_first_verification_depth",
                        "schedule2_ranked_candidate_map",
                        "local_rag_retrieval",
                        "local_citation_packaging",
                        "customer_answer_plan_helper_chain",
                    ],
                },
            },
        )

    def _answer_with_fallback(
        self,
        *,
        model_input: str,
        instructions: str = "",
        deadline: AbsoluteTurnDeadline | None = None,
    ) -> tuple[str, list[dict[str, str]], dict[str, Any]]:
        deadline = deadline or AbsoluteTurnDeadline(
            started_at=time.perf_counter(),
            turn_deadline_ms=self.lane_budget_ms,
        )
        primary_budget_ms = min(
            max(0.0, self.primary_timeout_seconds * 1000.0),
            deadline.remaining_ms(),
        )
        primary_debug = {
            "primary_model": self.primary_model,
            "primary_reasoning_effort": self.primary_reasoning_effort or None,
            "primary_timeout_seconds": self.primary_timeout_seconds,
            "primary_max_retries": self.primary_max_retries,
            "fallback_model": self.fallback_model,
            "fallback_reasoning_effort": self.fallback_reasoning_effort or None,
            "fallback_timeout_seconds": self.fallback_timeout_seconds,
            "fallback_max_retries": self.fallback_max_retries,
            "service_tier": self.service_tier or None,
            "premium_lane_budget_ms": self.lane_budget_ms,
            "primary_budget_ms": primary_budget_ms,
            "fallback_budget_ms": 0.0,
            "fallback_skipped_due_to_budget": False,
        }

        if primary_budget_ms <= 0:
            return "", [], {
                **primary_debug,
                "primary_failed": True,
                "primary_error_type": "PremiumLaneBudgetExhausted",
                "fallback_skipped_due_to_budget": True,
            }

        logger.info(
            "premium_direct_primary_request model=%s reasoning_effort=%s timeout_seconds=%s "
            "max_retries=%s web_search=%s search_context_size=%s input_chars=%s "
            "fallback_model=%s",
            self.primary_model,
            self.primary_reasoning_effort or None,
            self.primary_timeout_seconds,
            self.primary_max_retries,
            self.web_search_enabled,
            self.web_search_context_size,
            len(model_input),
            self.fallback_model,
        )

        try:
            primary_text, primary_sources, primary_call_debug = self._call_model(
                model=self.primary_model,
                reasoning_effort=self.primary_reasoning_effort,
                timeout_seconds=primary_budget_ms / 1000.0,
                max_retries=self.primary_max_retries,
                model_input=model_input,
                instructions=instructions,
                deadline=deadline,
            )
            if primary_text:
                return primary_text, primary_sources, {
                    **primary_debug,
                    **primary_call_debug,
                    "serving_model": self.primary_model,
                    "used_fallback_model": False,
                    "primary_failed": False,
                }
            raise RuntimeError("primary model returned empty output_text")
        except Exception as exc:
            logger.warning(
                "premium_direct_primary_failed; evaluating fallback model=%s "
                "error_type=%s error=%s",
                self.fallback_model,
                exc.__class__.__name__,
                str(exc)[:500],
            )
            primary_error_debug = {
                "primary_failed": True,
                "primary_error_type": exc.__class__.__name__,
                "primary_error": str(exc)[:1000],
            }

        fallback_budget_ms = min(
            max(0.0, self.fallback_timeout_seconds * 1000.0),
            deadline.remaining_ms(),
        )
        if fallback_budget_ms < self.minimum_fallback_budget_ms:
            logger.info(
                "premium_direct_fallback_skipped_due_to_budget remaining_ms=%s",
                fallback_budget_ms,
            )
            return "", [], {
                **primary_debug,
                **primary_error_debug,
                "fallback_budget_ms": fallback_budget_ms,
                "fallback_skipped_due_to_budget": True,
            }

        primary_debug["fallback_budget_ms"] = fallback_budget_ms
        logger.info(
            "premium_direct_fallback_request model=%s reasoning_effort=%s "
            "timeout_seconds=%s max_retries=%s web_search=%s "
            "search_context_size=%s input_chars=%s",
            self.fallback_model,
            self.fallback_reasoning_effort or None,
            fallback_budget_ms / 1000.0,
            self.fallback_max_retries,
            self.web_search_enabled,
            self.web_search_context_size,
            len(model_input),
        )

        try:
            fallback_text, fallback_sources, fallback_call_debug = self._call_model(
                model=self.fallback_model,
                reasoning_effort=self.fallback_reasoning_effort,
                timeout_seconds=fallback_budget_ms / 1000.0,
                max_retries=self.fallback_max_retries,
                model_input=model_input,
                instructions=instructions,
                deadline=deadline,
            )
        except Exception as exc:
            logger.warning(
                "premium_direct_fallback_failed error_type=%s error=%s",
                exc.__class__.__name__,
                str(exc)[:500],
            )
            return "", [], {
                **primary_debug,
                **primary_error_debug,
                "fallback_budget_ms": fallback_budget_ms,
                "fallback_failed": True,
                "fallback_error_type": exc.__class__.__name__,
                "fallback_error": str(exc)[:1000],
            }
        return fallback_text, fallback_sources, {
            **primary_debug,
            **primary_error_debug,
            **fallback_call_debug,
            "serving_model": self.fallback_model,
            "used_fallback_model": True,
        }

    def _call_model(
        self,
        *,
        model: str,
        reasoning_effort: str,
        timeout_seconds: float,
        max_retries: int,
        model_input: str,
        instructions: str = "",
        deadline: AbsoluteTurnDeadline | None = None,
    ) -> tuple[str, list[dict[str, str]], dict[str, Any]]:
        def create_response(request_kwargs: dict[str, Any]) -> Any:
            request_timeout_seconds = timeout_seconds
            if deadline is not None:
                remaining_ms = deadline.remaining_ms()
                if remaining_ms <= 0:
                    raise TimeoutError("Premium Direct lane deadline exhausted")
                request_timeout_seconds = min(timeout_seconds, remaining_ms / 1000.0)
            client = self._client(
                timeout_seconds=request_timeout_seconds,
                max_retries=max_retries,
            )
            return client.responses.create(**request_kwargs)

        request_kwargs: dict[str, Any] = {
            "model": model,
            "input": model_input,
        }
        if instructions:
            request_kwargs["instructions"] = instructions

        effort = (reasoning_effort or "").strip()
        if effort and effort.lower() not in {"none", "off", "false", "0"}:
            request_kwargs["reasoning"] = {"effort": effort}

        if self.service_tier:
            request_kwargs["service_tier"] = self.service_tier

        search_mode = "disabled"
        if self.web_search_enabled:
            search_mode = "web_search"
            request_kwargs.update(
                {
                    "tools": [
                        {
                            "type": "web_search",
                            "search_context_size": self.web_search_context_size,
                        }
                    ],
                    "tool_choice": "required" if self.web_search_required else "auto",
                    "max_tool_calls": self.max_tool_calls,
                    "include": ["web_search_call.action.sources"],
                }
            )

        try:
            response = create_response(request_kwargs)
        except TypeError as exc:
            if not self.web_search_enabled:
                raise
            logger.warning(
                "premium_direct_web_search_modern_sdk_type_error; "
                "trying legacy web_search_preview model=%s error=%s",
                model,
                str(exc)[:300],
            )
            legacy_kwargs = dict(request_kwargs)
            legacy_kwargs.pop("include", None)
            legacy_kwargs["tools"] = [
                {
                    "type": "web_search_preview",
                    "search_context_size": self.web_search_context_size,
                }
            ]
            search_mode = "web_search_preview"
            try:
                response = create_response(legacy_kwargs)
            except TypeError:
                if self.web_search_required:
                    raise
                logger.warning(
                    "premium_direct_web_search_unavailable; using closed-book request model=%s",
                    model,
                )
                closed_book_kwargs = dict(request_kwargs)
                closed_book_kwargs.pop("include", None)
                closed_book_kwargs.pop("tools", None)
                closed_book_kwargs.pop("tool_choice", None)
                search_mode = "closed_book_after_search_tool_unavailable"
                response = create_response(closed_book_kwargs)

        answer_text = (getattr(response, "output_text", "") or "").strip()
        web_sources = self._extract_web_sources(response)
        response_id = getattr(response, "id", None)

        return answer_text, web_sources, {
            "response_id": response_id,
            "web_search_request_mode": search_mode,
            "web_search_source_count": len(web_sources),
            "web_search_returned_sources": bool(web_sources),
        }

    def _history_text(
        self,
        frontend_messages: list[dict[str, Any]],
        *,
        latest_question: str = "",
    ) -> str:
        rows: list[str] = []
        total_chars = 0
        latest_history_item_seen = False

        for item in reversed(frontend_messages):
            if len(rows) >= self.max_history_turns:
                break
            if not isinstance(item, dict):
                continue

            role = str(item.get("role") or "user").strip().lower()
            if role not in {"user", "assistant"}:
                continue

            text = str(item.get("text") or "").strip()
            if not text:
                parts = item.get("parts")
                if isinstance(parts, list):
                    text = "\n".join(
                        str(part.get("text") or "").strip()
                        for part in parts
                        if isinstance(part, dict) and part.get("type") == "text"
                    ).strip()

            if not text:
                continue

            if not latest_history_item_seen:
                latest_history_item_seen = True
                if (
                    role == "user"
                    and self._normalized_context_text(text)
                    == self._normalized_context_text(latest_question)
                ):
                    continue

            clipped = text[: self.max_history_chars_per_turn]
            row = f"{role}: {clipped}"
            if total_chars + len(row) > self.max_history_total_chars:
                break

            rows.append(row)
            total_chars += len(row)

        rows.reverse()
        return "\n".join(rows)

    @staticmethod
    def _normalized_context_text(value: str) -> str:
        return " ".join(value.split()).casefold()

    def _model_input(
        self,
        *,
        history_text: str,
        latest_question: str,
        is_zh: bool,
    ) -> str:
        if history_text:
            return (
                "Recent conversation context:\n"
                f"{history_text}\n\n"
                "Latest user question:\n"
                f"{latest_question}"
            )
        return latest_question

    def _model_instructions(self, *, is_zh: bool) -> str:
        if is_zh:
            return (
                "请直接、准确、完整地回答用户最新问题。仅当答案实质上依赖当前或近期变化的信息、"
                "准确的法规或立法文书措辞、决定性法律交叉引用、模型不确定的事实，或需要权威核实时，"
                "才使用可用的网页搜索工具；如果无需研究即可可靠回答，不要调用研究工具。"
                "需要研究时，优先使用澳大利亚联邦立法登记册、澳大利亚内政部、联邦法院及其他官方政府来源。"
                "必要时追踪具有实质意义的法律交叉引用；获得足够证据后停止研究。"
                "不要因为工具可用就穷尽式研究，不要猜测，也不要编造引用或链接。"
            )
        return (
            "Answer the user's latest question directly, accurately, and completely. Use available web search "
            "only when needed to verify current or changing legal requirements, exact legal wording, material "
            "cross-references, uncertain facts, or information requiring authoritative verification. Do not use "
            "research unnecessarily. When research is needed, prefer authoritative Australian primary and official "
            "sources such as the Federal Register of Legislation, the Department of Home Affairs, Federal Court "
            "decisions, and other official government sources. Follow material cross-references when necessary, "
            "and stop researching once sufficient evidence exists to answer. Do not perform exhaustive research "
            "merely because tools are available. Do not guess or fabricate citations or URLs."
        )

    @staticmethod
    def _response_to_dict(response: Any) -> dict[str, Any]:
        if isinstance(response, dict):
            return response
        model_dump = getattr(response, "model_dump", None)
        if callable(model_dump):
            dumped = model_dump()
            if isinstance(dumped, dict):
                return dumped
        return {}

    def _extract_web_sources(self, response: Any) -> list[dict[str, str]]:
        data = self._response_to_dict(response)
        found: list[dict[str, str]] = []
        seen: set[str] = set()

        def add_source(raw: Any) -> None:
            if not isinstance(raw, dict):
                return

            nested = raw.get("url_citation")
            if isinstance(nested, dict):
                candidate = {**raw, **nested}
            else:
                candidate = raw

            url = str(candidate.get("url") or "").strip()
            if not url:
                return

            title = str(
                candidate.get("title")
                or candidate.get("name")
                or candidate.get("site_name")
                or url
            ).strip()
            key = url.rstrip("/").lower()
            if key in seen:
                return
            seen.add(key)
            found.append({"title": title or url, "url": url})

        output = data.get("output")
        if not isinstance(output, list):
            return found

        for item in output:
            if not isinstance(item, dict):
                continue

            action = item.get("action")
            if isinstance(action, dict):
                for key in ("sources", "results"):
                    values = action.get(key)
                    if isinstance(values, list):
                        for value in values:
                            add_source(value)

            for key in ("sources", "results"):
                values = item.get(key)
                if isinstance(values, list):
                    for value in values:
                        add_source(value)

            content = item.get("content")
            if isinstance(content, list):
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    annotations = part.get("annotations")
                    if isinstance(annotations, list):
                        for annotation in annotations:
                            add_source(annotation)

        return found

    @staticmethod
    def _format_compact_sources(sources: list[dict[str, str]]) -> list[str]:
        return [
            f"{source['title']} — {source['url']}"
            for source in sources
            if source.get("url")
        ]

    def _append_actual_web_sources(
        self,
        *,
        answer_text: str,
        sources: list[dict[str, str]],
        is_zh: bool,
    ) -> str:
        if not sources:
            return answer_text

        heading = "## 实际网页搜索来源" if is_zh else "## Actual web-search sources"
        lines = [heading]
        for source in sources:
            title = source.get("title") or source.get("url") or "Source"
            url = source.get("url") or ""
            if url:
                lines.append(f"- [{title}]({url})")

        return f"{answer_text.rstrip()}\n\n" + "\n".join(lines)

    def _extract_reference_lines(self, answer_text: str) -> list[str]:
        lines = answer_text.splitlines()
        start_index: int | None = None

        for idx, line in enumerate(lines):
            normalized = line.strip().lower().strip("#*:： ")
            if any(marker in normalized for marker in REFERENCE_HEADING_MARKERS):
                start_index = idx + 1

        if start_index is None:
            return []

        references: list[str] = []
        for line in lines[start_index:]:
            stripped = line.strip()
            if not stripped:
                if references:
                    break
                continue

            normalized = stripped.lower().strip("#*:： ")
            if references and any(
                marker in normalized for marker in REFERENCE_HEADING_MARKERS
            ):
                continue

            cleaned = re.sub(r"^[-*•\u2022\s]+", "", stripped)
            cleaned = re.sub(r"^\d+[.)、]\s*", "", cleaned).strip()
            if cleaned:
                references.append(cleaned)

        return references

    def _looks_high_risk(self, text: str) -> bool:
        lowered = text.lower()
        return any(term in lowered for term in HIGH_RISK_TERMS)

    def _empty_question_response(
        self,
        *,
        is_zh: bool,
        matter_id: str | None,
    ) -> QueryResponse:
        answer = "请先输入一个问题。" if is_zh else "Please enter a question first."
        return QueryResponse(
            matter_id=matter_id,
            answer=answer,
            response_language="zh" if is_zh else "en",
            confidence="high",
            user_display_mode="direct_short",
            issue_type="premium_direct_answer",
            missing_facts=[],
            follow_up_questions=[],
            citations=[],
            compact_sources=[],
            escalate=False,
            next_action="ask_followup",
            retrieval_debug={
                "premium_direct_answer": {
                    "used": False,
                    "answer_model_called": False,
                    "reason": "empty_question",
                }
            },
        )

    def _with_research_notice(
        self,
        answer_text: str,
        *,
        is_zh: bool,
        live_web_search_used: bool,
    ) -> str:
        if live_web_search_used:
            notice = (
                "提示：这是使用实时网页搜索生成的 AI 快速研究答复，但未经过本地法规库的独立核对；"
                "用于个案决策前仍应由律师确认。"
                if is_zh
                else "Note: this AI quick research answer used live web search, but it has not been independently checked against the local legal database. Have the lawyer confirm it before using it for case-specific decisions."
            )
        else:
            notice = (
                "提示：这是 AI 快速答复，本次未获得可确认的实时网页搜索来源，也未经过本地法规库核对；"
                "请作为一般信息，并由律师确认后再用于个案决策。"
                if is_zh
                else "Note: this is an AI quick answer. No confirmable live web-search sources were returned, and it has not been checked against the local legal database. Treat it as general information and have the lawyer confirm it before using it for case-specific decisions."
            )

        if answer_text.startswith(notice):
            return answer_text
        return f"{notice}\n\n{answer_text}"
