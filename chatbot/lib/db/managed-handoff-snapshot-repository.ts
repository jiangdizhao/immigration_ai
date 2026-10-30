// biome-ignore-all lint/suspicious/useAwait: the snapshot loader returns a transaction promise and exposes async-only port
// shapes; some inner reads complete without an explicit await.
import "server-only";

import { and, count, desc, eq, ne } from "drizzle-orm";
import type { ManagedHandoffSnapshot } from "@/lib/managed-handoff/snapshot";
import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import {
  evaluateProfessionalReviewValidity,
  type ProfessionalCredentialObservation,
  type ProfessionalReviewAssignmentObservation,
} from "@/lib/professional-review/policy";
import { evaluateServicePaymentState } from "@/lib/service-payment/policy";
import { loadCurrentProfessionalReviewForTarget } from "./professional-review-repository";
import { getLazyDatabase } from "./runtime-client";
import {
  projectMembership,
  projectResourceDisclosureGrant,
  projectStaffAssignment,
  serviceAgreementAcceptance,
  serviceAgreementVersion,
  serviceEngagement,
  servicePaymentCondition,
  servicePaymentEvidence,
  servicePaymentResolution,
  serviceSignatureEvidence,
  studyJourneyProject,
} from "./schema";

type Database = ReturnType<typeof getLazyDatabase>;

const db = getLazyDatabase();

/**
 * Hard ceiling on frozen-payment history rows for one condition. Above it the
 * snapshot cannot establish currentness completely, so the payment predicate is
 * reported UNKNOWN instead of evaluating a partial view.
 */
export const MANAGED_HANDOFF_PAYMENT_ROW_CAP = 200;

/**
 * Phase 13 M4-007 authoritative read model.
 *
 * Everything the readiness evaluator needs comes from **one** repeatable-read
 * transaction that only issues SELECTs, so the predicates are mutually consistent.
 * Nothing here writes, repairs or normalises authoritative data, and no adapter
 * widens Project, actor or resource scope.
 *
 * If the transaction fails the caller must answer UNKNOWN: a failed read is not
 * evidence that a condition is absent.
 */
export type LoadManagedHandoffSnapshotInput = {
  actorUserId: string;
  projectId: string;
  targetId: string;
  targetKind: ManagedTargetKind;
  /** Authoritative target identity from a trusted provider, when one exists. */
  resolvedTarget: { targetSha256: string; targetVersion: number } | null;
  /** Professional credential observation (production: unavailable). */
  credential: ProfessionalCredentialObservation;
};

