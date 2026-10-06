# CURRENT_MILESTONE

**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase  
**Status:** IN PROGRESS  
**Updated:** 2026-10-04

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

## 2026-10-06 Emergency AI Workspace hotfix — ACTIVE

A small, fast hotfix is now the active task after RR-02 closure. The owner clarified the screenshot layout: **A is the AI conversation display and must gain vertical space; B is the composer and should remain intact; the document/upload area above A is what should be compressed.**

The hotfix has exactly two product fixes:

- compress the idle case-file/document area above the conversation so it no longer spends multiple rows listing supported formats, unverified-file copy, or an empty “file: —” state; preserve upload and real document/status controls when they are actually needed;
- fix Policy Update -> Ask AI continuity so first-turn references such as “这项政策 / this policy” reach semantic routing with the already-existing bounded, server-resolved policy topic reference instead of reaching the router context-free.

This is intentionally **not** a redesign. Runtime base is canonical commit `3a5e821e38c0ad5d52e041ac3ea46c34d6441c6d`. No database migration, Policy Intelligence analyzer/verifier/publication-gate change, answer-architecture rewrite, upload-backend redesign, or unrelated cleanup is authorised. Keep the production patch small (target roughly 2–4 source/test files), run focused regression tests plus build/diff-check, perform one local visual/behavior smoke, and stop when the two acceptance checks pass.

Detailed bounded plan: `docs/agent-memory/tasks/AI-WORKSPACE-EMERGENCY-HOTFIX-2026-10-06.md`.

