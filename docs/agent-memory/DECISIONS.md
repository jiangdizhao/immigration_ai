# DECISIONS

Durable decisions for future ChatGPT/Cline/Codex sessions. Do not silently reverse an ACCEPTED decision. If new evidence requires a change, add a superseding decision record.

## D-001 — Phase 11 product target

**Date:** 2026-09-19  
**Status:** ACCEPTED

The product target is a **Chinese-first Australian Immigration & Study Service Platform**, not a chatbot-only or simple legal-Q&A website.

AI is the low-friction intake/analysis layer inside a broader service platform.

## D-002 — Main repo is functional authority; temporary UI is design authority

**Date:** 2026-09-19  
**Status:** ACCEPTED

`jiangdizhao/immigration_ai` is the production functional authority.

`jiangdizhao/immigration_temporal_ui`, especially `codex/fidelity-completion-v4@8abbba2`, is a design, composition, terminology, and user-journey reference only.

Do not wholesale-copy the Vite prototype or let mock data override production contracts.

## D-003 — Chinese default with one-click English

**Date:** 2026-09-19  
**Status:** ACCEPTED

The website UI defaults to `zh-CN` and supports one-click English switching.

Initial implementation must avoid locale-prefixed route migration. UI locale is independent from user question language and legal answer language.

## D-004 — Matter is the UX center

**Date:** 2026-09-19  
**Status:** ACCEPTED

Matter continuity is the center of the product experience. Conversation, facts, sources, lawyer escalation, and future materials should appear continuous across AI and human service.

Do not redesign the database solely to achieve this presentation. Reuse current conversation and legal-matter identity first.

## D-005 — Phase 11 does not redesign legal reasoning

**Date:** 2026-09-19  
**Status:** ACCEPTED

Phase 11 UI tasks do not authorize changes to Fast, Legal Check/Default, Premium, Phase-6, evidence identity, legal retrieval, ReasoningBank governance, political/privacy gating, or provider budget policy.

Backend changes require a separately approved task.

## D-006 — Provenance must be visible

**Date:** 2026-09-19  
**Status:** ACCEPTED

Production UI must preserve the semantic distinction:

```text
Official / Original Law != AI Analysis != Lawyer Advice
```

No UI styling may imply that AI-generated analysis is statutory text or a lawyer's advice.

## D-007 — Prototype claims are not production facts

**Date:** 2026-09-19  
**Status:** ACCEPTED

Temporary-UI lawyer names, credentials, office address, performance statistics, testimonials, response-time/SLA claims, success claims, privilege wording, and similar demonstration content are not verified production facts unless separately confirmed.

They must not be copied into production unqualified.

## D-008 — Incremental rebase; no big-bang frontend replacement

**Date:** 2026-09-19  
**Status:** ACCEPTED

Phase 11 is implemented through bounded Task Packets.

Shared shell and locale foundation come first. Public pages follow. Policy Intelligence follows. The high-risk AI Workspace is refactored later and incrementally.

## D-009 — Repository is the shared external memory

**Date:** 2026-09-19  
**Status:** ACCEPTED

Adopt the repository-first shared project-state workflow:

- conversations are temporary working memory;
- Git/code/tests and concise Markdown records are durable state;
- coding agents verify Git before editing;
- meaningful tasks have Task Packets;
- coding agents update `CURRENT_HANDOFF.md` before ending;
- ChatGPT reviews implementation against source/diff/tests rather than accepting narrative claims;
- correction work gets a new `-R1`, `-R2`, etc. Task Packet instead of silently rewriting an in-progress/completed task contract.

## D-010 — No deployment implied by Phase 11 documentation work

**Date:** 2026-09-19  
**Status:** ACCEPTED

Creating the Phase 11 branch and project-memory documents does not deploy AWS, run migrations, or change production/staging state.

Deployment remains a separately authorized operation.

## D-011 — Placeholder brand remains Sovereign Nexus Legal

**Date:** 2026-09-19  
**Status:** ACCEPTED

Until the real firm/platform branding is confirmed, the public UI may continue to use **Sovereign Nexus Legal** as an explicit placeholder brand.

Do not infer that this is the final production brand. Future replacement must be centralized and low-risk.

## D-012 — Public positioning is service-platform first

**Date:** 2026-09-19  
**Status:** ACCEPTED

