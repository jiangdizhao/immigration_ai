# Phase 13 M1.1 — Project Foundation Database Contract

**Status:** READY FOR INDEPENDENT REVIEW — NOT AUTHORIZED FOR IMPLEMENTATION
**Prepared:** 2026-10-24
**Repository checkpoint inspected:** `phase13-study-journey-project-centric` at `1a964548c81b7268c9402577aa32a44b2e861426` (clean worktree before this documentation change)

This is the first bounded M1 implementation task contract, not implementation acceptance. It is authorized for independent review only. No application code, migration, test, database, cloud, payment or live operation is authorized here.

## 1. Authority and accepted foundation

This contract implements no rules beyond the technical foundation recorded in [D-P13-002 through D-P13-005](../DECISIONS.md): Project/Chat dual authorization; rollback history; one canonical Project owner and additional customer members; pending/active/revoked membership; soft closure and restricted read-only history; minimal existing-Workspace entry boundaries; and operation idempotency with atomic Project Chat creation. M0-004 independent architecture review passed. The legal/admissions matrices remain **PROVISIONAL**.

M1.1 is limited to an additive PostgreSQL/Drizzle foundation and minimal repository primitives. It does not authorize M1.2 membership APIs, M1.3 widget integration, M1.4 Workspace UI, any public Project route, or Project AI context. Those require their own implementation authorization after this contract is reviewed.

## 2. Verified repository conventions

At the inspected checkpoint:

- `chatbot/lib/db/schema.ts` defines `User`, `Chat`, `ImmigrationConversation` and `ConversationTurn`. Chat ownership is `Chat.userId`; `ImmigrationConversation` is keyed by `chatId`; durable turns are keyed by `(chatId, clientTurnId)` and use the existing lease/fencing fields. Do not alter these identities or add a Project turn table.
- `chatbot/lib/db/queries.ts` uses Drizzle transactions for multi-row creation, and owner-scoped conversation creation already writes Chat plus ImmigrationConversation atomically. Existing turn claiming uses a unique key and `ON CONFLICT DO NOTHING`, then reads the winning record. Transactional services also use row locks with `.for("update")`.
- `chatbot/lib/db/migrations/` is append-only. At this checkpoint the last entry is `0029_phase12_stage3_r2_draft_snapshot_history`, index 29, with snapshot `0029_snapshot.json`. `chatbot/drizzle.config.ts` reads `schema.ts` and writes migrations/snapshots under this directory. The matching journal is `meta/_journal.json`.
- `chatbot/package.json` provides `db:generate`, `db:migrate` (the guarded `scripts/db-migration-operator.ts`), and `test:unit`. Tests use Node's built-in `node:test`, `node:assert/strict`, and `node --conditions=react-server --import tsx --test`. PostgreSQL integration tests use an explicitly isolated test database and must not treat a missing-database skip as a pass.
- No Project tables or Project authorization implementation exist at this checkpoint. `chatbot/lib/conversations/scope.ts` keeps Project context null. Existing source and tests do not authorize adding files, evidence, applications, staff access or legal workflow here.

## 3. Objective, scope and boundaries

Establish the minimum additive data layer for `StudyJourneyProject`, `ProjectMembership`, `ProjectConversation`, a minimal append-only `ProjectEvent`, and durable operation idempotency. Add only repository operations needed to create a Project and atomically create a new Project Chat foundation under current Project authorization.

M1.1 does not expose those operations through customer APIs. It does not add membership invitation/accept/revoke business workflows, widget-route integration, model context, or UI. The primitive for checking Project authority exists to support transaction-safe repository operations and later reuse; later M1.2/M1.3 tasks must apply the accepted authorization contract to every relevant route.

## 4. Proposed relational model

Use the existing PostgreSQL UUID, `timestamp`, Drizzle `pgTable`, foreign-key, check, unique-index and index conventions. Names below are proposed exact table/field contracts; the implementer must keep Drizzle declarations, generated SQL, snapshots and integration behavior aligned.

