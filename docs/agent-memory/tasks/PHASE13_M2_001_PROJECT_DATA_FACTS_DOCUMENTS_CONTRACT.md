# Phase 13 M2-001 — Project Data, Facts, Documents and Requirements: Architect-Controlled R1

**Date:** 2026-10-25  
**Architect:** ChatGPT, at the owner's explicit request; Codex is an implementer, not the design authority.  
**Status:** ARCHITECTURE PROPOSAL / OWNER REVIEW REQUIRED. Only the separately bounded M2-A0 technical foundation may be authorized by an explicit owner instruction. This document alone does not authorize code, migration execution, real-user data processing, rollout, lawyer signoff, or M2-B/C/D.  
**Source branch/base:** phase13-study-journey-project-centric @ b8d7133eb6e7afd50fd199795ebe47e25aa53a77  
**Replaces:** The local, uncommitted Codex-prepared M2-001 proposal with the same filename; preserve that proposal in the owner's local stash for reference. It is not the accepted design.

## 1. Authority, evidence and immovable contracts

This architect-owned revision incorporates the 2026-10-25 uploaded M2-001 proposal, the checked-in Phase 13 roadmap, accepted D-P13-002..007, M0-002/003, M0-004 independent review, and source-level M1.1–M1.4/Phase 12 contracts. Accepted M1.4 is commit b8d7133; 941/941 unit tests and the listed local owner-browser checks are reported evidence, not production approval. Source of truth for actual behavior is code plus migrations, not draft designs.

1. A Project is neither a Chat, a LegalMatter, an application, nor VIP membership. No Standalone chat/document is auto-associated with a Project.
2. The canonical Project owner is StudyJourneyProject.ownerUserId. Other customers obtain current active ProjectMembership only. Owner/member Project access is **not** the right to read someone else's personal Chat history, policy bindings, original MatterDocuments or private Project records.
3. Project-origin Chat requires its individual owner + current Project authorization. Feature-off/closed Project Chat is origin-preserving read-only subject to current authorization; revocation denies access.
4. Continue using the existing ConversationTurn ledger. Never build a second turn ledger, unbounded cross-Chat transcript loader, client-provided access scope, or parallel model memory.
5. Existing Phase 12 MatterDocument has required chatId and owner/Chat authorization. It is not a Project asset. M1.4 intentionally suppresses Project conversation-document APIs.
6. M0-004 F-06 documents a source-level legacy file-security-state flaw: storage completion can mark a legacy file clean without a genuine scan verdict. Do not reuse the legacy clean field as proof of scanning. This document does **not** claim that the production scanner actually behaved unsafely or authorize a legacy hotfix.
7. School/admission and Student 500 matrices, professional authority, law applicability, finance/tuition custody and privacy/retention are provisional. No one may silently promote them to operative requirements.
8. All M2 public mutations, resolver input and downstream model influence default **OFF** under a separately controlled server-side M2 flag. Phase 13 Project Chat flag stays default OFF; generic POST /api/projects lacking that gate is an existing documented rollout caveat.

## 2. Architectural decision table: safe design defaults, not yet owner decisions

