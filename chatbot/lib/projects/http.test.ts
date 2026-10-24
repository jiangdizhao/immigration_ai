import assert from "node:assert/strict";
import { test } from "node:test";
import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";
import { createProjectFoundationHandlers } from "./http";

const actorId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const membershipId = "33333333-3333-4333-8333-333333333333";
const targetId = "44444444-4444-4444-8444-444444444444";

function jsonRequest(body: unknown, method = "POST") {
  return new Request("https://example.test/api/projects", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function testHandlers(
  options: {
    session?: { userId: string; type: "guest" | "regular" } | null;
    registered?: boolean;
    repository?: Record<string, unknown>;
    rateLimit?: (input: {
      actorUserId: string;
      ipAddress: string | null;
      action: "invite" | "invitation_inbox";
    }) => Promise<boolean>;
  } = {}
) {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const repository = {
    isRegisteredCustomer: () => options.registered ?? true,
    listProjects: (userId: string) => {
      calls.push({ name: "listProjects", input: userId });
      return [];
    },
    createProject: (input: unknown) => {
      calls.push({ name: "createProject", input });
      return {
        replayed: false,
        project: {
          id: projectId,
          ownerUserId: actorId,
          status: "active",
          revision: 1,
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          updatedAt: new Date("2026-10-01T00:00:00.000Z"),
          closedAt: null,
        },
      };
    },
    getProjectForActor: (input: unknown) => {
      calls.push({ name: "getProjectForActor", input });
      return {
        id: projectId,
        status: "active",
        revision: 1,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
        closedAt: null,
      };
    },
    closeProject: (input: unknown) => {
      calls.push({ name: "closeProject", input });
      return { replayed: false, project: {} };
    },
    listProjectMembers: (input: unknown) => {
      calls.push({ name: "listProjectMembers", input });
      return [
        {
          id: membershipId,
          userId: targetId,
          status: "pending",
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          updatedAt: new Date("2026-10-01T00:00:00.000Z"),
          acceptedAt: null,
          revokedAt: null,
        },
      ];
    },
    inviteProjectMember: (input: unknown) => {
      calls.push({ name: "inviteProjectMember", input });
      return { replayed: false, project: {} };
    },
    listPendingInvitations: (userId: string) => {
      calls.push({ name: "listPendingInvitations", input: userId });
      return [
        {
          membershipId,
          projectId,
          projectRevision: 7,
          status: "pending",
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          updatedAt: new Date("2026-10-01T00:00:00.000Z"),
        },
      ];
    },
    acceptProjectMembership: (input: unknown) => {
      calls.push({ name: "acceptProjectMembership", input });
      return { replayed: false, project: {} };
    },
    revokeProjectMembership: (input: unknown) => {
      calls.push({ name: "revokeProjectMembership", input });
      return { replayed: false, project: {} };
    },
    ...options.repository,
  } as unknown as Parameters<
    typeof createProjectFoundationHandlers
  >[0]["repository"];

  const handlers = createProjectFoundationHandlers({
    authenticate: async () =>
      options.session === undefined
        ? { userId: actorId, type: "regular" }
        : options.session,
    isRegisteredCustomer: repository.isRegisteredCustomer,
    schemaAvailable: async () => true,
    repository,
    rateLimit: options.rateLimit,
  });
  return { handlers, calls };
}

test("project endpoints require an authenticated regular session", async () => {
  const { handlers, calls } = testHandlers({ session: null });
  const response = await handlers.listProjects(
    new Request("https://example.test")
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(calls, []);

  const guest = testHandlers({ session: { userId: actorId, type: "guest" } });
  const guestResponse = await guest.handlers.listProjects(
    new Request("https://example.test")
  );
  assert.equal(guestResponse.status, 401);
  assert.deepEqual(guest.calls, []);
});

test("current non-customer database identities cannot use customer APIs", async () => {
  const { handlers, calls } = testHandlers({ registered: false });
  const response = await handlers.listProjects(
    new Request("https://example.test")
  );
  assert.equal(response.status, 403);
  assert.deepEqual(calls, []);
});

test("Project schema readiness fails closed with a private unavailable response", async () => {
  const deps = testHandlers();
  const handlers = createProjectFoundationHandlers({
    authenticate: async () => ({ userId: actorId, type: "regular" }),
    isRegisteredCustomer: async () => true,
    schemaAvailable: async () => false,
    repository: {} as unknown as Parameters<
      typeof createProjectFoundationHandlers
    >[0]["repository"],
  });
  const response = await handlers.listProjects(
    new Request("https://example.test")
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(deps.calls.length, 0);
});

test("strict mutation schemas reject forged actor and authority fields", async () => {
  const { handlers, calls } = testHandlers();
  const response = await handlers.inviteMember(
    jsonRequest({
      operationId: "invite-1",
      expectedRevision: 1,
      targetUserId: targetId,
      actorUserId: targetId,
      role: "admin",
    }),
    projectId
  );
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});

test("eligible and neutral invite outcomes have the same bodyless response", async () => {
  const seenTargets: string[] = [];
  const { handlers } = testHandlers({
    repository: {
      inviteProjectMember: (input: { targetUserId: string }) => {
        seenTargets.push(input.targetUserId);
        return { replayed: false, project: {} };
      },
    },
  });
  const responses = await Promise.all(
    [targetId, "55555555-5555-4555-8555-555555555555"].map((id) =>
      handlers.inviteMember(
        jsonRequest({
          operationId: `invite-${id.slice(0, 8)}`,
          expectedRevision: 1,
          targetUserId: id,
        }),
        projectId
      )
    )
  );
  assert.deepEqual(seenTargets, [
    targetId,
    "55555555-5555-4555-8555-555555555555",
  ]);
  for (const response of responses) {
    assert.equal(response.status, 202);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("oversized invite payloads are rejected before repository access", async () => {
  const { handlers, calls } = testHandlers();
  const response = await handlers.inviteMember(
    new Request("https://example.test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(8 * 1024 + 1),
      },
      body: "{}",
    }),
    projectId
  );
  assert.equal(response.status, 413);
  assert.deepEqual(calls, []);
});

test("revisions and identifiers are validated without echoing hidden identifiers", async () => {
  const { handlers, calls } = testHandlers({
    repository: {
      inviteProjectMember: () => {
        throw new ProjectFoundationError("revision_conflict");
      },
    },
  });
  const stale = await handlers.inviteMember(
    jsonRequest({
      operationId: "invite-stale",
      expectedRevision: 1,
      targetUserId: targetId,
    }),
    projectId
  );
  assert.equal(stale.status, 409);
  assert.equal((await stale.text()).includes(targetId), false);

  const invalidId = await handlers.getProject(
    new Request("https://example.test"),
    "not-a-uuid"
  );
  assert.equal(invalidId.status, 400);
  assert.equal(calls.length, 0);
});

test("owner roster and invitation inbox return only their repository projections", async () => {
  const rateLimits: unknown[] = [];
  const { handlers, calls } = testHandlers({
    rateLimit: (input) => {
      rateLimits.push(input);
      return Promise.resolve(true);
    },
  });
  const roster = await handlers.listMembers(
    new Request("https://example.test"),
    projectId
  );
  const rosterJson = await roster.json();
  assert.equal(roster.status, 200);
  assert.equal(JSON.stringify(rosterJson).includes("email"), false);
  assert.equal(JSON.stringify(rosterJson).includes("chat"), false);

  const inboxRequest = new Request("https://example.test", {
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.2" },
  });
  const inbox = await handlers.invitationInbox(inboxRequest);
  const inboxJson = (await inbox.json()) as {
    invitations: Record<string, unknown>[];
  };
  assert.equal(inbox.status, 200);
  assert.deepEqual(Object.keys(inboxJson.invitations[0] ?? {}).sort(), [
    "createdAt",
    "membershipId",
    "projectId",
    "projectRevision",
    "status",
    "updatedAt",
  ]);
  assert.deepEqual(rateLimits, [
    {
      actorUserId: actorId,
      ipAddress: "203.0.113.9",
      action: "invitation_inbox",
    },
  ]);
  assert.ok(calls.some((call) => call.name === "listPendingInvitations"));
});

test("rate-limited invitation attempts return a bodyless, private 429", async () => {
  const { handlers, calls } = testHandlers({
    rateLimit: async () => false,
  });
  const response = await handlers.inviteMember(
    jsonRequest({
      operationId: "invite-limit",
      expectedRevision: 1,
      targetUserId: targetId,
    }),
    projectId
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(calls, []);
});

test("closed, unauthorized, and cross-Project resources map to generic errors", async () => {
  const { handlers } = testHandlers({
    repository: {
      getProjectForActor: () => {
        throw new ProjectFoundationError("project_not_found");
      },
    },
  });
  const response = await handlers.getProject(
    new Request("https://example.test"),
    projectId
  );
  assert.equal(response.status, 404);
  assert.equal(
    await response.text(),
    '{"error":"Project or membership not found."}'
  );
});
