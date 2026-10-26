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
## M2 accelerated Round 1 dispatched — A1.3 application adapter + M2-C provisional requirements (2026-10-26)

- Owner pushed A1.3 R1 at `98678ba19806f2e3f916725b8bbcb0abf7b14c07`; ChatGPT independently verified exact GitHub branch HEAD and 19 changed files. Owner Ubuntu reported 964/964 full unit plus separate A1.3 HTTP 17/17 and UI 5/5 (React UI suite must run without `react-server`); worktree and remote status matched. Accepted as **offline HTTP/UI** only; trusted-live runtime stays `application:null`, readiness false.
- Under owner-requested rapid M2 closeout, architect froze a consolidated two-workstream task: `tasks/PHASE13_M2_ROUND1_A13_ADAPTER_C_REQUIREMENTS_2026_10_26.md`. Workstream A: typed A1.3/A1.1 Postgres application adapter with fake conditional object storage, current membership/creator grants, exact-byte scans, durable import consent or explicit fail-closed; no production activation. Workstream C: four-family **provisional** versioned requirement registry, Project-scoped collection state/events and independently reviewed proposed additive 0034 migration **source authoring only**. Single cumulative uncommitted patch and independent review.
- No AWS, credentials, deployment, migration in ordinary/staging/prod DB, real customer file processing, lawyer approval, staff or AI-context grant. No runtime enablement. M2 remains OPEN; Round 2 A2/B and Round 3 D + offline acceptance outstanding.
<!-- END PHASE13_M2_ROUND1_A_C_DISPATCH_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_3_IMPLEMENTED_2026_10_26 -->
## CURRENT HANDOFF — A1.3 R1 corrections implemented; independent review pending (2026-10-26)

- Implemented the injected customer-document HTTP seam and route modules for bounded list/upload, consent receipt/import, metadata/status, exact-version download, withdrawal and creator-grant revocation. The handlers derive actor identity only from the authenticated session; require registered accounts, current app-layer Project/grant authorization, operation IDs/revisions, purpose-scoped app methods, per-actor/project rate checks, bounded bodies/content validation, private no-store responses and sanitized errors. Download additionally requires the app's exact-version clean authorization and verifies SHA-256/byte length before returning bytes.
- Import requires a versioned server-issued acknowledgement bound by the application layer to authenticated actor/source context; a browser boolean by itself is rejected. UI is bilingual and integrated into the selected Project panel, has no sample records, and defaults to no actions. Its gated view supports metadata/status, upload/import consent, download and withdrawal flows.
- R1-01 validates upload/import/withdrawal/grant-revocation application results at runtime and serializes only allowlisted response fields. Private storage keys, internal scan metadata and provider identifiers are stripped; malformed or mismatched result identities fail closed. Identical replay status and public replay fields remain intact. R1-02 remounts the panel on Project or enabled-state changes, clears rows before refresh and guards all fetch state updates with a per-instance generation; a stale Project A response cannot overwrite Project B, and failed B loads remain empty.
- **Runtime status:** `PHASE13_PROJECT_DOCUMENTS_ENABLED` defaults off, and independently `trustedLiveReadiness` is hard false while no production verifier/readiness provider exists; the runtime's application adapter is null. Enabling the flag alone cannot activate handling. Therefore real upload/import/list/download/withdraw routes return 503. Durable Project/membership/grant enforcement, consent receipt issuance/verification, S3 persistence/finalization and exact trusted B3 scan proof remain required capabilities of the future application adapter; no A1.0 in-memory repository is cast to the A1.1 PostgreSQL contract. No feature flag, boolean or synthetic scan is represented as production consent/trust.
- Validation: A1.3 HTTP **17/17**, client UI **5/5**, existing Project Document service **21/21**. Full `pnpm test:unit`: **113/116 passed, 3 failed, 0 skipped**. Failures: `s3-preflight-cli.test.ts` received empty child stderr rather than the missing-config message; `stage3-hardening.test.ts` returned 1 rather than expected 2 with empty `POSTGRES_URL`; three loopback tests in `server-http-timeouts.test.ts` failed with `listen EPERM` on `127.0.0.1`. TypeScript: **44 diagnostics, none in changed paths**. Changed-file Biome and whitespace checks passed.
- No PostgreSQL integration was run; no AWS/API/credentials/S3/SQS, real customer files, production database, migration or deployment was accessed. The work remains uncommitted and unpushed. **R1 corrections are pending independent review, not accepted.** Cumulative patch: `~/phase13_m2_a1_3_R1_review.patch`; SHA-256 is reported with the final handoff.
- Recommended next step: implement and independently review the server-only A1.1/A1.2/B3 application adapter plus authenticated durable consent and B2 producer-authentication/privacy readiness providers; keep runtime disabled until those gates and owner approval are satisfied.
<!-- END PHASE13_M2_A1_3_IMPLEMENTED_2026_10_26 -->

<!-- BEGIN PHASE13_B3_ACCEPTED_A1_3_DISPATCH_2026_10_26 -->
## CURRENT HANDOFF — B3 offline accepted; A1.3 offline customer API/UI contracted (2026-10-26)

- **Accepted B3 R1 owner commit:** `a14d53227003a1f9bf41bc86688995deaf63daac` on `phase13-study-journey-project-centric`; owner `git rev-parse HEAD` and `git ls-remote` matched this SHA with clean status. ChatGPT independently fetched remote GitHub branch and commit, confirming 10 reviewed B3 R1 files. Owner-host `pnpm test:unit` **964 passed / 0 failed / 0 skipped** (`UNIT_TEST_EXIT=0`), and the separately invoked B3 worker + guarded PostgreSQL tests **12 passed / 0 failed / 0 skipped** (`B3_TEST_EXIT=0`). ChatGPT independently reviewed R1 correction; **B3 offline implementation ACCEPTED**, **not** B3 live/overall A1.2/M2 production acceptance.
- **Known constraints:** Real GuardDuty/EventBridge provenance independent authentication, production SQS transport/attestation issuer, B2-1 live collector run, live remediation and durable FAILED/SKIPPED scan-state treatment remain unresolved; **LIVE NO_GO**. The earlier synthetic AWS Console demo succeeded but all disposable AWS assets were deleted. Host A1.1 full PostgreSQL empty-schema integration remains **UNVERIFIED** because existing disposable DB is not empty; don't reset it.
- **Next Codex task:** one default-OFF **A1.3 offline API/UI** slice specified in `tasks/PHASE13_M2_A1_3_CUSTOMER_DOCUMENT_API_UI_OFFLINE_CONTRACT_2026_10_26.md` and `tasks/PHASE13_M2_A1_3_CODEX_IMPLEMENTATION_PACKET_2026_10_26.md`, using original Project/membership/document boundaries and exact source Chat consent. No live AWS/customer files, deployment, production DB or migration; independent review on cumulative uncommitted patch. A1.3 runtime cannot be enabled merely from a flag without B2 evidence and owner privacy/retention signoff.
- **M2 OPEN:** after A1.3 offline work, continue M2-B fact assertions/confirmation/publication and AI-use grants; M2-C provisional versioned requirements; M2-D cross-Chat server-scoped resolver and final end-to-end acceptance. Never claim M2 done from B3 alone.
<!-- END PHASE13_B3_ACCEPTED_A1_3_DISPATCH_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B3_IMPLEMENTED_2026_10_26 -->
## CURRENT_HANDOFF — B3 R1 corrections implemented; independent review pending (2026-10-26)

- R1-01 moved B3 transaction/ACK coverage into its separate guarded integration test and restored the A1.1 scan-attestation test's original same-attestation replay sequence. B3 PostgreSQL coverage simulates ACK failure after commit, replays the identical attestation, then submits a changed body fingerprint under the same event ID. The altered attestation conflicts; final audit asserts one scan run, one scan operation, one security event and one project revision increment.
- R1-02 validates finalizer response shape and exact project/version/generation, candidate verdict, security status, positive revision, operation ID and replay boolean before ACK. Adversarial fakes cover mismatched IDs/generation/verdict/status and malformed output; these outcomes quarantine without ACK.
- R1-03 preserves A1.2-A scan semantics. `FAILED/FAILED`, `FAILED/ACCESS_DENIED`, `SKIPPED/UNSUPPORTED` and `SKIPPED/ACCESS_DENIED` remain unavailable candidates: B3 retries without clean promotion or ACK, then defers to SQS redrive/DLQ at the configured attempt bound. Invalid pairs such as `COMPLETED/ACCESS_DENIED` quarantine. Failed/skipped scan outcomes are **not durably recorded** in A1.1; recording them would require a separately reviewed extension to the accepted attestation contract. No A1.2-A trust semantics were broadened.
- Validation: B3 worker **11/11**, guarded B3 PostgreSQL integration **1/1**, A1.1 service **21/21**, A1.2-A **17/17**, B1 **11/11**, B2-0 **16/16**. Full `pnpm test:unit`: **113/116 passed, 3 failed, 0 skipped**. Failures: `s3-preflight-cli.test.ts` received empty child stderr instead of missing-config text; `stage3-hardening.test.ts` returned 1 instead of expected 2 with empty `POSTGRES_URL`; three `server-http-timeouts.test.ts` cases failed loopback bind with `listen EPERM`. TypeScript reports **44 existing diagnostics**, none in changed paths. Biome and whitespace checks passed.
- The guarded B3 PostgreSQL test verified the exact disposable database identity, applied no migration/reset, and left uniquely labeled synthetic audit fixtures there. The A1.1 PostgreSQL integration is **UNVERIFIED**: its empty-schema precondition is not satisfied by the existing test DB (previously verified with 48 public tables); the sandbox attempt failed `EPERM` before connecting. No reset or separate database was prepared. No AWS API/profile/credentials, S3/SQS, production DB, deployment or customer data was accessed. Live readiness remains `NO_GO`.
- Changes remain uncommitted/unpushed. Patch: `~/phase13_m2_a1_2_B3_R1_review.patch`. **R1 implementation pending independent review, not accepted.** Independent producer authentication and reviewed production transport/attestation issuance remain blocked; any live run needs separate owner authorization. A1.3 and M2-B/C/D remain separate.
<!-- END PHASE13_M2_A1_2_B3_IMPLEMENTED_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B3_OFFLINE_DISPATCH_2026_10_26 -->
## CURRENT_HANDOFF — B3 rapid offline queue-to-PG integration contracted (2026-10-26)

- Owner explicitly requested **expedited B3 development** to progress Phase 13 M2. Architect prepared `tasks/PHASE13_M2_A1_2_B3_RAPID_INTEGRATION_CONTRACT_2026_10_26.md`, Codex implementation packet `tasks/PHASE13_M2_A1_2_B3_CODEX_IMPLEMENTATION_PACKET_2026_10_26.md`, and `tasks/PHASE13_M2_RAPID_CLOSEOUT_PATH_2026_10_26.md`. New contract permits **offline code and guarded synthetic disposable-DB tests only**, not production or cloud operations.
- Base remote HEAD `7a078ed329a775e788941a44ac3809ca18da34f1`. Previously owner-run shared-account disposable AWS demonstration succeeded for synthetic TXT+folder marker (`COMPLETED/NO_THREATS_FOUND`, matched S3 Version ID), and owner deleted GuardDuty/SQS/EventBridge/S3/IAM test assets; not a B2 live provenance approval. B2-1 operator collector not executed.
- Current A1.1 `PostgresProjectDocumentRepository.finalizeScan()` already includes atomic ProjectOperation/ProjectEvent/ProcessingRun audit and provider-event uniqueness; A1.2-A provides body-bound scan context, strict GuardDuty parser and exact S3 version/sha256 read; B1 provides pure ack/retry planner. B3 coding should integrate these rather than inventing another ledger. Never mint trusted delivery from `source` JSON, queue ID or raw policy.
- Next: owner fast-forwards this docs-only change; dispatch Codex with new implementation packet; Codex leaves cumulative B3 patch **uncommitted/unpushed** for independent review. No real AWS/SQS/S3, production DB/credentials, new migration, deployment or customer files authorized. B3 offline completion does **not** close M2; remaining A1.3, M2-B (facts), M2-C (requirements), M2-D (cross-Chat resolver) tracked explicitly. Feature flags default-off and live readiness `NO_GO`.
<!-- END PHASE13_M2_A1_2_B3_OFFLINE_DISPATCH_2026_10_26 -->

<!-- BEGIN PHASE13_SHARED_ACCOUNT_SYNTHETIC_AWS_PILOT_2026_10_26 -->
## Current handoff — Phase 13 operator-led disposable AWS scan pilot completed and resources deleted (2026-10-26)

- **Nature of evidence:** Owner performed a small, manual **shared-AWS-account** synthetic experiment through the AWS Console in `ap-southeast-2`. This is empirical GuardDuty/EventBridge/SQS behavior, **not** execution or acceptance of the gated B2-1 live AWS CLI collector, and **not** the independently scoped sandbox/mutating B2-2 milestone sign-off. Existing staging/production resources were not intentionally changed. No assistant-side AWS API access or project code changes occurred.
- **Setup observed in owner screenshots:** temporary private versioned SSE-S3 bucket `phase13-sbx-documents-test`, GuardDuty Malware Protection S3 test plan `14d0bb07810c52250395` active for `project-document/` with no object tagging and a temporary GuardDuty role/policy; default Classic EventBridge rule `phase13-b2-guardduty-scan-events` matching `aws.guardduty`, detail type `GuardDuty Malware Protection Object Scan Result`, account `747452892291`, region `ap-southeast-2`, and exact test plan ARN. It targeted SSE-SQS standard queue `phase13-b2-scan-events` and configured its main-queue redrive to `phase13-b2-scan-dlq` (maxReceiveCount 3). SQS resource policy allowed `events.amazonaws.com` `sqs:SendMessage` constrained by exact rule `aws:SourceArn`; no `aws:SourceAccount` condition was observed.
- **Real synthetic result:** owner uploaded a **58-byte, non-customer** TXT to `project-document/phase13-guardduty-test.txt` and manually inspected **two** delivered SQS message bodies: one for the TXT, one for the 0-byte S3 folder marker `project-document/`. Both were `scanStatus=COMPLETED`, `scanResultStatus=NO_THREATS_FOUND`, and contained the exact test GuardDuty plan ARN. The TXT event `s3ObjectDetails.versionId=CAcfPnJqli4jMmDxNN68geUU6dnmklRL` matched the version subsequently checked by the owner in S3. This demonstrates the **observed** S3 -> GuardDuty -> EventBridge -> SQS path for synthetic objects, not cryptographic producer provenance or independently recomputed byte-level SHA-256. SQS receive counts reached two; no B3 consumer/ACK/DB bridge was exercised.
- **Cleanup confirmed by owner's Console screenshots:** GuardDuty disabled/deleted test plan (staging plan still active); test EventBridge rule removed (default bus and two pre-existing staging rules intact); both `phase13-b2-` SQS queues removed (original staging queues intact); dedicated `Phase13GuardDutyS3TestRole` deleted; separate customer-managed `GuardDutyS3MalwareProtectionPolicy-phase13-...` reported deleted by AWS; S3 Empty Bucket succeeded (3 records, 58 bytes, 0 failures) and bucket deletion succeeded (original staging/localtest buckets remain). No disposable test infrastructure is intentionally left. **Billing/Cost Explorer settlement is not yet verified** and historical usage can appear later.
- **Milestone boundaries and next:** Accepted B2-1 OFFLINE source remains `e4d80cff45236e616bb03107269c055aaafb2638`, final docs `a268dce38b48edce2ab3ad87bbf8cbd57c85b953`. The currently frozen executor **requires `environment: isolated_sandbox` and a verified named SSO profile**: do **not** bypass it by mislabeling the shared production account. Before another live collector run, architect must explicitly revise scope/contract and test a bounded shared-account path or provision genuine isolated sandbox, then review patches and separately authorize cloud access. Since test resources were deleted, live rechecks require separately authorized recreated resources. Keep `NO_GO`, no trusted GuardDuty context, no `finalizeScan()`, no B3 / customer APIs / M2 acceptance. Next non-cloud task: agree scope and prioritize next milestone; separately check delayed AWS billing.
<!-- END PHASE13_SHARED_ACCOUNT_SYNTHETIC_AWS_PILOT_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_1_OFFLINE_ACCEPTED_2026_10_26 -->
## Current handoff — B2-1 gated AWS read-only executor OFFLINE IMPLEMENTATION ACCEPTED (2026-10-26)

- **Accepted code commit:** `e4d80cff45236e616bb03107269c055aaafb2638` on `phase13-study-journey-project-centric`; operator demonstrated local HEAD, successful `git push`, and `git ls-remote` with matching SHA and clean worktree. ChatGPT independently fetched matching remote GitHub branch HEAD and verified exactly 12 changed files in the commit. Frozen architecture baseline `a8f2e36053987c045b8105a148e9d67497ec0c6a`.
- **Review:** ChatGPT independently reviewed cumulative B2-1/R1/R2 patch; R1 repaired official GuardDuty `GetMalwareProtectionPlan` response compatibility, per-request expiry enforcement and nonzero failure outcomes; R2 repaired Node `execFile` numeric exit-code classification to distinguish AccessDenied, missing resources and subprocess faults. Final source review accepted for bounded, gated, operator-only **read-only implementation**, not a cloud deployment. B2-0 offline plan/refusal preserved; no trusted scan/finalization.
- **Test evidence:** Codex reported B2-1 fake-only **28/28**, B2-0 **16/16**, B1 evaluator **16/16**, B1 queue **11/11**, A1.2-A adapter **17/17**, all zero failures/skips; changed-file Biome/whitespace passed; 44 pre-existing TypeScript diagnostics in unchanged files. Owner later ran `cd chatbot && pnpm test:unit` on Ubuntu host: **964 passed, 0 failed, 0 skipped, TEST_EXIT=0** and unchanged base HEAD before commit. The `pnpm test:unit` script enumerates tests explicitly and **does not include** `b2-live-executor.test.ts`; the dedicated B2-1 28/28 tests are currently supported by Codex's separate report, not the owner's 964 test run. Previous 3 file failures were present only in restricted Codex test environment.
- **Security/readiness:** No real AWS STS or other API, real profile, credentials, customer documents, PostgreSQL, migration, S3 scan, GuardDuty enrollment, SQS receive, B3 trust bridge or deployment has been authorized/executed as part of B2-1. Live readiness unconditionally `NO_GO`, features default-off. Approval records are self-attested workflow checks, not verified IAM/consent.
- **Next:** owner fast-forwards to this docs-only acceptance commit; optionally reruns B2-1 focused fake tests on host for independent test confirmation. Prepare a **separately approved** isolated nonproduction Sandbox account/profile/region, exact expected caller ARN and resource selectors; owner approves a bounded live **read-only** run, or records absent infrastructure and decides whether B2-2 needs separate security, privacy, cost and change authorization. Do not treat `aulawyers-staging` as sandbox by default. B2-2 mutating/paid scans, B3 trusted SQS worker/finalizeScan, A1.3 customer API, and M2-A1.2 / overall M2 are NOT ACCEPTED or authorized.
<!-- END PHASE13_M2_A1_2_B2_1_OFFLINE_ACCEPTED_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_1_R2_2026_10_26 -->
## Current handoff — B2-1 R2 correction implemented; final independent review pending (2026-10-26)

- Preserved the uncommitted B2-1/R1 worktree at base HEAD `a8f2e36053987c045b8105a148e9d67497ec0c6a`. R2 fixes Node `execFile()` result normalization: numeric nonzero exit codes and bounded stderr are retained for safe AWS service-error classification; AccessDenied and NoSuchBucket are distinct from timeout, abort, executable-not-found, output-limit and unexpected subprocess failures. Typed reports do not expose raw stderr. R1 fixes remain: GuardDuty response-schema validation without an invented response PlanId, per-request approval-expiry checks, and explicit CLI report/identity/collection outcomes.
- Focused offline suites: B2-1 **28/28**, B2-0 **16/16**, B1 evaluator **16/16**, B1 queue **11/11**, A1.2-A adapters **17/17**; no failures or skips. Full `pnpm test:unit`: **113/116 files passed, 3 failed, 0 skipped**. Failures: `s3-preflight-cli.test.ts` received empty child stderr instead of the missing-config message; `stage3-hardening.test.ts` returned CLI status 1 instead of expected 2 for empty `POSTGRES_URL`; `server-http-timeouts.test.ts` loopback bind failed with `EPERM` on `127.0.0.1`. TypeScript reports 44 diagnostics in unchanged files and none in changed B2-1 paths. Changed-file Biome and whitespace checks passed.
- No AWS CLI/API/profile, credentials, PostgreSQL, migration, S3/SQS, deployment, customer data, feature toggle, commit or push was used/changed. Live observations remain `NO_GO`; this is not an acceptance claim.
- Cumulative R2 review patch: `~/phase13_m2_a1_2_B2_1_R2_review.patch`. Stop uncommitted and unpushed for final independent review.

<!-- END PHASE13_M2_A1_2_B2_1_R2_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_1_IMPLEMENTED_2026_10_26 -->
## Historical handoff — B2-1 initial implementation before R1/R2 corrections (2026-10-26)

This checkpoint is retained for implementation history; the authoritative current status and validation are in the R2 section above.

- Implemented on `phase13-study-journey-project-centric` from expected starting HEAD `a8f2e36053987c045b8105a148e9d67497ec0c6a`; work remains uncommitted and unpushed. B2-0 plan, help and real-collection refusal behavior remain intact.
- Added a separate operator entry, injected AWS CLI v2 argument-vector executor, strict scope/approval/SSO preflight, STS-first exact account/caller verification, fixed B2-0 primary allowlist, bounded pagination and dependent IAM reads, response/deadline/call limits, typed redacted failures, live finding provenance, and sanitized external 0600 NO_GO reports. Local approval remains self-attested; this implementation does not claim verified production consent or create trusted scan capability.
- Offline validation: B2-1 **23/23**, B2-0 **16/16**, B1 evaluator **16/16**, B1 queue **11/11**, A1.2-A adapters **17/17**; all focused suites had zero failures/skips. `pnpm test:unit`: **113/116 files passed, 3 failed, 0 skipped**. Two unchanged subprocess CLI checks failed their expected output/status; three loopback checks were denied with `listen EPERM` on `127.0.0.1`. The subprocess failures and loopback restriction are unrelated to changed files. Changed-source Biome passed. TypeScript reports 44 diagnostics in unchanged files and none in B2-1 paths. Whitespace checks passed.
- No AWS API/STS call, AWS profile invocation, credentials inspection, database connection/change, migration, deployment, customer file access, feature change, commit or push occurred. No real AWS experiment was conducted.
- Cumulative review patch: `~/phase13_m2_a1_2_B2_1_review.patch`. **B2-1 implementation pending independent source review.** B2-2, B3, A1.3, live AWS access and overall M2 acceptance remain separately gated.

<!-- END PHASE13_M2_A1_2_B2_1_IMPLEMENTED_2026_10_26 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_1_ARCHITECT_2026_10_26 -->
## Current handoff — B2-1 narrow real AWS read-only executor architecture frozen (2026-10-26)

- Owner reported local `git pull --ff-only` to accepted B2-0 docs HEAD `1fc3820b440fe1e74edbd4b24218d7717f61e234`, clean worktree. GitHub rechecked same remote branch HEAD.
- Architect-frozen docs-only B2-1 contract: `tasks/PHASE13_M2_A1_2_B2_1_LIVE_READONLY_EXECUTOR_CONTRACT.md` and bounded Codex packet `tasks/PHASE13_M2_A1_2_B2_1_CODEX_IMPLEMENTATION_PACKET.md`. New independent B2-1 operator-only AWS CLI executor + sanitized live observation path; existing B2-0 offline plan/refusal unchanged. No code implemented yet.
- **Next:** owner pulls this documentation commit, then may dispatch **offline fake-only Codex coding**; Codex must not call real AWS or touch credentials. ChatGPT independently reviews uncommitted patch. Real AWS read-only collection requires a later **separate** named sandbox account/profile/region/resource owner authorization and reviewed source. Staging != automatically sandbox.
- No customer file, AWS API, STS, S3 scan, SQS Worker, Postgres, migration, code, deployment or production feature was changed/authorized by this documentation checkpoint. B2-2, B3, A1.3 and overall A1.2/M2 remain unapproved or not accepted; live `NO_GO` and default-off.
<!-- END PHASE13_M2_A1_2_B2_1_ARCHITECT_2026_10_26 -->

# CURRENT_HANDOFF
<!-- BEGIN PHASE13_M2_A1_2_B2_0_ACCEPTED_2026_10_25 -->
## Current handoff — M2-A1.2-B2-0 offline AWS security evidence harness ACCEPTED (2026-10-25)

- **Accepted implementation:** `3f2b8744bc4ba6b99d5d2339eac1f16c5a31c33e` on `phase13-study-journey-project-centric`. User demonstrated matching local and remote SHAs, clean working tree; ChatGPT independently verified remote GitHub HEAD and the exact 15 reviewed changed files. This acceptance record supersedes the earlier *review pending* historical text retained below.
- **Bounded functionality accepted:** server/operator-only, default-offline redacted B2 AWS security plan/harness, exact resource identity and STS-first check **in injected offline fixtures**, IAM/SQS/EventBridge/GuardDuty/S3 static evidence and B1 evaluator bridge; R1 corrections account for IAM wildcard `*`/`?` actions, extra SQS Allow or Deny and unsafe EventBridge Target `Input`/`InputPath`/`InputTransformer` and unreviewed metadata. Live outcome always `NO_GO`. `collect-read-only` explicitly exits at authorization gate, with **no production AWS executor, credentials lookup, real STS call, AWS network, scan, SQS worker or A1.1 finalizeScan integration**. No PostgreSQL or customer data access.
- **Validation evidence:** Codex-reported B2 harness **16/16**, B1 evaluator **16/16**, B1 queue **11/11**, A1.2-A adapters **17/17**, full local unit **964/964** zero failures/skips (earlier 3 files **24/24** passed outside restricted sandbox). Changed-file Biome and whitespace passed; TypeScript remained 44 pre-existing diagnostics with none in B2 paths. ChatGPT independently reviewed cumulative R1 patch; did not independently rerun local tests.
- **Next gated B2-1:** architect/operator must approve a specific nonproduction profile, 12-digit account, region, partition, named resource selectors, explicit short-lived read-only change authorization and separately source-review a **new** narrowly scoped read-only executor before any AWS request. No account identifiers/secrets/policies in public handoff. If AWS resources are absent, report missing and seek separate B2-2 infrastructure/synthetic-scan cost/privacy/retention approval. **B2-1 live execution, B2-2 mutations/paid scans, B3 trusted worker/persistence, customer APIs and deployment all NOT AUTHORIZED.** M2-A1.2 and overall M2 remain NOT ACCEPTED; feature flags off.

<!-- END PHASE13_M2_A1_2_B2_0_ACCEPTED_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_0_R1_SECURITY_EVIDENCE_2026_10_25 -->
## Current handoff — B2-0 R1 static security evidence corrections implemented, review pending (2026-10-25)

- Preserved the full B2-0 worktree on `phase13-study-journey-project-centric` at base HEAD `be91595757cd2b6d07067b15280b1b93f2bdb6f2`. Queue-policy analysis now recognizes bounded IAM `*`/`?` matching and fails or returns incomplete for additional matching Allow statements, unsupported patterns, broad principals and matching explicit Deny statements. EventBridge target analysis requires one exact queue target with only reviewed `Arn`/optional `Id`; `Input`, `InputPath`, `InputTransformer`, malformed targets and unexpected target metadata cannot PASS. Overall live readiness remains `NO_GO`.
- Focused B2 harness **16/16**, B1 evaluator **16/16**, B1 queue disposition **11/11**, and A1.2-A adapters **17/17** passed (zero failures/skips). Complete `pnpm test:unit` passed **964/964**, zero failures/skips, in the approved local execution context. The three previously failing files passed separately **24/24** there. Initial sandbox failures were subprocess/loopback restrictions: `tsx` IPC creation returned `listen EPERM` on `/tmp/tsx-1000/16.pipe`, loopback listeners returned `EPERM`, and the S3 child assertion saw empty stderr. The migration-preflight test supplies `POSTGRES_URL=""` and exits before PostgreSQL client construction; the unit script excludes DB integration files. No AWS calls or database changes/connections were made.
- Biome passed on the two R1-edited TypeScript files; the repository TypeScript check still reports **44 existing diagnostics**, with none in B2 files. `git diff --check` and untracked whitespace validation passed. The cumulative review patch is `~/phase13_m2_a1_2_B2_0_R1_review.patch`; changes remain uncommitted and unpushed.
- **B2-0 remains REVIEW PENDING.** B2-1, B2-2 and B3 remain separately gated and unauthorized; A1.2 and overall M2 remain NOT ACCEPTED. Stop for independent review.

<!-- END PHASE13_M2_A1_2_B2_0_R1_SECURITY_EVIDENCE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_0_IMPLEMENTED_2026_10_25 -->
## Current handoff — M2-A1.2-B2-0 offline AWS evidence harness implemented, independent review pending (2026-10-25)

- Implemented from required branch `phase13-study-journey-project-centric`, starting HEAD `be91595757cd2b6d07067b15280b1b93f2bdb6f2`; all changes remain uncommitted and unpushed. The CLI defaults to a redacted offline plan and refuses `collect-read-only` with a B2-1 authorization gate. No AWS SDK/CLI executor, credential lookup, database access, live collection or resource mutation was added.
- Added strict sandbox scope and time-bounded approval validation, a fixed read-only request plan, a fixture-only STS-first sequence with account-mismatch short-circuit, typed `phase13.project_document.aws_b2_observation.v1` findings, redacted fingerprints, and a provenance-checked adapter to the accepted B1 evaluator. Fixture and policy observations remain incomplete where effective IAM, EventBridge/SQS origin, database grants or live owner verification are not proven; overall decision is always `NO_GO`. No `TrustedScanDeliveryContext` is created.
- Added the B2 live-read-only owner runbook and appended the B2-0 status/checklist without modifying earlier milestone history. No migrations 0030–0033 or accepted A1.2-A/B1 transaction behavior were changed.
- Validation: B2 harness **14/14**, B1 evaluator **16/16**, B1 queue **11/11**, A1.2-A AWS adapters **17/17**; zero failures/skips. Changed-source Biome passed on 10 TypeScript files; TypeScript still has **44 existing repository diagnostics**, with none on changed paths. `git diff --check` and untracked-file whitespace validation passed. Full `pnpm test:unit` reported **113/116 test files passed, 3 failed, 0 skipped**: the S3 preflight subprocess returned empty stderr, the migration-preflight subprocess exited 1 instead of the expected 2, and three loopback tests failed to bind with `EPERM`. No AWS or PostgreSQL calls were made.
- The cumulative patch path is `~/phase13_m2_a1_2_B2_0_review.patch`; exact SHA-256 and changed-file inventory are in the final response. No migration 0034 or schema changes.
- **B2-0 remains REVIEW PENDING.** B2-1 live reads require separate owner authorization and source review; B2-2 paid/mutating trials and B3 worker/persistence remain unapproved. A1.2 and overall M2 remain NOT ACCEPTED. Stop for independent review.

<!-- END PHASE13_M2_A1_2_B2_0_IMPLEMENTED_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B2_ARCHITECT_2026_10_25 -->
## Current handoff — A1.2-B2 architect freeze, B2-0 bounded offline collector (2026-10-25)

- **Accepted baseline:** B1 implementation `91579b3713254e328ac10f54c87ccac9eff9307a`, accepted documentation checkpoint `d1f9c7788681d61a586c16c32530968d3d071244`, branch `phase13-study-journey-project-centric`. B1 migration 0033, A1.2-A adapter and B1 static evidence evaluator remain accepted. No real AWS proof.
- **Frozen B2 authority:** `tasks/PHASE13_M2_A1_2_B2_AWS_LIVE_EVIDENCE_ARCHITECTURE_CONTRACT.md`; Codex B2-0 task `tasks/PHASE13_M2_A1_2_B2_0_CODEX_IMPLEMENTATION_PACKET.md`. This supersedes older "B2 not authorized" status **only for B2-0 offline work**: exact-scoped, default-plan, mock-tested read-only AWS evidence harness and operator runbook. B2-1 actual read-only access requires separate owner profile/account/resource consent after source review; B2-2 synthetic uploads/scans and any infra creation require additional cost/privacy/retention approval; B3 trusted consumer/persistence remains prohibited.
- **Evidence policy:** operator-selected non-default AWS profile, pinned account+region+resource selectors, explicit STS-first verification, strictly allowlisted read-only calls, sanitized findings, incompleteness = NO_GO. No real AWS calls while Codex implements B2-0; no credential collection, database access, upload/scan, queue consume, API, or production flag. EventBridge V2's `aws.` service-reserved source semantics must not be misapplied to the classic default bus; direct SQS injection and privileged rule/queue mutation remain distinct risks.
- **Owner to do later:** sync architect docs, run Codex B2-0 then upload full patch; identify a **nonproduction** AWS profile/account/region and existing sandbox resources (or state absent). Do not send keys, tokens or raw IAM policies into chat. Source review before any live read-only collector invocation. B2 and full M2 NOT ACCEPTED.

<!-- END PHASE13_M2_A1_2_B2_ARCHITECT_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B1_ACCEPTED_2026_10_25 -->
## Current handoff — M2-A1.2-B1 durable audit and AWS security-readiness ACCEPTED (2026-10-25)

- **Accepted source commit:** `91579b3713254e328ac10f54c87ccac9eff9307a` on `phase13-study-journey-project-centric`. Owner demonstrated equal local HEAD and `git ls-remote` values and empty `git status --short`; ChatGPT independently verified GitHub remote HEAD and all **15 expected changed files**. This new acceptance supersedes the older implementation/review-pending notes below, which remain historical evidence.
- **Approved bounded B1 scope:** additive 0033 `0033_phase13_m2_a1_2_b1_audit_protection.sql` for guarded Project audit append-only/DELETE restrictions; preserves M1 invitation pre-event `ProjectOperation.resultKind/resultId` finalization and A1.1 `ProjectDocumentProcessingRun.started → completed/failed`; pure AWS static security-readiness evaluator and queue disposition protocol, plus operator checklist. Existing migrations 0030–0032 and accepted A1.2-A remain unchanged.
- **R1 accepted:** Queue ACK planner requires the accepted WeakMap-backed `TrustedScanDeliveryContext` matched to raw message bytes, not a forgeable string/cast; database commit/replay status remains a future **trusted integration assertion**. SQS grant static evaluation distinguishes IAM Principal categories and accepts only `Principal.Service = events.amazonaws.com` for EventBridge; it does not mistake AWS/Federated principals for the EventBridge service principal. Static AWS readiness remains unconditional **NO_GO** for live deployment.
- **Validation evidence:** Codex-reported guarded PostgreSQL M1.1 **10/10**, M2-A0 **3/3**, A1.1 **18/18**; B1-R1 pure queue **11/11**, evaluator **16/16**, accepted A1.2-A adapter **17/17**; full unit **964/964** was reported in B1 run (not rerun for R1). `pnpm db:check`, changed-file Biome, whitespace and unchanged TypeScript baseline of 44 pre-existing diagnostics reported PASS. Only reported migrated/reset DB `127.0.0.1:5432/immigration_ai_phase13_m1_1_test`; R1 performed no DB or AWS actions. ChatGPT independently source-reviewed cumulative R1 patch, did not rerun local tests.
- **Next gate:** B2 real AWS sandbox security and source-authenticity **architecture/owner approval first** (account/region/IAM, EventBridge `PutEvents` spoofing, dedicated SQS policy/DLQ/KMS, approved synthetic S3 object version, GuardDuty plan/event origin, exact bytes and database role/audit privileges, privacy/residency/retention/legal hold/cost). **No B2 AWS operation or B3 production trusted SQS worker/persistence authorized.** A1.2 overall and M2 remain **NOT ACCEPTED**, no customer documents, public APIs, AI context or feature activation.

<!-- END PHASE13_M2_A1_2_B1_ACCEPTED_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B1_R1_TRUST_BOUNDARY_2026_10_25 -->
## Current handoff — M2-A1.2-B1 R1 trust-boundary corrections implemented (2026-10-25)

- Preserved the uncommitted B1 implementation at starting HEAD `b18935f72cb92c7b6942833dbd98968072fcac13`; no reset, stash, commit or push. R1-01 replaces the forgeable queue proof string with A1.2-A's WeakMap-backed `TrustedScanDeliveryContext` check bound to the exact raw body. Missing, forged, cast, manually built and body-mismatched contexts deny delivery. Persistence commit/replay remains an explicitly unverified assertion from a future trusted integration; no SQS consumer or A1.1 persistence bridge exists.
- R1-02 preserves IAM Principal categories during policy evaluation. The EventBridge queue grant now requires exactly `Principal.Service = events.amazonaws.com`; `AWS`, `Federated`, mixed, unqualified and unsupported principal forms cannot pass. KMS assessment continues to accept required role ARNs only as `AWS` principals. Static readiness remains unconditional `NO_GO` pending B2.
- R1 queue tests **11/11**, evaluator tests **16/16**, existing A1.2-A adapter tests **17/17**, zero failures/skips. TypeScript diagnostics match starting HEAD at **44 pre-existing diagnostics**, with no changed-path diagnostics. Changed-source Biome and whitespace checks passed. No PostgreSQL or AWS access was needed for R1; prior guarded B1 database regression results remain recorded in the next historical block.
- B1 remains **REVIEW PENDING**; B2/B3 remain **NOT AUTHORIZED** and A1.2/M2 remain **NOT ACCEPTED**. Complete cumulative patch: `~/phase13_m2_a1_2_B1_R1_review.patch`. Stop for independent ChatGPT review.

<!-- END PHASE13_M2_A1_2_B1_R1_TRUST_BOUNDARY_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B1_IMPLEMENTATION_2026_10_25 -->
## Current handoff — M2-A1.2-B1 implemented; independent review pending (2026-10-25)

- Implemented from branch `phase13-study-journey-project-centric`, starting HEAD `b18935f72cb92c7b6942833dbd98968072fcac13`; all changes remain uncommitted and unpushed. Additive migration 0033 protects operation/event/processing-run audit rows while preserving the M1 membership-invitation pre-event finalization and accepted A1.1 run lifecycle. Migrations 0030–0032 were not edited.
- Static server-only AWS security evidence evaluation is bounded and fixture/operator-export only. It emits redacted PASS/FAIL/INCOMPLETE findings, rejects malformed or unsupported policy evidence, and always reports live `NO_GO` requiring owner verification. The pure queue planner denies missing transport proof, ACKs only committed or identical replay, retries transient failures within a supplied finite budget, and routes malformed/conflicting or exhausted deliveries without clean promotion. No trusted transport capability is minted and no A1.1 finalizer is called.
- Migration 0033 was applied and tested only through the guarded procedure against `127.0.0.1:5432/immigration_ai_phase13_m1_1_test`; verified identity was host `127.0.0.1`, port `5432`, exact database name, existing, with 48 public tables before the guarded reset/migration. The disposable target reached 34 migrations; no other database was touched.
- Final guarded PostgreSQL suites: M1.1 **10/10**, M2-A0 **3/3**, A1.1 **18/18**, zero failures/skips. B1 offline evaluator **14/14**, queue protocol **8/8**, existing A1.2-A AWS adapters **17/17**, and `pnpm test:unit` **964/964**, all zero failures/skips. `pnpm db:check` and changed-source Biome passed. TypeScript output matches starting HEAD exactly at **44 pre-existing diagnostics**, with none on changed paths; final whitespace checks passed.
- B1 remains **REVIEW PENDING**. Static evidence does not prove effective AWS permissions or GuardDuty origin; row triggers do not protect against owners/superusers, trigger disablement, `TRUNCATE`, DDL or restore. B2 live AWS verification and B3 trusted consumer/persistence remain **NOT AUTHORIZED**. A1.2 and overall M2 remain **NOT ACCEPTED**. No AWS calls/resources, routes, worker, customer files, activation, commit or push.
- Complete cumulative review patch: `~/phase13_m2_a1_2_B1_review.patch`. Stop for independent ChatGPT source review.

<!-- END PHASE13_M2_A1_2_B1_IMPLEMENTATION_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_B_ARCHITECT_FREEZE_2026_10_25 -->
## Current handoff — M2-A1.2-B architect freeze, B1 bounded implementation next (2026-10-25)

- **Accepted:** A1.2-A isolated default-off S3/GuardDuty offline adapter at `0209f718b7ec0eca9002b86fe36023ff905453b6`; subsequent acceptance-only docs baseline `ad688d4f9021d277c78078fc8af85e2e588c06b6`. No A1.2-B code accepted, and no live AWS authentication/consumer/persistence enabled.
- **Architect freeze:** `tasks/PHASE13_M2_A1_2_B_TRUSTED_DELIVERY_AUDIT_SECURITY_CONTRACT.md`; Codex B1 packet `tasks/PHASE13_M2_A1_2_B1_CODEX_IMPLEMENTATION_PACKET.md`. A1.2-B is split into **B1 offline security foundations + guarded disposable PostgreSQL 0033**, **B2 separately approved live synthetic AWS sandbox verification**, **B3 separately approved trusted worker/persistence**. Only B1 is in scope now.
- **B1 expected:** additive 0033 audit append-only/DELETE protections preserving M1 in-transaction ProjectOperation result update and A1.1 run transitions; pure typed/static IAM/EventBridge/SQS/GuardDuty readiness evidence evaluator that cannot authenticate live source; pure queue ACK/retry/DLQ protocol, adversarial offline + guarded DB tests, operator checklist and updated project state. Existing migrations 0030–0032 are frozen; never touch real databases, AWS, live customer files, Phase12 MatterDocument or product routes.
- **Critical trust limitation:** a GuardDuty-shaped EventBridge JSON delivered through SQS is not cryptographic proof of GuardDuty origin; bus `PutEvents`/rule/queue policy injection capability must be independently evaluated at B2. Exact S3 VersionId+recomputed SHA-256 required; no clean declassification without source and object evidence. A1.2-A untrusted candidate output stays untrusted.
- **Not authorized:** B2 AWS console/CLI mutation, account-cost actions, live source authenticator, SQS polling, B3 scan-persistence bridge, production/customer file use, public API or feature flag activation. **A1.2 and overall M2 NOT ACCEPTED.** Preserve earlier historical milestone entries below.

<!-- END PHASE13_M2_A1_2_B_ARCHITECT_FREEZE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_A_ACCEPTANCE_2026_10_25 -->
## Current handoff — M2-A1.2-A offline AWS adapter ACCEPTED (2026-10-25)

- **Accepted implementation:** GitHub commit `0209f718b7ec0eca9002b86fe36023ff905453b6` on `phase13-study-journey-project-centric`, independently verified against GitHub branch HEAD and the expected 13-file changed-file list. Owner push output confirms creation of the commit and remote update. Prior uncommitted/review-pending handoff below is historical, not current status.
- **Delivered, approved limited scope:** isolated default-disabled `chatbot/lib/project-documents/aws/` module (8 files) with injected AWS client commands, conditional S3 writes, bounded explicit-VersionId HEAD/GET, computed SHA-256 and identity enforcement; bounded GuardDuty EventBridge candidate parser, independent *interface* for trusted delivery context, exact Project file/version correlation and mock fixtures; `PHASE13_M2_A1_2_AWS_SECURITY_OPERATOR_CHECKLIST.md` for subsequent owner/operator decisions. No added database migrations or changes to accepted A1.1 semantics, no real AWS network calls in the task, no production authenticator, public file route, SQS consumer, A1.1 `finalizeScan()` connection or activated feature flag.
- **Validation evidence:** Codex-reported 17/17 focused AWS module tests with no failure/skip; seven existing Project/schema/document regression test files passed; changed-source Biome and whitespace checks passed; 44 unchanged existing TypeScript diagnostics, none in new AWS files. Full unit suite was not run; no DB or AWS tests were run. ChatGPT independently inspected cumulative patch `phase13_m2_a1_2_A_review.patch` and accepted the bounded offline code, but did not rerun local tests. No claim of production GuardDuty/IAM security certification.
- **A1.2-B NEXT ARCHITECTURE GATE, NOT CODE-AUTHORIZED:** real account/region and protection plan, S3 Versioning / Object Lock and approved erasure policy, least privilege for IAM/KMS and dedicated EventBridge/SQS/DLQ, authentic transport provenance (raw JSON not sufficient), exact immutable version/sha256/byte-size live evidence, scan event replay and DB audit tamper/delete protection, residency/retention/legal-hold, incident recovery and cost decisions. Requires separate owner authorization, careful design and later isolated synthetic AWS trials; no production/customer files or deployment approved.
- **Overall milestone:** M2-A1.2-A ACCEPTED; M2-A1.2-B and full M2 remain NOT ACCEPTED. Preserve all earlier acceptance records below.

<!-- END PHASE13_M2_A1_2_A_ACCEPTANCE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_A_IMPLEMENTATION_2026_10_25 -->
## Current handoff — M2-A1.2-A offline S3/GuardDuty adapters implemented; independent review pending (2026-10-25)

- **Checkpoint:** branch `phase13-study-journey-project-centric`, base HEAD `ed41a3b935a7fe9bec86b4996812bd2671bbe4e2`. All A1.2-A changes remain uncommitted and unpushed. Existing A1.1/migration 0032 behavior was preserved.
- **Implementation:** added isolated server-only `chatbot/lib/project-documents/aws/` modules for injected S3 commands, strict Project-prefix/config validation, default-off `PHASE13_PROJECT_DOCUMENT_AWS_ADAPTERS_ENABLED`, conditional encrypted/checksummed writes, required concrete S3 VersionId, and bounded exact-version HEAD/GET with independently computed SHA-256/byte size. No `S3Client` construction, credential resolution, deletion API, or AWS call occurs at module import.
- GuardDuty parsing follows the documented EventBridge shape and bounds input, JSON depth/size, identity, plan ARN, status pair, Project key and VersionId. A separate injected transport-authentication port creates an opaque in-process capability; the test-only fake cannot prove live IAM. Candidate correlation rechecks current Project/asset/version IDs, generation, stored identity, current lifecycle and exact bytes. Outputs remain explicitly **untrusted candidates**; no `VerifiedProjectDocumentScanAttestation`, `finalizeScan()` call, route, worker or runtime consumer exists.
- Added offline fake SDK/event tests and `docs/agent-memory/tasks/PHASE13_M2_A1_2_AWS_SECURITY_OPERATOR_CHECKLIST.md`. The checklist leaves account/IAM, queue trust, retention, erasure, legal hold, database audit-delete protection, residency and cost decisions to A1.2-B owners.
- **Validation:** focused A1.2-A **17 passed / 0 failed / 0 skipped**; existing Project/schema/document regression coverage **7 test files passed / 0 failed / 0 skipped**. Biome passed on the package file and all AWS module files; TypeScript baseline comparison is unchanged at **44 repository diagnostics**, with **0 diagnostics in the new AWS module**. `git diff --check` and untracked whitespace checks passed. Full `pnpm test:unit` was not run. No database, AWS account, S3 object, GuardDuty plan or queue was accessed.
- Installed `@aws-sdk/client-s3` is **3.1139.0**. No dependency/lockfile change was needed. Independent source review is next. M2-A1.2 and full M2 remain **NOT ACCEPTED**; A1.2-B and A1.3 remain gated.
- Cumulative uncommitted review patch: `~/phase13_m2_a1_2_A_review.patch`.

<!-- END PHASE13_M2_A1_2_A_IMPLEMENTATION_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_2_ARCHITECT_GATE_2026_10_25 -->
## Current handoff — M2-A1.2 architect design and A1.2-A implementation gate (2026-10-25)

- **Accepted baseline:** M2-A1.1 internal persistence at `752311535645343343d1e81ab569d5816e9608d5`; latest prior acceptance-docs HEAD `c95282aed8d913c22875a8b38906b4a8f60e59cb`, branch `phase13-study-journey-project-centric`. No A1.2 implementation or live activation exists at this checkpoint.
- **Architecture:** `tasks/PHASE13_M2_A1_2_PRIVATE_S3_TRUSTED_GUARDDUTY_ARCHITECTURE_CONTRACT.md`, authored and frozen by ChatGPT; `tasks/PHASE13_M2_A1_2_A_CODEX_IMPLEMENTATION_PACKET.md` specifies only default-off, internal **offline** S3/GuardDuty adapter implementation and fake SDK/transport tests. Verified AWS public event format includes `scanStatus` and `s3ObjectDetails.versionId`; exact object version+SHA binding, independent queue/IAM delivery trust and explicit Plan ARN are mandatory. Neither JSON fields nor S3 ETag alone prove scan authenticity.
- **A1.2-A next:** implement strictly isolated `lib/project-documents/aws/` ports, offline test fixtures and AWS security operator checklist; no runtime consumer, AWS calls, real storage, SQS poller, API, customer file, schema migration or deploy. Codex only implements after owner dispatch and stops uncommitted for independent patch review.
- **A1.2-B later owner gate:** isolated AWS bucket Versioning, approved IAM/EventBridge/SQS/GuardDuty live source, exact versioned scan attestation, database scan audit deletion protection, deletion/retention/privacy and cost governance. No live AWS/customer data authorized by A1.2-A, and no A1.3/M2-D AI context authorized. M2-A1.2 and full M2 NOT ACCEPTED. Preserve previous milestone history.

<!-- END PHASE13_M2_A1_2_ARCHITECT_GATE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_1_OWNER_ACCEPTED_2026_10_25 -->
## Current handoff — M2-A1.1 durable Project document persistence ACCEPTED (2026-10-25)

- **Accepted implementation:** `752311535645343343d1e81ab569d5816e9608d5` on `phase13-study-journey-project-centric`. The owner supplied identical local HEAD and `git ls-remote` values, with empty `git status --short`; ChatGPT independently verified the same GitHub remote branch HEAD and exactly 14 expected files. Acceptance is bounded to synthetic-only internal PostgreSQL persistence.
- **Delivered scope:** additive Drizzle migration `0032_phase13_m2_a1_1_durable_document_audit.sql` with generated snapshot/journal; genuine `user/service` principals on ProjectOperation/ProjectEvent without fake Users; durable Project document intent, synthetic import-consent receipt, storage object-version identity and scan-event fingerprint; internal Postgres repository with operation replay, revision/event transactional writes, project membership and source ownership checks, storage/scan generation CAS and audit-linked clean-scan provenance. R1 closes direct clean-state promotion and exact-version read provenance bypass for the approved service flow. Historical migrations 0030/0031 untouched; no routes, real customer-file ingestion, AWS, S3 or scanner adapter.
- **Evidence and limits:** owner/Codex-reported guarded synthetic local PostgreSQL A1.1 **17/17 PASS**, M1.1 **10/10 PASS**, M2-A0 **3/3 PASS**, full unit **964/964 PASS**; `pnpm db:check`, changed-source Biome and whitespace checks PASS. 44 existing TypeScript diagnostics outside changed A1.1 paths. Generated Drizzle snapshot formatter differences reported (source and snapshot lint PASS), not treated as a blocking code defect. ChatGPT independently reviewed the cumulative R1 patch but did not rerun local DB/tests. The only reported migrated/reset DB was `127.0.0.1:5432/immigration_ai_phase13_m1_1_test`.
- **Remaining gate:** Real document object storage and exact-object scanner provenance are **NOT implemented**. The A1.1 review identified privileged direct SQL deletion of scan audit rows as a residual risk; gate database-role privileges, delete protection, object identity immutability/versioning, event authentication and retention/cleanup policy before A1.2 or live data. No public routes, AI-context, third-party grants, production migration or rollout authorized.
- **Next:** architect-owned M2-A1.2 trust/storage/scanner design and a separate bounded implementation packet; owner acceptance/security review before any real integration. M2-A1.2 and overall M2 remain NOT ACCEPTED. Preserve the accepted M1.4, M2-A0, M2-A1.0 records below as history.

<!-- END PHASE13_M2_A1_1_OWNER_ACCEPTED_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_1_R1_SCAN_PROVENANCE_2026_10_25 -->
## Current handoff — M2-A1.1 R1 scan provenance and schema parity fixed; independent review pending (2026-10-25)

- **Checkpoint:** retained all A1.1 work on `phase13-study-journey-project-centric`, base HEAD `c859a97ce98c219a7adf18e35c229de6e26ed94d`. Still uncommitted and unpushed. R1 extends only migration 0032, its directly related schema/repository/tests, and these current-state records; migrations 0030 and 0031 remain unchanged.
- The 0032 security transition guard now requires stored immutable object identity and an exact matching synthetic scan result before any terminal security promotion; terminal states cannot be rewritten. A deferred constraint also requires matching service-authored scan operation and ProjectEvent in the same transaction. `authorizeExactVersionRead()` now verifies the terminal clean run and its audit provenance alongside the existing active exact-purpose grant and Project authorization. This is synthetic provenance only, not proof of real malware scanning.
- Drizzle `ProjectOperation_actor_type_check` now matches 0032's lowercase 64-hex service-operation ID rule; the user-operation ID policy is unchanged. No snapshot edit was needed: Drizzle snapshots omit CHECK constraints, and `pnpm db:check` passed.
- **Validation:** A1.1 guarded PostgreSQL **17 passed / 0 failed / 0 skipped**; M2-A0 **3/3**; M1.1 **10/10**; full `pnpm test:unit` **964/964**. `pnpm db:check`, changed-source Biome, snapshot Biome lint, `git diff --check`, and untracked whitespace checks passed. TypeScript still reports **44 repository diagnostics, 0 in changed A1.1 paths**. Every database status/reset/test was scoped to verified disposable `127.0.0.1:5432/immigration_ai_phase13_m1_1_test`.
- No 0033, public API/UI, AWS/S3, real scanner, customer files, production behavior, commit or push. A1.1 and M2 remain **NOT ACCEPTED** pending independent review. Complete cumulative patch: `~/phase13_m2_a1_1_R1_review.patch`.

<!-- END PHASE13_M2_A1_1_R1_SCAN_PROVENANCE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_1_IMPLEMENTATION_2026_10_25 -->
## Current handoff — M2-A1.1 durable Project document persistence implemented; independent review pending (2026-10-25)

- **Checkpoint:** preserved the interrupted worktree on `phase13-study-journey-project-centric`, base HEAD `c859a97ce98c219a7adf18e35c229de6e26ed94d`. Work remains uncommitted and unpushed. Migration `0032_phase13_m2_a1_1_durable_document_audit` is additive; migrations `0030` and `0031` are unchanged.
- Added durable PostgreSQL intent/import-consent state and a server-only repository for synthetic upload/import intents, storage outcomes, synthetic scan finalization, creator purpose grants, revocation, withdrawal and exact-purpose reads. User and worker operations/events have matching typed actor provenance; document mutation, Project revision and one event commit atomically with replay/CAS handling. No route, runtime consumer, real storage/scanner adapter, or production entrypoint was added. Consent and scan evidence remain synthetic test capabilities, not verified production provenance.
- **Validation:** A1.1 guarded PostgreSQL integration **15 passed / 0 failed / 0 skipped**; existing M1.1 **10/10**, M2-A0 **3/3**; full `pnpm test:unit` **964 passed / 0 failed / 0 skipped**. Only `127.0.0.1:5432/immigration_ai_phase13_m1_1_test` was status-verified, reset and migrated. `pnpm db:check`, changed-source Biome, generated-snapshot Biome lint and tracked/untracked whitespace checks passed. TypeScript no-emit reports **44 existing diagnostics, 0 in A1.1 changed paths**.
- No customer database/data, public API/UI, AWS/S3, scanner integration, real files, deployment, commit or push. A1.1 and M2 remain **NOT ACCEPTED** pending independent review. Complete cumulative patch: `~/phase13_m2_a1_1_review.patch`.

<!-- END PHASE13_M2_A1_1_IMPLEMENTATION_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_1_ARCHITECT_CONTRACT_2026_10_25 -->
## Current handoff — M2-A1.1 durable transactions/audit architect contract (2026-10-25)

- Accepted M2-A1.0 implementation: `a5cee03aabfa1609b8fda5b5d030a393da2d8638`. Subsequent acceptance-docs baseline: `22baeb8e6c453bbd8e9045569df2083028cb3fd7`. Source branch: `phase13-study-journey-project-centric`. A1.1 is **DESIGNED, NOT IMPLEMENTED**.
- Architect-owned contract: `tasks/PHASE13_M2_A1_1_DURABLE_TRANSACTIONS_AUDIT_CONTRACT.md`; bounded implementer packet: `tasks/PHASE13_M2_A1_1_CODEX_IMPLEMENTATION_PACKET.md`. Worker identity resolved with additive 0032 `user/service` actorKind and constrained servicePrincipalCode on the existing ProjectOperation/Event; no fake User or parallel generic event ledger.
- Planned 0032-only additive schema: ProjectDocumentIntent and ImportConsent, verified storageObjectVersionId-once and scan eventFingerprint, document operation/event allowlists. DB-only repository and guarded synthetic PostgreSQL tests with Project revision/Event atomicity, cross-project auth and worker CAS. No real S3, scan, APIs, customer files, AI context, production migration or deployment authorized; A1.2/1.3 remain gated.
- The owner may explicitly dispatch Codex for **A1.1 implementation only** on the new docs HEAD after syncing. Stop uncommitted/unpushed for independent patch review. M2 overall and A1.1 are NOT ACCEPTED.

<!-- END PHASE13_M2_A1_1_ARCHITECT_CONTRACT_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_0_ACCEPTANCE_2026_10_25 -->
## Current handoff — M2-A1.0 internal Project Document Service ACCEPTED (2026-10-25)

- **Accepted implementation:** branch `phase13-study-journey-project-centric`, commit `a5cee03aabfa1609b8fda5b5d030a393da2d8638`. Owner's local `git rev-parse HEAD` and `git ls-remote` matched; `git status --short` empty. Independent GitHub read verified this exact remote HEAD and **9 committed files**: 5 new `chatbot/lib/project-documents/{types,ports,testing,service,service.test}.ts`, `chatbot/package.json` and three current-state docs.
- **Scope accepted:** fully synthetic/injected-port Project document service core with individual source Chat-document authorization, explicit `consentAccepted: true` for import before authorization/source access, consent in idempotency hash, validated copy semantics, immutable object identity and hash/length checks, storage vs scanner state separation, exact-purpose creator grants, scanner attestation identity/replay/terminal checks, fail-closed withdrawal/revocation, and no public/runtime consumers. Prior cumulative R1 patch was independently reviewed; no source-review blockers remained.
- **Validation provenance:** user/Codex reports focused service **21/21 PASS**, existing Project regressions **5 test files PASS**, changed-file Biome and whitespace PASS; TypeScript `noEmit` 44 existing diagnostics outside the new module, none introduced; full unit suite NOT RUN. This acceptance does not claim independent execution of local tests, database integration, actual user-file consent provenance, scanning infrastructure, live S3 or production.
- **Next milestone:** M2-A1.1 **ARCHITECT DESIGN / OWNER GATE**, not implementation. Real durable operations require exact ProjectOperation/ProjectEvent type and result/subject extension, audit worker principal without user impersonation, expectedProjectRevision, replay correctness, CAS across asynchronous workers, retention/revocation semantics and reviewed additive migration **0032**. No A1.1 coding until an architect-owned technical packet is approved. Subsequent A1.2 real S3/scanner and A1.3 customer APIs remain separately gated.
- **Operational state:** no new migration, API route, feature enabled, AWS/scanner adapter, real customer files or deployment authorized. M2 overall is NOT ACCEPTED. Preserve accepted M1.4, M2-A0 and previous design gates below as historical records.

<!-- END PHASE13_M2_A1_0_ACCEPTANCE_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_0_R1_IMPORT_CONSENT_2026_10_25 -->
## Current handoff — M2-A1.0 R1 explicit import-consent fix (2026-10-25)

- **Checkpoint:** preserved the complete uncommitted A1.0 worktree on `phase13-study-journey-project-centric`, base HEAD `f77fc8975a88768d5769b8903d6aedf63351a8b2`. No commit or push.
- `ImportProjectChatDocumentInput` now requires `consentAccepted: boolean`. `importOwnedChatDocument()` accepts only the literal `true` before Project/source authorization, source reads, intent creation or storage. The accepted acknowledgement is included in the canonical operation request hash. Source-owner checks, byte/hash validation, current authorization recheck and copy semantics remain in place.
- False, missing and runtime-invalid consent return `invalid_request`; tests prove no source ownership check/read, asset, version, operation or stored object is created. The successful import fixture supplies consent, the project-owner/cross-member denial remains covered, and source digest mismatch plus ownership revocation remain covered. This synthetic boolean is not verified or durable production consent; provenance and authenticated UI acceptance remain future A1.1/A1.3 work.
- **Validation:** focused service tests **21 passed / 0 failed / 0 skipped**; existing Project foundation/schema/policy/HTTP set **5 test files passed / 0 failed / 0 skipped**; Biome passed on `chatbot/package.json` and all **5 module files**. TypeScript no-emit reported **44 diagnostics outside the new module and 0 within it**. Full `pnpm test:unit` was not run. `git diff --check` and untracked whitespace validation passed.
- Schema/migrations, APIs, authentication, AWS/scanner adapters, production consent, real-file behavior and unrelated runtime paths are unchanged. M2-A1.0 remains pending independent review.
- Updated cumulative uncommitted patch: `~/phase13_m2_a1_0_R1_review.patch`.

<!-- END PHASE13_M2_A1_0_R1_IMPORT_CONSENT_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_0_IMPLEMENTATION_2026_10_25 -->
## Current handoff — M2-A1.0 internal Project Document Service implemented; independent review pending (2026-10-25)

- **Checkpoint:** branch `phase13-study-journey-project-centric`, base HEAD `f77fc8975a88768d5769b8903d6aedf63351a8b2`. Implementation and handoff updates remain uncommitted and unpushed. M2-A1.0 is implemented within its packet boundary but is **not accepted**; M2-A1 and M2 remain unaccepted.
- Added the internal `chatbot/lib/project-documents/` core: typed state/ports, deterministic in-memory repository, injected fake object store and synthetic attestation verifier, service, and focused tests. Registered the new test in `chatbot/package.json` `test:unit`. Direct upload and explicitly owned Chat-document imports validate/copy bytes into a unique new key; authorization, idempotency, storage integrity, pending scan status, explicit creator purpose grants, read gates, revocation/withdrawal and terminal scan replay are exercised. No filename or storage key is returned in metadata/receipts.
- **Validation:** A1.0 focused tests **19 passed / 0 failed / 0 skipped**; existing Project foundation/schema/policy/HTTP regression set **5 test files passed / 0 failed / 0 skipped**; Biome passed on `chatbot/package.json` and all **5 new module files**. No-emit TypeScript reported **44 diagnostics outside `lib/project-documents/` and 0 in the new module**. Full `pnpm test:unit` was not run. `git diff --check` and untracked TypeScript whitespace validation passed.
- **Boundary:** test-only synthetic bytes and injected in-memory ports. There is no database repository/atomic transaction, migration 0032, route or runtime consumer, AWS/S3/GuardDuty client, production feature activation, parser/extraction, AI context, or change to Phase 12 MatterDocument, Standalone, or ConversationTurn behavior. Durable operation/revision/event/worker semantics remain deferred to A1.1; no database or external service was used.
- Static import checks found no API, app, component or other `lib` consumer of the service. Stop here for independent ChatGPT architecture/source review; do not treat this implementation as real-file authorization.
- Complete cumulative uncommitted patch: `~/phase13_m2_a1_0_review.patch`.

<!-- END PHASE13_M2_A1_0_IMPLEMENTATION_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A1_ARCHITECT_DESIGN_2026_10_25 -->
## Current handoff — M2-A1 Project Document Service architect design (2026-10-25)

- **Checkpoint:** M2-A0 accepted and pushed at `b6cdd46d1a7289bccb30cb2257de613f5ea121f3`; latest prior docs-only HEAD `5db5a564d29c755de733f2765c42880a6ad42cf1`. Branch `phase13-study-journey-project-centric`. M2-A1 has NOT been implemented or accepted.
- **Architect-owned design:** `tasks/PHASE13_M2_A1_PROJECT_DOCUMENT_SERVICE_ARCHITECTURE_CONTRACT.md`. Read actual 0031 schema, M1 ProjectOperation/Event semantics, Phase12 storage/validation/scanner boundaries. Separate exact bytes, independent scan verdict, document extraction and human evidentiary sufficiency; no automatic share between members and no promotion of legacy file clean status into Project scan proof.
- **Bounded next coding packet:** `tasks/PHASE13_M2_A1_0_INTERNAL_SERVICE_CORE_IMPLEMENTATION_PACKET.md` permits only synthetic injected-port service/core and offline negative tests. NO routes, real S3, scanner, DB migration, real files, storage grant public API, AI context or UI. Requires owner's explicit dispatch and independent uncommitted source review.
- **Later gated slices:** A1.1 durable operation/Event/revision + worker identity and additive migration; A1.2 private storage/exact-byte trusted scanner proof; A1.3 owner/privacy/consent-accepted authenticated APIs and optional UI. No unauthorized real-file ingestion. Preserve M1.4/M2-A0 prior acceptance and default-off flags. Existing generic POST /api/projects feature-gate caveat remains open.
- Older entries below are historical checkpoints.

<!-- END PHASE13_M2_A1_ARCHITECT_DESIGN_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A0_OWNER_ACCEPTED_2026_10_25 -->
## Current handoff — Phase 13 M2-A0 accepted and pushed (2026-10-25)

- **Accepted bounded milestone:** M2-A0 inert Project document schema foundation, branch `phase13-study-journey-project-centric`, implementation commit `b6cdd46d1a7289bccb30cb2257de613f5ea121f3`. The owner provided matching local HEAD and `git ls-remote`, with empty `git status --short`; ChatGPT independently verified the matching GitHub branch SHA and exact 11 committed files.
- **Scope accepted:** additive four-table ProjectDocumentAsset/Version/Grant/ProcessingRun foundation; Drizzle migration `0031_sour_scarecrow` and snapshot; same-Project FK and immutable identity restrictions; R1 terminal processing-run immutability (SQLSTATE 23514) allowing exact no-op updates. No runtime consumer, Project document API, upload, download, import, S3/scanner/extraction, Project facts, AI context, public feature activation, deployment or real customer data was authorized.
- **Validation provenance:** Codex/local report: guarded disposable PostgreSQL `127.0.0.1:5432/immigration_ai_phase13_m1_1_test` 3/3 passed; focused tests 2/2; M1.1 guarded regression 10/10; `pnpm db:check`, Biome, whitespace and migration metadata checks passed. M1.2/M1.3 and full unit suite were not rerun for R1; 44 baseline TypeScript diagnostics remained, none in changed files. ChatGPT source-reviewed the cumulative M2-A0 R1 patch and found no remaining blocking defect. These are bounded validations, not a live/staging/production test.
- **Next:** M2-A1 requires an architect-authored, owner-reviewed contract for Project upload/import, per-purpose grants, independently verified scanner binding, asynchronous byte-lifecycle state, consent/retention and denial semantics. Until owner gates are accepted, no customer-file path or scanner may be implemented or enabled. Existing generic `POST /api/projects` feature-gate caveat remains. Keep Project Chat feature default-off.
- This supersedes earlier M2-A0 `NOT ACCEPTED` progress entries; preserve them as historical checkpoints. M2 overall and M2-A1 are NOT ACCEPTED.

<!-- END PHASE13_M2_A0_OWNER_ACCEPTED_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A0_R1_TERMINAL_STATE_FIX_2026_10_25 -->
## Current handoff — M2-A0 R1-01 processing-run terminal immutability fixed; independent review pending (2026-10-25)

- **Correction:** migration `0031_sour_scarecrow.sql` now rejects every changed `ProjectDocumentProcessingRun` row after `completed` or `failed` with SQLSTATE `23514` and constraint identifier `ProjectDocumentProcessingRun_terminal_immutable`. Exact no-op updates remain valid. Existing identity checks remain intact, and a `started` run can complete or fail once.
- **R1 files changed:** `chatbot/lib/db/migrations/0031_sour_scarecrow.sql`, `chatbot/lib/db/project-document-schema.integration.test.ts`, and these three current-state records. No snapshot/schema change, migration 0032, or other runtime/schema edit was needed.
- **Validation:** M2-A0 PostgreSQL **3 passed, 0 failed, 0 skipped**; focused schema/M1 unit tests **2 passed, 0 failed, 0 skipped**; guarded M1.1 PostgreSQL regression **10 passed, 0 failed, 0 skipped**. `pnpm db:check`, changed-file Biome, and `git diff --check` passed. M1.2/M1.3 and full `pnpm test:unit` were not rerun for this trigger-only correction.
- **Database:** guard status confirmed only `127.0.0.1:5432/immigration_ai_phase13_m1_1_test`; the reset and migration tests used synthetic rows there. No other database was used.
- **Status:** M2-A0 remains unaccepted, uncommitted, and unpushed. Independent review is pending. Complete cumulative patch: `~/phase13_m2_a0_R1_review.patch`.

<!-- END PHASE13_M2_A0_R1_TERMINAL_STATE_FIX_2026_10_25 -->

<!-- BEGIN PHASE13_M2_A0_IMPLEMENTATION_2026_10_25 -->
## Current handoff — M2-A0 inert Project document schema implemented; independent review pending (2026-10-25)

- **Baseline:** repository `jiangdizhao/immigration_ai`, branch `phase13-study-journey-project-centric`, starting HEAD `f7640a8757f6fd4752ddbe4c9172e78e3b9d9dab`; worktree was clean at preflight. No commit or push.
- **Scope:** additive Drizzle definitions for `ProjectDocumentAsset`, `ProjectDocumentVersion`, `ProjectDocumentGrant` and `ProjectDocumentProcessingRun`; generated migration index 31 (`0031_sour_scarecrow`), snapshot and journal entry. The migration adds same-Project composite keys/FKs, restrictive deletion, version/hash/size/state checks, exact-version purpose grants, processing generation/event identity, and immutable asset/version/grant/run identity guards. Storage and security status remain independent; both default to `pending`. Source Chat/document identifiers are optional provenance only and have no FKs. No API, upload/import, storage, scanner, extraction, context, UI or runtime consumer was added. Migration 0030 and M1 Project/ConversationTurn behavior remain intact.
- **Files:** modified `chatbot/lib/db/schema.ts`, `chatbot/lib/db/project-foundation.integration.test.ts`, `chatbot/package.json`, `chatbot/lib/db/migrations/meta/_journal.json`; added `chatbot/lib/db/migrations/0031_sour_scarecrow.sql`, `chatbot/lib/db/migrations/meta/0031_snapshot.json`, `chatbot/lib/db/project-document-schema.test.ts`, and `chatbot/lib/db/project-document-schema.integration.test.ts`; this handoff, `CURRENT_MILESTONE.md` and `PROJECT_STATE.md` record the result.
- **Validation:** focused unit/M1 regression **6 passed, 0 failed, 0 skipped**; guarded M2-A0 PostgreSQL integration **3 passed, 0 failed, 0 skipped**; existing guarded M1.1 **10/10**, M1.2 **7/7**, M1.3 **1/1**, all zero failures/skips. `pnpm db:check` passed. Biome check passed on the 5 changed source/test/package files; generated Drizzle JSON metadata passed Biome lint and remains in generator format. `git diff --check` and untracked whitespace review passed. TypeScript remains at the **44 baseline diagnostics**, with **0** in changed files (compiler exit 2 from unchanged baseline diagnostics). Full `pnpm test:unit` was not run.
- **PostgreSQL:** only `127.0.0.1:5432/immigration_ai_phase13_m1_1_test` was reset and used; tests assert the actual database identity and use synthetic data. The initial sandbox status probe could not connect; the repository guard then verified and ran outside the sandbox. No regular chatbot database, `immigration_legal`, staging, AWS or production database was touched.
- **Open implementation detail:** R1 does not enumerate `grantorAuthorityBasis` or service-principal codes. A0 stores bounded codes only; these values do not grant authority, and any future writer must define and verify them before enabling writes. M2-A0 is implemented but not accepted; stop for independent source review.
- **Review artifact:** complete cumulative uncommitted patch: `~/phase13_m2_a0_review.patch`.

<!-- END PHASE13_M2_A0_IMPLEMENTATION_2026_10_25 -->

<!-- BEGIN PHASE13_M2_001_ARCHITECT_CONTROLLED_R1_2026_10_25 -->
## Current handoff — M1.4 accepted; architect-owned M2-001 R1 design committed (2026-10-25)

- **Source-of-truth baseline:** M1.4 was accepted locally and pushed at b8d7133eb6e7afd50fd199795ebe47e25aa53a77 on phase13-study-journey-project-centric. Owner ran pnpm test:unit: **941 passed, 0 failed, 0 skipped**; browser-tested Project create, own Project Chat create/turn, reload/persistence, Standalone isolation, R3 document-panel fix, R4 Back navigation and feature-disabled origin-preserving read-only fallback. These are user-reported browser/test observations. Multi-account, full mobile/English acceptance and production rollout remain open. Project Chat feature remains default-off. POST /api/projects feature-gate gap remains documented.
- **M2 design authority:** At the owner's explicit instruction, ChatGPT authored and checked in a replacement M2-001 R1 technical design; Codex is the coding implementer, not the design authority. Contract: docs/agent-memory/tasks/PHASE13_M2_001_PROJECT_DATA_FACTS_DOCUMENTS_CONTRACT.md. Next bounded task packet: docs/agent-memory/tasks/PHASE13_M2_A0_SCHEMA_FOUNDATION_IMPLEMENTATION_PACKET.md.
- **Technical architectural defaults (NOT owner approvals):** Private-by-default records, per-purpose revocable data grants; fact confirmation separate from publication separate from AI-use authority; person confirmation independent of Project owner; worker version/generation CAS separate from user expectedProjectRevision; independent Project copy/scan; stable confirmed facts separated from candidate/conflict context. All professional/legal, real-file privacy/retention/scanner and person/guardian gates remain pending.
- **Next step:** Owner syncs the new remote docs while preserving local uncommitted Codex proposal. Owner may explicitly dispatch ONLY M2-A0 inert schema/contract implementation. No M2-A1 real file operations, model context, public API, deployment, migration of shared DB, or professional determination authorized by these documents.
- **Preserve history:** All older sections below describe prior checkpoints and are not the current implementation state.

<!-- END PHASE13_M2_001_ARCHITECT_CONTROLLED_R1_2026_10_25 -->

<!-- BEGIN PHASE13_M1_4_R4_BACK_NAVIGATION_2026_10_25 -->
## Current handoff — M1.4 R4 Project panel back-navigation usability (2026-10-25)

- **Checkpoint:** branch `phase13-study-journey-project-centric`, base HEAD `b806aa8df4537505b863a51a64acb91bd4072993`. Full uncommitted M1.4/R1/R2/R3 changes remain preserved; no commit, push, deployment or production feature enablement.
- **R4 change:** moved “返回全部对话” / “Back to all conversations” out of the Project title row into its own full-width secondary button at the top of the selected-Project panel. It has an ArrowLeft icon, 40px minimum height, 14px text, contrasting border/background, hover and visible keyboard focus styles. It retains the same `selectProject(null)` behavior, and remains disabled while conversation loading or an AI turn is active. Project title, full ID, Chat list and New Project Chat action remain in place.
- **Layout/accessibility checks:** component tests verify a native keyboard-focusable button, enabled and disabled rendering, exact CN/EN copy, placement before the title row, and the existing responsive 250px desktop sidebar / single-column mobile layout. Full-width/min-width handling and the Project ID's `break-all` styling are retained for narrow panels and long IDs.
- **Validation:** focused Project/Workspace regressions **4 files passed, 0 failed, 0 skipped**; changed-file Biome **2 files passed**; `git diff --check` passed. No full unit rerun was requested or needed for this bounded presentation change; no database, migration or paid AI tests were run.
- **R4 files:** `chatbot/components/project-entry-panel.tsx`, `chatbot/lib/workspace/project-entry.test.ts`, and these three current-state records. No controller/business logic, schema, API authorization, origin semantics, persistence, turn handling, document panel, feature flag or deployment changes. M1.4 remains pending independent review.
- **Complete cumulative review patch:** `~/phase13_m1_4_R4_review.patch`.

<!-- END PHASE13_M1_4_R4_BACK_NAVIGATION_2026_10_25 -->

<!-- BEGIN PHASE13_M1_4_R3_DOCUMENT_PANEL_2026_10_25 -->
## Current handoff — M1.4 browser acceptance R3 Project document-panel compatibility (2026-10-25)

- **Checkpoint:** branch `phase13-study-journey-project-centric`, base HEAD `b806aa8df4537505b863a51a64acb91bd4072993`. Existing M1.4/R1/R2 changes remain preserved and uncommitted; no commit, push, deployment or production feature enablement.
- **R3 correction:** Project-origin conversation panels now receive an explicit document-read capability derived from `conversationOrigin`. Project Chats do not construct or send `GET /api/matter-documents?chatId=...`, expose upload controls, display stale conversation files, or surface raw document errors. Both compact and right-side panels show the localized explanation “项目文件目前尚不可用。” / “Project documents are not available yet.” Account-wide historical files remain in the separate account-files panel. Standalone document loading, processing, upload and error handling remain available; temporary busy state disables writes without disabling reads.
- **Stale-response boundary:** each panel instance is keyed to conversation origin and ID; request sequencing discards pending list responses/errors after the selected conversation changes. A deterministic mocked-response test verifies an old Standalone result is ignored after switching to Project. Other regression assertions cover both Project panels/locales, zero Project GETs, Standalone restoration while busy, and separate account history.
- **Validation:** focused Workspace/API/turn regression **9 files passed, 0 failed, 0 skipped**. Final configured `pnpm test:unit`, rerun outside the sandbox after the final test edit: **940 passed, 0 failed, 0 skipped**. The initial sandbox invocation had **111 passed / 3 failed / 0 skipped** (`lib/production/s3-preflight-cli.test.ts`, `lib/production/stage3-hardening.test.ts`, and `lib/server-http-timeouts.test.ts`); these passed in the full outside-sandbox rerun. Changed-file Biome checked **12 files** successfully. TypeScript reports the existing **44 baseline diagnostics**, with **0** in changed M1.4 paths. `git diff --check` passed for tracked changes; untracked-file whitespace check passed. No PostgreSQL rerun was needed because no API, schema or database contract changed.
- **R3 files:** `chatbot/components/immigration-ai-workspace.tsx`, `chatbot/components/matter-documents-panel.tsx`, `chatbot/lib/matter-documents/workspace-panel.ts`, `chatbot/lib/workspace-copy.ts`, `chatbot/lib/workspace/stage2-context-ui-wiring.test.ts`, plus these three current-state documents. No migrations, schema, document API, authorization, AI reasoning, feature flag, M2, deployment, AWS or production changes. Project document uploads remain unavailable. M1.4 is not accepted; independent review and browser acceptance remain pending.
- **Complete cumulative review patch:** `~/phase13_m1_4_R3_review.patch`.

<!-- END PHASE13_M1_4_R3_DOCUMENT_PANEL_2026_10_25 -->

<!-- BEGIN PHASE13_M1_4_R2_BOUNDARY_FIX_2026_10_24 -->
## Current handoff — M1.4 final R2 Project authorization-state correction (2026-10-24)

- **Checkpoint:** branch `phase13-study-journey-project-centric`, base HEAD `b806aa8df4537505b863a51a64acb91bd4072993`. Existing M1.4/R1 modifications and untracked files are preserved. Changes remain uncommitted; no push, deployment or production enablement.
- **Root cause/fix:** after POST `/api/projects` returned 201, `createProject()` ignored the outcome of its subsequent Project-list refresh. A 401/403 correctly cleared cached authorization-dependent state, but the caller then reinserted the just-created Project and selected it. `refreshProjects()` now returns a typed result distinguishing success, definitive authorization denial, transient failure and superseded request. `createProject()` stops on 401/403 or a superseded refresh before reinsert/select; transient 503/network failures retain recoverable behavior and the confirmed create may continue.
- **Invalidation and tests:** the R1 401/403 path still clears Projects, selection, Chats and pagination and invalidates pending Chat-list sequence numbers. A deterministic controller test exercises POST 201 → GET Projects 403 → pending scoped Chat GET 403 and asserts empty Projects/selection/Chats/cursor. Another resolves a delayed successful Chat page after the 403 and proves it cannot restore state. Tests also cover post-create 503/network recovery, ordinary successful creation/idempotency and R1 busy-navigation blocking/re-enablement.
- **Validation:** focused M1.4/Workspace/API/turn regressions **8 files passed, 0 failed, 0 skipped**; complete configured `pnpm test:unit` **937 passed, 0 failed, 0 skipped**. Changed-file Biome **9 files passed**; `git diff --check` passed for tracked and untracked files. TypeScript remains at **44 baseline diagnostics**, with **0** in changed M1.4 paths. PostgreSQL suites were not repeated because the fix changes only client controller state and does not affect database/API contracts.
- **Scope:** R2 changed only `chatbot/lib/workspace/project-entry.ts`, `chatbot/lib/workspace/project-entry.test.ts`, and the three current-state documents. No schema/migration, API, authorization, turn ledger, UI architecture, deployment, AWS or production changes. The Project Chat flag remains default-off; the generic `POST /api/projects` rollout caveat remains unchanged. M1.4 is not accepted; browser acceptance and independent review remain pending. M2 has not started.
- **Complete cumulative review patch:** `~/phase13_m1_4_R2_review.patch`.

<!-- END PHASE13_M1_4_R2_BOUNDARY_FIX_2026_10_24 -->

<!-- BEGIN PHASE13_M1_4_R1_CORRECTIONS_2026_10_24 -->
## Current handoff — M1.4 independent review R1 corrections implemented (2026-10-24)

- **Checkpoint:** branch `phase13-study-journey-project-centric`, base HEAD `b806aa8df4537505b863a51a64acb91bd4072993`; existing M1.4 work was preserved. The R1 correction remains uncommitted. No commit, push, deployment or production feature enablement.
- **R1-01 navigation guard:** the Workspace passes a busy state derived from its existing `status !== 'ready' || conversationLoading` contract. Project selection, opening, paging, Project creation/selection actions and Project Chat creation are disabled while busy and guarded again at the event-handler entry using a ref of the latest parent state. Creating a Project Chat cannot auto-open it if the Workspace becomes busy before the API response arrives. Idle state re-enables actions. Regression tests cover submitted/typing turns, loading, re-enablement, and no stale Project Chat open callback/transcript replacement while busy.
- **R1-02 definitive access failure:** Project refresh HTTP 401/403 now invalidates the cached Project list, selected Project, scoped Chats and pagination, and increments the Chat request sequence so delayed list responses cannot restore stale state. Network errors and HTTP 503 preserve cached selection/history for retry. Deterministic tests reproduce the populated-cache → 403 transition and transient-failure preservation.
- **Validation:** focused M1.4/Workspace/API/turn regression: **8 files passed, 0 failed, 0 skipped**. Complete configured `pnpm test:unit` outside sandbox: **934 passed, 0 failed, 0 skipped**. Changed-file Biome: **9 files passed**; `git diff --check` passed. TypeScript remains at **44 baseline diagnostics**, none in changed M1.4 paths. PostgreSQL reset/integration suites were not repeated because these corrections change only client UI/controller behavior; no API, schema or database contract changed.
- **Boundary:** no schema/migration, server API authorization, M1.3 Turn Ledger, deployment configuration, AWS, production or shared system change. `PHASE13_PROJECT_CHAT_ENABLED` remains default-off. The existing generic `POST /api/projects` rollout caveat remains documented. M1.4 is not declared accepted; independent R1 review is pending.
- **Review artifact:** complete uncommitted patch: `~/phase13_m1_4_R1_review.patch`.

<!-- END PHASE13_M1_4_R1_CORRECTIONS_2026_10_24 -->

<!-- BEGIN PHASE13_M1_4_IMPLEMENTATION_2026_10_24 -->
## Current handoff — Phase 13 M1.4 minimal Project Workspace UI implemented (2026-10-24)

- **Checkpoint:** preflight verified branch `phase13-study-journey-project-centric`, HEAD `b806aa8df4537505b863a51a64acb91bd4072993`, and a clean worktree. M1.4 implementation now exists as uncommitted changes; no commit, push, deployment or production feature activation.
- **Workspace UI:** the existing AI Workspace now has a distinct Create Project action and expandable My Projects list, using authenticated Project APIs. The accessible Create Project dialog submits only the operation ID. Project labels use creation date and short ID because persisted Project names/type/Offer/CoE fields do not exist. Selecting a Project lists only the server-projected current user's own Project Chats; New Project Chat uses the existing scoped API and operation-ID replay contract. Opening one reuses existing conversation history and turn behavior.
- **Isolation/read-only:** Standalone New Conversation remains available and clears Project selection without adding Project identifiers to its request; policy slug/launch binding remains intact. Project selection hides stale Standalone transcript, case/files and context panels. Server-projected Project origin/read-only metadata is preserved; closed/feature-disabled history is identified as Project-origin read-only, never Standalone. No Project facts, documents, progress, stage or lawyer-approval UI was invented.
- **Capability/rollout:** Project controls are rendered only when the server page has both the enabled `PHASE13_PROJECT_CHAT_ENABLED` capability and a current registered-customer session. This UI gate does not replace API authorization. **Rollout caveat:** generic `POST /api/projects` is not currently guarded by the Project Chat feature flag; backend rollout behavior was not broadened in M1.4. The flag remains default-off and was not enabled for production.
- **Executable coverage:** the Project entry controller tests cover create/select/open, owner/member scoped projections, revoked access, closed/read-only Projects, Standalone/policy isolation, stale responses, retry/idempotency and duplicate submissions. Accessible Chinese-default/English and responsive markup is rendered in tests; a focused workspace contract test confirms a server-projected Project Chat remains Project-origin, browseable and read-only when writes are disabled. No browser visual/E2E run was available.
- **Validation:** complete configured `pnpm test:unit`: **930 passed, 0 failed, 0 skipped** (outside sandbox; this also reran sandbox-sensitive child-process/loopback cases). Focused Project/workspace/API/turn regression: **8 test files passed, 0 failed, 0 skipped**. Guarded fixed disposable PostgreSQL M1.1/M1.2/M1.3 suites ran sequentially: **10 + 7 + 1 = 18 passed, 0 failed, 0 skipped** on `immigration_ai_phase13_m1_1_test`. The guarded M1.1 operator reset only this disposable target because that suite requires an empty schema; no ordinary/shared/live database was touched. `pnpm db:check` exited 0 (“Everything's fine”; Drizzle printed its existing `Failed to find Response internal state key` preamble). Changed-file Biome checked 9 files successfully; TypeScript retains **44 baseline diagnostics**, with none in M1.4-changed source/test paths; `git diff --check` passed.
- **Schema/system boundary:** no migration, schema, API/server authorization, deployment configuration, production traffic or external system was changed. Existing M1.1–M1.3 server foundations remain authoritative. M1.4 adds only Workspace entry; later Project documents, shared facts and education/professional workflows are excluded.
- **Changed files:** `chatbot/app/(chat)/ai-workspace/page.tsx`; `chatbot/components/immigration-ai-workspace.tsx`; `chatbot/components/premium-answer-mode-workspace.tsx`; `chatbot/components/project-entry-panel.tsx`; `chatbot/lib/workspace-copy.ts`; `chatbot/lib/workspace/project-entry.ts`; `chatbot/lib/workspace/project-entry.test.ts`; `chatbot/lib/workspace/conversation-origin.test.ts`; `chatbot/package.json`; plus this handoff, `CURRENT_MILESTONE.md` and `PROJECT_STATE.md`.
- Independent source review is pending. Preserve this uncommitted diff; no commit or push.

<!-- END PHASE13_M1_4_IMPLEMENTATION_2026_10_24 -->

<!-- BEGIN PHASE13_M1_4_OWNER_ACCEPTED_UI_PLAN_2026_10_24 -->
## Current handoff — M1.3 committed; M1.4 minimum Project UX contract active (2026-10-24)

- **Verified GitHub HEAD:** `27ceb8a3e75456f3357027e368565674687a3896` (`feat(phase13): integrate Project Chat authorization and durable turns`), branch `phase13-study-journey-project-centric`. The user's local HEAD and ls-remote matched; status was clean. M1.3 accepted after independent R1 review, but customer Project Chat writes/turns still default off.
- **Owner UX decision:** lawyer-friend's step conversations, project overview, Project document center, fact cards, provenance, real readiness, managed/self flow and lawyer review are accepted as **long-term product direction**, not M1.4 implemented capabilities. See `PHASE13_UI_PRODUCT_BLUEPRINT_2026_10_24.md`. No legal/admissions/financial reviewer signoff inferred.
- **M1.4 contract:** `tasks/PHASE13_M1_004_MINIMAL_CUSTOMER_WORKSPACE_CONTRACT.md` ready for bounded Codex implementation: existing AI Workspace Project list/create/select + own Project Chat create/open, CN/EN/responsive, server-derived origin/read-only, Standalone unchanged. M1.4 code NOT started by this documentation commit.
- **No misleading M1 placeholders:** current Project schema has no title/type/Offer/CoE/service mode/stages/progress; Project files/shared facts/step tasks/review are M2+/M4+/M5–M9, not M1.4. Existing GET /api/projects returns active Projects only; closed own Chats remain authorized read-only global history.
- **Rollout:** `PHASE13_PROJECT_CHAT_ENABLED` default false, do not enable production. M1.4 UI show controls only with server capability; cosmetic UI gating does not replace API policy. Current generic POST /api/projects is not bound to this flag; retain as rollout caveat, do not claim full Project-write kill switch.
- **Validation:** documentation-only preparation; no new application code, schema, migration, customer deployment, unit or DB tests executed. Historical M1.3/R1 test reports retained unchanged below.
<!-- END PHASE13_M1_4_OWNER_ACCEPTED_UI_PLAN_2026_10_24 -->

<!-- BEGIN PHASE13_M1_3_R1_SECURITY_CORRECTIONS_2026_10_24 -->
## Current handoff — M1.3 independent security review R1 corrections (2026-10-24)

- **Checkpoint:** branch `phase13-study-journey-project-centric`, base HEAD `5704520b54921590dfe11facb1570090e2b69f98`. Existing M1.3 work remains preserved and uncommitted; no commit or push.
- **R1-01 Vote bypass:** GET/PATCH now use a shared injectable handler that checks persisted Project origin before Chat lookup or vote access. Project-linked Chats return not-found for both methods regardless of active/revoked membership; origin lookup/schema uncertainty returns 503. Standalone owner voting and non-owner denial are covered by executable handler tests.
- **R1-02 history eligibility:** the shared Project-history SQL predicate now requires the same registered-customer identity as M1.1 (`role = 'user'` and email not matching shared `guestRegex`). It applies to Project history list/count, summary/detail, message pagination and other consumers of that predicate. The Project-specific Chat list query has the same current eligibility condition. Standalone history remains outside this extra Project-only condition; Project title update and turn admission already use `assertCustomerActor`.
- **Security coverage:** executable tests exercise Project ingress with real persisted Project/Standalone IDs, including missing/mismatched scope; the shared PostgreSQL turn-admission boundary retains concurrent revocation and now rejects an owner after role or guest-identity change. Integration assertions cover active customer history, revoked history/voting denial, canonical owner staff denial, guest-classified owner denial, closed read-only history, and Standalone history preservation. Vote handler tests cover GET/PATCH for active and revoked membership states, lookup failure, Standalone behavior, and non-owner denial.
- **Validation:** focused Node test run **6 files passed, 0 failed, 0 skipped**. Guarded `pnpm test:phase13:m1.3:integration` on `immigration_ai_phase13_m1_1_test`: **1 passed, 0 failed, 0 skipped**; existing concurrent revocation/turn-claim assertions ran in that suite. Changed-file Biome **7 files passed**; TypeScript remains at **44 baseline diagnostics** with no diagnostics in the R1 changed areas; `git diff --check` passed. An initial integration attempt exposed only a newly added fixture's order-sensitive expectation; the assertion was made order-independent and the final run passed.
- **Database/schema:** guarded read-only status before and after integration confirmed the fixed disposable database at loopback with 42 public tables. The suite seeded and cleaned fixtures; it did not reset or migrate the database. No migration/schema, legal-service, unrelated module, shared database or live system changes.
- This R1 current-status note supersedes the M1.3 summary below on authorization/test status while preserving the earlier implementation checkpoint. Independent source/integration review remains pending.

<!-- END PHASE13_M1_3_R1_SECURITY_CORRECTIONS_2026_10_24 -->

<!-- BEGIN PHASE13_M1_3_IMPLEMENTATION_2026_10_24 -->
## Current handoff — Phase 13 M1.3 implemented; awaiting independent review (2026-10-24)

- **Checkpoint:** branch `phase13-study-journey-project-centric`, base HEAD `5704520b54921590dfe11facb1570090e2b69f98`; all M1.3 changes remain uncommitted. No commit, push, deployment or customer enablement. The earlier M1.3 plan block below is retained as its contract-preparation-time snapshot and is superseded by this implementation record.
- **API:** added `POST/GET /api/projects/{projectId}/chats`. Creation reuses the M1.1 atomic server-generated Chat primitive and operation replay. Listing is cursor-bounded and returns only Chat rows whose creator and Chat owner are the current actor and whose Project authority is still owner/active Membership.
- **History/authorization:** `/api/immigration-conversations` list/count, detail, message pagination and title update use persisted `ProjectConversation` origin, individual Chat ownership and current Project authority. Unauthorized Project rows are filtered before pagination/count. Revoked creators lose history; closed Projects and the emergency write gate preserve only authorized creator history and mark it read-only. Standalone/legacy history remains on its prior path.
- **Turn admission:** Fast, Default and Premium widget routes share the Project-origin ingress guard. Project turns lock Project, validate the current customer and owner/active Membership, verify Chat creator/owner, and claim the existing `(chatId, clientTurnId)` ConversationTurn in one short transaction. The transaction ends before provider/model inference; existing replay, lease, fence and atomic-finalization code remains the single turn ledger. Generic `/api/chat` rejects persisted Project IDs before lookup/fallback creation.
- **Other Chat-ID surfaces:** standalone Chat list/count/lookup, bulk and individual deletion, document ownership, consultation linking and related legacy actions exclude or reject Project Chats. No membership-based access to another creator's transcript, staff Project access, Project documents/context, application workflow or new Project-create UI was added. The minimal existing Workspace change consumes server origin/read-only metadata; writable Project Chats permit message turns only, while guided intake, uploads and lawyer review stay unavailable.
- **Feature control:** Project Chat creation/update/turn ingress is default-off unless `PHASE13_PROJECT_CHAT_ENABLED=true`. Read-only history remains available when writes are disabled; no customer-facing enablement was performed.
- **PostgreSQL:** Codex-executed guarded suites on the fixed loopback disposable `immigration_ai_phase13_m1_1_test`, sequentially: M1.1 fresh-migration **10 passed / 0 failed / 0 skipped**; M1.2 **7 / 0 / 0**; M1.3 **1 / 0 / 0**. The M1.3 suite covers creator/member isolation, list/count, message history, revocation-vs-turn admission, closure-vs-turn admission, post-close turn denial, replay/hash conflict, transaction rollback, staff denial and emergency read-only fallback. The guarded operator reset only this fixed disposable database, then M1.1 applied the existing migrations there. No normal/shared/live database was reset, migrated or modified.
- **Regression/validation:** the final outside-sandbox `pnpm test:unit` passed **911 / 0 / 0**. The first in-sandbox attempt produced 109 pass and 3 subprocess/loopback failures; those exact tests passed 24/24 outside the sandbox, and the later full run passed. Focused M1.3 HTTP/history/turn/Workspace group passed **10 / 0 / 0** before the final type-only cleanup and **5 / 0 / 0** afterward. `pnpm db:check` exited 0 (“Everything’s fine”; existing `Failed to find Response internal state key` preamble). Changed-file Biome checked **30 files** with no issues; `git diff --check` passed. TypeScript exits 2 with the unchanged **44 baseline diagnostics**, all outside M1.3 changed areas (zero changed-area diagnostics).
- **Schema/remaining gates:** no schema, migration SQL, Drizzle journal or snapshot changed; no new migration exists. Independent source/security and integration review remains pending. M1.4 Workspace project creation/selection, Project evidence/context, staff access and production rollout remain excluded.
- **Implementation files:** `chatbot/app/(chat)/api/chat/route.ts`; `chatbot/app/api/projects/[projectId]/chats/route.ts`; `chatbot/app/api/widget-chat-direct/route.ts`; `chatbot/app/api/widget-chat-fast/route.ts`; `chatbot/app/api/widget-chat/route.ts`; `chatbot/components/immigration-ai-workspace.tsx`; `chatbot/components/legacy-conversation-notice.test.tsx`; `chatbot/components/legacy-conversation-notice.tsx`; `chatbot/lib/consultations/service.ts`; `chatbot/lib/conversations/conversation-http.test.ts`; `chatbot/lib/conversations/conversation-http.ts`; `chatbot/lib/conversations/history-runtime.ts`; `chatbot/lib/conversations/runtime.ts`; `chatbot/lib/conversations/turn-ledger.ts`; `chatbot/lib/conversations/widget-conversation-bookkeeping.ts`; `chatbot/lib/conversations/widget-route-contract.test.ts`; `chatbot/lib/db/project-foundation-schema-availability.ts`; `chatbot/lib/db/project-foundation.ts`; `chatbot/lib/db/queries.ts`; `chatbot/lib/projects/chat-ingress.ts`; `chatbot/lib/projects/chat-policy.test.ts`; `chatbot/lib/projects/chat-policy.ts`; `chatbot/lib/projects/chats-http.test.ts`; `chatbot/lib/projects/chats-http.ts`; `chatbot/lib/projects/chats-runtime.ts`; `chatbot/lib/projects/project-chat.integration.test.ts`; `chatbot/lib/workspace-copy.ts`; `chatbot/lib/workspace/conversation-origin.test.ts`; `chatbot/lib/workspace/conversation-origin.ts`; `chatbot/lib/workspace/workspace-read-only-wiring.test.ts`; `chatbot/package.json`.

<!-- END PHASE13_M1_3_IMPLEMENTATION_2026_10_24 -->

<!-- BEGIN PHASE13_M1_3_PLAN_2026_10_24 -->
## Current handoff — M1.2 remote verified; Phase 13 M1.3 implementation packet prepared (2026-10-24)

- **Verified remote checkpoint:** M1.2 implementation committed and pushed as `7dfcb6c720d1227cd5dd6a0bbd94d310399daa09`, confirmed directly against GitHub branch `phase13-study-journey-project-centric`; user reported a clean local worktree. Owner-run disposable PostgreSQL suites: M1.1 **10/10**, M1.2 **7/7**; these are not a claim that the previous complete unit suite is all green.
- **M1.3 design:** [PHASE13_M1_003_PROJECT_CHAT_INTEGRATION_CONTRACT.md](./tasks/PHASE13_M1_003_PROJECT_CHAT_INTEGRATION_CONTRACT.md) is the bounded implementation packet. Reuse M1.1 atomic Project Chat creation, integrate own-Chat Project create/list and history/detail/update, enforce Project+individual Chat authorization, and serialize Project permission check with the existing turn claim in a short transaction at Fast/Default/Premium ingress.
- **Read-only semantics:** closed Project and emergency feature disablement preserve only a still-authorized creator's own Project-origin history; revocation denies history, no Project turns/writes, no silent Standalone relabel. Standalone/legacy paths must not regress.
- **Scope/state:** M1.3 implementation **not started at this documentation checkpoint**; no new migration/database/deployment/professional rule is authorized. M1.4 Workspace UI and later Project evidence/workflow remain deferred. The M1.3 plan is ready for the user's next Codex implementation action; do not mistake this doc commit for implemented code.
- **Artifact location preference:** user-requested patches or MD exports outside the repo go under `~/`, never `/tmp/`; test software may use its own internal temporary storage.

<!-- END PHASE13_M1_3_PLAN_2026_10_24 -->

<!-- BEGIN PHASE13_M1_2_FINAL_REVIEW_R1_2026_10_24 -->
## Phase 13 M1.2 Final Review R1 — regression restored, local DB validation reported (2026-10-24)

- Restored `lib/policy-intelligence/editorial-api.test.ts` to `chatbot/package.json` `test:unit`, preserving `lib/projects/http.test.ts` and the rest of the configured test list. This corrects the independent review finding without changing application code.
- **User-executed local PostgreSQL validation (reported by the user; not run by Codex):** M1.1 integration **10 passed, 0 failed, 0 skipped**; M1.2 integration **7 passed, 0 failed, 0 skipped**; **17 passed total**. These results supersede the earlier Codex sandbox skip/blocker for the local integration suites. Codex did not connect to or modify a database during this R1 correction.
- **Codex focused checks:** `node --import tsx --test lib/policy-intelligence/editorial-api.test.ts lib/db/project-foundation.test.ts lib/projects/http.test.ts` — **3 test files passed, 0 failed, 0 skipped**; assertion verified both editorial API and M1.2 HTTP tests are present in `test:unit`; `pnpm exec biome check package.json` passed; `git diff --check` passed. The complete `pnpm test:unit` was not rerun for this focused correction; its prior recorded result remains 106 passed and 3 existing sandbox-sensitive failures.
- Only `chatbot/package.json` and these current-state documents changed for R1. No schema, migration, architecture or unrelated source code changed. Branch/HEAD remain `phase13-study-journey-project-centric` / `8519a6af59988a0e690dea5b334a0344269ff025`; no commit or push.

<!-- END PHASE13_M1_2_FINAL_REVIEW_R1_2026_10_24 -->

<!-- BEGIN PHASE13_M1_2_IMPLEMENTATION_2026_10_24 -->
## Current status — Phase 13 M1.2 implemented; PostgreSQL validation blocked (2026-10-24)

- **Status:** M1.2 bounded implementation is present and awaiting independent source/security review and real disposable-PostgreSQL integration review. It is not enabled for customer traffic. Branch `phase13-study-journey-project-centric`, HEAD `8519a6af59988a0e690dea5b334a0344269ff025`; no commit or push. The five pre-existing contract-freeze documentation changes were preserved.
- **APIs:** `GET/POST /api/projects`; `GET /api/projects/{projectId}`; `POST /api/projects/{projectId}/close`; `GET/POST /api/projects/{projectId}/members`; `GET /api/project-invitations`; and `POST /api/projects/{projectId}/members/{membershipId}/accept|revoke`. The source route files are under `chatbot/app/api/projects/` and `chatbot/app/api/project-invitations/`.
- **Repository:** `createProject`, `listProjects`, `getProjectForActor`, `closeProject`, `listProjectMembers`, `listPendingInvitations`, `inviteProjectMember`, `acceptProjectMembership`, and `revokeProjectMembership` are in `chatbot/lib/db/project-foundation.ts`. M1.1 project-chat primitives remain in place; no cross-member transcript route/access was added.
- **Authorization:** actor identity comes only from the authenticated regular session, then the current database User row must be role `user` and not match the established `guestRegex`. Owners are authorized only by `StudyJourneyProject.ownerUserId`; no owner Membership is created. Only active customer Membership grants project access. Pending Members receive only their own minimal invitation inbox projection, including current Project revision as a concurrency token. Revoked, staff, guest, missing-user, pending and cross-project access fail closed. No new email-verification gate was introduced. M1.2 grants no Chat transcript access.
- **Transitions/idempotency:** Invite, accept and revoke use `ProjectOperation → StudyJourneyProject → ProjectMembership` lock order. Successful state changes atomically write operation outcome, Membership, one Project revision increment and one matching `membership_state_changed` event. A neutral invite stores the Project result pair and writes no Membership/revision/event; an eligible invite stores the same-Project Membership result. Actor/type/key scope and canonical request hash are enforced; replay validates result ownership and transition event without repeating mutation. Stale revision conflicts roll back. Revoked Membership cannot be reinvited or reactivated.
- **Readiness/privacy:** server-only runtime checks current registered-customer identity, rate-limits invite/inbox requests through the existing limiter and returns private/no-store responses. The read-only schema probe requires all five M1.1 tables, the expected 37 columns and three critical unique indexes; routes return 503 when schema is absent/unverified. Request schemas are strict and body-limited; invitation responses are bodyless `202` for eligible and neutral outcomes. No email lookup/delivery, invitation token, account directory, UI, or schema migration was added.
- **Changed implementation files:** `chatbot/lib/db/project-foundation-utils.ts`; `chatbot/lib/db/project-foundation.test.ts`; `chatbot/lib/db/project-foundation.ts`; `chatbot/lib/db/project-foundation-schema-availability.ts`; `chatbot/lib/db/project-membership.integration.test.ts`; `chatbot/lib/projects/http.ts`; `chatbot/lib/projects/runtime.ts`; `chatbot/lib/projects/http.test.ts`; `chatbot/app/api/projects/route.ts`; `chatbot/app/api/projects/[projectId]/route.ts`; `chatbot/app/api/projects/[projectId]/close/route.ts`; `chatbot/app/api/projects/[projectId]/members/route.ts`; `chatbot/app/api/projects/[projectId]/members/[membershipId]/accept/route.ts`; `chatbot/app/api/projects/[projectId]/members/[membershipId]/revoke/route.ts`; `chatbot/app/api/project-invitations/route.ts`; and `chatbot/package.json`. No schema or migration file changed.
- **Focused unit/HTTP validation:** direct normal-condition Node test invocations passed `project-foundation.test.ts` (**5 passed**) and `projects/http.test.ts` (**10 passed**); no server-only condition was added to unit tests. Changed-file Biome checked 16 TypeScript/JSON files with no issues. `pnpm db:check` exited 0 and reported “Everything’s fine” (with the existing `Failed to find Response internal state key` preamble). `git diff --check` passed.
- **Full unit validation:** exact `pnpm test:unit` result was **109 test-file subprocesses: 106 passed, 3 failed, 0 skipped**. All 8 relevant `lib/conversations/*` route, persistence, turn-ledger, pagination and widget-contract regression files passed; `lib/db/project-foundation.test.ts` and `lib/projects/http.test.ts` passed. The only failures were existing sandbox-sensitive `lib/production/s3-preflight-cli.test.ts` (child stdout empty), `lib/production/stage3-hardening.test.ts` (migration CLI exit 1 rather than expected 2), and `lib/server-http-timeouts.test.ts` (localhost bind `EPERM`). No unrelated test was changed.
- **TypeScript:** `pnpm exec tsc --noEmit --pretty false --incremental false` exited 2 with the established **44 diagnostics**, all in unchanged files; no diagnostic named an M1.2 changed source/test file.
- **PostgreSQL blocker:** the guarded operator `pnpm phase13:m1.1:test-db status` refused to proceed with `isolated_database_url_missing`; `PHASE13_M1_1_TEST_DATABASE_URL` is unset. The M1.2 and existing M1.1 PostgreSQL integration bodies each report **0 passed, 0 failed, 1 skipped** with reason “isolated database required.” No connection, query, reset or migration was attempted. Therefore PostgreSQL concurrency, constraint and injected rollback behavior remain unverified for this implementation. Only `immigration_ai_phase13_m1_1_test` is an acceptable future target; do not use a fallback database.
- **Schema/operations:** Migration `0030_demonic_the_hood`, its snapshot/journal and manual checks are unchanged. No database was contacted or modified; no live/shared operation, deployment, commit or push occurred. Existing M1.3 widget-turn authorization and M1.4 Workspace UI remain deferred.
- **Current worktree:** the five pre-existing contract-freeze files remain modified (`DECISIONS.md`, M1.2 contract, and these three state documents); the implementation files above are uncommitted/untracked. See current `git status --short` for the exact inventory.

<!-- END PHASE13_M1_2_IMPLEMENTATION_2026_10_24 -->

<!-- BEGIN PHASE13_M1_2_CONTRACT_2026_10_24 -->
## Current status — Phase 13 M1.2 contract frozen (2026-10-24)

- **Checkpoint:** branch phase13-study-journey-project-centric, committed HEAD 8519a6af59988a0e690dea5b334a0344269ff025. The worktree was clean at task preflight. M1.1 is committed at this checkpoint; the M1.1 “uncommitted” note below is retained as its original execution-time record at HEAD 83286fdafe66615f4293f742cd82d0de0f70f940.
- **M1.1:** complete, independently reviewed and committed at this checkpoint. The M1.1 “uncommitted” note below is retained as its original execution-time record at HEAD 83286fdafe66615f4293f742cd82d0de0f70f940.
- **Owner decision:** D-P13-006 records accepted decisions: no reinvitation after revocation; invitations use recipient-shared opaque User IDs without email lookup/delivery or tokens; M1.2 adds no email-verification gate and leaves application-wide login behavior unchanged.
- **Contract:** [M1.2 Membership and Authorization Contract](./tasks/PHASE13_M1_002_MEMBERSHIP_AUTHORIZATION_CONTRACT.md) is OWNER ACCEPTED — M1.2 TECHNICAL CONTRACT FROZEN and READY FOR BOUNDED IMPLEMENTATION AUTHORIZATION. Its invitation no-op uses the existing ProjectOperation result union; a neutral attempt creates no Membership, revision increment, ProjectEvent or migration. There is no global account lookup; authorized owners can infer a successful invite from their scoped revision/roster.
- M1.2 implementation has not started and still needs independent review and separate bounded implementation authorization. M1.3 and M1.4 remain deferred. Professional/legal-admissions matrices remain PROVISIONAL.
- Documentation only for this task; no application code, schema, migration, database, tests, live system or external operation was touched.

<!-- END PHASE13_M1_2_CONTRACT_2026_10_24 -->

<!-- BEGIN PHASE13_M1_1_IMPLEMENTATION_2026_10_24 -->
## Current status — Phase 13 M1.1 Project Foundation implemented (2026-10-24)

- **Scope:** the separately authorized M1.1 additive PostgreSQL/Drizzle foundation only. Implemented `StudyJourneyProject`, `ProjectMembership`, `ProjectConversation`, `ProjectOperation` and `ProjectEvent`; Project creation/closure, current owner/member checks, revision/event persistence, actor-scoped idempotency and atomic creation of a newly generated Project Chat + `ImmigrationConversation` + association + operation + event. No public route, membership workflow, widget integration, UI, Project AI context, documents, applications or later-stage work was added.
- **Branch/checkpoint:** `phase13-study-journey-project-centric`, HEAD `83286fdafe66615f4293f742cd82d0de0f70f940`. Changes are uncommitted. No commit or push.
- **Changed files:** `chatbot/lib/db/schema.ts`; `chatbot/lib/db/project-foundation.ts`; `chatbot/lib/db/project-foundation-utils.ts`; `chatbot/lib/db/project-foundation.test.ts`; `chatbot/lib/db/project-foundation.integration.test.ts`; `chatbot/scripts/phase13-m1-1-test-db.ts`; `chatbot/package.json`; `chatbot/lib/db/migrations/0030_demonic_the_hood.sql`; `chatbot/lib/db/migrations/meta/0030_snapshot.json`; `chatbot/lib/db/migrations/meta/_journal.json`; and this file, `CURRENT_MILESTONE.md`, and `PROJECT_STATE.md`.
- **Migration:** journal index 30 / tag `0030_demonic_the_hood`; additive tables, indexes, foreign keys, composite `(Chat.id, Chat.userId)` uniqueness and explicit PostgreSQL `CHECK`s. Drizzle Kit 0.25 does not serialize `CHECK`s in its snapshot format; checks remain in Drizzle schema declarations and are explicitly present in migration SQL. The migration was applied only to the fixed local disposable database `immigration_ai_phase13_m1_1_test`. It now has 31 migrations and zero synthetic rows. No migration or data change was made to the normal `chatbot` database, staging, production or another shared database.
- **Database-level limits:** the composite Chat owner foreign key prevents a Project association from naming another creator. Current membership/status authorization, the owner-not-a-membership-row rule, and matching Project revision to its event span rows and are enforced in the repository transaction under Project-then-Membership locks; no speculative trigger was added. M1.2 must enforce owner-membership exclusion in its locked membership commands.
- **Concurrency/rollback evidence:** operation key is claimed before resource locks; lock order is operation claim → Project row → matching Membership row. Integration coverage passed identical concurrent retries, distinct concurrent Project Chats, competing authorization/revocation orderings, and injected failures after every Project/Chat write boundary. Every failure rolled back the operation/resource/association/revision/event writes.
- **R1-01:** the ordinary `node --import tsx --test lib/db/project-foundation.test.ts` failed before running because the repository module imports `server-only`. The canonicalization, operation-ID validation, hashing, replay and shared error type now live in `project-foundation-utils.ts`; the production repository remains marked `server-only` and re-exports its API. No global Node condition was added. The focused ordinary-runner command passed **6 files, 0 failed, 0 skipped**.
- **R1-02:** all five ProjectEvent negative cases use the existing creation operation reference and assert SQLSTATE plus constraint: revision `23514 / ProjectEvent_revision_positive_check`; event type `23514 / ProjectEvent_type_check`; invalid and inconsistent subject `23514 / ProjectEvent_subject_check`; duplicate project revision `23505 / ProjectEvent_project_revision_unique`. Migration 0030 and its explicit CHECK statements were preserved.
- **Final validation:** guarded disposable PostgreSQL integration **10 passed, 0 failed, 0 skipped**; exact configured `pnpm test:unit` outside the sandbox **888 passed, 0 failed, 0 skipped**; `pnpm db:check` passed; Biome check passed on the 6 changed TypeScript/schema/package files, and `biome lint` passed all 8 changed TypeScript/JSON files. Biome's formatter reports generated Drizzle snapshot/journal formatting differences only; generator output was preserved. `git diff --check` passed. The same full unit command inside the sandbox had **106 passed, 3 failed, 0 skipped** because unrelated tests could not start the `tsx` IPC pipe or bind localhost (`EPERM`); outside-sandbox execution passed all tests. TypeScript exited 2 with the existing **44 diagnostics**, all in unchanged files; no changed M1.1 file was named.
- **Standalone compatibility:** the integration test migrated synthetic pre-0030 Standalone `Chat`, `ImmigrationConversation` and `ConversationTurn` rows and deep-compared their stored identities/fields after migration. Existing Standalone regression files passed. No turn table, key, lease or fencing field was changed.
- **Deferred:** M1.2 membership APIs/invitation lifecycle; M1.3 Project Chat/widget authorization wiring; M1.4 Workspace UI; Project documents/context, applications, professional review, payments and other later phases. The four legal/admissions matrices remain **PROVISIONAL**; privacy/retention, financial custody, GS and OSHC remain pending with applicable professionals.
- **Operations:** only the guarded disposable M1.1 database was created/reset/migrated for tests. No live service, AWS resource, staging/production database, external submission or paid model was touched.

The 2026-10-23 review and M0 preparation entries below remain historical.
<!-- END PHASE13_M1_1_IMPLEMENTATION_2026_10_24 -->

<!-- BEGIN PHASE13_M0_004_REVIEW_2026_10_23 -->
## Phase 13 M0-004 architecture review delivered

- **M0-004 REVIEW DELIVERED — AWAITING INDEPENDENT ARCHITECTURE AND OWNER ACCEPTANCE.** Report: [PHASE13_M0_004_ARCHITECTURE_FREEZE_REVIEW.md](./tasks/PHASE13_M0_004_ARCHITECTURE_FREEZE_REVIEW.md).
- Review checkpoint: branch `phase13-study-journey-project-centric`, HEAD `5984a99b52974ee47bcb8107c73a6ba44856a475`; clean before this documentation change.
- Recommendation: technical contracts are freeze candidates, but architecture is not frozen. F-01 and F-02 are `BLOCKER_M1`: owner must accept Project membership + Chat authorization semantics and the durable-history rollback fallback. **M1 is NOT READY / NOT AUTHORIZED.**
- Additional findings: ApplicationParty identity/role normalization is proposed for M2; subtype enforcement should follow staged M2/M5/M6–M7 introduction; correct the condition-first Offer decision diagram before M5. The stored-to-clean scanner defect remains an M2 Project-document prerequisite, not an M1 blocker.
- LF-01–LF-08 and LF-D01–LF-D09 remain provisional. No legal, admissions, finance, privacy, records or professional approval is claimed. No Project workflow code, test suite, migration, database, AWS/S3, Stripe, paid AI or external submission was used.
- M1 scope and synthetic/de-identified security/regression plan are specified in the report. Do not begin M1 until the owner accepts the decisions and issues separate implementation authorization.
- Validation: git diff --check PASS; direct trailing-whitespace scan of the new report PASS; tests not run. Changed files are the M0-004 report and these three current-status documents: CURRENT_HANDOFF.md, CURRENT_MILESTONE.md, PROJECT_STATE.md. DECISIONS.md is unchanged.
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

- **M0-003-R2 DELIVERED — AWAITING INDEPENDENT REVIEW.** Updated [PHASE13_M0_003_WORKFLOW_POLICY_DESIGN.md](./tasks/PHASE13_M0_003_WORKFLOW_POLICY_DESIGN.md). It remains a proposal, not owner acceptance, architecture freeze, legal advice, lawyer/education-agent approval or implementation authorization. The independent review accepts all eight R1 corrections; all are preserved.
- The M0-003 task contract at activation commit `a234e4ff4ad0124e2ed522579e6a26075f34f273` was read remotely. Branch remains `phase13-study-journey-project-centric`, HEAD `355721919d049d16070dfc887105d3c2a943afaa`; earlier R1 documentation WIP was retained. No branch movement or Git history rewrite occurred.
- R2 makes Student 500 preparation independent of anchor verification while retaining source-backed admission-anchor checks at affected Managed gates; separates Offer version/authenticity, one customer decision, conditions, institution acknowledgement and actual CoE; keeps fee allocations separate from client/third-party funds; adds two versioned GS outputs; and separates document security, extraction, authenticity and sufficiency with bounded professional-review suggestions. The supplied OSHC nationality comment remains provisional and requires current-source/human review. R1's bounded planner, transactional outbox and same-Project version-bound CoE link remain.
- Latest annotated lawyer PDF was not located. The checked-in V0.1 PDF is present but its 12 annotations are URL links only; owner-supplied R2 comments are recorded provisionally. Matrices remain PROVISIONAL. Fund ownership/accounting/custody/licensing/account category and permitted combinations remain OWNER/FINANCE/COUNSEL/PRIVACY PENDING. The source-verified MatterDocument storage-to-clean contradiction remains an implementation prerequisite for real Project file use.
- Documentation only. No code, schema, migration, database, AWS/S3, Stripe, money movement, paid call, external legal-source fetch, submission or test suite. M0-004/M1 have not started; technical architecture is not frozen. `git diff --check` PASS; a direct trailing-whitespace scan of the new untracked design found no matches. Mermaid rendering is unavailable; diagrams received static review.
- **Exact changed files:** `docs/agent-memory/tasks/PHASE13_M0_003_WORKFLOW_POLICY_DESIGN.md`; `docs/agent-memory/CURRENT_HANDOFF.md`; `docs/agent-memory/CURRENT_MILESTONE.md`; `docs/agent-memory/PROJECT_STATE.md`.
- **Exact local Git status (`git status --short --branch`; HEAD `355721919d049d16070dfc887105d3c2a943afaa`):**

  ```text
  ## phase13-study-journey-project-centric...origin/phase13-study-journey-project-centric
   M docs/agent-memory/CURRENT_HANDOFF.md
   M docs/agent-memory/CURRENT_MILESTONE.md
   M docs/agent-memory/PROJECT_STATE.md
  ?? docs/agent-memory/tasks/PHASE13_M0_003_WORKFLOW_POLICY_DESIGN.md
  ```
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


<!-- BEGIN DOCUMENT_PROCESSING_LIVE_ACCEPTANCE_2026_10_16 -->
## LATEST — 2026-10-16: Document Processing Hotfix in live use; PDF + Fast summary accepted

**Operational disposition:** Owner confirmed in live website screenshots that a previously failing immigration PDF is now processed (`解析流程已完成`) and the **Fast** assistant gives a document-specific summary of the uploaded Department of Home Affairs Bridging Visa A grant notice. This **closes the owner-observed PDF parsing/answering incident**. It does not prove independent ECS revision, every other format on live AWS, or trace-level citations.

**Source:** `hotfix/document-processing-reliability-20261016`, implemented in `94bb397c617f57ead7706dfca4d106ffaff830af` and `4e339a0b7cb448257b4ec3074bf03c7b65cd0658`. Packaging fix adds missing PDF.js `pdf.worker.mjs` to the Next standalone runtime; corrects misleading `malformed_document`/HTTP 409 infrastructure errors into retryable 503/504 and preserves genuine file-validation 422/state-conflict 409 and explicit failed-run retry. The prior Stripe VIP fix and role access are unchanged.

**Local production runtime evidence:** Node 22 `linux/amd64` Docker build and native PDF worker execution passed. The 11-format × 3 synthetic sizes × 20 iterations gate passed **660/660 runs**; JPEG/PNG used mocked Vision. Eleven focused document test files passed; synthetic upload-to-Fast evidence path tested PDF, DOCX, TXT, XLSX, PNG with in-memory storage/mock Fast transport. The previous 44 standalone TypeScript diagnostics remain baseline; production build/type stage passed. No migration. Performance/limits: [Hotfix report and post-deployment addendum](./audits/DOCUMENT_PROCESSING_HOTFIX_PERFORMANCE_2026_10_16.md).

**Release evidence limit:** Owner supplied ECR Chatbot digest `sha256:d7f0fd76ed378a12130682154d3a5b1040bab9b56dd3b1869f2d015db3f057bb` and completed the website test after deployment instructions for ECS Staging Web. Earlier confirmed Web task revision was `:46`; the next revision was expected `:47`, **but no final ECS deployment-success transcript or independent active-task image inspection is present**. Do not state `:47` as independently verified. This documentation update is **docs-only** and requires no Docker rebuild/AWS deployment.

**Conversation Files UI observation:** After upload, composer showed count 1 and **My Historical Files** showed the parsed file, but **Conversation Files** remained empty. A full reload showed the file in Conversation Files. Source suggests missing cross-panel refresh wiring (`documentsRevision` passed to history but not the sibling conversation-file panel). **Owner explicitly declined/deferred fixing this**; leave source unchanged, browser reload is adequate for now. The original upload/processing and AI summary worked.

**Authoritative incident / live acceptance record:** [AWS Staging Document Processing Live Acceptance 2026-10-16](./deployments/AWS_STAGING_DOCUMENT_PROCESSING_LIVE_ACCEPTANCE_2026-10-16.md). Earlier 2026-10-16 audit and “READY FOR EXTERNAL REVIEW / no deployment” sections below describe their historical pre-deployment point in time and are **superseded for current functional status**; retain their original evidence and limitations.
<!-- END DOCUMENT_PROCESSING_LIVE_ACCEPTANCE_2026_10_16 -->

<!-- BEGIN DOCUMENT_PROCESSING_AUDIT_2026_10_16 -->
## 2026-10-16 (historical investigation): all-format document processing audit

**Investigation:** branch `audit/document-processing-all-formats-20261016`, based on `c0f10c9ddb73b451552cb8ec59fe8171293d3ed6`. The detailed source map, 11-format matrix, commands, evidence, limits, Q1–Q10 answers and proposed repair plan are in [the Phase 12 document processing audit](./audits/DOCUMENT_PROCESSING_ALL_FORMATS_AUDIT_2026_10_16.md).

**Confirmed local production-image finding:** the Node 22 standalone image contains PDF.js `pdf.mjs` but not dynamically loaded `pdf.worker.mjs`. PDF.js therefore fails with a missing module; `extractPdfInternal()` rewrites it as `malformed_document`, and the processing endpoint returns HTTP 409. Eight other Worker formats passed in the same local production image. This is a high-likelihood explanation for the two reported PDF failures, not direct proof from their inaccessible files or deployed `:46` image.

**Cross-format safety finding:** the storage transition sets `securityStatus=clean` when it marks the S3 upload `stored`, but GuardDuty reconciliation only accepts `pending`. Processing therefore may proceed before a scanner verdict, and the storage transition can overwrite a verdict if event ordering races. Actual Staging GuardDuty/S3 configuration was not verifiable with available AWS permissions. Treat `clean` as unverified until external review resolves this source-level issue.

**Validation:** local production Docker build and native-runtime import verifier passed; the verifier did not exercise PDF parsing and missed the missing PDF.js asset. Production-image parser smoke: PDF failed; DOCX, DOC, TXT, Markdown, JSON, CSV, XLSX and XLS passed. JPEG/PNG returned the expected no-provider `needs_review / vision_unavailable` state in direct parser tests. Focused document suites: 124 passed, 0 failed, 0 skipped with child-process spawning enabled. No application changes, customer data, live AI, production database, S3, AWS mutation, or deployment. AWS task-definition/ECR inspection was blocked; see report for exact errors. **No remediation implemented; stop for external review.**
<!-- END DOCUMENT_PROCESSING_AUDIT_2026_10_16 -->

<!-- BEGIN AWS_STAGING_VIP_DOCUMENT_HOTFIX_DEPLOYED_2026_10_15 -->
## LATEST — 2026-10-15: Combined VIP Payment + Universal Document Access deployed to AWS Staging (Web :46)

**Source/release:** branch `hotfix/vip-payment-universal-document-analysis-20261015`; deployed code commit `1ef7d6f6d8c0deb9d942890be18949ed91910569`, including verified Stripe Date serialization fix from `bb8b8e365dd9f81b9e0e609c983bf285ff41561e`. This and any subsequent documentation-only commits do not change the deployed app image.

**Deployment evidence (owner AWS CLI):** ECR Chatbot digest `sha256:5888fda581edb5043368799b5a2f642f95e5b82ce9c903bf881c653e7a9efda5`; ECS cluster `immigration-ai-staging`, service `immigration-ai-staging-web`, task definition **`:46`** supersedes `:45`; `services-stable` wait succeeded, reported `ECS status: COMPLETED` and `Running tasks: 1`. Operator change was limited to the Chatbot container image in the copied task definition; Legal Service image/environment, GPT-6 settings, AWS secrets and IAM/network settings, RDS, and separate Policy Sync `:11` were preserved. No database migration or repeated payment was made.

**Change 1 — Stripe VIP billing:** verified `invoice.paid` HTTP 500/`ERR_INVALID_ARG_TYPE` from passing `Date` through raw Drizzle SQL (`applyVipInvoicePaid`); fixed with `rawPgTimestamp()` string and `::timestamp` casts while preserving transactionally atomic activation, paid-invoice idempotency and later prepaid expiry. Original SQL reproduced the fault and fixed SQL passed in an isolated PostgreSQL test. Focused suite: 37 passed.

**Change 2 — documents / mode policy:** personal document upload, list, download, delete, history, and processing/retry now allowed for authenticated `user`, `lawyer`, `admin` roles, scoped strictly to the authenticated owner and conversation; guests excluded. Registered Free customers use **Fast only**; active VIP customers and Admin retain all three modes; Lawyers retain Fast/Legal Check and require independent VIP entitlement for Premium. Both mode UI and the Legal Check API use DB-backed entitlement; Fast already receives conversation-scoped verified document evidence. Coding-agent reported 11 focused test files passed; full TypeScript still has 44 unrelated pre-existing diagnostics; coding-agent Next production build was blocked by Google Fonts network access, while owner later successfully built and pushed the production Docker image.

**Open incident / verification state:** This is a **deployed** code fix, **NOT** yet proof that the two live Stripe AUD 1.00 paid invoices have been successfully reconciled to VIP, or that Free Fast/Admin/Lawyer document upload and AI analysis have passed real staging smoke. Stripe dashboard after deployment still showed *historical* HTTP 500 attempts; a selected older attempt's Resend was disabled (`Only the most recent delivery attempt can be resent`), with automatic retry still pending. Check the latest attempt for each distinct `invoice.paid` event, resend only the most recent eligible attempt if necessary, verify HTTP 200 and actual user membership; never charge again. For documents, verify clean/extracted evidence use and strict Free mode restriction without bypassing cross-owner/malware controls.

**Canonical full deployment and incident record:** [AWS Staging combined VIP/document Hotfix 2026-10-15](./deployments/AWS_STAGING_VIP_PAYMENT_DOCUMENT_HOTFIX_2026-10-15.md). This deployed-state block supersedes the historical pre-deployment 'pending' paragraphs immediately below; the 2026-10-14 Web `:45` and Stage 3 `:44` entries are historical baselines, not the current running Web revision.
<!-- END AWS_STAGING_VIP_DOCUMENT_HOTFIX_DEPLOYED_2026_10_15 -->

<!-- BEGIN VIP_DOCUMENT_ACCESS_HOTFIX_2026_10_15 -->
## 2026-10-15 Combined VIP Payment and Universal Document Access Hotfix

**Branch/base:** `hotfix/vip-payment-universal-document-analysis-20261015`, based on the already validated payment hotfix commit `bb8b8e365dd9f81b9e0e609c983bf285ff41561e`. The prior VIP invoice-paid fix is included unchanged; its original incident and validation record remains immediately below.

**Incident and scope:** authenticated Lawyer and Admin accounts were excluded from personal document APIs, while the mode-access policy let registered Free users select Legal Check. The combined hotfix opens owner-scoped document operations to every registered role and enforces the requested Free-only Fast lane.

**Document access:** the shared document API gate accepts authenticated `regular` users with database/session roles `user`, `lawyer`, or `admin`. Upload, conversation list, metadata, download, delete, account history, extraction status and processing/retry use the authenticated owner ID. Guests remain excluded. Role membership does not grant access to another account's files; filename/MIME validation, size limits, storage, malware/security states, deletion, and evidence eligibility remain on the existing pipeline. The workspace continues to enable upload for any registered account and retains read-only conversation controls.

**Mode enforcement:** `/api/assistant-mode-access` builds its policy from `getUserEntitlementById()`. Free users receive Fast only; active VIP users retain Fast, Legal Check, and Premium; Admin keeps all modes; Lawyer retains Legal Check and gets Premium only under the existing active-VIP/admin entitlement rule. The Legal Check API now checks the database entitlement before conversation-turn persistence and Legal Service invocation. Premium continues to use its existing database-authoritative guard. Per-route request schemas reject cross-mode spoofing, including Premium sent to Fast. The workspace falls back from a stale Free user's saved mode to Fast and displays localized Chinese/English VIP requirements.

**Analysis and provenance:** no new analysis route or storage path was added. Fast, Legal Check, and Premium continue to use the existing owner-and-conversation-scoped document context, bounded evidence packet, processing eligibility, and customer-document acknowledgement/provenance contract. Unit coverage exercises Admin/Lawyer-owned document uploads and evidence resolution, cross-account denial, guest rejection, pending/unsafe evidence filtering, and read-only conversation behavior.

**Validation:** 11 focused Node test files passed (0 failed, 0 skipped), covering assistant-mode policy and route schemas, document service/authorization, extraction processing, evidence filtering and provenance, workspace upload/read-only wiring, and localized copy. Changed-file Biome check passed on 12 TypeScript files. `git diff --check` passed. `pnpm exec tsc --noEmit --pretty false` reports the documented **44 pre-existing diagnostics**; none are in files changed by this hotfix. `pnpm build` reached Next.js production compilation but could not fetch Geist/Geist Mono from Google Fonts in this network-restricted environment. No database-backed integration test, live AI call, Stripe action, customer-account mutation, AWS operation, or migration was run. No model configuration changed.

**Release state (historical coding-agent handoff, before deployment):** committed and pushed for review, without AWS operations in that coding task. **Subsequently deployed** by the owner as AWS Staging Web `:46` using Chatbot ECR digest `sha256:5888fda581edb5043368799b5a2f642f95e5b82ce9c903bf881c653e7a9efda5`. Billing recovery and actual document-analysis smoke remain pending; consult the latest block at the top and the dedicated deployment record.
<!-- END VIP_DOCUMENT_ACCESS_HOTFIX_2026_10_15 -->

<!-- BEGIN VIP_PAYMENT_ACTIVATION_HOTFIX_2026_10_15 -->
## 2026-10-15 Emergency VIP Payment Activation Hotfix

**Incident:** AWS Staging Web task definition `:45` returned HTTP 500 for verified Stripe `invoice.paid` deliveries, leaving paid VIP subscriptions unprojected to user entitlements. No customer identifiers or payment credentials are recorded here.

**Root cause verified:** `applyVipInvoicePaid()` placed `currentPeriodEnd` (`Date`) directly into raw Drizzle SQL while assigning the `timestamp without time zone` `User.vipExpiresAt` column. The raw `sql` parameter bypassed the column encoder. Against the isolated PostgreSQL test database, the installed Drizzle/postgres.js path reproduced the incident exactly: `TypeError [ERR_INVALID_ARG_TYPE]` from `Buffer.byteLength(Date)` in postgres.js 3.4.5. The new integration test failed on that original expression and passed after the fix.

**Fix:** convert the period end with the existing `rawPgTimestamp()` helper and explicitly cast both raw string parameters to `::timestamp`. The existing `GREATEST(COALESCE(vipExpiresAt, periodEnd), periodEnd)` projection is unchanged, preserving first activation, renewal idempotency, and later prepaid VIP expiry. No application schema or migration changed.

**Retry safety:** the entitlement update, invoice marker, notification outbox insert, and event completion share one transaction. A SQL exception rolls that transaction back; the webhook processor marks the claimed event failed and returns a retryable outcome, which the route maps to HTTP 500. Failed events can be reclaimed with a new processing token; if an earlier attempt committed, the invoice-ID guard prevents extending entitlement twice. [Stripe's retry policy](https://docs.stripe.com/webhooks#automatic-retries) says live webhook deliveries are retried for up to three days with exponential backoff. The event timestamps/delivery state for the affected deliveries were not inspected, and no event was resent; whether those specific events remain in Stripe's automatic retry window is unconfirmed.

**Validation:** the real PostgreSQL integration test invokes `applyVipInvoicePaid()` through Drizzle/postgres.js and covers first activation, renewal, duplicate invoice delivery, and preservation of later existing VIP expiry. Controlled red/green verification reproduced the exact postgres.js `ERR_INVALID_ARG_TYPE` on the original expression and passed with the hotfix. Focused billing/webhook-processing/entitlement suites: **37 passed, 0 failed, 0 skipped**. Changed-file Biome check passed. Focused TypeScript check for `queries.ts` and this integration test passed; the full chatbot TypeScript check still exits 2 with **44 existing diagnostics in unrelated files**, and none in the changed TypeScript files. `git diff --check` passed. Tests used synthetic `example.test` fixtures in the isolated `immigration_ai_phase12_stage1_test` database only; that disposable database was removed after validation. No live Stripe action, customer-account/payment mutation, AWS operation, or model configuration change was performed.

<!-- END VIP_PAYMENT_ACTIVATION_HOTFIX_2026_10_15 -->


<!-- BEGIN AWS_STAGING_FAST_GPT6_CORRECTION_2026_10_14 -->
## LATEST correction: AWS Staging Fast mode upgraded to GPT-6 (2026-10-14)

**Supersedes the previous “Web :44 is current” operational summary, but not its historical deployment evidence.** The owner identified a missed environment variable: on Web task definition `:44`, `FAST_LUNA_MODEL` was **not set**, and `legal-service/app/core/config.py` defaults to **`gpt-5.6-luna`**. Thus an earlier statement that Fast already used GPT-6 was incorrect; Fast was not covered by `DEFAULT_AGENT_MODEL`.

**Fix deployed / owner AWS CLI output:** Web ECS task definition **`immigration-ai-staging-web:45`**, with **`FAST_LUNA_MODEL=gpt-6-luna`** explicitly added to the `legal-service` container environment (no new images or database migration). Owner command returned `Registered revision: 45`, `SUCCESS: GPT-6 Fast deployment completed`, `Task revision: 45`, `FAST_LUNA_MODEL: gpt-6-luna`, and **`Running tasks: 1`** after the `services-stable` wait and rollout-state assertions. **`:45` is now current; `:44` and `:43` are historical references**, not the current deployment.

Other previously verified task configuration: `DEFAULT_AGENT_MODEL=gpt-6-luna`, `LEGAL_FACT_CHECK_MODEL=gpt-6-luna`, `COMPACT_CHECKER_MODEL=gpt-6-luna`, `PREMIUM_AGENT_MODEL=gpt-6.1-sol`, `PREMIUM_DIRECT_PRIMARY_MODEL=gpt-6.1-sol`, `PREMIUM_DIRECT_FALLBACK_MODEL=gpt-6-luna`. Unset `PREMIUM_DIRECT_TERMINAL_MODEL` inherits fallback via source configuration. `GENERAL_QA_MODEL` and `REASONING_MODEL` intentionally remain `gpt-5.4-mini`. Separate Policy Sync Task Definition `:11` remains `POLICY_INTELLIGENCE_MODEL=gpt-6.1-sol` with Scheduler targeting `:11`.

**Evidence boundary:** ECS configuration and stable service are verified by the owner's output. No new live provider request, CloudWatch serving-model trace, or policy-sync scheduled execution was performed as part of this correction; do **not** describe actual per-request model identity as independently proven. Owner requested minimal necessary action, no additional test campaign. See [staging deployment record](./deployments/AWS_STAGING_PHASE12_STAGE3_2026-10-14.md) for the chronological rollout and this corrective addendum.
<!-- END AWS_STAGING_FAST_GPT6_CORRECTION_2026_10_14 -->


<!-- BEGIN AWS_STAGING_STAGE3_DEPLOYED_2026_10_14 -->
## LATEST: Phase 12 Stage 3 — AWS Staging deployment COMPLETED / owner accepted (2026-10-14)

**This is the current continuation state** and supersedes historical notes below saying Stage 3 was uncommitted, undeployed or awaiting staging. **Code commit:** `b760c028674efe4fd40190d8b212167729e74348` on `codex/phase12-stage3-policy-intelligence`. **Full deployment and recovery record:** [AWS Staging Stage 3 deployment](./deployments/AWS_STAGING_PHASE12_STAGE3_2026-10-14.md). The repository update containing this section is **docs-only**, after the application image release.

- **Database:** `immigration-ai-staging-postgres-secure`, `chatbot` DB, migrated **0023 → 0029** (all 0024–0029); preflight exit 0 and `ledgerStatus=current`. Encrypted, available pre-migration snapshot: `immigration-ai-staging-secure-pre-stage3-20261014`. Legal Service separately connects to `immigration_legal` on the same Secure RDS. No secrets were published.
- **Web:** `immigration-ai-staging-web:44` deployed from `b760c02`; ECS rolling deployment `COMPLETED` at 1 running / 1 desired, ALB `healthy`; previous `:43` retained for app rollback, circuit breaker + automatic rollback enabled. Both containers `RUNNING`; ECS health `UNKNOWN` is expected with absent container-level probes. Default/Fast/checker settings → `gpt-6-luna`, Premium → `gpt-6.1-sol`; six named model vars changed, other task settings held constant. `GENERAL_QA_MODEL`/`REASONING_MODEL` remain `gpt-5.4-mini`.
- **Owner acceptance:** All three AI answer modes manually answered successfully. New Legal Service query logs showed **three HTTP 200 responses** (8.1, 30.8, 40.7 seconds); Chatbot → Legal Service `/api/v1/query` integration confirmed in route code. Owner explicitly **accepted staging and waived further optional smoke/regression tests**. Waived tests must not be reported as executed PASS.
- **Policy Intelligence:** separate `immigration-ai-staging-policy-sync:11` registered using Stage 3 policy-sync image, with explicit `POLICY_INTELLIGENCE_MODEL=gpt-6.1-sol`, `POLICY_INTELLIGENCE_ENABLED=true`. EventBridge Scheduler `default/immigration-ai-staging-policy-sync-daily` **ENABLED**, now points to `:11`, expression `cron(0 6 * * ? *)`; timezone unverified. The first future scheduled `:11` job has **not** been observed; do not claim scheduled runtime PASS or manually trigger it without new owner request.
- **Boundaries / next turn:** **Staging deployment accepted**, not production deployment or formal comprehensive Gates 1–3 acceptance. No further testing, billing activation, forced ECS restart, policy sync run, AWS cleanup, DB writes or deployment is requested. Await a specific new development instruction or observed issue. Preserve `:43`, Policy Sync `:10`, and the pre-migration snapshot. A Fargate platform retirement email needs no force-redeploy for the Web task launched on 2026-10-14; other affected resources were not audited.
<!-- END AWS_STAGING_STAGE3_DEPLOYED_2026_10_14 -->


<!-- BEGIN PHASE12_STAGE3_OWNER_SIGNOFF_2026_10_14 -->
## LATEST: Phase 12 Stage 3 — owner functional closeout (2026-10-14)

**Authoritative latest state:** The owner declared Stage 3 core functionality complete and accepted on 2026-10-14. Stop further Stage 3 feature work and bespoke testing; defects observed later in real lawyer use will be triaged individually. This current record supersedes historical "Stage 3 not started/not authorized" status statements below, which are retained as historical context.

- **Repository/worktree at sign-off:** `jiangdizhao/immigration_ai`, `codex/phase12-stage3-policy-intelligence`, pre-closeout committed HEAD `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419`; substantial local Stage 3 changes were uncommitted. This document update is to be committed/pushed together with those changes. Record the actual post-push SHA separately; do not assert a SHA that has not yet been verified.
- **Scope completed/owner accepted:** Official policy discovery, AI full-analysis and source-first publication (D-072), minimal structural banner/navigation exclusion and honest public grouping (D-073), D-071 compatibility/durable coexistence and controlled import, manual bilingual editing/publication, verified principal-lawyer Admin editorial authority (D-070), explicit lawyer grants, override/force-publish, archive/restore, official URL submission and direct **Publish Official Source** from a valid snapshot without an AI analysis revision. D-065 human-final editorial authority and `human_protected` publication remain foundational.
- **Actual owner-browser PASS:** Imported the LIN 26/061 compatibility entry into a durable draft; edited and published it from the Admin account without a grant; observed `Editor-protected` and one public policy card rather than a duplicate. Admin Archive/Unpublish initially failed with `validation_failed` because the Admin PATCH dispatcher leaked `action` into a strict handler body; the focused fix resolved the failure. Subsequent owner-browser archive and restore both succeeded: public visible count `4 -> 3 -> 4`, and the bundled compatibility entry did not resurrect while archived.
- **Explicit owner acceptance/waivers:** The owner accepts blank-slate manual policy creation from the demonstrated shared editor/publication flow without a separate browser run; accepts Grant/Revoke, AI-held Force Publish, official URL submission, and Publish Official Source functionality for Stage 3 closeout without further case-by-case testing. The last feature's UI was observed, but successful publication using that button was **not separately demonstrated** in the provided screenshots. These are owner acceptance decisions, not fabricated test PASS results.
- **Sync evidence:** A real local operator-run `home-affairs-guidance` sync recorded 10 discoveries and snapshots, 9 analyzed, 8 full-analysis plus 2 source-first publications, and 0 held/failures; Federal Register source records also appeared during the local run. The `POLICY_INTELLIGENCE_ENABLED` setting had initially been unset; a one-time process override was used. A persistent daily scheduler, proposed/consultation source coverage, and live staging/production runs are **not demonstrated**. Do not confuse one-shot sync with a deployed scheduled job.
- **Engineering evidence (Coding Model reported, not independently reproduced at closeout):** 877/877 chatbot unit tests, production `pnpm build` PASS, 44 known TypeScript diagnostics versus 45 in the pre-Stage-3 baseline. Existing Stage 3 migration artifacts must remain accounted for; later D-072/D-073/source-publish corrections reported no *additional* migration. Do not claim the full isolated-PostgreSQL or staging Gate 3 test suite passed.
- **Approval boundary:** **Stage 3 core functionality OWNER SIGNED OFF; original formal Gate 3 NOT ACCEPTED** because required cross-environment, negative authorization, comprehensive integration, staging E2E and other deferred checks were not all executed. Stage 1 formal Gate 1 and Stage 2 original Gate 2 also remain open. No production deployment, merge into protected branches, AWS/Stripe activation, or full Phase 12 release acceptance is implied.
- **Next action:** Review local `git status`/staged paths for unintended files or secrets, commit/push the complete Stage 3 implementation and these closeout docs on the Stage 3 branch, then verify local HEAD equals the remote branch SHA. Do not start another Stage 3 coding or test cycle without a concrete observed bug.
<!-- END PHASE12_STAGE3_OWNER_SIGNOFF_2026_10_14 -->


**Updated:** 2026-10-14 (D-072 publication-gate rebaseline: subjective AI publication veto removed, source-first fallback added; R4 work retained; nothing committed/pushed)
**Stage 2 branch:** `codex/phase12-stage2-context-ui` — committed/pushed code checkpoint `7031b37292410597c4411b8a9b60f10bdf35b823` (D-061 and D-062 both included); current change is documentation-only.
**Stage 2 implementation checkpoint:** `7031b37292410597c4411b8a9b60f10bdf35b823` (D-062 source independently reviewed; owner-host Fast/Legal Check/Premium document test PASSED).
**Stage 2 expected start commit:** `3541a3dfc72efc9fc9f4fe5d824c052f09d3a4cd` is the direct parent of `ce4e803`; the base used for the R1/R2/closure work was `ce4e803`
**Stage 2 working directory used:** `/home/rico/immigration_ai` — the path named in the Stage 2 task (`/home/rico/immigration_ai_phase12_stage2`) does not exist on this host
## Phase 12 Stage 3 — D-073 minimal structural exclusion + default publication (2026-10-14; worktree only, NOT committed/pushed)

**Branch / base:** `codex/phase12-stage3-policy-intelligence` @ `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419` (unchanged). R1–R4, D-065, D-070, D-071 and D-072 are preserved; this entry adds the owner-directed D-073 correction over the same uncommitted worktree.

**P0 — public visibility defect fixed.** `getPolicyPresentationGroup` (`lib/policy-intelligence-product-copy.ts`) is now a total function with three visible groups: `published`, `proposed`, and the new `official_update` (enacted_not_commenced, superseded, withdrawn, unknown, plus any future unmapped status). A published source-first record with unverified legal effect can no longer be filtered out of `/intelligence`: the page renders a third “03 · OFFICIAL UPDATES” group, the status filter offers the third option, the badge uses the precise honest status (“Legal effect not yet verified”, “Enacted, not yet commenced”, …) and never implies legal force, and the home-page preview no longer filters on a null group. No persistence/status-taxonomy change (no migration).

**P0 — minimal structural presentation exclusion (discovery).** New exported helpers in `scripts/policy-intelligence-discovery.ts`: `stripPresentationRegions` (nav/header/footer), `stripPresentationTokenRegions` (balanced removal of blocks whose own `class`/`id`/`data-*` declares a structural display token), `stripPresentationComponents`, `isPresentationAnchor` (presentational ARIA role / `aria-hidden` / structural token), `isNavigationOnlyHref` (empty/fragment/`javascript:` wrappers) and `isPresentationOnlyAlertComponent` (only the source-provided `type`/`category` naming a display component: banner, site-banner, campaign-banner, advertisement, promotion(al), display, navigation, menu). `parseListingLinks` extracts from content only; the Home Affairs alert path filters presentation-typed items. Titles, candidate text, AI opinions, uncertainty, proposed/consultative status, low importance and procedural topics never exclude anything; unknown values keep the candidate. Destinations are never blacklisted — a URL referenced from substantive content or a substantive alert is still discovered (verified by test).

**P1 — source-first fingerprint stability.** The source-first revision identity is now snapshot + content kind only (`computePolicyAnalysisFingerprint(..., { contentKind: "source_first" })`); the AI failure reason is diagnostic metadata. Different failure reasons on the same snapshot never create a second source-first revision (verified), while a later successful analysis still produces a distinct enriching revision (verified: two revisions, one published revision pointer, no duplicate card).

**P1 — provider failures vs programming errors.** `sourceFirstReasonForAnalysisFailure` / new `sourceFirstReasonForVerifierFailure` return a fallback reason only for typed recoverable failures (timeout/abort, provider error, empty/invalid structured output, schema/type validation, unknown-evidence model output). `analysis_internal_error` and plain untyped exceptions are genuine failures again (recorded in candidate failures, no publication); operator-disabled providers keep their explicit failure.

**Validation.** `pnpm test:unit` — **869 tests, 869 pass, 0 fail, 0 skipped, exit 0**; `pnpm build` — **exit 0**; `pnpm exec tsc --noEmit` — **44 errors, below the 45-error pre-task baseline**; focused suites: discovery 34/34 (3 new D-073 cases), publication-policy 16/16 (3 new D-073 cases), pipeline 59/59, product-copy 2/2. Migrations: **none required** (code-level changes only).

**Owner manual acceptance (existing `chatbot` DB, port 3000)** — after restart (no migration):
1. `/intelligence`: a source-first item with unverified legal effect now appears under “Official updates (not in force or awaiting confirmation)” with the badge “Legal effect not yet verified”; the status filter has three options and counts match the visible list.
2. Run a source sync and confirm banner/navigation chrome from `home-affairs-announcements` / `home-affairs-consultations` / `ministerial-announcements` listing pages no longer appears as candidates, while genuine announcement/consultation links still do (including a destination that a banner also pointed at).
3. Re-run a sync where the analyzer fails twice for different reasons: the same source-first card must not duplicate.
4. Confirm lawyer protection: force-publish, override, archive/restore, human-protected holds and D-071 compatibility merge are unchanged.

**Limitations stated honestly.** Only structurally identifiable presentation components are excluded. A URL referenced exclusively by a presentation-typed component, or a component whose markup is indistinguishable from content, is not excluded; some low-value content may still publish and can be archived by the lawyer. No new screening system was added, and no broad test campaign is recommended.

## Phase 12 Stage 3 — Publish Official Source: lawyer direct publication of a stored official snapshot (2026-10-14; worktree only, NOT committed/pushed)

**Problem:** after a real sync (10 discovered, 10 snapshotted, 9 analysed, 8 full-analysis publications, 2 source-first, 0 failures) items such as `Migration (Student Visa Applications to Be Made from outside Australia) Instrument 2026` remained `draft` with a stored snapshot and **no** analysis revision (`analysis_revision_unavailable`). Force Publish needs an AI revision, so the principal lawyer could not publish an authentic official source.

**Feature:** authorized editors can now publish the item's persisted official snapshot directly through D-072's `source_first` representation — no AI, no analyzer, no verifier, no publication gate.

**Files:** `lib/policy-intelligence/editorial-core.ts` (`EditorialSourceSnapshotRow`, tx `getSourceSnapshotForItem`, optional `schemaVersion`/`modelMetadata` on `insertRevision`, `officialSourceRevisionFingerprint`), `editorial-repository.ts` (postgres lookup + revision fields), `editorial-memory.ts` (`sourceSnapshots`, `seedEditorialSourceSnapshot`, tx method, revision fields), `editorial-service.ts` (`publishOfficialSource`), `editorial-api.ts` (`publishSourceSchema`, `handlePublishOfficialSource`, Admin action union), `contracts.ts` (`lawyer_source_publication` reason), `publication-diagnostics.ts` (explanation), new route `app/api/policy-editor/publish-source/route.ts`, `components/admin-policy-intelligence.tsx` (inline-confirmed button), `lib/policy-intelligence/editorial-api.test.ts` (6 new tests).

**API/UI:** `PATCH /api/admin/policy-intelligence` with `{ itemId, action: "publish_source" }` (Admin page) and `POST /api/policy-editor/publish-source` with `{ itemId }` (granted editors). The Admin row shows **Publish Official Source / 发布官方来源** whenever a stored snapshot exists and the item is not archived; the inline confirmation states that no AI analysis is included and that the legal-effect status is never assumed to be in force.

**Authorization:** `requirePublicationAuthority` re-verified inside the transaction — verified principal-lawyer Admin (inherent) or verified lawyer with an active Policy Editor grant; unverified admins, ungranted lawyers, cross-site requests and unknown fields stay denied/rejected with no writes. **Protection:** the same transaction sets `publicationMode: human_protected` (+ set-at/by), so the pipeline's hold branch stores later AI revisions as `review_required` instead of replacing the publication; no lawyer-authored analysis is fabricated; edit/revise/archive/restore/release are unchanged. **Idempotency:** `officialSourceRevisionFingerprint` (snapshot + source-first contract) plus the unique `(snapshotId, analysisFingerprint)` index; a repeat returns `unchanged` with no new revision or audit row; archived items return `item_archived`; a missing snapshot returns `validation_failed: no_source_snapshot`. **Honesty:** the item status is `unknown` unless the acquisition recorded an explicit allowlisted declared status, so `/intelligence` shows the record in D-073's `official_update` group with the badge "Legal effect not yet verified" and provenance `official_source_update`.

**Validation:** `pnpm test:unit` **877/877 pass, 0 fail, 0 skip, exit 0**; `pnpm build` **exit 0**; `tsc --noEmit` **44 (below the 45 baseline)**; Biome clean; no migration, no new table, no live sync, no paid call, no database mutation.

**Owner browser acceptance (localhost:3000, no migration; restart `pnpm dev` so the new route/compiler output is loaded):**
1. Sign in as the verified principal-lawyer Admin, open `/admin/policy-intelligence`.
2. Find `Migration (Student Visa Applications to Be Made from outside Australia) Instrument 2026` (status `draft`, Latest source snapshot available) and click **Publish Official Source / 发布官方来源** — the inline confirmation appears in the row.
3. Click **Confirm publish** → notice “Official source published.”, Editorial status `published`.
4. Open `/intelligence` (hard refresh): the item appears under **Official updates (not in force or awaiting confirmation)** with provenance “官方来源更新 / Official source update (AI analysis pending)”, the official title/link and the verbatim excerpt; it is not labelled as being in force.
5. Re-run the same source sync: the item is held (not replaced, no duplicate card). Clicking the button again reports “This official source is already published.”
6. Optional: archive the item (it disappears) and restore it (it returns to the published source notice).

**D-073 owner-host correction (same day) — Admin Archive/Unpublish returned `validation_failed`.** Root cause: the Admin PATCH route forwarded its own routing field (`action`) into the strict archive/restore handler schemas (`{ itemId, reason? }` / `{ itemId }`), so `safeParse` failed and the request returned `400 validation_failed` before authorization, service or audit — nothing was written. The unit-tested legacy `handleAdminPolicyIntelligenceUpdate` (schema `{ itemId, action }`) is not wired to any route, which is why tests passed while the owner's browser failed; the Policy Editor routes post `{ itemId }` only and were never affected. Fix: new exported `handleAdminPolicyItemAction` in `lib/policy-intelligence/editorial-api.ts` validates the Admin payload once with a strict discriminated union and forwards only the handler payload; `app/api/admin/policy-intelligence/route.ts` now delegates to it. Files: `lib/policy-intelligence/editorial-api.ts`, `app/api/admin/policy-intelligence/route.ts`, `lib/policy-intelligence/admin-api.ts` (clarifying comment only), `lib/policy-intelligence/editorial-api.test.ts` (2 new regression tests). No validation/authorization/CSRF/audit rule weakened; unknown keys, slug-shaped ids, unknown actions, unverified admins, ungranted lawyers and cross-site requests are still rejected. Validation: `pnpm test:unit` **871/871 pass, 0 fail, 0 skip**, `pnpm build` **exit 0**, `tsc --noEmit` **44 (below the 45 baseline)**, Biome clean, no migration.

**Owner browser retry (no migration, no restart required if the dev server hot-reloads; otherwise restart `pnpm dev`):**
1. Sign in as the verified principal-lawyer Admin and open `http://localhost:3000/admin/policy-intelligence`.
2. On `evisitor-application-arrangements-lin-26-061` click `Archive / Unpublish`; expect the notice “Policy archived.”, the row’s Editorial status to become `archived`, and no `validation_failed`.
3. Open `http://localhost:3000/intelligence` (hard refresh) — the policy must be gone from the listing (archived items are not public and the bundled compatibility entry for that slug stays suppressed, D-071).
4. Back on the Admin page click `Restore` on the same row; expect “Policy restored.”, Editorial status `published`, and the policy visible again on `/intelligence` with its previous published revision.
5. Optional audit check: the item’s audit trail shows `archive_policy_item` then `restore_policy_item` with the Admin actor.

**Non-goals / not run:** no commit/push/deploy, no migration creation or application, no database mutation, no new database, no AWS/Stripe change, no paid provider call, no live/bulk publication run, no destructive integration or browser suite.



**Branch / base:** `codex/phase12-stage3-policy-intelligence` @ `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419` (unchanged). R1–R4, D-065, D-070 and D-071 are preserved exactly as-is; this entry adds the owner-directed removal of the subjective AI publication veto, uncommitted.

**What changed (D-072).**
- `evaluatePublicationGate` is replaced by `evaluatePolicyPublicationDecision` (`lib/policy-intelligence/contracts.ts`): a discriminated decision (`full_analysis` | `source_first` | `blocked`) where **source identity is the only blocker**. Relevance classification, status certainty, verifier disagreement, partial interpretations and evidence truncation are recorded as advisories. `pruneUnpublishableAnalysis` withholds only deterministically unsupported prose (unsupported units; partial source facts; partial interpretations without bilingual qualification; units whose supported claims were all withheld; sections that would empty a required section) and downgrades an unverifiable status to `unknown` (`POLICY_SOURCE_STATUS_VALUES` gained `unknown`; `sourceStatus.claimRef` is nullable only for `unknown`). No thresholds, keyword lists or scores were introduced.
- `lib/policy-intelligence/pipeline.ts` now catches analyzer outage/malformed output and verifier outage/invalid output and publishes **source-first** instead of failing or holding; records warnings in the new `candidateWarnings` run telemetry (classified code + safe message); increments the new `sourceFirstPublishedCount`; keeps provider-disabled runs as explicit failures; fingerprints source-first revisions distinctly so a later successful analysis enriches the same item (no duplicates, no erased history) and repeated runs remain idempotent.
- New typed source-first representation: `contentKind = "source_first"` (+ `POLICY_SOURCE_FIRST_SCHEMA`), `analysis`/`verification` NULL, `modelMetadata.sourceFirst = { reason }` + `advisories` + `withheld`. **No migration is required** (varchar type-level enums only). The public projection renders provenance `official_source_update`, `analysisPending: true`, the official title, a bounded verbatim official excerpt (`lib/policy-intelligence/source-first.ts`) and honest `unknown` status; the AI disclaimer is never shown for a notice.
- Observability: run metadata gains `candidateWarnings`, `sourceFirstPublishedCount`, `advisoryCount`, `advisoryReasons`; the Admin sync-run table shows Published (analysis / source-first), held/failures and the advisory breakdown; the item diagnostics panel now lists **advisory signals (non-blocking)** separately from structural blockers.
- Analyzer/verifier prompts were rewritten for the advisory contract (a consultation/proposal is a publishable update; uncertainty about enactment is expressed, never vetoed) and the implementation versions moved to `v2.3`, which intentionally re-analyzes stored snapshots under the corrected policy.
- New regression suite `lib/policy-intelligence/publication-policy.test.ts` proves the required properties (consultation published while enactment is uncertain; uncertain relevance publishes; verifier disagreement never vetoes; unsupported claims are not published as facts; analyzer timeout/malformed → honest source-first; missing/unsafe source identity still blocked; idempotent re-sync; archived items not republished; editor-protected items never silently replaced; source-first public projection + bilingual labels; metrics distinguish releases from holds; honest status derivation). The destructive read-path assertion lives in `editorial.integration.test.ts` (skipped without the isolated test database).

**Validation (this task).** `pnpm test:unit` — **863 tests, 863 pass, 0 fail, 0 skipped, exit 0**; `pnpm build` — **exit 0**; `pnpm exec tsc --noEmit` — **44 errors, one below the 45-error pre-task baseline** (baseline measured by rebuilding the pre-D-072 tree from `/tmp/r4-base` and running the same tsconfig); focused suites: pipeline 59/59, publication-policy 13/13, publication-diagnostics 7/7, admin-api 5/5, editorial-service + product + binding green. Migrations were not created or applied; no database, AWS/Stripe or deployment change; nothing committed or pushed.

**Owner manual acceptance on localhost:3000 (`chatbot` DB)** — no migration needed; corrected behaviour appears after the next source sync:
1. Run a source sync (operator UI or `pnpm policy:sync`) and check `/admin/policy-intelligence` → "Recent source sync runs": `Published (analysis / source-first)` splits releases; `Advisories` lists recorded AI/verifier signals; `Held / failures` counts only genuine technical holds and human protection.
2. Confirm previously withheld items publish: a source whose verifier/relevance opinion was previously adverse now appears on `/intelligence`, with the honest status ("Legal effect not yet verified" when the status could not be verified) and the Admin item panel listing the advisories.
3. Force a source-first fallback (deliberately failing model) and confirm the item appears as an "Official source update (AI analysis pending)" card with the official excerpt and link, no AI disclaimer and no lawyer-commentary label; re-run with a working provider and confirm the same item is enriched by a newer full analysis without duplication. (With the provider *disabled* the pipeline keeps an explicit failure rather than publishing notices.)
4. Verify archived items stay hidden, editor-protected items still hold newer revisions, and lawyer force-publish/override/manual authoring are unchanged.

**Non-goals / not run:** no commit/push/deploy, no migration creation or application, no new database, no AWS/Stripe change, no paid/live provider evaluation run. The destructive Stage 3 PostgreSQL integration suite (now also covering source-first read and compatibility import) remains **owner-run** because the isolated test database must be created first (`pnpm phase12:test-db create && pnpm phase12:test-db migrate`, then `pnpm test:phase12:stage3:integration` with `PHASE12_TEST_DATABASE_URL`).



## Phase 12 Stage 3 — owner-host correction R4 (2026-10-13; worktree only, NOT committed/pushed)

**Branch / base:** `codex/phase12-stage3-policy-intelligence` @ `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419` (unchanged). The R1/R2/R3 and D-070 work is retained exactly as-is; this entry adds the three fixes found during owner-host browser acceptance on `localhost:3000`, uncommitted.

**Issue 1 — public/Admin policy sources disagreed (fixed).** The public `/intelligence` page listed only the bundled compatibility registry and the Admin page only durable DB items; the *exclusive* fallback in `loadPolicyProductState()` dropped all compatibility entries as soon as the first durable policy was published. Now:
- The public product state merges durable published policies with the bundled registry by slug (`lib/policy-intelligence-product.ts` + a new durability read `getPolicyIntelligenceDurabilityRows()` in `lib/policy-intelligence/read-service.ts`, wired in `lib/policy-intelligence-server.ts`). Durable wins on a matching slug; a slug whose durable item has **ever published** but is not public now (archived/withdrawn/held) is suppressed so an obsolete compatibility entry can never reappear; a draft-only durable item does not hide the compatibility entry; duplicate slugs cannot produce two cards (registry duplicates remain a hard validation error).
- The Admin page now lists both sources with explicit storage/provenance: the durable table states it is the platform database, and a new read-only "Compatibility registry (bundled content)" panel (`components/admin-policy-compatibility.tsx`, service `listCompatibilityEntries()`, types in `lib/policy-intelligence/admin-api.ts`) shows storage `Bundled registry`, provenance `Reviewed compatibility content`, source identity and a per-slug durable state (`Not in the database` / `Durable draft exists` / `Durable version published` / `Durable version withdrawn`).
- Controlled idempotent import (requirement 7): `POST /api/admin/policy-intelligence/compatibility-import` (verified Admin via `requireAdminUser`, plus DB-authoritative editorial authority inside the service) → `lib/policy-intelligence/compatibility-import.ts` + pure core `lib/policy-intelligence/compatibility-entry.ts` creates a **draft** manual revision through the existing audited editorial service with a deterministic idempotency key, preserves source identity (authority/title/URL/source + commencement dates) and an explicitly non-impersonating attribution, reports an existing durable slug as `already_managed` without duplicating, and never publishes by itself. No new schema, no migration, no parallel publishing system, no mutation of existing local records.
- Honesty (requirement 8): the public provenance label for `curated_reviewed` is now "已审核的兼容内容（人工汇编，非官方原文）" / "Reviewed compatibility entry (human-compiled, not official source text)" (`lib/policy-intelligence-product-copy.ts`, `components/policy-intelligence-product-page.tsx`), and the live-availability description states that reviewed compatibility entries may be listed alongside durable analysis.

**Issue 2 — stale D-070 copy (fixed).** The "Policy Editor capability" panel still said an administrator role does not confer publication authority. `components/admin-policy-editors.tsx` now states that the Admin (principal lawyer) holds full authority inherently and that only a verified lawyer account may hold an active grant for other staff. A repo-wide grep finds no remaining stale wording, and a new regression test (`lib/policy-intelligence/editorial-authority-copy.test.ts`) scans the six Admin/Policy-Editor UI files for stale phrases and asserts the current model wording plus the compatibility-panel labels.

**Issue 3 — `TimeoutNegativeWarning: -8075.389…` (root cause proven; no code change).**
- Static scan: no application `setTimeout` passes a computed/negative delay (`lib`, `app`, `components`, `scripts`).
- `node --trace-warnings` on the full unit suite: **zero** occurrences (the suite never fails a Postgres connection).
- Deterministic reproduction against the installed driver (`/tmp/repro-postgres-negative-timer.mjs`, connection refused on 127.0.0.1:5999) produced the exact warning with this stack: `at reconnect (node_modules/.pnpm/postgres@3.4.5/…/postgres/src/connection.js:353:5) → at Object.connect (…/connection.js:113:7) → at Query.handler (…/postgres/src/index.js:336:14)`.
- Cause: `postgres@3.4.5`'s reconnect backoff `setTimeout(connect, closedDate ? closedDate + delay - performance.now() : 0)` re-enters `reconnect()` with a stale `closedDate`/`delay` after an earlier recorded close (e.g. Postgres briefly unavailable, dev-server restart, pooled reconnect). When the backoff window has already elapsed the computed remaining delay is negative and Node clamps it to 1 ms and warns. Upstream issue `porsager/postgres#1061` (identical stack); fixed upstream by commit `3ffc3c4` ("Someones engines are getting pedantic", 12 Nov 2025) but **not yet in a published 3.4.x release** as of 3.4.9. It is cosmetic (the retry still runs), not application scheduling, and not system-clock behaviour (the driver uses the monotonic `performance.now()`). No suppression was added; recommendation is to upgrade `postgres` when a release carries the fix.

**Validation (this task).**
- `pnpm test:unit` — **849 tests, 849 pass, 0 fail, 0 skipped, 0 cancelled** (includes the new `lib/policy-intelligence/compatibility-entry.test.ts`, `lib/policy-intelligence/editorial-authority-copy.test.ts`, the rewritten product-merge tests and the admin GET compatibility assertions).
- `pnpm build` — **pass** (`exit=0`, production build completed; no errors).
- `pnpm exec tsc --noEmit` — unchanged baseline (the same 45 pre-existing errors as before this task; none in the touched files).
- Focused: `policy-intelligence-product.test.ts` 34/34, `policy-intelligence-product-copy.test.ts` 2/2, `admin-api.test.ts` 5/5, `compatibility-entry.test.ts` 5/5, `editorial-authority-copy.test.ts` 3/3, `policy-intelligence.test.ts` + `policy-intelligence-registry.test.ts` 11/11.
- **NOT run:** `pnpm test:phase12:stage3:integration` (destructive PostgreSQL suite). The isolated database `immigration_ai_phase12_stage1_test` does not currently exist, and this task explicitly forbids creating databases, so the new integration test "bundled compatibility entries import into durable drafts idempotently" was **not executed** (tsc-checked only). To run it later: `pnpm phase12:test-db create && pnpm phase12:test-db migrate`, then run `pnpm test:phase12:stage3:integration` with `PHASE12_TEST_DATABASE_URL` pointing at that isolated database (the suite refuses any other database name).
- Migrations 0027–0029 were **not** applied to `chatbot` and no database was created, modified or migrated by this task.

**Continue browser acceptance on localhost:3000 (`chatbot` DB):**
1. Use the already-running dev server on **port 3000** (the owner's instance holds the `.next/dev` lock) and the existing local accounts; do **not** start a second dev server or clone the database.
2. `/intelligence` — the four bundled compatibility cards must still be present even after durable policies exist; each card shows the reviewed-compatibility provenance label; open one card and confirm the "human-compiled, not official source text" notice and the official source link.
3. `/admin/policy-intelligence` — confirm (a) the principal-lawyer copy in the header and in the "Policy Editor capability" panel, (b) the durable-table note, (c) the new "Compatibility registry (bundled content)" panel with storage/provenance/durable-state columns, and (d) that "Import into Policy Editor" only appears for entries whose durable state is "Not in the database".
4. Import one compatibility entry, open `/policy-editor`, confirm the draft with the preserved source reference and the platform-compiled attribution, publish it there, then verify `/intelligence` shows the durable card (not the bundled one) for that slug and the Admin panel reports "Durable version published".
5. Archive the imported durable item from the Admin page and confirm it disappears from `/intelligence` **and** the compatibility card does not reappear (D-071 rule); restore it to confirm the durable card returns.
6. Optionally loop the D-070 checks: publish/override/archive/restore as Admin without any grant row, and confirm an ordinary lawyer without a grant still receives `capability_required`.
7. Expect the `TimeoutNegativeWarning` from the DB driver if Postgres is momentarily unavailable; it is the verified dependency issue above and harmless.

**Non-goals in this task:** no commit/push/deploy, no migration application, no schema change, no new database, no AWS/Stripe change, no change to Phase 6/evidence/serving invariants, no paid/live provider runs.



**Gate 2 owner host status (updated 2026-10-13):** Stage 2 core functionality OWNER SIGNED OFF. D-061 policy-topic test PASSED in Legal Check and Premium; D-062 regression on ordinary no-policy conversations PASSED in Fast, Legal Check and Premium with the same saved PDF/DOCX. Migration `0026` applied to local `chatbot` database and verified. Original Gate 2 still NOT ACCEPTED due to deferred and unexecuted items. See current closeout section immediately below; earlier entries are preserved as historical implementation notes.
## Phase 12 Stage 3 — D-070 owner-directed Admin authority correction (2026-10-13; worktree only)

**Branch / base:** `codex/phase12-stage3-policy-intelligence` @ `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419` (unchanged; no commit/push/merge/deploy). All Stage 3 + R1–R3 work is preserved in the worktree and R3 remains intact (revoke-never-grants, listing authorization, bounded recovery wording).

**Owner ruling (D-070).** The Admin account is the firm's **principal lawyer**: a *verified* Admin holds full Policy Intelligence editorial authority **inherently** — no `PolicyEditorGrant` required, and ordinary grant revocation cannot remove it. The lawyer-grant system stays for other staff.

**Corrected matrix (DB-authoritative role + verification; never session claims or bodies):**

| Account | Editorial/publication | Grant management |
| --- | --- | --- |
| Verified Admin | Full (authoring, draft/publish, Force Publish, archive/restore, protection set/release, official-URL submit **and** list) | Yes |
| Verified Lawyer + active grant | Same editorial capabilities | No |
| Verified Lawyer without grant | None (`capability_required`) | No |
| Ordinary user (even with a forged grant row) | None (`publication_authority_required`) | No |
| Unverified admin/lawyer | None (`identity_not_verified`) | No |
| Unknown/unauthenticated | None (`unauthenticated`) | No |

**Code changes:** `requirePublicationAuthority()` + `canEdit()` (editorial-service) and `requireOperatorWorkflowAuthority()` (operator-submission) short-circuit on a verified `role === "admin"` before the lawyer-grant checks, so every delegating entry point inherits it (manual create/draft/publish/revise, force publish, archive/restore, protection set/release, workspace, operator submit/list, `/policy-editor` page). `isAdministrator()` remains verified-admin-only for grant management. The Admin Policy Intelligence page restores its audited Archive/Restore controls (now permitted) and the admin/editor copy describes the principal-lawyer model.

**Tests updated/added:** the service authority test was rewritten for D-070 (admin allowed; unverified admin denied; forged customer grant denied; admin authority survives grant revocation) plus a full admin workflow test (manual create+publish, force publish, protection release, archive/restore, grant/revoke, audited actions); operator-submission admin submit/list allowed with unverified-admin denial; API-level admin list 200 / unverified admin 403; integration Phase K rewritten (admin inherent authority with zero grant rows) and Phase R updated (unverified admin denied, admin allowed); integration cleanup widened to author-owned items.

**Normal local workflow (owner-selected).** Canonical manual acceptance is the existing local setup: PostgreSQL database `chatbot`, website on port **3000**, existing local accounts, S3 bucket `immigration-ai-localtest-documents-747452892291-ap-southeast-2` with AWS profile `aulawyers-staging` / region `ap-southeast-2`. Do not clone the DB or create extra accounts for browser testing. The isolated `immigration_ai_phase12_stage1_test` DB remains only for destructive automated tests.

**One-time migration of the existing local `chatbot` database (owner-run; not executed by this task).**
Static readiness review of `0027_phase12_stage3_policy_editorial`, `0028_phase12_stage3_r1_publication_protection` and `0029_phase12_stage3_r2_draft_snapshot_history`: purely additive — `CREATE TABLE` / `ADD COLUMN` (defaulted or nullable) / `NOT NULL` relaxations only; **no** `DROP TABLE`, `DROP COLUMN`, `DELETE`, `TRUNCATE` or data rewrites, so an additive migration of the populated `chatbot` database is safe.

```bash
cd /home/rico/immigration_ai/chatbot
# 0) Backup first:
pg_dump --format=custom --file=~/chatbot-pre-0027.dump "${POSTGRES_URL}"
# 1) Read-only preflight (prints ledger state / pending migrations, writes nothing):
set -a; source <(grep -E '^POSTGRES_URL=' .env.local); set +a
pnpm db:migrate --preflight
# 2) Apply with explicit acknowledgement + exact database name:
pnpm db:migrate --acknowledge-migrations --expect-database=chatbot
# 3) Verify:
psql "$POSTGRES_URL" -c 'select id, created_at from drizzle.__drizzle_migrations order by created_at desc limit 3'
psql "$POSTGRES_URL" -c '\d "PolicyIntelligenceDraftSnapshot"'
```
(`pnpm db:migrate` runs `scripts/db-migration-operator.ts`; it refuses to run without `--expect-database` + `--acknowledge-migrations`, refuses a mismatched database, and prints no credentials.)

## Phase 12 Stage 3 R3 — security corrections implemented (2026-10-13; worktree only, NOT committed/pushed)

**Branch / base:** `codex/phase12-stage3-policy-intelligence` at `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419` (unchanged). Third-review findings fixed within Stage 3; recorded in **D-069**. Migrations 0027–0029 and the Stage 3 architecture are unchanged, and no migration was applied to any new database. Gates 1–3 remain NOT ACCEPTED.

1. **P0 — revoke could grant (fixed).** `upsertPolicyEditorGrant({ revoked })` inserted `revokedAt: null` and only applied revoke semantics on conflict, so revoking a never-granted verified lawyer **created an active grant**. Replaced with two explicit intents: `activatePolicyEditorGrant` (insert-or-reactivate, reports `reactivated`) and `revokePolicyEditorGrant` (**update-only**; structurally cannot insert). Outcomes: `not_granted` (never-granted revoke — nothing created), `already_revoked` (idempotent repeat), `revoked` (active grant deactivated with `revokedAt`/`revokedByUserId`), and an explicit re-grant reactivates (`reactivated: true`). Audit events keep the server-authoritative admin actor, timestamps and the real outcome; the admin UI reports activation/reactivation/revoked/already-revoked/never-granted truthfully. Concurrency-safe: the revoke `UPDATE` locks the row, a racing grant's `ON CONFLICT DO UPDATE` then re-applies its explicit activation, and no ordering throws.
2. **P1 — operator submission listing now authorizes (fixed).** `list()` only authenticated. Submission and listing now share one contract — `requireOperatorWorkflowAuthority` = verified lawyer + currently active Policy Editor grant — enforced in the service so both the API route and the server-rendered page are gated. Customers, unprivileged lawyers, unverified lawyers, revoked Policy Editors and admins without lawyer publication capability receive 403 (`publication_authority_required` / `capability_required` / `identity_not_verified`); authorized verified Policy Editors keep the workflow.
3. **P2 — retention wording (fixed).** Draft history is now described everywhere (module/service docs, workspace UI) as a **bounded recovery window** (≤ 25 saves / 2 MB per revision, newest never pruned, older ones pruned automatically) rather than permanent complete history. Retention design unchanged.

**R3 regression coverage:** `editorial-service.test.ts` +1 (24 total) — never-granted revoke creates nothing, active revoke deactivates, repeat revoke idempotent, re-grant reactivates, audit outcomes/actor identity; `operator-submission.test.ts` +1 (9 total) — listing matrix (customer, unprivileged lawyer, unverified lawyer, revoked editor, admin, unknown actor denied; authorized editor allowed); `editorial-api.test.ts` — handler-level listing 403/401/200 assertions; integration Phase Q (PostgreSQL grant/revoke matrix incl. zero rows for never-granted, revoked row/actor columns, concurrent grant+revoke race with one consistent row) and Phase R (operator listing authorization matrix against real grant rows incl. revoked-then-denied).

**R3 validation (measured on this worktree):** focused suites service 24/24, api 17/17, operator-submission 9/9, core 10/10, contracts 6/6, form 9/9, currentness 5/5; full unit suite, `tsc --noEmit` (45 = base baseline), `pnpm build`, Stage 3 + Stage 2 integrations on the isolated disposable DB, changed-file Biome and `git diff --check` re-run — exact numbers in the final report.

## Phase 12 Stage 3 R2 — second-review corrections implemented (2026-10-13; worktree only, NOT committed/pushed)

> **Extended by R3 (above):** revoke can no longer grant permission (P0), operator submission listing is authorized (P1), and draft-history retention is now described as a bounded recovery window (P2).

**Branch / base:** `codex/phase12-stage3-policy-intelligence` at `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419` (unchanged). The reviewer accepted the overall architecture (lawyer-final force publication, human protection, manual authoring, migrations 0027/0028) and required five targeted corrections; all are implemented and recorded in **D-068**. Gates 1–3 remain NOT ACCEPTED.

1. **Concurrent manual publication (P1).** `createManualRevision` records the published baseline in `baseRevisionId`; `publishManualRevision` compares it with `item.latestPublishedRevisionId` **under the item row lock** and rejects a draft whose baseline was superseded with 409 `stale_publication_conflict` (`detail: draft_baseline_superseded`) — an older draft can never silently supersede a newer lawyer's publication. The initial unpublished draft (null baseline) publishes normally.
2. **Lossless draft history (P1).** New additive migration `0029_phase12_stage3_r2_draft_snapshot_history.sql` → append-only `PolicyIntelligenceDraftSnapshot` stores the **complete** document of every human draft save (create + each save) with save number, content version, canonical digest, byte size, server-authoritative author and timestamp. Bounded retention (25 saves / 2 MB per revision, newest never pruned, `planDraftSnapshotPrune`) prunes only that revision's own oldest snapshots inside the same transaction. `getDraftHistory` + `GET /api/policy-editor/drafts/history` return the full retained documents to an authorized editor; the workspace lists saved versions with a "load" action. The `save_manual_draft` audit row keeps its bounded change *summary* and now links `snapshotId`/`snapshotSaveNumber`; the summary is documented as a preview-based summary, not as history. Published revisions stay immutable.
3. **Admin UI / permission consistency (P1).** The Admin Policy Intelligence page no longer shows Archive/Restore controls; it is read-only monitoring plus grant management with copy pointing editorial actions to `/policy-editor` (the legacy admin route remains for non-UI callers and still enforces publication authority). Grant/revoke/list now require a **verified** administrator identity at the service level (`identity_not_verified` for unverified admins; `isAdministrator` false for them). Ordinary admins still never gain publication authority.
4. **Protected-item HOLD consistency (P1).** `saveHeldRevision` uses `resolveHeldRevisionItemStatus`: a held AI analysis on a `human_protected` item that already publishes an editor-approved revision no longer rewrites the item status to `review_required` (the held revision itself stays `review_required`, so the pending-review signal and currentness warning stay honest). Unprotected items keep the original hold behaviour and automatic publication is unchanged.
5. **Concurrent manual creation (P1).** Item insertion is conflict-free (`insertItemIfSlugAvailable`, `ON CONFLICT DO NOTHING` on the slug unique index), so a lost slug race resolves to a deterministic alternative slug, an idempotent replay, or the existing 409 `slug_unavailable` — never an uncaught unique-violation error.

**R2 validation (measured on this worktree):**

| Check | Command | Result |
| --- | --- | --- |
| Chatbot unit suite | `cd chatbot && pnpm test:unit` | **833 tests, 833 pass, 0 fail, 0 skipped**, exit 0 (R1 was 821: +6 `editorial-service.test.ts`, +3 `editorial-api.test.ts`, +3 `editorial-core.test.ts`) |
| Focused editorial suites | `editorial-service` 23/23, `editorial-api` 17/17, `editorial-core` 10/10, `editorial-contracts` 6/6, `editorial-form` 9/9, `operator-submission` 8/8, `currentness` 5/5, `pipeline`+`policy-intelligence-product` 88/88 | pass |
| TypeScript | `pnpm exec tsc --noEmit` (tsbuildinfo removed) | **45 diagnostics = base-commit baseline**, 0 new |
| Production build | `pnpm build` | exit 0 |
| Stage 3 PostgreSQL integration (R2-extended) | isolated `immigration_ai_phase12_stage1_test` (migrations 0027/0028/0029 there only) | **1 test, 1 pass, exit 0** — R1 phases plus: Phase M concurrent publication (V1 → drafts A/B → V2 published → A rejected 409 `stale_publication_conflict`/`draft_baseline_superseded` → V2 current, draft A still a draft); Phase N lossless history (long bilingual body, amended citation, removed narrative item and reference all recoverable; earlier snapshot digest unchanged by later saves; 3 snapshots); Phase O protected-item hold (V4-L protected → failing-verification hold → item stays `published` + protected, V4-L public with the pending-review signal, archive/restore coherent, workspace detail shows the held revision; after release, an unprotected hold moves the item to `review_required` with the publication still public); Phase P concurrent creation (two concurrent creates both controlled, identical same-author replay resolves to one item, `insertItemIfSlugAvailable` returns `slug_taken`) |
| Stage 2 integration regression | isolated DB | **1 test, 1 pass, exit 0** |
| Changed-file Biome | 68 changed/new `*.ts(x)` files | only the 9 pre-existing diagnostics remain (`useAwait` ×5 `pipeline.test.ts`, ×2 `memory-repository.ts`; `useAwait` + empty-block `policy-sync-all.test.ts`), proven pre-existing against base copies |
| `git diff --check` | repository root | clean (no whitespace/conflict markers) |
| Migration | `pnpm phase12:test-db migrate` | `0029` applied **only** to `immigration_ai_phase12_stage1_test`; no protected database touched |

**Still open (owner host; not claimed as passing):** Playwright browser acceptance of `/policy-editor` (including the new saved-versions panel and the removed admin controls), live official-source fetches for the discovery seed URLs, a provider-backed operator-submission sync, and owner functional acceptance of the protection/hold scenarios. Gates 1, 2 and 3 remain NOT ACCEPTED.

### Phase 12 Stage 3 R1 record (historical; extended by R2 above)

**Branch / base:** `codex/phase12-stage3-policy-intelligence` at `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419` (unchanged; all Stage 3 + R1 work is uncommitted worktree state). Independent review of `stage3-full.patch` raised original-workflow P0/P1/P2 items; every one is now implemented, tested and recorded in **D-067**. Gates 1–3 remain NOT ACCEPTED.

**What R1 corrected:**

1. **P0 — durable human-publication protection.** New additive migration `lib/db/migrations/0028_phase12_stage3_r1_publication_protection.sql` adds `PolicyIntelligenceItem.publicationMode` (`automatic` | `human_protected`) plus `protectionSetAt`/`protectionSetByUserId`. Any lawyer publication (force publish or manual publish) sets protection; the automatic `publishRevision` path then stores an eligible revision as `review_required` (pending review), leaves the published pointer, item status and editor-approved source status untouched, and reports the sync outcome as `held` with reason `human_publication_protected`. `releasePublicationProtection` (+ `POST /api/policy-editor/protection`) is the explicit, audited, idempotent exit; archive/restore never change the decision; unprotected items keep publishing automatically.
2. **P1 — publication authority.** `requirePublicationAuthority` now requires verified identity + `role === "lawyer"` + active grant, enforced in-transaction on every editorial mutation and on operator-URL submission. Administrator role alone confers only grant management/monitoring (`isAdministrator`, admin-only grant/revoke/list); grants to customer accounts or unverified accounts are refused (`grant_target_not_eligible`); forged/improper grants, revoked grants and administrator accounts cannot publish.
3. **P1 — editorial content integrity.** New pure module `lib/policy-intelligence/editorial-form.ts` (+ `editorial-form.test.ts`) that the workspace component uses: all stored references (max 8, with citations/dates) round-trip, bilingual text must be genuinely provided (no Chinese↔English auto-copy), over-limit or incomplete input is a visible error instead of truncation, and narrative ids are deterministic from the text.
4. **P1 — author-stated dates.** Human revision contract/editor/public projection add nullable `officialSourceDate`, `commencementDate`, `reviewedAsOfDate`, displayed separately from platform-observed snapshot dates; an unestablished commencement date is an explicit display state, never inferred.
5. **P1 — provenance and request hardening.** Audit rows carry the server-derived editor identity (`editorUserId`/`editorEmail`/`editorRole`) independently of the lawyer-entered byline; the contract rejects bylines impersonating an official government authority while keeping firm/team attribution possible; bodies are read under a real streamed byte budget (no trusted `Content-Length` alone); the legacy admin policy route no longer buffers an unbounded JSON body; the Origin/`Sec-Fetch-Site` guard covers every editorial mutation.
6. **P2 — audit and scalability.** Draft saves record a bounded, reconstructible change set (old/new values, narrative added/removed/modified with previews and full-text digests); a create retry after editing the draft resolves to the same item (no duplicates); the workspace paginates deterministically (`limit`/`offset`, `hasMore`, `nextOffset`, UI "Load more") instead of a hard 100-item cut; an unreadable stored AI analysis opens a blank override draft seeded with official-source facts (`overrideSeedStatus: analysis_unavailable`) instead of blocking human correction.
7. **Also fixed in R1:** the workspace no longer uses `window.prompt` (lint + UX) — protection release uses an inline confirm; the new/edited test files were added to the `test:unit` explicit file list so the suite is authoritative.

**Key files (R1):** `lib/db/schema.ts`, `lib/db/migrations/0028_phase12_stage3_r1_publication_protection.sql` (+ snapshot/journal); `lib/policy-intelligence/{contracts,editorial-core,editorial-service,editorial-repository,editorial-memory,editorial-api,operator-submission,operator-submission-repository,read-service,editorial-form}.ts`; `lib/policy-intelligence/repository.ts` + `pipeline.ts` (protection hold path); `lib/policy-intelligence-product.ts` + `-copy.ts`; `components/{policy-editor-workspace,admin-policy-editors,policy-intelligence-product-page}.tsx`; `app/policy-editor/page.tsx`, `app/api/policy-editor/protection/route.ts`, `app/api/policy-editor/workspace/route.ts`, `app/api/admin/policy-editors/route.ts`, `app/api/admin/policy-intelligence/route.ts`; `package.json` (test file list).

### R1 validation (measured on this worktree; owner-host acceptance still to run)

| Check | Command | Result |
| --- | --- | --- |
| Chatbot unit suite (R1) | `cd chatbot && pnpm test:unit` | **821 tests, 821 pass, 0 fail, 0 skipped**, exit 0. Stage 3 baseline was 784: +16 tests in the existing editorial suites (one test retitled/replaced), +22 tests in three new files. |
| New unit suites | `node --import tsx --test lib/policy-intelligence/{editorial-form,editorial-contracts,editorial-core}.test.ts` | 9 + 6 + 7 tests, all pass — form round-trip with 8 references/citations/dates, bilingual requirement (no auto-copy), over-limit reporting, date/attribution contract, protection decision matrix and bounded audit change set. |
| Editorial suites | `editorial-service.test.ts` **17/17**, `editorial-api.test.ts` **14/14**, `operator-submission.test.ts` **8/8** | pass — publication-authority matrix (admin/customer/unverified/revoked denied), protection set/release/idempotency, create-retry dedupe, pagination, streamed body-limit 413, `Sec-Fetch-Site` rejection, override-seed fallback. |
| TypeScript | `pnpm exec tsc --noEmit` (tsbuildinfo removed) | **45 diagnostics = base-commit baseline**, 0 new. |
| Production build | `pnpm build` | exit code recorded below (0 on the final revision). |
| Stage 3 PostgreSQL integration (extended) | `PHASE12_TEST_DATABASE_URL=<isolated `immigration_ai_phase12_stage1_test`> node --conditions=react-server --import tsx --test lib/policy-intelligence/editorial.integration.test.ts` | **1 test, 1 pass, exit 0** — includes the P0 sequence AI V3 published → V4 held → lawyer force-publishes V4-L → **AI V5 passes the gate and is held with reason `human_publication_protected`** → V4-L stays public with the pending-review signal → lawyer publishes V5 → **explicit release** → AI V6 publishes automatically again; plus admin/customer/unverified publication + submission denial, create-retry dedupe, reconstructible audit change set, dated manual publication with 2 references and a null commencement date, and workspace pagination. |
| Stage 2 integration (regression) | `PHASE12_TEST_DATABASE_URL=<isolated> node --conditions=react-server --import tsx --test lib/conversations/policy-binding.integration.test.ts` | **1 test, 1 pass, exit 0**. |
| Changed-file Biome | `biome check` on the 57 changed/new `*.ts(x)` files | only **pre-existing** diagnostics remain: `useAwait` in `pipeline.test.ts` (5) and `memory-repository.ts` (2), `useAwait` + empty-block in `policy-sync-all.test.ts` (2). Verified pre-existing by running Biome over the base-commit copies of those three files (identical 9 diagnostics); every file changed by R1 is clean. |
| Isolated test DB | `pnpm phase12:test-db migrate` | migration `0028` applied **only** to `immigration_ai_phase12_stage1_test`; no protected database touched. |

**Still to run (owner host; NOT claimed as passing here):** Playwright browser acceptance of `/policy-editor` (multi-reference editor, date fields, protection-release confirm, pagination) on a running dev server; live official-source fetches for the discovery seed URLs; a real provider-backed operator-submission sync; owner functional acceptance of the P0 protection scenario against an authorized disposable database.

## Phase 12 Stage 3 — Policy Intelligence Completion implemented (2026-10-13; worktree only, NOT committed/pushed)

> **Superseded in part by R1 (above).** The R1 corrections changed two things described in this original record: publication authority is now *verified lawyer + explicit grant* (administrator role alone manages grants and cannot publish), and lawyer/publications now set durable human-publication protection that automatic publication honours. Test counts below are the pre-R1 Stage 3 record (784 unit tests); the R1 counts are in the table above.



**Branch / base:** `codex/phase12-stage3-policy-intelligence` from owner-verified base `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419`. Owner authorized implementation with Gate 1 and original Gate 2 checks still open (see D-066). Nothing in this change set has been committed, pushed, migrated into a protected database or deployed.

**Delivered (all within D-065's lawyer-final-authority contract):**

1. **Published revision stability (3.1):** `isCurrentPublishedPolicyRevision` no longer couples public visibility to `latestSnapshotId`; a held newer source snapshot keeps the approved published revision public and surfaces `newerSourcePendingReview`. Archive still suppresses; pointer/source-identity integrity still fails closed; a fully human revision with no snapshot is a legitimate public row.
2. **Policy Editor capability (3.2):** new `PolicyEditorGrant` table + admin API/page management; server-enforced on every editorial mutation (administrators or an active grant); ordinary lawyers/customers denied; session-only actor resolution and strict request schemas reject forged actor/role fields; revocation is immediate.
3. **Lawyer force publish (3.3):** `POST /api/policy-editor/override` → audited `forcePublishOverride` that validates capability, stale base revision/pointer, content schema and override reason, records `aiDecision` (best-effort recomputed AI gate reasons/verdict snapshots) and the override reason, atomically advances the published pointer, supersedes the replaced revision, and is idempotent per key. No LLM/verifier call exists anywhere on the path (structurally asserted in tests); publication succeeds even when the stored AI verification artifact cannot be re-parsed.
4. **Manual authoring (3.4):** `POST/PATCH /api/policy-editor/drafts`, `/drafts/revision`, `/drafts/publish`, `/archive`, `/restore` plus `/api/policy-editor/workspace` and `/items/[itemId]`; bilingual create/save-draft/publish/revision/archive/restore with optional genuine official references and explicitly attributed uncited commentary; drafts never appear in public projections; the `/policy-editor` workspace is capability-gated.
5. **Data model (3.5):** additive migration `lib/db/migrations/0027_phase12_stage3_policy_editorial.sql` (generated with drizzle-kit; reviewed). New tables `PolicyEditorGrant`, `PolicyIntelligenceEditorialEvent`, `PolicyIntelligenceOperatorSubmission`; item `origin`, nullable official identity, `createdByUserId`; revision `contentKind`/`humanContent`/`baseRevisionId`/`aiDecision`/`overrideReason`/`idempotencyKey` with nullable snapshot/analysis/verification/modelMetadata. Applied only to the isolated disposable `immigration_ai_phase12_stage1_test` database for validation.
6. **Unified public presentation (3.6):** `/intelligence` and detail/history/home previews now serve automated, lawyer-overridden and lawyer-authored revisions through the same read model, with an explicit `provenance` label, honest attribution, nullable official source (no fabricated links/titles), an explicit "no official source provided by the author" state, and a newer-source-pending-review notice. Source status stays independent of editorial status.
7. **Discovery expansion (3.7):** new sources `home-affairs-announcements`, `home-affairs-consultations`, `ministerial-announcements`, `parliamentary-bills`, plus `operator-submitted-official-url` with an allowlisted official `.gov.au` suffix rule (exact-host allowlists unchanged for every other source). Authorized staff submissions are stored durably and consumed by the existing sync run through the unchanged HTTPS/SSRF/redirect/DNS/byte/timeout protections; per-submission status is marked consumed/failed from the run outcome.
8. **Coexistence (3.8):** the automatic pipeline cannot delete/overwrite/unpublish human work; a held AI revision cannot silently replace an approved human override; archive/restore recompute the honest status from stored history and audit every action.

**Key files:** `lib/policy-intelligence/{contracts,currentness,read-service,editorial-core,editorial-service,editorial-api,editorial-repository,editorial-memory,editorial-access,editorial-runtime,operator-submission,operator-submission-repository}.ts`; `lib/db/schema.ts`; `lib/db/migrations/0027_phase12_stage3_policy_editorial.sql`; `lib/policy-intelligence-product.ts`; `components/{policy-editor-workspace,admin-policy-editors,policy-intelligence-product-page}.tsx`; `app/policy-editor/page.tsx`; `app/api/policy-editor/**`; `app/api/admin/policy-editors/route.ts`; `scripts/policy-intelligence-discovery.ts`; `scripts/policy-sync.ts`; tests `lib/policy-intelligence/{currentness,editorial-service,editorial-api,operator-submission}.test.ts` and `lib/policy-intelligence/editorial.integration.test.ts`.

**Validation (recorded at implementation time; see the closure section for exact counts):** focused unit suites pass; the Stage 3 PostgreSQL integration suite passes on the isolated disposable database; `pnpm exec tsc --noEmit` is at the same 45 pre-existing diagnostics as the base commit with no new diagnostics; `pnpm test:unit` and `pnpm build` results are recorded in the closure section below.

**Not done / deferred:** no commit, no push, no protected-database migration, no AWS change; live official-source fetches for the new seed URLs were not executed in this environment (owner-host verification required); Playwright browser acceptance of the `/policy-editor` workspace on a running dev server remains an owner-host step.

### Stage 3 closure evidence (2026-10-13, worktree; owner-host acceptance still to run)

| Check | Command | Result |
| --- | --- | --- |
| Chatbot unit suite (final revision) | `cd chatbot && pnpm test:unit` | **784 tests, 784 pass, 0 fail, 0 skipped**, command exit 0 |
| TypeScript (final revision) | `cd chatbot && pnpm exec tsc --noEmit` (tsbuildinfo removed first) | **45 diagnostics = the verified base-commit baseline** (all in `pipeline.test.ts` ×20, `vip/billing/*` ×12, `ai/models.test.ts` ×5, `client-portal` ×3, `matter-documents` ×4, `lawyer-workspace/projection` ×1); zero new diagnostics from Stage 3 |
| Production build (final revision) | `cd chatbot && pnpm build` | exit 0; `/policy-editor` and `/api/policy-editor/*`, `/api/admin/policy-editors` are present in the route manifest |
| Stage 3 PostgreSQL integration | `test:phase12:stage3:integration` with `PHASE12_TEST_DATABASE_URL` (isolated `immigration_ai_phase12_stage1_test`, migration 0027 applied there only) | **1 test, 1 pass, 0 fail, exit 0** — automatic publication → V4 held → V3 stays public with staleness signal → force publish with an unreadable AI verification artifact → idempotent retry (single audit row) → manual LLM-free publish (draft never public) → Stage 2 binding drafts for manual + override content → sync coexistence → stale/concurrency refusals → archive/restore → durable audit rows and administrator-only capability changes |
| Stage 2 integration (regression) | `test:phase12:stage2:integration` against the same isolated DB | **1 test, 1 pass, exit 0** — durable policy-to-conversation bindings still work on the Stage 3 schema |
| Changed-file Biome | `biome check` on every changed/new file | clean except two pre-existing `useAwait` diagnostics in `lib/policy-intelligence/memory-repository.ts` (both present at the base commit) and two pre-existing `useAwait` diagnostics in `scripts/policy-sync-all.test.ts` (same callbacks exist at the base commit). Repository-wide `pnpm lint` remains at its pre-existing noise level (15 244 diagnostics repo-wide, unchanged in kind; the repo was not lint-clean before this work). |
| Cross-site (CSRF) protection | new `crossSiteEditorialRequestGuard` on every editorial mutation (invoked through the shared body reader), with a unit test proving a cross-site `Origin` is rejected before any state change while same-origin and origin-less authenticated requests proceed | covered by the editorial-api suite (9/9) |
| Isolated test DB | `pnpm phase12:test-db create` + `migrate` | created and migrated to 28 applied migrations (includes `0027_phase12_stage3_policy_editorial`); no protected database touched. The integration test seeds and deletes only its own synthetic users/items and asserts the database name before any mutation. |

**Not run here (owner-host steps):** Playwright browser acceptance of `/policy-editor` on a running dev server; live official-source fetches for the new discovery seed URLs (`home-affairs-announcements`, `home-affairs-consultations`, `ministerial-announcements`, `parliamentary-bills`) — the hosts are real official domains, but the exact landing paths must be confirmed on the owner's network; a real provider-backed sync run for the operator-submission source.

**Owner functional acceptance (suggested):** (1) apply migration `0027` to a disposable/authorised database and confirm the Stage 3 acceptance set above; (2) sign in as an administrator, open `/admin/policy-intelligence`, grant Policy Editor to a lawyer account; (3) as that lawyer open `/policy-editor`: create/publish a bilingual uncited commentary and confirm the public `/intelligence` page labels it as lawyer-authored with attribution and the "no official source provided" state; (4) force publish an AI-held item and confirm `/intelligence` shows the lawyer-override label plus a superseded AI revision in the history; (5) confirm an ordinary lawyer is redirected away from `/policy-editor`; (6) archive/restore an item and confirm the audit list in the workspace.




## Phase 12 Stage 3 — D-065 Lawyer Final Editorial Authority (2026-10-13; docs only)

**Approved design correction:** An expressly authorized Policy Editor lawyer has the final decision on legal-content relevance, editing and publication. The Stage 3 implementation must offer a real lawyer-initiated `forcePublish=true` for AI-held/rejected/verification-failed items without requiring AI re-evaluation, positive evidence sufficiency or an automatic publication-gate PASS. An independent manual draft/preview/publish path remains entirely AI-free, including for transparently attributed lawyer commentary without an official citation. Preserve clear attribution between lawyer commentary and authenticated official law; no invented citation, source, verified-law badge or commencement date. Backend retains **technical** authorization, tenant isolation, input/URL/HTML/CSRF safety, revision concurrency and immutable audit; it cannot turn the AI's legal judgment into a veto. Trusted automated publication continues unchanged and has no compulsory lawyer gate.

**Precedence and work status:** D-065 supersedes the earlier conflicting Stage 3 prohibition on `forcePublish=true`; see `DECISIONS.md` and `tasks/PHASE12_USER_DATA_WORKSPACE_POLICY_2026-10-11.md`. **Stage 3 remains NOT STARTED / NOT AUTHORIZED to implement.** Stage 2 core scope stays OWNER SIGNED OFF, original Gate 2 remains NOT ACCEPTED, and Stage 1 Gate 1 remains open. This record makes no application-code, DB, S3, AWS, payment, migration, branch-merge or deployment change.

## Phase 12 local S3 test storage — retained for future regression testing (2026-10-13)

| Parameter | Recorded value |
| --- | --- |
| Purpose | Dedicated **local-development test** S3 object store for PDF/DOCX intake, extraction, AI-mode testing; **not** the existing staging/production bucket |
| AWS account | `747452892291` |
| AWS CLI profile | `aulawyers-staging` (workstation-local credential resolution; do not store credentials in repository) |
| AWS Region | `ap-southeast-2` (Sydney) |
| S3 Bucket | `immigration-ai-localtest-documents-747452892291-ap-southeast-2` |
| Bucket ARN | `arn:aws:s3:::immigration-ai-localtest-documents-747452892291-ap-southeast-2` |
| Environment variables, for local Next.js process only | `AWS_PROFILE=aulawyers-staging`, `AWS_REGION=ap-southeast-2`, `MATTER_DOCUMENTS_S3_BUCKET=immigration-ai-localtest-documents-747452892291-ap-southeast-2` |
| Encryption | Default SSE-S3 `AES256`; existing app also requests AES256 on PUT |
| Public access | BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, RestrictPublicBuckets all enabled |
| Validation | `pnpm run s3:preflight` with the three env vars above returned `{"ok":true,"failures":[]}` (2026-10-12) |
| Dataset | Synthetic `test_pdf.pdf` and `test_docx.docx` in the local test conversation `0a8c3d1d-887d-4246-8f76-28ea613ecc55`; no real client documents |
| Scope isolation | Do **not** connect this Bucket to AWS staging/production ECS; do not mix with `immigration-ai-staging-matter-documents-747452892291`; this Bucket does not automatically contain original bytes of older local DB file records |

**Retention/cost decision (owner, 2026-10-13):** RETAIN this isolated test Bucket after Stage 2 for future development/regression tests; do **not** delete it during closeout. Ordinary S3 general-purpose buckets have no separate creation fee or minimum charge; pay-as-you-go charges depend on stored bytes, requests and applicable transfer/optional AWS features. The two observed test uploads were only about 24.2 KB and 10.0 KB, so at that scale the expected recurring storage cost is negligible compared with an actively running ECS/RDS stack. This is an estimate, **not** a verified bucket-attributed AWS bill. Keep only synthetic test data, inspect storage and billing periodically, and consider deletion if costs grow or the Bucket becomes unnecessary. No lifecycle auto-delete, AWS change, deletion or credential rotation is authorized by this documentation update. Deletion requires separate owner confirmation after inspecting objects, versioning/multipart state and database download/reference implications.

**Supersession:** This retention decision **supersedes only** D-063's proposed second closeout task to clean up/delete the temporary Bucket; it does not alter D-063's Stage 2 functional sign-off, Gate 2 non-acceptance, or outstanding environment checks. No automatic cleanup is scheduled.

### Reuse on Ubuntu

```bash
cd ~/immigration_ai/chatbot

AWS_PROFILE=aulawyers-staging \
AWS_REGION=ap-southeast-2 \
MATTER_DOCUMENTS_S3_BUCKET=immigration-ai-localtest-documents-747452892291-ap-southeast-2 \
pnpm run s3:preflight

# Start Next.js in a foreground terminal, only after stopping the old instance.
AWS_PROFILE=aulawyers-staging \
AWS_REGION=ap-southeast-2 \
MATTER_DOCUMENTS_S3_BUCKET=immigration-ai-localtest-documents-747452892291-ap-southeast-2 \
pnpm exec next dev --turbo -p 3000
```

### Read-only usage check (small dataset)

```bash
# Read-only, reports object count and total bytes without listing object names.
aws s3api list-objects-v2 \
  --bucket immigration-ai-localtest-documents-747452892291-ap-southeast-2 \
  --profile aulawyers-staging \
  --region ap-southeast-2 \
  --query '{Objects:length(Contents),Bytes:sum(Contents[].Size)}' \
  --output json
```

**Safety:** Never commit AWS access keys, secrets, `.env.local` or customer documents. The environment variables above are nonsecret configuration and are injected **only into the local Next.js process**. If the app switches to another Bucket later, do not assume old file-download links resolve across buckets; PostgreSQL file metadata is independent of object storage. Staging/production environments are unchanged.

## Phase 12 Stage 2 — Owner functional sign-off and closeout (2026-10-13)

**Decision:** The owner declared Stage 2 **functionally complete** and asked to stop Stage 2 feature development. This records acceptance of the tested core functionality, **not formal acceptance of the original all-checks Gate 2**. Gate 2 remains **NOT ACCEPTED — remaining checks deferred/unverified**; this note does not by itself authorize Stage 3 implementation, merging or deployment.

**Git checkpoint:** `codex/phase12-stage2-context-ui` @ `7031b37292410597c4411b8a9b60f10bdf35b823` (local/remote SHA matched and the owner's working tree was clean after the D-062 push). D-061 @ `b604187` and D-062 @ `7031b37292410597c4411b8a9b60f10bdf35b823` are committed; neither hotfix remains uncommitted. Tests reported at D-062 implementation: 754/754 chatbot unit tests; related 40/40; 8/8 contract regressions; `pnpm build` passed; `tsc` 45 known baseline errors, zero new. Backend D-061 regression: 1302/1302 reported. This documentation update makes no source changes.

**Owner-host evidence:** LIN 26/061 linked-conversation launch, refresh/history restore and DB binding check passed; Fast, Legal Check (after D-061 restart) and Premium each correctly retained policy topic. Owner browser screenshots in ordinary, non-policy conversation `0a8c3d1d-887d-4246-8f76-28ea613ecc55` show `test_pdf.pdf` → `BLUE-314`, 14 March 2026 (intended arrival); `test_docx.docx` → `GREEN-729`, 30 November 2026 (insurance expiry). Fast, Legal Check (active AgentRuntime), and Premium all returned the expected values from both saved files, identified customer-file provenance rather than official law, and reused the same conversation without reupload.

**Storage scope:** The temporary independent S3 test Bucket `immigration-ai-localtest-documents-747452892291-ap-southeast-2` (ap-southeast-2, AES256, Public Access Block enabled) passed read-only `s3:preflight` with `{"ok":true,"failures":[]}`. Its test objects are still needed until closeout; cleanup and removal of this test Bucket are the **second pending owner-supervised task**, with a prior check for local database file records/download impacts. No bucket deletion or database cleanup is part of this docs commit.

**Limits:** The screenshots establish user-visible end-to-end answer behaviour, not a separate database evidence-unit audit, original-byte download, source-link click check, malicious-file testing, alternative legacy Legal Check runtime, cross-device durability, or AWS staging/production acceptance. Cross-device checks were explicitly DEFERRED BY OWNER; other outstanding original Gate 2 checks (including staging/production S3, negative authorization, original-byte download and remaining environment/UI cases) are NOT RUN/NOT ACCEPTED. Stage 1 formal Gate 1 remains open. The original all-items Gate 2 was not satisfied; no unrun check is marked PASS.

**Next actions:** (1) Commit and sync this durable project-state update. (2) Separately inspect and safely clean up the isolated S3 test Bucket and account for any local test-file metadata. Do not delete AWS resources or alter DB records in this documentation step. Older sections below record the state *at the time of those earlier engineering checkpoints* and must not supersede this dated status.

## Phase 12 Stage 2 Gate 2 hotfix — null `policySlug` rejected ordinary conversations (FIXED and committed 7031b37; owner-host browser PASS)

**Status:** root cause fixed, independently source-reviewed, committed/pushed in `7031b37292410597c4411b8a9b60f10bdf35b823`, and owner-host browser re-test **PASSED** in all three modes with both customer files. This is a historical defect record; formal original Gate 2 remains **NOT ACCEPTED** due to deferred/unrun checks.

### Observed owner-host failure

Ordinary, non-policy-linked conversation `0a8c3d1d-887d-4246-8f76-28ea613ecc55` with `test_pdf.pdf` and `test_docx.docx` uploaded (the browser shows both files saved). A Fast mode question failed **before model execution** in `app/api/widget-chat-fast/route.ts`:

```text
ZodError:
path: ["policySlug"]
expected: "string"
received: "null"
```

### Confirmed root cause

`components/immigration-ai-workspace.tsx` built `requestPolicySlug` as `null` when the conversation had no persisted policy binding and serialized it into the request body. All three widget routes declared `policySlug` as an optional string, so an explicit JSON `null` failed validation. Ordinary conversations must work without a policy binding: a null or omitted slug means "no client policy hint", never a failed request.

### Correction (bounded change set)

- `components/immigration-ai-workspace.tsx` now builds the turn body with the shared helper and omits `policySlug` entirely when there is no binding for this conversation (no invented slug, no URL parameter, no change to the persisted-binding security model).
- `lib/conversations/widget-turn-request.ts` (new): `requestPolicySlugForConversation()` (the existing "own persisted binding only" rule) and `buildWidgetTurnRequestBody()` — the single construction path used for Fast, Legal Check and Premium.
- `lib/policy-intelligence/request-policy-slug.ts` (new): the shared `policySlug` request rule — absent and explicit `null` both normalise to "no hint"; a present non-null value must still match the shared `POLICY_SLUG_PATTERN`, so invalid types and malformed slugs stay rejected.
- `lib/conversations/widget-turn-schemas.ts` (new): the three widget request schemas moved out of the route files verbatim (same fields, enums, defaults and strictness) so the real request contract is importable by tests; the routes import their schema from here.
- `app/api/widget-chat-fast/route.ts`, `app/api/widget-chat/route.ts`, `app/api/widget-chat-direct/route.ts`: use the shared schema; no local policy-slug rule remains.
- Untouched: durable-turn, authentication, policy-binding, document-evidence and political-gate contracts, S3/AWS, database, migrations, deployment and the Python legal service.
- **Owner-host document-storage evidence (2026-10-12; subsequently verified):** Initial S3 upload was successful, but the first Fast answer failed with null `policySlug`. After D-062 was committed and Next.js restarted, the owner observed Fast, Legal Check and Premium each correctly answer from both files in the same ordinary conversation; see 2026-10-13 functional sign-off above. Staging/production was not tested.

### Validation actually run (exact)

- New `lib/conversations/widget-policy-slug-contract.test.ts` (**8 tests**): omitted and explicit-null slugs parse on all three real route schemas; the real frontend builder omits the field (no `"policySlug"` key in the serialized JSON) and the same body validates on Fast, Legal Check and Premium; a bound conversation still forwards its real slug; a binding for another conversation is never adopted; malformed non-null slugs (number, boolean, object, array, empty, spaces, uppercase, leading hyphen, embedded space, unicode, 121 chars) are rejected on every route; the rest of the contract stays strict (messages, uuid, clientTurnId, per-route mode enums, required Legal Check model); the routes import the shared schema module and the workspace uses the shared builder.
- `pnpm test:unit` → **754 passed, 0 failed, 0 skipped** (746 before + 8 new).
- `pnpm exec tsc --noEmit` → **45 errors, identical to the documented baseline** (zero new).
- `pnpm build` → **exit 0**; changed-file `biome check` → clean; `git diff --check` → clean.
- Related suites (`conversation-policy-binding-http`, `widget-route-contract`, `policy-topic-request-construction`, `conversation-policy-binding`) → **40 passed**. The Stage 2 wiring test was updated to assert the new construction path (it previously matched the removed inline expression).

## Phase 12 Stage 2 Gate 2 blocker — Legal Check lost the persisted policy topic (FIXED, committed in b604187; owner-host PASS)

**Status:** root cause confirmed and corrected; the fix passed independent source review, is committed and pushed as `b604187`, and its **owner-host re-test PASSED** — after restarting legal-service the owner retested the original LIN 26/061 conversation and Legal Check correctly identified the policy instead of asking for its name again; **Premium policy-context testing also PASSED in the same conversation**. **Gate 2 remains NOT ACCEPTED.** Owner host evidence (2026-10-12): migration `0026` applied to the local `chatbot` database with the ledger, table, indexes and foreign keys verified; policy launch, browser refresh/history recovery and PostgreSQL policy-binding verification passed for LIN 26/061 (Step 3A–3C). This fix needs no migration and does not touch any database. D-062 owner browser verification and three-mode PDF/DOCX answer checks subsequently PASSED as recorded in the 2026-10-13 closeout section; cross-device tests remain **DEFERRED BY OWNER**, and other original Gate 2 checks remain unverified.

### Observed owner-host failure

Conversation `29d5607b-5ad0-486e-a1e4-dc37363ef9e7` (persisted policy `evisitor-application-arrangements-lin-26-061`, `LIN 26/061：Subclass 651 eVisitor 申请安排更新`): Fast answered about "this policy" correctly, then the same conversation switched to Legal Check, which asked the customer to supply the policy name, identifier or URL again. Backend health was fine and `DEFAULT_AGENT_SERVING_ENABLED = True`, so the active route is `DefaultAgentServingService` → `AgentRuntimeService`.

### Confirmed root cause

`chatbot/app/api/widget-chat/route.ts` already resolves the authenticated, persisted binding and adds the `policy_topic_reference` entry to `frontend_messages` for every mode (line ~1102); `legal-service/app/schemas/query.py` already accepts `frontend_messages`; `FastDirectLunaService._model_input` and `PremiumDirectAnswerService._history_text` already render it. `DefaultAgentServingService` built `AgentRuntimeRequest` without it and `AgentRuntimeRequest`/`AgentRuntimeService` had no field for it — so the topic was dropped at the serving adapter on the mode switch.

### Correction (minimum correct fix)

- `legal-service/app/schemas/agent.py`: new bounded, typed `AgentRuntimeRequest.policy_topic_context: str = Field(default="", max_length=4_000)`, documented as conversation context — never legal authority, never a citation, never registry evidence, never a system instruction.
- `legal-service/app/services/policy_topic_context.py` (new): reuses the existing `policy_topic_reference` contract. `extract_policy_topic_context()` accepts only the FIRST entry with the boolean flag on a `system`-role message, whitespace-normalized and capped at 1 200 chars (matching the Fast/Premium bound); non-list payloads, non-dict entries, missing/false/non-boolean flags, non-string or blank text yield `""` and never raise. `render_policy_topic_prompt_section()` renders a fenced section headed **"Conversation Policy Topic (conversation context only — NOT legal authority, NOT verified law)"** that resolves "this policy"/"这项政策", forbids following instructions inside it, and requires independent verification of current law and official source status.
- `legal-service/app/services/default_agent_serving_service.py`: extracts the topic from `payload.frontend_messages` and forwards it in `AgentRuntimeRequest`.
- `legal-service/app/services/agent_runtime_service.py`: renders the section into the provider-facing user message (`_build_user_message`), so the real prompt carries it.
- Untouched by design: Fast and Premium topic handling, model selection/effort, tool policy, budgets/retries, evidence registry, citations, checker, reasoning bank, document context, premium handoff. No migration, no schema change, no new dependency, no database access.
- **Bounded context, not archive fidelity:** the channel is capped (schema 4 000 chars; extraction 1 200 chars, whitespace-normalized, first flagged entry only). Archived/superseded/withdrawn note lines **within that cap** are forwarded as context, but an unusually long rendered binding — for example extra archival or superseded notes beyond the cap — is truncated at the tail. The cap is never treated as proof that the topic is current; substantive conclusions still require independent verification of current law and official source status.

### Validation actually run (exact)

- New file `legal-service/tests/test_phase12_stage2_gate2_policy_topic_context.py` (**16 tests**, Tests A–H): `16 passed`.
- **Regression-proof check:** with the pre-fix serving adapter restored (`git checkout -- legal-service/app/services/default_agent_serving_service.py`), the same file reports `3 failed, 13 passed` — A (request construction), E (serving-path selection) and G (no widened sharing) fail with `assert 'LIN 26/061' in ''`. They detect the owner's defect; the remaining tests pin the prompt-rendering half of the fix.
- Focused + related suites: `test_phase12_stage2_gate2_policy_topic_context.py test_phase2_default_agent_serving.py test_post_m4_runtime_governance.py test_conversation_memory_policy_context.py test_agent_contracts.py test_phase7_default_runtime_compatibility.py` → **42 passed**.
- Full backend suite: `cd legal-service && /home/rico/anaconda3/envs/torch/bin/python -m pytest tests -q` → **1302 passed, 0 failed** (1286 before this fix + the 16 new tests; no regressions).

## Phase 12 Stage 2 final review corrections A + B (IMPLEMENTED 2026-10-12, uncommitted; awaiting final review)

**Status:** the two defects found in the independent review of `54ec8e3` are corrected. **Gate 2 is still NOT claimed as passed.** These corrections performed no commit, push, merge or deploy and introduced no migration. Migration `0026` was afterwards applied by the owner to the local `chatbot` database (migration ledger, table, indexes and foreign keys verified); no other database, including `immigration_legal`, was touched.

### Defect A — a failed attachment load must not permit submission

- New pure module `chatbot/lib/lawyer-requests/attachment-consent-state.ts` owns the whole load/decision contract: `loadAttachmentConsentState()` (injectable fetcher, never throws — a network error, an error response, invalid JSON, a missing `attachmentSelection` block, an unknown status or a malformed body all become the explicit `failed` state), `attachmentConsentStateFromResponse()`, `canSubmitLawyerRequestWithAttachments()` (only `ready` allows submission) and `attachmentDecisionPayload()` (returns the explicit `{ consent: true, selectedDocumentIds }`, or `null` when the customer may not submit — malformed, duplicated and over-limit selections are refused, never sliced).
- `chatbot/components/lawyer-request-action.tsx`: the submit control is disabled unless the list loaded successfully (`disabled={submitting || !readyForSubmission || overLimit}`), and `submit()` re-derives the decision from the state — so a failed load can no longer fall through to "no `attachments` field", i.e. it is never read as consent to share zero documents. While the list is loading or idle an explicit "cannot submit until the document list has loaded" notice sits next to the disabled control.
- New bilingual status UI (`chatbot/components/lawyer-request-attachment-status.tsx`): `LawyerAttachmentLoadFailure` shows the localized load error (`role="alert"`), the blocked-submission notice and a clearly labelled retry control (**重新加载附件 / Retry loading attachments**) that re-runs the loader; the previously mislabelled retry button (which reused the "ask a lawyer" label) is gone.
- Zero eligible documents still loads as `ready` with an empty list, so the customer can submit an explicit `selectedDocumentIds: []` decision; checkboxes still start unchecked; the four-document limit and all server-side ownership checks are untouched.

### Defect B — an existing request is its own state

- The frontend no longer treats any non-`selectable` status as an empty ready list. `attachmentConsentStateFromResponse()` maps `already_requested` to a dedicated state (`sharedDocumentCount`, `requestId`); unknown or missing shapes now fail closed instead of enabling a fresh submission.
- `chatbot/app/api/lawyer-requests/route.ts` (backward compatible, additive only): the GET `already_requested` block now also returns `requestId: existing.id` and `documentSharing: customerLawyerRequestView(existing).documentSharing` (the persisted consent summary); the POST duplicate path returns the stored summary plus `existingRequest: true`. The `status`/`documents`/`maxSelectable` contract and the idempotent short-circuit order (duplicate lookup → selection → reconstruction → insert) are unchanged.
- New notice UI (`LawyerAttachmentExistingNotice`): explains in Chinese and English that the answer already has a lawyer-review request, shows the shared-document count taken from the persisted `documentSharing.selectedDocumentCount` (`null`/missing → "未记录 / not recorded", never a fabricated 0 and never the current checkbox state) and links to `/lawyer-requests/<id>` (falling back to `/lawyer-requests`). When this state applies the new-request interface (list, checkboxes, submit, note) is not rendered at all.
- The post-submission success card also reads its count from the server response's `documentSharing`, so a repeat submission can never imply that newly ticked documents were added to an existing request.


### Validation actually run (exact, this correction)

- `cd chatbot && pnpm test:unit` → **746 passed, 0 failed, 0 skipped** (Stage 2 baseline 732; +14: 9 in the new `lib/lawyer-requests/attachment-consent-state.test.ts`, 5 in the new `components/lawyer-request-attachment-status.test.tsx`). Both new files are in the `test:unit` list.
- Focused: `node --conditions=react-server --import tsx --test lib/lawyer-requests/lawyer-document-selection.test.ts lib/lawyer-requests/attachment-consent.test.ts lib/lawyer-requests/attachment-consent-state.test.ts` → **30 passed, 0 failed**; `node --import tsx --test components/lawyer-request-attachment-consent.test.tsx components/lawyer-request-attachment-status.test.tsx` → **10 passed, 0 failed**.
- `pnpm exec tsc --noEmit` → **45 errors, identical to the documented baseline** (same nine pre-existing unrelated test files) ⇒ **zero new errors**. An intermediate run showed 58 because the new test file needed explicit types; that was fixed before the final run.
- `pnpm build` → **exit 0** (run after all source changes).
- Changed-file `biome check` → **clean** (11 files); `git diff --check` → **clean**.
- `cd legal-service && pytest tests` was **not** re-run for this correction (no legal-service file changed); the last recorded legal-service result stands at 1286/1286.

### Not run / still blocked (do not read as passing)

- No browser/DOM interaction test: the interaction rules (disabled submit, retry, existing-request state) are covered by driving the real loader through an injected fetcher, by the extracted pure state/payload functions and by static markup rendering in both locales. This repository has no jsdom/Testing-Library harness, so no click-level test is claimed.
- No live end-to-end lawyer request against the owner's host database.
- Owner-host acceptance items are unchanged: durable policy card with `0026` applied, AWS staging S3/DOCX checks, cross-device continuity, Stage 1 owner acceptance.

### Immediate next action

Independent final review of this correction set, then the owner-host acceptance procedure. Do not commit, push, merge or deploy until the owner authorizes it; migration `0026` stays unapplied to the real database.

## Phase 12 Stage 2 closure — explicit lawyer attachment consent (OWNER-APPROVED OPTION A; IMPLEMENTED 2026-10-12)

**Status:** owner-selected **Option A** implemented: before a lawyer-review request is submitted, the customer sees the eligible documents and explicitly chooses which ones to share. **Gate 2 is still NOT claimed as passed.** No commit, push, merge, deploy or migration; migration `0026` remains unapplied outside the isolated test DB.

### Task 1 — explicit attachment selection

- **Customer UI** (`components/lawyer-request-action.tsx` + new presentational `components/lawyer-request-attachment-consent.tsx`): opening 请求律师审阅此答复 now shows the saved question/answer previews and a bounded list of that answer's eligible documents with filename, run status and whether the AI answer acknowledged using them. Every checkbox starts **unchecked**; the panel states that only checked documents and their permitted excerpts are shared; the selection count (`已选择 / Selected: n / 4`) is always visible; AI-acknowledged documents the customer left unchecked are named as withheld ("the lawyer will not receive any part of them"); a request without attachments stays valid; more than four selections is blocked with a clear error and a disabled submit. All copy exists in Chinese and English.
- **Server contract** (`app/api/lawyer-requests/route.ts`): the POST body accepts `attachments: { consent: true, selectedDocumentIds: [...] }` (schema bounded to 4 ids, each ≤64 chars). Absent ⇒ nothing is shared — permission is never inferred from the button. Selection is validated against the **server-persisted manifest of that answered turn** (`customer_document_used_ids` never trusted from the client), then re-validated against the owner's own rows: ownership, conversation, document/run identity, retained status (`stored` + `clean` + not deleted), the limit and exact hash-verified reconstruction. Forged, cross-conversation, stale, deleted or duplicate selections are rejected with explicit errors.
- **New GET eligibility** (`GET /api/lawyer-requests?chatId=…&assistantMessageId=…`, no new route directory): returns `questionPreview`, `answerPreview` and `attachmentSelection` (`documents[]` with authoritative filenames from the application rows, `maxSelectable: 4`, acknowledged counts, `unavailableCount`). An existing request for that message returns `status: "already_requested"` and no documents.
- **Persisted evidence of the decision** (`buildCustomerDocumentSelectionEvidence`): one bounded, filename-free `customer_document_selection` record per request — version, mode (`explicit_selection` / `no_selection` / `no_documents`), eligible/acknowledged/selected/acknowledged-shared/acknowledged-withheld counts and the limit. No ids of withheld documents, no filenames, no excerpts.
- **Customer review**: `customerLawyerRequestView` now exposes `sharedDocuments` (their own filenames + acknowledged flag) and `documentSharing` counts, so the customer can review exactly what was disclosed.
- **Lawyer view**: `used_by_answer` plus the new sharing counts — acknowledged-and-shared, customer-selected (not acknowledged), and "N acknowledged document(s) withheld by customer choice" as counts only. Withheld filenames and excerpts are never rendered for the lawyer.
- **Idempotency**: the duplicate-request lookup runs before any attachment work or insert, so a retry with a different selection returns the stored request unchanged (asserted by ordering test + the unique index on (user, assistantMessageId)).
- **Legacy answers**: keep their stored manifest meaning (no per-document ids ⇒ marked as acknowledged), but the new explicit selection rule applies to any new request; existing submitted requests are untouched.
- No migration: the snapshot version constant is now `phase12.s2.consent.v1` and the selection record travels inside the existing `evidenceSnapshot` JSON.

### Task 2 — attachment limit and no silent truncation

`selectLawyerDocumentAttachments()` no longer slices. It takes `selectedDocumentIds` and returns either the exact selected attachments or an explicit error: more than the limit (`You can share at most 4 documents with the lawyer.`), unknown/foreign/duplicate ids, a non-array selection or a missing manifest. Nothing is ever auto-included, so an acknowledged fifth document the customer did not check is explained as withheld instead of being added; `slice(0, 4)` no longer appears in the route (asserted). The 4-document cap, the 12 000-character excerpt budget, the exact reconstruction and the hash verification are unchanged; a selected document that can no longer be reconstructed fails the request with "uncheck it and try again" rather than disappearing.

### Validation actually run (exact, closure)

- `cd chatbot && pnpm test:unit` → **732 passed, 0 failed, 0 skipped** (R2 close 715; +17: 5 selector/limit/wiring cases, 7 consent/view/projection/copy cases, 5 bilingual consent-panel render cases). `attachment-consent.test.ts` and `lawyer-request-attachment-consent.test.tsx` are part of the `test:unit` list.
- `pnpm exec tsc --noEmit` → **45 errors — identical to base `ce4e803`'s 45**, all in pre-existing unrelated test files.
- `pnpm build` → **exit 0**.
- Changed-file `biome check` → **clean** (14 files); `git diff --check` → **clean**.
- `cd legal-service && pytest tests -q` → re-run for regression only (no legal-service file changed in this closure); result recorded in the completion message.

### Not run / still blocked (do not read as passing)

- No browser run for the new consent panel: the panel is covered by static markup rendering in both locales, and the workspace browser spec was not re-run (no workspace surface changed).
- No live end-to-end lawyer request with real documents (needs the owner's host application DB and a VIP account); the route's DB-dependent branches are covered by pure-function tests plus source/wiring assertions.
- Owner-host acceptance items from R1/R2 are unchanged: durable policy card with `0026` applied, AWS staging S3/DOCX checks, cross-device continuity, Stage 1 owner acceptance.

### Immediate next action (closure)

Independent final review of the owner-approved Option A implementation, then owner host verification. Do not commit, push, merge or deploy until the owner authorizes it; migration `0026` stays unapplied outside the isolated test DB.



## Phase 12 Stage 2 R2 — final focused corrections (IMPLEMENTED 2026-10-12; awaiting final review)

**Status:** R2 corrections IMPLEMENTED on top of the uncommitted Stage 2 + R1 work. R1-2 and R1-3 were accepted at the static design level and were **not** redesigned. **Gate 2 is NOT claimed as passed.** No commit, push, merge, deploy or live migration happened; migration `0026` is still **unapplied** outside the isolated test DB.

### R2-A — per-document provenance (one acknowledged document no longer claims the packet)

The reviewer found that the widget routes passed the **entire** packaged manifest to `acknowledgedCustomerDocumentProvenance()` whenever the backend's boolean was true, so one acknowledged document made every packaged file look used.

- `QueryResponse` gained **`customer_document_used_ids`** (bounded ≤8): the ids the answering model **acknowledged** *and* that this request actually authorized. `default_agent_serving_service` returns them only for the `confirmed` state, and its telemetry now names the basis (`usage_basis: "model_acknowledged" | "none"`) so a reviewer never reads "confirmed" as independent evidence verification. Single-shot paths (Fast, Premium, legacy reasoning, V2) have no acknowledgement channel and always return an empty list — their `supplied_unconfirmed` semantics are unchanged.
- `acknowledgedCustomerDocumentProvenance(manifest, used, preserved, acknowledgedIds)` now returns the **acknowledged subset** of this turn's own manifest. A forged, cross-conversation or stale id can never introduce a document, and a boolean without matching ids downgrades to not-used instead of claiming the packet.
- All three widget routes pass `data.customer_document_used_ids`; only the acknowledged subset is served to the customer (`customerDocumentSources(answeredCustomerDocumentManifest)`), while the persisted metadata now carries **both** the packaged manifest (the conversation-authorized attachments of that turn) and `customerDocumentUsedIds` (the acknowledged subset).
- Reload (`extractAssistantMetadata`) exposes only the acknowledged subset; answers stored before per-document acknowledgements have no ids and keep exactly what they stored — nothing is invented retroactively, and no new answer can reach that path.

### R2-A lawyer-request compatibility (implemented, not a silent widening)

R1's stricter flag **did** remove all customer-document context from Fast/Premium lawyer requests, because the snapshot keyed off the same conflated boolean. R2 keeps the two categories distinct instead of dropping one:

- New pure selector `selectLawyerDocumentAttachments()` reads **only** the bounded manifest persisted with the answered turn (so no document outside that turn's authorized scope can reach a lawyer) and marks every entry `used_by_answer` — true only for the acknowledged subset, false for an authorized attachment the answer never claimed.
- `LawyerRequestEvidenceItem` gained `used_by_answer`; both lawyer views (staff portal detail and the lawyer workspace evidence panel) now state per document whether the AI answer acknowledged using it, and the heading already says "bounded excerpts supplied to the AI, not full documents".
- Bounds are unchanged or tighter: at most 4 documents (acknowledged first so the answer's stated basis always survives), the same 12 000-character excerpt budget, and the same exact-reconstruction contract (`getMatterDocumentEvidenceForLawyerSnapshot`: owner + same conversation + run + ordinals + hash-verified text).
- Integrity rules: an acknowledged document that cannot be reconstructed keeps the strict 409; an unacknowledged attachment that has since been removed is skipped rather than blocking the request; an acknowledged id with no usable manifest entry is an integrity error. The previous `manifest.length > 4 → 409` rejection (which would have blocked lawyer requests for 5+ packaged files) is gone — the selector bounds instead of failing.
- Old stored answers have no ids; they keep their stored (pre-R2) meaning and are marked used, so existing lawyer requests behave exactly as before.

### R2-B — file-name privacy in review traces and archives

The reviewer found that the review trace recorded `customer_document_summary`, which carries `unusableFilenames`, and that `_safe_json()` does not redact PII.

- New deterministic helpers in `customer_document_context.py`: `sanitized_customer_document_summary()` (counts, availability/packaging and the **number** of withheld filenames only) and `filename_free_customer_document_summary()` (same type as the input, every filename removed) — both covered by 4 unit tests.
- `review_trace_service.py` now writes every request copy through `_trace_safe_payload()` (drops the evidence packet, blanks the summary filenames) — for the trace `request` dump, the explicit `customer_document_evidence_summary.customer_document_summary` field (counts only), the `matter_id=None` fallback path and the archive hand-off; the trace also records `customer_document_used_ids` for R2-A provenance.
- `experience_archive_service.py` sanitizes the summary in `_build_persistence_payload` **and** in `build_snapshot` (so any caller is covered), and the archived request now carries the sanitized counts plus the acknowledged-use state and count instead of the raw summary.
- Test with the synthetic name `Client_Passport_12345678.pdf` proves it never appears anywhere in the trace JSON, the archived request or the archived snapshot request, while counts (`total`, `usable`, `packaged`, `unusableFilenameCount`, …) survive. The authenticated app's own file display is untouched: it reads the application database (the customer's own uploads), not these traces.




### Validation actually run (exact, R2)

- `cd chatbot && pnpm test:unit` → **715 passed, 0 failed, 0 skipped** (R1 close 699; +16 after R2: 6 provenance + 9 lawyer-selection + 1 reload test, and the R1-era contract tests updated to the corrected contract). Both R2 test files are now part of the `test:unit` list.
- `cd legal-service && /home/rico/anaconda3/envs/torch/bin/python -m pytest tests -q` → **1286 passed, 0 failed** (2 pre-existing pydantic deprecation warnings; R1 close 1273; +13 R2 tests).
- Focused: `test_phase12_stage2_r2_document_usage_ids.py` (9) + `test_phase12_stage2_r2_trace_privacy.py` (4) + R1 usage tests = 26 passed; `r2-document-provenance.test.ts` + `lawyer-document-selection.test.ts` = 15 passed; `message-parts` / `conversation-http` / provenance / public-answer-preservation = 29 passed.
- `pnpm exec tsc --noEmit` → **45 errors — identical to base `ce4e803`'s 45**; changed-file `biome check` → **clean** (17 files); `git diff --check` → **clean**.
- `pnpm build` → **exit 0** (route/type integrity only; no DB or browser side effects).
- **Not run in R2:** the committed Playwright workspace spec. R2 touched no workspace surface (server routes, lawyer portal components, lib helpers), so it was not re-run rather than reported as passing; the R1 run remains 20/20. No paid/live model call; no migration applied; the canonical legal corpus untouched; the isolated test DB was not needed for R2.


## Phase 12 Stage 2 R1 — independent review corrections (IMPLEMENTED 2026-10-12; awaiting re-review)

**Status:** R1 corrections IMPLEMENTED on top of the uncommitted Stage 2 work. Awaiting independent re-review. **Gate 2 is NOT claimed as passed.** No commit, push, merge, deploy or live migration happened. Migration `0026` remains **unapplied** to `chatbot`, `immigration_legal`, staging and production.



### R1-1 — document use is verified, never assumed

The reviewer found that the Default serving path reported `customer_document_evidence_used=True` whenever a packet was present and a non-safety answer existed, conflating availability with use.

- `AgentSubmissionV2` gained an explicit, separately typed **`customer_documents_used: list[str]`** acknowledgement (optional, ≤8 items, each ≤64 chars, unique), advertised in the `submit_answer` tool schema **only as an optional property**, and requested by a deterministic instruction inside the customer-document prompt section ("leave `customer_documents_used` empty when you did not rely on any supplied document; never list a document you did not receive").
- `matched_document_acknowledgements()` keeps only ids that are verbatim members of **this request's authorized manifest**, so an invented or cross-request id can never claim use.
- New tri-state **`customer_document_usage`** on `QueryResponse` (`not_supplied` / `supplied_unconfirmed` / `confirmed`) is the authoritative state; `customer_document_evidence_used` is now strictly `usage == "confirmed"`. A safety block or an empty answer resets both to the honest non-claim state.
- The same honest semantics now apply to **Fast, Premium direct, legacy reasoning and V2**: those single-shot paths have no acknowledgement channel, so a supplied packet is reported as `supplied_unconfirmed` with the strict boolean `False` — never asserted as used.
- Deterministic helpers live in `legal-service/app/services/customer_document_context.py` (`customer_document_usage_state`, `customer_document_usage_fields`, `matched_document_acknowledgements`); telemetry records usage plus authorized/acknowledged/unmatched counts without retaining document text.
- Bot side: `customerDocumentUsageState()` (never upgrades a state; `confirmed` requires the backend's verified boolean) is carried through route metadata, the response payload, resume/replay branches, `extractAssistantMetadata`, `conversation-http.ts` and the workspace types, so a reload preserves the honest state. Every customer-visible "used your file" surface (evidence card, lawyer-request manifest) remains gated on the strict verified boolean.
- **Residual risk for the owner (DECISION REQUIRED, not silently changed):** because the lawyer-request snapshot forwards the manifest only when `customer_document_evidence_used === true`, a Fast/Premium answer no longer auto-attaches the customer's document evidence to a lawyer request. That is the honest consequence of R1-1 (the old behaviour rested on the conflation). Widening it would need a separate approved provenance rule; nothing was changed.


### R1-2 — the policy topic survives unpublication

The reviewer found that the widget routes rebuilt the model-side topic from a **live** lookup of the bound slug, so an archived/withdrawn/superseded publication erased the topic and follow-ups such as "这项政策" stopped resolving.

- New pure builder `buildConversationPolicyTopicContext()` (`chatbot/lib/policy-intelligence/conversation-policy-binding.ts`) renders the topic **from the persisted binding snapshot**: slug, bilingual titles, official source title/URL, creation-time revision, publication date and publication status. It is labelled *topic context only — never proof of current law and never legal evidence*, and it carries no `evidence_ref`/`canonical_source_id`.
- When the live publication still resolves, the current revision is added as a **separate line** (plus an explicit "the topic has been revised since this conversation started" note) instead of silently replacing the user's original topic; a `snapshot: true` reference never claims to be current. When it no longer resolves, the text states that the original publication is not currently available in the published index and must be re-confirmed, while the topic stays intact.
- New server resolver `resolveConversationPolicyTopicContextEntry({ binding })` performs the live lookup **best effort** inside a `try/catch`: a failed or missing live read can never remove the durable topic. All three widget routes now call it with `workspaceContext.policyBinding` and no longer use `getPolicyTopicContextEntry(slug)` or `workspaceContext.policyTopic.slug`.

### R1-3 — a long-lived conversation is no longer rejected

The reviewer found that `CustomerDocumentSummary` capped every count at 64 while the widget reports real counts, so a conversation with 65+ files rejected an otherwise valid legal question.

- Counts are now bounded at `MAX_CUSTOMER_DOCUMENT_COUNT = 100_000` (finite but not artificially small); evidence text, filenames (≤3 × 120 chars) and packet size stay bounded exactly as before.
- New **`packaged`** field distinguishes the usable files whose text was actually supplied to this turn from **all** stored/usable files (`total`/`usable`). The widget sets it from the evidence packet it built (`manifest.length`, clamped to `usable`), and the deterministic status renderer states "Only N of the M readable file(s) were supplied to you for this turn … do not claim to have read any file that was not supplied".
- Reading cost no longer grows with conversation length: one batched `selectDistinctOn` query returns the latest processing run **per stored document**, and extraction text is only fetched lazily for the bounded packet. Documents that are not fully stored, or not security-clean, never carry a run status into the summary.
- **Reviewer's regression check closed:** a conversation with one readable and one unreadable file now states both facts (`Of N file(s), X produced readable text but Y did not … do not claim to have read them`) instead of silently returning nothing whenever `usable > 0`.

### Committed browser checks (replacing the temporary external script)

`chatbot/tests/e2e/phase12-stage2-workspace.test.ts` + `playwright.phase12-stage2.config.ts` (script `pnpm run test:phase12:stage2:browser`, requires `P12_STAGE2_E2E_BASE_URL`) run five real-browser checks at 1920×1080 / 1366×768 / 768×1024 / 390×844: bounded single-row composer with no attachment list, upload affordance adjacent to the composer with a reachable send control, the chat keeping the primary reading area, labelled panels below 1280px (and the three-column context panel above it), and the guest file hint appearing instead of a raw authorisation error. Test ids were added where a check needed a stable hook (`composer-upload`, `conversation-files-upload`; existing `workspace-*` ids are reused).


### Validation actually run (exact, R1)

- `cd chatbot && pnpm test:unit` → **699 passed, 0 failed, 0 skipped** (Stage 2 close was 673; +26 R1 tests).
- `PHASE12_TEST_DATABASE_URL=… pnpm run test:phase12:stage2:documents:integration` (isolated disposable DB) → **1 passed, 0 failed**, process exits cleanly. The same test **failed before the fix** with `8 !== 66`, which is how the reviewer's 65+ case exposed a real truthfulness defect in the first R1 attempt (the summary had only seen the packaged subset): the fixture now proves total=70 / usable=66 / noUsableContent=2 / failed=2 with a bounded packet (≤8 documents, ≤64 units, ≤64 000 chars).
- `PHASE12_TEST_DATABASE_URL=… pnpm run test:phase12:stage2:integration` → **1 passed, 0 failed** (owner-scoped bindings, idempotent launch, cross-user isolation, cascade delete, unresolvable slug creates nothing).
- `P12_STAGE2_E2E_BASE_URL=… pnpm run test:phase12:stage2:browser` → **20 passed / 0 failed, exit 0** (5 checks × 4 viewports).
- `cd legal-service && /home/rico/anaconda3/envs/torch/bin/python -m pytest tests -q` → **1273 passed, 0 failed** (2 pre-existing pydantic deprecation warnings; Stage 1 close 1247, Stage 2 close 1260).
- `pnpm exec tsc --noEmit` → **45 errors — identical to base `ce4e803`'s 45** (worktree-compared; unchanged by R1).
- Changed-file `biome check` → **clean** (20 files); `git diff --check` → **clean**.
- No paid/live model call was made; no migration was applied; the canonical legal corpus was untouched.

### Test-environment artefacts removed (recorded honestly)

- The four-viewport browser runs created **80 guest sessions and 40 conversations** in the development database (multiple Playwright contexts per check). Exactly those rows (guest users created inside the run window and their chats/conversations/messages/documents) were deleted and verified; the 255 pre-existing guest rows were left untouched.
- An earlier failed documents-integration seed left one orphan `p12s2docs-*` test user; it was deleted and verified (`leftover: 0`).
- `git diff --check` flagged two trailing-blank-line-at-EOF issues (one Stage 2 source file, one memory document); both were trimmed.

### Not run / still blocked (do not read as passing)

- Repository Playwright E2E suites other than the Stage 2 workspace spec (`pnpm test`, `playwright.stage3.config.ts`, `playwright.political-gate.config.ts`).
- Durable policy-card behaviour after refresh/history/second device **with `0026` applied** in a *browser* (the integration test covers the binding; topic survival is proven by the legal-service model-input test plus the bot request-construction test).
- AWS-case policy launch, real staging S3 preflight/download, DOCX extraction end-to-end and cross-device continuity remain **owner-host verification** items.
- Stage 1 owner cross-device acceptance remains incomplete; Gate 1 is still not claimed as passed.

### Immediate next action

Independent **re-review of the R1 corrections**, then owner host verification and the owner cross-device procedure. Do not commit, push, merge or deploy until the owner authorizes it.


## Phase 12 Stage 2 — Context, policy handoff and compact workspace UI (IMPLEMENTED 2026-10-12; awaiting independent review + owner acceptance)

**Status:** IMPLEMENTED. Awaiting independent code review and owner host/cross-device acceptance. **Gate 2 is NOT claimed as passed.** No commit, push, merge, deploy or live migration happened. The canonical legal corpus and the authoritative application database were not modified.

### A. Durable policy-to-conversation binding (server-persisted)

A policy launch used to live only in transient React state (`linkedPolicyReference` + `linkedPolicyChatIdRef`), so a hot client-side navigation kept an unrelated conversation on screen, a reload/history reopening lost the visible topic, and a launch that failed to persist could appear to succeed.

- New additive table **`ConversationPolicyBinding`** (`chatbot/lib/db/schema.ts`) stores, per owned conversation: `policySlug`, `policyOrigin`, `policyItemId`, `policyRevisionNumber`, `policyPublishedAt`, `policySourceStatus`, `policyRevisionToken`, bilingual title snapshot (`titleZh`/`titleEn`), `officialTitle`, `officialUrl`, `launchId`, `boundAt`/`updatedAt`. Migration source: **`chatbot/lib/db/migrations/0026_phase12_stage2_conversation_policy_binding.sql`** (drizzle-kit generated, renamed to the repository's descriptive convention, journal tag updated).
- **The client may only request a policy by slug.** `POST /api/immigration-conversations` resolves the slug server-side through the same trusted publication gate the policy detail page uses, then writes chat + conversation + snapshot **in one transaction** (`createImmigrationConversationWithPolicyBinding`). A slug that does not resolve returns `404 policy_topic_unavailable` and creates nothing.
- **Recovery on every read path.** The detail and list responses carry `policyBinding`, so refresh, history reopening and a second device render the card from the stored snapshot. The client accepts a binding only when it names the conversation on screen (`shouldApplyPolicyBinding`).
- **Idempotent launch.** `launchId` (browser-remembered per slug, `lib/workspace/policy-launch.ts`) plus a unique index on `(userId, launchId)` makes a retried or racing launch resolve to the same conversation instead of a second empty one; a genuinely new launch uses a new id, so the explicit "new conversation" ability is preserved. A unique-index race (`23505`) is caught and resolved to the winning row.
- **One-time initialization defect fixed.** Initialization is now keyed by launch identity (`policyLaunchKey` = intent + slug + chatId, tracked in `appliedPolicyLaunchKeyRef`) instead of a one-shot `initializationStartedRef` boolean, so navigating from one policy to another while the workspace is already mounted actually launches that policy.
- **No silent downgrade.** The server page reports an explicit `policyLaunchState` (`requested`/`resolved`/`unavailable`) instead of redirecting an unresolvable policy to a plain workspace. The workspace renders an explicit, recoverable card (`data-policy-launch-state`) with retry / open-policy / explicit "continue without the policy" actions. Browser-verified: a launch that cannot be persisted shows `policy_binding_unavailable` and **creates no conversation** (count unchanged).
- **Topic ≠ law.** The card shows the creation-time revision and the snapshot notice and never presents the snapshot as currently effective law. Widget routes resolve the topic hint from the stored binding (`resolveConversationPolicyTopicContext`); a client slug is used only while the binding schema is absent, and only for a conversation the caller owns.
- **Rollout compatibility.** `conversationPolicyBindingSchemaAvailable()` probes the catalog once (`to_regclass`) and the API answers `503 policy_binding_unavailable` when migration `0026` is not deployed, so the code runs safely against a database that has not received it.

**Branch:** `codex/phase12-stage1-user-data-reliability` (implementation branch; NOT merged)
**Stage 1 implementation commit:** `0a0a82be36ac2133bd98c91fb2b5c1df477b9181` (remote-verified before the docs-only SHA record)
**R3 final-closure commit:** `dc4492169edeea70bd0123b9ef65cff5c20db93b` — `fix(phase12): retained-VIP typing and legacy read-only workspace (R3)` (remote-verified)
**R2 review-correction commit:** `78d19c3087fd91eef62aab2f6ef8487948d97cc2` — `fix(phase12): atomic assistant persistence and whole-token lease fencing (R2)` (remote-verified)
**R1 review-correction commit:** `b5d2fd40363c6f7eac0ea704448c5fc786acf97e` — `fix(phase12): single-execution turn lease, fail-closed persistence, legacy history (R1)` (remote-verified)
**Stage 1 base:** `phase12-user-data-reliability-policy-intelligence@3fa358dad5d75f6bf9ed8a5332b6a94e72e6e323`
**Phase 11 base:** `3b3653202f9b067fbed4adfd410edc02cb7215cc`  
**P11-001 verified checkpoint:** `4bc039c60f72e61e2e3b6a7cc26a88a862d5c1e3`  
**P11-002A verified checkpoint:** `d0964924be003fd61902fca760bd71aca53abe4f`  
**P11-002B verified checkpoint:** `9454a5e4b5a5c5515967ad977faa2355ba053fc5`  
**P11-003A implementation checkpoint:** `f7fa6363e4f2ee326306b20203692dd73e45cebd`  
**P11-003A provenance-hardening checkpoint:** `4f232fe40161a7adad104bcbf6c382b846425936`  
**P11-003B verified checkpoint:** `081ef46dd040b6131d475750d0968c9f2e461bb2`  
**P11-003C starting checkpoint:** `f54b525c225c33877954fab306d615c88213e89b`  
**P11-003C verified checkpoint:** `fa02295675dc4343430ae0a109722141e669bbf9`
**P11-004 verified checkpoint:** `f2d941734d256c9e0a0e42988cd67cdb828d0dc6`
**Git-state rule:** verify the live branch tip with `git rev-parse HEAD`; documentation-only memory commits may advance HEAD without runtime changes  
**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase

### B. One typed context resolver and real customer-document evidence in every mode

- New **`chatbot/lib/workspace/context-resolver.ts`** (server-only, `projectId: null` reserved) is the single authenticated resolver used by **all three** widget routes (Fast, Legal Check, Premium): account/user, authorized conversation, optional matter, server-persisted policy binding, bounded message history, conversation-scoped document evidence, processing/availability summary, provenance/use status. An unowned chat resolves to an empty context, never to widened scope.
- New **`buildConversationDocumentContext`** returns the bounded evidence packet **and** a bounded availability summary (`total`, `usable`, `usableTruncated`, `noUsableContent`, `processing`, `failed`, ≤3 sanitized filenames) from the same owner-authorized read, so the panel and the model can never disagree.
- The summary travels as `customer_document_summary` — **control data, not evidence** — and the legal service renders a deterministic limitation when a conversation has files but no usable text (`format_customer_document_status_context`): do not describe/summarise the file, do not claim to have read it, plus the concrete recovery step. This closes the reported defect where an answer appeared to discuss a PDF while the UI said "已保存，但未提取到可用内容".
- **The reported Legal Check gap is fixed:** `AgentRuntimeRequest` previously carried no customer document evidence at all, so the Default AgentRuntime never received the customer's own file even though Fast and Premium did. It now carries a rendered, bounded `customer_document_context` + `customer_document_evidence_present`; `AgentRuntimeService._build_user_message` renders it as clearly labelled **untrusted customer data, not legal authority**; `DefaultAgentServingService` reports `customer_document_evidence_used` truthfully (evidence present + a real accepted answer + not safety-blocked).
- All four legacy serving paths (Fast, Premium direct, reasoning service, V2 verified answer) now call the single `format_customer_document_prompt_section`, so every mode renders the same view of the customer's files.

### C. Compact, usable AI workspace UI

The mode toolbar is one row (the permanent description block became a hidden-on-small text hint). The chat is the primary reading area: desktop keeps the three-column grid; below 1280px a labelled tab strip (`历史对话 / 本对话文件 / 我的历史文件 / 案件摘要`, `role="tablist"` + `aria-selected`) reveals one panel at a time under the chat instead of forcing a narrow right column. The composer is a single bounded row: upload control adjacent to a `rows={1}` auto-growing textarea (measured, capped at 120px), send button always reachable, Enter sends / Shift+Enter adds a line, IME composition never submits, and **no attachment list grows under it**. The right-hand context panel owns current-conversation files (download/delete/retry/reprocess with truthful status labels), the account-wide file history and the known-facts/case-summary blocks. Upload, delete, reprocess and retry notify the workspace (`onDocumentsChanged` → `documentsRevision`), which refreshes both the conversation file panel **and** the account-wide history automatically. Guest accounts see a localized "sign in to manage files" hint instead of an unlocalized API authorisation error, and the document APIs are not called at all for guests.

### Validation actually run (exact)

- `cd chatbot && pnpm test:unit` → **673 passed, 0 failed, 0 skipped** (Stage 1 close was 634; +39 Stage 2 tests).
- `PHASE12_TEST_DATABASE_URL=… pnpm run test:phase12:stage2:integration` (isolated disposable database `immigration_ai_phase12_stage1_test`) → **1 passed, 0 failed, exit 0**.
- `pnpm exec tsc --noEmit` → **45 errors**, verified against the same **45** errors at base `ce4e803` (temporary worktree comparison; no new error, none in Stage 2 files).
- `pnpm build` → **exit 0**.
- `git diff --check` → **clean**; changed-file `biome check` → **clean**.
- `cd legal-service && /home/rico/anaconda3/envs/torch/bin/python -m pytest tests -q` → **1247 passed, 0 failed** (2 pre-existing pydantic deprecation warnings). Stage 2 file alone: 10 passed.
- Real browser checks (out-of-repo Playwright script against a local dev server; screenshots kept in `/tmp/stage2-shots`): **26/26 checks passed** — 1920×1080 and 1366×768 desktop (3-column, right context panel visible, bounded 40px composer, 597/285px message area), 768×1024 and 390×844 (tab strip present, chat primary, conversation-files panel reachable via tab, bounded composer), no attachment list under the composer, and the pre-migration policy launch behaving exactly as designed.
- `pnpm run s3:preflight` → now runnable: without configuration it exits **2** with its own message and no `TransformError`; with a non-existent bucket it performed the read-only describe calls, failed closed (`ok:false`) and exited 1. Regression test added.

### Environment incidents recorded honestly (no customer data affected)

- **Migration status:** `0026` is **NOT applied** to `chatbot`, `immigration_legal`, staging or production. It was applied **only** to the isolated disposable test database (authorized) so the integration test could run. Verified afterwards: the `chatbot` database has **no** `ConversationPolicyBinding` relation, and the migrate operator script refuses any target whose `current_database()` is not the isolated test database.
- **Wrong-database test run (contained):** the first integration-test invocation passed a URL whose database substitution silently did not match, so the test ran against the `chatbot` development database. It created 6 synthetic `p12s2%@example.test` users and no chats/conversations/messages (the binding insert failed and rolled back). Detected immediately, cleaned up exactly those 6 synthetic users, verified `0` remained, then re-ran against the isolated database (passed). No customer row was read, modified or deleted.
- **Browser-check artefacts (contained):** the browser runs created 13 guest sessions (3 with one auto-created empty conversation each) in the development database. Exactly those 13 guest rows and their 3 chats/conversations were removed (0 messages); the 255 pre-existing guest rows were left untouched.
- `psql` prompted for a password while inspecting the migration ledger; it was stopped and the application's own database client was used instead. No credential was printed, logged or written.

### Not run / still blocked (do not read as passing)

- Repository Playwright E2E suites (`pnpm test`, `playwright.stage3.config.ts`, `playwright.political-gate.config.ts`) were **not** run; the four-viewport evidence above comes from an out-of-repo script.
- Durable policy-card behaviour after refresh / history reopening / second device **with `0026` applied** is proven by the isolated-database integration test, not by a local browser run (the local application database has not received the migration).
- AWS-case policy launch, real staging S3 preflight against the owner's bucket, original-byte download, DOCX extraction end-to-end and cross-device continuity remain **owner-host verification** items.
- No paid/live model call was made in this task. Legal Check/Premium document consumption is covered by deterministic contract tests, not by a live answer-quality run.
- Stage 1 owner cross-device acceptance remains incomplete (per the owner's update: R1–R3 reviewed, `0024`/`0025` applied locally, S3 upload and account file history visually confirmed; cross-device, original-byte download, DOCX and failure-path acceptance outstanding). Stage 1 Gate 1 is still **not** claimed as passed.

### Immediate next action

Independent review of the uncommitted Stage 2 diff, then owner **host** verification against a database that has received `0026` (disposable/migrated environment or an explicitly authorized application-database migration), then the owner cross-device/cross-browser procedure. Do not commit, push, merge or deploy until the owner authorizes it. If the owner authorizes a commit, the expected sequence is a normal `git add`/`git commit` on `codex/phase12-stage2-context-ui`, a normal (non-force) `git push`, then remote SHA verification.

## Phase 12 Stage 1 — Account-centred durable history and documents (IMPLEMENTED 2026-10-11; awaiting external review)

**Status:** IMPLEMENTED on `codex/phase12-stage1-user-data-reliability`. Stage 1 is NOT accepted: independent code review plus the owner cross-device procedure (`docs/agent-memory/tasks/PHASE12_STAGE1_OWNER_ACCEPTANCE.md`) are still required. No merge, deploy or live migration has happened.

### R3 final closure (2026-10-11, same branch)

The owner authorized exactly two bounded corrections within Stage 1. R2's atomic persistence and lease fencing were left untouched.

**A. Retained-VIP typing correction (authorized, typing-only).** `lib/vip/entitlement.ts` declared the return type of `getRetainedPrepaidVipEntitlement()` as `Pick<EntitlementUser, "membershipTier" | "vipExpiresAt">`, which widens `vipExpiresAt` to `Date | string | null`. The function only ever returns a real `Date` or `null`, so the widened declaration did not match the database timestamp column in `lib/db/queries.ts` (`.set(retainedEntitlement)`). The return type is now the explicit `RetainedPrepaidVipEntitlement` (`membershipTier: VipMembershipTier`, `vipExpiresAt: Date | null`). Runtime logic, returned values, Stripe events, subscription handling, VIP eligibility and billing records are unchanged (the diff is a type declaration, a doc comment and one focused type/runtime test). This removed exactly two pre-existing errors — `lib/db/queries.ts` TS2345 and `lib/vip/billing/webhook-processing.test.ts` TS2322 (same root cause, test file) — and no new errors appeared.

**B. Legacy conversation read-only user experience.** The history API already returned `origin: "legacy_chat"`; the workspace ignored it, so opening an archived chat offered a composer whose submissions the answer route must reject (the route requires an `ImmigrationConversation` row). Now:

- Frontend conversation summary/detail types accept `origin: "immigration" | "legacy_chat"` and normalize it defensively (`unknown -> immigration`).
- The applied origin is kept in component state (`conversationOrigin` + `conversationOriginRef`) and is set atomically with the chat id, messages and matter when a detail response is applied; creating a conversation always resets it to `immigration`. After a reload the origin comes from the detail response, so the read-only state is restored from the server rather than from local caching.
- One shared contract (`lib/workspace/conversation-origin.ts`) decides capability: `readOnly`, `canSubmitMessage`, `canUseSuggestedQuestions`, `canUseGuidedIntake`, `canUploadDocuments`, `canRequestLawyerReview`, `canStartNewConversation`, plus the stale-response guards `shouldApplyConversationDetail`/`shouldApplyOlderMessages` used by the loader and by pagination.
- Archived chats are visibly read-only in both languages: an amber banner (`components/legacy-conversation-notice.tsx`; zh `历史对话（只读）` / en `Archived conversation (read-only)`), a badge in the conversation list (`历史归档` / `Archived`) and a header badge. The composer is **replaced** (not merely disabled) by that notice, so the archived screen has no textarea, no upload control and no send button; the only action is an explicit "Start a new conversation".
- Suggested questions, guided intake, document uploads, lawyer-review requests, persistence retry and consultation booking are disabled or hidden, and the mutating handlers also early-return for an archived chat (defence in depth, so a stray control cannot send into an archived conversation).
- Browsing is untouched: original messages, timestamps, citations, files and "load earlier messages" pagination all still work, and normal conversations keep their full composer, uploads, AI modes and matter workflows.
- Rapid switching is safe: a detail response is applied only when it belongs to the newest request and to the requested chat id, older-message pages merge only into the conversation on screen, and sending is refused while a switch is in flight.
- The server remains the authority: the widget answer route still refuses a chat without an immigration conversation row, and the read paths never create or repair one (asserted against real PostgreSQL).

**R3 test evidence:** unit suite **634/634 passed, 0 failed, 0 skipped**, including new real-logic tests (`lib/workspace/conversation-origin.test.ts`, 9 cases), component-level render tests of the archived surface in both locales (`components/legacy-conversation-notice.test.tsx`, 5 cases — including that the read-only screen renders no `textarea`/`input`/send control and that the new-conversation button is the only enabled control), copy tests for both languages, a wiring guard, two HTTP-contract tests proving `origin` is carried in the detail response, and the focused VIP type/runtime test. The PostgreSQL integration test is **1 passed / 0 failed / 0 skipped**, now also asserting that listing/reading an archived chat creates no `ImmigrationConversation` row, that historical messages and timestamps stay intact and readable, that the widget gate still rejects the chat, and that another account still cannot read it.

**R3 validation totals:** `pnpm build` now **succeeds (exit 0)**; `tsc --noEmit` shows **45 errors — exactly the base set minus the two fixed above, no new errors**; changed-file Biome clean; `git diff --check` clean.

**Remaining `tsc` errors (pre-existing, unchanged by R3, none in Stage 1 code):** the 45 errors are all in files that already failed at the Phase 12 base commit `3fa358d`: `lib/policy-intelligence/pipeline.test.ts` (20), `lib/vip/billing/customer-billing-api.test.ts` (10), `lib/ai/models.test.ts` (5), `lib/vip/billing/config.test.ts` (2), `lib/client-portal/client-portal.test.ts` (3), `lib/matter-documents/processing.test.ts` (2), `lib/matter-documents/guardduty-sqs-reconciler.test.ts` (1), `lib/matter-documents/chat-deletion.test.ts` (1), `lib/lawyer-workspace/projection.test.ts` (1). They do not block `pnpm build` (which now passes) and are outside this authorization; they were not modified.

### R2 review corrections (2026-10-11, same branch)

A second independent review found one remaining concurrency defect: `completeTurn()` checked the lease, wrote the pending payload, then inserted the assistant message **without** the lease check inside the same database concurrency boundary, and only then performed the fenced terminal write. A request that lost its lease between the payload write and the message insert could still create the deterministic assistant message row, and the new lease owner then hit a conflicting row and could not persist its legitimate answer.

1. **Atomic assistant persistence (corrected).** Assistant persistence is now one transaction: `finalizeConversationTurnAtomic` locks the turn row (`SELECT … FOR UPDATE`), verifies the whole fence **inside** that boundary, reuses an identical stored message or inserts the new one, and commits the message row, the terminal `assistant_persisted` transition and the clearing of the pending payload together. `completeConversationTurn` (the old non-atomic terminal write) has been removed, and the ledger no longer inserts the assistant message at all — the transaction is the only assistant-persistence path. No transaction spans the model stage.
2. **Whole-token fencing (corrected).** The fence is now the pair `(executionOwnerId, executionAttempt)`: acquisition increments a monotonic `executionAttempt`, and renewal, payload write, finalization and failure all require both values. A superseded attempt cannot write, renew, fail or re-complete the turn even if a later attempt's lease expires — a stale executor can no longer regain authority by re-acquiring an expired lease with its old token.
3. **Expiry and takeover semantics (documented and tested).** Expiry alone does not revoke authority (the same owner may renew after expiry while nobody else has taken over); **takeover** revokes it, and takeover is only possible once the lease has expired. A live lease cannot be stolen.
4. **Partial states preserved.** An identical stored message is reused untouched; a different message owning the deterministic id produces `message_conflict` and **nothing** is written (the historical row is never rewritten). A failed finalization transaction rolls back completely — the turn stays `user_persisted` with its pending payload intact — so the retry resumes the stored answer without another model call. `write_failed` and `message_conflict` release the lease (fenced) so an immediate retry can resume.

**R2 test evidence (real PostgreSQL, isolated database):** the mandated deterministic interleaving is reproduced end-to-end: A acquires the lease and reaches the persistence boundary, A's lease is expired in the database, B acquires the new lease, A resumes first while B still holds the lease → A is rejected (`fence_lost`) and **no assistant message row exists**; B then finalizes → exactly one assistant message with B's content and one terminal state; A's later finalization → `already_completed` with B's message and B's content intact; a subsequent retry replays that same answer without generating again; a stale `failTurn` cannot clear the finalized state. Also covered on the real database: database error between payload and terminal persistence (complete rollback, payload intact, no orphan message, retry resumes and finalizes), duplicate completion idempotency, assistant-id collision, existing successful-turn replay, Fast/Legal Check/Premium contract parity, and all Stage 1/R1 regressions (concurrency, legacy history, pagination, ownership, DOCX, file history).

**R2 validation totals:** unit suite **614/614 passed, 0 failed, 0 skipped**; PostgreSQL integration test **1 passed / 0 failed / 0 skipped**; `tsc --noEmit` shows an error set **identical to the Phase 12 base commit** (verified by normalized diff: 47 pre-existing errors, no new ones); changed-file Biome clean; `next build` compiles successfully and still fails only on the pre-existing retained-VIP typing error (unchanged, still not applied).

### R1 external review corrections (2026-10-11, same branch)

Gate 1 was NOT accepted after review; the review raised four Stage-1 defects and one inherited build blocker. All four Stage-1 defects are corrected on the same branch, and the build blocker is reproduced with an explicit stop-for-authorization note.

1. **Concurrent duplicates could both run the model (CRITICAL — corrected).** The unique turn row only made the *record* unique; it did not make *execution* exclusive. A durable, race-safe execution lease now lives on `ConversationTurn` (`executionOwnerId`, `executionLeaseExpiresAt`, `executionStartedAt`, `executionAttempt`) and is claimed by one atomic compare-and-set statement (`acquireConversationTurnExecution`). Exactly one concurrent request per client turn may execute the model; every other duplicate receives `409 client_turn_in_progress` with `retryAfterMs` and never generates an answer or a second assistant message. Long model stages renew the lease with a fenced heartbeat (`renewConversationTurnExecution`, ~30 s renewal, 120 s lease, stopped on every exit path). A crashed attempt's lease expires and can be taken over; every terminal write (`completeConversationTurn`, `failConversationTurn`, `storeConversationTurnPendingAssistantParts`) is fenced by the lease owner, so an obsolete attempt cannot overwrite or re-complete a newer result. No transaction is held across the model call. Assistant message identity is now server-controlled and deterministic per turn (`deterministicMessageId("assistant:<turnId>")`), and the durable user message id is server-controlled too (`deterministicMessageId("user:<chatId>:<clientTurnId>")`), so retries converge on the same rows.
2. **A failed user-message write could still answer as if persisted (CRITICAL — corrected).** `beginTurn` now fails closed for an authenticated conversation: a failed user-message insert, a failed ledger link, an unverifiable ownership read or a failed claim returns `kind: "persistence_failed"` (`ok: false`) and the route answers `503 conversation_turn_not_persisted` with a retryable persistence state — no model call. A turn is only reported as saved when the user message and the assistant answer are both durable *and* linked (`saved`, `linkVerified` in the persistence payload; the assistant write also verifies the linked user row exists). `assistantTurnPersisted: true` with `saved: false` is now possible and correctly reported when only half the turn is durable. Guest/unscoped requests keep their previous behaviour and make no persistence claim.
3. **Message-id collision handling was too loose (HIGH — corrected).** A duplicate id is accepted as an idempotent retry only for the same immutable message: same id, same chat, same role, same canonical `parts` fingerprint and empty attachments. Anything else fails deterministically (`message_id_conflict` / `message_id_content_conflict`) and the pre-existing row is never modified or acknowledged as durable.
4. **Twenty previously invisible legacy messages (HIGH — corrected).** The read-only audit now classifies them: **20 messages in 4 chats, all owned by registered (non-guest) accounts, none in another account's chats, and 0 chats that have neither a conversation row nor messages**. The history listing uses an owner-scoped `Chat` left join, so these chats are listed as `origin: "legacy_chat"` with `legalMatterId: null` and are readable/paginated through the existing owner-authorized message endpoint. **No row is created, rewritten or backfilled** (asserted on real PostgreSQL: the `ImmigrationConversation` row count is unchanged after every read; message ids and timestamps are preserved). Empty chats with neither a conversation row nor messages stay excluded, so unrelated `Chat` rows never appear. `totalCount` now describes the same eligible set as the listing.
5. **Production build blocker (inherited, NOT changed).** `pnpm build` compiles successfully and then fails the project-wide TypeScript gate on `lib/db/queries.ts` (`Pick<EntitlementUser, "membershipTier" | "vipExpiresAt">`, now line 1949 because of the added `import` line). Reproduced identically at the Phase 12 base `3fa358d` (line 1943) by checking that commit out into a worktree and running `tsc --noEmit` there: **47 errors at base, 47 at HEAD, same error set**. The smallest typing-only correction is a one-line widening in the Stripe/WeChat retained-VIP entitlement lookup; it touches paused payment code and therefore needs explicit owner authorization before it is applied.

**Timestamp frame note (measured, documented for reviewers).** On this AEDT host the driver decodes `timestamp` columns in the process time zone while stored values are wall clocks. Conversation keyset pagination therefore compares a numeric wall-clock epoch (`cursorWallClockMs`) instead of a bound `Date`/ISO string; the new integration test proves exact page boundaries (121 eligible conversations, 25 per page, no gaps or duplicates) on a non-UTC host.

### What changed (bounded to Stage 1)

- **One durable turn contract for all three answer modes.** New `lib/conversations/` modules (`turn-ledger.ts`, `widget-turn.ts`, `message-parts.ts`, `scope.ts`, `pagination.ts`, `conversation-http.ts`, `history-runtime.ts`, `runtime.ts`) replace the three ad-hoc `saveMessages` blocks in `app/api/widget-chat/route.ts`, `app/api/widget-chat-fast/route.ts` and `app/api/widget-chat-direct/route.ts`. The user turn is written before the model stage, the assistant turn after, an already-answered turn is replayed from storage, and an interrupted turn is repaired from a persisted pending payload with no second model call. Failures are reported as `persistence` state in the response instead of being swallowed; conversation bookkeeping failures no longer discard a generated answer.
- **Complete history.** `GET /api/immigration-conversations` now supports `limit` + `cursor` and returns `nextCursor`/`hasMore`/`totalCount`; `GET /api/immigration-conversations/[chatId]` supports `messageLimit` + `olderCursor` and returns `hasOlderMessages`/`olderMessagesCursor`. The 80-record cap is gone; the workspace has explicit "load older conversations" / "load earlier messages" controls, and a request-sequence guard prevents a late response for conversation A from overwriting conversation B.
- **Account-level file index.** `GET /api/matter-documents/history` (owner-only) lists retained files across all of the account's conversations with `limit`/`cursor`; downloads keep the existing byte/hash verification. AI evidence remains scoped to the conversation (`resolveConversationMatterDocumentEvidence` filters by `chatId`, tested).
- **DOCX MIME fix.** `lib/matter-documents/validation.ts` treats the declared browser MIME as advisory: extension allowlist and real OOXML/OLE/signature identity still decide, known conflicting families still fail fast, and the accepted MIME is normalised server-side. `lib/matter-documents/display-status.ts` keeps "stored" separate from "usable evidence".
- **Additive migration (NOT APPLIED).** `chatbot/lib/db/migrations/0024_phase12_stage1_conversation_turn.sql` creates `ConversationTurn` plus three indexes, generated by `drizzle-kit generate`. It was applied only to the isolated disposable database `immigration_ai_phase12_stage1_test` created by `scripts/phase12-stage1-test-db.ts`.
- **Operations.** `pnpm run phase12:test-db <status|create|migrate|drop>` manages the isolated DB; `pnpm run phase12:audit -- --expect-database=<name>` is a read-only sanitized audit; `pnpm run test:phase12:integration` runs the PostgreSQL integration test.

### Validation actually run (no estimates)

- `cd chatbot && pnpm test:unit`: **581 passed, 0 failed, 0 skipped** (includes the new `lib/conversations/*` and `lib/matter-documents/docx-upload.test.ts` suites).
- `PHASE12_TEST_DATABASE_URL=… pnpm run test:phase12:integration` (isolated DB `immigration_ai_phase12_stage1_test`, all 25 repo migrations applied): **1 passed, 0 failed, 0 skipped**. Without the env var the same test reports **1 skipped** with an explicit reason.
- Changed-file Biome (`pnpm exec biome check <changed files> lib/conversations`): **clean, zero diagnostics**.
- `pnpm exec tsc --noEmit`: identical error set to the Stage 1 base commit (all pre-existing, in test files and `lib/db/queries.ts:1947`); **no new type errors**.
- `pnpm build`: Turbopack reports **"✓ Compiled successfully"**, then the build fails the project-wide TypeScript gate on the **pre-existing** error `lib/db/queries.ts:1947` (`Pick<EntitlementUser, "membershipTier" | "vipExpiresAt">`, Stripe/WeChat retained-VIP code from `2830f59`/`0ecde04`). The same error is present at `3fa358d`, i.e. before Stage 1. Fixing it is outside the Stage 1 boundary (Stripe/WeChat activation is explicitly paused and out of scope) and needs an owner decision.
- `git diff --check`: clean.
- Read-only audit on the application database (`chatbot`): 169 chats, 165 conversations, 380 messages, 6 documents, 36 empty conversations (10 recent), 20 messages in chats without an `ImmigrationConversation` row (legacy Phase-1 rows, FK-permitted), 2 documents in `cleanup_pending`, 3 soft-deleted documents, 0 ownership mismatches, 0 documents marked complete without evidence, 0 duplicate message groups. `immigration_legal` holds the legal corpus only (no conversation/document schema) — nothing to audit there.
- Not executed (recorded honestly): browser/Playwright E2E, live model calls, cross-device owner acceptance, and any staging/production run.

### Immediate next action

Independent re-review of the Stage 1 R3 diff, then the owner runs `docs/agent-memory/tasks/PHASE12_STAGE1_OWNER_ACCEPTANCE.md` on Ubuntu/Windows/Android: steps 4-6 of section 5 cover the duplicate-submission, explicit-persistence-failure and legacy-history behaviours, and **section 5A** covers the new archived read-only surface (labelling, no composer, full history browsing, new-conversation action, archived -> normal -> archived switching, Chinese and English). Stage 2 must not start before Stage 1 is accepted; Gate 1 remains pending and is NOT claimed as passed.

### Stage 1 environment side effects (for the owner)

- The isolated disposable database `immigration_ai_phase12_stage1_test` exists on the local PostgreSQL server (same host/port as the application database) and contains only synthetic test data (`@example.test` accounts). Drop it with `pnpm run phase12:test-db drop --confirm-drop` if you do not want to keep it.
- No migration was applied to the application database (`chatbot`) or to `immigration_legal`; `ConversationTurn` exists only in the isolated test database.
- Read-only audit evidence (`chatbot` database): 169 chats, 165 conversations, 380 messages, 6 documents, 2 processing runs, 2 evidence units, 36 empty conversations (10 recent, 0 stale-with-later-activity), 20 messages in chats without an `ImmigrationConversation` row (legacy), 2 `cleanup_pending` upload intents, 3 soft-deleted documents, 0 ownership mismatches, 0 documents marked complete without evidence, 0 duplicate message groups, `ConversationTurn` absent (pre-migration).


**Planning branch:** `phase12-user-data-reliability-policy-intelligence` created from canonical `phase11-chinese-service-platform-ui-rebase@0ed11150015773573cd7e1d0396134e696bf7357`. **Authority:** owner approved a compact three-stage plan and authorized this **documentation-only branch and commit**. This is NOT authorization to implement Stage 1, run migrations, alter existing customer data, deploy, or merge. Owner first syncs branch locally; only then will request the Stage 1 coding-model prompt.

**Detailed authoritative plan:** `docs/agent-memory/tasks/PHASE12_USER_DATA_WORKSPACE_POLICY_2026-10-11.md`.

**Stage 3 scope addition (owner-approved 2026-10-11):** An explicitly authorized lawyer must be able to author an original policy manually in a staff form and save draft, preview, edit, publish, archive/restore without AI model calls, automatic discovery, analysis, verification or AI publication gate. Human-authored records are first-class public policy entries alongside automated entries, with independent durable revisions, source/status/date fields, bilingual editor-provided text, safe deterministic validation, and role/audit controls. See detailed Phase 12 task plan; **no fourth Stage**. Planning/docs only; Stage 1 is still NOT STARTED.

- **Stage 1 — User Data Reliability:** user-owned durable conversation/message/history, idempotency, complete pagination, cross-device history/file retrieval, real DOCX MIME/content fix, optional Project scope interfaces only. **NOT STARTED**.
- **Stage 2 — AI Workspace Integration:** one authorized scope resolver shared by Fast/Legal Check/Premium, actual document evidence in all backend serving paths, persisted policy-to-conversation binding, compact composer and right-side files. **NOT STARTED**.
- **Stage 3 — Policy Intelligence Completion:** fuller official proposed/consultation discovery, permissioned lawyer editorial override **and a separate fully human-authored policy creation/draft/preview/publish path with zero AI dependency**, provenance/audit, clear legal-vs-publication status, currentness/revision continuity, integrated staging gate. **NOT STARTED**.

**Hard gate rule:** each Stage is one integrated coding-model task, with its own full code/tests/DB-owner-host/browser/cross-device evidence, independent review and owner acceptance. A failed/skipped/blocked required check is never PASS. No Stage 2 before Stage 1 PASS; no Stage 3 before Stage 2 PASS. Real database/staging/production changes always require separate explicit owner authorization. No additional milestone fragmentation.

**Durable invariant:** same account on Ubuntu/Windows/Android can access all retained authorized historic messages, attached metadata and original files; full history is NOT the same as cross-chat AI context sharing. Project support remains only optional typed interfaces (`projectId: null`) and no feature. Stripe China activation stays PAUSED (see prior record). Older Phase 11 and Stripe records below are historical, not active instructions for Phase 12.

## Current verified state

- P11-00: **VERIFIED**
- P11-001: **VERIFIED**
- P11-002A: **VERIFIED**
- P11-002B: **VERIFIED**
- P11-003A: **VERIFIED**
- P11-003B: **VERIFIED**
- P11-003C-R1: **VERIFIED**
- P11-003C-R2: **VERIFIED**
- P11-003C-R3: **VERIFIED**
- P11-003C overall: **VERIFIED**
- P11-004: **VERIFIED** at `f2d941734d256c9e0a0e42988cd67cdb828d0dc6`

## P11-003B accepted architecture

P11-003B established the required publication boundary:

- `chatbot/content/policy-intelligence/registry.ts` is the server-only editorial registry;
- `chatbot/lib/policy-intelligence-server.ts` owns server-only published loaders;
- `chatbot/lib/policy-intelligence.ts` owns shared types, validation and pure public-projection logic;
- Home, `/intelligence`, and `/intelligence/[id]` load policy data on the server;
- client presentation receives only explicit public-safe projections;
- `origin` and `discovery` metadata are excluded from public projections;
- the Home preview receives an even smaller projection;
- the production editorial registry remains empty;
- the manual Git-based curation workflow is documented under `chatbot/content/policy-intelligence/README.md`.

Validation at the accepted checkpoint:

- unit tests: **169 passed**;
- production build: **passed**;
- changed-file Biome: **passed**;
- `git diff --check`: **passed**;
- repository-wide lint retained the known 22 unrelated diagnostics.

No DB, admin-write API, crawler, scheduler, LLM summariser, legal-service change or automatic publication was added.

## P11-003C + R1 + R2 implementation

P11-003C, its R1 security correction, and R2 structured Home Affairs strategy are pushed at `009e7f964f86bd6b755d4fe5ded82c922ea48f09`. The operator-only discovery path is separate from the public application:

```text
allowlisted official source
    -> bounded secure fetch/parsing
    -> Home Affairs siteData.alertItems or existing generic strategy
    -> policy-intelligence.discovery-candidate.v1
    -> local non-public artifact or dry-run stdout
    -> human verification
    -> manual PolicyEntry/review/publication gate
```

Changed files:

- `chatbot/scripts/policy-intelligence-discovery.ts`: source configuration, R1 secure bounded fetch, Home Affairs structured-alert extraction, redirect/DNS/content-type/size checks, canonicalisation, fingerprints, candidate contract, deduplication, and bounded discovery.
- `chatbot/scripts/policy-discover.ts`: operator CLI with configured source IDs, `--dry-run`, optional ignored local `--write`, synthetic fixture mode, and bounded candidate count.
- `chatbot/lib/policy-intelligence-discovery.test.ts`: deterministic R1 security, structured parser, source-specific limits, candidate-contract, deduplication, registry-boundary, and local-fixture tests.
- `chatbot/scripts/fixtures/policy-intelligence-discovery/`: synthetic Home Affairs `siteData.alertItems`, sitemap, listing, and detail fixtures.
- `chatbot/content/policy-intelligence/README.md`: discovery sources, structured strategy, CLI usage, candidate semantics, limits, and manual promotion workflow.
- `chatbot/package.json`, `chatbot/.gitignore`: operator command and ignored `.local/policy-intelligence-candidates/` output directory.

Configured discovery sources are grounded in the read-only Python authority registry: Home Affairs (`immi.homeaffairs.gov.au`), Federal Register of Legislation (`legislation.gov.au` and `www.legislation.gov.au`), and ART (`art.gov.au` and `www.art.gov.au`). The TypeScript code has no runtime dependency on `legal-service/`.

The candidate contract is `policy-intelligence.discovery-candidate.v1`. It contains acquisition/provenance fields only: source config and authority, canonical URL, title/date when explicitly present, retrieval time, content type, bounded preview, content hash, HTTP metadata, and strategy. It has no `PolicySourceStatus`, AI analysis, bilingual copy, lawyer commentary, editorial status, or publication operation. Optional write output is local-only under `chatbot/.local/policy-intelligence-candidates/`; the public registry remains untouched and empty.

Generic discovery remains hard-bounded at 4 pages, 8 links per page, 10 candidates, 256 KB total decoded response bytes, 128 KB per response, 5 seconds per request, 15 seconds per run, and 3 redirects. Home Affairs uses a one-page structured-alert strategy with a separate 2 MiB decoded response and total-run ceiling, 100 examined alert items, and no link fan-out. One abort deadline covers DNS, redirects, headers, and complete body streaming. Requests are HTTPS-only, exact-host allowlisted, credential/cookie-free, content-type constrained, manually redirected, and DNS-checked against private/local/link-local destinations. There is no arbitrary URL CLI mode, scheduler, runtime write, or LLM call.

CLI fixture validation:

- Earlier P11-003C generic-link fixture validation: `pnpm --silent policy:discover -- --source home-affairs-guidance --fixture synthetic-listing --dry-run --max-candidates 3` exited 0 and emitted 3 candidates before R2 changed the Home Affairs strategy; R2 uses the dedicated structured fixture below.
- `pnpm --silent policy:discover -- --source home-affairs-guidance --fixture synthetic-home-affairs --dry-run --max-candidates 5`: exit 0; emitted 3 structured non-public alert candidates, with duplicate suppression, raw update metadata, and seed fallback provenance.
- `pnpm --silent policy:discover -- --source federal-register-legislation --fixture synthetic-sitemap --dry-run --max-candidates 3`: exit 0; emitted 3 JSON candidates and the corresponding dry-run summary.
- Live Home Affairs smoke: exit 0, runtime **848 ms**, 5 candidates. The titles were `Subclass 186`, `Skills in Demand 482 processing priorities`, `Employer Sponsored Regional 494 processing priorities`, `Discussion Paper: Reforming Australia's Settlement Grants Programs September 2026`, and `Form Banners - SharePoint Migration Project`; all used `home_affairs_site_alerts` and the configured seed URL, with raw `alertUpdateDate` values `19/09/2026 12:03:28 AM`, `19/09/2026 12:03:27 AM`, `19/09/2026 12:03:26 AM`, `11/09/2026 12:01:53 PM`, and `9/09/2026 4:10:38 PM`. These are unverified discovery candidates, not legal conclusions.

Validation:

- `pnpm test:unit`: **183 passed, 0 failed, 0 skipped** outside the sandbox; the discovery tests contributed 14 passing tests, including the R1 timeout/mapped-IPv6 cases and R2 structured-alert/limit cases.
- `pnpm build`: **passed**.
- Changed-file Biome: **passed**.
- `git diff --check`: **passed**.
- `pnpm lint`: fails with the repository-wide known **22 existing diagnostics**; the fixture HTML was corrected and changed discovery TypeScript/fixtures pass focused Biome checks.

Security review result: no arbitrary URL fetch path; Home Affairs does not recursively crawl or fetch alert URLs; redirects cannot leave the configured host allowlist; local/private/link-local DNS targets are rejected; decoded response bytes remain bounded; candidate output is ignored/non-public and never imported by public components; discovery cannot modify `MANUAL_POLICY_ENTRIES`; no candidate-to-public function or automatic publication path exists; no model/provider is called; no `legal-service/` file changed.

## P11-003C-R1 security correction

R1 corrected the fetch deadline lifecycle without changing the discovery surface. One abort deadline now starts before DNS safety resolution and remains active through redirect hops, HTTP headers, and bounded response-body streaming. Body reads cancel on abort, and run-level discovery passes the remaining runtime into the request timeout. Deterministic tests prove hanging bodies and delayed DNS cannot bypass the timeout.

The IPv4-mapped IPv6 parser now converts dotted IPv4 tails structurally before applying the existing private/local, link-local, unique-local, loopback, and multicast checks. Tests cover `::ffff:127.0.0.1`, `::ffff:10.0.0.1`, `::ffff:169.254.1.1`, `::ffff:192.168.1.1`, `::1`, `fe80::1`, `fc00::1`, `fd00::1`, and existing IPv4 cases.

R1 changed only `chatbot/scripts/policy-intelligence-discovery.ts` and its focused test file. Source configuration, CLI surface, candidate schema/storage, publication boundary, public UI, database, legal-service, LLM, and scheduler behavior remain unchanged.

No database, scheduler, LLM, legal-service, answer-time retrieval, Fast, Legal Check, Premium, Phase-6, or ReasoningBank behavior changed.

Unresolved uncertainty: the live Home Affairs alert feed includes navigation/operational items alongside policy-like alerts, so future human review may need a separately approved curation rule. R2 intentionally does not infer legal importance, legal effect, or publication status.

Recommended next action: owner/reviewer inspect the uncommitted diff, then manually author any verified `PolicyEntry` only through the existing draft/review/publication workflow; do not promote candidate artifacts automatically.

## Review result

GitHub review of the pushed R3 checkpoint found no remaining blocking defect. No GitHub Actions checks were attached to the commit; acceptance is based on the inspected source/diff plus the recorded local validation and bounded live smoke.

P11-003C is closed. P11-004 was activated after a separate owner request; its final status is recorded below.


## P11-003C-R3 correction

R3 corrected the reviewed Home Affairs provenance defect without adding a discovery surface. P11-003C is VERIFIED at `fa02295675dc4343430ae0a109722141e669bbf9`.

Home Affairs alert URLs are now resolved against `page.finalUrl` before the existing HTTPS, exact-host, canonicalisation, and network-safety boundary runs. Root-relative, same-host absolute, and HTTPS protocol-relative URLs are accepted when safe; malformed, HTTP, and out-of-scope URLs are ignored. Alert URLs remain provenance pointers and are never fetched.

The synthetic Home Affairs fixture now includes relative, same-host absolute, protocol-relative, out-of-scope, missing, and duplicate alert URLs. The candidate metadata field is now `sourceMetadata.urlProvenance` with explicit kinds:

- `alert` — validated alert pointer;
- `seed` — explicit fallback when no safe alert URL exists;
- `fetched_page` — generic listing/sitemap/detail page that was actually fetched.

Changed files for R3:

- `chatbot/scripts/policy-intelligence-discovery.ts`
- `chatbot/lib/policy-intelligence-discovery.test.ts`
- `chatbot/scripts/fixtures/policy-intelligence-discovery/home-affairs.html`
- `chatbot/content/policy-intelligence/README.md`
- `docs/agent-memory/CURRENT_HANDOFF.md`

Validation:

- `pnpm test:unit`: **184 passed, 0 failed, 0 skipped** outside the sandbox; all R1/R2 tests remain passing and the focused discovery file contains 15 passing tests.
- `pnpm build`: **passed**.
- Changed-file Biome: **passed**.
- `git diff --check`: **passed**.
- `pnpm lint`: repository-wide known baseline of **22 diagnostics**, with no new discovery-file diagnostics.

R3 live Home Affairs dry-run: exit 0, runtime **787 ms**, 5 candidates. All five exposed specific resolved canonical URLs and `urlProvenance: "alert"` rather than the Student 500 seed:

- `Subclass 186` -> `https://immi.homeaffairs.gov.au/Visa-subsite/Pages/work/186-employer-nomination-scheme.aspx`
- `Skills in Demand 482 processing priorities` -> `https://immi.homeaffairs.gov.au/Visa-subsite/Pages/work/skills-in-demand-482-landing.aspx`
- `Employer Sponsored Regional 494 processing priorities` -> `https://immi.homeaffairs.gov.au/Visa-subsite/Pages/work/494-skilled-employer-regional-landing.aspx`
- `Discussion Paper: Reforming Australia's Settlement Grants Programs September 2026` -> `https://immi.homeaffairs.gov.au/settlement-services-subsite/Pages/SETS/overview.aspx`
- `Form Banners - SharePoint Migration Project` -> `https://immi.homeaffairs.gov.au/form-listing/Pages/niv-eoi.aspx`

No alert URL was fetched: the Home Affairs strategy still performs exactly one configured seed fetch, while deterministic tests record that the fetch target list contains only the seed URL. No publication, LLM, database, or `legal-service/` behavior changed.

Known non-blocking observation: the live feed still includes operational/navigation alerts alongside policy-like alerts; R3 intentionally preserves them as raw non-public candidates and performs no legal-importance or publication inference. Any future relevance filtering requires a separately approved task.


## P11-004 activation — 2026-09-24

P11-004 is now the active Phase 11 task. The project owner requested coarser task granularity, so P11-004 is one Task Packet with two internal review stages rather than a family of A/B/C subtasks.

Current code observations that drive the task:

- `chatbot/app/(chat)/ai-workspace/page.tsx` currently wraps the workspace in a large English-only marketing hero.
- `chatbot/components/premium-answer-mode-workspace.tsx` owns server-backed Fast / Legal Check / Premium entitlement hydration but its visible copy is English-only and presented as a separate large card.
- `chatbot/components/immigration-ai-workspace.tsx` already contains real high-value behavior: persistent conversation list/create/reopen, URL `chatId` continuity, legal `matterId`, answer-mode route selection, political-history sanitization, guided intake, citations, compact sources, lawyer-request action, matter snapshot, known facts and source context.
- much of the workspace chrome is still English-only even though the site locale foundation is Chinese-first.
- `handleBookConsultation` is still a placeholder; real scheduling remains P11-007 and must not be invented here.
- the approved V4 workspace reference supports the direction of a dense operational shell with conversation navigation + central chat + context panel, but the main repository remains functional authority.

P11-004 Stage 1 should change presentation/localized copy around the existing controller, not rewrite the working legal/customer flow.

P11-004 Stage 2 remained inside the same Task Packet and proceeded after Stage 1 Git/source review and owner visual review.

P11-004 is now closed as VERIFIED at `f2d941734d256c9e0a0e42988cd67cdb828d0dc6`. P11-005 remains PLANNED and has not started.

## P11-004 Stage 1 implementation — 2026-09-24

**Original implementation scope:** Stage 1 only. This entry records the implementation state at that time; the post-review completion status is recorded below.

The `/ai-workspace` route now reaches the operational workspace shortly after the shared `SiteHeader`. The page-level promotional hero was removed. The answer mode control is a compact bilingual toolbar, and the existing workspace controller is presented as three regions: conversation/history, active consultation, and matter/source/human-service context. At narrower widths, the consultation remains first and the history/context regions flow below it; desktop uses three columns.

Static workspace copy is centralized in `chatbot/lib/workspace-copy.ts` as `Record<SiteLocale, WorkspaceCopy>` and read through the existing `SiteLocaleProvider`. Chinese is the default through the existing site locale. English switching changes workspace chrome, mode labels, history, quick questions, composer, facts, sources, and lawyer-request UI. Assistant answer markdown, research status, guided-intake prompts, and processing progress continue to follow response/question language; site locale does not feed answer requests or choose answer language. Quick questions remain generic, have no outcome guarantees, and still call `submitMessage(question)`.

The presentation changes retain the existing controller paths and payload semantics: conversation list/create/reopen endpoints; URL `chatId` and legal `matterId`; `widgetRouteForAssistantMode(assistantMode)`; server-backed mode access, disabled states and `ASSISTANT_MODE_STORAGE_KEY`; political submission evaluation, `sanitizePoliticalHistory()` and blocked-turn cleanup; current and merged intake facts; persisted assistant message IDs for `LawyerRequestAction`; citations, compact sources, research status, typewriter rendering, progress, errors, auto-scroll and debug output. Stable workspace input/message/send test IDs remain. No backend, schema, scheduling, legal-reasoning, provider, Phase-6, billing, or ReasoningBank work was performed.

The appointment placeholder is labeled as planned and does not claim availability or create a booking. The existing lawyer-review request action remains available with its entitlement check and request payload unchanged. AI confidence is now labeled as an AI signal and explicitly distinguished from lawyer advice/legal certainty.

Changed files:

- `chatbot/app/(chat)/ai-workspace/page.tsx`
- `chatbot/components/consultation-escalation-card.tsx`
- `chatbot/components/guided-intake-card.tsx`
- `chatbot/components/immigration-ai-workspace.tsx`
- `chatbot/components/lawyer-request-action.tsx`
- `chatbot/components/premium-answer-mode-workspace.tsx`
- `chatbot/lib/workspace-copy.ts`
- `chatbot/lib/workspace-copy.test.ts`
- `chatbot/package.json`
- `docs/agent-memory/CURRENT_HANDOFF.md`

The V4 reference was inspected at `jiangdizhao/immigration_temporal_ui@8abbba2d6b94e7fb31048447b9831aaac6a6b029`, including the workspace composition and design system. Its visual direction informed the compact, dense workspace and semantic AI/human distinction. No mock facts, credentials, prototype behavior, or Vite code were copied.

Validation:

- `pnpm test:unit`: **187 passed, 0 failed, 0 skipped** (includes 3 workspace-copy tests).
- `pnpm build`: **passed** on the final JSX.
- `pnpm lint`: **failed with the existing 22 repository diagnostics**; no changed-file diagnostics were reported by focused Biome.
- Changed-file `pnpm exec biome check`: **passed** for all changed frontend source, test, and package files.
- `git diff --check`: **passed**.
- Browser smoke: **attempted but blocked before the workspace mounted**. The first guest-auth redirect returned Auth.js `UntrustedHost` for `localhost:3000`; retrying with process-only trusted-host handling entered a redirect loop. No conversation API or answer-provider request was reached, and no screenshot was captured. The answer endpoint had been planned as a stub so no paid provider would be called. Owner screenshots are required before Stage 2.

Known Stage 1 limits / owner review:

- Desktop and mobile visual review has since been completed; the remaining Stage 2 polish scope is recorded below.
- Conversation creation/reopen, mode access states, locale switching and message submission were not exercised because guest authentication did not complete. They were preserved by source inspection and compilation.
- The Stage 1 browser smoke was blocked before the workspace mounted. The later Stage 2 local visual pass succeeded through guest access, and owner desktop/mobile visual acceptance is recorded below.

## P11-004 Stage 1 completion

**Status:** Stage 1 completed and reviewed.

- Commit: `1e879c0`
- Scope: AI workspace presentation rebase.

Completed:

- Rebased the AI workspace into a Chinese-first immigration service platform style.
- Preserved the existing conversation lifecycle, AI answer flow, matter IDs, lawyer-review workflow, citations, authentication, and backend contracts.
- Added bilingual workspace presentation.
- Removed the misleading confidence progress visualization.
- Clarified the AI confidence signal versus legal certainty.

Validation:

- Unit tests passed.
- Build passed.
- Desktop and mobile visual review completed.

The Stage 1 browser-smoke limitation was later superseded by the Stage 2 local visual pass and owner review recorded below.

## P11-004 Stage 2 accepted scope

**Goal:** Polish the mobile consultation experience without changing system behavior.

Completed:

1. Improve mobile lawyer-review visibility.
2. Compact the mobile answer-mode presentation.
3. Replace internal development wording with customer-facing consultation wording.

Constraints:

- No backend changes.
- No API changes.
- No database changes.
- No AI reasoning changes.
- No booking implementation.

## P11-004 Stage 2 implementation — 2026-09-24

**Status:** Stage 2 completed and accepted. P11-004 is **VERIFIED** at `f2d941734d256c9e0a0e42988cd67cdb828d0dc6`.

Presentation improvements:

- The existing `LawyerRequestAction` now has a clear Chinese/English professional-review prompt and a more prominent mobile action. Persisted assistant-message identity, VIP/auth checks, request ownership and submission API/payload remain unchanged.
- The existing answer-mode control is collapsed by default on mobile and expands to show the current explanation and options. Desktop continues to show the full control. Mode values, server access policy, disabled states, `ASSISTANT_MODE_STORAGE_KEY`, and route selection remain unchanged.
- Removed appointment-development wording from the active workspace. Consultation prompts now direct customers to the existing lawyer-review request and do not claim that booking or availability exists.

Changed files:

- `chatbot/components/consultation-escalation-card.tsx`
- `chatbot/components/immigration-ai-workspace.tsx`
- `chatbot/components/lawyer-request-action.tsx`
- `chatbot/components/premium-answer-mode-workspace.tsx`
- `chatbot/lib/workspace-copy.ts`
- `docs/agent-memory/CURRENT_HANDOFF.md`

Validation:

- `cd chatbot && pnpm test:unit`: **187 passed, 0 failed, 0 skipped**.
- `cd chatbot && pnpm build`: **passed**.
- `cd chatbot && pnpm lint`: **failed with the 22 known repository baseline diagnostics**; changed-file `pnpm exec biome check` passed for all five changed frontend source files with no new diagnostics.
- `git diff --check`: **passed**.

Browser and owner visual acceptance:

- Local `/ai-workspace` loaded through the existing guest flow. A preliminary unmocked page load automatically created one empty guest conversation through `POST /api/immigration-conversations` (`chatId` `a089c4fe-b296-448b-9945-f5e904a8b870`); no user message or AI answer was submitted. This local smoke artifact was left intact.
- The mocked visual pass covered Chinese and English at 1536px, 1280px, and 390px. No horizontal overflow was detected; the desktop three-region layout and mobile lawyer-review entry were visible. The mobile mode control was confirmed collapsed by default and expandable.
- Owner review passed for desktop, mobile collapsed and expanded mode selector states, and lawyer-review visibility.
- No AI answer endpoint or lawyer-request submission endpoint was called during the mocked visual pass. The mocked sample was not legal guidance.

Non-blocking deployment note:

- The local visual environment displayed the Debug panel because `NEXT_PUBLIC_WIDGET_DEBUG` was enabled. The active workspace guards it with `process.env.NEXT_PUBLIC_WIDGET_DEBUG === "true"`. Staging and production should leave this disabled unless intentionally debugging.

The former Client Portal P11-005 is superseded by the document-system rebaseline below.

## P11-005 roadmap rebaseline — 2026-09-24

After P11-004 closure, owner review identified a missing production prerequisite: the service cannot yet securely process customer PDFs, JPEGs and PNGs as matter evidence.

Repository inspection confirmed:

- `Message_v2` has a generic `attachments` JSON field, but this is not a matter-document lifecycle;
- `chatbot/components/multimodal-input.tsx` can upload through `/api/files/upload`;
- that generic upload route currently accepts only `image/jpeg` and `image/png`, limits files to 5 MiB, and writes Vercel Blob objects with `access: "public"`;
- the active Phase 11 AI Workspace does not use that upload path;
- PDF intake, private matter-scoped document authorization, extraction/vision processing, page provenance and lawyer document continuity do not yet exist.

Therefore Phase 11 is rebaselined:

- P11-005 — **Secure Matter Documents & AI File Intake** — Stage 1 implemented locally and awaiting source/security review;
- P11-006 — Matter-centered Client Portal — PLANNED;
- P11-007 — Lawyer Workspace Continuity — PLANNED;
- P11-008 — Appointment / Consultation Workflow — PLANNED;
- P11-009 — final bilingual/responsive/accessibility/E2E + staging acceptance — PLANNED.

P11-005 uses one Task Packet with three internal stages: secure document foundation; document understanding/provenance; matter/AI/lawyer integration.

The production target is private object storage with AWS S3 behind an abstraction, PostgreSQL metadata/lifecycle, explicit ownership checks, PDF/JPEG/PNG support, untrusted-content handling and document/page provenance. Customer-document evidence must remain distinct from official legal sources, AI analysis and lawyer advice.

No application code, database migration, AWS resource, or deployment is changed by this documentation rebaseline. Applying any DB migration remains separately authorized.

Next gate: review the uncommitted Stage 1 diff; do not start Stage 2 before that review.

## P11-005 Stage 1 — secure document foundation implementation

**Status:** Stage 1 implemented locally; awaiting source/security review. P11-005 is **not VERIFIED**. Stage 2 and Stage 3 have not started.

Scope is limited to private matter-document storage, authenticated customer ownership, first-class metadata/lifecycle, original-file download and soft deletion. The legacy `/api/files/upload` Vercel Blob path remains unchanged and is not used by this subsystem.

### Data model and migration

- Added the additive `MatterDocument` Drizzle model, linked to `User` and `ImmigrationConversation` / `Chat`.
- Metadata includes server-derived `legalMatterId`, display filename, internal storage key, allowlisted MIME type, byte size, SHA-256, processing status, security status, and lifecycle timestamps.
- New uploads are `processingStatus: not_started` and `securityStatus: pending`. This stage has no transition that marks files clean or feeds them to AI or lawyer review.
- Migration: `chatbot/lib/db/migrations/0018_steep_hobgoblin.sql`.
- **MIGRATION CREATED**
- **MIGRATION NOT APPLIED**

### Storage and access

- Added an application storage interface and a production AWS S3 adapter using the minimal `@aws-sdk/client-s3` dependency. Writes specify server-side AES256 encryption and do not set a public ACL. The adapter returns no object URL.
- Production storage requires `AWS_REGION`, `MATTER_DOCUMENTS_S3_BUCKET`, server IAM permissions, and an S3 bucket configured with Block Public Access. No bucket or AWS resource was provisioned or inspected in this task.
- Added deterministic `MemoryMatterDocumentStorage` for tests. Tests make no AWS calls.
- Downloads are proxied through the authenticated application route after checking both document ownership and the owner of its linked conversation. Responses use private/no-store caching, `nosniff`, and a sandbox content policy.
- Upload checks ownership of the requested conversation first. It accepts no `legalMatterId`; the metadata snapshot is resolved from the server-side owned conversation record.
- Anonymous access returns 401. Guest sessions and lawyer/admin roles are denied. Cross-owner and foreign-conversation lookups return 404.
- Metadata/list responses omit `storageKey` and all storage URLs.
- Delete is an idempotent soft delete: `deletedAt` hides the record from list/read/download flows. The S3 object remains private and is not physically deleted in Stage 1; no purge/retention automation exists.
- A storage write error or failed metadata insert triggers best-effort deletion of the generated private key. If compensation also fails, the private unreferenced object remains inaccessible through this application.

### API and upload boundary

- `POST /api/matter-documents?chatId=<owned-chat-uuid>` uploads a single raw file body; `Content-Type` and `X-Original-Filename` are required. `GET` on the collection lists by required owned `chatId`.
- `GET /api/matter-documents/[documentId]` returns owner-scoped metadata; `DELETE` soft-deletes it.
- `GET /api/matter-documents/[documentId]/download` performs an owner-authorized download.
- Accepted types only: `application/pdf`, `image/jpeg`, and `image/png`; filenames/extensions must match the detected type. Signature checks require `%PDF-`, JPEG `FF D8 FF`, or the PNG 8-byte signature. Browser MIME and extension alone are not trusted.
- Maximum upload size is centralized at 25 MiB. Request bodies are read incrementally and rejected once the limit is exceeded. Filename path components/control characters are removed; filenames never contribute to storage keys.
- The generic chat upload route and `multimodal-input` behavior were not changed.

### Validation

- `cd chatbot && pnpm test:unit`: **198 passed, 0 failed, 0 skipped**.
- `cd chatbot && pnpm build`: **passed**.
- Changed-file Biome over source, tests, API routes, schema, migration metadata, and package configuration: **passed; no diagnostics**.
- `cd chatbot && pnpm lint`: **failed with 21 repository-wide diagnostics in existing files** (the previously recorded baseline was 22); no diagnostics were reported in the changed files. Changed-file Biome is clean.
- `git diff --check`: **passed**.
- Browser/live API smoke was not attempted. The database migration remains intentionally unapplied, so a real route smoke would require a schema change that is outside this authorization. Handler/API behavior is covered with deterministic fake repository, auth and storage dependencies.
- No real AWS/S3 service was contacted. No migration was applied, no database data was changed, and no paid AI endpoint was called.

### Review gates and unresolved work

- Stage 2 is **NOT started**. Document text extraction/OCR, page bounds, provenance, and prompt-injection handling remain unimplemented and require their own review gate.
- Stage 3 is **NOT started**. No workspace integration, AI document selection, lawyer access, lawyer-request attachments, or booking work was added.
- Before production use, configure and verify the private S3 bucket/IAM policy, decide the controlled physical-purge/retention process for soft-deleted and orphaned objects, and apply the migration only through the authorized deployment procedure.
- P11-005 remains open pending Stage 1 source/security review; do not activate Stage 2 automatically.

### Stage 1 changed files

- `chatbot/app/api/matter-documents/route.ts`
- `chatbot/app/api/matter-documents/[documentId]/route.ts`
- `chatbot/app/api/matter-documents/[documentId]/download/route.ts`
- `chatbot/lib/db/migrations/0018_steep_hobgoblin.sql`
- `chatbot/lib/db/migrations/meta/0018_snapshot.json`
- `chatbot/lib/db/migrations/meta/_journal.json`
- `chatbot/lib/db/queries.ts`
- `chatbot/lib/db/schema.ts`
- `chatbot/lib/matter-documents/http.ts`
- `chatbot/lib/matter-documents/memory-storage.ts`
- `chatbot/lib/matter-documents/runtime.ts`
- `chatbot/lib/matter-documents/service.test.ts`
- `chatbot/lib/matter-documents/service.ts`
- `chatbot/lib/matter-documents/storage.ts`
- `chatbot/lib/matter-documents/types.ts`
- `chatbot/lib/matter-documents/validation.ts`
- `chatbot/package.json`
- `chatbot/pnpm-lock.yaml`
- `docs/agent-memory/CURRENT_HANDOFF.md`


## P11-005 Stage 1 GitHub review — correction required

Pushed implementation reviewed at:

`15c72449f74879c10167be27cc059dc415301967`

The private-storage and ownership architecture is retained:

- dedicated `MatterDocument` model and migration;
- customer-only authorization;
- server-derived matter identity;
- private S3 adapter with no public object URL;
- bounded 25 MiB request read;
- SHA-256 integrity;
- `securityStatus: pending` / `processingStatus: not_started`;
- owner-authorized download;
- Stage 2/3 not started.

Stage 1 is **not accepted yet**.

Blocking findings:

1. **Format requirement expanded by owner.** Production evidence intake must support mainstream formats, not only PDF/JPEG/PNG. The first broad allowlist is PDF, JPG/JPEG, PNG, DOCX, DOC, TXT, MD, JSON, CSV, XLSX and XLS, implemented through a centralized format registry with format-aware bounded validation.
2. **Normal conversation deletion can orphan object bytes.** `MatterDocument.chatId` currently cascades from `ImmigrationConversation`, while Stage 1 soft-delete intentionally retains S3 bytes. Existing Chat/ImmigrationConversation deletion can therefore delete the only metadata row and leave a private S3 object without a lifecycle record. The correction must close this gap for single-chat and bulk-user deletion paths.

Security notes for the format correction:

- DOCX/XLSX are ZIP containers, but arbitrary ZIP must remain rejected;
- legacy DOC/XLS require OLE/CFB-aware validation;
- text-like formats require bounded text/binary validation; JSON requires bounded structural validation;
- accepted Office files remain untrusted/pending and must not execute macros or active content;
- no extraction, OCR, AI reasoning or lawyer access begins in this correction.

Migration `0018_steep_hobgoblin.sql` remains **CREATED / NOT APPLIED**. If the lifecycle fix needs SQL changes, generate a follow-up migration rather than applying anything.

Next gate: implement this bounded Stage 1 correction, stop uncommitted/unpushed, and repeat the normal review workflow. Stage 2 remains NOT started.


## P11-005 Stage 1 correction — 2026-09-24

**Status:** Stage 1 correction implemented locally. P11-005 is **not VERIFIED** and still requires GitHub source/security review. No commit or push was made.

### Central format registry and validation

- Replaced scattered PDF/JPEG/PNG-only rules with `chatbot/lib/matter-documents/formats.ts`. The registry lists canonical format IDs/MIME types, accepted MIME aliases/extensions, validation strategy, category and later processor hint for PDF, JPG/JPEG, PNG, DOCX, DOC, TXT, MD, JSON, CSV, XLSX and XLS.
- Canonical MIME aliases are deliberate: PDF `application/x-pdf`; JPEG `image/pjpeg`; PNG `image/x-png`; DOCX/XLSX official OOXML type, `application/zip`, `application/x-zip-compressed` and `application/octet-stream`; DOC `application/msword`/`application/x-msword`; XLS official Excel MIME and legacy Excel aliases; Markdown, JSON and CSV allow their common text/plain aliases. Stored/downloaded MIME is always the registry canonical value.
- `application/octet-stream` is admitted only for DOCX/XLSX after OOXML container verification and DOC/XLS after OLE/CFB verification. It is rejected for text-like formats and other weakly identified content.
- PDF, JPEG and PNG require their signatures. DOCX/XLSX use lazy bounded ZIP inspection (up to 4,096 entries, 200 MiB total declared expanded size, and 256 KiB `[Content_Types].xml`), require matching Word/Excel main paths and content types, reject encrypted/path-traversal/duplicate/macro-bearing containers, and never extract document content. `.docm` and `.xlsm` remain unsupported.
- Legacy DOC/XLS require the CFB signature and bounded structure parsing that distinguishes the `WordDocument` stream from `Workbook`/`Book`. The `cfb` dependency supplies that identification without office rendering or content extraction. `yauzl` supplies lazy ZIP entry inspection without extracting files.
- TXT/MD/CSV require UTF-8 decoding, bounded bytes and NUL/control-byte screening; JSON additionally must parse structurally. Original uploaded bytes are retained unchanged. The text/JSON validation cap is 5 MiB; total file cap remains 25 MiB. All accepted records remain `securityStatus: pending` and `processingStatus: not_started`.
- No document extraction, OCR, AI use, macro execution, or lawyer access was added. Downloaded new formats retain canonical MIME, `private, no-store`, `nosniff`, and `Content-Disposition: attachment`.

### Conversation deletion lifecycle

- `deleteChatById()` and `deleteAllChatsByUserId()` now use one deterministic cleanup coordinator. It selects every document row for each conversation, including customer soft-deleted rows, deletes private objects first, and only then deletes the exact document IDs plus votes/messages/streams/chat inside one database transaction.
- Cleanup errors stop deletion before metadata mutation. The metadata remains available for retry. Previously deleted S3 objects are safe to delete again; customer retry and bulk retry both re-run cleanup. Bulk deletion continues with other conversations and returns the successful count plus pending cleanup count; its HTTP route reports 503 and retry guidance if any conversation remains pending.
- The `MatterDocument.chatId` foreign key is now `ON DELETE RESTRICT`, so an unlisted/concurrently-added document prevents the conversation cascade and rolls back the chat transaction. Conversation deletion also waits if an upload intent is still `uploading`. Migration `0018_steep_hobgoblin.sql` remains unchanged.
- Other application `Chat` / `ImmigrationConversation` deletion entry points were checked; the two routed query functions above are the only application paths. The Phase 9 billing acceptance script directly deletes its own synthetic `User` fixtures, not conversations.
- The service-test options now explicitly declare the already-used `failAfterStoragePut` flag.

### Durable upload lifecycle correction — 2026-09-24

- Upload now creates a durable `MatterDocument` intent before the S3 PUT. The generated storage key, hash, owner, conversation, MIME and size are persisted while `storageStatus=uploading`; if intent insertion fails, the object PUT is never attempted.
- Storage lifecycle is independent of `securityStatus` and `processingStatus`: `uploading`, `stored`, `cleanup_pending`, and `storage_failed`. New rows default to `uploading`. Existing Stage 1 rows are backfilled as `stored` because the old flow inserted metadata only after a successful PUT.
- Only `stored` rows are returned by customer list, metadata, download, and soft-delete repository queries. `uploading`, `cleanup_pending`, and `storage_failed` records remain hidden. Upload returns success only after the durable transition to `stored`.
- A PUT error/ambiguous response retains the intent and tries to move it to `cleanup_pending` before object deletion. Successful cleanup moves it to `storage_failed`; failed cleanup leaves `cleanup_pending` and its storage key durable. A failed final stored transition leaves the intent available for cleanup; service cleanup retries are idempotent. If the database is unavailable, the row remains hidden with its key for later operator recovery.
- Added `cleanupUpload(documentId)` as an internal service-level recovery operation. It retries cleanup for non-stored intents, transitions to `storage_failed` only after object deletion succeeds, and never deletes a `stored` object. Conversation deletion blocks while any row remains `uploading`, avoiding a race with an in-flight PUT.

### Migration and validation

- **MIGRATIONS CREATED/UPDATED:** `chatbot/lib/db/migrations/0019_light_loki.sql` retains the restrictive conversation foreign key; `chatbot/lib/db/migrations/0020_odd_lockheed.sql` adds `storageStatus`, backfills existing rows as `stored`, and changes the column default to `uploading`. The MIME column remains PostgreSQL `varchar`, with no DB-level MIME enum/check.
- **MIGRATION NOT APPLIED.** No database was changed.
- Added deterministic format tests for every accepted type, arbitrary/swapped OOXML, invalid/misidentified OLE, malformed JSON, binary text, MIME aliases, macros, unsupported archives and executable/signature mismatch. Added safe canonical-MIME download coverage.
- Added in-memory lifecycle tests for empty conversations, object-delete failure preserving metadata, retry, bulk partial failure and idempotent repeated deletion. No test contacts AWS/S3.
- `cd chatbot && pnpm test:unit`: **211 passed, 0 failed, 0 skipped**.
- `cd chatbot && pnpm build`: **passed**.
- Changed-file Biome: **passed; zero diagnostics**.
- `cd chatbot && pnpm lint`: **fails on the known repository-wide baseline of 21 diagnostics; changed files are clean under changed-file Biome**.
- `git diff --check`: **passed**.
- AWS/S3 was **not contacted**.

### Remaining gate and scope

- Production private-bucket/IAM configuration and the physical-purge/retention policy for customer soft-deleted documents remain before production readiness. Stale `uploading` intents after abrupt process termination require an operator/job to invoke the internal cleanup operation once the upload attempt is known to have ended; no scheduler/background worker was added.
- Stage 2 is **NOT started**. Stage 3 is **NOT started**. P11-005 remains in progress pending GitHub review; do not mark VERIFIED or activate later stages.

## P11-005 Stage 1 accepted after GitHub review — 2026-09-24

**Accepted checkpoint:** `df5335356ac7c7fc908236a270e78f280e5387e6`

The pushed hardening diff was reviewed directly on GitHub. No remaining Stage 1 blocking defect was found.

Accepted behavior:

- private matter-document storage remains behind the authenticated application boundary;
- initial format registry supports PDF, JPEG/PNG, DOCX/DOC, TXT/MD/JSON/CSV and XLSX/XLS;
- OOXML and legacy OLE files receive bounded container identification rather than extension-only trust;
- text/JSON inputs receive bounded UTF-8/structural validation;
- canonical MIME is stored/downloaded; arbitrary public storage URLs remain absent;
- upload creates a durable DB intent before object PUT and only `storageStatus=stored` becomes normally customer-visible;
- ambiguous/failed upload paths retain durable storage identity and fail closed;
- chat/history deletion removes private objects through the explicit coordinator and `MatterDocument.chatId` is restrictive rather than cascading;
- customer soft-delete remains separate from physical conversation cleanup;
- `securityStatus=pending` remains independent from storage durability and no document is promoted to clean/lawyer-reviewed by Stage 1.

Migration review:

- `0018_steep_hobgoblin.sql` — original MatterDocument foundation, unchanged;
- `0019_light_loki.sql` — document/conversation FK becomes `ON DELETE RESTRICT`;
- `0020_odd_lockheed.sql` — adds `storageStatus`, backfills existing Stage 1 rows as `stored`, then defaults new rows to `uploading`;
- snapshots and journal align with the sequence;
- **MIGRATIONS NOT APPLIED**.

Validation recorded from the implementation run:

- `pnpm test:unit`: 211 passed;
- `pnpm build`: passed;
- changed-file Biome: passed;
- `git diff --check`: passed;
- repository lint: known 21-diagnostic baseline;
- AWS/S3: not contacted.

GitHub attached no Actions run/status to the commit, so acceptance is based on direct source/diff review plus the recorded local validation.

Known non-blocking operational items:

- stale `uploading` / `cleanup_pending` intents need a future enumerating operator/background recovery path;
- production S3 bucket/IAM/Block Public Access configuration still needs deployment verification;
- customer soft-delete physical retention/purge policy is not yet implemented;
- conversation deletion performs external object cleanup before DB finalization, so a later DB failure can temporarily leave metadata referring to already-deleted bytes; retries converge safely, but a future deletion-state/outbox design may improve observability and recovery.

**Stage 1 is ACCEPTED. Stage 2 implementation is recorded below but is not yet accepted or verified. P11-005 is not VERIFIED. Stage 3 is NOT started.**


## P11-005 Stage 2 implementation checkpoint — 2026-09-24

Status:

- Stage 2 baseline: `8f63cb1b3d68a000589b029b24abc8c9dc00df62`; bounded recovery correction: `38e19c75bc131cc372c8c2682ec21e72834f8fb7`.
- Stage 2 is ACCEPTED after direct GitHub source review at `38e19c75bc131cc372c8c2682ec21e72834f8fb7`.
- Stage 1 remains accepted at `df5335356ac7c7fc908236a270e78f280e5387e6`. Stage 3 is NOT started.

Implemented Stage 2 scope:

- Added processing-run and normalized customer-document evidence persistence, with provenance units and explicit storage, processing, and security states. Original bytes remain in private object storage; extracted text is persisted as `sourceClass=customer_document` and is not injected into answer prompts, legal retrieval, citations, or lawyer sharing.
- Owner-authenticated processing and status/evidence routes enforce ownership and keep storage keys private. Completed runs are idempotent; failed runs require explicit retry; evidence and completion are committed together so partial results are not exposed as complete.
- Migration `0021_sudden_warbird.sql` is created and uncommitted. **MIGRATION NOT APPLIED.** No migration or schema-push command was run.
- Native extraction covers PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, Markdown, and JSON. PDF native text is handled page by page; only blank pages are rendered and sent to vision, preserving page provenance and mixed native/vision units.

OpenAI document vision:

- Production adapter: `lib/matter-documents/processing/openai-vision.ts`; it uses the repository's `@ai-sdk/openai` and `ai` dependencies directly, independently of Fast, Legal Check, Premium, assistant-mode access, and chat model routing.
- Configuration is server-only: `MATTER_DOCUMENT_VISION_ENABLED` must be exactly `true`, `MATTER_DOCUMENT_VISION_MODEL` must be explicitly set to a non-empty model ID, and `OPENAI_API_KEY` must be present. There is no default model. If any condition is absent, vision is disabled and images/scanned pages return `needs_review` with `vision_unavailable`; native extraction continues.
- The request uses fixed transcription-only system instructions, image bytes as a separate user data part, no tools, no URL following, no retries, a 20-second abort timeout, and a 6,000-token output cap. Normalized page text is bounded to 16,000 characters; excess is truncated and marked partial.
- When enabled, customer JPEG/PNG bytes and rasterized scanned-PDF page bytes are sent to the configured OpenAI API for transcription. This is the customer-data boundary; content is not fully local. Errors are reduced to safe machine codes and document/provider contents are not logged. No live OpenAI request was made during validation.
- Vision output is transcription only. The application owns document/page provenance; success does not assess authenticity, safety, evidence sufficiency, or legal meaning. `securityStatus` remains `pending`.

PDF page rendering:

- `processing/pdf-renderer.ts` uses `pdfjs-dist` with `@napi-rs/canvas`; it renders only each specific blank/native-text-less page, with PDF page count capped at 100. XFA/eval are disabled and annotations are not rendered.
- Output is JPEG, bounded to 2,400 pixels per dimension, 25 million pixels, 10 MiB per page, and 20 MiB aggregate raster data. Native pages remain native; scanned pages use vision individually, with `mixed` overall method when both types occur.
- No daemon or external rendering service is required. Local production tracing was verified for Linux x64 GNU, including the worker bundle, PDF.js standard fonts, PDF.js module, and `@napi-rs/canvas` native binding. Deployment must package the native binding matching its actual OS/libc/CPU architecture; the AWS deployment architecture was not inferred or tested.

Parser isolation and production packaging:

- CPU-bound parsing runs in a Node `worker_threads` worker for PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, Markdown, and JSON. It is a hard-cancellable CPU/memory isolation boundary within the Node process: the parent can terminate work, and V8 heap/stack resource limits are applied. It is NOT a full OS or malware sandbox.
- Worker construction explicitly sets `env: {}` and `execArgv: []`; no parent application environment or credential variables are inherited. Only the bundled parser code and bounded format/bytes/limits are sent through the worker contract. OpenAI vision stays in the parent/provider layer and is not loaded by the native parser worker.
- A test-only worker fixture verifies a parent-only secret probe and `OPENAI_API_KEY` are absent in the worker; a normal parser worker succeeds without OpenAI credentials. The probe fixture is under `processing/worker-fixtures` and is not part of production parsing.
- Each claimed processing attempt gets one parent-controlled 30-second wall-clock deadline. Its deadline timestamp and abort signal cover parser execution, scanned-page rendering in the parser worker, all sequential image/page vision calls, and normalized-unit assembly. The worker gets `min(parserWorkerTimeoutMs, remaining deadline)` and listens for the same signal; abort terminates the worker. The OpenAI adapter combines the global signal with its per-call timeout via `AbortSignal.any`, so either timeout aborts the request. A global expiry propagates as `processing_timeout`, fails the run, and prevents finalization; no `Promise.race` leaves parser/network work running.
- Worker resource limits are 192 MiB old generation, 32 MiB young generation, and 4 MiB stack. Crash, malformed output, and invalid worker messages fail closed as `parser_worker_failed`; no partial evidence is finalized.
- Incomplete runs (`partial` or `needs_review`) stay idempotent on normal POST. POST `{ "reprocessIncomplete": true }` explicitly starts a new run only when the latest terminal run is incomplete. A fully successful run remains idempotent. Previous run rows and units are retained; GET without `runId` selects the latest terminal run, so previous evidence remains visible during a retry and after a failed retry.
- Stale processing can be recovered only with POST `{ "recoverStaleProcessing": true }`. The centralized stale threshold is 90 seconds, three times the 30-second maximum processing runtime. A transaction locks and verifies the owned/stored document and latest processing run, marks the stale run failed as `stale_processing_recovered`, then creates a new run. Fresh runs remain conflicts; concurrent recovery claims serialize so only one wins. There is no scheduler or background service.
- Failure persistence remains best-effort: if `repository.fail()` itself fails, the durable document/run may remain `processing`. The durable `run.startedAt` lease allows a later explicit stale recovery to reclaim it after 90 seconds; this recovery path is covered by tests.
- Successful parsing does not change `securityStatus` from `pending` or establish that a file is safe. Worker threads are NOT a full OS/malware sandbox. Malware scanning, quarantine, and related file-security controls remain a separate production-readiness requirement.
- `scripts/build-document-parser-worker.mjs` creates the bundled worker and copies PDF.js standard fonts. `next.config.ts` externalizes PDF.js/canvas and includes generated worker assets in the processing route's output trace. The tracked duplicate `processing/.worker/parser-worker.mjs` was removed; `.worker/` and `worker-runtime/` are ignored, and only source/build inputs are tracked.

Validation on 2026-09-24:

- `pnpm test:unit`: 243 passed, 0 failed, 0 skipped. Processing tests include multi-page scanned-PDF and image global deadlines, explicit incomplete reprocessing, previous-evidence visibility/preservation, fresh/stale/concurrent recovery, failure-persistence recovery, and the retained worker secret-isolation test.
- `pnpm build`: passed. Production trace contains the worker entry, 16 standard-font/license assets, PDF.js legacy module, and Linux x64 GNU canvas binding. A bounded production-bundle smoke resolved the worker and parsed local text input.
- Changed-file Biome: passed across 27 changed source/config files with no diagnostics.
- `pnpm lint`: 21 errors, identical to the exact pushed-HEAD baseline; the generated parser-bundle size warning is gone. No lint fixes were applied outside changed files.
- `git diff --check`: passed.
- Lint baseline was measured from an archived copy of pushed HEAD `8f63cb1`; the existing 21 diagnostics and one pre-existing generated-bundle size warning were confirmed there. The correction removes that bundle warning and introduces no remaining changed-file diagnostics.
- Tests use local synthetic fixtures and fake vision/storage dependencies. **AWS/S3 NOT CONTACTED. OPENAI NOT CONTACTED during validation.** Package-registry downloads were used for local dependencies.

Remaining review/deployment items:

- Production deployment must confirm its platform-compatible `@napi-rs/canvas` binding and runtime packaging before enabling scanned-PDF vision.
- Existing Stage 1 operational items remain: verify private S3 bucket/IAM/public-access settings; define retention/purge and stale storage-intent recovery operations.
- Stage 2 passed direct GitHub source review and is ACCEPTED at `38e19c75bc131cc372c8c2682ec21e72834f8fb7`. P11-005 is not yet VERIFIED because Stage 3 and production-readiness gates remain. **Stage 3 is NOT started.**


## P11-005 Stage 2 accepted after GitHub review — 2026-09-24

**Accepted checkpoint:** `38e19c75bc131cc372c8c2682ec21e72834f8fb7`

The pushed Stage 2 baseline and bounded recovery correction were reviewed directly on GitHub. No remaining Stage 2 blocking defect was found.

The review confirmed:

- one processing attempt has a single parent-controlled deadline spanning parser work, scanned-page rendering, sequential vision transcription and normalization;
- the native parser worker listens to that signal and is terminated on timeout;
- the OpenAI document-vision adapter combines the global abort signal with its per-call timeout and exposes no tools;
- incomplete terminal runs require explicit `reprocessIncomplete`; fully complete runs remain idempotent;
- stale processing requires explicit recovery, uses a 90-second lease threshold, and is serialized by a transactionally locked document row so only one recovery wins;
- old terminal evidence remains readable while a retry is processing and after a failed retry;
- failure-state persistence can remain recoverable via the durable stale-run lease if the failure mutation itself is unavailable;
- owner-scoped GET/POST APIs retain safe access semantics;
- the duplicate tracked generated parser bundle is removed and the generated runtime worker remains outside source control.

No migration/schema change was introduced by the correction. `0021_sudden_warbird.sql` remains **NOT APPLIED**.

Recorded local validation for the accepted correction: 243 unit tests passed, build passed, changed-file Biome passed, `git diff --check` passed, and lint remained at the known 21-error repository baseline. GitHub has no attached Actions/status check for this commit.

Production/deployment gates remain separate: real ECS/Fargate canvas-binding packaging, authorized migration application and DB-backed smoke, private S3/IAM/public-access verification, retention/purge and stale-storage-intent operations, and malware/quarantine controls.

**Stage 2 is ACCEPTED. Stage 3 is NOT started. P11-005 is not VERIFIED.**

## P11-005 Stage 3 implementation — local, unaccepted — 2026-09-24

Status: implemented locally for owner review. **Stage 3 is NOT ACCEPTED. P11-005 is NOT VERIFIED.** No commit or push was made.

### Scope and data flow

- Added the active workspace Matter Documents panel with bilingual Chinese-first/English copy, private upload, processing/readiness status, selection, retry/reprocess, download, and delete controls. It uses the existing private MatterDocument API; it does not use /api/files/upload. The processing summary endpoint returns only safe document/run metadata and a unit count, not extracted text.
- All three workspace chat routes accept top-level selectedDocumentIds. The UUID list defaults empty, rejects duplicates, and is capped at four. The client cannot send document text or manifest content.
- The server loads each selected document by authenticated owner, verifies it belongs to the active chat, is stored and not deleted, then resolves its latest terminal processing run. Only complete, partial, or needs-review runs with usable evidence units can be selected. Foreign, cross-chat, deleted, and unavailable documents fail closed.
- Server-built evidence is capped at 4 documents, 8 units per document, 24 units total, 4,000 characters per unit, 8,000 per document, and 24,000 characters total. Units are ordered by provenance ordinal; every omission or clipping marks the document as truncated/incomplete.
- The assistant message stores a server-generated manifest containing document/run identity, filename/MIME, run and extraction status, truncation state, and the exact included unit ordinals and locators. It contains no document text, storage key, or private object URL. Conversation reload projects that persisted manifest into customer-document source UI; it does not recompute from a later run.
- Bounded extracted text is sent to the legal service only as the separate typed customer_document_evidence field. No raw file bytes reach answer models. The user question remains unchanged, and document text is not placed in intake facts, official retrieval chunks, citations, or legal evidence registries.
- The shared deterministic formatter marks the packet as customer-provided, untrusted, not official law or verified fact, potentially partial, and not an instruction or tool authorization. Fast and Premium preserve their existing model, timeout, research, and tool policy. Default final reasoning receives the document section while document-selected turns bypass shortcuts that cannot consume it. The optional ANSWER_ENGINE=v2 Default draft path also receives the same isolated context. Document contents do not authorize web search.
- Review-trace persistence removes packet text and keeps only bounded count/size/truncation metadata. Official citations remain in their existing separate channel. UI source blocks distinguish customer documents from legal sources and display partial/truncated warnings.
- Lawyer escalation derives document references only from persisted assistant metadata. The server revalidates the same owner and chat, exact run, and exact included unit ordinals before building the existing request snapshot. It supports the existing same-owner internal reconstruction for soft-deleted referenced files; it does not expose them in the normal document list. Exact reconstruction failure returns 409 instead of inventing evidence. Bounded excerpts (up to 500 characters per unit and 12,000 characters total) are stored under customer_document, separate from citations and compact sources, and displayed through the existing authorized lawyer request view. The lawyer-request client schema still cannot add document IDs.
- No database schema change was made, no migration was created, and no migration was applied. Migrations 0018–0021 remain NOT APPLIED.

### Validation on 2026-09-24

- Chatbot pnpm test:unit: 251 passed, 0 failed, 0 skipped.
- Chatbot pnpm build: passed, including the bundled document-parser worker.
- Legal-service focused customer-document/Fast/Premium tests: 38 passed.
- Legal-service full suite using /home/rico/anaconda3/envs/torch/bin/python -m pytest -q: 1,219 passed, with 2 existing Pydantic deprecation warnings.
- Changed-file Biome: passed across 18 chatbot TypeScript/TSX/JSON files.
- Chatbot pnpm lint: 21 errors, equal to the documented 21-error repository baseline. A direct HEAD-archive comparison found the same diagnostic rules and files; the existing useOptionalChain finding in lib/lawyer-requests/snapshot.ts is now reported at line 137 instead of line 130 because fields were added above it. No new rule/file diagnostics were introduced. Changed-file Biome is clean.
- git diff --check: passed.
- Validation used synthetic documents and fake provider/storage adapters. OPENAI NOT CONTACTED. AWS/S3 NOT CONTACTED.

### Remaining production and acceptance gates

- Stage 3 source/security review and owner review remain outstanding. Do not mark Stage 3 accepted or P11-005 verified until the required owner commit/push and independent GitHub source review occur.
- Existing deployment gates remain open: ECS/Fargate native canvas binding verification; controlled application of migrations 0018–0021 and DB-backed smoke; private S3 bucket/IAM/Block Public Access verification; retention/purge operations; stale storage-intent operations; malware/quarantine/scanning.
- P11-006 is NOT STARTED. No appointment/calendar or booking implementation was added.

NO NEW MIGRATION CREATED. MIGRATIONS NOT APPLIED. OPENAI NOT CONTACTED. AWS/S3 NOT CONTACTED. P11-006 NOT STARTED. P11-005 NOT VERIFIED. NO COMMIT. NO PUSH.

## P11-005 Stage 3 bounded post-push provenance correction

Status:

- Stage 3 provenance/security correction implemented on top of pushed HEAD `3d601080a4cd5c237594dd3756da036075922740`.
- Stage 3 remains subject to direct GitHub source/security review; it is not accepted.
- P11-005 is not verified. P11-006 has not started.

Implemented:

- The server-generated per-unit customer-document manifest records the exact clipped text length (`includedTextChars`) and SHA-256 (`textSha256`) for each AI-supplied unit, alongside ordinal, locator, and extraction method. It stores no document text, storage key, or URL; the digest metadata is not sent in the legal-service evidence packet.
- Lawyer snapshots reload the exact owner/chat/document/run/unit, reconstruct only `extractedText.slice(0, includedTextChars)`, and validate identity, ordinal, locator, extraction method, clip length, and SHA-256 before quoting. Invalid, changed, mismatched, or legacy manifests without exact clip metadata fail closed with HTTP 409. The excerpt budget does not skip validation of later units.
- Added `QueryResponse.customer_document_evidence_used` (default false). Fast, Premium, Default, and V2 set it only when a completed answer path consumed the bounded document context; provider/model and deterministic fallbacks report false.
- All three widget routes persist and return `customerDocumentManifest` / `customerDocumentSources` only after an explicit legal-service `used=true` acknowledgement. Unused answers omit the manifest from assistant metadata. Conversation reload gates customer-document sources on the persisted acknowledgement.
- Selected files clear after a successful answer only when there were no selected files or the service acknowledged usage. Otherwise the selection is retained and a bilingual warning says the files were not incorporated and can be retried.
- V2 general answers receive the selected document context; selected-file greetings ask what the user wants reviewed and report unused. Document-selected V2 turns do not write contract-derived `known_facts` to durable `v2_known_facts`; explicit intake facts retain existing persistence behavior.
- Document-selected V2 review traces retain only bounded document counts/length/truncation/usage metadata. The request evidence packet is removed, and raw contract/model output, contract facts, and document-derived legal trace are excluded. Experience Archive receives a QueryRequest with empty customer-document evidence.
- Official citations and retrieval evidence remain separate from customer-document evidence. No schema migration was needed.

Validation:

- `chatbot/pnpm test:unit`: 258 passed, 0 failed, 0 skipped.
- `chatbot/pnpm build`: passed, including production parser-worker bundling and Next.js TypeScript/build stages.
- Changed-file Biome: passed for all 14 changed chatbot TypeScript/TSX files.
- `chatbot/pnpm lint`: reports 21 repository diagnostics; none point to the changed chatbot files. Changed-file Biome passes.
- `legal-service` full pytest: 1230 passed; 2 existing Pydantic deprecation warnings.
- Focused legal-service provenance suites: 56 passed.
- `git diff --check`: passed.
- No OpenAI or AWS/S3 services were contacted. No migration was created or applied.

Review boundary:

- Stage 3 remains pending GitHub source/security review and is not marked accepted or verified.
- No commit or push was made. P11-006 has not started.

### P11-005 Stage 3 GitHub-review follow-up (2026-09-25)

- Unified ordinary-message and guided-intake post-answer document selection handling. Both clear only when no file was selected or usage was acknowledged; otherwise they retain the submitted IDs and show the existing bilingual retry warning. Political-gate blocks preserve selection without warning. Conversation-switch clearing remains unchanged.
- Default, Fast, and Premium widget routes now retain customer-document provenance only when the legal service acknowledged use and the backend answer was preserved. Default public-safety replacement and empty-answer fallbacks, plus Fast/Premium empty-answer fallbacks, omit the manifest and return `customerDocumentEvidenceUsed: false`.
- Validation: `pnpm test:unit` 264 passed; `pnpm build` passed; changed-file Biome passed (8 files); `pnpm lint` reports 21 repository diagnostics with none in changed files; `git diff --check` passed.
- No migration or external-service call. Stage 3 remains pending review; P11-005 is not verified and P11-006 has not started.


## P11-005 Stage 3 accepted after GitHub review — 2026-09-25

**Accepted checkpoint:** `b29816c56255762998d8fa55b56df64436a0b3c3`

The final Stage 3 correction was reviewed directly on GitHub and no remaining Stage 3 blocking defect was found.

Confirmed final invariants:

- customer document evidence is server-authorized, bounded and structurally separate from official law/citations;
- raw file bytes, storage keys and private object URLs never enter answer models or public provenance;
- exact per-unit `includedTextChars` + SHA-256 allow lawyer handoff to reconstruct only the text actually supplied to AI and fail closed on mismatch/legacy manifests;
- `customer_document_evidence_used` is authoritative only for answer paths that actually consumed the bounded document context;
- chatbot persists/renders document provenance only when the backend acknowledged use and the final public answer preserved that backend answer;
- route-level forbidden/empty-answer replacement strips document provenance;
- ordinary and guided-intake paths share the same selection-clearing rule; unused files stay selected for retry, while political-gate blocks preserve selection without false warnings;
- conversation reload exposes only persisted acknowledged provenance;
- document-selected V2 turns do not persist contract-derived document claims as durable `v2_known_facts`;
- review traces and Experience Archive exclude the raw customer-document packet;
- lawyer requests still derive document references only from persisted server-generated assistant metadata.

Recorded validation for the final correction: chatbot unit suite 264 passed, build passed, changed-file Biome passed, repository lint remained at its known 21-diagnostic baseline with none in changed files, and `git diff --check` passed. No legal-service files were changed by the final correction. GitHub has no attached Actions/status run for this checkpoint.

**Stage 3 is ACCEPTED. All three P11-005 implementation stages are ACCEPTED.**

P11-005 remains **IN PROGRESS / NOT VERIFIED** because explicit production-readiness gates remain open: deployment-compatible canvas binding verification, authorized migration application/DB smoke, private S3/IAM/public-access verification, retention/purge and stale-storage-intent operations, and malware/quarantine/scanning strategy.

Migrations `0018`–`0021` remain **NOT APPLIED**. P11-006 is NOT STARTED.


## Owner decision — defer P11-005 production-readiness gates to P11-009 — 2026-09-25

The owner approved proceeding to P11-006 while explicitly deferring the remaining P11-005 production-readiness gates to P11-009 AWS/staging acceptance.

**Do not forget or silently close these gates.** P11-005 remains NOT VERIFIED until P11-009 closes or separately accepts:

1. deployment-compatible `@napi-rs/canvas` native binding/package trace;
2. authorized application of migrations `0018`–`0021` plus DB-backed smoke;
3. private S3 bucket/IAM/Block Public Access verification;
4. retention/purge and stale storage-intent operational recovery;
5. malware/quarantine/scanning strategy.

This deferral does not authorize applying migrations, deploying, enabling live document vision, or representing the document subsystem as production-ready.

## P11-006 activation — Matter-centered Client Portal

**Status:** ACTIVE / READY TO IMPLEMENT  
**Task packet:** `docs/agent-memory/tasks/P11-006.md`

Frozen implementation direction:

- add a registered-customer `/client-portal` operational hub;
- use the existing DB and legal-service Matter data as authority; no presentation-driven schema redesign;
- group customer activity by exact `legalMatterId` when present, otherwise by the owned conversation as a provisional portal group;
- aggregate owned conversations, document metadata/status, lawyer-review requests and VIP entitlement;
- fetch legal-service Matter context server-side only for matter IDs already proven to belong to the authenticated customer through owned conversations;
- project only bounded customer-safe fields; never expose raw `metadata_json`, document evidence text, storage keys, provider IDs or internal traces;
- present confirmed/user-origin facts separately from items still missing/uncertain/conflicting;
- do not infer deadlines, legal status, lawyer assignment, case progress or success;
- existing AI Workspace, lawyer-request detail and VIP/billing flows remain the action authorities; the portal is a continuity/aggregation layer, not a replacement engine;
- no new DB migration is expected;
- P11-007 lawyer-workspace continuity, P11-008 booking and P11-009 AWS/staging acceptance remain separate.

The coding model must stop uncommitted/unpushed for owner/ChatGPT review.


## P11-006 implementation checkpoint — local, unaccepted — 2026-09-25

**Status:** implementation is present in the worktree for owner/source review. P11-006 is **NOT ACCEPTED** and **NOT VERIFIED**. No commit or push was made. The original implementation base remains `2a873b13cfd548c9dceae5aaee23c57ecc70c69f`.

Implemented the customer-only `/client-portal` aggregation layer. The page uses `SiteHeader`, the persisted site locale (Chinese default with English toggle), a responsive matter selector/overview, recent activity and membership summaries. The `/api/client-portal` route authenticates independently and returns one bounded safe projection; the browser does not supply Matter IDs. Header navigation adds Client Portal as the customer continuity hub while retaining AI Workspace, lawyer-request and VIP links without changing staff navigation.

Authorization and ownership:

- Unauthenticated and guest page visits redirect to `/login`; lawyer and admin page visits redirect to their existing portals. The API separately rejects any identity whose current entitlement role is not `user`.
- The service begins with the authenticated owner's conversation query. At most 80 owner-linked conversations are considered. Legal-service Matter IDs are derived only from those rows; client query parameters cannot select Matter fetches.
- Exact non-null `legalMatterId` values group conversations. A null ID remains a per-chat provisional group. Titles and semantic similarity never merge groups. Up to 50 groups are returned, newest activity first; a linked group's continuation chat is its most recently updated owned conversation.

Projection and aggregation:

- Matter data is fetched server-side from the existing Legal Service `/api/v1/matters/{matterId}` endpoint with `LEGAL_SERVICE_URL` and `LEGAL_SERVICE_API_KEY`. Each request uses `cache: "no-store"`, an 1800 ms abort timeout and no retries; at most four run concurrently. Non-2xx, malformed JSON, timeout or other fetch failure makes only that Matter snapshot unavailable. The chatbot-side API key is optional when the Legal Service is configured without key authentication; the header is sent only when the key is configured.
- The browser receives only Matter ID/status, bounded issue summary/type/visa context, up to 12 compact confirmed facts, up to 12 structured To-confirm slots, validated structured interaction progress and an allowlisted next action. Raw `metadata_json`, history, research state, risk classifications, prompts, provider telemetry and hidden reasoning are excluded.
- Confirmed facts require compact-state status `confirmed`; complex values and non-scalar data are omitted. To-confirm items come only from `missing`, `user_unsure`, `document_unavailable` or `conflicting` structured slots. Values from non-user/system/model extraction sources are not presented as confirmed.
- Documents are batch queried for owned chat IDs and only when `storageStatus=stored` and `deletedAt IS NULL`. The projection contains safe display metadata/statuses only; no storage key, hash, extracted text, evidence, provenance body or download URL. Security state and processing state are presented separately; pending security is described as not yet verified.
- Lawyer requests are bounded to the existing 100-row owner query, aligned to owned chat/matter groups, ordered by explicit needs-more-information/unread/active/completed/closed state, and omit message/evidence contents. VIP projection reports safe entitlement/period/cancellation state and excludes provider identifiers.
- Recent activity contains conversation, document and lawyer-request events only, sorted newest first and capped at 20. Actions continue in the existing AI Workspace, lawyer-request detail and VIP flows; no duplicate workflow was added.
- The new owner-scoped document query selects only display fields and does not change schema or document security behavior. No legal-service source changed.

Validation on the current worktree:

- `pnpm test:unit`: **277 passed, 0 failed, 0 skipped**.
- `pnpm build`: **passed**; `/client-portal` and `/api/client-portal` are present in the production build.
- Changed-file Biome: **passed** across all 15 changed application/test files.
- `git diff --check`: **passed**.
- `pnpm lint`: retains the **21-diagnostic repository baseline**; no diagnostics reference P11-006 changed files.
- Matter-fetch behavior is covered with an injected fake fetch; no live Legal Service was required.

No owner visual acceptance or independent source review is recorded yet. Keep P11-006 unaccepted/unverified until review. D-040 remains in force: P11-005 remains **NOT VERIFIED** and its deployment-compatible canvas binding, authorized migrations `0018`–`0021` plus DB smoke, private S3/IAM/Block Public Access, retention/purge and stale-intent recovery, and malware/quarantine/scanning gates remain deferred to P11-009. No P11-005 gate was attempted or closed. P11-007, P11-008 and P11-009 were not started. No migration was created or applied; OpenAI and AWS/S3 were not contacted.


## P11-006 post-push correction — 2026-09-25

Direct GitHub source review at pushed HEAD `f1e001ab3df6d7f6a637e207cfce93ff1b563d00` identified two bounded corrections. The worktree began clean on the expected branch and HEAD. These corrections do not change P11-006 acceptance status: it remains **NOT ACCEPTED / NOT VERIFIED** pending review.

- `LEGAL_SERVICE_API_KEY` is optional. The server-side Matter fetch sends `X-API-Key` only when configured and still performs the bounded `cache: "no-store"` request when it is absent. Non-2xx (including 401/403/404), invalid JSON, timeout and network failures return an unavailable snapshot for that matter only. No credential-presence signal is projected to the browser.
- The portal refetches `/api/client-portal` when the existing site locale changes. The site-locale provider writes its cookie synchronously before the effect runs; the API continues to read the existing cookie-based locale. Fetches remain no-store and cancellation prevents stale locale responses from overwriting the latest projection. A pure selection helper preserves the current group when it still exists and otherwise selects the first group (or none).
- Lawyer request statuses `needs_more_information`, `pending`, `in_review`, `confirmed`, `corrected`, and `closed` now have explicit Chinese and English labels. Unknown values use `Unavailable` / `暂不可用`, not raw enum text.

Correction validation:

- Focused Client Portal tests: **14 passed, 0 failed**.
- `pnpm test:unit`: **278 passed, 0 failed, 0 skipped**.
- `pnpm build`: **passed**, including `/client-portal` and `/api/client-portal`.
- Changed-file Biome: **passed** for all five corrected source/test files.
- `pnpm lint`: the known **21-diagnostic repository baseline** remains; no P11-006 correction files are reported.
- `git diff --check`: **passed**.
- Tests use injected fetch functions; no live Legal Service was contacted.

No migration or backend source changed. D-040 and every P11-005 production-readiness gate remain deferred to P11-009. P11-005 remains NOT VERIFIED; P11-007 remains NOT STARTED. OpenAI and AWS/S3 were not contacted. No commit or push was made.


## P11-006 rollout compatibility correction — 2026-09-25

A local runtime visual smoke at pushed HEAD `e9a91ef0bc280e85bd4b6fdb50b4d314aecf352c` observed `GET /api/client-portal -> 500` with PostgreSQL undefined-table `42P01` because the intentionally deferred P11-005 `MatterDocument` schema was absent. This was a rollout compatibility defect; no migration was applied to work around it.

The portal now catches schema-unavailable errors only around its document-summary query. The bounded cause-chain check recognizes SQLSTATE `42P01`, and `42703` only when the missing column is specifically identified as `storageStatus`. Other SQLSTATEs and unrelated undefined columns are rethrown. The public projection exposes `documentsAvailable`; `summary.documentCount` is numeric when available and `null` when unavailable. It does not include SQLSTATEs, DB messages, table names or migration details. The UI keeps the document section visible and shows bilingual customer-facing unavailable copy; it does not render an authoritative zero count.

Conversation ownership/grouping, lawyer-request and VIP aggregation, and Legal Service Matter failure isolation remain independent. Tests cover simultaneous Legal Service failure and missing document schema while retaining conversation, lawyer-request and membership data in the partial projection.

Validation for this correction:

- Focused Client Portal tests: **17 passed, 0 failed**.
- `pnpm test:unit`: **281 passed, 0 failed, 0 skipped**.
- `pnpm build`: **passed**; Client Portal page and API route remain in the build.
- Changed-file Biome: **passed** for all six changed application/test files.
- `pnpm lint`: known **21-diagnostic repository baseline**, with no diagnostics in changed P11-006 files.
- `git diff --check`: **passed**.
- No live Legal Service or external provider was contacted.

D-040 is unchanged. P11-005 remains NOT VERIFIED; migrations `0018`–`0021`, DB smoke, ECS/Fargate canvas verification, S3/IAM/public-access checks, retention/purge/stale-intent operations, and malware/quarantine/scanning remain deferred to P11-009. P11-006 remains NOT ACCEPTED / NOT VERIFIED. No new migration or backend/legal-service change was made, and no commit or push was made.


## P11-006 verified — 2026-09-25

**Verified checkpoint:** `b3b5fe285779cd351c831d9793f3c62dc1ef4c0c`

Direct GitHub review of the final runtime compatibility correction found no remaining P11-006 blocker.

Confirmed final behavior:

- `/client-portal` is customer-only; guest/unauthenticated users leave the portal path, and lawyer/admin roles retain their own portals;
- legal matter grouping remains exact-ID-only; title/visa/semantic similarity never merges matters;
- Legal Service Matter fetch is server-only, ownership-derived, bounded, no-store, optional-API-key compatible and per-matter fail-soft;
- document summaries are owner/chat-scoped and safe-projected;
- when the intentionally deferred P11-005 schema is absent, only the document-query boundary degrades, `documentsAvailable=false`, and document count is non-authoritative/null rather than zero;
- SQLSTATE `42P01` is handled at that narrow document-query boundary; `42703` is accepted only for the expected `storageStatus` partial-schema case; unrelated DB failures still propagate;
- Legal Service offline and document schema unavailable can coexist while conversations, lawyer-review summaries and VIP state remain usable;
- bilingual status/copy and locale-refetch behavior are consistent;
- no migration, legal-service source change or external-service call was introduced by the final correction.

Owner visual acceptance passed on desktop and mobile in both Chinese and English. The accepted layout preserves matter list, selected matter, recent activity, membership, conversations, lawyer review and explicit unavailable states without blocking responsive defects.

Recorded final correction validation: 281 unit tests passed, build passed, changed-file Biome passed, `git diff --check` passed, and repository lint remained at the known 21-diagnostic baseline with no diagnostics in changed P11-006 files.

**P11-006 is VERIFIED. P11-007 remains NOT STARTED.**

D-040 remains authoritative: P11-005 is still NOT VERIFIED and its production-readiness gates remain deferred to P11-009.


## P11-007 activation — Lawyer Workspace Continuity — 2026-09-25

**Status:** ACTIVE / READY TO IMPLEMENT  
**Task packet:** `docs/agent-memory/tasks/P11-007.md`  
**Planning base:** `596ea345ee9df673f183aa1f8230034201fe36d4`

Current production authority already includes:

- lawyer-only `/lawyer-portal` and `/lawyer-portal/[id]`;
- assigned-request queue via `/api/lawyer-portal/requests`;
- assigned-request authorization on detail/update;
- administrator-only assignment in the existing admin/VIP request workflow;
- request statuses `pending`, `in_review`, `needs_more_information`, `confirmed`, `corrected`, `closed`;
- immutable question/answer/context/evidence snapshots;
- clarification messages;
- exact bounded P11-005 customer-document excerpts inside `evidenceSnapshot`;
- existing notification and learning-bridge behavior.

P11-007 must improve continuity and presentation without widening authority.

Frozen implementation direction:

- Chinese-first bilingual assigned-lawyer queue and detail workspace;
- typed server-owned queue/detail projections rather than spreading raw DB rows;
- preserve exact assigned-only lawyer RBAC and admin assignment authority;
- organize the detail around customer question, AI answer, handoff context, evidence, clarification thread and lawyer disposition;
- render official/compact legal evidence separately from customer-document evidence;
- replace raw evidence/context JSON dumps with bounded human-readable sections;
- show only the immutable snapshot and request thread already authorized by the assigned request;
- no general customer conversation history, no raw MatterDocument download/browser, no Legal Service `metadata_json` or arbitrary matter lookup;
- preserve all status-transition validation, substantive-response requirements, notification behavior and learning bridge;
- treat optional AI-improvement/lesson-candidate controls as an advanced/internal concern rather than the primary human-service workflow;
- responsive desktop/mobile and existing site locale;
- no DB migration expected.

## P11-007 implementation — Lawyer Workspace Continuity — 2026-09-25

**Status:** IMPLEMENTED / REVIEW_REQUIRED — uncommitted, unpushed
**Branch:** `phase11-chinese-service-platform-ui-rebase`
**HEAD:** `447b1240697888cef277c1320bc0d4492d1b5858`
**Task packet:** `docs/agent-memory/tasks/P11-007.md`

Implemented one major P11-007 work order without splitting it into sub-packets.

Server-owned safe projections live under `chatbot/lib/lawyer-workspace/`: typed queue/detail shapes, 100-request queue bound, 180-character previews, explicit buckets/counts, bounded context/evidence/message projection, bilingual copy/page copy, and pure assigned-only access helpers.

Presentation uses `lawyer-workspace-queue.tsx`, `lawyer-workspace-detail.tsx`, and `lawyer-workspace/detail-*.tsx`: assigned-only queue filters/counts, request header, customer question, AI answer under review, customer note, bounded handoff context, separated official/legal and customer-document evidence, chronological clarification thread, amber disposition rail, and secondary advanced learning feedback.

API behavior: lawyer queue returns only the safe projection; detail requires lawyer plus assignment and returns the allowlisted view plus `learningAvailable`; PATCH preserves update/status/notification/learning semantics and returns safe projection. Learning input comes from the bridge row, not fabricated request fields.

Security: unauthenticated/customer rejected; other-lawyer/unassigned rejected; admin remains on admin workflows; no chat/matter/document/trace/metadata expansion; no client-supplied authorization IDs.

Projections expose only safe queue/detail fields. Raw snapshots never reach the browser. Context preserves role/order within 8 items. Evidence classes stay separate. Unknown snapshot kinds fail soft. Customer documents expose no storage keys/hashes/URLs/downloads.

Thread remains chronological and bilingual with unchanged reply rules. Disposition exposes only status-valid actions while server validation remains authoritative. Learning feedback remains optional/secondary with no trace/artifact IDs.

Raw JSON workflow removed. Legacy lawyer-portal components remain unused and unreferenced.

Validation: `pnpm test:unit` **296 passed**; `pnpm build` **passed**; changed-file Biome **passed**; `git diff --check` **passed**; `pnpm lint` has no diagnostics in changed P11-007 files. No legal-service pytest, OpenAI, or AWS/S3 contact.

**NO NEW MIGRATION CREATED. MIGRATIONS NOT APPLIED. NO LEGAL-SERVICE CHANGE. P11-005 PRODUCTION-READINESS GATES STILL DEFERRED TO P11-009. P11-005 NOT VERIFIED. P11-008 NOT STARTED. P11-009 NOT STARTED. OPENAI NOT CONTACTED. AWS/S3 NOT CONTACTED. P11-007 NOT ACCEPTED. P11-007 NOT VERIFIED. NO COMMIT. NO PUSH.**

Immediate next action: owner/ChatGPT code review plus desktop/mobile zh-CN/English visual acceptance.

## P11-007 bounded post-push correction — 2026-09-25

**HEAD verified:** `d7f4cca2b589a1e0d19411ac2cab59a1c9cacd71`
**Worktree at start:** clean
**Status now:** uncommitted, unpushed correction only

- Fixed inverted learning availability. `learningAvailable` now derives from request status through `canProvideLawyerLearningFeedback()`: pending/in_review allow feedback before the first confirm/correct; needs_more_information/confirmed/corrected/closed do not imply a new bridge can be created. Bridge creation semantics unchanged.
- Existing bridge values still project safely when present. Before creation the UI starts from empty defaults and submits the existing PATCH fields unchanged.
- Finalized statuses show either a read-only saved-feedback summary or an unavailable-state message. No bridge-update API added.
- Lawyer queue/detail routes now share `lawyerQueueAccessForActor()` / `lawyerDetailAccessForActor()`. Lawyer queue returns assigned-only results; unauthenticated gets 401; customer and admin get 403. Admin remains on the existing admin workflow.
- Clarification thread renders bilingual role, bounded body, and bounded localized timestamp for every message. Invalid timestamps show `—`.
- Detail header now includes customer email, status, assistant mode, linked matter, created, updated, reviewed, and closed timestamps where available. Unknown assistant modes show Unavailable / 暂不可用.
- Status machine unchanged. Snapshot remains continuity authority. No matter/chat/document/trace/artifact expansion.

**Validation:** unit 301 passed; build passed; repository lint has 21 baseline errors with none in changed P11-007 files; changed-file Biome passed; diff check passed. No legal-service pytest, OpenAI, or AWS/S3 contact.

**NO NEW MIGRATION CREATED. MIGRATIONS NOT APPLIED. NO LEGAL-SERVICE CHANGE. P11-005 NOT VERIFIED. P11-008 NOT STARTED. P11-009 NOT STARTED. OPENAI NOT CONTACTED. AWS/S3 NOT CONTACTED. P11-007 NOT ACCEPTED. P11-007 NOT VERIFIED. NO COMMIT. NO PUSH.**

## P11-007 reactive locale shell correction — 2026-09-25

- Fixed zh-CN/English toggle defect: server-cookie-rendered lawyer page shell stayed Chinese while header/queue switched.
- Moved locale-sensitive lawyer workspace header copy into client `lawyer-workspace/page-shell.tsx` using existing `useSiteLocale()`.
- Server pages retain only auth/role redirects and shell layout.
- Added bilingual `律师服务 / Staff service`; all workspace/back/assigned labels now react immediately without reload.
- Removed misleading `客户工作台 / Customer workspace -> /ai-workspace` link from lawyer shell. Lawyer copy no longer implies customer MatterDocument browsing.
- MatterDocument authorization untouched: `createMatterDocumentHandlers()` remains customer-only (`regular` + `role=user`); lawyer/admin 403 is intentional. P11-007 lawyers use immutable snapshot evidence only.
- Tests cover zh-CN/English shell labels, unknown-locale normalization, and absence of customer-workspace wording.
- Validation: unit 302 passed; build passed; repository lint retains 21 baseline errors with none in changed P11-007 files; changed-file Biome passed; diff check passed.
- No migration, legal-service, MatterDocument auth, OpenAI, AWS/S3, commit, or push changes.


## P11-007 final assigned-request acceptance — 2026-09-25

**Latest authoritative P11-007 state: ACCEPTED / VERIFIED.** This section supersedes earlier P11-007 `NOT ACCEPTED / NOT VERIFIED` status notes above, which are retained as historical execution records.

Source checkpoint:

- branch: `phase11-chinese-service-platform-ui-rebase`;
- reviewed runtime/source checkpoint: `9f352310ae6aa6392607296310c6d1caa943e0b9`;
- direct GitHub source review: PASS.

Final runtime/visual evidence:

- a pending request owned by a customer test account was assigned by admin to a separate verified lawyer account;
- the assigned request appeared in the lawyer-only queue with the expected pending/needs-action bucket;
- desktop zh-CN and English queue/detail views passed;
- mobile zh-CN and English queue/detail views passed; owner confirmed the remaining scrolled mobile detail content matched the desktop semantics and had no blocking layout/formatting issue;
- bilingual shell switching remained reactive without a full reload;
- request header, immutable question/AI answer, bounded captured handoff context, official/legal evidence, customer-document evidence, clarification thread, lawyer disposition, and advanced AI-improvement feedback rendered as distinct operational sections;
- no raw context/evidence JSON, storage keys, private object URLs, hashes, arbitrary Legal Service matter metadata, or internal trace IDs were visible;
- official/legal evidence, AI analysis, customer-document evidence, and lawyer disposition remained distinct;
- only status-valid actions were presented for the pending request, and advanced feedback remained available before the first confirm/correct;
- legacy `Unknown mode / 未知模式` on the synthetic request was accepted as a safe fallback, not a release blocker.

Security boundaries remain unchanged:

- D-043 request-scoped lawyer authority remains in force;
- MatterDocument access remains customer-only; lawyer/admin 403 on customer document APIs is intentional;
- no lawyer self-assignment, matter-wide chat browsing, raw document browsing/download, or arbitrary Legal Service matter fetch was added.

Carry-forward:

- P11-005 remains **NOT VERIFIED** under D-040;
- migrations `0018`–`0021` remain unapplied;
- no AWS/S3, OpenAI, or Legal Service change was needed for this acceptance;
- P11-008 is the next planned milestone and is **NOT STARTED** by this docs-only closure.


## P11-008 planning activation — 2026-09-25

**Status:** P11-008 ACTIVE / TASK PACKET FROZEN. Stage 1 is the next implementation unit.

### Why P11-008 needs a new bounded domain

At the P11-007 verified checkpoint `c507467444f4b5304150f71c9e8aa2354cdfd6e9`, appointment handling is still placeholder-level:

- AI Workspace booking action only shows a toast and points toward the lawyer-review request;
- Contact does not create a durable consultation request;
- no appointment schema/API/history/staff scheduling workflow exists.

P11-008 therefore introduces a separate consultation-scheduling domain rather than overloading `LawyerClarificationRequest`.

### Frozen product model

Use an internal request/proposal/confirmation workflow:

- registered, verified, non-guest customer creates a consultation request;
- customer supplies timezone, up to 3 preferred future windows, method preference, and an optional bounded note;
- optional chat/lawyer-request linkage is derived and re-authorized server-side; client-supplied IDs never grant staff access;
- admin can assign/unassign a verified lawyer;
- assigned lawyer or admin can propose a concrete start/end time, method, and bounded meeting instructions;
- customer can confirm the proposal, request rescheduling, or cancel;
- assigned staff/admin can complete or cancel a confirmed request;
- proposed/confirmed appointments for the same lawyer must not overlap; concurrency protection belongs in the server transaction layer.

Baseline statuses:

`requested -> proposed -> confirmed -> completed`

With bounded side paths:

- `proposed -> requested` for customer reschedule request;
- `confirmed -> proposed` only when staff proposes a replacement slot requiring fresh customer confirmation;
- `requested|proposed|confirmed -> cancelled`;
- `completed|cancelled` terminal.

### Security / continuity rules

- appointment ownership is customer-scoped;
- lawyer visibility is assignment-scoped;
- appointment assignment never widens D-043 lawyer-request authority;
- no full conversation, raw document, private object, or arbitrary Legal Service matter data is exposed through an appointment;
- if linked to a chat, the server must prove ownership before storing the link and derive `legalMatterId` itself when available;
- if linked to a lawyer request, the server must prove customer ownership; the link does not automatically make that request visible to an appointment-assigned lawyer;
- meeting instructions are private to the customer and authorized staff, not public website content.

### Commercial/provider boundary

Do not invent:

- consultation fee;
- VIP requirement;
- office hours;
- available slots;
- lawyer biographies/specialisations;
- video provider;
- meeting URL;
- phone number;
- office address.

P11-008 may store staff-entered meeting instructions after a real proposal. It must not present those values as site-wide verified contact coordinates.

### Internal stages

**Stage 1 — Consultation domain foundation**
- additive `ConsultationRequest` + `ConsultationEvent` schema;
- generated next migration artifact only; do not apply;
- pure state/access validators;
- service transactions with optimistic state checks and immutable events;
- same-lawyer overlap protection for proposed/confirmed slots;
- customer/admin/assigned-lawyer typed APIs;
- deterministic tests.

**Stage 2 — Customer continuity**
- `/consultations` customer history and `/consultations/[id]` detail;
- bilingual create/request UI;
- AI Workspace real booking entry replacing the placeholder toast;
- Contact CTA and Client Portal continuity links;
- confirm/reschedule/cancel;
- mobile/desktop behavior.

**Stage 3 — Staff scheduling + notification + acceptance**
- admin scheduling queue/assignment;
- assigned-lawyer appointment queue/detail;
- propose/re-propose slot, method and instructions;
- complete/cancel;
- separate consultation notification adapter using existing email infrastructure, fail-neutral to the DB mutation;
- end-to-end local acceptance in zh-CN/English and desktop/mobile.

### Carry-forward

- P11-005 remains NOT VERIFIED under D-040.
- P11-009 remains responsible for AWS/staging and deferred P11-005 production gates.
- No Legal Service change is expected for P11-008.
- Do not apply migrations or deploy without explicit authorization.


## P11-008 Stage 1 source acceptance / Stage 2 activation — 2026-09-26

**Authoritative P11-008 status:** ACTIVE. Stage 1 source gate accepted; Stage 2 customer continuity is next.

### Accepted Stage 1 checkpoint

- branch: `phase11-chinese-service-platform-ui-rebase`;
- remote checkpoint: `83506156546dcff2944b21edef16423a5b402d54`;
- commit: `feat: add consultation domain foundation`;
- GitHub comparison against `aede8fc974096f7d2accf61ed69ab922c7a4e8ef`: one commit ahead, 28 files changed;
- remote source review: PASS.

Accepted source behavior includes the consultation schema/event model, revision OCC, customer/admin/assigned-lawyer authorization, immutable audit events, verified-lawyer assignment, shared User-row serialization against lawyer demotion, per-lawyer advisory-lock overlap protection, separate customer/staff DTOs, exact owned continuity links, and pre-migration lawyer-role-management compatibility.

Recorded validation from the final R3 implementation: `pnpm test:unit` **326 passed / 0 failed / 0 skipped**; build passed; changed-file Biome passed; `git diff --check` passed; `pnpm db:generate` reported no schema changes.

### Important verification boundary

Migration `0022_first_slayback.sql` is still **NOT APPLIED**.

Do not describe Stage 1 as migrated-DB verified. The following remain deferred under the **P11-008 migrated-DB transaction gate**:

- actual PostgreSQL advisory-lock concurrency;
- simultaneous same-lawyer overlap races;
- transaction rollback atomicity;
- full customer/admin/lawyer API execution against the migrated schema.

Do not apply migrations `0018`–`0022` to the authoritative local/staging/production database without explicit owner authorization.

### Stage 2 frozen customer journey

```text
registered verified customer
    ->
/consultations/new
    ->
1–3 preferred future windows + detected IANA timezone
+ consultation-method preference + optional note
+ optional server-re-authorized chat/lawyer-request continuity
    ->
requested consultation
    ->
/consultations history + /consultations/[id] detail
    ->
staff proposal appears later
    ->
customer confirms OR requests rescheduling OR cancels
```

Stage 2 is customer-only. It does not add admin/lawyer scheduling surfaces.

### Stage 2 entry points

1. **AI Workspace**
   - replace the current booking toast with navigation to `/consultations/new`;
   - if there is an active conversation, pass only `chatId` in the URL;
   - never pass/trust `legalMatterId`; Stage 1 server logic derives it.

2. **Contact**
   - the lawyer-consultation CTA becomes a real link to `/consultations/new`;
   - existing public content boundaries remain: no phone/address/email/fees/office hours are invented.

3. **Client Portal**
   - expose a safe consultation summary/history section;
   - expose an explicit availability state when 0022 is absent;
   - from a selected exact matter group, “request consultation” may pass that group's `defaultContinuationChatId` only;
   - do not infer consultation linkage from titles or semantic similarity.

4. **Account discoverability**
   - customer account menu may link to `/consultations`;
   - admin/lawyer account navigation remains role-specific.

### Stage 2 time-input rule

Do not silently perform arbitrary timezone conversion.

For the initial customer form:

- detect `Intl.DateTimeFormat().resolvedOptions().timeZone`;
- show that timezone visibly;
- interpret `datetime-local` inputs in the browser/system timezone;
- send absolute ISO timestamps plus the detected IANA timezone;
- if a valid IANA timezone cannot be resolved, fail safely and ask the customer to correct their device/browser timezone rather than sending ambiguous times.

A future explicit timezone selector requires a correct timezone-aware conversion implementation; it is not required in Stage 2.

### Stage 2 rollout compatibility

Because 0022 is intentionally unapplied, a new explicit consultation-schema availability helper must guard consultation data access.

Use an exact catalog/`to_regclass` check. Missing consultation schema is an expected rollout state; unrelated DB failures are not.

The UI must distinguish:

```text
schema unavailable
!=
available schema with zero consultations
```

Client Portal and existing customer workflows must remain usable when consultation schema is unavailable.

### Stage 2 non-goals

No:

- migration application or new migration;
- staff scheduling UI;
- consultation email notifications;
- external calendar/Calendly/Google/Microsoft integration;
- Zoom/Teams/phone provider integration;
- consultation pricing/payment;
- VIP-only booking rule;
- office hours or real-time slot availability;
- Legal Service changes;
- MatterDocument authorization changes.

P11-005 remains NOT VERIFIED under D-040. P11-009 retains the deferred P11-005 deployment/security gates.


## P11-008 Stage 2 remote acceptance / Stage 3 activation — 2026-09-26

**Authoritative P11-008 state:** ACTIVE. Stage 1 and Stage 2 source gates are accepted. Stage 3 staff scheduling + notifications is next. The migrated-DB/runtime gate remains deferred and migration 0022 remains unapplied.

### Stage 2 remote checkpoint

- branch: `phase11-chinese-service-platform-ui-rebase`;
- accepted commit: `2d91c17a483c0fd30a434536f87b64bc7cf6fe94`;
- commit: `feat: add customer consultation continuity`;
- parent: `c08260a0a398ca2685191e73d8a5f9ba7ea24ee7`;
- direct GitHub comparison: one commit ahead, 28 files changed;
- remote source review: PASS.

The remote source preserves the reviewed R2 corrections: consultation history is hidden on load error; portal consultation access requires verified-customer eligibility without changing general Client Portal access; `schema_unavailable` and `verification_required` remain distinct; the new-request form is gated by authenticated consultation availability; matter booking CTA appears only when eligible/available; scheduled method and loading copy are complete; 409 refetch does not retry the mutation.

Local validation recorded for the accepted Stage 2 implementation: 341 unit tests passed, build passed, changed-file Biome passed, `git diff --check` passed and `pnpm db:generate` reported no schema changes.

### Stage 3 source scope

Stage 3 now implements the staff half of the accepted first-party request/proposal/confirmation model.

New UI routes should be:

- `/admin-portal/consultations`
- `/admin-portal/consultations/[id]`
- `/lawyer-portal/consultations`
- `/lawyer-portal/consultations/[id]`

The existing `/lawyer-portal/[id]` route remains exclusively the P11-007 lawyer-review request detail route.

Admin UI:

- consultation queue/detail;
- verified-lawyer assignment/unassignment only in `requested`;
- slot/method/instructions proposal and re-proposal;
- cancellation;
- completion of confirmed consultations.

Lawyer UI:

- assigned-only queue/detail;
- proposal/re-proposal;
- cancellation;
- completion of assigned confirmed consultations;
- no assignment controls.

Do not widen appointment assignment into matter-wide chat, document, lawyer-request or Legal Service access.

### Stage 3 time-entry rule

Staff proposal entry uses the staff browser/device timezone for `datetime-local` interpretation and sends an absolute ISO timestamp. The staff timezone must be shown explicitly. The resulting proposal must be displayed in the customer's persisted timezone; it may additionally be shown in the staff timezone.

Do not implement fake availability, office hours or a free-slot calendar.

### Stage 3 notifications

Add a consultation-specific notification adapter and email template family over the existing SES infrastructure.

Requirements:

- separate types from lawyer-request notifications;
- disabled by default behind a consultation-specific feature flag;
- delivery failure is fail-neutral and cannot roll back a committed consultation transition;
- notification calls happen after the database mutation succeeds;
- email contains only generic event text and role-appropriate consultation link;
- no note content, preferred-window details, chat/document evidence, legal facts, provider tokens or raw internal IDs beyond the request ID needed in the application path.

A small bounded event set is enough: created->staff, assigned->lawyer, proposed->customer, customer confirm/reschedule/cancel->assigned lawyer or configured staff target as appropriate, staff cancel/complete->customer.

### Stage 3 acceptance boundary

Stage 3 source/UI acceptance may complete while 0022 remains unapplied. All staff pages must render a localized explicit unavailable state on the current database rather than claiming an empty queue.

P11-008 overall cannot close until the separately authorized migrated-DB/runtime gate verifies:

- migration 0022 execution in an approved disposable/migrated environment;
- real customer creation;
- admin assignment;
- lawyer/admin proposal;
- same-lawyer overlap conflict;
- customer confirmation and reschedule;
- cancellation/completion;
- revision conflicts;
- rollback/event atomicity;
- notification failure does not roll back state;
- desktop/mobile zh-CN/English customer/admin/lawyer visual workflow.

Do not apply migrations to the authoritative local/staging/production database without explicit owner authorization.


## P11-008 Stage 3 remote acceptance / runtime-gate handoff — 2026-09-26

Remote source checkpoint `5304742196f08894d249138c30b2245977a52e9b` is accepted for the P11-008 Stage 3 source gate.

Remote compare against `cc42b4f59277bd2bd58bc36e99cf4f673f228db7` is exactly one commit: 24 files changed, 12 added, 12 modified, +2027/-2. The final remote source includes the accepted R1 correction that synchronizes re-proposal `scheduledMethod` and `meetingInstructions` from the latest server consultation after initial load, successful mutation, and 409 refetch.

**P11-008 is not yet VERIFIED.** Migration 0022 remains intentionally unapplied on the normal local chatbot database.

### Immediate next action

Do not add more Stage-3 product features.

Create a fresh disposable clone of the chatbot PostgreSQL database and execute the P11-008 migrated-DB/runtime gate from `docs/agent-memory/tasks/P11-008.md`.

Hard safety rules:

- normal `chatbot/.env.local` remains unchanged;
- normal local chatbot DB is read-only for this gate;
- all write/migration/runtime activity targets the disposable clone via shell-scoped `POSTGRES_URL`;
- no staging/production DB;
- no real SES/AWS/OpenAI/Stripe/S3 call;
- no commit/push unless a source defect is found and separately reviewed;
- do not drop the disposable DB until external review finishes.

The first runtime session should stop after clone creation + migration verification if any database identity, migration journal or credential-handling assumption is unclear.

The runtime gate is not a P11-005 production-readiness migration. Applying 0018–0021 on the disposable clone leaves D-040 fully open.

## P11-008 Gates A–C accepted / Gate D handoff — 2026-09-26

**Authoritative current P11-008 state:** ACTIVE, not yet VERIFIED.

Product source is accepted through runtime hotfix:

`62947e779b8a5a39df58038deab7c135e452569f` — `fix: bind consultation proposal timestamps safely`

Runtime acceptance completed so far:

- Gate A disposable isolation: PASS;
- Gate B migrations through 0022 on `chatbot_p11_008_gate_20260926_20c435`: PASS;
- Gate C real PostgreSQL service/transaction acceptance: PASS, exactly 11/11 with no failure or skip;
- normal chatbot DB remains at `0017_wooden_silver_sable` with no consultation tables;
- canonical Gate-C harness SHA-256: `e04f5655868d0e9cd450aa505a3ed9fcb15063fc28fa69020d6fa7585509d8d7`.

Gate C found and closed one real source defect. Raw SQL overlap predicates were binding JavaScript `Date` objects without Drizzle's timestamp encoder. The accepted `62947e7` correction uses column-aware `lt()/gt()` comparisons and preserves the strict half-open overlap rule.

A subsequent C6 failure was diagnostic-only: raw postgres-js representation of a PostgreSQL `timestamp without time zone` differed by the local Sydney offset, while production Drizzle return/read and database text agreed. The harness was corrected; production persistence was not changed again.

### Immediate next action — Gate D only

Use the same retained disposable database. Do **not** remigrate it and do not run browser E2E yet.

Gate D proves one thing: a consultation notification delivery failure after a committed domain mutation is fail-neutral.

Required smoke:

1. create fresh synthetic `.test` customer/admin fixture on the disposable DB with notifications disabled;
2. record request revision/state/event count;
3. inside one isolated child/test process, enable `CONSULTATION_NOTIFICATIONS_ENABLED=true`;
4. set `EMAIL_PROVIDER=p11_gate_d_unsupported` and blank AWS region values so the sender cannot reach SES;
5. perform a valid admin cancellation through the real consultation service;
6. after that transaction returns successfully, call `notifyConsultation(id, "staff_cancelled")`;
7. require notification result `false`, not an exception;
8. verify the already-committed cancellation, revision increment and one new immutable `cancelled` event remain persisted;
9. capture console-error metadata only long enough to prove the unsupported-provider + consultation-delivery failure path was reached, then restore the console hook;
10. assert those captured logs contain no customer email, private note marker, preferred-window content, DB URL/password or AWS credential material;
11. restore all process-scoped notification/email environment values in `finally`;
12. recheck disposable DB identity, normal DB unchanged state, clean repo, no external call.

This gate may create temporary `/tmp` harness/result artifacts but must not modify tracked repository source.

Gate D deliberately does **not** prove HTTP/session/browser behavior; Gate E owns the real Next.js customer/admin/lawyer route/auth E2E and bilingual/responsive workflow.

If Gate D exposes a source defect, stop and return to bounded local source patch -> external review -> commit/push. Do not proceed to Gate E.

Do not drop `chatbot_p11_008_gate_20260926_20c435` until the remaining P11-008 runtime gates receive external review and owner approval.

## P11-008 Gate D accepted / Gate E handoff — 2026-09-26

Gate D is externally accepted.

Runtime evidence:

- disposable DB: `chatbot_p11_008_gate_20260926_20c435`;
- repository checkpoint during Gate D: `4dfc1426a6d2cfc148d64a9161df563d3b07f01b`;
- mutation committed before notification;
- `requested -> cancelled`, revision `1 -> 2`, event delta `+1`;
- `notifyConsultation(..., "staff_cancelled") -> false`, no throw;
- unsupported provider and delivery-wrapper paths observed;
- zero real SES delivery by provider guard ordering;
- log privacy checks passed;
- disposable DB/schema unchanged;
- normal DB unchanged at 0017 with consultation tables absent;
- repo remained clean and no external service was contacted.

### Immediate next action — Gate E only

Run a dedicated Next.js browser/runtime E2E against the retained disposable DB.

Use a unique local port and start the server yourself with the disposable `POSTGRES_URL`; do not use/reuse an arbitrary existing dev server.

Seed only fresh verified synthetic `@example.test` customer/admin/lawyer accounts. Generate a runtime-only password and authenticate all three through the real login page. Never persist the password in evidence.

Required real UI scenarios:

- customer create/history/detail;
- admin queue/detail assignment and proposal;
- lawyer assigned queue/detail with no assignment authority;
- customer confirmation;
- lawyer completion;
- a separate proposal -> customer reschedule cycle;
- customer cancellation;
- a two-page stale-revision cancellation proving visible 409 refetch/no automatic retry.

Then capture customer/admin/lawyer consultation surfaces across desktop/mobile and zh-CN/English for external visual review.

Notifications remain disabled throughout Gate E. Do not invoke AI query paths.

If any browser mutation, RBAC, stale-conflict behavior or visual/runtime assertion fails, stop and preserve artifacts. Do not patch source automatically.

At this 2026-09-26 handoff checkpoint, P11-008 was still awaiting Gate E acceptance; the final acceptance is recorded below.

## P11-008 final acceptance — 2026-09-27

**P11-008 Final UI Acceptance: PASS. P11-008: VERIFIED.** Frozen prior gates remain **PASS / ACCEPTED**: Gates A+B, Gate C, Gate D, and Gate E-Core.

### Final UI acceptance

- Real `zh-CN` → English switching: PASS; English persisted after reload: PASS.
- English → `zh-CN` switching: PASS; Chinese persisted after reload: PASS.
- Customer consultation history, new, and detail: PASS.
- Admin consultation queue and detail: PASS.
- Lawyer assigned queue and detail: PASS. The correct fresh synthetic lawyer assignment was verified through lawyer queue/detail.
- Desktop responsive presentation: PASS; mobile responsive presentation: PASS; no blocking visual/layout defect.
- Owner manually reviewed representative UI evidence.

### Acceptance-environment note

During manual acceptance, PostgreSQL temporarily reached `max_connections` as disposable-DB postgres.js connections accumulated. Idle connections were terminated and acceptance resumed successfully. This was an acceptance-environment/runtime-harness issue; no P11-008 product defect was demonstrated.

### Database and next task

Retain disposable DB `chatbot_p11_008_gate_20260926_20c435`, migrated through 0022. The normal `chatbot` DB remains unchanged at `0017_wooden_silver_sable`, with `ConsultationRequest` and `ConsultationEvent` absent. P11-005 deferred production-readiness items remain **NOT VERIFIED** and are not closed by P11-008.

**P11-009 is ACTIVE.** Owner-approved scope was expanded on 2026-09-30. Stage 1 is the immediate implementation unit; see `docs/agent-memory/tasks/P11-009.md`.

## P11-009 activation handoff — 2026-09-30

### Activation baseline

- Branch: `phase11-chinese-service-platform-ui-rebase`.
- Activation source baseline before this documentation update: `1e3a2edb3ed20682e7c87b0f1f9f05724a22b2ed` — `add UI template`.
- That commit is one clean descendant of the P11-008 final docs checkpoint and adds only `chatbot/UI_template/OPEN_ME_Sovereign_Nexus_UI.html`, `README.txt`, and the review ZIP.
- P11-008 remains VERIFIED/CLOSED. Do not rerun its frozen Gates merely for reassurance.
- P11-005 remains NOT VERIFIED under D-040; its deployment/security gates are carried to P11-009 Stage 3/4.

### Why P11-009 changed

The existing Policy Intelligence UI and discovery foundation are implemented but production remains empty because the server-only `MANUAL_POLICY_ENTRIES` registry has no published records and the P11-003 workflow required manual human promotion. The owner and lawyer stakeholder now require current policy interpretation to be generated and maintained by the system rather than waiting for manual lawyer authoring.

D-048/D-049 therefore supersede only the mandatory-manual-publication aspect of P11-003. Provenance and safety remain strict:

- official-source facts must come from backend-held allowlisted authoritative sources;
- AI analysis is a separate labelled layer and is never official source text;
- optional lawyer commentary may appear only when a real lawyer actually supplies/reviews it;
- automatic publication requires evidence verification and fails closed when decisive support or legal-status/currentness semantics are uncertain;
- source snapshots and analysis revisions are versioned/immutable.

### Immediate next action — Stage 1 only

The coding model should execute `docs/agent-memory/tasks/P11-009.md` and stop after the Stage-1 implementation/validation boundary. It must leave the implementation **uncommitted and unpushed** for external review.

Do not start Stage 2 UI work, Stage 3 P11-005 production hardening, Stage 4 AWS deployment/scheduler work, or live paid-provider acceptance in the same task.

Expected end-of-task evidence:

- exact changed files;
- schema/migration artifact status, with migrations NOT APPLIED;
- deterministic offline/fixture tests for acquisition, versioning, analysis schema, verification and publication gate;
- unit/build/Biome/`git diff --check` results;
- explicit confirmation that AWS/S3/SES/Stripe were not contacted and no normal/staging/production DB was migrated;
- `CURRENT_HANDOFF.md` updated with implementation findings, risks and next review action.

## P11-009 Stage 1 implementation handoff — 2026-09-30

**Status:** Stage 1 implementation is complete locally and awaits owner/external source and security review. Changes are intentionally **uncommitted and unpushed**. Stage 2 has not started.

### Implementation delivered

- Added durable Policy Intelligence item, source snapshot, analysis revision, and sync-run schemas with additive migration `0023_chief_famine.sql` and matching Drizzle snapshot/journal entry. **Migration NOT APPLIED** to any database.
- Added strict bilingual analysis and verification contracts, including stable claim IDs, claim/evidence links for every customer-visible narrative section, bilingual uncertainty, source-status support requirements, and a deterministic fail-closed publication gate.
- Added provider adapters with configurable analyzer/verifier model metadata, bounded timeout/output, no tool access/retries, and separate analysis/verification prompts.
- Added an injectable sync pipeline and in-memory fixture repository covering idempotent hashes, immutable snapshot/revision history, superseding publication, held review, retry against the same snapshot, and bounded safe telemetry.
- Added server-only Drizzle persistence and published/read/history services. Snapshot/revision persistence and publication transitions use transactions; a held candidate does not replace the previous published revision.
- Added official-source acquisition that reuses the existing P11-003C URL/DNS/redirect allowlist protections, normalizes bounded source evidence without executing HTML, and preserves source metadata and content hashes.
- Added `pnpm policy:sync` with configured Home Affairs, Federal Register and ART source IDs, plus offline fictional fixture mode. No public UI activation or manual registry changes were made.

### Exact changed files

- `chatbot/lib/db/schema.ts`
- `chatbot/lib/db/migrations/0023_chief_famine.sql`
- `chatbot/lib/db/migrations/meta/0023_snapshot.json`
- `chatbot/lib/db/migrations/meta/_journal.json`
- `chatbot/lib/policy-intelligence/acquisition.test.ts`
- `chatbot/lib/policy-intelligence/contracts.ts`
- `chatbot/lib/policy-intelligence/memory-repository.ts`
- `chatbot/lib/policy-intelligence/pipeline.test.ts`
- `chatbot/lib/policy-intelligence/pipeline.ts`
- `chatbot/lib/policy-intelligence/provider.ts`
- `chatbot/lib/policy-intelligence/read-service.ts`
- `chatbot/lib/policy-intelligence/repository.ts`
- `chatbot/lib/policy-intelligence/server-db.ts`
- `chatbot/scripts/fixtures/policy-intelligence-stage1/README.txt`
- `chatbot/scripts/policy-intelligence-acquisition.ts`
- `chatbot/scripts/policy-sync.ts`
- `chatbot/package.json`
- `docs/agent-memory/CURRENT_HANDOFF.md`

### Validation evidence

- Focused acquisition/pipeline tests: **18 passed, 0 failed, 0 skipped**.
- Full `pnpm test:unit`: **373 passed, 0 failed, 0 skipped**.
- `pnpm build`: **passed**, including the Next.js production build and TypeScript phase. The build printed the repository's existing stale `baseline-browser-mapping` data warning.
- Offline fixture sync, each with one publication and `idempotence=pass`: `home-affairs-guidance`, `federal-register-legislation`, `art-immigration-review`.
- Changed-file Biome check: **12 files checked, no diagnostics**.
- `git diff --check`: **passed**.
- `pnpm db:generate`: generated migration `0023_chief_famine.sql`; a repeat reported no schema changes. The command emitted a Drizzle `Failed to find Response internal state key` warning but completed. No migration command was run.
- Repository-wide `pnpm lint`: **failed** with 15,137 reported errors across 511 checked files. The changed implementation TypeScript files pass focused Biome; this repository-wide lint result is not treated as a Stage 1 pass.

### External contact, database and remaining risks

- No live model/provider call, live source acquisition, AWS, S3, SES, Stripe, or other external service was contacted. Fixture syncs used only local synthetic source/model implementations.
- No normal, staging, disposable, or production database was connected to or migrated. Migration `0023` and prior deferred migrations remain unapplied here.
- Live provider response behavior, real-source currentness/acquisition, and database-backed transaction behavior still need review/validation in an explicitly approved environment. The production registry remains empty until an operator runs the approved live sync workflow; no customer-facing route was activated.

### Recommended next action

Have the owner/ChatGPT review this uncommitted diff and the generated migration for source provenance, publication-gate semantics, schema compatibility, and transaction behavior. If source review accepts it, the owner should authorize any isolated database-backed validation and a bounded live-provider/source pilot separately. Keep Stage 2, migration application, commit/push, deployment, scheduling, and paid/live acceptance stopped until that review and authorization are complete.

## P11-009 Stage 1 R1 external-review correction — 2026-09-30

**Status:** R1 source corrections implemented and locally validated; left **UNCOMMITTED and UNPUSHED** for external review. Stage 2 and the disposable PostgreSQL runtime gate have not started.

### Review findings and corrections

- **R1-1 — Publication relevance:** analysis schema v2 requires an evidence-linked `publicationEligibility` classification with stable unit ID `policy-relevance`. The independent verifier assesses it. The publication gate permits only a fully supported `policy_relevant` result; `operational_notice`, `navigation_content`, `unrelated`, `uncertain`, or unsupported results are held. Importance scores do not affect this gate.
- **R1-2 — Full narrative verification:** verifier schema v2 requires an independent assessment for every material claim and every public narrative unit, including title, summary, changes, affected groups, impacts, actions, transition details and uncertainties. Narrative IDs are unique and evidence refs must belong to that exact unit. Unsupported narrative text blocks publication even when a linked material claim is supported. Partial support requires a practical interpretation, an explicit bilingual qualification and a matching `partial` / `qualified_support` verifier result. Source-fact partials are rejected. Verdict/reason contradictions fail validation.
- **R1-3 — Truncated evidence:** acquisition now records `evidenceTruncated`, retains at most 100,000 normalized characters, and hashes the complete normalized content so changes beyond the retained prefix remain detectable. The flag persists into the snapshot row and evidence packet; the gate holds any truncated evidence. No evidence limit was increased.
- **R1-4 — Snapshot/revision concurrency:** snapshot acquisition now locks the policy item, re-reads its actual latest-snapshot pointer, reuses the snapshot when the current hash matches, or inserts a snapshot linked to the actual previous snapshot. This preserves A -> B -> A history without a unique `(itemId, contentHash)` constraint. Held/published revision writes also lock the item and allocate the next revision number inside that boundary. Publication of a no-longer-latest snapshot is rejected. In-memory tests cover same-current-content reuse and revision allocation; PostgreSQL locking behavior still requires the separate authorized runtime gate.
- **R1-5 — Persistence/read consistency:** snapshot reconstruction preserves `effectiveDate`, ETag, Last-Modified and truncation metadata. Revision writes reject snapshots owned by another item. Published reads now require both the item and joined revision to be published and require the revision to belong to that item.
- **R1-6 — Pointer integrity:** repository write transactions validate latest snapshot and latest published revision pointers against the locked item. Snapshot predecessor links come from the validated current pointer, and revision-to-snapshot ownership is checked before persistence/publication. No cyclic foreign keys were added.
- **R1-7 — Lint baseline investigation:** ran the authoritative `pnpm lint` from `/home/rico/immigration_ai/chatbot`. It invokes `ultracite check` v7.0.11, checked 513 files and reported **15,136 errors** (15,116 diagnostics hidden by its display cap). The result is reproducible from the requested directory; it does not match the previously reported ~21-diagnostic baseline. The displayed examples are existing unrelated files such as `app/globals.css`, `components/assistant-rich-markdown.tsx`, `lib/consultations/service.ts` and old migration metadata. A focused `pnpm exec ultracite check` over 13 changed Stage-1 TypeScript files reported no diagnostics; changed-file Biome also passed. No unrelated mass cleanup was attempted.

### Exact final changed files

- `chatbot/lib/db/schema.ts`
- `chatbot/lib/db/migrations/0023_chief_famine.sql`
- `chatbot/lib/db/migrations/meta/0023_snapshot.json`
- `chatbot/lib/db/migrations/meta/_journal.json`
- `chatbot/lib/policy-intelligence/acquisition.test.ts`
- `chatbot/lib/policy-intelligence/contracts.ts`
- `chatbot/lib/policy-intelligence/memory-repository.ts`
- `chatbot/lib/policy-intelligence/pipeline.test.ts`
- `chatbot/lib/policy-intelligence/pipeline.ts`
- `chatbot/lib/policy-intelligence/provider.ts`
- `chatbot/lib/policy-intelligence/read-service.ts`
- `chatbot/lib/policy-intelligence/repository.ts`
- `chatbot/lib/policy-intelligence/server-db.ts`
- `chatbot/lib/policy-intelligence/snapshot-metadata.test.ts`
- `chatbot/lib/policy-intelligence/snapshot-metadata.ts`
- `chatbot/scripts/fixtures/policy-intelligence-stage1/README.txt`
- `chatbot/scripts/policy-intelligence-acquisition.ts`
- `chatbot/scripts/policy-sync.ts`
- `chatbot/package.json`
- `docs/agent-memory/CURRENT_HANDOFF.md`

### Final validation

- Focused Stage-1 acquisition/pipeline/audit tests: **29 passed, 0 failed, 0 skipped**.
- Full `pnpm test:unit`: **384 passed, 0 failed, 0 skipped**.
- `pnpm build`: **passed**, including TypeScript and production build. Existing stale `baseline-browser-mapping` warnings were printed.
- Offline fixture syncs for Home Affairs, Federal Register and ART: each produced one fixture publication with `idempotence=pass`; no live source or provider calls.
- Focused Ultracite on changed Stage-1 TypeScript: **13 files checked, no diagnostics**.
- Focused Biome on changed implementation/test/schema/package files: **15 files checked, no diagnostics**.
- `git diff --check`: **passed**.
- `pnpm db:generate`: generated the updated additive schema artifact as migration `0023_chief_famine.sql`; a subsequent generation reported `No schema changes, nothing to migrate`. No `0024` exists. Drizzle printed its existing `Failed to find Response internal state key` warning but completed.
- **MIGRATION NOT APPLIED.** No database was connected to or migrated.
- No live OpenAI/provider, official-source network, AWS, S3, SES, Stripe or other external service was contacted.

### Remaining runtime boundary and next action

The source-level locking contract and deterministic in-memory concurrency tests are complete, but actual PostgreSQL row-lock behavior and transaction invariants are not runtime-verified. The next action is owner/ChatGPT review of this uncommitted diff and migration. Only after that review, obtain separate authorization for the isolated disposable-PostgreSQL runtime gate. Do not start that gate, apply migration 0023, begin Stage 2, or commit/push as part of this correction.

## P11-009 Stage 1 R2 source-correction handoff — 2026-09-30

**Status:** Bounded R2 corrections are implemented on the current uncommitted R1 worktree. Changes remain **UNCOMMITTED and UNPUSHED**. Stage 2, migration application, and the PostgreSQL runtime gate have not started.

### R2 findings and corrections

- **R2-1 — Independent source-status semantics:** added the stable `source-status` verifier unit, including the complete `value`, `certain`, and `evidenceRefs` object. The verifier prompt requires direct support of the exact status; a supported related claim cannot substitute. Publication now requires that unit's `supported` / `direct_support` assessment, while uncertain status remains held. Tests cover announced support, an announced claim paired with `in_force`, unsupported status, uncertainty, and verdict/reason consistency.
- **R2-2 — Automated revision idempotency:** added a SHA-256 analysis fingerprint over snapshot identity, both contract versions, analyzer/verifier versions, provider/model, reasoning effort, timeout, and output-token configuration. Revisions persist this identity and PostgreSQL enforces uniqueness on `(snapshotId, analysisFingerprint)`. Repository writes serialize on the item row, return an existing equivalent revision without superseding it, and do not hold locks across model calls. The in-memory repository mirrors the contract. Tests cover overlapping syncs, re-analysis under changed configuration, A -> B -> A snapshot history, and provider-failure retry.
- **R2-3 — Final canonical source identity:** the pipeline now acquires and validates the official source before deriving source identity and getting/creating the item. It keys the item from `acquisition.canonicalUrl`, preserving safe redirect convergence; tests cover redirect-to-final identity, later direct discovery reuse, and failure before item creation for an unsafe redirect.
- **R2-4 — Optional analysis lists:** `uncertainties` and `recommendedActions` may now be empty while retaining their existing upper bounds. Present units still receive the same complete independent verification. An empty-list publication case is covered.
- **R2-5 — Audit version alignment:** analyzer and verifier metadata now derive from the central analysis/verification contract constants (`policy-intelligence.analysis.v2` and `policy-intelligence.verification.v2`); selected model configuration is unchanged. A focused test checks both version values and model preservation.
- **R2-6 — First-item race:** added repository `getOrCreateItem` semantics. PostgreSQL uses `INSERT ... ON CONFLICT DO NOTHING` against the stable source-identity constraint and returns the exact existing identity after a concurrent insert without overwriting it. Inconsistent identity conflicts remain errors. The in-memory test covers concurrent convergence and non-overwrite behavior.

### Exact changed files in the uncommitted Stage 1 worktree

- `chatbot/lib/db/schema.ts`
- `chatbot/lib/db/migrations/0023_chief_famine.sql`
- `chatbot/lib/db/migrations/meta/0023_snapshot.json`
- `chatbot/lib/db/migrations/meta/_journal.json`
- `chatbot/lib/policy-intelligence/acquisition.test.ts`
- `chatbot/lib/policy-intelligence/contracts.ts`
- `chatbot/lib/policy-intelligence/memory-repository.ts`
- `chatbot/lib/policy-intelligence/pipeline.test.ts`
- `chatbot/lib/policy-intelligence/pipeline.ts`
- `chatbot/lib/policy-intelligence/provider.ts`
- `chatbot/lib/policy-intelligence/read-service.ts`
- `chatbot/lib/policy-intelligence/repository.ts`
- `chatbot/lib/policy-intelligence/server-db.ts`
- `chatbot/lib/policy-intelligence/snapshot-metadata.test.ts`
- `chatbot/lib/policy-intelligence/snapshot-metadata.ts`
- `chatbot/scripts/fixtures/policy-intelligence-stage1/README.txt`
- `chatbot/scripts/policy-intelligence-acquisition.ts`
- `chatbot/scripts/policy-sync.ts`
- `chatbot/package.json`
- `docs/agent-memory/CURRENT_HANDOFF.md`

### Validation and environment boundary

- Full `pnpm test:unit`: **394 passed, 0 failed, 0 skipped**. The final focused pipeline test rerun after formatting: **33 passed, 0 failed, 0 skipped**.
- `pnpm build`: **passed**, including TypeScript and Next.js production build. The existing stale `baseline-browser-mapping` warning was printed. Its generated `next-env.d.ts` change was restored.
- Focused Ultracite: **14 changed Stage 1 TypeScript files checked, no diagnostics**. Focused Biome: **14 files checked, no diagnostics**.
- Root `git diff --check`: **passed**.
- Drizzle generation regenerated the existing `0023_chief_famine.sql`, snapshot, and journal entry. A second `pnpm db:generate` reported **“No schema changes, nothing to migrate”**. Migration `0023` remains the only new migration artifact; no `0024` exists. **Migration NOT APPLIED.**
- No database connection was attempted. No live OpenAI/provider, official-source, AWS, S3, SES, Stripe, or other external call was made.
- The separately authorized PostgreSQL runtime acceptance remains outstanding. It must validate actual concurrent item upsert and equivalent revision write behavior against migration 0023 in the approved disposable environment. No database-backed or Stage 2 work was started here.

### Next action

Stop for owner/external review of the uncommitted source and generated migration. Keep Stage 2, the disposable PostgreSQL gate, migration application, commit, and push stopped until separately authorized.

## P11-009 Stage 1 R3 currentness correction — 2026-09-30

**Status:** Final bounded R3 source corrections are implemented on the uncommitted R2 worktree. Changes remain **UNCOMMITTED and UNPUSHED**. Stage 2, database access, and the disposable PostgreSQL runtime acceptance have not started.

### R3 findings and corrections

- **R3-1 — Held latest analysis must not remain publicly current:** when a newly created held revision targets `item.latestSnapshotId`, both repositories now set the item editorial state to `review_required` while retaining `latestPublishedRevisionId` and the old immutable published revision row. A held result for a stale/non-latest snapshot does not downgrade the item. A later verified publication for the latest snapshot supersedes the prior published revision and restores the item's published state. The published read query now requires the joined revision snapshot to equal `item.latestSnapshotId` and the joined snapshot to belong to the item; a pure defense-in-depth predicate checks the same identity and state conditions.
- **R3-2 — Out-of-order acquisition must not move current snapshot backward:** after locking the item and loading its actual latest snapshot, both repositories reuse the latest snapshot for equal hashes and reject a differing incoming snapshot whose `retrievedAt` is older. The bounded result returns the authoritative latest snapshot with `staleAcquisition: true`; the pipeline therefore analyzes that returned snapshot rather than the stale acquisition body. Genuinely later A -> B -> A observations still append three immutable snapshots.
- **R3-3 — Implementation versions are independent of JSON schemas:** analysis and verification schemas remain `policy-intelligence.analysis.v2` and `policy-intelligence.verification.v2`. Analyzer and verifier audit versions are now independent constants `policy-intelligence.analyzer.v2.1` and `policy-intelligence.verifier.v2.1`; both implementation versions and both schema versions remain in the analysis fingerprint. Tests prove that changing either implementation version changes the fingerprint for the same snapshot and schema.
- **R3-4 — R2 guarantees retained:** the final acquired canonical URL identity, item get-or-create, row locking, item ownership checks, `(snapshotId, analysisFingerprint)` uniqueness, revision deduplication, independent source-status verification, full narrative verification, truncation/relevance gates, optional empty lists and provider-failure retry remain in place.

### Exact changed files in the uncommitted Stage 1 worktree

- `chatbot/lib/db/schema.ts`
- `chatbot/lib/db/migrations/0023_chief_famine.sql`
- `chatbot/lib/db/migrations/meta/0023_snapshot.json`
- `chatbot/lib/db/migrations/meta/_journal.json`
- `chatbot/lib/policy-intelligence/acquisition.test.ts`
- `chatbot/lib/policy-intelligence/contracts.ts`
- `chatbot/lib/policy-intelligence/currentness.ts`
- `chatbot/lib/policy-intelligence/memory-repository.ts`
- `chatbot/lib/policy-intelligence/pipeline.test.ts`
- `chatbot/lib/policy-intelligence/pipeline.ts`
- `chatbot/lib/policy-intelligence/provider.ts`
- `chatbot/lib/policy-intelligence/read-service.ts`
- `chatbot/lib/policy-intelligence/repository.ts`
- `chatbot/lib/policy-intelligence/server-db.ts`
- `chatbot/lib/policy-intelligence/snapshot-metadata.test.ts`
- `chatbot/lib/policy-intelligence/snapshot-metadata.ts`
- `chatbot/scripts/fixtures/policy-intelligence-stage1/README.txt`
- `chatbot/scripts/policy-intelligence-acquisition.ts`
- `chatbot/scripts/policy-sync.ts`
- `chatbot/package.json`
- `docs/agent-memory/CURRENT_HANDOFF.md`

### Validation and environment boundary

- Full `pnpm test:unit`: **399 passed, 0 failed, 0 skipped**.
- Focused Stage 1 pipeline tests: **38 passed, 0 failed, 0 skipped**.
- `pnpm build`: **passed**, including TypeScript and the Next.js production build. The repository's existing stale `baseline-browser-mapping` warning was printed. The generated `next-env.d.ts` change was restored.
- Focused Ultracite: **15 changed Stage 1 source/test/schema files checked, no diagnostics**. Focused Biome: **15 files checked, no diagnostics**.
- Root `git diff --check`: **passed**.
- `pnpm db:generate`: **“No schema changes, nothing to migrate.”** R3 required no schema change. The existing uncommitted migration remains `0023_chief_famine.sql`, including the R2 fingerprint uniqueness guard; no 0024 exists. **At this R3 checkpoint, migration had not been applied.** The subsequent disposable-only application is recorded below.
- At this R3 checkpoint no database connection had been made. No live source, OpenAI/provider, AWS, S3, SES, Stripe or other external call was made.

### Exact next boundary

At the time this R3 handoff was recorded, the next authorized boundary was the **disposable PostgreSQL runtime acceptance gate** for real PostgreSQL item-upsert, row-lock, snapshot-ordering and revision-idempotency behavior against migration 0023. That separately authorized gate has since completed; see the acceptance record below. Stage 2, commit and push remain stopped.

## P11-009 Stage 1 PostgreSQL runtime acceptance — 2026-09-30

**Status:** The separately authorized Stage 1 disposable PostgreSQL runtime gate **PASSED**. The source worktree remains uncommitted and unpushed. Stage 2, commit, push, deployment, and any production/staging operation were not performed.

### Target and migration record

- Disposable target: `chatbot_p11_009_stage1_gate_20260930_71c3ad`, created from `template0` on PostgreSQL at `127.0.0.1:5432`. Runtime/migration role: `postgres`.
- Before database creation and each migration/harness write group, the safe server identity, latest repository migration journal entry (`0023_0023_chief_famine`), and target database were recorded. No credential value was displayed or written.
- Target migration ledger started absent and ended with 24 rows, through journal entry `0023_0023_chief_famine`. The normal `pnpm db:migrate` command was rerun against the target and completed idempotently; the ledger remained at 24 rows with latest `created_at=1790732822725`.
- Schema inspection found all four Stage 1 tables (`PolicyIntelligenceItem`, `PolicyIntelligenceSourceSnapshot`, `PolicyIntelligenceAnalysisRevision`, `PolicyIntelligenceSyncRun`), all declared non-primary-key indexes, and all three foreign keys. PostgreSQL applied its normal 63-byte identifier truncation to long generated index/constraint names; each corresponding index/constraint is present. Temporary rollback fault-injection triggers/functions were removed (zero non-internal test triggers remain).
- Normal `chatbot` protected-ledger baseline is unchanged: 18 rows, latest `created_at=1788555690264`, hash prefix `5ab3705c4552`. Retained `chatbot_p11_008_gate_20260926_20c435` baseline is unchanged: 23 rows, latest `created_at=1790358881920`, hash prefix `7851df78e5a5`. Neither database was used as a template or written to.

### Runtime acceptance cases

The harness lived under `/tmp` and invoked the real Stage 1 Drizzle repository and published read service with deterministic fixture inputs. All 12 cases passed against the disposable target:

1. Concurrent first-item creation converges on one row.
2. Concurrent equal-hash acquisitions create one snapshot.
3. Later A → B → A source history creates three immutable snapshots.
4. An older out-of-order acquisition is rejected without moving the latest pointer backward.
5. Concurrent equivalent revisions create one revision.
6. Deliberate reanalysis creates a new revision and supersedes the prior one.
7. A held revision for the latest snapshot preserves prior publication history and is excluded from the published read service.
8. A stale held revision does not downgrade a later current publication.
9. Later current publication restores visibility and revision history remains correct.
10. Cross-item snapshot/revision association is rejected without partial rows.
11. Injected failures after intermediate writes prove revision supersession and snapshot insertion roll back atomically; injection objects were removed.
12. The real published read service returns only the current publication for the current snapshot.

The recorded successful harness run reported 18 target items, 22 snapshots, 14 revisions, and zero sync runs. An initial invocation used a runner that did not surface its output in the execution window; its fixture namespace was left intact. A second run used a distinct fixture namespace, surfaced all 12 PASS results, and is the recorded acceptance result. No repository source was changed during the runtime gate.

### Scope and next boundary

- Migration 0023 was applied only to the newly created disposable target. That target is intentionally retained for review and must not be dropped as part of this gate.
- No write or migration was made to normal `chatbot` or retained P11-008. No live OpenAI/provider, source website, AWS, S3, SES, Stripe, or other external call was made. No `.env.local` edit was made.
- **Stop here.** The authorized Stage 1 PostgreSQL runtime acceptance work is complete. Stage 2 requires its own authorization and is not started.

## P11-009 Stage 1 acceptance — 2026-09-30

P11-009 Stage 1 is **ACCEPTED** after external/source review through R1/R2/R3; 399/399 unit tests; 38/38 focused pipeline tests; production build; focused Ultracite/Biome; `git diff --check`; successful disposable PostgreSQL migration through 0023; and all 12 PostgreSQL runtime acceptance cases passing.

- Retained disposable database: `chatbot_p11_009_stage1_gate_20260930_71c3ad`.
- The normal `chatbot` database and retained P11-008 disposable database remained unchanged. No staging or production database was touched.
- During the runtime gate, no live OpenAI/provider, official-source website, AWS, S3, SES, Stripe, or other external service was contacted.
- Stage 1 acceptance does **not** imply overall P11-009 verification.
- Stage 2 is the next implementation stage and has **not started**. Live provider/source work and AWS scheduling/deployment remain outside Stage 1.


## P11-009 Stage 2 activation — Policy Intelligence product activation — 2026-09-30

**Status:** Stage 1 is **ACCEPTED** at remote source checkpoint `0dae9e7ea46712c18357e3a9c009157c8cf0c8a1` (`feat: add live policy intelligence backend`). Stage 2 is now **ACTIVE / READY TO IMPLEMENT**. Stage 3 and Stage 4 remain not started.

### Repository review before activation

- Branch `phase11-chinese-service-platform-ui-rebase` points to `0dae9e7ea46712c18357e3a9c009157c8cf0c8a1`, one clean commit after the Stage-1 planning/docs checkpoint `b422c68e7ccf956490bb8554042d500c19a9cf2b`.
- The Stage-1 commit contains the accepted durable Policy Intelligence schema/migration, official-source acquisition, analyzer/verifier contracts, fail-closed publication pipeline, read service, operator sync path, tests and handoff only; public `/intelligence`, detail and Home loaders still use the earlier manual-registry projection path.
- `chatbot/lib/policy-intelligence/read-service.ts` already exposes server-only current published rows, one item by slug, revision metadata and latest sync metadata. The existing public UI does not consume that DB-backed service yet.
- The existing public list/detail UI already preserves the Official Source / AI Analysis / Lawyer Commentary separation, but it is shaped around the earlier `PolicyEntry` model and does not yet expose Stage-1 structured sections, public-safe revision history/diff or deterministic importance behavior.
- The Sovereign Nexus template contains useful visual ideas for richer policy metadata, insights, history and continuity actions, but remains a reference only. Mock claims, lawyer identities, statistics, office details and prototype behavior are not production authority.

### Frozen Stage 2 product direction

Stage 2 activates the accepted Stage-1 backend in the public product without changing legal reasoning, applying migrations, scheduling live syncs or starting AWS work.

1. **Availability-aware server activation.** Add a server-only product loader that treats the Stage-1 PostgreSQL store as canonical when migration 0023 is present. Use an exact catalog/`to_regclass` availability check so the current normal database, which may not yet contain 0023, does not crash Home or Policy Intelligence. Schema unavailable must remain distinguishable from a genuinely available store with zero published items. Existing published `MANUAL_POLICY_ENTRIES` may remain a compatibility/editorial fallback only when the live schema is unavailable; unexpected DB failures must not be broadly swallowed.
2. **Public-safe projection v2.** Map only current published Stage-1 data into explicit public DTOs. Public output may include source identity/status/date, published revision metadata, bilingual title/summary, key changes, affected groups, practical impacts, recommended actions, transition information, uncertainties and bounded importance dimensions. It must exclude raw normalized evidence, verification internals, model metadata, analysis fingerprints, sync errors, held/draft revisions and other backend-only fields.
3. **Provenance stays explicit.** Official source metadata/link, AI-generated interpretation and actual lawyer commentary remain separate visual/data layers. Automated AI copy must never populate `officialExcerpt` or lawyer commentary. If no lawyer commentary exists, show an explicit neutral absence state rather than inventing one.
4. **List + Home activation.** Convert Home and `/intelligence` to async server-backed reads with a repository-consistent no-store/dynamic freshness boundary so successful future syncs are not frozen at build time. Preserve bilingual search/filter behavior. Never expose raw `sourceConfigId` as a customer category. Use human-readable source-family/authority labels.
5. **Deterministic importance behavior.** Do not expose a 0–100 AI confidence/importance score. Support a deterministic impact sort using the validated bounded Stage-1 dimensions, preferably a documented lexicographic tuple over service relevance, immediacy, procedural impact, affected population and a fixed legal-force rank, with publication recency/slug only as stable tie-breakers. Keep “Latest” as an explicit alternative sort.
6. **Detail experience.** Expand the detail page into a richer evidence-aware policy brief: official source identity and dates, clear AI-generated label, key changes, affected groups, practical impacts, actions, transition information and uncertainties. Source/effective dates are nullable and must render as not stated rather than being invented.
7. **Public revision history and deterministic diff.** Expose only revisions that were actually public (`published` or historical `superseded`); never leak draft/review-required/held analyses. Compute current-vs-previous published change summaries deterministically from structured stable unit IDs/content rather than asking another model to describe the diff. Historical records remain immutable.
8. **Policy -> AI Workspace continuity.** Add an “Ask AI about this policy/update” action that carries only a stable policy slug/reference from the public page. The receiving workspace must resolve current published policy identity server-side; client-supplied policy title/text must not become trusted context. Stage 2 may prefill/show a bounded topic card, but Policy Intelligence analysis must not be promoted into official legal evidence, durable known facts, or hidden authority for the answer. Normal AI answer/research behavior remains authoritative.
9. **Rollout compatibility.** Stage 2 creates no schema migration and does not apply 0023 to the normal local, retained disposable, staging or production database. The retained Stage-1 disposable DB remains review evidence, not a default development target.

### Stage 2 acceptance boundary

Required deterministic coverage includes live-schema available/unavailable/zero-content semantics, manual fallback, public projection leakage checks, nullable source dates, deterministic importance ordering, public-history filtering, deterministic diff behavior, provenance labels, Home/list/detail locale behavior and slug-only AI Workspace continuity. Run full unit tests, production build, focused Ultracite/Biome and `git diff --check`.

Stop Stage 2 **uncommitted and unpushed** for owner/ChatGPT source review. Do not start Stage 3, apply migration 0023, run a live provider/source sync, contact AWS, add scheduling, or change Legal Service reasoning/model routes in the same task.

## P11-009 Stage 2 implementation — Policy Intelligence product activation — 2026-09-30

**Status:** Stage 2 implementation is complete and stopped for owner/ChatGPT review. All changes remain uncommitted and unpushed on `phase11-chinese-service-platform-ui-rebase` at starting HEAD `28d81454f19d1510535ba6d923199c6dbc56f9ec`. Stage 3 and Stage 4 have not started.

### Changed files

- `chatbot/app/(chat)/page.tsx`
- `chatbot/app/(chat)/intelligence/page.tsx`
- `chatbot/app/(chat)/intelligence/[id]/page.tsx`
- `chatbot/app/(chat)/ai-workspace/page.tsx`
- `chatbot/components/immigration-service-home.tsx`
- `chatbot/components/premium-answer-mode-workspace.tsx`
- `chatbot/components/policy-intelligence-availability-notice.tsx`
- `chatbot/components/policy-intelligence-product-page.tsx`
- `chatbot/lib/policy-intelligence-server.ts`
- `chatbot/lib/policy-intelligence/read-service.ts`
- `chatbot/lib/policy-intelligence-product.ts`
- `chatbot/lib/policy-intelligence-product-copy.ts`
- `chatbot/lib/policy-intelligence/schema-availability-policy.ts`
- `chatbot/lib/policy-intelligence/schema-availability.ts`
- `chatbot/lib/policy-intelligence-product.test.ts`
- `chatbot/package.json` (registers the focused product tests in `test:unit`)
- `docs/agent-memory/CURRENT_HANDOFF.md`

### Implementation record

- Added an exact four-relation `to_regclass` schema availability check using a dedicated UTC PostgreSQL client. All relations absent enables only published manual fallback; partial schema and unexpected errors propagate. Available schema is canonical, including a genuine zero-publication state.
- Added explicit bilingual public DTOs. Automated projections include source identity and dates, public category labels, published revision metadata, structured analysis and bounded importance dimensions. They omit normalized/raw source evidence, verification certainty/assessments, model/provider/fingerprint/source IDs, sync internals, AI-created excerpts and invented lawyer commentary. Actual manual excerpts/commentary remain limited to their reviewed records.
- Activated Home with the bounded latest three items and localized availability state; `/intelligence` now has bilingual search, category/status filters and Latest/Impact sorting; detail renders source, AI interpretation, actual/absent lawyer commentary, nullable dates, bounded dimensions, published history and structured diff. Routes use the repository's Cache Components behavior; unsupported `dynamic = "force-dynamic"` route flags were removed after the build identified the conflict.
- Impact ordering uses service relevance, immediacy, procedural impact, affected population, fixed legal-force rank, publication time and slug. No synthetic composite score is displayed.
- Public history is limited to the current public revision and previously published superseded revisions, bounded to 20; it validates item/revision/snapshot identity and refuses to revive old history when the current snapshot is held. The bounded deterministic diff uses stable IDs and public bilingual values only.
- AI Workspace continuity transports only a validated slug. The server resolves it against the current public loader; unknown/held references fail soft. The resulting card is presentation-only topic continuity and does not populate facts, evidence, citations or prompt context. Legal Service and answer routing were not changed.

### Validation and limits

- `pnpm test:unit`: **422 passed, 0 failed, 0 skipped**. Focused product suite: **23 passed, 0 failed**.
- `pnpm build`: **passed**, including TypeScript and Next production build. Next reported Home, `/intelligence`, detail and AI Workspace as partially prerendered with request-time server streaming. Existing stale `baseline-browser-mapping` notices were printed. Build-generated `next-env.d.ts` was restored.
- Focused Biome: all **15 changed TypeScript/TSX/test files passed** with no diagnostics. Focused Ultracite: **11 changed files passed**; Ultracite mishandles route filenames/directories containing parentheses, so the four route files were linted from exact temporary copies (all passed; temporary files removed). A broader `app` Ultracite scan found one pre-existing `app/globals.css:295` descending-specificity warning; that file is unchanged.
- Root `git diff --check`: **passed** before this handoff append; rerun after the append.
- No schema change or migration was created. Stage 2 did not apply migration 0023 to any database; the normal database and retained disposable databases were not accessed or changed. No `.env.local` edit, live OpenAI/provider or official-source call, AWS/S3/SES/Stripe call, scheduler, or deployment occurred.
- A real live-schema request-path integration and browser visual smoke were not run: migration/database access was out of scope and no fixture-driven browser smoke was available. Deterministic coverage exercises schema states, projection, ordering, history/diff and slug continuity.

### Exact next step

Owner/ChatGPT should perform an independent source review of this uncommitted Stage 2 diff against S2-1 through S2-10 and the accepted Stage-1 contracts. Keep the worktree uncommitted/unpushed during review. Do not apply migration 0023, start Stage 3, run a live sync, or change Legal Service behavior in that review step.

## P11-009 Stage 2 R1 projection/product correction

**Status:** Bounded R1 corrections are implemented on the existing uncommitted Stage 2 worktree and stopped for independent source review. No Stage 3 work has started. Changes remain uncommitted and unpushed.

### Corrections

- Fixed the runtime narrative projection leak. Live inputs now use the accepted Stage-1 `PolicyAnalysis` contract. Every narrative and `transitionInfo` is positively projected as only `id` plus bilingual `text` strings; no spread from Stage-1 localized text remains. The read-service list return is typed, and the unsafe `as LivePolicyRecord[]` and history record cast were removed.
- Added `PublicPolicyProductPreview`/`PolicyProductPreviewState`; Home receives only ID, slug, origin/status, nullable source date, localized public category and bilingual title/summary. Added explicit `PublicPolicyHistoryEntry`; detail history contains only revision number, publication time, editorial status and bilingual title. Full previous analysis stays server-side for deterministic diff computation.
- Added distinct bilingual human-readable labels for the configured Home Affairs, Federal Register of Legislation and Administrative Review Tribunal source families. Unknown IDs map to a generic label.
- Latest ordering uses published time, falls back to source date where publication time is absent, then revision number, slug and ID. No dates are fabricated.
- Replaced visible `n / 5` importance scores with localized semantic labels for service relevance, immediacy, procedural impact and affected population. Numeric values remain internal to sorting.
- Added a localized Source status / 来源状态 diff heading.

### Exact R1-changed files

- `chatbot/components/immigration-service-home.tsx`
- `chatbot/components/policy-intelligence-availability-notice.tsx`
- `chatbot/components/policy-intelligence-product-page.tsx`
- `chatbot/lib/policy-intelligence-product-copy.ts`
- `chatbot/lib/policy-intelligence-product.test.ts`
- `chatbot/lib/policy-intelligence-product.ts`
- `chatbot/lib/policy-intelligence-server.ts`
- `chatbot/lib/policy-intelligence/read-service.ts`
- `docs/agent-memory/CURRENT_HANDOFF.md`

### Validation and limits

- Focused Stage-2 product suite: **26 passed, 0 failed**. Full `pnpm test:unit`: **425 passed, 0 failed, 0 skipped**.
- `pnpm build`: **passed**, including TypeScript and Next production build; Cache Components routes remain partially prerendered with request-time streaming. Existing stale `baseline-browser-mapping` notices were printed. Build-generated `next-env.d.ts` and `tsconfig.tsbuildinfo` changes were restored.
- Focused Ultracite and Biome: all **8 R1-changed TypeScript/TSX/test files passed** with no diagnostics.
- Root `git diff --check`: **passed** after this append.
- No schema change or migration was created. No database connection or migration was made. No live provider, source website, AWS, S3, SES or Stripe call occurred.
- Live request-path integration and browser visual acceptance remain untested because this R1 task prohibited database access; the bounded visual acceptance is the next review stage.

### Next boundary

First obtain independent owner/ChatGPT source review of this R1 diff. After review, perform bounded visual acceptance with deterministic fixture data. Keep all work uncommitted/unpushed; do not apply migration 0023, start Stage 3, connect to a database or call external services.

## P11-009 Stage 2 bounded visual acceptance

**Status:** PASS. Stage 2 remains uncommitted and unpushed. Stage 3 has not started.

- Ran the accepted pages in an isolated `/tmp/p11-009-stage2-visual` chatbot copy with a temporary in-memory loader and three obviously fictional policy fixtures (Home Affairs, Federal Register and ART). The rich fixture included two published revisions and a deterministic diff; the ART fixture had null source/effective dates, no lawyer commentary and no transition note. Browser API requests needed by the workspace were intercepted and answered with local fixtures; all non-local requests were blocked. No tracked product source was modified by the visual harness.
- Captured evidence under `/tmp/p11-009-stage2-visual-evidence/`: Home zh-CN/en desktop (1440×900); `/intelligence` zh-CN/en desktop (1440×900) and English mobile (390×844); detail zh-CN/en desktop (1440×900, including history/diff) and zh-CN/en mobile (390×844); AI Workspace topic-reference card desktop (1440×900) and mobile (390×844). Every measured viewport had `scrollWidth` equal to viewport width.
- Exercised search, source-family and source-status filters, Latest and Impact sorts, locale switching, official-source outbound-link presentation, published history, Added/Removed/Changed diff entries, the distinct Source status label, and the Ask AI policy link.
- Provenance remained visually distinct across official source, AI-generated interpretation and lawyer commentary; the no-commentary state was explicit and no lawyer identity appeared. The null-date fixture displayed “Not stated” for both dates, with no date inferred; source-family labels were human-readable and no raw sourceConfigId appeared. Importance used semantic labels without visible numeric scores or percentages.
- Home displayed no more than three policy previews. List controls remained usable at desktop/mobile widths. Long content had no mobile horizontal overflow. The workspace displayed the policy as a topic/reference card, identified the official-source link, retained its continuity notice, and left its normal mode controls and composer usable.
- **Non-blocking harness observation:** the browser console reported local 404 resource responses from routes outside the explicitly stubbed workspace fixture APIs. There were no page errors, and the required pages and interactions passed. No outbound request was attempted.
- No database was connected, no migration was applied, and no OpenAI/provider, official-source website, AWS, S3, SES, Stripe or other external service was contacted.


## P11-009 Stage 2 final acceptance — 2026-09-30

P11-009 Stage 2 is **ACCEPTED**.

Acceptance evidence:
- Stage 2 + R1 source review: PASS.
- 425/425 unit tests: PASS.
- 26/26 focused product tests: PASS.
- Production build: PASS.
- Focused Ultracite/Biome: PASS.
- `git diff --check`: PASS.
- Bounded visual acceptance across desktop/mobile and zh-CN/en: PASS.
- Home/list/detail/history/diff/AI Workspace policy-reference continuity: PASS.
- No migration was created or applied.
- No database or external service was contacted during Stage 2 implementation/visual acceptance.

The visual gate used deterministic isolated fixtures; it does not claim live
staging/PostgreSQL request-path acceptance.

Stage 3 is the next authorized planning boundary and has not started.


## P11-009 Stage 3 activation — Whole-platform production hardening — 2026-09-30

**Status:** Stage 2 is **ACCEPTED** at remote checkpoint `0afa4cb7921e74ee6a2263b66743a875c5cf3e07` (`feat: activate policy intelligence product`). Stage 3 is now **ACTIVE / READY TO IMPLEMENT**. Stage 4 remains not started.

### Stage 2 closure evidence

Stage 2 closed after the R1 public-projection correction and bounded fixture-driven visual acceptance:

- full unit suite: 425/425;
- focused product suite: 26/26;
- production build: PASS;
- focused Biome/Ultracite and `git diff --check`: PASS;
- source review: PASS;
- bounded desktop/mobile zh-CN/en visual acceptance: PASS;
- Home/list/detail/history/diff/AI Workspace policy-reference continuity: PASS;
- no migration/database/external-service contact during Stage 2 implementation or visual acceptance.

The visual gate used deterministic isolated fixtures; it did not claim live staging/PostgreSQL request-path acceptance.

### Repository findings that shape Stage 3

- P11-005 implementation Stages 1–3 are accepted, but D-040 production-readiness gates remain open: deployment-compatible `@napi-rs/canvas`, controlled migration + DB-backed document smoke, private S3/IAM/Block Public Access verification, retention/purge + stale storage-intent recovery, and malware/quarantine/scanning strategy.
- The current `chatbot/Dockerfile.local` installs/builds the app and runs `pnpm db:migrate` in its service startup command. That is acceptable only as historical/local simulation behavior; the Stage-3 production artifact must separate service startup from one-off migration execution.
- `@napi-rs/canvas` is a direct chatbot dependency, but repository evidence does not yet prove that the exact native binding required by the eventual ECS/Fargate task architecture is present and loadable in the production image.
- MatterDocument upload remains private-S3 based and starts with `securityStatus: pending`. The current production-readiness gap is operational: explicit malware/quarantine policy, fail-closed clean-status gating, retention/purge operations, stale upload/cleanup recovery and environment verification.
- Stage-1 Policy Intelligence introduced migration 0023 after the earlier P11-005/P11-008 migrations. Any later staging migration must therefore inspect and migrate to the then-current repository head rather than applying only the historically named 0018–0021 subset.
- Stage 4, not the initial Stage-3 coding task, owns actual AWS/staging mutation: topology inspection, authorized staging migration, exact image deployment, AWS resource verification and scheduled Policy Intelligence sync.

### Frozen Stage 3 implementation direction

Stage 3 is one concentrated production-hardening stage. The first coding pass is **source/tooling only** and must stop uncommitted/unpushed for review.

1. **Production image/runtime separation.** Add a production-oriented chatbot container/runtime path with no implicit database migration on normal service startup. Add a deterministic native-runtime self-check for document parser dependencies, especially `@napi-rs/canvas`, and preserve parser-worker output-file tracing.
2. **Migration readiness, not migration application.** Make build/start/migrate responsibilities explicit and add bounded target-identity/preflight tooling suitable for a later one-off migration job. The source task must not connect to or mutate the normal, retained disposable, staging or production databases.
3. **MatterDocument operational lifecycle.** Add bounded operator-only maintenance for stale storage intents and retention purge. Dry-run must be the default; destructive action requires explicit CLI intent/cutoff/batch bounds. S3 deletion must succeed before hard metadata/evidence purge, and failures must retain recoverable DB state.
4. **Malware/quarantine fail-closed boundary.** A document must not enter processing, AI evidence or lawyer handoff unless its security state is explicitly clean. Add a provider-neutral scanner/reconciliation boundary and deterministic test adapter; do not silently mark uploads clean. The concrete AWS scanning service/topology remains a Stage-4 environment choice and acceptance item.
5. **Private-S3 security preflight tooling.** Add an injectable/read-only preflight boundary capable of verifying the production expectations for region/bucket identity, encryption, Block Public Access and non-public policy posture. No AWS call is authorized in the source task. Effective write/delete permission and real object smoke are later environment gates.
6. **Whole-platform regression harness.** Add/extend a bounded Phase-11 Playwright/accessibility regression covering representative public, AI Workspace, Client Portal, lawyer workspace, consultation and Policy Intelligence surfaces across zh-CN/en and desktop/mobile. Use deterministic fixtures/test identities; do not add a production auth bypass.
7. **Production configuration hygiene.** Preserve secret boundaries, keep widget debug off by default, document required production variables without real values and avoid exposing storage keys/document bodies/internal Policy Intelligence data in logs.

### Stage 3 acceptance split

Stage-3 **source acceptance** does not by itself mark D-040 closed. After source review, later owner-authorized operational gates may exercise a fresh disposable PostgreSQL database/container image and local deterministic maintenance/scanner fixtures.

Actual staging/AWS attestations remain Stage 4: current staging migration application, exact ECS/Fargate image/native binding verification, private S3/IAM/BPA verification against the real bucket/role, concrete malware-scanner integration/configuration, and scheduled Policy Intelligence sync.

Do not mark P11-005 VERIFIED merely because Stage-3 source code exists. D-040 is closed only when the required environment-specific evidence is subsequently recorded.


## P11-009 Stage 3 implementation — whole-platform production hardening

Stage 3 source/tooling work is prepared on `phase11-chinese-service-platform-ui-rebase` and remains uncommitted/unpushed. Stage 4 has not started. No schema, migration, lockfile, or dependency change was made; migration head remains 0023.

### Changed files

- `.dockerignore`
- `chatbot/.env.production.local.example`
- `chatbot/Dockerfile.local`
- `chatbot/Dockerfile.production`
- `chatbot/next.config.ts`
- `chatbot/package.json`
- `chatbot/app/(chat)/intelligence/page.tsx`
- `chatbot/app/(chat)/intelligence/[id]/page.tsx`
- `chatbot/lib/db/runtime-client.ts`
- `chatbot/lib/db/migrate.ts`
- `chatbot/lib/db/queries.ts`
- `chatbot/lib/consultations/service.ts`
- `chatbot/lib/lawyer-requests/service.ts`
- `chatbot/lib/matter-documents/ai-evidence-packet.ts`
- `chatbot/lib/matter-documents/ai-evidence-packet.test.ts`
- `chatbot/lib/matter-documents/lawyer-evidence-reconstruction.ts`
- `chatbot/lib/matter-documents/lawyer-evidence-reconstruction.test.ts`
- `chatbot/lib/matter-documents/processing/service.ts`
- `chatbot/lib/matter-documents/processing.test.ts`
- `chatbot/lib/matter-documents/service.test.ts`
- `chatbot/lib/matter-documents/maintenance.ts`
- `chatbot/lib/matter-documents/security-reconciliation.ts`
- `chatbot/lib/production/migration-preflight.ts`
- `chatbot/lib/production/native-runtime-verifier.mjs`
- `chatbot/lib/production/s3-security-preflight.ts`
- `chatbot/lib/production/stage3-hardening.test.ts`
- `chatbot/scripts/db-migration-operator.ts`
- `chatbot/scripts/matter-document-maintenance.ts`
- `chatbot/scripts/s3-security-preflight.ts`
- `chatbot/scripts/verify-native-runtime.mjs`
- `chatbot/playwright.stage3.config.ts`
- `chatbot/tests/e2e/phase11-accessibility.test.ts`
- `scripts/run-local-production-frontend.sh`
- `docs/agent-memory/CURRENT_HANDOFF.md`

### Implementation and validation

- Production startup no longer applies migrations. Build, start, read-only migration preflight, and acknowledged one-off migration execution have separate commands. The production image uses Next standalone output, preserves parser-worker assets, excludes `.env*` files from Docker context, and makes no CPU architecture assumption. DB-backed modules now defer client initialization until a query; Policy Intelligence DB reads are deferred until requests.
- Host native verifier: **PASS** on Node `v24.14.0`, Linux `x64`; `@napi-rs/canvas` `1.0.9`, parser worker/pdfjs `6.3.289`. This is host evidence only, not the Stage-4 container/target architecture result.
- Full `pnpm test:unit`: **435/435 passed**, zero failed/skipped. Focused Stage-3 tests cover redacted migration target reporting, verifier success/failure, clean-only processing/evidence, scanner CAS/idempotency, stale cutoff/order/batch, purge exclusion/order/recoverability, S3 posture failures, and migration-free startup.
- Focused Biome: **25 files passed**. Focused Ultracite: **23 source/script/test files passed**; its CLI reports an internal path-resolution diagnostic for the two route files containing `(chat)`/`[id]`, which were checked by Biome. A standalone `tsc --noEmit` is not a clean repository gate: it reports existing unrelated model/billing test type errors and two pre-existing `processing.test.ts` diagnostics; no Stage-3 production-source diagnostics remained after filtering.
- Host `pnpm build` passed before the final lazy-DB-import adjustment. Next reported that it loaded `.env.local`; I did not open or print that file. Since the earlier build preceded the request-boundary change for Policy Intelligence, **zero database connections cannot be certified from that run**. The DB-backed route modules were subsequently verified to import successfully with `POSTGRES_URL` unset.
- Docker is available. The first image build failed during route collection on import-time `POSTGRES_URL` validation. Automatic review rejected a proposed build-only placeholder URL because it might trigger a DB attempt; that retry was not run. After the lazy-DB change, a network-isolated Docker build stopped before app compilation because Corepack could not download pnpm with networking disabled. No production image was produced and the in-image verifier was not run. Do not treat the host verifier as replacing that gate.
- Playwright was not run: there was no explicitly selected safe test server, no reviewed Intelligence detail fixture, and no real customer/admin/lawyer auth states. The concentrated suite requires explicit target configuration and does not add an auth bypass.
- Root `git diff --check`: **PASS** after this handoff was appended.

### Lifecycle/security contracts and remaining gates

Stale cleanup and purge are operator-only, bounded, explicit-cutoff, and dry-run by default. Cleanup reuses the current CAS lifecycle. Purge only considers old soft-deleted, non-processing records; it deletes private storage before hard-deleting metadata and leaves recoverable metadata on either failure. No retention duration was invented.

Uploads remain `securityStatus: pending`. Processing, AI evidence, and lawyer evidence reconstruction require `clean`; parser success cannot change the verdict. The provider-neutral scanner adapter returns a validated `clean | rejected | failed` verdict and reconciles only `pending` via CAS. Stage-4 adapter requirements: obtain the exact private stored object/version and compare its recorded digest; return an authenticated verdict with stable scanner and scan identifiers; make retries/replays idempotent; fail closed on unavailable, malformed, or mismatched results; keep provider credentials and scanner details server-side; never expose a client verdict setter or allow parser output to override the scan. No real scanner was selected.

The injectable S3 preflight checks bucket existence, expected region, AES256/KMS encryption, all four Block Public Access flags, non-public policy status, and that product authorization does not use public object URLs. It does not prove effective IAM access. No AWS call was made.

No migration was generated/applied, no database command or probe was run, and no AWS/S3/IAM/OpenAI/policy-source/SES/Stripe service was intentionally contacted. Because the earlier host build loaded `.env.local`, report the no-database condition as **unverified**, not as a clean zero-connection attestation. Do not mark P11-005 VERIFIED or D-040 closed from this work.

**Next external-review action:** request an independent Stage-3 source review of this uncommitted diff against P11-009 S3-1 through S3-8 and D-040. Include the unverified host-build DB-contact caveat, the missing in-image native result, migration/purge/scanner boundaries, and the outstanding real-auth Playwright fixture matrix. Only after that review and owner-authorized environment evidence should Stage 3 be accepted and Stage 4 considered.


## P11-009 Stage 3 R1 production-hardening correction

Stage 3 R1 corrections are implemented on `phase11-chinese-service-platform-ui-rebase` and remain uncommitted/unpushed. Stage 4 has not started.

### Corrections

- Migration preflight now inspects Drizzle’s default `drizzle.__drizzle_migrations` ledger. It checks `to_regclass` before reading; only a confirmed absent ledger is treated as empty. Unknown timestamps fail closed. Deterministic tests cover missing, behind, current, unknown, and exact-target mismatch cases.
- Migration execution requires both `--acknowledge-migrations` and `--expect-database=<exact-name>`. The configured target is checked before connecting, and `current_database()` is checked before the migrator runs. Output contains only safe database/server identity, never credentials.
- Phase1B now has an explicit `phase1b-chatbot-prepare` one-off job that runs the acknowledged migration against the exact `chatbot` database and the Phase 0 compatibility preparation. The normal `phase1b-chatbot` startup remains migration-free and waits for successful job completion.
- Stale recovery now selects only `uploading` and `cleanup_pending` states in both the SQL query and service filter. Terminal cleaned `storage_failed` rows are not retried; regression tests verify repeated runs do not call cleanup for them.
- Playwright authentication uses separate owner-provided customer, admin, and lawyer storage states. The suite encodes role-specific allowed and denied routes, including `/lawyer-portal` and `/lawyer-portal/[id]`, with semantic page assertions and explicit redirect/status/denial checks. Cases needing absent owner fixtures skip with a reason. No application auth bypass was added. Runtime RBAC was not exercised because no role sessions/fixture IDs were supplied.
- S3 preflight reports only cloud-observable posture. The hardcoded public-URL authorization attestation was removed; source/unit checks cover owner-scoped private document access and absence of public/presigned URLs. Encryption acceptance is AES256 only, matching the current adapter.
- The isolated no-env build exposed a remaining import-time Policy Intelligence DB guard. That module now reuses the shared lazy DB client, and the database-backed home preview is request-bound, removing build-time DB access without changing runtime query behavior.

### R1 changed files

- `chatbot/lib/production/migration-preflight.ts`
- `chatbot/scripts/db-migration-operator.ts`
- `docker-compose.phase1b.yml`
- `chatbot/lib/db/queries.ts`
- `chatbot/lib/matter-documents/maintenance.ts`
- `chatbot/lib/production/stage3-hardening.test.ts`
- `chatbot/lib/production/s3-security-preflight.ts`
- `chatbot/scripts/s3-security-preflight.ts`
- `chatbot/playwright.stage3.config.ts`
- `chatbot/tests/e2e/phase11-accessibility.test.ts`
- `chatbot/lib/policy-intelligence/server-db.ts`
- `chatbot/app/(chat)/page.tsx`
- `docs/agent-memory/CURRENT_HANDOFF.md`

### Final R1 validation and boundaries

- Focused Stage-3 hardening tests: **16/16 passed**.
- `pnpm test:unit`: **442/442 passed**, zero failed/skipped.
- Focused Biome: **11 files passed**. Focused Ultracite: **10 files passed**; its CLI reports an internal path-resolution diagnostic for `app/(chat)/page.tsx`, which passed Biome.
- Final `pnpm build`: **PASS** on the exact R1 source in an isolated copy with all `.env*` files excluded and `POSTGRES_URL` unset. TypeScript passed and Next generated all 66 pages. An initial isolated attempt was stopped by Turbopack rejecting a dependency symlink outside its root; retry with local dependencies copied inside the temporary root passed. The build did not load `.env.local`.
- Docker/image validation was not attempted after the R1 correction; no in-image native verifier result is claimed. Playwright runtime RBAC was not run because no safe server or owner-provided role fixtures were available.
- No migration was applied and no database was connected. No AWS/S3, OpenAI/provider, official source, SES, Stripe, or other protected runtime service was contacted. No environment file was read or edited.
- Stage 3 R1 source/tooling validation does not complete the later runtime acceptance gates: disposable DB migration/runtime checks, production image and target native verifier, real S3/IAM posture and object access, concrete scanner integration, and authenticated role-matrix execution remain outstanding. Stage 4 has not started.



## P11-009 Stage 3 bounded runtime acceptance

Runtime acceptance started on `phase11-chinese-service-platform-ui-rebase`, HEAD `c72f5ed997ab8055cd5dc5fa3ae8c3e067ebc0e8`, with the existing Stage-3 source work uncommitted. Execution stopped at Gate B after demonstrating a production-image verifier/runtime packaging defect. No source correction was made. Stage 4 has not started.

### Gate A — production image: PASS

- Command: `docker build -f chatbot/Dockerfile.production -t immigration-ai-chatbot:p11-009-stage3-gate-20260930 .`
- `.dockerignore` excludes `**/.env*`; the transferred build context was 2.71 MB. No `.env` file, `POSTGRES_URL`, AWS credential, provider key, SES/Stripe secret, or other protected runtime value was supplied.
- Build completed successfully using the daemon default target platform. Image: `immigration-ai-chatbot:p11-009-stage3-gate-20260930`; image ID `sha256:d25652d34e1fb59e6189ac529f0bd3584f2f0dcdfe989734b3553b7ee567baac`; platform `linux/amd64` (`process.arch` `x64`). Public package-registry downloads were allowed for this build.

### Gate B — in-container native verifier: FAIL; source/runtime correction required

Exact verifier command:

`docker run --rm --network none --entrypoint node immigration-ai-chatbot:p11-009-stage3-gate-20260930 scripts/verify-native-runtime.mjs`

Verifier output:

`{"node":"v22.23.3","platform":"linux","arch":"x64","status":"FAIL"}`

Network-disabled diagnostics isolated the failure:

- `@napi-rs/canvas` loaded and rendered a pixel; alpha was `255`.
- Parser-worker artifact existed and imported successfully.
- The verifier’s `packageVersion("pdfjs-dist")` lookup failed because `require.resolve("pdfjs-dist")` returns `Cannot find module "pdfjs-dist"` in the standalone runtime image. The worker artifact itself loads, but the verifier cannot obtain its version through this package-root lookup.

This is a demonstrated verifier/runtime packaging contract defect. Per the stop condition, no automatic patch was made and no later gate was executed.

### Gate results and stop boundary

| Gate | Result | Evidence / reason |
|---|---|---|
| A — Production image | **PASS** | Image built; ID/platform above. |
| B — In-container native verifier | **FAIL** | `pdfjs-dist` package-version lookup fails in standalone runtime; canvas and parser-worker import succeeded. |
| C — Fresh disposable PostgreSQL migration | **BLOCKED / NOT EXECUTED** | Stopped at Gate B. No database was connected and no disposable DB was created. |
| D — MatterDocument DB runtime | **BLOCKED / NOT EXECUTED** | Stopped at Gate B; no DB or storage service used. |
| E — Migration safety negatives | **BLOCKED / NOT EXECUTED** | Stopped at Gate B; migration operator was not invoked. |
| F — Production startup separation | **BLOCKED / NOT EXECUTED** | Stopped at Gate B; production container service was not started. Static CMD remains `node server.js`. |
| G — Phase1B prepare/start ordering | **BLOCKED / NOT EXECUTED** | Stopped at Gate B; Compose stack was not run. |
| H — S3 fake-preflight runtime | **BLOCKED / NOT EXECUTED** | Stopped at Gate B; no AWS/S3 call was made. Existing source/unit preflight checks are not runtime-gate evidence. |
| I — Authenticated Playwright/RBAC | **BLOCKED / NOT EXECUTED** | Stopped at Gate B; no server or role session was used. |

No normal chatbot, retained P11-008, retained P11-009 Stage-1, staging, or production database was touched. No migration was applied and no disposable database was created. AWS/S3, OpenAI or other live provider, official sources, SES and Stripe were not contacted. No application source was changed. The Docker build used public registry network access only. AWS and staging were not touched.

**Recommendation: Stage 3 correction required.** Correct the verifier/runtime version-discovery contract, then request another bounded runtime acceptance pass. Do not accept Stage 3 or begin Stage 4 from this run. Leave all Stage-3 source changes uncommitted and unpushed.


## P11-009 Stage 3 Runtime Gate-B verifier correction — 2026-09-30

Gate B’s failure was isolated to the verifier calling `require.resolve("pdfjs-dist")` for a package root that is absent in the standalone image. The application parser worker and canvas had already loaded successfully. The correction verifies the parser-worker artifact and imports the actual `pdfjs-dist/legacy/build/pdf.mjs` runtime, checking `getDocument` and the runtime’s exported PDF.js version. **Dockerfile.production was not changed.** The corrected verifier does not relax failures.

Rebuilt image: `immigration-ai-chatbot:p11-009-stage3-gate-20260930-b2`; ID `sha256:4805acf1ccc3849f7ddb88d0949724c23a2cd915d5bd85ab2765d8ebb28e72dc`; platform `linux/amd64`.

Exact `docker run --rm --network none --entrypoint node immigration-ai-chatbot:p11-009-stage3-gate-20260930-b2 scripts/verify-native-runtime.mjs` output:

`{"node":"v22.23.3","platform":"linux","arch":"x64","canvasVersion":"1.0.9","parserWorker":"loaded","pdfJsVersion":"6.3.289","pdfJsApi":"getDocument","status":"PASS"}`

**Gate B: PASS.** No further application-source patch was made after Gate B passed.

### Remaining runtime gates

| Gate | Result | Evidence |
|---|---|---|
| C — fresh disposable PostgreSQL migration | **PASS, with local runner caveat** | Created only `chatbot_p11_009_stage3_gate_20260930_4a1d7c` in a fresh loopback-only `pgvector/pgvector:pg17` container. Preflight identified `127.0.0.1:55440`, the exact target database, missing ledger, and repository head `0023_chief_famine`. Migrations completed through `0023_chief_famine`; acknowledged rerun reported the ledger `current`. The stock `pnpm db:preflight` wrapper failed before connecting under host Node 24 because `tsx` treated the top-level-await script as CommonJS; the unchanged operator logic was run from an ephemeral `.mts` copy with a CommonJS interop import adjustment. Temporary files were removed. The disposable container was stopped and removed after checks. |
| D — MatterDocument DB runtime | **PASS** | Synthetic disposable-only fixture exercised upload persistence with in-memory fake storage, owner-scoped list/get/download, foreign-owner denial, injected fake scanner pending-only/idempotent reconciliation, soft-delete visibility, purge dry-run, and storage-before-metadata purge. Synthetic owner/chat/document rows were removed; final counts were zero. Initial owner cleanup hit the intentional Chat→User FK restriction; dependent conversation/chat rows were then removed before the users. |
| E — migration safety negatives | **PASS** | Missing acknowledgement and intentionally wrong expected database each exited 2 before connection/migration. Focused safety tests also passed for current-database identity and missing/behind/current/unknown ledger resolution; no unknown ledger row was inserted. |
| F — production startup separation | **PASS** | Rebuilt image started Ready with `--network none`, no `POSTGRES_URL`, and no secrets; it remained running until the 10-second timeout. No migration database was reachable. |
| G — Phase1B prepare/start ordering | **PASS (focused assertions)** | Three focused tests passed for the explicit prepare migration job, completed-successfully startup dependency, and migration-free production start. The Phase1B Compose stack was not started, so its existing services/databases were untouched. |
| H — injected/fake S3 preflight | **PASS** | Injected healthy posture passed; missing/unknown posture failed closed with all expected reasons. The harness reported zero AWS calls. |
| I — authenticated Playwright/RBAC | **BLOCKED — owner fixtures absent** | Presence-only check found no customer/admin/lawyer storage states or required consultation/request fixture IDs. No role fixtures were invented and no authenticated E2E session was run. |

The host `127.0.0.1:5432` maintenance-database authentication attempt supplied no password and failed before a database session or SQL query. No normal chatbot, retained P11-008, or retained Stage-1 database was modified. No staging/production database was contacted or modified. No AWS/S3, OpenAI/provider, official-source website, SES, Stripe, or other external runtime service was contacted. Public package registries were used for the production image build. No Phase1B Compose services were started.

**Recommendation:** Gate B is corrected and Gates C–H passed within the documented limits. Keep Stage 3 unaccepted pending valid owner-provided role fixtures for Gate I and the required review/owner checkpoint. Stage 4 has not started. Leave all work uncommitted and unpushed.

## P11-009 Stage 3 runtime closure — stock migration CLI + DB security matrix — 2026-09-30

### Stock migration CLI correction and Gate C

The original operator used top-level `await` in a package without ESM module metadata. Under host Node 24 + `tsx`, that entry was transpiled as CommonJS and failed before database access. Refactored the executable into `async main()` with explicit caught errors and `process.exitCode`; retained acknowledgement, exact configured-target and `current_database()` checks, Drizzle-schema migration ledger lookup, unknown-ledger refusal, and credential-safe errors. The package-wide module system is unchanged. A focused execution regression invokes the stock `pnpm db:preflight` entry with no URL and proves it reaches the expected refusal rather than a transform error.

No ephemeral executable copy or CLI rewrite was used in this closure. The migration and preflight evidence below came from stock repository commands.

Fresh disposable database: `chatbot_p11_009_stage3_cli_gate_20260930_a7d32e`, in a new `--rm` PostgreSQL 17 container bound only to `127.0.0.1:55443`.

- Stock `pnpm db:preflight`: **PASS**. Reported exact target, server `127.0.0.1:55443`, `ledgerLatest:null`, `ledgerStatus:"missing"`, repository head `0023_chief_famine`.
- Stock acknowledged `pnpm db:migrate -- --acknowledge-migrations --expect-database=<exact target>`: **PASS**, completed through `0023_chief_famine`.
- Same stock migration command repeated: **PASS**, idempotent; ledger reported current.
- Final stock preflight: **PASS**, `ledgerLatest:"0023_chief_famine"`, `ledgerStatus:"current"`, repository head `0023_chief_famine`.
- Missing acknowledgement and wrong expected database: each refused with exit 2 before migration. Actual-database mismatch: a localhost-only proxy routed the disposable-target connection to that same disposable container’s `postgres` maintenance database; `current_database()` was confirmed as `postgres`, and the stock migration command refused with exit 1 before ledger/migration work. Unknown-ledger refusal remains covered by deterministic resolver and operator-branch tests; no unknown ledger row was inserted.
- Migration output contained no credential or full connection URL.

### Gate D — clean-only DB-backed security matrix

A temporary synthetic harness used real PostgreSQL persistence, processing claims, AI evidence queries, and lawyer exact-evidence loading/reconstruction. Object storage, scanner, and processor were fakes; no OCR/vision/provider was called. Every fixture was removed, and final document/user/chat counts were zero.

| Case | Result |
|---|---|
| 1. New upload starts `pending` | **PASS** |
| 2. Pending document cannot start via processing service or DB claim | **PASS** |
| 3. Injected scanner CAS transition `pending → clean` | **PASS** |
| 4. Clean document claims processing; fake processor persists complete run/evidence | **PASS** |
| 5. Rejected document cannot start via service or DB claim | **PASS** |
| 6. Failed document cannot start via service or DB claim | **PASS** |
| 7a–c. Pending, rejected, and failed documents denied by AI evidence selection | **PASS each** |
| 8a–c. Pending, rejected, and failed documents denied by lawyer exact-evidence loader | **PASS each** |
| 9. Clean persisted run/evidence enters bounded AI packet with manifest | **PASS** |
| 10. Clean persisted exact run reconstructs lawyer evidence from matching manifest | **PASS** |

### Optional Phase1B runtime and validation

Gate G remains **PASS — focused/static acceptance**: the prepare migration job, `service_completed_successfully` dependency, and migration-free chatbot startup assertions pass. Compose was not started because its existing local services bind shared ports/read local environment configuration; I left existing Phase1B resources untouched.

- `pnpm test:unit`: **443/443 passed, 0 failed, 0 skipped**.
- Focused Stage-3 hardening tests: **17/17 passed**.
- Focused Biome: **PASS**; focused Ultracite: **PASS**.
- `NEXT_TELEMETRY_DISABLED=1 pnpm build`: **PASS** (production build and TypeScript completed).
- Final `git diff --check`: **PASS**.

### Updated runtime gate status

| Gate | Status |
|---|---|
| A — production image | **PASS** (prior evidence retained) |
| B — native runtime verifier | **PASS** (prior corrected image evidence retained) |
| C — stock CLI disposable migration | **PASS** |
| D — clean-only DB-backed matrix | **PASS** |
| E — migration safety negatives | **PASS** |
| F — migration-free production startup | **PASS** (prior evidence retained) |
| G — Phase1B ordering | **PASS, focused/static; Compose not run** |
| H — injected fake S3 preflight | **PASS** (prior evidence retained) |
| I — authenticated Playwright/RBAC | **BLOCKED pending owner-provided role sessions and fixture IDs** |

Normal chatbot, retained P11-008, retained P11-009 Stage-1, staging, and production databases were not contacted or modified. Only the newly created disposable PostgreSQL container was used for migration/runtime DB checks; it was stopped and removed after verification. No AWS/S3, OpenAI/OCR/vision/provider, official-source website, SES, Stripe, or other external runtime service was contacted. No Stage 4 work began.

**Recommendation:** Stock migration tooling and the Gate-D clean-only persistence/evidence matrix now pass. Proceed to the separate owner-fixture Gate-I acceptance task. Keep this worktree uncommitted and unpushed; Stage 4 remains not started.

## P11-009 Stage 3 Gate-I authenticated RBAC/E2E acceptance — 2026-09-30

Gate I was executed against the exact current production image using only a fresh disposable PostgreSQL 17/pgvector environment and synthetic fixtures. No application source, tests, schema, migrations, package files, or checked-in runtime harnesses were changed for this acceptance. Temporary acceptance scripts/configuration were removed.

- Disposable DB: `chatbot_p11_009_stage3_gate_i_20260930_c2e51a`; container `chatbot-p11-009-gate-i-20260930-c2e51a`; initially published on `127.0.0.1:55445`, then attached only to the internal Docker network `chatbot-p11-009-gate-i-20260930-c2e51a` (`172.21.0.2:5432`) for app runtime.
- Production image: `immigration-ai-chatbot:p11-009-stage3-gate-i-20260930`, ID `sha256:06e83e3d2ba11803ad868ffd4729b770c80e52db59a03a96fb5b292efc79a468`.
- Synthetic identities: Customer A, Customer B, Admin, Lawyer A, Lawyer B; all were local `example.test` fixtures with verified status. A shared synthetic password was held only in the temporary fixture.
- Customer A, Admin, and Lawyer A authenticated through `/login` using the real Credentials provider. Each reached its role redirect, had its role confirmed from `/api/auth/session`, and retained the session after reload. Temporary storage states were `/tmp/p11_009_stage3_gate_i_20260930_c2e51a/{customer,admin,lawyer}.json`; all were deleted after acceptance.
- Customer: workspace, client portal, consultation list, and owned consultation detail rendered. Admin/lawyer routes redirected away. Customer B consultation detail returned API 404 and exposed none of the synthetic protected detail text.
- Admin: admin workspace, consultation queue, and Customer A consultation detail rendered. Lawyer routes redirected to the admin portal; customer-only consultation routes settled back to the admin portal.
- Lawyer A: lawyer workspace, assigned request, consultation queue, and assigned consultation rendered. Admin routes did not grant admin access; customer-only consultation routes settled back to the lawyer portal. Lawyer B request returned API 403 and consultation returned API 404; no protected synthetic detail text was exposed.
- Locale switching and reload persistence passed on the customer client portal, admin consultation detail, and lawyer request detail.
- Desktop `1440×900` and mobile `390×844` checks passed without horizontal overflow on the customer consultation detail, admin consultation detail, and lawyer assigned-request detail. Six bounded screenshots are retained under `/tmp/p11_009_stage3_gate_i_20260930_c2e51a/screenshots/`.
- Accessibility smoke passed on customer consultation detail and admin consultation detail. It failed on the customer AI workspace (2 nested `main` landmarks, 2 visible unnamed interactive controls, and 1 visible unlabeled textarea) and lawyer assigned-request detail (1 visible unlabeled textarea). These are concrete UI accessibility findings; no source patch was made.
- Existing Stage-3 Playwright suite, with the temporary localhost-certificate trust configuration, reported **19 passed, 9 failed**. Failures included accessibility/landmark assertions and route-transition assertions. Follow-up settled-route/API checks confirmed the customer ownership and lawyer assignment denial outcomes above.
- Browser request interception blocked one attempted request to `cdn.jsdelivr.net`; the request was not sent. The tested pages still rendered. The app container had no external network route. No OpenAI/provider, official-source website, AWS/S3, SES, Stripe, staging, production, normal chatbot DB, retained P11-008 DB, or retained P11-009 Stage-1 DB was contacted or modified.

**Gate I: FAIL — accessibility acceptance did not pass. P11-009 Stage 3 is not accepted by this run.** Stop for a separately authorized, bounded accessibility correction/review before claiming Stage 3 acceptance. **P11-005 remains NOT VERIFIED; D-040 is NOT fully closed; Stage 4 has NOT STARTED.**

The app and disposable DB containers were stopped and removed, the temporary Docker network and loopback proxies were removed/stopped, and storage states, fixture/password file, private key, test logs, traces, and temporary scripts were deleted. Only the six bounded screenshots remain under `/tmp`. The Stage-3 worktree remains uncommitted and unpushed.

## P11-009 Stage 3 final Gate-I accessibility closure — 2026-09-30

The four previously observed accessibility defect categories have been corrected in this uncommitted/unpushed worktree:

- Customer AI Workspace nested `main`: `chatbot/app/(chat)/ai-workspace/page.tsx` now uses a non-landmark `div` around its workspace content. The enclosing `ChatRouteShell`/`SidebarInset` remains the single page-level `main`.
- Two icon-only AI Workspace controls: `chatbot/components/app-sidebar.tsx` gives the trash action the accessible name “Delete all consultations” and the plus action “Start a new consultation”.
- AI Workspace question textarea: `chatbot/components/immigration-ai-workspace.tsx` now uses the existing localized consultation placeholder copy as its accessible name; form behavior and submitted values are unchanged.
- Lawyer assigned-request feedback textarea: `chatbot/components/lawyer-workspace/detail-disposition.tsx` now has a localized accessible name (“Reasoning and research approach feedback” / “推理与研究方法反馈”); form behavior and submitted values are unchanged.

`chatbot/tests/e2e/phase11-accessibility.test.ts` adds targeted assertions for the two pages, named controls, textarea names, focus, and one `main`. Its denial helper now waits for route settlement, checks the final redirect/status, then checks the protected GET API returns 403 without protected data. `/ai-workspace` was added to the accepted settled redirect destinations for the admin-only consultation route. The denial assertion was not weakened.

### Deterministic validation

- `pnpm test:unit`: **443/443 passed, 0 failed, 0 skipped**.
- `NEXT_TELEMETRY_DISABLED=1 pnpm build`: **PASS**.
- Focused Biome on all five changed source/test files: **PASS**, no fixes required.
- Focused Ultracite on the four directly addressable files plus the AI Workspace page via a temporary symlink: **PASS**; symlink removed.
- `git diff --check`: **PASS** after this entry was appended.

### Targeted runtime status and screenshot reconciliation

The required targeted authenticated runtime rerun was **not performed**. The prior Gate-I disposable runtime, auth states, and database are gone. `docker ps -a` showed no retained P11-009 Gate-I container or network. Creating a fresh authenticated runtime would require applying migrations; this task explicitly says not to rerun migrations. I did not create a database, apply migrations, use real identities, or introduce an auth bypass. As a result, the two-page accessibility assertions, false-negative route-transition assertions, and desktop/mobile overflow smoke have no new runtime result from this final correction cycle. No new unrelated runtime issue was observed because that rerun could not be performed.

The screenshot path `/tmp/p11_009_stage3_gate_i_20260930_c2e51a/screenshots/` is **absent**; the parent directory exists but contains no screenshots. No screenshots were recreated. The earlier handoff statement that six screenshots remained was inaccurate at this check.

No external service was contacted in this correction cycle. The prior Gate-I run recorded that its attempted `cdn.jsdelivr.net` request was intercepted before sending and that the app runtime was isolated from external networking; that prior result is unchanged. No migration, normal chatbot DB, retained P11-008 DB, Stage-1 disposable DB, staging/production DB, AWS/S3, OpenAI/provider, official-source site, SES, or Stripe was contacted by this correction cycle.

**Recommendation: STOP FOR OWNER REVIEW. Stage 3 is not accepted by this final correction cycle because the required targeted runtime accessibility, route-transition, and desktop/mobile checks could not be rerun under the explicit no-migrations boundary. P11-005 remains NOT VERIFIED; D-040 is NOT fully closed; Stage 4 has NOT STARTED.** Keep all work uncommitted and unpushed.

## P11-009 Stage 3 final targeted Gate-I runtime acceptance — 2026-09-30

### Disposable runtime setup

This acceptance used the explicitly authorized fresh disposable environment only:

- PostgreSQL container: `chatbot-p11-009-gate-i-final-90acb8`.
- Database: `chatbot_p11_009_stage3_gate_i_final_90acb8`, initially exposed only on `127.0.0.1:55447` and then reached by the host through its private internal-Docker address `172.21.0.2:5432` because Docker internal networking did not expose the published loopback port.
- Stock `pnpm db:preflight`: **PASS**, exact target, initially missing ledger, repository head `0023_chief_famine`.
- Stock acknowledged migration through current head: **PASS**. Final stock preflight: **PASS**, ledger `0023_chief_famine`, status `current`.
- Rebuilt exact-worktree production image: `immigration-ai-chatbot:p11-009-stage3-gate-i-final-20260930-90acb8`, image ID `sha256:deb0fcb26e13d678d5dc4da947a7192b2f5f0b2be8cb886bc15414eb78e12c41`.
- The app container was attached only to the internal Docker network. Browser traffic was routed through a temporary localhost HTTPS proxy, with Playwright configured to abort every browser request outside `https://localhost:3006`.

Five synthetic `@example.test` identities were created with repository-compatible bcrypt hashes and verified timestamps: Customer A, Customer B, Admin, Lawyer A, and Lawyer B. Minimal disposable rows comprised one Customer A chat, two assigned lawyer requests, and one Customer B consultation assigned to Lawyer B. No real data or legal content was used.

Customer A and Lawyer A both completed the real `/login` Credentials-provider flow. Their `/api/auth/session` roles and IDs matched the synthetic accounts, and both sessions remained valid after reload. No cookies or tokens were forged. Temporary credentials, fixtures, storage states, proxy certificate, and harness scripts were held under `/tmp` or temporary untracked files and deleted during cleanup.

### Targeted result and stop boundary

The first Customer A `/ai-workspace` check confirmed exactly one visible `main`. The next assertion failed: the temporary Playwright harness expected the visible button named **“Delete all consultations”**, but `getByRole('button', { name: 'Delete all consultations' })` found no matching element and timed out at `toBeVisible()`. Customer A was authenticated, the role/session had been verified after reload, and the page main was visible. No further page, route-transition, lawyer-detail, or viewport checks were run after this known-correction failure, as required by the anti-loop rule. No source or checked-in test was changed in this acceptance task.

This is an apparent product-surface acceptance failure: the authenticated target page rendered, but the expected control was absent from its accessible DOM. The run stopped before establishing whether a page composition/fixture precondition explains the absence, so that distinction requires owner review. It is not evidence that the control was present with a wrong accessible name.

- AI Workspace textarea and the second icon control: **NOT REACHED**.
- Lawyer assigned-request detail accessibility: **NOT RUN**.
- Previously false-negative ownership/assignment/role route assertions: **NOT RUN**.
- Desktop/mobile overflow smoke on either page: **NOT RUN**.
- No new unrelated issue was assessed; the run stopped at the first known correction failure.
- No screenshots were captured.

### Network and cleanup

The app had no external network route, and the browser guard allowed only the localhost origin; protected external services were not contacted. The Playwright script stopped before reporting the count of any blocked browser host attempts, so no blocked-host count is claimed. No AI question was sent and no lawyer feedback was submitted.

The app and PostgreSQL containers and their internal Docker network were removed. The temporary HTTPS proxy was stopped. Synthetic fixture/password files, storage states, certificate/key, and temporary runner/seeder scripts were removed. The rebuilt image remains local as non-sensitive evidence of the tested artifact. No normal chatbot, P11-008, Stage-1, staging, or production database was contacted or modified.

**Gate I final targeted rerun: FAIL — stopped at the missing “Delete all consultations” control. Recommendation: STOP FOR OWNER REVIEW. P11-009 Stage 3 is not accepted. P11-005 remains NOT VERIFIED; D-040 is NOT fully closed; Stage 4 has NOT STARTED.** Keep all work uncommitted and unpushed.


## P11-009 Stage 3 accepted / Stage 4 activated — 2026-09-30

**Stage 3 accepted checkpoint:** `e3b42c2004054da1eb3a6fd81c9f21dccdeb6b75` (`feat: complete P11-009 stage 3 production hardening`).

Direct GitHub review confirmed that the pushed checkpoint contains the reviewed Stage-3 hardening mechanisms and the bounded Gate-I accessibility correction. The branch tip and remote ref both matched `e3b42c2004054da1eb3a6fd81c9f21dccdeb6b75`; the commit had no attached GitHub status checks.

Acceptance is based on the combined evidence accumulated during Stage 3:

- Gates A–H passed: production image build, in-container native canvas/PDF.js verifier, stock migration/preflight tooling on fresh disposable PostgreSQL, clean-only MatterDocument DB-backed security matrix, migration safety negatives, migration-free production startup, focused Phase1B ordering assertions, and injected/fake S3 security preflight.
- The first authenticated Gate-I run used real Credentials-provider sessions and established customer/admin/lawyer RBAC, session persistence, cross-customer ownership denial, cross-lawyer assignment denial, locale switching/persistence, representative desktop/mobile no-overflow behavior, and outbound-network blocking. Its remaining blocker was the bounded accessibility defect set.
- The accessibility correction at the accepted checkpoint removes the nested AI-Workspace `main`, adds accessible names to the two icon-only sidebar controls, labels the AI-Workspace textarea, and labels the lawyer reasoning/research-feedback textarea. Unit tests remained **443/443**, production build passed, focused Biome/Ultracite passed, and `git diff --check` passed before commit.
- The final automated targeted rerun stopped because its temporary harness did not find the visible “Delete all consultations” control. That run did not establish a product regression. Owner browser verification on the current local checkpoint subsequently confirmed `/ai-workspace` has exactly one `main`; “Delete all consultations” and “Start a new consultation” are visible with the expected accessible names; the AI-Workspace textarea is visible with a localized accessible name; and, under a real lawyer-role session, the target reasoning/research-feedback textarea is visible with the localized accessible name. Source review also confirms the other visible lawyer-response/corrected-answer textareas are implicitly labelled by their enclosing `<label>` elements.
- The temporary Playwright harness therefore remains somewhat brittle around page/sidebar settlement, but no unresolved Stage-3 product defect is established by that false-negative. Do not start another micro-fix loop for this harness unless a future staging run reproduces a real product failure.

**P11-009 Stage 3: ACCEPTED.**

This acceptance does **not** close D-040 and does **not** mark P11-005 VERIFIED. Environment-specific proof still belongs to Stage 4: actual staging migration to the then-current migration head, actual ECS/Fargate architecture and exact-image native verification, real private-S3/IAM/BPA/encryption evidence, concrete malware-scanner configuration/reconciliation, exact deployed-image/rollback evidence, and staging live Policy Intelligence scheduling/sync acceptance.

### Stage 4 next gate — read-only staging reconnaissance

Stage 4 is now active, but the next execution unit is deliberately **read-only**. Before any AWS mutation, migration, deployment, scheduler change, or scanner configuration, inspect the authoritative staging topology and produce an exact mutation/rollback plan.

The read-only gate must identify, without inferring from local Compose:

- AWS account/region and staging ECS/Fargate cluster, services, task definitions, CPU architecture and currently deployed image digests;
- staging ECR repositories/images relevant to chatbot/legal-service;
- staging database service/endpoint identity and current migration state when it can be inspected safely read-only;
- MatterDocument S3 bucket region, encryption, Block Public Access, bucket-policy/public posture, and effective application task role/policies;
- any existing malware-scanning integration/configuration;
- any existing EventBridge/EventBridge Scheduler/other schedule for Policy Intelligence sync;
- staging ALB/domain/routing topology needed for exact acceptance;
- current rollback anchors.

This gate authorizes **no mutation**: no service update, task-definition registration, image push, database migration, S3/IAM/policy change, scheduler creation/update, scanner enablement, DNS/routing change, or deployment. If credentials/topology are unavailable, stop and report rather than guessing.

After read-only reconnaissance, return for owner review before Stage-4 mutation/deployment.

## P11-009 Stage 4A read-only staging reconnaissance — corrected authoritative AWS scope

**Authoritative result:** reconnaissance was repeated only in the owner-confirmed staging profile/account/region below. The previous Stage 4A reconnaissance used the default account `804448482941`; its conclusions are **discarded** and must not be used for staging decisions. This entry supersedes that result. No AWS or database resource was modified. Stage 4B was not started.

### Startup and identity

- Repository: `jiangdizhao/immigration_ai`.
- Starting branch: `phase11-chinese-service-platform-ui-rebase`.
- Starting HEAD: `f5605b0e336fe7eb75326a18cf64c2e53dd4a3d9`.
- Starting worktree: clean.
- AWS profile: `aulawyers-staging`.
- AWS account: `747452892291`; caller `arn:aws:iam::747452892291:user/immigration-ai-deployer`.
- AWS region: `ap-southeast-2`.
- Every AWS query in this corrected reconnaissance was scoped to that profile/account/region, except Route 53's global hosted-zone read and the read-only DNS lookup of the verified staging hostname.

### ECS/Fargate topology and deployed image identity

- Cluster `immigration-ai-staging`, ARN `arn:aws:ecs:ap-southeast-2:747452892291:cluster/immigration-ai-staging`: `ACTIVE`; 1 active service, 0 registered EC2 container instances, 1 running task, 0 pending. Cluster default capacity provider is `FARGATE`, weight 1.
- Service `immigration-ai-staging-web`: `ACTIVE`, desired/running/pending `1/1/0`, launch type `FARGATE`, platform `1.4.0`, network mode `awsvpc`, public IP assignment enabled. Current task definition is `arn:aws:ecs:ap-southeast-2:747452892291:task-definition/immigration-ai-staging-web:30`. Deployment strategy is rolling, `maximumPercent=200`, `minimumHealthyPercent=100`; deployment circuit breaker and automatic rollback are disabled. The primary deployment is completed.
- Task definition revision 30 sets `cpu=1024`, `memory=2048`, `runtimePlatform=LINUX/X86_64`. It has two containers:
  - `chatbot`: `747452892291.dkr.ecr.ap-southeast-2.amazonaws.com/immigration-ai/chatbot:e6c44f2-phase10-fast-202609090800`, port 3000.
  - `legal-service`: `747452892291.dkr.ecr.ap-southeast-2.amazonaws.com/immigration-ai/legal-service:3b36532-phase10-2-fast-uncapped-202609110538`, port 8000.
- The running task confirms deployed digests:
  - Chatbot: `sha256:fcb3a6078ebfaf820ab1b0b91ea0c59d5f18954827533579648daf87e4c35c16`.
  - Legal Service: `sha256:3f53702199becae880f3e03c2410f5b3017fbcf1aa160d52151807b40030cc58`.
- These are exact rollback image anchors, but their Phase-10 tags predate the accepted P11-009 source. ECR `describe-images` reported Docker schema-2 manifests and recent tags; it did not expose architecture metadata. The deployed ECS task runtime itself is explicitly `X86_64`/Linux. Stage-3's local production image/native-verifier evidence was also x86_64, but it is not either deployed digest and therefore does not prove native verification of these staging images.
- Neither container defines an ECS container health check; ECS container health is `UNKNOWN`. The chatbot ALB target is separately healthy.
- Task and execution roles: `arn:aws:iam::747452892291:role/immigration-ai-staging-ecs-task-role` and `arn:aws:iam::747452892291:role/immigration-ai-staging-ecs-execution-role`.
- Environment-variable names were inspected without values. The chatbot task definition does not set `MATTER_DOCUMENTS_S3_BUCKET`; it also has no secret reference with that name. It does include `AWS_REGION`, `LEGAL_SERVICE_URL`, `APP_BASE_URL`, and other application settings. Secret references were limited to reference names/ARNs, never values. Chatbot references include `AUTH_SECRET`, `LAWYER_REVIEW_ASSERTION_SECRET`, `LAWYER_REVIEW_TOKEN`, `LEGAL_SERVICE_API_KEY`, `POSTGRES_URL`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`. Notably, the two Stripe references point to SSM parameter names under `/immigration-ai/production/chatbot/` despite this being the staging task. Legal Service references include `DATABASE_URL`, `LAWYER_REVIEW_ASSERTION_SECRET`, `LEGAL_SERVICE_API_KEY`, and `OPENAI_API_KEY`. No referenced value was fetched.
- The two ECR repositories exist in `ap-southeast-2`: `immigration-ai/chatbot` and `immigration-ai/legal-service`. For each, the deployed tag/digest was also the newest image in the inspected recent image metadata. No image was pushed, tagged or deleted.

### RDS and migration status

- RDS is a PostgreSQL instance, not Aurora: `immigration-ai-staging-postgres`, endpoint `immigration-ai-staging-postgres.ctkuiomwqo61.ap-southeast-2.rds.amazonaws.com:5432`, engine version `18.3`, AZ `ap-southeast-2c`, instance class `db.t4g.micro`, gp3 20 GiB.
- VPC `vpc-04c15c51747904e9a`; DB subnet group spans `subnet-020c9fa83beff2e52`, `subnet-0a501eeb320072fae`, and `subnet-05a1fd04555a84d62`. DB security group: `sg-0bbd25e2fdc9ded8b` (`immigration-ai-staging-rds-sg`). Its port-5432 ingress references security groups `sg-0223d743f5721b006` and `sg-0e32ee9fb1b6b5ea3`; no IPv4 CIDR ingress was returned. The ECS service uses `sg-0223d743f5721b006` (`immigration-ai-staging-chatbot-sg`).
- RDS reports `available`, automated backup retention 3 days, latest restorable time `2026-09-30T21:58:00Z`, and deletion protection disabled. **Storage encryption is disabled and `PubliclyAccessible=true`**. The observed security-group ingress is source-security-group based, not an unrestricted CIDR rule; the public-access flag nevertheless needs explicit owner/security review before migration/deployment decisions.
- Five recent automated snapshots were available (2026-09-26 through 2026-09-30); the latest is `rds:immigration-ai-staging-postgres-2026-09-30-16-01`. The inspected automated snapshots are unencrypted. Three older manual snapshots were also available and unencrypted: `immigration-ai-staging-pre-overwrite-20260827-170456`, `immigration-ai-staging-pre-phase8-20260829-191605`, and `immigration-ai-staging-pre-phase9-20260905-091611`. No snapshot was created.
- The task definition references the SSM parameter name for chatbot `POSTGRES_URL`, but this task did not retrieve its value. There was no approved local secure injection path available that avoids reading the secret value, so no DB connection or stock preflight was attempted. **STAGING DB LEDGER — PENDING FOR STAGE 4B PREFLIGHT.** Repository migration head is `0023_chief_famine`; staging ledger/current database identity remains unverified.

### MatterDocument S3 and task-role IAM

- The application storage source requires `MATTER_DOCUMENTS_S3_BUCKET`, but the deployed chatbot task definition does not configure that environment name or a corresponding secret reference. Consequently no actual MatterDocument bucket can be traced from the deployed task configuration; no bucket was guessed, and no bucket/object API was called.
- Task role `immigration-ai-staging-ecs-task-role` has no attached managed policies and one inline policy, `ImmigrationAiSesTransactionalEmail`. Its only statements allow `ses:SendEmail` and `ses:SendRawEmail`, constrained by the SES FromAddress. No MatterDocument S3 permission appears in the inspected role policy. Static S3 access is therefore **MISSING**, and effective access was not tested.
- Bucket region, encryption, Block Public Access, public-policy status, versioning, ownership, lifecycle, and public-URL behavior are **UNKNOWN** because the bucket is not configured in the actual task definition. No customer objects were listed or accessed.

### Malware scanning and Policy Intelligence schedule

- **NO CONCRETE SCANNER CONFIG FOUND.** In `ap-southeast-2`, GuardDuty returned no detector and no Malware Protection for S3 plan; EventBridge returned no rules and only the default event bus; Lambda and Step Functions inventories were empty. EventBridge Scheduler has only its default group and no schedules. With no configured MatterDocument bucket, bucket notifications could not be traced. No scanner was configured.
- **No Policy Intelligence schedule found.** Scheduler returned no schedules; EventBridge rules, Lambda functions and Step Functions state machines were empty; the ECS cluster has only the web service, with no scheduled task discovered. No target, schedule expression, schedule role or sync execution exists to roll back.
- The production Dockerfile builds a Next standalone web image with `CMD ["node", "server.js"]`; it does not explicitly copy the `scripts/policy-sync.ts` operator entry point or its `tsx` runner into the runtime stage. A dedicated, validated operator image/entry point is needed before a schedule target can be specified safely.

### ALB, DNS and routing

- Internet-facing active ALB: `immigration-ai-staging-alb`, DNS `immigration-ai-staging-alb-1443333259.ap-southeast-2.elb.amazonaws.com`, VPC `vpc-04c15c51747904e9a`.
- Listener port 80 redirects HTTP to HTTPS 443 (301). Listener 443 terminates TLS with issued ACM certificate `b903b9d5-ba4e-4ca0-83ff-ac1f20577d5d` for `staging.aulawyers.au`. The hostname resolved read-only to the ALB DNS name/IPs. No Route 53 hosted zone exists in this account, so DNS appears externally managed; no DNS change is proposed.
- The HTTPS listener has a default forward (no host/path conditions) to target group `iai-stg-chatbot-tg`, ARN `arn:aws:elasticloadbalancing:ap-southeast-2:747452892291:targetgroup/iai-stg-chatbot-tg/c7b894dce6c9b5aa`. It targets IP port 3000, HTTP health path `/ping`, expected code 200; the current target is healthy. The listener/target group exposes the chatbot only. Legal Service runs as a second container in the same task; no separate public Legal Service target group/rule was found.

### Rollback anchors

- ECS cluster/service: `immigration-ai-staging` / `immigration-ai-staging-web`; desired/running `1/1`.
- Prior task definition: `immigration-ai-staging-web:30`.
- Prior chatbot image digest: `sha256:fcb3a6078ebfaf820ab1b0b91ea0c59d5f18954827533579648daf87e4c35c16`.
- Prior Legal Service image digest: `sha256:3f53702199becae880f3e03c2410f5b3017fbcf1aa160d52151807b40030cc58`.
- ALB HTTPS listener currently forwards to `iai-stg-chatbot-tg`; target health is healthy. HTTP redirects to HTTPS.
- RDS backup posture: 3-day retention, latest restorable time above, latest listed automated snapshot `rds:immigration-ai-staging-postgres-2026-09-30-16-01` (available, unencrypted). Existing RDS is not encrypted and publicly accessible; owner must decide whether that backup posture is adequate before a migration gate.
- No S3 bucket, scanner, scheduler or schedule target exists in the inspected task/configuration inventory to serve as a rollback anchor.

### Stage 4 gap matrix

| Requirement | Observed state | Status | Exact proposed Stage-4B action |
|---|---|---|---|
| Production chatbot image | Deployed Phase-10 tag/digest above; branch source is newer | Missing current-source image | Build the reviewed source for Linux x86_64, run the in-image native verifier, then push an immutable commit-tagged image to `immigration-ai/chatbot` only after separate Stage-4B authorization. |
| Production Legal Service image | Deployed Phase-10 tag/digest above in same task | Unknown whether source delta requires rebuild | Compare accepted source to this digest's release; retain it if unchanged, otherwise build/test/push a matching immutable image to `immigration-ai/legal-service`. |
| ECS CPU architecture | Fargate `LINUX/X86_64` | Ready as a deployment constraint | Build all replacement images for x86_64 and preserve this runtime platform in the replacement task definition. |
| `@napi-rs/canvas` verifier | Stage-3 verifier passed on a local x86_64 image, not these ECR digests | Unknown for deployed image | Run the verifier against the exact candidate chatbot image/digest before deployment. |
| Migration 0023/current head | Repository head 0023; staging DB ledger not checked | Pending | Use only an already-approved secure injection path; run stock read-only preflight and confirm exact database/server identity and ledger before any separately authorized migration. |
| MatterDocument private S3 | Required bucket env is absent; bucket cannot be identified | Missing configuration / unknown bucket | Owner must identify an existing bucket or approve a new staging bucket. Then set `MATTER_DOCUMENTS_S3_BUCKET` and run read-only posture checks before use. |
| S3 encryption | Target bucket unknown | Unknown | Verify default encryption on the owner-confirmed bucket; meet the existing preflight's accepted encryption policy before use. |
| S3 Block Public Access | Target bucket unknown | Unknown | Verify all bucket-level BPA flags and policy posture; obtain separate approval for any corrective change. |
| IAM access | Task role has only SES inline permissions; no S3 policy | Missing static S3 permissions | After bucket confirmation, add only the reviewed least-privilege object actions scoped to that bucket on `immigration-ai-staging-ecs-task-role`; prove runtime access later in Stage 4C. |
| Malware scanner | No GuardDuty detector/plan or connected scanner path found | Missing | Owner must select/approve a concrete scanner and event/reconciliation design; then verify digest-bound fail-closed `securityStatus` reconciliation before enabling document processing. |
| Scanner → `securityStatus` | No scanner event path found | Missing | Implement/configure the approved event-to-reconciliation path and test idempotent clean/rejected/failed handling in the authorized acceptance gate. |
| Policy Intelligence operator sync | No sync task; current production web image does not explicitly package its operator script/runner | Missing | Build and validate a dedicated operator artifact/entry point from the reviewed chatbot source; keep it separate from the web service runtime. |
| Policy Intelligence scheduler | No schedule/rule/Lambda target found | Missing | After the operator artifact is validated, create the separately approved EventBridge Scheduler target for a one-off Fargate task in `immigration-ai-staging`; cadence, non-overlap and failure policy require owner input. |
| Staging routing | HTTPS hostname resolves to ALB; listener and chatbot target are healthy; no public Legal Service route | Ready for current chatbot path; Legal Service external route unknown/not found | Preserve current HTTPS listener/default chatbot target unless approved acceptance requires a change; owner must specify if Legal Service needs a separate public endpoint. |
| Rollback readiness | Task definition/digests, healthy target and an RDS snapshot are recorded; DB snapshot is unencrypted and DB is public | Partial | Capture fresh approved rollback anchors before rollout; owner must resolve DB backup/security adequacy. Roll back ECS to task definition `immigration-ai-staging-web:30` and the two exact digests above if application health fails. |

### Proposed Stage 4B plan — not executed

**ALREADY CORRECT — NO CHANGE**

- Preserve cluster `immigration-ai-staging`, service `immigration-ai-staging-web`, Fargate `LINUX/X86_64`, the working ALB TLS redirect/listener, `staging.aulawyers.au` mapping, and healthy chatbot target unless an approved test demonstrates a specific defect.
- Treat task definition revision 30 and the two running image digests as rollback anchors. Keep Legal Service on its current digest if source review confirms it has no required change.
- Do not alter Route 53; no hosted zone is present in this account and the verified hostname already resolves to the ALB.

**MUTATION REQUIRED — only after separate Stage-4B authorization**

1. Resolve the DB posture/backup decision first. Use the existing `immigration-ai-staging-postgres` and its secure secret references only after owner review of `PubliclyAccessible=true`, storage encryption disabled, deletion protection disabled and unencrypted snapshots. Establish a secure preflight path, confirm `current_database()` and the ledger through 0023, and obtain an approved backup/recovery plan before a migration. Do not assume the unencrypted snapshot is an acceptable recovery point.
2. Identify or approve the exact staging MatterDocument bucket; configure `MATTER_DOCUMENTS_S3_BUCKET`, private access, approved default encryption, versioning/ownership/lifecycle posture, and least-privilege S3 statements on `immigration-ai-staging-ecs-task-role`. The bucket name and any required bucket mutation remain unresolved, so no exact bucket ARN can yet be specified.
3. Obtain approval for scanner selection. If GuardDuty Malware Protection for S3 is selected, scope it to the confirmed bucket and build the approved notification/reconciliation path; no scanner choice or setup is pre-authorized here.
4. Build the reviewed chatbot source for `linux/amd64` and tag the candidate immutably as `f5605b0e3-p11-009-stage4b-20261001` in `747452892291.dkr.ecr.ap-southeast-2.amazonaws.com/immigration-ai/chatbot`. Record the resulting digest and pass `scripts/verify-native-runtime.mjs` inside that exact image with networking disabled. Rebuild/tag the Legal Service image in `immigration-ai/legal-service` only if source review shows its current deployed digest is stale for this release.
5. After DB preflight and its separate migration authorization, apply stock migrations only to database `immigration-ai-staging-postgres`, stopping unless its safe identity and ledger match the approved plan. Then register a new revision of `immigration-ai-staging-web` based on revision 30, preserving Fargate x86_64, sidecar composition, network settings and secret references while replacing only approved image digests/configuration. Before update, verify the current revision is still 30; do not assume revision 31 if another deployment has advanced it.
6. Update only service `immigration-ai-staging-web`; verify deployment completion, ECS task health, ALB target health on `/ping`, TLS endpoint, login/RBAC, Policy Intelligence reads and approved MatterDocument scanner lifecycle. Retain the existing ALB listener/target group unless an explicit routing requirement is approved.
7. Build a dedicated sync operator artifact because the production standalone web image does not explicitly package `scripts/policy-sync.ts`/`tsx`. After owner-approved cadence, overlap/failure behavior, secret references and egress are defined, create a schedule tentatively named `immigration-ai-staging-policy-sync` targeting a one-off Fargate task in cluster `immigration-ai-staging`; use a dedicated task definition/family and least-privilege scheduler role rather than running sync in the web service. No schedule expression or bucket/source secret values are inferred.

**Rollback order:** disable only the newly approved sync schedule first; restore service `immigration-ai-staging-web` to the captured pre-deployment task definition `immigration-ai-staging-web:30` with chatbot digest `sha256:fcb3a6078ebfaf820ab1b0b91ea0c59d5f18954827533579648daf87e4c35c16` and Legal Service digest `sha256:3f53702199becae880f3e03c2410f5b3017fbcf1aa160d52151807b40030cc58`; confirm `/ping` target health and staging login. Restore any separately changed listener target only from its captured value. Do not roll back database schema by improvisation; use only a separately reviewed DB recovery/forward-fix plan. Preserve the bucket and IAM policy for diagnosis until an approved cleanup decision.

**UNKNOWN — OWNER INPUT REQUIRED**

- Whether the production-namespace Stripe SSM references in the staging task definition are intentional; whether the publicly accessible, unencrypted RDS instance and unencrypted snapshots are acceptable or require a separately designed secure cutover.
- The actual MatterDocument bucket name (no bucket setting/reference exists in task definition), desired versioning/lifecycle posture, and approved scanner/provider/event design.
- Whether Legal Service needs an external endpoint; current evidence shows only an internal sidecar and chatbot public route.
- Policy sync cadence, accepted source set, live-provider authorization, no-overlap/failure policy, operator task IAM/network egress, and the dedicated sync image/task definition.
- Any change to listener routing or ECS deployment-circuit-breaker policy.

The automatic reviewer rejected one initial Scheduler query because requesting the complete target object could expose inline `Input` or secret-bearing configuration. A safer metadata-only Scheduler query returned no schedules; no target payload was retrieved. No secret values were read. No AWS/database mutation, migration, image push, task-definition registration, ECS update, S3/IAM/scanner/scheduler/routing change, or policy sync occurred. `git diff --check` passed after this append; stop with this handoff change uncommitted and unpushed.

## P11-009 Stage 4B-0 deployment decision closure

### Scope and decision status

Read-only AWS reconnaissance was scoped to account `747452892291` (`aulawyers-staging`) in `ap-southeast-2`. No AWS configuration was changed, no DB connection or migration was attempted, no secret values were read, and no live Policy Intelligence sync or external provider/source request was made. No deployment was performed.

### A. Database security and migration readiness

The staging PostgreSQL 18.3 instance `immigration-ai-staging-postgres` is a single-AZ `db.t4g.micro`, 20 GiB gp3, in `ap-southeast-2c`. It is publicly addressable and the VPC's only subnets have an Internet Gateway route; however, the observed database security group permits port 5432 only from the chatbot and Legal Service security groups. Public DNS/routing exists, but arbitrary Internet DB ingress was not demonstrated and is denied by those ingress rules. The VPC currently has no private subnets or NAT gateway. RDS storage and inspected snapshots are unencrypted; deletion protection and Multi-AZ are off; backup retention is three days. No database login was made.

**Recommendation: Option B, encrypted snapshot-copy and restore to a new private staging RDS instance.** RDS cannot enable storage encryption in place. Candidate names (proposals only): `immigration-ai-staging-postgres-secure`, `immigration-ai-staging-db-private-subnet-group`, and `immigration-ai-staging-postgres-private-sg`. Create private subnets across at least two AZs with local-only routing, restrict DB 5432 to application/operator task security groups, and enable deletion protection plus an owner-approved backup policy. Use AWS-managed `aws/rds` unless the owner requires a customer-managed key. Quiesce writes for the final snapshot and cutover. Keep the old DB unchanged as rollback; writes resumed on the replacement will not be present on the old DB, so keep writes paused through acceptance or explicitly account for this data gap.

Option A, disabling public accessibility and tightening ingress/protection on the current DB, is a lower-change fallback but leaves data and snapshots unencrypted and retains public-subnet placement; accept only under a time-bounded owner waiver. Option C, replication to reduce downtime, adds complexity without a staging zero-downtime requirement.

**DB LEDGER REQUIRES CONTROLLED STAGE-4B-1 PREFLIGHT.** Repository migration head is `0023_chief_famine`. Parameter names inspected only: `/immigration-ai/staging/chatbot/postgres-url` and `/immigration-ai/staging/legal-service/database-url`. The existing lawyer-review export helper decrypts a parameter into a persistent plaintext file and must not be used. Stage 4B-1 should use an in-memory wrapper: capture SSM output without printing, retrieve only the exact chatbot `POSTGRES_URL`, verify its hostname against the expected RDS endpoint, and inject it directly into the `pnpm db:preflight` child environment. Never write/log the value or use shell expansion. `db:preflight --preflight` performs read-only ledger inspection and emits sanitized DB/server/ledger status. Preflight the source before snapshot and the restored target before migration. Migrate the accepted replacement only if its ledger is behind, using the controlled migration procedure; never migrate the source DB as part of this cutover.

### B. Stripe staging references

The current staging chatbot task definition references production-namespaced parameters `/immigration-ai/production/chatbot/stripe-secret-key` and `/immigration-ai/production/chatbot/stripe-webhook-secret`, while separate staging-namespaced SecureStrings exist. Classification: **LIKELY STAGING MISCONFIGURATION**. Values and credential mode were not read and must not be inferred from parameter names. The owner must confirm the intended nonproduction parameter pair before a later authorized staging reference change. No references were changed.

### C. MatterDocument storage

The account returned no S3 buckets: **NO EXISTING AUTHORITATIVE MATTERDOCUMENT BUCKET FOUND**. The staging task has no `MATTER_DOCUMENTS_S3_BUCKET`, and its task role has no S3 permissions. The application uses `matter-documents/<uuid>` keys and needs only `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` on the object prefix; it does not need bucket listing, ACL, public access, or object URLs.

Candidate design only: bucket `immigration-ai-staging-matter-documents-747452892291` in `ap-southeast-2`; all Block Public Access settings on; Object Ownership `BucketOwnerEnforced`; default SSE-S3/AES256; no public policy/ACL; task-role actions limited to `arn:aws:s3:::immigration-ai-staging-matter-documents-747452892291/matter-documents/*`. Start with versioning off to preserve current hard-delete semantics. In a versioned bucket, ordinary `DeleteObject` creates a delete marker and leaves prior versions; versioning therefore requires version-aware purge and an owner-approved retention policy. Do not invent an expiry period. Add S3 data-event audit and operational metrics/alarms without logging object bodies. Bucket controls remain unknown until an authoritative bucket is selected or created.

### D. Malware scanning

No GuardDuty detector, S3 Malware Protection plan, EventBridge rules, Lambda/Step Functions, schedules, or bucket were found: **NO CONCRETE SCANNER CONFIG FOUND**.

**Recommendation: GuardDuty Malware Protection for S3 → EventBridge → SQS + DLQ → dedicated private reconciler.** Consume at-least-once scan events idempotently; match exact bucket/key/version to the stored MatterDocument and verify its SHA-256 against the exact object/checksum before changing scan state. `COMPLETED + NO_THREATS_FOUND` may become clean; `COMPLETED + THREATS_FOUND` becomes rejected; skipped, unsupported, access-denied, or failed results remain pending only for bounded retry or become failed, never clean. Use the existing pending-only compare-and-set flow against duplicates; bound retries and alarm on DLQ and scan cost. Keep scanner access separate from the chatbot role and scope it to the approved prefix. Custom ClamAV Fargate is an alternative with direct byte hashing but requires signature, capacity, and availability operations and fail-closed treatment of unsupported files. Configure neither option until bucket, verdict contract, cost owner, and acceptance criteria are approved.

### E. Policy Intelligence operator and cadence

No operator deployment or schedule exists. `chatbot/scripts/policy-sync.ts` accepts one source ID per invocation (`home-affairs-guidance`, `federal-register-legislation`, or `art-immigration-review`) and requires `POSTGRES_URL`, `OPENAI_API_KEY`, and `POLICY_INTELLIGENCE_ENABLED=true`; model, reasoning, provider timeout, and output limits are configurable. The current standalone web image starts `node server.js` and does not explicitly package the sync script/tsx runtime. Do not schedule this work inside the long-lived web process.

Recommend a separate reviewed operator image/task, e.g. `immigration-ai-staging-policy-sync`, from the same reviewed source and locked dependencies, with dedicated no-inbound security group/role, initially 1 vCPU/2 GiB, and serial source runs. Inject only staging DB/OpenAI secret references; never log values. Connect to the private database on 5432 through narrow SG rules; constrain outbound HTTPS 443 to required official source sites and `api.openai.com` as supported by network controls. Add a source-level PostgreSQL advisory/single-flight lock. Bound each source run at 30 minutes and a three-source batch at 90 minutes; no provider retries. Scheduler launch/API errors may have one bounded retry and DLQ; task failure should alarm and be inspected against `SyncRun` before manual retry. Use a dedicated log group with owner-approved retention and no secrets or sensitive source text.

Cadence options: daily at 02:00 Australia/Sydney (recommended only after live source/provider acceptance; lowest load); every six hours (~4x daily call volume); hourly (~24x, greater overlap/noise risk). Initial state: **DISABLED / MANUAL ONE-OFF ONLY** until a live source/provider acceptance gate passes. Seek separate approval before daily scheduling, with non-overlap lock, failure alarms, and a cost limit.

### Legal Service release and ECS health

The deployed Legal Service image maps to commit `3b3653202f9b067fbed4adfd410edc02cb7215cc`; accepted Phase 11 source since then changes Legal Service query, customer-document context, answer, reasoning, archive, and review-trace runtime paths. **Legal Service rebuild required**; do not reuse the Phase 10 image. **No public Legal Service endpoint required**: it is a chatbot sidecar in the same `awsvpc` task, uses `http://127.0.0.1:8000`, and the ALB routes only to chatbot. Add/verify the ECS Legal Service `/api/v1/health` check and chatbot dependency on Legal Service `HEALTHY` if supported.

The ECS deployment circuit breaker and rollback are disabled. **Recommendation for Stage 4B-1:** enable both while retaining rolling `maximumPercent=200` / `minimumHealthyPercent=100`, and configure ECS health checks for chatbot `/ping` and Legal Service `/api/v1/health`. Verify grace periods and desired-count-one behavior before rollout. The ECS breaker has a minimum failure threshold of three, so rollback may not be immediate.

### Dependency-ordered Stage 4B-1 plan

1. Obtain owner decisions below, name change/rollback owners, set a write-quiesce window, and run safe in-memory migration preflight against the source.
2. Create two-AZ private networking, proposed private DB subnet group, and narrowly scoped DB/task security groups; verify no Internet route or unintended DB ingress.
3. Quiesce writes; snapshot and verify, copy encrypted, and restore the secure DB with protection/backups. Keep source untouched. Preflight the restored endpoint and ledger; migrate only the new DB if behind. Validate DB/app compatibility before cutover.
4. Update staging DB secret references, roll a reviewed task definition, and verify chatbot/Legal Service health and DB behavior. Keep writes paused through acceptance; retain source for rollback and account for post-cutover writes if reverting.
5. After DB acceptance, owner-confirm the Stripe staging pair; build/deploy Legal Service from accepted Phase 11 source with health checks and ECS breaker/rollback; confirm no public Legal Service route.
6. Only after approval, configure the MatterDocument bucket and prefix IAM; verify encryption, public-access blocks, and deletion behavior. Deploy scanner/queue/reconciler after threat-state and cost approval; test clean, infected, unsupported/failure, duplicate, and DLQ cases before enabling uploads.
7. Build the separate operator; test one approved source at a time, locking/idempotency, runtime, telemetry, and alarms. Keep schedule disabled until live acceptance, then seek daily-cadence approval.

At each cutover compare task/image digests, target/container health, DB endpoint/ledger, alarms, and safe smoke behavior. Rollback restores prior staging secret references/task definition while retaining the old DB and snapshots. Do not remove source, snapshots, old task definition, or rollback configuration before an approved soak/retention gate.

### Owner decisions before Stage 4B-1

- Approve encrypted private DB replacement, change window, `aws/rds` versus customer KMS key, backups/retention, and cutover/rollback owners.
- Confirm the exact staging Stripe parameter pair and approved nonproduction credential mode.
- Approve candidate MatterDocument bucket, data classification, versioning/delete semantics, audit/retention policy, and upload acceptance gate.
- Approve GuardDuty/SQS/DLQ/reconciler, fail-closed mapping, scan-cost cap, and security owner.
- Approve operator image/task, secrets, egress set, runtime/cost caps; keep schedule disabled until pilot, then decide daily cadence.
- Approve Legal Service rebuild, health checks, ECS breaker/rollback, change window, and release owner.

### AWS references

Primary documentation: [RDS encryption and encrypted snapshot restore](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html); [RDS VPC/public-access behavior](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html); [ECS `awsvpc` networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-networking-awsvpc.html); [S3 delete/version behavior](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html); [GuardDuty S3 scan events](https://docs.aws.amazon.com/guardduty/latest/ug/monitor-with-eventbridge-s3-malware-protection.html); [EventBridge DLQ](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html); [GuardDuty pricing](https://docs.aws.amazon.com/guardduty/latest/ug/guardduty-pricing.html); [ECS deployment circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html).

No database data, AWS resources, secrets, or deployments were modified during Stage 4B-0.

## P11-009 Stage 4B-0 decision closure

This section records the final owner decisions for the transition into Stage 4B-1. It supersedes earlier open questions and tentative recommendations in the preceding Stage 4A/4B reconnaissance; those historical findings remain unchanged. This is a deployment decision record, not authorization to execute AWS changes.

### Final owner decisions

1. **RDS — Option B.** Replace the current staging RDS with a new encrypted private instance because current storage and snapshots are unencrypted and the instance is publicly accessible. Stage 4B-1 sequence: old staging RDS → snapshot → encrypted copy → new private RDS → application cutover. Keep the old RDS as a rollback anchor; do not delete it immediately. Retaining the current RDS as the long-term staging database and replication-based replacement are rejected alternatives. No RDS change occurs in Stage 4B-0.
2. **Migration 0023.** Run migration 0023 only against the new staging database, after controlled `db:preflight`. Do not migrate the old RDS directly. Future completion requires preflight, migration-status verification, acknowledged migration, and application connectivity confirmation.
3. **Stripe — intentional shared Stripe configuration.** Keep the existing Stripe configuration. Separate staging credentials are unavailable and require external owner action; an independent staging Stripe account is not required at this stage. Do not describe the current configuration as a misconfiguration and do not request new credentials. Stage 4B-1 should verify configuration resolution and expected payment/webhook routing only. Do not record secret values.
4. **MatterDocument S3.** Create a dedicated private staging bucket with Block Public Access enabled, SSE-S3/AES256, and `BucketOwnerEnforced` ownership. There is no public URL dependency or client-controlled object access. Start with versioning **OFF**; production versioning can be reconsidered later. Future IAM must be least privilege. No bucket or IAM changes occur now.
5. **Malware scanning.** Preferred architecture is GuardDuty Malware Protection for S3 + EventBridge + SQS/DLQ + a private reconciliation worker. Do not implement in Stage 4B-0. The application's existing `securityStatus` state machine remains authoritative.
6. **Policy Intelligence operator.** Do not run policy sync inside the chatbot web service. Use independent operator execution, preferably a dedicated ECS scheduled task. Initial operation is **MANUAL ONLY**, with no recurring schedule. After validation, daily Australia/Sydney cadence may be considered. No scheduler implementation occurs now.
7. **ECS deployment safety.** Future ECS deployment enables the deployment circuit breaker and automatic rollback while keeping the current rolling deployment strategy. Do not modify ECS now.

Rejected choices are therefore: keeping the current RDS as the long-term staging DB; migrating 0023 on the old RDS; treating Stripe namespace reuse as a blocker or obtaining new Stripe credentials now; enabling S3 versioning initially; running policy sync in the web service or enabling an initial recurring schedule; and rolling out ECS without the circuit breaker/automatic rollback. These decisions do not authorize present execution.

### Approved Stage 4B-1 order

1. **RDS replacement preparation** — Objective: prepare encrypted private replacement and preserve a recoverable source. Prerequisite: controlled source preflight and approved change window. Rollback anchor: unchanged old staging RDS and verified source snapshot.
2. **Database cutover and migration verification** — Objective: cut application database use to the replacement and verify migration 0023/application connectivity. Prerequisite: replacement ready, target preflight complete, and migration acknowledged. Rollback anchor: old RDS plus captured prior staging database references/task definition; preserve the new DB for diagnosis.
3. **Build/update deployment artifacts** — Objective: prepare reviewed artifacts for the accepted P11-009 source. Prerequisite: database cutover accepted and source/release revision fixed. Rollback anchor: currently deployed image digests and task definition revision 30.
4. **ECS rollout** — Objective: deploy the reviewed artifacts with rolling strategy, circuit breaker, and automatic rollback. Prerequisite: artifacts available and health checks/rollback settings reviewed. Rollback anchor: captured prior task definition and deployed image digests.
5. **MatterDocument S3 infrastructure** — Objective: provide the dedicated private staging bucket and least-privilege application access. Prerequisite: bucket design and ownership approved, with S3 public-access/encryption controls specified. Rollback anchor: disable the new application reference/IAM access while retaining bucket data for diagnosis.
6. **Scanner integration** — Objective: connect GuardDuty scan results through EventBridge and SQS/DLQ to a private reconciler while retaining application `securityStatus` authority. Prerequisite: bucket available and failure/duplicate handling agreed. Rollback anchor: disable event consumption and keep uploads fail-closed/pending under the existing state machine.
7. **Policy Intelligence operator** — Objective: run policy sync through a separate operator in manual mode. Prerequisite: reviewed operator artifact, secrets/network access, and single-flight controls. Rollback anchor: disable/stop the operator task; no recurring schedule is enabled initially.
8. **Runtime acceptance** — Objective: confirm deployment succeeds, critical paths work, security boundaries hold, and rollback is available. Prerequisite: preceding approved phases complete. Rollback anchor: the captured prior task definition/images, old RDS, and retained diagnostic resources.

Acceptance is a safe deployment with known risks and rollback capability, not proof of zero defects. Deployment success, critical-path behavior, security boundaries, and rollback availability are the focus; minor UI or non-critical defects alone do not block deployment.

### Remaining approvals before Stage 4B-1 execution

- Confirm the maintenance/write-quiesce window, cutover owner, rollback owner, and final change window.
- At execution planning, choose the approved KMS key approach and confirm replacement DB size/network/resource details and associated cost; the selected approach must remain encrypted and private.
- Approve the concrete staging bucket name, cost/ownership tags, and execution change window; keep the agreed private, encrypted, versioning-off design.
- Confirm operational owners for scanner alerts/DLQ and manual Policy Intelligence failures, and approve any later daily cadence separately after validation.
- Approve the final reviewed artifacts and staged AWS change set immediately before Stage 4B-1 actions.

Stage 4B-0 is complete. Stage 4B-1 has not started. No AWS resource, database, IAM policy, deployment artifact, or application source was changed; no migration, deployment, commit, or push was performed.

### Stage 4B approved snapshot creation — 2026-10-01

Owner approved creation of exactly one manual snapshot from the existing staging database. Snapshot `immigration-ai-staging-pre-p11-009-4b-20261001` was created from `immigration-ai-staging-postgres` in `ap-southeast-2`.

- ARN: `arn:aws:rds:ap-southeast-2:747452892291:snapshot:immigration-ai-staging-pre-p11-009-4b-20261001`
- Status: `available` (100% complete at final read)
- Encrypted: `false` (source snapshot is unencrypted; no encrypted copy was made)
- Creation time: `2026-10-01T00:44:33.214000+00:00`

The source RDS remains unchanged and retained as the rollback anchor. This was the only AWS mutation in this step. No snapshot copy, RDS restore, subnet/security-group/networking change, migration, ECS update, S3/IAM change, policy sync, or deployment was performed. Stage 4B remains in progress; stop here and await approval before the next mutation.

### Stage 4B approved encrypted snapshot copy — 2026-10-01

Owner approved copying only the existing manual staging snapshot to an encrypted copy. The copy is complete and available.

- Snapshot: `immigration-ai-staging-pre-p11-009-4b-20261001-encrypted`
- ARN: `arn:aws:rds:ap-southeast-2:747452892291:snapshot:immigration-ai-staging-pre-p11-009-4b-20261001-encrypted`
- Encryption: enabled; AWS-managed RDS KMS key `alias/aws/rds` (`arn:aws:kms:ap-southeast-2:747452892291:key/ebe23512-d5dc-4bc4-a2d1-bcb407bc2ccc`)
- Status: `available` (100% complete at final read)
- Source snapshot: `arn:aws:rds:ap-southeast-2:747452892291:snapshot:immigration-ai-staging-pre-p11-009-4b-20261001`
- Creation time: `2026-10-01T00:55:07.060000+00:00`

No RDS restore, subnet/network/security-group/ECS change, migration, S3/IAM change, policy sync, or deployment was performed. The source database and unencrypted source snapshot remain unchanged. Stop here and await approval before the next mutation.

### Stage 4B private-network prerequisites — 2026-10-01

Owner approved creation of only the private networking prerequisites for the future staging RDS restore. Final read-only verification confirmed:

- RDS subnet group `immigration-ai-staging-db-private-subnet-group` — ARN `arn:aws:rds:ap-southeast-2:747452892291:subgrp:immigration-ai-staging-db-private-subnet-group`; status `Complete`.
- Private subnet `subnet-0ebf23bb3c526add8` — `172.31.48.0/24`, `ap-southeast-2a`; `MapPublicIpOnLaunch=false`.
- Private subnet `subnet-055d274980dd1aa6e` — `172.31.49.0/24`, `ap-southeast-2b`; `MapPublicIpOnLaunch=false`.
- Dedicated route table `rtb-0dbf3c5d3de2d788c` — only route is active local VPC route `172.31.0.0/16`; no Internet Gateway or NAT route. Associations are `rtbassoc-0b271e185fa4806ba` to the 2a subnet and `rtbassoc-09028785a42f15f66` to the 2b subnet; both are associated and non-main.
- Dedicated DB security group `immigration-ai-staging-postgres-private-sg` — ID `sg-0c4361ad74a4183cb`; ingress is TCP 5432 only from chatbot SG `sg-0223d743f5721b006` and Legal Service SG `sg-0e32ee9fb1b6b5ea3`; no CIDR ingress. Egress rules are empty.

Existing public subnets and route table were not modified. The old RDS remains available and unchanged. No RDS restore, ECS change, application-secret change, migration, or traffic cutover occurred. Stop here and await separate approval before restoring the encrypted snapshot.

### Stage 4B approved private RDS restore — 2026-10-01

Owner approved restoring the encrypted snapshot into a new private staging DB instance. Final read-only verification reports:

- Identifier: `immigration-ai-staging-postgres-secure`
- Endpoint: `immigration-ai-staging-postgres-secure.ctkuiomwqo61.ap-southeast-2.rds.amazonaws.com:5432`
- Status: `available`
- Source snapshot: `immigration-ai-staging-pre-p11-009-4b-20261001-encrypted`
- Encryption: enabled; KMS key `arn:aws:kms:ap-southeast-2:747452892291:key/ebe23512-d5dc-4bc4-a2d1-bcb407bc2ccc`
- Accessibility: `PubliclyAccessible=false`
- Subnet group: `immigration-ai-staging-db-private-subnet-group` (subnets in `ap-southeast-2a` and `ap-southeast-2b`)
- Security group: `sg-0c4361ad74a4183cb` (`immigration-ai-staging-postgres-private-sg`)
- Configuration: PostgreSQL 18.3, `db.t4g.micro`, 20 GiB gp3, 3000 IOPS / 125 MiB/s, `default.postgres18` in-sync, single-AZ.

The existing `immigration-ai-staging-postgres` remains available and unchanged. No migration, DB preflight, application-secret update, ECS change, or traffic cutover was performed. Stop here and await approval before any further action.

### Stage 4B migration preflight attempt — 2026-10-01

The approved preflight was attempted against `immigration-ai-staging-postgres-secure` using the repository command `pnpm db:preflight`. The staging `POSTGRES_URL` was retrieved and handled in memory only; its hostname was retargeted to the new RDS endpoint, and no credential was printed or written. Preflight exited with code 1 and emitted no database/ledger summary. A credential-free network check resolved the target to private address `172.31.48.11`, but TCP 5432 timed out from this execution environment. Thus the target database identity and migration ledger remain **UNVERIFIED**. Repository migration head is `0023_chief_famine`.

Migration 0023 was **NOT RUN** because the approved preflight could not verify the target identity and ledger. The new RDS remains unchanged by this attempt; the old RDS, ECS, application secrets, and traffic were not changed. Database connectivity from this execution host is **UNAVAILABLE**. A controlled in-VPC execution path using the current repository migration operator is required before preflight and the acknowledged migration can proceed. Stop and obtain approval for that execution path; do not cut over application traffic.

### Stage 4B in-VPC migration-runner reconnaissance — 2026-10-01

Read-only staging topology review; no AWS mutation, task creation, service update, database connection, or migration was performed.

**Existing ECS topology**

- VPC: `vpc-04c15c51747904e9a` (`172.31.0.0/16`).
- Cluster `immigration-ai-staging`: `ACTIVE`, FARGATE capacity provider.
- Service `immigration-ai-staging-web`: `ACTIVE`, 1 desired/running Fargate task, task definition `immigration-ai-staging-web:30`, `awsvpc` network mode.
- Service subnets: `subnet-020c9fa83beff2e52` (`ap-southeast-2a`), `subnet-0a501eeb320072fae` (`ap-southeast-2c`), and `subnet-05a1fd04555a84d62` (`ap-southeast-2b`). These are the existing public-route subnets. Service `assignPublicIp=ENABLED`.
- Service security group: chatbot SG `sg-0223d743f5721b006`. It has outbound allow-all and inbound TCP 3000 only from the ALB security group.
- New private DB network already prepared: subnet group `immigration-ai-staging-db-private-subnet-group`, subnets `subnet-0ebf23bb3c526add8` (`ap-southeast-2a`) and `subnet-055d274980dd1aa6e` (`ap-southeast-2b`), local-only route table `rtb-0dbf3c5d3de2d788c`.
- New DB security group `sg-0c4361ad74a4183cb` allows TCP 5432 only from chatbot SG `sg-0223d743f5721b006` and Legal Service SG `sg-0e32ee9fb1b6b5ea3`; it has no egress rules. The VPC currently has no NAT gateway or VPC endpoints.
- Task execution role: `arn:aws:iam::747452892291:role/immigration-ai-staging-ecs-execution-role`. Its standard ECS execution policy is attached; its inline policy allows SSM reads across the staging parameter path, reads of the two production-namespaced Stripe parameters, and `kms:Decrypt` on `*`. Do not reuse this broad role for a migration runner.
- Existing task role: `arn:aws:iam::747452892291:role/immigration-ai-staging-ecs-task-role`; its inline policy is transactional SES access. Do not reuse application task permissions for the runner.
- ECS Exec is disabled on the service. Revision 30 is a web task definition with chatbot and Legal Service containers and their application secrets, not a dedicated migration job.

**Can a one-off task run and reach the DB?** ECS/Fargate supports a separate one-off `RunTask` using `awsvpc` in this VPC. VPC-local routing connects task ENIs to the private RDS subnets. With the currently allowed chatbot SG, a task could reach port 5432 because that SG is an allowed source on the DB SG; however, reusing it also inherits broad outbound and ALB-originated TCP 3000 ingress. The safest design is a dedicated runner SG with no ingress and a temporary, exact DB-SG ingress rule for TCP 5432 from that runner SG. No connection or task was attempted.

**Recommended runner type**

Use a short-lived, dedicated Fargate `RunTask` with its own migration-only image built from the reviewed repository revision containing migration `0023_chief_famine`; do not reuse the current web task definition/image or run ECS Exec (disabled). Place it in private VPC subnets with `assignPublicIp=DISABLED`, a no-ingress runner SG, and a hard task timeout. The currently prepared private subnet route table has only the local route, so a private runner also needs private AWS service connectivity for ECR image pull (ECR API/DKR and S3 image layers), CloudWatch Logs, and SSM parameter retrieval. No such VPC endpoints currently exist. Provide those through approved VPC endpoints and endpoint SG/policy controls (or separately approve another bounded egress design); do not add a NAT/IGW route to the DB subnets by default.

The runner entrypoint should receive only the required staging DB secret through ECS secret injection, validate the source URL's known old-RDS host, replace only the host with the approved private target in memory, and run the repository preflight followed by the acknowledged migration. It must not log environment values or command-line credentials. The current deployment image predates the present repository migration head, so use an artifact built from the exact reviewed migration source.

**Required permissions**

- Dedicated task execution role: ECR authorization/image-read permissions scoped to the runner repository; log-stream write permissions scoped to its dedicated log group; and `ssm:GetParameters` only for `/immigration-ai/staging/chatbot/postgres-url`. Allow KMS decrypt only as required by that parameter's encryption key. Avoid the current execution role's broad staging/production Stripe read scope and wildcard KMS decrypt.
- Dedicated task role: no AWS permissions required for the migration process if secret retrieval is performed by ECS execution-role injection and the process only connects to PostgreSQL.
- One-off operator: `ecs:RunTask`, `ecs:DescribeTasks`, and `ecs:StopTask` scoped to the dedicated task/cluster, plus `iam:PassRole` only for the dedicated task and execution roles. If the task definition must be registered, separately scope `ecs:RegisterTaskDefinition` and the same `iam:PassRole` permissions.
- Temporary network authorization: add only TCP 5432 ingress to the new DB SG from the runner SG; the runner SG should allow DB TCP 5432 and only the HTTPS paths needed to the approved private endpoints.

**Network path and cleanup**

Path: private Fargate task ENI → VPC local route → private RDS endpoint:5432, with no public IP; task startup/logging/secret traffic stays on private ECR/S3/Logs/SSM endpoints. RDS remains non-public. The runner SG is removed from the DB SG ingress immediately after the task exits. Stop the task if still running, retain bounded logs without secrets, deregister its task definition after diagnosis, then remove its SG and any runner-only endpoints/subnets only after confirming they are unused and receiving the relevant cleanup approval. Leave the restored and old DBs intact; no schema rollback or traffic cutover is part of runner cleanup.

AWS reference: [ECS `awsvpc` task networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-networking-awsvpc.html).

### Stage 4B migration-runner path comparison — 2026-10-01

Bounded decision analysis only. No AWS resources were created or modified; no task was created, no database connection was made, and no migration was run. Current VPC reconnaissance found no NAT gateway or VPC endpoints. The private DB route table is local-only; existing public-route ECS subnets have internet egress and use public task IPs.

| Factor | Option A — permanent private endpoints (ECR API, ECR DKR, S3 gateway, CloudWatch Logs, SSM) | Option B — temporary migration-only path |
|---|---|---|
| Implementation time | Higher for this migration: create/configure four interface endpoints, endpoint security/policies and private DNS, associate the S3 gateway endpoint with route tables, then validate private task startup and logging. | Lower for a single run: use a dedicated one-off Fargate task in an existing public-route subnet with a public IP for outbound image/SSM/log access, a dedicated no-ingress SG, and a temporary DB-SG TCP 5432 rule from that SG. Keep the RDS private. |
| Cost | Ongoing hourly and data-processing charges for four interface endpoints, including idle periods; the S3 gateway endpoint has no additional endpoint charge. | Fargate task runtime, public IPv4 while assigned, and modest image/log/data-transfer charges. Public IPv4 is currently priced at USD $0.005/hour; task compute is billed for its runtime. Costs end with task/IPv4 cleanup. |
| Security impact | Stronger private-only service path: no public runner IP is needed, with endpoint SGs and policies available to constrain access. Endpoints create persistent private service paths that require narrowly scoped policies and ongoing review. | Weaker network isolation while the task runs because it has a public IP and outbound internet path. Reduce exposure with no ingress, a dedicated least-privilege task/execution role, a dedicated SG, a fixed task lifetime, and DB ingress limited to that SG on 5432. The database remains private. |
| Rollback complexity | More infrastructure to remove later; first confirm no other private workloads depend on the endpoints, then remove endpoint associations/endpoints and policies. | Straightforward after the run: stop the task, remove the temporary DB-SG rule, then remove the task definition/runner SG and related temporary artifacts. Preserve logs for the migration record. |

**Recommendation for this single staging migration: Option B**, using the bounded one-off Fargate path described above. It has the shorter implementation path and avoids ongoing endpoint charges for infrastructure with no current private-task dependency. Option A provides the tighter private service path and is a better fit if recurring private ECS workloads are approved. This is a recommendation only; it does not authorize creating resources or running the migration.

Pricing references: [AWS PrivateLink pricing](https://aws.amazon.com/privatelink/pricing/), [S3 gateway endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html), [Amazon VPC pricing](https://aws.amazon.com/vpc/pricing/), and [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/).

### Stage 4B one-off migration runner preparation — 2026-10-01

Option B (temporary one-off Fargate runner) is the selected path. This is a plan for approval only: read-only AWS metadata was checked; no AWS resources, task, secret, security rule, RDS setting, ECS service, or application deployment was changed. No DB connection or migration was attempted. Only this handoff file was updated.

**Bounded task design**

- Register a separate Fargate task-definition family `immigration-ai-staging-p11-009-migration`; do not use `immigration-ai-staging-web:30`. Use Linux/X86_64, `awsvpc`, 0.5 vCPU / 1 GiB, no ports, no application server, no privileged mode, read-only root filesystem, and one container with a fixed migration-only dispatcher. Its only allowed operations are the repository's `pnpm db:preflight` and acknowledged `pnpm db:migrate:operator -- --acknowledge-migrations --expect-database=<confirmed-name>` commands. Default task command is preflight; migration invocation requires the exact DB name learned from a successful preflight and a separately authorized task run.
- Build a purpose-built image from source revision `f5605b0e336fe7eb75326a18cf64c2e53dd4a3d9`, containing only the migration operator, required runtime dependencies, and migration files (head `0023_chief_famine`), with a wrapper that invokes only those repository commands. Do not use the current web image: it predates this migration head and is not a migration runner. Push a uniquely tagged image to existing ECR repository `747452892291.dkr.ecr.ap-southeast-2.amazonaws.com/immigration-ai/chatbot` (scan-on-push enabled; repository currently uses mutable tags); register the task definition with the resulting immutable image digest. No new ECR repository is needed.
- Inject only `POSTGRES_URL` from `/immigration-ai/staging/chatbot/postgres-url` (ARN `arn:aws:ssm:ap-southeast-2:747452892291:parameter/immigration-ai/staging/chatbot/postgres-url`). It is a `SecureString` encrypted with `alias/aws/ssm`. The runner wrapper must validate the injected URL host equals the old staging DB endpoint `immigration-ai-staging-postgres.ctkuiomwqo61.ap-southeast-2.rds.amazonaws.com`, replace only the hostname in memory with `immigration-ai-staging-postgres-secure.ctkuiomwqo61.ap-southeast-2.rds.amazonaws.com`, preserve the database name/credentials, and never print or persist the URL. No other application secret, Stripe value, provider credential, or runtime setting is included. The exact database name remains to be confirmed by preflight.

**Exact proposed AWS resources and network**

1. IAM execution role `immigration-ai-staging-p11-009-migration-execution-role`, trusted by `ecs-tasks.amazonaws.com`, with a custom least-privilege inline policy only: `ecr:GetAuthorizationToken` (Resource `*` as required by AWS) plus ECR image pull actions scoped to repository `immigration-ai/chatbot`; `logs:CreateLogStream`/`logs:PutLogEvents` scoped to the dedicated log group streams; and `ssm:GetParameters` scoped only to the staging chatbot DB parameter ARN. No Stripe, application, SES, S3, provider, or broad KMS permissions. AWS ECS documentation says `kms:Decrypt` is needed only for a customer-managed key; this parameter uses the AWS-managed `alias/aws/ssm` key.
2. IAM task role `immigration-ai-staging-p11-009-migration-task-role`, ECS task trust only and no attached permission policies. The container needs no AWS API permissions; ECS agent secret retrieval, image pull, and log delivery use the execution role.
3. CloudWatch log group `/ecs/immigration-ai-staging/p11-009-migration`, create before task registration, 14-day retention; emit only sanitized operator summaries/errors.
4. Security group `immigration-ai-staging-p11-009-migration-runner-sg` in VPC `vpc-04c15c51747904e9a`, with no ingress. Egress: TCP 5432 to restored DB SG `sg-0c4361ad74a4183cb`; TCP 443 to `0.0.0.0/0` only while the runner exists, for public ECR, SSM, and CloudWatch Logs endpoints. Security groups do not filter by FQDN, so the temporary HTTPS destination range is broader than named AWS endpoints; no other outbound ports are needed. This tradeoff is bounded by no ingress, a single-purpose image/role, and short task lifetime.
5. A temporary ingress permission on the restored DB SG `sg-0c4361ad74a4183cb`: TCP 5432, source exactly the runner SG above. Remove it as soon as the one-off task stops. This does not change the RDS instance's `PubliclyAccessible=false` setting or the old RDS.
6. Task-definition family `immigration-ai-staging-p11-009-migration`, referencing the purpose-built image by digest, the two dedicated roles, the exact SSM parameter, dedicated log group, and preflight-only default command. No ECS service update or service task-definition change.
7. ECR image push to the existing `immigration-ai/chatbot` repository is a required artifact publication, not creation of a repository; the pushed unique tag/digest must be recorded and the task definition pinned to the digest.

**Verified subnet and route choice**

Use existing public-route subnet `subnet-020c9fa83beff2e52` (`ap-southeast-2a`, VPC `vpc-04c15c51747904e9a`, `172.31.0.0/20`). It has no explicit route-table association and inherits main route table `rtb-04c841decc28b6afd`, whose active routes are VPC-local `172.31.0.0/16` and `0.0.0.0/0` via IGW `igw-07c407c09e387ca16`. The subnet has `MapPublicIpOnLaunch=true`; the ECS `RunTask` network configuration must explicitly set `assignPublicIp=ENABLED` because there is no NAT or service endpoint path. Fargate cluster `immigration-ai-staging` is `ACTIVE` with FARGATE capacity provider; service task definition `:30` is Linux/X86_64, Fargate-compatible `awsvpc`, confirming the selected launch/network mode. The task ENI reaches the private DB over the VPC-local route. Public IP belongs only to the short-lived runner; the restored RDS remains private.

**Creation and cleanup order**

After approval: build/scan/push the minimal image and record its digest; create the log group and two dedicated IAM roles/policy; create the no-ingress runner SG; add only the temporary DB ingress rule; register the preflight-only task definition; then stop for review of preflight output before any migration-run approval. No `RunTask` is included in this resource-creation approval unless explicitly stated.

Rollback/removal: if a task was later authorized and started, stop it first; revoke the temporary DB-SG ingress immediately; preserve sanitized CloudWatch logs for the record; deregister the task-definition revision; remove the runner SG and dedicated IAM policy/roles; remove the unique ECR image tag after retaining the required artifact record; delete the log group only after required logs are retained. No service change or RDS-instance change needs rollback. Infrastructure cleanup does not reverse database schema changes if a later, separately approved migration runs.

**Expected incremental cost**

No standing VPC endpoint or NAT cost is introduced. A single 0.5-vCPU/1-GiB Fargate task is billed from image download until task termination, rounded to seconds, plus one public IPv4 at USD $0.005/hour while attached, image/log storage, and small data-transfer charges. Task-definition/IAM/security-group resources have no hourly compute charge; the retained image and log storage have storage charges. Exact Fargate rate varies by region and is not estimated here. [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/) and [Amazon VPC public IPv4 pricing](https://aws.amazon.com/vpc/pricing/).

AWS references: [ECS task execution role and SSM permissions](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html), [ECS `awsvpc` networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-networking-awsvpc.html), and [Fargate pricing](https://aws.amazon.com/fargate/pricing/).

### Stage 4B migration-only runner resources prepared — 2026-10-01

Owner approved the bounded runner resource preparation. All authorized resources were created and read-back verified. No ECS task was started; `RunTask`, `db:preflight`, migration 0023, and all database connections remain **NOT RUN**. ECS service `immigration-ai-staging-web` remains ACTIVE on `immigration-ai-staging-web:30` with desired/running count 1. No application secret, RDS instance configuration, old RDS, or traffic was changed.

**Image**

- Built from reviewed application source commit `f5605b0e336fe7eb75326a18cf64c2e53dd4a3d9` in an isolated `/tmp` context. The image contains only the migration operator, preflight helper, migration files/journal, pinned `drizzle-orm` 0.34.1, `postgres` 3.4.5, `tsx` 4.19.3, and a fixed dispatcher; it does not contain the web app runtime.
- Existing ECR repository: `747452892291.dkr.ecr.ap-southeast-2.amazonaws.com/immigration-ai/chatbot` (no new repository).
- Unique tag: `p11-009-stage4b-migration-f5605b0`
- Immutable digest: `sha256:cc787a26c3edf7b73e033100471c47d3a179803fbfd6cd5c5ebbd4144b7136be`
- ECR image scan status: `COMPLETE`. The local Docker registry login was removed after push.
- Dispatcher defaults to `preflight`; its migration mode requires an explicit expected database name. It validates the injected source host against the old staging RDS hostname and replaces only the host in memory with the private restored RDS endpoint. It never prints the URL.

**Created AWS resources**

- Execution role: `arn:aws:iam::747452892291:role/immigration-ai-staging-p11-009-migration-execution-role`. No managed policies. Its only inline policy grants ECR auth plus image pulls from `immigration-ai/chatbot`, log stream creation/write to the dedicated log group, and `ssm:GetParameters` for only `/immigration-ai/staging/chatbot/postgres-url`. No Stripe, application, SES, provider, S3, or KMS permissions.
- Empty task role: `arn:aws:iam::747452892291:role/immigration-ai-staging-p11-009-migration-task-role`. No managed, inline, or application permissions.
- Log group: `/ecs/immigration-ai-staging/p11-009-migration`; retention 14 days.
- Runner security group: `sg-0fe4dadb2de1ce6dd` in `vpc-04c15c51747904e9a`; ingress is empty. Egress is TCP 443 to `0.0.0.0/0` for HTTPS AWS service access and TCP 5432 only to restored DB SG `sg-0c4361ad74a4183cb`.
- Temporary restored-DB SG ingress rule: `sgr-078ee14f3694eebd9`, TCP 5432 with source exactly runner SG `sg-0fe4dadb2de1ce6dd`. The existing chatbot and Legal Service source rules remain present. The restored RDS remains `PubliclyAccessible=false`.
- Task definition: `arn:aws:ecs:ap-southeast-2:747452892291:task-definition/immigration-ai-staging-p11-009-migration:1`, status `ACTIVE`; Fargate, Linux/X86_64, `awsvpc`, 512 CPU / 1024 MiB. It is pinned to the ECR digest above, uses the two dedicated roles, has a read-only root filesystem and non-root UID/GID 1000, exposes no ports, and references only the staging chatbot DB parameter as a secret. Default command is `preflight`; log output goes to the dedicated 14-day group.

**Network confirmation**

Runner subnet remains `subnet-020c9fa83beff2e52` (`ap-southeast-2a`) in VPC `vpc-04c15c51747904e9a`. It inherits main route table `rtb-04c841decc28b6afd` with active local and Internet Gateway default routes; `RunTask` must explicitly set `assignPublicIp=ENABLED`. The task-to-RDS path uses the VPC-local route. Private RDS subnets/route table were not changed. Runner SG outbound HTTPS is limited to TCP 443, though destination is `0.0.0.0/0` because security groups cannot restrict by FQDN.

Read-back confirmed no task in RUNNING state for the migration family and confirmed the web service still uses revision 30. The task definition is registered but has not been run. The temporary database ingress rule and runner resources remain in place pending the separately approved preflight/run step and later cleanup approval. **Stop here; obtain separate approval before any `RunTask`, preflight, or migration execution.**

### Stage 4B one-off preflight task attempt — 2026-10-01

Owner approved exactly one `RunTask` using `immigration-ai-staging-p11-009-migration:1` for preflight only. No command override was supplied; the task definition default was `preflight`. ECS injected only the referenced staging DB parameter. The task ran in `subnet-020c9fa83beff2e52` with runner SG `sg-0fe4dadb2de1ce6dd` and a public IP for HTTPS service access.

- Task ARN: `arn:aws:ecs:ap-southeast-2:747452892291:task/immigration-ai-staging/ce658b19da204d5c8291a169534050f6`
- Started: `2026-10-01T12:27:36.861000+10:00`
- Stopped: `2026-10-01T12:28:01.559000+10:00`
- Final status: `STOPPED`; container exit code `1`; stopped reason `Essential container in task exited`.
- Sanitized failure: Corepack failed before launching `pnpm db:preflight` because it attempted to create `/home/node/.cache/node/corepack/v1` while the task root filesystem was read-only.
- Preflight result: **NOT COMPLETED**. Target database identity and migration ledger status are **UNVERIFIED**. The runner did not emit a preflight summary. The reviewed repository migration head remains `0023_chief_famine`, but this task did not report it.
- No DB connection was made and no migration command was launched; therefore no database migration or schema change occurred. This is supported by the container log failing at Corepack startup before pnpm/operator execution.
- Final read-back confirmed this task is `STOPPED`, no migration runner task is running, and `immigration-ai-staging-web` remains ACTIVE on revision 30 with one desired/running task.

No task retry, image change, task-definition change, DB query, migration, secret/RDS/service change, or traffic cutover was performed. The dedicated runner resources and temporary DB SG ingress remain as previously prepared; cleanup is pending its separately authorized step. Stop here and obtain separate approval before rebuilding/revising the runner or making another `RunTask` attempt. Migration execution still requires separate approval after a successful preflight.

### Stage 4B migration runner Corepack correction — 2026-10-01

The single prior preflight task failed before repository preflight or DB access. Corepack attempted to create `/home/node/.cache/node/corepack/v1` while the container root filesystem was read-only. The image had prepared Corepack's pnpm cache under the build user's default location, but the task runs as UID/GID 1000 and Corepack therefore looked under `/home/node`.

**Minimal runner-only correction**

- Kept `readonlyRootFilesystem=true` and non-root UID/GID 1000.
- Fargate does not support `tmpfs`; rather than add a writable `/tmp` mount, rebuilt the migration-only image from reviewed source revision `f5605b0e336fe7eb75326a18cf64c2e53dd4a3d9` with pnpm 9.12.3 pre-populated in `/opt/corepack`, readable by the runtime UID.
- Set image and task-definition environment `COREPACK_HOME=/opt/corepack` and `COREPACK_ENABLE_NETWORK=0`, so Corepack uses the preloaded cache and cannot try to download pnpm at runtime. No writable filesystem mount or other infrastructure was added.
- New ECR tag: `p11-009-stage4b-migration-f5605b0-corepackfix1`
- New immutable ECR digest: `sha256:2e513c2f3f67ee47165890a8c96e5dd52b6160e6798c819275994cca43e2f6e8`
- Registered task definition revision: `arn:aws:ecs:ap-southeast-2:747452892291:task-definition/immigration-ai-staging-p11-009-migration:2`; status `ACTIVE`, command remains `preflight`, image is pinned to the new digest, root filesystem remains read-only, runtime user remains `1000:1000`, and only the staging chatbot DB parameter is referenced as a secret.

**Validation performed**

- Corrected Docker build completed from the isolated reviewed source context; image inspection confirms the `/opt/corepack` environment, `COREPACK_ENABLE_NETWORK=0`, and preflight default command.
- ECR read-back confirms the new tag/digest exists.
- ECS task-definition read-back confirms revision 2 and the corrected environment, digest, secret reference, and read-only setting.
- No task was started for this correction, no `RunTask` retry occurred, and no database connection, preflight, migration, application-service update, secret change, or RDS change was made. Read-only ECS checks confirmed no migration runner is currently running and the web service remains on revision 30.

Stop here. Obtain separate approval before retrying `RunTask` for preflight; migration execution remains separately gated on successful preflight and its own approval.

### Stage 4B revision-2 preflight retry — 2026-10-01

Owner approved exactly one Fargate task using `immigration-ai-staging-p11-009-migration:2`, with its default command and no override. One task was started; no retry was made.

- Task ARN: `arn:aws:ecs:ap-southeast-2:747452892291:task/immigration-ai-staging/487e880a698641b5b9f7e071ef7ecfaa`
- Started: `2026-10-01T12:39:33.426000+10:00`
- Stopped: `2026-10-01T12:39:59.750000+10:00`
- Final status: `STOPPED`; container exit code `1`; no migration runner task remains RUNNING.
- Sanitized task log confirms the default command invoked `pnpm db:preflight`, which invoked `tsx scripts/db-migration-operator.ts --preflight`. `tsx` failed before the operator started because it could not create `/tmp/tsx-1000` on the read-only root filesystem. The Corepack issue is fixed (`COREPACK_HOME=/opt/corepack` worked); the remaining failure is the missing writable temporary directory required by `tsx`.
- Database identity verification: **NOT COMPLETED**. Migration ledger status: **NOT COMPLETED / UNVERIFIED**. Repository migration head was not emitted by this task; the reviewed source journal head remains `0023_chief_famine`.
- No DB connection occurred and no migration command/schema change occurred: execution stopped inside `tsx` before the repository migration operator could connect. The task command was preflight only and did not include `db:migrate` or `--acknowledge-migrations`.

No task-definition, image, IAM, security-group, secret, RDS, or ECS service changes were made during this retry. Task definition revision 2 remains active; the web service remains on revision 30. Stop here. Obtain separate approval before any runner adjustment/retry, and separate approval before migration execution.

### Stage 4B precompiled migration runner local correction — 2026-10-01

**Confirmed root cause:** With `readonlyRootFilesystem=true` and runtime user `1000:1000`, `tsx` 4.19.3 attempts to create `/tmp/tsx-1000` for its runtime IPC server. The Fargate task's read-only root had no writable `/tmp`, so the command failed before the repository migration operator started.

**Architectural correction:** The image now compiles `db-migration-operator.ts` to `dist/db-migration-operator.js` in its build stage using esbuild. The runtime dispatcher invokes that JavaScript directly with Node for both preflight and explicitly acknowledged migration modes. It preserves source-host validation, in-memory replacement with the private target host, explicit expected-database requirement for migration mode, and credential-safe errors. The runtime stage installs only `drizzle-orm` and `postgres`; it contains no `tsx`, esbuild, pnpm, or Corepack package/cache. Drizzle SQL migrations and journal are retained. Read-only root and UID/GID `1000:1000` remain; no writable `/tmp` workaround was added.

**Files added/changed:**

- `chatbot/Dockerfile.migration-runner` — multi-stage compile and minimal runtime image.
- `chatbot/scripts/migration-runner-dispatch.mjs` — direct Node dispatcher with the existing DB host guard and approval gates.
- `chatbot/migration-runner/package.json` and `chatbot/migration-runner/pnpm-lock.yaml` — pinned build/runtime dependency manifests; `esbuild` is build-only.
- `chatbot/migration-runner/runtime.package.json` — minimal ESM runtime package metadata.
- `docs/agent-memory/CURRENT_HANDOFF.md` — this validation record.

**Local validation:**

- Built locally: `docker build --platform linux/amd64 --file chatbot/Dockerfile.migration-runner --tag p11-009-migration-precompiled:local .` — **PASS**; TypeScript operator compiled to `dist/db-migration-operator.js`, production dependency install included only `drizzle-orm` and `postgres`.
- Local image ID: `sha256:d64c91af942ad4b4e3f852f80ae28233096376f34cd20ae29afc0ebc32d71f02` (local only; not pushed to ECR).
- Ran the requested command under a read-only root, UID/GID `1000:1000`, and `--network none`, supplying only a dummy URL: `docker run --rm --read-only --user 1000:1000 --network none -e POSTGRES_URL='<dummy validation URL>' p11-009-migration-precompiled:local preflight` — the compiled Node dispatcher/operator ran and exited `1` with only `Migration preflight or execution failed. Connection details were withheld.` This expected isolated-network failure occurred after the former `/tmp/tsx-1000`, tsx, and Corepack failure points; no database was reachable and no credentials were used.
- `git diff --check` — **PASS**.

**No ECS task, database connection, migration, or AWS runtime mutation was performed.** No image push or ECS task-definition registration was performed. ECR publication and a final corrected ECS task-definition revision remain subject to separate approval, as does any preflight retry and migration execution.

### P11-009 Stage 4B GuardDuty S3 scan-result source integration — 2026-10-01

Implemented a source-only SQS worker that validates GuardDuty Malware Protection S3 Object Scan Result EventBridge messages and reconciles them through the existing MatterDocument security boundary. EventBridge source/type, envelope version/time, schema/resource type, expected account and region, configured bucket, exact `matter-documents/` prefix, bounded body and required fields are validated. Verdict mapping is `NO_THREATS_FOUND` → `clean`, `THREATS_FOUND` → `rejected`, and `UNSUPPORTED`/`ACCESS_DENIED`/`FAILED` → `failed`; unknown values fail closed. Threat and status-reason payloads do not influence reconciliation.

The worker resolves the document by exact unique `storageKey` via the DB query layer, independent of processing/storage status, then uses pending-to-terminal CAS. Same-result terminal deliveries are idempotent; a conflicting terminal state is observable and is never overwritten. SQS long polling receives at most 10 messages. A message is deleted only after reconciliation or an identical terminal duplicate; malformed messages, missing documents, conflicts, DB/CAS errors, or delete failures remain for SQS retry/DLQ. Logs contain only bounded event/document IDs, normalized verdicts and result codes. The worker does not start document processing.

The production image keeps its normal `CMD ["node", "server.js"]`. A separate bundled worker artifact is available as `node /app/ops/guardduty-malware-reconciler.cjs`; it has no runtime tsx/pnpm/Corepack dependency. Its offline self-test makes no AWS or DB calls.

**Files changed:** `.gitignore`; `chatbot/Dockerfile.production`; `chatbot/package.json`; `chatbot/pnpm-lock.yaml`; `chatbot/lib/db/matter-document-security-repository.ts`; `chatbot/lib/db/queries.ts`; `chatbot/lib/matter-documents/security-reconciliation.ts`; `chatbot/lib/matter-documents/guardduty-sqs-reconciler.ts`; `chatbot/lib/matter-documents/guardduty-sqs-reconciler.test.ts`; `chatbot/scripts/build-guardduty-malware-reconciler.mjs`; `chatbot/scripts/guardduty-malware-reconciler.ts`; and this handoff.

**Validation:** `pnpm test:unit` — 463/463 passed; focused GuardDuty suite — 20/20 passed; focused Biome — passed; `pnpm build` — passed; `docker build --platform linux/amd64 -f chatbot/Dockerfile.production -t immigration-ai-chatbot:guardduty-reconciler-review .` — passed, local image ID `sha256:488910c47b8cb7118bc0ed266d0f7316525fd21aed4f6d6368870bbbf7794bd2`; `docker run --rm --read-only --user 1000:1000 --network none immigration-ai-chatbot:guardduty-reconciler-review node /app/ops/guardduty-malware-reconciler.cjs --self-test` — `guardduty_worker_self_test=passed`; `git diff --check` — passed.

No AWS resource or configuration was changed; no SQS task was run, no database connection or migration occurred, and no image was pushed or deployed. No schema or migration files were changed. The worktree remains uncommitted and unpushed. Infrastructure/EventBridge/SQS configuration, image publication and worker deployment require separate approval.


## Emergency Policy Intelligence product recovery — 2026-10-01

**Current remote product checkpoint before this documentation update:** `e888d350e0d91ff98fc5221d85ddb94fd070e7fe` (`fix: bootstrap policy feed with reviewed official fallback`).

Production is live at `https://www.aulawyers.com.au` on ECS service `immigration-ai-staging-web`; the latest recorded successful web rollout used task definition `immigration-ai-staging-web:32`. The Policy Intelligence public surface now renders one reviewed official-source fallback entry instead of an empty page.

This recovery exposed a product/architecture mistake that must not be repeated: public Policy Intelligence availability must not depend on a long synchronous discovery -> acquisition -> analyzer -> verifier -> publication chain. Automated ingestion is background enhancement only. Existing published/reviewed content must remain visible even when discovery or AI analysis fails.

Observed live sync evidence on 2026-10-01:

- Federal Register: discovery/acquisition/snapshot/analysis worked, but no item published; two candidates were correctly held as non-policy-relevant and one verifier-format mismatch was later normalized.
- ART: three candidates failed before publication with pipeline/provider-timeout behavior.
- Home Affairs: the earlier live path was too slow for bootstrap and is not an acceptance blocker.
- These pipelines remain useful for future background discovery, but are explicitly **NOT** the current UI-delivery critical path.

The lawyer-provided visual/product authority for the immediate hotfix is:

`chatbot/UI_template/OPEN_ME_Sovereign_Nexus_UI.html`

The current production list/detail surfaces are materially below that reference in information hierarchy and legal-intelligence density. The immediate owner requirement is a **FAST single-batch UI/content hotfix**, not another infrastructure project.

### Active hotfix contract

Implement once, validate once, deploy once:

1. Rework only `/intelligence` and `/intelligence/[id]` presentation toward the lawyer template.
2. Keep the current production data model, server loaders, provenance separation and manual fallback mechanism.
3. The list page must use dense legal-intelligence rows grouped by legal status, with source/identifier/date/category, affected group, key impact and a clear detail CTA.
4. The detail page must use the template's legal-intelligence information hierarchy: legal/source metadata, bilingual policy summary, affected groups, practical impact, recommended actions/uncertainties when present, official-source action, and history only when real data exists.
5. Do **not** copy prototype/fake legal claims, identifiers, statutory text, lawyer commentary, PDFs, or diff/history that production data does not actually support.
6. Preserve the existing reviewed official fallback entry and add only genuinely verified official-source fallback entries if the coding task can support them from already-reviewed repository material; do not invent content.
7. Do not modify DB schema/migrations, AWS infrastructure, Policy Intelligence ingestion architecture, model/provider settings, legal-service, billing, consultation flows, Phase 6 or ReasoningBank.
8. Do not create new gates or subtasks. Required validation is only focused Policy Intelligence tests, `pnpm build`, and `git diff --check`.
9. After one successful implementation batch, report exact changed files and validation. Do not perform AWS deployment from the coding task.

### Delivery principle

For this hotfix, the user-visible outcome is the priority: a stable, professional legal-intelligence list/detail experience closely aligned with the lawyer reference. Do not block delivery on crawler/LLM reliability work.

## Policy Intelligence emergency hotfix closure — 2026-10-01

**Owner acceptance:** PASS for the immediate Policy Intelligence recovery/hotfix. The owner reviewed the deployed `/intelligence` surface and reported it is basically satisfactory. The emergency UI/content task is therefore closed and the project may pause here until a new issue or refinement is requested.

### Final source and validation checkpoint

- Branch: `phase11-chinese-service-platform-ui-rebase`
- Validated/deployed source commit: `f1b48fc340085392c818ace917aa217bfca245c1` (`fix: repair reviewed policy registry syntax`)
- Preceding content expansion commit: `980638a26225e65aa98466a7c786e8b4e72a3151`
- Focused Policy Intelligence validation: **PASS**
  - `lib/policy-intelligence.test.ts`
  - `lib/policy-intelligence-product.test.ts`
  - `lib/policy-intelligence-registry.test.ts`
- `pnpm build`: **PASS**
- `git diff --check`: **PASS**
- The final syntax repair was intentionally minimal: the stray `},,` in `chatbot/content/policy-intelligence/registry.ts` was corrected to `},`.

### Final AWS rollout evidence

- AWS profile/account/region used: `aulawyers-staging` / `747452892291` / `ap-southeast-2`
- ECS cluster/service: `immigration-ai-staging` / `immigration-ai-staging-web`
- New task definition: `immigration-ai-staging-web:33`
- Chatbot image was deployed by immutable digest:
  `sha256:996fa0d155247eb3dd72296ee7f7a62fc182a3a4ff60c00d7f63d9a5c0d71a1e`
- Legal Service image remained unchanged:
  `sha256:badd60cf2f5a28b364aefd4696c00dbfeabdb20bfd7b12dbc169692c595af6c4`
- ECS service state after rollout:
  - desired = 1
  - running = 1
  - pending = 0
  - PRIMARY rollout state = `COMPLETED`
  - running task definition = revision 33
  - running chatbot container digest exactly matched the intended immutable digest above

### User-visible acceptance

The deployed Policy Intelligence list now presents multiple reviewed official-source fallback entries in the dense legal-intelligence layout, grouped under legal/source status, with source identity, dates, affected groups, practical impact and detail/source actions visible. The owner reviewed the live result and accepted the immediate hotfix as sufficiently complete.

### Important retained product rule

Public Policy Intelligence availability must remain independent from the full automated discovery -> acquisition -> analyzer -> verifier -> publication chain. Reviewed/published fallback content is a legitimate availability mechanism. Automated ingestion is a background enhancement and must not become a blocker for the public surface.

### Current stop point

Do not reopen this emergency hotfix without a concrete defect or new product request. Do not infer that unrelated deferred P11-005/P11-009 infrastructure items are closed by this acceptance. Those broader items retain their previously documented status. For the current owner request, work pauses here.

## Policy Intelligence automatic-maintenance plan approved — 2026-10-01

The owner rejected manual-only policy maintenance as the long-term operating model. The accepted product direction is now **automatic daily maintenance with exception-only lawyer/admin intervention**.

### Approved target behavior

Keep the existing official-source-grounded pipeline and make it operationally simple:

`official-source discovery -> acquisition -> bilingual AI analysis -> existing evidence verifier -> automatic publication when the existing publication gate passes`

If status/effect/applicability/evidence is uncertain or verification fails, the item must remain held/`review_required` and must not become public. A failed crawler/provider/source run must never remove or hide already published/reviewed content.

Initial official source set remains:

1. `home-affairs-guidance`
2. `federal-register-legislation`
3. `art-immigration-review`

### Minimal implementation sequence

**Step A — one-command all-source sync + publication-rule confirmation**

- Add one operator command that serially runs the existing live sync for all three configured official sources.
- Reuse the existing discovery/acquisition/analyzer/verifier/publication implementation; do not create a second pipeline.
- Preserve existing verified auto-publication semantics: only the existing publication gate may publish automatically; held/review-required results remain non-public.
- One source failure must not prevent attempts for the remaining configured sources; final command status/report must make partial failure observable.
- Add deterministic offline/fake coverage for orchestration and publication/hold behavior.
- No AWS/scheduler/admin UI/database migration in Step A.

**Step B — minimal admin exception control**

- Add a small authenticated admin Policy Intelligence management surface.
- Required operations only: view current policy items, archive/unpublish, and restore/reactivate.
- Use the existing durable `editorialStatus` lifecycle where possible; avoid new schema/migration unless source review proves it unavoidable.
- An `archived` item acts as an explicit suppression tombstone: later automatic sync may observe the official source but must not silently republish that item until an authorized admin restores it.
- Lawyer/admin work is exception handling, not mandatory pre-publication review.

**Step C — one daily AWS schedule**

- Use one EventBridge Scheduler entry invoking one independent ECS one-off Policy Intelligence operator task; do not run sync inside the long-lived web service.
- Initial cadence approved by product direction: **daily at 06:00 Australia/Sydney**.
- The scheduled operator runs the Step-A all-source command serially.
- Manual reviewed fallback content remains available as disaster recovery and must not be deleted merely because automation is enabled.
- After deployment, run one bounded live acceptance proving discovery -> analysis -> verification -> publication, plus admin archive persistence across a subsequent sync.

### Complexity constraints

Do not add Kafka, a policy queue, multi-worker orchestration, mandatory lawyer approval, review email workflows, new RAG/ReasoningBank paths, extra AI reviewer layers, or a Policy Intelligence architecture rewrite. Reuse the current durable Policy Intelligence item/snapshot/revision/sync-run model and existing verifier/publication gate.

### Current execution point

The emergency UI hotfix remains closed and accepted. **Step A is now the next coding unit.** Step B and Step C must not be implemented implicitly in the Step-A coding task.

## Policy Intelligence automatic-maintenance Step A implementation — 2026-10-01

**Scope:** Step A only. Added a thin all-source CLI wrapper around the existing single-source policy:sync operator. The wrapper runs child processes serially in the configured order: home-affairs-guidance, federal-register-legislation, then art-immigration-review. Child stdout/stderr is discarded; the wrapper prints only source IDs, succeeded/failed status, aggregate status, and exit code. A failed source does not prevent later attempts. The command exits 0 only when all three succeed and 1 if any fail. The existing discovery, acquisition, analysis, verification, repository and publication path is reused without pipeline or schema changes.

**Publication contract:** Existing pipeline coverage was run and left unchanged. It verifies verified/eligible publication; unsupported decisive claims, uncertain source status, and unsupported source status remain held/review_required; failed later work does not remove existing published history.

**Changed files:**

- chatbot/package.json — added policy:sync-all, preserving policy:sync.
- chatbot/scripts/policy-sync-all.ts — serial subprocess orchestration and safe aggregate status.
- chatbot/scripts/policy-sync-all.test.ts — offline ordering, serial execution, continue-after-failure, aggregate exit, and summary-redaction tests.
- docs/agent-memory/CURRENT_HANDOFF.md — this implementation record.

**Validation:**

- Focused command: pnpm exec node --import tsx --test scripts/policy-sync-all.test.ts lib/policy-intelligence/pipeline.test.ts — PASS, 41 passed, 0 failed, 0 skipped.
- pnpm build — PASS. Next.js emitted a non-blocking notice that the local baseline-browser-mapping data is over two months old.
- git diff --check — PASS.
- No AWS call or resource change occurred. No database connection or migration occurred. No live OpenAI/provider or official-source sync occurred.
- Work remains uncommitted and unpushed. Step B and Step C are not implemented.
- Unresolved issue: none identified in this Step A source-only change.

## Policy Intelligence automatic maintenance Step A — ACCEPTED — 2026-10-01

Remote implementation checkpoint `4f6b1a905698970ae8a21ede41531cfd53f2dab4` was independently reviewed and accepted.

Accepted behavior:

- `pnpm policy:sync-all` is a thin wrapper around the existing single-source `policy:sync` operator.
- Sources execute serially in the required order: Home Affairs -> Federal Register -> ART.
- A failed source does not prevent later sources from being attempted.
- Aggregate result is bounded and safe; exit code is 0 only when all source runs succeed and 1 on any partial failure.
- Existing discovery/acquisition/analyzer/verifier/repository/publication behavior is reused without a parallel pipeline.
- Existing verifier/publication-gate semantics remain unchanged.
- No AWS, database migration, live provider/source sync, Step-B admin UI or Step-C scheduler work was included.

Focused validation was reported PASS: 41 tests, production build, and `git diff --check`.

**Next active unit: Step B — minimal authenticated admin archive/restore control with archived-item suppression across future automatic sync.**

## Policy Intelligence automatic-maintenance Step B implementation — 2026-10-01

**Scope:** Step B only. Added an admin-only /admin/policy-intelligence page and /api/admin/policy-intelligence GET/PATCH endpoint. The page lists durable database-backed items and supports archive/unpublish and restore. The source-code manual fallback registry is untouched.

**Lifecycle and sync behavior:** Archive sets the item editorialStatus to archived without deleting snapshots or revisions. Public reads already require published item status, so archived items disappear from live public list/detail/history projections. Restore sets published only when the latest published revision still belongs to the item and matches its latest snapshot; otherwise it returns the item to review_required. Sync skips already archived items before snapshot/analyzer work, and the transaction-locked publish path suppresses an in-flight publication with safe outcome item_archived. Held writes preserve archived status. Only an explicit admin restore re-enables the item.

**Authorization:** The page uses the existing verified staff page guard restricted to admin. GET/PATCH use the existing requireAdminUser guard. The admin portal links to the new page. No lawyer/customer permissions were widened.

**Changed files:**

- chatbot/app/admin/policy-intelligence/page.tsx
- chatbot/app/api/admin/policy-intelligence/route.ts
- chatbot/components/admin-policy-intelligence.tsx
- chatbot/app/admin-portal/page.tsx
- chatbot/lib/policy-intelligence/admin-api.ts
- chatbot/lib/policy-intelligence/admin-api.test.ts
- chatbot/lib/policy-intelligence/admin-service.ts
- chatbot/lib/policy-intelligence/memory-repository.ts
- chatbot/lib/policy-intelligence/pipeline.ts
- chatbot/lib/policy-intelligence/pipeline.test.ts
- chatbot/lib/policy-intelligence/repository.ts
- docs/agent-memory/CURRENT_HANDOFF.md

**Validation:**

- Focused command: pnpm exec node --import tsx --test lib/policy-intelligence/admin-api.test.ts lib/policy-intelligence/pipeline.test.ts lib/policy-intelligence.test.ts — PASS, 53 passed, 0 failed, 0 skipped.
- pnpm build — PASS. Next.js emitted a non-blocking notice that local baseline-browser-mapping data is over two months old.
- git diff --check — PASS after final source and documentation review.
- No database migration or connection occurred. No AWS call occurred. No live provider or official-source sync occurred.
- Work remains uncommitted and unpushed. Step C is not implemented.
- Unresolved issue: none identified in this source-only Step B change.

## Policy Intelligence automatic maintenance Step B — ACCEPTED — 2026-10-01

Remote implementation checkpoint `e741ff1b6d7ffc8dd662cd50e1c232d3256f272d` was independently reviewed and accepted.

Accepted behavior:

- Added authenticated admin-only Policy Intelligence management at `/admin/policy-intelligence`.
- Admin can archive/unpublish and restore/reactivate durable live Policy Intelligence items.
- Archive preserves snapshots/revisions/history and removes the item from public published reads.
- Archived items are suppression tombstones. The automatic sync path skips archived items and the transaction-locked `publishRevision` path also refuses publication if archiving races with an in-flight publish.
- Restore returns to `published` only when the latest published revision still matches the current latest snapshot; otherwise the item returns to `review_required`.
- Existing admin authorization boundaries are reused; customer/lawyer permissions were not widened.
- No schema migration, AWS call, deployment, or live provider/source sync was included.

Focused validation was reported PASS: 53 tests, production build, and `git diff --check`.

**Next active unit: Step C — deploy the independent Policy Intelligence operator and schedule one daily run at 06:00 Australia/Sydney.**


## Policy Intelligence automatic maintenance Step C source implementation — 2026-10-01

**Scope:** Step C source artifact only. Added a dedicated Node 22 operator image, separate from the long-lived Next.js web image. It installs the existing chatbot package from `pnpm-lock.yaml`, includes the existing TypeScript sync source, and defaults to `pnpm policy:sync-all`. The image has no exposed web port and does not start Next.js or run migrations. Its build-time import check and offline smoke do not invoke the sync.

**Runtime configuration contract:** The future ECS task must inject `POSTGRES_URL`, `OPENAI_API_KEY`, `POLICY_INTELLIGENCE_ENABLED=true`, and any configured Policy Intelligence model/provider settings. The image contains no credentials or environment values.

**Changed files:**

- `chatbot/Dockerfile.policy-sync-runner`
- `docs/agent-memory/CURRENT_HANDOFF.md`

**Validation:**

- Focused command: `pnpm exec node --import tsx --test scripts/policy-sync-all.test.ts lib/policy-intelligence/pipeline.test.ts` — **PASS**, 43 passed, 0 failed, 0 skipped. Covers serial order/partial failure, verifier-gated publication and held states, and Step-B archive/sync suppression.
- `docker build --platform linux/amd64 -f chatbot/Dockerfile.policy-sync-runner -t immigration-ai-policy-sync:local .` — **PASS**. Image metadata confirms the default command is `pnpm policy:sync-all` and no ports are exposed.
- Offline container smoke — **PASS**. Node 22 with tsx imported the operator module; the assertion confirmed the `runPolicySyncAll` API resolved and no web server handle started. The sync command was not invoked.
- `pnpm build` — **PASS**. Next emitted the existing non-blocking notice that local `baseline-browser-mapping` data is over two months old.
- `git diff --check` — **PASS**.

**Deployment boundary:** No AWS resource was inspected or mutated, no database connection/migration occurred, and no live OpenAI/provider or official-source sync was invoked. The daily EventBridge schedule does not exist yet. Next action: after source review, perform authoritative AWS inspection and separately deploy/register the dedicated ECS operator task, then conduct one bounded live task acceptance before enabling the 06:00 `Australia/Sydney` schedule.

## Policy Intelligence automatic maintenance Step C — DEPLOYED / ACCEPTED — 2026-10-01

Step C is complete. The dedicated Policy Intelligence operator was built, pushed by immutable digest, registered as an independent ECS/Fargate one-off task, exercised successfully against the live staging environment, and then scheduled once daily.

### Accepted source/runtime checkpoint

- Source commit: `dc8595d365b565c869bcc82f2f02bc9cfd8ab9ec`
- Operator Dockerfile: `chatbot/Dockerfile.policy-sync-runner`
- Default command: `pnpm policy:sync-all`
- ECR repository: `747452892291.dkr.ecr.ap-southeast-2.amazonaws.com/immigration-ai/chatbot`
- Image tag used for deployment: `policy-sync-dc8595d`
- Immutable image digest: `sha256:3caad29bc292b79de2508a4e0fdebb086a97824a709f45309e959b3fb369f28c`

### ECS operator deployment

- Cluster: `immigration-ai-staging`
- Dedicated task-definition family: `immigration-ai-staging-policy-sync`
- Accepted task definition: `immigration-ai-staging-policy-sync:1`
- Runtime: Fargate / Linux / X86_64
- Network: existing staging awsvpc subnets and security group; public IP enabled
- No ALB/listener/inbound port
- Secrets are injected through existing SSM references for `POSTGRES_URL` and `OPENAI_API_KEY`
- `POLICY_INTELLIGENCE_ENABLED=true` is provided as task environment
- Operator logs use the existing staging chatbot CloudWatch log group with `policy-sync` stream prefix

### Bounded live acceptance

Manual ECS task:

`arn:aws:ecs:ap-southeast-2:747452892291:task/immigration-ai-staging/89f58a1729724b71bf85d33cd981adb0`

Result:

- task reached `STOPPED`
- stop code: `EssentialContainerExited`
- container exit code: **0**
- running image digest exactly matched `sha256:3caad29bc292b79de2508a4e0fdebb086a97824a709f45309e959b3fb369f28c`
- aggregate operator result: `status=succeeded`, `exitCode=0`
- all three configured sources succeeded:
  - `home-affairs-guidance`
  - `federal-register-legislation`
  - `art-immigration-review`

The AWS CLI `tasks-stopped` waiter timed out before the task completed because the live run took roughly 13.5 minutes. This was not an operator failure; authoritative ECS state later showed successful completion with exit code 0.

### EventBridge Scheduler

- Schedule name: `immigration-ai-staging-policy-sync-daily`
- Schedule ARN: `arn:aws:scheduler:ap-southeast-2:747452892291:schedule/default/immigration-ai-staging-policy-sync-daily`
- State: **ENABLED**
- Expression: `cron(0 6 * * ? *)`
- Timezone: `Australia/Sydney`
- Flexible time window: OFF
- Target: ECS cluster `immigration-ai-staging`
- Target task definition: `immigration-ai-staging-policy-sync:1`
- Launch type: Fargate
- Task count: 1
- Retry policy: maximum event age 3600 seconds; maximum retry attempts 1
- Scheduler IAM role: `arn:aws:iam::747452892291:role/immigration-ai-staging-policy-sync-scheduler-role`

The timezone-aware schedule therefore runs at 06:00 Sydney local time across daylight-saving changes.

### Final operating model

Policy Intelligence automatic maintenance is now operational:

`daily Scheduler -> dedicated ECS one-off operator -> policy:sync-all -> official-source discovery/acquisition -> AI analysis -> verifier -> existing publication gate`

Step-B admin archive/restore remains the exception-control layer. Archived items remain suppressed across future syncs until explicitly restored. Existing reviewed manual fallback content remains the public disaster-recovery path.

**Automatic Policy Intelligence maintenance Steps A, B and C are complete and accepted.**

## 2026-10-01 Policy Intelligence scheduler acceptance clarification

The Step-C deployment record above remains valid, with one important precision:

- the **manual live ECS operator run passed**;
- the AWS CLI `tasks-stopped` waiter timed out before the task itself finished;
- the task subsequently reached `STOPPED` with container `exitCode=0`;
- the final operator aggregate reported all three sources succeeded;
- the EventBridge Scheduler was created and is `ENABLED` for 06:00 `Australia/Sydney`;
- however, the Scheduler has **not yet reached its first natural 06:00 invocation since creation**, so a naturally triggered scheduled run has not yet been observed end-to-end.

Therefore the correct status is:

**implementation/deployment complete; manual live operator acceptance PASS; scheduler configuration/enablement PASS; first natural scheduled-trigger observation pending.**

This is not a source-code blocker and does not reopen Steps A/B/C implementation. The only remaining operational confirmation for this feature is to observe the next Scheduler-triggered ECS task and confirm its normal completion/log result.

## Admin Policy Intelligence publication diagnostics — 2026-10-02

**Scope:** Admin observability only. `/api/admin/policy-intelligence` now returns the latest stored snapshot and the latest analysis revision for that snapshot, plus `publicationDiagnostics`. For unpublished items, diagnostics reuse the existing `evaluatePublicationGate` against stored analysis, verification, and snapshot evidence, preserving every gate reason and unsupported verifier assessment. A small explanation map keeps each original `reasonCode`; unknown codes remain intact and receive a safe fallback explanation. The page displays item status, source URL/title/retrieved time, revision number/generated time/status, and every diagnostic. Published items report no blocking diagnostics and do not render the detail section.

Source sync failures are stored by source rather than item. When the latest source run is failed or partial, its safe error code is shown with a `source_sync` scope and an explicit note that it is not item-specific. No pipeline, analyzer, verifier, publication threshold, or stored schema behavior changed. No database migration or AWS change was made.

**Changed files:**

- `chatbot/lib/policy-intelligence/publication-diagnostics.ts`
- `chatbot/lib/policy-intelligence/publication-diagnostics.test.ts`
- `chatbot/lib/policy-intelligence/admin-api.ts`
- `chatbot/lib/policy-intelligence/admin-api.test.ts`
- `chatbot/lib/policy-intelligence/admin-service.ts`
- `chatbot/lib/policy-intelligence/memory-repository.ts`
- `chatbot/components/admin-policy-intelligence.tsx`
- `chatbot/package.json` — registered the diagnostics and admin API tests in `test:unit`.
- `docs/agent-memory/CURRENT_HANDOFF.md`

**Validation:**

- `pnpm exec node --import tsx --test lib/policy-intelligence/publication-diagnostics.test.ts lib/policy-intelligence/admin-api.test.ts lib/policy-intelligence/pipeline.test.ts` — **PASS**, 49 passed, 0 failed, 0 skipped.
- `pnpm test:unit` — **PASS**, 478 passed, 0 failed, 0 skipped.
- `pnpm build` — **PASS**. Next emitted the existing notice that local `baseline-browser-mapping` data is over two months old.
- `git diff --check` — **PASS**.
- Requested `pnpm test` (Playwright E2E) — **INCOMPLETE / FAIL**. The first two chat tests timed out after 240 seconds waiting for the home-page `multimodal-input` control; the other 46 tests were not completed. The remaining run was stopped after the repeated startup/page-load failure. The build and unit suite pass.

No AWS resources were changed and no database migration was applied.

## 2026-10-02 Policy Intelligence candidate pipeline failure diagnostics

**Scope:** Admin observability only. Candidate-level failures from `runPolicyIntelligenceSync` now record the item ID, snapshot ID when available, source config ID, processing stage, allowlisted safe error code, static safe message, and timestamp. The diagnostics are stored in the existing `PolicyIntelligenceSyncRun.metadata` JSON field and projected only onto the matching item by `/api/admin/policy-intelligence`. The admin detail section displays each recorded pipeline failure with its stage, code, message, and time. Unknown exceptions map to `pipeline_error`; exception text and provider responses are not persisted in the item diagnostic. No discovery behavior, verifier requirements, publication rules, or thresholds changed. No database migration or AWS change was made.

**Changed files:**

- `chatbot/lib/policy-intelligence/pipeline.ts`
- `chatbot/lib/policy-intelligence/pipeline-failure-diagnostics.ts`
- `chatbot/lib/policy-intelligence/repository.ts`
- `chatbot/lib/policy-intelligence/admin-api.ts`
- `chatbot/lib/policy-intelligence/admin-api.test.ts`
- `chatbot/lib/policy-intelligence/admin-service.ts`
- `chatbot/lib/policy-intelligence/memory-repository.ts`
- `chatbot/lib/policy-intelligence/pipeline.test.ts`
- `chatbot/components/admin-policy-intelligence.tsx`
- `docs/agent-memory/CURRENT_HANDOFF.md`

**Validation:**

- Focused pipeline tests — **PASS**, 44 passed, 0 failed.
- `pnpm test:unit` — **PASS**, 482 passed, 0 failed, 0 skipped.
- `pnpm build` — **PASS**. Next emitted the existing notice that local `baseline-browser-mapping` data is over two months old.
- `git diff --check` — **PASS**.

## 2026-10-02 Policy Intelligence analysis failure classification

**Scope:** Analysis-stage diagnostics only. The analyzer now classifies installed AI SDK 6 error types (`APICallError`, `RetryError`, `NoObjectGeneratedError`, `JSONParseError`, `TypeValidationError`, and related typed failures), Zod validation errors, and the provider abort signal into safe operational codes. Unknown analyzer exceptions become `analysis_internal_error`. Persisted diagnostics include an allowlisted error class name and a generic explanation; raw messages, prompts, source content, model output, provider request/response data, and stack traces are not persisted. The analyzer prompt, verifier, retry configuration, discovery, and publication behavior are unchanged. No schema/database or AWS changes were made.

**Changed files:**

- `chatbot/lib/policy-intelligence/analysis-diagnostics.ts`
- `chatbot/lib/policy-intelligence/provider.ts`
- `chatbot/lib/policy-intelligence/pipeline.ts`
- `chatbot/lib/policy-intelligence/pipeline-failure-diagnostics.ts`
- `chatbot/lib/policy-intelligence/pipeline.test.ts`
- `chatbot/components/admin-policy-intelligence.tsx`
- `docs/agent-memory/CURRENT_HANDOFF.md`

**Validation:**

- Focused pipeline tests — **PASS**, 48 passed, 0 failed, 0 skipped.
- `pnpm test:unit` — **PASS**, 486 passed, 0 failed, 0 skipped.
- `pnpm build` — **PASS**. Next emitted the existing notice that local `baseline-browser-mapping` data is over two months old.
- `git diff --check` — **PASS**.

## 2026-10-02 Policy Intelligence analyzer timeout retry

**Scope:** The analyzer/provider boundary now retries exactly once when its own first-attempt timeout aborts the request. The first attempt uses the configured timeout (normally 45 seconds); the second uses 60 seconds. Model, reasoning effort, evidence, prompt, structured-output schema, and `maxRetries: 0` remain the same. SDK AbortErrors not caused by this timeout and all other failures do not retry. If the second attempt fails, the pipeline remains fail-closed and records safe attempt metadata (`attemptCount`, `timeoutSeconds`, `retryReason`) with the classified diagnostic. A successful retry resumes the existing verifier and publication flow. No verifier/publication/discovery/schema/database/scheduler/AWS behavior changed.

**Changed files:** `chatbot/lib/policy-intelligence/analysis-diagnostics.ts`, `chatbot/lib/policy-intelligence/provider.ts`, `chatbot/lib/policy-intelligence/pipeline.ts`, `chatbot/lib/policy-intelligence/pipeline-failure-diagnostics.ts`, `chatbot/lib/policy-intelligence/pipeline.test.ts`, `chatbot/components/admin-policy-intelligence.tsx`, and this handoff.

**Validation:** Focused pipeline tests — **PASS**, 52 passed, 0 failed, 0 skipped; `pnpm test:unit` — **PASS**, 490 passed, 0 failed, 0 skipped; `pnpm build` — **PASS** (Next reported the existing outdated `baseline-browser-mapping` data notice); `git diff --check` — **PASS**.

## 2026-10-02 Policy Intelligence per-attempt analysis telemetry

**Scope:** Diagnostics only. Every analyzer attempt now records attempt number, timeout, elapsed milliseconds, evidence packet count and character count, approximate input character count, configured model, reasoning effort, and a safe outcome code. The analyzer stores only those scalar measurements; prompts, source text, generated output, provider bodies, credentials, and stack traces are excluded. Attempt records and candidate failures use the existing sync-run metadata JSON and are returned by the admin API. The admin detail view displays attempts and keeps source-wide sync diagnostics in a separate section, outside item publication diagnostics. Fail-closed behavior, timeout values, retry rules, model, prompt, verifier, publication gate, discovery, and database schema are unchanged; no AWS changes or migration.

**Changed files:** `chatbot/lib/policy-intelligence/analysis-diagnostics.ts`, `chatbot/lib/policy-intelligence/provider.ts`, `chatbot/lib/policy-intelligence/pipeline.ts`, `chatbot/lib/policy-intelligence/pipeline-failure-diagnostics.ts`, `chatbot/lib/policy-intelligence/repository.ts`, `chatbot/lib/policy-intelligence/memory-repository.ts`, `chatbot/lib/policy-intelligence/admin-api.ts`, `chatbot/lib/policy-intelligence/admin-service.ts`, `chatbot/lib/policy-intelligence/publication-diagnostics.ts`, their focused tests, `chatbot/components/admin-policy-intelligence.tsx`, and this handoff.

**Validation:** Focused Policy Intelligence tests — **PASS**, 3 test files passed, 0 failed; `git diff --check` — **PASS**. `pnpm test:unit` — **PARTIAL/FAIL**, 68 passed and 3 unrelated files failed: the GuardDuty worker subprocess returned no self-test stdout, the migration CLI subprocess returned exit code 1 instead of 2, and the local HTTP tests could not bind `127.0.0.1` (`EPERM`). All Policy Intelligence test files passed. `pnpm build` — **FAIL**, Next could not fetch the existing Geist and Geist Mono Google Fonts because network access was unavailable. A repository-wide `tsc --noEmit` also reports unrelated type errors; no errors remain in the touched production files after filtering to this change.

## 2026-10-02 Policy Intelligence analysis timeout increase

**Scope:** Analysis timeout policy only. The analyzer now uses a fixed 90-second first attempt and retries once at 120 seconds only when its own timeout aborts the first attempt. The AI SDK `maxRetries` remains zero. Model, reasoning effort, prompt, evidence, output schema, verifier timeout, fail-closed behavior, publication gate, discovery, acquisition, evidence truncation, and editorial behavior are unchanged. Attempt telemetry and retry diagnostics report the actual 90/120-second timeouts. No schema, scheduler, or AWS changes.

**Changed files:** `chatbot/lib/policy-intelligence/provider.ts`, `chatbot/lib/policy-intelligence/analysis-diagnostics.ts`, `chatbot/lib/policy-intelligence/pipeline.ts`, `chatbot/lib/policy-intelligence/pipeline-failure-diagnostics.ts`, `chatbot/lib/policy-intelligence/pipeline.test.ts`, and this handoff.

**Validation:** Focused Policy Intelligence tests — **PASS**, 3 files passed, 0 failed; `git diff --check` — **PASS**. `pnpm test:unit` — **PARTIAL/FAIL**, 68 passed and the same 3 unrelated sandbox-sensitive files failed (GuardDuty worker subprocess stdout, migration CLI subprocess exit code, and HTTP tests denied local bind with `EPERM`). `pnpm build` — **FAIL**, Next could not fetch Geist and Geist Mono from Google Fonts because network access was unavailable.


## 2026-10-03 Policy Intelligence diagnostics pause checkpoint

**Owner decision:** pause further Policy Intelligence verifier/publication-gate investigation because other work has priority. Preserve the current strict verifier/publication behavior while paused; no verifier threshold relaxation or publication-gate weakening is authorized by this checkpoint.

### Canonical deployed checkpoint before pause

- Branch/source checkpoint: `047fc2f9ab2abee7ba247b00e0106019beff840a` (`fix: extend policy analysis timeouts`).
- Web ECS task definition: `immigration-ai-staging-web:40`.
- Web image digest: `sha256:00a942688c7fe59ed0fba5976dc59b120a32979e3b6a5f2eef9a3789e21242a7`.
- Policy-sync ECS task definition: `immigration-ai-staging-policy-sync:6`.
- Policy-sync image digest: `sha256:2e634728631cec771e44c6900274ef07b3d052c01570102dcc81b9b476000188`.
- EventBridge Scheduler `immigration-ai-staging-policy-sync-daily` remains configured to target policy-sync task definition `:6`.
- Manual acceptance task: `arn:aws:ecs:ap-southeast-2:747452892291:task/immigration-ai-staging/2e1ed8bf3eeb4217a6a44a31c547c489`.
- Manual acceptance result: task reached `STOPPED`, container exit code `0`; runtime approximately 17:56:53 to 18:00:44 Sydney time on 2026-10-02.

### 90s / 120s timeout-policy acceptance evidence

The previous 45s first-attempt / 60s retry policy was too aggressive for `gpt-5.6-sol` with high reasoning. After checkpoint `047fc2f`, the first analyzer attempt is 90 seconds and exactly one retry at 120 seconds is allowed only when the analyzer's own timeout fires.

Live telemetry from the post-deployment manual run showed:

- subclass 494 Home Affairs item `9411bc08-97e0-4427-a25c-33ce273d153f`: first attempt used a 90-second timeout and succeeded after **70,991 ms**; evidence packet count 1, evidence chars 538, approximate input chars 2,914; no analyzer pipeline failure;
- ART scheduled public hearings item `82a7713c-6789-4d50-8d22-2ecd46676491`: first attempt used a 90-second timeout and succeeded after **66,721 ms**; evidence packet count 1, evidence chars 7,450, approximate input chars 10,050; no analyzer pipeline failure.

This is sufficient evidence to treat the immediate analyzer-timeout problem as mitigated. Do not increase timeout again without new live evidence.

### Remaining substantive issue when paused

The next problem is verifier/publication-gate semantics rather than analyzer liveness.

The 494 item now reaches analysis and verification successfully but remains `review_required`. Its current publication diagnostics include:

- `source_status_not_fully_supported`;
- `unsupported_narrative_unit`;
- `insufficient_support` for `group-subclass-494-applicants`;
- `insufficient_support` for `source-status`.

The ART scheduled-public-hearings item also completes analysis but remains `review_required`; among its reasons are `source_not_policy_relevant`, source-status uncertainty/support concerns, a conditional-claim uncertainty issue, and insufficient support for the source-status unit. This is not itself evidence that the verifier is wrong; the 494 item is the preferred diagnostic case because it is clearly a core Home Affairs visa page.

### Local-only diagnostic endpoint work at pause boundary — NOT YET IN REMOTE SOURCE

Immediately before the pause, a coding agent reported a completed **local, uncommitted and unpushed** admin-only read-only detail endpoint:

`GET /api/admin/policy-intelligence/[id]`

Reported behavior:

- validates the item ID as UUID;
- reuses the existing admin authentication boundary;
- selects the highest-numbered revision tied to the item's **current latest snapshot**;
- enforces item/snapshot/revision ownership;
- returns the full stored, schema-validated `analysis` and `verification`;
- returns only safe model metadata;
- does not expose normalized evidence/source bodies, prompts, raw provider requests/responses, stack traces, credentials or secrets;
- safely returns `revision: null` when the current snapshot has no revision;
- does not change analyzer, verifier, publication gate, discovery, timeout policy, database schema or AWS configuration.

Reported validation for that local WIP:

- focused admin API tests: **9 passed, 0 failed**;
- `git diff --check`: **PASS**;
- `pnpm test:unit`: 68 passes plus the same three sandbox-sensitive failures already recorded for the prior diagnostics work;
- `pnpm build`: blocked because the environment could not fetch existing Geist fonts from Google Fonts.

**Important:** this endpoint is not part of remote checkpoint `047fc2f`, is not deployed, and must not be assumed available merely because this handoff records it. The local working tree must be preserved and reviewed before any reset, pull, rebase or cleanup.

### Resume protocol

When this work resumes:

1. Inspect `git status --short` and preserve the local uncommitted admin-detail endpoint diff before any destructive Git operation.
2. Sync this documentation checkpoint without discarding the local WIP.
3. Re-run the focused admin tests, `pnpm test:unit`, `pnpm build` in a normal network-capable environment, and `git diff --check`.
4. Review the exact endpoint diff; then commit/push/deploy it separately if accepted.
5. Retrieve the 494 item through the admin-only detail endpoint and inspect the **complete stored analysis + verification assessments**.
6. Only after that evidence review decide whether any verifier/prompt/publication-gate correction is justified. Do not weaken legal evidence gates merely to force publication.

### Deferred architectural observations

Two earlier observations remain deferred and are not part of the current pause checkpoint:

- discovery-driven retries can leave a failed latest snapshot without a compatible revision if that URL stops being rediscovered; a future explicit retry/recovery mechanism may be warranted;
- item-level historical `editorialStatus` can be operationally confusing when the latest snapshot has not completed analysis/revision creation; future admin UX may distinguish item lifecycle status from latest-snapshot processing state.

No change is authorized for either observation while the current work is paused.


## 2026-10-04 Lawyer-feedback UI consolidation — ACTIVATED

**Owner priority change:** suspend further Policy Intelligence verifier/publication-gate optimisation and prioritise the lawyer-requested whole-site product/UI consolidation. The existing 2026-10-03 Policy Intelligence pause checkpoint remains authoritative. Do not resume 494 verifier/publication-gate work until this UI consolidation is complete and accepted.

### Preservation boundary

- Remote Phase-11 checkpoint before this record: `8cb4ca34cb9eef698843190945ec7cf2e34d41f9`.
- Deployed Policy Intelligence runtime checkpoint remains `047fc2f9ab2abee7ba247b00e0106019beff840a`.
- The existing local-only admin revision-detail endpoint WIP is intentionally **uncommitted/unpushed/undeployed** and must be preserved.
- Do not reset, clean, overwrite, or mix that Policy Intelligence WIP into the lawyer-feedback UI work.
- Preferred execution model: create a separate local worktree/branch from the updated remote Phase-11 branch for the UI consolidation.

### Product interpretation of the lawyer feedback

The public product should be simplified around four primary destinations:

1. **首页 / Home**
2. **AI 工作台 / AI Workspace**
3. **服务与联系 / Services & Contact**
4. **法律动态 / Legal Updates**

The current public Services / Process / Contact split is too fragmented. Contact should become the canonical combined service/contact surface; legacy routes should remain compatible through redirects rather than being deleted.

Home should keep the Sydney Opera House visual identity but use a brighter image treatment, move latest immigration/legal updates directly below the hero, reduce large white surfaces, and keep the visual system predominantly deep navy.

AI Workspace is the core product surface. The desktop workspace should behave like a fixed application shell rather than a long marketing/document page. The central conversation scrolls independently. The right context rail should be simplified to **Known information**, **To confirm**, and a user-triggered **Generate case summary** action. AI confidence must not be shown to customers. Backend confidence fields may remain if required by existing contracts.

VIP/human-service messaging should expose two distinct existing service paths where entitlement permits:

- request a lawyer to review a specific AI answer;
- start/book a one-to-one lawyer consultation using the accepted P11-008 consultation workflow.

Do not mislabel the current bounded clarification/consultation workflow as real-time lawyer chat unless a real-time messaging product is separately implemented.

The public Legal Updates experience should expose only two user-facing groups: published/in-force and proposed/planned. Internal legal/source statuses remain unchanged and retain their current provenance semantics.

Policy-to-AI continuity should create a **new conversation** carrying the selected policy/topic reference, show only a lightweight opener such as “针对『…』，您有什么需要我帮忙的吗？”, and wait for the user's question. Merely opening the policy-linked workspace must not automatically call the answer model or produce a long policy analysis.

### Execution model — three coarse development stages only

#### LF-01 — Public Experience Consolidation — ACTIVE

One implementation unit covering:

- four-item public navigation;
- Home information hierarchy and brighter Opera House treatment;
- Services + Process + Contact consolidation into the canonical Services & Contact page;
- legacy route compatibility;
- public Legal Updates two-group presentation;
- bilingual/mobile consistency required by those changes.

Do not split navigation, Home, Contact, redirects, or Legal Updates presentation into separate milestones.

#### LF-02 — AI Workspace Consolidation — PLANNED

One implementation unit covering:

- fixed desktop workspace shell;
- central independent message scrolling;
- right rail reduced to Known / To Confirm;
- removal of customer-visible AI confidence;
- explicit user-triggered case-summary generation;
- clear lawyer-review + one-to-one consultation service paths;
- preservation of existing conversation, document, answer-mode, legal-source, auth and entitlement behavior.

#### LF-03 — Policy-to-AI Continuity + Final Product Integration — PLANNED

One implementation unit covering:

- policy/legal-update CTA -> **new** conversation;
- topic reference carried into the new conversation;
- lightweight assistant opener with no automatic analysis/model call;
- user question then enters the normal Fast / Legal Check / Premium answer flow;
- cross-page naming, footer/account/mobile-nav consistency;
- final bounded bilingual/mobile polish.

### Final acceptance + deployment — one consolidated gate

After LF-01/LF-02/LF-03 are source-reviewed, freeze feature changes and run one concentrated acceptance pass covering Home, Legal Updates, Policy -> AI, AI Workspace, case summary, lawyer review, lawyer consultation, and Services & Contact across representative desktop/mobile and zh-CN/English states.

Then run the repository-appropriate unit/focused tests, `pnpm build`, and `git diff --check`. If accepted: one commit/push sequence as appropriate, one deployment, and one production smoke/visual review.

### Anti-loop operating discipline

- Do not create LF-01A/LF-01B/R1/R2 micro-milestones.
- Non-blocking visual or copy imperfections are recorded for the stage-end/final polish batch instead of interrupting implementation.
- A stage is interrupted only for a true blocker: broken route, build/compile failure caused by the stage, broken auth/data boundary, severe responsive overflow, incorrect bilingual semantics, or loss of an accepted workflow.
- Each LF stage should normally require **one implementation commit and at most one necessary correction commit** after review. Reaching repeated correction commits is a signal to stop and reassess the design rather than continue patching.
- Do not reopen the paused Policy Intelligence analyzer/verifier/publication-gate investigation as part of this task.


## 2026-10-04 LF-01 verified / LF-02 activated

### Remote verification

LF-01 was source-reviewed and visually accepted, committed, pushed, and independently verified on GitHub.

- branch: `phase11-lawyer-feedback-ui-consolidation`
- verified LF-01 commit: `5719cee319ac022a6c6c4761820e8892779e6039`
- commit message: `feat: consolidate public immigration service experience`
- remote commit contains exactly the 15 reviewed LF-01 files.
- local and remote branch heads matched `5719cee319ac022a6c6c4761820e8892779e6039` and the LF worktree was clean after restoring the Next.js-generated `next-env.d.ts` development-only change.
- focused LF-01 validation: 46 passed, 0 failed.
- production build: passed.
- changed-file Biome validation: passed.
- `git diff --check`: passed.
- desktop/mobile visual smoke: passed for Home, Services & Contact, Legal Updates, and four-item mobile navigation.

Accepted LF-01 behavior:

- primary public navigation is Home / AI Workspace / Services & Contact / Legal Updates;
- `/contact` is the canonical combined public service/contact surface;
- `/services` and `/process` redirect to `/contact`;
- Home keeps the Opera House asset with a brighter treatment and places Legal Updates directly after the hero;
- public Legal Updates maps `in_force|announced -> published`, `proposed|consultation -> proposed`, while `superseded` is excluded from the primary public listing but underlying status/history/provenance semantics remain intact.

The Next.js development overlay and technical account display observed during local smoke are not LF-01 blockers and are not authorised reasons to reopen LF-01.

### Policy Intelligence WIP preservation update

The previously local-only admin revision-detail WIP has now been safely preserved on a separate remote branch without merging or deploying it:

- branch: `policy-intelligence-admin-detail-wip-20261004`
- commit: `a73e3b51cb091b275f46116bad911ede445be54d`
- focused admin API tests: 9 passed, 0 failed.

Policy analyzer/verifier/publication-gate work remains paused. Do not merge that WIP into the LF branch and do not resume 494 diagnostics during LF-02.

### LF-02 — AI Workspace Consolidation — ACTIVE

LF-02 is one coarse implementation unit. Do not split it into shell/right-rail/summary/VIP micro-milestones.

#### A. Desktop application shell

The AI Workspace must behave like an application, not a long public page.

- On desktop, constrain the workspace to the available viewport below the site header.
- Remove the AI Workspace page footer from the application surface if necessary to achieve a non-scrolling desktop page.
- The outer desktop page must not vertically scroll during normal workspace use.
- Keep the mode selector/header controls visible.
- Conversation history may scroll inside the left rail.
- The central message list must remain independently scrollable while the composer stays visible.
- The right context rail may scroll internally when its content exceeds the viewport.
- Mobile may remain naturally stacked/scrollable; do not force the desktop three-column geometry onto narrow screens.
- Do not change LF-03 policy-continuity behavior in this stage.

#### B. Right context rail = Known + To Confirm + manual summary

Remove customer-visible:

- Current Matter / matter type;
- next action;
- AI confidence and confidence note;
- duplicate latest-sources block;
- generic lawyer-handoff promo card.

Keep legal sources/citations where they already belong: attached to the relevant assistant answer in the central conversation.

The right rail must contain only:

1. **Known information**
   - sourced from the latest assistant interaction plan's `known_facts_summary`;
   - show the available structured facts rather than an arbitrary first-six truncation;
   - use existing localized fact labels and safe value rendering;
   - show a clear localized empty state when no known facts are available.

2. **To confirm**
   - sourced from the current structured `requested_facts` rather than only the first requested fact;
   - do not invent questions or legal facts;
   - preserve prompt/label wording from the interaction plan;
   - show a localized empty state when there is nothing currently to confirm.

3. **Generate case summary**
   - explicit user action only;
   - no automatic generation on answer arrival, conversation load, fact update, or mode change;
   - LF-02 should implement this as a deterministic client-side snapshot/rendering of the already-available structured context (Known + To Confirm), not as a new LLM/model call;
   - no new backend endpoint, DB mutation, provider call, or billing event is required for LF-02;
   - clicking generates/replaces a visible structured summary snapshot; subsequent conversation changes must not silently rewrite an already-generated snapshot;
   - a user may explicitly regenerate it to capture the latest structured context;
   - this summary is not lawyer advice and must not claim legal conclusions that are absent from the structured source data.

If a future product decision requires a prose/model-generated matter brief, that is a separate task and not a reason to expand LF-02.

#### C. Human lawyer services

Preserve the existing answer-level `LawyerRequestAction` and its VIP entitlement behavior.

For an entitled VIP user, the human-service surface associated with an answer should make two distinct paths clear:

- request a lawyer to review this AI answer;
- continue to the existing P11-008 one-to-one lawyer consultation request flow using `consultationCreateHref(chatId)`.

Do not:

- invent real-time lawyer chat;
- alter the consultation lifecycle/state machine;
- globally restrict an existing consultation route that is currently available elsewhere;
- change VIP billing/entitlement semantics;
- change lawyer-request ownership/snapshot/RBAC semantics.

Existing Guided Intake consultation continuity may remain; LF-02 should avoid duplicative large promo cards.

#### D. Preserve accepted workspace behavior

Do not regress:

- conversation create/list/load and `chatId` continuity;
- Fast / Legal Check / Premium mode access;
- answer routing/provider policy;
- political gate;
- guided intake/fact submission;
- document upload/selection/evidence presentation;
- answer-level citations/sources;
- lawyer-request persisted-message identity;
- consultation continuity;
- auth/session/RBAC;
- backend response contracts, including the `confidence` field if other code still relies on it.

Removing confidence from the customer UI does not authorise removing it from backend contracts.

#### E. LF-02 concentrated validation

After the complete LF-02 implementation, run one concentrated validation batch rather than validation after each component edit.

At minimum cover:

- workspace copy/helper tests;
- consultation continuity helper tests;
- relevant lawyer-request/VIP tests;
- any new deterministic context-summary helper tests;
- existing focused workspace-adjacent tests affected by the change;
- `pnpm build`;
- changed-file Biome/formatter validation;
- `git diff --check`.

Then perform one local visual smoke with the existing `.env.local` link:

Desktop:
- page itself does not scroll;
- history rail scrolls internally if needed;
- message list scrolls while composer remains visible;
- right rail contains only Known / To Confirm / manual summary;
- no customer-visible confidence;
- lawyer review and one-to-one consultation paths are clear.

Mobile:
- no severe horizontal overflow;
- stacked workspace remains usable;
- Known / To Confirm / manual summary remain reachable;
- bilingual switch remains usable.

#### F. Stop boundary

At the end of LF-02:

- report exact changed files and functional behavior;
- report focused tests/build/Biome/diff-check;
- report any real blocker and a separate list of minor non-blocking polish observations;
- leave the implementation uncommitted and unpushed for independent review;
- do not start LF-03;
- do not deploy.


## 2026-10-04 LF-02 verified / LF-03 activated

### Remote verification

LF-02 was independently source-reviewed, corrected once for a real conversation-isolation defect, revalidated, committed, pushed, and independently verified on GitHub.

- branch: `phase11-lawyer-feedback-ui-consolidation`
- verified LF-02 commit: `1fab2376fb72dc02587b46b1f6b9157379a5b3ee`
- commit message: `feat: consolidate AI workspace experience`
- remote commit contains exactly the nine reviewed LF-02 files.
- local and remote branch heads matched `1fab2376fb72dc02587b46b1f6b9157379a5b3ee`; working tree was clean.
- final focused tests: 23 passed, 0 failed.
- final standard unit suite: 497 passed, 0 failed, 0 skipped.
- production build: passed.
- changed-file Biome: passed.
- `git diff --check`: passed.
- desktop visual smoke: passed; outer workspace did not scroll and manual case-summary generation worked.
- mobile 390px smoke: passed with no horizontal overflow.
- VIP-entitled visual state was not directly inspected; source-level entitlement/consultation boundaries were reviewed and no guard was bypassed.

Accepted LF-02 behavior:

- desktop AI Workspace is a viewport-constrained application shell without the public SiteFooter;
- conversation/history/context panes use internal scrolling and the composer remains visible;
- right rail is Known information + To confirm + explicit manual summary;
- all current structured known/requested facts are shown;
- customer-visible AI confidence/current matter/next-action/duplicate-source/generic-handoff panels are removed;
- case summary is a deterministic user-triggered frozen snapshot and does not call a model/backend;
- the snapshot is cleared when creating or switching to a different conversation and preserved when reloading the same chat;
- lawyer review and existing P11-008 one-to-one consultation remain distinct paths.


### LF-03 — Policy-to-AI Continuity + Final Product Integration — ACTIVE

LF-03 is the final feature stage before the consolidated acceptance/deployment gate. Keep it as one bounded implementation unit.

#### A. Policy -> AI must create exactly one fresh conversation

The Legal Updates detail CTA remains the entry point, but it must carry an explicit one-time launch intent in addition to the validated policy slug.

Recommended bounded contract:

- `policyWorkspaceHref(slug)` includes a one-time launch marker, e.g. `/ai-workspace?policy=<slug>&launch=policy`;
- guest-auth redirect preserves both the policy slug and launch marker;
- after the server resolves a valid published `PolicyWorkspaceReference`, the workspace creates one new conversation through the existing immigration-conversation POST path;
- use a bounded localized policy-derived conversation title where practical;
- after successful creation, replace the URL with `policy=<slug>&chatId=<new id>` and remove the launch marker;
- reload of that consumed URL must load the same conversation and must not create another conversation;
- invalid/unpublished policy slugs degrade safely to the ordinary AI Workspace and must not create a policy-linked conversation.

Do not use a random/timestamp launch token and do not create multiple conversations from React rerenders.

#### B. Topic reference and lightweight opener

The selected published policy reference is a topic pointer, not legal evidence.

The linked conversation should show one concise deterministic opener/reference derived from the existing server-resolved public `PolicyWorkspaceReference`:

- localized policy title;
- official title/source identity;
- optional official-source link;
- a short bilingual instruction inviting the user to ask a question.

Opening the policy handoff must not call Fast, Legal Check, Premium, the legal-service backend, or another model.

Prefer a deterministic UI opener over persisting a fake assistant answer. It must not become a lawyer-reviewable AI answer or claim that legal analysis has already occurred.

Avoid showing both a large policy banner and a second large opener; consolidate the continuity presentation into one clear compact surface.

#### C. Policy context enters the normal answer flow only after the user asks

A question such as “Does this affect me?” must retain the selected topic context without treating the policy-page AI interpretation as verified legal evidence.

Use the existing published policy slug/reference as a bounded topic hint only.

Recommended safe path:

- while the current `chatId` is the policy-linked chat, include the policy slug as an optional bounded request field;
- after the normal political gate/auth/ownership checks, server-side code resolves that slug through the existing published-policy resolver before using it;
- if resolution succeeds, include a small system/topic-context entry in the legal-service `frontend_messages` (or the closest existing shared context mechanism) containing only the published topic identity needed for continuity;
- do not replace or rewrite the user's visible question;
- do not persist the topic hint as a fake user/assistant message;
- do not use the policy-page AI summary as authoritative evidence;
- normal Fast / Legal Check / Premium research/source behavior remains responsible for the actual answer;
- if server-side resolution fails, answer the user's question normally without policy context rather than trusting client-supplied title/source text.

Keep the implementation shared/bounded where practical rather than copy-pasting divergent policy-context logic across three answer routes.

#### D. Conversation-boundary isolation

Policy continuity must belong only to the launched chat.

- Switching to another existing conversation must stop applying the policy context.
- Clicking the normal New Conversation button must create an ordinary conversation and clear the active policy continuity from client URL/state.
- Reloading the policy-linked chat URL keeps the policy reference for that chat.
- Do not allow one policy handoff to leak into another conversation.
- LF-03 does not require a new DB column or migration unless current source proves a durable server field already exists and is clearly safer to reuse. Do not invent a schema migration merely for this UI handoff.

This stage guarantees immediate/reload continuity for the launched policy chat; cross-device archival policy linkage is not being introduced here.

#### E. Preserve LF-01 / LF-02 accepted behavior

Do not regress:

- four-item primary public navigation;
- canonical Services & Contact surface and legacy redirects;
- Home hierarchy and two-group Legal Updates presentation;
- fixed desktop AI Workspace shell and internal scrolling;
- Known / To Confirm rail;
- manual frozen case-summary snapshot semantics and conversation isolation;
- Fast / Legal Check / Premium access/routing;
- political gate;
- guided intake;
- documents and evidence provenance;
- answer-level citations/sources;
- lawyer-review persisted message identity/RBAC;
- P11-008 consultation continuity;
- auth/session/VIP billing boundaries;
- Policy Intelligence provenance/publication semantics.

Do not resume verifier/publication-gate diagnostics or merge the separate Policy WIP branch.

#### F. Final product integration polish

Within the same LF-03 stage, perform only bounded integration polish directly related to the lawyer feedback:

- consistent Home / AI Workspace / Services & Contact / Legal Updates naming in zh-CN and English;
- consistent CTA wording between Legal Updates and AI Workspace;
- no duplicate policy-continuity cards;
- no obvious desktop/mobile overflow introduced by LF-03;
- account/header/footer behavior remains consistent with the accepted LF-01 information architecture;
- do not launch unrelated design rewrites.

Minor unrelated polish remains deferred to the final acceptance batch.

#### G. LF-03 concentrated validation

At minimum cover:

- policy workspace href + guest redirect helper tests;
- published-policy reference resolver tests;
- one-time launch/idempotence pure helper tests;
- policy-chat boundary/URL-state helper tests;
- any new bounded policy-topic request-context helper tests;
- relevant workspace/conversation tests;
- all three answer-mode request-schema/context tests if they are touched;
- existing political-gate tests affected by request-context handling;
- `pnpm test:unit` once after final LF-03 source changes;
- production build;
- changed-file Biome;
- `git diff --check`.

Visual smoke should verify:

- clicking Ask AI from a policy detail creates one new conversation;
- the linked topic/opener is visible without an automatic answer/model call;
- refreshing does not create a second conversation;
- user question then receives a normal answer through the selected mode;
- switching conversation/new conversation clears policy context;
- desktop application shell remains non-scrolling;
- mobile remains usable;
- zh-CN / English copy remains coherent.

#### H. Stop boundary

Leave LF-03 source uncommitted and unpushed for independent review.

Do not deploy yet. After LF-03 source review/commit/push, enter one consolidated final acceptance/deployment gate across LF-01/LF-02/LF-03.



## 2026-10-05 LF-03 verified / Final Acceptance activated

### Remote LF-03 verification

LF-03 was source-reviewed, committed, pushed, and independently verified on GitHub.

- branch: `phase11-lawyer-feedback-ui-consolidation`
- verified LF-03 commit: `02b8b254ebc5d44b68ac24a1597a7ce6333a1d13`
- commit message: `feat: complete policy to AI continuity`
- remote commit contains exactly the 16 reviewed LF-03 files.
- local and remote heads matched the verified commit and the worktree was clean.
- focused TypeScript tests: 58 passed.
- focused legal-service tests: 42 passed.
- chatbot standard unit suite: 499 passed, 0 failed.
- production build: passed.
- changed-file Biome: passed.
- `git diff --check`: passed.
- browser smoke verified one new conversation per policy launch, refresh idempotence, no model call on page open, compact policy opener, policy clearing on chat switch/new conversation, bilingual opener copy, desktop non-scrolling shell, and no 390px horizontal overflow.

Accepted LF-03 behavior:

- Legal Update “Ask AI” uses `/ai-workspace?policy=<slug>&launch=policy`;
- successful launch consumes the marker and retains `policy + chatId`;
- refresh does not create another conversation;
- opener is deterministic display-only UI, not a persisted assistant answer;
- actual user submission alone sends optional `policySlug`;
- each answer route server-resolves the published policy and builds a bounded topic-reference-only context;
- visible/persisted user question remains unchanged;
- policy page AI interpretation is not promoted to evidence;
- topic hint is not retained as normal frontend/full conversation history;
- switching/new conversation clears client policy continuity.

Known acceptance gap: during LF-03 smoke the local legal-service at `127.0.0.1:8000` was not running, so a completed real model answer with answer-associated citations from the policy-linked path remains to be verified in the consolidated final acceptance gate.


### Consolidated Final Acceptance + Deployment Gate — ACTIVE

There is no LF-04. Feature development is frozen unless this gate finds a true release blocker.

#### A. Gate objective

Validate LF-01 + LF-02 + LF-03 as one product flow, including the one integration gap that could not be completed during LF-03 local smoke: a real legal-service/model answer with citations from a policy-linked conversation.

This gate is acceptance first, deployment second. Do not deploy merely because unit/build checks are green.

#### B. Source/state preflight

Before running acceptance:

- work only in `~/immigration_ai_lf` on `phase11-lawyer-feedback-ui-consolidation`;
- require a clean worktree at the latest docs checkpoint;
- preserve the separate `policy-intelligence-admin-detail-wip-20261004` branch at `a73e3b51cb091b275f46116bad911ede445be54d`;
- do not merge or resume Policy Intelligence verifier/publication diagnostics;
- do not modify AWS during the acceptance run;
- verify the local legal-service can start with the existing private environment without printing secrets.

#### C. Automated acceptance

Run one consolidated automated batch after source freeze:

Chatbot:
- `pnpm test:unit`;
- production build;
- repository-established lint/Biome check on the accepted product surface;
- `git diff --check`.

Legal service:
- the full repository-appropriate pytest suite if runtime is practical;
- otherwise, at minimum all policy-context, conversation-memory, Fast direct, Premium direct, query/routing, political-gate integration, and document/provenance suites touched by LF-03.

A test failure is a blocker only if attributable to the accepted LF work or an existing release-critical defect. Do not launch unrelated cleanup.

#### D. Real local end-to-end policy -> AI acceptance

Start the real local legal-service and chatbot using the existing private local environment. Do not expose secrets.

Run at least one valid published Legal Update through the complete path:

1. open policy detail;
2. click Ask AI;
3. verify exactly one new conversation is created;
4. verify URL becomes `policy=<slug>&chatId=<id>` with no launch marker;
5. verify compact deterministic opener and official-source link appear;
6. verify no widget/model request occurs before user submission;
7. refresh and confirm the same chat is loaded with no duplicate conversation;
8. submit a natural policy-dependent question;
9. verify the selected Fast or Legal Check lane reaches the live local legal-service;
10. verify the user-visible/persisted question is unchanged;
11. verify the resulting answer is a normal answer, not the policy-page AI summary;
12. when the answer uses sources, verify citations/source links are present and remain answer-associated;
13. verify the policy topic hint is not visible as a fake chat message and is not persisted as user/assistant history;
14. switch to another conversation and verify policy context clears;
15. create New Conversation and verify policy context clears.

Also exercise Premium if local entitlement/test data permits it without modifying billing state. If Premium cannot be exercised safely, record it as a coverage limitation rather than bypassing entitlement.

#### E. Whole-product functional matrix

Validate representative customer flows:

Public experience:
- Home;
- Services & Contact;
- legacy `/services` and `/process` redirects;
- Legal Updates list/detail;
- four-item primary navigation;
- zh-CN default and English switch.

AI Workspace:
- new/list/load conversation;
- Fast;
- Legal Check;
- Premium where legitimately entitled;
- fixed desktop shell / internal scrolling;
- mobile stacked behavior;
- Known information;
- To confirm;
- manual Generate case summary;
- frozen snapshot + explicit regenerate;
- snapshot clear on chat boundary;
- document panel remains usable;
- answer citations/sources remain attached to answers.

Human services:
- lawyer review action on an eligible persisted assistant answer;
- existing request/status continuity;
- one-to-one consultation entry and existing P11-008 continuity;
- no claim of real-time lawyer chat;
- no RBAC/ownership regression.

Policy continuity:
- launch once;
- refresh idempotence;
- no auto model call;
- bounded server-resolved topic hint;
- no context leakage across chats.

#### F. Visual/responsive matrix

Use representative desktop and 390px mobile views for:

- Home;
- Services & Contact;
- Legal Updates list;
- Legal Update detail;
- AI Workspace ordinary conversation;
- policy-linked AI Workspace;
- manual case summary;
- lawyer-review/consultation actions where legitimately available.

Check both zh-CN and English for the critical Policy -> AI and AI Workspace flows.

Do not reopen source for minor spacing/cosmetic preferences unless they cause clipped content, severe overflow, unreadable controls, broken hierarchy, or misleading semantics.

#### G. Security/provenance invariants

Acceptance must confirm:

- policy slug is validated and server-resolved;
- unpublished/private policy data is not exposed through the public handoff;
- policy AI interpretation is not treated as legal evidence;
- political gate still applies to the real user submission;
- conversation ownership remains server-authoritative;
- policy topic context does not become persisted fake user/assistant content;
- document evidence/provenance boundaries remain intact;
- lawyer review and consultation keep existing ownership/RBAC;
- backend confidence may exist but remains absent from the customer right rail.

#### H. Acceptance decision

PASS requires:

- no release-blocking automated failure;
- real policy-linked question reaches the running legal-service;
- no duplicate launch/chat-context leakage;
- core public/workspace/human-service flows remain usable;
- no security/provenance regression;
- production build remains green.

If a true blocker is found:
- stop;
- document one bounded release correction;
- do not create LF-04 or a broad new milestone.

If only non-blocking polish remains:
- record it;
- accept the feature set without reopening implementation.

#### I. Deployment gate after acceptance PASS

Deployment is a separate explicit action after acceptance evidence is recorded.

Before deployment:
- commit/push any accepted release correction if one was required;
- verify remote branch and clean worktree;
- update project-state docs with final acceptance evidence;
- identify the currently authoritative staging/production deployment procedure from repo docs rather than relying on stale commands;
- confirm no paused Policy Intelligence WIP is included;
- confirm required environment/config is already present without printing secrets.

Then perform one reviewed deployment according to the repository's current canonical procedure, followed by production smoke of Home, Legal Updates, Policy -> AI, AI Workspace, lawyer review/consultation entry, and Services & Contact.

Do not resume the paused Policy Intelligence verifier/publication investigation until this product release has been accepted and the deployment smoke is complete.




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

RR-01 was accepted at implementation commit
`199ad837bc417682b2257c3a95462fe8a1514bdf`, fast-forwarded into
`phase11-chinese-service-platform-ui-rebase`, pushed and remotely verified,
then deployed to staging. The staging web rollout completed with `/ping` HTTP
200; policy-sync task definition `:7` was deployed and selected by the
scheduler; and a manual sync completed. Its real staging evidence informed
RR-02 diagnosis.

## 2026-10-06 RR-02 guidance contract — FULLY ACCEPTED; STAGING REVALIDATION PASS

RR-02 source review is ACCEPTED, owner full local validation is PASS, and
staging revalidation is PASS. The accepted implementation is canonical commit
`9461efbe14b22936e6a7311eaadbff413d02070f`
(`fix: align policy guidance publication contract`) on
`phase11-chinese-service-platform-ui-rebase`. RR-02 is committed, pushed and
staging-deployed. RR-01 remains the accepted/deployed predecessor recorded
above. The protected Policy WIP branch remains untouched.

RR-02 corrected Home Affairs structured-alert normalization/truncation
provenance, added the `published_guidance` source status without implying
legislative force, and tightened general subject/scope instructions while
preserving the strict publication gate. Analyzer/verifier implementation
versions are v2.2; analysis schema remains v2. The database status field
is a varchar, so no migration is planned. Alert fingerprints use full
normalized semantic content and a fixed bounded metadata fallback for empty
alerts; preview bounds remain independent.

Final owner-local validation passed: focused Policy Intelligence tests 106/106;
full unit suite 522/522 with zero failures and zero skips; Next.js production
build passed and generated the production route manifest; and
`git diff --check` passed. The implementation is frozen. Staging acceptance
deployed chatbot image digest
`sha256:7381056fc38d4f116bbb4c55ab62818c586c0aefa9503f9ad8700b8066f2c3f3` as
web task definition `:42`; legal-service image was unchanged. The policy-sync
runner uses task definition `:10` and image digest
`sha256:58c5382a83f92a339f38af43e6a3f6fed47a9000988ea06aac5ac2f7c37354fa`.
The existing enabled daily scheduler retained its cron/timezone and now targets
`:10`. The one-shot sync task exited with policy-sync `exitCode 0` and is a
successful completion. The complete staging record is in
`docs/agent-memory/tasks/PI-RR-02-GUIDANCE-CONTRACT.md`.

The analysis schema remains v2, analyzer/verifier remain v2.2, and the strict
publication gate is unchanged. No database migration was added; Federal
Register RR-01 discovery/ranking remains unchanged; and the protected WIP
remains untouched. See
`docs/agent-memory/tasks/PI-RR-02-GUIDANCE-CONTRACT.md` for exact scope and
validation details.

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


## 2026-10-10 China Stripe payments — CODE MERGED / ACTIVATION PAUSED

The owner prioritized Stripe WeChat Pay prepaid VIP, preserved the existing AUD card subscription, and explicitly deferred Alipay recurring, Stripe account configuration, credentials, CNY pricing and live payment testing. The billing architecture was kept bounded to one implementation pass.

Implementation boundaries: only verified Stripe webhook events may grant VIP; webhook processing validates payment state, mode, method, purchase/session/user correlation, amount and CNY currency; purchase and user row locks protect idempotency and additive expiry. WeChat grants 30 days from `max(now, current expiry)`. Browser return state is notice-only. No schema/migration, database, Stripe Dashboard, or AWS changes were made.

Detailed task packet: `docs/agent-memory/tasks/STRIPE-CHINA-PAYMENTS-2026-10-10.md`.

The original implementation is on `feature/stripe-china-wechat-prepaid-20261010` from canonical `phase11-chinese-service-platform-ui-rebase`. External review identified two defects, both corrected in commit `0ecde0437f39f44075cbd73333925d8ac4ccb1a7`: subscription deletion now derives the remaining entitlement from paid, unexpired Stripe CNY purchases under the user lock shared with prepaid settlement; renewal UI now requires active subscription status and respects cancellation state. A pending, incomplete, unpaid, past-due or paused subscription no longer exposes recurring controls for prepaid VIP.

### Implementation-pass handoff — 2026-10-10

**Status:** WeChat prepaid implementation and both external-review corrections are committed and pushed on `feature/stripe-china-wechat-prepaid-20261010`; correction commit `0ecde0437f39f44075cbd73333925d8ac4ccb1a7` was verified against the remote. The branch is based on canonical `phase11-chinese-service-platform-ui-rebase` at `0033c878bd9a3a8f4d16f5f910dd9fa7d1248433`. Alipay remains unavailable by the owner's explicit decision pending Stripe approval and its supported authorization flow.

The existing AUD card subscription path still uses its prior subscription checkout, recurring invoice, cancellation and Billing Portal behavior. WeChat uses a server-priced Stripe Checkout Session in `payment` mode with only `wechat_pay`, a CNY one-time line item and no subscription object. `VIP_WECHAT_PAY_ENABLED=true`, a valid positive-integer `VIP_WECHAT_CNY_30_DAY_AMOUNT_MINOR`, configured Stripe API access, and a nonblank `STRIPE_WEBHOOK_SECRET` are all required to expose checkout; neither amount nor duration is accepted from the browser. The session's ID and server-generated purchase ID are persisted in the existing `VipPurchase` table before the URL is returned.

The signed webhook path checks complete/paid state, payment mode/method, session and purchase IDs, owner, fixed product/duration, amount and CNY currency before settlement. A completed but still-unpaid WeChat session is ignored until Stripe's later async-success event. Purchase-row locking prevents duplicate settlement and user-row locking serializes separate prepaid purchases. A paid purchase grants 30 days from `max(now, current vipExpiresAt)`; recurring invoice projection preserves a later prepaid expiry. Browser `checkout` query state remains notice-only. Alipay status is hardcoded unavailable and checkout returns 503. No Alipay price key, capability flag, direct SDK, or unsupported subscription flow was added after the owner answered that Stripe preview access is not approved.

No database migration/schema change was added or applied. No database, Stripe Dashboard, live Stripe payment, or deployment was performed. The code reads `VIP_WECHAT_PAY_ENABLED` and `VIP_WECHAT_CNY_30_DAY_AMOUNT_MINOR`, plus the existing Stripe API and webhook signing secrets; none were configured in this task. Account setup, credentials, the approved CNY price, and live payment testing remain deferred. No Alipay key exists; recurring Alipay remains unavailable pending account approval and a documented supported authorization flow.

Initial focused validation after the webhook-secret fail-closed fix: 8 billing/config/UI test files passed, 0 failures, 0 skips. On the external-review correction pass, 9 focused entitlement, membership-copy and billing test files passed, 0 failures, 0 skips; changed-file Biome passed on 6 files; `git diff --check` passed. The earlier full chatbot unit suite reported 71 passes, 2 environment/unrelated failures, and 0 skips: `lib/server-http-timeouts.test.ts` could not bind `127.0.0.1` in the sandbox (`listen EPERM`), and `lib/production/stage3-hardening.test.ts` expected migration CLI exit 2 but got 1. The earlier production build was blocked when Next.js could not fetch Geist fonts from Google Fonts. These broader checks were not repeated for this correction pass. The standalone TypeScript check touched `chatbot/tsconfig.tsbuildinfo`, which was restored to its starting contents.

The initial HTTPS push attempt encountered an authentication blocker, which was later resolved. The external-review correction commit `0ecde0437f39f44075cbd73333925d8ac4ccb1a7` was pushed to `feature/stripe-china-wechat-prepaid-20261010`; `git ls-remote` confirmed remote HEAD equals local HEAD. No schema or migration changed; no Stripe configuration, credentials, live payment, database, AWS, merge or deployment occurred. Stop for final external code review.

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

## 2026-10-16 Emergency document-processing hotfix — READY FOR EXTERNAL REVIEW (historical; later live-accepted)

The focused hotfix is on `hotfix/document-processing-reliability-20261016`, based on `audit/document-processing-all-formats-20261016` at `edc593fb8317d56f3aa7a94a3c322abf61703b2b`. It packages the PDF.js worker asset in the standalone processing route, preserves `malformed_document` for malformed/password/format errors, and reports missing parser dependencies and parser runtime failures as safe retryable server errors. The processing endpoint now distinguishes invalid input (422), parser/storage failures (503), and processing timeout (504) from true state conflicts (409). Explicit retry of a failed parser run is covered; existing extraction and evidence bounds are unchanged.

The final local production image built successfully on Node 22.23.3 `linux/amd64` and passed native PDF extraction plus the all-format production runtime gate. All 11 supported formats passed 20-run small, medium, and large synthetic tiers. The pre-fix base image reproduced the PDF packaging failure while the other formats passed. A focused upload-to-Fast evidence test passed for PDF, DOCX, TXT, XLSX and PNG; Vision and Fast transport were mocked. Document-focused Node tests passed 11/11 with zero failures or skips. Changed-file Biome passed on 15 source/test/script files. The production Docker build's TypeScript stage passed.

The standalone project `tsc --noEmit --pretty false --incremental false` remains non-green with 44 diagnostics, matching the audit baseline; there are no diagnostics in the changed implementation, runtime verifier, or newly added E2E test. Two diagnostics appear in unchanged helper assertions in the modified `processing.test.ts` (`state === "deleted"` and `run?.id`). `git diff --check` passed after the final documentation update.

Detailed implementation, all-format p50/p95 measurements, the baseline comparison, and in-memory stage timings are in `docs/agent-memory/audits/DOCUMENT_PROCESSING_HOTFIX_PERFORMANCE_2026_10_16.md`. These are synthetic local measurements, not Staging measurements. The exact ECS `:46` image and runtime platform were not inspected, and no AWS deployment, customer document, database, live AI request, payment, or malware-scanner/security-state operation was performed. Stop after the authorized branch push for external review; do not deploy.

<!-- BEGIN PHASE13_M2_A1_2_B2_1_R1_HISTORICAL_2026_10_26 -->
## Historical handoff — B2-1 R1 implementation before the additional R2 correction (2026-10-26)

- At the R1 checkpoint, GuardDuty response validation omitted the nonexistent response PlanId, checked returned ARN/bucket/prefix/status, approval expiry was checked before each request, and CLI output distinguished identity from incomplete collection. Independent R1 review later passed those corrections and identified the separate numeric `execFile()` exit classification defect now addressed in the authoritative R2 section above.
- R1 focused results were B2-1 **27/27**, B2-0 **16/16**, B1 evaluator **16/16**, B1 queue **11/11**, A1.2-A **17/17**. Full unit had the same three restricted-environment failures recorded in the R2 section. R1 patch: `~/phase13_m2_a1_2_B2_1_R1_review.patch`.
- This is a historical implementation checkpoint, not an acceptance record.

<!-- END PHASE13_M2_A1_2_B2_1_R1_HISTORICAL_2026_10_26 -->
