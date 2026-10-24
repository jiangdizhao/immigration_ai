import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalProjectOperationRequest,
  hashProjectOperationRequest,
  ProjectFoundationError,
  resolveProjectOperationReplay,
  validateProjectOperationId,
} from "./project-foundation-utils";

test("canonical project operation requests sort object keys recursively", () => {
  assert.equal(
    canonicalProjectOperationRequest({ z: 1, nested: { y: true, x: "ok" } }),
    '{"nested":{"x":"ok","y":true},"z":1}'
  );
  assert.equal(
    hashProjectOperationRequest({ title: "New conversation", projectId: "p1" }),
    hashProjectOperationRequest({ projectId: "p1", title: "New conversation" })
  );
  assert.notEqual(
    hashProjectOperationRequest({ projectId: "p1", title: "A" }),
    hashProjectOperationRequest({ projectId: "p1", title: "B" })
  );
});

test("operation identifiers follow the bounded repository contract", () => {
  assert.equal(
    validateProjectOperationId("request-123:retry.1"),
    "request-123:retry.1"
  );
  assert.equal(validateProjectOperationId(`a${"b".repeat(127)}`).length, 128);

  for (const invalid of ["", " starts-with-space", "a".repeat(129), "a/b"]) {
    assert.throws(
      () => validateProjectOperationId(invalid),
      (error: unknown) =>
        error instanceof ProjectFoundationError &&
        error.code === "invalid_operation_id"
    );
  }
});

test("canonical request hashing rejects non-JSON and cyclic input", () => {
  assert.throws(() => hashProjectOperationRequest({ value: undefined }));
  assert.throws(() => hashProjectOperationRequest({ value: Number.NaN }));

  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.throws(
    () => canonicalProjectOperationRequest(cyclic),
    (error: unknown) =>
      error instanceof ProjectFoundationError &&
      error.code === "invalid_request"
  );
});

test("operation replay resolves only an identical typed outcome", () => {
  const existing = {
    requestHash: "a".repeat(64),
    resultId: "resource-1",
    resultKind: "chat",
  };
  assert.deepEqual(
    resolveProjectOperationReplay(existing, {
      requestHash: "a".repeat(64),
      resultKind: "chat",
    }),
    { resultId: "resource-1", resultKind: "chat", replayed: true }
  );
  assert.throws(
    () =>
      resolveProjectOperationReplay(existing, {
        requestHash: "b".repeat(64),
        resultKind: "chat",
      }),
    (error: unknown) =>
      error instanceof ProjectFoundationError &&
      error.code === "idempotency_conflict"
  );
  assert.throws(
    () =>
      resolveProjectOperationReplay(existing, {
        requestHash: "a".repeat(64),
        resultKind: "project",
      }),
    (error: unknown) =>
      error instanceof ProjectFoundationError &&
      error.code === "idempotency_conflict"
  );
});
