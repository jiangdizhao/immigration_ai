# Phase 13 M1.2 — Membership and Authorization Contract

**Status:** OWNER ACCEPTED — M1.2 TECHNICAL CONTRACT FROZEN
**Readiness:** READY FOR BOUNDED IMPLEMENTATION AUTHORIZATION
**Prepared:** 2026-10-24
**Verified checkpoint:** branch phase13-study-journey-project-centric, HEAD 8519a6af59988a0e690dea5b334a0344269ff025; worktree was clean before this documentation change.

This contract translates accepted decisions D-P13-002 through D-P13-006 and the committed M1.1 foundation into the bounded M1.2 technical contract. D-P13-006 freezes the three M1.2 owner decisions and resolves the invitation/idempotency representation below without changing the five-table architecture. This freeze does not authorize implementation, schema or database changes. M1.3 and M1.4 remain out of scope.

## 1. Authority and accepted invariants

Use this contract with:

- docs/agent-memory/DECISIONS.md, D-P13-002 through D-P13-006.
- docs/agent-memory/tasks/PHASE13_M1_001_PROJECT_FOUNDATION_CONTRACT.md.
- docs/agent-memory/tasks/PHASE13_M0_004_ARCHITECTURE_FREEZE_REVIEW.md, especially its M1.2 scope and security tests.

The accepted invariants for this proposal are:

1. StudyJourneyProject.ownerUserId is the canonical owner authority. Do not create an owner ProjectMembership row or support owner transfer in M1.
2. A Project may have additional customer accounts as members. Membership states are pending, active and revoked; only active membership can authorize a non-owner. Invitation is not access.
3. Project membership never grants staff, lawyer, agent or administrator access. It never grants access to another member’s Chat transcript.
4. Authorization uses the authenticated server-side actor and current database state. A browser-supplied actor ID, role, owner flag, membership state or Project ID is only input for a scoped lookup, never proof of authority.
5. A Project-origin Chat keeps the authenticated creator as its Chat owner. Every Chat history/detail/update/turn route must combine current Project authorization with existing Chat-owner authorization. M1.2 does not implement those M1.3 integrations.
6. Project closure, member revocation and emergency feature disablement remain distinct. After closure, only a still-authorized user’s own Project Chats may be read under D-P13-004; M1.2 Project metadata and membership endpoints do not expose closed Projects. Closed Projects reject business writes. A revoked member is denied even when the Project is closed or a feature rollback is active.
7. Mutations use M1.1 actor-scoped operation idempotency and atomically persist the operation, state transition, Project revision and typed event.
8. No email delivery, Project UI, customer member dashboard, generic permission engine, retention policy or legal/admissions rule is introduced here.

D-P13-005 freezes the M0 technical foundation for preparation; D-P13-006 freezes the bounded M1.2 membership and invitation contract. A separate implementation authorization is still required.

## 2. Verified repository foundation and conventions

The M1.1 code and schema at the verified checkpoint provide the following foundation:

- chatbot/lib/db/project-foundation.ts is marked server-only. Its operation allowlist already includes membership_invite, membership_accept and membership_revoke; its event allowlist includes membership_state_changed.
- ProjectMembership already has a unique (projectId,userId) pair, a pending|active|revoked status, inviter identity, lifecycle timestamps and a user/status/project lookup index. Owner exclusion is intentionally a locked repository rule, not a cross-table SQL CHECK.
- ProjectOperation already accepts membership operation types and a typed membership result. Its actor/type/operation-ID uniqueness and canonical request hash support replay and changed-payload conflict.
- ProjectEvent already accepts membership_state_changed, a membership subject, a Project revision and an operation reference. The event plus linked operation type identifies the transition without a free-form payload.
- The M1.1 transaction order is operation claim/lock → Project row lock → matching membership row lock. Project row serialization protects revision and lifecycle transitions.
- The existing repository checks ownerUserId directly and otherwise requires current active membership. Its Project Chat creation also keeps the Chat owner and ProjectConversation.createdByUserId aligned.
- chatbot/app/(auth)/auth.ts distinguishes guest from regular sessions; its Credentials login currently checks emailVerifiedAt. Existing routes derive actor identity from auth() and use strict request validation. requireRegisteredUser() is an available registered-user pattern, but Project authorization must not depend on VIP entitlement. M1.2 adds no email-verification gate and does not modify the existing login policy.
- The User table stores role and email but not a registered/guest type. Guest accounts use the existing guest email marker checked by guestRegex; an invite target must be a current User row with role=user and must not match that guest marker. Do not expose or log the target email.
- Dependency-injected HTTP handler tests in conversation and document modules provide an established route-test style. The M1.1 test DB operator is guarded for the fixed disposable database.

