# Phase 13 M8 — Engineering Evidence and M9 Handoff (2026-11-06)

**Project branch:** `phase13-m8-versioned-submission-authorization`  
**M8 implementation commit:** `db70665f473cb1fca22ee8dcca5de05ba20947c9` (owner pushed; verified GitHub remote).  
**Disposition:** `M8_ENGINEERING_ACCEPTANCE_CANDIDATE_WITH_LIMITATIONS` pending owner confirmation and a narrowly scoped independent staff-authorization source review. Not production-ready; not automated Chromium accepted.

## Integrated M8 scope
- **M8.1:** immutable exact-version School/Student 500 Submission Packages, pinned M5.1 package/M6.2 GS content, manifest and dependency hashes, explicit content/declaration confirmations, finalization/invalidation, client UI, migration 0051.
- **M8.2:** separately recorded Self-Service/Managed authorization, M4 readiness/professional integration, current/finalized exact-version checks, human handoff, provenance-qualified external evidence, migration 0052. No real provider or professional authority was fabricated.
- **M8.3:** bounded disposable PG17 + browser acceptance infrastructure. Production remains fail-closed by default.

## Executed PostgreSQL evidence (owner host)
- M8.3 real disposable **PostgreSQL 17** on loopback with tmpfs storage: migrations `0000–0052`, Drizzle migration ledger **53**, **12/12 integration tests PASS**, 0 fail, 0 skip. Covered exact authorization, replay and concurrency, stale version, cross-Project refusal, M4 readiness, synthetic-only Managed positive conditions, handoff/CAS, provenance and revoked access.
- M8.1 earlier disposable PG17: migrations `0000–0051`, ledger 52, **8/8 PASS**.
- The temporary Docker test containers/ports were removed. Final owner check: no M8 test containers, no listeners on 3102/3103/55453/55455, no Next.js test process.
- **No** 0051/0052 migration was applied or authorized for normal local `chatbot`, `immigration_legal`, AWS staging or production.

## Owner-observed manual browser E2E (real NextAuth, Next.js and disposable PG17)
| Journey | Evidence | Disposition |
| --- | --- | --- |
| School Self-Service, Project `...b801` | Seeded `Synthetic Institute M83` / `Synthetic Master of Data Science`; M5.1 preparation package v1; M8.1 Submission Package **v1**, manifest prefix `2f12dfbfa8d5`; both customer confirmations recorded (**2**) and retained on reload; M8.2 Self-Service authorization showed `对此版本有效` and persisted after refresh. No external submission claim. | **Manual E2E PASS (one synthetic happy-path case)** |
| Student 500 Self-Service, Project `...b802` | Pinned GS Draft **v1**, digest prefix `275d182c57df`; M8.1 Submission Package **v1**, manifest prefix `f88df606d112`; two confirmations; Self-Service authorization `对此版本有效` persisted after reload. Still explicitly not submitted/legally verified. | **Manual E2E PASS (one synthetic happy-path case)** |
| Managed Service, Project `...b803` | UI showed Managed `暂不可用`, handoff not eligible and no externally submitted/verified outcome. The manual scenario **did not create/confirm a complete current M8 package**, so it does not isolate real professional-credential rejection when other conditions are met. Separate PG tests covered fail-closed authority. | **Limited negative UI observation; NOT full Managed E2E** |

## Automated Chromium: explicitly incomplete
- Older M8.1 browser suite achieved **4/5 PASS**, with the version-change confirmation scenario unresolved.
- Latest simplified M8.3 **three independent** Playwright journeys: **0/3 PASS**, all failing before M8 workflow at `seeded application must be listed`. Owner subsequently opened the same seeded applications manually, indicating likely harness navigation/loading/selection fragility, but the precise automated failure root cause was **not proven**.
- **Never claim Chromium 3/3 PASS.** Browser automation requires a redesigned, stable M9 user-journey harness; manual evidence and PG tests support only the stated scope.

## Reported offline validation
Coding-agent results (not independently rerun here): M8.1 41/41, M8.2 46/46, unit 1263/1263, M4-005 101/101, build and db:check passed, 44 historical TS diagnostics and 0 new, targeted Biome clean.

## Retained safety and release gates
- M4 professional credential/reviewer authority, real agreement/signature/payment verification, and external provider/gov/school submission/receipt verification remain unavailable; production default denies unauthorized Managed operations.
- Independent security review of **staff service-side evaluation using the requesting customer's private package context** remains pending; synthetic staff/authority tests are not a substitute for this review.
- M6 Student 500 legal coverage `PARTIAL`, `UNKNOWN/HUMAN_CHECK`, document trust DENY, Post-M5 `E2E_BLOCKED`, default-OFF M8 feature flags, and `LIVE_PRODUCTION_NO_GO` all continue.
- No verified Offer, CoE, official receipt or actual submission has been produced.
- Repository hygiene follow-up: implementation commit included tracked `chatbot/tsconfig.tsbuildinfo` and three blank-at-EOF diff warnings. No functional cleanup is required for this docs-only checkpoint.

## Closeout/next work
The owner may explicitly finalize `M8_ENGINEERING_ACCEPTED_WITH_LIMITATIONS` on this recorded evidence, while preserving the open automated Chromium and independent staff-context-security review items. M9 should focus on integrated bilingual customer/staff workspace UX, stable navigation and practical targeted E2E; the evidence record does not authorize M9 coding, production activation, permanent database migration or AWS deployment.