| Table | Proposed columns and keys | Contract |
|---|---|---|
| `StudyJourneyProject` | `id uuid PK`; `ownerUserId uuid NOT NULL FK User`; `status` = `active|closed`, default `active`; `revision integer NOT NULL DEFAULT 1`; `createdAt`, `updatedAt`, nullable `closedAt`; `CHECK revision > 0`; status/`closedAt` consistency check. | `ownerUserId` is the one canonical owner and is immutable in M1. A User may own many Projects; do not add a unique constraint on `ownerUserId`. No owner membership row. Project identity is not Chat or LegalMatter identity. Use restrictive owner deletion semantics. |
| `ProjectMembership` | `id uuid PK`; `projectId uuid NOT NULL FK StudyJourneyProject`; `userId uuid NOT NULL FK User`; `status` = `pending|active|revoked`; `invitedByUserId uuid NOT NULL FK User`; `createdAt`, `updatedAt`, nullable `acceptedAt`, nullable `revokedAt`; `UNIQUE(projectId,userId)`; membership lookup index beginning `(userId,status,projectId)`. | One current membership row per additional customer account. Pending and revoked confer no access. No role/capability column and no staff memberships. Use restrictive FK deletion semantics. A cross-table check that `userId != ownerUserId` cannot be expressed by a simple SQL `CHECK`; M1.2 membership commands must reject owner membership under a locked Project row, and test it there. Do not add an Owner membership to make the check appear schema-enforced. |
| `ProjectConversation` | `chatId uuid PK FK ImmigrationConversation.chatId`; `projectId uuid NOT NULL FK StudyJourneyProject`; `createdByUserId uuid NOT NULL FK User`; `createdAt`; index `(projectId,createdAt,chatId)`. | The primary key ensures a Chat has at most one Project association. The restrictive FK keeps association and persisted history from being silently removed. Only a newly generated Chat may be associated. The creation transaction must verify `Chat.userId == authenticatedActorId == createdByUserId`; never accept a browser Chat ID as authority or link an existing Standalone/legacy Chat. A foreign key does not prove current Project membership. |
| `ProjectOperation` | `id uuid PK`; `actorUserId uuid NOT NULL FK User`; `operationType` allowlisted string/enum; validated `operationId varchar(128)`; `requestHash varchar(64)`; typed `resultKind`; `resultId uuid`; `createdAt`; `UNIQUE(actorUserId,operationType,operationId)` and indexes for actor/time and outcome lookup as needed. | Store only operation identity, SHA-256 request hash and typed outcome reference; never store the raw request, email, invite token, Chat text, file data or model content. The polymorphic `resultId` intentionally has no generic FK; replay must resolve the typed result and reauthorize it. Do not expire records automatically in M1.1; any later retention policy must preserve duplicate prevention and privacy requirements. |
| `ProjectEvent` | `id uuid PK`; `projectId uuid NOT NULL FK StudyJourneyProject`; `actorUserId uuid NOT NULL FK User`; `projectRevision integer NOT NULL`; allowlisted `eventType`; nullable typed `subjectKind`/`subjectId`; `operationRecordId uuid NOT NULL FK ProjectOperation`; `createdAt`; `UNIQUE(projectId,projectRevision)`. | Minimal append-only lifecycle/audit event for Project creation, membership state change, Project Chat creation and closure. A Project mutation increments the revision once and writes its event in the same transaction. No arbitrary JSON or free-text payload. Event reads never grant authority. Repository APIs do not update/delete events; no hard Project deletion is in M1.1. |

**Constraint implementation notes:** `ProjectMembership` uniqueness is on `(projectId,userId)`; revoked membership stays represented and audited rather than being deleted and recreated. A status/timestamp check must permit revocation of a still-pending invite as well as an accepted member. The Owner row exclusion is enforced by M1.2 authorization/membership commands because it compares two tables. No static SQL constraint may claim that a dynamic membership is active or authorized.

