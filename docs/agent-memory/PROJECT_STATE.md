<!-- BEGIN PHASE13_M3_005_FINAL_OFFLINE_ACCEPTED_WITH_LIMITATIONS_2026_10_27 -->
## Latest canonical checkpoint — Phase 13 M3 OFFLINE ACCEPTED_WITH_LIMITATIONS (2026-10-27)

- **Verified M3-005 code:** `225422d5c8f80c472cfd9807be99a5752aed8c2d` on `phase13-study-journey-project-centric`; independent GitHub comparison to `70087b3a8ec253c9be6811e6d2330421aebbf41d` confirms exactly one fast-forward commit and seven expected files: `acquisition-core.ts`, `acquisition-core.test.ts`, `milestone-integration.test.ts`, the implementation-time M3-005 JSON report and three canonical status docs. Next checkpoint commit is **documentation only**.
- **Disposition:** **M3-001 OFFLINE ACCEPTED; M3-002 ACCEPTED (separately authorized isolated PostgreSQL test); M3-003 OFFLINE ACCEPTED; M3-004 OFFLINE ACCEPTED; M3-005 OFFLINE ACCEPTED. Entire M3: `OFFLINE ACCEPTED_WITH_LIMITATIONS`.** This closes only M3 offline engineering acceptance; wider Phase 13 and real-world rollout remain open, live/prod **NO_GO**.
- **External evidence:** Independent source review of M3-005 plus R1 deterministic complete excerpt fix PASS. Owner Ubuntu: 9/9 M3-005 connected integration; Education suite 115 total **114 passed, 0 failed, 1 deliberate PostgreSQL skip**; `pnpm test:unit` **964 passed, 0 failed, 0 skipped**. Codex Biome/whitespace passed, unchanged **44** TypeScript baseline diagnostics/zero new touched-path diagnostics. Prior Codex sandbox 113/3/0 failures remain recorded in the JSON as an earlier environment result; **do not alter or pretend sandbox rerun passed**. M3-002's isolated PostgreSQL acceptance is previously accepted, not rerun for M3-005.
- **Authoritative final acceptance:** [M3-005 final offline acceptance](./tasks/PHASE13_M3_005_FINAL_OFFLINE_ACCEPTANCE_2026_10_27.md) supplements the original [implementation-time machine report](./tasks/PHASE13_M3_005_OFFLINE_ACCEPTANCE_REPORT_2026_10_27.json). Older `M3-005-R1 independent review pending`, `uncommitted/unpushed`, `M3 overall OPEN` language below is historical and superseded, not an active blocker.
- **External gate plan (NOT AUTHORIZED):** [post-offline readiness gates A–E](./tasks/PHASE13_M3_POST_OFFLINE_REAL_WORLD_READINESS_GATES_2026_10_27.md): separately authorized official-source transport/terms review; controlled SQL import/rehearsal; genuine Project/Chat/M2 fact authorization; professional admissions review; monitoring and explicit deployment. No real HTTP/DNS, actual DB write/migration, customer data, API/UI integration, model, AWS, official truth certification, legal/visa determination or production release is approved. No M3-006 is dispatched.
- **Owner next local step:** `git pull --ff-only origin phase13-study-journey-project-centric`, verify new docs-only HEAD and clean worktree. Any further code must be separately scoped/approved and held uncommitted for review.
<!-- END PHASE13_M3_005_FINAL_OFFLINE_ACCEPTED_WITH_LIMITATIONS_2026_10_27 -->

<!-- BEGIN PHASE13_M3_005_R1_IMPLEMENTED_PENDING_INDEPENDENT_REVIEW_2026_10_27 -->
## Latest canonical Phase 13 M3 status — M3-005-R1 implementation pending independent review (2026-10-27)

- Base branch/HEAD: `phase13-study-journey-project-centric` / `70087b3a8ec253c9be6811e6d2330421aebbf41d`. M3-005 changes remain uncommitted and unpushed. M3-001 through M3-004 stay accepted; M3 remains **OPEN**, live/production **NO_GO**.
- M3-005 adds a real synthetic composition test through manifest/acquisition, provenance review, the accepted repository core and transactional store port, consistent repository-backed catalog read, M3 field/read resolution, trusted reviewed criteria, and injected Project authorization checks. The reader test adapter traverses the stored course/delivery/intake hierarchy and checks the memory-store revision before returning, refusing partial/mixed results.
- Acquisition snapshot excerpts are now deduplicated, canonically ordered and lossless within the 4096-character contract bound. An over-bound set fails as `FAILED_PARSE / INVALID_CANDIDATE`, with no partial successful snapshot evidence or observations. R1 test IDs `M3-005-R1-01` and `M3-005-R1-02` pass.
- Acceptance matrix/report: [PHASE13_M3_005_OFFLINE_ACCEPTANCE_REPORT_2026_10_27.json](./tasks/PHASE13_M3_005_OFFLINE_ACCEPTANCE_REPORT_2026_10_27.json). Education suite **114 pass / 0 fail / 1 guarded PostgreSQL skip**; connected M3-005 integration **9/9 pass**; changed-file Biome and `git diff --check` pass; TypeScript **44 diagnostics, unchanged, 0 in changed paths**. Full unit **113 pass / 3 sandbox failures / 0 skip**, exact details and host rerun in the report.
- Prior M3-002 isolated PostgreSQL acceptance is historical and was not repeated. M3-005 made no live HTTP/DNS request, database connection/write, migration, AWS/model call, customer Project access, API/UI integration, school application operation or deployment. Actual source truth, admissions accuracy, real M2/M1 Project authorization, and production readiness remain unverified/NO_GO.
- **Disposition:** M3-005 **IMPLEMENTED / PENDING INDEPENDENT REVIEW**. Wait for independent review and owner-host reruns. Do not mark the M3 milestone accepted or start M3-006.
<!-- END PHASE13_M3_005_R1_IMPLEMENTED_PENDING_INDEPENDENT_REVIEW_2026_10_27 -->

<!-- BEGIN PHASE13_M3_004_OFFLINE_ACCEPTED_M3_005_READY_2026_10_27 -->
## Latest canonical Phase 13 M3 — M3-004 OFFLINE ACCEPTED, M3-005 INTEGRATION TASK PREPARED (2026-10-27)

- **Verified code SHA:** `eefb6eb7fee187e99c10790075967a73f4976f92`, owner-pushed branch `phase13-study-journey-project-centric`, independent GitHub comparison against parent `302f5a4207dc5df82867878ea2d688e5461d517b` confirmed exactly **1** fast-forward commit and **9** expected changed files (six pure offline education read/comparison/Project-options implementation+tests, three canonical state documents). Subsequent docs-only checkpoint does not alter accepted code.
- **Disposition:** M3-001 OFFLINE ACCEPTED; M3-002 DURABLE CATALOG ACCEPTED on separately approved isolated PostgreSQL; M3-003 OPERATOR-CURATED SOURCE ACQUISITION OFFLINE ACCEPTED; **M3-004 RESOLVED READ/EXPLAINABLE OPTIONS OFFLINE ACCEPTED**. Any older `M3-004-R2 pending independent review`, `uncommitted/unpushed`, `R3 needed` statuses below are **historical/superseded**. M3 overall **OPEN**, Phase 13 production/live **NO_GO**.
- **Host and review evidence:** independent source review of M3-004/R1/R2 PASS. Ubuntu M3-004 focused **28/28**, M3 full focused **103/103**, current existing `pnpm test:unit` **964/964**, all zero failed/skipped. Codex Biome/whitespace checks PASS, TypeScript remained at **44 preexisting diagnostics / zero new M3 diagnostics**. R1 fixed intake entity dates bypassing field status; numeric comparator exact immutable evidence + trusted review SHA-256/revision; malformed request generic error. R2 made zoned applicant timestamps `UNKNOWN/UNSUPPORTED_CALENDAR_DATE_SEMANTICS`, date-only comparison unchanged.
- **Acceptance document:** [tasks/PHASE13_M3_004_OFFLINE_ACCEPTANCE_2026_10_27.md](./tasks/PHASE13_M3_004_OFFLINE_ACCEPTANCE_2026_10_27.md). **Next bounded M3-005 contract:** [tasks/PHASE13_M3_005_INTEGRATION_AND_MILESTONE_ACCEPTANCE_2026_10_27.md](./tasks/PHASE13_M3_005_INTEGRATION_AND_MILESTONE_ACCEPTANCE_2026_10_27.md). M3-005 is *not implemented*. It must compose all four accepted layers in synthetic offline E2E and produce an evidence-scoped milestone acceptance matrix; do not substitute disconnected mocked outputs for a real cross-layer path.
- **Operational stop:** M3-005 does **not** authorize real CRICOS/Study Australia/institution HTTP/DNS access, application DB or even isolated PG writes, migrations, real customer Project facts/files, live Project/Chat API/UI, model/AWS, admission/CoE/visa assessment or deployment. M3-002's isolated DB test result remains historical evidence only. A genuine real-data/production pilot has separate source/permission/privacy/professional/release gates. M3 overall only becomes `OFFLINE ACCEPTED_WITH_LIMITATIONS` after M3-005 independent code review, owner-host testing and remote commit verification.
- **Next action:** owner `git pull --ff-only origin phase13-study-journey-project-centric` to sync the docs-only acceptance commit, confirm clean HEAD, then dispatch M3-005 to Codex. Codex leaves implementation uncommitted/unpushed for ChatGPT independent review. All accepted prior code stays frozen.
<!-- END PHASE13_M3_004_OFFLINE_ACCEPTED_M3_005_READY_2026_10_27 -->

<!-- BEGIN PHASE13_M3_004_R2_IMPLEMENTED_PENDING_REVIEW_2026_10_27 -->
## Latest canonical M3 checkpoint — M3-004-R2 implemented, pending independent review (2026-10-27)

- **Repository:** `phase13-study-journey-project-centric`, base HEAD `302f5a4207dc5df82867878ea2d688e5461d517b`; cumulative M3-004/R1/R2 work is uncommitted and unpushed. M3-001 remains OFFLINE ACCEPTED, M3-002 DURABLE CATALOG ACCEPTED following isolated PostgreSQL acceptance, and M3-003 OPERATOR-CURATED SOURCE ACQUISITION OFFLINE ACCEPTED. Phase 13 M3 remains OPEN; production/live remains **NO_GO**.
- **Prior accepted milestones preserved:** M3-003 code SHA `40cd52ff1d1b1fcb11810beab8801bc91cce69ac`; owner Ubuntu evidence was 24/24 dedicated, 75/75 focused M3, and 964/964 full-unit tests, with unchanged 44 TypeScript diagnostics. See [M3-003 offline acceptance](./tasks/PHASE13_M3_003_OFFLINE_ACCEPTANCE_2026_10_27.md). M3-001 and M3-002 acceptance records remain canonical below.
- **R1-01:** intake projections no longer expose stored `startDate` or `applicationDeadline` entity columns. Current dates are available only through `INTAKE_START_DATE` / `APPLICATION_DEADLINE` resolutions, preserving UNKNOWN, WITHDRAWN, STALE and CONFLICTED statuses. `read-model.test.ts` covers an entity-only deadline and all three non-current statuses.
- **R1-02:** numeric comparisons require exact institution observation/snapshot provenance and an excerpt present in the immutable snapshot, plus an injected trusted approval whose review revision and SHA-256 binding cover the reviewed evidence and comparator. Caller `APPROVED` metadata is insufficient; no prose parser or automatic VERIFIED promotion was added. `option-comparison.test.ts` covers explicitly supported synthetic IELTS evidence, mismatch, missing approval, altered threshold/unit/evidence, stale/wrong snapshot, and unrelated or unsupported numeric fields.
- **R2-01:** date comparisons now accept exact `YYYY-MM-DD` values only. Zoned timestamps return UNKNOWN with `UNSUPPORTED_CALENDAR_DATE_SEMANTICS`; no timezone or local calendar date is inferred. Source-date applicability logic is unchanged. `option-comparison.test.ts` covers date-only before/on/after cases, a positive-offset timestamp that crosses back one UTC date, a negative-offset UTC-boundary crossing, and DATE_EQUALS fail-closed behavior.
- **R1-03:** nested criteria are validated before authorization or catalog access. Malformed nested objects, unsupported entity types and field keys produce the generic `ProjectPossibleOptionsError`; `project-options.test.ts` verifies both the error and zero reader calls.
- **Validation:** all focused M3 tests passed (**11 files**, 0 failed / 0 skipped), including the three M3-004 test files. Changed-file Biome and `git diff --check` passed. TypeScript remains at the known **44 diagnostics**, with no diagnostics in the changed Education Intelligence files.
- **Full unit suite:** `pnpm test:unit` completed **113 passed / 3 failed / 0 skipped**. The sandbox failures were: `s3-preflight-cli.test.ts:53` expected `/MATTER_DOCUMENTS_S3_BUCKET and AWS_REGION are required/u` on stderr but received empty stderr; `stage3-hardening.test.ts:135` expected exit code 2 and got 1; and three `server-http-timeouts.test.ts` cases (`scoped dispatcher outlives a shorter global dispatcher`, `widget AbortController fires before the scoped dispatcher timeout`, and `successful legal-service response through the dedicated dispatcher`) failed binding `127.0.0.1` with `listen EPERM`. Exact host rerun: `cd /home/rico/immigration_ai/chatbot && pnpm test:unit`.
- **Operation boundary:** no live source request or DNS lookup, database connection/write, migration, API/UI, model call, AWS operation, production integration or M3-005 work occurred. M3-004-R2 is **IMPLEMENTED / PENDING INDEPENDENT REVIEW**. Stop before commit, push or M3-005.
<!-- END PHASE13_M3_004_R2_IMPLEMENTED_PENDING_REVIEW_2026_10_27 -->

<!-- BEGIN PHASE13_M3_003_R1_IMPLEMENTED_PENDING_REVIEW_2026_10_27 -->
## Canonical latest Phase 13 M3 checkpoint — M3-003-R1 implemented, pending independent review (2026-10-27)

- **Repository:** branch `phase13-study-journey-project-centric`, base HEAD `832922512f235695445c58ccb3c3c14367fdb4a7`; cumulative M3-003/R1 changes are uncommitted and unpushed. M3-001 remains OFFLINE ACCEPTED; M3-002 remains ACCEPTED following independent source review and guarded PostgreSQL acceptance.
- **R1 corrections:** acquisition now permits only exact immutable snapshot/observation replay. A changed snapshot, changed observation contents, or changed observation set under an existing snapshot ID returns `BLOCKED / IMMUTABLE_ID_CONFLICT` without a proposed snapshot. Distinct attempt/snapshot IDs retain A-B-A history. Ordinary requested/final URL and redirect diagnostics retain the HTTPS origin and path depth only; credentials and path, query, and fragment values are redacted. Exact source URLs remain in snapshot provenance under its review contract.
- **Offline validation:** dedicated manifest/acquisition tests **24 passed / 0 failed / 0 skipped**; existing focused M3 suite **8 files passed / 0 failed / 0 skipped**. Changed-file Biome and `git diff --check` passed. TypeScript remains at the exact **44-diagnostic** baseline, with no new diagnostics. Full `pnpm test:unit`: **113 passed / 3 failed / 0 skipped**. Failures: `s3-preflight-cli.test.ts:53` expected required-configuration text on stderr but received empty stderr; `stage3-hardening.test.ts:135` expected exit code 2 but got 1; three loopback cases in `server-http-timeouts.test.ts` failed at listener setup with `listen EPERM` on `127.0.0.1`. Host rerun: `cd /home/rico/immigration_ai/chatbot && pnpm test:unit`.
- **Operation boundary:** no official-source HTTP request, live DNS lookup, PostgreSQL connection/write, migration, or schema edit occurred. Accepted migration 0040 and the M3-002 repository remain unchanged. M3-003-R1 is **IMPLEMENTED / PENDING INDEPENDENT REVIEW**; production/live remains **NO_GO**. Stop before M3-004.
<!-- END PHASE13_M3_003_R1_IMPLEMENTED_PENDING_REVIEW_2026_10_27 -->

<!-- BEGIN PHASE13_M3_002_ACCEPTED_M3_003_READY_2026_10_27 -->
## Canonical latest Phase 13 M3 checkpoint — M3-002 ACCEPTED, M3-003 OFFLINE DISPATCH READY (2026-10-27)

- **Verified code:** branch `phase13-study-journey-project-centric`, owner-pushed M3-002 implementation SHA `bda4487f000c43f6dda2955ae28067a1938b4199` independently confirmed as EXACT remote branch tip, one fast-forward commit from `20cd1a340e3a8aa4ce05ac6dc0fe3427e2f1cf0d`, exactly **13** expected files. The following acceptance/doc-only commit does **not** modify accepted code.
- **Formal disposition:** **M3-001 OFFLINE ACCEPTED**, **M3-002 DURABLE CATALOG ACCEPTED (ISOLATED POSTGRESQL)**. Supersedes all older `M3-002-R3 pending`, `uncommitted`, and `stop before commit` status blocks below, which remain historical evidence only. M3 is **OPEN**, M3-003 is **OFFLINE IMPLEMENTATION READY**, production/live **NO_GO**.
- **Owner-host tests:** full `pnpm test:unit` **964 pass / 0 fail / 0 skip**; Drizzle `pnpm db:check` **Everything's fine** (nonfatal Response internal state warning); Codex reported 51/51 focused M3 education offline tests (separate owner-host run not captured). TypeScript unchanged 44 baseline diagnostics, zero new M3 errors. Independent R3 patch source review PASS.
- **Exact approved disposable PostgreSQL:** `immigration_ai_phase13_m3_002_test` (PostgreSQL 17.11, `rico_local`, 127.0.0.1:5432) created new and separately authorized for 0000–0039 then 0040; ledger **41**, newest `1793052726837`, seven Education tables, **50 CHECK**, **12 FK**, **5 triggers**. Guarded real PostgreSQL integration run via `--conditions=react-server`: **1 pass / 0 fail**, `M3_R3_POSTGRES_ACCEPTANCE_PASS`, rollback verified **0 rows in all seven Education tables**. 0040 SQL SHA-256 `43fef570551335d4d116ac53e4e240868240c5f4fbedc7e6b071e500bf067c96`. **No migration was applied to existing normal or production databases.**
- **Acceptance record:** [tasks/PHASE13_M3_002_ACCEPTANCE_2026_10_27.md](./tasks/PHASE13_M3_002_ACCEPTANCE_2026_10_27.md). **Next bounded work order:** [tasks/PHASE13_M3_003_OPERATOR_CURATED_OFFICIAL_SOURCE_ACQUISITION_2026_10_27.md](./tasks/PHASE13_M3_003_OPERATOR_CURATED_OFFICIAL_SOURCE_ACQUISITION_2026_10_27.md); an OFFLINE source-access manifest, injectable capture safety and curated dry-run flow using mocks. **No real CRICOS/Study Australia/institution HTTP/DNS access, no production crawl, no DB write, no customer launch or M3-004.** Separate explicit owner approval required for any real-source pilot or additional DB operation.
- **Next workflow:** owner `git pull --ff-only origin phase13-study-journey-project-centric` after this docs-only acceptance commit; verify clean HEAD; give Codex the M3-003 work order. Codex leaves code uncommitted/unpushed for independent review. Existing M2 offline acceptance with limitations, privacy/professional release gates, Phase13 production NO_GO all remain.
<!-- END PHASE13_M3_002_ACCEPTED_M3_003_READY_2026_10_27 -->

<!-- BEGIN PHASE13_M3_002_R3_IMPLEMENTATION_PENDING_REVIEW_2026_10_27 -->
## Canonical M3 checkpoint — M3-002-R3 PostgreSQL negative-test fixture repair implemented; independent acceptance pending (2026-10-27)

- **Repository state:** `phase13-study-journey-project-centric`, base HEAD `20cd1a340e3a8aa4ce05ac6dc0fe3427e2f1cf0d`; cumulative M3-002/R1/R2/R3 work remains uncommitted and unpushed.
- **Owner-reported database state:** migration 0040 has been applied to isolated `immigration_ai_phase13_m3_002_test`. The owner reports 41 migration-ledger entries, seven Education tables, 50 CHECK constraints, 12 foreign keys and five custom triggers. Codex did not connect to the database. The local 0040 migration file retains SHA-256 `43fef570551335d4d116ac53e4e240868240c5f4fbedc7e6b071e500bf067c96`.
- **R3 test correction:** the owner-reported `23505` at the delivery RecordClass test came from its cloned location/mode identity. The negative fixtures now use distinct delivery location, intake code/period and provider-scoped course codes. Host-rejection rows use unique canonical URLs. Observation FK cases isolate the requested FK where possible; cases whose shape inherently violates two related FKs accept only their explicitly named FK set. Every rejected statement now reports its case name and expected versus actual SQLSTATE/constraint.
- **Validation:** focused offline education tests passed across **6 files** (51 test declarations; 0 failed / 0 skipped); changed-file Biome passed; TypeScript diagnostics match the clean expected-HEAD baseline (**44 unchanged**, no M3 diagnostics); `pnpm db:check` and `git diff --check` passed. Full `pnpm test:unit`: **113 passed / 3 failed / 0 skipped** (116 file-level tests). Sandbox failures: S3 preflight expected `/MATTER_DOCUMENTS_S3_BUCKET and AWS_REGION are required/u` on stderr but received empty stderr; stage-3 hardening expected exit 2 and got 1; three HTTP timeout cases failed to bind `127.0.0.1` with `listen EPERM`. Host reruns: `cd /home/rico/immigration_ai/chatbot && pnpm test:unit`; isolated failures: `cd /home/rico/immigration_ai/chatbot && node --import tsx --test lib/production/s3-preflight-cli.test.ts lib/production/stage3-hardening.test.ts lib/server-http-timeouts.test.ts`.
- **Database acceptance:** the owner ran the opt-in PostgreSQL test and reported its initial fixture collision. Codex did not rerun it, connect, or execute a migration. The corrected test is **PENDING INDEPENDENT POSTGRESQL ACCEPTANCE** on the same authorized isolated database; no database reset or schema edit was made.
- **Disposition:** M3-001 remains **OFFLINE ACCEPTED**. M3-002-R3 is **IMPLEMENTED / PENDING INDEPENDENT POSTGRESQL ACCEPTANCE**. Phase 13 remains **NO_GO** for production/live use. Stop before commit, push or M3-003.
<!-- END PHASE13_M3_002_R3_IMPLEMENTATION_PENDING_REVIEW_2026_10_27 -->

<!-- BEGIN PHASE13_M3_001_CODEX_IMPLEMENTATION_PENDING_REVIEW_2026_10_27 -->
## Historical Phase 13 M3-001-R1 checkpoint — superseded by M3-001 offline acceptance

- Offline education kernel R1 corrections address disposition conflicts, RecordClass isolation and required labels, snapshot date applicability, and intake identity collisions; scope remains chatbot/lib/education-intelligence/ plus these pending-review status records.
- Focused tests **38 passed / 0 failed / 0 skipped**; changed-file Biome passed; TypeScript retains **44** documented repo diagnostics and **0** in this module; `git diff --check` passed.
- Full unit suite **113 passed / 3 failed / 0 skipped**. Failures: S3 child-stderr expectation, migration CLI exit-code expectation, and loopback `listen EPERM`; exact details and host reruns are in CURRENT_HANDOFF.md.
- At that earlier checkpoint the R1 correction packet was pending review; M3-001 was later independently accepted before M3-002 began.
<!-- END PHASE13_M3_001_CODEX_IMPLEMENTATION_PENDING_REVIEW_2026_10_27 -->

<!-- BEGIN PHASE13_M3_ARCHITECTURE_FROZEN_2026_10_27 -->
> Historical design and first-dispatch snapshot. The current milestone status is recorded in the M3-002 pending-review block above.
## Phase 13 M3 Education Intelligence — architecture frozen, M3-001 dispatched (2026-10-27)

- **Current milestone:** M3 Education Intelligence DESIGN FROZEN / M3-001 OFFLINE TASK READY / IMPLEMENTATION NOT STARTED. Owner explicitly authorized ChatGPT to record the design without a separate review cycle; this is NOT professional/legal sign-off, live-source acquisition approval or implementation acceptance.
- **Git baseline:** phase13-study-journey-project-centric at M2 final documented remote HEAD 6e502c8fb8b94b8a99efac96b60ef4786def566b before this design-only commit. Existing M2 code b4e639a9fb9cbdc92a9f6cf50bf93c6319644516 and M2 OFFLINE ACCEPTED_WITH_LIMITATIONS / PRODUCTION NO_GO remain unchanged.
- **Canonical design:** [PHASE13_M3_EDUCATION_INTELLIGENCE_ARCHITECTURE_2026_10_27.md](./PHASE13_M3_EDUCATION_INTELLIGENCE_ARCHITECTURE_2026_10_27.md), decision D-P13-008. Separate source-specific CRICOS / Study Australia / institution evidence; scoped Provider -> Course -> Delivery -> Intake; immutable snapshots and field-level source/date/fees/provenance; explicit UNKNOWN, STALE, CONFLICTED; later authorized tri-valued possible-option matching. Reuse Policy Intelligence patterns but NOT policy auto-publication semantics or M2 personal fact tables.
- **First Codex work order:** [tasks/PHASE13_M3_001_OFFLINE_SOURCE_CONTRACT_AND_FIXTURES_2026_10_27.md](./tasks/PHASE13_M3_001_OFFLINE_SOURCE_CONTRACT_AND_FIXTURES_2026_10_27.md). Pure TS offline typed contracts/identity/field resolver plus clearly synthetic ELICOS/VET/undergrad/coursework-master/research fixtures and focused tests. Codex leaves implementation uncommitted for independent patch review and host tests.
- **Forbidden in first packet:** database migrations, real course import/crawling, network/paid models, AWS/Stripe, Project or Policy serving changes, real customer data, feature activation or deployments. M2 safety/permission and customer-visible code remain untouched.
- **Next operational action:** owner fast-forward-pulls the new remote docs; Codex reads AGENTS.md, these M3 documents and canonical state, then performs only M3-001. ChatGPT reviews patch, owner validates and pushes, ChatGPT verifies remote SHA before M3-002.
<!-- END PHASE13_M3_ARCHITECTURE_FROZEN_2026_10_27 -->

<!-- BEGIN PHASE13_M2_OFFLINE_ACCEPTED_WITH_LIMITATIONS_2026_10_27 -->
## Canonical M2 offline milestone acceptance — ACCEPTED_WITH_LIMITATIONS (2026-10-27)

- **Decision:** Phase 13 M2 **offline implementation accepted with documented limitations** following ChatGPT independent cumulative-patch source review, owner-host final validation and owner push. This **supersedes historical** Round 3 "pending", "uncommitted", and "M2 remains open" entries below; retain those entries as historical implementation/review evidence only. Do not start new M2 correction cycles for non-blocking limitations.
- **Verified code:** `phase13-study-journey-project-centric` at owner-pushed `b4e639a9fb9cbdc92a9f6cf50bf93c6319644516`; independent GitHub ref and commit verification matched SHA and exact **25** files including additive 0039 migration, common resolver, all three widget routes, Legal Service schema/provider handling and state docs. Docs-only acceptance follow-up does not alter this accepted code SHA.
- **Owner final command:** shell reported `M2_FINAL_VALIDATION_PASS`, `M2_FINAL_TEST_EXIT=0`: `pnpm test:unit` **964 passed, 0 failed, 0 skipped**; `pnpm db:check` `Everything's fine`; `tests/test_phase13_project_context_provider.py` **3 passed** on approved torch Python; script's focused guarded PostgreSQL and Project resolver tests returned successfully. Codex reported an additional **1/1** populated-schema Project Document A1.1/A2, **1/1** M2-B and **1/1** M2-C guarded PostgreSQL tests and focused suites, without database reset. Drizzle diagnostic `Failed to find Response internal state key` was nonfatal; exit status was zero.
- **Implemented offline:** M2-A0 Project schema/authority, M2-A1 durable isolated Project Documents, M2-A2 bounded exact-run source evidence, M2-B versioned synthetic Project facts/confirmation/publication/revocable AI grants/conflict invalidation, M2-C provisional requirement registry, and M2-D shared server-derived per-Chat Project context across Fast/Default/Premium with pre-provider fact+authority refresh. Standalone remains conversation-scoped; Project packets contain only explicit authorized stable facts. 0039 fixed 0035 event trigger spillover without altering applied 0032–0038.
- **Accepted limitations:** No complete database-backed two-Chat full-stack E2E (composed two-Chat scenario remains in-memory plus guarded DB module tests). Historical empty-schema A1.1 integration was not rerun on populated `immigration_ai_phase13_m1_1_test`, and no reset was attempted. Real production Project Document AI context is not available; production trusted GuardDuty provenance, import consent issuance, independent AI-context grant issuance, privacy/retention approvals, real-person/guardian authority and professional review remain unresolved. Requirement templates remain provisional/collection-only.
- **Release decision:** **Production/live `NO_GO`**. No real customer files, AWS changes, production migrations or deployment are approved by M2 acceptance. These are separate release gates, not grounds to reopen completed offline M2.
- **Next step:** Future authorized milestone/product priorities only; any critical privacy/authorization/data-integrity regression may be handled as a distinct severity-gated corrective task, not endless M2 polish. See `docs/agent-memory/tasks/PHASE13_M2_ROUND3_OFFLINE_ACCEPTANCE_MATRIX_2026_10_26.md`.
<!-- END PHASE13_M2_OFFLINE_ACCEPTED_WITH_LIMITATIONS_2026_10_27 -->

