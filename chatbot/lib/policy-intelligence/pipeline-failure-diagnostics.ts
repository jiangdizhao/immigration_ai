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
        message:
          value.message.length <= 240
            ? value.message
            : "The item could not be processed due to an internal pipeline error.",
        timestamp: value.timestamp.slice(0, 40),
      },
    ];
  });
}
