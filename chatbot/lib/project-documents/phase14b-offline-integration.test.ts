// biome-ignore-all lint/suspicious/useAwait: In-memory persistence fakes return promise values.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createProjectFactManagementService } from "@/lib/project-facts/facts";
import { createProjectFactHandlers } from "@/lib/project-facts/http";
import { createProjectFactReviewService } from "@/lib/project-facts/review";
import { StrictFactRepository } from "@/lib/project-facts/strict-repository";
import { resolveProjectContext } from "@/lib/projects/context-resolver";
import {
  createProjectDocumentEvidenceService,
  type ProjectDocumentEvidencePersistence,
  type ProjectEvidenceCandidate,
  type ProjectEvidenceRun,
  type VerifiedEvidenceSource,
} from "./evidence";
import { createProjectFactEvidenceVerifier } from "./fact-capabilities";
import { createEvidenceRunCompletedHook } from "./facts-integration";
import { createProjectDocumentHandlers } from "./http";
import { buildDocx } from "./synthetic-fixtures";

/**
 * Phase 14-B R1-03 offline end-to-end integration.
 *
 * DOCX CoE → real native parsing → verified evidence run → proposed Project Facts (through
 * the actual documents HTTP processing action and completion hook) → review API projection →
 * confirm + authorize → same-Project other-Chat context → revoke → isolation checks.
 *
 * The scan attestation is an **injected synthetic** attestation. This proves the wiring, not
 * that a production malware scanner or the live documents runtime works. Result label:
 * `OFFLINE_INTEGRATION_PASS`, never `LIVE_DOCUMENT_PROCESSING_PASS`.
 */

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ACTOR = "customer-1";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT = "44444444-4444-4444-8444-444444444444";
const ASSET_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";
const OBJECT_VERSION_ID = "immutable-object-version-1";

const COE_PARAGRAPHS = [
  "Confirmation of Enrolment",
  "Student name: Lin Wei",
  "Date of birth: 04/07/2004",
  "Education provider: Example Institute of Technology",
  "Course name: Bachelor of Information Technology",
  "Campus: Sydney",
  "Course start date: 01/03/2027",
  "Course end date: 30/11/2029",
  "CoE reference: 9F7A2C1B44",
];

class MemoryEvidence implements ProjectDocumentEvidencePersistence {
  source: VerifiedEvidenceSource | null = null;
  runs: ProjectEvidenceRun[] = [];
  private readonly refs = new Map<string, { runId: string; ordinal: number }>();

  async findSource() {
    return this.source;
  }
  async canExtract() {
    return true;
  }
  async findReplay() {
    return null;
  }
  async findRunForReferenceIssue(input: { runId: string }) {
    return this.runs.find((run) => run.id === input.runId) ?? null;
  }
  async saveRun(input: { run: ProjectEvidenceRun }) {
    this.runs.push(input.run);
    return input.run;
  }
  async issueReference(input: { runId: string; candidateOrdinal: number }) {
    const existing = [...this.refs.entries()].find(
      ([, value]) =>
        value.runId === input.runId && value.ordinal === input.candidateOrdinal
    );
    if (existing) {
      return existing[0];
    }
    const id = `evidence-ref-${this.refs.size + 1}`;
    this.refs.set(id, {
      runId: input.runId,
      ordinal: input.candidateOrdinal,
    });
    return id;
  }
  /**
   * R1: the fact-source validator must go through the **proof-checked** resolution, which
   * requires the authenticated scan attestation. The harness delegates to the real evidence
   * service (the value is assigned in `harness()`).
   */
  /**
   * Raw reference lookup (the strict permission/attestation checks live in the real
   * PostgreSQL persistence; this fake reproduces the identity part: the reference must
   * exist, belong to this Project and point at a completed run).
   */
  async resolveReference(request: {
    actorUserId: string;
    projectId: string;
    evidenceRef: string;
  }): Promise<{
    run: ProjectEvidenceRun;
    candidate: ProjectEvidenceCandidate;
  } | null> {
    const ref = this.refs.get(request.evidenceRef);
    const run = this.runs.find((row) => row.id === ref?.runId);
    if (!(ref && run) || run.projectId !== request.projectId) {
      return null;
    }
    if (run.status !== "complete" && run.status !== "partial") {
      return null;
    }
    const candidate = run.candidates.find((row) => row.ordinal === ref.ordinal);
    return candidate ? { run, candidate } : null;
  }
}

