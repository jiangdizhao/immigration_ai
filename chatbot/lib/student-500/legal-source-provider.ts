import type {
  Student500AuthorityClass,
  Student500SourceVerification,
} from "./contracts";
import {
  declaredStudent500LegalSource,
  STUDENT_500_DECLARED_COVERAGE,
  type Student500DeclaredLegalSource,
} from "./legal-source-catalog";

/**
 * Phase 13 M6.1 — legal-source provider port.
 *
 * The requirement resolver never reads the catalog directly: it asks a provider
 * for the official sources relevant to an as-of date. That keeps one narrow seam
 * for a future authoritative adapter (legal-service exact lookup / verified
 * official corpus) without changing requirement semantics or the customer view.
 *
 * M6.1 ships exactly one provider — the repository's declared catalog — which
 * reports `declared_pending_verification` for every legislative source and
 * `unavailable` where the milestone could not even establish an instrument
 * identity. No provider may return `verified_official_corpus` without an actual
 * authoritative retrieval; the declared provider therefore never does.
 */

export type Student500AsOfCoverage =
  | "covered"
  | "outside_declared_coverage"
  | "unknown";

export type Student500ResolvedLegalSource = {
  readonly sourceId: string;
  readonly authorityClass: Student500AuthorityClass;
  readonly instrumentTitle: string;
  readonly provisionLocator: string;
  readonly officialReference: string | null;
  readonly officialUrl: string | null;
  readonly urlVerified: boolean;
  readonly compilationLabel: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly verification: Student500SourceVerification;
  readonly asOfCoverage: Student500AsOfCoverage;
  readonly declarationNote: string;
};

export type Student500LegalSourceProvider = {
  readonly providerId: string;
  resolve(input: {
    readonly sourceIds: readonly string[];
    readonly asOfDate: string | null;
  }): Promise<readonly Student500ResolvedLegalSource[]>;
};

function asOfCoverage(
  source: Student500DeclaredLegalSource,
  asOfDate: string | null
): Student500AsOfCoverage {
  if (!asOfDate) {
    return "unknown";
  }
  const { from, to } = source.declaredCoverage;
  if (asOfDate < from || (to !== null && asOfDate > to)) {
    return "outside_declared_coverage";
  }
  return "covered";
}

function resolveDeclared(
  source: Student500DeclaredLegalSource,
  asOfDate: string | null
): Student500ResolvedLegalSource {
  return {
    asOfCoverage: asOfCoverage(source, asOfDate),
    authorityClass: source.authorityClass,
    compilationLabel: source.compilationLabel,
    declarationNote: source.declarationNote,
    effectiveFrom: source.effectiveFrom,
    effectiveTo: source.effectiveTo,
    instrumentTitle: source.instrumentTitle,
    officialReference: source.officialReference,
    officialUrl: source.officialUrl,
    provisionLocator: source.provisionLocator,
    sourceId: source.sourceId,
    urlVerified: source.urlVerified,
    verification: source.verification,
  };
}

/**
 * The declared-catalog provider. Deterministic, offline and side-effect free.
 *
 * An unknown source id is an internal contract defect (the catalog is authored
 * with the rule pack), so it throws instead of degrading into a false
 * "no source needed" state.
 */
export function createDeclaredStudent500LegalSourceProvider(options?: {
  readonly declaredCoverage?: {
    readonly from: string;
    readonly to: string | null;
  };
}): Student500LegalSourceProvider {
  const coverage = options?.declaredCoverage ?? STUDENT_500_DECLARED_COVERAGE;
  return {
    providerId: "declared-official-source-catalog.v1",
    resolve({ asOfDate, sourceIds }) {
      const resolved: Student500ResolvedLegalSource[] = [];
      const seen = new Set<string>();
      for (const sourceId of sourceIds) {
        if (seen.has(sourceId)) {
          continue;
        }
        seen.add(sourceId);
        const source = declaredStudent500LegalSource(sourceId);
        if (!source) {
          throw new Error(`student_500_unknown_legal_source:${sourceId}`);
        }
        resolved.push(
          resolveDeclared({ ...source, declaredCoverage: coverage }, asOfDate)
        );
      }
      return Promise.resolve(resolved);
    },
  };
}

/**
 * Runtime provider selection. M6.1 always returns the declared provider: wiring
 * an authoritative legal-service adapter is a deferred item recorded in the
 * milestone handoff, not something this code silently imitates.
 */
export function resolveStudent500LegalSourceProvider(): Student500LegalSourceProvider {
  return createDeclaredStudent500LegalSourceProvider();
}
