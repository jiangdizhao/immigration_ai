# Cline Execution Prompt — Phase 14-A Mobile Workspace
Copy the text below into a **new Cline task**, after synchronizing the new branch locally. This file is a prompt artifact, not implementation authorization for AWS, DB, or deployment.

---

You are the implementation engineer working in the existing **Immigration AI** repository. Complete **Phase 14-A: Mobile Workspace Navigation & Scrolling** as ONE coherent, bounded, frontend-only task. The owner already approved the contract; do not redesign the feature, create extra submilestones, or begin Phase 14-B.

## 0. Required project context and local environment
- Repository: `https://github.com/jiangdizhao/immigration_ai`
- Required branch: `phase14-a-mobile-workspace-navigation`
- Branch was created from `phase13-m9-integrated-workspace` commit `7b9a64c0ca1dc791d64d4035559efe902b813aad`. This branch includes later documentation-only planning commits; verify the *actual* local and remote HEAD and do not assume the fork commit is current HEAD.
- Local Ubuntu clone: `/home/rico/immigration_ai` (`~/immigration_ai`).
- Next.js/React/TypeScript app: `/home/rico/immigration_ai/chatbot`, package manager **pnpm** (use the project's lockfile and package scripts). The local UI normally serves `http://localhost:3000/ai-workspace`; determine the actual runtime when needed rather than assuming it is running.
- Python FastAPI legal backend: `/home/rico/immigration_ai/legal-service`. Approved Python interpreter if ever needed: `/home/rico/anaconda3/envs/torch/bin/python` / Conda `torch`. **No backend/Python changes or tests are needed for this UI task.**
- Normal host PostgreSQL: `127.0.0.1:5432` (separate `chatbot` app DB and `immigration_legal` legal corpus DB). An old Docker database on `5433` is non-authoritative. **Do not connect, migrate, reset, or write any DB for this task.**
- Historical AWS profile `aulawyers-staging`, region `ap-southeast-2`; production/staging release is **NOT authorized**. Do not call AWS, mutate cloud resources, use Stripe, or run paid/live models. The Friends Preview preflight recorded in the latest handoff was read-only and did NOT approve deployment.
- Never read out, overwrite, copy into artifacts, or expose credentials from `chatbot/.env.local`, `legal-service/.env`, `~/.pgpass`, AWS configuration or the project shell environment.
- The Phase 13 code is engineering accepted WITH LIMITATIONS; do not bypass Project Document trust DENY, legal source PARTIAL/UNKNOWN, unavailable professional review/payment authority, staff-private-package access restrictions, or `LIVE_PRODUCTION_NO_GO`.

## 1. Read the actual repository before editing
From `~/immigration_ai`, run:
```bash
git branch --show-current
git status --short
git rev-parse HEAD
git log --oneline -6
git ls-remote origin refs/heads/phase14-a-mobile-workspace-navigation
```
Confirm you are on the required branch and are not looking at an unexpectedly dirty worktree; preserve any pre-existing local changes and stop if they conflict. No force pull, reset, clean, rebase, merge or branch switch without owner consent.

Read, in order:
1. `AGENTS.md`.
2. `docs/agent-memory/tasks/PHASE14_A_MOBILE_WORKSPACE_NAVIGATION_2026_11_11.md` **in full** (this is the immediate implementation contract).
3. Top/current sections of `docs/agent-memory/CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md`, `DECISIONS.md`.
4. Relevant existing components and targeted tests, especially:
   - `chatbot/components/immigration-ai-workspace.tsx`
   - `chatbot/components/project-workspace-home.tsx`
   - `chatbot/components/project-entry-panel.tsx`
   - `chatbot/components/project-workspace-nav.tsx`
   - `chatbot/components/ui/sheet.tsx`
   - `chatbot/lib/workspace/project-entry.ts`, `project-workspace-view.ts`, and relevant `*.test.ts(x)`.
Check `chatbot/package.json` for real test/build scripts. Favor current source/tests over stale handoff statements.

## 2. Deliver exactly this mobile UX
**Mobile (< existing `xl` breakpoint):**
- Four persistent bottom navigation entries, bilingual `zh-CN`/`en`: **All Conversations**, **Project Home**, **Work Steps**, **Navigation**.
- Exactly **ONE Radix Sheet** component instance, reused with modes (steps/navigation). Work Steps opens the authorized Project stage navigation; Navigation opens existing Project list/history and existing available panels. No second independent Project controller; preserve stable selection/state.
- All Conversations invokes the existing global history path without creating/deleting a conversation or silently changing Project origin.
- Project Home returns to the active Project home via existing navigation functions. If none selected, show existing Project selection affordance.
- Reuse existing `runProjectNavigationAction`, Project selection and load sequence guards. Respect busy navigation, read-only/closed/revoked Project, per-Chat ownership and Project A/B isolation.
- **Project Home and Project section content** use one natural page scroll; eliminate the mobile `h-[min(66dvh,620px)]` center trap and nested content scroll conflicts.
- **AI Chat** keeps its separately scrolling message area, usable composer, send/autoscroll behavior, and proper soft-keyboard handling.
- Replace mobile left/right panels stacked below the center with access through the shared Sheet; preserve necessary contents and do not misleadingly present disabled Project Document functions as active.
- Bottom navigation cannot cover important content or composer; respect safe area. Handle Sheet keyboard/escape/focus using existing Radix primitives.
- Preserve accepted **desktop >= xl** three-column presentation and typography.
- Do not add a new navigation framework, third-party drawer/keyboard dependency or new backend feature.

**Absolutely no** schema/migration/API/auth/permissions/LLM/FastAPI/Stripe/S3/GuardDuty/AWS/feature-flag/security-boundary changes. Phase 14-B trusted Project Documents is not in scope.

## 3. Implementation style and scope discipline
Implement the approved behavior using the smallest coherent set of component updates. An optional small presentational `mobile-workspace-navigation.tsx` is acceptable if it simplifies the large workspace file. Prefer the existing `ui/sheet.tsx` unmodified.

Fix any existing structural test that pins an obsolete CSS class only if your change legitimately invalidates it; write focused regression coverage for the four actions, single Sheet, busy navigation, Project switching and Chat/home scroll distinction as appropriate. Do not invent a new extensive test harness or a long series of small reviews.

## 4. Validation
From `~/immigration_ai/chatbot`:
- Run targeted existing Workspace/navigation tests, with any new focused tests. Use supported `node --import tsx --test` invocation and `--conditions=react-server` where required by the test; consult `package.json` rather than guessing.
- Run Biome on **changed files only**, `pnpm build`, and `git diff --check`.
- Optionally run `pnpm exec tsc --noEmit` to compare with the historical ~44 TypeScript baseline errors; do not call legacy failures a regression without checking.
- No DB, AWS, backend, paid provider or full-system E2E tests. Do not declare manual browser tests PASS without the owner performing them.

Prepare a clear owner manual acceptance checklist with five bounded cases:
A1 390px phone Project Home/section natural scroll and four actions;
A2 430px phone one Sheet, A/B Project and conversation history transitions;
A3 phone Project/Standalone Chat messages, composer with soft keyboard and busy-navigation controls;
A4 768px tablet bilingual display without meaningful overflow;
A5 desktop >=1280px accepted 3-column layout preserved.

**Stop rule:** one cohesive implementation, one focused validation pass, and at most one bounded correction for actual blockers (main navigation broken, wrong Project/Chat state, unusable composer, serious obstruction/overflow, authorization regression or build failure). Record cosmetic differences as deferred; no R1/R2/R3 loop for styling perfection.

## 5. Required deliverables and output paths
All generated review files must reside **inside the local project root**, not `~/` or `/tmp`:
- `/home/rico/immigration_ai/phase14_a_review.patch` — full cumulative diff **including new source files**.
- `/home/rico/immigration_ai/phase14_a_report.md` — changed file inventory, behavior summary, actual executed command outputs (PASS/FAIL/SKIP), known limitations, A1–A5 owner checklist and explicit non-goals.
- Report `sha256sum phase14_a_review.patch` and exact changed-path list.
- Include any new implementation files via an intentional `git add -N -- <new source paths>` before `git diff --binary > phase14_a_review.patch`; never `git add -A`. If pre-staged changes exist, report them separately instead of omitting them from the review patch.
- Leave both `.patch` and `.md` **untracked** and never include them in the eventual Git source commit.
- Once implementation is truly finished, prepend a short honest `IMPLEMENTED_PENDING_OWNER_REVIEW` checkpoint to `docs/agent-memory/CURRENT_HANDOFF.md` (preserve all prior history); do NOT pre-mark owner browser scenarios PASS.
- **Do not commit, push, merge, rebase, deploy, run migrations, or edit the Phase 13 source branch.**

Final reply to the owner: short summary of the concrete UI changes, exact validation results, paths/patch hash, retained limitations, and what the owner must test. Stop there for independent ChatGPT patch review before any commit/push.