<!-- BEGIN PHASE13_M2_ROUND3_D_IMPLEMENTED_REVIEW_PENDING_2026_10_26 -->
## Latest state — Round 3 Project Context resolver implemented; M2 not closed

- Base verified clean at `9fa881e70114719c7ed417ad5e58950b935f0fb2`; current changes are uncommitted/unpushed. Added a server-only persisted Project Chat resolver shared by Fast, Default and Premium through Workspace Context. It uses actor-scoped exact Chat ownership plus active Project authorization, does not infer identity from request JSON, does not load other Chat transcripts and rechecks before model submission.
- Common typed Legal Service packet contains only R1-stableProjection AI-authorized facts and bounded provenance. The three actual provider message builders include customer-confirmed-but-not-independently-verified framing. Standalone requests omit this packet.
- Document evidence is not enabled for Project AI context in production: grant issuance and accepted independent scan verification are absent. Diagnostic remains internal and typed; no extract/download permission is promoted. The in-memory synthetic two-Chat scenario covers extraction, a versioned provisional requirement, confirmation/publication/grant, retrieval, revocation and conflict invalidation; DB-backed full-stack E2E remains UNVERIFIED.
- Validation: new resolver/packet tests 8/8; Legal Service provider tests 2/2; composed facts/evidence tests 5/5; focused Project Document/fact/catalog/foundation tests passed; guarded M2-B and M2-C PostgreSQL tests 2/2 on verified disposable DB. A1.1 guarded PG suite stopped before mutation at its empty-schema precondition because 60 rows exist; not reset. Full `pnpm test:unit` passed 964/964, 0 failures/0 skips on authorized outside-sandbox retry. Biome, TypeScript comparison (44 matching baseline diagnostics, 0 in changed paths), `db:check`, and whitespace checks passed.
- `tasks/PHASE13_M2_ROUND3_OFFLINE_ACCEPTANCE_MATRIX_2026_10_26.md` is the current M2 offline acceptance matrix. Independent review and owner acceptance remain required. M2 is OPEN; production document processing disabled; trusted live readiness false/NO_GO. No AWS calls, customer files, production DB changes or deployment.
- **R1 final-review update (implemented, independent review pending):** Each widget route now calls the shared resolver's fresh pre-provider authorization and sends only its returned packet. It rechecks schema, exact Chat/Project association, active status/membership, Project Chat/context flags, stable Fact projection and any trusted evidence resolver. Revoked Fact grants/publication, conflict suppression, feature disablement, membership loss and Project closure are covered; all three provider modes consume the refreshed packet.
- **Superseded pre-0039 finding:** The first populated-schema test showed `ProjectRound2Event_binding` rejecting service events. Migration 0039 below corrects this and the expanded storage/scan/extraction test now passes. The legacy empty-schema-only A1.1 test remains unrun.
- Validation: full `pnpm test:unit` 964/964; focused resolver/workspace/document/fact regressions 10/10 file suites; Fast/Default/Premium provider tests 3/3; `db:check`, changed-file Biome and `git diff --check` pass; TypeScript is 44/44 matching baseline with no diagnostic differences. No AWS/production services, migration, deployment or feature activation. M2 remains OPEN; this is not acceptance.
- **Final database compatibility hotfix — 2026-10-27:** Added additive 0039 replacing `phase13_round2_operation_event_binding()` with an early return for all events except `project_evidence_extraction_completed` and `project_fact_changed`; those two retain strict user actor, operation type/result ID, subject kind and same-Project checks. Earlier 0032 actor/provenance validation and scanner attribution remain active. Files 0032–0038 are unchanged. The migration journal includes 0039; no Drizzle snapshot was manufactured because table/schema shape did not change.
- The identity/ledger-guarded populated DB integration applied 0039 incrementally and passed **1/1**. It validates storage service finalization/replay without duplicate audit, synthetic authenticated scan finalization/replay without duplicate run/event, forged/mismatched service identities and source versions, exact-version A2 extraction with a separate grant, denial on mismatched attestation, denial after grant revocation and source withdrawal, and continued Round2 Fact/Evidence invalid actor/subject rejection. M2-B and M2-C guarded PostgreSQL tests passed **1/1 each** after migration 0039. Existing empty-schema A1.1 test was not run/reset; no DB-backed two-Chat resolver test was added.
- Full unit **964/964**, focused context/document regressions passed, three-mode provider **3/3**, `pnpm db:check`, changed-file Biome, TypeScript **44 diagnostics identical to baseline**, and whitespace checks passed. This does not approve production GuardDuty trust, consent provenance, AI-context grants, privacy/legal review or file-processing activation. Live readiness remains `NO_GO`; M2 stays open.
<!-- END PHASE13_M2_ROUND3_D_IMPLEMENTED_REVIEW_PENDING_2026_10_26 -->

<!-- BEGIN PHASE13_M2_ROUND2_ACCEPTED_ROUND3_DISPATCH_2026_10_26 -->
## Phase13 M2 — Round2 accepted offline; Round3 D contract active (2026-10-26)

- `phase13-study-journey-project-centric` HEAD owner/remote-verified `23d97ce8883df589bba0d8ac7f2bb43d94f9ea57`, exactly 25 Round2 R1 files. Owner final host tests confirmed passed; Codex reported 964/964 unit and 2/2 guarded PG in prior final report. 0035–0038 are applied only in identity-verified disposable test DB. No prod AWS/migrations/customer data.
- A2 candidates are untrusted and require exact scanner proof+per-purpose grants; M2-B records synthetic Project-level immutable facts, creator-only confirmation vs publication vs revocable AI grant, complete-Project hidden conflict suppression with caller-private projection. No real-person or professional authority. M2-C still provisional four-family collection registry.
- M2-D final Round3 contract `tasks/PHASE13_M2_ROUND3_D_CROSS_CHAT_OFFLINE_CLOSEOUT_2026_10_26.md` specifies shared Project scope resolver, no other-member Chat transcript, all three legal widget modes common authorized context, guarded synthetic PG + fake-model tests and M2 offline acceptance matrix. Implementation pending review, M2 remains open. Production file/scanner/auth/consent/privacy gates NO_GO.
<!-- END PHASE13_M2_ROUND2_ACCEPTED_ROUND3_DISPATCH_2026_10_26 -->

<!-- BEGIN PHASE13_M2_ROUND2_R1_SECURITY_CORRECTIONS_2026_10_26 -->
## Phase 13 M2 Round 2 R1 — owner authorization and conflict privacy fixed (2026-10-26)

- **Review state:** R1 changes are cumulative, uncommitted and unpushed at base `f0e2ad4ac2b5ac2b4aadf956fbe86ef1fa2bcab4`. Independent review pending; not accepted.
- **R1-01:** `PostgresProjectFactRepository` now requires creator ownership for assertion transition, publication, AI-use grant/revoke, and supersession references. Project ownership/membership alone does not confer mutation authority. Target authorization precedes operation replay so an idempotency path cannot bypass current actor/Project or target ownership checks. Integration coverage creates two registered users on one Project with the non-creator as Project owner; denied confirm/reject/dispute/stale/supersede/publish/grant/revoke and replay attempts create no operations, events or Project revision. Creator lifecycle still succeeds; revoked membership and closed Project writes fail.
- **R1-02:** `stableProjection` uses the complete unresolved Project conflict set to exclude conflicted assertions from `authorizedForAI`, including when the counterpart is private and invisible. Returned candidate and conflict detail remains caller-scoped; the private assertion's content, source ref, provenance and IDs do not leak. A possible conflict also suppresses eligibility, with no automatic winner selection.
- **A2 attribution:** Synchronous user-initiated extraction remains attributed to its authenticated user. Any future async worker requires a distinct authorized service-principal audit path; no worker or principal implementation is included.
- **Validation:** A2/B focused regressions 7/7; guarded disposable PostgreSQL fact and M2-C suite 2/2; `pnpm test:unit` 964/964 (0 failures, 0 skips); `pnpm db:check`, changed-file Biome and whitespace checks passed. TypeScript reports 44 diagnostics, same locations/codes as saved baseline, 0 in changed paths.
- **Schema/boundaries:** No schema change was required. Applied migration files 0035–0038 were preserved without modification. Only the guarded disposable PostgreSQL database was used; no regular/staging/production DB mutation, AWS access, customer files or deployment. Production document processing remains disabled, trusted readiness false, and Project facts are not model-connected. M2-D and independent review remain outstanding.
<!-- END PHASE13_M2_ROUND2_R1_SECURITY_CORRECTIONS_2026_10_26 -->

<!-- BEGIN PHASE13_M2_ROUND2_A2_B_IMPLEMENTED_2026_10_26 -->
## Phase 13 M2 Round 2 — A2 document evidence + B versioned facts implemented (2026-10-26)

- **Review status:** Implemented on base `f0e2ad4ac2b5ac2b4aadf956fbe86ef1fa2bcab4`; cumulative changes are uncommitted/unpushed and await independent review. Not accepted.
- **A2:** Exact-version bounded extraction requires active Project/source authorization, distinct `extract` grant, injected independent authenticated scan proof for the exact Project/version/generation/object VersionId/SHA-256, exact object bytes and integrity recheck. Persisted extraction runs/units are immutable/audited; opaque refs are Project-scoped. Candidate text is untrusted and limits are 2 MB, 500 units and 2,000 chars/unit. Unsupported extraction is explicit and never fabricates evidence. Stored/legacy `clean` status does not establish malware verification.
- **B:** Added immutable synthetic Project fact assertions, evidence links, customer-attributed confirmation, separate publication, separately revocable AI-use grants, conflict retention, supersession/stale invalidation, actor-scoped operation replay and atomic Project audit/revisions. The projection is read-only and includes AI-authorized facts only when current Project access, customer confirmation, active publication, separate active grant and evidence validity all hold. No M2-D cross-Chat consumer or model integration is active. Person-scoped and professional-determination facts fail closed.
- **Validation:** Dedicated/focused A2+B and related Project tests 6/6; guarded PostgreSQL fact + M2-C integration 2/2 on the authorized disposable database; `pnpm test:unit` 964/964 (0 failed, 0 skipped); `pnpm db:check`, changed-file Biome and `git diff --check` passed. TypeScript has 44 diagnostics, unchanged against the saved pre-change baseline, with none in changed paths.
- **Migration status:** Additive migration 0035 was incrementally applied, then defects found by the guarded integration required additive corrections 0036–0038. All are now applied through 0038 only to identity-verified `immigration_ai_phase13_m1_1_test` on `127.0.0.1:5432`; the database was not reset. No ordinary, staging, or production database was touched.
- **Remaining gates:** No production runtime wiring, production malware attestation, customer file handling, or AI-context activation. The scan verifier is injected/testable and requires a separately accepted production trust source. M2-D, security/privacy review and overall M2 acceptance remain outstanding. No AWS, deployment or real customer files were accessed.
<!-- END PHASE13_M2_ROUND2_A2_B_IMPLEMENTED_2026_10_26 -->

<!-- BEGIN PHASE13_M2_ROUND1_ACCEPTED_ROUND2_DISPATCH_2026_10_26 -->
## Phase 13 M2 state — accepted Round1 at 27235af; Round2 A2+B contracted (2026-10-26)

- `phase13-study-journey-project-centric` owner pushed `27235afb944163eada77e7c68ff28f9cefd3388f`; GitHub independent branch/commit check SHA=SHA, 19 files. Ubuntu 964/964 unit, M2-C identity-verified dedicated PG 1/1, db:check 0. 0034 migration applied on isolated `immigration_ai_phase13_m1_1_test` only, no ordinary data DB mutation. A1.3 PostgreSQL adapter full system integration remains separately unverified; consent issuer missing; live file/scanner trust NO_GO.
- M2-C four template families remain synthetic provisional; no official/qualified/legal readiness inference. Round2 single source contract `tasks/PHASE13_M2_ROUND2_A2_EVIDENCE_B_FACTS_2026_10_26.md`, A2 extraction evidence/opaque exact-run refs + M2-B Project fact confirmation, publication, separately revocable AI grant and conflict lifecycle. Additive 0035 only as source/guarded disposable test; no AWS, production rollout or personal real customer data.
- Round3 M2-D cross-Chat resolver and synthetic end-to-end; M2 OPEN. Production scan attestation, file retention and real-person/guardian/professional scope remain separate owner gates.
<!-- END PHASE13_M2_ROUND1_ACCEPTED_ROUND2_DISPATCH_2026_10_26 -->

<!-- BEGIN PHASE13_M2_ROUND1_R1_CORRECTIONS_2026_10_26 -->
## M2 accelerated Round 1 R1 corrections implemented — independent review pending (2026-10-26)

- **Status:** R1 corrections are implemented on `5b8eb83318a365e8d1d69117d7ea5b89faab4083`; all changes remain uncommitted/unpushed. This is not acceptance.
- **A1.3 upload recovery:** The adapter checks its mandatory storage-result capability before creating an intent. It returns completed durable replays directly, but a pending/uncertain replay returns typed `recovery_needed` without rewriting the key. Any failure after intent creation—including object verification/capability/finalization failure—returns the same typed recovery outcome for safe reconciliation. The storage-finalization path only returns a known stored/failed/cleanup-pending result with security status still `pending`; it cannot promote a version to clean.
- **M2-C authority and privacy:** Catalog seeding and publication now require an explicit server-held maintenance authorization port; no caller user ID, Project role or request field grants publication. Content-identical publication returns the existing immutable version, and authorship/reviewer fields remain unknown/null. State and history projections check per-source read authorization and redact fact/evidence locators when access is absent or denied.
- **Historical replay:** State mutation checks current Project authorization, then resolves a prior actor-scoped operation before current template-version validation. Identical committed operations replay their saved event snapshot and original revision after supersession; new old-version mutations fail, changed operation reuse conflicts, and replay creates no additional operation, state event, Project event or Project revision. The guarded integration test covers concurrent identical updates, locator privacy, customer publication denial, duplicate publication and post-supersession replay/conflict.
- **Validation:** A1.3 adapter fakes **10/10**; M2-C offline catalog/authorization tests **5/5**; A1.3 HTTP **17/17**; Project Document service **21/21**; Project schema/foundation regressions **5/5**. Changed-file Biome, `pnpm db:check`, and whitespace validation passed. TypeScript remains **44 repository diagnostics**, with **0 in changed paths**. Full `pnpm test:unit`: **113 passed, 3 failed, 0 skipped**. Failures: `s3-preflight-cli.test.ts` received empty child stderr instead of the expected missing-config message; `stage3-hardening.test.ts` observed exit 1 instead of 2 for the stock migration CLI; three loopback tests in `server-http-timeouts.test.ts` failed with `listen EPERM` on `127.0.0.1`.
- **Database/migration status:** PostgreSQL integration is **UNVERIFIED** pending an explicitly authorized, identity-verified disposable database. Migration 0034 was not applied and no database was connected to, reset or modified in this round.
- **Remaining blockers:** PostgreSQL transaction/idempotency/privacy assertions remain unverified in the database. Durable pre-import consent issuance and trusted production scan provenance remain unresolved from Round 1; production Project Documents remain disabled and readiness false. No AWS calls, customer files, deployment or production functionality were used.
<!-- END PHASE13_M2_ROUND1_R1_CORRECTIONS_2026_10_26 -->

<!-- BEGIN PHASE13_M2_ROUND1_A_C_IMPLEMENTED_2026_10_26 -->
## M2 accelerated Round 1 — A1.3 PostgreSQL adapter + M2-C provisional registry (2026-10-26)

- **Status: implemented offline; independent review pending.** Based on `5b8eb83318a365e8d1d69117d7ea5b89faab4083` on `phase13-study-journey-project-centric`; no commit or push.
- **Workstream A:** Added a typed server-only adapter over the accepted A1.1 PostgreSQL repository and injected private object-store port. Direct upload creates the durable intent before conditional storage, verifies exact returned object identity/bytes, then finalizes through the existing repository; pending replay does not repeat an uncertain write. Exact-version download requires an injected trusted scan-readiness capability, recomputes byte size/SHA-256 and rechecks authorization after reading. Metadata remains purpose-grant scoped; withdrawal and creator-grant revocation use existing durable operations. Import consent issuance/import intentionally fail closed: A1.1 has no durable pre-import receipt issuer that can bind the required consent provenance. Production runtime is unchanged (`application: null`, readiness false, flag default-off).
- **Workstream C:** Authored additive migration `0034_phase13_m2_c_requirement_registry` and matching schema/journal/snapshot source. Added four synthetic provisional families, immutable content-hashed template versions, Project-scoped collection state, append-only state history and normal ProjectOperation/ProjectEvent revision/idempotency audit. Same-Project fact/evidence locators require an injected verifier; family/item type mismatch and cross-Project locators fail closed. Template replacement preserves old rows and reports their projections stale until reconciled. All source/reviewer provenance remains explicitly null/unknown for seeded placeholders; none are presented as official or lawyer-approved.
- **Validation:** adapter fake tests **6/6**; M2-C catalog tests **3/3**; existing Project Document service **21/21**; Project schema/foundation focused tests **2/2**; `pnpm db:check` passed; changed-file Biome passed; `git diff --check` passed. TypeScript reports **44 repository diagnostics, 0 in changed paths**. Full `pnpm test:unit`: **113 passed, 3 failed, 0 skipped**. The failures are sandbox/environment related: `s3-preflight-cli.test.ts` saw empty child stderr instead of the missing-config message; `stage3-hardening.test.ts` observed exit 1 instead of 2 with empty `POSTGRES_URL`; all 3 loopback cases in `server-http-timeouts.test.ts` failed `listen EPERM`.
- **Database status:** The dedicated M2-C guarded PostgreSQL test verified the configured URL shape, but its first connection to `127.0.0.1:5432` failed with sandbox `EPERM` before database identity could be queried. Therefore database identity, migration application and PostgreSQL integration are **UNVERIFIED**; no migration/reset/data operation occurred. The A1.1 PostgreSQL integration was not run.
- **Security/review blockers:** No standalone durable consent-receipt issuer exists for import; production exact download remains unavailable without accepted authentic scan provenance; guarded PostgreSQL behavior and migration execution remain unverified. Trusted-live readiness stays false, documents remain disabled, no AWS/customer data/production DB was accessed. This is not independent acceptance.
<!-- END PHASE13_M2_ROUND1_A_C_IMPLEMENTED_2026_10_26 -->

<!-- BEGIN PHASE13_M2_ROUND1_A_C_DISPATCH_2026_10_26 -->
## Phase 13 M2 — accepted A1.3 offline checkpoint; accelerated Round 1 planned (2026-10-26)

- Branch `phase13-study-journey-project-centric` at owner-pushed independently remote-verified `98678ba19806f2e3f916725b8bbcb0abf7b14c07`, 19 A1.3 R1 files. Owner host 964/964 unit, separate HTTP 17/17 and UI 5/5 (different Node conditions), zero failures/skips. B3 earlier offline `a14d53227003a1f9bf41bc86688995deaf63daac`. Live GuardDuty producer attestation/production worker not implemented; feature OFF and `NO_GO`.
- Next source task `tasks/PHASE13_M2_ROUND1_A13_ADAPTER_C_REQUIREMENTS_2026_10_26.md`: A1.3 durable adapter + M2-C provisional requirements **one cumulative offline task**. C may author additive 0034 migration source but not apply to production/ordinary DB. Missing qualified sources/reviewer remain provisional/unknown; Project owner does not override creator document grants. No real customer upload/AWS/production.
- Offline M2 remains open for Round 2 A2+B and Round 3 D+integrated acceptance. Commit/source review gates remain.
<!-- END PHASE13_M2_ROUND1_A_C_DISPATCH_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_3_IMPLEMENTED_2026_10_26 -->
## PROJECT_STATE — A1.3 R1 API sanitization and Project isolation implemented; review pending (2026-10-26)

- Work is uncommitted on `phase13-study-journey-project-centric` at expected HEAD `a3759ce5fc2b88e4636b7fd81d0281a1ae67bf33`. New pure HTTP handler/application port and Next route modules cover bounded list/upload, server-issued import-consent acknowledgement and import, private metadata/status, exact-version download, withdrawal and creator-grant revocation. A1.0's in-memory repository is not cast to the A1.1 PostgreSQL contract. The UI is bilingual and Project-scoped, has no fabricated records, and is off by default.
- The ordinary feature flag cannot activate the routes: the server runtime has `application: null` and an independently false trusted-live-readiness provider. Therefore production operations return 503. Current Project/membership/document grant enforcement, durable consent issuance/verifier, S3 storage/finalization and trusted exact-version scan evidence have typed application-layer seams but no production composition. Do not enable until B2 producer authentication, consent/privacy/retention approval and owner review are complete.
- R1 mutation handlers validate runtime results and emit allowlisted fields only; private keys, scan metadata and provider identifiers never enter JSON responses, malformed results fail closed, and replay semantics are preserved. Project UI identity is keyed by Project plus enabled state, with per-instance generation guards and empty-on-refresh failure behavior.
- Tests: A1.3 HTTP **17/17**, UI **5/5**, Project Document service **21/21**. Full unit **113/116 passed, 3 failed, 0 skipped**: missing child stderr in `s3-preflight-cli.test.ts`; empty-`POSTGRES_URL` migration CLI status 1 vs expected 2; three loopback `listen EPERM` cases in `server-http-timeouts.test.ts`. TypeScript **44 diagnostics, none in changed paths**; changed-file Biome and whitespace checks passed.
- No database integration, AWS/API/credentials/S3/SQS, production DB, migration, deployment or customer document processing was performed. R1 is **not acceptance**; no commit or push. Cumulative patch `~/phase13_m2_a1_3_R1_review.patch`; SHA-256 is reported with the final handoff.
- Recommended next step: build/review the concrete server-only adapter that composes accepted A1.1 repository, A1.2 exact-version storage and B3 trusted delivery; add verified durable consent provenance and owner-approved privacy/retention/readiness gates, then keep customer operations blocked pending independent review.
<!-- END PHASE13_M2_A1_3_IMPLEMENTED_2026_10_26 -->

<!-- BEGIN PHASE13_B3_ACCEPTED_A1_3_DISPATCH_2026_10_26 -->
## Project state — Phase13 B3 durable integration accepted OFFLINE; A1.3 next (2026-10-26)

- Branch `phase13-study-journey-project-centric`; GitHub independently verified new B3 R1 SHA `a14d53227003a1f9bf41bc86688995deaf63daac`, 10 reviewed files; owner local SHA and `ls-remote` match, clean working tree. Ubuntu full unit **964/964**, standalone B3 worker/PG **12/12**, all zero fails/skips. **B3 offline acceptance only.**
- Trusted GuardDuty producer proof and live worker runtime not available, no production S3/SQS. B2-1 collector live not run, synthetic pilot fully cleaned. FAILED/SKIPPED messages do not create durable A1.1 failure outcomes. Existing test DB contains fixtures; legacy A1.1 suite requiring empty schema still unverified. B2/B3 live `NO_GO`.
- Architect prepared `tasks/PHASE13_M2_A1_3_CUSTOMER_DOCUMENT_API_UI_OFFLINE_CONTRACT_2026_10_26.md` and `tasks/PHASE13_M2_A1_3_CODEX_IMPLEMENTATION_PACKET_2026_10_26.md` authorizing only Code + fake/guarded DB offline work with server flag OFF, independent live-trust gate, creator-private purpose grants/consent and bilingual UI. No migration/AWS/customer files/deploy/ordinary DB or implicit cross-Project authority. Codex cumulative patch uncommitted/unpushed for independent review.
- Subsequent M2: factual extraction/provenance/explicit confirmation/publication+AI-use grants (M2-B); provisional versioned requirements (M2-C); server-authorized cross-Chat context resolver (M2-D); comprehensive synthetic acceptance; M2 still OPEN.
<!-- END PHASE13_B3_ACCEPTED_A1_3_DISPATCH_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B3_IMPLEMENTED_2026_10_26 -->
## PROJECT_STATE — B3 R1 corrections pending independent review (2026-10-26)

- Current uncommitted B3 work is based on `c714e72566940c4f6bb24b2f8580617df6906b66` on `phase13-study-journey-project-centric`. The A1.1 PostgreSQL integration test's original replay assertions are restored; separate B3 PostgreSQL coverage verifies ACK failure after commit, identical attestation replay, modified-attestation conflict, and exactly one scan run, scan operation, security event, and project revision increment.
- The worker validates finalizer response shape and exact project/version/generation/verdict/security status before ACK; adversarial mismatches quarantine. FAILED, SKIPPED, UNSUPPORTED and ACCESS_DENIED results stay unavailable and retry to queue redrive/DLQ, with no clean promotion or ACK. A1.1 does not durably record these failed scan results; doing so needs a separately reviewed attestation-contract extension. Invalid status pairs quarantine; existing A1.2-A trust semantics are preserved.
- Validation: B3 worker **11/11**, guarded B3 PostgreSQL **1/1**, A1.1 service **21/21**, A1.2-A **17/17**, B1 **11/11**, B2-0 **16/16**. Full `pnpm test:unit`: **113/116 passed, 3 failed, 0 skipped**: empty child stderr in `s3-preflight-cli.test.ts`; `stage3-hardening.test.ts` returned 1 instead of 2 with empty `POSTGRES_URL`; three loopback `listen EPERM` failures in `server-http-timeouts.test.ts`. TypeScript: **44 diagnostics total, none in changed paths**. Changed-file Biome and whitespace checks passed.
- B3 used only the identity-verified disposable DB `127.0.0.1:5432/immigration_ai_phase13_m1_1_test`; no reset or migration occurred, and uniquely labeled synthetic audit fixtures remain. A1.1 PostgreSQL integration is **UNVERIFIED**: its empty-schema precondition is unavailable on the existing DB; the sandbox attempt failed `EPERM` before connecting. No AWS/credentials/S3/SQS, production DB, deployment or customer files were accessed.
- This is **not acceptance**. Runtime remains unwired/default-off, live readiness `NO_GO`; production producer authentication and attestation issuance remain unresolved. Preserve for independent review, then separately design/review those production integrations and authorize any live test. A1.3 and M2-B/C/D remain open.
- Cumulative R1 review patch: `~/phase13_m2_a1_2_B3_R1_review.patch`; SHA-256 is reported with the final handoff.
<!-- END PHASE13_M2_A1_2_B3_IMPLEMENTED_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B3_OFFLINE_DISPATCH_2026_10_26 -->
## PROJECT_STATE — B3 rapid offline queue-to-PG integration contracted (2026-10-26)

- Owner explicitly requested **expedited B3 development** to progress Phase 13 M2. Architect prepared `tasks/PHASE13_M2_A1_2_B3_RAPID_INTEGRATION_CONTRACT_2026_10_26.md`, Codex implementation packet `tasks/PHASE13_M2_A1_2_B3_CODEX_IMPLEMENTATION_PACKET_2026_10_26.md`, and `tasks/PHASE13_M2_RAPID_CLOSEOUT_PATH_2026_10_26.md`. New contract permits **offline code and guarded synthetic disposable-DB tests only**, not production or cloud operations.
- Base remote HEAD `7a078ed329a775e788941a44ac3809ca18da34f1`. Previously owner-run shared-account disposable AWS demonstration succeeded for synthetic TXT+folder marker (`COMPLETED/NO_THREATS_FOUND`, matched S3 Version ID), and owner deleted GuardDuty/SQS/EventBridge/S3/IAM test assets; not a B2 live provenance approval. B2-1 operator collector not executed.
- Current A1.1 `PostgresProjectDocumentRepository.finalizeScan()` already includes atomic ProjectOperation/ProjectEvent/ProcessingRun audit and provider-event uniqueness; A1.2-A provides body-bound scan context, strict GuardDuty parser and exact S3 version/sha256 read; B1 provides pure ack/retry planner. B3 coding should integrate these rather than inventing another ledger. Never mint trusted delivery from `source` JSON, queue ID or raw policy.
- Next: owner fast-forwards this docs-only change; dispatch Codex with new implementation packet; Codex leaves cumulative B3 patch **uncommitted/unpushed** for independent review. No real AWS/SQS/S3, production DB/credentials, new migration, deployment or customer files authorized. B3 offline completion does **not** close M2; remaining A1.3, M2-B (facts), M2-C (requirements), M2-D (cross-Chat resolver) tracked explicitly. Feature flags default-off and live readiness `NO_GO`.
<!-- END PHASE13_M2_A1_2_B3_OFFLINE_DISPATCH_2026_10_26 -->

<!-- BEGIN PHASE13_SHARED_ACCOUNT_SYNTHETIC_AWS_PILOT_2026_10_26 -->
## Phase 13 shared-account synthetic AWS experiment — observed pass, full test resource cleanup (2026-10-26)

