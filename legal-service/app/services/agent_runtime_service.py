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
)
from app.schemas.tools import ToolResultEnvelope
from app.services.agent_observability_service import (
    AbsoluteTurnDeadline,
    AgentObservabilityService,
    TurnDeadlineExceeded,
)
from app.services.agent_policy_service import AgentPolicyService
from app.services.request_evidence_registry import RequestEvidenceRegistry
from app.services.tool_executor_service import (
    ToolCallRequest,
    ToolExecutorContext,
    ToolExecutorService,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mock provider interface (replace with real OpenAI client in production)
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
    # Raw provider response for evidence extraction
    raw_response: Any = None


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
        messages_history: list[dict[str, Any]] | None = None,
        timeout_ms: float,
    ) -> ProviderResponse:
        """Make a provider call.

        Returns ProviderResponse with text and/or tool calls.
        """
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
    # Shadow trace data
    shadow_trace: dict[str, Any] | None = None


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
    ) -> None:
        self._provider = provider
        self._policy_service = policy_service or AgentPolicyService()
        self._tool_executor = tool_executor or ToolExecutorService()
        self._observability = observability or AgentObservabilityService()

    async def run_shadow(
        self,
        request: AgentRuntimeRequest,
        *,
        deadline: AbsoluteTurnDeadline,
        registry: RequestEvidenceRegistry,
        flat_rag_search_fn: Any = None,
        db_session: Any = None,
    ) -> ShadowRunResult:
        """Execute one shadow Luna agent run.

        Args:
            request: The agent runtime request
            deadline: The absolute monotonic deadline
            registry: Request-scoped evidence registry
            flat_rag_search_fn: Optional flat RAG search function (Arm B)
            db_session: Optional DB session for tools

        Returns:
            ShadowRunResult with submission, metrics, and trace data
        """
        start_time = time.perf_counter()
        errors: list[str] = []
        provider_response_ids: list[str] = []
        tool_outputs: list[ToolResultEnvelope] = []

        # Build policy
        policy = self._policy_service.build_policy(
            mode=request.mode,
            experiment_arm=request.experiment_arm,
        )

        # Build tool executor context
        tool_context = ToolExecutorContext(
            request_id=request.request_id,
            registry=registry,
            as_of_date=request.as_of_date,
            deadline_monotonic=deadline.deadline_at,
            flat_rag_search_fn=flat_rag_search_fn,
            db_session=db_session,
        )

        # Build messages
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": policy.system_prompt},
            {"role": "user", "content": self._build_user_message(request)},
        ]

        # Execution loop
        provider_call_count = 0
        tool_round_count = 0
        submission_received = False
        submission: AgentSubmissionV2 | None = None
        terminal_missing = False
        continuation_count = 0

        try:
            while provider_call_count < policy.max_provider_calls:
                # Check deadline
                remaining = deadline.remaining_ms()
                if remaining <= 0:
                    errors.append("Deadline exceeded before provider call")
                    break

                # Make provider call
                provider_call_count += 1

                try:
                    response = await self._provider.call(
                        system_prompt=policy.system_prompt,
                        user_text="",  # Already in messages
                        model=policy.model,
                        tools=policy.tools,
                        tool_choice=policy.tool_choice,
                        messages_history=messages,
                        timeout_ms=min(remaining, 30000),
                    )
                except TurnDeadlineExceeded:
                    errors.append("Deadline exceeded during provider call")
                    break
                except Exception as exc:
                    logger.exception("Provider call failed")
                    if provider_call_count <= policy.max_retries + 1:
                        errors.append(f"Provider call failed (attempt {provider_call_count}): {exc}")
                        continue
                    else:
                        errors.append(f"Provider call failed after {provider_call_count} attempts: {exc}")
                        break

                provider_response_ids.append(response.response_id)

                if response.status == "timeout":
                    errors.append("Provider call timed out")
                    if provider_call_count <= policy.max_retries + 1:
                        continue
                    break

                if response.status == "error":
                    errors.append("Provider call returned error")
                    if provider_call_count <= policy.max_retries + 1:
                        continue
                    break

                # Process tool calls
                if response.tool_calls:
                    tool_round_count += 1

                    if tool_round_count > policy.max_tool_rounds:
                        errors.append(f"Max tool rounds ({policy.max_tool_rounds}) exceeded")
                        break

                    # Execute each tool call
                    tool_results_for_provider: list[dict[str, Any]] = []

                    for tc in response.tool_calls:
                        # Check deadline before each tool
                        remaining = deadline.remaining_ms()
                        if remaining <= 0:
                            errors.append("Deadline exceeded before tool execution")
                            break

                        result = self._tool_executor.execute_tool(tc, tool_context)
                        tool_outputs.append(result.result)

                        # Check if this was submit_answer
                        if tc.name == "submit_answer":
                            if result.result.status == "ok":
                                submission_received = True
                                # Parse submission from result
                                try:
                                    submission = AgentSubmissionV2(**tc.arguments)
                                except Exception:
                                    pass
                            else:
                                # Invalid submission
                                if tool_context.terminal_record.correction_count >= 1:
                                    # Second miss
                                    errors.append("Terminal submission failed after correction")
                                    break

                        # Format result for provider
                        tool_results_for_provider.append({
                            "role": "tool",
                            "tool_call_id": tc.call_id,
                            "content": json.dumps(result.result.model_dump(mode="json")),
                        })

                    # Add assistant message with tool calls
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

                    # Add tool results
                    messages.extend(tool_results_for_provider)

                    if submission_received:
                        break
                else:
                    # No tool calls — provider returned text without submit_answer
                    terminal_missing = True

                    # Handle missing submission
                    action = self._tool_executor.handle_missing_submission(tool_context)

                    if action.can_continue:
                        continuation_count += 1
                        # Add continuation message
                        messages.append({
                            "role": "user",
                            "content": action.continuation_message,
                        })
                        continue
                    else:
                        errors.append(f"Terminal submission missing: {action.reason}")
                        break

            # End of loop

            # Check final state
            if not submission_received and not terminal_missing:
                # Provider returned nothing useful
                errors.append("No response from provider")

            if terminal_missing and continuation_count == 0:
                # First miss, no continuation attempted
                pass  # Already handled in loop

        except TurnDeadlineExceeded as exc:
            errors.append(f"Deadline exceeded at stage: {exc.stage}")
        except Exception as exc:
            logger.exception("Unexpected error in shadow agent run")
            errors.append(f"Unexpected error: {exc}")

        # Build metrics
        total_duration = (time.perf_counter() - start_time) * 1000.0
        metrics = AgentExecutionMetrics(
            logical_llm_stage_count=1,
            provider_api_call_count=provider_call_count,
            tool_call_count=len(tool_outputs),
            tool_round_count=tool_round_count,
            web_search_call_count=sum(1 for t in tool_outputs if "web_search" in str(t.data)),
            web_search_pii_violation_count=0,
            exact_lookup_call_count=0,
            lightrag_call_count=0,
            flat_rag_call_count=sum(1 for t in tool_outputs if "flat_rag" in str(t.data)),
            utility_call_count=sum(1 for t in tool_outputs if "deterministic_utility" in str(t.data)),
            submit_answer_call_count=1 if submission_received else 0,
            retry_count=max(0, provider_call_count - 1),
            turn_deadline_ms=deadline.turn_deadline_ms,
            backend_total_latency_ms=total_duration,
            pre_agent_latency_ms=0,
            remaining_deadline_before_call_ms=deadline.remaining_ms(),
            deadline_exceeded_stage="shadow_run" if deadline.remaining_ms() <= 0 else None,
            terminal_submission_missing=terminal_missing,
            terminal_submission_continuation_count=continuation_count,
            answer_agent_latency_ms=total_duration,
            fact_check_latency_ms=0,
            total_latency_ms=total_duration,
            metrics_complete=True,
        )

        # Determine status
        if deadline.remaining_ms() <= 0:
            status = "timeout"
        elif submission_received and submission is not None:
            status = "completed"
        elif errors:
            status = "error"
        else:
            status = "incomplete"

        # Build shadow trace
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
            errors=errors,
            shadow_trace=shadow_trace,
        )

    def _build_user_message(self, request: AgentRuntimeRequest) -> str:
        """Build the user message with compact state context."""
        parts: list[str] = []

        # User text
        parts.append(request.user_text)

        # Compact state context
        if request.matter_state:
            state_str = json.dumps(request.matter_state, indent=2, default=str)
            parts.append(f"\n\n## Current Matter State\n```json\n{state_str}\n```")

        # Response language hint
        parts.append(f"\n\nRespond in: {request.response_language}")

        # As-of date
        parts.append(f"\nAs of date: {request.as_of_date.isoformat()}")

        return "\n".join(parts)


def create_agent_runtime_service(
    *,
    provider: ProviderInterface,
) -> AgentRuntimeService:
    """Create a new agent runtime service."""
    return AgentRuntimeService(provider=provider)