These are source-level observations; this contract task performed no database connection, query, reset or migration. Before a separately authorized implementation, recheck source and schema against this checkpoint.

## 3. Bounded M1.2 scope

M1.2 would expose focused Project and membership APIs, using the M1.1 repository primitives and adding the transactional membership commands and authorization needed for those APIs:

- Create, list and read Project metadata; close a Project through the existing lifecycle model.
- Owner invitation of an existing customer account, invitee-only invitation inbox and acceptance, owner revocation, and a safe owner-only membership roster.
- Current-state authorization for each route, project-scoped lookups, operation-ID replay/conflict behavior, revision checks, audit events and rollback.
- Focused API contract, unit and guarded PostgreSQL integration tests.

M1.2 does not add generic Project metadata editing: the current Project model has no mutable name or descriptive fields. It does not add Project Chat list/history/detail/update/turn authorization; cross-member transcript access remains prohibited and its route integration belongs to M1.3. It does not add widget behavior, AI context, documents/evidence, applications, staff access, payments, a member dashboard, Workspace UI or any M1.4 work.

## 4. Proposed API surface

The following are proposed route contracts under chatbot/app/api. They are not existing routes and remain subject to independent review.

| Route | Authority and behavior |
|---|---|
| POST /api/projects | Authenticated registered customer creates a Project. Actor comes only from the server session. Require a validated operation ID; return the created Project and revision. |
| GET /api/projects | Return only active Projects the actor owns or currently belongs to as an active member. Exclude closed Projects, pending and revoked memberships. Do not include Chat IDs, messages or transcripts. |
| GET /api/projects/{projectId} | Return minimal metadata only for an active Project to its canonical owner or current active member. A closed Project returns the same generic not-found response used for unauthorized identifiers. |
| POST /api/projects/{projectId}/close | Owner only. Require operation ID and expected Project revision. Use the M1.1 close transition; no reopen endpoint. |
| GET /api/projects/{projectId}/members | Owner only, for an active Project and with a Project-scoped query. Return opaque membership ID, target User ID, status and lifecycle timestamps only. Do not return email, name, phone, role, VIP status or other profile fields. |
| POST /api/projects/{projectId}/members | Owner submits a Project-scoped invite attempt for a recipient-shared target User ID. Proposed body: operation ID, expected Project revision and target User ID. Authenticated actor is not a body field. |
| GET /api/project-invitations | Return only pending invitations addressed to the authenticated actor for active Projects. Do not support lookup by arbitrary User ID or Project ID. Return minimal Project and invitation identifiers/status; no inviter profile or unrelated Project/member data. |
| POST /api/projects/{projectId}/members/{membershipId}/accept | Only the authenticated account named by that ProjectMembership may accept. Require operation ID and expected revision. |
| POST /api/projects/{projectId}/members/{membershipId}/revoke | Owner only. Require operation ID and expected revision. The scoped membership must be part of the selected Project. |

All responses containing Project/member data should use Cache-Control: private, no-store. Use strict schemas, bounded request bodies and UUID/operation-ID validation consistent with M1.1 utilities. Reject actor/owner/role/status fields supplied by the client rather than treating them as authority. Apply existing rate-limit conventions to invitation attempts and invitation inbox probing.

