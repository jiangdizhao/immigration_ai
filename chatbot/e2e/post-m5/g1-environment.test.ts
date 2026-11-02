/**
 * Phase 13 Post-M5 E2E — Gate G1: isolated environment proof (E2E-14).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { closeDb, db, EXPECTED_DATABASE, skipReason } from "./env";
import { scenario } from "./scenario";

const reason = skipReason();

after(async () => {
  await closeDb();
});

test("E2E-14 migrations, guards and least-privilege proof", { skip: reason }, async () => {
  const record = await scenario({
    authorityGrade: "real_internal",
    evidenceClass: ["real_postgres"],
    expected:
      "A fresh isolated cluster reaches journal 0047 with pinned migration hashes, enforced M5 guards, partial current indexes, deferred self-FKs and a least-privilege application role.",
    gate: "G1",
    id: "E2E-14",
    run: async (ctx) => {
      const sql = db();
      const identity = (await sql`
        select current_database() as database, inet_server_port() as port,
               current_user as role, version() as version`)[0] as Record<string, unknown>;
      assert.equal(identity.database, EXPECTED_DATABASE);
      assert.equal(String(identity.port), "5432");
      assert.equal(identity.role, "phase13_postm5_e2e_tester");
      ctx.cite(`pg identity ${identity.database}:${identity.port} as ${identity.role}`);

      const ledger = (await sql`
        select count(*)::int as rows from drizzle.__drizzle_migrations`)[0] as { rows: number };
      assert.equal(ledger.rows, 48, "journal must hold 48 entries");
      const head = (await sql`
        select created_at from drizzle.__drizzle_migrations order by id desc limit 1`)[0] as {
        created_at: string;
      };
      assert.equal(String(head.created_at), "1793353933505");

      const journal = JSON.parse(
        readFileSync("lib/db/migrations/meta/_journal.json", "utf8")
      ) as { entries: Array<{ tag: string; when: number }> };
      const headTag = journal.entries.at(-1)?.tag;
      assert.equal(headTag, "0047_phase13_m5_2_school_admissions");
      for (const [file, expected] of [
        ["0044_phase13_m4_005_service_payment.sql", "d90ebf497dd049cb4f6fc221d2129639714028849a819e7dbb6e5b32a6146f0e"],
        ["0045_phase13_m4_006_professional_review.sql", "1f50752a19df80a538ce50a58e47d852c3373881a133bb3ebe3e556fff8f11ac"],
        ["0046_phase13_m5_1_school_applications.sql", "6d8556099bd1db976b82b830f268cf2954308fc54577cee8af26beaef22955e1"],
      ] as const) {
        const digest = createHash("sha256")
          .update(readFileSync(`lib/db/migrations/${file}`))
          .digest("hex");
        assert.equal(digest, expected, `${file} content hash`);
      }
      ctx.cite("migration 0044/0045/0046 hashes match pinned values");

      const tables = (await sql`
        select count(*)::int as n from information_schema.tables
        where table_schema='public' and table_type='BASE TABLE'
          and (table_name like 'SchoolApplication%' or table_name like 'SchoolAdmission%')`)[0] as {
        n: number;
      };
      assert.equal(tables.n, 12, "12 M5 tables");
      const triggers = (await sql`
        select count(*)::int as n from pg_trigger
        where not tgisinternal and tgname like 'School%' and tgenabled = 'O'`)[0] as { n: number };
      assert.equal(triggers.n, 12, "12 enabled M5 guards");
      const partial = (await sql`
        select count(*)::int as n from pg_indexes
        where schemaname='public' and indexdef like '%WHERE%'
          and (tablename like 'SchoolApplication%' or tablename like 'SchoolAdmission%')`)[0] as {
        n: number;
      };
      assert.ok(partial.n >= 3, `partial current indexes ${partial.n}`);
      const deferred = (await sql`
        select count(*)::int as n from pg_constraint
        where contype='f' and condeferrable and conname like 'School%'`)[0] as { n: number };
      assert.ok(deferred.n >= 2, `deferred self-FKs ${deferred.n}`);

      const privileges = (await sql`
        select has_schema_privilege(current_user,'public','CREATE') as can_ddl,
               has_table_privilege(current_user,'drizzle.__drizzle_migrations','INSERT') as ledger_write,
               has_table_privilege(current_user,'public."ServicePaymentCondition"','INSERT') as payment_write,
               has_table_privilege(current_user,'public."SchoolApplication"','INSERT') as m5_write`)[0] as Record<string, boolean>;
      assert.equal(privileges.can_ddl, false, "no DDL for the application role");
      assert.equal(privileges.ledger_write, false, "no ledger writes");
      assert.equal(privileges.payment_write, false, "frozen payment tables are read-only");
      assert.equal(privileges.m5_write, true, "M5 tables are writable");
      ctx.cite("role matrix: no DDL, no ledger write, no payment write, M5 write");
      return `journal 48 / head 0047; 12 M5 tables, 12 guards, ${partial.n} partial indexes, ${deferred.n} deferred FKs; least-privilege role verified`;
    },
  });
  assert.equal(record.verdict, "PASS", record.observed);
});
