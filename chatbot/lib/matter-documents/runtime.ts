import "server-only";

import {
  createMatterDocumentRecord,
  getImmigrationConversationByChatId,
  getMatterDocumentRecordForOwner,
  listMatterDocumentRecordsForOwner,
  softDeleteMatterDocumentRecord,
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
  softDelete: softDeleteMatterDocumentRecord,
};

const service = createMatterDocumentService({
  repository,
  storage: createS3MatterDocumentStorage(),
});

export function getMatterDocumentService() {
  return service;
}