The roster is owner-only because showing pending targets to every member would disclose identities. Its User IDs are opaque selectors, not profile data or credentials. The endpoint must only return rows scoped to the owner-authorized Project.

The invite endpoint must return the same generic status/body for an eligible target and an absent or ineligible target, and must not return the target User ID or membership ID. Successful invite, accept, revoke and close requests should use a minimal or bodyless acknowledgment; exact replays use the same acknowledgment. The owner can query the scoped roster to manage membership records.

## 5. Authentication and current-state authorization

### Actor identity

- Each handler obtains the session through the existing server authentication path. No actor ID is accepted from headers, query parameters or request-body claims.
- Require a non-guest registered customer account. Recheck the current User row and require the customer role (user); reject lawyer/admin/staff accounts even if a matching membership row exists. Do not use VIP entitlement as Project access authority.
- The authenticated actor must have a regular, non-guest session and a current User row with role=user that is not a guest account under guestRegex. Do not trust a stale JWT role/membership claim when current database state is available.
- Do not require User.emailVerifiedAt as an additional invitation or acceptance prerequisite. Preserve the existing application-wide login policy; M1.2 does not change authentication or add email verification.

### Project and membership authority

- Owner authority is Project.ownerUserId === authenticatedUserId. No owner membership row is created; invite and revoke commands must reject attempts to target the owner.
- Non-owner Project reads require a matching membership for the same Project and authenticated User with status=active.
- pending and revoked memberships have no Project access. An invitee may read only their own pending invitation for an active Project through the inbox endpoint; that narrow invitation projection does not grant Project access.
- Closed Projects expose no Project metadata or membership roster through M1.2. Pending invitations for a closed Project are not listed and cannot be accepted. D-P13-004 permits only a still-authorized user to read their own Project Chats after closure; those Chat reads are M1.3 scope. Closed Projects reject invite, accept, revoke, close-repeat and other business writes. Revoked members remain denied.
- Membership is never a role/capability grant. A lawyer/admin/staff actor is denied through customer membership routes.
- Read and mutation SQL must include Project identity in the predicate. A membership UUID from another Project must not resolve through a global membership lookup. Do not return Chat lists or transcript material from these APIs.
- M1.3 must separately enforce both current Project authorization and Chat ownership on each Project Chat operation. No M1.2 endpoint may use a Project membership as authority to read another creator’s Chat.

## 6. Accepted owner decisions

D-P13-006 records the owner’s formal acceptance on 2026-10-24. These are frozen M1.2 technical decisions, not recommendations:

| Decision | Accepted contract |
|---|---|
| No reinvitation of revoked members | Retain the unique Project/User row and its history. M1.2 never deletes it, creates a replacement, or changes revoked back to pending/active. Any future reinvitation requires a separate design and owner decision. |
| Recipient-shared User ID targeting | The recipient signs in and shares their opaque User ID with the owner out of band. The owner submits that ID. Target only an existing registered customer. Provide no global user search, email lookup/delivery, invite link/token or invitation table. Pending invitations appear only in the recipient’s authenticated inbox, and explicit acceptance is required. Copy-ID UI is M1.4. A target ID never authenticates or impersonates the request actor. |
| No additional email-verification gate | M1.2 does not require User.emailVerifiedAt for invitation or acceptance and adds no verification email, OTP, link or screen. Require an authenticated non-guest registered customer identity and current User/Project/Membership checks. Preserve the current application-wide login policy unchanged. |

### Invitation privacy boundary

The endpoint does not provide a general account-existence lookup. It accepts only a recipient-shared opaque User ID, scopes every attempt to an owner-authorized Project, returns one generic response for eligible and ineligible targets, omits target identity/profile from the response, uses private no-store responses, and applies bounded actor/IP rate limits. Do not log the target ID or email.

