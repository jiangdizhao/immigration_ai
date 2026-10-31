# Phase 13 — Independent Post-M5 School Application End-to-End Acceptance Contract

**Contract prepared:** 2026-10-31 (Australia/Sydney)  
**Stage:** `POST_M5_SCHOOL_APPLICATION_E2E` — **separate from M5.1/M5.2/M5.3, not M5.4 or M6**  
**Owner-pushed code baseline:** `433f0f3bf83ed8505675b2d164e07b138dbc72f4` (`phase13-m5-school-admissions`); later docs-only checkpoint does not change code  
**State:** `CONTRACT_PREPARED_NOT_EXECUTED / OWNER_EXECUTION_AUTHORIZATION_REQUIRED / LIVE_PRODUCTION_NO_GO`.

## A. Why this gate exists and exactly what it can prove

M5 has completed internal engineering with limitations. Its unit/in-memory and separate repository-level disposable PostgreSQL successes are not one real runtime/HTTP/DB/browser end-to-end pass. M4 was accepted as an engineering baseline **with actual failed assertions** and unsafe-to-claim professional, signature, payment and provider authority unavailable. The Post-M5 gate must determine, on an isolated full local system, whether these layers cooperate under real interfaces and hard negative security rules.

The requested result is **engineering E2E acceptance evidence**, not actual school submission permission or verification of third-party credentials, payments, signatures, legal visa eligibility or provider receipts. Every positive scenario must document whether it was real internal code/DB, synthetic approved test authority, or independently authenticated external authority. In the presently unconnected production adapter configuration, `READY`, signed/paid/verified and provider-confirmed claims remain prohibited. No conditional positive-path expectation can require an unauthorized production identity/payment/provider to be fabricated.

**Source precedence:** `AGENTS.md`; actual code/migration/authority guards; [M5 full closeout](./PHASE13_M5_COMPLETE_ENGINEERING_CLOSEOUT_ACCEPTED_WITH_LIMITATIONS_2026_10_31.md); [M4 owner deferral](./PHASE13_M4_BASELINE_ACCEPTED_M5_DEFERRED_E2E_2026_10_30.md); [M4 final closeout](./PHASE13_M4_FINAL_CLOSEOUT_2026_10_30.md); M5.1/M5.2 individual closeouts and M5.3 integrated contract. Historical dated 'next' paragraphs are superseded by latest closeout status only, never historical failure evidence.

## B. Authorization and environment gates — contract itself grants NO execution

**Before any test execution** obtain an **explicit separate owner instruction** covering exact approved E2E operations: target isolated database/container, migration scope, loopback Next.js/FastAPI test servers, browser automation and synthetic test fixtures; whether any local model/network providers can be contacted (default: NONE), test timeout/retry limits, evidence retention and cleanup. Authorization for earlier M5.1/M5.2 disposable PostgreSQL tests does **not** transfer. An owner approval to draft or freeze this contract is not authorization to connect to any database.

### Gate G0 — Evidence freeze / preflight (documentation and read-only repo inspection)

1. Verify `phase13-m5-school-admissions` at expected approved HEAD; clean worktree, commit ancestry, exact installed lockfile, migration journal and `AGENTS.md`.
2. Inventory current test scripts and migration guard; record stable baseline `M5.1 58`, `M5.2 88`, `M5.3 30`, `test:unit 1222` PASS as **prior reported reference counts** only.
3. Freeze complete E2E case IDs, input fixtures, expected result/state, negative-or-positive rationale, authority source, timeouts and exact permitted retry count **before running**. Maintain a machine-readable result ledger with `scenario_id, preconditions, expected, observed, evidence, status, attempt, verdict`.
4. Review preserved M4 logs/failures; do not revise historical baseline to PASS. Verify guards and isolate unapproved third-party paths.
5. Submit precise environment plan for owner authorization; no server/DB/browser start under G0 alone.

### Gate G1 — New disposable runtime and database (separate explicit approval)