For `ProjectConversation`, create Chat, ImmigrationConversation, ProjectConversation, ProjectOperation and ProjectEvent within one transaction. Generate the new Chat ID server-side. The transaction checks the target Project is active and the actor is its canonical owner or has a current active membership. A Project Chat keeps existing Chat ownership and ConversationTurn identity. Existing Chat deletion must fail closed while its Project association exists; no M1.1 operation deletes or detaches that association.

## 5. Lifecycle, revision and authorization contract

- A Project begins `active`, revision 1. A Project mutation checks the expected revision under a row lock, applies one allowed state change, increments revision once and writes its matching event in the same transaction. Stale revisions conflict. M1.1 introduces no Project reopen operation; any reopening requirement needs a separate owner decision.
- Soft closure changes `active` to `closed`. A closed Project rejects new Project Chats, AI turns and business mutations. A caller who remains authorized may read only their own associated Project Chats. A revoked member is denied, including after closure and through the feature-disable fallback. No Project/Chat/Turn record is deleted or reclassified as Standalone.
- Emergency feature disablement is separate from closure. Its read-only fallback preserves Project origin, checks current Project/Chat authorization and grants no Project writes, AI context or model turns.
- For any future operation that checks current member authority, serialize Project state and membership changes with a common lock order: lock the Project row first, then the matching membership row. The owner is authorized only by `ownerUserId`; another customer is authorized only by a current `active` membership. The active Project status is required for writes and turns. Closed-Project history reads are limited to the authenticated Chat owner who remains authorized.
- M1.2 membership mutation and M1.3 Project Chat/turn paths must use the same current-state check. A foreign key proves that rows exist and relate; it cannot prove that a membership is currently active. Do not use browser Project IDs, roles, membership state, cached grants or a static SQL membership predicate as authority.
- For Project turns in M1.3, serialize the current authorization check and existing `ConversationTurn` claim in a short transaction before model execution. Do not hold a database transaction or Project/member lock across the model call. A request linearized before a concurrent revocation may already be in flight; every operation beginning after the revocation commit must deny. No second turn ledger is allowed.

## 6. Idempotency and transaction integrity

For Project create, each membership-changing operation and Project Chat creation/linkage:

1. The caller supplies an operation identifier; the server validates its syntax and scopes it by authenticated `actorUserId` plus allowlisted `operationType`.
2. The server canonicalizes the operation's normalized input and computes SHA-256. The key is not authorization and the hash is not evidence of identity or permission.
3. In one database transaction, claim `ProjectOperation` first using the unique `(actorUserId,operationType,operationId)` key. On a duplicate, compare `requestHash`: same hash resolves the existing typed outcome; a different hash is a conflict. A concurrent loser waits for the unique-key winner, then re-reads the committed outcome. No duplicate Project, membership transition, Chat or event may commit.
4. For a new operation, write its resource, Project revision change where applicable, and event in that same transaction. Any failure rolls back the operation claim and every associated resource/event.
5. Before replay returns an outcome, re-check current authorization and lifecycle. An idempotency record must not bypass membership revocation, closure restrictions, owner checks or feature rollback behavior.

For Project Chat creation, the transaction includes the `Chat`, `ImmigrationConversation`, `ProjectConversation`, `ProjectOperation` and required `ProjectEvent`. A retry returns the same authorized Chat outcome. A different request hash for the same actor/operation/key conflicts. Existing `ConversationTurn` uniqueness, leases, fencing and atomic assistant persistence remain untouched.

## 7. Migration sequencing and compatibility

- At this documentation checkpoint the migration journal ends at index 29 / `0029_phase12_stage3_r2_draft_snapshot_history`. If unchanged when implementation is separately authorized, the next generated journal index is 30; `0030_phase13_m1_1_project_foundation` is a proposed descriptive tag, not a pre-created migration or immutable identifier.
- Add Drizzle declarations to `chatbot/lib/db/schema.ts`; generate the SQL and matching snapshot/journal entry with the repository's `pnpm db:generate` / Drizzle conventions. Review the generated SQL and snapshot for additive-only changes. Do not use `db:push`.
- Do not edit prior migration SQL, snapshots or journal entries. Do not backfill existing Chats or change existing Chat, ImmigrationConversation, ConversationTurn, MatterDocument, LegalMatter, VIP or Policy Intelligence rows.
- Migration application belongs only to the separately authorized, controlled migration procedure (`chatbot/scripts/db-migration-operator.ts`, `pnpm db:migrate`) and a fixed disposable test database for M1.1 validation. The operator requires explicit acknowledgement and expected database name for a migration. No migration is generated or applied by this contract task.
- Rollback disables Project operations and leaves additive tables and records dormant. Do not drop the migration, delete Projects, detach Project Chats, or reclassify them as Standalone. Preserve owner-authorized history under D-P13-003/D-P13-004. Any eventual account erasure or retention action requires the later privacy/records policy.

