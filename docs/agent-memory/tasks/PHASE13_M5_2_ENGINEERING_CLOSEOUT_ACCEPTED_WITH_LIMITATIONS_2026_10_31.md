# Phase 13 M5.2 — Complete School Admissions Workflow: Engineering Closeout

**Date:** 2026-10-31 (Australia/Sydney)  
**Branch:** `phase13-m5-school-admissions`  
**Owner-pushed code SHA (GitHub verified):** `f5120534d3e5df89c8ff3eeadb52607f75f5e54b`  
**Parent planning SHA:** `af0e411e86ae9f0c92fa93f59c4f2b07ed0ce031`  
**Disposition:** `M5_2_ENGINEERING_ACCEPTED_WITH_LIMITATIONS / M5_3_PLANNING_NEXT / PHASE13_LIVE_PRODUCTION_NO_GO`.

## Decision and evidence provenance

M5.2 is **engineering-accepted with limitations** following independent cumulative-patch source review, bounded P0/P1 corrections, and owner-authorized disposable PostgreSQL 17 integration acceptance. The reviewer directly verified the code patch, remote branch and owner-pushed commit, but **did not remotely reproduce** the owner's local Docker or SQL test execution. Preserve that distinction in every future status summary.

The accepted source was the final 45-file cumulative patch against the prior docs-only HEAD, owner-reported SHA-256 `e2f43a4d5244f409ace141d71671d5f009905d4ab5fa6883258972a619d31c86`. GitHub independently shows `f5120534d3e5df89c8ff3eeadb52607f75f5e54b` with **45 paths**. Local patch artifact lives at `/home/rico/phase13_m5_2_workflow_review.patch` and is not asserted to be committed.

## Accepted engineering scope

- Project-scoped SchoolAdmissionCase integrated with creator-private M5.1 SchoolApplications; customers select their own existing applications or use explicit existing Offer/CoE/exception entry routes without creating fictitious applications.
- Source-limited preparation checklist and provisional drafting; source/permission-dependent currentness, immutable preparation history and customer confirmation at exact version; AI provider default disabled, never auto-approved or represented as authoritative.
- Separate Self-Service vs Managed Service; customer-reported external actions cannot be misrepresented as school receipts; Managed uses M4 exact-package target and fail-closed readiness, no VIP-as-managed shortcut or invented professional/payment/signature authority.
- Distinct provenance for claimed/document-backed/unverified vs genuinely source/provider-confirmed Offer and CoE; production verification port unavailable, no synthetic provider-confirmed claims; CoE does **not** establish Student 500 eligibility.
- 0047 additive migration adds 7 SchoolAdmission tables (Case, Preparation, Outcome, ExternalAction, Exception, Operation, Event) with append-only evidence, current-row unique indexes, deferred supersession FKs and confirmation-forward-only SQL guard.
- M5.2 Chinese-first/en bilingual Project workflow, authenticated creator-private APIs, CAS/idempotency and bounded evidence/reference adapters. Existing M1–M5.1 security, Standalone Chat, Project Chat, Stripe VIP and M4 deny-only runtimes preserved.
- `PHASE13_SCHOOL_ADMISSIONS_ENABLED` defaults OFF; no production or third-party submission authorization.

## Reported offline and isolated DB evidence

- `pnpm test:phase13:m5-2:offline`: **88 PASS / 0 FAIL / 0 SKIP**.
- `pnpm test:unit`: **1192 PASS / 0 FAIL**, incorporates M5.2 regression files without duplicates; M5.1 focused **58 PASS**.
- `pnpm db:check`, Biome and `git diff --check` reported clean.
- TypeScript `tsc --noEmit`: **44 pre-existing diagnostics**, same untouched files; 0 newly introduced. This is **not** a globally green TypeScript build.
- Owner-authorized isolated Docker `postgres:17` **17.11**, container `phase13-m5-2-acceptance-pg`, loopback `127.0.0.1:55448 -> 5432`, dedicated non-superuser `m52_test_role`, tmpfs data, new `immigration_ai_phase13_m5_2_test`, cluster with no authoritative `immigration_legal` DB; credentials not disclosed.
- Migrations 0000–0047 were applied **only** to disposable cluster: 48 journal entries, seven M5.2 tables, seven triggers, five routines; `SchoolAdmissionOutcome_superseded_fk` and `SchoolAdmissionException_superseded_fk` validated `DEFERRABLE INITIALLY DEFERRED`.
- `pnpm test:phase13:m5-2:integration`: initial attempt **5 PASS / 1 FAIL** due to an incorrect changed-request digest in a prepared test (test stimulus only, no business-code edit). After documented stimulus correction, **two subsequent runs each 6 PASS / 0 FAIL / 0 SKIP / exit 0**. Evidence covered exact operation replay/conflict, CAS, append-only audit, Offer/CoE/Exception supersession, real SQL authority denial, confirmed preparation v1→v2 and backward/NULL denial.
- Owner-reported post-run catalog/audit/transaction integrity: zero duplicate current outcomes/exceptions, dangling supersession pointers, revision inconsistencies, missing result rows or idle-in-transaction sessions; independent guard probes 2→1 and 2→NULL rejected with SQLSTATE 23514.
- Non-blocking PostgreSQL identifier truncation NOTICE for `SchoolAdmissionEvent_operationRecordId_SchoolAdmissionOperation_id_fk` (63-byte name limit; enforced constraint still exists). Do not retroactively rewrite applied 0047 for cosmetics.

## Accepted limitations, deferred gates and no-go

1. **No integrated real browser/E2E acceptance** of the complete M5.1→M5.2 user journey, Chinese/English accessibility and navigation (M5.3 / separately authorized browser evidence).
2. Actual M2 field values, approved AI-drafting provider and professional verification authority are **not connected**. Current templates are deterministic/provisional, with availability disclosures; no actual school provider, verified Offer/CoE receipt or institutional submission.
3. M4 professional credentials, engagement, signatures, off-platform managed payment, exact-review readiness and external-provider authority remain **fail-closed**; `LIVE_PRODUCTION_NO_GO` unchanged.
4. 0047 has not been applied outside the **disposable** DB; feature remains OFF in normal environments; no customer-data, production or staging rollout authorized.
5. 44 existing TypeScript diagnostics and cosmetic truncated PostgreSQL constraint name remain known; neither is silently accepted as a fully green repository build.
6. Distinct **post-M5 School Application E2E Acceptance** still owns the M4 final INT-06, INT-07, INT-12, DB-01, DB-02 and relevant M4-005 payment assertions. M5.3 must **not** turn these into synthetic PASS.
7. Disposable `phase13-m5-2-acceptance-pg` was retained for evidence review and must be separately, explicitly authorized for controlled disposal.

## Decision and next gate

**M5.2 IS CLOSED — ENGINEERING_ACCEPTED_WITH_LIMITATIONS.** Do not reopen for an unlimited micro-fix cycle. Any actual new material security/data-integrity issue must be recorded and resolved as a bounded exception; accepted source is frozen for routine integration.

**Next:** prepare M5.3 as the **third and final internal M5 development/engineering-acceptance milestone**, delivering genuine cross-module offline integration and evidence, not a redesign or new operational provider capability. The full scope and acceptance matrix are in [M5.3 integrated contract](./PHASE13_M5_3_INTEGRATED_OFFLINE_ENGINEERING_ACCEPTANCE_CONTRACT_2026_10_31.md). M5.3 execution and DB/browser/environment access require their own explicit scoped owner approval.

This closeout and linked planning documents authorize **documentation only**; no new migration, DB access, customer data, provider calls, deployment or M5.3 implementation.