This is not owner-blind eligibility. A successful invitation creates a membership, increments the Project revision and appears in the owner-authorized roster; those authorized signals let the owner infer that the supplied ID was eligible. Database timing may also differ, and M1.2 does not promise constant-time behavior. The privacy boundary is that an arbitrary actor cannot search or enumerate a global account directory, and targeting starts with the recipient deliberately sharing their opaque ID. The owner roster exposes only IDs already attached to that owner’s Project and contains no email, name, phone, role or VIP data. If the product requires concealing eligibility from the authorized owner after the recipient shares an ID, the accepted mechanism is insufficient and a separate owner decision/design would be required.

## 7. Mutation transaction, lock order and idempotency

Use the accepted M1.1 order for every mutation: Operation → Project → Membership.

1. Derive the actor from the authenticated server session. Validate body shape, operation-ID syntax, expected revision and target identifiers before target resolution. Actor identity/type/role comes from the session plus a current User-row check, never from the target User ID.
2. Normalize semantic input and compute the canonical SHA-256 request hash with the M1.1 utility. Bind it to Project ID, expected revision and target User ID or membership ID. Never store raw request data.
3. Begin one transaction and claim/lock ProjectOperation first, unique by authenticated actor, operation type and operation ID. A different payload hash conflicts. A same-hash existing operation follows replay handling below; do not re-run target eligibility or compare the old expected revision to a revision advanced after the original request.
4. For a new invite operation, initially insert ProjectOperation with resultKind=project and resultId=the requested Project ID. This is an uncommitted neutral candidate while the transaction holds the operation row. For accept/revoke/close, the typed result identity is already known. If invite creates a membership, update the still-uncommitted operation row to resultKind=membership and resultId=the new Membership ID before commit. No other transaction can observe the candidate.
5. Lock the Project row with FOR UPDATE. Require the current actor to be the canonical owner for invite/revoke/close, or the addressed invitee for accept. Require an active Project and matching expected revision for every new transition and every newly recorded neutral invite attempt. Errors roll back the claimed operation. Closed Project metadata/membership GETs and new writes remain denied.
6. After locking Project, lock any matching ProjectMembership row with FOR UPDATE, always constrained by Project ID and membership ID/User ID. The Project lock serializes the absent-row invitation case; the unique Project/User pair is the final duplicate guard. Read current target User eligibility by ID without exposing its email or role.
7. A real membership transition updates membership, Project revision exactly once, typed ProjectEvent and final ProjectOperation result in this same transaction. Any failure rolls them all back. A neutral invite attempt commits only its durable ProjectOperation row: no Membership, Project revision change or ProjectEvent. Never hold locks across external calls.

For Project creation, claim the actor-scoped operation first, then insert the Project and its revision-1 project_created event in the same transaction. Closing follows the existing M1.1 transaction contract and writes its close event/revision atomically.

### Invitation result representation

ProjectOperation.resultKind already permits project, membership and chat; resultId is a UUID without a polymorphic foreign key. M1.2 uses the existing typed pair as a repository-validated outcome union for membership_invite:

| Persisted operation outcome | Meaning |
|---|---|
| operationType=membership_invite, resultKind=membership, resultId equal to the same-Project Membership ID | An eligible invite created a pending membership. The operation, membership, revision increment and membership_state_changed event commit atomically. |
| operationType=membership_invite, resultKind=project, resultId equal to the same Project ID | Durable neutral/no-op result. No membership transition occurred, so no Project revision increment or ProjectEvent is written. This is not an error and creates no fake Membership. |

All other result-kind/operation-type combinations are invalid. Before replay returns an outcome, resolve and validate the typed result: a membership result must identify an existing Membership in the requested Project; the neutral Project result must identify the exact existing requested Project. A missing or cross-Project result is integrity_conflict, never a neutral no-op. Other operation types retain their defined result kind (Project for create/close, Membership for accept/revoke, Chat for Project Chat creation). M1.2 must extend the pure replay helper to compare request hashes independently of an expected result kind, then validate the stored operation/result pair. Preserve the current exact result-kind checks for existing Project and Chat operations; add the membership result matrix without weakening them. The current helper compares resultKind too early and cannot resolve an invite whose outcome is unknown at claim time.

