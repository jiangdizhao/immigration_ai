/*
 * Phase 12 Stage 3 — publication truth vs. source recency.
 *
 * Stage 1 originally coupled "publicly current" to the item's *latest source
 * snapshot*, so acquiring a newer snapshot (even one whose analysis was held
 * for review) silently removed the previously approved published revision from
 * the public feed. That coupling is removed here:
 *
 * - A revision is publicly current when it is the item's published revision,
 *   the item is not archived/draft, and — for revisions that refer to a source
 *   snapshot — that snapshot exists and belongs to the item.
 * - Whether a newer source snapshot exists is reported separately as a
 *   *currentness signal* (`isPublishedRevisionStaleAgainstLatestSnapshot`), so
 *   a published page can honestly warn that newer source material is awaiting
 *   review without disappearing.
 * - Archive suppression is preserved: an archived item is never current.
 */

type CurrentItem = {
  id: string;
  editorialStatus: string;
  latestSnapshotId: string | null;
  latestPublishedRevisionId: string | null;
};

type CurrentRevision = {
  id: string;
  itemId: string;
  snapshotId: string | null;
  editorialStatus: string;
};

type JoinedSnapshot = {
  id: string;
  itemId: string;
} | null;

export function isCurrentPublishedPolicyRevision(input: {
  item: CurrentItem;
  revision: CurrentRevision;
  snapshot: JoinedSnapshot;
}): boolean {
  const { item, revision, snapshot } = input;
  if (
    item.editorialStatus !== "published" &&
    item.editorialStatus !== "review_required"
  ) {
    return false;
  }
  if (item.latestPublishedRevisionId !== revision.id) {
    return false;
  }
  if (revision.editorialStatus !== "published") {
    return false;
  }
  if (revision.itemId !== item.id) {
    return false;
  }
  if (revision.snapshotId === null) {
    // A fully human-authored revision has no source snapshot. That is a
    // legitimate state, not a failed identity check.
    return true;
  }
  return (
    snapshot !== null &&
    snapshot.id === revision.snapshotId &&
    snapshot.itemId === item.id
  );
}

/**
 * True when the item has captured a newer source snapshot than the one the
 * published revision rests on. This is a *signal* for the public page (newer
 * source material exists, possibly held for review) and never a reason to hide
 * an already-published revision.
 */
export function isPublishedRevisionStaleAgainstLatestSnapshot(input: {
  item: Pick<CurrentItem, "latestSnapshotId">;
  revision: Pick<CurrentRevision, "snapshotId">;
}): boolean {
  return (
    input.item.latestSnapshotId !== null &&
    input.revision.snapshotId !== null &&
    input.revision.snapshotId !== input.item.latestSnapshotId
  );
}