The public website should primarily present an **Australian immigration and study one-stop service platform**.

AI is an important first-contact and intake capability; it must not dominate the public positioning as if the product were only an AI legal chatbot.

Preferred product story:

```text
service discovery -> AI-assisted intake -> structured matter context
-> human lawyer escalation when needed -> continuing service
```

## D-013 — Initial public service catalogue uses six service families

**Date:** 2026-09-19  
**Status:** ACCEPTED

P11-002 may organize the first public service catalogue around six provisional families:

1. 留学与学生签证 / Study & Student Visa
2. 技术移民与雇主担保 / Skilled Migration & Employer Sponsorship
3. 配偶与家庭类 / Partner & Family
4. 签证拒签与 ART 复审 / Visa Refusal & ART Review
5. 永居与公民相关服务 / Permanent Residence & Citizenship-related Services
6. 复杂案件与个案策略咨询 / Complex Matters & Case Strategy

These are product-navigation categories, not legal conclusions or service guarantees. A lawyer may later refine, merge, rename or remove categories.

## D-014 — Lawyer-team UI may use explicit mock profiles only

**Date:** 2026-09-19  
**Status:** ACCEPTED

P11-002 may include lawyer/team card structure so the production layout can be reviewed before real lawyer information is available.

Any temporary lawyer profile must be visibly and structurally identified as **mock / placeholder / awaiting confirmation**.

Do not present invented names, qualifications, practising-certificate details, years of experience, achievements, case counts, success rates or specialisations as production truth.

Use replaceable placeholder avatars rather than implying a real person's identity.

## D-015 — No invented public contact coordinates

**Date:** 2026-09-19  
**Status:** ACCEPTED

Until real contact details are confirmed, public pages must not invent a phone number, street address, WeChat account, email address or office location.

Use action-oriented contact/consultation CTAs that lead into the existing website workflow. Real coordinates can be added later after confirmation.

## D-016 — V4 is a strong visual reference, not a pixel-copy mandate

**Date:** 2026-09-19  
**Status:** ACCEPTED

The temporary V4 UI should strongly influence visual hierarchy, section composition, semantic color roles and overall premium/legal-service tone.

The production Next.js implementation may adapt layout and components to preserve existing auth, routing, responsive behavior and maintainability. Pixel-perfect copying is not required.

## D-017 — Unknown subjective content must be escalated, not silently decided

**Date:** 2026-09-19  
**Status:** ACCEPTED

When a Phase 11 task encounters an unresolved product/content decision that is not determined by repository authority, the coding agent must not silently convert a plausible guess into production truth.

Examples include lawyer identity, qualifications, contact details, pricing, service commitments, testimonials, branding claims, legal/commercial promises and materially subjective user-facing wording.

If the information is not needed for the active task, leave it untouched.

If a visible placeholder is necessary for structural development, use an explicit replaceable placeholder consistent with `docs/product/CONTENT_POLICY.md`.

If the choice affects architecture, legal/commercial meaning, product positioning or long-term information architecture, stop and ask the project owner.

## D-018 — P11-002A accepted; P11-002B is presentation-only refinement

**Date:** 2026-09-19  
**Status:** ACCEPTED

P11-002A at `d0964924be003fd61902fca760bd71aca53abe4f` is accepted as the structural baseline for the public platform pages after Git review and browser review of Home, Services, Process, Contact, plus English locale switching.

P11-002B may refine visual hierarchy, spacing, typography, responsive behavior, reusable presentation primitives, and restrained interaction polish for those public pages.

P11-002B must not reopen the accepted service catalogue, locale architecture, route structure, content-governance rules, auth/entitlement behavior, legal backend behavior, or introduce unverified business/lawyer facts merely for visual fidelity.

## D-019 — Policy Intelligence starts manual-first and is automation-ready

**Date:** 2026-09-19  
**Status:** ACCEPTED

Policy Intelligence will follow option **C**:

1. **Initial implementation:** manually curated policy entries only.
2. **Future architecture:** data contracts must be ready for automated discovery from authoritative sources plus human review/publication.
3. **No automatic publication:** future automated discovery or AI summarisation must not become public legal/policy content without an explicit review/publication gate.

P11-003A therefore builds the public Policy Intelligence experience and a provenance-safe typed content model without adding live crawlers, background jobs, database migrations or automated publication.

P11-003B is reserved for the future official-source discovery / curation / review workflow.

