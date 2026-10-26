import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProjectContextPacket,
  mapProjectFactAssertion,
  projectContextRequestPayload,
} from "./project-context";

test("Project packet is bounded, explicit about provenance, and serialized for API schema", () => {
  const packet = buildProjectContextPacket({
    projectId: "project-a",
    facts: [
      {
        assertionId: "assertion-1",
        assertionVersion: 2,
        key: "study.start_date",
        valueType: "date",
        value: "2026-10-26",
        originKind: "customer_stated",
        confirmedByUserId: "customer-a",
        effectiveFrom: null,
        effectiveTo: null,
        observedAt: null,
        sourceEvidenceRef: null,
        state: "customer_confirmed",
        stale: false,
      },
      {
        assertionId: "candidate",
        assertionVersion: 1,
        key: "study.candidate",
        valueType: "string",
        value: "hidden",
        originKind: "ai_inferred",
        confirmedByUserId: null,
        effectiveFrom: null,
        effectiveTo: null,
        observedAt: null,
        sourceEvidenceRef: null,
        state: "proposed",
        stale: false,
      },
    ],
    documentEvidence: [],
  });
  assert.equal(packet.confirmedProjectFacts.length, 1);
  assert.match(
    packet.confirmedProjectFacts[0].verificationLabel,
    /not independently verified/
  );
  const payload = projectContextRequestPayload(packet) as {
    project_context: Record<string, unknown>;
  };
  assert.equal(payload.project_context.project_id, "project-a");
  assert.ok(Array.isArray(payload.project_context.confirmed_project_facts));
  assert.equal("projectId" in payload.project_context, false);
});

test("durable assertion DTO maps its persisted identity and attribution fields", () => {
  const mapped = mapProjectFactAssertion({
    id: "fact-id",
    projectId: "project-a",
    key: "study.start_date",
    valueType: "date",
    value: "2027-02-01",
    normalizedComparison: '"2027-02-01"',
    originKind: "customer_stated",
    state: "customer_confirmed",
    sourceEvidenceRef: null,
    createdByUserId: "creator-a",
    confirmedByUserId: "creator-a",
    effectiveFrom: null,
    effectiveTo: null,
    observedAt: null,
    supersedesAssertionId: null,
    version: 4,
    stale: false,
  });
  assert.equal(mapped.assertionId, "fact-id");
  assert.equal(mapped.assertionVersion, 4);
  assert.equal(mapped.confirmedByUserId, "creator-a");
});

test("Project document packet drops malformed or over-bounded locators", () => {
  const packet = buildProjectContextPacket({
    projectId: "project-a",
    facts: [],
    documentEvidence: [
      {
        evidenceRef: "evidence-1",
        versionId: "version-1",
        runId: "run-1",
        mimeType: "text/plain",
        locator: { source: "x".repeat(257) },
        excerpt: "safe bounded excerpt",
        contentUntrusted: true,
      },
    ],
  });
  assert.equal(packet.documentEvidence.length, 0);
});
