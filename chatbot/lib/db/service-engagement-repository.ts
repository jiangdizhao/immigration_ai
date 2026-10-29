import "server-only";

import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { hashStaffEmail } from "@/lib/project-staff-assignments/policy";
import type { ServiceOperatorAuthorityRequest } from "@/lib/service-engagement/authority";
import type {
  ProjectResourceDisclosureAssignment,
  ProjectResourceDisclosureGrantSnapshot,
  ProjectResourceDisclosureRevalidator,
  ProjectResourceSnapshot,
} from "@/lib/service-engagement/disclosure";
import { ServiceEngagementError } from "@/lib/service-engagement/errors";
import {
  buildServiceSignaturePayload,
  canonicalScopeCodes,
  DISCLOSURE_REVOCATION_REASON_CODES,
  hashServiceOperatorAuthorityRequest,
  hashServiceResourceObservation,
  hashServiceSignaturePayload,
  isNonGuestServiceAccount,
  PROJECT_RESOURCE_DISCLOSURE_NOTICE_SHA256,
  PROJECT_RESOURCE_DISCLOSURE_NOTICE_VERSION,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_SHA256,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
  SERVICE_ENGAGEMENT_OWNER_METADATA_POLICY,
  SERVICE_GUEST_EMAIL_SQL_REGEX,
  SERVICE_SIGNATURE_DECLARED_TIME_FUTURE_SKEW_MS,
  type ServiceAgreementVersionStatus,
  type ServiceEngagementLifecycleAction,
  type ServiceEngagementMetadataPolicy,
  type ServiceEngagementMode,
  type ServiceEngagementScopeCode,
  type ServiceEngagementStatus,
  type ServiceOperatorAction,
  type ServiceOperatorAssignmentStatus,
  type ServiceOperatorAuthorityRequestInput,
  type ServiceSignatureVerificationStatus,
  serviceActivationRequiresVerifiedSignature,
  serviceAgreementTermsWriteMatches,
  serviceEngagementMetadataAuthorized,
  serviceEngagementTransitionAllowed,
  serviceLifecycleSourceStatuses,
  serviceLifecycleTargetStatus,
} from "@/lib/service-engagement/policy";
import {
  SERVICE_SIGNATURE_VERIFICATION_METHODS,
  type ServiceSignatureVerificationOutcome,
} from "@/lib/service-engagement/signature";

import { getLazyDatabase } from "./runtime-client";
import {
  type ProjectEvent,
  projectEvent,
  projectMembership,
  projectOperation,
  projectResourceDisclosureGrant,
  projectStaffAssignment,
  serviceAgreementAcceptance,
  serviceAgreementVersion,
  serviceEngagement,
  serviceSignatureEvidence,
  studyJourneyProject,
  user,
} from "./schema";

const db = getLazyDatabase();
type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type Account = {
  id: string;
  email: string;
  role: "user" | "lawyer" | "admin";
  emailVerifiedAt: Date | null;
};
type ProjectRow = typeof studyJourneyProject.$inferSelect;
type EngagementRow = typeof serviceEngagement.$inferSelect;
type AgreementRow = typeof serviceAgreementVersion.$inferSelect;
type AcceptanceRow = typeof serviceAgreementAcceptance.$inferSelect;
type EvidenceRow = typeof serviceSignatureEvidence.$inferSelect;
type GrantRow = typeof projectResourceDisclosureGrant.$inferSelect;
type AssignmentRow = typeof projectStaffAssignment.$inferSelect;

type OperationType =
  | "service_engagement_create"
  | "service_engagement_agreement_draft"
  | "service_engagement_agreement_issue"
  | "service_engagement_agreement_accept"
  | "service_engagement_signature_submit"
  | "service_engagement_signature_verify"
  | "service_engagement_activate"
  | "service_engagement_suspend"
  | "service_engagement_resume"
  | "service_engagement_terminate"
  | "project_resource_disclosure_grant_create"
  | "project_resource_disclosure_grant_revoke";

type ResultKind =
  | "service_engagement"
  | "service_agreement_version"
  | "service_agreement_acceptance"
  | "service_signature_evidence"
  | "project_resource_disclosure_grant";

function notFound(): never {
  throw new ServiceEngagementError("not_found");
}

function currentAccount(account: Account | undefined): account is Account {
  return Boolean(account && isNonGuestServiceAccount(account.email));
}

function isProjectOwner(account: Account | undefined, project: ProjectRow) {
  return Boolean(
    currentAccount(account) &&
      account.role === "user" &&
      account.id === project.ownerUserId
  );
}

function isEligibleStaff(account: Account | undefined): account is Account {
  return Boolean(
    currentAccount(account) &&
      account.role === "lawyer" &&
      account.emailVerifiedAt
  );
}

/**
 * R1-04: server-derived operator eligibility.
 *
 * A global `lawyer`/`admin` account role authorizes nothing by itself. An
 * operator must be a currently eligible verified lawyer account *and* hold an
 * active M4-002 staff assignment for this exact Project. `admin` accounts are
 * deliberately not operator-eligible in this slice: there is no approved
 * oversight/delegation policy, and inventing one would be an unauthorized
 * authorization path.
 */
type OperatorEligibility = {
  account: Account | undefined;
  assignment: AssignmentRow | null;
  eligible: boolean;
};

async function loadOperatorEligibility(
  tx: Transaction,
  projectId: string,
  account: Account | undefined
): Promise<OperatorEligibility> {
  if (!isEligibleStaff(account)) {
    return { account, assignment: null, eligible: false };
  }
  const assignment = await activeStaffAssignment(
    tx,
    projectId,
    account.id,
    account
  );
  return { account, assignment, eligible: Boolean(assignment) };
}

/**
 * Canonical authority request for the exact persisted target. The HTTP layer
 * asks the authority port about this request; the mutation re-derives the same
 * hash from the rows it locked and refuses any mismatch.
 */
function buildOperatorAuthorityInput(input: {
  action: ServiceOperatorAction;
  project: ProjectRow;
  engagement: EngagementRow;
  agreement: AgreementRow | null;
  evidence: EvidenceRow | null;
  operator: OperatorEligibility;
  draft: {
    /** R2-02: the pre-generated draft id is part of the authorized identity. */
    agreementVersionId: string;
    serviceMode: ServiceEngagementMode;
    scopeCodes: readonly ServiceEngagementScopeCode[];
    termsSha256: string;
  } | null;
}): ServiceOperatorAuthorityRequestInput {
  const account = input.operator.account;
  const agreement = input.agreement;
  const evidence = input.evidence;
  return {
    action: input.action,
    projectId: input.project.id,
    engagementId: input.engagement.id,
    serviceMode: agreement
      ? (input.engagement.serviceMode as ServiceEngagementMode)
      : (input.draft?.serviceMode ??
        (input.engagement.serviceMode as ServiceEngagementMode)),
    scopeCodes: agreement
      ? (agreement.scopeCodes as ServiceEngagementScopeCode[])
      : (input.draft?.scopeCodes ?? []),
    engagementStatus: input.engagement.status,
    // R2-02: for `author_draft` this is the exact draft that will be inserted,
    // so an approval for draft A can never authorize draft B.
    agreementVersionId:
      agreement?.id ?? input.draft?.agreementVersionId ?? null,
    agreementVersionStatus: agreement?.status ?? (input.draft ? "draft" : null),
    // `author_draft` targets a version whose number is assigned at insert time.
    versionNumber: agreement?.versionNumber ?? null,
    termsSha256: agreement?.termsSha256 ?? input.draft?.termsSha256 ?? null,
    evidenceId: evidence?.id ?? null,
    evidenceVerificationStatus: evidence?.verificationStatus ?? null,
    signerUserId: evidence?.signerUserId ?? null,
    operatorUserId: account?.id ?? "",
    operatorRole: account?.role ?? "user",
    operatorEmailVerified: Boolean(account?.emailVerifiedAt),
    operatorAssignmentId: input.operator.assignment?.id ?? null,
    operatorAssignmentStatus:
      (input.operator.assignment?.status as
        | ServiceOperatorAssignmentStatus
        | undefined) ?? null,
    operatorEligible: input.operator.eligible,
  };
}

function assertOperatorAuthorityBinding(input: {
  expectedSha256: string;
  action: ServiceOperatorAction;
  project: ProjectRow;
  engagement: EngagementRow;
  agreement: AgreementRow | null;
  evidence: EvidenceRow | null;
  operator: OperatorEligibility;
  draft: {
    /** R2-02: the pre-generated draft id is part of the authorized identity. */
    agreementVersionId: string;
    serviceMode: ServiceEngagementMode;
    scopeCodes: readonly ServiceEngagementScopeCode[];
    termsSha256: string;
  } | null;
}) {
  if (!input.operator.eligible) {
    // No current active M4-002 assignment: no operator authority exists.
    throw new ServiceEngagementError("forbidden");
  }
  const actual = operatorAuthorityRequest(input).requestSha256;
  if (actual !== input.expectedSha256) {
    // The authority decision was made about a different Project, engagement,
    // agreement version, terms hash, action or operator state.
    throw new ServiceEngagementError("integrity_conflict");
  }
}

/**
 * The exact authority request (including its canonical hash) for a loaded
 * target. The HTTP layer passes it to the authority port; mutations recompute it.
 */
function operatorAuthorityRequest(input: {
  action: ServiceOperatorAction;
  project: ProjectRow;
  engagement: EngagementRow;
  agreement: AgreementRow | null;
  evidence: EvidenceRow | null;
  operator: OperatorEligibility;
  draft: {
    /** R2-02: the pre-generated draft id is part of the authorized identity. */
    agreementVersionId: string;
    serviceMode: ServiceEngagementMode;
    scopeCodes: readonly ServiceEngagementScopeCode[];
    termsSha256: string;
  } | null;
}): ServiceOperatorAuthorityRequest {
  const base = buildOperatorAuthorityInput(input);
  return {
    ...base,
    actorUserId: base.operatorUserId,
    requestSha256: hashServiceOperatorAuthorityRequest(base),
  };
}

async function lockProject(tx: Transaction, projectId: string) {
  const [project] = await tx
    .select()
    .from(studyJourneyProject)
    .where(eq(studyJourneyProject.id, projectId))
    .for("update")
    .limit(1);
  if (!project) {
    notFound();
  }
  return project;
}

async function lockAccounts(tx: Transaction, ids: readonly string[]) {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) {
    return new Map<string, Account>();
  }
  const firstId = unique[0] ?? "";
  const accounts = await tx
    .select({
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
    })
    .from(user)
    .where(
      unique.length === 1 ? eq(user.id, firstId) : inArray(user.id, unique)
    )
    .orderBy(asc(user.id))
    .for("no key update");
  return new Map(accounts.map((account) => [account.id, account]));
}

