import type { ProjectFactAssertion } from "@/lib/project-facts/facts";
import { boundFactValue } from "./gs-draft";
import type {
  Student500FactCandidate,
  Student500FactContextPort,
} from "./ports";

/**
 * Bounded M2 evidence adapter for Student 500 preparation.
 *
 * The only accepted input is the M2 `stableProjection`, which already enforces
 * publication audience, customer confirmation, active AI-use grant, evidence
 * source validity and unresolved-conflict exclusion. This adapter then:
 *
 *   - keeps only rows the actor is authorized to see (the projection already did);
 *   - reduces every value to a bounded display string (never a raw projection
 *     dump, never a document, never another member's private narration);
 *   - reports conflicts only for facts the actor can see, and never describes a
 *     conflict that involves a hidden assertion;
 *   - returns `unavailable` instead of an empty list when the projection cannot be
 *     read, so the caller cannot mistake "unknown" for "no facts".
 */

export type ProjectionLike = {
  readonly authorizedForAI: readonly ProjectFactAssertion[];
  readonly unresolvedCandidates: readonly ProjectFactAssertion[];
  readonly conflicts: readonly {
    readonly leftAssertionId: string;
    readonly rightAssertionId: string;
    readonly resolvedAt: string | null;
  }[];
  readonly available: boolean;
};

export function createFactContextPort(input: {
  readonly projection: (args: {
    readonly actorUserId: string;
    readonly projectId: string;
  }) => Promise<ProjectionLike>;
}): Student500FactContextPort {
  return {
    async list(args) {
      try {
        const projection = await input.projection({
          actorUserId: args.actorUserId,
          projectId: args.projectId,
        });
        if (!projection.available) {
          return {
            reason: "fact_projection_unavailable",
            status: "unavailable" as const,
          };
        }
        const conflicted = new Set(
          projection.conflicts
            .filter((conflict) => conflict.resolvedAt === null)
            .flatMap((conflict) => [
              conflict.leftAssertionId,
              conflict.rightAssertionId,
            ])
        );
        const authorized = new Set(
          projection.authorizedForAI.map((assertion) => assertion.id)
        );
        const seen = new Set<string>();
        const facts: Student500FactCandidate[] = [];
        // Authorized-for-AI rows first so an assertion appears once, flagged as it
        // is currently authorized.
        for (const assertion of [
          ...projection.authorizedForAI,
          ...projection.unresolvedCandidates,
        ]) {
          if (seen.has(assertion.id)) {
            continue;
          }
          seen.add(assertion.id);
          const aiUseAuthorized = authorized.has(assertion.id);
          facts.push({
            aiUseAuthorized,
            authorizationActorUserId: aiUseAuthorized ? args.actorUserId : null,
            authorizedAudience: aiUseAuthorized ? "project" : "none",
            conflicted: conflicted.has(assertion.id),
            customerConfirmed: assertion.state === "customer_confirmed",
            factAssertionId: assertion.id,
            key: assertion.key,
            originKind: assertion.originKind,
            sourceEvidenceRef: assertion.sourceEvidenceRef,
            stale: assertion.stale,
            state: assertion.state,
            valueDisplay: boundFactValue(assertion.value),
            version: assertion.version,
          });
        }
        facts.sort((left, right) =>
          left.key === right.key
            ? left.version - right.version
            : left.key.localeCompare(right.key)
        );
        return { facts, status: "available" as const };
      } catch {
        return {
          reason: "fact_projection_unreadable",
          status: "unavailable" as const,
        };
      }
    },
  };
}
