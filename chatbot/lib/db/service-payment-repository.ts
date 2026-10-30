import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { hashStaffEmail } from "@/lib/project-staff-assignments/policy";
import {
  denyAllServicePaymentStatusReadAuthority,
  hashServicePaymentContractAuthorityRequest,
  hashServicePaymentFinanceAuthorityRequest,
  SERVICE_PAYMENT_FINANCE_ACTION_BY_RESOLUTION,
  type ServicePaymentContractAuthorityRequest,
  type ServicePaymentFinanceAction,
  type ServicePaymentFinanceAuthorityRequest,
  type ServicePaymentStatusReadAuthority,
} from "@/lib/service-payment/authority";
import { ServicePaymentError } from "@/lib/service-payment/errors";
import {
  evaluateServicePaymentFacts,
  hashServicePaymentOperationRequest,
  hashServicePaymentStatusReadRequest,
  isNonGuestServicePaymentAccount,
  isServicePaymentAmountMinor,
  isServicePaymentBasisRef,
  isServicePaymentCurrency,
  isServicePaymentRequirement,
  isServicePaymentVerificationMethod,
  SERVICE_PAYMENT_CUSTOMER_NOTICE_SHA256,
  SERVICE_PAYMENT_CUSTOMER_NOTICE_VERSION,
  SERVICE_PAYMENT_DECLARED_PAID_TIME_FUTURE_SKEW_MS,
  SERVICE_PAYMENT_HISTORY_MAX,
  SERVICE_PAYMENT_POLICY_VERSION,
  SERVICE_PAYMENT_PROVENANCE_MAX,
  type ServicePaymentConditionSnapshot,
  type ServicePaymentContractualBasisCode,
  type ServicePaymentEvaluation,
  type ServicePaymentEvaluationFacts,
  type ServicePaymentEvidenceCategory,
  type ServicePaymentEvidenceStatus,
  type ServicePaymentRequirement,
  type ServicePaymentResolutionKind,
  servicePaymentConditionRequestIdentity,
  servicePaymentEvidenceRequestIdentity,
  servicePaymentRequirementShapes,
  servicePaymentResolutionRequestIdentity,
  servicePaymentResolutionShapeValid,
  servicePaymentVerificationRequestIdentity,
} from "@/lib/service-payment/policy";
import type {
  ServicePaymentEvidenceVerificationInput,
  ServicePaymentVerificationOutcome,
} from "@/lib/service-payment/verification";
import { hashProjectOperationRequest } from "./project-foundation-utils";
import { getLazyDatabase } from "./runtime-client";
import {
  type ProjectEvent,
  projectEvent,
  projectOperation,
  projectStaffAssignment,
  serviceAgreementVersion,
  serviceEngagement,
  servicePaymentCondition,
  servicePaymentEvidence,
  servicePaymentResolution,
  studyJourneyProject,
  user,
} from "./schema";

/** Canonical hash of any M4-005 observation/structure (domain-separated input). */
function hashServicePaymentOperation(value: unknown) {
  return hashProjectOperationRequest(value);
}

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
type ConditionRow = typeof servicePaymentCondition.$inferSelect;
type EvidenceRow = typeof servicePaymentEvidence.$inferSelect;
type ResolutionRow = typeof servicePaymentResolution.$inferSelect;
type AssignmentRow = typeof projectStaffAssignment.$inferSelect;

type OperationType =
  | "service_payment_condition_record"
  | "service_payment_evidence_submit"
  | "service_payment_evidence_verify"
  | "service_payment_resolution_record";

type ResultKind =
  | "service_payment_condition"
  | "service_payment_evidence"
  | "service_payment_resolution";

function notFound(): never {
  throw new ServicePaymentError("not_found");
}

/**
 * Extract the violated unique-constraint name from a PostgreSQL 23505 error without
 * exposing driver internals to callers.
 */
function uniqueViolationConstraint(error: unknown) {
  const value = error as {
    code?: unknown;
    constraint_name?: unknown;
    message?: unknown;
  };
  const code = typeof value?.code === "string" ? value.code : undefined;
  if (code !== "23505") {
    return null;
  }
  return typeof value?.constraint_name === "string"
    ? value.constraint_name
    : typeof value?.message === "string"
      ? (/constraint "([^"]+)"/u.exec(value.message)?.[1] ?? null)
      : null;
}

/**
 * FIX-01 backstop: if a concurrent replacement still wins the live slot, the partial
 * unique index raises 23505. Translate it into a domain state conflict instead of
 * leaking a driver error or retrying blindly.
 */
function isLiveConditionConflict(error: unknown) {
  return (
    uniqueViolationConstraint(error) === "ServicePaymentCondition_live_unique"
  );
}

/**
 * Correction A: two concurrent corrections of the same resolution cannot both
 * commit. The partial unique index on `supersedesResolutionId` is the database
 * guarantee; the loser of the race is reported as a state conflict.
 */
function isCorrectionDuplicateConflict(error: unknown) {
  return (
    uniqueViolationConstraint(error) ===
    "ServicePaymentResolution_superseded_target_unique"
  );
}

function isEligibleStaff(account: Account | undefined): account is Account {
  return Boolean(
    account &&
      isNonGuestServicePaymentAccount(account.email) &&
      account.role === "lawyer" &&
      account.emailVerifiedAt
  );
}

/**
 * Server-derived operator eligibility. A global `lawyer`/`admin` role alone never
 * authorizes anything: an operator must additionally hold a current active M4-002
 * assignment for this exact Project, for the accepted collaboration purpose, with
 * the same verified email the assignment was created for.
 */
type OperatorEligibility = {
  account: Account | undefined;
  assignment: AssignmentRow | null;
  eligible: boolean;
};

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