| ID | Architectural default | Owner/authority gate |
| --- | --- | --- |
| A1 | **Private by default:** a new Project document and assertion are initially visible only to the owning/creating customer and narrowly scoped internal processing needed for that asset. Project owner status alone cannot disclose another member's private bytes/facts. | Owner confirmation before shared-document behavior |
| A2 | **Import by the original authorized Chat/document owner only:** explicit source document, target Project and affirmative consent; fresh immutable Project object/version; preserve original unchanged; independent integrity check and scan. | Owner confirmation before real imports |
| A3 | **Separate read, download, AI-context and future submission/package grants:** a read grant never implies AI ingestion, and publication never implies professional determination. | Owner confirmation before sharing/AI integration |
| A4 | **Fact confirmation != Project publication != AI-use grant:** separate attributable records and separate revocation. Asserted origin is immutable; status is a different dimension. | Owner confirmation for cross-member sharing |
| A5 | **Person authority is not Project ownership:** ProjectPerson != User account; no implied spouse/guardian authority, account linkage, legal guardianship or consent by owner. | Person/guardian/representative decision before customer personal fact collection |
| A6 | **No M2 professional write path:** reserve typed professional provenance, but no role=lawyer/admin shortcut. Wait for M4 verified discipline/assignment. | M4 authority design |
| A7 | **Stable Project context contains only current, explicitly confirmed + published + AI-authorized, non-conflicted, non-stale assertions.** Candidates and conflicts are separate review material, never silently promoted to facts. | Owner confirmation before resolver enabled |
| A8 | **Requirements are collection/status records only:** 'complete' is not legal compliance, eligibility, admission, approval or readiness. Template status remains provisional. | Professional template approval later |
| A9 | **Consent/grant revocation stops future access and AI use immediately on the next authorization check.** It does not silently destroy an independent Project copy or erase historical audit references. | Privacy/retention schedule before real records/physical deletion |
| A10 | **Worker state is version/generation CAS**, not a stale browser expectedProjectRevision. Every accepted durable state mutation still increments Project revision and writes the Project event atomically. | Technical pattern proposed for implementation |
| A11 | **Application-scope and party-role normalization deferred.** M2 baseline can use Project-level or ProjectPerson-level facts only. No generic ProjectApplication data or application-specific readiness until owner chooses F-03/F-04. | Separate application model decision |

If a user-facing or live-data feature depends on an open gate, fail closed rather than substituting an invented approval.

## 3. Typed Project document foundation and protection

### 3.1 Entity contracts (candidate names, additive design)

- **ProjectDocumentAsset**: (projectId, id) immutable association, createdByUserId, createdAt, lifecycle (active, withdrawn, deletion_pending, deleted). Stable identity separate from each byte version; no required chatId; project ID and asset ID form a same-project FK target.
- **ProjectDocumentVersion**: projectId, assetId, versionId, positive versionNumber, unique private storageKey, sha256, byteSize, canonicalMime, originKind (direct_upload, explicit_chat_import), source provenance as optional read-only identifiers/hash, uploader, createdAt, storageStatus (pending, stored, failed, cleanup_pending), securityStatus (pending, clean, rejected, failed), current generation. Exact bytes, SHA and source attribution never change in place. Version replacement creates a new row; only one active version selected under CAS.
- **ProjectDocumentGrant**: projectId, assetId, versionId (or explicit ALL_CURRENT_VERSION selector requiring re-evaluation on replacement), grantorUserId, grantee principal/scope, purpose (metadata_read, content_read, download, ai_context, future_package), createdAt, revokedAt, revision, actor authority basis. No implied owner/member grant. For initial M2 only a current authorized customer principal and explicit Project audience are in scope; no staff/application polymorphism without future contract.
- **ProjectDocumentProcessingRun**: projectId, versionId, generation, provider/event identity, verified actor/service principal, operation type (scan, extract), status, verdict, object fingerprint, timestamps and bounded code. Unique (projectId, versionId, generation, kind) and provider event dedup; stale or conflicting events never update active version. Do not store raw provider messages or secrets.
- **ProjectDocumentEvidenceUnit**: exact projectId/versionId/processingRunId/ordinal, method, source locator (typed page/block/table-cell/char span), safe extracted text/hash, partial/truncated indicator, extractor version.
- **ProjectEvidenceRef**: opaque server-issued pointer to an exact Project document evidence unit, scoped by projectId + version + run + unit. It is NOT authorization in itself and is rejected if forged, cross-project, stale, revoked or unsafely scanned.

Candidate schema keys require explicit UNIQUE(projectId,id) targets and composite foreign keys on all cross-table Project linkages; restrictive deletion for provenance; checks for valid states, versions, sizes and digest syntax. Avoid adding a nullable catch-all polymorphic scope that cannot guarantee project consistency.

### 3.2 Byte lifecycle

Direct uploads and explicit imports have separate durable intents and identical post-storage safeguards. Check authenticated actor, current Project authority, source Chat ownership if importing, purpose-specific consent and input limits **before** obtaining bytes. Source 201/Stored does not mean Scan Clean. Upload/copy uses a new private object key; verify source/target size/hash. Commit durable pending intent, perform external byte operation without open SQL transaction, finalize by CAS on active version/generation. An authenticated scanner verdict that matches the exact version/key/generation and event identity is the ONLY gate to clean. Clean alone is not proof of authenticity, evidentiary sufficiency or professional review. Extraction requires stored + independently clean + current authorization/grant; extracted units are candidates only.

