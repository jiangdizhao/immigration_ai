# Phase 13 M2-A1.2-B — AWS Security Operator Checklist

**Status:** A1.2-B is gated. This checklist records evidence and owner decisions required before any live AWS adapter, queue consumer, or trusted scan persistence is authorized. It does not approve infrastructure, retention, deployment, or customer data processing.

## Authorization and change record

- [ ] Record the separately approved A1.2-B scope, named operator, environment, change window, rollback owner, and evidence location.
- [ ] Confirm the work uses an isolated non-production AWS account and synthetic disposable objects only. No production/customer documents or production routes are in scope.
- [ ] Record the exact AWS account, partition, region, bucket, Malware Protection Plan, EventBridge rule, SQS queue, DLQ, and application role identities from live control-plane evidence.
- [ ] Obtain privacy/legal/operator decisions for data residency, retention, lawful deletion, legal hold, backup retention, and proof-of-erasure before creating or changing resources.
- [ ] Record cost limits, alert thresholds, expected object/scan/message volume, and an owner for cost review. Do not infer cost safety from this offline implementation.

## Account, region, identity, and IAM

- [ ] Verify the caller's AWS account ID and partition through the approved credential chain and an independent account identity check. Compare it with the allowlisted account; stop on mismatch.
- [ ] Verify the configured region, bucket region, plan region, queue region, and deployment region agree. Confirm redirect and cross-region access behavior is not silently accepted.
- [ ] Confirm the production configuration is server-owned, isolated from browser input, and contains no credentials. Keep the A1.2 feature gate disabled until all gates and review approvals pass.
- [ ] Review the application's dedicated least-privilege IAM role. Permit only the required bucket/prefix, exact-version reads, conditional writes, versioning inspection, checksum metadata, and queue receive/delete actions needed by the approved worker.
- [ ] Explicitly deny or omit broad bucket listing, public ACL/policy changes, bucket configuration changes, IAM administration, `DeleteObject`, `DeleteObjectVersion`, unrelated prefixes, and unrelated queues unless a separately approved operational role requires them.
- [ ] Separate application, migration, security administration, and break-glass roles. Verify trust policies, session limits, credential rotation, CloudTrail coverage, and alerting for privilege changes.
- [ ] Confirm S3 bucket public-access blocks, ACL ownership controls, bucket policy, TLS-only access, and cross-account access restrictions from live configuration.

## S3 storage and immutable version identity

- [ ] Verify the bucket name, owner account, region, and disjoint Project prefix with an explicit expected-owner check. Confirm the Phase 12 MatterDocument prefix and bucket are unaffected.
- [ ] Verify bucket Versioning is `Enabled`, not absent or suspended. Exercise a synthetic write and prove the returned non-null `VersionId` is stable and retrievable.
- [ ] Verify conditional create (`If-None-Match: *`) prevents a second object at the same key from silently replacing or versioning the initial object. Test conflict and ambiguous-write recovery.
- [ ] Verify encryption at rest (approved SSE-S3 or separately approved SSE-KMS), transport encryption, key policy, key rotation, and GuardDuty's ability to inspect the encrypted object without broadening application access.
- [ ] Verify submitted SHA-256 checksums, exact-version HEAD/GET, expected bucket owner, content length, and independently computed downloaded-byte SHA-256 against the persisted A1.1 identity. Treat ETag only as an opaque S3 field.
- [ ] Test missing, `null`, mismatched, deleted, and newer-version substitutions. Every case must remain unverified and must not promote a clean scan state.
- [ ] Confirm keys contain only server-generated opaque identifiers under the fixed Project prefix. No names, filenames, client identifiers, or other PII may appear in keys, logs, metrics, or traces.
- [ ] Verify there is no signed public URL, anonymous read, or unscanned content delivery path. Confirm unscanned bytes cannot reach a browser, model, or downstream processing consumer.

## Object Lock, retention, erasure, and legal hold

- [ ] Obtain an owner/privacy/legal decision whether Object Lock is needed and which mode is lawful for the intended document class. Do not enable Governance or Compliance mode from this checklist alone.
- [ ] Resolve the conflict between immutable retention and a person's lawful deletion/withdrawal rights. Define who can place/remove legal holds and how exceptions are authorized and audited.
- [ ] Define separate policies for logical access withdrawal, quarantine, version deletion, backup expiration, legal hold, and proof-of-erasure. Versioning alone is not a deletion guarantee.
- [ ] Select no retention duration until privacy/legal owners approve it. Record the approved schedule, scope, exceptions, and review date in the authorized operational record.
- [ ] If deletion is approved, require an audited exact `VersionId` purge plan, authorization separation, dry-run evidence, retries, lock/error handling, and a report that does not expose object contents or PII.
- [ ] Verify backups, replicas, inventory reports, logs, and queue payloads do not retain document content or identity beyond their separately approved lifecycle.

## GuardDuty Malware Protection and scan evidence

