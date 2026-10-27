# Phase 13 M4-002 — Isolated PostgreSQL database acceptance (Stage 3A / Stage 3B R5)

**Date:** 2026-10-28 (Australia/Sydney)  
**Status:** **DATABASE VALIDATED / ACCEPTED_WITH_LIMITATIONS; LIVE/PRODUCTION NO_GO**  
**Branch:** `phase13-study-journey-project-centric`  
**Source/test commit:** `a02720f7653689efcc8576b56be9cdaac65fb248`  
**Previous R1 implementation:** `079804f02486f5c3acab75f3a8270e676fd679ec`  
**Previous docs decision:** D-P13-017; this acceptance is recorded as D-P13-018.

## 1. Scope and evidence provenance

M4-002 implements owner-selected **Option A**: authenticated admin proposes a named lawyer account for a known Study Journey Project; that Project's actual owner approves the immutable proposal/notice; the named lawyer explicitly accepts; only an active assignment enables a tightly allowlisted, non-sensitive Project shell. Generic admin/lawyer role does not grant Project content or membership. A proposed or merely owner-approved assignment does not grant a lawyer shell. Protected-resource authorization remains separate (M4-004 DENY), and the feature flag defaults OFF.

This record is based on **owner-executed Ubuntu commands and uploaded console logs** reviewed by ChatGPT, plus **independent GitHub verification** of the committed five-file Stage 3B test harness. It is **not** a claim that the reviewer personally executed SQL, Docker or network calls. All data used in the authorized PostgreSQL tests was synthetic.

## 2. Verified repository checkpoint

GitHub remote `phase13-study-journey-project-centric` pointed to `a02720f7653689efcc8576b56be9cdaac65fb248` after the owner's push. GitHub compare from `fb83190ff95409d2beab55e1284252cbcd624947` was **ahead by exactly one commit, behind by zero**, with exactly five changes:

1. `chatbot/lib/db/project-staff-assignment.integration.test.ts` — added
2. `chatbot/scripts/phase13-m4-002-db-test-guard.test.ts` — added
3. `chatbot/scripts/phase13-m4-002-db-test-guard.ts` — added
4. `chatbot/scripts/phase13-m4-002-db-test.ts` — added
5. `chatbot/package.json` — modified (test scripts only)

Commit message: `test: validate M4-002 staff assignments against isolated PostgreSQL`. No production Repository, SQL migration, existing schema, deployment or feature flag was changed by this commit. Previously independently reviewed complete R5 Patch SHA-256: `bee1690db9a40327b62e20cb5624377405bb92ef45a77d3c6555a46eba6c5422`.

## 3. Stage 3A — isolated migration outcome

The owner provisioned an independent Docker `postgres:17` PostgreSQL **17.11** container named `phase13-m4-002-pg`, bound only on `127.0.0.1:55432`, with tmpfs data directory. Image SHA-256: `82903352d6faf8f8a318bc4353d1cb1db67d4a5ff968d2799b2718e2cb00afa2`. The target database and dedicated role were `immigration_ai_phase13_m4_002_test` and `phase13_m4_tester`. A read-only identity check verified that `public_tables=0` before migration, and the existing PostgreSQL on `127.0.0.1:5432` remained available.

Owner-authorized migration tooling explicitly scoped `POSTGRES_URL` to that test target only. **Stage 3A PASS:** 42/42 migration journal entries through `0041_phase13_m4_002_staff_assignments`, preflight `missing` → `current`; final ledger `42|1793097755857`; `STAGE3A_MIGRATION_VERIFIED`; exit code **0**. PostgreSQL `NOTICE 42622` identifier truncation and `NOTICE 42P07` existing-index skip were notices, not migration failures. No production/business database migration was authorized or performed as part of this test.

## 4. Stage 3B — real-PostgreSQL R5 outcomes

Guarded launcher: `pnpm test:phase13:m4-002:integration`. It enforces explicit approval, exact local host/port/db/role, Docker image/container/loopback mapping/label/tmpfs, PostgreSQL major version 17 and migration 0041 ledger content before assigning the test-only connection to the child process. Does not use an implicit `.env.local` fallback. The owner ran it with synthetic fixture identities and uploaded the full run log, located on owner host at `/home/rico/phase13_m4_002_stage3b_R5_run.log`.

**Final R5 result:** **23 tests reported, 23 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; exit code 0; duration 2870.743473 ms**. Node test totals include parent subtests; 17 leaf tests across six groups:

| Group | Validated scope | Result |
| --- | --- | --- |
| A | Required schema inventory, typed Operation/Event CHECK constraints, foreign keys, revision uniqueness, deferred integrity triggers, immutable proposal | PASS |
| B | Admin proposal → exact owner approval → named lawyer acceptance → minimal shell; foreign/closed/unassigned boundaries | PASS |
| C | Owner/admin/lawyer revocation or resignation, current role demotion, closed Project and terminal state | PASS |
| D | Replay, changed request conflict, concurrent duplicate proposals/transition races, stale revisions and transactional rollback | PASS |
| E | Nonconsecutive global Project revision across unrelated Project operations | PASS |
| F | No automatic Project membership, access to private Chats or M2 document resources; explicit default-off flag | PASS |

**Historical initial R4 attempt:** 20 PASS / 3 FAIL because an invalid Operation Type violated two valid CHECK constraints and the test demanded only one specific constraint; 1 leaf failure was propagated to two parent groups. R5 changed only the test assertion to accept the two legitimate constraint names while still requiring SQLSTATE 23514 and verifying the rejected operation had no committed rows. R5 required **no change** to migration 0041 or application Repository.

R5 guard/offline validation was Codex-reported: two focused guard test files PASS, changed-path Biome PASS, `git diff --check` PASS, reverse patch applicability PASS; TypeScript unchanged at 44 reported diagnostics across nine unrelated test files and none in Stage 3B touched files. The exact test result above is independently *inspected from the owner-host output*, not independently re-executed.

## 5. Disposition and non-claims

**ACCEPT M4-002's bounded isolated-database validation.** Preserve D-P13-016 Option A scope and D-P13-017 earlier offline acceptance as historical milestones, superseded only in their old assertions that `0041` is wholly unapplied or database testing unperformed. Migration `0041` was applied **only** on the explicitly isolated test instance; no inference about other schemas or service environments is justified.

Still **NOT VERIFIED / NOT AUTHORIZED**:

- Existing or production/staging PostgreSQL migration, deployment, feature-enable, customer account onboarding, or live operational security readiness.
- Live Redis failure/availability behavior, integrated real staff identity or professional licence/credential verification, external services or customers.
- M4-004 protected Fact/Document/Chat disclosure; default remains fail closed, and staff assignment alone never confers sensitive data.
- Full `pnpm test:unit` clean run / parity classification for the previously observed **117 PASS / 3 FAIL / 0 SKIP** (S3 preflight stderr, migration operator expected exit, loopback `listen EPERM`); these are still unresolved, not declared harmless.
- Resolution of the **44** reported pre-existing TypeScript diagnostics.
- M4-003 through M4-007 implementation, which remains **NOT DISPATCHED** without a separate task and authorization.

**Next:** sync this documentation-only status update, retain the local R5 test log and guarded disposable DB evidence, and separately evaluate the unresolved test-suite baseline and any later readiness gate. **M4 and Phase 13 live/production NO_GO.**
