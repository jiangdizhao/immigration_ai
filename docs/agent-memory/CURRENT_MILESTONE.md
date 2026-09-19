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
| P11-003C | Allowlisted official-source discovery into non-public candidates | PLANNED |
| P11-004 | AI Workspace presentation rebase preserving current behavior | PLANNED |
| P11-005 | Matter-centered Client Portal | PLANNED |
| P11-006 | Lawyer Workspace continuity | PLANNED |
| P11-007 | Real appointment/consultation workflow | PLANNED |
| P11-008 | Bilingual/responsive/accessibility/E2E + staging acceptance | PLANNED |

## Current active task

Next executable Task Packet:

- `docs/agent-memory/tasks/P11-003C.md`
- title: Allowlisted official-source discovery into non-public candidates
- state: PLANNED

## P11-003C objective

Build the first automation layer for Policy Intelligence without weakening the human publication gate.

The desired flow is:

```text
allowlisted official source
        ->
operator-run discovery
        ->
non-public candidate artifact
        ->
human verification / editorial curation
        ->
existing server-only registry
        ->
published public projection
```

P11-003C should establish:

- an internal discovery-source configuration grounded in official sources already recognized by repository authority;
- a strict hostname/URL allowlist;
- bounded fetch behavior with timeout/size/type limits;
- deterministic parsing/normalization from local fixtures;
- a non-public discovery-candidate schema;
- canonical URL/content fingerprint/deduplication helpers;
- an operator-run CLI/dry-run path;
- no public route changes.

Discovery candidates are evidence for review, not legal conclusions and not public content.

## Explicit non-goals

P11-003C must not:

- publish anything;
- edit `MANUAL_POLICY_ENTRIES` automatically;
- call an LLM;
- generate Chinese/English policy analysis;
- create lawyer commentary;
- infer `in_force` / `proposed` unless explicit source metadata is being faithfully captured;
- schedule background jobs;
- create database tables;
- modify legal-service;
- deploy AWS.

## Stop conditions

Stop and mark **DECISION REQUIRED** if P11-003C appears to require:

- broad arbitrary web crawling/search;
- a new source domain not already grounded in repository authority;
- legal interpretation to classify a discovered page;
- automatic promotion/publication;
- database/schema migration;
- scheduler/queue infrastructure;
- runtime production writes;
- legal-service/model/tool changes.
