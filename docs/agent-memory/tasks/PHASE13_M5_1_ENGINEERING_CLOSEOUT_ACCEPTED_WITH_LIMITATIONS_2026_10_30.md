# Phase 13 M5.1 — Engineering Closeout: ACCEPTED_WITH_LIMITATIONS

**Record date:** 2026-10-30 (Australia/Sydney)  
**Branch:** `phase13-m5-school-admissions`  
**Owner-pushed implementation HEAD (remotely verified):** `e0b4be5df1eccb2b131af10b3f8c55ae580c5b56`  
**Parent documentation HEAD:** `def89de44e5f3fdfe1a8317f8c6e10c301e8e8fa`  
**Disposition:** `M5_1_ENGINEERING_ACCEPTED_WITH_LIMITATIONS / M5_2_PLANNING_NEXT / PHASE13_LIVE_PRODUCTION_NO_GO`.

## 1. Decision and scope

M5.1 implementation was committed and owner-pushed following a full cumulative code-diff review, one consolidated correction round, a bounded pre-DB correction and a single isolated PostgreSQL acceptance gate. The implementation is an additive Project-scoped multi-school application foundation, not authorization to open the feature for real customers or initiate school submission.

This engineering acceptance is based on the owner-provided execution evidence and independent static review. The reviewer did not independently connect to the owner's PostgreSQL instance; record source-of-evidence explicitly and do not silently promote reported execution to independently rerun tests.

The GitHub commit itself includes **39 paths** (the reviewed cumulative source patch contained 38 paths; an additional tracked generated artifact `chatbot/tsconfig.tsbuildinfo` appears in the pushed commit). This build-cache artifact is nonblocking and must be addressed only through later routine repository-hygiene review, not a new M5.1 hotfix or unsupported historical rewrite.

## 2. Implemented engineering capabilities

- Project-scoped creator-private `SchoolApplication` identity and three-or-more concurrent independent school/course/intake applications.
- Additive versioned `SchoolApplicationPackage`, `SchoolApplicationReference`, `SchoolApplicationOperation`, and `SchoolApplicationEvent` persistence with revised SQL guards, composite Project/application FKs and immutable history.
- Per-application provenance; M2 facts/documents/requirements opaque authorized references and M3 school identity; no unofficial claim upgraded to official evidence.
- Versioned preparation packages with deterministic hashes, exact-request operation idempotency, CAS and source/revocation-sensitive current-usability projection; archived applications retain historical rows but no operationally usable package.
- Customer-only Project REST APIs, bilingual zh-CN/en panel inside existing Project workspace, default-OFF `PHASE13_SCHOOL_APPLICATIONS_ENABLED`.
- M4 `managed_school_application` exact target identity compatibility, without enabling managed readiness, lawyer approvals or external submission.
- M4 protected-resource, contract, signature, professional authority, payment and disclosure constraints remain fail-closed.

## 3. Validation evidence and provenance

**Owner-reported and independently reviewed evidence:**
- Cumulative accepted review artifact: `/home/rico/phase13_m5_1_pg17_acceptance_review.patch`, SHA-256 `87d7eb18906ef06ca5bb1623f8796839b36867400c613c26efea4d3ab3427446`; the file may remain local, not necessarily committed.
- Owner/Cline reported `pnpm test:unit`: **1125 PASS / 0 FAIL / 0 SKIP**, exit 0; focused `test:phase13:m5-1:offline` **58 PASS**; relevant M4/migration/workspace checks PASS, Drizzle/Biome/diff checks clean.
- `tsc --noEmit`: 44 reported pre-existing errors across nine untouched files, zero newly introduced (not a globally passing TypeScript build).
- Isolated fresh PostgreSQL **17.11** container `phase13-m5-1-acceptance-pg` using tmpfs, loopback `127.0.0.1:55447 -> 5432`, dedicated non-superuser role `m51_test_role`, empty `immigration_ai_phase13_m5_1_test`; no normal database, AWS, S3, Stripe, real school provider or customer data accessed.
- Migrations 0000–0046 were applied **only in disposable cluster**; journal **47 rows**, latest 0046; 5 new tables, 30 CHECK constraints, 10 FKs, 11 unique indexes including PK, 5 triggers, 4 functions.
- Owner-reported real Repository integration test suite `pnpm test:phase13:m5-1:integration`: **9 PASS / 0 FAIL / 0 SKIP**, exit 0, repeated three times. Scenarios: isolation/identity, SQL guards, exact replay and conflicts, CAS, material edits and invalidation, transactional rollback and audit, membership revocation, Project closure and partial unique index.
- Latest harness explicitly equates both `POSTGRES_URL` and `DATABASE_URL` to disposable URL, checks declared host vs server ports, and closes its own connection pool. No migration/DB changes have been approved outside this separate isolation.

**Known minor schema naming observation:** PostgreSQL truncates a 66-character declared FK identifier to 63 characters (`SchoolApplicationEvent_operationRecordId_SchoolApplicationOpera`), so catalog name differs from the Drizzle snapshot string; recorded as cosmetic/name-drift risk, not a functional-FK failure. Do not modify old migration to eliminate this.

## 4. Outstanding limitations (accepted, not erased)

1. No real browser/Playwright 3-school E2E or accessibility/full bilingual UX validation.
2. M2/M3 joins have synthetic/opaque evidence, not authorized real student data or real independent institution source verification.
3. No actual Offer/CoE third-party receipt proof, school provider submission, verified professional credential, contractual payment/signature approval or production managed submission.
4. `PHASE13_SCHOOL_APPLICATIONS_ENABLED` stays OFF; migration 0046 is **NOT applied** to standard app/staging/production databases.
5. Legacy baseline 44 TypeScript diagnostics remain unresolved; generated `tsconfig.tsbuildinfo` in pushed commit needs later hygiene review.
6. M4-005 Stage3B (29 pass/12 fail) and M4 final INT-06/07/12, DB-01/02 remain explicitly deferred to distinct, separately owner-authorized **post-M5 School Application E2E Acceptance**. Do not manufacture PASS in M5.2.

## 5. Exit and next gate

**M5.1 IS CLOSED AS ENGINEERING ACCEPTED_WITH_LIMITATIONS.** No further micro-correction cycle unless a new concrete security/data-integrity blocker is demonstrated. Its initial Phase13 school capability is protected by default-OFF flag and its DB schema is not installed outside disposable test cluster.

M5.2 design/planning may proceed against the pushed baseline, but a separately approved implementation task, any additive migration execution, any provider I/O and any production/service-flag activation remain distinct gates. See `PHASE13_M5_2_COMPLETE_SCHOOL_ADMISSIONS_WORKFLOW_IMPLEMENTATION_CONTRACT_2026_10_30.md`.

**Scope of this closeout:** documentation only; no code changes, migration, DB execution, application deployment, server flag changes or school submission.
