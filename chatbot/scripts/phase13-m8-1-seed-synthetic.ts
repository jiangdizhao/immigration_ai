/**
 * Phase 13 M8.1 - synthetic browser-acceptance bootstrap (test-only, guarded).
 *
 * Creates, against the disposable M8.1 database only:
 *   - one synthetic registered customer (+ bcrypt hash via the repository helper)
 *     and one unrelated synthetic customer for the security journey;
 *   - one active Study Journey Project per customer;
 *   - a real M5.1 school application WITH its immutable prepared package;
 *   - a real M6.1 Student 500 application WITH a persisted M6.2 GS draft.
 *
 * Everything persistent goes through the real services and the real PostgreSQL
 * repositories. Nothing here is a browser-facing mock, and no NextAuth bypass is
 * introduced: the browser signs in through the normal credentials flow.
 *
 * Refuses to run unless the disposable identity is confirmed, and never prints a
 * password or any credential material.
 *
 *   PHASE13_M8_1_SEED_AUTHORIZED=true
 *   PHASE13_M8_1_TEST_DATABASE_URL=postgres://m8_1_test_owner:...@127.0.0.1:55453/immigration_ai_phase13_m8_1_test
 *   PHASE13_M8_1_SEED_EMAIL=synthetic.m8.1@example.invalid
 *   PHASE13_M8_1_SEED_PASSWORD=<synthetic only>
 */
import { compare } from "bcrypt-ts";
import postgres from "postgres";
import { generateHashedPassword } from "../lib/db/utils";
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

const EXPECTED_DATABASE = "immigration_ai_phase13_m8_1_test";
const EXPECTED_ROLE = "m8_1_test_owner";
const EXPECTED_HOST_PORT = "55453";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Mirrors the real login contract (app/(auth)/actions.ts and app/(auth)/auth.ts):
 * zod email <= 64 chars, password 6-128 chars, bcrypt password hash, verified email
 * and an integer session auth version.
 */
const LOGIN_EMAIL_MAX = 64;
const LOGIN_PASSWORD_MIN = 6;
const LOGIN_PASSWORD_MAX = 128;
/** bcrypt only consumes 72 bytes; a longer secret would silently truncate. */
const BCRYPT_PASSWORD_MAX_BYTES = 72;

/**
 * Fails fast when the synthetic credentials cannot satisfy the real login contract, so
 * a browser run can never fail at sign-in for a harness reason. Only the violated rule
 * is reported - never the password, the email value or any hash.
 */
function assertLoginContract(email: string, password: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    fail("synthetic email is not a valid address");
  }
  if (email.length > LOGIN_EMAIL_MAX) {
    fail(
      `synthetic email exceeds the login contract (max ${LOGIN_EMAIL_MAX} characters)`
    );
  }
  const length = [...password].length;
  if (length < LOGIN_PASSWORD_MIN || length > LOGIN_PASSWORD_MAX) {
    fail(
      `synthetic password violates the login contract (${LOGIN_PASSWORD_MIN}-${LOGIN_PASSWORD_MAX} characters required)`
    );
  }
  if (Buffer.byteLength(password, "utf8") > BCRYPT_PASSWORD_MAX_BYTES) {
    fail(
      `synthetic password exceeds bcrypt's ${BCRYPT_PASSWORD_MAX_BYTES}-byte limit and would be truncated`
    );
  }
}

function fail(message: string): never {
  process.stderr.write(`[m8.1-seed] BLOCKED: ${message}\n`);
  process.exit(1);
}

function outsiderEmailFor(email: string): string {
  const at = email.indexOf("@");
  const derived =
    at > 0
      ? `${email.slice(0, at)}+outsider${email.slice(at)}`
      : `${email}+outsider`;
  if (derived.length > 64) {
    fail("derived outsider email would exceed the User.email column bound");
  }
  return derived;
}

