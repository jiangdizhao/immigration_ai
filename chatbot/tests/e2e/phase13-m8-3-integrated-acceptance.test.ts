import { expect, type Page, test } from "@playwright/test";

/**
 * Phase 13 M8.3 - three INDEPENDENT customer-facing E2E journeys.
 *
 * Each journey owns its own seeded Project, application and package state, so no journey
 * depends on another having run, passed or left state behind. There is no serial mode and
 * no skip-as-pass: an unmet precondition fails with an explicit diagnostic.
 *
 *   E2E-1 school self-service    : build M8.1 package -> confirm both statements ->
 *                                  authorize self-service -> reload -> verify identity.
 *   E2E-2 student 500 self-service: pinned GS draft -> build if absent -> confirm both ->
 *                                  authorize -> reload -> verify identity.
 *   E2E-3 managed fail-closed    : confirm the current package, then prove managed service
 *                                  is unavailable, no handoff exists, no managed
 *                                  authorization can be created and no professional
 *                                  approval is claimed.
 *
 * Assertions are structured (package version id, manifest hash, authorization status,
 * handoff state from the authenticated API), not English-only copy.
 */

const AUTHORIZED = process.env.PHASE13_M8_3_BROWSER_AUTHORIZED === "true";
const BASE_URL = process.env.PHASE13_M8_3_BROWSER_BASE_URL ?? "";
const EMAIL = process.env.PHASE13_M8_3_SYNTHETIC_EMAIL ?? "";
const PASSWORD = process.env.PHASE13_M8_3_SYNTHETIC_PASSWORD ?? "";

const SCHOOL_PROJECT_ID = process.env.PHASE13_M8_3_SCHOOL_PROJECT_ID ?? "";
const SCHOOL_TARGET_ID = process.env.PHASE13_M8_3_SCHOOL_TARGET_ID ?? "";
const STUDENT_PROJECT_ID = process.env.PHASE13_M8_3_STUDENT_PROJECT_ID ?? "";
const STUDENT_TARGET_ID = process.env.PHASE13_M8_3_STUDENT500_TARGET_ID ?? "";
const MANAGED_PROJECT_ID = process.env.PHASE13_M8_3_MANAGED_PROJECT_ID ?? "";
const MANAGED_TARGET_ID = process.env.PHASE13_M8_3_MANAGED_TARGET_ID ?? "";

const SCHOOL = "managed_school_application" as const;
const STUDENT = "student_500_visa_application" as const;

/**
 * Affirmative authority claims. Negation-aware and sentence-scoped, because the product's
 * own honest copy legitimately says things like "Not submission ready".
 */
const AFFIRMATIVE_AUTHORITY =
  /professionally approved|lawyer approved|legally approved|submission ready|officially verified|official verification|certified by|专业批准|律师批准|已获批准|官方核实|官方验证/iu;
const NEGATION =
  /\b(not|no|never|cannot|unavailable|without|pending|nor)\b|不|未|无|没|尚未/iu;
const FABRICATED_RECEIPT =
  /official receipt|government receipt|officially submitted|immi account receipt|官方回执|已获官方回执/iu;

const CONFIGURED = Boolean(AUTHORIZED && BASE_URL && EMAIL && PASSWORD);

if (!CONFIGURED) {
  // The runner treats a skip as NOT a pass, so an unconfigured run stays visible.
  // biome-ignore lint/suspicious/noSkippedTests: authorization-pending guard only
  test.skip("M8.3 E2E requires explicit owner authorization", () => {
    // never executed without authorization
  });
}

type PackageView = {
  currentPackage: null | {
    confirmations: {
      confirmationType: string;
      current: boolean;
      finalized: boolean;
    }[];
    manifestSha256: string;
    packageVersionId: string;
    version: number;
  };
};

