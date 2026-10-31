# Phase 13 — Project Workspace UX Integration (compact implementation contract)

**Date:** 2026-11-01  
**Status:** READY_FOR_BOUNDED_IMPLEMENTATION; UX-only, not a release approval  
**Branch:** `phase13-m5-school-admissions`  
**Priority:** Fix the current unusable Project layout quickly, with one small implementation batch and one focused review. Do **not** repeat the M5 architecture/E2E program.

## 1. Problem and decision

Current `ImmigrationAIWorkspace` is a chat-first three-column shell (`250px | flex | 290px`). `ProjectEntryPanel` embeds `SchoolApplicationsPanel` and `SchoolAdmissionsWorkflowPanel` in the 250px *navigation* rail. Selecting a Project with no Chat leaves the main area empty. The school/application forms are therefore cramped while most screen width is unused.

**Approved implementation direction for this task: reuse the existing `/ai-workspace` shell and M1–M5 controllers; relocate Project operations into the main content area.** No new standalone app/router, new workflow engine, reimplementation of M5 business rules, or new persistent Stage schema. Treat the lawyer's `doc/Picture1.png` (step/chat/materials), `doc/Picture2.png` (project document center) and `doc/Picture3.png` (exact-version/review) as visual/product *references*, not real statuses, data or requirements. The more extensive M9 workspace remains future work.

## 2. Required UI behavior (single cohesive vertical slice)

| Situation / navigation | Required behavior |
| --- | --- |
| Standalone Chat selected | Preserve the existing Chat layout, modes, conversation history, documents and policy launch behavior. No Project data appears. |
| Project selected, no Chat selected | **Main area shows a real Project home**, not the neutral empty-chat placeholder. Include Project identity, an actionable `School applications` view and an `Admissions workflow` view in properly sized content (simple tabs/sections are sufficient). |
| Project left sidebar | Navigation **only**: back to all chats, Project list/selection, current user's own Project Chats, create/open Project Chat; concise links/tabs to Project home, school applications and admissions. Do not mount large business forms here. |
| Project Chat opened | Main area returns to the existing authorized chat; a clear project-home action returns to the Project home without accidentally creating a new Chat. Preserve current chat-owner and membership controls. |
| School application / admissions actions | Reuse **existing** `SchoolApplicationsPanel`, `SchoolAdmissionsWorkflowPanel`, controllers and server APIs; preserve draft, package/version, archived, stale, error and permission semantics. Do not replace them with mock cards. |
| Disabled / unauthorized capabilities | Show concise truthful empty/blocked messages. Project Documents and staff/review features remain unavailable unless their *existing* server authorization genuinely permits them. No fake progress `4/12`, Offer, CoE, lawyer approval or school submission. |
| Narrow screen + languages | Main Project actions remain discoverable, readable and usable on mobile; support existing zh-CN/English switch without creating a separate mobile workflow. |

The user's next step should be obvious. Favor a modest, clear interface over recreating every decorative detail of the reference images.

## 3. Minimal source scope and integration rules

**Primary touchpoints:** `chatbot/components/immigration-ai-workspace.tsx`, `chatbot/components/project-entry-panel.tsx`, and at most one small extracted Project-main-content component plus relevant focused UI tests/copy. Existing `school-applications-panel.tsx` and `school-admissions-workflow-panel.tsx` should be reused with minimal presentation adjustments only if actually needed. Inspect `chatbot/lib/workspace/{project-entry,school-applications,school-admissions}.ts` and `chatbot/app/(chat)/ai-workspace/page.tsx` for props and server gates before editing.

**Preserve:** persisted Project/Chat associations; per-creator Chat privacy; M2 facts/document grants; M3 evidence labels; M4 review/payment/credential denial rules; M5 package/version/CAS/idempotency/currentness and error handling; old Standalone conversation behavior; exact server feature flags. Browser-supplied `projectId` never creates authority.

**No schema/migration, backend rewrite, new API, AWS/S3/Stripe, paid model, external provider, production deployment, or feature-flag activation in this task.** Do not reactivate Project Document text: scan attestation and `ai_context` permission remain separate live NO-GO gates. Do not silently change the historical M4 or post-M5 E2E verdicts.

**Local working-tree warning:** the 2026-11-01 handoff reports an uncommitted P1 personal-Project-access patch (about 40 status entries) that is *not* in the remote baseline. Before editing, Codex must inspect the actual local branch/status/diff and preserve these changes. No `reset --hard`, `git clean`, force-push, auto-stash/rebase/merge, or replacement of P1 files. If a conflict is real, report the exact files rather than undoing the patch.

## 4. Bounded validation / stop rule

One implementation pass. One focused correction pass **only if a reproducible primary-path, privacy, state or build failure exists**. Do not expand into M5-style endless gates.

Acceptance smoke (use existing authorized test account and synthetic records, no external submission):

1. Project selected without Chat: main area shows usable Project home; both M5 entry points are no longer cramped in the left sidebar.
2. Create/open at least one draft school application and access its admissions workflow through existing gated API; status remains truthful, with errors shown rather than silently faked.
3. Switch Project A → Project B → Standalone: no cross-Project/Chat data leakage or stale selected-panel data.
4. Open a Project Chat, then return home; Standalone Chat and policy launch still work.
5. Check one desktop width, one narrow/mobile width, and zh-CN ↔ English.
6. Verify disabled/unauthorized/M4-M5 NO-GO states remain blocked; no real provider/payment/review/document scan claims.

Run **focused component/controller tests**, changed-file Biome, `git diff --check`, and one `pnpm build` (classify pre-existing diagnostics separately). Browser smoke is preferred to a giant new acceptance harness. No mandatory full M5/Post-M5 replay or migration for a presentation-only change. Report PASS/FAIL/SKIP honestly.

## 5. Deliverable and done

Codex delivers: (a) concise changed-file list, (b) actual `git diff` / cumulative review patch including new files, (c) focused test/build and one browser-smoke results, (d) remaining limitations. **No commit/push** until owner approval after independent review. Update `CURRENT_HANDOFF.md` with real completion status after implementation.

**DONE = a Project user can navigate Project home → school applications → admissions → own Chat on desktop/mobile without sidebar-cramped forms or a blank main pane, while all existing permissions and unreleased gates remain intact.** Stop there. Stage engine, document center, step-scoped conversations, professional review, real progress calculation and M6–M9 expansion are explicitly deferred.

**Authority / context:** `AGENTS.md`; `docs/agent-memory/PHASE13_UI_PRODUCT_BLUEPRINT_2026_10_24.md`; `docs/agent-memory/PHASE13_STUDY_JOURNEY_ROADMAP.md`; M5 closeout and Post-M5 E2E final G5 record; `Immigration_AI_Phase13_Project_Workspace_UX_Integration_Handoff_2026-11-01.docx` (uploaded handoff, not a Git release assertion).