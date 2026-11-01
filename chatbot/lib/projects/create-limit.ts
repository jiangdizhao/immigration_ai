/**
 * Phase 13 P1 final security correction (Correction B): bounded Project creation.
 *
 * Project creation is open to every authenticated identity, so repeated creation
 * needs a hard, server-side bound. Two independent controls exist:
 *
 * 1. A per-actor active-Project cap enforced inside the existing
 *    `createProject` transaction (authoritative; needs no schema change and no
 *    Redis). Exact `operationId` replays return the existing Project and are
 *    never rejected by this cap.
 * 2. Best-effort request rate limits at the HTTP boundary, with a tighter tier
 *    for guest sessions.
 *
 * The request rate limits reuse the existing rate-limit infrastructure and are
 * fail-open there by design; the active-Project cap is what makes the bound
 * authoritative.
 */

/** Maximum number of simultaneously active Projects one actor may own. */
export const PROJECT_ACTIVE_PROJECT_LIMIT = 10;

export type ProjectCreateActorType = "guest" | "regular";

export type ProjectCreateLimitDecision =
  | {
      readonly activeProjectCount: number;
      readonly allowed: true;
      readonly limit: number;
    }
  | {
      readonly activeProjectCount: number;
      readonly allowed: false;
      readonly limit: number;
      readonly reason: "active_project_limit";
    };

/**
 * Deterministic cap decision. A replay is handled by the caller before this
 * check, so an exact retry of an already-created Project can never be rejected
 * merely because the actor is at the cap.
 */
export function projectCreateLimitDecision(input: {
  activeProjectCount: number;
  limit?: number;
}): ProjectCreateLimitDecision {
  const limit = input.limit ?? PROJECT_ACTIVE_PROJECT_LIMIT;
  const activeProjectCount =
    Number.isSafeInteger(input.activeProjectCount) &&
    input.activeProjectCount > 0
      ? input.activeProjectCount
      : 0;
  if (activeProjectCount >= limit) {
    return {
      activeProjectCount,
      allowed: false,
      limit,
      reason: "active_project_limit",
    };
  }
  return { activeProjectCount, allowed: true, limit };
}

export type ProjectCreateRateLimit = {
  readonly actor: number;
  readonly ip: number;
  readonly ttlSeconds: number;
};

/**
 * Best-effort request bounds. Guests get a stricter tier because a guest
 * identity is cheap to mint; registered customers keep comfortable headroom.
 */
export const PROJECT_CREATE_RATE_LIMITS: Record<
  ProjectCreateActorType,
  ProjectCreateRateLimit
> = {
  guest: { actor: 3, ip: 6, ttlSeconds: 60 * 60 },
  regular: { actor: 10, ip: 30, ttlSeconds: 60 * 60 },
};

export function projectCreateRateLimit(
  actorType: ProjectCreateActorType | undefined
): ProjectCreateRateLimit {
  return PROJECT_CREATE_RATE_LIMITS[
    actorType === "guest" ? "guest" : "regular"
  ];
}
