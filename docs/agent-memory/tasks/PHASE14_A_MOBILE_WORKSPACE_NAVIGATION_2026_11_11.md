# Phase 14-A — Mobile Workspace Navigation & Scrolling
**Status:** OWNER-APPROVED PLAN / IMPLEMENTATION NOT STARTED  
**Date:** 2026-11-11 (Australia/Sydney)  
**Repository:** https://github.com/jiangdizhao/immigration_ai  
**Implementation branch:** `phase14-a-mobile-workspace-navigation`  
**Forked from:** `phase13-m9-integrated-workspace` @ `7b9a64c0ca1dc791d64d4035559efe902b813aad`  
**Scope:** One bounded UI implementation followed by focused tests and one owner browser acceptance. This is Phase 14-A only; Phase 14-B Project Documents is separate.

## 1. Goal and accepted product decisions
Make the existing customer AI/Project Workspace genuinely usable on phones. The owner accepted:
1. Exactly **four mobile bottom navigation entries**: All Conversations, Project Home, Work Steps, Navigation.
2. Exactly **one shared Radix Sheet** for mobile navigation, changing its content mode rather than maintaining multiple independent drawers/controllers.
3. **Focused implementation tests plus one manual browser acceptance**, not a new exhaustive test campaign.
4. **One cohesive Cline task**, not a chain of submilestones. No repeated cosmetic correction loops.
5. Cline-generated review files (`.patch`, `.md`) go **in the repository root by default**, not `~/` or `/tmp`, and are not automatically committed.

## 2. Observed source issues (baseline at 7b9a64c)
- `chatbot/components/immigration-ai-workspace.tsx` currently renders the primary mobile center area with `h-[min(66dvh,620px)] min-h-[320px]` and the Project home has its own scrollable `overflow-y-auto`.
- The narrow-screen grid renders center before left/right panels; left/right use `order-2`/`order-3` and mobile `max-h-[38dvh] overflow-y-auto`, producing awkward multi-scroll/navigation.
- A top horizontal tab strip (`workspace-panel-tabs`) currently toggles history, conversation files, account files and case summary.
- Existing authoritative navigation behavior is in `runProjectNavigationAction`, `resetProjectConversation`, `handleSelectedProjectChange`, `handleSelectProjectView`, `returnToProjectHome` and Project Entry/controller logic. Reuse these; do not invent a separate state machine.
- `chatbot/components/ui/sheet.tsx` already provides the Radix Sheet primitives; no extra drawer library is needed.
- The previously accepted desktop layout is a full-width workspace with a three-column `xl:grid-cols-[210px_minmax(0,1fr)_220px]` grid. Preserve it.

## 3. Functional contract
### 3.1 Mobile bottom navigation (viewport below the existing `xl` breakpoint)
- **All Conversations:** go to existing global conversation/history selection. Do not create/delete a Chat, silently attach a standalone Chat to a Project, or discard an in-flight turn.
- **Project Home:** return to current Project home via the existing callback; if no Project is selected, expose existing Project selection in the Sheet, without fabricating a Project.
- **Work Steps:** open the *same* Sheet in `steps` mode, displaying the existing authorized `ProjectWorkspaceNav` / stage actions. With no active Project, show a clear neutral state and the existing Project selection path.
- **Navigation:** open the *same* Sheet in `navigation` mode, exposing existing Project list, owned conversation history, and existing available context/file/case-summary panels. Do not claim Project Documents are operational when their runtime trust gate is DENY.
- Bilingual `zh-CN` / `en` labels. Reuse `getWorkspaceCopy` or add minimal copy entries, not scattered hard-coded translations.
- Always respect `projectNavigationBusy`, current chat ownership, Project A/B isolation, closed/revoked member state, URL/history contract and server permissions. No new client authority.
- Close Sheet after successful navigation; keep pending or denied operations from presenting a misleading successful selection. Escape/backdrop close and focus management should use existing Radix behavior.

### 3.2 Scrolling and layout
- In **Project Home/section** views on mobile, remove the fixed 66dvh center-height trap and nested Project-content scrolling so the main document has a natural vertical flow.
- In **AI Chat**, preserve independent message scrolling, composer usability, existing message autoscroll and conversation loading semantics. Do not force the chat to become a very tall whole-page transcript.
- Replace mobile below-center left/right panel stacks with Sheet access, without duplicating `ProjectEntryPanel` controller instances or remounting its state on every view change.
- Bottom navigation stays accessible on mobile without covering last page content, Chat composer or system safe area. Handle soft-keyboard focus pragmatically (e.g., hide or adjust bottom navigation while typing); do not introduce an elaborate keyboard manager.
- Existing desktop `xl` three-column layout and its scrolling/typography remain functionally and visually intact.
- No unnecessary visual redesign, new animation dependency, or public marketing-page changes.

### 3.3 Existing important state boundaries
- The current selected Project, Chat ID, navigation history, and backend-owned stage state remain the source of truth.
- A slow response from Project A may not repaint Project B; preserve the existing load sequence and reset mechanics.
- Project-origin Chat remains creator-owned and must not become Standalone on navigation.
- An in-flight model answer or Chat load cannot be abandoned by a new bottom-nav bypass.
- No UI unlocks currently disabled Project Documents, professional service, payment, lawyer review or submission.

