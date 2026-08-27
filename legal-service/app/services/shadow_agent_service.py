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
from copy import deepcopy
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
    web_search_call_count: int = 0
    # Phase 5.1A.1: content-free aggregated search-privacy violation telemetry.
    search_privacy_violation_count: int = 0
    search_privacy_violation_categories: dict[str, int] = field(default_factory=dict)
    # Phase 5.1A: provider-native built-in web_search usage derived from actual
    # provider output. Distinct from custom backend tool execution.
    native_web_search_call_count: int = 0
    native_web_source_count: int = 0
    native_web_citation_count: int = 0
    exact_lookup_call_count: int = 0
    exact_lookup_requested_locator_count: int = 0
    exact_lookup_resolved_locator_count: int = 0
    exact_lookup_unresolved_locator_count: int = 0
    exact_lookup_unresolved_cross_reference_count: int = 0
    exact_invalid_empty_request_count: int = 0
    exact_no_usable_locator_count: int = 0
    schedule2_navigation_call_count: int = 0
    schedule2_navigation_target_count: int = 0
    # Phase 5.1A: configured/default reasoning effort used for this run (content-free
    # calibration metadata).
    reasoning_effort: str | None = None
    tool_outputs: list[dict[str, Any]] = field(default_factory=list)
    # Phase-5 diagnostic observability (content-free).
    provider_calls: list[dict[str, Any]] = field(default_factory=list)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    total_provider_duration_ms: float = 0.0
    total_tool_duration_ms: float = 0.0
    total_input_tokens: int | None = None
    total_output_tokens: int | None = None
    total_duration_ms: float = 0.0
    deadline_ms: int = 0
    remaining_deadline_ms: float = 0.0
    terminal_submission_missing: bool = False
    terminal_submission_continuation_count: int = 0
    terminal_continuation_triggered: bool = False
    terminal_continuation_reason: str | None = None
    terminal_tool_calls: list[dict[str, Any]] = field(default_factory=list)
    reasoning_bank: dict[str, Any] = field(default_factory=dict)
    postcondition_status: str | None = None
    checker_status: str = "not_required"
    checker_call_count: int = 0
    checker_provider_call_count: int = 0
    checker_result_tool_call_count: int = 0
    checker_dropped_claim_ids: list[str] = field(default_factory=list)
    checker_dependency_dropped_claim_ids: list[str] = field(default_factory=list)
    checker_keep_claim_ids: list[str] = field(default_factory=list)
    checker_flagged_claim_ids: list[str] = field(default_factory=list)
    checker_blocked_claim_ids: list[str] = field(default_factory=list)
    checker_dependency_blocked_claim_ids: list[str] = field(default_factory=list)
    checker_material_omission_suspected: bool = False
    checker_material_omission_evidence_ref_count: int = 0
    checker_filter_plan_safe_to_apply: bool | None = None
    checker_model: str | None = None
    checker_reasoning_effort: str | None = None
    checker_remaining_budget_before_ms: float = 0.0
    checker_remaining_budget_after_ms: float = 0.0
    checker_timeout_allocated_ms: float = 0.0
    checker_error_code: str | None = None
    checker_skip_reason: str | None = None
    checker_latency_ms: float = 0.0
    errors: list[str] = field(default_factory=list)
    created_at: str | None = None
    completed_at: str | None = None
    # Never store: chain of thought, hidden reasoning, political-blocked raw text,
    # prohibited PII search query