async function claimOperation(
  tx: Transaction,
  input: {
    actorUserId: string;
    operationId: string;
    operationType: OperationType;
    requestHash: string;
    resultId: string;
    resultKind: ResultKind;
  }
) {
  const [inserted] = await tx
    .insert(projectOperation)
    .values({
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: input.operationType,
      requestHash: input.requestHash,
      resultId: input.resultId,
      resultKind: input.resultKind,
    })
    .onConflictDoNothing({
      target: [
        projectOperation.actorUserId,
        projectOperation.operationType,
        projectOperation.operationId,
      ],
    })
    .returning({
      id: projectOperation.id,
      resultId: projectOperation.resultId,
      resultKind: projectOperation.resultKind,
      requestHash: projectOperation.requestHash,
    });
  if (inserted) {
    return { ...inserted, replayed: false };
  }
  const [existing] = await tx
    .select({
      id: projectOperation.id,
      resultId: projectOperation.resultId,
      resultKind: projectOperation.resultKind,
      requestHash: projectOperation.requestHash,
    })
    .from(projectOperation)
    .where(
      and(
        eq(projectOperation.actorUserId, input.actorUserId),
        eq(projectOperation.operationType, input.operationType),
        eq(projectOperation.operationId, input.operationId)
      )
    )
    .for("update")
    .limit(1);
  if (!existing || existing.requestHash !== input.requestHash) {
    throw new ServiceEngagementError("idempotency_conflict");
  }
  if (existing.resultKind !== input.resultKind) {
    throw new ServiceEngagementError("integrity_conflict");
  }
  return { ...existing, replayed: true };
}

async function advanceProject(tx: Transaction, project: ProjectRow, now: Date) {
  const nextRevision = project.revision + 1;
  const [updated] = await tx
    .update(studyJourneyProject)
    .set({ revision: nextRevision, updatedAt: now })
    .where(
      and(
        eq(studyJourneyProject.id, project.id),
        eq(studyJourneyProject.revision, project.revision),
        eq(studyJourneyProject.status, "active")
      )
    )
    .returning({ revision: studyJourneyProject.revision });
  if (!updated) {
    throw new ServiceEngagementError("revision_conflict");
  }
  return updated.revision;
}

async function appendEvent(
  tx: Transaction,
  input: {
    projectId: string;
    actorUserId: string;
    projectRevision: number;
    eventType: ProjectEvent["eventType"];
    subjectKind: ProjectEvent["subjectKind"];
    subjectId: string;
    operationRecordId: string;
    createdAt: Date;
  }
) {
  await tx.insert(projectEvent).values({
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    projectRevision: input.projectRevision,
    eventType: input.eventType,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    operationRecordId: input.operationRecordId,
    createdAt: input.createdAt,
  });
}

function iso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function parseTermsPayload(payload: string) {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

export type ServiceSignatureEvidenceView = {
  evidenceId: string;
  agreementVersionId: string;
  signerRole: string;
  declaredSignedAt: string;
  verificationStatus: ServiceSignatureVerificationStatus;
  verificationMethod: string;
  submittedAt: string;
  verifiedAt: string | null;
  rejectionReasonCode: string | null;
};

export type ServiceAgreementAcceptanceView = {
  acceptanceId: string;
  acceptedAt: string;
  termsSha256: string;
  customerNoticeVersion: string;
  customerNoticeSha256: string;
  acceptedProjectRevision: number;
};

export type ServiceAgreementVersionView = {
  agreementVersionId: string;
  versionNumber: number;
  status: ServiceAgreementVersionStatus;
  termsSchemaVersion: string;
  terms: unknown;
  termsSha256: string;
  scopeCodes: string[];
  customerNoticeVersion: string;
  customerNoticeSha256: string;
  createdAt: string;
  issuedAt: string | null;
  supersededAt: string | null;
  supersedesAgreementVersionId: string | null;
  supersededByAgreementVersionId: string | null;
  acceptance: ServiceAgreementAcceptanceView | null;
  signatureEvidence: ServiceSignatureEvidenceView[];
};

export type ServiceEngagementOwnerView = {
  engagementId: string;
  projectId: string;
  serviceMode: ServiceEngagementMode;
  scopeCodes: ServiceEngagementScopeCode[];
  status: ServiceEngagementStatus;
  revision: number;
  currentAgreementVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  suspendedAt: string | null;
  terminatedAt: string | null;
  terminalReasonCode: string | null;
  agreementVersions: ServiceAgreementVersionView[];
};

/**
 * Engagement metadata projection. R2-03: only the Project owner reaches this
 * projection today; staff Engagement detail is denied outright. Fields appear only
 * when an approved metadata policy authorizes them.
 */
export type ServiceEngagementMetadataView = {
  engagementId: string;
  projectId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  metadataPolicyCode: string;
  serviceMode: ServiceEngagementMode | null;
  scopeCodes: ServiceEngagementScopeCode[] | null;
  status: ServiceEngagementStatus | null;
};

export type ProjectResourceDisclosureGrantView = {
  grantId: string;
  projectId: string;
  resourceOwnerUserId: string;
  recipientAssignmentId: string;
  recipientUserId: string;
  resourceCategory: string;
  resourceId: string;
  resourceVersion: number;
  resourceFingerprint: string;
  purposeCode: string;
  noticeVersion: string;
  status: string;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReasonCode: string | null;
};

function evidenceView(row: EvidenceRow): ServiceSignatureEvidenceView {
  return {
    evidenceId: row.id,
    agreementVersionId: row.agreementVersionId,
    signerRole: row.signerRole,
    declaredSignedAt: row.declaredSignedAt.toISOString(),
    verificationStatus:
      row.verificationStatus as ServiceSignatureVerificationStatus,
    verificationMethod: row.verificationMethod,
    submittedAt: row.submittedAt.toISOString(),
    verifiedAt: iso(row.verifiedAt),
    rejectionReasonCode: row.rejectionReasonCode,
  };
}

function agreementVersionView(
  row: AgreementRow,
  acceptance: AcceptanceRow | undefined,
  evidence: readonly EvidenceRow[]
): ServiceAgreementVersionView {
  return {
    agreementVersionId: row.id,
    versionNumber: row.versionNumber,
    status: row.status as ServiceAgreementVersionStatus,
    termsSchemaVersion: row.termsSchemaVersion,
    terms: parseTermsPayload(row.termsPayload),
    termsSha256: row.termsSha256,
    scopeCodes: [...row.scopeCodes],
    customerNoticeVersion: row.customerNoticeVersion,
    customerNoticeSha256: row.customerNoticeSha256,
    createdAt: row.createdAt.toISOString(),
    issuedAt: iso(row.issuedAt),
    supersededAt: iso(row.supersededAt),
    supersedesAgreementVersionId: row.supersedesAgreementVersionId,
    supersededByAgreementVersionId: row.supersededByAgreementVersionId,
    acceptance: acceptance
      ? {
          acceptanceId: acceptance.id,
          acceptedAt: acceptance.acceptedAt.toISOString(),
          termsSha256: acceptance.termsSha256,
          customerNoticeVersion: acceptance.customerNoticeVersion,
          customerNoticeSha256: acceptance.customerNoticeSha256,
          acceptedProjectRevision: acceptance.acceptedProjectRevision,
        }
      : null,
    signatureEvidence: evidence.map(evidenceView),
  };
}

/**
 * R1-01 / R2-03: policy-gated Engagement metadata projection.
 *
 * Service mode, scope codes and lifecycle status are protected counterparty
 * metadata. They are `null` unless an explicitly approved metadata policy
 * authorizes the field, and every projection states which policy was applied.
 * Today only `SERVICE_ENGAGEMENT_OWNER_METADATA_POLICY` is used; the deny-by-default
 * staff policy is retained as the blocked position for staff disclosure.
 */
function engagementMetadataView(
  row: EngagementRow,
  policy: ServiceEngagementMetadataPolicy
) {
  return {
    engagementId: row.id,
    projectId: row.projectId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    metadataPolicyCode: policy.policyCode,
    serviceMode: serviceEngagementMetadataAuthorized(policy, "serviceMode")
      ? (row.serviceMode as ServiceEngagementMode)
      : null,
    scopeCodes: serviceEngagementMetadataAuthorized(policy, "scopeCodes")
      ? (row.scopeCodes as ServiceEngagementScopeCode[])
      : null,
    status: serviceEngagementMetadataAuthorized(policy, "status")
      ? (row.status as ServiceEngagementStatus)
      : null,
  };
}

async function loadOwnerEngagementView(
  tx: Transaction,
  engagement: EngagementRow
): Promise<ServiceEngagementOwnerView> {
  const agreements = await tx
    .select()
    .from(serviceAgreementVersion)
    .where(eq(serviceAgreementVersion.engagementId, engagement.id))
    .orderBy(desc(serviceAgreementVersion.versionNumber));
  const agreementIds = agreements.map((agreement) => agreement.id);
  const acceptances =
    agreementIds.length === 0
      ? []
      : await tx
          .select()
          .from(serviceAgreementAcceptance)
          .where(
            inArray(serviceAgreementAcceptance.agreementVersionId, agreementIds)
          );
  const evidence =
    agreementIds.length === 0
      ? []
      : await tx
          .select()
          .from(serviceSignatureEvidence)
          .where(
            inArray(serviceSignatureEvidence.agreementVersionId, agreementIds)
          )
          .orderBy(desc(serviceSignatureEvidence.submittedAt));
  return {
    engagementId: engagement.id,
    projectId: engagement.projectId,
    serviceMode: engagement.serviceMode as ServiceEngagementMode,
    scopeCodes: engagement.scopeCodes as ServiceEngagementScopeCode[],
    status: engagement.status as ServiceEngagementStatus,
    revision: engagement.revision,
    currentAgreementVersionId: engagement.currentAgreementVersionId,
    createdAt: engagement.createdAt.toISOString(),
    updatedAt: engagement.updatedAt.toISOString(),
    activatedAt: iso(engagement.activatedAt),
    suspendedAt: iso(engagement.suspendedAt),
    terminatedAt: iso(engagement.terminatedAt),
    terminalReasonCode: engagement.terminalReasonCode,
    agreementVersions: agreements.map((agreement) =>
      agreementVersionView(
        agreement,
        acceptances.find(
          (acceptance) => acceptance.agreementVersionId === agreement.id
        ),
        evidence.filter((entry) => entry.agreementVersionId === agreement.id)
      )
    ),
  };
}

function grantView(row: GrantRow): ProjectResourceDisclosureGrantView {
  return {
    grantId: row.id,
    projectId: row.projectId,
    resourceOwnerUserId: row.resourceOwnerUserId,
    recipientAssignmentId: row.recipientAssignmentId,
    recipientUserId: row.recipientUserId,
    resourceCategory: row.resourceCategory,
    resourceId: row.resourceId,
    resourceVersion: row.resourceVersion,
    resourceFingerprint: row.resourceFingerprint,
    purposeCode: row.purposeCode,
    noticeVersion: row.noticeVersion,
    status: row.status,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: iso(row.expiresAt),
    revokedAt: iso(row.revokedAt),
    revocationReasonCode: row.revocationReasonCode,
  };
}

export function disclosureAssignmentSnapshot(
  row: AssignmentRow
): ProjectResourceDisclosureAssignment {
  return {
    assignmentId: row.id,
    projectId: row.projectId,
    staffUserId: row.staffUserId,
    staffEmailSha256: row.staffEmailSha256,
    status: row.status,
    purpose: row.purpose,
  };
}

export function disclosureGrantSnapshot(
  row: GrantRow
): ProjectResourceDisclosureGrantSnapshot {
  return {
    grantId: row.id,
    projectId: row.projectId,
    resourceOwnerUserId: row.resourceOwnerUserId,
    recipientAssignmentId: row.recipientAssignmentId,
    recipientUserId: row.recipientUserId,
    resourceCategory: row.resourceCategory,
    resourceId: row.resourceId,
    resourceVersion: row.resourceVersion,
    resourceFingerprint: row.resourceFingerprint,
    purposeCode: row.purposeCode,
    status: row.status as "granted" | "revoked" | "expired",
    expiresAt: iso(row.expiresAt),
  };
}

export type CreateEngagementInput = {
  actorUserId: string;
  projectId: string;
  serviceMode: string;
  scopeCodes: readonly string[];
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

export type ListEngagementsInput = {
  actorUserId: string;
  projectId: string;
  limit: number;
};

export type GetEngagementInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
};

function runCreateEngagement(database: Database, input: CreateEngagementInput) {
  const scopeCodes = canonicalScopeCodes(input.scopeCodes);
  if (
    !scopeCodes ||
    (input.serviceMode !== "self_service" && input.serviceMode !== "managed")
  ) {
    throw new ServiceEngagementError("invalid_request");
  }
  const engagementId = randomUUID();
  return database.transaction(async (tx) => {
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "service_engagement_create",
      requestHash: input.requestHash,
      resultId: engagementId,
      resultKind: "service_engagement",
    });
    const project = await lockProject(tx, input.projectId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    if (!isProjectOwner(accounts.get(input.actorUserId), project)) {
      notFound();
    }
    if (operation.replayed) {
      const [existing] = await tx
        .select()
        .from(serviceEngagement)
        .where(eq(serviceEngagement.id, operation.resultId))
        .limit(1);
      if (
        !existing ||
        existing.projectId !== project.id ||
        existing.customerOwnerUserId !== input.actorUserId
      ) {
        throw new ServiceEngagementError("integrity_conflict");
      }
      return {
        replayed: true,
        projectRevision: project.revision,
        engagement: await loadOwnerEngagementView(tx, existing),
      };
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServiceEngagementError("revision_conflict");
    }
    const [live] = await tx
      .select({ id: serviceEngagement.id })
      .from(serviceEngagement)
      .where(
        and(
          eq(serviceEngagement.projectId, project.id),
          ne(serviceEngagement.status, "terminated")
        )
      )
      .limit(1);
    if (live) {
      // Matches the ServiceEngagement_project_live_unique partial index: only a
      // live (non-terminated) engagement blocks a new draft.
      throw new ServiceEngagementError("state_conflict");
    }
    const now = new Date();
    const nextRevision = await advanceProject(tx, project, now);
    await tx.insert(serviceEngagement).values({
      id: engagementId,
      projectId: project.id,
      customerOwnerUserId: project.ownerUserId,
      serviceMode: input.serviceMode,
      scopeCodes,
      revision: 1,
      createdProjectRevision: nextRevision,
      lastProjectRevision: nextRevision,
      createdOperationRecordId: operation.id,
      lastOperationRecordId: operation.id,
      createdAt: now,
      updatedAt: now,
    });
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: project.ownerUserId,
      projectRevision: nextRevision,
      eventType: "service_engagement_created",
      subjectKind: "service_engagement",
      subjectId: engagementId,
      operationRecordId: operation.id,
      createdAt: now,
    });
    return {
      replayed: false,
      projectRevision: nextRevision,
      engagement: {
        engagementId,
        projectId: project.id,
        serviceMode: input.serviceMode as ServiceEngagementMode,
        scopeCodes,
        status: "draft" as ServiceEngagementStatus,
        revision: 1,
        currentAgreementVersionId: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        activatedAt: null,
        suspendedAt: null,
        terminatedAt: null,
        terminalReasonCode: null,
        agreementVersions: [],
      } satisfies ServiceEngagementOwnerView,
    };
  });
}

