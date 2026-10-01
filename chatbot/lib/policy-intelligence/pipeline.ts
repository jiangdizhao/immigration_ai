import { createHash, randomUUID } from "node:crypto";
import type { OfficialSourceAcquisition } from "../../scripts/policy-intelligence-acquisition";
import type { DiscoveryCandidate } from "../../scripts/policy-intelligence-discovery";
import {
  evaluatePublicationGate,
  POLICY_ANALYSIS_SCHEMA,
  POLICY_ANALYZER_VERSION,
  POLICY_VERIFICATION_SCHEMA,
  POLICY_VERIFIER_VERSION,
  type PolicyAnalysis,
  type PolicyEvidencePacketItem,
  type PolicyVerification,
  policyAnalysisSchema,
  validatePolicyVerification,
} from "./contracts";
import type { PolicyAnalysisVerifier, PolicyAnalyzer } from "./provider";

export type PolicyItemRecord = {
  id: string;
  slug: string;
  sourceConfigId: string;
  sourceId: string;
  canonicalOfficialUrl: string;
  sourceStatus: PolicyAnalysis["sourceStatus"]["value"];
  editorialStatus: "draft" | "review_required" | "published" | "archived";
  latestSnapshotId: string | null;
  latestPublishedRevisionId: string | null;
};

export type PolicySnapshotRecord = OfficialSourceAcquisition & {
  id: string;
  itemId: string;
  previousSnapshotId: string | null;
  evidenceTruncated: boolean;
};

export type PolicyRevisionRecord = {
  id: string;
  analysisFingerprint: string;
  itemId: string;
  snapshotId: string;
  revisionNumber: number;
  analysis: PolicyAnalysis;
  verification: PolicyVerification;
  modelMetadata: {
    provider: "openai" | "fixture";
    model: string;
    reasoningEffort: string;
    timeoutMs: number;
    maxOutputTokens: number;
    analyzerVersion: string;
    verifierVersion: string;
  };
  editorialStatus: "review_required" | "published" | "superseded";
  generatedAt: string;
  publishedAt: string | null;
  supersededAt: string | null;
};

export type PolicyRunRecord = {
  id: string;
  sourceConfigId: string;
  mode: "live" | "fixture";
  status: "running" | "complete" | "partial" | "failed";
  startedAt: string;
  completedAt: string | null;
  discoveredCount: number;
  snapshottedCount: number;
  unchangedCount: number;
  analyzedCount: number;
  publishedCount: number;
  heldCount: number;
  failureCount: number;
  safeErrorCode: string | null;
};

export type MaybePromise<T> = T | Promise<T>;

export type PolicyRevisionWriteResult = {
  revision: PolicyRevisionRecord;
  created: boolean;
};

export class PolicyItemArchivedError extends Error {
  constructor() {
    super("policy_item_archived");
    this.name = "PolicyItemArchivedError";
  }
}

export function createPolicyModelMetadata(input: {
  provider: PolicyRevisionRecord["modelMetadata"]["provider"];
  model: string;
  reasoningEffort: string;
  timeoutMs: number;
  maxOutputTokens: number;
}): PolicyRevisionRecord["modelMetadata"] {
  return {
    ...input,
    analyzerVersion: POLICY_ANALYZER_VERSION,
    verifierVersion: POLICY_VERIFIER_VERSION,
  };
}

export interface PolicyIntelligenceRepository {
  startRun(
    input: Omit<
      PolicyRunRecord,
      | "completedAt"
      | "discoveredCount"
      | "snapshottedCount"
      | "unchangedCount"
      | "analyzedCount"
      | "publishedCount"
      | "heldCount"
      | "failureCount"
      | "safeErrorCode"
    >
  ): MaybePromise<void>;
  finishRun(run: PolicyRunRecord): MaybePromise<void>;
  getOrCreateItem(
    item: Omit<
      PolicyItemRecord,
      "id" | "latestSnapshotId" | "latestPublishedRevisionId"
    >
  ): MaybePromise<PolicyItemRecord>;
  createItem(
    item: Omit<
      PolicyItemRecord,
      "id" | "latestSnapshotId" | "latestPublishedRevisionId"
    >
  ): MaybePromise<PolicyItemRecord>;
  hasRevisionForAnalysis(
    snapshotId: string,
    analysisFingerprint: string
  ): MaybePromise<boolean>;
  acquireSnapshot(
    snapshot: Omit<PolicySnapshotRecord, "id" | "previousSnapshotId">
  ): MaybePromise<{
    snapshot: PolicySnapshotRecord;
    created: boolean;
    staleAcquisition?: boolean;
  }>;
  saveHeldRevision(
    revision: Omit<
      PolicyRevisionRecord,
      "id" | "revisionNumber" | "publishedAt" | "supersededAt"
    >
  ): MaybePromise<PolicyRevisionWriteResult>;
  publishRevision(
    revision: Omit<
      PolicyRevisionRecord,
      | "id"
      | "revisionNumber"
      | "publishedAt"
      | "supersededAt"
      | "editorialStatus"
    >
  ): MaybePromise<PolicyRevisionWriteResult>;
}