async function main() {
  if (process.env.PHASE13_M8_1_SEED_AUTHORIZED !== "true") {
    fail("set PHASE13_M8_1_SEED_AUTHORIZED=true (owner-authorized run only)");
  }
  const url = process.env.PHASE13_M8_1_TEST_DATABASE_URL?.trim() ?? "";
  const email = process.env.PHASE13_M8_1_SEED_EMAIL?.trim().toLowerCase() ?? "";
  const password = process.env.PHASE13_M8_1_SEED_PASSWORD ?? "";
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
      "target must be the loopback M8.1 disposable database (55453) with the M8.1 role"
    );
  }
  if (!email.includes("@") || email.endsWith(".invalid") === false) {
    // Synthetic addresses must be obviously non-real; production mail is never sent.
    fail(
      "use an obviously synthetic address such as synthetic.m8.1@example.invalid"
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
      fail("connected identity does not match the M8.1 disposable database");
    }

    const passwordHash = generateHashedPassword(password);
    async function ensureUser(value: string): Promise<string> {
      const [existing] = await sql<{ id: string }[]>`
        SELECT id FROM "User" WHERE lower(trim(email)) = ${value} LIMIT 1
      `;
      if (existing?.id) {
        await sql`
          UPDATE "User"
          SET password = ${passwordHash}, "emailVerifiedAt" = now(), role = 'user'
          WHERE id = ${existing.id}
        `;
        return existing.id;
      }
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO "User" (email, password, "emailVerifiedAt", role)
        VALUES (${value}, ${passwordHash}, now(), 'user')
        RETURNING id
      `;
      if (!created?.id) {
        fail("synthetic user could not be created");
      }
      return created.id;
    }

    /**
     * Proves the durable credential state satisfies the real login contract BEFORE the
     * browser starts: exactly one normalized-email row, a verified email, an integer
     * session auth version and a stored bcrypt hash that actually verifies. Only rule
     * names are reported; the password and the hash are never printed.
     */
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
      const verified = await compare(password, row.password);
      if (!verified) {
        fail("credential_verification_failed:password_hash_mismatch");
      }
    }
    async function ensureProject(ownerUserId: string): Promise<string> {
      const [existing] = await sql<{ id: string }[]>`
        SELECT id FROM "StudyJourneyProject"
        WHERE "ownerUserId" = ${ownerUserId} AND status = 'active'
        ORDER BY "createdAt" ASC LIMIT 1
      `;
      if (existing?.id) {
        return existing.id;
      }
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO "StudyJourneyProject" ("ownerUserId")
        VALUES (${ownerUserId})
        RETURNING id
      `;
      if (!created?.id) {
        fail("synthetic Project could not be created");
      }
      return created.id;
    }

    const ownerId = await ensureUser(email);
    await assertStoredCredential(ownerId);
    const outsider = outsiderEmailFor(email);
    const outsiderId = await ensureUser(outsider);
    await assertStoredCredential(outsiderId);
    const projectId = await ensureProject(ownerId);
    const outsiderProjectId = await ensureProject(outsiderId);

    // ---- real M5.1 school application + immutable prepared package ----
    const schoolService = createSchoolApplicationService({
      catalogResolver: postgresSchoolApplicationCatalogResolver,
      referenceResolver: postgresSchoolApplicationReferenceResolver,
      store: postgresSchoolApplicationStore,
    });
    const schoolCreate = await schoolService.create({
      actorUserId: ownerId,
      courseTitle: "Synthetic Master of Data Science",
      institutionName: "Synthetic Institute M81",
      intakeLabel: "2027 February",
      operationId: "m8-seed-school-create",
      projectId,
    });
    const schoolTargetId = schoolCreate.application.applicationId;
    await schoolService.buildPackage({
      actorUserId: ownerId,
      applicationId: schoolTargetId,
      expectedRevision: schoolCreate.application.revision,
      operationId: "m8-seed-school-package",
      projectId,
    });

    // ---- real M6.1 Student 500 application + persisted M6.2 GS draft ----
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
      // A genuinely empty projection: the seeded draft has no fact references, so no
      // customer fact content is fabricated for the acceptance run.
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
    const studentCreate = await student500Service.create({
      actorUserId: ownerId,
      context: {
        applicationPlace: "offshore",
        coeStatus: "reported_not_held",
        entryRoute: "offer_only",
      },
      operationId: "m8-seed-student500-create",
      projectId,
    });
    const studentTargetId = studentCreate.application.applicationId;
    const draft = await preparationService.createDraft({
      actorUserId: ownerId,
      applicationId: studentTargetId,
      operationId: "m8-seed-gs-draft",
      projectId,
    });

    process.stdout.write(
      `[m8.1-seed] synthetic environment ready (owner=${ownerId} project=${projectId})\n`
    );
    process.stdout.write(`PHASE13_M8_1_PROJECT_ID=${projectId}\n`);
    process.stdout.write(
      `PHASE13_M8_1_OUTSIDER_PROJECT_ID=${outsiderProjectId}\n`
    );
    process.stdout.write(`PHASE13_M8_1_OUTSIDER_EMAIL=${outsider}\n`);
    process.stdout.write(`PHASE13_M8_1_SCHOOL_TARGET_ID=${schoolTargetId}\n`);
    process.stdout.write(
      `PHASE13_M8_1_STUDENT500_TARGET_ID=${studentTargetId}\n`
    );
    process.stdout.write(`PHASE13_M8_1_GS_DRAFT_ID=${draft.draft.id}\n`);
    process.stdout.write(
      `PHASE13_M8_1_GS_DRAFT_VERSION=${draft.draft.version}\n`
    );
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
    process.stderr.write(`[m8.1-seed] failed: ${String(error)}\n`);
    process.exit(1);
  });
