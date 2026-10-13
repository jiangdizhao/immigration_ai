import "server-only";

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  policyIntelligenceAnalysisRevision,
  policyIntelligenceItem,
  policyIntelligenceSourceSnapshot,
  policyIntelligenceSyncRun,
} from "@/lib/db/schema";
import type { LivePolicyRecord } from "../policy-intelligence-product";
import { currentPublicHistoryRows } from "../policy-intelligence-product";
import {
  type PolicyRevisionContentKind,
  policyAnalysisSchema,
  policyHumanRevisionContentSchema,
} from "./contracts";
import {
  isCurrentPublishedPolicyRevision,
  isPublishedRevisionStaleAgainstLatestSnapshot,
} from "./currentness";
import { db } from "./server-db";
import {
  boundedOfficialExcerpt,
  excerptLanguage,
} from "./source-first";

type ItemRow = typeof policyIntelligenceItem.$inferSelect;
type RevisionRow = typeof policyIntelligenceAnalysisRevision.$inferSelect;
type SnapshotRow = typeof policyIntelligenceSourceSnapshot.$inferSelect;

/**
 * Item states that may carry a publicly visible published revision. A newer
 * held source snapshot moves the item to `review_required`; the previously
 * published revision stays public (Stage 3 stability fix). `draft` and
 * `archived` never publish anything.
 */
const PUBLIC_ITEM_STATUSES = ["published", "review_required"] as const;

/**
 * Phase 12 Stage 3 D-072 — the public source-first payload: a bounded verbatim
 * excerpt of the stored official text plus the recorded advisories. The excerpt
 * is never generated; when the stored text is too short to excerpt honestly the
 * notice simply shows the official title and link.
 */
function sourceFirstPayload(revision: RevisionRow, snapshot: SnapshotRow) {
  const excerpt = boundedOfficialExcerpt(snapshot.normalizedEvidence);
  const metadata =
    typeof revision.modelMetadata === "object" && revision.modelMetadata !== null
      ? (revision.modelMetadata as { sourceFirst?: { reason?: unknown }; advisories?: unknown })
      : {};
  const reason =
    typeof metadata.sourceFirst?.reason === "string" &&
    /^[a-z0-9_]{1,64}$/.test(metadata.sourceFirst.reason)
      ? metadata.sourceFirst.reason
      : "analysis_unavailable";
  return {
    reason,
    excerpt,
    excerptLanguage: excerpt ? excerptLanguage(excerpt) : ("en" as const),
    advisories: Array.isArray(metadata.advisories)
      ? metadata.advisories
          .filter(
            (code): code is string =>
              typeof code === "string" &&
              code.length > 0 &&
              code.length <= 100 &&
              /^[a-z0-9_]+$/.test(code)
          )
          .slice(0, 40)
      : [],
  };
}

function provenanceForRevisionKind(
  kind: string
): LivePolicyRecord["provenance"] {
  if (kind === "lawyer_override") {
    return "lawyer_override";
  }
  if (kind === "lawyer_authored") {
    return "lawyer_authored";
  }
  if (kind === "source_first") {
    // Phase 12 Stage 3 D-072: an official-source notice is not AI analysis and
    // must never be presented as verified AI interpretation.
    return "official_source_update";
  }
  return "automated_verified";
}

/**
 * Maps one joined item/revision/snapshot row into the public read model.
 *
 * The AI-analysis and human-content branches never borrow each other's fields:
 * a human revision is never dressed up with AI analysis metadata and an AI
 * revision is never given human content.
 */
export function toLivePolicyRecord(input: {
  item: ItemRow;
  revision: RevisionRow;
  snapshot: SnapshotRow | null;
}): LivePolicyRecord {
  const { item, revision, snapshot } = input;
  const contentKind = revision.contentKind as PolicyRevisionContentKind;
  const provenance = provenanceForRevisionKind(contentKind);
  const humanContent = revision.humanContent
    ? policyHumanRevisionContentSchema.parse(revision.humanContent)
    : null;
  const analysis = revision.analysis
    ? policyAnalysisSchema.parse(revision.analysis)
    : null;
  if (contentKind === "ai_analysis" && !analysis) {
    throw new Error("policy_revision_analysis_missing");
  }
  if (
    (contentKind === "lawyer_authored" || contentKind === "lawyer_override") &&
    !humanContent
  ) {
    throw new Error("policy_revision_human_content_missing");
  }
  if (contentKind === "source_first" && !snapshot) {
    // A source-first publication is the official source itself: without the
    // snapshot there is nothing authentic to show.
    throw new Error("policy_revision_source_missing");
  }
  const isLawyerAuthored = provenance === "lawyer_authored";
  const sourceFirst =
    contentKind === "source_first" && snapshot
      ? sourceFirstPayload(revision, snapshot)
      : null;
  const sourceStatus =
    humanContent?.sourceStatus ??
    analysis?.sourceStatus.value ??
    item.sourceStatus;
  return {
    id: item.id,
    slug: item.slug,
    origin: item.origin === "manual" ? "manual" : "automated",
    provenance,
    sourceStatus,
    source: {
      authority:
        isLawyerAuthored && humanContent
          ? humanContent.attribution
          : (snapshot?.authority ?? humanContent?.attribution ?? ""),
      officialTitle: isLawyerAuthored
        ? null
        : (snapshot?.officialTitle ?? null),
      officialUrl: isLawyerAuthored ? null : (snapshot?.canonicalUrl ?? null),
      sourceDate: snapshot?.sourceDate ?? null,
      effectiveDate: snapshot?.effectiveDate ?? null,
      jurisdiction: "Australia",
      category: item.primarySourceConfigId ?? "lawyer-authored",
    },
    analysis,
    humanContent,
    sourceFirst,
    revision: {
      id: revision.id,
      number: revision.revisionNumber,
      generatedAt: new Date(revision.generatedAt).toISOString(),
      publishedAt: revision.publishedAt
        ? new Date(revision.publishedAt).toISOString()
        : null,
    },
    publicAttribution: humanContent?.attribution ?? null,
    publicationMode:
      item.publicationMode === "human_protected"
        ? "human_protected"
        : "automatic",
    editorialDates: humanContent
      ? {
          officialSourceDate: humanContent.officialSourceDate,
          commencementDate: humanContent.commencementDate,
          reviewedAsOfDate: humanContent.reviewedAsOfDate,
        }
      : null,
    newerSourcePendingReview: isPublishedRevisionStaleAgainstLatestSnapshot({
      item,
      revision,
    }),
  };
}

