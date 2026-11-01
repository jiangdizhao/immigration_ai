/**
 * Phase 13 P1 consolidated offline acceptance — personal Project default access.
 *
 * Scope note (must not be overstated): these are deterministic, offline contract
 * tests. They prove capability semantics, HTTP authorization shape, UI states and
 * source-level SQL contract guards. They are NOT a PostgreSQL-backed or browser
 * E2E pass; database-backed execution remains separately authorized.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectEntryPanel } from "@/components/project-entry-panel";
import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";
import { evaluateManagedHandoffReadiness } from "@/lib/managed-handoff/evaluator";
import { denyAllManagedHandoffPorts } from "@/lib/managed-handoff/ports";
import { unavailableManagedTargetProvider } from "@/lib/professional-review/target-provider";
import { projectChatWritesEnabled } from "@/lib/projects/chat-policy";
import { createProjectChatsHandlers } from "@/lib/projects/chats-http";
import { createProjectFoundationHandlers } from "@/lib/projects/http";
import { resolvePersonalProjectCapability } from "@/lib/projects/personal-project-capability";
import { schoolAdmissionsEnabled } from "@/lib/school-admissions/contracts";
import {
  SCHOOL_APPLICATION_TARGET_KIND,
  schoolApplicationsEnabled,
} from "@/lib/school-applications/contracts";
import { getWorkspaceCopy } from "@/lib/workspace-copy";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const chatId = "44444444-4444-4444-8444-444444444444";
const at = new Date("2026-10-31T00:00:00.000Z");

const foundationSource = readFileSync(
  new URL("../db/project-foundation.ts", import.meta.url),
  "utf8"
);
const queriesSource = readFileSync(
  new URL("../db/queries.ts", import.meta.url),
  "utf8"
);
const projectHttpSource = readFileSync(
  new URL("./http.ts", import.meta.url),
  "utf8"
);
const projectChatsHttpSource = readFileSync(
  new URL("./chats-http.ts", import.meta.url),
  "utf8"
);

function jsonRequest(body: unknown) {
  return new Request("https://example.test/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function readRequest(url = "https://example.test/api/projects") {
  return new Request(url);
}

test("Project writes are ON by default and only an explicit disable turns them off", () => {
  assert.equal(projectChatWritesEnabled(undefined), true);
  assert.equal(projectChatWritesEnabled(""), true);
  assert.equal(projectChatWritesEnabled("true"), true);
  assert.equal(projectChatWritesEnabled("false"), false);
  assert.equal(projectChatWritesEnabled("OFF"), false);
});

test("every server-authenticated identity may own a personal Project", () => {
  const ready = {
    schemaStatus: "ready" as const,
    writesEnabled: true,
  };
  const free = resolvePersonalProjectCapability({
    ...ready,
    role: "user",
    sessionType: "regular",
    userId: ownerId,
  });
  const vip = resolvePersonalProjectCapability({
    ...ready,
    role: "user",
    sessionType: "regular",
    userId: ownerId,
  });
  // Free versus VIP entitlement is unchanged and is not part of this capability.
  assert.deepEqual(free, vip);
  assert.equal(free.availability, "available");
  assert.equal(free.canCreateProject, true);
  assert.equal(free.schoolPreparationEligible, true);

  for (const role of ["lawyer", "admin"] as const) {
    const staff = resolvePersonalProjectCapability({
      ...ready,
      role,
      sessionType: "regular",
      userId: ownerId,
    });
    assert.equal(staff.availability, "available");
    assert.equal(staff.canCreateProject, true);
    // Personal ownership must never become staff/professional authority.
    assert.equal(staff.professionalAuthority, false);
    assert.equal(staff.temporaryGuestProject, false);
    // M5 preparation stays registered-personal-account only for now.
    assert.equal(staff.schoolPreparationEligible, false);
  }

  const guest = resolvePersonalProjectCapability({
    ...ready,
    role: "user",
    sessionType: "guest",
    userId: ownerId,
  });
  assert.equal(guest.availability, "available");
  assert.equal(guest.canCreateProject, true);
  assert.equal(guest.temporaryGuestProject, true);
  assert.equal(guest.schoolPreparationEligible, false);
  assert.equal(guest.professionalAuthority, false);
});

test("disabled, signed-out and schema-unavailable states are honest and never successful", () => {
  const disabled = resolvePersonalProjectCapability({
    role: "user",
    schemaStatus: "ready",
    sessionType: "regular",
    userId: ownerId,
    writesEnabled: false,
  });
  assert.equal(disabled.state, "disabled");
  assert.equal(disabled.availability, "disabled");
  assert.equal(disabled.canCreateProject, false);
  assert.equal(disabled.reason, "project_writes_disabled");

  const signedOut = resolvePersonalProjectCapability({
    schemaStatus: "ready",
    sessionType: null,
    userId: null,
    writesEnabled: true,
  });
  assert.equal(signedOut.state, "signed_out");
  assert.equal(signedOut.availability, "unavailable");
  assert.equal(signedOut.canCreateProject, false);

  for (const [schemaStatus, reason] of [
    ["absent", "schema_absent"],
    ["partial", "schema_partial"],
    ["unknown", "schema_probe_failed"],
  ] as const) {
    const unavailable = resolvePersonalProjectCapability({
      role: "user",
      schemaStatus,
      sessionType: "regular",
      userId: ownerId,
      writesEnabled: true,
    });
    assert.equal(unavailable.availability, "unavailable");
    assert.equal(unavailable.canCreateProject, false);
    assert.equal(unavailable.reason, reason);
  }
});

type ProjectRow = {
  id: string;
  ownerUserId: string;
  status: "active";
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  closedAt: null;
};

function projectHarness(input: {
  session: { userId: string; type: "guest" | "regular" } | null;
  schemaAvailable?: boolean;
  writesEnabled?: boolean;
  repository?: Record<string, unknown>;
}) {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const idempotent = new Map<string, ProjectRow>();
  const repository = {
    listProjects: (userId: string) => {
      calls.push({ name: "listProjects", input: userId });
      return [...idempotent.values()].filter(
        (project) => project.ownerUserId === userId
      );
    },
    createProject: (value: { actorUserId: string; operationId: string }) => {
      calls.push({ name: "createProject", input: value });
      const key = `${value.actorUserId}:${value.operationId}`;
      const existing = idempotent.get(key);
      if (existing) {
        return { project: existing, replayed: true };
      }
      const project: ProjectRow = {
        closedAt: null,
        createdAt: at,
        id: projectId,
        ownerUserId: value.actorUserId,
        revision: 1,
        status: "active",
        updatedAt: at,
      };
      idempotent.set(key, project);
      return { project, replayed: false };
    },
    getProjectForActor: (value: { actorUserId: string }) => {
      calls.push({ name: "getProjectForActor", input: value });
      const owned = [...idempotent.values()].find(
        (project) => project.ownerUserId === value.actorUserId
      );
      if (!owned) {
        throw new ProjectFoundationError("project_not_found");
      }
      return owned;
    },
    closeProject: (value: unknown) => {
      calls.push({ name: "closeProject", input: value });
      return { project: {}, replayed: false };
    },
    listProjectMembers: () => [],
    inviteProjectMember: (value: unknown) => {
      calls.push({ name: "inviteProjectMember", input: value });
      return { project: {}, replayed: false };
    },
    listPendingInvitations: () => [],
    acceptProjectMembership: () => ({ project: {}, replayed: false }),
    revokeProjectMembership: () => ({ project: {}, replayed: false }),
    ...input.repository,
  };

  const handlers = createProjectFoundationHandlers({
    authenticate: async () => input.session,
    schemaAvailable: async () => input.schemaAvailable ?? true,
    writesEnabled: () => input.writesEnabled ?? true,
    repository: repository as unknown as Parameters<
      typeof createProjectFoundationHandlers
    >[0]["repository"],
  });
  return { calls, handlers, idempotent };
}

test("guest and regular sessions create a Project owned by their own session identity", async () => {
  for (const type of ["guest", "regular"] as const) {
    const session = { type, userId: type === "guest" ? otherUserId : ownerId };
    const { handlers, calls } = projectHarness({ session });
    const response = await handlers.createProject(
      jsonRequest({ operationId: `create-${type}` })
    );
    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      project: { id: string; status: string };
    };
    assert.equal(body.project.status, "active");
    assert.deepEqual(calls[0], {
      input: { actorUserId: session.userId, operationId: `create-${type}` },
      name: "createProject",
    });

    // A forged actor/role in the body is rejected before the repository.
    const forged = await handlers.createProject(
      jsonRequest({
        actorUserId: otherUserId,
        operationId: "forged",
        role: "admin",
      })
    );
    assert.equal(forged.status, 400);
  }
});

test("another user's Project is not readable and never leaks its identifier", async () => {
  const owner = projectHarness({
    session: { type: "regular", userId: ownerId },
  });
  await owner.handlers.createProject(jsonRequest({ operationId: "owner-p" }));

  const outsider = projectHarness({
    session: { type: "regular", userId: otherUserId },
  });
  const denied = await outsider.handlers.getProject(readRequest(), projectId);
  assert.equal(denied.status, 404);
  assert.equal((await denied.text()).includes(projectId), false);

  const ownerRead = await owner.handlers.listProjects(readRequest());
  assert.equal(ownerRead.status, 200);
  assert.equal(
    ((await ownerRead.json()) as { projects: unknown[] }).projects.length,
    1
  );
});

test("Project Chat denies cross-creator, missing and closed access generically", async () => {
  const cases = [
    { code: "project_forbidden" as const, status: 404 },
    { code: "project_not_found" as const, status: 404 },
    { code: "project_closed" as const, status: 409 },
  ];
  for (const item of cases) {
    const handlers = createProjectChatsHandlers({
      authenticate: async () => ({ type: "regular", userId: ownerId }),
      schemaAvailable: async () => true,
      writesEnabled: () => true,
      repository: {
        createProjectChat() {
          return Promise.reject(new ProjectFoundationError(item.code));
        },
        listOwnedProjectChats() {
          return Promise.reject(new ProjectFoundationError(item.code));
        },
      },
    });
    const create = await handlers.create(
      jsonRequest({ operationId: "member-read-attempt" }),
      projectId
    );
    assert.equal(create.status, item.status);
    assert.equal((await create.text()).includes(chatId), false);
    const list = await handlers.list(readRequest(), projectId);
    assert.equal(list.status, item.status);
  }
});

test("an explicit emergency disable never degrades into a privileged bypass", async () => {
  const { calls, handlers } = projectHarness({
    session: { type: "regular", userId: ownerId },
    writesEnabled: false,
  });
  const response = await handlers.createProject(
    jsonRequest({ operationId: "disabled-create" })
  );
  assert.equal(response.status, 503);
  assert.deepEqual(calls, []);
  // Reads stay available so an owner never loses existing history.
  const read = await handlers.listProjects(readRequest());
  assert.equal(read.status, 200);
});

test("missing or partial schema fails closed with a private unavailable response", async () => {
  const { calls, handlers } = projectHarness({
    schemaAvailable: false,
    session: { type: "guest", userId: otherUserId },
  });
  const response = await handlers.createProject(
    jsonRequest({ operationId: "no-schema" })
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(calls, []);
});

test("operation replay keeps one Project for a repeated create", async () => {
  const { handlers, idempotent } = projectHarness({
    session: { type: "regular", userId: ownerId },
  });
  const body = { operationId: "replay-same-operation" };
  const first = await handlers.createProject(jsonRequest(body));
  const second = await handlers.createProject(jsonRequest(body));
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  const ids = await Promise.all(
    [first, second].map(
      async (response) =>
        ((await response.json()) as { project: { id: string } }).project.id
    )
  );
  assert.equal(new Set(ids).size, 1);
  assert.equal(idempotent.size, 1);
});

function renderProjectEntry(
  input: {
    availability?: "available" | "disabled" | "unavailable";
    temporaryGuestProject?: boolean;
    schoolPreparationRestricted?: boolean;
  } = {}
) {
  const copy = getWorkspaceCopy("en");
  return renderToStaticMarkup(
    React.createElement(ProjectEntryPanel, {
      availability: input.availability,
      clearSelectionSignal: 0,
      copy: copy.projectEntry,
      locale: "en",
      navigationBusy: false,
      onOpenProjectChat: () => undefined,
      onSelectedProjectChange: () => undefined,
      schoolPreparationRestricted: input.schoolPreparationRestricted,
      temporaryGuestProject: input.temporaryGuestProject,
    })
  );
}

test("the Project entry explains an unavailable or disabled state instead of disappearing", () => {
  const disabled = renderProjectEntry({ availability: "disabled" });
  assert.match(disabled, /data-testid="project-entry-panel"/u);
  assert.match(disabled, /data-testid="project-availability-notice"/u);
  assert.match(disabled, /temporarily disabled by an administrator/u);
  assert.match(
    disabled,
    /<button[^>]*data-testid="create-project-open"[^>]*disabled=""/u
  );

  const unavailable = renderProjectEntry({ availability: "unavailable" });
  assert.match(unavailable, /data-testid="project-availability-notice"/u);
  assert.match(unavailable, /Project service is temporarily unavailable/u);
  assert.match(
    unavailable,
    /<button[^>]*data-testid="create-project-open"[^>]*disabled=""/u
  );
  // No credential, SQL or internal operational detail is disclosed.
  assert.doesNotMatch(unavailable, /POSTGRES|password|to_regclass|schema/iu);

  const available = renderProjectEntry({ availability: "available" });
  assert.doesNotMatch(available, /data-testid="project-availability-notice"/u);
  assert.doesNotMatch(
    available,
    /<button[^>]*data-testid="create-project-open"[^>]*disabled=""/u
  );
});

test("a guest Project is labelled temporary and M5 preparation states its restriction", () => {
  const guest = renderProjectEntry({
    availability: "available",
    temporaryGuestProject: true,
  });
  assert.match(guest, /data-testid="guest-project-notice"/u);
  assert.match(guest, /temporary guest session only/u);

  const registered = renderProjectEntry({ availability: "available" });
  assert.doesNotMatch(registered, /data-testid="guest-project-notice"/u);

  const restricted = renderProjectEntry({
    availability: "available",
    schoolPreparationRestricted: true,
  });
  assert.match(restricted, /registered personal accounts only/u);
});

test("source contract: Project authorization is ownership-based, not account-type based", () => {
  // The old customer/guest/staff account-type gate is gone...
  assert.doesNotMatch(foundationSource, /assertCustomerActor/u);
  assert.match(foundationSource, /assertPersonalProjectActor/u);
  // ...and Project Chat listing no longer filters by role or guest email.
  assert.doesNotMatch(foundationSource, /projectChatActor/u);
  assert.doesNotMatch(queriesSource, /registeredProjectCustomer/u);
  // The predicates that actually prevent cross-user access are still present.
  assert.match(foundationSource, /eq\(projectConversation\.createdByUserId/u);
  assert.match(foundationSource, /eq\(studyJourneyProject\.ownerUserId/u);
  assert.match(queriesSource, /pc\."createdByUserId" = \$\{userId\}/u);
  assert.match(queriesSource, /pm\."status" = 'active'/u);
  // Closed Projects stay read-only and writes stay behind the shared policy.
  assert.match(foundationSource, /projectStatus !== "active"/u);
  assert.match(foundationSource, /assertProjectWritesEnabled\(\)/u);
  // HTTP layers no longer reject non-regular sessions.
  assert.doesNotMatch(projectHttpSource, /session\.type !== "regular"/u);
  assert.doesNotMatch(projectChatsHttpSource, /session\.type !== "regular"/u);
});

test("school preparation is available locally, gated in production, and never for guests or staff", () => {
  // Local development / test: reachable without any flag configuration.
  assert.equal(schoolApplicationsEnabled(undefined, "development"), true);
  assert.equal(schoolAdmissionsEnabled(undefined, "test"), true);
  // Production-like: the unchanged release NO-GO keeps it off by default.
  assert.equal(schoolApplicationsEnabled(undefined, "production"), false);
  assert.equal(schoolAdmissionsEnabled(undefined, "production"), false);
  // An explicit false always wins.
  assert.equal(schoolApplicationsEnabled("false", "development"), false);
  assert.equal(schoolAdmissionsEnabled("false", "development"), false);

  const ready = { schemaStatus: "ready" as const, writesEnabled: true };
  const guest = resolvePersonalProjectCapability({
    ...ready,
    role: "user",
    sessionType: "guest",
    userId: ownerId,
  });
  assert.equal(
    guest.schoolPreparationEligible &&
      schoolApplicationsEnabled(undefined, "development"),
    false,
    "a guest Project never silently gains M2-bound preparation"
  );
  const lawyer = resolvePersonalProjectCapability({
    ...ready,
    role: "lawyer",
    sessionType: "regular",
    userId: ownerId,
  });
  assert.equal(
    lawyer.schoolPreparationEligible &&
      schoolApplicationsEnabled(undefined, "development"),
    false
  );
  const customer = resolvePersonalProjectCapability({
    ...ready,
    role: "user",
    sessionType: "regular",
    userId: ownerId,
  });
  assert.equal(
    customer.schoolPreparationEligible &&
      schoolApplicationsEnabled(undefined, "development"),
    true
  );
});

test("managed service with unknown authority is never READY", async () => {
  const result = await evaluateManagedHandoffReadiness(
    {
      actorUserId: ownerId,
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
  assert.ok(result.reasonCodes.length > 0);
});
