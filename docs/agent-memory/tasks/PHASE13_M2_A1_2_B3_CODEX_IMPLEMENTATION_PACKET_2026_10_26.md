# Codex dispatch — Phase 13 M2-A1.2-B3 offline implementation

**Repo:** `/home/rico/immigration_ai`  
**Branch:** `phase13-study-journey-project-centric`  
**Expected HEAD:** Documentation checkpoint after `7a078ed329a775e788941a44ac3809ca18da34f1`. Verify exact synced branch HEAD before editing.  
**Scope:** ONE complete B3 offline queue-to-durable-PostgreSQL integration task. No AWS resource recreation or real AWS I/O.

Read in full and obey:
- `AGENTS.md`; latest `docs/agent-memory/CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md`;
- `docs/agent-memory/tasks/PHASE13_M2_A1_2_B3_RAPID_INTEGRATION_CONTRACT_2026_10_26.md` (authoritative for coding scope);
- `PHASE13_M2_A1_2_B_TRUSTED_DELIVERY_AUDIT_SECURITY_CONTRACT.md`, `PHASE13_M2_A1_2_B2_AWS_LIVE_EVIDENCE_ARCHITECTURE_CONTRACT.md`, A1.1 and A1.2-A contracts;
- `chatbot/lib/project-documents/{postgres-repository,ports,types}.ts`;
- `chatbot/lib/project-documents/aws/{delivery-context,guardduty,scan-candidate,s3-object-store}.ts`;
- `chatbot/lib/project-documents/aws/security-readiness/queue-disposition.ts`, migrations 0032/0033 and related tests.

**Implement:** narrowly scoped B3 worker coordinator and injected SQS transport (including optional separately gated SDK adapter; fake-only tests), exact-version S3 SHA-256/size validation, test-only synthetic provenance port, verified server-held attestation bridge to A1.1 atomic `finalizeScan()`, ACK-after-commit, durable idempotent replay and conflicting duplicate quarantine. Treat all EventBridge bodies as untrusted until independently authenticated. Preserve B1 `NO_GO`; do not mint real trusted context from queue receipt, JSON, or policy snapshot. No public upload/routes, AI context, real production data, real AWS calls, credentials, migrations or deployment.

**Tests:** fake SQS + fake exact-version S3 cases, GuardDuty realistic event fixtures, negative/bypass cases, timeouts, duplicate ack-failure; guarded disposable PG integration to prove atomicity/rollback and durable dedup **only** if verified test DB and guards permit. Full `pnpm test:unit` AND explicitly run new B3 dedicated tests (not in explicit test:unit list). Report exact passing/skips, TypeScript baseline, lint and `git diff --check`.

**STOP** after implementation and offline validation. Leave all files uncommitted/unpushed. Update three current state docs with truthful review-pending status. Provide cumulative patch `~/phase13_m2_a1_2_B3_review.patch`, SHA-256, files changed and test logs. Explain all blockers (especially any unsolved real GuardDuty source attestation) without widening the assignment.
