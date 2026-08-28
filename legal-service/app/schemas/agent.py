from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.tools import ToolResultEnvelope


class StrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class AgentClaim(StrictContract):
    claim_id: str = Field(min_length=1, max_length=100)
    claim_type: Literal[
        "general", "legal_rule", "legal_application", "procedure", "current_fact", "calculation"
    ]
    materiality: Literal["decisive", "supporting"]
    text: str = Field(min_length=1, max_length=8000)
    draft_start: int = Field(ge=0)
    draft_end: int = Field(ge=0)
    evidence_refs: list[str] = Field(default_factory=list, max_length=30)
    depends_on: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def validate_draft_span(self):
        if self.draft_end < self.draft_start:
            raise ValueError("draft_end must be greater than or equal to draft_start")
        if len(set(self.evidence_refs)) != len(self.evidence_refs):
            raise ValueError("evidence_refs must not contain duplicates")
        if self.claim_id in self.depends_on:
            raise ValueError("claim must not depend on itself")
        if len(set(self.depends_on)) != len(self.depends_on):
            raise ValueError("depends_on must not contain duplicates")
        return self


class AgentCitation(StrictContract):
    evidence_ref: str = Field(min_length=1, max_length=255)
    display_label: str = Field(min_length=1, max_length=500)


class AgentSubmissionV2(StrictContract):
    schema_version: Literal["agent_submission.v2"]
    answer_class: Literal["general", "procedural", "substantive_legal", "safety_blocked"]
    draft_markdown: str = Field(min_length=1, max_length=50000)
    # Serving metadata is bounded control data, not free-form correction text.
    # Defaults preserve older shadow/evaluation submissions.
    next_action: Literal["answer", "ask_followup", "suggest_consultation"] = "answer"
    user_display_mode: Literal[
        "direct_short",
        "general_with_warning",
        "answer_then_ask",
        "ask_one_question",
        "escalate_with_brief_reason",
        "booking_handoff",
    ] | None = None
    as_of_date: date | None = None

    @field_validator("as_of_date", mode="before")
    @classmethod
    def parse_as_of_date(cls, value):
        if value is None or isinstance(value, date):
            return value
        if isinstance(value, str):
            return date.fromisoformat(value)
        return value

    claims: list[AgentClaim] = Field(default_factory=list, max_length=100)
    citations: list[AgentCitation] = Field(default_factory=list, max_length=100)
    research_status: Literal["not_required", "complete", "incomplete"]
    # Phase 1 freezes the envelope only. Patch authorization/semantics arrive in Phase 3.
    state_patch: list[dict[str, Any]] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_claim_spans_and_ids(self):
        claim_ids = [claim.claim_id for claim in self.claims]
        if len(set(claim_ids)) != len(claim_ids):
            raise ValueError("claim_id values must be unique")
        draft_length = len(self.draft_markdown)
        for claim in self.claims:
            if claim.draft_end > draft_length:
                raise ValueError(f"claim {claim.claim_id} ends beyond draft_markdown")
        return self


class ExecutionBudget(StrictContract):
    max_tool_rounds: int = Field(default=2, ge=0, le=20)
    max_provider_calls: int = Field(default=3, ge=1, le=20)
    max_retries: int = Field(default=1, ge=0, le=10)
    turn_deadline_ms: int = Field(ge=1)
    answer_research_target_ms: int = Field(ge=1)
    checker_target_ms: int = Field(ge=1)
    # Phase 5 resource governance. Per-turn Flat-RAG execution bound (Arm B only).
    # The bound applies to actual flat_rag_search executions, not merely tool rounds.
    max_flat_rag_calls: int = Field(default=1, ge=0, le=100)
    # A provider retry is launched only when the remaining absolute deadline still
    # exceeds this threshold. Prevents a futile late provider call from burning the
    # residual budget after a first attempt consumed most of the research budget.
    retry_viability_threshold_ms: int = Field(default=8000, ge=0, le=40000)
    terminal_synthesis_target_ms: int = Field(default=15000, ge=1)
    final_response_reserve_ms: int = Field(default=3000, ge=0)
    terminal_synthesis_min_start_budget_ms: int = Field(default=5000, ge=1)

    @model_validator(mode="after")
    def validate_budget(self):
        if self.answer_research_target_ms + self.checker_target_ms > self.turn_deadline_ms:
            raise ValueError("answer and checker targets must fit inside turn_deadline_ms")
        if self.retry_viability_threshold_ms > self.turn_deadline_ms:
            raise ValueError("retry viability threshold must fit inside turn_deadline_ms")
        if self.terminal_synthesis_min_start_budget_ms > self.terminal_synthesis_target_ms:
            raise ValueError("terminal minimum-start budget must not exceed terminal target")
        return self


