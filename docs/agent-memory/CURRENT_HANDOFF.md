# CURRENT_HANDOFF

**Updated:** 2026-09-19  
**Branch:** `phase11-chinese-service-platform-ui-rebase`  
**Phase 11 base:** `3b3653202f9b067fbed4adfd410edc02cb7215cc`  
**P11-001 verified implementation checkpoint:** `4bc039c60f72e61e2e3b6a7cc26a88a862d5c1e3`  
**Git-state rule:** always verify the live branch tip with `git rev-parse HEAD`; documentation-only memory commits may advance HEAD without runtime changes  
**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase

## Current verified state

P11-00: **VERIFIED**.

P11-001: **VERIFIED** for its intended scope.

P11-001 introduced:

- typed `zh-CN` / `en` site locale;
- default Chinese shared shell;
- cookie-persisted language selection;
- shared translation dictionary;
- desktop/mobile language switcher;
- localized Header, Footer and account-menu copy;
- locale unit tests.

The implementation preserved existing auth/session, VIP entitlement, lawyer/admin conditional links, route identities and backend answer-language behavior.

The project owner performed browser smoke testing and confirmed the expected P11-001 boundary: the shared shell can display Chinese correctly, while the Home/Services/Process/Contact page bodies remain largely English because page-body localization belongs to P11-002.

## P11-001 validation record

Reported local validation:

- `cd chatbot && pnpm test:unit`: PASS — 154 passed, 0 failed, 0 skipped.
- `cd chatbot && pnpm build`: PASS.
- changed-file Biome check: PASS.
- `git diff --check`: PASS.
- repository-wide `pnpm lint`: 22 pre-existing unrelated diagnostics; no diagnostic was reported for the P11-001 files.

No GitHub Actions run was present for the P11-001 checkpoint, so the above are local validation results, not CI results.

No `legal-service/`, migration, database, AWS, Stripe/SES or legal-serving behavior change was part of P11-001.

## Product decisions confirmed for P11-002

The project owner confirmed:

1. Continue using **Sovereign Nexus Legal** as a placeholder brand.
2. Public positioning should be **service-platform first**: Australian immigration + study services, with AI as intake and human lawyer escalation.
3. Use six provisional service families for the first service catalogue.
4. Include lawyer/team card structure with explicit mock/placeholder profiles.
5. Do not invent public phone/address/WeChat/email; use consultation CTAs only.
6. Treat V4 as a strong visual reference while adapting to the production Next.js architecture.

These decisions are recorded in `docs/agent-memory/DECISIONS.md`.

Public-content governance is now defined in:

- `docs/product/CONTENT_POLICY.md`

## P11-002A implementation handoff

P11-002A is **IMPLEMENTED / REVIEW REQUIRED** on the live branch
`phase11-chinese-service-platform-ui-rebase` at `45f498952f382da6c2e735d7f651affd5b9758e2`.
The issued Phase 11 checkpoint remains `45f498952f382da6c2e735d7f651affd5b9758e2`; no commit was created during this implementation turn.

Changed files:

- `chatbot/lib/public-content.ts`
- `chatbot/lib/public-content.test.ts`
- `chatbot/components/immigration-service-home.tsx`
- `chatbot/app/(chat)/services/page.tsx`
- `chatbot/app/(chat)/process/page.tsx`
- `chatbot/app/(chat)/contact/page.tsx`
- `chatbot/package.json`
- this handoff file

The reusable model is in `chatbot/lib/public-content.ts`. It provides the six stable service IDs and shared bilingual `PUBLIC_SERVICE_CATALOG`, localized page copy through `PUBLIC_PAGE_CONTENT`, explicit generic `PUBLIC_TEAM_PLACEHOLDERS`, existing route constants, and locale getters. Home and Services consume the same catalogue. Home, Services, Process, and Contact consume the existing `SiteLocaleProvider`/`useSiteLocale` foundation, so the existing header language switch changes their page bodies without adding locale-prefixed routes or backend language coupling.

The public positioning is service-platform first, with AI framed as intake/organization and human escalation routed through the existing `/ai-workspace` workflow. Contact contains no invented phone, email, address, WeChat, fees, credentials, statistics, or testimonials. Team cards are visibly generic placeholders with pending-profile copy. P11-002B visual fidelity work remains out of scope.

## P11-002A validation record

- `cd chatbot && pnpm test:unit`: PASS — 158 passed, 0 failed, 0 skipped.
- `cd chatbot && pnpm build`: PASS — production build completed and generated the expected public routes, including `/`, `/services`, `/process`, and `/contact`.
- Changed-file Biome check: PASS — 7 files checked, no fixes required on the final check.
- `git diff --check`: PASS.
- `cd chatbot && pnpm lint`: FAIL — 22 pre-existing unrelated diagnostics; none reported a P11-002A file.
- `cd chatbot && pnpm exec tsc --noEmit`: FAIL — pre-existing unrelated errors in `lib/ai/models.test.ts` and `lib/vip/billing/customer-billing-api.test.ts`; no changed-file errors.

No live browser/E2E run was performed by Codex in this turn. Structural checks confirmed that all four public pages use the locale hook, route identities are unchanged, CTAs target existing routes/workflows, and no prohibited legal-service, migration, database, auth, AI-workspace, model, prompt, billing, or deployment files changed. Manual browser review remains part of the required P11-002A review gate.

No unresolved product or architecture decision was identified. The next recommended action is reviewer inspection of the actual Git diff and a browser smoke pass, followed by P11-002B visual refinement if accepted.

## Next executable task

- No P11-002B task packet is present yet; issue/read the applicable packet before implementation.
- **P11-002B — Public-page visual fidelity and responsive refinement**
- state: **BLOCKED ON P11-002A REVIEW**

## Required preflight for the next task

Before editing:

1. read `AGENTS.md`;
2. read `docs/architecture/SERVICE_PLATFORM_UI_REBASE_V1.md`;
3. read `docs/product/CONTENT_POLICY.md`;
4. read `docs/agent-memory/DECISIONS.md`;
5. read this handoff;
6. read the applicable next-task packet under `docs/agent-memory/tasks/`;
7. verify `git status --short`, `git branch --show-current`, and `git rev-parse HEAD`;
8. stop if unexplained tracked changes exist or repository reality conflicts with the Task Packet.

## Review rule

The coding-agent completion message is advisory. Review must inspect actual Git diff, source and reproducible validation before P11-002A is marked VERIFIED.
