// biome-ignore-all lint/suspicious/useAwait: Test fakes resolve immediately.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectFactManagementService } from "./facts";
import { createProjectFactReviewService } from "./review";
import { StrictFactRepository } from "./strict-repository";

/**
 * Phase 14-B R1-01 / R1-02 regression suite.
 *
 * These tests run the real fact service and review orchestration against
 * `StrictFactRepository`, which advances the Project revision by one per mutation and
 * rejects stale revisions exactly like `PostgresProjectFactRepository`. A permissive fake
 * would have hidden the original defects.
 */

const PROJECT = "project-a";
const ACTOR = "customer-1";

function setup(initialRevision = 10) {
  const repository = new StrictFactRepository(initialRevision);
  const facts = createProjectFactManagementService({
    repository,
    verifyEvidence: async (input) =>
      repository.verifiedEvidenceRefs.has(input.evidenceRef),
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
  const actor = () => ({
    actorUserId: ACTOR,
    projectId: PROJECT,
    expectedProjectRevision: repository.revisionFor(PROJECT),
  });
  return { repository, facts, review, actor };
}

async function proposeStated(
  facts: ReturnType<typeof createProjectFactManagementService>,
  repository: StrictFactRepository,
  input: { key: string; value: string; operationId: string }
) {
  return await facts.propose({
    actorUserId: ACTOR,
    projectId: PROJECT,
    operationId: input.operationId,
    expectedProjectRevision: repository.revisionFor(PROJECT),
    key: input.key,
    valueType: "string",
    value: input.value,
    originKind: "customer_stated",
    sourceEvidenceRef: null,
  });
}

test("batch confirmation advances the revision between writes instead of reusing a stale one", async () => {
  const { repository, facts, review, actor } = setup(10);
  const first = await proposeStated(facts, repository, {
    key: "study.course",
    value: "Bachelor of Nursing",
    operationId: "seed-1",
  });
  const second = await proposeStated(facts, repository, {
    key: "study.campus",
    value: "Sydney",
    operationId: "seed-2",
  });
  const revisionBefore = repository.revisionFor(PROJECT);
  assert.equal(revisionBefore, 12);

  const result = await review.confirmMany({
    actor: actor(),
    operationId: "confirm-batch-1",
    items: [
      { assertionId: first.id, assertionVersion: first.version },
      { assertionId: second.id, assertionVersion: second.version },
    ],
  });

  assert.equal(result.complete, true, JSON.stringify(result.failures));
  assert.equal(result.failures.length, 0);
  assert.deepEqual(
    result.completed.map((row) => row.state),
    ["customer_confirmed", "customer_confirmed"]
  );
  assert.equal(result.sawRevisionConflict, false);
  // One revision advance per confirmation, none lost.
  assert.equal(repository.revisionFor(PROJECT), revisionBefore + 2);
});

test("confirm, publish and authorize complete in one customer workflow", async () => {
  const { repository, facts, review, actor } = setup(5);
  const fact = await proposeStated(facts, repository, {
    key: "study.course",
    value: "Bachelor of Nursing",
    operationId: "seed-wf",
  });
  const confirmed = await review.confirmMany({
    actor: actor(),
    operationId: "wf-confirm",
    items: [{ assertionId: fact.id, assertionVersion: fact.version }],
  });
  assert.equal(confirmed.complete, true);
  const confirmedRow = confirmed.completed[0];
  assert.ok(confirmedRow);

  const authorized = await review.authorizeForAI({
    actor: actor(),
    operationId: "wf-authorize",
    items: [
      { assertionId: confirmedRow.id, assertionVersion: confirmedRow.version },
    ],
    audience: "actor_only",
  });
  assert.equal(authorized.complete, true, JSON.stringify(authorized.failures));
  assert.equal(authorized.publications.length, 1);
  assert.equal(authorized.grants.length, 1);

  const projection = await facts.stableProjection({
    actorUserId: ACTOR,
    projectId: PROJECT,
  });
  assert.equal(projection.authorizedForAI.length, 1);
});

test("batch authorization publishes and grants every confirmed fact", async () => {
  const { repository, facts, review, actor } = setup(3);
  const rows = [
    await proposeStated(facts, repository, {
      key: "study.course",
      value: "Bachelor of Nursing",
      operationId: "seed-a",
    }),
    await proposeStated(facts, repository, {
      key: "study.campus",
      value: "Sydney",
      operationId: "seed-b",
    }),
    await proposeStated(facts, repository, {
      key: "study.school",
      value: "Example Institute",
      operationId: "seed-c",
    }),
  ];
  const confirmed = await review.confirmMany({
    actor: actor(),
    operationId: "batch-confirm",
    items: rows.map((row) => ({
      assertionId: row.id,
      assertionVersion: row.version,
    })),
  });
  assert.equal(confirmed.complete, true, JSON.stringify(confirmed.failures));

  const authorized = await review.authorizeForAI({
    actor: actor(),
    operationId: "batch-authorize",
    items: confirmed.completed.map((row) => ({
      assertionId: row.id,
      assertionVersion: row.version,
    })),
    audience: "actor_only",
  });
  assert.equal(authorized.complete, true, JSON.stringify(authorized.failures));
  assert.equal(authorized.publications.length, 3);
  assert.equal(authorized.grants.length, 3);
  assert.ok(authorized.grants.every((grant) => grant.purpose === "ai_context"));
});

test("an idempotent replay writes nothing twice and does not advance the revision", async () => {
  const { repository, facts, review, actor } = setup(7);
  const fact = await proposeStated(facts, repository, {
    key: "study.course",
    value: "Bachelor of Nursing",
    operationId: "seed-replay",
  });
  const request = {
    actor: actor(),
    operationId: "replay-confirm",
    items: [{ assertionId: fact.id, assertionVersion: fact.version }],
  };
  const first = await review.confirmMany(request);
  assert.equal(first.complete, true);
  const revisionAfterFirst = repository.revisionFor(PROJECT);

  const replay = await review.confirmMany(request);
  assert.equal(replay.complete, true);
  assert.equal(replay.completed.length, 1);
  assert.equal(repository.revisionFor(PROJECT), revisionAfterFirst);
  assert.equal(repository.assertions.length, 1);
  assert.equal(replay.completed[0]?.state, "customer_confirmed");
  assert.ok(
    repository.mutationLog.some((entry) => entry.replayed && entry.ok),
    "the replay must be visible as a replay, not a new mutation"
  );
});

test("a concurrent Project mutation is retried once, not silently dropped", async () => {
  const { repository, facts, review, actor } = setup(4);
  const fact = await proposeStated(facts, repository, {
    key: "study.course",
    value: "Bachelor of Nursing",
    operationId: "seed-race",
  });
  const request = {
    actor: actor(),
    operationId: "race-confirm",
    items: [{ assertionId: fact.id, assertionVersion: fact.version }],
  };
  // Another writer advances the Project revision before the confirmation lands.
  repository.externalMutationBeforeNextWrite = () => repository.bumpRevision();
  const result = await review.confirmMany(request);
  assert.equal(result.complete, true, JSON.stringify(result.failures));
  assert.equal(result.sawRevisionConflict, true);
  assert.equal(repository.assertions[0]?.state, "customer_confirmed");
});

test("a failure after confirmation is reported as incomplete instead of authorized", async () => {
  const { repository, facts, review, actor } = setup(2);
  const rows = [
    await proposeStated(facts, repository, {
      key: "study.course",
      value: "Bachelor of Nursing",
      operationId: "f-seed-a",
    }),
    await proposeStated(facts, repository, {
      key: "study.campus",
      value: "Sydney",
      operationId: "f-seed-b",
    }),
  ];
  const confirmed = await review.confirmMany({
    actor: actor(),
    operationId: "f-confirm",
    items: rows.map((row) => ({
      assertionId: row.id,
      assertionVersion: row.version,
    })),
  });
  assert.equal(confirmed.complete, true);
  const items = confirmed.completed.map((row) => ({
    assertionId: row.id,
    assertionVersion: row.version,
  }));

  // The second fact's AI-use grant fails after its publication succeeded.
  const failingGrant = `authorize-partial:grant-${items[1]?.assertionId}`;
  repository.failOperation = (operationId) =>
    operationId === failingGrant
      ? Object.assign(new Error("invalid_request"), { code: "invalid_request" })
      : null;

  const authorized = await review.authorizeForAI({
    actor: actor(),
    operationId: "authorize-partial",
    items,
    audience: "actor_only",
  });

  assert.equal(authorized.complete, false);
  assert.equal(authorized.grants.length, 1);
  assert.equal(authorized.publications.length, 2);
  assert.equal(authorized.failures.length, 1);
  assert.equal(authorized.failures[0]?.assertionId, items[1]?.assertionId);
  assert.match(authorized.failures[0]?.code ?? "", /invalid_request/u);

  // Only the fact whose grant was written is actually available to Project AI.
  const projection = await facts.stableProjection({
    actorUserId: ACTOR,
    projectId: PROJECT,
  });
  assert.equal(projection.authorizedForAI.length, 1);
  assert.equal(projection.authorizedForAI[0]?.id, items[0]?.assertionId);
});

test("correction supersedes before replacing, so no supersession conflict occurs", async () => {
  const { repository, facts, review, actor } = setup(6);
  const original = await proposeStated(facts, repository, {
    key: "study.course",
    value: "Bachelor of Nursing",
    operationId: "c-seed",
  });

  const result = await review.correct({
    actor: actor(),
    operationId: "correct-1",
    item: { assertionId: original.id, assertionVersion: original.version },
    key: "study.course",
    valueType: "string",
    value: "Bachelor of Nursing (Honours)",
  });

  assert.equal(result.status, "corrected", result.code ?? "");
  assert.equal(result.created?.originKind, "customer_stated");
  assert.equal(result.created?.supersedesAssertionId, original.id);
  assert.equal(result.created?.sourceEvidenceRef, null);
  assert.equal(result.created?.state, "proposed");
  assert.equal(result.superseded?.state, "superseded");
  // History is preserved: both assertions exist with their original values.
  assert.equal(repository.assertions.length, 2);
  const kept = repository.assertions.find((row) => row.id === original.id);
  assert.equal(kept?.value, "Bachelor of Nursing");
  assert.equal(kept?.state, "superseded");
  // A correction never publishes or AI-authorizes the replacement on its own.
  assert.equal(repository.publications.length, 0);
  assert.equal(repository.grants.length, 0);
});

test("correcting a confirmed, AI-authorized fact drops it from AI context until reconfirmed", async () => {
  const { repository, facts, review, actor } = setup(8);
  const original = await proposeStated(facts, repository, {
    key: "study.course",
    value: "Bachelor of Nursing",
    operationId: "cc-seed",
  });
  const confirmed = await review.confirmMany({
    actor: actor(),
    operationId: "cc-confirm",
    items: [{ assertionId: original.id, assertionVersion: original.version }],
  });
  const confirmedRow = confirmed.completed[0];
  assert.ok(confirmedRow);
  await review.authorizeForAI({
    actor: actor(),
    operationId: "cc-authorize",
    items: [
      { assertionId: confirmedRow.id, assertionVersion: confirmedRow.version },
    ],
    audience: "actor_only",
  });
  assert.equal(
    (await facts.stableProjection({ actorUserId: ACTOR, projectId: PROJECT }))
      .authorizedForAI.length,
    1
  );

  const corrected = await review.correct({
    actor: actor(),
    operationId: "cc-correct",
    item: {
      assertionId: confirmedRow.id,
      assertionVersion: confirmedRow.version,
    },
    key: "study.course",
    valueType: "string",
    value: "Bachelor of Nursing (Honours)",
  });
  assert.equal(corrected.status, "corrected", corrected.code ?? "");

  // The superseded original loses its publication and grant immediately; the replacement is
  // only a proposal until the customer confirms and authorizes it explicitly.
  const projection = await facts.stableProjection({
    actorUserId: ACTOR,
    projectId: PROJECT,
  });
  assert.equal(projection.authorizedForAI.length, 0);
  assert.ok(repository.grants.every((grant) => !grant.active));
});

test("a correction that loses its revision mid-flight is recoverable by replay", async () => {
  const { repository, facts, review, actor } = setup(9);
  const original = await proposeStated(facts, repository, {
    key: "study.course",
    value: "Bachelor of Nursing",
    operationId: "cr-seed",
  });

  // The replacement proposal is rejected the first time it is attempted.
  repository.failOperation = (operationId) =>
    operationId === "cr-correct:correct-create"
      ? Object.assign(new Error("evidence_unverified"), {
          code: "evidence_unverified",
        })
      : null;

  const failed = await review.correct({
    actor: actor(),
    operationId: "cr-correct",
    item: { assertionId: original.id, assertionVersion: original.version },
    key: "study.course",
    valueType: "string",
    value: "Bachelor of Nursing (Honours)",
  });
  assert.equal(failed.status, "replacement_missing");
  assert.equal(failed.superseded?.state, "superseded");
  assert.equal(failed.created, null);
  // The original is never served again, and no half-written replacement exists.
  assert.equal(repository.assertions.length, 1);

  // Retrying the same operation id completes the replacement without duplicating history.
  repository.failOperation = null;
  const retried = await review.correct({
    actor: actor(),
    operationId: "cr-correct",
    item: { assertionId: original.id, assertionVersion: original.version },
    key: "study.course",
    valueType: "string",
    value: "Bachelor of Nursing (Honours)",
  });
  assert.equal(retried.status, "corrected", retried.code ?? "");
  assert.equal(repository.assertions.length, 2);
  assert.equal(
    repository.assertions.filter((row) => row.state === "superseded").length,
    1
  );
});

test("a document fact keeps its evidence provenance through confirmation and correction", async () => {
  const { repository, facts, review, actor } = setup(11);
  repository.verifiedEvidenceRefs.add("evidence-ref-coe-1");
  const documentFact = await facts.propose({
    actorUserId: ACTOR,
    projectId: PROJECT,
    operationId: "doc-seed",
    expectedProjectRevision: repository.revisionFor(PROJECT),
    key: "study.course",
    valueType: "string",
    value: "Bachelor of Information Technology",
    originKind: "document_extracted",
    sourceEvidenceRef: "evidence-ref-coe-1",
  });
  assert.equal(documentFact.sourceEvidenceRef, "evidence-ref-coe-1");

  const confirmed = await review.confirmMany({
    actor: actor(),
    operationId: "doc-confirm",
    items: [
      { assertionId: documentFact.id, assertionVersion: documentFact.version },
    ],
  });
  assert.equal(confirmed.complete, true, JSON.stringify(confirmed.failures));
  assert.equal(confirmed.completed[0]?.sourceEvidenceRef, "evidence-ref-coe-1");

  // Correcting replaces the value with a customer statement but keeps the original row,
  // its evidence reference and its audit trail.
  const confirmedRow = confirmed.completed[0];
  assert.ok(confirmedRow);
  const corrected = await review.correct({
    actor: actor(),
    operationId: "doc-correct",
    item: {
      assertionId: confirmedRow.id,
      assertionVersion: confirmedRow.version,
    },
    key: "study.course",
    valueType: "string",
    value: "Bachelor of Information Technology (Honours)",
  });
  assert.equal(corrected.status, "corrected", corrected.code ?? "");
  const historical = repository.assertions.find(
    (row) => row.id === documentFact.id
  );
  assert.equal(historical?.sourceEvidenceRef, "evidence-ref-coe-1");
  assert.equal(historical?.state, "superseded");
  assert.equal(corrected.created?.sourceEvidenceRef, null);
  assert.equal(corrected.created?.supersedesAssertionId, documentFact.id);
});

test("rejecting candidates keeps them out of AI context", async () => {
  const { repository, facts, review, actor } = setup(4);
  const rows = [
    await proposeStated(facts, repository, {
      key: "study.course",
      value: "Bachelor of Nursing",
      operationId: "r-seed-a",
    }),
    await proposeStated(facts, repository, {
      key: "study.campus",
      value: "Sydney",
      operationId: "r-seed-b",
    }),
  ];
  const rejected = await review.rejectMany({
    actor: actor(),
    operationId: "reject-batch",
    items: rows.map((row) => ({
      assertionId: row.id,
      assertionVersion: row.version,
    })),
  });
  assert.equal(rejected.complete, true, JSON.stringify(rejected.failures));
  assert.deepEqual(
    rejected.completed.map((row) => row.state),
    ["rejected", "rejected"]
  );
  const projection = await facts.stableProjection({
    actorUserId: ACTOR,
    projectId: PROJECT,
  });
  assert.equal(projection.authorizedForAI.length, 0);
});
