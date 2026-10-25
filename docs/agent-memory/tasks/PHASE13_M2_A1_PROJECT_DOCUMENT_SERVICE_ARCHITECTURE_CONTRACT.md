# Phase 13 M2-A1 — Project Document Service Architecture Contract (Architect-Owned)

**Prepared:** 2026-10-25  
**Architect:** ChatGPT; Codex is implementation-only.  
**Status:** TECHNICAL DESIGN PROPOSAL. M2-A1.0 offline service-core task is separately bounded and may be explicitly authorized by the owner; real-customer uploads, live S3, external scanner, project sharing and production use are NOT approved by this document.  
**Repository:** `jiangdizhao/immigration_ai`, branch `phase13-study-journey-project-centric`, accepted M2-A0 baseline `b6cdd46d1a7289bccb30cb2257de613f5ea121f3`; documentation checkpoint `5db5a564d29c755de733f2765c42880a6ad42cf1`.

## 1. Authority and checked source baseline

Authoritative prior documents: `PHASE13_M2_001_PROJECT_DATA_FACTS_DOCUMENTS_CONTRACT.md` (architect-owned R1); `PHASE13_M2_A0_SCHEMA_FOUNDATION_IMPLEMENTATION_PACKET.md`; accepted D-P13-002..007, M0-004 security findings F-03/F-04/F-06/F-07, Phase 13 Roadmap; M1.1–M1.4 identity/Chat/turn gates; Phase 12 MatterDocument source.

M2-A0 migration `0031_sour_scarecrow` adds `ProjectDocumentAsset`, `ProjectDocumentVersion`, `ProjectDocumentGrant`, and `ProjectDocumentProcessingRun`. The schema enforces same-Project composite foreign keys, version byte identity immutability, fixed storage/security status sets, restrictive deletion, processing-run terminal immutability, unique storage keys and active grant uniqueness. It has **no** Project file API, no upload intent service, no S3/scanner runtime, no evidence extraction, and no Project-file reader.

Existing `ProjectOperation` / `ProjectEvent` and `project-foundation.ts` currently admit only the M1 project/membership/Chat operation/event/result/subject codes. Extending a file mutation requires an explicitly reviewed additive schema/check migration **or** a new documented equivalent with identical replay, revision and event consistency; do not wedge a file into resultKind=chat or event subjectKind=chat. Do not add a competing generic event ledger.

Phase 12 `MatterDocument` is still Chat-owned, and its upload completion/security clean-state contradiction (M0-004 F-06) remains a reason to separate the new Project adapter. `securityStatus=clean` on a legacy MatterDocument is not evidence of a trusted malware scan. The existing GuardDuty event validator establishes configured account/region/bucket/key/source but the present event shape does not by itself establish a cryptographically bound scan of a specific immutable object version. Do **not** infer this missing proof.

## 2. M2-A1 product boundary

One explicit Project can hold documents independently of Chats. An authenticated customer can eventually upload a Project-owned asset or explicitly **copy** a document from a Chat they individually own, with a separate Project object key and provenance. The original is unchanged. The owner of a Project does not acquire another member's Chat-file rights. Project membership also does not grant automatic read, download, AI-context or cross-member access to someone else's private Project asset.

**Initial authorized audience for design and synthetic implementation:** the authenticated asset creator only, while a current registered customer with canonical Project ownership or active membership and an active Project. No project-audience grants; no delegated uploads; no professional/staff principals; no other-person facts; no application, legal rule or external submission. Inactive, closed, revoked, guest-classified, anonymous and unrelated Project principals fail closed.

**Distinguish permissions:** metadata_read, content_read, download, ai_context, future_package. In M2-A1, only user-scoped metadata_read/content_read/download can ever be constructed; ai_context and future_package must remain denied. Mere storage completion, clean scanner status, a creator role or project ownership must never synthesize broader grants. A purpose check also verifies an explicit *active* grant and current Project authorization for each operation. All customer-derived metadata is private/no-store and never includes storageKey, internal scanner/event identity or sensitive unneeded source identifiers.

## 3. Models and storage constraints

### 3.1 Existing tables and constraints

