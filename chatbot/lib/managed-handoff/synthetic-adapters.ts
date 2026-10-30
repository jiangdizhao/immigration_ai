// biome-ignore-all lint/suspicious/useAwait: this file implements asynchronous M4-006/M4-007
// ports with deterministic in-memory test data, so there is nothing to await.
import type { ManagedTargetIdentity } from "@/lib/managed-target/policy";
import {
  evaluateProfessionalReviewValidity,
  type ProfessionalCredentialObservation,
  type ProfessionalReviewRecord,
  type ProfessionalReviewValidity,
} from "@/lib/professional-review/policy";
import { createSyntheticManagedTargetProvider } from "@/lib/professional-review/synthetic-authorities";
import { managedHandoffRequiredScope } from "./policy";
import type { ManagedHandoffPorts } from "./ports";

/**
 * TEST-ONLY synthetic M4-007 adapters.
 *
 * A synthetic READY proves the composition and the fail-closed rules. It is NOT
 * evidence of a real engagement, real signature, real qualification, real payment
 * or production readiness, and the resulting `evidenceProvenance` is always
 * `synthetic_test`. This module must never be imported by `runtime.ts`.
 */
export type SyntheticReviewMode =
  | "approved"
  | "missing"
  | "not_approved"
  | "target_changed"
  | "credential_unverified"
  | "credential_unavailable"
  | "authority_revoked"
  | "unavailable";

export type SyntheticManagedHandoffFixture = {
  actorUserId: string;
  projectId: string;
  targetKind: "managed_school_application" | "student_500_visa_application";
  targetId: string;
  targetVersion: number;
  targetSha256: string;
  reviewMode?: SyntheticReviewMode;
  reviewRevision?: number;
  reviewerUserId?: string;
  payment?:
    | "not_required"
    | "satisfied"
    | "required_unsatisfied"
    | "evidence_pending"
    | "disputed"
    | "reversed"
    | "void"
    | "missing"
    | "unavailable";
  signature?:
    | "verified"
    | "unverified"
    | "missing"
    | "untrusted"
    | "unavailable";
  disclosure?: "granted" | "missing" | "expired" | "unavailable";
  assignment?: "active" | "pending" | "revoked" | "missing" | "unavailable";
  engagement?:
    | "current"
    | "superseded"
    | "missing"
    | "unavailable"
    | "scope_mismatch"
    | "self_service";
  confirmation?:
    | "not_required"
    | "required_and_confirmed"
    | "required_not_confirmed"
    | "policy_unknown"
    | "unavailable";
  agreement?:
    | "accepted"
    | "not_accepted"
    | "superseded"
    | "missing"
    | "unavailable";
  membership?: "owner" | "member" | "none" | "expired" | "unavailable";
  project?: "active" | "closed" | "unavailable";
  /** Simulates a revocation committed between the snapshot and the decision. */
  concurrentRevisionChange?: boolean;
};

export function syntheticManagedTargetIdentity(
  fixture: SyntheticManagedHandoffFixture
): ManagedTargetIdentity {
  return {
    projectId: fixture.projectId,
    targetId: fixture.targetId,
    targetKind: fixture.targetKind,
    targetSha256: fixture.targetSha256,
    targetVersion: fixture.targetVersion,
  };
}

