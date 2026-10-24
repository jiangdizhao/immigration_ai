# Phase 13 M1.4 — Minimal Customer Project Workspace Integration

**Prepared:** 2026-10-24
**Source branch:** `phase13-study-journey-project-centric`
**Base HEAD:** `27ceb8a3e75456f3357027e368565674687a3896`
**Status:** OWNER-AUTHORIZED BOUNDED IMPLEMENTATION PACKET; no M1.4 code changes at this documentation checkpoint.

**Authoritative sources:** D-P13-002–D-P13-007; M1.1/M1.2/M1.3 contracts; `PHASE13_STUDY_JOURNEY_ROADMAP.md`; `PHASE13_UI_PRODUCT_BLUEPRINT_2026_10_24.md`; `AGENTS.md`. M1.3 independent R1 security review and owner-reported unit/DB evidence are prior implementation checkpoint evidence, not a claim that M1.4 is already implemented.

## 1. Boundaries and existing APIs

This is **only** the narrow UI slice accepted in D-P13-004/F: create/select a Project, create/open an individually owned Project Chat in the existing `AI Workspace`, show Project/Standalone distinction, preserve existing standalone/policy/legacy history and read-only Project-origin fallback.

Use **already implemented**:
- `GET /api/projects`: `{projects:[{id,status,revision,createdAt,updatedAt,closedAt}]}`. It currently returns **active Projects only** accessible to the actor. It does *not* return names, type, Offer/CoE, progress, or a separate service mode.
- `POST /api/projects`: strict body `{operationId}`, response `{project:{...}}` (201). No title/type field; do not invent one.
- `GET /api/projects/{projectId}/chats`: owner/current member gets only **their own** Project Chats, with `conversations`, `hasMore`, `nextCursor` and `origin/readOnly` projections.
- `POST /api/projects/{projectId}/chats`: `{operationId,title?}` and `{chatId,projectId,origin:"project",readOnly,replayed}`. Existing `PHASE13_PROJECT_CHAT_ENABLED` defaults off and server must authorize.
- Existing `GET /api/immigration-conversations` and `GET /api/immigration-conversations/{chatId}` already expose server-derived Project origin and readOnly, and enforce Chat ownership + current Project customer/member status.
- Existing `ImmigrationAIWorkspace`, `PremiumAnswerModeWorkspace`, `AIWorkspacePage`, `workspace-copy.ts`, `conversation-origin.ts`, and policy-launch flow. Keep `ProjectScope.projectId = null` in actual AI context (future M2).

## 2. UX components (reuse existing screen, not lawyer mock's full workflow)

**Left sidebar** near existing "+ 新建对话": show distinct "+ 新建项目" control when explicitly enabled and user eligible. Because existing desktop sidebar is 250px, use accessible stacked controls or compact layout without wrapping/overflow; keep mobile history panel functional.

Below, a collapsible "我的项目" list using only server-returned active Project IDs and dates; do not hardcode professional case labels. Recommended label: localized "项目 · 2026-10-24 · #abcd1234"; tooltip/accessible name exposes full ID when appropriate. No durable rename, fake projectType, process stage or task count. Empty state: no projects yet. The global conversation history remains reachable.

Selecting a Project changes the left panel to own Project Chat list and clear Project label; do NOT automatically link, transfer or create a Standalone Chat, and do NOT imply the AI receives cross-chat Project context. A neutral selected-project state can show "Select or start a Project conversation" in the center, clearing any misleading stale Standalone active-chat header. Provide "返回全部对话" and always-Standalone "+ 新建普通对话".

Project Chat creation/open: reuse POST Project Chats and existing `loadConversation(chatId)`, and then refresh both lists as necessary. A newly created Chat gets a server-generated ID and is clearly labelled Project-origin. Global history can continue to show appropriately scoped Project Chats with badges.

On the right, **keep the existing conversation-scoped data panels** and M1.3 capability restrictions; do not relabel a conversation's files as Project files. If needed, provide a tiny honest notice that Project documents/shared facts/step workflow are not yet available. Hide/disable unsupported upload, intake, lawyer review as M1.3 already does, rather than re-enabling them.

**Create modal:** short CN/EN explanation that this creates an empty Project container and own Project Chats, not school/visa workflows. Confirmation invokes strict `POST /api/projects` with a stable per-attempt UUID operationId. No type, Offer, CoE, service mode, payment, name or step fields. On success refresh and select Project; let user deliberately click "New Project Chat". Do not generate a user message or model call merely from creation/selection.

**Project header:** show Project origin, server-derived short ID and current Chat title/readOnly only if backed by actual data; no guessed stage, overall readiness, "approved", finance or lawyer review state. Mobile projects reachable through existing panel strip.

## 3. Feature gating and security

