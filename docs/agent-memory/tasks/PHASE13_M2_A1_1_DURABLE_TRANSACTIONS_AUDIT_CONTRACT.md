# Phase 13 M2-A1.1 — Durable Project Document Transactions & Audit (Architect-Owned Contract)

**Date:** 2026-10-25
**Design authority:** ChatGPT, subject to owner acceptance. Codex implements this contract; it does not decide architecture.
**Status:** TECHNICAL DESIGN; owner may explicitly dispatch the single bounded A1.1 implementation packet. Neither this document nor test success authorizes live uploads, production migrations, real scanner integrations or customer files.
**Baseline:** branch `phase13-study-journey-project-centric`, accepted M2-A1.0 `a5cee03aabfa1609b8fda5b5d030a393da2d8638`, subsequent acceptance docs checkpoint `22baeb8e6c453bbd8e9045569df2083028cb3fd7`.

## 0. Checked repository facts and immutable boundaries

1. Migration `0030_demonic_the_hood.sql` created `StudyJourneyProject`, `ProjectOperation`, `ProjectEvent`, `ProjectMembership`, and `ProjectConversation`. `ProjectOperation.actorUserId` and `ProjectEvent.actorUserId` are presently NOT NULL with restricted User FKs; each event requires `operationRecordId` FK to `ProjectOperation`. User operation uniqueness is (actorUserId,operationType,operationId); Project event uniqueness is (projectId,projectRevision).
2. Migration `0031_sour_scarecrow.sql` created four inert document tables, same-Project composite FKs, storage/security statuses, version identity constraints, unique scan run (project,version,generation,kind) and provider event, and R1 terminal-run immutability. **Do not change 0030 or 0031**.
3. M1 `project-foundation.ts` uses operation claim -> Project row -> current Membership row -> target, and increments Project revision with one ProjectEvent per accepted state mutation; M1 op types/resultKind/event types are intentionally closed. Preserve all M1 semantics, code paths and existing events.
4. M2-A1.0 `lib/project-documents/{types,ports,testing,service}.ts` and tests provide *synthetic in-memory semantics only*. Existing service uses operationType `direct_upload` / `chat_document_import`, `ProjectDocumentOperationRecord.status`, `ProjectDocumentVersionRecord.formatId`, `objectIdentity`, and `consentAccepted: true`. Neither the DB intent state nor scanner-object-version reference nor source consent receipt currently exists in persisted 0031 schema. These gaps require an additive design, not claims that A1.0 is already durable.
5. Phase12 `MatterDocument` (and its historical `securityStatus`) is Chat-bound and **must not be reused as the Project store/verified scan**. Standalone/history/three widget paths and existing Project feature flags remain unchanged.
6. No new runtime/API/public entrypoint may import the A1.1 repository. The only database that can be reset/migrated by Codex is guarded, disposable `127.0.0.1:5432/immigration_ai_phase13_m1_1_test`. Avoid inspecting or modifying private user data.

## 1. Architectural resolution — service-principal audit, no impersonation

### 1.1 Evolve the existing ProjectOperation and ProjectEvent, not a parallel generic ledger

**0032 migration**, additive:

