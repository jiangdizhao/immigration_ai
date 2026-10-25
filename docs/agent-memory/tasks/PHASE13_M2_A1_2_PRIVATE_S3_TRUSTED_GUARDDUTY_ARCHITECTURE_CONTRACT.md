# Phase 13 M2-A1.2 — Private S3 Object & Trusted GuardDuty Adapter Contract (Architect-Owned)

**Date:** 2026-10-25  
**Author:** ChatGPT (architecture owner). Codex is implementation-only.  
**Status:** ARCHITECT-FROZEN DESIGN for **A1.2-A offline implementation only**, subject to owner dispatch. **A1.2-B live AWS verification is a separately gated task**, not authorized merely by accepting this contract. M2-A1.2 is NOT ACCEPTED.  
**Repository branch:** `phase13-study-journey-project-centric`. Accepted M2-A1.1 implementation: `752311535645343343d1e81ab569d5816e9608d5`; acceptance-docs baseline: `c95282aed8d913c22875a8b38906b4a8f60e59cb`.

## 0. Mandatory authority and checked baseline

Read `AGENTS.md`, current `docs/agent-memory/{CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE}.md`, architect-owned M2-001, M2-A1, M2-A1.1 contracts, and accepted M2-A1.0 / M2-A1.1 source. Read actual `chatbot/lib/project-documents/{types,ports,service,postgres-repository}.ts`, migration 0032, and legacy `chatbot/lib/matter-documents/{storage,guardduty-sqs-reconciler}.ts` before coding.

A1.1 accepted an internal, **synthetic-only** persistence repository, durable ProjectDocumentIntent and import acknowledgement, ProjectOperation/Event `actorKind = user | service`, verified object-version identity in ProjectDocumentVersion, fingerprinted scan runs, Project transaction CAS, a pending->clean audit chain and an exact-purpose read gate. No Project file public route or live production worker currently consumes these ports.

**Do not reuse the legacy MatterDocument scan result as a Project trusted attestation.** Its old GuardDuty event shape checks bucket/key/account/region but does not establish the Project document version/generation plus immutable S3 object version binding.

### Verified public AWS documents (as inspected 2026-10-25)

- AWS GuardDuty EventBridge malware-scan event example has `version`, `id`, `source=aws.guardduty`, `detail-type=GuardDuty Malware Protection Object Scan Result`, `account`, `region`, `resources` (Malware Protection Plan ARN), `detail.schemaVersion=1.0`, `detail.scanStatus`, `detail.resourceType=S3_OBJECT`, `detail.s3ObjectDetails.{bucketName,objectKey,eTag,versionId}`, `detail.scanResultDetails.scanResultStatus`. Examples: https://docs.aws.amazon.com/guardduty/latest/ug/monitor-with-eventbridge-s3-malware-protection.html
- AWS specifies `NO_THREATS_FOUND`, `THREATS_FOUND`, `UNSUPPORTED`, `ACCESS_DENIED`, `FAILED`, and completed/skipped/failed scan states: https://docs.aws.amazon.com/guardduty/latest/ug/monitoring-malware-protection-s3-scans-gdu.html
- S3 Object Lock applies per object **version**, requires bucket versioning, and can block permanent deletion during retention. Versioning *alone* does not guarantee WORM retention or prevent authorized DeleteObjectVersion: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html

These public references describe **available AWS event fields, not proof that this project's live AWS account/queue/IAM has been configured securely**. Live proof requires A1.2-B owner approval and verification.

## 1. Hard release gates

**A1.2-A (the only Codex task authorized by this packet):**
- Implement self-contained **server-only** S3 object-store adapter and a GuardDuty EventBridge payload validator / exact-version attestation *candidate* verifier using injected AWS SDK client/transport interfaces and offline fixture tests.
- Default **no runtime consumer, no SQS polling worker, no public API, no AWS calls** from ordinary tests, no real files, no DB write or migration. The production code may compile an AWS SDK adapter but tests must use spies/fakes; no credential/endpoint calls.
- `PHASE13_PROJECT_DOCUMENT_AWS_ADAPTERS_ENABLED` default false, and separate from M1 Project Chat flag and any later Project public file gate. The flag is only a guard, never evidence of service identity. No enabled feature in existing runtime path.
- A1.2-A establishes precise technical acceptance contracts, but **must not mint a production `VerifiedSyntheticScanAttestation` or call A1.1 `finalizeScan` with an untrusted event body**.

