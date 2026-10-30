// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions are scoped to this guarded database suite.
// biome-ignore-all lint/suspicious/useAwait: in-memory repository doubles and fixture helpers must be awaitable by contract.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  assertM4_005_MigrationLedger,
  expectedM4_005_Migration,
  M4_005_RUNNER_ENVIRONMENT_FLAG,
  M4_005_TEST_APPROVAL,
  M4_005_TEST_TARGET,
  parseM4_005_DatabaseIdentity,
  parseM4_005_DatabaseUrl,
  parseM4_005_MigrationJournal,
  parseM4_005_MigrationLedger,
} from "../../scripts/phase13-m4-005-db-test-guard";
import { ProjectStaffAssignmentError } from "../project-staff-assignments/errors";
import {
  parseServiceAgreementTerms,
  SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
} from "../service-engagement/policy";
import {
  SERVICE_PAYMENT_FINANCE_ACTION_BY_RESOLUTION,
  type ServicePaymentFinanceAction,
} from "../service-payment/authority";
import { ServicePaymentError } from "../service-payment/errors";
import {
  hashServicePaymentOperationRequest,
  hashServicePaymentStaffResolutionObservation,
  SERVICE_PAYMENT_POLICY_VERSION,
  type ServicePaymentResolutionKind,
  servicePaymentConditionRequestIdentity,
  servicePaymentEvidenceRequestIdentity,
  servicePaymentResolutionRequestIdentity,
  servicePaymentVerificationRequestIdentity,
} from "../service-payment/policy";
import {
  createSyntheticServicePaymentContractAuthority,
  createSyntheticServicePaymentEvidenceVerifier,
  createSyntheticServicePaymentFinanceAuthority,
  createSyntheticServicePaymentReversalResolver,
  createSyntheticServicePaymentStatusReadAuthority,
} from "../service-payment/synthetic-authorities";
import { denyAllServicePaymentEvidenceVerifier } from "../service-payment/verification";
import { createProjectFoundationRepository } from "./project-foundation";
import { createProjectStaffAssignmentRepository } from "./project-staff-assignment-repository";
import { closeLazyDatabase } from "./runtime-client";
import { createServiceEngagementRepository } from "./service-engagement-repository";
import { createServicePaymentRepository } from "./service-payment-repository";

/**
 * GUARDED M4-005 PostgreSQL integration suite.
 *
 * This file is excluded from `test:unit` and only runs through
 * `scripts/phase13-m4-005-db-test.ts`, which performs the full fail-closed
 * preflight (approval token, exact isolated URL, Docker identity, server identity,
 * SELECT-only ledger role, Drizzle ledger tied to the pinned Migration 0044 bytes
 * and a derived child environment).
 *
 * IT HAS NEVER BEEN EXECUTED. The task that produced it was authorized to write
 * and offline-test the launcher only: no container was created, no database was
 * contacted and Migration 0044 was not applied anywhere.
 *
 * Every successful fixture below uses the real production contract:
 *   - M4-002 assignments are created by admin propose -> owner approve -> lawyer
 *     accept (an owner proposal is proven to be refused first);
 *   - M4-004 agreements are drafted, issued and accepted through the real
 *     repository with the operator authority binding read back from
 *     `loadServiceOperatorContext`;
 *   - M4-005 authority bindings come from the repository's own
 *     `loadContractTarget` / `loadFinanceTarget` read paths;
 *   - the only injected doubles are the explicitly synthetic contract, finance,
 *     evidence-verification and reversal ports.
 * No authorization rule is bypassed and no production table is updated directly
 * except by deliberate negative probes that must fail.
 */
const chatbotRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TEST_DATABASE_URL =
  process.env.PHASE13_M4_005_TEST_DATABASE_URL?.trim() ?? "";
const isGuardedRun =
  process.env[M4_005_RUNNER_ENVIRONMENT_FLAG] === "1" &&
  process.env.PHASE13_M4_005_TEST_APPROVAL === M4_005_TEST_APPROVAL &&
  TEST_DATABASE_URL.length > 0;
const skipReason = isGuardedRun
  ? false
  : "M4-005 PostgreSQL integration requires its guarded launcher and separate owner approval";

function guardedTest(name: string, fn: () => Promise<void>): void {
  test(name, { skip: skipReason }, fn);
}

function operationKey(label: string) {
  return `m4-005-db-${label}-${randomUUID()}`;
}

function sha256(label: string) {
  return createHash("sha256").update(label).digest("hex");
}

function client() {
  parseM4_005_DatabaseUrl(TEST_DATABASE_URL);
  return postgres(TEST_DATABASE_URL, {
    connection: { TimeZone: "UTC" },
    idle_timeout: 20,
    max: 3,
  });
}

/**
 * Asserts a specific M4-005 domain error code.
 *
 * Some repository gates are synchronous (input shape validation before the
 * transaction opens) while most authorization and state gates reject the returned
 * promise. A lazy callback captures both, so a synchronous throw can never escape
 * the assertion and silently abort a scenario.
 */
async function expectPaymentError(
  operation: Promise<unknown> | (() => Promise<unknown>),
  code: ServicePaymentError["code"]
) {
  await assert.rejects(
    async () => {
      const pending =
        typeof operation === "function" ? operation() : await operation;
      await pending;
    },
    (error: unknown) =>
      error instanceof ServicePaymentError && error.code === code
  );
}

type PgErrorDetails = { code?: string; constraint?: string };

function pgErrorDetails(error: unknown): PgErrorDetails {
  const value = error as {
    code?: unknown;
    constraint_name?: unknown;
    message?: unknown;
  };
  const code = typeof value?.code === "string" ? value.code : undefined;
  const constraint =
    typeof value?.constraint_name === "string"
      ? value.constraint_name
      : typeof value?.message === "string"
        ? /constraint "([^"]+)"/u.exec(value.message)?.[1]
        : undefined;
  return { code, constraint };
}

async function expectSqlFailure(
  operation: () => Promise<unknown>,
  options: { code?: string; constraint?: string }
) {
  await assert.rejects(operation, (error: unknown) => {
    const details = pgErrorDetails(error);
    if (options.code && details.code !== options.code) {
      throw new Error(
        `expected SQLSTATE ${options.code}, got ${details.code ?? "none"} (${details.constraint ?? "no constraint"})`
      );
    }
    if (options.constraint && details.constraint !== options.constraint) {
      throw new Error(
        `expected constraint ${options.constraint}, got ${details.constraint ?? "none"}`
      );
    }
    return true;
  });
}

type Accounts = {
  adminUserId: string;
  operatorUserId: string;
  verifierUserId: string;
  unassignedLawyerUserId: string;
  ownerUserId: string;
  otherOwnerUserId: string;
};

type Fixture = Accounts & {
  projectId: string;
  engagementId: string;
  agreementVersionId: string;
  termsSha256: string;
};

const DEFAULT_AMOUNT_MINOR = 250_000;
const DEFAULT_CURRENCY = "AUD";

async function seedAccounts(sql: ReturnType<typeof client>): Promise<Accounts> {
  const suffix = randomUUID().slice(0, 8);
  const accounts: Accounts = {
    adminUserId: randomUUID(),
    operatorUserId: randomUUID(),
    otherOwnerUserId: randomUUID(),
    ownerUserId: randomUUID(),
    unassignedLawyerUserId: randomUUID(),
    verifierUserId: randomUUID(),
  };
  await sql`
    INSERT INTO "User" ("id", "email", "role", "emailVerifiedAt")
    VALUES (${accounts.ownerUserId}, ${`m4-005-${suffix}-owner@example.test`}, 'user', now()),
           (${accounts.otherOwnerUserId}, ${`m4-005-${suffix}-owner2@example.test`}, 'user', now()),
           (${accounts.operatorUserId}, ${`m4-005-${suffix}-operator@example.test`}, 'lawyer', now()),
           (${accounts.verifierUserId}, ${`m4-005-${suffix}-finance@example.test`}, 'lawyer', now()),
           (${accounts.unassignedLawyerUserId}, ${`m4-005-${suffix}-unassigned@example.test`}, 'lawyer', now()),
           (${accounts.adminUserId}, ${`m4-005-${suffix}-admin@example.test`}, 'admin', now())
  `;
  return accounts;
}

/** The accepted M4-002 Option A flow, driven exactly as production requires. */
async function activateAssignment(input: {
  label: string;
  projectId: string;
  adminUserId: string;
  ownerUserId: string;
  staffUserId: string;
}) {
  const assignments = createProjectStaffAssignmentRepository();
  await assert.rejects(
    assignments.propose({
      actorUserId: input.ownerUserId,
      operationId: operationKey(`${input.label}-propose-owner`),
      projectId: input.projectId,
      staffUserId: input.staffUserId,
    }),
    (error: unknown) =>
      error instanceof ProjectStaffAssignmentError &&
      error.code === "not_found",
    "an owner-actor proposal must be refused"
  );
  await assignments.propose({
    actorUserId: input.adminUserId,
    operationId: operationKey(`${input.label}-propose`),
    projectId: input.projectId,
    staffUserId: input.staffUserId,
  });
  const find = async () => {
    const rows = await assignments.listOwnerAssignments({
      actorUserId: input.ownerUserId,
      projectId: input.projectId,
    });
    const row = rows.find((entry) => entry.staffUserId === input.staffUserId);
    assert.ok(row, "assignment must be listed for the owner");
    return row;
  };
  const proposed = await find();
  await assignments.transition({
    action: "owner_approve",
    actorUserId: input.ownerUserId,
    assignmentId: proposed.assignmentId,
    expectedProjectRevision: proposed.expectedProjectRevision,
    noticeVersion: proposed.noticeVersion,
    operationId: operationKey(`${input.label}-approve`),
    projectId: input.projectId,
    proposalSha256: proposed.proposalSha256,
  });
  const approved = await find();
  await assignments.transition({
    action: "lawyer_accept",
    actorUserId: input.staffUserId,
    assignmentId: approved.assignmentId,
    expectedProjectRevision: approved.expectedProjectRevision,
    operationId: operationKey(`${input.label}-accept`),
    projectId: input.projectId,
  });
  const current = await find();
  assert.equal(current.assignmentStatus, "active");
  return {
    assignment: current,
    projectRevision: current.expectedProjectRevision,
  };
}

function canonicalTerms() {
  const terms = parseServiceAgreementTerms({
    clauses: [
      {
        body: "The customer engages the service operator for the stated scope. Any advance service fee, if a current agreement version states one, is recorded separately and is never inferred from this clause text.",
        clauseId: "scope",
        heading: "Scope and fee",
      },
    ],
    schemaVersion: SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION,
    scopeCodes: ["school_admissions"],
    serviceMode: "self_service",
    title: "Synthetic M4-005 engagement terms",
  });
  if (!terms) {
    throw new Error("synthetic agreement terms must parse");
  }
  return terms;
}

/**
 * Builds one fully authorized M4-005 fixture: Project, two assigned lawyers, an
 * engagement with an issued and accepted agreement, ready for a payment
 * condition. Everything is synthetic and append-only (no teardown).
 */
