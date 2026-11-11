import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFactActionBody,
  parseProjectFactsProjection,
} from "./project-facts-view";

/**
 * Phase 14-B Project basic-information view model: the browser only echoes what the
 * server returned, and it can only act on server-provided assertion identities.
 */

const projection = {
  candidates: [
    {
      assertionId: "assertion-1",
      assertionVersion: 3,
      key: "study.course",
      valueType: "string",
      value: "Bachelor of Nursing",
      originKind: "document_extracted",
      sourceEvidenceRef: "evidence-ref-1",
      state: "proposed",
      conflicts: false,
    },
    {
      assertionId: "assertion-2",
      assertionVersion: 1,
      key: "study.campus",
      valueType: "string",
      value: "Sydney",
      originKind: "document_extracted",
      sourceEvidenceRef: "evidence-ref-2",
      state: "customer_confirmed",
      conflicts: true,
    },
    {
      assertionId: "assertion-3",
      assertionVersion: 1,
      key: "visa.category",
      valueType: "string",
      value: "500",
      originKind: "document_extracted",
      sourceEvidenceRef: null,
      state: "rejected",
      conflicts: false,
    },
    // Unusable rows are dropped rather than guessed at.
    {
      assertionId: "",
      assertionVersion: 1,
      key: "x",
      value: "y",
      state: "proposed",
    },
  ],
  authorizedForAI: [
    {
      assertionId: "assertion-4",
      assertionVersion: 2,
      key: "study.school",
      valueType: "string",
      value: "Example Institute",
      effectiveFrom: null,
      effectiveTo: null,
      sourceEvidenceRef: "evidence-ref-3",
    },
  ],
  conflictCount: 1,
};

test("the projection is parsed into reviewable and authorized groups", () => {
  const view = parseProjectFactsProjection(projection);
  assert.ok(view);
  assert.equal(view.candidates.length, 3);
  assert.deepEqual(
    view.actionableCandidates.map((row) => row.assertionId),
    ["assertion-1"]
  );
  assert.deepEqual(
    view.confirmableForAI.map((row) => row.assertionId),
    ["assertion-2"]
  );
  assert.equal(view.authorizedForAI.length, 1);
  assert.equal(view.conflictCount, 1);
  assert.equal(view.candidates[1]?.conflicts, true);
});

test("an unusable or hostile payload yields no view instead of invented facts", () => {
  assert.equal(parseProjectFactsProjection(null), null);
  assert.equal(parseProjectFactsProjection({ candidates: [] }), null);
  assert.deepEqual(
    parseProjectFactsProjection({
      candidates: [
        { assertionId: "a", assertionVersion: 0, key: "k", value: "v" },
      ],
      authorizedForAI: [],
    })?.candidates,
    []
  );
  // Values are shown exactly as returned; nothing is normalised into a different value.
  const view = parseProjectFactsProjection(projection);
  assert.equal(view?.candidates[0]?.value, "Bachelor of Nursing");
});

test("action bodies are built from server rows and never from user input", () => {
  const confirm = buildFactActionBody({
    action: "confirm",
    operationId: "op-1",
    rows: [
      { assertionId: "assertion-1", assertionVersion: 3 },
      { assertionId: "assertion-2", assertionVersion: 1 },
    ],
  });
  assert.deepEqual(confirm, {
    action: "confirm",
    operationId: "op-1",
    items: [
      { assertionId: "assertion-1", assertionVersion: 3 },
      { assertionId: "assertion-2", assertionVersion: 1 },
    ],
  });

  const authorize = buildFactActionBody({
    action: "authorize_for_ai",
    operationId: "op-2",
    rows: [{ assertionId: "assertion-2", assertionVersion: 1 }],
  });
  assert.equal(
    (authorize as { audience?: string } | null)?.audience,
    "actor_only"
  );

  const correction = buildFactActionBody({
    action: "correct",
    operationId: "op-3",
    row: { assertionId: "assertion-1", assertionVersion: 3 },
    correction: {
      key: "study.course",
      valueType: "string",
      value: "  Bachelor of Nursing (Honours)  ",
    },
  });
  assert.deepEqual(correction, {
    action: "correct",
    operationId: "op-3",
    item: { assertionId: "assertion-1", assertionVersion: 3 },
    key: "study.course",
    valueType: "string",
    value: "Bachelor of Nursing (Honours)",
  });

  // Empty or unbounded inputs are refused before any request is made.
  assert.equal(
    buildFactActionBody({ action: "confirm", operationId: "op-4", rows: [] }),
    null
  );
  assert.equal(
    buildFactActionBody({
      action: "correct",
      operationId: "op-5",
      row: { assertionId: "assertion-1", assertionVersion: 3 },
      correction: { key: "study.course", valueType: "date", value: "   " },
    }),
    null
  );
});
