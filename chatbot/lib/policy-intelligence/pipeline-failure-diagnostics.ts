import type {
  PolicyCandidateFailureDiagnostic,
  PolicyCandidateFailureStage,
} from "./pipeline";

export type AdminPipelineFailureDiagnostic = PolicyCandidateFailureDiagnostic;

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
        value.timeoutSeconds === 60 &&
        value.retryReason === "provider_timeout"
          ? {
              attemptCount: 2 as const,
              timeoutSeconds: 60 as const,
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
