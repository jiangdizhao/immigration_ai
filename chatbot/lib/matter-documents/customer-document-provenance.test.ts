import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acknowledgedCustomerDocumentProvenance,
  customerDocumentUsageState,
  persistedCustomerDocumentManifestForReload,
} from "./customer-document-provenance";

const manifest = [{ documentId: "doc", runId: "run" }];

test("R1: an unconfirmed packet is never upgraded to confirmed client-side", () => {
  assert.equal(
    customerDocumentUsageState("supplied_unconfirmed", false),
    "supplied_unconfirmed"
  );
  // Only the backend's verified boolean can produce a confirmed state.
  assert.equal(
    customerDocumentUsageState("supplied_unconfirmed", true),
    "confirmed"
  );
  assert.equal(customerDocumentUsageState(undefined, false), "not_supplied");
  assert.equal(customerDocumentUsageState(null, false), "not_supplied");
  // A client-visible "confirmed" string without the verified boolean is ignored.
  assert.equal(customerDocumentUsageState("confirmed", false), "not_supplied");
  assert.equal(
    customerDocumentUsageState(undefined, undefined),
    "not_supplied"
  );
});

test("manifest requires backend acknowledgement, its ids and a preserved answer", () => {
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(manifest, true, true, ["doc"]),
    { used: true, manifest }
  );
  // R2: a boolean without the acknowledged ids cannot claim any document, and
  // it must never fall back to the whole packaged manifest.
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(manifest, true, true),
    {
      used: false,
      manifest: [],
    }
  );
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(manifest, true, true, ["doc-other"]),
    { used: false, manifest: [] }
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
    persistedCustomerDocumentManifestForReload(manifest, false, ["doc"]),
    []
  );
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload(manifest, undefined, ["doc"]),
    []
  );
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload(manifest, true, ["doc"]),
    manifest
  );
  // R2: only the acknowledged subset is exposed; other packaged files stay out.
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload(manifest, true, ["doc-9"]),
    []
  );
  // Legacy answers (no id list) keep exactly what they stored.
  assert.deepEqual(
    persistedCustomerDocumentManifestForReload(manifest, true),
    manifest
  );
});
