// biome-ignore-all lint/suspicious/noSkippedTests: owner-provided role sessions and fixtures are optional for local runs.
import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/services",
  "/process",
  "/contact",
  "/intelligence",
];

test("public Phase 11 surfaces expose usable landmarks, named controls, and keyboard focus", async ({
  page,
}) => {
  for (const route of publicRoutes) {
    await page.goto(route);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("h1").first()).toBeVisible();
    const unnamedInputs = await page
      .locator("input, textarea, select")
      .evaluateAll(
        (elements) =>
          elements.filter((element) => {
            if (
              element instanceof HTMLInputElement &&
              ["hidden", "submit", "button", "reset"].includes(element.type)
            ) {
              return false;
            }
            return !(
              element.getAttribute("aria-label") ||
              element.getAttribute("aria-labelledby") ||
              (element.id &&
                document.querySelector(
                  `label[for="${CSS.escape(element.id)}"]`
                )) ||
              element.closest("label")
            );
          }).length
      );
    expect(unnamedInputs, `unlabeled form controls on ${route}`).toBe(0);
    const unnamed = await page
      .locator("button, a[href]")
      .evaluateAll(
        (elements) =>
          elements.filter(
            (element) =>
              !(
                element.getAttribute("aria-label") ||
                element.textContent?.trim()
              )
          ).length
      );
    expect(unnamed, `unnamed controls on ${route}`).toBe(0);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    const focusStyle = await page.locator(":focus").evaluate((element) => {
      const style = getComputedStyle(element);
      return style.outlineStyle !== "none" || style.boxShadow !== "none";
    });
    expect(focusStyle, `visible focus on ${route}`).toBe(true);
  }
});

test("locale switcher changes to Chinese and English with accessible names", async ({
  page,
}) => {
  await page.goto("/services");
  const chinese = page.getByTestId("site-locale-zh-CN");
  const english = page.getByTestId("site-locale-en");
  await expect(chinese).toHaveAccessibleName(/.+/);
  await chinese.focus();
  await page.keyboard.press("Enter");
  await expect(chinese).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", /zh/i);
  await english.focus();
  await page.keyboard.press("Enter");
  await expect(english).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const englishHeading = await page.locator("h1").first().innerText();
  await chinese.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", /zh/i);
  const chineseHeading = await page.locator("h1").first().innerText();
  expect(chineseHeading).not.toBe(englishHeading);
  const navigationToggle = page.getByRole("button", {
    name: /navigation|导航|menu/i,
  });
  if (await navigationToggle.isVisible()) {
    await navigationToggle.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("navigation").last().getByRole("link").first()
    ).toBeVisible();
  }
});

test("representative mobile public pages fit without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of [
    "/",
    "/services",
    "/process",
    "/contact",
    "/intelligence",
  ]) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(
      dimensions.content,
      `horizontal overflow on ${route}`
    ).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});

const customerStorageState = process.env.P11_STAGE3_CUSTOMER_STORAGE_STATE;
const adminStorageState = process.env.P11_STAGE3_ADMIN_STORAGE_STATE;
const lawyerStorageState = process.env.P11_STAGE3_LAWYER_STORAGE_STATE;
const customerConsultationId = process.env.P11_STAGE3_CUSTOMER_CONSULTATION_ID;
const otherCustomerConsultationId =
  process.env.P11_STAGE3_OTHER_CUSTOMER_CONSULTATION_ID;
const lawyerAssignedRequestId =
  process.env.P11_STAGE3_LAWYER_ASSIGNED_REQUEST_ID;
const lawyerAssignedConsultationId =
  process.env.P11_STAGE3_LAWYER_ASSIGNED_CONSULTATION_ID;

async function expectRolePage(
  page: import("@playwright/test").Page,
  route: string,
  heading: RegExp
) {
  await page.goto(route);
  await expect(page).toHaveURL(
    (url) => url.pathname.replace(/\/$/, "") === route.replace(/\/$/, "")
  );
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
}

