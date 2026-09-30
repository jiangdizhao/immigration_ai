export function restoreSnapshotAuditMetadata(input: {
  sourceDate: string | null;
  effectiveDate: string | null;
  evidenceTruncated: boolean;
  sourceMetadata: unknown;
}) {
  const metadata =
    typeof input.sourceMetadata === "object" && input.sourceMetadata !== null
      ? (input.sourceMetadata as Record<string, unknown>)
      : {};
  return {
    sourceDate: input.sourceDate,
    effectiveDate: input.effectiveDate,
    evidenceTruncated: input.evidenceTruncated,
    etag: typeof metadata.etag === "string" ? metadata.etag : null,
    lastModified:
      typeof metadata.lastModified === "string" ? metadata.lastModified : null,
  };
}
