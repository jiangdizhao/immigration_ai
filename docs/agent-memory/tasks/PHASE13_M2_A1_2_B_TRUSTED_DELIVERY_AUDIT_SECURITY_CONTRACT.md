# Phase 13 M2-A1.2-B — Trusted AWS Delivery & Durable Audit Security Architecture Contract

**Date:** 2026-10-25  
**Status:** ARCHITECT-FROZEN; only **B1 offline security foundation and guarded disposable-DB tests** are authorized for Codex by its separate implementation packet. **B2 live AWS sandbox validation is NOT AUTHORIZED**, requires explicit owner change approval after independent B1 review. **B3 live consumer + persistence activation is NOT AUTHORIZED**. M2-A1.2 and overall M2 are NOT ACCEPTED.

**Branch:** `phase13-study-journey-project-centric`. **Accepted A1.2-A:** `0209f718b7ec0eca9002b86fe36023ff905453b6`. **Pre-B docs baseline:** `ad688d4f9021d277c78078fc8af85e2e588c06b6`.

## 0. Authority, reviewed code and external evidence

Read `AGENTS.md`, `docs/agent-memory/{CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE}.md`, prior Phase 13 M2/M2-A1/M2-A1.1/M2-A1.2-A contracts, `PHASE13_M2_A1_2_AWS_SECURITY_OPERATOR_CHECKLIST.md`, and current source:
- `chatbot/lib/project-documents/aws/{config,delivery-context,guardduty,scan-candidate,s3-object-store,testing}.ts`;
- `chatbot/lib/project-documents/postgres-repository.ts`;
- `chatbot/lib/db/{schema,project-foundation}.ts`, migration 0032 and guarded `chatbot/scripts/phase13-m1-1-test-db.ts`;
- legacy `chatbot/lib/matter-documents/` only for regression isolation.

A1.2-A implemented **default-off** S3 conditional put and exact-VersionId read, bounded independent SHA-256, GuardDuty JSON parser and `ScanDeliveryAuthenticatorPort` + process-local WeakMap capability with test-only fake; its output remains `trust: "untrusted_scan_candidate"`. There is **no** real SQS receiver, authenticated production delivery, trusted A1.1 scan attestation, or customer-facing file runtime. B1 must not weaken these boundaries.

Official AWS public references (2026-10-25 check):
- https://docs.aws.amazon.com/guardduty/latest/ug/monitor-with-eventbridge-s3-malware-protection.html (published EventBridge scan result example, including `scanStatus`, plan ARN and `s3ObjectDetails.versionId`).
- https://docs.aws.amazon.com/guardduty/latest/ug/monitoring-malware-protection-s3-scans-gdu.html (completion/result mapping).
- https://docs.aws.amazon.com/eventbridge/latest/userguide/cross-service-confused-deputy-prevention.html (EventBridge rule `aws:SourceArn`/`aws:SourceAccount`).
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html (version-level Object Lock; retention/erasure tradeoff).
- https://docs.aws.amazon.com/guardduty/latest/ug/supported-s3-features-malware-protection-s3.html (versioned S3 scans).

Public AWS docs give general service behavior, NOT evidence that our AWS account, IAM role, queue or GuardDuty plan is ready. Reject any assumption that a `source` string or `messageId` authenticates origin.

## 1. Three explicit milestones and owner gates

### B1 — CODE NOW (only current task)

**Offline security readiness, actual guarded local PostgreSQL audit hardening**:
1. One additive migration **0033**, with SQL/Drizzle journal/snapshot contract handled consistently, to protect durable audit records against routine UPDATE/DELETE (details §4); apply/tests **only** on the existing guarded disposable PostgreSQL database when available, never chatbot/immigration_legal/staging/prod.
2. A pure, server-only **configuration-evidence evaluator** for future AWS account/region/GuardDuty plan/EventBridge rule/SQS queue/resource policy/IAM/Versioning/KMS; accept sanitized, explicitly **untrusted** captured evidence as input. Return ordered FAIL/INCOMPLETE/PASS findings per check; it **never grants a trusted delivery capability or enables runtime**. Any missing field or contradictory evidence is INCOMPLETE/FAIL and overall **NO-GO**. Require physical account/operator attestations at B2.
3. A **default-disabled queue-processing protocol/state-machine planner** (optional pure module, no actual SDK SQS client) defining ack-after-DB-commit, bounded retry, durable duplicate/collision checks, DLQ/incident outcome and no permanent loss on transient failure. It must not call A1.1 `finalizeScan()`, parse actual queues, manufacture a trusted context or receive live messages.
4. Focused negative/adversarial offline policy tests and guarded DB regression tests; update B2 operator evidence checklist and three state docs.

