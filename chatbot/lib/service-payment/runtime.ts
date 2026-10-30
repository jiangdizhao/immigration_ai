import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { projectStaffAssignmentSchemaAvailable } from "@/lib/db/project-staff-assignment-schema-availability";
import { serviceEngagementSchemaAvailable } from "@/lib/db/service-engagement-schema-availability";
import { createServicePaymentRepository } from "@/lib/db/service-payment-repository";
import { servicePaymentSchemaAvailable } from "@/lib/db/service-payment-schema-availability";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimitStrict } from "@/lib/ratelimit";
import {
  denyAllServicePaymentContractAuthority,
  denyAllServicePaymentFinanceAuthority,
  denyAllServicePaymentStatusReadAuthority,
} from "./authority";
import { createServicePaymentHandlers } from "./http";
import {
  denyAllServicePaymentEvidenceVerifier,
  unsupportedServicePaymentReversalResolver,
} from "./verification";

/**
 * Phase 13 M4-005 production composition.
 *
 * Every external authority and observation port is deliberately deny-by-default:
 *
 * - `denyAllServicePaymentContractAuthority`: no approved clause/payment-schedule
 *   authority exists, so no payment requirement (including `NOT_REQUIRED`) can be
 *   asserted. The repository still refuses to infer a requirement from free-text
 *   terms.
 * - `denyAllServicePaymentFinanceAuthority`: no approved finance role, evidence
 *   standard, reconciliation procedure or accounting position exists, so nobody
 *   may submit, verify, dispute, refund, reverse, void or correct a payment.
 * - `denyAllServicePaymentEvidenceVerifier`: no bank/provider feed exists, so a
 *   receipt can never become `verified` and an engagement can never read as
 *   `SATISFIED`.
 * - `unsupportedServicePaymentReversalResolver`: no authoritative refund/reversal
 *   observation source exists, so refund/reversal recording fails closed.
 * - `denyAllServicePaymentStatusReadAuthority`: an active M4-002 assignment does
 *   not disclose financial condition, amounts or payment history, so a staff
 *   payment-status read is existence-hidden until a disclosure policy is approved.
 *
 * Test-only synthetic ports are never imported here; `schema-contract.test.ts`
 * asserts that.
 */
export const servicePaymentHandlers = createServicePaymentHandlers({
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
      (await serviceEngagementSchemaAvailable()) &&
      (await servicePaymentSchemaAvailable())
    );
  },
  repository: createServicePaymentRepository({
    statusReadAuthority: denyAllServicePaymentStatusReadAuthority,
  }),
  async rateLimit({ actorUserId, ipAddress, action }) {
    const mutation = [
      "payment_condition_record",
      "payment_evidence_submit",
      "payment_evidence_verify",
      "payment_resolution_record",
    ].includes(action);
    const options = mutation
      ? { maxRequests: 30, ttlSeconds: 60 * 60 }
      : { maxRequests: 120, ttlSeconds: 60 * 60 };
    try {
      await checkIpRateLimitStrict(actorUserId, {
        ...options,
        keyPrefix: `phase13-m4-005-${action}-actor`,
      });
      if (ipAddress) {
        await checkIpRateLimitStrict(ipAddress, {
          maxRequests: options.maxRequests * 2,
          ttlSeconds: options.ttlSeconds,
          keyPrefix: `phase13-m4-005-${action}-ip`,
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
  contractAuthority: denyAllServicePaymentContractAuthority,
  evidenceVerifier: denyAllServicePaymentEvidenceVerifier,
  financeAuthority: denyAllServicePaymentFinanceAuthority,
  reversalResolver: unsupportedServicePaymentReversalResolver,
});
