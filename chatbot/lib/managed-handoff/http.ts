import { isManagedTargetKind } from "@/lib/managed-target/policy";
import type { ManagedHandoffResult } from "./policy";
import type { ManagedHandoffPayload } from "./ports";

/**
 * M4-007 bounded read-only HTTP surface.
 *
 * One GET: evaluate current managed-handoff readiness for one Project and one
 * immutable target. No mutation, no submission, no receipt, no cached badge.
 */
export type ManagedHandoffHandlerDependencies = {
  authenticate: () => Promise<{ userId: string } | null>;
  enabled?: () => boolean;
  rateLimit: (input: {
    actorUserId: string;
    ipAddress?: string | null;
  }) => Promise<boolean>;
  evaluate: (input: ManagedHandoffPayload) => Promise<ManagedHandoffResult>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TARGET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded
    ? forwarded.split(",")[0]?.trim() || null
    : request.headers.get("x-real-ip");
}

export function createManagedHandoffHandlers(
  deps: ManagedHandoffHandlerDependencies
) {
  return {
    async getReadiness(request: Request, projectId: string) {
      const session = await deps.authenticate();
      if (!session) {
        return jsonResponse({ error: "Authentication required." }, 401);
      }
      if (!(deps.enabled ?? (() => true))()) {
        return jsonResponse({ error: "Managed handoff not found." }, 404);
      }
      if (!UUID_RE.test(projectId)) {
        return jsonResponse({ error: "Managed handoff not found." }, 404);
      }
      const url = new URL(request.url);
      const targetKind = url.searchParams.get("targetKind") ?? "";
      const targetId = url.searchParams.get("targetId") ?? "";
      if (!isManagedTargetKind(targetKind) || !TARGET_ID_RE.test(targetId)) {
        return jsonResponse({ error: "Invalid managed handoff request." }, 400);
      }
      try {
        if (
          !(await deps.rateLimit({
            actorUserId: session.userId,
            ipAddress: clientIp(request),
          }))
        ) {
          return jsonResponse(
            { error: "Too many managed handoff checks. Try again later." },
            429
          );
        }
      } catch {
        return jsonResponse(
          { error: "Managed handoff service is unavailable." },
          503
        );
      }
      try {
        const result = await deps.evaluate({
          actorUserId: session.userId,
          messagingConsentPresent: false,
          projectId,
          target: { targetId, targetKind },
          vipEntitlementActive: false,
        });
        if (result.reasonCodes.includes("actor_not_authorized")) {
          return jsonResponse({ error: "Managed handoff not found." }, 403);
        }
        return jsonResponse(result);
      } catch {
        return jsonResponse(
          { error: "Managed handoff service is unavailable." },
          503
        );
      }
    },
  };
}
