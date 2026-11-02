/**
 * Phase 13 Post-M5 E2E — completion campaign: E2E-13 real browser acceptance.
 *
 * Drives the actual /ai-workspace Project UI with a real Chromium browser and a
 * real NextAuth credential session against the isolated database.
 *
 * The Project list is only populated after the real toggle is expanded, and the
 * synthetic Project is selected by its exact id (never "the first row").
 */
import { expect, type Page, test } from "@playwright/test";

const EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? "";
const PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? "";
const PROJECT_ID = process.env.E2E_PROJECT_ID ?? "";

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/ai-workspace|\/$/u, { timeout: 45_000 });
}

async function selectSyntheticProject(page: Page) {
  await page.goto("/ai-workspace");
  const entry = page.locator('[data-testid="project-entry-panel"]');
  await expect(entry).toBeVisible({ timeout: 45_000 });

  const toggle = page.locator('[data-testid="toggle-project-list"]');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(
    page.locator('[data-testid="workspace-project-list"]')
  ).toBeVisible();

  const row = page.locator(
    `[data-testid="project-list-item"][title$="${PROJECT_ID}"]`
  );
  await expect(row).toHaveCount(1, { timeout: 45_000 });
  await row.click();

  await expect(
    page.locator('[data-testid="school-applications-panel"]')
  ).toBeVisible({
    timeout: 45_000,
  });
  return row;
}

async function createApplication(
  page: Page,
  input: {
    institution: string;
    course: string;
    intake: string;
    institutionId: string;
    courseId: string;
    intakeId: string;
  }
) {
  await page.click('[data-testid="school-application-create-open"]');
  await expect(
    page.locator('[data-testid="school-application-create-form"]')
  ).toBeVisible();
  await page.fill(
    '[data-testid="school-application-create-institutionName"]',
    input.institution
  );
  await page.fill(
    '[data-testid="school-application-create-courseTitle"]',
    input.course
  );
  await page.fill(
    '[data-testid="school-application-create-intakeLabel"]',
    input.intake
  );
  await page.fill(
    '[data-testid="school-application-create-institutionId"]',
    input.institutionId
  );
  await page.fill(
    '[data-testid="school-application-create-courseId"]',
    input.courseId
  );
  await page.fill(
    '[data-testid="school-application-create-intakeId"]',
    input.intakeId
  );
  await page.click('[data-testid="school-application-create-submit"]');
  await expect(
    page.locator('[data-testid="school-application-create-form"]')
  ).toHaveCount(0, {
    timeout: 45_000,
  });
}

test.describe("E2E-13 completion browser journey", () => {
  test.skip(
    !(EMAIL && PASSWORD && PROJECT_ID),
    "E2E browser identity is not configured"
  );

  test("project selection, three applications and admissions panel", async ({
    page,
  }) => {
    await login(page);
    await selectSyntheticProject(page);

    const applications = [
      {
        course: "Master of Information Technology",
        courseId: "nb-master-it",
        institution: "Northbridge University",
        institutionId: "northbridge-university",
        intake: "Semester 1 2027",
        intakeId: "nb-it-2027-s1",
      },
      {
        course: "Master of Data Science",
        courseId: "nb-master-ds",
        institution: "Northbridge University",
        institutionId: "northbridge-university",
        intake: "Semester 1 2027",
        intakeId: "nb-ds-2027-s1",
      },
      {
        course: "Diploma of Business",
        courseId: "rs-diploma-business",
        institution: "Riverside College",
        institutionId: "riverside-college",
        intake: "Semester 2 2027",
        intakeId: "rs-bus-2027-s2",
      },
    ];
    for (const entry of applications) {
      await createApplication(page, entry);
    }

    const list = page.locator('[data-testid="school-application-list"]');
    await expect(list).toBeVisible();
    const items = page.locator('[data-testid="school-application-item"]');
    await expect(items).toHaveCount(applications.length, { timeout: 45_000 });
    await expect(list).toContainText("Master of Information Technology");
    await expect(list).toContainText("Master of Data Science");
    await expect(list).toContainText("Diploma of Business");

    // Open the first application detail and confirm the admissions panel exists.
    await items.first().click();
    await expect(
      page.locator('[data-testid="school-application-detail"]')
    ).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      page.locator('[data-testid="school-admissions-panel"]')
    ).toBeVisible();

    // No false authority copy anywhere on the surface.
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of [
      "submission received",
      "visa approved",
      "offer verified",
      "guaranteed visa",
    ]) {
      expect(body).not.toContain(forbidden);
    }

    await page.screenshot({
      path: "e2e/browser/artifacts/e2e-13-completion-en.png",
      fullPage: false,
    });
  });

  test("Chinese locale renders the same panels in CJK copy", async ({
    page,
  }) => {
    await login(page);
    await selectSyntheticProject(page);
    const switcher = page.locator('[data-testid="site-locale-zh-CN"]');
    await expect(switcher.first()).toBeVisible();
    await switcher.first().click();
    const panel = page.locator('[data-testid="school-applications-panel"]');
    await expect(panel).toBeVisible({ timeout: 45_000 });
    await expect(panel).toContainText(/[\u4e00-\u9fff]/u, { timeout: 45_000 });
    await page.screenshot({
      path: "e2e/browser/artifacts/e2e-13-completion-zh.png",
      fullPage: false,
    });
  });

  test("validation, keyboard traversal and mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await selectSyntheticProject(page);

    // Validation: submit is disabled until the two required fields are present.
    await page.click('[data-testid="school-application-create-open"]');
    const submit = page.locator(
      '[data-testid="school-application-create-submit"]'
    );
    await expect(submit).toBeDisabled();
    await page.fill(
      '[data-testid="school-application-create-institutionName"]',
      "Validation Only University"
    );
    await expect(submit).toBeDisabled();
    await page.fill(
      '[data-testid="school-application-create-courseTitle"]',
      "Validation Only Course"
    );
    await expect(submit).toBeEnabled();

    // Keyboard traversal from the open control reaches another interactive node.
    await page
      .locator('[data-testid="school-application-create-open"]')
      .focus();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(
      () => document.activeElement?.tagName ?? ""
    );
    expect(["BUTTON", "INPUT", "SELECT", "A", "TEXTAREA"]).toContain(focused);

    const box = await page
      .locator('[data-testid="school-applications-panel"]')
      .boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    await page.screenshot({
      path: "e2e/browser/artifacts/e2e-13-completion-mobile.png",
      fullPage: false,
    });
  });
});
