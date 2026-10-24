import assert from "node:assert/strict";
import { test } from "node:test";
import { createVoteHandlers } from "./vote-http";

function makeHandlers(input: {
  userId?: string | null;
  projectChat?: boolean;
  projectLookupFails?: boolean;
}) {
  const calls = { getChat: 0, getVotes: 0, vote: 0 };
  const handlers = createVoteHandlers({
    authenticate: () =>
      Promise.resolve(input.userId ? { user: { id: input.userId } } : null),
    isProjectChat() {
      if (input.projectLookupFails) {
        return Promise.reject(new Error("Project origin unavailable"));
      }
      return Promise.resolve(input.projectChat ?? false);
    },
    getChatById() {
      calls.getChat += 1;
      return Promise.resolve({ userId: "customer-1" });
    },
    getVotesByChatId() {
      calls.getVotes += 1;
      return Promise.resolve([{ chatId: "standalone-chat", isUpvoted: true }]);
    },
    voteMessage() {
      calls.vote += 1;
      return Promise.resolve();
    },
  });
  return { handlers, calls };
}

function getRequest(chatId = "standalone-chat") {
  return new Request(`http://localhost/api/vote?chatId=${chatId}`);
}

function patchRequest(chatId = "standalone-chat") {
  return new Request("http://localhost/api/vote", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chatId, messageId: "message-1", type: "up" }),
  });
}

for (const membershipStatus of ["active", "revoked"] as const) {
  test(`Project Vote GET and PATCH reject linked Chats for ${membershipStatus} members`, async () => {
    const { handlers, calls } = makeHandlers({
      userId: "customer-1",
      projectChat: true,
    });

    const getResponse = await handlers.GET(getRequest("project-chat"));
    const patchResponse = await handlers.PATCH(patchRequest("project-chat"));

    assert.equal(getResponse.status, 404);
    assert.equal(patchResponse.status, 404);
    assert.deepEqual(calls, { getChat: 0, getVotes: 0, vote: 0 });
  });
}

test("Vote APIs fail closed when Project origin cannot be verified", async () => {
  const { handlers, calls } = makeHandlers({
    userId: "customer-1",
    projectLookupFails: true,
  });

  const getResponse = await handlers.GET(getRequest("unknown-chat"));
  const patchResponse = await handlers.PATCH(patchRequest("unknown-chat"));

  assert.equal(getResponse.status, 503);
  assert.equal(patchResponse.status, 503);
  assert.deepEqual(calls, { getChat: 0, getVotes: 0, vote: 0 });
});

test("Standalone Vote GET and PATCH retain owner behavior", async () => {
  const { handlers, calls } = makeHandlers({ userId: "customer-1" });

  const getResponse = await handlers.GET(getRequest());
  assert.equal(getResponse.status, 200);
  assert.deepEqual(await getResponse.json(), [
    { chatId: "standalone-chat", isUpvoted: true },
  ]);

  const patchResponse = await handlers.PATCH(patchRequest());
  assert.equal(patchResponse.status, 200);
  assert.equal(await patchResponse.text(), "Message voted");
  assert.deepEqual(calls, { getChat: 2, getVotes: 1, vote: 1 });
});

test("Standalone Vote APIs still deny a non-owner", async () => {
  const { handlers, calls } = makeHandlers({ userId: "another-customer" });

  const getResponse = await handlers.GET(getRequest());
  const patchResponse = await handlers.PATCH(patchRequest());

  assert.equal(getResponse.status, 403);
  assert.equal(patchResponse.status, 403);
  assert.deepEqual(calls, { getChat: 2, getVotes: 0, vote: 0 });
});
