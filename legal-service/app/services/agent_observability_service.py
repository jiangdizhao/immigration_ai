from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass, field
import time
from typing import Any, Callable
from uuid import uuid4

from app.core.config import get_settings
from app.schemas.agent import (
    AgentExecutionMetrics,
    DeadlineCheckpoint,
    ProviderCallObservation,
    ToolCallObservation,
)


class TurnDeadlineExceeded(TimeoutError):
    def __init__(self, stage: str) -> None:
        self.stage = stage
        super().__init__(f"absolute turn deadline exceeded before {stage}")


@dataclass(frozen=True, slots=True)
class AbsoluteTurnDeadline:
    """One monotonic deadline inherited by every nested operation.

    Component timeouts are capped by the remaining duration. Creating a component
    timeout never creates a new deadline and therefore cannot extend a turn.
    """

    started_at: float
    turn_deadline_ms: int
    clock: Callable[[], float] = time.perf_counter

    @property
    def deadline_at(self) -> float:
        return self.started_at + (self.turn_deadline_ms / 1000.0)

    def remaining_ms(self) -> float:
        return max(0.0, (self.deadline_at - self.clock()) * 1000.0)

    def component_timeout_ms(self, *, stage: str, component_timeout_ms: int | float) -> float:
        remaining = self.remaining_ms()
        if remaining <= 0:
            raise TurnDeadlineExceeded(stage)
        return min(float(component_timeout_ms), remaining)

    def stage_deadline_at(self, stage_duration_ms: int | float) -> float:
        """Return the non-resetting wall-clock deadline for a named stage.

        The stage deadline inherits the SAME original monotonic start time as
        the absolute turn deadline (this object's ``started_at``); it is NOT
        derived from ``now + stage_duration``.  A stage that started at turn
        acceptance ends at ``started_at + stage_duration_ms`` regardless of how
        many calls/rounds/retries occur inside it.
        """
        return self.started_at + (float(stage_duration_ms) / 1000.0)

    def stage_remaining_ms(self, stage_duration_ms: int | float) -> float:
        """Return the remaining time for a stage whose deadline is derived from
        the original turn start (non-resetting).  Never negative.
        """
        stage_at = self.stage_deadline_at(stage_duration_ms)
        return max(0.0, (stage_at - self.clock()) * 1000.0)


@dataclass(slots=True)
class _TurnObservation:
    request_id: str
    mode: str
    architecture_version: str
    deadline: AbsoluteTurnDeadline
    metrics: AgentExecutionMetrics
    logical_stages: set[str] = field(default_factory=set)
    agent_started_at: float | None = None
    answer_completed_at: float | None = None
    fact_check_started_at: float | None = None
    fact_check_completed_at: float | None = None


_CURRENT_TURN: ContextVar[_TurnObservation | None] = ContextVar(
    "immigration_ai_agent_observability_turn", default=None
)


