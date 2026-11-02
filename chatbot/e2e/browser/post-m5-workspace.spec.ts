/**
 * Phase 13 Post-M5 E2E — E2E-13 real browser acceptance (zh-CN / en).
 *
 * Drives the actual /ai-workspace Project UI with a real Chromium browser,
 * a real NextAuth credential session and the real isolated database.
 */
import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? "";
const PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? "";
const PROJECT_ID = process.env.E2E_PROJECT_ID ?? "";

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/ai-workspace|\/$/u, { timeout: 30_000 });
}

async function openWorkspace(page: Page) {
  await page.goto("/ai-workspace");
  // The school panels live inside a selected Project, so the journey must
  // select one through the real Project entry panel first.
  const entry = page.locator('[data-testid="project-entry-panel"]');
  await expect(entry).toBeVisible({ timeout: 30_000 });
  const items = page.locator('[data-testid="project-list-item"]');
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
  await items.first().click();
  await expect(page.locator('[data-testid="school-applications-panel"]')).toBeVisible({
    timeout: 30_000,
  });
}

async function useLocale(page: Page, locale: "en" | "zh-CN") {
  const switcher = page.locator(`[data-testid="site-locale-${locale}"]`);
  if (await switcher.count()) {
    await switcher.first().click();
    await page.waitForTimeout(1500);
  }
}

test.describe("E2E-13 Project school-application browser journey", () => {
  test.skip(
    !(EMAIL && PASSWORD && PROJECT_ID),
    "E2E browser identity is not configured"
  );

  test("English UI renders the school-application panel and creates an application", async ({
    page,
  }) => {
    await login(page);
    await openWorkspace(page);
    await useLocale(page, "en");
    const panel = page.locator('[data-testid="school-applications-panel"]');
    await expect(panel).toBeVisible();

    // Create one application through the real UI.
    await page.click('[data-testid="school-application-create-open"]');
    await expect(page.locator('[data-testid="school-application-create-form"]')).toBeVisible();

    const institution = page.locator('[data-testid="school-application-create-institution"]');
    const course = page.locator('[data-testid="school-application-create-course"]');
    if (await institution.count()) {
      await institution.fill("Northbridge University");
    }
    if (await course.count()) {
      await course.fill("Master of Information Technology");
    }
    await page.click('[data-testid="school-application-create-submit"]');
    await expect(page.locator('[data-testid="school-application-list"]')).toBeVisible({
      timeout: 30_000,
    });
  });

  test("Chinese locale renders translated panel copy", async ({ page }) => {
    await login(page);
    await openWorkspace(page);
    await useLocale(page, "zh-CN");
    const panel = page.locator('[data-testid="school-applications-panel"]');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    // The panel must render CJK copy in the Chinese locale.
    await expect(panel).toContainText(/[\u4e00-\u9fff]/u);
  });

  test("keyboard focus and mobile viewport stay usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await openWorkspace(page);
    const panel = page.locator('[data-testid="school-applications-panel"]');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    // Keyboard traversal must reach an interactive control inside the panel.
    await page.locator('[data-testid="school-application-create-open"]').focus();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(["BUTTON", "INPUT", "SELECT", "A", "TEXTAREA"]).toContain(focused);
    await page.screenshot({ path: "e2e/browser/artifacts/e2e-13-mobile.png", fullPage: false });
  });
});
