# Phase 13 M3-004 — Resolved read model and explainable possible options: OFFLINE ACCEPTANCE

Date: 2026-10-27 (Australia/Sydney)
Decision: **M3-004 OFFLINE ACCEPTED** / M3 overall remains OPEN / LIVE PRODUCTION NO_GO.
Accepted branch: `phase13-study-journey-project-centric`
Owner-pushed, independently verified code commit: `eefb6eb7fee187e99c10790075967a73f4976f92`
Parent: `302f5a4207dc5df82867878ea2d688e5461d517b`
Source task: [M3-004 detailed implementation contract](./PHASE13_M3_004_RESOLVED_READ_MODEL_AND_EXPLAINABLE_OPTIONS_2026_10_27.md)
Next stage: [M3-005 integration & milestone acceptance task](./PHASE13_M3_005_INTEGRATION_AND_MILESTONE_ACCEPTANCE_2026_10_27.md)

## 1. Independent GitHub confirmation
The live GitHub branch was independently compared with `302f5a4207dc5df82867878ea2d688e5461d517b`: **exactly one fast-forward commit**, SHA `eefb6eb7fee187e99c10790075967a73f4976f92`; exactly **9 intended files**: six new `chatbot/lib/education-intelligence/{read-model,option-comparison,project-options}{,.test}.ts` plus `docs/agent-memory/{CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE}.md`. No M3-001/002/003 code, migration 0040, live application route or Project facts/repository changed. Owner reported successful push and an empty `git status --short` after the commit; the clean local status is owner evidence, not directly observable from GitHub.

## 2. Implementation accepted
- Pure exact-ID course/provider/delivery/intake read projection over injected consistent reader with explicit row/read-time limits, complete source evidence, historical snapshot outcomes, claimed authority and field statuses. Entity intake date columns no longer bypass field-level resolution: `INTAKE_START_DATE` and `APPLICATION_DEADLINE` resolutions own current dates.
- Typed reviewed school criteria `MATCHES | DOES_NOT_MATCH | UNKNOWN | NOT_APPLICABLE` with conservative applicability and school/fact provenance. Numerical thresholds are tied to exact institution observation, source snapshot/quote, SHA-256 binding, approved reviewer and review revision from **injected trusted approval authority**, not caller-provided `APPROVED` metadata; never parse prose into executable admissions rules.
- Applicant fact reference uses exact assertion ID and version from current M2 `stableProjection().authorizedForAI`. Injected Project/Chat/current-membership authorization is checked before catalog use and again before output; no raw private applicant values in result.
- R2 date semantics: exact `YYYY-MM-DD` applicant dates only; zoned timestamp yields `UNKNOWN` / `UNSUPPORTED_CALENDAR_DATE_SEMANTICS` rather than UTC-day transformation. Malformed nested criteria yield generic `ProjectPossibleOptionsError` prior to catalog reads.
- All education source records remain `SYNTHETIC` or `UNVERIFIED`, not independently admissions-verified. Outputs are possible options for human review only, never Offer/CoE/visa success or actual admissions determinations.

## 3. Review and owner-host acceptance matrix
| Check | Evidence | Status |
|---|---|---|
| Original M3-004 independent source audit | Identified direct intake entity-date projection and numeric rule lacking binding | Corrected in R1 |
| R1-01/02/03 source review | Date projection, signed/hashed evidence-review contract and fail-closed request validation inspected | PASS |
| R2-01 source review | Date-only comparator and zoned-timestamp UNKNOWN regression reviewed; retained R1 invariant | PASS |
| R2 cumulative patch | SHA-256 `6f6b019d235b3e907636b4f5044d5846b19017aebad1d81fb9925c44a3acc37c` (owner handoff and source review) | PASS |
| Ubuntu M3-004 dedicated tests | **28 passed / 0 failed / 0 skipped** | PASS |
| Ubuntu full M3 focused offline tests | **103 passed / 0 failed / 0 skipped** | PASS |
| Ubuntu `pnpm test:unit` | **964 passed / 0 failed / 0 skipped** | PASS |
| Codex validation | Changed-file Biome, `git diff --check`, reverse patch; TypeScript remained at **44 preexisting diagnostics**, zero new M3 diagnostics | PASS as reported |
| Exact remote commit and changed-file scope | GitHub compare and commit query, nine expected paths | PASS |
| Real school evidence and reviewed school criteria | Only synthetic/offline fixtures, no independently validated live institution course, intake or fee data | **NOT TESTED** |
| Production and real Project data path | No authenticated live Project authorization adapter, real user data, API/UI, DB import or model invocation | **NOT IMPLEMENTED / NO_GO** |
| Full M3-001 through M3-004 cross-layer E2E | Each submodule tested; integrated milestone E2E belongs to M3-005 | **PENDING M3-005** |

## 4. Boundary/decision
This code acceptance supersedes historical `M3-004-R2 implemented pending review`, `uncommitted` and `R3 required` language in the canonical documents below, which is historical evidence only. M3-001 and M3-003 remain OFFLINE ACCEPTED; M3-002 remains ACCEPTED on the separately authorized isolated PostgreSQL test with append-only safeguards. **M3 as a whole is not yet accepted or production-ready.**

M3-005 is the final integration/offline milestone gate and must explicitly mark untested real-database full-stack, live-source, current admissions, business/professional and production privacy/release areas as limitations. No real HTTP/DNS, actual customer Project facts or files, DB operations, migration, ingestion, AWS, API/UI or production activation are authorized implicitly by this document.
