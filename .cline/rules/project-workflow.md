# Immigration AI — Shared Project Workflow

This repository uses repository-first shared project memory.

## Start of every meaningful task

Read the smallest sufficient set:

1. `AGENTS.md`
2. `docs/agent-memory/CURRENT_HANDOFF.md`
3. active Task Packet under `docs/agent-memory/tasks/`
4. only the canonical architecture/decision documents referenced by that task

Then verify:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

Do not treat prose handoffs as ground truth until checked against Git, source and tests.

## Authority

- Frozen/project-specific architecture and `AGENTS.md` override this workflow.
- Task Packets define execution scope; do not broaden them silently.
- `DECISIONS.md` contains accepted durable decisions; do not reverse them without explicit approval.
- The temporary UI repository is a design reference only for Phase 11; the main repository is functional authority.

## During implementation

- Keep changes bounded to the active Task Packet.
- Do not modify legal/backend architecture for a UI task unless the task explicitly authorizes it.
- Do not add migrations, deploy, merge, rebase, force-push, or change secrets/environment without explicit authorization.
- Keep secrets and protected local files out of prompts, logs, diffs and documentation.
- Run focused validation incrementally.

## Before stopping or starting a fresh agent task

Update `docs/agent-memory/CURRENT_HANDOFF.md` with:

- branch and exact HEAD;
- task status;
- changed files;
- tests and exact pass/fail/skip state;
- risks or unresolved issues;
- explicit non-goals;
- immediate next action.

Do not claim a test passed if it was skipped or not run.

## Task lifecycle

```text
PLANNED
  -> IN_PROGRESS
  -> IMPLEMENTED
  -> REVIEW_REQUIRED
      -> VERIFIED
      -> REWORK_REQUIRED -> <task>-R1 -> review again
```

Once implementation starts, the original Task Packet should normally remain immutable. Corrections use a new revision packet such as `P11-001-R1.md`.

## Completion message

A completion narrative is not authoritative. The reviewer will inspect actual source, Git diff and tests.

