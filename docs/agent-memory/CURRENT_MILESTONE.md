# CURRENT_MILESTONE
<!-- BEGIN PHASE13_M1_4_OWNER_ACCEPTED_UI_PLAN_2026_10_24 -->
## Active milestone — Phase 13 M1.4 minimal Project Workspace UI (2026-10-24)

- M1.3 source/security reviewed and committed: `27ceb8a3e75456f3357027e368565674687a3896`, local and remote heads verified; clean worktree as reported by owner. No Project production flag enabled.
- Owner accepted Project UX foundation + longer-term lawyer-inspired staged UI. M1.4 implements only Project list/create/select and individually owned Project Chat create/open inside existing Workspace, with server-derived Project origin/read-only, bilingual and mobile behavior. M1.4 implementation **not started in this docs commit**.
- Binding M1.4 task: `tasks/PHASE13_M1_004_MINIMAL_CUSTOMER_WORKSPACE_CONTRACT.md`. Full product/UI blueprint: `PHASE13_UI_PRODUCT_BLUEPRINT_2026_10_24.md`. M2 facts/documents, M3 education intelligence, M4 professional engagement/review, M5–M8 workflows/guards and M9 full integrated workspace remain separate milestones.
- No Project names, stage/status, Project documents or progress UI before actual backing server state. `PHASE13_PROJECT_CHAT_ENABLED` default off; do not deploy/enable.
- Documentation-only update; no tests, migrations, production or shared DB operations.
<!-- END PHASE13_M1_4_OWNER_ACCEPTED_UI_PLAN_2026_10_24 -->

<!-- BEGIN PHASE13_M1_3_R1_SECURITY_CORRECTIONS_2026_10_24 -->
## Current milestone — M1.3 security review R1 corrections complete (2026-10-24)

- R1-01: Project-linked Chats are rejected by Vote GET/PATCH after persisted-origin checking; lookup/schema uncertainty fails closed. Standalone voting behavior is retained and covered by executable handler tests.
- R1-02: Project history list/count/detail/message pagination and Project-specific Chat listing require the current registered-customer identity using M1.1's `role = 'user'` plus shared `guestRegex` semantics. Standalone history has no added role restriction. Project title updates and turn admission retain their existing current-customer guard.
- Focused tests: **6 files passed, 0 failed, 0 skipped**. Guarded M1.3 disposable-PostgreSQL integration: **1 passed, 0 failed, 0 skipped**, including Project ingress, staff/guest owner denial, revocation, closed-project reads, Standalone history, and concurrent turn admission/revocation.
- Changed-file Biome passed on **7 files**; `git diff --check` passed; TypeScript remains at **44 baseline diagnostics** and has none in R1-changed areas. The fixed disposable DB was status-checked before/after and retained 42 public tables; integration fixtures were cleaned. No schema/migration, commit, push, shared/live DB, or deployment changes.
- Existing M1.3 implementation remains uncommitted at base `5704520b54921590dfe11facb1570090e2b69f98`; independent review remains pending.

<!-- END PHASE13_M1_3_R1_SECURITY_CORRECTIONS_2026_10_24 -->

<!-- BEGIN PHASE13_M1_3_IMPLEMENTATION_2026_10_24 -->
## Current milestone — Phase 13 M1.3 implemented; awaiting independent review (2026-10-24)

- M1.3 Project Chat APIs, current owner/member plus individual creator authorization, history/detail/message/update integration, and Fast/Default/Premium turn admission are implemented at uncommitted base `5704520b54921590dfe11facb1570090e2b69f98` on `phase13-study-journey-project-centric`.
- Project-origin metadata is server-derived from `ProjectConversation`. Revocation denies read/write; closed Projects and the default-off `PHASE13_PROJECT_CHAT_ENABLED` emergency gate retain clearly identified read-only history. Existing turn claims and replay/fencing remain unchanged; Project lock, current Membership check, Chat ownership and claim share one short transaction before inference.
- Guarded fixed-disposable PostgreSQL results (Codex-executed sequentially): M1.1 **10/10**, M1.2 **7/7**, M1.3 **1/1**, all with zero failures and zero skips. The M1.1 guarded reset/migration proof touched only `immigration_ai_phase13_m1_1_test`.
- Final `pnpm test:unit` outside sandbox: **911 passed, 0 failed, 0 skipped**. `pnpm db:check`, changed-file Biome (30 files) and `git diff --check` passed. TypeScript remains at **44 baseline diagnostics**, with zero in changed areas. In-sandbox full unit attempt's three child-process/loopback failures were isolated and passed outside sandbox.
- No application schema, migration or migration metadata changed; no live/shared database or production system changed. No commit, push or feature enablement. M1.4 UI workflows and Project documents/context remain out of scope. Await independent source/security and integration review.

<!-- END PHASE13_M1_3_IMPLEMENTATION_2026_10_24 -->

<!-- BEGIN PHASE13_M1_3_PLAN_2026_10_24 -->
## Current milestone — Phase 13 M1.3 Project Chat Integration planned (2026-10-24)

- **Verified remote checkpoint:** M1.2 implementation committed and pushed as `7dfcb6c720d1227cd5dd6a0bbd94d310399daa09`, confirmed directly against GitHub branch `phase13-study-journey-project-centric`; user reported a clean local worktree. Owner-run disposable PostgreSQL suites: M1.1 **10/10**, M1.2 **7/7**; these are not a claim that the previous complete unit suite is all green.
- **M1.3 design:** [PHASE13_M1_003_PROJECT_CHAT_INTEGRATION_CONTRACT.md](./tasks/PHASE13_M1_003_PROJECT_CHAT_INTEGRATION_CONTRACT.md) is the bounded implementation packet. Reuse M1.1 atomic Project Chat creation, integrate own-Chat Project create/list and history/detail/update, enforce Project+individual Chat authorization, and serialize Project permission check with the existing turn claim in a short transaction at Fast/Default/Premium ingress.
- **Read-only semantics:** closed Project and emergency feature disablement preserve only a still-authorized creator's own Project-origin history; revocation denies history, no Project turns/writes, no silent Standalone relabel. Standalone/legacy paths must not regress.
- **Scope/state:** M1.3 implementation **not started at this documentation checkpoint**; no new migration/database/deployment/professional rule is authorized. M1.4 Workspace UI and later Project evidence/workflow remain deferred. The M1.3 plan is ready for the user's next Codex implementation action; do not mistake this doc commit for implemented code.
- **Artifact location preference:** user-requested patches or MD exports outside the repo go under `~/`, never `/tmp/`; test software may use its own internal temporary storage.

<!-- END PHASE13_M1_3_PLAN_2026_10_24 -->

<!-- BEGIN PHASE13_M1_2_FINAL_REVIEW_R1_2026_10_24 -->
## Current milestone — M1.2 Final Review R1 correction (2026-10-24)

- Restored `lib/policy-intelligence/editorial-api.test.ts` to `chatbot/package.json` `test:unit`; retained the M1.2 HTTP tests and all other test entries.
- User-executed local PostgreSQL results, reported by the user and **not run by Codex**: M1.1 **10/10**, M1.2 **7/7**, total **17 passed, 0 failed, 0 skipped**. This supersedes the earlier sandbox-only DB blocker recorded below. Codex performed no database operation in this correction.
- Focused Codex checks passed: the editorial API, M1.1 unit and M1.2 HTTP test files; package membership assertion; package Biome; `git diff --check`. Full `pnpm test:unit` was not rerun in this correction; prior full-suite sandbox result remains 106 passed and 3 existing environment-sensitive failures.
- No schema, migration, architecture or unrelated source changes. M1.3 and M1.4 remain deferred. No commit or push.

<!-- END PHASE13_M1_2_FINAL_REVIEW_R1_2026_10_24 -->

<!-- BEGIN PHASE13_M1_2_IMPLEMENTATION_2026_10_24 -->
## Current milestone — Phase 13 M1.2 implemented; awaiting independent review (2026-10-24)

- M1.2 APIs and repository membership lifecycle are implemented on branch `phase13-study-journey-project-centric`, HEAD `8519a6af59988a0e690dea5b334a0344269ff025`; changes remain uncommitted. The accepted five pre-existing documentation modifications were preserved.
- Customer authorization checks authenticated regular session plus current database User role/guest identity. Owner authority remains `ownerUserId`; active Membership grants scoped Project access, pending Membership grants only its own invitation projection, revoked Membership grants none. No owner Membership or Chat transcript access was added.
- Invite/accept/revoke use operation → Project → Membership lock order and atomically commit operation, Membership transition, Project revision and event. Neutral invite outcomes are idempotent and create no Membership/revision/event. Revoked Membership cannot be reinvited. Routes fail closed unless the complete existing M1.1 schema is detected.
- Focused M1.1 utility tests **5/5** and M1.2 HTTP tests **10/10** passed. Full `pnpm test:unit`: **106 passed, 3 failed, 0 skipped** across 109 test-file subprocesses; failures are the existing sandbox subprocess stdout, migration CLI exit-code and localhost `EPERM` tests. All 8 relevant Conversation/turn-ledger regressions passed. `pnpm db:check`, changed-file Biome (16 files) and `git diff --check` passed. TypeScript remains at baseline **44** diagnostics in unchanged files.
- PostgreSQL validation is **BLOCKED**, not passed: guarded status reports `isolated_database_url_missing`; both M1.1 and M1.2 integration suites report **0 passed, 0 failed, 1 skipped** because the fixed test URL is unset. No DB connection or mutation occurred. Migration 0030 and schema metadata are unchanged; no new migration exists.
- M1.3 widget-turn integration and M1.4 Workspace UI remain out of scope and deferred. Do not activate customer-facing Project features until independent review and the guarded disposable PostgreSQL concurrency/rollback suite pass.

<!-- END PHASE13_M1_2_IMPLEMENTATION_2026_10_24 -->

<!-- BEGIN PHASE13_M1_2_CONTRACT_2026_10_24 -->
## Current milestone — Phase 13 M1.2 contract frozen (2026-10-24)

- Checkpoint is branch phase13-study-journey-project-centric, committed HEAD 8519a6af59988a0e690dea5b334a0344269ff025; worktree was clean at preflight. M1.1 is committed. The following M1.1 status block is preserved as an execution-time snapshot from HEAD 83286fdafe66615f4293f742cd82d0de0f70f940.
- M1.1 is complete, independently reviewed and committed at this checkpoint. The following M1.1 block is preserved as an execution-time snapshot from HEAD 83286fdafe66615f4293f742cd82d0de0f70f940.
- D-P13-006 records the three accepted M1.2 owner decisions. [PHASE13_M1_002_MEMBERSHIP_AUTHORIZATION_CONTRACT.md](./tasks/PHASE13_M1_002_MEMBERSHIP_AUTHORIZATION_CONTRACT.md) is OWNER ACCEPTED — M1.2 TECHNICAL CONTRACT FROZEN and READY FOR BOUNDED IMPLEMENTATION AUTHORIZATION.
- Invitation idempotency uses the existing ProjectOperation result union: a created invitation resolves to its same-Project Membership; a neutral result resolves to the Project and writes no Membership, revision or ProjectEvent. Repository validation distinguishes neutral results from integrity failures; no migration is proposed.
- M1.2 code has not started. Await independent review and separate bounded implementation authorization. M1.3/M1.4 remain deferred; professional/legal-admissions matrices remain PROVISIONAL.
- This task changed documentation only. No code, database, migration, tests, shared/live system or external service was used.

<!-- END PHASE13_M1_2_CONTRACT_2026_10_24 -->

<!-- BEGIN PHASE13_M1_1_IMPLEMENTATION_2026_10_24 -->
## Current milestone — Phase 13 M1.1 Project Foundation implemented (2026-10-24)

- M1.1 implemented on `phase13-study-journey-project-centric` at expected base `83286fdafe66615f4293f742cd82d0de0f70f940`; work remains uncommitted and unpushed.
- Five additive entities and minimal repository primitives are implemented. Project Chats are generated server-side and created atomically with existing Chat/turn foundations, current Project authorization, operation idempotency, revision and event persistence.
- Migration `0030_demonic_the_hood` is journal index 30 and was applied only to `immigration_ai_phase13_m1_1_test`. Final integration: 10 passed, 0 failed, 0 skipped; disposable database has 31 migrations and zero synthetic rows. Normal/shared/live databases were not modified.
- R1-01 reproduced the ordinary-runner `server-only` failure and extracted pure canonicalization/operation-ID/hash/replay utilities while keeping the repository server-only. No global condition change. Focused ordinary-runner regression: 6 files passed; R1-02 now asserts exact SQLSTATE/constraint pairs for all five ProjectEvent negative cases using a valid operation row.
- Final validation: disposable PostgreSQL integration 10/10; exact `pnpm test:unit` outside sandbox 888/888; `pnpm db:check` and `git diff --check` passed. Biome check passed the 6 changed TypeScript/schema/package files and `biome lint` passed all 8 TypeScript/JSON files; its formatter reports only Drizzle-generated snapshot/journal formatting differences, which were preserved. Sandbox-only full run had three unrelated `EPERM` subprocess/localhost failures; the same command passed outside the sandbox. TypeScript remains at 44 existing diagnostics, none in changed files. Migration 0030 and its manual CHECKs are unchanged.
- M1.2 membership workflows, M1.3 widget integration, M1.4 Workspace UI and all Project evidence/application/professional/payment work remain deferred pending their own gates. Legal/admissions matrices remain **PROVISIONAL**.

The prior M0 preparation entries below are preserved as history.
<!-- END PHASE13_M1_1_IMPLEMENTATION_2026_10_24 -->

<!-- BEGIN PHASE13_M0_004_REVIEW_2026_10_23 -->
## Phase 13 M0-004 independent architecture review delivered

- **Status:** REVIEW DELIVERED — AWAITING INDEPENDENT ARCHITECTURE AND OWNER ACCEPTANCE.
- **Report:** [PHASE13_M0_004_ARCHITECTURE_FREEZE_REVIEW.md](./tasks/PHASE13_M0_004_ARCHITECTURE_FREEZE_REVIEW.md).
- **Decision state:** Architecture remains unfrozen. M1 is NOT READY / NOT AUTHORIZED pending owner acceptance of F-01 dual Project/Chat authorization and membership lifecycle, and F-02 rollback access to durable Project Chat turns.
- M0-004 proposes freeze candidates for ownership, ProjectConversation, turn-ledger reuse, staged application subtypes, evidence/package versions, workflow governance, and feedback boundaries. The legal/admissions matrices and LF feedback remain provisional.
- Documentation only; no code, migration, DB, cloud, payment, external source fetch, test suite, or external submission. Await independent review and explicit M1 authorization.
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

