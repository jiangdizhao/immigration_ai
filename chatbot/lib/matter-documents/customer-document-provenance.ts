export function acknowledgedCustomerDocumentProvenance<T>(
  manifest: T[],
  used: unknown,
  preservedBackendAnswer: unknown = true
): { used: boolean; manifest: T[] } {
  const acknowledged =
    used === true && preservedBackendAnswer === true && manifest.length > 0;
  return { used: acknowledged, manifest: acknowledged ? manifest : [] };
}

export function customerDocumentSelectionAfterSubmission(input: {
  selectedCount: number;
  customerDocumentEvidenceUsed: unknown;
  submissionKind: "message" | "guided_intake" | "political_block";
}): { clearSelection: boolean; warnUnused: boolean } {
  if (input.submissionKind === "political_block") {
    return { clearSelection: false, warnUnused: false };
  }
  const clearSelection =
    input.selectedCount === 0 || input.customerDocumentEvidenceUsed === true;
  return {
    clearSelection,
    warnUnused: input.selectedCount > 0 && !clearSelection,
  };
}

export function persistedCustomerDocumentManifestForReload(
  manifest: unknown,
  used: unknown
): unknown[] {
  return used === true && Array.isArray(manifest) ? manifest : [];
}
