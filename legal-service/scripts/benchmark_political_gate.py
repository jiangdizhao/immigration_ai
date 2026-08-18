"""Measure the generated FastAPI political matcher without logging message text.

Run from ``legal-service`` with the required torch interpreter, for example:

    /home/rico/anaconda3/envs/torch/bin/python -m scripts.benchmark_political_gate --assert-targets
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import median
from time import perf_counter_ns

from app.services.political_failsafe_service import CompiledPoliticalMatcher, _runtime_asset_path


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    index = min(len(ordered) - 1, max(0, int((len(ordered) - 1) * fraction)))
    return ordered[index]


def safe_message(length: int) -> str:
    seed = "Can I apply for an Australian visa after completing my course? "
    return (seed * ((length // len(seed)) + 1))[:length]


def measure(
    matcher: CompiledPoliticalMatcher, *, length: int, samples: int, warmup: int
) -> dict[str, float | int]:
    message = safe_message(length)
    for _ in range(warmup):
        matcher.evaluate(message)

    normalization: list[float] = []
    matching: list[float] = []
    context: list[float] = []
    total: list[float] = []
    for _ in range(samples):
        result = matcher.evaluate(message)
        normalization.append(result.timings.normalization_ms)
        matching.append(result.timings.pattern_matching_ms)
        context.append(result.timings.context_evaluation_ms)
        total.append(result.timings.total_ms)

    return {
        "length_chars": length,
        "normalization_p50_ms": median(normalization),
        "matching_p50_ms": median(matching),
        "context_p50_ms": median(context),
        "total_p50_ms": median(total),
        "total_p95_ms": percentile(total, 0.95),
        "total_p99_ms": percentile(total, 0.99),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=500)
    parser.add_argument("--warmup", type=int, default=100)
    parser.add_argument("--assert-targets", action="store_true")
    args = parser.parse_args()
    if args.samples < 1 or args.warmup < 0:
        raise SystemExit("samples must be positive and warmup must be non-negative")

    path: Path = _runtime_asset_path()
    started = perf_counter_ns()
    matcher = CompiledPoliticalMatcher.from_file(path)
    startup_ms = (perf_counter_ns() - started) / 1_000_000
    runtime = json.loads(path.read_text(encoding="utf-8"))["runtime"]
    target = float(runtime["latency_targets_ms"]["normal_message_p95"])
    hard_target = float(runtime["latency_targets_ms"]["normal_message_hard_target"])
    normal_chat_max_length = 2_000
    rows = [
        measure(matcher, length=length, samples=args.samples, warmup=args.warmup)
        for length in runtime["benchmark_lengths_chars"]
    ]
    report = {
        "implementation": "fastapi_python_aho_corasick",
        "policy_hash": matcher.policy_hash,
        "policy_version": matcher.policy_version,
        "runtime_asset": str(path),
        "startup_compile_ms": startup_ms,
        "samples": args.samples,
        "hard_target_ms": hard_target,
        "normal_chat_max_length_chars": normal_chat_max_length,
        "target_p95_ms": target,
        "rows": rows,
    }
    print(json.dumps(report, sort_keys=True))

    normal_rows = [row for row in rows if row["length_chars"] <= normal_chat_max_length]
    if args.assert_targets and (
        any(row["total_p95_ms"] > target for row in normal_rows)
        or any(row["total_p95_ms"] > hard_target for row in rows)
    ):
        raise SystemExit("political gate latency target exceeded")


if __name__ == "__main__":
    main()