The source Chat/document remains unchanged. Deleting a source Chat after a completed explicit import does not implicitly delete Project bytes. Withdrawal or grant revocation denies future reads/AI use; user-requested deletion becomes a denied/deletion-pending tombstone subject to approved retention/legal-hold policy. Failed external cleanup is retried idempotently, not falsely reported erased. No real user files may enter M2 while scanner provenance, privacy purpose and retention handling are unapproved.

## 4. Fact and person contract

### 4.1 ProjectPerson and delegated authority

ProjectPerson has (projectId,id), minimal person identity/provenance and no implicit account link. User is an authenticated account, not proof of being the applicant, guardian or agent. Authentication proves **who** confirms, not **whose** statement the actor can confirm. Until person-subject and representation authority is explicitly accepted, accept only non-sensitive Project-level synthetic/demo assertions; do not implement a real-customer personal-fact confirmation endpoint or guardian inference.

### 4.2 Facts, origin, events and publication

- **ProjectFactAssertion** immutable (projectId, assertionId, optional personId, key, typed value and normalized comparison form, originKind, source/effective/observed timestamps where known, createdByActor, supersedesAssertionId). Origins: customer_stated, document_extracted, ai_inferred, professional_determination. A user's submitted statement is NOT intrinsically verified.
- **ProjectFactAssertionEvidence** links (projectId, assertionId) to exact server-issued same-project evidence refs with roles supports/contradicts/derived_from. No model-guessed citations.
- **ProjectFactAssertionEvent** append-only lifecycle transitions proposed, customer_confirmed, disputed, rejected, stale, superseded, professional_determined. Records actor identity, exact assertion version, authority basis and timestamps, without raw value in generic audit.
- **ProjectFactPublication** (or equivalent separate immutable publication/revocation events) explicitly pins assertion version, publisher, current authorization and authority-for-subject evidence, audience, scope, purpose, publish time and revocation state. An assertion cannot be cross-Chat discoverable merely because it is confirmed or because its creator has Project membership.
- **ProjectFactUseGrant** / purpose-specific permission: AI-context authorization separately recorded/checked, independent of whether a customer can read a published fact. If storing in the publication table, keep purpose flags independently revocable and audited, never a single shared boolean.
- **ProjectFactConflict** unresolved same-key/subject/overlapping-time contradictions with both assertions and evidence preserved. Exact normalized disagreement can be deterministic; partial/incomparable values are possible_conflict and need review, not automatic newest-wins.

A professional determination requires the later M4 scoped professional identity/assignment capability; no admin/lawyer global-role bypass.

Confirmation is version-exact, attributed, and cannot overwrite old value. Source replacement, retracting publication or revoking a grant invalidates only dependent views. Contradictions and time-specific branches remain visible for human resolution. Do not persist model chain of thought.

## 5. Requirement-template and state semantics

- **RequirementTemplate** stable workflow family/key; **RequirementTemplateVersion** immutable body/schema-version/content hash, exact source identities and source/effective/retrieval dates when known, author/reviewer statuses, draft/provisional/approved/effective/superseded/withdrawn.
- **ProjectRequirementState** same-project identity, exact template version/item key, asserted applicability true/false/unknown, collection state not_started/in_progress/evidence_attached/needs_review/blocked/complete, bound fact/evidence versions, actor and revision.
- **ProjectRequirementStateEvent** append-only prior/new revision, actor, basis and time.

Until qualified reviewer publication authority is approved, existing four school/visa matrices remain provisional, applicability stays unknown and no operative approvals or legal/compliance/readiness gate is emitted. A collection task marked complete only means that collection task is complete, never that an official rule is satisfied. Revision/withdrawal marks affected projections stale; never silently mutates historic versions.

## 6. Cross-Chat resolver: explicit data only

Derive projectId from the persisted ProjectConversation association after an authenticated creator-owned Chat lookup. Recheck current Project owner/active membership, Project lifecycle, scope-specific publication and purpose grant, fact confirmation, source version, clean scan and invalidation in one audited decision path; client-provided projectId/evidence IDs are mere locators. All three existing widget modes must use the same bounded server-side decision component. No reads from another member's transcript, policy binding, private MatterDocument or account-wide historical files.