- **M0-003-R2 DELIVERED — AWAITING INDEPENDENT REVIEW.** See [workflow and requirements governance design](./tasks/PHASE13_M0_003_WORKFLOW_POLICY_DESIGN.md). Owner acceptance and technical architecture freeze remain pending; no professional matrix is approved.
- Branch remains `phase13-study-journey-project-centric`, HEAD `355721919d049d16070dfc887105d3c2a943afaa`. The M0-003 contract was read at activation commit `a234e4ff4ad0124e2ed522579e6a26075f34f273`; existing uncommitted R1 work was preserved. No checkout, fetch, merge, rebase, reset or commit occurred.
- The independent review accepts all eight R1 corrections. R2 preserves them and resolves nonblocking Student 500 preparation with a parallel anchor status/gate; distinct Offer, acceptance, conditions, institution acknowledgement and CoE dimensions; separate service-fee vs client/third-party funds; separate versioned GS working-draft and official-question-answer outputs; and distinct document security, extraction, authenticity and professional-sufficiency records with bounded review suggestions. The OSHC nationality comment remains provisional pending official-source, temporal and human review.
- The latest annotated lawyer PDF was not found; the checked-in V0.1 has only URL-link annotations. R2 comments are therefore recorded as owner-supplied provisional feedback. The four matrices remain PROVISIONAL. Funds ownership/accounting/custody/licensing/account type and permitted combinations remain OWNER/FINANCE/COUNSEL/PRIVACY PENDING.
- Docs only; no code, schema, migration, database, cloud/payment or money-movement action, external submission, paid call, legal-source fetch or tests. M0-004/M1 have not started; architecture remains unfrozen. `git diff --check`, diagram-renderer limitation, changed files and exact Git state are in the handoff.
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



<!-- BEGIN AWS_STAGING_STAGE3_DEPLOYED_2026_10_14 -->
## LATEST: Phase 12 Stage 3 — AWS Staging rollout complete (2026-10-14)

**Milestone status:** **STAGE 3 CORE FUNCTIONALITY OWNER ACCEPTED; AWS STAGING DEPLOYMENT COMPLETED AND OWNER ACCEPTED.** Implementation branch `codex/phase12-stage3-policy-intelligence`; deployed code SHA `b760c028674efe4fd40190d8b212167729e74348`. See [full deployment record](./deployments/AWS_STAGING_PHASE12_STAGE3_2026-10-14.md) for immutable digests, verified AWS outputs, restore anchors, and subsequent operating boundaries.

- Secure RDS `chatbot` Drizzle ledger migrated `0023 → 0029`, confirmed `current`; encrypted pre-migration snapshot `immigration-ai-staging-secure-pre-stage3-20261014` available.
- Web ECS `immigration-ai-staging-web:44` **COMPLETED**, one running, ALB `healthy`; two Stage 3 images. `gpt-6-luna` configured for Default/Fast/checker family and `gpt-6.1-sol` for Premium family. Owner's Fast, Legal Check and Premium browser smoke was successful; Legal Service logs confirm HTTP 200.
- Policy Sync `immigration-ai-staging-policy-sync:11` registered with explicit `POLICY_INTELLIGENCE_MODEL=gpt-6.1-sol`; EventBridge Scheduler `immigration-ai-staging-policy-sync-daily` is **ENABLED**, targets `:11` at `cron(0 6 * * ? *)`. First actual scheduled run is **unobserved**, not a runtime PASS.
- **Owner decision:** Stop additional broad tests and end deployment now. Accept untested ancillary functionality by waiver, not fabricated test evidence. **Formal Gate 3 and prior Gate 1/2 deferred checks remain NOT ACCEPTED**, unless separately signed off in future; **production rollout was NOT performed**. No more work until an observed defect or new owner requirement.

Historical sections below reflect earlier development phases, not current AWS deployment status.
<!-- END AWS_STAGING_STAGE3_DEPLOYED_2026_10_14 -->


<!-- BEGIN PHASE12_STAGE3_OWNER_SIGNOFF_2026_10_14 -->
## LATEST: Stage 3 core functionality owner signed off — 2026-10-14

**Milestone status:** Phase 12 Stage 3 core functionality **OWNER ACCEPTED**; implementation and owner-host work are closed for now. Stop proactive Stage 3 development and repeated test campaigns. Outstanding defects are handled only when observed by lawyers/users.

**Accepted features:** Source-first/AI publication (D-072), structural banner exclusion/public visibility (D-073), source/durable compatibility and import (D-071), bilingual lawyer editorial workflow, Admin principal-lawyer permissions (D-070), lawyer grants, force-publish, official URL submission, direct Publish Official Source without AI revision, and human protection (D-065). Owner explicitly waived separate blank-create, Grant/Revoke, Force Publish, URL submission and direct source-publish acceptance runs; do not mark those as independently browser-tested.

**Owner-browser evidence:** LIN 26/061 compatibility import -> draft -> human published/editor-protected, Archive -> public count 4 to 3 -> Restore -> count 4, with obsolete compatibility entry suppressed when archived. The Admin strict-body archive hotfix was confirmed working.

**Coding-model validation:** latest report 877/877 unit tests and build PASS; pre-existing TypeScript baseline issues remain. A one-shot live Home Affairs policy sync published 8 full analyses and 2 source-first notices; no ongoing scheduler or proposed-policy feed acceptance is implied.

**Git/release boundary:** At closeout, Stage 3 work was still uncommitted on `codex/phase12-stage3-policy-intelligence` over `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419`. Commit/push and remote SHA verification are the only requested repository closure steps. **Formal Gate 3 remains NOT ACCEPTED**; staging/production, negative authorization, integration and prior Phase 12 deferred gates remain open. Owner functional sign-off is not a deployment authorization.
<!-- END PHASE12_STAGE3_OWNER_SIGNOFF_2026_10_14 -->


**Milestone:** Phase 12 — User Data Reliability, AI Workspace and Policy Intelligence  
**Status:** STAGE 2 CORE FUNCTIONALITY **OWNER SIGNED OFF** (2026-10-13) at `7031b37292410597c4411b8a9b60f10bdf35b823`; D-061 and D-062 committed/pushed, policy context and same-conversation PDF/DOCX answers passed in Fast, Legal Check and Premium. **Original Gate 2 NOT ACCEPTED** because deferred/unrun checks remain. Stage 1 Gate 1 remains open; Stage 3 implementation not yet authorized by this closeout.
**Updated:** 2026-10-13
## Phase 12 Stage 3 — Policy Intelligence Completion implemented on a dedicated branch (2026-10-13)

**Status:** IMPLEMENTED + R1 + R2 + R3 CORRECTED + D-070 authority correction in the working tree of `codex/phase12-stage3-policy-intelligence` (base `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419`); **not committed, not pushed**, awaiting independent re-review and owner-host functional acceptance. Owner authorized Stage 3 implementation with Stage 1 Gate 1 and the original Stage 2 Gate 2 still open (D-066); neither gate is marked passed, and Gate 3 acceptance has not been claimed.

**D-070 owner ruling (2026-10-13):** the Admin account is the firm's **principal lawyer**, so a verified Admin holds complete Policy Intelligence editorial authority inherently (no grant needed, revocation cannot remove it) while other staff keep needing a verified lawyer identity plus an active Policy Editor grant; ordinary users and unverified identities remain denied. The Admin Policy Intelligence page archives/restores through the audited route again. The owner also fixed the canonical local acceptance workflow: existing database `chatbot`, port 3000, existing accounts, local-test S3 bucket (`aulawyers-staging` / `ap-southeast-2`), no database cloning for browser testing; migrations 0027–0029 are additive-ready and are applied to `chatbot` once by the owner with the documented preflight flow.

**R3 security corrections (D-069, 2026-10-13):** (1) **P0** — `upsertPolicyEditorGrant({revoked})` could create an *active* grant when revoking a never-granted user (insert used `revokedAt: null` and revoke semantics only ran on conflict); replaced by two explicit intents — `activatePolicyEditorGrant` (insert/reactivate, reports `reactivated`) and update-only `revokePolicyEditorGrant` (controlled outcomes `not_granted` / `already_revoked` / `revoked`, concurrency-safe, audited with server-authoritative actor identity); (2) **P1** — operator submission *listing* now enforces the same substantive contract as submission (verified lawyer + currently active Policy Editor grant) inside the service, so the API route and the server-rendered page both refuse customers, unprivileged lawyers, unverified lawyers, revoked Policy Editors and admins without lawyer authority; (3) **P2** — draft history is described accurately everywhere as a bounded recovery window (≤ 25 saves / 2 MB per revision) rather than permanent complete history, with the retention design unchanged.

**R2 second-review corrections (D-068, 2026-10-13):** (1) concurrent manual publication — a draft records its published baseline (`baseRevisionId`) and `publishManualRevision` rejects a superseded baseline under the item row lock with 409 `stale_publication_conflict` (`detail: draft_baseline_superseded`), so an older draft can never silently replace a newer lawyer's publication; (2) lossless draft history — additive migration `0029` adds append-only `PolicyIntelligenceDraftSnapshot` storing the complete document of every human draft save with bounded retention (25 saves / 2 MB per revision, newest never pruned), retrievable through `GET /api/policy-editor/drafts/history` and loadable in the workspace, while the audit row keeps only a labelled change *summary* plus the snapshot link and published revisions stay immutable; (3) the Admin Policy Intelligence page is read-only monitoring plus grant management (Archive/Restore controls removed) and grant management requires a **verified** administrator identity; (4) a held AI analysis no longer rewrites the item status of a protected, already-published editor-approved revision (`resolveHeldRevisionItemStatus`), while unprotected items keep the original hold behaviour; (5) concurrent manual creation is conflict-free (`insertItemIfSlugAvailable` → `ON CONFLICT DO NOTHING`), returning a controlled alternative slug/replay/409 instead of an uncaught database error.

**R1 review corrections (D-067, 2026-10-13):** (1) durable per-item human-publication protection (`publicationMode`, migration `0028`) so automatic sync can no longer supersede a lawyer-published revision — eligible newer revisions are captured and held as pending review with reason `human_publication_protected`, with an explicit audited `releasePublicationProtection` exit and a "publish the newer revision" path; (2) publication authority is now verified-lawyer-plus-explicit-grant (administrator role alone manages grants and cannot publish; customer/unverified/forged/revoked grants cannot publish); (3) the workspace loads/saves all eight possible source references with citations and dates and never truncates or auto-translates — incomplete bilingual input is a visible error; (4) nullable author-stated `officialSourceDate`/`commencementDate`/`reviewedAsOfDate` are stored and displayed separately from platform-observed official snapshot dates; (5) server-derived editor identity is audited independently of the public byline and bylines impersonating an official authority are rejected; (6) real streamed body-size limits, the same-origin/`Sec-Fetch-Site` guard and a bounded legacy admin route; (7) reconstructible draft-change audit, create-retry dedupe, workspace pagination and an override editor that recovers when stored AI analysis is unreadable.

**Scope delivered:** published-revision stability while a newer source snapshot is held (with an honest `newerSourcePendingReview` signal); explicit revocable Policy Editor capability (server-enforced, administratively assignable); audited lawyer force publish for AI-held/rejected/verification-unavailable items with no AI re-run or gate PASS; fully manual bilingual lawyer authoring (draft/preview/publish/revision/archive/restore) with LLM-free operation, honest attribution and optional genuine official references; additive Stage 3 data model/migrations `0027` + `0028` (new `PolicyEditorGrant`, `PolicyIntelligenceEditorialEvent`, `PolicyIntelligenceOperatorSubmission` tables; revision `contentKind`/`humanContent` and nullable AI metadata; item `origin`/nullable official identity/publication protection); unified public feed/detail/history with explicit provenance labels; expanded controlled discovery (Home Affairs announcements/consultations, ministerial announcements, parliamentary bills, authorized official-URL submission); automatic-sync/human-work coexistence guarantees.

**Validation recorded (R2 final revision):** 833/833 `pnpm test:unit` passed (0 fail, 0 skipped; R1 821, Stage 3 baseline 784 — +6 service, +3 API, +3 core R2 tests); the extended Stage 3 PostgreSQL integration suite passed on the isolated disposable database (`immigration_ai_phase12_stage1_test`, migrations 0027 + 0028 + 0029 applied there only), including the R1 protection sequence and the new R2 phases: concurrent publication (V1 → drafts A/B → V2 → A rejected 409 → V2 current), lossless history (long bilingual body + amended citation + removed items recoverable, earlier digest unchanged by later saves), protected-item hold consistency (item stays `published`/protected while the newer source is held, with coherent archive/restore and workspace detail), and concurrent creation (controlled outcomes, identical replay resolves to one item, `slug_taken` primitive); Stage 2 integration regression passed; `tsc --noEmit` shows the same 45 pre-existing diagnostics as the base commit (no new); `pnpm build` exit 0; changed-file Biome clean apart from nine pre-existing diagnostics proven present on the base copies of three files; `git diff --check` clean. Playwright browser acceptance of the `/policy-editor` workspace, live official-source fetching for the new seed URLs and owner functional acceptance remain owner-host steps.



## Phase 12 Stage 3 — D-065 Lawyer Final Editorial Authority (2026-10-13; docs only)

**Approved design correction:** An expressly authorized Policy Editor lawyer has the final decision on legal-content relevance, editing and publication. The Stage 3 implementation must offer a real lawyer-initiated `forcePublish=true` for AI-held/rejected/verification-failed items without requiring AI re-evaluation, positive evidence sufficiency or an automatic publication-gate PASS. An independent manual draft/preview/publish path remains entirely AI-free, including for transparently attributed lawyer commentary without an official citation. Preserve clear attribution between lawyer commentary and authenticated official law; no invented citation, source, verified-law badge or commencement date. Backend retains **technical** authorization, tenant isolation, input/URL/HTML/CSRF safety, revision concurrency and immutable audit; it cannot turn the AI's legal judgment into a veto. Trusted automated publication continues unchanged and has no compulsory lawyer gate.

**Precedence and work status:** D-065 supersedes the earlier conflicting Stage 3 prohibition on `forcePublish=true`; see `DECISIONS.md` and `tasks/PHASE12_USER_DATA_WORKSPACE_POLICY_2026-10-11.md`. **Stage 3 remains NOT STARTED / NOT AUTHORIZED to implement.** Stage 2 core scope stays OWNER SIGNED OFF, original Gate 2 remains NOT ACCEPTED, and Stage 1 Gate 1 remains open. This record makes no application-code, DB, S3, AWS, payment, migration, branch-merge or deployment change.

## Phase 12 — local-test S3 Bucket retained (D-064, 2026-10-13)

**Owner choice:** Keep `immigration-ai-localtest-documents-747452892291-ap-southeast-2` rather than delete after Stage 2; use only for synthetic local development/regression tests. Account `747452892291`, region `ap-southeast-2`, profile `aulawyers-staging`; process-only Next.js configuration: `AWS_PROFILE=aulawyers-staging`, `AWS_REGION=ap-southeast-2`, `MATTER_DOCUMENTS_S3_BUCKET=immigration-ai-localtest-documents-747452892291-ap-southeast-2`. Default SSE-S3 AES256, four Block Public Access flags enabled, S3 preflight `{"ok":true,"failures":[]}`. No keys stored. Current file size observed ~34.2 KB in two synthetic test files; S3 storage cost expected negligible, requests/transfer/optional services still billable. AWS actual charges not yet audited. Original Stage 2 Gate 2 remains NOT ACCEPTED due to deferred checks; bucket retention does not change this. Reuse commands, safety rules, and read-only usage audit are recorded in CURRENT_HANDOFF.md. Retention supersedes D-063's proposed cleanup/deletion only; do not delete bucket or DB rows without new authorization.

