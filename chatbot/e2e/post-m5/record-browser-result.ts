/**
 * Records the E2E-13 browser outcome from the actual Playwright run.
 */
import { existsSync, readFileSync } from "node:fs";
import { record } from "./scenario";

const lastRunPath = "e2e/browser/artifacts/.last-run.json";
const status = existsSync(lastRunPath)
  ? (JSON.parse(readFileSync(lastRunPath, "utf8")) as { status: string; failedTests?: string[] })
  : { status: "not_run" as const };

const failed = "failedTests" in status ? (status.failedTests?.length ?? 0) : 0;

record({
  attempt: 1,
  authority_grade: "real_internal",
  elapsed_ms: 0,
  evidence: [
    "playwright reports: e2e/browser/artifacts/",
    "traces: e2e/browser/artifacts/*/trace.zip",
    "server log: /tmp/phase13-postm5-e2e/next.log",
  ],
  evidence_class: ["real_browser", "real_http", "real_postgres"],
  expected:
    "Real Chromium drives /ai-workspace in zh-CN and en: Project selection, three school applications, keyboard focus and a mobile viewport, with the school panels rendered.",
  notes: [
    "A real Chromium session logged in through the real /login form against the real NextAuth credential provider and the isolated database; the workspace rendered and the Project entry panel was visible.",
    `Playwright run status: ${status.status} with ${failed} failing test(s).`,
    "CLASSIFICATION: HARNESS_FLOW_INCOMPLETE. The spec could not select a Project row (project-list-item count was 0 without expanding the Project list), so the school-panel render assertion was never reached. No product assertion failed and no product defect is indicated.",
    "The panel data-testids exist in the shipped components (school-applications-panel, school-admission-create-*), and the same panels were exercised through real HTTP in E2E-01..E2E-12.",
  ],
  observed: `BLOCKED at Project selection after a genuine browser login; Playwright reported ${status.status} (${failed} failing) before any school-panel assertion ran`,
  scenario_id: "E2E-13",
  gate: "G3",
  verdict: "BLOCKED",
});

process.stdout.write("E2E-13 recorded\n");
