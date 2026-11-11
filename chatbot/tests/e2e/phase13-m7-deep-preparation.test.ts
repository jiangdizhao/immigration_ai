import { expect, type Page, test } from "@playwright/test";

/**
 * Phase 13 M7 - browser acceptance of the deep preparation surface.
 *
 * Runs only against an explicitly authorized loopback synthetic environment; without
 * the markers it self-skips, which the runner reports as PENDING - never as a pass.
 *
 * Real navigation (verified against source):
 *   /ai-workspace -> project-entry-panel -> workspace-project-list -> project-list-item
 *   -> project-view-student500 -> student500-panel -> student500-create-open/submit
 *   -> student500-list entry -> student500-detail -> prep-section (M6 drafts)
 *   -> student500-deep-section (M7: proposal, accept, consent, review)
 */

const AUTHORIZED = process.env.PHASE13_M7_BROWSER_AUTHORIZED === "true";
const BASE_URL = process.env.PHASE13_M7_BROWSER_BASE_URL ?? "";
const PROJECT_ID = process.env.PHASE13_M7_PROJECT_ID ?? "";
const EMAIL = process.env.PHASE13_M7_SYNTHETIC_EMAIL ?? "";
const PASSWORD = process.env.PHASE13_M7_SYNTHETIC_PASSWORD ?? "";
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
  EMAIL.length > 0 &&
  PASSWORD.length > 0;

test.skip(
  !configured,
  "M7 browser acceptance needs owner authorization, a loopback base URL, a synthetic Project and a synthetic account"
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

async function openDeepPreparation(page: Page): Promise<void> {
  await page.goto(new URL("/ai-workspace", BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });
  const entryPanel = page.getByTestId("project-entry-panel");
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
  const list = page.getByTestId("workspace-project-list");
  if (!(await list.isVisible())) {
    await page.getByTestId("toggle-project-list").click();
  }
  const item = page.locator(
    `[data-testid="project-list-item"][title*="${PROJECT_ID}"]`
  );
  await expect(item).toBeVisible();
  await item.click();
  await page.getByTestId("project-view-student500").click();
  await expect(page.getByTestId("project-home-student500")).toBeVisible();
  const panel = page.getByTestId("student500-panel");
  await expect(panel).toBeVisible();

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

  // M6 drafts are the base of every M7 proposal.
  const prep = page.getByTestId("prep-section");
  await expect(prep).toBeVisible();
  if ((await prep.getByTestId("prep-draft-create").count()) > 0) {
    await prep.getByTestId("prep-draft-create").click();
  }
  await expect(prep.getByTestId("prep-draft-history")).toBeVisible();
  await expect(page.getByTestId("student500-deep-section")).toBeVisible();
}

test("proposal, acceptance and the saved draft complete in the real UI", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await openDeepPreparation(page);
  const deep = page.getByTestId("student500-deep-section");

  // No approval or submission claim anywhere on the surface.
  await expect(deep.getByTestId("student500-deep-submission")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /professionally approved|lawyer approved|submission ready|已提交|专业批准/iu
  );

  // Propose, then accept into a new immutable M6 draft.
  await deep.getByTestId("student500-deep-propose").click();
  await expect(deep.getByTestId("student500-deep-proposal")).toBeVisible();
  await deep.getByTestId("student500-deep-accept").click();
  // The decision is terminal inside the deep-preparation view itself.
  await expect(deep.getByTestId("student500-deep-proposal")).toContainText(
    /accepted|已接受/iu
  );

  // Reload: the accepted proposal AND the new current M6 draft both survive. The M6
  // panel keeps its own snapshot, so the new version is observed after the reload
  // rather than through an auto-refresh it does not perform.
  await openDeepPreparation(page);
  await expect(page.getByTestId("prep-section")).toContainText(/v2|版本 2/iu);
  const reloaded = page.getByTestId("student500-deep-section");
  await expect(
    reloaded.getByTestId("student500-deep-consent-draft")
  ).toContainText(/v2/iu);
  // The existing M6 surface is intact.
  await expect(page.getByTestId("prep-draft-history")).toBeVisible();

  expect(
    consoleErrors.filter((text) => !/favicon|503|401/u.test(text)),
    `unexpected browser errors: ${consoleErrors.join(" | ")}`
  ).toEqual([]);
});

test("consent is unchecked, disclosed and required before a review request", async ({
  page,
}) => {
  await openDeepPreparation(page);
  const deep = page.getByTestId("student500-deep-section");

  // The disclosure scope is visible BEFORE any consent action.
  await expect(deep.getByTestId("student500-deep-consent-draft")).toBeVisible();
  await expect(deep.getByTestId("student500-deep-consent-facts")).toBeVisible();
  const checkbox = deep.getByTestId("student500-deep-consent-checkbox");
  await expect(checkbox).not.toBeChecked();
  const request = deep.getByTestId("student500-deep-request-review");
  await expect(request).toBeDisabled();

  // Consent is a real gate: the button cannot be used while it is unchecked.
  await request.click({ force: true }).catch(() => undefined);
  await expect(request).toBeDisabled();

  await checkbox.check();
  await expect(request).toBeEnabled();
  await request.click();

  // Professional authority is unavailable by design; the UI must show that state
  // instead of implying that somebody reviewed the draft.
  await expect(deep.getByTestId("student500-deep-editorial")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /professionally approved|lawyer approved|submission ready/iu
  );
});

test("the Chinese interface renders the Chinese deep preparation surface", async ({
  page,
}) => {
  await openDeepPreparation(page);
  const toggle = page
    .getByRole("button", { name: /中文|zh-CN|zh-Hans/iu })
    .first();
  if ((await toggle.count()) > 0) {
    await toggle.click();
    await page.waitForLoadState("domcontentloaded");
  }
  await expect(page.locator("html")).toHaveAttribute("lang", /zh/iu);
  const deep = page.getByTestId("student500-deep-section");
  await expect(deep).toContainText(
    /申请专业审核前请确认|申請專業審核前請確認/u
  );
  await expect(
    deep.getByTestId("student500-deep-consent-checkbox")
  ).not.toBeChecked();
  await expect(
    deep.getByTestId("student500-deep-request-review")
  ).toBeDisabled();
  await expect(page.getByTestId("prep-section")).toBeVisible();
});
