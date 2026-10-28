import assert from "node:assert/strict";
import { test } from "node:test";
import { ProjectHumanMessagingError } from "./errors";
import { createProjectHumanMessagingHandlers } from "./http";
import { PROJECT_HUMAN_MESSAGING_NOTICE_VERSION } from "./policy";

const projectId = "123e4567-e89b-42d3-a456-426614174001";
const threadId = "123e4567-e89b-42d3-a456-426614174002";
const assignmentId = "123e4567-e89b-42d3-a456-426614174003";
const lawyerUserId = "123e4567-e89b-42d3-a456-426614174004";
const ownerUserId = "123e4567-e89b-42d3-a456-426614174005";

function request(method: string, path: string, body?: unknown) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function makeHandlers(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ method: string; input: unknown }> = [];
  const repository = {
    createThread(input: unknown) {
      calls.push({ method: "createThread", input });
      return { replayed: false, threadId, projectRevision: 8 };
    },
    listThreads(input: unknown) {
      calls.push({ method: "listThreads", input });
      return { items: [], hasMore: false };
    },
    getThread(input: unknown) {
      calls.push({ method: "getThread", input });
      return { threadId };
    },
    listMessages(input: unknown) {
      calls.push({ method: "listMessages", input });
      return { items: [], hasMore: false, nextBeforeSequence: null };
    },
    sendMessage(input: unknown) {
      calls.push({ method: "sendMessage", input });
      return { replayed: false, messageId: threadId, sequence: 1 };
    },
    withdrawConsent(input: unknown) {
      calls.push({ method: "withdrawConsent", input });
      return { replayed: false, projectRevision: 9, threadId };
    },
  };
  const deps = {
    authenticate: async () => ({
      userId: ownerUserId,
      type: "regular" as const,
    }),
    enabled: () => true,
    schemaAvailable: async () => true,
    repository: repository as unknown as Parameters<
      typeof createProjectHumanMessagingHandlers
    >[0]["repository"],
    rateLimit: async () => true,
    ...overrides,
  } as Parameters<typeof createProjectHumanMessagingHandlers>[0];
  return { handlers: createProjectHumanMessagingHandlers(deps), calls };
}

test("thread creation requires explicit accepted versioned consent and derives actor from session", async () => {
  const { handlers, calls } = makeHandlers();
  const response = await handlers.create(
    request("POST", "/", {
      accepted: true,
      assignmentId,
      expectedProjectRevision: 7,
      lawyerUserId,
      noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
      operationId: "owner-consent-1",
    }),
    projectId
  );
  assert.equal(response.status, 201);
  assert.equal(calls[0]?.method, "createThread");
  assert.deepEqual(calls[0]?.input, {
    actorUserId: ownerUserId,
    projectId,
    assignmentId,
    lawyerUserId,
    expectedProjectRevision: 7,
    operationId: "owner-consent-1",
  });
  const body = (await response.json()) as {
    noticeVersion: string;
    purpose: string;
  };
  assert.equal(body.noticeVersion, PROJECT_HUMAN_MESSAGING_NOTICE_VERSION);
  assert.equal(body.purpose, "one_to_one_plain_text_project_collaboration");
});

test("strict consent and message payloads reject caller authority and protected resource fields", async () => {
  const { handlers, calls } = makeHandlers();
  const extraConsent = await handlers.create(
    request("POST", "/", {
      accepted: true,
      assignmentId,
      expectedProjectRevision: 7,
      lawyerUserId,
      noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
      operationId: "owner-consent-2",
      actorUserId: lawyerUserId,
      documentId: "protected-document",
    }),
    projectId
  );
  const extraMessage = await handlers.messages(
    request("POST", "/", {
      operationId: "message-1",
      body: "Hello",
      authorUserId: lawyerUserId,
      privateAiChatId: "private-chat",
    }),
    projectId,
    threadId
  );
  assert.equal(extraConsent.status, 400);
  assert.equal(extraMessage.status, 400);
  assert.equal(calls.length, 0);
});

test("guest, disabled feature, rate exhaustion, infrastructure failure, and missing schema fail closed", async () => {
  const guest = makeHandlers({
    authenticate: async () => ({ userId: ownerUserId, type: "guest" as const }),
  });
  assert.equal(
    (await guest.handlers.list(request("GET", "/"), projectId)).status,
    404
  );

  const disabled = makeHandlers({ enabled: () => false });
  assert.equal(
    (await disabled.handlers.list(request("GET", "/"), projectId)).status,
    404
  );

  const exhausted = makeHandlers({ rateLimit: async () => false });
  assert.equal(
    (await exhausted.handlers.list(request("GET", "/"), projectId)).status,
    429
  );

  const unavailable = makeHandlers({
    rateLimit: () => Promise.reject(new Error("redis unavailable")),
  });
  assert.equal(
    (await unavailable.handlers.list(request("GET", "/"), projectId)).status,
    503
  );

  const schemaMissing = makeHandlers({ schemaAvailable: async () => false });
  assert.equal(
    (await schemaMissing.handlers.list(request("GET", "/"), projectId)).status,
    503
  );
});