Resolver result must be semantically separated:

- confirmedFacts: only currently confirmed, published, AI-authorized, non-conflicted, non-stale, applicable exact assertion versions with provenance and known effective dates.
- unresolvedCandidates: explicitly **non-authoritative** review hints only if specifically authorized for display; by default exclude them entirely from model inputs.
- conflicts: safe identifiers/review flags, without automatically promoting either value.
- documentEvidence: independently granted AI-context excerpts from exact clean versions with source locators, bounded by agreed caps.

A legal answer must not treat a stable customer-confirmed fact as verified by government/agent. Standalone keeps projectId=null and its existing document context. Resolver error or partial database readiness fails closed for new Project context and must not silently switch to account-wide/private Chat context. Closed/feature-off Project has no new turns/context; existing authenticated history remains origin-preserving read-only according to M1. Project-member revocation takes effect on new operations after commit; bounded in-flight operations already linearized before revocation are separately recorded, not retroactively represented as never executed.

## 7. Authorization, concurrency and lifecycle

All new reads and writes check current registered-customer status, canonical owner OR active membership, lifecycle, target row projectId, exact actor/source ownership as applicable, and purpose-specific grants. An owner cannot bypass privacy grants for another member. Denied resource identities return non-enumerating errors. Logs contain outcome codes and bounded IDs, never source text, PII, credentials or file bytes.

For user-initiated mutations: actor-scoped operationId + canonical request hash + expectedProjectRevision; transactionally claim/replay, lock Project then member then target rows, check authority/revision, write target+audit+Project increment once, persist operation outcome. Repeat identical request returns typed result only after fresh authorization; same operationId different content conflicts.

For async workers: durable intent and exact version/generation CAS + authenticated event identity, not an old browser expectedProjectRevision. On accepted finalization, lock Project in the established order, recheck current authority/lifecycle/consent/grant and active version, update affected rows plus Project revision/Event atomically, then commit. Stale, duplicate and forged worker callbacks cannot overwrite newer versions or resurrect revoked grants. Do not hold SQL locks across S3, scanning, extraction or model calls. Accepted pre-revocation operations and late events require clearly defined in-flight handling; no stale callback extends access.

Deletion, replacement and policy/template changes trigger dependency-indexed invalidation, not whole-project last-write-wins. Failure leaves a denied/retryable durable intent. Audit data is append-only subject to later privacy/records decisions.

## 8. Review findings disposition

| Finding | Architectural R1 disposition |
| --- | --- |
| F-01: confirmation conflated with publication | Explicit ProjectFactPublication + independently revocable AI-context permission; version and actor/basis pinned |
| F-02: Project owner may not be the fact subject | ProjectPerson/actor/representative separated; no non-self real-person confirmation until authority decision |
| F-03: async workers vs expectedProjectRevision | User revision gate separate from worker version/generation CAS; Project revision/event still atomic on accepted transition |
| F-04: copy, consent revocation and deletion unclear | Copy creates independent version; revocation denies use, physical deletion awaits lawful retention decision and verified cleanup |
| F-05: AI candidates becoming cross-Chat memory | confirmedFacts vs unresolvedCandidates vs conflicts separated; only confirmed+published+AI-granted stable context |

## 9. Decision register — not silently owner-approved

| Decision | Proposed safe default | Required before |
| --- | --- | --- |
| Share Project document/fact with other Project members | Private by default; affirmative source-owner publication, revocable read/AI grants | M2-A1/B/D |
| Import someone's Chat document | Only that individual authorized Chat/document owner performs import; Project owner cannot auto-import member-private files | M2-A1 |
| Person identity, primary applicant, guardian/representative scope | No automatic User-to-Person link; no other-person confirmation without explicit authority model | M2-B real data |
| Professional determination and conflict resolution | No professional endpoint until M4 scoped assignment/credentials | M4 |
| ApplicationParty F-03 key and F-04 subtype strategy | Defer application tables; recommended normalized party identity + separate roles and staged provisioning | Application-specific data |
| Template content, qualified reviewer and authority | Provisional only; no operative legal/admissions rule or eligibility flag | M2-C public content |
| File retention, revocation, physical erasure, legal hold | Immediate deny, retained tombstones without promised retention duration | M2-A1 real files |
| Scanner trust/provider event binding and old legacy bug | Do not accept any scan until authenticated exact-version verdict; legacy remediation separate | M2-A1 real file |
| M2 public API activation and generic POST /api/projects caveat | Default off, real API policy not cosmetic UI only; review existing gate gap | Any rollout |

