import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

declare global {
  interface Window {
    __navigationRequests: string[];
  }
}

const fixtureSource = `
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ProjectEntryPanel } from "./components/project-entry-panel";
import { ProjectWorkflowNavigation } from "./components/project-workflow-navigation";
import {
  ProjectWorkspaceSplitSeparator,
  useResizableProjectWorkspaceSplit,
} from "./components/resizable-project-workspace-split";
import {
  WorkspaceNavigationSplitSeparator,
  useResizableWorkspaceNavigationSplit,
} from "./components/resizable-workspace-navigation-split";
import { projectWorkspaceSplitColumns } from "./lib/workspace/project-splitter";
import { getWorkspaceCopy } from "./lib/workspace-copy";
import { PROJECT_WORKFLOW_DEFINITION_VERSION } from "./lib/workspace/project-workflows";

const projectA = "11111111-1111-4111-8111-111111111111";
const projectB = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-11-23T00:00:00.000Z";
const copy = getWorkspaceCopy("en");

function task(projectId, taskId, targetId, stepKey) {
  const projectTask = targetId === projectId;
  return {
    actionability: "read_only",
    applicability: projectTask ? "unknown" : "applicable",
    definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION,
    dependencies: [],
    dependencySemantics: "none",
    panelKind: projectTask ? "planning" : "school",
    progress: projectTask ? "unknown" : "needs_information",
    progressCreditKey: null,
    progressCreditOwner: false,
    projectId,
    reasonCodes: [],
    responsibleActor: "unknown",
    sourceRevision: 1,
    sourceRevisions: [],
    stepKey,
    targetId,
    targetKind: projectTask ? "project" : "school_application",
    taskId,
    workflowKind: projectTask ? "project_planning" : "school_application",
  };
}

function journeyFor(projectId) {
  const schools = [
    {
      actions: [], id: "school:a", issueCodes: [], kind: "school_application",
      missingInformationCodes: [], progress: "needs_information", provenance: null,
      record: null, responsibleActor: "unknown", route: null,
      sourceKey: "schoolApplications", subtitle: "Synthetic Course A · 2027",
      targetId: "school-a", targetKind: "school_application", title: "Northbridge School",
    },
    {
      actions: [], id: "school:b", issueCodes: [], kind: "school_application",
      missingInformationCodes: [], progress: "in_progress", provenance: null,
      record: null, responsibleActor: "unknown", route: null,
      sourceKey: "schoolApplications", subtitle: "Synthetic Course B · 2028",
      targetId: "school-b", targetKind: "school_application", title: "Harbour School",
    },
  ];
  const tasks = [
    task(projectId, "task:project:goal", projectId, "project_goal"),
    task(projectId, "task:school:a", "school-a", "school_discovery"),
    task(projectId, "task:school:b", "school-b", "planning"),
  ];
  const sourceKeys = ["schoolApplications", "schoolAdmissions", "student500", "student500Preparation", "projectFacts", "projectDocuments", "submissionPackages", "serviceEngagements"];
  return {
    edges: [], generatedAt: timestamp, nodes: schools,
    project: { id: projectId, purpose: { reasonCode: "project_purpose_not_recorded", state: "unknown" }, revision: 1, serviceScope: { engagements: [], state: "available" }, status: "active" },
    projectActions: [], projectIssues: [], schemaVersion: "phase15.project-state.v1",
    sources: sourceKeys.map((key) => ({ key, reasonCode: null, recordCount: key === "schoolApplications" ? 2 : 0, state: key === "projectFacts" ? "disabled" : "available" })),
    summary: { knownIncompleteWorkCount: 0, knownRecordCount: 2, unknownProgressCount: 0, unavailableSourceCount: 1 },
    workflowProjection: { definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION, progress: { completedKnownApplicable: 0, coverage: "partial", definitionVersion: PROJECT_WORKFLOW_DEFINITION_VERSION, knownApplicableTotal: 0, notApplicableCount: 0, percent: null, unavailableCount: 0, unknownApplicabilityCount: 0, unknownProgressCount: 0 }, tasks },
  };
}

function Fixture() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1280px)").matches);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [mobileSurface, setMobileSurface] = useState("chat");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectA);
  const selectedProjectRef = useRef<string | null>(projectA);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("school:a");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>("task:school:a");
  const [draft, setDraft] = useState("");
  const projectSplit = useResizableProjectWorkspaceSplit(wide);
  const projectMode = selectedProjectId !== null;
  const navigationSplit = useResizableWorkspaceNavigationSplit({
    enabled: wide,
    minimumMainContentWidth: 784,
    projectMode,
  });
  const journey = journeyFor(selectedProjectId ?? projectA);
  const load = { journey, projectId: selectedProjectId ?? projectA, requestId: 1, state: {}, status: "ready" };

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function changeProject(projectId: string | null) {
    if (selectedProjectRef.current !== projectId) {
      selectedProjectRef.current = projectId;
      setSelectedNodeId(null);
      setSelectedTaskId(projectId ? "task:project:goal" : null);
      setDraft("");
    }
    setSelectedProjectId(projectId);
  }

  function selectTask(taskId: string) {
    setSelectedTaskId(taskId);
    const selected = journey.workflowProjection.tasks.find((entry) => entry.taskId === taskId);
    setSelectedNodeId(selected && selected.targetKind !== "project" ? "school:" + selected.targetId.slice(-1) : null);
  }

  const navigation = (
    <ProjectEntryPanel
      activeConversationId={null}
      availability="available"
      clearSelectionSignal={0}
      copy={copy.projectEntry}
      generalHeader={<><h2>AI Workspace</h2><button data-testid="fixture-new-conversation" type="button">New Conversation</button></>}
      locale="en"
      navigationBusy={false}
      onOpenProjectChat={() => undefined}
      onSelectedProjectChange={(id) => changeProject(id)}
      projectConversationAction={<button type="button">New standard conversation</button>}
      projectToolsNavigation={<nav data-testid="fixture-project-tools"><button type="button">Project records</button></nav>}
      recentConversations={<section aria-label="Recent conversations" />}
      selectedProjectId={selectedProjectId}
      workflowNavigation={projectMode ? (
        <ProjectWorkflowNavigation
          key={selectedProjectId}
          journeyCopy={copy.projectEntry.projectJourney}
          journeyLoad={load}
          locale="en"
          onRefresh={() => undefined}
          onSelectTarget={setSelectedNodeId}
          onSelectWorkflowTask={selectTask}
          selectedNodeId={selectedNodeId}
          selectedWorkflowTaskId={selectedTaskId}
        />
      ) : null}
    />
  );

  return (
    <>
      {!wide ? (
        <div className="mobile-controls">
          <button onClick={() => setMobileNavigationOpen(true)} type="button">Open navigation</button>
          <button onClick={() => setMobileSurface("chat")} type="button">Chat</button>
          <button onClick={() => setMobileSurface("task")} type="button">Task</button>
        </div>
      ) : null}
      <div
        className="workspace-layout"
        data-testid="workspace-layout-grid"
        ref={navigationSplit.containerRef}
        style={wide ? { gridTemplateColumns: navigationSplit.gridTemplateColumns } : undefined}
      >
        {wide ? (
          <aside className="desktop-navigation" data-testid="workspace-history-panel" id="workspace-history-panel">
            {navigation}
          </aside>
        ) : null}
        {wide ? (
          <WorkspaceNavigationSplitSeparator
            accessibleLabel={"Resize workspace navigation"}
            bounds={navigationSplit.bounds}
            controls="workspace-history-panel"
            handlers={navigationSplit.separatorHandlers}
            navigationWidth={navigationSplit.navigationWidth}
            projectMode={projectMode}
          />
        ) : null}
        <header className="project-header"><strong>Project Chat and Task Workspace</strong></header>
        <main
          className="project-workspace-split"
          data-testid="project-workspace-split"
          id="project-workspace-split-region"
          ref={wide ? projectSplit.paneRef : null}
          style={wide ? { gridTemplateColumns: projectWorkspaceSplitColumns(projectSplit.centerColumn) } : undefined}
        >
          <section
            className="chat-panel"
            data-testid="fixture-chat-panel"
            id="project-chat-region"
            style={!wide && mobileSurface !== "chat" ? { display: "none" } : undefined}
          >
              <ul data-testid="chat-message-list"><li>Existing message one</li><li>Existing message two</li></ul>
              <label>Composer<textarea data-testid="workspace-input" onChange={(event) => setDraft(event.target.value)} value={draft} /></label>
          </section>
          {wide ? (
            <ProjectWorkspaceSplitSeparator
              accessibleLabel="Resize conversation and task panels"
              centerWidth={projectSplit.centerWidth}
              controls="project-chat-region project-task-region"
              handlers={projectSplit.separatorHandlers}
              maxCenterWidth={projectSplit.maxCenterWidth}
              minCenterWidth={projectSplit.minCenterWidth}
            />
          ) : null}
          <aside
            className="task-panel"
            data-testid="fixture-task-panel"
            id="project-task-region"
            style={wide ? undefined : { display: mobileSurface === "task" ? "block" : "none" }}
          >
            Task Workspace
          </aside>
        </main>
      </div>
      {!wide && mobileNavigationOpen ? (
        <section className="mobile-navigation-sheet" aria-label="Mobile navigation" data-testid="mobile-navigation-sheet" role="dialog">
          <button onClick={() => setMobileNavigationOpen(false)} type="button">Close navigation</button>
          {navigation}
        </section>
      ) : null}
      <output data-testid="selected-project">{selectedProjectId ?? "none"}</output>
      <output data-testid="selected-target">{selectedNodeId ?? "none"}</output>
      <output data-testid="selected-task">{selectedTaskId}</output>
    </>
  );
}

const requests = [];
window.__navigationRequests = requests;
window.fetch = async (input, init = {}) => {
  const requestUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(requestUrl, window.location.href);
  const method = (init.method || "GET").toUpperCase();
  requests.push(method + " " + url.pathname);
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  if (url.pathname === "/api/projects" && method === "GET") {
    return json({ projects: [
      { id: projectA, displayName: "P15 M2 Synthetic Northbridge", status: "active", revision: 1, createdAt: timestamp, updatedAt: timestamp },
      { id: projectB, displayName: "P15 M2 Synthetic Harbour", status: "active", revision: 1, createdAt: timestamp, updatedAt: timestamp },
    ] });
  }
  if (/^\\/api\\/projects\\/[^/]+\\/chats$/.test(url.pathname) && method === "GET") {
    return json({ conversations: [], hasMore: false, nextCursor: null });
  }
  return new Response("Not found", { status: 404 });
};

createRoot(document.getElementById("root")).render(<Fixture />);
`;

