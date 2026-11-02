/**
 * Phase 13 Post-M5 E2E — result ledger recorder.
 *
 * Every scenario records exactly one immutable record. Records carry the frozen
 * expectation, the observation, the evidence class and the verdict so the final
 * report is derived from what actually ran.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { EVIDENCE_DIR } from "./env";

export type Verdict = "PASS" | "FAIL" | "BLOCKED" | "UNVERIFIED" | "NOT_RUN";

export type EvidenceClass =
  | "real_postgres"
  | "real_http"
  | "real_browser"
  | "in_process_synthetic_authority"
  | "deny_only"
  | "documented_history";

export type ScenarioRecord = {
  scenario_id: string;
  gate: string;
  expected: string;
  observed: string;
  evidence_class: EvidenceClass[];
  verdict: Verdict;
  attempt: number;
  elapsed_ms: number;
  evidence: string[];
  notes: string[];
  authority_grade: string;
};

const LEDGER = () => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  return join(EVIDENCE_DIR, "ledger.jsonl");
};

export function record(entry: ScenarioRecord): void {
  appendFileSync(LEDGER(), `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
}

/**
 * Runs one scenario body, capturing the observation, timing and verdict.
 * A thrown error is a FAIL with the error text preserved verbatim; it is never
 * converted into a pass and never retried.
 */
export async function scenario(input: {
  id: string;
  gate: string;
  expected: string;
  evidenceClass: EvidenceClass[];
  authorityGrade: string;
  run: (ctx: ScenarioContext) => Promise<string>;
}): Promise<ScenarioRecord> {
  const started = Date.now();
  const ctx = new ScenarioContext();
  try {
    const observed = await input.run(ctx);
    const result: ScenarioRecord = {
      attempt: 1,
      authority_grade: input.authorityGrade,
      elapsed_ms: Date.now() - started,
      evidence: ctx.evidence,
      evidence_class: input.evidenceClass,
      expected: input.expected,
      notes: ctx.notes,
      observed,
      scenario_id: input.id,
      gate: input.gate,
      verdict: "PASS",
    };
    record(result);
    return result;
  } catch (error) {
    const result: ScenarioRecord = {
      attempt: 1,
      authority_grade: input.authorityGrade,
      elapsed_ms: Date.now() - started,
      evidence: ctx.evidence,
      evidence_class: input.evidenceClass,
      expected: input.expected,
      notes: [...ctx.notes, error instanceof Error ? error.message : String(error)],
      observed: `FAILED: ${error instanceof Error ? error.message : String(error)}`,
      scenario_id: input.id,
      gate: input.gate,
      verdict: "FAIL",
    };
    record(result);
    return result;
  }
}

export class ScenarioContext {
  readonly evidence: string[] = [];
  readonly notes: string[] = [];

  note(message: string): void {
    this.notes.push(message);
  }

  cite(locator: string): void {
    this.evidence.push(locator);
  }
}

/** Records a scenario that could not be executed at all. */
export function recordNotRun(input: {
  id: string;
  gate: string;
  expected: string;
  reason: string;
  verdict?: "BLOCKED" | "UNVERIFIED" | "NOT_RUN";
}): void {
  record({
    attempt: 0,
    authority_grade: "not_executed",
    elapsed_ms: 0,
    evidence: [],
    evidence_class: [],
    expected: input.expected,
    notes: [input.reason],
    observed: input.reason,
    scenario_id: input.id,
    gate: input.gate,
    verdict: input.verdict ?? "NOT_RUN",
  });
}
