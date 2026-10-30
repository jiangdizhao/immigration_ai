import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SchoolAdmissionsWorkflowPanel } from "../../components/school-admissions-workflow-panel";
import { SchoolApplicationsPanel } from "../../components/school-applications-panel";
import { getWorkspaceCopy } from "../workspace-copy";
import { readyApplication } from "./fixtures";
import { createM5IntegrationHarness } from "./harness";

/**
 * I-11 — bilingual UI and API integration (offline, not browser E2E).
 *
 * Real HTTP handlers and real client transport are exercised; component
 * rendering is server-side markup only, so this is NOT browser coverage.
 */
function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

test("I-11 the admissions HTTP surface enforces session, flag and schema", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);
  const { admissionHandlers } = harness.http;

  // No session: authentication is required before any Project data is read.
  const anonymous = await admissionHandlers.list(
    new Request("http://localhost/api"),
    harness.projectId
  );
  assert.equal(anonymous.status, 401);

  harness.session.signIn(harness.ownerUserId);
  const listed = await admissionHandlers.list(
    new Request("http://localhost/api"),
    harness.projectId
  );
  assert.equal(listed.status, 200);
  const listedBody = (await listed.json()) as {
    applications: { applicationId: string; hasCase: boolean }[];
    cases: unknown[];
  };
  assert.equal(listedBody.applications.length, 1);
  assert.equal(
    listedBody.applications[0]?.applicationId,
    ready.application.applicationId
  );

  // Feature disabled -> the whole surface is hidden, not a partial success.
  harness.flags.setAdmissionsEnabled(false);
  const disabled = await admissionHandlers.list(
    new Request("http://localhost/api"),
    harness.projectId
  );
  assert.equal(disabled.status, 404);
  harness.flags.setAdmissionsEnabled(true);

  // Missing schema (migration 0047 unapplied) -> 503, never a fake empty list.
  harness.flags.setSchemaAvailable(false);
  const missingSchema = await admissionHandlers.list(
    new Request("http://localhost/api"),
    harness.projectId
  );
  assert.equal(missingSchema.status, 503);
  harness.flags.setSchemaAvailable(true);

  // A real write through HTTP.
  const created = await admissionHandlers.create(
    jsonRequest({
      applicationId: ready.application.applicationId,
      operationId: "http-case-1",
      originKind: "school_application",
    }),
    harness.projectId
  );
  assert.equal(created.status, 201);
  const createdBody = (await created.json()) as {
    case: { caseId: string; applicationId: string };
  };
  assert.equal(createdBody.case.applicationId, ready.application.applicationId);

  // Unauthorized actor: 404 (existence-hiding), no data leaked.
  harness.session.signIn(harness.strangerUserId);
  const forbidden = await admissionHandlers.get(
    new Request("http://localhost/api"),
    harness.projectId,
    createdBody.case.caseId
  );
  assert.equal(forbidden.status, 404);

  // M5.1 HTTP surface behaves the same way for its own flag.
  harness.session.signIn(harness.ownerUserId);
  const applicationsListed = await harness.http.applicationHandlers.list(
    new Request("http://localhost/api"),
    harness.projectId
  );
  assert.equal(applicationsListed.status, 200);
  harness.flags.setApplicationsEnabled(false);
  const applicationsDisabled = await harness.http.applicationHandlers.list(
    new Request("http://localhost/api"),
    harness.projectId
  );
  assert.equal(applicationsDisabled.status, 404);
});

