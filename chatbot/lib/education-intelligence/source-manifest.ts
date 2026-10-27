import type { SourceFamily } from "./contracts";
import {
  canonicalizeEducationUrl,
  isReservedSyntheticHostForFamily,
} from "./identity";

export const EDUCATION_SOURCE_MANIFEST_SCHEMA =
  "education.source-acquisition.v1" as const;
export const MAX_SERIALIZED_SOURCE_MANIFEST_BYTES = 32_768;
export const MAX_SOURCE_MANIFESTS_PER_REVIEW = 200;
export const SOURCE_ACCESS_REVIEW_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export type ManifestReviewState = "PROPOSED" | "APPROVED" | "REJECTED";
export type ExpectedDocumentType = "HTML" | "JSON" | "TEXT" | "PDF";
export type AccessAssessment = "ALLOW" | "DENY" | "UNKNOWN";
export type ManifestAuthorityKind =
  | "REGISTRY"
  | "GOVERNMENT_DISCOVERY"
  | "INSTITUTION_SITE";

export interface EducationSourceManifest {
  readonly schema: typeof EDUCATION_SOURCE_MANIFEST_SCHEMA;
  readonly proposalId: string;
  readonly sourceId: string;
  readonly family: SourceFamily;
  readonly scope:
    | { readonly kind: "CATALOG" }
    | { readonly kind: "PROVIDER"; readonly providerId: string };
  readonly canonicalUrl: string;
  /** Exact hostnames only. Wildcards and suffix rules are not supported. */
  readonly approvedHosts: readonly string[];
  /** Absolute URL paths; matching is segment-boundary aware. */
  readonly allowedPathPrefixes: readonly string[];
  readonly rationale: string;
  readonly authorityEvidence: {
    readonly kind: ManifestAuthorityKind;
    readonly title: string;
    readonly referenceUrl: string;
  };
  readonly locale: string;
  readonly expectedDocumentType: ExpectedDocumentType;
  readonly reviewState: ManifestReviewState;
  readonly enabled: boolean;
  readonly syntheticFixture: boolean;
  readonly accessReview: {
    readonly reviewer?: string;
    readonly reviewedAt?: string;
    readonly asOf: string;
    readonly policyVersion: string;
    readonly accessDecision: AccessAssessment;
    readonly terms: {
      readonly assessment: AccessAssessment;
      readonly evidenceUrl?: string;
    };
    readonly robots: {
      readonly assessment: AccessAssessment;
      readonly evidenceUrl?: string;
    };
  };
  readonly transportPolicy: {
    readonly redirects: "MANUAL_REVALIDATE";
    readonly credentials: "OMIT";
    readonly port: 443;
    readonly retries: 0;
    readonly maxRedirects: number;
    readonly maxRequests: number;
    readonly maxResponseBytes: number;
    readonly maxTotalBytes: number;
    readonly requestTimeoutMs: number;
    readonly totalTimeoutMs: number;
    readonly userAgent: "EducationIntelligenceOfflineAcquisition/1.0";
  };
}

export interface ManifestIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ManifestValidation {
  readonly ok: boolean;
  readonly issues: readonly ManifestIssue[];
}

export interface ManifestValidationOptions {
  readonly assessedAt?: string;
  readonly knownProviderIds?: ReadonlySet<string>;
  readonly forAcquisition?: boolean;
}

