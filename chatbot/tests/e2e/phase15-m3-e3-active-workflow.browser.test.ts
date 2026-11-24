import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";
import { buildProjectJourney } from "../../lib/workspace/project-journey";
import {
  buildProjectState,
  type ProjectStateInput,
  type ProjectStateSchoolApplicationInput,
} from "../../lib/workspace/project-state";

const projectId = "11111111-1111-4111-8111-111111111111";
const chatA = "22222222-2222-4222-8222-222222222221";
const chatB = "22222222-2222-4222-8222-222222222222";
const standaloneChat = "22222222-2222-4222-8222-222222222223";
const schoolAId = "33333333-3333-4333-8333-333333333331";
const schoolBId = "33333333-3333-4333-8333-333333333332";
const createdChat = "22222222-2222-4222-8222-222222222224";
const assistantMessageId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-11-24T00:00:00.000Z";

const capabilities: ProjectStateInput["capabilities"] = {
  projectDocuments: { reasonCode: null, state: "disabled" },
  projectFacts: { reasonCode: null, state: "available" },
  schoolAdmissions: { reasonCode: null, state: "available" },
  schoolApplications: { reasonCode: null, state: "available" },
  serviceEngagements: { reasonCode: null, state: "available" },
  student500: { reasonCode: null, state: "available" },
  student500Preparation: { reasonCode: null, state: "available" },
  submissionPackages: { reasonCode: null, state: "unsupported" },
};

function school(
  applicationId: string,
  revision: number
): ProjectStateSchoolApplicationInput {
  return {
    applicationId,
    archivedAt: null,
    course: { catalogId: null, title: `Course ${applicationId}` },
    createdAt: timestamp,
    events: [],
    institution: { catalogId: null, name: `School ${applicationId}` },
    intake: { id: null, label: "2027" },
    latestPackage: null,
    missingDataCodes: [],
    packageStale: false,
    projectId,
    revision,
    source: { status: "unverified_customer_declared" },
    staleReasonCodes: [],
    status: "draft",
    updatedAt: timestamp,
  };
}

function projectState(schoolARevision = 2, schoolBRevision = 3) {
  return buildProjectState({
    admissionsCases: [],
    capabilities,
    facts: { authorizedForAI: [], conflictCount: 0, state: "available" },
    generatedAt: timestamp,
    project: { id: projectId, revision: 9, status: "active" },
    schoolApplications: [
      school(schoolAId, schoolARevision),
      school(schoolBId, schoolBRevision),
    ],
    serviceEngagements: [],
    student500Applications: [],
    student500PreparationCapability: "available",
    student500Preparations: [],
  });
}

const initialState = projectState();
const journey = buildProjectJourney(initialState);
const schoolANode = journey.nodes.find((node) => node.targetId === schoolAId);
const schoolBNode = journey.nodes.find((node) => node.targetId === schoolBId);
if (!schoolANode || !schoolBNode) {
  throw new Error("synthetic School targets did not build");
}
const taskFor = (targetId: string, stepKey: "planning" | "school_discovery") => {
  const task = journey.workflowProjection.tasks.find(
    (candidate) =>
      candidate.targetId === targetId && candidate.stepKey === stepKey
  );
  if (!task) {
    throw new Error(`synthetic ${stepKey} task did not build for ${targetId}`);
  }
  return task;
};
const schoolAPlanning = taskFor(schoolAId, "planning");
const schoolADiscovery = taskFor(schoolAId, "school_discovery");
const schoolBPlanning = taskFor(schoolBId, "planning");
const schoolBDiscovery = taskFor(schoolBId, "school_discovery");

const fixtureSource = `
import React from "react";
import { createRoot } from "react-dom/client";
import { ImmigrationAIWorkspace } from "./components/immigration-ai-workspace";

function Fixture() {
  return <ImmigrationAIWorkspace assistantMode="default" projectAvailability="available" userType="regular" />;
}

createRoot(document.getElementById("root")).render(<Fixture />);
`;

