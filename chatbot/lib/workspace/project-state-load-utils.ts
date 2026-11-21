import type { ProjectStateCapability } from "./project-state";

/** Map source exceptions without converting unreadable data into an empty result. */
export function projectStateSourceFailure(
  error: unknown
): ProjectStateCapability {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "project_fact_source_overflow") {
    return {
      state: "unavailable",
      reasonCode: "project_fact_source_exceeds_bound",
    };
  }
  if (code === "limit_exceeded") {
    return { state: "unavailable", reasonCode: "source_list_exceeds_bound" };
  }
  if (
    code === "actor_not_eligible" ||
    code === "project_forbidden" ||
    code === "project_not_found" ||
    code === "not_found"
  ) {
    return {
      state: "restricted",
      reasonCode: "authorization_or_private_scope",
    };
  }
  return { state: "unavailable", reasonCode: "source_read_failed" };
}

/** Run bounded read-only fan-out while preserving the source ordering. */
export async function mapWithConcurrency<T, R>(input: {
  items: readonly T[];
  concurrency: number;
  mapper: (item: T, index: number) => Promise<R>;
}): Promise<R[]> {
  if (!Number.isSafeInteger(input.concurrency) || input.concurrency < 1) {
    throw new RangeError("concurrency_must_be_positive_integer");
  }
  const output = new Array<R>(input.items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= input.items.length) {
        return;
      }
      const item = input.items[index] as T;
      output[index] = await input.mapper(item, index);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(input.concurrency, input.items.length) },
      () => worker()
    )
  );
  return output;
}