export function createProposedEducationSourceManifest(
  draft: Omit<EducationSourceManifest, "reviewState" | "enabled">
): EducationSourceManifest {
  return { ...draft, reviewState: "PROPOSED", enabled: false };
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i;
const ACCEPTED_AUTHORITY: Readonly<
  Record<SourceFamily, ManifestAuthorityKind>
> = {
  CRICOS: "REGISTRY",
  STUDY_AUSTRALIA: "GOVERNMENT_DISCOVERY",
  INSTITUTION: "INSTITUTION_SITE",
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bounded(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    TIMESTAMP.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function canonicalHttps(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return canonicalizeEducationUrl(value) === value;
  } catch {
    return false;
  }
}

function add(
  issues: ManifestIssue[],
  code: string,
  path: string,
  message: string
): void {
  issues.push({ code, path, message });
}

function pathMatches(pathname: string, prefix: string): boolean {
  return (
    pathname === prefix ||
    pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
  );
}

export function manifestPathIsAllowed(
  manifest: EducationSourceManifest,
  pathname: string
): boolean {
  return manifest.allowedPathPrefixes.some((prefix) =>
    pathMatches(pathname, prefix)
  );
}

export function validateEducationSourceManifest(
  input: unknown,
  options: ManifestValidationOptions = {}
): ManifestValidation {
  const issues: ManifestIssue[] = [];
  if (!record(input)) {
    return {
      ok: false,
      issues: [
        {
          code: "INVALID_MANIFEST",
          path: "$",
          message: "Expected a source manifest object.",
        },
      ],
    };
  }
  const value = input as unknown as EducationSourceManifest;

  if (value.schema !== EDUCATION_SOURCE_MANIFEST_SCHEMA) {
    add(
      issues,
      "UNSUPPORTED_SCHEMA",
      "$.schema",
      "Unsupported source manifest version."
    );
  }
  if (!bounded(value.proposalId, 128) || !ID.test(value.proposalId)) {
    add(
      issues,
      "INVALID_PROPOSAL_ID",
      "$.proposalId",
      "Proposal ID must be a bounded opaque ID."
    );
  }
  if (!bounded(value.sourceId, 128) || !ID.test(value.sourceId)) {
    add(
      issues,
      "INVALID_SOURCE_ID",
      "$.sourceId",
      "Source ID must be a bounded opaque ID."
    );
  }
  if (!["CRICOS", "STUDY_AUSTRALIA", "INSTITUTION"].includes(value.family)) {
    add(
      issues,
      "INVALID_SOURCE_FAMILY",
      "$.family",
      "Unsupported education source family."
    );
  }
  if (
    !record(value.scope) ||
    !["CATALOG", "PROVIDER"].includes(value.scope.kind)
  ) {
    add(
      issues,
      "INVALID_SCOPE",
      "$.scope",
      "Source scope must be catalog or provider scoped."
    );
  } else if (
    value.family === "INSTITUTION" &&
    value.scope.kind !== "PROVIDER"
  ) {
    add(
      issues,
      "FAMILY_SCOPE_MISMATCH",
      "$.scope",
      "Institution sources require an exact provider scope."
    );
  } else if (value.family !== "INSTITUTION" && value.scope.kind !== "CATALOG") {
    add(
      issues,
      "FAMILY_SCOPE_MISMATCH",
      "$.scope",
      "Catalog authorities cannot claim provider-specific source scope."
    );
  }
  if (record(value.scope) && value.scope.kind === "PROVIDER") {
    if (
      !bounded(value.scope.providerId, 128) ||
      !ID.test(value.scope.providerId)
    ) {
      add(
        issues,
        "INVALID_PROVIDER_SCOPE",
        "$.scope.providerId",
        "Provider scope must use an exact provider ID."
      );
    }
    if (
      options.knownProviderIds &&
      !options.knownProviderIds.has(value.scope.providerId)
    ) {
      add(
        issues,
        "UNKNOWN_PROVIDER_SCOPE",
        "$.scope.providerId",
        "Provider scope does not match a known catalog provider."
      );
    }
  }

  if (!canonicalHttps(value.canonicalUrl)) {
    add(
      issues,
      "INVALID_CANONICAL_URL",
      "$.canonicalUrl",
      "Source URL must be a canonical public HTTPS URL without credentials or a nonstandard port."
    );
  }
  if (
    !Array.isArray(value.approvedHosts) ||
    value.approvedHosts.length < 1 ||
    value.approvedHosts.length > 8 ||
    value.approvedHosts.some(
      (host) =>
        typeof host !== "string" ||
        host.length > 253 ||
        host !== host.toLowerCase() ||
        host.includes("*") ||
        host.endsWith(".") ||
        !/^[a-z0-9.-]+$/.test(host) ||
        host.startsWith(".") ||
        host.includes("..")
    )
  ) {
    add(
      issues,
      "INVALID_HOST_ALLOWLIST",
      "$.approvedHosts",
      "Use one to eight exact lowercase hostnames without wildcards."
    );
  } else if (new Set(value.approvedHosts).size !== value.approvedHosts.length) {
    add(
      issues,
      "DUPLICATE_ALLOWED_HOST",
      "$.approvedHosts",
      "Exact hostnames must be unique."
    );
  }
  if (
    !Array.isArray(value.allowedPathPrefixes) ||
    value.allowedPathPrefixes.length < 1 ||
    value.allowedPathPrefixes.length > 16 ||
    value.allowedPathPrefixes.some(
      (path) =>
        typeof path !== "string" ||
        !path.startsWith("/") ||
        path.length > 512 ||
        path.includes("?") ||
        path.includes("#") ||
        path.includes("\\") ||
        path.includes("%") ||
        /(?:^|\/)\.{1,2}(?:\/|$)/.test(path)
    )
  ) {
    add(
      issues,
      "INVALID_PATH_SCOPE",
      "$.allowedPathPrefixes",
      "Use bounded absolute path prefixes without query, fragment or backslash."
    );
  }
  if (
    canonicalHttps(value.canonicalUrl) &&
    Array.isArray(value.approvedHosts)
  ) {
    const url = new URL(value.canonicalUrl);
    if (!value.approvedHosts.includes(url.hostname)) {
      add(
        issues,
        "URL_HOST_OUT_OF_SCOPE",
        "$.canonicalUrl",
        "URL hostname is not an exact approved host."
      );
    }
    if (
      Array.isArray(value.allowedPathPrefixes) &&
      !value.allowedPathPrefixes.some(
        (path) => typeof path === "string" && pathMatches(url.pathname, path)
      )
    ) {
      add(
        issues,
        "URL_PATH_OUT_OF_SCOPE",
        "$.canonicalUrl",
        "URL path is outside the approved source path scope."
      );
    }
  }

  if (!bounded(value.rationale, 1000)) {
    add(
      issues,
      "MISSING_RATIONALE",
      "$.rationale",
      "Operator rationale is required and bounded."
    );
  }
  if (record(value.authorityEvidence)) {
    if (value.authorityEvidence.kind !== ACCEPTED_AUTHORITY[value.family]) {
      add(
        issues,
        "AUTHORITY_FAMILY_MISMATCH",
        "$.authorityEvidence.kind",
        "Authority evidence type does not match the source family."
      );
    }
    if (!bounded(value.authorityEvidence.title, 256)) {
      add(
        issues,
        "INVALID_AUTHORITY_TITLE",
        "$.authorityEvidence.title",
        "Authority reference needs a bounded title."
      );
    }
    if (!canonicalHttps(value.authorityEvidence.referenceUrl)) {
      add(
        issues,
        "INVALID_AUTHORITY_REFERENCE",
        "$.authorityEvidence.referenceUrl",
        "Authority reference must be a canonical HTTPS URL."
      );
    }
  } else {
    add(
      issues,
      "MISSING_AUTHORITY_EVIDENCE",
      "$.authorityEvidence",
      "Authority evidence is required."
    );
  }
  if (
    !bounded(value.locale, 35) ||
    !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value.locale)
  ) {
    add(
      issues,
      "INVALID_LOCALE",
      "$.locale",
      "Locale must be a bounded BCP-47 style tag."
    );
  }
  if (!["HTML", "JSON", "TEXT", "PDF"].includes(value.expectedDocumentType)) {
    add(
      issues,
      "INVALID_DOCUMENT_TYPE",
      "$.expectedDocumentType",
      "Unsupported expected document type."
    );
  }
  if (!["PROPOSED", "APPROVED", "REJECTED"].includes(value.reviewState)) {
    add(
      issues,
      "INVALID_REVIEW_STATE",
      "$.reviewState",
      "Unsupported source review state."
    );
  }
  if (
    typeof value.enabled !== "boolean" ||
    typeof value.syntheticFixture !== "boolean"
  ) {
    add(
      issues,
      "INVALID_ENABLEMENT",
      "$.enabled",
      "Enablement and synthetic fixture flags must be explicit booleans."
    );
  }

  const urlHostname = canonicalHttps(value.canonicalUrl)
    ? new URL(value.canonicalUrl).hostname
    : "";
  const reservedExampleHost =
    urlHostname === "example" || urlHostname.endsWith(".example");
  if (value.syntheticFixture === true) {
    if (
      !reservedExampleHost ||
      !isReservedSyntheticHostForFamily(value.canonicalUrl, value.family)
    ) {
      add(
        issues,
        "SYNTHETIC_HOST_FAMILY_MISMATCH",
        "$.canonicalUrl",
        "Synthetic fixtures must use the exact reserved hostname suffix for their source family."
      );
    }
  } else if (reservedExampleHost) {
    add(
      issues,
      "RESERVED_HOST_REQUIRES_SYNTHETIC",
      "$.canonicalUrl",
      "Reserved .example hosts are synthetic fixtures only."
    );
  }
  if (record(value.accessReview)) {
    const access = value.accessReview;
    if (access.reviewer !== undefined && !bounded(access.reviewer, 128)) {
      add(
        issues,
        "INVALID_ACCESS_REVIEWER",
        "$.accessReview.reviewer",
        "Reviewer name must be bounded text."
      );
    }
    if (access.reviewedAt !== undefined && !validTimestamp(access.reviewedAt)) {
      add(
        issues,
        "INVALID_ACCESS_REVIEW_TIME",
        "$.accessReview.reviewedAt",
        "Review time must be a timezone-aware timestamp."
      );
    }
    if (!validTimestamp(access.asOf) || !bounded(access.policyVersion, 64)) {
      add(
        issues,
        "INVALID_ACCESS_REVIEW_TIME",
        "$.accessReview",
        "As-of time and policy version are required."
      );
    }
    if (!["ALLOW", "DENY", "UNKNOWN"].includes(access.accessDecision)) {
      add(
        issues,
        "INVALID_ACCESS_DECISION",
        "$.accessReview.accessDecision",
        "Access decision must be explicit."
      );
    }
    for (const key of ["terms", "robots"] as const) {
      const evidence = access[key];
      if (
        !record(evidence) ||
        !["ALLOW", "DENY", "UNKNOWN"].includes(evidence.assessment)
      ) {
        add(
          issues,
          "INVALID_ACCESS_ASSESSMENT",
          `$.accessReview.${key}`,
          "Terms and robots assessments must be recorded separately."
        );
      }
      if (
        record(evidence) &&
        evidence.evidenceUrl !== undefined &&
        !canonicalHttps(evidence.evidenceUrl)
      ) {
        add(
          issues,
          "INVALID_ACCESS_EVIDENCE_URL",
          `$.accessReview.${key}.evidenceUrl`,
          "Access evidence URL must be canonical HTTPS."
        );
      }
      if (
        record(evidence) &&
        evidence.assessment === "ALLOW" &&
        !canonicalHttps(evidence.evidenceUrl)
      ) {
        add(
          issues,
          "MISSING_ACCESS_EVIDENCE_URL",
          `$.accessReview.${key}.evidenceUrl`,
          "Affirmative terms and robots assessments require a supporting URL."
        );
      }
      if (
        record(evidence) &&
        evidence.assessment === "ALLOW" &&
        canonicalHttps(evidence.evidenceUrl) &&
        Array.isArray(value.approvedHosts) &&
        !value.approvedHosts.includes(new URL(evidence.evidenceUrl).hostname)
      ) {
        add(
          issues,
          "ACCESS_EVIDENCE_OUT_OF_SCOPE",
          `$.accessReview.${key}.evidenceUrl`,
          "Terms and robots evidence must use an explicitly approved exact host."
        );
      }
    }
    if (
      value.syntheticFixture === true &&
      access.accessDecision === "ALLOW" &&
      access.terms?.assessment === "ALLOW" &&
      access.robots?.assessment === "ALLOW"
    ) {
      // Synthetic fixtures use explicit test-only assessment and never imply real access permission.
    }
    if (options.assessedAt && validTimestamp(access.asOf)) {
      const age = Date.parse(options.assessedAt) - Date.parse(access.asOf);
      if (age < 0 || age > SOURCE_ACCESS_REVIEW_MAX_AGE_MS) {
        add(
          issues,
          "STALE_ACCESS_REVIEW",
          "$.accessReview.asOf",
          "Access review is future dated or older than the 90-day policy window."
        );
      }
      if (
        validTimestamp(access.reviewedAt) &&
        Date.parse(access.reviewedAt) > Date.parse(options.assessedAt)
      ) {
        add(
          issues,
          "FUTURE_ACCESS_REVIEW",
          "$.accessReview.reviewedAt",
          "Human review cannot be later than the acquisition attempt."
        );
      }
      if (
        validTimestamp(access.reviewedAt) &&
        Date.parse(access.asOf) > Date.parse(access.reviewedAt)
      ) {
        add(
          issues,
          "ACCESS_REVIEW_TIME_ORDER",
          "$.accessReview.asOf",
          "Access-policy evidence cannot be future dated relative to its reviewer."
        );
      }
    }
  } else {
    add(
      issues,
      "MISSING_ACCESS_REVIEW",
      "$.accessReview",
      "Access-policy and human-review evidence are required."
    );
  }

  const transport = value.transportPolicy;
  if (
    !record(transport) ||
    transport.redirects !== "MANUAL_REVALIDATE" ||
    transport.credentials !== "OMIT" ||
    transport.port !== 443 ||
    transport.retries !== 0 ||
    transport.userAgent !== "EducationIntelligenceOfflineAcquisition/1.0"
  ) {
    add(
      issues,
      "UNSAFE_TRANSPORT_POLICY",
      "$.transportPolicy",
      "Transport must omit credentials, revalidate manual redirects and use HTTPS port 443 without retries."
    );
  } else {
    const validBudget = (n: unknown, min: number, max: number) =>
      typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
    if (
      !validBudget(transport.maxRedirects, 0, 5) ||
      !validBudget(transport.maxRequests, 1, 6) ||
      transport.maxRequests < transport.maxRedirects + 1 ||
      !validBudget(transport.maxResponseBytes, 1024, 2_000_000) ||
      !validBudget(transport.maxTotalBytes, 1024, 4_000_000) ||
      transport.maxTotalBytes < transport.maxResponseBytes ||
      !validBudget(transport.requestTimeoutMs, 100, 10_000) ||
      !validBudget(transport.totalTimeoutMs, 100, 30_000) ||
      transport.totalTimeoutMs < transport.requestTimeoutMs
    ) {
      add(
        issues,
        "INVALID_TRANSPORT_BUDGET",
        "$.transportPolicy",
        "Transport limits exceed hard caps or are internally inconsistent."
      );
    }
  }

  const access = value.accessReview;
  const approved =
    value.reviewState === "APPROVED" &&
    value.enabled === true &&
    record(access) &&
    access.accessDecision === "ALLOW" &&
    record(access.terms) &&
    access.terms.assessment === "ALLOW" &&
    record(access.robots) &&
    access.robots.assessment === "ALLOW";
  if (
    value.reviewState === "APPROVED" &&
    (!approved ||
      !bounded(access?.reviewer, 128) ||
      !validTimestamp(access?.reviewedAt))
  ) {
    add(
      issues,
      "INCOMPLETE_APPROVAL",
      "$.reviewState",
      "Approval requires a named reviewer, review time, enabled state, and affirmative access, terms and robots evidence."
    );
  }
  if (value.reviewState === "PROPOSED" && value.enabled === true) {
    add(
      issues,
      "PROPOSED_SOURCE_ENABLED",
      "$.enabled",
      "Proposed sources are disabled until explicit access approval."
    );
  }
  if (value.reviewState === "REJECTED" && value.enabled === true) {
    add(
      issues,
      "REJECTED_SOURCE_ENABLED",
      "$.enabled",
      "Rejected sources cannot be enabled."
    );
  }
  if (options.forAcquisition && !approved) {
    add(
      issues,
      "SOURCE_NOT_APPROVED",
      "$.reviewState",
      "Acquisition requires current explicit source-access approval."
    );
  }

  if (
    record(value.authorityEvidence) &&
    canonicalHttps(value.authorityEvidence.referenceUrl) &&
    Array.isArray(value.approvedHosts) &&
    !value.approvedHosts.includes(
      new URL(value.authorityEvidence.referenceUrl).hostname
    )
  ) {
    add(
      issues,
      "AUTHORITY_REFERENCE_OUT_OF_SCOPE",
      "$.authorityEvidence.referenceUrl",
      "Authority reference must use an explicitly approved exact host."
    );
  }

  return { ok: issues.length === 0, issues };
}

export function validateEducationSourceManifestCollection(
  manifests: readonly unknown[],
  options: ManifestValidationOptions = {}
): ManifestValidation {
  const issues: ManifestIssue[] = [];
  if (manifests.length > MAX_SOURCE_MANIFESTS_PER_REVIEW) {
    return {
      ok: false,
      issues: [
        {
          code: "MANIFEST_COLLECTION_LIMIT_EXCEEDED",
          path: "$",
          message: "Manifest collection exceeds its review bound.",
        },
      ],
    };
  }
  const proposals = new Map<string, number>();
  const sourceIds = new Map<string, number>();
  const sourceIdentities = new Map<string, number>();
  manifests.forEach((manifest, index) => {
    const result = validateEducationSourceManifest(manifest, options);
    for (const issue of result.issues) {
      issues.push({
        ...issue,
        path: `$.manifests[${index}]${issue.path.slice(1)}`,
      });
    }
    if (!result.ok || !record(manifest)) {
      return;
    }
    const typed = manifest as unknown as EducationSourceManifest;
    const priorProposal = proposals.get(typed.proposalId);
    if (priorProposal !== undefined) {
      add(
        issues,
        "DUPLICATE_PROPOSAL_ID",
        `$.manifests[${index}].proposalId`,
        "Proposal ID is already present in this manifest set."
      );
    } else {
      proposals.set(typed.proposalId, index);
    }
    const priorSourceId = sourceIds.get(typed.sourceId);
    if (priorSourceId !== undefined) {
      add(
        issues,
        "DUPLICATE_SOURCE_ID",
        `$.manifests[${index}].sourceId`,
        "Source ID is already present in this manifest set."
      );
    } else {
      sourceIds.set(typed.sourceId, index);
    }
    const scope =
      typed.scope.kind === "CATALOG"
        ? "catalog"
        : `provider:${typed.scope.providerId}`;
    const identity = JSON.stringify([typed.family, scope, typed.canonicalUrl]);
    const priorIdentity = sourceIdentities.get(identity);
    if (priorIdentity !== undefined) {
      add(
        issues,
        "DUPLICATE_SOURCE_IDENTITY",
        `$.manifests[${index}]`,
        "Family, scope and canonical URL already identify another proposal."
      );
    } else {
      sourceIdentities.set(identity, index);
    }
  });
  return { ok: issues.length === 0, issues };
}

export type ParsedEducationSourceManifest =
  | { readonly ok: true; readonly manifest: EducationSourceManifest }
  | { readonly ok: false; readonly issues: readonly ManifestIssue[] };

function sortManifestKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortManifestKeys);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortManifestKeys(item)])
    );
  }
  return value;
}

