"""Phase 5 — Agent runtime service.

Core Luna shadow execution: provider/tool loop with absolute deadline,
terminal submit handling, evidence registry, and metrics.

This is the SHADOW runtime — it does NOT serve customer answers.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from app.schemas.agent import (
    AgentExecutionMetrics,
    AgentRuntimeRequest,
    AgentSubmissionV2,
    ProviderCallObservation,
    ToolCallObservation,
)
from app.schemas.tools import ToolResultEnvelope
from app.core.config import get_settings
from app.services.agent_observability_service import (
    AbsoluteTurnDeadline,
    AgentObservabilityService,
    TurnDeadlineExceeded,
)
from app.services.agent_policy_service import AgentPolicyService
from app.services.request_evidence_registry import RequestEvidenceRegistry
from app.services.search_privacy_guard import SearchPrivacyGuard
from app.services.tool_executor_service import (
    ToolCallRequest,
    ToolExecutorContext,
    ToolExecutorService,
)
from app.tools.base import build_tool_result
from app.services.web_evidence_normalizer import WebEvidenceNormalizer
from app.services.compact_checker_service import CompactCheckerService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Provider interface
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class ProviderResponse:
    """Response from a provider call."""

    response_id: str
    model: str
    status: Literal["ok", "timeout", "error"]
    text: str | None = None
    tool_calls: list[ToolCallRequest] = field(default_factory=list)
    input_tokens: int | None = None
    cached_input_tokens: int | None = None
    reasoning_tokens: int | None = None
    output_tokens: int | None = None
    duration_ms: float = 0.0
    raw_response: Any = None
    pii_violation_count: int = 0
    # Phase 5.1A.1: content-free aggregated search-privacy violation category
    # counts (category -> count). Never stores raw query text, hashes, names,
    # or identifier values.
    search_privacy_violation_categories: dict[str, int] = field(default_factory=dict)
    # Phase 5.1A observability: the actual reasoning effort sent to the provider.
    # Populated by providers that expose/config the effort explicitly.
    effort: str | None = None
    # Phase 5.1A: provider-native built-in web_search usage observed directly from
    # the provider output (OpenAI hosted web_search), NOT custom backend function
    # calls and NOT model prose/guessed URLs.
    native_web_search_call_count: int = 0
    native_web_source_count: int = 0
    native_web_citation_count: int = 0


class ProviderInterface:
    """Abstract interface for LLM provider calls.

    In production, this wraps the OpenAI Responses API.
    For Phase 5 implementation tests, use a mock.
    """

    async def call(
        self,
        *,
        system_prompt: str,
        user_text: str,
        model: str,
        tools: list[dict[str, Any]],
        tool_choice: Literal["auto"] = "auto",
        reasoning_effort: str | None = None,
        messages_history: list[dict[str, Any]] | None = None,
        timeout_ms: float,
        registry: RequestEvidenceRegistry | None = None,
        previous_response_id: str | None = None,
    ) -> ProviderResponse:
        raise NotImplementedError("use a mock for implementation tests")


# ---------------------------------------------------------------------------
# Agent runtime
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class ShadowRunResult:
    """Complete result of a shadow agent run."""

    request_id: str
    turn_id: str
    experiment_arm: str | None
    model: str
    status: Literal["completed", "timeout", "error", "incomplete"]
    submission: AgentSubmissionV2 | None
    tool_outputs: list[ToolResultEnvelope]
    metrics: AgentExecutionMetrics
    provider_response_ids: list[str]
    terminal_submission_missing: bool
    terminal_submission_continuation_count: int
    errors: list[str]
    terminal_continuation_triggered: bool = False
    terminal_tool_calls: list[ToolCallObservation] = field(default_factory=list)
    shadow_trace: dict[str, Any] | None = None
    checker_status: Literal["not_required", "completed", "failed"] = "not_required"
    checker_call_count: int = 0
    checker_dropped_claim_ids: list[str] = field(default_factory=list)
    checker_dependency_dropped_claim_ids: list[str] = field(default_factory=list)
    checker_latency_ms: float = 0.0


class AgentRuntimeService:
    """Luna shadow agent runtime.

    Executes ONE Luna run with provider/tool loop, absolute deadline,
    terminal submit handling, and evidence registry.

    This is SHADOW ONLY — never serves customer answers.
    """

    def __init__(
        self,
        *,
        provider: ProviderInterface,
        policy_service: AgentPolicyService | None = None,
        tool_executor: ToolExecutorService | None = None,
        observability: AgentObservabilityService | None = None,
        privacy_guard: SearchPrivacyGuard | None = None,
        web_normalizer: WebEvidenceNormalizer | None = None,
    ) -> None:
        self._provider = provider
        self._policy_service = policy_service or AgentPolicyService()
        self._tool_executor = tool_executor or ToolExecutorService()
        self._observability = observability or AgentObservabilityService()
        self._privacy_guard = privacy_guard or SearchPrivacyGuard()
        self._web_normalizer = web_normalizer or WebEvidenceNormalizer()

    async def run_shadow(
        self,
        request: AgentRuntimeRequest,
        *,
        deadline: AbsoluteTurnDeadline,
        registry: RequestEvidenceRegistry,
        flat_rag_search_fn: Any = None,
        db_session: Any = None,
    ) -> ShadowRunResult:
        """Execute one shadow Luna agent run."""
        start_time = time.perf_counter()
        errors: list[str] = []
        provider_response_ids: list[str] = []
        tool_outputs: list[ToolResultEnvelope] = []
        pii_violation_count = 0

        policy = self._policy_service.build_policy(
            mode=request.mode,
            experiment_arm=request.experiment_arm,
        )
        budget = request.execution_budget

        tool_context = ToolExecutorContext(
            request_id=request.request_id,
            registry=registry,
            as_of_date=request.as_of_date,
            deadline_monotonic=deadline.deadline_at,
            allow_model_canonical_refs=request.experiment_arm not in {"A", "L"},
            lightweight_submission=request.experiment_arm == "L",
            flat_rag_search_fn=flat_rag_search_fn,
            db_session=db_session,
            privacy_guard=self._privacy_guard,
            web_normalizer=self._web_normalizer,
        )

        # Build initial input for first call
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": policy.system_prompt},
            {"role": "user", "content": self._build_user_message(request)},
        ]

        provider_call_count = 0
        tool_round_count = 0
        submission_received = False
        submission: AgentSubmissionV2 | None = None
        terminal_missing = False
        continuation_count = 0
        terminal_continuation_triggered = False
        previous_response_id: str | None = None
        flat_rag_executed_count = 0
        flat_rag_denied_count = 0
        provider_retry_skipped_reason: str | None = None
        provider_call_observations: list[ProviderCallObservation] = []
        tool_call_observations: list[ToolCallObservation] = []
        terminal_tool_call_observations: list[ToolCallObservation] = []
        total_provider_duration_ms = 0.0
        total_tool_duration_ms = 0.0
        checker_status: Literal["not_required", "completed", "failed"] = "not_required"
        checker_dropped_claim_ids: list[str] = []
        checker_dependency_dropped_claim_ids: list[str] = []
        checker_latency_ms = 0.0
        checker_call_count = 0
        answer_agent_duration_ms = 0.0
        answer_provider_call_count = 0
        terminal_phase = False
        prev_call_was_failed = False
        prev_call_was_missing_terminal = False

        # Phase 5 resource governance: the answer/research target is a NON-RESETTING
        # stage budget inherited from the SAME original turn start, not a per-call
        # timeout.  Every provider call (initial, continuation, retry) and every
        # research tool round consumes from this shared stage budget.  It never
        # resets to now + answer_research_target_ms.
        research_stage_budget_ms = budget.answer_research_target_ms
        research_stage_deadline_at = deadline.stage_deadline_at(research_stage_budget_ms)

        def _research_stage_remaining_ms() -> float:
            return max(0.0, (research_stage_deadline_at - deadline.clock()) * 1000.0)

        try:
            while provider_call_count < budget.max_provider_calls:
                remaining = deadline.remaining_ms()
                if remaining <= 0:
                    errors.append("Deadline exceeded before provider call")
                    break

                research_remaining = _research_stage_remaining_ms()
                if (
                    research_remaining <= 0
                    or tool_round_count >= budget.max_tool_rounds
                    or provider_call_count >= budget.max_provider_calls - 1
                ):
                    terminal_phase = True

                provider_call_count += 1
                provider_tools = self._provider_tools_for_round(
                    policy.tools,
                    flat_rag_executed_count=flat_rag_executed_count,
                    max_flat_rag_calls=budget.max_flat_rag_calls,
                    terminal_phase=terminal_phase,
                )
                call_timeout_ms = (
                    remaining
                    if terminal_phase
                    else min(remaining, research_remaining)
                )

                try:
                    response = await self._provider.call(
                        system_prompt=policy.system_prompt,
                        user_text="",
                        model=policy.model,
                        tools=provider_tools,
                        tool_choice=policy.tool_choice,
                        reasoning_effort=policy.reasoning_effort,
                        messages_history=messages,
                        timeout_ms=call_timeout_ms,
                        registry=registry,
                        previous_response_id=previous_response_id,
                    )
                except TurnDeadlineExceeded:
                    errors.append("Deadline exceeded during provider call")
                    break
                except Exception as exc:
                    logger.exception("Provider call failed")
                    if provider_call_count <= budget.max_retries + 1:
                        if not self._retry_threshold_met(budget=budget, deadline=deadline):
                            provider_retry_skipped_reason = "retry_viability_threshold_not_met"
                            errors.append(
                                f"Provider call failed (attempt {provider_call_count}); retry skipped because remaining "
                                f"deadline is below retry viability threshold ({budget.retry_viability_threshold_ms}ms)"
                            )
                            break
                        errors.append(f"Provider call failed (attempt {provider_call_count}): {exc}")
                        continue
                    else:
                        provider_retry_skipped_reason = "retry_allowance_exhausted"
                        errors.append(f"Provider call failed after {provider_call_count} attempts: {exc}")
                        break

                provider_response_ids.append(response.response_id)
                pii_violation_count += response.pii_violation_count

                # Record provider-call diagnostic observation (content-free).
                call_kind = "initial"
                if prev_call_was_failed:
                    call_kind = "retry"
                elif provider_call_count > 1 and prev_call_was_missing_terminal:
                    call_kind = "missing_terminal_continuation"
                elif provider_call_count > 1:
                    call_kind = "continuation"
                provider_call_observations.append(ProviderCallObservation(
                    stage="terminal_synthesis" if terminal_phase else "answer_research",
                    call_index=provider_call_count,
                    call_kind=call_kind,
                    response_id=response.response_id or None,
                    previous_response_id=previous_response_id,
                    model=policy.model,
                    effort=response.effort or getattr(policy, "reasoning_effort", None),
                    input_tokens=response.input_tokens,
                    cached_input_tokens=response.cached_input_tokens,
                    reasoning_tokens=response.reasoning_tokens,
                    output_tokens=response.output_tokens,
                    duration_ms=response.duration_ms,
                    timeout_allocated_ms=call_timeout_ms,
                    remaining_deadline_before_call_ms=remaining,
                    research_stage_remaining_before_ms=0 if terminal_phase else research_remaining,
                    absolute_remaining_after_ms=deadline.remaining_ms(),
                    research_stage_remaining_after_ms=0 if terminal_phase else _research_stage_remaining_ms(),
                    returned_tool_call_count=len(response.tool_calls),
                    returned_tool_names=[tc.name for tc in response.tool_calls],
                    web_search_reported=any(tc.name == "web_search" for tc in response.tool_calls),
                    # Phase 5.1A: record actual provider-native built-in web_search use.
                    native_web_search_call_count=response.native_web_search_call_count,
                    native_web_source_count=response.native_web_source_count,
                    native_web_citation_count=response.native_web_citation_count,
                    # Phase 5.1A.1: content-free search-privacy violation category counts.
                    search_privacy_violation_count=response.pii_violation_count,
                    search_privacy_violation_categories=dict(response.search_privacy_violation_categories),
                    input_items_count=len(messages),
                    input_char_count=sum(len(str(m.get("content") or "")) for m in messages),
                    function_output_count=sum(1 for m in messages if m.get("role") == "tool"),
                    tool_definitions_count=len(provider_tools),
                    status=response.status,
                    is_retry=(call_kind == "retry"),
                ))
                total_provider_duration_ms += response.duration_ms
                prev_call_was_failed = response.status in ("timeout", "error")
                prev_call_was_missing_terminal = False

                if response.pii_violation_count:
                    errors.append("Generated web search query failed the privacy policy")
                    break

                # Save response ID for Responses API continuation
                if response.response_id:
                    previous_response_id = response.response_id

                if response.status == "timeout":
                    errors.append("Provider call timed out")
                    if provider_call_count <= budget.max_retries + 1:
                        if not self._retry_threshold_met(budget=budget, deadline=deadline):
                            provider_retry_skipped_reason = "retry_viability_threshold_not_met"
                            errors.append(
                                f"Provider call timed out; retry skipped because remaining "
                                f"deadline is below retry viability threshold ({budget.retry_viability_threshold_ms}ms)"
                            )
                            break
                        continue
                    provider_retry_skipped_reason = "retry_allowance_exhausted"
                    break

                if response.status == "error":
                    errors.append("Provider call returned error")
                    if provider_call_count <= budget.max_retries + 1:
                        if not self._retry_threshold_met(budget=budget, deadline=deadline):
                            provider_retry_skipped_reason = "retry_viability_threshold_not_met"
                            errors.append(
                                f"Provider call returned error; retry skipped because remaining "
                                f"deadline is below retry viability threshold ({budget.retry_viability_threshold_ms}ms)"
                            )
                            break
                        continue
                    provider_retry_skipped_reason = "retry_allowance_exhausted"
                    break

                # Process research/custom calls and terminal submission
                # independently. Research rounds never block submit_answer.
                if response.tool_calls:
                    research_calls = [
                        tc for tc in response.tool_calls
                        if tc.name != "submit_answer"
                        and not (
                            tc.name == "flat_rag_search"
                            and flat_rag_executed_count >= budget.max_flat_rag_calls
                        )
                    ]
                    research_round_available = (not terminal_phase) and bool(research_calls) and (
                        tool_round_count < budget.max_tool_rounds
                    )
                    research_round_counted = False

                    tool_results_for_provider: list[dict[str, Any]] = []
                    terminal_failure = False

                    for tc in response.tool_calls:
                        remaining = deadline.remaining_ms()
                        if remaining <= 0:
                            errors.append("Deadline exceeded before tool execution")
                            break

                        # Research tool execution also consumes the shared
                        # non-resetting answer/research stage budget.
                        research_remaining = (
                            0.0 if terminal_phase else _research_stage_remaining_ms()
                        )
                        if not terminal_phase and research_remaining <= 0:
                            terminal_phase = True
                            research_round_available = False
                            research_remaining = 0.0

                        # web_search is built-in, not a custom function — skip
                        if tc.name == "web_search":
                            if (
                                research_round_available
                                and not research_round_counted
                                and research_remaining > 0
                            ):
                                tool_round_count += 1
                                research_round_counted = True
                            continue

                        if not research_round_available and tc.name != "submit_answer":
                            denied = build_tool_result(
                                tool_call_id=tc.call_id,
                                status="partial",
                                data={
                                    "chunks": [],
                                    "evidence_refs": [],
                                    "denied_reason": "RESEARCH_TOOL_ROUND_BUDGET_EXHAUSTED",
                                },
                                duration_ms=0,
                                error={
                                    "code": "RESEARCH_TOOL_ROUND_BUDGET_EXHAUSTED",
                                    "message": (
                                        f"Research tool-round budget exhausted at "
                                        f"{budget.max_tool_rounds}; submit_answer remains available."
                                    ),
                                },
                            )
                            tool_outputs.append(denied)
                            tool_call_observations.append(ToolCallObservation(
                                tool_name=tc.name,
                                tool_call_id=tc.call_id,
                                round_index=max(1, tool_round_count),
                                status="partial",
                                duration_ms=0.0,
                                remaining_deadline_before_call_ms=remaining,
                                research_stage_remaining_before_ms=research_remaining,
                                absolute_remaining_after_ms=deadline.remaining_ms(),
                                research_stage_remaining_after_ms=_research_stage_remaining_ms(),
                                result_count=0,
                                governor_denied=True,
                                is_retry=False,
                            ))
                            tool_results_for_provider.append({
                                "role": "tool",
                                "tool_call_id": tc.call_id,
                                "content": json.dumps(denied.model_dump(mode="json")),
                            })
                            continue

                        # Phase 5 resource governance: bound the number of actual
                        # flat_rag_search executions per run (not merely tool rounds).
                        # When the bound is exceeded, the additional call is DENIED
                        # with a deterministic envelope, but still returned to the
                        # provider as a tool output so Luna can continue.
                        if tc.name == "flat_rag_search" and flat_rag_executed_count >= budget.max_flat_rag_calls:
                            flat_rag_denied_count += 1
                            denied = build_tool_result(
                                tool_call_id=tc.call_id,
                                status="partial",
                                data={
                                    "chunks": [],
                                    "evidence_refs": [],
                                    "denied_reason": "FLAT_RAG_BUDGET_EXHAUSTED",
                                    "denied_call_count": flat_rag_denied_count,
                                    "flat_rag_calls_limited_to": budget.max_flat_rag_calls,
                                },
                                duration_ms=0,
                                error={
                                    "code": "FLAT_RAG_BUDGET_EXHAUSTED",
                                    "message": (
                                        f"Flat RAG execution budget exhausted: maximum "
                                        f"{budget.max_flat_rag_calls} flat_rag_search execution(s) per run "
                                        f"already performed. Continue with web search or submit the answer "
                                        f"with the evidence already collected."
                                    ),
                                },
                            )
                            tool_outputs.append(denied)
                            tool_results_for_provider.append({
                                "role": "tool",
                                "tool_call_id": tc.call_id,
                                "content": json.dumps(denied.model_dump(mode="json")),
                            })
                            # Record the denied tool execution without consuming
                            # another research round.
                            tool_call_observations.append(ToolCallObservation(
                                tool_name=tc.name,
                                tool_call_id=tc.call_id,
                                round_index=max(1, tool_round_count),
                                status="partial",
                                duration_ms=0.0,
                                remaining_deadline_before_call_ms=remaining,
                                research_stage_remaining_before_ms=research_remaining,
                                absolute_remaining_after_ms=deadline.remaining_ms(),
                                research_stage_remaining_after_ms=_research_stage_remaining_ms(),
                                result_count=0,
                                governor_denied=True,
                                is_retry=False,
                            ))
                            continue

                        result = self._tool_executor.execute_tool(tc, tool_context)
                        tool_outputs.append(result.result)
                        if tc.name == "submit_answer":
                            terminal_tool_call_observations.append(ToolCallObservation(
                                tool_name="submit_answer",
                                tool_call_id=tc.call_id,
                                round_index=max(1, tool_round_count),
                                status=result.result.status,
                                duration_ms=result.duration_ms,
                                remaining_deadline_before_call_ms=remaining,
                                research_stage_remaining_before_ms=research_remaining,
                                absolute_remaining_after_ms=deadline.remaining_ms(),
                                research_stage_remaining_after_ms=_research_stage_remaining_ms(),
                                result_count=None,
                                governor_denied=False,
                                is_retry=False,
                            ))
                        if (
                            tc.name == "flat_rag_search"
                            and not research_round_counted
                            and result.result.status == "ok"
                            and result.result.error is None
                        ):
                            tool_round_count += 1
                            research_round_counted = True

                        # Record research/custom tool observations only. The
                        # terminal action has its own submit counter and must
                        # not appear as a research-round observation.
                        if tc.name != "submit_answer":
                            tool_call_observations.append(ToolCallObservation(
                                tool_name=tc.name,
                                tool_call_id=tc.call_id,
                                round_index=max(1, tool_round_count),
                                status=result.result.status,
                                duration_ms=result.duration_ms,
                                remaining_deadline_before_call_ms=remaining,
                                research_stage_remaining_before_ms=research_remaining,
                                absolute_remaining_after_ms=deadline.remaining_ms(),
                                research_stage_remaining_after_ms=_research_stage_remaining_ms(),
                                result_count=(len(result.result.data.get("chunks", []))
                                              if isinstance(result.result.data.get("chunks"), (list, tuple))
                                              else (len(result.result.data.get("evidence_refs", []))
                                                    if isinstance(result.result.data.get("evidence_refs"), (list, tuple))
                                                    else None)),
                                governor_denied=False,
                                is_retry=False,
                            ))
                        total_tool_duration_ms += result.duration_ms

                        if tc.name == "flat_rag_search":
                            flat_rag_executed_count += 1

                        if tc.name == "submit_answer":
                            if result.submission_action is not None and result.submission_action.action == "accept_submission":
                                if result.submission is None:
                                    errors.append("Accepted terminal submission was not propagated")
                                    terminal_failure = True
                                else:
                                    submission_received = True
                                    terminal_missing = False
                                    submission = result.submission
                                    break
                            elif result.submission_action is not None:
                                if result.submission_action.can_continue:
                                    continuation_count += 1
                                    terminal_continuation_triggered = True
                                else:
                                    errors.append(f"Terminal submission failed: {result.submission_action.reason}")
                                    terminal_failure = True
                                    break

                        tool_results_for_provider.append({
                            "role": "tool",
                            "tool_call_id": tc.call_id,
                            "content": json.dumps(result.result.model_dump(mode="json")),
                        })

                    # Build assistant message for history
                    assistant_msg: dict[str, Any] = {
                        "role": "assistant",
                        "content": response.text or "",
                    }
                    if response.tool_calls:
                        assistant_msg["tool_calls"] = [
                            {
                                "id": tc.call_id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": json.dumps(tc.arguments),
                                },
                            }
                            for tc in response.tool_calls
                        ]
                    messages.append(assistant_msg)

                    if tool_results_for_provider:
                        messages.extend(tool_results_for_provider)

                    if submission_received:
                        break
                    if terminal_failure:
                        break
                    if (
                        not submission_received
                        and (tool_round_count >= budget.max_tool_rounds
                             or provider_call_count >= budget.max_provider_calls - 1)
                    ):
                        terminal_phase = True
                else:
                    # No custom tool calls — provider returned text without submit_answer
                    terminal_missing = True
                    action = self._tool_executor.handle_missing_submission(tool_context)

                    if action.can_continue:
                        continuation_count += 1
                        terminal_continuation_triggered = True
                        terminal_phase = True
                        messages.append({
                            "role": "user",
                            "content": action.continuation_message,
                        })
                        continue
                    else:
                        errors.append(f"Terminal submission missing: {action.reason}")
                        break

            if not submission_received and not terminal_missing:
                errors.append("No response from provider")

            # v2.1.3: one evidence-only semantic checker after the bounded
            # answer/research stage. It has no research tools and shares the
            # original absolute deadline.
            answer_provider_call_count = provider_call_count
            answer_agent_duration_ms = (time.perf_counter() - start_time) * 1000.0
            if (
                submission_received
                and submission is not None
                and request.mode == "default"
                and request.experiment_arm == "L"
                and get_settings().compact_checker_enabled
                and self._requires_checker(submission)
            ):
                checker_remaining_before = deadline.remaining_ms()
                checker = await CompactCheckerService().run(
                    provider=self._provider,
                    submission=submission,
                    request=request,
                    registry=registry,
                    deadline=deadline,
                    checker_target_ms=budget.checker_target_ms,
                    model=get_settings().legal_fact_check_model,
                    reasoning_effort=get_settings().default_agent_reasoning_effort,
                )
                checker_status = checker.status
                checker_latency_ms = checker.duration_ms
                checker_dropped_claim_ids = checker.dropped_claim_ids
                checker_dependency_dropped_claim_ids = checker.dependency_dropped_claim_ids
                if checker.provider_response is not None:
                    provider_call_count += 1
                    response = checker.provider_response
                    checker_call_count = sum(
                        getattr(call, "name", None) == "submit_compact_checker_result"
                        for call in response.tool_calls
                    )
                    for checker_call in response.tool_calls:
                        if checker_call.name != "submit_compact_checker_result":
                            continue
                        tool_call_observations.append(ToolCallObservation(
                            tool_name="submit_compact_checker_result",
                            tool_call_id=checker_call.call_id,
                            round_index=max(1, tool_round_count),
                            status="ok" if response.status == "ok" else response.status,
                            duration_ms=response.duration_ms,
                            remaining_deadline_before_call_ms=max(0.0, checker_remaining_before),
                            research_stage_remaining_before_ms=0,
                            absolute_remaining_after_ms=deadline.remaining_ms(),
                            research_stage_remaining_after_ms=0,
                            result_count=1,
                            governor_denied=False,
                            is_retry=False,
                        ))
                    remaining_before_checker = max(0.0, checker_remaining_before)
                    provider_call_observations.append(ProviderCallObservation(
                        stage="fact_check",
                        call_index=provider_call_count,
                        call_kind="initial",
                        response_id=response.response_id or None,
                        previous_response_id=None,
                        model=response.model,
                        effort=response.effort or "low",
                        input_tokens=response.input_tokens,
                        cached_input_tokens=response.cached_input_tokens,
                        reasoning_tokens=response.reasoning_tokens,
                        output_tokens=response.output_tokens,
                        duration_ms=response.duration_ms,
                        timeout_allocated_ms=min(
                            remaining_before_checker,
                            float(budget.checker_target_ms),
                        ),
                        remaining_deadline_before_call_ms=remaining_before_checker,
                        research_stage_remaining_before_ms=0,
                        absolute_remaining_after_ms=deadline.remaining_ms(),
                        research_stage_remaining_after_ms=0,
                        returned_tool_call_count=len(response.tool_calls),
                        returned_tool_names=[tc.name for tc in response.tool_calls],
                        web_search_reported=False,
                        native_web_search_call_count=0,
                        native_web_source_count=0,
                        native_web_citation_count=0,
                        input_items_count=0,
                        input_char_count=0,
                        function_output_count=0,
                        tool_definitions_count=1,
                        status=response.status,
                        is_retry=False,
                    ))
                    total_provider_duration_ms += response.duration_ms
                if checker.status == "completed":
                    submission = checker.submission
                else:
                    submission = None
                    errors.append(f"Compact checker failed: {checker.error or 'unknown error'}")

        except TurnDeadlineExceeded as exc:
            errors.append(f"Deadline exceeded at stage: {exc.stage}")
        except Exception as exc:
            logger.exception("Unexpected error in shadow agent run")
            errors.append(f"Unexpected error: {exc}")

        # Build metrics
        total_duration = (time.perf_counter() - start_time) * 1000.0
        metrics = AgentExecutionMetrics(
            logical_llm_stage_count=1 + int(checker_status != "not_required"),
            provider_api_call_count=provider_call_count,
            tool_call_count=len(tool_outputs) + checker_call_count,
            tool_round_count=tool_round_count,
            web_search_call_count=sum(1 for t in tool_outputs if "web_search" in str(t.data)),
            # Phase 5.1A: aggregate actual provider-native built-in web_search usage
            # across all provider calls in this run from the actual provider output.
            native_web_search_call_count=sum(
                pc.native_web_search_call_count for pc in provider_call_observations
            ),
            native_web_source_count=sum(
                pc.native_web_source_count for pc in provider_call_observations
            ),
            native_web_citation_count=sum(
                pc.native_web_citation_count for pc in provider_call_observations
            ),
            web_search_pii_violation_count=pii_violation_count,
            # Phase 5.1A.1: aggregate content-free search-privacy violation counts.
            search_privacy_violation_count=sum(
                pc.search_privacy_violation_count for pc in provider_call_observations
            ),
            search_privacy_violation_categories=self._merge_category_counts(
                [pc.search_privacy_violation_categories for pc in provider_call_observations]
            ),
            exact_lookup_call_count=0,
            lightrag_call_count=0,
            flat_rag_call_count=flat_rag_executed_count,
            utility_call_count=sum(1 for t in tool_outputs if "deterministic_utility" in str(t.data)),
            submit_answer_call_count=1 if submission_received else 0,
            checker_call_count=checker_call_count,
            retry_count=max(0, answer_provider_call_count - 1),
            turn_deadline_ms=deadline.turn_deadline_ms,
            backend_total_latency_ms=total_duration,
            pre_agent_latency_ms=0,
            remaining_deadline_before_call_ms=deadline.remaining_ms(),
            deadline_exceeded_stage="shadow_run" if deadline.remaining_ms() <= 0 else None,
            terminal_submission_missing=terminal_missing,
            terminal_submission_continuation_count=continuation_count,
            terminal_continuation_triggered=terminal_continuation_triggered,
            answer_agent_latency_ms=answer_agent_duration_ms or total_duration,
            fact_check_latency_ms=checker_latency_ms,
            total_latency_ms=total_duration,
            metrics_complete=True,
            flat_rag_denied_call_count=flat_rag_denied_count,
            provider_retry_skipped_reason=provider_retry_skipped_reason,
            total_provider_duration_ms=total_provider_duration_ms,
            total_tool_duration_ms=total_tool_duration_ms,
            provider_calls=provider_call_observations,
            tool_calls=tool_call_observations,
        )

        if deadline.remaining_ms() <= 0:
            status = "timeout"
        elif submission_received and submission is not None:
            status = "completed"
        elif errors:
            status = "error"
        else:
            status = "incomplete"

        shadow_trace = {
            "request_id": request.request_id,
            "turn_id": request.turn_id,
            "experiment_arm": request.experiment_arm,
            "model": policy.model,
            "prompt_version": policy.prompt_version,
            "status": status,
            "provider_call_count": provider_call_count,
            "tool_round_count": tool_round_count,
            "tool_call_count": len(tool_outputs),
            "terminal_submission_missing": terminal_missing,
            "terminal_submission_continuation_count": continuation_count,
            "errors": errors,
            "provider_response_ids": provider_response_ids,
            "deadline_ms": deadline.turn_deadline_ms,
            "total_duration_ms": total_duration,
            "remaining_deadline_ms": deadline.remaining_ms(),
            "pii_violation_count": pii_violation_count,
        }

        return ShadowRunResult(
            request_id=request.request_id,
            turn_id=request.turn_id,
            experiment_arm=request.experiment_arm,
            model=policy.model,
            status=status,
            submission=submission,
            tool_outputs=tool_outputs,
            metrics=metrics,
            provider_response_ids=provider_response_ids,
            terminal_submission_missing=terminal_missing,
            terminal_submission_continuation_count=continuation_count,
            terminal_continuation_triggered=terminal_continuation_triggered,
            terminal_tool_calls=terminal_tool_call_observations,
            errors=errors,
            shadow_trace=shadow_trace,
            checker_status=checker_status,
            checker_call_count=checker_call_count,
            checker_dropped_claim_ids=checker_dropped_claim_ids,
            checker_dependency_dropped_claim_ids=checker_dependency_dropped_claim_ids,
            checker_latency_ms=checker_latency_ms,
        )

    @staticmethod
    def _provider_tools_for_round(
        tools: list[dict[str, Any]],
        *,
        flat_rag_executed_count: int,
        max_flat_rag_calls: int,
        terminal_phase: bool = False,
    ) -> list[dict[str, Any]]:
        """Return continuation-visible tools after deterministic budgets apply."""

        if terminal_phase:
            return [tool for tool in tools if tool.get("name") == "submit_answer"]
        if flat_rag_executed_count < max_flat_rag_calls:
            return tools
        return [
            tool for tool in tools
            if tool.get("name") != "flat_rag_search"
        ]

    @staticmethod
    def _requires_checker(submission: AgentSubmissionV2) -> bool:
        return submission.answer_class == "substantive_legal" or any(
            claim.materiality == "decisive"
            and claim.claim_type in {"legal_rule", "legal_application"}
            for claim in submission.claims
        )

    @staticmethod
    def _merge_category_counts(counts: list[dict[str, int]]) -> dict[str, int]:
        """Merge category-count dicts deterministically into one dict."""
        merged: dict[str, int] = {}
        for category_map in counts:
            for category, count in category_map.items():
                merged[category] = merged.get(category, 0) + count
        return merged

    @staticmethod
    def _retry_threshold_met(
        *,
        budget: Any,
        deadline: AbsoluteTurnDeadline,
    ) -> bool:
        """Return True if the remaining absolute deadline still exceeds the
        retry viability threshold — i.e. enough useful budget remains that a
        retry could complete a provider call, tools, continuation and terminal
        submit without predictably failing against the original deadline.

        This is deterministic backend resource governance — not a visa/legal rule.
        """
        remaining = deadline.remaining_ms()
        threshold = getattr(budget, "retry_viability_threshold_ms", 0)
        stage_remaining = deadline.stage_remaining_ms(getattr(budget, "answer_research_target_ms", 0))
        # A retry is only useful if the MINIMUM of the absolute turn remaining and
        # the non-resetting answer/research stage remaining still covers the
        # viability threshold.  Even if the absolute deadline has room, a stage
        # that is nearly spent leaves the retry predictably unable to complete
        # inside the original research stage, so it must not start.
        usable_retry_budget_ms = min(remaining, stage_remaining)
        return usable_retry_budget_ms >= threshold

    def _build_user_message(self, request: AgentRuntimeRequest) -> str:
        parts: list[str] = []
        parts.append(request.user_text)
        if request.matter_state:
            state_str = json.dumps(request.matter_state, indent=2, default=str)
            parts.append(f"\n\n## Current Matter State\n```json\n{state_str}\n```")
        parts.append(f"\n\nRespond in: {request.response_language}")
        parts.append(f"\nAs of date: {request.as_of_date.isoformat()}")
        return "\n".join(parts)


def create_agent_runtime_service(
    *,
    provider: ProviderInterface,
) -> AgentRuntimeService:
    """Create a new agent runtime service."""
    return AgentRuntimeService(provider=provider)