- `ProjectDocumentAsset`: Project-bound stable logical object; `createdByUserId`, lifecycle active/withdrawn/deletion_pending/deleted. The creator identity is immutable.
- `ProjectDocumentVersion`: immutable Project/asset/version IDs, versionNumber, fresh private `storageKey`, SHA-256, positive byteSize, canonicalMime, `originKind`, optional source provenance, uploader and createdAt. Mutable only `storageStatus`, `securityStatus`, and `processingGeneration` under checked transitions. M2-A1 first release creates versionNumber=1 only. Replacement/active-version selection belongs to a later reviewed task.
- `ProjectDocumentGrant`: immutable grant target and purpose; `revokedAt` and revision monotonic terminal. Default to **no grant**. A1.0 synthetic fixtures may explicitly grant the creator metadata_read, content_read or download but must prove that this does not imply Project-wide access. A1.1 grant issuance by real requests requires owner consent acceptance.
- `ProjectDocumentProcessingRun`: immutable run identity + exact object digest; started to completed/failed, then terminal immutable. Provider event identity deduplicated and must be authenticated. An arbitrary `providerCode`, `servicePrincipalCode`, `grantorAuthorityBasis` or `verdict` string is *not* authority.

### 3.2 Gaps and narrowly permitted additive schema

Existing 0031 metadata is sufficient to express an inert first-version upload intent with `storageStatus=pending` and `securityStatus=pending`. A durable active-service contract also needs a typed, auditable operation/replay state and worker transition provenance. **Do not modify migration 0031**: if needed, propose/generate `0032` additively in a separately authorized implementation task after proving the exact ProjectOperation/ProjectEvent enum/check changes and replay association. A1.0 may implement a pure domain service with fake storage/scanner and **no database migration**, then hand over a bounded 0032 contract for the next code slice.

No direct `MatterDocument` foreign key or shared storage key. Import provenance IDs are historical identifiers, never authorization grants. Avoid new `ProjectDocumentEvidenceUnit` or `ProjectEvidenceRef` tables before M2-A2.

### 3.3 Storage port contract

Server-only `ProjectDocumentObjectStore` with `putNew(key, bytes, expectedSha256, contentType)`, `readBounded(key, expectedMaxBytes)`, `statIdentity(key)`, `removeIfOwned(key)`. Distinguish missing, conflict/already-exists, transient failure and integrity mismatch. The production adapter must use a **private Project-specific prefix**, bucket/region/account allowlist, server-side encryption, least-privilege IAM, conditional create/no overwrite, strict size and digest checks, bounded reads, no unscoped list/public access. Do not assume S3 ETag is SHA-256. Do not place original filenames, emails, passports or case data in object keys. No direct browser storage credentials or unrestricted presigned URLs.

A1.0 must use a deterministic in-memory fake, not the AWS client. It should be impossible to instantiate a live storage adapter from the A1.0 service entrypoint.

Reuse the existing Phase 12 `validateMatterDocument` and format/size/decompression guards only as an input-validation component after reviewing their boundary; do not reuse the legacy document lifecycle, repository or automatic clean transition. File content is untrusted; never parse/execute document instructions as application authority.

## 4. Four distinct trust dimensions

(1) **Storage integrity**: bytes under immutable key match version SHA/length. (2) **Malware scan**: authenticated verdict applies to **those exact immutable bytes**, exact version/generation/object identity, not merely a bucket/key name. (3) **Extraction/provenance**: later M2-A2 parser outputs exact run/location, with partial/unknown handling. (4) **Evidence authenticity and sufficiency**: requires future source/qualified human review, never derived from storage/scan/extraction alone.

A clean verdict does not confirm a personal fact, approve a legal requirement, or permit AI ingestion.

### Scanner port and acceptance rule

Define an injected `ProjectDocumentScanAttestation` envelope: trusted scanner/provider identity; authenticated inbound channel or verified signature/credentials; unique provider event ID; exact projectId/versionId/generation; private object key or opaque version identity; verified object hash/length; event time; scanner result (clean/rejected/failed); and proof basis binding the scanner result to the same **immutable bytes**. This last condition can be trusted immutable storage object version ID with provider evidence tied to it, or another independently audited equivalent. A server-side download/hash alone does not prove the provider scanned those exact bytes if the provider event refers only to mutable key. Store bounded result metadata in processing-run; do not fabricate attestation from an untrusted JSON body.

If the event source lacks identity proof or immutable object storage semantics are not verified, return `scan_unverified` and leave Project version security pending/failed, NEVER clean. Reject duplicate event ID with conflicting payload, old generation, wrong Project/version, wrong storage key, digest mismatch, and late event after withdrawal/closure/revocation. Documented GuardDuty validation is not sufficient until checked against actual configured provider payload and object-version retention. A1.0 uses a fake attestation to exercise both accepted/rejected paths; it is not a real-scanner certification.

