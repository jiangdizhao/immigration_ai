// biome-ignore-all lint/suspicious/useAwait: the injected fetch stub is asynchronous by contract.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifySchoolAdmissionsError,
  createSchoolAdmissionsController,
  parseSchoolAdmissionsCase,
} from "./school-admissions";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

function casePayload(patch: Record<string, unknown> = {}) {
  return {
    applicationId: null,
    caseId: CASE_ID,
    coe: null,
    courseTitle: "Bachelor of Nursing",
    createdAt: "2026-10-30T00:00:00.000Z",
    disclosures: ["not_a_school_submission", "draft_is_provisional"],
    exception: null,
    externalActions: [],
    institutionName: "Example College",
    intakeLabel: "2027 Semester 1",
    journey: {
      coeState: "none",
      coeValidityState: "not_applicable",
      exceptionState: "none",
      hasOutcome: false,
      offerExpiryState: "not_applicable",
      offerState: "none",
      offerTerminal: false,
      student500Eligibility: "not_determined",
    },
    managedReadiness: {
      checkedAt: null,
      reasonCodes: [],
      status: "NOT_EVALUATED",
      submissionState: "not_connected",
    },
    nextStepCodes: ["record_offer_or_exception"],
    offer: null,
    originKind: "existing_offer",
    outcomeHistory: [],
    preparation: null,
    preparationStale: false,
    preparationState: "not_started",
    projectId: PROJECT_ID,
    requirements: [
      {
        appliesTo: "both",
        code: "application_target_complete",
        required: true,
        status: "satisfied",
        uncertaintyCodes: [],
      },
    ],
    revision: 1,
    serviceMode: "self_service",
    staleReasonCodes: [],
    updatedAt: "2026-10-30T00:00:00.000Z",
    ...patch,
  };
}

test("the client parses a valid case and rejects a malformed one", () => {
  const parsed = parseSchoolAdmissionsCase(casePayload());
  assert.ok(parsed);
  assert.equal(parsed.caseId, CASE_ID);
  assert.equal(parsed.serviceMode, "self_service");
  assert.equal(parsed.journey.student500Eligibility, "not_determined");
  assert.equal(parsed.managedReadiness.submissionState, "not_connected");
  assert.equal(parsed.requirements[0]?.status, "satisfied");
  assert.equal(parseSchoolAdmissionsCase({ caseId: CASE_ID }), null);
  assert.equal(parseSchoolAdmissionsCase(null), null);
  assert.equal(
    parseSchoolAdmissionsCase(casePayload({ serviceMode: "unsupported" })),
    null
  );
});

test("HTTP statuses map to customer-visible error kinds", () => {
  assert.equal(classifySchoolAdmissionsError(401), "authentication_required");
  assert.equal(classifySchoolAdmissionsError(404), "not_found");
  assert.equal(classifySchoolAdmissionsError(409), "state_changed");
  assert.equal(classifySchoolAdmissionsError(422), "authority_unavailable");
  assert.equal(classifySchoolAdmissionsError(503), "unavailable");
  assert.equal(classifySchoolAdmissionsError(400), "invalid_request");
  assert.equal(classifySchoolAdmissionsError(500), "request_failed");
});

test("create posts a strict body with a fresh operation id", async () => {
  const calls: { url: string; body: unknown }[] = [];
  const controller = createSchoolAdmissionsController({
    fetchImpl: async (input, init) => {
      calls.push({
        body: JSON.parse(String(init?.body ?? "{}")) as unknown,
        url: String(input),
      });
      return Response.json({ case: casePayload(), replayed: false });
    },
    newOperationId: () => "op-fixed",
  });
  const error = await controller.create(PROJECT_ID, {
    courseTitle: "Bachelor of Nursing",
    institutionName: "Example College",
    intakeLabel: null,
    originKind: "existing_offer",
  });
  assert.equal(error, null);
  assert.equal(calls[0]?.url, `/api/projects/${PROJECT_ID}/school-admissions`);
  assert.deepEqual(calls[0]?.body, {
    courseTitle: "Bachelor of Nursing",
    institutionName: "Example College",
    intakeLabel: null,
    operationId: "op-fixed",
    originKind: "existing_offer",
  });
  assert.equal(controller.getSnapshot().detail?.caseId, CASE_ID);
});