async function readActiveProject(tx: Transaction, projectId: string) {
  const [project] = await tx
    .select()
    .from(studyJourneyProject)
    .where(eq(studyJourneyProject.id, projectId))
    .limit(1);
  if (!project || project.status !== "active") {
    notFound();
  }
  return project;
}

async function lockEngagement(
  tx: Transaction,
  projectId: string,
  engagementId: string
) {
  const [engagement] = await tx
    .select()
    .from(serviceEngagement)
    .where(
      and(
        eq(serviceEngagement.id, engagementId),
        eq(serviceEngagement.projectId, projectId)
      )
    )
    .for("update")
    .limit(1);
  if (!engagement) {
    notFound();
  }
  return engagement;
}

async function activeStaffAssignment(
  tx: Transaction,
  projectId: string,
  staffUserId: string,
  account: Account
) {
  if (!isEligibleStaff(account)) {
    return null;
  }
  const [assignment] = await tx
    .select()
    .from(projectStaffAssignment)
    .where(
      and(
        eq(projectStaffAssignment.projectId, projectId),
        eq(projectStaffAssignment.staffUserId, staffUserId),
        eq(projectStaffAssignment.status, "active"),
        eq(projectStaffAssignment.purpose, "project_staff_collaboration"),
        eq(
          projectStaffAssignment.staffEmailSha256,
          hashStaffEmail(account.email)
        )
      )
    )
    .limit(1);
  return assignment ?? null;
}