## 5. Lifecycle state machine

### 5.1 Upload or explicit import intent

1. On the server derive authenticated User and trusted Project identity; verify current registered customer, active Project and canonical owner/active membership. Import also verifies exact source Chat + document belongs to the same authenticated individual **independently** of Project membership, and source is available/authorized. The Project owner cannot import member-private files.
2. Validate exact server-side bytes (max size, detected format, accepted extension, bounded decompression) and calculate SHA-256/byteSize; client MIME/filename/claimed hash are advisory. Import **re-reads source bytes** after authorizing and verifies bytes/size/hash against source before preparing copy. No automatic import of old/account-wide files.
3. Under authenticated actor-scoped operation ID + canonical normalized request hash, create the Project asset/version as `pending/pending`, `versionNumber=1`, `processingGeneration=1`, and a durable operation result with revision+event in **one DB transaction**, locked in M1 order (operation claim -> Project -> membership -> asset/version). Never hold SQL locks across byte storage.
4. Put bytes using conditional new-object write. On success independently stat/hash-bound verify if supported, then finalize `pending -> stored` using version/generation CAS and current state/lifecycle checks; **security remains pending**. On failure mark failed/cleanup_pending via CAS and schedule idempotent private-key cleanup. Never return a usable/clean file from a failed or uncertain finalize.
5. Retries use the same operation ID and hash to return the **same** asset/version and state; reuse with different request conflicts. Concurrent same-operation requests cannot create multiple assets or write different bytes under one key. Replays revalidate current authorization and must never start a new privilege-bearing operation after revocation/closure.
6. Create purpose-specific creator grants only after the owner's grant/consent choice is accepted. Grants do not arise from project membership, file ownership alone, upload success, or a boolean.
7. No parsing, OCR, context or AI reference during upload/import.

### 5.2 Scan reconciliation

A bounded worker/service principal receives only authenticated scan attestations. Linearize accepted transitions through Project lock (then relevant membership/grant/asset/version/run) and generation CAS. For an active `stored/pending` version, a verified attestation may create/complete the matching scan `ProjectDocumentProcessingRun` and transition `securityStatus` exactly once: clean/rejected/failed. Scan run and ProjectVersion status, Project revision and `ProjectEvent` must commit together or all roll back. A failed scan stays unusable and may trigger cleanup/quarantine policy only once approved; no overwrite of a terminal processing run. Never map upload success into clean. No "best effort clean" fallback. Worker runs on closed Project or withdrawn asset cannot grant access or complete a formerly usable state.

### 5.3 Reads, grants and withdrawal

Metadata listing: current Project authority **AND** explicit active metadata_read grant for the exact version; bounded pages, no total/count leakage across projects. Download/content: current authority AND purpose grant AND asset active AND version stored AND clean with verified same-version scan, plus bounded read and post-read SHA verification. Initial A1 future consumer restricts to creator user audience. A1.0 **must not expose file bytes** to UI/AI or any public route. Access checks occur after revocation; avoid long-lived public links and cache.

Withdraw/revoke: every active purpose grant has explicit audited revocation, not deleting history. No AI-context grants in A1. Source Chat deletion after completed copy does not silently delete the Project copy. Withdrawal stops new access/processing; records become tombstoned pending approved retention/legal hold. Physical deletion requires separately approved privacy and safe cleanup protocol; do not promise erasure while blob still exists.

### 5.4 Closure and rollback

Closed Project: no new upload/import/scan activation/grant writes; authorized historic metadata read is a separate later read-policy decision; no AI context or new Project Chat turns. Revoked members lose all new Project reads immediately after commit. Feature off: hide all new service entrypoints and deny new mutations/reads except any separately approved origin-preserving history view. Standalone Chat and Phase12 MatterDocument behavior are unchanged.

## 6. Public API design (candidate ONLY, NOT A1.0)

