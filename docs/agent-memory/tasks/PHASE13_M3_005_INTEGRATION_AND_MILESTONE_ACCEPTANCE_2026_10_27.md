# Phase 13 M3-005 — Education Intelligence integration and offline milestone acceptance

Date: 2026-10-27 (Australia/Sydney)
Status: **BOUNDED OFFLINE TASK PREPARED / CODE NOT STARTED**
Branch: `phase13-study-journey-project-centric`
Accepted M3-004 code SHA: `eefb6eb7fee187e99c10790075967a73f4976f92`
Required dispatch HEAD: the following **documentation-only acceptance/dispatch commit**, after owner `git pull --ff-only`.
Authority: Phase13 frozen M3 architecture Sections 1–10; D-P13-008–D-P13-012; M3-001–004 acceptance documents; `AGENTS.md`. This is an OFFLINE composition and acceptance packet, not production release authorization.

## 1. Objective and measurable deliverables
Close the **engineering/offline** M3 milestone with an **actual integrated synthetic workflow** across the accepted M3-001–004 layers, not another isolated feature. Verify consistent identity/evidence through source manifest and acquisition -> bounded provenance/review -> candidate EducationDataset -> repository-style ingest/replay -> consistent scoped catalog read -> existing deterministic field resolution -> M3-004 explainable options using freshly authorized simulated Project facts -> truthful final read/no-eligibility result.

Deliver:
(A) A bounded integrated test harness and representative synthetic case matrix.
(B) Traceable assertions for provenance, authority roles, dates, fees, uncertainty, identity uniqueness, immutable history, approval and Project scope; deterministic replay across stages.
(C) A machine-readable **M3 offline acceptance matrix/report** (tested status PASS/FAIL/NOT_RUN, test IDs, relevant source of evidence, known limitations), plus concise operator-readable results. Do not claim a stage passed because another, narrower test passed.
(D) Updated three canonical status docs to **M3-005 implementation pending independent review**; preserve M3-004 acceptance and historical evidence.

The acceptance report must distinguish three independent dimensions: **code/offline correctness**, **isolated M3-002 PostgreSQL structural/behavioral evidence already accepted**, and **real-source/real-Project/production readiness not authorized or tested**. If all offline tests pass, recommend `M3 OFFLINE ACCEPTED_WITH_LIMITATIONS`, **not** production GO.

## 2. Read the actual contracts and test baseline first
Mandatory: `AGENTS.md`, `docs/agent-memory/{CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE,DECISIONS}.md`, frozen M3 architecture, this task, M3-001–004 acceptance records, current repo branch/HEAD and clean tree.

Inspect concrete existing modules and tests before building adapters:
- M3-001 `chatbot/lib/education-intelligence/{contracts,identity,field-resolution,fixtures}.ts`;
- M3-002 `catalog-repository-core.ts`, `postgres-repository.ts`, `postgres-repository.integration.test.ts` and the read/query interfaces;
- M3-003 `{source-manifest,acquisition-policy,acquisition-core,acquisition-review,acquisition-fixtures}.ts`;
- M3-004 `{read-model,option-comparison,project-options}.ts`;
- M2 `chatbot/lib/project-facts/facts.ts` stableProjection().authorizedForAI, `chatbot/lib/projects/{context-resolver,project-context}.ts` and the M1 Project/Chat authorization freeze.

Use exported ports already available: `EducationCatalogRepositoryCore` + `EducationCatalogStore`; `EducationCatalogReader.readConsistent` and `readEducationCatalogConsistent`; `buildEducationResolvedReadModel`; `acquireEducationSource` and `buildEducationAcquisitionReviewPacket`; `compareReviewedEducationCriterion` with `EducationCriterionReviewAuthority`; `buildProjectPossibleOptions` with `CurrentAuthorizedProjectOptionsReader`. Verify signatures against live files, don't assume they accept interchangeable models.

M3-004 already has R1 and R2 fixes: never display stored entity dates as current, bind reviewed numeric rule to immutable exact observation/snapshot/source excerpt and trusted reviewer version/hash, reject invalid nested criteria before any catalog lookup, and zoned timestamp applicant dates => UNKNOWN.

## 3. Integrated synthetic scenarios (at least one real cross-stage flow)
Provide at least one deterministic **connected** test of multiple layers using one coherent fixture graph. Avoid testing only disconnected fake outputs. Use the existing M3-001 multi-scenario fixtures or construct a new clearly `TEST_ONLY_SYNTHETIC` corpus under reserved `.example` hosts.

