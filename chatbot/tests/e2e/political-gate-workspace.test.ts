import { expect, type Page, type Route, test } from "@playwright/test";

const conversationId = "00000000-0000-4000-8000-000000000001";
const blockedText = "falun gong";
const blockedResponseText = "This service focuses on immigration";
const isolatedRouteTest =
  process.env.PHASE2_POLITICAL_GATE_ISOLATED === "true" ? test : test.skip;

const allowedWidgetResponse = {
  text: "Allowed stub response.",
  responseLanguage: "en",
  citations: [],
  compactSources: [],
  followUpQuestions: [],
  missingFacts: [],
  evidenceGaps: [],
  escalate: false,
  nextAction: "answer",
  matterId: null,
  conversationState: null,
  caseHypothesis: null,
  factSlotStates: [],
  interactionPlan: null,
  retrievalDebug: null,
};

async function fulfillJson(route: Route, value: unknown) {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(value),
  });
}

async function stubWorkspaceBootstrap(page: Page) {
  await page.route("**/api/immigration-conversations**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const conversation = {
      chatId: conversationId,
      legalMatterId: null,
      title: "Test conversation",
      createdAt: null,
      updatedAt: null,
    };

    if (
      request.method() === "GET" &&
      pathname === "/api/immigration-conversations"
    ) {
      await fulfillJson(route, { conversations: [conversation] });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === `/api/immigration-conversations/${conversationId}`
    ) {
      await fulfillJson(route, { ...conversation, messages: [] });
      return;
    }

    // An unexpected persistence attempt is tracked by each test below.
    await fulfillJson(route, conversation);
  });
}

function isProtectedPostRequest(request: { method(): string; url(): string }) {
  if (request.method() !== "POST") {
    return false;
  }

  return [
    "/api/immigration-conversations",
    "/api/widget-chat",
    "/api/widget-chat-direct",
    "/api/files/upload",
  ].includes(new URL(request.url()).pathname);
}

for (const assistantMode of ["default", "premium"] as const) {
  test(`browser blocks locally before network or user rendering in ${assistantMode} mode`, async ({
    page,
  }) => {
    const forbiddenRequests: Array<{ url: string; body: string }> = [];
    let observeSubmit = false;

    await stubWorkspaceBootstrap(page);

    const abortForbiddenRequest = async (route: Route) => {
      if (observeSubmit) {
        forbiddenRequests.push({
          url: route.request().url(),
          body: route.request().postData() ?? "",
        });
      }
      await route.abort();
    };

    await page.route("**/api/widget-chat", abortForbiddenRequest);
    await page.route("**/api/widget-chat-direct", abortForbiddenRequest);
    await page.route("**/api/files/upload", abortForbiddenRequest);
    page.on("request", (request) => {
      const body = request.postData() ?? "";
      if (
        observeSubmit &&
        (isProtectedPostRequest(request) || body.includes(blockedText))
      ) {
        forbiddenRequests.push({ url: request.url(), body });
      }
    });

    await page.goto("/ai-workspace");
    const input = page.getByTestId("workspace-input");
    await expect(input).toBeEnabled();
    await page.locator("#assistant-mode-select").selectOption(assistantMode);

    observeSubmit = true;
    await input.fill(blockedText);
    await expect(page.getByTestId("workspace-send")).toBeEnabled();
    await page.getByTestId("workspace-send").click();

    await expect(page.getByTestId("political-block-response")).toContainText(
      blockedResponseText
    );
    await expect(
      page.getByTestId("workspace-message-list").getByText(blockedText)
    ).toHaveCount(0);
    await expect(input).toHaveValue("");
    await page.waitForTimeout(150);
    expect(forbiddenRequests).toEqual([]);

    const persistedBrowserText = await page.evaluate(() => {
      const values = [localStorage, sessionStorage].flatMap((storage) =>
        Array.from({ length: storage.length }, (_, index) =>
          storage.getItem(storage.key(index) ?? "")
        )
      );
      return values.join("\n");
    });
    expect(persistedBrowserText).not.toContain(blockedText);
  });
}

for (const [assistantMode, expectedRoute] of [
  ["default", "/api/widget-chat"],
  ["premium", "/api/widget-chat-direct"],
] as const) {
  test(`allowed workspace submit uses ${assistantMode} mode and its explicit route`, async ({
    page,
  }) => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

    await stubWorkspaceBootstrap(page);
    for (const endpoint of ["widget-chat", "widget-chat-direct"]) {
      await page.route(`**/api/${endpoint}`, async (route) => {
        calls.push({
          url: route.request().url(),
          body: JSON.parse(route.request().postData() ?? "{}"),
        });
        await fulfillJson(route, allowedWidgetResponse);
      });
    }

    await page.goto("/ai-workspace");
    const input = page.getByTestId("workspace-input");
    await expect(input).toBeEnabled();
    await page.locator("#assistant-mode-select").selectOption(assistantMode);
    await input.fill("Can I apply for a 485 visa?");
    await expect(page.getByTestId("workspace-send")).toBeEnabled();
    await page.getByTestId("workspace-send").click();

    await expect(page.getByText(allowedWidgetResponse.text)).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe(expectedRoute);
    expect(calls[0].body.assistantMode).toBe(assistantMode);
  });
}

for (const [name, endpoint, assistantMode] of [
  ["default", "/api/widget-chat", "default"],
  ["premium", "/api/widget-chat-direct", "premium"],
] as const) {
  isolatedRouteTest(
    `direct Next.js ${name} bypass is blocked before the legal-service path`,
    async ({ page }) => {
      test.setTimeout(10_000);
      // The proxy requires a session before it will dispatch API routes. Load
      // the workspace only to establish that cookie; the blocked fixture is
      // sent solely by the direct route call below, never during auth.
      await stubWorkspaceBootstrap(page);
      await page.goto("/ai-workspace");

      const response = await page.request.post(endpoint, {
        data: {
          id: "00000000-0000-4000-8000-000000000002",
          selectedChatModel: "intentionally-invalid-but-parseable",
          assistantMode,
          intakeFacts: {},
          messages: [
            {
              id: "u1",
              role: "user",
              parts: [{ type: "text", text: blockedText }],
            },
          ],
        },
      });
      const body = (await response.json()) as {
        citations: unknown[];
        text: string;
      };

      expect(response.status()).toBe(200);
      expect(body.text).toContain(blockedResponseText);
      expect(body.text).not.toContain(blockedText);
      expect(body.citations).toEqual([]);
    }
  );
}
