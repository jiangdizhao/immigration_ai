# CURRENT_MILESTONE

**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase  
**Status:** IN PROGRESS  
**Updated:** 2026-09-20

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
- P11-003C implementation checkpoint: `07fa129677d94c9f2c24cac65e1e89859ee2b6d3`
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
| P11-003C | Allowlisted official-source discovery into non-public candidates | IMPLEMENTED — VERIFICATION PENDING |
| P11-003C-R1 | Full-operation timeout + mapped-IPv6/private-network hardening | IMPLEMENTED |
| P11-003C-R2 | Home Affairs structured alert discovery + bounded fetch calibration | IMPLEMENTED |
| P11-003C-R3 | Relative Home Affairs alert URL resolution + provenance-kind correction | PLANNED |
| P11-004 | AI Workspace presentation rebase preserving current behavior | PLANNED |
| P11-005 | Matter-centered Client Portal | PLANNED |
| P11-006 | Lawyer Workspace continuity | PLANNED |
| P11-007 | Real appointment/consultation workflow | PLANNED |
| P11-008 | Bilingual/responsive/accessibility/E2E + staging acceptance | PLANNED |

## Current active task

Next executable correction:

- `docs/agent-memory/tasks/P11-003C-R3.md`
- title: Relative Home Affairs alert URL resolution + provenance-kind correction
- state: PLANNED

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


## Post-R2 review finding

The R1+R2 checkpoint `009e7f964f86bd6b755d4fe5ded82c922ea48f09` passed its deterministic and live smoke validations, but GitHub/source review of the real Home Affairs payload exposed a provenance-resolution defect.

Real `siteData.alertItems.urls` commonly contains root-relative paths. The current R2 implementation sends those raw strings directly to absolute-URL validation, so they are rejected and candidates fall back to the configured seed URL.

R3 must resolve a relative alert URL against the already allowlisted fetched page URL, then re-run the normal HTTPS/host/canonicalisation checks. No alert URL may be fetched in R3.

R3 should also correct the generic candidate provenance-kind field so a fetched child/detail page is not mislabeled as seed provenance.
