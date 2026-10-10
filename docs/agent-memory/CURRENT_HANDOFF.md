# CURRENT_HANDOFF

**Updated:** 2026-10-10
**Branch:** `phase11-chinese-service-platform-ui-rebase`  
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
