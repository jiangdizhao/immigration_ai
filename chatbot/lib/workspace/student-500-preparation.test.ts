import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Student500PreparationView } from "@/components/student-500-preparation-section";
import { getWorkspaceCopy } from "@/lib/workspace-copy";
import {
  createStudent500PreparationController,
  type PreparationView,
  preparationPath,
  resolveSchoolKindIntent,
  schoolContextRequestFromRecord,
} from "./student-500-preparation";

const PROJECT = "22222222-2222-4222-8222-222222222301";
const SCHOOL_APPLICATION = "44444444-4444-4444-8444-444444444401";
const ADMISSION_CASE = "33333333-3333-4333-8333-333333333301";

/** Smallest complete PreparationView used by the rendering tests. */
function minimalView(): PreparationView {
  return {
    applicationId: APP_A,
    applicationRevision: 1,
    applicationStatus: "draft",
    availableFacts: [],
    conflictsVisible: false,
    counts: {
      blocked: 0,
      covered: 0,
      missing: 0,
      notApplicable: 0,
      notAssessed: 0,
    },
    disclosures: [],
    documentsTrust: "unavailable",
    drafts: [],
    factsAvailable: true,
    nextActions: [],
    projectId: PROJECT,
    requirements: [],
    schemaVersion: "phase13.student500-preparation.v1",
    screeningSubmissionStatus: "not_submission_ready",
    schoolContext: null,
    selectedFacts: [],
    snapshots: [],
  } as unknown as PreparationView;
}

function noopHandlers() {
  return {
    createDraft: () => undefined,
    createSnapshot: () => undefined,
    saveDraft: () => undefined,
    selectFact: () => undefined,
    setSchoolContext: () => undefined,
    unselectFact: () => undefined,
  };
}

const APP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
const APP_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02";

function viewPayload(applicationId: string) {
  return {
    preparation: {
      applicationId,
      applicationRevision: 1,
      applicationStatus: "draft",
      availableFacts: [],
      context: {},
      disclosures: [],
      documentsTrust: "unavailable",
      drafts: [],
      factsAvailable: true,
      latestDraft: null,
      latestSnapshot: null,
      limits: {},
      nextActions: ["select_authorized_facts"],
      projectId: PROJECT,
      reconciliation: {
        conflictsVisible: false,
        counts: {
          blocked: 0,
          covered: 0,
          missing: 1,
          notApplicable: 0,
          notAssessed: 0,
        },
        disclosures: [],
        requirements: [
          {
            applicability: "applicable",
            coverage: "missing_evidence",
            gaps: ["no_authorized_fact_selected"],
            humanReviewRequired: true,
            legalSourceVerification: "declared_pending_verification",
            requirementKey: "english_language_evidence",
          },
        ],
      },
      schemaVersion: "phase13.student500-preparation.v1",
      schoolContext: null,
      screeningSubmissionStatus: "not_submission_ready",
      selectedFacts: [],
      snapshots: [],
    },
  };
}

test("the controller loads the authorized preparation path and parses it strictly", async () => {
  const calls: { url: string; method: string }[] = [];
  const controller = createStudent500PreparationController({
    fetchImpl: async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url });
      return Response.json(viewPayload(APP_A));
    },
  });
  assert.equal(await controller.load(PROJECT, APP_A), null);
  assert.equal(calls[0]?.url, preparationPath(PROJECT, APP_A));
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.view?.applicationId, APP_A);
  assert.equal(snapshot.view?.requirements.length, 1);
  assert.equal(snapshot.view?.counts.missing, 1);
  assert.equal(snapshot.view?.documentsTrust, "unavailable");
});

