"""Strict contracts for the Phase 7.3B synthetic experiment.

These objects describe a fictional process-reasoning benchmark.  They are not
legal evidence and are deliberately separate from the customer answer
contracts and the Phase 7.3A governance schemas.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SyntheticStrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SyntheticEvidenceItem(SyntheticStrictContract):
    evidence_id: str = Field(pattern=r"^ev-[a-z0-9][a-z0-9-]{0,100}$")
    authority_kind: Literal["synthetic_regulation", "synthetic_record", "synthetic_notice"]
    text: str = Field(min_length=1, max_length=3000)
    effective_from: str | None = None
    effective_to: str | None = None


class SyntheticObservation(SyntheticStrictContract):
    observation_type: Literal[
        "navigation_hint",
        "local_lookup_absence",
        "event_date",
        "model_memory",
        "research_result",
    ]
    value: str = Field(min_length=1, max_length=1000)


class SyntheticTaskVisibleInput(SyntheticStrictContract):
    """The only task-time payload permitted in runner prompts."""

    question: str = Field(min_length=1, max_length=4000)
    compact_facts: dict[str, str | int | float | bool | None] = Field(default_factory=dict)
    synthetic_evidence: list[SyntheticEvidenceItem] = Field(default_factory=list, max_length=20)
    synthetic_observations: list[SyntheticObservation] = Field(default_factory=list, max_length=20)
    allowed_research_actions: list[str] = Field(default_factory=list, max_length=20)


class RetrievalQuery(SyntheticStrictContract):
    """Task-visible retrieval fields; benchmark metadata is not representable."""

    question: str = Field(min_length=1, max_length=4000)
    compact_facts: dict[str, str | int | float | bool | None] = Field(default_factory=dict)
    synthetic_observations: list[SyntheticObservation] = Field(default_factory=list, max_length=20)


class SyntheticTaskInput(SyntheticStrictContract):
    """Experiment metadata plus the task-visible payload kept behind an adapter."""

    schema_version: Literal["phase7.3b.task_input.v1"] = "phase7.3b.task_input.v1"
    task_id: str = Field(pattern=r"^(source|holdout|negative)-[a-z0-9][a-z0-9-]{0,100}$")
    family: str = Field(pattern=r"^[a-z][a-z0-9_]{2,63}$")
    split: Literal["source", "held_out_positive", "negative_control"]
    question: str = Field(min_length=1, max_length=4000)
    compact_facts: dict[str, str | int | float | bool | None] = Field(default_factory=dict)
    synthetic_evidence: list[SyntheticEvidenceItem] = Field(default_factory=list, max_length=20)
    synthetic_observations: list[SyntheticObservation] = Field(default_factory=list, max_length=20)
    allowed_research_actions: list[str] = Field(default_factory=list, max_length=20)
    fixture_forced_failure: bool = False

    @model_validator(mode="after")
    def split_matches_id(self):
        expected = {
            "source": "source-",
            "held_out_positive": "holdout-",
            "negative_control": "negative-",
        }[self.split]
        if not self.task_id.startswith(expected):
            raise ValueError("task_id prefix does not match split")
        return self

    def task_visible(self) -> SyntheticTaskVisibleInput:
        return SyntheticTaskVisibleInput(
            question=self.question,
            compact_facts=dict(self.compact_facts),
            synthetic_evidence=list(self.synthetic_evidence),
            synthetic_observations=list(self.synthetic_observations),
            allowed_research_actions=list(self.allowed_research_actions),
        )

    def retrieval_query(self) -> RetrievalQuery:
        return RetrievalQuery(
            question=self.question,
            compact_facts=dict(self.compact_facts),
            synthetic_observations=list(self.synthetic_observations),
        )


class SyntheticTaskOracle(SyntheticStrictContract):
    """Deterministic scoring criteria; never passed to a model or retriever."""

    schema_version: Literal["phase7.3b.task_oracle.v1"] = "phase7.3b.task_oracle.v1"
    task_id: str
    expected_disposition: Literal[
        "conclude", "conditional", "ask_missing_fact", "research_more", "abstain"
    ]
    required_research_actions: list[str] = Field(default_factory=list, max_length=20)
    prohibited_research_actions: list[str] = Field(default_factory=list, max_length=20)
    required_missing_fact_keys: list[str] = Field(default_factory=list, max_length=20)
    prohibited_claim_ids: list[str] = Field(default_factory=list, max_length=50)
    required_evidence_ids: list[str] = Field(default_factory=list, max_length=20)
    prohibited_evidence_ids: list[str] = Field(default_factory=list, max_length=20)
    applicable_rule_families: list[str] = Field(default_factory=list, max_length=10)
    required_claim_ids: list[str] = Field(default_factory=list, max_length=50)
    scoring_criteria: list[str] = Field(default_factory=list, max_length=30)


class SyntheticClaim(SyntheticStrictContract):
    claim_id: str = Field(min_length=1, max_length=100)
    proposition: str = Field(min_length=1, max_length=2000)
    supporting_evidence_ids: list[str] = Field(default_factory=list, max_length=20)


class RunnerModelOutput(SyntheticStrictContract):
    """Model-visible runner output; experiment bookkeeping is server-owned."""

    schema_version: Literal["phase7.3b.run_observation.v1"] = "phase7.3b.run_observation.v1"
    disposition: Literal["conclude", "conditional", "ask_missing_fact", "research_more", "abstain"]
    requested_fact_keys: list[str] = Field(default_factory=list, max_length=20)
    research_actions: list[str] = Field(default_factory=list, max_length=20)
    claims: list[SyntheticClaim] = Field(default_factory=list, max_length=30)
    cited_evidence_ids: list[str] = Field(default_factory=list, max_length=30)
    final_answer: str = Field(default="", max_length=4000)
    architecture_violation_flags: list[str] = Field(default_factory=list, max_length=30)


class CompilerModelProposal(SyntheticStrictContract):
    """Model-owned semantic compiler fields only.

    Packet identity, candidate lineage, evaluation/control metadata, and
    governance confirmations are attached or checked server-side.
    """

    rule_type: Literal[
        "research_strategy",
        "evidence_strategy",
        "fact_elicitation",
        "reasoning_strategy",
        "failure_avoidance",
    ]
    title: str = Field(min_length=1, max_length=180)
    trigger_conditions: list[str] = Field(min_length=1, max_length=8)
    applicability_conditions: list[str] = Field(min_length=1, max_length=8)
    action_steps: list[str] = Field(min_length=1, max_length=8)
    verification_steps: list[str] = Field(min_length=1, max_length=8)
    prohibited_behaviors: list[str] = Field(min_length=1, max_length=8)
    exceptions_or_limits: list[str] = Field(min_length=1, max_length=8)
    transfer_targets: list[str] = Field(default_factory=list, max_length=20)
    source_specific_residue: list[str] = Field(default_factory=list, max_length=20)
    legal_proposition_residue: list[str] = Field(default_factory=list, max_length=20)


class CompilerModelOutput(SyntheticStrictContract):
    """Strict Responses parse target with no benchmark or control-plane IDs."""

    proposals: list[CompilerModelProposal] = Field(default_factory=list, max_length=3)


class SyntheticRunObservation(SyntheticStrictContract):
    """Bounded model output.  It contains no hidden reasoning field."""

    schema_version: Literal["phase7.3b.run_observation.v1"] = "phase7.3b.run_observation.v1"
    task_id: str
    condition: Literal["baseline", "memory"]
    disposition: Literal["conclude", "conditional", "ask_missing_fact", "research_more", "abstain"]
    requested_fact_keys: list[str] = Field(default_factory=list, max_length=20)
    research_actions: list[str] = Field(default_factory=list, max_length=20)
    claims: list[SyntheticClaim] = Field(default_factory=list, max_length=30)
    cited_evidence_ids: list[str] = Field(default_factory=list, max_length=30)
    final_answer: str = Field(default="", max_length=4000)
    architecture_violation_flags: list[str] = Field(default_factory=list, max_length=30)
    provider_status: Literal["ok", "provider_error", "invalid_structured_output", "timeout"] = "ok"
    fixture_forced_failure: bool = False


class ProviderFailureDiagnostic(SyntheticStrictContract):
    """Credential-safe diagnostics for a single failed live provider attempt."""

    failure_stage: Literal[
        "client_initialization",
        "request",
        "http_response",
        "structured_output",
        "response_parse",
        "budget",
        "timeout",
    ]
    exception_type: str = Field(min_length=1, max_length=120)
    http_status_code: int | None = Field(default=None, ge=100, le=599)
    provider_error_type: str | None = Field(default=None, min_length=1, max_length=120)
    provider_error_code: str | None = Field(default=None, min_length=1, max_length=120)
    provider_error_param: str | None = Field(default=None, min_length=1, max_length=120)
    provider_error_message: str | None = Field(default=None, min_length=1, max_length=500)
    safe_message: str = Field(min_length=1, max_length=300)
    model: str = Field(min_length=1, max_length=200)
    request_role: Literal["runner", "compiler"]
    attempt_number: int = Field(ge=1)


class SyntheticFailureObservation(SyntheticStrictContract):
    task_id: str
    failure_codes: list[str] = Field(min_length=1, max_length=10)
    feedback: str = Field(min_length=1, max_length=2000)
    fixture_forced_failure: bool = False


class SyntheticFeedback(SyntheticStrictContract):
    """Generalized process feedback with no answer, case, or benchmark labels."""

    failure_codes: list[str] = Field(min_length=1, max_length=10)
    feedback: str = Field(min_length=1, max_length=2000)


class SyntheticCuratorDecision(SyntheticStrictContract):
    proposal_id: str = Field(min_length=1, max_length=255)
    action: Literal["approve_new", "merge_support", "reject"]
    reason_code: str = Field(min_length=1, max_length=100)


class RepeatCaseResult(SyntheticStrictContract):
    repeat_index: int = Field(ge=0)
    baseline: "SyntheticCaseEvaluation"
    memory: "SyntheticCaseEvaluation"
    baseline_prompt_fingerprint: str
    memory_prompt_fingerprint: str
    invariant_prompt_fingerprint: str


class CompilerProviderResult(SyntheticStrictContract):
    role: Literal["compiler"] = "compiler"
    status: Literal["ok", "provider_error", "invalid_structured_output", "timeout"]
    proposals: list[dict[str, Any]] = Field(default_factory=list, max_length=3)
    error_kind: str | None = None
    model: str
    call_number: int


class GuidanceRule(SyntheticStrictContract):
    rule_key: str = Field(min_length=1, max_length=255)
    rule_version: int = Field(ge=1)
    rule_type: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=180)
    trigger_conditions: list[str] = Field(min_length=1, max_length=8)
    applicability_conditions: list[str] = Field(min_length=1, max_length=8)
    action_steps: list[str] = Field(min_length=1, max_length=8)
    verification_steps: list[str] = Field(min_length=1, max_length=8)
    prohibited_behaviors: list[str] = Field(min_length=1, max_length=8)
    exceptions_or_limits: list[str] = Field(min_length=1, max_length=8)
    relevance_score: float = Field(ge=0)
    retrieval_rank: int = Field(ge=1)


class ReasoningGuidancePacket(SyntheticStrictContract):
    """The only memory representation supplied to the memory condition."""

    schema_version: Literal["phase7.3b.reasoning_guidance.v1"] = "phase7.3b.reasoning_guidance.v1"
    packet_id: str = Field(pattern=r"^guidance-[a-f0-9]{64}$")
    bank_namespace: Literal["simulation"] = "simulation"
    bank_digest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    query_fingerprint: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    rules: list[GuidanceRule] = Field(default_factory=list, max_length=3)
    notice: Literal[
        "PROCESS GUIDANCE ONLY; NOT EVIDENCE; NOT LEGAL AUTHORITY; MUST NOT BE CITED"
    ] = "PROCESS GUIDANCE ONLY; NOT EVIDENCE; NOT LEGAL AUTHORITY; MUST NOT BE CITED"


class RetrievalDecision(SyntheticStrictContract):
    rule_key: str
    score: float = Field(ge=0)
    rank: int = Field(ge=1)
    selected: bool
    rejection_reason: Literal["below_threshold", "top_k_exceeded"] | None = None


class RetrievalResult(SyntheticStrictContract):
    query_fingerprint: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    threshold: float = Field(ge=0)
    top_k: int = Field(ge=0, le=3)
    decisions: list[RetrievalDecision] = Field(default_factory=list, max_length=100)
    selected_rule_keys: list[str] = Field(default_factory=list, max_length=3)
    guidance: ReasoningGuidancePacket


class MetricResult(SyntheticStrictContract):
    metric: str
    result: Literal["PASS", "FAIL", "NOT_SCORED"]
    failure_code: str | None = None
    detail: str | None = None


class SyntheticCaseEvaluation(SyntheticStrictContract):
    task_id: str
    split: Literal["source", "held_out_positive", "negative_control"]
    condition: Literal["baseline", "memory"]
    overall: Literal["PASS", "FAIL", "NOT_SCORED"]
    metrics: list[MetricResult] = Field(default_factory=list, max_length=30)
    retrieved_rule_keys: list[str] = Field(default_factory=list, max_length=3)
    provider_status: str = "ok"


class PairedCaseResult(SyntheticStrictContract):
    task_id: str
    split: Literal["source", "held_out_positive", "negative_control"]
    baseline: SyntheticCaseEvaluation
    memory: SyntheticCaseEvaluation
    baseline_prompt_fingerprint: str
    memory_prompt_fingerprint: str
    invariant_prompt_fingerprint: str
    repeat_count_requested: int = Field(default=1, ge=1, le=3)
    repeat_count_completed: int = Field(default=1, ge=0, le=3)
    repeat_results: list[RepeatCaseResult] = Field(default_factory=list, max_length=3)
    baseline_pass_count: int = Field(default=0, ge=0, le=3)
    baseline_fail_count: int = Field(default=0, ge=0, le=3)
    baseline_not_scored_count: int = Field(default=0, ge=0, le=3)
    memory_pass_count: int = Field(default=0, ge=0, le=3)
    memory_fail_count: int = Field(default=0, ge=0, le=3)
    memory_not_scored_count: int = Field(default=0, ge=0, le=3)


class StageExperimentMetrics(SyntheticStrictContract):
    """Complete diagnostics for one cumulative learning-bank stage."""

    stage_index: int = Field(ge=1)
    bank_rule_count: int = Field(ge=0)
    bank_digest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    evaluated_families: list[str] = Field(default_factory=list, max_length=20)
    evaluated_case_count: int = Field(ge=0)
    baseline_pass_rate: float = Field(ge=0, le=1)
    memory_pass_rate: float = Field(ge=0, le=1)
    pass_rate_delta: float
    improved_cases: list[str] = Field(default_factory=list)
    regressed_cases: list[str] = Field(default_factory=list)
    positive_transfer_improvements: list[str] = Field(default_factory=list)
    negative_control_regressions: list[str] = Field(default_factory=list)
    retrieval_count: int = Field(ge=0)
    relevant_retrieval_count: int = Field(ge=0)
    irrelevant_retrieval_count: int = Field(ge=0)
    retrieval_precision: float | None = Field(default=None, ge=0, le=1)
    no_memory_retrieved_count: int = Field(ge=0)
    no_memory_retrieved_rate: float = Field(ge=0, le=1)
    negative_control_retrieval_rate: float = Field(ge=0, le=1)
    provider_error_count: int = Field(ge=0)
    memory_as_evidence_violations: list[str] = Field(default_factory=list)
    source_leakage_violations: list[str] = Field(default_factory=list)
    architecture_invariant_violations: list[str] = Field(default_factory=list)


class ExperimentReport(SyntheticStrictContract):
    schema_version: Literal["phase7.3b.report.v1"] = "phase7.3b.report.v1"
    run_id: str
    git_head: str
    fixture_pack_version: str
    fixture_pack_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    mode: Literal["fixture", "live"]
    verdict: Literal[
        "INFRASTRUCTURE_VALIDATED",
        "MECHANISM_SUPPORTED",
        "INCONCLUSIVE",
        "HARM_SIGNAL",
        "INFRASTRUCTURE_FAILURE",
    ]
    compiler_model: str
    runner_model: str
    max_live_calls: int = Field(ge=0, le=100)
    repeats: int = Field(ge=1, le=3)
    retriever_threshold: float = Field(ge=0)
    retriever_top_k: int = Field(ge=0, le=3)
    total_provider_calls: int = Field(ge=0)
    provider_statuses: list[str] = Field(default_factory=list)
    source_failure_before_learning: int = Field(ge=0)
    no_learning_signal_source_cases: list[str] = Field(default_factory=list)
    baseline_pass_rate: float = Field(ge=0, le=1)
    memory_pass_rate: float = Field(ge=0, le=1)
    pass_rate_delta: float
    improved_cases: list[str] = Field(default_factory=list)
    regressed_cases: list[str] = Field(default_factory=list)
    unchanged_pass: list[str] = Field(default_factory=list)
    unchanged_fail: list[str] = Field(default_factory=list)
    retrieval_precision: float | None = Field(default=None, ge=0, le=1)
    irrelevant_memory_rate: float = Field(ge=0, le=1)
    no_memory_retrieved_rate: float = Field(ge=0, le=1)
    negative_control_retrieval_rate: float = Field(ge=0, le=1)
    memory_as_evidence_violations: list[str] = Field(default_factory=list)
    source_case_leakage_violations: list[str] = Field(default_factory=list)
    architecture_invariant_violations: list[str] = Field(default_factory=list)
    bank_rule_counts: list[int] = Field(default_factory=list)
    cumulative_regressions: dict[str, list[str]] = Field(default_factory=dict)
    retrievals: list[dict[str, Any]] = Field(default_factory=list)
    paired_cases: list[PairedCaseResult] = Field(default_factory=list)
    source_compiler_calls: int = Field(default=0, ge=0)
    governed_simulation_rule_count: int = Field(default=0, ge=0)
    required_live_calls: int | None = Field(default=None, ge=0)
    budget_exhausted: bool = False
    unresolved_infrastructure_errors: list[str] = Field(default_factory=list)
    stage_metrics: list[StageExperimentMetrics] = Field(default_factory=list)
    curator_decisions: list[SyntheticCuratorDecision] = Field(default_factory=list)
    provider_diagnostics: list[ProviderFailureDiagnostic] = Field(
        default_factory=list, max_length=100
    )
