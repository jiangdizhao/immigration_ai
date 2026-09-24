export function acknowledgedCustomerDocumentProvenance<T>(
  manifest: T[],
  used: unknown
): { used: boolean; manifest: T[] } {
  const acknowledged = used === true && manifest.length > 0;
  return { used: acknowledged, manifest: acknowledged ? manifest : [] };
}

export function shouldClearSelectedDocuments(input: {
  selectedCount: number;
  customerDocumentEvidenceUsed: unknown;
}): boolean {
  return (
    input.selectedCount === 0 || input.customerDocumentEvidenceUsed === true
  );
}

export function persistedCustomerDocumentManifestForReload(
  manifest: unknown,
  used: unknown
): unknown[] {
  return used === true && Array.isArray(manifest) ? manifest : [];
}
