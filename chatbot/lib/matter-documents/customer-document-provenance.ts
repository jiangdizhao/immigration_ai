/**
 * Phase 12 Stage 2 R1/R2 — honest, customer-visible document-usage state.
 *
 * The backend reports usage as a tri-state plus the bounded, request-authorized
 * acknowledged document ids. Two distinctions matter:
 *
 *  - ``confirmed`` is acknowledgement-based: the answering model said it relied
 *    on a document, and the backend checked that id against this request's own
 *    authorized manifest. It is not independent verification of the evidence.
 *  - Which documents count is decided by the acknowledged ids — never by the
 *    size of the packaged manifest. One acknowledged document must not turn
 *    every packaged file into "used".
 *
 * The reported state is never upgraded here: an unconfirmed packet can only ever
 * be reported as unconfirmed.
 */
export type CustomerDocumentUsageState =
  | "not_supplied"
  | "supplied_unconfirmed"
  | "confirmed";

export function customerDocumentUsageState(
  usage: unknown,
  verifiedUsed: unknown
): CustomerDocumentUsageState {
  if (verifiedUsed === true) {
    return "confirmed";
  }
  return usage === "supplied_unconfirmed"
    ? "supplied_unconfirmed"
    : "not_supplied";
}

function acknowledgedIdSet(acknowledgedDocumentIds: unknown): Set<string> {
  if (!Array.isArray(acknowledgedDocumentIds)) {
    return new Set();
  }
  return new Set(
    acknowledgedDocumentIds.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0
    )
  );
}

/**
 * Request-scoped provenance for one answer.
 *
 * ``used`` is true only when the backend confirmed use *and* this turn's own
 * manifest contains at least one acknowledged id. The returned manifest is the
 * acknowledged subset, so a forged, cross-conversation or stale id can never
 * introduce a document, and a single acknowledgement can never claim the whole
 * packaged packet.
 */
export function acknowledgedCustomerDocumentProvenance<
  T extends { documentId: string },
>(
  manifest: T[],
  used: unknown,
  preservedBackendAnswer: unknown = true,
  acknowledgedDocumentIds: unknown = []
): { used: boolean; manifest: T[] } {
  if (
    used !== true ||
    preservedBackendAnswer !== true ||
    manifest.length === 0
  ) {
    return { used: false, manifest: [] };
  }
  const acknowledged = acknowledgedIdSet(acknowledgedDocumentIds);
  const acknowledgedManifest = manifest.filter((entry) =>
    acknowledged.has(entry.documentId)
  );
  if (acknowledgedManifest.length === 0) {
    return { used: false, manifest: [] };
  }
  return { used: true, manifest: acknowledgedManifest };
}

/**
 * Manifest kept for an answer that is reloaded from storage.
 *
 * New answers carry the acknowledged ids, so only the acknowledged documents are
 * exposed as used provenance. Answers written before per-document
 * acknowledgements existed have no ids to subset; they keep exactly what they
 * stored (nothing can be made precise retroactively without inventing data), and
 * no new answer can reach that path.
 */
export function persistedCustomerDocumentManifestForReload(
  manifest: unknown,
  used: unknown,
  acknowledgedDocumentIds?: unknown
): unknown[] {
  if (used !== true || !Array.isArray(manifest)) {
    return [];
  }
  if (acknowledgedDocumentIds === undefined) {
    return manifest;
  }
  const acknowledged = acknowledgedIdSet(acknowledgedDocumentIds);
  return manifest.filter((entry) => {
    const documentId =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>).documentId
        : null;
    return typeof documentId === "string" && acknowledged.has(documentId);
  });
}

/**
 * Document ids persisted alongside a manifest for later lawyer-review
 * reconstruction. Only ids this turn actually acknowledged are returned, and
 * only when they exist in the persisted manifest.
 */
export function persistedCustomerDocumentUsedIds(
  manifest: Array<{ documentId: string }>,
  used: unknown
): string[] {
  if (used !== true) {
    return [];
  }
  return manifest.map((entry) => entry.documentId);
}