test("I-11 the real client transport drives the real handlers end to end", async () => {
  const harness = createM5IntegrationHarness();
  harness.session.signIn(harness.ownerUserId);
  const ready = await readyApplication(harness);

  // Route the accepted client transport into the accepted HTTP handlers.
  const fetchImpl = (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input);
    const url = new URL(path, "http://localhost");
    const request = new Request(url, init);
    const match = url.pathname.match(
      /^\/api\/projects\/([^/]+)\/school-admissions(.*)$/u
    );
    assert.ok(match, `unexpected path ${path}`);
    const projectId = decodeURIComponent(match[1] as string);
    const rest = match[2] ?? "";
    if (rest === "" && (init?.method ?? "GET") === "GET") {
      return harness.http.admissionHandlers.list(request, projectId);
    }
    if (rest === "") {
      return harness.http.admissionHandlers.create(request, projectId);
    }
    const caseMatch = rest.match(/^\/([^/]+)(\/.*)?$/u);
    const caseId = decodeURIComponent(caseMatch?.[1] as string);
    const tail = caseMatch?.[2] ?? "";
    if (tail === "") {
      return harness.http.admissionHandlers.get(request, projectId, caseId);
    }
    if (tail === "/preparation") {
      return harness.http.admissionHandlers.prepare(request, projectId, caseId);
    }
    if (tail === "/preparation/confirm") {
      return harness.http.admissionHandlers.confirmPreparation(
        request,
        projectId,
        caseId
      );
    }
    throw new Error(`unrouted ${path}`);
  };

  const { createSchoolAdmissionsController } = await import(
    "../workspace/school-admissions"
  );
  let index = 0;
  const controller = createSchoolAdmissionsController({
    fetchImpl,
    newOperationId: () => {
      index += 1;
      return `client-op-${index}`;
    },
    today: () => "2026-11-01",
  });

  assert.equal(await controller.load(harness.projectId), null);
  assert.equal(controller.getSnapshot().applications.length, 1);
  assert.equal(controller.getSnapshot().applications[0]?.hasCase, false);

  assert.equal(
    await controller.create(harness.projectId, {
      applicationId: ready.application.applicationId,
      courseTitle: null,
      institutionName: null,
      intakeLabel: null,
      originKind: "school_application",
    }),
    null
  );
  const detail = controller.getSnapshot().detail;
  assert.ok(detail);
  assert.equal(detail.applicationId, ready.application.applicationId);

  assert.equal(await controller.prepare(harness.projectId, detail), null);
  const prepared = controller.getSnapshot().detail;
  assert.ok(prepared?.preparation);
  assert.equal(
    await controller.confirmPreparation(harness.projectId, prepared),
    null
  );
  const confirmed = controller.getSnapshot().detail;
  assert.equal(confirmed?.preparationState, "customer_confirmed");

  await controller.load(harness.projectId);
  assert.equal(controller.getSnapshot().applications[0]?.hasCase, true);
  assert.equal(controller.getSnapshot().cases.length, 1);
  assert.equal(controller.getSnapshot().error, null);
});

test("I-11 both panels render Chinese and English copy without a browser", () => {
  const zh = getWorkspaceCopy("zh-CN");
  const en = getWorkspaceCopy("en");

  // A disabled surface renders nothing at all (the feature is simply absent).
  assert.equal(
    renderToStaticMarkup(
      <SchoolAdmissionsWorkflowPanel
        copy={zh.schoolAdmissions as never}
        enabled={false}
        projectId="22222222-2222-4222-8222-222222222201"
      />
    ),
    ""
  );

  const admissionsZh = renderToStaticMarkup(
    <SchoolAdmissionsWorkflowPanel
      copy={zh.schoolAdmissions as never}
      enabled
      projectId="22222222-2222-4222-8222-222222222201"
    />
  );
  const admissionsEn = renderToStaticMarkup(
    <SchoolAdmissionsWorkflowPanel
      copy={en.schoolAdmissions as never}
      enabled
      projectId="22222222-2222-4222-8222-222222222201"
    />
  );
  assert.match(admissionsZh, /入学/u);
  assert.match(admissionsEn, /[Aa]dmission/u);
  assert.notEqual(admissionsZh, admissionsEn);

  const applicationsZh = renderToStaticMarkup(
    <SchoolApplicationsPanel
      copy={zh.schoolApplications as never}
      enabled
      projectId="22222222-2222-4222-8222-222222222201"
    />
  );
  const applicationsEn = renderToStaticMarkup(
    <SchoolApplicationsPanel
      copy={en.schoolApplications as never}
      enabled
      projectId="22222222-2222-4222-8222-222222222201"
    />
  );
  assert.notEqual(applicationsZh, applicationsEn);
  assert.ok(applicationsZh.length > 0);
  assert.ok(applicationsEn.length > 0);

  // The existing Project Chat / Standalone Chat copy is untouched by M5 panels.
  assert.equal(typeof zh.projectChat, "object");
  assert.equal(typeof en.projectChat, "object");
  assert.equal(typeof zh.messages, "object");
  assert.notDeepEqual(zh.projectChat, en.projectChat);
});
