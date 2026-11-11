// biome-ignore-all lint/suspicious/useAwait: In-memory fakes return immediate promise values.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectFactHandlers, type ProjectFactProjection } from "./http";

/**
 * Phase 14-B facts API contract: authentication, Project authorization, batch bounds,
 * server-derived Project revision and honest conflict reporting.
 */

const emptyProjection: ProjectFactProjection = {
  candidates: [],
  authorizedForAI: [],
  conflictCount: 0,
};

type Actor = { userId: string; type?: string } | null;

function setup(
  options: {
    actor?: Actor;
    registered?: boolean;
    schema?: boolean;
    enabled?: boolean;
    authorizeStatus?: string;
  } = {}
) {
  const calls: Record<string, unknown>[] = [];
  const state = {
    actor:
      options.actor === undefined
        ? ({ userId: "customer-1", type: "regular" } as Actor)
        : options.actor,
    registered: options.registered ?? true,
    schema: options.schema ?? true,
    enabled: options.enabled ?? true,
    authorizeStatus: options.authorizeStatus ?? "active",
  };
  const handlers = createProjectFactHandlers({
    authenticate: async () => state.actor,
    isRegisteredCustomer: async () => state.registered,
    schemaAvailable: async () => state.schema,
    featureEnabled: () => state.enabled,
    authorize: async (input) => {
      calls.push({ authorize: input });
      return {
        id: input.projectId,
        status: state.authorizeStatus,
        revision: 7,
      };
    },
    projection: async (input) => {
      calls.push({ projection: input });
      return emptyProjection;
    },
    review: {
      confirmMany: async (input) => {
        calls.push({ confirmMany: input });
        return {
          completed: [],
          failures: [],
          complete: true,
          sawRevisionConflict: false,
        };
      },
      rejectMany: async (input) => {
        calls.push({ rejectMany: input });
        return {
          completed: [],
          failures: [],
          complete: true,
          sawRevisionConflict: false,
        };
      },
      correct: async (input) => {
        calls.push({ correct: input });
        return {
          status: "corrected" as const,
          created: null,
          superseded: null,
          code: null,
        };
      },
      authorizeForAI: async (input) => {
        calls.push({ authorizeForAI: input });
        return {
          publications: [],
          grants: [],
          failures: [],
          complete: true,
          sawRevisionConflict: false,
        };
      },
      revokeAIUse: async (input) => {
        calls.push({ revokeAIUse: input });
        return {
          completed: [],
          failures: [],
          complete: true,
          sawRevisionConflict: false,
        };
      },
    },
  });
  return { handlers, calls, state };
}

