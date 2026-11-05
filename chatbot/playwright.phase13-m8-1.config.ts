import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 13 M8.1 - consolidated browser acceptance config (owner-authorized runs only).
 *
 * There is deliberately NO `webServer` block: this suite never starts a Next.js
 * server. It targets the already-running, explicitly authorized, loopback-only
 * environment created by `scripts/phase13-m8-1-browser-acceptance.sh`:
 *
 *   PHASE13_M8_1_BROWSER_AUTHORIZED=true
 *   PHASE13_M8_1_BROWSER_BASE_URL=http://127.0.0.1:3102   # loopback only
 *   PHASE13_M8_1_PROJECT_ID=<seeded Project id>
 *   PHASE13_M8_1_SCHOOL_TARGET_ID=<seeded M5.1 school application id>
 *   PHASE13_M8_1_STUDENT500_TARGET_ID=<seeded M6.1 Student 500 application id>
 *   PHASE13_M8_1_OUTSIDER_PROJECT_ID / PHASE13_M8_1_OUTSIDER_EMAIL=<seeded unrelated customer>
 *   PHASE13_M8_1_SYNTHETIC_EMAIL / PHASE13_M8_1_SYNTHETIC_PASSWORD=<synthetic only>
 *
 * Without them the spec self-skips, and the runner treats any skip as NOT a pass
 * (it requires expected=5 unexpected=0 skipped=0 flaky=0).
 */
const baseURL =
  process.env.PHASE13_M8_1_BROWSER_BASE_URL ?? "http://127.0.0.1:3102";

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL,
        locale: "en-AU",
        trace: "retain-on-failure",
      },
    },
  ],
  reporter: [["list"]],
  retries: 0,
  testDir: "./tests/e2e",
  // A dedicated, isolated browser profile per run: never the developer profile.
  outputDir:
    process.env.PHASE13_M8_1_PLAYWRIGHT_OUTPUT ?? "./test-results/phase13-m8-1",
  testMatch: /phase13-m8-1-.*\.test\.ts/u,
  timeout: 90_000,
  use: {
    headless: true,
    viewport: { height: 900, width: 1360 },
  },
  workers: 1,
});
