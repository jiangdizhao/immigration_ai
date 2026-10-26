import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  PROJECT_DOCUMENT_ASSET_LIFECYCLES,
  PROJECT_DOCUMENT_GRANT_PURPOSES,
  PROJECT_DOCUMENT_GRANT_RECIPIENT_KINDS,
  PROJECT_DOCUMENT_ORIGIN_KINDS,
  PROJECT_DOCUMENT_RUN_KINDS,
  PROJECT_DOCUMENT_RUN_STATUSES,
  PROJECT_DOCUMENT_SECURITY_STATUSES,
  PROJECT_DOCUMENT_STORAGE_STATUSES,
  projectDocumentAsset,
  projectDocumentGrant,
  projectDocumentProcessingRun,
  projectDocumentVersion,
} from "./schema";

function foreignKeyShape(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();
    return {
      table: getTableName(reference.foreignTable),
      columns: reference.columns.map((column) => column.name),
      foreignColumns: reference.foreignColumns.map((column) => column.name),
    };
  });
}

test("M2-A0 schema exports only the four inert Project document entities", () => {
  assert.deepEqual(
    [
      projectDocumentAsset,
      projectDocumentVersion,
      projectDocumentGrant,
      projectDocumentProcessingRun,
    ].map(getTableName),
    [
      "ProjectDocumentAsset",
      "ProjectDocumentVersion",
      "ProjectDocumentGrant",
      "ProjectDocumentProcessingRun",
    ]
  );

  assert.deepEqual(
    foreignKeyShape(projectDocumentVersion).find(
      (foreignKey) => foreignKey.table === "ProjectDocumentAsset"
    ),
    {
      table: "ProjectDocumentAsset",
      columns: ["projectId", "assetId"],
      foreignColumns: ["projectId", "id"],
    }
  );
  assert.deepEqual(
    foreignKeyShape(projectDocumentGrant).find(
      (foreignKey) => foreignKey.table === "ProjectDocumentVersion"
    ),
    {
      table: "ProjectDocumentVersion",
      columns: ["projectId", "assetId", "versionId"],
      foreignColumns: ["projectId", "assetId", "versionId"],
    }
  );
  assert.deepEqual(
    foreignKeyShape(projectDocumentProcessingRun).find(
      (foreignKey) => foreignKey.table === "ProjectDocumentVersion"
    ),
    {
      table: "ProjectDocumentVersion",
      columns: ["projectId", "versionId", "objectSha256"],
      foreignColumns: ["projectId", "versionId", "sha256"],
    }
  );
  assert.equal(
    foreignKeyShape(projectDocumentVersion).some((foreignKey) =>
      ["Chat", "MatterDocument"].includes(foreignKey.table)
    ),
    false,
    "source provenance identifiers must not transfer source access"
  );
});

test("Project document state vocabularies stay narrow and pending by default", () => {
  assert.deepEqual(PROJECT_DOCUMENT_ASSET_LIFECYCLES, [
    "active",
    "withdrawn",
    "deletion_pending",
    "deleted",
  ]);
  assert.deepEqual(PROJECT_DOCUMENT_ORIGIN_KINDS, [
    "direct_upload",
    "explicit_chat_import",
  ]);
  assert.deepEqual(PROJECT_DOCUMENT_STORAGE_STATUSES, [
    "pending",
    "stored",
    "failed",
    "cleanup_pending",
  ]);
  assert.deepEqual(PROJECT_DOCUMENT_SECURITY_STATUSES, [
    "pending",
    "clean",
    "rejected",
    "failed",
  ]);
  assert.deepEqual(PROJECT_DOCUMENT_GRANT_RECIPIENT_KINDS, ["user", "project"]);
  assert.deepEqual(PROJECT_DOCUMENT_GRANT_PURPOSES, [
    "metadata_read",
    "content_read",
    "download",
    "extract",
    "ai_context",
    "future_package",
  ]);
  assert.deepEqual(PROJECT_DOCUMENT_RUN_KINDS, ["scan", "extract"]);
  assert.deepEqual(PROJECT_DOCUMENT_RUN_STATUSES, [
    "started",
    "completed",
    "failed",
  ]);
  const versionColumns = getTableConfig(projectDocumentVersion).columns;
  assert.equal(
    versionColumns.find((column) => column.name === "storageStatus")?.default,
    "pending"
  );
  assert.equal(
    versionColumns.find((column) => column.name === "securityStatus")?.default,
    "pending"
  );
  assert.equal(
    versionColumns.find((column) => column.name === "processingGeneration")
      ?.default,
    1
  );
});
