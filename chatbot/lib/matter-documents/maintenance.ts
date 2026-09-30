export type MaintenanceRecord = {
  id: string;
  storageKey: string;
  storageStatus: "uploading" | "stored" | "cleanup_pending" | "storage_failed";
  processingStatus: string;
  deletedAt: Date | null;
  updatedAt: Date;
};

export type MaintenanceRepository = {
  listStale(input: {
    cutoff: Date;
    limit: number;
  }): Promise<MaintenanceRecord[]>;
  listDeleted(input: {
    cutoff: Date;
    limit: number;
  }): Promise<MaintenanceRecord[]>;
  hardDeleteDeleted(input: {
    documentId: string;
    cutoff: Date;
  }): Promise<boolean>;
};

export type MaintenanceStorage = {
  delete(input: { key: string }): Promise<void>;
};
export type CleanupService = {
  cleanupUpload(documentId: string): Promise<boolean>;
};

function validateBatch(input: { cutoff: Date; limit: number }) {
  if (!Number.isFinite(input.cutoff.getTime())) {
    throw new Error("invalid_cutoff");
  }
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
    throw new Error("invalid_batch_limit");
  }
}

export function createMatterDocumentMaintenanceService(deps: {
  repository: MaintenanceRepository;
  storage: MaintenanceStorage;
  cleanup: CleanupService;
}) {
  return {
    async recoverStale(input: {
      cutoff: Date;
      limit: number;
      apply?: boolean;
    }) {
      validateBatch(input);
      const records = (await deps.repository.listStale(input))
        .filter(
          (record) =>
            record.updatedAt < input.cutoff &&
            ["uploading", "cleanup_pending"].includes(record.storageStatus)
        )
        .sort(
          (a, b) =>
            a.updatedAt.getTime() - b.updatedAt.getTime() ||
            a.id.localeCompare(b.id)
        )
        .slice(0, input.limit);
      const results: Array<{ documentId: string; result: string }> = [];
      for (const record of records) {
        if (!input.apply) {
          results.push({ documentId: record.id, result: "would_recover" });
          continue;
        }
        try {
          const completed = await deps.cleanup.cleanupUpload(record.id);
          results.push({
            documentId: record.id,
            result: completed ? "recovered" : "skipped",
          });
        } catch {
          results.push({ documentId: record.id, result: "failed" });
        }
      }
      return { scanned: records.length, results };
    },
    async purgeDeleted(input: {
      cutoff: Date;
      limit: number;
      apply?: boolean;
    }) {
      validateBatch(input);
      const records = (await deps.repository.listDeleted(input))
        .filter(
          (record) =>
            record.deletedAt !== null &&
            record.deletedAt < input.cutoff &&
            record.processingStatus !== "processing"
        )
        .sort(
          (a, b) =>
            (a.deletedAt?.getTime() ?? 0) - (b.deletedAt?.getTime() ?? 0) ||
            a.id.localeCompare(b.id)
        )
        .slice(0, input.limit);
      const results: Array<{ documentId: string; result: string }> = [];
      for (const record of records) {
        if (
          record.deletedAt === null ||
          record.deletedAt >= input.cutoff ||
          record.processingStatus === "processing"
        ) {
          results.push({ documentId: record.id, result: "skipped" });
          continue;
        }
        if (!input.apply) {
          results.push({ documentId: record.id, result: "would_purge" });
          continue;
        }
        try {
          await deps.storage.delete({ key: record.storageKey });
        } catch {
          results.push({
            documentId: record.id,
            result: "storage_delete_failed",
          });
          continue;
        }
        try {
          const deleted = await deps.repository.hardDeleteDeleted({
            documentId: record.id,
            cutoff: input.cutoff,
          });
          results.push({
            documentId: record.id,
            result: deleted ? "purged" : "metadata_delete_conflict",
          });
        } catch {
          results.push({
            documentId: record.id,
            result: "metadata_delete_failed",
          });
        }
      }
      return { scanned: records.length, results };
    },
  };
}
