import { defineConfig, devices } from "@playwright/test";

const port = 3101;
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Isolated route-bypass suite. It always starts its own Next.js process and
 * points legal-service traffic at a refused loopback port, so a regression
 * cannot forward a blocked fixture to a developer's service.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "political-gate-workspace.test.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "html",
  timeout: 240 * 1000,
  expect: {
    timeout: 30_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    env: {
      ...process.env,
      AUTH_URL: baseURL,
      LEGAL_SERVICE_URL: "http://127.0.0.1:9",
      NEXTAUTH_URL: baseURL,
      PHASE2_POLITICAL_GATE_ISOLATED: "true",
      PORT: String(port),
    },
    url: `${baseURL}/ping`,
    timeout: 120 * 1000,
    reuseExistingServer: false,
  },
});