async function expectAccessDenied(
  page: import("@playwright/test").Page,
  route: string,
  redirectPaths: string[],
  protectedApiPath: string
) {
  const response = await page.goto(route);
  await page
    .waitForLoadState("networkidle", { timeout: 5000 })
    .catch(() => undefined);
  const normalizePath = (path: string) => path.replace(/\/$/, "") || "/";
  const isSettledDenial = () => {
    const finalPath = normalizePath(new URL(page.url()).pathname);
    return (
      redirectPaths.includes(finalPath) ||
      (response !== null && [401, 403, 404].includes(response.status()))
    );
  };
  await expect.poll(isSettledDenial, { timeout: 10_000 }).toBe(true);

  const finalPath = normalizePath(new URL(page.url()).pathname);
  if (redirectPaths.includes(finalPath)) {
    if (finalPath === "/login") {
      await expect(
        page.getByRole("heading", { name: "Sign In" })
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", { level: 1 }).first()
      ).toBeVisible();
    }
  } else {
    expect(
      response !== null && [401, 403, 404].includes(response.status())
    ).toBe(true);
  }

  const apiResult = await page.evaluate(async (apiPath) => {
    const apiResponse = await fetch(apiPath, { cache: "no-store" });
    const payload = await apiResponse.json().catch(() => null);
    const hasProtectedData = Boolean(
      Array.isArray(payload) ||
        (payload &&
          typeof payload === "object" &&
          ["id", "request", "consultation", "items", "requests"].some(
            (key) => key in payload
          ))
    );
    return { status: apiResponse.status, hasProtectedData };
  }, protectedApiPath);
  expect(apiResult.status).toBe(403);
  expect(apiResult.hasProtectedData).toBe(false);
}

test.describe("targeted Gate-I accessibility correction", () => {
  test("customer AI Workspace has one main landmark and named controls", async ({
    page,
  }) => {
    test.skip(
      !customerStorageState,
      "Set the synthetic customer storage state."
    );
    await page.goto("/ai-workspace");

    await expect(page.locator("main")).toHaveCount(1);
    const deleteButton = page.getByRole("button", {
      name: "Delete all consultations",
    });
    const newConsultationButton = page.getByRole("button", {
      name: "Start a new consultation",
    });
    await expect(deleteButton).toBeVisible();
    await expect(deleteButton).toHaveAccessibleName("Delete all consultations");
    await expect(newConsultationButton).toBeVisible();
    await expect(newConsultationButton).toHaveAccessibleName(
      "Start a new consultation"
    );

    await deleteButton.focus();
    await page.keyboard.press("Tab");
    await expect(newConsultationButton).toBeFocused();

    const composer = page.getByTestId("workspace-input");
    await expect(composer).toBeVisible();
    await expect(composer).toHaveAccessibleName(/Type your question|输入问题/);
    await composer.focus();
    await expect(composer).toBeFocused();
  });

  test("lawyer assigned-request feedback textarea has an accessible name", async ({
    page,
  }) => {
    test.skip(
      !lawyerStorageState || !lawyerAssignedRequestId,
      "Set the synthetic lawyer storage state and assigned request ID."
    );
    await page.goto(`/lawyer-portal/${lawyerAssignedRequestId}`);
    await expect(page).toHaveURL(
      (url) => url.pathname === `/lawyer-portal/${lawyerAssignedRequestId}`
    );
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    const approach = page.getByRole("textbox", {
      name: /Reasoning and research approach feedback|推理与研究方法反馈/,
    });
    await expect(approach).toBeVisible();
    await approach.focus();
    await expect(approach).toBeFocused();
  });
});

test.describe("customer role access matrix", () => {
  test.use({ storageState: customerStorageState ?? undefined });
  test.beforeEach(() => {
    test.skip(
      !customerStorageState,
      "Set P11_STAGE3_CUSTOMER_STORAGE_STATE to an owner-provided customer session."
    );
  });

  test("customer surfaces expose customer page semantics", async ({ page }) => {
    await expectRolePage(page, "/client-portal", /client|matter|客户|案件/i);
    await expectRolePage(page, "/consultations", /consultation|预约|咨询/i);
    await expectRolePage(page, "/consultations/new", /consultation|预约|咨询/i);
    await page.goto("/ai-workspace");
    await expect(page).toHaveURL((url) => url.pathname === "/ai-workspace");
    await expect(page.locator("main")).toBeVisible();
  });

  test("customer cannot open admin consultations", async ({ page }) => {
    await expectAccessDenied(
      page,
      "/admin-portal/consultations",
      ["/ai-workspace", "/client-portal", "/login"],
      "/api/admin/consultations"
    );
  });

  test("customer cannot open a lawyer-assigned workspace", async ({ page }) => {
    test.skip(
      !lawyerAssignedRequestId,
      "Set P11_STAGE3_LAWYER_ASSIGNED_REQUEST_ID to the assigned lawyer fixture id."
    );
    await expectAccessDenied(
      page,
      `/lawyer-portal/${lawyerAssignedRequestId}`,
      ["/ai-workspace", "/client-portal", "/login"],
      `/api/lawyer-portal/requests/${lawyerAssignedRequestId}`
    );
  });

  test("customer consultation detail stays within the customer fixture", async ({
    page,
  }) => {
    test.skip(
      !customerConsultationId,
      "Set P11_STAGE3_CUSTOMER_CONSULTATION_ID to this customer’s consultation fixture id."
    );
    await expectRolePage(
      page,
      `/consultations/${customerConsultationId}`,
      /consultation|预约|咨询/i
    );
  });
});