- Both `ProjectOperation` and `ProjectEvent`: add `actorKind VARCHAR NOT NULL DEFAULT 'user'` (enum check `user | service`); add nullable `servicePrincipalCode VARCHAR(64)`; make existing `actorUserId` nullable while retaining its original User FK.
- Add CHECK constraint on each: exactly one principal type is represented: (`actorKind='user'` AND `actorUserId IS NOT NULL` AND `servicePrincipalCode IS NULL`) OR (`actorKind='service'` AND `actorUserId IS NULL` AND nonblank allowlisted `servicePrincipalCode`). Accepted internal service codes **only** `project_document_storage_worker` and `project_document_scan_worker`. No arbitrary client-provided principal code. Service-code equality is not authentication: it must be injected by a trusted non-request capability; do not expose in route props.
- Preserve original user unique index `ProjectOperation_actor_type_operation_unique`. Add service-only partial UNIQUE (servicePrincipalCode,operationType,operationId) WHERE actorKind='service'. Existing user records auto-backfill as `actorKind='user'`; their operation/event SHA, IDs and User FKs stay unchanged.
- Expand `ProjectOperation_type_check` only with: `project_document_upload_intent`, `project_document_import_intent`, `project_document_storage_finalize`, `project_document_storage_fail`, `project_document_scan_finalize`, `project_document_grant_create`, `project_document_grant_revoke`, `project_document_withdraw`. Extend resultKind only with `document_asset`, `document_version`, `document_scan_run`, `document_grant`. Keep existing options unchanged.
- Expand `ProjectEvent_type_check` with `project_document_intent_created`, `project_document_storage_changed`, `project_document_security_changed`, `project_document_grant_changed`, `project_document_withdrawn`; expand `ProjectEvent_subject_check` allowlist with `document_asset`, `document_version`, `document_scan_run`, `document_grant`; each new event has nonnull subjectId matching its result entity.
- Require a service event to reference a **service-authored ProjectOperation** whose actorKind/service code matches the event. User events likewise reference matching user operation. Enforce in the transaction repository; add a narrow DB constraint trigger on new document events if needed to ensure actors cannot be mismatched by direct SQL. Do not add fake users or relax the check into a nullable-anything field.
- Worker operation `operationId` is a deterministic bounded internal ID derived from version ID, generation and event fingerprint (SHA-256 hex); `requestHash` binds the exact canonical transition and evidence. A duplicate event with different payload must conflict. Never accept untrusted provider text as an operation ID without normalization.

### 1.2 Actor identity is provenance, not privilege

`actorKind='service'` + allowlisted code expresses audit attribution only. Scanner attestation validation and service authorization are **injected trusted internal ports** and must be checked before any service operation claim. User requests can never set actorKind to service. No production service-token IAM design is decided at A1.1; its only implementation/testing principal is a synthetic internal capability. Production IAM/real provider proof belongs to A1.2.

## 2. Durable additional rows (additive 0032)

### 2.1 ProjectDocumentIntent: durable replay/outcome and recovery anchor

Add `ProjectDocumentIntent` with:
- `operationRecordId UUID PRIMARY KEY REFERENCES ProjectOperation(id) ON DELETE RESTRICT`;
- `projectId UUID NOT NULL REFERENCES StudyJourneyProject(id) ON DELETE RESTRICT`;
- `assetId UUID NOT NULL`, `versionId UUID NOT NULL` and composite FK (`projectId,assetId,versionId`) -> `ProjectDocumentVersion` exact version; UNIQUE(projectId,versionId).
- `intentKind` check only `direct_upload` / `chat_document_import`; `status` check only `intent_created` / `stored` / `failed` / `cleanup_pending`; `generation INTEGER NOT NULL CHECK >0`; `errorCode VARCHAR(64) NULL`; `createdAt`, `updatedAt` timestamps; typed status/error consistency check, and compare-and-swap revision/generation behavior.
- Do not store raw bytes, filenames, scanner tokens, full provider payload, copied source content or chain-of-thought.
- This row is status projection of a single user-intent operation. An async storage or scan mutation is a **separate service-authored ProjectOperation + ProjectEvent**, and updates this projection when applicable. Never mutate the initial `ProjectOperation.requestHash` or `resultId`.

### 2.2 ProjectDocumentImportConsent: bounded durable acknowledgement evidence

Add `ProjectDocumentImportConsent` with immutable `operationRecordId` one-to-one FK to the user import ProjectOperation, `projectId`, `actorUserId` User FK, `sourceChatId`, `sourceDocumentId`, `sourceSha256` (64 lowercase hex), `noticeVersion` bounded nonempty string, `acceptedAt`, `accepted=true` (CHECK true), and no sensitive text or filename. Each receipt pins the exact imported source identity and target Project version/operation by FK/transaction. A1.1 tests inject a **synthetic trusted acknowledgement context**; actual UI acceptance, policy notice content and authenticity remain A1.3 gates. A bare untrusted boolean is not proof of production consent.

