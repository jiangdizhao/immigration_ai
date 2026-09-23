# CURRENT_MILESTONE

**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase  
**Status:** IN PROGRESS  
**Updated:** 2026-09-24

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
| P11-005 | Matter-centered Client Portal | PLANNED |
| P11-006 | Lawyer Workspace continuity | PLANNED |
| P11-007 | Real appointment/consultation workflow | PLANNED |
| P11-008 | Bilingual/responsive/accessibility/E2E + staging acceptance | PLANNED |

## P11-004 closure / next task state

P11-003C remains closed as VERIFIED at `fa02295675dc4343430ae0a109722141e669bbf9`.

P11-004 is **VERIFIED** at implementation commit `f2d941734d256c9e0a0e42988cd67cdb828d0dc6`. Both internal stages are complete and owner accepted; see `docs/agent-memory/tasks/P11-004.md` and `docs/agent-memory/CURRENT_HANDOFF.md`.

P11-005 remains **PLANNED** and has not started. Do not activate it as part of this P11-004 closure.

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
