"""Phase 7.3B tests: deterministic, isolated, and never authoritative-DB backed."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.db.models import ExperienceRecord
from app.schemas.learning import ReasoningLesson, RuleCompilerOutput, RuleCompilerProposalDraft
from app.schemas.phase7_3b import (
    ExperimentReport,
    CompilerModelOutput,
    MetricResult,
    PairedCaseResult,
    ProviderFailureDiagnostic,
    ReasoningGuidancePacket,
    RunnerModelOutput,
    StageExperimentMetrics,
    SyntheticCaseEvaluation,
    SyntheticRunObservation,
)
from app.services.phase7_3a_reasoning_bank import (
    Phase73RuleCompilerService,
    ReasoningBankManager,
    ReasoningBankService,
    render_lesson_text,
)
from app.services.phase7_artifact_service import Phase7ArtifactService
from app.services.phase7_3b_experiment import (
    Phase73BExperiment,
    SyntheticCurator,
    SyntheticEvaluator,
    SyntheticSupervisor,
    _contains_source_material,
    build_compiler_prompt,
    build_runner_prompt,
    build_source_compiler_packet,
    fixture_providers,
    write_artifacts,
)
import app.services.phase7_3b_provider as phase7_3b_provider
from app.services.phase7_3b_provider import (
    FixtureProvider,
    LiveCallBudget,
    Phase73BProviderError,
    Phase73BResponsesProvider,
    ProviderResponse,
    parse_runner_response,
)
from app.services.phase7_3b_retrieval import Phase73BReasoningRetriever
from app.services.phase7_3b_synthetic_world import (
    SimulationStore,
    SyntheticWorldError,
    default_fixture_pack_path,
    fixture_pack_path,
    load_fixture_pack,
)


@pytest.fixture
def pack():
    return load_fixture_pack(default_fixture_pack_path())


def _rule(rule_key="rule-simulation-test"):
    data = dict(
        lesson_id=f"{rule_key}:v1",
        rule_key=rule_key,
        bank_namespace="simulation",
        provenance="synthetic_test",
        origin="manual_fixture",
        lifecycle="approved",
        governance_state="normal",
        validation_state="unvalidated",
        rule_type="research_strategy",
        title="Check unresolved process predicates",
        trigger_conditions=["A process predicate is unresolved."],
        applicability_conditions=["The predicate can change the process result."],
        action_steps=["List the unresolved predicate before concluding."],
        verification_steps=["Verify the predicate is known."],
        prohibited_behaviors=["Do not conclude from an unknown predicate."],
        exceptions_or_limits=["A general process explanation may remain conditional."],
        source_proposal_id="proposal-test",
        source_candidate_ids=["candidate-test"],
        approved_by="synthetic-curator",
        approval_mode="simulation_offline",
    )
    data["lesson_text"] = render_lesson_text(type("Rule", (), data)())
    return ReasoningLesson(**data)


def test_fixture_pack_has_five_families_and_strict_split(pack):
    assert len(pack.families) >= 5
    for family in pack.families:
        assert family.source.input.split == "source"
        assert len(family.held_out_positive) >= 2
        assert len(family.negative_controls) >= 2
        assert family.source.input.fixture_forced_failure is True
        assert all(not case.input.fixture_forced_failure for case in family.held_out_positive)


def test_oracle_is_not_in_runner_prompt_or_retriever_input(pack):
    case = pack.family("decisive_missing_fact").held_out_positive[0]
    prompt, _ = build_runner_prompt(case.input.task_visible(), condition="baseline", guidance=None)
    assert case.oracle.model_dump_json() not in prompt
    assert "expected_disposition" not in prompt
    result = Phase73BReasoningRetriever().retrieve(
        case.input.retrieval_query(),
        rules=[],
        bank_digest="sha256:" + "0" * 64,
    )
    assert result.selected_rule_keys == []
    assert "expected_disposition" not in result.guidance.model_dump_json()


def test_guidance_packet_forbids_evidence_and_source_fields():
    with pytest.raises(ValueError):
        ReasoningGuidancePacket(
            packet_id="guidance-" + "0" * 64,
            bank_digest="sha256:" + "0" * 64,
            query_fingerprint="sha256:" + "1" * 64,
            evidence_ref="not-allowed",
        )


def test_retriever_filters_lifecycle_namespace_and_weak_matches(pack):
    retriever = Phase73BReasoningRetriever(relevance_threshold=0.9, top_k=1)
    case = pack.family("decisive_missing_fact").held_out_positive[0]
    rejected = _rule()
    rejected = rejected.model_copy(update={"lifecycle": "retired"})
    result = retriever.retrieve(
        case.input.retrieval_query(),
        rules=[rejected, _rule("rule-simulation-two")],
        bank_digest="sha256:" + "0" * 64,
    )
    assert result.selected_rule_keys == []
    assert all(not item.selected for item in result.decisions)


def test_live_provider_is_unreachable_without_both_explicit_gates():
    provider = Phase73BResponsesProvider(
        live_requested=False,
        enabled_value="true",
        budget=LiveCallBudget(40),
    )
    with pytest.raises(Phase73BProviderError, match="--live"):
        provider.complete(role="runner", prompt="never sent", model="not-called")
    assert provider.budget.count == 0


class _FakeResponses:
    def __init__(self, *, parsed=None, parse_error=None, created=None, create_error=None):
        self.parsed = parsed
        self.parse_error = parse_error
        self.created = created
        self.create_error = create_error
        self.parse_calls = []
        self.create_calls = []

    def parse(self, **kwargs):
        self.parse_calls.append(kwargs)
        if self.parse_error is not None:
            raise self.parse_error
        return SimpleNamespace(output_parsed=self.parsed)

    def create(self, **kwargs):
        self.create_calls.append(kwargs)
        if self.create_error is not None:
            raise self.create_error
        return SimpleNamespace(output_text=self.created)


class _FakeClient:
    def __init__(self, responses):
        self.responses = responses


class _FakeHTTPError(Exception):
    def __init__(self, status_code, code, *, error_type=None, param=None, message=None):
        super().__init__("credential-bearing details must not be persisted")
        self.status_code = status_code
        self.body = {
            "error": {
                "type": error_type,
                "code": code,
                "param": param,
                "message": message,
            }
        }


def _valid_observation():
    return RunnerModelOutput(
        disposition="abstain",
    )


def _provider_for_responses(responses):
    return Phase73BResponsesProvider(
        live_requested=True,
        enabled_value="true",
        budget=LiveCallBudget(1),
        client=_FakeClient(responses),
    )


def test_live_provider_uses_responses_parse_and_reasoning_effort():
    responses = _FakeResponses(parsed=_valid_observation())
    result = _provider_for_responses(responses).complete(
        role="runner", prompt="prompt", model="gpt-5.6-luna"
    )
    assert result.status == "ok"
    request = responses.parse_calls[0]
    assert request["text_format"] is RunnerModelOutput
    assert request["reasoning"] == {"effort": "low"}
    assert request["tools"] == []
    assert request["tool_choice"] == "none"


def test_live_compiler_uses_strict_responses_parse_without_legacy_create():
    responses = _FakeResponses(parsed=CompilerModelOutput())
    result = _provider_for_responses(responses).complete(
        role="compiler", prompt="source failure feedback", model="gpt-5.6-sol"
    )
    assert result.status == "ok"
    assert responses.parse_calls[0]["text_format"] is CompilerModelOutput
    assert responses.create_calls == []
    schema = CompilerModelOutput.model_json_schema()
    schema_text = json.dumps(schema, sort_keys=True)
    assert all(
        value not in schema_text
        for value in (
            "task_id",
            "holdout",
            "negative_control",
            "split",
            "family",
            "expected_disposition",
            "scoring_criteria",
            "case_erasure_confirmation",
            "procedural_only_confirmation",
            "supporting_evaluation_case_ids",
            "negative_control_case_ids",
        )
    )


def test_compiler_smoke_is_capped_and_does_not_start_runner_or_governance(monkeypatch, capsys):
    import importlib

    smoke = importlib.import_module("scripts.phase7_3b_synthetic_experiment")
    calls = []

    class FakeCompilerProvider:
        def __init__(self, **kwargs):
            self.budget = kwargs["budget"]

        def complete(self, *, role, prompt, model):
            self.budget.reserve(role)
            calls.append((role, prompt, model, self.budget.maximum))
            assert self.budget.count == 1
            return ProviderResponse("ok", CompilerModelOutput().model_dump(mode="json"), model, 1)

    monkeypatch.setattr(smoke, "Phase73BResponsesProvider", FakeCompilerProvider)
    assert smoke._run_live_compiler_smoke(compiler_model="gpt-5.6-sol") == 0
    assert len(calls) == 1
    assert calls[0][0] == "compiler"
    assert "source-missing-" not in calls[0][1]
    assert "held_out_positive" not in calls[0][1]
    assert "negative_control" not in calls[0][1]
    assert "oracle" not in calls[0][1]
    assert "ReasoningBankService" not in calls[0][1]
    assert json.loads(capsys.readouterr().out)["call_number"] == 1


def test_runner_model_schema_is_blind_to_experiment_metadata(pack):
    case = pack.family("decisive_missing_fact").held_out_positive[0]
    prompt, _ = build_runner_prompt(case.input.task_visible(), condition="baseline", guidance=None)
    schema = RunnerModelOutput.model_json_schema()
    schema_text = json.dumps(schema, sort_keys=True)
    assert "task_id" not in schema["properties"]
    assert "condition" not in schema["properties"]
    assert "baseline" not in schema_text
    assert "memory" not in schema_text
    assert "provider_status" not in schema["properties"]
    assert "fixture_forced_failure" not in schema["properties"]
    assert case.input.task_id not in prompt
    assert "baseline" not in prompt
    assert "memory" not in prompt


def test_compiler_prompt_is_source_only_and_schema_blind(pack):
    family = pack.family("decisive_missing_fact")
    with SimulationStore() as store:
        with store.session() as db:
            ids = store.seed_case(db, family.source)
            candidate = store.add_candidate(
                db,
                case=family.source,
                ids=ids,
                lesson_text=SyntheticSupervisor.candidate_text(["missing_required_fact_request"]),
                failure_codes=["missing_required_fact_request"],
            )
            db.flush()
            packet = build_source_compiler_packet(
                db, candidate_ids=[candidate.candidate_id], bank_namespace="simulation"
            )
    prompt = build_compiler_prompt(packet)
    assert family.source.input.task_id not in prompt
    assert family.family not in prompt
    assert all(
        value not in prompt
        for value in (
            "held_out_positive",
            "negative_control",
            "expected_disposition",
            "scoring_criteria",
            "oracle",
            "packet_id",
            "candidate_id",
        )
    )
    assert "failure-feedback" in prompt


def test_runner_output_is_enriched_with_server_metadata_only():
    sentinel = RunnerModelOutput(disposition="abstain")
    response = ProviderResponse("ok", sentinel.model_dump(mode="json"), "gpt-5.6-luna", 1)
    observation = parse_runner_response(response, task_id="TASK_SECRET_73B", condition="memory")
    assert observation.task_id == "TASK_SECRET_73B"
    assert observation.condition == "memory"
    assert observation.provider_status == "ok"
    assert observation.fixture_forced_failure is False
    assert "TASK_SECRET_73B" not in sentinel.model_dump_json()
    assert "condition" not in sentinel.model_dump_json()


def test_provider_parse_capture_uses_runner_model_output_only():
    responses = _FakeResponses(parsed=_valid_observation())
    result = _provider_for_responses(responses).complete(
        role="runner", prompt="prompt", model="gpt-5.6-luna"
    )
    assert result.status == "ok"
    assert responses.parse_calls[0]["text_format"] is RunnerModelOutput
    schema = responses.parse_calls[0]["text_format"].model_json_schema()
    schema_text = json.dumps(schema, sort_keys=True)
    property_names = schema["properties"]
    assert all(
        value not in property_names and value not in schema_text
        for value in (
            "task_id",
            "baseline",
            "memory",
            "provider_status",
            "fixture_forced_failure",
        )
    )
    assert "condition" not in property_names


def test_live_provider_reports_missing_project_configured_key(monkeypatch):
    monkeypatch.setattr(
        phase7_3b_provider,
        "get_settings",
        lambda: SimpleNamespace(openai_api_key=None),
    )
    provider = Phase73BResponsesProvider(
        live_requested=True,
        enabled_value="true",
        budget=LiveCallBudget(1),
    )
    result = provider.complete(role="runner", prompt="prompt", model="gpt-5.6-luna")
    assert result.status == "provider_error"
    assert result.diagnostic is not None
    assert result.diagnostic.failure_stage == "client_initialization"
    assert result.diagnostic.safe_message == "OpenAI client initialization failed"


@pytest.mark.parametrize(
    ("error", "stage", "status_code", "code"),
    [
        (_FakeHTTPError(401, "authentication_error"), "http_response", 401, "authentication_error"),
        (
            _FakeHTTPError(400, "invalid_request_error"),
            "http_response",
            400,
            "invalid_request_error",
        ),
        (TimeoutError("timeout details"), "timeout", None, None),
    ],
)
def test_live_provider_returns_safe_diagnostics_for_request_failures(
    error, stage, status_code, code
):
    responses = _FakeResponses(parse_error=error)
    result = _provider_for_responses(responses).complete(
        role="runner", prompt="prompt", model="gpt-5.6-luna"
    )
    assert result.status == ("timeout" if stage == "timeout" else "provider_error")
    assert result.diagnostic is not None
    diagnostic = result.diagnostic
    assert diagnostic.failure_stage == stage
    assert diagnostic.http_status_code == status_code
    assert diagnostic.provider_error_code == code
    assert "credential-bearing" not in diagnostic.safe_message
    assert "details" not in diagnostic.safe_message


def test_live_provider_retains_only_sanitized_provider_error_details():
    responses = _FakeResponses(
        parse_error=_FakeHTTPError(
            400,
            "invalid_request_error",
            error_type="invalid_request_error",
            param="text.format",
            message="Invalid response format; api_key=do-not-store",
        )
    )
    result = _provider_for_responses(responses).complete(
        role="compiler", prompt="prompt", model="gpt-5.6-sol"
    )
    assert result.diagnostic is not None
    diagnostic = result.diagnostic
    assert diagnostic.provider_error_type == "invalid_request_error"
    assert diagnostic.provider_error_code == "invalid_request_error"
    assert diagnostic.provider_error_param == "text.format"
    assert diagnostic.provider_error_message == "[redacted provider error detail]"
    serialized = diagnostic.model_dump_json()
    assert "api_key" not in serialized
    assert "do-not-store" not in serialized


def test_live_provider_identifies_malformed_structured_response():
    responses = _FakeResponses(parsed=None)
    result = _provider_for_responses(responses).complete(
        role="runner", prompt="prompt", model="gpt-5.6-luna"
    )
    assert result.status == "invalid_structured_output"
    assert result.diagnostic is not None
    assert result.diagnostic.failure_stage == "structured_output"


def test_live_provider_identifies_schema_parse_failure():
    responses = _FakeResponses(parse_error=ValueError("schema details"))
    result = _provider_for_responses(responses).complete(
        role="runner", prompt="prompt", model="gpt-5.6-luna"
    )
    assert result.status == "invalid_structured_output"
    assert result.diagnostic is not None
    assert result.diagnostic.failure_stage == "response_parse"


def test_live_provider_identifies_compiler_response_parse_failure():
    responses = _FakeResponses(parse_error=ValueError("schema details"))
    result = _provider_for_responses(responses).complete(
        role="compiler", prompt="prompt", model="gpt-5.6-sol"
    )
    assert result.status == "invalid_structured_output"
    assert result.diagnostic is not None
    assert result.diagnostic.failure_stage == "response_parse"


def test_authoritative_url_is_rejected_before_create_all():
    with pytest.raises(SyntheticWorldError, match="SQLite URL"):
        SimulationStore("postgresql+psycopg://rico_local@localhost:5432/immigration_legal")
    with pytest.raises(SyntheticWorldError, match="temporary or in-memory"):
        SimulationStore("sqlite:////tmp/phase7_3b_persistent.sqlite3")


def test_simulation_store_is_temporary_and_cleans_up(pack, monkeypatch):
    import app.db.session as db_module

    monkeypatch.setattr(
        db_module, "SessionLocal", lambda: pytest.fail("authoritative SessionLocal used")
    )
    with SimulationStore() as store:
        temporary_path = store._temporary_path
        with store.session() as db:
            ids = store.seed_case(db, pack.family("decisive_missing_fact").source)
            db.commit()
        assert temporary_path and Path(temporary_path).exists()
        assert db.get(ExperienceRecord, ids["experience_id"]) is not None
    assert temporary_path and not Path(temporary_path).exists()


def test_simulation_uses_public_phase7_artifact_materialization(pack, monkeypatch):
    calls = {"review": 0, "evaluation": 0, "candidate": 0}
    original_review = Phase7ArtifactService.ensure_review_record
    original_evaluation = Phase7ArtifactService.materialize_evaluation_case
    original_candidate = Phase7ArtifactService.materialize_lesson_candidate

    def review_wrapper(self, *args, **kwargs):
        calls["review"] += 1
        return original_review(self, *args, **kwargs)

    def evaluation_wrapper(self, *args, **kwargs):
        calls["evaluation"] += 1
        return original_evaluation(self, *args, **kwargs)

    def candidate_wrapper(self, *args, **kwargs):
        calls["candidate"] += 1
        return original_candidate(self, *args, **kwargs)

    monkeypatch.setattr(Phase7ArtifactService, "ensure_review_record", review_wrapper)
    monkeypatch.setattr(Phase7ArtifactService, "materialize_evaluation_case", evaluation_wrapper)
    monkeypatch.setattr(Phase7ArtifactService, "materialize_lesson_candidate", candidate_wrapper)
    with SimulationStore() as store:
        with store.session() as db:
            ids = store.seed_case(db, pack.family("decisive_missing_fact").source)
            candidate = store.add_candidate(
                db,
                case=pack.family("decisive_missing_fact").source,
                ids=ids,
                lesson_text="Use a bounded prerequisite check before deciding.",
                failure_codes=["premature_conclusion"],
            )
            db.commit()
            assert candidate.artifact_version == 1
            assert candidate.canonical_payload_sha256
    assert calls == {"review": 1, "evaluation": 1, "candidate": 1}


def test_full_fixture_chain_is_infrastructure_only_and_cumulative(pack):
    with SimulationStore() as store:
        runner, compiler = fixture_providers(pack)
        report = Phase73BExperiment(
            pack,
            store=store,
            runner_provider=runner,
            compiler_provider=compiler,
        ).run()
        assert report.verdict == "INFRASTRUCTURE_VALIDATED"
        assert report.bank_rule_counts == [1, 2, 3, 4, 5]
        assert report.required_live_calls == 90
        assert report.total_provider_calls == 90
        assert report.source_failure_before_learning == 5
        assert len(report.improved_cases) == 10
        assert not set(report.improved_cases) & {
            family.source.input.task_id for family in pack.families
        }
        assert not report.memory_as_evidence_violations
        assert not report.source_case_leakage_violations
        assert not report.architecture_invariant_violations
        with store.session() as db:
            rules = ReasoningBankService().list_rules(db, bank_namespace="simulation")
            assert len(rules) == 5
            assert all(rule.approval_mode == "simulation_offline" for rule in rules)
            assert all(rule.provenance == "synthetic_test" for rule in rules)
        assert all(
            pair.invariant_prompt_fingerprint
            and pair.baseline_prompt_fingerprint != pair.memory_prompt_fingerprint
            for pair in report.paired_cases
        )
        assert report.negative_control_retrieval_rate >= 0


def test_write_artifacts_serializes_stage_metrics_before_writing(tmp_path):
    stage = StageExperimentMetrics(
        stage_index=1,
        bank_rule_count=1,
        bank_digest="sha256:" + "a" * 64,
        evaluated_families=["decisive_missing_fact"],
        evaluated_case_count=4,
        baseline_pass_rate=0.5,
        memory_pass_rate=0.75,
        pass_rate_delta=0.25,
        improved_cases=["holdout-decisive-201"],
        retrieval_count=2,
        relevant_retrieval_count=1,
        irrelevant_retrieval_count=1,
        retrieval_precision=0.5,
        no_memory_retrieved_count=0,
        no_memory_retrieved_rate=0.0,
        negative_control_retrieval_rate=0.0,
        provider_error_count=0,
    )
    diagnostic = ProviderFailureDiagnostic(
        failure_stage="http_response",
        exception_type="AuthenticationError",
        http_status_code=401,
        provider_error_code="authentication_error",
        safe_message="OpenAI HTTP response failed (401)",
        model="gpt-5.6-luna",
        request_role="runner",
        attempt_number=1,
    )
    report = ExperimentReport(
        run_id="serialization-regression",
        git_head="0afc737ceb66a7852d3b2d334857d8b02fd9266a",
        fixture_pack_version="v1",
        fixture_pack_sha256="b" * 64,
        mode="fixture",
        verdict="INFRASTRUCTURE_VALIDATED",
        compiler_model="fixture-compiler",
        runner_model="fixture-runner",
        max_live_calls=100,
        repeats=1,
        retriever_threshold=0.1,
        retriever_top_k=3,
        total_provider_calls=0,
        source_failure_before_learning=0,
        baseline_pass_rate=0.5,
        memory_pass_rate=0.75,
        pass_rate_delta=0.25,
        irrelevant_memory_rate=0.0,
        no_memory_retrieved_rate=0.0,
        negative_control_retrieval_rate=0.0,
        stage_metrics=[stage],
        provider_diagnostics=[diagnostic],
    )

    with pytest.raises(TypeError, match="unsupported JSON artifact value"):
        write_artifacts(report, tmp_path, rules=[object()])
    assert not (tmp_path / report.run_id).exists()

    output = write_artifacts(report, tmp_path)
    assert isinstance(json.loads((output / "manifest.json").read_text()), dict)
    assert isinstance(json.loads((output / "learned_rules.json").read_text()), list)
    assert isinstance(json.loads((output / "report.json").read_text()), dict)
    manifest = json.loads((output / "manifest.json").read_text())
    assert isinstance(manifest["stage_metrics"][0], dict)
    assert manifest["provider_diagnostics"][0]["http_status_code"] == 401
    for filename in ("retrievals.jsonl", "paired_runs.jsonl"):
        for line in (output / filename).read_text().splitlines():
            json.loads(line)


@pytest.mark.parametrize("pack_name", ["v1", "v2"])
def test_fixture_e2e_artifacts_are_reloadable(pack_name, tmp_path):
    pack = load_fixture_pack(
        default_fixture_pack_path() if pack_name == "v1" else fixture_pack_path(pack_name)
    )
    with SimulationStore() as store:
        runner, compiler = fixture_providers(pack)
        report = Phase73BExperiment(
            pack,
            store=store,
            runner_provider=runner,
            compiler_provider=compiler,
        ).run()
        with store.session() as db:
            rules = ReasoningBankService().list_rules(db, bank_namespace="simulation")
        output = write_artifacts(report, tmp_path / pack_name, rules=rules)

    for filename in ("manifest.json", "learned_rules.json", "report.json"):
        json.loads((output / filename).read_text(encoding="utf-8"))
    for filename in ("retrievals.jsonl", "paired_runs.jsonl"):
        records = [
            json.loads(line)
            for line in (output / filename).read_text(encoding="utf-8").splitlines()
            if line
        ]
        assert all(isinstance(record, dict) for record in records)
        if filename == "retrievals.jsonl":
            assert records == report.retrievals


def test_source_pass_produces_no_learning_signal(pack):
    case = pack.family("decisive_missing_fact").source
    case.input.fixture_forced_failure = False
    from app.schemas.phase7_3b import SyntheticCaseEvaluation

    passing = SyntheticCaseEvaluation(
        task_id=case.input.task_id,
        split="source",
        condition="baseline",
        overall="PASS",
    )
    assert SyntheticSupervisor().supervise(passing, task_id=case.input.task_id) is None


def test_memory_rule_as_evidence_is_a_deterministic_failure(pack):
    case = pack.family("decisive_missing_fact").held_out_positive[0]
    observation = SyntheticRunObservation(
        task_id=case.input.task_id,
        condition="memory",
        disposition="ask_missing_fact",
        requested_fact_keys=["sponsor_confirmation"],
        cited_evidence_ids=["rule-simulation-test"],
    )
    result = SyntheticEvaluator().evaluate(
        case, observation, retrieved_rule_keys=["rule-simulation-test"]
    )
    assert result.overall == "FAIL"
    assert (
        next(item for item in result.metrics if item.metric == "evidence_usage_valid").result
        == "FAIL"
    )


def test_provider_failure_is_not_scored(pack):
    case = pack.family("cross_reference_dependency").held_out_positive[0]
    observation = SyntheticRunObservation(
        task_id=case.input.task_id,
        condition="baseline",
        disposition="abstain",
        provider_status="provider_error",
    )
    result = SyntheticEvaluator().evaluate(case, observation, retrieved_rule_keys=[])
    assert result.overall == "NOT_SCORED"
    assert all(metric.result == "NOT_SCORED" for metric in result.metrics)


def test_fixture_provider_is_deterministic_and_has_no_network_hook(pack):
    runner, compiler = fixture_providers(pack)
    prompt, _ = build_runner_prompt(
        pack.case("holdout-cross-415").input.task_visible(), condition="baseline", guidance=None
    )
    first = runner.complete(role="runner", prompt=prompt, model="fixture")
    second = runner.complete(role="runner", prompt=prompt, model="fixture")
    assert first.payload == second.payload
    assert first.status == second.status == "ok"
    assert len(compiler.calls) == 0


def test_runner_and_retriever_are_blind_to_benchmark_metadata(pack):
    visible = pack.family("decisive_missing_fact").held_out_positive[0].input.task_visible()
    visible = visible.model_copy(
        update={"question": "Which fictional process step is required for this task?"}
    )
    prompt, _ = build_runner_prompt(visible, condition="baseline", guidance=None)
    for sentinel in ("FAMILY_SECRET_731B", "SPLIT_SECRET_731B", "TASK_SECRET_731B"):
        assert sentinel not in prompt
    for label in ("source", "holdout", "negative"):
        assert label not in prompt

    query = pack.family("decisive_missing_fact").held_out_positive[0].input.retrieval_query()
    query_dump = query.model_dump_json()
    assert "expected_disposition" not in query_dump
    assert "applicable_rule_families" not in query_dump
    assert all(secret not in query_dump for secret in ("FAMILY_SECRET_731B", "SPLIT_SECRET_731B"))
    with pytest.raises(ValueError):
        type(query)(**{**query.model_dump(), "oracle": "SPLIT_SECRET_731B"})


def _verdict_kwargs(**updates):
    values = dict(
        source_failures=1,
        compiler_calls=1,
        governed_rules=1,
        positive_improvements=["holdout-1"],
        baseline_pass_rate=0.2,
        memory_pass_rate=0.4,
        regressions=[],
        negative_regressions=[],
        memory_violations=[],
        leakage=[],
        architecture=[],
        all_pairs_completed=True,
        provider_errors=False,
        budget_exhausted=False,
        primary_metrics_computable=True,
    )
    values.update(updates)
    return values


def test_live_verdict_requires_source_learning_and_clean_complete_pairs():
    assert Phase73BExperiment._live_verdict(**_verdict_kwargs()) == "MECHANISM_SUPPORTED"
    assert Phase73BExperiment._live_verdict(**_verdict_kwargs(governed_rules=0)) == "INCONCLUSIVE"
    assert Phase73BExperiment._live_verdict(**_verdict_kwargs(source_failures=0)) == "INCONCLUSIVE"
    assert (
        Phase73BExperiment._live_verdict(**_verdict_kwargs(provider_errors=True))
        == "INFRASTRUCTURE_FAILURE"
    )
    assert (
        Phase73BExperiment._live_verdict(**_verdict_kwargs(regressions=["holdout-2"]))
        == "HARM_SIGNAL"
    )
    assert (
        Phase73BExperiment._live_verdict(**_verdict_kwargs(negative_regressions=["negative-2"]))
        == "HARM_SIGNAL"
    )


def test_live_preflight_is_90_and_refuses_before_provider_calls(pack):
    live_pack = load_fixture_pack(fixture_pack_path("v2"))
    runner = compiler = FixtureProvider(lambda *_: {})
    with SimulationStore() as store:
        experiment = Phase73BExperiment(
            live_pack,
            store=store,
            runner_provider=runner,
            compiler_provider=compiler,
            mode="live",
            max_live_calls=100,
            repeats=1,
        )
        assert experiment.preflight() == 90
        refused = Phase73BExperiment(
            live_pack,
            store=store,
            runner_provider=runner,
            compiler_provider=compiler,
            mode="live",
            max_live_calls=89,
            repeats=1,
        )
        with pytest.raises(Phase73BProviderError, match="required=90 configured=89"):
            refused.preflight()
    assert not runner.calls


def test_repeats_execute_and_are_reported(pack):
    with SimulationStore() as store:
        runner, compiler = fixture_providers(pack)
        report = Phase73BExperiment(
            pack,
            store=store,
            runner_provider=runner,
            compiler_provider=compiler,
            repeats=3,
        ).run()
    assert report.paired_cases
    assert all(pair.repeat_count_requested == 3 for pair in report.paired_cases)
    assert all(pair.repeat_count_completed == 3 for pair in report.paired_cases)
    assert all(len(pair.repeat_results) == 3 for pair in report.paired_cases)
    assert all(
        pair.baseline_pass_count + pair.baseline_fail_count + pair.baseline_not_scored_count == 3
        for pair in report.paired_cases
    )
    assert all(
        pair.memory_pass_count + pair.memory_fail_count + pair.memory_not_scored_count == 3
        for pair in report.paired_cases
    )


def test_supervisor_feedback_depends_on_failed_metrics_not_family():
    evaluation = SyntheticCaseEvaluation(
        task_id="source-one",
        split="source",
        condition="baseline",
        overall="FAIL",
        metrics=[
            MetricResult(
                metric="required_fact_requests_present",
                result="FAIL",
                failure_code="missing_required_fact_request",
            )
        ],
    )
    first = SyntheticSupervisor().supervise(evaluation, task_id="source-one")
    second = SyntheticSupervisor().supervise(
        evaluation.model_copy(update={"task_id": "source-two"}), task_id="source-two"
    )
    assert first and second
    assert first.failure_codes == second.failure_codes
    assert first.feedback == second.feedback
    assert "source-one" not in first.feedback
    assert "source-two" not in second.feedback


def test_required_claim_is_materially_scored(pack):
    case = pack.family("decisive_missing_fact").held_out_positive[0]
    case.oracle = case.oracle.model_copy(update={"required_claim_ids": ["claim-required"]})
    observation = SyntheticRunObservation(
        task_id=case.input.task_id,
        condition="baseline",
        disposition=case.oracle.expected_disposition,
        requested_fact_keys=case.oracle.required_missing_fact_keys,
    )
    result = SyntheticEvaluator().evaluate(case, observation, retrieved_rule_keys=[])
    assert result.overall == "FAIL"
    assert (
        next(item for item in result.metrics if item.metric == "required_claims_present").result
        == "FAIL"
    )


def test_source_evidence_long_span_is_detected():
    source = "one two three four five six seven eight nine ten eleven twelve"
    assert _contains_source_material("prefix " + source + " suffix", source)


def test_curator_rejects_compiler_source_evidence_residue(pack):
    case = pack.family("decisive_missing_fact").source
    copied = "one two three four five six seven eight nine ten eleven twelve"
    draft_data = dict(pack.family("decisive_missing_fact").compiler_proposals[0])
    draft_data["title"] = copied
    with SimulationStore() as store:
        with store.session() as db:
            ids = store.seed_case(db, case)
            db.flush()
            candidate = store.add_candidate(
                db,
                case=case,
                ids=ids,
                lesson_text="Use a bounded process check before concluding.",
                failure_codes=["premature_conclusion"],
            )
            db.flush()
            packet = build_source_compiler_packet(
                db, candidate_ids=[candidate.candidate_id], bank_namespace="simulation"
            )
            output = RuleCompilerOutput(
                output_id="output-malicious",
                packet_id=packet.packet_id,
                proposals=[RuleCompilerProposalDraft.model_validate(draft_data)],
            )
            artifacts = Phase73RuleCompilerService().create_proposals_from_output(
                db,
                source_candidate_ids=[candidate.candidate_id],
                compiler_output=output,
                namespace="simulation",
            )
            curator = SyntheticCurator()
            approved = curator.approve(
                db,
                manager=ReasoningBankManager(),
                proposal_artifacts=artifacts,
                source_materials=[copied],
            )
            db.commit()
            assert approved == []
            assert curator.decisions[-1].reason_code == "quality_gate_failed"
            assert ReasoningBankService().list_rules(db, bank_namespace="simulation") == []


def test_curator_rejects_compiler_candidate_lesson_residue(pack):
    case = pack.family("decisive_missing_fact").source
    lesson = "Distinctive reusable lesson: resolve the cobalt prerequisite before approval."
    draft_data = dict(pack.family("decisive_missing_fact").compiler_proposals[0])
    draft_data["title"] = lesson
    with SimulationStore() as store:
        with store.session() as db:
            ids = store.seed_case(db, case)
            candidate = store.add_candidate(
                db,
                case=case,
                ids=ids,
                lesson_text=lesson,
                failure_codes=["premature_conclusion"],
            )
            db.flush()
            packet = build_source_compiler_packet(
                db, candidate_ids=[candidate.candidate_id], bank_namespace="simulation"
            )
            output = RuleCompilerOutput(
                output_id="output-candidate-residue",
                packet_id=packet.packet_id,
                proposals=[RuleCompilerProposalDraft.model_validate(draft_data)],
            )
            artifacts = Phase73RuleCompilerService().create_proposals_from_output(
                db,
                source_candidate_ids=[candidate.candidate_id],
                compiler_output=output,
                namespace="simulation",
            )
            curator = SyntheticCurator()
            approved = curator.approve(
                db,
                manager=ReasoningBankManager(),
                proposal_artifacts=artifacts,
                source_materials=[lesson],
            )
            db.commit()
    assert approved == []
    assert curator.decisions[-1].reason_code == "quality_gate_failed"


def test_curator_rejects_short_distinctive_source_answer_residue(pack):
    case = pack.family("decisive_missing_fact").source
    draft_data = dict(pack.family("decisive_missing_fact").compiler_proposals[0])
    draft_data["title"] = "accepted"
    with SimulationStore() as store:
        with store.session() as db:
            ids = store.seed_case(db, case)
            candidate = store.add_candidate(
                db,
                case=case,
                ids=ids,
                lesson_text="Use a bounded prerequisite check before deciding.",
                failure_codes=["premature_conclusion"],
            )
            db.flush()
            packet = build_source_compiler_packet(
                db, candidate_ids=[candidate.candidate_id], bank_namespace="simulation"
            )
            output = RuleCompilerOutput(
                output_id="output-short-answer-residue",
                packet_id=packet.packet_id,
                proposals=[RuleCompilerProposalDraft.model_validate(draft_data)],
            )
            artifacts = Phase73RuleCompilerService().create_proposals_from_output(
                db,
                source_candidate_ids=[candidate.candidate_id],
                compiler_output=output,
                namespace="simulation",
            )
            curator = SyntheticCurator()
            approved = curator.approve(
                db,
                manager=ReasoningBankManager(),
                proposal_artifacts=artifacts,
                source_materials=[case.baseline_observation["final_answer"]],
            )
            db.commit()
    assert approved == []
    assert curator.decisions[-1].reason_code == "quality_gate_failed"


def test_compiler_adapter_rejects_scored_cases():
    with pytest.raises(ValueError, match="rejects scored evaluation inputs"):
        build_source_compiler_packet(
            None,
            candidate_ids=["candidate-source"],
            bank_namespace="simulation",
            evaluation_cases=[{"case_id": "holdout-secret"}],
        )


def test_v1_is_infrastructure_only_and_v2_is_efficacy_capable():
    v1 = load_fixture_pack(default_fixture_pack_path())
    v2 = load_fixture_pack(fixture_pack_path("v2"))
    assert v1.mode_policy == "infrastructure_only"
    assert v2.version == "v2"
    assert v2.mode_policy == "live_efficacy_pilot"
    assert v2.sha256 == load_fixture_pack(fixture_pack_path("v2")).sha256
    assert all(
        len(family.held_out_positive) == len(family.negative_controls) == 2
        for family in v2.families
    )


def test_v1_and_v2_have_distinct_canonical_content(pack):
    v2 = load_fixture_pack(fixture_pack_path("v2"))
    assert pack.sha256 != v2.sha256
    assert {case.input.question for case in pack.cases}.isdisjoint(
        {case.input.question for case in v2.cases}
    )


def test_empty_guidance_uses_fixture_baseline_path(pack):
    runner, _compiler = fixture_providers(pack)
    case = pack.family("decisive_missing_fact").held_out_positive[0]
    no_memory, _ = build_runner_prompt(case.input.task_visible(), condition="memory", guidance=None)
    empty = ReasoningGuidancePacket(
        packet_id="guidance-" + "0" * 64,
        bank_digest="sha256:" + "0" * 64,
        query_fingerprint="sha256:" + "1" * 64,
        rules=[],
    )
    empty_prompt, _ = build_runner_prompt(
        case.input.task_visible(), condition="memory", guidance=empty
    )
    first = runner.complete(role="runner", prompt=no_memory, model="fixture")
    second = runner.complete(role="runner", prompt=empty_prompt, model="fixture")
    assert first.payload == second.payload


def test_stage_metrics_are_learned_family_cumulative(pack):
    with SimulationStore() as store:
        runner, compiler = fixture_providers(pack)
        report = Phase73BExperiment(
            pack, store=store, runner_provider=runner, compiler_provider=compiler
        ).run()
    assert [item.evaluated_case_count for item in report.stage_metrics] == [4, 8, 12, 16, 20]
    assert report.retrieval_precision is not None


def test_stage_metrics_include_cumulative_diagnostics_and_regressions(pack):
    with SimulationStore() as store:
        runner, compiler = fixture_providers(pack)
        experiment = Phase73BExperiment(
            pack, store=store, runner_provider=runner, compiler_provider=compiler
        )
        pair = PairedCaseResult(
            task_id="holdout-decisive-204",
            split="held_out_positive",
            baseline=SyntheticCaseEvaluation(
                task_id="holdout-decisive-204",
                split="held_out_positive",
                condition="baseline",
                overall="PASS",
            ),
            memory=SyntheticCaseEvaluation(
                task_id="holdout-decisive-204",
                split="held_out_positive",
                condition="memory",
                overall="FAIL",
            ),
            baseline_prompt_fingerprint="baseline",
            memory_prompt_fingerprint="memory",
            invariant_prompt_fingerprint="invariant",
        )
        experiment._memory_violations.append("holdout-decisive-204")
        metrics = experiment._stage_metrics(
            stage=4,
            family="temporal_version_applicability",
            learned_families=["decisive_missing_fact", "cross_reference_dependency"],
            pairs=[pair],
            rule_count=2,
            bank_digest="sha256:" + "a" * 64,
        )
    assert metrics.stage_index == 4
    assert metrics.bank_rule_count == 2
    assert metrics.bank_digest == "sha256:" + "a" * 64
    assert metrics.evaluated_case_count == 1
    assert metrics.regressed_cases == ["holdout-decisive-204"]
    assert metrics.memory_as_evidence_violations == ["holdout-decisive-204"]
    assert metrics.negative_control_regressions == []
    assert metrics.retrieval_precision is None


def test_prior_family_regression_is_visible_in_later_stage(pack):
    with SimulationStore() as store:
        runner, compiler = fixture_providers(pack)
        experiment = Phase73BExperiment(
            pack, store=store, runner_provider=runner, compiler_provider=compiler
        )
        pair = PairedCaseResult(
            task_id="negative-decisive-310",
            split="negative_control",
            baseline=SyntheticCaseEvaluation(
                task_id="negative-decisive-310",
                split="negative_control",
                condition="baseline",
                overall="PASS",
            ),
            memory=SyntheticCaseEvaluation(
                task_id="negative-decisive-310",
                split="negative_control",
                condition="memory",
                overall="FAIL",
            ),
            baseline_prompt_fingerprint="baseline",
            memory_prompt_fingerprint="memory",
            invariant_prompt_fingerprint="invariant",
        )
        metrics = experiment._stage_metrics(
            stage=4,
            family="temporal_version_applicability",
            learned_families=["decisive_missing_fact", "temporal_version_applicability"],
            pairs=[pair],
            rule_count=4,
            bank_digest="sha256:" + "b" * 64,
        )
    assert metrics.negative_control_regressions == ["negative-decisive-310"]


def test_no_retrieval_precision_is_not_scored(pack):
    with SimulationStore() as store:
        runner = compiler = FixtureProvider(lambda *_: {})
        experiment = Phase73BExperiment(
            pack, store=store, runner_provider=runner, compiler_provider=compiler
        )
        report = experiment._build_report(
            run_id="phase7_3b-test",
            paired=[],
            rule_count=0,
            bank_counts=[],
            cumulative_regressions={},
            stage_metrics=[],
        )
    assert report.retrieval_precision is None


def test_serving_modules_do_not_import_phase7_3b():
    root = Path(__file__).parents[1] / "app"
    serving_files = [
        root / "services" / "query_service.py",
        root / "services" / "agent_runtime_service.py",
        root / "services" / "premium_direct_answer_service.py",
        root / "services" / "request_evidence_registry.py",
        root / "services" / "compact_checker_service.py",
        root / "services" / "terminal_submission_policy.py",
    ]
    for path in serving_files:
        assert "phase7_3b" not in path.read_text(encoding="utf-8")