- **Operator-side evidence only:** user, via AWS Console, temporarily established S3/versioning + GuardDuty Malware Protection Plan + default EventBridge rule + SQS/DLQ in the **existing shared production/staging account**, deliberately using new `phase13-` names. SQS policy granted `events.amazonaws.com` to send to exact test queue conditioned on matching `aws:SourceArn`; omitted explicit `aws:SourceAccount`. No GitHub application code or DB was deployed/touched in this experiment.
- **Observed data:** test TXT `project-document/phase13-guardduty-test.txt` 58 bytes and 0-byte folder marker each produced `GuardDuty Malware Protection Object Scan Result` `COMPLETED` / `NO_THREATS_FOUND` delivered into dedicated SQS. Exact test plan ID `14d0bb07810c52250395`, Region `ap-southeast-2`; TXT event versionId `CAcfPnJqli4jMmDxNN68geUU6dnmklRL` matched S3 Version ID confirmed by user. No SHA-256 byte recomputation, no cryptographic or independently authenticated origin, no B3 ingest or durable scan finalization.
- **Cleanup evidence:** GuardDuty test plan off, specific EventBridge rule deleted, two `phase13-b2-` queues deleted, dedicated GuardDuty test IAM role and remaining phase13 customer-managed policy deleted, S3 Empty Bucket removed 3 entries with 0 failures, and Bucket itself deleted. Existing staging queue/rule/plan/role/buckets visible intact in user screenshots. Outstanding verification: delayed Billing/Cost Explorer charges, if any.
- **Engineering state:** B2-1 **offline implementation** accepted code `e4d80cff45236e616bb03107269c055aaafb2638`; real B2-1 CLI **NOT EXECUTED** (frozen isolated-sandbox and named SSO preflight incompatible with current shared-account exploration). Pilot is **not** blanket B2-2 acceptance or production security certification. Retain `NO_GO`, explicit consents, customer-document gates and B3 separation. Before repeating with CLI, either independently review minimal shared-account architecture/contract revision and code or use properly isolated AWS sandbox; operator must separately authorize any live calls/resource recreation.
<!-- END PHASE13_SHARED_ACCOUNT_SYNTHETIC_AWS_PILOT_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_1_OFFLINE_ACCEPTED_2026_10_26 -->
## Phase 13 project state — B2-1 offline code accepted; live AWS Gate B pending (2026-10-26)

- Current source baseline: `phase13-study-journey-project-centric` at independently verified commit `e4d80cff45236e616bb03107269c055aaafb2638`, containing 12 B2-1 source/tests/state files. Contract/docs baseline `a8f2e36053987c045b8105a148e9d67497ec0c6a`. Separate operator-only AWS CLI collector and R1/R2 corrections accepted by ChatGPT source review for offline implementation. Not a live AWS validation or feature enablement.
- Test provenance: Codex separately reported B2-1 fake 28/28, B2-0 16/16, B1 evaluator 16/16, B1 queue 11/11, A1.2-A 17/17, lint/whitespace clean; 44 unchanged TS diagnostics. Owner Ubuntu `pnpm test:unit` passed **964/964** with exit 0; explicit `test:unit` command excludes new B2-1 dedicated test suite, so coverage claims remain separate.
- Invariants: existing B2-0 default offline/refusal, exact resource/identity profile gating, short-lived owner approval per AWS request, no writes/reads of objects or SQS messages, no trusted delivery/finalizeScan, source/finding provenance, redacted operator report and unconditional `NO_GO`. Self-authored approval is not cryptographically verified owner consent.
- Next owner-controlled Gate B: prepare isolated nonproduction account, preexisting exact resources (if any), named nondefault read-only SSO profile and approval outside repo. Independently authorize bounded AWS metadata read, manually run approved collector, review only sanitized findings. If infrastructure absent, return `INCOMPLETE`, do not discover/provision under B2-1. No current authorization for B2-2, B3, A1.3, production deployment, migrations or customer upload; M2-A1.2 and M2 not accepted.
<!-- END PHASE13_M2_A1_2_B2_1_OFFLINE_ACCEPTED_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_1_R2_2026_10_26 -->
## Phase 13 canonical state — B2-1 R2 correction pending final independent review (2026-10-26)

- Current uncommitted B2-1 includes R1 and R2 corrections. Numeric `execFile()` exit codes and bounded stderr are retained for safe AWS error classification; AccessDenied/NoSuchBucket, timeout, abort, missing executable, output limit and unexpected process failures remain distinct, with diagnostics sanitized. Prior R1 checks still enforce the official GuardDuty response fields, current approval at every request boundary, and explicit report/identity/incomplete-collection CLI results.
- Focused offline results: B2-1 **28/28**, B2-0 **16/16**, B1 evaluator **16/16**, B1 queue **11/11**, A1.2-A **17/17**. Full unit: **113/116 passed, 3 failed, 0 skipped** (missing-config subprocess stderr mismatch; empty-`POSTGRES_URL` migration CLI status mismatch; loopback `EPERM`). Changed-file Biome and whitespace passed. TypeScript remains at 44 diagnostics in unchanged files, none in B2-1 paths.
- No AWS API/CLI/profile, credentials, PostgreSQL, migration, S3/SQS, deployment, customer data, feature change, commit or push. Readiness remains `NO_GO`; acceptance is not claimed. Cumulative patch: `~/phase13_m2_a1_2_B2_1_R2_review.patch`.

<!-- END PHASE13_M2_A1_2_B2_1_R2_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_1_IMPLEMENTED_2026_10_26 -->
## Historical canonical checkpoint — B2-1 initial implementation before R1/R2 corrections (2026-10-26)

This checkpoint is retained for implementation history; current status and validation are in the R2 section above.

- B2-1 is implemented but not accepted, committed or pushed. Branch `phase13-study-journey-project-centric`; starting HEAD `a8f2e36053987c045b8105a148e9d67497ec0c6a`. B2-0 plan/help/collection-denial code remains unchanged.
- A separate operator-only CLI now has strict scope/approval/account/profile preflight, STS-first exact identity verification, an allowlisted read-only AWS CLI v2 runner, bounded pagination/IAM lookups/time/output/calls, sanitized errors and restrictive external reports. Observation provenance distinguishes live executor findings from fixtures. Live decisions remain unconditionally `NO_GO`; local approval is self-attested and is not verified production consent. No trust capability, customer route, scan consumer, DB behavior or feature toggle was added.
- Offline tests: B2-1 **23/23**, B2-0 **16/16**, B1 evaluator **16/16**, B1 queue **11/11**, A1.2-A adapters **17/17**. Full `pnpm test:unit`: **113/116 test files passed, 3 failed, 0 skipped** (two subprocess CLI expectations and loopback listener `EPERM`). Biome and whitespace passed. TypeScript remains at **44 diagnostics in unchanged files**, none in B2-1 paths.
- No AWS API/STS or live profile was invoked; no credential store was inspected; no database was contacted or migrated; no S3/SQS/GuardDuty action, deployment, customer file access, commit or push occurred. Cumulative patch: `~/phase13_m2_a1_2_B2_1_review.patch`.
- **Stop for independent ChatGPT source review.** Real AWS experiment requires a separate explicit owner authorization after review. B2-2, B3, A1.3, A1.2 and overall M2 remain separately gated/not accepted.

<!-- END PHASE13_M2_A1_2_B2_1_IMPLEMENTED_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_1_ARCHITECT_2026_10_26 -->
## Phase 13 canonical state — B2-1 offline execution contract frozen (2026-10-26)

- B2-0 offline security harness remains accepted at source `3f2b8744bc4ba6b99d5d2339eac1f16c5a31c33e`, docs `1fc3820b440fe1e74edbd4b24218d7717f61e234`. Existing B2-0 plan and real collection denial are immutable baseline.
- Architect-authored B2-1 contract `tasks/PHASE13_M2_A1_2_B2_1_LIVE_READONLY_EXECUTOR_CONTRACT.md` and Codex implementation packet `tasks/PHASE13_M2_A1_2_B2_1_CODEX_IMPLEMENTATION_PACKET.md` bound a separate operator-only, AWS CLI v2 *read-only* executor, identity-first exact pinning, sanitized observation reports and offline adversarial testing. No implementation or real AWS execution yet.
- Offline code dispatch is distinct from real AWS authorization; a **later explicit nonproduction isolated account/profile/resource owner consent** plus independent source review is mandatory. Existing aulawyers staging is not automatically a sandbox. Unknown security evidence -> `INCOMPLETE/NO_GO`; never mint trusted GuardDuty delivery or clean file status.
- B2-2/B3/A1.3 and M2-A1.2/overall M2 remain not authorized/accepted; Project features default-off; no database, migration, S3, SQS, GuardDuty operation or deployment approved.
<!-- END PHASE13_M2_A1_2_B2_1_ARCHITECT_2026_10_26 -->

# PROJECT_STATE
<!-- BEGIN PHASE13_M2_A1_2_B2_0_ACCEPTED_2026_10_25 -->
## Phase13 canonical state — B2-0 accepted; real AWS still gated (2026-10-25)

- **B2-0 ACCEPTED at verified remote HEAD `3f2b8744bc4ba6b99d5d2339eac1f16c5a31c33e`**, exact 15-file cumulative B2-0-R1 implementation. Historical "review pending" paragraphs below are superseded, not removed.
- Plan-only operator CLI and injected fake STS-first security evidence inspection, strict AWS identity/scope controls, redacted reports and typed B1 evidence bridge are accepted. R1 repaired matching SQS IAM `*`/`?` patterns and conflicting allows/denies plus unexpected EventBridge target transformation. No real AWS executor exists; `collect-read-only` remains blocked, `NO_GO` unchanged, no scan trust capability, no cloud/DB transaction or document processing enabled.
- Reported tests B2 **16/16**, B1 evaluator **16/16**, B1 queue **11/11**, A1.2-A **17/17**, full unit **964/964**; static patch independently source-reviewed, not retested independently. No AWS or PostgreSQL calls.
- Next architecture gate B2-1: isolated AWS sandbox profile/account/region/resource scope, read-only operator authorization, separately reviewed and allowlisted executor and local redacted observations. B2-2 cloud provisioning and synthetic scan needs separate security/privacy/retention/cost approval; B3 trusted scanning queue-to-A1.1 durable transition unapproved. **M2-A1.2 and overall M2 remain NOT ACCEPTED**, no customer data, real scan, prod enablement or AWS activation.

<!-- END PHASE13_M2_A1_2_B2_0_ACCEPTED_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_0_R1_SECURITY_EVIDENCE_2026_10_25 -->
## Phase 13 state — B2-0 R1 security evidence corrections complete, review pending (2026-10-25)

- Implemented the bounded static-evidence fixes on `phase13-study-journey-project-centric`, base HEAD `be91595757cd2b6d07067b15280b1b93f2bdb6f2`; all B2-0 and R1 work remains uncommitted/unpushed. SQS `SendMessage` wildcard grants and conflicting Deny statements no longer disappear from static analysis. EventBridge targets with `Input`, `InputPath`, `InputTransformer`, malformed shape or unexpected metadata cannot receive a local PASS. This is not a general IAM evaluator; live readiness remains `NO_GO`.
- Validation: B2 harness **16/16**, B1 evaluator **16/16**, queue **11/11**, AWS adapters **17/17**; full unit suite **964/964**, all zero failures/skips. The three previously sandbox-failing files passed **24/24** outside the sandbox. Sandbox evidence included `tsx` IPC and loopback `EPERM`; the migration test's empty `POSTGRES_URL` exits before DB construction. No AWS calls or database changes/connections. Biome and whitespace checks passed; TypeScript reports 44 existing diagnostics, none in B2 files.
- Earlier B2-0/B1/A1.2-A and migration history below is preserved. B2-0 remains REVIEW PENDING; B2-1, B2-2, B3, full M2-A1.2 and M2 remain unapproved/unaccepted. Cumulative patch: `~/phase13_m2_a1_2_B2_0_R1_review.patch`.

<!-- END PHASE13_M2_A1_2_B2_0_R1_SECURITY_EVIDENCE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_0_IMPLEMENTED_2026_10_25 -->
## Phase 13 state — B2-0 offline harness implemented, review pending (2026-10-25)

- B2-0 implementation is on `phase13-study-journey-project-centric` from required HEAD `be91595757cd2b6d07067b15280b1b93f2bdb6f2`, uncommitted and unpushed. The operator CLI is plan-only, never resolves AWS credentials, and explicitly refuses live collection pending B2-1 approval.
- New offline modules validate exact isolated-sandbox scope and time-limited approval, enumerate the fixed read-only inspection plan, and use a fixture-only STS-first sequence with wrong-account stop, bounded requests, response-size limits and sanitized observation fingerprints. The B2 schema's live decision is always `NO_GO`; incomplete IAM, event-origin, database and topology evidence stays incomplete. A B1 bridge requires explicit source parity. No trusted scan capability is issued.
- Added `tasks/PHASE13_M2_A1_2_B2_LIVE_READONLY_OWNER_RUNBOOK.md` and appended B2-0 gates to the AWS operator checklist. Earlier B1/A1.2-A and migration history is preserved. No AWS, database, migration, customer data, production route, commit or push.
- Focused tests passed: B2 harness **14/14**, B1 evaluator **16/16**, B1 queue **11/11**, A1.2-A adapters **17/17**. Changed-source Biome passed on 10 TypeScript files; project TypeScript reports **44 pre-existing diagnostics**, none on changed paths. Full unit suite: **113/116 test files passed, 3 failed, 0 skipped** (two subprocess expected-error checks and three loopback tests failed with sandbox `EPERM`). `git diff --check` and untracked whitespace checks passed. No AWS/PostgreSQL calls were made. Cumulative patch is `~/phase13_m2_a1_2_B2_0_review.patch`; its SHA and file inventory are reported with the handoff.
- B2-0 remains REVIEW PENDING; B2-1, B2-2, B3, full M2-A1.2 and M2 are not accepted/authorized.

<!-- END PHASE13_M2_A1_2_B2_0_IMPLEMENTED_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_ARCHITECT_2026_10_25 -->
## Phase13 state — B2-0 architect-owned offline harness authorized, live B2 gated (2026-10-25)

- Accepted latest B1 code `91579b3713254e328ac10f54c87ccac9eff9307a`, prior docs `d1f9c7788681d61a586c16c32530968d3d071244`; current design files `tasks/PHASE13_M2_A1_2_B2_AWS_LIVE_EVIDENCE_ARCHITECTURE_CONTRACT.md` and `tasks/PHASE13_M2_A1_2_B2_0_CODEX_IMPLEMENTATION_PACKET.md`.
- Only default-plan/mock-test code for a tightly scoped live-read-only AWS evidence harness is authorized. No real calls during B2-0 implementation. Authentication check must pin actual STS account before all resource reads. Evidence/readiness output remains `NO_GO`; AWS data and typed JSON don't self-authenticate GuardDuty origin. No file ingress, persistence bridge, AWS mutation, DB migration or customer data.
- B2-1 read-only actual AWS requires owner identity-scoped approval and source-reviewed tool; B2-2 mutating/billable synthetic sandbox trial separately gated by IAM/retention/data residency/cost; B3 scan worker separate. A1.2 and full M2 NOT ACCEPTED; all feature flags remain off.

<!-- END PHASE13_M2_A1_2_B2_ARCHITECT_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B1_ACCEPTED_2026_10_25 -->
## Phase 13 canonical state — B1 accepted, B2/B3 not authorized (2026-10-25)

- **GitHub verified accepted B1 code:** `91579b3713254e328ac10f54c87ccac9eff9307a` on `phase13-study-journey-project-centric`, exact expected 15 files and owner-reported clean worktree. Previous review-pending B1 text lower in this document is retained only for milestone history, not current status.
- M2-A1.2-B1 completes internal audit hardening migration 0033 (preserving accepted M1 invitation and A1.1 scan transactions), supplied-evidence-only AWS IAM/EventBridge/SQS readiness evaluation (**live NO_GO**), and pure queue ACK/retry/DLQ protocol with exact-body opaque transport context. R1 verifies typed EventBridge Service vs AWS/Federated principals and prevents literal token trust spoofing. No live queue authentication, SQS consumer, scan-to-`finalizeScan()` persistence wiring or AWS resource processing.
- Codex-reported guarded PostgreSQL M1.1 10/10, M2-A0 3/3, A1.1 18/18, R1 queue 11/11, evaluator 16/16, A1.2-A adapters 17/17; full B1 unit 964/964. Source patch independently reviewed, local tests not independently executed. R1 performed no database or AWS operations.
- **Next:** B2 owner-gated live sandbox account/IAM/GuardDuty/EventBridge/SQS/S3 provenance and exact-version verified synthetic evidence, database role grants and audit deletion permission checks. B2 requires architect-freeze and owner/operator approval before any live access; B3 source-authenticated worker/transaction bridge and A1.3 customer routes are separate future gates. No live AWS/customer files, production migrations, retention decisions, deployment or feature enablement authorized. M2-A1.2 and overall M2 remain **NOT ACCEPTED**.

<!-- END PHASE13_M2_A1_2_B1_ACCEPTED_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B1_R1_TRUST_BOUNDARY_2026_10_25 -->
## Current Phase 13 state — M2-A1.2-B1 R1 trust-boundary corrections, review pending (2026-10-25)

- Queue disposition requires the accepted A1.2-A `TrustedScanDeliveryContext` capability matched to the exact raw message body. Fabricated strings, manually constructed objects, casts, missing context and body substitution cannot authorize acknowledgement. The planner treats persistence outcomes as future-port assertions and does not verify or perform commits.
- SQS resource-policy assessment preserves `Service`, `AWS`, `Federated`, `CanonicalUser` and unsupported categories. Only the exact EventBridge service principal passes its queue grant; KMS required role ARNs remain checked as AWS principals. Readiness remains unconditional `NO_GO` pending B2 live verification.
- R1 tests: queue **11/11**, evaluator **16/16**, A1.2-A adapters **17/17**, zero failures/skips. TypeScript matches HEAD exactly at 44 existing diagnostics; no DB/AWS operations were performed for R1. Base B1 guarded DB results and scope remain preserved below.
- B1 remains **REVIEW PENDING**; B2/B3 are **NOT AUTHORIZED**; A1.2 and M2 are **NOT ACCEPTED**. Cumulative R1 patch: `~/phase13_m2_a1_2_B1_R1_review.patch`.

<!-- END PHASE13_M2_A1_2_B1_R1_TRUST_BOUNDARY_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B1_IMPLEMENTATION_2026_10_25 -->
## Current Phase 13 state — M2-A1.2-B1 implemented, independent review pending (2026-10-25)

- Implemented from starting HEAD `b18935f72cb92c7b6942833dbd98968072fcac13` on `phase13-study-journey-project-centric`, uncommitted/unpushed. New additive migration 0033 protects ProjectOperation, ProjectEvent and ProjectDocumentProcessingRun audit rows while preserving legitimate M1 invitation finalization and A1.1 started-to-terminal transitions; 0030–0032 remain unchanged.
- Migration 0033 was exercised only on the guarded, exact identity-verified disposable database `127.0.0.1:5432/immigration_ai_phase13_m1_1_test` (48 public tables before reset; migration head 0033 / 34 journal entries after apply). Guarded integration results: M1.1 **10/10**, M2-A0 **3/3**, A1.1 **18/18**, zero failures/skips.
- New offline server-only evidence evaluator accepts bounded supplied evidence, emits redacted PASS/FAIL/INCOMPLETE findings and unconditionally returns live `NO_GO`; the pure queue protocol handles untrusted delivery, post-commit ACK failure/idempotent replay, bounded transient retry, and quarantine/DLQ without clean promotion. Evaluator **14/14**, queue **8/8**, existing A1.2-A AWS adapter suite **17/17**, and `pnpm test:unit` **964/964**, zero failures/skips. `pnpm db:check`, changed-source Biome and whitespace checks passed. TypeScript diagnostics are identical to starting HEAD (**44 pre-existing**, none on changed paths).
- The operator checklist now names the future B2 independent AWS identity/effective-IAM/SQS checks, event spoofing and GuardDuty origin proof, exact S3 version/hash/size checks, PostgreSQL privilege isolation, retention/Object Lock/legal deletion and incident recovery, plus synthetic-only cost and rollback gates. No retention period or infrastructure value was selected.
- B1 is **REVIEW PENDING**. B2 live AWS and B3 worker/persistence are **NOT AUTHORIZED**; A1.2-B and overall M2 are **NOT ACCEPTED**. No live AWS/API, trusted scan persistence, customer files, production DB, route, feature activation, commit or push.
- Complete cumulative review patch: `~/phase13_m2_a1_2_B1_review.patch`.

<!-- END PHASE13_M2_A1_2_B1_IMPLEMENTATION_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B_ARCHITECT_FREEZE_2026_10_25 -->
## Current Phase 13 state — A1.2-B frozen, B1 implementation dispatched only (2026-10-25)

- Latest pre-B checkpoint `ad688d4f9021d277c78078fc8af85e2e588c06b6` on `phase13-study-journey-project-centric`; A1.2-A accepted and offline-only, no real AWS integration.
- Architect-owned contract `tasks/PHASE13_M2_A1_2_B_TRUSTED_DELIVERY_AUDIT_SECURITY_CONTRACT.md` and B1 Codex packet define: guarded additive migration 0033 for immutable audit/delete protection; supplied-fixture-only static AWS policy readiness assessment (always no live GO); queue acknowledgement/retry/DLQ abstract state machine. Preserve M1 preevent operation update and A1.1 terminal processing run; no real DB except the explicitly verified `127.0.0.1:5432/immigration_ai_phase13_m1_1_test`.
- Live AWS sandbox identity, queue/source anti-spoof verification, actual S3 VersionId/byte proof, DB runtime role, privacy/retention/legal-hold and costs remain B2 owner gates; authenticated queue consumer and scan persistence B3. No customer file/API/AI-context/production operations authorized. A1.2-B and full M2 not accepted; flags default off.

<!-- END PHASE13_M2_A1_2_B_ARCHITECT_FREEZE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_A_ACCEPTANCE_2026_10_25 -->
## Phase 13 current state — A1.2-A accepted, A1.2-B not approved (2026-10-25)

- **Accepted** source commit `0209f718b7ec0eca9002b86fe36023ff905453b6`, GitHub branch `phase13-study-journey-project-centric`, exactly 13 reviewed files. The current top acceptance record supersedes the historical review-pending text retained below.
- Default-off isolated `project-documents/aws/` S3 object-version adapter and GuardDuty EventBridge untrusted scan candidate correlation are implemented with injected fake-client offline tests. No actual AWS authentication, network, queue, Project API/consumer, production DB change, real scan or customer bytes enabled. GuardDuty raw event JSON cannot self-authenticate; A1.1 `finalizeScan()` is not wired.
- Codex-reported offline focused tests **17/17 PASS**, seven existing regression test files passed, changed-file Biome/whitespace passed, 44 unchanged baseline TypeScript diagnostics, full unit suite not run. ChatGPT independent static patch review completed, local test execution not repeated.
- **Next step:** architect-owned A1.2-B security/operations design and explicit owner gate for live synthetic-only AWS/IAM/KMS/SQS/EventBridge/GuardDuty exact-version proof, DB audit delete safeguards and policy/cost/retention decisions. Neither A1.2-B nor overall M2 is accepted, and customer document ingress is not authorized.

<!-- END PHASE13_M2_A1_2_A_ACCEPTANCE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_A_IMPLEMENTATION_2026_10_25 -->
## Current Phase 13 project state — A1.2-A offline adapters implemented; review pending (2026-10-25)

- Work is based on `ed41a3b935a7fe9bec86b4996812bd2671bbe4e2` on `phase13-study-journey-project-centric` and remains uncommitted/unpushed. The accepted A1.1 service, migration 0032 and schema were not changed.
- Private server-only S3 adapter code uses injected commands, default-off configuration, conditional create, SHA-256, SSE-S3, concrete VersionId, explicit-version HEAD/GET, bounded reads and exact byte verification. GuardDuty events are bounded and strictly validated but stay untrusted; an independently authenticated transport capability, persisted current target, exact S3 version and byte verification are required before returning an **untrusted candidate**. There is no live authenticator, `finalizeScan()` bridge, runtime consumer, deletion path, AWS client, or API.
- Validation: AWS fake adapter **17 passed / 0 failed / 0 skipped**; seven existing Project/schema/document test files **7 passed / 0 failed / 0 skipped**; Biome passes. Current and HEAD-baseline TypeScript output match exactly at **44 pre-existing diagnostics**, with no new AWS-module diagnostics. Full unit suite and DB/AWS integration were not run; no database/AWS resources were accessed. `git diff --check` and untracked whitespace checks passed.
- A1.2-B still requires live account/region/IAM/queue proof, exact-version scan provenance, database audit deletion protection, privacy/residency/retention/erasure/legal-hold and cost decisions. The new operator checklist records these gates without choosing policy values. A1.2 and M2 remain **NOT ACCEPTED** pending independent review and later owner authorization.
- Cumulative uncommitted patch: `~/phase13_m2_a1_2_A_review.patch`.

<!-- END PHASE13_M2_A1_2_A_IMPLEMENTATION_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_ARCHITECT_GATE_2026_10_25 -->
## Current Phase13 project state — A1.2 architecture frozen, A1.2-A not yet implemented (2026-10-25)

- Current verified prior GitHub HEAD `c95282aed8d913c22875a8b38906b4a8f60e59cb` on `phase13-study-journey-project-centric`; A1.0 and A1.1 accepted, A1.2 not accepted.
- New architect-controlled `tasks/PHASE13_M2_A1_2_PRIVATE_S3_TRUSTED_GUARDDUTY_ARCHITECTURE_CONTRACT.md` and `tasks/PHASE13_M2_A1_2_A_CODEX_IMPLEMENTATION_PACKET.md` define safe offline-only adapter work. GuardDuty AWS published events carry S3 versionId and scanStatus; require exact version/bytes plus independently proven delivery authorization. Raw event JSON or ETag cannot certify a clean document.
- A1.2-A may be owner-dispatched solely for injected-mock code, no external calls or runtime route; S3/Object Lock/IAM/queue configuration, real GuardDuty verification, PostgreSQL audit DELETE protection, data retention/erasure and production billing are A1.2-B blockers requiring owner/operator policy. No real customer file, paid scan or Project AI/context use approved. Flags remain default-off.

<!-- END PHASE13_M2_A1_2_ARCHITECT_GATE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_1_OWNER_ACCEPTED_2026_10_25 -->
## Current Phase 13 project state — A1.1 accepted, A1.2 unapproved (2026-10-25)

- Accepted branch `phase13-study-journey-project-centric` implementation HEAD `752311535645343343d1e81ab569d5816e9608d5` (owner local/remote SHA equal, clean local worktree; independent GitHub 14-file commit verification). M2-A0 migration 0031 and M2-A1.0 synthetic service remain accepted; A1.1 adds internal PostgreSQL repository and new additive 0032 transaction/audit migration only.
- A1.1 R1 guards terminal document scan-status provenance and exact-version reads against forged clean status, with user/service principal audit attribution and Project revision/event atomicity. Guarded synthetic tests locally reported A1.1 17/17, M1.1 10/10, A0 3/3, full unit 964/964. No live scan, S3, customer document pipeline, production migration or runtime API. Full M2 NOT ACCEPTED.
- A1.2 must close exact-byte immutable-object scan attestation and persistent audit deletion/retention/principal permission risks before considering real adapters. A1.3 public/customer APIs and AI-context/facts remain separate later owner gates. Preserve existing feature flags default-OFF.

<!-- END PHASE13_M2_A1_1_OWNER_ACCEPTED_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_1_R1_SCAN_PROVENANCE_2026_10_25 -->
## Current Phase 13 state — M2-A1.1 R1 scan provenance/schema parity fixed; independent review pending (2026-10-25)

- Preserved the complete A1.1 worktree on `phase13-study-journey-project-centric` at base HEAD `c859a97ce98c219a7adf18e35c229de6e26ed94d`; uncommitted and unpushed. Migration 0032 now guards pending-to-terminal security changes against exact storage identity and matching scan result, rejects terminal rewrites, and checks the final service-authored operation/event audit at transaction commit. The repository read gate also verifies exact clean scan and audit evidence in addition to current Project authority and the exact active purpose grant.
- Drizzle's `ProjectOperation_actor_type_check` mirrors SQL's lowercase 64-character service digest requirement. No snapshot change was needed because Drizzle snapshots do not represent CHECK constraints; `pnpm db:check` passed. Migration 0030 and 0031 were not modified.
- Guarded PostgreSQL results: A1.1 **17/17**, M2-A0 **3/3**, M1.1 **10/10**; full unit suite **964/964**, all with zero failures/skips. Changed-source Biome, snapshot Biome lint, `git diff --check`, and untracked whitespace checks passed. TypeScript reports **44 existing diagnostics, none in changed A1.1 paths**. Only `127.0.0.1:5432/immigration_ai_phase13_m1_1_test` was used after identity verification.
- Scan provenance remains synthetic and is not a claim of actual malware scanning. No migration 0033, APIs, AWS/S3, production scanner, real customer documents, production behavior, commit or push. A1.1 and overall M2 remain **NOT ACCEPTED** pending independent review. Cumulative patch: `~/phase13_m2_a1_1_R1_review.patch`.

<!-- END PHASE13_M2_A1_1_R1_SCAN_PROVENANCE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_1_IMPLEMENTATION_2026_10_25 -->
## Current Phase 13 state — M2-A1.1 durable implementation complete; independent review pending (2026-10-25)

- Preserved implementation on `phase13-study-journey-project-centric` at base HEAD `c859a97ce98c219a7adf18e35c229de6e26ed94d`; no commit or push. Additive migration 0032 and Drizzle metadata extend durable Project document intents, synthetic import-consent receipts, worker actor audit, object-version identity and scan-event fingerprints. Existing migration 0030/0031 files remain unchanged.
- An isolated server-only PostgreSQL repository now provides synthetic-only durable intent/replay, storage/scan state transitions, creator purpose grants, withdrawal and scoped reads with Project revision/Event atomicity and worker/user identity checks. No route/runtime consumer, actual upload/download, S3/scanner adapter, AI context or production feature was added. Synthetic consent and scan verification do not establish production provenance.
- Validation: A1.1 PostgreSQL **15 passed**, M1.1 **10 passed**, M2-A0 **3 passed**, and `pnpm test:unit` **964 passed**, all zero failures/skips. `pnpm db:check`, changed-source Biome, snapshot lint and whitespace validation passed. TypeScript remains at **44 diagnostics outside A1.1 changed paths; 0 within them**. The only database used was the guarded disposable `127.0.0.1:5432/immigration_ai_phase13_m1_1_test`.
- A1.1 and overall M2 remain **NOT ACCEPTED**; independent patch review is next. Cumulative uncommitted patch: `~/phase13_m2_a1_1_review.patch`.