test("switching application never shows the previous preparation", async () => {
  let release: (() => void) | undefined;
  const controller = createStudent500PreparationController({
    fetchImpl: async (url) => {
      if (url.includes(APP_B)) {
        await new Promise<void>((resolveFn) => {
          release = resolveFn;
        });
        return Response.json(viewPayload(APP_B));
      }
      return Response.json(viewPayload(APP_A));
    },
  });
  await controller.load(PROJECT, APP_A);
  assert.equal(controller.getSnapshot().view?.applicationId, APP_A);
  const pending = controller.load(PROJECT, APP_B);
  assert.equal(controller.getSnapshot().view, null);
  assert.equal(controller.getSnapshot().applicationId, APP_B);
  release?.();
  await pending;
  assert.equal(controller.getSnapshot().view?.applicationId, APP_B);
});

test("an out-of-order load response cannot overwrite the newer selection", async () => {
  const resolvers: (() => void)[] = [];
  const controller = createStudent500PreparationController({
    fetchImpl: async (url) => {
      const body = url.includes(APP_B)
        ? viewPayload(APP_B)
        : viewPayload(APP_A);
      if (url.includes(APP_A)) {
        await new Promise<void>((resolve) => resolvers.push(resolve));
      }
      return Response.json(body);
    },
  });
  const first = controller.load(PROJECT, APP_A);
  const second = controller.load(PROJECT, APP_B);
  await second;
  resolvers[0]?.();
  await first;
  assert.equal(controller.getSnapshot().applicationId, APP_B);
  assert.equal(controller.getSnapshot().view?.applicationId, APP_B);
});

test("actions carry operation ids and a superseded base draft is refused locally", async () => {
  const calls: { method: string; body: string | null }[] = [];
  const controller = createStudent500PreparationController({
    fetchImpl: async (_url, init) => {
      calls.push({
        body: typeof init?.body === "string" ? init.body : null,
        method: init?.method ?? "GET",
      });
      return Response.json(viewPayload(APP_A));
    },
    newOperationId: () => "op-fixed",
  });
  await controller.load(PROJECT, APP_A);
  await controller.createDraft();
  const post = calls.find((call) => call.method === "POST");
  assert.ok(post?.body);
  assert.deepEqual(JSON.parse(post.body as string), {
    action: "create_gs_draft",
    operationId: "op-fixed",
  });
  const before = calls.length;
  assert.equal(
    await controller.saveDraft(APP_B, [
      { sectionKey: "future_plans", text: "x" },
    ]),
    "state_changed"
  );
  assert.equal(calls.length, before);
});

test("HTTP failures become bounded client states", async () => {
  for (const [status, expected] of [
    [401, "unauthorized"],
    [404, "not_found"],
    [409, "state_changed"],
    [503, "unavailable"],
    [500, "request_failed"],
  ] as const) {
    const controller = createStudent500PreparationController({
      fetchImpl: async () => Response.json({}, { status }),
    });
    assert.equal(
      await controller.load(PROJECT, APP_A),
      expected,
      String(status)
    );
    assert.equal(controller.getSnapshot().view, null);
  }
});

