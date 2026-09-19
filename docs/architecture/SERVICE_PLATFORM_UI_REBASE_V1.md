# Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase

**Status:** Approved product/UI direction; implementation must remain task-bounded  
**Date:** 2026-09-19  
**Repository:** `jiangdizhao/immigration_ai`  
**Implementation branch:** `phase11-chinese-service-platform-ui-rebase`  
**Functional baseline:** `3b3653202f9b067fbed4adfd410edc02cb7215cc`  
**Design-reference repository:** `jiangdizhao/immigration_temporal_ui`, branch `codex/fidelity-completion-v4`, commit `8abbba2d6b94e7fb31048447b9831aaac6a6b029`

## 1. Purpose

Phase 11 changes the product shell from a primarily AI/legal-question website into a Chinese-first Australian immigration and study service platform.

The target customer journey is:

```text
public content / policy intelligence
        ->
AI low-friction intake
        ->
matter context: facts + conversation + sources + materials
        ->
human lawyer escalation
        ->
consultation / material review / continuing service
```

This is a product and information-architecture rebase, not a replacement of the validated legal reasoning backend.

## 2. Authority and precedence

For Phase 11 work, use the following precedence:

1. `AGENTS.md` and existing frozen backend/legal architecture documents govern serving, safety, evidence, database, deployment, and legal-reasoning behavior.
2. This document governs the Phase 11 product shell, information architecture, UI semantics, language direction, and migration strategy.
3. `docs/agent-memory/DECISIONS.md` records accepted durable decisions.
4. The temporary `immigration_temporal_ui` V4 repository is a **design and journey reference only**. It is not a production code source and does not override the main repository's real capabilities or safety rules.
5. Task Packets under `docs/agent-memory/tasks/` govern individual implementation units.

If a UI task conflicts with a frozen backend invariant, stop and mark **DECISION REQUIRED**.

## 3. Product definition

The production target is a:

> **Chinese-first Australian Immigration & Study Service Platform**

AI is an important intake and analysis layer, but it is not the whole product.

The platform should let customers:

- understand immigration and study service offerings;
- read policy/legal intelligence with clear provenance;
- ask questions and structure facts through AI;
- keep persistent matter-linked conversations;
- escalate to a human lawyer without losing context;
- manage lawyer requests, VIP entitlement, consultation preparation, and later material workflows through one coherent account experience.

## 4. Matter-centered continuity

**Matter is the product center.**

Conversation, user-supplied facts, AI analysis, sources, lawyer requests, future materials, and lawyer work should feel like artifacts of the same matter.

Phase 11 must not introduce a database redesign merely to make the UI look matter-centric. The current main repository already has persistent conversations and links between frontend chat identity and legal matter identity. Reuse those contracts first.

A schema change is permitted only when an approved later task proves that the current data model cannot represent a required production workflow. Database changes remain additive-first and separately authorized.

## 5. Language model for the website

The website UI is Chinese-first:

- default UI locale: `zh-CN`;
- one-click switch to English;
- locale persists across navigation/reload;
- first implementation should avoid locale-prefixed URL migration unless separately approved;
- UI locale must remain independent from user-question language and legal-answer language.

Do **not** force the backend to answer English merely because the website shell is English, or Chinese merely because the shell is Chinese. Existing user-language detection and answer behavior remain separate concerns.

## 6. Product information architecture

Phase 11 should converge toward the following product areas while reusing existing routes and capabilities wherever possible:

### Public platform
- Home
- Immigration & Study Services
- Process / How it works
- Contact / Consultation
- Policy & Legal Intelligence stream
- Policy & Legal Intelligence detail

### Customer workspace
- AI Workspace
- conversation history
- matter summary / known facts / items to confirm
- legal/source context
- lawyer escalation
- VIP/account surfaces
- lawyer request history
- future matter materials where separately approved

### Human service workspace
- lawyer request handling
- lawyer portal
- lawyer review/quality workflows
- future consultation/material lifecycle where separately approved

The public website should be spacious and editorial. Workspaces may be denser and operational.

## 7. Design semantics

The V4 prototype established useful semantic visual roles that Phase 11 should preserve conceptually:

- Deep Navy: platform, authority, legal/system context
- Electric Purple: AI intelligence
- Gold / Amber: human lawyer, premium human service
- Red: risk, urgency, correction, deadline
- Green: verified, complete, valid
- Blue/Cyan: normal interaction and system links

These are semantic roles, not a requirement to copy V4 CSS or pixel values.

### Provenance rule

