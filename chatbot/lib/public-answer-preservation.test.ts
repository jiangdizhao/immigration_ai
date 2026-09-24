import assert from "node:assert/strict";
import { test } from "node:test";
import { acknowledgedCustomerDocumentProvenance } from "./matter-documents/customer-document-provenance";
import { preservePublicAnswer } from "./public-answer-preservation";

const manifest = [{ documentId: "doc", runId: "run" }];

test("preserved backend answer may retain acknowledged document provenance", () => {
  const answer = preservePublicAnswer({
    backendAnswer: "The letter appears to say this.",
    emptyFallback: "empty fallback",
    forbiddenFallback: "safe fallback",
  });
  assert.deepEqual(answer, {
    text: "The letter appears to say this.",
    preservedBackendAnswer: true,
  });
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(
      manifest,
      true,
      answer.preservedBackendAnswer
    ),
    { used: true, manifest }
  );
});

test("forbidden backend answer replacement removes document provenance", () => {
  const answer = preservePublicAnswer({
    backendAnswer: 'Internal JSON: {"retrieval_debug": true}',
    emptyFallback: "empty fallback",
    forbiddenFallback: "safe fallback",
  });
  assert.deepEqual(answer, {
    text: "safe fallback",
    preservedBackendAnswer: false,
  });
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(
      manifest,
      true,
      answer.preservedBackendAnswer
    ),
    { used: false, manifest: [] }
  );
});

test("empty backend answer fallback removes document provenance", () => {
  const answer = preservePublicAnswer({
    backendAnswer: "  ",
    emptyFallback: "empty fallback",
    forbiddenFallback: "safe fallback",
  });
  assert.deepEqual(answer, {
    text: "empty fallback",
    preservedBackendAnswer: false,
  });
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(
      manifest,
      true,
      answer.preservedBackendAnswer
    ),
    { used: false, manifest: [] }
  );
});

test("backend used=false always removes the manifest", () => {
  assert.deepEqual(
    acknowledgedCustomerDocumentProvenance(manifest, false, true),
    { used: false, manifest: [] }
  );
});