The neutral row is durable idempotency state: authenticated actor, operation type/ID, canonical request hash, creation time, resultKind=project and resultId=the same Project. It records that the scoped invite command was processed but stores neither target User ID nor failure reason. It is distinguishable from integrity failure because it is a committed, hash-matching operation row whose defined typed result resolves to the active Project. An exception or invalid stored result rolls back or raises integrity_conflict; it is never translated to neutral success.

For nonexistent target, existing non-customer/staff/admin/guest target, the Owner’s own ID, or an existing pending/active/revoked Project/User membership, persist that neutral result. Revoked means no reinvite/reactivation. Return the same generic 202 response with no body as for a newly created invitation. Validate expected revision before evaluating the target so stale requests fail uniformly. Malformed requests, unauthorized actors, missing/cross-Project resources and closed Projects do not create a durable neutral operation.

An exact retry of a neutral result keeps returning the same generic response even if the User is later created or changes eligibility; it must not re-evaluate the target. A new operation ID is required to make a later invitation attempt. Same key with a different canonical hash conflicts. For concurrent same-key requests, the unique operation key serializes the winner and the loser replays its committed result. For different keys targeting the same Project/User with the same starting revision, at most one transition commits; a stale loser receives revision conflict and its operation claim rolls back. A later fresh attempt using the current revision and a new operation ID sees the existing Membership and persists a neutral result without another revision or event.

### Transition details

- A real invite requires an active Project, canonical owner, target User row with role=user that is not a guest under the existing guestRegex policy, target different from the owner, and no membership row. Insert one pending row with invitedByUserId equal to the authenticated owner; acceptedAt and revokedAt remain null. Do not gate on User.emailVerifiedAt.
- Accept requires the authenticated actor to be the existing membership’s userId, a current non-guest customer User row, active Project and pending membership. Transition to active, set acceptedAt, keep revokedAt null.
- Revoke is owner-only on an active Project and targets a same-Project pending or active membership. Transition to revoked, set revokedAt; preserve acceptedAt for an accepted member. Owner identity cannot be a membership target. A revoked row cannot be replaced or reactivated.
- Every actual accept/revoke transition increments Project revision exactly once and writes exactly one linked membership_state_changed event in the same transaction. Invalid accept/revoke transitions roll back their operation claim and leave the Membership, Project and event unchanged.

### Replay and races

- A same actor/type/operation-ID and same canonical hash returns the existing typed outcome only after current actor, Project and resource-scope authorization. Invite replay does not re-evaluate the target. The API returns the same generic no-body acknowledgment for neutral and created-invite outcomes. Replay does not reapply its old expected revision or write another event/revision. It cannot restore revoked access or cause a closed Project write.
- Another actor cannot resolve an operation key. Changed semantic input under the same key conflicts.
- Every write requires the caller’s expected revision. Concurrent transitions serialize on Project first. With the same expected revision, only the first valid state transition can commit; the other observes the changed revision and conflicts. A fresh retry must reload current state and may proceed only if that new state permits its requested transition.
- Accept and revoke cannot both commit from one stale revision. If accept commits first, a fresh owner revoke may later commit as a sequential transition. If revoke commits first, accept must fail.
- The event’s operation reference plus membership_invite, membership_accept or membership_revoke operation type provides typed audit context. Do not add email, invitation token, raw request JSON, profile fields or free text to ProjectEvent or ProjectOperation.

## 8. Errors and privacy behavior

- Unauthenticated and guest actors receive the established authentication denial (401 or equivalent).
- Malformed bodies, invalid UUIDs and invalid operation IDs receive a bounded 400 response.
- Use a generic 404 for missing, cross-Project or unauthorized Project/member identifiers where disclosure would help probing. Use 403 only where the resource identity is already safely established and the distinction is useful.
- Stale Project revision, invalid lifecycle transition and changed-payload operation-key reuse return a stable conflict response (409); do not include hidden target profile information.
- Return generic invitation-attempt messaging that does not distinguish an eligible existing account from an ineligible or absent account. Do not include target email/name or write identifiers to logs/telemetry. Apply bounded actor/IP rate limiting.
- All Project, membership and invitation responses are private and non-cacheable. Queries must project only explicitly allowed columns and remain scoped to authenticated actor, Project and membership.

