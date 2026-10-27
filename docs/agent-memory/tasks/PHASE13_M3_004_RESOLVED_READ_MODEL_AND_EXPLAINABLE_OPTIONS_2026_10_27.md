# Phase 13 M3-004 — Resolved education read model and explainable possible options (OFFLINE CONTRACT)

Created: 2026-10-27 (Australia/Sydney)
Status: **TASK CONTRACT PREPARED — implementation not started; dispatch remains an explicit owner workflow step**
Branch: `phase13-study-journey-project-centric`
Accepted M3-003 code SHA: `40cd52ff1d1b1fcb11810beab8801bc91cce69ac`
Required Codex baseline: the next **documentation-only** acceptance/dispatch GitHub commit after `git pull --ff-only`.
References: `AGENTS.md`; `docs/agent-memory/PHASE13_M3_EDUCATION_INTELLIGENCE_ARCHITECTURE_2026_10_27.md`; `docs/agent-memory/tasks/PHASE13_M3_003_OFFLINE_ACCEPTANCE_2026_10_27.md`; `docs/agent-memory/DECISIONS.md` (D-P13-002, D-P13-003, D-P13-008–011); `docs/agent-memory/{CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE}.md`.

## 1. Objective and product boundary
Build a **pure, bounded, deterministic, testable offline composition** of (A) the accepted M3-001 field-resolution contract, (B) the M3-002 exact-scoped catalog reader, (C) M3-003 source/review evidence, and (D) *already explicitly authorized* M2 Project facts, to produce a provenance-rich view of **possible** education options, not admission/visa eligibility.

Deliver a course -> delivery -> intake read projection and explainable tri-valued comparisons only where *both sides* possess compatible, explicitly typed evidence. No public/current institution truth is assumed; all fixtures are synthetic and unverified evidence remains unverified. This is not a lawyer decision, provider admission assessment, Offer, CoE, school application, visa advice, job placement or external submission.

## 2. Mandatory baseline reading
Before coding, check exact branch/HEAD, clean worktree, `AGENTS.md` and the current canonical state; inspect:
- `chatbot/lib/education-intelligence/{contracts,field-resolution,identity,fixtures,catalog-repository-core,postgres-repository,acquisition-review}.ts`;
- `chatbot/lib/project-facts/facts.ts` `stableProjection().authorizedForAI`, `chatbot/lib/projects/{project-context,context-resolver}.ts`, M1 authorization boundaries;
- M3 architecture Section 4, M2 acceptance restrictions, M3-003 acceptance; M3-005 future E2E gate.
The current `resolveEducationField` status vocabulary is **UNKNOWN, KNOWN, CONFLICTED, STALE, NOT_APPLICABLE, WITHDRAWN**; `evidenceClass` is **SYNTHETIC_ONLY or UNVERIFIED**. `KNOWN` means a scoped resolvable candidate under this contract — **NOT third-party verification or admissions eligibility**.
The current M2 `AuthorizedProjectFact` includes key/value, valueType, assertionId/version, origin, user confirmation, date/evidence metadata; only `stableProjection().authorizedForAI` may be consumed. The `ProjectContextPacket` is a bounded model provider packet and **not itself independent authority to access Project data**.

## 3. Output 1 — bounded catalog read/provenance projection
Implement an injected `EducationCatalogReader`/adapter interface over the M3-002 repository port or a thin pure composition. Use exact provider, course, delivery, intake IDs; no fuzzy course-name joining, no arbitrary ranking or title-only identity. Read exact children/parents and relevant field candidate history consistently, observe explicit read bounds; overflow/errors must fail closed rather than silently truncate or invent unknown facts.

For each requested candidate, output:
- stable exact entity IDs, provider/course/delivery/intake hierarchy and explicit absent/ambiguous branches;
- requested field keys **scoped to the correct target** and `resolveEducationField()` output: status, reason codes, assessedAt/assessmentDate, evidence class, bounded source IDs/snapshot IDs/URLs/hash/locator, source acquisition attempts and historical values without treating stale historical values as current;
- source-family-specific authority: CRICOS registration does not imply admission or an intake; Study Australia discovery cannot establish institution fee/admission conditions; institution source claims remain unverified unless a **separately approved** verification mechanism exists;
- status distinctions UNKNOWN vs STALE vs CONFLICTED vs WITHDRAWN vs NOT_APPLICABLE, future effective dates, failed-parse/fetch latest attempt, money basis/audience/currency/period and source date applicability;
- deterministic stable ordering, pagination/limits where needed; preserve full provenance within defined bounds, no raw unsafe HTML or fabricated text.

Do not create a new independent field resolver or trust hierarchy; reuse M3-001 resolution and augment with context/status representation only. A synthetic fixture may produce KNOWN but must remain labelled SYNTHETIC_ONLY.

## 4. Output 2 — strictly scoped evidence comparison contract
Produce a typed criterion/trace object for **explicitly structured and comparable** conditions. Each criterion names the required school field, exact entity scope, operator-curated typed comparator (eq, range, exact date or other justified minimal operators), source observation/snapshot, applicant fact key/type and exact version, and applicability/context. The comparator specification itself must be treated as a **reviewed structured input** in offline tests; raw `COURSE_ADMISSIONS_CRITERIA` text is **NOT** a machine-executable rule.

Allowed outcome per criterion: `MATCHES | DOES_NOT_MATCH | UNKNOWN`, with `NOT_APPLICABLE` only if explicitly supported and not a default pass. A mismatch is allowed only when both required sides are present, authorized, fresh/known, compatible in type/unit/currency/audience/basis/time and condition applies. Otherwise UNKNOWN, with typed reasons: missing student fact, missing school rule, stale/conflicted/withdrawn source, unverified/unreviewed comparator, inconsistent units, no verified applicability, unknown data or revoked/unauthorized grant. Do **not** make `UNKNOWN` into `DOES_NOT_MATCH` or PASS; no weighted score converts a hard UNKNOWN into eligibility.

