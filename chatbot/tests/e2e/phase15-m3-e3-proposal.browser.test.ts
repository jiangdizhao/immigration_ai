import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

const projectId = "11111111-1111-4111-8111-111111111111";
const schoolId = "22222222-2222-4222-8222-222222222222";

const fixtureSource = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ProjectActionProposalPanel } from "./components/project-action-proposal-panel";
import { projectActionProposalContextKey } from "./lib/workspace/action-proposal-context-key";

const projectId = ${JSON.stringify(projectId)};
const schoolId = ${JSON.stringify(schoolId)};
const aiSuggestion = {
  schemaVersion: "phase15.bound-ai-action-suggestion.v1",
  suggestion: {
    schemaVersion: "phase15.ai-action-suggestion.v1",
    operation: "set_customer_reported_field",
    fieldPath: "schoolApplication.intakeLabel",
    proposedValue: "July 2027",
    targetReference: null,
    sourceOrAssumption: "The user requested July 2027.",
    explanation: "This is a customer-reported intake label.",
  },
  projectId,
  chatId: "33333333-3333-4333-8333-333333333333",
  taskId: "phase15.project-workflows.v1:school_application:school_discovery:school_application:school-a",
  definitionVersion: "phase15.project-workflows.v1",
  workflowKind: "school_application",
  stepKey: "school_discovery",
  targetKind: "school_application",
  targetId: schoolId,
  sourceRevisions: [{ targetKind: "school_application", targetId: schoolId, revision: 4 }],
};
const task = {
  actionability: "unavailable",
  applicability: "unavailable",
  definitionVersion: "phase15.project-workflows.v1",
  dependencies: [],
  dependencySemantics: "none",
  panelKind: "school",
  progress: "needs_information",
  progressCreditKey: null,
  progressCreditOwner: false,
  projectId,
  reasonCodes: ["school_course_source_unverified"],
  responsibleActor: "customer",
  sourceRevision: 4,
  sourceRevisions: [{ targetKind: "school_application", targetId: schoolId, revision: 4 }],
  stepKey: "school_discovery",
  targetId: schoolId,
  targetKind: "school_application",
  taskId: "phase15.project-workflows.v1:school_application:school_discovery:school_application:school-a",
  workflowKind: "school_application",
};

function Fixture() {
  const [draft, setDraft] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);
  const [chatId, setChatId] = useState("33333333-3333-4333-8333-333333333333");
  const [project, setProject] = useState(projectId);
  const [target, setTarget] = useState(schoolId);
  const [revision, setRevision] = useState(4);
  const [taskSelection, setTaskSelection] = useState(0);
  const currentTask = {
    ...task,
    projectId: project,
    sourceRevision: revision,
    sourceRevisions: [{ targetKind: "school_application", targetId: target, revision }],
    targetId: target,
    taskId: taskSelection ? "school-task-b" : task.taskId,
  };
  return <main className="mx-auto grid max-w-4xl gap-4 p-4 md:grid-cols-2">
    <section aria-label="Project Chat" className="space-y-3 rounded-xl border bg-white p-4">
      <h2>Project Chat</h2>
      <p>Existing Project message</p>
      <label>Composer<textarea data-testid="e3-composer" onChange={event => setDraft(event.currentTarget.value)} value={draft} /></label>
    </section>
    <section aria-label="Task Workspace" className="space-y-3 rounded-xl border bg-white p-4">
      <button type="button" onClick={() => setChatId("44444444-4444-4444-8444-444444444444")}>Switch Chat</button>
      <button type="button" onClick={() => setProject("55555555-5555-4555-8555-555555555555")}>Switch Project</button>
      <button type="button" onClick={() => setTarget("66666666-6666-4666-8666-666666666666")}>Switch School</button>
      <button type="button" onClick={() => setTaskSelection(value => 1 - value)}>Select Task</button>
      <button type="button" onClick={() => setRevision(value => value + 1)}>Refresh Revision</button>
      <ProjectActionProposalPanel aiActionSuggestion={aiSuggestion} chatId={chatId} key={projectActionProposalContextKey({ chatId, projectId: project, task: currentTask })} locale="en" onApplied={() => setRefreshCount(value => value + 1)} projectId={project} task={currentTask} />
      <output data-testid="e3-refresh-count">{refreshCount}</output>
    </section>
  </main>;
}

