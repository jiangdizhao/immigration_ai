# Phase 13 — Project-Centric Customer UX / Product Blueprint (owner-accepted direction)

**Date:** 2026-10-24
**Source checkpoint:** `phase13-study-journey-project-centric` at `27ceb8a3e75456f3357027e368565674687a3896`.
**Status:** Owner-accepted UX/product direction. This document is a *design and phased acceptance reference*, not a statement of implemented capability or approval of legal/admissions/financial rules.

## 1. Source, scope and precedence

Inputs: the lawyer-friend's `doc/Picture1.png`, `doc/Picture2.png`, `doc/Picture3.png` and the historical `doc/Immigration_AI_Study_Journey_Project_Centric_Architecture_V2_2026-10-22.pdf`; the user's current AI Workspace screenshot and 2026-10-24 owner UX feedback. Treat those images as conceptual mockups, **not** implemented API/data fields, hard legal requirements, approved statuses or user entitlements. Canonical authority remains `AGENTS.md`, D-P13-001–D-P13-007, accepted M1 contracts and `PHASE13_STUDY_JOURNEY_ROADMAP.md`. If a mock conflicts with implemented M1 boundaries or legal review, the confirmed contract wins.

**Product principle:** A Study Journey is a durable Project containing multiple distinct owner-scoped conversations; in later milestones, it may coordinate scoped facts, documents, requirements, verified source information, tasks and review. **Project != Chat != LegalMatter != VIP entitlement.** One Project can have multiple members, but membership never confers another person's Chat transcript.

## 2. Target information architecture (incrementally developed)

```text
Global header: [Home] [AI Workspace] [Services] [Policy Intelligence] [CN/EN] [Account]

AI Workspace (standalone, existing):
Left: [New conversation] [Create project*] | My Projects* | Standalone/accessible history
Center: Existing Fast / Default / Premium chat
Right: Existing conversation-scoped files / known information / pending facts

Project selected (M1.4 foundation):
Left: [All conversations] [Projects] [Selected Project]
      [New Project Chat*] [My chats in this Project only]
Center: [Project-origin label + short server ID] / chat when selected
Right: Existing chat-scoped widgets only (or clear "not available in Projects yet" disclosure)
* Project creation and new Project Chat require an enabled server-side Project Chat gate.

Future step workspace (M2/M5/M7/M9, after data+workflow authority):
Left: [Project overview] [Project-wide conversation] [versioned steps]
      [Project documents] [professional review]
Center: Current step's own conversation / previous revisions
Right: Step materials, provenance, current processing/checking status and *real* available action
```

### Reference image features to retain *when backed by real systems*

- Left-hand versioned stage navigation (planning, admission, evidence, documents, pre-submission check), including parallel steps and conditional prerequisites. Labels/order are **candidates**, never fixed immigration-law rules or M1 fields.
- Both Project-wide and step-scoped conversations. Cross-chat context or facts must come from explicit, permissioned M2 resolvers; mere Project Chat association is NOT shared model context.
- Step-local materials and a Project document center, with raw source vs generated draft vs summary/report vs reviewed submission artifact separated.
- Unified document processing state distinct from owner confirmation and version-bound professional review; do not call AI completion "lawyer approved".
- Provenance graph: source document version, originating conversation/turn, AI draft version, user confirmation, professional review of an exact immutable version. Changes invalidate dependent approvals as defined by later contracts.
- Project overview with **real** readiness vs progress, blockers, conditional tasks, self-service vs managed engagement, and genuine approval/submission status; avoid universal task counts ("4/12") or assumed stage unlocks.
- Project fact cards: unverified AI extraction, user-confirmed fact, evidenced/verified fact, unresolved contradictions and missing fields, with source/date/author/revision; no silent promotion.
- Professional review is a work item with review object/version, assigned authorized role, state, feedback and audit, not a decorative button.
- At any time, show one primary next action; secondary actions can collapse. Explicitly mark stage parallelism and known prerequisites rather than promising a universally linear route.

### Admission / finance / professional authority

Self-Service and Managed Service are separate modes, **not** Free vs VIP; M4/M5/M8 introduce engagement, conditional staff-verified contract/payment, informed consent, exact-version professional review and human submission receipts. Only show statuses after real records exist. AI never self-approves a lawyer gate. Regulatory and school templates remain provisional pending professional/source approval.

## 3. Delivery mapping — preserve canonical Phase 13 roadmap

