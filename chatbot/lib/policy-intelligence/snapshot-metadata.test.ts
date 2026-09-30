import assert from "node:assert/strict";
import test from "node:test";
import { restoreSnapshotAuditMetadata } from "./snapshot-metadata";

test("snapshot persistence mapping preserves effective date and HTTP audit metadata", () => {
  assert.deepEqual(
    restoreSnapshotAuditMetadata({
      sourceDate: "2026-01-10",
      effectiveDate: "2026-02-01",
      evidenceTruncated: true,
      sourceMetadata: {
        etag: 'W/"version-7"',
        lastModified: "Sat, 10 Jan 2026 02:00:00 GMT",
      },
    }),
    {
      sourceDate: "2026-01-10",
      effectiveDate: "2026-02-01",
      evidenceTruncated: true,
      etag: 'W/"version-7"',
      lastModified: "Sat, 10 Jan 2026 02:00:00 GMT",
    }
  );
});
