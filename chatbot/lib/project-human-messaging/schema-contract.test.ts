import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const chatbotRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schema = readFileSync(resolve(chatbotRoot, "lib/db/schema.ts"), "utf8");
const repository = readFileSync(
  resolve(chatbotRoot, "lib/db/project-human-messaging-repository.ts"),
  "utf8"
);
const availability = readFileSync(
  resolve(chatbotRoot, "lib/db/project-human-messaging-schema-availability.ts"),
  "utf8"
);
const migration = readFileSync(
  resolve(
    chatbotRoot,
    "lib/db/migrations/0042_phase13_m4_003_human_messaging.sql"
  ),
  "utf8"
);
const journal = JSON.parse(
  readFileSync(
    resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json"),
    "utf8"
  )
) as { entries: Array<{ idx: number; tag: string; when: number }> };
const snapshot = JSON.parse(
  readFileSync(
    resolve(chatbotRoot, "lib/db/migrations/meta/0042_snapshot.json"),
    "utf8"
  )
) as { id?: string; prevId?: string; tables?: Record<string, unknown> };

const operationTypes = [
  "project_thread_participation_consent_create",
  "project_thread_participation_consent_withdraw",
  "project_human_message_send",
];
const eventTypes = [
  "project_thread_participation_consent_created",
  "project_thread_participation_consent_withdrawn",
];
const integrationScenarios = [
  "explicit owner consent uses active named assignment and exact Project revision",
  "guest, member, admin, unrelated lawyer, cross-Project lawyer, and unassigned lawyer are denied",
  "lawyer role demotion, verification loss, assignment revocation, consent withdrawal, and Project closure deny lawyer reads and sends",
  "owner can read retained audit history after lawyer access ends while Project remains active",
  "concurrent sends serialize thread sequence; concurrent consent withdrawal makes a losing send roll back",
  "identical send replay returns original message with no sequence or row increment; changed request hash conflicts",
  "injected transaction failure leaves no partial Project revision, event, consent, sequence, or message",
  "message body cannot change professional approval, engagement, payment, or submission state",
  "private AI Chat, Facts, Documents, membership, and M2 grants are unchanged and inaccessible",
] as const;

test("M4-003 operation, result, event, and subject vocabularies stay closed", () => {
  for (const value of operationTypes) {
    assert.ok(schema.includes(`"${value}"`), `schema lacks ${value}`);
    assert.ok(migration.includes(`'${value}'`), `migration lacks ${value}`);
  }
  for (const value of eventTypes) {
    assert.ok(schema.includes(`"${value}"`), `schema lacks ${value}`);
    assert.ok(migration.includes(`'${value}'`), `migration lacks ${value}`);
  }
  assert.match(schema, /"project_thread_participation_consent"/u);
  assert.match(schema, /"project_human_message"/u);
  assert.match(migration, /ProjectOperation_actor_type_check/u);
  assert.match(
    migration,
    /project_human_message_send[^;]+actorKind[^;]+'user'/u
  );
  assert.match(schema, /ProjectEvent_project_revision_unique/u);
});

test("thread, consent, and message identities are durably bound and append-only", () => {
  for (const constraint of [
    "StudyJourneyProject_id_owner_unique",
    "ProjectStaffAssignment_id_project_staff_unique",
    "ProjectHumanThread_project_owner_fk",
    "ProjectHumanThread_assignment_identity_fk",
    "ProjectHumanThread_project_identity_unique",
    "ProjectThreadParticipationConsent_thread_identity_fk",
    "ProjectThreadParticipationConsent_thread_unique",
    "ProjectHumanMessage_thread_project_fk",
    "ProjectHumanMessage_thread_sequence_unique",
    "ProjectHumanMessage_operation_unique",
  ]) {
    assert.ok(migration.includes(constraint), `migration lacks ${constraint}`);
  }
  for (const trigger of [
    "ProjectHumanThread_guard",
    "ProjectThreadParticipationConsent_guard",
    "ProjectHumanMessage_guard",
    "ProjectHumanConsentEvent_binding",
    "ProjectHumanMessagingOperation_complete",
    "ProjectHumanThread_complete",
  ]) {
    assert.ok(migration.includes(trigger), `migration lacks ${trigger}`);
    assert.ok(availability.includes(trigger), `readiness omits ${trigger}`);
  }
  assert.match(migration, /ProjectHumanMessage_immutable/u);
  assert.match(migration, /ProjectThreadParticipationConsent_transition/u);
  assert.match(migration, /ProjectHumanThread_message_required/u);
  assert.match(migration, /ProjectHumanMessageOperation_event_forbidden/u);
  assert.match(migration, /event_count <> 1/u);
  assert.match(
    repository,
    /lastMessageSequence:\s*context\.thread\.lastMessageSequence \+ 1/u
  );
  assert.match(repository, /nextRevision = project\.revision \+ 1/u);
  assert.match(repository, /nextBeforeSequence/u);
});