function runListEngagements(database: Database, input: ListEngagementsInput) {
  return database.transaction(async (tx) => {
    const project = await readActiveProject(tx, input.projectId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    if (!isProjectOwner(accounts.get(input.actorUserId), project)) {
      notFound();
    }
    const rows = await tx
      .select()
      .from(serviceEngagement)
      .where(eq(serviceEngagement.projectId, project.id))
      .orderBy(desc(serviceEngagement.createdAt), desc(serviceEngagement.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    return {
      // The Project owner is the counterparty, so full metadata is authorized.
      items: page.map((row) =>
        engagementMetadataView(row, SERVICE_ENGAGEMENT_OWNER_METADATA_POLICY)
      ),
      hasMore: rows.length > input.limit,
    };
  });
}

/**
 * R2-03: Engagement detail is owner-only in this slice.
 *
 * An active M4-002 assignment authorizes the previously approved restricted
 * Project shell only. It does not by itself disclose that a service engagement
 * exists, nor its id, revision, timestamps, service mode, scope or status. Staff
 * detail access stays denied (indistinguishable `notFound`) until an independently
 * approved staff-disclosure policy exists; `SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY`
 * documents the current deny-by-default position and must not be flipped here.
 */
function runGetEngagement(database: Database, input: GetEngagementInput) {
  return database.transaction(async (tx) => {
    const project = await readActiveProject(tx, input.projectId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const actor = accounts.get(input.actorUserId);
    if (!isProjectOwner(actor, project)) {
      // Staff, members, admins and guests all receive the same response.
      notFound();
    }
    const [engagement] = await tx
      .select()
      .from(serviceEngagement)
      .where(
        and(
          eq(serviceEngagement.id, input.engagementId),
          eq(serviceEngagement.projectId, project.id)
        )
      )
      .limit(1);
    if (!engagement) {
      notFound();
    }
    return {
      scope: "owner" as const,
      engagement: await loadOwnerEngagementView(tx, engagement),
    };
  });
}

export type LoadServiceOperatorContextInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  action: ServiceOperatorAction;
  /** Required for `issue` and `verify_signature`. */
  agreementVersionId?: string;
  /** Required for `verify_signature`. */
  evidenceId?: string;
  /**
   * Required for `author_draft`: the exact terms the caller is about to persist,
   * plus the pre-generated agreement version id the draft will receive.
   */
  draft?: {
    agreementVersionId: string;
    serviceMode: ServiceEngagementMode;
    scopeCodes: readonly ServiceEngagementScopeCode[];
    termsSha256: string;
  };
};

/**
 * R1-04: load the exact persisted target plus the server-derived operator
 * eligibility and return the canonical authority request the HTTP layer must
 * present to the authority port. The mutation re-derives this same request from
 * the rows it locks, so an approval for one contract cannot authorize another.
 */
function runLoadServiceOperatorContext(
  database: Database,
  input: LoadServiceOperatorContextInput
) {
  return database.transaction(async (tx) => {
    const project = await readActiveProject(tx, input.projectId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const operator = await loadOperatorEligibility(
      tx,
      project.id,
      accounts.get(input.actorUserId)
    );
    if (!operator.eligible) {
      // A global role is never sufficient: require current Project staff scope.
      throw new ServiceEngagementError("forbidden");
    }
    const [engagement] = await tx
      .select()
      .from(serviceEngagement)
      .where(
        and(
          eq(serviceEngagement.id, input.engagementId),
          eq(serviceEngagement.projectId, project.id)
        )
      )
      .limit(1);
    if (!engagement) {
      notFound();
    }
    let agreement: AgreementRow | null = null;
    let evidence: EvidenceRow | null = null;
    let draft: {
      agreementVersionId: string;
      serviceMode: ServiceEngagementMode;
      scopeCodes: readonly ServiceEngagementScopeCode[];
      termsSha256: string;
    } | null = null;
    if (input.action === "author_draft") {
      if (
        !input.draft ||
        !UUID_PATTERN.test(input.draft.agreementVersionId) ||
        canonicalScopeCodes(input.draft.scopeCodes) === null
      ) {
        throw new ServiceEngagementError("invalid_request");
      }
      draft = {
        agreementVersionId: input.draft.agreementVersionId,
        scopeCodes: input.draft.scopeCodes,
        serviceMode: input.draft.serviceMode,
        termsSha256: input.draft.termsSha256,
      };
    } else {
      if (!input.agreementVersionId) {
        throw new ServiceEngagementError("invalid_request");
      }
      const [version] = await tx
        .select()
        .from(serviceAgreementVersion)
        .where(
          and(
            eq(serviceAgreementVersion.id, input.agreementVersionId),
            eq(serviceAgreementVersion.engagementId, engagement.id)
          )
        )
        .limit(1);
      if (!version) {
        notFound();
      }
      agreement = version;
    }
    if (input.action === "verify_signature") {
      if (!input.evidenceId) {
        throw new ServiceEngagementError("invalid_request");
      }
      const [row] = await tx
        .select()
        .from(serviceSignatureEvidence)
        .where(
          and(
            eq(serviceSignatureEvidence.id, input.evidenceId),
            eq(serviceSignatureEvidence.engagementId, engagement.id)
          )
        )
        .limit(1);
      if (!row) {
        notFound();
      }
      if (row.signerUserId === input.actorUserId) {
        // A signatory may never authorize verification of their own evidence.
        throw new ServiceEngagementError("forbidden");
      }
      if (row.verificationStatus !== "pending") {
        throw new ServiceEngagementError("state_conflict");
      }
      evidence = row;
    }
    return {
      agreementVersionId:
        agreement?.id ?? draftAgreementVersionId(input) ?? null,
      agreementVersionStatus: agreement?.status ?? null,
      engagementStatus: engagement.status,
      evidenceId: evidence?.id ?? null,
      evidenceVerificationStatus: evidence?.verificationStatus ?? null,
      operatorAssignmentId: operator.assignment?.id ?? null,
      operatorAssignmentStatus: operator.assignment?.status ?? null,
      operatorEligible: operator.eligible,
      operatorAuthority: operatorAuthorityRequest({
        action: input.action,
        agreement,
        draft,
        engagement,
        evidence,
        operator,
        project,
      }),
      scopeCodes: agreement
        ? (agreement.scopeCodes as ServiceEngagementScopeCode[])
        : (draft?.scopeCodes ?? []),
      serviceMode: agreement
        ? (engagement.serviceMode as ServiceEngagementMode)
        : (draft?.serviceMode ??
          (engagement.serviceMode as ServiceEngagementMode)),
      termsSha256: agreement?.termsSha256 ?? draft?.termsSha256 ?? null,
      versionNumber: agreement?.versionNumber ?? null,
    };
  });
}

function draftAgreementVersionId(input: LoadServiceOperatorContextInput) {
  return input.action === "author_draft"
    ? (input.draft?.agreementVersionId ?? null)
    : null;
}

export type CreateAgreementVersionInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  /** Caller-generated id so the authority decision can bind to the exact draft. */
  agreementVersionId: string;
  authorityCode: string;
  /** Canonical hash of the authority request the decision was made about. */
  authorityRequestSha256: string;
  termsPayload: string;
  termsSha256: string;
  scopeCodes: readonly ServiceEngagementScopeCode[];
  serviceMode: ServiceEngagementMode;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

export type IssueAgreementVersionInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  agreementVersionId: string;
  authorityCode: string;
  /** Canonical hash of the authority request the decision was made about. */
  authorityRequestSha256: string;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** Opaque adapter fingerprint for the exact observed bytes/metadata. */
const RESOURCE_FINGERPRINT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;

type RepositoryDeps = {
  /**
   * R1-05: optional in-transaction resource revalidator. Production composes
   * `null`, so disclosure-grant creation fails closed.
   */
  resourceRevalidator: ProjectResourceDisclosureRevalidator | null;
};

/**
 * Create an immutable agreement version in `draft`. Terms must already be the
 * canonical serialization (FIX-03 enforces this here rather than trusting the
 * caller), the caller's authority decision is persisted as provenance and is never
 * re-inferred, and it must have been made about this exact draft (R1-04).
 */
function runCreateAgreementVersion(
  database: Database,
  input: CreateAgreementVersionInput
) {
  if (!UUID_PATTERN.test(input.agreementVersionId)) {
    throw new ServiceEngagementError("invalid_request");
  }
  // FIX-03: never trust the caller's terms bytes. The draft is stored only when the
  // payload is exactly the canonical serialization, the hash is the hash of those
  // bytes, and scope/mode agree with what the caller claims to be authorizing.
  if (
    !serviceAgreementTermsWriteMatches({
      scopeCodes: input.scopeCodes,
      serviceMode: input.serviceMode,
      termsPayload: input.termsPayload,
      termsSha256: input.termsSha256,
    })
  ) {
    throw new ServiceEngagementError("invalid_request");
  }
  return database.transaction(async (tx) => {
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "service_engagement_agreement_draft",
      requestHash: input.requestHash,
      resultId: input.agreementVersionId,
      resultKind: "service_agreement_version",
    });
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const operator = await loadOperatorEligibility(
      tx,
      project.id,
      accounts.get(input.actorUserId)
    );
    if (operation.replayed) {
      const [existing] = await tx
        .select()
        .from(serviceAgreementVersion)
        .where(eq(serviceAgreementVersion.id, operation.resultId))
        .limit(1);
      if (
        !existing ||
        existing.engagementId !== engagement.id ||
        existing.projectId !== project.id
      ) {
        throw new ServiceEngagementError("integrity_conflict");
      }
      const [acceptance] = await tx
        .select()
        .from(serviceAgreementAcceptance)
        .where(eq(serviceAgreementAcceptance.agreementVersionId, existing.id))
        .limit(1);
      const evidence = await tx
        .select()
        .from(serviceSignatureEvidence)
        .where(eq(serviceSignatureEvidence.agreementVersionId, existing.id));
      return {
        replayed: true,
        projectRevision: project.revision,
        engagementRevision: engagement.revision,
        agreementVersion: agreementVersionView(existing, acceptance, evidence),
      };
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServiceEngagementError("revision_conflict");
    }
    if (
      engagement.status !== "draft" &&
      engagement.status !== "awaiting_customer_action"
    ) {
      throw new ServiceEngagementError("state_conflict");
    }
    if (
      !canonicalScopeCodes(input.scopeCodes) ||
      engagement.serviceMode !== input.serviceMode ||
      !(
        engagement.scopeCodes.length === input.scopeCodes.length &&
        engagement.scopeCodes.every((code) =>
          (input.scopeCodes as readonly string[]).includes(code)
        )
      )
    ) {
      throw new ServiceEngagementError("invalid_request");
    }
    // R1-04: the persisted draft must be exactly the target the authority
    // decided about. A role, a different engagement or other terms cannot
    // borrow another operator's approval.
    assertOperatorAuthorityBinding({
      action: "author_draft",
      agreement: null,
      draft: {
        agreementVersionId: input.agreementVersionId,
        scopeCodes: input.scopeCodes,
        serviceMode: input.serviceMode,
        termsSha256: input.termsSha256,
      },
      engagement,
      evidence: null,
      expectedSha256: input.authorityRequestSha256,
      operator,
      project,
    });

    const [lastVersion] = await tx
      .select({ versionNumber: serviceAgreementVersion.versionNumber })
      .from(serviceAgreementVersion)
      .where(eq(serviceAgreementVersion.engagementId, engagement.id))
      .orderBy(desc(serviceAgreementVersion.versionNumber))
      .limit(1);
    const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1;
    const now = new Date();
    const nextRevision = await advanceProject(tx, project, now);
    await tx.insert(serviceAgreementVersion).values({
      id: input.agreementVersionId,
      engagementId: engagement.id,
      projectId: project.id,
      versionNumber: nextVersionNumber,
      status: "draft",
      termsSchemaVersion: "m4-004-service-terms-v1",
      termsPayload: input.termsPayload,
      termsSha256: input.termsSha256,
      scopeCodes: [...input.scopeCodes],
      customerNoticeVersion: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
      customerNoticeSha256: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_SHA256,
      authoredByUserId: input.actorUserId,
      authorityCode: input.authorityCode,
      createdProjectRevision: nextRevision,
      createdOperationRecordId: operation.id,
      createdAt: now,
    });
    await tx
      .update(serviceEngagement)
      .set({
        revision: engagement.revision + 1,
        lastProjectRevision: nextRevision,
        lastOperationRecordId: operation.id,
        updatedAt: now,
      })
      .where(eq(serviceEngagement.id, engagement.id));
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: input.actorUserId,
      projectRevision: nextRevision,
      eventType: "service_engagement_agreement_version_drafted",
      subjectKind: "service_agreement_version",
      subjectId: input.agreementVersionId,
      operationRecordId: operation.id,
      createdAt: now,
    });
    return {
      replayed: false,
      projectRevision: nextRevision,
      engagementRevision: engagement.revision + 1,
      agreementVersion: {
        agreementVersionId: input.agreementVersionId,
        versionNumber: nextVersionNumber,
        status: "draft" as ServiceAgreementVersionStatus,
        termsSchemaVersion: "m4-004-service-terms-v1",
        terms: parseTermsPayload(input.termsPayload),
        termsSha256: input.termsSha256,
        scopeCodes: [...input.scopeCodes],
        customerNoticeVersion: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
        customerNoticeSha256: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_SHA256,
        createdAt: now.toISOString(),
        issuedAt: null,
        supersededAt: null,
        supersedesAgreementVersionId: null,
        supersededByAgreementVersionId: null,
        acceptance: null,
        signatureEvidence: [],
      } satisfies ServiceAgreementVersionView,
    };
  });
}

/**
 * Issue a draft agreement version. Issuance supersedes the previous issued
 * version in the same transaction, so an old acceptance can never satisfy the
 * new current version.
 */
function runIssueAgreementVersion(
  database: Database,
  input: IssueAgreementVersionInput
) {
  return database.transaction(async (tx) => {
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "service_engagement_agreement_issue",
      requestHash: input.requestHash,
      resultId: input.agreementVersionId,
      resultKind: "service_agreement_version",
    });
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const operator = await loadOperatorEligibility(
      tx,
      project.id,
      accounts.get(input.actorUserId)
    );
    const [existing] = await tx
      .select()
      .from(serviceAgreementVersion)
      .where(
        and(
          eq(serviceAgreementVersion.id, input.agreementVersionId),
          eq(serviceAgreementVersion.engagementId, engagement.id)
        )
      )
      .for("update")
      .limit(1);
    if (!existing) {
      notFound();
    }
    if (operation.replayed) {
      const [acceptance] = await tx
        .select()
        .from(serviceAgreementAcceptance)
        .where(eq(serviceAgreementAcceptance.agreementVersionId, existing.id))
        .limit(1);
      const evidence = await tx
        .select()
        .from(serviceSignatureEvidence)
        .where(eq(serviceSignatureEvidence.agreementVersionId, existing.id));
      return {
        replayed: true,
        projectRevision: project.revision,
        engagementRevision: engagement.revision,
        agreementVersion: agreementVersionView(existing, acceptance, evidence),
      };
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServiceEngagementError("revision_conflict");
    }
    if (existing.status !== "draft") {
      throw new ServiceEngagementError("state_conflict");
    }
    if (
      engagement.status !== "draft" &&
      engagement.status !== "awaiting_customer_action"
    ) {
      throw new ServiceEngagementError("state_conflict");
    }
    // R1-04: the authority decision must have been made about this exact
    // persisted version (engagement, version number, terms hash, scope, mode,
    // version status) and this operator's current eligibility.
    assertOperatorAuthorityBinding({
      action: "issue",
      agreement: existing,
      draft: null,
      engagement,
      evidence: null,
      expectedSha256: input.authorityRequestSha256,
      operator,
      project,
    });
    const previousVersionId = engagement.currentAgreementVersionId;
    const now = new Date();
    const nextRevision = await advanceProject(tx, project, now);
    if (previousVersionId) {
      const [previous] = await tx
        .select()
        .from(serviceAgreementVersion)
        .where(
          and(
            eq(serviceAgreementVersion.id, previousVersionId),
            eq(serviceAgreementVersion.engagementId, engagement.id)
          )
        )
        .for("update")
        .limit(1);
      if (!previous || previous.status !== "issued") {
        throw new ServiceEngagementError("integrity_conflict");
      }
      await tx
        .update(serviceAgreementVersion)
        .set({
          status: "superseded",
          supersededAt: now,
          supersededByAgreementVersionId: existing.id,
          supersededOperationRecordId: operation.id,
        })
        .where(eq(serviceAgreementVersion.id, previous.id));
    }
    await tx
      .update(serviceAgreementVersion)
      .set({
        status: "issued",
        issuedAt: now,
        issuedProjectRevision: nextRevision,
        issuedOperationRecordId: operation.id,
        supersedesAgreementVersionId: previousVersionId ?? null,
      })
      .where(eq(serviceAgreementVersion.id, existing.id));
    await tx
      .update(serviceEngagement)
      .set({
        status:
          engagement.status === "draft"
            ? "awaiting_customer_action"
            : engagement.status,
        currentAgreementVersionId: existing.id,
        revision: engagement.revision + 1,
        lastProjectRevision: nextRevision,
        lastOperationRecordId: operation.id,
        updatedAt: now,
      })
      .where(eq(serviceEngagement.id, engagement.id));
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: input.actorUserId,
      projectRevision: nextRevision,
      eventType: "service_engagement_agreement_version_issued",
      subjectKind: "service_agreement_version",
      subjectId: existing.id,
      operationRecordId: operation.id,
      createdAt: now,
    });
    return {
      replayed: false,
      projectRevision: nextRevision,
      engagementRevision: engagement.revision + 1,
      agreementVersion: agreementVersionView(
        {
          ...existing,
          status: "issued",
          issuedAt: now,
          issuedProjectRevision: nextRevision,
          issuedOperationRecordId: operation.id,
          supersedesAgreementVersionId: previousVersionId ?? null,
        },
        undefined,
        []
      ),
    };
  });
}

