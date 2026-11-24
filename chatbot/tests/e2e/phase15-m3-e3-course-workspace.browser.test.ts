import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Route, test } from "@playwright/test";
import tailwindcss from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

const projectId = "11111111-1111-4111-8111-111111111111";
const chatId = "22222222-2222-4222-8222-222222222222";
const schoolId = "33333333-3333-4333-8333-333333333333";
const assistantMessageId = "44444444-4444-4444-8444-444444444444";
const sourceId = "55555555-5555-4555-8555-555555555555";
const verifiedSourceId = "66666666-6666-4666-8666-666666666666";
const candidateId = "77777777-7777-4777-8777-777777777777";
const secondCandidateId = "88888888-8888-4888-8888-888888888888";

const fixtureSource = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CourseResearchWorkspace } from "./components/course-research-workspace";

const projectId = ${JSON.stringify(projectId)};
const chatId = ${JSON.stringify(chatId)};
const schoolId = ${JSON.stringify(schoolId)};
const task = {
  actionability: "unavailable",
  applicability: "unavailable",
  definitionVersion: "phase15.project-workflows.v1",
  dependencies: [],
  dependencySemantics: "none",
  panelKind: "unavailable",
  progress: "needs_information",
  progressCreditKey: null,
  progressCreditOwner: true,
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
const source = {
  sourceId: ${JSON.stringify(sourceId)},
  url: "https://courses.example.edu.au/master-example",
  title: "Example University course page",
  authority: "approved_institution_source",
  association: "observed_only",
  observedAt: "2026-11-24T00:00:00.000Z",
  currentness: "unknown",
  manifestId: "reviewed-example-course-manifest",
};
const result = {
  schemaVersion: "phase15.course-research-result.v1",
  projectId,
  chatId,
  assistantMessageId: ${JSON.stringify(assistantMessageId)},
  taskId: task.taskId,
  definitionVersion: task.definitionVersion,
  workflowKind: "school_application",
  stepKey: "school_discovery",
  targetKind: "school_application",
  targetId: schoolId,
  sourceRevisions: task.sourceRevisions,
  observedAt: "2026-11-24T00:00:00.000Z",
  candidates: [
    {
      candidateId: ${JSON.stringify(candidateId)},
      institutionName: "Example University",
      courseTitle: "Master of Example Studies",
      identityEvidenceLevel: "model_research_lead",
      identitySourceIds: [],
      fields: [
        { key: "course_code", value: "EX-2027", evidenceLevel: "model_research_lead", sourceIds: [source.sourceId], applicabilityNote: null, independentObservation: null },
        { key: "campus_location", value: "Sydney", evidenceLevel: "model_research_lead", sourceIds: [], applicabilityNote: null, independentObservation: null },
        { key: "tuition_amount", value: "AUD 42,000", evidenceLevel: "model_research_lead", sourceIds: [], applicabilityNote: "Fee basis unknown", independentObservation: null },
      ],
      sources: [source],
      limitations: ["Course availability and fee currentness are unknown."],
      verificationState: "not_requested",
    },
    {
      candidateId: ${JSON.stringify(secondCandidateId)},
      institutionName: "Harbour Institute",
      courseTitle: "Bachelor of Example Practice",
      identityEvidenceLevel: "model_research_lead",
      identitySourceIds: [],
      fields: [
        { key: "qualification", value: "Bachelor degree", evidenceLevel: "model_research_lead", sourceIds: [], applicabilityNote: null, independentObservation: null },
      ],
      sources: [],
      limitations: ["Candidate is a research lead and is not independently verified."],
      verificationState: "not_requested",
    },
  ],
  limitations: ["Provider-native search does not expose exact source text to this application."],
  diagnostics: { invalidCandidateCount: 0 },
};

function Fixture() {
  const [draft, setDraft] = useState("unsent study preferences");
  const [refreshCount, setRefreshCount] = useState(0);
  const [scope, setScope] = useState({ projectId, chatId, task, result });
  function switchChat() {
    const nextChatId = "99999999-9999-4999-8999-999999999999";
    setScope(current => ({
      ...current,
      chatId: nextChatId,
      result: { ...current.result, chatId: nextChatId },
    }));
  }
  function switchSchool() {
    const schoolBId = "99999999-9999-4999-8999-999999999998";
    const nextSchoolId = scope.task.targetId === schoolId ? schoolBId : schoolId;
    const nextTask = {
      ...scope.task,
      taskId: "phase15.project-workflows.v1:school_application:school_discovery:school_application:" + nextSchoolId,
      targetId: nextSchoolId,
      sourceRevision: 4,
      sourceRevisions: scope.task.sourceRevisions.map(revision => ({ ...revision, targetId: nextSchoolId, revision: 4 })),
    };
    setScope(current => ({
      ...current,
      task: nextTask,
      result: {
        ...current.result,
        assistantMessageId: nextSchoolId === schoolId ? "44444444-4444-4444-8444-444444444444" : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        targetId: nextSchoolId,
        taskId: nextTask.taskId,
        sourceRevisions: nextTask.sourceRevisions,
      },
    }));
  }
  function switchProject() {
    const nextProjectId = scope.projectId === projectId
      ? "99999999-9999-4999-8999-999999999997"
      : projectId;
    setScope(current => ({
      ...current,
      projectId: nextProjectId,
      task: { ...current.task, projectId: nextProjectId },
      result: { ...current.result, projectId: nextProjectId },
    }));
  }
  function switchTask() {
    const nextTaskId = scope.task.taskId.endsWith(":alternate")
      ? scope.task.taskId.slice(0, -":alternate".length)
      : scope.task.taskId + ":alternate";
    setScope(current => ({
      ...current,
      task: { ...current.task, taskId: nextTaskId },
      result: { ...current.result, taskId: nextTaskId },
    }));
  }
  function switchResearchMessage() {
    setScope(current => ({
      ...current,
      result: {
        ...current.result,
        assistantMessageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    }));
  }
  function changeRevision() {
    setScope(current => ({
      ...current,
      task: {
        ...current.task,
        sourceRevision: current.task.sourceRevision + 1,
        sourceRevisions: current.task.sourceRevisions.map(revision => ({
          ...revision,
          revision: revision.revision + 1,
        })),
      },
    }));
  }
  return <main className="mx-auto grid min-w-0 max-w-5xl gap-4 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <section className="min-w-0 rounded-xl border bg-white p-3">
      <h2>Project Chat</h2>
      <label className="mt-3 block text-xs">Composer<textarea data-testid="composer-draft" className="mt-1 w-full rounded border p-2" onChange={event => setDraft(event.currentTarget.value)} value={draft} /></label>
      <nav className="mt-2 flex flex-wrap gap-2">
        <button data-testid="scope-chat" onClick={switchChat}>Switch Chat</button>
        <button data-testid="scope-project" onClick={switchProject}>Switch Project</button>
        <button data-testid="scope-task" onClick={switchTask}>Switch task</button>
        <button data-testid="scope-school" onClick={switchSchool}>Switch School</button>
        <button data-testid="scope-research-message" onClick={switchResearchMessage}>New research</button>
        <button data-testid="scope-revision" onClick={changeRevision}>Change revision</button>
        <button data-testid="ordinary-turn" onClick={() => setRefreshCount(value => value + 1)}>Ordinary answer</button>
      </nav>
    </section>
    <section className="min-w-0 overflow-hidden rounded-xl border bg-white p-3">
      <CourseResearchWorkspace result={scope.result} projectId={scope.projectId} chatId={scope.chatId} task={scope.task} locale="en" onApplied={() => setRefreshCount(value => value + 1)} />
      <output data-testid="refresh-count">{refreshCount}</output>
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
  const bundled = await build({
    absWorkingDir: process.cwd(),
    bundle: true,
    define: { "process.env.NODE_ENV": '"production"' },
    format: "iife",
    platform: "browser",
    stdin: {
      contents: fixtureSource,
      loader: "tsx",
      resolveDir: process.cwd(),
      sourcefile: "phase15-m3-e3-course-fixture.tsx",
    },
    target: "chrome116",
    write: false,
  });
  fixtureBundle = bundled.outputFiles[0]?.text ?? "";
  expect(fixtureBundle.length).toBeGreaterThan(0);
});

test("course research filtering, comparison, L3 field display, proposal and responsive layout", async ({
  page,
}) => {
  const verificationRequests: unknown[] = [];
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
    if (url.pathname.endsWith("/course-research/verify")) {
      verificationRequests.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          status: "verified",
          field: {
            key: "course_code",
            value: "EX-2027",
            evidenceLevel: "independently_verified_field",
            sourceIds: [sourceId, verifiedSourceId],
            applicabilityNote: null,
            independentObservation: {
              observedAt: "2026-11-24T00:01:00.000Z",
              sourceId: verifiedSourceId,
              sourceUrl: "https://courses.example.edu.au/master-example",
              manifestId: "reviewed-example-course-manifest",
              snapshotSha256: "a".repeat(64),
              locator: "jsonld:Course.courseCode",
              effectiveFrom: null,
              effectiveTo: null,
              value: "EX-2027",
            },
          },
          source: {
            sourceId: verifiedSourceId,
            url: "https://courses.example.edu.au/master-example",
            title: "Example University course page",
            authority: "approved_institution_source",
            association: "observed_only",
            observedAt: "2026-11-24T00:01:00.000Z",
            currentness: "unknown",
            manifestId: "reviewed-example-course-manifest",
          },
          attestation: "synthetic-course-verification-attestation",
        },
      });
      return;
    }
    if (url.pathname.endsWith("/action-proposals")) {
      proposalRequests.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          display: {
            targetLabel: "School Application — Northbridge",
            changes: [
              {
                field: "Institution",
                oldValue: "Northbridge",
                proposedValue: "Example University",
              },
              {
                field: "Course",
                oldValue: "Recorded course",
                proposedValue: "Master of Example Studies",
              },
              {
                field: "Intake",
                oldValue: "March 2027",
                proposedValue: "Unknown",
              },
            ],
            evidenceLabel:
              "Official source cited; the field was not independently verified.",
            limitations: [
              "Customer-selected preparation data; no admission or CoE outcome is established.",
            ],
            packageNote: "The current package will be re-evaluated after save.",
          },
          confirmationToken: "server-issued-synthetic-token",
        },
      });
      return;
    }
    if (url.pathname.endsWith("/action-proposals/confirm")) {
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
  await page.goto("http://127.0.0.1/phase15-m3-e3-course-workspace-test");

  const cards = page.getByTestId("course-candidate-card");
  await expect(cards).toHaveCount(2);
  await page
    .getByRole("button", { name: "Compare", exact: true })
    .nth(0)
    .click();
  await page
    .getByRole("button", { name: "Compare", exact: true })
    .nth(1)
    .click();
  await expect(page.getByTestId("course-comparison")).toBeVisible();
  await page
    .getByRole("button", { name: "Shortlist", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("course-shortlist-count")).toContainText("1");
  expect(proposalRequests).toHaveLength(0);
  expect(confirmationRequests).toHaveLength(0);

  await page.getByLabel("Location").selectOption("Sydney");
  await expect(cards).toHaveCount(1);
  await page.getByLabel("Include unknown values in filters").check();
  await expect(cards).toHaveCount(2);
  await page.getByLabel("Location").selectOption("");

  await page
    .getByRole("button", { name: "Try independent field verification" })
    .click();
  await expect(
    page.getByText("EX-2027 · Independently verified")
  ).toBeVisible();
  expect(verificationRequests).toHaveLength(1);
  expect(proposalRequests).toHaveLength(0);

  await page
    .getByRole("button", { name: "Select and preview" })
    .first()
    .click();
  await expect(page.getByTestId("course-selection-preview")).toBeVisible();
  expect(proposalRequests).toHaveLength(1);
  expect(proposalRequests[0]).toMatchObject({
    operation: "select_school_course_candidate",
    verificationAttestations: ["synthetic-course-verification-attestation"],
  });
  expect(confirmationRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(confirmationRequests).toHaveLength(0);
  await page
    .getByRole("button", { name: "Select and preview" })
    .first()
    .click();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByTestId("refresh-count")).toHaveText("1");
  expect(confirmationRequests).toHaveLength(1);
  expect(confirmationRequests[0]).toEqual({
    confirmationToken: "server-issued-synthetic-token",
  });
  await expect(page.getByTestId("composer-draft")).toHaveValue(
    "unsent study preferences"
  );

  for (const viewport of [
    { width: 1920, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      workspace:
        document
          .querySelector('[data-testid="course-research-workspace"]')
          ?.getBoundingClientRect().width ?? 0,
      comparison: document.querySelector(
        '[data-testid="course-comparison"]'
      ) as HTMLElement | null,
    }));
    expect(dimensions.workspace).toBeGreaterThan(0);
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    if (dimensions.comparison) {
      expect(dimensions.comparison.scrollWidth).toBeGreaterThanOrEqual(
        dimensions.comparison.clientWidth
      );
    }
  }
});

