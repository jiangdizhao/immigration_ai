// biome-ignore-all lint/suspicious/useAwait: the fakes below intentionally mirror promise-returning dependencies.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";
import {
  createStageChatRepository,
  type StageChatBinding,
  type StageChatRepositoryDeps,
  stageChatOperationId,
} from "./stage-chat-binding";

/**
 * Phase 13 M9-A R1 — offline proof of the two corrected step-conversation defects.
 *
 * The production wiring uses the accepted M1 repository; these tests exercise the same
 * repository object with injected dependencies so the two properties that were wrong
 * can be asserted without a database:
 *
 *   R1-01  the deterministic operation id is **Project-specific**, so the same actor
 *          opening the same step in Project A and Project B gets two authorized Chats
 *          (M1 operation ids are unique per actor+operation, and the request hash
 *          includes the Project).
 *   R1-02  read-authorization happens **before** any binding query, so a revoked
 *          member, a foreign actor or a non-member cannot enumerate Chat ids, while a
 *          closed Project stays readable as read-only history.
 */

const actor = "actor-user";
const projectA = "11111111-1111-4111-8111-111111111111";
const projectB = "22222222-2222-4222-8222-222222222222";

type Calls = {
  authorize: { actorUserId: string; projectId: string }[];
  creates: { operationId: string; projectId: string; title: string }[];
  listBindings: number;
  insertions: number;
};

function harness(
  options: {
    authorized?: "active" | "closed" | "revoked" | "foreign" | "missing";
    existing?: StageChatBinding | null;
  } = {}
) {
  const calls: Calls = {
    authorize: [],
    creates: [],
    insertions: 0,
    listBindings: 0,
  };
  const created = new Map<string, string>();
  const bindings = new Map<string, StageChatBinding>();
  const deps: StageChatRepositoryDeps = {
    async authorizeProjectRead(input) {
      calls.authorize.push(input);
      const mode = options.authorized ?? "active";
      if (mode === "revoked" || mode === "foreign") {
        throw new ProjectFoundationError("project_forbidden");
      }
      if (mode === "missing") {
        throw new ProjectFoundationError("project_not_found");
      }
      return { id: input.projectId, status: mode };
    },
    async createProjectChat(input) {
      calls.creates.push({
        operationId: input.operationId,
        projectId: input.projectId,
        title: input.title,
      });
      // M1 replay: the same (actor, operationId) always returns the same Chat.
      const replayKey = `${input.actorUserId}:${input.operationId}`;
      const known = created.get(replayKey);
      if (known) {
        return {
          chatId: known,
          project: { id: input.projectId, status: "active" as const },
          replayed: true,
        };
      }
      const chatId = `chat-${created.size + 1}`;
      created.set(replayKey, chatId);
      return {
        chatId,
        project: { id: input.projectId, status: "active" as const },
        replayed: false,
      };
    },
    async findBinding(input) {
      calls.listBindings += 1;
      if (options.existing) {
        return options.existing;
      }
      return bindings.get(`${input.projectId}:${input.stageKey}`) ?? null;
    },
    async insertBinding(input) {
      calls.insertions += 1;
      const key = `${input.projectId}:${input.stageKey}`;
      if (!bindings.has(key)) {
        bindings.set(key, {
          chatId: input.chatId,
          createdAt: new Date(),
          stageKey: input.stageKey,
        });
      }
    },
    async listBindings(input) {
      calls.listBindings += 1;
      if (options.existing) {
        return [options.existing];
      }
      return [...bindings.entries()]
        .filter(([key]) => key.startsWith(`${input.projectId}:`))
        .map(([, binding]) => binding);
    },
  };
  return { calls, repository: createStageChatRepository(deps) };
}