<!-- END PHASE13_M2_A1_1_IMPLEMENTATION_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_1_ARCHITECT_CONTRACT_2026_10_25 -->
## Current Phase 13 state — M2-A1.1 contract authored, no code yet (2026-10-25)

- Current accepted A1.0 `a5cee03aabfa1609b8fda5b5d030a393da2d8638`; docs-only checkpoint `22baeb8e6c453bbd8e9045569df2083028cb3fd7`; `phase13-study-journey-project-centric`.
- Architect-owned A1.1 contract and implementation packet are checked into `docs/agent-memory/tasks/`; next owner-dispatched bounded target is 0032 additive user/service actor audit + durable Project document intent/consent, synthetic Postgres repository and guarded tests only. No real scanner, actual files, public routes, grant sharing, AI-context or migration of customer database is authorized.
- After Codex returns an **uncommitted** cumulative patch, independently review tests and code. A1.1/overall M2 NOT ACCEPTED. M1.4, A0, A1.0 remain accepted; maintain default-off flags and prior source privacy decision gates.

<!-- END PHASE13_M2_A1_1_ARCHITECT_CONTRACT_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_0_ACCEPTANCE_2026_10_25 -->
## Current Phase 13 project state — M2-A1.0 accepted (2026-10-25)

- Accepted pushed implementation: `a5cee03aabfa1609b8fda5b5d030a393da2d8638` on `phase13-study-journey-project-centric`; local and remote SHA match, GitHub confirms 9 exact files; local worktree clean. R1 consent-at-entry and operation-hash requirement independently source-reviewed.
- Project Document Service now has **synthetic, in-memory core only** (5 new TS files, test registration). 21 focused tests and five Project regression files are user/Codex-reported PASS; no full suite; 44 repository baseline TypeScript errors elsewhere. No actual DB persistence, object storage, scan proof, customer route, AI-context grant or live file processing.
- M2-A0 migration `0031_sour_scarecrow` remains accepted and inert. Next gate is architect-owned M2-A1.1 additive 0032 persistence/audit/concurrency contract and independent review. Professional/personal-data retention, source-import consent provenance and provider-linked exact immutable-object scanner proof remain open for future real-file use. M2 overall NOT ACCEPTED and feature flags remain default-OFF.

<!-- END PHASE13_M2_A1_0_ACCEPTANCE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_0_R1_IMPORT_CONSENT_2026_10_25 -->
## Current Phase 13 state — M2-A1.0 R1 import consent enforced; review pending (2026-10-25)

- Preserved the A1.0 implementation on `phase13-study-journey-project-centric`, base HEAD `f77fc8975a88768d5769b8903d6aedf63351a8b2`; all work is uncommitted/unpushed. The import API input requires `consentAccepted`, checks strict `true` before Project/source authorization or source/storage effects, and includes the acknowledgement in the canonical operation hash.
- Regression tests cover explicit consent success, false/missing/runtime-invalid rejection before source access, zero asset/version/operation/object side effects, Project owner denial of another member's file, source digest/length integrity and source ownership revoked before finalization. The acknowledgement remains a synthetic flag, not durable or authenticated production consent; A1.1/A1.3 must establish its provenance and UI acceptance.
- Validation: focused tests **21 passed / 0 failed / 0 skipped**; existing Project regressions **5 files passed / 0 failed / 0 skipped**; Biome passed on `chatbot/package.json` plus **5/5 module files**; TypeScript no-emit reported **44 diagnostics outside the module and 0 within it**. Full `pnpm test:unit` was not run. `git diff --check` and untracked whitespace checks passed.
- No schema/migration, API, auth infrastructure, AWS/scanner adapter, DB, production behavior, commit or push change. Independent review remains pending.
- Updated cumulative review patch: `~/phase13_m2_a1_0_R1_review.patch`.

<!-- END PHASE13_M2_A1_0_R1_IMPORT_CONSENT_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_0_IMPLEMENTATION_2026_10_25 -->
## Current Phase 13 state — M2-A1.0 service core implemented; independent review pending (2026-10-25)

- Bounded internal implementation is present on `phase13-study-journey-project-centric` at base HEAD `f77fc8975a88768d5769b8903d6aedf63351a8b2`; all work remains uncommitted/unpushed. M2-A1.0 is implemented, not accepted. M2-A1/M2 and real Project file operations remain unaccepted and unauthorized.
- New module files are limited to `chatbot/lib/project-documents/{types,ports,testing,service,service.test}.ts`; `chatbot/package.json` registers the focused test in `test:unit`. The injected fake repository/store/verifier exercise Project authorization, individual Chat-source ownership, new immutable copy semantics, bounded format/hash/length validation, storage-vs-scan lifecycle, creator-only exact-purpose grants, current authorization, clean-read gates, terminal scan identity/replay, idempotency, cleanup, and fail-closed revocation/withdrawal. Metadata and operation results do not expose the storage key or filename.
- Evidence: focused service **19 passed / 0 failed / 0 skipped**; existing Project foundation/schema/policy/HTTP regressions **5 files passed / 0 failed / 0 skipped**; Biome passed on `chatbot/package.json` and **5/5 new module files**. TypeScript no-emit produced **44 diagnostics outside the new module; 0 within it**. Full `pnpm test:unit` was not run.
- No schema or migration edits, DB writes, durable repository, route/runtime consumer, S3/AWS/GuardDuty adapter, real-file use, flag change, parser/extraction, FactAssertions, AI-context use, Phase 12 MatterDocument/Standalone/ConversationTurn changes, deployment, commit or push. No database or external service was used. A1.1 remains responsible for DB transaction/revision/event/worker durability. Stop for independent architecture/source review.
- Complete cumulative uncommitted patch: `~/phase13_m2_a1_0_review.patch`.

<!-- END PHASE13_M2_A1_0_IMPLEMENTATION_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_ARCHITECT_DESIGN_2026_10_25 -->
## Current Phase 13 project state — M2-A1 architecture defined (2026-10-25)

- M2-A0 accepted implementation `b6cdd46d1a7289bccb30cb2257de613f5ea121f3`, previous docs `5db5a564d29c755de733f2765c42880a6ad42cf1`. M2-A1 not implemented.
- **Design source:** `docs/agent-memory/tasks/PHASE13_M2_A1_PROJECT_DOCUMENT_SERVICE_ARCHITECTURE_CONTRACT.md`. Private Project-file semantics, dedicated immutable bytes, exact-version scan attestation, distinct grants; no original MatterDocument mutation; no member transcript/file sharing by Project membership.
- **First execution packet:** `docs/agent-memory/tasks/PHASE13_M2_A1_0_INTERNAL_SERVICE_CORE_IMPLEMENTATION_PACKET.md`, synthetic offline service ports and state-machine tests only. Explicit owner authorization is needed to run it; no DB schema, external storage, routes or UI.
- Pending: owner file consent/recipient/retention decisions; actual scan event immutable-object binding; worker audit principal; review of generic POST /api/projects feature flag gap. M2 overall, M2-A1 and production release remain NOT ACCEPTED. Keep existing flags default-off.

<!-- END PHASE13_M2_A1_ARCHITECT_DESIGN_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A0_OWNER_ACCEPTED_2026_10_25 -->
## Current Phase 13 project state — M2-A0 accepted, no real file pipeline (2026-10-25)

- GitHub HEAD `b6cdd46d1a7289bccb30cb2257de613f5ea121f3`, branch `phase13-study-journey-project-centric`, exactly 11 M2-A0 implementation/validation/state files committed; verified remote SHA matches owner-provided local SHA and status clean.
- Inert ProjectDocumentAsset/Version/Grant/ProcessingRun schema and `0031_sour_scarecrow` are accepted with R1 terminal-run immutability. Test claims are local/agent-reported: M2 PostgreSQL 3/3, unit 2/2, M1.1 10/10; full unit and M1.2/M1.3 not rerun for R1. No runtime API or scanner exists; ordinary local `chatbot`, production and staging migrations were not approved.
- Current architecture source: `tasks/PHASE13_M2_001_PROJECT_DATA_FACTS_DOCUMENTS_CONTRACT.md` (architect-controlled R1). Before implementing M2-A1 the owner must resolve sharing/consent and file handling policy gates, professional/privacy/retention constraints, and independently trustworthy scanner events. M2-A1 and entire M2 remain unaccepted. Phase13 Project Chat flag stays default-off; original generic project-create rollout caveat remains.

<!-- END PHASE13_M2_A0_OWNER_ACCEPTED_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A0_R1_TERMINAL_STATE_FIX_2026_10_25 -->
## Current Phase 13 state — M2-A0 R1-01 terminal processing-run immutability fixed (2026-10-25)

- The `0031_sour_scarecrow` processing-run trigger blocks any changed completed/failed row with SQLSTATE `23514` and `ProjectDocumentProcessingRun_terminal_immutable`; exact no-op updates and one-time started-to-terminal transitions are tested.
- Guarded results: M2-A0 PostgreSQL **3/3**, M1.1 PostgreSQL **10/10**, focused unit **2/2**, all with zero failures/skips. `db:check`, Biome and `git diff --check` passed. Only loopback `immigration_ai_phase13_m1_1_test` was used; M1.2/M1.3 and full unit suite were not rerun.
- The R1 correction changed only migration 0031, its M2-A0 PostgreSQL regression test, and the current-state records. No snapshot/schema update, migration 0032, commit, push, or deployment. M2-A0 remains unaccepted pending independent review.

<!-- END PHASE13_M2_A0_R1_TERMINAL_STATE_FIX_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A0_IMPLEMENTATION_2026_10_25 -->
## Current Phase 13 state — M2-A0 inert document schema implemented; independent review pending (2026-10-25)

- M2-A0 implementation is uncommitted on `phase13-study-journey-project-centric` at baseline HEAD `f7640a8757f6fd4752ddbe4c9172e78e3b9d9dab`; no commit, push or deployment.
- Added four Project document schema entities and additive migration 0031, with same-Project composite FKs, restrictive deletes, immutable identity, unique storage/version/generation/event constraints, bounded checks and pending storage/security defaults. No application routes or runtime consumers exist. Project Chat and Standalone behavior, migration 0030 and the ConversationTurn ledger remain unchanged.
- Validation: focused unit/M1 regressions **6 passed**; guarded M2-A0 DB integration **3 passed**; guarded M1.1/M1.2/M1.3 **10/10, 7/7, 1/1**; zero failures/skips. `pnpm db:check`, source/test/package Biome, generated metadata lint, `git diff --check` and untracked whitespace checks passed. TypeScript remains at 44 baseline diagnostics with 0 in changed files. Full `pnpm test:unit` not run.
- Database target was only loopback `immigration_ai_phase13_m1_1_test`; all integration rows were synthetic. No regular/shared/live database or external service was used.
- M2-A0 is implemented but not accepted. Independent source review remains pending. R1 does not define authority-basis/service-principal code allowlists; stored codes have no runtime authority until a later authorized writer validates them.

<!-- END PHASE13_M2_A0_IMPLEMENTATION_2026_10_25 -->

<!-- BEGIN PHASE13_M2_001_ARCHITECT_CONTROLLED_R1_2026_10_25 -->
## Current Phase 13 project state — M1.4 accepted, M2-001 architect-owned R1 (2026-10-25)

- M1.4 canonical committed code baseline: b8d7133eb6e7afd50fd199795ebe47e25aa53a77; remote SHA verified. Owner-run suite 941/941, no skips. Bounded local browser acceptance complete; broader account/mobile/English and production gates remain open.
- Architectural next source: docs/agent-memory/tasks/PHASE13_M2_001_PROJECT_DATA_FACTS_DOCUMENTS_CONTRACT.md. ChatGPT authored the R1 as requested; previous local Codex proposal is superseded and must be preserved as an uncommitted draft/stash. Design does not itself constitute approved owner privacy/professional decisions.
- Immediate possible engineering task: tasks/PHASE13_M2_A0_SCHEMA_FOUNDATION_IMPLEMENTATION_PACKET.md, strictly inert additive schema and guarded isolated tests, only when separately launched. Real Project document storage, scanning, facts, shared memory, requirement publication, deployment and live migrations are NOT started.
- Feature flags stay default off. Existing generic POST /api/projects gate discrepancy remains. Standalone and legacy Phase 12 files/turns remain independent.

<!-- END PHASE13_M2_001_ARCHITECT_CONTROLLED_R1_2026_10_25 -->

<!-- BEGIN PHASE13_M1_4_R4_BACK_NAVIGATION_2026_10_25 -->
## Current Phase 13 state — M1.4 R4 Project panel back-navigation usability (2026-10-25)

- Preserved the complete M1.4/R1/R2/R3 uncommitted implementation on `phase13-study-journey-project-centric` at `b806aa8df4537505b863a51a64acb91bd4072993`. M1.4 remains unaccepted and pending independent review. No commit, push, deployment or production activation.
- Back to all conversations is now a separate full-width, 40px minimum-height button at the top of the selected-Project panel, with a left arrow, localized existing copy, contrasting surface, hover/focus-visible treatment and disabled styling tied to unsafe navigation. Existing click behavior only clears Project selection; it does not modify conversations. Title, ID, Project Chat list and primary create action remain unchanged.
- Focused tests verify both locales, native button semantics, disabled state, title-row separation, the 250px desktop column, mobile single-column layout and long-ID wrapping. Focused Project/Workspace tests: **4 passed / 0 failed / 0 skipped**; Biome: **2 files passed**; `git diff --check` passed. Full unit/database/paid AI tests were not run for this visual-only fix.
- R4 changed `chatbot/components/project-entry-panel.tsx`, `chatbot/lib/workspace/project-entry.test.ts` and these three current-state records. No controller/business, schema, API, authorization, origin, persistence, turn, document, flag or deployment changes.
- Complete cumulative review patch: `~/phase13_m1_4_R4_review.patch`.

<!-- END PHASE13_M1_4_R4_BACK_NAVIGATION_2026_10_25 -->

<!-- BEGIN PHASE13_M1_4_R3_DOCUMENT_PANEL_2026_10_25 -->
## Current Phase 13 state — M1.4 R3 Project document-panel compatibility (2026-10-25)

- Preserved the M1.4/R1/R2 uncommitted worktree on `phase13-study-journey-project-centric` at `b806aa8df4537505b863a51a64acb91bd4072993`. M1.4 remains unaccepted; independent review and browser acceptance are pending. No commit, push, deployment, production enablement or M2 work.
- Project-origin Workspace panels now suppress conversation-document reads and uploads, show a concise Chinese/English unavailable message, and clear/hide any previous conversation files/errors. A keyed panel plus request-sequence check prevents delayed Standalone responses or errors from appearing after a switch into Project Chat. The separate account-wide file history remains unchanged. Standalone reads continue while busy; busy state still disables uploads and other writes.
- Regression outcomes: focused Workspace/API/turn **9 files passed / 0 failed / 0 skipped**; final outside-sandbox `pnpm test:unit` **940 passed / 0 failed / 0 skipped**. Initial sandbox suite: **111 passed / 3 failed / 0 skipped** in `s3-preflight-cli`, `stage3-hardening`, and `server-http-timeouts`; the complete outside-sandbox rerun passed. Changed-file Biome checked **12 files**; TypeScript has the unchanged **44 baseline diagnostics** and zero in changed paths; tracked `git diff --check` and untracked-file whitespace validation passed. PostgreSQL was not rerun because no database/API contract changed.
- R3 source/test files: `chatbot/components/immigration-ai-workspace.tsx`, `chatbot/components/matter-documents-panel.tsx`, `chatbot/lib/matter-documents/workspace-panel.ts`, `chatbot/lib/workspace-copy.ts`, `chatbot/lib/workspace/stage2-context-ui-wiring.test.ts`. The three current-state documents record this outcome. No schema/migration, document API, authorization, reasoning pipeline, Project upload, deployment or live system change.
- Complete cumulative review patch: `~/phase13_m1_4_R3_review.patch`.

<!-- END PHASE13_M1_4_R3_DOCUMENT_PANEL_2026_10_25 -->

<!-- BEGIN PHASE13_M1_4_R2_BOUNDARY_FIX_2026_10_24 -->
## Current Phase 13 state — M1.4 R2 authorization-state boundary fix (2026-10-24)

- Preserved the complete M1.4/R1 worktree on `phase13-study-journey-project-centric` at base HEAD `b806aa8df4537505b863a51a64acb91bd4072993`. All changes remain uncommitted/unpushed. M1.4 is still awaiting independent review and browser acceptance; M2 has not started.
- Fixed create-after-refresh handling: `refreshProjects()` now reports success, authorization denial, transient failure or supersession. After a successful POST but 401/403 Project refresh, the create flow does not reinsert or select the returned Project. The R1 cache/selection/Chat/pagination clear and pending Chat-list sequence invalidation remain intact. 503/network failures do not take the revocation path.
- Verified by deterministic tests: POST 201 followed by Project-list 403 and pending scoped Chat 403 leaves `projects=[]`, `selectedProjectId=null`, `chats=[]`, `nextCursor=null`; a delayed successful Chat-list response also cannot restore stale state. Existing successful creation/idempotency and R1 busy-state protections still pass.
- Validation: focused M1.4/Workspace regressions **8 files / 0 failed / 0 skipped**; full unit suite **937 passed / 0 failed / 0 skipped**; changed-file Biome **9 files passed**; tracked/untracked `git diff --check` passed. TypeScript remains at 44 baseline diagnostics with none in changed files. No PostgreSQL rerun was needed; no database/API/schema contract changed.
- R2 changed only the Project-entry controller/test and these three state documents. No schema/migration, server authorization, M1.3 Turn Ledger, production, AWS or deployment change. `PHASE13_PROJECT_CHAT_ENABLED` remains default-off and the generic Project-create flag caveat is unchanged.
- Complete cumulative review patch: `~/phase13_m1_4_R2_review.patch`.

<!-- END PHASE13_M1_4_R2_BOUNDARY_FIX_2026_10_24 -->

<!-- BEGIN PHASE13_M1_4_R1_CORRECTIONS_2026_10_24 -->
## Current Phase 13 project state — M1.4 R1 corrections implemented; awaiting review (2026-10-24)

- Preserved M1.4 UI changes on branch `phase13-study-journey-project-centric`, base HEAD `b806aa8df4537505b863a51a64acb91bd4072993`; work remains uncommitted. No M1.4 acceptance, M2 work, commit, push or production activation.
- Project panel navigation receives the Workspace's current active-turn/loading state. Buttons and handler entry points block Project selection, Project Chat opening/creation and navigation while busy; idle re-enables controls. A delayed Project Chat creation response does not open/replace the active conversation while the Workspace has become busy.
- Project list refresh 401/403 clears cached Projects, selected Project, scoped Chats and pagination and invalidates pending Chat-page responses. Network errors/503 preserve cached scope for retry. Added regression coverage for definitive and transient cases.
- Validation: focused M1.4/Workspace/API/turn suite **8 files, 0 failed, 0 skipped**; full configured `pnpm test:unit` **934 passed, 0 failed, 0 skipped** outside sandbox; Biome **9 changed app files passed**; `git diff --check` passed. TypeScript remains at 44 baseline diagnostics, none in changed paths. PostgreSQL suites were not repeated: no database/API/schema contract was affected.
- No migration/schema, server auth, M1.3 Turn Ledger, deployment, AWS, production or shared database change. Feature flag remains default-off; generic `POST /api/projects` remains an explicitly documented rollout caveat. Independent R1 review is pending.
- Complete uncommitted review patch: `~/phase13_m1_4_R1_review.patch`.

<!-- END PHASE13_M1_4_R1_CORRECTIONS_2026_10_24 -->

<!-- BEGIN PHASE13_M1_4_IMPLEMENTATION_2026_10_24 -->
## Current Phase 13 project state — M1.4 minimal Project Workspace UI implemented (2026-10-24)

- M1.4 UI implementation is present as uncommitted work on `phase13-study-journey-project-centric`, base HEAD `b806aa8df4537505b863a51a64acb91bd4072993`. The initial required preflight found this exact HEAD and a clean worktree. No commit/push/deploy or production enablement.
- Existing AI Workspace now exposes Project creation and expandable active Project list under a server-derived registered-customer + Project Chat feature capability. It uses only current `/api/projects` and `/api/projects/{id}/chats` contracts. Project identity is date plus short ID; no unsupported Project name/type/Offer/CoE values are collected or shown.
- Project selection lists only current API-authorized own Chats; new Project Chat uses existing operation-ID idempotency; opening uses established history/turn paths. Standalone creation remains available and retains policy binding; stale Standalone transcript/case/files/context are hidden while browsing a Project. Closed/feature-disabled Chat history remains Project-origin/read-only. No fake Project document/fact/progress/review surface exists.
- **Rollout caveat:** generic Project creation through `POST /api/projects` is not currently guarded by `PHASE13_PROJECT_CHAT_ENABLED`; UI controls are server-gated, API-level flag enforcement remains a separately reviewed backend concern. Flag was not enabled.
- Verified: full `pnpm test:unit` **930 passed / 0 failed / 0 skipped** outside sandbox; focused regressions **8 test files passed / 0 failed / 0 skipped**; guarded M1.1/M1.2/M1.3 PostgreSQL suites **18 passed / 0 failed / 0 skipped** on the fixed disposable `immigration_ai_phase13_m1_1_test` only (M1.1 suite used its guarded reset because it requires an empty schema). Changed-file Biome (9 files) and `pnpm db:check` passed; `git diff --check` passed. TypeScript still reports 44 baseline diagnostics, zero in M1.4 changed paths. No browser visual/E2E run was available.
- No migration/schema, server API authorization, deployment configuration, ordinary/shared/live DB, production traffic or external system was changed. Project documents and later application/professional workflows remain out of scope. Independent M1.4 source review is pending.

<!-- END PHASE13_M1_4_IMPLEMENTATION_2026_10_24 -->

<!-- BEGIN PHASE13_M1_4_OWNER_ACCEPTED_UI_PLAN_2026_10_24 -->
## Current Phase 13 project state — M1.3 remote PASS, M1.4 UI design authorized (2026-10-24)

- Remote GitHub `phase13-study-journey-project-centric` HEAD `27ceb8a3e75456f3357027e368565674687a3896`, matches owner local SHA; `git status --short` empty. M1.3 37 changed files committed; Project Chat AI write enablement remains off by default.
- Owner accepted the lawyer-inspired **product UX direction**, recorded in `PHASE13_UI_PRODUCT_BLUEPRINT_2026_10_24.md`. M1.4 bounded UI implementation specified in `tasks/PHASE13_M1_004_MINIMAL_CUSTOMER_WORKSPACE_CONTRACT.md`. These are design documents, **not a claim that new M1.4 UI has been coded**.
- M1.4 scope: existing APIs only, explicit Project entry and own Chat, safe origin, active-only Project picker, closed own Chat history via read-only global list, responsive CN/EN. No M1.4 schema/migration/data mutation; no shared project files, step workflows, facts or professional review.
- Future M2/M4/M5–M9 features and licensed professional/education/legal criteria require distinct approvals. No live customer feature activation, tests or database changes in this documentation commit.
<!-- END PHASE13_M1_4_OWNER_ACCEPTED_UI_PLAN_2026_10_24 -->

<!-- BEGIN PHASE13_M1_3_R1_SECURITY_CORRECTIONS_2026_10_24 -->
## Current Phase 13 status — M1.3 independent review R1 corrections (2026-10-24)

- **R1-01:** Legacy Vote GET/PATCH now check persisted Project origin before normal Chat lookup and reject Project-linked Chats. Any inability to establish origin fails closed. Executable handler tests verify active/revoked membership cases are both denied and Standalone owner voting still works.
- **R1-02:** Project history SQL visibility and Project-specific Chat listing enforce current registered-customer eligibility with the established M1.1 definition (`User.role = 'user'`, email does not match shared `guestRegex`). These checks cover listing, count, detail, messages and relevant Project history consumers; Standalone history remains unrestricted by this additional Project eligibility predicate. Existing Project writes/turn admission continue to guard current eligibility.
- **Verified outcomes:** focused tests **6 files passed, 0 failed, 0 skipped**; guarded M1.3 PostgreSQL suite **1 passed, 0 failed, 0 skipped** on `immigration_ai_phase13_m1_1_test`. Coverage includes executable scoped ingress, current role/guest identity denial for canonical owner, active and revoked history, revoked voting, closed read-only history, Standalone history, and the preserved concurrent turn-claim/revocation race. Changed-file Biome passed (7 files); `git diff --check` passed; TypeScript still has 44 baseline diagnostics and none in R1-changed areas.
- **Database/schema:** guarded status before/after reports the same fixed disposable target and 42 public tables. Integration inserted and cleaned generated fixtures only; no reset, migration, schema edit, shared/live database or production operation.
- Existing M1.3 WIP is preserved and remains uncommitted on `phase13-study-journey-project-centric` at base HEAD `5704520b54921590dfe11facb1570090e2b69f98`. No commit or push. Independent security/source review is pending.

<!-- END PHASE13_M1_3_R1_SECURITY_CORRECTIONS_2026_10_24 -->

<!-- BEGIN PHASE13_M1_3_IMPLEMENTATION_2026_10_24 -->
## Current Phase 13 status — M1.3 Project Chat Integration implemented (2026-10-24)

- **Checkpoint:** `phase13-study-journey-project-centric` at base HEAD `5704520b54921590dfe11facb1570090e2b69f98`; M1.3 changes are uncommitted and await independent source/security and integration review. No commit, push, deployment or live enablement.
- **Implemented boundary:** Project Chat create/list APIs reuse the existing M1.1 atomic create operation. History list/count/detail/messages/title update require persisted Project origin, the individual Chat creator and Chat owner, and current owner/active-Membership authority. Revoked creators cannot read; closed Project and emergency-disabled history remain read-only. Fast/Default/Premium widget turns serialize Project row lock, current user/Membership authorization, Chat ownership and the existing ConversationTurn claim in a short PostgreSQL transaction; no lock spans AI inference. The generic `/api/chat` path rejects Project IDs before standalone fallback.
- **Minimal Workspace compatibility:** server origin and read-only flags are honored. Active Project Chat supports chat turns only; M1.3 does not provide Project documents/context, guided application intake, lawyer/staff access, or the M1.4 create/select UI. Project writes/turns are default-off under `PHASE13_PROJECT_CHAT_ENABLED`; no customer-facing flag was enabled.
- **Validation:** guarded disposable PostgreSQL M1.1 **10/10**, M1.2 **7/7**, M1.3 **1/1**; all zero failures/skips. `pnpm test:unit` outside sandbox **911/911**, zero skips. Changed-file Biome **30 files passed**, `pnpm db:check` passed, `git diff --check` passed. TypeScript remains at the established **44 unchanged-file diagnostics**, with none in M1.3 changed areas. Three initial in-sandbox subprocess/localhost failures individually passed outside the sandbox; the later complete unit suite passed.
- **Database/schema:** the guarded operator reset and M1.1 migration proof used only `immigration_ai_phase13_m1_1_test`; M1.2/M1.3 suites then ran sequentially on that same disposable target. Existing migration 0030/schema/journal/snapshot were not edited. No ordinary/shared/live database was modified and no new migration was created.
- The M1.3 contract-preparation block below remains preserved as a historical checkpoint; this status supersedes its “not started” statement. M1.4 and Project evidence/context remain deferred. Professional/legal-admissions matrices remain **PROVISIONAL**.

<!-- END PHASE13_M1_3_IMPLEMENTATION_2026_10_24 -->

<!-- BEGIN PHASE13_M1_3_PLAN_2026_10_24 -->
## Current project state — M1.2 committed; M1.3 implementation design ready (2026-10-24)

- **Verified remote checkpoint:** M1.2 implementation committed and pushed as `7dfcb6c720d1227cd5dd6a0bbd94d310399daa09`, confirmed directly against GitHub branch `phase13-study-journey-project-centric`; user reported a clean local worktree. Owner-run disposable PostgreSQL suites: M1.1 **10/10**, M1.2 **7/7**; these are not a claim that the previous complete unit suite is all green.
- **M1.3 design:** [PHASE13_M1_003_PROJECT_CHAT_INTEGRATION_CONTRACT.md](./tasks/PHASE13_M1_003_PROJECT_CHAT_INTEGRATION_CONTRACT.md) is the bounded implementation packet. Reuse M1.1 atomic Project Chat creation, integrate own-Chat Project create/list and history/detail/update, enforce Project+individual Chat authorization, and serialize Project permission check with the existing turn claim in a short transaction at Fast/Default/Premium ingress.
- **Read-only semantics:** closed Project and emergency feature disablement preserve only a still-authorized creator's own Project-origin history; revocation denies history, no Project turns/writes, no silent Standalone relabel. Standalone/legacy paths must not regress.
- **Scope/state:** M1.3 implementation **not started at this documentation checkpoint**; no new migration/database/deployment/professional rule is authorized. M1.4 Workspace UI and later Project evidence/workflow remain deferred. The M1.3 plan is ready for the user's next Codex implementation action; do not mistake this doc commit for implemented code.
- **Artifact location preference:** user-requested patches or MD exports outside the repo go under `~/`, never `/tmp/`; test software may use its own internal temporary storage.