class AgentRuntimeRequest(StrictContract):
    request_id: str = Field(min_length=1, max_length=255)
    turn_id: str = Field(min_length=1, max_length=255)
    mode: Literal["default", "premium"]
    user_text: str = Field(min_length=1, max_length=4000)
    response_language: str = Field(min_length=2, max_length=35)
    as_of_date: date
    # CompactMatterStateV2 is deliberately not implemented until Phase 3.
    matter_state: dict[str, Any]
    execution_budget: ExecutionBudget
    experiment_arm: Literal["A", "B", "L", "N", "C", "D"] | None = None


class DeadlineCheckpoint(StrictContract):
    stage: str = Field(min_length=1, max_length=255)
    remaining_deadline_before_call_ms: float = Field(ge=0)


class ProviderCallObservation(StrictContract):
    stage: str = Field(min_length=1, max_length=255)
    call_index: int = Field(default=1, ge=1)
    call_kind: Literal["initial", "continuation", "retry", "missing_terminal_continuation", "unknown"] = "initial"
    response_id: str | None = Field(default=None, max_length=255)
    previous_response_id: str | None = Field(default=None, max_length=255)
    model: str | None = Field(default=None, max_length=255)
    effort: str | None = Field(default=None, max_length=100)
    # Phase 5.1A: actual provider-native built-in web_search usage observed
    # directly from the OpenAI Responses output.  These are NOT custom backend
    # tool calls (flat_rag_search/deterministic_utility/submit_answer) and
    # never count model prose or guessed URLs.
    native_web_search_call_count: int = Field(default=0, ge=0)
    native_web_source_count: int = Field(default=0, ge=0)
    native_web_citation_count: int = Field(default=0, ge=0)
    web_action_search_count: int = Field(default=0, ge=0)
    web_action_open_page_count: int = Field(default=0, ge=0)
    web_action_find_in_page_count: int = Field(default=0, ge=0)
    web_search_query_count: int = Field(default=0, ge=0)
    web_sources_observed_count: int = Field(default=0, ge=0)
    web_citations_observed_count: int = Field(default=0, ge=0)
    first_web_action_started_ms: float | None = Field(default=None, ge=0)
    first_web_action_completed_ms: float | None = Field(default=None, ge=0)
    last_web_action_completed_ms: float | None = Field(default=None, ge=0)
    first_output_text_after_web_ms: float | None = Field(default=None, ge=0)
    post_web_action_provider_ms: float | None = Field(default=None, ge=0)
    stream_partial_available: bool = False
    stream_partial_text_chars: int = Field(default=0, ge=0)
    stream_source_count: int = Field(default=0, ge=0)
    stream_timeout_after_partial: bool = False
    stream_completed_function_call_count: int = Field(default=0, ge=0)
    stream_completed_output_item_count: int = Field(default=0, ge=0)
    # Phase 5.1A.1: content-free per-call search-privacy violation category
    # counts (category -> count). Never stores raw query text, hashes, names,
    # or identifier values.
    search_privacy_violation_count: int = Field(default=0, ge=0)
    search_privacy_violation_categories: dict[str, int] = Field(default_factory=dict)
    input_tokens: int | None = Field(default=None, ge=0)
    cached_input_tokens: int | None = Field(default=None, ge=0)
    reasoning_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    duration_ms: float = Field(ge=0)
    timeout_allocated_ms: float = Field(default=0, ge=0)
    remaining_deadline_before_call_ms: float = Field(ge=0)
    research_stage_remaining_before_ms: float = Field(default=0, ge=0)
    absolute_remaining_after_ms: float = Field(default=0, ge=0)
    research_stage_remaining_after_ms: float = Field(default=0, ge=0)
    returned_tool_call_count: int = Field(default=0, ge=0)
    returned_tool_names: list[str] = Field(default_factory=list, max_length=50)
    web_search_reported: bool = False
    # Payload-size metadata (counts/approximate sizes only, NO content).
    input_items_count: int = Field(default=0, ge=0)
    input_char_count: int = Field(default=0, ge=0)
    function_output_count: int = Field(default=0, ge=0)
    tool_definitions_count: int = Field(default=0, ge=0)
    status: Literal["ok", "timeout", "error"] = "ok"
    is_retry: bool = False