test("R1-01: the operation id is Project-specific and inside the M1 limit", () => {
  const a = stageChatOperationId({
    projectId: projectA,
    stageKey: "school_applications",
  });
  const b = stageChatOperationId({
    projectId: projectB,
    stageKey: "school_applications",
  });
  const otherStage = stageChatOperationId({
    projectId: projectA,
    stageKey: "student500",
  });
  assert.notEqual(a, b, "the same step in two Projects must not share an id");
  assert.notEqual(
    a,
    otherStage,
    "two steps in one Project must not share an id"
  );
  // Deterministic, so M1 replay still works for retries of the same request.
  assert.equal(
    a,
    stageChatOperationId({
      projectId: projectA,
      stageKey: "school_applications",
    })
  );
  for (const id of [a, b, otherStage]) {
    assert.ok(id.length <= 128, `operation id too long: ${id.length}`);
    assert.match(id, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
  }
});

test("R1-01: one actor gets an independent Chat per Project and can reopen it", async () => {
  const { calls, repository } = harness();
  const first = await repository.findOrCreateStageChat({
    actorUserId: actor,
    projectId: projectA,
    stageKey: "school_applications",
  });
  const otherProject = await repository.findOrCreateStageChat({
    actorUserId: actor,
    projectId: projectB,
    stageKey: "school_applications",
  });
  assert.notEqual(
    first.chatId,
    otherProject.chatId,
    "Project B must receive its own Chat, not Project A's"
  );
  assert.deepEqual(
    calls.creates.map((entry) => entry.projectId),
    [projectA, projectB],
    "each Project performs its own authorized create"
  );
  assert.deepEqual(
    calls.creates.map((entry) => entry.operationId),
    [
      stageChatOperationId({
        projectId: projectA,
        stageKey: "school_applications",
      }),
      stageChatOperationId({
        projectId: projectB,
        stageKey: "school_applications",
      }),
    ]
  );

  // Reopening either Project replays instead of creating a third Chat.
  const reopenedA = await repository.findOrCreateStageChat({
    actorUserId: actor,
    projectId: projectA,
    stageKey: "school_applications",
  });
  const reopenedB = await repository.findOrCreateStageChat({
    actorUserId: actor,
    projectId: projectB,
    stageKey: "school_applications",
  });
  assert.equal(reopenedA.chatId, first.chatId);
  assert.equal(reopenedA.replayed, true);
  assert.equal(reopenedB.chatId, otherProject.chatId);
  assert.equal(reopenedB.replayed, true);
  assert.equal(calls.creates.length, 2, "reopening never creates another Chat");

  // Listing stays per Project: Project A's binding never appears under B.
  const rowsB = await repository.listStageChatBindings({
    actorUserId: actor,
    projectId: projectB,
  });
  assert.deepEqual(
    rowsB.map((row) => row.chatId),
    [otherProject.chatId]
  );
});

test("R1-02: a revoked, foreign or unknown actor never reaches the binding query", async () => {
  for (const authorized of ["revoked", "foreign", "missing"] as const) {
    const { calls, repository } = harness({ authorized });
    await assert.rejects(
      repository.listStageChatBindings({
        actorUserId: actor,
        projectId: projectA,
      }),
      (error: unknown) => error instanceof ProjectFoundationError
    );
    await assert.rejects(
      repository.findOrCreateStageChat({
        actorUserId: actor,
        projectId: projectA,
        stageKey: "student500",
      }),
      (error: unknown) => error instanceof ProjectFoundationError
    );
    assert.equal(
      calls.listBindings,
      0,
      `${authorized}: no binding may be read before authorization`
    );
    assert.equal(
      calls.creates.length,
      0,
      `${authorized}: no Chat may be created`
    );
    assert.equal(calls.insertions, 0);
    // Authorization was requested for every attempt, so the denial is explicit.
    assert.equal(calls.authorize.length, 2);
  }
});

test("R1-02: an active owner or member reads only their own Project bindings", async () => {
  const binding: StageChatBinding = {
    chatId: "chat-1",
    createdAt: new Date(),
    stageKey: "student500",
  };
  const { calls, repository } = harness({
    authorized: "active",
    existing: binding,
  });
  const rows = await repository.listStageChatBindings({
    actorUserId: actor,
    projectId: projectA,
  });
  assert.deepEqual(rows, [binding]);
  assert.equal(calls.listBindings, 1);
  // The actor identity is always the server-derived one.
  assert.deepEqual(calls.authorize, [
    { actorUserId: actor, projectId: projectA },
  ]);
});

test("R1-02: a closed Project stays readable, and reopening is read-only", async () => {
  const binding: StageChatBinding = {
    chatId: "chat-1",
    createdAt: new Date(),
    stageKey: "student500",
  };
  const { calls, repository } = harness({
    authorized: "closed",
    existing: binding,
  });
  const rows = await repository.listStageChatBindings({
    actorUserId: actor,
    projectId: projectA,
  });
  assert.deepEqual(rows, [binding], "closed Project history stays readable");
  const reopened = await repository.findOrCreateStageChat({
    actorUserId: actor,
    projectId: projectA,
    stageKey: "student500",
  });
  assert.equal(reopened.chatId, binding.chatId);
  assert.equal(reopened.readOnly, true, "a closed Project is read-only");
  assert.equal(
    calls.creates.length,
    0,
    "no Chat is created in a closed Project"
  );
});

test("find-or-create fails closed when the binding cannot be observed", async () => {
  const deps: StageChatRepositoryDeps = {
    authorizeProjectRead: (input) =>
      Promise.resolve({ id: input.projectId, status: "active" as const }),
    createProjectChat: () =>
      Promise.resolve({
        chatId: "chat-1",
        project: { id: projectA, status: "active" as const },
        replayed: false,
      }),
    findBinding: () => Promise.resolve(null),
    insertBinding: () => Promise.resolve(),
    listBindings: () => Promise.resolve([]),
  };
  const repository = createStageChatRepository(deps);
  await assert.rejects(
    repository.findOrCreateStageChat({
      actorUserId: actor,
      projectId: projectA,
      stageKey: "student500",
    }),
    (error: unknown) =>
      error instanceof ProjectFoundationError &&
      error.code === "outcome_unavailable"
  );
});
