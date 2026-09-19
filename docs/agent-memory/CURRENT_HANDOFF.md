# CURRENT_HANDOFF

**Updated:** 2026-09-20  
**Branch:** `phase11-chinese-service-platform-ui-rebase`  
**Phase 11 base:** `3b3653202f9b067fbed4adfd410edc02cb7215cc`  
**P11-001 verified checkpoint:** `4bc039c60f72e61e2e3b6a7cc26a88a862d5c1e3`  
**P11-002A verified checkpoint:** `d0964924be003fd61902fca760bd71aca53abe4f`  
**P11-002B verified checkpoint:** `9454a5e4b5a5c5515967ad977faa2355ba053fc5`  
**P11-003A implementation checkpoint:** `f7fa6363e4f2ee326306b20203692dd73e45cebd`  
**P11-003A provenance-hardening checkpoint:** `4f232fe40161a7adad104bcbf6c382b846425936`  
**P11-003B starting checkpoint:** `32454ec2dd7b13ab0d438df7337d7c4f7c1c69b1`
**Git-state rule:** verify the live branch tip with `git rev-parse HEAD`; documentation-only memory commits may advance HEAD without runtime changes  
**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase

## Current verified state

- P11-00: **VERIFIED**
- P11-001: **VERIFIED**
- P11-002A: **VERIFIED**
- P11-002B: **VERIFIED**
- P11-003A: **VERIFIED**
- P11-003B: **IMPLEMENTED IN WORKING TREE — OWNER REVIEW PENDING**

P11-003A was accepted after Git review of the public Policy Intelligence implementation and the focused R1 provenance correction.

Accepted behavior:

- bilingual `/intelligence` public stream/list;
- bilingual `/intelligence/[id]` detail route;
- public navigation and Home latest-policy preview;
- manual-first typed policy model;
- source/legal status separate from editorial publication status;
- public selectors expose only `published` entries;
- production registry intentionally empty until real policy content is verified;
- official verbatim excerpts live on source/provenance identity, not localized copy;
- AI analysis and lawyer commentary remain distinct presentation layers;
- unknown/unpublished detail slugs use Next `notFound()` behavior.

P11-003A validation after R1:

- unit tests: **166 passed**;
- production build: **passed**;
- changed-file Biome: **passed**;
- `git diff --check`: **passed**;
- repository-wide lint retains the known 22 unrelated diagnostics.

The strict HTTP status behavior of streamed/PPR not-found responses remains a staging acceptance concern rather than a blocker for the current source architecture.

## P11-003B implementation

P11-003B is implemented in the working tree and remains uncommitted/unpushed. The manual-first, repository-backed curation boundary now separates shared public projection logic from server-only editorial data.

Changed areas:

- `chatbot/content/policy-intelligence/registry.ts`: server-only editorial registry; it remains intentionally empty until verified real records are approved.
- `chatbot/lib/policy-intelligence-server.ts`: server-only loaders for Home previews, list projections, and detail projections.
- `chatbot/lib/policy-intelligence.ts`: shared types, validation, and pure published public-projection helpers; internal `origin` and `discovery` metadata are not projected.
- `chatbot/content/policy-intelligence/README.md`: manual curation, review, publication, provenance, and no-automation workflow.
- Home, list, and detail routes now load data on the server and pass only explicit public-safe props to client presentation components.
- Focused projection/boundary tests and the unit-test command were updated.

The production flow is: server-only registry → server loader → published public projection → client presentation. Draft/review-required/archived entries are filtered before reaching the client. Home receives an even smaller preview projection. No real policy content, database migration, admin editor, crawler, scheduler, web fetch, LLM summarizer, or automatic publication was added.

Validation for the working-tree implementation:

- `pnpm test:unit`: **169 passed, 0 failed, 0 skipped**.
- `pnpm build`: **passed**; Next compilation, TypeScript, and static generation completed.
- Changed-file Biome: **passed**.
- `git diff --check`: **passed**.
- `pnpm lint`: **fails on the existing repository-wide 22 diagnostics; no changed-file diagnostic was reported by the focused checks**.

Manual smoke checks performed: Home route and `/intelligence` empty-state rendering, English/Chinese locale switching, public navigation, responsive widths at 390/768/1280/1536px, and unknown intelligence detail rendering. No unpublished fixture was exposed to the browser; the production registry remains empty and the static server-boundary tests/build passed.

Known limitation: the existing streamed/PPR development behavior may return HTTP 200 for a rendered not-found response; the route still renders the not-found UI and this remains a staging acceptance concern.

Unresolved subjective questions: none for this infrastructure-only correction. Real policy records still require source verification, review, and explicit publication through the documented Git workflow.

Content/backend architecture confirmation: the public content architecture, locale architecture, routes, auth, roles, AI Workspace, service flows, legal-service, database, billing, email, and AWS behavior were preserved. Only the Policy Intelligence data-loading boundary and its tests/documentation changed.

## Review rule

The coding model must leave P11-003B changes uncommitted/unpushed. The owner will provide `git status --short` and `git diff --stat`; reviewer will then provide exact commit/push commands and inspect the GitHub diff after push.
