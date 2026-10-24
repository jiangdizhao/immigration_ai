import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeCursor } from "@/lib/conversations/pagination";
import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";
import { createProjectChatsHandlers } from "./chats-http";

const actorUserId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const chatId = "00000000-0000-4000-8000-000000000003";
const at = new Date("2026-10-24T00:00:00.000Z");

function harness(
  input: {
    session?: { userId: string; type: "guest" | "regular" } | null;
    registered?: boolean;
    enabled?: boolean;
  } = {}
) {
  const created: unknown[] = [];
  let listCalls = 0;
  const handlers = createProjectChatsHandlers({
    authenticate: async () =>
      input.session ?? { userId: actorUserId, type: "regular" },
    isRegisteredCustomer: async () => input.registered !== false,
    schemaAvailable: async () => true,
    writesEnabled: () => input.enabled === true,
    repository: {
      createProjectChat(values) {
        created.push(values);
        return Promise.resolve({
          replayed: false,
          project: {
            id: projectId,
            ownerUserId: actorUserId,
            status: "active" as const,
            revision: 2,
            createdAt: at,
            updatedAt: at,
            closedAt: null,
          },
          chatId,
          createdByUserId: actorUserId,
        });
      },
      listOwnedProjectChats() {
        listCalls += 1;
        return Promise.resolve({
          conversations: [
            {
              chatId,
              projectId,
              title: "Project chat",
              chatTitle: "Project chat",
              createdAt: at,
              updatedAt: at,
              origin: "project" as const,
              readOnly: true,
            },
          ],
          hasMore: false,
        });
      },
    },
  });
  return {
    handlers,
    created,
    get listCalls() {
      return listCalls;
    },
  };
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/projects/test/chats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("Project Chat create is default-off and leaves the repository untouched", async () => {
  const h = harness();
  const response = await h.handlers.create(
    createRequest({ operationId: "chat-create-1" }),
    projectId
  );
  assert.equal(response.status, 503);
  assert.equal(h.created.length, 0);
});

test("Project Chat create accepts only the operation payload and returns server identity", async () => {
  const h = harness({ enabled: true });
  const response = await h.handlers.create(
    createRequest({ operationId: "chat-create-1", title: "  Study plan  " }),
    projectId
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    chatId,
    projectId,
    origin: "project",
    readOnly: false,
    replayed: false,
  });
  assert.deepEqual(h.created, [
    {
      actorUserId,
      projectId,
      operationId: "chat-create-1",
      title: "Study plan",
    },
  ]);

  const forged = await h.handlers.create(
    createRequest({
      operationId: "chat-create-2",
      actorUserId,
      chatId,
    }),
    projectId
  );
  assert.equal(forged.status, 400);
  assert.equal(h.created.length, 1);
});

test("Project Chat create rejects guest and unregistered sessions", async () => {
  const guest = harness({
    enabled: true,
    session: { userId: actorUserId, type: "guest" },
  });
  assert.equal(
    (
      await guest.handlers.create(
        createRequest({ operationId: "chat-create-1" }),
        projectId
      )
    ).status,
    401
  );
  const unregistered = harness({ enabled: true, registered: false });
  assert.equal(
    (
      await unregistered.handlers.create(
        createRequest({ operationId: "chat-create-1" }),
        projectId
      )
    ).status,
    403
  );
});

test("Project Chat list is current-user scoped and marks closed or disabled history read-only", async () => {
  const h = harness();
  const response = await h.handlers.list(
    new Request("http://localhost/api/projects/test/chats?limit=1"),
    projectId
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(h.listCalls, 1);
  assert.ok(body.conversations[0]);
  assert.equal(body.conversations[0].origin, "project");
  assert.equal(body.conversations[0].readOnly, true);
  assert.equal(body.conversations[0].chatId, chatId);
  assert.equal(body.nextCursor, null);
});

test("Project Chat list cursors use the shared bounded conversation format", async () => {
  const h = harness();
  const cursor = encodeCursor("conversation", {
    timestamp: at.getTime(),
    id: chatId,
  });
  const response = await h.handlers.list(
    new Request(
      `http://localhost/api/projects/test/chats?limit=1&cursor=${cursor}`
    ),
    projectId
  );
  assert.equal(response.status, 200);
  assert.equal(h.listCalls, 1);
});

test("Project Chat repository authorization failures remain scoped", async () => {
  const restricted = createProjectChatsHandlers({
    authenticate: async () => ({ userId: actorUserId, type: "regular" }),
    isRegisteredCustomer: async () => true,
    schemaAvailable: async () => true,
    writesEnabled: () => true,
    repository: {
      createProjectChat() {
        return Promise.reject(new ProjectFoundationError("project_forbidden"));
      },
      listOwnedProjectChats() {
        return Promise.reject(new ProjectFoundationError("project_not_found"));
      },
    },
  });
  assert.equal(
    (
      await restricted.create(
        createRequest({ operationId: "chat-create-1" }),
        projectId
      )
    ).status,
    404
  );
  assert.equal(
    (await restricted.list(new Request("http://localhost"), projectId)).status,
    404
  );
});
