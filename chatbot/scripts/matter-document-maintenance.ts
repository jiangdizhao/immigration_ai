import {
  getMatterDocumentRecordForStorageCleanup,
  hardDeleteSoftDeletedMatterDocument,
  listSoftDeletedMatterDocumentPurgeCandidates,
  listStaleMatterDocumentMaintenanceCandidates,
} from "../lib/db/queries";
import { createMatterDocumentMaintenanceService } from "../lib/matter-documents/maintenance";
import { createMatterDocumentService } from "../lib/matter-documents/service";
import { createS3MatterDocumentStorage } from "../lib/matter-documents/storage";

function args() {
  const values = process.argv.slice(2);
  const cutoffValue = values
    .find((value) => value.startsWith("--cutoff="))
    ?.slice(9);
  const limitValue = values
    .find((value) => value.startsWith("--limit="))
    ?.slice(8);
  if (!cutoffValue || !limitValue) {
    throw new Error(
      "required: --cutoff=<ISO timestamp> --limit=<1..500> [--apply]"
    );
  }
  const cutoff = new Date(cutoffValue);
  const limit = Number(limitValue);
  if (
    !Number.isFinite(cutoff.getTime()) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 500
  ) {
    throw new Error("invalid cutoff or batch limit");
  }
  return { cutoff, limit, apply: values.includes("--apply") };
}

const operation = process.argv[2];
const input = args();
const storage = createS3MatterDocumentStorage();
const cleanup = createMatterDocumentService({
  repository: {
    getOwnedConversation() {
      return Promise.resolve(null);
    },
    create() {
      return Promise.reject(new Error("unused"));
    },
    list() {
      return Promise.resolve([]);
    },
    getForOwner() {
      return Promise.resolve(null);
    },
    softDelete() {
      return Promise.resolve(null);
    },
    getForStorageCleanup: getMatterDocumentRecordForStorageCleanup,
    transitionStorageStatus: (value) =>
      import("../lib/db/queries").then(
        ({ transitionMatterDocumentStorageStatus }) =>
          transitionMatterDocumentStorageStatus(value)
      ),
  },
  storage,
});
const service = createMatterDocumentMaintenanceService({
  repository: {
    listStale: listStaleMatterDocumentMaintenanceCandidates,
    listDeleted: listSoftDeletedMatterDocumentPurgeCandidates,
    hardDeleteDeleted: hardDeleteSoftDeletedMatterDocument,
  },
  storage,
  cleanup,
});
const result =
  operation === "recover"
    ? await service.recoverStale(input)
    : operation === "purge"
      ? await service.purgeDeleted(input)
      : null;
if (!result) {
  throw new Error("operation must be recover or purge");
}
console.log(
  JSON.stringify({
    mode: input.apply ? "apply" : "dry-run",
    scanned: result.scanned,
    results: result.results,
  })
);