export function serializeEducationSourceManifest(
  manifest: EducationSourceManifest
): string {
  const validation = validateEducationSourceManifest(manifest);
  if (!validation.ok) {
    throw new TypeError(
      "Cannot serialize an invalid education source manifest."
    );
  }
  const serialized = JSON.stringify(sortManifestKeys(manifest));
  if (
    new TextEncoder().encode(serialized).byteLength >
    MAX_SERIALIZED_SOURCE_MANIFEST_BYTES
  ) {
    throw new TypeError(
      "Education source manifest exceeds its serialized size limit."
    );
  }
  return serialized;
}

export function parseEducationSourceManifest(
  serialized: string,
  options: ManifestValidationOptions = {}
): ParsedEducationSourceManifest {
  if (
    typeof serialized !== "string" ||
    new TextEncoder().encode(serialized).byteLength >
      MAX_SERIALIZED_SOURCE_MANIFEST_BYTES
  ) {
    return {
      ok: false,
      issues: [
        {
          code: "MANIFEST_SIZE_EXCEEDED",
          path: "$",
          message: "Serialized manifest exceeds its byte limit.",
        },
      ],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: "INVALID_MANIFEST_JSON",
          path: "$",
          message: "Serialized manifest is not valid JSON.",
        },
      ],
    };
  }
  const validation = validateEducationSourceManifest(parsed, options);
  return validation.ok
    ? { ok: true, manifest: parsed as unknown as EducationSourceManifest }
    : { ok: false, issues: validation.issues };
}
