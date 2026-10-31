# Phase 13 — Post-M5 School Application E2E Execution Plan

**Prepared:** 2026-10-31 (Australia/Sydney)  
**Status:** EXECUTION_PLAN_PREPARED_ONLY / G0_NOT_EXECUTED / OWNER_AUTHORIZATION_REQUIRED / LIVE_PRODUCTION_NO_GO  
**Branch:** phase13-m5-school-admissions  
**Planning baseline:** 75c7e424cd1ab4efad2c73a8b5e1343491d14c5a (docs-only M5 closeout); M5.3 accepted code 433f0f3bf83ed8505675b2d164e07b138dbc72f4  
**Controlling contract:** [Post-M5 School Application E2E Acceptance Contract](./PHASE13_POST_M5_SCHOOL_APPLICATION_E2E_ACCEPTANCE_CONTRACT_2026_10_31.md). This execution plan does not amend or waive that contract.

## 1. Objective, interpretation and non-goals

Run ONE independently gated engineering acceptance campaign across actual Project (M1), governed documents/facts (M2), Education Intelligence (M3), professional-service guards (M4), and School Applications/Admissions (M5.1/M5.2). Replace M5.3's shared in-memory proof with a single fresh isolated PostgreSQL 17, real application service/repository adapters, authenticated local HTTP calls and a real local browser. Re-evaluate inherited M4 failures without silently converting failed or unverified historical evidence to PASS.

This is an **acceptance stage**, not M5.4, M6, a production launch, a live school submission, or permission to simulate genuine credentials/signatures/payments/provider receipts. A successful synthetic test may establish *internal engineering correctness* only. Source law/school provenance and independently authenticated external providers remain separate release gates.

No code, migration, schema, AWS, Stripe, S3, customer-data, live-provider, paid-LLM or feature-flag change is approved by creating this plan. Existing normal/staging/production flags stay OFF and unverified professional/payment/provider authority remains DENY/UNKNOWN/NOT_READY.

## 2. Work organization — two bounded work orders, not 18 micro-milestones

**Work Order A: G0 evidence-freeze and authorization packet (READ-ONLY; next action).**
- Inspect current GitHub code, AGENTS.md, migration journal/0044–0047 hashes, exact package scripts, service/HTTP entrypoints, project authorization resolvers and M4 logs/records. Record observed remote HEAD and whether an owner-local worktree can be proved clean; do not infer local status from GitHub.
- Inventory prior accepted reference counts, **not new test results**: M5.1 offline 58 and isolated PG 9/9; M5.2 offline 88 and isolated PG 6/6; M5.3 offline 30 and default test:unit 1222. Preserve 44 legacy TypeScript diagnostics separately.
- Freeze an E2E-01…18 machine-readable scenario manifest: fixture graph, preconditions, expected state/result, provenance grade, negative/positive status, DB/HTTP/browser observation, required audit/revision assertion, timeout and retry ceiling, stop condition.
- Recover all five actual M4 final failures (INT-06/07/12, DB-01/02), original 12 subcase failures of M4-005 Stage 3B **from their real sanitized source logs**, six old M4-005 journal assertions, and the missing real-authority paths. If the original 12 subcase names/logs cannot be located, record MISSING_EVIDENCE / UNVERIFIED rather than guessing.
- Identify deterministic ports/stubs for external M2/M3 catalog/source, lawyer-credential verifier, signer, payment attestation, provider APIs and paid model. Do not add bypasses to production authorization code.
- Submit one explicit G1–G4 operator authorization request: disposable PG image/port/DB/role/credentials handling, localhost frontend/backend, isolated browser, synthetic identities/documents, exactly permitted feature flags **inside that sandbox**, network egress=disabled, bounded runtime/retry, evidence retention and cleanup policy.
- **Deliverables** (documentation only): a frozen manifest, historical-failure ledger, code/runner inventory, real-vs-synthetic proof matrix, and owner-approval checklist. No database/network/browser execution under Work Order A.

**Work Order B: G1–G4 integrated execution and G5 reporting (NOT AUTHORIZED YET).**
After G0 review and one scope-specific owner approval, use one cohesive coding/operator task with a single stable test manifest and no feature-development detours. Implement only necessary test harness/fixtures, execute the approved G1→G4 gates in one bounded campaign, collect reports, and perform G5 independent review. Any material product/security failure stops the affected gate; propose a narrow correction only after separate owner decision.

## 3. Gate-by-gate operational sequence (controlling contract G0–G5)