**A1.2-B (future separately approved):**
- Verify isolated AWS sandbox bucket, Versioning, account/region, protection plan ARN, IAM policies, EventBridge rule, SQS queue and DLQ, accepted delivery path, cloud audit, exact-version scan proof, S3 object deletion policy and DB audit deletion protection, and retention/privacy/legal-hold constraints.
- Use synthetic disposable non-customer test objects only with explicit owner permission. Real AWS charges possible; no production, real customer documents or deployment without a subsequent signoff.
- Only A1.2-B may wire an authenticated SQS consumer to a guarded live verifier and A1.1 durable persistence; it still does not enable customer routes.

**A1.3 (future):** authenticated, consented customer upload/import/download and UI, privacy and professional-data approval, no AI document context until M2-D.

## 2. S3 object-store invariants

### 2.1 Trust and configuration

Create a separate `project-documents/aws/` module (or equivalently named server-only private module). Never write to or alter the Phase 12 `matter-documents/` prefix, adapter or bucket.

An injected configuration has:
- exact approved AWS account ID, region, bucket, independent fixed Project-specific object prefix (e.g. `project-documents/`) and optional region-specific KMS key ARN; values from server config/allowlist only, **not** browser-provided;
- required bucket Versioning **Enabled** (not Suspended). Never accept `null`/missing S3 VersionId as verified object identity; never replace with synthetic UUID in real adapter;
- dedicated application least-privilege role; bucket blocks public access, disables ACL grants, uses SSE-S3 at minimum or approved SSE-KMS; ensure GuardDuty's configured role can decrypt approved objects. No AWS credentials stored in repo or logs;
- enforce a fixed prefix and opaque per-version key, no user names/filenames/PII in storage keys, no signed public URLs; reject path traversal, URL-encoded delimiter tricks, whitespace, aliases, absolute paths and keys belonging to other services.

A1.2-A must **not alter bucket configuration, IAM, KMS, Object Lock or retention**. Produce an operator checklist instead. Do not choose a numerical retention period; legal hold/erasure rules are an owner/privacy decision.

### 2.2 Immutable-version write/read/stat

- `putNew`: `PutObject` with `IfNoneMatch: "*"` for the key, expected SHA256 checksum transmitted to S3, bounded bytes, canonical content type and encryption. On response, **require** nonempty concrete `VersionId`. Distinguish conditional conflict, retryable failure, checksum mismatch, and ambiguous success. For missing VersionId, mark *unverified*, not success. Failed response must never imply S3 object does not exist; preserve recoverable cleanup intent in future orchestration.
- The key must be generated by the server under a namespace disjoint from MatterDocument; a second write to same key must not silently create another version. Versioned reads always specify both Key and VersionId.
- `statIdentity`: use S3 `HeadObject` with **explicit VersionId**, check actual returned VersionId, byte length and approved encryption metadata; don't use ETag as SHA-256. For integrity, verify server-computed SHA on exact-version bounded GET/read; HEAD metadata or an attacker-controlled `x-amz-meta-sha256` alone is not independent content verification. If a read exceeds a strict max, abort immediately and fail closed.
- `readBounded`: `GetObject` using explicit key and version ID; require length and SHA against durable ProjectDocumentVersion identity and keep response private. Never fall back to latest version if explicit VersionId is absent/missing. Do not return unscanned bytes to UI or model.
- `removeIfOwned`: only a separately approved retention/cleanup flow may issue exact-VersionId deletion. A1.2-A may define typed method/plan but **must not implement any direct operational delete pathway**. A plain `DeleteObject` without VersionId can create a delete marker, not establish erasure; even with VersionId deletion may be forbidden by Object Lock/retention.

### 2.3 Object-lock and deletion tension

S3 Versioning enables version identities but does not by itself prevent privileged deletion. Object Lock may protect a version, but compliance mode can prevent erasure during retention; never enable a hard retention period or compliance mode without approved legal/privacy schedule. A1.2-A documents options and produces no changes. A1.2-B requires explicit owner approval of retention, delete-version permissions, legal hold, audited purge and incident recovery.

## 3. GuardDuty EventBridge trust model

### 3.1 **Transport trust must precede parsing**