export function createSyntheticManagedHandoffPorts(
  fixture: SyntheticManagedHandoffFixture,
  now: () => Date = () => new Date("2026-10-30T00:00:00.000Z")
): ManagedHandoffPorts & { synthetic: true } {
  const identity = syntheticManagedTargetIdentity(fixture);
  const targetProvider = createSyntheticManagedTargetProvider({
    fixtures: [{ identity }],
  });
  const reviewMode = fixture.reviewMode ?? "approved";
  const requiredScope = managedHandoffRequiredScope(fixture.targetKind);
  const reviewerUserId = fixture.reviewerUserId ?? "synthetic-reviewer";
  let projectReads = 0;

  const record: ProfessionalReviewRecord | null =
    reviewMode === "approved" ||
    reviewMode === "target_changed" ||
    reviewMode === "not_approved" ||
    reviewMode === "credential_unverified" ||
    reviewMode === "credential_unavailable" ||
    reviewMode === "authority_revoked"
      ? {
          decision: {
            action: "approve",
            authorityCode: "synthetic_test_scoped_review_authority",
            boundTargetSha256:
              reviewMode === "target_changed"
                ? "b".repeat(64)
                : identity.targetSha256,
            boundTargetVersion:
              reviewMode === "target_changed"
                ? identity.targetVersion
                : identity.targetVersion,
            commentSha256: null,
            credentialCode: "synthetic_test_practising_certificate",
            decidedAt: "2026-10-29T00:00:00.000Z",
            decidedByUserId: reviewerUserId,
            reasonCode: null,
            revision: 3,
          },
          operationId: "synthetic-review-approve",
          projectId: identity.projectId,
          requestSha256: "c".repeat(64),
          requestedAt: "2026-10-28T00:00:00.000Z",
          requestedByUserId: reviewerUserId,
          reviewPurpose: "managed_handoff_authorization",
          reviewRequestId: "11111111-1111-4111-8111-111111111111",
          reviewScope: ["eligibility_review"],
          reviewerUserId,
          revision: fixture.reviewRevision ?? 3,
          state: reviewMode === "not_approved" ? "in_review" : "approved",
          target: identity,
          targetBindingSha256: "d".repeat(64),
        }
      : null;

  const credential: ProfessionalCredentialObservation =
    reviewMode === "credential_unavailable"
      ? "unavailable"
      : reviewMode === "credential_unverified"
        ? { status: "unverified" }
        : {
            credentialCode: "synthetic_test_practising_certificate",
            status: "verified",
          };

  const assignmentMode = fixture.assignment ?? "active";
  const assignmentObservation =
    reviewMode === "authority_revoked"
      ? ({ status: "revoked" } as const)
      : assignmentMode === "unavailable"
        ? ("unavailable" as const)
        : assignmentMode === "active"
          ? ({ reviewerUserId, status: "active" } as const)
          : ({ status: assignmentMode } as const);

  return {
    agreement: {
      load: () => {
        const mode = fixture.agreement ?? "accepted";
        if (mode === "unavailable") {
          return "unavailable";
        }
        if (
          mode === "missing" ||
          mode === "not_accepted" ||
          mode === "superseded"
        ) {
          return {
            agreementVersionId: "22222222-2222-4222-8222-222222222222",
            revision: 1,
            status: mode,
            termsSha256: "e".repeat(64),
          };
        }
        return {
          agreementVersionId: "22222222-2222-4222-8222-222222222222",
          revision: 2,
          status: "accepted",
          termsSha256: "e".repeat(64),
        };
      },
    },
    assignment: {
      load: () =>
        assignmentMode === "unavailable"
          ? "unavailable"
          : {
              assignmentId: "77777777-7777-4777-8777-777777777777",
              assignmentRevision: 1,
              reviewerUserId,
              status: assignmentMode,
            },
    },
    disclosure: {
      load: () => {
        const mode = fixture.disclosure ?? "granted";
        if (mode === "unavailable") {
          return "unavailable";
        }
        return {
          disclosureId: "88888888-8888-4888-8888-888888888888",
          resourceKey: `synthetic:${fixture.targetKind}`,
          status: mode,
        };
      },
    },
    engagement: {
      load: () => {
        const mode = fixture.engagement ?? "current";
        if (mode === "unavailable") {
          return "unavailable";
        }
        if (mode === "missing" || mode === "superseded") {
          return {
            engagementId: null,
            revision: 1,
            scopeCodes: [],
            serviceMode: null,
            status: mode,
          };
        }
        return {
          engagementId: "33333333-3333-4333-8333-333333333333",
          revision: 4,
          scopeCodes:
            mode === "scope_mismatch"
              ? ["synthetic_other_scope"]
              : [requiredScope ?? "synthetic_other_scope"],
          serviceMode: mode === "self_service" ? "self_service" : "managed",
          status: "current",
        };
      },
    },
    membership: {
      load: () => {
        const mode = fixture.membership ?? "owner";
        if (mode === "unavailable") {
          return "unavailable";
        }
        return {
          expiresAt: mode === "expired" ? "2020-01-01T00:00:00.000Z" : null,
          membershipId: "66666666-6666-4666-8666-666666666666",
          status: mode === "expired" ? "owner" : mode,
        };
      },
    },
    now,
    payment: {
      load: () => {
        const mode = fixture.payment ?? "satisfied";
        if (mode === "unavailable") {
          return "unavailable";
        }
        if (mode === "missing") {
          return { status: "missing" };
        }
        if (mode === "not_required") {
          return {
            conditionId: "44444444-4444-4444-8444-444444444444",
            contractualBasisCode: "no_advance_service_fee",
            contractualBasisRef: "synthetic:clause:4.2",
            status: "not_required",
          };
        }
        if (mode === "satisfied") {
          return {
            conditionId: "44444444-4444-4444-8444-444444444444",
            evidenceId: "55555555-5555-4555-8555-555555555555",
            status: "satisfied",
          };
        }
        return {
          conditionId: "44444444-4444-4444-8444-444444444444",
          status: mode,
        };
      },
    },
    project: {
      load: () => {
        const mode = fixture.project ?? "active";
        if (mode === "unavailable") {
          return "unavailable";
        }
        projectReads += 1;
        const revision =
          fixture.concurrentRevisionChange && projectReads > 1 ? 9 : 8;
        return { revision, status: mode };
      },
    },
    confirmation: {
      load: () => {
        const mode = fixture.confirmation ?? "not_required";
        if (mode === "unavailable") {
          return "unavailable";
        }
        if (mode === "policy_unknown") {
          return { status: "policy_unknown" };
        }
        if (mode === "required_not_confirmed") {
          return {
            policyCode: "synthetic_requires_confirmation",
            status: mode,
          };
        }
        if (mode === "required_and_confirmed") {
          return {
            confirmationRef: "synthetic-confirmation-1",
            policyCode: "synthetic_requires_confirmation",
            status: mode,
          };
        }
        return {
          policyCode: "synthetic_no_confirmation_required",
          status: "not_required",
        };
      },
    },
    review: {
      evaluate: async (): Promise<ProfessionalReviewValidity> => {
        if (reviewMode === "unavailable") {
          return {
            reasonCode: "review_state_unavailable",
            reviewRequestId: null,
            status: "unknown",
          };
        }
        return evaluateProfessionalReviewValidity({
          assignment: assignmentObservation,
          credential,
          // A synthetic "target_changed" review was approved for a different hash.
          currentTarget: identity,
          providerTrustsTarget: true,
          record,
        });
      },
    },
    signature: {
      load: () => {
        const mode = fixture.signature ?? "verified";
        if (mode === "unavailable") {
          return "unavailable";
        }
        return {
          authorityCode: "synthetic_test_signature_authority",
          authorityTrusted: mode !== "untrusted",
          status: mode === "untrusted" ? "verified" : mode,
        };
      },
    },
    synthetic: true,
    targetProvider,
  };
}
