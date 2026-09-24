import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acknowledgedCustomerDocumentProvenance,
  persistedCustomerDocumentManifestForReload,
  shouldClearSelectedDocuments,
} from "./customer-document-provenance";

test("only an explicit legal-service usage acknowledgement retains the manifest", () => {
  const manifest = [{ documentId: "doc", runId: "run" }];
  assert.deepEqual(acknowledgedCustomerDocumentProvenance(manifest, false), {
    used: false,
    manifest: [],
  });
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(manifest, undefined),
    { used: false, manifest: [] }
  );
  assert.deepEqual(acknowledgedCustomerDocumentProvenance(manifest, true), {
    used: true,
    manifest,
  });
});

test("selection clears only with no selected files or acknowledged usage", () => {
  assert.equal(
    shouldClearSelectedDocuments({
      selectedCount: 0,
      customerDocumentEvidenceUsed: false,
    }),
    true
  );
  assert.equal(
    shouldClearSelectedDocuments({
      selectedCount: 2,
      customerDocumentEvidenceUsed: true,
    }),
    true
  );
  assert.equal(
    shouldClearSelectedDocuments({
      selectedCount: 2,
      customerDocumentEvidenceUsed: false,
    }),
    false
  );
});

test("conversation reload exposes only manifests persisted with a usage acknowledgement", () => {
  const manifest = [{ documentId: "doc", runId: "run" }];
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