Owner acceptance must be a separately recorded decision (new D-P13-008 or later), not inferred from Codex coding, a ChatGPT proposal or a successfully applied migration.

## 10. Stage plan and unambiguous implementation gates

- **M2-A0 (next possible owner-authorized task)**: SCHEMA / CONTRACT FOUNDATION ONLY. Add additive Drizzle entities and migration for ProjectDocumentAsset, ProjectDocumentVersion, ProjectDocumentGrant and ProjectDocumentProcessingRun with rigorous same-project keys/checks/indexes and version/generation constraints. No writes enabled, no API routes, no object storage, no imports, no scanners, no extraction, no feature enablement, no existing MatterDocument changes. Exercise only guarded disposable PostgreSQL and offline tests; do not apply migration to chatbot, immigration_legal, AWS or staging. Avoid premature event/operation enum changes until the first actual mutation implementation is separately designed and authorized.
- **M2-A1**: authenticated Project-owned upload/import intent, safe byte copy, independently trusted scanning and version-bound grant lifecycle; owner privacy/retention/scanner decisions required; only after A0 independent DB/security review.
- **M2-A2**: exact-run evidence units, opaque evidence refs, extraction and safe source locator projection; requires proven scan boundary.
- **M2-B**: person/fact assertions, explicit confirmation, publication, AI grants, contradiction and invalidation; real personal data only after person/guardian/consent decisions.
- **M2-C**: provisional versioned requirement registry with collection-only states and no operative legal/admissions approval.
- **M2-D**: unified server-derived Project resolver, cross-Chat authorized stable context, guarded evaluation of all three modes, no unrelated Standalone behavior change.

M2-A0 is a **single reviewable code task**, not a license to implement M2-A1..D. A0 should preserve 0030 as the M1 recovery anchor, generate 0031 only if the committed journal still ends at 0030, verify generated SQL/snapshot/journal consistency and never run an uncontrolled db:migrate or db:push.

## 11. Required negative testing and stop conditions

- Cross-Project composite FK attempts; version uniqueness; ownership/asset immutability; never cascade-delete source provenance.
- Owner/member/private and revoked identity negative cases at future service boundaries; an existing Project role alone cannot access another member's data.
- Source Chat owner must authorize import; no source mutation, no implicit Standalone attachment; bytes and hash verified; no real file accepted without scan.
- Scan pending/failed/rejected/mismatched/stale/provider-spoofed events must not create clean usable version; never store sensitive provider event contents in logs.
- Confirmation vs publication vs AI-use grant; another person's fact without verified authority; conflict and effective-time overlap; dependency-limited invalidation.
- Project/Chat dual authorization and 3 mode resolver invariants; no raw cross-member transcript; 401/403/404/409/503 and default-off leakage.
- For M2-A0 specifically, test Postgres DDL FKs, unique indexes and CHECK constraints against a fixed, disposable named DB with explicit target guard. Report skipped cases as skipped, never passed; preserve the existing 941-test M1.4 checkpoint.
- STOP when schema would force application scope, production scanner assumption, professional grant, real data retention, public API enablement, or any change to M1.3 turn/persistence.

## 12. Operational state

The owner accepted and pushed M1.4 at b8d7133eb6e7afd50fd199795ebe47e25aa53a77, with local report 941/941 unit and bounded browser acceptance. The user's local Codex-generated initial M2 proposal and closeout notes are currently uncommitted. This GitHub-authored revision supersedes that **proposal**, not the owner's accepted M1.4 outcome or past archival notes. Preserve local changes before synchronizing; do not automatically pop a conflicting stash. This is a documentation-only GitHub commit. No production rollout or real-file processing is approved.