**Important:** B1 implementation does not prove live EventBridge-origin authenticity. `PASS` from an untrusted simulated snapshot means only *static policy conditions described*, not B2's trust GO. Never represent a boolean `trusted=true` derived from JSON/metadata/config as transport authentication.

### B2 — FUTURE LIVE SANDBOX READINESS (separately approved)

Exact identity + operator-signed change record; AWS cost ceiling and authorized nonproduction account/region; read-only AWS control-plane verification first; then only explicitly approved infrastructure or synthetic test-object actions. Demonstrate restricted queue rule/service `events.amazonaws.com` + rule `aws:SourceArn` and `aws:SourceAccount`, missing public/cross-account SendMessage and unauthorized bus event injection, plan status/scope, S3 bucket ownership/Versioning, KMS permissions, DLQ/retention, effective IAM/SCP boundaries. Evaluate whether principals with `events:PutEvents` on the matching bus could spoof `aws.guardduty` content and have the configured EventBridge rule forward it. A matching message body and queue rule are **necessary but potentially insufficient** for a proof of authentic GuardDuty provenance.

**Hard stop:** if rule/bus/IAM proof cannot exclude forged delivery or a stronger independent authenticated source of scan-result evidence cannot be established, no clean promotion or trusted attestation; present an owner decision, do not waive it. Attach dated evidence (redacted identifiers), test log, approvals, and actual billed-service limits to evidence ledger. No customer files.

### B3 — FUTURE LIVE TRUSTED WORKER + PERSISTENCE (separately approved)

Only after B2 operator and architect signoff: dedicated queue consumer with injected trusted queue transport tied to verified AWS role and permissions; actual trusted attestation mapped to the A1.1 server-only `finalizeScan` port and immutable exact-version scan evidence; SQS ack after committed DB transaction, durable dedup and replay conflict; fail-closed on mismatches, retries/DLQ, auditing and rollback. Synthetic-only first. Requires independent source review and rollback test; no public upload API, AI context or customer data until A1.3+.

## 2. Trust model and state boundaries

- **Source content:** GuardDuty EventBridge JSON includes self-asserted account/region/source/plan ARN/key/VersionId; a signed AWS HTTP/TLS connection to SQS authenticates SQS, not automatically the original GuardDuty publisher. The SQS message ID/receipt handle prove neither event origin nor benign content.
- **B1 trust proof:** static evaluator checks an explicitly provided allowlisted account, partition, region, bucket/prefix, S3 Versioning enabled, approved encryption, exact Malware Protection Plan ARN/status/bucket/prefix, dedicated EventBridge rule pattern/targets, queue ARN and resource-policy permissions, queue DLQ, KMS, role, permissions boundary, and unknown/unaccounted principals. Never log unredacted policy/ARN/queue URL, credentials, object keys, raw events or client files.
- **Spoofing:** require comprehensive policy proof for `events:PutEvents` and EventBridge rule creation/modification/target permissions on relevant buses, direct `sqs:SendMessage`, `sqs:SetQueueAttributes`, `iam:PassRole`, administrator and policy mutation surfaces. An unassessed ability to inject a matching event is a NO-GO. A simple regex over JSON policies is not effective-policy proof; explicitly report unknown conditions/SCP/permissions-boundaries/resource grants as **INCOMPLETE** and only static diagnostics. Don't issue `ScanDeliveryAuthenticatorPort.authenticate=true` from such evaluation.
- **Exact object:** event's `s3ObjectDetails.versionId` must equal persisted `ProjectDocumentVersion.storageObjectVersionId`, plus Project, asset, version, current scan generation and operation identity; never latest version or ETag hash. Real A1.2-A exact-version read computes SHA-256 and size; ensure event timestamp/replay correlation and pending->terminal transaction checks in B3. `COMPLETED+NO_THREATS_FOUND` is only a candidate; failures/unsupported never clean.
- **Replay:** durable key at minimum {provider, account, event ID, fingerprint}; duplicate identical is idempotent; same event ID/different fingerprint is conflict; stale generation or opposite terminal verdict never replaces a completed scan. Keep queue ack decision separate from persistence effect.
- **No security declassification:** new security code cannot bypass `authorizeExactVersionRead`, Project consent, membership, grant, withdrawn/closed status, or A1.1 ProjectOperation/ProjectEvent atomic audit.