| Gate | Required execution evidence | Exit decision |
|---|---|---|
| **G0: preflight** | Code SHA, migration/scripts inventory, frozen E2E-01…18 and M4 ledger, deterministic fixture design, environment/auth plan, explicit approvals requested | PLAN_REVIEW_READY; **not** TEST_PASS |
| **G1: disposable environment** | Newly created *distinct* loopback-only PostgreSQL 17 cluster with empty schema, non-superuser role, no old roles/DB, no external volume, both POSTGRES_URL/DATABASE_URL pinned to disposable URL, migration journal through 0047 (expected 48 records if unchanged), pinned 0044/0045 hashes, 0046/0047 SQL guards | ENVIRONMENT_VERIFIED or BLOCKED |
| **G2: real integrated services** | Real production M1→M5.2 adapters wired to **one shared isolated DB**; authenticated Next.js HTTP, controlled stubbed external ports, exact owner/member/Project scope, record/event and constraint assertions; required negative requests | Per-E2E PASS/FAIL/UNVERIFIED; no mock-only promotion |
| **G3: browser** | Real local Playwright/browser session, zh-CN/en, three applications, course/intake distinction, package→case→confirmation, Offer/CoE, Self/Managed, failures, keyboard/mobile, feature-OFF behavior; sanitized screenshots/traces | Actual interactive UI evidence, not SSR markup |
| **G4: historical M4 and adversarial** | Fresh independent approval fixture for INT-06, its own revoked-authority fixture for INT-07, defined NOT_READY/UNKNOWN precedence for INT-12, dynamic DB invariant probes for DB-01/02, original M4-005 12-case replay, six journal assertions, mixed-module revocation/concurrency; independent results | Every inherited failed ID adjudicated, no silent renaming |
| **G5: report / decision** | Final ledger, per-layer provenance, environment fingerprint, exact SQLSTATE/revision/audit proof, all attempts/timeouts/skips, external authorities marked UNVERIFIED, independent reviewer conclusion and separately approved cleanup proposal | E2E_ACCEPTED_WITH_LIMITATIONS or E2E_BLOCKED; never production READY |

G1 must use a fresh container/port **not** 5432/5433 or earlier M4/M5 disposable instances. Do not call local host authoritative immigration_legal, normal chatbot DB or cloud resources. Hash/catalog evidence must come from the new actual test target. Only disposable sandbox feature flags may be enabled with specific authorization.

## 4. Scenario grouping and minimal end-to-end journeys

Keep canonical IDs, expected states and complete assertions from the controlling contract. Organize execution for efficiency, without dropping a case:

- **Application and evidence lifecycle:** E2E-01 (three school applications), 02 (exact package→case→confirmation), 03 (M2 fact/permission change then v2 recovery), 04 (forbidden document/reference), 11 (CAS/idempotent replay), 12 (archived/stale).
- **Admission outcomes and service modes:** E2E-05 (existing Offer/CoE route), 06 (versioned Offer outcome), 07 (claimed versus verified CoE), 08 (Self-Service customer report), 09 (Managed deny-only readiness).
- **Authentication, UX and operational guards:** E2E-10 (revocation/closure/guest/owner), 13 (actual bilingual/browser workflow), 14 (0044–0047 migration and authority), 18 (bounded runner, clean sessions and audit).
- **Professional and payment boundaries:** E2E-15 (exact-version review), 16 (staff/engagement/revocation race), 17 (contract/conditional payment/signature, correction and reversal). These remain synthetic or deny-only while real authority adapters are unavailable.

**One positive internal chain** must use the same real Project and DB identity throughout: owner creates Project → three independent SchoolApplications → authorized M2 reference → immutable M5.1 package v1 → M5.2 AdmissionCase → preparation/confirmation v1 → upstream reference or permission change → v1 becomes stale → refusal to reconfirm v1 → new valid package/preparation v2 → confirmation v2 with immutable history. A separate Self-Service customer-reported action is not a school receipt. Managed readiness with unavailable professional/finance/provider authority is expected **NOT_READY/UNKNOWN**, never READY.

**Privacy negatives** must prove members cannot read another creator's private school case; no cross-Project/customer document leakage; revoked and closed states deny protected actions; mere possession of a Project/document reference never grants AI-use or staff disclosure; guest/staff roles cannot bypass scope. Assert zero unauthorized DB mutations, and do not expose hidden fact conflict payloads.

## 5. Historical M4 remediation proof: separate verdict ledger