test("mounted course workspace invalidates scoped state but retains it for ordinary rerenders", async ({
  page,
}) => {
  let holdPreview = false;
  let holdVerification = false;
  const pendingPreviews: Route[] = [];
  const pendingVerifications: Route[] = [];
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
    if (url.pathname.endsWith("/course-research/verify")) {
      if (holdVerification) {
        holdVerification = false;
        pendingVerifications.push(route);
        return;
      }
      await route.fulfill({
        status: 503,
        json: { status: "verification_unavailable" },
      });
      return;
    }
    if (url.pathname.endsWith("/action-proposals")) {
      if (holdPreview) {
        holdPreview = false;
        pendingPreviews.push(route);
        return;
      }
      await route.fulfill({
        json: {
          display: {
            targetLabel: "School Application — Example University",
            changes: [],
            evidenceLabel: "AI research lead; not independently verified.",
            limitations: [],
            packageNote: "Current package will be re-evaluated.",
          },
          confirmationToken: "scope-bound-test-token",
        },
      });
      return;
    }
    if (url.pathname.endsWith("/action-proposals/confirm")) {
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
  await page.goto("http://127.0.0.1/phase15-m3-e3-course-workspace-scope-test");

  await page
    .getByRole("button", { name: "Select and preview" })
    .first()
    .click();
  await expect(page.getByTestId("course-selection-preview")).toBeVisible();
  await page.getByTestId("scope-chat").click();
  await expect(page.getByTestId("course-selection-preview")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Confirm and save" })
  ).toHaveCount(0);
  await expect(page.getByTestId("composer-draft")).toHaveValue(
    "unsent study preferences"
  );

  await page
    .getByRole("button", { name: "Select and preview" })
    .first()
    .click();
  await expect(page.getByTestId("course-selection-preview")).toBeVisible();
  await page.getByTestId("ordinary-turn").click();
  await expect(page.getByTestId("course-selection-preview")).toBeVisible();
  await page.getByTestId("scope-research-message").click();
  await expect(page.getByTestId("course-selection-preview")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Compare", exact: true })
    .nth(0)
    .click();
  await page
    .getByRole("button", { name: "Compare", exact: true })
    .nth(1)
    .click();
  await page
    .getByRole("button", { name: "Shortlist", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("course-comparison")).toBeVisible();
  await expect(page.getByTestId("course-shortlist-count")).toContainText("1");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("course-comparison")).toBeVisible();
  await expect(page.getByTestId("course-shortlist-count")).toContainText("1");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByTestId("scope-school").click();
  await expect(page.getByTestId("course-comparison")).toHaveCount(0);
  await expect(page.getByTestId("course-shortlist-count")).toContainText("0");

  await page
    .getByRole("button", { name: "Select and preview" })
    .first()
    .click();
  await expect(page.getByTestId("course-selection-preview")).toBeVisible();
  await page.getByTestId("scope-project").click();
  await expect(page.getByTestId("course-selection-preview")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Confirm and save" })
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: "Select and preview" })
    .first()
    .click();
  await expect(page.getByTestId("course-selection-preview")).toBeVisible();
  await page.getByTestId("scope-task").click();
  await expect(page.getByTestId("course-selection-preview")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Confirm and save" })
  ).toHaveCount(0);

  holdPreview = true;
  await page
    .getByRole("button", { name: "Select and preview" })
    .first()
    .click();
  await expect.poll(() => pendingPreviews.length).toBe(1);
  await page.getByTestId("scope-revision").click();
  await pendingPreviews[0]?.fulfill({
    json: {
      display: {
        targetLabel: "Old target",
        changes: [],
        evidenceLabel: "Old research result",
        limitations: [],
        packageNote: "Old package",
      },
      confirmationToken: "late-old-scope-token",
    },
  });
  await expect(page.getByTestId("course-selection-preview")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Confirm and save" })
  ).toHaveCount(0);

  holdVerification = true;
  await page
    .getByRole("button", { name: "Try independent field verification" })
    .click();
  await expect.poll(() => pendingVerifications.length).toBe(1);
  await page.getByTestId("scope-school").click();
  await pendingVerifications[0]?.fulfill({
    json: {
      status: "verified",
      field: {
        key: "course_code",
        value: "EX-2027",
        evidenceLevel: "independently_verified_field",
        sourceIds: [sourceId, verifiedSourceId],
        applicabilityNote: null,
        independentObservation: {
          observedAt: "2026-11-24T00:01:00.000Z",
          sourceId: verifiedSourceId,
          sourceUrl: "https://courses.example.edu.au/master-example",
          manifestId: "reviewed-example-course-manifest",
          snapshotSha256: "a".repeat(64),
          locator: "jsonld:Course.courseCode",
          effectiveFrom: null,
          effectiveTo: null,
          value: "EX-2027",
        },
      },
      source: {
        sourceId: verifiedSourceId,
        url: "https://courses.example.edu.au/master-example",
        title: "Example University course page",
        authority: "approved_institution_source",
        association: "observed_only",
        observedAt: "2026-11-24T00:01:00.000Z",
        currentness: "unknown",
        manifestId: "reviewed-example-course-manifest",
      },
      attestation: "late-old-scope-attestation",
    },
  });
  await expect(page.getByText("EX-2027 · Independently verified")).toHaveCount(
    0
  );
  await expect(page.getByTestId("composer-draft")).toHaveValue(
    "unsent study preferences"
  );
});