- **Never touch** host PostgreSQL 17 `127.0.0.1:5432/immigration_legal`, stale 5433, existing M4/M5.1/M5.2 acceptance containers, staging/production databases or real customer data.
- Provision a **fresh** disposable PostgreSQL 17 cluster, private loopback binding on a new non-5432/5433 host port, tmpfs-only or otherwise proven ephemeral storage, distinct DB/role not equal to authoritative ones, non-superuser role, tightly permissioned temporary credentials, restart disabled and no external volume. Record container/image/digest, network binding, cluster system identifier, effective role, `current_database()`, `inet_server_port()`, empty starting schema and absence of authoritative role/DB before migration.
- Isolate env loading: `POSTGRES_URL` and `DATABASE_URL` must **both** equal verified disposable URL; reject accidental `.env.local` authoritative URL overrides. Use project migration operator with database-name acknowledgement and exact journal/hash checks. Expected head is migration `0047_phase13_m5_2_school_admissions`, 48 ledger entries if approved code remains unchanged; inspect actual journal before assuming counts.
- Verify exact 0044/0045 historical SHA-256 invariants (`d90ebf497dd049cb4f6fc221d2129639714028849a819e7dbb6e5b32a6146f0e`, `1f50752a19df80a538ce50a58e47d852c3373881a133bb3ebe3e556fff8f11ac`) and additive 0046/0047 constraints, schema snapshot/checks, partial current indexes, deferred supersession self-FKs, forward-only confirmation and least-privilege table access.
- Run real local web/API services **only** with synthetic Project/customer/staff identities, isolated environment variables, loopback listening ports and all providers disabled or deterministic stubbed behind typed ports. No live emails, payments, credentials, S3, Stripe, AWS, school APIs, lawyer accounts or paid LLM.
- Feature flags for this disposable execution may be enabled **only if explicitly authorized for that exact sandbox**; ordinary dev/staging/prod configuration stays OFF. No automatic enabling through this contract.

### Gate G2 — Real internal service + HTTP + database integration

Exercise actual M1 Project membership/closure, M2 read paths, M3 review/provenance, M4 permission/readiness guards, M5.1 + M5.2 **production service/runtime adapters** against the **same approved isolated PostgreSQL**, not dual separate in-memory M1 fixture states. Test actual authenticated Next.js HTTP entrypoints and controller transport, with positive and negative identities and a reproducible seeded fixture graph. Where production M2/M3 live source values or external authority cannot be enabled safely, assert **explicit unavailable/unknown** semantics and mark corresponding positive data assertions UNVERIFIED rather than creating fictitious certified evidence.

Each required E2E case below must use an independently fixture-isolated Project/matter or intentional explicit sharing, and must assert DB state, UI/API observable state and audit events where applicable.

### Gate G3 — Local browser experience (explicitly authorized)

Test zh-CN/en customer UX in a local isolated browser (e.g. Playwright) with real navigation, interactive selects, authentication boundary, validation and async state changes, keyboard/accessibility focus and error/feature-disabled states. Include at least three school applications, M5.1→M5.2 binding, valid/invalid document evidence, Self/Managed, existing Offer/CoE and archive/source-currentness. **Server-rendered component markup is not a browser E2E pass.** Capture screenshots/traces without secrets, raw document contents, user personal data or provider tokens. Check no false school receipt, verified CoE, legal eligibility or professional approval text.

### Gate G4 — Historical M4 failure replay and protected-authority hard negatives

Replay inherited failed M4 IDs and payment suite independently from M5 scenario fixtures. Split product-rule violations, test-data contamination, test-runner/cleanup defects and truly unavailable external authority. A corrected test harness is acceptable only when the frozen business expectation remains intact and full failure evidence retained.

### Gate G5 — Decision, report and cleanup proposal

Consolidate all test results and evidence. No automatic remedial patch loop. If a genuine product/security defect occurs, preserve minimal reproduction and stop the affected gate; propose one bounded correction decision separately. **Do not** dispose of any pre-existing acceptance environment. New disposable environment cleanup requires explicit owner instruction, with logs/hashes retained in sanitized form.

## C. Required E2E scenario matrix (freeze each expectation before execution)

