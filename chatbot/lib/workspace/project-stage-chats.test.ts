import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadProjectStageChats,
  openProjectStageChat,
} from "./project-stage-chats";

const projectId = "11111111-1111-4111-8111-111111111111";
const chatId = "22222222-2222-4222-8222-222222222222";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("opening a step conversation sends only the step key", async () => {
  const captured: {
    value: { url: string; init?: RequestInit } | null;
  } = { value: null };
  const result = await openProjectStageChat({
    fetchImpl: (url, init) => {
      captured.value = { init, url: String(url) };
      return Promise.resolve(
        jsonResponse(
          {
            chatId,
            origin: "project",
            projectId,
            readOnly: false,
            replayed: false,
            stageKey: "student500",
          },
          201
        )
      );
    },
    projectId,
    stageKey: "student500",
  });
  assert.deepEqual(result, {
    chatId,
    ok: true,
    readOnly: false,
    replayed: false,
    stageKey: "student500",
  });
  assert.equal(captured.value?.url, `/api/projects/${projectId}/stage-chats`);
  assert.equal(captured.value?.init?.method, "POST");
  // No title, chat id or project id from the client participates in the binding.
  assert.deepEqual(JSON.parse(String(captured.value?.init?.body)), {
    stageKey: "student500",
  });
});

test("a response for another Project or step is refused", async () => {
  const otherProject = await openProjectStageChat({
    fetchImpl: async () =>
      jsonResponse({
        chatId,
        origin: "project",
        projectId: "99999999-9999-4999-8999-999999999999",
        readOnly: false,
        replayed: false,
        stageKey: "student500",
      }),
    projectId,
    stageKey: "student500",
  });
  assert.deepEqual(otherProject, { ok: false, state: "request_failed" });

  const otherStage = await openProjectStageChat({
    fetchImpl: async () =>
      jsonResponse({
        chatId,
        origin: "project",
        projectId,
        readOnly: false,
        replayed: true,
        stageKey: "school_admissions",
      }),
    projectId,
    stageKey: "student500",
  });
  assert.deepEqual(otherStage, { ok: false, state: "request_failed" });
});

test("an unavailable binding schema stays an honest unavailable state", async () => {
  assert.deepEqual(
    await openProjectStageChat({
      fetchImpl: async () => jsonResponse({ error: "unavailable" }, 503),
      projectId,
      stageKey: "student500",
    }),
    { ok: false, state: "unavailable" }
  );
  assert.deepEqual(
    await openProjectStageChat({
      fetchImpl: () => Promise.resolve(jsonResponse({ error: "auth" }, 401)),
      projectId,
      stageKey: "school_applications",
    }),
    { ok: false, state: "authentication_required" }
  );
  assert.deepEqual(
    await openProjectStageChat({
      fetchImpl: () => {
        throw new TypeError("network");
      },
      projectId,
      stageKey: "school_applications",
    }),
    { ok: false, state: "request_failed" }
  );
});

test("listing only accepts known step keys and string chat ids", async () => {
  const ok = await loadProjectStageChats({
    fetchImpl: async () =>
      jsonResponse({
        stageChats: [
          {
            chatId,
            createdAt: "2026-11-06T00:00:00.000Z",
            stageKey: "student500",
          },
        ],
      }),
    projectId,
  });
  assert.deepEqual(ok, {
    ok: true,
    stageChats: [
      { chatId, createdAt: "2026-11-06T00:00:00.000Z", stageKey: "student500" },
    ],
  });

  const unknownStage = await loadProjectStageChats({
    fetchImpl: async () =>
      jsonResponse({
        stageChats: [{ chatId, createdAt: null, stageKey: "step_9" }],
      }),
    projectId,
  });
  assert.deepEqual(unknownStage, { ok: false, state: "request_failed" });

  const badId = await loadProjectStageChats({
    fetchImpl: async () =>
      jsonResponse({
        stageChats: [{ chatId: 5, createdAt: null, stageKey: "student500" }],
      }),
    projectId,
  });
  assert.deepEqual(badId, { ok: false, state: "request_failed" });
});
