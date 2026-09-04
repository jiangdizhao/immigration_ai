"""Phase 8.4 M3 campaign acceptance.

The default campaign uses a deterministic provider and makes zero external
calls.  Live mode uses fresh OpenAI Responses adapters for the bounded subset;
both modes remain inside one rollback-only transaction.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.db.models import AnswerReview, AnswerTrace, ExperienceRecord, Matter, ReviewArtifact
from app.db.session import SessionLocal
from app.schemas.agent import AgentClaim
from app.schemas.phase8_4_campaign import Phase84CampaignFixture
from app.services.agent_runtime_service import ProviderInterface, ProviderResponse
from app.services.phase7_3a_reasoning_bank import CandidatePoolService, ReasoningBankService
from app.services.phase8_4_campaign_service import (
    Phase84CampaignRun,
    Phase84CampaignService,
    default_m3_campaign_path,
    load_campaign_fixture,
)
from app.services.tool_executor_service import ToolCallRequest


class ScriptedM3Provider(ProviderInterface):
    """Deterministic synthetic response policy for the full campaign."""

    def __init__(self, *, candidate_id: str, scenario: Any, treatment: bool) -> None:
        self.candidate_id = candidate_id
        self.scenario = scenario
        self.treatment = treatment
        self.call_count = 0

    def _claim_ids(self) -> list[str]:
        if not self.treatment:
            return []
        if self.candidate_id in {"m3-c1-dates", "m3-c3-authority", "m3-c5-conflict"}:
            if self.scenario.group in {"source", "transfer"}:
                return list(self.scenario.expected_claim_ids)
        if self.candidate_id == "m3-c4-locator" and self.scenario.group == "source":
            return list(self.scenario.expected_claim_ids)
        if self.candidate_id == "m3-c3-authority" and self.scenario.group in {
            "negative_control",
            "control",
        }:
            return list(self.scenario.prohibited_claim_ids)
        return []

    async def call(self, **kwargs):
        self.call_count += 1
        draft = "Synthetic procedural result."
        claims = [
            AgentClaim(
                claim_id=claim_id,
                claim_type="procedure",
                materiality="supporting",
                text=draft,
                draft_start=0,
                draft_end=len(draft),
            ).model_dump(mode="json")
            for claim_id in self._claim_ids()
        ]
        return ProviderResponse(
            response_id=f"phase84-m3-scripted-{self.call_count}",
            model=kwargs["model"],
            status="ok",
            tool_calls=[
                ToolCallRequest(
                    call_id=f"phase84-m3-submit-{self.call_count}",
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


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the rollback-scoped Phase 8.4 M3 campaign."
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="run the bounded two-candidate live-provider subset",
    )
    return parser


def _target() -> tuple[str, int, str]:
    parsed = urlparse(get_settings().database_url)
    host = parsed.hostname or ""
    port = parsed.port or 5432
    database = (parsed.path or "").lstrip("/")
    print(f"M3 target: host={host} port={port} database={database}")
    if host not in {"localhost", "127.0.0.1"} or port != 5432 or database != "immigration_legal":
        raise SystemExit("refusing non-authoritative or non-local M3 target")
    return host, port, database


def _counts(db) -> dict[str, int]:
    return {
        "matters": db.query(Matter).count(),
        "answer_traces": db.query(AnswerTrace).count(),
        "answer_reviews": db.query(AnswerReview).count(),
        "experience_records": db.query(ExperienceRecord).count(),
        "review_artifacts": db.query(ReviewArtifact).count(),
    }


def _live_fixture(fixture: Phase84CampaignFixture) -> Phase84CampaignFixture:
    candidates = [
        candidate.model_copy(
            update={
                "scenarios": [
                    next(scenario for scenario in candidate.scenarios if scenario.group == group)
                    for group in ("source", "transfer", "negative_control", "control")
                ]
            }
        )
        for candidate in fixture.candidates[:2]
    ]
    return fixture.model_copy(update={"candidates": candidates})


def _print_deterministic(run: Phase84CampaignRun, fixture: Phase84CampaignFixture) -> None:
    def group_summary(summary: Any) -> str:
        return (
            f"{summary.improved}/{summary.unchanged}/{summary.regressed}/"
            f"{summary.mixed}/{summary.inconclusive}"
        )

    for report in run.reports:
        print(
            f"candidate={report.candidate_campaign_id} "
            f"rule={report.simulation_rule_key}/v{report.rule_version} "
            f"source={group_summary(report.source_summary)} "
            f"transfer={group_summary(report.transfer_summary)} "
            f"negative_control={group_summary(report.negative_control_summary)} "
            f"control={group_summary(report.control_summary)} "
            f"label={report.final_label} reasons={','.join(report.reason_codes)}"
        )
    labels = Counter(report.final_label for report in run.reports)
    print(
        f"aggregate: candidates={len(fixture.candidates)} scenarios="
        f"{sum(len(candidate.scenarios) for candidate in fixture.candidates)} "
        f"promising={labels['simulation_promising']} "
        f"inconclusive={labels['simulation_inconclusive']} "
        f"regression={labels['simulation_regression']} "
        f"invalid={labels['simulation_invalid']} provider/network_calls=0"
    )


def _print_live(run: Phase84CampaignRun) -> None:
    for item in run.scenario_results:
        print(
            f"scenario={item.scenario_id} group={item.group} "
            f"baseline_status={item.baseline_status} treatment_status={item.treatment_status} "
            f"baseline_replay={item.baseline_replay.overall_result} "
            f"treatment_replay={item.treatment_replay.overall_result} "
            f"delta={item.pair_delta.overall} "
            f"provider_calls={item.baseline_provider_api_call_count + item.treatment_provider_api_call_count} "
            f"tool_calls={item.baseline_tool_call_count + item.treatment_tool_call_count} "
            f"checker={item.baseline_checker_status}/{item.treatment_checker_status}"
        )
    models = sorted(
        {
            model
            for item in run.scenario_results
            for model in (item.baseline_model, item.treatment_model)
        }
    )
    print(
        f"aggregate: live_scenarios={len(run.scenario_results)} models={','.join(models)} "
        f"configuration_parity={all(item.baseline_model == item.treatment_model for item in run.scenario_results)}"
    )
    for report in run.reports:
        print(f"candidate={report.candidate_campaign_id} live_label={report.final_label}")


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    _target()
    full_fixture = load_campaign_fixture(default_m3_campaign_path())
    fixture = _live_fixture(full_fixture) if args.live else full_fixture

    if args.live:
        from app.services.openai_responses_adapter import OpenAIResponsesAdapter

        def provider_factory(candidate, scenario, arm):
            del candidate, scenario, arm
            return OpenAIResponsesAdapter()

    else:

        def provider_factory(candidate, scenario, arm):
            return ScriptedM3Provider(
                candidate_id=candidate.candidate_campaign_id,
                scenario=scenario,
                treatment=arm == "treatment",
            )

    before_counts: dict[str, int] | None = None
    before_digest: str | None = None
    before_real_rule_count: int | None = None
    before_real_candidate_count: int | None = None
    run: Phase84CampaignRun | None = None
    failure: Exception | None = None
    try:
        with SessionLocal() as db:
            try:
                before_counts = _counts(db)
                bank = ReasoningBankService()
                before_digest = bank.state(db, bank_namespace="real").bank_digest
                before_real_rule_count = len(bank.list_rules(db, bank_namespace="real"))
                before_real_candidate_count = len(
                    CandidatePoolService().list_candidates(db, bank_namespace="real")
                )
                run = asyncio.run(
                    Phase84CampaignService().run(
                        db=db,
                        fixture=fixture,
                        provider_factory=provider_factory,
                        experiment_id="m3-smoke",
                        as_of_date=date(2026, 9, 5),
                    )
                )
                if args.live and any(
                    item.baseline_status != "completed" or item.treatment_status != "completed"
                    for item in run.scenario_results
                ):
                    raise RuntimeError("live provider did not complete every arm")
            finally:
                db.rollback()
    except Exception as exc:
        failure = exc

    with SessionLocal() as db:
        after_counts = _counts(db)
        temporary_rows = sum(after_counts[key] - before_counts[key] for key in before_counts) if before_counts else 0
        real_bank_unchanged = True
        real_rule_count_unchanged = True
        real_candidate_count_unchanged = True
        if before_digest is not None:
            bank = ReasoningBankService()
            real_bank_unchanged = bank.state(db, bank_namespace="real").bank_digest == before_digest
            real_rule_count_unchanged = len(bank.list_rules(db, bank_namespace="real")) == before_real_rule_count
            real_candidate_count_unchanged = (
                len(CandidatePoolService().list_candidates(db, bank_namespace="real"))
                == before_real_candidate_count
            )
        cleanup_ok = temporary_rows == 0 and real_bank_unchanged and real_rule_count_unchanged and real_candidate_count_unchanged

    if failure is not None:
        if args.live:
            print("LIVE_PROVIDER_UNAVAILABLE" if isinstance(failure, RuntimeError) else "LIVE_SMOKE_FAILED")
            print(f"cleanup {'PASS' if cleanup_ok else 'FAIL'}")
            return 1
        raise failure
    if run is None or not cleanup_ok:
        raise RuntimeError("M3 smoke cleanup or execution failed")

    if args.live:
        _print_live(run)
        print(
            f"isolation: REAL_bank_unchanged={real_bank_unchanged} "
            f"REAL_rule_count_unchanged={real_rule_count_unchanged} "
            f"REAL_candidate_count_unchanged={real_candidate_count_unchanged} "
            f"rollback_completed=True temporary_rows_after_rollback={temporary_rows}"
        )
        print("M3 live acceptance: PASS")
    else:
        _print_deterministic(run, fixture)
        print("isolation: REAL bank unchanged rollback completed temporary rows after rollback=0")
        print("M3 deterministic acceptance: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