async function activeStaffAssignment(
  tx: Transaction,
  projectId: string,
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
        eq(projectStaffAssignment.staffUserId, account.id),
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

async function loadOperatorEligibility(
  tx: Transaction,
  projectId: string,
  account: Account | undefined
): Promise<OperatorEligibility> {
  if (!isEligibleStaff(account)) {
    return { account, assignment: null, eligible: false };
  }
  const assignment = await activeStaffAssignment(tx, projectId, account);
  return { account, assignment, eligible: Boolean(assignment) };
}

async function lockCondition(
  tx: Transaction,
  engagement: EngagementRow,
  conditionId: string
) {
  const [condition] = await tx
    .select()
    .from(servicePaymentCondition)
    .where(
      and(
        eq(servicePaymentCondition.id, conditionId),
        eq(servicePaymentCondition.engagementId, engagement.id),
        eq(servicePaymentCondition.projectId, engagement.projectId)
      )
    )
    .for("update")
    .limit(1);
  if (!condition) {
    notFound();
  }
  return condition;
}

type OperationClaim = {
  id: string;
  resultId: string;
  resultKind: string;
  requestHash: string;
  replayed: boolean;
};

/**
 * Claim the actor-scoped ProjectOperation identity. An identical request replays;
 * the same key with a different request hash is an idempotency conflict.
 */
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
): Promise<OperationClaim> {
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
    throw new ServicePaymentError("idempotency_conflict");
  }
  if (existing.resultKind !== input.resultKind) {
    throw new ServicePaymentError("integrity_conflict");
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
    throw new ServicePaymentError("revision_conflict");
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

/* ------------------------------------------------------------------------- *
 * Views
 * ------------------------------------------------------------------------- */

export type ServicePaymentConditionView = {
  conditionId: string;
  agreementVersionId: string;
  agreementTermsSha256: string;
  requirement: ServicePaymentRequirement;
  amountMinor: number | null;
  currency: string | null;
  contractualBasisCode: ServicePaymentContractualBasisCode;
  contractualBasisRef: string | null;
  live: boolean;
  createdAt: string;
  supersededAt: string | null;
};

export type ServicePaymentEvidenceView = {
  evidenceId: string;
  conditionId: string;
  evidenceCategory: ServicePaymentEvidenceCategory;
  declaredAmountMinor: number;
  declaredCurrency: string;
  paidAt: string;
  submittedAt: string;
  verificationStatus: ServicePaymentEvidenceStatus;
  verifiedAt: string | null;
  rejectionReasonCode: string | null;
};

export type ServicePaymentResolutionView = {
  resolutionId: string;
  conditionId: string;
  evidenceId: string | null;
  kind: ServicePaymentResolutionKind;
  reasonCode: string;
  supersedesResolutionId: string | null;
  resolvedAt: string;
};

function conditionView(row: ConditionRow): ServicePaymentConditionView {
  return {
    conditionId: row.id,
    agreementVersionId: row.agreementVersionId,
    agreementTermsSha256: row.agreementTermsSha256,
    requirement: row.requirement as ServicePaymentRequirement,
    amountMinor: row.amountMinor ?? null,
    currency: row.currency ?? null,
    contractualBasisCode:
      row.contractualBasisCode as ServicePaymentContractualBasisCode,
    contractualBasisRef: row.contractualBasisRef ?? null,
    live: row.supersededAt === null,
    createdAt: row.createdAt.toISOString(),
    supersededAt: iso(row.supersededAt),
  };
}

function evidenceView(row: EvidenceRow): ServicePaymentEvidenceView {
  return {
    evidenceId: row.id,
    conditionId: row.conditionId,
    evidenceCategory: row.evidenceCategory as ServicePaymentEvidenceCategory,
    declaredAmountMinor: Number(row.declaredAmountMinor),
    declaredCurrency: row.declaredCurrency,
    paidAt: row.paidAt.toISOString(),
    submittedAt: row.submittedAt.toISOString(),
    verificationStatus: row.verificationStatus as ServicePaymentEvidenceStatus,
    verifiedAt: iso(row.verifiedAt),
    rejectionReasonCode: row.rejectionReasonCode ?? null,
  };
}

function resolutionView(row: ResolutionRow): ServicePaymentResolutionView {
  return {
    resolutionId: row.id,
    conditionId: row.conditionId,
    evidenceId: row.evidenceId ?? null,
    kind: row.resolutionKind as ServicePaymentResolutionKind,
    reasonCode: row.reasonCode,
    supersedesResolutionId: row.supersedesResolutionId ?? null,
    resolvedAt: row.resolvedAt.toISOString(),
  };
}

/* ------------------------------------------------------------------------- *
 * Read path
 * ------------------------------------------------------------------------- */

export type ServicePaymentStatusView = {
  scope: "owner" | "operator";
  engagementId: string;
  engagementStatus: string;
  projectRevision: number;
  condition: ServicePaymentConditionView | null;
  effective: ServicePaymentEvaluation;
  evidences: ServicePaymentEvidenceView[];
  resolutions: ServicePaymentResolutionView[];
  /** Operator-only provenance: which authority port authorized each record. */
  provenance: {
    contractAuthorityCodes: string[];
    financeAuthorityCodes: string[];
    /** Which disclosure authority allowed this staff read (owner reads: null). */
    readAuthorityCode: string | null;
    verificationProviderCodes: string[];
  } | null;
  notice: { version: string; sha256: string };
  policyVersion: string;
  evaluatedAt: string;
};

export type LoadServicePaymentStatusInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
};

/**
 * Display-only history. This window is never used for the effective status: the
 * authoritative projection is computed from complete lineage queries below, so an
 * old VOID/DISPUTE/REFUND/REVERSAL can never fall out of a 50-row page and produce
 * a false SATISFIED or NOT_REQUIRED.
 */
type PaymentHistory = {
  evidences: EvidenceRow[];
  resolutions: ResolutionRow[];
};

async function loadCurrentAgreementTerms(
  tx: Transaction,
  engagement: EngagementRow
) {
  if (!engagement.currentAgreementVersionId) {
    return null;
  }
  const [version] = await tx
    .select({
      id: serviceAgreementVersion.id,
      termsSha256: serviceAgreementVersion.termsSha256,
      status: serviceAgreementVersion.status,
    })
    .from(serviceAgreementVersion)
    .where(
      and(
        eq(serviceAgreementVersion.id, engagement.currentAgreementVersionId),
        eq(serviceAgreementVersion.engagementId, engagement.id)
      )
    )
    .limit(1);
  if (!version || version.status !== "issued") {
    return null;
  }
  return version.termsSha256;
}

function toConditionSnapshot(
  row: ConditionRow | null
): ServicePaymentConditionSnapshot | null {
  if (!row) {
    return null;
  }
  return {
    conditionId: row.id,
    requirement: row.requirement as ServicePaymentRequirement,
    amountMinor: row.amountMinor ?? null,
    currency: row.currency ?? null,
    agreementVersionId: row.agreementVersionId,
    agreementTermsSha256: row.agreementTermsSha256,
    supersededAt: iso(row.supersededAt),
  };
}

/**
 * FIX-03: the live condition is selected by authoritative lifecycle state
 * (`supersededAt IS NULL`), never by timestamp ordering alone. When no condition is
 * live the newest historical record is returned so the owner can still see why.
 */
async function loadCurrentCondition(
  tx: Transaction,
  engagement: EngagementRow
) {
  const [live] = await tx
    .select()
    .from(servicePaymentCondition)
    .where(
      and(
        eq(servicePaymentCondition.engagementId, engagement.id),
        isNull(servicePaymentCondition.supersededAt)
      )
    )
    .limit(1);
  if (live) {
    return live;
  }
  const [latest] = await tx
    .select()
    .from(servicePaymentCondition)
    .where(eq(servicePaymentCondition.engagementId, engagement.id))
    .orderBy(
      desc(servicePaymentCondition.createdAt),
      desc(servicePaymentCondition.id)
    )
    .limit(1);
  return latest ?? null;
}

/**
 * Authoritative evaluation facts (FIX-03).
 *
 * Resolution lineage is loaded in full for the condition and reduced in memory, so
 * correction chains are complete regardless of how much history exists. Evidence
 * support is the newest verified row that matches the condition and is not
 * invalidated by an active resolution; `hasPendingEvidence` is a bounded existence
 * probe. Nothing here is limited to the display-history page size.
 */
