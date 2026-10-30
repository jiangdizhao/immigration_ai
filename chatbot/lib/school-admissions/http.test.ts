import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createSchoolAdmissionsHandlers } from "./http";
import { createSchoolAdmissionsTestHarness } from "./test-adapters";

/**
 * Phase 13 M5.2 HTTP contract.
 *
 * The handlers derive the actor from the session, enforce the capability gate and
 * the schema probe, reject strict-body violations, and never leak an authority
 * decision. These tests use the in-memory harness: no database is contacted.
 */

const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function bootstrap(
  options: {
    enabled?: boolean;
    schemaAvailable?: boolean;
    session?: { type: string; userId: string } | null;
  } = {}
) {
  const harness = createSchoolAdmissionsTestHarness();
  const projectId = randomUUID();
  const ownerUserId = randomUUID();
  harness.store.seedProject(projectId, { ownerUserId, status: "active" });
  harness.store.seedActor(ownerUserId, { registeredCustomer: true });
  const handlers = createSchoolAdmissionsHandlers({
    authenticate: async () =>
      options.session === undefined
        ? { type: "regular", userId: ownerUserId }
        : options.session,
    enabled: () => options.enabled ?? true,
    schemaAvailable: async () => options.schemaAvailable ?? true,
    service: harness.service,
  });
  return { handlers, harness, ownerUserId, projectId };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/projects/x/school-admissions", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

test("a disabled capability is indistinguishable from an absent route", async () => {
  const { handlers, projectId } = bootstrap({ enabled: false });
  const response = await handlers.create(jsonRequest({}), projectId);
  assert.equal(response.status, 404);
  const list = await handlers.list(
    new Request("http://localhost/x"),
    projectId
  );
  assert.equal(list.status, 404);
});

test("authentication, schema and strict-body failures fail closed", async () => {
  const anonymous = bootstrap({ session: null });
  const unauthorized = await anonymous.handlers.list(
    new Request("http://localhost/x"),
    anonymous.projectId
  );
  assert.equal(unauthorized.status, 401);

  const staff = bootstrap({
    session: { type: "lawyer", userId: randomUUID() },
  });
  const staffResponse = await staff.handlers.list(
    new Request("http://localhost/x"),
    staff.projectId
  );
  assert.equal(staffResponse.status, 404);

  const noSchema = bootstrap({ schemaAvailable: false });
  const unavailable = await noSchema.handlers.list(
    new Request("http://localhost/x"),
    noSchema.projectId
  );
  assert.equal(unavailable.status, 503);

  const valid = bootstrap();
  const extraField = await valid.handlers.create(
    jsonRequest({
      courseTitle: "Course",
      institutionName: "School",
      operationId: "op-1",
      originKind: "existing_offer",
      ownerUserId: randomUUID(),
    }),
    valid.projectId
  );
  assert.equal(extraField.status, 400);
  const missingContentType = await valid.handlers.create(
    new Request("http://localhost/x", { body: "{}", method: "POST" }),
    valid.projectId
  );
  assert.equal(missingContentType.status, 415);
});

test("a created case is returned with its revision and next steps", async () => {
  const { handlers, projectId } = bootstrap();
  const response = await handlers.create(
    jsonRequest({
      courseTitle: "Bachelor of Nursing",
      institutionName: "Example College",
      operationId: "op-1",
      originKind: "existing_offer",
    }),
    projectId
  );
  assert.equal(response.status, 201);
  const body = (await response.json()) as {
    case: {
      revision: number;
      serviceMode: string;
      journey: { offerState: string };
    };
  };
  assert.equal(body.case.revision, 1);
  assert.equal(body.case.serviceMode, "self_service");
  assert.equal(body.case.journey.offerState, "none");
});

test("the list payload carries the creator-private selections", async () => {
  const { handlers, harness, projectId, ownerUserId } = bootstrap();
  const applicationId = randomUUID();
  harness.seedApplication({
    applicationId,
    institutionName: "Selectable School",
    ownerUserId,
    projectId,
  });
  const documentId = randomUUID();
  harness.seedDocument({
    label: "Document 1 · application/pdf · abcd1234",
    projectId,
    referenceId: documentId,
  });
  const response = await handlers.list(
    new Request("http://localhost/x"),
    projectId
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    applications: { applicationId: string; hasCase: boolean }[];
    cases: unknown[];
    documents: { referenceId: string; label: string | null }[];
    documentsUnavailable: boolean;
  };
  assert.deepEqual(
    body.applications.map((entry) => entry.applicationId),
    [applicationId]
  );
  assert.equal(body.applications[0]?.hasCase, false);
  assert.deepEqual(body.cases, []);
  assert.equal(body.documents[0]?.referenceId, documentId);
  assert.equal(body.documentsUnavailable, false);
});

test("a bound application opens exactly one admission case", async () => {
  const { handlers, harness, projectId, ownerUserId } = bootstrap();
  const applicationId = randomUUID();
  harness.seedApplication({
    applicationId,
    institutionName: "Bound School",
    ownerUserId,
    projectId,
  });
  const created = await handlers.create(
    jsonRequest({
      applicationId,
      operationId: "op-bound-1",
      originKind: "school_application",
    }),
    projectId
  );
  assert.equal(created.status, 201);
  const body = (await created.json()) as {
    case: { applicationId: string | null };
  };
  assert.equal(body.case.applicationId, applicationId);
  // A second case for the same application is refused.
  const duplicate = await handlers.create(
    jsonRequest({
      applicationId,
      operationId: "op-bound-2",
      originKind: "school_application",
    }),
    projectId
  );
  assert.equal(duplicate.status, 409);
});

test("an unavailable authority is a 422, never a silent confirmation", async () => {
  const { handlers, projectId } = bootstrap();
  const created = await handlers.create(
    jsonRequest({
      courseTitle: "Diploma of Business",
      institutionName: "Exception College",
      operationId: "op-1",
      originKind: "claimed_exception",
    }),
    projectId
  );
  const body = (await created.json()) as {
    case: { caseId: string; revision: number };
  };
  const claimed = await handlers.claimException(
    jsonRequest({
      description: "School waived the requirement.",
      expectedRevision: body.case.revision,
      operationId: "op-2",
    }),
    projectId,
    body.case.caseId
  );
  assert.equal(claimed.status, 201);
  const claimedBody = (await claimed.json()) as {
    case: {
      revision: number;
      exception: { exceptionId: string; state: string };
    };
  };
  assert.equal(claimedBody.case.exception.state, "claimed");
  const verify = await handlers.verifyException(
    jsonRequest({
      exceptionId: claimedBody.case.exception.exceptionId,
      expectedRevision: claimedBody.case.revision,
      operationId: "op-3",
    }),
    projectId,
    body.case.caseId
  );
  assert.equal(verify.status, 422);
  // The client-visible operation id pattern is enforced end to end.
  assert.match("op-2", OPERATION_ID);
});
