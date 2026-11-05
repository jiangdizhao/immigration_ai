/**
 * Phase 13 M8.3 - guarded real-PostgreSQL integrated acceptance (AUTHORED, NOT RUN).
 *
 * Validates the integrated M8.1 + M8.2 system against the REAL repositories in a
 * disposable PostgreSQL 17 database: real transactions, row locks, unique and partial
 * unique indexes, composite foreign keys, CHECK constraints and append-only triggers.
 *
 * Only three things are injected, and each is named as such:
 *   - the M5.1/M6.2 upstream target read (fixture state, so no business table outside
 *     M8 is written);
 *   - the M4-007 handoff authority for the acceptance-only managed path, which is
 *     tagged `synthetic_test`;
 *   - an external verifier for the one verified-record case.
 *
 * The production-default fail-closed path is exercised separately with the real
 * `unavailableHandoffAuthority` and the real M4 readiness evaluator.
 *
 * Required environment (no fallback, never a business database):
 *   PHASE13_M8_3_DB_INTEGRATION=true
 *   PHASE13_M8_3_TEST_ENVIRONMENT_ID=phase13-m8-3-disposable
 *   PHASE13_M8_3_TEST_DATABASE_ROLE=m8_3_test_owner
 *   PHASE13_M8_3_TEST_HOST_PORT=55455
 *   PHASE13_M8_3_TEST_SERVER_PORT=5432
 *   PHASE13_M8_3_TEST_DATABASE_URL=postgres://m8_3_test_owner:...@127.0.0.1:55455/immigration_ai_phase13_m8_3_test
 *   POSTGRES_URL / DATABASE_URL=<the same URL>
 *
 * A skipped run is NOT a pass.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { loadManagedHandoffSnapshot } from "@/lib/db/managed-handoff-snapshot-repository";
import { createProjectStaffAssignmentRepository } from "@/lib/db/project-staff-assignment-repository";
import { evaluateManagedHandoffReadiness } from "@/lib/managed-handoff/evaluator";
import type { ManagedHandoffResult } from "@/lib/managed-handoff/policy";
import { managedHandoffPortsFromSnapshot } from "@/lib/managed-handoff/snapshot";
import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import { PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION } from "@/lib/project-staff-assignments/policy";
import { SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION } from "@/lib/submission-packages/contracts";
import type { SubmissionTargetState } from "@/lib/submission-packages/ports";
import { createPostgresSubmissionPackageStore } from "@/lib/submission-packages/postgres-repository";
import { createSubmissionPackageService } from "@/lib/submission-packages/service";
import { SubmissionAuthorizationError } from "./contracts";
import { SUBMISSION_AUTHORIZATION_DISCLOSURES } from "./policy";
import {
  type ExactPackageState,
  type ExternalVerifier,
  type HandoffAuthorityPort,
  unavailableExternalVerifier,
  unavailableHandoffAuthority,
} from "./ports";
import { createPostgresSubmissionAuthorizationStore } from "./postgres-repository";
import {
  AUTHORIZATION_REQUIRED_CONFIRMATIONS,
  createSubmissionAuthorizationService,
  type SubmissionAuthorizationService,
} from "./service";
import {
  createPrefetchedTargetProvider,
  observeM8PackageTarget,
} from "./targets";

const EXPECTED_DATABASE = "immigration_ai_phase13_m8_3_test";
const EXPECTED_ROLE = "m8_3_test_owner";
const EXPECTED_HOST_PORT = "55455";
const EXPECTED_ENVIRONMENT_ID = "phase13-m8-3-disposable";
const EXPECTED_LEDGER = 53;
const FORBIDDEN_DATABASES = new Set([
  "chatbot",
  "immigration_legal",
  "postgres",
  "immigration_ai_phase13_m8_1_test",
  "immigration_ai_phase13_m7_test",
]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const OPT_IN =
  process.env.PHASE13_M8_3_DB_INTEGRATION?.trim().toLowerCase() === "true";
const URL_VALUE = process.env.PHASE13_M8_3_TEST_DATABASE_URL?.trim() ?? "";

export const M8_3_DB_PENDING =
  "M8_3_DATABASE_ACCEPTANCE_PENDING_OWNER_AUTHORIZATION";

const skipReason = ((): string | null => {
  if (!OPT_IN) {
    return M8_3_DB_PENDING;
  }
  if (
    URL_VALUE === "" ||
    process.env.PHASE13_M8_3_TEST_DATABASE_ROLE !== EXPECTED_ROLE ||
    process.env.PHASE13_M8_3_TEST_HOST_PORT !== EXPECTED_HOST_PORT ||
    process.env.PHASE13_M8_3_TEST_SERVER_PORT !== "5432" ||
    process.env.PHASE13_M8_3_TEST_ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT_ID
  ) {
    return "M8.3 disposable database coordinates are incomplete";
  }
  if (
    process.env.POSTGRES_URL !== URL_VALUE ||
    process.env.DATABASE_URL !== URL_VALUE
  ) {
    return "POSTGRES_URL and DATABASE_URL must both equal the disposable URL";
  }
  const parsed = new URL(URL_VALUE);
  if (
    !LOOPBACK_HOSTS.has(parsed.hostname) ||
    parsed.port !== EXPECTED_HOST_PORT
  ) {
    return "the disposable target must be loopback on the M8.3 host port";
  }
  const database = parsed.pathname.replace(/^\//u, "");
  if (database !== EXPECTED_DATABASE || FORBIDDEN_DATABASES.has(database)) {
    return "database must be the M8.3 disposable database";
  }
  return null;
})();

if (skipReason) {
  // biome-ignore lint/suspicious/noSkippedTests: authorization-pending guard only
  test.skip(`${M8_3_DB_PENDING}: ${skipReason}`, () => {
    // never executed while authorization is pending
  });
} else {
  runAcceptance();
}

function runAcceptance(): void {
  /** Deterministic synthetic identities, prefixed so they can never collide. */
  const OWNER = "11111111-1111-4111-8111-11111111a801";
  const MEMBER = "11111111-1111-4111-8111-11111111a802";
  const OUTSIDER = "11111111-1111-4111-8111-11111111a803";
  const STAFF = "11111111-1111-4111-8111-11111111a804";
  const STAFF2 = "11111111-1111-4111-8111-11111111a805";
  const ADMIN = "11111111-1111-4111-8111-11111111a806";
  const PROJECT = "22222222-2222-4222-8222-22222222a801";
  const OTHER_PROJECT = "22222222-2222-4222-8222-22222222a802";
  const TARGET = "44444444-4444-4444-8444-44444444a801";
  const TARGET_KIND = "student_500_visa_application" as const;

  async function withClient<T>(
    run: (sql: ReturnType<typeof postgres>) => Promise<T>
  ): Promise<T> {
    const client = postgres(URL_VALUE, { max: 1 });
    try {
      return await run(client);
    } finally {
      await client.end({ timeout: 5 });
    }
  }

  after(async () => {
    const { closeLazyDatabase } = await import("@/lib/db/runtime-client");
    await closeLazyDatabase();
  });

  // ---------------------------------------------------------------- injected state

  /**
   * The only injected upstream state: the M5.1/M6.2 target. Nothing outside the M8
   * tables is written by this suite.
   */
  const target: { current: SubmissionTargetState } = {
    current: makeTarget({ draftVersion: 1, revision: 1 }),
  };

  type ManagedMode = "real" | "ready" | "unavailable";
  const managed: { mode: ManagedMode } = { mode: "real" };
  const authority: { mode: "synthetic" | "unavailable" } = {
    mode: "synthetic",
  };
  const verifier: { mode: "unavailable" | "synthetic" } = {
    mode: "unavailable",
  };

  function makeTarget(input: {
    readonly draftVersion: number;
    readonly revision: number;
  }): SubmissionTargetState {
    const draftId = `66666666-6666-4666-8666-66666666a80${input.draftVersion}`;
    const sha = `${input.draftVersion}`.padStart(64, "c");
    return {
      archived: false,
      content: {
        applicationRevision: input.revision,
        applicationStatus: "in_progress",
        school: null,
        student500: {
          applicationPlace: "offshore",
          coeStatus: "reported_not_held",
          coverage: {
            conflicted: 0,
            covered: 1,
            humanReviewRequired: 1,
            missing: 1,
          },
          entryRoute: "offer_only",
          factReferenceCount: 0,
          gsDraft: null,
          preparationSnapshot: null,
        },
        targetLabel: "student_500_application",
        title: "Student 500 application",
      },
      dependencies: {
        applicationRevision: input.revision,
        applicationStatus: "in_progress",
        factReferences: [],
        gsDraft: {
          contentSha256: sha,
          draftId,
          missingInformation: [],
          redactedSectionCount: 0,
          sectionHeadings: ["Future plans and expected value"],
          sectionKeys: ["future_plans"],
          version: input.draftVersion,
        },
        legalSourceRevision: "declared-2026-10",
        preparationSnapshot: null,
        schoolPackage: null,
        sourceAvailability: "available",
      },
      indicators: [{ code: "human_review_required", kind: "unverified" }],
      review: {
        gsDraft: {
          contentSha256: sha,
          draftId,
          sections: [
            {
              heading: "Future plans and expected value",
              missingInformation: [],
              sectionKey: "future_plans",
              text: `Exact draft text v${input.draftVersion}`,
            },
          ],
          version: input.draftVersion,
        },
        sections: [],
        source: "pinned_gs_draft_version",
        title: "Student 500 application",
      },
      reviewUnavailableReason: null,
      targetId: TARGET,
      targetKind: TARGET_KIND,
      targetVersion: input.revision,
    };
  }

  // ---------------------------------------------------------------- real composition

  const packageStore = createPostgresSubmissionPackageStore();
  const packageService = createSubmissionPackageService({
    readTarget: () => Promise.resolve(target.current),
    store: packageStore,
  });

  const scope = {
    actorUserId: OWNER,
    projectId: PROJECT,
    targetId: TARGET,
    targetKind: TARGET_KIND,
  };

  /** M8.1 → M8.2 evidence adapter. It changes shape only, never validity. */
  async function readExactPackage(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
  }): Promise<ExactPackageState | null> {
    try {
      const view = await packageService.get(input);
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
      return null;
    }
  }

  const syntheticReady: ManagedHandoffResult = {
    actorUserId: OWNER,
    checkedAt: new Date(0).toISOString(),
    checkedRevisions: {
      agreement: null,
      assignment: null,
      disclosure: null,
      engagement: 1,
      membership: null,
      payment: null,
      project: 1,
      review: 1,
      target: null,
    },
    engagementId: `synthetic-engagement-${PROJECT}`,
    evidenceProvenance: "synthetic_test",
    evidenceRefs: [`synthetic:${PROJECT}`],
    paymentPredicate: "REQUIRED_SATISFIED",
    policyVersion: "phase13-m4-007-managed-handoff-v1",
    policyVersions: {
      handoff: "phase13-m4-007-managed-handoff-v1",
      payment: "phase13-m4-005-payment-v1",
      review: "phase13-m4-006-review-v1",
    },
    projectId: PROJECT,
    reasonCodes: [],
    revalidationToken: "synthetic-test-token",
    status: "READY",
    target: {
      targetId: TARGET,
      targetKind: TARGET_KIND,
      targetSha256: null,
      targetVersion: null,
    },
  };

  /**
   * Readiness adapter.
   *
   * `real` runs the genuine M4-007 evaluator against a genuine repeatable-read snapshot
   * of this database, so the fail-closed production result is real. `ready` returns an
   * explicitly synthetic result, used only to prove that the M8.2 mechanism enforces its
   * contract when every M4 predicate is satisfied.
   */
  async function readManagedReadiness(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
    readonly targetVersion: number;
    readonly targetSha256: string;
  }): Promise<ManagedHandoffResult | "unavailable"> {
    if (managed.mode === "ready") {
      return { ...syntheticReady };
    }
    if (managed.mode === "unavailable") {
      return "unavailable";
    }
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
      const required = AUTHORIZATION_REQUIRED_CONFIRMATIONS.every((type) =>
        (current?.confirmations ?? []).some(
          (confirmation) =>
            confirmation.confirmationType === type &&
            confirmation.current &&
            confirmation.finalized
        )
      );
      const content = (current?.confirmations ?? []).find(
        (confirmation) =>
          confirmation.confirmationType === "package_content_review" &&
          confirmation.current
      );
      const confirmation =
        exact === null
          ? ("unavailable" as const)
          : required && content !== undefined
            ? {
                confirmationRef: content.confirmationId,
                policyCode: "phase13.m8.1.customer-confirmation.v1",
                status: "required_and_confirmed" as const,
              }
            : {
                policyCode: "phase13.m8.1.customer-confirmation.v1",
                status: "required_not_confirmed" as const,
              };
      const snapshot = await loadManagedHandoffSnapshot({
        actorUserId: input.actorUserId,
        // No credential registry is integrated: production is unavailable.
        credential: "unavailable",
        projectId: input.projectId,
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

  const syntheticAuthority: HandoffAuthorityPort = {
    code: "synthetic_test_handoff_authority",
    decide() {
      return {
        authorityCode: "synthetic_test_handoff_authority",
        policyVersion: "synthetic-test-v1",
        provenance: "synthetic_test",
        status: "allowed",
      };
    },
  };

  const syntheticVerifier: ExternalVerifier = {
    code: "synthetic_test_verifier",
    verify() {
      return { status: "verified", verifierCode: "synthetic_test_verifier" };
    },
  };

  const authorizationStore = createPostgresSubmissionAuthorizationStore();
  const authorizationService: SubmissionAuthorizationService =
    createSubmissionAuthorizationService({
      externalVerifier: {
        code: "switchable-test-verifier",
        verify: (input) =>
          verifier.mode === "synthetic"
            ? syntheticVerifier.verify(input)
            : unavailableExternalVerifier.verify(input),
      },
      handoffAuthority: {
        code: "switchable-test-authority",
        decide: (request) =>
          authority.mode === "synthetic"
            ? syntheticAuthority.decide(request)
            : unavailableHandoffAuthority.decide(request),
      },
      readExactPackage,
      readManagedReadiness,
      store: authorizationStore,
    });

  const SELF_DISCLOSURES =
    SUBMISSION_AUTHORIZATION_DISCLOSURES.self_service_external_submission as unknown as readonly string[];
  const MANAGED_DISCLOSURES =
    SUBMISSION_AUTHORIZATION_DISCLOSURES.managed_service_professional_handoff as unknown as readonly string[];

  // ---------------------------------------------------------------- synthetic fixtures

  /**
   * Synthetic identities only. `staff` accounts carry role `lawyer`, but that role is
   * never treated as professional authority: acceptance still requires the assignment
   * and an explicit authority decision.
   */
  /**
   * Synthetic identities only. `staff` accounts carry role `lawyer`, but that role is
   * never treated as professional authority: acceptance still requires the assignment
   * and an explicit authority decision.
   *
   * The M4-002 staff assignment is created through the REAL repository
   * (propose -> owner approve -> lawyer accept), because M4-002 enforces a deferred
   * audit contract: every staff-assignment operation must commit together with an
   * assignment whose resultId and lastOperationRecordId cross-reference each other and
   * with exactly one matching ProjectEvent at the same project revision. Hand-written
   * rows cannot satisfy that contract, and a hand-written foreign key target is exactly
   * what produced the earlier 23503 failure.
   */
  async function seed(): Promise<void> {
    await withClient(async (sql) => {
      const users: readonly (readonly [string, string])[] = [
        [OWNER, "user"],
        [MEMBER, "user"],
        [OUTSIDER, "user"],
        [STAFF, "lawyer"],
        [STAFF2, "lawyer"],
        [ADMIN, "admin"],
      ];
      for (const [id, role] of users) {
        // emailVerifiedAt is required for the M4-002 lawyer/admin eligibility checks.
        await sql`
          insert into "User" (id, email, role, "emailVerifiedAt")
          values (${id}, ${`${id}@disposable.invalid`}, ${role}, now())
          on conflict do nothing
        `;
      }
      await sql`insert into "StudyJourneyProject" (id, "ownerUserId") values (${PROJECT}, ${OWNER}) on conflict do nothing`;
      await sql`insert into "StudyJourneyProject" (id, "ownerUserId") values (${OTHER_PROJECT}, ${OUTSIDER}) on conflict do nothing`;
      await sql`
        insert into "ProjectMembership" (id, "projectId", "userId", status,
          "invitedByUserId", "acceptedAt")
        values (${randomUUID()}, ${PROJECT}, ${MEMBER}, 'active', ${OWNER}, now())
        on conflict do nothing
      `;
    });

    // STAFF gets one ACTIVE assignment on PROJECT; STAFF2 stays unassigned and is the
    // negative control for "an unrelated staff member cannot accept".
    const staffRepository = createProjectStaffAssignmentRepository();
    await staffRepository.propose({
      actorUserId: ADMIN,
      operationId: "m83-seed-staff-propose",
      projectId: PROJECT,
      staffUserId: STAFF,
    });
    const [assignment] = await staffRepository.listOwnerAssignments({
      actorUserId: OWNER,
      projectId: PROJECT,
    });
    if (!assignment) {
      throw new Error(
        "staff assignment fixture was not created by the repository"
      );
    }
    await staffRepository.transition({
      action: "owner_approve",
      actorUserId: OWNER,
      assignmentId: assignment.assignmentId,
      expectedProjectRevision: await projectRevision(),
      noticeVersion: PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
      operationId: "m83-seed-staff-approve",
      projectId: PROJECT,
      proposalSha256: assignment.proposalSha256,
    });
    await staffRepository.transition({
      action: "lawyer_accept",
      actorUserId: STAFF,
      assignmentId: assignment.assignmentId,
      expectedProjectRevision: await projectRevision(),
      operationId: "m83-seed-staff-accept",
      projectId: PROJECT,
    });

    // Fail loudly: the fixture must be genuinely active and fully audited.
    const persisted = await withClient(
      (sql) =>
        sql<{ lastOperationRecordId: string; status: string }[]>`
        select "status", "lastOperationRecordId" from "ProjectStaffAssignment"
        where "projectId" = ${PROJECT} and "staffUserId" = ${STAFF}
      `
    );
    if (persisted.length !== 1 || persisted[0]?.status !== "active") {
      throw new Error(
        `staff assignment fixture is not active: ${JSON.stringify(persisted)}`
      );
    }
    const audited = await withClient(
      (sql) =>
        sql<{ events: string; operations: string }[]>`
        select (select count(*)::text from "ProjectEvent"
                 where "subjectId" = ${assignment.assignmentId}) as events,
               (select count(*)::text from "ProjectOperation"
                 where "resultId" = ${assignment.assignmentId}) as operations
      `
    );
    if (audited[0]?.events !== "3" || audited[0]?.operations !== "3") {
      throw new Error(
        `staff assignment audit chain is incomplete: ${JSON.stringify(audited[0])}`
      );
    }
  }

  async function projectRevision(): Promise<number> {
    const [row] = await withClient(
      (sql) =>
        sql<{ revision: number }[]>`
        select "revision" from "StudyJourneyProject" where "id" = ${PROJECT}
      `
    );
    if (!row) {
      throw new Error("the seeded Project is missing");
    }
    return row.revision;
  }

  /** M8.1: record both customer confirmations for the current package version. */
  async function confirmCurrentVersion(
    prefix: string
  ): Promise<{ manifestSha256: string; packageVersionId: string }> {
    const view = await packageService.get(scope);
    const current = view.currentPackage;
    if (!current) {
      throw new Error("a current package version must exist before confirming");
    }
    for (const type of [
      "package_content_review",
      "customer_declarations",
    ] as const) {
      await packageService.confirmPackage({
        confirmationType: type,
        consentBinding: {
          manifestSha256: current.manifestSha256,
          packageVersionId: current.packageVersionId,
          projectId: PROJECT,
          statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        },
        consentGranted: true,
        manifestSha256: current.manifestSha256,
        operationId: `${prefix}-${type}`,
        packageVersionId: current.packageVersionId,
        scope,
        statementPolicyVersion: SUBMISSION_PACKAGE_STATEMENT_POLICY_VERSION,
        targetVersion: current.targetVersion,
      });
    }
    return {
      manifestSha256: current.manifestSha256,
      packageVersionId: current.packageVersionId,
    };
  }

  function op(label: string): string {
    return `m83-${label}-${randomUUID().slice(0, 8)}`;
  }

  async function expectCode(
    run: () => Promise<unknown>,
    code: string
  ): Promise<void> {
    try {
      await run();
    } catch (error) {
      if (error instanceof SubmissionAuthorizationError) {
        if (error.code === code) {
          return;
        }
        throw new Error(`expected ${code} but received ${error.code}`);
      }
      throw error;
    }
    throw new Error(`expected ${code} but the call succeeded`);
  }

  // ---------------------------------------------------------------- suite setup

  /**
   * Disposable identity, verified BEFORE any fixture is written. If the coordinates are
   * wrong the suite fails here instead of seeding an unexpected database, and no test
   * ever runs against an unseeded schema.
   */
  interface SuiteIdentity {
    readonly database: string;
    readonly migrations: number;
    readonly role: string;
    readonly version: string;
  }

  async function readIdentity(): Promise<SuiteIdentity> {
    const [row] = await withClient(
      (sql) =>
        sql<
          {
            database: string;
            migrations: string;
            role: string;
            version: string;
          }[]
        >`
        select current_database() as database,
               current_user as role,
               current_setting('server_version') as version,
               (select count(*)::text from drizzle.__drizzle_migrations) as migrations
      `
    );
    if (!row) {
      throw new Error("the disposable database did not return an identity row");
    }
    return {
      database: row.database,
      migrations: Number(row.migrations),
      role: row.role,
      version: row.version,
    };
  }

  const setup: { seeded: boolean; users: number } = { seeded: false, users: 0 };

  before(async () => {
    const identity = await readIdentity();
    if (identity.database !== EXPECTED_DATABASE) {
      throw new Error(
        `refusing to seed: database is ${identity.database}, expected ${EXPECTED_DATABASE}`
      );
    }
    if (identity.role !== EXPECTED_ROLE) {
      throw new Error(
        `refusing to seed: role is ${identity.role}, expected ${EXPECTED_ROLE}`
      );
    }
    if (!/^17\./u.test(String(identity.version))) {
      throw new Error(
        `refusing to seed: PostgreSQL ${identity.version} is not 17.x`
      );
    }
    if (identity.migrations !== EXPECTED_LEDGER) {
      throw new Error(
        `refusing to seed: migration ledger is ${identity.migrations}, expected ${EXPECTED_LEDGER}`
      );
    }
    await seed();
    const [counts] = await withClient(
      (sql) =>
        sql<{ users: string }[]>`
        select count(*)::text as users from "User"
        where email like '%@disposable.invalid'
      `
    );
    setup.seeded = true;
    setup.users = Number(counts?.users ?? 0);
    if (setup.users !== 6) {
      throw new Error(
        `seed verification failed: expected 6 synthetic users, found ${setup.users}`
      );
    }
  });

  // ---------------------------------------------------------------- tests

  test("1: disposable identity, PostgreSQL 17, 0000-0052 ledger and M8 schema", async () => {
    const identity = await readIdentity();
    assert.equal(identity.database, EXPECTED_DATABASE);
    assert.equal(identity.role, EXPECTED_ROLE);
    assert.match(String(identity.version), /^17\./u);
    assert.equal(identity.migrations, EXPECTED_LEDGER);
    // The one-time setup verified this same identity before seeding.
    assert.equal(setup.seeded, true);
    assert.equal(setup.users, 6);

    // Relations only: 4 tables + 4 indexes. A foreign key is recorded in
    // pg_constraint, not pg_class, and is asserted separately below.
    const relations = await withClient(
      (sql) =>
        sql<{ kind: string; name: string }[]>`
        select c.relname as name, c.relkind::text as kind from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in (
          'SubmissionAuthorization', 'SubmissionHandoff',
          'SubmissionHandoffEvent', 'SubmissionExternalRecord',
          'SubmissionHandoff_live_package_unique',
          'SubmissionAuthorization_binding_unique',
          'SubmissionHandoff_operation_unique',
          'SubmissionExternalRecord_operation_unique'
        )
        order by c.relname
      `
    );
    assert.equal(relations.length, 8);
    assert.deepEqual(
      relations
        .filter((entry) => entry.kind === "r")
        .map((entry) => entry.name),
      [
        "SubmissionAuthorization",
        "SubmissionExternalRecord",
        "SubmissionHandoff",
        "SubmissionHandoffEvent",
      ]
    );
    assert.deepEqual(
      relations
        .filter((entry) => entry.kind === "i")
        .map((entry) => entry.name),
      [
        "SubmissionAuthorization_binding_unique",
        "SubmissionExternalRecord_operation_unique",
        "SubmissionHandoff_live_package_unique",
        "SubmissionHandoff_operation_unique",
      ]
    );

    // One live handoff per package version is a PARTIAL unique index.
    const [liveIndex] = await withClient(
      (sql) =>
        sql<{ indexdef: string }[]>`
        select indexdef from pg_indexes
        where schemaname = 'public'
          and indexname = 'SubmissionHandoff_live_package_unique'
      `
    );
    assert.match(liveIndex?.indexdef ?? "", /UNIQUE/u);
    assert.match(liveIndex?.indexdef ?? "", /WHERE/u);
    assert.match(liveIndex?.indexdef ?? "", /'requested'/u);
    assert.match(liveIndex?.indexdef ?? "", /'accepted'/u);
    // Foreign keys live in pg_constraint: assert the real name, target table and the
    // actual referenced columns instead of merely dropping the expectation.
    interface ForeignKeyRow {
      localColumns: string;
      name: string;
      referencedColumns: string;
      targetTable: string;
    }
    const foreignKeys = await withClient(
      (sql) =>
        sql<ForeignKeyRow[]>`
        select con.conname as name,
               rel.relname as "targetTable",
               (select string_agg(att.attname, ',' order by ord.ordinality)
                  from unnest(con.conkey) with ordinality as ord(attnum, ordinality)
                  join pg_attribute att
                    on att.attrelid = con.conrelid and att.attnum = ord.attnum
               ) as "localColumns",
               (select string_agg(att.attname, ',' order by ord.ordinality)
                  from unnest(con.confkey) with ordinality as ord(attnum, ordinality)
                  join pg_attribute att
                    on att.attrelid = con.confrelid and att.attnum = ord.attnum
               ) as "referencedColumns"
        from pg_constraint con
        join pg_class rel on rel.oid = con.confrelid
        join pg_class own on own.oid = con.conrelid
        where con.contype = 'f'
          and own.relname in (
            'SubmissionAuthorization', 'SubmissionHandoff',
            'SubmissionHandoffEvent', 'SubmissionExternalRecord'
          )
        order by con.conname
      `
    );
    const packageIdentity =
      "projectId,targetKind,targetId,id,version,manifestSha256";
    assert.deepEqual(
      Object.fromEntries(
        foreignKeys.map((row) => [
          row.name,
          `${row.targetTable}(${row.referencedColumns})`,
        ])
      ),
      {
        SubmissionAuthorization_package_identity_fk: `SubmissionPackage(${packageIdentity})`,
        SubmissionExternalRecord_handoff_fk: "SubmissionHandoff(projectId,id)",
        SubmissionExternalRecord_package_identity_fk:
          "SubmissionPackage(projectId,targetKind,targetId,id)",
        SubmissionHandoffEvent_handoff_fk: "SubmissionHandoff(projectId,id)",
        SubmissionHandoff_authorization_fk:
          "SubmissionAuthorization(projectId,id)",
        SubmissionHandoff_package_identity_fk: `SubmissionPackage(${packageIdentity})`,
      }
    );
    // The full package identity on both sides is what makes a contradictory row
    // impossible, so the local columns are asserted too.
    for (const name of [
      "SubmissionAuthorization_package_identity_fk",
      "SubmissionHandoff_package_identity_fk",
    ]) {
      assert.equal(
        foreignKeys.find((row) => row.name === name)?.localColumns,
        "projectId,targetKind,targetId,packageVersionId,packageVersion,manifestSha256",
        `${name} must bind the full package identity locally`
      );
    }

    const triggers = await withClient(
      (sql) =>
        sql<{ name: string }[]>`
        select c.relname as name from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal and c.relname in (
          'SubmissionAuthorization', 'SubmissionHandoff',
          'SubmissionHandoffEvent', 'SubmissionExternalRecord'
        )
        order by c.relname
      `
    );
    assert.deepEqual(
      triggers.map((entry) => entry.name),
      [
        "SubmissionAuthorization",
        "SubmissionExternalRecord",
        "SubmissionHandoff",
        "SubmissionHandoffEvent",
      ]
    );
  });

  test("2 (A): self-service authorization is durable, replayed and exactly bound", async () => {
    const built = await packageService.buildPackage({
      operationId: "m83-build-v1",
      scope,
    });
    assert.equal(built.package.version, 1);
    const confirmed = await confirmCurrentVersion("m83-confirm-v1");

    const first = await authorizationService.authorizeSelfService({
      acknowledgedDisclosures: SELF_DISCLOSURES,
      actorUserId: OWNER,
      operationId: "m83-self-v1",
      packageVersionId: confirmed.packageVersionId,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(first.replayed, false);
    assert.equal(first.authorization.validity.status, "effective");
    assert.equal(first.authorization.manifestSha256, confirmed.manifestSha256);

    // A real row, with the full package identity, exists in PostgreSQL.
    const rows = await withClient(
      (sql) =>
        sql<{ manifestSha256: string; type: string }[]>`
        select "manifestSha256", "authorizationType" as type
        from "SubmissionAuthorization" where "projectId" = ${PROJECT}
      `
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.manifestSha256, confirmed.manifestSha256);
    assert.equal(rows[0]?.type, "self_service_external_submission");

    // Exact replay is idempotent; a different operation id cannot duplicate the row
    // (the unique binding index is the guarantee).
    const replay = await authorizationService.authorizeSelfService({
      acknowledgedDisclosures: SELF_DISCLOSURES,
      actorUserId: OWNER,
      operationId: "m83-self-v1",
      packageVersionId: confirmed.packageVersionId,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(replay.replayed, true);
    assert.equal(
      replay.authorization.authorizationId,
      first.authorization.authorizationId
    );
    const duplicate = await authorizationService.authorizeSelfService({
      acknowledgedDisclosures: SELF_DISCLOSURES,
      actorUserId: OWNER,
      operationId: op("self-dup"),
      packageVersionId: confirmed.packageVersionId,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(duplicate.replayed, true);
    assert.equal(
      duplicate.authorization.authorizationId,
      first.authorization.authorizationId
    );
  });

  test("3 (A): concurrent authorization cannot create two decisions", async () => {
    const view = await authorizationService.get(scope);
    const packageVersionId = view.currentPackageVersionId;
    assert.ok(packageVersionId);
    const results = await Promise.all([
      authorizationService.authorizeSelfService({
        acknowledgedDisclosures: SELF_DISCLOSURES,
        actorUserId: OWNER,
        operationId: op("race-a"),
        packageVersionId,
        projectId: PROJECT,
        targetId: TARGET,
        targetKind: TARGET_KIND,
      }),
      authorizationService.authorizeSelfService({
        acknowledgedDisclosures: SELF_DISCLOSURES,
        actorUserId: OWNER,
        operationId: op("race-b"),
        packageVersionId,
        projectId: PROJECT,
        targetId: TARGET,
        targetKind: TARGET_KIND,
      }),
    ]);
    assert.equal(
      new Set(results.map((entry) => entry.authorization.authorizationId)).size,
      1
    );
    const rows = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        select count(*)::text as count from "SubmissionAuthorization"
        where "projectId" = ${PROJECT}
          and "authorizationType" = 'self_service_external_submission'
      `
    );
    assert.equal(rows[0]?.count, "1");
  });

  test("4 (A): a superseded version can neither be authorized nor stay effective", async () => {
    // Material change: a new immutable version exists, so v1 is no longer current.
    target.current = makeTarget({ draftVersion: 2, revision: 2 });
    const v2 = await packageService.buildPackage({
      operationId: "m83-build-v2",
      scope,
    });
    assert.equal(v2.package.version, 2);

    const view = await authorizationService.get(scope);
    assert.equal(view.currentPackageVersion, 2);
    assert.equal(view.authorization?.validity.status, "ineffective");
    assert.ok(
      view.authorization?.validity.reasonCodes.includes("package_not_current")
    );

    const v1 = (
      await withClient(
        (sql) =>
          sql<{ id: string }[]>`
          select id from "SubmissionPackage"
          where "projectId" = ${PROJECT} and "version" = 1
        `
      )
    )[0]?.id;
    assert.ok(v1);
    await expectCode(
      () =>
        authorizationService.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: OWNER,
          operationId: op("self-stale"),
          packageVersionId: v1,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "package_not_current"
    );

    // v2 exists but has no confirmations: authorization still fails closed.
    await expectCode(
      () =>
        authorizationService.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: OWNER,
          operationId: op("self-unconfirmed"),
          packageVersionId: v2.package.packageVersionId,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "confirmation_missing"
    );
  });

  test("5 (A): another Project cannot authorize across the boundary", async () => {
    const confirmed = await confirmCurrentVersion("m83-confirm-v2");
    await expectCode(
      () =>
        authorizationService.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: OUTSIDER,
          operationId: op("cross-project"),
          packageVersionId: confirmed.packageVersionId,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "project_forbidden"
    );
    // A member (not the owner) is allowed by M8.1 parity, and the row is Project-scoped.
    const memberAuth = await authorizationService.authorizeSelfService({
      acknowledgedDisclosures: SELF_DISCLOSURES,
      actorUserId: MEMBER,
      operationId: op("member-self"),
      packageVersionId: confirmed.packageVersionId,
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(memberAuth.authorization.validity.status, "effective");
    const outsiderRows = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        select count(*)::text as count from "SubmissionAuthorization"
        where "projectId" = ${OTHER_PROJECT}
      `
    );
    assert.equal(outsiderRows[0]?.count, "0");
  });

  test("6 (B): the real M4 readiness result blocks managed service", async () => {
    managed.mode = "real";
    const view = await authorizationService.get(scope);
    assert.equal(view.modes.managed_service.readinessStatus, "NOT_READY");
    assert.equal(view.modes.managed_service.available, false);
    assert.ok(
      view.modes.managed_service.readinessReasonCodes.includes(
        "engagement_missing"
      ),
      "the real M4 evaluator reports the missing engagement"
    );
    assert.equal(view.modes.self_service.available, true);

    await expectCode(
      () =>
        authorizationService.authorizeManagedService({
          acknowledgedDisclosures: MANAGED_DISCLOSURES,
          actorUserId: OWNER,
          operationId: op("managed-blocked"),
          packageVersionId: view.currentPackageVersionId ?? "",
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      // The managed gate maps its blocking reason codes in a fixed order; with no review
      // and no engagement, `professional_review_not_approved` precedes the generic
      // `readiness_not_ready`. Either way the request is refused, not recorded.
      "professional_review_missing"
    );
    const rows = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        select count(*)::text as count from "SubmissionAuthorization"
        where "projectId" = ${PROJECT}
          and "authorizationType" = 'managed_service_professional_handoff'
      `
    );
    assert.equal(rows[0]?.count, "0", "nothing was recorded");
  });

  test("7 (B): a satisfied M4 predicate set authorizes managed service, marked synthetic", async () => {
    managed.mode = "ready";
    const view = await authorizationService.get(scope);
    assert.equal(view.modes.managed_service.available, true);
    assert.equal(
      view.modes.managed_service.evidenceProvenance,
      "synthetic_test",
      "the injected readiness can never be reported as production evidence"
    );
    const managedAuth = await authorizationService.authorizeManagedService({
      acknowledgedDisclosures: MANAGED_DISCLOSURES,
      actorUserId: OWNER,
      operationId: op("managed-ok"),
      packageVersionId: view.currentPackageVersionId ?? "",
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(managedAuth.authorization.mode, "managed_service");
    assert.equal(managedAuth.authorization.validity.status, "effective");
    // Re-read: eligibility is derived from the authorization that now exists.
    const eligible = await authorizationService.get(scope);
    assert.equal(eligible.handoffEligibility.status, "eligible");
  });

  test("8 (C): handoff needs managed authorization and an authorized accept", async () => {
    managed.mode = "ready";
    const view = await authorizationService.get(scope);
    const packageVersionId = view.currentPackageVersionId ?? "";

    const requested = await authorizationService.requestHandoff({
      actorUserId: OWNER,
      operationId: op("handoff-request"),
      packageVersionId,
      projectId: PROJECT,
      recipientUserId: STAFF,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(requested.handoff.status, "requested");
    assert.equal(requested.handoff.revision, 1);

    // The unassigned staff member cannot accept.
    await expectCode(
      () =>
        authorizationService.transitionHandoff({
          action: "accept",
          actorUserId: STAFF2,
          expectedRevision: 1,
          handoffId: requested.handoff.handoffId,
          operationId: op("accept-outsider"),
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "handoff_actor_not_authorized"
    );
    // The customer cannot accept on the professional's behalf.
    await expectCode(
      () =>
        authorizationService.transitionHandoff({
          action: "accept",
          actorUserId: OWNER,
          expectedRevision: 1,
          handoffId: requested.handoff.handoffId,
          operationId: op("accept-customer"),
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "actor_not_staff"
    );
    // The production deny-all authority refuses even the assigned staff member.
    authority.mode = "unavailable";
    await expectCode(
      () =>
        authorizationService.transitionHandoff({
          action: "accept",
          actorUserId: STAFF,
          expectedRevision: 1,
          handoffId: requested.handoff.handoffId,
          operationId: op("accept-no-authority"),
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "professional_authority_unavailable"
    );
    const stillOpen = await withClient(
      (sql) =>
        sql<{ status: string }[]>`
        select status from "SubmissionHandoff" where id = ${requested.handoff.handoffId}
      `
    );
    assert.equal(stillOpen[0]?.status, "requested");
    authority.mode = "synthetic";
  });

  test("9 (C): acceptance is a guarded CAS with an append-only audit trail", async () => {
    managed.mode = "ready";
    authority.mode = "synthetic";
    const view = await authorizationService.get(scope);
    const handoff = view.handoff;
    assert.ok(handoff, "the requested handoff is visible");
    assert.equal(handoff.status, "requested");

    const accepted = await authorizationService.transitionHandoff({
      action: "accept",
      actorUserId: STAFF,
      expectedRevision: handoff.revision,
      handoffId: handoff.handoffId,
      operationId: op("accept-ok"),
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(accepted.handoff.status, "accepted");
    assert.equal(accepted.handoff.revision, handoff.revision + 1);
    assert.deepEqual(
      accepted.handoff.history.map((entry) => entry.status),
      ["requested", "accepted"]
    );

    // Repeating the same decision is a replay, not a second human action.
    const replay = await authorizationService.transitionHandoff({
      action: "accept",
      actorUserId: STAFF,
      expectedRevision: handoff.revision,
      handoffId: handoff.handoffId,
      operationId: op("accept-again"),
      projectId: PROJECT,
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.handoff.revision, handoff.revision + 1);

    // A stale revision cannot overwrite the accepted state.
    await expectCode(
      () =>
        authorizationService.transitionHandoff({
          action: "decline",
          actorUserId: STAFF,
          expectedRevision: handoff.revision,
          handoffId: handoff.handoffId,
          operationId: op("decline-stale"),
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "revision_conflict"
    );

    const events = await withClient(
      (sql) =>
        sql<{ count: string }[]>`
        select count(*)::text as count from "SubmissionHandoffEvent"
        where "handoffId" = ${handoff.handoffId}
      `
    );
    assert.equal(events[0]?.count, "2", "one event per transition, never more");
  });

  test("10 (C): the database refuses contradictory or rewritten M8 rows", async () => {
    const view = await authorizationService.get(scope);
    const handoff = view.handoff;
    assert.ok(handoff);

    // One live handoff per package version (partial unique index).
    const duplicateLive = await withClient(async (sql) => {
      try {
        await sql`
          insert into "SubmissionHandoff" ("id", "projectId", "targetKind",
            "targetId", "packageVersionId", "packageVersion", "manifestSha256",
            "authorizationId", "status", "revision", "requestedByUserId",
            "operationId", "requestSha256")
          select ${randomUUID()}, "projectId", "targetKind", "targetId",
            "packageVersionId", "packageVersion", "manifestSha256",
            "authorizationId", 'accepted', 1, "requestedByUserId",
            ${`m83-direct-${randomUUID().slice(0, 8)}`}, ${"e".repeat(64)}
          from "SubmissionHandoff" where id = ${handoff.handoffId}
        `;
        return "inserted";
      } catch (error) {
        return String((error as { code?: string }).code ?? "unknown");
      }
    });
    assert.equal(duplicateLive, "23505");

    // A verified external record must name its verifier.
    const verifiedWithoutVerifier = await withClient(async (sql) => {
      try {
        await sql`
          insert into "SubmissionExternalRecord" ("id", "projectId", "targetKind",
            "targetId", "handoffId", "packageVersionId", "kind", "channel",
            "provenance", "verification", "verifierCode", "occurredAt",
            "reportedByUserId", "operationId", "requestSha256")
          select ${randomUUID()}, "projectId", "targetKind", "targetId", id,
            "packageVersionId", 'external_submission', 'government_portal',
            'staff_attested', 'verified', null, now()::text,
            ${STAFF}, ${`m83-direct-${randomUUID().slice(0, 8)}`}, ${"e".repeat(64)}
          from "SubmissionHandoff" where id = ${handoff.handoffId}
        `;
        return "inserted";
      } catch (error) {
        return String((error as { code?: string }).code ?? "unknown");
      }
    });
    assert.equal(verifiedWithoutVerifier, "23514");

    // Authorization is immutable; handoff identity, status edges and revision are guarded.
    const rewrites = await withClient(async (sql) => {
      const out: string[] = [];
      const statements = [
        () =>
          sql`update "SubmissionAuthorization" set "manifestSha256" = ${"f".repeat(64)} where "projectId" = ${PROJECT}`,
        () =>
          sql`delete from "SubmissionHandoffEvent" where "handoffId" = ${handoff.handoffId}`,
        () =>
          sql`update "SubmissionHandoff" set "packageVersion" = 9 where id = ${handoff.handoffId}`,
        () =>
          sql`update "SubmissionHandoff" set "status" = 'requested', "revision" = "revision" + 1 where id = ${handoff.handoffId}`,
      ];
      for (const statement of statements) {
        try {
          await statement();
          out.push("allowed");
        } catch (error) {
          out.push(String((error as { code?: string }).code ?? "unknown"));
        }
      }
      return out;
    });
    for (const result of rewrites) {
      assert.equal(result, "23514", "every rewrite is refused by the guard");
    }
  });

  test("11 (C): external evidence keeps its provenance and never fakes a receipt", async () => {
    managed.mode = "ready";
    const view = await authorizationService.get(scope);
    const handoffId = view.handoff?.handoffId;
    assert.ok(handoffId);
    const packageVersionId = view.currentPackageVersionId ?? "";

    // Without a trusted verifier a "verified" claim is refused outright.
    verifier.mode = "unavailable";
    await expectCode(
      () =>
        authorizationService.recordExternalRecord({
          actorUserId: STAFF,
          handoffId,
          kind: "external_outcome",
          occurredAt: "2026-11-05T00:00:00.000Z",
          operationId: op("outcome-claim"),
          outcomeCode: "receipt_received",
          packageVersionId,
          projectId: PROJECT,
          provenance: "provider_verified",
          reference: "SYNTHETIC-RECEIPT-1",
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "evidence_verifier_unavailable"
    );

    // Staff attestation is recorded honestly as unverified. A submission record must name
    // the channel it went through (policy.ts assessExternalEvidence, mirrored by the
    // SubmissionExternalRecord_shape_check), so the legitimate allowlisted channel is
    // supplied; staff attestation never yields a verified record.
    const attested = await authorizationService.recordExternalRecord({
      actorUserId: STAFF,
      channel: "government_portal",
      handoffId,
      kind: "external_submission",
      occurredAt: "2026-11-05T00:00:00.000Z",
      operationId: op("staff-attested"),
      packageVersionId,
      projectId: PROJECT,
      provenance: "staff_attested",
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(attested.record.verification, "unverified");
    let afterStaff = await authorizationService.get(scope);
    assert.equal(afterStaff.submissionState, "reported_unverified");
    assert.equal(afterStaff.externalRecords.length, 1);

    // A customer report is likewise unverified and stays labelled as such.
    const reported = await authorizationService.recordExternalRecord({
      actorUserId: OWNER,
      channel: "government_portal",
      kind: "external_submission",
      occurredAt: "2026-11-06T00:00:00.000Z",
      operationId: op("customer-reported"),
      packageVersionId,
      projectId: PROJECT,
      provenance: "customer_reported",
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(reported.record.verification, "unverified");
    const rows = await withClient(
      (sql) =>
        sql<{ provenance: string; verification: string }[]>`
        select "provenance", "verification" from "SubmissionExternalRecord"
        where "projectId" = ${PROJECT} order by "occurredAt"
      `
    );
    assert.deepEqual(
      rows.map((row) => `${row.provenance}:${row.verification}`),
      ["staff_attested:unverified", "customer_reported:unverified"]
    );

    // Only a real trusted verifier may raise a record to verified.
    verifier.mode = "synthetic";
    const verified = await authorizationService.recordExternalRecord({
      actorUserId: STAFF,
      handoffId,
      kind: "external_outcome",
      occurredAt: "2026-11-07T00:00:00.000Z",
      operationId: op("verified-outcome"),
      outcomeCode: "acknowledgement_received",
      packageVersionId,
      projectId: PROJECT,
      provenance: "provider_verified",
      reference: "SYNTHETIC-ACK-1",
      targetId: TARGET,
      targetKind: TARGET_KIND,
    });
    assert.equal(verified.record.verification, "verified");
    verifier.mode = "unavailable";
    afterStaff = await authorizationService.get(scope);
    assert.equal(afterStaff.externalRecords.length, 3);
    assert.equal(afterStaff.submissionState, "reported_unverified");
  });

  test("12 (D): revoked authority and unreadable sources fail closed", async () => {
    // A revoked membership loses write access immediately, inside the transaction.
    // The real lifecycle CHECK requires revokedAt whenever the status is 'revoked'.
    await withClient(
      (sql) =>
        sql`update "ProjectMembership" set status = 'revoked', "revokedAt" = now()
            where "projectId" = ${PROJECT} and "userId" = ${MEMBER}`
    );
    await expectCode(
      () =>
        authorizationService.authorizeSelfService({
          acknowledgedDisclosures: SELF_DISCLOSURES,
          actorUserId: MEMBER,
          operationId: op("revoked-member"),
          packageVersionId: "00000000-0000-4000-8000-000000000000",
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "project_forbidden"
    );

    // A staff account never reads a customer's authorization surface.
    await expectCode(
      () =>
        authorizationService.get({
          actorUserId: STAFF,
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "actor_not_eligible"
    );

    // An unreadable readiness source is UNKNOWN, never READY.
    managed.mode = "unavailable";
    const unknownView = await authorizationService.get(scope);
    assert.equal(
      unknownView.modes.managed_service.readinessStatus,
      "unavailable"
    );
    assert.equal(unknownView.modes.managed_service.available, false);
    await expectCode(
      () =>
        authorizationService.authorizeManagedService({
          acknowledgedDisclosures: MANAGED_DISCLOSURES,
          actorUserId: OWNER,
          operationId: op("managed-unknown"),
          packageVersionId: unknownView.currentPackageVersionId ?? "",
          projectId: PROJECT,
          targetId: TARGET,
          targetKind: TARGET_KIND,
        }),
      "readiness_unknown"
    );
    managed.mode = "real";
  });
}
