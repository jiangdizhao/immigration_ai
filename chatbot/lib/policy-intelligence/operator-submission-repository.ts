import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  policyEditorGrant,
  policyIntelligenceEditorialEvent,
  policyIntelligenceOperatorSubmission,
  user,
} from "@/lib/db/schema";
import type {
  OperatorSubmissionRepository,
  OperatorSubmissionTx,
} from "./operator-submission";
import { db } from "./server-db";

type SubmissionDbRow = typeof policyIntelligenceOperatorSubmission.$inferSelect;

function asSubmission(row: SubmissionDbRow) {
  return {
    id: row.id,
    submittedUrl: row.submittedUrl,
    submittedByUserId: row.submittedByUserId,
    note: row.note,
    status: row.status,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
  };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function createTx(tx: Transaction): OperatorSubmissionTx {
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
    async findPendingSubmissionByUrl(submittedUrl) {
      const [row] = await tx
        .select()
        .from(policyIntelligenceOperatorSubmission)
        .where(
          and(
            eq(policyIntelligenceOperatorSubmission.submittedUrl, submittedUrl),
            eq(policyIntelligenceOperatorSubmission.status, "pending")
          )
        )
        .limit(1);
      return row ? asSubmission(row) : null;
    },
    async insertSubmission(values) {
      const [row] = await tx
        .insert(policyIntelligenceOperatorSubmission)
        .values({
          submittedUrl: values.submittedUrl,
          submittedByUserId: values.submittedByUserId,
          note: values.note,
          status: "pending",
          createdAt: values.now,
        })
        .returning();
      return asSubmission(row);
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
  };
}

export const operatorSubmissionRepository: OperatorSubmissionRepository = {
  async run(work) {
    return await db.transaction(
      async (transaction) => await work(createTx(transaction))
    );
  },

  async listSubmissions(limit) {
    const rows = await db
      .select()
      .from(policyIntelligenceOperatorSubmission)
      .orderBy(
        desc(policyIntelligenceOperatorSubmission.createdAt),
        desc(policyIntelligenceOperatorSubmission.id)
      )
      .limit(Math.max(1, Math.min(100, limit)));
    return rows.map(asSubmission);
  },

  async listPendingSubmissions(limit) {
    const rows = await db
      .select()
      .from(policyIntelligenceOperatorSubmission)
      .where(eq(policyIntelligenceOperatorSubmission.status, "pending"))
      .orderBy(asc(policyIntelligenceOperatorSubmission.createdAt))
      .limit(Math.max(1, Math.min(100, limit)));
    return rows.map(asSubmission);
  },

  async markSubmission({ id, status, errorCode, now }) {
    await db
      .update(policyIntelligenceOperatorSubmission)
      .set({
        status,
        errorCode,
        attemptedAt: now,
        consumedAt: status === "consumed" ? now : null,
      })
      .where(eq(policyIntelligenceOperatorSubmission.id, id));
  },
};