test("actions are refused locally when their precondition is absent", async () => {
  let called = false;
  const controller = createSchoolAdmissionsController({
    fetchImpl: async () => {
      called = true;
      return Response.json({ case: casePayload() });
    },
  });
  const detail = parseSchoolAdmissionsCase(casePayload());
  assert.ok(detail);
  // No preparation exists yet, so confirmation must not be attempted.
  assert.equal(
    await controller.confirmPreparation(PROJECT_ID, detail),
    "state_changed"
  );
  assert.equal(called, false);
});

test("a 409 response surfaces as a state-changed error without losing state", async () => {
  const controller = createSchoolAdmissionsController({
    fetchImpl: async () =>
      Response.json({ error: "conflict" }, { status: 409 }),
    newOperationId: () => "op-fixed",
  });
  const detail = parseSchoolAdmissionsCase(casePayload());
  assert.ok(detail);
  const error = await controller.prepare(PROJECT_ID, detail);
  assert.equal(error, "state_changed");
  assert.equal(controller.getSnapshot().error, "state_changed");
  assert.equal(controller.getSnapshot().pendingAction, null);
});

test("load parses the creator-private selections and the document list", async () => {
  const controller = createSchoolAdmissionsController({
    fetchImpl: async () =>
      Response.json({
        applications: [
          {
            applicationId: "33333333-3333-4333-8333-333333333333",
            archived: false,
            courseTitle: "Bachelor of Nursing",
            hasCase: true,
            institutionName: "Example College",
            intakeLabel: "2027 Semester 1",
            revision: 3,
            sourceStatus: "unverified_customer_declared",
          },
        ],
        cases: [casePayload()],
        documents: [
          {
            label: "Document 1 · application/pdf · abcd1234",
            referenceId: "44444444-4444-4444-8444-444444444444",
            version: 2,
          },
        ],
        documentsUnavailable: false,
      }),
  });
  assert.equal(await controller.load(PROJECT_ID), null);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.applications.length, 1);
  assert.equal(snapshot.applications[0]?.hasCase, true);
  assert.equal(snapshot.documents.length, 1);
  assert.equal(snapshot.documents[0]?.version, 2);
  assert.equal(snapshot.documentsUnavailable, false);
  assert.equal(snapshot.cases.length, 1);
});

test("create and document-backed outcome send the selected identifiers", async () => {
  const calls: Record<string, unknown>[] = [];
  const controller = createSchoolAdmissionsController({
    fetchImpl: async (_input, init) => {
      calls.push(
        JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
      );
      return Response.json({ case: casePayload() });
    },
    newOperationId: () => "op-fixed",
    today: () => "2026-10-30",
  });
  await controller.create(PROJECT_ID, {
    applicationId: "33333333-3333-4333-8333-333333333333",
    courseTitle: null,
    institutionName: null,
    intakeLabel: null,
    originKind: "school_application",
  });
  assert.equal(calls[0]?.applicationId, "33333333-3333-4333-8333-333333333333");

  const detail = parseSchoolAdmissionsCase(casePayload());
  assert.ok(detail);
  await controller.recordCoe(PROJECT_ID, detail, {
    evidenceReferenceId: "44444444-4444-4444-8444-444444444444",
  });
  assert.equal(
    calls[1]?.evidenceReferenceId,
    "44444444-4444-4444-8444-444444444444"
  );
  assert.equal(calls[1]?.provenance, "document_backed_unverified");
  // A plain customer report carries no evidence and no document provenance.
  await controller.recordOffer(PROJECT_ID, detail);
  assert.equal(calls[2]?.provenance, "customer_reported");
  assert.equal("evidenceReferenceId" in (calls[2] ?? {}), false);
});
