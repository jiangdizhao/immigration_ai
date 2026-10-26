import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ProjectContextResolutionError,
  resolveProjectContext,
} from "./context-resolver";

function dependencies(overrides: Record<string, unknown> = {}) {
  let active = true;
  let projectStatus = "active";
  let projectContextEnabled = true;
  let projectChatFeatureEnabled = true;
  let originProjectId = "project-a";
  let authorizedFacts: Record<string, unknown>[] = [];
  const calls: string[] = [];
  const base = {
    schemaStatus: async () => "ready" as const,
    getOrigin: async (chatId: string) =>
      chatId === "chat-a" && originProjectId
        ? { projectId: originProjectId }
        : null,
    authorize: async ({ intent }: { intent: string }) => {
      await Promise.resolve();
      calls.push(intent);
      if (!active) {
        throw new Error("revoked");
      }
      return { id: "project-a", status: projectStatus };
    },
    projectChatEnabled: () => projectChatFeatureEnabled,
    contextEnabled: () => projectContextEnabled,
    stableFacts: async () => ({
      available: true,
      authorizedForAI: authorizedFacts,
    }),
  };
  return {
    calls,
    revoke() {
      active = false;
    },
    closeProject() {
      projectStatus = "closed";
    },
    disableContext() {
      projectContextEnabled = false;
    },
    disableProjectChat() {
      projectChatFeatureEnabled = false;
    },
    changeOrigin() {
      originProjectId = "project-b";
    },
    setFacts(facts: Record<string, unknown>[]) {
      authorizedFacts = facts;
    },
    value: { ...base, ...overrides },
  };
}

function stableFact(id = "assertion-1"): Record<string, unknown> {
  return {
    assertionId: id,
    assertionVersion: 1,
    key: "study.start_date",
    valueType: "date",
    value: "2027-02-01",
    originKind: "customer_stated",
    confirmedByUserId: "actor-a",
    effectiveFrom: null,
    effectiveTo: null,
    observedAt: null,
    sourceEvidenceRef: null,
    state: "customer_confirmed",
    stale: false,
  };
}

test("Project identity comes from the persisted exact Chat association", async () => {
  const deps = dependencies();
  const project = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  assert.equal(project.projectId, "project-a");
  assert.deepEqual(deps.calls, [
    "chat_history",
    "project_write",
    "chat_history",
    "project_write",
  ]);
  assert.equal(project.packet, null);
  const standalone = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-b",
    dependencies: deps.value as never,
  });
  assert.equal(standalone.projectId, null);
  assert.equal(standalone.diagnostic, "standalone");
});

test("Project membership revocation before provider submission fails closed", async () => {
  const deps = dependencies();
  const project = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  deps.revoke();
  await assert.rejects(
    project.refreshBeforeProvider(),
    ProjectContextResolutionError
  );
});

test("only the authorized stable fact projection is mapped into the packet", async () => {
  const deps = dependencies({
    stableFacts: async () => ({
      available: true,
      authorizedForAI: [
        {
          assertionId: "assertion-1",
          assertionVersion: 3,
          key: "study.start_date",
          valueType: "date",
          value: "2027-02-01",
          originKind: "customer_stated",
          confirmedByUserId: "actor-a",
          effectiveFrom: null,
          effectiveTo: null,
          observedAt: null,
          sourceEvidenceRef: null,
          state: "customer_confirmed",
          stale: false,
        },
      ],
    }),
  });
  const project = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  assert.equal(project.packet?.confirmedProjectFacts.length, 1);
  assert.equal(project.packet?.confirmedProjectFacts[0].assertionVersion, 3);
});

test("a second authorized Project Chat can resolve the same stable fact and observes revocation on the next turn", async () => {
  let grantActive = true;
  const deps = dependencies({
    getOrigin: async (chatId: string) =>
      ["chat-a", "chat-b"].includes(chatId) ? { projectId: "project-a" } : null,
    stableFacts: async () => ({
      available: true,
      authorizedForAI: grantActive
        ? [
            {
              assertionId: "shared-assertion",
              assertionVersion: 1,
              key: "study.start_date",
              valueType: "date",
              value: "2027-02-01",
              originKind: "customer_stated",
              confirmedByUserId: "actor-a",
              effectiveFrom: null,
              effectiveTo: null,
              observedAt: null,
              sourceEvidenceRef: null,
              state: "customer_confirmed",
              stale: false,
            },
          ]
        : [],
    }),
  });
  const chatB = await resolveProjectContext({
    actorUserId: "actor-b",
    chatId: "chat-b",
    dependencies: deps.value as never,
  });
  assert.equal(
    chatB.packet?.confirmedProjectFacts[0].assertionId,
    "shared-assertion"
  );
  grantActive = false;
  const afterRevocation = await resolveProjectContext({
    actorUserId: "actor-b",
    chatId: "chat-b",
    dependencies: deps.value as never,
  });
  assert.equal(afterRevocation.packet, null);
});

