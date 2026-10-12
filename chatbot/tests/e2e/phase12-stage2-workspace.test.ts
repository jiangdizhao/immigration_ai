import { expect, test } from "@playwright/test";

/**
 * Phase 12 Stage 2 — reproducible workspace layout checks.
 *
 * Successor of the temporary out-of-repo script: the same contract, committed,
 * with no dependency on local credentials. The workspace must remain usable for
 * a signed-out visitor, which is exactly the state these checks exercise (they
 * never sign in and never write customer data beyond the guest session the app
 * creates for a visit).
 *
 * Run:
 *   P12_STAGE2_E2E_BASE_URL=http://127.0.0.1:3100 pnpm run test:phase12:stage2:browser
 */

const WORKSPACE = "/ai-workspace";

async function openWorkspace(page: import("@playwright/test").Page) {
  await page.goto(WORKSPACE, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("workspace-input")).toBeVisible();
}

test("the composer stays a bounded single-row control", async ({ page }) => {
  await openWorkspace(page);
  const composer = page.getByTestId("workspace-input");
  const box = await composer.boundingBox();
  expect(box).not.toBeNull();
  // Rows=1 with an auto-grow cap: never a tall empty box.
  expect(box?.height ?? 0).toBeLessThanOrEqual(130);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(20);

  // No attachment list may grow underneath the composer.
  await expect(
    page.locator("[data-testid='composer-attachment-list']")
  ).toHaveCount(0);
});

test("the upload affordance stays adjacent to the composer and the send control is reachable", async ({
  page,
}) => {
  await openWorkspace(page);
  const attach = page.getByTestId("composer-upload");
  const send = page.getByTestId("workspace-send");
  await expect(attach).toBeVisible();
  await expect(send).toBeVisible();
  const attachBox = await attach.boundingBox();
  const sendBox = await send.boundingBox();
  expect(attachBox).not.toBeNull();
  expect(sendBox).not.toBeNull();
  expect(Math.abs((attachBox?.y ?? 0) - (sendBox?.y ?? 0))).toBeLessThanOrEqual(
    80
  );
});

test("the message list keeps the primary reading area", async ({ page }) => {
  await openWorkspace(page);
  const messages = page.getByTestId("workspace-message-list");
  await expect(messages).toBeVisible();
  const box = await messages.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  // On a narrow viewport the chat must not be squeezed by a forced side column.
  if ((viewport?.width ?? 0) < 1280) {
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(
      (viewport?.width ?? 0) * 0.6
    );
  } else {
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(500);
  }
});

test("narrow viewports get labelled panels instead of a hidden context column", async ({
  page,
}) => {
  await openWorkspace(page);
  const viewport = page.viewportSize();
  const tabs = page.getByTestId("workspace-panel-tabs");
  if ((viewport?.width ?? 0) < 1280) {
    await expect(tabs).toBeVisible();
    await expect(
      page.getByTestId("workspace-panel-tab-conversationFiles")
    ).toBeVisible();
    await page.getByTestId("workspace-panel-tab-conversationFiles").click();
    await expect(
      page.getByTestId("workspace-conversation-files")
    ).toBeVisible();
  } else {
    // Wide viewports keep the three-column layout with the context panel shown.
    await expect(page.getByTestId("workspace-context-panel")).toBeVisible();
  }
});

test("a guest sees an honest file hint instead of an authorisation error", async ({
  page,
}) => {
  await openWorkspace(page);
  const viewport = page.viewportSize();
  if ((viewport?.width ?? 0) < 1280) {
    await page.getByTestId("workspace-panel-tab-conversationFiles").click();
  }
  const guestHint = page
    .getByTestId("matter-documents-guest-hint")
    .or(page.getByTestId("account-files-guest-hint"));
  await expect(guestHint.first()).toBeVisible();
  await expect(page.getByText(/Customer access required/u)).toHaveCount(0);
});
