import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 13 M6.3 - browser acceptance config (PREPARED, NOT AUTHORIZED TO RUN).
 *
 * There is deliberately NO `webServer` block: this suite never starts a Next.js
 * server. It targets an already-running, explicitly authorized, loopback-only
 * synthetic environment:
 *
 *   PHASE13_M6_3_BROWSER_AUTHORIZED=true
 *   PHASE13_M6_3_BROWSER_BASE_URL=http://127.0.0.1:3100   # loopback only
 *   PHASE13_M6_3_PROJECT_ID=<uuid of the synthetic Project>
 *   PHASE13_M6_3_PROJECT_NAME=<label shown in the Project list>
 *   PHASE13_M6_3_SYNTHETIC_EMAIL=<synthetic registered customer>
 *   PHASE13_M6_3_SYNTHETIC_PASSWORD=<synthetic only>
 *
 * Without them the spec self-skips (PENDING), which is never reported as a pass.
 */
const baseURL =
  process.env.PHASE13_M6_3_BROWSER_BASE_URL ?? "http://127.0.0.1:3100";

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
  testMatch: /phase13-m6-3-.*\.test\.ts/u,
  timeout: 90_000,
  use: {
    headless: true,
    viewport: { height: 900, width: 1360 },
  },
  workers: 1,
});