## 3. B1 evidence-evaluator contract

Place in `chatbot/lib/project-documents/aws/security-readiness/` or similarly isolated, `import "server-only"`, pure/injected and no network, credentials, filesystem AWS config/profile discovery, or `process.env` reads that activate behavior. Tests use sanitized static in-memory fixtures.

Accept a **versioned, typed** evidence envelope:
- `schema: "phase13.project_document.aws_security_evidence.v1"`;
- `capturedAt` (timestamp), `environment: "sandbox"`, `source: "operator_export" | "fixture"`, exact scoped resource metadata and policy statements; evidence cannot by itself prove operational identity;
- evaluate named requirements with `PASS` / `FAIL` / `INCOMPLETE` and machine-readable stable reason codes, bounded notes and no unsafe contents; supply aggregate `NO_GO` unconditionally for fixtures or data without B2 operator verification.
- fail closed on malformed/unsupported policy condition operators, wildcard Action/Resource/Principal, unexpected policy versions, duplicates, unknown control-plane facts, ARN mismatch, missing plan status, policy principal broadness, cross-account grants and any mutable policy surface not covered;
- use deny-by-default parsing of provided statements with explicit action/resource matching; **do not claim a finite policy snapshot evaluates all AWS IAM semantics** (SCP, boundaries, role sessions, identity policies, AWS Organizations, permission sets, grants, effective denies).
- produce an operator-readable, **redacted** JSON readiness report with `toolVersion`, evidence timestamp, deterministic requirement results, evidence limitation statement and unconditional `requires_live_owner_verification: true`. No raw customer metadata.
- type interface for future live read-only collectors only; B1 MUST NOT invoke AWS STS/S3/IAM/SQS/EventBridge/GuardDuty APIs.

## 4. B1 migration 0033 — audit append-only guard and permissions plan

A1.1 migration 0032 guards terminal `ProjectDocumentProcessingRun` **UPDATE**, terminal `ProjectDocumentVersion.securityStatus` promotion and exact scan provenance on transaction commit, but privileged direct SQL `DELETE` remains a gap. B1 may add **one additive 0033** with migration journal and Drizzle-consistent snapshot; 0030–0032 unchanged.

**Minimum DB invariants:**
- Deny ordinary `DELETE` of `ProjectDocumentProcessingRun` (including preterminal runs), `ProjectOperation`, and `ProjectEvent`; prevent orphaning or destroying consent/provenance relations via direct unsafe deletes. Protect scan/event audit append-only records from arbitrary UPDATE after commit.
- `ProjectEvent` should be immutable after INSERT; legacy M1 append-only behavior preserved.
- `ProjectOperation` M1 **does make a legitimate in-transaction UPDATE of `resultKind`/`resultId` before appending an event** (membership invitation), so **do not globally prohibit all operation updates**. Scope and guards must allow this exact bounded pre-event transition and disallow post-event changes to operationId, actor, type, hash, result and timestamp. Independently test current M1 behavior.
- Keep `ProjectDocumentProcessingRun` lifecycle `started → completed|failed` functional while forbidding terminal update; existing 0032 terminal immutability must not be bypassed or replaced.
- `TRUNCATE`, owner/superuser trigger disablement, DDL and backup restores can evade row-level triggers. Runtime DB role must not be table owner, migration role or superuser and must lack TRUNCATE/DDL/TRIGGER or broad access. **SQL triggers alone never prove tamper resistance**; enforce through proposed role/grant matrix and guarded tests of least-privilege role when achievable without changing production roles. Do not silently claim privilege isolation without evidence.
- No backfill/rewriting accepted audit history. If an existing unsafe delete cascade means a trigger blocks ordinary maintenance/close, document exact conflict rather than weakening safety.
- Tests require DELETE attempt rejection, post-event immutable operation/event, allowed M1 preevent operation finalize, legitimate synthetic A1.1 scan, terminal replay/rollback, missing audit evidence -> read fails closed, runtime-role restrictions if a disposable role exists. Separate migration tests only on **`127.0.0.1:5432/immigration_ai_phase13_m1_1_test`** guarded by the existing `PHASE13_M1_1_TEST_DATABASE_URL` target identity validator; refuse every other address/db and any implicit production connection. No automatic reset, migration or privilege change against production or ordinary `chatbot` DB.