### 2.3 Exact storage object identity and scan-event replay fingerprint

Add nullable `ProjectDocumentVersion.storageObjectVersionId VARCHAR(256)` and `storageVerifiedAt TIMESTAMP` (must be null together or nonnull together; nonblank when set) to persist the object-version identity verified during storage finalize. It can be **set exactly once** on `pending -> stored` under generation+state CAS and may never be changed or cleared; implement additive trigger protection in 0032 without altering 0031. The existing immutable storageKey/SHA/byteSize already define byte identity. A production adapter must verify actual immutable storage-version semantics in A1.2; a test objectVersionId is not proof.
Add nullable `ProjectDocumentProcessingRun.eventFingerprint VARCHAR(64)` with a lowercase SHA256 CHECK when present; it may be filled once only before terminal transition and must remain immutable afterwards. It identifies the *canonical verified event payload* independently of untrusted raw JSON and checks conflicting replay; no raw attestation/proofToken persisted.

If a genuinely required typed field cannot be carried safely without altering these contracts, STOP, explain and seek architect review; never silently add polymorphic subject/actor shortcuts.

## 3. Database repository and operation semantics

Implement a new **server-only, unexported-to-routes** Postgres repository/transaction adapter for the A1.0 contracts in `chatbot/lib/project-documents/`. Keep deterministic fake/unit tests unchanged. Avoid coupling the A1.0 pure service to live PostgreSQL in its default constructor; allow a narrow injected persistence port. Do not advertise A1.1 as a drop-in production service: A1.0's sync memory repository interface may require a separately typed async persistence interface; **do not fake synchronous DB calls, use global process maps, or auto-bridge with unchecked `as` casts**.

### 3.1 User upload/import intent transaction (synthetic verified input ONLY)

Entry is test-only internal function taking a trusted authenticated customer actor and an already server-validated metadata/digest identity; no raw bytes, no live ingestion. Import separately requires own-source authorization and matching synthetic acknowledgement receipt. In a **single SQL transaction**:

1. Claim `ProjectOperation` keyed (actorUserId, operationType, operationId), normalized immutable `requestHash` includes actor, Project, origin, exact digest/byteSize/canonicalMime, source IDs and consent fields if applicable. On duplicate same hash, recheck current authorization then return same typed status/IDs; different hash -> conflict. An operation with committed result but missing expected matching ProjectEvent/Intent -> integrity error, not success.
2. Lock Project FOR UPDATE then if non-owner current ProjectMembership FOR UPDATE (M1 acquisition order); authenticate registered customer and require active Project, expectedProjectRevision on **new** operation only, not on already-committed same-hash replay. For import recheck individual Chat + MatterDocument ownership, independent of Project membership.
3. Create `ProjectDocumentAsset` and `ProjectDocumentVersion` versionNumber=1, pending/pending, unique private non-PII storage key, project-bound IDs, and `ProjectDocumentIntent`; import writes consent receipt, all in same transaction.
4. Project revision +=1 and append exactly one `ProjectEvent(project_document_intent_created, subjectKind=document_asset, subjectId=assetId)` attached to operation and true human actor; commit atomic.
5. No DB lock held across source file read, object storage, scanner or model calls. Any user input/claims are verified before asset creation; no real customer file is accepted at A1.1.

### 3.2 Storage finalize/failure (service actor, no byte I/O)