async function loadEvaluationFacts(
  tx: Transaction,
  engagement: EngagementRow,
  condition: ConditionRow | null
): Promise<ServicePaymentEvaluationFacts> {
  const common = {
    condition: toConditionSnapshot(condition),
    currentAgreementTermsSha256: await loadCurrentAgreementTerms(
      tx,
      engagement
    ),
    currentAgreementVersionId: engagement.currentAgreementVersionId ?? null,
    engagementStatus: engagement.status,
  };
  if (!condition) {
    return {
      ...common,
      activeResolutionKinds: [],
      hasPendingEvidence: false,
      satisfiedEvidenceId: null,
    };
  }
  const lineage = await tx
    .select({
      evidenceId: servicePaymentResolution.evidenceId,
      id: servicePaymentResolution.id,
      kind: servicePaymentResolution.resolutionKind,
      supersedesResolutionId: servicePaymentResolution.supersedesResolutionId,
    })
    .from(servicePaymentResolution)
    .where(eq(servicePaymentResolution.conditionId, condition.id));
  const supersededResolutionIds = new Set(
    lineage
      .map((row) => row.supersedesResolutionId)
      .filter((value): value is string => Boolean(value))
  );
  const active = lineage.filter((row) => !supersededResolutionIds.has(row.id));
  const invalidatedEvidenceIds = new Set(
    active
      .filter((row) => row.kind !== "void")
      .map((row) => row.evidenceId)
      .filter((value): value is string => Boolean(value))
  );
  const verified = await tx
    .select({
      amountMinor: servicePaymentEvidence.declaredAmountMinor,
      currency: servicePaymentEvidence.declaredCurrency,
      id: servicePaymentEvidence.id,
      verifiedAt: servicePaymentEvidence.verifiedAt,
    })
    .from(servicePaymentEvidence)
    .where(
      and(
        eq(servicePaymentEvidence.conditionId, condition.id),
        eq(servicePaymentEvidence.verificationStatus, "verified")
      )
    )
    .orderBy(
      desc(servicePaymentEvidence.verifiedAt),
      desc(servicePaymentEvidence.id)
    );
  const satisfied = verified.find(
    (row) =>
      !invalidatedEvidenceIds.has(row.id) &&
      row.amountMinor !== null &&
      Number(row.amountMinor) === condition.amountMinor &&
      row.currency === condition.currency
  );
  const [pending] = await tx
    .select({ id: servicePaymentEvidence.id })
    .from(servicePaymentEvidence)
    .where(
      and(
        eq(servicePaymentEvidence.conditionId, condition.id),
        eq(servicePaymentEvidence.verificationStatus, "pending")
      )
    )
    .limit(1);
  return {
    ...common,
    activeResolutionKinds: active.map(
      (row) => row.kind as ServicePaymentResolutionKind
    ),
    hasPendingEvidence: Boolean(pending),
    satisfiedEvidenceId: satisfied?.id ?? null,
  };
}

async function loadPaymentHistory(
  tx: Transaction,
  condition: ConditionRow | null
): Promise<PaymentHistory> {
  if (!condition) {
    return { evidences: [], resolutions: [] };
  }
  const evidences = await tx
    .select()
    .from(servicePaymentEvidence)
    .where(eq(servicePaymentEvidence.conditionId, condition.id))
    .orderBy(
      desc(servicePaymentEvidence.submittedAt),
      desc(servicePaymentEvidence.id)
    )
    .limit(SERVICE_PAYMENT_HISTORY_MAX);
  const resolutions = await tx
    .select()
    .from(servicePaymentResolution)
    .where(eq(servicePaymentResolution.conditionId, condition.id))
    .orderBy(
      desc(servicePaymentResolution.resolvedAt),
      desc(servicePaymentResolution.id)
    )
    .limit(SERVICE_PAYMENT_HISTORY_MAX);
  return { evidences, resolutions };
}

function statusView(input: {
  condition: ConditionRow | null;
  engagement: EngagementRow;
  evaluation: ServicePaymentEvaluation;
  history: PaymentHistory;
  project: ProjectRow;
  readAuthorityCode: string | null;
  scope: "owner" | "operator";
  now: Date;
}): ServicePaymentStatusView {
  const codes =
    input.scope === "operator"
      ? {
          contractAuthorityCodes: input.condition
            ? [input.condition.contractAuthorityCode]
            : [],
          financeAuthorityCodes: input.history.resolutions.map(
            (row) => row.financeAuthorityCode
          ),
          readAuthorityCode: input.readAuthorityCode,
          verificationProviderCodes: input.history.evidences
            .map((row) => row.verificationProviderCode)
            .filter((value): value is string => Boolean(value)),
        }
      : null;
  return {
    scope: input.scope,
    engagementId: input.engagement.id,
    engagementStatus: input.engagement.status,
    projectRevision: input.project.revision,
    condition: input.condition ? conditionView(input.condition) : null,
    effective: input.evaluation,
    evidences: input.history.evidences.map(evidenceView),
    resolutions: input.history.resolutions.map(resolutionView),
    provenance: codes,
    notice: {
      version: SERVICE_PAYMENT_CUSTOMER_NOTICE_VERSION,
      sha256: SERVICE_PAYMENT_CUSTOMER_NOTICE_SHA256,
    },
    policyVersion: SERVICE_PAYMENT_POLICY_VERSION,
    evaluatedAt: input.now.toISOString(),
  };
}

/**
 * Customer-safe (owner) or explicitly authorized staff payment status (FIX-02).
 *
 * - the Project owner always reads their own status;
 * - a staff actor additionally needs a current M4-002 assignment **and** an
 *   explicit action-scoped disclosure decision from the injected read authority;
 * - every other actor receives an existence-hiding `not_found`.
 *
 * The whole read runs in one repeatable-read transaction so the condition, the
 * evidence, the resolution lineage and the contract pointer come from a single
 * consistent snapshot (FIX-03).
 */
function runLoadServicePaymentStatus(
  database: Database,
  input: LoadServicePaymentStatusInput,
  deps: ServicePaymentRepositoryDeps
) {
  return database.transaction(
    async (tx) => {
      const now = new Date();
      const [project] = await tx
        .select()
        .from(studyJourneyProject)
        .where(eq(studyJourneyProject.id, input.projectId))
        .limit(1);
      if (!project || project.status !== "active") {
        notFound();
      }
      const accounts = await lockAccounts(tx, [input.actorUserId]);
      const account = accounts.get(input.actorUserId);
      const isOwner =
        account !== undefined &&
        isNonGuestServicePaymentAccount(account.email) &&
        account.role === "user" &&
        account.id === project.ownerUserId;
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
      const operator = isOwner
        ? null
        : await loadOperatorEligibility(tx, project.id, account);
      if (!isOwner && !operator?.eligible) {
        notFound();
      }
      let readAuthorityCode: string | null = null;
      if (!isOwner) {
        const decision = deps.statusReadAuthority.decide({
          actorUserId: input.actorUserId,
          conditionId: null,
          engagementId: engagement.id,
          projectId: project.id,
          requestSha256: hashServicePaymentStatusReadRequest({
            actorUserId: input.actorUserId,
            engagementId: engagement.id,
            projectId: project.id,
            scope: "operator",
          }),
          scope: "operator",
        });
        if (!decision.allowed) {
          // Existence-hiding: an assigned lawyer without a financial disclosure
          // decision cannot learn that a payment record exists.
          notFound();
        }
        readAuthorityCode = decision.authorityCode;
      }
      const condition = await loadCurrentCondition(tx, engagement);
      const evaluation = evaluateServicePaymentFacts(
        await loadEvaluationFacts(tx, engagement, condition)
      );
      const history = await loadPaymentHistory(tx, condition);
      return statusView({
        condition,
        engagement,
        evaluation,
        history,
        now,
        project,
        readAuthorityCode,
        scope: isOwner ? "owner" : "operator",
      });
    },
    { isolationLevel: "repeatable read" }
  );
}

/* ------------------------------------------------------------------------- *
 * Authority target loaders
 * ------------------------------------------------------------------------- */

export type LoadPaymentContractTargetInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  agreementVersionId: string;
  requirement: ServicePaymentRequirement;
  amountMinor: number | null;
  currency: string | null;
  contractualBasisCode: ServicePaymentContractualBasisCode;
  contractualBasisRef: string | null;
};

