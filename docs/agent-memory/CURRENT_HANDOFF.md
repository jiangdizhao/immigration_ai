# CURRENT_HANDOFF

**Updated:** 2026-09-19  
**Branch:** `phase11-chinese-service-platform-ui-rebase`  
**Base commit:** `3b3653202f9b067fbed4adfd410edc02cb7215cc`  
**Bootstrap content commit:** `5adeeddbe5581646935094f40aa784628b883285`
**Git-state rule:** verify the live branch tip with `git rev-parse HEAD` after sync; handoff-maintenance commits may advance the branch without runtime changes  
**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase

## What was done

P11-00 repository-memory/bootstrap documentation was added, and P11-001 was
implemented on the live Phase 11 branch pending review.

No database schema, environment, AWS resource, Stripe/SES configuration,
legal-service code, or legal-serving behavior was changed.

Created/updated project authority and memory:

- `docs/architecture/SERVICE_PLATFORM_UI_REBASE_V1.md`
- `docs/agent-memory/PROJECT_STATE.md`
- `docs/agent-memory/CURRENT_MILESTONE.md`
- `docs/agent-memory/CURRENT_HANDOFF.md`
- `docs/agent-memory/DECISIONS.md`
- `docs/agent-memory/tasks/P11-001.md`
- `.cline/rules/project-workflow.md`
- `AGENTS.md` pointer section for Phase 11 shared project state

## Verified baseline facts

- Phase 11 branch originates from Phase 10.2 commit `3b365320...`.
- Phase 10.2 removed the mandatory default Fast `max_output_tokens=1200` cap and added stream termination diagnostics.
- The main frontend already has a service homepage, services/process/contact routes, AI Workspace, auth/account, VIP, lawyer requests, lawyer portal/review, and persistent conversations.
- The V4 temporary UI reference remains `codex/fidelity-completion-v4@8abbba2...`.
- No Phase 11 runtime implementation has started.

## Current task state

P11-00: IMPLEMENTED / REVIEW REQUIRED. Bootstrap content commit:
`5adeeddbe5581646935094f40aa784628b883285`.

P11-001: IMPLEMENTED / REVIEW REQUIRED.

Implementation files:

- `chatbot/app/layout.tsx`
- `chatbot/components/site-header.tsx`
- `chatbot/components/site-footer.tsx`
- `chatbot/components/site-locale-provider.tsx`
- `chatbot/components/site-language-switcher.tsx`
- `chatbot/lib/site-locale.ts`
- `chatbot/lib/site-locale.test.ts`
- `chatbot/package.json`

The implementation provides typed `zh-CN`/`en` locale normalization, a
shared-shell translation dictionary, a cookie-persisted client provider, a
desktop/mobile language switcher, and Chinese-first header/footer/account
copy. The cookie read is isolated behind a Suspense boundary so Next.js
cache-component prerendering remains valid. Existing session, role, VIP
entitlement, logout, and route logic remains in place.

Live Git state at handoff: branch
`phase11-chinese-service-platform-ui-rebase`, HEAD `3ee531d`.

Validation:

- `cd chatbot && pnpm test:unit`: PASS — 154 passed, 0 failed, 0 skipped.
- `cd chatbot && pnpm build`: PASS — production build and prerender completed.
- Changed-file `pnpm exec biome check ...`: PASS — all 8 changed files clean.
- `git diff --check`: PASS.
- `cd chatbot && pnpm lint`: FAIL — 22 pre-existing diagnostics in unrelated
  files, including `app/globals.css`,
  `components/assistant-rich-markdown.tsx`, migration snapshots,
  `lib/default-agent-runtime-debug*`, and other existing files. No diagnostic
  was reported for the P11-001 files.

Manual browser/E2E verification was not run in this UI-only task. Structural
review confirms both desktop and mobile header controls use the same provider,
locale changes do not alter routes or backend language state, and the cookie
is read on subsequent navigation/reload.

Next planned implementation task:

- `docs/agent-memory/tasks/P11-001.md`
- **Chinese-first locale + shared public shell foundation**
- state: PLANNED

## Immediate next action

Before implementing P11-001, the executor must:

1. read `AGENTS.md`;
2. read `docs/architecture/SERVICE_PLATFORM_UI_REBASE_V1.md`;
3. read `docs/agent-memory/CURRENT_HANDOFF.md`;
4. read `docs/agent-memory/tasks/P11-001.md`;
5. run/inspect `git status --short`, `git branch --show-current`, `git rev-parse HEAD`;
6. confirm the working tree is clean except for already-known protected local files;
7. implement P11-001 only;
8. run the Task Packet validation;
9. update this handoff with changed files, exact tests, risks, non-goals, and next action before stopping.

## Explicit non-goals for the next task

P11-001 must not:

- redesign Home/Services/AI Workspace wholesale;
- change backend answer behavior;
- add a database migration;
- change auth or VIP entitlement semantics;
- alter legal-service APIs;
- deploy AWS;
- copy unverified prototype claims;
- introduce locale-prefixed URLs.

## Review rule

The coding-agent completion message is advisory. Review must inspect actual Git diff, source, and test output.