- [ ] Verify the exact Malware Protection Plan ARN, account, region, bucket scope, object prefix, role, and plan status from live AWS evidence.
- [ ] Confirm the plan scans only the intended Project prefix and emits the documented EventBridge scan-result detail type. No ordinary object tag or application assertion may stand in for a scan result.
- [ ] Confirm `COMPLETED + NO_THREATS_FOUND` is the only potential clean event pair. Threats, skipped, unsupported, access denied, failed, unknown, malformed, or mismatched events remain non-clean.
- [ ] Verify the event's bucket/key/VersionId resolves to the exact persisted ProjectDocumentVersion, current generation, active Project/asset, pending security state, stored identity, byte size, and SHA-256.
- [ ] Independently read the exact S3 version and compute SHA-256 and byte count before considering a candidate. Never accept latest-version fallback, ETag-as-digest, or a missing/null VersionId.
- [ ] Verify freshness policy and clock source are explicitly configured and tested. Define how delayed delivery, future timestamps, replay, duplicate event IDs, and conflicting fingerprints are handled.
- [ ] Ensure logs and alerts contain only allowlisted result codes and opaque event references. Never log raw event bodies, threat names, object bytes, credentials, or full storage keys.

## EventBridge, SQS, source authentication, and replay

- [ ] Verify the exact EventBridge rule targets only the dedicated queue and filters by the approved GuardDuty source, detail type, account, region, and plan.
- [ ] Review queue and KMS resource policies. Restrict `SendMessage` to the approved EventBridge rule/service path and expected source account/ARN; deny public, cross-account, and arbitrary `PutEvents` paths.
- [ ] Prove the worker independently authenticates its queue, account, region, rule/producer, and message context before parsing the event. Fields inside JSON and SQS `messageId` alone are not authentication.
- [ ] Verify the approved consumer checks the raw-body bound, strict event schema, canonical fingerprint, exact-version binding, freshness, and duplicate/conflicting event ID behavior.
- [ ] Confirm queue acknowledgement occurs only after the A1.1 transaction commits. Transient failures retain the message for bounded retry; terminal denied/unverified messages follow a documented DLQ and incident policy.
- [ ] Verify visibility timeout, receive limits, DLQ redrive, queue encryption, retention, alarms, and poison-message recovery with synthetic fixtures. Set values only in an approved capacity/operations plan.
- [ ] Confirm there is no shared or legacy Phase 12 queue consumer for Project events and no unauthenticated HTTP/browser ingestion path.

## PostgreSQL audit, authorization, and deletion protection

- [ ] Verify the application DB role is not a superuser, owner, or migration role and cannot arbitrarily update/delete finalized `ProjectDocumentProcessingRun`, `ProjectOperation`, `ProjectEvent`, document identity, or provenance rows.
- [ ] Use a separately controlled migration role. Inspect grants, ownership, row-level/application controls, triggers, and operational break-glass access from the live database without exposing credentials.
- [ ] Independently verify the A1.1 audit chain is present and consistent before a scan transition. Missing, deleted, conflicting, or unverifiable audit evidence must fail closed.
- [ ] Approve the separate future migration/design for audit-row deletion protection and test it in an explicitly authorized disposable database before any live rollout. This checklist does not authorize migration 0033 or any database change.
- [ ] Define backup/restore and incident procedures that preserve the relationship among scan run, operation, event, Project/version identity, generation, and exact S3 version.
- [ ] Confirm the durable event/audit record contains bounded metadata only and excludes raw event payloads, malware details, object bytes, credentials, and unmasked storage keys.

## Privacy, residency, operations, and incident recovery

- [ ] Verify data residency for the bucket, GuardDuty processing, event bus, queue, logs, backups, replicas, and support access. Record all cross-region or cross-border paths.
- [ ] Complete privacy and professional-data review for document classes, consent, access audiences, retention, withdrawal, legal holds, and incident notification before A1.3.
- [ ] Verify encryption and access controls for CloudTrail, S3 access logs, queue/DLQ, application logs, metrics, alerts, and backups. Minimize identifiers and apply the approved retention schedule.
- [ ] Test scanner outage, throttling, access denial, unsupported object, timeout, S3 read failure, missing version, checksum mismatch, duplicate, conflicting replay, DB failure, and DLQ exhaustion using synthetic objects only.
- [ ] Document operator runbooks for quarantine, access suspension, queue pause, retry, replay investigation, exact-version recovery, audit repair, lawful deletion, and rollback. Do not manually mark a document clean to restore service.
- [ ] Define monitoring for plan health, scan completion/failure, queue age/depth, DLQ count, ambiguous writes, exact-version read failures, audit mismatches, denied IAM calls, and cost anomalies.
- [ ] Run an independent security review of the production wiring and an owner-approved rollback exercise before enabling any live consumer.

## A1.2-B release decision record

- [ ] All checklist evidence is attached, dated, and reviewed by the designated AWS/security operator.
- [ ] Privacy/legal owners have resolved residency, retention, deletion, legal-hold, consent, and data-classification decisions.
- [ ] Independent review has confirmed authenticated transport, exact-version integrity, replay/freshness behavior, least-privilege IAM, database audit protections, and rollback.
- [ ] Any unresolved or unverifiable requirement remains a **NO-GO**. Do not enable the feature flag, consume live messages, or persist a GuardDuty result until a separate owner authorization explicitly approves the completed evidence package.
