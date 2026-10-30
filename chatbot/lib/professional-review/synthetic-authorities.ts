import type {
  ManagedTargetIdentity,
  ManagedTargetKind,
} from "@/lib/managed-target/policy";
import type {
  ProfessionalCredentialVerification,
  ProfessionalCredentialVerifier,
  ProfessionalReviewAuthority,
  ProfessionalReviewAuthorityAction,
  ProfessionalReviewAuthorityRequest,
} from "./authority";
import type { ManagedTargetProvider } from "./target-provider";

/**
 * TEST-ONLY synthetic M4-006 ports.
 *
 * Every factory below is marked `synthetic: true` and uses a `synthetic_test_`
 * code prefix so no result can be mistaken for real professional authority,
 * real credential verification or a real package provider. This module must never
 * be imported by `runtime.ts` or any serving path; the offline contract test
 * enforces that.
 *
 * A synthetic approval is evidence that the workflow behaves correctly, never
 * evidence that a qualified lawyer reviewed anything.
 */

export type SyntheticManagedTargetFixture = {
  identity: ManagedTargetIdentity;
};

export function createSyntheticManagedTargetProvider(options: {
  fixtures: readonly SyntheticManagedTargetFixture[];
  mode?: "trusted" | "untrusted" | "unavailable";
}): ManagedTargetProvider & { readonly synthetic: true } {
  const mode = options.mode ?? "trusted";
  return {
    code: "synthetic_test_managed_target_provider",
    provenance: "synthetic_test",
    synthetic: true,
    resolve({ projectId, targetId, targetKind }) {
      if (mode === "unavailable") {
        return { status: "unavailable" };
      }
      if (mode === "untrusted") {
        return {
          status: "untrusted",
          reasonCode: "synthetic_untrusted_source",
        };
      }
      if (
        ![
          "managed_school_application",
          "student_500_visa_application",
        ].includes(targetKind)
      ) {
        return { status: "unsupported_kind", targetKind };
      }
      const fixture = options.fixtures.find(
        (entry) =>
          entry.identity.projectId === projectId &&
          entry.identity.targetId === targetId &&
          entry.identity.targetKind === targetKind
      );
      if (!fixture) {
        return { status: "not_found" };
      }
      return {
        identity: { ...fixture.identity },
        provenance: "synthetic_test",
        resolvedAt: "2026-10-30T00:00:00.000Z",
        status: "resolved",
      };
    },
  };
}

export type SyntheticReviewScope = {
  actions: readonly ProfessionalReviewAuthorityAction[];
  actorUserId: string;
  projectId: string;
  targetId: string;
  targetKind: ManagedTargetKind;
  targetVersion: number;
};

export function createSyntheticProfessionalReviewAuthority(options: {
  scopes: readonly SyntheticReviewScope[];
  mode?: "allowed" | "denied" | "unavailable";
}): ProfessionalReviewAuthority & { readonly synthetic: true } {
  const mode = options.mode ?? "allowed";
  return {
    code: "synthetic_test_professional_review_authority",
    synthetic: true,
    decide(request: ProfessionalReviewAuthorityRequest) {
      if (mode === "unavailable") {
        return { allowed: false, reasonCode: "review_authority_unavailable" };
      }
      if (mode === "denied") {
        return { allowed: false, reasonCode: "review_authority_denied" };
      }
      const scope = options.scopes.find(
        (entry) =>
          entry.actorUserId === request.actorUserId &&
          entry.projectId === request.projectId &&
          entry.targetKind === request.targetKind &&
          entry.targetId === request.targetId &&
          entry.targetVersion === request.targetVersion &&
          entry.actions.includes(request.action)
      );
      if (!scope) {
        return { allowed: false, reasonCode: "review_authority_denied" };
      }
      return {
        allowed: true,
        authorityCode: "synthetic_test_scoped_review_authority",
        policyVersion: "synthetic_test_only",
      };
    },
  };
}

export function createSyntheticProfessionalCredentialVerifier(options: {
  credentialCode?: string;
  mode: "verified" | "unverified" | "unavailable" | "throws";
  verifiedActorUserIds: readonly string[];
}): ProfessionalCredentialVerifier & { readonly synthetic: true } {
  return {
    code: "synthetic_test_professional_credential_verifier",
    synthetic: true,
    verify({ actorUserId }): ProfessionalCredentialVerification {
      if (options.mode === "throws") {
        throw new Error("synthetic credential verifier failure");
      }
      if (options.mode === "unavailable") {
        return {
          status: "unavailable",
          reasonCode: "synthetic_credential_registry_unavailable",
        };
      }
      if (
        options.mode !== "verified" ||
        !options.verifiedActorUserIds.includes(actorUserId)
      ) {
        return {
          status: "unverified",
          reasonCode: "synthetic_credential_missing",
        };
      }
      return {
        credentialCode:
          options.credentialCode ?? "synthetic_test_practising_certificate",
        status: "verified",
        verifiedAt: "2026-10-30T00:00:00.000Z",
      };
    },
  };
}