## 4. Likely source touch points (not a mandatory file checklist)
- `chatbot/components/immigration-ai-workspace.tsx` — responsive layout, shared mobile Sheet and bottom navigation wiring.
- `chatbot/components/project-workspace-home.tsx` — mobile Project natural scrolling.
- `chatbot/components/project-entry-panel.tsx` and `project-workspace-nav.tsx` — only minimal changes needed for embedding/reusing navigation.
- `chatbot/components/ui/sheet.tsx` — **prefer no changes**, reuse primitives.
- Optional `chatbot/components/mobile-workspace-navigation.tsx` — purely presentational four-entry component if this keeps the 3,400-line workspace manageable.
- Existing `chatbot/lib/workspace/project-entry.test.ts` and other relevant Workspace tests — adapt minimal brittle structural assertions and add focused behavior tests where necessary.

## 5. Acceptance matrix (one bounded owner browser pass)
| ID | Viewport / flow | PASS condition |
| --- | --- | --- |
| A1 | 390px phone, Project home and stage | One natural Project content scroll; all four bottom actions visible/reachable; no accidental stacked sidebars |
| A2 | 430px phone, Sheet and Project A/B/history | One Sheet with two modes; switching/reopening selects correct Project/Chat; no stale Project A content shown under Project B |
| A3 | Phone Project Chat and standalone Chat | Chat messages scroll independently; composer works with keyboard; Project Home return works; in-flight busy restrictions remain |
| A4 | 768px tablet, zh-CN/en | No meaningful horizontal overflow/occlusion; labels and Sheet content work |
| A5 | Desktop at or above 1280px | Existing three-column Workspace and accepted typography/width are not degraded |

Browser acceptance is **owner-performed** after Cline finishes. Cline must NOT claim A1–A5 PASS merely from tests or static analysis. Where browser proof is unavailable, mark `NOT RUN`.

## 6. Validation and stop rule
- First inspect current Git worktree and relevant source; do not assume older handoff lines describe current behavior.
- Focused Node/Workspace tests for mobile navigation, switching Project, read-only/disabled navigation and preservation of existing Chat behavior.
- Changed-file Biome check, `pnpm build`, `git diff --check`; compare TypeScript diagnostics to the historical baseline (**44 pre-existing errors** in past reports, verify actual count).
- No mandatory full monorepo or Python test suite, database tests, AWS, paid models or browser automation for this UI-only task.
- A **single integrated implementation and validation** is expected. If a core blocker is found, allow one bounded correction pass. A core blocker means failed main navigation, wrong Project/Chat state, broken composer, substantial mobile obstruction, severe desktop regression, security/permission regression, or build failure. Document cosmetic issues for later rather than spinning up R1/R2/R3.

## 7. Explicit non-goals and operational boundaries
No database schema/migrations/SQL, S3/GuardDuty, AWS resources, ECS, DNS, Stripe, API auth, FastAPI, legal retrieval, evidence checker, Project Documents live trust, admissions/Student 500 law, new backend routes or feature-flag activation. Phase 13 `M10_ENGINEERING_ACCEPTED_WITH_LIMITATIONS`, `M2 trust DENY`, `M6 legal coverage PARTIAL`, `M4 professional authority unavailable`, `STAFF_PRIVATE_PACKAGE_AUTHORIZATION_PENDING`, and `LIVE_PRODUCTION_NO_GO` remain in force.

## 8. Engineering handoff and Git rules
1. Cline implements **only after owner starts the task**, does not commit/push/merge/rebase/force-push/deploy or run destructive commands.
2. Write `~/immigration_ai/phase14_a_review.patch` (full cumulative code diff, including any added files) and `~/immigration_ai/phase14_a_report.md` (files, behavior, test commands/results, known limits, manual acceptance checklist), plus SHA-256 of patch.
3. Keep both generated review artifacts local, untracked and **outside the eventual Git commit**. New implementation source files must be included in the patch (use intentional `git add -N -- <specific new source paths>` where required; never stage all files indiscriminately).
4. Add a concise **implemented/pending owner review** checkpoint at the top of `docs/agent-memory/CURRENT_HANDOFF.md` only after implementation and tests, keeping historic entries intact. Do not mark manual browser acceptance PASS in advance.
5. ChatGPT independently reviews the patch; owner performs A1–A5; owner explicitly authorizes selective `git add`/commit/push; then verify remote SHA before beginning Phase 14-B.

## 9. Environment and authorities for a fresh coding session
- Ubuntu local clone: `/home/rico/immigration_ai`; Next.js workspace `/home/rico/immigration_ai/chatbot`; FastAPI legal backend `/home/rico/immigration_ai/legal-service`.
- Project uses pnpm / TypeScript / React / Next.js; inspect `chatbot/package.json` and lockfile for actual versions/commands; existing local frontend development URL normally `http://localhost:3000/ai-workspace`.
- Python interpreter for legal-service validation where relevant: `/home/rico/anaconda3/envs/torch/bin/python` (Conda `torch`); this UI task does not require Python tests.
- Existing host PostgreSQL typically `127.0.0.1:5432`, with app DB `chatbot` and legal DB `immigration_legal`; **neither database may be modified or used for destructive tests in Phase 14-A**. Do not substitute old Docker `5433`.
- AWS historical context: profile `aulawyers-staging`, region `ap-southeast-2`; **no AWS calls or deployment are authorized**. Recent read-only Friends Preview preflight is not deployment permission.
- Protected local files: `chatbot/.env.local`, `legal-service/.env`, AWS credentials, `~/.pgpass`; never print, edit, commit or paste secrets.
- Read `AGENTS.md`, this contract, latest `CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md`, `DECISIONS.md` and pertinent source before implementing. Repo code and tests take precedence over stale historical statements.

**Completion criteria:** implementation can be independently reviewed as a single bounded patch; focused validation passes (or precise baseline/known exceptions are documented), and the owner confirms one browser acceptance. No release permission is implied.
