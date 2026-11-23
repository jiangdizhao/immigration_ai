import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /phase15-m3-e1-splitter\.browser\.test\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    channel: "chrome",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1913, height: 900 },
  },
});
