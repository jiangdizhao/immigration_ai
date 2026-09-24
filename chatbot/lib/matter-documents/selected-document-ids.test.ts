import assert from "node:assert/strict";
import { test } from "node:test";
import { selectedDocumentIdsSchema } from "./selected-document-ids";

const ids = [1, 2, 3, 4, 5].map(
  (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
);
test("selected documents are UUIDs only, default empty, maximum four, no duplicates", () => {
  assert.deepEqual(selectedDocumentIdsSchema.parse(undefined), []);
  assert.deepEqual(
    selectedDocumentIdsSchema.parse(ids.slice(0, 4)),
    ids.slice(0, 4)
  );
  assert.equal(
    selectedDocumentIdsSchema.safeParse(["not-a-uuid"]).success,
    false
  );
  assert.equal(selectedDocumentIdsSchema.safeParse(ids).success, false);
  assert.equal(
    selectedDocumentIdsSchema.safeParse([ids[0], ids[0]]).success,
    false
  );
});
