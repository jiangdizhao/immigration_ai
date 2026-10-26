// biome-ignore-all lint/suspicious/useAwait: In-memory repository fakes return immediate promise values.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createProjectDocumentEvidenceService } from "../project-documents/evidence";
import {
  hashRequirementTemplateContent,
  PROVISIONAL_REQUIREMENT_CATALOG,
  validateRequirementStateShape,
} from "../project-requirements/catalog";
import { resolveProjectContext } from "../projects/context-resolver";
import { mapProjectFactAssertion } from "../projects/project-context";
import {
  createProjectFactManagementService,
  type ProjectFactAssertion,
  type ProjectFactConflict,
  type ProjectFactPublication,
  type ProjectFactRepository,
  type ProjectFactUseGrant,
} from "./facts";

class MemoryFactRepository implements ProjectFactRepository {
  assertions: ProjectFactAssertion[] = [];
  publications: ProjectFactPublication[] = [];
  grants: ProjectFactUseGrant[] = [];
  conflicts: ProjectFactConflict[] = [];

  async createCandidate(
    input: Parameters<ProjectFactRepository["createCandidate"]>[0]
  ) {
    const row: ProjectFactAssertion = {
      id: randomUUID(),
      projectId: input.projectId,
      key: input.key,
      valueType: input.valueType,
      value: input.value,
      normalizedComparison: JSON.stringify(input.value),
      originKind: input.originKind,
      state: "proposed",
      sourceEvidenceRef: input.sourceEvidenceRef,
      createdByUserId: input.actorUserId,
      confirmedByUserId: null,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      observedAt: input.observedAt,
      supersedesAssertionId: input.supersedesAssertionId,
      version: 1,
      stale: false,
    };
    for (const other of this.assertions.filter(
      (candidate) =>
        candidate.projectId === row.projectId &&
        candidate.key === row.key &&
        candidate.value !== row.value
    )) {
      this.conflicts.push({
        id: randomUUID(),
        projectId: row.projectId,
        leftAssertionId: other.id,
        rightAssertionId: row.id,
        kind:
          other.effectiveFrom &&
          other.effectiveTo &&
          row.effectiveFrom &&
          row.effectiveTo
            ? "conflict"
            : "possible_conflict",
        resolvedAt: null,
      });
    }
    this.assertions.push(row);
    return row;
  }

  async transition(input: Parameters<ProjectFactRepository["transition"]>[0]) {
    const row = this.assertions.find(
      (candidate) =>
        candidate.projectId === input.projectId &&
        candidate.id === input.assertionId
    );
    if (
      !row ||
      row.version !== input.assertionVersion ||
      row.state !== "proposed"
    ) {
      throw new Error("revision_conflict");
    }
    row.state = input.to;
    row.confirmedByUserId =
      input.to === "customer_confirmed" ? input.actorUserId : null;
    return row;
  }
  async publish(input: Parameters<ProjectFactRepository["publish"]>[0]) {
    const row = {
      assertionId: input.assertionId,
      assertionVersion: input.assertionVersion,
      actorUserId: input.actorUserId,
      audience: input.audience,
      active: true,
    };
    this.publications.push(row);
    return row;
  }
  async grantAIUse(input: Parameters<ProjectFactRepository["grantAIUse"]>[0]) {
    const row = {
      assertionId: input.assertionId,
      assertionVersion: input.assertionVersion,
      actorUserId: input.actorUserId,
      audience: input.audience,
      purpose: "ai_context" as const,
      active: true,
    };
    this.grants.push(row);
    return row;
  }
  async revokeAIUse(
    input: Parameters<ProjectFactRepository["revokeAIUse"]>[0]
  ) {
    const row = this.grants.find(
      (grant) =>
        grant.assertionId === input.assertionId &&
        grant.actorUserId === input.actorUserId &&
        grant.active
    );
    if (!row) {
      throw new Error("forbidden");
    }
    row.active = false;
    return row;
  }
  async projection(input: { projectId: string }) {
    return {
      assertions: this.assertions.filter(
        (row) => row.projectId === input.projectId
      ),
      publications: this.publications,
      grants: this.grants,
      conflicts: this.conflicts.filter(
        (row) => row.projectId === input.projectId
      ),
    };
  }
}