export type ServicePaymentContractTarget = {
  contractObservationSha256: string;
  authorityRequest: ServicePaymentContractAuthorityRequest;
};

/**
 * Binds the exact contract facts one condition would assert. The repository
 * recomputes this inside the mutation, so an authority decision about one draft
 * can never authorize a different amount, currency, basis or version.
 */
export function buildContractObservation(input: {
  projectId: string;
  engagementId: string;
  agreementVersionId: string;
  agreementTermsSha256: string;
  requirement: ServicePaymentRequirement;
  amountMinor: number | null;
  currency: string | null;
  contractualBasisCode: ServicePaymentContractualBasisCode;
  contractualBasisRef: string | null;
}) {
  return {
    domain: "phase13_m4_005_contract_observation",
    projectId: input.projectId,
    engagementId: input.engagementId,
    agreementVersionId: input.agreementVersionId,
    agreementTermsSha256: input.agreementTermsSha256,
    requirement: input.requirement,
    amountMinor: input.amountMinor,
    currency: input.currency,
    contractualBasisCode: input.contractualBasisCode,
    contractualBasisRef: input.contractualBasisRef,
  };
}

function buildContractAuthorityRequest(input: {
  actorUserId: string;
  operator: OperatorEligibility;
  project: ProjectRow;
  engagement: EngagementRow;
  agreementVersionId: string;
  agreementTermsSha256: string;
  requirement: ServicePaymentRequirement;
  amountMinor: number | null;
  currency: string | null;
  contractualBasisCode: ServicePaymentContractualBasisCode;
  contractualBasisRef: string | null;
}): {
  observationSha256: string;
  request: ServicePaymentContractAuthorityRequest;
} {
  const observationSha256 = hashServicePaymentOperation(
    buildContractObservation({
      agreementTermsSha256: input.agreementTermsSha256,
      agreementVersionId: input.agreementVersionId,
      amountMinor: input.amountMinor,
      contractualBasisCode: input.contractualBasisCode,
      contractualBasisRef: input.contractualBasisRef,
      currency: input.currency,
      engagementId: input.engagement.id,
      projectId: input.project.id,
      requirement: input.requirement,
    })
  );
  const base: ServicePaymentContractAuthorityRequest = {
    actorUserId: input.actorUserId,
    projectId: input.project.id,
    engagementId: input.engagement.id,
    agreementVersionId: input.agreementVersionId,
    agreementTermsSha256: input.agreementTermsSha256,
    requirement: input.requirement,
    amountMinor: input.amountMinor,
    currency: input.currency,
    contractualBasisCode: input.contractualBasisCode,
    contractualBasisRef: input.contractualBasisRef,
    contractObservationSha256: observationSha256,
    operatorEligible: input.operator.eligible,
    operatorAssignmentId: input.operator.assignment?.id ?? null,
    operatorAssignmentStatus:
      (input.operator.assignment?.status as string | undefined) ?? null,
    requestSha256: "",
  };
  return {
    observationSha256,
    request: {
      ...base,
      requestSha256: hashServicePaymentContractAuthorityRequest(base),
    },
  };
}

function buildFinanceAuthorityRequest(input: {
  actorUserId: string;
  operator: OperatorEligibility;
  project: ProjectRow;
  engagement: EngagementRow;
  action: ServicePaymentFinanceAction;
  condition: ConditionRow;
  evidenceId: string | null;
  observationSha256: string | null;
}): ServicePaymentFinanceAuthorityRequest {
  const base: ServicePaymentFinanceAuthorityRequest = {
    action: input.action,
    actorUserId: input.actorUserId,
    projectId: input.project.id,
    engagementId: input.engagement.id,
    agreementVersionId: input.condition.agreementVersionId,
    agreementTermsSha256: input.condition.agreementTermsSha256,
    conditionId: input.condition.id,
    evidenceId: input.evidenceId,
    amountMinor: input.condition.amountMinor ?? null,
    currency: input.condition.currency ?? null,
    observationSha256: input.observationSha256,
    operatorEligible: input.operator.eligible,
    operatorAssignmentId: input.operator.assignment?.id ?? null,
    operatorAssignmentStatus:
      (input.operator.assignment?.status as string | undefined) ?? null,
    requestSha256: "",
  };
  return {
    ...base,
    requestSha256: hashServicePaymentFinanceAuthorityRequest(base),
  };
}

export type LoadPaymentFinanceTargetInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  action: ServicePaymentFinanceAction;
  conditionId?: string | null;
  evidenceId?: string | null;
  observationSha256?: string | null;
};

export type ServicePaymentFinanceTarget = {
  condition: ServicePaymentConditionView;
  evidence: ServicePaymentEvidenceView | null;
  /**
   * Operator-only canonical verifier input for the exact persisted observation.
   * It carries digests the customer view never exposes.
   */
  verification: ServicePaymentEvidenceVerificationInput | null;
  authorityRequest: ServicePaymentFinanceAuthorityRequest;
};

function runLoadPaymentFinanceTarget(
  database: Database,
  input: LoadPaymentFinanceTargetInput
) {
  return database.transaction(async (tx) => {
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const operator = await loadOperatorEligibility(
      tx,
      project.id,
      accounts.get(input.actorUserId)
    );
    if (!operator.eligible) {
      notFound();
    }
    let evidence: EvidenceRow | null = null;
    if (input.evidenceId) {
      const [row] = await tx
        .select()
        .from(servicePaymentEvidence)
        .where(
          and(
            eq(servicePaymentEvidence.id, input.evidenceId),
            eq(servicePaymentEvidence.engagementId, engagement.id),
            input.conditionId
              ? eq(servicePaymentEvidence.conditionId, input.conditionId)
              : undefined
          )
        )
        .limit(1);
      if (!row) {
        notFound();
      }
      evidence = row;
    }
    const conditionId = input.conditionId ?? evidence?.conditionId ?? null;
    if (!conditionId || (evidence && evidence.conditionId !== conditionId)) {
      throw new ServicePaymentError("invalid_request");
    }
    const condition = await lockCondition(tx, engagement, conditionId);
    if (condition.supersededAt !== null) {
      throw new ServicePaymentError("state_conflict");
    }
    return {
      condition: conditionView(condition),
      evidence: evidence ? evidenceView(evidence) : null,
      verification: evidence
        ? {
            evidenceId: evidence.id,
            conditionId: condition.id,
            projectId: project.id,
            engagementId: engagement.id,
            agreementVersionId: evidence.agreementVersionId,
            agreementTermsSha256: evidence.agreementTermsSha256,
            evidenceCategory:
              evidence.evidenceCategory as ServicePaymentEvidenceCategory,
            referenceSha256: evidence.referenceSha256,
            observationSha256: evidence.observationSha256,
            declaredAmountMinor: Number(evidence.declaredAmountMinor),
            declaredCurrency: evidence.declaredCurrency,
            paidAt: evidence.paidAt.toISOString(),
            requestingActorUserId: input.actorUserId,
          }
        : null,
      authorityRequest: buildFinanceAuthorityRequest({
        action: input.action,
        actorUserId: input.actorUserId,
        condition,
        engagement,
        evidenceId: evidence?.id ?? null,
        observationSha256: input.observationSha256 ?? null,
        operator,
        project,
      }),
    } satisfies ServicePaymentFinanceTarget;
  });
}

