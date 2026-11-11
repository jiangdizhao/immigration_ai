import { expect, type Page, test } from "@playwright/test";

/**
 * Phase 13 M6.3 - browser acceptance of the consolidated Student 500 journey.
 *
 * STATUS: PREPARED / PENDING OWNER AUTHORIZATION. This spec never starts a server
 * and never uses a real customer account. It runs only against an explicitly
 * authorized loopback synthetic environment; otherwise it self-skips, which the
 * M6.3 report records as PENDING - never as a browser PASS.
 *
 * Real navigation (verified against source):
 *   /ai-workspace -> project-entry-panel -> workspace-project-list -> project-list-item
 *   -> project-view-nav -> project-view-student500 -> student500-panel
 *   -> prep-section -> prep-draft-create / prep-draft-section-* / prep-draft-save
 *   -> prep-draft-history
 */

const AUTHORIZED = process.env.PHASE13_M6_3_BROWSER_AUTHORIZED === "true";
const BASE_URL = process.env.PHASE13_M6_3_BROWSER_BASE_URL ?? "";
const PROJECT_ID = process.env.PHASE13_M6_3_PROJECT_ID ?? "";
const PROJECT_NAME = process.env.PHASE13_M6_3_PROJECT_NAME ?? "";
const EMAIL = process.env.PHASE13_M6_3_SYNTHETIC_EMAIL ?? "";
const PASSWORD = process.env.PHASE13_M6_3_SYNTHETIC_PASSWORD ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function loopback(value: string): boolean {
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

const configured =
  AUTHORIZED &&
  loopback(BASE_URL) &&
  UUID.test(PROJECT_ID) &&
  PROJECT_NAME.length > 0 &&
  EMAIL.length > 0 &&
  PASSWORD.length > 0;

test.skip(
  !configured,
  "M6.3 browser acceptance needs owner authorization, a loopback base URL, a synthetic Project and a synthetic account"
);

test.beforeEach(async ({ page }) => {
  await page.goto(new URL("/login", BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/ai-workspace|\/dashboard/u);
});

async function openProjectStudent500(page: Page) {
  await page.goto(new URL("/ai-workspace", BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });
  // Below the desktop breakpoint the entry panel lives in the History tab;
  // reveal that panel before selecting the Project (never assume it is visible).
  const entryPanel = page.getByTestId("project-entry-panel");
  // The viewport breakpoint resolves after hydration, so retry the reveal instead
  // of assuming the tab exists on the first frame.
  await expect(async () => {
    if (await entryPanel.isVisible()) {
      return;
    }
    // Phase 14-A: below the desktop breakpoint the rail lives inside the shared
    // mobile navigation Sheet, so open it before selecting a Project.
    const mobileNavigation = page.getByTestId("mobile-nav-navigation");
    if (
      (await mobileNavigation.count()) > 0 &&
      (await mobileNavigation.isVisible())
    ) {
      await mobileNavigation.click();
    }
    expect(await entryPanel.isVisible()).toBe(true);
  }).toPass({ timeout: 20_000 });
  await expect(entryPanel).toBeVisible();
  const list = page.getByTestId("workspace-project-list");
  if (!(await list.isVisible())) {
    await page.getByTestId("toggle-project-list").click();
  }
  // Select by the exact persisted Project id, never by a display label.
  const item = page.locator(
    `[data-testid="project-list-item"][title*="${PROJECT_ID}"]`
  );
  await expect(item).toBeVisible();
  await item.click();
  // Enter the Student 500 main-area tab BEFORE asserting its content.
  await page.getByTestId("project-view-student500").click();
  // The Student 500 view container renders first, then its panel content. Both
  // exist at the same time, so assert them in order without an ambiguous `.or()`.
  await expect(page.getByTestId("project-home-student500")).toBeVisible();
  await expect(page.getByTestId("student500-panel")).toBeVisible();
}

/** Create a synthetic application through the UI, or open the seeded one. */
async function openOrCreateApplication(page: Page) {
  const panel = page.getByTestId("student500-panel");
  const openButton = panel.getByTestId("student500-create-open");
  if ((await openButton.count()) > 0) {
    await openButton.click();
    const submit = panel.getByTestId("student500-create-submit");
    if (await submit.isVisible()) {
      await submit.click();
    }
  }
  const entry = panel
    .getByTestId("student500-list")
    .locator('[data-testid^="student500-application-"]')
    .first();
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(panel.getByTestId("student500-detail")).toBeVisible();
  await expect(page.getByTestId("prep-section")).toBeVisible();
}

test("the preparation journey persists a saved provisional GS version", async ({
  page,
}) => {
  await openProjectStudent500(page);
  await openOrCreateApplication(page);

  // Honest disclosures: preliminary screening, unverified sources, no submission.
  // The workspace can be served in either locale, so accept both renderings.
  await expect(page.locator("body")).toContainText(
    /not legal advice|preliminary|not professionally reviewed|不构成法律意见|初步|未经专业审阅/iu
  );
  await expect(page.locator("body")).not.toContainText(
    /submitted to the government|application lodged/iu
  );

  // Preparation panel and provisional GS starter.
  const prep = page.getByTestId("prep-section");
  await expect(prep).toBeVisible();
  if ((await prep.getByTestId("prep-draft-create").count()) > 0) {
    await prep.getByTestId("prep-draft-create").click();
  }
  await expect(prep.getByTestId("prep-draft-history")).toBeVisible();

  // Customer-authored edit, saved as a new immutable version.
  const section = prep.getByTestId("prep-draft-section-future_plans");
  await section.fill("My own independently written sentence.");
  await prep.getByTestId("prep-draft-save").click();
  // Version history renders in the active locale (e.g. "版本 2（客户编辑）").
  await expect(prep.getByTestId("prep-draft-history")).toContainText(
    /v2|version 2|版本 2/iu
  );

  // Reload, re-enter the Project view, and confirm persistence.
  await openProjectStudent500(page);
  await openOrCreateApplication(page);
  await expect(page.getByTestId("prep-section")).toBeVisible();
  await expect(page.locator("body")).toContainText(
    /My own independently written sentence\./u
  );
});

test("bilingual labels and a narrow viewport keep the flow usable", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 390 });
  await openProjectStudent500(page);
  await openOrCreateApplication(page);
  await expect(page.getByTestId("prep-section")).toBeVisible();
  const languageToggle = page
    .getByRole("button", { name: /中文|zh-CN/iu })
    .first();
  if ((await languageToggle.count()) > 0) {
    await languageToggle.click();
    await expect(page.locator("body")).toContainText(/初步|学生签证/u);
  }
  await expect(page.getByTestId("student500-panel")).toBeVisible();
  await expect(page.locator("body")).toContainText(
    /未经核实|未核实|UNKNOWN|unverified/iu
  );
});
