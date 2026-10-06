export function acknowledgedCustomerDocumentProvenance<T>(
  manifest: T[],
  used: unknown,
  preservedBackendAnswer: unknown = true
): { used: boolean; manifest: T[] } {
  const acknowledged =
    used === true && preservedBackendAnswer === true && manifest.length > 0;
  return { used: acknowledged, manifest: acknowledged ? manifest : [] };
}

export function persistedCustomerDocumentManifestForReload(
  manifest: unknown,
  used: unknown
): unknown[] {
  return used === true && Array.isArray(manifest) ? manifest : [];
}