## Phase 12 Stage 2 — owner functional completion and deferred gate evidence (2026-10-13)

- **Checkpoint:** `codex/phase12-stage2-context-ui` @ `7031b37292410597c4411b8a9b60f10bdf35b823`; clean local tree / matching remote SHA reported by owner. Both D-061 and D-062 are committed and the owner's D-062 browser retest passed.
- **PDF/DOCX:** Owner browser screenshots in ordinary, non-policy conversation `0a8c3d1d-887d-4246-8f76-28ea613ecc55` show `test_pdf.pdf` → `BLUE-314`, 14 March 2026 (intended arrival); `test_docx.docx` → `GREEN-729`, 30 November 2026 (insurance expiry). Fast, Legal Check (active AgentRuntime), and Premium all returned the expected values from both saved files, identified customer-file provenance rather than official law, and reused the same conversation without reupload.
- **Policy:** LIN 26/061 linked-conversation launch, refresh/history restore and DB binding check passed; Fast, Legal Check (after D-061 restart) and Premium each correctly retained policy topic.
- **Local S3:** The temporary independent S3 test Bucket `immigration-ai-localtest-documents-747452892291-ap-southeast-2` (ap-southeast-2, AES256, Public Access Block enabled) passed read-only `s3:preflight` with `{"ok":true,"failures":[]}`. Its test objects are still needed until closeout; cleanup and removal of this test Bucket are the **second pending owner-supervised task**, with a prior check for local database file records/download impacts. No bucket deletion or database cleanup is part of this docs commit.
- **Boundary:** The screenshots establish user-visible end-to-end answer behaviour, not a separate database evidence-unit audit, original-byte download, source-link click check, malicious-file testing, alternative legacy Legal Check runtime, cross-device durability, or AWS staging/production acceptance. Cross-device checks were explicitly DEFERRED BY OWNER; other outstanding original Gate 2 checks (including staging/production S3, negative authorization, original-byte download and remaining environment/UI cases) are NOT RUN/NOT ACCEPTED. Stage 1 formal Gate 1 remains open. The original all-items Gate 2 was not satisfied; no unrun check is marked PASS.
- **Decision:** Stop Stage 2 feature work; record functional owner sign-off, while leaving the original Gate 2 as **NOT ACCEPTED (deferred/unverified)**. Do not claim AWS staging or production deployment and do not start Stage 3 merely from this record.

## Phase 12 Stage 2 Gate 2 hotfix — null `policySlug` (committed 7031b37, owner-host PASS)

Owner-host failure: ordinary conversation `0a8c3d1d-887d-4246-8f76-28ea613ecc55` with `test_pdf.pdf` and `test_docx.docx` uploaded; a Fast question failed before model execution with `ZodError path: ["policySlug"] expected: "string" received: "null"`. Cause: the workspace sent an explicit JSON `null` when no persisted binding existed, and the three widget routes accepted only optional strings.

Fix (D-062): the workspace now omits `policySlug` when there is no binding for this conversation, and all three routes share one schema module (`lib/conversations/widget-turn-schemas.ts` + `lib/policy-intelligence/request-policy-slug.ts`) where absent and explicit `null` both mean "no client policy hint" while non-null values keep the strict slug pattern. The persisted binding remains the only authority. Evidence: new contract suite **8/8**, full unit suite **754/754**, related suites **40/40**, `tsc` 45 = baseline (zero new), `pnpm build` exit 0, changed-file Biome and `git diff --check` clean; the change set passed independent source review. Owner browser verification later **PASSED** for Fast, Legal Check and Premium reading the same PDF/DOCX files, as detailed in the 2026-10-13 status above. This check was against the independent S3 **local-test** bucket, not staging/production. **Original Gate 2 still NOT ACCEPTED**, cross-device **DEFERRED BY OWNER** and other required checks unverified.

## Phase 12 Stage 2 Gate 2 blocker fixed — Legal Check keeps the persisted policy topic (2026-10-12, uncommitted)

Owner-host failure: after a Fast → Legal Check switch inside a policy-linked conversation (`29d5607b-…`, LIN 26/061), Legal Check asked the customer to re-supply the policy name/identifier/URL. **Owner-host re-test PASSED** after restarting legal-service (Legal Check identified the policy), and **Premium policy-context testing PASSED in the same conversation**; D-061 is committed and pushed as `b604187`, only D-062 is uncommitted. Root cause: the Next.js route already sends the `policy_topic_reference` entry in `frontend_messages` for every mode and Fast/Premium already render it, but the active Legal Check path (`DefaultAgentServingService` → `AgentRuntimeService`) had no field for it and dropped it at the adapter.

Fix: a bounded, typed `AgentRuntimeRequest.policy_topic_context` (schema max 4 000; extraction takes only the first flagged `system` entry, whitespace-normalized, capped at 1 200 chars — the same bound Fast/Premium use), extracted in `DefaultAgentServingService` from the existing `policy_topic_reference` contract and rendered by `AgentRuntimeService._build_user_message` as a fenced **"conversation context only — NOT legal authority, NOT verified law"** section that resolves "this policy"/"这项政策", forbids following embedded instructions, and still requires independent verification of current law and official source status. Archived/superseded/withdrawn note lines within the 1 200-character extraction cap are forwarded as conversation context; because the channel is bounded, a longer rendered binding — for example extra archival or superseded notes beyond the cap — is truncated at the tail, so the topic is never claimed as current and no database, migration, Fast/Premium/checker/evidence behaviour is touched.

Evidence: new `tests/test_phase12_stage2_gate2_policy_topic_context.py` **16/16**; with the pre-fix adapter restored the same file fails **3/16** (A, E, G), proving it detects the defect; focused + related suites **42/42**; full backend suite **1302/1302**. The fix passed independent source review. The owner-host Legal Check re-test and three-mode PDF/DOCX checks are now PASSED; **original Gate 2 remains NOT ACCEPTED** because cross-device and other original checks are deferred/unverified (see 2026-10-13 closeout).

## Phase 12 Stage 2 final review corrections A + B implemented (2026-10-12, uncommitted)

The independent review of the committed Stage 2 (`54ec8e3`) found two consent-workflow defects; both are corrected. **A:** submission is now possible only after the eligible-document list has loaded successfully — a failed, pending or malformed load blocks the submit control, shows a localized error plus a labelled retry (重新加载附件 / Retry loading attachments), and can never be read as consent to share zero documents; an explicitly confirmed empty selection is still submitted as `{ consent: true, selectedDocumentIds: [] }`. **B:** a server-reported existing request is a dedicated client state that refuses new submissions, shows the persisted shared-document count (`selectedDocumentCount`; missing/legacy ⇒ "未记录 / not recorded", never the checkbox state) and links to `/lawyer-requests/<id>`; the API returns that id and the persisted `documentSharing` (additive), and the POST duplicate path adds `existingRequest: true`, so idempotency and the four-document limit/ownership checks are unchanged.

Evidence: chatbot unit **746/746**, focused TS **40/40**, `tsc --noEmit` **45 = baseline (zero new)**, `pnpm build` exit 0, changed-file Biome and `git diff --check` clean. Gate 2 is still **NOT accepted**; no commit, push, merge, deploy or migration.

## Phase 12 Stage 2 closure — explicit lawyer attachment consent implemented (2026-10-12, uncommitted)

Owner-selected **Option A (D-060)**: a lawyer-review request now requires explicit per-document customer consent. The customer sees the eligible documents of the selected answer (filename, status, whether the AI answer acknowledged using it), every checkbox starts unchecked, only checked documents and their permitted excerpts are shared, the count and any withheld AI-acknowledged documents are shown before submission, submitting without attachments stays valid, and both Chinese and English are supported. The API accepts an explicit `attachments { consent: true, selectedDocumentIds }` decision validated against the server-persisted manifest of that answered turn plus the owner's own rows; forged/cross-conversation/stale/deleted/duplicate/over-limit selections are explicit errors (never silent truncation); the four-document cap, 12 000-character excerpt budget and exact hash-verified reconstruction are unchanged; the decision is persisted as a bounded filename-free record; repeat submissions return the stored request unchanged.

Evidence: chatbot unit **732/732**, `tsc --noEmit` **45 = base**, `pnpm build` **exit 0**, changed-file Biome clean, `git diff --check` clean, legal-service **1286/1286** re-run as a regression check (no legal-service change). Gate 2 is still NOT claimed as passed; no commit, push, merge, deploy or migration.

## Phase 12 Stage 2 R2 — final focused corrections implemented (2026-10-12, uncommitted)

The second review accepted R1-2/R1-3 at the static design level and required two bounded corrections. **R2-A**: the serving response returns the bounded, request-authorized acknowledged document ids; the widget routes subset their own manifest by them, so one acknowledged document no longer claims the whole packaged packet and forged or cross-conversation ids are dropped; lawyer requests keep the two categories distinct — authorized attachments of the conversation (marked `used_by_answer: false`) versus documents the answer acknowledged using. **R2-B**: customer filenames can no longer reach review traces or the experience archive; those copies keep numeric counts, availability/packaging states and the count of withheld filenames only, while the authenticated app still shows customers their own filenames.

Evidence: chatbot unit **715/715**, legal-service **1286/1286**, focused R2 suites **26 Python + 15 TS + 29 TS regression**, `tsc --noEmit` **45 = base 45**, `pnpm build` exit 0, changed-file Biome clean, `git diff --check` clean. Gate 2 is still NOT claimed as passed; no commit, push, merge, deploy or migration.

## Phase 12 Stage 2 R1 — independent review corrections implemented (2026-10-12, uncommitted)

The independent reviewer returned REWORK with three findings, all corrected in the same uncommitted working tree: **R1-1** document use is now verified by an explicit acknowledgement matched against the request's authorized manifest (tri-state `customer_document_usage`; single-shot modes report `supplied_unconfirmed`, never asserted use); **R1-2** the model-side policy topic is rebuilt from the persisted binding snapshot so it survives unpublication/supersession, with the current revision kept separate and the snapshot never treated as current law; **R1-3** document availability counts are bounded at 100 000 instead of 64, and the summary now distinguishes all usable files from the packaged subset while stating partial packaging and mixed readable/unreadable status honestly.

Evidence: chatbot unit **699/699**, documents integration **1/1** on the isolated disposable DB (it caught a real summary defect with `8 !== 66` before the fix), policy-binding integration **1/1**, committed Playwright workspace checks **20/20 across 4 viewports**, legal-service **1273/1273**, `tsc --noEmit` **45 = base 45**, changed-file Biome clean, `git diff --check` clean. Gate 2 is still NOT claimed as passed; no commit, push, merge, deploy or migration.

## Phase 12 Stage 2 — implemented on a dedicated branch (2026-10-12, uncommitted)

**Implementation branch:** `codex/phase12-stage2-context-ui`, HEAD `ce4e803bcbdd29535d0da0924de55600a87a9827` (the Stage 2 work itself is **uncommitted**). Parent/expected start commit: `3541a3dfc72efc9fc9f4fe5d824c052f09d3a4cd`. No merge, deploy or live migration.

**Scope delivered:** server-persisted policy-to-conversation binding (new additive table + migration source `0026`, resolved server-side, idempotent launch, explicit recoverable failure, snapshot-is-not-law card); one typed authenticated context resolver shared by Fast / Legal Check (AgentRuntime + legacy) / Premium; real customer-document evidence delivered to the Default AgentRuntime for the first time, plus a bounded non-evidentiary availability summary that stops an answer from implying it read a file with no usable extraction; compact workspace UI (one-row mode toolbar, chat-first layout, tabbed panels below 1280px, bounded auto-growing composer with the upload control beside it, right-hand panel owning conversation files + account files + case facts with automatic refresh); guest accounts told files need an account instead of receiving an unlocalized API error.

**Evidence:** chatbot unit suite **673/673 pass, 0 fail, 0 skip**; Stage 2 PostgreSQL integration test **pass** on the isolated disposable database (owner-scoped bindings, idempotent launch, cross-user isolation, snapshot stability, cascade delete, unresolvable slug creates nothing, resolver scoping); legal-service suite **1247 pass, 0 fail**; `tsc --noEmit` **45 errors — identical to base `ce4e803`'s 45**; `pnpm build` **passes**; `git diff --check` clean; changed-file Biome clean; out-of-repo Playwright browser checks **26/26** at 1920×1080 / 1366×768 / 768×1024 / 390×844 plus the pre-migration policy launch state; `pnpm run s3:preflight` fixed and covered by a regression test.

**Migration status:** `0026_phase12_stage2_conversation_policy_binding.sql` exists as a source artifact and is **unapplied** everywhere except the isolated disposable test database. Verified: the `chatbot` database has no `ConversationPolicyBinding` relation.

**Not verified (owner-host):** refresh/history/second-device durable card with `0026` applied, AWS-case policy launch, real staging S3, original-byte download, DOCX end-to-end, cross-device continuity, and any live model answer quality. No paid model call was made.

**Gate rule (unchanged):** Stage 2 is not accepted until independent review and owner acceptance are recorded. Gate 2 is NOT claimed as passed. Do not merge/apply migrations without explicit owner authorization.

## Phase 12 Stage 1 — implemented on a dedicated branch (2026-10-11)

**Implementation branch:** `codex/phase12-stage1-user-data-reliability`, created from the Phase 12 planning branch at `3fa358dad5d75f6bf9ed8a5332b6a94e72e6e323`. Not merged, not deployed, no live migration applied.

**Scope delivered:** one shared owner-authorized durable turn contract for Fast, Legal Check and Premium; cursor-paginated complete conversation and message history with stale-response protection; owner-level account file index with per-conversation AI evidence scoping retained; DOCX browser-MIME fix with real container identity; optional `projectId`/context-scope interfaces reserved only.

**Evidence (initial submission):** 581/581 unit tests pass; the PostgreSQL integration test passes against the isolated disposable database `immigration_ai_phase12_stage1_test`; changed-file Biome clean; `next build` compiles but the project TypeScript gate fails on a pre-existing VIP-billing type error (`lib/db/queries.ts:1947`) that predates Stage 1.

## R1 external review corrections (2026-10-11, same branch; Gate 1 NOT accepted)

Independent review rejected the first submission and raised four Stage-1 defects plus one inherited build blocker. Corrections, all on the same branch:

1. **Single execution per client turn.** `ConversationTurn` carries a durable execution lease (`executionOwnerId` fencing token, `executionLeaseExpiresAt`, `executionStartedAt`, `executionAttempt`). One atomic compare-and-set claims it; every other concurrent duplicate gets `409 client_turn_in_progress` and never runs the model or writes a second assistant message. Long model stages renew the lease through a fenced heartbeat; expired leases are recoverable; every terminal write is fenced so an obsolete attempt cannot overwrite a newer result.
2. **Fail-closed user-message persistence.** A failed user-message write, ledger link or ownership/link read now returns `persistence_failed` (HTTP 503, retryable) instead of proceeding. `saved` is reported only when both messages are durable and linked (`linkVerified`), so a half-durable turn is never presented as saved.
3. **Strict message identity.** A duplicate id counts as an idempotent retry only for the same immutable message (id, chat, role, canonical parts fingerprint, empty attachments); anything else fails deterministically and existing rows are never modified or treated as durable.
4. **Legacy history.** Chats with messages but no `ImmigrationConversation` row are listed as `origin: "legacy_chat"` and are readable, with no backfill (audit: 20 messages in 4 chats, all registered accounts; integration test proves the conversation-row count and message ids/timestamps are unchanged by reads).

