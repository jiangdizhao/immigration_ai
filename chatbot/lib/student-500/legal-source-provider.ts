import type {
  Student500AuthorityClass,
  Student500SourceVerification,
} from "./contracts";
import {
  declaredStudent500LegalSource,
  STUDENT_500_DECLARED_COVERAGE,
  type Student500DeclaredLegalSource,
} from "./legal-source-catalog";
import type { Student500VerificationBasis } from "./official-source-manifest";
import {
  manifestStudent500LegalSource,
  STUDENT_500_MANIFEST_VERIFIED_COVERAGE,
  STUDENT_500_SOURCE_MANIFEST_VERSION,
} from "./official-source-manifest";

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
  /** Federal Register compilation/instrument identity actually used, if any. */
  readonly legalSourceVersionId: string | null;
  readonly verificationBasis: Student500VerificationBasis;
  readonly identityVerified: boolean;
  readonly textVerified: boolean;
  readonly applicabilityVerified: boolean;
  readonly verifiedAt: string | null;
  /**
   * Digest of the retrieved provision excerpt bound to THIS source, or null. Never
   * a digest borrowed from another provision family or from a compilation header.
   */
  readonly textSha256: string | null;
  readonly transitionNote: string | null;
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
    applicabilityVerified: false,
    identityVerified: false,
    legalSourceVersionId: null,
    textVerified: false,
    transitionNote: null,
    textSha256: null,
    verificationBasis: "declared_by_repository",
    verifiedAt: null,
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
 * Verification state derived strictly from the manifest's verification basis.
 *
 * `verified_official_corpus` requires retrieved provision text. A reachable URL,
 * an observed Register listing or a declared identity is never enough - that is
 * the whole point of keeping the ladder explicit.
 */
function verificationFor(input: {
  readonly basis: Student500VerificationBasis;
  readonly textSha256: string | null;
}): Student500SourceVerification {
  if (input.basis === "text_and_provision_retrieved" && input.textSha256) {
    return "verified_official_corpus";
  }
  if (input.basis === "not_established") {
    return "insufficient_authority";
  }
  return "declared_pending_verification";
}

function withinWindow(
  version: {
    readonly applicabilityFrom: string | null;
    readonly applicabilityTo: string | null;
  },
  asOfDate: string | null
): boolean {
  if (!asOfDate) {
    return false;
  }
  if (!version.applicabilityFrom && !version.applicabilityTo) {
    return false;
  }
  if (version.applicabilityFrom && asOfDate < version.applicabilityFrom) {
    return false;
  }
  if (version.applicabilityTo && asOfDate > version.applicabilityTo) {
    return false;
  }
  return true;
}

/**
 * Authoritative-adapter shape for the Student 500 requirement resolver.
 *
 * Chooses the manifest version whose applicability window covers the as-of date
 * and reports coverage honestly when no window does. It performs no network I/O:
 * the manifest is the versioned, reviewable record of what was verified, when and
 * on what basis.
 */
export function createManifestStudent500LegalSourceProvider(): Student500LegalSourceProvider {
  return {
    providerId: `official-source-manifest.${STUDENT_500_SOURCE_MANIFEST_VERSION}`,
    resolve({ asOfDate, sourceIds }) {
      const resolved: Student500ResolvedLegalSource[] = [];
      const seen = new Set<string>();
      for (const sourceId of sourceIds) {
        if (seen.has(sourceId)) {
          continue;
        }
        seen.add(sourceId);
        const entry = manifestStudent500LegalSource(sourceId);
        if (!entry) {
          throw new Error(`student_500_unknown_legal_source:${sourceId}`);
        }
        // Never fall back to the newest observed compilation: an unevaluated date
        // has no applicable version at all.
        const version =
          entry.versions.find((candidate) =>
            withinWindow(candidate, asOfDate)
          ) ?? null;
        const covered = version !== null;
        const verification = version
          ? verificationFor({
              basis: version.verificationBasis,
              textSha256: version.textSha256,
            })
          : entry.unavailableReason
            ? "insufficient_authority"
            : "unavailable";
        const asOfCoverage: Student500AsOfCoverage = asOfDate
          ? covered
            ? "covered"
            : "outside_declared_coverage"
          : "unknown";
        const identityVerified =
          covered &&
          (version?.verificationBasis === "register_listing_observed" ||
            version?.verificationBasis === "text_and_provision_retrieved");
        resolved.push({
          asOfCoverage,
          applicabilityVerified:
            covered &&
            version?.verificationBasis === "text_and_provision_retrieved",
          authorityClass: entry.authorityClass,
          compilationLabel: covered
            ? (version?.compilationLabel ?? null)
            : null,
          declarationNote:
            entry.unavailableReason ??
            version?.commencementNote ??
            "No manifest identity is available for this source.",
          effectiveFrom: covered ? (version?.applicabilityFrom ?? null) : null,
          effectiveTo: covered ? (version?.applicabilityTo ?? null) : null,
          identityVerified,
          instrumentTitle: entry.instrumentTitle,
          legalSourceVersionId: covered ? (version?.versionId ?? null) : null,
          officialReference: entry.officialReference,
          officialUrl: version?.officialUrl ?? entry.officialUrl,
          provisionLocator:
            (covered ? version?.provisionLocator : null) ?? entry.sourceId,
          sourceId,
          textVerified: verification === "verified_official_corpus",
          transitionNote: version?.transitionNote ?? null,
          // A non-empty URL proves nothing by itself: this flag means the official
          // listing/provision identity was verified for this date, and it says
          // nothing about retrieved text or legal applicability.
          urlVerified: covered && identityVerified,
          // Only a covered, provision-bound excerpt may expose a digest.
          textSha256: covered ? (version?.textSha256 ?? null) : null,
          verification,
          verificationBasis: version?.verificationBasis ?? "not_established",
          verifiedAt: version?.verifiedAt ?? null,
        });
      }
      return Promise.resolve(resolved);
    },
  };
}

/**
 * Runtime provider selection. The manifest adapter is the default because it is
 * strictly more informative than the declaration catalog and never asserts more
 * than was verified; the declared provider stays available for historical tests
 * and rollback.
 */
export function resolveStudent500LegalSourceProvider(options?: {
  readonly provider?: "manifest" | "declared";
}): Student500LegalSourceProvider {
  const configured =
    options?.provider ??
    (process.env.STUDENT_500_LEGAL_SOURCE_PROVIDER === "declared"
      ? "declared"
      : "manifest");
  if (configured === "declared") {
    return createDeclaredStudent500LegalSourceProvider();
  }
  return createManifestStudent500LegalSourceProvider();
}

export { STUDENT_500_MANIFEST_VERIFIED_COVERAGE };