<!-- END PHASE13_M1_3_PLAN_2026_10_24 -->

<!-- BEGIN PHASE13_M1_2_FINAL_REVIEW_R1_2026_10_24 -->
## Current Phase 13 status — M1.2 Final Review R1 correction (2026-10-24)

- Restored `lib/policy-intelligence/editorial-api.test.ts` in `test:unit`, retaining `lib/projects/http.test.ts` and all other existing test entries.
- User-executed local PostgreSQL validation, **reported by the user and not run by Codex**: M1.1 **10 passed, 0 failed, 0 skipped**; M1.2 **7 passed, 0 failed, 0 skipped**; **17 passed total**. This is later evidence than the previous Codex sandbox run, which could not access the guarded database. No database was accessed or modified by Codex in this R1 task.
- Focused Codex checks: 3 configured test files passed (editorial API, M1.1 unit, M1.2 HTTP); both required test paths are present in `test:unit`; package Biome and `git diff --check` passed. Full `pnpm test:unit` was not rerun for this correction; its prior result was 106 passed and 3 sandbox-sensitive failures.
- No schema, migration, architecture or unrelated source changes. M1.3/M1.4 remain deferred. No commit or push.

<!-- END PHASE13_M1_2_FINAL_REVIEW_R1_2026_10_24 -->

<!-- BEGIN PHASE13_M1_2_IMPLEMENTATION_2026_10_24 -->
## Current Phase 13 status — M1.2 membership implementation awaiting database review (2026-10-24)

- M1.2 bounded APIs/repository lifecycle are implemented at branch `phase13-study-journey-project-centric`, HEAD `8519a6af59988a0e690dea5b334a0344269ff025`; no commit or push. The accepted contract-freeze documentation WIP is preserved.
- Authentication uses the server session and current database User row, requiring regular, non-guest role `user`. Project authority is ownerUserId or current active customer Membership. Pending invitations are visible only to the invitee through a minimal inbox; revoked Membership grants no access. No duplicate owner Membership, staff customer access, email-verification gate or cross-member Chat access was introduced.
- Invite/accept/revoke are operation → Project → Membership transactions; successful transitions atomically persist membership state, one Project revision and a linked event. Neutral invite replay does not mutate membership/revision/events. Closed projects, stale revisions, idempotency conflicts and unauthorized/cross-project resources fail closed. Schema readiness requires the full existing five-table M1.1 shape and critical indexes.
- Focused tests: **15 passed** (5 M1.1 utility/replay and 10 M1.2 HTTP). Normal `pnpm test:unit`: **106 passed, 3 failed, 0 skipped** among 109 test-file subprocesses; three pre-existing failures involve missing subprocess stdout, an unexpected migration CLI exit code, and localhost `EPERM`. The 8 relevant Conversation/turn-ledger regression files passed. `pnpm db:check`, changed-file Biome and `git diff --check` passed. TypeScript reports its existing 44 diagnostics, none in changed files.
- The fixed disposable PostgreSQL integration test could not be run: `pnpm phase13:m1.1:test-db status` reports `isolated_database_url_missing`; M1.1 and M1.2 guarded suites each explicitly skip 1 test with 0 pass/fail. No database was connected to, reset, migrated, queried or modified. Concurrency and rollback behavior awaits that run.
- No new migration or schema change; M1.1 Migration 0030, snapshot and journal remain unchanged. No live/shared system or customer-facing activation. M1.3 widget integration and M1.4 Workspace remain deferred; legal/admissions matrices remain PROVISIONAL.

<!-- END PHASE13_M1_2_IMPLEMENTATION_2026_10_24 -->

<!-- BEGIN PHASE13_M1_2_CONTRACT_2026_10_24 -->
## Current Phase 13 status — M1.2 contract frozen (2026-10-24)

- Verified checkpoint: phase13-study-journey-project-centric at committed HEAD 8519a6af59988a0e690dea5b334a0344269ff025; worktree was clean before this documentation update. M1.1 is committed. The M1.1 “uncommitted” block below is a preserved historical execution-time status from HEAD 83286fdafe66615f4293f742cd82d0de0f70f940.
- At branch phase13-study-journey-project-centric and committed HEAD 8519a6af59988a0e690dea5b334a0344269ff025, M1.1 is complete, independently reviewed and committed. Its earlier “uncommitted” status below is retained as a historical execution-time record.
- D-P13-006 records the owner’s three accepted decisions. The [M1.2 contract](./tasks/PHASE13_M1_002_MEMBERSHIP_AUTHORIZATION_CONTRACT.md) is OWNER ACCEPTED — M1.2 TECHNICAL CONTRACT FROZEN and READY FOR BOUNDED IMPLEMENTATION AUTHORIZATION. M1.2 implementation remains unstarted and requires independent review plus separate implementation authorization.
- A neutral invitation attempt uses the existing ProjectOperation resultKind=project/resultId=same Project; a created invite resolves to its same-Project Membership. Neutral attempts persist no Membership, Project revision or ProjectEvent. Repository validation enforces the mapping; no migration is proposed.
- M1.3 Chat/widget integration and M1.4 Workspace UI remain deferred. Professional/legal-admissions matrices remain PROVISIONAL.
- Documentation only. No application code, schema, migration, database, test or live system was changed or run.

<!-- END PHASE13_M1_2_CONTRACT_2026_10_24 -->

<!-- BEGIN PHASE13_M1_1_IMPLEMENTATION_2026_10_24 -->
## Current Phase 13 status — M1.1 Project Foundation implemented (2026-10-24)

- M0-004 remains **PASS** and D-P13-002 through D-P13-005 remain the accepted technical foundation. M1.1 implementation is complete within its authorized scope; no M1.2–M1.4 behavior is implied.
- Added `StudyJourneyProject`, `ProjectMembership`, `ProjectConversation`, `ProjectOperation` and `ProjectEvent`, plus repository operations for create, close, current authorization, idempotency, revision/event persistence and atomic Project Chat foundation creation.
- Migration `0030_demonic_the_hood` was generated as an additive journal index 30 and applied only to the fixed disposable M1.1 database. SQL includes PostgreSQL checks omitted by Drizzle Kit 0.25 snapshot serialization. The target has 31 migrations and zero test rows. No normal `chatbot`, staging, production or shared database was migrated or modified.
- R1-01 reproduced and corrected: ordinary unit runner no longer imports the server-only repository for pure canonicalization/operation-ID/hash/replay tests; repository remains server-only. R1-02 now proves the five ProjectEvent CHECK/unique failures by exact SQLSTATE and constraint using valid references. Migration 0030 and manual CHECKs remain unchanged.
- Final R1 validation: isolated integration **10 passed, 0 failed, 0 skipped**; configured `pnpm test:unit` outside sandbox **888 passed, 0 failed, 0 skipped**; focused ordinary-runner regressions **6 files passed**; `pnpm db:check` and `git diff --check` passed. Biome check passed the 6 changed TypeScript/schema/package files and lint passed all 8 changed TypeScript/JSON files; formatter differences are limited to preserved Drizzle-generated snapshot/journal output. Sandbox-only full run had three unrelated `EPERM` subprocess/localhost failures. TypeScript reported the same 44 diagnostics in unchanged files; no changed M1.1 file was named.
- Worktree is dirty with the uncommitted implementation; HEAD remains `83286fdafe66615f4293f742cd82d0de0f70f940`. Exact changed-file inventory and lock-order evidence are in [CURRENT_HANDOFF.md](./CURRENT_HANDOFF.md).
- Known cross-row limits: current active-member authorization and Project revision/event alignment are transactionally checked after Project-then-Membership locks; owner-membership exclusion must be enforced by M1.2 membership commands. No trigger, backfill or generic permission engine was added.
- Next work is separately gated: M1.2 membership APIs; M1.3 Chat/widget authorization integration; M1.4 minimal Workspace entry. Project documents, context, applications, staff/professional workflows, payment and external submission remain excluded. Legal/admissions matrices remain **PROVISIONAL** and relevant professional/privacy decisions remain pending.

The earlier 2026-10-23 M0-004 status snapshot below is preserved as history.
<!-- END PHASE13_M1_1_IMPLEMENTATION_2026_10_24 -->

<!-- BEGIN PHASE13_M0_004_REVIEW_2026_10_23 -->
## Current Phase 13 M0-004 review status

- Review report: [PHASE13_M0_004_ARCHITECTURE_FREEZE_REVIEW.md](./tasks/PHASE13_M0_004_ARCHITECTURE_FREEZE_REVIEW.md).
- M0-004 review delivered; awaiting independent architecture and owner acceptance. Architecture is not frozen and M1 is not authorized.
- F-01/F-02 require owner decisions before M1: compose Project membership with existing Chat-owner checks, and preserve authorized access to persisted Project Chat turns during feature rollback.
- ApplicationParty normalization and staged ProjectApplication subtype enforcement are recommended for later owner decision. Correct Offer condition-first diagram before M5. The source-verified storage-to-clean contradiction blocks actual Project document use until separately fixed and tested, but does not block the M1 Project-only foundation.
- LF-01–LF-08, LF-D01–LF-D09, the four matrices, third-party-funds custody, disclosures, and retention remain pending with the appropriate owners/professionals. No approval is claimed.
- Documentation only; no implementation, migration, database/cloud/payment operation, external submission, paid call, or tests.
<!-- END PHASE13_M0_004_REVIEW_2026_10_23 -->

<!-- BEGIN PHASE13_M0_003_REVIEW_2026_10_23 -->
## M0-003-R2 Independent Review

- Technical architecture review: PASS.
- M0-003-R2 design accepted for M0-004 review.
- Lawyer feedback recorded in:
  [PHASE13_LAWYER_FEEDBACK_DELTA_2026_10_23.md](./tasks/PHASE13_LAWYER_FEEDBACK_DELTA_2026_10_23.md).
- Legal/admissions matrices remain provisional.
- M0-004 and M1 have not started.
- Architecture is not yet frozen.
<!-- END PHASE13_M0_003_REVIEW_2026_10_23 -->

<!-- BEGIN PHASE13_M0_003_2026_10_23 -->
## Phase 13 M0-003-R2 final consistency and lawyer feedback integration delivered (2026-10-23)

- **M0-003-R2 DELIVERED — AWAITING INDEPENDENT REVIEW.** Revised design: [PHASE13_M0_003_WORKFLOW_POLICY_DESIGN.md](./tasks/PHASE13_M0_003_WORKFLOW_POLICY_DESIGN.md). No owner acceptance, architecture freeze, implementation, legal advice or professional approval is claimed. The independent review accepts all eight R1 corrections; they remain preserved.
- Contract activation SHA: `a234e4ff4ad0124e2ed522579e6a26075f34f273`; read remotely. The local branch/HEAD remain `phase13-study-journey-project-centric` / `355721919d049d16070dfc887105d3c2a943afaa`; existing M0-003 WIP was preserved, with no branch movement or history rewrite.
- R2 adds nonblocking Student 500 preparation alongside strict source-backed admission-anchor checks at affected Managed gates; separate Offer/acceptance/condition/acknowledgement/CoE dimensions; a separate client/third-party funds concept beside the proposed service-fee ledger; versioned Comprehensive GS Working Draft and Official GS Question Answers; and separate security/extraction/authenticity/sufficiency states plus bounded professional-review suggestions. OSHC nationality feedback remains a provisional comment requiring source, temporal and human verification.
- Latest annotated lawyer PDF was not located. The checked-in V0.1 PDF has only URL-link annotations; owner comments are recorded provisionally. School/admissions/Student 500 matrices remain PROVISIONAL. Fund ownership/accounting/custody/licensing/account category, permitted combinations and payment-evidence privacy remain OWNER/FINANCE/COUNSEL/PRIVACY PENDING. The existing MatterDocument storage-to-clean contradiction remains an implementation prerequisite before real Project file use.
- Documentation only; no implementation, SQL, migration, database, AWS/S3, Stripe, money movement, external submission, paid call, legal-source fetch or tests. M0-004/M1 have not started; architecture remains unfrozen. Diagram-renderer limitation, `git diff --check`, changed files and exact local status are in the handoff.
<!-- END PHASE13_M0_003_2026_10_23 -->

<!-- BEGIN PHASE13_M0_003_ACTIVATED_2026_10_23 -->
## ACTIVE: Phase 13 M0-003 workflow / policy governance design (2026-10-23)

- **Verified M0-002-R1 GitHub SHA:** `355721919d049d16070dfc887105d3c2a943afaa` on `phase13-study-journey-project-centric`; independent review **PASS WITH FOLLOW-UP CONDITIONS**, sufficient for **M0-003 technical design**. The M0-002 review does *not* approve final PostgreSQL schema, professional legal criteria, retention policy or live release. Full design: [PHASE13_M0_002_DATA_AUTH_DESIGN.md](./tasks/PHASE13_M0_002_DATA_AUTH_DESIGN.md).
- **Current task:** [PHASE13_M0_003_WORKFLOW_POLICY_CONTRACT.md](./tasks/PHASE13_M0_003_WORKFLOW_POLICY_CONTRACT.md) — **READY / NOT STARTED**. Produce a documentation-only design for school + Student 500 state machines, versioned source/rule governance, bounded AI task planning, separated self/managed submission gates, policy-change invalidation and M0-004 review.
- **Outstanding technical follow-ups captured in M0-003 task:** FactAssertion/ApplicationParty composite FK uniqueness versus partyRole; M2 generic application staged before M5/M7 subtype enforcement; *one real payment* covering multiple contract/application fee allocations.
- **Critical existing code risk:** legacy MatterDocument storage transition appears to mark `securityStatus=clean` on `stored` independent of scanner verdict; code change requires a separately scoped authorization and tests before real Project document use. M0-003 changes no code.
- School/admissions/Student-500 facts and evidence PDFs remain **PROVISIONAL** pending qualified lawyer/education-agent review. Owner can authorize synthetic/de-identified foundational development later without waiting for those legal checks, but M0-004 technical freeze and separately authorized implementation scope come first.
<!-- END PHASE13_M0_003_ACTIVATED_2026_10_23 -->

<!-- BEGIN PHASE13_M0_002_2026_10_23 -->
## Phase 13 M0-002-R1 architecture corrections delivered (2026-10-23)

- Verified remote M0-001 commit: `0d17ab34db7ceae55ad6df57ebce0b6a850b31f7` on `phase13-study-journey-project-centric`. ChatGPT independently reviewed the audit, confirmed the chat-scoped file deletion/S3 object cleanup conflict against source code, and approved **proceeding to M0-002 specification**. This is NOT final M0 architecture freeze or lawyer approval.
- M0-001 report: [PHASE13_M0_001_AUDIT_RESULT.md](./tasks/PHASE13_M0_001_AUDIT_RESULT.md). Active task: [PHASE13_M0_002_DATA_AUTH_CONTRACT.md](./tasks/PHASE13_M0_002_DATA_AUTH_CONTRACT.md).
- **M0-002-R1 DELIVERED — AWAITING INDEPENDENT REVIEW.** Revised [PHASE13_M0_002_DATA_AUTH_DESIGN.md](./tasks/PHASE13_M0_002_DATA_AUTH_DESIGN.md) on the expected branch/HEAD, preserving the original Project-owned versioned-document proposal and adding the source-verified scanner-state correction, Project-level multi-application engagement coverage, concrete PostgreSQL isolation constraints/tests, split readiness gates, fact/evidence distinctions, staged M1–M8 entity introduction, development-safe defaults, and no default second reviewer. Neither architecture nor legal standards are marked approved.
- At the M0-002-R1 checkpoint, M0-003 had not started. R1 was documentation only; no code, SQL, migration, database, AWS/S3, Stripe, external submission, paid model call or tests were run. Production scanner behavior was not observed. Provisional school/admissions/visa matrices, customer disclosure, contract/fee, retention/legal-hold and conflict policies remain pending.
- Provisional school/visa baselines remain lawyer/agent **PENDING**. Staff reviewer approval is required for managed school and visa packages, and is separate from contracts/payment/consent; self-service never acquires fake lawyer approval.
<!-- END PHASE13_M0_002_2026_10_23 -->


<!-- BEGIN PHASE13_STUDY_JOURNEY_2026_10_23 -->
## ACTIVE - Phase 13 Study Journey M0 preparation (2026-10-23; provisional)

**Owner decision:** Proceed with implementation preparation on `phase13-study-journey-project-centric` (reference base `8b963eea1aa4023d30f31eba816a545efaa65e3d`). Six design/PDF/PNG assets remain in `doc/`. The lawyer/education-agent has **not yet reviewed** the four fact/document matrices, which are `PROVISIONAL`. Start M0 design and read-only source audit now; no legal-rule approval, schema migration, code rollout, live submission, DB/AWS mutation or paid model call is authorized by this entry.

**Current canonical plan:** [PHASE13_STUDY_JOURNEY_ROADMAP.md](./PHASE13_STUDY_JOURNEY_ROADMAP.md) (M0-M10, all gates), and [M0-001 task contract](./tasks/PHASE13_M0_ARCHITECTURE_AUDIT.md). **M0-001: INDEPENDENT AUDIT REVIEW COMPLETE; ADVANCE TO M0-002 DESIGN (not overall M0 signoff).** [Audit report](./tasks/PHASE13_M0_001_AUDIT_RESULT.md) was prepared at `88385f2c0bff0ad636bfca7439d40ccc673ae2ef` on `phase13-study-journey-project-centric`. The older Architecture V2 PDF remains a design reference; this roadmap documents later owner changes (lawyer school review, professional engagement/contract/offline fee, independent self service, project human messaging, staff dashboard). D-009's no-Project restriction applied to Phase 12 only; Phase 13 design is separately owner-authorized without changing legacy data.

**Invariants:** Standalone Chat remains standalone; only explicitly created Projects get Study Journey functions. Each Project keeps private facts/files across its Chat threads, but never automatically across Projects. AI investigates and drafts; mandatory professional review is not satisfied by AI. Managed school/visa external submission requires appropriate contract/payment terms/explicit customer authorization and lawyer approval for the exact application package; self submission is independent of VIP, has clear risk/scope disclosure, no false lawyer approval. Existing code/Stripe/Policy Intelligence should be reused, not duplicated.

**Working agreement:** First execute docs-only M0-001 source audit; owner reviews it; M0-002/M0-003/M0-004 freeze actual contracts and controls; only then authorize M1 code. Preserve pending bugs as history; report them if directly blocking Phase 13 or safety-critical.
<!-- END PHASE13_STUDY_JOURNEY_2026_10_23 -->



<!-- BEGIN AWS_STAGING_FAST_GPT6_CORRECTION_2026_10_14 -->
## 2026-10-14 AWS Staging current revision correction — Web :45

**Current ECS Web Task Definition: `immigration-ai-staging-web:45` (NOT :44).** The original Stage 3 Web :44 config omitted `FAST_LUNA_MODEL`; Fast's code default was `gpt-5.6-luna` despite setting `DEFAULT_AGENT_MODEL=gpt-6-luna`. Owner deployed `:45` with explicit `FAST_LUNA_MODEL=gpt-6-luna`; AWS CLI returned success after `services-stable`, running 1 task. Other defaults/Legal Check/Checker/Premium config were already GPT-6 family. Deliberate `GENERAL_QA_MODEL` and `REASONING_MODEL` still `gpt-5.4-mini`. Policy Sync remains `:11` with `gpt-6.1-sol`. No new image or DB migration. Per-request provider model identity has not been separately observed after :45. [Operational history](./deployments/AWS_STAGING_PHASE12_STAGE3_2026-10-14.md).
<!-- END AWS_STAGING_FAST_GPT6_CORRECTION_2026_10_14 -->


<!-- BEGIN AWS_STAGING_STAGE3_DEPLOYED_2026_10_14 -->
**Latest operational state (2026-10-14): Stage 3 SOURCE COMMITTED + AWS STAGING DEPLOYED / OWNER ACCEPTED.** Branch `codex/phase12-stage3-policy-intelligence`, deployed commit `b760c028674efe4fd40190d8b212167729e74348`. The old sections below describing Stage 3 as uncommitted or undeployed are historical. [Detailed AWS staging deployment and rollback handoff](./deployments/AWS_STAGING_PHASE12_STAGE3_2026-10-14.md).

- Staging AWS `747452892291`, `ap-southeast-2`; Web ECS `immigration-ai-staging-web:44` deployed successfully (1/1 running, ALB healthy); old `:43` kept for reference. Default/Checker/Fast family `gpt-6-luna`, Premium `gpt-6.1-sol`; underlying Legal Service and Chatbot image digests are in the deployment record.
- Secure RDS chatbot DB `0029` verified post-migration; backup `immigration-ai-staging-secure-pre-stage3-20261014` encrypted and available. Policy Sync task `immigration-ai-staging-policy-sync:11` configured for `gpt-6.1-sol`; enabled EventBridge Scheduler points to `:11` (`cron(0 6 * * ? *)`).
- Fast/Legal Check/Premium owner smoke and Chatbot → Legal Service HTTP 200 evidence: **PASS**. Other optional broad tests: **owner waived**. First scheduled sync execution: **not observed**. Formal Gate 3 (and older Gate 1/2) NOT retrospectively certified; production not deployed. Owner directed STOP testing and avoid further AWS work until new request or observed defect. Refer to deployment record for precise evidence and recoverability limits.

---
<!-- END AWS_STAGING_STAGE3_DEPLOYED_2026_10_14 -->


**Updated:** 2026-10-13 (Stage 3 R2 corrections recorded; D-068)
**Project:** Immigration AI / Australian immigration & study service platform  
**Repository:** `jiangdizhao/immigration_ai`

## Phase 12 Stage 3 — R1 + R2 + R3 + D-070 corrections implemented (D-067/D-068/D-069/D-070, 2026-10-13; worktree only)

**Status:** Stage 3 is implemented, R1-corrected, R2-corrected, R3-corrected and D-070-corrected in the uncommitted working tree of `codex/phase12-stage3-policy-intelligence` (base `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419`). Nothing committed/pushed/migrated into a protected database/deployed; Gates 1–3 remain NOT ACCEPTED.

**D-070 authority correction (owner-directed):** the Admin account is the firm's principal lawyer — a *verified* Admin holds full Policy Intelligence editorial authority inherently (no grant, revocation cannot remove it) and also manages grants; verified lawyers with an active grant hold the same editorial capabilities without grant management; verified lawyers without a grant, ordinary users (even with a forged grant row) and unverified accounts are denied. Enforced database-authoritatively in `requirePublicationAuthority`/`canEdit`/`requireOperatorWorkflowAuthority`, so every editorial entry point, the operator submit/list workflow and `/policy-editor` access inherit it; the Admin Policy Intelligence page uses its audited archive/restore controls again. Normal local acceptance is the existing `chatbot` database on port 3000 with existing accounts (isolated DB only for destructive automated tests); migrations 0027–0029 are additive-ready with owner-run preflight/execution instructions recorded in the handoff.

**R3 security corrections (D-069):** (1) **P0** — grant/revoke are now two explicit intents (`activatePolicyEditorGrant`, and an update-only `revokePolicyEditorGrant` that can never insert), so a revoke of a never-granted or already-revoked user is a controlled, audited no-op (`not_granted` / `already_revoked`) that cannot create permission, while an explicit re-grant reactivates it; (2) **P1** — operator submission listing enforces the same authority contract as submission (verified lawyer + active Policy Editor grant) inside the service, closing an authenticated-but-unauthorized read of the operator queue; (3) **P2** — draft history wording now describes a bounded recovery window (≤25 saves / 2 MB per revision).

**R2 corrections (D-068):** (1) a manual draft records its published baseline and `publishManualRevision` rejects a superseded baseline under the item row lock (409 `stale_publication_conflict`, detail `draft_baseline_superseded`) so an older draft can never replace a newer lawyer's publication; (2) additive migration `0029` adds the append-only `PolicyIntelligenceDraftSnapshot` table storing the complete document of every human draft save with bounded retention (25 saves / 2 MB per revision; newest never pruned), retrievable via `GET /api/policy-editor/drafts/history` and loadable in the workspace — the audit row keeps only a labelled change summary plus the snapshot link, and published revisions stay immutable; (3) the Admin Policy Intelligence page is read-only monitoring plus grant management (Archive/Restore controls removed) and grant management requires a verified administrator identity, while ordinary admins still never gain publication authority; (4) `resolveHeldRevisionItemStatus` stops a held AI analysis from relabelling a protected, already-published editor-approved revision while preserving the original hold behaviour for unprotected items; (5) item insertion is conflict-free (`insertItemIfSlugAvailable` → `ON CONFLICT DO NOTHING`), so concurrent same-slug creation returns a controlled alternative slug/replay/409 instead of an uncaught database error.

**R1 corrections, all implemented and tested:** durable per-item human-publication protection (`PolicyIntelligenceItem.publicationMode` + `protectionSetAt`/`protectionSetByUserId`, additive migration `0028`) so an eligible automatic revision is captured and held (`human_publication_protected`) instead of superseding a lawyer-published revision, with an explicit audited release; publication authority = verified identity + lawyer role + active grant (administrator role manages grants/monitoring only; customer, unverified, forged and revoked grants cannot publish; operator-URL submission follows the same rule); multi-reference editorial UI that round-trips all eight references with citations/dates and refuses silent truncation or auto-translation; nullable author-stated dates (`officialSourceDate`/`commencementDate`/`reviewedAsOfDate`) kept distinct from platform-observed source dates; server-derived editor identity audited separately from the public byline plus official-authority impersonation rejection; real streamed body-size limits and the Origin/`Sec-Fetch-Site` guard on every editorial mutation (including the previously unbounded legacy admin route); reconstructible draft-change audit, create-retry dedupe, workspace pagination and an override editor that recovers from unreadable AI analysis.

**Recorded validation (R2 final revision):** 833/833 `pnpm test:unit` pass (0 fail, 0 skipped; R1 821 → +12 R2 tests); extended Stage 3 PostgreSQL integration PASSED on the isolated disposable DB (migrations 0027/0028/0029 there only) including the R2 phases — concurrent publication rejection (V1 → drafts A/B → V2 → A 409 `draft_baseline_superseded` → V2 current), lossless draft history (long bilingual body, amended citation and removed items all recoverable; earlier snapshot digest unchanged by later saves), protected-item hold consistency (item stays published/protected while the new source is held; coherent archive/restore and workspace detail; unprotected hold behaviour preserved) and concurrent creation (controlled outcomes; identical replay resolves to one item; `slug_taken`); Stage 2 integration regression PASSED; `tsc --noEmit` unchanged at the 45 pre-existing diagnostics; `pnpm build` exit 0; `git diff --check` clean. Owner-host items still open: Playwright browser acceptance of `/policy-editor`, live official-source fetches for the new seed URLs, provider-backed operator-submission sync, owner functional acceptance of the protection/hold scenarios.

## Phase 12 Stage 3 — D-065 Lawyer Final Editorial Authority (2026-10-13; docs only)

**Approved design correction:** An expressly authorized Policy Editor lawyer has the final decision on legal-content relevance, editing and publication. The Stage 3 implementation must offer a real lawyer-initiated `forcePublish=true` for AI-held/rejected/verification-failed items without requiring AI re-evaluation, positive evidence sufficiency or an automatic publication-gate PASS. An independent manual draft/preview/publish path remains entirely AI-free, including for transparently attributed lawyer commentary without an official citation. Preserve clear attribution between lawyer commentary and authenticated official law; no invented citation, source, verified-law badge or commencement date. Backend retains **technical** authorization, tenant isolation, input/URL/HTML/CSRF safety, revision concurrency and immutable audit; it cannot turn the AI's legal judgment into a veto. Trusted automated publication continues unchanged and has no compulsory lawyer gate.

**Precedence and work status:** D-065 supersedes the earlier conflicting Stage 3 prohibition on `forcePublish=true`; see `DECISIONS.md` and `tasks/PHASE12_USER_DATA_WORKSPACE_POLICY_2026-10-11.md`. **Stage 3 implementation is authorized under D-066 and has been implemented in the working tree of `codex/phase12-stage3-policy-intelligence` (base `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419`) — NOT committed or pushed.** Stage 2 core scope stays OWNER SIGNED OFF, original Gate 2 remains NOT ACCEPTED, and Stage 1 Gate 1 remains open; neither deferred gate is marked passed. The Stage 3 worktree changes add the three publication pathways (automatic, lawyer override/force publish, fully manual lawyer authoring), the explicit revocable Policy Editor capability, additive migration `0027` (applied only to the isolated disposable test database), published-revision stability with a newer-source currentness signal, the unified public feed/detail/history presentation, expanded controlled discovery plus authorized official-URL submission, and automatic-sync/human-work coexistence guarantees. Recorded validation in the worktree (pre-R1 Stage 3 record; the R1 final counts are in the R1 section above): 783/783 `pnpm test:unit` (0 fail, 0 skipped), Stage 3 PostgreSQL integration suite PASSED on the isolated disposable database, `tsc --noEmit` unchanged at the 45 pre-existing diagnostics, and `pnpm build` exit code recorded in the handoff. No protected-database migration, AWS/S3, billing, payment, branch-merge or deployment change.

## Phase 12 — local-test S3 Bucket retained (D-064, 2026-10-13)