function assertConditionRequestShape(input: LoadPaymentContractTargetInput) {
  if (
    !isServicePaymentRequirement(input.requirement) ||
    !servicePaymentRequirementShapes({
      amountMinor: input.amountMinor,
      contractualBasisRef: input.contractualBasisRef,
      currency: input.currency,
      requirement: input.requirement,
    }) ||
    (input.contractualBasisRef !== null &&
      !isServicePaymentBasisRef(input.contractualBasisRef))
  ) {
    throw new ServicePaymentError("invalid_request");
  }
}

async function requireCurrentAgreement(
  tx: Transaction,
  engagement: EngagementRow,
  agreementVersionId: string
) {
  const [version] = await tx
    .select()
    .from(serviceAgreementVersion)
    .where(
      and(
        eq(serviceAgreementVersion.id, agreementVersionId),
        eq(serviceAgreementVersion.engagementId, engagement.id)
      )
    )
    .for("share")
    .limit(1);
  if (!version) {
    notFound();
  }
  if (
    version.status !== "issued" ||
    engagement.currentAgreementVersionId !== version.id ||
    !["awaiting_customer_action", "active", "suspended"].includes(
      engagement.status
    )
  ) {
    throw new ServicePaymentError("state_conflict");
  }
  return version;
}

function runLoadPaymentContractTarget(
  database: Database,
  input: LoadPaymentContractTargetInput
) {
  return database.transaction(async (tx) => {
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const operator = await loadOperatorEligibility(
      tx,
      project.id,
      accounts.get(input.actorUserId)
    );
    if (!operator.eligible) {
      notFound();
    }
    assertConditionRequestShape(input);
    const version = await requireCurrentAgreement(
      tx,
      engagement,
      input.agreementVersionId
    );
    const built = buildContractAuthorityRequest({
      actorUserId: input.actorUserId,
      agreementTermsSha256: version.termsSha256,
      agreementVersionId: version.id,
      amountMinor: input.amountMinor,
      contractualBasisCode: input.contractualBasisCode,
      contractualBasisRef: input.contractualBasisRef,
      currency: input.currency,
      engagement,
      operator,
      project,
      requirement: input.requirement,
    });
    return {
      contractObservationSha256: built.observationSha256,
      authorityRequest: built.request,
    } satisfies ServicePaymentContractTarget;
  });
}

/* ------------------------------------------------------------------------- *
 * Mutations
 * ------------------------------------------------------------------------- */

export type RecordPaymentConditionInput = LoadPaymentContractTargetInput & {
  contractObservationSha256: string;
  contractAuthorityCode: string;
  contractAuthorityRequestSha256: string;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

export type RecordPaymentConditionResult = {
  replayed: boolean;
  projectRevision: number;
  condition: ServicePaymentConditionView;
};

/**
 * Record the contractual payment condition for the exact current agreement
 * version. A new condition supersedes the previous live one in the same
 * transaction; nothing is ever edited in place.
 */
function runRecordPaymentCondition(
  database: Database,
  input: RecordPaymentConditionInput
) {
  const conditionId = randomUUID();
  return database.transaction(async (tx) => {
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const operator = await loadOperatorEligibility(
      tx,
      project.id,
      accounts.get(input.actorUserId)
    );
    if (!operator.eligible) {
      // A revoked or unassigned actor can never replay into a write.
      notFound();
    }
    assertConditionRequestShape(input);
    const version = await requireCurrentAgreement(
      tx,
      engagement,
      input.agreementVersionId
    );
    // FIX-05: the request identity is re-derived from the locked target; a caller
    // cannot shorten, broaden or substitute the request it claims to replay.
    const requestHash = hashServicePaymentOperationRequest(
      servicePaymentConditionRequestIdentity({
        agreementTermsSha256: version.termsSha256,
        agreementVersionId: version.id,
        amountMinor: input.amountMinor,
        contractualBasisCode: input.contractualBasisCode,
        contractualBasisRef: input.contractualBasisRef,
        contractAuthorityCode: input.contractAuthorityCode,
        contractObservationSha256: input.contractObservationSha256,
        currency: input.currency,
        engagementId: engagement.id,
        expectedProjectRevision: input.expectedProjectRevision,
        projectId: project.id,
        requirement: input.requirement,
      })
    );
    if (requestHash !== input.requestHash) {
      throw new ServicePaymentError("integrity_conflict");
    }
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "service_payment_condition_record",
      requestHash,
      resultId: conditionId,
      resultKind: "service_payment_condition",
    });
    if (operation.replayed) {
      const [existing] = await tx
        .select()
        .from(servicePaymentCondition)
        .where(eq(servicePaymentCondition.id, operation.resultId))
        .limit(1);
      if (
        !existing ||
        existing.engagementId !== engagement.id ||
        existing.projectId !== project.id
      ) {
        throw new ServicePaymentError("integrity_conflict");
      }
      return {
        condition: conditionView(existing),
        projectRevision: project.revision,
        replayed: true,
      } satisfies RecordPaymentConditionResult;
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServicePaymentError("revision_conflict");
    }
    const built = buildContractAuthorityRequest({
      actorUserId: input.actorUserId,
      agreementTermsSha256: version.termsSha256,
      agreementVersionId: version.id,
      amountMinor: input.amountMinor,
      contractualBasisCode: input.contractualBasisCode,
      contractualBasisRef: input.contractualBasisRef,
      currency: input.currency,
      engagement,
      operator,
      project,
      requirement: input.requirement,
    });
    if (
      built.observationSha256 !== input.contractObservationSha256 ||
      built.request.requestSha256 !== input.contractAuthorityRequestSha256
    ) {
      throw new ServicePaymentError("authority_denied");
    }
    // FIX-01: exactly one live condition per engagement, enforced by a partial
    // unique index. The replacement therefore retires the current row *first* and
    // then inserts the successor, so the live slot is never transiently doubled.
    // The successor pointer is a deferred self-referencing FK and the both-way
    // lineage check is a deferred constraint trigger, so both must agree at COMMIT.
    // Correction C: the replacement target is the authoritative live row
    // (`supersededAt IS NULL`), never "whatever carries the newest timestamp".
    // Historical ordering can therefore never redirect a supersession onto an
    // already-retired record.
    const [live] = await tx
      .select()
      .from(servicePaymentCondition)
      .where(
        and(
          eq(servicePaymentCondition.engagementId, engagement.id),
          isNull(servicePaymentCondition.supersededAt)
        )
      )
      .for("update")
      .limit(1);
    const now = new Date();
    const nextRevision = await advanceProject(tx, project, now);
    if (live) {
      await tx
        .update(servicePaymentCondition)
        .set({
          supersededAt: now,
          supersededByConditionId: conditionId,
          supersededProjectRevision: nextRevision,
          supersededOperationRecordId: operation.id,
        })
        .where(
          and(
            eq(servicePaymentCondition.id, live.id),
            isNull(servicePaymentCondition.supersededAt)
          )
        );
    }
    try {
      await tx.insert(servicePaymentCondition).values({
        id: conditionId,
        projectId: project.id,
        engagementId: engagement.id,
        agreementVersionId: version.id,
        agreementTermsSha256: version.termsSha256,
        requirement: input.requirement,
        amountMinor: input.amountMinor,
        currency: input.currency,
        contractualBasisCode: input.contractualBasisCode,
        contractualBasisRef: input.contractualBasisRef,
        contractObservationSha256: built.observationSha256,
        contractAuthorityCode: input.contractAuthorityCode,
        contractAuthorityRequestSha256: built.request.requestSha256,
        policyVersion: SERVICE_PAYMENT_POLICY_VERSION,
        createdByUserId: input.actorUserId,
        createdProjectRevision: nextRevision,
        createdOperationRecordId: operation.id,
        supersedesConditionId: live ? live.id : null,
      });
    } catch (error) {
      // A concurrent replacement can still lose the live-slot race; fail closed as a
      // state conflict rather than leaking a driver error.
      if (isLiveConditionConflict(error)) {
        throw new ServicePaymentError("state_conflict");
      }
      throw error;
    }
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: input.actorUserId,
      projectRevision: nextRevision,
      eventType: "service_payment_condition_recorded",
      subjectKind: "service_payment_condition",
      subjectId: conditionId,
      operationRecordId: operation.id,
      createdAt: now,
    });
    const [inserted] = await tx
      .select()
      .from(servicePaymentCondition)
      .where(eq(servicePaymentCondition.id, conditionId))
      .limit(1);
    if (!inserted) {
      throw new ServicePaymentError("integrity_conflict");
    }
    return {
      condition: conditionView(inserted),
      projectRevision: nextRevision,
      replayed: false,
    } satisfies RecordPaymentConditionResult;
  });
}

export type SubmitPaymentEvidenceInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  conditionId: string;
  evidenceCategory: ServicePaymentEvidenceCategory;
  referenceSha256: string;
  observationSha256: string;
  declaredAmountMinor: number;
  declaredCurrency: string;
  paidAt: Date;
  financeAuthorityCode: string;
  financeAuthorityRequestSha256: string;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

export type SubmitPaymentEvidenceResult = {
  replayed: boolean;
  projectRevision: number;
  evidence: ServicePaymentEvidenceView;
};

/**
 * Record bounded external payment evidence as `pending`.
 *
 * A submission is never settlement: only the separate verification path can make
 * it `verified`, and the amount/currency must already match the exact condition.
 */
function runSubmitPaymentEvidence(
  database: Database,
  input: SubmitPaymentEvidenceInput
) {
  const evidenceId = randomUUID();
  return database.transaction(async (tx) => {
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const operator = await loadOperatorEligibility(
      tx,
      project.id,
      accounts.get(input.actorUserId)
    );
    if (!operator.eligible) {
      notFound();
    }
    if (!isServicePaymentAmountMinor(input.declaredAmountMinor)) {
      throw new ServicePaymentError("invalid_request");
    }
    if (!isServicePaymentCurrency(input.declaredCurrency)) {
      throw new ServicePaymentError("invalid_request");
    }
    const condition = await lockCondition(tx, engagement, input.conditionId);
    if (condition.supersededAt !== null) {
      throw new ServicePaymentError("state_conflict");
    }
    const version = await requireCurrentAgreement(
      tx,
      engagement,
      condition.agreementVersionId
    );
    if (
      version.termsSha256 !== condition.agreementTermsSha256 ||
      condition.requirement !== "required" ||
      condition.amountMinor === null ||
      condition.currency === null
    ) {
      throw new ServicePaymentError("state_conflict");
    }
    if (
      Number(condition.amountMinor) !== input.declaredAmountMinor ||
      condition.currency !== input.declaredCurrency
    ) {
      throw new ServicePaymentError("invalid_request");
    }
    const built = buildFinanceAuthorityRequest({
      action: "submit_evidence",
      actorUserId: input.actorUserId,
      condition,
      engagement,
      evidenceId: null,
      observationSha256: input.observationSha256,
      operator,
      project,
    });
    if (built.requestSha256 !== input.financeAuthorityRequestSha256) {
      throw new ServicePaymentError("authority_denied");
    }
    const now = new Date();
    if (
      input.paidAt.getTime() >
      now.getTime() + SERVICE_PAYMENT_DECLARED_PAID_TIME_FUTURE_SKEW_MS
    ) {
      throw new ServicePaymentError("invalid_request");
    }
    // FIX-05: canonical identity, re-derived from the locked rows.
    const requestHash = hashServicePaymentOperationRequest(
      servicePaymentEvidenceRequestIdentity({
        agreementTermsSha256: condition.agreementTermsSha256,
        agreementVersionId: condition.agreementVersionId,
        conditionId: condition.id,
        declaredAmountMinor: input.declaredAmountMinor,
        declaredCurrency: input.declaredCurrency,
        engagementId: engagement.id,
        evidenceCategory: input.evidenceCategory,
        expectedProjectRevision: input.expectedProjectRevision,
        observationSha256: input.observationSha256,
        paidAt: input.paidAt.toISOString(),
        projectId: project.id,
        referenceSha256: input.referenceSha256,
      })
    );
    if (requestHash !== input.requestHash) {
      throw new ServicePaymentError("integrity_conflict");
    }
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "service_payment_evidence_submit",
      requestHash,
      resultId: evidenceId,
      resultKind: "service_payment_evidence",
    });
    if (operation.replayed) {
      const [existing] = await tx
        .select()
        .from(servicePaymentEvidence)
        .where(eq(servicePaymentEvidence.id, operation.resultId))
        .limit(1);
      if (
        !existing ||
        existing.engagementId !== engagement.id ||
        existing.projectId !== project.id
      ) {
        throw new ServicePaymentError("integrity_conflict");
      }
      return {
        evidence: evidenceView(existing),
        projectRevision: project.revision,
        replayed: true,
      } satisfies SubmitPaymentEvidenceResult;
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServicePaymentError("revision_conflict");
    }
    const nextRevision = await advanceProject(tx, project, now);
    await tx.insert(servicePaymentEvidence).values({
      id: evidenceId,
      projectId: project.id,
      engagementId: engagement.id,
      conditionId: condition.id,
      agreementVersionId: condition.agreementVersionId,
      agreementTermsSha256: condition.agreementTermsSha256,
      evidenceCategory: input.evidenceCategory,
      referenceSha256: input.referenceSha256,
      observationSha256: input.observationSha256,
      declaredAmountMinor: input.declaredAmountMinor,
      declaredCurrency: input.declaredCurrency,
      paidAt: input.paidAt,
      submittedByUserId: input.actorUserId,
      submittedAt: now,
      submittedProjectRevision: nextRevision,
      submittedOperationRecordId: operation.id,
      verificationStatus: "pending",
    });
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: input.actorUserId,
      projectRevision: nextRevision,
      eventType: "service_payment_evidence_recorded",
      subjectKind: "service_payment_evidence",
      subjectId: evidenceId,
      operationRecordId: operation.id,
      createdAt: now,
    });
    const [inserted] = await tx
      .select()
      .from(servicePaymentEvidence)
      .where(eq(servicePaymentEvidence.id, evidenceId))
      .limit(1);
    if (!inserted) {
      throw new ServicePaymentError("integrity_conflict");
    }
    return {
      evidence: evidenceView(inserted),
      projectRevision: nextRevision,
      replayed: false,
    } satisfies SubmitPaymentEvidenceResult;
  });
}

export type RecordPaymentEvidenceVerificationInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  evidenceId: string;
  outcome: ServicePaymentVerificationOutcome;
  financeAuthorityCode: string;
  financeAuthorityRequestSha256: string;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

export type RecordPaymentEvidenceVerificationResult = {
  replayed: boolean;
  projectRevision: number;
  evidence: ServicePaymentEvidenceView;
};

/**
 * Apply one independent finance evaluation to a pending evidence row.
 *
 * The verifier's outcome must belong to the exact persisted observation: a
 * "verified" flag with a different digest, a different amount or a different
 * evidence id is an integrity conflict, never a success.
 */