**Schema/snapshot:** follow exact Drizzle generation policy of repo; if triggers are raw SQL only, ensure 0033 migration included once in journal and generated snapshot consistency verified, without sneaking unrelated schema changes. Never generate 0034. B1 cannot choose retention/deletion policy; logical withdrawal doesn't imply physical object deletion.

## 5. B1 queue protocol and operational safety

Implement either a small pure `planQueueMessageDisposition()` type-state protocol or a written machine-checked mapping in tests, **no live consumer**:
- trusted transport proof absent -> `deny_untrusted`, no ack-as-clean, no `finalizeScan`;
- durable PostgreSQL success after audit commit -> `ack`; successful identical replay -> idempotent `ack`;
- transient S3/DB/IAM connectivity/timeout -> `retry` (no acknowledgement, bounded visibility/attempt policy deferred to operator);
- malformed/forged/cross-account/identity mismatch or conflicting duplicate -> `quarantine_or_dlq` with explicit security incident flag; no clean; no unbounded local loops;
- if an otherwise-successful DB commit is followed by SQS ack failure, later delivery must replay idempotently and never duplicate Project revision/events;
- never log raw body, full object key, event threat details, tokens, credentials or PII.

B1 can specify abstract ports and pure tests but **must not** create SQS clients, EventBridge rules, queue workers, secret readers or runtime import paths.

## 6. Explicit forbidden scope / no accidental cost

- No live AWS control-plane or data-plane calls, account/role login, creating/changing/deleting S3 buckets, GuardDuty plan, EventBridge rules, SQS queues/DLQ, IAM roles, KMS keys, Object Lock, retention periods or scanning objects.
- No real customer files, upload/download endpoints, web routes, AI-context/FactAssertion pipeline, feature enablement, real delivery authenticator minting, trusted scan persistence, scheduled job, deploy or production DB access.
- No edits to Phase 12 MatterDocument or migration 0030–0032. No user impersonation or `servicePrincipalCode` derived from event JSON.
- No unnecessary dependency additions, no genuine AWS credentials stored in tests or project docs.
- B1 code remains uncommitted/unpushed for independent ChatGPT full cumulative patch review.

## 7. Acceptance criteria and handoff

Deliver a guarded 0033 audit-hardening migration and tests (if test DB unavailable, **stop DB-specific changes for review and clearly report missing evidence**, do not claim DB validation), a pure static security-readiness evidence auditor with adversarial fixture tests, a pure SQS disposition protocol, and amended B2 operator checklist explaining precise live GO/NO-GO evidence.

Run `pnpm db:check`, guarded disposable database M1.1/M2-A0/M2-A1.1 integration suites if environment supports them; focused B1 unit, existing 17 AWS adapter tests, and full unit suite if feasible. Report exact pass/fail/skip counts, changed-file Biome, TypeScript baseline delta, `git diff --check`, untracked checks and the synthetic-only scope. Never substitute Codex's own tests for independent review.

Output complete **`~/phase13_m2_a1_2_B1_review.patch`** (tracked + untracked) and leave tree uncommitted/unpushed. B1 acceptance does not authorize B2 or B3. A1.2 overall and M2 remain NOT ACCEPTED until all separate owner gates.