**Owner choice:** Keep `immigration-ai-localtest-documents-747452892291-ap-southeast-2` rather than delete after Stage 2; use only for synthetic local development/regression tests. Account `747452892291`, region `ap-southeast-2`, profile `aulawyers-staging`; process-only Next.js configuration: `AWS_PROFILE=aulawyers-staging`, `AWS_REGION=ap-southeast-2`, `MATTER_DOCUMENTS_S3_BUCKET=immigration-ai-localtest-documents-747452892291-ap-southeast-2`. Default SSE-S3 AES256, four Block Public Access flags enabled, S3 preflight `{"ok":true,"failures":[]}`. No keys stored. Current file size observed ~34.2 KB in two synthetic test files; S3 storage cost expected negligible, requests/transfer/optional services still billable. AWS actual charges not yet audited. Original Stage 2 Gate 2 remains NOT ACCEPTED due to deferred checks; bucket retention does not change this. Reuse commands, safety rules, and read-only usage audit are recorded in CURRENT_HANDOFF.md. Retention supersedes D-063's proposed cleanup/deletion only; do not delete bucket or DB rows without new authorization.

## Current checkpoint — Phase 12 Stage 2 owner functional completion (2026-10-13)

**Branch/HEAD:** `codex/phase12-stage2-context-ui` @ `7031b37292410597c4411b8a9b60f10bdf35b823` (owner verified identical local/remote SHA and clean working tree). D-061 and D-062 both committed/pushed; no active uncommitted hotfix. This section supersedes the dated implementation-state descriptions below without erasing historical test records.

**Owner acceptance scope:** Stage 2 **functional work complete**; browser retest of the D-062 ordinary-conversation null-`policySlug` defect passed. Owner browser screenshots in ordinary, non-policy conversation `0a8c3d1d-887d-4246-8f76-28ea613ecc55` show `test_pdf.pdf` → `BLUE-314`, 14 March 2026 (intended arrival); `test_docx.docx` → `GREEN-729`, 30 November 2026 (insurance expiry). Fast, Legal Check (active AgentRuntime), and Premium all returned the expected values from both saved files, identified customer-file provenance rather than official law, and reused the same conversation without reupload. LIN 26/061 linked-conversation launch, refresh/history restore and DB binding check passed; Fast, Legal Check (after D-061 restart) and Premium each correctly retained policy topic.

**Environment/limitations:** The temporary independent S3 test Bucket `immigration-ai-localtest-documents-747452892291-ap-southeast-2` (ap-southeast-2, AES256, Public Access Block enabled) passed read-only `s3:preflight` with `{"ok":true,"failures":[]}`. Its test objects are still needed until closeout; cleanup and removal of this test Bucket are the **second pending owner-supervised task**, with a prior check for local database file records/download impacts. No bucket deletion or database cleanup is part of this docs commit. The screenshots establish user-visible end-to-end answer behaviour, not a separate database evidence-unit audit, original-byte download, source-link click check, malicious-file testing, alternative legacy Legal Check runtime, cross-device durability, or AWS staging/production acceptance. Cross-device checks were explicitly DEFERRED BY OWNER; other outstanding original Gate 2 checks (including staging/production S3, negative authorization, original-byte download and remaining environment/UI cases) are NOT RUN/NOT ACCEPTED. Stage 1 formal Gate 1 remains open. The original all-items Gate 2 was not satisfied; no unrun check is marked PASS.

**Governance:** Original Gate 2 **NOT ACCEPTED** in full; deferred owner validation is explicitly not PASS. Stage 1 Gate 1 also open. Stage 3 not started or newly authorized by this document. No migration, live deployment, AWS mutation or data deletion is part of this documentation update.

## Phase 12 Stage 2 Gate 2 hotfix — null `policySlug` (FIXED 2026-10-12; committed 7031b37 and owner-host PASS)

Owner-host discovery: the ordinary conversation `0a8c3d1d-887d-4246-8f76-28ea613ecc55` (with `test_pdf.pdf` and `test_docx.docx` saved) failed Fast **before model execution** with `ZodError path: ["policySlug"] expected: "string" received: "null"`. The workspace sent an explicit JSON `null` with no persisted binding, and the widget routes accepted only optional strings.

Fix (D-062): the workspace omits the field when unbound (`lib/conversations/widget-turn-request.ts`), and the three routes share one request contract (`lib/conversations/widget-turn-schemas.ts`) whose `policySlug` rule (`lib/policy-intelligence/request-policy-slug.ts`) normalises absent/null to "no hint" while non-null values must still match the strict slug pattern. The persisted, owner-scoped binding remains the only policy authority; durable-turn, auth, document-evidence and political-gate contracts are unchanged. Evidence: new contract suite 8/8 (parses the real exported schemas), full unit suite 754/754, related suites 40/40, `tsc` 45 = baseline, `pnpm build` exit 0, Biome and `git diff --check` clean. **Gate 2 NOT ACCEPTED** — D-062 owner browser verification subsequently PASSED, while original remaining checks are deferred/unverified; cross-device tests are **DEFERRED BY OWNER** (not passed). Owner host document storage used an independent AWS S3 **local-test** bucket (security preflight `{"ok":true,"failures":[]}`) where `test_pdf.pdf`/`test_docx.docx` display as saved, but **initial file extraction/AI consumption was unverified at this earlier checkpoint; later three-mode answers from both files PASSED (see current checkpoint)** and no staging/production environment was tested. D-061 (the Legal Check policy-topic fix) is committed and pushed as `b604187` and its **owner-host re-test PASSED**, with **Premium policy-context testing PASSED** in the same LIN 26/061 conversation; D-062 was subsequently committed as `7031b37292410597c4411b8a9b60f10bdf35b823`.

## Phase 12 Stage 2 Gate 2 blocker — Legal Check policy topic (FIXED 2026-10-12, uncommitted)

Owner-host discovery: Legal Check lost the persisted policy topic after a Fast → Legal Check switch (conversation `29d5607b-…`, LIN 26/061). Cause: `DefaultAgentServingService` never forwarded the `policy_topic_reference` entry that the Next.js route already sends in `frontend_messages` (Fast/Premium already rendered it). Fix (D-061): bounded `AgentRuntimeRequest.policy_topic_context` (first flagged `system` entry only, whitespace-normalized, 1 200-char cap) extracted in the serving adapter and rendered by `AgentRuntimeService` as a fenced conversation-context section explicitly labelled NOT legal authority / NOT verified law, never a system instruction, never evidence, never a citation. Archived/superseded/withdrawn note lines within the 1 200-character cap are forwarded as conversation context, but the channel is bounded, so a longer rendered binding (e.g. extra archival or superseded notes) is truncated at the tail and the topic is never claimed as current. Evidence: new focused suite 16/16 (3/16 fail against the pre-fix adapter — the tests detect the defect), related suites 42/42, full backend suite 1302/1302; the fix passed independent source review. No migration or database access from these changes. Owner host status: migration `0026` applied to the local `chatbot` database and verified (ledger, table, indexes, foreign keys); policy launch, browser refresh/history recovery and PostgreSQL binding verification passed for LIN 26/061; Fast policy-context passed; **Legal Check owner-host re-test PASSED** after restarting legal-service (the original LIN 26/061 conversation was identified correctly instead of asking for the policy again) and **Premium policy-context testing PASSED** in the same conversation. **Gate 2 NOT ACCEPTED** — the later three-mode PDF/DOCX answers PASSED; cross-device acceptance and other unrun original Gate 2 checks remain deferred/unverified (see current checkpoint).

## Phase 12 Stage 2 final review corrections A + B (2026-10-12, uncommitted)

Two consent-workflow defects from the independent review of the committed Stage 2 (`54ec8e3`) are corrected. **A:** the lawyer-request submit control is enabled only after the eligible-document list loads successfully; a failed/pending/malformed load blocks submission, shows a localized error, a blocked notice and a labelled retry (重新加载附件 / Retry loading attachments), and is never treated as consent to share nothing; an explicitly confirmed empty selection is still sent as `{ consent: true, selectedDocumentIds: [] }`, and malformed/duplicate/over-limit selections are refused rather than sliced. **B:** `already_requested` is a dedicated state that renders no new-request controls, shows the persisted shared-document count (`documentSharing.selectedDocumentCount`, "未记录 / not recorded" when absent — never the checkbox state) and links to the existing request; the GET adds `requestId` + `documentSharing` and the POST duplicate path adds `existingRequest: true` (additive), so the stored request can never be changed by a retry. Evidence: 746/746 chatbot unit, 40/40 focused TS, `tsc` 45 = baseline (zero new), `pnpm build` exit 0, Biome and `git diff --check` clean. No commit/push/merge/deploy/migration; Gate 2 not accepted.

## Phase 12 Stage 2 closure — explicit lawyer attachment consent (owner Option A, 2026-10-12, uncommitted)

Owner decision D-060: nothing is shared with a lawyer unless the customer explicitly selects it. Implemented: a bilingual consent panel in the customer action (eligible documents, unchecked by default, per-document rationale, counts, withheld-acknowledged warning, over-limit block, no-attachment submission allowed); an explicit `attachments { consent, selectedDocumentIds }` request contract validated against the server-persisted manifest of the answered turn and the owner's rows; explicit errors for forged/cross-conversation/stale/deleted/duplicate/over-limit selections and no silent truncation; a bounded filename-free selection record persisted inside the existing evidence JSON (no migration); customer and lawyer views that distinguish acknowledged-shared, customer-selected and withheld-acknowledged (counts only for withheld); and idempotent retries that cannot rewrite a stored selection. Evidence: 732/732 chatbot unit tests, `tsc` 45 = base, `pnpm build` exit 0, Biome and `git diff --check` clean, 1286/1286 legal-service regression check. Still no commit/push/merge/deploy/migration; Gate 2 not claimed.

## Phase 12 Stage 2 R2 — final focused corrections implemented (2026-10-12, uncommitted)

Second review returned REWORK focused on two defects; both are corrected in the same uncommitted tree without redesigning R1-2/R1-3. **R2-A**: the serving response now returns the bounded, request-authorized acknowledged document ids; the widget routes subset their own request manifest by them (one acknowledged document can no longer mark every packaged file "used"; forged/cross-conversation ids are dropped; Fast/Premium stay `supplied_unconfirmed` with no ids), and lawyer requests distinguish conversation-authorized attachments (`used_by_answer: false`) from documents the answer acknowledged using — restoring the Fast/Premium file context R1 removed, bounded to the persisted turn manifest and still failing closed for acknowledged documents. **R2-B**: review traces and the experience archive are filename-free (numeric counts, availability/packaging states and withheld-filename count only), including the `matter_id`-fallback and direct snapshot paths; the authenticated app still shows customers their own filenames from the application database. Evidence: chatbot unit 715/715, legal-service 1286/1286, 26 focused Python + 44 focused/regression TS tests, `tsc` 45 = base, Biome clean, `git diff --check` clean, `pnpm build` exit 0. Still no commit/push/merge/deploy/migration; migration 0026 unapplied outside the isolated test DB; Gate 2 not claimed.

## Phase 12 Stage 2 R1 — reviewer corrections implemented (2026-10-12, uncommitted)

Independent review returned REWORK; all three findings are corrected in the same uncommitted tree: verified document-use acknowledgement (tri-state; single-shot modes report `supplied_unconfirmed`), durable policy topic from the persisted binding snapshot (survives unpublication; current revision kept separate; snapshot never current law), and document-availability counts bounded at 100 000 with an explicit packaged-vs-all distinction plus honest partial/mixed status. Evidence: 699/699 chatbot unit, 1/1 documents integration on the isolated DB, 1/1 policy-binding integration, 20/20 committed Playwright checks over four viewports, 1273/1273 legal-service, `tsc` 45 = base, Biome clean, `git diff --check` clean. Owner-decision item: lawyer requests no longer auto-attach the customer document manifest for Fast/Premium answers (honest consequence of R1-1; widening needs a separate approved rule). Still no commit/push/merge/deploy/migration; Gate 2 not claimed.

## Phase 12 Stage 2 — IMPLEMENTED, awaiting independent review + owner acceptance (2026-10-12)

**Branch:** `codex/phase12-stage2-context-ui`; **HEAD** `ce4e803bcbdd29535d0da0924de55600a87a9827`; the Stage 2 change set is **uncommitted** in the working tree. Parent/expected start commit `3541a3dfc72efc9fc9f4fe5d824c052f09d3a4cd`. Working directory used: `/home/rico/immigration_ai`.

**Delivered:** durable server-side policy-to-conversation binding (migration source `0026_phase12_stage2_conversation_policy_binding.sql`, **unapplied** outside the isolated test database) with server-side slug resolution, transactional create, idempotent launch, recoverable failure state and a snapshot-is-not-law card; one authenticated context resolver (`lib/workspace/context-resolver.ts`) shared by Fast / Legal Check / Premium; real customer-document evidence now reaching the Default AgentRuntime (previously a silent gap) plus a bounded non-evidentiary availability summary so an answer cannot imply it read a file with no usable extraction; compact workspace UI (one-row mode toolbar, chat-first layout, panel tabs below 1280px, bounded auto-growing composer with adjacent upload, right panel owning conversation files + account files + case facts with automatic refresh); guest accounts told files require signing in instead of an unlocalized API error; `s3:preflight` CJS top-level-await crash fixed.

**Evidence:** chatbot unit **673/673 pass, 0 fail, 0 skip**; Stage 2 integration test **pass** on the isolated disposable database; legal-service **1247 pass, 0 fail**; `tsc --noEmit` **45 errors, identical to the base commit's 45**; `pnpm build` passes; `git diff --check` and changed-file Biome clean; out-of-repo Playwright checks **26/26** at 1920×1080 / 1366×768 / 768×1024 / 390×844 plus the pre-migration policy-launch state.

**Not verified (owner-host, do not read as passing):** durable policy card with `0026` applied, AWS-case policy launch, real staging S3, original-byte download, DOCX end-to-end, cross-device continuity, repository Playwright E2E suites, any live model quality run. Gate 2 is **not** claimed as passed. No commit, push, merge, deploy or application-database migration happened.

**Contained incidents recorded honestly:** one integration-test invocation ran against the development database because a shell variable substitution did not match — it created 6 synthetic test users and no chats/messages, which were deleted and verified gone; browser checks created 13 guest sessions with 3 empty auto-created conversations, all removed exactly; no customer row was touched or read as evidence.

**Remaining Stage 1 acceptance gap:** owner cross-device/original-byte/DOCX/failure-path verification is still outstanding, so Gate 1 is also still not claimed as passed.

## Phase 12 — Three-stage approved plan; implementation NOT STARTED (2026-10-11)

**Planning branch:** `phase12-user-data-reliability-policy-intelligence` created from canonical `phase11-chinese-service-platform-ui-rebase@0ed11150015773573cd7e1d0396134e696bf7357`. **Authority:** owner approved a compact three-stage plan and authorized this **documentation-only branch and commit**. This is NOT authorization to implement Stage 1, run migrations, alter existing customer data, deploy, or merge. Owner first syncs branch locally; only then will request the Stage 1 coding-model prompt.

**Detailed authoritative plan:** `docs/agent-memory/tasks/PHASE12_USER_DATA_WORKSPACE_POLICY_2026-10-11.md`.

**Stage 3 scope addition (owner-approved 2026-10-11):** An explicitly authorized lawyer must be able to author an original policy manually in a staff form and save draft, preview, edit, publish, archive/restore without AI model calls, automatic discovery, analysis, verification or AI publication gate. Human-authored records are first-class public policy entries alongside automated entries, with independent durable revisions, source/status/date fields, bilingual editor-provided text, safe deterministic validation, and role/audit controls. See detailed Phase 12 task plan; **no fourth Stage**. Planning/docs only; Stage 1 is still NOT STARTED.

- **Stage 1 — User Data Reliability:** user-owned durable conversation/message/history, idempotency, complete pagination, cross-device history/file retrieval, real DOCX MIME/content fix, optional Project scope interfaces only. **IMPLEMENTED on `codex/phase12-stage1-user-data-reliability`; awaiting owner host/cross-device acceptance.**
- **Stage 2 — AI Workspace Integration:** one authorized scope resolver shared by Fast/Legal Check/Premium, actual document evidence in all backend serving paths, persisted policy-to-conversation binding, compact composer and right-side files. **IMPLEMENTED (uncommitted) on `codex/phase12-stage2-context-ui`; awaiting independent review + owner acceptance.**
- **Stage 3 — Policy Intelligence Completion:** fuller official proposed/consultation discovery, permissioned lawyer editorial override **and a separate fully human-authored policy creation/draft/preview/publish path with zero AI dependency**, provenance/audit, clear legal-vs-publication status, currentness/revision continuity, integrated staging gate. **NOT STARTED**.

**Hard gate rule:** each Stage is one integrated coding-model task, with its own full code/tests/DB-owner-host/browser/cross-device evidence, independent review and owner acceptance. A failed/skipped/blocked required check is never PASS. No Stage 2 before Stage 1 PASS; no Stage 3 before Stage 2 PASS. Real database/staging/production changes always require separate explicit owner authorization. No additional milestone fragmentation.

**Durable invariant:** same account on Ubuntu/Windows/Android can access all retained authorized historic messages, attached metadata and original files; full history is NOT the same as cross-chat AI context sharing. Project support remains only optional typed interfaces (`projectId: null`) and no feature. Stripe China activation stays PAUSED (see prior record). Older Phase 11 and Stripe records below are historical, not active instructions for Phase 12.

## Current product state

The repository is a working full-stack immigration-service system, not a UI-only prototype.

Main technology split:

- `chatbot/` — Next.js frontend, authentication, customer workspace, VIP/billing, lawyer/admin surfaces.
- `legal-service/` — FastAPI legal backend, legal retrieval/reasoning, evidence contracts, Phase-6 checker and control-plane functionality.

The current product already has real capabilities that Phase 11 must reuse rather than recreate:

- guest and registered accounts;
- persistent conversation history;
- legal matter identity linked from customer conversations;
- Fast / Legal Check / Premium answer modes;
- server-side mode/entitlement access;
- VIP recurring billing;
- transactional email;
- lawyer clarification/request flow;
- lawyer portal and lawyer-review/admin workflows;
- legal citations/source UX;
- political/privacy gating.

## Current source baseline

The Phase 11 branch was created from:

- source branch: `phase10.2-stream-termination-observability`
- source commit: `3b3653202f9b067fbed4adfd410edc02cb7215cc`
- commit message: `fix: uncap fast Luna output and expose stream termination diagnostics`

That Phase 10.2 commit resolves the Fast-lane mandatory output-cap defect by omitting `max_output_tokens` by default and adds content-free stream termination diagnostics.

The Phase 11 implementation branch is:

- `phase11-chinese-service-platform-ui-rebase`

## Current frontend state

The frontend already includes a service-oriented shell:

- `chatbot/components/immigration-service-home.tsx`
- `chatbot/components/site-header.tsx`
- `chatbot/components/site-footer.tsx`
- `chatbot/app/(chat)/services/`
- `chatbot/app/(chat)/process/`
- `chatbot/app/(chat)/contact/`
- `chatbot/app/(chat)/ai-workspace/`

The AI workspace is functional and materially stateful. `chatbot/components/immigration-ai-workspace.tsx` currently owns significant behavior including conversation persistence, new/reopen conversation UX, request submission, political-history sanitization, guided intake, source rendering, and lawyer escalation surfaces.

Therefore Phase 11 must treat AI Workspace as a high-blast-radius component and rebase it incrementally.

P11-001 established the typed site-wide `zh-CN` / `en` locale foundation. P11-002A then connected Home, Services, Process and Contact page bodies to that same locale state and introduced the shared typed public-content model in `chatbot/lib/public-content.ts`. Chinese is the default, English switching affects both shell and public page bodies, and route identities remain unchanged.

## Current answer-lane state

Current product-level lane model:

- **Fast** — GPT-5.6 Luna direct Responses path, low reasoning, optional native web search, no silent lane fallback.
- **Legal Check / Default** — bounded source-aware Luna legal workflow with request-scoped evidence and Phase-6 checker.
- **Premium** — GPT-5.6 Sol direct/research path with configured Luna fallback and separate budget semantics.

Phase 10.1 added a bounded fresh terminal recovery for a narrow Default terminal-timeout condition.

Phase 10.2 confirmed the Fast failure root cause on a complex case was the former application-level 1200 output-token cap and removed that default cap.

The Premium budget-partition problem documented on 2026-09-12 remains a separate open backend issue; Phase 11 UI work must not disguise it as a UI defect.

## Deployment state

Phase 11 project-memory/bootstrap work does not deploy anything.

The 2026-09-12 handoff recorded the last confirmed production-style ECS state as Phase 10 task definition rev29 and explicitly did not claim that Phase 10.1/10.2 had been rolled out to AWS. Do not infer deployment state from Git state.

Any AWS rollout requires separate explicit authorization and current topology verification.

## Phase 11 product target

The accepted Phase 11 target is a Chinese-first Australian immigration and study service platform.

## Policy Intelligence RR-02 — FULLY ACCEPTED; STAGING REVALIDATION PASS — 2026-10-06

RR-01 was accepted at implementation commit
`199ad837bc417682b2257c3a95462fe8a1514bdf`, fast-forwarded into
`phase11-chinese-service-platform-ui-rebase`, pushed and remotely verified,
and deployed to staging. The staging web rollout completed with `/ping` HTTP
200; policy-sync task definition `:7` was deployed and selected by the
scheduler; and a manual sync completed. Its real staging evidence informed
RR-02 diagnosis.

RR-02 status is **SOURCE REVIEW ACCEPTED; OWNER FULL LOCAL VALIDATION PASS;
STAGING REVALIDATION PASS** at canonical commit
`9461efbe14b22936e6a7311eaadbff413d02070f`
(`fix: align policy guidance publication contract`) on
`phase11-chinese-service-platform-ui-rebase`. It adds `published_guidance`,
normalizes and safely fingerprints Home Affairs structured alert content, and
sharpens analyzer/verifier subject and scope instructions. Focused Policy
Intelligence tests passed 106/106; the full unit suite passed 522/522 with zero
failures and zero skips; the local Next.js production build passed and
generated the production route manifest; and `git diff --check` passed.
Staging validation passed on web task `:42` and policy-sync task `:10`; the
complete immutable image, scheduler and manual-sync evidence is recorded in
the task file. The scheduler retained its enabled state, cron and timezone;
only the target task revision changed. The analysis schema remains v2,
analyzer/verifier remain v2.2, and the strict publication gate is unchanged.
No database migration was added; Federal Register RR-01 discovery/ranking
remains unchanged; and the protected WIP remains untouched. Details:
`docs/agent-memory/tasks/PI-RR-02-GUIDANCE-CONTRACT.md`.

The temporary repository `jiangdizhao/immigration_temporal_ui` at `codex/fidelity-completion-v4@8abbba2` is a design/journey reference. The main repository remains the functional authority.

Matter continuity is the central UX concept:

```text
content -> AI intake -> matter context -> lawyer escalation -> continuing service
```

See `docs/architecture/SERVICE_PLATFORM_UI_REBASE_V1.md`.

## Current Phase 11 execution state

- **P11-001 — VERIFIED:** Chinese-first locale + shared shell foundation.
- **P11-002A — VERIFIED:** bilingual public-content model + Home/Services/Process/Contact structural rebase.
- **P11-002B — VERIFIED:** V4-informed public-page visual fidelity + responsive refinement.
- **P11-003A — VERIFIED:** Policy Intelligence public UI + provenance-safe manual content model.
- **P11-003B — VERIFIED:** repository-backed manual curation + server-only publication boundary.
- P11-003B verified checkpoint: `081ef46dd040b6131d475750d0968c9f2e461bb2`.
- Production policy registry remains intentionally empty until real records are manually verified and published.
- Public Home/list/detail paths receive only server-produced public-safe projections; unpublished editorial content remains server-only.
- **P11-003C — VERIFIED:** allowlisted official-source discovery into non-public candidates.
- P11-003C accepted checkpoint: `fa02295675dc4343430ae0a109722141e669bbf9`.
- R1 hardened full-operation timeout and IPv4-mapped IPv6/private-network rejection.
- R2 replaced Home Affairs generic link discovery with bounded one-page `siteData.alertItems` structured discovery and a source-specific 2 MiB decoded-body ceiling.
- R3 safely resolves relative/absolute/protocol-relative Home Affairs alert URLs, preserves them as non-fetched provenance pointers, and distinguishes `urlProvenance` as `alert`, `seed`, or `fetched_page`.
- Production policy registry remains intentionally empty; discovery cannot publish or write `MANUAL_POLICY_ENTRIES`.
- P11-003C remains operator-run discovery infrastructure only: no scheduler, no automatic publication, no LLM-generated public analysis.
- Known non-blocking observation: the live Home Affairs alert feed contains operational/navigation items alongside policy-like candidates, so human review remains necessary.
- **P11-004 — VERIFIED** at implementation commit `f2d941734d256c9e0a0e42988cd67cdb828d0dc6`.
- Accepted result: Chinese-first bilingual operational AI workspace; desktop conversation/consultation/matter-context layout accepted; mobile answer-mode selector collapsed by default and expandable; mobile lawyer-review action clearly discoverable.
- Existing conversation lifecycle, matter identity, Fast / Legal Check / Premium modes, political gate, guided intake, citations and lawyer-review workflow remain preserved.
- No backend, database, legal-reasoning or booking implementation was added.
- Final validation: 187 unit tests passed; build, changed-file Biome and `git diff --check` passed; repository lint retains the known 22-diagnostic baseline; desktop/mobile owner visual acceptance passed.
- Deployment note: the local visual environment displayed the Debug panel because `NEXT_PUBLIC_WIDGET_DEBUG` was enabled. The active workspace guards it with `process.env.NEXT_PUBLIC_WIDGET_DEBUG === "true"`; staging/production should leave this disabled unless intentionally debugging.
- **P11-005 — Secure Matter Documents & AI File Intake: IMPLEMENTATION COMPLETE / STAGES 1–3 ACCEPTED; production-readiness gates are explicitly DEFERRED to P11-009 AWS/staging acceptance. P11-005 remains NOT VERIFIED until those deferred gates are closed.**
- P11-005 is now the prerequisite to the customer portal because current generic upload support is not a secure matter-document system.
- Current scaffold: `Message_v2.attachments` exists; generic `/api/files/upload` accepts JPEG/PNG up to 5 MiB and writes public Vercel Blob objects; the Phase 11 AI Workspace does not use that path for customer matter evidence.
- Required P11-005 boundary: private matter-scoped documents, a centralized mainstream-format registry (PDF, JPEG/PNG, DOCX/DOC, TXT/MD/JSON/CSV, XLSX/XLS initially), authenticated ownership, integrity/type/size validation, processing lifecycle, document/page provenance, and safe AI/lawyer continuity.
- Stage 1 base checkpoint: `15c72449f74879c10167be27cc059dc415301967`; hardening checkpoint accepted at `df5335356ac7c7fc908236a270e78f280e5387e6`.
- Accepted Stage 1 boundary: centralized PDF/JPEG/PNG/DOCX/DOC/TXT/MD/JSON/CSV/XLSX/XLS registry with bounded format-aware validation; durable upload intents and `storageStatus`; private S3 abstraction; customer-only ownership; `ON DELETE RESTRICT` plus explicit conversation-document cleanup.
- Stage 1 migrations `0018`, `0019`, and `0020` are repository artifacts only and remain **NOT APPLIED**.
- Accepted Stage 2 boundary: bounded normalized extraction/provenance for PDF/JPEG/PNG/DOCX/DOC/TXT/MD/JSON/CSV/XLSX/XLS; isolated hard-cancellable native parsing; native-first mixed-PDF handling; dedicated OpenAI transcription adapter for image/scanned-page fallback; explicit incomplete reprocessing and stale-run recovery; customer-document evidence remains untrusted and separate from legal authority.
- Stage 2 migration `0021_sudden_warbird.sql` remains **NOT APPLIED**. Stage 3 is accepted at `b29816c56255762998d8fa55b56df64436a0b3c3`.
- **Deferred P11-005 production-readiness gates (NOT waived):** deployment-compatible `@napi-rs/canvas` packaging, controlled application of migrations `0018`–`0021` plus DB-backed smoke, private S3/IAM/Block Public Access verification, retention/purge and stale-storage-intent operations, and malware/quarantine/scanning strategy. These are now explicit acceptance items for P11-009 AWS/staging work.
- **P11-006 — Matter-centered Client Portal: VERIFIED at `b3b5fe285779cd351c831d9793f3c62dc1ef4c0c`.**
- **P11-007 — Lawyer Workspace Continuity: VERIFIED after assigned-request desktop/mobile zh-CN/English visual acceptance; source checkpoint `9f352310ae6aa6392607296310c6d1caa943e0b9`.**
- **P11-008 — Appointment / Consultation Workflow: VERIFIED; P11-008 Final UI Acceptance PASS; Stages 1–3 source accepted; Gates A+B, C, D, and E-Core PASS / ACCEPTED.**
- **P11-009 — ACTIVE: Live Policy Intelligence + Phase 11 production readiness / AWS staging acceptance. Stage 1 is ACCEPTED at `0dae9e7ea46712c18357e3a9c009157c8cf0c8a1`; Stage 2 is ACCEPTED at `0afa4cb7921e74ee6a2263b66743a875c5cf3e07`. Stage 3 (whole-platform production hardening) is the current implementation unit; D-040/P11-005 production-readiness gates remain mandatory and environment-specific proofs remain for controlled Stage-4 acceptance.**

Public-content governance is defined in `docs/product/CONTENT_POLICY.md`.

## Shared project memory

Durable project state now lives in:

