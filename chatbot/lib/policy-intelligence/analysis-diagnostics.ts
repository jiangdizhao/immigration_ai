import {
  APICallError,
  EmptyResponseBodyError,
  InvalidResponseDataError,
  JSONParseError,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  NoSuchModelError,
  RetryError,
  TypeValidationError,
} from "ai";
import { ZodError } from "zod";

export const POLICY_ANALYSIS_TIMEOUT_MS = 90_000;
export const POLICY_ANALYSIS_RETRY_TIMEOUT_MS = 120_000;

export type PolicyAnalysisFailureCode =
  | "provider_timeout"
  | "provider_error"
  | "structured_output_error"
  | "schema_validation_error"
  | "empty_model_output"
  | "invalid_analysis_output"
  | "unknown_analysis_evidence_ref"
  | "analysis_internal_error";

export type PolicyAnalysisAttemptOutcome =
  | "success"
  | PolicyAnalysisFailureCode;

export type PolicyAnalysisAttemptContext = {
  evidencePacketCount: number;
  totalEvidenceChars: number;
  approximateInputChars: number | null;
  modelName: string;
  reasoningEffort: "low" | "medium" | "high";
};

export type PolicyAnalysisAttemptTelemetry = PolicyAnalysisAttemptContext & {
  attemptNumber: 1 | 2;
  timeoutSeconds: number;
  elapsedMs: number;
  outcome: PolicyAnalysisAttemptOutcome;
};

export type PolicyAnalysisExecutionResult<T> = {
  value: T;
  attempts: PolicyAnalysisAttemptTelemetry[];
};

export type PolicyAnalysisFailureDiagnostic = {
  errorCode: PolicyAnalysisFailureCode;
  errorName: string;
  message: string;
  analysisTimeoutTriggered: boolean;
  retryMetadata?: {
    attemptCount: 2;
    timeoutSeconds: 120;
    retryReason: "provider_timeout";
  };
  attemptTelemetry?: PolicyAnalysisAttemptTelemetry[];
};

const messages: Record<PolicyAnalysisFailureCode, string> = {
  provider_timeout: "The analysis provider timed out before returning a result.",
  provider_error: "The analysis provider could not complete the request.",
  structured_output_error: "The analysis provider returned output that could not be parsed as structured data.",
  schema_validation_error: "The analysis output did not match the required policy schema.",
  empty_model_output: "The analysis provider returned no usable output.",
  invalid_analysis_output: "The analysis provider returned output that could not be used.",
  unknown_analysis_evidence_ref: "The analysis referred to evidence outside the retrieved snapshot.",
  analysis_internal_error: "An internal error prevented policy analysis from completing.",
};

const errorNames: Record<PolicyAnalysisFailureCode, string> = {
  provider_timeout: "AbortError",
  provider_error: "APICallError",
  structured_output_error: "JSONParseError",
  schema_validation_error: "ZodError",
  empty_model_output: "NoOutputGeneratedError",
  invalid_analysis_output: "NoObjectGeneratedError",
  unknown_analysis_evidence_ref: "PolicyAnalysisValidationError",
  analysis_internal_error: "Error",
};

export class PolicyAnalysisDiagnosticError extends Error {
  readonly errorCode: PolicyAnalysisFailureCode;
  readonly errorName: string;

  constructor(
    errorCode: PolicyAnalysisFailureCode,
    errorName?: string,
    options: {
      analysisTimeoutTriggered?: boolean;
      retryMetadata?: PolicyAnalysisFailureDiagnostic["retryMetadata"];
    } = {}
  ) {
    super(messages[errorCode]);
    this.name = "PolicyAnalysisDiagnosticError";
    this.errorCode = errorCode;
    this.errorName = errorName ?? errorNames[errorCode];
    this.analysisTimeoutTriggered = options.analysisTimeoutTriggered ?? false;
    if (options.retryMetadata) {
      this.retryMetadata = options.retryMetadata;
    }
  }

  readonly analysisTimeoutTriggered: boolean;
  retryMetadata?: PolicyAnalysisFailureDiagnostic["retryMetadata"];
  attemptTelemetry?: PolicyAnalysisAttemptTelemetry[];
}

function causeOf(error: unknown): unknown {
  if (typeof error !== "object" || error === null || !("cause" in error)) {
    return undefined;
  }
  return (error as { cause?: unknown }).cause;
}

function hasAbortError(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current !== undefined; depth += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      "name" in current &&
      (current as { name?: unknown }).name === "AbortError"
    ) {
      return true;
    }
    current = causeOf(current);
  }
  return false;
}

