import { createHash, randomUUID } from "node:crypto";
import type { OfficialSourceAcquisition } from "../../scripts/policy-intelligence-acquisition";
import type { DiscoveryCandidate } from "../../scripts/policy-intelligence-discovery";
import type {
  PolicyAnalysisAttemptTelemetry,
  PolicyAnalysisExecutionResult,
} from "./analysis-diagnostics";
import {
  classifyPolicyAnalysisFailure,
  PolicyAnalysisDiagnosticError,
  sourceFirstReasonForAnalysisFailure,
  sourceFirstReasonForVerifierFailure,
} from "./analysis-diagnostics";
import {
  evaluatePolicyPublicationDecision,
  POLICY_ANALYSIS_SCHEMA,
  POLICY_ANALYZER_VERSION,
  POLICY_SOURCE_FIRST_SCHEMA,
  POLICY_VERIFICATION_SCHEMA,
  POLICY_VERIFIER_VERSION,
  type PolicyAnalysis,
  type PolicyEvidencePacketItem,
  type PolicySourceFirstReason,
  type PolicyVerification,
  type PolicyWithheldUnit,
  policyAnalysisSchema,
  validatePolicyVerification,
} from "./contracts";
import type { PolicyAnalysisVerifier, PolicyAnalyzer } from "./provider";
import { explainPublicationReason } from "./publication-diagnostics";

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

/**
 * Phase 12 Stage 3 D-072 — stored revision metadata.
 *
 * `analysis`/`verification` are present for `ai_analysis` revisions and null
 * for `source_first` revisions, which publish the authentic official source
 * identity honestly instead of fabricating an analysis. The optional
 * `sourceFirst`, `advisories` and `withheld` fields record the non-blocking AI
 * signals and the prose that was withheld from publication.
 */
export type PolicyRevisionRecord = {
  id: string;
  analysisFingerprint: string;
  itemId: string;
  snapshotId: string;
  revisionNumber: number;
  contentKind: "ai_analysis" | "source_first";
  schemaVersion: string;
  analysis: PolicyAnalysis | null;
  verification: PolicyVerification | null;
  modelMetadata: {
    provider: "openai" | "fixture";
    model: string;
    reasoningEffort: string;
    timeoutMs: number;
    maxOutputTokens: number;
    analyzerVersion: string;
    verifierVersion: string;
    /** Present only on `source_first` revisions. */
    sourceFirst?: { reason: PolicySourceFirstReason };
    /** Non-blocking AI advisories recorded for the operator/lawyer. */
    advisories?: string[];
    /** Analysis units withheld from the published analysis. */
    withheld?: PolicyWithheldUnit[];
  };
  editorialStatus: "review_required" | "published" | "superseded";
  generatedAt: string;
  publishedAt: string | null;
  supersededAt: string | null;
};

/** A revision write request shared by the held and published paths. */
export type PolicyRevisionWrite = Omit<
  PolicyRevisionRecord,
  "id" | "revisionNumber" | "publishedAt" | "supersededAt" | "editorialStatus"
>;

/**
 * A held revision always stores a complete AI analysis for lawyer review:
 * source-first falls back to publication rather than to a hold.
 */
export type PolicyHeldRevisionWrite = PolicyRevisionWrite & {
  contentKind: "ai_analysis";
  analysis: PolicyAnalysis;
  verification: PolicyVerification;
};

/**
 * Phase 12 Stage 3 D-072 — a non-blocking signal recorded for operators and
 * lawyers. Warnings never cause a publication to be reported as failed.
 */
