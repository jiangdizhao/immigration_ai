import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 13 M8.3 - consolidated integrated browser acceptance (owner-authorized runs
 * only).
 *
 * There is deliberately NO `webServer` block: this suite never starts Next.js. It
 * targets the already-running, explicitly authorized, loopback-only environment created
 * by `scripts/phase13-m8-3-browser-acceptance.sh`:
 *
 *   PHASE13_M8_3_BROWSER_AUTHORIZED=true
 *   PHASE13_M8_3_BROWSER_BASE_URL=http://127.0.0.1:3103      # loopback only
 *   PHASE13_M8_3_PROJECT_ID / PHASE13_M8_3_SCHOOL_TARGET_ID
 *   PHASE13_M8_3_STUDENT500_TARGET_ID
 *   PHASE13_M8_3_OUTSIDER_PROJECT_ID / PHASE13_M8_3_OUTSIDER_EMAIL
 *   PHASE13_M8_3_SYNTHETIC_EMAIL / PHASE13_M8_3_SYNTHETIC_PASSWORD
 *
 * Without them the spec self-skips, and the runner treats any skip as NOT a pass
 * (it requires expected=5 unexpected=0 skipped=0 flaky=0).
 */
const baseURL =
  process.env.PHASE13_M8_3_BROWSER_BASE_URL ?? "http://127.0.0.1:3103";

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir:
    process.env.PHASE13_M8_3_PLAYWRIGHT_OUTPUT ?? "./test-results/phase13-m8-3",
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
  testMatch: /phase13-m8-3-.*\.test\.ts/u,
  timeout: 120_000,
  use: {
    headless: true,
    viewport: { height: 900, width: 1360 },
  },
  workers: 1,
});
