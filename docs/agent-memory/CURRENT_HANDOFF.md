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
