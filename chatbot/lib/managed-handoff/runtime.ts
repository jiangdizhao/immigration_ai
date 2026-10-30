import "server-only";

import { auth } from "@/app/(auth)/auth";
import { loadManagedHandoffSnapshot } from "@/lib/db/managed-handoff-snapshot-repository";
import { ChatbotError } from "@/lib/errors";
import { unavailableManagedTargetProvider } from "@/lib/professional-review/target-provider";
import { checkIpRateLimitStrict } from "@/lib/ratelimit";
import { evaluateManagedHandoffReadiness } from "./evaluator";
import { createManagedHandoffHandlers } from "./http";
import { isManagedHandoffEnabled } from "./policy";
import { denyAllManagedHandoffPorts } from "./ports";
import { managedHandoffPortsFromSnapshot } from "./snapshot";

/**
 * M4-007 production composition.
 *
 * Authoritative Project, membership, assignment, engagement, agreement, signature,
 * disclosure, frozen-payment and persisted-review state are read through one
 * repeatable-read, SELECT-only snapshot. Three authorities remain unresolved, so a
 * production READY is still impossible:
 *
 * - no approved signature-verification authority policy;
 * - no approved payment-validity authority (frozen M4-005), so positive payment
 *   assertions are downgraded to UNKNOWN;
 * - no approved customer-confirmation policy, so that predicate is UNKNOWN.
 *
 * A failed read answers UNKNOWN rather than guessing.
 *
 * `PHASE13_MANAGED_HANDOFF_ENABLED` defaults OFF, so the route is hidden.
 */
const productionPorts = denyAllManagedHandoffPorts(
  unavailableManagedTargetProvider
);

export const managedHandoffHandlers = createManagedHandoffHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { userId: session.user.id };
  },
  enabled: () => isManagedHandoffEnabled(),
  async evaluate(input) {
    try {
      const snapshot = await loadManagedHandoffSnapshot({
        actorUserId: input.actorUserId,
        // No professional credential registry is integrated.
        credential: "unavailable",
        projectId: input.projectId,
        // No M5/M7/M8 package provider exists, so no exact target can be resolved
        // and the review predicate stays UNKNOWN.
        resolvedTarget: null,
        targetId: input.target.targetId,
        targetKind: input.target.targetKind,
      });
      return await evaluateManagedHandoffReadiness(
        input,
        managedHandoffPortsFromSnapshot(snapshot, {
          policy: {
            confirmation: { status: "policy_unknown" },
            paymentValidity: "untrusted",
            signatureAuthority: "unapproved",
          },
          targetProvider: unavailableManagedTargetProvider,
        })
      );
    } catch {
      // A failed read is not evidence of absence: answer UNKNOWN, never READY.
      return evaluateManagedHandoffReadiness(input, productionPorts);
    }
  },
  async rateLimit({ actorUserId, ipAddress }) {
    try {
      await checkIpRateLimitStrict(actorUserId, {
        keyPrefix: "phase13-m4-007-readiness-actor",
        maxRequests: 120,
        ttlSeconds: 60 * 60,
      });
      if (ipAddress) {
        await checkIpRateLimitStrict(ipAddress, {
          keyPrefix: "phase13-m4-007-readiness-ip",
          maxRequests: 240,
          ttlSeconds: 60 * 60,
        });
      }
      return true;
    } catch (error) {
      if (error instanceof ChatbotError && error.type === "rate_limit") {
        return false;
      }
      throw error;
    }
  },
});