createRoot(document.getElementById("root")).render(<Fixture />);
`;

let fixtureBundle = "";
let workspaceCss = "";

test.beforeAll(async () => {
  const globalCssPath = resolve(process.cwd(), "app/globals.css");
  const cssSource = await readFile(globalCssPath, "utf8");
  workspaceCss = (
    await postcss([tailwindcss()]).process(cssSource, { from: globalCssPath })
  ).css;
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
      sourcefile: "phase15-m3-e3-proposal-fixture.tsx",
    },
    target: "chrome116",
    write: false,
  });
  fixtureBundle = result.outputFiles[0]?.text ?? "";
  expect(fixtureBundle.length).toBeGreaterThan(0);
});

test("proposal preview and cancel do not write; explicit confirmation reads back and refreshes", async ({
  page,
}) => {
  const proposalRequests: unknown[] = [];
  const confirmationRequests: unknown[] = [];
  await page.route("http://127.0.0.1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/workspace.css") {
      await route.fulfill({ body: workspaceCss, contentType: "text/css" });
      return;
    }
    if (url.pathname === "/layout.js") {
      await route.fulfill({
        body: fixtureBundle,
        contentType: "text/javascript",
      });
      return;
    }
    if (url.pathname === `/api/projects/${projectId}/action-proposals`) {
      proposalRequests.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          proposal: {
            proposalId: "proposal-synthetic",
            projectId,
            targetKind: "school_application",
            targetId: schoolId,
            fieldPath: "schoolApplication.intakeLabel",
            baseRevision: 4,
            display: {
              targetLabel: "Northbridge University",
              currentValue: "March 2027",
              proposedValue: "July 2027",
              sourceLabel:
                "Customer-entered proposal; not an official intake observation.",
              packageNote:
                "Existing package freshness will be re-evaluated by the owning service.",
            },
          },
          confirmationToken: "server-issued-synthetic-token",
        },
      });
      return;
    }
    if (
      url.pathname === `/api/projects/${projectId}/action-proposals/confirm`
    ) {
      confirmationRequests.push(route.request().postDataJSON());
      await route.fulfill({
        json: { status: "applied", readback: "verified" },
      });
      return;
    }
    await route.fulfill({
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/workspace.css"><style>html,body,#root{min-height:100%;margin:0}body{font:14px/1.5 Arial,sans-serif;background:#f8fafc}</style></head><body><div id="root"></div><script src="/layout.js"></script></body></html>`,
      contentType: "text/html",
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1/phase15-m3-e3-proposal-test");

  const composer = page.getByTestId("e3-composer");
  await composer.fill("unsent chat draft remains mounted");
  await expect(
    page.getByText("The saved intake remains customer-reported.")
  ).toBeVisible();
  await expect(page.getByTestId("project-ai-action-suggestion")).toBeVisible();
  await expect(page.getByText("The user requested July 2027.")).toBeVisible();
  await page.getByRole("button", { name: "Review this AI suggestion" }).click();
  expect(proposalRequests).toHaveLength(1);
  expect(proposalRequests[0]).toMatchObject({
    fieldPath: "schoolApplication.intakeLabel",
    proposedValue: "July 2027",
  });
  expect(confirmationRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel("Intake label (customer-reported)").fill("July 2027");
  await page.getByRole("button", { name: "Review change" }).click();
  const preview = page
    .getByTestId("project-action-proposal-panel")
    .locator("dl")
    .filter({
      has: page.getByText("March 2027", { exact: true }),
    });
  await expect(preview).toHaveCount(1);
  await expect(preview.getByText("March 2027", { exact: true })).toBeVisible();
  await expect(preview.getByText("July 2027", { exact: true })).toBeVisible();
  await expect(preview.getByText("4", { exact: true })).toBeVisible();
  expect(proposalRequests).toHaveLength(2);
  expect(confirmationRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(confirmationRequests).toHaveLength(0);
  await expect(page.getByTestId("e3-refresh-count")).toHaveText("0");

  await page.getByLabel("Intake label (customer-reported)").fill("July 2027");
  await page.getByRole("button", { name: "Review change" }).click();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByTestId("e3-refresh-count")).toHaveText("1");
  expect(confirmationRequests).toHaveLength(1);
  expect(confirmationRequests[0]).toEqual({
    confirmationToken: "server-issued-synthetic-token",
  });
  await expect(composer).toHaveValue("unsent chat draft remains mounted");
  await expect(page.getByText("Existing Project message")).toBeVisible();
});

