from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

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

    @model_validator(mode="after")
    def validate_draft_span(self):
        if self.draft_end < self.draft_start:
            raise ValueError("draft_end must be greater than or equal to draft_start")
        if len(set(self.evidence_refs)) != len(self.evidence_refs):
            raise ValueError("evidence_refs must not contain duplicates")
        return self


class AgentCitation(StrictContract):
    evidence_ref: str = Field(min_length=1, max_length=255)
    display_label: str = Field(min_length=1, max_length=500)


class AgentSubmissionV2(StrictContract):
    schema_version: Literal["agent_submission.v2"]
    answer_class: Literal["general", "procedural", "substantive_legal", "safety_blocked"]
    draft_markdown: str = Field(min_length=1, max_length=50000)
    as_of_date: date | None = None
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

    @model_validator(mode="after")
    def validate_budget(self):
        if self.answer_research_target_ms + self.checker_target_ms > self.turn_deadline_ms:
            raise ValueError("answer and checker targets must fit inside turn_deadline_ms")
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
    experiment_arm: Literal["A", "B", "C", "D"] | None = None


class DeadlineCheckpoint(StrictContract):
    stage: str = Field(min_length=1, max_length=255)
    remaining_deadline_before_call_ms: float = Field(ge=0)


class ProviderCallObservation(StrictContract):
    stage: str = Field(min_length=1, max_length=255)
    response_id: str | None = Field(default=None, max_length=255)
    model: str | None = Field(default=None, max_length=255)
    effort: str | None = Field(default=None, max_length=100)
    input_tokens: int | None = Field(default=None, ge=0)
    cached_input_tokens: int | None = Field(default=None, ge=0)
    reasoning_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    duration_ms: float = Field(ge=0)
    remaining_deadline_before_call_ms: float = Field(ge=0)
    status: Literal["ok", "timeout", "error"] = "ok"
    is_retry: bool = False


class ToolCallObservation(StrictContract):
    tool_name: Literal[
        "web_search",
        "exact_legal_lookup",
        "lightrag_search",
        "flat_rag_search",
        "deterministic_utility",
        "submit_answer",
    ]
    tool_call_id: str | None = Field(default=None, max_length=255)
    round_index: int = Field(ge=1)
    status: Literal["ok", "partial", "unavailable", "invalid_request", "timeout", "error"]
    duration_ms: float = Field(ge=0)
    remaining_deadline_before_call_ms: float = Field(ge=0)
    result_count: int | None = Field(default=None, ge=0)
    is_retry: bool = False


class AgentExecutionMetrics(StrictContract):
    logical_llm_stage_count: int = Field(default=0, ge=0)
    provider_api_call_count: int = Field(default=0, ge=0)
    tool_call_count: int = Field(default=0, ge=0)
    tool_round_count: int = Field(default=0, ge=0)
    web_search_call_count: int = Field(default=0, ge=0)
    web_search_pii_violation_count: int = Field(default=0, ge=0)
    exact_lookup_call_count: int = Field(default=0, ge=0)
    lightrag_call_count: int = Field(default=0, ge=0)
    flat_rag_call_count: int = Field(default=0, ge=0)
    utility_call_count: int = Field(default=0, ge=0)
    submit_answer_call_count: int = Field(default=0, ge=0)
    retry_count: int = Field(default=0, ge=0)
    turn_deadline_ms: int = Field(ge=1)
    backend_total_latency_ms: float = Field(default=0, ge=0)
    pre_agent_latency_ms: float = Field(default=0, ge=0)
    frontend_to_backend_latency_ms: float | None = Field(default=None, ge=0)
    remaining_deadline_before_call_ms: float = Field(ge=0)
    deadline_exceeded_stage: str | None = Field(default=None, max_length=255)
    terminal_submission_missing: bool = False
    terminal_submission_continuation_count: int = Field(default=0, ge=0, le=1)
    answer_agent_latency_ms: float = Field(default=0, ge=0)
    fact_check_latency_ms: float = Field(default=0, ge=0)
    total_latency_ms: float = Field(default=0, ge=0)
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