- `AGENTS.md`
- canonical architecture/spec documents
- `docs/agent-memory/PROJECT_STATE.md`
- `docs/agent-memory/CURRENT_MILESTONE.md`
- `docs/agent-memory/CURRENT_HANDOFF.md`
- `docs/agent-memory/DECISIONS.md`
- `docs/agent-memory/tasks/`
- `.cline/rules/project-workflow.md`

Conversations are working memory only.

## Known high-risk areas

- large `ImmigrationAIWorkspace` component with both UI and behavior;
- auth/account navigation that must survive translation/restructure;
- VIP and server-side entitlement boundaries;
- lawyer-request ownership and snapshots;
- preserving Policy Intelligence provenance, including source/legal status vs editorial status and preventing unpublished editorial content from entering public client bundles;
- accidental reuse of mock credentials/claims from the temporary UI;
- route redesign that could break auth redirects or existing links;
- database/schema changes made prematurely for presentation goals.
- sensitive customer-document storage, access control, provenance, malware/untrusted-content handling and accidental public-object exposure.



### P11-005 Stage 3 accepted boundary — 2026-09-25

Direct GitHub source/security review accepted Stage 3 at `b29816c56255762998d8fa55b56df64436a0b3c3`.

Accepted integration boundary:

- customers select authorized processed MatterDocuments by ID for one AI turn;
- the chatbot server re-authorizes ownership/chat linkage and builds a bounded derived-evidence packet;
- raw file bytes/storage keys/private object URLs do not enter answer models;
- Fast, Legal Check/Default and Premium consume customer-document evidence in a separate untrusted authority class;
- official citations remain structurally separate from customer-document provenance;
- exact per-unit AI clipping is recorded with included character count and SHA-256, allowing fail-closed lawyer-snapshot reconstruction of only the text actually supplied to AI;
- answer provenance is persisted/rendered only when the legal-service answer path acknowledged document use and the final public answer preserved that backend answer;
- guided-intake and ordinary-message submissions share the same selected-document retention semantics;
- document-selected V2 turns do not promote model-derived document claims into durable `v2_known_facts`;
- review traces and Experience Archive do not retain the raw customer-document packet;
- lawyer handoff derives exact document evidence from persisted server-generated assistant metadata, never client-supplied document references.

No schema change or new migration was introduced by Stage 3. Migrations `0018`–`0021` remain **NOT APPLIED**.

P11-005 remains **NOT VERIFIED** until its explicit production-readiness gates are closed or separately accepted: actual deployment-compatible canvas binding/package trace, controlled migration application and DB-backed smoke, private S3/IAM/public-access verification, retention/purge and stale-storage-intent operations, and malware/quarantine/scanning strategy.


### P11-005 production-readiness deferral — 2026-09-25

Owner decision: all three P11-005 implementation stages are accepted, but the remaining operational/security deployment gates are intentionally deferred to P11-009 AWS/staging acceptance so Phase 11 product work can proceed.

This is a **deferral, not a waiver**. P11-005 remains **NOT VERIFIED** until P11-009 explicitly closes or separately accepts:

- actual deployment-platform `@napi-rs/canvas` binding/package trace;
- authorized application of migrations `0018`–`0021` and DB-backed smoke;
- private S3 bucket/IAM/Block Public Access verification;
- retention/purge and stale storage-intent operational recovery;
- malware/quarantine/scanning strategy.

P11-006 is activated only because these gates have been durably carried forward into P11-009.


### P11-006 verified boundary — 2026-09-25

P11-006 is **VERIFIED** at `b3b5fe285779cd351c831d9793f3c62dc1ef4c0c` after direct GitHub source review plus owner desktop/mobile bilingual visual acceptance.

Verified result:

- registered customers have a Chinese-first bilingual `/client-portal` continuity hub;
- customer ownership and role checks are enforced server-side;
- conversations group only by exact non-null `legalMatterId`; null IDs remain provisional per-chat groups;
- Legal Service Matter reads use only matter IDs derived from owned conversations and fail soft per matter;
- raw `metadata_json`, document evidence, storage keys, hashes, provider identifiers and internal traces are not exposed to the browser;
- confirmed facts and To-confirm items preserve structured provenance/status boundaries;
- document, lawyer-request and VIP summaries reuse existing authorities rather than creating a parallel workflow;
- document-schema rollout compatibility is explicit: deferred P11-005 schema absence produces an availability-aware partial portal instead of a 500 or a false zero-document claim;
- only the expected document-schema SQLSTATEs are fail-soft at the document-query boundary; unrelated DB failures still surface;
- locale changes refetch server-projected values and preserve the selected group when still present;
- owner desktop/mobile Chinese/English visual acceptance passed with no blocking responsive or hierarchy defect.

Validation recorded for the final runtime-compatibility correction: 281 chatbot unit tests passed, build passed, changed-file Biome passed, `git diff --check` passed, and repository lint remained at the known 21-diagnostic baseline with none in changed P11-006 files. GitHub attached no Actions/workflow status to the accepted checkpoint.

P11-006 verification does **not** close P11-005 production-readiness. D-040 remains in force and P11-005 remains NOT VERIFIED until P11-009 closes its deferred gates.


### P11-007 activation — Lawyer Workspace Continuity — 2026-09-25

P11-007 is activated after P11-006 verification.

The objective is to turn the existing assigned-request lawyer portal into a Chinese-first bilingual human-review workspace **without expanding lawyer authority beyond the request already assigned to that lawyer**.

Frozen continuity boundary:

- the existing `LawyerClarificationRequest` and immutable request snapshots remain the handoff authority;
- lawyer access remains assigned-request-only; P11-007 does not create a customer/matter/document browser for staff;
- the lawyer may see the bounded context already captured in the request: customer question, AI answer, up to the existing context snapshot, official/compact-source evidence, exact bounded customer-document excerpts, customer note and clarification messages;
- official/legal sources, customer-document evidence, AI answer and lawyer disposition must remain visibly distinct;
- customer-document evidence comes only from the immutable lawyer-request snapshot accepted in P11-005; P11-007 does not grant raw MatterDocument browsing/download authority;
- no full customer conversation history or arbitrary Legal Service Matter metadata is fetched merely because a request is assigned;
- existing status transitions, assignment rules, notifications and learning-bridge behavior are preserved;
- raw snapshot JSON should be replaced by a typed, bounded human-readable projection rather than exposed as an operational UI;
- no new schema/migration is expected.

P11-007 is one major Task Packet under D-033. P11-008 booking and P11-009 staging/deferred P11-005 production gates remain separate.


### P11-007 verified boundary — 2026-09-25

P11-007 is **ACCEPTED / VERIFIED** after direct remote source review at `9f352310ae6aa6392607296310c6d1caa943e0b9` plus owner/ChatGPT assigned-request runtime visual acceptance.

Verified result:

- a real local pending `LawyerClarificationRequest` owned by a customer account was assigned by admin to a distinct verified lawyer account and appeared in the assigned-only lawyer queue;
- desktop zh-CN and English queue/detail views passed, including reactive shell copy;
- mobile zh-CN and English queue/detail presentation was accepted with no blocking horizontal-overflow, hierarchy, wrapping, or control-usage defect;
- request header, immutable customer question, AI answer under review, captured bounded handoff context, official/legal evidence, customer-document evidence, clarification thread, lawyer disposition, and advanced feedback were operationally legible;
- official/legal evidence, AI analysis, customer-document evidence, and lawyer disposition remained visually and semantically distinct;
- no raw snapshot JSON, storage keys, private object URLs, hashes, raw Legal Service matter metadata, or internal trace IDs were exposed in the normal lawyer workflow;
- D-043 remained intact: assignment authorizes the request only and does not grant matter-wide conversation/document browsing;
- the legacy/synthetic request's `Unknown mode / 未知模式` fallback was accepted as safe and non-blocking because it does not expose an internal enum;
- no runtime code change was required during final acceptance.

P11-005 remains **NOT VERIFIED** under D-040. No migration, AWS/S3, OpenAI, or Legal Service change is implied by P11-007 verification. P11-008 remains the next planned milestone.


### P11-008 activation — Appointment / Consultation Workflow — 2026-09-25

P11-008 is activated after P11-007 verification.

Repository inspection at `c507467444f4b5304150f71c9e8aa2354cdfd6e9` confirms that the current product still has no durable appointment domain:

- the AI Workspace `handleBookConsultation` remains a bounded toast that redirects the user conceptually toward lawyer review rather than creating an appointment;
- the public Contact page routes users into the AI Workspace and does not persist a consultation request;
- there is no appointment/consultation table, customer appointment history, staff scheduling queue, slot proposal/confirmation state machine, or calendar-provider integration in the active branch.

The P11-008 production direction is a **first-party request -> proposal -> customer confirmation workflow**, not a fake live-calendar picker. Until a real calendar/provider and verified business availability are separately approved, the system must not claim real-time availability or invent office hours, consultation prices, lawyer schedules, meeting links, phone numbers, or physical office details.

P11-008 will use one major Task Packet with three internal stages:

1. **Stage 1 — Consultation domain foundation:** additive schema/migration artifact, access control, state machine, audit events, overlap protection, and typed APIs. Do not apply the migration.
2. **Stage 2 — Customer booking continuity:** bilingual responsive customer request/history/detail UI, entry from Contact/AI Workspace/Client Portal, server-derived optional chat/lawyer-request continuity, confirm/reschedule/cancel actions.
3. **Stage 3 — Staff scheduling + notifications + E2E:** admin assignment, assigned-lawyer scheduling queue/detail, slot/method proposal, completion/cancellation, bounded fail-neutral email notifications, and desktop/mobile zh-CN/English acceptance.

P11-008 is a chatbot-domain workflow. It does not require a Legal Service source change, legal-reasoning change, MatterDocument authorization change, VIP pricing decision, or external calendar integration.

D-040 remains in force: P11-005 is still **NOT VERIFIED** until P11-009 closes its deferred production-readiness gates.


### P11-008 Stage 1 source checkpoint / Stage 2 activation — 2026-09-26

P11-008 Stage 1 **SOURCE GATE is ACCEPTED** at remote checkpoint `83506156546dcff2944b21edef16423a5b402d54` (`feat: add consultation domain foundation`).

Accepted Stage 1 source boundary:

- additive `ConsultationRequest` / `ConsultationEvent` domain and generated migration `0022_first_slayback.sql`;
- customer-owned, admin-managed, assigned-lawyer-only API authorization;
- integer `revision` optimistic concurrency rather than timestamp equality;
- immutable consultation events written transactionally with state mutations;
- admin-only lawyer assignment with verified/non-guest lawyer validation;
- assignment and lawyer demotion serialize through the same target `User` row;
- proposed/confirmed same-lawyer interval protection uses transaction-scoped per-lawyer advisory locking and half-open interval overlap semantics;
- customer and staff DTOs remain distinct; customer projection exposes assignment state rather than lawyer login identity;
- owned chat / lawyer-request continuity links are server-authorized and cross-link consistency is enforced;
- lawyer-role demotion remains rollout-compatible before migration 0022 exists through an exact `to_regclass('public."ConsultationRequest"')` availability check;
- Stage 1 source scope did not add UI, notifications, calendar/provider integration, payment, Legal Service changes, or deployment work.

Recorded local validation for the accepted source checkpoint: **326 unit tests passed**, production build passed, changed-file Biome passed, `git diff --check` passed, and a second `pnpm db:generate` reported no schema changes.

This is **source acceptance, not migrated-DB verification**. Migration `0022` remains **NOT APPLIED**. Real PostgreSQL advisory-lock concurrency, overlap races, rollback atomicity, and API-to-migrated-DB execution remain explicitly deferred under the **P11-008 migrated-DB transaction gate**.

P11-008 Stage 2 is now the next implementation unit: a customer-only Chinese-first bilingual booking continuity layer over the accepted Stage 1 API/domain.

Stage 2 must remain rollout-compatible while `0022` is absent. Customer pages and existing portal surfaces must distinguish **consultation schema unavailable** from **zero consultations**; absence of the future table must not cause existing P11-006/P11-007 pages to 500 or falsely claim there are no consultation records.

Stage 2 does not authorize migration application, staff scheduling UI, notifications, external calendar/video/phone integration, pricing, VIP-only booking, or Legal Service changes.


### P11-008 Stage 2 source checkpoint / Stage 3 activation — 2026-09-26

P11-008 Stage 2 **SOURCE GATE is ACCEPTED** at remote checkpoint `2d91c17a483c0fd30a434536f87b64bc7cf6fe94` (`feat: add customer consultation continuity`).

Remote comparison against `c08260a0a398ca2685191e73d8a5f9ba7ea24ee7` is one clean commit with 28 Stage-2 files and no schema, migration or Legal Service drift.

Accepted Stage 2 boundary:

- Chinese-first bilingual customer routes `/consultations`, `/consultations/new`, and `/consultations/[id]`;
- verified-customer page access and Stage-1 customer API authorization preserved;
- exact `to_regclass('public."ConsultationRequest"')` rollout check after authentication/role authorization;
- consistent HTTP 503 `consultation_schema_unavailable` contract across customer/admin/lawyer consultation APIs while 0022 is absent;
- Client Portal distinguishes `available`, `schema_unavailable`, and `verification_required` without weakening existing P11-006 access;
- consultation-unavailable state does not masquerade as an empty history;
- AI Workspace and Client Portal continuity pass only an exact owned `chatId`; the browser never supplies trusted `legalMatterId`;
- customer preferred-window input uses the browser-resolved IANA timezone with native `datetime-local` -> absolute ISO conversion;
- customer status-valid confirm/reschedule/cancel actions use revision OCC; 409 refetches once and never retries the mutation;
- customer surfaces never expose lawyer login identity;
- Contact and ordinary-customer account navigation now reach the real consultation flow;
- Stage 2 remained customer-only and did not start staff scheduling UI, notifications, provider integration, pricing, deployment, or Legal Service work.

Recorded final local validation: **341 unit tests passed**, production build passed, changed-file Biome passed, `git diff --check` passed, and `pnpm db:generate` reported no schema changes.

Migration `0022_first_slayback.sql` remains **NOT APPLIED**. Real customer create/confirm/reschedule/cancel execution and real PostgreSQL concurrency/rollback remain under the deferred **P11-008 migrated-DB transaction gate**.

P11-008 Stage 3 is now the next source implementation unit: staff scheduling surfaces plus consultation-specific fail-neutral notification infrastructure. Stage 3 source/UI work may proceed without applying 0022, but all new staff surfaces must preserve the same explicit schema-unavailable behavior.

P11-008 cannot be marked fully VERIFIED until a separately authorized migrated/disposable DB gate exercises the real transaction paths and the final customer/admin/lawyer workflow receives runtime/visual acceptance.


### P11-008 Stage 3 remote acceptance / migrated-DB runtime gate activation — 2026-09-26

P11-008 Stage 3 **SOURCE GATE is ACCEPTED** at remote checkpoint `5304742196f08894d249138c30b2245977a52e9b` (`feat: add consultation staff scheduling`).

Direct GitHub comparison against `cc42b4f59277bd2bd58bc36e99cf4f673f228db7` is one clean commit with 24 files changed, 12 added, 12 modified, 2027 insertions and 2 deletions. The accepted source preserves:

- distinct admin and lawyer consultation route namespaces without repurposing P11-007 `/lawyer-portal/[id]`;
- verified staff page/API authorization and assigned-lawyer-only access;
- Stage-1 status/transition authority and revision OCC;
- browser-IANA staff proposal conversion plus customer-timezone display;
- re-proposal preservation of existing scheduled method and meeting instructions;
- explicit schema-unavailable rollout behavior while 0022 is absent;
- consultation-specific, feature-gated, post-commit, fail-neutral notifications;
- bounded notification target lookup and generic privacy-safe email content;
- no schema, migration or Legal Service drift.

Recorded final Stage-3 local validation: **355 unit tests passed**, production build passed, changed-file Biome passed, `git diff --check` passed, and `pnpm db:generate` reported no schema changes.

P11-008 now moves to its **migrated-DB/runtime acceptance gate**. This gate must not mutate the normal local chatbot database, staging or production. It must run on a disposable clone of the chatbot database with shell-scoped `POSTGRES_URL`; `chatbot/.env.local` must remain unchanged.

The runtime gate must exercise actual migrations through 0022 plus real PostgreSQL transaction behavior, including revision conflicts, same-lawyer overlap serialization, half-open interval semantics, event/state rollback atomicity, assignment/lawyer-role safety, and end-to-end customer/admin/lawyer scheduling. Consultation notification failure must be exercised without contacting real SES/AWS.

Applying 0018–0022 to a disposable clone does **not** close D-040 or make P11-005 production-ready. P11-005 production gates remain deferred to P11-009.

### P11-008 runtime Gates A–C accepted / Gate D active — 2026-09-26

P11-008 runtime acceptance is now operating from product-source checkpoint `62947e779b8a5a39df58038deab7c135e452569f` after the bounded Drizzle timestamp-binding correction discovered by the real PostgreSQL gate.

Accepted runtime evidence:

- **Gate A — disposable isolation: PASS.** Normal chatbot DB remained read-only and unchanged; disposable DB is `chatbot_p11_008_gate_20260926_20c435`.
- **Gate B — migrated clone: PASS.** The disposable clone migrated from `0017_wooden_silver_sable` through `0022_first_slayback`; the consultation tables, expected FKs and indexes were verified; no 0023 was created.
- **Gate C — real PostgreSQL service/transaction acceptance: PASS, 11/11 with 0 failed and 0 skipped.** This includes create/event atomicity, assignment, stale OCC, same-lawyer concurrent overlap serialization, half-open adjacency, confirm/re-propose, reschedule, cancel/complete, assigned-lawyer isolation, assignment/demotion concurrency and injected-event rollback atomicity.
- Gate C initially exposed a real source defect: raw SQL interpolation passed JavaScript `Date` values to postgres-js without the timestamp-column encoder. Commit `62947e7` replaced those predicates with typed Drizzle `lt()/gt()/inArray()` comparisons while preserving strict half-open overlap semantics.
- A later C6 false negative was confirmed to be test-harness representation drift for PostgreSQL `timestamp without time zone`: raw postgres-js `Date` epochs differed by the Sydney offset while the production Drizzle return/read and database textual timestamp agreed. No second production persistence defect existed.
- Canonical accepted Gate-C harness SHA-256: `e04f5655868d0e9cd450aa505a3ed9fcb15063fc28fa69020d6fa7585509d8d7`.
- The normal chatbot DB still ends at `0017_wooden_silver_sable` and still has no `ConsultationRequest` or `ConsultationEvent` tables.

The retained disposable database must remain available for the remaining P11-008 runtime gates.

**Next: Gate D — notification fail-neutral runtime smoke.** Gate D is intentionally narrow: one isolated notification-enabled post-commit mutation on the disposable DB, a synthetic `.test` recipient, and a deliberately unsupported local `EMAIL_PROVIDER` value that fails before SES client/network delivery. The mutation and immutable event must remain committed, `notifyConsultation()` must return fail-neutral false rather than throw, logs must contain only bounded safe metadata, and no AWS/SES network call may occur.

Gate D does not perform browser/API auth E2E; that remains Gate E. P11-008 is still **NOT VERIFIED** until Gate D plus the remaining real-app bilingual/responsive E2E/evidence gates are accepted. D-040 remains fully open for P11-005 production readiness.

### P11-008 Gate D accepted / Gate E active — 2026-09-26

Gate D notification fail-neutral runtime acceptance is **PASS / ACCEPTED** on the retained disposable DB `chatbot_p11_008_gate_20260926_20c435`.

Accepted evidence:

- one fresh verified synthetic customer and one synthetic admin were created on the disposable DB;
- a real `cancelConsultation()` mutation committed first: `requested -> cancelled`, revision `1 -> 2`, `cancelledAt` set and one immutable `cancelled` event added;
- only after the mutation returned successfully, `notifyConsultation(id, "staff_cancelled")` ran;
- `EMAIL_PROVIDER=p11_gate_d_unsupported` deterministically failed in the shared auth-email layer before SES client construction/send;
- the auth-email log path reported only safe metadata (`purpose=consultation`, `provider=unsupported`);
- the consultation wrapper reported only safe metadata (`recipient=customer`, `kind=staff_cancelled`);
- `notifyConsultation()` returned `false` and did not throw;
- the committed cancellation state/revision/event count remained unchanged after notification failure;
- captured logs contained no synthetic email, private-note marker, preferred-window values, database URL/password, AWS credentials or real customer content;
- process environment and `console.error` were restored;
- disposable schema/migration checkpoint remained unchanged;
- normal chatbot DB remained read-only at `0017_wooden_silver_sable` with consultation tables absent;
- repository remained clean with no schema/migration/source change, no 0023, no commit/push from the runtime gate and no external service call.

Gate-D evidence artifacts were externally inspected: the harness executes mutation-before-notification in that order, and the machine-readable result reports all Gate-D assertions true.

**Next: Gate E — dedicated real Next.js browser/runtime E2E on the retained disposable DB.** Gate E must start its own isolated local Next.js server on a unique port with shell-scoped disposable `POSTGRES_URL`, notifications disabled and telemetry disabled. It must use real credential login/session flow for fresh verified synthetic customer/admin/lawyer accounts, exercise the consultation UI/API workflow end-to-end, prove visible stale-409 refetch/no-retry behavior, and produce bilingual desktop/mobile screenshot evidence for external visual review. It must not invoke AI answers, Legal Service, email delivery, S3, Stripe or other external providers.

At this 2026-09-26 checkpoint, P11-008 was awaiting Gate E visual/runtime and final evidence review; the accepted final status is recorded below.

## P11-008 final acceptance — 2026-09-27

**P11-008 Final UI Acceptance: PASS. P11-008 is VERIFIED.** Gates A+B, C, D, and E-Core remain **PASS / ACCEPTED**. Final UI acceptance passed actual `zh-CN` ↔ English switching and persistence after reload in both directions; customer consultation history/new/detail; admin queue/detail; lawyer assigned queue/detail; desktop and mobile responsive presentation; and no blocking visual/layout defect. Owner manually reviewed representative UI evidence. The correct fresh synthetic lawyer assignment was verified through lawyer queue/detail.

PostgreSQL temporarily reached `max_connections` during manual acceptance as disposable-DB postgres.js connections accumulated. Idle connections were terminated and acceptance resumed successfully. This was an acceptance-environment/runtime-harness issue, not a demonstrated product defect.

The retained disposable DB `chatbot_p11_008_gate_20260926_20c435` is migrated through 0022. The normal `chatbot` DB remains unchanged at `0017_wooden_silver_sable` with `ConsultationRequest` and `ConsultationEvent` absent. P11-005 deferred production-readiness items remain **NOT VERIFIED** and are not closed by P11-008.

P11-009 is now **ACTIVE**. The owner expanded it on 2026-09-30 so that the previously dormant Policy Intelligence module becomes a live, automatically maintained official-source-grounded product rather than waiting for a lawyer to manually author every entry. The detailed Stage-1 contract is `docs/agent-memory/tasks/P11-009.md`.

## P11-009 activation — Live Policy Intelligence + production closure — 2026-09-30

The current public Policy Intelligence routes, typed `PolicyEntry` contract, server-only publication boundary and official-source discovery infrastructure remain valuable foundations, but production content is still empty because `MANUAL_POLICY_ENTRIES` contains no published records and P11-003 required manual human promotion.

The owner has now accepted a controlled architecture change under D-048/D-049:

- lawyer pre-authoring is no longer a mandatory publication bottleneck for AI-generated policy explanation;
- only allowlisted official sources may establish policy/legal facts;
- official source material, AI interpretation and optional real lawyer commentary remain separate provenance layers;
- source snapshots and analysis revisions are immutable/versioned so later official-source changes create new revisions rather than silently rewriting history;
- automatic publication is fail-closed and requires a successful evidence-verification gate; uncertain legal status/effective-date/applicability or unsupported decisive claims must hold the item rather than publish it;
- AI-generated content must be labelled as AI analysis and must never be rendered as lawyer advice;
- the existing manual registry remains a compatibility/editorial fallback during migration, not the target canonical live store.

P11-009 is organized into four large stages:

1. **Stage 1 — Live Policy Intelligence backend (ACTIVE):** durable policy/source/revision/sync state, safe official-source acquisition, structured bilingual AI analysis, claim/evidence verification, fail-closed auto-publication semantics, and an operator sync command. No public UI redesign or AWS scheduler yet.
2. **Stage 2 — Policy Intelligence product activation:** production list/detail/home experience, richer Sovereign Nexus-inspired intelligence presentation, policy-history/diff/importance behavior and Policy Intelligence -> AI Workspace continuity.
3. **Stage 3 — Whole-platform production hardening:** close D-040/P11-005 deployment-security gates and perform bilingual/responsive/accessibility/E2E regression.
4. **Stage 4 — AWS staging rollout and acceptance:** migrate to the repository's then-current latest migration, deploy exact images, configure/verify scheduled policy sync, and run final staging acceptance.

Activation source baseline is `phase11-chinese-service-platform-ui-rebase@1e3a2edb3ed20682e7c87b0f1f9f05724a22b2ed` (`add UI template`), which adds the lawyer-provided Sovereign Nexus review artifact under `chatbot/UI_template/`. Coding agents must verify the live branch tip before editing because this documentation checkpoint advances HEAD.


### P11-009 Stage 2 active boundary — 2026-09-30

Stage 2 activates the Stage-1 Policy Intelligence backend in the existing public Home/list/detail experience. The live PostgreSQL store is canonical only when migration 0023 is available; exact schema-availability detection must keep the current pre-0023 normal database rollout-safe and must distinguish unavailable schema from an available store with zero publications. Manual published entries remain compatibility/editorial fallback only.

Public Stage-2 projections must remain deliberately smaller than backend revisions: no raw source evidence, verifier assessments, model metadata, fingerprints, held/draft revisions or internal sync diagnostics. The public product may show verified bilingual structured analysis, current source identity/status, bounded importance dimensions, published revision history/deterministic diff, and actual lawyer commentary when it exists.

Policy Intelligence -> AI Workspace continuity is reference-only: the client carries a stable slug, the server resolves the current published record, and Policy Intelligence analysis does not become official legal evidence or a durable known fact in the answer pipeline. No Legal Service reasoning/model change is authorized by Stage 2.

Stage 2 is source/UI work only: no new migration, no migration application, no live provider/source sync, no AWS/scheduler work and no Stage-3 production-hardening work.


### P11-009 Stage 3 active boundary — 2026-09-30

Stage 3 is the repository/source hardening layer before AWS staging mutation. The active source task must separate production service startup from one-off migrations, create a production-image/native-parser self-check, add safe migration target preflight, implement bounded MatterDocument retention/stale-storage recovery operations, make document processing/AI/lawyer use fail closed on malware security state, add a provider-neutral scanner/reconciliation boundary, add private-S3 security preflight tooling and establish a concentrated Phase-11 bilingual/responsive/accessibility/E2E regression harness.

No normal/retained/staging/production database migration and no AWS/S3 mutation is authorized by the initial Stage-3 coding task. If a new schema migration appears necessary, the coding model must stop and report rather than generate/apply it automatically.

D-040 is not waived and P11-005 remains NOT VERIFIED. Real ECS/Fargate native binding, real staging migration to the then-current repository head, real S3/IAM/BPA and concrete malware-scanning configuration are environment-specific evidence items for later explicitly authorized acceptance, primarily Stage 4.


## Current P11-009 closure state — 2026-09-30

- P11-009 Stage 1 — **ACCEPTED** at `0dae9e7ea46712c18357e3a9c009157c8cf0c8a1`.
- P11-009 Stage 2 — **ACCEPTED** at `0afa4cb7921e74ee6a2263b66743a875c5cf3e07`.
- P11-009 Stage 3 — **ACCEPTED** at `e3b42c2004054da1eb3a6fd81c9f21dccdeb6b75`.
- P11-009 Stage 4 — **ACTIVE, READ-ONLY PREFLIGHT NEXT**.

Stage-3 acceptance combines direct source review, local production-image/native-runtime evidence, disposable-PostgreSQL migration/security gates, authenticated role/ownership runtime evidence, locale/responsive evidence, deterministic source validation, and owner browser confirmation of the bounded accessibility corrections. No new Stage-3 source correction is active.

The production deployment state is still not inferred from Git. The last recorded production-style ECS state remains historical until Stage 4 inspects authoritative AWS topology. D-040 remains open and P11-005 remains **NOT VERIFIED** pending actual staging migration, exact ECS/Fargate image/architecture verification, real S3/IAM/BPA/encryption evidence, concrete malware-scanner configuration/reconciliation, and deployment/rollback acceptance.

The next execution unit must be read-only AWS/staging reconnaissance. Do not mutate AWS or staging until the reconnaissance result is reviewed and a separate owner authorization names the exact mutation/deployment plan.


## 2026-10-01 Policy Intelligence production recovery

The public production site is deployed and the Policy Intelligence surface now has a reviewed official-source fallback path. Automated discovery/analysis is no longer treated as a prerequisite for public availability.

Current product correction in progress: rapidly rebase `/intelligence` and `/intelligence/[id]` toward the lawyer-provided Sovereign Nexus reference at `chatbot/UI_template/OPEN_ME_Sovereign_Nexus_UI.html`. The hotfix is presentation/content-delivery only: no DB/schema, migration, AWS infrastructure, ingestion-architecture, legal-service or model-routing change.

Project-wide operating lesson reaffirmed by this incident: prefer the minimum mechanism that delivers the user-visible outcome. Do not add proxy gates, hard content thresholds, repeated micro-checkpoints or automation dependencies unless a demonstrated risk requires them.