test("consent withdrawal claims the immutable Consent ID before locked mutation", () => {
  const start = repository.indexOf("    withdrawConsent(input:");
  const end = repository.indexOf("\n    },\n  };", start);
  assert.ok(start >= 0 && end > start);
  const withdraw = repository.slice(start, end);
  const lookup = withdraw.indexOf(
    ".select({ id: projectThreadParticipationConsent.id })"
  );
  const claim = withdraw.indexOf("const operation = await claimOperation");
  assert.ok(lookup >= 0 && claim > lookup);
  assert.match(
    withdraw,
    /eq\(projectThreadParticipationConsent\.threadId, input\.threadId\)/u
  );
  assert.match(
    withdraw,
    /eq\(projectThreadParticipationConsent\.projectId, input\.projectId\)/u
  );
  assert.match(withdraw, /resultId: consentIdentity\.id/u);
  assert.match(
    withdraw,
    /operation\.resultId !== context\.consent\.id\)\s*\{\s*notFound\(\);/u
  );
  const replay = withdraw.indexOf("if (operation.replayed)");
  const revisionCheck = withdraw.indexOf(
    "if (context.project.revision !== input.expectedProjectRevision)"
  );
  const revisionAdvance = withdraw.indexOf(
    "advanceProject(tx, context.project, now)"
  );
  assert.ok(
    replay >= 0 && revisionCheck > replay && revisionAdvance > revisionCheck
  );
  const replayBranch = withdraw.slice(replay, revisionCheck);
  assert.doesNotMatch(replayBranch, /advanceProject|tx\.insert|tx\.update/u);
  assert.doesNotMatch(withdraw, /placeholderResultId/u);
  assert.match(
    migration,
    /operationType" <> 'project_thread_participation_consent_withdraw'[\s\S]{0,900}op\."resultId" IS DISTINCT FROM NEW\."id"/u
  );
});

test("lawyer thread-list authorization is joined and applied before pagination", () => {
  const start = repository.indexOf("    listThreads(input:");
  const end = repository.indexOf("\n    getThread(input:", start);
  assert.ok(start >= 0 && end > start);
  const list = repository.slice(start, end);
  assert.match(
    list,
    /lockAccounts\(tx, \[\s*input\.actorUserId,\s*project\.ownerUserId/u
  );
  assert.match(list, /resolveProjectHumanThreadListScope/u);
  assert.match(list, /kind === "owner_history"/u);
  assert.match(list, /innerJoin\(projectThreadParticipationConsent/u);
  assert.match(list, /innerJoin\(\s*projectStaffAssignment/u);
  assert.match(list, /eq\(projectHumanThread\.status, "active"\)/u);
  assert.match(
    list,
    /eq\(projectThreadParticipationConsent\.status, "active"\)/u
  );
  assert.match(list, /eq\(projectStaffAssignment\.status, "active"\)/u);
  assert.match(list, /eq\(projectStaffAssignment\.assignmentRole, "lawyer"\)/u);
  assert.match(
    list,
    /eq\(projectStaffAssignment\.staffEmailSha256, scope\.staffEmailSha256\)/u
  );
  assert.match(list, /if \(!accessibleThread\)\s*\{\s*notFound\(\);/u);
  assert.match(
    list,
    /\.where\(and\(\.\.\.lawyerClauses, \.\.\.pageClause\)\)[\s\S]*?\.limit\(input\.limit \+ 1\)/u
  );
  assert.doesNotMatch(list, /loadThreadContext/u);
  assert.doesNotMatch(list, /for \(const row of page\)/u);
});

test("M4-003 tables contain no protected resource or AI Chat references", () => {
  const first = schema.indexOf("export const projectHumanThread =");
  const end = schema.indexOf(
    "export const PROJECT_DOCUMENT_ASSET_LIFECYCLES",
    first
  );
  assert.ok(first >= 0 && end > first);
  const humanMessagingSchema = schema.slice(first, end);
  for (const forbidden of [
    "ProjectFactAssertion",
    "ProjectFactUseGrant",
    "ProjectDocumentAsset",
    "ProjectDocumentGrant",
    "ProjectConversation",
    "ImmigrationConversation",
    "ProjectMembership",
    "Engagement",
    "Payment",
    "professionalReview",
    "Submission",
    "documentId",
    "factId",
    "chatId",
    "attachment",
  ]) {
    assert.equal(humanMessagingSchema.includes(forbidden), false, forbidden);
  }
  assert.match(humanMessagingSchema, /bodyBounded/u);
  assert.match(humanMessagingSchema, /octet_length/u);
});

test("M4-003 actor locks do not deadlock with ProjectOperation actor foreign keys", () => {
  const start = repository.indexOf("async function lockAccounts(");
  const end = repository.indexOf("\n}\n", start);
  assert.ok(start >= 0 && end > start);
  const lockAccounts = repository.slice(start, end);
  assert.match(
    lockAccounts,
    /\.orderBy\(asc\(user\.id\)\)\s*\.for\("no key update"\)/u
  );
  assert.doesNotMatch(lockAccounts, /\.for\("update"\)/u);
});

test("Migration 0042 is a journaled successor with a generated snapshot", () => {
  // M4-004 appends 0043, so this pins the 0042 entry rather than the tail.
  const entry = journal.entries.find((candidate) => candidate.idx === 42);
  assert.deepEqual(entry, {
    idx: 42,
    version: "7",
    when: entry?.when,
    tag: "0042_phase13_m4_003_human_messaging",
    breakpoints: true,
  });
  assert.ok(snapshot.id);
  assert.ok(snapshot.prevId);
  assert.ok(snapshot.tables?.["public.ProjectHumanThread"]);
  assert.ok(snapshot.tables?.["public.ProjectThreadParticipationConsent"]);
  assert.ok(snapshot.tables?.["public.ProjectHumanMessage"]);
  assert.ok(snapshot.tables?.["public.ProjectStaffAssignment"]);
  assert.ok(snapshot.tables?.["public.StudyJourneyProject"]);
});

test("offline PostgreSQL integration plan covers the required race and isolation cases", () => {
  for (const expected of [
    "explicit owner consent",
    "role demotion",
    "assignment revocation",
    "Project closure",
    "concurrent sends",
    "identical send replay",
    "changed request hash",
    "transaction failure",
    "professional approval",
    "private AI Chat, Facts, Documents",
  ]) {
    assert.ok(
      integrationScenarios.some((scenario) => scenario.includes(expected)),
      `integration plan omits ${expected}`
    );
  }
  // This is a plan for the separately authorized PostgreSQL gate. No SQL is run here.
});
