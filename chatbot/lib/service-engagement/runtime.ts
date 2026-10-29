import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { projectStaffAssignmentSchemaAvailable } from "@/lib/db/project-staff-assignment-schema-availability";
import { serviceEngagementRepository } from "@/lib/db/service-engagement-repository";
import { serviceEngagementSchemaAvailable } from "@/lib/db/service-engagement-schema-availability";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimitStrict } from "@/lib/ratelimit";
import { denyAllServiceOperatorAuthority } from "./authority";
import { unsupportedProjectResourceDisclosureResolver } from "./disclosure";
import { createServiceEngagementHandlers } from "./http";
import { denyAllServiceSignatureEvidenceVerifier } from "./signature";

/**
 * Phase 13 M4-004 production composition.
 *
 * Every external evidence port is deliberately deny-by-default:
 *
 * - `denyAllServiceOperatorAuthority`: no approved contract operator, issuer or
 *   verification-operator policy exists, so no agreement version can be authored,
 *   issued or independently verified. A global `lawyer`/`admin` role is never
 *   sufficient: the authority receives the exact persisted target and the
 *   operator's current assignment state (R1-04).
 * - `denyAllServiceSignatureEvidenceVerifier`: no approved signature provider or
 *   manual-attestation protocol exists, so no evidence can become verified and no
 *   managed service can activate.
 * - `unsupportedProjectResourceDisclosureResolver`: no verified protected
 *   resource source adapter exists, so no disclosure grant can be created and no
 *   disclosure decision can allow access.
 * - no `resourceRevalidator` is composed: in-transaction resource revalidation
 *   (R1-05) is unavailable, so grant creation fails closed even if a resolver were
 *   supplied.
 *
 * Test-only synthetic ports are never imported here.
 */
export const serviceEngagementHandlers = createServiceEngagementHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { userId: session.user.id, type: session.user.type };
  },
  async schemaAvailable() {
    return (
      (await projectFoundationSchemaAvailable()) &&
      (await projectStaffAssignmentSchemaAvailable()) &&
      (await serviceEngagementSchemaAvailable())
    );
  },
  repository: serviceEngagementRepository,
  async rateLimit({ actorUserId, ipAddress, action }) {
    const mutation = [
      "engagement_create",
      "agreement_draft",
      "agreement_issue",
      "agreement_accept",
      "signature_submit",
      "signature_verify",
      "engagement_lifecycle",
      "disclosure_create",
      "disclosure_revoke",
    ].includes(action);
    const options = mutation
      ? { maxRequests: 30, ttlSeconds: 60 * 60 }
      : { maxRequests: 120, ttlSeconds: 60 * 60 };
    try {
      await checkIpRateLimitStrict(actorUserId, {
        ...options,
        keyPrefix: `phase13-m4-004-${action}-actor`,
      });
      if (ipAddress) {
        await checkIpRateLimitStrict(ipAddress, {
          maxRequests: options.maxRequests * 2,
          ttlSeconds: options.ttlSeconds,
          keyPrefix: `phase13-m4-004-${action}-ip`,
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
  issuanceAuthority: denyAllServiceOperatorAuthority,
  signatureVerifier: denyAllServiceSignatureEvidenceVerifier,
  resourceResolver: unsupportedProjectResourceDisclosureResolver,
});
