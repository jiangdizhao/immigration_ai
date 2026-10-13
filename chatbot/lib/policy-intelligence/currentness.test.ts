import assert from "node:assert/strict";
import test from "node:test";
import {
  isCurrentPublishedPolicyRevision,
  isPublishedRevisionStaleAgainstLatestSnapshot,
} from "./currentness";

/**
 * Phase 12 Stage 3 — published revision stability (unit level).
 *
 * Scenario 8 of the Stage 3 acceptance set: published V3 → newer source
 * snapshot V4 acquired → AI holds V4 → V3 must remain publicly accessible →
 * the lawyer publishes V4 → V4 becomes current and V3 becomes superseded.
 */

const item = {
  id: "item-1",
  editorialStatus: "published",
  latestSnapshotId: "snap-1",
  latestPublishedRevisionId: "rev-1",
};
const revisionV3 = {
  id: "rev-1",
  itemId: "item-1",
  snapshotId: "snap-1",
  editorialStatus: "published",
};
const snapshotV3 = { id: "snap-1", itemId: "item-1" };

test("an approved published revision is current on its own terms", () => {
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item,
      revision: revisionV3,
      snapshot: snapshotV3,
    }),
    true
  );
  assert.equal(
    isPublishedRevisionStaleAgainstLatestSnapshot({
      item,
      revision: revisionV3,
    }),
    false
  );
});

test("a newer held source snapshot keeps V3 public and reports staleness", () => {
  const heldItem = {
    ...item,
    editorialStatus: "review_required",
    latestSnapshotId: "snap-2",
  };
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: heldItem,
      revision: revisionV3,
      snapshot: snapshotV3,
    }),
    true
  );
  assert.equal(
    isPublishedRevisionStaleAgainstLatestSnapshot({
      item: heldItem,
      revision: revisionV3,
    }),
    true
  );
});

test("publishing V4 makes V4 current and leaves V3 as history", () => {
  const itemV4 = {
    ...item,
    editorialStatus: "published",
    latestSnapshotId: "snap-2",
    latestPublishedRevisionId: "rev-2",
  };
  const revisionV4 = {
    id: "rev-2",
    itemId: "item-1",
    snapshotId: "snap-2",
    editorialStatus: "published",
  };
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: itemV4,
      revision: revisionV4,
      snapshot: { id: "snap-2", itemId: "item-1" },
    }),
    true
  );
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: itemV4,
      revision: revisionV3,
      snapshot: snapshotV3,
    }),
    false
  );
  assert.equal(
    isPublishedRevisionStaleAgainstLatestSnapshot({
      item: itemV4,
      revision: revisionV4,
    }),
    false
  );
});

test("archive suppresses, draft never publishes, and mis-owned pointers fail closed", () => {
  for (const editorialStatus of ["archived", "draft", "review_required"]) {
    if (editorialStatus === "review_required") {
      continue;
    }
    assert.equal(
      isCurrentPublishedPolicyRevision({
        item: { ...item, editorialStatus },
        revision: revisionV3,
        snapshot: snapshotV3,
      }),
      false,
      editorialStatus
    );
  }
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item,
      revision: revisionV3,
      snapshot: { id: "snap-1", itemId: "another-item" },
    }),
    false
  );
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item,
      revision: revisionV3,
      snapshot: null,
    }),
    false
  );
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: { ...item, latestPublishedRevisionId: "rev-9" },
      revision: revisionV3,
      snapshot: snapshotV3,
    }),
    false
  );
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item,
      revision: { ...revisionV3, editorialStatus: "superseded" },
      snapshot: snapshotV3,
    }),
    false
  );
});

test("a lawyer-authored revision has no snapshot and never becomes stale", () => {
  const authored = {
    id: "rev-3",
    itemId: "item-2",
    snapshotId: null,
    editorialStatus: "published",
  };
  const authoredItem = {
    id: "item-2",
    editorialStatus: "published",
    latestSnapshotId: null,
    latestPublishedRevisionId: "rev-3",
  };
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: authoredItem,
      revision: authored,
      snapshot: null,
    }),
    true
  );
  assert.equal(
    isPublishedRevisionStaleAgainstLatestSnapshot({
      item: authoredItem,
      revision: authored,
    }),
    false
  );
  // A lawyer override keeps its base snapshot for provenance: publishing it
  // while the base snapshot is still the latest is not "stale".
  const override = { ...authored, snapshotId: "snap-9" };
  assert.equal(
    isPublishedRevisionStaleAgainstLatestSnapshot({
      item: { ...authoredItem, latestSnapshotId: "snap-9" },
      revision: override,
    }),
    false
  );
  assert.equal(
    isPublishedRevisionStaleAgainstLatestSnapshot({
      item: { ...authoredItem, latestSnapshotId: "snap-10" },
      revision: override,
    }),
    true
  );
});