## 2026-10-01 current production checkpoint — Policy Intelligence hotfix accepted

The immediate Policy Intelligence production-recovery task is now closed.

Canonical current checkpoint for this hotfix:

- branch: `phase11-chinese-service-platform-ui-rebase`;
- source: `f1b48fc340085392c818ace917aa217bfca245c1`;
- ECS web task definition: `immigration-ai-staging-web:33`;
- chatbot image digest: `sha256:996fa0d155247eb3dd72296ee7f7a62fc182a3a4ff60c00d7f63d9a5c0d71a1e`;
- legal-service digest unchanged at `sha256:badd60cf2f5a28b364aefd4696c00dbfeabdb20bfd7b12dbc169692c595af6c4`;
- ECS rollout completed with one desired/running task and zero pending tasks;
- focused Policy Intelligence tests, `pnpm build`, and `git diff --check` passed before rollout;
- owner visual acceptance of the live `/intelligence` page: **PASS for the immediate hotfix**.

The public Policy Intelligence surface now has a stable reviewed-official-source fallback path and a denser legal-intelligence presentation. Preserve the architectural lesson from this recovery: automated policy discovery/analysis is not a public-page availability prerequisite.

The project is paused at this checkpoint. Existing broader P11-005/P11-009 deferred infrastructure/security/migration items remain governed by their earlier records and must not be treated as closed by this hotfix acceptance.

## 2026-10-01 Policy Intelligence operating-model decision

The owner approved automatic policy maintenance as a product requirement. Manual-only publication is no longer the intended steady state.

Target steady state:

- daily official-source scanning;
- AI analysis from acquired official-source evidence;
- existing evidence verification/publication gate controls automatic publication;
- uncertain/unsupported items stay held or `review_required`;
- existing published/reviewed content survives a failed sync;
- lawyer/admin users handle exceptions by archiving/restoring items rather than approving every publication;
- archived items must not be silently republished by later sync;
- manual reviewed fallback entries remain available for disaster recovery.

Implementation is deliberately small:

- Step A: all-source serial sync command + deterministic orchestration/publication-gate tests;
- Step B: minimal admin archive/restore control and suppression behavior;
- Step C: one daily EventBridge Scheduler launch of an independent ECS operator task at 06:00 Australia/Sydney.

Current active unit is **Step A only**.

## 2026-10-01 automatic maintenance checkpoint

Policy Intelligence Step A is accepted at `4f6b1a905698970ae8a21ede41531cfd53f2dab4`. The repository now has one all-source serial operator command while preserving the existing verifier-gated publication pipeline.

Current active unit is **Step B only**: minimal authenticated admin archive/restore control plus durable suppression of archived items across future syncs. Step C scheduling remains unimplemented.

## 2026-10-01 automatic maintenance checkpoint — Step B accepted

Step B is accepted at `e741ff1b6d7ffc8dd662cd50e1c232d3256f272d`.

The system now supports:

- all-source serial policy sync;
- verifier-gated automatic publication;
- admin archive/unpublish and restore;
- durable archived suppression across future syncs.

Current active unit is **Step C**: deploy an independent Policy Intelligence operator and schedule it once daily at 06:00 Australia/Sydney. The long-lived web service must not execute scheduled sync.

## 2026-10-01 Policy Intelligence automatic maintenance — operational

Automatic Policy Intelligence maintenance is deployed and accepted.

Current production-style staging state:

- operator source checkpoint: `dc8595d365b565c869bcc82f2f02bc9cfd8ab9ec`;
- immutable operator image digest: `sha256:3caad29bc292b79de2508a4e0fdebb086a97824a709f45309e959b3fb369f28c`;
- ECS task definition: `immigration-ai-staging-policy-sync:1`;
- manual live run: PASS, container exit code 0, all three configured sources succeeded;
- EventBridge Scheduler: `immigration-ai-staging-policy-sync-daily`;
- schedule state: ENABLED;
- schedule: 06:00 daily, `Australia/Sydney`;
- scheduler targets one Fargate task using the dedicated operator task definition.

The complete operating model is now: automatic daily sync, verifier-gated publication, and admin exception control through archive/restore. Archived items remain suppressed across future syncs. Manual reviewed fallback entries remain the disaster-recovery public path.

## 2026-10-01 Policy Intelligence scheduler verification state

Current canonical state:

- automatic-maintenance implementation is deployed;
- manual live operator acceptance: **PASS**;
- operator image/task definition: accepted;
- EventBridge Scheduler configuration: **ENABLED and verified**;
- schedule: 06:00 daily, `Australia/Sydney`;
- first natural Scheduler-triggered invocation: **PENDING OBSERVATION**.

The prior AWS CLI `tasks-stopped` waiter timeout did not indicate an ECS/operator failure. The same task later stopped normally with exit code 0 and all configured sources succeeded.

No source-code change is required. The next operational check is only to observe the next scheduled ECS task and confirm exit/log status.


## 2026-10-03 Policy Intelligence diagnostics — PAUSED

The owner has paused further Policy Intelligence verifier/publication-gate development because other work has priority.

Canonical remote/deployed source before the pause is `047fc2f9ab2abee7ba247b00e0106019beff840a`. The 90s first analyzer attempt / 120s single timeout retry is deployed through web task definition `immigration-ai-staging-web:40` and policy-sync task definition `immigration-ai-staging-policy-sync:6`; the daily scheduler targets `:6`.

Post-deployment live telemetry accepted the timeout correction: subclass 494 succeeded on the first 90-second analyzer attempt after 70,991 ms and the ART scheduled-public-hearings item succeeded after 66,721 ms. The immediate analyzer-timeout issue is therefore considered mitigated.

The remaining investigation is the verifier/publication gate, especially subclass 494, which successfully reaches a stored revision but remains `review_required` because of source-status and evidence-support diagnostics. No verifier relaxation is currently authorized.

A coding agent also reported a local-only, uncommitted/unpushed admin detail endpoint at `GET /api/admin/policy-intelligence/[id]` that exposes the current-snapshot revision's structured analysis and verification to authenticated admins without source bodies or provider secrets. Focused tests reportedly passed 9/9 and `git diff --check` passed; the broader sandbox retained three environment-sensitive test failures and build was blocked by Google-font network access.

That endpoint is **not remote and not deployed** at this checkpoint. Preserve the local working tree. When work resumes, validate/review/commit the endpoint first, then use the 494 detail payload to determine whether the verifier or publication gate actually needs correction.


## 2026-10-04 Lawyer-feedback UI consolidation — ACTIVE PRIORITY

The owner has temporarily reprioritised Phase 11 around urgent lawyer feedback on the public information architecture and AI Workspace. Policy Intelligence verifier/publication-gate diagnostics remain paused under the 2026-10-03 checkpoint; the local-only admin revision-detail WIP must remain preserved and isolated.

The active product plan is intentionally coarse-grained to avoid the prior micro-fix / micro-regression loop:

- **LF-01 — Public Experience Consolidation: ACTIVE**
  - four public destinations: Home / AI Workspace / Services & Contact / Legal Updates;
  - Home hero brightness + Legal Updates directly below hero + more coherent navy visual rhythm;
  - consolidate Services / Process / Contact into the existing clean Contact-oriented surface while preserving legacy-route compatibility;
  - simplify public Legal Updates into two user-facing groups without changing internal legal/source-status semantics.
- **LF-02 — AI Workspace Consolidation: PLANNED**
  - fixed desktop application shell;
  - independent conversation scrolling;
  - right rail = Known + To Confirm + manual Generate case summary;
  - remove customer-visible AI confidence;
  - expose lawyer answer review and one-to-one consultation as two distinct human-service paths.
- **LF-03 — Policy-to-AI Continuity + Final Product Integration: PLANNED**
  - selected legal update opens a new AI conversation with a topic reference;
  - lightweight assistant opener only; no automatic analysis/model call before the user asks a question;
  - final cross-page bilingual/mobile consistency.
- **Final acceptance/deployment:** one concentrated gate and one rollout rather than many micro-gates.

Accepted backend/auth/billing/document/lawyer/consultation and Policy Intelligence provenance boundaries remain functional authority. This UI consolidation is not permission to redesign those systems.


## 2026-10-04 LF-01 verified / LF-02 activated

LF-01 is **VERIFIED** on remote commit `5719cee319ac022a6c6c4761820e8892779e6039`. Focused tests passed 46/46, production build passed, changed-file Biome passed, `git diff --check` passed, and representative desktop/mobile visual smoke passed. The public four-destination information architecture, canonical Services & Contact page, Home hierarchy, and two-group Legal Updates presentation are accepted and should not be reopened for non-blocking polish.

The Policy Intelligence admin revision-detail WIP is now safely backed up on remote branch `policy-intelligence-admin-detail-wip-20261004` at `a73e3b51cb091b275f46116bad911ede445be54d`; it remains unmerged and undeployed. Policy verifier/publication diagnostics remain paused.

**Current active stage: LF-02 — AI Workspace Consolidation.**

LF-02 is intentionally one coarse implementation unit:

- desktop AI Workspace becomes a viewport-constrained application shell rather than a long page;
- central conversation scrolls independently and composer remains visible;
- right rail is reduced to Known information, To confirm, and explicit manual Generate case summary;
- case summary is a deterministic user-triggered snapshot of current structured context in LF-02, not a new LLM/backend workflow;
- customer-visible AI confidence is removed while backend contracts remain intact;
- answer-level sources/citations remain in the conversation rather than duplicated in the right rail;
- VIP human-service presentation clearly exposes lawyer review of the AI answer plus the existing P11-008 one-to-one consultation request path;
- no real-time lawyer chat is claimed or implemented.

LF-03 remains planned and must not be pulled into LF-02.


## 2026-10-04 LF-02 verified / LF-03 activated

LF-02 is **VERIFIED** at remote commit `1fab2376fb72dc02587b46b1f6b9157379a5b3ee`.

Final evidence: 23/23 focused tests, 497/497 standard unit tests with no skips, production build, changed-file Biome, `git diff --check`, desktop application-shell smoke, and 390px mobile smoke all passed. The one substantive review defect—case-summary leakage across conversation boundaries—was corrected before acceptance.

Accepted LF-02 product state:

- viewport-constrained desktop workspace with internal pane scrolling and no workspace footer;
- right rail = all Known information + all To confirm + explicit manual frozen summary snapshot;
- no customer-visible AI confidence/current-matter/next-action/duplicate-source/generic-lawyer-promo panels;
- answer-level citations remain attached to answers;
- VIP lawyer review and existing one-to-one consultation remain separate human-service paths.

**Current active stage: LF-03 — Policy-to-AI Continuity + Final Product Integration.**

LF-03 must make the Legal Update -> AI handoff create exactly one new conversation, carry only a bounded server-resolved policy topic reference, show a deterministic lightweight opener without automatic model invocation, and then let the user's question enter the unchanged Fast / Legal Check / Premium answer flow. Policy context must not leak when the user switches/creates another conversation.

No Policy Intelligence verifier/publication-gate work is reactivated by LF-03.


## 2026-10-05 LF-03 verified / Final Acceptance activated

LF-03 is **VERIFIED** at remote commit `02b8b254ebc5d44b68ac24a1597a7ce6333a1d13`.

Evidence: 58 focused TypeScript tests, 42 focused legal-service tests, 499 chatbot standard unit tests, production build, changed-file Biome, `git diff --check`, and browser behavior smoke all passed. Independent source review found no additional release correction requirement.

Accepted LF-03 invariants:

- one-time policy launch creates exactly one fresh conversation;
- refresh is idempotent after `launch=policy` is consumed;
- no automatic model call occurs on policy handoff;
- only a bounded server-resolved published-policy topic hint reaches the answer context after the user asks;
- the original user question is unchanged;
- policy interpretation is not legal evidence;
- topic context is excluded from normal conversation-history persistence;
- policy continuity clears across conversation boundaries.

**Current active stage: Consolidated Final Acceptance + Deployment Gate.**

There is no LF-04. Feature development is frozen unless the acceptance gate identifies a true release blocker.

The remaining mandatory integration evidence is a real local legal-service/model response from a policy-linked conversation, including normal answer/citation behavior when sources are used. Deployment remains blocked until the consolidated acceptance decision is PASS.



## 2026-10-06 Final Acceptance PASS / Release preparation

The consolidated Final Acceptance completed with **FINAL ACCEPTANCE: PASS**. No source changes, release correction, commit, or push were required during the acceptance run.

Acceptance checkpoint:

- branch: `phase11-lawyer-feedback-ui-consolidation`
- accepted feature/docs HEAD entering acceptance: `6decd118efaf2d864f98e0c94400c270399f250a`
- worktree remained clean; Next.js-generated `chatbot/next-env.d.ts` was restored to HEAD;
- no LF migration diff;
- preserved Policy Intelligence WIP remained unmerged.

Real local services were exercised with legal-service on port 8000 and chatbot on port 3000, then stopped.

### Closed LF-03 E2E gap

Published policy tested: `evisitor-application-arrangements-lin-26-061` (LIN 26/061), with official source on legislation.gov.au.

Observed end-to-end behavior:

- Ask AI created exactly one conversation: `077d4c85-db78-4e5b-90b6-2b5e09c5d7b8`;
- `launch=policy` was consumed after successful conversation creation;
- resulting URL retained `policy + chatId`;
- opener was visible before user input;
- no widget/model request occurred before the user submitted a question;
- refresh reused the same conversation and did not create a second POST/model call;
- exact question `How might this affect someone in my situation?` remained unchanged;
- Fast sent the policy slug, local legal-service returned HTTP 200, and provider returned HTTP 200;
- the answer was distinct from the policy title and exposed two answer-associated citations;
- the policy topic reference was not stored as a fake chat message;
- switching/new conversation cleared policy continuity and later ordinary Fast requests omitted `policySlug`.

### Consolidated validation evidence

- chatbot `pnpm test:unit`: 499 passed, 0 failed, 0 skipped;
- chatbot production build: passed;
- focused Biome across 23 accepted-surface files: passed;
- `git diff --check`: passed;
- focused legal-service suites: 270 passed, 2 warnings;
- full legal-service pytest: 1,230 passed, 4 failed, 2 warnings.

The four full-suite failures were assessed as existing non-LF backend expectation mismatches involving Flat-RAG tool exposure, reasoning-effort defaults, and native-search-context defaults. Relevant focused LF suites passed and no LF release blocker was identified.

Repository-wide `pnpm lint` remains a known baseline failure with 15,182 diagnostics across 557 files. Focused accepted-surface Biome passed. This is not treated as an LF-caused release blocker.

### Coverage limits accepted for this release gate

- local guest entitlement exposed Fast only; Legal Check and Premium were not exercised interactively;
- guest access prevented live document-record, lawyer-review, and consultation submission flows;
- no entitlement/RBAC bypass was used;
- the existing focused ownership/RBAC/consultation/document-provenance tests passed;
- the local live Legal Updates dataset had no proposed item, so Proposed / Planned presentation was not exercised with live data;
- the manual case-summary snapshot behavior was exercised, but the tested answer returned no structured known/requested facts to demonstrate a visibly changed regenerated fact set.

These limits are recorded as coverage limitations, not release blockers.

### Decision

The lawyer-feedback consolidation feature set is accepted. There is no LF-04.

**Current state: RELEASE PREPARATION / DEPLOYMENT PENDING EXPLICIT OWNER AUTHORISATION.**

Do not resume the paused Policy Intelligence verifier/publication investigation until the accepted LF release is merged/deployed and production smoke is complete.



## 2026-10-06 Owner visual sign-off required

The automated/technical Final Acceptance run reported PASS, but **release acceptance is not yet complete**. The owner explicitly requires a manual visual review before any merge, release preparation, or deployment step.

Current release status:

- LF-01 source review: VERIFIED
- LF-02 source review: VERIFIED
- LF-03 source review: VERIFIED
- automated/integration acceptance: PASS
- **owner visual sign-off: PENDING**
- canonical-branch merge: BLOCKED pending owner visual sign-off
- deployment: BLOCKED pending owner visual sign-off

Do not treat the previous “Final Acceptance PASS” record as owner approval to merge or deploy. It records technical acceptance evidence only.

The visual review should cover the accepted public and workspace surfaces, especially:

- Home desktop/mobile, zh-CN/English;
- Services & Contact desktop/mobile;
- Legal Updates list/detail and Ask AI CTA;
- ordinary AI Workspace desktop/mobile;
- policy-linked AI Workspace opener and topic continuity;
- Known / To Confirm / manual case-summary presentation;
- answer citations/sources;
- lawyer-review and one-to-one consultation presentation where legitimately accessible;
- header/navigation/account presentation and any obvious overflow, hierarchy, spacing, clipping, or misleading copy.

Only after the owner explicitly approves the visual result may release merge/deployment preparation resume.



## 2026-10-06 Owner visual sign-off PASS

The owner completed a manual visual review and accepted the current lawyer-feedback UI/product consolidation without requesting further UI changes.

Owner decision:

- visual review: **PASS**
- current LF UI/product modification cycle: **CLOSED**
- minor/detail refinements are deferred to future real-lawyer usage feedback rather than reopening this release
- canonical-branch merge is now authorised
- deployment remains a separate later step

This visual sign-off supersedes the immediately preceding “owner visual sign-off pending” release hold. Preserve the accepted LF-01/LF-02/LF-03 behavior during merge. Do not resume Policy Intelligence verifier/publication work as part of the merge.


## 2026-10-06 Canonical LF merge complete / Policy Intelligence Refresh Reliability ACTIVE

The accepted lawyer-feedback consolidation is now on the canonical branch. The canonical and former LF branch were verified at `dfb845de5ce2ffb9862000b6c7bedaa7312255b7`; the local canonical worktree was clean after the fast-forward merge/push. The LF UI/product modification cycle remains closed and deployment remains a separate action.

Policy Intelligence reliability work is now explicitly resumed as a new bounded task: `docs/agent-memory/tasks/PI-REFRESH-RELIABILITY.md`.

Read-only AWS/RDS evidence collected on 2026-10-06 changes the immediate diagnosis:

- the EventBridge Scheduler is enabled and natural 06:00 Australia/Sydney runs occurred across 3–6 October;
- recent runs for Home Affairs, Federal Register and ART completed but all discovered candidates were unchanged, so no new snapshots/analyzer/publication work ran;
- Federal Register live dry-run exposed a structural discovery defect: the effective candidate set is dominated by the sitemap seed/static homepage/Terms/Glossary rather than current legislation;
- Home Affairs exposes 70 alert items and its first ten are currently the newest; there were no hidden 3–6 October alerts below the ten-item cutoff, so the recent inactivity is not caused by the ten-candidate limit alone;
- earlier verifier/publication holds remain a separate issue and must not be used to explain recent discovery-stage inactivity.

**Accepted implementation: RR-01 — Discovery reliability + operator observability — ACCEPTED; STAGING DEPLOYED.**

RR-01 implemented source-aware Federal Register selection, Home Affairs date ordering/multi-URL coverage, ART selection, and bounded authenticated sync-run observability while preserving SSRF/resource bounds and analyzer/verifier/publication-gate strictness.

The protected branch `policy-intelligence-admin-detail-wip-20261004` at `a73e3b51cb091b275f46116bad911ede445be54d` remains separate. Do not merge, reset, delete or silently fold it into RR-01.

RR-01 is accepted and staging-deployed as recorded above. RR-02 is accepted at
canonical commit `9461efbe14b22936e6a7311eaadbff413d02070f`; source review,
owner local validation and staging revalidation all PASS. See the detailed
staging record in `docs/agent-memory/tasks/PI-RR-02-GUIDANCE-CONTRACT.md`.

## 2026-10-06 Emergency AI Workspace hotfix — ACTIVE / one-pass scope

The owner has approved the final UI direction. Screenshot semantics are fixed: **A is the AI conversation display and must gain space; B is the composer and should remain intact.** The old always-visible case-file panel above A should no longer occupy its own block.

The hotfix has exactly two product fixes and should be implemented **in one pass**, not split into micro-subtasks:

- **Composer attachment redesign:** remove the standalone idle `MatterDocumentsPanel` block above A. Put the existing upload action behind a compact `+` attachment control in the lower-left of the composer, ChatGPT-style. With no documents, document UI should consume essentially no extra vertical space. When real documents exist, show only a compact attachment/status row or chips near the composer, while preserving the existing upload/processing/security/selection/manage behavior. Supported-format/25 MiB explanatory copy belongs in the upload/manage affordance when needed, not permanently in the main workspace. Do not enlarge B; the reclaimed height should flow automatically to A through the existing flex layout.
- **Policy-to-AI first-turn context:** preserve the existing bounded server-resolved `policy_topic_reference`, but make it available to semantic-turn routing before a fresh policy-linked first question is classified. Questions such as “请详细介绍一下这项政策” or “这个变化对学生有什么影响？” must resolve against the selected Legal Update instead of asking which policy the user means.

This is intentionally **not** a redesign. Runtime application source remains based on canonical runtime commit `3a5e821e38c0ad5d52e041ac3ea46c34d6441c6d`; planning-doc commits may advance HEAD. No database migration, Policy Intelligence analyzer/verifier/publication-gate change, answer-architecture rewrite, upload backend/security redesign, AWS change, or unrelated cleanup is authorised.

**Execution rule:** one implementation pass, concentrated validation, then STOP. Target a small patch (roughly 3–6 source/test files). Do not create a sequence of tiny repair tasks unless a validation result exposes a real correctness blocker.

Detailed plan: `docs/agent-memory/tasks/AI-WORKSPACE-EMERGENCY-HOTFIX-2026-10-06.md`.

## 2026-10-06 Emergency AI Workspace hotfix — LOCAL RUNTIME ACCEPTED / STAGING PENDING

The emergency AI Workspace hotfix is implemented and committed on the canonical branch at
`c0d04f19ea9b55d02135b84ca08fc172c5654202`
(`fix: streamline AI workspace document context`).

Accepted product behavior:

- the large always-visible case-file block above the conversation was removed; upload is now a compact `+` affordance in the composer and real files render as compact chips, so reclaimed height belongs to the conversation;
- Legal Update -> **就这项政策向 AI 提问** preserves the selected policy topic into the AI Workspace first turn and follow-up context;
- successful document storage now transitions directly to `securityStatus=clean`; GuardDuty/EventBridge/SQS/ECS support remains in the repository/AWS estate but is no longer a blocking dependency for normal document usability;
- processed customer documents are conversation-scoped context, not per-turn selected attachments;
- Fast, Legal Check and Premium/direct routes resolve usable documents server-side from the authenticated owner + conversation, skipping unfinished/failed/evidence-free documents rather than failing the whole turn;
- the obsolete `selectedDocumentIds` client contract, manual **用于下一个问题 / Use for next question** interaction and per-turn selection clearing were removed;
- document evidence remains bounded but was widened to 8 documents, 16 units per document, 64 units total, 6,000 characters per unit, 20,000 characters per document and 64,000 characters total;
- legal-service document context now presents readable labelled document/unit text while retaining provenance, partial/truncated markers and the rule that customer files are customer-provided evidence rather than official law;
- when usable document evidence is present and the user asks about an uploaded file, the model is explicitly instructed to use that evidence rather than claim the file is unavailable.

Owner browser acceptance passed with a fresh TXT upload: the file reached a usable/complete state automatically and the AI correctly returned the uploaded text, `Immigration AI document upload smoke test.`, with customer-document evidence provenance visible in the answer.

Focused validation reported by the implementation pass passed: 9 focused Node test files, 12 Fast/Luna tests, changed-file Biome and `git diff --check`. A later owner-local production build before the final conversation-context expansion had passed; the implementation environment could not complete the final build because Google Fonts were unreachable, so the final canonical commit still requires one owner-local production build before staging deployment.

Local database note: during this hotfix acceptance the normal local `chatbot` database was explicitly migrated from ledger `0017_wooden_silver_sable` through repository head `0023_chief_famine` so MatterDocument/processing tables were available. Earlier statements that the normal local chatbot DB remained at 0017 are historical and no longer describe the current owner-local environment.

**Current release state:** source committed/pushed and owner browser smoke PASS; final owner-local production build and AWS staging deployment/revalidation are pending. Do not reopen broad source review unless either gate exposes a core regression.


## 2026-10-10 China Stripe payments — INITIAL IMPLEMENTATION PLAN (HISTORICAL)

The owner has approved a fast China-payment extension and explicitly does **not** want this split into many micro-milestones. Implement it as one bounded billing feature pass, then run concentrated validation and stop for review.

Target product behavior:

- preserve the existing Stripe **AUD card monthly subscription** path without regression;
- add **Alipay + CNY monthly recurring VIP** through Stripe, but only when the Stripe account/configuration is actually approved/capable for recurring Alipay; capability/configuration must fail closed rather than pretending support;
- add **WeChat Pay + CNY one-time prepaid VIP** through Stripe Checkout, initially exactly **30 days** with no auto-renewal;
- successful WeChat renewal extends from `max(now, existing vipExpiresAt)` rather than discarding already-paid remaining VIP time;
- browser return URLs remain display-only; **only verified Stripe server-side events may grant/extend VIP entitlement**;
- duplicate/retried webhooks and checkout completion must be idempotent;
- keep payment/provider facts separate from entitlement state so Premium access still depends on trusted server-side VIP state.

Fast-delivery boundaries:

- use Stripe for both Alipay and WeChat Pay; do not add direct Alipay/WeChat SDK integrations;
- no 90-day/365-day WeChat packages in this pass;
- no live FX conversion; CNY pricing is explicit/configured;
- no broad billing framework rewrite;
- no unrelated Policy Intelligence, AI answer-path, consultation, document, or lawyer-workspace changes;
- preserve existing Stripe card subscription, cancellation, billing portal, webhook safety, notification/outbox and existing-customer semantics;
- if an additive database migration is required, create it in the repository but do not apply it to staging/production without separate authorization.

Implementation should inspect and reuse the existing Phase-9 billing surfaces before changing them, especially `VipPlanPrice`, `VipSubscription`, the historical one-time `VipPurchase`, Stripe gateway/checkout/webhook code, VIP status/entitlement logic, and `VipMembershipClient`.

Detailed task packet: `docs/agent-memory/tasks/STRIPE-CHINA-PAYMENTS-2026-10-10.md`.

**Historical note:** This implementation instruction has been superseded by the merged-and-paused status below.

## 2026-10-10 Stripe China payments — CODE MERGED; ACTIVATION / PAYMENT TESTING PAUSED

**Owner decision:** Stop further China-payment implementation, Stripe setup and live-payment testing for now; resume only on explicit owner request. The pause is a **commercial activation / external approval hold**, not a source-code defect or rollback.

- **Implemented and code-reviewed:** Stripe WeChat Pay CNY one-time Checkout (30-day prepaid VIP); verified-payment-only entitlement, safe repeated-event settlement and additive expiry; existing AUD/card monthly subscriptions preserved. Two follow-up review defects were corrected before acceptance.
- **Merged to canonical:** `phase11-chinese-service-platform-ui-rebase` at `0bcdc1f01ae74426367914a04b7ebf4d4b7e3c17`. Owner terminal output confirmed local and origin refs matched after fast-forward push. No payment-schema migration.
- **Stripe Dashboard observation (2026-10-10):** WeChat Pay showed **Pending approval** after the owner enabled/requested it; not yet **Enabled/approved**. The displayed "Recurring payments: Requires approval" is distinct from our one-time prepaid product. Do not assume an approval deadline or a need for additional documents without Stripe confirmation.
- **Alipay:** Remains **not implemented / disabled in application**. Dashboard separately showed Pending approval, which does not establish recurring-Alipay capability. Do not configure or activate Alipay as part of this paused task.
- **Not done:** No approved CNY/30-day business price, WeChat activation keys/enable flag, Stripe test/live payment smoke, AWS deployment of this payment change, or verified customer paid-to-VIP end-to-end flow. Existing server-side Stripe API/webhook configuration is reused, not copied into docs; no secrets may be committed.
- **Resume gate:** Confirm Stripe WeChat Pay is approved and eligible for one-time CNY transactions; obtain approved CNY price; configure `VIP_WECHAT_CNY_30_DAY_AMOUNT_MINOR` and `VIP_WECHAT_PAY_ENABLED` in the appropriate protected server environment only after access/payment-webhook readiness; verify relevant Stripe checkout/webhook events in sandbox or authorized test; validate real paid/async/duplicate/cancel/refund or reversal semantics and AUD-card regression before authorizing deployment/production acceptance.
- **Standing instruction:** No further billing code, Stripe, live payment, database or AWS mutation without a new explicit owner request. Continue unrelated product development independently.

This entry supersedes any earlier "ACTIVE / implementation pending" instructions for China Stripe payments; earlier records remain historical implementation evidence.

<!-- BEGIN PHASE13_M2_A1_2_B2_1_R1_HISTORICAL_2026_10_26 -->
## Historical canonical state — B2-1 R1 before R2 (2026-10-26)

R1 GuardDuty schema, approval-expiry and CLI-result corrections passed independent review. That review identified the numeric AWS CLI process-exit classification defect recorded and fixed in the current R2 section above. R1 focused validation was B2-1 **27/27**, B2-0 **16/16**, B1 evaluator **16/16**, B1 queue **11/11**, A1.2-A **17/17**. Historical patch: `~/phase13_m2_a1_2_B2_1_R1_review.patch`. No acceptance was claimed at that checkpoint.

<!-- END PHASE13_M2_A1_2_B2_1_R1_HISTORICAL_2026_10_26 -->
