import "server-only";

import { and, eq } from "drizzle-orm";
import { getLazyDatabase } from "./runtime-client";
import { matterDocument } from "./schema";

const db = getLazyDatabase();

/** Exact unique-key lookup; intentionally independent of processingStatus/storageStatus. */
export async function getMatterDocumentSecurityByStorageKey(
  storageKey: string
) {
  const [record] = await db
    .select({
      id: matterDocument.id,
      securityStatus: matterDocument.securityStatus,
    })
    .from(matterDocument)
    .where(eq(matterDocument.storageKey, storageKey))
    .limit(1);
  return record
    ? { documentId: record.id, securityStatus: record.securityStatus }
    : null;
}

export async function getMatterDocumentSecurityStatus(documentId: string) {
  const [record] = await db
    .select({ securityStatus: matterDocument.securityStatus })
    .from(matterDocument)
    .where(eq(matterDocument.id, documentId))
    .limit(1);
  return record?.securityStatus ?? null;
}

export async function transitionMatterDocumentSecurityStatus(input: {
  documentId: string;
  expected: "pending";
  next: "clean" | "rejected" | "failed";
}) {
  const [record] = await db
    .update(matterDocument)
    .set({ securityStatus: input.next, updatedAt: new Date() })
    .where(
      and(
        eq(matterDocument.id, input.documentId),
        eq(matterDocument.securityStatus, input.expected)
      )
    )
    .returning({ id: matterDocument.id });
  return Boolean(record);
}
