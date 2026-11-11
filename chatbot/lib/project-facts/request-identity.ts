import { hashProjectOperationRequest } from "@/lib/db/project-foundation-utils";

/**
 * Phase 14-B R1-01: idempotent replay identity for a `project_fact_mutation`.
 *
 * Shared by `PostgresProjectFactRepository` and the strict offline repository simulation so
 * the two cannot drift.
 *
 * `expectedProjectRevision` is deliberately **excluded**: it is optimistic-concurrency
 * coordination state, not part of the operation's payload identity. Including it made a
 * retry of the same operation id — sent from a new request after other writes advanced the
 * Project revision — fail with `operation_conflict` instead of replaying the original
 * result, which is not what an idempotency key means.
 *
 * Compare-and-swap is unaffected: a *new* mutation still has to match the current Project
 * revision inside its transaction, and a genuinely different payload under the same
 * operation id still conflicts.
 */
export function factMutationRequestHash(
  payload: Record<string, unknown>
): string {
  const identity = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== "expectedProjectRevision")
  );
  return hashProjectOperationRequest({
    operationType: "project_fact_mutation",
    ...identity,
  });
}

export function factTransitionRequestHash(
  input: { to: string } & Record<string, unknown>
): string {
  return factMutationRequestHash({ ...input, operationType: input.to });
}

export function factGrantRequestHash(
  input: { kind: string } & Record<string, unknown>
): string {
  return factMutationRequestHash({ ...input, operationType: input.kind });
}
