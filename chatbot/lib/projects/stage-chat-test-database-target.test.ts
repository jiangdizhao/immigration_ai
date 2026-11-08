// biome-ignore-all lint/suspicious/noMisplacedAssertion: `rejection()` is a test helper called only from the tests below; assertions never run at import time.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateStageChatTestGuards,
  parseStageChatTestDatabaseUrl,
  STAGE_CHAT_TEST_APPROVAL,
  STAGE_CHAT_TEST_DATABASE,
  STAGE_CHAT_TEST_PORT,
  StageChatTestDatabaseTargetError,
  type StageChatTestMigrationSnapshot,
  verifyStageChatTestMigrationReadiness,
  verifyStageChatTestServerIdentity,
} from "./stage-chat-test-database-target";

/**
 * Phase 13 M9-A R1-T02 — offline safety regressions for the guarded suite's target.
 *
 * These tests are **database-free**: they never import the PostgreSQL driver, never open a
 * pool and never execute SQL. They prove that an unsafe target is refused *before* any
 * connection could be made, which is the whole point of the allowlist.
 */

const APPROVED = `postgres://127.0.0.1:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}`;

function rejection(raw: string): string {
  const result = parseStageChatTestDatabaseUrl(raw);
  assert.equal(result.ok, false, `expected ${raw} to be rejected`);
  return result.ok ? "" : result.reason;
}

test("the approved disposable target is accepted", () => {
  const result = parseStageChatTestDatabaseUrl(APPROVED);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.target : null, {
    database: STAGE_CHAT_TEST_DATABASE,
    host: "127.0.0.1",
    port: STAGE_CHAT_TEST_PORT,
  });
  // `localhost` and the `postgresql:` alias are structurally equivalent loopback targets.
  assert.equal(
    parseStageChatTestDatabaseUrl(
      `postgresql://localhost:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}`
    ).ok,
    true
  );
  // Credentials are permitted, but are never echoed back by the validator.
  const withCredentials = parseStageChatTestDatabaseUrl(
    `postgres://someone:sup3r-secret@127.0.0.1:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}`
  );
  assert.equal(withCredentials.ok, true);
  assert.equal(JSON.stringify(withCredentials).includes("sup3r-secret"), false);
  assert.equal(JSON.stringify(withCredentials).includes("someone"), false);
});

test("the normal application database and the legal corpus are rejected", () => {
  // T02-04 (1): the ordinary application database.
  assert.equal(
    rejection("postgres://127.0.0.1:5432/chatbot"),
    "unexpected_database"
  );
  // T02-04 (2): the authoritative legal corpus.
  assert.equal(
    rejection("postgres://127.0.0.1:5432/immigration_legal"),
    "unexpected_database"
  );
  // T02-04 (3): any other local database, including near-misses of the approved name.
  assert.equal(
    rejection("postgres://127.0.0.1:5432/postgres"),
    "unexpected_database"
  );
  assert.equal(
    rejection("postgres://127.0.0.1:5432/immigration_ai_phase13_m9_a_te"),
    "unexpected_database"
  );
  assert.equal(
    rejection(`postgres://127.0.0.1:5432/${STAGE_CHAT_TEST_DATABASE}_other`),
    "unexpected_database"
  );
  // Case and trailing-slash variants are not silently normalised into the approved name.
  assert.equal(
    rejection("postgres://127.0.0.1:5432/IMMIGRATION_AI_PHASE13_M9_A_TEST"),
    "unexpected_database"
  );
  assert.equal(
    rejection(`postgres://127.0.0.1:5432/${STAGE_CHAT_TEST_DATABASE}/`),
    "unexpected_database"
  );
  // A second path segment cannot smuggle a different database.
  assert.equal(
    rejection(`postgres://127.0.0.1:5432/${STAGE_CHAT_TEST_DATABASE}/chatbot`),
    "unexpected_database"
  );
});