## D-020 — Policy source status and editorial publication status are separate

**Date:** 2026-09-19  
**Status:** ACCEPTED

Policy Intelligence must not collapse the legal/source status of an item into the platform's editorial workflow.

The model must distinguish, conceptually:

- **source/legal status** — for example in force, announced, proposed, consultation, superseded;
- **publication/review status** — for example draft, review required, published, archived.

A proposal/consultation must never be styled or worded as current law merely because the platform has published an explanation of it.

Only explicitly publishable entries may appear in public Policy Intelligence routes.

Official source facts, AI-assisted analysis and lawyer commentary remain visually and semantically distinct.

## D-021 — P11-003A accepted after provenance hardening

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003A is accepted after:

- implementation commit `f7fa6363e4f2ee326306b20203692dd73e45cebd`;
- provenance-hardening correction `4f232fe40161a7adad104bcbf6c382b846425936`.

The accepted model keeps:

- source/legal status separate from editorial publication status;
- public selectors restricted to published entries;
- production policy registry empty until real records are manually verified;
- official verbatim excerpt data owned by source/provenance identity rather than localized copy;
- AI analysis and lawyer commentary separate from official source material.

## D-022 — Policy curation remains repository-backed before database/admin-write work

**Date:** 2026-09-20  
**Status:** ACCEPTED

The next Policy Intelligence step will use a repository-backed manual curation workflow rather than introducing a database migration or runtime admin editor.

Reasons:

- Phase 11 does not currently authorize a Policy Intelligence database migration;
- real lawyer/policy editorial workflow is still being validated;
- the public UI already has a typed manual-first model;
- repository-backed review provides traceability through Git while content volume is low.

This is an interim operational model, not a permanent CMS decision.

A future task may move Policy Intelligence persistence into a database/admin workflow after explicit approval.

## D-023 — Unpublished policy content must remain server-only

**Date:** 2026-09-20  
**Status:** ACCEPTED

Draft, review-required, archived, or otherwise unpublished Policy Intelligence records must not be shipped into public browser bundles merely because client-side selectors hide them.

The curation boundary must therefore separate:

- shared public-safe policy types/projections;
- server-only editorial registry/content;
- public published projection passed to client-rendered presentation where necessary.

The server-only boundary should use existing Next.js conventions such as `server-only` and server components/loaders.

Public pages may receive published policy data, but must not receive unpublished editorial records.

## D-024 — Automated discovery is deferred until the manual publication boundary is hardened

**Date:** 2026-09-20  
**Status:** ACCEPTED

The earlier P11-003B scope is split:

- **P11-003B:** repository-backed manual curation + server-only publication boundary;
- **P11-003C:** automated official-source discovery into non-public candidates, with no automatic publication.

P11-003C must not begin automatically after P11-003B. Automated discovery requires separate review of source scope, scheduling, deduplication, freshness, and lawyer/admin review semantics.

## D-025 — P11-003B server-only publication boundary accepted

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003B at `081ef46dd040b6131d475750d0968c9f2e461bb2` is accepted.

The repository-backed Policy Intelligence editorial source is now server-only. Public Home/list/detail surfaces receive only explicit published public-safe projections from server loaders. Draft, review-required, archived, discovery and origin metadata are not delivered to public client presentation.

The production registry remains intentionally empty until real policy records are verified and approved.

## D-026 — Automated discovery creates non-public candidates only

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003C may automate discovery from allowlisted official sources, but discovery output is **candidate evidence**, not a publishable Policy Intelligence entry.

Automated discovery must not:

- infer or assert legal effect/status when the official source does not explicitly establish it;
- create public AI analysis;
- create lawyer commentary;
- change an editorial record to `published`;
- write into the public editorial registry automatically.

Candidate promotion remains a deliberate human-reviewed step.

## D-027 — First discovery implementation is operator-run and offline-safe

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003C will be an operator-run discovery tool/CLI, not a web-request runtime feature and not a scheduler.

It may use controlled live HTTP fetches only when explicitly invoked by the operator and only against an allowlisted official-source configuration grounded in repository authority. Deterministic tests must use local fixtures and must not depend on network availability.

P11-003C must not modify `legal-service/`; it may inspect the existing official-source registry as design authority but must keep the Policy Intelligence discovery implementation isolated from answer-time legal retrieval.