test("the preparation view renders bilingually with honest labels", () => {
  const markup = (locale: "en" | "zh-CN") => {
    const view = {
      applicationId: APP_A,
      applicationRevision: 1,
      applicationStatus: "draft",
      availableFacts: [],
      conflictsVisible: false,
      counts: {
        blocked: 0,
        covered: 1,
        missing: 1,
        notApplicable: 0,
        notAssessed: 0,
      },
      disclosures: [],
      documentsTrust: "unavailable",
      drafts: [],
      factsAvailable: true,
      nextActions: ["select_authorized_facts", "seek_human_review"],
      projectId: PROJECT,
      requirements: [
        {
          applicability: "applicable",
          coverage: "missing_evidence",
          gaps: ["no_authorized_fact_selected", "legal_source_unverified"],
          humanReviewRequired: true,
          legalSourceVerification: "declared_pending_verification",
          requirementKey: "english_language_evidence",
        },
      ],
      schemaVersion: "phase13.student500-preparation.v1",
      screeningSubmissionStatus: "not_submission_ready" as const,
      schoolContext: null,
      selectedFacts: [],
      snapshots: [],
    } as unknown as PreparationView;
    return renderToStaticMarkup(
      React.createElement(Student500PreparationView, {
        copy: getWorkspaceCopy(locale).student500,
        handlers: {
          createDraft: () => undefined,
          createSnapshot: () => undefined,
          saveDraft: () => undefined,
          selectFact: () => undefined,
          setSchoolContext: () => undefined,
          unselectFact: () => undefined,
        },
        state: {
          applicationId: APP_A,
          error: null,
          loading: false,
          pendingAction: null,
          projectId: PROJECT,
          view,
        },
      })
    );
  };
  const english = markup("en");
  assert.match(english, /Application preparation/u);
  assert.match(english, /Evidence missing/u);
  assert.match(english, /Legal source unverified/u);
  assert.match(english, /not professionally reviewed/u);
  const chinese = markup("zh-CN");
  assert.match(chinese, /\u7533\u8bf7\u51c6\u5907/u);
  assert.match(chinese, /\u7f3a\u5c11\u8bc1\u636e/u);
  assert.match(chinese, /\u672a\u7ecf\u4e13\u4e1a\u5ba1\u9605/u);
});

test("an authorized record selection maps to the correct binding payload", () => {
  // The UI can only submit a listed record; these are the exact payloads the
  // controller receives, so a real selection reaches the API with the right id.
  assert.deepEqual(
    schoolContextRequestFromRecord({
      detail: "draft",
      id: SCHOOL_APPLICATION,
      kind: "school_application",
      label: "Example College",
    }),
    { kind: "school_application", schoolApplicationId: SCHOOL_APPLICATION }
  );
  assert.deepEqual(
    schoolContextRequestFromRecord({
      detail: "existing_offer",
      id: ADMISSION_CASE,
      kind: "admission_case",
      label: "Example University",
    }),
    { admissionCaseId: ADMISSION_CASE, kind: "admission_case" }
  );
});

test("the study-evidence panel renders the authorized selector and binding", () => {
  const copy = getWorkspaceCopy("en").student500;
  const view = {
    ...minimalView(),
    schoolContext: {
      admissionCaseId: null,
      admissionOutcomeIndependentlyVerified: false,
      admissionOutcomeKind: null,
      admissionOutcomeProvenance: null,
      admissionOutcomeVersion: null,
      current: true,
      kind: "school_application",
      revision: 2,
      schoolApplicationId: SCHOOL_APPLICATION,
      studyEvidenceKind: "none",
      unavailableReason: null,
    },
  } as unknown as PreparationView;
  const markup = renderToStaticMarkup(
    React.createElement(Student500PreparationView, {
      copy,
      evidence: [
        {
          detail: "draft",
          id: SCHOOL_APPLICATION,
          kind: "school_application",
          label: "Example College",
        },
        {
          detail: "existing_offer",
          id: "44444444-4444-4444-8444-444444444499",
          kind: "admission_case",
          label: "Other University",
        },
      ],
      evidenceState: "loaded",
      handlers: noopHandlers(),
      onSelectRecord: () => undefined,
      state: {
        applicationId: APP_A,
        error: null,
        loading: false,
        pendingAction: null,
        projectId: PROJECT,
        view,
      },
    })
  );
  // A real control is rendered for the linked kind, bound to the selected record.
  assert.match(markup, /data-testid="prep-school-record-select"/u);
  assert.match(
    markup,
    new RegExp(`<option value="${SCHOOL_APPLICATION}"`, "u")
  );
  assert.match(markup, new RegExp(`value="${SCHOOL_APPLICATION}"`, "u"));
  // Only records of the currently selected kind are offered.
  assert.match(markup, /Example College/u);
  assert.doesNotMatch(markup, /Other University/u);
  // With no M5 record there is no free-text id input at all.
  assert.doesNotMatch(markup, /<input[^>]*prep-school-record/u);
});