test("remote hosts and non-loopback addresses are rejected", () => {
  // T02-04 (4): a remote PostgreSQL host.
  for (const host of [
    "10.0.0.5",
    "192.168.1.10",
    "db.example.com",
    "postgres.internal",
    "127.0.0.2",
    "0.0.0.0",
  ]) {
    assert.equal(
      rejection(
        `postgres://${host}:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}`
      ),
      "remote_host_not_allowed",
      `host ${host} must be rejected`
    );
  }
  // IPv6 (including loopback) is outside the allowlist.
  assert.equal(
    rejection(
      `postgres://[::1]:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}`
    ),
    "remote_host_not_allowed"
  );
  // A comma- or semicolon-separated host list is refused outright.
  assert.equal(
    rejection(
      `postgres://127.0.0.1,10.0.0.5:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}`
    ),
    "multi_host_not_allowed"
  );
  assert.equal(
    rejection(
      `postgres://127.0.0.1;10.0.0.5:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}`
    ),
    "multi_host_not_allowed"
  );
});

test("a Unix-domain socket target is rejected in every form", () => {
  // No host at all.
  assert.equal(
    rejection(`postgres:///${STAGE_CHAT_TEST_DATABASE}`),
    "unix_socket_not_allowed"
  );
  // Percent-encoded socket path used as the host.
  assert.equal(
    rejection(
      `postgres://%2Fvar%2Frun%2Fpostgresql:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}`
    ),
    "unix_socket_not_allowed"
  );
  // Socket supplied as a query override.
  assert.equal(
    rejection(
      `postgres://127.0.0.1:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}?host=/var/run/postgresql`
    ),
    "override_parameter_not_allowed"
  );
});

test("an unexpected or missing port is rejected", () => {
  // T02-04 (5): an unexpected port, including the stale Phase-1b port 5433.
  for (const port of ["5433", "6543", "6432", "15432"]) {
    assert.equal(
      rejection(`postgres://127.0.0.1:${port}/${STAGE_CHAT_TEST_DATABASE}`),
      "unexpected_port",
      `port ${port} must be rejected`
    );
  }
  // A missing port is not defaulted silently: the configuration must be explicit.
  assert.equal(
    rejection(`postgres://127.0.0.1/${STAGE_CHAT_TEST_DATABASE}`),
    "missing_port"
  );
});

test("missing, malformed and non-postgres configuration is rejected", () => {
  // T02-04 (6): missing or malformed connection configuration.
  assert.equal(rejection(""), "missing_configuration");
  assert.equal(rejection("   "), "missing_configuration");
  const undefinedResult = parseStageChatTestDatabaseUrl(undefined);
  assert.equal(undefinedResult.ok, false);
  assert.equal(
    undefinedResult.ok ? "" : undefinedResult.reason,
    "missing_configuration"
  );

  for (const malformed of [
    "not a url",
    "127.0.0.1:5432",
    `postgres://127.0.0.1:${STAGE_CHAT_TEST_PORT}`,
    "://127.0.0.1:5432/db",
    `postgres://127.0.0.1:notaport/${STAGE_CHAT_TEST_DATABASE}`,
  ]) {
    const result = parseStageChatTestDatabaseUrl(malformed);
    assert.equal(result.ok, false, `${malformed} must be rejected`);
    if (!result.ok) {
      assert.ok(
        ["malformed_url", "missing_database", "missing_configuration"].includes(
          result.reason
        ),
        `unexpected reason for ${malformed}: ${result.reason}`
      );
    }
  }

  for (const wrongProtocol of [
    `http://127.0.0.1:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}`,
    `mysql://127.0.0.1:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}`,
    `file:///tmp/${STAGE_CHAT_TEST_DATABASE}`,
  ]) {
    assert.equal(rejection(wrongProtocol), "unsupported_protocol");
  }
});

test("connection-target override parameters are rejected", () => {
  // T02-04 (7): parameters that can redirect the connection elsewhere.
  for (const parameter of [
    "host=10.0.0.5",
    "hostaddr=10.0.0.5",
    "port=6543",
    "dbname=chatbot",
    "database=immigration_legal",
    "service=remote",
    "passfile=/tmp/pgpass",
    "options=-c%20search_path%3Dpublic",
    "sslmode=disable",
  ]) {
    assert.equal(
      rejection(
        `postgres://127.0.0.1:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}?${parameter}`
      ),
      "override_parameter_not_allowed",
      `parameter ${parameter} must be rejected`
    );
  }
  // A harmless-looking parameter is still refused: the target must be fully explicit.
  assert.equal(
    rejection(
      `postgres://127.0.0.1:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}?application_name=m9a`
    ),
    "override_parameter_not_allowed"
  );
  // A URL fragment is refused too.
  assert.equal(
    rejection(
      `postgres://127.0.0.1:${STAGE_CHAT_TEST_PORT}/${STAGE_CHAT_TEST_DATABASE}#x`
    ),
    "unexpected_fragment"
  );
});

