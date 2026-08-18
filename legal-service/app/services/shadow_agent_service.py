"""Phase 5 — Shadow agent service.

Orchestrates non-blocking shadow Luna execution alongside the
existing V1 customer answer path.

HARD SHADOW INVARIANT:
- NEVER replaces the customer answer
- NEVER alters the customer-visible response
- NEVER applies candidate state_patch to the real Matter
- NEVER changes public citations
- NEVER creates a normal served-answer trace
- NEVER changes booking/escalation behavior
- NEVER modifies default/premium serving authority
- NEVER acts as a fallback
- NEVER requires the public request to wait for completion

If shadow execution fails, times out, or throws:
the public V1 response remains unaffected.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal
from uuid import uuid4

from app.core.config import get_settings
from app.schemas.agent import (
    AgentRuntimeRequest,
    AgentSubmissionV2,
    ExecutionBudget,
)
from app.services.agent_observability_service import (
    AbsoluteTurnDeadline,
)
from app.services.agent_policy_service import AgentPolicyService
from app.services.agent_runtime_service import (
    AgentRuntimeService,
)
from app.services.request_evidence_registry import (
    create_registry,
)

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ShadowTrace:
    """Isolated shadow result/trace for engineering evaluation.

    Never placed into the normal lawyer served-answer queue.
    Never mutates customer-serving state.
    """

    trace_id: str
    request_id: str
    turn_id: str
    matter_id: str | None
    experiment_arm: str | None
    model: str
    status: Literal["completed", "timeout", "error", "incomplete", "disabled", "blocked"]
    submission: AgentSubmissionV2 | None
    candidate_state_patch: list[dict[str, Any]] | None = None
    research_status: str | None = None
    evidence_refs: list[str] = field(default_factory=list)
    citations: list[dict[str, str]] = field(default_factory=list)
    provider_call_count: int = 0
    provider_response_ids: list[str] = field(default_factory=list)
    tool_call_count: int = 0
    tool_round_count: int = 0
    tool_outputs: list[dict[str, Any]] = field(default_factory=list)
    total_input_tokens: int | None = None
    total_output_tokens: int | None = None
    total_duration_ms: float = 0.0
    deadline_ms: int = 0
    remaining_deadline_ms: float = 0.0
    terminal_submission_missing: bool = False
    terminal_submission_continuation_count: int = 0
    postcondition_status: str | None = None
    errors: list[str] = field(default_factory=list)
    created_at: str | None = None
    completed_at: str | None = None
    # Never store: chain of thought, hidden reasoning, political-blocked raw text,
    # prohibited PII search query


class ShadowAgentService:
    """Non-blocking shadow Luna execution service.

    Usage in FastAPI query route:
        if settings.agent_shadow_enabled and not politically_blocked:
            shadow = ShadowAgentService(runtime)
            bg_task = asyncio.create_task(
                shadow.run_shadow(
                    user_text=...,
                    deadline=deadline_from_acceptance,
                    upstream_gate_allowed=True,
                )
            )
    """

    def __init__(
        self,
        runtime: AgentRuntimeService,
        *,
        policy_service: AgentPolicyService | None = None,
    ) -> None:
        self._runtime = runtime
        self._policy_service = policy_service or AgentPolicyService()

    async def run_shadow(
        self,
        *,
        user_text: str,
        mode: Literal["default", "premium"] = "default",
        response_language: str = "en",
        as_of_date: date | None = None,
        matter_state: dict[str, Any] | None = None,
        matter_id: str | None = None,
        turn_id: str | None = None,
        experiment_arm: Literal["A", "B"] | None = None,
        flat_rag_search_fn: Any = None,
        db_session_factory: Any = None,
        # Inherited from request acceptance
        deadline: AbsoluteTurnDeadline | None = None,
        execution_budget: ExecutionBudget | None = None,
        # Political gate enforcement
        upstream_gate_allowed: bool = False,
    ) -> ShadowTrace:
        """Execute one shadow Luna run with full isolation.

        Args:
            user_text: The user's query text
            mode: Answer mode (default/premium)
            response_language: BCP-47 language tag
            as_of_date: Current date for legal research
            matter_state: Compact matter state snapshot (immutable copy)
            matter_id: Matter identifier for trace
            turn_id: Turn identifier for trace
            experiment_arm: A or B
            flat_rag_search_fn: Flat RAG function (Arm B only)
            db_session_factory: Callable to create a fresh DB session
            deadline: Absolute deadline from request acceptance (REQUIRED)
            execution_budget: Execution budget from request acceptance (REQUIRED)
            upstream_gate_allowed: Must be True if political gate passed

        Returns:
            ShadowTrace with complete engineering data
        """
        settings = get_settings()

        # Political gate enforcement: must have explicit upstream approval
        if not upstream_gate_allowed:
            logger.warning("ShadowAgentService invoked without upstream gate approval")
            return ShadowTrace(
                trace_id=str(uuid4()),
                request_id="",
                turn_id=turn_id or "",
                matter_id=matter_id,
                experiment_arm=experiment_arm,
                model=settings.default_agent_model,
                status="blocked",
                submission=None,
                errors=["Shadow execution blocked: upstream political gate not passed"],
                created_at=str(time.perf_counter()),
                completed_at=str(time.perf_counter()),
            )

        request_id = str(uuid4())
        turn_id = turn_id or str(uuid4())
        as_of_date = as_of_date or date.today()

        # Use inherited deadline or create one (inherited is preferred)
        if deadline is None:
            is_premium = mode == "premium"
            turn_deadline_ms = (
                settings.premium_turn_deadline_ms if is_premium
                else settings.default_turn_deadline_ms
            )
            deadline = AbsoluteTurnDeadline(
                started_at=time.perf_counter(),
                turn_deadline_ms=turn_deadline_ms,
            )

        # Use inherited budget or create one
        if execution_budget is None:
            is_premium = mode == "premium"
            turn_deadline_ms = (
                settings.premium_turn_deadline_ms if is_premium
                else settings.default_turn_deadline_ms
            )
            answer_research_target_ms = (
                settings.premium_answer_research_target_ms if is_premium
                else settings.default_answer_research_target_ms
            )
            execution_budget = ExecutionBudget(
                max_tool_rounds=settings.agent_max_tool_rounds,
                max_provider_calls=settings.agent_max_provider_calls,
                max_retries=settings.agent_max_retries,
                turn_deadline_ms=turn_deadline_ms,
                answer_research_target_ms=answer_research_target_ms,
                checker_target_ms=settings.legal_fact_check_target_ms,
            )

        # Create fresh registry for this shadow run
        registry = create_registry(request_id)

        # Build runtime request with immutable snapshot
        runtime_request = AgentRuntimeRequest(
            request_id=request_id,
            turn_id=turn_id,
            mode=mode,
            user_text=user_text,
            response_language=response_language,
            as_of_date=as_of_date,
            matter_state=matter_state or {},
            execution_budget=execution_budget,
            experiment_arm=experiment_arm,
        )

        # Create fresh DB session if factory provided
        db_session = None
        if db_session_factory:
            try:
                db_session = db_session_factory()
            except Exception:
                logger.warning("Could not create DB session for shadow run", exc_info=True)

        # Execute shadow run
        created_at = time.perf_counter()
        result = None
        try:
            result = await self._runtime.run_shadow(
                runtime_request,
                deadline=deadline,
                registry=registry,
                flat_rag_search_fn=flat_rag_search_fn,
                db_session=db_session,
            )
        except Exception:
            logger.exception("Shadow agent run failed with exception")
        finally:
            # Clean up DB session
            if db_session:
                try:
                    db_session.close()
                except Exception:
                    pass

        completed_at = time.perf_counter()

        # Capture evidence refs BEFORE registry disposal
        evidence_refs: list[str] = []
        try:
            evidence_refs = registry.get_all_refs()
        except Exception:
            pass

        # Dispose registry AFTER capturing evidence
        try:
            registry.dispose()
        except Exception:
            pass

        # Handle exception case
        if result is None:
            return ShadowTrace(
                trace_id=str(uuid4()),
                request_id=request_id,
                turn_id=turn_id,
                matter_id=matter_id,
                experiment_arm=experiment_arm,
                model=settings.default_agent_model,
                status="error",
                submission=None,
                errors=["Shadow run exception"],
                evidence_refs=evidence_refs,
                created_at=str(created_at),
                completed_at=str(completed_at),
            )

        # Build shadow trace
        trace = ShadowTrace(
            trace_id=str(uuid4()),
            request_id=request_id,
            turn_id=turn_id,
            matter_id=matter_id,
            experiment_arm=experiment_arm,
            model=result.model,
            status=result.status,
            submission=result.submission,
            candidate_state_patch=(
                result.submission.state_patch if result.submission else None
            ),
            research_status=(
                result.submission.research_status if result.submission else None
            ),
            evidence_refs=evidence_refs,
            citations=(
                [c.model_dump(mode="json") for c in result.submission.citations]
                if result.submission
                else []
            ),
            provider_call_count=result.metrics.provider_api_call_count,
            provider_response_ids=result.provider_response_ids,
            tool_call_count=result.metrics.tool_call_count,
            tool_round_count=result.metrics.tool_round_count,
            tool_outputs=[t.model_dump(mode="json") for t in result.tool_outputs],
            total_duration_ms=result.metrics.total_latency_ms,
            deadline_ms=deadline.turn_deadline_ms,
            remaining_deadline_ms=deadline.remaining_ms(),
            terminal_submission_missing=result.terminal_submission_missing,
            terminal_submission_continuation_count=result.terminal_submission_continuation_count,
            postcondition_status=(
                "passed" if result.submission else None
            ),
            errors=result.errors,
            created_at=str(created_at),
            completed_at=str(completed_at),
        )

        logger.info(
            "Shadow Luna run completed: status=%s arm=%s duration=%.0fms errors=%d",
            trace.status,
            trace.experiment_arm,
            trace.total_duration_ms,
            len(trace.errors),
        )

        return trace


def create_shadow_agent_service(
    runtime: AgentRuntimeService,
) -> ShadowAgentService:
    """Create a new shadow agent service."""
    return ShadowAgentService(runtime)