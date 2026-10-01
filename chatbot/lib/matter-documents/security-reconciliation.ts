export type ScannerVerdict = "clean" | "rejected" | "failed";
export type ScannerResult = {
  verdict: ScannerVerdict;
  scannerId: string;
  scanId: string;
};

export type SecurityRepository = {
  getSecurityStatus(documentId: string): Promise<string | null>;
  transitionSecurityStatus(input: {
    documentId: string;
    expected: "pending";
    next: ScannerVerdict;
  }): Promise<boolean>;
};

export type MatterDocumentScanner = {
  scan(input: { documentId: string }): Promise<ScannerResult>;
};

const VERDICTS = new Set<ScannerVerdict>(["clean", "rejected", "failed"]);

/** Reconcile only provider-authenticated scanner output through a CAS transition. */
export function createSecurityReconciliationService(deps: {
  repository: SecurityRepository;
  scanner: MatterDocumentScanner;
}) {
  async function reconcileResult(documentId: string, scan: ScannerResult) {
    if (
      !VERDICTS.has(scan.verdict) ||
      typeof scan.scannerId !== "string" ||
      !scan.scannerId.trim() ||
      typeof scan.scanId !== "string" ||
      !scan.scanId.trim()
    ) {
      throw new Error("invalid_scanner_result");
    }
    const current = await deps.repository.getSecurityStatus(documentId);
    if (current === null) {
      return { result: "not_found" } as const;
    }
    if (current !== "pending") {
      return {
        result: current === scan.verdict ? "already_reconciled" : "conflict",
      } as const;
    }
    const changed = await deps.repository.transitionSecurityStatus({
      documentId,
      expected: "pending",
      next: scan.verdict,
    });
    if (changed) {
      return { result: "reconciled", verdict: scan.verdict } as const;
    }
    const latest = await deps.repository.getSecurityStatus(documentId);
    return {
      result: latest === scan.verdict ? "already_reconciled" : "conflict",
    } as const;
  }

  return {
    async scanAndReconcile(documentId: string) {
      const current = await deps.repository.getSecurityStatus(documentId);
      if (current !== "pending") {
        return {
          result: current === null ? "not_found" : "already_terminal",
        } as const;
      }
      return reconcileResult(
        documentId,
        await deps.scanner.scan({ documentId })
      );
    },
    reconcileResult,
  };
}
