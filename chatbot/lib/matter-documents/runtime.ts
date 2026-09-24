import "server-only";

import {
  createMatterDocumentRecord,
  getImmigrationConversationByChatId,
  getMatterDocumentRecordForOwner,
  getMatterDocumentRecordForStorageCleanup,
  listMatterDocumentRecordsForOwner,
  softDeleteMatterDocumentRecord,
  transitionMatterDocumentStorageStatus,
} from "@/lib/db/queries";
import { createMatterDocumentService } from "./service";
import { createS3MatterDocumentStorage } from "./storage";
import type { MatterDocumentRepository } from "./types";

const repository: MatterDocumentRepository = {
  getOwnedConversation: ({ chatId, userId }) =>
    getImmigrationConversationByChatId({ chatId, userId }),
  create: createMatterDocumentRecord,
  async list(input) {
    const records = await listMatterDocumentRecordsForOwner(input);
    return records.map(({ matterDocument }) => matterDocument);
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