The production UI must maintain a visible semantic distinction:

```text
Official / Original Law  !=  AI Analysis  !=  Lawyer Advice
```

Do not style generated AI commentary as if it were statutory text or lawyer advice. Do not style mock lawyer content as verified production facts.

## 8. Prototype content is not production truth

The temporary UI contains demonstration names, credentials, office details, performance claims, SLA language, privilege wording, statistics, testimonials, and other mock content.

None of those may be copied into production as verified facts without explicit confirmation.

Where content is not verified, either:
- omit it;
- label it as prototype/demo content during development; or
- replace it with verified production data through a later approved content task.

## 9. Existing production capabilities that must be preserved

Phase 11 UI work must preserve, unless a separate approved task explicitly changes them:

- guest and registered-user identity;
- authentication and email verification;
- conversation persistence and ownership;
- Fast / Legal Check / Premium access policy;
- Fast Luna direct lane;
- Default source-aware legal workflow;
- Premium Sol direct/research lane and its existing fallback policy;
- political/privacy gate;
- citations and source rendering;
- VIP entitlement and recurring billing;
- lawyer clarification/request workflow;
- lawyer portal and lawyer-review workflows;
- admin capabilities;
- server-side entitlement boundaries;
- legal-service API contracts;
- request-scoped evidence and Phase-6 checker invariants;
- ReasoningBank/control-plane isolation;
- rollback and deployment discipline.

A visual redesign is not authorization to rewrite any of the above.

## 10. Migration strategy

Phase 11 must be incremental. No big-bang replacement of the frontend.

Recommended sequence:

1. **P11-00 — Project-state bootstrap**  
   Adopt repository memory documents and freeze this Phase 11 direction.

2. **P11-01 — Locale + shared public shell foundation**  
   Chinese-first locale provider, language toggle, shared header/footer terminology. No backend change.

3. **P11-02 — Public pages rebase**  
   Home, Services, Process, Contact redesigned using production-safe content.

4. **P11-03 — Policy Intelligence**  
   Production implementation of intelligence stream/detail. No hard-coded one-policy leakage.

5. **P11-04 — AI Workspace presentation rebase**  
   Refactor presentation around the existing conversation/mode/source/lawyer-request behavior. Do not rewrite working legal logic while changing layout.

6. **P11-05 — Matter-centered Client Portal**  
   Unify user-facing history, entitlement, lawyer requests, and matter context using existing data first.

7. **P11-06 — Lawyer Workspace continuity**  
   Improve human handoff so the service actor changes without losing matter context.

8. **P11-07 — Appointment / consultation workflow**  
   Replace placeholders with an approved real scheduling/service workflow.

9. **P11-08 — Bilingual/responsive/accessibility/E2E + staging acceptance**  
   Complete broad validation before production rollout.

Each stage requires its own Task Packet and handoff update.

## 11. UI implementation rules

- Rebuild V4 ideas in the existing Next.js/Tailwind/component architecture; do not paste Vite prototype code wholesale.
- Prefer reusable semantic components/tokens over page-specific CSS hacks.
- Do not hide duplicate implementations with CSS.
- Major visible headings and controls must be real DOM content, not pseudo-element replacements.
- Preserve accessibility and mobile navigation.
- Preserve existing authenticated/account controls while translating/restyling them.
- Keep route changes minimal until a task explicitly approves route migration.
- Do not couple public-page copy changes to legal backend behavior.
- Do not introduce unverified legal or commercial claims for visual fidelity.

## 12. Phase 11 completion criteria

Phase 11 is complete only when:

- Chinese is the default production UI language and English switch works reliably;
- public site functions as a coherent immigration/study service platform rather than a chat-first demo;
- policy intelligence has production-safe provenance semantics;
- AI workspace preserves all existing serving behaviors while adopting the matter-centered UX;
- customer-to-lawyer escalation preserves matter context;
- account/VIP/lawyer-request journeys remain functional;
- desktop and mobile E2E paths pass;
- no prototype-only claim has silently become a production fact;
- backend legal architecture and evidence/safety invariants remain intact;
- staging acceptance is explicitly authorized and completed.

## 13. Non-goals for initial tasks

Initial Phase 11 tasks do not authorize:

- legal reasoning redesign;
- model or tool-policy changes;
- Phase-6 checker changes;
- ReasoningBank activation;
- database migrations;
- Stripe/SES changes;
- AWS deployment;
- new lawyer credentials or commercial claims;
- a new internationalized route hierarchy;
- copying the temporary repository into the main repository.

