# Phase 13 M4-003 — Isolated PostgreSQL database acceptance (Stage 3A / Stage 3B DB-R3)

**Date:** 2026-10-28 (Australia/Sydney)  
**Disposition:** **DATABASE VALIDATED / ACCEPTED_WITH_LIMITATIONS; PRODUCTION NO_GO**  
**Branch:** `phase13-study-journey-project-centric`  
**Pushed HEAD before documentation-only commit:** `c4e34b2ae5adc20a128b4fbbb60829efd2d793cc`  
**Reviewed implementation:** **26 local uncommitted/unpushed paths**, complete DB-R3 Patch SHA-256 `65a24b1b3f2267668ea51c055ce0fc677e2dbe61d565e776b716067f5216f550`  
**Decision:** D-P13-019.

## 1. Contract and evidence provenance

M4-003 adds durable, explicitly consented, Project-scoped human messages for the actual customer Project owner and one named lawyer with a current M4-002 Option A active assignment. Access uses current account/role/email identity, active Project, exact active assignment and thread-specific participation consent. Messages are distinct from private AI Chats, consultations, episodic `LawyerClarificationRequest` and any M4-004 protected-resource disclosure grant. Persistent messages have immutable body, sequence and operation-scoped idempotency; withdrawal and revocation terminate access.

Evidence consists of separately owner-authorized execution on Ubuntu with a dedicated isolated Docker PostgreSQL 17 instance. The reviewer independently read the complete project-uploaded `phase13_m4_003_stage3b_DB_R3_authorized_run.log` and inspected the 26-path Patch; the reviewer **did not personally execute SQL, Docker or integration tests**. No customer/business data or protected production system was an authorized target.

## 2. Stage 3A — isolated migration

| Property | Evidence |
| --- | --- |
| Container / DB | `phase13-m4-003-pg` / `immigration_ai_phase13_m4_003_test` |
| Endpoint / role | `127.0.0.1:55433` / `phase13_m4_003_tester` |
| PostgreSQL | 17, local pinned image, loopback-only, ephemeral tmpfs |
| Migration ledger | **43/43**, current through `0042_phase13_m4_003_human_messaging` |
| Latest timestamp | `1793145662822` |
| 0042 SQL SHA-256 | `c5a56b63cfd60e28fde4b58cfd72f79212da1c392d7ef15cfb580fcf77f768a7` |
| Marker | `STAGE3A_MIGRATION_VERIFIED` |

The user-reported Stage 3A verifier passed all identity/ledger/hash checks. Migration 0042 **was applied only to this isolated test database**; neither business `127.0.0.1:5432`, M4-002 `55432`, staging nor production was an authorized migration target. The current 0042 *source file* remains uncommitted locally; do not conflate Git and database state.

## 3. Stage 3B — guarded PostgreSQL A–H

Owner-authorized one-run invocation: `pnpm test:phase13:m4-003:integration` via guarded launcher validating exact Docker identity, database, role, migration journal and SQL hash before exercising synthetic fixtures. Full owner log: `/home/rico/phase13_m4_003_stage3b_DB_R3_authorized_run.log` (project-uploaded copy; **not committed into GitHub**).

**Final DB-R3:** `tests 27`, `pass 27`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 1142.743956`, `STAGE3B_DB_R3_EXIT_CODE=0`. Node counts include 19 leaf tests plus 8 parent/group results.

| Group | Real PostgreSQL assertions | Result |
| --- | --- | --- |
| A | schema/column/index/FK/CHECK/deferred integrity/immutability | PASS |
| B | exact assignment-bound owner consent and thread creation/revision/event | PASS |
| C | owner/lawyer ordered immutable messages; replay and paging | PASS |
| D | withdrawal commits; Operation resultId equals true Consent ID; replay without mutation | PASS |
| E | foreign/unknown/unassigned/role demotion/revoked/closed authorization | PASS |
| F | owner history; SQL-scoped lawyer list and cursor/hasMore isolation | PASS |
| G | distinct concurrent sends, identical operation replay, send-vs-consent withdrawal, send-vs-assignment revocation | PASS (4/4) |
| H | no protected-resource/membership sharing; feature flag default OFF | PASS |

## 4. Correction history and residual risks

- First successful real DB R3 run: 20 PASS / 7 FAIL (4 leaf failures, 3 aggregate), including real PostgreSQL SQLSTATE `40P01` deadlock in concurrent sends, `postgres.js Result` vs native array assertion, and race test failures.
- DB-R1: minimal `FOR NO KEY UPDATE` for User rows in both M4-003 messaging and M4-002 assignment repositories, preserving role/identity/revocation checks and operation-first idempotency. Improve race diagnostics and correct SQL-result comparison.
- DB-R2: 24 PASS / 3 FAIL (one leaf plus parent failures); remaining assertion incorrectly expected `status='owner_revoked'` rather than `status='revoked'` and `terminalReasonCode='owner_revoked'`.
- DB-R3: strict test-only correction verifies status, terminal reason, actual owner and terminal timestamp. All A–H pass including previously blocked Group G. **One concurrent run does not establish exhaustive deadlock freedom.**
- Reported offline checks for final patch: M4-002 schema contract 6/6, M4-003 policy 10/10, HTTP 9/9, schema contract 8/8, Docker guard 13/13; changed-path Biome, whitespace and reverse patch check PASS. TypeScript retained 44 unrelated baseline diagnostics; historical full unit 117 PASS / 3 FAIL / 0 SKIP unclassified.

## 5. Git and acceptance boundary

The full reviewed DB-R3 implementation patch SHA-256 is `65a24b1b3f2267668ea51c055ce0fc677e2dbe61d565e776b716067f5216f550`, **26 paths**: original M4-003 implementation/migration/tests plus the minimal M4-002 assignment repository and contract test corrections. The owner’s worktree is unstaged/uncommitted/unpushed. A docs-only commit does not include these source files, does not deploy Migration 0042 and does not authorize source commit/push without separate review. **Protect the dirty worktree when fast-forwarding the branch**; no reset/rebase/force/cleanup.

## 6. Decision and next gate

**ACCEPT M4-003's isolated database-level validation only.** Preserve M4-002 Option A and separate thread-consent versus M4-004 data disclosure boundary; protect customer Facts, Documents, private AI Chat, contracts, payments and lawyer approvals. Feature gates remain OFF. No actual professional credential/legal approval validation, real-client tests, staging/production migration, release, or M4-004–007 implementation is inferred.

Next: synchronize this documentation-only checkpoint without losing local M4-003 files; independently verify and separately commit/push the reviewed implementation; reconcile outstanding baseline test issues as appropriate. Phase 13 live/production **NO_GO**.