class AgentObservabilityService:
    """Request-scoped raw execution metrics with no model, tool, or persistence side effect."""

    def __init__(self, *, clock: Callable[[], float] = time.perf_counter) -> None:
        self.clock = clock

    def begin_turn(
        self,
        *,
        mode: str,
        started_at: float | None = None,
        request_id: str | None = None,
        architecture_version: str = "legacy.v1",
        turn_deadline_ms: int | None = None,
    ) -> Token:
        if _CURRENT_TURN.get() is not None:
            raise RuntimeError("an observability turn is already active in this context")

        settings = get_settings()
        is_premium = mode in {"premium", "premium_direct_gpt55_high"}
        configured_deadline = (
            settings.premium_turn_deadline_ms if is_premium else settings.default_turn_deadline_ms
        )
        deadline_ms = configured_deadline if turn_deadline_ms is None else turn_deadline_ms
        if deadline_ms <= 0:
            raise ValueError("turn_deadline_ms must be positive")
        accepted_at = self.clock() if started_at is None else started_at
        deadline = AbsoluteTurnDeadline(
            started_at=accepted_at,
            turn_deadline_ms=deadline_ms,
            clock=self.clock,
        )
        metrics = AgentExecutionMetrics(
            turn_deadline_ms=deadline_ms,
            remaining_deadline_before_call_ms=deadline.remaining_ms(),
        )
        observation = _TurnObservation(
            request_id=request_id or str(uuid4()),
            mode=mode,
            architecture_version=architecture_version,
            deadline=deadline,
            metrics=metrics,
        )
        token = _CURRENT_TURN.set(observation)
        self.record_deadline_checkpoint("fastapi_query_acceptance")
        return token

    def reset_turn(self, token: Token) -> None:
        _CURRENT_TURN.reset(token)

    def current_deadline(self) -> AbsoluteTurnDeadline | None:
        observation = _CURRENT_TURN.get()
        return observation.deadline if observation else None

    def record_deadline_checkpoint(self, stage: str) -> float:
        observation = self._require_turn()
        remaining = observation.deadline.remaining_ms()
        observation.metrics.remaining_deadline_before_call_ms = remaining
        observation.metrics.deadline_checkpoints.append(
            DeadlineCheckpoint(
                stage=stage,
                remaining_deadline_before_call_ms=remaining,
            )
        )
        if remaining <= 0 and observation.metrics.deadline_exceeded_stage is None:
            observation.metrics.deadline_exceeded_stage = stage
        return remaining

    def component_timeout_ms(self, *, stage: str, component_timeout_ms: int | float) -> float:
        remaining = self.record_deadline_checkpoint(stage)
        if remaining <= 0:
            raise TurnDeadlineExceeded(stage)
        return min(float(component_timeout_ms), remaining)

    def mark_agent_started(self, stage: str = "answer_agent") -> None:
        observation = self._require_turn()
        self.record_deadline_checkpoint(stage)
        if observation.agent_started_at is None:
            observation.agent_started_at = observation.deadline.clock()

    def mark_answer_completed(self) -> None:
        observation = self._require_turn()
        observation.answer_completed_at = observation.deadline.clock()

    def mark_fact_check_started(self) -> None:
        observation = self._require_turn()
        self.record_deadline_checkpoint("fact_check")
        observation.fact_check_started_at = observation.deadline.clock()

    def mark_fact_check_completed(self) -> None:
        observation = self._require_turn()
        observation.fact_check_completed_at = observation.deadline.clock()

    def record_logical_stage(self, stage: str) -> None:
        observation = self._require_turn()
        observation.logical_stages.add(stage)
        observation.metrics.logical_llm_stage_count = len(observation.logical_stages)

    def record_provider_call(
        self,
        *,
        stage: str,
        duration_ms: float,
        remaining_deadline_before_call_ms: float | None = None,
        response_id: str | None = None,
        model: str | None = None,
        effort: str | None = None,
        native_web_search_call_count: int = 0,
        native_web_source_count: int = 0,
        native_web_citation_count: int = 0,
        input_tokens: int | None = None,
        cached_input_tokens: int | None = None,
        reasoning_tokens: int | None = None,
        output_tokens: int | None = None,
        status: str = "ok",
        is_retry: bool = False,
    ) -> None:
        observation = self._require_turn()
        remaining = (
            self.record_deadline_checkpoint(stage)
            if remaining_deadline_before_call_ms is None
            else remaining_deadline_before_call_ms
        )
        observation.metrics.provider_calls.append(
            ProviderCallObservation(
                stage=stage,
                response_id=response_id,
                model=model,
                effort=effort,
                native_web_search_call_count=native_web_search_call_count,
                native_web_source_count=native_web_source_count,
                native_web_citation_count=native_web_citation_count,
                input_tokens=input_tokens,
                cached_input_tokens=cached_input_tokens,
                reasoning_tokens=reasoning_tokens,
                output_tokens=output_tokens,
                duration_ms=duration_ms,
                remaining_deadline_before_call_ms=remaining,
                status=status,
                is_retry=is_retry,
            )
        )
        observation.metrics.provider_api_call_count = len(observation.metrics.provider_calls)
        # Phase 5.1A: aggregate provider-native built-in web_search usage from the
        # actual provider output at the turn level.
        observation.metrics.native_web_search_call_count += native_web_search_call_count
        observation.metrics.native_web_source_count += native_web_source_count
        observation.metrics.native_web_citation_count += native_web_citation_count
        if is_retry:
            observation.metrics.retry_count += 1

    def record_tool_call(
        self,
        *,
        tool_name: str,
        round_index: int,
        status: str,
        duration_ms: float,
        remaining_deadline_before_call_ms: float | None = None,
        tool_call_id: str | None = None,
        result_count: int | None = None,
        is_retry: bool = False,
    ) -> None:
        observation = self._require_turn()
        remaining = (
            self.record_deadline_checkpoint(tool_name)
            if remaining_deadline_before_call_ms is None
            else remaining_deadline_before_call_ms
        )
        call = ToolCallObservation(
            tool_name=tool_name,
            tool_call_id=tool_call_id,
            round_index=round_index,
            status=status,
            duration_ms=duration_ms,
            remaining_deadline_before_call_ms=remaining,
            result_count=result_count,
            is_retry=is_retry,
        )
        observation.metrics.tool_calls.append(call)
        observation.metrics.tool_call_count = len(observation.metrics.tool_calls)
        if call.tool_name not in {"submit_answer", "submit_compact_checker_result"}:
            observation.metrics.tool_round_count = max(
                observation.metrics.tool_round_count, round_index
            )
        counter_by_tool = {
            "web_search": "web_search_call_count",
            "exact_legal_lookup": "exact_lookup_call_count",
            "lightrag_search": "lightrag_call_count",
            "flat_rag_search": "flat_rag_call_count",
            "deterministic_utility": "utility_call_count",
            "submit_answer": "submit_answer_call_count",
            "submit_compact_checker_result": "checker_call_count",
        }
        counter_name = counter_by_tool[call.tool_name]
        setattr(observation.metrics, counter_name, getattr(observation.metrics, counter_name) + 1)
        if is_retry:
            observation.metrics.retry_count += 1

    def record_web_search_pii_violation(self, count: int = 1) -> None:
        if count < 0:
            raise ValueError("count must be non-negative")
        observation = self._require_turn()
        observation.metrics.web_search_pii_violation_count += count

    def record_terminal_submission(
        self, *, missing: bool, continuation_count: int = 0
    ) -> None:
        if continuation_count not in {0, 1}:
            raise ValueError("terminal submission continuation count must be 0 or 1")
        observation = self._require_turn()
        observation.metrics.terminal_submission_missing = missing
        observation.metrics.terminal_submission_continuation_count = continuation_count
        observation.metrics.terminal_continuation_triggered = continuation_count > 0

    def record_political_gate(
        self,
        *,
        decision: str,
        policy_version: str,
        policy_hash: str,
        latency_ms: float,
    ) -> None:
        """Record only the policy's approved content-free gate fields."""

        if decision not in {"allow", "block"}:
            raise ValueError("political gate decision must be allow or block")
        if latency_ms < 0:
            raise ValueError("political gate latency must be non-negative")
        observation = self._require_turn()
        observation.metrics.political_gate_decision = decision
        observation.metrics.political_policy_version = policy_version
        observation.metrics.political_policy_hash = policy_hash
        observation.metrics.political_gate_enforcement_layer = "fastapi"
        observation.metrics.political_gate_latency_ms = latency_ms

    def mark_metrics_complete(self) -> None:
        self._require_turn().metrics.metrics_complete = True

    def snapshot(self) -> AgentExecutionMetrics | None:
        observation = _CURRENT_TURN.get()
        if observation is None:
            return None
        now = observation.deadline.clock()
        metrics = observation.metrics.model_copy(deep=True)
        backend_total = max(0.0, (now - observation.deadline.started_at) * 1000.0)
        metrics.backend_total_latency_ms = backend_total
        metrics.total_latency_ms = backend_total
        metrics.remaining_deadline_before_call_ms = observation.deadline.remaining_ms()
        if observation.agent_started_at is None:
            metrics.pre_agent_latency_ms = backend_total
        else:
            metrics.pre_agent_latency_ms = max(
                0.0, (observation.agent_started_at - observation.deadline.started_at) * 1000.0
            )
            answer_end = observation.answer_completed_at or now
            metrics.answer_agent_latency_ms = max(
                0.0, (answer_end - observation.agent_started_at) * 1000.0
            )
        if observation.fact_check_started_at is not None:
            fact_check_end = observation.fact_check_completed_at or now
            metrics.fact_check_latency_ms = max(
                0.0, (fact_check_end - observation.fact_check_started_at) * 1000.0
            )
        return metrics

    def trace_payload(self) -> dict[str, Any] | None:
        observation = _CURRENT_TURN.get()
        metrics = self.snapshot()
        if observation is None or metrics is None:
            return None
        return {
            "request_id": observation.request_id,
            "mode": observation.mode,
            "architecture_version": observation.architecture_version,
            "execution_metrics": metrics.model_dump(mode="json"),
        }

    def _require_turn(self) -> _TurnObservation:
        observation = _CURRENT_TURN.get()
        if observation is None:
            raise RuntimeError("no observability turn is active")
        return observation