test("the suite is denied unless all three owner guards are present", () => {
  const full = {
    approval: STAGE_CHAT_TEST_APPROVAL,
    databaseUrl: APPROVED,
    runnerVerified: "1",
  };

  // The safe default: every missing guard skips rather than runs.
  for (const input of [
    {},
    { databaseUrl: APPROVED },
    { approval: STAGE_CHAT_TEST_APPROVAL, databaseUrl: APPROVED },
    { approval: STAGE_CHAT_TEST_APPROVAL, runnerVerified: "1" },
    { runnerVerified: "1" },
    { databaseUrl: APPROVED, runnerVerified: "1" },
    { ...full, runnerVerified: "true" },
    { ...full, runnerVerified: "0" },
    { ...full, approval: "yes" },
    { ...full, databaseUrl: "   " },
  ]) {
    const decision = evaluateStageChatTestGuards(input);
    assert.equal(
      decision.run,
      false,
      `must not run for ${JSON.stringify(input)}`
    );
    assert.equal(
      decision.run
        ? ""
        : typeof decision.skipReason === "string" &&
            decision.skipReason.length > 0,
      true
    );
  }

  // Only the complete, exactly-matching configuration runs.
  const approved = evaluateStageChatTestGuards(full);
  assert.equal(approved.run, true);
  assert.deepEqual(approved.run ? approved.target : null, {
    database: STAGE_CHAT_TEST_DATABASE,
    host: "127.0.0.1",
    port: STAGE_CHAT_TEST_PORT,
  });
});

test("an authorised run with an unsafe target throws instead of skipping", () => {
  // A skip would silently hide a misconfiguration that carries owner approval.
  assert.throws(
    () =>
      evaluateStageChatTestGuards({
        approval: STAGE_CHAT_TEST_APPROVAL,
        databaseUrl: "postgres://127.0.0.1:5432/chatbot",
        runnerVerified: "1",
      }),
    (error: unknown) =>
      error instanceof StageChatTestDatabaseTargetError &&
      error.code === "unexpected_database" &&
      // The diagnostic never leaks credentials.
      error.message.includes("immigration_ai_phase13_m9_a_test")
  );
  assert.throws(
    () =>
      evaluateStageChatTestGuards({
        approval: STAGE_CHAT_TEST_APPROVAL,
        databaseUrl: "postgres://user:secret@10.0.0.5:5432/chatbot",
        runnerVerified: "1",
      }),
    (error: unknown) =>
      error instanceof StageChatTestDatabaseTargetError &&
      !error.message.includes("secret")
  );
});

