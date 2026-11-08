/**
 * Phase 13 M9-A — Project document centre view model.
 *
 * Pure, dependency-free helpers over the *already authorized* M2 metadata list. The
 * server only ever returns versions the requesting actor holds a grant for, so this
 * module must not and cannot widen that list: it filters, searches and formats what
 * arrived.
 *
 * A listed row is metadata, not content. Nothing here implies the bytes are readable,
 * scanned clean or usable as AI evidence — those are separate grants and separate
 * server checks, and the UI says so.
 */

export const PROJECT_DOCUMENT_ORIGIN_KINDS = [
  "direct_upload",
  "explicit_chat_import",
] as const;
export type ProjectDocumentOriginKind =
  (typeof PROJECT_DOCUMENT_ORIGIN_KINDS)[number];

export const PROJECT_DOCUMENT_LIFECYCLES = [
  "active",
  "withdrawn",
  "deletion_pending",
  "deleted",
] as const;
export type ProjectDocumentLifecycle =
  (typeof PROJECT_DOCUMENT_LIFECYCLES)[number];

export const PROJECT_DOCUMENT_STORAGE_STATUSES = [
  "pending",
  "stored",
  "failed",
  "cleanup_pending",
] as const;
export type ProjectDocumentStorageStatus =
  (typeof PROJECT_DOCUMENT_STORAGE_STATUSES)[number];

export const PROJECT_DOCUMENT_SECURITY_STATUSES = [
  "pending",
  "clean",
  "rejected",
  "failed",
] as const;
export type ProjectDocumentSecurityStatus =
  (typeof PROJECT_DOCUMENT_SECURITY_STATUSES)[number];

export type ProjectDocumentRow = {
  assetId: string;
  versionId: string;
  versionNumber: number;
  lifecycle: ProjectDocumentLifecycle;
  originKind: ProjectDocumentOriginKind;
  canonicalMime: string;
  byteSize: number;
  storageStatus: ProjectDocumentStorageStatus;
  securityStatus: ProjectDocumentSecurityStatus;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(
  values: readonly T[],
  candidate: unknown
): candidate is T {
  return (
    typeof candidate === "string" &&
    (values as readonly string[]).includes(candidate)
  );
}

/** Strict parse: an unknown enum value makes the whole response unusable. */
export function parseProjectDocumentRows(
  value: unknown,
  field: "documents" | "document"
): ProjectDocumentRow | ProjectDocumentRow[] | null {
  const single = field === "document";
  const raw = isRecord(value) ? value[field] : null;
  const rows = single ? (isRecord(raw) ? [raw] : null) : raw;
  if (!Array.isArray(rows)) {
    return null;
  }
  const parsed: ProjectDocumentRow[] = [];
  for (const row of rows) {
    if (
      !isRecord(row) ||
      typeof row.assetId !== "string" ||
      typeof row.versionId !== "string" ||
      !Number.isSafeInteger(row.versionNumber) ||
      (row.versionNumber as number) < 1 ||
      !isOneOf(PROJECT_DOCUMENT_LIFECYCLES, row.lifecycle) ||
      !isOneOf(PROJECT_DOCUMENT_ORIGIN_KINDS, row.originKind) ||
      typeof row.canonicalMime !== "string" ||
      !Number.isSafeInteger(row.byteSize) ||
      (row.byteSize as number) < 0 ||
      !isOneOf(PROJECT_DOCUMENT_STORAGE_STATUSES, row.storageStatus) ||
      !isOneOf(PROJECT_DOCUMENT_SECURITY_STATUSES, row.securityStatus)
    ) {
      return null;
    }
    parsed.push({
      assetId: row.assetId,
      byteSize: row.byteSize as number,
      canonicalMime: row.canonicalMime,
      lifecycle: row.lifecycle,
      originKind: row.originKind,
      securityStatus: row.securityStatus,
      storageStatus: row.storageStatus,
      versionId: row.versionId,
      versionNumber: row.versionNumber as number,
    });
  }
  return single ? (parsed[0] ?? null) : parsed;
}

export type ProjectDocumentFilter = {
  origin: "all" | ProjectDocumentOriginKind;
  state: "all" | "active" | "withdrawn" | "attention";
  search: string;
};

export const DEFAULT_DOCUMENT_FILTER: ProjectDocumentFilter = {
  origin: "all",
  search: "",
  state: "all",
};

/** Storage or scan work that is not finished, or that failed. */
export function documentNeedsAttention(row: ProjectDocumentRow): boolean {
  return (
    row.storageStatus !== "stored" ||
    row.securityStatus !== "clean" ||
    row.lifecycle !== "active"
  );
}

export function filterProjectDocuments(
  rows: readonly ProjectDocumentRow[],
  filter: ProjectDocumentFilter
): ProjectDocumentRow[] {
  const search = filter.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.origin !== "all" && row.originKind !== filter.origin) {
      return false;
    }
    if (filter.state === "active" && row.lifecycle !== "active") {
      return false;
    }
    if (filter.state === "withdrawn" && row.lifecycle === "active") {
      return false;
    }
    if (filter.state === "attention" && !documentNeedsAttention(row)) {
      return false;
    }
    if (search.length === 0) {
      return true;
    }
    return (
      row.canonicalMime.toLowerCase().includes(search) ||
      String(row.versionNumber).includes(search) ||
      row.originKind.toLowerCase().includes(search)
    );
  });
}

/** A document selection is an exact **version**, never an asset alone. */
export type ProjectDocumentSelection = {
  assetId: string;
  versionId: string;
};

/**
 * Stable identity of one authorized document version.
 *
 * One asset can expose several granted versions, so a React key or a selected-state
 * comparison must include the version or two rows of the same asset would collapse
 * into one selection.
 */
export function projectDocumentVersionKey(
  row: Pick<ProjectDocumentRow, "assetId" | "versionId">
): string {
  return `${row.assetId}:${row.versionId}`;
}

/**
 * Resolve the selected row by exact asset **and** version identity.
 *
 * Returns `null` when the selection is not in the currently visible set, so a filtered
 * or refreshed list can never silently resolve to a different version of the same
 * asset.
 */
export function selectProjectDocumentVersion(
  rows: readonly ProjectDocumentRow[],
  selection: ProjectDocumentSelection | null
): ProjectDocumentRow | null {
  if (!selection) {
    return null;
  }
  return (
    rows.find(
      (row) =>
        row.assetId === selection.assetId &&
        row.versionId === selection.versionId
    ) ?? null
  );
}

/**
 * Downloads stay a server-authorization decision; this only builds the URL for the
 * exact selected version.
 */
export function projectDocumentDownloadUrl(input: {
  projectId: string;
  assetId: string;
  versionId: string;
}): string {
  return `/api/projects/${encodeURIComponent(input.projectId)}/documents/${encodeURIComponent(input.assetId)}/download?versionId=${encodeURIComponent(input.versionId)}`;
}