An EventBridge payload is JSON, **not** a self-authenticating signed certificate. `source=aws.guardduty`, account, region, bucket, ARN, versionId and event ID inside the JSON can be forged if untrusted callers can submit raw bodies. SQS `messageId` also is not equivalent to a GuardDuty signature.

Model a two-step boundary:

1. `TrustedScanDeliveryContext` is an opaque capability produced only by an internal authenticated queue transport after independently validating: dedicated approved queue ARN/URL; the receiver's AWS account/region identity; EventBridge rule/producer IAM restriction and queue resource-policy SourceArn/SourceAccount allowlist; no unrestricted SendMessage/PutEvents; an approved Malware Protection Plan ARN and real AWS credential chain. **A1.2-A mocks this capability; it cannot prove live IAM.**
2. Only after delivery context is supplied may the event validator parse and correlate a scan-result event. No `verify(rawJson)` method that produces a trusted attestation from caller-provided JSON alone. A type-cast, constant `trusted=true`, predictable token, test secret or merely account/region match is **not** transport authentication.

If account-owned EventBridge bus can ingest spoofable PutEvents, the live trust model must additionally prove rule/queue source isolation, or use independently authenticated GuardDuty evidence; if not verifiable, hard STOP, no clean.

### 3.2 Exact event acceptance

- Strict JSON byte bound (<=64 KiB), object depth/string length/arrays bounds, safe type and date parsing, canonical event fingerprint; reject malformed, duplicate/conflicting event identities.
- Require `version: "0"`, `source: "aws.guardduty"`, exact `detail-type`, configured account/region, expected plan ARN in `resources`, `detail.schemaVersion: "1.0"`, `resourceType: "S3_OBJECT"`, exact bucket, opaque key under own Project prefix, and **nonempty `detail.s3ObjectDetails.versionId`**.
- Map `scanStatus=COMPLETED + NO_THREATS_FOUND` -> candidate clean and `COMPLETED + THREATS_FOUND` -> candidate rejected. Map `SKIPPED`, `UNSUPPORTED`, `ACCESS_DENIED`, `FAILED` and all unknown statuses to unavailable/failed or rejection; never clean. A post-scan tagging success, object tag or ordinary file upload never yields clean.
- Require event's S3 bucket/key/versionId to equal the exact **persisted** ProjectDocumentVersion storageKey / storageObjectVersionId. Bind to the exact projectId, versionId, current generation, stored SHA256/byteSize and the configured plan; lookup is server-side, never from an untrusted JSON project/version ID.
- Require an independently verified exact-version object read or trusted checksum evidence matching persisted SHA256/byteSize and the **same VersionId**. ETag is NOT a cryptographic digest and must not replace SHA. A valid event for a newer S3 VersionId of the same key is an identity mismatch, never silently mapped to previous version. If S3 object is missing, deleted, lock/retention policy uncertain, or version read fails: **scan_unverified**.
- Explicit event occurredAt and expiry/freshness bounds may be configured in the trust port; do not hardcode business retention. Duplicate exact event/fingerprint may replay without new state change; duplicate event ID with different event payload conflicts; replay from wrong generation or closed/withdrawn Project must not promote security.
- Return **candidate evidence only** from this layer. Passing the candidate to a trusted persistence authority requires separately validated delivery capability + version lookup + exact bytes. Fake unit fixtures must never become production authentication.

### 3.3 Queue semantics for A1.2-B only

The future private worker receives from dedicated SQS + DLQ, rejects untrusted bodies, and **acknowledges only after A1.1 database transaction commits**. On transient failures leave message for retry; terminal denied/unverifiable cases follow explicit DLQ/incident policy without promoting clean. Avoid poisoning queue with repeated unsafe replay; limit retries, capacity, timeouts and messages. Never use the old MatterDocument queue consumer to ingest Project events.

## 4. PostgreSQL audit-tamper residual risk and privacy

A1.1 clean promotion depends on scan run + ProjectOperation + ProjectEvent evidence. It still has a privileged direct-SQL **DELETE** residual risk: the scan run/audit rows can be deleted by database principals with sufficient rights. Normal Project reads recheck this chain and fail closed when it is missing, but that is not sufficient operational hardening for real ingestion.