export type PolicyCandidateWarning = {
  itemId: string | null;
  snapshotId: string | null;
  sourceConfigId: string;
  stage: PolicyCandidateFailureStage;
  reasonCode: string;
  message: string;
  timestamp: string;
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
  /** All successful automatic publications (full analysis + source-first). */
  publishedCount: number;
  /**
   * Phase 12 Stage 3 D-072 — the subset of `publishedCount` published as a
   * minimal official-source notice because the analysis was unavailable,
   * unusable or unpublished by advisory verifier disagreement.
   */
  sourceFirstPublishedCount: number;
  heldCount: number;
  failureCount: number;
  safeErrorCode: string | null;
  candidateFailures: PolicyCandidateFailureDiagnostic[];
  /**
   * Non-blocking advisories. They are recorded for operator/lawyer review and
   * must never be reported as a failed publication.
   */
  candidateWarnings: PolicyCandidateWarning[];
  analysisAttempts: PolicyCandidateAnalysisAttempt[];
};

export type PolicyCandidateAnalysisAttempt = PolicyAnalysisAttemptTelemetry & {
  itemId: string;
  snapshotId: string;
  sourceConfigId: string;
};

export type PolicyCandidateFailureStage =
  | "discovery"
  | "source_validation"
  | "snapshot"
  | "analysis"
  | "verification"
  | "publication_gate"
  | "persistence";

export type PolicyCandidateFailureDiagnostic = {
  itemId: string | null;
  snapshotId: string | null;
  sourceConfigId: string;
  stage: PolicyCandidateFailureStage;
  errorCode: string;
  errorName: string | null;
  message: string;
  timestamp: string;
  attemptCount?: 2;
  timeoutSeconds?: 120;
  retryReason?: "provider_timeout";
};

export type MaybePromise<T> = T | Promise<T>;

export type PolicyRevisionWriteResult = {
  revision: PolicyRevisionRecord;
  created: boolean;
  /**
   * Phase 12 Stage 3 R1 — the automated write was stored as pending review
   * because the item is under durable human-publication protection. The
   * editor-approved revision remains the current public version.
   */
  heldForHumanProtection?: boolean;
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
      | "sourceFirstPublishedCount"
      | "heldCount"
      | "failureCount"
      | "safeErrorCode"
      | "candidateFailures"
      | "candidateWarnings"
      | "analysisAttempts"
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
    revision: PolicyHeldRevisionWrite
  ): MaybePromise<PolicyRevisionWriteResult>;
  publishRevision(
    revision: PolicyRevisionWrite
  ): MaybePromise<PolicyRevisionWriteResult>;
}

export type PolicySyncOutcomeKind =
  | "published"
  | "source_first_published"
  | "held"
  | "unchanged"
  | "failed"
  | "suppressed";