**Evidence (R1):** unit suite **606/606 passed, 0 failed, 0 skipped**; PostgreSQL integration test **passed** on the isolated disposable database (concurrent duplicates → exactly one execute decision and exactly one user + one assistant message; stale-lease takeover; obsolete-attempt rejection; 121-conversation pagination including the legacy chat on a non-UTC host); `tsc --noEmit` shows the **same 47-error pre-existing set as the base commit**; changed-file Biome clean; `next build` compiles and still fails the project-wide TypeScript gate on the pre-existing retained-VIP typing error (smallest proposed typing-only fix reported, **not applied** — it touches paused payment code).

The owner cross-device procedure is pending: `docs/agent-memory/tasks/PHASE12_STAGE1_OWNER_ACCEPTANCE.md`.

## R3 final closure (2026-10-11, same branch)

The owner authorized two bounded corrections to close Stage 1: (A) the typing-only retained-VIP correction that unblocked the production build, and (B) the legacy/archived conversation read-only user experience. R2's atomic persistence and lease fencing were not reopened.

- **A.** `getRetainedPrepaidVipEntitlement()` now declares `RetainedPrepaidVipEntitlement` (`membershipTier: VipMembershipTier`, `vipExpiresAt: Date | null`) instead of the widened `Pick<EntitlementUser, ...>`. Behaviour is unchanged; the two pre-existing errors it caused are gone and **`pnpm build` now succeeds (exit 0)**.
- **B.** The workspace now consumes the server's `origin: "legacy_chat"`, keeps the applied origin in state (restored from the detail response after reload), and derives every capability from one shared contract. Archived chats show a read-only banner in Chinese and English, keep full history browsing and pagination, replace the composer with an explicit "start a new conversation" action, and refuse submissions, guided intake, uploads, lawyer requests and consultation booking. The server is still the authority: the answer route continues to reject chats without an immigration conversation row, and read paths never create or repair one.

**R3 evidence:** unit suite **634/634 passed, 0 failed, 0 skipped** (new real-logic origin/capability tests, component render tests of the archived surface in both locales, copy tests, HTTP-contract `origin` tests, focused VIP type test); PostgreSQL integration test **passed** (no `ImmigrationConversation` row created by archived-chat reads, history and timestamps intact, widget gate still rejects, cross-account access still refused); `tsc --noEmit` **45 errors = base set minus the two fixed, no new errors**; changed-file Biome clean; `git diff --check` clean; `pnpm build` **exit 0**.

Stage 1 remains **NOT ACCEPTED** until independent review and the owner cross-device evidence (including the new read-only steps) are recorded. Stage 2 must not start before that.
## R2 external review corrections (2026-10-11, same branch)

A second review found one remaining concurrency defect: the assistant message insert was not inside the same concurrency boundary as the fence check, so an attempt that lost its lease between the payload write and the message insert could still create the deterministic assistant message row and block the new lease owner's legitimate answer.

Corrections: assistant persistence is now a single transaction (`finalizeConversationTurnAtomic`, `SELECT … FOR UPDATE`) that verifies the whole fence inside that boundary and commits the assistant message, the terminal turn transition and the payload clearing together; the fence is the pair `(executionOwnerId, executionAttempt)` so a superseded attempt can never write, renew, fail or regain authority; the old non-atomic terminal write was removed; partial states are preserved (identical message reused untouched, conflicting id writes nothing, failed transaction rolls back completely and releases the lease so a retry resumes without another model call). Detailed record and the deterministically reproduced race are in `CURRENT_HANDOFF.md`; the durable decision is D-014.

**R2 evidence:** unit suite **614/614 passed, 0 failed, 0 skipped**; PostgreSQL integration test **passed** (deterministic A/B lease takeover race, database error between payload and terminal persistence, duplicate completion, assistant-id collision, existing-turn replay, plus all Stage 1/R1 regressions); `tsc --noEmit` error set **identical to the base commit**; changed-file Biome clean; `next build` compiles and still fails only on the pre-existing retained-VIP typing error (not modified).

**Gate rule (unchanged):** Stage 1 is not accepted until independent review and the owner cross-device evidence are recorded. Do not start Stage 2 before Stage 1 acceptance, and do not merge/apply migrations without explicit owner authorization.

## Phase 12 — Three-stage approved plan; implementation NOT STARTED (2026-10-11)

**Planning branch:** `phase12-user-data-reliability-policy-intelligence` created from canonical `phase11-chinese-service-platform-ui-rebase@0ed11150015773573cd7e1d0396134e696bf7357`. **Authority:** owner approved a compact three-stage plan and authorized this **documentation-only branch and commit**. This is NOT authorization to implement Stage 1, run migrations, alter existing customer data, deploy, or merge. Owner first syncs branch locally; only then will request the Stage 1 coding-model prompt.

**Detailed authoritative plan:** `docs/agent-memory/tasks/PHASE12_USER_DATA_WORKSPACE_POLICY_2026-10-11.md`.

**Stage 3 scope addition (owner-approved 2026-10-11):** An explicitly authorized lawyer must be able to author an original policy manually in a staff form and save draft, preview, edit, publish, archive/restore without AI model calls, automatic discovery, analysis, verification or AI publication gate. Human-authored records are first-class public policy entries alongside automated entries, with independent durable revisions, source/status/date fields, bilingual editor-provided text, safe deterministic validation, and role/audit controls. See detailed Phase 12 task plan; **no fourth Stage**. Planning/docs only; Stage 1 is still NOT STARTED.

- **Stage 1 — User Data Reliability:** user-owned durable conversation/message/history, idempotency, complete pagination, cross-device history/file retrieval, real DOCX MIME/content fix, optional Project scope interfaces only. **NOT STARTED**.
- **Stage 2 — AI Workspace Integration:** one authorized scope resolver shared by Fast/Legal Check/Premium, actual document evidence in all backend serving paths, persisted policy-to-conversation binding, compact composer and right-side files. **NOT STARTED**.
- **Stage 3 — Policy Intelligence Completion:** fuller official proposed/consultation discovery, permissioned lawyer editorial override **and a separate fully human-authored policy creation/draft/preview/publish path with zero AI dependency**, provenance/audit, clear legal-vs-publication status, currentness/revision continuity, integrated staging gate. **NOT STARTED**.

**Hard gate rule:** each Stage is one integrated coding-model task, with its own full code/tests/DB-owner-host/browser/cross-device evidence, independent review and owner acceptance. A failed/skipped/blocked required check is never PASS. No Stage 2 before Stage 1 PASS; no Stage 3 before Stage 2 PASS. Real database/staging/production changes always require separate explicit owner authorization. No additional milestone fragmentation.

**Durable invariant:** same account on Ubuntu/Windows/Android can access all retained authorized historic messages, attached metadata and original files; full history is NOT the same as cross-chat AI context sharing. Project support remains only optional typed interfaces (`projectId: null`) and no feature. Stripe China activation stays PAUSED (see prior record). Older Phase 11 and Stripe records below are historical, not active instructions for Phase 12.

## Historical Phase 11 objective and background

**Previous milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase. Its source/history below are retained for traceability.

## Objective

Transform the existing production frontend into a Chinese-first immigration/study service platform inspired by the approved temporary V4 product direction, while preserving the main repository's authentication, conversation, legal-answer, VIP, billing, lawyer, safety, evidence and deployment behavior.

## Baseline

- source baseline: `phase10.2-stream-termination-observability@3b3653202f9b067fbed4adfd410edc02cb7215cc`
- implementation branch: `phase11-chinese-service-platform-ui-rebase`
- design reference: `immigration_temporal_ui/codex/fidelity-completion-v4@8abbba2d6b94e7fb31048447b9831aaac6a6b029`
- P11-001 verified checkpoint: `4bc039c60f72e61e2e3b6a7cc26a88a862d5c1e3`
- P11-002A verified checkpoint: `d0964924be003fd61902fca760bd71aca53abe4f`
- P11-002B verified checkpoint: `9454a5e4b5a5c5515967ad977faa2355ba053fc5`
- P11-003A implementation checkpoint: `f7fa6363e4f2ee326306b20203692dd73e45cebd`
- P11-003A provenance-hardening checkpoint: `4f232fe40161a7adad104bcbf6c382b846425936`
- P11-003B verified checkpoint: `081ef46dd040b6131d475750d0968c9f2e461bb2`
- P11-003C accepted checkpoint: `fa02295675dc4343430ae0a109722141e669bbf9`
- Phase 11 authority: `docs/architecture/SERVICE_PLATFORM_UI_REBASE_V1.md`
- public-content authority: `docs/product/CONTENT_POLICY.md`

## Work breakdown

| Stage | Scope | Status |
|---|---|---|
| P11-00 | Shared project-state bootstrap + Phase 11 architecture/decision freeze | VERIFIED |
| P11-001 | Chinese-first locale foundation + shared public shell | VERIFIED |
| P11-002A | Public content model + bilingual Home/Services/Process/Contact structural rebase | VERIFIED |
| P11-002B | V4-informed public-page visual refinement + responsive polish | VERIFIED |
| P11-003A | Policy Intelligence UI + provenance-safe manual content model | VERIFIED |
| P11-003B | Repository-backed manual curation + server-only publication boundary | VERIFIED |
| P11-003C | Allowlisted official-source discovery into non-public candidates | VERIFIED |
| P11-003C-R1 | Full-operation timeout + mapped-IPv6/private-network hardening | VERIFIED |
| P11-003C-R2 | Home Affairs structured alert discovery + bounded fetch calibration | VERIFIED |
| P11-003C-R3 | Relative Home Affairs alert URL resolution + provenance-kind correction | VERIFIED |
| P11-004 | AI Workspace presentation rebase preserving current behavior | VERIFIED |
| P11-005 | Secure Matter Documents & AI File Intake | IMPLEMENTATION COMPLETE — STAGES 1–3 ACCEPTED; PRODUCTION-READINESS DEFERRED TO P11-009; NOT VERIFIED |
| P11-006 | Matter-centered Client Portal | VERIFIED |
| P11-007 | Lawyer Workspace continuity | VERIFIED — SOURCE + ASSIGNED-REQUEST DESKTOP/MOBILE ZH-CN/EN ACCEPTED |
| P11-008 | Real appointment/consultation workflow | VERIFIED — P11-008 Final UI Acceptance: PASS; Stages 1–3 source accepted; Gates A+B, C, D, and E-Core PASS / ACCEPTED |
| P11-009 | Live Policy Intelligence + production hardening + bilingual/responsive/accessibility/E2E + AWS/staging acceptance, including deferred P11-005 production-readiness gates | ACTIVE — PRODUCTION ROLLOUT COMPLETE; EMERGENCY POLICY INTELLIGENCE UI FIDELITY HOTFIX ACTIVE |


## P11-009 Stage 1 accepted / Stage 2 activated — 2026-09-30

Stage 1 is **ACCEPTED** at remote checkpoint `0dae9e7ea46712c18357e3a9c009157c8cf0c8a1` after R1/R2/R3 external source review plus the separately authorized disposable PostgreSQL runtime gate. The runtime gate migrated only `chatbot_p11_009_stage1_gate_20260930_71c3ad` through 0023 and passed all 12 real-repository/read-service transaction/concurrency/currentness cases. The normal `chatbot` database and retained P11-008 disposable database remained unchanged.

Stage 2 is now the active implementation unit. It activates the accepted backend in the existing Home and Policy Intelligence product surfaces, adds public-safe structured analysis/history/diff/importance behavior, and adds slug-only Policy Intelligence -> AI Workspace continuity. It must remain rollout-compatible while 0023 is absent from the normal database, must not apply migrations, and must preserve `Official Source != AI Analysis != Lawyer Commentary`.

Stage 3 whole-platform production hardening and Stage 4 AWS staging/scheduler rollout remain not started. D-040/P11-005 production-readiness gates remain mandatory for those later stages.

## P11-004 closure / next task state

P11-003C remains closed as VERIFIED at `fa02295675dc4343430ae0a109722141e669bbf9`.

P11-004 is **VERIFIED** at implementation commit `f2d941734d256c9e0a0e42988cd67cdb828d0dc6`. Both internal stages are complete and owner accepted; see `docs/agent-memory/tasks/P11-004.md` and `docs/agent-memory/CURRENT_HANDOFF.md`.

P11-004 remains **VERIFIED**. The roadmap has now been rebaselined so P11-005 is **Secure Matter Documents & AI File Intake**. P11-005 is **IN PROGRESS**. Stage 1 is accepted at `df5335356ac7c7fc908236a270e78f280e5387e6`; Stage 2 at `38e19c75bc131cc372c8c2682ec21e72834f8fb7`; Stage 3 matter/AI/lawyer integration is accepted after direct GitHub review at `b29816c56255762998d8fa55b56df64436a0b3c3`. P11-005 is not yet VERIFIED because production-readiness gates remain open. The former Client Portal milestone moves to P11-006; Lawyer Workspace to P11-007; Appointment / Consultation to P11-008; final bilingual/responsive/accessibility/E2E + staging acceptance to P11-009.

## Policy Intelligence RR-02 — FULLY ACCEPTED; STAGING REVALIDATION PASS — 2026-10-06

RR-01 was accepted at `199ad837bc417682b2257c3a95462fe8a1514bdf`,
fast-forwarded into `phase11-chinese-service-platform-ui-rebase`, pushed and
remotely verified, and deployed to staging. The staging web rollout completed
with `/ping` HTTP 200; policy-sync task definition `:7` was deployed and
selected by the scheduler; and a manual sync completed. Its staging evidence
informed RR-02 diagnosis.

RR-02 status: **SOURCE REVIEW ACCEPTED; OWNER FULL LOCAL VALIDATION PASS;
STAGING REVALIDATION PASS.** Accepted canonical commit
`9461efbe14b22936e6a7311eaadbff413d02070f`
(`fix: align policy guidance publication contract`) is on
`phase11-chinese-service-platform-ui-rebase`. Local validation passed with
focused tests 106/106, full unit suite 522/522 (zero failures or skips),
production build PASS with the route manifest generated, and
`git diff --check` PASS. Staging revalidation passed on web task `:42` and
policy-sync task `:10`; full immutable image and scheduler evidence is in the
RR-02 task record. The scheduler remains enabled with its existing cron and
timezone; only its target task revision changed. RR-02 code is accepted and
deployed. The analysis schema remains v2, analyzer/verifier remain v2.2, the
strict publication gate is unchanged, and no database migration was added.
Federal Register RR-01 discovery/ranking remains unchanged; the protected WIP
remains untouched. See
`docs/agent-memory/tasks/PI-RR-02-GUIDANCE-CONTRACT.md`.

## Evidence that triggered R2