class ToolCallObservation(StrictContract):
    tool_name: Literal[
        "web_search",
        "schedule2_navigation",
        "exact_legal_lookup",
        "lightrag_search",
        "flat_rag_search",
        "deterministic_utility",
        "submit_answer",
        "submit_compact_checker_result",
        "submit_phase6_checker_result",
    ]
    tool_call_id: str | None = Field(default=None, max_length=255)
    round_index: int = Field(ge=1)
    status: Literal["ok", "partial", "unavailable", "invalid_request", "timeout", "error"]
    duration_ms: float = Field(ge=0)
    remaining_deadline_before_call_ms: float = Field(ge=0)
    research_stage_remaining_before_ms: float = Field(default=0, ge=0)
    absolute_remaining_after_ms: float = Field(default=0, ge=0)
    research_stage_remaining_after_ms: float = Field(default=0, ge=0)
    result_count: int | None = Field(default=None, ge=0)
    governor_denied: bool = False
    is_retry: bool = False


class AgentExecutionMetrics(StrictContract):
    logical_llm_stage_count: int = Field(default=0, ge=0)
    provider_api_call_count: int = Field(default=0, ge=0)
    tool_call_count: int = Field(default=0, ge=0)
    tool_round_count: int = Field(default=0, ge=0)
    duplicate_tool_call_suppressed_count: int = Field(default=0, ge=0)
    duplicate_tool_names: list[str] = Field(default_factory=list, max_length=50)
    custom_tool_calls_per_round: list[int] = Field(default_factory=list, max_length=20)
    research_tool_names_by_round: list[list[str]] = Field(default_factory=list, max_length=20)
    web_search_call_count: int = Field(default=0, ge=0)
    # Phase 5.1A observability: provider-native (OpenAI hosted) built-in
    # web_search usage derived from the actual Responses output, distinct from
    # any custom backend function execution.  web_search_call_count above is
    # retained for custom/legacy tooling; native_* fields are authoritative for
    # OpenAI hosted web_search.
    native_web_search_call_count: int = Field(default=0, ge=0)
    native_web_source_count: int = Field(default=0, ge=0)
    native_web_citation_count: int = Field(default=0, ge=0)
    web_action_search_count: int = Field(default=0, ge=0)
    web_action_open_page_count: int = Field(default=0, ge=0)
    web_action_find_in_page_count: int = Field(default=0, ge=0)
    web_search_query_count: int = Field(default=0, ge=0)
    web_sources_observed_count: int = Field(default=0, ge=0)
    web_citations_observed_count: int = Field(default=0, ge=0)
    first_web_action_started_ms: float | None = Field(default=None, ge=0)
    first_web_action_completed_ms: float | None = Field(default=None, ge=0)
    last_web_action_completed_ms: float | None = Field(default=None, ge=0)
    first_output_text_after_web_ms: float | None = Field(default=None, ge=0)
    post_web_action_provider_ms: float | None = Field(default=None, ge=0)
    stream_partial_call_count: int = Field(default=0, ge=0)
    stream_partial_text_chars: int = Field(default=0, ge=0)
    stream_source_count: int = Field(default=0, ge=0)
    stream_timeout_after_partial_count: int = Field(default=0, ge=0)
    stream_completed_function_call_count: int = Field(default=0, ge=0)
    stream_completed_output_item_count: int = Field(default=0, ge=0)
    web_search_pii_violation_count: int = Field(default=0, ge=0)
    # Phase 5.1A.1: content-free aggregated search-privacy violation category
    # counts (category -> count). Never stores raw query text, hashes, names,
    # or identifier values.
    search_privacy_violation_count: int = Field(default=0, ge=0)
    search_privacy_violation_categories: dict[str, int] = Field(default_factory=dict)
    exact_lookup_call_count: int = Field(default=0, ge=0)
    exact_lookup_requested_locator_count: int = Field(default=0, ge=0)
    exact_lookup_resolved_locator_count: int = Field(default=0, ge=0)
    exact_lookup_unresolved_locator_count: int = Field(default=0, ge=0)
    exact_lookup_unresolved_cross_reference_count: int = Field(default=0, ge=0)
    exact_invalid_empty_request_count: int = Field(default=0, ge=0)
    exact_no_usable_locator_count: int = Field(default=0, ge=0)
    exact_lookup_requests: list[dict[str, Any]] = Field(default_factory=list, max_length=160)
    schedule2_navigation_call_count: int = Field(default=0, ge=0)
    schedule2_navigation_target_count: int = Field(default=0, ge=0)
    exact_lookup_denied_call_count: int = Field(default=0, ge=0)
    schedule2_navigation_denied_call_count: int = Field(default=0, ge=0)
    lightrag_call_count: int = Field(default=0, ge=0)
    flat_rag_call_count: int = Field(default=0, ge=0)
    utility_call_count: int = Field(default=0, ge=0)
    submit_answer_call_count: int = Field(default=0, ge=0)
    checker_call_count: int = Field(default=0, ge=0)
    checker_provider_call_count: int = Field(default=0, ge=0, le=1)
    checker_result_tool_call_count: int = Field(default=0, ge=0)
    checker_keep_count: int = Field(default=0, ge=0)
    checker_flag_count: int = Field(default=0, ge=0)
    checker_block_count: int = Field(default=0, ge=0)
    checker_dependency_block_count: int = Field(default=0, ge=0)
    retry_count: int = Field(default=0, ge=0)
    continuation_count: int = Field(default=0, ge=0)
    answer_provider_call_count: int = Field(default=0, ge=0)
    terminal_continuation_reason: str | None = Field(default=None, max_length=100)
    turn_deadline_ms: int = Field(ge=1)
    backend_total_latency_ms: float = Field(default=0, ge=0)
    pre_agent_latency_ms: float = Field(default=0, ge=0)
    frontend_to_backend_latency_ms: float | None = Field(default=None, ge=0)
    remaining_deadline_before_call_ms: float = Field(ge=0)
    deadline_exceeded_stage: str | None = Field(default=None, max_length=255)
    terminal_submission_missing: bool = False
    terminal_submission_continuation_count: int = Field(default=0, ge=0, le=1)
    terminal_continuation_triggered: bool = False
    research_stage_target_ms: int = Field(default=0, ge=0)
    research_stage_exhausted: bool = False
    terminal_recovery_triggered: bool = False
    terminal_recovery_reason: str | None = Field(default=None, max_length=100)
    interrupted_response_continuation_skipped: bool = False
    terminal_fresh_request: bool = False
    terminal_timeout_allocated_ms: float = Field(default=0, ge=0)
    terminal_model: str | None = Field(default=None, max_length=255)
    terminal_web_search_enabled: bool = False
    terminal_remaining_budget_before_ms: float = Field(default=0, ge=0)
    terminal_remaining_budget_after_ms: float = Field(default=0, ge=0)
    final_response_reserve_ms: int = Field(default=0, ge=0)
    completion_status: Literal[
        "complete", "partial_timeout", "evidence_salvage", "safe_failure"
    ] | None = None
    evidence_salvage_triggered: bool = False
    evidence_salvage_reason: str | None = Field(default=None, max_length=120)
    recovered_legal_evidence_count: int = Field(default=0, ge=0)
    recovered_web_source_count: int = Field(default=0, ge=0)
    recovered_citation_count: int = Field(default=0, ge=0)
    evidence_salvage_displayed_source_count: int = Field(default=0, ge=0)
    answer_agent_latency_ms: float = Field(default=0, ge=0)
    fact_check_latency_ms: float = Field(default=0, ge=0)
    total_latency_ms: float = Field(default=0, ge=0)
    # Phase 5 resource governance observability (deterministic, content-free).
    flat_rag_denied_call_count: int = Field(default=0, ge=0)
    provider_retry_skipped_reason: str | None = Field(default=None, max_length=255)
    total_provider_duration_ms: float = Field(default=0, ge=0)
    total_tool_duration_ms: float = Field(default=0, ge=0)
    # Content-free political-gate observability.  Never add raw/normalized
    # text, rule IDs, category, excerpts, or hashes derived from user text.
    political_gate_decision: Literal["allow", "block"] | None = None
    political_policy_version: str | None = Field(default=None, max_length=100)
    political_policy_hash: str | None = Field(default=None, max_length=128)
    political_gate_enforcement_layer: Literal["fastapi"] | None = None
    political_gate_latency_ms: float | None = Field(default=None, ge=0)
    deadline_checkpoints: list[DeadlineCheckpoint] = Field(default_factory=list)
    provider_calls: list[ProviderCallObservation] = Field(default_factory=list)
    tool_calls: list[ToolCallObservation] = Field(default_factory=list)
    metrics_complete: bool = False


class AgentRuntimeResult(StrictContract):
    submission: AgentSubmissionV2
    actual_tool_outputs: list[ToolResultEnvelope] = Field(default_factory=list)
    execution_metrics: AgentExecutionMetrics
    provider_response_ids: list[str] = Field(default_factory=list)
