# Phase 13 M1.3 — Project Chat Integration: implementation contract and acceptance plan

**Prepared:** 2026-10-24
**Status:** BOUNDED DESIGN READY FOR OWNER-DIRECTED CODEX IMPLEMENTATION; implementation has NOT started.
**Source checkpoint:** branch phase13-study-journey-project-centric, commit 7dfcb6c720d1227cd5dd6a0bbd94d310399daa09.
**Authority:** D-P13-002 (dual Project/Chat authorization), D-P13-003 (rollback read-only history), D-P13-004 (ownership/closure/idempotency), D-P13-005 (M1 technical freeze), D-P13-006 (membership), and the M0-004 §7 M1.3 contract.

This is a bounded engineering plan, not a claim that Project Chats or their UI are already integrated, a release approval, or a new owner decision. M1.2 at the source checkpoint is committed. Local disposable-PostgreSQL test outcomes reported by the owner: M1.1 10/10 and M1.2 7/7, zero skips. The previous complete unit suite had three sandbox-sensitive failures; it is not represented as fully green.

## 1. Objective and scope boundary

Integrate *newly created* Project Chats into the existing customer conversation and durable-turn system, while enforcing two independently necessary permissions on every Project-linked operation:

1. Chat.userId and ProjectConversation.createdByUserId must both equal the authenticated current customer (the Chat's individual creator).
2. The same current user must be the canonical Project owner or an **active** Project member. Project status and operation intent (read, write, AI turn) must also allow the action.

Membership never grants access to a different member's Chat transcript. Existing standalone and legacy Chats keep their identity and behavior; no existing Chat is linked or migrated. Project is distinct from LegalMatter and VIP. The AI context's Phase 12 projectId remains null in M1; no Project documents, shared memory or cross-chat context are injected into models.

M1.3 covers server-side Project Chat create/list, integration into existing conversation history/detail/update, all supported Fast/Default/Premium widget-turn routes, current-state authorization, emergency read-only fallback and regression tests. M1.4 remains responsible for the full create/select/open Project UI; only minimal client compatibility for safe origin/read-only display is permitted in M1.3 if required to prevent misleading behavior.

## 2. Verified repository seams (inspect again at implementation time)

- chatbot/lib/db/project-foundation.ts: createProjectChat already atomically claims ProjectOperation, locks the Project, checks canonical owner/active membership, writes Chat, ImmigrationConversation, ProjectConversation, increments Project revision and appends a project_chat_created ProjectEvent. Reuse it; do not create a second writer.
- chatbot/lib/db/project-foundation.ts: authorizeProjectAccess already supplies a Project-lock/current-authority and Chat creator/owner check for chat_history. Confirm identity and lifecycle semantics before extending it.
- chatbot/lib/db/project-foundation-schema-availability.ts and chatbot/lib/projects/runtime.ts: fail-closed M1.1 schema-readiness and current registered-customer checks. Reuse instead of bypassing.
- chatbot/app/api/immigration-conversations/route.ts and [chatId]/route.ts, chatbot/lib/conversations/conversation-http.ts and history-runtime.ts: existing owner-only paginated history, detail, message pagination, update and policy-binding projection.
- chatbot/lib/db/queries.ts: listImmigrationConversationsPage, countImmigrationConversations, getImmigrationConversationByChatId, getOwnedLegacyChatSummary, listMessagesForChatPage, updateImmigrationConversation, claimConversationTurn, and existing durable turn functions.
- chatbot/lib/conversations/runtime.ts, turn-ledger.ts and widget-turn.ts: existing single ConversationTurn state machine, claim/replay/lease/fencing and atomic finalization. Preserve their contracts.
- chatbot/app/api/widget-chat/route.ts, widget-chat-fast/route.ts and widget-chat-direct/route.ts: three distinct persistable customer answer paths. Audit route-llm.ts and any other route/entry point that accepts an existing Chat identifier.
- chatbot/lib/workspace/conversation-origin.ts and existing Workspace: legacy-chat read-only behavior; do not label Project-origin history as an independent Standalone Chat.
- Audit also (chat)/api/chat, history, vote, suggestion and deletion endpoints, document/policy-bound conversation entry points, and every other existing Chat-ID consumer. Either enforce dual authorization for supported Project operations or explicitly fail closed for out-of-scope Project mutations; no alternative route may become a bypass.

## 3. API contract

### POST /api/projects/{projectId}/chats

Authenticated regular non-guest customer with current role=user, canonical Project owner or active Project membership, active Project, and positively verified Project schema. Body: validated operationId and optional bounded title; reject supplied actorUserId, chatId, ownerUserId, createdByUserId, membership state and arbitrary Project links. Project ID in path is a selector, not authority.

Use the M1.1 createProjectChat primitive and its operationId/idempotency contract. It generates the Chat ID server-side. Successful first call commits Chat + ImmigrationConversation + ProjectConversation + ProjectOperation + Project revision + ProjectEvent atomically. Exact authorized replay yields the same Chat ID without a new row/event; same key/different normalized payload conflicts. Return minimal Chat ID and Project-origin metadata; no transcript of anyone else. No expectedRevision is newly required unless the existing M1.1 primitive and documented client contract are deliberately changed under review.

### GET /api/projects/{projectId}/chats

Current Project owner or active member can list **only Chats they individually own and created** in that Project, with bounded cursor pagination, deterministic ordering and minimal Chat summaries. Owner does not automatically list other members' Chats. For a closed Project, allow only authorized read-only own Chat history/list, with no new Chat action; revoked members remain denied. A feature-disable emergency fallback must not require enabling Project writes or model turns.

No endpoint accepts an existing Standalone Chat ID for linking. No backfill/reassociation/delete/reparent endpoint.

### Existing conversation history endpoints

GET /api/immigration-conversations, GET /api/immigration-conversations/{chatId}, PATCH /api/immigration-conversations/{chatId} and their message, policy-binding and pagination subpaths must enforce the Project dual gate whenever the server-derived Chat ID has a ProjectConversation association.

- Standalone and legacy paths stay owner-scoped and unchanged, except a safe explicit disambiguation from Project origin.
- A Project-linked Chat may be read only by its current individual creator who still has Project authorization. Closed Project: read own Chat and messages only, no PATCH.
- An active Project allows own history and authorized updates. A revoked or no-longer-customer actor is denied on subsequent requests even if the Chat.userId still matches.
- History **list and count** must share identical visibility predicates, including Project membership, closed/read-only access and Chat ownership; filter in SQL *before* cursor/limit/count so unauthorized rows do not distort pagination, counts or reveal IDs. Never perform list filtering only after page slicing.
- Detail must check Project/Chat permission before returning messages, policy-binding metadata or cursor information; updates must check current Project status and membership at the mutation boundary, not merely in a prior independent read.
- Return an additive, server-derived Project-origin discriminator (and Project ID only to its authorized creator) so clients can distinguish Project from Standalone. Preserve the existing legacy_chat/immigration compatibility as appropriate; do not silently coerce a Project-origin record into Standalone when Project features are disabled.
- Protect all other existing owner-only Chat read/mutate operations by audit. For unsupported Project mutations (including deletion/linking), fail closed rather than relying on owner-only legacy checks.

## 4. Single authorization and turn-admission seam

Provide one shared server-side resolver for each chatId: no association => Standalone; association => Project with associated Project ID. Only this persisted mapping establishes Project origin. A body-supplied projectId or claimed standalone mode cannot downgrade linked-chat restrictions.

For Project Chat reads, require current Chat owner/creator plus current Project owner or active member. Closure permits still-authorized own-history **read** only. For Project Chat mutations and turns, require active Project and current membership/ownership.

For each Project turn, **the Project row lock, current membership/owner check, Chat owner/creator check, and existing ConversationTurn claim/replay decision must be serialized within one short PostgreSQL transaction**. Lock order: Project first, matching membership next, then the existing turn claim. Preserve the existing (chatId,clientTurnId) uniqueness, request hash, user-message durability, lease/fencing and assistant finalization semantics; do not add a parallel turn table, new key, extra assistant row, or fallback-to-unpersisted-answer behavior. Extend the repository claim seam to accept an authorized transaction or a specialized Project-only claim wrapper, without changing Standalone behavior.

A preliminary owner lookup is not a substitute for the atomic Project authority + turn claim. Project status/membership must be evaluated again inside the admission transaction on every request, including turn retries and already-persisted answer replays. Do **not** hold any database transaction or Project/member lock across model execution or remote HTTP calls.

Concurrency semantics: revocation/closure and Project turn admission linearize under the Project row lock. A turn admitted before a concurrent revocation commits may complete with the existing durable-turn machinery; any turn beginning after revocation/closure commits must be denied. Existing in-flight turn finalization/lease must not gain additional privileges. All three widget paths must enforce exactly the same Project boundary before AI inference or response replay.

Audit request identifier variants: frontendChatId, id, session IDs, and optional parameters. If any entry point would treat an existing Project Chat as an unscoped/unpersisted request (e.g. omitting frontendChatId), reject it safely rather than allowing an AI turn without Project authorization. Do not break legitimate fresh unscoped Standalone flows.

## 5. Closed Project, disablement and schema readiness

Separate three states: Project closed, member revoked, and Project feature disabled. They are not interchangeable.

- Closed Project: deny new Project Chat, all new AI turns/replays and updates; permit only still-authorized user to read their own Project chat/messages, with explicitly read-only Project origin.
- Revoked member: deny own Project Chat reads as well as writes/turns, including after closure and while features are disabled; preserve the underlying rows.
- Emergency feature disablement: new Project Chat/AI turns and Project-context writes disabled; still-authorized own Project-origin **read-only** history remains available through a clearly labelled fallback. Never reclassify it as Standalone or expose any cross-member history.
- If Project schema identity/readiness is missing or uncertain, fail closed for Project-specific operations and never treat an existing known Project Chat as standalone. Do not regress Standalone behavior in an environment where Project tables have not been migrated.
- Use an explicit, default-off Project-chat-write/turn enablement gate if there is no existing suitable project feature flag; the read-only history fallback must remain available when that gate is off. Tests may explicitly enable the gate using synthetic identities. Do not activate production customer traffic.
- Do not modify M1.2 membership rules, add email verification, or broaden customer access to lawyers/staff.

## 6. Security, compatibility and error handling

Current registered-customer User row (role=user, non-guest), canonical owner or active Membership, and individual Chat ownership must all be checked server-side. Deny staff membership, forged user IDs, cross-Project Chat identifiers, closed-Project turns, revoked Chat creators and guessed ID lookups. Use generic 404 for scoped resources not safely visible, appropriate 401/403/409/503 per existing conventions, private no-store headers, bounded payloads and existing rate-limiting patterns. Avoid logging Chat text, target IDs, personally identifiable content, credentials or raw prompts.

Do not change: legal-service answer/search pipelines, Fast/Default/Premium entitlement or mode selection, citation behavior, policy source governance, M1.2 invitations, LegalMatter, VIP, Phase 12 document/evidence system, turn ledger keys or storage format, customer document grants or professional legal workflow. The Project origin indicator is not permission to inject Project context into model input.

## 7. Implementation milestones

A. Create/List: HTTP routes, server-only Project Chat repository adapter, bounded request/cursor schema, positive/negative auth tests, no schema/migration change.

B. History and access: server-derived Project origin and common dual guard, SQL-filtered list/count/pagination, detail/message/update checks, read-only closure and feature-disable fallback, audit of alternative Chat operations, unchanged Standalone.

C. Turn ingress: shared Project classification/guard in all three widget paths and atomic Project lock + membership check + existing ConversationTurn claim; preserve replay, fencing and model-call boundaries. Explicit rejection of Project identifiers sent by unscoped/legacy request forms.

D. Tests and closeout: unit/HTTP suites, guarded PostgreSQL concurrent create/revoke/close/turn races, rollback and replay proof, Standalone/legacy/policy binding regressions, unchanged schema/journal, source review patch and status handoff. No commit or push until independent review.

Implement A–D in one bounded Codex task if feasible; do not start a new owner-decision cycle for details already decided by D-P13-002–D-P13-006. Stop only for a genuine invariant conflict requiring a migration or a new product decision.

## 8. Required test matrix

1. Project Chat create from canonical owner and active member; anonymous, guest, staff, pending and revoked denied; another Project ID and forged actor rejected.
2. Identical create operation ID replays the same Chat; changed request hash conflicts; concurrent duplicate create yields one Chat, ImmigrationConversation, ProjectConversation, ProjectOperation and event.
3. Injected failure at each create boundary leaves no partial Chat/association/revision/event; no linking an existing Standalone or foreign Chat; ProjectConversation unique association preserved.
4. Owner/member cannot list, detail, update, message-page, policy-binding-read, delete or turn another member's Chat solely due to shared Project membership.
5. Revoked creator cannot list/read/update/turn own linked Chat; no stale JWT or cached permissions. Owner is not an additional Membership.
6. Closed Project prevents create, PATCH and all model turns/replays but retains still-authorized own Chat/message history. Revoked member denied even after closure.
7. Emergency feature-disable fallback retains clearly labelled read-only Project-origin history, no write/turn/context, no reclassification, no cross-member exposure.
8. List/count/cursors omit unauthorized rows consistently; mixed owned Standalone, authorized Project, revoked Project, closed Project and legacy histories paginate correctly without count or cursor leaks.
9. Fast, Default and Premium routes all deny Project turns without current dual authority, before provider invocation; no unscoped request-form bypass, including forged/missing frontendChatId and reused client turn.
10. Real PostgreSQL race: Project row lock serializes turn admission with membership revocation/closure; post-revocation/closure requests fail; authorized earlier turns retain existing durable semantics; no DB lock across AI call.
11. Existing ConversationTurn (chatId,clientTurnId), user-message dedupe, assistant atomic finalization, heartbeat, resume/replay, lease/fencing and failure paths pass unchanged for Project and Standalone.
12. Existing Standalone creation/list/detail/update/Chat widget routes and legacy_chat read-only behavior are unchanged. No Project association for legacy/Standalone creation or policy topic launch.
13. Feature default-off/readiness: Project write/AI never enables silently, absent Project schema fails closed, ordinary non-Project features remain operational.
14. PostgreSQL suites use only fixed disposable immigration_ai_phase13_m1_1_test. Never conflate a skip with pass, and never run M1.1's fresh-migration suite in parallel with suites that expect migrated state.

## 9. Validation and local development restrictions

Reuse the guarded test operator and PHASE13_M1_1_TEST_DATABASE_URL, assert configured and connected database identity, and run destructive/reset migration proof only against the existing fixed disposable database. Respect that the guarded operator loads chatbot/.env.local while standalone test processes need explicit dotenv loading. Run M1.1 fresh-migration proof separately; M1.2/M1.3 integration in a prepared database, not concurrently with a reset. Never use ordinary chatbot, immigration_legal, staging or production databases for M1.3 destructive tests.

Run focused unit/HTTP, Project turn and history tests, real PostgreSQL integration with zero DB skips, relevant existing conversation/turn/widget/policy regressions, pnpm test:unit, pnpm db:check, changed-file Biome, TypeScript compared to prior baseline (44 unchanged-file diagnostics), git diff --check. Investigate the three previously reported sandbox-sensitive full-suite failures without automatically modifying unrelated tests. Never claim full-suite PASS unless fully green.

If a patch, diagnostic MD or handoff export is generated outside the repository, create it in the user's home directory (~/) and **never** in /tmp/. Do not write secrets into artifacts or source control.

## 10. Exit conditions and handoff

Evidence required: exact routes and access guards; source audit of all Chat-ID consumers; atomic turn-admission transaction and concurrency trace; create/link transaction idempotency/rollback; closure and fallback behavior; zero unauthorized transcript access; complete Project vs Standalone pagination and origin proof; local isolated DB validation; regression counts; full list of changed files; no schema/migration/live DB changes; no production enablement.

Update CURRENT_HANDOFF.md, CURRENT_MILESTONE.md and PROJECT_STATE.md after implementation with verified facts and explicit execution environment. Do not rewrite historical blocks. Leave implementation uncommitted/unpushed for independent ChatGPT review, then owner-controlled local Git commit/push and independent remote verification. M1.4 remains out of scope.