## 9. Required implementation tests

Tests are for a separately authorized implementation. Use synthetic accounts and Project data only.

### Authorization and lifecycle negatives

1. Unauthenticated and guest actors are denied. An actor row must be a current registered customer; guest rows identified by guestRegex are not accepted as registered customers.
2. Forged actor: body/query/header actor IDs, owner IDs, roles and membership status cannot change the session-derived actor. A target User ID never changes the authenticated actor.
3. Unauthorized owner operation: non-owner cannot invite, read the owner roster, close the Project or revoke a member.
4. Cross-Project membership access: a membership ID from Project A cannot be read, accepted or revoked through Project B; response does not disclose Project A.
5. Pending bypass: pending member cannot read Project metadata, roster or Project data; only their own inbox invitation for an active Project is visible; acceptance by another account fails.
6. Revoked bypass and reinvitation: revoked member is denied on the next Project request, including after Project closure, idempotency replay attempts, rollback mode or stale session. Owner cannot reactivate, replace or reinvite the revoked Project/User row.
7. Closed Project: Project list, metadata, roster and invitation inbox do not expose the closed Project; new invite, accept, revoke and other business writes fail. An exact replay of a previously committed operation returns only its minimal/bodyless acknowledgment without changing state. Only the separately tested M1.3 route may read an authorized user’s own Project Chat. A closed Project cannot be reopened through these endpoints.
8. Owner exclusion: owner has no membership row, cannot gain one through self-invitation, and cannot revoke/remove canonical ownership.
9. No staff grant: lawyer/admin/staff sessions and target accounts remain excluded even if a membership row is seeded.
10. Chat boundary: list, detail, invitation and member responses contain no Chat IDs, transcript, turn data or cross-member Chat material.

### Idempotency, concurrency and atomicity

11. Successful identical invite retries and neutral identical invite retries each return one stable generic response. A successful invite has one Membership, one revision increment and one event; a neutral invite has only its durable ProjectOperation result and no Membership, revision increment or event.
12. Neutral invitation result pairs are exactly membership_invite + resultKind=project + resultId=same Project. A success pair is membership_invite + resultKind=membership + resultId=same-Project Membership. Missing, cross-Project or invalid result pairs fail as integrity errors, not neutral success.
13. Same actor/type/key with changed normalized payload returns conflict for both successful and neutral operations and performs no second write.
14. A different actor using the same operation key cannot replay or inspect the first actor’s result.
15. Stale expected revision rejects invite, accept, revoke and close without partial state/event writes; a new neutral invite checks the expected revision before target eligibility.
16. Concurrent accept/revoke using the same starting revision has a single linearized winner; the stale loser conflicts. A fresh retry follows the resulting state.
17. Concurrent identical-key invites create one durable operation outcome. Concurrent different-key invites for the same Project/User and same starting revision have one winner; the stale loser rolls back with revision conflict. A fresh follow-up with a new key/current revision is neutral, and cannot create a duplicate Membership, revision or event.
18. Inject failures after operation claim, membership insert, operation-result update, membership update, revision update and event insert. Assert the transaction leaves no partial operation, membership transition, revision increment or orphan event.
19. Operation replay rechecks current actor, Project and resource authorization; a revoked invitee cannot use a replay. A closed Project replay returns only its original minimal/bodyless acknowledgment and performs no write. A neutral invite replay does not re-evaluate a target that later appears or changes eligibility.

### Privacy and identity

