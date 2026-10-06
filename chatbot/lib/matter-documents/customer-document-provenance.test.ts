import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acknowledgedCustomerDocumentProvenance,
  persistedCustomerDocumentManifestForReload,
} from "./customer-document-provenance";

const manifest = [{ documentId: "doc", runId: "run" }];

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
