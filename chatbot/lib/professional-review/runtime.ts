import "server-only";

import { auth } from "@/app/(auth)/auth";
import { createPostgresProfessionalReviewStore } from "@/lib/db/professional-review-repository";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimitStrict } from "@/lib/ratelimit";
import {
  denyAllProfessionalReviewAuthority,
  unavailableProfessionalCredentialVerifier,
} from "./authority";
import { createProfessionalReviewHandlers } from "./http";
import { isProfessionalReviewEnabled } from "./policy";
import { createProfessionalReviewService } from "./service";
import { unavailableManagedTargetProvider } from "./target-provider";

/**
 * M4-006 production composition.
 *
 * Persistence is durable: Migration 0045 plus `createPostgresProfessionalReviewStore`
 * (row lock + unique operation identity + append-only trigger). Everything that
 * would establish real authority is still deliberately fail-closed:
 *
 * - `denyAllProfessionalReviewAuthority`: no approved professional-review authority
 *   policy exists, so no request, decision or read is authorized. Nothing can be
 *   written because the authority refuses before any write is attempted.
 * - `unavailableProfessionalCredentialVerifier`: no practising-certificate or
 *   credential registry integration exists, so qualification can never be claimed
 *   (a `lawyer` account role is not evidence).
 * - `unavailableManagedTargetProvider`: no M5/M7/M8 package builder exists, so no
 *   immutable managed-application target can be resolved.
 * - `PHASE13_PROFESSIONAL_REVIEW_ENABLED` defaults OFF, so the surface is hidden.
 *
 * Test-only synthetic ports are never imported here.
 */
export const professionalReviewHandlers = createProfessionalReviewHandlers({
  actorContext() {
    // No approved assignment-verification policy for review actions: the state is
    // reported as unverifiable, and the deny-all authority still refuses.
    return Promise.resolve({
      actorRole: "unknown",
      reviewerAssignmentId: null,
      reviewerAssignmentStatus: "unavailable" as const,
    });
  },
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { type: session.user.type, userId: session.user.id };
  },
  enabled: () => isProfessionalReviewEnabled(),
  async rateLimit({ actorUserId, ipAddress, action }) {
    try {
      await checkIpRateLimitStrict(actorUserId, {
        keyPrefix: `phase13-m4-006-${action}-actor`,
        maxRequests: 60,
        ttlSeconds: 60 * 60,
      });
      if (ipAddress) {
        await checkIpRateLimitStrict(ipAddress, {
          keyPrefix: `phase13-m4-006-${action}-ip`,
          maxRequests: 120,
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
  service: createProfessionalReviewService({
    authority: denyAllProfessionalReviewAuthority,
    credentialVerifier: unavailableProfessionalCredentialVerifier,
    store: createPostgresProfessionalReviewStore(),
    targetProvider: unavailableManagedTargetProvider,
  }),
});
