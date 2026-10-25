# Phase 13 M2-A1.2-B2-1 — Codex Offline Implementation Packet

**Status:** READY FOR OWNER DISPATCH OF OFFLINE CODE ONLY; **not** authorization to contact AWS.  
**Branch:** `phase13-study-journey-project-centric`  
**Expected starting HEAD:** `1fc3820b440fe1e74edbd4b24218d7717f61e234` plus this docs-only architecture checkpoint after owner fast-forward.  
**Authority:** [B2-1 Live Read-only Executor Contract](./PHASE13_M2_A1_2_B2_1_LIVE_READONLY_EXECUTOR_CONTRACT.md) and accepted B2-0/B1/A1.2-A contracts.

## Task

Implement only the B2-1 narrowly bounded **real AWS read-only CLI executor**, its independently gated operator entry, sanitized `live_operator_readonly` observation collector and adversarial injected-fake tests. Reuse B2-0 validation, plan/templates, finding logic, evidence hashing and time/call limits. **Do not invoke AWS CLI against any real profile/network, even for identity.** Preserve B2-0's standalone help, plan and collection-denied semantics.

### Required design decisions

1. New independent server/operator entrypoint: default help/refusal; explicit `--collect-read-only`, scope-path, approval-path, confirmed-account and sanitized report-path required. No side effects on import or malformed input. Existing `b2-cli.ts` untouched except a separately approved compatibility fix, if absolutely necessary.
2. Injection-only testable command runner with narrow literal AWS CLI subcommand/argument allowlist and subprocess bounds, no shell and no custom endpoints. Only enabled when all B2-1 preflight gates pass. Use validated named non-default operator profile and pinned region; reject ambient credential/config/endpoint overrides rather than silently use them.
3. First actual operation MUST be STS GetCallerIdentity. Match expected account and exact caller ARN before any other call. Never substitute a profile/account/region/role or perform `AssumeRole` explicitly.
4. Execute only B2-0 `b2RequestTemplates` and strict, bounded dependent IAM calls. Use exact selector matches and bounded pagination; mark missing/denied/truncated/unknown `INCOMPLETE`. Reuse `evaluateB2ApiResponse` where appropriate without treating its static PASS as attestation.
5. Output schema-compatible sanitized live observations with per-finding source, reason codes, safe hashes and `NO_GO`. Do not save raw response/policy/identifiers or leak stderr; preserve source-provenance boundary with fixtures and B1 evaluator.
6. Do not import/integrate with Project customer upload routes, `finalizeScan()`, trust minting, SQS worker, Project AI context, legal service, shared/production database or feature flags. No migration, cloud change or deployment.
7. Add adversarial offline test cases listed in the B2-1 architecture contract and verify zero actual AWS subprocess/network calls in test runs. Keep B2-0 / B1 / A1.2-A regressions green. Do not suppress known TypeScript errors by broad changes.

### Preconditions and exit gate

Before editing: read `AGENTS.md`, current three state docs, B2-1 architecture contract, B2-0 source/tests, B1 evaluator/queue and operator runbook; check branch, HEAD, worktree and origin. Stop if unexpected uncommitted changes or an incompatible upstream HEAD appear; never clean/reset/rebase. During this coding assignment, use fake injection and offline tests ONLY. Actual account/profile/resource selectors are **not** supplied to Codex.

Finish with:
- Exact added/changed file inventory and explanation of each trust boundary.
- Focused and full unit results with failures/skips; changed-file Biome, `git diff --check`, TypeScript diagnostic delta.
- One cumulative uncommitted patch at `~/phase13_m2_a1_2_B2_1_review.patch` plus SHA-256 and any limitations.
- Updated `CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md` with true **implementation pending independent review** state.
- **No commit, push, migration, AWS call, credentials inspection, database connection, S3 scan, queue consume, or production deployment.**

Independent ChatGPT review -> owner commit/push -> remote SHA verification -> **separate** owner-approved B2-1 live experiment.