function runRecordPaymentEvidenceVerification(
  database: Database,
  input: RecordPaymentEvidenceVerificationInput
) {
  if (input.outcome.status === "unavailable") {
    throw new ServicePaymentError("verification_unavailable");
  }
  const outcome = input.outcome;
  return database.transaction(async (tx) => {
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const operator = await loadOperatorEligibility(
      tx,
      project.id,
      accounts.get(input.actorUserId)
    );
    if (!operator.eligible) {
      notFound();
    }
    // Documented lock order: project -> engagement -> accounts -> condition ->
    // evidence. The parent condition is discovered with a plain read because the
    // column is immutable.
    const [evidenceRef] = await tx
      .select({ conditionId: servicePaymentEvidence.conditionId })
      .from(servicePaymentEvidence)
      .where(
        and(
          eq(servicePaymentEvidence.id, input.evidenceId),
          eq(servicePaymentEvidence.engagementId, engagement.id)
        )
      )
      .limit(1);
    if (!evidenceRef) {
      notFound();
    }
    const condition = await lockCondition(
      tx,
      engagement,
      evidenceRef.conditionId
    );
    const [evidence] = await tx
      .select()
      .from(servicePaymentEvidence)
      .where(
        and(
          eq(servicePaymentEvidence.id, input.evidenceId),
          eq(servicePaymentEvidence.conditionId, condition.id)
        )
      )
      .for("update")
      .limit(1);
    if (!evidence) {
      notFound();
    }
    if (evidence.submittedByUserId === input.actorUserId) {
      throw new ServicePaymentError("forbidden");
    }
    // FIX-04: revalidate the whole contract chain under lock before any transition.
    // A stale/superseded contract, a replaced condition or a mismatched terms hash
    // fails closed: evidence may only ever settle the exact condition and agreement
    // version it was submitted against.
    const version = await requireCurrentAgreement(
      tx,
      engagement,
      evidence.agreementVersionId
    );
    if (
      condition.supersededAt !== null ||
      condition.agreementVersionId !== evidence.agreementVersionId ||
      condition.agreementTermsSha256 !== evidence.agreementTermsSha256 ||
      version.termsSha256 !== evidence.agreementTermsSha256
    ) {
      throw new ServicePaymentError("state_conflict");
    }
    if (
      outcome.evidenceId !== evidence.id ||
      outcome.observationSha256 !== evidence.observationSha256 ||
      !isServicePaymentVerificationMethod(outcome.method)
    ) {
      throw new ServicePaymentError("integrity_conflict");
    }
    if (
      outcome.status === "verified" &&
      (outcome.declaredAmountMinor !== Number(evidence.declaredAmountMinor) ||
        outcome.declaredCurrency !== evidence.declaredCurrency)
    ) {
      throw new ServicePaymentError("integrity_conflict");
    }
    const built = buildFinanceAuthorityRequest({
      action: "verify_evidence",
      actorUserId: input.actorUserId,
      condition,
      engagement,
      evidenceId: evidence.id,
      observationSha256: evidence.observationSha256,
      operator,
      project,
    });
    if (built.requestSha256 !== input.financeAuthorityRequestSha256) {
      throw new ServicePaymentError("authority_denied");
    }
    // FIX-05: canonical identity over the material decision fields.
    const requestHash = hashServicePaymentOperationRequest(
      servicePaymentVerificationRequestIdentity({
        agreementTermsSha256: evidence.agreementTermsSha256,
        agreementVersionId: evidence.agreementVersionId,
        amountMinor: condition.amountMinor ?? null,
        conditionId: condition.id,
        currency: condition.currency ?? null,
        engagementId: engagement.id,
        evidenceId: evidence.id,
        expectedProjectRevision: input.expectedProjectRevision,
        method: outcome.method,
        observationSha256: evidence.observationSha256,
        projectId: project.id,
        provenance: outcome.provenance,
        providerCode: outcome.providerCode.slice(0, 64),
        reasonCode:
          outcome.status === "rejected"
            ? outcome.reasonCode.slice(0, 64)
            : null,
        status: outcome.status,
      })
    );
    if (requestHash !== input.requestHash) {
      throw new ServicePaymentError("integrity_conflict");
    }
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "service_payment_evidence_verify",
      requestHash,
      resultId: evidence.id,
      resultKind: "service_payment_evidence",
    });
    if (operation.replayed) {
      return {
        evidence: evidenceView(evidence),
        projectRevision: project.revision,
        replayed: true,
      } satisfies RecordPaymentEvidenceVerificationResult;
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServicePaymentError("revision_conflict");
    }
    if (evidence.verificationStatus !== "pending") {
      throw new ServicePaymentError("state_conflict");
    }
    const now = new Date();
    const nextRevision = await advanceProject(tx, project, now);
    const rejected = outcome.status === "rejected";
    await tx
      .update(servicePaymentEvidence)
      .set({
        verificationStatus: rejected ? "rejected" : "verified",
        verificationMethod: outcome.method,
        verificationProviderCode: outcome.providerCode.slice(0, 64),
        verificationProvenance: outcome.provenance.slice(
          0,
          SERVICE_PAYMENT_PROVENANCE_MAX
        ),
        verifiedByUserId: input.actorUserId,
        verifiedAt: now,
        verificationProjectRevision: nextRevision,
        verificationOperationRecordId: operation.id,
        rejectionReasonCode: rejected ? outcome.reasonCode.slice(0, 64) : null,
      })
      .where(eq(servicePaymentEvidence.id, evidence.id));
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: input.actorUserId,
      projectRevision: nextRevision,
      eventType: rejected
        ? "service_payment_evidence_rejected"
        : "service_payment_evidence_verified",
      subjectKind: "service_payment_evidence",
      subjectId: evidence.id,
      operationRecordId: operation.id,
      createdAt: now,
    });
    return {
      evidence: {
        ...evidenceView(evidence),
        verificationStatus: rejected ? "rejected" : "verified",
        verifiedAt: now.toISOString(),
        rejectionReasonCode: rejected ? outcome.reasonCode.slice(0, 64) : null,
      },
      projectRevision: nextRevision,
      replayed: false,
    } satisfies RecordPaymentEvidenceVerificationResult;
  });
}

export type RecordPaymentResolutionInput = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  conditionId: string;
  resolutionKind: ServicePaymentResolutionKind;
  evidenceId: string | null;
  reasonCode: string;
  observationSha256: string;
  observationCode: string | null;
  supersedesResolutionId: string | null;
  financeAuthorityCode: string;
  financeAuthorityRequestSha256: string;
  expectedProjectRevision: number;
  operationId: string;
  requestHash: string;
};

export type RecordPaymentResolutionResult = {
  replayed: boolean;
  projectRevision: number;
  resolution: ServicePaymentResolutionView;
};

/**
 * Record one immutable dispute/refund/reversal/void/correction.
 *
 * Nothing is updated or deleted: a correction supersedes exactly one earlier
 * resolution, which is how a mistaken reversal is repaired without rewriting
 * history. Effective status is always re-derived, never stored.
 */