The write/turn feature flag `PHASE13_PROJECT_CHAT_ENABLED` is **default false**. Use a minimal server-derived UX capability prop or equivalent server-side provider (not a writable browser override) from the current AI Workspace page through `PremiumAnswerModeWorkspace` into `ImmigrationAIWorkspace`. Show interactive Project *creation / Project Chat* controls only when the server capability is enabled **and** the customer is eligible. This UI capability is cosmetic; authorization and feature gate remain independently enforced on API calls. Do not allow Project-creation UI while new Project Chats cannot work. Avoid changing deployment environment or enabling the flag for customers; tests can inject/test a mocked explicit capability. No browser storage of an authorization decision.

When the gate is off, previously created owned Project Chat history must remain reachable and visibly Project-origin/readOnly through existing authorized history, even though creating Project/Chat and new turns are not offered. Closed Projects are not included in `GET /api/projects` today; authorized own closed-Project Chats are still available in global read-only history, not in a fictitious list of active Projects. Revoked/pending access denied by existing server authorization; the UI should clear stale selection and not disclose another member's metadata.

Do not create a second Project/Chat mapping, trust caller-supplied owner, persist fake modes, share member transcripts, add schema or migration, or change current Project/turn admission. The existing Project POST endpoint is not itself gate-protected; the M1.4 UI must not promise that hiding a client button disables direct HTTP Project creation. Explicitly document this as an API-level rollout caveat for production enablement review, and do not enable the Project feature in production as part of M1.4.

## 4. Implementation steps

A. **Pure interaction contracts and bilingual copy:** add `lib/workspace/project-entry.ts` or equivalent for safe UI selectors, ordering, deep-link/origin read-only rules and parse/error shapes, plus `lib/workspace-copy.ts` CN/EN strings and tests. No fake types or stages.

B. **UI components:** a small accessible `ProjectEntryPanel` / modal (or similarly scoped client component) under `chatbot/components/`, integrated with `immigration-ai-workspace.tsx`. Preserve existing dimensions, history and keyboard operation. Avoid importing server-only DB code in client components.

C. **Data integration:** fetch existing APIs with no-store semantics, bounded pagination and stable operation IDs; refresh after create, guard concurrent requests, reject stale responses on Project switch, surface 401/403/404/409/503 as helpful localized failures, no success claim on ambiguous network failure. Reopen Project Chat from existing Chat history and URL `chatId` on reload. Do not fabricate labels or persistent Project names.

D. **Compatibility + acceptance:** tests with mocked HTTP and real rendered components where feasible, guarded PostgreSQL API smoke with synthetic users for active owner/active member/pending/revoked/closed, separate Standalone Chat and policy launch. No DB reset/migration unless separately needed and guarded. Leave uncommitted for independent review.

## 5. Acceptance test matrix (minimum)

- Registered active Project owner: list and create Project, select, create new Project Chat, open existing own Chat, persist across reload via `chatId`.
- Active member sees an eligible Project and only *own* associated Chats; never other member's messages. Pending/revoked users cannot browse/create; stale saved selection clears on 404/403.
- Project created twice with same retry operationId yields one Project. Double click/inflight retry on new Chat never creates a second Chat; changed request hash conflict handled as failure.
- New Standalone Chat never associates a Project, including when Project is selected. Policy launch remains correctly policy-bound and separate. No legacy Chat mutation/read regression.
- Closed Project is absent from active Project picker; authorized own Project Chat from global history opens read-only. Gate-off fallback shows read-only history and no new Project/Chat model turns; do not reclassify as Standalone.
- Correct visible origin, accessible control labels, CN default/EN switch, mobile panel navigation, empty/loading/errors, long ID overflow and cancellation.
- Project UI never presents shared Project files, Project facts, project stage tasks or real submission/review/payment readiness because no such contract exists in M1.
- `pnpm test:unit` 0 failures; relevant UI tests; backend M1.1/M1.2/M1.3 DB suites sequential where necessary; Biome, `pnpm db:check`, `git diff --check`; compare TypeScript diagnostics with existing 44 baseline. Database skips are not passes.

## 6. Deliverable and stopping conditions

Small, reviewable diff with CN/EN responsive UI, pure tests and project history contract; no migrations, new database columns, service pipeline modifications, staff workflows, lawyer review or externally managed service. Update three current state docs with exact executed tests and remaining limitations; do not commit or push until independent source/code review.

Any review patch or temp Markdown authored **outside** the repo goes into `~/`, never `/tmp/`. No secrets. Do not create a new `/tmp/` export workflow.

**Stop for owner review** if implemented contract truly requires Project display names/type/stages, a new persisted field, cross-chat scope, Project documents, or changing the existing Project gate; those belong to separate authorized milestones, not ad-hoc M1.4 widening.
