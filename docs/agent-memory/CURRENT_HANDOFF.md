# CURRENT_HANDOFF

**Updated:** 2026-09-24
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

P11-008 remains ACTIVE / NOT VERIFIED until Gate E evidence is externally accepted and the retained disposable DB receives explicit cleanup approval.

## P11-008 Gate E-Core accepted / E-Locale handoff — 2026-09-27

**P11-008 remains ACTIVE / NOT VERIFIED.** Stages 1–3 source gates and runtime Gates A–D are accepted. Gate E is split: **E-Core PASS / ACCEPTED**, **E-Locale NOT RUN / NEXT**, and **E-Visual NOT RUN / PENDING**. Do not record “Gate E = PASS” or “P11-008 = VERIFIED.”

### Frozen E-Core evidence

- **E1 PASS:** real customer create; admin assignment and proposal; assigned-lawyer visibility; customer confirmation; lawyer completion; final completed state and expected immutable events.
- **E2 PASS:** create, assign/propose, customer reschedule request; returns to requested, active proposal fields clear, reschedule event recorded.
- **E3 PASS:** real two-stage customer cancellation; cancelled state, exactly one cancellation event, terminal customer controls removed.
- **E4 PASS:** two pages loaded a stale revision; first cancellation succeeded; stale page sent exactly one PATCH and received 409; one refetch, zero automatic mutation retries, localized stale message, latest cancelled state, and DB revision/event state verified.
- **RBAC closure PASS:** customers cannot use admin/lawyer consultation authority; lawyer queues are assigned-only; unassigned consultations are excluded; lawyer detail has no assignment controls; admin requested-consultation assignment controls work; customer detail has no staff-only controls; lawyer consultation routes remain distinct from P11-007 lawyer-request routes.
- Real credential login/session was used. After harness calibration, session checks used BrowserContext-associated `context.request`; no forged auth cookies were used.

### Durable harness calibrations

- A generic `role=alert` assertion in Attempt 6 was a harness false positive; a bounded bootstrap diagnostic later confirmed a valid customer session, `/api/consultations` 200, `/consultations/new` 200, a healthy create form, and no consultation-client error.
- Page-bound, one-shot session observation was unreliable during login `router.replace` / `router.refresh`; use `context.request` for stable session validation.
- Attempt 4's admin-control failure was `ATTEMPT4_ASYNC_HARNESS_FALSE_NEGATIVE`: the detail page, assignment heading, and Save button were present; the selector appeared after `/api/admin/lawyers` completed (200, 34 verified lawyers, including the assigned lawyer). No product/RBAC defect was established.
- The final customer negative-control closure passed with each staff-only control absent individually. Harness-only startup/static-audit failures were not product defects.

### Database and next gates

Keep `chatbot_p11_008_gate_20260926_20c435` retained; cleanup is not authorized. The disposable DB remains migrated through 0022, with no 0023. The normal local `chatbot` DB remains unchanged at `0017_wooden_silver_sable` and has no `ConsultationRequest` or `ConsultationEvent`. Notifications were disabled during Gate-E browser work; no real external provider was required. Applying 0018–0022 to the disposable clone does not close P11-005 D-040; **P11-005 remains NOT VERIFIED**.

**Immediate next action: Gate E-Locale.** Independently verify actual `zh-CN` ↔ English switching and persistence. Then run Gate E-Visual for the seven consultation surfaces in both locales at desktop 1440×1000 and mobile 390×844 (28 planned screenshots). Manual screenshot acceptance remains external/owner review. Only after E-Locale, E-Visual, and final evidence review may Gate E overall be accepted and P11-008 marked VERIFIED.
