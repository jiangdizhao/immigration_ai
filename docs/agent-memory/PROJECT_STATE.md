# PROJECT_STATE

**Updated:** 2026-09-26
**Project:** Immigration AI / Australian immigration & study service platform  
**Repository:** `jiangdizhao/immigration_ai`

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
- **P11-008 — Appointment / Consultation Workflow: ACTIVE; Stage 1 SOURCE ACCEPTED at `83506156546dcff2944b21edef16423a5b402d54`; migration `0022_first_slayback.sql` remains unapplied; migrated-DB transaction gate deferred; Stage 2 customer booking continuity is next.**
- **P11-009 — Final bilingual/responsive/accessibility/E2E + AWS/staging acceptance: PLANNED; must close the deferred P11-005 production-readiness gates before production readiness can be claimed.**

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