| Existing roadmap phase | UI/product slice | Must NOT be claimed earlier |
| --- | --- | --- |
| **M1.4 (NOW)** | Minimal Projects list/create/select, new own Project Chat, own Project Chat list/open, Project/Standalone origin, read-only history and CN/EN/responsive. | No project name/type/service mode field, step tasks, Project document pool, shared facts, legal workflow, lawyer review or progress percentage. |
| **M2** | Real per-Project document references, provenance, confirmed facts, template/requirements foundation, cross-chat resolver; then foundation for Project document/fact tabs. | No automatically shared existing files or fabricated user verification. |
| **M3** | Verified education intelligence data powering future optional route-selection UI. | No guaranteed admission, fixed fee/deadline or universal stage rules. |
| **M4** | Authorized staff collaboration, ongoing human messages, review/engagement objects; then staff/review status UI. | No faux lawyer approval, contractual payment or authority. |
| **M5 + M6–M8** | School and Student 500 guided workflow; versioned step tasks, evidence and review; managed/self-service submission gates. | No AI-asserted receipt or submitted/approved state. |
| **M9** | Fully integrated bilingual Project overview, progress vs readiness, step conversation, Project file center, review/contract/payment surfaces and mobile UX. | Final UI not equivalent to legally operative service without acceptance. |
| **M10** | Synthetic/de-identified end-to-end pilot, source/business sign-off, staged production decision. | No automatic production enablement. |

UI can arrive as thin, tested slices *after* its backing milestone has real server/data authorization. This mapping supersedes the earlier conversational shorthand that lumped all lawyer review/finance/gates into "M3"; the canonical technical roadmap M3 remains Education Intelligence.

## 4. M1.4 approved wireframe and micro-interactions

```text
Standalone workspace, left width ~250 px:
  Conversation history           [ + New conversation ]
  [ + Create Project ]  (only if eligible and server flag enabled)
  My Projects  [Expand/collapse]
    Project · 24 Oct · #a1b2c3d4   [active]
    Project · 22 Oct · #d4e5f6a7   [active]
  All conversations (existing list + origin labels)

After choosing Project:
  ← All conversations
  Project · 24 Oct · #a1b2c3d4
  [ + New Project Chat ]  (enabled only when server gate/active Project permit)
  My chats in this Project
    School questions
    Funding preparation
  [Clear label: Project Chats currently have no shared file/fact context]
  Header/center: selected Project + selected Chat, no invented "stage" or "readiness".
  Right: the existing per-conversation widgets stay per-conversation,
         Project document/step/approval cards NOT rendered in M1.4.
```

Click "Create Project" → accessible minimal dialog: "Create an empty study Project", with **no** type/name/Offer/CoE/status input because there is no current persisted contract for these fields; explain that Project-level documents/stages are forthcoming → explicit create confirmation → POST existing API (server-derived actor, client operationId) → refresh server list → select new Project, **do not** silently create an AI turn or Chat.

Click an existing active Project → fetch its own Project Chat list from existing Project API; selecting a Chat loads its existing history via owner+Project-guarded API. A Project has no magic context just from being selected. Clicking "+ New Project Chat" → POST Project Chat create with operationId/title → select the returned Chat; never pass an existing Standalone Chat ID as a link request.

"New conversation" always creates **Standalone**, even while Project is selected; the UI must make this distinction explicit. Switching to Project cannot rewrite existing Chat associations. Non-authorized Project/Chat returns generic not-found/failure and resets unsafe selection without disclosing foreign metadata. Closed Project absent from active Project list (existing API behavior); own closed Project Chat remains labelled read-only in authorized global history. A disabled Project gate hides creation and AI actions, retains permitted read-only history and never presents Project Chats as Standalone.

Use Chinese-first, English toggle, keyboard and screen reader labels, loading/empty/error states, no uncaught JSON errors, narrow-screen sidebar panel access and no duplicate action on network replays. Do not use image mockups as a source of real metrics.

## 5. Non-negotiable implementation gates

- Reuse server identities, `StudyJourneyProject`, `ProjectConversation`, existing owner-scoped `Chat`, existing `ConversationTurn`; no migrations/backfill for M1.4.
- Project Chat create/turn remains server-gated by default-off `PHASE13_PROJECT_CHAT_ENABLED`; client controls cannot bypass gate. Server-provided UI capability mirrors it but is never an authority.
- Pending/revoked/staff/guest may not acquire Project read/create rights by tweaking UI. M1.2 invitation inbox is API-only; member management dashboard is deferred.
- No use of currently conversation-scoped file/document systems as a fake Project document pool. Do not upload to a Project, share cross-Chat data, synthesize stage progress or imply model receives Project facts in M1.4.
- No change to Standalone, Policy Intelligence entry and launch, legacy_chat, premium entitlement, mobile control paths or normal per-conversation history.
- Full tests and security checks precede any customer rollout. Product owner reviews bilingual browser flow with synthetic accounts; no lawyer/regulator requirements are approved by this UX acceptance.

## 6. Acceptance owners and deferred design gates

M1.4 is an executable frontend/UI iteration only. M2 schema/provenance and document access, M4 lawyer workflow/contract status, M5–M8 progress/authorization gates, and M9 integrated visuals require their own contracts and review. This blueprint records owner direction, not a blanket authorization for those later database, professional or submission operations.
