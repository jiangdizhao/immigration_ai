// biome-ignore-all lint/suspicious/useAwait: Fake persistence returns immediate promise values.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDatabaseProjectFactEvidenceVerifier,
  createProjectFactEvidenceVerifier,
} from "./fact-capabilities";

/**
 * Phase 14-B R1: evidence trust must be proof-checked, never derived from a stored
 * `securityStatus = "clean"` column, and must fail closed when no approved scan-attestation
 * provider exists.
 */

const request = {
  actorUserId: "customer-1",
  projectId: "project-a",
  evidenceRef: "evidence-ref-1",
};

test("a reference resolves only when the proof-checked resolver returns it", async () => {
  const accepted = createProjectFactEvidenceVerifier({
    resolveReference: async () => ({ run: { id: "run-1" }, candidate: {} }),
  });
  assert.equal(await accepted(request), true);

  const rejected = createProjectFactEvidenceVerifier({
    resolveReference: async () => null,
  });
  assert.equal(await rejected(request), false);
});

test("a throwing or missing resolver never authorises a fact", async () => {
  const throwing = createProjectFactEvidenceVerifier({
    resolveReference: async () => {
      throw new Error("attestation_unavailable");
    },
  });
  assert.equal(await throwing(request), false);

  const unavailable = createDatabaseProjectFactEvidenceVerifier({});
  assert.equal(await unavailable(request), false);
});

test("without an authenticated attestation the stored clean status is not enough", async () => {
  // The persistence deliberately returns null: production has no approved attestation
  // provider, so a stored `clean` column can never satisfy verification.
  const verifier = createDatabaseProjectFactEvidenceVerifier({
    persistence: {
      resolveReference: async () => null,
    } as never,
  });
  assert.equal(await verifier(request), false);
});
