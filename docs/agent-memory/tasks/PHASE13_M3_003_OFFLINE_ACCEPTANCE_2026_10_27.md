# Phase 13 M3-003 — Operator-curated source acquisition OFFLINE acceptance

Date: 2026-10-27 (Australia/Sydney)
Decision: **OFFLINE ACCEPTED** (code, synthetic tests, host regression); **REAL-SOURCE/LIVE/PRODUCTION NO_GO**.
Branch: `phase13-study-journey-project-centric`
Owner-pushed and independently GitHub-verified implementation commit: `40cd52ff1d1b1fcb11810beab8801bc91cce69ac`
Parent/base: `832922512f235695445c58ccb3c3c14367fdb4a7`
Implementation task: [M3-003](./PHASE13_M3_003_OPERATOR_CURATED_OFFICIAL_SOURCE_ACQUISITION_2026_10_27.md)
Next bounded task: [M3-004](./PHASE13_M3_004_RESOLVED_READ_MODEL_AND_EXPLAINABLE_OPTIONS_2026_10_27.md)

## 1. Remote code and scope verification
The independent GitHub compare from the M3-003 baseline reports exactly **one fast-forward commit** and exactly **10** intended changes: seven new files `acquisition-core{,.test}.ts`, `acquisition-fixtures.ts`, `acquisition-policy.ts`, `acquisition-review.ts`, `source-manifest{,.test}.ts`, plus three canonical status updates. No migrations, DB repositories or user-facing services changed. Owner's terminal reported a successful push to `40cd52ff1d1b1fcb11810beab8801bc91cce69ac`, with empty `git status --short`. The last bit is owner-reported, not a remote property.

## 2. Accepted implementation boundaries
- Typed versioned source manifest with operator access review, source-family/scope distinction and conservative default-off access.
- Deterministic offline acquisition using only injected fake DNS and pinned-connection transport; bounded resource limits, redirect/hostname/IP checks and fail-closed transport capability. No live adapter.
- Proposed immutable snapshots and candidate observations, retained provenance, bounded outcome diagnostics, no automatic `VERIFIED` elevation.
- Deterministic operator review and no-write change preview; no runtime database connection or import.
- R1 corrections independently reviewed: every candidate dataset is validated (no snapshot-ID bypass); exact replay compares snapshot content and whole observation set; immutable collision returns `BLOCKED / IMMUTABLE_ID_CONFLICT`; A-B-A distinct attempts retain history. Ordinary diagnostic/redirect URLs redact pathname values, credentials, query and fragment; exact canonical source URI is retained in structured provenance.

## 3. Evidence/acceptance matrix
| Gate | Evidence | Result |
|---|---|---|
| R1 independent review | Original M3-003 patch + corrected R1 cumulative patch source inspected; immutable replay and URL diagnostic corrections verified | PASS |
| R1 patch integrity | Cumulative patch SHA-256 `fbf4e1a38f59c75e2f96d63dde98dabb06c371ed33129f4ec13772e0c56eebb7`; accepted M3-002 migration 0040 remained byte-unchanged at `43fef570551335d4d116ac53e4e240868240c5f4fbedc7e6b071e500bf067c96` | PASS (owner/Codex report and source review) |
| Ubuntu M3-003 targeted | `node --import tsx --test lib/education-intelligence/source-manifest.test.ts lib/education-intelligence/acquisition-core.test.ts`; **24 passed / 0 failed / 0 skipped** | PASS |
| Ubuntu focused education | Eight education test files; **75 passed / 0 failed / 0 skipped** | PASS |
| Ubuntu existing regression | `pnpm test:unit`; **964 passed / 0 failed / 0 skipped** | PASS |
| Codex offline checks | Changed-file Biome + `git diff --check` passed. TypeScript **44** diagnostics, identical to accepted baseline, zero new diagnostics | PASS as reported |
| Live official source safety/accuracy | No CRICOS, Study Australia, institution HTTP/DNS request; no real TLS/pinning test, source terms/access review of specific target or verified admissions claim | **NOT TESTED / NO_GO** |
| Real DB/general application integration | No PostgreSQL connection, schema migration, import, runtime API or customer release in M3-003; M3-002's isolated DB acceptance remains separate | **OUT OF SCOPE / NO_GO** |

## 4. Supersession, limits and authorization
M3-003-R1 is **OFFLINE ACCEPTED**. Older canonical implementation blocks marked `R1 review pending`, `uncommitted`, `do not commit`, or `R2 required` are historical only, superseded by the owner-pushed and independently verified commit and this acceptance. M3-001 and M3-002 accepted states remain valid.

No authority is granted to fetch any real source, connect outbound, import any education record into a database, present course evidence as independently VERIFIED, route private facts into public catalog, enable public API/UI, provide admissions/visa eligibility, build automated school application actions, deploy, or alter AWS services. A live-source pilot requires independent exact URL/host, access-policy/terms and owner approvals. M3-004 is a separate **offline design/task packet**, not implicit permission for a live connection or production serving.
