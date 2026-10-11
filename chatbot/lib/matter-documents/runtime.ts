import "server-only";

import {
  beginMatterDocumentProcessing,
  createMatterDocumentRecord,
  failMatterDocumentProcessing,
  finalizeMatterDocumentProcessing,
  getImmigrationConversationByChatId,
  getLatestMatterDocumentProcessing,
  getMatterDocumentProcessingEvidence,
  getMatterDocumentRecordForOwner,
  getMatterDocumentRecordForStorageCleanup,
  listMatterDocumentRecordsForOwner,
  listMatterDocumentsForUserHistoryPage,
  softDeleteMatterDocumentRecord,
  transitionMatterDocumentStorageStatus,
} from "@/lib/db/queries";
import type { MatterDocument } from "@/lib/db/schema";
import type { MatterDocumentMimeType } from "./formats";
import { getConfiguredDocumentVision } from "./processing/openai-vision";
import { createMatterDocumentProcessingService } from "./processing/service";
import { createMatterDocumentService } from "./service";
import { createS3MatterDocumentStorage } from "./storage";
import type { MatterDocumentRepository } from "./types";

const repository: MatterDocumentRepository = {
  getOwnedConversation: ({ chatId, userId }) =>
    getImmigrationConversationByChatId({ chatId, userId }),
  create: createMatterDocumentRecord,
  list(input) {
    const records = listMatterDocumentRecordsForOwner(input);
    return records.then((rows) =>
      rows.map(({ matterDocument }) => matterDocument)
    );
  },
  async listForUserHistory(input) {
    const page = await listMatterDocumentsForUserHistoryPage(input);
    return {
      hasMore: page.hasMore,
      documents: page.documents.map((row) => ({
        ...row,
        mimeType: row.mimeType as MatterDocumentMimeType,
        processingStatus:
          row.processingStatus as MatterDocument["processingStatus"],
        securityStatus: row.securityStatus as MatterDocument["securityStatus"],
      })),
    };
  },
  getForOwner: getMatterDocumentRecordForOwner,
  getForStorageCleanup: getMatterDocumentRecordForStorageCleanup,
  transitionStorageStatus: transitionMatterDocumentStorageStatus,
  softDelete: softDeleteMatterDocumentRecord,
};

const service = createMatterDocumentService({
  repository,
  storage: createS3MatterDocumentStorage(),
});

export function getMatterDocumentService() {
  return service;
}

const processingService = createMatterDocumentProcessingService({
  storage: createS3MatterDocumentStorage(),
  vision: getConfiguredDocumentVision(),
  repository: {
    getForOwner: getMatterDocumentRecordForOwner,
    latest: getLatestMatterDocumentProcessing,
    begin: beginMatterDocumentProcessing,
    finalize: finalizeMatterDocumentProcessing,
    fail: failMatterDocumentProcessing,
    getEvidence: getMatterDocumentProcessingEvidence,
  },
});

export function getMatterDocumentProcessingService() {
  return processingService;
}
