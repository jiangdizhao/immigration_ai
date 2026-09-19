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
| P11-003B | Repository-backed manual curation + server-only publication boundary | PLANNED |
| P11-003C | Automated official-source discovery into non-public candidates | PLANNED |
| P11-004 | AI Workspace presentation rebase preserving current behavior | PLANNED |
| P11-005 | Matter-centered Client Portal | PLANNED |
| P11-006 | Lawyer Workspace continuity | PLANNED |
| P11-007 | Real appointment/consultation workflow | PLANNED |
| P11-008 | Bilingual/responsive/accessibility/E2E + staging acceptance | PLANNED |

## Current active task

Next executable Task Packet:

- `docs/agent-memory/tasks/P11-003B.md`
- title: Repository-backed policy curation + server-only publication boundary
- state: PLANNED

## P11-003B objective

Harden the manual-first Policy Intelligence architecture before adding automated source discovery.

P11-003B should:

- keep editable editorial records in a repository-owned curation source;
- make that editorial registry server-only;
- ensure draft/review-required/archived records never reach public browser bundles;
- pass only published public-safe projections into Home and Policy Intelligence presentation;
- retain the current `/intelligence` and `/intelligence/[id]` UX;
- provide deterministic validation for manually curated entries;
- document the Git-based review/publish workflow;
- preserve an easy future path for P11-003C automated discovery to create non-public candidates.

P11-003B must not:

- create a Policy Intelligence database table;
- create an admin write UI;
- scrape the web;
- automatically generate or publish policy analysis;
- add real policy records without explicit verified content;
- modify legal-service.

## Known architectural risk carried into P11-003B

The P11-003A presentation imports the policy registry through client components. With the production registry currently empty there is no present data leak, but once draft/review records exist the architecture must not rely on client-side filtering to keep them private.

P11-003B must create a server-only editorial boundary before real unpublished records are introduced.

## Stop conditions

Stop and mark **DECISION REQUIRED** if P11-003B appears to require:

- database/schema migration;
- runtime file writes to deployment containers;
- new real lawyer/policy facts;
- admin write/publish actions;
- automated official-source fetching;
- auth role changes;
- legal-service/model/tool changes;
- AWS deployment.
