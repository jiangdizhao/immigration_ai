import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import {
  policyIntelligenceAnalysisRevision,
  policyIntelligenceItem,
  policyIntelligenceSourceSnapshot,
  policyIntelligenceSyncRun,
} from "@/lib/db/schema";
import type {
  AdminPolicyIntelligenceItem,
  AdminPolicyIntelligenceService,
} from "./admin-api";
import { buildAdminPolicyRevisionDetail } from "./admin-revision-detail";
import { policyAnalysisSchema } from "./contracts";
import {
  buildAdminPublicationDiagnostics,
  buildAdminSourceSyncDiagnostic,
} from "./publication-diagnostics";
import {
  readAnalysisAttemptDiagnostics,
  readCandidateFailureDiagnostics,
} from "./pipeline-failure-diagnostics";
import { db } from "./server-db";

export const adminPolicyIntelligenceService: AdminPolicyIntelligenceService = {
  async listItems() {
    const rows = await db
      .select({
        item: policyIntelligenceItem,
        snapshot: policyIntelligenceSourceSnapshot,
        publishedRevision: policyIntelligenceAnalysisRevision,
      })
      .from(policyIntelligenceItem)
      .leftJoin(
        policyIntelligenceSourceSnapshot,
        and(
          eq(
            policyIntelligenceSourceSnapshot.id,
            policyIntelligenceItem.latestSnapshotId
          ),
          eq(policyIntelligenceSourceSnapshot.itemId, policyIntelligenceItem.id)
        )
      )
      .leftJoin(
        policyIntelligenceAnalysisRevision,
        and(
          eq(
            policyIntelligenceAnalysisRevision.id,
            policyIntelligenceItem.latestPublishedRevisionId
          ),
          eq(
            policyIntelligenceAnalysisRevision.itemId,
            policyIntelligenceItem.id
          )
        )
      )
      .orderBy(desc(policyIntelligenceItem.updatedAt));

    const itemIds = rows.map(({ item }) => item.id);
    const latestSnapshotByItem = new Map(
      rows.flatMap(({ item, snapshot }) =>
        snapshot ? [[item.id, snapshot.id] as const] : []
      )
    );
    const snapshotIds = rows.flatMap(({ snapshot }) =>
      snapshot ? [snapshot.id] : []
    );
    const revisions =
      itemIds.length > 0 && snapshotIds.length > 0
        ? await db
            .select()
            .from(policyIntelligenceAnalysisRevision)
            .where(
              and(
                inArray(policyIntelligenceAnalysisRevision.itemId, itemIds),
                inArray(
                  policyIntelligenceAnalysisRevision.snapshotId,
                  snapshotIds
                )
              )
            )
            .orderBy(desc(policyIntelligenceAnalysisRevision.revisionNumber))
        : [];
    const latestRevisionByItem = new Map<string, (typeof revisions)[number]>();
    for (const revision of revisions) {
      if (
        revision.snapshotId === latestSnapshotByItem.get(revision.itemId) &&
        !latestRevisionByItem.has(revision.itemId)
      ) {
        latestRevisionByItem.set(revision.itemId, revision);
      }
    }

    const sourceConfigIds = [
      ...new Set(rows.map(({ item }) => item.primarySourceConfigId)),
    ];
    const sourceRunEntries = await Promise.all(
      sourceConfigIds.map(async (sourceConfigId) => {
        const [run] = await db
          .select({
            sourceConfigId: policyIntelligenceSyncRun.sourceConfigId,
            status: policyIntelligenceSyncRun.status,
            safeErrorCode: policyIntelligenceSyncRun.safeErrorCode,
            metadata: policyIntelligenceSyncRun.metadata,
          })
          .from(policyIntelligenceSyncRun)
          .where(eq(policyIntelligenceSyncRun.sourceConfigId, sourceConfigId))
          .orderBy(desc(policyIntelligenceSyncRun.startedAt))
          .limit(1);
        return [sourceConfigId, run] as const;
      })
    );
    const latestRunBySource = new Map(
      sourceRunEntries.flatMap(([sourceConfigId, run]) =>
        run ? [[sourceConfigId, run] as const] : []
      )
    );

    return rows.map(({ item, snapshot, publishedRevision }) => {
      const revision = latestRevisionByItem.get(item.id) ?? null;
      const parsedAnalysis = revision
        ? policyAnalysisSchema.safeParse(revision.analysis)
        : null;
      const evidence = snapshot
        ? {
            evidenceRef: `policy-snapshot:${snapshot.id}`,
            snapshotId: snapshot.id,
            sourceConfigId: snapshot.sourceConfigId,
            sourceId: snapshot.sourceId,
            authority: snapshot.authority,
            canonicalUrl: snapshot.canonicalUrl,
            officialTitle: snapshot.officialTitle,
            retrievedAt: snapshot.retrievedAt.toISOString(),
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
        title: parsedAnalysis?.success
          ? parsedAnalysis.data.title.text.en
          : (snapshot?.officialTitle ?? null),
        authority: snapshot?.authority ?? null,
        sourceConfigId: item.primarySourceConfigId,
        sourceStatus: item.sourceStatus,
        editorialStatus: item.editorialStatus,
        publishedAt: publishedRevision?.publishedAt?.toISOString() ?? null,
        updatedAt: item.updatedAt.toISOString(),
        latestSnapshot: snapshot
          ? {
              sourceUrl: snapshot.canonicalUrl,
              retrievedAt: snapshot.retrievedAt.toISOString(),
              sourceTitle: snapshot.officialTitle,
            }
          : null,
        latestRevision: revision
          ? {
              revisionNumber: revision.revisionNumber,
              generatedAt: revision.generatedAt.toISOString(),
              editorialStatus: revision.editorialStatus,
            }
          : null,
        pipelineFailures: readCandidateFailureDiagnostics(
          latestRunBySource.get(item.primarySourceConfigId)?.metadata,
          item.id,
          item.primarySourceConfigId
        ),
        analysisAttempts: readAnalysisAttemptDiagnostics(
          latestRunBySource.get(item.primarySourceConfigId)?.metadata,
          item.id,
          item.primarySourceConfigId
        ),
        sourceSyncDiagnostic: buildAdminSourceSyncDiagnostic(
          latestRunBySource.get(item.primarySourceConfigId)
        ),
        publicationDiagnostics: buildAdminPublicationDiagnostics({
          editorialStatus: item.editorialStatus,
          analysis: revision?.analysis ?? null,
          verification: revision?.verification ?? null,
          evidence,
        }),
      };
    }) satisfies AdminPolicyIntelligenceItem[];
  },

  async getRevisionDetail(itemId) {
    const [item] = await db
      .select({
        id: policyIntelligenceItem.id,
        slug: policyIntelligenceItem.slug,
        sourceConfigId: policyIntelligenceItem.primarySourceConfigId,
        sourceStatus: policyIntelligenceItem.sourceStatus,
        editorialStatus: policyIntelligenceItem.editorialStatus,
        latestSnapshotId: policyIntelligenceItem.latestSnapshotId,
      })
      .from(policyIntelligenceItem)
      .where(eq(policyIntelligenceItem.id, itemId))
      .limit(1);
    if (!item || !item.latestSnapshotId) {
      return null;
    }

    const [snapshot] = await db
      .select({
        id: policyIntelligenceSourceSnapshot.id,
        itemId: policyIntelligenceSourceSnapshot.itemId,
        canonicalUrl: policyIntelligenceSourceSnapshot.canonicalUrl,
        officialTitle: policyIntelligenceSourceSnapshot.officialTitle,
        retrievedAt: policyIntelligenceSourceSnapshot.retrievedAt,
        sourceDate: policyIntelligenceSourceSnapshot.sourceDate,
        effectiveDate: policyIntelligenceSourceSnapshot.effectiveDate,
        evidenceTruncated: policyIntelligenceSourceSnapshot.evidenceTruncated,
        sourceId: policyIntelligenceSourceSnapshot.sourceId,
        authority: policyIntelligenceSourceSnapshot.authority,
        contentHash: policyIntelligenceSourceSnapshot.contentHash,
      })
      .from(policyIntelligenceSourceSnapshot)
      .where(
        and(
          eq(policyIntelligenceSourceSnapshot.id, item.latestSnapshotId),
          eq(policyIntelligenceSourceSnapshot.itemId, item.id)
        )
      )
      .limit(1);
    if (!snapshot) {
      return null;
    }

    const [revision] = await db
      .select({
        id: policyIntelligenceAnalysisRevision.id,
        itemId: policyIntelligenceAnalysisRevision.itemId,
        snapshotId: policyIntelligenceAnalysisRevision.snapshotId,
        revisionNumber: policyIntelligenceAnalysisRevision.revisionNumber,
        generatedAt: policyIntelligenceAnalysisRevision.generatedAt,
        editorialStatus: policyIntelligenceAnalysisRevision.editorialStatus,
        analysisFingerprint:
          policyIntelligenceAnalysisRevision.analysisFingerprint,
        analysis: policyIntelligenceAnalysisRevision.analysis,
        verification: policyIntelligenceAnalysisRevision.verification,
        modelMetadata: policyIntelligenceAnalysisRevision.modelMetadata,
      })
      .from(policyIntelligenceAnalysisRevision)
      .where(
        and(
          eq(policyIntelligenceAnalysisRevision.itemId, item.id),
          eq(policyIntelligenceAnalysisRevision.snapshotId, snapshot.id)
        )
      )
      .orderBy(desc(policyIntelligenceAnalysisRevision.revisionNumber))
      .limit(1);

    return buildAdminPolicyRevisionDetail({
      item,
      snapshot,
      revision: revision ?? null,
    });
  },

  async updateItem(itemId, action) {
    return await db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(policyIntelligenceItem)
        .where(eq(policyIntelligenceItem.id, itemId))
        .for("update")
        .limit(1);
      if (!item) {
        return { status: "not_found" as const };
      }

      let editorialStatus: "archived" | "published" | "review_required";
      if (action === "archive") {
        editorialStatus = "archived";
      } else {
        if (item.editorialStatus !== "archived") {
          return { status: "not_archived" as const };
        }

        const [currentPublishedRevision] =
          item.latestPublishedRevisionId && item.latestSnapshotId
            ? await tx
                .select({ id: policyIntelligenceAnalysisRevision.id })
                .from(policyIntelligenceAnalysisRevision)
                .innerJoin(
                  policyIntelligenceSourceSnapshot,
                  eq(
                    policyIntelligenceSourceSnapshot.id,
                    policyIntelligenceAnalysisRevision.snapshotId
                  )
                )
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
                    ),
                    eq(
                      policyIntelligenceAnalysisRevision.snapshotId,
                      item.latestSnapshotId
                    ),
                    eq(policyIntelligenceSourceSnapshot.itemId, item.id)
                  )
                )
                .limit(1)
            : [];
        editorialStatus = currentPublishedRevision
          ? "published"
          : "review_required";
      }

      await tx
        .update(policyIntelligenceItem)
        .set({ editorialStatus, updatedAt: new Date() })
        .where(eq(policyIntelligenceItem.id, item.id));
      return { status: "updated" as const, editorialStatus };
    });
  },
};