function runRecordPaymentResolution(
  database: Database,
  input: RecordPaymentResolutionInput
) {
  const resolutionId = randomUUID();
  return database.transaction(async (tx) => {
    const project = await lockProject(tx, input.projectId);
    const engagement = await lockEngagement(tx, project.id, input.engagementId);
    const accounts = await lockAccounts(tx, [input.actorUserId]);
    const operator = await loadOperatorEligibility(
      tx,
      project.id,
      accounts.get(input.actorUserId)
    );
    if (!operator.eligible) {
      notFound();
    }
    // FIX-05: the correction target shape is enforced before anything else, so a
    // correction can never name the evidence it is supposed to restore.
    if (
      !servicePaymentResolutionShapeValid({
        evidenceId: input.evidenceId,
        kind: input.resolutionKind,
        supersedesResolutionId: input.supersedesResolutionId,
      })
    ) {
      throw new ServicePaymentError("invalid_request");
    }
    const condition = await lockCondition(tx, engagement, input.conditionId);
    if (condition.supersededAt !== null) {
      throw new ServicePaymentError("state_conflict");
    }
    if (input.evidenceId) {
      const [evidence] = await tx
        .select()
        .from(servicePaymentEvidence)
        .where(
          and(
            eq(servicePaymentEvidence.id, input.evidenceId),
            eq(servicePaymentEvidence.conditionId, condition.id)
          )
        )
        .for("share")
        .limit(1);
      if (!evidence) {
        notFound();
      }
      if (evidence.verificationStatus !== "verified") {
        throw new ServicePaymentError("state_conflict");
      }
    }
    if (input.supersedesResolutionId) {
      const [target] = await tx
        .select()
        .from(servicePaymentResolution)
        .where(
          and(
            eq(servicePaymentResolution.id, input.supersedesResolutionId),
            eq(servicePaymentResolution.conditionId, condition.id)
          )
        )
        .for("share")
        .limit(1);
      if (!target || target.resolutionKind === "correction") {
        throw new ServicePaymentError("invalid_request");
      }
      const [already] = await tx
        .select({ id: servicePaymentResolution.id })
        .from(servicePaymentResolution)
        .where(
          eq(
            servicePaymentResolution.supersedesResolutionId,
            input.supersedesResolutionId
          )
        )
        .limit(1);
      if (already) {
        throw new ServicePaymentError("state_conflict");
      }
    }
    const built = buildFinanceAuthorityRequest({
      action:
        SERVICE_PAYMENT_FINANCE_ACTION_BY_RESOLUTION[input.resolutionKind],
      actorUserId: input.actorUserId,
      condition,
      engagement,
      evidenceId: input.evidenceId,
      observationSha256: input.observationSha256,
      operator,
      project,
    });
    if (built.requestSha256 !== input.financeAuthorityRequestSha256) {
      throw new ServicePaymentError("authority_denied");
    }
    // FIX-05: canonical identity over the material resolution fields.
    const requestHash = hashServicePaymentOperationRequest(
      servicePaymentResolutionRequestIdentity({
        agreementTermsSha256: condition.agreementTermsSha256,
        agreementVersionId: condition.agreementVersionId,
        amountMinor: condition.amountMinor ?? null,
        conditionId: condition.id,
        currency: condition.currency ?? null,
        engagementId: engagement.id,
        evidenceId: input.evidenceId,
        expectedProjectRevision: input.expectedProjectRevision,
        financeAuthorityCode: input.financeAuthorityCode,
        kind: input.resolutionKind,
        observationCode: input.observationCode ?? null,
        observationSha256: input.observationSha256,
        projectId: project.id,
        reasonCode: input.reasonCode,
        supersedesResolutionId: input.supersedesResolutionId,
      })
    );
    if (requestHash !== input.requestHash) {
      throw new ServicePaymentError("integrity_conflict");
    }
    const operation = await claimOperation(tx, {
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      operationType: "service_payment_resolution_record",
      requestHash,
      resultId: resolutionId,
      resultKind: "service_payment_resolution",
    });
    if (operation.replayed) {
      const [existing] = await tx
        .select()
        .from(servicePaymentResolution)
        .where(eq(servicePaymentResolution.id, operation.resultId))
        .limit(1);
      if (
        !existing ||
        existing.engagementId !== engagement.id ||
        existing.projectId !== project.id
      ) {
        throw new ServicePaymentError("integrity_conflict");
      }
      return {
        projectRevision: project.revision,
        replayed: true,
        resolution: resolutionView(existing),
      } satisfies RecordPaymentResolutionResult;
    }
    if (project.revision !== input.expectedProjectRevision) {
      throw new ServicePaymentError("revision_conflict");
    }
    const now = new Date();
    const nextRevision = await advanceProject(tx, project, now);
    const resolutionRow = {
      id: resolutionId,
      projectId: project.id,
      engagementId: engagement.id,
      conditionId: condition.id,
      evidenceId: input.evidenceId,
      resolutionKind: input.resolutionKind,
      reasonCode: input.reasonCode,
      observationSha256: input.observationSha256,
      observationCode: input.observationCode
        ? input.observationCode.slice(0, 64)
        : null,
      financeAuthorityCode: input.financeAuthorityCode,
      financeAuthorityRequestSha256: built.requestSha256,
      supersedesResolutionId: input.supersedesResolutionId,
      recordedByUserId: input.actorUserId,
      resolvedProjectRevision: nextRevision,
      operationRecordId: operation.id,
      resolvedAt: now,
    };
    try {
      await tx.insert(servicePaymentResolution).values(resolutionRow);
    } catch (error) {
      // Correction A: two concurrent corrections of the same resolution cannot both
      // commit; the loser is a conflict, never a driver error.
      if (isCorrectionDuplicateConflict(error)) {
        throw new ServicePaymentError("state_conflict");
      }
      throw error;
    }
    await appendEvent(tx, {
      projectId: project.id,
      actorUserId: input.actorUserId,
      projectRevision: nextRevision,
      eventType: "service_payment_resolution_recorded",
      subjectKind: "service_payment_resolution",
      subjectId: resolutionId,
      operationRecordId: operation.id,
      createdAt: now,
    });
    const [inserted] = await tx
      .select()
      .from(servicePaymentResolution)
      .where(eq(servicePaymentResolution.id, resolutionId))
      .limit(1);
    if (!inserted) {
      throw new ServicePaymentError("integrity_conflict");
    }
    return {
      projectRevision: nextRevision,
      replayed: false,
      resolution: resolutionView(inserted),
    } satisfies RecordPaymentResolutionResult;
  });
}

/** Repository surface consumed by the HTTP handlers and future M4-007 gate. */
export type ServicePaymentRepositoryDeps = {
  /** FIX-02: explicit staff payment-status disclosure decision. */
  statusReadAuthority: ServicePaymentStatusReadAuthority;
};

export function createServicePaymentRepository(
  options: { database?: Database } & Partial<ServicePaymentRepositoryDeps> = {}
) {
  const database = options.database ?? db;
  const deps: ServicePaymentRepositoryDeps = {
    statusReadAuthority:
      options.statusReadAuthority ?? denyAllServicePaymentStatusReadAuthority,
  };
  return {
    loadPaymentStatus: (input: LoadServicePaymentStatusInput) =>
      runLoadServicePaymentStatus(database, input, deps),
    loadContractTarget: (input: LoadPaymentContractTargetInput) =>
      runLoadPaymentContractTarget(database, input),
    loadFinanceTarget: (input: LoadPaymentFinanceTargetInput) =>
      runLoadPaymentFinanceTarget(database, input),
    recordCondition: (input: RecordPaymentConditionInput) =>
      runRecordPaymentCondition(database, input),
    submitEvidence: (input: SubmitPaymentEvidenceInput) =>
      runSubmitPaymentEvidence(database, input),
    recordEvidenceVerification: (
      input: RecordPaymentEvidenceVerificationInput
    ) => runRecordPaymentEvidenceVerification(database, input),
    recordResolution: (input: RecordPaymentResolutionInput) =>
      runRecordPaymentResolution(database, input),
  };
}

export const servicePaymentRepository = createServicePaymentRepository();