export type AcceptAgreementVersionInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  agreementVersionId: string;
  termsSha256: string;
  customerNoticeVersion: string;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

/**
 * Record a customer decision against the exact current agreement version and
 * terms hash. Acceptance is a consent record, never a verified signature.
 */
function runAcceptAgreementVersion(
  database: Database,
  input: AcceptAgreementVersionInput
) {
  const acceptanceId = randomUUID();
  return database.transaction(async (tx) => {
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "service_engagement_agreement_accept",
      requestHash: input.requestHash,
      resultId: acceptanceId,
      resultKind: "service_agreement_acceptance",
    });
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    if (!isProjectOwner(accounts.get(input.actorUserId), project)) {
      notFound();
    }
    if (operation.replayed) {
      const [existing] = await tx
        .select()
        .from(serviceAgreementAcceptance)
        .where(eq(serviceAgreementAcceptance.id, operation.resultId))
        .limit(1);
      if (
        !existing ||
        existing.engagementId !== engagement.id ||
        existing.projectId !== project.id
      ) {
        throw new ServiceEngagementError("integrity_conflict");
      }
      return {
        replayed: true,
        projectRevision: project.revision,
        engagementRevision: engagement.revision,
        acceptance: {
          acceptanceId: existing.id,
          agreementVersionId: existing.agreementVersionId,
          termsSha256: existing.termsSha256,
          acceptedAt: existing.acceptedAt.toISOString(),
          customerNoticeVersion: existing.customerNoticeVersion,
          customerNoticeSha256: existing.customerNoticeSha256,
          acceptedProjectRevision: existing.acceptedProjectRevision,
        },
      };
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServiceEngagementError("revision_conflict");
    }
    const [version] = await tx
      .select()
      .from(serviceAgreementVersion)
      .where(
        and(
          eq(serviceAgreementVersion.id, input.agreementVersionId),
          eq(serviceAgreementVersion.engagementId, engagement.id)
        )
      )
      .for("update")
      .limit(1);
    if (!version) {
      notFound();
    }
    if (
      engagement.status !== "awaiting_customer_action" ||
      version.status !== "issued" ||
      engagement.currentAgreementVersionId !== version.id
    ) {
      throw new ServiceEngagementError("state_conflict");
    }
    if (
      version.termsSha256 !== input.termsSha256 ||
      version.customerNoticeVersion !== input.customerNoticeVersion
    ) {
      throw new ServiceEngagementError("state_conflict");
    }
    const now = new Date();
    const nextRevision = await advanceProject(tx, project, now);
    await tx.insert(serviceAgreementAcceptance).values({
      id: acceptanceId,
      engagementId: engagement.id,
      projectId: project.id,
      agreementVersionId: version.id,
      termsSha256: version.termsSha256,
      acceptedByUserId: project.ownerUserId,
      customerNoticeVersion: version.customerNoticeVersion,
      customerNoticeSha256: version.customerNoticeSha256,
      acceptedProjectRevision: nextRevision,
      acceptedAt: now,
      operationRecordId: operation.id,
    });
    await tx
      .update(serviceEngagement)
      .set({
        revision: engagement.revision + 1,
        lastProjectRevision: nextRevision,
        lastOperationRecordId: operation.id,
        updatedAt: now,
      })
      .where(eq(serviceEngagement.id, engagement.id));
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: project.ownerUserId,
      projectRevision: nextRevision,
      eventType: "service_engagement_agreement_accepted",
      subjectKind: "service_agreement_acceptance",
      subjectId: acceptanceId,
      operationRecordId: operation.id,
      createdAt: now,
    });
    return {
      replayed: false,
      projectRevision: nextRevision,
      engagementRevision: engagement.revision + 1,
      acceptance: {
        acceptanceId,
        agreementVersionId: version.id,
        termsSha256: version.termsSha256,
        acceptedAt: now.toISOString(),
        customerNoticeVersion: version.customerNoticeVersion,
        customerNoticeSha256: version.customerNoticeSha256,
        acceptedProjectRevision: nextRevision,
      },
    };
  });
}

export type SubmitSignatureEvidenceInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  agreementVersionId: string;
  termsSha256: string;
  evidenceRef: string;
  evidenceSha256: string;
  declaredSignedAt: Date;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

/**
 * Record customer-submitted signature evidence as `pending`. The server derives
 * the payload hash from persisted rows; no caller-supplied "signed" or
 * "verified" flag is accepted, and nothing is verified here.
 */
function runSubmitSignatureEvidence(
  database: Database,
  input: SubmitSignatureEvidenceInput
) {
  const evidenceId = randomUUID();
  return database.transaction(async (tx) => {
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "service_engagement_signature_submit",
      requestHash: input.requestHash,
      resultId: evidenceId,
      resultKind: "service_signature_evidence",
    });
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    if (!isProjectOwner(accounts.get(input.actorUserId), project)) {
      notFound();
    }
    if (operation.replayed) {
      const [existing] = await tx
        .select()
        .from(serviceSignatureEvidence)
        .where(eq(serviceSignatureEvidence.id, operation.resultId))
        .limit(1);
      if (
        !existing ||
        existing.engagementId !== engagement.id ||
        existing.projectId !== project.id
      ) {
        throw new ServiceEngagementError("integrity_conflict");
      }
      return {
        replayed: true,
        projectRevision: project.revision,
        engagementRevision: engagement.revision,
        signatureEvidence: evidenceView(existing),
      };
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServiceEngagementError("revision_conflict");
    }
    const [version] = await tx
      .select()
      .from(serviceAgreementVersion)
      .where(
        and(
          eq(serviceAgreementVersion.id, input.agreementVersionId),
          eq(serviceAgreementVersion.engagementId, engagement.id)
        )
      )
      .for("update")
      .limit(1);
    if (!version) {
      notFound();
    }
    if (
      engagement.status !== "awaiting_customer_action" ||
      version.status !== "issued" ||
      engagement.currentAgreementVersionId !== version.id ||
      version.termsSha256 !== input.termsSha256
    ) {
      throw new ServiceEngagementError("state_conflict");
    }
    const [acceptance] = await tx
      .select({ id: serviceAgreementAcceptance.id })
      .from(serviceAgreementAcceptance)
      .where(
        and(
          eq(serviceAgreementAcceptance.agreementVersionId, version.id),
          eq(serviceAgreementAcceptance.termsSha256, version.termsSha256),
          eq(serviceAgreementAcceptance.acceptedByUserId, project.ownerUserId)
        )
      )
      .limit(1);
    if (!acceptance) {
      throw new ServiceEngagementError("state_conflict");
    }
    const now = new Date();
    if (
      input.declaredSignedAt.getTime() >
      now.getTime() + SERVICE_SIGNATURE_DECLARED_TIME_FUTURE_SKEW_MS
    ) {
      throw new ServiceEngagementError("invalid_request");
    }
    const signedAt = input.declaredSignedAt.toISOString();
    const signaturePayloadSha256 = hashServiceSignaturePayload(
      buildServiceSignaturePayload({
        agreementVersionId: version.id,
        engagementId: engagement.id,
        evidenceRef: input.evidenceRef,
        evidenceSha256: input.evidenceSha256,
        signedAt,
        signerUserId: project.ownerUserId,
        termsSha256: version.termsSha256,
      })
    );
    const nextRevision = await advanceProject(tx, project, now);
    await tx.insert(serviceSignatureEvidence).values({
      id: evidenceId,
      engagementId: engagement.id,
      projectId: project.id,
      agreementVersionId: version.id,
      termsSha256: version.termsSha256,
      signerUserId: project.ownerUserId,
      signerRole: "customer_owner",
      evidenceRef: input.evidenceRef,
      evidenceSha256: input.evidenceSha256,
      signaturePayloadSha256,
      declaredSignedAt: input.declaredSignedAt,
      verificationStatus: "pending",
      verificationMethod: "unverified",
      submittedByUserId: project.ownerUserId,
      submittedAt: now,
      submittedProjectRevision: nextRevision,
      submittedOperationRecordId: operation.id,
    });
    await tx
      .update(serviceEngagement)
      .set({
        revision: engagement.revision + 1,
        lastProjectRevision: nextRevision,
        lastOperationRecordId: operation.id,
        updatedAt: now,
      })
      .where(eq(serviceEngagement.id, engagement.id));
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: project.ownerUserId,
      projectRevision: nextRevision,
      eventType: "service_engagement_signature_evidence_recorded",
      subjectKind: "service_signature_evidence",
      subjectId: evidenceId,
      operationRecordId: operation.id,
      createdAt: now,
    });
    return {
      replayed: false,
      projectRevision: nextRevision,
      engagementRevision: engagement.revision + 1,
      signatureEvidence: {
        evidenceId,
        agreementVersionId: version.id,
        signerRole: "customer_owner",
        declaredSignedAt: signedAt,
        verificationStatus: "pending" as ServiceSignatureVerificationStatus,
        verificationMethod: "unverified",
        submittedAt: now.toISOString(),
        verifiedAt: null,
        rejectionReasonCode: null,
      } satisfies ServiceSignatureEvidenceView,
    };
  });
}

export type LoadSignatureVerificationTargetInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  evidenceId: string;
};

/**
 * Resolve the exact persisted binding a verifier port may evaluate. No lock is
 * held across the external verification call; the write path revalidates.
 */
