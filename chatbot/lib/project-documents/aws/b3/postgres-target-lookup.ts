import "server-only";

import { and, eq } from "drizzle-orm";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import {
  projectDocumentAsset,
  projectDocumentImportConsent,
  projectDocumentIntent,
  projectDocumentVersion,
  studyJourneyProject,
} from "@/lib/db/schema";
import type { ProjectDocumentScanTargetLookup } from "../scan-candidate";

type Database = ReturnType<typeof getLazyDatabase>;

/** Exact persisted target lookup; it grants no authority and performs no writes. */
export class PostgresProjectDocumentScanTargetLookup
  implements ProjectDocumentScanTargetLookup
{
  private readonly database: Database;
  private readonly expectedBucket: string;

  constructor(input: { database?: Database; expectedBucket: string }) {
    if (!input.expectedBucket.trim()) {
      throw new TypeError("an approved bucket identity is required");
    }
    this.database = input.database ?? getLazyDatabase();
    this.expectedBucket = input.expectedBucket;
  }

  async findByExactObjectIdentity(input: {
    bucket: string;
    objectKey: string;
    objectVersionId: string;
  }) {
    if (input.bucket !== this.expectedBucket || !input.objectVersionId.trim()) {
      return null;
    }
    const [row] = await this.database
      .select({
        projectId: projectDocumentVersion.projectId,
        assetId: projectDocumentVersion.assetId,
        versionId: projectDocumentVersion.versionId,
        generation: projectDocumentVersion.processingGeneration,
        storageKey: projectDocumentVersion.storageKey,
        storageObjectVersionId: projectDocumentVersion.storageObjectVersionId,
        sha256: projectDocumentVersion.sha256,
        byteSize: projectDocumentVersion.byteSize,
        storageStatus: projectDocumentVersion.storageStatus,
        storageVerifiedAt: projectDocumentVersion.storageVerifiedAt,
        securityStatus: projectDocumentVersion.securityStatus,
        assetLifecycle: projectDocumentAsset.lifecycle,
        projectLifecycle: studyJourneyProject.status,
        originKind: projectDocumentVersion.originKind,
        intentKind: projectDocumentIntent.intentKind,
        consentAccepted: projectDocumentImportConsent.accepted,
      })
      .from(projectDocumentVersion)
      .innerJoin(
        projectDocumentAsset,
        and(
          eq(projectDocumentAsset.projectId, projectDocumentVersion.projectId),
          eq(projectDocumentAsset.id, projectDocumentVersion.assetId)
        )
      )
      .innerJoin(
        studyJourneyProject,
        eq(studyJourneyProject.id, projectDocumentVersion.projectId)
      )
      .leftJoin(
        projectDocumentIntent,
        and(
          eq(projectDocumentIntent.projectId, projectDocumentVersion.projectId),
          eq(projectDocumentIntent.assetId, projectDocumentVersion.assetId),
          eq(projectDocumentIntent.versionId, projectDocumentVersion.versionId)
        )
      )
      .leftJoin(
        projectDocumentImportConsent,
        eq(
          projectDocumentImportConsent.operationRecordId,
          projectDocumentIntent.operationRecordId
        )
      )
      .where(
        and(
          eq(projectDocumentVersion.storageKey, input.objectKey),
          eq(
            projectDocumentVersion.storageObjectVersionId,
            input.objectVersionId
          )
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }
    if (
      row.originKind === "explicit_chat_import" &&
      (row.intentKind !== "chat_document_import" ||
        row.consentAccepted !== true)
    ) {
      return null;
    }
    return {
      projectId: row.projectId,
      assetId: row.assetId,
      versionId: row.versionId,
      generation: row.generation,
      currentGeneration: row.generation,
      storageKey: row.storageKey,
      storageObjectVersionId: row.storageObjectVersionId,
      sha256: row.sha256,
      byteSize: row.byteSize,
      objectIdentity:
        row.storageObjectVersionId === null
          ? null
          : {
              key: row.storageKey,
              objectVersionId: row.storageObjectVersionId,
              sha256: row.sha256,
              byteSize: row.byteSize,
            },
      storageStatus: row.storageStatus,
      storageVerifiedAt: row.storageVerifiedAt?.toISOString() ?? null,
      securityStatus: row.securityStatus,
      assetLifecycle: row.assetLifecycle,
      projectLifecycle: row.projectLifecycle,
    };
  }
}
