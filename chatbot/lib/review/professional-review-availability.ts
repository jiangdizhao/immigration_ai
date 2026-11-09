import {
  MANAGED_TARGET_KINDS,
  MANAGED_TARGET_PURPOSES,
} from "@/lib/managed-target/policy";
import {
  DENY_ALL_PROFESSIONAL_REVIEW_AUTHORITY_CODE,
  UNAVAILABLE_PROFESSIONAL_CREDENTIAL_VERIFIER_CODE,
} from "@/lib/professional-review/authority";
import { isProfessionalReviewEnabled } from "@/lib/professional-review/policy";
import { UNAVAILABLE_MANAGED_TARGET_PROVIDER_CODE } from "@/lib/professional-review/target-provider";
import type { ReviewProfessionalAvailability } from "./review-summary";

/**
 * Phase 13 M9-B — honest availability of the M4-006 exact-version review workflow.
 *
 * The M4-006 composition is deliberately fail-closed (deny-all authority, no credential
 * registry, no managed-target provider, default-OFF flag). This module reads **only**
 * the composition's static policy identifiers — never an environment value the operator
 * can spoof from a request — and turns them into the exact reason the review surface
 * must show.
 *
 * It reports; it never authorizes. When any required port is fail-closed the state is
 * `unavailable`, so no customer or staff actor can be offered a request button that the
 * backend would refuse.
 */
export function describeProfessionalReviewAvailability(input: {
  enabled: boolean;
  authorityCode: string;
  credentialVerifierCode: string;
  targetProviderCode: string;
}): ReviewProfessionalAvailability {
  const base = {
    authorityCode: input.authorityCode,
    credentialVerifierCode: input.credentialVerifierCode,
    purpose: MANAGED_TARGET_PURPOSES[0],
    supportedTargetKinds: [...MANAGED_TARGET_KINDS],
    targetProviderCode: input.targetProviderCode,
  } as const;
  if (!input.enabled) {
    return {
      ...base,
      reasonCode: "professional_review_disabled",
      state: "disabled",
    };
  }
  if (input.authorityCode === DENY_ALL_PROFESSIONAL_REVIEW_AUTHORITY_CODE) {
    return {
      ...base,
      reasonCode: "professional_authority_unavailable",
      state: "unavailable",
    };
  }
  if (
    input.credentialVerifierCode ===
    UNAVAILABLE_PROFESSIONAL_CREDENTIAL_VERIFIER_CODE
  ) {
    return {
      ...base,
      reasonCode: "professional_credential_registry_unavailable",
      state: "unavailable",
    };
  }
  if (input.targetProviderCode === UNAVAILABLE_MANAGED_TARGET_PROVIDER_CODE) {
    return {
      ...base,
      reasonCode: "managed_target_provider_unavailable",
      state: "unavailable",
    };
  }
  return { ...base, reasonCode: null, state: "available" };
}

/**
 * Reads the current production composition. `PHASE13_PROFESSIONAL_REVIEW_ENABLED` is the
 * only operator-controlled input, and it can only ever *hide* the surface.
 */
export function professionalReviewAvailabilityFromRuntime(input: {
  authorityCode: string;
  credentialVerifierCode: string;
  targetProviderCode: string;
  enabled?: boolean;
}): ReviewProfessionalAvailability {
  return describeProfessionalReviewAvailability({
    authorityCode: input.authorityCode,
    credentialVerifierCode: input.credentialVerifierCode,
    enabled: input.enabled ?? isProfessionalReviewEnabled(),
    targetProviderCode: input.targetProviderCode,
  });
}

/**
 * No exact-version AI checker is integrated for any artifact kind: M2 document
 * processing is closed, and M5/M6/M8 artifacts have no checker. Reporting
 * `unsupported` is the truthful answer, and it must never be rendered as "passed".
 */
export const AI_CHECK_AVAILABILITY = "unsupported" as const;
