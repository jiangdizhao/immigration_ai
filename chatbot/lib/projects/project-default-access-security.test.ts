/**
 * Phase 13 P1 final bounded security correction — Corrections A, B and C.
 *
 * Offline contract tests only: no database, no browser, no external provider.
 * They prove flag parsing, environment classification, creation bounds and the
 * Project emergency-disable composition at the HTTP boundaries.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";
import { evaluateManagedHandoffReadiness } from "@/lib/managed-handoff/evaluator";
import { denyAllManagedHandoffPorts } from "@/lib/managed-handoff/ports";
import {
  describeCapabilityFlag,
  localPreparationCapability,
  parseCapabilityFlag,
  resolveCapabilityEnvironment,
} from "@/lib/platform/capability-environment";
import { unavailableManagedTargetProvider } from "@/lib/professional-review/target-provider";
import { projectChatWritesEnabled } from "@/lib/projects/chat-policy";
import { createProjectChatsHandlers } from "@/lib/projects/chats-http";
import {
  PROJECT_ACTIVE_PROJECT_LIMIT,
  PROJECT_CREATE_RATE_LIMITS,
  projectCreateLimitDecision,
  projectCreateRateLimit,
} from "@/lib/projects/create-limit";
import { createProjectFoundationHandlers } from "@/lib/projects/http";
import {
  resolvePersonalProjectCapability,
  resolveSchoolPreparationAvailability,
} from "@/lib/projects/personal-project-capability";
import { schoolAdmissionsEnabled } from "@/lib/school-admissions/contracts";
import { createSchoolAdmissionsHandlers } from "@/lib/school-admissions/http";
import { createSchoolAdmissionsTestHarness } from "@/lib/school-admissions/test-adapters";
import {
  SCHOOL_APPLICATION_TARGET_KIND,
  schoolApplicationsEnabled,
} from "@/lib/school-applications/contracts";
import { createSchoolApplicationHandlers } from "@/lib/school-applications/http";

const actorId = "11111111-1111-4111-8111-111111111111";
const otherActorId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const applicationId = "44444444-4444-4444-8444-444444444444";
const referenceId = "55555555-5555-4555-8555-555555555555";
const at = new Date("2026-10-31T00:00:00.000Z");

const foundationSource = readFileSync(
  new URL("../db/project-foundation.ts", import.meta.url),
  "utf8"
);
const projectsHttpSource = readFileSync(
  new URL("./http.ts", import.meta.url),
  "utf8"
);

// ---------------------------------------------------------------- Correction A

test("strict parsing recognises only documented enabled/disabled tokens", () => {
  for (const enabled of ["true", "1", "on", "yes", "enabled"]) {
    assert.equal(parseCapabilityFlag(enabled), true, enabled);
    assert.equal(describeCapabilityFlag(enabled), "enabled");
  }
  for (const disabled of ["false", "0", "off", "no", "disabled"]) {
    assert.equal(parseCapabilityFlag(disabled), false, disabled);
    assert.equal(describeCapabilityFlag(disabled), "disabled");
  }
  // Case-insensitive and whitespace-tolerant.
  assert.equal(parseCapabilityFlag("  TRUE  "), true);
  assert.equal(parseCapabilityFlag("\tYes\n"), true);
  assert.equal(parseCapabilityFlag("  OFF "), false);
  // Unset / blank is "not configured", not an invalid value.
  assert.equal(parseCapabilityFlag(undefined), null);
  assert.equal(parseCapabilityFlag(null), null);
  assert.equal(parseCapabilityFlag("   "), null);
  assert.equal(describeCapabilityFlag(""), "unconfigured");
});

test("unrecognised values fail closed and can never enable a capability", () => {
  for (const invalid of ["flase", "anything", "ture", "enable", "2", "-1"]) {
    assert.equal(parseCapabilityFlag(invalid), false, invalid);
    assert.equal(describeCapabilityFlag(invalid), "invalid");
    // M5 must never be enabled by an unrecognised configured value.
    assert.equal(localPreparationCapability(invalid, "development"), false);
    assert.equal(localPreparationCapability(invalid, "production"), false);
  }
  // The Project capability is ON only when unset or explicitly enabled.
  assert.equal(projectChatWritesEnabled(undefined), true);
  assert.equal(projectChatWritesEnabled("flase"), false);
  assert.equal(schoolApplicationsEnabled("flase", "development"), false);
  assert.equal(schoolAdmissionsEnabled("flase", "development"), false);
});

test("environment classification is conservative for staging, preview and hosting", () => {
  assert.equal(resolveCapabilityEnvironment({}), "development");
  assert.equal(
    resolveCapabilityEnvironment({ NODE_ENV: "development" }),
    "development"
  );
  assert.equal(resolveCapabilityEnvironment({ NODE_ENV: "test" }), "test");
  assert.equal(
    resolveCapabilityEnvironment({ NODE_ENV: "production" }),
    "production"
  );
  // Non-local NODE_ENV values are never treated as a trusted local process.
  for (const value of ["staging", "preview", "qa", "unknown"]) {
    assert.equal(
      resolveCapabilityEnvironment({ NODE_ENV: value }),
      "production",
      value
    );
  }
  assert.equal(
    resolveCapabilityEnvironment({ APP_ENV: "staging" }),
    "production"
  );
  assert.equal(
    resolveCapabilityEnvironment({ APP_ENV: "preview" }),
    "production"
  );
  assert.equal(
    resolveCapabilityEnvironment({ APP_ENV: "local" }),
    "development"
  );
  assert.equal(
    resolveCapabilityEnvironment({ VERCEL_ENV: "preview" }),
    "production"
  );
  assert.equal(
    resolveCapabilityEnvironment({ VERCEL_ENV: "production" }),
    "production"
  );
  assert.equal(
    resolveCapabilityEnvironment({
      NODE_ENV: "development",
      VERCEL_ENV: "development",
    }),
    "development"
  );
  // Hosted runtime markers override an unset/misleading NODE_ENV.
  for (const marker of [
    "AWS_LAMBDA_FUNCTION_NAME",
    "K_SERVICE",
    "DYNO",
    "FLY_APP_NAME",
    "RENDER",
    "RAILWAY_ENVIRONMENT",
    "KUBERNETES_SERVICE_HOST",
  ]) {
    assert.equal(
      resolveCapabilityEnvironment({ [marker]: "1" }),
      "production",
      marker
    );
  }
});

test("capability defaults match the product contract in every environment", () => {
  // Personal Project: ON unless explicitly disabled, in every environment.
  for (const environment of ["development", "test", "production"] as const) {
    assert.equal(
      projectChatWritesEnabled(undefined),
      true,
      `project default ${environment}`
    );
    assert.equal(projectChatWritesEnabled("false"), false);
  }
  // M5: ON locally, OFF in production-like, explicit value wins.
  assert.equal(schoolApplicationsEnabled(undefined, "development"), true);
  assert.equal(schoolAdmissionsEnabled(undefined, "test"), true);
  assert.equal(schoolApplicationsEnabled(undefined, "production"), false);
  assert.equal(schoolAdmissionsEnabled(undefined, "production"), false);
  assert.equal(schoolApplicationsEnabled("true", "production"), true);
  assert.equal(schoolAdmissionsEnabled("on", "production"), true);
  assert.equal(schoolApplicationsEnabled("disabled", "development"), false);
});

// ---------------------------------------------------------------- Correction B

type StoredProject = {
  closedAt: null;
  createdAt: Date;
  id: string;
  ownerUserId: string;
  revision: number;
  status: "active";
  updatedAt: Date;
};

function projectHarness(input: {
  rateLimit?: (options: {
    action: string;
    actorType: "guest" | "regular";
    actorUserId: string;
    ipAddress: string | null;
  }) => Promise<boolean>;
  repository?: Record<string, unknown>;
  session: { type: "guest" | "regular"; userId: string } | null;
  writesEnabled?: boolean;
}) {
  const calls: string[] = [];
  const stored = new Map<string, StoredProject>();
  const repository = {
    listProjects: (userId: string) => {
      calls.push("listProjects");
      return [...stored.values()].filter((row) => row.ownerUserId === userId);
    },
    createProject: (value: { actorUserId: string; operationId: string }) => {
      calls.push(`createProject:${value.actorUserId}:${value.operationId}`);
      const key = `${value.actorUserId}:${value.operationId}`;
      const existing = stored.get(key);
      if (existing) {
        return { project: existing, replayed: true };
      }
      const project: StoredProject = {
        closedAt: null,
        createdAt: at,
        id: projectId,
        ownerUserId: value.actorUserId,
        revision: 1,
        status: "active",
        updatedAt: at,
      };
      stored.set(key, project);
      return { project, replayed: false };
    },
    getProjectForActor: () => {
      throw new Error("not used");
    },
    closeProject: () => ({ project: {}, replayed: false }),
    listProjectMembers: () => [],
    inviteProjectMember: () => ({ project: {}, replayed: false }),
    listPendingInvitations: () => [],
    acceptProjectMembership: () => ({ project: {}, replayed: false }),
    revokeProjectMembership: () => ({ project: {}, replayed: false }),
    ...input.repository,
  };
  const handlers = createProjectFoundationHandlers({
    authenticate: async () => input.session,
    schemaAvailable: async () => true,
    writesEnabled: () => input.writesEnabled ?? true,
    repository: repository as unknown as Parameters<
      typeof createProjectFoundationHandlers
    >[0]["repository"],
    rateLimit: input.rateLimit,
  });
  return { calls, handlers, stored };
}

function createRequest(body: unknown) {
  return new Request("https://example.test/api/projects", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

test("the active-Project cap decision is deterministic and bounded", () => {
  assert.equal(PROJECT_ACTIVE_PROJECT_LIMIT, 10);
  assert.equal(
    projectCreateLimitDecision({ activeProjectCount: 0 }).allowed,
    true
  );
  assert.equal(
    projectCreateLimitDecision({ activeProjectCount: 9 }).allowed,
    true
  );
  const atCap = projectCreateLimitDecision({ activeProjectCount: 10 });
  assert.equal(atCap.allowed, false);
  assert.equal(atCap.allowed === false && atCap.reason, "active_project_limit");
  assert.equal(
    projectCreateLimitDecision({ activeProjectCount: 11 }).allowed,
    false
  );
  assert.equal(
    projectCreateLimitDecision({ activeProjectCount: 2, limit: 3 }).allowed,
    true
  );
  assert.equal(
    projectCreateLimitDecision({ activeProjectCount: 3, limit: 3 }).allowed,
    false
  );
  // Defensive normalization: negative/NaN counts behave like zero.
  assert.equal(
    projectCreateLimitDecision({ activeProjectCount: -5 }).allowed,
    true
  );
  assert.equal(
    projectCreateLimitDecision({ activeProjectCount: Number.NaN }).allowed,
    true
  );
});

test("guest creation limits are stricter than registered-customer limits", () => {
  const guest = projectCreateRateLimit("guest");
  const regular = projectCreateRateLimit("regular");
  assert.ok(guest.actor > 0 && guest.ip > 0);
  assert.ok(regular.actor > guest.actor);
  assert.ok(regular.ip > guest.ip);
  assert.equal(guest.ttlSeconds, regular.ttlSeconds);
  assert.deepEqual(projectCreateRateLimit(undefined), regular);
  assert.deepEqual(PROJECT_CREATE_RATE_LIMITS.guest, guest);
});

test("Project creation is rate limited by session actor with the guest tier", async () => {
  const seen: Array<{
    action: string;
    actorType: string;
    actorUserId: string;
    ipAddress: string | null;
  }> = [];
  const { calls, handlers } = projectHarness({
    rateLimit: (options) => {
      seen.push(options);
      return Promise.resolve(true);
    },
    session: { type: "guest", userId: otherActorId },
  });
  const response = await handlers.createProject(
    createRequest({ operationId: "guest-create-1" })
  );
  assert.equal(response.status, 201);
  assert.deepEqual(seen, [
    {
      action: "project_create",
      actorType: "guest",
      actorUserId: otherActorId,
      ipAddress: null,
    },
  ]);
  // The actor comes from the session, never from the body.
  assert.deepEqual(calls, [`createProject:${otherActorId}:guest-create-1`]);
});

test("a rate-limited create is rejected before the repository is touched", async () => {
  const { calls, handlers } = projectHarness({
    rateLimit: () => Promise.resolve(false),
    session: { type: "guest", userId: otherActorId },
  });
  for (const operationId of ["limit-1", "limit-2"]) {
    const response = await handlers.createProject(
      createRequest({ operationId })
    );
    assert.equal(response.status, 429);
  }
  assert.deepEqual(calls, []);
});

test("a create rejected by the active-Project cap maps to an explicit 429", async () => {
  const { calls, handlers } = projectHarness({
    repository: {
      createProject: () => {
        calls.push("createProject");
        throw new ProjectFoundationError("project_limit_reached");
      },
    },
    session: { type: "regular", userId: actorId },
  });
  const response = await handlers.createProject(
    createRequest({ operationId: "over-cap" })
  );
  assert.equal(response.status, 429);
  assert.match(await response.text(), /maximum number of active Projects/u);
  assert.deepEqual(calls, ["createProject"]);
});

test("guest Projects stay isolated per session identity and replays add none", async () => {
  const own = projectHarness({
    session: { type: "guest", userId: otherActorId },
  });
  const first = await own.handlers.createProject(
    createRequest({ operationId: "guest-replay" })
  );
  const second = await own.handlers.createProject(
    createRequest({ operationId: "guest-replay" })
  );
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(own.stored.size, 1);

  const stranger = projectHarness({
    session: { type: "guest", userId: actorId },
  });
  const strangerList = await stranger.handlers.listProjects(
    new Request("https://example.test/api/projects")
  );
  assert.deepEqual(
    ((await strangerList.json()) as { projects: unknown[] }).projects,
    []
  );
});

test("the repository cap is enforced inside the transaction after replay handling", () => {
  // Structural contract: the limit check runs only on the non-replayed path, so
  // an exact operationId retry is never rejected by the cap.
  const replayIndex = foundationSource.indexOf(
    "return { replayed: true, project };"
  );
  const limitIndex = foundationSource.indexOf(
    "await assertProjectCreationWithinLimit(tx, input.actorUserId);"
  );
  const insertIndex = foundationSource.indexOf("insert(studyJourneyProject)");
  assert.ok(replayIndex > 0);
  assert.ok(limitIndex > replayIndex);
  assert.ok(insertIndex > limitIndex);
  assert.match(foundationSource, /count\(\*\)::int/u);
  assert.match(
    foundationSource,
    /eq\(studyJourneyProject\.ownerUserId, actorUserId\)/u
  );
  assert.match(
    foundationSource,
    /eq\(studyJourneyProject\.status, "active"\)/u
  );
  assert.match(projectsHttpSource, /action: "project_create", write: true/u);
});

test("concurrent creation by one actor cannot exceed the active-Project cap", () => {
  // The cap is only authoritative if same-actor creations serialize: the actor's
  // own row is locked (SELECT ... FOR UPDATE) before the active count is read, so
  // a second parallel request sees the first request's committed Project.
  const limitFnStart = foundationSource.indexOf(
    "async function assertProjectCreationWithinLimit("
  );
  const limitFnEnd = foundationSource.indexOf(
    "async function assertProjectAuthority("
  );
  assert.ok(limitFnStart > 0);
  assert.ok(limitFnEnd > limitFnStart);
  const limitBody = foundationSource.slice(limitFnStart, limitFnEnd);

  const lockIndex = limitBody.indexOf('.for("update")');
  const countIndex = limitBody.indexOf("count(*)::int");
  assert.ok(lockIndex > 0, "the actor row must be locked");
  assert.ok(lockIndex < countIndex, "the lock must precede the count");
  assert.match(limitBody, /from\(user\)/u);
  assert.match(limitBody, /\.where\(eq\(user\.id, actorUserId\)\)/u);
  // The lock is acquired inside the same transaction as the insert, and only the
  // non-replayed path reaches it (asserted by the structural test above).
  assert.match(
    foundationSource,
    /await assertProjectCreationWithinLimit\(tx, input\.actorUserId\);\s*\n\s*const \[project\] = await tx\s*\n\s*\.insert\(studyJourneyProject\)/u
  );
});

// ---------------------------------------------------------------- Correction C

function schoolApplicationHarness(options: { projectWritesEnabled?: boolean }) {
  const calls: string[] = [];
  const application = {
    applicationId,
    archivedAt: null,
    disclosures: [],
    projectId,
    references: [],
    revision: 1,
    status: "draft",
  };
  const service = {
    archive: () => {
      calls.push("archive");
      return { application, replayed: false };
    },
    bindReference: () => {
      calls.push("bindReference");
      return { application, replayed: false };
    },
    buildPackage: () => {
      calls.push("buildPackage");
      return {
        application,
        package: { packageId: applicationId, version: 1 },
        replayed: false,
        reusedCurrentPackage: false,
      };
    },
    create: () => {
      calls.push("create");
      return { application, replayed: false };
    },
    get: () => {
      calls.push("get");
      return application;
    },
    list: () => {
      calls.push("list");
      return [application];
    },
    listPackages: () => {
      calls.push("listPackages");
      return { currentSnapshot: null, packages: [] };
    },
    revokeReference: () => {
      calls.push("revokeReference");
      return { application, replayed: false };
    },
    update: () => {
      calls.push("update");
      return { application, replayed: false };
    },
  };
  const handlers = createSchoolApplicationHandlers({
    authenticate: async () => ({ type: "regular", userId: actorId }),
    enabled: () => true,
    projectWritesEnabled:
      options.projectWritesEnabled === undefined
        ? undefined
        : () => options.projectWritesEnabled === true,
    schemaAvailable: async () => true,
    service: service as unknown as Parameters<
      typeof createSchoolApplicationHandlers
    >[0]["service"],
  });
  return { calls, handlers };
}

function m5Request(body: unknown) {
  return new Request("https://example.test/api/projects/x/school", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

const readRequest = () => new Request("https://example.test/api/projects/x");

test("school preparation availability follows the Project emergency disable", () => {
  const availableProject = resolvePersonalProjectCapability({
    role: "user",
    schemaStatus: "ready",
    sessionType: "regular",
    userId: actorId,
    writesEnabled: true,
  });
  const disabledProject = resolvePersonalProjectCapability({
    role: "user",
    schemaStatus: "ready",
    sessionType: "regular",
    userId: actorId,
    writesEnabled: false,
  });
  assert.equal(availableProject.availability, "available");
  assert.equal(disabledProject.availability, "disabled");

  // Project ON / M5 ON
  assert.deepEqual(
    resolveSchoolPreparationAvailability({
      admissionsEnabled: true,
      applicationsEnabled: true,
      project: availableProject,
    }),
    { admissionsEnabled: true, applicationsEnabled: true, restricted: false }
  );
  // Project ON / M5 OFF
  assert.deepEqual(
    resolveSchoolPreparationAvailability({
      admissionsEnabled: false,
      applicationsEnabled: false,
      project: availableProject,
    }),
    { admissionsEnabled: false, applicationsEnabled: false, restricted: false }
  );
  // Project OFF / M5 ON and Project OFF / M5 OFF: nothing is offered, and no
  // misleading "restricted for this identity" notice is shown.
  for (const m5 of [
    { admissionsEnabled: true, applicationsEnabled: true },
    { admissionsEnabled: false, applicationsEnabled: false },
  ]) {
    assert.deepEqual(
      resolveSchoolPreparationAvailability({
        ...m5,
        project: disabledProject,
      }),
      {
        admissionsEnabled: false,
        applicationsEnabled: false,
        restricted: false,
      }
    );
  }
  // M5 on but this identity is not eligible → truthful restriction, no writes.
  const guest = resolvePersonalProjectCapability({
    role: "user",
    schemaStatus: "ready",
    sessionType: "guest",
    userId: actorId,
    writesEnabled: true,
  });
  assert.deepEqual(
    resolveSchoolPreparationAvailability({
      admissionsEnabled: true,
      applicationsEnabled: true,
      project: guest,
    }),
    {
      admissionsEnabled: false,
      applicationsEnabled: false,
      restricted: true,
    }
  );
});

test("every M5.1 mutation is refused while the Project foundation is disabled", async () => {
  const blocked = schoolApplicationHarness({ projectWritesEnabled: false });
  const mutations: [string, Promise<Response>][] = [
    [
      "create",
      blocked.handlers.create(
        m5Request({
          courseTitle: "Bachelor of Nursing",
          institutionName: "Example University",
          operationId: "create-1",
        }),
        projectId
      ),
    ],
    [
      "update",
      blocked.handlers.update(
        m5Request({
          courseTitle: "Bachelor of Nursing",
          expectedRevision: 1,
          institutionName: "Example University",
          operationId: "update-1",
        }),
        projectId,
        applicationId
      ),
    ],
    [
      "archive",
      blocked.handlers.archive(
        m5Request({ expectedRevision: 1, operationId: "archive-1" }),
        projectId,
        applicationId
      ),
    ],
    [
      "bindReference",
      blocked.handlers.bindReference(
        m5Request({
          expectedRevision: 1,
          kind: "project_document",
          operationId: "bind-1",
          referenceId,
        }),
        projectId,
        applicationId
      ),
    ],
    [
      "revokeReference",
      blocked.handlers.revokeReference(
        m5Request({ expectedRevision: 1, operationId: "revoke-1" }),
        projectId,
        applicationId,
        referenceId
      ),
    ],
    [
      "buildPackage",
      blocked.handlers.buildPackage(
        m5Request({ expectedRevision: 1, operationId: "package-1" }),
        projectId,
        applicationId
      ),
    ],
  ];
  for (const [name, pending] of mutations) {
    const response = await pending;
    assert.equal(response.status, 503, name);
  }
  assert.deepEqual(blocked.calls, [], "no service mutation may run");

  // Reads stay available so permitted Project history is not destroyed.
  const list = await blocked.handlers.list(readRequest(), projectId);
  assert.equal(list.status, 200);
  const get = await blocked.handlers.get(
    readRequest(),
    projectId,
    applicationId
  );
  assert.equal(get.status, 200);
});

test("M5.1 mutations still work when the Project foundation is available", async () => {
  const open = schoolApplicationHarness({ projectWritesEnabled: true });
  const response = await open.handlers.create(
    m5Request({
      courseTitle: "Bachelor of Nursing",
      institutionName: "Example University",
      operationId: "create-2",
    }),
    projectId
  );
  assert.equal(response.status, 201);
  assert.deepEqual(open.calls, ["create"]);
});

function schoolAdmissionsHarness(projectWritesEnabled: boolean) {
  const harness = createSchoolAdmissionsTestHarness();
  const m52ProjectId = randomUUID();
  const ownerUserId = randomUUID();
  harness.store.seedProject(m52ProjectId, {
    ownerUserId,
    status: "active",
  });
  harness.store.seedActor(ownerUserId, { registeredCustomer: true });
  const handlers = createSchoolAdmissionsHandlers({
    authenticate: async () => ({ type: "regular", userId: ownerUserId }),
    enabled: () => true,
    projectWritesEnabled: () => projectWritesEnabled,
    schemaAvailable: async () => true,
    service: harness.service,
  });
  return { handlers, harness, m52ProjectId };
}

test("M5.2 mutations are refused while the Project foundation is disabled", async () => {
  const blocked = schoolAdmissionsHarness(false);
  const before = JSON.stringify(blocked.harness.store.state());

  assert.equal(
    (
      await blocked.handlers.create(
        m5Request({
          courseTitle: "Bachelor of Nursing",
          institutionName: "Example University",
          operationId: "adm-create-1",
          originKind: "manual_entry",
        }),
        blocked.m52ProjectId
      )
    ).status,
    503
  );
  assert.equal(
    (
      await blocked.handlers.prepare(
        m5Request({ expectedRevision: 1, operationId: "adm-prepare-1" }),
        blocked.m52ProjectId,
        applicationId
      )
    ).status,
    503
  );
  assert.equal(
    (
      await blocked.handlers.evaluateReadiness(
        m5Request({ expectedRevision: 1, operationId: "adm-ready-1" }),
        blocked.m52ProjectId,
        applicationId
      )
    ).status,
    503
  );

  // Nothing reached the service/store, and reads stay available.
  assert.equal(JSON.stringify(blocked.harness.store.state()), before);
  assert.equal(
    (
      await blocked.handlers.list(
        new Request("https://example.test/x"),
        blocked.m52ProjectId
      )
    ).status,
    200
  );
});

test("M5.2 reads and mutations behave normally while the Project is available", async () => {
  const open = schoolAdmissionsHarness(true);
  const list = await open.handlers.list(
    new Request("https://example.test/x"),
    open.m52ProjectId
  );
  assert.equal(list.status, 200);
  const created = await open.handlers.create(
    m5Request({
      courseTitle: "Bachelor of Nursing",
      institutionName: "Example University",
      operationId: "adm-create-2",
      originKind: "manual_entry",
    }),
    open.m52ProjectId
  );
  assert.notEqual(created.status, 503);
});

test("Project and Project Chat writes stay disabled during the emergency disable", async () => {
  const create = projectHarness({
    session: { type: "regular", userId: actorId },
    writesEnabled: false,
  });
  assert.equal(
    (
      await create.handlers.createProject(
        createRequest({ operationId: "disabled-create" })
      )
    ).status,
    503
  );
  assert.deepEqual(create.calls, []);

  const chats = createProjectChatsHandlers({
    authenticate: async () => ({ type: "regular", userId: actorId }),
    schemaAvailable: async () => true,
    writesEnabled: () => false,
    repository: {
      createProjectChat() {
        throw new Error("must not be called");
      },
      listOwnedProjectChats() {
        return Promise.resolve({ conversations: [], hasMore: false });
      },
    },
  });
  assert.equal(
    (await chats.create(m5Request({ operationId: "chat-disabled" }), projectId))
      .status,
    503
  );
  // Read-only Project history remains available.
  assert.equal(
    (await chats.list(new Request("https://example.test/x"), projectId)).status,
    200
  );
});

test("production keeps M5 OFF and managed service is never READY", async () => {
  const production = {
    APP_ENV: "production",
    NODE_ENV: "production",
  } as Record<string, string>;
  const environment = resolveCapabilityEnvironment(production);
  assert.equal(environment, "production");
  assert.equal(schoolApplicationsEnabled(undefined, environment), false);
  assert.equal(schoolAdmissionsEnabled(undefined, environment), false);

  const result = await evaluateManagedHandoffReadiness(
    {
      actorUserId: actorId,
      messagingConsentPresent: true,
      projectId,
      target: {
        targetId: projectId,
        targetKind: SCHOOL_APPLICATION_TARGET_KIND,
      },
      vipEntitlementActive: true,
    },
    denyAllManagedHandoffPorts(unavailableManagedTargetProvider)
  );
  assert.notEqual(result.status, "READY");
  assert.ok(["NOT_READY", "UNKNOWN"].includes(result.status));
});