class ShadowAgentService:
    """Non-blocking shadow Luna execution service.

    The FastAPI query route schedules this service through its post-response
    background-task adapter and a dedicated event loop.
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
        experiment_arm: Literal["A", "B", "L", "N"] | None = None,
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
            experiment_arm: experimental Luna arm (A, B, L, or N)
            flat_rag_search_fn: Flat RAG function (Arm L/N when available)
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
                max_flat_rag_calls=settings.agent_max_flat_rag_calls,
                retry_viability_threshold_ms=settings.agent_retry_viability_threshold_ms,
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
            matter_state=deepcopy(matter_state) if matter_state is not None else {},
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

        # Revised v2.1.3 Default arm: use the existing local retrieval tool
        # alongside native web search when the caller supplied a DB factory.
        # Historical A/B callers may continue injecting their own function.
        if experiment_arm in {"L", "N"} and flat_rag_search_fn is None and db_session is not None:
            from app.tools.flat_rag_search import FlatRagSearchTool

            flat_tool = FlatRagSearchTool(db_session)
            flat_rag_search_fn = flat_tool.search

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
            web_search_call_count=result.metrics.web_search_call_count,
            search_privacy_violation_count=result.metrics.search_privacy_violation_count,
            search_privacy_violation_categories=dict(
                result.metrics.search_privacy_violation_categories
            ),
            native_web_search_call_count=result.metrics.native_web_search_call_count,
            native_web_source_count=result.metrics.native_web_source_count,
            native_web_citation_count=result.metrics.native_web_citation_count,
            exact_lookup_call_count=result.metrics.exact_lookup_call_count,
            exact_lookup_requested_locator_count=result.metrics.exact_lookup_requested_locator_count,
            exact_lookup_resolved_locator_count=result.metrics.exact_lookup_resolved_locator_count,
            exact_lookup_unresolved_locator_count=result.metrics.exact_lookup_unresolved_locator_count,
            exact_lookup_unresolved_cross_reference_count=(
                result.metrics.exact_lookup_unresolved_cross_reference_count
            ),
            exact_invalid_empty_request_count=result.metrics.exact_invalid_empty_request_count,
            exact_no_usable_locator_count=result.metrics.exact_no_usable_locator_count,
            schedule2_navigation_call_count=result.metrics.schedule2_navigation_call_count,
            schedule2_navigation_target_count=result.metrics.schedule2_navigation_target_count,
            reasoning_effort=(
                result.metrics.provider_calls[0].effort
                if result.metrics.provider_calls else None
            ),
            provider_calls=[pc.model_dump(mode="json") for pc in result.metrics.provider_calls],
            tool_calls=[tc.model_dump(mode="json") for tc in result.metrics.tool_calls],
            total_provider_duration_ms=result.metrics.total_provider_duration_ms,
            total_tool_duration_ms=result.metrics.total_tool_duration_ms,
            tool_outputs=[t.model_dump(mode="json") for t in result.tool_outputs],
            total_duration_ms=result.metrics.total_latency_ms,
            deadline_ms=deadline.turn_deadline_ms,
            remaining_deadline_ms=deadline.remaining_ms(),
            terminal_submission_missing=result.terminal_submission_missing,
            terminal_submission_continuation_count=result.terminal_submission_continuation_count,
            terminal_continuation_triggered=result.terminal_continuation_triggered,
            terminal_continuation_reason=result.terminal_continuation_reason,
            terminal_tool_calls=[
                tc.model_dump(mode="json") for tc in result.terminal_tool_calls
            ],
            reasoning_bank=dict(result.reasoning_bank_telemetry),
            postcondition_status=(
                "passed" if result.submission else None
            ),
            checker_status=result.checker_status,
            checker_call_count=result.checker_call_count,
            checker_provider_call_count=result.checker_provider_call_count,
            checker_result_tool_call_count=result.checker_result_tool_call_count,
            checker_dropped_claim_ids=list(result.checker_dropped_claim_ids),
            checker_dependency_dropped_claim_ids=list(
                result.checker_dependency_dropped_claim_ids
            ),
            checker_keep_claim_ids=list(result.checker_keep_claim_ids),
            checker_flagged_claim_ids=list(result.checker_flagged_claim_ids),
            checker_blocked_claim_ids=list(result.checker_blocked_claim_ids),
            checker_dependency_blocked_claim_ids=list(
                result.checker_dependency_blocked_claim_ids
            ),
            checker_material_omission_suspected=result.checker_material_omission_suspected,
            checker_material_omission_evidence_ref_count=len(
                result.checker_material_omission_evidence_refs
            ),
            checker_filter_plan_safe_to_apply=result.checker_filter_plan_safe_to_apply,
            checker_model=result.checker_model,
            checker_reasoning_effort=result.checker_reasoning_effort,
            checker_remaining_budget_before_ms=result.checker_remaining_budget_before_ms,
            checker_remaining_budget_after_ms=result.checker_remaining_budget_after_ms,
            checker_timeout_allocated_ms=result.checker_timeout_allocated_ms,
            checker_error_code=result.checker_error_code,
            checker_skip_reason=result.checker_skip_reason,
            checker_latency_ms=result.checker_latency_ms,
            errors=result.errors,
            created_at=str(created_at),
            completed_at=str(completed_at),
        )

        logger.info(
            "Shadow Luna run completed: status=%s arm=%s duration=%.0fms provider_calls=%d tool_calls=%d tool_rounds=%d web_search_calls=%d submit_answer_accepted=%s submit_answer_rejected=%s repair_count=%d submission_error_codes=%s errors=%d",
            trace.status,
            trace.experiment_arm,
            trace.total_duration_ms,
            trace.provider_call_count,
            trace.tool_call_count,
            trace.tool_round_count,
            trace.web_search_call_count,
            trace.submission is not None,
            trace.terminal_submission_continuation_count > 0,
            trace.terminal_submission_continuation_count,
            sorted({
                error.get("code")
                for output in trace.tool_outputs
                for error in output.get("data", {}).get("errors", [])
                if isinstance(error, dict) and error.get("code")
            }),
            len(trace.errors),
        )

        return trace


def create_shadow_agent_service(
    runtime: AgentRuntimeService,
) -> ShadowAgentService:
    """Create a new shadow agent service."""
    return ShadowAgentService(runtime)
