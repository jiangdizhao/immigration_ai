import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import {
  policyEditorGrant,
  policyIntelligenceAnalysisRevision,
  policyIntelligenceDraftSnapshot,
  policyIntelligenceEditorialEvent,
  policyIntelligenceItem,
  policyIntelligenceSourceSnapshot,
  user,
} from "@/lib/db/schema";
import {
  POLICY_ANALYSIS_SCHEMA,
  POLICY_HUMAN_REVISION_SCHEMA,
  type PolicyEvidencePacketItem,
} from "./contracts";
import type {
  EditorialActor,
  EditorialAuditRow,
  EditorialGrantRow,
  EditorialItemRow,
  EditorialRevisionRow,
  PolicyEditorialRepository,
  PolicyEditorialTx,
} from "./editorial-core";
import { db } from "./server-db";

type ItemDbRow = typeof policyIntelligenceItem.$inferSelect;
type RevisionDbRow = typeof policyIntelligenceAnalysisRevision.$inferSelect;
type AuditDbRow = typeof policyIntelligenceEditorialEvent.$inferSelect;

function asItem(row: ItemDbRow): EditorialItemRow {
  return {
    id: row.id,
    slug: row.slug,
    origin: row.origin === "manual" ? "manual" : "automated",
    editorialStatus: row.editorialStatus,
    sourceStatus: row.sourceStatus,
    latestSnapshotId: row.latestSnapshotId,
    latestPublishedRevisionId: row.latestPublishedRevisionId,
    createdByUserId: row.createdByUserId,
    publicationMode:
      row.publicationMode === "human_protected"
        ? "human_protected"
        : "automatic",
    protectionSetAt: row.protectionSetAt,
    protectionSetByUserId: row.protectionSetByUserId,
    updatedAt: row.updatedAt,
  };
}

function asRevision(row: RevisionDbRow): EditorialRevisionRow {
  return {
    id: row.id,
    itemId: row.itemId,
    snapshotId: row.snapshotId,
    contentKind: row.contentKind,
    analysisFingerprint: row.analysisFingerprint,
    revisionNumber: row.revisionNumber,
    editorialStatus: row.editorialStatus,
    analysis: row.analysis,
    verification: row.verification,
    humanContent: row.humanContent,
    aiDecision: row.aiDecision,
    overrideReason: row.overrideReason,
    idempotencyKey: row.idempotencyKey,
    baseRevisionId: row.baseRevisionId,
    createdByUserId: row.createdByUserId,
    generatedAt: row.generatedAt,
    publishedAt: row.publishedAt,
    supersededAt: row.supersededAt,
    createdAt: row.createdAt,
  };
}

function asAudit(row: AuditDbRow): EditorialAuditRow {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    itemId: row.itemId,
    revisionId: row.revisionId,
    overrideReason: row.overrideReason,
    detail: (row.detail as Record<string, unknown>) ?? {},
    createdAt: row.createdAt,
  };
}

