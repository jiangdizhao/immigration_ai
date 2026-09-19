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

