import {
  type Browser,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

/**
 * Phase 13 M8.1 - consolidated Chromium acceptance of the submission package surface.
 *
 * Five genuine journeys against ONE disposable PostgreSQL 17 database seeded with the
 * real M5.1/M6.1/M6.2 services:
 *   A. school application: build -> inspect frozen content -> confirm -> reload
 *   B. student 500: build -> inspect the exact pinned GS draft -> confirm both
 *      statements separately -> reload
 *   C. version invalidation: change the application through the real workflow, prove the
 *      old confirmation is unusable and BOTH consents require a new affirmative action
 *   D. security: an unrelated synthetic customer cannot reach the protected surface
 *   E. truthful state: Chinese and English UI, and no fabricated authority anywhere
 *
 * Runs only against an explicitly authorized loopback environment. Missing fixtures, a
 * disabled feature flag, a missing control, an unauthenticated session or unavailable
 * data make a journey FAIL - never skip and never pass. The runner additionally
 * requires expected=5 unexpected=0 skipped=0 flaky=0.
 */

const AUTHORIZED = process.env.PHASE13_M8_1_BROWSER_AUTHORIZED === "true";
const BASE_URL = process.env.PHASE13_M8_1_BROWSER_BASE_URL ?? "";
const PROJECT_ID = process.env.PHASE13_M8_1_PROJECT_ID ?? "";
const SCHOOL_TARGET_ID = process.env.PHASE13_M8_1_SCHOOL_TARGET_ID ?? "";
const STUDENT_TARGET_ID = process.env.PHASE13_M8_1_STUDENT500_TARGET_ID ?? "";
const OUTSIDER_PROJECT_ID = process.env.PHASE13_M8_1_OUTSIDER_PROJECT_ID ?? "";
const OUTSIDER_EMAIL = process.env.PHASE13_M8_1_OUTSIDER_EMAIL ?? "";
const EMAIL = process.env.PHASE13_M8_1_SYNTHETIC_EMAIL ?? "";
const PASSWORD = process.env.PHASE13_M8_1_SYNTHETIC_PASSWORD ?? "";
/** The GS draft version the harness actually seeded (fixture-driven assertion). */
const GS_DRAFT_VERSION = Number.parseInt(
  process.env.PHASE13_M8_1_GS_DRAFT_VERSION ?? "",
  10
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Affirmative authority claims. Matching is sentence-scoped and negation-aware,
 * because the product's own honest copy legitimately says things like
 * "Not submission ready" or "尚不可提交" - those are disclaimers, not claims.
 */
const AFFIRMATIVE_AUTHORITY =
  /professionally approved|lawyer approved|legally approved|submission ready|officially verified|official verification|certified by|专业批准|律师批准|已获批准|官方核实|官方验证/iu;
const NEGATION =
  /\b(not|no|never|cannot|unavailable|without|pending|nor)\b|不|未|无|没|尚未/iu;

/** Sentence-scoped scan: a negated or hedged sentence is a disclaimer, not a claim. */
function authorityViolations(text: string): string[] {
  return text
    .split(/[.!?;。！？；\n]+/u)
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        sentence.length > 0 &&
        AFFIRMATIVE_AUTHORITY.test(sentence) &&
        !NEGATION.test(sentence)
    )
    .slice(0, 3)
    .map((sentence) => sentence.slice(0, 120));
}

function submissionPackagesUrl(kind: string, targetId: string): string {
  return new URL(
    `/api/projects/${PROJECT_ID}/submission-packages?targetKind=${kind}&targetId=${targetId}`,
    BASE_URL
  ).toString();
}

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
  UUID.test(SCHOOL_TARGET_ID) &&
  UUID.test(STUDENT_TARGET_ID) &&
  UUID.test(OUTSIDER_PROJECT_ID) &&
  OUTSIDER_EMAIL.length > 0 &&
  Number.isInteger(GS_DRAFT_VERSION) &&
  GS_DRAFT_VERSION > 0 &&
  EMAIL.length > 0 &&
  PASSWORD.length > 0;

test.skip(
  !configured,
  "M8.1 browser acceptance needs owner authorization, a loopback base URL, the seeded Project/targets and both synthetic accounts"
);

test.beforeEach(async ({ page }) => {
  await signIn(page, EMAIL);
});

/** Session state read from the real NextAuth session endpoint (never a mock). */
type SessionState = {
  readonly detail: string;
  readonly state: "present" | "absent" | "unknown";
  readonly type: string;
};

async function readSession(page: Page): Promise<SessionState> {
  try {
    const response = await page.request.get(
      new URL("/api/auth/session", BASE_URL).toString()
    );
    if (!response.ok()) {
      return {
        detail: `session endpoint returned ${response.status()}`,
        state: "unknown",
        type: "",
      };
    }
    const payload = (await response.json().catch(() => null)) as {
      user?: { type?: string };
    } | null;
    if (payload?.user) {
      return {
        detail: "session cookie accepted",
        state: "present",
        type: payload.user.type ?? "",
      };
    }
    return { detail: "no session user", state: "absent", type: "" };
  } catch (error) {
    return {
      detail: `session probe failed: ${describeError(error)}`,
      state: "unknown",
      type: "",
    };
  }
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0]?.slice(0, 160) ?? "unknown";
}

