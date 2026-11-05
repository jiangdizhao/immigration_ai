/**
 * Phase 13 M8.3 - synthetic integrated acceptance bootstrap (test-only, guarded).
 *
 * Creates, against the disposable M8.3 database only:
 *   - two synthetic registered customers (owner + unrelated outsider), each with one
 *     active Study Journey Project;
 *   - one real M5.1 school application WITH its immutable prepared package;
 *   - one real M6.1 Student 500 application WITH a persisted M6.2 GS draft;
 *   - one synthetic staff account with an ACTIVE M4-002 assignment on the owner
 *     Project, so the managed-service journey can prove that even an assigned staff
 *     member cannot act while the real M4 predicates are unsatisfied.
 *
 * Everything persistent goes through the real services and the real PostgreSQL
 * repositories. No browser-facing mock and no NextAuth bypass exists: the browser signs
 * in through the normal credentials flow.
 *
 * Refuses to run unless the disposable identity is confirmed, and never prints a
 * password or any credential material.
 *
 *   PHASE13_M8_3_SEED_AUTHORIZED=true
 *   PHASE13_M8_3_TEST_DATABASE_URL=postgres://m8_3_test_owner:...@127.0.0.1:55455/immigration_ai_phase13_m8_3_test
 *   PHASE13_M8_3_SEED_EMAIL=synthetic.m8.3@example.invalid
 *   PHASE13_M8_3_SEED_PASSWORD=<synthetic only>
 */
import { compare } from "bcrypt-ts";
import postgres from "postgres";
import { createProjectStaffAssignmentRepository } from "../lib/db/project-staff-assignment-repository";
import { generateHashedPassword } from "../lib/db/utils";
import { PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION } from "../lib/project-staff-assignments/policy";
import {
  postgresSchoolApplicationCatalogResolver,
  postgresSchoolApplicationReferenceResolver,
  postgresSchoolApplicationStore,
} from "../lib/school-applications/postgres-repository";
import { createSchoolApplicationService } from "../lib/school-applications/service";
import { createDeclaredStudent500LegalSourceProvider } from "../lib/student-500/legal-source-provider";
import {
  createPostgresStudent500Store,
  postgresStudent500SchoolApplicationLinkResolver,
} from "../lib/student-500/postgres-repository";
import { createFactContextPort } from "../lib/student-500/preparation/fact-port";
import { createPostgresPreparationStore } from "../lib/student-500/preparation/postgres-repository";
import { createStudent500PreparationService } from "../lib/student-500/preparation/service";
import { createStudent500RequirementResolver } from "../lib/student-500/requirement-resolver";
import { createStudent500Service } from "../lib/student-500/service";

const EXPECTED_DATABASE = "immigration_ai_phase13_m8_3_test";
const EXPECTED_ROLE = "m8_3_test_owner";
const EXPECTED_HOST_PORT = "55455";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** The real login contract: email <= 64 chars, password 6-128 chars, bcrypt <= 72B. */
const LOGIN_EMAIL_MAX = 64;
const LOGIN_PASSWORD_MIN = 6;
const LOGIN_PASSWORD_MAX = 128;
const BCRYPT_PASSWORD_MAX_BYTES = 72;

function fail(message: string): never {
  process.stderr.write(`[m8.3-seed] BLOCKED: ${message}\n`);
  process.exit(1);
}

function assertLoginContract(email: string, password: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    fail("synthetic email is not a valid address");
  }
  if (email.length > LOGIN_EMAIL_MAX) {
    fail(`synthetic email exceeds the login contract (max ${LOGIN_EMAIL_MAX})`);
  }
  const length = [...password].length;
  if (length < LOGIN_PASSWORD_MIN || length > LOGIN_PASSWORD_MAX) {
    fail(
      `synthetic password violates the login contract (${LOGIN_PASSWORD_MIN}-${LOGIN_PASSWORD_MAX} characters)`
    );
  }
  if (Buffer.byteLength(password, "utf8") > BCRYPT_PASSWORD_MAX_BYTES) {
    fail(
      `synthetic password exceeds bcrypt's ${BCRYPT_PASSWORD_MAX_BYTES}-byte limit`
    );
  }
}

function derivedEmail(email: string, tag: string): string {
  const at = email.indexOf("@");
  const value =
    at > 0
      ? `${email.slice(0, at)}+${tag}${email.slice(at)}`
      : `${email}+${tag}`;
  if (value.length > LOGIN_EMAIL_MAX) {
    fail(`derived ${tag} email would exceed the User.email column bound`);
  }
  return value;
}

