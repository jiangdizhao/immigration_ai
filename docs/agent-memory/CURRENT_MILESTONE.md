# CURRENT_MILESTONE

**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase  
**Status:** IN PROGRESS  
**Updated:** 2026-09-19

## Objective

Transform the existing production frontend into a Chinese-first immigration/study service platform inspired by the approved temporary V4 product direction, while preserving the main repository's authentication, conversation, legal-answer, VIP, billing, lawyer, safety, evidence and deployment behavior.

## Baseline

- source baseline: `phase10.2-stream-termination-observability@3b3653202f9b067fbed4adfd410edc02cb7215cc`
- implementation branch: `phase11-chinese-service-platform-ui-rebase`
- design reference: `immigration_temporal_ui/codex/fidelity-completion-v4@8abbba2d6b94e7fb31048447b9831aaac6a6b029`
- P11-001 verified checkpoint: `4bc039c60f72e61e2e3b6a7cc26a88a862d5c1e3`
- P11-002A verified checkpoint: `d0964924be003fd61902fca760bd71aca53abe4f`
- P11-002B verified checkpoint: `9454a5e4b5a5c5515967ad977faa2355ba053fc5`
- Phase 11 authority: `docs/architecture/SERVICE_PLATFORM_UI_REBASE_V1.md`
- public-content authority: `docs/product/CONTENT_POLICY.md`

## Work breakdown

| Stage | Scope | Status |
|---|---|---|
| P11-00 | Shared project-state bootstrap + Phase 11 architecture/decision freeze | VERIFIED |
| P11-001 | Chinese-first locale foundation + shared public shell | VERIFIED |
| P11-002A | Public content model + bilingual Home/Services/Process/Contact structural rebase | VERIFIED |
| P11-002B | V4-informed public-page visual refinement + responsive polish | VERIFIED |
| P11-003A | Policy Intelligence UI + provenance-safe manual content model | PLANNED |
| P11-003B | Official-source discovery + curation/review workflow | PLANNED |
| P11-004 | AI Workspace presentation rebase preserving current behavior | PLANNED |
| P11-005 | Matter-centered Client Portal | PLANNED |
| P11-006 | Lawyer Workspace continuity | PLANNED |
| P11-007 | Real appointment/consultation workflow | PLANNED |
| P11-008 | Bilingual/responsive/accessibility/E2E + staging acceptance | PLANNED |

## Current active task

Next executable Task Packet:

- `docs/agent-memory/tasks/P11-003A.md`
- title: Policy Intelligence UI + provenance-safe manual content model
- state: PLANNED

## P11-003 product decision

The project owner selected the manual-first / automation-ready approach:

- first release uses manually curated entries;
- public rendering only uses explicitly publishable entries;
- no invented V4 policy items are copied into production;
- no automated scraping or publishing is added in P11-003A;
- model boundaries should make later official-source discovery + human review possible without reworking the public UI;
- P11-003B will handle the future discovery/curation/review workflow.

Policy Intelligence must visibly preserve:

```text
Official source facts != AI-assisted analysis != Lawyer commentary
```

and must separately model:

```text
source/legal status != editorial publication/review status
```

## P11-003A target surface

- site navigation entry for Policy Intelligence / 最新政策解读;
- `/intelligence` public stream/list;
- `/intelligence/[id]` detail route;
- latest-policy preview on Home;
- bilingual public copy;
- search/filtering over published entries where useful;
- truthful empty state when there are no reviewed published entries;
- no fake sync timestamp or fake automation status.

## Stop conditions

Stop and mark **DECISION REQUIRED** if P11-003A appears to require:

- fabricating a legal/policy update;
- treating a proposal as current law;
- copying V4 demo policy facts into production;
- automated web crawling or source ingestion;
- a database migration;
- backend/legal-service/model/tool changes;
- a lawyer opinion that has not actually been supplied;
- auth/entitlement changes;
- AWS deployment.
