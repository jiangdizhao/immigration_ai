from __future__ import annotations

import logging
import os
import re
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas.query import QueryRequest, QueryResponse

logger = logging.getLogger(__name__)

POLITICS_SENSITIVE_TERMS = (
    "election",
    "vote",
    "voting",
    "voter",
    "candidate",
    "campaign",
    "political party",
    "party politics",
    "persuade voters",
    "who should i vote",
    "how should i vote",
    "referendum",
    "ballot",
    "民主党",
    "共和党",
    "工党",
    "自由党",
    "选举",
    "投票",
    "拉票",
    "竞选",
    "候选人",
    "政党",
    "公投",
)

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
    - a lightweight local politics-sensitive gate runs before the model call;
    - GPT-5.6 Terra is attempted first, then GPT-5.6 Luna;
    - the Responses API web_search tool is enabled for agentic live research;
    - actual web-search sources are captured without an artificial cap;
    - transient primary-model failures receive bounded retries before fallback.
    """

    def __init__(self) -> None:
        self.settings = get_settings()

        self.primary_model = os.getenv(
            "PREMIUM_DIRECT_PRIMARY_MODEL",
            os.getenv("PREMIUM_DIRECT_MODEL", "gpt-5.6-terra"),
        )
        self.primary_reasoning_effort = os.getenv(
            "PREMIUM_DIRECT_PRIMARY_REASONING_EFFORT",
            os.getenv("PREMIUM_DIRECT_REASONING_EFFORT", "medium"),
        ).strip()
        self.primary_timeout_seconds = float(
            os.getenv(
                "PREMIUM_DIRECT_PRIMARY_TIMEOUT_SECONDS",
                os.getenv("PREMIUM_DIRECT_TIMEOUT_SECONDS", "50"),
            )
        )
        self.primary_max_retries = int(
            os.getenv(
                "PREMIUM_DIRECT_PRIMARY_MAX_RETRIES",
                os.getenv("PREMIUM_DIRECT_OPENAI_MAX_RETRIES", "1"),
            )
        )

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
        self.fallback_max_retries = int(
            os.getenv("PREMIUM_DIRECT_FALLBACK_MAX_RETRIES", "0")
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
        history_text = self._history_text(getattr(payload, "frontend_messages", []) or [])
        model_input = self._model_input(
            history_text=history_text,
            latest_question=question_for_model,
            is_zh=is_zh,
        )
        high_risk = self._looks_high_risk(original_question) or self._looks_high_risk(
            effective_question
        )

        if self._is_politics_sensitive(question_for_model):
            return self._politics_block_response(
                is_zh=is_zh,
                matter_id=matter_id,
                original_question=original_question,
                effective_question=effective_question,
            )

        if not question_for_model:
            return self._empty_question_response(is_zh=is_zh, matter_id=matter_id)

        answer_text, web_sources, model_debug = self._answer_with_fallback(
            model_input=model_input
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
                    "latest_question_char_count": len(question_for_model),
                    "history_char_count": len(history_text),
                    "frontend_history_sent_to_answer_model": bool(history_text),
                    "system_prompt_sent_to_answer_model": False,
                    "max_history_turns": self.max_history_turns,
                    "max_history_chars_per_turn": self.max_history_chars_per_turn,
                    "max_history_total_chars": self.max_history_total_chars,
                    "high_risk_detected": high_risk,
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
    ) -> tuple[str, list[dict[str, str]], dict[str, Any]]:
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
                timeout_seconds=self.primary_timeout_seconds,
                max_retries=self.primary_max_retries,
                model_input=model_input,
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
                "premium_direct_primary_failed; trying fallback model=%s "
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

        logger.info(
            "premium_direct_fallback_request model=%s reasoning_effort=%s "
            "timeout_seconds=%s max_retries=%s web_search=%s "
            "search_context_size=%s input_chars=%s",
            self.fallback_model,
            self.fallback_reasoning_effort or None,
            self.fallback_timeout_seconds,
            self.fallback_max_retries,
            self.web_search_enabled,
            self.web_search_context_size,
            len(model_input),
        )

        fallback_text, fallback_sources, fallback_call_debug = self._call_model(
            model=self.fallback_model,
            reasoning_effort=self.fallback_reasoning_effort,
            timeout_seconds=self.fallback_timeout_seconds,
            max_retries=self.fallback_max_retries,
            model_input=model_input,
        )
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
    ) -> tuple[str, list[dict[str, str]], dict[str, Any]]:
        client = self._client(
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
        )
        request_kwargs: dict[str, Any] = {
            "model": model,
            "input": model_input,
        }

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
                    "tool_choice": "auto",
                    "include": ["web_search_call.action.sources"],
                }
            )

        try:
            response = client.responses.create(**request_kwargs)
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
                response = client.responses.create(**legacy_kwargs)
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
                response = client.responses.create(**closed_book_kwargs)

        answer_text = (getattr(response, "output_text", "") or "").strip()
        web_sources = self._extract_web_sources(response)
        response_id = getattr(response, "id", None)

        return answer_text, web_sources, {
            "response_id": response_id,
            "web_search_request_mode": search_mode,
            "web_search_source_count": len(web_sources),
            "web_search_returned_sources": bool(web_sources),
        }

    def _history_text(self, frontend_messages: list[dict[str, Any]]) -> str:
        rows: list[str] = []
        total_chars = 0

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

            clipped = text[: self.max_history_chars_per_turn]
            row = f"{role}: {clipped}"
            if total_chars + len(row) > self.max_history_total_chars:
                break

            rows.append(row)
            total_chars += len(row)

        rows.reverse()
        return "\n".join(rows)

    def _model_input(
        self,
        *,
        history_text: str,
        latest_question: str,
        is_zh: bool,
    ) -> str:
        if is_zh:
            research_instruction = (
                "请直接、准确、完整地回答用户最新问题。"
                "对于涉及澳大利亚移民法、签证、法规、期限、现行政策或其他可变事实的问题，"
                "使用可用的网页搜索工具进行主动检索；优先检索并引用澳大利亚联邦立法登记册、"
                "澳大利亚内政部、联邦法院或其他一手权威来源。"
                "发现法规交叉引用时应继续追踪，例如从 Schedule 2 追踪到 Schedule 1、"
                "Schedule 3、Migration Act、相关立法文书、过渡条款或判例。"
                "不要因为找到第一个相关页面就停止。"
                "先明确直接结论，再解释决定性规则、不同分支和实际含义；在有助于理解时提供简短例子。"
                "对于无法由来源支持的内容，应明确说明不确定性，不要猜测。"
                "不要自行编造链接或来源列表；实际搜索来源将由系统从工具结果中提取。"
            )
            if history_text:
                return (
                    "以下是最近对话。必须正确理解诸如“第二个”“是的”“之前”等依赖上下文的简短回复，"
                    "不要把它们当作新的独立问题：\n"
                    f"{history_text}\n\n"
                    "用户最新问题：\n"
                    f"{latest_question}\n\n"
                    f"{research_instruction}"
                )
            return f"{latest_question}\n\n{research_instruction}"

        research_instruction = (
            "Answer the latest question directly, precisely and comprehensively. "
            "For Australian immigration law, visas, legislation, deadlines, current policy, "
            "or other changeable factual matters, use the available web-search tool proactively. "
            "Prioritise primary authoritative sources such as the Federal Register of Legislation, "
            "the Department of Home Affairs, Federal Court decisions and other official Australian "
            "government material. Follow legislative cross-references rather than stopping at the "
            "first relevant page—for example, continue from Schedule 2 into Schedule 1, Schedule 3, "
            "the Migration Act, legislative instruments, transitional provisions or case law when "
            "the controlling rule requires it. Do not stop merely because one relevant result has "
            "been found. State the direct conclusion first, then explain the controlling rule, "
            "material branches and practical meaning. Include a concise worked example where it "
            "materially improves understanding. Clearly identify uncertainty when authoritative "
            "sources do not establish the answer, and do not guess. Do not invent links or a source "
            "list; the system will extract the actual sources returned by the search tool."
        )
        if history_text:
            return (
                "Recent chat history follows. Correctly resolve short contextual replies such as "
                "'the second', 'yes', or 'before that date'; do not treat them as unrelated new "
                "questions:\n"
                f"{history_text}\n\n"
                "Latest user question:\n"
                f"{latest_question}\n\n"
                f"{research_instruction}"
            )
        return f"{latest_question}\n\n{research_instruction}"

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

    def _is_politics_sensitive(self, text: str) -> bool:
        lowered = text.lower()
        return any(term in lowered for term in POLITICS_SENSITIVE_TERMS)

    def _looks_high_risk(self, text: str) -> bool:
        lowered = text.lower()
        return any(term in lowered for term in HIGH_RISK_TERMS)

    def _politics_block_response(
        self,
        *,
        is_zh: bool,
        matter_id: str | None,
        original_question: str,
        effective_question: str,
    ) -> QueryResponse:
        answer = (
            "抱歉，我不能帮助处理政治敏感、选举、投票建议或政治说服类请求。你可以改问澳大利亚移民或签证方面的一般问题。"
            if is_zh
            else "Sorry, I cannot help with politically sensitive, election, voting-advice, or political-persuasion requests. You can ask a general Australian immigration or visa question instead."
        )
        return QueryResponse(
            matter_id=matter_id,
            answer=answer,
            response_language="zh" if is_zh else "en",
            confidence="high",
            user_display_mode="general_with_warning",
            issue_type="politics_sensitive_block",
            missing_facts=[],
            follow_up_questions=[],
            citations=[],
            compact_sources=[
                "Local politics-sensitive safety filter — no answer model was called."
            ],
            escalate=False,
            next_action="answer",
            retrieval_debug={
                "original_question": original_question,
                "effective_question": effective_question,
                "premium_direct_answer": {
                    "used": False,
                    "blocked_by_politics_filter": True,
                    "politics_filter_type": "local_lightweight_gate",
                    "answer_model_called": False,
                    "answer_model_input": None,
                    "reference_status_shown": True,
                },
            },
        )

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