function harness() {
  const bytes = buildDocx(COE_PARAGRAPHS);
  const persistence = new MemoryEvidence();
  const source: VerifiedEvidenceSource = {
    projectId: PROJECT,
    assetId: ASSET_ID,
    versionId: VERSION_ID,
    generation: 1,
    lifecycle: "active",
    storageStatus: "stored",
    securityStatus: "clean",
    storageKey: "private/exact-object",
    objectVersionId: OBJECT_VERSION_ID,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteSize: bytes.byteLength,
    canonicalMime: DOCX_MIME,
  };
  persistence.source = source;

  const evidenceService = createProjectDocumentEvidenceService({
    persistence,
    reader: { readExactVersion: async () => bytes },
    verifyAuthenticatedScan: async ({ source: current }) => ({
      authenticated: true,
      verdict: "clean",
      projectId: current.projectId,
      versionId: current.versionId,
      generation: current.generation,
      objectVersionId: current.objectVersionId ?? "",
      sha256: current.sha256,
    }),
  });

  const verifyEvidence = createProjectFactEvidenceVerifier({
    resolveReference: (request) => evidenceService.resolveEvidenceRef(request),
  });

  const repository = new StrictFactRepository(1);
  // The documents routes require UUID project identifiers.
  repository.revisions.set(PROJECT, 1);
  // Same proof-checked evidence gate as production, through the M2 store.
  repository.verifyEvidence = (evidenceRef) =>
    verifyEvidence({ actorUserId: ACTOR, projectId: PROJECT, evidenceRef });
  const facts = createProjectFactManagementService({
    repository,
    verifyEvidence,
  });
  const review = createProjectFactReviewService({
    facts,
    readProjectRevision: async ({ projectId }) =>
      repository.revisionFor(projectId),
    readFactState: async ({ assertionId }) => {
      const row = repository.assertions.find(
        (entry) => entry.id === assertionId
      );
      return row ? { state: row.state, version: row.version } : null;
    },
  });

  // The documents runtime composes exactly this hook and validator in production.
  const onEvidenceRunCompleted = createEvidenceRunCompletedHook({
    persistence,
    async existingFacts({ projectId }) {
      const projection = await facts.stableProjection({
        actorUserId: ACTOR,
        projectId,
      });
      return [
        ...projection.unresolvedCandidates,
        ...projection.authorizedForAI,
      ].map((row) => ({
        assertionId: row.id,
        key: row.key,
        value: row.value,
        state: row.state,
      }));
    },
    proposeExtracted: review.proposeExtracted,
  });

  const documentHandlers = createProjectDocumentHandlers({
    authenticate: async () => ({ userId: ACTOR, type: "regular" }),
    isRegisteredCustomer: async () => true,
    schemaAvailable: async () => true,
    featureEnabled: () => true,
    // Synthetic trust for the offline test only; production keeps `false`.
    trustedLiveReadiness: async () => true,
    application: {
      listMetadata: async () => [],
      createDirectUpload: async () => {
        throw new Error("not used");
      },
      issueImportConsentAcknowledgement: async () => {
        throw new Error("not used");
      },
      importOwnedChatDocument: async () => {
        throw new Error("not used");
      },
      getMetadata: async () => null,
      download: async () => null,
      withdraw: async () => {
        throw new Error("not used");
      },
      revokeCreatorGrant: async () => {
        throw new Error("not used");
      },
      // The real evidence service performs the identity, permission and scan checks.
      extractEvidence: async (input) => {
        const run = await evidenceService.extract({
          actorUserId: input.actorUserId,
          projectId: input.projectId,
          assetId: input.assetId,
          versionId: input.versionId,
          operationId: input.operationId,
          expectedProjectRevision: input.expectedProjectRevision,
        });
        return {
          runId: run.id,
          status: run.status,
          candidateCount: run.candidates.length,
          generation: run.generation,
          projectRevision: repository.revisionFor(input.projectId),
        };
      },
    },
    onEvidenceRunCompleted,
  });

  return {
    documentHandlers,
    facts,
    review,
    repository,
    persistence,
    verifyEvidence,
  };
}

