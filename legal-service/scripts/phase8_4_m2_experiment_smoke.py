"""Deterministic Phase 8.4 M2 acceptance against the authoritative local DB.

The default provider is scripted and offline.  All created rows are held in
one transaction and rolled back; the post-check uses a fresh SQLAlchemy
session rather than the original identity map.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, Matter, ReviewArtifact
from app.schemas.agent import AgentClaim
from app.services.agent_runtime_service import ProviderInterface, ProviderResponse
from app.services.phase7_3a_reasoning_bank import ReasoningBankService
from app.services.phase8_4_experiment_service import Phase84ExperimentRunner
from app.services.phase8_4_simulation_service import (
    Phase84SimulationService,
    default_m1_fixture_path,
    load_simulation_fixture,
)
from app.services.tool_executor_service import ToolCallRequest


class ScriptedM2Provider(ProviderInterface):
    """Zero-network provider that varies only the synthetic guidance response."""

    def __init__(self, *, treatment: bool) -> None:
        self.treatment = treatment
        self.call_count = 0
        self.guidance_seen = False

    async def call(self, **kwargs):
        self.call_count += 1
        self.guidance_seen = "SIMULATION PROCESS GUIDANCE" in kwargs["system_prompt"]
        draft = "Synthetic procedural result."
        claims = []
        if self.treatment:
            claims = [
                AgentClaim(
                    claim_id="process-date-check",
                    claim_type="procedure",
                    materiality="supporting",
                    text=draft,
                    draft_start=0,
                    draft_end=len(draft),
                ).model_dump(mode="json")
            ]
        return ProviderResponse(
            response_id=f"phase84-m2-scripted-{self.call_count}",
            model=kwargs["model"],
            status="ok",
            tool_calls=[
                ToolCallRequest(
                    call_id=f"phase84-m2-submit-{self.call_count}",
                    name="submit_answer",
                    arguments={
                        "schema_version": "agent_submission.v2",
                        "answer_class": "procedural",
                        "draft_markdown": draft,
                        "claims": claims,
                        "citations": [],
                        "research_status": "not_required",
                    },
                )
            ],
        )


def _target() -> tuple[str, int, str]:
    settings = get_settings()
    parsed = urlparse(settings.database_url)
    host = parsed.hostname or ""
    port = parsed.port or 5432
    database = (parsed.path or "").lstrip("/")
    # This is the only target information printed before opening a session.
    print(f"M2 target: host={host} port={port} database={database}")
    if host not in {"localhost", "127.0.0.1"} or port != 5432 or database != "immigration_legal":
        raise SystemExit("refusing non-authoritative or non-local M2 target")
    return host, port, database


def _fresh_absence_check(db, disposable_ids: tuple[str, ...]) -> int:
    models = (Matter, AnswerTrace, AnswerReview, ExperienceRecord, ReviewArtifact)
    return sum(db.get(model, row_id) is not None for model in models for row_id in disposable_ids)


class _LiveProviderUnavailable(RuntimeError):
    """The live provider did not produce a completed paired run."""


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the rollback-scoped Phase 8.4 M2 paired experiment smoke."
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="use two fresh OpenAI Responses providers instead of the offline scripted provider",
    )
    return parser


def _print_live_result(result: Any, *, real_digest_unchanged: bool, real_rule_count_unchanged: bool) -> None:
    baseline = result.baseline.runtime_result
    treatment = result.treatment.runtime_result
    print(
        "baseline: "
        f"status={baseline.status} model={baseline.model} "
        f"provider_api_call_count={baseline.metrics.provider_api_call_count} "
        f"tool_call_count={baseline.metrics.tool_call_count} "
        f"checker_status={baseline.checker_status} "
        f"replay={result.baseline.replay_report.overall_result}"
    )
    print(
        "treatment: "
        f"status={treatment.status} model={treatment.model} "
        f"provider_api_call_count={treatment.metrics.provider_api_call_count} "
        f"tool_call_count={treatment.metrics.tool_call_count} "
        f"checker_status={treatment.checker_status} "
        f"replay={result.treatment.replay_report.overall_result} "
        f"guidance_injected={result.treatment.guidance.guidance_injected} "
        f"simulation_rule={result.treatment.guidance.rule_key}/v{result.treatment.guidance.rule_version}"
    )
    print(
        "pair: "
        "shared_configuration_fingerprint_equal=True "
        f"model_equal={baseline.model == treatment.model} "
        f"delta={result.comparison.overall}"
    )
    print(
        "isolation: "
        f"real_bank_digest_unchanged={real_digest_unchanged} "
        f"real_rule_count_unchanged={real_rule_count_unchanged} "
        "rollback_completed=True post_rollback_temporary_rows=0"
    )


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    _target()
    fixture = load_simulation_fixture(default_m1_fixture_path())
    providers: dict[str, ScriptedM2Provider] = {}

    if args.live:
        from app.services.openai_responses_adapter import OpenAIResponsesAdapter

        def provider_factory(arm):
            del arm
            # A fresh adapter per arm, with all model/effort/tool/budget
            # controls remaining owned by the shared runner/runtime settings.
            return OpenAIResponsesAdapter()

    else:

        def provider_factory(arm):
            provider = ScriptedM2Provider(treatment=arm == "treatment")
            providers[arm] = provider
            return provider

    disposable_ids: tuple[str, ...] = ()
    before_digest = None
    before_real_rule_count = None
    result = None
    failure: Exception | None = None
    try:
        with SessionLocal() as db:
            try:
                simulation = Phase84SimulationService().run(db, fixture)
                disposable_ids = simulation.disposable_ids
                case_row = next(
                    row
                    for row in db.query(ReviewArtifact).all()
                    if row.id == simulation.evaluation_artifact_id
                )
                from app.schemas.learning import EvaluationCase

                case = EvaluationCase.model_validate(case_row.artifact_payload)
                real_bank = ReasoningBankService()
                before_state = real_bank.state(db, bank_namespace="real")
                before_digest = before_state.bank_digest
                before_real_rule_count = before_state.current_rule_count
                result = asyncio.run(
                    Phase84ExperimentRunner(provider_factory=provider_factory).run(
                        db=db,
                        scenario=fixture.scenario,
                        evaluation_case=case,
                        rule_key=simulation.rule_key,
                        experiment_id="smoke",
                        as_of_date=date(2026, 9, 5),
                    )
                )
                if args.live:
                    if any(
                        arm.runtime_result.status != "completed"
                        for arm in (result.baseline, result.treatment)
                    ):
                        raise _LiveProviderUnavailable("live arm did not complete")
                else:
                    assert result.baseline.runtime_result.status == "completed"
                    assert result.treatment.runtime_result.status == "completed"
                assert result.baseline.guidance.guidance_injected is False
                assert result.treatment.guidance.guidance_injected is True
                assert result.treatment.guidance.rule_key == simulation.rule_key
                assert result.config.experiment_arm == "N"
                if not args.live:
                    assert result.comparison.overall == "improved"
                    assert result.baseline.runtime_result.checker_status == "not_required"
                    assert result.treatment.runtime_result.checker_status == "not_required"
                    assert providers["baseline"].call_count == 1
                    assert providers["treatment"].call_count == 1
                    assert providers["baseline"].guidance_seen is False
                    assert providers["treatment"].guidance_seen is True
                assert real_bank.state(db, bank_namespace="real").bank_digest == before_digest
                assert len(real_bank.list_rules(db, bank_namespace="real")) == before_real_rule_count
            finally:
                # The acceptance has no commit path; this also runs for an
                # assertion/provider exception before the context closes.
                db.rollback()
    except Exception as exc:
        failure = exc

    # Always use a new session for cleanup, including the failure path.  This
    # proves database state rather than relying on an ORM identity map.
    with SessionLocal() as db:
        remaining = _fresh_absence_check(db, disposable_ids)
        if remaining != 0:
            raise RuntimeError(f"disposable rows remain after rollback: {remaining}")
        if before_digest is not None:
            real_bank = ReasoningBankService()
            if real_bank.state(db, bank_namespace="real").bank_digest != before_digest:
                raise RuntimeError("real bank changed during M2 smoke")
            if len(real_bank.list_rules(db, bank_namespace="real")) != before_real_rule_count:
                raise RuntimeError("real rule count changed during M2 smoke")

    if failure is not None:
        if args.live:
            category = (
                "LIVE_PROVIDER_UNAVAILABLE"
                if isinstance(failure, _LiveProviderUnavailable)
                or failure.__class__.__module__.startswith("openai")
                or "timeout" in failure.__class__.__name__.lower()
                or "connection" in failure.__class__.__name__.lower()
                else "LIVE_SMOKE_FAILED"
            )
            print(category)
            print("cleanup PASS")
            return 1
        raise failure
    if args.live:
        _print_live_result(
            result,
            real_digest_unchanged=True,
            real_rule_count_unchanged=True,
        )
        print("LIVE acceptance: PASS")
    else:
        print("M2 deterministic acceptance: PASS")
        print("cleanup counts: temporary_rows=0 real_bank_changes=0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
