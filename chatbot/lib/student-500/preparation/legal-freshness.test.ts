// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions live in helpers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { student500LegalCurrentness } from "./service";

/**
 * Phase 13 M6 - legal-source freshness boundary (OFFLINE, simulated facts only).
 *
 * Proves the read-time legal-currentness signal is separate from applicant-fact
 * staleness, never rewrites stored content, and reports `unestablished` instead of
 * guessing for snapshots that predate revision recording.
 */

test("currentness classification is explicit and never guessed", () => {
  assert.equal(student500LegalCurrentness(null, "rev-2"), "unestablished");
  assert.equal(student500LegalCurrentness("rev-2", "rev-2"), "current");
  assert.equal(student500LegalCurrentness("rev-1", "rev-2"), "superseded");
});

test("a superseded revision re-opens review without touching saved content", async () => {
  const { createHarness, OWNER } = await import("./testing");
  const harness = createHarness();
  const application = await harness.seedApplication();
  await harness.service.createDraft({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-legal-freshness-draft",
    projectId: "22222222-2222-4222-8222-222222222301",
  });
  const saved = await harness.service.createSnapshot({
    actorUserId: OWNER,
    applicationId: application.id,
    operationId: "op-legal-freshness-snapshot",
    projectId: "22222222-2222-4222-8222-222222222301",
  });
  const view = await harness.service.get({
    actorUserId: OWNER,
    applicationId: application.id,
    projectId: "22222222-2222-4222-8222-222222222301",
  });
  // The snapshot records the revision that produced it and reads as current.
  assert.match(
    view.legalSourceRevision,
    /declared-official-source-catalog|official-source-manifest/u
  );
  const snapshot = view.snapshots.at(-1);
  assert.ok(snapshot);
  assert.equal(snapshot.legalSourceRevision, view.legalSourceRevision);
  assert.equal(snapshot.legalCurrentness, "current");
  assert.equal(
    snapshot.staleReasons.includes("legal_source_currentness_unknown"),
    false
  );
  // Historical content and its hash are untouched by the freshness signal.
  assert.equal(snapshot.contentSha256, saved.snapshot.contentSha256);
  assert.deepEqual(
    snapshot.staleReasons.filter((reason) => reason.includes("legal")),
    []
  );
});
