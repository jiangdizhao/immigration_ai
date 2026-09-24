import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acknowledgedCustomerDocumentProvenance,
  customerDocumentSelectionAfterSubmission,
  persistedCustomerDocumentManifestForReload,
} from "./customer-document-provenance";

const manifest = [{ documentId: "doc", runId: "run" }];

test("ordinary submit with selected docs clears only after acknowledged use", () => {
  assert.deepEqual(
    customerDocumentSelectionAfterSubmission({
      selectedCount: 1,
      customerDocumentEvidenceUsed: true,
      submissionKind: "message",
    }),
    { clearSelection: true, warnUnused: false }
  );
  assert.deepEqual(
    customerDocumentSelectionAfterSubmission({
      selectedCount: 1,
      customerDocumentEvidenceUsed: false,
      submissionKind: "message",
    }),
    { clearSelection: false, warnUnused: true }
  );
});

test("guided-intake submit uses the same selected-document rule", () => {
  assert.deepEqual(
    customerDocumentSelectionAfterSubmission({
      selectedCount: 2,
      customerDocumentEvidenceUsed: true,
      submissionKind: "guided_intake",
    }),
    { clearSelection: true, warnUnused: false }
  );
  assert.deepEqual(
    customerDocumentSelectionAfterSubmission({
      selectedCount: 2,
      customerDocumentEvidenceUsed: false,
      submissionKind: "guided_intake",
    }),
    { clearSelection: false, warnUnused: true }
  );
});

test("political-gate blocks preserve selected docs without warning", () => {
  assert.deepEqual(
    customerDocumentSelectionAfterSubmission({
      selectedCount: 2,
      customerDocumentEvidenceUsed: true,
      submissionKind: "political_block",
    }),
    { clearSelection: false, warnUnused: false }
  );
});

test("manifest requires backend acknowledgement and preservation of its answer", () => {
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(manifest, true, true),
    { used: true, manifest }
  );
  // Forbidden-answer public replacement.
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(manifest, true, false),
    { used: false, manifest: [] }
  );
  // Empty-answer route fallback.
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(manifest, true, false),
    { used: false, manifest: [] }
  );
  // A backend false value always removes the manifest, even if its answer was preserved.
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(manifest, false, true),
    { used: false, manifest: [] }
  );
});

test("conversation reload exposes only actually persisted used provenance", () => {
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload(manifest, false),
    []
  );
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload(manifest, undefined),
    []
  );
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload(manifest, true),
    manifest
  );
});