| ID | Boundary and scenario | Required evidence and conservative outcome |
| --- | --- | --- |
| E2E-01 | One Project; ≥3 customer-owned schools, including same institution/different course or intake | Real DB IDs/revisions and UI/HTTP identity correct, independent Case/Package; another member cannot read private applications |
| E2E-02 | Authorized reference/document/source → M5.1 immutable package → M5.2 Case → preparation → confirmation | Exact package ID/version/hash, application revision, provenance and currentness through actual DB+HTTP; unsupported catalog facts stay unverified |
| E2E-03 | M2 reference/fingerprint or permission changes after v1 confirmation | v1 becomes stale; stale action refused; rebuild usable package and prepare/confirm v2 when authorized; both histories retained |
| E2E-04 | Revoked, unsafe, missing, foreign-project, cross-uploader M2 document | No unauthorized evidence attachment or read; document-backed unverified cannot become provider-confirmed |
| E2E-05 | Standalone existing Offer/CoE/exception entry with no M5.1 application | No fabricated school application, institutional receipt, waiver or Student 500 eligibility |
| E2E-06 | New Offer lifecycle, expiry and version supersession | Correct forward/terminal transitions, date uncertainty, one live outcome/version, rollback and source classification |
| E2E-07 | CoE claimed vs document-backed obtained, conflicting/expired provenance | Clearly distinguish customer report from clean authorized document and genuine provider verification (unavailable); no visa readiness |
| E2E-08 | Self-Service customer-reported external action | Real UI acknowledgement, provenance `customer_reported`, `verified=false`, no provider receipt or professional endorsement |
| E2E-09 | Managed route exact M4 target and package, unknown authorities | Managed `NOT_READY`/`UNKNOWN`, `submissionState=not_connected`, never synthetic production READY; VIP no entitlement |
| E2E-10 | Project closure, membership/owner/staff/guest revocation across all modules | Real shared DB authority + HTTP denies reads and writes; no leaked documents/operations/audit side effects |
| E2E-11 | Concurrent CAS, exact operation replay and changed-payload conflicts | One-winner guarantees where contract requires, no duplicate current packages/outcomes, exact revision/audit/operation integrity |
| E2E-12 | Archived application, stale package, stale confirmation, deleted/missing source | History visible only to authorized creator, no current usability or managed-ready escalation |
| E2E-13 | zh-CN/en real browser workflow, navigation, mobile/keyboard and API errors | Actual interactive UI, correct messages and error statuses; flag OFF/503 fallback; normal Project/Standalone Chat unaffected |
| E2E-14 | Migration 0044–0047 + database guard and fail-closed provider boundary | Fresh isolated PG catalog, ledger and least-privilege validation; no uncontrolled external call/secret exposure |
| E2E-15 | M4 professional review under exact-package binding | Only independent authorized test-credential path may produce synthetic approval; production-unavailable authority must remain denied |
| E2E-16 | Revocation/race with staff assignment, engagement, disclosed resources and confirmation | Re-evaluate at use time, deny stale approvals and concurrent revocations; no stale READY |
| E2E-17 | M4 contract payment/signature evidence and undo/correction | Test-only evidence accurately labelled; no fabricated finance/signature authority; reversal/invalid state blocks submission |
| E2E-18 | Operator-safe rollback/runner termination and audit cleanup | No unbounded retries, no idle-in-transaction, correct exit code, zero hidden SKIP, sanitized logs and consistent residual DB invariants |

These E2E-01–18 scenarios are **proposed test contracts** and are **NOT currently passed or executed**. They do not replace the named M4 failure IDs below, which require independent explicit verdicts.

## D. Mandatory inherited M4 failure ledger — every ID must get its own verdict

These are **actual historical failures**, not proposed hypothetical regression tests.

| Required historical ID | Preserved baseline and likely failure mechanism from M4 closeout | Mandatory new proof / classification |
| --- | --- | --- |
| `M4-FINAL-INT-06` | Exact target version/hash approval test failed after reuse of a `changes_requested` review fixture | Independent new review request → in_review → approved path, exact target/package version+hash persisted; distinguish synthetic test authority from real lawyer credentials |
| `M4-FINAL-INT-07` | Dependent on absent approved record in INT-06 | Independently seeded valid *test-only* approval, then revoked assignment/professional authority invalidates readiness/review; no stale approval |
| `M4-FINAL-INT-12` | Concurrent revision expected `UNKNOWN` but observed fail-closed `NOT_READY` | Freeze precedence semantics before run, assert no stale READY/authority; if `NOT_READY` is valid under documented priority, make a **transparent** contract decision, not a silent expectation change |
| `M4-FINAL-DB-01` | UPDATE/DELETE negative append-only probes rejected as intended, final hardcoded row count diverged | Independent UPDATE and DELETE rejection with SQLSTATE/constraint evidence; dynamic baseline/post-run row and audit-chain invariants |
| `M4-FINAL-DB-02` | Illegal transition/rebinding/revision-skip rejected, fixture-head constant mismatched | Each illegal transition denied, unchanged head/revision and replay/audit effects; no test-global fixture-head constant |
| `M4-005-STAGE3B` | 29 PASS / 12 FAIL, exit 124/timeouts/cancellations | Explicit case-by-case 12 failure inventory from actual old logs before execution, permission/contractual payment positive and deny-only negative paths, reversal/refund/correction/invalidation, clean termination |
| `M4-005-OFFLINE-JOURNAL` | Six historical journal head/entry count assertions stale after additive 0045 | Validate current additive journal/head in isolated fresh cluster, change **test metadata** only when justified; preserve payment authority constraints |
| `M4-CROSS-MODULE` | Real professional credential, signature/payment verifier, customer confirmation and institutional receipt provider not approved | Cross-module deny-only checks, exact-package invalidation and missing/revoked disclosure; cannot retire external-authority blocker from synthetic evidence |