A1.2-A MUST:
- document a least-privilege runtime DB role (no arbitrary UPDATE/DELETE of finalized ProjectDocumentProcessingRun, ProjectOperation/Event, provenance tables; migration role separate; no use of superuser in app);
- propose exact audit/delete protection, recovery and backup/incident playbook, and tests for future application in an approved **separate migration**. **No migration 0033 in A1.2-A.**
- distinguish logical access withdrawal, blob quarantine, physical deletion, legal hold, backup retention and proof-of-erasure; never assume withdrawal instantly physically deletes versions.
- never leak raw scan event payload (threat names/path/PII), raw bytes, credentials or unmasked object keys to logs.

A1.2-B must independently verify real PostgreSQL privileges/retention/deletion safety and object retention policy before any trusted scan result is allowed to be persisted. If evidence is missing, don't enable the adapter.

## 5. Exact A1.2-A coding boundaries

**Permitted:**
- `chatbot/lib/project-documents/aws/` private, server-only, factory-gated S3 adapter using injected AWS SDK `send` interface and feature-disabled construction, with no eager client/network call.
- Pure GuardDuty EventBridge parser/correlator returning a typed **untrusted candidate**, and opaque authenticated transport context/verifier interface. Test-only fake authenticated context should be explicit and not accessible from production exports.
- Fake AWS clients and fixed offline event fixtures, including `versionId`, `scanStatus` and statuses from AWS official reference.
- Operator security checklist document `docs/agent-memory/tasks/PHASE13_M2_A1_2_AWS_SECURITY_OPERATOR_CHECKLIST.md` with externally verifiable AWS IAM, EventBridge, S3 Versioning, scan plan, DB role, logging, delete protection and data privacy/retention gates.
- Focused tests + package script wiring + updates to CURRENT_HANDOFF / CURRENT_MILESTONE / PROJECT_STATE.

**Forbidden:**
- New migrations or modifications to 0030–0032, application schema, Phase12 MatterDocument, ProjectOperation/Event or prior accepted A1.1 repository semantics;
- runtime route/widget/frontend/CLI consumer, real SQS poll, AWS connection or credentials, IAM/S3/GuardDuty resource creation, real scan job, upload/download of real data, public URL, feature enablement, paid API call or deployment;
- claiming live proof from SDK mocks; granting content_read/download/ai_context to new audiences, permitting staff sharing or creating actual file user sessions.

If a clean positive result cannot be made conditional on an independently authenticated queue delivery and exact stored version proof, **STOP and report limitation** rather than introducing an unsafe trusted adapter.

## 6. Offline tests / review

- Constructor fails closed unless explicit separate adapter flag is true **and** injected verified config; no runtime consumer.
- Factory imports do not eagerly instantiate AWS SDK clients or make network calls.
- Private prefix/key validation; wrong bucket, region, account, ARN, versioning absent/suspended or VersionId missing/mismatched fail.
- Mock S3 Put conditional conflict, ambiguous success, missing VersionId, checksum inconsistency, encryption/policy mismatch, HEAD vs GET version mismatch, read overflow/abort, post-read digest failure, wrong key, second same-key version attempt; no DeleteObject without exact version.
- EventBridge 64-KiB boundary; exact Plan ARN; missing/changed versionId; wrong account/region/source/schema/type; malformed/stale event; STATUS pairing and all unscanned statuses; wrong Project/asset/version/generation/hash/size; repeat same event vs conflicting fingerprint; SQS body alone cannot become verified.
- Scan event referencing the **same key** but a **newer versionId** must be denied.
- Internal fake transport context requires explicit injected trusted assertion; a forged raw JSON body alone never yields clean.
- No Project runtime consumers, no AWS environment accesses in tests, no leak of full storageKey/content in logs.
- Regression: existing Project source tests and prior M2-A0/A1.1 validations unaffected; run focused unit and Biome; full unit optional. If Postgres isn't used, report not run rather than claiming real DB verification.

**Deliver:** uncommitted, unpushed complete cumulative patch `~/phase13_m2_a1_2_A_review.patch` (tracked+untracked), exact touched files, offline test counts, guard state, remaining A1.2-B security/owner gates. Independent ChatGPT source review before commit/push.

## 7. Acceptance

A1.2-A accepted = **adapter code and offline trust-contract tests**, *not* production safety, not an authenticated live GuardDuty event, not a customer pipeline. M2-A1.2 as a whole remains NOT ACCEPTED until A1.2-B independent AWS/IAM/version-provenance and DB audit hardening verification is separately approved. A1.3 user-facing/file consent and privacy signoff remains later. Avoid compliance claims without counsel/operator approval.
