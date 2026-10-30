# Phase 13 M5.3 — Integrated Offline Engineering Acceptance: One Cohesive Contract

**Prepared:** 2026-10-31 (Australia/Sydney)  
**Baseline branch:** `phase13-m5-school-admissions`  
**Accepted code:** M5.1 `e0b4be5df1eccb2b131af10b3f8c55ae580c5b56`; M5.2 `f5120534d3e5df89c8ff3eeadb52607f75f5e54b` plus this documentation-only checkpoint  
**Disposition:** `M5_3_CONTRACT_PREPARED_NOT_DISPATCHED / LIVE_PRODUCTION_NO_GO`.

## 1. Purpose, precedence and stop conditions

This is the **third and final internal M5 milestone**, not a new functional development sprint. It must prove the **accepted M5.1 SchoolApplication foundation and M5.2 SchoolAdmissions workflow work together as one Project-scoped customer journey**, by exercising real accepted service/API/client integration points and fail-closed production adapters instead of merely combining independent mock unit-test summaries.

Before execution read `AGENTS.md`, `docs/agent-memory/CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md`, `DECISIONS.md`, the accepted M5 integrated plan, both M5.1 and M5.2 engineering closeouts and actual code/contracts; the M4 final closeout and owner deferral to distinct post-M5 School Application E2E. Historical paragraphs in existing handoffs are dated evidence, not current authorization. Verify branch/HEAD/clean worktree; do not merge/rebase/reset/force-push or edit accepted baseline casually.

M5.3 **does not** certify real school submission, live identity/credentials, payments, lawyers or migration law. It is an integrated offline engineering acceptance stage with explicit production deny-only boundary. Subsequent **post-M5 school-application E2E** is separate; do not renumber M0–M10 or add a fourth M5 development milestone.

## 2. Deliverable: one integrated testable user journey

Build a **minimal deterministic cross-module acceptance harness**, synthesizing three distinct creator-owned M5.1 SchoolApplications in one StudyJourneyProject, each with independent identity, course/intake, source status, M2 opaque reference/permission freshness, package version/hash, and an M5.2 Admission Case. Call **actual accepted service implementations**, app/client wiring, and repositories where permissible. Stub only external M2/M3 providers, identity verifiers, LLM and M4 deny-only adapters at explicit contract ports. No test-only bypass of authorization, snapshot or actual production defaults.

Business scenarios to demonstrate end to end:
- Three simultaneous schools in one Project and same-school different course/intake; no accidental cross-application package/revision, reference, Offer or case binding. Repeated independent customer interactions must preserve creator/Project scope.
- M5.1 application creation → bind M2 references → build immutable M5.1 package → M5.2 customer selects the actual M5.1 `applicationId` → create admission case → generate checklist/provisional preparation → confirm current version → record truthful Self-Service external action (customer-reported, no receipt) OR choose Managed and evaluate fail-closed readiness. Reuse real API/service results rather than a manually re-created domain mirror.
- Existing Offer, existing CoE and claimed-exception entry routes without synthetic dummy application IDs; direct CoE/Offer provenance labels must remain unverified unless legitimate authority exists.
- Add/replace Offer/CoE and claim Exception: exact-version transitions and historical supersession; archived/stale application cannot remain an operationally current ready package; current snapshot invisibility and invalidation reflected consistently across M5.1→M5.2.
- First confirmation, changed source/fact/permission/application/package, stale preparation refusal, new preparation v2 and v2 reconfirmation; preserve append-only history, no backward/NULL acceptance. Source changes and permissions must be reflected through actual interfaces.
- Customer Self vs Managed remains separate across UI/action/API service and repeat/replay: VIP never conveys managed authority; unknown professional credential/signature/payment/staff assignment/protected-resource grant, provider or M4 readiness always `UNKNOWN`/`NOT_READY`/DENY.
- Revoked membership, Project closure, changed ownership or another member's application/case, generic staff membership and cross-Project/guest requests must not disclose protected content or commit a forbidden mutation.
- Exact authored idempotency replays; altered authored payload with same operationId conflicts; CAS/concurrency winners, durable event/history integrity and transaction rollback. Tests should cover both previous M5.1 and M5.2 transition boundaries, not only isolated module-level ones.
- Bilingual zh-CN/en client and API response mappings: application select, evidence-backed Offer/CoE, provenance/unknown, Archived/Source-stale indicator, service-mode switch, validation/error/disclosure and OFF/503 behaviour; no false provider status. Integrate reasonable local UI tests; browser/Playwright runs only when the local environment and its boundaries are separately authorized.

## 3. Test methodology: genuine cross-module evidence, not mock victory