type AuthorizationView = {
  authorization: null | {
    manifestSha256: string;
    mode: string;
    packageVersionId: string;
    validity: { reasonCodes: string[]; status: string };
  };
  currentPackageVersionId: string | null;
  handoff: null | { handoffId: string; status: string };
  handoffEligibility: { reasonCodes: string[]; status: string };
  modes: {
    managed_service: { available: boolean; readinessStatus?: string };
    self_service: { available: boolean };
  };
  submissionState: string;
};

/** Explicit, diagnosable precondition failure instead of a 30-second locator timeout. */
async function requireTrue(
  condition: unknown,
  page: Page,
  message: string
): Promise<void> {
  if (condition) {
    return;
  }
  const body = (
    await page
      .locator("body")
      .innerText()
      .catch(() => "<none>")
  )
    .replace(/\s+/gu, " ")
    .slice(0, 240);
  let path = page.url();
  try {
    path = new URL(path).pathname;
  } catch {
    // keep the raw URL
  }
  throw new Error(`precondition failed: ${message} (url=${path} ui=${body})`);
}

// ---------------------------------------------------------------- harness helpers

/** Bounded visibility wait that returns a boolean instead of throwing a locator error. */
async function waitVisible(
  locator: ReturnType<Page["getByTestId"]>,
  timeout = 20_000
): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function signIn(page: Page): Promise<void> {
  await page.goto(new URL("/login", BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });
  const emailInput = page.getByLabel(/email/i);
  const passwordInput = page.getByLabel(/password/i);
  await requireTrue(
    (await emailInput.count()) === 1 && (await passwordInput.count()) === 1,
    page,
    "the credentials form is a required harness precondition"
  );
  await emailInput.fill(EMAIL);
  await passwordInput.fill(PASSWORD);
  await page
    .getByRole("button", { name: /sign in|登录|登入/iu })
    .first()
    .click();
  await page.waitForURL(
    /\/(ai-workspace|dashboard|admin-portal|lawyer-portal)(?:[/?#]|$)/u,
    { timeout: 30_000 }
  );
  const session = await page.request.get(
    new URL("/api/auth/session", BASE_URL).toString()
  );
  const body = (await session.json()) as { user?: { id?: string } } | null;
  await requireTrue(
    body?.user?.id,
    page,
    "the synthetic credential must produce a real authenticated session"
  );
  // Warm-up only (results discarded): `next dev` compiles these routes on first use, and
  // a cold compile must never masquerade as a product failure.
  await Promise.all(
    [
      packagesUrl(SCHOOL_PROJECT_ID, SCHOOL, SCHOOL_TARGET_ID),
      packagesUrl(STUDENT_PROJECT_ID, STUDENT, STUDENT_TARGET_ID),
      authorizationUrl(SCHOOL_PROJECT_ID, SCHOOL, SCHOOL_TARGET_ID),
      authorizationUrl(MANAGED_PROJECT_ID, STUDENT, MANAGED_TARGET_ID),
    ].map((url) =>
      page.request
        .get(new URL(url, BASE_URL).toString(), { timeout: 60_000 })
        .catch(() => undefined)
    )
  );
}

async function openProject(page: Page, projectId: string): Promise<void> {
  await page.goto(new URL("/ai-workspace", BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });
  await requireTrue(
    await waitVisible(page.getByTestId("project-entry-panel"), 30_000),
    page,
    "the workspace entry panel must render"
  );
  const list = page.getByTestId("workspace-project-list");
  if (!(await list.isVisible().catch(() => false))) {
    await page.getByTestId("toggle-project-list").click();
  }
  const item = page.locator(
    `[data-testid="project-list-item"][title*="${projectId}"]`
  );
  await requireTrue(
    (await item.count()) === 1,
    page,
    `the seeded Project ${projectId} must be listed for its owner`
  );
  await item.click();
}

/** Opens the school application surface for this journey's Project. */
async function openSchoolApplication(page: Page, projectId: string) {
  await openProject(page, projectId);
  const applications = page.getByTestId("project-view-applications");
  await requireTrue(
    (await applications.count()) === 1,
    page,
    "the applications view must be available in the Project workspace"
  );
  await applications.click();
  const panel = page.getByTestId("school-applications-panel");
  const entry = panel.getByTestId("school-application-item").first();
  await requireTrue(
    await entry.isVisible({ timeout: 20_000 }).catch(() => false),
    page,
    "the seeded M5.1 school application must be listed"
  );
  await entry.click();
  await requireTrue(
    await panel
      .getByTestId("school-application-detail")
      .isVisible({ timeout: 20_000 })
      .catch(() => false),
    page,
    "the school application detail must open"
  );
  return panel;
}

/** Opens the Student 500 surface for this journey's Project. */
async function openStudentApplication(page: Page, projectId: string) {
  await openProject(page, projectId);
  const view = page.getByTestId("project-view-student500");
  await requireTrue(
    (await view.count()) === 1,
    page,
    "the Student 500 view must be available in the Project workspace"
  );
  await view.click();
  const panel = page.getByTestId("student500-panel");
  const entry = panel
    .getByTestId("student500-list")
    .locator('[data-testid^="student500-application-"]')
    .first();
  await requireTrue(
    await entry.isVisible({ timeout: 20_000 }).catch(() => false),
    page,
    "the seeded M6.1 Student 500 application must be listed"
  );
  await entry.click();
  await requireTrue(
    await panel
      .getByTestId("student500-detail")
      .isVisible({ timeout: 20_000 })
      .catch(() => false),
    page,
    "the Student 500 detail must open"
  );
  return panel;
}

function packagesUrl(
  projectId: string,
  kind: string,
  targetId: string
): string {
  return `/api/projects/${projectId}/submission-packages?targetKind=${kind}&targetId=${targetId}`;
}

function authorizationUrl(
  projectId: string,
  kind: string,
  targetId: string
): string {
  return `/api/projects/${projectId}/submission-authorization?targetKind=${kind}&targetId=${targetId}`;
}

async function readPackageView(
  page: Page,
  projectId: string,
  kind: string,
  targetId: string
): Promise<PackageView> {
  const response = await page.request.get(
    new URL(packagesUrl(projectId, kind, targetId), BASE_URL).toString()
  );
  await requireTrue(
    response.ok(),
    page,
    `the M8.1 package API must answer for the owner (status ${response.status()})`
  );
  return (await response.json()) as PackageView;
}

async function readAuthorizationView(
  page: Page,
  projectId: string,
  kind: string,
  targetId: string
): Promise<AuthorizationView> {
  const response = await page.request.get(
    new URL(authorizationUrl(projectId, kind, targetId), BASE_URL).toString()
  );
  await requireTrue(
    response.ok(),
    page,
    `the M8.2 authorization API must answer for the owner (status ${response.status()})`
  );
  return (await response.json()) as AuthorizationView;
}

/**
 * Builds the M8.1 submission package through the real UI when the surface offers it,
 * then confirms both statements when the authoritative view says either is missing or not
 * current. A missing M8.1 package is a valid initial state and never an error.
 */
async function buildAndConfirm(
  page: Page,
  projectId: string,
  kind: typeof SCHOOL | typeof STUDENT,
  targetId: string
): Promise<{ manifestSha256: string; packageVersionId: string }> {
  const section = page.getByTestId("submission-package-section");
  await requireTrue(
    await waitVisible(section, 30_000),
    page,
    "the M8.1 submission package section must be enabled in this run"
  );
  await requireTrue(
    (await section.getByTestId("submission-package-unavailable").count()) === 0,
    page,
    "the M8.1 feature flag and migration 0051 must be present"
  );
  await requireTrue(
    (await section.getByTestId("submission-package-error").count()) === 0,
    page,
    "the M8.1 section must not be in an error state"
  );

  let view = await readPackageView(page, projectId, kind, targetId);
  if (!view.currentPackage) {
    const build = section.getByTestId("submission-package-build");
    await requireTrue(
      await build.isVisible({ timeout: 20_000 }).catch(() => false),
      page,
      "an absent M8.1 package must be buildable from the surface"
    );
    await build.click();
    await expect(section.getByTestId("submission-package-current")).toBeVisible(
      {
        timeout: 30_000,
      }
    );
    view = await readPackageView(page, projectId, kind, targetId);
    await requireTrue(
      view.currentPackage,
      page,
      "building must produce a current M8.1 package version"
    );
  }

  for (const [type, consent, confirm] of [
    [
      "package_content_review",
      "submission-package-consent-content",
      "submission-package-confirm-content",
    ],
    [
      "customer_declarations",
      "submission-package-consent-declarations",
      "submission-package-confirm-declarations",
    ],
  ] as const) {
    const already = view.currentPackage?.confirmations.some(
      (entry) =>
        entry.confirmationType === type && entry.current && entry.finalized
    );
    if (already) {
      continue;
    }
    const consentBox = section.getByTestId(consent);
    const confirmButton = section.getByTestId(confirm);
    await requireTrue(
      (await confirmButton.count()) === 1,
      page,
      `the ${type} confirmation control must be offered`
    );
    await expect(confirmButton).toBeDisabled();
    await consentBox.check();
    await expect(confirmButton).toBeEnabled({ timeout: 15_000 });
    await confirmButton.click();
    await expect(
      section.getByTestId("submission-package-confirmed").first()
    ).toBeVisible({ timeout: 30_000 });
    view = await readPackageView(page, projectId, kind, targetId);
  }

  const current = view.currentPackage;
  if (!current) {
    await requireTrue(
      false,
      page,
      "a current package version must exist after building"
    );
    throw new Error("unreachable: a current package version is required");
  }
  const contentConfirmed = current.confirmations.some(
    (entry) =>
      entry.confirmationType === "package_content_review" &&
      entry.current &&
      entry.finalized
  );
  const declarationsConfirmed = current.confirmations.some(
    (entry) =>
      entry.confirmationType === "customer_declarations" &&
      entry.current &&
      entry.finalized
  );
  await requireTrue(
    contentConfirmed && declarationsConfirmed,
    page,
    "both current confirmations must be effective and finalized before authorizing"
  );
  return {
    manifestSha256: current.manifestSha256,
    packageVersionId: current.packageVersionId,
  };
}

/** Authorizes self-service for the current version through the real UI. */
async function authorizeSelfService(page: Page): Promise<void> {
  const section = page.getByTestId("submission-authorization-section");
  await requireTrue(
    await waitVisible(section, 30_000),
    page,
    "the M8.2 authorization section must be enabled in this run"
  );
  await requireTrue(
    (await section
      .getByTestId("submission-authorization-unavailable")
      .count()) === 0,
    page,
    "the M8.2 feature flag and migration 0052 must be present"
  );
  const panel = section.getByTestId(
    "submission-authorization-self_service-panel"
  );
  await requireTrue(
    await waitVisible(panel, 30_000),
    page,
    "self-service must be offered for a current, fully confirmed package"
  );
  const consent = section.getByTestId(
    "submission-authorization-consent-self_service"
  );
  const button = section.getByTestId(
    "submission-authorization-authorize-self_service"
  );
  await expect(button).toBeDisabled();
  await consent.check();
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
  // The external-record action is only offered for an effective authorization.
  await expect(
    section.getByTestId("submission-authorization-record-external")
  ).toBeVisible({ timeout: 30_000 });
}

/** No affirmative authority claim and no fabricated official receipt anywhere. */
async function assertTruthful(page: Page): Promise<void> {
  const body = await page.locator("body").innerText();
  const claims = body
    .split(/[.!?;。！？；\n]+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .filter(
      (sentence) =>
        AFFIRMATIVE_AUTHORITY.test(sentence) && !NEGATION.test(sentence)
    );
  expect(claims, `fabricated authority claims: ${claims.join(" | ")}`).toEqual(
    []
  );
  expect(
    FABRICATED_RECEIPT.test(body),
    "no M8 surface may claim an official receipt or a completed official submission"
  ).toBe(false);
}

// ---------------------------------------------------------------- journeys

test("E2E-1 school self-service: build, confirm both statements, authorize, persist", async ({
  page,
}) => {
  test.skip(!CONFIGURED, "owner authorization and seeded fixtures required");
  await signIn(page);

  await openSchoolApplication(page, SCHOOL_PROJECT_ID);
  const confirmed = await buildAndConfirm(
    page,
    SCHOOL_PROJECT_ID,
    SCHOOL,
    SCHOOL_TARGET_ID
  );

  await authorizeSelfService(page);
  const authorized = await readAuthorizationView(
    page,
    SCHOOL_PROJECT_ID,
    SCHOOL,
    SCHOOL_TARGET_ID
  );
  await requireTrue(
    authorized.authorization?.mode === "self_service",
    page,
    "a self-service authorization must be recorded"
  );
  expect(authorized.authorization?.validity.status).toBe("effective");
  expect(authorized.authorization?.packageVersionId).toBe(
    authorized.currentPackageVersionId
  );
  expect(authorized.authorization?.packageVersionId).toBe(
    confirmed.packageVersionId
  );
  expect(authorized.authorization?.manifestSha256).toBe(
    confirmed.manifestSha256
  );
  expect(authorized.submissionState).toBe("not_submitted");
  await assertTruthful(page);

  // Reload: the decision is durable and still bound to the same exact version.
  await page.reload({ waitUntil: "domcontentloaded" });
  await requireTrue(
    await page
      .getByTestId("submission-authorization-section")
      .getByTestId("submission-authorization-record-external")
      .isVisible({ timeout: 30_000 })
      .catch(() => false),
    page,
    "the authorization must survive a reload"
  );
  const afterReload = await readAuthorizationView(
    page,
    SCHOOL_PROJECT_ID,
    SCHOOL,
    SCHOOL_TARGET_ID
  );
  expect(afterReload.authorization?.validity.status).toBe("effective");
  expect(afterReload.authorization?.packageVersionId).toBe(
    confirmed.packageVersionId
  );
  expect(afterReload.authorization?.manifestSha256).toBe(
    confirmed.manifestSha256
  );
  await assertTruthful(page);
});

test("E2E-2 student 500 self-service: pinned GS draft, both confirmations, persisted authorization", async ({
  page,
}) => {
  test.skip(!CONFIGURED, "owner authorization and seeded fixtures required");
  await signIn(page);

  await openStudentApplication(page, STUDENT_PROJECT_ID);
  // The reviewed content is the exact pinned GS draft, not the latest one.
  const packageSection = page.getByTestId("submission-package-section");
  await requireTrue(
    await packageSection
      .getByTestId("submission-package-review")
      .isVisible({ timeout: 20_000 })
      .catch(() => false),
    page,
    "the pinned GS draft review must be shown for this package"
  );

  const confirmed = await buildAndConfirm(
    page,
    STUDENT_PROJECT_ID,
    STUDENT,
    STUDENT_TARGET_ID
  );
  await authorizeSelfService(page);

  const authorized = await readAuthorizationView(
    page,
    STUDENT_PROJECT_ID,
    STUDENT,
    STUDENT_TARGET_ID
  );
  expect(authorized.authorization?.validity.status).toBe("effective");
  expect(authorized.authorization?.packageVersionId).toBe(
    confirmed.packageVersionId
  );
  expect(authorized.authorization?.manifestSha256).toBe(
    confirmed.manifestSha256
  );
  // Honest submission disclaimers stay visible on the page.
  await expect(
    packageSection.getByTestId("submission-package-disclosures")
  ).toBeVisible();
  await assertTruthful(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  const afterReload = await readAuthorizationView(
    page,
    STUDENT_PROJECT_ID,
    STUDENT,
    STUDENT_TARGET_ID
  );
  expect(afterReload.authorization?.validity.status).toBe("effective");
  expect(afterReload.authorization?.packageVersionId).toBe(
    confirmed.packageVersionId
  );
  await requireTrue(
    await page
      .getByTestId("submission-authorization-section")
      .getByTestId("submission-authorization-record-external")
      .isVisible({ timeout: 30_000 })
      .catch(() => false),
    page,
    "the authorization must survive a reload"
  );
  await assertTruthful(page);
});

test("E2E-3 managed service fails closed without production professional authority", async ({
  page,
}) => {
  test.skip(!CONFIGURED, "owner authorization and seeded fixtures required");
  await signIn(page);

  await openStudentApplication(page, MANAGED_PROJECT_ID);
  // A current, fully confirmed package: the only reason managed service can be
  // unavailable is the absent production professional authority / M4 readiness.
  const confirmed = await buildAndConfirm(
    page,
    MANAGED_PROJECT_ID,
    STUDENT,
    MANAGED_TARGET_ID
  );

  const view = await readAuthorizationView(
    page,
    MANAGED_PROJECT_ID,
    STUDENT,
    MANAGED_TARGET_ID
  );
  expect(view.currentPackageVersionId).toBe(confirmed.packageVersionId);
  expect(view.modes.self_service.available).toBe(true);
  expect(view.modes.managed_service.available).toBe(false);
  expect(view.handoffEligibility.status).not.toBe("eligible");
  expect(view.handoff).toBeNull();

  const section = page.getByTestId("submission-authorization-section");
  await requireTrue(
    await waitVisible(section, 30_000),
    page,
    "the M8.2 authorization section must be enabled in this run"
  );
  await requireTrue(
    (await section
      .getByTestId("submission-authorization-managed-unavailable")
      .count()) === 1,
    page,
    "the surface must state that managed service is unavailable, with a reason"
  );
  // No managed authorization control and no handoff control is offered.
  for (const testId of [
    "submission-authorization-authorize-managed_service",
    "submission-authorization-request-handoff",
    "submission-authorization-handoff-status",
  ]) {
    await requireTrue(
      (await section.getByTestId(testId).count()) === 0,
      page,
      `the surface must not offer ${testId} without an effective managed path`
    );
  }

  // Protected operations are refused by the server, not merely hidden in the UI.
  const endpoint = new URL(
    authorizationUrl(MANAGED_PROJECT_ID, STUDENT, MANAGED_TARGET_ID),
    BASE_URL
  ).toString();
  const managed = await page.request.post(endpoint, {
    data: {
      acknowledgedDisclosures: [],
      action: "authorize_managed_service",
      operationId: `e2e3-managed-${Date.now()}`,
      packageVersionId: confirmed.packageVersionId,
      targetId: MANAGED_TARGET_ID,
      targetKind: STUDENT,
    },
  });
  expect(
    managed.status(),
    `a managed authorization must be refused, got ${managed.status()}`
  ).toBeGreaterThanOrEqual(400);
  const managedBody = (await managed.json().catch(() => ({}))) as {
    code?: string;
  };
  expect([
    "professional_review_missing",
    "professional_authority_denied",
    "professional_authority_unavailable",
    "professional_credential_unverified",
    "professional_credential_unavailable",
    "readiness_not_ready",
    "readiness_unknown",
    "disclosure_not_acknowledged",
  ]).toContain(managedBody.code);

  const handoff = await page.request.post(endpoint, {
    data: {
      action: "request_handoff",
      operationId: `e2e3-handoff-${Date.now()}`,
      packageVersionId: confirmed.packageVersionId,
      targetId: MANAGED_TARGET_ID,
      targetKind: STUDENT,
    },
  });
  expect(
    handoff.status(),
    `a handoff request must be refused, got ${handoff.status()}`
  ).toBeGreaterThanOrEqual(400);

  const after = await readAuthorizationView(
    page,
    MANAGED_PROJECT_ID,
    STUDENT,
    MANAGED_TARGET_ID
  );
  expect(after.handoff).toBeNull();
  expect(
    after.authorization === null ||
      after.authorization.mode !== "managed_service"
  ).toBe(true);
  expect(after.submissionState).toBe("not_submitted");
  await assertTruthful(page);
});
