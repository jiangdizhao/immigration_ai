# Phase 13 — Post-M5 School Application E2E: Independent G5 Review and Final Closeout

**Decision recorded:** 2026-10-31 (Australia/Sydney)  
**Branch / reviewed source baseline:** `phase13-m5-school-admissions` at `b70de184344f454538321170d8ff01dc86e49fd0` (no local owner commit of either campaign's test work)  
**Accepted M5.3 production-code ancestor:** `433f0f3bf83ed8505675b2d164e07b138dbc72f4`  
**Disposition:** **`POST_M5_E2E_CLOSED_WITH_BLOCKERS / E2E_BLOCKED / LIVE_PRODUCTION_NO_GO`**  
**Nature of record:** independent source/patch/artifact review of TWO owner-authorized local test campaigns; **reviewer did not independently re-execute local Docker, SQL, HTTP or Playwright**. This document is a docs-only evidence and decision record, not acceptance of every test's own PASS label.

## 1. Decision and controlling authority

The controlling [Post-M5 E2E Acceptance Contract](./PHASE13_POST_M5_SCHOOL_APPLICATION_E2E_ACCEPTANCE_CONTRACT_2026_10_31.md) and [Execution Plan](./PHASE13_POST_M5_E2E_EXECUTION_PLAN_2026_10_31.md) defined G0–G5 and E2E-01…18, plus inherited M4 failures. G0's manifest was prepared; G1–G4 were explicitly authorized and run in an isolated environment. After an independent G5 audit revealed incomplete assertions, the owner authorized **one bounded final completion pass**. That pass has now stopped. Do not create M5.4, retroactively declare the frozen contract fulfilled, or initiate a third automatic patch-and-retest loop.

**Adjudication:** PostgreSQL isolation, production-repository/HTTP integration, immutable history, fail-closed authorization and several end-user browser actions gained meaningful evidence. However, a mandatory Offer case failed, canonical browser mobile/feature-OFF requirements remain incomplete, and the mandatory M4-005 payment functional replay was not executed. The controlling contract therefore requires `E2E_BLOCKED`, not `E2E_ACCEPTED_WITH_LIMITATIONS`. **No newly confirmed production business/security defect was observed**; this does not certify the untested business paths.

All previous M5.1/M5.2/M5.3 *internal engineering* closeout decisions remain valid with their existing limits. Phase 13 has **not** earned live school submission, licensed-professional, signing, payment, real-provider, customer-data or production deployment authority. Existing normal runtime feature flags remain OFF. A passing synthetic authority calculation is not a real lawyer approval, real payment, verified CoE, or school receipt.

## 2. Campaign chronology, environment and evidence provenance

| Stage | Source/owner report | What was actually established / limitation |
| --- | --- | --- |
| G0 preflight | `~/post_m5_e2e_g0_report.md`, `~/post_m5_e2e_g0_manifest.json` (available during G0; subsequently reported missing from owner `~/`) | 18 frozen scenarios, 8 inherited M4 ledger entries, no DB execution; G0 completeness reported by Cline and accepted for planning |
| First G1–G4 | `~/post_m5_e2e_execution_report.md`, `~/post_m5_e2e_execution_results.json`, `~/post_m5_e2e_review.patch` (subsequently reported missing from owner `~/`) | G1 real PG17 migration 0047 with 48 entries; G2 real HTTP/PG scenarios; G3 Project selection blocked; G4 narrow M4 assertions; reported 17/18 canonical PASS but independent G5 determined some PASS marks were **partial-invariant evidence**, not full frozen scenario coverage |
| Final bounded completion | `~/post_m5_e2e_completion_report.md`, `~/post_m5_e2e_completion_results.json`, `~/post_m5_e2e_completion_review.patch` | Targeted one-attempt tests: E2E-11/12 strengthen replay/currentness; E2E-13 desktop main user journey succeeds; Offer test and some M4/journal assertions fail; genuine external authorities remain unavailable |
| Independent G5 decision | This review of attached completion report, JSON, 20-file source patch and GitHub implementation/contract, **not a new local test run** | Preserves successful evidence but corrects excessive full-PASS interpretation and closes campaign with blockers |

**Isolated owner-reported test target:** disposable `phase13-postm5-e2e-pg`, `127.0.0.1:55449`, DB `immigration_ai_phase13_postm5_e2e_test`, 48 migrations through `0047`, non-superuser roles. Second run reused this target without reset/remigration, seeded synthetic records, used local Next.js/NextAuth and Playwright. Owner reported host `127.0.0.1:5432/immigration_legal`, stale 5433, previous disposable containers, AWS/S3/Stripe/OpenAI/school/provider endpoints and real customer information were untouched; reviewer did not independently verify container telemetry or network traces. The container was left running; **this record does not authorize cleanup, reuse for unrelated work or any DB mutation**.

**Completion artifacts in the Project evidence context, independently hash-checked by reviewer:**

| Artifact | SHA-256 of exact final bytes |
| --- | --- |
| `post_m5_e2e_completion_report.md` | `c33b2a173b40477f5c6866d6d917263b4b23a0bb93e8f1e418c5f68baeef9070` |
| `post_m5_e2e_completion_results.json` | `909227737545156f73dd82fe75bc632f4ab5d8754b4505c8dc2911c7c146f6d3` |
| `post_m5_e2e_completion_review.patch` | `cc6d9650d24e58c4710c8561a82bc67193145f73967e0d93d62aaa7053c3f5a0` |

The completion report itself lists an obsolete **pre-footer** report digest `32661449e302030972a34af23880d7d1bb362cebcd3c68053818ead401664ac2`; **do not use that as the checksum of the final file**. Earlier campaign ledger reportedly survived at `/tmp/phase13-postm5-e2e/evidence/ledger-first-campaign-preserved.jsonl` SHA-256 `43080da6de170a047d66a7cdde9f69eb79f3ab22e6bb90489f73d0fa641d0299`. Traces/screenshots and completion logs were reported under `/tmp/phase13-postm5-e2e/evidence-completion/` and `.../evidence/browser/`, respectively; ephemeral local paths are **not** guaranteed durable or Git-tracked. This repository record preserves key results but does **not** claim to contain the full raw logs or uncommitted test harness patch. Never invent recovered machine identifiers or call the M4-005 historical mapping a byte-exact replay.

## 3. Canonical E2E-01…18: reviewer-qualified coverage

`FIRST_REPORTED_PASS` retains original run evidence but is **not a newly reproduced independent test**; `PARTIAL` means an observed sub-path passed but a contract requirement was absent. Do not derive a single unconditional "17 PASS" headline by merging these grades.

| ID | Reviewer disposition | Evidence and necessary qualification |
| --- | --- | --- |
| **01** | FIRST_REPORTED_PASS | ≥3 separate school applications / Project scope under first campaign; carried forward, not rerun |
| **02** | FIRST_REPORTED_PASS | Package → Case → preparation/confirmation binding under first campaign; carried forward |
| **03** | FIRST_REPORTED_PASS | Version/source/permission currentness path under first campaign; carried forward |
| **04** | FIRST_REPORTED_PASS | Unauthorized/unsafe M2 reference and document denial under first campaign |
| **05** | FIRST_REPORTED_PASS | Existing Offer/CoE/exception route without fabricated M5.1 application under first campaign |
| **06** | **FAIL / OPEN** | Completion harness queried `case.outcomes` instead of actual `outcomeHistory`; v1 lookup returned 0 and test exited before proving v1→v2, expiry/forward/rollback/unique-current-outcome invariants. **Harness defect indicated; product Offer lifecycle not certified** |
| **07** | **PARTIAL / OPEN POSITIVE PATH** | `customer_reported` claim and provider-confirmed/unauthorized document-backed refusal seen via real HTTP/PG; clean authorized `document_backed_unverified` positive requires real M2 scan/audit chain not exercised; no genuine provider verification |
| **08** | FIRST_REPORTED_PASS | Self-Service external action classified customer-reported with no fabricated receipt under first campaign |
| **09** | FIRST_REPORTED_PASS | Managed route denied READY in absence of authentic authority under first campaign; positive real managed submission still unavailable |
| **10** | FIRST_REPORTED_PASS **with owner-approved E2E-10-R interpretation** | Closed Project blocks writes, authorized owner retains permitted **read-only** history, unrelated creator denied; original frozen closure-denies-all wording preserved as historical divergence, **not silently edited** |
| **11** | **INTERNAL PASS** | Real HTTP/PG concurrent builds 200/409, one winner, no loser event; exact replay same operationId/payload/revision `replayed: true` with no new revision/event/package; altered payload 409 |
| **12** | **INTERNAL PASS** | Real HTTP/PG archive blocks rebuild/reconfirmation, linked Case stale, prior history unchanged, unrelated member denied and managed readiness never READY |
| **13** | **PARTIAL / NOT CANONICALLY ACCEPTED** | Real NextAuth/Chromium `/ai-workspace` desktop Project toggle/select, three UI school applications, detail/admissions panels, zh/en evidence passed. Mobile 390×844 panel visibility subtest failed before completion; feature-OFF test invalid because second Next.js dev server could not acquire `.next/dev/lock` and request hit still-ON server; keyboard/mobile/flag-OFF not certified |
| **14** | FIRST_REPORTED_PASS | Fresh disposable PG migration through 0047 (48 entries), 0044/45 unchanged, catalog/role/guard checks, environment protection under first campaign |
| **15** | **PARTIAL / SYNTHETIC ONLY** | Actual M4 review state persistence and constraints/provenance tested in part; no certified full professional-credential/service/HTTP binding or production authorization; INT-06 formal replay still failed |
| **16** | **PARTIAL / CROSS-MODULE OPEN** | Validity evaluator changed `valid → invalid` with supplied revoked assignment status, and CAS evidence exists; does not prove actual persisted staff-assignment revocation propagates through complete M4/Managed Readiness chain |
| **17** | **PARTIAL / PAYMENT POSITIVE OPEN** | Finance write denial/guard evidence; **not** refund/reversal/correction/payment-attestation/readiness positive lifecycle; twelve M4-005 historical functional failures not rerun |
| **18** | **PARTIAL / OPERATOR GATE OPEN** | Several immutable DB/guard and bounded execution assertions; feature-OFF process failure and incomplete pool/runner cleanup proof prevent complete operator-safe acceptance |

**Crosscutting preserved protections:** no observed cross-owner leak, unauthorized mutation, stale READY, or fabricated verified school receipt/CoE/visa determination in the reported exercised paths. These observations do not certify all missing positive paths. Mobile entry panel is intentionally behind the `workspace-panel-tab-history` tab at narrow widths (as observed in GitHub source), so the failed direct-visibility test alone is not evidence of a product UI bug; real discoverability/usability is a separate product question.

## 4. Mandatory inherited M4 failures: adjudication against the original contract

Frozen M4 historical results remain on record: final integration **12/17 PASS, 5 FAIL** (`INT-06/07/12`, `DB-01/02`); payment Stage 3B **29/41 PASS, 12 FAIL, exit 124**. The new G5 assessment distinguishes local test markers from proof of complete inherited business contracts:

| ID | Completion runner's own status | Independent reviewer disposition and needed future proof |
| --- | --- | --- |
| **M4-FINAL-INT-06** | FAIL | **OPEN / FAIL.** Real professional-review service did create requested→in_review→approved with exact target version/hash and reject illegal transition, but assertion expected raw SQLSTATE 23514 instead of service-level `state_conflict`; do not retire ID on failing harness. Service mapping is not itself a demonstrated product defect |
| **M4-FINAL-INT-07** | PASS | **PARTIAL.** Independent synthetic evaluator had applicable target-bound review `valid` before and `invalid (review_authority_revoked)` after supplied revoked assignment state. Yet a genuine persisted staff-assignment operation and downstream managed readiness refresh were not demonstrated; retain cross-module gap |
| **M4-FINAL-INT-12** | PASS | **PARTIAL.** Real PostgreSQL CAS gives one winner/one conflict and one approved revision; absent/unknown authority does not become valid. Full Managed Readiness `NOT_READY/UNKNOWN` precedence under a simultaneous revision change remains unproven. Owner-approved precedence: missing prerequisites → NOT_READY; truly indeterminate → UNKNOWN; neither READY |
| **M4-FINAL-DB-01** | PASS | **ACCEPTED DB guard.** Actual ProfessionalReviewRevision UPDATE/DELETE rejected with 23514, unchanged rows/audit chain |
| **M4-FINAL-DB-02** | PASS | **ACCEPTED DB guard.** Revision skip, target rebind and illegal transition rejected 23514, unchanged review head/history |
| **M4-005-STAGE3B** | UNVERIFIED | **OPEN / UNVERIFIED.** All 12 failing functional descriptions mapped from committed historical account, **zero re-executed**. No approved payment-write harness/role in reused cluster; do not imply refund/reversal/correction or authenticated finance payment proofs passed. Original raw Stage3B log missing |
| **M4-005-OFFLINE-JOURNAL** | FAIL | **OPEN / FAIL.** Three test-metadata files partially corrected to pin 0044 at its own journal entry, not terminal head; **five tests still expect 45 instead of current 48**. Migrations/schema/business rules were unchanged. This is a test-metadata failure, not observed finance-policy failure |
| **M4-CROSS-MODULE** | UNVERIFIED | **OPEN / UNVERIFIED.** Deny-only professional/payment/provider composition shown in parts; genuine credential, signature, customer acceptance, finance verification, school receipt/provider and cross-module life-cycle not established |

**Do not summarize as "four of five original M4 failures retired."** Only DB-01 and DB-02 have sufficient exact original-object negative-proof coverage for unqualified retirement; INT-07/12 contain meaningful new evidence but retain broader acceptance limitations, and INT-06 remains formally failed.

The payment completion suite also contains **three file-level stale-journal metadata edits**, which remain **local uncommitted test changes**, not part of this GitHub docs-only commit. No Stage3B 12-case functional retest occurred.

## 5. Test harness defects versus product exposure: actionable future reference

| Finding | Classification / impact | When to revisit |
| --- | --- | --- |
| `case.outcomes` vs `outcomeHistory` | **Harness field mismatch** (E2E-06); no confirmed Offer product bug; v2/expiry/supersession business chain is still untested | Before exposing new Offer replacement/expiry flows to customers |
| Service-mapped `state_conflict` vs SQLSTATE 23514 | **Harness layer assertion mismatch** (INT-06); actual service rejection is conservative | When reusing M4 professional-review acceptance tests |
| 45 vs current 48 migration rows | **Stale test-metadata** (M4-005 journal); no actual 0044/0045 migration hash failure | Before rerunning payment test suite; update only test metadata, never rewrite applied migrations |
| Mobile History panel not selected | **Harness navigation assumption**; source shows tabs/conditional panel visibility; real mobile discoverability and keyboard access were not conclusively tested | Before public mobile SchoolApplication rollout |
| Parallel Next dev instance hit `.next/dev/lock` | **Invalid feature-OFF test environment**, not proof that flag gate allowed access | Before production feature activation; isolate build/output/runtime instead of hitting still-ON server |
| Clean CoE/document-backed positive untestable | **M2 scan/audit authority unverified**, not proof CoE processing is safe end-to-end | Before accepting actual uploaded CoE as document-backed provenance |
| M4-005 real payment 12 historical functional failures missing replay | **Material validation gap**, not merely journal tech debt; no verified refund/receipt/correction/payment authority | Before permitting actual Managed Service financial or submission decisions |
| M4 staff assignment revocation → review/readiness | **Cross-module integration evidence gap**; validity calculator behavior alone does not prove repository/event propagation | Before production lawyer-assignment revocation/managed handoff |
| Evidence provenance | First campaign source reports/JSON/patch disappeared from owner `~/` before second campaign; remaining ledger/traces local and may be ephemeral | Preserve future test artifacts in tracked or controlled durable storage with verified final-file hashes |

**No demonstrated production source defect requires immediate repair from this campaign alone.** Absence of demonstrated defects is not a production sign-off; risk of unseen positive-path defects persists.

## 6. Operational closeout and future testing policy

1. **Stop the current Post-M5 acceptance campaign here.** No third automatically dispatched "R3" bugfix campaign, no endless micro-task loop, and no retrospective editing of the frozen acceptance contract or original failures. No new test execution is authorized by this documentation.
2. **Treat the local untracked/modified Post-M5 test harness as unaccepted test infrastructure.** Two campaigns produced useful diagnostics, but not a clean full-E2E PASS. Do not commit or merge it as a blessed passing suite solely because the first runner advertised 17/18 PASS; preserve independently if the owner later requests.
3. **Future release dependencies, not unconditional immediate tasks:** Offer v2/expiry and source currentness before corresponding UI availability; browser mobile/keyboard + true feature-OFF before enabling flags; M2 scan-backed CoE provenance before document-backed assertions; full real professional/staff/contract/payment/refund/reversal and provider test authorization before Managed Service, financial action or real submission.
4. **Production remains DENY.** `PHASE13_PROJECT_CHAT_ENABLED`, `PHASE13_SCHOOL_APPLICATIONS_ENABLED`, `PHASE13_SCHOOL_ADMISSIONS_ENABLED` were ON only in the explicitly approved synthetic sandbox. No normal/staging/production toggle, existing authoritative DB migration, paid model/provider call, real signing/finance or external school submission has been approved.
5. **Owner controls lifecycle and cleanup.** No deletion/reuse/cleanup of `phase13-postm5-e2e-pg` or any earlier test container is authorized by this docs-only closeout. Obtain explicit scope-specific owner approval for subsequent test writes, finance adapter/role, new container, test harness commit, or disposal.

**Decision:** `POST_M5_E2E_CLOSED_WITH_BLOCKERS / E2E_BLOCKED / LIVE_PRODUCTION_NO_GO`. Preserve the achieved internal evidence and the limitations; proceed to subsequent **separately authorized product planning** only, without assuming any newly certified live service capability.

## 7. Record precedence

This final reviewed closeout **supersedes only earlier dated "G0 pending", "contract prepared", "G1–G4 not executed" and "17 PASS" statements as current status**. It does **not** rewrite their historical truth, their source SHA, original failures, authorization scope, nor the M5 accepted development milestone decisions. Links: [controlling contract](./PHASE13_POST_M5_SCHOOL_APPLICATION_E2E_ACCEPTANCE_CONTRACT_2026_10_31.md); [execution plan](./PHASE13_POST_M5_E2E_EXECUTION_PLAN_2026_10_31.md); [M5 full closeout](./PHASE13_M5_COMPLETE_ENGINEERING_CLOSEOUT_ACCEPTED_WITH_LIMITATIONS_2026_10_31.md); [M4 final closeout](./PHASE13_M4_FINAL_CLOSEOUT_2026_10_30.md).