test.describe("admin role access matrix", () => {
  test.use({ storageState: adminStorageState ?? undefined });
  test.beforeEach(() => {
    test.skip(
      !adminStorageState,
      "Set P11_STAGE3_ADMIN_STORAGE_STATE to an owner-provided admin session."
    );
  });

  test("admin consultation queue exposes admin page semantics", async ({
    page,
  }) => {
    await expectRolePage(
      page,
      "/admin-portal/consultations",
      /consultation|预约|咨询/i
    );
  });

  test("admin cannot bypass customer ownership", async ({ page }) => {
    test.skip(
      !otherCustomerConsultationId,
      "Set P11_STAGE3_OTHER_CUSTOMER_CONSULTATION_ID to a consultation owned by another customer."
    );
    await expectAccessDenied(
      page,
      `/consultations/${otherCustomerConsultationId}`,
      ["/admin-portal", "/admin-portal/consultations", "/login"],
      `/api/consultations/${otherCustomerConsultationId}`
    );
  });

  test("admin cannot open lawyer-only assigned workspace", async ({ page }) => {
    test.skip(
      !lawyerAssignedRequestId,
      "Set P11_STAGE3_LAWYER_ASSIGNED_REQUEST_ID to the assigned lawyer fixture id."
    );
    await expectAccessDenied(
      page,
      `/lawyer-portal/${lawyerAssignedRequestId}`,
      ["/admin-portal", "/admin-portal/consultations", "/login"],
      `/api/lawyer-portal/requests/${lawyerAssignedRequestId}`
    );
  });
});

test.describe("lawyer role access matrix", () => {
  test.use({ storageState: lawyerStorageState ?? undefined });
  test.beforeEach(() => {
    test.skip(
      !lawyerStorageState,
      "Set P11_STAGE3_LAWYER_STORAGE_STATE to an owner-provided lawyer session."
    );
  });

  test("lawyer can access the P11-007 assigned workspace and consultation queue", async ({
    page,
  }) => {
    await expectRolePage(
      page,
      "/lawyer-portal",
      /lawyer workspace|律师工作台/i
    );
    await expectRolePage(
      page,
      "/lawyer-portal/consultations",
      /consultation|预约|咨询/i
    );
  });

  test("lawyer can open the owner-provided assigned request", async ({
    page,
  }) => {
    test.skip(
      !lawyerAssignedRequestId,
      "Set P11_STAGE3_LAWYER_ASSIGNED_REQUEST_ID to this lawyer’s assigned request fixture id."
    );
    await expectRolePage(
      page,
      `/lawyer-portal/${lawyerAssignedRequestId}`,
      /assigned request|已分配请求/i
    );
  });

  test("lawyer can open the assigned lawyer consultation", async ({ page }) => {
    test.skip(
      !lawyerAssignedConsultationId,
      "Set P11_STAGE3_LAWYER_ASSIGNED_CONSULTATION_ID to this lawyer’s assigned consultation fixture id."
    );
    await expectRolePage(
      page,
      `/lawyer-portal/consultations/${lawyerAssignedConsultationId}`,
      /consultation|预约|咨询/i
    );
  });

  test("lawyer cannot open admin-only consultation surfaces", async ({
    page,
  }) => {
    await expectAccessDenied(
      page,
      "/admin-portal/consultations",
      ["/lawyer-portal", "/ai-workspace", "/login"],
      "/api/admin/consultations"
    );
  });
});

if (process.env.P11_STAGE3_INTELLIGENCE_SLUG) {
  test("Policy Intelligence detail fixture remains a topic reference, not an answer payload", async ({
    page,
  }) => {
    await page.goto(
      `/intelligence/${process.env.P11_STAGE3_INTELLIGENCE_SLUG}`
    );
    await expect(page.locator("main")).toHaveCount(1);
    await expect(
      page.getByText(/official source|官方来源/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/AI-generated|AI 生成|AI生成/i).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /workspace|工作区/i })
    ).toBeVisible();
    await expect(
      page.locator(
        "[data-debug], [data-internal-verifier], [data-provider-metadata]"
      )
    ).toHaveCount(0);
  });
}
