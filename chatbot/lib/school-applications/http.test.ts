import assert from "node:assert/strict";
import { test } from "node:test";
import { SchoolApplicationError } from "./contracts";
import { createSchoolApplicationHandlers } from "./http";

const projectId = "22222222-2222-4222-8222-222222222201";
const applicationId = "44444444-4444-4444-8444-444444444401";
const referenceId = "33333333-3333-4333-8333-333333333301";
const actorUserId = "11111111-1111-4111-8111-111111111101";

function request(method: string, path: string, body?: unknown) {
  return new Request(`https://example.test${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { "content-type": "application/json" },
    method,
  });
}

const applicationView = {
  applicationId,
  archivedAt: null,
  course: { catalogId: null, title: "Bachelor of Nursing" },
  createdAt: "2026-10-30T00:00:00.000Z",
  currentPackage: null,
  deliveryId: null,
  disclosures: ["not_a_school_submission"],
  institution: {
    catalogId: null,
    catalogRecordClass: null,
    catalogSnapshotToken: null,
    name: "Example University",
  },
  intake: { id: null, label: "February 2027" },
  missingDataCodes: ["source_not_independently_verified"],
  packageStale: false,
  packages: [],
  projectId,
  referenceCheckPerformed: true,
  references: [],
  revision: 1,
  source: {
    catalogRecordClass: null,
    catalogSnapshotToken: null,
    independentlyVerified: false,
    status: "unverified_customer_declared",
  },
  staleReasonCodes: [],
  status: "draft",
  updatedAt: "2026-10-30T00:00:00.000Z",
};

function makeHandlers(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ method: string; input: unknown }> = [];
  const service = {
    archive(input: unknown) {
      calls.push({ input, method: "archive" });
      return {
        application: { ...applicationView, status: "archived" },
        replayed: false,
      };
    },
    bindReference(input: unknown) {
      calls.push({ input, method: "bindReference" });
      return { application: applicationView, replayed: false };
    },
    buildPackage(input: unknown) {
      calls.push({ input, method: "buildPackage" });
      return {
        application: applicationView,
        package: { packageId: applicationId, version: 1 },
        replayed: false,
        reusedCurrentPackage: false,
      };
    },
    create(input: unknown) {
      calls.push({ input, method: "create" });
      return { application: applicationView, replayed: false };
    },
    get(input: unknown) {
      calls.push({ input, method: "get" });
      return applicationView;
    },
    list(input: unknown) {
      calls.push({ input, method: "list" });
      return [applicationView];
    },
    listPackages(input: unknown) {
      calls.push({ input, method: "listPackages" });
      return { currentSnapshot: null, packages: [] };
    },
    revokeReference(input: unknown) {
      calls.push({ input, method: "revokeReference" });
      return { application: applicationView, replayed: false };
    },
    update(input: unknown) {
      calls.push({ input, method: "update" });
      return { application: applicationView, replayed: false };
    },
  };
  const deps = {
    authenticate: async () => ({
      type: "regular" as const,
      userId: actorUserId,
    }),
    enabled: () => true,
    schemaAvailable: async () => true,
    service,
    ...overrides,
  } as unknown as Parameters<typeof createSchoolApplicationHandlers>[0];
  return { calls, handlers: createSchoolApplicationHandlers(deps) };
}

const validTarget = {
  courseTitle: "Bachelor of Nursing",
  institutionName: "Example University",
  intakeLabel: "February 2027",
};

test("the capability is default-OFF and fails closed before authentication", async () => {
  const { calls, handlers } = makeHandlers({ enabled: () => false });
  const response = await handlers.list(request("GET", "/"), projectId);
  assert.equal(response.status, 404);
  const create = await handlers.create(
    request("POST", "/", { ...validTarget, operationId: "op-1" }),
    projectId
  );
  assert.equal(create.status, 404);
  assert.equal(calls.length, 0);

  const unauthenticated = makeHandlers({ authenticate: async () => null });
  assert.equal(
    (await unauthenticated.handlers.list(request("GET", "/"), projectId))
      .status,
    401
  );

  const guest = makeHandlers({
    authenticate: async () => ({ type: "guest" as const, userId: actorUserId }),
  });
  assert.equal(
    (await guest.handlers.list(request("GET", "/"), projectId)).status,
    404
  );

  const missingSchema = makeHandlers({ schemaAvailable: async () => false });
  assert.equal(
    (await missingSchema.handlers.list(request("GET", "/"), projectId)).status,
    503
  );
  const brokenSchema = makeHandlers({
    schemaAvailable: () => Promise.reject(new Error("catalog unavailable")),
  });
  assert.equal(
    (await brokenSchema.handlers.list(request("GET", "/"), projectId)).status,
    503
  );
});

test("requests cannot forge identity, ownership, Project or status", async () => {
  const { calls, handlers } = makeHandlers();
  for (const forged of [
    { creatorId: actorUserId },
    { ownerUserId: actorUserId },
    { projectId },
    { status: "package_prepared" },
    { revision: 9 },
  ]) {
    const response = await handlers.create(
      request("POST", "/", {
        ...validTarget,
        operationId: "op-forged",
        ...forged,
      }),
      projectId
    );
    assert.equal(response.status, 400);
  }
  const update = await handlers.update(
    request("PATCH", "/", {
      ...validTarget,
      expectedRevision: 1,
      operationId: "op-forged-update",
      actorUserId,
    }),
    projectId,
    applicationId
  );
  assert.equal(update.status, 400);
  assert.equal(calls.length, 0);
});

test("create and list derive the actor from the session and the Project from the route", async () => {
  const { calls, handlers } = makeHandlers();
  const created = await handlers.create(
    request("POST", "/", { ...validTarget, operationId: "op-create" }),
    projectId
  );
  assert.equal(created.status, 201);
  const body = (await created.json()) as { replayed: boolean };
  assert.equal(body.replayed, false);
  assert.deepEqual(calls[0], {
    input: {
      actorUserId,
      courseTitle: "Bachelor of Nursing",
      institutionName: "Example University",
      intakeLabel: "February 2027",
      operationId: "op-create",
      projectId,
    },
    method: "create",
  });

  const list = await handlers.list(request("GET", "/"), projectId);
  assert.equal(list.status, 200);
  const listBody = (await list.json()) as { applications: unknown[] };
  assert.equal(listBody.applications.length, 1);
  assert.deepEqual(calls[1], {
    input: { actorUserId, projectId },
    method: "list",
  });
});

test("malformed paths, bodies and media types are rejected before the service", async () => {
  const { calls, handlers } = makeHandlers();
  assert.equal(
    (await handlers.list(request("GET", "/"), "not-a-uuid")).status,
    400
  );
  assert.equal(
    (await handlers.get(request("GET", "/"), projectId, "not-a-uuid")).status,
    400
  );
  assert.equal(
    (
      await handlers.create(
        request("POST", "/", {
          ...validTarget,
          operationId: "bad operation id!",
        }),
        projectId
      )
    ).status,
    400
  );
  const wrongType = new Request("https://example.test/", {
    body: JSON.stringify({ ...validTarget, operationId: "op-1" }),
    headers: { "content-type": "text/plain" },
    method: "POST",
  });
  assert.equal((await handlers.create(wrongType, projectId)).status, 415);
  const oversized = new Request("https://example.test/", {
    body: JSON.stringify({
      ...validTarget,
      institutionName: "x".repeat(9 * 1024),
      operationId: "op-1",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal((await handlers.create(oversized, projectId)).status, 413);
  assert.equal(
    (
      await handlers.bindReference(
        request("POST", "/", {
          expectedRevision: 1,
          kind: "chat",
          operationId: "op-bind",
          referenceId,
        }),
        projectId,
        applicationId
      )
    ).status,
    400
  );
  assert.equal(calls.length, 0);
});

test("service denials map to existence-hiding, conflict or unavailable responses", async () => {
  for (const [code, status] of [
    ["actor_not_eligible", 404],
    ["project_forbidden", 404],
    ["application_not_found", 404],
    ["reference_invalid", 404],
    ["revision_conflict", 409],
    ["idempotency_conflict", 409],
    ["state_conflict", 409],
    ["project_closed", 409],
    ["reference_unavailable", 409],
    ["limit_exceeded", 409],
    ["integrity_conflict", 500],
  ] as const) {
    const { handlers } = makeHandlers({
      service: {
        list: () => {
          throw new SchoolApplicationError(code);
        },
      },
    });
    const response = await handlers.list(request("GET", "/"), projectId);
    assert.equal(response.status, status, code);
    const body = (await response.json()) as { error: string };
    assert.equal(typeof body.error, "string");
  }
});

test("package build and reference endpoints forward only validated fields", async () => {
  const { calls, handlers } = makeHandlers();
  const built = await handlers.buildPackage(
    request("POST", "/", { expectedRevision: 2, operationId: "op-build" }),
    projectId,
    applicationId
  );
  assert.equal(built.status, 200);
  assert.deepEqual(calls[0], {
    input: {
      actorUserId,
      applicationId,
      expectedRevision: 2,
      operationId: "op-build",
      projectId,
    },
    method: "buildPackage",
  });

  const bound = await handlers.bindReference(
    request("POST", "/", {
      expectedRevision: 3,
      kind: "fact",
      operationId: "op-bind",
      referenceId,
    }),
    projectId,
    applicationId
  );
  assert.equal(bound.status, 200);
  assert.deepEqual(calls[1], {
    input: {
      actorUserId,
      applicationId,
      expectedRevision: 3,
      kind: "fact",
      operationId: "op-bind",
      projectId,
      referenceId,
    },
    method: "bindReference",
  });

  const revoked = await handlers.revokeReference(
    request("POST", "/", { expectedRevision: 4, operationId: "op-revoke" }),
    projectId,
    applicationId,
    referenceId
  );
  assert.equal(revoked.status, 200);
  assert.deepEqual(calls[2], {
    input: {
      actorUserId,
      applicationId,
      expectedRevision: 4,
      operationId: "op-revoke",
      projectId,
      referenceRecordId: referenceId,
    },
    method: "revokeReference",
  });

  const packages = await handlers.listPackages(
    request("GET", "/"),
    projectId,
    applicationId
  );
  assert.equal(packages.status, 200);
  assert.equal(calls[3]?.method, "listPackages");
});
