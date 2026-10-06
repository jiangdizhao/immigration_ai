import {
  ADMIN_SYNC_RUNS_PER_SOURCE,
  ADMIN_SYNC_SOURCE_LIMIT,
  type AdminPolicyIntelligenceService,
  projectAdminPolicyIntelligenceSyncRun,
} from "./admin-api";
import { isCurrentPublishedPolicyRevision } from "./currentness";
import type {
  PolicyIntelligenceRepository,
  PolicyItemRecord,
  PolicyRevisionRecord,
  PolicyRevisionWriteResult,
  PolicyRunRecord,
  PolicySnapshotRecord,
} from "./pipeline";
import { PolicyItemArchivedError } from "./pipeline";
import {
  readAnalysisAttemptDiagnostics,
  readCandidateFailureDiagnostics,
} from "./pipeline-failure-diagnostics";
import {
  buildAdminPublicationDiagnostics,
  buildAdminSourceSyncDiagnostic,
} from "./publication-diagnostics";

export function createInMemoryPolicyIntelligenceRepository() {
  const items = new Map<string, PolicyItemRecord>();
  const snapshots = new Map<string, PolicySnapshotRecord>();
  const revisions = new Map<string, PolicyRevisionRecord>();
  const runs = new Map<string, PolicyRunRecord>();
  let sequence = 0;
  const nextId = () => `fixture-${++sequence}`;
  const assertPointerIntegrity = (item: PolicyItemRecord) => {
    if (item.latestSnapshotId) {
      const snapshot = snapshots.get(item.latestSnapshotId);
      if (!snapshot || snapshot.itemId !== item.id) {
        throw new Error("latest_snapshot_pointer_mismatch");
      }
    }
    if (item.latestPublishedRevisionId) {
      const revision = revisions.get(item.latestPublishedRevisionId);
      if (
        !revision ||
        revision.itemId !== item.id ||
        revision.editorialStatus !== "published"
      ) {
        throw new Error("latest_published_revision_pointer_mismatch");
      }
    }
  };

  const repository: PolicyIntelligenceRepository = {
    startRun(run) {
      runs.set(run.id, {
        ...run,
        completedAt: null,
        discoveredCount: 0,
        snapshottedCount: 0,
        unchangedCount: 0,
        analyzedCount: 0,
        publishedCount: 0,
        heldCount: 0,
        failureCount: 0,
        safeErrorCode: null,
        candidateFailures: [],
        analysisAttempts: [],
      });
    },
    finishRun(run) {
      runs.set(run.id, structuredClone(run));
    },
    getOrCreateItem(input) {
      const existing = [...items.values()].find(
        (item) =>
          item.sourceConfigId === input.sourceConfigId &&
          item.sourceId === input.sourceId &&
          item.canonicalOfficialUrl === input.canonicalOfficialUrl
      );
      if (existing) {
        return existing;
      }
      const conflictingIdentity = [...items.values()].some(
        (item) =>
          (item.sourceConfigId === input.sourceConfigId &&
            item.sourceId === input.sourceId) ||
          item.canonicalOfficialUrl === input.canonicalOfficialUrl
      );
      if (conflictingIdentity) {
        throw new Error("policy_item_identity_conflict");
      }
      return repository.createItem(input);
    },
    createItem(input) {
      const item: PolicyItemRecord = {
        ...input,
        id: nextId(),
        latestSnapshotId: null,
        latestPublishedRevisionId: null,
      };
      items.set(item.id, item);
      return item;
    },
    hasRevisionForAnalysis(snapshotId, analysisFingerprint) {
      return [...revisions.values()].some(
        (revision) =>
          revision.snapshotId === snapshotId &&
          revision.analysisFingerprint === analysisFingerprint
      );
    },
    acquireSnapshot(input) {
      const item = items.get(input.itemId);
      if (!item) {
        throw new Error("policy_item_missing");
      }
      assertPointerIntegrity(item);
      const previous = item.latestSnapshotId
        ? snapshots.get(item.latestSnapshotId)
        : undefined;
      if (item.latestSnapshotId && (!previous || previous.itemId !== item.id)) {
        throw new Error("latest_snapshot_pointer_mismatch");
      }
      if (previous?.contentHash === input.contentHash) {
        return { snapshot: previous, created: false };
      }
      if (
        previous &&
        new Date(input.retrievedAt).getTime() <
          new Date(previous.retrievedAt).getTime()
      ) {
        return { snapshot: previous, created: false, staleAcquisition: true };
      }
      const snapshot: PolicySnapshotRecord = {
        ...structuredClone(input),
        id: nextId(),
        previousSnapshotId: previous?.id ?? null,
      };
      snapshots.set(snapshot.id, snapshot);
      item.latestSnapshotId = snapshot.id;
      return { snapshot, created: true };
    },
    saveHeldRevision(input): PolicyRevisionWriteResult {
      const existing = [...revisions.values()].find(
        (revision) =>
          revision.snapshotId === input.snapshotId &&
          revision.analysisFingerprint === input.analysisFingerprint
      );
      if (existing) {
        return { revision: existing, created: false };
      }
      const item = items.get(input.itemId);
      const snapshot = snapshots.get(input.snapshotId);
      if (!item) {
        throw new Error("policy_item_missing");
      }
      if (!snapshot || snapshot.itemId !== item.id) {
        throw new Error("revision_snapshot_item_mismatch");
      }
      assertPointerIntegrity(item);
      const revisionNumber =
        Math.max(
          0,
          ...[...revisions.values()]
            .filter((revision) => revision.itemId === item.id)
            .map((revision) => revision.revisionNumber)
        ) + 1;
      const revision: PolicyRevisionRecord = {
        ...structuredClone(input),
        id: nextId(),
        revisionNumber,
        publishedAt: null,
        supersededAt: null,
      };
      revisions.set(revision.id, revision);
      if (
        item.latestSnapshotId === input.snapshotId &&
        item.editorialStatus !== "archived"
      ) {
        item.editorialStatus = "review_required";
      }
      return { revision, created: true };
    },
    publishRevision(input): PolicyRevisionWriteResult {
      const item = items.get(input.itemId);
      const snapshot = snapshots.get(input.snapshotId);
      if (!item) {
        throw new Error("policy_item_missing");
      }
      if (!snapshot || snapshot.itemId !== item.id) {
        throw new Error("revision_snapshot_item_mismatch");
      }
      assertPointerIntegrity(item);
      if (item.editorialStatus === "archived") {
        throw new PolicyItemArchivedError();
      }
      const existing = [...revisions.values()].find(
        (revision) =>
          revision.snapshotId === input.snapshotId &&
          revision.analysisFingerprint === input.analysisFingerprint
      );
      if (existing) {
        return { revision: existing, created: false };
      }
      if (item.latestSnapshotId !== input.snapshotId) {
        throw new Error("revision_snapshot_not_latest");
      }
      const current = item.latestPublishedRevisionId
        ? revisions.get(item.latestPublishedRevisionId)
        : undefined;
      if (
        item.latestPublishedRevisionId &&
        (!current ||
          current.itemId !== item.id ||
          current.editorialStatus !== "published")
      ) {
        throw new Error("latest_published_revision_pointer_mismatch");
      }
      const revisionNumber =
        Math.max(
          0,
          ...[...revisions.values()]
            .filter((revision) => revision.itemId === item.id)
            .map((revision) => revision.revisionNumber)
        ) + 1;
      const now = input.generatedAt;
      if (current) {
        current.editorialStatus = "superseded";
        current.supersededAt = now;
      }
      const revision: PolicyRevisionRecord = {
        ...structuredClone(input),
        id: nextId(),
        revisionNumber,
        editorialStatus: "published",
        publishedAt: now,
        supersededAt: null,
      };
      revisions.set(revision.id, revision);
      item.sourceStatus = revision.analysis.sourceStatus.value;
      item.editorialStatus = "published";
      item.latestPublishedRevisionId = revision.id;
      return { revision, created: true };
    },
  };

  const adminService: AdminPolicyIntelligenceService = {
    listSourceSyncRuns() {
      const sourceIds = new Set<string>();
      const countsBySource = new Map<string, number>();
      const projected: Awaited<
        ReturnType<AdminPolicyIntelligenceService["listSourceSyncRuns"]>
      > = [];
      const sortedRuns = [...runs.values()].sort((left, right) => {
        const dateOrder =
          Date.parse(right.startedAt) - Date.parse(left.startedAt);
        return dateOrder || right.id.localeCompare(left.id);
      });
      for (const run of sortedRuns) {
        if (!sourceIds.has(run.sourceConfigId)) {
          if (sourceIds.size >= ADMIN_SYNC_SOURCE_LIMIT) {
            continue;
          }
          sourceIds.add(run.sourceConfigId);
        }
        const sourceCount = countsBySource.get(run.sourceConfigId) ?? 0;
        if (sourceCount >= ADMIN_SYNC_RUNS_PER_SOURCE) {
          continue;
        }
        countsBySource.set(run.sourceConfigId, sourceCount + 1);
        projected.push(
          projectAdminPolicyIntelligenceSyncRun({
            sourceConfigId: run.sourceConfigId,
            status: run.status,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            discoveredCount: run.discoveredCount,
            snapshottedCount: run.snapshottedCount,
            unchangedCount: run.unchangedCount,
            analyzedCount: run.analyzedCount,
            publishedCount: run.publishedCount,
            heldCount: run.heldCount,
            failureCount: run.failureCount,
            safeErrorCode: run.safeErrorCode,
          })
        );
      }
      return Promise.resolve(projected);
    },

    async listItems() {
      return [...items.values()].map((item) => {
        const snapshot = item.latestSnapshotId
          ? snapshots.get(item.latestSnapshotId)
          : undefined;
        const publishedRevision = item.latestPublishedRevisionId
          ? revisions.get(item.latestPublishedRevisionId)
          : undefined;
        const revision = snapshot
          ? [...revisions.values()]
              .filter(
                (candidate) =>
                  candidate.itemId === item.id &&
                  candidate.snapshotId === snapshot.id
              )
              .sort((left, right) => right.revisionNumber - left.revisionNumber)
              .at(0)
          : undefined;
        const latestSourceRun = [...runs.values()]
          .filter((run) => run.sourceConfigId === item.sourceConfigId)
          .sort(
            (left, right) =>
              Date.parse(right.startedAt) - Date.parse(left.startedAt)
          )[0];
        const evidence = snapshot
          ? {
              evidenceRef: `policy-snapshot:${snapshot.id}`,
              snapshotId: snapshot.id,
              sourceConfigId: snapshot.sourceConfigId,
              sourceId: snapshot.sourceId,
              authority: snapshot.authority,
              canonicalUrl: snapshot.canonicalUrl,
              officialTitle: snapshot.officialTitle,
              retrievedAt: snapshot.retrievedAt,
              contentHash: snapshot.contentHash,
              sourceDate: snapshot.sourceDate,
              effectiveDate: snapshot.effectiveDate,
              evidenceTruncated: snapshot.evidenceTruncated,
              text: snapshot.normalizedEvidence,
            }
          : null;
        return {
          id: item.id,
          slug: item.slug,
          title: snapshot?.officialTitle ?? null,
          authority: snapshot?.authority ?? null,
          sourceConfigId: item.sourceConfigId,
          sourceStatus: item.sourceStatus,
          editorialStatus: item.editorialStatus,
          publishedAt: publishedRevision?.publishedAt ?? null,
          updatedAt: revision?.generatedAt ?? snapshot?.retrievedAt ?? "",
          latestSnapshot: snapshot
            ? {
                sourceUrl: snapshot.canonicalUrl,
                retrievedAt: snapshot.retrievedAt,
                sourceTitle: snapshot.officialTitle,
              }
            : null,
          latestRevision: revision
            ? {
                revisionNumber: revision.revisionNumber,
                generatedAt: revision.generatedAt,
                editorialStatus: revision.editorialStatus,
              }
            : null,
          pipelineFailures: readCandidateFailureDiagnostics(
            latestSourceRun?.candidateFailures
              ? { candidateFailures: latestSourceRun.candidateFailures }
              : null,
            item.id,
            item.sourceConfigId
          ),
          analysisAttempts: readAnalysisAttemptDiagnostics(
            latestSourceRun
              ? {
                  analysisAttempts: latestSourceRun.analysisAttempts,
                }
              : null,
            item.id,
            item.sourceConfigId
          ),
          sourceSyncDiagnostic: buildAdminSourceSyncDiagnostic(
            latestSourceRun
              ? {
                  status: latestSourceRun.status,
                  safeErrorCode: latestSourceRun.safeErrorCode,
                }
              : null
          ),
          publicationDiagnostics: buildAdminPublicationDiagnostics({
            editorialStatus: item.editorialStatus,
            analysis: revision?.analysis ?? null,
            verification: revision?.verification ?? null,
            evidence,
          }),
        };
      });
    },
    async updateItem(itemId, action) {
      const item = items.get(itemId);
      if (!item) {
        return { status: "not_found" };
      }
      if (action === "archive") {
        item.editorialStatus = "archived";
        return { status: "updated", editorialStatus: "archived" };
      }
      if (item.editorialStatus !== "archived") {
        return { status: "not_archived" };
      }
      const revision = item.latestPublishedRevisionId
        ? revisions.get(item.latestPublishedRevisionId)
        : undefined;
      const snapshot = revision
        ? snapshots.get(revision.snapshotId)
        : undefined;
      const isCurrent = Boolean(
        revision &&
          snapshot &&
          isCurrentPublishedPolicyRevision({
            item: { ...item, editorialStatus: "published" },
            revision,
            snapshot,
          })
      );
      item.editorialStatus = isCurrent ? "published" : "review_required";
      return { status: "updated", editorialStatus: item.editorialStatus };
    },
  };
  return { repository, items, snapshots, revisions, runs, adminService };
}