- One cohesive `chatbot` acceptance suite (e.g. `test:phase13:m5-3:offline`) that instantiates accepted M5.1/M5.2 services against connected in-memory test stores and shared authorized reference/catalog adapters. Ensure case list/ownership uses actual M5.1 service, rather than separately constructed canned case fixtures.
- Exercise current HTTP handlers and client transport where practical with test sessions, at least one continuous Project→SchoolApplication→AdmissionCase→Preparation→Outcome path. Preserve in-memory versus real PostgreSQL boundary honestly.
- Define and freeze the minimum end-to-end scenario matrix **before** running it; expected `UNKNOWN`/`DENY` is a passing safety expectation, not coverage of real provider readiness.
- Cross-module tests should detect schema/journal drift `0046`/ `0047`, shared package identity/hash, source and permission invalidation, request idempotency and concurrency. Reuse 0046/0047 migrations unchanged; add only narrowly justified **test/harness** code or compatibility fixes for real demonstrated blockers, not new business features or a new migration by default.
- Preserve all existing M5.1 `58` focused and M5.2 `88` focused test suites, M4 frozen-contract regressions and broad `1192` baseline `pnpm test:unit` (numbers are historical starting evidence, not assumed future counts).
- Report cross-module offline tests separately from module unit tests, isolated DB tests, browser, CI, full TypeScript and real external services. No hidden skip or claim all 44 legacy TypeScript errors are resolved.

## 4. Acceptance evidence matrix (freeze these expectations)

| ID | Integrated scenario | Minimum expected outcome |
| --- | --- | --- |
| I-01 | Project + three independent M5.1 applications → M5.2 cases | Unique creator-private identities; each M5.2 case binds its own permitted application |
| I-02 | Authorized references, sourced school identity → exact M5.1 package → preparation | Correct current hashes and provenance; no unsupported official assertion |
| I-03 | Source/fact/document/grant changed after preparation | Dependents stale/not usable, exact-version reconfirmation required |
| I-04 | Old and new Offer/CoE and standalone pathways | Historical versions preserved, customer report never provider-confirmed |
| I-05 | Existing Offer/CoE or claimed exception without application | No invented school application, receipt or verified exception |
| I-06 | Self-service reported external action | Mandatory acknowledgement and `customer_reported` status only |
| I-07 | Managed mode with missing M4 authorities | `NOT_READY`/`UNKNOWN` and `submissionState=not_connected`; no secret permission |
| I-08 | Revocation, cross-member, cross-Project, staff/guest, closed Project | No read disclosure or forbidden mutation; fail closed |
| I-09 | Exact replay, changed-payload conflict, concurrent update | Deterministic result/one winner; no duplicate current rows, operations or events |
| I-10 | Archived application and historical package/outcome | Historical data retained but not operationally usable/current |
| I-11 | Bilingual UI/HTTP contract, disable/absent-schema fallback | Meaningful available/disabled/unknown states, no broken normal Chat |
| I-12 | All freeze/negative regressions and evidence classification | Separate PASS/FAIL/SKIP, no silent M4 deferred PASS or provider certification |

If an acceptance scenario cannot be executed honestly in the permitted offline environment, label **UNVERIFIED/DEFERRED**; never mark PASS from a synthetic-only assertion that does not test the claimed boundary.

## 5. Operational and privacy/security boundary

The owner-authorized M5.1 isolated PG `immigration_ai_phase13_m5_1_test` and M5.2 `immigration_ai_phase13_m5_2_test` acceptance runs were separate limited gates and **do not authorize** M5.3 DB access, application migrations, data fixtures in existing clusters, real customer data, browser automation to provider sites, live LLM/AI APIs, AWS/S3/Stripe, external school APIs, partner email, signing/payment/credential activation, deployment or feature flags. Newly enabled real PostgreSQL or browser validation requires another explicit owner instruction and disposable-target verification.

The production default for `PHASE13_SCHOOL_APPLICATIONS_ENABLED` and `PHASE13_SCHOOL_ADMISSIONS_ENABLED` remains OFF. M4 professional, engagement, signature, payment, source disclosure and managed-handoff authority guards are frozen; even an integrated offline PASS never authorizes `READY` or real submission.

Do not rewrite migration 0046/0047 because of cosmetic truncated identifiers. Do not conflate project membership with private school application ownership; M2 factual reference / AI-use / staff-access are independent permissions.

## 6. Scope, outputs and verdict

**Single bounded task:** Author connected integration tests/harness and at most minimal regression repairs proven necessary for accepted M5.1/M5.2 cross-module compatibility. Avoid new application features, schema/migration changes and unbounded micro-rounds. No commit/push unless separately approved. Stop before M6 and post-M5 E2E.

At completion provide: changed paths, frozen scenario matrix outcomes I-01…I-12, exact tested service/HTTP/client boundaries, security negative evidence, focal unit and broad regression results, immutable package/revision/invalidation evidence, which code paths genuinely used versus stubbed, TypeScript diagnostics delta from known 44, explicit DB/browser/CI/provider SKIPs and recommended `M5_3_OFFLINE_ACCEPTED_WITH_LIMITATIONS` or `M5_3_BLOCKED`. Include one cumulative review Patch and SHA-256; record known deferred M4 INT-06/07/12, DB-01/02 and M4-005 payment cases separately.

**Prepared, not executed or dispatched by this document.**