export type PolicySyncResult = {
  run: PolicyRunRecord;
  outcomes: Array<{
    candidateId: string;
    outcome: "published" | "held" | "unchanged" | "failed" | "suppressed";
    reasonCode?: string;
  }>;
};

export type PolicySyncDependencies = {
  repository: PolicyIntelligenceRepository;
  discover: () => Promise<readonly DiscoveryCandidate[]>;
  acquire: (
    candidate: DiscoveryCandidate
  ) => Promise<OfficialSourceAcquisition>;
  analyzer: PolicyAnalyzer;
  verifier: PolicyAnalysisVerifier;
  modelMetadata: PolicyRevisionRecord["modelMetadata"];
  mode: "live" | "fixture";
  now?: () => string;
  makeId?: () => string;
};

function stableIdentity(sourceConfigId: string, canonicalUrl: string): string {
  return createHash("sha256")
    .update(`${sourceConfigId}\n${canonicalUrl}`)
    .digest("hex")
    .slice(0, 32);
}

export function computePolicyAnalysisFingerprint(
  snapshotId: string,
  metadata: PolicyRevisionRecord["modelMetadata"]
): string {
  const identity = {
    snapshotId,
    analysisSchemaVersion: POLICY_ANALYSIS_SCHEMA,
    verificationSchemaVersion: POLICY_VERIFICATION_SCHEMA,
    analyzerVersion: metadata.analyzerVersion,
    verifierVersion: metadata.verifierVersion,
    provider: metadata.provider,
    model: metadata.model,
    reasoningEffort: metadata.reasoningEffort,
    timeoutMs: metadata.timeoutMs,
    maxOutputTokens: metadata.maxOutputTokens,
  };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

export function stablePolicySlug(canonicalUrl: string): string {
  const url = new URL(canonicalUrl);
  const path = url.pathname.split("/").filter(Boolean).slice(-3).join("-");
  const base =
    path
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || "policy-update";
  const suffix = createHash("sha256")
    .update(canonicalUrl)
    .digest("hex")
    .slice(0, 10);
  return `${base}-${suffix}`;
}

function toEvidencePacket(
  snapshot: PolicySnapshotRecord
): PolicyEvidencePacketItem {
  return {
    evidenceRef: `policy-snapshot:${snapshot.id}`,
    snapshotId: snapshot.id,
    sourceConfigId: snapshot.sourceConfigId,
    sourceId: snapshot.sourceId,
    authority: snapshot.authority,
    canonicalUrl: snapshot.canonicalUrl,
    officialTitle: snapshot.officialTitle,
    retrievedAt: snapshot.retrievedAt,
    contentHash: snapshot.contentHash,
    sourceDate: snapshot.sourceDate,
    effectiveDate: snapshot.effectiveDate,
    evidenceTruncated: snapshot.evidenceTruncated,
    text: snapshot.normalizedEvidence,
  };
}

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[a-z0-9_]{1,80}$/.test(code)) {
      return code;
    }
  }
  if (error instanceof Error && /^[a-z0-9_]{1,80}$/.test(error.message)) {
    return error.message;
  }
  return "pipeline_error";
}