export type PolicySyncResult = {
  run: PolicyRunRecord;
  outcomes: Array<{
    candidateId: string;
    outcome: PolicySyncOutcomeKind;
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
  metadata: PolicyRevisionRecord["modelMetadata"],
  contentMarker: {
    contentKind: "ai_analysis" | "source_first";
  } = {
    contentKind: "ai_analysis",
  }
): string {
  const identity = {
    snapshotId,
    // D-073: the identity covers the content kind only. The AI failure reason
    // for a source-first notice stays diagnostic metadata, so the same
    // snapshot never produces two source-first revisions merely because
    // different runs failed differently.
    contentKind: contentMarker.contentKind,
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

const DIAGNOSTIC_ERROR_MESSAGES: Record<string, string> = {
  provider_timeout: "The analysis provider did not return a result in time.",
  provider_error: "The analysis provider could not complete this request.",
  pipeline_error:
    "The item could not be processed due to an internal pipeline error.",
  source_config_mismatch:
    "The discovered candidate did not match its configured source.",
  source_identity_incomplete:
    "The acquired source was missing required identity information.",
  unknown_analysis_evidence_ref:
    "The analysis referred to evidence outside the retrieved snapshot.",
};

const CANDIDATE_DIAGNOSTIC_CODES = new Set(
  Object.keys(DIAGNOSTIC_ERROR_MESSAGES)
);

function safeCandidateFailure(
  error: unknown,
  stage: PolicyCandidateFailureStage
) {
  const rawCode = safeErrorCode(error);
  const errorCode = CANDIDATE_DIAGNOSTIC_CODES.has(rawCode)
    ? rawCode
    : "pipeline_error";
  const stageMessages: Partial<Record<PolicyCandidateFailureStage, string>> = {
    source_validation: "The discovered source failed required validation.",
    snapshot: "The source snapshot could not be stored.",
    analysis: "The source snapshot could not be analyzed.",
    verification: "The analysis could not be verified.",
    publication_gate: "The publication decision could not be completed.",
    persistence: "The analysis result could not be stored.",
    discovery: "The source candidate could not be discovered.",
  };
  return {
    errorCode,
    errorName: null,
    message:
      errorCode === "pipeline_error"
        ? (stageMessages[stage] ?? DIAGNOSTIC_ERROR_MESSAGES.pipeline_error)
        : DIAGNOSTIC_ERROR_MESSAGES[errorCode],
    retryMetadata: undefined,
  };
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
    sourceFirstPublishedCount: 0,
    heldCount: 0,
    failureCount: 0,
    safeErrorCode: null,
    candidateFailures: [],
    candidateWarnings: [],
    analysisAttempts: [],
  };
  await dependencies.repository.startRun(run);
  const outcomes: PolicySyncResult["outcomes"] = [];
  let runFailure = false;
  try {
    const candidates = await dependencies.discover();
    run.discoveredCount = candidates.length;
    for (const candidate of candidates) {
      let stage: PolicyCandidateFailureStage = "source_validation";
      let itemId: string | null = null;
      let snapshotId: string | null = null;
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
        itemId = item.id;
        if (item.editorialStatus === "archived") {
          outcomes.push({
            candidateId: candidate.candidateId,
            outcome: "suppressed",
            reasonCode: "item_archived",
          });
          continue;
        }
        stage = "snapshot";
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
        snapshotId = snapshot.id;
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
        const recordAttemptTelemetry = (
          attempts: readonly PolicyAnalysisAttemptTelemetry[] | undefined
        ) => {
          if (!attempts?.length) {
            return;
          }
          run.analysisAttempts.push(
            ...attempts.map((attempt) => ({
              ...attempt,
              itemId: item.id,
              snapshotId: snapshot.id,
              sourceConfigId,
            }))
          );
        };
        const recordWarnings = (
          warningStage: PolicyCandidateFailureStage,
          reasons: readonly string[]
        ) => {
          for (const reasonCode of reasons) {
            run.candidateWarnings.push({
              itemId: item.id,
              snapshotId: snapshot.id,
              sourceConfigId,
              stage: warningStage,
              reasonCode,
              message: explainPublicationReason(reasonCode),
              timestamp: now(),
            });
          }
        };
        /**
         * Phase 12 Stage 3 D-072 — publish the authentic official source
         * honestly as a source-first notice. No analysis is fabricated: the
         * stored revision carries the snapshot identity, the official title and
         * a bounded official excerpt, and the public page states that AI
         * analysis is pending. Advisories are recorded, never reported as
         * failures.
         */
        const publishSourceFirst = async (input: {
          reason: PolicySourceFirstReason;
          advisories: readonly string[];
          withheld?: readonly PolicyWithheldUnit[];
          warningStage: PolicyCandidateFailureStage;
        }) => {
          const write = await dependencies.repository.publishRevision({
            itemId: item.id,
            snapshotId: snapshot.id,
            contentKind: "source_first",
            schemaVersion: POLICY_SOURCE_FIRST_SCHEMA,
            analysisFingerprint: computePolicyAnalysisFingerprint(
              snapshot.id,
              dependencies.modelMetadata,
              { contentKind: "source_first" }
            ),
            analysis: null,
            verification: null,
            modelMetadata: {
              ...dependencies.modelMetadata,
              sourceFirst: { reason: input.reason },
              advisories: [...input.advisories],
              withheld: input.withheld ? [...input.withheld] : undefined,
            },
            generatedAt: now(),
          });
          if (!write.created) {
            if (acquiredSnapshot.created) {
              run.unchangedCount += 1;
            }
            outcomes.push({
              candidateId: candidate.candidateId,
              outcome: "unchanged",
            });
            return;
          }
          if (write.heldForHumanProtection) {
            run.heldCount += 1;
            recordWarnings(input.warningStage, [
              "human_publication_protected",
              ...input.advisories,
            ]);
            outcomes.push({
              candidateId: candidate.candidateId,
              outcome: "held",
              reasonCode: "human_publication_protected",
            });
            return;
          }
          run.publishedCount += 1;
          run.sourceFirstPublishedCount += 1;
          recordWarnings(input.warningStage, [
            input.reason,
            ...input.advisories,
          ]);
          outcomes.push({
            candidateId: candidate.candidateId,
            outcome: "source_first_published",
            reasonCode: input.reason,
          });
        };

        stage = "analysis";
        let analysis: PolicyAnalysis;
        try {
          const analyzerOutput = await dependencies.analyzer.analyze({
            evidence,
          });
          let analysisValue: unknown = analyzerOutput;
          if (
            typeof analyzerOutput === "object" &&
            analyzerOutput !== null &&
            "value" in analyzerOutput &&
            "attempts" in analyzerOutput &&
            Array.isArray(analyzerOutput.attempts)
          ) {
            const execution =
              analyzerOutput as PolicyAnalysisExecutionResult<unknown>;
            recordAttemptTelemetry(execution.attempts);
            analysisValue = execution.value;
          }
          analysis = policyAnalysisSchema.parse(analysisValue);
          const allowedRefs = new Set(
            evidence.map((entry) => entry.evidenceRef)
          );
          const referenced = [
            ...analysis.materialClaims.flatMap((claim) => claim.evidenceRefs),
            ...analysis.keyChanges.flatMap((entry) => entry.evidenceRefs),
            ...analysis.affectedGroups.flatMap((entry) => entry.evidenceRefs),
            ...analysis.practicalImpacts.flatMap((entry) => entry.evidenceRefs),
            ...analysis.recommendedActions.flatMap(
              (entry) => entry.evidenceRefs
            ),
            ...(analysis.transitionInfo?.evidenceRefs ?? []),
            ...analysis.sourceStatus.evidenceRefs,
          ];
          if (
            referenced.some((ref) => !allowedRefs.has(ref)) ||
            analysis.relatedSnapshotRefs.some((ref) => ref !== snapshot.id)
          ) {
            throw new PolicyAnalysisDiagnosticError(
              "unknown_analysis_evidence_ref"
            );
          }
        } catch (error) {
          const fallbackReason = sourceFirstReasonForAnalysisFailure(error);
          if (!fallbackReason) {
            // Operator-disabled provider or a genuine internal error: keep the
            // explicit failure instead of publishing a notice for every item.
            throw error;
          }
          const failure = classifyPolicyAnalysisFailure(error);
          recordAttemptTelemetry(failure.attemptTelemetry);
          stage = "publication_gate";
          await publishSourceFirst({
            reason: fallbackReason,
            advisories: [failure.errorCode],
            warningStage: "analysis",
          });
          continue;
        }
        run.analyzedCount += 1;
        stage = "verification";
        let rawVerification: PolicyVerification;
        try {
          rawVerification = await dependencies.verifier.verify({
            analysis,
            evidence,
          });
        } catch (error) {
          const fallbackReason = sourceFirstReasonForVerifierFailure(error);
          if (!fallbackReason) {
            // D-073: an unexpected internal error stays a genuine failure
            // instead of being published as a benign fallback notice.
            throw error;
          }
          stage = "publication_gate";
          await publishSourceFirst({
            reason: fallbackReason,
            advisories: [safeErrorCode(error)],
            warningStage: "verification",
          });
          continue;
        }
        let verification: PolicyVerification;
        try {
          verification = validatePolicyVerification(
            rawVerification,
            analysis,
            new Set(evidence.map((entry) => entry.evidenceRef))
          );
        } catch {
          stage = "publication_gate";
          await publishSourceFirst({
            reason: "verification_unusable",
            advisories: ["verification_invalid"],
            warningStage: "verification",
          });
          continue;
        }
        stage = "publication_gate";
        const decision = evaluatePolicyPublicationDecision({
          analysis,
          verification,
          evidence,
        });
        if (decision.mode === "blocked") {
          stage = "persistence";
          const write = await dependencies.repository.saveHeldRevision({
            itemId: item.id,
            snapshotId: snapshot.id,
            contentKind: "ai_analysis",
            schemaVersion: analysis.schemaVersion,
            analysisFingerprint,
            analysis,
            verification,
            modelMetadata: {
              ...dependencies.modelMetadata,
              advisories: decision.advisories,
            },
            generatedAt: now(),
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
          recordWarnings("publication_gate", decision.advisories);
          outcomes.push({
            candidateId: candidate.candidateId,
            outcome: "held",
            reasonCode: decision.blockers[0] ?? "review_required",
          });
          continue;
        }
        if (decision.mode === "source_first") {
          stage = "publication_gate";
          await publishSourceFirst({
            reason: decision.sourceFirstReason ?? "analysis_unusable",
            advisories: decision.advisories,
            withheld: decision.withheld,
            warningStage: "publication_gate",
          });
          continue;
        }
        stage = "persistence";
        const write = await dependencies.repository.publishRevision({
          itemId: item.id,
          snapshotId: snapshot.id,
          contentKind: "ai_analysis",
          schemaVersion: decision.analysis.schemaVersion,
          analysisFingerprint,
          analysis: decision.analysis,
          verification: decision.verification,
          modelMetadata: {
            ...dependencies.modelMetadata,
            advisories: decision.advisories,
            withheld: decision.withheld,
          },
          generatedAt: now(),
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
        if (write.heldForHumanProtection) {
          // Phase 12 Stage 3 R1: the item is editor-protected, so this eligible
          // revision was captured and held for review instead of replacing the
          // human-approved publication.
          run.heldCount += 1;
          recordWarnings("publication_gate", [
            "human_publication_protected",
            ...decision.advisories,
          ]);
          outcomes.push({
            candidateId: candidate.candidateId,
            outcome: "held",
            reasonCode: "human_publication_protected",
          });
          continue;
        }
        run.publishedCount += 1;
        recordWarnings("publication_gate", decision.advisories);
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
        const diagnostic =
          stage === "analysis"
            ? (() => {
                const failure = classifyPolicyAnalysisFailure(error);
                return {
                  errorCode: failure.errorCode,
                  errorName: failure.errorName,
                  message: failure.message,
                  retryMetadata: failure.retryMetadata,
                  attemptTelemetry: failure.attemptTelemetry,
                };
              })()
            : safeCandidateFailure(error, stage);
        run.safeErrorCode ??= diagnostic.errorCode;
        run.candidateFailures.push({
          itemId,
          snapshotId,
          sourceConfigId,
          stage,
          errorCode: diagnostic.errorCode,
          errorName: diagnostic.errorName,
          message: diagnostic.message,
          timestamp: now(),
          ...(diagnostic.retryMetadata ?? {}),
        });
        if (
          stage === "analysis" &&
          "attemptTelemetry" in diagnostic &&
          diagnostic.attemptTelemetry
        ) {
          run.analysisAttempts.push(
            ...diagnostic.attemptTelemetry.map((attempt) => ({
              ...attempt,
              itemId: itemId ?? "",
              snapshotId: snapshotId ?? "",
              sourceConfigId,
            }))
          );
        }
        outcomes.push({
          candidateId: candidate.candidateId,
          outcome: "failed",
          reasonCode: diagnostic.errorCode,
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
    run.safeErrorCode = safeCandidateFailure(error, "discovery").errorCode;
  }
  run.completedAt = now();
  await dependencies.repository.finishRun(run);
  return { run, outcomes };
}