- `POST /api/projects/{projectId}/documents`: authenticated bounded file upload, operation ID, explicit destination Project and consent; server byte validation; return `assetId/versionId`, storage/security states, not raw keys.
- `POST /api/projects/{projectId}/document-imports`: explicit source Chat+document owned by actor, target Project, source-copy consent and operation ID; no cross-member import.
- `GET /api/projects/{projectId}/documents?cursor=...`: current actor's explicitly granted metadata only.
- `GET /api/projects/{projectId}/documents/{assetId}/download`: short-lived authenticated streaming only after clean scan and read grant; never unverified presigned link.
- `POST /api/projects/{projectId}/documents/{assetId}/grants` and `.../revoke`: later owner-approved recipient/purpose grant policy, creator-only in initial release. No Project-wide or AI-context grants in M2-A1.
- Scanner completion: **internal authenticated worker**, not a browser-callable endpoint.

Only after later approval may these routes be built and enabled. Gate public API at server-side `PHASE13_PROJECT_DOCUMENTS_ENABLED` (default FALSE) independently of `PHASE13_PROJECT_CHAT_ENABLED`; browser hide is not security. Ensure generic POST /api/projects rollout caveat is separately addressed before public release, rather than inaccurately claiming a global Project kill-switch.

Response errors: unauthenticated 401; undiscoverable owner/Project/source 404 or existing safe conventions; forbidden current membership 403 only when safe; revisions/idempotency 409; schema or scan infrastructure unavailable 503 fail closed. Rate limit uploads, cap bytes/request/time and per-user/project count, do not leak storage key, PII, source filenames in logs or error reports.

## 7. Audit, idempotency and concurrency

All user-initiated file mutations require `operationId`, `expectedProjectRevision` and canonical request hash (including exact server-computed content SHA/size, origin/source IDs and consent-relevant parameters). M1's `ProjectOperation` must be extended additively, if implemented, with typed resultKind `document_asset`, new operation types, and `ProjectEvent` document subject/event types. These require reviewed 0032 and guard tests. A committed operation records one typed result and one Project event for each revision; typed replay checks retained current actor authority. Do not overload M1's existing `resultKind=project/membership/chat` fields or impersonate the original customer when a worker acts.

Async transitions use exact version/generation/state CAS, verified worker principal and event identity; `expectedProjectRevision` from the starting browser request does not gate delayed workers. Accepted transitions increment Project revision and commit an attributed ProjectEvent in the same DB transaction. Worker audit attribution must be explicit and cannot pretend a scan verdict was issued by the uploader. If the current ProjectEvent actorUserId FK cannot represent a worker safely, this is a **schema/design blocker requiring architect review**; do not insert a fake User, overload staff roles or write an unaudited out-of-band result.

Lock order: operation claim -> Project -> member (where applicable) -> asset/version/grant/run. Revocation/closure and late finalization must linearize through Project. Data reads must recheck live membership and purpose grants in the read transaction and again before returning bytes after asynchronous storage where necessary. Do not trust a cached access token or previous authorization decision.

## 8. Implementation stages and gates

### A1.0 — Internal service-core and negative-test seam (NEXT POSSIBLE CODE TASK)

- Implement pure typed Project-document service/domain ports and injected in-memory fake object storage + fake scanner attestation. Implement in-memory deterministic lifecycle and permission decision logic for private/creator-only synthetic scenarios, with structured results and no implicit grant. Reuse `validateMatterDocument` only via deliberate safe adapter. Define types for version/generation, scan attestations, outcome codes, idempotent intent and authority assertions.
- Add offline unit tests for every state transition, duplicate/conflicting replay, unauthenticated/guest/pending/revoked/cross-project membership, source Chat ownership, purpose grants, stale event, mismatched digest/identity, no-op terminal replay, object cleanup, document withdrawal and read denial. Include a contract test proving that the service has **no production S3/scanner adapter and no route import**. No real DB migration at A1.0, no routes, no blob writes, no flag enablement and no live user files.
- Purpose: settle and verify the service contract without irreversible IAM/scanner/privacy assumptions.

### A1.1 — Persistence and DB audit (separate architecture review/owner authorization)

- Add reviewed migration 0032 to extend existing ProjectOperation/ProjectEvent codes, worker attribution and durable intent/outcome; no change to 0031. Integrate repository with same-project FK and expected revision, typed idempotency, rollback and worker CAS. Guarded disposable Postgres race tests. Default-off; no real S3/route yet.
- Gate: owner accepts actual mutation semantics and reconciles worker attribution; independent security/DB review before live adapter.

### A1.2 — Storage and exact-byte scanner adapters (separate approval)

