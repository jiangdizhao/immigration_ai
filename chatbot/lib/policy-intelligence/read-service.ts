import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import {
  policyIntelligenceAnalysisRevision,
  policyIntelligenceItem,
  policyIntelligenceSourceSnapshot,
  policyIntelligenceSyncRun,
} from "@/lib/db/schema";
import { policyAnalysisSchema } from "./contracts";
import { isCurrentPublishedPolicyRevision } from "./currentness";
import { db } from "./server-db";

/** Server-only read model for published Stage 1 policy revisions. */
export async function getPublishedPolicyIntelligenceList() {
  const rows = await db
    .select({
      item: policyIntelligenceItem,
      revision: policyIntelligenceAnalysisRevision,
      snapshot: policyIntelligenceSourceSnapshot,
    })
    .from(policyIntelligenceItem)
    .innerJoin(
      policyIntelligenceAnalysisRevision,
      eq(
        policyIntelligenceItem.latestPublishedRevisionId,
        policyIntelligenceAnalysisRevision.id
      )
    )
    .innerJoin(
      policyIntelligenceSourceSnapshot,
      eq(
        policyIntelligenceAnalysisRevision.snapshotId,
        policyIntelligenceSourceSnapshot.id
      )
    )
    .where(
      and(
        eq(policyIntelligenceItem.editorialStatus, "published"),
        eq(
          policyIntelligenceAnalysisRevision.itemId,
          policyIntelligenceItem.id
        ),
        eq(policyIntelligenceAnalysisRevision.editorialStatus, "published"),
        eq(
          policyIntelligenceAnalysisRevision.snapshotId,
          policyIntelligenceItem.latestSnapshotId
        ),
        eq(policyIntelligenceSourceSnapshot.itemId, policyIntelligenceItem.id)
      )
    );
  return rows
    .filter(({ item, revision, snapshot }) =>
      isCurrentPublishedPolicyRevision({ item, revision, snapshot })
    )
    .map(({ item, revision, snapshot }) => {
      const analysis = policyAnalysisSchema.parse(revision.analysis);
      return {
        id: item.id,
        slug: item.slug,
        sourceStatus: item.sourceStatus,
        editorialStatus: "published" as const,
        origin: "automated" as const,
        source: {
          authority: snapshot.authority,
          officialTitle: snapshot.officialTitle,
          officialUrl: snapshot.canonicalUrl,
          sourceDate: snapshot.sourceDate,
          effectiveDate: snapshot.effectiveDate,
          jurisdiction: "Australia",
          category: item.primarySourceConfigId,
        },
        analysis,
        sourceEvidence: [
          {
            snapshotId: snapshot.id,
            authority: snapshot.authority,
            officialTitle: snapshot.officialTitle,
            officialUrl: snapshot.canonicalUrl,
            retrievedAt: snapshot.retrievedAt.toISOString(),
            contentHash: snapshot.contentHash,
          },
        ],
        revision: {
          id: revision.id,
          number: revision.revisionNumber,
          generatedAt: revision.generatedAt.toISOString(),
          publishedAt: revision.publishedAt?.toISOString() ?? null,
          generatedByAI: true,
          lawyerCommentary: null,
        },
      };
    })
    .sort((left, right) =>
      (right.revision.publishedAt ?? "").localeCompare(
        left.revision.publishedAt ?? ""
      )
    );
}

export async function getPublishedPolicyIntelligenceBySlug(slug: string) {
  return (
    (await getPublishedPolicyIntelligenceList()).find(
      (item) => item.slug === slug
    ) ?? null
  );
}

export async function getPolicyIntelligenceRevisionHistory(slug: string) {
  const [item] = await db
    .select()
    .from(policyIntelligenceItem)
    .where(eq(policyIntelligenceItem.slug, slug))
    .limit(1);
  if (!item) {
    return null;
  }
  const revisions = await db
    .select({
      id: policyIntelligenceAnalysisRevision.id,
      revisionNumber: policyIntelligenceAnalysisRevision.revisionNumber,
      editorialStatus: policyIntelligenceAnalysisRevision.editorialStatus,
      generatedAt: policyIntelligenceAnalysisRevision.generatedAt,
      publishedAt: policyIntelligenceAnalysisRevision.publishedAt,
      supersededAt: policyIntelligenceAnalysisRevision.supersededAt,
      snapshotId: policyIntelligenceAnalysisRevision.snapshotId,
    })
    .from(policyIntelligenceAnalysisRevision)
    .where(eq(policyIntelligenceAnalysisRevision.itemId, item.id))
    .orderBy(desc(policyIntelligenceAnalysisRevision.revisionNumber));
  return {
    id: item.id,
    slug: item.slug,
    sourceStatus: item.sourceStatus,
    editorialStatus: item.editorialStatus,
    revisions: revisions.map((revision) => ({
      ...revision,
      generatedAt: revision.generatedAt.toISOString(),
      publishedAt: revision.publishedAt?.toISOString() ?? null,
      supersededAt: revision.supersededAt?.toISOString() ?? null,
    })),
  };
}

export async function getLatestSuccessfulPolicySync(sourceConfigId?: string) {
  const sourceFilter = sourceConfigId
    ? eq(policyIntelligenceSyncRun.sourceConfigId, sourceConfigId)
    : undefined;
  const successfulStatuses = inArray(policyIntelligenceSyncRun.status, [
    "complete",
    "partial",
  ]);
  const [run] = await db
    .select()
    .from(policyIntelligenceSyncRun)
    .where(
      sourceFilter ? and(sourceFilter, successfulStatuses) : successfulStatuses
    )
    .orderBy(desc(policyIntelligenceSyncRun.completedAt))
    .limit(1);
  return run
    ? {
        sourceConfigId: run.sourceConfigId,
        status: run.status,
        completedAt: run.completedAt?.toISOString() ?? null,
        publishedCount: run.publishedCount,
        heldCount: run.heldCount,
        failureCount: run.failureCount,
      }
    : null;
}