function runLoadSignatureVerificationTarget(
  database: Database,
  input: LoadSignatureVerificationTargetInput
) {
  return database.transaction(async (tx) => {
    const project = await readActiveProject(tx, input.projectId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const actor = accounts.get(input.actorUserId);
    // R1-04: verification is a scope-specific operator act. An active M4-002
    // assignment for this Project is required; a global role is not enough.
    const operator = await loadOperatorEligibility(tx, project.id, actor);
    if (!operator.eligible) {
      notFound();
    }
    const [engagement] = await tx
      .select()
      .from(serviceEngagement)
      .where(
        and(
          eq(serviceEngagement.id, input.engagementId),
          eq(serviceEngagement.projectId, project.id)
        )
      )
      .limit(1);
    if (!engagement) {
      notFound();
    }
    const [evidence] = await tx
      .select()
      .from(serviceSignatureEvidence)
      .where(
        and(
          eq(serviceSignatureEvidence.id, input.evidenceId),
          eq(serviceSignatureEvidence.engagementId, engagement.id),
          eq(serviceSignatureEvidence.projectId, project.id)
        )
      )
      .limit(1);
    if (!evidence) {
      notFound();
    }
    if (!actor) {
      notFound();
    }
    if (evidence.signerUserId === actor.id) {
      // A signatory may never verify their own evidence.
      throw new ServiceEngagementError("forbidden");
    }
    if (evidence.verificationStatus !== "pending") {
      throw new ServiceEngagementError("state_conflict");
    }
    const [version] = await tx
      .select()
      .from(serviceAgreementVersion)
      .where(
        and(
          eq(serviceAgreementVersion.id, evidence.agreementVersionId),
          eq(serviceAgreementVersion.engagementId, engagement.id)
        )
      )
      .limit(1);
    if (!version) {
      throw new ServiceEngagementError("integrity_conflict");
    }
    return {
      evidenceId: evidence.id,
      engagementId: evidence.engagementId,
      projectId: evidence.projectId,
      agreementVersionId: evidence.agreementVersionId,
      termsSha256: evidence.termsSha256,
      signaturePayloadSha256: evidence.signaturePayloadSha256,
      evidenceRef: evidence.evidenceRef,
      evidenceSha256: evidence.evidenceSha256,
      signerUserId: evidence.signerUserId,
      declaredSignedAt: evidence.declaredSignedAt.toISOString(),
      /** R1-04: the exact scope-specific authority request for this target. */
      operatorAuthority: operatorAuthorityRequest({
        action: "verify_signature",
        agreement: version,
        draft: null,
        engagement,
        evidence,
        operator,
        project,
      }),
    };
  });
}

export type RecordSignatureVerificationInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  evidenceId: string;
  outcome: ServiceSignatureVerificationOutcome;
  /** Canonical hash of the authority request the operator decision was made about. */
  authorityRequestSha256: string;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

/**
 * Persist a verifier-port outcome. The outcome must echo the exact evidence,
 * agreement version and payload hash it was computed over; a mismatched or
 * reused outcome is an integrity conflict, never a verification.
 */
function runRecordSignatureVerification(
  database: Database,
  input: RecordSignatureVerificationInput
) {
  if (input.outcome.status === "unavailable") {
    throw new ServiceEngagementError("verification_unavailable");
  }
  const outcome = input.outcome;
  return database.transaction(async (tx) => {
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "service_engagement_signature_verify",
      requestHash: input.requestHash,
      resultId: input.evidenceId,
      resultKind: "service_signature_evidence",
    });
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const operator = await loadOperatorEligibility(
      tx,
      project.id,
      accounts.get(input.actorUserId)
    );
    const [evidence] = await tx
      .select()
      .from(serviceSignatureEvidence)
      .where(
        and(
          eq(serviceSignatureEvidence.id, input.evidenceId),
          eq(serviceSignatureEvidence.engagementId, engagement.id)
        )
      )
      .for("update")
      .limit(1);
    if (!evidence) {
      notFound();
    }
    if (evidence.signerUserId === input.actorUserId) {
      throw new ServiceEngagementError("forbidden");
    }
    const [version] = await tx
      .select()
      .from(serviceAgreementVersion)
      .where(
        and(
          eq(serviceAgreementVersion.id, evidence.agreementVersionId),
          eq(serviceAgreementVersion.engagementId, engagement.id)
        )
      )
      .limit(1);
    if (!version) {
      throw new ServiceEngagementError("integrity_conflict");
    }
    // R1-04: the recorded outcome must belong to the exact evidence/version the
    // operator authority decided about, under a current assignment.
    assertOperatorAuthorityBinding({
      action: "verify_signature",
      agreement: version,
      draft: null,
      engagement,
      evidence,
      expectedSha256: input.authorityRequestSha256,
      operator,
      project,
    });
    if (operation.replayed) {
      return {
        replayed: true,
        projectRevision: project.revision,
        engagementRevision: engagement.revision,
        signatureEvidence: evidenceView(evidence),
      };
    }
    if (
      outcome.evidenceId !== evidence.id ||
      outcome.agreementVersionId !== evidence.agreementVersionId ||
      outcome.signaturePayloadSha256 !== evidence.signaturePayloadSha256 ||
      !(SERVICE_SIGNATURE_VERIFICATION_METHODS as readonly string[]).includes(
        outcome.method
      )
    ) {
      throw new ServiceEngagementError("integrity_conflict");
    }
    if (evidence.verificationStatus !== "pending") {
      throw new ServiceEngagementError("state_conflict");
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServiceEngagementError("revision_conflict");
    }
    const now = new Date();
    const nextRevision = await advanceProject(tx, project, now);
    const rejected = outcome.status === "rejected";
    const reasonCode = rejected ? outcome.reasonCode.slice(0, 64) : null;
    await tx
      .update(serviceSignatureEvidence)
      .set({
        verificationStatus: rejected ? "rejected" : "verified",
        verificationMethod: outcome.method,
        verificationProviderCode: outcome.providerCode.slice(0, 64),
        verificationProvenance: outcome.provenance.slice(0, 256),
        verifiedAt: now,
        verificationProjectRevision: nextRevision,
        verificationOperationRecordId: operation.id,
        rejectionReasonCode: reasonCode,
      })
      .where(eq(serviceSignatureEvidence.id, evidence.id));
    await tx
      .update(serviceEngagement)
      .set({
        revision: engagement.revision + 1,
        lastProjectRevision: nextRevision,
        lastOperationRecordId: operation.id,
        updatedAt: now,
      })
      .where(eq(serviceEngagement.id, engagement.id));
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: input.actorUserId,
      projectRevision: nextRevision,
      eventType: rejected
        ? "service_engagement_signature_evidence_rejected"
        : "service_engagement_signature_evidence_verified",
      subjectKind: "service_signature_evidence",
      subjectId: evidence.id,
      operationRecordId: operation.id,
      createdAt: now,
    });
    return {
      replayed: false,
      projectRevision: nextRevision,
      engagementRevision: engagement.revision + 1,
      signatureEvidence: {
        ...evidenceView(evidence),
        verificationStatus: rejected ? "rejected" : "verified",
        verificationMethod: outcome.method,
        verifiedAt: now.toISOString(),
        rejectionReasonCode: reasonCode,
      } satisfies ServiceSignatureEvidenceView,
    };
  });
}

export type TransitionEngagementInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  action: ServiceEngagementLifecycleAction;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

const lifecycleOperationTypes: Record<
  ServiceEngagementLifecycleAction,
  OperationType
> = {
  activate: "service_engagement_activate",
  suspend: "service_engagement_suspend",
  resume: "service_engagement_resume",
  terminate: "service_engagement_terminate",
};

const lifecycleEventTypes: Record<
  ServiceEngagementLifecycleAction,
  ProjectEvent["eventType"]
> = {
  activate: "service_engagement_activated",
  suspend: "service_engagement_suspended",
  resume: "service_engagement_resumed",
  terminate: "service_engagement_terminated",
};

/**
 * Recompute every activation predicate from persisted rows: the exact current
 * issued agreement version, the customer acceptance of that hash, and — for
 * managed service — verified signature evidence for that exact version.
 */
async function assertActivationEligible(
  tx: Transaction,
  engagement: EngagementRow,
  project: ProjectRow
) {
  if (!engagement.currentAgreementVersionId) {
    throw new ServiceEngagementError("state_conflict");
  }
  const [version] = await tx
    .select()
    .from(serviceAgreementVersion)
    .where(
      and(
        eq(serviceAgreementVersion.id, engagement.currentAgreementVersionId),
        eq(serviceAgreementVersion.engagementId, engagement.id)
      )
    )
    .for("update")
    .limit(1);
  if (!version || version.status !== "issued") {
    throw new ServiceEngagementError("state_conflict");
  }
  const [acceptance] = await tx
    .select({ id: serviceAgreementAcceptance.id })
    .from(serviceAgreementAcceptance)
    .where(
      and(
        eq(serviceAgreementAcceptance.agreementVersionId, version.id),
        eq(serviceAgreementAcceptance.termsSha256, version.termsSha256),
        eq(serviceAgreementAcceptance.acceptedByUserId, project.ownerUserId)
      )
    )
    .limit(1);
  if (!acceptance) {
    throw new ServiceEngagementError("state_conflict");
  }
  if (
    serviceActivationRequiresVerifiedSignature(
      engagement.serviceMode as ServiceEngagementMode
    )
  ) {
    const [verified] = await tx
      .select({ id: serviceSignatureEvidence.id })
      .from(serviceSignatureEvidence)
      .where(
        and(
          eq(serviceSignatureEvidence.agreementVersionId, version.id),
          eq(serviceSignatureEvidence.engagementId, engagement.id),
          eq(serviceSignatureEvidence.signerUserId, project.ownerUserId),
          eq(serviceSignatureEvidence.verificationStatus, "verified"),
          eq(serviceSignatureEvidence.termsSha256, version.termsSha256)
        )
      )
      .limit(1);
    if (!verified) {
      // Fail closed: no managed activation without independently verified
      // signature evidence for this exact version.
      throw new ServiceEngagementError("authority_denied");
    }
  }
}

function runTransitionEngagement(
  database: Database,
  input: TransitionEngagementInput
) {
  const targetStatus = serviceLifecycleTargetStatus(input.action);
  return database.transaction(async (tx) => {
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: lifecycleOperationTypes[input.action],
      requestHash: input.requestHash,
      resultId: input.engagementId,
      resultKind: "service_engagement",
    });
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    if (!isProjectOwner(accounts.get(input.actorUserId), project)) {
      notFound();
    }
    if (operation.replayed) {
      return {
        replayed: true,
        projectRevision: project.revision,
        engagement: await loadOwnerEngagementView(tx, engagement),
      };
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServiceEngagementError("revision_conflict");
    }
    const currentStatus = engagement.status as ServiceEngagementStatus;
    if (
      !serviceLifecycleSourceStatuses(input.action).includes(currentStatus) ||
      !serviceEngagementTransitionAllowed(currentStatus, targetStatus)
    ) {
      throw new ServiceEngagementError("state_conflict");
    }
    if (input.action === "activate" || input.action === "resume") {
      await assertActivationEligible(tx, engagement, project);
    }
    const now = new Date();
    const nextRevision = await advanceProject(tx, project, now);
    const reactivating =
      input.action === "activate" || input.action === "resume";
    const [updated] = await tx
      .update(serviceEngagement)
      .set({
        status: targetStatus,
        revision: engagement.revision + 1,
        lastProjectRevision: nextRevision,
        lastOperationRecordId: operation.id,
        activatedAt: reactivating ? (engagement.activatedAt ?? now) : null,
        activatedProjectRevision: reactivating
          ? (engagement.activatedProjectRevision ?? nextRevision)
          : null,
        suspendedAt:
          input.action === "suspend"
            ? now
            : input.action === "resume"
              ? null
              : null,
        terminatedAt: input.action === "terminate" ? now : null,
        terminalReasonCode:
          input.action === "terminate" ? "owner_terminated" : null,
        updatedAt: now,
      })
      .where(eq(serviceEngagement.id, engagement.id))
      .returning();
    if (!updated) {
      throw new ServiceEngagementError("integrity_conflict");
    }
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: project.ownerUserId,
      projectRevision: nextRevision,
      eventType: lifecycleEventTypes[input.action],
      subjectKind: "service_engagement",
      subjectId: engagement.id,
      operationRecordId: operation.id,
      createdAt: now,
    });
    return {
      replayed: false,
      projectRevision: nextRevision,
      engagement: await loadOwnerEngagementView(tx, updated),
    };
  });
}

