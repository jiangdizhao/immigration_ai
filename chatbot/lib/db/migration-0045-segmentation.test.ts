import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Executable proof that Migration 0045 segments into complete, single statements
 * with the marker the project's migrator actually understands.
 *
 * `drizzle-orm/postgres-js/migrator` splits a migration file with the literal
 * `query.split("--> statement-breakpoint")`. A marker with an extra hyphen
 * (`---> statement-breakpoint`) is not a marker at all: those boundaries never
 * split, the neighbouring statements are concatenated, and the file stops being
 * executable. This suite reproduces that splitter exactly and then validates every
 * resulting statement.
 */
const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "../..");
const MIGRATION = resolve(
  chatbotRoot,
  "lib/db/migrations/0045_phase13_m4_006_professional_review.sql"
);
const SUPPORTED_MARKER = "--> statement-breakpoint";

const sql = readFileSync(MIGRATION, "utf8");

/** The exact segmentation the runtime migrator performs. */
function segment(source: string): string[] {
  return source
    .split(SUPPORTED_MARKER)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * Removes comments, quoted strings, quoted identifiers and dollar-quoted bodies so
 * structural checks (`;`, parentheses) only see real SQL syntax.
 */
function structural(sqlText: string): string {
  let out = "";
  let index = 0;
  while (index < sqlText.length) {
    if (sqlText.startsWith("--", index)) {
      const newline = sqlText.indexOf("\n", index);
      index = newline === -1 ? sqlText.length : newline;
      continue;
    }
    if (sqlText.startsWith("/*", index)) {
      const end = sqlText.indexOf("*/", index + 2);
      index = end === -1 ? sqlText.length : end + 2;
      continue;
    }
    if (sqlText[index] === "$") {
      const tag = /^\$[A-Za-z0-9_]*\$/.exec(sqlText.slice(index));
      if (tag) {
        const end = sqlText.indexOf(tag[0], index + tag[0].length);
        index = end === -1 ? sqlText.length : end + tag[0].length;
        continue;
      }
    }
    const quote = sqlText[index];
    if (quote === "'" || quote === '"') {
      let cursor = index + 1;
      while (cursor < sqlText.length) {
        if (sqlText[cursor] === quote && sqlText[cursor + 1] === quote) {
          cursor += 2;
          continue;
        }
        if (sqlText[cursor] === quote) {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      index = cursor;
      continue;
    }
    out += sqlText[index];
    index += 1;
  }
  return out;
}

test("only the supported marker is present, and none is malformed", () => {
  assert.equal(sql.includes("--->"), false, "malformed `--->` marker residue");
  assert.equal(
    sql.split(SUPPORTED_MARKER).length - 1,
    29,
    "expected 29 statement boundaries"
  );
  // A marker glued to the previous statement must still terminate it.
  for (const line of sql.split("\n")) {
    const trimmed = line.trimEnd();
    assert.equal(trimmed.endsWith("--"), false, `orphaned hyphen: ${line}`);
    // A line may be exactly the marker, or carry it inline after `;` (the
    // drizzle-generated form). Anything else is stray marker text.
    const residual = trimmed
      .replace(SUPPORTED_MARKER, "")
      .trimEnd()
      .replace(/;$/u, "");
    assert.equal(
      residual.includes("statement-breakpoint"),
      false,
      `stray marker text: ${line}`
    );
  }
});

test("every segment is exactly one complete SQL statement", () => {
  const statements = segment(sql);
  assert.equal(
    statements.length,
    30,
    `expected 30 statements, got ${statements.length}`
  );
  const allowed = [
    "CREATE TABLE IF NOT EXISTS",
    "ALTER TABLE",
    "CREATE UNIQUE INDEX IF NOT EXISTS",
    "CREATE INDEX IF NOT EXISTS",
    "DO $$",
    "CREATE FUNCTION",
    "CREATE TRIGGER",
  ];
  for (const statement of statements) {
    const body = structural(statement);
    const trimmed = body.trim();
    // Exactly one top-level terminator, and it is the final character.
    const terminators = (trimmed.match(/;/g) ?? []).length;
    assert.equal(
      terminators,
      1,
      `statement must end with exactly one ';': ${statement.slice(0, 60)}`
    );
    assert.ok(
      trimmed.endsWith(";"),
      `statement does not end with ';': ${statement.slice(0, 60)}`
    );
    // Balanced parentheses outside strings/bodies.
    const opens = (trimmed.match(/\(/g) ?? []).length;
    const closes = (trimmed.match(/\)/g) ?? []).length;
    assert.equal(
      opens,
      closes,
      `unbalanced parentheses: ${statement.slice(0, 60)}`
    );
    // Recognised single-statement shape (no accidental concatenation).
    assert.ok(
      allowed.some((prefix) => statement.startsWith(prefix)),
      `unexpected statement start: ${statement.slice(0, 60)}`
    );
    // Two top-level CREATE/ALTER/DO tokens means two statements were concatenated.
    // Dollar-quoted bodies are stripped first, so a DO block wrapping an ALTER TABLE
    // counts once rather than twice.
    const starts = (
      trimmed.match(
        /(^|\n)\s*(CREATE (TABLE|UNIQUE INDEX|INDEX|FUNCTION|TRIGGER)|ALTER TABLE|DO)\b/g
      ) ?? []
    ).length;
    assert.equal(
      starts,
      1,
      `concatenated statements: ${statement.slice(0, 80)}`
    );
  }
});

test("function and DO bodies keep their dollar-quoted payloads intact", () => {
  const statements = segment(sql);
  const functions = statements.filter((entry) =>
    entry.startsWith("CREATE FUNCTION")
  );
  assert.equal(functions.length, 2);
  for (const fn of functions) {
    const tags = (fn.match(/\$fn\$/g) ?? []).length;
    assert.equal(tags, 2, `unterminated $fn$ body: ${fn.slice(0, 60)}`);
    assert.match(fn, /RETURNS trigger LANGUAGE plpgsql AS \$fn\$\n/u);
    assert.match(fn, /\$fn\$;$/u);
    assert.match(fn, /RAISE EXCEPTION/u);
  }
  const blocks = statements.filter((entry) => entry.startsWith("DO $$"));
  assert.equal(blocks.length, 5);
  for (const block of blocks) {
    assert.equal(
      (block.match(/\$\$/g) ?? []).length,
      2,
      "unterminated DO body"
    );
    assert.match(
      block,
      /EXCEPTION\n WHEN duplicate_object THEN null;\nEND \$\$;$/u
    );
  }
});

test("segmentation preserves the schema semantics of every object", () => {
  const statements = segment(sql);
  const count = (prefix: string) =>
    statements.filter((entry) => entry.startsWith(prefix)).length;
  assert.equal(count("CREATE TABLE IF NOT EXISTS"), 2);
  assert.equal(count("CREATE UNIQUE INDEX IF NOT EXISTS"), 4);
  assert.equal(count("CREATE INDEX IF NOT EXISTS"), 3);
  // 5 FK blocks + 12 CHECK constraints.
  assert.equal(count("ALTER TABLE"), 12);
  assert.equal(count("CREATE FUNCTION"), 2);
  assert.equal(count("CREATE TRIGGER"), 2);
  // Twelve CHECK constraints survive the marker fix.
  assert.equal(
    statements.filter((entry) => entry.includes("CHECK (")).length,
    12
  );
  // Triggers still bind to the right relations and timing.
  assert.ok(
    statements.some((entry) =>
      entry.includes(
        'BEFORE INSERT OR UPDATE OR DELETE ON "ProfessionalReviewRequest"'
      )
    )
  );
  assert.ok(
    statements.some((entry) =>
      entry.includes('BEFORE UPDATE OR DELETE ON "ProfessionalReviewRevision"')
    )
  );
});

test("the migration remains additive", () => {
  assert.equal(/^\s*(DROP|TRUNCATE)\s/imu.test(sql), false);
  assert.equal(/^\s*(UPDATE|DELETE FROM|INSERT INTO)\s/imu.test(sql), false);
  assert.equal(
    /ALTER TABLE "(ServicePayment|ServiceEngagement|ServiceAgreement)/u.test(
      sql
    ),
    false
  );
});
