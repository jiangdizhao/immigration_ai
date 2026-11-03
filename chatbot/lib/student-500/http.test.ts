import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudent500Handlers } from "./http";
import { createInMemoryStudent500Store } from "./in-memory-store";
import { createDeclaredStudent500LegalSourceProvider } from "./legal-source-provider";
import { createStudent500RequirementResolver } from "./requirement-resolver";
import { createStudent500Service } from "./service";

/**
 * Phase 13 M6.1 HTTP surface tests (offline, real handlers).
 *
 * Prove the fail-closed order: capability -> session -> account type -> Project
 * wide disable -> schema -> strict body -> service authority.
 */

const OWNER = "11111111-1111-4111-8111-111111111101";
const PROJECT_A = "22222222-2222-4222-8222-222222222201";
const PROJECT_B = "22222222-2222-4222-8222-222222222202";

type Session = { userId: string; type: "guest" | "regular" } | null;

function harness() {
  const store = createInMemoryStudent500Store();
  store.seedActor(OWNER, { registeredCustomer: true });
  store.seedProject(PROJECT_A, { ownerUserId: OWNER, status: "active" });
  store.seedProject(PROJECT_B, { ownerUserId: OWNER, status: "active" });

  const service = createStudent500Service({
    resolver: createStudent500RequirementResolver({
      provider: createDeclaredStudent500LegalSourceProvider(),
    }),
    store,
  });

  const flags = { enabled: true, schema: true, writes: true };
  const session: { current: Session } = { current: null };

  const handlers = createStudent500Handlers({
    authenticate: () => Promise.resolve(session.current),
    enabled: () => flags.enabled,
    projectWritesEnabled: () => flags.writes,
    schemaAvailable: () => Promise.resolve(flags.schema),
    service,
  });

  return { flags, handlers, session, store };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

const validCreate = {
  context: {
    applicationPlace: "onshore",
    asOfDate: "2026-11-03",
    coeStatus: "reported_held",
    entryRoute: "existing_coe",
  },
  operationId: "op-http-1",
};

test("the capability gate makes the whole surface absent when disabled", async () => {
  const { flags, handlers } = harness();
  flags.enabled = false;
  const list = await handlers.list(
    new Request("http://localhost/api"),
    PROJECT_A
  );
  assert.equal(list.status, 404);
  const create = await handlers.create(jsonRequest(validCreate), PROJECT_A);
  assert.equal(create.status, 404);
});

test("authentication is required, and guests cannot use the surface", async () => {
  const { handlers, session } = harness();
  const anonymous = await handlers.list(
    new Request("http://localhost/api"),
    PROJECT_A
  );
  assert.equal(anonymous.status, 401);

  session.current = { type: "guest", userId: OWNER };
  const guest = await handlers.list(
    new Request("http://localhost/api"),
    PROJECT_A
  );
  assert.equal(guest.status, 404);
  const guestCreate = await handlers.create(
    jsonRequest(validCreate),
    PROJECT_A
  );
  assert.equal(guestCreate.status, 404);
});

test("a missing schema fails closed instead of degrading", async () => {
  const { flags, handlers, session } = harness();
  session.current = { type: "regular", userId: OWNER };
  flags.schema = false;
  const list = await handlers.list(
    new Request("http://localhost/api"),
    PROJECT_A
  );
  assert.equal(list.status, 503);
  const create = await handlers.create(jsonRequest(validCreate), PROJECT_A);
  assert.equal(create.status, 503);
});

test("a Project-wide emergency disable refuses writes but keeps reads", async () => {
  const { flags, handlers, session } = harness();
  session.current = { type: "regular", userId: OWNER };
  flags.writes = false;
  const create = await handlers.create(jsonRequest(validCreate), PROJECT_A);
  assert.equal(create.status, 503);
  const list = await handlers.list(
    new Request("http://localhost/api"),
    PROJECT_A
  );
  assert.equal(list.status, 200);
});

test("strict bodies reject widening and unknown values", async () => {
  const { handlers, session } = harness();
  session.current = { type: "regular", userId: OWNER };
  for (const body of [
    { ...validCreate, ownerUserId: OWNER },
    { ...validCreate, applicantUserId: OWNER },
    { ...validCreate, projectId: PROJECT_B },
    { ...validCreate, verifiedCoe: true },
    {
      ...validCreate,
      context: { ...validCreate.context, applicationPlace: "mars" },
    },
    {
      ...validCreate,
      context: { ...validCreate.context, coeStatus: "verified" },
    },
    { operationId: "op-no-context-ok", context: { applicantAgeBand: "minor" } },
  ]) {
    const response = await handlers.create(jsonRequest(body), PROJECT_A);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  const missingOperation = await handlers.create(
    jsonRequest({ context: {} }),
    PROJECT_A
  );
  assert.equal(missingOperation.status, 400);
});

test("a valid create returns the persisted screening and replays exactly", async () => {
  const { handlers, session, store } = harness();
  session.current = { type: "regular", userId: OWNER };
  const created = await handlers.create(jsonRequest(validCreate), PROJECT_A);
  assert.equal(created.status, 201);
  const body = (await created.json()) as {
    application: {
      applicationId: string;
      screening: { submissionStatus: string };
    };
    replayed: boolean;
  };
  assert.equal(body.replayed, false);
  assert.equal(
    body.application.screening.submissionStatus,
    "not_submission_ready"
  );

  const replay = await handlers.create(jsonRequest(validCreate), PROJECT_A);
  assert.equal(replay.status, 201);
  const replayBody = (await replay.json()) as {
    application: { applicationId: string };
    replayed: boolean;
  };
  assert.equal(replayBody.replayed, true);
  assert.equal(
    replayBody.application.applicationId,
    body.application.applicationId
  );
  assert.equal(store.writes.length, 1);

  const detail = await handlers.get(
    new Request("http://localhost/api"),
    PROJECT_A,
    body.application.applicationId
  );
  assert.equal(detail.status, 200);
});

test("an application under another Project is hidden, not denied explicitly", async () => {
  const { handlers, session } = harness();
  session.current = { type: "regular", userId: OWNER };
  const created = await handlers.create(jsonRequest(validCreate), PROJECT_A);
  const body = (await created.json()) as {
    application: { applicationId: string };
  };

  const wrongProject = await handlers.get(
    new Request("http://localhost/api"),
    PROJECT_B,
    body.application.applicationId
  );
  assert.equal(wrongProject.status, 404);

  const malformed = await handlers.get(
    new Request("http://localhost/api"),
    PROJECT_A,
    "not-a-uuid"
  );
  assert.equal(malformed.status, 400);
});

test("archiving by HTTP is terminal and revision-guarded", async () => {
  const { handlers, session } = harness();
  session.current = { type: "regular", userId: OWNER };
  const created = await handlers.create(jsonRequest(validCreate), PROJECT_A);
  const { application } = (await created.json()) as {
    application: { applicationId: string };
  };
  const archived = await handlers.archive(
    jsonRequest({ expectedRevision: 1, operationId: "op-http-archive" }),
    PROJECT_A,
    application.applicationId
  );
  assert.equal(archived.status, 200);

  const staleUpdate = await handlers.update(
    jsonRequest({
      context: {},
      expectedRevision: 1,
      operationId: "op-http-update",
    }),
    PROJECT_A,
    application.applicationId
  );
  assert.equal(staleUpdate.status, 409);
});