test("the runtime server identity must be the approved loopback database", () => {
  assert.deepEqual(
    verifyStageChatTestServerIdentity({
      currentDatabase: STAGE_CHAT_TEST_DATABASE,
      serverAddress: "127.0.0.1",
      serverPort: 5432,
    }),
    { ok: true }
  );
  // `::1` is accepted as the IPv6 loopback form of `localhost`.
  assert.deepEqual(
    verifyStageChatTestServerIdentity({
      currentDatabase: STAGE_CHAT_TEST_DATABASE,
      serverAddress: "::1",
      serverPort: 5432,
    }),
    { ok: true }
  );
  // A numeric port reported as text is still accepted.
  assert.deepEqual(
    verifyStageChatTestServerIdentity({
      currentDatabase: STAGE_CHAT_TEST_DATABASE,
      serverAddress: "127.0.0.1",
      serverPort: "5432",
    }),
    { ok: true }
  );

  const cases: readonly {
    input: Parameters<typeof verifyStageChatTestServerIdentity>[0];
    reason: string;
  }[] = [
    {
      input: {
        currentDatabase: "chatbot",
        serverAddress: "127.0.0.1",
        serverPort: 5432,
      },
      reason: "database_mismatch",
    },
    {
      input: {
        currentDatabase: "immigration_legal",
        serverAddress: "127.0.0.1",
        serverPort: 5432,
      },
      reason: "database_mismatch",
    },
    {
      // A Unix-socket connection reports no peer address: never silently accepted.
      input: {
        currentDatabase: STAGE_CHAT_TEST_DATABASE,
        serverAddress: null,
        serverPort: 5432,
      },
      reason: "unix_socket_connection",
    },
    {
      input: {
        currentDatabase: STAGE_CHAT_TEST_DATABASE,
        serverAddress: "10.0.0.5",
        serverPort: 5432,
      },
      reason: "not_loopback",
    },
    {
      // An unexpected loopback *form* is refused rather than guessed.
      input: {
        currentDatabase: STAGE_CHAT_TEST_DATABASE,
        serverAddress: "::ffff:127.0.0.1",
        serverPort: 5432,
      },
      reason: "not_loopback",
    },
    {
      input: {
        currentDatabase: STAGE_CHAT_TEST_DATABASE,
        serverAddress: "127.0.0.1",
        serverPort: 5433,
      },
      reason: "port_mismatch",
    },
    {
      input: {
        currentDatabase: STAGE_CHAT_TEST_DATABASE,
        serverAddress: "127.0.0.1",
        serverPort: null,
      },
      reason: "unverifiable_identity",
    },
    {
      input: {
        currentDatabase: null,
        serverAddress: "127.0.0.1",
        serverPort: 5432,
      },
      reason: "unverifiable_identity",
    },
  ];

  for (const testCase of cases) {
    const result = verifyStageChatTestServerIdentity(testCase.input);
    assert.equal(result.ok, false);
    assert.equal(
      result.ok ? "" : result.reason,
      testCase.reason,
      `identity case ${JSON.stringify(testCase.input)}`
    );
  }
});

const READY_SNAPSHOT: StageChatTestMigrationSnapshot = {
  checkConstraints: [
    {
      definition:
        "CHECK (((stageKey)::text = ANY ((ARRAY['school_applications'::character varying, 'school_admissions'::character varying, 'student500'::character varying])::text[])))",
      name: "ProjectConversationStage_stage_key_check",
    },
  ],
  columns: [
    {
      columnDefault: null,
      dataType: "uuid",
      isNullable: false,
      name: "chatId",
    },
    {
      columnDefault: null,
      dataType: "uuid",
      isNullable: false,
      name: "projectId",
    },
    {
      columnDefault: null,
      dataType: "uuid",
      isNullable: false,
      name: "createdByUserId",
    },
    {
      columnDefault: null,
      dataType: "character varying",
      isNullable: false,
      name: "stageKey",
    },
    {
      columnDefault: "now()",
      dataType: "timestamp without time zone",
      isNullable: false,
      name: "createdAt",
    },
  ],
  foreignKeys: [
    {
      definition:
        'FOREIGN KEY ("chatId", "projectId", "createdByUserId") REFERENCES "ProjectConversation"("chatId", "projectId", "createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT',
      name: "ProjectConversationStage_conversation_fk",
    },
  ],
  primaryKeyColumns: ["chatId"],
  tableExists: true,
  uniqueIndexes: [
    {
      definition:
        'CREATE UNIQUE INDEX "ProjectConversationStage_owner_stage_unique" ON public."ProjectConversationStage" USING btree ("projectId", "createdByUserId", "stageKey")',
      name: "ProjectConversationStage_owner_stage_unique",
    },
  ],
};

function problemsOf(
  result: ReturnType<typeof verifyStageChatTestMigrationReadiness>
) {
  return (result.ok ? [] : result.problems).join(" ");
}

