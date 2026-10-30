# Phase 13 M5 — Integrated School Admissions Plan (three milestones)

**Decision:** 2026-10-30 (Australia/Sydney)  
**Starting development branch:** phase13-m5-school-admissions  
**M4 code baseline:** be1255589f8b9f55b0393b3a0cc562d1dbbef154  
**Status:** PLAN ACCEPTED FOR DEVELOPMENT PREPARATION / M5 CODE NOT YET IMPLEMENTED / LIVE_PRODUCTION NO_GO.

## 1. Scope and authority

This document breaks down ONLY the existing roadmap milestone M5 (School Admissions Workflow), without renumbering M0–M10 or claiming that Phase 13 M4 has achieved full acceptance. Its source of business scope is PHASE13_STUDY_JOURNEY_ROADMAP.md, and its release/deferral boundary is tasks/PHASE13_M4_BASELINE_ACCEPTED_M5_DEFERRED_E2E_2026_10_30.md. The frozen M4 contracts and role, authority, agreement, payment, signature, disclosure and professional-review guards remain binding.

**Engineering strategy:** three cohesive milestones, not an open-ended sequence of miniature API/schema/UI tasks or corrective micro-rounds. Each milestone is a complete cross-layer deliverable with one coherent task contract, implementation, independent review and consolidated validation. Corrections are bounded by demonstrated critical defects; cosmetic and non-blocking follow-ups are recorded for a later batch.

## 2. M5.1 — Multi-School Application Foundation

**Business outcome:** a customer can create/select a Study Journey Project and manage at least three concurrent, separate school applications inside it, using the existing customer Project workspace.

**One integrated deliverable:**
- Persistent Project-scoped School Application identity (application ID, creator/owner, Project, institution/course/delivery/intake selection or explicitly UNVERIFIED manual candidate, independent revision/status, audit); no implied admission/visa eligibility or genuine application.
- Authorized create/list/detail/update/archive; server-derived Project association; no cross-Project, cross-member private data, staff access, or Standalone Chat scope broadening. Use M1 membership and existing Project security patterns.
- Per-application versioned preparation/package snapshot and references to authorized M2 facts, documents and requirement states; reference does NOT grant document read, AI use, staff disclosure, or professional approval. A changed input invalidates a dependent package snapshot instead of silently reusing it.
- School source identities and field provenance are consistent with M3 Education Intelligence; unknown or synthetic catalog details remain explicitly unverified. No fabricated CRICOS, deadlines, fees, offers or CoEs.
- Basic actionable bilingual Project UI to manage three applications, their statuses, source/verification caveats, preparation evidence and version/invalidated indicators. Not a design-only component.
- Read-only/deterministic internal integration contracts for M5.2 and M4 managed-target identity; M5.1 does NOT enable M4 review/READY or real submission.
- Integrated unit and negative-authorization/concurrency/immutability tests. Write migrations only as an additive, reviewed artifact; do NOT execute them without an independent owner-approved disposable DB gate.

**Exit evidence:** three applications remain isolated under a single Project; exact owner/member and Project scope is enforced in code/tests; package revision/hash changes deterministically with its bound material inputs; stale data cannot be treated as current; no forbidden authority is implied. Claim OFFLINE_IMPLEMENTED or OFFLINE_VALIDATED only for genuinely executed tests. Database validation requires separate approval.

## 3. M5.2 — Complete School Admissions Workflow

**Business outcome:** connect the M5.1 application containers to a usable preparation-to-result workflow, using M2 authorized inputs and M3 sourced education intelligence.

**One integrated deliverable:**
- AI-assisted information requests, missing-document/requirement workflow, drafts and evidence-limited assessment. Explicit uncertainty; possible options are not guaranteed eligibility.
- Self-Service preparation and separately modeled Managed Service; VIP entitlement does not create a managed engagement or professional permission.
- Managed route consumes current M4 assignment, engagement, agreement/acceptance, signature evidence, permitted disclosures, contractual payment condition, exact-package professional review and fail-closed readiness. Unapproved or unavailable providers/policies return UNKNOWN or NOT_READY, never READY.
- Conditional flows: no Offer, existing Offer, newly received Offer, Offer review/acceptance, existing CoE and substantiated official exception; genuine third-party status needs verifiable provenance.
- Exact package version/hash, change-triggered invalidation, customer confirmations, and future external submission/receipt ports that stay disconnected/default-DENY. No real external institutional submission or synthetic receipt displayed as real.

**Exit evidence:** integrated offline Self and Managed synthetic scenarios execute without unguarded submission, false lawyer approval, false receipt, entitlement leakage or missing-source certainty.

## 4. M5.3 — Integrated offline engineering acceptance

**Business outcome:** prove M5.1 and M5.2 run as one bounded application system rather than isolated unit-test islands.

**One consolidated validation batch:** at least three parallel school applications; per-school source/requirements/version/package invalidation; Project/user/staff isolation; replay/idempotency, concurrency and revocation; distinct Self vs Managed outcome; no-Offer/existing-Offer/CoE paths; production adapters default OFF/DENY. Use actual accepted module calls. Report separate unit, integration, PostgreSQL (only when expressly authorized), browser, CI and unsupported/skipped coverage. No hidden SKIP or synthetic-to-production status promotion.

**Exit:** an honest OFFLINE_ACCEPTED_WITH_LIMITATIONS or blocked conclusion, with evidence for every accepted scenario. M5.3 is not permission for AWS, real school API requests, production migration, credentials, live payment or actual customer data.

## 5. Separate post-M5 E2E gate (NOT a fourth M5 development milestone)

The separate School-Application E2E Acceptance required by the 2026-10-30 M4 owner decision follows M5 implementation. It must independently retest M4 INT-06/07/12 and DB-01/02, the relevant M4-005 payment cases (historic 29/41 and incomplete assertions), and cross-module credential/signature/payment/confirmation/provider validity. Freeze expected outcomes and isolated environment before running; no retrospective false PASS. Real provider/legal/finance authority is a distinct approval gate even if synthetic E2E succeeds. Production and managed external submission remain NO_GO until all required gates are accepted.

## 6. Execution and scope discipline

1. Use one frozen task contract per milestone, not separate feature micro-prompts; M5.1 implementation contract is tasks/PHASE13_M5_1_MULTI_SCHOOL_FOUNDATION_IMPLEMENTATION_CONTRACT_2026_10_30.md.
2. Implement coherent schema/repository/API/UI/tests together on the named M5 branch; preserve existing M1–M4 and Fast/Legal/Premium paths, Phase 12 MatterDocument, Standalone Chat, Stripe VIP and protected configuration.
3. Limit review to one independent comprehensive code review and a consolidated bounded correction round for actual critical defects. Do not suppress failing tests or alter product security rules to make a dashboard green.
4. Do not run migrations, mutate any existing DB, inspect secrets, access real school/AWS/payment services, deploy, enable flags, commit/push implementation or expand real-user authorization without separate explicit owner approval.
5. The documentation commit that records this plan changes no production functionality and authorizes no local or live DB action.

**Current next action:** synchronize the new docs commit, review the M5.1 contract, then dispatch its linked Codex prompt as one integrated implementation task. No M5.1 code, schema or acceptance is claimed here.
