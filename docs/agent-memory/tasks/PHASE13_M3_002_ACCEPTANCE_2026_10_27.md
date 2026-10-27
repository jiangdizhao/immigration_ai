# Phase 13 M3-002 — Durable Education Catalog acceptance matrix

Date: 2026-10-27 (Australia/Sydney)
Decision: **ACCEPTED (DEV/ISOLATED DATABASE)**; Phase 13 production/live **NO_GO**.
Owner-pushed code commit: `bda4487f000c43f6dda2955ae28067a1938b4199`
Branch: `phase13-study-journey-project-centric`
Baseline parent: `20cd1a340e3a8aa4ce05ac6dc0fe3427e2f1cf0d`
Governing architecture: `../PHASE13_M3_EDUCATION_INTELLIGENCE_ARCHITECTURE_2026_10_27.md`
Scope: implementation M3-002 + bounded R1 source integrity, R2 SQL hostname/transaction harness, R3 constraint-specific negative fixture repairs.

## Independent remote verification
GitHub compared the branch against baseline and confirmed exactly **one** fast-forward commit, SHA `bda4487f000c43f6dda2955ae28067a1938b4199`, with exactly 13 intended changed files (Education schema, new 0040 migration/snapshot/journal, typed catalog repo/unit/integration tests, identity tests and 3 canonical status documents). No unintended files or remote divergent commits were found. Owner reported clean `git status --short` after commit/push. Source review of cumulative R3 patch passed before the push; R3 patch SHA-256 `654780b6e4b9e577022aec22be807b0c380f90f145f34aa0b9d6fe51ccb10a42`. Exact 0040 SQL SHA-256 `43fef570551335d4d116ac53e4e240868240c5f4fbedc7e6b071e500bf067c96`.

## Acceptance evidence matrix
| Gate | Evidence | Status |
|---|---|---|
| Domain isolation | Seven standalone EducationProvider/Course/Delivery/Intake/Source/Snapshot/FieldObservation tables; RecordClass `SYNTHETIC` / `UNVERIFIED`; M2 customer/Project and Phase12 Policy paths unchanged | PASS (source review) |
| Source integrity | Family-specific canonical HTTPS hostname CHECK, no path/query masquerade; exact URL/scope source uniqueness, composite source/snapshot/observation provenance, cross-entity FKs | PASS (source + DB validation) |
| Identity and history | Scoped course/delivery/intake identity, reused intake codes partitioned by period; append-only snapshots/observations and A-B-A preserved; exact replay idempotent, changed duplicate rejected | PASS (source + DB integration) |
| Database structure | Owner-created and identity-checked **only** `immigration_ai_phase13_m3_002_test`, initialized 0000–0039 (40 entries/60 public tables); then separately authorized 0040; final ledger 41, last timestamp `1793052726837`, seven Education tables, **50 CHECK**, **12 FK**, **5 custom triggers** | PASS (owner-host PostgreSQL 17.11) |
| DB behavior | Owner-host guarded test invoked via `node --conditions=react-server --import tsx --test lib/education-intelligence/postgres-repository.integration.test.ts`; **1 passed, 0 failed**. All seven Education tables had **0 rows** afterward, `M3_ROLLBACK_PASS`, `M3_R3_POSTGRES_ACCEPTANCE_PASS` | PASS (owner-host exact test DB) |
| Existing regressions | Owner-host `pnpm test:unit`: **964 pass, 0 fail, 0 skip**. `pnpm db:check`: `Everything's fine`; nonfatal `Failed to find Response internal state key` | PASS |
| New offline tests | Codex reported **51/51** across six focused education test files; Biome passed; TypeScript 44 repository diagnostics identical to baseline and 0 new M3/schema diagnostics; R3 test fixture source independently reviewed | PASS as reported; **owner separate 51-test host rerun not captured** |
| Production and real-source rollout | No CRICOS/school fetch, provider admissions/fee truth assessment, operator authority approval, customer-facing launch, schema migration on general application DB or production; these remain unapproved | **NO_GO / NOT TESTED** |

## R1–R3 history and final disposition
- R1 corrected source-family trust boundary and expanded guarded DB negative scenarios; initial source host extraction was identified as flawed in review.
- R2 corrected hostname parsing (scheme-free host and userinfo/port rejection) and switched test orchestration to Drizzle transaction nesting/savepoints. Drizzle-kit 0.25 v7 snapshot has no supported CHECK serialisation; schema + 0040 SQL + database constraint inspection were checked instead.
- Owner's first DB test did not load `server-only` under plain Node; rerun used `--conditions=react-server`. First real test then exposed a test-fixture `23505` collision preempting a planned FK `23503`.
- R3 isolated unique keys in FK rejection rows, tightened named-constraint assertions and diagnostics, without changing applied migration. Final owner-host DB behavioral run **passed** and left no business rows.
- These are **historical fixed review issues**, not open R4 blockers. The production NO_GO is unchanged.

## Authority/stop conditions
M3-002 acceptance authorizes the team to progress to **M3-003 offline operator-curated source acquisition scaffolding only** under its separate task. It does **not** authorize any real HTTP request to CRICOS/Study Australia/institutions, scheduled crawling, automated verification, real school/admissions determinations, non-test database migrations/writes, Project personalization, legal recommendations, AWS or deployment. A later real-source pilot requires exact source/URL, approved access/terms/policy and separately explicit owner authorization. The existing isolated DB is at 0040 and must not be reset or reused for unrelated destructive runs.

Links: [M3-002 prior task](./PHASE13_M3_002_DURABLE_EDUCATION_CATALOG_2026_10_27.md); [M3-003 next task](./PHASE13_M3_003_OPERATOR_CURATED_OFFICIAL_SOURCE_ACQUISITION_2026_10_27.md).
