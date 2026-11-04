/**
 * Phase 13 M7 - synthetic account/Project bootstrap (test-only, guarded).
 *
 * Creates ONE synthetic registered customer with an approved bcrypt hash (via the
 * repository's own generateHashedPassword helper), a verified email state and an
 * owned Study Journey Project. No auth bypass is introduced: the account signs in
 * through the normal NextAuth credentials flow.
 *
 * Refuses to run unless the disposable M7 database identity is confirmed.
 * Never prints the password or any credential material.
 *
 *   PHASE13_M7_SEED_AUTHORIZED=true
 *   PHASE13_M7_TEST_DATABASE_URL=postgres://m7_test_owner:...@127.0.0.1:55451/immigration_ai_phase13_m7_test
 *   PHASE13_M7_SEED_EMAIL=synthetic.m7@example.invalid
 *   PHASE13_M7_SEED_PASSWORD=<synthetic only>
 */
import postgres from "postgres";
import { generateHashedPassword } from "../lib/db/utils";

const EXPECTED_DATABASE = "immigration_ai_phase13_m7_test";
const EXPECTED_ROLE = "m7_test_owner";

function fail(message: string): never {
  process.stderr.write(`[m7-seed] BLOCKED: ${message}\n`);
  process.exit(1);
}

async function main() {
  if (process.env.PHASE13_M7_SEED_AUTHORIZED !== "true") {
    fail("set PHASE13_M7_SEED_AUTHORIZED=true (owner-authorized run only)");
  }
  const url = process.env.PHASE13_M7_TEST_DATABASE_URL?.trim() ?? "";
  const email = process.env.PHASE13_M7_SEED_EMAIL?.trim().toLowerCase() ?? "";
  const password = process.env.PHASE13_M7_SEED_PASSWORD ?? "";
  if (!(url && email && password)) {
    fail("database URL, synthetic email and synthetic password are required");
  }
  const parsed = new URL(url);
  if (
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "55451" ||
    parsed.pathname.replace(/^\//u, "") !== EXPECTED_DATABASE
  ) {
    fail("target must be the loopback M7 disposable database on port 55451");
  }
  if (parsed.username !== EXPECTED_ROLE) {
    fail("target role must be the dedicated M7 test role");
  }

  const sql = postgres(url, { max: 1 });
  try {
    const [identity] = await sql<{ database: string; role: string }[]>`
      SELECT current_database() AS database, current_user AS role
    `;
    if (
      identity?.database !== EXPECTED_DATABASE ||
      identity?.role !== EXPECTED_ROLE
    ) {
      fail("connected identity does not match the M7 disposable database");
    }

    const passwordHash = generateHashedPassword(password);
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM "User" WHERE lower(trim(email)) = ${email} LIMIT 1
    `;
    let userId = existing?.id ?? "";
    if (userId) {
      await sql`
        UPDATE "User"
        SET password = ${passwordHash}, "emailVerifiedAt" = now(), role = 'user'
        WHERE id = ${userId}
      `;
    } else {
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO "User" (email, password, "emailVerifiedAt", role)
        VALUES (${email}, ${passwordHash}, now(), 'user')
        RETURNING id
      `;
      userId = created?.id ?? "";
    }
    if (!userId) {
      fail("synthetic user could not be created");
    }

    const [project] = await sql<{ id: string }[]>`
      SELECT id FROM "StudyJourneyProject"
      WHERE "ownerUserId" = ${userId} AND status = 'active'
      ORDER BY "createdAt" ASC LIMIT 1
    `;
    let projectId = project?.id ?? "";
    if (!projectId) {
      // StudyJourneyProject persists no display-name column; the owned
      // relationship to the synthetic user is the whole bootstrap contract.
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO "StudyJourneyProject" ("ownerUserId")
        VALUES (${userId})
        RETURNING id
      `;
      projectId = created?.id ?? "";
    }
    if (!projectId) {
      fail("synthetic Project could not be created");
    }

    process.stdout.write(
      `[m7-seed] synthetic account and Project ready (user=${userId} project=${projectId})\n`
    );
    process.stdout.write(`PHASE13_M7_PROJECT_ID=${projectId}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`[m7-seed] failed: ${String(error)}\n`);
  process.exit(1);
});