export async function loadManagedHandoffSnapshot(
  input: LoadManagedHandoffSnapshotInput,
  options: { database?: Database } = {}
): Promise<ManagedHandoffSnapshot> {
  const database = options.database ?? db;
  return database.transaction(
    async (tx) => {
      const now = new Date();
      const [project] = await tx
        .select()
        .from(studyJourneyProject)
        .where(eq(studyJourneyProject.id, input.projectId))
        .limit(1);

      const projectState: ManagedHandoffSnapshot["project"] = project
        ? {
            revision: project.revision,
            status: project.status as "active" | "closed",
          }
        : { status: "missing" };

      // Membership: ownership is authoritative; otherwise an active membership row.
      let membership: ManagedHandoffSnapshot["membership"] = null;
      if (project) {
        if (project.ownerUserId === input.actorUserId) {
          membership = {
            expiresAt: null,
            membershipId: null,
            status: "owner",
          };
        } else {
          const [member] = await tx
            .select()
            .from(projectMembership)
            .where(
              and(
                eq(projectMembership.projectId, project.id),
                eq(projectMembership.userId, input.actorUserId)
              )
            )
            .limit(1);
          membership = {
            expiresAt: null,
            membershipId: member?.id ?? null,
            status:
              member && member.status === "active"
                ? "member"
                : member && member.status === "revoked"
                  ? "none"
                  : "none",
          };
        }
      }

      // M4-002: the live named-lawyer assignment for this Project.
      const assignments = await tx
        .select()
        .from(projectStaffAssignment)
        .where(eq(projectStaffAssignment.projectId, input.projectId))
        .orderBy(desc(projectStaffAssignment.updatedAt))
        .limit(20);
      const lawyerAssignment = assignments.find(
        (row) =>
          row.purpose === "project_staff_collaboration" &&
          row.assignmentRole === "lawyer"
      );
      const assignmentState: ManagedHandoffSnapshot["assignment"] =
        lawyerAssignment === undefined
          ? { status: "missing" }
          : {
              assignmentId: lawyerAssignment.id,
              assignmentRevision: lawyerAssignment.lastProjectRevision,
              reviewerUserId: lawyerAssignment.staffUserId,
              status:
                lawyerAssignment.status === "active"
                  ? "active"
                  : lawyerAssignment.status === "proposed" ||
                      lawyerAssignment.status === "owner_approved"
                    ? "pending"
                    : "revoked",
            };

      // M4-004: the live engagement, its service mode and accepted scope set.
      const [engagement] = await tx
        .select()
        .from(serviceEngagement)
        .where(
          and(
            eq(serviceEngagement.projectId, input.projectId),
            ne(serviceEngagement.status, "terminated")
          )
        )
        .orderBy(desc(serviceEngagement.createdAt))
        .limit(1);

      const engagementState: ManagedHandoffSnapshot["engagement"] = engagement
        ? {
            engagementId: engagement.id,
            revision: engagement.revision,
            scopeCodes: engagement.scopeCodes,
            serviceMode: engagement.serviceMode,
            status:
              engagement.status === "active"
                ? "current"
                : engagement.status === "suspended"
                  ? "suspended"
                  : "awaiting_customer_action",
          }
        : { status: "missing" };

      // M4-004: the current agreement version and its acceptance.
      let agreementState: ManagedHandoffSnapshot["agreement"] = {
        status: "missing",
      };
      if (engagement?.currentAgreementVersionId) {
        const [version] = await tx
          .select()
          .from(serviceAgreementVersion)
          .where(
            eq(serviceAgreementVersion.id, engagement.currentAgreementVersionId)
          )
          .limit(1);
        const [acceptance] = version
          ? await tx
              .select()
              .from(serviceAgreementAcceptance)
              .where(
                and(
                  eq(serviceAgreementAcceptance.agreementVersionId, version.id),
                  eq(
                    serviceAgreementAcceptance.termsSha256,
                    version.termsSha256
                  )
                )
              )
              .limit(1)
          : [];
        if (version) {
          agreementState = {
            agreementVersionId: version.id,
            revision: version.versionNumber,
            status:
              version.status === "superseded"
                ? "superseded"
                : version.status === "issued" && acceptance
                  ? "accepted"
                  : "not_accepted",
            termsSha256: version.termsSha256,
          };
        }
      }

      // M4-004: signature evidence for exactly that agreement version.
      let signatureState: ManagedHandoffSnapshot["signature"] = {
        status: "missing",
      };
      if (agreementState.status !== "missing") {
        const rows = await tx
          .select()
          .from(serviceSignatureEvidence)
          .where(
            eq(
              serviceSignatureEvidence.agreementVersionId,
              agreementState.agreementVersionId
            )
          )
          .limit(5);
        const verified = rows.find(
          (row) => row.verificationStatus === "verified"
        );
        signatureState = verified
          ? { signatureEvidenceId: verified.id, status: "verified" }
          : rows.length > 0
            ? {
                signatureEvidenceId: rows[0]?.id ?? "unknown",
                status: "unverified",
              }
            : { status: "missing" };
      }

      // M4-004: disclosure of the engagement record to the assigned lawyer.
      let disclosureState: ManagedHandoffSnapshot["disclosure"] = {
        disclosureId: null,
        resourceKey: `engagement:${engagementState.status === "missing" ? "none" : engagementState.engagementId}`,
        status: "missing",
      };
      if (engagement && lawyerAssignment) {
        const [grant] = await tx
          .select()
          .from(projectResourceDisclosureGrant)
          .where(
            and(
              eq(projectResourceDisclosureGrant.projectId, input.projectId),
              eq(
                projectResourceDisclosureGrant.resourceCategory,
                "engagement_record"
              ),
              eq(projectResourceDisclosureGrant.resourceId, engagement.id),
              eq(
                projectResourceDisclosureGrant.purposeCode,
                "service_delivery"
              ),
              eq(
                projectResourceDisclosureGrant.recipientUserId,
                lawyerAssignment.staffUserId
              )
            )
          )
          .orderBy(desc(projectResourceDisclosureGrant.grantedAt))
          .limit(1);
        if (grant) {
          const expired =
            grant.status === "expired" ||
            (grant.expiresAt !== null &&
              grant.expiresAt.getTime() <= now.getTime());
          disclosureState = {
            disclosureId: grant.id,
            resourceKey: `engagement:${grant.resourceId}@${grant.resourceVersion}`,
            status:
              grant.status === "granted" && !expired ? "granted" : "expired",
          };
        }
      }

      // Frozen M4-005: read the current condition, its evidence and resolutions.
      let paymentState: ManagedHandoffSnapshot["payment"] = {
        status: "missing",
      };
      if (engagement) {
        const [condition] = await tx
          .select()
          .from(servicePaymentCondition)
          .where(
            and(
              eq(servicePaymentCondition.projectId, input.projectId),
              eq(servicePaymentCondition.engagementId, engagement.id)
            )
          )
          .orderBy(desc(servicePaymentCondition.createdAt))
          .limit(1);
        if (condition) {
          // Completeness first: a partial history could silently hide an effective
          // reversal. Count, then read every row, or answer UNKNOWN.
          const [counts] = await tx
            .select({
              evidences: count(servicePaymentEvidence.id),
              resolutions: count(servicePaymentResolution.id),
            })
            .from(servicePaymentEvidence)
            .where(eq(servicePaymentEvidence.conditionId, condition.id));
          const [resolutionCounts] = await tx
            .select({ resolutions: count(servicePaymentResolution.id) })
            .from(servicePaymentResolution)
            .where(eq(servicePaymentResolution.conditionId, condition.id));
          const totalRows =
            Number(counts?.evidences ?? 0) +
            Number(resolutionCounts?.resolutions ?? 0);
          if (totalRows > MANAGED_HANDOFF_PAYMENT_ROW_CAP) {
            // Too much history to establish currentness reliably: never assert a
            // positive from a partial view.
            paymentState = {
              conditionId: condition.id,
              contractualBasisCode: null,
              evidenceId: null,
              status: "UNKNOWN",
            };
          } else {
            const evidences = await tx
              .select()
              .from(servicePaymentEvidence)
              .where(eq(servicePaymentEvidence.conditionId, condition.id));
            const resolutions = await tx
              .select()
              .from(servicePaymentResolution)
              .where(eq(servicePaymentResolution.conditionId, condition.id));
            const currentAgreement =
              agreementState.status === "missing" ? null : agreementState;
            const evaluation = evaluateServicePaymentState({
              condition: {
                agreementTermsSha256: condition.agreementTermsSha256,
                agreementVersionId: condition.agreementVersionId,
                amountMinor: condition.amountMinor,
                conditionId: condition.id,
                currency: condition.currency,
                requirement: condition.requirement as
                  | "required"
                  | "not_required"
                  | "unknown",
                supersededAt: condition.supersededAt
                  ? condition.supersededAt.toISOString()
                  : null,
              },
              currentAgreementTermsSha256:
                currentAgreement?.termsSha256 ?? null,
              currentAgreementVersionId:
                currentAgreement?.agreementVersionId ?? null,
              engagementStatus: engagement.status,
              evidences: evidences.map((row) => ({
                amountMinor: row.declaredAmountMinor,
                currency: row.declaredCurrency,
                evidenceId: row.id,
                status: row.verificationStatus as
                  | "pending"
                  | "verified"
                  | "rejected",
                submittedAt: row.submittedAt.toISOString(),
                verifiedAt: row.verifiedAt
                  ? row.verifiedAt.toISOString()
                  : null,
              })),
              resolutions: resolutions.map((row) => ({
                evidenceId: row.evidenceId,
                kind: row.resolutionKind as
                  | "dispute"
                  | "refund"
                  | "reversal"
                  | "void"
                  | "correction",
                resolutionId: row.id,
                resolvedAt: row.resolvedAt.toISOString(),
                supersedesResolutionId: row.supersedesResolutionId,
              })),
            });
            paymentState = {
              conditionId: evaluation.conditionId,
              contractualBasisCode: condition.contractualBasisCode,
              evidenceId: evaluation.effectiveEvidenceId,
              status: evaluation.status,
            };
          }
        }
      }

      // M4-006: current persisted review, read inside this same snapshot
      // transaction. Taking a second connection from the outer pool here would
      // evaluate the review against a different MVCC snapshot.
      const reviewRecord = await loadCurrentProfessionalReviewForTarget(tx, {
        projectId: input.projectId,
        targetId: input.targetId,
        targetKind: input.targetKind,
      });
      const assignmentObservation: ProfessionalReviewAssignmentObservation =
        assignmentState.status === "missing"
          ? { status: "missing" }
          : assignmentState.status === "active"
            ? {
                reviewerUserId: assignmentState.reviewerUserId,
                status: "active",
              }
            : { status: "revoked" };
      const reviewValidity = evaluateProfessionalReviewValidity({
        assignment: assignmentObservation,
        credential: input.credential,
        currentTarget: input.resolvedTarget,
        providerTrustsTarget: input.resolvedTarget !== null,
        record: reviewRecord,
      });

      // Revision re-read inside the same snapshot for concurrency detection.
      const [projectAfter] = await tx
        .select({ revision: studyJourneyProject.revision })
        .from(studyJourneyProject)
        .where(eq(studyJourneyProject.id, input.projectId))
        .limit(1);
      const [engagementAfter] = engagement
        ? await tx
            .select({ revision: serviceEngagement.revision })
            .from(serviceEngagement)
            .where(eq(serviceEngagement.id, engagement.id))
            .limit(1)
        : [];

      return {
        actorUserId: input.actorUserId,
        agreement: agreementState,
        assignment: assignmentState,
        disclosure: disclosureState,
        engagement: engagementState,
        engagementRevisionAfter: engagementAfter?.revision ?? null,
        loadedAt: now.toISOString(),
        membership,
        payment: paymentState,
        project: projectState,
        projectId: input.projectId,
        projectRevisionAfter: projectAfter?.revision ?? null,
        review: { validity: reviewValidity },
        signature: signatureState,
        targetId: input.targetId,
        targetKind: input.targetKind,
      } satisfies ManagedHandoffSnapshot;
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
}