A live operator smoke against:

`https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500`

showed:

- HTTP 200 and normal Home Affairs content;
- compressed transfer around 239 KB;
- decoded HTML around 1.43 MB;
- original 128 KB decoded-body cap correctly rejected the response;
- normal same-host anchors provide poor discovery precision;
- the page embeds `siteData` JSON containing structured `alertItems`.

Therefore R2 must not simply enlarge the cap and continue generic link crawling.

## R2 direction

For the configured Home Affairs source:

```text
known allowlisted Home Affairs seed
    ->
bounded decoded-body fetch
    ->
extract <script id="siteData" type="application/json">
    ->
parse bounded siteData.alertItems
    ->
non-public discovery candidates
    ->
human review only
```

The Home Affairs strategy should use no generic link fan-out for policy discovery.

The structured alert record is still raw discovery evidence. In particular, `updateDate` is not automatically a legal effective/commencement date.

## Non-goals

R2 must not:

- publish anything;
- write `MANUAL_POLICY_ENTRIES`;
- add an LLM;
- infer legal status/effect;
- modify legal-service;
- add DB/scheduler infrastructure;
- broaden to arbitrary websites;
- redesign the public Policy Intelligence UI.


## P11-003C closure

The R1+R2 provenance defect identified after `009e7f964f86bd6b755d4fe5ded82c922ea48f09` was corrected by R3 at `fa02295675dc4343430ae0a109722141e669bbf9`.

Accepted behavior now includes:

- root-relative, same-host absolute, and HTTPS protocol-relative Home Affairs alert URL resolution against the fetched page;
- reapplication of HTTPS/exact-host/canonicalisation checks after resolution;
- no alert URL fetching;
- explicit URL provenance kinds: `alert`, `seed`, `fetched_page`;
- continued non-public candidate-only output and manual publication gate.

Local validation recorded at R3: 184 unit tests passed, production build passed, changed-file Biome passed, and `git diff --check` passed. Repository-wide lint retains the known 22 baseline diagnostics. The bounded live Home Affairs dry-run completed successfully with five structured candidates.

Known non-blocking observation: the feed includes operational/navigation records as well as policy-like records. No legal-importance inference is performed.


## P11-004 plan

P11-004 has two internal stages only.

### Stage 1 — bilingual structural/presentation rebase

Rebase the existing production AI Workspace into a dedicated operational shell while preserving behavior.

Primary presentation direction:

- remove the duplicated large marketing-style workspace hero treatment;
- keep the shared production `SiteHeader` and account/locale controls;
- make answer-mode selection a compact workspace control rather than a separate marketing card;
- use a desktop three-region workspace: conversation/history, active consultation, matter/source/handoff context;
- make static workspace copy Chinese-first and switchable to English through the existing site locale;
- preserve backend answer language independently;
- preserve conversation persistence, guided intake, citations, source lists, lawyer request actions, political gate, matter identity and all answer-mode access rules;
- provide a functional responsive layout without inventing P11-008's final acceptance work.

### Stage 2 — completed and owner accepted

Stage 2 made bounded presentation improvements inside P11-004:

- the mobile answer-mode control is collapsed by default and expandable;
- the existing lawyer-review action is clearly discoverable on mobile;
- internal appointment-development wording was replaced with customer-facing guidance.

The desktop conversation/consultation/matter-context layout and mobile collapsed/expanded states passed owner visual review. No backend rewrite or booking implementation was added.

## P11-004 success boundary

P11-004 is complete only when:

- site-locale switching controls workspace chrome in both Chinese and English;
- assistant answer language remains backend-driven and independent;
- conversation create/reopen/history behavior is unchanged;
- Fast / Legal Check / Premium entitlement behavior is unchanged;
- guided intake, citations, political gate, lawyer-request action and matter/source context still work;
- desktop/tablet/mobile layouts remain usable;
- no DB, legal-service, billing, scheduling, provider/model-routing, Phase-6 or ReasoningBank change is introduced;
- the owner reviews the final workspace visually before closure.

All success-boundary items were accepted at `f2d941734d256c9e0a0e42988cd67cdb828d0dc6`.


## P11-004 final validation and deployment note

- `pnpm test:unit`: 187 passed.
- `pnpm build`: passed.
- Changed-file Biome: passed.
- `git diff --check`: passed.
- `pnpm lint`: retains the known repository-wide 22-diagnostic baseline.
- Desktop and mobile owner visual acceptance: passed.

The local visual environment displayed the Debug panel because `NEXT_PUBLIC_WIDGET_DEBUG` was enabled. The active workspace guards it with `process.env.NEXT_PUBLIC_WIDGET_DEBUG === "true"`; staging/production should leave it disabled unless intentionally debugging.

P11-005 remains PLANNED and has not started.

## P11-005 rebaseline — Secure Matter Documents & AI File Intake

P11-005 is introduced before the Client Portal because current production code does not yet provide a secure matter-document lifecycle.

Observed current-state boundaries:

- generic `Message_v2.attachments` metadata exists but is not a matter-document model;
- the generic `/api/files/upload` route accepts JPEG/PNG only, up to 5 MiB, and stores them as public Vercel Blob objects;
- the Phase 11 AI Workspace does not currently upload or reason over customer PDFs/JPEGs/PNGs;
- there is no private document ownership/download boundary, PDF extraction, scanned-document/image understanding, page provenance, or authorized lawyer document continuity.

P11-005 is one major Task Packet with three internal stages:

1. **Stage 1 — Secure document foundation:** private storage boundary, additive document metadata/lifecycle, ownership authorization, upload/read/delete contracts, integrity/type/size controls and deterministic security tests.
2. **Stage 2 — Document understanding:** native PDF text extraction first, bounded scanned-PDF/JPEG/PNG visual extraction fallback, normalized text and page-level provenance, prompt-injection-safe evidence handling.
3. **Stage 3 — Matter / AI / lawyer integration:** matter-scoped document UI, selected-document evidence in AI analysis, provenance-aware display, and authorized document references in human handoff.

P11-005 does not authorize public object URLs, arbitrary file types, production DB migration execution, booking/calendar work, legal reasoning redesign, or weakening existing auth/VIP/lawyer ownership controls.

Executable packet after owner authorization: `docs/agent-memory/tasks/P11-005.md`.


### Stage 1 GitHub review finding

Pushed Stage 1 foundation commit: `15c72449f74879c10167be27cc059dc415301967`.

Core direction is retained: private S3 abstraction, owner-scoped document APIs, additive metadata model, bounded upload, integrity hash, pending security state and no AI/lawyer integration.

Stage 1 is **not yet accepted** because:

- owner requirement now expands supported evidence beyond PDF/JPEG/PNG to mainstream formats including DOCX/DOC, TXT/MD/JSON/CSV and XLSX/XLS;
- current Chat -> ImmigrationConversation -> MatterDocument cascade deletion can remove metadata without deleting the private object, creating a normal-path orphan-object lifecycle defect.

Both corrections remain inside P11-005 Stage 1 under D-033. Stage 2 must not start.


### Stage 1 acceptance — 2026-09-24

P11-005 Stage 1 is accepted at `df5335356ac7c7fc908236a270e78f280e5387e6`.

GitHub source/security review confirmed:

- centralized initial mainstream format registry for PDF, JPEG/PNG, DOCX/DOC, TXT/MD/JSON/CSV and XLSX/XLS;
- bounded signature/container/text validation with canonical MIME normalization;
- arbitrary ZIP, swapped OOXML identity, encrypted/path-traversal/duplicate/macro-bearing OOXML and mismatched legacy OLE containers rejected by the Stage 1 validator;
- customer files remain untrusted with `securityStatus=pending` and are not used by AI/lawyer flows;
- durable pre-PUT document intent and independent `storageStatus` prevent untracked private-object writes;
- only `stored` records enter normal customer list/metadata/download/soft-delete paths;
- conversation deletion uses explicit private-object cleanup and a restrictive document-to-conversation foreign key rather than cascade-dropping the only metadata reference;
- migration sequence `0019_light_loki.sql` then `0020_odd_lockheed.sql`, snapshots and journal are coherent; `0018` remains unchanged;
- no migration was applied and no live AWS/S3 service was contacted.

Recorded local validation: 211 unit tests passed, build passed, changed-file Biome passed, and `git diff --check` passed. Repository-wide lint remains at the known 21-diagnostic baseline. No GitHub Actions checks are attached to the accepted commit.

Non-blocking follow-ups before production readiness remain: private bucket/IAM/Block Public Access verification, physical retention/purge policy, and an operator/background recovery mechanism for stale non-`stored` upload intents. Stage 2 must preserve the broad accepted format set and must not treat a successful parse as malware/security clearance.


## P11-005 Stage 2 acceptance — 2026-09-24

**Accepted checkpoint:** `38e19c75bc131cc372c8c2682ec21e72834f8fb7`

Direct GitHub source review accepted the Stage 2 document-understanding/provenance boundary after the bounded recovery correction.

Accepted behavior includes:

- normalized `customer_document` evidence units with document/run identity, stable ordering, format-specific locators and provenance;
- native processing coverage for PDF, DOCX/DOC, XLSX/XLS, CSV, TXT, Markdown and JSON;
- JPEG/PNG plus scanned-PDF page fallback behind a dedicated OpenAI transcription adapter that is disabled unless explicitly configured;
- native-first mixed-PDF processing so only native-text-less pages enter the visual fallback path;
- isolated `worker_threads` native parsing with explicit empty environment, no inherited application secrets, V8 resource limits and hard termination;
- one parent-controlled document-processing deadline spanning parser execution, page rendering, sequential vision calls and normalized-unit assembly;
- compare-and-set processing claims, explicit incomplete reprocessing, and explicit stale-processing recovery while retaining previous terminal evidence;
- successful extraction never promotes `securityStatus` from `pending`, and parser workers are not treated as malware sandboxes;
- duplicate generated worker bundle removed from source control; runtime worker remains build-generated and traced.

Migration `0021_sudden_warbird.sql` remains **NOT APPLIED**. No live OpenAI, AWS or S3 service was contacted during validation.

Recorded validation: 243 unit tests passed, production build passed, changed-file Biome passed, `git diff --check` passed, and repository lint remained at its known 21-error baseline. GitHub attached no Actions status/workflow run to the accepted commit.

Non-blocking production/deployment gates remain: verify the actual ECS/Fargate-compatible `@napi-rs/canvas` native binding/package trace, apply and smoke-test migrations only under separate authorization, verify private S3/IAM/Block Public Access, define retention/purge and stale storage-intent operations, and add malware/quarantine controls before production-ready document handling.

Stage 3 remains NOT STARTED.


## P11-005 Stage 3 acceptance — 2026-09-25

**Accepted checkpoint:** `b29816c56255762998d8fa55b56df64436a0b3c3`

Direct GitHub review accepted the final Stage 3 matter/AI/lawyer integration boundary.

The accepted Stage 3 chain is:

`authorized MatterDocument -> bounded normalized evidence -> explicit per-turn selection -> server-side reauthorization -> answer-lane customer-document context -> usage-acknowledged persisted provenance -> exact lawyer snapshot reconstruction`.

The final post-push correction also closes two provenance edge cases: guided-intake submissions no longer clear unused selected documents, and chatbot route-level answer replacement/fallbacks cannot retain document provenance for an answer different from the backend answer that consumed the packet.

No new migration was created; migrations `0018`–`0021` remain **NOT APPLIED**. GitHub attached no Actions/status run to the accepted checkpoint; acceptance is based on direct source review plus recorded local validation.

P11-005 remains **IN PROGRESS / NOT VERIFIED** because production-readiness gates are intentionally still open.


## P11-005 deferral / P11-006 activation — 2026-09-25

The owner explicitly approved deferring the remaining P11-005 production-readiness gates to P11-009 AWS/staging acceptance.

Consequences:

- P11-005 implementation is complete: Stages 1–3 are accepted.
- P11-005 remains **NOT VERIFIED**; the deferred gates are still mandatory.
- P11-006 may now proceed without implying that secure-document production readiness has been established.
- P11-009 must not declare staging/production acceptance while any deferred P11-005 gate remains unresolved.

### P11-006 direction

P11-006 creates a registered-customer portal that **aggregates existing authoritative data instead of inventing a new matter database**.

The first production portal should unify:

- owned immigration conversations and their linked legal-matter identity;
- bounded matter context from the existing legal-service Matter record;
- P11-005 matter-document metadata/status;
- existing lawyer-request status/unread state;
- existing VIP entitlement/subscription state;
- direct continuity links back to AI Workspace, lawyer-request detail and VIP management.

No new appointment workflow belongs here; that remains P11-008.


## P11-006 closure — 2026-09-25

**Verified checkpoint:** `b3b5fe285779cd351c831d9793f3c62dc1ef4c0c`

P11-006 is VERIFIED after:

- implementation at `f1e001ab3df6d7f6a637e207cfce93ff1b563d00`;
- locale/matter-fetch hardening at `e9a91ef0bc280e85bd4b6fdb50b4d314aecf352c`;
- deferred-document-schema runtime compatibility at `b3b5fe285779cd351c831d9793f3c62dc1ef4c0c`;
- direct GitHub source review;
- owner desktop/mobile Chinese/English visual acceptance.

The final portal remains aggregation-first and matter-centered. It does not create a new matter database, legal reasoning engine, lawyer workflow, billing workflow or booking system.

The runtime compatibility behavior is intentional: while P11-005 migrations remain deferred, the Client Portal may show the document subsystem as unavailable while retaining conversations, lawyer-review summaries, membership state and other safe portal functions. It must not represent unavailable document data as an authoritative zero.

P11-005 production-readiness remains deferred to P11-009 under D-040 and is not closed by P11-006.


## P11-007 activation — 2026-09-25

P11-006 is VERIFIED at `b3b5fe285779cd351c831d9793f3c62dc1ef4c0c`.

P11-007 is now ACTIVE with authority document:

`docs/agent-memory/tasks/P11-007.md`

P11-007 is intentionally narrower than a generic staff case-management system. It improves the existing assigned-lawyer experience while preserving the Phase-8 request/assignment/RBAC/state-machine contract.

The handoff continuity chain is:

```text
customer AI answer
    ->
immutable lawyer-request snapshot
    ->
admin assignment
    ->
assigned lawyer workspace
    ->
clarification / confirmation / correction
    ->
customer request detail + existing notification/learning bridge
```

The lawyer workspace does not gain arbitrary conversation, MatterDocument, or Legal Service matter browsing merely because an assigned request contains a chat ID or legalMatterId.


## P11-007 closure — 2026-09-25

P11-007 is **ACCEPTED / VERIFIED**.

Source authority:

- remote source checkpoint: `9f352310ae6aa6392607296310c6d1caa943e0b9`;
- source review passed before visual acceptance;
- the final locale-shell correction preserved lawyer-only redirects, request-scoped projection, and customer-only MatterDocument authorization.

Assigned-request runtime acceptance:

- admin assignment -> distinct lawyer account -> `/lawyer-portal` queue -> `/lawyer-portal/[id]` detail completed locally;
- desktop zh-CN queue/detail: PASS;
- desktop English queue/detail: PASS;
- mobile zh-CN queue/detail: PASS;
- mobile English queue/detail: PASS;
- provenance/security sanity: PASS;
- status/action workflow sanity: PASS.