The M4 final original run was **12 PASS / 5 FAIL**. Its read-only diagnosis suggested test fixture sequencing, fixed-count assertions and precedence mismatches, but diagnosis **does not itself convert any FAIL to PASS**.

| ID | Required new independent exercise |
|---|---|
| M4-FINAL-INT-06 | New request: requested→in_review→approved; exact target package version and hash persisted; never reuse changes_requested fixture |
| M4-FINAL-INT-07 | Independently approved synthetic request, then assignment or professional authority revoked; validity/readiness invalidated |
| M4-FINAL-INT-12 | Freeze precedence for NOT_READY versus UNKNOWN and prove neither creates stale READY |
| M4-FINAL-DB-01 | UPDATE and DELETE rejected with actual SQLSTATE; invariant counts evaluated against own pre-test baseline, no hardcoded reused fixture count |
| M4-FINAL-DB-02 | Revision skip, target rebinding and illegal transition all rejected; unchanged head/revision and audit chain |
| M4-005-STAGE3B | Independently enumerate/replay **all 12 old failures** from actual sanitized logs (29/41 original), including bounded timeout/clean exit; no invented subcase content |
| M4-005-OFFLINE-JOURNAL | Reconcile six stale journal assumptions against current additive head; never weaken payment conditions |
| M4-CROSS-MODULE | Fail-closed signer, payment, credential, customer authorization, exact-package review, real provider and service entitlement |

A test-harness correction may change fixture isolation or assertion mechanics only when the original business contract is unchanged and historical evidence remains attached. Any missing original M4-005 raw evidence yields explicit UNVERIFIED/BLOCKED classification under the controlling acceptance criteria.

## 6. Result records and stop rule

For every case write: scenario_id; original status if historical; immutable baseline code SHA; exact fixture/actor/project IDs in sanitized form; expected state; observed state; DB/HTTP/browser evidence pointers; authority_grade (real_internal / synthetic_test_only / external_unverified); audit/revision/constraint proof; execution attempt; timeout; outcome (PASS/FAIL/SKIP/BLOCKED/UNVERIFIED); reviewer verdict.

Do not treat a passing unit mock as real SQL, a passing SSR render as Playwright, a customer-uploaded CoE as provider verification, or a synthetic professional decision as a genuine licensed lawyer approval.

**Hard-stop classes:** cross-owner data leak, unauthorized mutation, stale READY, a false provider/Offer/CoE/legal conclusion, DB migration targeting the wrong cluster, unbounded retries/connections, hidden skips, or any unapproved external access. Record the first failure and propose one bounded diagnosis; no automatic fix/rerun spiral. A required internal case that cannot be run is BLOCKED, not success. External certification can remain UNVERIFIED after a genuinely complete *internal* E2E run. LIVE_PRODUCTION_NO_GO remains for every outcome.

## 7. Explicit authorization still required

This plan approves **repository documentation only**. Owner must separately and precisely approve: (i) a newly created disposable PostgreSQL cluster and migration to 0047, (ii) synthetic localhost web/backend services and deterministic provider ports, (iii) Playwright/browser execution, (iv) test-only enablement of explicitly named project/admissions flags confined to that disposable environment, (v) bounded execution parameters and sanitized evidence retention, and (vi) cleanup/disposal after review. Prior authorizations for M4/M5 test containers are not reusable.

Until then, **immediate next task is G0 read-only evidence-freeze and authorization packet**. G0 produces a report and owner approval request; it does not execute migrations, Docker, HTTP servers, browsers, code changes, tests, or provider calls.

## 8. Repository workflow and start prompt for the next coding-agent task

Read AGENTS.md, docs/agent-memory/CURRENT_HANDOFF.md, PROJECT_STATE.md, CURRENT_MILESTONE.md and the two Post-M5 files (the controlling contract and this execution plan). Verify current branch, HEAD, working-tree status, migration journal and package scripts against Git first. For the G0-only task, inspect source and historical reports read-only, freeze the 18-scenario ledger and M4 raw-failure inventory, and return one bounded environment proposal plus sanitized evidence manifest. Do not modify runtime/test code, DB, AWS, Stripe, feature flags or the accepted M5 source. Do not mark G0 complete unless its deliverables actually exist. Subsequent G1–G4 implementation/execution requires a **new explicit owner approval**, followed by cumulative patch, independent review, owner local verification and remote SHA readback.

The handoff and current-state docs may point to this plan without repeating it. Earlier dated records remain historical truth and the October 31 M5 closeout remains the accepted code baseline.
