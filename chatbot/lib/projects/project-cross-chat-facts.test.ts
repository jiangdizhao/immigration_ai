// biome-ignore-all lint/suspicious/useAwait: In-memory fakes return immediate promise values.
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveProjectContext } from "./context-resolver";

/**
 * Phase 14-B cross-Chat Project Fact context.
 *
 * The decisive regression locked here: a confirmed, published and AI-authorised
 * `document_extracted` fact used to disappear from the provider packet whenever its own
 * excerpt was not one of the ≤4 question-relevant snippets. The fact is now validated
 * against its **source evidence reference** instead, so the same fact survives in every
 * Chat of the same Project while the excerpt budget stays bounded.
 */

type TestFact = {
  assertionId: string;
  assertionVersion: number;
  key: string;
  valueType: "string" | "number" | "boolean" | "date" | "json";
  value: unknown;
  originKind: "customer_stated" | "document_extracted";
  confirmedByUserId: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  observedAt: string | null;
  sourceEvidenceRef: string | null;
  state: string;
  stale: boolean;
};

function documentFact(overrides: Partial<TestFact> = {}): TestFact {
  return {
    assertionId: "assertion-coe-course",
    assertionVersion: 2,
    key: "study.course",
    valueType: "string",
    value: "Bachelor of Information Technology",
    originKind: "document_extracted",
    confirmedByUserId: "customer-1",
    effectiveFrom: null,
    effectiveTo: null,
    observedAt: null,
    sourceEvidenceRef: "evidence-ref-coe-1",
    state: "customer_confirmed",
    stale: false,
    ...overrides,
  };
}

function harness(
  options: {
    facts?: TestFact[];
    chats?: Record<string, string>;
    trustedEvidence?: boolean;
  } = {}
) {
  const chats = options.chats ?? {
    "chat-a": "project-a",
    "chat-b": "project-a",
    "chat-other-project": "project-b",
    "chat-standalone": "",
  };
  const facts = options.facts ?? [];
  const verifiedRefs = new Set<string>(["evidence-ref-coe-1"]);
  const calls: string[] = [];
  let grantActive = true;

  const value = {
    schemaStatus: async () => "ready" as const,
    getOrigin: async (chatId: string) => {
      const projectId = chats[chatId];
      return projectId ? { projectId } : null;
    },
    authorize: async (input: { projectId: string; intent: string }) => {
      calls.push(`${input.projectId}:${input.intent}`);
      return { id: input.projectId, status: "active" as const };
    },
    projectChatEnabled: () => true,
    contextEnabled: () => true,
    // Mirrors production: the fact projection is scoped to the Chat's own Project.
    stableFacts: async (input: { projectId: string }) => {
      calls.push(`facts:${input.projectId}`);
      return {
        available: true,
        authorizedForAI:
          grantActive && input.projectId === "project-a" ? facts : [],
      };
    },
    verifyEvidenceRef: async (input: { evidenceRef: string }) => {
      calls.push(`verify:${input.evidenceRef}`);
      return verifiedRefs.has(input.evidenceRef);
    },
    resolveTrustedAIContextEvidence: options.trustedEvidence
      ? async () => [
          {
            evidenceRef: "evidence-ref-coe-1",
            versionId: "version-1",
            runId: "run-1",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            locator: { start: 2, end: 2 },
            excerpt: "Course name: Bachelor of Information Technology",
            contentUntrusted: true as const,
          },
        ]
      : undefined,
  };

  return {
    calls,
    revokeGrant() {
      grantActive = false;
    },
    revokeEvidence() {
      verifiedRefs.delete("evidence-ref-coe-1");
    },
    value,
  };
}

