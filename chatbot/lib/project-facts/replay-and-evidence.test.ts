// biome-ignore-all lint/suspicious/useAwait: Test fakes resolve immediately.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectFactManagementService } from "./facts";
import { createProjectFactHandlers } from "./http";
import {
  factMutationRequestHash,
  factTransitionRequestHash,
} from "./request-identity";
import { createProjectFactReviewService } from "./review";
import { StrictFactRepository } from "./strict-repository";

/**
 * Phase 14-B final R1 contract alignment.
 *
 * These tests reproduce the precise failures found in review against the *PostgreSQL*
 * contract, using the shared request-identity helper that the SQL repository itself uses:
 * replay across a changed Project revision, repository-level evidence rejection, supersession
 * status precision and stable-projection verification.
 */

const PROJECT = "project-a";
const ACTOR = "customer-1";

function setup(initialRevision = 4) {
  const repository = new StrictFactRepository(initialRevision);
  const facts = createProjectFactManagementService({
    repository,
    verifyEvidence: async (input) =>
      repository.verifiedEvidenceRefs.has(input.evidenceRef) ||
      Boolean(
        repository.verifyEvidence &&
          (await repository.verifyEvidence(input.evidenceRef))
      ),
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
  return { repository, facts, review };
}

test("the mutation identity excludes the coordination revision but keeps the payload", () => {
  const payload = {
    actorUserId: ACTOR,
    projectId: PROJECT,
    operationId: "op-1",
    expectedProjectRevision: 10,
    key: "study.course",
    value: "Nursing",
  };
  const later = { ...payload, expectedProjectRevision: 11 };
  assert.equal(
    factMutationRequestHash(payload),
    factMutationRequestHash(later)
  );
  assert.notEqual(
    factMutationRequestHash(payload),
    factMutationRequestHash({ ...payload, value: "Dentistry" })
  );
  assert.notEqual(
    factTransitionRequestHash({ to: "superseded", assertionId: "a" }),
    factTransitionRequestHash({ to: "customer_confirmed", assertionId: "a" })
  );
});

test("a retry from a new HTTP request with a changed revision replays instead of conflicting", async () => {
  const { repository, facts, review } = setup(6);
  const fact = await facts.propose({
    actorUserId: ACTOR,
    projectId: PROJECT,
    operationId: "seed",
    expectedProjectRevision: repository.revisionFor(PROJECT),
    key: "study.course",
    valueType: "string",
    value: "Nursing",
    originKind: "customer_stated",
    sourceEvidenceRef: null,
  });

  const handlers = createProjectFactHandlers({
    authenticate: async () => ({ userId: ACTOR, type: "regular" }),
    isRegisteredCustomer: async () => true,
    schemaAvailable: async () => true,
    featureEnabled: () => true,
    authorize: async (input) => ({
      id: input.projectId,
      status: "active",
      revision: repository.revisionFor(input.projectId),
    }),
    projection: async () => null,
    review,
  });
  const confirm = () => {
    return handlers.apply(
      new Request(`http://localhost/api/projects/${PROJECT}/facts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          operationId: "confirm-1",
          items: [{ assertionId: fact.id, assertionVersion: fact.version }],
        }),
      }),
      PROJECT
    );
  };

  assert.equal((await confirm()).status, 200);
  // Another request advances the Project revision before the client retries.
  repository.bumpRevision();
  const retry = await confirm();
  assert.equal(retry.status, 200);
  const body = (await retry.json()) as { complete: boolean };
  assert.equal(body.complete, true);
  assert.equal(repository.assertions.length, 1);
  assert.equal(repository.assertions[0]?.state, "customer_confirmed");
});

test("a failure before supersession leaves the original untouched and reports it precisely", async () => {
  const { repository, facts, review } = setup(3);
  const original = await facts.propose({
    actorUserId: ACTOR,
    projectId: PROJECT,
    operationId: "seed-2",
    expectedProjectRevision: repository.revisionFor(PROJECT),
    key: "study.course",
    valueType: "string",
    value: "Nursing",
    originKind: "customer_stated",
    sourceEvidenceRef: null,
  });
  repository.failOperation = (operationId) =>
    operationId.startsWith("c2:correct-supersede")
      ? Object.assign(new Error("forbidden"), { code: "forbidden" })
      : null;

  const result = await review.correct({
    actor: {
      actorUserId: ACTOR,
      projectId: PROJECT,
      expectedProjectRevision: repository.revisionFor(PROJECT),
    },
    operationId: "c2",
    item: { assertionId: original.id, assertionVersion: original.version },
    key: "study.course",
    valueType: "string",
    value: "Dentistry",
  });

  assert.equal(result.status, "failed_before_supersession");
  assert.equal(result.superseded, null);
  assert.equal(result.created, null);
  const kept = repository.assertions.find((row) => row.id === original.id);
  assert.equal(kept?.state, "proposed");
  assert.equal(kept?.value, "Nursing");
  assert.equal(repository.assertions.length, 1);
});

test("a failure after supersession reports the missing replacement and stays recoverable", async () => {
  const { repository, facts, review } = setup(2);
  const original = await facts.propose({
    actorUserId: ACTOR,
    projectId: PROJECT,
    operationId: "seed-3",
    expectedProjectRevision: repository.revisionFor(PROJECT),
    key: "study.course",
    valueType: "string",
    value: "Nursing",
    originKind: "customer_stated",
    sourceEvidenceRef: null,
  });
  repository.failOperation = (operationId) =>
    operationId === "c3:correct-create"
      ? Object.assign(new Error("evidence_unverified"), {
          code: "evidence_unverified",
        })
      : null;

  const failed = await review.correct({
    actor: {
      actorUserId: ACTOR,
      projectId: PROJECT,
      expectedProjectRevision: repository.revisionFor(PROJECT),
    },
    operationId: "c3",
    item: { assertionId: original.id, assertionVersion: original.version },
    key: "study.course",
    valueType: "string",
    value: "Dentistry",
  });
  assert.equal(failed.status, "replacement_missing");
  assert.equal(failed.superseded?.state, "superseded");
  assert.equal(repository.assertions.length, 1);

  // Retry from a later request (revision has advanced) completes the replacement.
  repository.failOperation = null;
  const retried = await review.correct({
    actor: {
      actorUserId: ACTOR,
      projectId: PROJECT,
      expectedProjectRevision: repository.revisionFor(PROJECT),
    },
    operationId: "c3",
    item: { assertionId: original.id, assertionVersion: original.version },
    key: "study.course",
    valueType: "string",
    value: "Dentistry",
  });
  assert.equal(retried.status, "corrected", retried.code ?? "");
  assert.equal(repository.assertions.length, 2);
  assert.equal(
    repository.assertions.filter((row) => row.state === "superseded").length,
    1
  );
});

test("the repository itself rejects a document fact whose evidence is not verified", async () => {
  const { repository, facts } = setup(1);
  // Service-level verification is deliberately made permissive here to prove that the
  // repository's own gate independently rejects the candidate.
  const permissiveService = createProjectFactManagementService({
    repository,
    verifyEvidence: async () => true,
  });
  await assert.rejects(
    permissiveService.propose({
      actorUserId: ACTOR,
      projectId: PROJECT,
      operationId: "repo-gate",
      expectedProjectRevision: repository.revisionFor(PROJECT),
      key: "study.course",
      valueType: "string",
      value: "Nursing",
      originKind: "document_extracted",
      sourceEvidenceRef: "evidence-ref-unverified",
    }),
    { code: "evidence_unverified" }
  );
  assert.equal(repository.assertions.length, 0);
  // And a verified reference is accepted.
  repository.verifiedEvidenceRefs.add("evidence-ref-verified");
  const accepted = await facts.propose({
    actorUserId: ACTOR,
    projectId: PROJECT,
    operationId: "repo-gate-ok",
    expectedProjectRevision: repository.revisionFor(PROJECT),
    key: "study.course",
    valueType: "string",
    value: "Nursing",
    originKind: "document_extracted",
    sourceEvidenceRef: "evidence-ref-verified",
  });
  assert.equal(accepted.sourceEvidenceRef, "evidence-ref-verified");
});

test("stable projection excludes document facts until the verifier accepts them", async () => {
  const { repository, facts } = setup(1);
  repository.verifiedEvidenceRefs.add("evidence-ref-coe");
  const proposed = await facts.propose({
    actorUserId: ACTOR,
    projectId: PROJECT,
    operationId: "proj-seed",
    expectedProjectRevision: repository.revisionFor(PROJECT),
    key: "study.course",
    valueType: "string",
    value: "Nursing",
    originKind: "document_extracted",
    sourceEvidenceRef: "evidence-ref-coe",
  });
  await facts.confirm({
    actorUserId: ACTOR,
    projectId: PROJECT,
    operationId: "proj-confirm",
    expectedProjectRevision: repository.revisionFor(PROJECT),
    assertionId: proposed.id,
    assertionVersion: proposed.version,
  });
  const confirmedRow = repository.assertions[0];
  assert.ok(confirmedRow);
  await facts.publish({
    actorUserId: ACTOR,
    projectId: PROJECT,
    operationId: "proj-publish",
    expectedProjectRevision: repository.revisionFor(PROJECT),
    assertionId: confirmedRow.id,
    assertionVersion: confirmedRow.version,
    audience: "actor_only",
  });
  await facts.grantAIUse({
    actorUserId: ACTOR,
    projectId: PROJECT,
    operationId: "proj-grant",
    expectedProjectRevision: repository.revisionFor(PROJECT),
    assertionId: confirmedRow.id,
    assertionVersion: confirmedRow.version,
    audience: "actor_only",
  });

  const withVerifier = await facts.stableProjection({
    actorUserId: ACTOR,
    projectId: PROJECT,
  });
  assert.equal(withVerifier.authorizedForAI.length, 1);

  // The same rows with a verifier that no longer accepts the reference: the projection must
  // drop the fact *before* the packet builder runs.
  const withoutVerifier = createProjectFactManagementService({
    repository,
    verifyEvidence: async () => false,
  });
  const filtered = await withoutVerifier.stableProjection({
    actorUserId: ACTOR,
    projectId: PROJECT,
  });
  assert.equal(filtered.authorizedForAI.length, 0);
});