const testStubs: Record<string, string> = {
  "next/navigation": `
    export function useRouter() {
      return { push() {}, replace() {}, refresh() {}, back() {} };
    }
    export function usePathname() { return window.location.pathname; }
    export function useSearchParams() { return new URLSearchParams(window.location.search); }
  `,
  "next/link": `
    import React from "react";
    export default function Link({ href, children, ...props }) {
      return React.createElement("a", { href, ...props }, children);
    }
  `,
  sonner: `
    export const toast = { error() {}, success() {}, info() {}, warning() {} };
    export function Toaster() { return null; }
  `,
  "@/components/site-locale-provider": `
    export function useSiteLocale() { return { locale: "en", setLocale() {} }; }
  `,
  "./site-locale-provider": `
    export function useSiteLocale() { return { locale: "en", setLocale() {} }; }
  `,
  "next-auth/react": `
    export function useSession() { return { data: null, status: "unauthenticated" }; }
    export function signOut() {}
  `,
  "server-only": "export {};",
};

let fixtureBundle = "";
let workspaceCss = "";

test.beforeAll(async () => {
  const globalCssPath = resolve(process.cwd(), "app/globals.css");
  const cssSource = await readFile(globalCssPath, "utf8");
  workspaceCss = (
    await postcss([tailwindcss()]).process(cssSource, { from: globalCssPath })
  ).css;
  const bundled = await build({
    absWorkingDir: process.cwd(),
    bundle: true,
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_WIDGET_DEBUG": '"false"',
    },
    format: "iife",
    platform: "browser",
    plugins: [
      {
        name: "workspace-browser-stubs",
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /.*/ }, (args) =>
            args.path in testStubs
              ? { path: args.path, namespace: "phase15-r6-test" }
              : undefined
          );
          pluginBuild.onLoad(
            { filter: /.*/, namespace: "phase15-r6-test" },
            (args) => ({
              contents: testStubs[args.path],
              loader: "tsx",
              resolveDir: process.cwd(),
            })
          );
        },
      },
    ],
    stdin: {
      contents: fixtureSource,
      loader: "tsx",
      resolveDir: process.cwd(),
      sourcefile: "phase15-m3-e3-active-workflow-fixture.tsx",
    },
    target: "chrome116",
    write: false,
  });
  fixtureBundle = bundled.outputFiles[0]?.text ?? "";
  const fullWidthNumberedListPattern = "/^\\d+[.)）]\\s+/";
  if (fixtureBundle.includes(fullWidthNumberedListPattern)) {
    fixtureBundle = fixtureBundle.replace(
      fullWidthNumberedListPattern,
      "/^\\d+[.)\\uFF09]\\s+/"
    );
  }
  expect(fixtureBundle.length).toBeGreaterThan(0);
});

function projectChatRecords(ids: string[]) {
  return ids.map((chatId, index) => ({
    chatId,
    createdAt: timestamp,
    origin: "project",
    projectId,
    readOnly: false,
    title: `Synthetic Project Chat ${index + 1}`,
    updatedAt: timestamp,
  }));
}

function conversationDetail(chatId: string) {
  const isProjectChat = [chatA, chatB, createdChat].includes(chatId);
  return {
    chatId,
    createdAt: timestamp,
    legalMatterId: null,
    messages: [],
    origin: isProjectChat ? "project" : "immigration",
    projectId: isProjectChat ? projectId : null,
    readOnly: false,
    title: isProjectChat ? "Synthetic Project Chat" : "Synthetic Standalone Chat",
    updatedAt: timestamp,
  };
}

async function submitAndReadSelection(
  page: Page,
  text: string,
  requestCount: () => number
) {
  const previousCount = requestCount();
  await page.getByTestId("workspace-input").fill(text);
  await page.getByTestId("workspace-send").click();
  await expect.poll(requestCount).toBe(previousCount + 1);
  await expect(page.getByTestId("workspace-assistant-message").last()).toContainText(
    "Synthetic captured response.",
    { timeout: 10_000 }
  );
}