No P11-007 runtime change, migration, Legal Service change, AWS/S3 operation, or OpenAI call was required to close this milestone.

D-040 remains in force: P11-005 is still **NOT VERIFIED** until P11-009 closes its deferred deployment/security gates.

Next milestone: **P11-008 — Appointment / Consultation Workflow**. This documentation closure does not itself start P11-008 implementation.


## P11-008 activation — 2026-09-25

P11-007 is VERIFIED. P11-008 is now **ACTIVE** with authority document:

`docs/agent-memory/tasks/P11-008.md`

The appointment milestone will not simulate an external booking provider or expose invented availability. The accepted product model is:

```text
authenticated customer
    ->
consultation request + up to 3 preferred windows + timezone + method preference
    ->
admin triage / assignment to verified lawyer
    ->
assigned staff proposes one concrete slot + method/instructions
    ->
customer confirms OR requests rescheduling
    ->
confirmed consultation
    ->
staff completes or cancels
```

Authorization remains explicit:

- customer: own consultation requests only;
- admin: all consultation requests + assignment;
- lawyer: only requests assigned to that lawyer;
- appointment assignment does not grant matter-wide chat, MatterDocument, LawyerClarificationRequest, or Legal Service access.

No VIP-only gate or consultation price is introduced in P11-008 because no approved commercial rule currently establishes one.

No external calendar, payment, video, phone, office-location, or real-time-availability integration is assumed. A future provider adapter may be added only after a separate approved product/integration decision.

Stage 1 may add an additive schema and the next generated migration artifact, but **must not apply any migration**. P11-005 migrations `0018`–`0021` also remain unapplied under D-040.


## P11-008 Stage 1 source acceptance / Stage 2 plan — 2026-09-26

Remote source checkpoint `83506156546dcff2944b21edef16423a5b402d54` is accepted for **P11-008 Stage 1 source scope**.

What is closed:

- schema/domain/API source review;
- revision-based optimistic concurrency;
- customer/admin/assigned-lawyer RBAC;
- assignment/demotion serialization;
- transaction/event design;
- same-lawyer overlap serialization design;
- continuity ownership and least-privilege projections;
- pre-0022 lawyer-role-management rollout compatibility.

What remains deliberately open:

- migration `0022_first_slayback.sql` is tracked but **NOT APPLIED**;
- real migrated-DB concurrency/rollback/API integration is deferred under the named P11-008 migrated-DB transaction gate;
- Stage 1 is therefore source-accepted, not fully DB-verified.

### Stage 2 — customer booking continuity

Stage 2 is a customer-only product layer. It should add:

- `/consultations` — registered-customer consultation history;
- `/consultations/new` — bilingual request form;
- `/consultations/[id]` — customer detail + status-valid confirm/reschedule/cancel actions;
- AI Workspace booking entry using only the current owned `chatId` as optional continuity;
- Contact-page consultation CTA to the real customer request flow;
- Client Portal consultation summary/history plus a matter-scoped “request consultation” link that passes only an owned chat identifier for server re-authorization;
- optional customer account-menu discoverability for consultation history.

Stage 2 UI must use the persisted site locale (`zh-CN` default / English switch); assistant response language remains independent.

Time-entry rule for Stage 2: use browser-local `datetime-local` values together with the browser-resolved IANA timezone. Convert to absolute ISO timestamps using the browser local timezone and visibly show the detected timezone. Do not implement an arbitrary timezone selector unless a correct timezone-aware conversion layer is added; never relabel a browser-local timestamp as another timezone.

Stage 2 must not show fake available slots. Preferred windows remain customer preferences only; the final slot is proposed by authorized staff in Stage 3.

### Rollout compatibility

Because `0022` remains unapplied, Stage 2 must add an explicit consultation-schema availability boundary based on a catalog/`to_regclass` check.

When the consultation table is absent:

- consultation APIs return an explicit bounded unavailable result rather than an uncontrolled 500;
- customer UI renders a localized unavailable state rather than an authoritative empty history;
- Client Portal marks consultation data unavailable rather than zero;
- existing conversation, lawyer-request, document and membership functionality continues normally.

Unrelated database failures must still surface; no broad database-error swallowing is allowed.

### Stage 2 acceptance split

Stage 2 may reach **source/UI acceptance** while `0022` remains unapplied. Real create/confirm/reschedule/cancel E2E against PostgreSQL remains part of the deferred migrated-DB gate until a separately authorized disposable/migrated environment is available.

Stage 3 remains separate and owns staff scheduling UI, consultation notifications and final customer/admin/lawyer E2E.


## P11-008 Stage 2 source acceptance / Stage 3 plan — 2026-09-26

Remote checkpoint `2d91c17a483c0fd30a434536f87b64bc7cf6fe94` is accepted for the P11-008 **Stage 2 source gate**.

Stage 3 remains inside the same P11-008 task packet and has two internal gates:

1. **Stage 3 source/UI gate** — admin/lawyer scheduling surfaces, consultation-specific notification adapter/templates, rollout compatibility and deterministic tests. No migration application.
2. **P11-008 migrated-DB/runtime gate** — separately authorized disposable/migrated database execution of real assignment/proposal/confirmation/reschedule/cancel/complete flows, concurrency/rollback checks, notification fail-neutral smoke, and desktop/mobile zh-CN/English acceptance.

### Stage 3 staff route direction

Use distinct consultation routes so the existing P11-007 lawyer-review request URLs remain unambiguous:

- admin queue: `/admin-portal/consultations`;
- admin detail: `/admin-portal/consultations/[id]`;
- lawyer queue: `/lawyer-portal/consultations`;
- lawyer detail: `/lawyer-portal/consultations/[id]`.

Do not repurpose `/lawyer-portal/[id]`, which remains the P11-007 LawyerClarificationRequest detail route.

Admin capabilities must mirror the accepted Stage-1 state machine:

- list/read all consultation requests;
- assign/unassign a verified lawyer only while `requested`;
- propose/re-propose a concrete future slot after assignment;
- cancel non-terminal consultations;
- complete only confirmed consultations.

Lawyer capabilities remain assigned-only:

- list/read only assigned consultations;
- propose/re-propose an assigned request;
- cancel an assigned non-terminal request;
- complete an assigned confirmed request;
- no self-assignment and no broader matter/document access.

### Stage 3 scheduling UI

Staff slot entry must not pretend to be live availability.

Use a browser/device-timezone `datetime-local` input converted to an absolute ISO timestamp, with the staff device IANA timezone shown explicitly. Display the resulting proposal in the customer's stored timezone, and optionally the staff timezone, without inventing office hours or provider availability.

Admin lawyer assignment should reuse existing verified lawyer-account authority. Existing `/api/admin/lawyers` may be reused and filtered to current `role=lawyer`; the consultation assignment API remains the final authority.

All staff mutations send the current `expectedRevision`. On 409, do not retry automatically; refetch the latest consultation and show a localized conflict/review-latest message. A scheduling overlap may surface through the same bounded conflict UX.

### Stage 3 rollout compatibility

All new staff pages must remain usable before migration 0022 is applied:

- authenticated admin/lawyer reaches the page;
- consultation API 503 produces a localized schema-unavailable state;
- no empty queue claim is shown for an unavailable schema;
- existing P11-007 lawyer-review workspace and admin account/review features remain usable;
- unrelated DB errors still surface.

### Consultation notification boundary

Create a consultation-specific notification contract. Do not overload `LawyerRequestNotification`.

The notification layer must be **fail-neutral to the already committed database mutation**:

```text
DB transaction commits
    ->
notification attempt
    ->
delivery succeeds OR safely logs failure
    ->
API mutation result remains valid
```

Use the existing SES/auth-email infrastructure and a feature flag disabled by default. Do not include customer notes, preferred-window narratives, chat/document content, legal facts, private matter metadata, tokens or internal traces in email.

A bounded event set is sufficient:

- new consultation request -> optional configured staff triage mailbox;
- admin assignment -> assigned lawyer;
- staff proposal/re-proposal -> customer;
- customer confirmation/reschedule/cancellation -> assigned lawyer when present, otherwise optional configured staff mailbox where appropriate;
- staff cancellation/completion -> customer.

Email should contain only generic event text and a role-appropriate application link.

Stage 3 notifications do not imply a verified office email, phone, meeting provider or SLA. Configuration values remain deployment concerns.

No external calendar, video provider, payment or pricing integration belongs in P11-008 Stage 3.


## P11-008 migrated-DB/runtime acceptance gate — activated 2026-09-26

**Starting source checkpoint:** `5304742196f08894d249138c30b2245977a52e9b`  
**Source state:** Stages 1–3 accepted  
**Normal local chatbot DB:** do not migrate  
**Gate DB:** fresh disposable clone only

### Gate A — Environment and clone preflight

1. Verify branch/HEAD and a clean worktree.
2. Read the normal chatbot `.env.local` only through the application's existing environment loader; never print, paste or log credentials.
3. Record the normal chatbot DB migration journal read-only.
4. Create a uniquely named disposable clone of the normal chatbot database.
5. Keep `chatbot/.env.local` unchanged.
6. All migration/app/runtime commands for this gate must receive the disposable DB through a shell-scoped `POSTGRES_URL`.
7. Do not contact OpenAI, AWS, S3, Stripe or real SES.

If a safe clone cannot be created without exposing credentials or mutating the source DB, STOP.

### Gate B — Migration execution on disposable clone

Use the repository migration runner against the disposable clone:

`pnpm db:migrate`

The runner may apply every migration missing from the clone, including the deferred MatterDocument migrations 0018–0021 and consultation migration 0022.

Acceptance requires:

- migration command exits successfully;
- Drizzle journal reaches 0022 exactly once;
- `ConsultationRequest` and `ConsultationEvent` exist;
- expected FKs and indexes exist;
- no 0023 exists;
- no source migration file is edited;
- normal local chatbot DB journal remains unchanged.

Applying 0018–0021 here is only compatibility coverage on a disposable clone and does not close D-040.

### Gate C — Real PostgreSQL service/transaction acceptance

Run deterministic DB-backed acceptance against the disposable clone.

Required checks:

- customer consultation creation writes one request plus immutable `created` event;
- admin assignment accepts a verified lawyer and writes the assignment event;
- stale `expectedRevision` is rejected and does not create a new event;
- same-lawyer concurrent overlapping proposals serialize so at most one conflicting interval is accepted;
- half-open intervals permit an adjacent boundary where one consultation ends exactly when another begins;
- proposal/re-proposal persists the expected absolute time, method and instructions;
- confirmation uses the current revision;
- re-proposal from confirmed returns to proposed and requires customer confirmation again;
- customer reschedule request clears the active proposal and returns to requested;
- cancellation and completion obey the frozen state machine;
- assigned-lawyer reads/actions remain assigned-only;
- assignment vs lawyer-demotion concurrency cannot leave active assigned work on a demoted account;
- request-row mutation and immutable event insert are atomic.

For rollback atomicity, a temporary fault-injection trigger/constraint may be installed **only on the disposable DB** to force a `ConsultationEvent` insert failure after the request mutation is attempted. Verify the request-row mutation rolls back, then remove the temporary fault before continuing. Never place this trigger in repository migrations.

### Gate D — Notification fail-neutral runtime smoke with zero real delivery

Gate D is the **next active P11-008 runtime gate** after Gate C acceptance.

Use the retained disposable DB only:

`chatbot_p11_008_gate_20260926_20c435`

The ordinary fixture/setup path keeps consultation notifications disabled. For exactly one isolated smoke, exercise the production post-commit notification boundary with:

- a fresh synthetic verified customer using an `@example.test` address;
- a fresh synthetic admin actor;
- one real consultation created through the accepted consultation service;
- a valid admin cancellation as the state-changing mutation;
- notification kind `staff_cancelled`, which targets the synthetic customer;
- `CONSULTATION_NOTIFICATIONS_ENABLED=true` only inside the child/test process;
- `EMAIL_PROVIDER=p11_gate_d_unsupported` so `sendEmail()` throws before SES client construction or network send;
- empty/disabled AWS region values in the child process as a second network-safety guard;
- restoration of environment and console hooks in `finally`.

The runtime sequence mirrors the accepted route boundary without turning Gate D into browser/auth E2E:

```text
real consultation mutation commits
    ->
immutable consultation event commits
    ->
notifyConsultation(id, "staff_cancelled")
    ->
target lookup + template/sender path is reached
    ->
unsupported provider fails locally before SES
    ->
deliverConsultationNotification catches failure
    ->
notifyConsultation returns false
    ->
committed consultation state/event remain intact
```

Acceptance requires all of the following:

- disposable DB identity is verified before and after;
- the cancellation mutation succeeds and advances revision exactly once;
- exactly one new `cancelled` event persists;
- `notifyConsultation(..., "staff_cancelled")` returns `false` and does not throw;
- captured error metadata proves the consultation email path reached the unsupported-provider failure and the notification delivery wrapper absorbed it;
- captured logs contain no synthetic customer email, private-note marker, preferred-window content, `POSTGRES_URL`, password, AWS credentials or other secret/customer payload;
- no AWS/SES network call occurs;
- child-process notification/email environment is restored before exit;
- normal local chatbot DB remains at `0017_wooden_silver_sable` with consultation tables absent;
- repository remains clean and no source/schema/migration file changes are made.

Gate D is **not** HTTP/session/browser E2E and must not claim that scope. Full route/auth/customer/admin/lawyer behavior remains Gate E.

Do not use real email addresses. Do not run Gate E/F in the Gate-D task.

### Gate E — Customer/admin/lawyer runtime + visual acceptance

Run the Next.js chatbot against the disposable DB only.

Use distinct verified test identities for customer, admin and lawyer.

Exercise:

1. customer creates consultation from the real customer flow;
2. admin sees it, assigns lawyer and proposes a slot;
3. lawyer sees only assigned consultation work;
4. customer sees proposal and confirms it;
5. exercise a separate reschedule cycle;
6. exercise cancellation;
7. exercise a separate confirmed consultation through staff completion;
8. verify a 409 refresh/no-retry interaction;
9. verify schema-backed history/detail no longer show rollout-unavailable state.

Visual acceptance must cover desktop and mobile, zh-CN and English, for customer history/new/detail plus admin/lawyer queue/detail.

### Gate F — Evidence and cleanup

Before any cleanup, capture:

- disposable DB name only, never credentials;
- pre/post migration journal tags;
- exact commands with secrets omitted;
- runtime test pass/fail evidence;
- concurrency results;
- rollback fault-injection result and proof the temporary fault was removed;
- notification fail-neutral result;
- desktop/mobile bilingual visual observations;
- confirmation normal local chatbot DB was not migrated.

Retain the disposable DB until external review is complete. Drop it only after owner approval.

Any product/source defect found during this gate returns to the normal bounded patch-review workflow. Do not patch production state or manually edit migrated data to make a failing gate pass.

## P11-008 runtime Gates A–C acceptance checkpoint — 2026-09-26

