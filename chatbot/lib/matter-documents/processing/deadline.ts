import { DOCUMENT_PROCESSING_LIMITS } from "./limits";

export type ProcessingDeadline = {
  deadlineAt: number;
  signal: AbortSignal;
  assertActive(): void;
  remainingMs(): number;
  dispose(): void;
};

export function createProcessingDeadline(
  runtimeMs: number = DOCUMENT_PROCESSING_LIMITS.runtimeMs
): ProcessingDeadline {
  const controller = new AbortController();
  const deadlineAt = Date.now() + runtimeMs;
  const timeout = setTimeout(
    () => controller.abort(new Error("processing_timeout")),
    runtimeMs
  );
  return {
    deadlineAt,
    signal: controller.signal,
    assertActive() {
      if (controller.signal.aborted || Date.now() >= deadlineAt) {
        if (!controller.signal.aborted) {
          controller.abort(new Error("processing_timeout"));
        }
        throw new Error("processing_timeout");
      }
    },
    remainingMs() {
      this.assertActive();
      return Math.max(1, deadlineAt - Date.now());
    },
    dispose() {
      clearTimeout(timeout);
    },
  };
}

export function assertProcessingDeadline(input: {
  deadlineAt?: number;
  signal?: AbortSignal;
}): void {
  if (
    input.signal?.aborted ||
    (input.deadlineAt !== undefined && Date.now() >= input.deadlineAt)
  ) {
    throw new Error("processing_timeout");
  }
}
