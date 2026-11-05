import "server-only";

import { auth } from "@/app/(auth)/auth";
import { loadManagedHandoffSnapshot } from "@/lib/db/managed-handoff-snapshot-repository";
import { submissionAuthorizationSchemaAvailable } from "@/lib/db/submission-authorization-schema-availability";
import { evaluateManagedHandoffReadiness } from "@/lib/managed-handoff/evaluator";
import type { ManagedHandoffResult } from "@/lib/managed-handoff/policy";
import { managedHandoffPortsFromSnapshot } from "@/lib/managed-handoff/snapshot";
import { unavailableProfessionalCredentialVerifier } from "@/lib/professional-review/authority";
import type { ProfessionalCredentialObservation } from "@/lib/professional-review/policy";
import { projectChatWritesEnabled } from "@/lib/projects/chat-policy";
import { submissionPackageService } from "@/lib/submission-packages/runtime";
import { submissionAuthorizationEnabled } from "./contracts";
import { createSubmissionAuthorizationHandlers } from "./http";
import {
  unavailableExternalVerifier,
  unavailableHandoffAuthority,
} from "./ports";
import { createPostgresSubmissionAuthorizationStore } from "./postgres-repository";
import {
  AUTHORIZATION_REQUIRED_CONFIRMATIONS,
  createSubmissionAuthorizationService,
} from "./service";
import {
  createPrefetchedTargetProvider,
  observeM8PackageTarget,
} from "./targets";

/**
 * Phase 13 M8.2 runtime wiring.
 *
 * Three authorities are reused rather than rebuilt:
 *
 *   - M8.1 `submissionPackageService` is the only source of exact package identity,
 *     confirmations and freshness;
 *   - M4-007 `evaluateManagedHandoffReadiness` is the only readiness evaluator, now
 *     fed a trusted target identity from the M8.1 package;
 *   - M8.1 confirmations, when both are current and finalized, satisfy M4's
 *     customer-confirmation predicate - an M8.1 confirmation is not by itself
 *     submission authorization, but it is the approved evidence M4 was missing.
 *
 * Two authorities remain deliberately unavailable, so production can never claim
 * more than it can prove:
 *
 *   - no approved staff-handoff authority policy, so no handoff can be accepted;
 *   - no approved external verifier, so no external record can be `verified`.
 *
 * `PHASE13_SUBMISSION_AUTHORIZATION_ENABLED` defaults OFF and the schema probe fails
 * closed until migration 0052 is applied.
 */

const store = createPostgresSubmissionAuthorizationStore();

function credentialObservation(input: {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly targetId: string;
  readonly targetKind: string;
}): ProfessionalCredentialObservation {
  const verification = unavailableProfessionalCredentialVerifier.verify({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    targetId: input.targetId,
    targetKind: input.targetKind,
  });
  if (verification.status === "verified") {
    return { credentialCode: verification.credentialCode, status: "verified" };
  }
  return "unavailable";
}

async function readExactPackage(input: {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly targetKind:
    | "managed_school_application"
    | "student_500_visa_application";
  readonly targetId: string;
}) {
  try {
    const view = await submissionPackageService.get(input);
    return {
      currentPackageVersionId: view.currentPackage?.packageVersionId ?? null,
      packages: view.packages.map((entry) => ({
        confirmations: entry.confirmations.map((confirmation) => ({
          confirmationId: confirmation.confirmationId,
          confirmationType: confirmation.confirmationType,
          current: confirmation.current,
          finalized: confirmation.finalized,
          invalidatedReasonCodes: confirmation.invalidatedReasonCodes,
          manifestSha256: confirmation.manifestSha256,
          packageVersion: confirmation.packageVersion,
          packageVersionId: confirmation.packageVersionId,
        })),
        freshness: entry.freshness,
        integrityVerified: entry.integrityVerified,
        manifestSha256: entry.manifestSha256,
        packageVersionId: entry.packageVersionId,
        targetVersion: entry.targetVersion,
        version: entry.version,
      })),
    };
  } catch {
    // An unreadable package state is `unknown`, never "no package".
    return null;
  }
}

async function readManagedReadiness(input: {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly targetKind:
    | "managed_school_application"
    | "student_500_visa_application";
  readonly targetId: string;
  readonly targetVersion: number;
  readonly targetSha256: string;
}): Promise<ManagedHandoffResult | "unavailable"> {
  try {
    const exact = await readExactPackage(input);
    const observation = observeM8PackageTarget({
      currentPackageVersionId: exact?.currentPackageVersionId ?? null,
      packages: exact?.packages ?? [],
      projectId: input.projectId,
      targetId: input.targetId,
      targetKind: input.targetKind,
    });
    const current =
      exact?.packages.find(
        (entry) => entry.packageVersionId === exact.currentPackageVersionId
      ) ?? null;
    const requiredCurrent = AUTHORIZATION_REQUIRED_CONFIRMATIONS.every((type) =>
      (current?.confirmations ?? []).some(
        (confirmation) =>
          confirmation.confirmationType === type &&
          confirmation.current &&
          confirmation.finalized
      )
    );
    const contentConfirmation = (current?.confirmations ?? []).find(
      (confirmation) =>
        confirmation.confirmationType === "package_content_review" &&
        confirmation.current
    );
    const confirmation =
      exact === null
        ? ("unavailable" as const)
        : requiredCurrent && contentConfirmation !== undefined
          ? {
              confirmationRef: contentConfirmation.confirmationId,
              policyCode: "phase13.m8.1.customer-confirmation.v1",
              status: "required_and_confirmed" as const,
            }
          : {
              policyCode: "phase13.m8.1.customer-confirmation.v1",
              status: "required_not_confirmed" as const,
            };
    const snapshot = await loadManagedHandoffSnapshot({
      actorUserId: input.actorUserId,
      credential: credentialObservation(input),
      projectId: input.projectId,
      // The M8.1 package is the trusted target. A stale or tampered package resolves
      // nothing, so M4 itself reports the target problem instead of accepting it.
      resolvedTarget:
        observation.status === "resolved"
          ? {
              targetSha256: observation.identity.targetSha256,
              targetVersion: observation.identity.targetVersion,
            }
          : null,
      targetId: input.targetId,
      targetKind: input.targetKind,
    });
    return await evaluateManagedHandoffReadiness(
      {
        actorUserId: input.actorUserId,
        messagingConsentPresent: false,
        projectId: input.projectId,
        target: { targetId: input.targetId, targetKind: input.targetKind },
        vipEntitlementActive: false,
      },
      managedHandoffPortsFromSnapshot(snapshot, {
        policy: {
          confirmation,
          paymentValidity: "untrusted",
          signatureAuthority: "unapproved",
        },
        targetProvider: createPrefetchedTargetProvider(observation),
      })
    );
  } catch {
    return "unavailable";
  }
}

export const submissionAuthorizationService =
  createSubmissionAuthorizationService({
    externalVerifier: unavailableExternalVerifier,
    handoffAuthority: unavailableHandoffAuthority,
    readExactPackage,
    readManagedReadiness,
    store,
  });

export const submissionAuthorizationHandlers =
  createSubmissionAuthorizationHandlers({
    async authenticate() {
      const session = await auth();
      if (!session?.user?.id) {
        return null;
      }
      return { type: session.user.type, userId: session.user.id };
    },
    enabled: () => submissionAuthorizationEnabled(),
    projectWritesEnabled: projectChatWritesEnabled,
    schemaAvailable: submissionAuthorizationSchemaAvailable,
    service: submissionAuthorizationService,
  });
