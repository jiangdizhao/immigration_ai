# Phase 13 M5 — Complete Internal Engineering Closeout (M5.1–M5.3)

**Decision date:** 2026-10-31 (Australia/Sydney)  
**Implementation branch:** `phase13-m5-school-admissions`  
**Verified owner-pushed final code HEAD:** `433f0f3bf83ed8505675b2d164e07b138dbc72f4`  
**Disposition:** `PHASE13_M5_INTERNAL_ENGINEERING_ACCEPTED_WITH_LIMITATIONS / M5_DEVELOPMENT_CLOSED / POST_M5_E2E_PREPARED_NOT_AUTHORIZED / LIVE_PRODUCTION_NO_GO`

## 1. Decision: M5 internal engineering is complete, not production-ready

M5's **exactly three internal milestones** are formally closed with limitations. This does **not** alter the M0–M10 roadmap or create M5.4. It does not waive M4's failed tests, certify real professional authority, permit real institutional submissions, or authorize migration/feature activation in ordinary environments. The independently gated **Post-M5 School Application E2E Acceptance** remains an unexecuted, distinct stage.

| M5 development milestone | Accepted scope | Outcome |
| --- | --- | --- |
| M5.1 — Multi-School Application Foundation | Creator-private Project-scoped multi-school applications; immutable/versioned packages, references, audit, bilingual Project UI; additive migration 0046 | `ENGINEERING_ACCEPTED_WITH_LIMITATIONS` |
| M5.2 — Complete School Admissions Workflow | Per-application admission cases and preparation, Self vs Managed, existing/new Offer/CoE and exception pathways, evidence provenance, CAS/idempotency, audit, additive migration 0047 | `ENGINEERING_ACCEPTED_WITH_LIMITATIONS` |
| M5.3 — Integrated Offline Engineering Acceptance | Real M5.1 and M5.2 services composed across the actual service boundary, shared test M2/M3 registries, client/HTTP tests, 12 scenario groups I-01–I-12, recovery/concurrency tests | `OFFLINE_ACCEPTED_WITH_LIMITATIONS` |

This closeout supersedes older time-local text saying that M5.3 is merely planned or M5 is not implemented. Preserve those older passages as historical checkpoints, not current instructions.

## 2. Exact GitHub history (verified remote commits)

- M4 engineering starting baseline at M5 planning: `be1255589f8b9f55b0393b3a0cc562d1dbbef154`.
- M5.1 owner-pushed implementation: `e0b4be5df1eccb2b131af10b3f8c55ae580c5b56`. 39 committed paths; accepted reviewed cumulative source patch had 38 paths, with an incidental tracked `chatbot/tsconfig.tsbuildinfo` build-cache artifact.
- M5.1→M5.2 docs-only planning checkpoint: `af0e411e86ae9f0c92fa93f59c4f2b07ed0ce031`.
- M5.2 owner-pushed implementation: `f5120534d3e5df89c8ff3eeadb52607f75f5e54b`; 45 paths. Accepted local cumulative patch SHA-256 `e2f43a4d5244f409ace141d71671d5f009905d4ab5fa6883258972a619d31c86`.
- M5.2 closeout/M5.3 planning docs-only checkpoint: `0eedb8261864037c9abd6f384c0eed075bcbfb22`.
- **M5.3 final owner-pushed implementation:** `433f0f3bf83ed8505675b2d164e07b138dbc72f4`; 18 paths: 16 new files in `chatbot/lib/school-admissions-integration/`, `chatbot/package.json` and `docs/agent-memory/CURRENT_HANDOFF.md`. No M5.3 production service/schema/migration edits. Accepted local cumulative patch SHA-256 `4b7b4ecfd1e0ad07e2271ffb9a799e12fb1986ded66b9966307eec8fbdab1054`.

The existing authoritative M5.1 and M5.2 milestone closeouts are [M5.1](./PHASE13_M5_1_ENGINEERING_CLOSEOUT_ACCEPTED_WITH_LIMITATIONS_2026_10_30.md) and [M5.2](./PHASE13_M5_2_ENGINEERING_CLOSEOUT_ACCEPTED_WITH_LIMITATIONS_2026_10_31.md). M5.3 was independently code-reviewed against the final cumulative patch, with bounded test-evidence corrections completed before owner commit.

## 3. Engineering evidence and limitations — do not promote evidence levels

| Evidence layer | Reported completed results | What it establishes / does NOT establish |
| --- | --- | --- |
| M5.1 offline | Focused 58 PASS; historical broad 1125 PASS | Domain/API/foundation behaviour in permitted offline tests |
| M5.1 isolated PostgreSQL 17.11 | Migration through 0046, 47 journal entries; owner/Cline reported 9/9 real-store integration tests in three passing runs | Real M5.1 repository/constraint behaviour **in its disposable cluster**, not production DB |
| M5.2 offline | Focused 88 PASS; historical broad 1192 PASS | M5.2 domain/API/source/provenance checks; no real provider authority |
| M5.2 isolated PostgreSQL 17.11 | Migration through 0047, 48 journal entries; owner/Cline reported 6/6 tests on two successive passing runs; initial 5/6 attempt had a test-only digest-stimulus error, disclosed and corrected | Real M5.2 Store supersession, deferred FKs, exact replay/conflict, CAS, append-only audit, confirmation-forward-only SQL guards in disposable cluster |
| M5.3 integrated offline | **30 PASS / 0 FAIL / 0 SKIP**, I-01–I-12; default `pnpm test:unit` **1222 PASS / 0 FAIL / 0 SKIP**; M5.1 focused 58, M5.2 focused 88, frozen M4/M5 contract group 41 | Real M5.1/M5.2 business services connected through an **in-memory test** M5.1→M5.2 adapter; cannot certify production runtime, real Postgres cross-module composition, true browser, staff authority, provider or live readiness |
| Static tooling | `pnpm db:check`, Biome and diff checks reported clean; `tsc --noEmit` **44 existing diagnostics, zero new in M5.3** | Not a globally green TypeScript build; never claim all TS diagnostics resolved |

