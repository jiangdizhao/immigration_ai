import { defineConfig, devices } from "@playwright/test";

const BASE_URL =
  process.env.PHASE13_POSTM5_E2E_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  expect: { timeout: 30_000 },
  fullyParallel: false,
  outputDir: "e2e/browser/artifacts",
  projects: [{ name: "post-m5", use: { ...devices["Desktop Chrome"] } }],
  reporter: [["list"]],
  retries: 0,
  testDir: "./e2e/browser",
  timeout: 180_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  workers: 1,
});