function factsHandlers(
  facts: ReturnType<typeof createProjectFactManagementService>,
  review: ReturnType<typeof createProjectFactReviewService>,
  readRevision: (projectId: string) => number
) {
  return createProjectFactHandlers({
    authenticate: async () => ({ userId: ACTOR, type: "regular" }),
    isRegisteredCustomer: async () => true,
    schemaAvailable: async () => true,
    featureEnabled: () => true,
    authorize: async (input) => ({
      id: input.projectId,
      status: "active",
      revision: readRevision(input.projectId),
    }),
    async projection({ actorUserId, projectId }) {
      const projection = await facts.stableProjection({
        actorUserId,
        projectId,
      });
      if (!projection.available) {
        return null;
      }
      const conflicted = new Set(
        projection.conflicts
          .filter((conflict) => conflict.resolvedAt === null)
          .flatMap((conflict) => [
            conflict.leftAssertionId,
            conflict.rightAssertionId,
          ])
      );
      return {
        candidates: projection.unresolvedCandidates.map((row) => ({
          assertionId: row.id,
          assertionVersion: row.version,
          key: row.key,
          valueType: row.valueType,
          value: row.value,
          originKind: row.originKind,
          sourceEvidenceRef: row.sourceEvidenceRef,
          state: row.state,
          conflicts: conflicted.has(row.id),
        })),
        authorizedForAI: projection.authorizedForAI.map((row) => ({
          assertionId: row.id,
          assertionVersion: row.version,
          key: row.key,
          valueType: row.valueType,
          value: row.value,
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
          sourceEvidenceRef: row.sourceEvidenceRef,
        })),
        conflictCount: projection.conflicts.filter(
          (conflict) => conflict.resolvedAt === null
        ).length,
      };
    },
    review,
  });
}