- Real S3 private prefix, conditional write, bounded read and content hash verification; independently trusted scan attestation bound to immutable S3 object identity/version. Verify deployed provider event fields and scan policy. If no trustworthy exact-byte attestation, **hard STOP** and retain security pending. No live customer file launch based on simulated verdicts.
- Gate: verified scanner credential/source, IAM, bucket immutability/version handling, encryption, event replay security, health metrics, cleanup/quarantine operational SOP.

### A1.3 — Customer APIs and owner acceptance (separate approval)

- Server-flagged authenticated create/import/list/download/revoke, rate limits, bilingual UI in a separately approved slice, private-by-default. Before real files: owner consent/sharing decision, privacy/retention/legal-hold and scanner remediation verified; independent authorization/security review and guarded browser tests. No AI-context grant or Project fact extraction (M2-A2/B/D).
- Gate: negative auth/consent/size/error/race/file-safety tests PASS; owner & privacy signoff. Deploy to staging only by separate authorization. Production is not approved.

## 9. Test matrix / mandatory stop conditions

A1.0 must test at minimum:
1. Every operation denied for unrelated, revoked/pending, guest, anonymous or closed Project identities; Project owner cannot import another member's source Chat file.
2. Explicit source Chat ownership and exact bytes/size/hash for import, original never mutated; no account-wide auto import.
3. Distinct file-version state and scanner state: stored/pending never downloadable, parsable or usable by model; failed/rejected scan never clean.
4. No unauthorized grants; only exact per-purpose user grants; metadata grant does not imply download or AI_context; all project-wide/staff/future_package grants fail closed.
5. Started scan attestation checks exact version/generation/object/hash and trusted identity; replay same event is idempotent, same ID/conflicting evidence fails, stale events fail, terminal result immutable.
6. Duplicate identical operation replays identical target, conflicting hash conflicts; simulated races cannot create a second asset or overwrite object bytes.
7. Declared MIME mismatch, malformed container/size limit, key spoofing, post-storage verification failures fail closed; cleanup errors leave recoverable intent.
8. Revocation/withdrawal before pending completion prevents new read/scan/AI effects; error responses reveal no private file metadata; no audit with filenames/content/PII.
9. Standalone Chat/Phase12 MatterDocument/ConversationTurn untouched.
10. New Project data flag default-off and no public route/runtime consumers in A1.0.

A1.1+ tests: PostgreSQL composite FKs, operation type/resultKind allowlists, Project revision/event atomicity and worker identity; concurrency with membership revoke/close; external storage failure and retry. A1.2: real scanner proof and replay. A1.3: authenticated owner-browser, mobile/English, staging security and privacy gate.

**STOP immediately** if an implementation requires a fake scanner verdict, bypasses current Project/Chat authority, auto-shares member data, modifies `MatterDocument` scanner semantics without its own approved fix, invents a retention duration/guardian/professional grant, extends ProjectEvent with a fabricated user, exposes raw storage keys/bytes without scan, or introduces actual live file ingestion before approval.

## 10. Owner decision register (not approved by this design)

| Decision | Architect default | Before |
| --- | --- | --- |
| Project file privacy and recipient sharing | Private to creator, explicit purpose-specific grant, no project audience in A1 initial | A1.3 real customers |
| Source Chat document import | Only source owner, explicit selected source/consent, new object/key/scan | A1.3 |
| Real file purpose, consent and record retention | No real data until privacy/records authority approves lawful purpose, deletion/hold and user-facing notice | A1.3 |
| Exact-byte trusted scanner event and storage versioning | Fail closed unless verified attestation/immutable version ID | A1.2 |
| Worker actor identity in ProjectEvent | Must be genuine service-principal attribution; cannot impersonate user | A1.1 |
| Project document bytes/download after Project closes | Default deny except independently approved read-only metadata policy | A1.3 |
| M2 data feature gate and generic POST /api/projects | Server-side default-off new routes; resolve existing gate gap prior rollout | A1.3 |
| Professional review, Project facts and AI document use | Outside A1, pending M4/M2-B/D authority | Later |

## 11. Acceptance boundary

This document freezes an **architect-proposed** implementation strategy and a small A1.0 code task envelope, not user privacy decisions or operational legality. M2-A0 is accepted, not M2-A1. Codex may implement A1.0 only on an explicit owner task instruction; it must not design A1.1–A1.3 independently. The architect will independently review each cumulative uncommitted patch before owner signoff, commit/push and next authorization.
