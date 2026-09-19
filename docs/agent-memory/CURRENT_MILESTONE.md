# CURRENT_MILESTONE

**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase  
**Status:** IN PROGRESS  
**Updated:** 2026-09-19

## Objective

Transform the existing production frontend into a Chinese-first immigration/study service platform inspired by the approved temporary V4 product direction, while preserving the main repository's real authentication, conversation, legal-answer, VIP, billing, lawyer, safety, evidence, and deployment behavior.

## Baseline

- source baseline: `phase10.2-stream-termination-observability@3b3653202f9b067fbed4adfd410edc02cb7215cc`
- implementation branch: `phase11-chinese-service-platform-ui-rebase`
- design reference: `immigration_temporal_ui/codex/fidelity-completion-v4@8abbba2d6b94e7fb31048447b9831aaac6a6b029`
- Phase 11 authority: `docs/architecture/SERVICE_PLATFORM_UI_REBASE_V1.md`

## Work breakdown

| Stage | Scope | Status |
|---|---|---|
| P11-00 | Shared project-state bootstrap + Phase 11 architecture/decision freeze | IMPLEMENTED / REVIEW REQUIRED |
| P11-01 | Chinese-first locale foundation + shared public shell | PLANNED |
| P11-02 | Home / Services / Process / Contact public-page rebase | PLANNED |
| P11-03 | Policy Intelligence stream/detail | PLANNED |
| P11-04 | AI Workspace presentation rebase preserving current behavior | PLANNED |
| P11-05 | Matter-centered Client Portal | PLANNED |
| P11-06 | Lawyer Workspace continuity | PLANNED |
| P11-07 | Real appointment/consultation workflow | PLANNED |
| P11-08 | Bilingual/responsive/accessibility/E2E + staging acceptance | PLANNED |

## Current active task

Next executable Task Packet:

- `docs/agent-memory/tasks/P11-001.md`
- title: Chinese-first locale + shared public shell foundation
- state: PLANNED

No runtime implementation for P11-001 has started.

## Milestone acceptance criteria

The milestone eventually requires:

- default Chinese UI with reliable one-click English switch;
- coherent service-platform public IA;
- provenance-safe Policy Intelligence;
- existing AI answer modes and conversation persistence preserved;
- matter-centered customer UX;
- AI-to-lawyer handoff preserving context;
- working account/VIP/lawyer-request journeys;
- no unverified prototype claims presented as production facts;
- responsive/accessibility/E2E validation;
- separately authorized staging rollout and acceptance.

## Current risks

1. **Big-bang UI rewrite risk** — avoid replacing `ImmigrationAIWorkspace` in one task.
2. **Behavioral regression risk** — visual work must not change answer-lane selection, auth, persistence, entitlement, political gate, or evidence behavior.
3. **Prototype-content risk** — demo lawyer names, credentials, address, success rates, SLA, privilege language and testimonials are not verified production data.
4. **i18n scope explosion** — initial locale work must avoid route-prefix migration.
5. **Matter-model overreach** — use existing chat/matter identities before proposing schema changes.
6. **Deployment ambiguity** — Git state must not be treated as proof of AWS state.

## Stop conditions

Stop and mark **DECISION REQUIRED** if a task appears to require:

- a database migration;
- legal backend/model/tool behavior changes;
- auth/entitlement contract changes;
- a new route hierarchy that changes existing redirect semantics;
- production legal/commercial claims not already verified;
- AWS deployment;
- broad replacement of working workspace behavior rather than bounded presentation refactoring.

