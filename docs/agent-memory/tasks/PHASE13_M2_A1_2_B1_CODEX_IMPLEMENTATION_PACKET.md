# Phase 13 M2-A1.2-B1 — Codex Bounded Security Foundations Packet

**Status:** architect-approved **B1 only**. No B2 live AWS or B3 trusted worker authorization. **Branch:** `phase13-study-journey-project-centric`. **Pre-B baseline SHA:** `ad688d4f9021d277c78078fc8af85e2e588c06b6`. Check exact new docs HEAD after local sync.

## Mandatory documents
1. `AGENTS.md` and `docs/agent-memory/{CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE}.md`.
2. `docs/agent-memory/tasks/PHASE13_M2_A1_2_PRIVATE_S3_TRUSTED_GUARDDUTY_ARCHITECTURE_CONTRACT.md` and `PHASE13_M2_A1_2_AWS_SECURITY_OPERATOR_CHECKLIST.md`.
3. **`docs/agent-memory/tasks/PHASE13_M2_A1_2_B_TRUSTED_DELIVERY_AUDIT_SECURITY_CONTRACT.md`** — architect-owned authoritative contract.
4. `docs/agent-memory/tasks/PHASE13_M2_A1_1_DURABLE_TRANSACTIONS_AUDIT_CONTRACT.md` and accepted migration 0032 + A1.1 DB repository.
5. Accepted A1.2-A `aws/` adapters and tests; M1 `project-foundation.ts` and tests.

## Implement B1, not B2/B3
- One additive **0033** migration for audit append-only/delete protections. Preserve legitimate M1 `ProjectOperation` result-kind/result-ID in-transaction update, 0032 processing-run transition and exact-version scan provenance. Verify against the **only** guarded disposable local PostgreSQL database; no migrations against real/normal DB. Tests must cover legitimate operations and tamper attempts, including rollback.
- Pure static versioned **AWS readiness evidence analyzer** with deterministic redacted PASS/FAIL/INCOMPLETE findings and unconditional live **NO-GO** for simulated/supplied policy snapshots. Require precise scoped account/region/bucket/S3 Versioning/plan/EventBridge rule/SQS IAM+queue/KMS and spoofing surface assessment; report unknowns as incomplete, never claim effective IAM proof from JSON.
- Pure **queue ack/retry/DLQ protocol** for security state machine; no live SQS, no AWS clients, no worker or A1.1 `finalizeScan` wiring. Keep `ScanDeliveryAuthenticatorPort` incapable of being satisfied by forged JSON or static policy report.
- Update `PHASE13_M2_A1_2_AWS_SECURITY_OPERATOR_CHECKLIST.md` with B2 live evidence/approval gates and update three current-state files, preserving all prior accepted milestones.

## Hard stop
Do NOT create/modify AWS resources, use credentials, invoke AWS APIs, run real GuardDuty scans, collect customer documents, deploy, enable flags, call SQS, wire trusted scan persistence, add APIs, modify 0030–0032 or Phase 12 MatterDocument. Do NOT touch `chatbot` or `immigration_legal` DB. Do NOT commit/push. Stop/report instead of guessing security exceptions or retention settings.

## Validate and handoff
Focused B1/adversarial tests, existing A1.2-A (17 expected baseline) + M1/M2 guarded DB regressions, `pnpm db:check`, changed-file Biome, `git diff --check`, untracked whitespace, TypeScript diagnostic delta. Full unit suite if feasible. Require actual DB target identity attestation before any reset/migrate.

Generate entire cumulative `~/phase13_m2_a1_2_B1_review.patch` including untracked. Report precise files/tests and whether guarded DB tests actually ran. Mark B1 **review pending**, B2/B3 NOT AUTHORIZED and M2-A1.2/M2 NOT ACCEPTED. Stop uncommitted for ChatGPT independent patch review.