function post(body: unknown, projectId = "project-a") {
  return new Request(`http://localhost/api/projects/${projectId}/facts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const listRequest = () => new Request("http://localhost/api/projects");

test("unauthenticated, unregistered, disabled and closed Projects are denied", async () => {
  const anonymous = setup({ actor: null });
  assert.equal(
    (await anonymous.handlers.list(listRequest(), "project-a")).status,
    401
  );

  const guest = setup({ actor: { userId: "guest-1", type: "guest" } });
  assert.equal(
    (await guest.handlers.list(listRequest(), "project-a")).status,
    401
  );

  const unregistered = setup({ registered: false });
  assert.equal(
    (await unregistered.handlers.list(listRequest(), "project-a")).status,
    403
  );

  const disabled = setup({ enabled: false });
  assert.equal(
    (await disabled.handlers.list(listRequest(), "project-a")).status,
    503
  );

  const partialSchema = setup({ schema: false });
  assert.equal(
    (await partialSchema.handlers.list(listRequest(), "project-a")).status,
    503
  );

  const closed = setup({ authorizeStatus: "closed" });
  const closedWrite = await closed.handlers.apply(
    post({
      action: "confirm",
      operationId: "op-1",
      items: [{ assertionId: "assertion-1", assertionVersion: 1 }],
    }),
    "project-a"
  );
  assert.equal(closedWrite.status, 403);
});

test("a write uses the server-derived Project revision and actor, never the body", async () => {
  const { handlers, calls } = setup();
  const response = await handlers.apply(
    post({
      action: "confirm",
      operationId: "op-confirm-1",
      items: [{ assertionId: "assertion-1", assertionVersion: 2 }],
      actorUserId: "attacker",
      expectedProjectRevision: 999,
    }),
    "project-a"
  );
  assert.equal(response.status, 200);
  const confirm = calls.find((call) => "confirmMany" in call) as {
    confirmMany: {
      actor: {
        actorUserId: string;
        projectId: string;
        expectedProjectRevision: number;
      };
      operationId: string;
    };
  };
  assert.equal(confirm.confirmMany.actor.actorUserId, "customer-1");
  assert.equal(confirm.confirmMany.actor.projectId, "project-a");
  assert.equal(confirm.confirmMany.actor.expectedProjectRevision, 7);
  assert.equal(confirm.confirmMany.operationId, "op-confirm-1");
});

test("invalid actions, batches and values are rejected without touching the service", async () => {
  const { handlers, calls } = setup();
  const cases = [
    { action: "delete_everything", operationId: "op-1", items: [] },
    {
      action: "confirm",
      operationId: "bad id",
      items: [{ assertionId: "a", assertionVersion: 1 }],
    },
    { action: "confirm", operationId: "op-2", items: [] },
    {
      action: "confirm",
      operationId: "op-3",
      items: [{ assertionId: "a", assertionVersion: 0 }],
    },
    {
      action: "authorize_for_ai",
      operationId: "op-4",
      items: [{ assertionId: "a", assertionVersion: 1 }],
      audience: "everyone",
    },
    {
      action: "correct",
      operationId: "op-5",
      item: { assertionId: "a", assertionVersion: 1 },
      key: "study.course",
      valueType: "date",
      value: "",
    },
  ];
  for (const body of cases) {
    const response = await handlers.apply(post(body), "project-a");
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(
    calls.some((call) => "confirmMany" in call),
    false
  );
});

test("authorize_for_ai defaults to the narrow actor-only audience", async () => {
  const { handlers, calls } = setup();
  const response = await handlers.apply(
    post({
      action: "authorize_for_ai",
      operationId: "op-authorize-1",
      items: [{ assertionId: "assertion-1", assertionVersion: 1 }],
    }),
    "project-a"
  );
  assert.equal(response.status, 200);
  const call = calls.find((entry) => "authorizeForAI" in entry) as {
    authorizeForAI: { audience: string };
  };
  assert.equal(call.authorizeForAI.audience, "actor_only");
});

function strictHandlers(
  review: Partial<
    Parameters<typeof createProjectFactHandlers>[0]["review"]
  > = {}
) {
  const base = createProjectFactHandlers({
    authenticate: async () => ({ userId: "customer-1" }),
    isRegisteredCustomer: async () => true,
    schemaAvailable: async () => true,
    featureEnabled: () => true,
    authorize: async (input) => ({
      id: input.projectId,
      status: "active",
      revision: 2,
    }),
    projection: async () => emptyProjection,
    review: {
      confirmMany: async () => ({
        completed: [],
        failures: [],
        complete: true,
        sawRevisionConflict: false,
      }),
      rejectMany: async () => ({
        completed: [],
        failures: [],
        complete: true,
        sawRevisionConflict: false,
      }),
      revokeAIUse: async () => ({
        completed: [],
        failures: [],
        complete: true,
        sawRevisionConflict: false,
      }),
      correct: async () => ({
        status: "corrected" as const,
        created: null,
        superseded: null,
        code: null,
      }),
      authorizeForAI: async () => ({
        publications: [],
        grants: [],
        failures: [],
        complete: true,
        sawRevisionConflict: false,
      }),
      ...review,
    },
  });
  return base;
}

test("a thrown service conflict is reported as 409 and never as success", async () => {
  const handlers = strictHandlers({
    confirmMany: async () => {
      throw Object.assign(new Error("revision_conflict"), {
        code: "revision_conflict",
      });
    },
  });
  const response = await handlers.apply(
    post({
      action: "confirm",
      operationId: "op-conflict",
      items: [{ assertionId: "assertion-1", assertionVersion: 1 }],
    }),
    "project-a"
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "revision_conflict" });
});

test("partial completion is reported as 409 with the exact failures, never as success", async () => {
  const handlers = strictHandlers({
    confirmMany: async () => ({
      completed: [],
      failures: [
        {
          index: 1,
          assertionId: "assertion-2",
          code: "revision_conflict",
          revisionConflict: true,
        },
      ],
      complete: false,
      sawRevisionConflict: true,
    }),
  });
  const response = await handlers.apply(
    post({
      action: "confirm",
      operationId: "op-partial",
      items: [
        { assertionId: "assertion-1", assertionVersion: 1 },
        { assertionId: "assertion-2", assertionVersion: 1 },
      ],
    }),
    "project-a"
  );
  assert.equal(response.status, 409);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.complete, false);
  assert.equal(body.requestedCount, 2);
  assert.equal(body.completedCount, 0);
  assert.equal(body.sawRevisionConflict, true);
  assert.deepEqual(body.failures, [
    { assertionId: "assertion-2", code: "revision_conflict" },
  ]);
  // The refreshed projection is returned so the UI can show the true state.
  assert.ok("projection" in body);
});

test("a correction whose replacement is missing is a 409 with a recoverable code", async () => {
  const handlers = strictHandlers({
    correct: async () => ({
      status: "replacement_missing" as const,
      created: null,
      superseded: null,
      code: "evidence_unverified",
    }),
  });
  const response = await handlers.apply(
    post({
      action: "correct",
      operationId: "op-correct",
      item: { assertionId: "assertion-1", assertionVersion: 1 },
      key: "study.course",
      valueType: "string",
      value: "Bachelor of Nursing (Honours)",
    }),
    "project-a"
  );
  assert.equal(response.status, 409);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.complete, false);
  assert.deepEqual(body.failures, [
    { assertionId: "assertion-1", code: "replacement_missing" },
  ]);
});

test("a fully successful batch returns 200 with complete true", async () => {
  const handlers = strictHandlers({
    confirmMany: async () => ({
      completed: [],
      failures: [],
      complete: true,
      sawRevisionConflict: false,
    }),
  });
  const response = await handlers.apply(
    post({
      action: "confirm",
      operationId: "op-ok",
      items: [{ assertionId: "assertion-1", assertionVersion: 1 }],
    }),
    "project-a"
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.complete, true);
  assert.deepEqual(body.failures, []);
});
