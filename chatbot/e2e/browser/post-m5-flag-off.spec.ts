/**
 * Phase 13 Post-M5 E2E — E2E-13 feature-OFF boundary.
 *
 * Runs against a SEPARATE isolated server process started without the three
 * Phase 13 flags, using a real authenticated HTTP boundary.
 */
import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? "";
const PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? "";
const PROJECT_ID = process.env.E2E_PROJECT_ID ?? "";

test.skip(!(EMAIL && PASSWORD && PROJECT_ID), "E2E identity is not configured");

test("feature-OFF server hides the M5 surface and returns 503", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/ai-workspace|\/$/u, { timeout: 45_000 });

  await page.goto("/ai-workspace");
  await expect(page.locator('[data-testid="project-entry-panel"]')).toBeVisible(
    { timeout: 45_000 }
  );
  // The M5 panels must be absent when the capability is disabled.
  await expect(
    page.locator('[data-testid="school-applications-panel"]')
  ).toHaveCount(0);
  await expect(
    page.locator('[data-testid="school-admissions-panel"]')
  ).toHaveCount(0);

  const response = await request.get(
    `/api/projects/${PROJECT_ID}/school-applications`
  );
  expect([404, 503]).toContain(response.status());
  expect(response.status()).toBe(503);
});
