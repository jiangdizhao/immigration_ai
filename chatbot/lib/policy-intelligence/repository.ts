import "server-only";
import { and, desc, eq } from "drizzle-orm";
import {
  policyIntelligenceAnalysisRevision,
  policyIntelligenceItem,
  policyIntelligenceSourceSnapshot,
  policyIntelligenceSyncRun,
} from "@/lib/db/schema";
import { policyAnalysisSchema, policyVerificationSchema } from "./contracts";
import { PolicyItemArchivedError } from "./pipeline";
import type {
  PolicyIntelligenceRepository,
  PolicyItemRecord,
  PolicyRevisionRecord,
  PolicyRevisionWriteResult,
  PolicyRunRecord,
  PolicySnapshotRecord,
} from "./pipeline";
import { db } from "./server-db";
import { restoreSnapshotAuditMetadata } from "./snapshot-metadata";

const asItem = (
  row: typeof policyIntelligenceItem.$inferSelect
): PolicyItemRecord => ({
  id: row.id,
  slug: row.slug,
  sourceConfigId: row.primarySourceConfigId,
  sourceId: row.primarySourceId,
  canonicalOfficialUrl: row.canonicalOfficialUrl,
  sourceStatus: row.sourceStatus,
  editorialStatus: row.editorialStatus,
  latestSnapshotId: row.latestSnapshotId,
  latestPublishedRevisionId: row.latestPublishedRevisionId,
});

const asSnapshot = (
  row: typeof policyIntelligenceSourceSnapshot.$inferSelect
): PolicySnapshotRecord => ({
  id: row.id,
  itemId: row.itemId,
  sourceConfigId: row.sourceConfigId,
  sourceId: row.sourceId,
  authority: row.authority,
  canonicalUrl: row.canonicalUrl,
  officialTitle: row.officialTitle,
  retrievedAt: row.retrievedAt.toISOString(),
  contentType: row.contentType,
  httpStatus: row.httpStatus,
  ...restoreSnapshotAuditMetadata({
    sourceDate: row.sourceDate,
    effectiveDate: row.effectiveDate,
    evidenceTruncated: row.evidenceTruncated,
    sourceMetadata: row.sourceMetadata,
  }),
  normalizedEvidence: row.normalizedEvidence,
  contentHash: row.contentHash,
  sourceMetadata: row.sourceMetadata as PolicySnapshotRecord["sourceMetadata"],
  previousSnapshotId: row.previousSnapshotId,
});

function runValues(run: PolicyRunRecord) {
  return {
    id: run.id,
    sourceConfigId: run.sourceConfigId,
    mode: run.mode,
    status: run.status,
    startedAt: new Date(run.startedAt),
    completedAt: run.completedAt ? new Date(run.completedAt) : null,
    discoveredCount: run.discoveredCount,
    snapshottedCount: run.snapshottedCount,
    unchangedCount: run.unchangedCount,
    analyzedCount: run.analyzedCount,
    publishedCount: run.publishedCount,
    heldCount: run.heldCount,
    failureCount: run.failureCount,
    safeErrorCode: run.safeErrorCode,
    metadata: {
      candidateFailures: run.candidateFailures,
      analysisAttempts: run.analysisAttempts,
    },
  };
}

function revisionResult(
  row: typeof policyIntelligenceAnalysisRevision.$inferSelect
): PolicyRevisionRecord {
  return {
    id: row.id,
    itemId: row.itemId,
    snapshotId: row.snapshotId,
    analysisFingerprint: row.analysisFingerprint,
    revisionNumber: row.revisionNumber,
    analysis: policyAnalysisSchema.parse(row.analysis),
    verification: policyVerificationSchema.parse(row.verification),
    modelMetadata: row.modelMetadata as PolicyRevisionRecord["modelMetadata"],
    editorialStatus:
      row.editorialStatus === "published"
        ? "published"
        : row.editorialStatus === "superseded"
          ? "superseded"
          : "review_required",
    generatedAt: row.generatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    supersededAt: row.supersededAt?.toISOString() ?? null,
  };
}