function createHashForFixture(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function setup() {
  const repository = new MemoryFactRepository();
  const service = createProjectFactManagementService({
    repository,
    verifyEvidence: async ({ evidenceRef, projectId }) =>
      ["opaque-evidence-ref", "private-evidence-ref"].includes(evidenceRef) &&
      projectId === "project-a",
  });
  return { repository, service };
}

const base = {
  actorUserId: "customer-a",
  projectId: "project-a",
  operationId: "fact-op-1",
  expectedProjectRevision: 1,
  key: "school.start_date",
  valueType: "date" as const,
  value: "2027-02-01",
  originKind: "customer_stated" as const,
  effectiveFrom: "2027-02-01T00:00:00.000Z",
  effectiveTo: "2027-02-01T00:00:00.000Z",
};

test("confirmation, publication and AI-use are independent gates", async () => {
  const { service } = setup();
  const candidate = await service.propose(base);
  assert.equal(
    (
      await service.stableProjection({
        actorUserId: base.actorUserId,
        projectId: base.projectId,
      })
    ).authorizedForAI.length,
    0
  );
  const confirmed = await service.confirm({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
    operationId: "fact-confirm",
    expectedProjectRevision: 2,
    assertionId: candidate.id,
    assertionVersion: candidate.version,
  });
  await service.publish({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
    operationId: "fact-publish",
    expectedProjectRevision: 3,
    assertionId: candidate.id,
    assertionVersion: confirmed.version,
    audience: "actor_only",
  });
  assert.equal(
    (
      await service.stableProjection({
        actorUserId: base.actorUserId,
        projectId: base.projectId,
      })
    ).authorizedForAI.length,
    0
  );
  await service.grantAIUse({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
    operationId: "fact-grant",
    expectedProjectRevision: 4,
    assertionId: candidate.id,
    assertionVersion: confirmed.version,
    audience: "actor_only",
  });
  assert.equal(
    (
      await service.stableProjection({
        actorUserId: base.actorUserId,
        projectId: base.projectId,
      })
    ).authorizedForAI.length,
    1
  );
  await service.revokeAIUse({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
    operationId: "fact-revoke",
    expectedProjectRevision: 5,
    assertionId: candidate.id,
    assertionVersion: confirmed.version,
  });
  assert.equal(
    (
      await service.stableProjection({
        actorUserId: base.actorUserId,
        projectId: base.projectId,
      })
    ).authorizedForAI.length,
    0
  );
});

test("forged evidence, person-scoped facts and unsupported professional approval fail closed", async () => {
  const { service } = setup();
  await assert.rejects(
    service.propose({
      ...base,
      originKind: "document_extracted",
      sourceEvidenceRef: "forged",
    }),
    { code: "evidence_unverified" }
  );
  await assert.rejects(service.propose({ ...base, personId: "person-1" }), {
    code: "person_authority_unavailable",
  });
  await assert.rejects(
    service.propose({ ...base, originKind: "professional_determination" }),
    { code: "professional_authority_unavailable" }
  );
});

test("conflicting assertions are both retained and unavailable in the AI projection", async () => {
  const { repository, service } = setup();
  const first = await service.propose(base);
  const _second = await service.propose({
    ...base,
    operationId: "fact-op-2",
    expectedProjectRevision: 2,
    value: "2027-03-01",
  });
  assert.equal(repository.assertions.length, 2);
  assert.equal(repository.conflicts.length, 1);
  assert.equal(repository.conflicts[0]?.kind, "conflict");
  const confirmed = await service.confirm({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
    operationId: "fact-confirm-a",
    expectedProjectRevision: 3,
    assertionId: first.id,
    assertionVersion: 1,
  });
  await service.publish({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
    operationId: "fact-pub-a",
    expectedProjectRevision: 4,
    assertionId: first.id,
    assertionVersion: confirmed.version,
    audience: "actor_only",
  });
  await service.grantAIUse({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
    operationId: "fact-grant-a",
    expectedProjectRevision: 5,
    assertionId: first.id,
    assertionVersion: confirmed.version,
    audience: "actor_only",
  });
  const projection = await service.stableProjection({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
  });
  assert.equal(projection.authorizedForAI.length, 0);
  assert.equal(projection.conflicts.length, 1);
  assert.equal(projection.unresolvedCandidates.length, 2);
});

test("a hidden member conflict suppresses AI eligibility without disclosing private details", async () => {
  const { repository, service } = setup();
  const visibleCandidate = await service.propose(base);
  const confirmed = await service.confirm({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
    operationId: "fact-confirm-visible",
    expectedProjectRevision: 2,
    assertionId: visibleCandidate.id,
    assertionVersion: visibleCandidate.version,
  });
  await service.publish({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
    operationId: "fact-publish-visible",
    expectedProjectRevision: 3,
    assertionId: visibleCandidate.id,
    assertionVersion: confirmed.version,
    audience: "actor_only",
  });
  await service.grantAIUse({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
    operationId: "fact-grant-visible",
    expectedProjectRevision: 4,
    assertionId: visibleCandidate.id,
    assertionVersion: confirmed.version,
    audience: "actor_only",
  });

  const privateConflict = await service.propose({
    ...base,
    actorUserId: "customer-b",
    operationId: "fact-propose-private-conflict",
    expectedProjectRevision: 5,
    value: "2027-03-01",
    originKind: "document_extracted",
    sourceEvidenceRef: "private-evidence-ref",
    effectiveFrom: null,
    effectiveTo: null,
  });
  assert.equal(privateConflict.createdByUserId, "customer-b");
  assert.equal(repository.conflicts.length, 1);
  assert.equal(repository.conflicts[0]?.kind, "possible_conflict");

  const projection = await service.stableProjection({
    actorUserId: base.actorUserId,
    projectId: base.projectId,
  });
  assert.equal(projection.authorizedForAI.length, 0);
  assert.deepEqual(
    projection.unresolvedCandidates.map((assertion) => assertion.id),
    [visibleCandidate.id]
  );
  assert.deepEqual(projection.conflicts, []);
  const serialized = JSON.stringify(projection);
  assert.equal(serialized.includes(privateConflict.id), false);
  assert.equal(serialized.includes("2027-03-01"), false);
  assert.equal(serialized.includes("document_extracted"), false);
  assert.equal(serialized.includes("private-evidence-ref"), false);
  assert.equal(serialized.includes("customer-b"), false);
});

test("synthetic two-Chat extraction, fact authorization, revocation and conflict invalidation", async () => {
  const requirementFamily = PROVISIONAL_REQUIREMENT_CATALOG.find(
    (item) => item.family === "school_facts"
  );
  assert.ok(requirementFamily);
  const requirementItem = requirementFamily.items[0];
  assert.ok(requirementItem);
  const requirementVersionId = hashRequirementTemplateContent({
    schemaVersion: requirementFamily.schemaVersion,
    items: requirementFamily.items,
    sourceProvenance: requirementFamily.sourceProvenance,
  });
  validateRequirementStateShape({
    family: requirementFamily.family,
    templateKey: requirementFamily.templateKey,
    templateVersionId: requirementVersionId,
    itemKey: requirementItem.key,
    applicability: "unknown",
    collectionState: "not_started",
    factLocator: null,
    evidenceLocator: null,
  });
  assert.match(
    requirementFamily.sourceProvenance.note,
    /not an official checklist/u
  );
  const bytes = new TextEncoder().encode(
    "Synthetic study start date: 2027-02-01."
  );
  const sha256 = createHashForFixture(bytes);
  const source = {
    projectId: "project-a",
    assetId: "asset-a",
    versionId: "version-a",
    generation: 1,
    lifecycle: "active" as const,
    storageStatus: "stored" as const,
    securityStatus: "clean" as const,
    storageKey: "synthetic/private/object",
    objectVersionId: "object-version-a",
    sha256,
    byteSize: bytes.byteLength,
    canonicalMime: "text/plain",
  };
  const runs = new Map<
    string,
    import("../project-documents/evidence").ProjectEvidenceRun
  >();
  const refs = new Map<
    string,
    {
      run: import("../project-documents/evidence").ProjectEvidenceRun;
      candidate: import("../project-documents/evidence").ProjectEvidenceCandidate;
    }
  >();
  let aiContextGrantActive = true;
  const evidenceService = createProjectDocumentEvidenceService({
    persistence: {
      async findSource() {
        return source;
      },
      async canExtract({ actorUserId }) {
        return actorUserId === "actor-a";
      },
      async findReplay() {
        return null;
      },
      async findRunForReferenceIssue({ runId }) {
        return runs.get(runId) ?? null;
      },
      async saveRun({ run }) {
        runs.set(run.id, run);
        return run;
      },
      async issueReference({ runId, candidateOrdinal }) {
        const run = runs.get(runId);
        assert.ok(run);
        const candidate = run.candidates.find(
          (item) => item.ordinal === candidateOrdinal
        );
        assert.ok(candidate);
        const evidenceRef = "opaque-project-evidence-ref";
        refs.set(evidenceRef, { run, candidate });
        return evidenceRef;
      },
      async resolveReference({ evidenceRef }) {
        return refs.get(evidenceRef) ?? null;
      },
    },
    reader: {
      async readExactVersion(input) {
        assert.equal(input.objectVersionId, source.objectVersionId);
        assert.equal(input.expectedSha256, source.sha256);
        assert.equal(input.expectedByteSize, source.byteSize);
        return bytes;
      },
    },
    verifyAuthenticatedScan: async () => ({
      projectId: source.projectId,
      versionId: source.versionId,
      generation: source.generation,
      objectVersionId: source.objectVersionId ?? "",
      sha256: source.sha256,
      verdict: "clean" as const,
      authenticated: true as const,
    }),
  });
  const run = await evidenceService.extract({
    actorUserId: "actor-a",
    projectId: "project-a",
    assetId: "asset-a",
    versionId: "version-a",
    operationId: "extract-a",
    expectedProjectRevision: 1,
  });
  assert.equal(run.status, "complete");
  const [evidenceRef] = await evidenceService.issueEvidenceRefs({
    actorUserId: "actor-a",
    projectId: "project-a",
    runId: run.id,
  });
  assert.ok(evidenceRef);

  const repository = new MemoryFactRepository();
  const factService = createProjectFactManagementService({
    repository,
    verifyEvidence: async ({ actorUserId, projectId, evidenceRef: ref }) =>
      aiContextGrantActive &&
      projectId === "project-a" &&
      Boolean(
        await evidenceService.resolveEvidenceRef({
          actorUserId,
          projectId,
          evidenceRef: ref,
        })
      ),
  });
  const candidate = await factService.propose({
    ...base,
    actorUserId: "actor-a",
    operationId: "e2e-propose",
    expectedProjectRevision: 1,
    originKind: "document_extracted",
    sourceEvidenceRef: evidenceRef,
  });
  const confirmed = await factService.confirm({
    actorUserId: "actor-a",
    projectId: "project-a",
    operationId: "e2e-confirm",
    expectedProjectRevision: 2,
    assertionId: candidate.id,
    assertionVersion: candidate.version,
  });
  await factService.publish({
    actorUserId: "actor-a",
    projectId: "project-a",
    operationId: "e2e-publish",
    expectedProjectRevision: 3,
    assertionId: candidate.id,
    assertionVersion: confirmed.version,
    audience: "project",
  });
  await factService.grantAIUse({
    actorUserId: "actor-a",
    projectId: "project-a",
    operationId: "e2e-grant",
    expectedProjectRevision: 4,
    assertionId: candidate.id,
    assertionVersion: confirmed.version,
    audience: "project",
  });

  const dependencies = {
    schemaStatus: async () => "ready" as const,
    getOrigin: async (chatId: string) =>
      ["chat-a", "chat-b"].includes(chatId) ? { projectId: "project-a" } : null,
    authorize: async () => ({ id: "project-a", status: "active" }),
    projectChatEnabled: () => true,
    contextEnabled: () => true,
    stableFacts: async (input: { actorUserId: string; projectId: string }) => {
      const projection = await factService.stableProjection(input);
      return {
        ...projection,
        authorizedForAI: projection.authorizedForAI.map(
          mapProjectFactAssertion
        ),
      };
    },
    async resolveTrustedAIContextEvidence({
      actorUserId,
      projectId,
    }: {
      actorUserId: string;
      projectId: string;
    }) {
      if (!aiContextGrantActive) {
        return [];
      }
      const resolved = await evidenceService.resolveEvidenceRef({
        actorUserId,
        projectId,
        evidenceRef,
      });
      if (
        !resolved ||
        resolved.run.status !== "complete" ||
        resolved.run.versionId !== source.versionId
      ) {
        return [];
      }
      return [
        {
          evidenceRef,
          versionId: resolved.run.versionId,
          runId: resolved.run.id,
          mimeType: source.canonicalMime,
          locator: {
            kind: resolved.candidate.locator.kind,
            start:
              "start" in resolved.candidate.locator
                ? resolved.candidate.locator.start
                : 0,
          },
          excerpt: resolved.candidate.excerpt,
          contentUntrusted: true as const,
        },
      ];
    },
  };
  const memberChat = await resolveProjectContext({
    actorUserId: "actor-b",
    chatId: "chat-b",
    dependencies: dependencies as never,
  });
  assert.equal(memberChat.projectId, "project-a");
  assert.equal(
    memberChat.packet?.confirmedProjectFacts[0]?.assertionId,
    candidate.id
  );
  assert.equal(
    memberChat.packet?.documentEvidence[0]?.versionId,
    source.versionId
  );

  aiContextGrantActive = false;
  const afterDocumentGrantRevocation = await resolveProjectContext({
    actorUserId: "actor-b",
    chatId: "chat-b",
    dependencies: dependencies as never,
  });
  assert.equal(afterDocumentGrantRevocation.packet, null);

  aiContextGrantActive = true;
  await factService.revokeAIUse({
    actorUserId: "actor-a",
    projectId: "project-a",
    operationId: "e2e-revoke",
    expectedProjectRevision: 5,
    assertionId: candidate.id,
    assertionVersion: confirmed.version,
  });
  const afterFactGrantRevocation = await resolveProjectContext({
    actorUserId: "actor-b",
    chatId: "chat-b",
    dependencies: dependencies as never,
  });
  assert.equal(
    afterFactGrantRevocation.packet?.confirmedProjectFacts.length,
    0
  );
  assert.equal(afterFactGrantRevocation.packet?.documentEvidence.length, 1);

  const rival = await factService.propose({
    ...base,
    actorUserId: "actor-b",
    operationId: "e2e-rival",
    expectedProjectRevision: 6,
    value: "2027-03-01",
    originKind: "customer_stated",
  });
  const rivalConfirmed = await factService.confirm({
    actorUserId: "actor-b",
    projectId: "project-a",
    operationId: "e2e-rival-confirm",
    expectedProjectRevision: 7,
    assertionId: rival.id,
    assertionVersion: rival.version,
  });
  await factService.publish({
    actorUserId: "actor-b",
    projectId: "project-a",
    operationId: "e2e-rival-publish",
    expectedProjectRevision: 8,
    assertionId: rival.id,
    assertionVersion: rivalConfirmed.version,
    audience: "project",
  });
  await factService.grantAIUse({
    actorUserId: "actor-b",
    projectId: "project-a",
    operationId: "e2e-rival-grant",
    expectedProjectRevision: 9,
    assertionId: rival.id,
    assertionVersion: rivalConfirmed.version,
    audience: "project",
  });
  const afterConflict = await resolveProjectContext({
    actorUserId: "actor-a",
    chatId: "chat-a",
    dependencies: dependencies as never,
  });
  assert.equal(afterConflict.packet?.confirmedProjectFacts.length, 0);
});