test("thread and message reads enforce bounded pagination through the repository contract", async () => {
  const { handlers, calls } = makeHandlers();
  const list = await handlers.list(request("GET", "/"), projectId);
  const page = await handlers.messages(
    request("GET", "/?limit=12&beforeSequence=40"),
    projectId,
    threadId
  );
  assert.equal(list.status, 200);
  assert.equal(page.status, 200);
  assert.deepEqual(
    calls.map((call) => call.method),
    ["listThreads", "listMessages"]
  );
  assert.deepEqual(calls[1]?.input, {
    actorUserId: ownerUserId,
    projectId,
    threadId,
    beforeSequence: 40,
    limit: 12,
  });
  assert.equal(
    (
      await handlers.messages(
        request("GET", "/?limit=500"),
        projectId,
        threadId
      )
    ).status,
    400
  );
});

test("send and withdrawal bind server actor, exact thread, operation key, and expected Project revision", async () => {
  const { handlers, calls } = makeHandlers();
  const sent = await handlers.messages(
    request("POST", "/", {
      operationId: "message-actor-scope",
      body: "A plain text message.",
    }),
    projectId,
    threadId
  );
  const withdrawn = await handlers.withdraw(
    request("DELETE", "/", {
      operationId: "consent-withdraw-1",
      expectedProjectRevision: 8,
    }),
    projectId,
    threadId
  );
  assert.equal(sent.status, 201);
  assert.equal(withdrawn.status, 200);
  assert.deepEqual(calls, [
    {
      method: "sendMessage",
      input: {
        actorUserId: ownerUserId,
        projectId,
        threadId,
        operationId: "message-actor-scope",
        body: "A plain text message.",
      },
    },
    {
      method: "withdrawConsent",
      input: {
        actorUserId: ownerUserId,
        projectId,
        threadId,
        operationId: "consent-withdraw-1",
        expectedProjectRevision: 8,
      },
    },
  ]);
});

test("consent cannot be created without explicit acceptance of the supported notice", async () => {
  const { handlers, calls } = makeHandlers();
  for (const body of [
    {
      accepted: false,
      assignmentId,
      expectedProjectRevision: 7,
      lawyerUserId,
      noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
      operationId: "consent-false",
    },
    {
      accepted: true,
      assignmentId,
      expectedProjectRevision: 7,
      lawyerUserId,
      noticeVersion: "unsupported-notice",
      operationId: "consent-wrong-notice",
    },
  ]) {
    const response = await handlers.create(
      request("POST", "/", body),
      projectId
    );
    assert.equal(response.status, 400);
  }
  assert.equal(calls.length, 0);
});

test("unknown and inaccessible thread responses are indistinguishable", async () => {
  const inaccessible = makeHandlers({
    repository: {
      getThread() {
        throw new ProjectHumanMessagingError("not_found");
      },
    },
  });
  const response = await inaccessible.handlers.detail(
    request("GET", "/"),
    projectId,
    threadId
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Thread not found." });
});

test("foreign and unknown Project thread lists have the same generic 404", async () => {
  const handler = makeHandlers({
    repository: {
      listThreads() {
        throw new ProjectHumanMessagingError("not_found");
      },
    },
  }).handlers;
  const unknownProject = await handler.list(request("GET", "/"), projectId);
  const foreignProject = await handler.list(
    request("GET", "/"),
    "123e4567-e89b-42d3-a456-426614174099"
  );
  assert.equal(unknownProject.status, 404);
  assert.equal(foreignProject.status, 404);
  const unknownBody = await unknownProject.json();
  const foreignBody = await foreignProject.json();
  assert.deepEqual(unknownBody, foreignBody);
  assert.deepEqual(unknownBody, { error: "Thread not found." });
});

test("message byte bound is enforced before repository send", async () => {
  const { handlers, calls } = makeHandlers();
  const response = await handlers.messages(
    request("POST", "/", {
      operationId: "message-big",
      body: "é".repeat(4097),
    }),
    projectId,
    threadId
  );
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});
