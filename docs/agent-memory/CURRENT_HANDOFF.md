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

## Next executable task

- `docs/agent-memory/tasks/P11-003A.md`
- **P11-003A — Policy Intelligence UI + provenance-safe manual content model**
- state: **PLANNED**

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
