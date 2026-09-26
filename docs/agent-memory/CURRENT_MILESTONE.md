# CURRENT_MILESTONE

**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase  
**Status:** IN PROGRESS  
**Updated:** 2026-09-25

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
| P11-008 | Real appointment/consultation workflow | ACTIVE — STAGES 1–3 SOURCE ACCEPTED (`8350615`, `2d91c17`, `5304742`); 0022 remains unapplied on normal local DB; DISPOSABLE MIGRATED-DB/RUNTIME GATE ACTIVE |
| P11-009 | Bilingual/responsive/accessibility/E2E + AWS/staging acceptance, including deferred P11-005 production-readiness gates | PLANNED |

## P11-004 closure / next task state

P11-003C remains closed as VERIFIED at `fa02295675dc4343430ae0a109722141e669bbf9`.

P11-004 is **VERIFIED** at implementation commit `f2d941734d256c9e0a0e42988cd67cdb828d0dc6`. Both internal stages are complete and owner accepted; see `docs/agent-memory/tasks/P11-004.md` and `docs/agent-memory/CURRENT_HANDOFF.md`.

P11-004 remains **VERIFIED**. The roadmap has now been rebaselined so P11-005 is **Secure Matter Documents & AI File Intake**. P11-005 is **IN PROGRESS**. Stage 1 is accepted at `df5335356ac7c7fc908236a270e78f280e5387e6`; Stage 2 at `38e19c75bc131cc372c8c2682ec21e72834f8fb7`; Stage 3 matter/AI/lawyer integration is accepted after direct GitHub review at `b29816c56255762998d8fa55b56df64436a0b3c3`. P11-005 is not yet VERIFIED because production-readiness gates remain open. The former Client Portal milestone moves to P11-006; Lawyer Workspace to P11-007; Appointment / Consultation to P11-008; final bilingual/responsive/accessibility/E2E + staging acceptance to P11-009.

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

The default runtime E2E should keep consultation notifications disabled.

Separately, exercise one notification-enabled mutation against the disposable DB with a deliberately unsupported local email provider value and a dummy `.test` recipient, so failure occurs before any SES client send/network delivery.

Acceptance requires:

- DB mutation commits successfully;
- notification attempt fails locally;
- API/service result remains successful;
- request state and event persist;
- no AWS/SES network call occurs;
- logs contain only safe notification metadata.

Do not use real email addresses.

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
