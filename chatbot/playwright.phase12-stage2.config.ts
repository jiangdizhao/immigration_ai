import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 12 Stage 2 workspace browser checks.
 *
 * These are the reproducible, repository-committed successor of the temporary
 * out-of-repo script used during Stage 2 implementation. They run against an
 * explicitly selected, safe local/staging server only:
 *
 *   P12_STAGE2_E2E_BASE_URL=http://127.0.0.1:3100 pnpm run test:phase12:stage2:browser
 *
 * The workspace is checked at the four Stage 2 viewports, so the layout
 * contract (chat-first, labelled panels below 1280px, bounded composer) is
 * verified in a real browser instead of by assertion-only tests.
 */
const baseURL = process.env.P12_STAGE2_E2E_BASE_URL;
if (!baseURL) {
  throw new Error(
    "Set P12_STAGE2_E2E_BASE_URL to an explicitly selected safe test server."
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /phase12-stage2-workspace\.test\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "stage2-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: "stage2-laptop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: "stage2-tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "stage2-mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
});
