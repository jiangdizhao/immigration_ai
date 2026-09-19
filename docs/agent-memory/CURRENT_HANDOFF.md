# CURRENT_HANDOFF

**Updated:** 2026-09-19  
**Branch:** `phase11-chinese-service-platform-ui-rebase`  
**Base commit:** `3b3653202f9b067fbed4adfd410edc02cb7215cc`  
**Current HEAD:** to be stamped after bootstrap commit  
**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase

## What was done

P11-00 repository-memory/bootstrap documentation was added.

No runtime source code, database schema, environment, AWS resource, Stripe/SES configuration, or legal-serving behavior was changed.

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

P11-00: IMPLEMENTED / REVIEW REQUIRED.

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

