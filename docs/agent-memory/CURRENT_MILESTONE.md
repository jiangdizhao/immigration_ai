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
- P11-001 verified implementation checkpoint: `4bc039c60f72e61e2e3b6a7cc26a88a862d5c1e3`
- Phase 11 authority: `docs/architecture/SERVICE_PLATFORM_UI_REBASE_V1.md`
- public-content authority: `docs/product/CONTENT_POLICY.md`

## Work breakdown

| Stage | Scope | Status |
|---|---|---|
| P11-00 | Shared project-state bootstrap + Phase 11 architecture/decision freeze | VERIFIED |
| P11-001 | Chinese-first locale foundation + shared public shell | VERIFIED |
| P11-002A | Public content model + bilingual Home/Services/Process/Contact structural rebase | PLANNED |
| P11-002B | V4-informed public-page visual refinement + responsive polish | PLANNED |
| P11-003 | Policy Intelligence stream/detail | PLANNED |
| P11-004 | AI Workspace presentation rebase preserving current behavior | PLANNED |
| P11-005 | Matter-centered Client Portal | PLANNED |
| P11-006 | Lawyer Workspace continuity | PLANNED |
| P11-007 | Real appointment/consultation workflow | PLANNED |
| P11-008 | Bilingual/responsive/accessibility/E2E + staging acceptance | PLANNED |

## Current active task

Next executable Task Packet:

- `docs/agent-memory/tasks/P11-002A.md`
- title: Public content model + bilingual public-page structural rebase
- state: PLANNED

P11-002A is deliberately structural. It should connect the four public page bodies to the locale/content foundation, introduce a reusable public-content model, and establish the agreed service-platform information architecture without chasing final visual fidelity.

P11-002B will refine visual fidelity after P11-002A is reviewed.

## Accepted P11-002 product decisions

- Placeholder brand remains **Sovereign Nexus Legal** until real branding is confirmed.
- Public positioning is **service-platform first** rather than AI-chatbot first.
- First service catalogue uses six provisional service families.
- Lawyer/team cards may exist with explicit mock/placeholder profiles only.
- Do not invent phone/address/WeChat/email or other public contact coordinates.
- V4 is a strong visual reference, but the production Next.js implementation may adapt it.
- Unknown subjective content that materially affects the product must be escalated to the project owner.

See `docs/agent-memory/DECISIONS.md` and `docs/product/CONTENT_POLICY.md`.

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
4. **Content-model sprawl** — P11-002A should create one small reusable public-content source rather than duplicate bilingual copy across pages.
5. **Premature fidelity risk** — P11-002A is structural; reserve broad CSS/animation polish for P11-002B.
6. **Matter-model overreach** — use existing chat/matter identities before proposing schema changes.
7. **Deployment ambiguity** — Git state must not be treated as proof of AWS state.

## Stop conditions

Stop and mark **DECISION REQUIRED** if a task appears to require:

- a database migration;
- legal backend/model/tool behavior changes;
- auth/entitlement contract changes;
- a new route hierarchy that changes existing redirect semantics;
- production legal/commercial claims not already verified;
- real lawyer/contact/pricing facts that have not been supplied;
- AWS deployment;
- broad replacement of working workspace behavior rather than bounded presentation refactoring.
