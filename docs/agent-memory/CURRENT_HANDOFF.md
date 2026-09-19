# CURRENT_HANDOFF

**Updated:** 2026-09-19  
**Branch:** `phase11-chinese-service-platform-ui-rebase`  
**Phase 11 base:** `3b3653202f9b067fbed4adfd410edc02cb7215cc`  
**P11-001 verified checkpoint:** `4bc039c60f72e61e2e3b6a7cc26a88a862d5c1e3`  
**P11-002A verified checkpoint:** `d0964924be003fd61902fca760bd71aca53abe4f`  
**P11-002B verified checkpoint:** `9454a5e4b5a5c5515967ad977faa2355ba053fc5`  
**Git-state rule:** verify the live branch tip with `git rev-parse HEAD`; documentation-only memory commits may advance HEAD without runtime changes  
**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase

## Current verified state

- P11-00: **VERIFIED**
- P11-001: **VERIFIED**
- P11-002A: **VERIFIED**
- P11-002B: **VERIFIED**
- P11-003A: **IMPLEMENTED IN WORKING TREE — OWNER REVIEW PENDING**

P11-002B was accepted after Git diff review and owner visual review of the refined Home, Services, Process and Contact desktop pages.

Implementation checkpoint:

`9454a5e4b5a5c5515967ad977faa2355ba053fc5`

The accepted public platform now has:

- Chinese-first / English-switchable shared shell;
- bilingual public page bodies;
- six-service public catalogue;
- V4-informed premium editorial presentation;
- responsive public-page primitives;
- explicit placeholder lawyer/team handling;
- no invented public contact facts.

## Newly confirmed missing capability

The owner identified that the main repository still lacks the V4 reference's **Policy Intelligence / 最新政策解读** capability.

The V4 reference contains:

- `/intelligence` policy stream/list;
- `/intelligence/:id` policy detail;
- Home latest-policy preview;
- source/status/date/affected-group presentation;
- explicit visual separation among source material, AI analysis and lawyer context.

The V4 policy records themselves are demonstration content and are **not** production facts.

## P11-003 architecture choice

The owner selected option **C**:

> Start with manually curated policy entries, while designing the content contract so a later phase can add automated discovery from authoritative sources plus human review/publication.

Therefore:

- P11-003A is frontend/content-model focused;
- no crawler, scheduler, background ingestion or database migration;
- no automatic publication;
- public routes render only explicitly publishable entries;
- V4 mock policy items must not be copied as live content;
- if there are no reviewed published entries yet, the public UI must show a truthful empty state;
- test fixtures may use clearly synthetic data that is never exported as public production content.

The model must distinguish source/legal status from editorial publication status.

## P11-003A implementation handoff

P11-003A is implemented on top of the accepted P11-002B baseline and remains
uncommitted/unpushed for owner review.

Changed files:

- `chatbot/lib/policy-intelligence.ts` — typed manual-first policy model,
  source/legal status and editorial status unions, published-only selectors,
  duplicate/metadata validation, bilingual status labels, and empty production
  registry;
- `chatbot/lib/policy-intelligence.test.ts` — synthetic-only selector and
  validation fixtures covering hidden statuses, independent statuses,
  deterministic ordering, duplicate IDs/slugs, bilingual copy, and unpublished
  route lookup;
- `chatbot/lib/public-content.ts` — `/intelligence` route identity plus
  bilingual Home and Policy Intelligence copy, including truthful empty states;
- `chatbot/lib/site-locale.ts` — bilingual `intelligence` navigation key;
- `chatbot/components/site-header.tsx` and `chatbot/components/site-footer.tsx`
  — responsive navigation/footer links;
- `chatbot/components/immigration-service-home.tsx` — Home latest-policy
  preview using the same `getPublishedPolicies()` selector as the list;
- `chatbot/components/policy-intelligence-page.tsx` — responsive list/detail
  presentation with search/filter support, source/legal badges, official
  source layer, AI-analysis layer, and optional lawyer-commentary layer;
- `chatbot/app/(chat)/intelligence/page.tsx` and
  `chatbot/app/(chat)/intelligence/[id]/page.tsx` — public list/detail routes;