async function isActiveProjectParticipant(
  tx: Transaction,
  project: ProjectRow,
  account: Account | undefined
) {
  if (!currentAccount(account) || account.role !== "user") {
    return false;
  }
  if (account.id === project.ownerUserId) {
    return true;
  }
  const [membership] = await tx
    .select({ id: projectMembership.id })
    .from(projectMembership)
    .where(
      and(
        eq(projectMembership.projectId, project.id),
        eq(projectMembership.userId, account.id),
        eq(projectMembership.status, "active")
      )
    )
    .limit(1);
  return Boolean(membership);
}

/**
 * R2-01: the single recipient-metadata predicate shared by the Grant list and the
 * Grant detail, so the two authorization paths cannot drift. Every clause is
 * re-evaluated from current state:
 *
 *   eligible verified lawyer account + current active assignment for this exact
 *   recipient account + still-granted, unexpired grant + a resource owner that is
 *   still an eligible Project participant.
 *
 * A `false` result means the recipient must not receive the Grant object at all
 * (not even an access DENY that quotes it).
 */
function recipientGrantMetadataEligible(input: {
  now: Date;
  project: ProjectRow;
  actor: Account | undefined;
  assignment: AssignmentRow | null;
  grant: GrantRow;
  resourceOwnerEligible: boolean;
}) {
  const { actor, assignment, grant, now, project } = input;
  if (!isEligibleStaff(actor)) {
    return false;
  }
  if (grant.projectId !== project.id || grant.recipientUserId !== actor.id) {
    return false;
  }
  if (
    !assignment ||
    assignment.id !== grant.recipientAssignmentId ||
    assignment.projectId !== project.id ||
    assignment.staffUserId !== actor.id ||
    assignment.purpose !== "project_staff_collaboration" ||
    assignment.status !== "active" ||
    assignment.staffEmailSha256 !== hashStaffEmail(actor.email)
  ) {
    return false;
  }
  if (grant.status !== "granted") {
    return false;
  }
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return input.resourceOwnerEligible;
}

/**
 * Batched equivalent of `isActiveProjectParticipant` for the *resource owner* of a
 * disclosure grant, expressed as SQL so the recipient list can select exactly the
 * first `limit + 1` authorized rows instead of filtering an arbitrary window after
 * `LIMIT` (FIX-04). The guest prefix mirrors `guestRegex` through a single shared
 * constant, and the JavaScript predicate is still applied afterwards as defense in
 * depth.
 */
function recipientGrantOwnerEligibilitySql(project: ProjectRow) {
  const grant = projectResourceDisclosureGrant;
  return and(
    sql`exists (
      select 1 from "User" owner_account
      where owner_account."id" = ${grant.resourceOwnerUserId}
        and owner_account."role" = 'user'
        and btrim(owner_account."email") <> ''
        and owner_account."email" !~* ${SERVICE_GUEST_EMAIL_SQL_REGEX}
    )`,
    or(
      eq(grant.resourceOwnerUserId, project.ownerUserId),
      sql`exists (
        select 1 from "ProjectMembership" owner_membership
        where owner_membership."projectId" = ${grant.projectId}
          and owner_membership."userId" = ${grant.resourceOwnerUserId}
          and owner_membership."status" = 'active'
      )`
    )
  );
}

export type CreateDisclosureGrantInput = {
  actorUserId: string;
  projectId: string;
  assignmentId: string;
  resourceCategory: string;
  resourceId: string;
  resourceVersion: number;
  purposeCode: string;
  expiresAt: Date | null;
  resource: ProjectResourceSnapshot;
  /** Adapter code that produced the observation (R1-05). */
  observationAdapterCode: string;
  /** Canonical hash of the exact observation the caller authorized (R1-05). */
  resourceObservationSha256: string;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

/**
 * Create a single-resource disclosure grant. The actual resource owner must act,
 * the recipient is derived from the active staff assignment (never supplied by
 * the caller) and the exact resource version must match the resolved source
 * snapshot.
 */
function runCreateDisclosureGrant(
  database: Database,
  input: CreateDisclosureGrantInput,
  deps: RepositoryDeps
) {
  const grantId = randomUUID();
  return database.transaction(async (tx) => {
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "project_resource_disclosure_grant_create",
      requestHash: input.requestHash,
      resultId: grantId,
      resultKind: "project_resource_disclosure_grant",
    });
    const project = await lockProject(tx, input.projectId);
    const [assignment] = await tx
      .select()
      .from(projectStaffAssignment)
      .where(
        and(
          eq(projectStaffAssignment.id, input.assignmentId),
          eq(projectStaffAssignment.projectId, project.id)
        )
      )
      .for("update")
      .limit(1);
    if (!assignment) {
      notFound();
    }
    const accounts = await lockAccounts(tx, [
      input.actorUserId,
      assignment.staffUserId,
    ]);
    const actor = accounts.get(input.actorUserId);
    if (!(await isActiveProjectParticipant(tx, project, actor))) {
      notFound();
    }
    if (operation.replayed) {
      const [existing] = await tx
        .select()
        .from(projectResourceDisclosureGrant)
        .where(eq(projectResourceDisclosureGrant.id, operation.resultId))
        .limit(1);
      if (
        !existing ||
        existing.projectId !== project.id ||
        existing.resourceOwnerUserId !== input.actorUserId
      ) {
        throw new ServiceEngagementError("integrity_conflict");
      }
      return {
        replayed: true,
        projectRevision: project.revision,
        grant: grantView(existing),
      };
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServiceEngagementError("revision_conflict");
    }
    if (
      assignment.status !== "active" ||
      assignment.purpose !== "project_staff_collaboration"
    ) {
      throw new ServiceEngagementError("state_conflict");
    }
    if (
      !input.resource.found ||
      input.resource.projectId !== project.id ||
      input.resource.ownerUserId !== input.actorUserId ||
      input.resource.version !== input.resourceVersion ||
      input.resource.category !== input.resourceCategory ||
      !RESOURCE_FINGERPRINT_PATTERN.test(input.resource.fingerprint)
    ) {
      throw new ServiceEngagementError("resource_unavailable");
    }
    // R1-05: the persisted grant is bound to one reproducible observation.
    const expectedObservation = hashServiceResourceObservation({
      adapterCode: input.observationAdapterCode,
      projectId: project.id,
      resourceCategory: input.resourceCategory,
      resourceFingerprint: input.resource.fingerprint,
      resourceId: input.resourceId,
      resourceOwnerUserId: input.actorUserId,
      resourceVersion: input.resourceVersion,
    });
    if (expectedObservation !== input.resourceObservationSha256) {
      throw new ServiceEngagementError("integrity_conflict");
    }
    // R1-05: re-read the resource inside this transaction. Without a reviewed
    // adapter revalidator the write path fails closed, because a version/owner
    // observation taken before the lock can already be stale.
    if (!deps.resourceRevalidator) {
      throw new ServiceEngagementError("resource_unavailable");
    }
    const revalidated = await deps.resourceRevalidator.revalidate({
      projectId: project.id,
      resourceCategory: input.resourceCategory,
      resourceId: input.resourceId,
      resourceOwnerUserId: input.actorUserId,
      resourceVersion: input.resourceVersion,
      resourceFingerprint: input.resource.fingerprint,
    });
    if (
      !revalidated.found ||
      revalidated.version !== input.resourceVersion ||
      revalidated.ownerUserId !== input.actorUserId ||
      revalidated.projectId !== project.id ||
      revalidated.fingerprint !== input.resource.fingerprint
    ) {
      throw new ServiceEngagementError("state_conflict");
    }
    const now = new Date();
    if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
      throw new ServiceEngagementError("invalid_request");
    }
    const nextRevision = await advanceProject(tx, project, now);
    await tx.insert(projectResourceDisclosureGrant).values({
      id: grantId,
      projectId: project.id,
      resourceOwnerUserId: input.actorUserId,
      recipientAssignmentId: assignment.id,
      recipientUserId: assignment.staffUserId,
      resourceCategory: input.resourceCategory,
      resourceId: input.resourceId,
      resourceVersion: input.resourceVersion,
      resourceFingerprint: input.resource.fingerprint,
      purposeCode: input.purposeCode,
      noticeVersion: PROJECT_RESOURCE_DISCLOSURE_NOTICE_VERSION,
      noticeSha256: PROJECT_RESOURCE_DISCLOSURE_NOTICE_SHA256,
      status: "granted",
      grantedByUserId: input.actorUserId,
      grantedAt: now,
      grantedProjectRevision: nextRevision,
      createdOperationRecordId: operation.id,
      expiresAt: input.expiresAt,
    });
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: input.actorUserId,
      projectRevision: nextRevision,
      eventType: "project_resource_disclosure_granted",
      subjectKind: "project_resource_disclosure_grant",
      subjectId: grantId,
      operationRecordId: operation.id,
      createdAt: now,
    });
    return {
      replayed: false,
      projectRevision: nextRevision,
      grant: {
        grantId,
        projectId: project.id,
        resourceOwnerUserId: input.actorUserId,
        recipientAssignmentId: assignment.id,
        recipientUserId: assignment.staffUserId,
        resourceCategory: input.resourceCategory,
        resourceId: input.resourceId,
        resourceVersion: input.resourceVersion,
        resourceFingerprint: input.resource.fingerprint,
        purposeCode: input.purposeCode,
        noticeVersion: PROJECT_RESOURCE_DISCLOSURE_NOTICE_VERSION,
        status: "granted",
        grantedAt: now.toISOString(),
        expiresAt: iso(input.expiresAt),
        revokedAt: null,
        revocationReasonCode: null,
      } satisfies ProjectResourceDisclosureGrantView,
    };
  });
}

export type ListDisclosureGrantsInput = {
  actorUserId: string;
  projectId: string;
  limit: number;
};

/**
 * Owner view lists the grants the actor owns. Staff view lists only currently
 * granted disclosures addressed to their own active assignment.
 */