test("first use of a school kind defers the mutation until a record is chosen", async () => {
  // Real controller interaction (no DOM): the component's transition is driven by
  // resolveSchoolKindIntent + schoolContextRequestFromRecord.
  const calls: { body: unknown; url: string }[] = [];
  const controller = createStudent500PreparationController({
    fetchImpl: async (input, init) => {
      calls.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        url: String(input),
      });
      return Response.json({
        preparation: {
          applicationId: APP_A,
          applicationRevision: 1,
          applicationStatus: "draft",
          availableFacts: [],
          conflictsVisible: false,
          counts: {
            blocked: 0,
            covered: 0,
            missing: 0,
            notApplicable: 0,
            notAssessed: 0,
          },
          disclosures: [],
          drafts: [],
          factsAvailable: true,
          nextActions: [],
          projectId: PROJECT,
          requirements: [],
          schemaVersion: "phase13.student500-preparation.v1",
          schoolContext: null,
          selectedFacts: [],
          snapshots: [],
        },
      });
    },
  });
  await controller.load(PROJECT, APP_A);
  const before = calls.length;

  // 1. Choosing the kind alone must not submit a null-identifier binding.
  for (const kind of ["school_application", "admission_case"]) {
    const intent = resolveSchoolKindIntent(kind);
    assert.equal(intent.defer, true, kind);
    assert.equal(calls.length, before, `${kind} must not submit`);
  }
  // 2. A `none` / direct CoE choice has no external identity and submits at once.
  const noneIntent = resolveSchoolKindIntent("none");
  assert.equal(noneIntent.defer, false);
  const reportedIntent = resolveSchoolKindIntent("customer_reported_coe");
  assert.equal(reportedIntent.defer, false);

  // 3. Choosing an authorized school application then binds that exact id.
  await controller.setSchoolContext(
    schoolContextRequestFromRecord({
      detail: "draft",
      id: SCHOOL_APPLICATION,
      kind: "school_application",
      label: "Example College",
    })
  );
  const lastWrite = () =>
    [...calls].reverse().find((call) => call.body !== null)?.body as
      | Record<string, unknown>
      | undefined;
  const schoolBody = lastWrite();
  assert.equal(schoolBody?.kind, "school_application");
  assert.equal(schoolBody?.schoolApplicationId, SCHOOL_APPLICATION);
  assert.equal(schoolBody?.admissionCaseId, null);

  // 4. The same first-use transition for an authorized admission case.
  await controller.setSchoolContext(
    schoolContextRequestFromRecord({
      detail: "existing_offer",
      id: ADMISSION_CASE,
      kind: "admission_case",
      label: "Example University",
    })
  );
  const caseBody = lastWrite();
  assert.equal(caseBody?.kind, "admission_case");
  assert.equal(caseBody?.admissionCaseId, ADMISSION_CASE);
  assert.equal(caseBody?.schoolApplicationId, null);
});

test("a pending kind shows the selector before any binding exists", () => {
  const copy = getWorkspaceCopy("en").student500;
  const markup = renderToStaticMarkup(
    React.createElement(Student500PreparationView, {
      copy,
      evidence: [
        {
          detail: "existing_offer",
          id: ADMISSION_CASE,
          kind: "admission_case",
          label: "Example University",
        },
      ],
      evidenceState: "loaded",
      handlers: noopHandlers(),
      onSelectRecord: () => undefined,
      pendingKind: "admission_case",
      state: {
        applicationId: APP_A,
        error: null,
        loading: false,
        pendingAction: null,
        projectId: PROJECT,
        view: minimalView(),
      },
    })
  );
  // No binding yet (schoolContext is null) but the first-use selector is offered.
  assert.match(markup, /data-testid="prep-school-record-select"/u);
  assert.match(markup, new RegExp(`<option value="${ADMISSION_CASE}"`, "u"));
  assert.match(markup, /data-testid="prep-school-kind-admission_case"/u);
});