test("OFFLINE_INTEGRATION_PASS: document → proposed facts → review → cross-Chat → revoke", async () => {
  const { documentHandlers, facts, review, repository, verifyEvidence } =
    harness();
  {
    // 1-2. Authorised extraction through the real documents processing action.
    const extractResponse = await documentHandlers.extractEvidence(
      new Request(
        `http://localhost/api/projects/${PROJECT}/documents/${ASSET_ID}/evidence`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operationId: "extract-op-1",
            expectedProjectRevision: repository.revisionFor(PROJECT),
            versionId: VERSION_ID,
          }),
        }
      ),
      PROJECT,
      ASSET_ID
    );
    assert.equal(extractResponse.status, 200);
    const extractBody = (await extractResponse.json()) as {
      evidence: { status: string; candidateCount: number; runId: string };
      proposedFacts: { proposedCount: number } | null;
    };
    assert.equal(extractBody.evidence.status, "complete");
    assert.ok(extractBody.evidence.candidateCount >= 5);

    // 3. Candidates persisted as proposals, never confirmed.
    assert.ok(extractBody.proposedFacts);
    assert.ok(extractBody.proposedFacts.proposedCount >= 5);
    assert.ok(repository.assertions.every((row) => row.state === "proposed"));
    assert.ok(
      repository.assertions.every((row) => row.sourceEvidenceRef !== null)
    );

    // 4. The review API projection exposes them with provenance.
    const handlers = factsHandlers(facts, review, (projectId) =>
      repository.revisionFor(projectId)
    );
    const listResponse = await handlers.list(
      new Request(`http://localhost/api/projects/${PROJECT}/facts`),
      PROJECT
    );
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()) as {
      projection: {
        candidates: Array<{
          assertionId: string;
          assertionVersion: number;
          key: string;
          sourceEvidenceRef: string | null;
        }>;
        authorizedForAI: unknown[];
      };
    };
    const course = listed.projection.candidates.find(
      (row) => row.key === "study.course"
    );
    assert.ok(course, "the CoE course candidate must be reviewable");
    assert.match(course.sourceEvidenceRef ?? "", /^evidence-ref-/u);
    assert.equal(listed.projection.authorizedForAI.length, 0);

    // 5. Confirm and authorize through the API (revision propagation included).
    const confirmResponse = await handlers.apply(
      new Request(`http://localhost/api/projects/${PROJECT}/facts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          operationId: "integrate-confirm",
          items: [
            {
              assertionId: course.assertionId,
              assertionVersion: course.assertionVersion,
            },
          ],
        }),
      }),
      PROJECT
    );
    assert.equal(confirmResponse.status, 200);
    const confirmedBody = (await confirmResponse.json()) as {
      complete: boolean;
      projection: {
        candidates: Array<{ assertionId: string; assertionVersion: number }>;
      };
    };
    assert.equal(confirmedBody.complete, true);
    const confirmedRow = confirmedBody.projection.candidates.find(
      (row) => row.assertionId === course.assertionId
    );
    assert.ok(confirmedRow);

    const authorizeResponse = await handlers.apply(
      new Request(`http://localhost/api/projects/${PROJECT}/facts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "authorize_for_ai",
          operationId: "integrate-authorize",
          items: [
            {
              assertionId: confirmedRow.assertionId,
              assertionVersion: confirmedRow.assertionVersion,
            },
          ],
        }),
      }),
      PROJECT
    );
    assert.equal(authorizeResponse.status, 200);
    assert.equal(
      ((await authorizeResponse.json()) as { complete: boolean }).complete,
      true
    );

    // 6-7. Another Chat in the same Project resolves the authorized fact, and the fact's
    // excerpt is not among any selected snippets.
    const contextDeps = {
      schemaStatus: async () => "ready" as const,
      getOrigin: async (chatId: string) =>
        chatId === "chat-a" || chatId === "chat-b"
          ? { projectId: PROJECT }
          : null,
      authorize: async (input: { projectId: string }) => ({
        id: input.projectId,
        status: "active" as const,
      }),
      projectChatEnabled: () => true,
      contextEnabled: () => true,
      // R1: the resolver validates the fact's own source through the same proof-checked
      // capability, independently of which excerpts fit the prompt budget.
      verifyEvidenceRef: verifyEvidence,
      stableFacts: async (input: {
        actorUserId: string;
        projectId: string;
      }) => {
        const projection = await facts.stableProjection(input);
        return {
          available: projection.available,
          authorizedForAI: projection.authorizedForAI.map((row) => ({
            assertionId: row.id,
            assertionVersion: row.version,
            key: row.key,
            valueType: row.valueType,
            value: row.value,
            originKind: row.originKind,
            confirmedByUserId: row.confirmedByUserId,
            effectiveFrom: row.effectiveFrom,
            effectiveTo: row.effectiveTo,
            observedAt: row.observedAt,
            sourceEvidenceRef: row.sourceEvidenceRef,
            state: row.state,
            stale: row.stale,
          })),
        };
      },
    };
    const chatB = await resolveProjectContext({
      actorUserId: ACTOR,
      chatId: "chat-b",
      dependencies: contextDeps as never,
    });
    assert.equal(chatB.projectId, PROJECT);
    const [fact] = chatB.packet?.confirmedProjectFacts ?? [];
    assert.equal(fact?.key, "study.course");
    assert.equal(fact?.value, "Bachelor of Information Technology");
    assert.equal(fact?.sourceEvidenceStatus, "verified");
    assert.equal(fact?.sourceExcerptIncluded, false);
    assert.equal(chatB.packet?.documentEvidence.length, 0);

    // 8-9. Revocation removes it from the next resolution.
    await review.revokeAIUse({
      actor: {
        actorUserId: ACTOR,
        projectId: PROJECT,
        expectedProjectRevision: repository.revisionFor(PROJECT),
      },
      operationId: "integrate-revoke",
      items: [
        {
          assertionId: confirmedRow.assertionId,
          assertionVersion: confirmedRow.assertionVersion,
        },
      ],
    });
    const afterRevoke = await resolveProjectContext({
      actorUserId: ACTOR,
      chatId: "chat-b",
      dependencies: contextDeps as never,
    });
    assert.equal(afterRevoke.packet?.confirmedProjectFacts.length ?? 0, 0);

    // 10. Project B and standalone chats never see Project A facts.
    const otherProjectDeps = {
      ...contextDeps,
      getOrigin: async (chatId: string) =>
        chatId === "chat-other" ? { projectId: OTHER_PROJECT } : null,
    };
    const otherProject = await resolveProjectContext({
      actorUserId: ACTOR,
      chatId: "chat-other",
      dependencies: otherProjectDeps as never,
    });
    assert.equal(otherProject.projectId, OTHER_PROJECT);
    assert.equal(otherProject.packet, null);
    const standalone = await resolveProjectContext({
      actorUserId: ACTOR,
      chatId: "chat-standalone",
      dependencies: contextDeps as never,
    });
    assert.equal(standalone.projectId, null);
    assert.equal(standalone.packet, null);
  }
});
