/** Benchmark the browser-safe generated matcher without printing input text. */

import {
  evaluatePoliticalText,
  politicalGateIdentity,
  politicalGateInitializationMs,
} from "../lib/political-gate";
import runtime from "../lib/political-gate/policy.runtime.json";

function percentile(values: number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))
  );
  return ordered[index] ?? 0;
}

function median(values: number[]): number {
  return percentile(values, 0.5);
}

function safeMessage(length: number): string {
  const seed =
    "Can I apply for an Australian visa after completing my course? ";
  return seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
}

function measure(length: number, samples: number, warmup: number) {
  const message = safeMessage(length);
  for (let index = 0; index < warmup; index += 1) {
    evaluatePoliticalText(message);
  }

  const normalization: number[] = [];
  const matching: number[] = [];
  const context: number[] = [];
  const total: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const result = evaluatePoliticalText(message);
    normalization.push(result.timings.normalizationMs);
    matching.push(result.timings.patternMatchingMs);
    context.push(result.timings.contextEvaluationMs);
    total.push(result.timings.totalMs);
  }
  return {
    context_p50_ms: median(context),
    length_chars: length,
    matching_p50_ms: median(matching),
    normalization_p50_ms: median(normalization),
    total_p50_ms: median(total),
    total_p95_ms: percentile(total, 0.95),
    total_p99_ms: percentile(total, 0.99),
  };
}

const assertTargets = process.argv.includes("--assert-targets");
const samplesArgument = process.argv.find((argument) =>
  argument.startsWith("--samples=")
);
const samples = samplesArgument
  ? Number(samplesArgument.slice("--samples=".length))
  : 1000;
if (!Number.isInteger(samples) || samples < 1) {
  throw new Error("--samples must be a positive integer");
}

const target = runtime.runtime.latency_targets_ms.normal_message_p95;
const hardTarget =
  runtime.runtime.latency_targets_ms.normal_message_hard_target;
const normalChatMaxLength = 2000;
const rows = runtime.runtime.benchmark_lengths_chars.map((length) =>
  measure(length, samples, 100)
);
console.log(
  JSON.stringify({
    implementation: "browser_typescript_aho_corasick",
    policyHash: politicalGateIdentity.policyHash,
    policyVersion: politicalGateIdentity.policyVersion,
    hard_target_ms: hardTarget,
    matcher_initialization_ms: politicalGateInitializationMs,
    normal_chat_max_length_chars: normalChatMaxLength,
    rows,
    samples,
    target_p95_ms: target,
  })
);
if (
  assertTargets &&
  (rows.some(
    (row) =>
      row.length_chars <= normalChatMaxLength && row.total_p95_ms > target
  ) ||
    rows.some((row) => row.total_p95_ms > hardTarget))
) {
  throw new Error("political gate latency target exceeded");
}
