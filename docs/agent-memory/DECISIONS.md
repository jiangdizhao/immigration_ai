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