- Operator-approved **synthetic** manifest + injected fake DNS/transport + bounded acquisition, with an actual immutable snapshot and candidate observation. `buildEducationAcquisitionReviewPacket` must preserve source URL, source family/scope, hash/locator/excerpt, attempt time and nonverified class. Verify non-approved manifests never invoke transport.
- Validated candidate graph enters the real `EducationCatalogRepositoryCore` through an **in-memory implementation of its actual `EducationCatalogStore` port**, or a minimal test-only bridge over existing accepted transaction APIs. Avoid direct PostgreSQL; ensure the integrated test actually exercises repository identity/replay/rollback semantics, not a substitute list of invented repository results.
- Present the stored/read dataset through an in-memory `EducationCatalogReader.readConsistent` implementation (test adapter may project from the repository's existing consistent scoped read APIs) to `buildEducationResolvedReadModel` and `buildProjectPossibleOptions`. Tests must demonstrate evidence stored by the first step is the same evidence consumed downstream. If accepted interfaces cannot be faithfully bridged without altering frozen production code, **record explicit blocker** and stop rather than silently fabricating a mock that skips a layer.
- An injected current Project authority reader yields only simulated M2 authorized-stable applicant facts; a separately injected trusted criterion-review authority binds the synthetic admissions rule to exact observation/snapshot/excerpt and immutable revision/digest. Assert downstream comparison outcome/UNKNOWN reasons, complete source trace and final no-eligibility/no-raw-fact contract.

Reuse prior individual tests; prefer new `chatbot/lib/education-intelligence/milestone-integration.test.ts`, small test-only fixtures or adapters and an acceptance-report generation helper. No second production repository/resolver/trust engine. Preserve M3-001–004 byte-for-byte unless a **reproducible cross-layer defect** justifies a separately explained minimal corrective edit.

## 4. Acceptance matrix: domain correctness and no fabricated admissions
At minimum cover:
1. **Five pathways** ELICOS, VET, undergraduate, coursework master's, research, and note source family/authority level for each (all synthetic). Same course title in two different providers must never merge.
2. Provider CRICOS code vs Course CRICOS code, official registration-like claim vs institution admission claim vs government discovery; no CRICOS registration implies active intake, admission or CoE.
3. Same course with multiple campus/delivery-mode branches; distinct same-named intakes/different academic years; no course-wide deadline copied into a particular intake.
4. Fees with conflicting values for same fully comparable scope return CONFLICTED; mismatched AUD/currency, international/domestic audience, basis, year/period/inclusions cannot be directly compared or treated as resolved.
5. Absent fees, admissions requirements, specific intake and deadline remain UNKNOWN (never empty-string false, 0, default date or MATCHES). A stored intake entity deadline with no field observation is not a current deadline.
6. A-B-A source content captures with distinct snapshot IDs preserve history; exact attempt replay idempotent; same ID with altered snapshot/observation/binding is rejected without mutation.
7. Different observedAt vs retrievedAt vs publishedAt vs effective vs intake start vs application deadline; future effective, stale, withdrawn, not applicable and concurrent contradictory institution snapshots keep exact time, values and conflicting history. Latest failed fetch/parse must mark uncertainty where appropriate.
8. Approved operator access is not an independently verified source fact. Caller-declared comparator approval without injected trusted, matching digest/revision/reviewer is insufficient; changed threshold, unit or source excerpt/hash/snapshot yields UNKNOWN. Free-text admissions prose without reviewed structured criterion => UNKNOWN.
9. Explicit criterion MATCHES and DOES_NOT_MATCH with compatible typed facts **only**, plus UNKNOWN for absent fact, mismatched fact version, unreviewed rule, source class/status, incompatible units/fees and timezone-bearing applicant date; NOT_APPLICABLE must be supported, never a default pass.
10. Project A vs Project B, owner vs other member's Chat, revoked/missing AI grant, withdrawn publication, conflict/supersession, closed Project, feature-disabled, membership change and source authorization loss between first and final checks -> no private facts and no returned private option result. Assert raw user data cannot enter error strings, fixture traces, debug logs, catalog fields or snapshot URLs.
11. Strict bounds on source count, fetch/response/redirect, read row count, query count, timeouts and output size. Wrong source scope, malicious URL/path/query/redirect, invalid field target, malformed nested criteria and partial reader data fail closed; no partial plausible answer.
12. Identical inputs, explicit assessment time/date and trusted reference revision yield byte-stable normalized result. Changes in evidence/authorization yield a different result or safe refusal, never stale cached success.

Tests should assert meaningful behavior, not only exported function calls and `typeof` checks. No simulated approval may be called real official verification. Store hashes/source refs as test evidence.

## 5. Security, privacy, and negative-side-effect proof
- **OFFLINE ONLY**: no live HTTP, DNS, browser fetch, AWS, cloud model, third-party service or credential consumption. Use injected fake transport/dns/Project authority/read store. Do not run a real provider, model or production route.
- **NO database mutation or connection**, even the previously authorized `immigration_ai_phase13_m3_002_test` and normal `chatbot`: past M3-002 acceptance is a separate valid result; M3-005 must not assume renewed permission to insert/test/recreate schema. A future optional full PostgreSQL integration test may be *authored* guarded/dormant only, not run absent fresh exact-target owner approval. Prefer the entirely in-memory connected test.
- No new migration (0040 byte-unchanged), no Project/Chat/API/UI route or database schema changes, no automatic application actions, no admission assessment, no financial/billing action, no policy source-first publication, no release/deployment.
- All private fact data and untrusted HTML remain away from public catalog output; no logging in tests that embeds real data or secrets. Tested material must be obviously synthetic, `.example` reserved host.
- The trusted approval authority may be a test fake but caller-provided APPROVED metadata alone must never suffice. Recheck fresh Project context **before and after** catalog processing, including revisions/versions; no TOCTOU bypass.

## 6. Validation and reporting gates
A. Run `node --import tsx --test` on new M3-005 integration tests with exact pass/fail/skip counts. Run the full existing education focused suite (at M3-004 acceptance **103/103**, 11 files), plus any new cases; explicitly include new files because the `pnpm test:unit` script may omit them.
B. Run changed-file Biome, `git diff --check`, TypeScript diagnostic diff vs known **44 existing unrelated** diagnostics (0 new in M3), optional `pnpm db:check` ONLY if applicable; no schema changes should occur.
C. Run `pnpm test:unit`; sandbox `113 pass/3 fail` can be documented as environment-only pending exact owner Ubuntu rerun; last accepted owner host reference **964 pass/0 fail/0 skipped**.
D. Produce a structured, reproducible gate report under the M3 tasks folder or `chatbot/lib/education-intelligence` test outputs. For each gate: source test case(s), observed result, status PASS/FAIL/NOT_RUN/NOT_APPLICABLE, reason, and explicit source of evidence (Codex sandbox vs owner-host vs previously accepted M3-002 isolated PG). Mark unrun live-source and full DB-stack as NOT_RUN, never PASS. Do not invent outcomes or claim "all stages E2E" if adapter skips actual stage.
E. If a core invariant fails, identify first failing assertion and bounded correction plan; no endless performance polish or scope creep. Acceptance authority remains ChatGPT independent audit plus owner host evidence and push.

## 7. Hard stop and handoff
Codex may change only new M3-005 integration fixtures/tests/report helpers and 3 canonical status docs, unless a minimal proven integration defect is separately disclosed and justified. Keep prior M3-001–004 implementation and migration untouched. All tests must use injected offline fakes and sanitized synthetic data.

Do not commit or push. No real source fetch, production DB, isolated test DB mutation, migration, AWS, model, public endpoint, UI, real Project data, deploy, paid provider or M3-006/new milestone. M3-005 itself is a **bounded offline implementation + test packet**, not automatic Project launch or school admissions automation.

Handoff must include exact branch/HEAD/worktree, changed-file list, cumulative diff/patch + SHA-256, test counts and skips, acceptance matrix/report path, every unresolved limitation and specific real-world gates still `NO_GO`. Update three canonical status docs to `M3-005 implemented / independent review pending` without marking M3 overall accepted before external reviewer and owner host tests.

The owner runs independent Ubuntu tests after ChatGPT code review, then owner commits/pushes only on acceptance. ChatGPT verifies remote SHA and records final **M3 OFFLINE ACCEPTED_WITH_LIMITATIONS** (if supported) in the canonical documents, leaving live/production NO_GO until separate authorizations.
