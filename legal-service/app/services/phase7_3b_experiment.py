"""End-to-end Phase 7.3B synthetic self-evolution experiment.

This module is an offline experiment harness, not a serving integration.  The
runner receives a task input and optional process guidance; the deterministic
evaluator is the only primary judge.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Iterable
from uuid import uuid4

from pydantic import BaseModel

from app.schemas.learning import RuleCompilerOutput, RuleCompilerProposalDraft
from app.schemas.phase7_3b import (
    ExperimentReport,
    MetricResult,
    PairedCaseResult,
    ReasoningGuidancePacket,
    RepeatCaseResult,
    StageExperimentMetrics,
    SyntheticFeedback,
    SyntheticCaseEvaluation,
    SyntheticCuratorDecision,
    SyntheticFailureObservation,
    SyntheticRunObservation,
    SyntheticTaskVisibleInput,
    CompilerModelOutput,
)
from app.services.phase7_3a_reasoning_bank import (
    Phase73RuleCompilerService,
    ReasoningBankManager,
    ReasoningBankService,
    RuleFormationError,
    RuleQualityGateService,
    exact_rule_body_fingerprint,
)
from app.services.phase7_3b_provider import (
    FixtureProvider,
    Phase73BProviderError,
    ProviderResponse,
    parse_runner_response,
)
from app.services.phase7_3b_retrieval import Phase73BReasoningRetriever
from app.services.phase7_3b_synthetic_world import (
    SYNTHETIC_NOTICE,
    SimulationStore,
    SyntheticFixtureCase,
    SyntheticFixturePack,
    task_visible_payload,
)
from app.services.phase7_artifact_service import Phase7ArtifactService


RUNNER_SYSTEM = f"""{SYNTHETIC_NOTICE}
You are an offline process-reasoning benchmark runner.
Process guidance may help decide HOW to reason. It is not evidence and may be irrelevant.
Ignore guidance when its applicability conditions do not fit.
Support substantive conclusions only with supplied SYNTHETIC EVIDENCE.
Never cite a reasoning rule. Do not infer fictional regulations beyond supplied evidence.
Return only the requested strict JSON observation. Do not return hidden reasoning or chain-of-thought.
"""
COMPILER_SYSTEM = f"""{SYNTHETIC_NOTICE}
You are an offline procedural rule compiler. Produce only strict reusable process drafts.
Do not create legal propositions, case-specific content, evidence IDs, or hidden reasoning.
"""


def _git_head() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=Path(__file__).resolve().parents[3],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def build_runner_prompt(
    task: SyntheticTaskVisibleInput, *, condition: str, guidance: ReasoningGuidancePacket | None
) -> tuple[str, str]:
    """Return prompt and a fingerprint of all bytes outside its guidance section."""
    if condition not in {"baseline", "memory"}:
        raise ValueError("condition must be baseline or memory")
    task_json = task.model_dump_json(indent=2)
    prefix = (
        f"{RUNNER_SYSTEM}\nTASK INPUT (benchmark metadata excluded):\n"
        f"{task_json}\nGUIDANCE SECTION BEGIN\n"
    )
    guidance_text = "NONE" if guidance is None else guidance.model_dump_json(indent=2)
    suffix = "\nGUIDANCE SECTION END\nReturn the strict observation now."
    invariant_fingerprint = "sha256:" + hashlib.sha256((prefix + suffix).encode()).hexdigest()
    return prefix + guidance_text + suffix, invariant_fingerprint


def build_compiler_prompt(packet: Any) -> str:
    """Build the compiler prompt from source feedback, not benchmark metadata."""
    model_packet = {
        "candidates": [
            {
                "lesson_text": item.lesson_text,
                "scope_applicability": dict(item.scope_applicability),
            }
            for item in packet.candidates
        ],
        "failure_feedback": [
            "Use the reusable process failure feedback encoded in each candidate lesson."
        ],
    }
    return (
        f"{COMPILER_SYSTEM}\n"
        "The following is the only authorized source failure-feedback context. Use it "
        "for reusable process strategy only; do not infer hidden evaluation metadata.\n"
        f"Allowlisted packet:\n{json.dumps(model_packet, indent=2, sort_keys=True)}"
    )


def build_source_compiler_packet(
    db,
    *,
    candidate_ids: list[str],
    bank_namespace: str,
    evaluation_cases: Iterable[dict[str, Any]] = (),
    contrast_cases: Iterable[dict[str, Any]] = (),
    negative_controls: Iterable[dict[str, Any]] = (),
) -> Any:
    """7.3B adapter: compiler input is source candidates only.

    The frozen 7.3A service retains its broader offline packet contract for
    other control-plane callers.  This adapter makes the 7.3B prohibition
    executable instead of relying on caller discipline.
    """
    if any((evaluation_cases, contrast_cases, negative_controls)):
        raise ValueError("Phase 7.3B compiler adapter rejects scored evaluation inputs")
    return Phase73RuleCompilerService().build_packet(
        db, candidate_ids=candidate_ids, bank_namespace=bank_namespace
    )


def _contains_source_material(text: str, source: str) -> bool:
    """Deterministic source-residue check matching the 7.3A normalization rules."""
    import unicodedata

    def normalized(value: str) -> str:
        return " ".join(unicodedata.normalize("NFKC", value).casefold().split())

    source_normal = normalized(source)
    text_normal = normalized(text)
    if not source_normal:
        return False
    # Short synthetic fact values such as ``rule K`` are intentionally not
    # treated as source residue; exact IDs and long source spans are.
    if len(source_normal) >= 8 or re.search(
        r"\b(?:source|case|review|trace|experience|candidate|evidence)[_-][a-z0-9]",
        source_normal,
    ):
        if re.search(rf"(?<!\w){re.escape(source_normal)}(?!\w)", text_normal):
            return True
    source_words = re.findall(r"[\w]+", source_normal, re.UNICODE)
    text_words = re.findall(r"[\w]+", text_normal, re.UNICODE)
    if len(source_words) >= 12 and len(text_words) >= 12:
        source_ngrams = {
            tuple(source_words[index : index + 12]) for index in range(len(source_words) - 11)
        }
        if any(
            tuple(text_words[index : index + 12]) in source_ngrams
            for index in range(len(text_words) - 11)
        ):
            return True
    source_cjk = "".join(re.findall(r"[\u3400-\u9fff]", source_normal))
    text_cjk = "".join(re.findall(r"[\u3400-\u9fff]", text_normal))
    return len(source_cjk) >= 12 and source_cjk in text_cjk


def _contains_metadata(text: str, value: str) -> bool:
    import unicodedata

    needle = " ".join(unicodedata.normalize("NFKC", value).casefold().split())
    haystack = " ".join(unicodedata.normalize("NFKC", text).casefold().split())
    if not needle:
        return False
    if re.fullmatch(r"[a-z_]+", needle):
        return re.search(rf"(?<![\w]){re.escape(needle)}(?![\w])", haystack) is not None
    return needle in haystack


class SyntheticSupervisor:
    """Deterministic substitute for future lawyer feedback in this experiment."""

    _FEEDBACK = {
        "required_fact_requests_present": (
            "missing_required_fact_request",
            "Do not conclude while a decisive required fact remains unrequested.",
        ),
        "disposition_correct": (
            "premature_conclusion",
            "Separate a general process explanation from a personal conclusion until the required predicates are established.",
        ),
        "required_actions_present": (
            "missing_required_research_action",
            "Complete each required bounded research action before a substantive conclusion.",
        ),
        "evidence_usage_valid": (
            "unsupported_claim",
            "Support substantive claims only with supplied task evidence, never with process guidance.",
        ),
        "required_claims_present": (
            "missing_required_claim",
            "Ensure every required process claim is addressed without inventing unsupported content.",
        ),
        "architecture_invariants": (
            "architecture_invariant_violation",
            "Keep navigation and process guidance separate from substantive evidence.",
        ),
        "navigation_not_used_as_evidence": (
            "navigation_used_as_evidence",
            "Use navigation to find research targets, not as substantive supporting evidence.",
        ),
        "prohibited_actions_absent": (
            "cross_reference_not_followed",
            "Follow each material dependency before declaring a bounded research task complete.",
        ),
        "required_evidence_present": (
            "required_evidence_missing",
            "Verify that every required task evidence item is available before relying on the result.",
        ),
        "prohibited_evidence_absent": (
            "prohibited_evidence_used",
            "Do not rely on prohibited or inapplicable task evidence.",
        ),
    }

    def supervise(
        self,
        evaluation: SyntheticCaseEvaluation,
        *,
        task_id: str,
        fixture_mode: bool = False,
    ) -> SyntheticFailureObservation | None:
        if evaluation.overall != "FAIL" or evaluation.provider_status != "ok":
            return None
        failed = [item for item in evaluation.metrics if item.result == "FAIL"]
        codes = [self._FEEDBACK[item.metric][0] for item in failed if item.metric in self._FEEDBACK]
        if not codes:
            codes = ["procedural_failure"]
        feedback = (
            " ".join(
                self._FEEDBACK[item.metric][1] for item in failed if item.metric in self._FEEDBACK
            )
            or "Apply a reusable process strategy before a substantive conclusion."
        )
        bounded = SyntheticFeedback(failure_codes=sorted(set(codes)), feedback=feedback)
        return SyntheticFailureObservation(
            task_id=task_id,
            failure_codes=bounded.failure_codes,
            feedback=bounded.feedback,
            fixture_forced_failure=fixture_mode,
        )

    @staticmethod
    def candidate_text(failure_codes: list[str]) -> str:
        return " ".join(
            {
                "missing_required_fact_request": "Separate general process guidance from a personal conclusion until each decisive fact is established.",
                "premature_conclusion": "Do not make a personal conclusion before establishing the material predicates.",
                "missing_required_research_action": "Complete every required bounded research action before concluding.",
                "unsupported_claim": "Use only supplied task evidence for substantive claims; process guidance is not evidence.",
                "missing_required_claim": "Address each required process claim without inventing unsupported content.",
                "navigation_used_as_evidence": "Use navigation to find research targets, but require actual supporting evidence.",
                "cross_reference_not_followed": "Follow each material dependency before declaring research complete.",
                "required_evidence_missing": "Verify required task evidence before relying on a substantive result.",
                "prohibited_evidence_used": "Do not rely on prohibited or inapplicable task evidence.",
                "architecture_invariant_violation": "Keep process guidance and navigation separate from substantive evidence.",
                "procedural_failure": "Use a bounded verification step before a substantive conclusion.",
            }.get(code, "Use a bounded verification step before a substantive conclusion.")
            for code in failure_codes
        )


class SyntheticCurator:
    """Fixture-directed simulated governance; it never claims lawyer authority."""

    def __init__(self):
        self.quality_gate = RuleQualityGateService()
        self.decisions: list[SyntheticCuratorDecision] = []

    def approve(
        self,
        db,
        *,
        manager: ReasoningBankManager,
        proposal_artifacts: list[Any],
        source_materials: Iterable[str] = (),
        forbidden_metadata: Iterable[str] = (),
    ) -> list[Any]:
        approved = []
        source_materials = list(source_materials)
        forbidden_metadata = [item for item in forbidden_metadata if item]
        for artifact in proposal_artifacts:
            proposal = manager._proposal(db, artifact.artifact_payload.get("proposal_id", ""))
            report = self.quality_gate.evaluate(proposal, source_materials=source_materials)
            proposal_text = proposal.model_dump_json()
            if any(_contains_source_material(proposal_text, item) for item in source_materials):
                report = report.model_copy(
                    update={
                        "result": "FAIL",
                        "reason_codes": sorted(set([*report.reason_codes, "copied_source_span"])),
                    }
                )
            if any(_contains_metadata(proposal_text, item) for item in forbidden_metadata):
                report = report.model_copy(
                    update={
                        "result": "FAIL",
                        "reason_codes": sorted(
                            set([*report.reason_codes, "benchmark_metadata_residue"])
                        ),
                    }
                )
            if report.result != "PASS":
                manager.reject(
                    db, proposal, decided_by="synthetic-curator", reason_code="quality_gate_failed"
                )
                self.decisions.append(
                    SyntheticCuratorDecision(
                        proposal_id=proposal.proposal_id,
                        action="reject",
                        reason_code="quality_gate_failed",
                    )
                )
                continue
            if proposal.bank_namespace != "simulation" or proposal.provenance != "synthetic_test":
                manager.reject(
                    db,
                    proposal,
                    decided_by="synthetic-curator",
                    reason_code="wrong_simulation_provenance",
                )
                self.decisions.append(
                    SyntheticCuratorDecision(
                        proposal_id=proposal.proposal_id,
                        action="reject",
                        reason_code="wrong_simulation_provenance",
                    )
                )
                continue
            if proposal.origin not in {
                "manual_fixture",
                "synthetic_test",
            } or proposal.rule_type not in {
                "research_strategy",
                "evidence_strategy",
                "fact_elicitation",
                "reasoning_strategy",
                "failure_avoidance",
            }:
                manager.reject(
                    db,
                    proposal,
                    decided_by="synthetic-curator",
                    reason_code="wrong_procedural_family",
                )
                self.decisions.append(
                    SyntheticCuratorDecision(
                        proposal_id=proposal.proposal_id,
                        action="reject",
                        reason_code="wrong_procedural_family",
                    )
                )
                continue
            try:
                existing = next(
                    (
                        rule
                        for rule in manager.read.list_rules(db, bank_namespace="simulation")
                        if exact_rule_body_fingerprint(rule)
                        == exact_rule_body_fingerprint(proposal)
                    ),
                    None,
                )
                if existing is not None:
                    approved.append(
                        manager.merge_support(
                            db,
                            proposal,
                            target_rule_key=existing.rule_key,
                            decided_by="synthetic-curator",
                            case_erasure_confirmed=True,
                            procedural_only_confirmed=True,
                            decision_reason_code="exact_normalized_duplicate",
                        )
                    )
                    self.decisions.append(
                        SyntheticCuratorDecision(
                            proposal_id=proposal.proposal_id,
                            action="merge_support",
                            reason_code="exact_normalized_duplicate",
                        )
                    )
                else:
                    approved.append(
                        manager.approve_new(
                            db,
                            proposal,
                            decided_by="synthetic-curator",
                            case_erasure_confirmed=True,
                            procedural_only_confirmed=True,
                            decision_reason_code="clean_new_procedural_strategy",
                        )
                    )
                    self.decisions.append(
                        SyntheticCuratorDecision(
                            proposal_id=proposal.proposal_id,
                            action="approve_new",
                            reason_code="clean_new_procedural_strategy",
                        )
                    )
            except RuleFormationError:
                manager.reject(
                    db,
                    proposal,
                    decided_by="synthetic-curator",
                    reason_code="duplicate_or_capacity",
                )
                self.decisions.append(
                    SyntheticCuratorDecision(
                        proposal_id=proposal.proposal_id,
                        action="reject",
                        reason_code="duplicate_or_capacity",
                    )
                )
        return approved


class SyntheticEvaluator:
    """Exact, non-LLM evaluator for the primary metrics."""

    def evaluate(
        self,
        case: SyntheticFixtureCase,
        observation: SyntheticRunObservation,
        *,
        retrieved_rule_keys: list[str],
    ) -> SyntheticCaseEvaluation:
        oracle = case.oracle
        if observation.provider_status != "ok":
            return SyntheticCaseEvaluation(
                task_id=case.input.task_id,
                split=case.input.split,
                condition=observation.condition,
                overall="NOT_SCORED",
                provider_status=observation.provider_status,
                retrieved_rule_keys=retrieved_rule_keys,
                metrics=[
                    MetricResult(
                        metric="provider_status",
                        result="NOT_SCORED",
                        detail=observation.provider_status,
                    )
                ],
            )
        valid_evidence = {item.evidence_id for item in case.input.synthetic_evidence}
        cited = set(observation.cited_evidence_ids)
        supported = {
            evidence_id
            for claim in observation.claims
            for evidence_id in claim.supporting_evidence_ids
        }
        rule_keys = set(retrieved_rule_keys)
        invalid_evidence = (cited | supported) - valid_evidence
        observed_claim_ids = {claim.claim_id for claim in observation.claims}

        def metric(name: str, passed: bool, failure_code: str, detail: str | None = None):
            return MetricResult(
                metric=name,
                result="PASS" if passed else "FAIL",
                failure_code=None if passed else failure_code,
                detail=detail,
            )

        metrics = [
            metric(
                "disposition_correct",
                observation.disposition == oracle.expected_disposition,
                "premature_conclusion",
            ),
            metric(
                "required_actions_present",
                set(oracle.required_research_actions) <= set(observation.research_actions),
                "missing_required_research_action",
            ),
            metric(
                "prohibited_actions_absent",
                not (set(oracle.prohibited_research_actions) & set(observation.research_actions)),
                "cross_reference_not_followed",
            ),
            metric(
                "required_fact_requests_present",
                set(oracle.required_missing_fact_keys) <= set(observation.requested_fact_keys),
                "missing_required_fact_request",
            ),
            metric(
                "required_claims_present",
                set(oracle.required_claim_ids) <= observed_claim_ids,
                "missing_required_claim",
            ),
            metric(
                "prohibited_claims_absent",
                not (set(oracle.prohibited_claim_ids) & observed_claim_ids),
                "unsupported_claim",
            ),
            metric(
                "evidence_usage_valid",
                not invalid_evidence and not (cited & rule_keys) and not (supported & rule_keys),
                "unsupported_claim",
            ),
            metric(
                "required_evidence_present",
                set(oracle.required_evidence_ids) <= cited,
                "required_evidence_missing",
            ),
            metric(
                "prohibited_evidence_absent",
                not (set(oracle.prohibited_evidence_ids) & cited),
                "prohibited_evidence_used",
            ),
            metric(
                "navigation_not_used_as_evidence",
                not invalid_evidence and not (cited & rule_keys),
                "navigation_used_as_evidence",
            ),
            metric(
                "architecture_invariants",
                not observation.architecture_violation_flags,
                "architecture_invariant_violation",
            ),
        ]
        # The fixture oracle declares which behavioral fields are material.  The
        # required-claim contract is always added when present so it cannot be
        # silently forgotten by a hand-authored scoring list.
        criteria = set(oracle.scoring_criteria) or {item.metric for item in metrics}
        if oracle.required_claim_ids:
            criteria.add("required_claims_present")
        scored = [item for item in metrics if item.metric in criteria]
        overall = "PASS" if scored and all(item.result == "PASS" for item in scored) else "FAIL"
        return SyntheticCaseEvaluation(
            task_id=case.input.task_id,
            split=case.input.split,
            condition=observation.condition,
            overall=overall,
            provider_status="ok",
            retrieved_rule_keys=retrieved_rule_keys,
            metrics=metrics,
        )


class Phase73BExperiment:
    """Orchestrate one isolated fixture or explicitly enabled live run."""

    def __init__(
        self,
        pack: SyntheticFixturePack,
        *,
        store: SimulationStore,
        compiler_provider: Any,
        runner_provider: Any,
        mode: str = "fixture",
        compiler_model: str = "fixture-compiler",
        runner_model: str = "fixture-runner",
        max_live_calls: int = 40,
        repeats: int = 1,
        relevance_threshold: float = 0.10,
        top_k: int = 3,
    ):
        if mode not in {"fixture", "live"}:
            raise ValueError("mode must be fixture or live")
        if not 1 <= repeats <= 3:
            raise ValueError("repeats must be between 1 and 3")
        if not 0 <= max_live_calls <= 100:
            raise ValueError("max_live_calls must be between 0 and 100")
        if mode == "live" and pack.mode_policy != "live_efficacy_pilot":
            raise ValueError("infrastructure-only fixture packs cannot run live")
        self.pack = pack
        self.store = store
        self.compiler_provider = compiler_provider
        self.runner_provider = runner_provider
        self.mode = mode
        self.compiler_model = compiler_model
        self.runner_model = runner_model
        self.max_live_calls = max_live_calls
        self.repeats = repeats
        self.retriever = Phase73BReasoningRetriever(
            relevance_threshold=relevance_threshold, top_k=top_k
        )
        self.evaluator = SyntheticEvaluator()
        self.supervisor = SyntheticSupervisor()
        self.curator = SyntheticCurator()
        self._provider_statuses: list[str] = []
        self._provider_diagnostics = []
        self._infra_errors: list[str] = []
        self._source_failures = 0
        self._no_learning_signal: list[str] = []
        self._retrievals: list[dict[str, Any]] = []
        self._leakage: list[str] = []
        self._memory_violations: list[str] = []
        self._architecture_violations: list[str] = []
        self._baseline_cache: dict[
            tuple[str, str, int], tuple[SyntheticRunObservation, str, str]
        ] = {}
        self._source_materials: dict[str, list[str]] = {}
        self._source_evaluations: dict[str, SyntheticCaseEvaluation] = {}
        self._source_feedback: dict[str, SyntheticFeedback] = {}
        self._source_compiler_calls = 0
        self._budget_exhausted = False
        self._pre_stage_provider_error_count = 0
        self._required_live_calls = self.required_live_calls()

    def required_live_calls(self) -> int:
        source_count = len(self.pack.families)
        evaluation_count = sum(
            len(family.held_out_positive) + len(family.negative_controls)
            for family in self.pack.families
        )
        cumulative_memory = sum(
            (index + 1) * (len(family.held_out_positive) + len(family.negative_controls))
            for index, family in enumerate(self.pack.families)
        )
        return self.repeats * (source_count + evaluation_count + cumulative_memory) + source_count

    def preflight(self) -> int:
        if self.mode == "live" and self._required_live_calls > self.max_live_calls:
            raise Phase73BProviderError(
                "insufficient_live_call_budget: "
                f"required={self._required_live_calls} configured={self.max_live_calls}"
            )
        return self._required_live_calls

    def _call(self, provider: Any, *, role: str, prompt: str, model: str) -> ProviderResponse:
        try:
            response = provider.complete(role=role, prompt=prompt, model=model)
        except Exception as exc:
            if "max-live-calls" in str(exc):
                self._budget_exhausted = True
            raise
        self._provider_statuses.append(response.status)
        if response.diagnostic is not None:
            self._provider_diagnostics.append(response.diagnostic)
        if response.status != "ok":
            self._infra_errors.append(f"{role}:{response.status}")
        return response

    @staticmethod
    def _visible_fingerprint(task: SyntheticTaskVisibleInput) -> str:
        return hashlib.sha256(
            Phase7ArtifactService.canonical_json_bytes(task.model_dump(mode="json"))
        ).hexdigest()

    def _run_condition(
        self,
        case: SyntheticFixtureCase,
        *,
        condition: str,
        guidance: ReasoningGuidancePacket | None,
        repeat_index: int,
        use_cache: bool = False,
    ) -> tuple[SyntheticRunObservation, str, str]:
        task = task_visible_payload(case)
        cache_key = (self._visible_fingerprint(task), self.runner_model, repeat_index)
        if condition == "baseline" and use_cache and cache_key in self._baseline_cache:
            return self._baseline_cache[cache_key]
        prompt, invariant = build_runner_prompt(task, condition=condition, guidance=guidance)
        response = self._call(
            self.runner_provider, role="runner", prompt=prompt, model=self.runner_model
        )
        observation = parse_runner_response(
            response, task_id=case.input.task_id, condition=condition
        )
        result = (observation, "sha256:" + hashlib.sha256(prompt.encode()).hexdigest(), invariant)
        if condition == "baseline" and use_cache:
            self._baseline_cache[cache_key] = result
        return result

    def _source_materials_for(
        self, source: SyntheticFixtureCase, feedback: SyntheticFeedback | None = None
    ) -> list[str]:
        values = [source.input.question]
        values.extend(f"{key} {value}" for key, value in source.input.compact_facts.items())
        values.extend(item.text for item in source.input.synthetic_evidence)
        baseline = source.baseline_observation or {}
        if isinstance(baseline, dict):
            values.append(str(baseline.get("final_answer", "")))
        if feedback is not None:
            values.append(feedback.feedback)
        return [value for value in values if value]

    def _source_baselines(self, db, case: SyntheticFixtureCase) -> SyntheticCaseEvaluation:
        evaluations = []
        for repeat_index in range(self.repeats):
            observation, _fp, _invariant = self._run_condition(
                case, condition="baseline", guidance=None, repeat_index=repeat_index, use_cache=True
            )
            evaluations.append(self.evaluator.evaluate(case, observation, retrieved_rule_keys=[]))
        result = next((item for item in evaluations if item.overall == "FAIL"), evaluations[0])
        if any(item.overall == "NOT_SCORED" for item in evaluations):
            self._infra_errors.append(f"source_not_scored:{case.input.task_id}")
        elif result.overall == "FAIL":
            self._source_failures += 1
        else:
            self._no_learning_signal.append(case.input.task_id)
        self._source_evaluations[case.input.task_id] = result
        feedback = self.supervisor.supervise(
            result, task_id=case.input.task_id, fixture_mode=self.mode == "fixture"
        )
        if feedback is not None:
            self._source_feedback[case.input.task_id] = SyntheticFeedback(
                failure_codes=feedback.failure_codes, feedback=feedback.feedback
            )
        self._source_materials[case.input.family] = self._source_materials_for(
            case, self._source_feedback.get(case.input.task_id)
        )
        return result

    def _learn_from_source(
        self,
        db,
        case: SyntheticFixtureCase,
        source_eval: SyntheticCaseEvaluation,
        ids: dict[str, str],
        manager: ReasoningBankManager,
    ) -> list[Any]:
        failure = self.supervisor.supervise(
            source_eval, task_id=case.input.task_id, fixture_mode=self.mode == "fixture"
        )
        if failure is None:
            return []
        candidate = self.store.add_candidate(
            db,
            case=case,
            ids=ids,
            lesson_text=self.supervisor.candidate_text(failure.failure_codes),
            failure_codes=failure.failure_codes,
        )
        self._source_materials[case.input.family] = [
            *self._source_materials.get(case.input.family, []),
            candidate.lesson_text,
        ]
        db.flush()
        packet = build_source_compiler_packet(
            db, candidate_ids=[candidate.candidate_id], bank_namespace="simulation"
        )
        response = self._call(
            self.compiler_provider,
            role="compiler",
            prompt=build_compiler_prompt(packet),
            model=self.compiler_model,
        )
        self._source_compiler_calls += 1
        if response.status != "ok" or response.payload is None:
            return []
        try:
            if self.mode == "live":
                model_output = CompilerModelOutput.model_validate(response.payload)
                # These two fields are control-plane confirmations consumed by
                # the existing simulation curator, not compiler decisions.
                drafts = [
                    RuleCompilerProposalDraft.model_validate(
                        {
                            **item.model_dump(mode="json"),
                            "case_erasure_confirmation": True,
                            "procedural_only_confirmation": True,
                        }
                    )
                    for item in model_output.proposals
                ]
            else:
                drafts = [
                    RuleCompilerProposalDraft.model_validate(item)
                    for item in response.payload.get("proposals", [])
                ]
            compiler_output = RuleCompilerOutput(
                output_id="output-"
                + hashlib.sha256(
                    Phase7ArtifactService.canonical_json_bytes(response.payload)
                ).hexdigest()[:40],
                packet_id=packet.packet_id,
                proposals=drafts,
            )
            artifacts = Phase73RuleCompilerService().create_proposals_from_output(
                db,
                source_candidate_ids=[candidate.candidate_id],
                compiler_output=compiler_output,
                namespace="simulation",
            )
        except Exception:
            self._provider_statuses.append("invalid_structured_output")
            self._infra_errors.append("compiler:invalid_structured_output")
            return []
        approved = self.curator.approve(
            db,
            manager=manager,
            proposal_artifacts=artifacts,
            source_materials=self._source_materials.get(case.input.family, []),
            forbidden_metadata=[
                case.input.family,
                case.input.split,
                case.input.task_id,
            ],
        )
        db.commit()
        return approved

    def _baseline_evaluations(
        self, cases: list[SyntheticFixtureCase]
    ) -> dict[str, list[SyntheticCaseEvaluation]]:
        results = {}
        for case in cases:
            values = []
            for repeat_index in range(self.repeats):
                observation, _fp, _invariant = self._run_condition(
                    case,
                    condition="baseline",
                    guidance=None,
                    repeat_index=repeat_index,
                    use_cache=True,
                )
                values.append(self.evaluator.evaluate(case, observation, retrieved_rule_keys=[]))
            results[case.input.task_id] = values
        return results

    def _memory_pair(
        self, db, case: SyntheticFixtureCase, baseline_values: list[SyntheticCaseEvaluation]
    ) -> PairedCaseResult:
        state = ReasoningBankService().state(db, bank_namespace="simulation")
        rules = ReasoningBankService().list_rules(db, bank_namespace="simulation")
        retrieval = self.retriever.retrieve(
            case.input.retrieval_query(), rules=rules, bank_digest=state.bank_digest
        )
        guidance_dump = retrieval.guidance.model_dump_json()
        source = self.pack.family(case.input.family).source
        source_materials = self._source_materials.get(
            case.input.family, self._source_materials_for(source)
        )
        metadata_residue = [
            source.input.family,
            source.input.task_id,
            "held_out_positive",
            "negative_control",
        ]
        if any(_contains_source_material(guidance_dump, item) for item in source_materials) or any(
            _contains_metadata(guidance_dump, item) for item in metadata_residue
        ):
            self._leakage.append(case.input.task_id)
            retrieval = retrieval.model_copy(
                update={
                    "selected_rule_keys": [],
                    "guidance": retrieval.guidance.model_copy(update={"rules": []}),
                }
            )
        self._retrievals.append(retrieval.model_dump(mode="json"))
        repeats = []
        for repeat_index in range(self.repeats):
            memory, memory_fp, memory_invariant = self._run_condition(
                case,
                condition="memory",
                guidance=retrieval.guidance,
                repeat_index=repeat_index,
            )
            baseline, baseline_fp, invariant = self._run_condition(
                case,
                condition="baseline",
                guidance=None,
                repeat_index=repeat_index,
                use_cache=True,
            )
            if invariant != memory_invariant:
                self._architecture_violations.append(f"prompt_fingerprint:{case.input.task_id}")
            if any(
                item in retrieval.selected_rule_keys
                for item in (
                    *memory.cited_evidence_ids,
                    *(e for claim in memory.claims for e in claim.supporting_evidence_ids),
                )
            ):
                self._memory_violations.append(case.input.task_id)
            memory_eval = self.evaluator.evaluate(
                case, memory, retrieved_rule_keys=retrieval.selected_rule_keys
            )
            repeats.append(
                RepeatCaseResult(
                    repeat_index=repeat_index,
                    baseline=baseline_values[repeat_index],
                    memory=memory_eval,
                    baseline_prompt_fingerprint=baseline_fp,
                    memory_prompt_fingerprint=memory_fp,
                    invariant_prompt_fingerprint=invariant,
                )
            )
        first = repeats[0]
        baseline_counts = {
            "PASS": sum(item.baseline.overall == "PASS" for item in repeats),
            "FAIL": sum(item.baseline.overall == "FAIL" for item in repeats),
            "NOT_SCORED": sum(item.baseline.overall == "NOT_SCORED" for item in repeats),
        }
        memory_counts = {
            "PASS": sum(item.memory.overall == "PASS" for item in repeats),
            "FAIL": sum(item.memory.overall == "FAIL" for item in repeats),
            "NOT_SCORED": sum(item.memory.overall == "NOT_SCORED" for item in repeats),
        }
        return PairedCaseResult(
            task_id=case.input.task_id,
            split=case.input.split,
            baseline=first.baseline,
            memory=first.memory,
            baseline_prompt_fingerprint=first.baseline_prompt_fingerprint,
            memory_prompt_fingerprint=first.memory_prompt_fingerprint,
            invariant_prompt_fingerprint=first.invariant_prompt_fingerprint,
            repeat_count_requested=self.repeats,
            repeat_count_completed=len(repeats),
            repeat_results=repeats,
            baseline_pass_count=baseline_counts["PASS"],
            baseline_fail_count=baseline_counts["FAIL"],
            baseline_not_scored_count=baseline_counts["NOT_SCORED"],
            memory_pass_count=memory_counts["PASS"],
            memory_fail_count=memory_counts["FAIL"],
            memory_not_scored_count=memory_counts["NOT_SCORED"],
        )

    def run(self) -> ExperimentReport:
        self.preflight()
        run_id = "phase7_3b-" + uuid4().hex
        manager = ReasoningBankManager()
        ids_by_task: dict[str, dict[str, str]] = {}
        evaluation_cases = [
            case
            for family in self.pack.families
            for case in [*family.held_out_positive, *family.negative_controls]
        ]
        with self.store.session() as db:
            for case in self.pack.cases:
                ids_by_task[case.input.task_id] = self.store.seed_case(db, case)
            db.commit()
            source_results = {
                family.family: self._source_baselines(db, family.source)
                for family in self.pack.families
            }
            baseline_values = self._baseline_evaluations(evaluation_cases)
            self._pre_stage_provider_error_count = sum(
                status != "ok" for status in self._provider_statuses
            )
            learned_families: list[str] = []
            memory_values: dict[str, PairedCaseResult] = {}
            cumulative_counts: list[int] = []
            cumulative_regressions: dict[str, list[str]] = {}
            stage_metrics: list[StageExperimentMetrics] = []
            for family in self.pack.families:
                if source_results[family.family].overall == "FAIL":
                    approved = self._learn_from_source(
                        db,
                        family.source,
                        source_results[family.family],
                        ids_by_task[family.source.input.task_id],
                        manager,
                    )
                    if approved:
                        learned_families.append(family.family)
                state = manager.read.state(db, bank_namespace="simulation")
                cumulative_counts.append(state.current_rule_count)
                stage_cases = [
                    case
                    for item in self.pack.families
                    if item.family in learned_families
                    for case in [*item.held_out_positive, *item.negative_controls]
                ]
                for case in stage_cases:
                    memory_values[case.input.task_id] = self._memory_pair(
                        db, case, baseline_values[case.input.task_id]
                    )
                stage_pairs = [memory_values[case.input.task_id] for case in stage_cases]
                stage_metrics.append(
                    self._stage_metrics(
                        stage=len(stage_metrics) + 1,
                        family=family.family,
                        learned_families=learned_families,
                        pairs=stage_pairs,
                        rule_count=state.current_rule_count,
                        bank_digest=state.bank_digest,
                    )
                )
                for pair in stage_pairs:
                    if pair.baseline.overall == "PASS" and pair.memory.overall == "FAIL":
                        cumulative_regressions.setdefault(
                            f"after_{state.current_rule_count}", []
                        ).append(pair.task_id)
            rules = manager.read.list_rules(db, bank_namespace="simulation")
            report = self._build_report(
                run_id=run_id,
                paired=list(memory_values.values()),
                rule_count=len(rules),
                bank_counts=cumulative_counts,
                cumulative_regressions=cumulative_regressions,
                stage_metrics=stage_metrics,
            )
        return report

    def _build_report(
        self,
        *,
        run_id: str,
        paired: list[PairedCaseResult],
        rule_count: int,
        bank_counts: list[int],
        cumulative_regressions: dict[str, list[str]],
        stage_metrics: list[dict[str, Any]],
    ) -> ExperimentReport:
        valid_pairs = [
            item
            for item in paired
            if item.baseline.overall != "NOT_SCORED" and item.memory.overall != "NOT_SCORED"
        ]
        baseline_pass = [item.task_id for item in valid_pairs if item.baseline.overall == "PASS"]
        memory_pass = [item.task_id for item in valid_pairs if item.memory.overall == "PASS"]
        improved = sorted(
            item.task_id
            for item in valid_pairs
            if item.split == "held_out_positive"
            and item.baseline.overall == "FAIL"
            and item.memory.overall == "PASS"
        )
        regressed = sorted(set(baseline_pass) - set(memory_pass))
        unchanged_pass = sorted(set(baseline_pass) & set(memory_pass))
        unchanged_fail = sorted(
            item.task_id
            for item in valid_pairs
            if item.baseline.overall == "FAIL" and item.memory.overall == "FAIL"
        )
        all_selected = [key for item in paired for key in item.memory.retrieved_rule_keys]
        relevant = [
            key
            for item in paired
            for key in item.memory.retrieved_rule_keys
            if self.pack.case(item.task_id).oracle.applicable_rule_families
            and self.pack.case(item.task_id).input.family
            in self.pack.case(item.task_id).oracle.applicable_rule_families
        ]
        negative = [item for item in paired if item.split == "negative_control"]
        no_retrieval = [item for item in paired if not item.memory.retrieved_rule_keys]
        irrelevant = [
            item
            for item in paired
            if item.memory.retrieved_rule_keys
            and not set(self.pack.case(item.task_id).oracle.applicable_rule_families)
            & {self.pack.case(item.task_id).input.family}
        ]
        architecture = sorted(set(self._architecture_violations))
        negative_regressions = sorted(
            item.task_id
            for item in valid_pairs
            if item.split == "negative_control"
            and item.baseline.overall == "PASS"
            and item.memory.overall == "FAIL"
        )
        positive_improvements = sorted(
            item.task_id
            for item in valid_pairs
            if item.split == "held_out_positive"
            and item.baseline.overall == "FAIL"
            and item.memory.overall == "PASS"
        )
        expected_ids = {
            case.input.task_id
            for family in self.pack.families
            for case in [*family.held_out_positive, *family.negative_controls]
        }
        completed_ids = {item.task_id for item in paired}
        all_pairs_completed = expected_ids == completed_ids and all(
            item.repeat_count_completed == self.repeats for item in paired
        )
        provider_errors = bool(self._infra_errors) or any(
            status != "ok" for status in self._provider_statuses
        )
        primary_metrics_computable = all(
            item.baseline.overall != "NOT_SCORED"
            and item.memory.overall != "NOT_SCORED"
            and item.baseline.metrics
            and item.memory.metrics
            for item in paired
        ) and bool(paired)
        verdict = (
            "INFRASTRUCTURE_VALIDATED"
            if self.mode == "fixture"
            else self._live_verdict(
                source_failures=self._source_failures,
                compiler_calls=self._source_compiler_calls,
                governed_rules=rule_count,
                positive_improvements=positive_improvements,
                baseline_pass_rate=len(baseline_pass) / max(1, len(valid_pairs)),
                memory_pass_rate=len(memory_pass) / max(1, len(valid_pairs)),
                regressions=regressed,
                negative_regressions=negative_regressions,
                memory_violations=self._memory_violations,
                leakage=self._leakage,
                architecture=architecture,
                all_pairs_completed=all_pairs_completed,
                provider_errors=provider_errors,
                budget_exhausted=self._budget_exhausted,
                primary_metrics_computable=primary_metrics_computable,
            )
        )
        provider_call_count = len(getattr(self.compiler_provider, "calls", [])) + len(
            getattr(self.runner_provider, "calls", [])
        )
        if provider_call_count == 0:
            budgets = {
                id(getattr(self.compiler_provider, "budget", None)): getattr(
                    self.compiler_provider, "budget", None
                ),
                id(getattr(self.runner_provider, "budget", None)): getattr(
                    self.runner_provider, "budget", None
                ),
            }
            provider_call_count = max(
                (budget.count for budget in budgets.values() if budget is not None),
                default=0,
            )
        return ExperimentReport(
            run_id=run_id,
            git_head=_git_head(),
            fixture_pack_version=self.pack.version,
            fixture_pack_sha256=self.pack.sha256,
            mode=self.mode,
            verdict=verdict,
            compiler_model=self.compiler_model,
            runner_model=self.runner_model,
            max_live_calls=self.max_live_calls,
            repeats=self.repeats,
            retriever_threshold=self.retriever.relevance_threshold,
            retriever_top_k=self.retriever.top_k,
            total_provider_calls=provider_call_count,
            provider_statuses=list(self._provider_statuses),
            source_failure_before_learning=self._source_failures,
            no_learning_signal_source_cases=sorted(set(self._no_learning_signal)),
            baseline_pass_rate=len(baseline_pass) / max(1, len(valid_pairs)),
            memory_pass_rate=len(memory_pass) / max(1, len(valid_pairs)),
            pass_rate_delta=(len(memory_pass) - len(baseline_pass)) / max(1, len(valid_pairs)),
            improved_cases=improved,
            regressed_cases=regressed,
            unchanged_pass=unchanged_pass,
            unchanged_fail=unchanged_fail,
            retrieval_precision=(len(relevant) / len(all_selected)) if all_selected else None,
            irrelevant_memory_rate=len(irrelevant) / max(1, len(paired)),
            no_memory_retrieved_rate=len(no_retrieval) / max(1, len(paired)),
            negative_control_retrieval_rate=sum(
                bool(item.memory.retrieved_rule_keys) for item in negative
            )
            / max(1, len(negative)),
            memory_as_evidence_violations=sorted(set(self._memory_violations)),
            source_case_leakage_violations=sorted(set(self._leakage)),
            architecture_invariant_violations=architecture,
            bank_rule_counts=bank_counts,
            cumulative_regressions=cumulative_regressions,
            retrievals=list(self._retrievals),
            paired_cases=paired,
            source_compiler_calls=self._source_compiler_calls,
            governed_simulation_rule_count=rule_count,
            required_live_calls=self._required_live_calls,
            budget_exhausted=self._budget_exhausted,
            unresolved_infrastructure_errors=sorted(set(self._infra_errors)),
            stage_metrics=stage_metrics,
            curator_decisions=list(self.curator.decisions),
            provider_diagnostics=list(self._provider_diagnostics),
        )

    @staticmethod
    def _live_verdict(
        *,
        source_failures: int,
        compiler_calls: int,
        governed_rules: int,
        positive_improvements: list[str],
        baseline_pass_rate: float,
        memory_pass_rate: float,
        regressions: list[str],
        negative_regressions: list[str],
        memory_violations: list[str],
        leakage: list[str],
        architecture: list[str],
        all_pairs_completed: bool,
        provider_errors: bool,
        budget_exhausted: bool,
        primary_metrics_computable: bool,
    ):
        if regressions or negative_regressions or memory_violations or leakage or architecture:
            return "HARM_SIGNAL"
        if (
            provider_errors
            or budget_exhausted
            or not all_pairs_completed
            or not primary_metrics_computable
        ):
            return "INFRASTRUCTURE_FAILURE"
        if source_failures == 0 or compiler_calls == 0 or governed_rules == 0:
            return "INCONCLUSIVE"
        if positive_improvements and memory_pass_rate >= baseline_pass_rate:
            return "MECHANISM_SUPPORTED"
        return "INCONCLUSIVE"

    def _stage_metrics(
        self,
        *,
        stage: int,
        family: str,
        learned_families: list[str],
        pairs: list[PairedCaseResult],
        rule_count: int,
        bank_digest: str,
    ) -> StageExperimentMetrics:
        valid = [
            pair
            for pair in pairs
            if pair.baseline.overall != "NOT_SCORED" and pair.memory.overall != "NOT_SCORED"
        ]
        baseline_pass_count = sum(pair.baseline.overall == "PASS" for pair in valid)
        memory_pass_count = sum(pair.memory.overall == "PASS" for pair in valid)
        denominator = max(1, len(valid))
        positive_transfer = sorted(
            pair.task_id
            for pair in valid
            if pair.split == "held_out_positive"
            and pair.baseline.overall == "FAIL"
            and pair.memory.overall == "PASS"
        )
        regressions = sorted(
            pair.task_id
            for pair in valid
            if pair.baseline.overall == "PASS" and pair.memory.overall == "FAIL"
        )
        negative_regressions = sorted(
            pair.task_id
            for pair in valid
            if pair.split == "negative_control"
            and pair.baseline.overall == "PASS"
            and pair.memory.overall == "FAIL"
        )
        retrieval_count = sum(len(pair.memory.retrieved_rule_keys) for pair in pairs)
        relevant_retrieval_count = sum(
            sum(
                self.pack.case(pair.task_id).input.family
                in self.pack.case(pair.task_id).oracle.applicable_rule_families
                for _rule_key in pair.memory.retrieved_rule_keys
            )
            for pair in pairs
        )
        no_memory_count = sum(not pair.memory.retrieved_rule_keys for pair in pairs)
        negative_pairs = [pair for pair in pairs if pair.split == "negative_control"]
        provider_error_count = self._pre_stage_provider_error_count + sum(
            evaluation.provider_status != "ok"
            for pair in pairs
            for repeat in pair.repeat_results
            for evaluation in (repeat.memory,)
        )
        stage_ids = {pair.task_id for pair in pairs}
        return StageExperimentMetrics(
            stage_index=stage,
            bank_rule_count=rule_count,
            bank_digest=bank_digest,
            evaluated_families=list(learned_families),
            evaluated_case_count=len(pairs),
            baseline_pass_rate=baseline_pass_count / denominator,
            memory_pass_rate=memory_pass_count / denominator,
            pass_rate_delta=(memory_pass_count - baseline_pass_count) / denominator,
            improved_cases=positive_transfer,
            regressed_cases=regressions,
            positive_transfer_improvements=positive_transfer,
            negative_control_regressions=negative_regressions,
            retrieval_count=retrieval_count,
            relevant_retrieval_count=relevant_retrieval_count,
            irrelevant_retrieval_count=retrieval_count - relevant_retrieval_count,
            retrieval_precision=(
                relevant_retrieval_count / retrieval_count if retrieval_count else None
            ),
            no_memory_retrieved_count=no_memory_count,
            no_memory_retrieved_rate=no_memory_count / max(1, len(pairs)),
            negative_control_retrieval_rate=(
                sum(bool(pair.memory.retrieved_rule_keys) for pair in negative_pairs)
                / max(1, len(negative_pairs))
            ),
            provider_error_count=provider_error_count,
            memory_as_evidence_violations=sorted(set(self._memory_violations) & stage_ids),
            source_leakage_violations=sorted(set(self._leakage) & stage_ids),
            architecture_invariant_violations=sorted(
                item
                for item in set(self._architecture_violations)
                if any(f":{task_id}" in item for task_id in stage_ids)
            ),
        )


def fixture_providers(pack: SyntheticFixturePack) -> tuple[FixtureProvider, FixtureProvider]:
    """Create deterministic providers from authored fixture outputs."""

    def visible_fingerprint(task: SyntheticTaskVisibleInput) -> str:
        return hashlib.sha256(
            Phase7ArtifactService.canonical_json_bytes(task.model_dump(mode="json"))
        ).hexdigest()

    visible_cases = {visible_fingerprint(task_visible_payload(case)): case for case in pack.cases}

    # Authored compiler outputs are selected by the fake provider's call order,
    # never by a family/role label serialized into the compiler prompt.  The
    # source failure list is computed from the same deterministic evaluator
    # used by the experiment so source-pass families do not shift the cursor.
    compiler_cursor = 0
    supervisor = SyntheticSupervisor()
    evaluator = SyntheticEvaluator()
    compiler_families = []
    for family in pack.families:
        source = family.source
        observation = SyntheticRunObservation.model_validate(
            {
                **(source.baseline_observation or {}),
                "task_id": source.input.task_id,
                "condition": "baseline",
            }
        )
        evaluation = evaluator.evaluate(source, observation, retrieved_rule_keys=[])
        if supervisor.supervise(evaluation, task_id=source.input.task_id, fixture_mode=True):
            compiler_families.append(family)

    def runner(role: str, prompt: str, _model: str) -> dict[str, Any]:
        try:
            raw_task = prompt.split("TASK INPUT (benchmark metadata excluded):\n", 1)[1].split(
                "\nGUIDANCE SECTION BEGIN", 1
            )[0]
            task = SyntheticTaskVisibleInput.model_validate_json(raw_task)
        except (IndexError, ValueError) as exc:
            raise ValueError("fixture prompt lacks task-visible input") from exc
        case = visible_cases.get(visible_fingerprint(task))
        if case is None:
            raise ValueError("fixture prompt has unknown task-visible input")
        guidance_section = prompt.split("GUIDANCE SECTION BEGIN\n", 1)[-1]
        has_guidance = not guidance_section.startswith("NONE")
        has_rules = has_guidance and '"rules": []' not in guidance_section
        payload = case.baseline_observation if not has_rules else case.memory_observation
        if payload is None:
            payload = case.baseline_observation
        if payload is None:
            raise ValueError("fixture case lacks authored observation")
        return dict(payload)

    def compiler(_role: str, prompt: str, _model: str) -> dict[str, Any]:
        nonlocal compiler_cursor
        if "Allowlisted packet:" not in prompt:
            raise ValueError("compiler prompt lacks allowlisted source packet")
        if compiler_cursor >= len(compiler_families):
            raise ValueError("fixture compiler received too many calls")
        proposals = compiler_families[compiler_cursor].compiler_proposals
        compiler_cursor += 1
        return {"proposals": proposals}

    return FixtureProvider(runner), FixtureProvider(compiler)


def _jsonable(value: Any) -> Any:
    """Convert supported artifact values to JSON-native values strictly."""

    if isinstance(value, BaseModel):
        return _jsonable(value.model_dump(mode="json"))
    if isinstance(value, Enum):
        return _jsonable(value.value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise TypeError("artifact mappings must have string keys")
        return {key: _jsonable(item) for key, item in value.items()}
    raise TypeError(f"unsupported JSON artifact value: {type(value).__name__}")


def _json_text(value: Any, *, indent: int | None = None, sort_keys: bool = False) -> str:
    """Convert and validate one complete JSON document before it is written."""

    return json.dumps(
        _jsonable(value),
        allow_nan=False,
        ensure_ascii=False,
        indent=indent,
        sort_keys=sort_keys,
    )


def _jsonl_text(values: Iterable[Any]) -> str:
    """Convert and validate every JSONL record before any record is written."""

    return "".join(_json_text(value, sort_keys=True) + "\n" for value in values)


def _atomic_write_text(path: Path, text: str) -> None:
    """Replace one artifact atomically after its content has been validated."""

    temporary_path: str | None = None
    try:
        file_descriptor, temporary_path = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
        temporary_path = None
    finally:
        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass


def write_artifacts(
    report: ExperimentReport,
    output_dir: str | Path,
    *,
    rules: Iterable[Any] = (),
    retrievals: Iterable[Any] = (),
) -> Path:
    """Write local-only report artifacts; never writes ReviewArtifact rows."""
    directory = Path(output_dir) / report.run_id
    rule_values = list(rules)
    retrieval_values = list(retrievals) or list(report.retrievals)
    manifest = {
        "run_id": report.run_id,
        "git_head": report.git_head,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "fixture_pack_version": report.fixture_pack_version,
        "fixture_pack_sha256": report.fixture_pack_sha256,
        "mode": report.mode,
        "compiler_model": report.compiler_model,
        "runner_model": report.runner_model,
        "max_live_calls": report.max_live_calls,
        "repeats": report.repeats,
        "retriever": {"threshold": report.retriever_threshold, "top_k": report.retriever_top_k},
        "provider_statuses": report.provider_statuses,
        "total_provider_calls": report.total_provider_calls,
        "source_compiler_calls": report.source_compiler_calls,
        "governed_simulation_rule_count": report.governed_simulation_rule_count,
        "required_live_calls": report.required_live_calls,
        "budget_exhausted": report.budget_exhausted,
        "stage_metrics": report.stage_metrics,
        "curator_decisions": report.curator_decisions,
        "provider_diagnostics": report.provider_diagnostics,
    }
    fixture_label = (
        "INFRASTRUCTURE FIXTURE — AUTHORED BASELINE/MEMORY OBSERVATIONS — "
        "NOT MODEL-EFFICACY EVIDENCE"
        if report.mode == "fixture"
        else "LIVE SYNTHETIC EFFICACY PILOT"
    )
    report_markdown = (
        f"# Phase 7.3B synthetic experiment\n\n**{fixture_label}**\n\n"
        f"- Verdict: `{report.verdict}`\n- Rules: `{report.bank_rule_counts[-1] if report.bank_rule_counts else 0}`\n"
        f"- Baseline pass rate: `{report.baseline_pass_rate:.3f}`\n- Memory pass rate: `{report.memory_pass_rate:.3f}`\n"
        f"- Pass-rate delta: `{report.pass_rate_delta:.3f}`\n\n"
        "This is fictional process-reasoning validation, not legal or production validation.\n"
    )
    # Convert and validate every output before creating the run directory.  In
    # particular, this prevents a newly added nested Pydantic model from
    # reaching json.dumps() as an opaque object halfway through persistence.
    artifact_texts = {
        "manifest.json": _json_text(manifest, indent=2, sort_keys=True),
        "learned_rules.json": _json_text(rule_values, indent=2),
        "retrievals.jsonl": _jsonl_text(retrieval_values),
        "paired_runs.jsonl": _jsonl_text(report.paired_cases),
        "report.json": _json_text(report, indent=2),
        "report.md": report_markdown,
    }
    directory.mkdir(parents=True, exist_ok=False)
    for filename, text in artifact_texts.items():
        _atomic_write_text(directory / filename, text)
    return directory


__all__ = [
    "COMPILER_SYSTEM",
    "RUNNER_SYSTEM",
    "Phase73BExperiment",
    "SyntheticCurator",
    "SyntheticEvaluator",
    "SyntheticSupervisor",
    "build_compiler_prompt",
    "build_source_compiler_packet",
    "build_runner_prompt",
    "fixture_providers",
    "write_artifacts",
]