A raw school criterion text, even if apparently quantitative (e.g. IELTS/PTE/year/age), is **not** parsed by regex/LLM to create an automatic requirement. If no explicitly reviewed criterion structure exists, return UNKNOWN and mark for human review. Distinguish personal fact provenance `customer-confirmed, not independently verified` from provider claim evidence `SYNTHETIC_ONLY/UNVERIFIED`. Do not produce recommendation language stronger than `possible option for further review`.

## 5. Output 3 — Project-only authorization envelope (offline injected)
Create a testable injected boundary with an **authenticated actorUserId and exact currently authorized projectId**. It must recheck current Project access/status and fetch current `stableProjection().authorizedForAI` for that actor/Project **before producing** the final option payload (and again immediately before hypothetical model emission, if the architecture has such a boundary). Avoid time-of-check/time-of-use leakage: if membership, project status, publication, AI grant or stable fact version changes during the request, fail closed/recompute from current authorized facts. Never trust a browser-provided role, projectId or synthetic packet as authority.

Standalone/non-Project Chat, Project B, other-member Chat, closed/revoked Project, disabled context and document-only untrusted/unguarded data must not yield private fact-backed options. No reads of private Chat transcripts, raw Project documents or superseded/conflicted/unpublished/ungranted ProjectFacts. No private facts in public catalog fields, logs, exception diagnostics, caches or stable URLs. The matching-core unit test may accept only already-authorized facts, while outer orchestration must *prove* fresh authority in a wholly offline injected harness. Where the M2 authorization dependency cannot be safely reused without customer runtime changes, implement a clearly offline adapter contract and tests, not a live route.

## 6. Possible-options presentation contract
For each candidate include explicit IDs and contextual pathway, `course/delivery/intake` scope, explainable criterion outcomes with both-side references, outstanding unknowns and missing applicant facts, stale/conflicting sources with observation dates, source-specific links/locators, deterministic limitation and human-check labels. Do not output admission probability, unconditional eligible/not eligible label, visa points estimate, successful application promise, admissions approval, Offer/CoE or school-submission status.

The module may sort stable exact ID or source-date keys deterministically; any optional soft preference ordering must be independent of hard eligibility, fully explainable, unable to promote unknown to pass, and may be excluded in first implementation. A course without a certain intake must never imply an available particular intake. Don't silently drop unknown candidates; use explicit bounded exclusions/reasons.

## 7. Strictly offline acceptance cases
At minimum test:
1. CRICOS registration KNOWN but intake/deadline/fee UNKNOWN; no eligibility PASS.
2. Study Australia discovery vs institution admissions/fee authority; incorrect source-family claim cannot satisfy criterion.
3. Source KNOWN/STALE/CONFLICTED/WITHDRAWN/NOT_APPLICABLE; a last failed fetch/parse and future-effective snapshot; full trace with source URL/hash/locator.
4. Multi-campus and multi-intake; repeated term/intake codes across years; same course title under different institutions never merges.
5. Fees with different currency, basis, international/domestic audience, year/period/inclusions; no invented FX, no direct comparison if incomparable.
6. Explicit typed criteria and comparable applicant facts produce MATCHES/DOES_NOT_MATCH; absent or free-text rules => UNKNOWN, even if raw language seems decisive; no invented score.
7. M2 facts unauthorized, conflict-affected, stale, never-published, never-granted, grant revoked mid-request, membership revoked or project closed mid-request, Project A to B or actor A to B, Standalone Chat: **no leak**. Assert nothing sent in output/errors/logs.
8. Read/size/time/query limits and consistent-snapshot behavior fail closed; no partial projection returned on bound overflow.
9. SYNTHETIC-only/UNVERIFIED evidence never becomes independently VERIFIED, no production connector invocation, no DB write, no HTTP, no model or AWS call.
10. Deterministic same-input snapshot/time equality and explicit date locality; rerun from identical fixture yields same stable normalized result.

## 8. Implementation scope, validation and stop
Prefer new pure files `chatbot/lib/education-intelligence/{read-model,option-comparison,project-options}.ts` and focused tests (names advisory). Use dependency injection to avoid direct server DB/Next.js imports when testing. Preserve M3-001/002/003 and migration 0040 byte-for-byte, including acceptance tests. No schema, DB migration/application, PostgreSQL connection, live CRICOS/institution call, real Project/Chat customer read, new API/UI route, scheduled ingestion, law/admissions professional determination, student-visa assessment, AWS/Stripe, model call or M3-005 work. A real-source pilot, DB import and public Project match endpoint each require separate authorization.

Run focused new M3-004 tests explicitly; existing M3 **75/75** on owner Ubuntu; existing whole unit **964/964** owner baseline; changed-file Biome, `git diff --check`, TypeScript diff relative to **44** preexisting diagnostics. Don't report sandbox socket/listener failures as clean pass; owner to rerun. Existing `pnpm test:unit` does NOT necessarily include new education tests. Don't create a false no-network test by skipping the injected transport boundary.

Codex leaves a bounded cumulative patch **uncommitted/unpushed**, updates only the three canonical status documents to `M3-004 implemented / pending independent review` without erasing accepted M3-003, and reports changed files, exported types/functions, adversarial test coverage, exact passes/skips/failures, patch SHA-256 and worktree status. Owner runs host tests and commits only after ChatGPT independent audit. Stop before M3-005.
