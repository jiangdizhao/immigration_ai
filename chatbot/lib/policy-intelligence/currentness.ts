type CurrentItem = {
  id: string;
  editorialStatus: string;
  latestSnapshotId: string | null;
  latestPublishedRevisionId: string | null;
};

type CurrentRevision = {
  id: string;
  itemId: string;
  snapshotId: string;
  editorialStatus: string;
};

type JoinedSnapshot = {
  id: string;
  itemId: string;
};

export function isCurrentPublishedPolicyRevision(input: {
  item: CurrentItem;
  revision: CurrentRevision;
  snapshot: JoinedSnapshot;
}): boolean {
  return (
    input.item.editorialStatus === "published" &&
    input.item.latestPublishedRevisionId === input.revision.id &&
    input.revision.editorialStatus === "published" &&
    input.revision.itemId === input.item.id &&
    input.revision.snapshotId === input.item.latestSnapshotId &&
    input.snapshot.id === input.revision.snapshotId &&
    input.snapshot.itemId === input.item.id
  );
}
