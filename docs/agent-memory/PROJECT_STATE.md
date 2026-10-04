# PROJECT_STATE

**Updated:** 2026-10-04
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