test("mounted Workspace sends the selected task through desktop, mobile, Chat switch and retry paths", async ({
  page,
}) => {
  test.setTimeout(120_000);
  let revisionChanged = false;
  let projectChats = [chatA, chatB];
  let standaloneCreated = false;
  let shouldFailPersistenceTurn = false;
  let failedPersistenceTurn = false;
  const widgetRequests: Record<string, unknown>[] = [];

  await page.route("http://127.0.0.1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    if (pathname === "/workspace.css") {
      await route.fulfill({ body: workspaceCss, contentType: "text/css" });
      return;
    }
    if (pathname === "/layout.js") {
      await route.fulfill({ body: fixtureBundle, contentType: "text/javascript" });
      return;
    }
    if (pathname === "/api/projects" && method === "GET") {
      await route.fulfill({
        json: {
          projects: [
            {
              createdAt: timestamp,
              displayName: "Synthetic Project",
              id: projectId,
              revision: 9,
              status: "active",
              updatedAt: timestamp,
            },
          ],
        },
      });
      return;
    }
    if (pathname === `/api/projects/${projectId}/state` && method === "GET") {
      await route.fulfill({
        json: { state: revisionChanged ? projectState(4, 4) : initialState },
      });
      return;
    }
    if (pathname === `/api/projects/${projectId}/chats` && method === "GET") {
      await route.fulfill({ json: { conversations: projectChatRecords(projectChats) } });
      return;
    }
    if (pathname === `/api/projects/${projectId}/chats` && method === "POST") {
      if (!projectChats.includes(createdChat)) {
        projectChats = [...projectChats, createdChat];
      }
      await route.fulfill({
        json: { chatId: createdChat, origin: "project", projectId, readOnly: false },
      });
      return;
    }
    if (pathname === "/api/immigration-conversations" && method === "GET") {
      await route.fulfill({ json: { conversations: [], hasMore: false } });
      return;
    }
    if (pathname === "/api/immigration-conversations" && method === "POST") {
      standaloneCreated = true;
      await route.fulfill({
        json: {
          chatId: standaloneChat,
          origin: "immigration",
          title: "Synthetic Standalone Chat",
        },
      });
      return;
    }
    if (/^\/api\/immigration-conversations\/[^/]+$/u.test(pathname) && method === "GET") {
      const chatId = pathname.split("/").at(-1) ?? "";
      await route.fulfill({ json: conversationDetail(chatId) });
      return;
    }
    if (pathname === "/api/widget-chat" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      widgetRequests.push(body);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const lastMessage = messages.at(-1) as
        | { parts?: { text?: unknown; type?: unknown }[] }
        | undefined;
      const lastText = lastMessage?.parts?.find(
        (part) => part.type === "text"
      )?.text;
      if (
        shouldFailPersistenceTurn &&
        !failedPersistenceTurn &&
        lastText === "persistence retry scope"
      ) {
        failedPersistenceTurn = true;
        await route.fulfill({
          status: 503,
          json: {
            code: "conversation_turn_not_persisted",
            error: "Synthetic retry fixture",
            persistence: {
              errorCode: "conversation_turn_not_persisted",
              retryable: true,
              saved: false,
              userTurnPersisted: false,
              assistantTurnPersisted: false,
            },
          },
        });
        return;
      }
      await route.fulfill({
        json: {
          assistantMessageId,
          citations: [],
          compactSources: [],
          persistence: {
            assistantMessageId,
            assistantTurnPersisted: true,
            errorCode: null,
            replayed: false,
            retryable: false,
            saved: true,
            userTurnPersisted: true,
          },
          responseLanguage: "en",
          text: "Synthetic captured response.",
        },
      });
      return;
    }
    if (pathname.startsWith("/api/")) {
      await route.fulfill({ status: 404, json: {} });
      return;
    }
    await route.fulfill({
      contentType: "text/html",
      body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><style>${workspaceCss}</style></head><body><div id="root"></div><script src="/layout.js"></script></body></html>`,
    });
  });

  await page.goto("http://127.0.0.1/");
  await expect(page.getByTestId("project-entry-panel")).toBeVisible();
  await expect.poll(() => standaloneCreated).toBe(true);
  await page.getByTestId("project-list-item").click();
  await page.getByTestId("project-navigation-tab-chats").click();
  await expect(page.getByTestId("project-chat-list-item").first()).toBeVisible();
  await page.getByTestId("project-chat-list-item").first().click();
  await expect(page.getByTestId("workspace-input")).toBeEnabled();
  await page.getByTestId("project-navigation-tab-workflows").click();

  const selectSchoolTask = async (
    nodeId: string,
    planningTaskId: string,
    discoveryTaskId: string
  ) => {
    const matter = page.locator(`[data-matter-id="${nodeId}"]`);
    const toggle = matter.getByTestId("project-navigation-matter-toggle");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    await page
      .locator(`[data-workflow-task-id="${planningTaskId}"]`)
      .click();
    await page
      .locator(`[data-workflow-task-id="${discoveryTaskId}"]`)
      .click();
    await expect(
      page.locator(`[data-workflow-task-id="${discoveryTaskId}"]`)
    ).toHaveAttribute("aria-pressed", "true");
  };

  await selectSchoolTask(schoolANode.id, schoolAPlanning.taskId, schoolADiscovery.taskId);
  await submitAndReadSelection(
    page,
    "school A discovery desktop",
    () => widgetRequests.length
  );
  expect(widgetRequests.at(-1)?.activeStepSelection).toMatchObject({
    projectId,
    stepKey: "school_discovery",
    targetId: schoolAId,
    targetKind: "school_application",
    workflowKind: "school_application",
    sourceRevisions: [
      { revision: 2, targetId: schoolAId, targetKind: "school_application" },
    ],
  });

  await selectSchoolTask(schoolBNode.id, schoolBPlanning.taskId, schoolBDiscovery.taskId);
  await submitAndReadSelection(
    page,
    "school B discovery desktop",
    () => widgetRequests.length
  );
  expect(widgetRequests.at(-1)?.activeStepSelection).toMatchObject({
    stepKey: "school_discovery",
    targetId: schoolBId,
    targetKind: "school_application",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("project-mobile-chat-tab-label").click();
  await submitAndReadSelection(
    page,
    "school B discovery mobile",
    () => widgetRequests.length
  );
  expect(widgetRequests.at(-1)?.activeStepSelection).toMatchObject({
    stepKey: "school_discovery",
    targetId: schoolBId,
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByTestId("project-navigation-tab-chats").click();
  await page.getByTestId("project-chat-list-item").nth(1).click();
  await expect(page.getByTestId("workspace-input")).toBeEnabled();
  await submitAndReadSelection(
    page,
    "same project second chat",
    () => widgetRequests.length
  );
  expect(widgetRequests.at(-1)?.activeStepSelection).toMatchObject({
    stepKey: "school_discovery",
    targetId: schoolBId,
  });

  await page.getByTestId("project-navigation-tab-chats").click();
  await page.getByTestId("new-project-chat").click();
  await expect(page.getByTestId("workspace-input")).toBeEnabled();
  await submitAndReadSelection(
    page,
    "new project chat",
    () => widgetRequests.length
  );
  expect(widgetRequests.at(-1)?.activeStepSelection).toMatchObject({
    stepKey: "school_discovery",
    targetId: schoolBId,
  });

  await page.getByTestId("project-navigation-tab-workflows").click();
  await selectSchoolTask(schoolBNode.id, schoolBPlanning.taskId, schoolBDiscovery.taskId);
  await page.locator(`[data-workflow-task-id="${schoolBPlanning.taskId}"]`).click();
  await submitAndReadSelection(
    page,
    "ordinary planning task",
    () => widgetRequests.length
  );
  expect(widgetRequests.at(-1)?.activeStepSelection).toMatchObject({
    stepKey: "planning",
    targetId: schoolBId,
  });

  const retryDiscoveryTask = page.locator(
    `[data-workflow-task-id="${schoolBDiscovery.taskId}"]`
  );
  await retryDiscoveryTask.click();
  await expect(retryDiscoveryTask).toHaveAttribute("aria-pressed", "true");
  shouldFailPersistenceTurn = true;
  const retryRequestCount = widgetRequests.length;
  await page.getByTestId("workspace-input").fill("persistence retry scope");
  await page.getByTestId("workspace-send").click();
  await expect.poll(() => widgetRequests.length).toBe(retryRequestCount + 1);
  await expect(page.getByTestId("persistence-notice")).toBeVisible();
  const originalRetrySelection = widgetRequests.at(-1)?.activeStepSelection;
  await page.locator(`[data-workflow-task-id="${schoolBPlanning.taskId}"]`).click();
  await page.getByTestId("persistence-notice").getByRole("button").click();
  await expect(page.getByTestId("persistence-notice")).toHaveCount(0);
  expect(widgetRequests.at(-1)?.activeStepSelection).toEqual(originalRetrySelection);
  expect(widgetRequests.at(-1)?.activeStepSelection).toMatchObject({
    stepKey: "school_discovery",
    targetId: schoolBId,
  });

  await page.locator(`[data-workflow-task-id="${schoolBDiscovery.taskId}"]`).click();
  revisionChanged = true;
  await page
    .getByTestId("project-task-workspace")
    .locator("header button")
    .click();
  await expect(
    page.getByTestId("project-workflow-task-selection-unavailable")
  ).toBeVisible();
  const countBeforeStaleSubmit = widgetRequests.length;
  await page.getByTestId("workspace-input").fill("stale revision must not dispatch");
  await page.getByTestId("workspace-send").click();
  await expect.poll(() => widgetRequests.length).toBe(countBeforeStaleSubmit);
});