**Current product-source checkpoint:** `62947e779b8a5a39df58038deab7c135e452569f`  
**Retained disposable DB:** `chatbot_p11_008_gate_20260926_20c435`  
**Normal chatbot DB:** unchanged at `0017_wooden_silver_sable`; consultation tables absent

Accepted sequence:

- Gate A: PASS — credential-safe disposable clone isolation.
- Gate B: PASS — disposable migrations through 0022, expected consultation schema/FKs/indexes verified.
- Gate C: PASS — final canonical run produced exactly **11 PASS / 0 FAIL / 0 SKIP**.

The final Gate-C evidence covered real PostgreSQL concurrency and rollback rather than only deterministic unit logic. Same-lawyer overlapping proposals produced one success plus one domain 409 with no double booking; exactly adjacent half-open intervals both succeeded; assignment vs lawyer demotion preserved the active-assignment invariant; and a disposable-only `P0001` event-insert fault rolled back the request mutation before a clean retry succeeded.

The real Date-binding defect discovered during Gate C was corrected and remotely verified at `62947e7`. No schema/migration change accompanied that correction.

**Immediate next runtime gate: Gate D**, using the refined zero-delivery fail-neutral contract above. Do not repeat Gate C unless a later source change touches consultation transaction/scheduling semantics.

## P11-008 Gate D closure / Gate E execution plan — 2026-09-26

Gate D is **ACCEPTED**. External artifact review confirmed the harness and result match the frozen fail-neutral contract.

### Gate E objective

Gate E proves the **real web application boundary**, not just service functions:

```text
browser credential login
    ->
Next.js authenticated page/API
    ->
real consultation UI
    ->
real disposable PostgreSQL state
```

The server must be a dedicated local process on a unique port. Do not reuse any already-running dev server because it may be connected to the normal chatbot DB.

### Gate E server safety

Launch the chatbot with process-scoped:

- retained disposable `POSTGRES_URL`;
- `CONSULTATION_NOTIFICATIONS_ENABLED=false`;
- `NEXT_TELEMETRY_DISABLED=1`;
- a unique local port;
- existing local auth secret/configuration without printing it.

Do not edit `.env.local`.

Browser automation must reject/record any request whose host is not the dedicated localhost server. Do not submit AI queries or open flows that require Legal Service/OpenAI.

### Synthetic authenticated actors

Create fresh disposable-only verified accounts:

- one customer: role=user;
- one admin: role=admin;
- one lawyer: role=lawyer.

Use `@example.test` addresses and a runtime-generated password that is never written to result artifacts or logs.

Authentication must go through the real `/login` credential form / NextAuth session. Directly forging browser auth cookies is not accepted.

### Functional workflow

Use the real browser UI and authenticated API behind it.

At minimum:

1. customer opens `/consultations/new`, creates consultation A and reaches its real detail URL;
2. customer history/detail show schema-backed data, not rollout-unavailable state;
3. admin queue sees A, opens detail, assigns the synthetic lawyer, then proposes a concrete future slot/method/instructions;
4. lawyer queue sees assigned A and lawyer detail exposes no assignment control;
5. customer sees A proposed and confirms it;
6. lawyer reloads A and completes the confirmed consultation;
7. consultation B: create -> admin assign/propose -> customer requests rescheduling; verify status returns to requested and active proposal is cleared;
8. consultation C: customer cancels a requested consultation through the real UI;
9. consultation D: load the same requested detail in two customer pages; cancel in page 1; attempt the stale cancellation in page 2; require visible stale/conflict UX, refetch to the latest cancelled state, and no automatic retry/second cancellation event.

Direct DB reads may be used only as post-condition evidence, not to simulate these browser mutations.

### Bilingual/responsive evidence

After the functional flow, preserve synthetic data and capture screenshots for:

- customer history;
- customer new;
- customer detail;
- admin queue;
- admin detail;
- lawyer queue;
- lawyer detail.

Capture each surface in:

- desktop zh-CN;
- desktop English;
- mobile zh-CN;
- mobile English.

Use a deterministic desktop viewport such as 1440x1000 and a mobile viewport such as 390x844. Use the real `site-locale` mechanism. Programmatic cookie setting is acceptable for screenshot calibration because locale is not an authorization capability; functional locale switching should still be spot-checked through the real switcher.

Automated visual assertions must at least detect document/body horizontal overflow, inaccessible hidden action controls, failed route loads, untranslated rollout-unavailable state and obvious long synthetic-email/note/instruction wrapping failures. Final visual acceptance remains external/owner review of the screenshots.

Package screenshots into a temporary archive plus a manifest with route, actor, locale, viewport and overflow/assertion result.

### Gate E stop boundary

Gate E must not:

- modify tracked source;
- add permanent Playwright tests;
- call AI/Legal Service;
- send email;
- contact AWS/S3/Stripe;
- migrate or drop any DB;
- run staging/production;
- commit/push;
- proceed to disposable DB cleanup.

Retain the disposable DB and all Gate-E temporary evidence for external review.

## P11-008 final acceptance — 2026-09-27

**P11-008 Final UI Acceptance: PASS. P11-008 is VERIFIED.** Frozen prior gates remain **PASS / ACCEPTED**: Gates A+B, C, D, and E-Core.

Final UI acceptance passed real `zh-CN` → English and English → `zh-CN` switching, with each locale persisting after reload. Customer history/new/detail, admin queue/detail, and lawyer assigned queue/detail passed. The fresh synthetic lawyer assignment was verified in the lawyer queue/detail. Desktop and mobile responsive presentation passed with no blocking visual/layout defect; the owner manually reviewed representative UI evidence.

During manual acceptance, disposable-DB postgres.js connections accumulated and PostgreSQL temporarily reached `max_connections`. Idle connections were terminated and acceptance resumed successfully. This was an acceptance-environment/runtime-harness issue, not a demonstrated P11-008 product defect.

The disposable DB `chatbot_p11_008_gate_20260926_20c435` remains migrated through 0022. The normal `chatbot` DB remains unchanged at `0017_wooden_silver_sable` with consultation tables absent. P11-005 deferred production-readiness items remain **NOT VERIFIED** and are not closed by P11-008.

P11-009 is **ACTIVE**. Its scope was expanded by owner decision on 2026-09-30; Stage 1 is the current implementation unit and is specified in `docs/agent-memory/tasks/P11-009.md`.

## P11-009 activation — 2026-09-30

### Revised objective

Complete Phase 11 by first turning Policy Intelligence into a live official-source-grounded service and then closing production-readiness/staging acceptance. The lawyer-provided Sovereign Nexus artifact in `chatbot/UI_template/OPEN_ME_Sovereign_Nexus_UI.html` is a product/visual reference only; production source, auth, provenance and safety contracts remain authoritative.

### Four-stage execution model

1. **Stage 1 — Live Policy Intelligence backend — ACTIVE**
   - introduce durable/versioned policy item, official-source snapshot, AI analysis revision and sync-run persistence;
   - reuse/harden the existing allowlisted discovery boundary and add safe official-source snapshot acquisition;
   - generate bilingual structured policy analysis from backend-controlled authoritative evidence;
   - verify material AI claims against snapshot evidence before publication;
   - fail closed to held/review-required state when status/effect/applicability/evidence is uncertain;
   - expose server-side read services for the latest verified/published revisions and an operator `policy:sync` path;
   - do not redesign the public Policy Intelligence UI or schedule AWS jobs in Stage 1.

2. **Stage 2 — Policy Intelligence product activation**
   - replace the empty production experience with live published revisions;
   - implement the richer list/detail/history/impact presentation inspired by the approved Sovereign Nexus template;
   - preserve Official Source != AI Analysis != Lawyer Commentary;
   - connect policy records into AI Workspace through an exact server-derived policy reference.

3. **Stage 3 — Phase 11 production hardening**
   - close all D-040/P11-005 production-readiness gates;
   - whole-platform bilingual/responsive/accessibility/E2E regression;
   - no reopening of frozen P11-008 gates unless later code materially invalidates them.

4. **Stage 4 — AWS staging rollout and acceptance**
   - inspect live topology/migration state first;
   - migrate to the repository's then-current latest migration rather than a hard-coded 0021/0022 target;
   - deploy exact images, verify scheduler/sync infrastructure and run final staging acceptance.

### Stage 1 non-goals

Stage 1 must not deploy AWS resources, apply migrations to normal local/staging/production databases, redesign customer-answer architecture, alter Phase 6/ReasoningBank, synthesize lawyer commentary, add arbitrary-web crawling, or implement the final Policy Intelligence UI.


## P11-009 Stage 2 accepted / Stage 3 activated — 2026-09-30

Stage 2 is **ACCEPTED** at remote checkpoint `0afa4cb7921e74ee6a2263b66743a875c5cf3e07` after source review, the bounded R1 public-projection correction and fixture-driven desktop/mobile zh-CN/en visual acceptance.

Stage 3 is now the active implementation unit. It hardens the production artifact and operational boundaries without performing AWS/staging mutation in the initial coding pass. The required source work covers production container/runtime separation, native parser/canvas self-checking, migration preflight separation, MatterDocument retention/recovery operations, fail-closed malware/quarantine gating and scanner abstraction, private-S3 preflight tooling, and a concentrated whole-platform bilingual/responsive/accessibility/E2E regression harness.

D-040 remains mandatory. Stage-3 source acceptance alone does not mark P11-005 VERIFIED. Environment-specific proofs—actual staging migration, real ECS/Fargate native binding, real S3/IAM/BPA and concrete scanner configuration—remain controlled Stage-4 acceptance actions after explicit owner authorization.


## P11-009 Stage 3 accepted / Stage 4 activated — 2026-09-30

Stage 3 is **ACCEPTED** at `e3b42c2004054da1eb3a6fd81c9f21dccdeb6b75`.

Accepted evidence includes the production-image/native-runtime gate; explicit stock migration/preflight tooling; disposable-PostgreSQL migration/runtime security matrix; migration-free service startup; MatterDocument stale-intent/retention/security mechanisms; injected S3-preflight logic; authenticated customer/admin/lawyer RBAC and object-scope checks; bilingual/desktop/mobile runtime coverage; and the bounded accessibility correction confirmed by source review plus owner browser verification on the current checkpoint.

The final automated targeted Playwright rerun produced a sidebar/control false-negative before completing the bounded rerun. The current source and owner browser verification contradict a product failure: the corrected AI Workspace and lawyer feedback controls are present and accessible. Treat the harness settlement issue as non-blocking unless staging reproduces a real product defect; do not reopen Stage 3 through repeated micro-gates.

Stage 4 is now active. Its first gate is **read-only AWS/staging reconnaissance only**. No AWS mutation, migration, deployment, image push, task-definition update, S3/IAM change, scanner configuration, scheduler change or DNS/routing change is authorized by this activation.

D-040 remains open and P11-005 remains **NOT VERIFIED** until Stage 4 supplies the required real environment evidence.


## 2026-10-01 emergency Policy Intelligence UI hotfix

Production rollout is complete and the public Policy Intelligence surface is no longer empty because checkpoint `e888d350e0d91ff98fc5221d85ddb94fd070e7fe` added a reviewed official-source fallback path. The current list/detail presentation is nevertheless not accepted by the owner because it does not match the lawyer-provided Sovereign Nexus legal-intelligence reference closely enough.

The immediate active unit is intentionally narrow and fast:

`lawyer template -> one list/detail UI implementation batch -> focused tests + build -> one deployment -> visual acceptance`

No crawler, analyzer, verifier, database, migration, AWS infrastructure or model-routing redesign belongs in this hotfix. The public product must remain usable independently of automated ingestion success.

## 2026-10-01 Policy Intelligence emergency hotfix — CLOSED / OWNER ACCEPTED

The immediate Policy Intelligence recovery and presentation hotfix is complete.

- Final validated/deployed source: `f1b48fc340085392c818ace917aa217bfca245c1`
- ECS production-style service rollout: `immigration-ai-staging-web:33`
- Deployed chatbot digest: `sha256:996fa0d155247eb3dd72296ee7f7a62fc182a3a4ff60c00d7f63d9a5c0d71a1e`
- Rollout state: `COMPLETED`, desired/running/pending = `1/1/0`
- Focused Policy Intelligence tests, production build and diff check all passed before deployment.
- Owner visually reviewed the live `/intelligence` page and accepted the result as basically satisfactory.

**Milestone handling:** close only the emergency Policy Intelligence hotfix. Broader deferred P11-005/P11-009 production-hardening items keep their existing status and are not implicitly accepted by this UI/content rollout.

**Next action:** none. Project work is intentionally paused until the owner reports a concrete issue or requests the next refinement.

## 2026-10-01 Policy Intelligence automatic maintenance — STEP A ACTIVE

Owner decision: Policy Intelligence must not remain manual-only. The long-term operating model is automated maintenance with lawyer/admin exception control.

Approved three-step plan:

1. **Step A — ACTIVE:** add a single all-source operator command that serially runs the existing official-source sync for Home Affairs, Federal Register and ART; confirm/preserve the existing verifier-gated automatic publication semantics; keep partial failures observable; source/local tests only.
2. **Step B — PLANNED:** minimal admin management page with archive/unpublish + restore. Archived items must remain suppressed across future automatic syncs until explicitly restored.
3. **Step C — PLANNED:** one EventBridge Scheduler -> independent ECS one-off operator task, initially daily at **06:00 Australia/Sydney**. Do not run scheduled sync inside the web service.

Manual reviewed fallbacks remain disaster-recovery content. They are not the intended day-to-day maintenance mechanism.

**Current next action:** implement and independently review Step A only. No AWS mutation, scheduler creation, admin UI, schema migration or public UI redesign belongs in Step A.

## 2026-10-01 Policy Intelligence automatic maintenance — STEP A ACCEPTED / STEP B ACTIVE

Step A is accepted at `4f6b1a905698970ae8a21ede41531cfd53f2dab4`.

Step B is now the only active implementation unit:

- add a minimal authenticated admin Policy Intelligence management surface;
- list current durable policy items;
- allow archive/unpublish and restore/reactivate;
- reuse existing lifecycle state where possible;
- an archived item must remain suppressed across later automatic sync and must not be silently republished until admin restore;
- no scheduler/AWS work yet.

Step C remains planned: one daily EventBridge Scheduler -> independent ECS one-off operator at 06:00 Australia/Sydney.

## 2026-10-01 Policy Intelligence automatic maintenance — STEP B ACCEPTED / STEP C ACTIVE

Step B is accepted at `e741ff1b6d7ffc8dd662cd50e1c232d3256f272d`.

Step C is now the only active implementation unit.

Target:

- package the existing `pnpm policy:sync-all` operator into an independent ECS one-off runnable artifact;
- do not run sync inside the long-lived chatbot web service;
- use one EventBridge Scheduler entry;
- cadence: **daily at 06:00 Australia/Sydney**;
- use the already accepted all-source serial orchestration;
- preserve existing verifier-gated auto-publication and archived-item suppression;
- manual reviewed fallbacks remain disaster recovery;
- perform one bounded live acceptance after deployment.

Keep Step C operationally small: one operator task definition, one schedule, one schedule role if required, and the minimum existing secret/network wiring needed to run.

