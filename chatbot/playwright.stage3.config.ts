import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.P11_STAGE3_E2E_BASE_URL;
if (!baseURL) {
  throw new Error(
    "Set P11_STAGE3_E2E_BASE_URL to an explicitly selected safe test server."
  );
}
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /phase11-accessibility\.test\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: baseURL ?? "http://127.0.0.1:1",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "stage3-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "stage3-mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
});