function runListDisclosureGrants(
  database: Database,
  input: ListDisclosureGrantsInput
) {
  return database.transaction(async (tx) => {
    const project = await readActiveProject(tx, input.projectId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const actor = accounts.get(input.actorUserId);
    if (await isActiveProjectParticipant(tx, project, actor)) {
      const rows = await tx
        .select()
        .from(projectResourceDisclosureGrant)
        .where(
          and(
            eq(projectResourceDisclosureGrant.projectId, project.id),
            eq(
              projectResourceDisclosureGrant.resourceOwnerUserId,
              input.actorUserId
            )
          )
        )
        .orderBy(
          desc(projectResourceDisclosureGrant.grantedAt),
          desc(projectResourceDisclosureGrant.id)
        )
        .limit(input.limit + 1);
      return {
        scope: "resource_owner" as const,
        items: rows.slice(0, input.limit).map(grantView),
        hasMore: rows.length > input.limit,
      };
    }
    const assignment = actor
      ? await activeStaffAssignment(tx, project.id, actor.id, actor)
      : null;
    if (!assignment) {
      notFound();
    }
    // R2-01/FIX-04: the recipient list applies the *same* predicate as the detail
    // read. Owner/account eligibility is pushed into SQL so the query returns the
    // first `limit + 1` *authorized* rows in the canonical order — a page can no
    // longer be shortened, or `hasMore` misreported, because unauthorized rows sort
    // ahead of valid ones. The shared JavaScript predicate still runs afterwards as
    // defense in depth, and `hasMore` is derived only from surviving rows.
    const now = new Date();
    const rows = await tx
      .select()
      .from(projectResourceDisclosureGrant)
      .where(
        and(
          eq(projectResourceDisclosureGrant.projectId, project.id),
          eq(
            projectResourceDisclosureGrant.recipientUserId,
            assignment.staffUserId
          ),
          eq(
            projectResourceDisclosureGrant.recipientAssignmentId,
            assignment.id
          ),
          eq(projectResourceDisclosureGrant.status, "granted"),
          or(
            isNull(projectResourceDisclosureGrant.expiresAt),
            gt(projectResourceDisclosureGrant.expiresAt, now)
          ),
          recipientGrantOwnerEligibilitySql(project)
        )
      )
      .orderBy(
        desc(projectResourceDisclosureGrant.grantedAt),
        desc(projectResourceDisclosureGrant.id)
      )
      .limit(input.limit + 1);
    const visible = rows.filter((grant) =>
      recipientGrantMetadataEligible({
        actor,
        assignment,
        grant,
        now,
        project,
        resourceOwnerEligible: true,
      })
    );
    // `hasMore` is derived from authorized rows only: an unauthorized grant can
    // never inflate a page or signal that more metadata exists.
    return {
      scope: "recipient" as const,
      items: visible.slice(0, input.limit).map(grantView),
      hasMore: visible.length > input.limit,
    };
  });
}

export type LoadDisclosureAccessContextInput = {
  actorUserId: string;
  projectId: string;
  grantId: string;
};

/**
 * R1-02: disclosure metadata authorization is separate from the access decision.
 *
 * - A current recipient receives grant metadata only while every element of its
 *   current authorization still holds (active assignment for this exact
 *   recipient account, eligible verified staff account, still-granted and not
 *   expired grant). A former recipient gets nothing: the grant record itself is
 *   protected metadata.
 * - The resource owner keeps a read-only audit view of the grants they created,
 *   including revoked/expired grants and after they leave the Project. Audit never
 *   returns content and never authorizes the recipient.
 *
 * A DENY decision from the evaluator never authorizes returning the Grant object;
 * `metadataAuthorized` is computed independently from current state.
 */
export const DISCLOSURE_METADATA_POLICY_CODES = [
  "m4-004-resource-owner-audit",
  "m4-004-recipient-current-access",
] as const;
export type DisclosureMetadataPolicyCode =
  (typeof DISCLOSURE_METADATA_POLICY_CODES)[number];

export type DisclosureAccessRole = "resource_owner_audit" | "recipient_current";

function runLoadDisclosureAccessContext(
  database: Database,
  input: LoadDisclosureAccessContextInput
) {
  return database.transaction(async (tx) => {
    const project = await readActiveProject(tx, input.projectId);
    const [grant] = await tx
      .select()
      .from(projectResourceDisclosureGrant)
      .where(
        and(
          eq(projectResourceDisclosureGrant.id, input.grantId),
          eq(projectResourceDisclosureGrant.projectId, project.id)
        )
      )
      .limit(1);
    if (!grant) {
      notFound();
    }
    const [assignment] = await tx
      .select()
      .from(projectStaffAssignment)
      .where(
        and(
          eq(projectStaffAssignment.id, grant.recipientAssignmentId),
          eq(projectStaffAssignment.projectId, project.id)
        )
      )
      .limit(1);
    const accounts = await lockAccounts(tx, [
      input.actorUserId,
      grant.recipientUserId,
      grant.resourceOwnerUserId,
    ]);
    const actor = accounts.get(input.actorUserId);
    if (!actor || !currentAccount(actor)) {
      notFound();
    }
    const now = new Date();
    // R1-03: current eligibility of the Grant's own resource owner. A revoked
    // membership invalidates the grant even before anyone tries to read it.
    const resourceOwnerEligible = await isActiveProjectParticipant(
      tx,
      project,
      accounts.get(grant.resourceOwnerUserId)
    );
    const isResourceOwner = actor.id === grant.resourceOwnerUserId;
    const actorEmailSha256 = hashStaffEmail(actor.email);
    // R2-01: detail and list share one predicate, so this branch cannot authorize
    // metadata that the list would withhold (or vice versa).
    const recipientCurrent =
      actor.id === grant.recipientUserId &&
      recipientGrantMetadataEligible({
        actor,
        assignment,
        grant,
        now,
        project,
        resourceOwnerEligible,
      });
    const accessRole: DisclosureAccessRole | null = isResourceOwner
      ? "resource_owner_audit"
      : recipientCurrent
        ? "recipient_current"
        : null;
    if (!accessRole) {
      // Former recipient, revoked assignment, ineligible account, revoked or
      // expired grant: no protected grant metadata is disclosed.
      notFound();
    }
    const metadataPolicyCode: DisclosureMetadataPolicyCode =
      accessRole === "resource_owner_audit"
        ? "m4-004-resource-owner-audit"
        : "m4-004-recipient-current-access";
    return {
      projectActive: true,
      accessRole,
      metadataAuthorized: true,
      metadataPolicyCode,
      resourceOwnerEligible,
      grant: disclosureGrantSnapshot(grant),
      assignment: assignment ? disclosureAssignmentSnapshot(assignment) : null,
      actor: {
        userId: actor.id,
        role: actor.role,
        nonGuest: currentAccount(actor),
        emailVerified: Boolean(actor.emailVerifiedAt),
        staffEmailSha256: actorEmailSha256,
      },
      requested: {
        resourceCategory: grant.resourceCategory,
        resourceId: grant.resourceId,
        resourceVersion: grant.resourceVersion,
        purposeCode: grant.purposeCode,
      },
    };
  });
}

export type RevokeDisclosureGrantInput = {
  actorUserId: string;
  projectId: string;
  grantId: string;
  reasonCode: string;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

/**
 * Revocation is owned by the resource owner, is append-only and takes effect for
 * every subsequent evaluation. Previously viewed material cannot be recalled.
 */
function runRevokeDisclosureGrant(
  database: Database,
  input: RevokeDisclosureGrantInput
) {
  if (
    !(DISCLOSURE_REVOCATION_REASON_CODES as readonly string[]).includes(
      input.reasonCode
    )
  ) {
    throw new ServiceEngagementError("invalid_request");
  }
  return database.transaction(async (tx) => {
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "project_resource_disclosure_grant_revoke",
      requestHash: input.requestHash,
      resultId: input.grantId,
      resultKind: "project_resource_disclosure_grant",
    });
    const project = await lockProject(tx, input.projectId);
    const [grant] = await tx
      .select()
      .from(projectResourceDisclosureGrant)
      .where(
        and(
          eq(projectResourceDisclosureGrant.id, input.grantId),
          eq(projectResourceDisclosureGrant.projectId, project.id)
        )
      )
      .for("update")
      .limit(1);
    if (!grant) {
      notFound();
    }
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const actor = accounts.get(input.actorUserId);
    if (grant.resourceOwnerUserId !== input.actorUserId) {
      // Not the recorded resource owner: do not confirm that the grant exists.
      notFound();
    }
    if (!(await isActiveProjectParticipant(tx, project, actor))) {
      // R1-03: the recorded owner may no longer revoke after losing Project
      // eligibility. General Project access is deliberately not restored to
      // solve this; a former member needs a separately approved administrative
      // procedure, which does not exist yet.
      throw new ServiceEngagementError("forbidden");
    }
    if (operation.replayed) {
      return {
        replayed: true,
        projectRevision: project.revision,
        grant: grantView(grant),
      };
    }
    if (grant.status !== "granted") {
      throw new ServiceEngagementError("state_conflict");
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServiceEngagementError("revision_conflict");
    }
    const now = new Date();
    const nextRevision = await advanceProject(tx, project, now);
    const nextStatus =
      input.reasonCode === "owner_expired" ? "expired" : "revoked";
    const [updated] = await tx
      .update(projectResourceDisclosureGrant)
      .set({
        status: nextStatus,
        revokedByUserId: input.actorUserId,
        revokedAt: now,
        revokedProjectRevision: nextRevision,
        revokedOperationRecordId: operation.id,
        revocationReasonCode: input.reasonCode,
      })
      .where(eq(projectResourceDisclosureGrant.id, grant.id))
      .returning();
    if (!updated) {
      throw new ServiceEngagementError("integrity_conflict");
    }
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: input.actorUserId,
      projectRevision: nextRevision,
      eventType: "project_resource_disclosure_revoked",
      subjectKind: "project_resource_disclosure_grant",
      subjectId: grant.id,
      operationRecordId: operation.id,
      createdAt: now,
    });
    return {
      replayed: false,
      projectRevision: nextRevision,
      grant: grantView(updated),
    };
  });
}

/** Repository surface consumed by the HTTP handlers and future adapters. */
export function createServiceEngagementRepository(
  options: { database?: Database } & Partial<RepositoryDeps> = {}
) {
  const database = options.database ?? db;
  const deps: RepositoryDeps = {
    resourceRevalidator: options.resourceRevalidator ?? null,
  };
  return {
    createEngagement: (input: CreateEngagementInput) =>
      runCreateEngagement(database, input),
    listEngagements: (input: ListEngagementsInput) =>
      runListEngagements(database, input),
    getEngagement: (input: GetEngagementInput) =>
      runGetEngagement(database, input),
    createAgreementVersion: (input: CreateAgreementVersionInput) =>
      runCreateAgreementVersion(database, input),
    issueAgreementVersion: (input: IssueAgreementVersionInput) =>
      runIssueAgreementVersion(database, input),
    acceptAgreementVersion: (input: AcceptAgreementVersionInput) =>
      runAcceptAgreementVersion(database, input),
    submitSignatureEvidence: (input: SubmitSignatureEvidenceInput) =>
      runSubmitSignatureEvidence(database, input),
    loadServiceOperatorContext: (input: LoadServiceOperatorContextInput) =>
      runLoadServiceOperatorContext(database, input),
    loadSignatureVerificationTarget: (
      input: LoadSignatureVerificationTargetInput
    ) => runLoadSignatureVerificationTarget(database, input),
    recordSignatureVerification: (input: RecordSignatureVerificationInput) =>
      runRecordSignatureVerification(database, input),
    transitionEngagement: (input: TransitionEngagementInput) =>
      runTransitionEngagement(database, input),
    createDisclosureGrant: (input: CreateDisclosureGrantInput) =>
      runCreateDisclosureGrant(database, input, deps),
    listDisclosureGrants: (input: ListDisclosureGrantsInput) =>
      runListDisclosureGrants(database, input),
    loadDisclosureAccessContext: (input: LoadDisclosureAccessContextInput) =>
      runLoadDisclosureAccessContext(database, input),
    revokeDisclosureGrant: (input: RevokeDisclosureGrantInput) =>
      runRevokeDisclosureGrant(database, input),
  };
}

export const serviceEngagementRepository = createServiceEngagementRepository();