20. Account-enumeration boundary: no global user search, email lookup or arbitrary account-existence endpoint exists. A syntactically valid invite response is the same bodyless 202 for eligible, nonexistent, ineligible, self, already-pending, already-active and revoked targets. Tests separately inspect authorized Project revision/roster projections and document that the owner can infer a successful invite for an ID the recipient shared; the contract does not claim owner-blind validation or constant-time execution.
21. An invitee sees only their own pending invitations for active Projects; another account cannot probe invitations by User ID or membership ID.
22. Owner roster is limited to the owner’s active Project and approved minimal projection; it may return User IDs attached to that Project but no email, name, phone, role or VIP fields.
23. Invitation operations/events/logs contain no raw request, target User ID, email, invitation token or profile data. The canonical hash is not returned or treated as account identity.
24. No additional email-verification gate: the membership service accepts a valid authenticated non-guest customer session based on current User role/identity even when the current User row has null emailVerifiedAt; it does not modify or bypass the actual application-wide login policy.

## 10. Migration, database test target and regression

No migration is required. The committed M1.1 schema already has the membership lifecycle fields, unique Project/User pair, membership operation types, resultKind values project/membership, membership event type/subject and Project revision/event constraints needed by this scope. The neutral invite outcome uses the existing Project result pair as described in §7; its operation/result matrix is enforced and validated by the repository because resultId is polymorphic and the schema has no cross-column CHECK. M1.2 must update the existing replay helper so it checks requestHash before decoding the stored result pair. This bounded repository change does not require a new table or migration.

This typed-union interpretation is accepted as the M1.2 repository contract, not an implicit database guarantee: only membership_invite may use project/same-Project as the durable neutral result; invalid pairs must fail integrity validation. A committed neutral ProjectOperation is the audit/idempotency record; it creates no ProjectEvent because no Project/Membership state changed. If implementation cannot enforce this matrix and atomic result update using current transaction seams, stop and return a bounded blocker rather than adding schema silently.

For a future, separately authorized PostgreSQL integration run, the only M1.1 test target proposed here is the guarded disposable database immigration_ai_phase13_m1_1_test. Any reset or migration must go through the existing guarded test operator with explicit configured and connected database identity checks. Never target the ordinary chatbot database or another shared/live system. This documentation task did not run or modify any database.

Future validation must include the M1.2 unit/API tests above, the guarded PostgreSQL membership concurrency/constraint/rollback suite, relevant Standalone ConversationTurn and standalone Chat regression tests, pnpm db:check, changed-file Biome, TypeScript against the established baseline, and git diff --check. Database-dependent skips are not passes.

## 11. Rollback and exclusions

Rollback disables Project membership writes and new Project operations while preserving Project origin and records. It does not delete memberships or events, change Chat ownership, reclassify Project Chats as Standalone, grant revoked members access or alter the existing turn ledger. The separate D-P13-003 read-only fallback remains subject to current Project and Chat-owner authorization.

Explicitly excluded: M1.3 widget-turn/Chat route integration; M1.4 Workspace UI; any new customer-facing member dashboard; cross-member transcript access; owner transfer; staff membership; Project content/documents/evidence; applications or workflow; email delivery; invitation links/tokens; retention/erasure policy; migration generation/application; production or shared-system operations.

## 12. Freeze and readiness

**OWNER ACCEPTED — M1.2 TECHNICAL CONTRACT FROZEN** by D-P13-006.

**READY FOR BOUNDED IMPLEMENTATION AUTHORIZATION.** This contract is internally consistent with the accepted membership decisions and the existing M1.1 result schema. No database migration is proposed. The neutral invite outcome is distinguished from success and integrity failure by a repository-enforced operationType/resultKind/resultId matrix, with an atomic update of the uncommitted operation claim for successful invitations. Privacy is explicitly bounded: recipient-shared IDs prevent general directory search, but do not conceal successful membership creation from the authorized Project Owner.

Implementation still requires separate explicit bounded authorization and fresh branch/HEAD/worktree preflight. No code, migration, test, database operation, live-system action, commit or push is part of this documentation task.
