import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createStaffWorkspaceHandlers,
  type StaffWorkspaceHandlerDependencies,
} from "./http";
import { emptyStaffWorkspaceSummary } from "./staff-queue";

/**
 * Phase 13 M9-B staff workspace HTTP surface.
 *
 * Verified here: a non-lawyer gets 403 without any data read, a Project the actor holds no
 * assignment for is indistinguishable from an absent Project, and an unavailable queue is
 * reported as 503 rather than as an empty queue.
 */

const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function handlers(overrides: Partial<StaffWorkspaceHandlerDependencies> = {}) {
  const calls: string[] = [];
  const deps: StaffWorkspaceHandlerDependencies = {
    authenticate: () => Promise.resolve({ role: "lawyer", userId: "u-1" }),
    loadDetail: () => {
      calls.push("loadDetail");
      return Promise.resolve({
        kind: "ok",
        detail: {
          blockedReasonCodes: ["resource_source_unavailable"],
          disclosure: {
            decision: "DENY",
            reasonCode: "resource_source_unavailable",
          },
          permitted: ["project_shell"],
          professionalReview: {
            reasonCode: "professional_authority_unavailable",
            state: "unavailable",
          },
          projectId,
          review: null,
          shell: {
            acceptedAt: null,
            assignmentId: "assignment-1",
            assignmentRole: "lawyer",
            assignmentStatus: "active",
            projectId,
            projectLifecycle: "active",
            updatedAt: null,
          },
        },
      });
    },
    loadQueue: () => {
      calls.push("loadQueue");
      return Promise.resolve({
        kind: "ok",
        summary: emptyStaffWorkspaceSummary({
          actorRole: "lawyer",
          actorUserId: "u-1",
        }),
      });
    },
    ...overrides,
  };
  return { calls, handlers: createStaffWorkspaceHandlers(deps) };
}

test("an unauthenticated staff request is refused with no data read", async () => {
  const { calls, handlers: h } = handlers({ authenticate: async () => null });
  assert.equal(
    (await h.getQueue(new Request("http://localhost/x"))).status,
    401
  );
  assert.equal(
    (await h.getProjectDetail(new Request("http://localhost/x"), projectId))
      .status,
    401
  );
  assert.deepEqual(calls, []);
});

test("a non-lawyer actor is refused with no data read", async () => {
  for (const role of ["user", "admin"]) {
    const { calls, handlers: h } = handlers({
      authenticate: () => Promise.resolve({ role, userId: "u-1" }),
    });
    const queue = await h.getQueue(new Request("http://localhost/x"));
    assert.equal(queue.status, 403);
    const detail = await h.getProjectDetail(
      new Request("http://localhost/x"),
      projectId
    );
    assert.equal(detail.status, 403);
    assert.deepEqual(calls, []);
    const queueBody = (await queue.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(queueBody), ["error"]);
  }
});

test("an unassigned Project is indistinguishable from an absent one", async () => {
  const { handlers: h } = handlers({
    loadDetail: async () => ({ kind: "not_found" }),
  });
  const missing = await h.getProjectDetail(
    new Request("http://localhost/x"),
    projectId
  );
  assert.equal(missing.status, 404);
  const malformed = await h.getProjectDetail(
    new Request("http://localhost/x"),
    "not-a-uuid"
  );
  assert.equal(malformed.status, 404);
  assert.deepEqual(
    Object.keys((await missing.json()) as Record<string, unknown>),
    Object.keys((await malformed.json()) as Record<string, unknown>)
  );
});

test("an unavailable workspace is reported as unavailable, never as empty", async () => {
  const { handlers: h } = handlers({
    loadQueue: async () => ({ kind: "unavailable" }),
  });
  assert.equal(
    (await h.getQueue(new Request("http://localhost/x"))).status,
    503
  );
});

test("an authorized queue and detail are returned as composed", async () => {
  const { handlers: h } = handlers();
  const queue = await h.getQueue(new Request("http://localhost/x"));
  assert.equal(queue.status, 200);
  const queueBody = (await queue.json()) as {
    workspace: { entries: unknown[]; counts: { all: number } };
  };
  assert.deepEqual(queueBody.workspace.entries, []);
  assert.equal(queueBody.workspace.counts.all, 0);

  const detail = await h.getProjectDetail(
    new Request("http://localhost/x"),
    projectId
  );
  assert.equal(detail.status, 200);
  const detailBody = (await detail.json()) as {
    detail: { review: unknown; disclosure: { decision: string } };
  };
  assert.equal(detailBody.detail.review, null);
  assert.equal(detailBody.detail.disclosure.decision, "DENY");
});