Called only by injected synthetic trusted storage-result port; verify version key/digest/length/immutable test object version ID, current Project active and asset active. Under Project lock, exact version+generation+state CAS:
- success `pending -> stored`, security stays `pending`, set verified storageObjectVersionId once, update intent status to stored, append service-authored `ProjectOperation(project_document_storage_finalize, resultKind=document_version)` + one `ProjectEvent(project_document_storage_changed, subjectKind=document_version)`, increment Project revision.
- failures `pending -> failed` or `cleanup_pending` (when storage possibly exists), no clean promotion and no bytes exposed. A cleanup-pending DB state is **not** a claim that external bytes were removed.
- identical worker replay yields the same outcome after checking canonical payload; old generation/mismatched identity/conflicting worker result -> conflict and no Project revision/event increment.
- No external cleanup task execution in A1.1. Persist a recoverable intent; externally verified deletion/retention later in A1.2/A1.3.
- On Project close/asset withdrawal or grant revocation, delayed finalize must fail closed. No resurrected file access.

### 3.3 Scan completion (service actor, fake verified attestation ONLY)

Input type requires a verified synthetic attestation from an injected trusted verifier; the repository must not accept an arbitrary model/client-supplied verdict as its authority. Match exact projectId, versionId, generation, storage key, stored object-version ID, sha256/size, provider event id and fingerprint. Never confuse upload success with scan clean.

Under Project lock, ensure stored + security pending + current active asset/project + matching generation. Insert/complete one exact `ProjectDocumentProcessingRun` scan run (started then terminal under DB transaction, respecting 0031 trigger), set security exactly once to clean/rejected/failed, create **service-authored** ProjectOperation `project_document_scan_finalize`, append ProjectEvent `project_document_security_changed` + Project revision in same transaction. No terminal run rewrite. Identical provider event replays without second revision; conflicting replay, already-used provider event, stale generation, closure/withdrawal or changed object identity fail closed. Error/refusal must not manufacture a clean verdict. **A1.1 synthetic test-only scan result is not a real malware scan**.

### 3.4 Grants and withdrawal (typed, creator-only, synthetic)

Persist per-version creator user grant for metadata_read/content_read/download only, **explicit separate acknowledgement**; no Project audience, staff, AI-context or future_package issuance. Grant create/revoke and document withdrawal have separate user operations (idempotency and expected revision), lock order, Project revision + ProjectEvent in same SQL transaction. Existing 0031 grant revocation triggers must be respected. Revoked grants remain terminal; re-grant needs a fresh grant ID/operation. Ownership is not a substitute for explicit grant. Withdrawal denies future reads/scans, does not physically delete bytes or imply retention expiry. Do not implement public download or file API here.

### 3.5 Read scope and failure

Internal read/list operations select only records in the requested Project after current Project+actor+active membership check and exact active version purpose grant check. No cross-Project or cross-member results, storage key/attestation token leakage, implicit account-wide fallback, transcript leak or AI-context enablement. Missing schema, partial transaction failure or service verifier unavailable must fail closed. Error classification 401/403/404/409/503 is **not** a public API promise in A1.1.

## 4. Migrations, worker attribution and concurrency guarantees

- Migration: `0032` only, additive Drizzle schema and snapshot/journal. Keep `0030`, `0031` untouched; if the branch journal is not at 0031, STOP.
- Source invariants: existing M1 user ProjectOperation insertions omit new columns and continue passing under default actorKind=user; check/unique signatures unchanged for users. Existing events/operation IDs remain valid, no extra events injected retroactively.
- New document mutation: one Project revision increment and exactly one ProjectEvent per accepted **atomic state mutation**, same transaction with ProjectDocumentAsset/Version/Grant/Intent/ProcessingRun writes. No event for identical replay, denial or rolled-back transaction. Event actor must match its operation identity and type; a worker event is never stamped with the uploader's User FK.
- No model/web/transaction external operations. API/test helper does not use client-provided role, service principal string or project membership projection as the authorization source.
- Row-lock order `ProjectOperation claim -> StudyJourneyProject -> current ProjectMembership -> document rows -> ProjectEvent`. Concurrent operations across worker kinds and revocation/closure must serialize on Project; retries may re-read after conflicts. Do not silently swallow serialization/deadlock errors.
- Never accept a successful document write if a rollback leaves partial Project revision/Event/Intent or a new untracked object. In A1.1 there is no real object storage.

