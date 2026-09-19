# CURRENT_HANDOFF

**Updated:** 2026-09-20  
**Branch:** `phase11-chinese-service-platform-ui-rebase`  
**Phase 11 base:** `3b3653202f9b067fbed4adfd410edc02cb7215cc`  
**P11-001 verified checkpoint:** `4bc039c60f72e61e2e3b6a7cc26a88a862d5c1e3`  
**P11-002A verified checkpoint:** `d0964924be003fd61902fca760bd71aca53abe4f`  
**P11-002B verified checkpoint:** `9454a5e4b5a5c5515967ad977faa2355ba053fc5`  
**P11-003A implementation checkpoint:** `f7fa6363e4f2ee326306b20203692dd73e45cebd`  
**P11-003A provenance-hardening checkpoint:** `4f232fe40161a7adad104bcbf6c382b846425936`  
**Git-state rule:** verify the live branch tip with `git rev-parse HEAD`; documentation-only memory commits may advance HEAD without runtime changes  
**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase

## Current verified state

- P11-00: **VERIFIED**
- P11-001: **VERIFIED**
- P11-002A: **VERIFIED**
- P11-002B: **VERIFIED**
- P11-003A: **VERIFIED**

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

## Important next-step architecture issue

The current P11-003A implementation is safe while the production registry is empty.

However, public presentation components currently import selectors from the same module that owns the editorial registry. If future draft or review-required entries are placed there, client bundling could expose unpublished editorial data even when the UI filters it out.

The next task must harden this boundary **before real unpublished records are added**.

## P11-003B architecture

The owner previously selected manual-first / automation-ready Policy Intelligence.

P11-003B therefore implements a repository-backed manual curation workflow with a server-only editorial boundary.

Key direction:

- shared policy types/validation may remain importable where safe;
- editable editorial registry/content must be server-only;
- public pages receive only published public-safe projections;
- Git remains the review/audit mechanism for this interim phase;
- no DB migration;
- no runtime file writing;
- no admin write UI;
- no automated discovery;
- no real policy records are required for this infrastructure task.

This interim repository workflow should support a later P11-003C where automated official-source discovery creates **non-public candidates only**.

## Next executable task

- `docs/agent-memory/tasks/P11-003B.md`
- **P11-003B — Repository-backed policy curation + server-only publication boundary**
- state: **PLANNED**

## Review rule

The coding model must leave P11-003B changes uncommitted/unpushed. The owner will provide `git status --short` and `git diff --stat`; reviewer will then provide exact commit/push commands and inspect the GitHub diff after push.
