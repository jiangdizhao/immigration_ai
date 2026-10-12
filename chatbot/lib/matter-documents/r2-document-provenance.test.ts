/**
 * Phase 12 Stage 2 R2-A — per-document provenance and reload precision.
 *
 * Reviewer finding R2-A: routes passed the whole packaged manifest to
 * `acknowledgedCustomerDocumentProvenance()` whenever the backend said a
 * document was used, so one acknowledged document made every packaged file look
 * used. These tests lock the corrected contract:
 *
 *  - five packaged documents + one acknowledged id => exactly that document;
 *  - a forged, cross-conversation or stale id never appears;
 *  - no acknowledgements => nothing is reported as used;
 *  - the id subset still cannot upgrade an unconfirmed backend state;
 *  - reload exposes only the persisted acknowledged subset, while answers stored
 *    before per-document acknowledgements keep exactly what they stored.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acknowledgedCustomerDocumentProvenance,
  customerDocumentUsageState,
  persistedCustomerDocumentManifestForReload,
  persistedCustomerDocumentUsedIds,
} from "./customer-document-provenance";

type Entry = { documentId: string; runId: string; filename: string };

const fivePackaged: Entry[] = [
  { documentId: "doc-1", runId: "run-1", filename: "a.pdf" },
  { documentId: "doc-2", runId: "run-2", filename: "b.pdf" },
  { documentId: "doc-3", runId: "run-3", filename: "c.pdf" },
  { documentId: "doc-4", runId: "run-4", filename: "d.pdf" },
  { documentId: "doc-5", runId: "run-5", filename: "e.pdf" },
];

test("one acknowledged id of five packaged documents claims only that document", () => {
  const provenance = acknowledgedCustomerDocumentProvenance(
    fivePackaged,
    true,
    true,
    ["doc-3"]
  );
  assert.equal(provenance.used, true);
  assert.deepEqual(
    provenance.manifest.map((entry) => entry.documentId),
    ["doc-3"]
  );
});

test("forged, cross-conversation or stale ids are dropped", () => {
  const forged = acknowledgedCustomerDocumentProvenance(
    fivePackaged,
    true,
    true,
    ["doc-1", "other-conversation-doc"]
  );
  assert.deepEqual(
    forged.manifest.map((entry) => entry.documentId),
    ["doc-1"]
  );
  // An id this turn never packaged can never introduce a document.
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(fivePackaged, true, true, [
      "other-conversation-doc",
    ]),
    { used: false, manifest: [] }
  );
  // Non-string / blank ids are ignored.
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(fivePackaged, true, true, [
      7,
      null,
      "  ",
    ]),
    { used: false, manifest: [] }
  );
});

test("no acknowledgement means no used provenance", () => {
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(fivePackaged, true, true, []),
    { used: false, manifest: [] }
  );
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(fivePackaged, true, true, undefined),
    { used: false, manifest: [] }
  );
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(fivePackaged, false, true, [
      "doc-1",
    ]),
    { used: false, manifest: [] }
  );
  // A replaced (forbidden) public answer drops provenance entirely.
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(fivePackaged, true, false, [
      "doc-1",
    ]),
    { used: false, manifest: [] }
  );
});

test("the acknowledged subset never upgrades an unconfirmed usage state", () => {
  const provenance = acknowledgedCustomerDocumentProvenance(
    fivePackaged,
    false,
    true,
    ["doc-1"]
  );
  assert.equal(
    customerDocumentUsageState("supplied_unconfirmed", provenance.used),
    "supplied_unconfirmed"
  );
  assert.equal(
    customerDocumentUsageState("not_supplied", false),
    "not_supplied"
  );
  assert.equal(
    customerDocumentUsageState("supplied_unconfirmed", true),
    "confirmed"
  );
});

test("reload exposes only the persisted acknowledged subset", () => {
  const persisted = {
    documentId: "doc-2",
    runId: "run-2",
    filename: "b.pdf",
  };
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload([...fivePackaged], true, [
      "doc-2",
    ]),
    [persisted]
  );
  // Unused, malformed or unknown-id answers expose nothing.
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload(fivePackaged, false, ["doc-2"]),
    []
  );
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload(fivePackaged, true, ["doc-99"]),
    []
  );
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload(
      [null, "doc-2", { documentId: "doc-2", runId: "run-2" }],
      true,
      ["doc-2"]
    ),
    [{ documentId: "doc-2", runId: "run-2" }]
  );
  // A legacy answer (stored before acknowledgements existed) keeps what it
  // stored; no new answer can reach this path.
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload(fivePackaged, true),
    fivePackaged
  );
});

test("persisted used ids only ever come from the acknowledged subset", () => {
  assert.deepEqual(
    persistedCustomerDocumentUsedIds([{ documentId: "doc-1" }], true),
    ["doc-1"]
  );
  assert.deepEqual(
    persistedCustomerDocumentUsedIds([{ documentId: "doc-1" }], false),
    []
  );
});
