# PROJECT_STATE

<!-- BEGIN PHASE13_STUDY_JOURNEY_2026_10_23 -->
## ACTIVE - Phase 13 Study Journey M0 preparation (2026-10-23; provisional)

**Owner decision:** Proceed with implementation preparation on `phase13-study-journey-project-centric` (reference base `8b963eea1aa4023d30f31eba816a545efaa65e3d`). Six design/PDF/PNG assets remain in `doc/`. The lawyer/education-agent has **not yet reviewed** the four fact/document matrices, which are `PROVISIONAL`. Start M0 design and read-only source audit now; no legal-rule approval, schema migration, code rollout, live submission, DB/AWS mutation or paid model call is authorized by this entry.

**Current canonical plan:** [PHASE13_STUDY_JOURNEY_ROADMAP.md](./PHASE13_STUDY_JOURNEY_ROADMAP.md) (M0-M10, all gates), and [M0-001 task contract](./tasks/PHASE13_M0_ARCHITECTURE_AUDIT.md). **M0-001: DRAFT DELIVERED; AWAITING OWNER REVIEW; NOT ACCEPTED.** [Audit report](./tasks/PHASE13_M0_001_AUDIT_RESULT.md) was prepared at `88385f2c0bff0ad636bfca7439d40ccc673ae2ef` on `phase13-study-journey-project-centric`. The older Architecture V2 PDF remains a design reference; this roadmap documents later owner changes (lawyer school review, professional engagement/contract/offline fee, independent self service, project human messaging, staff dashboard). D-009's no-Project restriction applied to Phase 12 only; Phase 13 design is separately owner-authorized without changing legacy data.

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