## 5. Mandatory PostgreSQL validation

Run guarded integration tests only against the expressly validated test DB `127.0.0.1:5432/immigration_ai_phase13_m1_1_test`; never apply migration or destructive reset on an unknown/default, `chatbot`, `immigration_legal`, staging, production or AWS DB. The guard must verify connected database name, host and port **before** migration/reset and reject nonmatching/empty destinations. Disposable data only.

At minimum test:
1. 0032 migration from 0031, schema check and snapshot/journal consistency; no change to 0030/0031.
2. Legacy M1 user ProjectOperation/Event inserts, event revision/order and authorization continue to work.
3. USER/SERVICE actor shape CHECK negative cases: no actor, dual actor, arbitrary principal, service with user UUID, user with service code; original User FKs remain.
4. Concurrent duplicate same-hash user intent (one asset/version/consent+revision+event); conflicting hash same id -> conflict.
5. Stale expectedProjectRevision new op -> rollback; identical replay with newly changed Project revision but current authorization -> same typed result, no increment; revoke/closed replay must not leak.
6. Cross-Project asset/version/intent/grant FK injection denied; import someone else's Chat even when Project owner denied; missing/false consent denied; synthetic receipt not mistaken for verified real consent.
7. Atomic rollback on injected DB failure at operation claim / intent / event / project revision; no partial persistence.
8. Storage complete keeps scan pending and object identity one-time; same-worker replay idempotent; conflict/stale generation/withdraw/close denied.
9. Scan fake attestation exact immutable object ID/digest/generation; duplicate same event replay; conflicting provider event or fingerprint denied; rejected and failed scan never usable; terminal run cannot be mutated (R1).
10. Grant create/revoke and withdrawal event+revision consistency, creator-only, no AI/future_package/project grants; post-revoke/withdraw access denied.
11. Interleavings: membership revoked or Project closed before worker finalize; no resurrection, no duplicate Event revision, no hidden content leakage.
12. Explicit negative test for **worker operation and ProjectEvent audit identity matching**, and for no public runtime consumers.
13. Test incomplete migration/config gracefully fails closed; test skip/fail counts accurate.

Full suite if practical; otherwise focused + M1 regression and explain omissions. `pnpm db:check`, Biome, generated metadata validation, TS diagnostics delta (known previous 44 baseline outside modified paths), `git diff --check`, and untracked whitespace scan.

## 6. Implementation limits and review stop

Scope: Drizzle schema, `0032` migration+metadata; isolated persistent repository/DB adapter in `chatbot/lib/project-documents/` with synthetic test ports; direct PostgreSQL integration tests; required minimal M1 code additions for typed operation/event allowlists and repository compatibility; package test wiring; three current-state handoff docs.

**Forbidden:** live routes; frontend UI; real customer-file upload/download/import; real S3; GuardDuty or scanner adapter; real malware-clean certification; Phase12 MatterDocument changes; M2-A2 extraction, M2-B facts, M2-C requirements, M2-D AI memory; professional or cross-member grants; source Chat automatic sharing; policy/retention guesses; paid AI; feature activation; deploy; committing or pushing before independent review.

If M1 legacy behavior, typed worker auditing, exact consent provenance or migration can only be satisfied by further undocumented design choices, **STOP**, report precise conflict and proposed smallest contract amendment to the architect; do not invent one.

**Handoff:** preserve old accepted records. Update `CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md` with truthfully limited A1.1 progress; cumulative **uncommitted** patch including untracked files at `~/phase13_m2_a1_1_review.patch`; give exact tests and 0032 artifact names, Git SHA/branch, no APIs, migration guard. Owner/architect independent source review precedes any commit.