let fixtureBundle = "";
let workspaceCss = "";

test.beforeAll(async () => {
  const globalCssPath = resolve(process.cwd(), "app/globals.css");
  const globalCssSource = await readFile(globalCssPath, "utf8");
  const cssResult = await postcss([tailwindcss()]).process(globalCssSource, {
    from: globalCssPath,
  });
  workspaceCss = cssResult.css;
  const result = await build({
    absWorkingDir: process.cwd(),
    bundle: true,
    define: { "process.env.NODE_ENV": '"production"' },
    format: "iife",
    platform: "browser",
    stdin: {
      contents: fixtureSource,
      loader: "tsx",
      resolveDir: process.cwd(),
      sourcefile: "phase15-m3-e2-5-navigation-fixture.tsx",
    },
    target: "chrome116",
    write: false,
  });
  fixtureBundle = result.outputFiles[0]?.text ?? "";
  expect(fixtureBundle.length).toBeGreaterThan(0);
});

test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/workspace.css") {
      await route.fulfill({ body: workspaceCss, contentType: "text/css" });
      return;
    }
    if (path === "/navigation.js") {
      await route.fulfill({
        body: fixtureBundle,
        contentType: "text/javascript",
      });
      return;
    }
    await route.fulfill({
      body: `<!doctype html>
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/workspace.css">
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          html, body, #root { width: 100%; height: 100%; margin: 0; }
          body { font: 14px/1.4 Arial, sans-serif; color: #0f172a; }
          #root { position: relative; overflow: hidden; }
          .mobile-controls { display: none; }
          .workspace-layout { display: grid; width: 100vw; height: 100vh; min-width: 0; grid-template-rows: 48px minmax(0, 1fr); }
          .desktop-navigation { min-width: 0; grid-column: 1; grid-row: 1 / span 2; overflow: auto; padding: 12px; background: #f1f5f9; }
          [data-testid="workspace-navigation-splitter"] { display: flex; grid-column: 2; grid-row: 1 / span 2; width: 24px; min-width: 24px; align-items: center; justify-content: center; border-inline: 1px solid #cbd5e1; background: #f8fafc; }
          [data-testid="workspace-navigation-splitter"] > span { width: 20px; height: 48px; display: flex; align-items: center; justify-content: center; border: 1px solid #94a3b8; border-radius: 999px; background: white; }
          .project-header { grid-column: 3; grid-row: 1; min-width: 0; padding: 12px; }
          .project-workspace-split { display: grid; grid-column: 3; grid-row: 2; min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
          .chat-panel, .task-panel { min-width: 0; height: 100%; overflow: hidden; padding: 12px; }
          .chat-panel { display: flex; flex-direction: column; justify-content: space-between; }
          .task-panel { background: #f8fafc; }
          [data-testid="project-workspace-splitter"] { display: flex; grid-column: 2; grid-row: 1; width: 24px; align-items: center; justify-content: center; background: #f8fafc; }
          [data-testid="project-workspace-splitter"] > span:first-child { width: 2px; height: 100%; background: #94a3b8; }
          [data-testid="project-workspace-splitter"] > span:nth-child(2) { width: 16px; height: 48px; border: 1px solid #64748b; border-radius: 999px; background: white; }
          .chat-panel textarea { display: block; width: 100%; height: 72px; }
          .mobile-navigation-sheet { display: none; }
          @media (max-width: 1279px) {
            .mobile-controls { display: flex; min-height: 44px; align-items: center; gap: 8px; }
            .workspace-layout { height: calc(100vh - 44px); grid-template-columns: minmax(0, 1fr) !important; grid-template-rows: minmax(0, 1fr); }
            .desktop-navigation, [data-testid="workspace-navigation-splitter"], .project-header, [data-testid="project-workspace-splitter"] { display: none !important; }
            .project-workspace-split { grid-column: 1; grid-row: 1; grid-template-columns: minmax(0, 1fr) !important; }
            .task-panel { display: none; }
            .mobile-navigation-sheet { display: block; position: fixed; inset: 0; z-index: 30; width: 100vw; height: 100dvh; overflow: auto; padding: 16px; background: white; }
          }
        </style></head><body><div id="root"></div><script src="/navigation.js"></script></body></html>`,
      contentType: "text/html",
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1/phase15-m3-e2-5-navigation-test");
  await expect(page.getByTestId("project-selector")).toBeVisible();
  await expect(
    page.getByTestId("project-navigation-tab-workflows")
  ).toBeVisible();
});