test("revoked Fact AI grant is removed from the refreshed provider packet", async () => {
  const deps = dependencies();
  deps.setFacts([stableFact()]);
  const initial = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  assert.equal(initial.packet?.confirmedProjectFacts.length, 1);
  deps.setFacts([]); // stableProjection now excludes the revoked grant.
  assert.equal(await initial.refreshBeforeProvider(), null);
});

test("withdrawn Fact publication is removed from the refreshed provider packet", async () => {
  const deps = dependencies();
  deps.setFacts([stableFact()]);
  const initial = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  deps.setFacts([]); // stableProjection now excludes the withdrawn publication.
  assert.equal(await initial.refreshBeforeProvider(), null);
});

test("a newly discovered hidden conflict suppresses the refreshed Fact packet", async () => {
  const deps = dependencies();
  deps.setFacts([stableFact()]);
  const initial = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  deps.setFacts([]); // full Project unresolved-conflict set suppresses eligibility.
  assert.equal(await initial.refreshBeforeProvider(), null);
});

test("trusted Project Document permissions are refreshed before provider submission", async () => {
  let evidenceAuthorized = true;
  const deps = dependencies({
    resolveTrustedAIContextEvidence: async () =>
      evidenceAuthorized
        ? [
            {
              evidenceRef: "opaque-evidence-ref",
              versionId: "immutable-version-id",
              runId: "extraction-run-id",
              mimeType: "text/plain",
              locator: { line: 1 },
              excerpt: "Synthetic untrusted excerpt",
              contentUntrusted: true,
            },
          ]
        : [],
  });
  const initial = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  assert.equal(initial.packet?.documentEvidence.length, 1);
  evidenceAuthorized = false;
  assert.equal(await initial.refreshBeforeProvider(), null);
});

test("disabling Project Context removes facts without bypassing Project authorization", async () => {
  const deps = dependencies();
  deps.setFacts([stableFact()]);
  const initial = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  deps.disableContext();
  assert.equal(await initial.refreshBeforeProvider(), null);
  assert.ok(deps.calls.length >= 8);
});

test("Project closure before provider submission fails closed", async () => {
  const deps = dependencies();
  const initial = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  deps.closeProject();
  await assert.rejects(
    initial.refreshBeforeProvider(),
    ProjectContextResolutionError
  );
});

test("Project Chat feature disablement before provider submission fails closed", async () => {
  const deps = dependencies();
  const initial = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  deps.disableProjectChat();
  await assert.rejects(
    initial.refreshBeforeProvider(),
    ProjectContextResolutionError
  );
});

test("changing the persisted Chat Project association before provider submission fails closed", async () => {
  const deps = dependencies();
  const initial = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  deps.changeOrigin();
  await assert.rejects(
    initial.refreshBeforeProvider(),
    ProjectContextResolutionError
  );
});

test("partial schema and disabled Project Chat fail closed for associated origin", async () => {
  const partial = dependencies({
    schemaStatus: async () => "partial" as const,
  });
  await assert.rejects(
    resolveProjectContext({
      actorUserId: "actor-a",
      chatId: "chat-a",
      dependencies: partial.value as never,
    }),
    ProjectContextResolutionError
  );
  const disabled = dependencies({ projectChatEnabled: () => false });
  await assert.rejects(
    resolveProjectContext({
      actorUserId: "actor-a",
      chatId: "chat-a",
      dependencies: disabled.value as never,
    }),
    ProjectContextResolutionError
  );
});

test("Fast, Default and Premium routes submit the freshly resolved packet", () => {
  const routes = [
    "../../app/api/widget-chat-fast/route.ts",
    "../../app/api/widget-chat/route.ts",
    "../../app/api/widget-chat-direct/route.ts",
  ];
  for (const route of routes) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(source, /refreshProjectContextBeforeProvider\(\)/u);
    assert.match(
      source,
      /projectContextRequestPayload\(currentProjectContext\)/u
    );
  }
});