**Mandatory treatment:** At G0 create a per-case ledger with `historic_status=FAIL/UNVERIFIED`, previous evidence, exact frozen expected behaviour, target new test name, new actual status, log/trace/SQL evidence pointer and independent adjudication. For `M4-005-STAGE3B`, enumerate the original 12 failing subcases from the raw sanitized historical report **before** declaring comprehensive coverage; if the evidence is absent, mark `UNVERIFIED`, never assume their content from the summary 29/41 alone.

## E. Security and data-integrity acceptance criteria

1. **Privacy:** no cross-customer, cross-Project, cross-owner, staff/guest or revoked-resource read/writes; Project membership alone cannot bypass creator-private boundaries; no raw document content/keys in outbound model/provider paths without explicit permission.
2. **Authority:** no READY or real submission/receipt/signature/legal approval when credential, engagement, customer acceptance, staff assignment, protected-resource grant, exact-package review, contractual payment and provider authority are not independently available. VIP cannot substitute any of these.
3. **Provenance:** customer-reported and document-backed unverified Offer/CoE are never represented as official; no fabricated immigration/Student 500 eligibility.
4. **Currentness:** precise package version/hash, approved review, source/document access, revocation and latest version must be rechecked immediately before protected operation; no TOCTOU permission gap.
5. **DB correctness:** CAS one-winner when required, exact authored-request replay, unique live rows, immutable audit, deferred supersession FK commit validity and confirmation-forward-only guarded at actual PG17 transaction boundaries.
6. **Operational:** zero hidden skips for mandatory cases; timeouts and cancellations reported as failures; offline network/service isolation, loopback only, least-privilege role, sanitized logs, bounded test runner and clean connection shutdown.

## F. Acceptance outcomes, stopping rules and provenance of result

- `PREPARED_NOT_AUTHORIZED`: this contract and documentation exist; **no execution**.
- `E2E_EXECUTED_PENDING_INDEPENDENT_REVIEW`: permitted test run completed with raw scenario matrix, sanitized logs, environment proof, gaps, and unmodified historical ledger.
- `E2E_ACCEPTED_WITH_LIMITATIONS`: all mandatory, authorized **internal/synthetic** E2E scenarios plus inherited M4 replays meet frozen safety/business expectations; any untestable external authority is separately classified **UNVERIFIED**. This does **not** mean real provider/legal/payment production eligibility.
- `E2E_BLOCKED`: any mandatory internal security/data-integrity failure, missing required M4 replay, unexplained skip/timeout, unapproved DB/provider access or inability to verify minimum real production code+DB integration. Partial coverage must be reported with precise failed and deferred IDs; do not mark accepted.
- `LIVE_PRODUCTION_NO_GO` continues in every above state unless separately approved real-world compliance, credential/signature/payment/provider, deployment and migration gates are fully satisfied in a different release decision.

**Hard stop:** Do not auto-fix or run a new round of tests after any material FAIL without a discrete owner decision. Separate **test-harness defect** from production defect; preserve the first failing case and logs, no silent expectation rewrites. No deployment, live school/provider API, Stripe/AWS/S3, legal/customer data, new paid model use, customer contact, professional signing/charging, or existing database migration may be inferred from this contract.

## G. Required deliverables if and only if execution is later authorized

1. Frozen test-plan manifest: exact code SHA, fixture identity, E2E IDs+M4 IDs, initial expected statuses, harness, environment permission, watchdogs, rollback and cleanup.
2. Read-only identity baseline and **separately approved** new disposable PG17/runtime/browser setup evidence, access rules and migration hash catalog.
3. Per-scenario machine-readable ledger and human-readable report with `PASS/FAIL/SKIP/BLOCKED/UNVERIFIED` and test-layer labels (real SQL / real HTTP / actual browser / synthetic authority / external not run).
4. Original M4 failure evidence plus independently labeled new M4 replay results; enumerate M4-005's twelve previous failed subcases from preserved logs rather than inventing them.
5. Sanitized SQLSTATE/constraint/audit/transaction/revision proofs, browser screenshots/traces, clean runner exits and no-data-leak checks.
6. Explicit limitations, release NO_GO status, minimal root causes for failures, and narrow proposed remediation only if owner authorizes.
7. One independent review verdict; afterward obtain **new**, scope-specific authorization for any repair, production rollout, real-provider approval or cleanup.

**This document is a planning/acceptance contract, not execution authorization.**