async function seedFixture(label: string): Promise<Fixture> {
  const sql = client();
  try {
    const accounts = await seedAccounts(sql);
    const project = await createProjectFoundationRepository().createProject({
      actorUserId: accounts.ownerUserId,
      operationId: operationKey(`${label}-project`),
    });
    const projectId = project.project.id;
    const operator = await activateAssignment({
      adminUserId: accounts.adminUserId,
      label: `${label}-operator`,
      ownerUserId: accounts.ownerUserId,
      projectId,
      staffUserId: accounts.operatorUserId,
    });
    const verifier = await activateAssignment({
      adminUserId: accounts.adminUserId,
      label: `${label}-verifier`,
      ownerUserId: accounts.ownerUserId,
      projectId,
      staffUserId: accounts.verifierUserId,
    });
    const revisionAfterAssignments = Math.max(
      operator.projectRevision,
      verifier.projectRevision
    );
    const engagements = createServiceEngagementRepository();
    const engagement = await engagements.createEngagement({
      actorUserId: accounts.ownerUserId,
      expectedProjectRevision: revisionAfterAssignments,
      operationId: operationKey(`${label}-engagement`),
      projectId,
      requestHash: sha256(`${label}-engagement`),
      scopeCodes: ["school_admissions"],
      serviceMode: "self_service",
    });
    const engagementId = engagement.engagement.engagementId;
    const terms = canonicalTerms();
    const draftId = randomUUID();
    const draftAuthority = await engagements.loadServiceOperatorContext({
      action: "author_draft",
      actorUserId: accounts.operatorUserId,
      draft: {
        agreementVersionId: draftId,
        scopeCodes: ["school_admissions"],
        serviceMode: "self_service",
        termsSha256: terms.termsSha256,
      },
      engagementId,
      projectId,
    });
    const draft = await engagements.createAgreementVersion({
      actorUserId: accounts.operatorUserId,
      agreementVersionId: draftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: draftAuthority.operatorAuthority.requestSha256,
      engagementId,
      expectedProjectRevision: engagement.projectRevision,
      operationId: operationKey(`${label}-draft`),
      projectId,
      requestHash: sha256(`${label}-draft`),
      scopeCodes: ["school_admissions"],
      serviceMode: "self_service",
      termsPayload: terms.payload,
      termsSha256: terms.termsSha256,
    });
    const issueAuthority = await engagements.loadServiceOperatorContext({
      action: "issue",
      actorUserId: accounts.operatorUserId,
      agreementVersionId: draftId,
      engagementId,
      projectId,
    });
    const issued = await engagements.issueAgreementVersion({
      actorUserId: accounts.operatorUserId,
      agreementVersionId: draftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: issueAuthority.operatorAuthority.requestSha256,
      engagementId,
      expectedProjectRevision: draft.projectRevision,
      operationId: operationKey(`${label}-issue`),
      projectId,
      requestHash: sha256(`${label}-issue`),
    });
    await engagements.acceptAgreementVersion({
      actorUserId: accounts.ownerUserId,
      agreementVersionId: draftId,
      customerNoticeVersion: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
      engagementId,
      expectedProjectRevision: issued.projectRevision,
      operationId: operationKey(`${label}-accept`),
      projectId,
      requestHash: sha256(`${label}-accept`),
      termsSha256: terms.termsSha256,
    });
    return {
      ...accounts,
      agreementVersionId: draftId,
      engagementId,
      projectId,
      termsSha256: terms.termsSha256,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const contractAuthorityCodes = (fixture: Fixture) =>
  createSyntheticServicePaymentContractAuthority({
    grants: [
      {
        actorUserId: fixture.operatorUserId,
        agreementTermsSha256: fixture.termsSha256,
        agreementVersionId: fixture.agreementVersionId,
      },
    ],
  });

function financeAuthorityFor(fixture: Fixture) {
  return createSyntheticServicePaymentFinanceAuthority({
    grants: [
      {
        actions: [
          "submit_evidence",
          "verify_evidence",
          "record_dispute",
          "record_refund",
          "record_reversal",
          "record_void",
          "record_correction",
        ],
        actorUserId: fixture.operatorUserId,
      },
      {
        actions: [
          "verify_evidence",
          "record_refund",
          "record_reversal",
          "record_dispute",
          "record_correction",
          "record_void",
        ],
        actorUserId: fixture.verifierUserId,
      },
    ],
  });
}

async function recordConditionAs(input: {
  fixture: Fixture;
  payments: ReturnType<typeof createServicePaymentRepository>;
  authority: ReturnType<typeof createSyntheticServicePaymentContractAuthority>;
  actorUserId?: string;
  amountMinor?: number | null;
  currency?: string | null;
  requirement?: "required" | "not_required" | "unknown";
  basisRef?: string | null;
  label: string;
  revision: number;
}) {
  const actorUserId = input.actorUserId ?? input.fixture.operatorUserId;
  const requirement = input.requirement ?? "required";
  const amountMinor =
    input.amountMinor === undefined
      ? requirement === "required"
        ? DEFAULT_AMOUNT_MINOR
        : null
      : input.amountMinor;
  const currency =
    input.currency === undefined
      ? requirement === "required"
        ? DEFAULT_CURRENCY
        : null
      : input.currency;
  const basisRef = input.basisRef === undefined ? "clause:1.1" : input.basisRef;
  const target = await input.payments.loadContractTarget({
    actorUserId,
    agreementVersionId: input.fixture.agreementVersionId,
    amountMinor,
    contractualBasisCode:
      requirement === "not_required"
        ? "explicit_no_advance_fee"
        : "agreement_clause",
    contractualBasisRef: basisRef,
    currency,
    engagementId: input.fixture.engagementId,
    projectId: input.fixture.projectId,
    requirement,
  });
  const decision = input.authority.decide(target.authorityRequest);
  if (!decision.allowed) {
    throw new Error(
      `synthetic contract authority denied the fixture: ${decision.reasonCode}`
    );
  }
  return input.payments.recordCondition({
    actorUserId,
    agreementVersionId: input.fixture.agreementVersionId,
    amountMinor,
    contractAuthorityCode: decision.authorityCode,
    contractAuthorityRequestSha256: target.authorityRequest.requestSha256,
    contractObservationSha256: target.contractObservationSha256,
    contractualBasisCode:
      requirement === "not_required"
        ? "explicit_no_advance_fee"
        : "agreement_clause",
    contractualBasisRef: basisRef,
    currency,
    engagementId: input.fixture.engagementId,
    expectedProjectRevision: input.revision,
    operationId: operationKey(input.label),
    projectId: input.fixture.projectId,
    // FIX-05: exactly the identity the HTTP layer would derive for this request.
    requestHash: hashServicePaymentOperationRequest(
      servicePaymentConditionRequestIdentity({
        agreementTermsSha256: target.authorityRequest.agreementTermsSha256,
        agreementVersionId: input.fixture.agreementVersionId,
        amountMinor,
        contractualBasisCode:
          requirement === "not_required"
            ? "explicit_no_advance_fee"
            : "agreement_clause",
        contractualBasisRef: basisRef,
        contractAuthorityCode: decision.authorityCode,
        contractObservationSha256: target.contractObservationSha256,
        currency,
        engagementId: input.fixture.engagementId,
        expectedProjectRevision: input.revision,
        projectId: input.fixture.projectId,
        requirement,
      })
    ),
    requirement,
  });
}

async function submitEvidenceAs(input: {
  fixture: Fixture;
  payments: ReturnType<typeof createServicePaymentRepository>;
  authority: ReturnType<typeof createSyntheticServicePaymentFinanceAuthority>;
  conditionId: string;
  actorUserId?: string;
  amountMinor?: number;
  currency?: string;
  observationSha256?: string;
  referenceSha256?: string;
  paidAt?: Date;
  operationId?: string;
  label: string;
  revision: number;
}) {
  const actorUserId = input.actorUserId ?? input.fixture.operatorUserId;
  const observationSha256 =
    input.observationSha256 ?? sha256(`${input.label}-observation`);
  const referenceSha256 =
    input.referenceSha256 ?? sha256(`${input.label}-reference`);
  const declaredAmountMinor = input.amountMinor ?? DEFAULT_AMOUNT_MINOR;
  const declaredCurrency = input.currency ?? DEFAULT_CURRENCY;
  const paidAt = input.paidAt ?? new Date();
  const target = await input.payments.loadFinanceTarget({
    action: "submit_evidence",
    actorUserId,
    conditionId: input.conditionId,
    engagementId: input.fixture.engagementId,
    observationSha256,
    projectId: input.fixture.projectId,
  });
  const decision = input.authority.decide(target.authorityRequest);
  if (!decision.allowed) {
    throw new Error(
      `synthetic finance authority denied the fixture: ${decision.reasonCode}`
    );
  }
  return input.payments.submitEvidence({
    actorUserId,
    conditionId: input.conditionId,
    declaredAmountMinor,
    declaredCurrency,
    engagementId: input.fixture.engagementId,
    evidenceCategory: "external_transfer_receipt",
    expectedProjectRevision: input.revision,
    financeAuthorityCode: decision.authorityCode,
    financeAuthorityRequestSha256: target.authorityRequest.requestSha256,
    observationSha256,
    operationId: input.operationId ?? operationKey(input.label),
    paidAt,
    projectId: input.fixture.projectId,
    referenceSha256,
    // FIX-05: exactly the identity the HTTP layer would derive.
    requestHash: hashServicePaymentOperationRequest(
      servicePaymentEvidenceRequestIdentity({
        agreementTermsSha256: target.authorityRequest.agreementTermsSha256,
        agreementVersionId: target.authorityRequest.agreementVersionId,
        conditionId: input.conditionId,
        declaredAmountMinor,
        declaredCurrency,
        engagementId: input.fixture.engagementId,
        evidenceCategory: "external_transfer_receipt",
        expectedProjectRevision: input.revision,
        observationSha256,
        paidAt: paidAt.toISOString(),
        projectId: input.fixture.projectId,
        referenceSha256,
      })
    ),
  });
}

async function verifyEvidenceAs(input: {
  fixture: Fixture;
  payments: ReturnType<typeof createServicePaymentRepository>;
  authority: ReturnType<typeof createSyntheticServicePaymentFinanceAuthority>;
  verifier: ReturnType<typeof createSyntheticServicePaymentEvidenceVerifier>;
  conditionId: string;
  evidenceId: string;
  actorUserId?: string;
  label: string;
  revision: number;
}) {
  const actorUserId = input.actorUserId ?? input.fixture.verifierUserId;
  const target = await input.payments.loadFinanceTarget({
    action: "verify_evidence",
    actorUserId,
    conditionId: input.conditionId,
    engagementId: input.fixture.engagementId,
    evidenceId: input.evidenceId,
    projectId: input.fixture.projectId,
  });
  if (!target.verification) {
    throw new Error(
      "verification target must include the canonical verifier input"
    );
  }
  const decision = input.authority.decide(target.authorityRequest);
  if (!decision.allowed) {
    throw new Error(
      `synthetic finance authority denied verification: ${decision.reasonCode}`
    );
  }
  const outcome = await input.verifier.verify(target.verification);
  if (outcome.status === "unavailable") {
    throw new Error("synthetic verifier unexpectedly returned unavailable");
  }
  return input.payments.recordEvidenceVerification({
    actorUserId,
    engagementId: input.fixture.engagementId,
    evidenceId: input.evidenceId,
    expectedProjectRevision: input.revision,
    financeAuthorityCode: decision.authorityCode,
    financeAuthorityRequestSha256: target.authorityRequest.requestSha256,
    operationId: operationKey(input.label),
    outcome,
    projectId: input.fixture.projectId,
    requestHash: hashServicePaymentOperationRequest(
      servicePaymentVerificationRequestIdentity({
        agreementTermsSha256: target.authorityRequest.agreementTermsSha256,
        agreementVersionId: target.authorityRequest.agreementVersionId,
        amountMinor: target.authorityRequest.amountMinor,
        conditionId: target.authorityRequest.conditionId,
        currency: target.authorityRequest.currency,
        engagementId: input.fixture.engagementId,
        evidenceId: input.evidenceId,
        expectedProjectRevision: input.revision,
        method: outcome.method,
        observationSha256: outcome.observationSha256,
        projectId: input.fixture.projectId,
        provenance: outcome.provenance,
        providerCode: outcome.providerCode.slice(0, 64),
        reasonCode:
          outcome.status === "rejected"
            ? outcome.reasonCode.slice(0, 64)
            : null,
        status: outcome.status,
      })
    ),
  });
}

async function recordResolutionAs(input: {
  fixture: Fixture;
  payments: ReturnType<typeof createServicePaymentRepository>;
  authority: ReturnType<typeof createSyntheticServicePaymentFinanceAuthority>;
  resolver?: ReturnType<typeof createSyntheticServicePaymentReversalResolver>;
  conditionId: string;
  evidenceId: string | null;
  kind: ServicePaymentResolutionKind;
  reasonCode?: string;
  supersedesResolutionId?: string | null;
  actorUserId?: string;
  operationId?: string;
  /** Explicit persisted observation code, used to probe identity completeness. */
  observationCode?: string | null;
  label: string;
  revision: number;
}) {
  const actorUserId = input.actorUserId ?? input.fixture.verifierUserId;
  const referenceSha256 = sha256(`${input.label}-reference`);
  let observationSha256: string;
  let observationCode: string | null = input.observationCode ?? null;
  if (input.kind === "refund" || input.kind === "reversal") {
    if (!(input.resolver && input.evidenceId)) {
      throw new Error(
        "external resolutions need a resolver and an evidence target"
      );
    }
    const observation = await input.resolver.observe({
      conditionId: input.conditionId,
      engagementId: input.fixture.engagementId,
      evidenceId: input.evidenceId,
      projectId: input.fixture.projectId,
      referenceSha256,
      requestingActorUserId: actorUserId,
      resolutionKind: input.kind,
    });
    if (observation.status !== "observed") {
      throw new Error(
        `resolver did not observe the fixture: ${observation.status}`
      );
    }
    observationSha256 = observation.observationSha256;
    observationCode = observation.observationCode;
  } else {
    observationSha256 = hashServicePaymentStaffResolutionObservation({
      conditionId: input.conditionId,
      evidenceId: input.evidenceId,
      reasonCode: input.reasonCode ?? "staff_decision",
      referenceSha256,
      resolutionKind: input.kind,
    });
  }
  const action = SERVICE_PAYMENT_FINANCE_ACTION_BY_RESOLUTION[
    input.kind
  ] as ServicePaymentFinanceAction;
  const target = await input.payments.loadFinanceTarget({
    action,
    actorUserId,
    conditionId: input.conditionId,
    engagementId: input.fixture.engagementId,
    evidenceId: input.evidenceId,
    observationSha256,
    projectId: input.fixture.projectId,
  });
  const decision = input.authority.decide(target.authorityRequest);
  if (!decision.allowed) {
    throw new Error(
      `synthetic finance authority denied the resolution: ${decision.reasonCode}`
    );
  }
  return input.payments.recordResolution({
    actorUserId,
    conditionId: input.conditionId,
    engagementId: input.fixture.engagementId,
    evidenceId: input.evidenceId,
    expectedProjectRevision: input.revision,
    financeAuthorityCode: decision.authorityCode,
    financeAuthorityRequestSha256: target.authorityRequest.requestSha256,
    observationCode,
    observationSha256,
    operationId: input.operationId ?? operationKey(input.label),
    projectId: input.fixture.projectId,
    reasonCode: input.reasonCode ?? "staff_decision",
    requestHash: hashServicePaymentOperationRequest(
      servicePaymentResolutionRequestIdentity({
        agreementTermsSha256: target.authorityRequest.agreementTermsSha256,
        agreementVersionId: target.authorityRequest.agreementVersionId,
        amountMinor: target.authorityRequest.amountMinor,
        conditionId: input.conditionId,
        currency: target.authorityRequest.currency,
        engagementId: input.fixture.engagementId,
        evidenceId: input.evidenceId,
        expectedProjectRevision: input.revision,
        financeAuthorityCode: decision.authorityCode,
        kind: input.kind,
        observationCode,
        observationSha256,
        projectId: input.fixture.projectId,
        reasonCode: input.reasonCode ?? "staff_decision",
        supersedesResolutionId: input.supersedesResolutionId ?? null,
      })
    ),
    resolutionKind: input.kind,
    supersedesResolutionId: input.supersedesResolutionId ?? null,
  });
}

async function readStatus(
  fixture: Fixture,
  actorUserId?: string,
  statusReadAuthority?: ReturnType<
    typeof createSyntheticServicePaymentStatusReadAuthority
  >
) {
  const payments = statusReadAuthority
    ? createServicePaymentRepository({ statusReadAuthority })
    : createServicePaymentRepository();
  return payments.loadPaymentStatus({
    actorUserId: actorUserId ?? fixture.ownerUserId,
    engagementId: fixture.engagementId,
    projectId: fixture.projectId,
  });
}

/** Explicitly scoped synthetic financial-disclosure decision (test-only). */
function statusReadAuthorityFor(fixture: Fixture, actorUserId: string) {
  return createSyntheticServicePaymentStatusReadAuthority({
    grants: [{ actorUserId, engagementId: fixture.engagementId }],
  });
}

function singleSessionClient() {
  parseM4_005_DatabaseUrl(TEST_DATABASE_URL);
  return postgres(TEST_DATABASE_URL, {
    connection: { TimeZone: "UTC" },
    idle_timeout: 5,
    max: 1,
  });
}

/* ------------------------------------------------------------------------- *
 * Group A — schema and audit
 * ------------------------------------------------------------------------- */

guardedTest(
  "preflight matches the pinned Migration 0044 identity",
  async () => {
    const journal = parseM4_005_MigrationJournal(
      readFileSync(
        resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json"),
        "utf8"
      )
    );
    const expected = expectedM4_005_Migration(
      journal,
      readFileSync(
        resolve(chatbotRoot, M4_005_TEST_TARGET.migrationSqlPath),
        "utf8"
      )
    );
    const sql = singleSessionClient();
    try {
      const [identityRow] = await sql<Record<string, unknown>[]>`
      select current_database() as database,
             current_user as role,
             current_setting('server_version_num')::int as "serverVersionNum",
             role_row.rolcanlogin as "canLogin",
             role_row.rolsuper as "isSuperuser",
             role_row.rolcreatedb as "canCreateDatabase",
             role_row.rolcreaterole as "canCreateRole",
             has_schema_privilege(current_user, 'public', 'CREATE') as "canCreateSchemaPublic",
             has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'INSERT') as "ledgerInsert",
             has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'UPDATE') as "ledgerUpdate",
             has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'DELETE') as "ledgerDelete",
             has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'TRUNCATE') as "ledgerTruncate"
      from pg_roles role_row where role_row.rolname = current_user
    `;
      const identity = parseM4_005_DatabaseIdentity(identityRow);
      assert.equal(identity.database, M4_005_TEST_TARGET.database);
      assert.equal(identity.role, M4_005_TEST_TARGET.role);
      assert.equal(identity.isSuperuser, false);
      const [ledgerRow] = await sql<Record<string, unknown>[]>`
      select
        (select count(*)::int from drizzle.__drizzle_migrations) as "rowCount",
        (select id::int from drizzle.__drizzle_migrations order by id desc limit 1) as "latestId",
        (select hash from drizzle.__drizzle_migrations order by id desc limit 1) as "latestHash",
        (select created_at::text from drizzle.__drizzle_migrations order by id desc limit 1) as "latestCreatedAt"
    `;
      const ledger = parseM4_005_MigrationLedger(ledgerRow);
      // One shared contract: the ledger id is a surrogate key, so this asserts the
      // pinned head hash/timestamp, the exact row count and a valid non-regressing
      // identity instead of the migration ordinal.
      assertM4_005_MigrationLedger({ expected, ledger });
      const [schemaRow] = await sql<Record<string, unknown>[]>`
      select
        (select count(*)::int from pg_trigger
          where not tgisinternal and tgname like 'ServicePayment%') as "triggers",
        (select count(*)::int from pg_indexes
          where schemaname = 'public' and indexname like 'ServicePayment%') as "indexes",
        (select count(*)::int from pg_constraint
          where connamespace = 'public'::regnamespace
            and conname like 'ServicePayment%' and contype = 'c') as "checks"
    `;
      // R1: three row guards, the deferred lineage trigger and the deferred
      // operation-completeness trigger.
      assert.equal(schemaRow.triggers, 5);
      // 22 M4-005 indexes: the R2 correction-once partial index plus the composite
      // (id, projectId, engagementId) target required by the resolution FK.
      assert.equal(schemaRow.indexes, 22);
      assert.equal(schemaRow.checks, 19);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "the M4-005 tables persist digests, never raw financial content",
  async () => {
    const sql = singleSessionClient();
    try {
      const rows = await sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public'
        and table_name in ('ServicePaymentCondition','ServicePaymentEvidence','ServicePaymentResolution')
    `;
      assert.equal(rows.length, 64);
      for (const row of rows) {
        assert.equal(
          /account|card|iban|bic|receipttext|rawtext|pan/i.test(
            row.column_name
          ),
          false,
          `unexpected raw financial column ${row.table_name}.${row.column_name}`
        );
      }
      const digestColumns = rows
        .filter((row) => /sha256$/i.test(row.column_name))
        .map((row) => row.column_name);
      for (const required of [
        "referenceSha256",
        "observationSha256",
        "contractAuthorityRequestSha256",
        "financeAuthorityRequestSha256",
      ]) {
        assert.ok(digestColumns.includes(required), required);
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "FIX-DB: the M4-005 CHECK constraints reject invalid shapes",
  async () => {
    const sql = singleSessionClient();
    try {
      await sql`
      CREATE TEMP TABLE m4_005_condition_probe (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "requirement" text NOT NULL,
        "amountMinor" bigint,
        "currency" text,
        "contractualBasisRef" text,
        CONSTRAINT m4_005_probe_requirement CHECK ("requirement" IN ('required','not_required','unknown')),
        CONSTRAINT m4_005_probe_amount CHECK (
          ("requirement" = 'required' AND "amountMinor" IS NOT NULL AND "amountMinor" > 0
            AND "amountMinor" <= 999999999999 AND "currency" ~ '^[A-Z]{3}$'
            AND "contractualBasisRef" IS NOT NULL)
          OR ("requirement" = 'not_required' AND "amountMinor" IS NULL AND "currency" IS NULL
            AND "contractualBasisRef" IS NOT NULL)
          OR ("requirement" = 'unknown' AND "amountMinor" IS NULL AND "currency" IS NULL))
    `;
      await sql`
      INSERT INTO m4_005_condition_probe ("requirement", "amountMinor", "currency", "contractualBasisRef")
      VALUES ('required', 250000, 'AUD', 'clause:1.1')
    `;
      await expectSqlFailure(
        () => sql`
        INSERT INTO m4_005_condition_probe ("requirement", "amountMinor", "currency", "contractualBasisRef")
        VALUES ('required', 0, 'AUD', 'clause:1.1')
      `,
        { code: "23514", constraint: "m4_005_probe_amount" }
      );
      await expectSqlFailure(
        () => sql`
        INSERT INTO m4_005_condition_probe ("requirement", "amountMinor", "currency", "contractualBasisRef")
        VALUES ('required', 250000, null, 'clause:1.1')
      `,
        { code: "23514", constraint: "m4_005_probe_amount" }
      );
      await expectSqlFailure(
        () => sql`
        INSERT INTO m4_005_condition_probe ("requirement", "amountMinor", "currency", "contractualBasisRef")
        VALUES ('not_required', 0, 'AUD', 'clause:1.1')
      `,
        { code: "23514", constraint: "m4_005_probe_amount" }
      );
      await expectSqlFailure(
        () => sql`
        INSERT INTO m4_005_condition_probe ("requirement", "amountMinor", "currency", "contractualBasisRef")
        VALUES ('required', -1, 'AUD', 'clause:1.1')
      `,
        { code: "23514", constraint: "m4_005_probe_amount" }
      );
      await expectSqlFailure(
        () => sql`
        INSERT INTO m4_005_condition_probe ("requirement", "amountMinor", "currency", "contractualBasisRef")
        VALUES ('maybe', null, null, null)
      `,
        { code: "23514", constraint: "m4_005_probe_requirement" }
      );
      // The positive control must still work.
      await sql`
      INSERT INTO m4_005_condition_probe ("requirement", "amountMinor", "currency", "contractualBasisRef")
      VALUES ('not_required', null, null, 'schedule:no-advance-fee')
    `;
      await sql`DROP TABLE m4_005_condition_probe`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

/* ------------------------------------------------------------------------- *
 * Group B — contract binding
 * ------------------------------------------------------------------------- */

guardedTest(
  "a condition binds the exact current agreement version and supersedes the previous one",
  async () => {
    const fixture = await seedFixture("binding");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const first = await recordConditionAs({
      authority,
      fixture,
      label: "binding-first",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    assert.equal(first.replayed, false);
    assert.equal(
      first.condition.agreementVersionId,
      fixture.agreementVersionId
    );
    assert.equal(first.condition.agreementTermsSha256, fixture.termsSha256);
    assert.equal(first.condition.live, true);

    const second = await recordConditionAs({
      authority,
      fixture,
      label: "binding-second",
      payments,
      revision: first.projectRevision,
      amountMinor: 300_000,
    });
    assert.equal(second.condition.live, true);
    const status = await readStatus(fixture);
    assert.equal(status.scope, "owner");
    assert.equal(status.condition?.conditionId, second.condition.conditionId);
    assert.equal(status.condition?.amountMinor, 300_000);
    assert.equal(status.provenance, null);

    const sql = singleSessionClient();
    try {
      const [counts] = await sql<{ live: number; total: number }[]>`
      select count(*) filter (where "supersededAt" is null)::int as live,
             count(*)::int as total
      from "ServicePaymentCondition" where "engagementId" = ${fixture.engagementId}
    `;
      assert.ok(counts);
      assert.equal(counts.live, 1);
      assert.ok(counts.total >= 2);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "a replaced agreement makes the old condition report contract_not_current",
  async () => {
    const fixture = await seedFixture("replacement");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "replacement-first",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const engagements = createServiceEngagementRepository();
    const terms = canonicalTerms();
    const nextDraftId = randomUUID();
    const draftAuthority = await engagements.loadServiceOperatorContext({
      action: "author_draft",
      actorUserId: fixture.operatorUserId,
      draft: {
        agreementVersionId: nextDraftId,
        scopeCodes: ["school_admissions"],
        serviceMode: "self_service",
        termsSha256: terms.termsSha256,
      },
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    const draft = await engagements.createAgreementVersion({
      actorUserId: fixture.operatorUserId,
      agreementVersionId: nextDraftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: draftAuthority.operatorAuthority.requestSha256,
      engagementId: fixture.engagementId,
      expectedProjectRevision: condition.projectRevision,
      operationId: operationKey("replacement-draft"),
      projectId: fixture.projectId,
      requestHash: sha256("replacement-draft"),
      scopeCodes: ["school_admissions"],
      serviceMode: "self_service",
      termsPayload: terms.payload,
      termsSha256: terms.termsSha256,
    });
    const issueAuthority = await engagements.loadServiceOperatorContext({
      action: "issue",
      actorUserId: fixture.operatorUserId,
      agreementVersionId: nextDraftId,
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    await engagements.issueAgreementVersion({
      actorUserId: fixture.operatorUserId,
      agreementVersionId: nextDraftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: issueAuthority.operatorAuthority.requestSha256,
      engagementId: fixture.engagementId,
      expectedProjectRevision: draft.projectRevision,
      operationId: operationKey("replacement-issue"),
      projectId: fixture.projectId,
      requestHash: sha256("replacement-issue"),
    });
    const status = await readStatus(fixture);
    assert.equal(status.effective.status, "UNKNOWN");
    assert.equal(status.effective.reasonCode, "contract_not_current");
    assert.equal(status.effective.contractCurrent, false);
  }
);

guardedTest(
  "NOT_REQUIRED is an explicit contract decision with no amount",
  async () => {
    const fixture = await seedFixture("not-required");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const recorded = await recordConditionAs({
      authority,
      fixture,
      label: "not-required",
      payments,
      requirement: "not_required",
      revision: (await readStatus(fixture)).projectRevision,
    });
    assert.equal(recorded.condition.requirement, "not_required");
    assert.equal(recorded.condition.amountMinor, null);
    assert.equal(recorded.condition.currency, null);
    const status = await readStatus(fixture);
    assert.equal(status.effective.status, "NOT_REQUIRED");

    // A guessed requirement is honestly UNKNOWN, never a fabricated figure.
    const unknownFixture = await seedFixture("unknown-requirement");
    await recordConditionAs({
      authority: contractAuthorityCodes(unknownFixture),
      fixture: unknownFixture,
      label: "unknown-requirement",
      payments,
      requirement: "unknown",
      revision: (await readStatus(unknownFixture)).projectRevision,
    });
    const unknownStatus = await readStatus(unknownFixture);
    assert.equal(unknownStatus.effective.status, "UNKNOWN");
    assert.equal(
      unknownStatus.effective.reasonCode,
      "contract_requirement_unknown"
    );
  }
);

/* ------------------------------------------------------------------------- *
 * Group C — staff and financial authority
 * ------------------------------------------------------------------------- */

guardedTest(
  "an unassigned lawyer, an admin and the customer cannot record a condition",
  async () => {
    const fixture = await seedFixture("authority-negatives");
    const payments = createServicePaymentRepository();
    const revision = (await readStatus(fixture)).projectRevision;
    for (const actorUserId of [
      fixture.unassignedLawyerUserId,
      fixture.adminUserId,
      fixture.ownerUserId,
    ]) {
      await expectPaymentError(
        () =>
          payments.loadContractTarget({
            actorUserId,
            agreementVersionId: fixture.agreementVersionId,
            amountMinor: DEFAULT_AMOUNT_MINOR,
            contractualBasisCode: "agreement_clause",
            contractualBasisRef: "clause:1.1",
            currency: DEFAULT_CURRENCY,
            engagementId: fixture.engagementId,
            projectId: fixture.projectId,
            requirement: "required",
          }),
        "not_found"
      );
      await expectPaymentError(
        () =>
          payments.recordCondition({
            actorUserId,
            agreementVersionId: fixture.agreementVersionId,
            amountMinor: DEFAULT_AMOUNT_MINOR,
            contractAuthorityCode: "synthetic_test_contract_payment_authority",
            contractAuthorityRequestSha256: sha256("forged-authority"),
            contractObservationSha256: sha256("forged-observation"),
            contractualBasisCode: "agreement_clause",
            contractualBasisRef: "clause:1.1",
            currency: DEFAULT_CURRENCY,
            engagementId: fixture.engagementId,
            expectedProjectRevision: revision,
            operationId: operationKey("authority-forged"),
            projectId: fixture.projectId,
            requestHash: sha256("authority-forged"),
            requirement: "required",
          }),
        "not_found"
      );
    }
    const status = await readStatus(fixture);
    assert.equal(status.condition, null);
    assert.equal(status.effective.status, "UNKNOWN");
  }
);

guardedTest(
  "a forged authority binding is refused even for an eligible operator",
  async () => {
    const fixture = await seedFixture("forged-binding");
    const payments = createServicePaymentRepository();
    const revision = (await readStatus(fixture)).projectRevision;
    const target = await payments.loadContractTarget({
      actorUserId: fixture.operatorUserId,
      agreementVersionId: fixture.agreementVersionId,
      amountMinor: DEFAULT_AMOUNT_MINOR,
      contractualBasisCode: "agreement_clause",
      contractualBasisRef: "clause:1.1",
      currency: DEFAULT_CURRENCY,
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
      requirement: "required",
    });
    await expectPaymentError(
      () =>
        payments.recordCondition({
          actorUserId: fixture.operatorUserId,
          agreementVersionId: fixture.agreementVersionId,
          amountMinor: DEFAULT_AMOUNT_MINOR + 1,
          contractAuthorityCode: "synthetic_test_contract_payment_authority",
          contractAuthorityRequestSha256: target.authorityRequest.requestSha256,
          contractObservationSha256: target.contractObservationSha256,
          contractualBasisCode: "agreement_clause",
          contractualBasisRef: "clause:1.1",
          currency: DEFAULT_CURRENCY,
          engagementId: fixture.engagementId,
          expectedProjectRevision: revision,
          operationId: operationKey("forged-binding"),
          projectId: fixture.projectId,
          requestHash: sha256("forged-binding"),
          requirement: "required",
        }),
      "authority_denied"
    );
  }
);

guardedTest(
  "the customer can read status but cannot submit or verify payment evidence",
  async () => {
    const fixture = await seedFixture("customer-negatives");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "customer-negatives-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const status = await readStatus(fixture);
    assert.equal(status.scope, "owner");
    await expectPaymentError(
      () =>
        payments.loadFinanceTarget({
          action: "submit_evidence",
          actorUserId: fixture.ownerUserId,
          conditionId: condition.condition.conditionId,
          engagementId: fixture.engagementId,
          projectId: fixture.projectId,
        }),
      "not_found"
    );
    await expectPaymentError(
      () =>
        payments.submitEvidence({
          actorUserId: fixture.ownerUserId,
          conditionId: condition.condition.conditionId,
          declaredAmountMinor: DEFAULT_AMOUNT_MINOR,
          declaredCurrency: DEFAULT_CURRENCY,
          engagementId: fixture.engagementId,
          evidenceCategory: "external_transfer_receipt",
          expectedProjectRevision: condition.projectRevision,
          financeAuthorityCode: "synthetic_test_finance_attestation_authority",
          financeAuthorityRequestSha256: sha256("forged-finance"),
          observationSha256: sha256("customer-observation"),
          operationId: operationKey("customer-submit"),
          paidAt: new Date(),
          projectId: fixture.projectId,
          referenceSha256: sha256("customer-reference"),
          requestHash: sha256("customer-submit"),
        }),
      "not_found"
    );
  }
);

/* ------------------------------------------------------------------------- *
 * Group D — payment evidence
 * ------------------------------------------------------------------------- */

guardedTest(
  "evidence must match the condition amount and currency",
  async () => {
    const fixture = await seedFixture("evidence-amount");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "evidence-amount-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    await expectPaymentError(
      () =>
        submitEvidenceAs({
          amountMinor: DEFAULT_AMOUNT_MINOR - 1,
          authority: finance,
          conditionId: condition.condition.conditionId,
          fixture,
          label: "evidence-amount-wrong",
          payments,
          revision: condition.projectRevision,
        }),
      "invalid_request"
    );
    // The database FK is the second line of defence for the same invariant.
    const sql = singleSessionClient();
    try {
      await expectSqlFailure(
        () =>
          sql`
          INSERT INTO "ServicePaymentEvidence" (
            "projectId", "engagementId", "conditionId", "agreementVersionId",
            "agreementTermsSha256", "evidenceCategory", "referenceSha256",
            "observationSha256", "declaredAmountMinor", "declaredCurrency",
            "paidAt", "submittedByUserId", "submittedAt", "submittedProjectRevision",
            "submittedOperationRecordId"
          ) VALUES (
            ${fixture.projectId}, ${fixture.engagementId}, ${condition.condition.conditionId},
            ${fixture.agreementVersionId}, ${fixture.termsSha256}, 'external_transfer_receipt',
            ${sha256("direct-reference")}, ${sha256("direct-observation")},
            ${DEFAULT_AMOUNT_MINOR - 5}, ${DEFAULT_CURRENCY}, now(),
            ${fixture.operatorUserId}, now(), 1, ${randomUUID()}
          )
        `,
        { code: "23503" }
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
    const status = await readStatus(fixture);
    assert.equal(status.evidences.length, 0);
    assert.equal(status.effective.status, "REQUIRED_UNSATISFIED");
  }
);

guardedTest(
  "a pending receipt is pending, and the submitter cannot verify it",
  async () => {
    const fixture = await seedFixture("evidence-pending");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "evidence-pending-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const evidence = await submitEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      fixture,
      label: "evidence-pending",
      payments,
      revision: condition.projectRevision,
    });
    assert.equal(evidence.evidence.verificationStatus, "pending");
    const pending = await readStatus(fixture);
    assert.equal(pending.effective.status, "EVIDENCE_PENDING");
    assert.equal(pending.effective.effectiveEvidenceId, null);

    const verifier = createSyntheticServicePaymentEvidenceVerifier({
      records: [
        {
          amountMinor: DEFAULT_AMOUNT_MINOR,
          currency: DEFAULT_CURRENCY,
          evidenceId: evidence.evidence.evidenceId,
          observationSha256: sha256("evidence-pending-observation"),
          outcome: "verified",
        },
      ],
    });
    // The operator submitted it, so the operator cannot also verify it.
    await expectPaymentError(
      () =>
        verifyEvidenceAs({
          actorUserId: fixture.operatorUserId,
          authority: finance,
          conditionId: condition.condition.conditionId,
          evidenceId: evidence.evidence.evidenceId,
          fixture,
          label: "evidence-self-verify",
          payments,
          revision: evidence.projectRevision,
          verifier,
        }),
      "forbidden"
    );
  }
);

guardedTest(
  "the same receipt digest cannot be submitted twice for one condition",
  async () => {
    const fixture = await seedFixture("evidence-duplicate");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "evidence-duplicate-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const referenceSha256 = sha256("duplicate-reference");
    const first = await submitEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      fixture,
      label: "evidence-duplicate-1",
      payments,
      referenceSha256,
      revision: condition.projectRevision,
    });
    await assert.rejects(
      () =>
        submitEvidenceAs({
          authority: finance,
          conditionId: condition.condition.conditionId,
          fixture,
          label: "evidence-duplicate-2",
          payments,
          referenceSha256,
          revision: first.projectRevision,
        }),
      (error: unknown) => {
        const details = pgErrorDetails(error);
        return (
          details.code === "23505" &&
          details.constraint ===
            "ServicePaymentEvidence_condition_reference_unique"
        );
      }
    );
  }
);

guardedTest("a rejected receipt cannot satisfy the condition", async () => {
  const fixture = await seedFixture("evidence-rejected");
  const payments = createServicePaymentRepository();
  const authority = contractAuthorityCodes(fixture);
  const finance = financeAuthorityFor(fixture);
  const condition = await recordConditionAs({
    authority,
    fixture,
    label: "evidence-rejected-condition",
    payments,
    revision: (await readStatus(fixture)).projectRevision,
  });
  const evidence = await submitEvidenceAs({
    authority: finance,
    conditionId: condition.condition.conditionId,
    fixture,
    label: "evidence-rejected",
    payments,
    revision: condition.projectRevision,
  });
  const verifier = createSyntheticServicePaymentEvidenceVerifier({
    records: [
      {
        amountMinor: DEFAULT_AMOUNT_MINOR,
        currency: DEFAULT_CURRENCY,
        evidenceId: evidence.evidence.evidenceId,
        observationSha256: sha256("evidence-rejected-observation"),
        outcome: "rejected",
        reasonCode: "receipt_not_legible",
      },
    ],
  });
  const rejected = await verifyEvidenceAs({
    authority: finance,
    conditionId: condition.condition.conditionId,
    evidenceId: evidence.evidence.evidenceId,
    fixture,
    label: "evidence-rejected-verify",
    payments,
    revision: evidence.projectRevision,
    verifier,
  });
  assert.equal(rejected.evidence.verificationStatus, "rejected");
  const status = await readStatus(fixture);
  assert.equal(status.effective.status, "REQUIRED_UNSATISFIED");
});

/* ------------------------------------------------------------------------- *
 * Group E — satisfaction, correction and reversal
 * ------------------------------------------------------------------------- */

guardedTest(
  "verified evidence satisfies, then a refund removes satisfaction",
  async () => {
    const fixture = await seedFixture("satisfied-refund");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "satisfied-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const evidence = await submitEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      fixture,
      label: "satisfied-evidence",
      payments,
      revision: condition.projectRevision,
    });
    const verifier = createSyntheticServicePaymentEvidenceVerifier({
      records: [
        {
          amountMinor: DEFAULT_AMOUNT_MINOR,
          currency: DEFAULT_CURRENCY,
          evidenceId: evidence.evidence.evidenceId,
          observationSha256: sha256("satisfied-evidence-observation"),
          outcome: "verified",
        },
      ],
    });
    const verified = await verifyEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: evidence.evidence.evidenceId,
      fixture,
      label: "satisfied-verify",
      payments,
      revision: evidence.projectRevision,
      verifier,
    });
    assert.equal(verified.evidence.verificationStatus, "verified");
    const satisfied = await readStatus(fixture);
    assert.equal(satisfied.effective.status, "SATISFIED");
    assert.equal(
      satisfied.effective.effectiveEvidenceId,
      evidence.evidence.evidenceId
    );

    const resolver = createSyntheticServicePaymentReversalResolver({
      records: [
        {
          conditionId: condition.condition.conditionId,
          evidenceId: evidence.evidence.evidenceId,
          observationSha256: sha256("refund-observation"),
          resolutionKind: "refund",
        },
      ],
    });
    const refund = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: evidence.evidence.evidenceId,
      fixture,
      kind: "refund",
      label: "satisfied-refund",
      payments,
      reasonCode: "refunded_by_bank",
      resolver,
      revision: verified.projectRevision,
    });
    assert.equal(refund.replayed, false);
    const afterRefund = await readStatus(fixture);
    assert.equal(afterRefund.effective.status, "REVERSED");
    assert.equal(afterRefund.effective.reasonCode, "payment_refunded");
    assert.equal(afterRefund.effective.effectiveEvidenceId, null);
    // The verified attestation itself is preserved as immutable history.
    assert.equal(afterRefund.evidences[0]?.verificationStatus, "verified");
    assert.equal(afterRefund.resolutions.length, 1);
  }
);

guardedTest(
  "a correction restores a mistaken dispute without rewriting history",
  async () => {
    const fixture = await seedFixture("correction");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "correction-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const evidence = await submitEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      fixture,
      label: "correction-evidence",
      payments,
      revision: condition.projectRevision,
    });
    const verifier = createSyntheticServicePaymentEvidenceVerifier({
      records: [
        {
          amountMinor: DEFAULT_AMOUNT_MINOR,
          currency: DEFAULT_CURRENCY,
          evidenceId: evidence.evidence.evidenceId,
          observationSha256: sha256("correction-evidence-observation"),
          outcome: "verified",
        },
      ],
    });
    const verified = await verifyEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: evidence.evidence.evidenceId,
      fixture,
      label: "correction-verify",
      payments,
      revision: evidence.projectRevision,
      verifier,
    });
    const dispute = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: evidence.evidence.evidenceId,
      fixture,
      kind: "dispute",
      label: "correction-dispute",
      payments,
      reasonCode: "customer_claims_not_received",
      revision: verified.projectRevision,
    });
    assert.equal((await readStatus(fixture)).effective.status, "DISPUTED");
    await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: null,
      fixture,
      kind: "correction",
      label: "correction-correction",
      payments,
      reasonCode: "dispute_raised_in_error",
      revision: dispute.projectRevision,
      supersedesResolutionId: dispute.resolution.resolutionId,
    });
    const status = await readStatus(fixture);
    assert.equal(status.effective.status, "SATISFIED");
    assert.equal(status.resolutions.length, 2);
    assert.equal(
      status.resolutions.filter((row) => row.kind === "correction")[0]
        ?.supersedesResolutionId,
      dispute.resolution.resolutionId
    );
  }
);

guardedTest(
  "replaying a refund does not duplicate resolution history",
  async () => {
    const fixture = await seedFixture("reversal-replay");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "reversal-replay-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const evidence = await submitEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      fixture,
      label: "reversal-replay-evidence",
      payments,
      revision: condition.projectRevision,
    });
    const verifier = createSyntheticServicePaymentEvidenceVerifier({
      records: [
        {
          amountMinor: DEFAULT_AMOUNT_MINOR,
          currency: DEFAULT_CURRENCY,
          evidenceId: evidence.evidence.evidenceId,
          observationSha256: sha256("reversal-replay-observation"),
          outcome: "verified",
        },
      ],
    });
    const verified = await verifyEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: evidence.evidence.evidenceId,
      fixture,
      label: "reversal-replay-verify",
      payments,
      revision: evidence.projectRevision,
      verifier,
    });
    const resolver = createSyntheticServicePaymentReversalResolver({
      records: [
        {
          conditionId: condition.condition.conditionId,
          evidenceId: evidence.evidence.evidenceId,
          observationSha256: sha256("reversal-observation"),
          resolutionKind: "reversal",
        },
      ],
    });
    const operationId = operationKey("reversal-replay");
    const first = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: evidence.evidence.evidenceId,
      fixture,
      kind: "reversal",
      label: "reversal-replay",
      operationId,
      payments,
      reasonCode: "bank_reversal",
      resolver,
      revision: verified.projectRevision,
    });
    const replay = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: evidence.evidence.evidenceId,
      fixture,
      kind: "reversal",
      label: "reversal-replay",
      operationId,
      payments,
      reasonCode: "bank_reversal",
      resolver,
      revision: verified.projectRevision,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.resolution.resolutionId, first.resolution.resolutionId);
    const status = await readStatus(fixture);
    assert.equal(status.resolutions.length, 1);
  }
);

/* ------------------------------------------------------------------------- *
 * Group F — idempotency and concurrency
 * ------------------------------------------------------------------------- */

guardedTest(
  "an exact replay returns the same condition and a changed request conflicts",
  async () => {
    const fixture = await seedFixture("idempotency");
    const payments = createServicePaymentRepository();
    const revision = (await readStatus(fixture)).projectRevision;
    const target = await payments.loadContractTarget({
      actorUserId: fixture.operatorUserId,
      agreementVersionId: fixture.agreementVersionId,
      amountMinor: DEFAULT_AMOUNT_MINOR,
      contractualBasisCode: "agreement_clause",
      contractualBasisRef: "clause:1.1",
      currency: DEFAULT_CURRENCY,
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
      requirement: "required",
    });
    const operationId = operationKey("idempotency");
    const identity = (amountMinor: number, revision: number) =>
      hashServicePaymentOperationRequest(
        servicePaymentConditionRequestIdentity({
          agreementTermsSha256: target.authorityRequest.agreementTermsSha256,
          agreementVersionId: fixture.agreementVersionId,
          amountMinor,
          contractualBasisCode: "agreement_clause",
          contractualBasisRef: "clause:1.1",
          contractAuthorityCode: "synthetic_test_contract_payment_authority",
          contractObservationSha256: target.contractObservationSha256,
          currency: DEFAULT_CURRENCY,
          engagementId: fixture.engagementId,
          expectedProjectRevision: revision,
          projectId: fixture.projectId,
          requirement: "required",
        })
      );
    const requestHash = identity(DEFAULT_AMOUNT_MINOR, revision);
    const input = {
      actorUserId: fixture.operatorUserId,
      agreementVersionId: fixture.agreementVersionId,
      amountMinor: DEFAULT_AMOUNT_MINOR,
      contractAuthorityCode: "synthetic_test_contract_payment_authority",
      contractAuthorityRequestSha256: target.authorityRequest.requestSha256,
      contractObservationSha256: target.contractObservationSha256,
      contractualBasisCode: "agreement_clause" as const,
      contractualBasisRef: "clause:1.1",
      currency: DEFAULT_CURRENCY,
      engagementId: fixture.engagementId,
      expectedProjectRevision: revision,
      operationId,
      projectId: fixture.projectId,
      requestHash,
      requirement: "required" as const,
    };
    const first = await payments.recordCondition(input);
    const replay = await payments.recordCondition(input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.condition.conditionId, first.condition.conditionId);
    // Same key, semantically different request: a canonical identity conflict.
    await expectPaymentError(
      () =>
        payments.recordCondition({
          ...input,
          amountMinor: DEFAULT_AMOUNT_MINOR + 1,
          requestHash: identity(DEFAULT_AMOUNT_MINOR + 1, revision),
        }),
      "idempotency_conflict"
    );
    // A caller cannot smuggle a different identity past the derived hash either.
    await expectPaymentError(
      () =>
        payments.recordCondition({
          ...input,
          requestHash: sha256("forged-request-identity"),
        }),
      "integrity_conflict"
    );
  }
);

guardedTest("a stale project revision is refused", async () => {
  const fixture = await seedFixture("revision");
  const payments = createServicePaymentRepository();
  const authority = contractAuthorityCodes(fixture);
  const revision = (await readStatus(fixture)).projectRevision;
  const first = await recordConditionAs({
    authority,
    fixture,
    label: "revision-first",
    payments,
    revision,
  });
  await expectPaymentError(
    () =>
      recordConditionAs({
        authority,
        fixture,
        label: "revision-stale",
        payments,
        revision,
        amountMinor: 310_000,
      }),
    "revision_conflict"
  );
  assert.equal(first.projectRevision, revision + 1);
});

guardedTest("concurrent conditions cannot both finalize", async () => {
  const fixture = await seedFixture("concurrency");
  const payments = createServicePaymentRepository();
  const revision = (await readStatus(fixture)).projectRevision;
  const results = await Promise.allSettled([
    recordConditionAs({
      authority: contractAuthorityCodes(fixture),
      fixture,
      label: "concurrency-a",
      payments,
      revision,
      amountMinor: 400_000,
    }),
    recordConditionAs({
      authority: contractAuthorityCodes(fixture),
      fixture,
      label: "concurrency-b",
      payments,
      revision,
      amountMinor: 410_000,
    }),
  ]);
  const fulfilled = results.filter((entry) => entry.status === "fulfilled");
  const rejected = results.filter((entry) => entry.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const failure = rejected[0] as PromiseRejectedResult;
  assert.ok(
    failure.reason instanceof ServicePaymentError &&
      ["revision_conflict", "state_conflict"].includes(failure.reason.code),
    `unexpected concurrent failure: ${String(failure.reason)}`
  );
  const sql = singleSessionClient();
  try {
    const [counts] = await sql<{ live: number }[]>`
      select count(*) filter (where "supersededAt" is null)::int as live
      from "ServicePaymentCondition" where "engagementId" = ${fixture.engagementId}
    `;
    assert.equal(counts?.live, 1);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

guardedTest(
  "evidence evaluation is single-shot, so two verifiers cannot both finalize",
  async () => {
    const fixture = await seedFixture("verify-once");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "verify-once-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const evidence = await submitEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      fixture,
      label: "verify-once-evidence",
      payments,
      revision: condition.projectRevision,
    });
    const verifier = createSyntheticServicePaymentEvidenceVerifier({
      records: [
        {
          amountMinor: DEFAULT_AMOUNT_MINOR,
          currency: DEFAULT_CURRENCY,
          evidenceId: evidence.evidence.evidenceId,
          observationSha256: sha256("verify-once-observation"),
          outcome: "verified",
        },
      ],
    });
    const verified = await verifyEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: evidence.evidence.evidenceId,
      fixture,
      label: "verify-once-first",
      payments,
      revision: evidence.projectRevision,
      verifier,
    });
    await expectPaymentError(
      () =>
        verifyEvidenceAs({
          authority: finance,
          conditionId: condition.condition.conditionId,
          evidenceId: evidence.evidence.evidenceId,
          fixture,
          label: "verify-once-second",
          payments,
          revision: verified.projectRevision,
          verifier,
        }),
      "state_conflict"
    );
  }
);

/* ------------------------------------------------------------------------- *
 * Group G — isolation and compatibility
 * ------------------------------------------------------------------------- */

guardedTest(
  "two independent Projects cannot share payment records",
  async () => {
    const first = await seedFixture("isolation-a");
    const second = await seedFixture("isolation-b");
    const payments = createServicePaymentRepository();
    const condition = await recordConditionAs({
      authority: contractAuthorityCodes(first),
      fixture: first,
      label: "isolation-a-condition",
      payments,
      revision: (await readStatus(first)).projectRevision,
    });
    // Project B cannot read Project A's engagement status.
    await expectPaymentError(
      () =>
        payments.loadPaymentStatus({
          actorUserId: second.ownerUserId,
          engagementId: first.engagementId,
          projectId: second.projectId,
        }),
      "not_found"
    );
    // Project A's condition cannot be used under Project B.
    await expectPaymentError(
      () =>
        payments.loadFinanceTarget({
          action: "submit_evidence",
          actorUserId: second.operatorUserId,
          conditionId: condition.condition.conditionId,
          engagementId: second.engagementId,
          projectId: second.projectId,
        }),
      "not_found"
    );
    const secondStatus = await readStatus(second);
    assert.equal(secondStatus.condition, null);
    assert.equal(secondStatus.effective.status, "UNKNOWN");
  }
);

guardedTest(
  "an M4-004 agreement acceptance never creates payment evidence",
  async () => {
    const fixture = await seedFixture("acceptance-not-payment");
    const status = await readStatus(fixture);
    assert.equal(status.condition, null);
    assert.equal(status.evidences.length, 0);
    assert.equal(status.resolutions.length, 0);
    assert.equal(status.effective.status, "UNKNOWN");
    assert.equal(status.effective.conditionId, null);
    const sql = singleSessionClient();
    try {
      const [counts] = await sql<{ evidence: number; resolution: number }[]>`
      select (select count(*)::int from "ServicePaymentEvidence" where "engagementId" = ${fixture.engagementId}) as evidence,
             (select count(*)::int from "ServicePaymentResolution" where "engagementId" = ${fixture.engagementId}) as resolution
    `;
      assert.equal(counts?.evidence, 0);
      assert.equal(counts?.resolution, 0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

/* ------------------------------------------------------------------------- *
 * Group H — safety and audit protection
 * ------------------------------------------------------------------------- */

guardedTest(
  "the deny-by-default verifier leaves the record pending",
  async () => {
    const fixture = await seedFixture("deny-default");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "deny-default-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const evidence = await submitEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      fixture,
      label: "deny-default-evidence",
      payments,
      revision: condition.projectRevision,
    });
    const target = await payments.loadFinanceTarget({
      action: "verify_evidence",
      actorUserId: fixture.verifierUserId,
      conditionId: condition.condition.conditionId,
      engagementId: fixture.engagementId,
      evidenceId: evidence.evidence.evidenceId,
      projectId: fixture.projectId,
    });
    assert.ok(target.verification);
    const outcome = await denyAllServicePaymentEvidenceVerifier.verify(
      target.verification
    );
    await expectPaymentError(
      () =>
        payments.recordEvidenceVerification({
          actorUserId: fixture.verifierUserId,
          engagementId: fixture.engagementId,
          evidenceId: evidence.evidence.evidenceId,
          expectedProjectRevision: evidence.projectRevision,
          financeAuthorityCode: "synthetic_test_finance_attestation_authority",
          financeAuthorityRequestSha256: target.authorityRequest.requestSha256,
          operationId: operationKey("deny-default-verify"),
          outcome,
          projectId: fixture.projectId,
          requestHash: sha256("deny-default-verify"),
        }),
      "verification_unavailable"
    );
    const status = await readStatus(fixture);
    assert.equal(status.effective.status, "EVIDENCE_PENDING");
  }
);

guardedTest(
  "payment evidence and resolutions are append-only at the database level",
  async () => {
    const fixture = await seedFixture("append-only");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "append-only-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const evidence = await submitEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      fixture,
      label: "append-only-evidence",
      payments,
      revision: condition.projectRevision,
    });
    const dispute = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: null,
      fixture,
      kind: "void",
      label: "append-only-void",
      payments,
      reasonCode: "recorded_in_error",
      revision: evidence.projectRevision,
    });
    const sql = singleSessionClient();
    try {
      await expectSqlFailure(
        () => sql`
        UPDATE "ServicePaymentEvidence" SET "declaredAmountMinor" = 1
        WHERE "id" = ${evidence.evidence.evidenceId}
      `,
        {
          code: "23514",
          constraint: "ServicePaymentEvidence_content_immutable",
        }
      );
      await expectSqlFailure(
        () =>
          sql`DELETE FROM "ServicePaymentEvidence" WHERE "id" = ${evidence.evidence.evidenceId}`,
        { code: "23514", constraint: "ServicePaymentEvidence_immutable" }
      );
      await expectSqlFailure(
        () => sql`
        UPDATE "ServicePaymentResolution" SET "reasonCode" = 'rewritten'
        WHERE "id" = ${dispute.resolution.resolutionId}
      `,
        { code: "23514", constraint: "ServicePaymentResolution_immutable" }
      );
      await expectSqlFailure(
        () =>
          sql`DELETE FROM "ServicePaymentResolution" WHERE "id" = ${dispute.resolution.resolutionId}`,
        { code: "23514", constraint: "ServicePaymentResolution_immutable" }
      );
      await expectSqlFailure(
        () => sql`
        UPDATE "ServicePaymentCondition" SET "amountMinor" = 1
        WHERE "id" = ${condition.condition.conditionId}
      `,
        {
          code: "23514",
          constraint: "ServicePaymentCondition_content_immutable",
        }
      );
      await expectSqlFailure(
        () =>
          sql`DELETE FROM "ServicePaymentCondition" WHERE "id" = ${condition.condition.conditionId}`,
        { code: "23514", constraint: "ServicePaymentCondition_immutable" }
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
    // A failed direct mutation must not have changed the derived state.
    const status = await readStatus(fixture);
    assert.equal(status.effective.status, "VOID");
    assert.equal(status.condition?.amountMinor, DEFAULT_AMOUNT_MINOR);
  }
);

test("the guarded suite pins the policy version and closes its database client", async () => {
  assert.equal(
    SERVICE_PAYMENT_POLICY_VERSION,
    "m4-005-service-payment-policy-v1"
  );
  if (isGuardedRun) {
    await closeLazyDatabase();
  }
});

/* ------------------------------------------------------------------------- *
 * R1 FIX-01 — coherent atomic condition replacement
 * ------------------------------------------------------------------------- */

guardedTest(
  "FIX-01: the first condition is created without any predecessor",
  async () => {
    const fixture = await seedFixture("fix01-first");
    const payments = createServicePaymentRepository();
    const created = await recordConditionAs({
      authority: contractAuthorityCodes(fixture),
      fixture,
      label: "fix01-first",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const sql = singleSessionClient();
    try {
      const rows = await sql<
        { supersedes: string | null; supersededBy: string | null }[]
      >`
      select "supersedesConditionId" as supersedes,
             "supersededByConditionId" as "supersededBy"
      from "ServicePaymentCondition" where "id" = ${created.condition.conditionId}
    `;
      assert.equal(rows[0]?.supersedes, null);
      assert.equal(rows[0]?.supersededBy, null);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "FIX-01: replacement retires then inserts with both lineages complete",
  async () => {
    const fixture = await seedFixture("fix01-replace");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const first = await recordConditionAs({
      authority,
      fixture,
      label: "fix01-replace-1",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const second = await recordConditionAs({
      authority,
      fixture,
      label: "fix01-replace-2",
      payments,
      revision: first.projectRevision,
      amountMinor: 260_000,
    });
    const sql = singleSessionClient();
    try {
      const rows = await sql<
        {
          id: string;
          supersedes: string | null;
          supersededAt: string | null;
          supersededBy: string | null;
        }[]
      >`
      select "id", "supersedesConditionId" as supersedes,
             "supersededAt"::text as "supersededAt",
             "supersededByConditionId" as "supersededBy"
      from "ServicePaymentCondition"
      where "engagementId" = ${fixture.engagementId}
      order by "createdAt", "id"
    `;
      assert.equal(rows.length, 2);
      const [oldRow, newRow] = rows;
      assert.ok(oldRow && newRow);
      assert.equal(oldRow.id, first.condition.conditionId);
      assert.ok(oldRow.supersededAt);
      assert.equal(oldRow.supersededBy, second.condition.conditionId);
      assert.equal(newRow.supersedes, first.condition.conditionId);
      assert.equal(newRow.supersededBy, null);
      const [live] = await sql<{ live: number }[]>`
      select count(*)::int as live from "ServicePaymentCondition"
      where "engagementId" = ${fixture.engagementId} and "supersededAt" is null
    `;
      assert.equal(live?.live, 1);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "FIX-01: a failed replacement leaves no partial state",
  async () => {
    const fixture = await seedFixture("fix01-rollback");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const first = await recordConditionAs({
      authority,
      fixture,
      label: "fix01-rollback-1",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const before = await readStatus(fixture);
    // A stale revision is rejected after the identity is derived but before any write.
    await expectPaymentError(
      () =>
        recordConditionAs({
          authority,
          fixture,
          label: "fix01-rollback-2",
          payments,
          revision: first.projectRevision - 1,
          amountMinor: 270_000,
        }),
      "revision_conflict"
    );
    const after = await readStatus(fixture);
    assert.equal(after.projectRevision, before.projectRevision);
    assert.equal(after.condition?.conditionId, first.condition.conditionId);
    assert.equal(after.condition?.live, true);
    const sql = singleSessionClient();
    try {
      const [counts] = await sql<{ total: number; operations: number }[]>`
      select (select count(*)::int from "ServicePaymentCondition"
                where "engagementId" = ${fixture.engagementId}) as total,
             (select count(*)::int from "ProjectOperation"
                where "operationType" = 'service_payment_condition_record'
                  and "actorUserId" = ${fixture.operatorUserId}
                  and "resultId" <> ${first.condition.conditionId}) as operations
    `;
      assert.equal(counts?.total, 1);
      // The rejected attempt must not leave an orphan operation or condition row.
      assert.equal(counts?.operations, 0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "FIX-01: direct SQL cannot forge a one-sided supersession",
  async () => {
    const fixture = await seedFixture("fix01-tamper");
    const payments = createServicePaymentRepository();
    const condition = await recordConditionAs({
      authority: contractAuthorityCodes(fixture),
      fixture,
      label: "fix01-tamper",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const sql = singleSessionClient();
    try {
      // Cannot retire a condition without naming its successor.
      await expectSqlFailure(
        () => sql`
        UPDATE "ServicePaymentCondition"
        SET "supersededAt" = now(), "supersededProjectRevision" = 1,
            "supersededOperationRecordId" = "createdOperationRecordId"
        WHERE "id" = ${condition.condition.conditionId}
      `,
        { code: "23514" }
      );
      // Cannot point at a successor that does not exist (deferred FK at COMMIT).
      await sql
        .begin(async (tx) => {
          await tx`
        UPDATE "ServicePaymentCondition"
        SET "supersededAt" = now(),
            "supersededByConditionId" = ${randomUUID()},
            "supersededProjectRevision" = 1,
            "supersededOperationRecordId" = "createdOperationRecordId"
        WHERE "id" = ${condition.condition.conditionId}
      `;
        })
        .then(
          () => {
            throw new Error(
              "a dangling successor pointer must be refused at commit"
            );
          },
          (error: unknown) => {
            const details = pgErrorDetails(error);
            assert.ok(
              details.code === "23503" ||
                details.constraint ===
                  "ServicePaymentCondition_superseded_by_fk",
              `unexpected error ${details.code ?? "none"} ${details.constraint ?? ""}`
            );
          }
        );
    } finally {
      await sql.end({ timeout: 5 });
    }
    // The original condition is still live and unmodified.
    const status = await readStatus(fixture);
    assert.equal(
      status.condition?.conditionId,
      condition.condition.conditionId
    );
    assert.equal(status.condition?.live, true);
  }
);

/* ------------------------------------------------------------------------- *
 * R1 FIX-02 — staff disclosure boundary
 * ------------------------------------------------------------------------- */

guardedTest(
  "FIX-02: an assigned lawyer cannot read payment status without disclosure authority",
  async () => {
    const fixture = await seedFixture("fix02-lawyer");
    const payments = createServicePaymentRepository();
    await recordConditionAs({
      authority: contractAuthorityCodes(fixture),
      fixture,
      label: "fix02-lawyer-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    // An active M4-002 assignment is not a financial-disclosure decision.
    await expectPaymentError(
      () => readStatus(fixture, fixture.operatorUserId),
      "not_found"
    );
    // The customer owner still reads their own safe status.
    const owner = await readStatus(fixture);
    assert.equal(owner.scope, "owner");
    assert.equal(owner.provenance, null);
  }
);

guardedTest(
  "FIX-02: an explicitly scoped synthetic disclosure allows an operator read",
  async () => {
    const fixture = await seedFixture("fix02-granted");
    const payments = createServicePaymentRepository();
    await recordConditionAs({
      authority: contractAuthorityCodes(fixture),
      fixture,
      label: "fix02-granted-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const authority = statusReadAuthorityFor(fixture, fixture.operatorUserId);
    const operatorView = await readStatus(
      fixture,
      fixture.operatorUserId,
      authority
    );
    assert.equal(operatorView.scope, "operator");
    assert.ok(operatorView.provenance);
    assert.equal(
      operatorView.provenance?.readAuthorityCode,
      "synthetic_test_payment_status_read_authority"
    );
    // A grant pinned to one engagement never discloses another engagement.
    const other = await seedFixture("fix02-granted-other");
    await expectPaymentError(
      () =>
        readStatus(
          other,
          fixture.operatorUserId,
          statusReadAuthorityFor(other, fixture.operatorUserId)
        ),
      "not_found"
    );
  }
);

/* ------------------------------------------------------------------------- *
 * R1 FIX-03 — history-independent evaluation
 * ------------------------------------------------------------------------- */

guardedTest(
  "FIX-03: a void older than the display window still yields VOID",
  async () => {
    const fixture = await seedFixture("fix03-void");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "fix03-void-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const voidResolution = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: null,
      fixture,
      kind: "void",
      label: "fix03-void",
      payments,
      reasonCode: "recorded_in_error",
      revision: condition.projectRevision,
    });
    // Push the void far outside any display window (SERVICE_PAYMENT_HISTORY_MAX = 50).
    let revision = voidResolution.projectRevision;
    for (let index = 0; index < 55; index += 1) {
      const dispute = await recordResolutionAs({
        authority: finance,
        conditionId: condition.condition.conditionId,
        evidenceId: null,
        fixture,
        kind: "void",
        label: `fix03-void-noise-${index}`,
        payments,
        reasonCode: "recorded_in_error",
        revision,
      });
      revision = dispute.projectRevision;
    }
    const status = await readStatus(fixture);
    assert.equal(status.effective.status, "VOID");
    assert.ok(status.resolutions.length <= 50);
  }
);

guardedTest(
  "FIX-03: an uncorrected dispute outside the window still blocks satisfaction",
  async () => {
    const fixture = await seedFixture("fix03-dispute");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "fix03-dispute-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const evidence = await submitEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      fixture,
      label: "fix03-dispute-evidence",
      payments,
      revision: condition.projectRevision,
    });
    const verifier = createSyntheticServicePaymentEvidenceVerifier({
      records: [
        {
          amountMinor: DEFAULT_AMOUNT_MINOR,
          currency: DEFAULT_CURRENCY,
          evidenceId: evidence.evidence.evidenceId,
          observationSha256: sha256("fix03-dispute-observation"),
          outcome: "verified",
        },
      ],
    });
    const verified = await verifyEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: evidence.evidence.evidenceId,
      fixture,
      label: "fix03-dispute-verify",
      payments,
      revision: evidence.projectRevision,
      verifier,
    });
    const dispute = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: evidence.evidence.evidenceId,
      fixture,
      kind: "dispute",
      label: "fix03-dispute",
      payments,
      reasonCode: "customer_claims_not_received",
      revision: verified.projectRevision,
    });
    let revision = dispute.projectRevision;
    for (let index = 0; index < 55; index += 1) {
      const followUp = await recordResolutionAs({
        authority: finance,
        conditionId: condition.condition.conditionId,
        evidenceId: evidence.evidence.evidenceId,
        fixture,
        kind: "dispute",
        label: `fix03-dispute-noise-${index}`,
        payments,
        reasonCode: "customer_claims_not_received",
        revision,
      });
      revision = followUp.projectRevision;
    }
    const status = await readStatus(fixture);
    assert.equal(status.effective.status, "DISPUTED");
    // The verified attestation is still immutable history, just not effective.
    assert.equal(status.evidences[0]?.verificationStatus, "verified");
  }
);

/* ------------------------------------------------------------------------- *
 * R1 FIX-04 — contract-currentness during verification
 * ------------------------------------------------------------------------- */

guardedTest(
  "FIX-04: verification fails closed once the agreement is replaced",
  async () => {
    const fixture = await seedFixture("fix04-stale");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "fix04-stale-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const evidence = await submitEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      fixture,
      label: "fix04-stale-evidence",
      payments,
      revision: condition.projectRevision,
    });
    // Replace the agreement version before the evidence is evaluated.
    const engagements = createServiceEngagementRepository();
    const terms = canonicalTerms();
    const nextDraftId = randomUUID();
    const draftAuthority = await engagements.loadServiceOperatorContext({
      action: "author_draft",
      actorUserId: fixture.operatorUserId,
      draft: {
        agreementVersionId: nextDraftId,
        scopeCodes: ["school_admissions"],
        serviceMode: "self_service",
        termsSha256: terms.termsSha256,
      },
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    const draft = await engagements.createAgreementVersion({
      actorUserId: fixture.operatorUserId,
      agreementVersionId: nextDraftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: draftAuthority.operatorAuthority.requestSha256,
      engagementId: fixture.engagementId,
      expectedProjectRevision: evidence.projectRevision,
      operationId: operationKey("fix04-draft"),
      projectId: fixture.projectId,
      requestHash: sha256("fix04-draft"),
      scopeCodes: ["school_admissions"],
      serviceMode: "self_service",
      termsPayload: terms.payload,
      termsSha256: terms.termsSha256,
    });
    const issueAuthority = await engagements.loadServiceOperatorContext({
      action: "issue",
      actorUserId: fixture.operatorUserId,
      agreementVersionId: nextDraftId,
      engagementId: fixture.engagementId,
      projectId: fixture.projectId,
    });
    await engagements.issueAgreementVersion({
      actorUserId: fixture.operatorUserId,
      agreementVersionId: nextDraftId,
      authorityCode: "synthetic_test_contract_operator",
      authorityRequestSha256: issueAuthority.operatorAuthority.requestSha256,
      engagementId: fixture.engagementId,
      expectedProjectRevision: draft.projectRevision,
      operationId: operationKey("fix04-issue"),
      projectId: fixture.projectId,
      requestHash: sha256("fix04-issue"),
    });
    const verifier = createSyntheticServicePaymentEvidenceVerifier({
      records: [
        {
          amountMinor: DEFAULT_AMOUNT_MINOR,
          currency: DEFAULT_CURRENCY,
          evidenceId: evidence.evidence.evidenceId,
          observationSha256: sha256("fix04-stale-observation"),
          outcome: "verified",
        },
      ],
    });
    const revisionAfterReplacement = (await readStatus(fixture))
      .projectRevision;
    await expectPaymentError(
      () =>
        verifyEvidenceAs({
          authority: finance,
          conditionId: condition.condition.conditionId,
          evidenceId: evidence.evidence.evidenceId,
          fixture,
          label: "fix04-stale-verify",
          payments,
          revision: revisionAfterReplacement,
          verifier,
        }),
      "state_conflict"
    );
    const status = await readStatus(fixture);
    assert.equal(status.effective.status, "UNKNOWN");
    assert.equal(status.effective.reasonCode, "contract_not_current");
    assert.equal(status.evidences[0]?.verificationStatus, "pending");
  }
);

/* ------------------------------------------------------------------------- *
 * R1 FIX-05 — correction target coherence and identity replay
 * ------------------------------------------------------------------------- */

guardedTest(
  "FIX-05: a correction naming evidence is refused before any write",
  async () => {
    const fixture = await seedFixture("fix05-correction-target");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "fix05-correction-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const dispute = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: null,
      fixture,
      kind: "void",
      label: "fix05-correction-void",
      payments,
      reasonCode: "recorded_in_error",
      revision: condition.projectRevision,
    });
    await expectPaymentError(
      () =>
        payments.recordResolution({
          actorUserId: fixture.verifierUserId,
          conditionId: condition.condition.conditionId,
          engagementId: fixture.engagementId,
          evidenceId: null,
          expectedProjectRevision: dispute.projectRevision,
          financeAuthorityCode: "synthetic_test_finance_attestation_authority",
          financeAuthorityRequestSha256: sha256("forged-correction-authority"),
          observationCode: null,
          observationSha256: sha256("forged-correction-observation"),
          operationId: operationKey("fix05-correction-invalid"),
          projectId: fixture.projectId,
          reasonCode: "dispute_raised_in_error",
          requestHash: sha256("fix05-correction-invalid"),
          resolutionKind: "correction",
          supersedesResolutionId: null,
        }),
      "invalid_request"
    );
  }
);

guardedTest(
  "FIX-05: the same key with a changed semantic request conflicts",
  async () => {
    const fixture = await seedFixture("fix05-identity-conflict");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "fix05-identity-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const operationId = operationKey("fix05-identity-evidence");
    const first = await submitEvidenceAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      fixture,
      label: "fix05-identity-evidence",
      operationId,
      payments,
      referenceSha256: sha256("fix05-identity-reference"),
      revision: condition.projectRevision,
    });
    assert.equal(first.replayed, false);
    // Same key, different paid time: the canonical identity differs, so it conflicts.
    await expectPaymentError(
      () =>
        submitEvidenceAs({
          authority: finance,
          conditionId: condition.condition.conditionId,
          fixture,
          label: "fix05-identity-evidence",
          observationSha256: sha256("fix05-identity-evidence-observation"),
          operationId,
          paidAt: new Date(Date.now() - 60_000),
          payments,
          referenceSha256: sha256("fix05-identity-reference"),
          revision: first.projectRevision,
        }),
      "idempotency_conflict"
    );
  }
);

/* ------------------------------------------------------------------------- *
 * Final pre-database convergence — Corrections A, B and C
 * ------------------------------------------------------------------------- */

guardedTest(
  "Correction A: at most one correction per resolution (catalog + first)",
  async () => {
    const fixture = await seedFixture("r2-correction-a");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "r2-correction-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    // The database index itself must be unique and partial.
    const sql = singleSessionClient();
    try {
      const [index] = await sql<{ definition: string }[]>`
      select indexdef as definition from pg_indexes
      where schemaname = 'public'
        and indexname = 'ServicePaymentResolution_superseded_target_unique'
    `;
      assert.ok(index, "the correction-once index must exist");
      assert.match(index.definition, /CREATE UNIQUE INDEX/u);
      assert.match(index.definition, /supersedesResolutionId\)/u);
      assert.match(
        index.definition,
        /WHERE .*supersedesResolutionId.*IS NOT NULL/u
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
    const voided = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: null,
      fixture,
      kind: "void",
      label: "r2-correction-void",
      payments,
      reasonCode: "recorded_in_error",
      revision: condition.projectRevision,
    });
    // First correction succeeds and is the only active decision afterwards.
    const correction = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: null,
      fixture,
      kind: "correction",
      label: "r2-correction-first",
      payments,
      reasonCode: "void_raised_in_error",
      revision: voided.projectRevision,
      supersedesResolutionId: voided.resolution.resolutionId,
    });
    assert.equal(
      correction.resolution.supersedesResolutionId,
      voided.resolution.resolutionId
    );
    const status = await readStatus(fixture);
    assert.equal(status.effective.status, "REQUIRED_UNSATISFIED");
  }
);

guardedTest(
  "Correction A: a second correction of the same resolution is refused",
  async () => {
    const fixture = await seedFixture("r2-correction-duplicate");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "r2-duplicate-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const voided = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: null,
      fixture,
      kind: "void",
      label: "r2-duplicate-void",
      payments,
      reasonCode: "recorded_in_error",
      revision: condition.projectRevision,
    });
    const first = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: null,
      fixture,
      kind: "correction",
      label: "r2-duplicate-correction-1",
      payments,
      reasonCode: "void_raised_in_error",
      revision: voided.projectRevision,
      supersedesResolutionId: voided.resolution.resolutionId,
    });
    await expectPaymentError(
      () =>
        recordResolutionAs({
          authority: finance,
          conditionId: condition.condition.conditionId,
          evidenceId: null,
          fixture,
          kind: "correction",
          label: "r2-duplicate-correction-2",
          payments,
          reasonCode: "void_raised_in_error_again",
          revision: first.projectRevision,
          supersedesResolutionId: voided.resolution.resolutionId,
        }),
      "state_conflict"
    );
  }
);

guardedTest(
  "Correction A: concurrent corrections cannot both commit",
  async () => {
    const fixture = await seedFixture("r2-correction-concurrent");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "r2-concurrent-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const voided = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: null,
      fixture,
      kind: "void",
      label: "r2-concurrent-void",
      payments,
      reasonCode: "recorded_in_error",
      revision: condition.projectRevision,
    });
    const settle = await Promise.allSettled([
      recordResolutionAs({
        authority: finance,
        conditionId: condition.condition.conditionId,
        evidenceId: null,
        fixture,
        kind: "correction",
        label: "r2-concurrent-correction-a",
        payments,
        reasonCode: "void_raised_in_error",
        revision: voided.projectRevision,
        supersedesResolutionId: voided.resolution.resolutionId,
      }),
      recordResolutionAs({
        authority: finance,
        conditionId: condition.condition.conditionId,
        evidenceId: null,
        fixture,
        kind: "correction",
        label: "r2-concurrent-correction-b",
        payments,
        reasonCode: "void_raised_in_error",
        revision: voided.projectRevision,
        supersedesResolutionId: voided.resolution.resolutionId,
      }),
    ]);
    const fulfilled = settle.filter((entry) => entry.status === "fulfilled");
    const rejected = settle.filter((entry) => entry.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one correction may commit");
    assert.equal(rejected.length, 1);
    const reason = rejected[0] as PromiseRejectedResult;
    assert.ok(reason.reason instanceof ServicePaymentError);
    assert.equal(reason.reason.code, "state_conflict");
    // The database still holds exactly one correction for that target.
    const sql = singleSessionClient();
    try {
      const [counts] = await sql<{ corrections: number }[]>`
      select count(*)::int as corrections from "ServicePaymentResolution"
      where "conditionId" = ${condition.condition.conditionId}
        and "supersedesResolutionId" = ${voided.resolution.resolutionId}
    `;
      assert.equal(counts?.corrections, 1);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);

guardedTest(
  "Correction B: a changed observation code conflicts with the same operation id",
  async () => {
    const fixture = await seedFixture("r2-identity-code");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const finance = financeAuthorityFor(fixture);
    const condition = await recordConditionAs({
      authority,
      fixture,
      label: "r2-identity-code-condition",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const operationId = operationKey("r2-identity-code");
    const first = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: null,
      fixture,
      kind: "void",
      label: "r2-identity-code",
      observationCode: "staff_manual_review",
      operationId,
      payments,
      reasonCode: "recorded_in_error",
      revision: condition.projectRevision,
    });
    // Exact replay of the identical request stays idempotent.
    const replay = await recordResolutionAs({
      authority: finance,
      conditionId: condition.condition.conditionId,
      evidenceId: null,
      fixture,
      kind: "void",
      label: "r2-identity-code",
      observationCode: "staff_manual_review",
      operationId,
      payments,
      reasonCode: "recorded_in_error",
      revision: condition.projectRevision,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.resolution.resolutionId, first.resolution.resolutionId);
    // A materially different persisted observation code is a different request.
    await expectPaymentError(
      () =>
        recordResolutionAs({
          authority: finance,
          conditionId: condition.condition.conditionId,
          evidenceId: null,
          fixture,
          kind: "void",
          label: "r2-identity-code",
          observationCode: "bank_feed_observation",
          operationId,
          payments,
          reasonCode: "recorded_in_error",
          revision: first.projectRevision,
        }),
      "idempotency_conflict"
    );
  }
);

guardedTest(
  "Correction C: replacement targets the live condition, not the newest row",
  async () => {
    const fixture = await seedFixture("r2-live-selection");
    const payments = createServicePaymentRepository();
    const authority = contractAuthorityCodes(fixture);
    const first = await recordConditionAs({
      authority,
      fixture,
      label: "r2-live-1",
      payments,
      revision: (await readStatus(fixture)).projectRevision,
    });
    const second = await recordConditionAs({
      authority,
      fixture,
      label: "r2-live-2",
      payments,
      revision: first.projectRevision,
      amountMinor: 265_000,
    });
    const third = await recordConditionAs({
      authority,
      fixture,
      label: "r2-live-3",
      payments,
      revision: second.projectRevision,
      amountMinor: 275_000,
    });
    const sql = singleSessionClient();
    try {
      const rows = await sql<
        {
          id: string;
          supersedes: string | null;
          supersededAt: string | null;
        }[]
      >`
      select "id", "supersedesConditionId" as supersedes,
             "supersededAt"::text as "supersededAt"
      from "ServicePaymentCondition"
      where "engagementId" = ${fixture.engagementId}
    `;
      assert.equal(rows.length, 3);
      const chain = new Map(rows.map((row) => [row.id, row]));
      // Each hop retires exactly its live predecessor, so the lineage is a single chain.
      assert.equal(
        chain.get(second.condition.conditionId)?.supersedes,
        first.condition.conditionId
      );
      assert.equal(
        chain.get(third.condition.conditionId)?.supersedes,
        second.condition.conditionId
      );
      assert.equal(chain.get(first.condition.conditionId)?.supersedes, null);
      const liveRows = rows.filter((row) => row.supersededAt === null);
      assert.equal(liveRows.length, 1);
      assert.equal(liveRows[0]?.id, third.condition.conditionId);
      // The retired rows can never be resurrected as replacement targets.
      const retired = rows.filter((row) => row.supersededAt !== null);
      assert.equal(retired.length, 2);
    } finally {
      await sql.end({ timeout: 5 });
    }
    const status = await readStatus(fixture);
    assert.equal(status.condition?.conditionId, third.condition.conditionId);
    assert.equal(status.condition?.live, true);
    assert.equal(status.condition?.amountMinor, 275_000);
  }
);
