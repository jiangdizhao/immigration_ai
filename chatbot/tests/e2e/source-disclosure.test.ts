import { expect, type Page, type Route, test } from "@playwright/test";

const conversationId = "00000000-0000-4000-8000-000000000021";

const conversation = {
  chatId: conversationId,
  legalMatterId: null,
  title: "Source disclosure test",
  createdAt: null,
  updatedAt: null,
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
    await fulfillJson(route, conversation);
  });
}

const fourSources = [
  "https://www.legislation.gov.au/C2026C00090/latest/text",
  "https://www.legislation.gov.au/F2026C00667/latest/text",
  "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing",
  "https://www.example.gov.au/immigration/official-guidance",
];

const fourSourceMarkdown = fourSources
  .map((url, index) => `- [Official source ${index + 1}](${url})`)
  .join("\n");

const responseWithSources = {
  text: `The answer remains visible above the references.\n\n## Actual web-search sources\n${fourSourceMarkdown}`,
  responseLanguage: "en",
  citations: [],
  compactSources: fourSources.map(
    (url, index) => `Official source ${index + 1} — ${url}`
  ),
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

async function stubResponse(page: Page, response: unknown) {
  await page.route("**/api/widget-chat-direct", async (route) => {
    await fulfillJson(route, response);
  });
}

async function submitPremiumQuestion(page: Page) {
  await page.goto("/ai-workspace");
  await expect(page.getByTestId("workspace-input")).toBeEnabled();
  await page.locator("#assistant-mode-select").selectOption("premium");
  await page.getByTestId("workspace-input").fill("What is the relevant rule?");
  await page.getByTestId("workspace-send").click();
  await expect(
    page.getByText("The answer remains visible above the references.")
  ).toBeVisible();
}

test.describe("customer source disclosures", () => {
  test("Premium references are collapsed, expandable, and preserve URL targets", async ({
    page,
  }) => {
    await stubWorkspaceBootstrap(page);
    await stubResponse(page, responseWithSources);
    await submitPremiumQuestion(page);

    const disclosure = page
      .getByTestId("workspace-assistant-message")
      .getByTestId("source-disclosure");
    await expect(disclosure).toHaveCount(1);
    await expect(disclosure).not.toHaveAttribute("open", "");
    await expect(disclosure.locator("summary")).toContainText(
      "References / sources (4)"
    );
    await expect(disclosure.locator("a")).toHaveCount(4);
    await expect(disclosure.locator("a").first()).toBeHidden();

    await disclosure.locator("summary").click();
    await expect(disclosure).toHaveAttribute("open", "");
    await expect(disclosure.locator("a")).toHaveCount(4);
    await expect(disclosure.locator("a").first()).toBeVisible();
    await expect(disclosure.locator("a").nth(0)).toHaveAttribute(
      "href",
      fourSources[0]
    );
    await expect(disclosure.locator("a").nth(3)).toHaveAttribute(
      "href",
      fourSources[3]
    );

    await disclosure.locator("summary").click();
    await expect(disclosure).not.toHaveAttribute("open", "");
    await expect(disclosure.locator("a").first()).toBeHidden();
  });

  test("a Default answer keeps its one-source disclosure", async ({ page }) => {
    await stubWorkspaceBootstrap(page);
    await page.route("**/api/widget-chat", async (route) => {
      await fulfillJson(route, {
        ...responseWithSources,
        text: "Default answer body.",
        compactSources: [fourSources[0]],
      });
    });

    await page.goto("/ai-workspace");
    await expect(page.getByTestId("workspace-input")).toBeEnabled();
    await page.getByTestId("workspace-input").fill("Check the rule");
    await page.getByTestId("workspace-send").click();
    await expect(page.getByText("Default answer body.")).toBeVisible();
    await expect(
      page
        .getByTestId("workspace-assistant-message")
        .getByTestId("source-disclosure")
    ).toHaveCount(1);
  });

  test("a source-free answer has no empty disclosure and ordinary source headings stay visible", async ({
    page,
  }) => {
    await stubWorkspaceBootstrap(page);
    await page.route("**/api/widget-chat-direct", async (route) => {
      await fulfillJson(route, {
        ...responseWithSources,
        text: "The source wording is part of the answer.\n\n## Source overview\n- [An ordinary source](https://www.example.gov.au/ordinary)",
        compactSources: [],
      });
    });

    await page.goto("/ai-workspace");
    await expect(page.getByTestId("workspace-input")).toBeEnabled();
    await page.locator("#assistant-mode-select").selectOption("premium");
    await page.getByTestId("workspace-input").fill("No references returned");
    await page.getByTestId("workspace-send").click();
    await expect(
      page.getByText("The source wording is part of the answer.")
    ).toBeVisible();
    await expect(page.getByText("Source overview")).toBeVisible();
    await expect(page.getByTestId("source-disclosure")).toHaveCount(0);
  });
});