export function classifyPolicyAnalysisFailure(
  error: unknown,
  signalAborted = false
): PolicyAnalysisDiagnosticError {
  if (error instanceof PolicyAnalysisDiagnosticError) {
    return error;
  }
  if (signalAborted) {
    return new PolicyAnalysisDiagnosticError("provider_timeout", undefined, {
      analysisTimeoutTriggered: true,
    });
  }
  if (hasAbortError(error)) {
    return new PolicyAnalysisDiagnosticError("provider_timeout");
  }
  if (RetryError.isInstance(error)) {
    if (error.reason === "abort") {
      return new PolicyAnalysisDiagnosticError("provider_timeout");
    }
    if (error.lastError !== undefined) {
      return classifyPolicyAnalysisFailure(error.lastError);
    }
  }
  if (NoOutputGeneratedError.isInstance(error)) {
    return new PolicyAnalysisDiagnosticError("empty_model_output");
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    if (JSONParseError.isInstance(error.cause)) {
      return new PolicyAnalysisDiagnosticError("structured_output_error");
    }
    if (TypeValidationError.isInstance(error.cause)) {
      return new PolicyAnalysisDiagnosticError(
        "schema_validation_error",
        "TypeValidationError"
      );
    }
    if (error.cause instanceof ZodError) {
      return new PolicyAnalysisDiagnosticError("schema_validation_error", "ZodError");
    }
    if (error.text === undefined || error.text.trim().length === 0) {
      return new PolicyAnalysisDiagnosticError("empty_model_output");
    }
    return new PolicyAnalysisDiagnosticError("invalid_analysis_output");
  }
  if (JSONParseError.isInstance(error)) {
    return new PolicyAnalysisDiagnosticError("structured_output_error");
  }
  if (TypeValidationError.isInstance(error)) {
    return new PolicyAnalysisDiagnosticError(
      "schema_validation_error",
      "TypeValidationError"
    );
  }
  if (error instanceof ZodError) {
    return new PolicyAnalysisDiagnosticError("schema_validation_error", "ZodError");
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 408 || error.statusCode === 504) {
      return new PolicyAnalysisDiagnosticError("provider_timeout");
    }
    return new PolicyAnalysisDiagnosticError("provider_error", "APICallError");
  }
  if (EmptyResponseBodyError.isInstance(error)) {
    return new PolicyAnalysisDiagnosticError(
      "provider_error",
      "EmptyResponseBodyError"
    );
  }
  if (InvalidResponseDataError.isInstance(error)) {
    return new PolicyAnalysisDiagnosticError(
      "provider_error",
      "InvalidResponseDataError"
    );
  }
  if (LoadAPIKeyError.isInstance(error)) {
    return new PolicyAnalysisDiagnosticError("provider_error", "LoadAPIKeyError");
  }
  if (NoSuchModelError.isInstance(error)) {
    return new PolicyAnalysisDiagnosticError("provider_error", "NoSuchModelError");
  }
  return new PolicyAnalysisDiagnosticError("analysis_internal_error");
}

export async function withPolicyAnalysisTimeoutRetry<T>(
  attempt: (timeoutMs: number, attemptNumber: 1 | 2) => Promise<T>,
  initialTimeoutMs: number,
  context: PolicyAnalysisAttemptContext
): Promise<PolicyAnalysisExecutionResult<T>> {
  const attemptOnce = async (timeoutMs: number, attemptNumber: 1 | 2) => {
    const startedAt = performance.now();
    try {
      const value = await attempt(timeoutMs, attemptNumber);
      return {
        ok: true as const,
        value,
        telemetry: {
          ...context,
          attemptNumber,
          timeoutSeconds: timeoutMs / 1000,
          elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
          outcome: "success" as const,
        },
      };
    } catch (error) {
      const failure = classifyPolicyAnalysisFailure(error);
      return {
        ok: false as const,
        failure,
        telemetry: {
          ...context,
          attemptNumber,
          timeoutSeconds: timeoutMs / 1000,
          elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
          outcome: failure.errorCode,
        },
      };
    }
  };

  const first = await attemptOnce(initialTimeoutMs, 1);
  if (first.ok) {
    return { value: first.value, attempts: [first.telemetry] };
  }
  if (!first.failure.analysisTimeoutTriggered) {
    first.failure.attemptTelemetry = [first.telemetry];
    throw first.failure;
  }

  const second = await attemptOnce(POLICY_ANALYSIS_RETRY_TIMEOUT_MS, 2);
  if (second.ok) {
    return { value: second.value, attempts: [first.telemetry, second.telemetry] };
  }

  second.failure.retryMetadata = {
    attemptCount: 2,
    timeoutSeconds: 120,
    retryReason: "provider_timeout",
  };
  second.failure.attemptTelemetry = [first.telemetry, second.telemetry];
  throw second.failure;
}
