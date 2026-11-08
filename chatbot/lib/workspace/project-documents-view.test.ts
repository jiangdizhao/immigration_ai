import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_DOCUMENT_FILTER,
  documentNeedsAttention,
  filterProjectDocuments,
  type ProjectDocumentRow,
  parseProjectDocumentRows,
  projectDocumentDownloadUrl,
  projectDocumentVersionKey,
  selectProjectDocumentVersion,
} from "./project-documents-view";

const rows: ProjectDocumentRow[] = [
  {
    assetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    byteSize: 10,
    canonicalMime: "application/pdf",
    lifecycle: "active",
    originKind: "direct_upload",
    securityStatus: "clean",
    storageStatus: "stored",
    versionId: "11111111-1111-4111-8111-111111111111",
    versionNumber: 2,
  },
  {
    assetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    byteSize: 20,
    canonicalMime: "text/plain",
    lifecycle: "withdrawn",
    originKind: "explicit_chat_import",
    securityStatus: "pending",
    storageStatus: "pending",
    versionId: "22222222-2222-4222-8222-222222222222",
    versionNumber: 1,
  },
];

test("document metadata is parsed strictly, including unknown enum values", () => {
  const parsed = parseProjectDocumentRows(
    { documents: rows.map((row) => ({ ...row })) },
    "documents"
  );
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 2);
  assert.equal(
    parseProjectDocumentRows(
      { documents: [{ ...rows[0], securityStatus: "trusted" }] },
      "documents"
    ),
    null
  );
  assert.equal(
    parseProjectDocumentRows({ documents: "nope" }, "documents"),
    null
  );
  assert.equal(parseProjectDocumentRows({}, "documents"), null);
});

test("filters keep the authorized list only, never widen it", () => {
  assert.equal(filterProjectDocuments(rows, DEFAULT_DOCUMENT_FILTER).length, 2);
  assert.deepEqual(
    filterProjectDocuments(rows, {
      ...DEFAULT_DOCUMENT_FILTER,
      origin: "explicit_chat_import",
    }).map((row) => row.versionNumber),
    [1]
  );
  assert.deepEqual(
    filterProjectDocuments(rows, {
      ...DEFAULT_DOCUMENT_FILTER,
      state: "active",
    }).map((row) => row.versionNumber),
    [2]
  );
  assert.deepEqual(
    filterProjectDocuments(rows, {
      ...DEFAULT_DOCUMENT_FILTER,
      state: "withdrawn",
    }).map((row) => row.versionNumber),
    [1]
  );
  assert.deepEqual(
    filterProjectDocuments(rows, {
      ...DEFAULT_DOCUMENT_FILTER,
      search: "PDF",
    }).map((row) => row.versionNumber),
    [2]
  );
  assert.deepEqual(
    filterProjectDocuments(rows, {
      ...DEFAULT_DOCUMENT_FILTER,
      state: "attention",
    }).map((row) => row.versionNumber),
    [1]
  );
});

test("a row needs attention until storage, scan and lifecycle are all settled", () => {
  assert.equal(documentNeedsAttention(rows[0]), false);
  assert.equal(documentNeedsAttention(rows[1]), true);
  assert.equal(
    documentNeedsAttention({ ...rows[0], lifecycle: "withdrawn" }),
    true
  );
  assert.equal(
    documentNeedsAttention({ ...rows[0], securityStatus: "rejected" }),
    true
  );
});

test("the download URL carries the exact authorized version only", () => {
  const url = projectDocumentDownloadUrl({
    assetId: rows[0].assetId,
    projectId: "33333333-3333-4333-8333-333333333333",
    versionId: rows[0].versionId,
  });
  assert.equal(
    url,
    `/api/projects/33333333-3333-4333-8333-333333333333/documents/${rows[0].assetId}/download?versionId=${rows[0].versionId}`
  );
});

const projectId = "33333333-3333-4333-8333-333333333333";

/** One asset exposing two authorized versions, plus an unrelated asset. */
const versionedRows: ProjectDocumentRow[] = [
  {
    assetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    byteSize: 100,
    canonicalMime: "application/pdf",
    lifecycle: "active",
    originKind: "direct_upload",
    securityStatus: "clean",
    storageStatus: "stored",
    versionId: "11111111-1111-4111-8111-111111111111",
    versionNumber: 1,
  },
  {
    assetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    byteSize: 120,
    canonicalMime: "application/pdf",
    lifecycle: "active",
    originKind: "direct_upload",
    securityStatus: "clean",
    storageStatus: "stored",
    versionId: "22222222-2222-4222-8222-222222222222",
    versionNumber: 2,
  },
  {
    assetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    byteSize: 20,
    canonicalMime: "text/plain",
    lifecycle: "active",
    originKind: "explicit_chat_import",
    securityStatus: "clean",
    storageStatus: "stored",
    versionId: "33333333-3333-4333-8333-333333333333",
    versionNumber: 1,
  },
];

test("R1-04: each version of one asset has its own stable identity", () => {
  const keys = versionedRows.map((row) => projectDocumentVersionKey(row));
  assert.equal(new Set(keys).size, versionedRows.length, "keys must be unique");
  // The same asset yields two distinct keys, so React cannot collapse the rows and the
  // selected state cannot leak from v1 to v2.
  assert.notEqual(keys[0], keys[1]);
  assert.equal(
    projectDocumentVersionKey(versionedRows[0]),
    `${versionedRows[0].assetId}:${versionedRows[0].versionId}`
  );
});

test("R1-04: selecting either version resolves exactly that version", () => {
  const first = selectProjectDocumentVersion(versionedRows, {
    assetId: versionedRows[0].assetId,
    versionId: versionedRows[0].versionId,
  });
  const second = selectProjectDocumentVersion(versionedRows, {
    assetId: versionedRows[1].assetId,
    versionId: versionedRows[1].versionId,
  });
  assert.equal(first?.versionNumber, 1);
  assert.equal(second?.versionNumber, 2);
  // The download target follows the selected version, never the asset's newest one.
  assert.match(
    projectDocumentDownloadUrl({
      assetId: first?.assetId ?? "",
      projectId,
      versionId: first?.versionId ?? "",
    }),
    /versionId=11111111-1111-4111-8111-111111111111$/u
  );
  assert.match(
    projectDocumentDownloadUrl({
      assetId: second?.assetId ?? "",
      projectId,
      versionId: second?.versionId ?? "",
    }),
    /versionId=22222222-2222-4222-8222-222222222222$/u
  );
});

test("R1-04: an asset-only or unknown selection resolves nothing", () => {
  // An asset id with the wrong version must not silently fall back to another version.
  assert.equal(
    selectProjectDocumentVersion(versionedRows, {
      assetId: versionedRows[0].assetId,
      versionId: "99999999-9999-4999-8999-999999999999",
    }),
    null
  );
  assert.equal(
    selectProjectDocumentVersion(versionedRows, {
      assetId: "99999999-9999-4999-8999-999999999999",
      versionId: versionedRows[0].versionId,
    }),
    null
  );
  assert.equal(selectProjectDocumentVersion(versionedRows, null), null);
  // A filtered-out version also resolves nothing, so the detail pane cannot show a row
  // the list is not displaying.
  const filtered = filterProjectDocuments(versionedRows, {
    ...DEFAULT_DOCUMENT_FILTER,
    origin: "explicit_chat_import",
  });
  assert.equal(
    selectProjectDocumentVersion(filtered, {
      assetId: versionedRows[0].assetId,
      versionId: versionedRows[0].versionId,
    }),
    null
  );
});