test("migration 0053 readiness is verified from definitions, not names", () => {
  assert.deepEqual(verifyStageChatTestMigrationReadiness(READY_SNAPSHOT), {
    ok: true,
  });

  // The table must exist at all.
  const missingTable = verifyStageChatTestMigrationReadiness({
    ...READY_SNAPSHOT,
    tableExists: false,
  });
  assert.equal(missingTable.ok, false);
  assert.match(
    problemsOf(missingTable),
    /migration 0053 has not been applied/u
  );

  // A foreign key with the right name but the wrong definition is not accepted.
  const wrongForeignKey = verifyStageChatTestMigrationReadiness({
    ...READY_SNAPSHOT,
    foreignKeys: [
      {
        definition:
          'FOREIGN KEY ("chatId") REFERENCES "ProjectConversation"("chatId") ON DELETE CASCADE',
        name: "ProjectConversationStage_conversation_fk",
      },
    ],
  });
  assert.equal(wrongForeignKey.ok, false);
  assert.match(
    problemsOf(wrongForeignKey),
    /must cover \(chatid,projectid,createdbyuserid\)/u
  );
  assert.match(problemsOf(wrongForeignKey), /ON DELETE RESTRICT/u);

  // A closed-vocabulary CHECK that lost one step is incomplete.
  const partialCheck = verifyStageChatTestMigrationReadiness({
    ...READY_SNAPSHOT,
    checkConstraints: [
      {
        definition:
          "CHECK (((stageKey)::text = ANY ((ARRAY['school_applications'::character varying, 'student500'::character varying])::text[])))",
        name: "ProjectConversationStage_stage_key_check",
      },
    ],
  });
  assert.equal(partialCheck.ok, false);
  assert.match(problemsOf(partialCheck), /school_admissions/u);

  // A unique index on the wrong columns is incomplete even though the name matches.
  const wrongUnique = verifyStageChatTestMigrationReadiness({
    ...READY_SNAPSHOT,
    uniqueIndexes: [
      {
        definition:
          'CREATE UNIQUE INDEX "ProjectConversationStage_owner_stage_unique" ON public."ProjectConversationStage" USING btree ("projectId", "stageKey")',
        name: "ProjectConversationStage_owner_stage_unique",
      },
    ],
  });
  assert.equal(wrongUnique.ok, false);
  assert.match(
    problemsOf(wrongUnique),
    /must cover \(projectid,createdbyuserid,stagekey\)/u
  );

  // A non-unique index is refused.
  const notUnique = verifyStageChatTestMigrationReadiness({
    ...READY_SNAPSHOT,
    uniqueIndexes: [
      {
        definition:
          'CREATE INDEX "ProjectConversationStage_owner_stage_unique" ON public."ProjectConversationStage" USING btree ("projectId", "createdByUserId", "stageKey")',
        name: "ProjectConversationStage_owner_stage_unique",
      },
    ],
  });
  assert.equal(notUnique.ok, false);
  assert.match(problemsOf(notUnique), /is not unique/u);

  // A nullable or wrongly typed column is refused.
  const wrongColumn = verifyStageChatTestMigrationReadiness({
    ...READY_SNAPSHOT,
    columns: READY_SNAPSHOT.columns.map((column) =>
      column.name === "stageKey"
        ? { ...column, dataType: "text", isNullable: true }
        : column
    ),
  });
  assert.equal(wrongColumn.ok, false);
  assert.match(problemsOf(wrongColumn), /column stageKey has type text/u);
  assert.match(problemsOf(wrongColumn), /column stageKey must be NOT NULL/u);

  // A primary key on the wrong columns is refused.
  const wrongPrimaryKey = verifyStageChatTestMigrationReadiness({
    ...READY_SNAPSHOT,
    primaryKeyColumns: ["chatId", "stageKey"],
  });
  assert.equal(wrongPrimaryKey.ok, false);
  assert.match(
    problemsOf(wrongPrimaryKey),
    /primary key must be exactly \(chatId\)/u
  );

  // Every missing constraint is reported, not just the first.
  const missingAll = verifyStageChatTestMigrationReadiness({
    ...READY_SNAPSHOT,
    checkConstraints: [],
    foreignKeys: [],
    uniqueIndexes: [],
  });
  assert.equal(missingAll.ok, false);
  assert.match(problemsOf(missingAll), /check constraint .* is missing/u);
  assert.match(problemsOf(missingAll), /foreign key .* is missing/u);
  assert.match(problemsOf(missingAll), /unique index .* is missing/u);
});