test("Project tabs preserve the current Chat draft while switching Projects clears it", async ({
  page,
}) => {
  const requests = await page.evaluate(
    () => window.__navigationRequests.length
  );
  const composer = page.getByTestId("workspace-input");
  await composer.fill("unsent draft remains in the current Project Chat");

  const taskB = page.locator('[data-workflow-task-id="task:school:b"]');
  await expect(taskB).toHaveCount(1);
  await page
    .locator(
      '[data-matter-id="school:b"] [data-testid="project-navigation-matter-toggle"]'
    )
    .click();
  await taskB.click();
  await expect(page.getByTestId("selected-target")).toHaveText("school:b");
  await expect(page.getByTestId("selected-task")).toHaveText("task:school:b");
  const schoolBMatter = page.locator('[data-matter-id="school:b"]');
  await schoolBMatter.getByTestId("project-navigation-matter-toggle").click();
  await expect(
    schoolBMatter.getByTestId("project-navigation-collapsed-current-task")
  ).toContainText("Current task: Planning and starting point");
  await schoolBMatter.getByTestId("project-navigation-matter-toggle").click();

  await page.getByTestId("project-navigation-tab-chats").click();
  await expect(
    page.getByTestId("project-navigation-panel-chats")
  ).toBeVisible();
  await expect(
    page.getByTestId("project-navigation-panel-workflows")
  ).toBeHidden();
  await expect(page.getByTestId("chat-message-list").locator("li")).toHaveCount(
    2
  );
  await expect(composer).toHaveValue(
    "unsent draft remains in the current Project Chat"
  );
  await expect(page.locator('[data-testid="project-entry-panel"]')).toHaveCount(
    1
  );
  expect(await page.evaluate(() => window.__navigationRequests.length)).toBe(
    requests
  );

  await page.getByTestId("project-navigation-tab-workflows").click();
  await expect(
    page.locator('[data-workflow-task-id="task:school:b"]')
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selected-target")).toHaveText("school:b");
  await expect(composer).toHaveValue(
    "unsent draft remains in the current Project Chat"
  );

  await page.getByTestId("project-selector").click();
  await page.getByRole("button", { name: /P15 M2 Synthetic Harbour/ }).click();
  await expect(page.getByTestId("selected-project")).toHaveText(
    "22222222-2222-4222-8222-222222222222"
  );
  await expect(page.getByTestId("project-selector")).toContainText(
    "P15 M2 Synthetic Harbour"
  );
  await expect(page.getByTestId("selected-target")).toHaveText("none");
  await expect(
    page.getByTestId("project-navigation-tab-workflows")
  ).toHaveAttribute("aria-selected", "true");
  await expect(composer).toHaveValue("");

  await page.getByTestId("back-to-all-conversations").click();
  await expect(page.getByTestId("workspace-my-projects")).toBeVisible();
  await expect(page.getByTestId("toggle-project-list")).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await page.getByTestId("toggle-project-list").click();
  await expect(page.getByTestId("toggle-project-list")).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await expect(page.getByTestId("workspace-project-list")).toBeHidden();
  await page.getByTestId("toggle-project-list").click();
  await page
    .getByRole("button", { name: /P15 M2 Synthetic Northbridge/ })
    .click();
  await expect(page.getByTestId("selected-project")).toHaveText(
    "11111111-1111-4111-8111-111111111111"
  );
  await expect(
    page.getByTestId("project-navigation-tab-workflows")
  ).toHaveAttribute("aria-selected", "true");
  await expect(composer).toHaveValue("");

  const mutatingRequests = await page.evaluate(() =>
    window.__navigationRequests.filter((entry) => !entry.startsWith("GET "))
  );
  expect(mutatingRequests).toEqual([]);
  await page.screenshot({
    path: "/tmp/phase15_m3_e2_5_desktop.png",
    fullPage: true,
  });
});

test("both independent splitters resize, persist, and preserve the minimum Chat and Task widths", async ({
  page,
}) => {
  for (const viewport of [1280, 1920]) {
    await page.setViewportSize({
      width: viewport,
      height: viewport === 1280 ? 800 : 900,
    });
    await page.evaluate(() =>
      localStorage.setItem(
        "phase15.workspace-navigation.split.v1",
        JSON.stringify({ version: 1, width: 280 })
      )
    );
    await page.reload();
    const leftSeparator = page.getByTestId("workspace-navigation-splitter");
    const centerRightSeparator = page.getByTestId("project-workspace-splitter");
    await expect(leftSeparator).toBeVisible();
    await expect(centerRightSeparator).toBeVisible();
    const hitTest = await leftSeparator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
      return {
        isSeparator: Boolean(hit && element.contains(hit)),
        cursor: hit ? getComputedStyle(hit).cursor : "",
      };
    });
    expect(hitTest).toEqual({ cursor: "col-resize", isSeparator: true });
    const leftBefore =
      (await page.getByTestId("workspace-history-panel").boundingBox())
        ?.width ?? 0;
    expect(leftBefore).toBe(280);
    const box = await leftSeparator.boundingBox();
    if (!box) {
      throw new Error("The desktop navigation separator has no bounding box.");
    }
    expect(box.width).toBe(24);
    expect(box.height).toBeGreaterThan(700);
    await page.mouse.move(box.x + 12, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 132, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const leftAfter =
      (await page.getByTestId("workspace-history-panel").boundingBox())
        ?.width ?? 0;
    expect(Math.abs(leftAfter - leftBefore - 120)).toBeLessThan(2);

    const chat = page.locator("#project-chat-region");
    const task = page.locator("#project-task-region");
    expect((await chat.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(460);
    expect((await task.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(300);
    await expect(centerRightSeparator).toHaveAttribute("aria-valuemin", "460");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(viewport);

    await leftSeparator.focus();
    await page.keyboard.press("ArrowRight");
    const keyboardWidth = Number(
      await leftSeparator.getAttribute("aria-valuenow")
    );
    expect(keyboardWidth).toBe(Math.min(400, leftAfter + 32));
    await page.keyboard.press("Home");
    expect(Number(await leftSeparator.getAttribute("aria-valuenow"))).toBe(236);
    await page.keyboard.press("End");
    expect(Number(await leftSeparator.getAttribute("aria-valuenow"))).toBe(400);
    await page.reload();
    await expect(leftSeparator).toBeVisible();
    expect(Number(await leftSeparator.getAttribute("aria-valuenow"))).toBe(400);

    await centerRightSeparator.focus();
    const centerBefore = (await chat.boundingBox())?.width ?? 0;
    await page.keyboard.press("ArrowLeft");
    expect(
      Math.round(centerBefore - ((await chat.boundingBox())?.width ?? 0))
    ).toBe(32);
    expect((await task.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(300);
  }

  await page.evaluate(() =>
    localStorage.setItem("phase15.workspace-navigation.split.v1", "{broken")
  );
  await page.reload();
  await expect(
    page.getByTestId("workspace-navigation-splitter")
  ).toHaveAttribute("aria-valuenow", "288");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(1920);
});

test("mobile navigation uses one drawer and omits both desktop splitters without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open navigation" })
  ).toBeVisible();
  await expect(page.getByTestId("workspace-navigation-splitter")).toHaveCount(
    0
  );
  await expect(page.getByTestId("project-workspace-splitter")).toHaveCount(0);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByTestId("mobile-navigation-sheet")).toBeVisible();
  await expect(page.locator('[data-testid="project-entry-panel"]')).toHaveCount(
    1
  );
  await expect(
    page.getByTestId("project-navigation-tab-workflows")
  ).toBeVisible();
  await page.getByTestId("project-navigation-tab-chats").click();
  await page.getByTestId("project-navigation-tab-workflows").click();
  await page.screenshot({
    path: "/tmp/phase15_m3_e2_5_mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close navigation" }).click();
  const composer = page.getByTestId("workspace-input");
  await composer.fill("mobile draft stays mounted");
  await page.getByRole("button", { name: "Task" }).click();
  await expect(page.getByTestId("fixture-chat-panel")).toBeHidden();
  await expect(page.getByTestId("fixture-task-panel")).toBeVisible();
  await expect(composer).toHaveValue("mobile draft stays mounted");
  await page.getByRole("button", { name: "Chat" }).click();
  await expect(page.getByTestId("fixture-chat-panel")).toBeVisible();
  await expect(page.getByTestId("fixture-task-panel")).toBeHidden();
  await expect(composer).toHaveValue("mobile draft stays mounted");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
});
