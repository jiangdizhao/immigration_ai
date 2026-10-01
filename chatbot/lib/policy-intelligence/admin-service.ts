import "server-only";

import { and, desc, eq } from "drizzle-orm";
import {
  policyIntelligenceAnalysisRevision,
  policyIntelligenceItem,
  policyIntelligenceSourceSnapshot,
} from "@/lib/db/schema";
import type {
  AdminPolicyIntelligenceItem,
  AdminPolicyIntelligenceService,
} from "./admin-api";
import { policyAnalysisSchema } from "./contracts";
import { db } from "./server-db";

export const adminPolicyIntelligenceService: AdminPolicyIntelligenceService = {
  async listItems() {
    const rows = await db
      .select({
        item: policyIntelligenceItem,
        snapshot: policyIntelligenceSourceSnapshot,
        revision: policyIntelligenceAnalysisRevision,
      })
      .from(policyIntelligenceItem)
      .leftJoin(
        policyIntelligenceSourceSnapshot,
        and(
          eq(
            policyIntelligenceSourceSnapshot.id,
            policyIntelligenceItem.latestSnapshotId
          ),
          eq(
            policyIntelligenceSourceSnapshot.itemId,
            policyIntelligenceItem.id
          )
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

    return rows.map(({ item, snapshot, revision }) => {
      const parsedAnalysis = revision
        ? policyAnalysisSchema.safeParse(revision.analysis)
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
        publishedAt: revision?.publishedAt?.toISOString() ?? null,
        updatedAt: item.updatedAt.toISOString(),
      };
    }) satisfies AdminPolicyIntelligenceItem[];
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
                    eq(
                      policyIntelligenceAnalysisRevision.itemId,
                      item.id
                    ),
                    eq(
                      policyIntelligenceAnalysisRevision.editorialStatus,
                      "published"
                    ),
                    eq(
                      policyIntelligenceAnalysisRevision.snapshotId,
                      item.latestSnapshotId
                    ),
                    eq(
                      policyIntelligenceSourceSnapshot.itemId,
                      item.id
                    )
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