- `chatbot/package.json` — includes the policy-intelligence unit test in
  `test:unit`.

Visual/refactor decisions:

- Adapted the accepted P11-002B editorial primitives rather than creating a
  second design-system framework.
- Used navy/green for official source information, purple for AI-assisted
  analysis, and amber for lawyer commentary.
- Kept cards tonal and spacious, used controlled asymmetry in the editorial
  hero, and protected long bilingual headings with wrapping/overflow-safe
  layout rules.
- Production policy data remains `MANUAL_POLICY_ENTRIES = []`; no V4 mock
  policy records, factual sources, dates, legal text, lawyer commentary, sync
  status, or publication counts were added.
- The detail selector resolves published slugs only. The browser showed the
  not-found content for an unpublished slug; in the Next dev/PPR check the
  navigation response status was observed as 200, so strict HTTP 404 behavior
  should be confirmed by the owner/reviewer if required by deployment policy.

Validation completed:

- `cd chatbot && pnpm test:unit`: **165 passed, 0 failed, 0 skipped**;
  localhost-dependent timeout tests required outside-sandbox execution.
- `cd chatbot && pnpm build`: **passed**; route output includes `/intelligence`
  and `/intelligence/[id]`.
- `cd chatbot && pnpm lint`: **failed on 22 pre-existing diagnostics** in
  unrelated files; no changed file was among the reported diagnostics.
- Changed-file Biome checks: **passed, 11 files checked**.
- `git diff --check`: **passed**.
- Full TypeScript check has no diagnostics in changed policy/public files; the
  repository still has the known pre-existing AI-model and billing fixture
  diagnostics.

Manual responsive checks actually performed:

- Home Chinese at 390px and 1280px; Home English at 768px and 1536px;
- Policy Intelligence Chinese at 1280px; English at 1280px and 390px;
- focused Home English locale/overflow check at 768px;
- mobile navigation opened at 390px and `Policy Intelligence` link was visible
  with `/intelligence` href;
- locale switch persisted across navigation; CTA and language controls remained
  usable;
- measured `document.documentElement.scrollWidth` matched the viewport at all
  checked sizes; no horizontal overflow was observed;
- screenshots were captured and visually inspected for Home Chinese desktop
  and Policy Intelligence English mobile;
- no fake sync/update status text was present in checked pages.

Known limitations and unresolved questions:

- There are intentionally no production published policy cards or detail
  pages until real source records are manually supplied and reviewed.
- The Home preview cannot be visually checked with a real policy card until a
  verified entry exists; synthetic entries remain test-only.
- Confirm whether the deployment’s Next.js/PPR handling must expose a literal
  HTTP 404 status for unpublished policy slugs, in addition to the current
  not-found UI and published-only selector behavior.

Architecture/content preservation confirmation:

- The six service-family identities, locale architecture, routes outside the
  new public policy routes, auth/account/VIP behavior, AI Workspace, Fast / AI
  Legal Check / Premium, legal-service, database, billing, email, AWS, and
  backend/AI content architecture were preserved.
- No crawler, scheduler, automated publication path, admin policy editor,
  database schema, migration, or P11-003B work was added.

## Next executable task

- `docs/agent-memory/tasks/P11-003A.md`
- **P11-003A — Policy Intelligence UI + provenance-safe manual content model**
- state: **implemented in working tree; owner/reviewer verification pending**

Expected route surface:

- `/intelligence`
- `/intelligence/[id]`

Expected integration:

- site navigation link;
- Home latest-policy preview;
- existing locale system;
- V4-inspired visual language adapted to the production Next.js app.

## Non-goals for P11-003A

Do not:

- automate source discovery;
- fetch the web at runtime;
- add policy ingestion jobs;
- add DB schema/migrations;
- modify legal-service;
- alter AI answer modes;
- publish invented policy facts;
- publish unreviewed AI summaries as lawyer advice;
- create fake “last synced” timestamps;
- start P11-003B automatically.

## Review rule

The coding agent must leave changes uncommitted/unpushed. The owner will show `git status --short` and `git diff --stat`; reviewer will then provide exact commit/push commands. After push, reviewer inspects the actual GitHub diff and browser screenshots before verification.