test("preview and token are invalidated when Chat, Project, target, task or source revision changes", async ({
  page,
}) => {
  await page.route("http://127.0.0.1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/workspace.css") {
      await route.fulfill({ body: workspaceCss, contentType: "text/css" });
      return;
    }
    if (url.pathname === "/layout.js") {
      await route.fulfill({
        body: fixtureBundle,
        contentType: "text/javascript",
      });
      return;
    }
    if (url.pathname === `/api/projects/${projectId}/action-proposals`) {
      await route.fulfill({
        json: {
          proposal: {
            proposalId: "proposal-synthetic",
            projectId,
            targetKind: "school_application",
            targetId: schoolId,
            fieldPath: "schoolApplication.intakeLabel",
            baseRevision: 4,
            display: {
              targetLabel: "Northbridge University",
              currentValue: "March 2027",
              proposedValue: "July 2027",
              sourceLabel: "Customer-entered proposal.",
              packageNote: "Freshness is checked by the owning service.",
            },
          },
          confirmationToken: "server-issued-synthetic-token",
        },
      });
      return;
    }
    await route.fulfill({
      body: "<!doctype html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'><link rel='stylesheet' href='/workspace.css'></head><body><div id='root'></div><script src='/layout.js'></script></body></html>",
      contentType: "text/html",
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1/phase15-m3-e3-proposal-test");
  const composer = page.getByTestId("e3-composer");
  await composer.fill("keep this unsent chat draft");

  for (const control of [
    "Switch Chat",
    "Switch School",
    "Select Task",
    "Refresh Revision",
    "Switch Project",
  ]) {
    await page.getByLabel("Intake label (customer-reported)").fill("July 2027");
    await page.getByRole("button", { name: "Review change" }).click();
    await expect(
      page.getByRole("button", { name: "Confirm and save" })
    ).toBeVisible();
    await page.getByRole("button", { name: control }).click();
    await expect(
      page.getByRole("button", { name: "Confirm and save" })
    ).toHaveCount(0);
    await expect(composer).toHaveValue("keep this unsent chat draft");
  }
});

test("late preview response after Chat navigation cannot restore a stale confirmation token", async ({
  page,
}) => {
  let releaseResponse!: () => void;
  let signalRequest!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const requestStarted = new Promise<void>((resolve) => {
    signalRequest = resolve;
  });
  await page.route("http://127.0.0.1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/workspace.css") {
      await route.fulfill({ body: workspaceCss, contentType: "text/css" });
      return;
    }
    if (url.pathname === "/layout.js") {
      await route.fulfill({
        body: fixtureBundle,
        contentType: "text/javascript",
      });
      return;
    }
    if (url.pathname === `/api/projects/${projectId}/action-proposals`) {
      signalRequest();
      await responseGate;
      await route.fulfill({
        json: {
          proposal: {
            proposalId: "late-proposal",
            projectId,
            targetKind: "school_application",
            targetId: schoolId,
            fieldPath: "schoolApplication.intakeLabel",
            baseRevision: 4,
            display: {
              targetLabel: "Northbridge University",
              currentValue: "March 2027",
              proposedValue: "July 2027",
              sourceLabel: "Customer-entered proposal.",
              packageNote: "Freshness is checked by the owning service.",
            },
          },
          confirmationToken: "late-stale-token",
        },
      });
      return;
    }
    await route.fulfill({
      body: "<!doctype html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'><link rel='stylesheet' href='/workspace.css'></head><body><div id='root'></div><script src='/layout.js'></script></body></html>",
      contentType: "text/html",
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1/phase15-m3-e3-proposal-test");
  const composer = page.getByTestId("e3-composer");
  await composer.fill("draft survives a late response");
  await page.getByLabel("Intake label (customer-reported)").fill("July 2027");
  await page.getByRole("button", { name: "Review change" }).click();
  await requestStarted;
  await page.getByRole("button", { name: "Switch Chat" }).click();
  releaseResponse();
  await expect(
    page.getByRole("button", { name: "Confirm and save" })
  ).toHaveCount(0);
  await expect(composer).toHaveValue("draft survives a late response");
});