## 8. Concrete future implementation targets

All paths below already have parent directories. No files are changed by this contract.

- `chatbot/lib/db/schema.ts` — Drizzle entities, checks, FKs, unique indexes, indexes and inferred row types.
- `chatbot/lib/db/project-foundation.ts` — minimal transaction and repository primitives for Project creation, idempotency claim/replay, revision/event writes, current Project/member authorization checks, and atomic creation of a new Project Chat foundation. No public route or full member lifecycle.
- `chatbot/lib/db/project-foundation.test.ts` — Node unit tests for canonicalization, identifier/hash validation and repository conflict outcomes with injected/fake DB seams.
- `chatbot/lib/db/project-foundation.integration.test.ts` — real PostgreSQL migration/constraint/transaction/concurrency tests using only the Phase 13 disposable database.
- `chatbot/scripts/phase13-m1-1-test-db.ts` — dedicated isolated test database operator, patterned on but separate from `scripts/phase12-stage1-test-db.ts`; fixed target `immigration_ai_phase13_m1_1_test`, explicit target assertion, redacted connection output and guarded destructive commands.
- `chatbot/package.json` — include the unit test in the repository's explicit `test:unit` list and add a focused `test:phase13:m1.1:integration` command using `node --conditions=react-server --import tsx --test`.
- `chatbot/lib/db/migrations/0030_phase13_m1_1_project_foundation.sql`, `chatbot/lib/db/migrations/meta/0030_snapshot.json`, and the appended `meta/_journal.json` entry — only if the journal still ends at 0029 when the separately authorized implementation starts.

No application routes, widgets, UI components, files under `chatbot/app/api/`, document/evidence code or additional directories are M1.1 targets.

## 9. Required tests and acceptance evidence

The implementation task must author and run all applicable tests below. No tests were run while preparing this contract.

### Unit and repository tests

- One owner can create multiple Projects; each has exactly one non-null canonical `ownerUserId`; no membership row duplicates the owner as a removable customer.
- Duplicate `(projectId,userId)` membership is rejected; only `pending`, `active` and `revoked` states are valid, and pending/revoked cannot authorize access.
- One Chat cannot be associated with more than one Project. Association creation rejects a foreign-owned Chat, a Chat not newly created by the authenticated creator, an inactive/closed Project for a write, and an actor lacking current owner/active-member authority.
- Project creation and Project Chat create/link replay return their original outcome for the same actor, operation and hash; changed payload conflicts; concurrent identical operations leave one resource and one event.
- A forced failure after each write boundary rolls back all Project, Chat, ImmigrationConversation, association, operation and event rows. No orphan, cross-owner row or partially committed audit event remains.
- The Project/Chat foundation does not change Standalone Chat IDs, `ConversationTurn` keys, turn leases/fencing, existing standalone creation/list/history, or the existing durable-turn contract.
- Project revision is positive and monotonic; stale revision mutation conflicts; `active/closed` and `closedAt` constraints are consistent; closure does not physically delete related rows.
- Event rows are append-only through repository interfaces and contain no raw chat text, document content, email, invite token, prompt, credential or other unnecessary sensitive payload.
- ProjectOperation stores no raw request; the same operation key cannot be resolved by another actor. Replay rechecks current authorization and cannot return another member's Chat.
- Schema inventory confirms M1.1 adds no Project document/evidence, application, person/fact, requirement, workflow, staff, payment, review or submission tables.

