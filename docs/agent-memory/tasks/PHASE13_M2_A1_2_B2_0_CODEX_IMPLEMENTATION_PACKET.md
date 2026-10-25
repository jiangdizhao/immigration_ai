# Phase 13 M2-A1.2-B2-0 — Codex Read-only AWS Evidence Harness Packet

**Status:** B2-0 OFFLINE IMPLEMENTATION AUTHORIZED ONLY. B2-1 operator-executed live AWS reads, B2-2 synthetic paid/mutating trial, B3 trusted worker, customer APIs and deployments NOT AUTHORIZED.

**Base branch:** `phase13-study-journey-project-centric`; **accepted B1 and docs HEAD:** `d1f9c7788681d61a586c16c32530968d3d071244`. Verify latest GitHub docs commit after local sync before touching code.

## Authority and reading
Read `AGENTS.md`, three state docs, `docs/agent-memory/tasks/PHASE13_M2_A1_2_B_TRUSTED_DELIVERY_AUDIT_SECURITY_CONTRACT.md`, `PHASE13_M2_A1_2_AWS_SECURITY_OPERATOR_CHECKLIST.md`, and the primary **`PHASE13_M2_A1_2_B2_AWS_LIVE_EVIDENCE_ARCHITECTURE_CONTRACT.md`** (authoritative). Read accepted B1 `aws/security-readiness/{evaluator,types,queue-disposition}.ts`, accepted A1.2-A AWS adapters, M2-A1.1 persistence / 0032 and audit 0033 for preserved boundaries.

## Deliver B2-0 (offline)
1. Default-`plan` server/operator-only CLI `chatbot/scripts/phase13-b2-aws-security-readiness.ts` plus isolated `lib/project-documents/aws/security-readiness/b2-*` helper(s). Exact allowlisted read-only AWS calls, explicit named non-default profile, scope-pinned sandbox account, partition, region and resources; account-identity check via STS **before** other calls. A future explicit `collect-read-only` mode must require typed time-bounded user approval, `--confirmed-account` and correctly matched profile/scope. **Do not run it now.** No generic command interpreter, shell strings, endpoint override, credential discovery or AWS calls at import/plan/test time.
2. Typed `phase13.project_document.aws_b2_observation.v1` normalized observation with redacted deterministic `NO_GO`/missing-evidence status. Reuse B1 evaluator without bypass. Never treat static policy snapshot/STS identity as trustworthy GuardDuty publisher proof.
3. Fake-injected tests for STS first, wrong account stop, no plan network calls, denied/partial/mismatched policies, policy spoofing and `aws.` source nuance, SQS direct injection, scoped S3 bucket/Versioning, exact rule+queue, IAM/KMS ambiguity, redaction, bounded timeouts, fixed command allowlist. No AWS/DB access in any test.
4. Author `docs/agent-memory/tasks/PHASE13_M2_A1_2_B2_LIVE_READONLY_OWNER_RUNBOOK.md`, update AWS operator checklist and the 3 current-state docs, preserve prior accepted history.

## Forbidden
No actual AWS API/credentials during Codex B2-0; no resource creation, modify/delete, S3 Put/Get/List or GuardDuty trigger, SQS Receive/Send/DeleteMessage, EventBridge PutEvents, IAM mutation/AssumeRole, billing, AWS profile change, DB read/migration, web API/UI, production enable, A1.1 finalizeScan integration, Phase12 MatterDocument, migration 0030–0033 changes or 0034. No commit/push. No production usage or blanket security-pass.

## Tests and handoff
Run focused fake collector/evidence tests; existing B1 queue 11, evaluator 16 and A1.2-A adapter 17 tests; changed-source Biome, TS baseline delta, `git diff --check`, untracked whitespace, exact files and evidence paths, no network checks. Full unit suite if feasible, report whether run. No PostgreSQL tests needed unless accidental dependency, which is a blocker.

Generate complete cumulative tracked+untracked review patch **`~/phase13_m2_a1_2_B2_0_review.patch`**, report SHA256 and exact pass/fail/skip. Leave uncommitted/unpushed. Mark B2-0 review pending, B2-1/B2-2/B3 not authorized, M2-A1.2/M2 not accepted. Stop for independent ChatGPT review.
