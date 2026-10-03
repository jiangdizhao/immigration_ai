import {
  policyAnalysisSchema,
  policyVerificationSchema,
  type PolicyAnalysis,
  type PolicyVerification,
} from "./contracts";
import {
  buildAdminPublicationDiagnostics,
  type AdminPublicationDiagnostics,
} from "./publication-diagnostics";

export type AdminPolicyRevisionModelMetadata = {
  provider: "openai" | "fixture" | null;
  model: string | null;
  reasoningEffort: string | null;
  timeoutMs: number | null;
  maxOutputTokens: number | null;
  analyzerVersion: string | null;
  verifierVersion: string | null;
};

export type AdminPolicyRevisionDetail = {
  item: {
    id: string;
    slug: string;
    sourceConfigId: string;
    sourceStatus: string;
    editorialStatus: string;
  };
  snapshot: {
    id: string;
    sourceUrl: string;
    sourceTitle: string;
    retrievedAt: string;
    sourceDate: string | null;
    effectiveDate: string | null;
    evidenceTruncated: boolean;
  };
  revision: {
    id: string;
    revisionNumber: number;
    generatedAt: string;
    editorialStatus: string;
    analysisFingerprint: string;
    analysis: PolicyAnalysis;
    verification: PolicyVerification;
    modelMetadata: AdminPolicyRevisionModelMetadata;
  } | null;
  publicationDiagnostics: AdminPublicationDiagnostics;
};

type ItemRecord = AdminPolicyRevisionDetail["item"] & {
  latestSnapshotId: string | null;
};
type SnapshotRecord = {
  id: string;
  itemId: string;
  canonicalUrl: string;
  officialTitle: string;
  retrievedAt: Date | string;
  sourceDate: string | null;
  effectiveDate: string | null;
  evidenceTruncated: boolean;
  sourceId: string;
  authority: string;
  contentHash: string;
};
type RevisionRecord = {
  id: string;
  itemId: string;
  snapshotId: string;
  revisionNumber: number;
  generatedAt: Date | string;
  editorialStatus: string;
  analysisFingerprint: string;
  analysis: unknown;
  verification: unknown;
  modelMetadata: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeModelMetadata(value: unknown): AdminPolicyRevisionModelMetadata {
  const metadata = isRecord(value) ? value : {};
  const model = metadata.model;
  const reasoningEffort = metadata.reasoningEffort;
  const analyzerVersion = metadata.analyzerVersion;
  const verifierVersion = metadata.verifierVersion;
  return {
    provider:
      metadata.provider === "openai" || metadata.provider === "fixture"
        ? metadata.provider
        : null,
    model:
      typeof model === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(model) &&
      !/^(sk|rk|pk)-|api[_-]?key/i.test(model)
        ? model
        : null,
    reasoningEffort:
      typeof reasoningEffort === "string" &&
      /^[A-Za-z0-9_-]{1,40}$/.test(reasoningEffort)
        ? reasoningEffort
        : null,
    timeoutMs:
      typeof metadata.timeoutMs === "number" &&
      Number.isSafeInteger(metadata.timeoutMs) &&
      metadata.timeoutMs >= 0 &&
      metadata.timeoutMs <= 120_000
        ? metadata.timeoutMs
        : null,
    maxOutputTokens:
      typeof metadata.maxOutputTokens === "number" &&
      Number.isSafeInteger(metadata.maxOutputTokens) &&
      metadata.maxOutputTokens >= 0 &&
      metadata.maxOutputTokens <= 12_000
        ? metadata.maxOutputTokens
        : null,
    analyzerVersion:
      typeof analyzerVersion === "string" &&
      /^[A-Za-z0-9._-]{1,100}$/.test(analyzerVersion)
        ? analyzerVersion
        : null,
    verifierVersion:
      typeof verifierVersion === "string" &&
      /^[A-Za-z0-9._-]{1,100}$/.test(verifierVersion)
        ? verifierVersion
        : null,
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function buildAdminPolicyRevisionDetail(input: {
  item: ItemRecord | null;
  snapshot: SnapshotRecord | null;
  revision: RevisionRecord | null;
}): AdminPolicyRevisionDetail | null {
  const { item, snapshot, revision } = input;
  if (
    !item ||
    !snapshot ||
    !item.latestSnapshotId ||
    item.latestSnapshotId !== snapshot.id ||
    snapshot.itemId !== item.id
  ) {
    return null;
  }

  if (
    revision &&
    (revision.itemId !== item.id || revision.snapshotId !== snapshot.id)
  ) {
    return null;
  }

  const parsedAnalysis = revision
    ? policyAnalysisSchema.parse(revision.analysis)
    : null;
  const parsedVerification = revision
    ? policyVerificationSchema.parse(revision.verification)
    : null;
  const evidence = {
    evidenceRef: `policy-snapshot:${snapshot.id}`,
    snapshotId: snapshot.id,
    sourceConfigId: item.sourceConfigId,
    sourceId: snapshot.sourceId,
    authority: snapshot.authority,
    canonicalUrl: snapshot.canonicalUrl,
    officialTitle: snapshot.officialTitle,
    retrievedAt: iso(snapshot.retrievedAt),
    contentHash: snapshot.contentHash,
    sourceDate: snapshot.sourceDate,
    effectiveDate: snapshot.effectiveDate,
    evidenceTruncated: snapshot.evidenceTruncated,
    text: "",
  } as const;

  return {
    item: {
      id: item.id,
      slug: item.slug,
      sourceConfigId: item.sourceConfigId,
      sourceStatus: item.sourceStatus,
      editorialStatus: item.editorialStatus,
    },
    snapshot: {
      id: snapshot.id,
      sourceUrl: snapshot.canonicalUrl,
      sourceTitle: snapshot.officialTitle,
      retrievedAt: iso(snapshot.retrievedAt),
      sourceDate: snapshot.sourceDate,
      effectiveDate: snapshot.effectiveDate,
      evidenceTruncated: snapshot.evidenceTruncated,
    },
    revision:
      revision && parsedAnalysis && parsedVerification
        ? {
            id: revision.id,
            revisionNumber: revision.revisionNumber,
            generatedAt: iso(revision.generatedAt),
            editorialStatus: revision.editorialStatus,
            analysisFingerprint: revision.analysisFingerprint,
            analysis: parsedAnalysis,
            verification: parsedVerification,
            modelMetadata: safeModelMetadata(revision.modelMetadata),
          }
        : null,
    publicationDiagnostics: buildAdminPublicationDiagnostics({
      editorialStatus: item.editorialStatus,
      analysis: parsedAnalysis,
      verification: parsedVerification,
      evidence,
    }),
  };
}