export const policyIntelligenceRepository: PolicyIntelligenceRepository = {
  async startRun(run) {
    await db.insert(policyIntelligenceSyncRun).values({
      id: run.id,
      sourceConfigId: run.sourceConfigId,
      mode: run.mode,
      status: "running",
      startedAt: new Date(run.startedAt),
      metadata: { candidateFailures: [], analysisAttempts: [] },
    });
  },
  async finishRun(run) {
    await db
      .update(policyIntelligenceSyncRun)
      .set(runValues(run))
      .where(eq(policyIntelligenceSyncRun.id, run.id));
  },
  async getOrCreateItem(item) {
    const identity = {
      primarySourceConfigId: item.sourceConfigId,
      primarySourceId: item.sourceId,
      canonicalOfficialUrl: item.canonicalOfficialUrl,
    };
    const [inserted] = await db
      .insert(policyIntelligenceItem)
      .values({
        slug: item.slug,
        ...identity,
        sourceStatus: item.sourceStatus,
        editorialStatus: item.editorialStatus,
      })
      .onConflictDoNothing({
        target: [
          policyIntelligenceItem.primarySourceConfigId,
          policyIntelligenceItem.primarySourceId,
          policyIntelligenceItem.canonicalOfficialUrl,
        ],
      })
      .returning();
    if (inserted) {
      return asItem(inserted);
    }
    const [existing] = await db
      .select()
      .from(policyIntelligenceItem)
      .where(
        and(
          eq(policyIntelligenceItem.primarySourceConfigId, item.sourceConfigId),
          eq(policyIntelligenceItem.primarySourceId, item.sourceId),
          eq(
            policyIntelligenceItem.canonicalOfficialUrl,
            item.canonicalOfficialUrl
          )
        )
      )
      .limit(1);
    if (!existing) {
      throw new Error("policy_item_identity_conflict");
    }
    return asItem(existing);
  },
  async createItem(item) {
    const [row] = await db
      .insert(policyIntelligenceItem)
      .values({
        slug: item.slug,
        primarySourceConfigId: item.sourceConfigId,
        primarySourceId: item.sourceId,
        canonicalOfficialUrl: item.canonicalOfficialUrl,
        sourceStatus: item.sourceStatus,
        editorialStatus: item.editorialStatus,
      })
      .returning();
    return asItem(row);
  },
  async hasRevisionForAnalysis(snapshotId, analysisFingerprint) {
    const [row] = await db
      .select({ id: policyIntelligenceAnalysisRevision.id })
      .from(policyIntelligenceAnalysisRevision)
      .where(
        and(
          eq(policyIntelligenceAnalysisRevision.snapshotId, snapshotId),
          eq(
            policyIntelligenceAnalysisRevision.analysisFingerprint,
            analysisFingerprint
          )
        )
      )
      .limit(1);
    return Boolean(row);
  },
  acquireSnapshot(snapshot) {
    return db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(policyIntelligenceItem)
        .where(eq(policyIntelligenceItem.id, snapshot.itemId))
        .for("update")
        .limit(1);
      if (!item) {
        throw new Error("policy_item_missing");
      }

      let previous:
        | typeof policyIntelligenceSourceSnapshot.$inferSelect
        | undefined;
      if (item.latestSnapshotId) {
        [previous] = await tx
          .select()
          .from(policyIntelligenceSourceSnapshot)
          .where(
            and(
              eq(policyIntelligenceSourceSnapshot.id, item.latestSnapshotId),
              eq(policyIntelligenceSourceSnapshot.itemId, item.id)
            )
          )
          .limit(1);
        if (!previous) {
          throw new Error("latest_snapshot_pointer_mismatch");
        }
      }
      if (previous?.contentHash === snapshot.contentHash) {
        return { snapshot: asSnapshot(previous), created: false };
      }
      if (previous && new Date(snapshot.retrievedAt) < previous.retrievedAt) {
        return {
          snapshot: asSnapshot(previous),
          created: false,
          staleAcquisition: true,
        };
      }

      const [row] = await tx
        .insert(policyIntelligenceSourceSnapshot)
        .values({
          itemId: snapshot.itemId,
          sourceConfigId: snapshot.sourceConfigId,
          sourceId: snapshot.sourceId,
          authority: snapshot.authority,
          canonicalUrl: snapshot.canonicalUrl,
          officialTitle: snapshot.officialTitle,
          retrievedAt: new Date(snapshot.retrievedAt),
          contentType: snapshot.contentType,
          httpStatus: snapshot.httpStatus,
          sourceDate: snapshot.sourceDate,
          effectiveDate: snapshot.effectiveDate,
          normalizedEvidence: snapshot.normalizedEvidence,
          contentHash: snapshot.contentHash,
          sourceMetadata: {
            ...snapshot.sourceMetadata,
            etag: snapshot.etag,
            lastModified: snapshot.lastModified,
          },
          previousSnapshotId: previous?.id ?? null,
          evidenceTruncated: snapshot.evidenceTruncated,
        })
        .returning();
      await tx
        .update(policyIntelligenceItem)
        .set({
          latestSnapshotId: row.id,
          updatedAt: new Date(snapshot.retrievedAt),
        })
        .where(eq(policyIntelligenceItem.id, item.id));
      return { snapshot: asSnapshot(row), created: true };
    });
  },
  saveHeldRevision(revision): Promise<PolicyRevisionWriteResult> {
    return db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(policyIntelligenceItem)
        .where(eq(policyIntelligenceItem.id, revision.itemId))
        .for("update")
        .limit(1);
      if (!item) {
        throw new Error("policy_item_missing");
      }
      const [snapshot] = await tx
        .select({ id: policyIntelligenceSourceSnapshot.id })
        .from(policyIntelligenceSourceSnapshot)
        .where(
          and(
            eq(policyIntelligenceSourceSnapshot.id, revision.snapshotId),
            eq(policyIntelligenceSourceSnapshot.itemId, revision.itemId)
          )
        )
        .limit(1);
      if (!snapshot) {
        throw new Error("revision_snapshot_item_mismatch");
      }
      await assertItemPointersBelongToItem(tx, item);
      const [existing] = await tx
        .select()
        .from(policyIntelligenceAnalysisRevision)
        .where(
          and(
            eq(
              policyIntelligenceAnalysisRevision.snapshotId,
              revision.snapshotId
            ),
            eq(
              policyIntelligenceAnalysisRevision.analysisFingerprint,
              revision.analysisFingerprint
            )
          )
        )
        .limit(1);
      if (existing) {
        return { revision: revisionResult(existing), created: false };
      }
      const [latest] = await tx
        .select({
          revisionNumber: policyIntelligenceAnalysisRevision.revisionNumber,
        })
        .from(policyIntelligenceAnalysisRevision)
        .where(eq(policyIntelligenceAnalysisRevision.itemId, item.id))
        .orderBy(desc(policyIntelligenceAnalysisRevision.revisionNumber))
        .limit(1);
      const [row] = await tx
        .insert(policyIntelligenceAnalysisRevision)
        .values({
          itemId: revision.itemId,
          snapshotId: revision.snapshotId,
          analysisFingerprint: revision.analysisFingerprint,
          revisionNumber: (latest?.revisionNumber ?? 0) + 1,
          schemaVersion: revision.analysis.schemaVersion,
          analysis: revision.analysis,
          verification: revision.verification,
          modelMetadata: revision.modelMetadata,
          editorialStatus: "review_required",
          generatedAt: new Date(revision.generatedAt),
        })
        .returning();
      if (
        item.latestSnapshotId === revision.snapshotId &&
        item.editorialStatus !== "archived"
      ) {
        await tx
          .update(policyIntelligenceItem)
          .set({
            editorialStatus: "review_required",
            updatedAt: new Date(revision.generatedAt),
          })
          .where(eq(policyIntelligenceItem.id, item.id));
      }
      return { revision: revisionResult(row), created: true };
    });
  },
  publishRevision(revision): Promise<PolicyRevisionWriteResult> {
    return db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(policyIntelligenceItem)
        .where(eq(policyIntelligenceItem.id, revision.itemId))
        .for("update")
        .limit(1);
      if (!item) {
        throw new Error("policy_item_missing");
      }
      const [snapshot] = await tx
        .select({ id: policyIntelligenceSourceSnapshot.id })
        .from(policyIntelligenceSourceSnapshot)
        .where(
          and(
            eq(policyIntelligenceSourceSnapshot.id, revision.snapshotId),
            eq(policyIntelligenceSourceSnapshot.itemId, revision.itemId)
          )
        )
        .limit(1);
      if (!snapshot) {
        throw new Error("revision_snapshot_item_mismatch");
      }
      await assertItemPointersBelongToItem(tx, item);
      if (item.editorialStatus === "archived") {
        throw new PolicyItemArchivedError();
      }
      const [existing] = await tx
        .select()
        .from(policyIntelligenceAnalysisRevision)
        .where(
          and(
            eq(
              policyIntelligenceAnalysisRevision.snapshotId,
              revision.snapshotId
            ),
            eq(
              policyIntelligenceAnalysisRevision.analysisFingerprint,
              revision.analysisFingerprint
            )
          )
        )
        .limit(1);
      if (existing) {
        return { revision: revisionResult(existing), created: false };
      }
      if (item.latestSnapshotId !== revision.snapshotId) {
        throw new Error("revision_snapshot_not_latest");
      }
      let current:
        | typeof policyIntelligenceAnalysisRevision.$inferSelect
        | undefined;
      if (item.latestPublishedRevisionId) {
        [current] = await tx
          .select()
          .from(policyIntelligenceAnalysisRevision)
          .where(
            and(
              eq(
                policyIntelligenceAnalysisRevision.id,
                item.latestPublishedRevisionId
              ),
              eq(policyIntelligenceAnalysisRevision.itemId, item.id),
              eq(
                policyIntelligenceAnalysisRevision.editorialStatus,
                "published"
              )
            )
          )
          .limit(1);
        if (!current) {
          throw new Error("latest_published_revision_pointer_mismatch");
        }
        await tx
          .update(policyIntelligenceAnalysisRevision)
          .set({
            editorialStatus: "superseded",
            supersededAt: new Date(revision.generatedAt),
          })
          .where(eq(policyIntelligenceAnalysisRevision.id, current.id));
      }
      const [latest] = await tx
        .select({
          revisionNumber: policyIntelligenceAnalysisRevision.revisionNumber,
        })
        .from(policyIntelligenceAnalysisRevision)
        .where(eq(policyIntelligenceAnalysisRevision.itemId, item.id))
        .orderBy(desc(policyIntelligenceAnalysisRevision.revisionNumber))
        .limit(1);
      const now = new Date(revision.generatedAt);
      const [row] = await tx
        .insert(policyIntelligenceAnalysisRevision)
        .values({
          itemId: revision.itemId,
          snapshotId: revision.snapshotId,
          analysisFingerprint: revision.analysisFingerprint,
          revisionNumber: (latest?.revisionNumber ?? 0) + 1,
          schemaVersion: revision.analysis.schemaVersion,
          analysis: revision.analysis,
          verification: revision.verification,
          modelMetadata: revision.modelMetadata,
          editorialStatus: "published",
          generatedAt: now,
          publishedAt: now,
        })
        .returning();
      await tx
        .update(policyIntelligenceItem)
        .set({
          sourceStatus: revision.analysis.sourceStatus.value,
          editorialStatus: "published",
          latestPublishedRevisionId: row.id,
          updatedAt: now,
        })
        .where(eq(policyIntelligenceItem.id, item.id));
      return { revision: revisionResult(row), created: true };
    });
  },
};

async function assertItemPointersBelongToItem(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  item: typeof policyIntelligenceItem.$inferSelect
) {
  if (item.latestSnapshotId) {
    const [snapshot] = await tx
      .select({ id: policyIntelligenceSourceSnapshot.id })
      .from(policyIntelligenceSourceSnapshot)
      .where(
        and(
          eq(policyIntelligenceSourceSnapshot.id, item.latestSnapshotId),
          eq(policyIntelligenceSourceSnapshot.itemId, item.id)
        )
      )
      .limit(1);
    if (!snapshot) {
      throw new Error("latest_snapshot_pointer_mismatch");
    }
  }
  if (item.latestPublishedRevisionId) {
    const [revision] = await tx
      .select({ id: policyIntelligenceAnalysisRevision.id })
      .from(policyIntelligenceAnalysisRevision)
      .where(
        and(
          eq(
            policyIntelligenceAnalysisRevision.id,
            item.latestPublishedRevisionId
          ),
          eq(policyIntelligenceAnalysisRevision.itemId, item.id)
        )
      )
      .limit(1);
    if (!revision) {
      throw new Error("latest_published_revision_pointer_mismatch");
    }
  }
}