function sanitize(value: string): string {
  let text = value;
  if (PASSWORD.length > 0) {
    text = text.split(PASSWORD).join("<redacted>");
  }
  return text.replace(/postgres(?:ql)?:\/\/[^\s]+/gu, "postgres://<redacted>");
}

/**
 * Credential-free diagnosis of a sign-in attempt. The password and any hash are never
 * included: only the URL, UI signal text, session state and HTTP statuses.
 */
async function loginDiagnostics(
  page: Page,
  httpErrors: readonly string[]
): Promise<string> {
  const url = page.url();
  let path = url;
  try {
    const parsed = new URL(url);
    path = `${parsed.pathname}${parsed.search}`;
  } catch {
    // keep the raw value
  }
  const body = await page
    .locator("body")
    .innerText({ timeout: 5000 })
    .catch(() => "");
  const text = sanitize(body);
  const invalidCredentials = /invalid credentials/iu.test(text);
  const validationError = /failed validating your submission/iu.test(text);
  const fieldErrors = await page
    .locator("#email, #password")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node as HTMLInputElement)
        .filter((input) => !input.checkValidity())
        .map((input) => `${input.name}:${input.validationMessage.slice(0, 80)}`)
    )
    .catch(() => [] as string[]);
  const session = await readSession(page);
  const uiHit = text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        /invalid|failed|error|验证|无效|失败/iu.test(line) && line.length > 0
    )
    .slice(0, 2)
    .join(" | ");
  return [
    `url=${path}`,
    `session=${session.state}${session.type ? ` type=${session.type}` : ""} (${session.detail})`,
    `invalidCredentials=${invalidCredentials ? "yes" : "no"}`,
    `validationError=${validationError ? "yes" : "no"}`,
    `fieldErrors=${fieldErrors.length > 0 ? fieldErrors.join(",") : "none"}`,
    `http=${httpErrors.length > 0 ? httpErrors.slice(0, 4).join(",") : "none"}`,
    `ui=${uiHit.length > 0 ? uiHit.slice(0, 200) : "none"}`,
  ].join(" ");
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto(new URL("/login", BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });
  const emailInput = page.getByLabel(/email/i);
  const passwordInput = page.getByLabel(/password/i);
  if ((await emailInput.count()) === 0 || (await passwordInput.count()) === 0) {
    throw new Error(
      `login form not found at ${page.url()}: the credentials form is a required harness precondition`
    );
  }
  await emailInput.fill(email);
  await passwordInput.fill(PASSWORD);

  const httpErrors: string[] = [];
  const onResponse = (response: {
    status: () => number;
    url: () => string;
  }) => {
    const status = response.status();
    if (status >= 400 && httpErrors.length < 8) {
      let where = "";
      try {
        where = new URL(response.url()).pathname;
      } catch {
        where = "unknown";
      }
      httpErrors.push(`${status} ${where}`);
    }
  };
  page.on("response", onResponse);
  try {
    await page
      .getByRole("button", { name: /sign in/iu })
      .first()
      .click();
    try {
      await page.waitForURL(
        /\/(ai-workspace|dashboard|admin-portal|lawyer-portal)(?:[/?#]|$)/u,
        { timeout: 30_000 }
      );
    } catch {
      throw new Error(
        `login failed: ${await loginDiagnostics(page, httpErrors)}`
      );
    }
  } finally {
    page.off("response", onResponse);
  }

  // A URL change alone is not proof of authentication.
  const session = await readSession(page);
  if (session.state !== "present") {
    throw new Error(
      `login reached ${new URL(page.url()).pathname} without an authenticated session: ${await loginDiagnostics(page, httpErrors)}`
    );
  }
  if (!/\/ai-workspace(?:[/?#]|$)/u.test(page.url())) {
    throw new Error(
      `authenticated login with unexpected redirect (session type=${session.type || "unknown"}): ${await loginDiagnostics(page, httpErrors)}`
    );
  }

  // Dev-mode warm-up: `next dev` compiles the submission-package route on its first
  // request. This is deliberately NOT an assertion (the result is discarded) and it
  // changes no assertion timeout - it only keeps cold-start compilation out of the
  // journey budget so a compile cannot masquerade as a product failure.
  await Promise.all(
    [
      submissionPackagesUrl("managed_school_application", SCHOOL_TARGET_ID),
      submissionPackagesUrl("student_500_visa_application", STUDENT_TARGET_ID),
    ].map((url) =>
      page.request.get(url, { timeout: 60_000 }).catch(() => undefined)
    )
  );
}

/**
 * Asserts that no AFFIRMATIVE authority claim is visible. Negated/honest disclaimers
 * such as "Not submission ready" pass; a fabricated "Submission ready" does not.
 */
async function assertNoFabricatedAuthority(page: Page): Promise<void> {
  const body = await page.locator("body").innerText();
  const violations = authorityViolations(body);
  expect(
    violations,
    `fabricated authority claims are not permitted: ${violations.join(" | ")}`
  ).toEqual([]);
}

async function openProject(page: Page, projectId: string): Promise<void> {
  await page.goto(new URL("/ai-workspace", BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });
  const entryPanel = page.getByTestId("project-entry-panel");
  await expect(async () => {
    if (await entryPanel.isVisible()) {
      return;
    }
    const historyTab = page.getByTestId("workspace-panel-tab-history");
    if ((await historyTab.count()) > 0 && (await historyTab.isVisible())) {
      await historyTab.click();
    }
    expect(await entryPanel.isVisible()).toBe(true);
  }).toPass({ timeout: 20_000 });
  const list = page.getByTestId("workspace-project-list");
  if (!(await list.isVisible())) {
    await page.getByTestId("toggle-project-list").click();
  }
  const item = page.locator(
    `[data-testid="project-list-item"][title*="${projectId}"]`
  );
  await expect(item).toBeVisible();
  await item.click();
}

async function openSchoolPackage(page: Page): Promise<void> {
  await openProject(page, PROJECT_ID);
  await page.getByTestId("project-view-applications").click();
  const panel = page.getByTestId("school-applications-panel");
  await expect(panel).toBeVisible();
  const target = panel.locator(
    `[data-testid="school-application-item"][title*="${SCHOOL_TARGET_ID}"]`
  );
  if ((await target.count()) > 0) {
    await target.click();
  } else {
    // Fall back to the single seeded application; a missing application fails here.
    await expect(
      panel.getByTestId("school-application-item").first()
    ).toBeVisible();
    await panel.getByTestId("school-application-item").first().click();
  }
  await expect(panel.getByTestId("school-application-detail")).toBeVisible();
  await expect(page.getByTestId("submission-package-section")).toBeVisible();
}

async function openStudentPackage(page: Page): Promise<void> {
  await openProject(page, PROJECT_ID);
  await page.getByTestId("project-view-student500").click();
  const panel = page.getByTestId("student500-panel");
  await expect(panel).toBeVisible();
  const entry = panel
    .getByTestId("student500-list")
    .locator('[data-testid^="student500-application-"]')
    .first();
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(panel.getByTestId("student500-detail")).toBeVisible();
  await expect(page.getByTestId("submission-package-section")).toBeVisible();
}

/** A journey can only be judged against a live, enabled section. */
async function requireEnabledSection(page: Page) {
  const section = page.getByTestId("submission-package-section");
  await expect(section).toBeVisible();
  await expect(
    section.getByTestId("submission-package-unavailable"),
    "the M8.1 feature flag or migration 0051 is missing in this run"
  ).toHaveCount(0);
  await expect(
    section.getByTestId("submission-package-error"),
    "the submission package API failed in this run"
  ).toHaveCount(0);
  return section;
}

/** Bounded, non-sensitive snapshot of the section's own visible state. */
async function describeSection(section: Locator): Promise<string> {
  const read = async (testId: string): Promise<string> => {
    const locator = section.getByTestId(testId);
    if ((await locator.count()) === 0) {
      return "absent";
    }
    const text = await locator
      .first()
      .innerText()
      .catch(() => "");
    const normalized = text.replace(/\s+/gu, " ").trim();
    return normalized.length > 0 ? normalized.slice(0, 200) : "empty";
  };
  return [
    `next-action=${await read("submission-package-next-action")}`,
    `current=${await read("submission-package-current")}`,
    `error=${await read("submission-package-error")}`,
    `unavailable=${await read("submission-package-unavailable")}`,
    `stale=${await read("submission-package-stale")}`,
    `integrity=${await read("submission-package-integrity")}`,
    `loading=${await read("submission-package-loading")}`,
  ].join(" ");
}

type SubmissionPackageSummary = {
  readonly confirmations: readonly {
    readonly confirmationType: string;
    readonly current: boolean;
  }[];
  readonly manifestSha256: string;
  readonly packageVersionId: string;
  readonly version: number;
};

/** The real workspace view from the live API (never mocked). */
async function readWorkspaceView(
  page: Page,
  kind: string,
  targetId: string
): Promise<{
  readonly currentPackage: SubmissionPackageSummary | null;
}> {
  const response = await page.request.get(
    submissionPackagesUrl(kind, targetId)
  );
  if (!response.ok()) {
    throw new Error(
      `submission package GET failed: status=${response.status()} kind=${kind}`
    );
  }
  return (await response.json()) as {
    readonly currentPackage: SubmissionPackageSummary | null;
  };
}

/**
 * Whether the CURRENT exact package version carries an effective content confirmation.
 * A historical confirmation row on an older version is explicitly NOT evidence for the
 * current version, so the check reads the server's current package only.
 */
async function currentVersionHasContentConfirmation(
  page: Page,
  kind: string,
  targetId: string
): Promise<boolean> {
  const view = await readWorkspaceView(page, kind, targetId);
  const current = view.currentPackage;
  if (!current) {
    return false;
  }
  return current.confirmations.some(
    (confirmation) =>
      confirmation.confirmationType === "package_content_review" &&
      confirmation.current === true
  );
}

async function buildIfNeeded(section: Locator): Promise<void> {
  const build = section.getByTestId("submission-package-build");
  if (await build.isVisible()) {
    // A disabled control would swallow the click and look like a timeout.
    await expect(
      build,
      `the build control must be enabled once the section is ready: ${await describeSection(section)}`
    ).toBeEnabled({ timeout: 30_000 });
    await build.click();
  }
  try {
    await expect(section.getByTestId("submission-package-current")).toBeVisible(
      {
        timeout: 30_000,
      }
    );
  } catch (error) {
    throw new Error(
      `${describeError(error)} | section: ${await describeSection(section)}`
    );
  }
}

async function confirmContent(section: Locator): Promise<void> {
  const consent = section.getByTestId("submission-package-consent-content");
  const button = section.getByTestId("submission-package-confirm-content");
  try {
    await expect(
      button,
      `the content statement must be confirmable before consent: ${await describeSection(section)}`
    ).toBeDisabled({ timeout: 30_000 });
    await consent.check();
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await button.click();
  } catch (error) {
    throw new Error(
      `${describeError(error)} | section: ${await describeSection(section)}`
    );
  }
}

test("A: school package builds, shows its frozen content, confirms and persists", async ({
  page,
}) => {
  await openSchoolPackage(page);
  const section = await requireEnabledSection(page);
  await buildIfNeeded(section);

  // The frozen content is the real M5.1 package content seeded for this run.
  // The integrity label is localised ("Integrity verified" / "完整性已校验").
  await expect(
    section.getByTestId("submission-package-integrity")
  ).toContainText(/verified|已校验|已校驗/iu);
  await expect(
    section.getByTestId("submission-package-disclosures")
  ).toBeVisible();
  const review = section.getByTestId("submission-package-review");
  await expect(review).toBeVisible();
  await expect(review).toContainText("Synthetic Institute M81");
  await expect(review).toContainText("Synthetic Master of Data Science");
  await expect(review).toContainText(/Package version/i);

  const identity = (
    await section.getByTestId("submission-package-current").innerText()
  ).trim();
  // The version label is localised ("Version 2" / "版本 2" / "版本 2"), so parse the
  // displayed version instead of assuming an English "v2" form - then verify it and the
  // digest prefix against the server's current package identity.
  const versionMatch = /(?:version|版本)\s*(\d+)/iu.exec(identity);
  expect(
    versionMatch,
    `the current version summary must name its version: ${identity.slice(0, 160)}`
  ).not.toBeNull();
  const displayedVersion = Number(versionMatch?.[1]);
  const digestMatch = /([0-9a-f]{12})/iu.exec(identity);
  expect(
    digestMatch,
    `the current version summary must show its manifest hash: ${identity.slice(0, 160)}`
  ).not.toBeNull();
  const serverCurrent = (
    await readWorkspaceView(
      page,
      "managed_school_application",
      SCHOOL_TARGET_ID
    )
  ).currentPackage;
  expect(
    serverCurrent,
    "the live API must expose the current package"
  ).not.toBeNull();
  expect(
    displayedVersion,
    "the displayed version must equal the live current package version"
  ).toBe(serverCurrent?.version);
  expect(
    digestMatch?.[1]?.toLowerCase(),
    "the displayed digest prefix must equal the live manifest digest"
  ).toBe((serverCurrent?.manifestSha256 ?? "").slice(0, 12).toLowerCase());

  await confirmContent(section);
  await expect(
    section.getByTestId("submission-package-confirmed").first()
  ).toBeVisible();
  await assertNoFabricatedAuthority(page);

  // Reload through the real application: the confirmation and the exact version
  // identity must come back from PostgreSQL, not from component state.
  await page.reload({ waitUntil: "domcontentloaded" });
  await openSchoolPackage(page);
  const reloaded = await requireEnabledSection(page);
  await expect(
    reloaded.getByTestId("submission-package-confirmed").first()
  ).toBeVisible();
  expect(
    (
      await reloaded.getByTestId("submission-package-current").innerText()
    ).trim()
  ).toBe(identity);
});

test("B: student 500 pins the exact GS draft, confirms both statements and persists", async ({
  page,
}) => {
  await openStudentPackage(page);
  const section = await requireEnabledSection(page);
  await buildIfNeeded(section);

  // The exact pinned GS draft version is rendered, not a "latest" summary. The label
  // is localised ("Exact GS draft version 1" / "确切的 GS 草稿版本 1"), so assert the
  // seeded version number and the pinned digest, not an English word.
  const draftReview = section.getByTestId("submission-package-review-draft");
  await expect(draftReview).toBeVisible();
  const draftLabel = await draftReview.innerText();
  expect(
    draftLabel.includes(`version ${GS_DRAFT_VERSION}`) ||
      draftLabel.includes(`版本 ${GS_DRAFT_VERSION}`),
    `the pinned draft label must name version ${GS_DRAFT_VERSION}: ${draftLabel.slice(0, 160)}`
  ).toBe(true);
  await expect(draftReview).toContainText(/[0-9a-f]{12}/iu);

  // Contents and declarations are two distinct, separately consented confirmations.
  await confirmContent(section);
  const declarations = section.getByTestId(
    "submission-package-consent-declarations"
  );
  const confirmDeclarations = section.getByTestId(
    "submission-package-confirm-declarations"
  );
  await expect(confirmDeclarations).toBeDisabled();
  await declarations.check();
  await expect(confirmDeclarations).toBeEnabled();
  await confirmDeclarations.click();
  const bothConfirmed = section
    .getByTestId("submission-package-confirmed")
    .first();
  await expect(bothConfirmed).toBeVisible({ timeout: 30_000 });
  await expect(bothConfirmed).toContainText(/2/u);
  // No submission-readiness or approval claim is made anywhere on the page.
  await assertNoFabricatedAuthority(page);
  // The real localized disclosure copy (workspace-copy.ts M8 `disclosure` block), read
  // from the scoped disclosures element rather than matched against the whole page.
  const disclosures = section.getByTestId("submission-package-disclosures");
  await expect(disclosures).toBeVisible();
  await expect(disclosures).toContainText(
    /not legal advice|不构成法律意见|不構成法律意見/iu
  );
  await expect(disclosures).toContainText(
    /no qualified professional has reviewed|没有任何合资格专业人士审阅|沒有任何合資格專業人士審閱/iu
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await openStudentPackage(page);
  const reloaded = await requireEnabledSection(page);
  await expect(
    reloaded.getByTestId("submission-package-confirmed").first()
  ).toContainText(/2/u, { timeout: 30_000 });
});

test("C: a material change invalidates the confirmation and resets both consents", async ({
  page,
}) => {
  await openSchoolPackage(page);
  const section = await requireEnabledSection(page);
  await buildIfNeeded(section);

  // 1. Establish whether the CURRENT exact version carries an effective content
  //    confirmation. Historical rows for older versions are not evidence for it.
  const confirmedForCurrent = await currentVersionHasContentConfirmation(
    page,
    "managed_school_application",
    SCHOOL_TARGET_ID
  );

  // 2./3. If it does not, the production UI starts with consent unchecked and the
  //    confirmation button disabled; consent is then given explicitly and submitted
  //    through the one shared helper (which asserts that same disabled -> enabled
  //    transition itself). A required confirmation is never silently skipped.
  if (!confirmedForCurrent) {
    await expect(
      section.getByTestId("submission-package-consent-content"),
      `consent must start unchecked for the current version: ${await describeSection(section)}`
    ).not.toBeChecked();
    await expect(
      section.getByTestId("submission-package-confirm-content"),
      `the confirmation button must be disabled until consent is given: ${await describeSection(section)}`
    ).toBeDisabled();
    await confirmContent(section);
  }

  // 4. The current version now carries an effective confirmation - proven in the UI
  //    and independently through the live API.
  const confirmedRows = section.getByTestId("submission-package-confirmed");
  try {
    await expect(confirmedRows.first()).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    throw new Error(
      `${describeError(error)} | section: ${await describeSection(section)}`
    );
  }
  expect(
    await currentVersionHasContentConfirmation(
      page,
      "managed_school_application",
      SCHOOL_TARGET_ID
    ),
    "the current package version must carry an effective content confirmation"
  ).toBe(true);

  // 5. Continue with the material-change invalidation scenario.
  const beforeIdentity = (
    await section.getByTestId("submission-package-current").innerText()
  ).trim();

  // Change the application through the real M5.1 workflow (edit + save).
  const panel = page.getByTestId("school-applications-panel");
  await panel.getByTestId("school-application-edit-open").click();
  const editForm = panel.getByTestId("school-application-edit-form");
  await expect(editForm).toBeVisible();
  await editForm
    .getByTestId("school-application-edit-courseTitle")
    .fill("Synthetic Master of Data Science (changed)");
  await editForm
    .getByRole("button", { name: /save|保存/iu })
    .first()
    .click();
  await expect(editForm).toBeHidden({ timeout: 30_000 });

  // The old confirmation is no longer current and BOTH consents are unusable.
  const afterChange = await requireEnabledSection(page);
  await expect(afterChange.getByTestId("submission-package-stale")).toBeVisible(
    {
      timeout: 30_000,
    }
  );
  await expect(
    afterChange.getByTestId("submission-package-consent-content")
  ).not.toBeChecked();
  await expect(
    afterChange.getByTestId("submission-package-consent-declarations")
  ).not.toBeChecked();
  await expect(
    afterChange.getByTestId("submission-package-confirm-content")
  ).toBeDisabled();
  await expect(
    afterChange.getByTestId("submission-package-confirm-declarations")
  ).toBeDisabled();

  // A rebuild creates a NEW version; the old identity is not reused.
  await afterChange.getByTestId("submission-package-build").click();
  await expect(
    afterChange.getByTestId("submission-package-current")
  ).toBeVisible({
    timeout: 30_000,
  });
  const afterIdentity = (
    await afterChange.getByTestId("submission-package-current").innerText()
  ).trim();
  expect(afterIdentity).not.toBe(beforeIdentity);

  // A renewed affirmative action is required before anything can be confirmed again.
  await confirmContent(afterChange);
  await expect(
    afterChange.getByTestId("submission-package-confirmed").first()
  ).toBeVisible({ timeout: 30_000 });
});

test("D: an unrelated synthetic customer cannot reach the protected package surface", async ({
  browser,
  page,
}) => {
  await page.context().close();
  const outsider = await freshContext(browser);
  await signIn(outsider.page, OUTSIDER_EMAIL);
  await outsider.page.goto(new URL("/ai-workspace", BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });
  // The owner's Project is never disclosed to the unrelated customer.
  await expect(
    outsider.page.locator(
      `[data-testid="project-list-item"][title*="${PROJECT_ID}"]`
    )
  ).toHaveCount(0);
  await expect(
    outsider.page.locator(`[title*="${SCHOOL_TARGET_ID}"]`)
  ).toHaveCount(0);

  // Direct API access is refused as well: protected content never leaks.
  for (const target of [
    ["managed_school_application", SCHOOL_TARGET_ID],
    ["student_500_visa_application", STUDENT_TARGET_ID],
  ] as const) {
    const response = await outsider.page.request.get(
      submissionPackagesUrl(target[0], target[1])
    );
    expect(
      [401, 403, 404],
      `unexpected status ${response.status()} for an unrelated customer`
    ).toContain(response.status());
    const body = await response.text();
    expect(body).not.toMatch(/manifestSha256|packageVersionId/u);
  }
  await outsider.context.close();
});

test("E: Chinese and English surfaces render, and no authority is fabricated", async ({
  page,
  context,
}) => {
  // Chinese through the application's own locale cookie (the same one its switcher writes).
  await context.addCookies([
    { name: "site-locale", url: BASE_URL, value: "zh-CN" },
  ]);
  await page.goto(new URL("/ai-workspace", BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("html")).toHaveAttribute("lang", /zh/iu);
  await openStudentPackage(page);
  const zhSection = await requireEnabledSection(page);
  await buildIfNeeded(zhSection);
  await expect(
    zhSection.getByTestId("submission-package-review")
  ).toContainText(/你正在查看的内容|你正在查看的內容/u);
  await assertNoFabricatedAuthority(page);

  // English again through the same real mechanism.
  await context.addCookies([
    { name: "site-locale", url: BASE_URL, value: "en" },
  ]);
  await page.goto(new URL("/ai-workspace", BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("html")).toHaveAttribute("lang", /en/iu);
  await openStudentPackage(page);
  const enSection = await requireEnabledSection(page);
  await expect(
    enSection.getByTestId("submission-package-review")
  ).toContainText(/What you are reviewing/u);
  // The honest disclosures survive in both languages.
  await expect(
    enSection.getByTestId("submission-package-disclosures")
  ).toContainText(/not/iu);
  await assertNoFabricatedAuthority(page);
});

async function freshContext(browser: Browser) {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  return { context, page };
}