**Source of evidence:** The independent assistant inspected cumulative patches, GitHub source and remote commits, but did not personally access the owner's Ubuntu Docker instance or rerun the owner-reported PostgreSQL/Node test commands. Owner/Cline execution reports are explicitly attributed; the document does not imply independent rerun.

### Critical design decisions retained

- Per-creator privacy: generic Project membership does not grant another creator's school application/case access; M2 document reference is not an AI-use or staff-disclosure grant.
- Exact package/operation identity with revision CAS, authored-request idempotency, immutable history and audit. Incoming material source/application/package change invalidates dependent preparation; v1 confirmed → source change → rebuilt usable package v2 → new preparation v2 confirmation was positively proven in M5.3 in-memory service integration.
- M5.2 migration 0047: 7 SchoolAdmission tables; partial unique current-outcome/exception indexes; self-referential supersession FKs `DEFERRABLE INITIALLY DEFERRED`; first/forward confirmation permitted, backward or non-NULL→NULL prohibited.
- `customer_reported` and `document_backed_unverified` are not independent provider confirmation; CoE does not establish Student 500 visa eligibility.
- Self-Service customer external actions are self-reports, never institution receipts; Managed consumes M4 fail-closed exact-version readiness; VIP is not Managed entitlement.
- Actual drafting provider `disabled`, exception verifier `unavailable`, external submission `not_connected`; both `PHASE13_SCHOOL_APPLICATIONS_ENABLED` and `PHASE13_SCHOOL_ADMISSIONS_ENABLED` default OFF.

### Known technical limitations

- M5.3 in-memory shared M2/M3 registries are test doubles, not live values; M1 Project authority was supplied independently to two stores. Production `runtime.ts` application adapter, production shared Project authority, real PostgreSQL M5.1+M5.2 combined workflow and browser navigation were **not** tested together.
- The production runtime has no approved real professional credential/signature/payment/verifier/provider channel; absence is intentionally `NOT_READY`/`UNKNOWN`/DENY.
- Cosmetic PostgreSQL 63-byte generated constraint-name truncation in 0046/0047; do not retroactively rewrite applied migrations solely for cosmetic consistency.
- Historical 44 TypeScript diagnostics and tracked `tsconfig.tsbuildinfo` hygiene artifact remain nonblocking recorded issues.
- Prior isolated M5.1/M5.2 containers were separately authorized; their possible retention is not authority to reuse, connect to, or dispose of them during the next stage.

## 4. M4 historical blockers remain OPEN (not inherited PASS)

**M4 disposition remains `ENGINEERING_CLOSED_WITH_BLOCKERS`:** final isolated PG17 M4 suite **12 PASS / 5 FAIL**; exact unsuccessful IDs `INT-06`, `INT-07`, `INT-12`, `DB-01`, `DB-02`. M4-005 Stage 3B historically **29 PASS / 12 FAIL**, process exit 124 (timeout). Six older M4-005 offline journal-count/head assertions also became stale following additive 0045; preserve payment invariants while adjusting only justified test-structure assumptions.

Do **not** overwrite original logs/results, assert these are fixed by M5.3, or mark an unavailable external signer/payment/lawyer credential as verified. The canonical M4 evidence source is [owner-deferred E2E decision](./PHASE13_M4_BASELINE_ACCEPTED_M5_DEFERRED_E2E_2026_10_30.md) and [M4 final closeout](./PHASE13_M4_FINAL_CLOSEOUT_2026_10_30.md).

## 5. Release and next gate

**M5 development/engineering closed with limitations.** **Not a release approval**; Phase 13 overall and the real Managed School Application route remain `LIVE_PRODUCTION_NO_GO`.

Next **distinct** stage: [Post-M5 School Application E2E Acceptance Contract](./PHASE13_POST_M5_SCHOOL_APPLICATION_E2E_ACCEPTANCE_CONTRACT_2026_10_31.md), **prepared but not executed/authorized**. It requires independently approved, disposable runtime/DB/browser scope and a frozen scenario/results matrix; it must replay all specified M4 failures and verify real cross-component composition, while retaining unapproved provider/legal/payment paths as fail-closed. Stage gates cannot be rolled into M6 or rebranded as M5.4.

This GitHub closeout is a **documentation-only decision**. It neither authorizes nor executes migrations, PostgreSQL connections, browser tests, provider calls, customer-data handling, live model usage, feature flag activation, AWS/Stripe, production deployment, or disposable-container cleanup.