## 2026-10-01 Policy Intelligence automatic maintenance — COMPLETE / ACCEPTED

The three-step automatic-maintenance plan is complete.

- **Step A — ACCEPTED:** all-source serial operator at `4f6b1a905698970ae8a21ede41531cfd53f2dab4`.
- **Step B — ACCEPTED:** admin archive/restore and durable archived suppression at `e741ff1b6d7ffc8dd662cd50e1c232d3256f272d`.
- **Step C — ACCEPTED:** dedicated operator source at `dc8595d365b565c869bcc82f2f02bc9cfd8ab9ec`, live ECS task acceptance exit 0, and enabled daily EventBridge Scheduler.

Deployed operator image digest:
`sha256:3caad29bc292b79de2508a4e0fdebb086a97824a709f45309e959b3fb369f28c`

ECS task definition:
`immigration-ai-staging-policy-sync:1`

Enabled schedule:
`immigration-ai-staging-policy-sync-daily`

Cadence:
`cron(0 6 * * ? *)` in timezone `Australia/Sydney`.

The live acceptance run succeeded for Home Affairs, Federal Register and ART. Automatic Policy Intelligence maintenance is now operational; no further implementation step is active for this feature.

## 2026-10-01 Policy Intelligence automatic maintenance — deployment complete / first scheduled run pending observation

Clarification to the prior COMPLETE / ACCEPTED entry:

- Steps A and B remain fully accepted.
- Step C source, image, ECS task definition, manual live execution and Scheduler configuration are accepted.
- The manual live ECS task succeeded with container exit code 0 and all three sources reported succeeded.
- The earlier AWS CLI waiter timeout was only a client-side waiter timeout; it was not a sync-task timeout or failure.
- The EventBridge Scheduler is enabled at 06:00 `Australia/Sydney`.
- The first **naturally Scheduler-triggered** run has not yet occurred/been observed because the schedule was created after the day's 06:00 trigger point.

No further code implementation is active. The remaining item is one operational observation of the next scheduled invocation.


## 2026-10-03 Policy Intelligence verifier diagnostics — PAUSED / RESUME POINT RECORDED

There is no active Policy Intelligence implementation unit while the owner pause is in effect.

Last accepted remote source checkpoint:
`047fc2f9ab2abee7ba247b00e0106019beff840a`

Current deployed operator checkpoint:

- web: `immigration-ai-staging-web:40`;
- policy sync: `immigration-ai-staging-policy-sync:6`;
- daily scheduler continues to target policy-sync `:6`.

The 90s/120s analyzer timeout policy passed live acceptance: 494 completed the first attempt in 70,991 ms and ART scheduled hearings completed in 66,721 ms. Do not reopen timeout tuning without new evidence.

The next intended diagnostic milestone, when resumed, is to inspect full stored analyzer and verifier output for the 494 item before considering any verifier/publication-gate change. A local-only admin detail endpoint for this purpose has reportedly been implemented and focused-tested but remains uncommitted, unpushed and undeployed. Preserve that working tree; do not assume the endpoint exists in remote source.

No implementation is authorized by this pause record.


## 2026-10-04 Lawyer-feedback UI consolidation — LF-01 ACTIVE

The owner accepted a new urgent product/UI plan based on lawyer feedback. It temporarily takes precedence over the paused Policy Intelligence verifier/publication-gate investigation.

The plan has **three development stages only**:

1. **LF-01 — Public Experience Consolidation — ACTIVE**
   - reduce public navigation to Home / AI Workspace / Services & Contact / Legal Updates;
   - brighten and rebalance the Home Opera House hero;
   - place latest legal/immigration updates immediately below the hero;
   - merge Services + Process + Contact into one clean canonical surface while preserving legacy routes;
   - expose only two public Legal Updates groups while retaining the existing internal status model.
2. **LF-02 — AI Workspace Consolidation — PLANNED**
   - fixed desktop workspace shell;
   - Known / To Confirm context rail;
   - remove customer-visible confidence;
   - manual case-summary action;
   - distinct lawyer-review and one-to-one consultation actions.
3. **LF-03 — Policy-to-AI Continuity + Final Product Integration — PLANNED**
   - new conversation for each legal-update -> AI handoff;
   - topic reference + lightweight assistant opener;
   - no automatic policy analysis until the user asks a question;
   - cross-page bilingual/mobile polish.

After the three stages, use one consolidated final acceptance/deployment gate. Do not create micro-substages or repeated R1/R2 correction chains for non-blocking polish.

**Current next action:** implement LF-01 only in an isolated UI worktree/branch. Do not modify the paused Policy Intelligence analyzer/verifier/publication architecture and do not destroy or mix the local admin-detail endpoint WIP.


## 2026-10-04 LF-01 verified / LF-02 activated

**LF-01 — VERIFIED**

Remote accepted commit: `5719cee319ac022a6c6c4761820e8892779e6039` (`feat: consolidate public immigration service experience`).

Acceptance evidence:

- 46 focused tests passed;
- production build passed;
- changed-file Biome passed;
- `git diff --check` passed;
- desktop/mobile visual smoke passed;
- remote commit boundary independently verified.

**LF-02 — ACTIVE**

Implement the AI Workspace consolidation as one bounded stage:

1. desktop viewport-constrained application shell with internal pane scrolling and persistent composer;
2. right rail reduced to all current Known information + all current To confirm requests;
3. explicit manual case-summary snapshot generated from structured Known/To Confirm context only, with no automatic LLM/backend call;
4. remove customer-visible confidence/current-matter/next-action/duplicate-source/generic-handoff panels;
5. retain answer-level citations and existing guided intake/documents/modes/conversation behavior;
6. make VIP lawyer-review and existing one-to-one consultation paths clear without changing entitlement/business-state semantics.

Run one concentrated validation/visual gate after the complete implementation. Leave LF-02 uncommitted/unpushed for review and stop before LF-03.

Policy Intelligence verifier/publication diagnostics remain paused.


## 2026-10-04 LF-02 verified / LF-03 activated

**LF-02 — VERIFIED**

Remote accepted commit: `1fab2376fb72dc02587b46b1f6b9157379a5b3ee` (`feat: consolidate AI workspace experience`).

Acceptance evidence:

- 23 focused tests passed;
- 497 standard unit tests passed with no skips;
- production build passed;
- changed-file Biome passed;
- `git diff --check` passed;
- desktop/mobile visual smoke passed;
- cross-conversation summary leakage found during review was corrected and covered before acceptance.

**LF-03 — ACTIVE**

Implement the final feature stage as one bounded unit:

1. Legal Update “Ask AI” carries explicit one-time policy launch intent.
2. Valid published policy handoff creates exactly one fresh conversation; consumed URL keeps `policy + chatId` and removes the launch marker so reload is idempotent.
3. Show one compact deterministic policy-topic opener/reference; no model call occurs on page open.
4. When the user actually asks a question, the active policy slug may be server-resolved and supplied as bounded topic context to the normal answer path; never treat page AI interpretation as evidence and never rewrite the visible user question.
5. Switching/new conversation clears the active policy context so it cannot leak across chats.
6. Preserve LF-01/LF-02 and P11-006/007/008 boundaries.
7. Finish only bounded cross-page bilingual/mobile integration polish.

Leave LF-03 uncommitted/unpushed for review. Deployment remains blocked until the consolidated final acceptance gate.


## 2026-10-05 LF-03 verified / Final Acceptance activated

**LF-03 — VERIFIED**

Remote accepted commit: `02b8b254ebc5d44b68ac24a1597a7ce6333a1d13` (`feat: complete policy to AI continuity`).

Acceptance evidence:

- 58 focused TypeScript tests passed;
- 42 focused legal-service tests passed;
- 499 chatbot standard unit tests passed;
- production build passed;
- changed-file Biome passed;
- `git diff --check` passed;
- browser smoke passed for one-time launch, refresh idempotence, no automatic model call, bilingual opener, chat-boundary clearing, desktop shell and 390px mobile width.

**FINAL ACCEPTANCE — ACTIVE**

Freeze feature work. Run one consolidated product gate across LF-01/LF-02/LF-03.

The first mandatory item is to start the real local legal-service and close the remaining policy-linked E2E gap: submit a real user question from a policy-launched chat and verify the normal answer path and answer-associated citations/source behavior.

Then validate the whole customer matrix, full automated checks, responsive/bilingual presentation, human-service continuity, and security/provenance invariants.

Deployment is not yet authorised by this milestone. Record a PASS decision first; only then use the current canonical repository deployment procedure and perform one production smoke.



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
owner local validation and staging revalidation all PASS. Its detailed staging
record is in `docs/agent-memory/tasks/PI-RR-02-GUIDANCE-CONTRACT.md`.

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

## 2026-10-13 Phase 12 Stage 3 — owner-host correction R4 (worktree only)

Owner-host browser acceptance found two product inconsistencies and one noisy Node warning; all three are resolved in the uncommitted Stage 3 worktree without changing Stage 3 scope, security rules or D-070 authority:

- **D-071:** durable published policies and the bundled compatibility registry now coexist on `/intelligence` (durable precedence by slug; withdrawn durable never resurrected by compatibility fallback; draft-only durable keeps the compatibility card; no duplicate cards) and the Admin page lists both sources with storage/provenance plus a controlled, idempotent import that creates a Policy Editor draft and never publishes by itself.
- **Copy:** the stale "administrator role alone does not confer publication authority" wording is gone; the Admin/Policy-Editor UI now states the principal-lawyer model while keeping the verified-lawyer grant requirement for other staff (regression test added).
- **`TimeoutNegativeWarning`:** verified root cause is `postgres@3.4.5` reconnect backoff (`connection.js:353`) with a stale backoff window; upstream fix unreleased in 3.4.x; no suppression and no application defect.
- **Validation:** `pnpm test:unit` 849/849 pass; `pnpm build` pass; `tsc --noEmit` baseline unchanged; destructive Stage 3 PostgreSQL integration suite not run (isolated DB absent; creating databases out of scope).

## 2026-10-14 Phase 12 Stage 3 — D-072 publication gate rebaseline (worktree only)

Owner ruling: the AI must not hold subjective editorial veto authority over automatically discovered official policy updates (prolonged empty periods were a product failure). Implemented as a decision-contract replacement, not a threshold tweak:

- `evaluatePolicyPublicationDecision` — source identity is the only blocker; relevance classification, status certainty, verifier disagreement, partial interpretations and evidence truncation are advisories that may withhold individual unsupported prose units or downgrade an unverifiable status to the honest `unknown`.
- Source-first fallback (`contentKind = "source_first"`, no fabricated analysis, verbatim official excerpt, explicit "AI analysis pending" notice, honest status) for analyzer outage/malformed output and unusable verification; later analysis enriches the same item without duplicates; provider-disabled runs still fail explicitly.
- Observability splits releases (full analysis vs source-first) from technical holds and lists advisory signals; new regression suite `lib/policy-intelligence/publication-policy.test.ts` plus rewritten pipeline/diagnostics/admin/editorial expectations.
- Validation: `pnpm test:unit` 863/863 pass; `pnpm build` exit 0; `tsc --noEmit` 44 (below the 45 pre-task baseline); no migration; nothing committed or pushed.

## 2026-10-14 Phase 12 Stage 3 — D-073 minimal structural exclusion + default publication (worktree only)

Owner ruling: minimal structural exclusion, default publication, lawyer final authority; no complex automated editorial screening.

- Public visibility: `getPolicyPresentationGroup` is total with three visible groups — `published`, `proposed`, new `official_update` (enacted_not_commenced, superseded, withdrawn, unknown, future unmapped). `/intelligence` renders the third group, the filter offers it, and the badge shows the precise honest status (never "in force" for unverified legal effect). No taxonomy/migration change.
- Discovery: structural-only exclusion of presentation components (nav/header/footer regions, presentation class/id/data tokens, presentational ARIA roles, aria-hidden anchors, fragment/javascript hrefs, and source-provided alert `type`/`category` naming a display component). Titles/candidate text, AI opinions, uncertainty, proposed status and low importance never exclude anything; destinations are never blacklisted and remain discoverable via substantive references.
- Source-first fingerprint identity = snapshot + content kind; the AI failure reason is diagnostic metadata (no duplicate notice for the same snapshot across differing failure reasons; later successful analysis still enriches).
- Recoverable typed provider/model failures keep the source-first fallback; `analysis_internal_error` and plain untyped exceptions remain genuine engineering failures (no silent fallback publication).
- Validation: `pnpm test:unit` 869/869 pass (0 skip), `pnpm build` exit 0, `tsc --noEmit` 44 (below the 45 baseline); no migration; nothing committed or pushed.

### 2026-10-14 D-073 owner-host correction — Admin Archive/Unpublish `validation_failed` (worktree only)

- Defect: the Admin PATCH route forwarded its routing field `action` into the strict archive/restore schemas (`{ itemId, reason? }` / `{ itemId }`), so every Admin archive/restore returned `400 validation_failed` before authorization/service/audit; the tested legacy `handleAdminPolicyIntelligenceUpdate` is not route-wired, which hid the bug from the suite. The Policy Editor routes were unaffected.
- Fix: new exported `handleAdminPolicyItemAction` (`lib/policy-intelligence/editorial-api.ts`) validates the Admin payload once with a strict discriminated union and forwards only the handler payload; `app/api/admin/policy-intelligence/route.ts` delegates. Comment-only note added in `admin-api.ts`. Two focused regression tests in `editorial-api.test.ts` (root-cause guard + authorized archive/restore with audit/protection/history assertions + strictness/authorization/cross-site rejections).
- Validation: `pnpm test:unit` 871/871 pass (0 skip), `pnpm build` exit 0, `tsc --noEmit` 44 (below the 45 baseline), Biome clean; no migration; nothing committed or pushed.
- Owner retry steps recorded in `CURRENT_HANDOFF.md` (archive → disappears from `/intelligence` → restore).

### 2026-10-14 Publish Official Source — lawyer direct publication of a stored official snapshot (worktree only)

- Gap: a real sync left snapshot-only items (e.g. `Migration (Student Visa Applications to Be Made from outside Australia) Instrument 2026`) in `draft` with `analysis_revision_unavailable`; Force Publish required an AI revision, so the principal lawyer could not publish an authentic official source.
- Feature: `publishOfficialSource` in the editorial service publishes the item's persisted official snapshot through D-072's `source_first` representation (no AI/analyzer/verifier/gate), sets `human_protected` in the same transaction, keeps the honest `unknown` status when legal effect is unestablished, and appends a `publish_official_source` audit event. Idempotent per (item, snapshot) with no duplicate revision/audit; archived items are refused; missing snapshot is a controlled 400.
- API/UI: `PATCH /api/admin/policy-intelligence` `{ itemId, action: "publish_source" }` and `POST /api/policy-editor/publish-source`; Admin row button **Publish Official Source / 发布官方来源** with an inline confirmation.
- Validation: `pnpm test:unit` 877/877 pass (0 skip, 6 new focused tests), `pnpm build` exit 0, `tsc --noEmit` 44 (below the 45 baseline), Biome clean; no migration, no new table, no live sync, no paid call, no DB mutation; nothing committed or pushed.
