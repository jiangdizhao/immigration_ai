import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /phase15-m3-e3-(proposal|course-workspace|active-workflow)\.browser\.test\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    channel: "chrome",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
});
