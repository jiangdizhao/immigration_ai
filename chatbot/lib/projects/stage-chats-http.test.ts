import assert from "node:assert/strict";
import { test } from "node:test";
import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";
import { createStageChatHandlers } from "./stage-chats-http";

const projectId = "11111111-1111-4111-8111-111111111111";
const chatId = "22222222-2222-4222-8222-222222222222";

type Call = {
  list: { actorUserId: string; projectId: string }[];
  create: { actorUserId: string; projectId: string; stageKey: string }[];
};

function harness(
  overrides: {
    authenticated?: boolean;
    schemaAvailable?: boolean;
    writesEnabled?: boolean;
    existing?: boolean;
    failure?: unknown;
    bindings?: { chatId: string; createdAt: Date; stageKey: string }[];
  } = {}
) {
  const calls: Call = { create: [], list: [] };
  const handlers = createStageChatHandlers({
    authenticate: () =>
      Promise.resolve(
        overrides.authenticated === false
          ? null
          : { type: "regular", userId: "actor-user-id" }
      ),
    repository: {
      findOrCreateStageChat(input) {
        calls.create.push({ ...input });
        if (overrides.failure) {
          return Promise.reject(overrides.failure);
        }
        return Promise.resolve({
          chatId,
          readOnly: false,
          replayed: overrides.existing ?? false,
          stageKey: input.stageKey,
        });
      },
      listStageChatBindings(input) {
        calls.list.push(input);
        if (overrides.failure) {
          return Promise.reject(overrides.failure);
        }
        return Promise.resolve((overrides.bindings ?? []) as never);
      },
    },
    stageSchemaAvailable: () =>
      Promise.resolve(overrides.schemaAvailable ?? true),
    writesEnabled: () => overrides.writesEnabled ?? true,
  });
  return { calls, handlers };
}

function openRequest(body: unknown, contentType = "application/json") {
  return new Request(`http://localhost/api/projects/${projectId}/stage-chats`, {
    body: JSON.stringify(body),
    headers: { "content-type": contentType },
    method: "POST",
  });
}

test("opening a step conversation binds it to the authenticated actor", async () => {
  const { calls, handlers } = harness();
  const response = await handlers.open(
    openRequest({ stageKey: "student500" }),
    projectId
  );
  assert.equal(response.status, 201);
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(body, {
    chatId,
    origin: "project",
    projectId,
    readOnly: false,
    replayed: false,
    stageKey: "student500",
  });
  // The actor and the Project come from the server, never from the body.
  assert.deepEqual(calls.create, [
    { actorUserId: "actor-user-id", projectId, stageKey: "student500" },
  ]);
});

test("an existing binding is reported as a replay, not a new Chat", async () => {
  const { handlers } = harness({ existing: true });
  const response = await handlers.open(
    openRequest({ stageKey: "school_applications" }),
    projectId
  );
  assert.equal(response.status, 200);
  assert.equal(
    ((await response.json()) as Record<string, unknown>).replayed,
    true
  );
});

test("the closed step vocabulary rejects unknown or extra input", async () => {
  const { calls, handlers } = harness();
  for (const body of [
    { stageKey: "workflow_step_9" },
    { stageKey: "student500", chatId },
    { stageKey: "student500", title: "Mine" },
    {},
    [],
  ]) {
    const response = await handlers.open(openRequest(body), projectId);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  // A non-JSON content type is refused before any binding can happen.
  const wrongType = await handlers.open(
    openRequest({ stageKey: "student500" }, "text/plain"),
    projectId
  );
  assert.equal(wrongType.status, 400);
  // A malformed Project id is refused.
  const badProject = await handlers.open(
    openRequest({ stageKey: "student500" }),
    "not-a-uuid"
  );
  assert.equal(badProject.status, 400);
  assert.equal(calls.create.length, 0);
});

test("unauthenticated, unapplied-schema and read-only states fail closed", async () => {
  const unauthenticated = await harness({ authenticated: false }).handlers.open(
    openRequest({ stageKey: "student500" }),
    projectId
  );
  assert.equal(unauthenticated.status, 401);

  const noSchema = await harness({ schemaAvailable: false }).handlers.open(
    openRequest({ stageKey: "student500" }),
    projectId
  );
  assert.equal(noSchema.status, 503);
  assert.match(
    ((await noSchema.json()) as { error: string }).error,
    /unavailable/u
  );

  const readOnly = await harness({ writesEnabled: false }).handlers.open(
    openRequest({ stageKey: "student500" }),
    projectId
  );
  assert.equal(readOnly.status, 503);
});

test("Project authority failures map to non-enumerating responses", async () => {
  for (const [code, status] of [
    ["project_not_found", 404],
    ["project_forbidden", 404],
    ["project_closed", 409],
    ["project_limit_reached", 429],
    ["outcome_unavailable", 503],
  ] as const) {
    const { handlers } = harness({
      failure: new ProjectFoundationError(code),
    });
    const response = await handlers.open(
      openRequest({ stageKey: "student500" }),
      projectId
    );
    assert.equal(response.status, status, code);
  }
});

test("listing returns only the actor's own bindings for one Project", async () => {
  const { calls, handlers } = harness({
    bindings: [
      {
        chatId,
        createdAt: new Date("2026-11-06T00:00:00.000Z"),
        stageKey: "student500",
      },
    ],
  });
  const response = await handlers.list(
    new Request(`http://localhost/api/projects/${projectId}/stage-chats`),
    projectId
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    stageChats: { chatId: string; stageKey: string }[];
  };
  assert.equal(body.stageChats.length, 1);
  assert.equal(body.stageChats[0]?.stageKey, "student500");
  assert.deepEqual(calls.list, [{ actorUserId: "actor-user-id", projectId }]);
  // The response is private and never cached.
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
