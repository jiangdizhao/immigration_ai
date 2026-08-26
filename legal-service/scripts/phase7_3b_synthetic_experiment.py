#!/usr/bin/env python
"""Run the isolated Phase 7.3B synthetic experiment.

Fixture mode is the normal implementation/test path.  Live mode is an
explicit, tool-free provider run and is intentionally never enabled by
default.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from app.services.phase7_3b_experiment import (
    Phase73BExperiment,
    SyntheticEvaluator,
    SyntheticSupervisor,
    build_compiler_prompt,
    build_runner_prompt,
    build_source_compiler_packet,
    fixture_providers,
    write_artifacts,
)
from app.services.phase7_3b_provider import (
    LiveCallBudget,
    Phase73BProviderError,
    Phase73BResponsesProvider,
    parse_runner_response,
)
from app.schemas.phase7_3b import CompilerModelOutput, SyntheticRunObservation
from app.services.phase7_3b_synthetic_world import (
    SimulationStore,
    fixture_pack_path,
    load_fixture_pack,
    task_visible_payload,
)
from app.services.phase7_3a_reasoning_bank import ReasoningBankService


def _run_live_compiler_smoke(*, compiler_model: str) -> int:
    """Make one isolated compiler call from a deterministic source failure packet."""
    pack = load_fixture_pack(fixture_pack_path("v2"))
    if pack.mode_policy != "live_efficacy_pilot":
        raise Phase73BProviderError("compiler smoke requires a live-efficacy fixture pack")
    case = pack.families[0].source
    observation_data = dict(case.baseline_observation or {})
    observation_data.update(
        task_id=case.input.task_id,
        condition="baseline",
        provider_status="ok",
        fixture_forced_failure=True,
    )
    source_observation = SyntheticRunObservation.model_validate(observation_data)
    source_evaluation = SyntheticEvaluator().evaluate(
        case, source_observation, retrieved_rule_keys=[]
    )
    failure = SyntheticSupervisor().supervise(
        source_evaluation, task_id=case.input.task_id, fixture_mode=True
    )
    if failure is None:
        raise Phase73BProviderError("compiler smoke source case did not produce a failure packet")

    with SimulationStore() as store:
        with store.session() as db:
            ids = store.seed_case(db, case)
            candidate = store.add_candidate(
                db,
                case=case,
                ids=ids,
                lesson_text=SyntheticSupervisor.candidate_text(failure.failure_codes),
                failure_codes=failure.failure_codes,
            )
            db.flush()
            packet = build_source_compiler_packet(
                db, candidate_ids=[candidate.candidate_id], bank_namespace="simulation"
            )
            prompt = build_compiler_prompt(packet)
            provider = Phase73BResponsesProvider(
                live_requested=True,
                budget=LiveCallBudget(1),
                timeout_seconds=20.0,
            )
            response = provider.complete(role="compiler", prompt=prompt, model=compiler_model)

    parsed_output = None
    if response.status == "ok" and response.payload is not None:
        try:
            parsed_output = CompilerModelOutput.model_validate(response.payload).model_dump(
                mode="json"
            )
        except Exception:
            parsed_output = None
    print(
        json.dumps(
            {
                "provider_status": response.status,
                "call_number": response.call_number,
                "diagnostic": (
                    response.diagnostic.model_dump(mode="json")
                    if response.diagnostic is not None
                    else None
                ),
                "parsed_output": parsed_output,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if response.status == "ok" and parsed_output is not None else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 7.3B synthetic self-evolution experiment")
    parser.add_argument("--mode", choices=("fixture", "live"), default="fixture")
    parser.add_argument(
        "--live", action="store_true", help="required safety acknowledgement for live calls"
    )
    parser.add_argument("--fixture-pack")
    parser.add_argument("--compiler-model")
    parser.add_argument("--runner-model")
    parser.add_argument("--max-live-calls", type=int, default=100)
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--threshold", type=float, default=0.10)
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--output-dir", default=".phase7_3b_runs")
    parser.add_argument(
        "--live-smoke", action="store_true", help="make at most one live runner call"
    )
    parser.add_argument(
        "--live-compiler-smoke",
        action="store_true",
        help="make at most one isolated live compiler call",
    )
    args = parser.parse_args()

    if args.live_compiler_smoke:
        if os.getenv("PHASE7_3B_LIVE_ENABLED", "false").casefold() != "true":
            parser.error("live compiler smoke requires PHASE7_3B_LIVE_ENABLED=true")
        if not args.compiler_model:
            parser.error("live compiler smoke requires --compiler-model")
        return _run_live_compiler_smoke(compiler_model=args.compiler_model)

    if args.live_smoke:
        if os.getenv("PHASE7_3B_LIVE_ENABLED", "false").casefold() != "true":
            parser.error("live smoke requires PHASE7_3B_LIVE_ENABLED=true")
        if not args.runner_model:
            parser.error("live smoke requires --runner-model")
        pack = load_fixture_pack(fixture_pack_path(args.fixture_pack or "v2"))
        if pack.mode_policy != "live_efficacy_pilot":
            parser.error("live smoke requires a live-efficacy fixture pack")
        case = pack.families[0].held_out_positive[0]
        task = task_visible_payload(case)
        prompt, _ = build_runner_prompt(task, condition="baseline", guidance=None)
        provider = Phase73BResponsesProvider(
            live_requested=True,
            budget=LiveCallBudget(1),
            timeout_seconds=20.0,
        )
        response = provider.complete(role="runner", prompt=prompt, model=args.runner_model)
        observation = parse_runner_response(
            response, task_id=case.input.task_id, condition="baseline"
        )
        print(
            json.dumps(
                {
                    "provider_status": response.status,
                    "call_number": response.call_number,
                    "diagnostic": (
                        response.diagnostic.model_dump(mode="json")
                        if response.diagnostic is not None
                        else None
                    ),
                    "observation": (
                        observation.model_dump(mode="json") if response.status == "ok" else None
                    ),
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 0 if response.status == "ok" else 1

    # --live is an acknowledgement and an ergonomic alias for --mode live;
    # the provider still requires both this flag and the environment gate.
    if args.live:
        args.mode = "live"
    if args.mode == "live" and not args.live:
        parser.error("live mode requires --live")
    if args.mode == "live" and os.getenv("PHASE7_3B_LIVE_ENABLED", "false").casefold() != "true":
        parser.error("live mode requires PHASE7_3B_LIVE_ENABLED=true")
    if args.mode == "live" and (not args.compiler_model or not args.runner_model):
        parser.error("live mode requires --compiler-model and --runner-model")
    if args.repeats < 1 or args.repeats > 3:
        parser.error("--repeats must be between 1 and 3")
    if not 0 <= args.max_live_calls <= 100:
        parser.error("--max-live-calls must be between 0 and 100")

    selected_pack = args.fixture_pack or ("v2" if args.mode == "live" else "v1")
    pack_path = fixture_pack_path(selected_pack)
    pack = load_fixture_pack(pack_path)
    if args.mode == "live" and pack.mode_policy != "live_efficacy_pilot":
        parser.error(f"fixture pack {pack.version} is infrastructure-only; live requires v2+")
    with SimulationStore() as store:
        if args.mode == "fixture":
            runner, compiler = fixture_providers(pack)
            compiler_model = args.compiler_model or "fixture-compiler"
            runner_model = args.runner_model or "fixture-runner"
        else:
            budget = LiveCallBudget(args.max_live_calls)
            compiler = Phase73BResponsesProvider(
                live_requested=True, budget=budget, timeout_seconds=20.0
            )
            runner = Phase73BResponsesProvider(
                live_requested=True, budget=budget, timeout_seconds=20.0
            )
            compiler_model = args.compiler_model
            runner_model = args.runner_model
        experiment = Phase73BExperiment(
            pack,
            store=store,
            compiler_provider=compiler,
            runner_provider=runner,
            mode=args.mode,
            compiler_model=compiler_model,
            runner_model=runner_model,
            max_live_calls=args.max_live_calls,
            repeats=args.repeats,
            relevance_threshold=args.threshold,
            top_k=args.top_k,
        )
        try:
            report = experiment.run()
        except Phase73BProviderError as exc:
            parser.error(str(exc))
        with store.session() as db:
            rules = ReasoningBankService().list_rules(db, bank_namespace="simulation")
        output = write_artifacts(report, Path(args.output_dir), rules=rules)
    print(report.model_dump_json(indent=2))
    print(f"artifacts={output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