export function toEvidencePacket(
  row: typeof policyIntelligenceSourceSnapshot.$inferSelect
): PolicyEvidencePacketItem {
  return {
    evidenceRef: `policy-snapshot:${row.id}`,
    snapshotId: row.id,
    sourceConfigId: row.sourceConfigId,
    sourceId: row.sourceId,
    authority: row.authority,
    canonicalUrl: row.canonicalUrl,
    officialTitle: row.officialTitle,
    retrievedAt: row.retrievedAt.toISOString(),
    contentHash: row.contentHash,
    sourceDate: row.sourceDate,
    effectiveDate: row.effectiveDate,
    evidenceTruncated: row.evidenceTruncated,
    text: row.normalizedEvidence,
  };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function createTx(tx: Transaction): PolicyEditorialTx {
  return {
    async getActor(userId) {
      const [row] = await tx
        .select({
          id: user.id,
          role: user.role,
          email: user.email,
          emailVerifiedAt: user.emailVerifiedAt,
        })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      return row
        ? {
            userId: row.id,
            role: row.role,
            email: row.email,
            emailVerifiedAt: row.emailVerifiedAt,
          }
        : null;
    },
    async isActivePolicyEditor(userId) {
      const [row] = await tx
        .select({ id: policyEditorGrant.id })
        .from(policyEditorGrant)
        .where(
          and(
            eq(policyEditorGrant.userId, userId),
            isNull(policyEditorGrant.revokedAt)
          )
        )
        .limit(1);
      return Boolean(row);
    },
    async getItemForUpdate(itemId) {
      const [row] = await tx
        .select()
        .from(policyIntelligenceItem)
        .where(eq(policyIntelligenceItem.id, itemId))
        .for("update")
        .limit(1);
      return row ? asItem(row) : null;
    },
    async findItemBySlug(slug) {
      const [row] = await tx
        .select()
        .from(policyIntelligenceItem)
        .where(eq(policyIntelligenceItem.slug, slug))
        .limit(1);
      return row ? asItem(row) : null;
    },
    async getRevisionForUpdate(revisionId) {
      const [row] = await tx
        .select()
        .from(policyIntelligenceAnalysisRevision)
        .where(eq(policyIntelligenceAnalysisRevision.id, revisionId))
        .for("update")
        .limit(1);
      return row ? asRevision(row) : null;
    },
    async listRevisions(itemId) {
      const rows = await tx
        .select()
        .from(policyIntelligenceAnalysisRevision)
        .where(eq(policyIntelligenceAnalysisRevision.itemId, itemId))
        .orderBy(asc(policyIntelligenceAnalysisRevision.revisionNumber));
      return rows.map(asRevision);
    },
    async maxRevisionNumber(itemId) {
      const [row] = await tx
        .select({
          value: sql<number>`coalesce(max(${policyIntelligenceAnalysisRevision.revisionNumber}), 0)`,
        })
        .from(policyIntelligenceAnalysisRevision)
        .where(eq(policyIntelligenceAnalysisRevision.itemId, itemId));
      return Number(row?.value ?? 0);
    },
    async findRevisionByIdempotencyKey(itemId, idempotencyKey) {
      const [row] = await tx
        .select()
        .from(policyIntelligenceAnalysisRevision)
        .where(
          and(
            eq(policyIntelligenceAnalysisRevision.itemId, itemId),
            eq(
              policyIntelligenceAnalysisRevision.idempotencyKey,
              idempotencyKey
            )
          )
        )
        .limit(1);
      return row ? asRevision(row) : null;
    },
    async getSourceSnapshotForItem({ itemId, snapshotId }) {
      const [row] = await tx
        .select({
          id: policyIntelligenceSourceSnapshot.id,
          itemId: policyIntelligenceSourceSnapshot.itemId,
          authority: policyIntelligenceSourceSnapshot.authority,
          canonicalUrl: policyIntelligenceSourceSnapshot.canonicalUrl,
          officialTitle: policyIntelligenceSourceSnapshot.officialTitle,
          sourceDate: policyIntelligenceSourceSnapshot.sourceDate,
          effectiveDate: policyIntelligenceSourceSnapshot.effectiveDate,
          sourceMetadata: policyIntelligenceSourceSnapshot.sourceMetadata,
          retrievedAt: policyIntelligenceSourceSnapshot.retrievedAt,
        })
        .from(policyIntelligenceSourceSnapshot)
        .where(
          snapshotId
            ? and(
                eq(policyIntelligenceSourceSnapshot.itemId, itemId),
                eq(policyIntelligenceSourceSnapshot.id, snapshotId)
              )
            : eq(policyIntelligenceSourceSnapshot.itemId, itemId)
        )
        .orderBy(desc(policyIntelligenceSourceSnapshot.retrievedAt))
        .limit(1);
      return row
        ? { ...row, retrievedAt: row.retrievedAt.toISOString() }
        : null;
    },
    async getSnapshotEvidence(snapshotId) {
      const [row] = await tx
        .select()
        .from(policyIntelligenceSourceSnapshot)
        .where(eq(policyIntelligenceSourceSnapshot.id, snapshotId))
        .limit(1);
      return row ? toEvidencePacket(row) : null;
    },
    async insertItem(values) {
      const [row] = await tx
        .insert(policyIntelligenceItem)
        .values({
          slug: values.slug,
          origin: values.origin,
          editorialStatus: values.editorialStatus,
          sourceStatus:
            values.sourceStatus as typeof policyIntelligenceItem.$inferInsert.sourceStatus,
          createdByUserId: values.createdByUserId,
        })
        .returning();
      return asItem(row);
    },
    async insertItemIfSlugAvailable(values) {
      // Conflict-free insert: a concurrent create of the same slug resolves to
      // `slug_taken` instead of raising a unique-violation error.
      const [row] = await tx
        .insert(policyIntelligenceItem)
        .values({
          slug: values.slug,
          origin: values.origin,
          editorialStatus: values.editorialStatus,
          sourceStatus:
            values.sourceStatus as typeof policyIntelligenceItem.$inferInsert.sourceStatus,
          createdByUserId: values.createdByUserId,
        })
        .onConflictDoNothing({
          target: policyIntelligenceItem.slug,
        })
        .returning();
      return row
        ? { status: "created" as const, item: asItem(row) }
        : { status: "slug_taken" as const };
    },
    async insertDraftSnapshot(values) {
      const [row] = await tx
        .insert(policyIntelligenceDraftSnapshot)
        .values({
          itemId: values.itemId,
          revisionId: values.revisionId,
          saveNumber: values.saveNumber,
          contentVersion: values.contentVersion,
          contentDigest: values.contentDigest,
          humanContent: values.humanContent,
          contentBytes: values.contentBytes,
          savedByUserId: values.savedByUserId,
          createdAt: values.now,
        })
        .returning();
      return {
        id: row.id,
        itemId: row.itemId,
        revisionId: row.revisionId,
        saveNumber: row.saveNumber,
        contentVersion: row.contentVersion,
        contentDigest: row.contentDigest,
        humanContent: row.humanContent,
        contentBytes: row.contentBytes,
        savedByUserId: row.savedByUserId,
        createdAt: row.createdAt,
      };
    },
    async listDraftSnapshots(revisionId, limit) {
      const rows = await tx
        .select()
        .from(policyIntelligenceDraftSnapshot)
        .where(eq(policyIntelligenceDraftSnapshot.revisionId, revisionId))
        .orderBy(asc(policyIntelligenceDraftSnapshot.saveNumber))
        .limit(Math.max(1, Math.min(200, limit)));
      return rows.map((row) => ({
        id: row.id,
        itemId: row.itemId,
        revisionId: row.revisionId,
        saveNumber: row.saveNumber,
        contentVersion: row.contentVersion,
        contentDigest: row.contentDigest,
        humanContent: row.humanContent,
        contentBytes: row.contentBytes,
        savedByUserId: row.savedByUserId,
        createdAt: row.createdAt,
      }));
    },
    async deleteDraftSnapshots(ids) {
      if (!ids.length) {
        return;
      }
      await tx
        .delete(policyIntelligenceDraftSnapshot)
        .where(inArray(policyIntelligenceDraftSnapshot.id, ids));
    },
    async insertRevision(values) {
      const [row] = await tx
        .insert(policyIntelligenceAnalysisRevision)
        .values({
          itemId: values.itemId,
          snapshotId: values.snapshotId,
          contentKind: values.contentKind,
          analysisFingerprint: values.analysisFingerprint,
          revisionNumber: values.revisionNumber,
          schemaVersion:
            values.schemaVersion ??
            (values.contentKind === "ai_analysis"
              ? POLICY_ANALYSIS_SCHEMA
              : POLICY_HUMAN_REVISION_SCHEMA),
          analysis: null,
          verification: null,
          modelMetadata: values.modelMetadata ?? null,
          humanContent: values.humanContent,
          aiDecision: values.aiDecision,
          overrideReason: values.overrideReason,
          idempotencyKey: values.idempotencyKey,
          baseRevisionId: values.baseRevisionId,
          createdByUserId: values.createdByUserId,
          editorialStatus: values.editorialStatus,
          generatedAt: new Date(values.generatedAt),
          publishedAt: values.publishedAt ? new Date(values.publishedAt) : null,
        })
        .returning();
      return asRevision(row);
    },
    async updateItem(itemId, values) {
      const patch: Record<string, unknown> = {};
      if (values.editorialStatus !== undefined) {
        patch.editorialStatus = values.editorialStatus;
      }
      if (values.sourceStatus !== undefined) {
        patch.sourceStatus = values.sourceStatus;
      }
      if (values.latestPublishedRevisionId !== undefined) {
        patch.latestPublishedRevisionId = values.latestPublishedRevisionId;
      }
      if (values.publicationMode !== undefined) {
        patch.publicationMode = values.publicationMode;
      }
      if (values.protectionSetAt !== undefined) {
        patch.protectionSetAt = values.protectionSetAt;
      }
      if (values.protectionSetByUserId !== undefined) {
        patch.protectionSetByUserId = values.protectionSetByUserId;
      }
      patch.updatedAt = values.updatedAt ?? new Date();
      await tx
        .update(policyIntelligenceItem)
        .set(patch)
        .where(eq(policyIntelligenceItem.id, itemId));
    },
    async updateRevision(revisionId, values) {
      const patch: Record<string, unknown> = {};
      if (values.editorialStatus !== undefined) {
        patch.editorialStatus = values.editorialStatus;
      }
      if (values.publishedAt !== undefined) {
        patch.publishedAt = values.publishedAt;
      }
      if (values.supersededAt !== undefined) {
        patch.supersededAt = values.supersededAt;
      }
      if (values.humanContent !== undefined) {
        patch.humanContent = values.humanContent;
      }
      if (values.analysisFingerprint !== undefined) {
        patch.analysisFingerprint = values.analysisFingerprint;
      }
      if (values.idempotencyKey !== undefined) {
        patch.idempotencyKey = values.idempotencyKey;
      }
      if (Object.keys(patch).length > 0) {
        await tx
          .update(policyIntelligenceAnalysisRevision)
          .set(patch)
          .where(eq(policyIntelligenceAnalysisRevision.id, revisionId));
      }
    },
    async appendAuditEvent(values) {
      await tx.insert(policyIntelligenceEditorialEvent).values({
        actorUserId: values.actorUserId,
        action:
          values.action as typeof policyIntelligenceEditorialEvent.$inferInsert.action,
        itemId: values.itemId,
        revisionId: values.revisionId,
        overrideReason: values.overrideReason,
        detail: values.detail,
      });
    },
    async activatePolicyEditorGrant(values) {
      // Grant intent: create the row when absent, or explicitly reactivate an
      // existing (possibly revoked) row. `(xmax = 0)` distinguishes a real
      // insert from an upsert update so the audit trail can report reactivation
      // instead of claiming a fresh grant.
      const [row] = await tx
        .insert(policyEditorGrant)
        .values({
          userId: values.userId,
          grantedByUserId: values.adminUserId,
          grantedAt: values.now,
          revokedAt: null,
          revokedByUserId: null,
          updatedAt: values.now,
        })
        .onConflictDoUpdate({
          target: policyEditorGrant.userId,
          set: {
            grantedByUserId: values.adminUserId,
            grantedAt: values.now,
            revokedAt: null,
            revokedByUserId: null,
            updatedAt: values.now,
          },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      return { reactivated: row?.inserted === false };
    },
    async revokePolicyEditorGrant(values) {
      // R3 P0: revoke is intentionally update-only. A plain UPDATE can never
      // insert, so revoking a user who was never granted permission cannot
      // create an active grant (the previous upsert could). The row lock taken
      // by the UPDATE also serialises against a concurrent grant: if the grant
      // commits afterwards it re-applies its explicit activation, otherwise the
      // revoke stands — either way the stored state always reflects the last
      // explicit admin intent and never an implicit grant.
      const revoked = await tx
        .update(policyEditorGrant)
        .set({
          revokedAt: values.now,
          revokedByUserId: values.adminUserId,
          updatedAt: values.now,
        })
        .where(
          and(
            eq(policyEditorGrant.userId, values.userId),
            isNull(policyEditorGrant.revokedAt)
          )
        )
        .returning({ userId: policyEditorGrant.userId });
      if (revoked.length > 0) {
        return "revoked";
      }
      const [existing] = await tx
        .select({ userId: policyEditorGrant.userId })
        .from(policyEditorGrant)
        .where(eq(policyEditorGrant.userId, values.userId))
        .limit(1);
      return existing ? "already_revoked" : "not_granted";
    },
  };
}

export const policyEditorialRepository: PolicyEditorialRepository = {
  async run(work) {
    return await db.transaction(
      async (transaction) => await work(createTx(transaction))
    );
  },

  async listEditorialItems(limit, offset) {
    const rows = await db
      .select()
      .from(policyIntelligenceItem)
      .orderBy(
        desc(policyIntelligenceItem.updatedAt),
        desc(policyIntelligenceItem.id)
      )
      .limit(Math.max(1, Math.min(201, limit)))
      .offset(Math.max(0, offset));
    return rows.map(asItem);
  },

  async listRevisionsForItems(itemIds) {
    if (!itemIds.length) {
      return [];
    }
    const rows = await db
      .select()
      .from(policyIntelligenceAnalysisRevision)
      .where(inArray(policyIntelligenceAnalysisRevision.itemId, itemIds))
      .orderBy(
        asc(policyIntelligenceAnalysisRevision.itemId),
        asc(policyIntelligenceAnalysisRevision.revisionNumber)
      );
    return rows.map(asRevision);
  },

  async loadItemDetail(itemId) {
    const [itemRow] = await db
      .select()
      .from(policyIntelligenceItem)
      .where(eq(policyIntelligenceItem.id, itemId))
      .limit(1);
    if (!itemRow) {
      return null;
    }
    const revisionRows = await db
      .select()
      .from(policyIntelligenceAnalysisRevision)
      .where(eq(policyIntelligenceAnalysisRevision.itemId, itemId))
      .orderBy(asc(policyIntelligenceAnalysisRevision.revisionNumber));
    const auditRows = await db
      .select()
      .from(policyIntelligenceEditorialEvent)
      .where(eq(policyIntelligenceEditorialEvent.itemId, itemId))
      .orderBy(
        desc(policyIntelligenceEditorialEvent.createdAt),
        desc(policyIntelligenceEditorialEvent.id)
      )
      .limit(50);
    const [snapshotRow] = await db
      .select({
        authority: policyIntelligenceSourceSnapshot.authority,
        officialTitle: policyIntelligenceSourceSnapshot.officialTitle,
        canonicalUrl: policyIntelligenceSourceSnapshot.canonicalUrl,
        sourceDate: policyIntelligenceSourceSnapshot.sourceDate,
      })
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
          eq(policyIntelligenceAnalysisRevision.itemId, itemId),
          isNotNull(policyIntelligenceAnalysisRevision.snapshotId)
        )
      )
      .orderBy(desc(policyIntelligenceAnalysisRevision.revisionNumber))
      .limit(1);
    return {
      item: asItem(itemRow),
      revisions: revisionRows.map(asRevision),
      audit: auditRows.map(asAudit),
      snapshot: snapshotRow ?? null,
    };
  },

  async listAuditEvents(itemId, limit) {
    const rows = await db
      .select()
      .from(policyIntelligenceEditorialEvent)
      .where(eq(policyIntelligenceEditorialEvent.itemId, itemId))
      .orderBy(
        desc(policyIntelligenceEditorialEvent.createdAt),
        desc(policyIntelligenceEditorialEvent.id)
      )
      .limit(Math.max(1, Math.min(200, limit)));
    return rows.map(asAudit);
  },

  async listPolicyEditorGrants() {
    const rows = await db
      .select({
        userId: policyEditorGrant.userId,
        email: user.email,
        grantedByUserId: policyEditorGrant.grantedByUserId,
        grantedAt: policyEditorGrant.grantedAt,
        revokedByUserId: policyEditorGrant.revokedByUserId,
        revokedAt: policyEditorGrant.revokedAt,
      })
      .from(policyEditorGrant)
      .innerJoin(user, eq(user.id, policyEditorGrant.userId))
      .orderBy(desc(policyEditorGrant.updatedAt))
      .limit(200);
    const grants: EditorialGrantRow[] = rows.map((row) => ({
      userId: row.userId,
      email: row.email,
      grantedByUserId: row.grantedByUserId,
      grantedAt: row.grantedAt,
      revokedByUserId: row.revokedByUserId,
      revokedAt: row.revokedAt,
    }));
    return grants;
  },

  async findUserByEmail(email) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const [row] = await db
      .select({
        id: user.id,
        role: user.role,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
      })
      .from(user)
      .where(sql`lower(trim(${user.email})) = ${normalized}`)
      .limit(1);
    if (!row) {
      return null;
    }
    const actor: EditorialActor = {
      userId: row.id,
      role: row.role,
      email: row.email,
      emailVerifiedAt: row.emailVerifiedAt,
    };
    return actor;
  },
};
