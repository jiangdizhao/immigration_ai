# Phase 13 M4-002-R1 — Independent Offline Acceptance Record

**Date:** 2026-10-28 (Australia/Sydney)  
**Decision:** **OFFLINE ACCEPTED_WITH_LIMITATIONS** — code and synthetic/offline tests only  
**Owner-pushed SHA:** `079804f02486f5c3acab75f3a8270e676fd679ec`  
**Branch:** `phase13-study-journey-project-centric`  
**Previous baseline:** `eab171c29c062601810f034d9eb3b5f496dac689`

## 1. GitHub source-of-truth provenance

GitHub independently verified one commit from baseline to `079804f02486f5c3acab75f3a8270e676fd679ec`: exactly 24 changed files, 19 added and 5 modified. New source includes seven Project staff route files, assignment repository/availability, policy, HTTP, runtime, schema tests, migration `0041_phase13_m4_002_staff_assignments.sql`, `0041_snapshot.json` and rate-limit regression tests. Tracked changes: `chatbot/lib/db/migrations/meta/_journal.json`, `chatbot/lib/db/schema.ts`, `chatbot/lib/ratelimit.ts`, `chatbot/package.json`, `docs/agent-memory/CURRENT_HANDOFF.md`. No M4-003 or M4-004 implementation was included.

The user's previously uploaded and independently reviewed complete R1 patch had reported SHA-256 `03e2de59532cfb95b97af9bd72da48bbb22d3104cdedd6e3545540352a94aa23`. The remote commit content and exact file set are the present source of truth; patch provenance is supporting review evidence, not a claim that independently repeated tests were run.

## 2. Accepted scope

- **Option A:** authenticated administrator proposes one named, non-guest/email-verified lawyer account for a known Project/purpose; exact Project owner explicitly authorizes snapshot/notice; same lawyer accepts; only an active assignment gives a minimal non-sensitive Project shell.
- Unassigned and nonactive lawyer, generic admin, foreign Project, stale/revoked status and role demotion must not become customer data access. The admin's proposal role is not owner consent; M2 AI grants and membership are not staff disclosure. Existing private Chats remain private.
- Independent feature flag defaults OFF. M4-004 protected-data authorization fails closed; no data-sharing or professional-approval authority granted. Lawyer email verification and role are not registration/licensing evidence.
- **R1-01 PASS:** assignment Project revision strictly increases without requiring consecutiveness after unrelated Project revisions; event and operation relations remain separate safety gates.
- **R1-02 PASS:** changed-payload admin idempotency conflicts return a generic 409; identical replay/unknown inaccessible Project retain expected non-enumerating 202 behavior.
- **R1-03 PASS:** sensitive staff assignment routes use a strict Redis limiter; unavailable store/exception fails closed; default legacy route rate limiting remains unchanged.

## 3. Validation evidence and explicit limits

Codex-reported evidence at the original local worktree: focused **4/4 test files PASS**, `pnpm test:unit` **117 PASS / 3 FAIL / 0 SKIP** file-level suites. Unresolved failed suites:
1. `s3-preflight-cli.test.ts`: expected missing-config stderr empty.
2. `stage3-hardening.test.ts`: migration CLI expected exit 2, got 1.
3. `server-http-timeouts.test.ts`: loopback listener failed with `listen EPERM`.

Changed-path Biome PASS; `pnpm exec drizzle-kit check` PASS; TypeScript 44 diagnostics equal to reported clean-HEAD baseline with 0 changed-path diagnostics; whitespace and complete patch reverse applicability reported PASS. The reviewer inspected R1 patch and selected pushed source, not running an independent full suite. **Do not assume the three failures are proven unrelated/environmental** until a like-for-like baseline comparison.

**Database verification not performed:** no connection, SQL, applied migration 0041, PostgreSQL named constraints/trigger outcomes, concurrent/replay integration, rollback, Redis connection or external integration. No live customer data, AWS/S3, Stripe, provider or production checks. Drizzle consistency and mocks do not prove actual PostgreSQL behavior.

## 4. Next controlled gate

[Proposed isolated PostgreSQL validation plan](./PHASE13_M4_002_ISOLATED_POSTGRES_VALIDATION_DRAFT_2026_10_28.md) is **DRAFT**, not owner permission. Require explicit disposable database identity, controlled migration plan and ledger checks, and owner authorization before executing; never use the authoritative/legal-service database by accident.

Resolve or baseline-classify the three full-suite failures with comparable environment evidence. Following successful isolated DB verification and independent review, revisit M4-002 acceptance status separately. M4-003–007 are not dispatched. The M4 and Phase 13 live/production state remains **NO_GO**.