async function main() {
  if (process.env.PHASE13_M8_3_SEED_AUTHORIZED !== "true") {
    fail("set PHASE13_M8_3_SEED_AUTHORIZED=true (owner-authorized run only)");
  }
  const url = process.env.PHASE13_M8_3_TEST_DATABASE_URL?.trim() ?? "";
  const email = process.env.PHASE13_M8_3_SEED_EMAIL?.trim().toLowerCase() ?? "";
  const password = process.env.PHASE13_M8_3_SEED_PASSWORD ?? "";
  if (!(url && email && password)) {
    fail("database URL, synthetic email and synthetic password are required");
  }
  const parsed = new URL(url);
  if (
    !LOOPBACK.has(parsed.hostname) ||
    parsed.port !== EXPECTED_HOST_PORT ||
    parsed.pathname.replace(/^\//u, "") !== EXPECTED_DATABASE ||
    parsed.username !== EXPECTED_ROLE
  ) {
    fail(
      "target must be the loopback M8.3 disposable database (55455) with the M8.3 role"
    );
  }
  if (!email.endsWith(".invalid")) {
    fail(
      "use an obviously synthetic address such as synthetic.m8.3@example.invalid"
    );
  }
  assertLoginContract(email, password);

  const sql = postgres(url, { max: 1 });
  try {
    const [identity] = await sql<{ database: string; role: string }[]>`
      SELECT current_database() AS database, current_user AS role
    `;
    if (
      identity?.database !== EXPECTED_DATABASE ||
      identity?.role !== EXPECTED_ROLE
    ) {
      fail("connected identity does not match the M8.3 disposable database");
    }

    const passwordHash = generateHashedPassword(password);
    async function ensureUser(
      value: string,
      role: "user" | "lawyer" | "admin"
    ): Promise<string> {
      const [existing] = await sql<{ id: string }[]>`
        SELECT id FROM "User" WHERE lower(trim(email)) = ${value} LIMIT 1
      `;
      if (existing?.id) {
        await sql`
          UPDATE "User"
          SET password = ${passwordHash}, "emailVerifiedAt" = now(), role = ${role}
          WHERE id = ${existing.id}
        `;
        return existing.id;
      }
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO "User" (email, password, "emailVerifiedAt", role)
        VALUES (${value}, ${passwordHash}, now(), ${role})
        RETURNING id
      `;
      if (!created?.id) {
        fail("synthetic user could not be created");
      }
      return created.id;
    }

    /** Proves the durable credential satisfies the real login contract beforehand. */
    async function assertStoredCredential(userId: string): Promise<void> {
      const [row] = await sql<
        {
          authVersion: number | null;
          emailVerifiedAt: Date | null;
          password: string | null;
          sameEmail: string;
        }[]
      >`
        SELECT u."password" AS password,
               u."emailVerifiedAt" AS "emailVerifiedAt",
               u."authVersion" AS "authVersion",
               (SELECT count(*)::text FROM "User" other
                 WHERE lower(btrim(other.email)) = lower(btrim(u.email))) AS "sameEmail"
        FROM "User" u WHERE u.id = ${userId} LIMIT 1
      `;
      if (!row) {
        fail("credential_verification_failed:user_missing");
      }
      if (row.sameEmail !== "1") {
        fail("credential_verification_failed:duplicate_normalized_email");
      }
      if (!row.emailVerifiedAt) {
        fail("credential_verification_failed:email_not_verified");
      }
      if (!Number.isInteger(row.authVersion)) {
        fail("credential_verification_failed:missing_auth_version");
      }
      if (!row.password) {
        fail("credential_verification_failed:missing_password_hash");
      }
      if (!(await compare(password, row.password))) {
        fail("credential_verification_failed:password_hash_mismatch");
      }
    }

    /**
     * Deterministic Project ids, one per journey, so the three Chromium journeys never
     * share Project, application or package state and cannot depend on each other.
     */
    async function ensureProject(
      id: string,
      ownerUserId: string
    ): Promise<string> {
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO "StudyJourneyProject" ("id", "ownerUserId") VALUES (${id}, ${ownerUserId})
        ON CONFLICT ("id") DO NOTHING
        RETURNING id
      `;
      const [row] = await sql<{ id: string }[]>`
        SELECT id FROM "StudyJourneyProject" WHERE id = ${id} LIMIT 1
      `;
      if (!row?.id) {
        fail("synthetic Project could not be created");
      }
      return created?.id ?? row.id;
    }

    async function projectRevision(projectId: string): Promise<number> {
      const [row] = await sql<{ revision: number }[]>`
        SELECT revision FROM "StudyJourneyProject" WHERE id = ${projectId} LIMIT 1
      `;
      if (!row) {
        fail("the synthetic Project is missing");
      }
      return row.revision;
    }

    const ownerId = await ensureUser(email, "user");
    await assertStoredCredential(ownerId);
    const outsider = derivedEmail(email, "outsider");
    const outsiderId = await ensureUser(outsider, "user");
    await assertStoredCredential(outsiderId);
    const staffEmail = derivedEmail(email, "staff");
    const staffId = await ensureUser(staffEmail, "lawyer");
    await assertStoredCredential(staffId);
    const adminEmail = derivedEmail(email, "admin");
    const adminId = await ensureUser(adminEmail, "admin");
    await assertStoredCredential(adminId);
    const schoolProjectId = await ensureProject(
      "22222222-2222-4222-8222-22222222b801",
      ownerId
    );
    const studentProjectId = await ensureProject(
      "22222222-2222-4222-8222-22222222b802",
      ownerId
    );
    const managedProjectId = await ensureProject(
      "22222222-2222-4222-8222-22222222b803",
      ownerId
    );
    const outsiderProjectId = await ensureProject(
      "22222222-2222-4222-8222-22222222b804",
      outsiderId
    );

    // ---- active M4-002 assignment on the managed-service Project ----
    // It is deliberately present: an assigned staff member exists, yet the customer must
    // still be unable to obtain managed service because production professional
    // authority is not established.
    const [existingAssignment] = await sql<{ id: string }[]>`
      SELECT id FROM "ProjectStaffAssignment"
      WHERE "projectId" = ${managedProjectId} AND "staffUserId" = ${staffId}
        AND purpose = 'project_staff_collaboration'
        AND status IN ('proposed','owner_approved','active')
      LIMIT 1
    `;
    if (!existingAssignment?.id) {
      // The M4-002 assignment must be produced by the REAL repository: its deferred
      // audit triggers require the operation, the assignment and exactly one matching
      // ProjectEvent to commit together at the same project revision. Hand-written rows
      // cannot satisfy that, and a hand-written FK target caused the earlier 23503.
      const staffRepository = createProjectStaffAssignmentRepository();
      await staffRepository.propose({
        actorUserId: adminId,
        operationId: "m83-seed-staff-propose",
        projectId: managedProjectId,
        staffUserId: staffId,
      });
      const [assignment] = await staffRepository.listOwnerAssignments({
        actorUserId: ownerId,
        projectId: managedProjectId,
      });
      if (!assignment) {
        fail("staff assignment proposal was not created");
      }
      await staffRepository.transition({
        action: "owner_approve",
        actorUserId: ownerId,
        assignmentId: assignment.assignmentId,
        expectedProjectRevision: await projectRevision(managedProjectId),
        noticeVersion: PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
        operationId: "m83-seed-staff-approve",
        projectId: managedProjectId,
        proposalSha256: assignment.proposalSha256,
      });
      await staffRepository.transition({
        action: "lawyer_accept",
        actorUserId: staffId,
        assignmentId: assignment.assignmentId,
        expectedProjectRevision: await projectRevision(managedProjectId),
        operationId: "m83-seed-staff-accept",
        projectId: managedProjectId,
      });
    }

    // Fail loudly if the fixture is not genuinely usable.
    const [activeAssignment] = await sql<{ status: string }[]>`
      SELECT status FROM "ProjectStaffAssignment"
      WHERE "projectId" = ${managedProjectId} AND "staffUserId" = ${staffId}
        AND status = 'active'
      LIMIT 1
    `;
    if (activeAssignment?.status !== "active") {
      fail("the synthetic staff assignment is not active");
    }

    // ---- journey 1: real M5.1 school application + its preparation package ----
    // This is the M5.1 preparation package, NOT an M8.1 submission package: the journey
    // builds the M8.1 package itself, because a missing M8 package is a valid state.
    const schoolService = createSchoolApplicationService({
      catalogResolver: postgresSchoolApplicationCatalogResolver,
      referenceResolver: postgresSchoolApplicationReferenceResolver,
      store: postgresSchoolApplicationStore,
    });
    const schoolCreate = await schoolService.create({
      actorUserId: ownerId,
      courseTitle: "Synthetic Master of Data Science",
      institutionName: "Synthetic Institute M83",
      intakeLabel: "2027 February",
      operationId: "m83-seed-school-create-j1",
      projectId: schoolProjectId,
    });
    const schoolTargetId = schoolCreate.application.applicationId;
    await schoolService.buildPackage({
      actorUserId: ownerId,
      applicationId: schoolTargetId,
      expectedRevision: schoolCreate.application.revision,
      operationId: "m83-seed-school-package-j1",
      projectId: schoolProjectId,
    });

    // ---- journeys 2 and 3: real M6.1 Student 500 applications + persisted GS drafts ----
    const student500Store = createPostgresStudent500Store();
    const student500Service = createStudent500Service({
      resolver: createStudent500RequirementResolver({
        provider: createDeclaredStudent500LegalSourceProvider(),
      }),
      schoolApplicationLink: postgresStudent500SchoolApplicationLinkResolver,
      store: student500Store,
    });
    const preparationService = createStudent500PreparationService({
      applications: student500Store,
      // A genuinely empty projection: no customer fact content is fabricated.
      facts: createFactContextPort({
        projection: () =>
          Promise.resolve({
            authorizedForAI: [],
            available: true,
            conflicts: [],
            unresolvedCandidates: [],
          }),
      }),
      screen: async (input) => {
        const application = await student500Store.getApplication({
          applicationId: input.applicationId,
          ownerUserId: input.actorUserId,
          projectId: input.projectId,
        });
        if (!application) {
          throw new Error("application_not_found");
        }
        return createStudent500RequirementResolver({
          provider: createDeclaredStudent500LegalSourceProvider(),
        }).resolve({
          context: application.context,
          linkedSchoolApplication: null,
        });
      },
      store: createPostgresPreparationStore(),
    });

    async function seedStudent500(input: {
      journey: string;
      projectId: string;
    }): Promise<string> {
      const created = await student500Service.create({
        actorUserId: ownerId,
        context: {
          applicationPlace: "offshore",
          coeStatus: "reported_not_held",
          entryRoute: "offer_only",
        },
        operationId: `m83-seed-student500-create-${input.journey}`,
        projectId: input.projectId,
      });
      const applicationId = created.application.applicationId;
      await preparationService.createDraft({
        actorUserId: ownerId,
        applicationId,
        operationId: `m83-seed-gs-draft-${input.journey}`,
        projectId: input.projectId,
      });
      return applicationId;
    }

    const studentTargetId = await seedStudent500({
      journey: "j2",
      projectId: studentProjectId,
    });
    const managedTargetId = await seedStudent500({
      journey: "j3",
      projectId: managedProjectId,
    });

    process.stdout.write(
      "[m8.3-seed] synthetic environment ready: 3 independent journey Projects\n"
    );
    process.stdout.write(`PHASE13_M8_3_SCHOOL_PROJECT_ID=${schoolProjectId}\n`);
    process.stdout.write(`PHASE13_M8_3_SCHOOL_TARGET_ID=${schoolTargetId}\n`);
    process.stdout.write(
      `PHASE13_M8_3_STUDENT_PROJECT_ID=${studentProjectId}\n`
    );
    process.stdout.write(
      `PHASE13_M8_3_STUDENT500_TARGET_ID=${studentTargetId}\n`
    );
    process.stdout.write(
      `PHASE13_M8_3_MANAGED_PROJECT_ID=${managedProjectId}\n`
    );
    process.stdout.write(`PHASE13_M8_3_MANAGED_TARGET_ID=${managedTargetId}\n`);
    process.stdout.write(
      `PHASE13_M8_3_OUTSIDER_PROJECT_ID=${outsiderProjectId}\n`
    );
    process.stdout.write(`PHASE13_M8_3_OUTSIDER_EMAIL=${outsider}\n`);
    process.stdout.write(`PHASE13_M8_3_STAFF_EMAIL=${staffEmail}\n`);
    process.stdout.write(`PHASE13_M8_3_ADMIN_EMAIL=${adminEmail}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main()
  .then(async () => {
    const { closeLazyDatabase } = await import("../lib/db/runtime-client");
    await closeLazyDatabase();
  })
  .catch((error: unknown) => {
    process.stderr.write(`[m8.3-seed] failed: ${String(error)}\n`);
    process.exit(1);
  });
