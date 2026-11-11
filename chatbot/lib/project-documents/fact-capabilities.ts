import "server-only";

import type { getLazyDatabase } from "@/lib/db/runtime-client";
import type {
  AuthenticatedScanVerifier,
  ProjectDocumentEvidencePersistence,
} from "./evidence";
import { PostgresProjectDocumentEvidencePersistence } from "./postgres-evidence-persistence";

/**
 * Phase 14-B R1: the Project Document capability that Project Facts consume.
 *
 * It lives inside `lib/project-documents` because only this module may touch the M2 evidence
 * store (an existing architectural guard enforces that). Consumers (`lib/projects/…` and
 * `lib/project-facts/…`) therefore compose it directly instead of relying on import order or
 * a process-wide registry.
 *
 * Verification is **proof-checked**, not status-checked: it resolves the opaque reference
 * through `resolveReference`, which requires an authenticated scan attestation bound to the
 * exact Project, document version, generation, object identity and SHA-256, plus a live
 * per-purpose extraction grant and the current active/stored version. A stored
 * `securityStatus = "clean"` column alone never counts as verification.
 */

export type FactEvidenceVerifier = (input: {
  actorUserId: string;
  projectId: string;
  evidenceRef: string;
}) => Promise<boolean>;

/** Pure composition over an existing, proof-checking reference resolver. */
export function createProjectFactEvidenceVerifier(input: {
  resolveReference: (request: {
    actorUserId: string;
    projectId: string;
    evidenceRef: string;
  }) => Promise<unknown | null>;
}): FactEvidenceVerifier {
  return async (request) => {
    try {
      const resolved = await input.resolveReference(request);
      return resolved !== null;
    } catch {
      return false;
    }
  };
}

/**
 * Production composition.
 *
 * Without an approved scan-attestation provider the persistence verifier returns `null` for
 * every attestation, so `resolveReference` fails and every document-extracted fact stays
 * unauthorised (fail closed). No attestation is invented and `trustedLiveReadiness` is not
 * touched.
 */
export function createDatabaseProjectFactEvidenceVerifier(input: {
  database?: ReturnType<typeof getLazyDatabase>;
  verifyAuthenticatedScan?: AuthenticatedScanVerifier;
  persistence?: ProjectDocumentEvidencePersistence;
}): FactEvidenceVerifier {
  const persistence =
    input.persistence ??
    (input.database
      ? new PostgresProjectDocumentEvidencePersistence(
          input.database,
          // No approved attestation provider => every attestation resolves to null, so no
          // reference can be validated. Fail closed rather than trusting stored status.
          input.verifyAuthenticatedScan ?? (async () => null)
        )
      : null);
  if (!persistence) {
    return async () => false;
  }
  return createProjectFactEvidenceVerifier({
    resolveReference: (request) => persistence.resolveReference(request),
  });
}