### Explicit later authorization tests

- **M1.2:** owner membership-row exclusion and owner non-revocation; existing-account invite targeting and no account enumeration; invitee-only acceptance; pending/revoked denial; immediate subsequent-operation denial after revocation; closure/read-only behavior; no staff/global-role access; no owner transfer. If revoked-member reinvitation/reactivation is required, stop for a separately reviewed contract before implementing it.
- **M1.3:** dual Chat-owner plus current Project authorization on history, detail, updates and every widget-turn entry point; no cross-member transcript access; closed Project denies new chats/turns/mutations but permits only authorized owners to read their own chats; revoked user denied after closure/rollback; no stale authorization cache; one short auth-plus-turn-claim transaction and no parallel turn persistence; Project-origin rollback fallback; unchanged Standalone paths.
- **M1.4:** minimal existing Workspace Project create/select/new-chat entry, visible Project origin, no full customer/lawyer portal, and unchanged Standalone new-chat/history flow.

### Isolated migration/integration tests

- Use a dedicated fixed disposable database named `immigration_ai_phase13_m1_1_test`, reached only via explicit `PHASE13_M1_1_TEST_DATABASE_URL`; assert both configured and connected database identities before destructive setup or migration. Never use the authoritative development database or Phase 12 test database for destructive M1.1 tests.
- Apply the existing migration chain through 0029 to a clean disposable database, seed synthetic Standalone User/Chat/ImmigrationConversation/ConversationTurn rows, apply the new additive migration, and verify all seeded identities and turn contents remain unchanged. Also verify the new Project tables/constraints on a clean migrated database.
- Verify uniqueness, FKs, lifecycle checks, owner/member cases, association constraints, rollback on injected transaction failure and concurrent operation races on PostgreSQL. Confirm the migration ledger and generated snapshot/journal agree.
- Missing isolated DB configuration may cause a local test runner to report a skip, consistent with repository convention, but the M1.1 acceptance gate requires the isolated integration run with **zero database-dependent skips**. A skipped migration test is not PASS.
- Capture migration review and isolated forward-upgrade evidence. Do not run destructive tests against `POSTGRES_URL` without a fixed target assertion. No live or production mutation is allowed.

## 10. Rollback, exclusions and stopping conditions

**Rollback:** keep the additive schema and existing records; disable future Project writes, Project context and Project model turns. Provide only the authorized Project-origin read-only history fallback. Do not delete/orphan Chat or Turn data, detach the Project association, change owner identity, or route Project chats through Standalone context. No down migration is proposed.

**Strict exclusions:** customer-facing Project APIs; membership invitation/accept/revoke workflows; widget-route integration; Project AI context; UI; document upload/storage/extraction/scanner remediation; ProjectPerson/FactAssertion; SchoolApplication/VisaApplication; policy/requirement registries; TaskPlanner; lawyer or staff dashboard; professional contracts/payments; GS/OSHC rules; packages/reviews/submissions; legacy Chat/document backfill; production deployment; live database migration; external submissions.

Stop implementation and return for contract review if the current branch/journal no longer matches the verified base, existing data would require rewrite/backfill, dynamic authorization is being replaced by a static SQL predicate, one transaction cannot keep Project Chat creation and its event atomic, idempotency cannot distinguish same-payload replay from changed-payload conflict, a test requires live data, or scope expands beyond this contract. Do not infer authorization from a successful FK check.

## 11. Acceptance evidence and task handoff

M1.1 implementation may be considered complete only after independent review of this contract, separate explicit implementation authorization, clean branch/HEAD preflight, reviewed additive Drizzle output, applicable unit and PostgreSQL integration evidence, zero unauthorized access or orphan rows in the scoped tests, unchanged Standalone/turn behavior, and a precise changed-file/test/skip report. Any migration application beyond the isolated disposable test database requires its own controlled authorization.

**Current stopping point:** task contract prepared for independent review. No implementation, migration generation/application, database operation, test, security verification, cloud/payment operation or live validation was performed. **M1.1 implementation remains NOT AUTHORIZED.**