export async function runPolicyIntelligenceSync(
  dependencies: PolicySyncDependencies,
  sourceConfigId: string
): Promise<PolicySyncResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const makeId = dependencies.makeId ?? randomUUID;
  const run: PolicyRunRecord = {
    id: makeId(),
    sourceConfigId,
    mode: dependencies.mode,
    status: "running",
    startedAt: now(),
    completedAt: null,
    discoveredCount: 0,
    snapshottedCount: 0,
    unchangedCount: 0,
    analyzedCount: 0,
    publishedCount: 0,
    heldCount: 0,
    failureCount: 0,
    safeErrorCode: null,
  };
  await dependencies.repository.startRun(run);
  const outcomes: PolicySyncResult["outcomes"] = [];
  let runFailure = false;
  try {
    const candidates = await dependencies.discover();
    run.discoveredCount = candidates.length;
    for (const candidate of candidates) {
      try {
        if (candidate.sourceConfigId !== sourceConfigId) {
          throw new Error("source_config_mismatch");
        }
        const acquisition = await dependencies.acquire(candidate);
        if (
          acquisition.sourceConfigId !== sourceConfigId ||
          !acquisition.canonicalUrl.startsWith("https://") ||
          !acquisition.contentHash
        ) {
          throw new Error("source_identity_incomplete");
        }
        const canonicalOfficialUrl = acquisition.canonicalUrl;
        const sourceId = stableIdentity(sourceConfigId, canonicalOfficialUrl);
        const item = await dependencies.repository.getOrCreateItem({
          slug: stablePolicySlug(canonicalOfficialUrl),
          sourceConfigId,
          sourceId,
          canonicalOfficialUrl,
          sourceStatus: "announced",
          editorialStatus: "draft",
        });
        if (item.editorialStatus === "archived") {
          outcomes.push({
            candidateId: candidate.candidateId,
            outcome: "suppressed",
            reasonCode: "item_archived",
          });
          continue;
        }
        const acquiredSnapshot = await dependencies.repository.acquireSnapshot({
          ...acquisition,
          sourceId,
          itemId: item.id,
          sourceMetadata: {
            ...acquisition.sourceMetadata,
            discoveryStrategy: candidate.discoveryStrategy,
            discoveryMetadata: candidate.sourceMetadata,
          },
        });
        const snapshot = acquiredSnapshot.snapshot;
        if (acquiredSnapshot.created) {
          run.snapshottedCount += 1;
        } else {
          run.unchangedCount += 1;
          // Reuse an already captured snapshot after analyzer/verifier failure.
        }
        const analysisFingerprint = computePolicyAnalysisFingerprint(
          snapshot.id,
          dependencies.modelMetadata
        );
        if (
          await dependencies.repository.hasRevisionForAnalysis(
            snapshot.id,
            analysisFingerprint
          )
        ) {
          outcomes.push({
            candidateId: candidate.candidateId,
            outcome: "unchanged",
          });
          continue;
        }
        const evidence = [toEvidencePacket(snapshot)];
        const analysis = policyAnalysisSchema.parse(
          await dependencies.analyzer.analyze({ evidence })
        );
        run.analyzedCount += 1;
        const allowedRefs = new Set(evidence.map((entry) => entry.evidenceRef));
        const referenced = [
          ...analysis.materialClaims.flatMap((claim) => claim.evidenceRefs),
          ...analysis.keyChanges.flatMap((entry) => entry.evidenceRefs),
          ...analysis.affectedGroups.flatMap((entry) => entry.evidenceRefs),
          ...analysis.practicalImpacts.flatMap((entry) => entry.evidenceRefs),
          ...analysis.recommendedActions.flatMap((entry) => entry.evidenceRefs),
          ...(analysis.transitionInfo?.evidenceRefs ?? []),
          ...analysis.sourceStatus.evidenceRefs,
        ];
        if (
          referenced.some((ref) => !allowedRefs.has(ref)) ||
          analysis.relatedSnapshotRefs.some((ref) => ref !== snapshot.id)
        ) {
          throw new Error("unknown_analysis_evidence_ref");
        }
        const verification = validatePolicyVerification(
          await dependencies.verifier.verify({ analysis, evidence }),
          analysis,
          allowedRefs
        );
        const gate = evaluatePublicationGate({
          analysis,
          verification,
          evidence,
          acquisitionComplete: !snapshot.evidenceTruncated,
        });
        const revisionInput = {
          itemId: item.id,
          snapshotId: snapshot.id,
          analysisFingerprint,
          analysis,
          verification,
          modelMetadata: dependencies.modelMetadata,
          generatedAt: now(),
        };
        if (!gate.eligible) {
          const write = await dependencies.repository.saveHeldRevision({
            ...revisionInput,
            editorialStatus: "review_required",
          });
          if (!write.created) {
            if (acquiredSnapshot.created) {
              run.unchangedCount += 1;
            }
            outcomes.push({
              candidateId: candidate.candidateId,
              outcome: "unchanged",
            });
            continue;
          }
          run.heldCount += 1;
          outcomes.push({
            candidateId: candidate.candidateId,
            outcome: "held",
            reasonCode: gate.reasons[0] ?? "review_required",
          });
          continue;
        }
        const write =
          await dependencies.repository.publishRevision(revisionInput);
        if (!write.created) {
          if (acquiredSnapshot.created) {
            run.unchangedCount += 1;
          }
          outcomes.push({
            candidateId: candidate.candidateId,
            outcome: "unchanged",
          });
          continue;
        }
        run.publishedCount += 1;
        outcomes.push({
          candidateId: candidate.candidateId,
          outcome: "published",
        });
      } catch (error) {
        if (error instanceof PolicyItemArchivedError) {
          outcomes.push({
            candidateId: candidate.candidateId,
            outcome: "suppressed",
            reasonCode: "item_archived",
          });
          continue;
        }
        run.failureCount += 1;
        run.heldCount += 1;
        runFailure = true;
        const code = safeErrorCode(error);
        run.safeErrorCode ??= code;
        outcomes.push({
          candidateId: candidate.candidateId,
          outcome: "failed",
          reasonCode: code,
        });
      }
    }
    run.status = runFailure
      ? run.publishedCount > 0
        ? "partial"
        : "failed"
      : "complete";
  } catch (error) {
    run.failureCount += 1;
    run.status = "failed";
    run.safeErrorCode = safeErrorCode(error);
  }
  run.completedAt = now();
  await dependencies.repository.finishRun(run);
  return { run, outcomes };
}