/**
 * Server-only read model for the published Policy Intelligence feed.
 *
 * This unifies the three publication pathways (automated verified analysis,
 * lawyer override, lawyer-authored commentary) into one list, and it keeps an
 * approved published revision visible while a newer source snapshot is held
 * for review.
 */
/**
 * Durability index for the compatibility-registry merge (Phase 12 Stage 3
 * owner-host correction): every durable item slug plus whether that item has
 * ever published a revision. The public merge uses this to guarantee that a
 * durable policy which was published and later withdrawn/archived can never be
 * replaced on the public page by an obsolete bundled compatibility entry.
 */
export type PolicyDurabilityRow = {
  slug: string;
  everPublished: boolean;
};

export async function getPolicyIntelligenceDurabilityRows(): Promise<
  PolicyDurabilityRow[]
> {
  const rows = await db
    .select({
      slug: policyIntelligenceItem.slug,
      latestPublishedRevisionId:
        policyIntelligenceItem.latestPublishedRevisionId,
    })
    .from(policyIntelligenceItem);
  return rows.map((row) => ({
    slug: row.slug,
    everPublished: row.latestPublishedRevisionId !== null,
  }));
}

export async function getPublishedPolicyIntelligenceList(): Promise<
  LivePolicyRecord[]
> {
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
    .leftJoin(
      policyIntelligenceSourceSnapshot,
      eq(
        policyIntelligenceAnalysisRevision.snapshotId,
        policyIntelligenceSourceSnapshot.id
      )
    )
    .where(
      and(
        inArray(policyIntelligenceItem.editorialStatus, [
          ...PUBLIC_ITEM_STATUSES,
        ]),
        eq(
          policyIntelligenceAnalysisRevision.itemId,
          policyIntelligenceItem.id
        ),
        eq(policyIntelligenceAnalysisRevision.editorialStatus, "published")
      )
    );
  return rows
    .filter(({ item, revision, snapshot }) =>
      isCurrentPublishedPolicyRevision({
        item,
        revision,
        snapshot: snapshot ?? null,
      })
    )
    .map(({ item, revision, snapshot }) =>
      toLivePolicyRecord({ item, revision, snapshot: snapshot ?? null })
    )
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
      generatedAt: new Date(revision.generatedAt).toISOString(),
      publishedAt: revision.publishedAt
        ? new Date(revision.publishedAt).toISOString()
        : null,
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

/**
 * Public revision history. Rows are returned only while the item still has a
 * publicly current published revision; older published/superseded revisions
 * are then listed alongside it so the history stays truthful.
 */
export async function getPublishedPolicyIntelligenceHistory(slug: string) {
  const rows = await db
    .select({
      item: policyIntelligenceItem,
      revision: policyIntelligenceAnalysisRevision,
      snapshot: policyIntelligenceSourceSnapshot,
    })
    .from(policyIntelligenceItem)
    .innerJoin(
      policyIntelligenceAnalysisRevision,
      eq(policyIntelligenceAnalysisRevision.itemId, policyIntelligenceItem.id)
    )
    .leftJoin(
      policyIntelligenceSourceSnapshot,
      eq(
        policyIntelligenceSourceSnapshot.id,
        policyIntelligenceAnalysisRevision.snapshotId
      )
    )
    .where(
      and(
        eq(policyIntelligenceItem.slug, slug),
        isNotNull(policyIntelligenceItem.latestPublishedRevisionId),
        inArray(policyIntelligenceItem.editorialStatus, [
          ...PUBLIC_ITEM_STATUSES,
        ]),
        inArray(policyIntelligenceAnalysisRevision.editorialStatus, [
          "published",
          "superseded",
        ]),
        isNotNull(policyIntelligenceAnalysisRevision.publishedAt)
      )
    )
    .orderBy(desc(policyIntelligenceAnalysisRevision.revisionNumber))
    .limit(20);

  const publicRows = currentPublicHistoryRows(
    rows.map((row) => ({ ...row, snapshot: row.snapshot ?? null }))
  );
  if (!publicRows) {
    return null;
  }
  const current = publicRows.find(({ item, revision, snapshot }) =>
    isCurrentPublishedPolicyRevision({
      item,
      revision,
      snapshot: snapshot ?? null,
    })
  );
  if (!current) {
    return null;
  }

  return {
    id: current.item.id,
    slug: current.item.slug,
    revisions: publicRows.map(({ item, revision, snapshot }) => ({
      editorialStatus: revision.editorialStatus as "published" | "superseded",
      record: toLivePolicyRecord({
        item,
        revision,
        snapshot: snapshot ?? null,
      }),
    })),
  };
}