test("a confirmed document fact survives in a second Chat although its excerpt is not sent", async () => {
  const deps = harness({ facts: [documentFact()] });
  const chatA = await resolveProjectContext({
    actorUserId: "customer-1",
    chatId: "chat-a",
    dependencies: deps.value as never,
  });
  const chatB = await resolveProjectContext({
    actorUserId: "customer-1",
    chatId: "chat-b",
    dependencies: deps.value as never,
  });

  for (const resolved of [chatA, chatB]) {
    assert.equal(resolved.projectId, "project-a");
    assert.equal(resolved.packet?.confirmedProjectFacts.length, 1);
    const [fact] = resolved.packet?.confirmedProjectFacts ?? [];
    assert.equal(fact?.key, "study.course");
    assert.equal(fact?.value, "Bachelor of Information Technology");
    assert.equal(fact?.sourceEvidenceStatus, "verified");
    // No excerpt was selected for the prompt, and the fact is not dropped because of it.
    assert.equal(fact?.sourceExcerptIncluded, false);
    assert.equal(resolved.packet?.documentEvidence.length, 0);
    assert.equal(
      fact?.verificationLabel,
      "customer-confirmed; not independently verified"
    );
    assert.equal(fact?.sourceEvidenceRef, "evidence-ref-coe-1");
  }
  assert.ok(deps.calls.includes("verify:evidence-ref-coe-1"));
});

test("the cited excerpt is marked as included only when it is actually selected", async () => {
  const deps = harness({ facts: [documentFact()], trustedEvidence: true });
  const resolved = await resolveProjectContext({
    actorUserId: "customer-1",
    chatId: "chat-b",
    dependencies: deps.value as never,
  });
  assert.equal(resolved.packet?.documentEvidence.length, 1);
  assert.equal(
    resolved.packet?.confirmedProjectFacts[0]?.sourceExcerptIncluded,
    true
  );
  // Untrusted document text keeps its explicit marker.
  assert.equal(resolved.packet?.documentEvidence[0]?.contentUntrusted, true);
});

test("a fact whose source evidence fails server validation is dropped, not trusted", async () => {
  const deps = harness({ facts: [documentFact()] });
  deps.revokeEvidence();
  const resolved = await resolveProjectContext({
    actorUserId: "customer-1",
    chatId: "chat-b",
    dependencies: deps.value as never,
  });
  assert.equal(resolved.packet, null);
});

test("revoking the AI-use grant removes the fact before the next provider call", async () => {
  const deps = harness({ facts: [documentFact()] });
  const resolved = await resolveProjectContext({
    actorUserId: "customer-1",
    chatId: "chat-b",
    dependencies: deps.value as never,
  });
  assert.equal(resolved.packet?.confirmedProjectFacts.length, 1);
  deps.revokeGrant();
  assert.equal(await resolved.refreshBeforeProvider(), null);
});

test("Project isolation, standalone chats and unconfirmed facts never receive Project A facts", async () => {
  const isolated = harness({ facts: [documentFact()] });
  const otherProject = await resolveProjectContext({
    actorUserId: "customer-1",
    chatId: "chat-other-project",
    dependencies: isolated.value as never,
  });
  assert.equal(otherProject.projectId, "project-b");
  assert.equal(otherProject.packet, null);
  // The fact projection was asked for Project B only, never for Project A.
  assert.ok(isolated.calls.includes("facts:project-b"));
  assert.ok(!isolated.calls.includes("facts:project-a"));

  const standalone = await resolveProjectContext({
    actorUserId: "customer-1",
    chatId: "chat-standalone",
    dependencies: isolated.value as never,
  });
  assert.equal(standalone.projectId, null);
  assert.equal(standalone.packet, null);

  const unconfirmed = harness({
    facts: [documentFact({ state: "proposed", confirmedByUserId: null })],
  });
  const pending = await resolveProjectContext({
    actorUserId: "customer-1",
    chatId: "chat-a",
    dependencies: unconfirmed.value as never,
  });
  assert.equal(pending.packet, null);
});

test("customer-stated facts need no evidence reference and stay labelled unverified", async () => {
  const deps = harness({
    facts: [
      documentFact({
        assertionId: "assertion-stated",
        key: "study.intended_start",
        valueType: "date",
        value: "2027-02-01",
        originKind: "customer_stated",
        sourceEvidenceRef: null,
      }),
    ],
  });
  const resolved = await resolveProjectContext({
    actorUserId: "customer-1",
    chatId: "chat-b",
    dependencies: deps.value as never,
  });
  const [fact] = resolved.packet?.confirmedProjectFacts ?? [];
  assert.equal(fact?.sourceEvidenceStatus, "not_applicable");
  assert.equal(fact?.sourceExcerptIncluded, false);
  assert.equal(
    fact?.verificationLabel,
    "customer-confirmed; not independently verified"
  );
});
