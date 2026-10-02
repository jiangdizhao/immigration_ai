import type {
  PolicyAnalysisAttemptOutcome,
  PolicyAnalysisAttemptTelemetry,
} from "./analysis-diagnostics";
import type {
  PolicyCandidateFailureDiagnostic,
  PolicyCandidateFailureStage,
} from "./pipeline";

export type AdminPipelineFailureDiagnostic = PolicyCandidateFailureDiagnostic;

export type AdminPolicyAnalysisAttempt = PolicyAnalysisAttemptTelemetry & {
  itemId: string;
  snapshotId: string;
  sourceConfigId: string;
};

const stages = new Set<PolicyCandidateFailureStage>([
  "discovery",
  "source_validation",
  "snapshot",
  "analysis",
  "verification",
  "publication_gate",
  "persistence",
]);
const safeErrorNames = new Set([
  "AbortError",
  "APICallError",
  "EmptyResponseBodyError",
  "InvalidResponseDataError",
  "JSONParseError",
  "LoadAPIKeyError",
  "NoObjectGeneratedError",
  "NoOutputGeneratedError",
  "NoSuchModelError",
  "PolicyAnalysisValidationError",
  "TypeValidationError",
  "ZodError",
  "Error",
]);
const analysisOutcomes = new Set<PolicyAnalysisAttemptOutcome>([
  "success",
  "provider_timeout",
  "provider_error",
  "structured_output_error",
  "schema_validation_error",
  "empty_model_output",
  "invalid_analysis_output",
  "unknown_analysis_evidence_ref",
  "analysis_internal_error",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readCandidateFailureDiagnostics(
  metadata: unknown,
  itemId: string,
  sourceConfigId: string
): AdminPipelineFailureDiagnostic[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.candidateFailures)) {
    return [];
  }
  return metadata.candidateFailures.flatMap((value) => {
    if (
      !isRecord(value) ||
      value.itemId !== itemId ||
      value.sourceConfigId !== sourceConfigId ||
      typeof value.stage !== "string" ||
      !stages.has(value.stage as PolicyCandidateFailureStage) ||
      typeof value.errorCode !== "string" ||
      (value.errorName !== undefined &&
        value.errorName !== null &&
        typeof value.errorName !== "string") ||
      typeof value.message !== "string" ||
      typeof value.timestamp !== "string" ||
      (value.snapshotId !== null && typeof value.snapshotId !== "string")
    ) {
      return [];
    }
    return [
      {
        itemId,
        snapshotId: value.snapshotId as string | null,
        sourceConfigId,
        stage: value.stage as PolicyCandidateFailureStage,
        errorCode:
          /^[a-z0-9_]{1,80}$/.test(value.errorCode)
            ? value.errorCode
            : "pipeline_error",
        errorName:
          typeof value.errorName === "string" &&
          safeErrorNames.has(value.errorName)
            ? value.errorName
            : null,
        ...(value.attemptCount === 2 &&
        value.timeoutSeconds === 120 &&
        value.retryReason === "provider_timeout"
          ? {
              attemptCount: 2 as const,
              timeoutSeconds: 120 as const,
              retryReason: "provider_timeout" as const,
            }
          : {}),
        message:
          value.message.length <= 240
            ? value.message
            : "The item could not be processed due to an internal pipeline error.",
        timestamp: value.timestamp.slice(0, 40),
      },
    ];
  });
}

export function readAnalysisAttemptDiagnostics(
  metadata: unknown,
  itemId: string,
  sourceConfigId: string
): AdminPolicyAnalysisAttempt[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.analysisAttempts)) {
    return [];
  }
  return metadata.analysisAttempts.flatMap((value) => {
    if (
      !isRecord(value) ||
      value.itemId !== itemId ||
      value.sourceConfigId !== sourceConfigId ||
      typeof value.snapshotId !== "string" ||
      value.snapshotId.length > 100 ||
      (value.attemptNumber !== 1 && value.attemptNumber !== 2) ||
      typeof value.timeoutSeconds !== "number" ||
      !Number.isFinite(value.timeoutSeconds) ||
      value.timeoutSeconds <= 0 ||
      value.timeoutSeconds > 120 ||
      typeof value.elapsedMs !== "number" ||
      !Number.isFinite(value.elapsedMs) ||
      value.elapsedMs < 0 ||
      typeof value.evidencePacketCount !== "number" ||
      !Number.isInteger(value.evidencePacketCount) ||
      value.evidencePacketCount < 0 ||
      typeof value.totalEvidenceChars !== "number" ||
      !Number.isInteger(value.totalEvidenceChars) ||
      value.totalEvidenceChars < 0 ||
      (value.approximateInputChars !== null &&
        (typeof value.approximateInputChars !== "number" ||
          !Number.isInteger(value.approximateInputChars) ||
          value.approximateInputChars < 0)) ||
      typeof value.modelName !== "string" ||
      value.modelName.length > 100 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(value.modelName) ||
      /^(sk|rk|pk)-|api[_-]?key/i.test(value.modelName) ||
      (value.reasoningEffort !== "low" &&
        value.reasoningEffort !== "medium" &&
        value.reasoningEffort !== "high") ||
      typeof value.outcome !== "string" ||
      !analysisOutcomes.has(value.outcome as PolicyAnalysisAttemptOutcome)
    ) {
      return [];
    }
    return [{
      itemId,
      snapshotId: value.snapshotId.slice(0, 100),
      sourceConfigId,
      attemptNumber: value.attemptNumber,
      timeoutSeconds: value.timeoutSeconds,
      elapsedMs: Math.round(value.elapsedMs),
      evidencePacketCount: value.evidencePacketCount,
      totalEvidenceChars: value.totalEvidenceChars,
      approximateInputChars: value.approximateInputChars as number | null,
      modelName: value.modelName,
      reasoningEffort: value.reasoningEffort,
      outcome: value.outcome as PolicyAnalysisAttemptOutcome,
    }];
  });
}
