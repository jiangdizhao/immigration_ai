# PHASE13 M4-002 — Option A Staff Assignment & Deny-by-Default Authorization

**Date:** 2026-10-27 (Australia/Sydney)  
**State:** **CONTRACT FROZEN / DISPATCHED — OFFLINE IMPLEMENTATION ONLY; NOT ACCEPTED OR DEPLOYABLE**  
**Owner selection:** Option A, admin proposes → Project owner explicitly approves → named lawyer accepts.  
**Authoring baseline:** 9988fc179e966fa9922f77a4d252cfcd99e8383e on phase13-study-journey-project-centric; use the new documentation-only dispatch checkpoint as the Codex execution HEAD.  
**Authority:** AGENTS.md; Phase 13 Roadmap; M4 work breakdown; M4-001 accepted audit and R1-corrected proposed architecture; CURRENT_HANDOFF / CURRENT_MILESTONE / PROJECT_STATE / DECISIONS. This task freezes **M4-002 alone**; no other M4 business rules or professional legal compliance are approved.

## 0. Owner-frozen Option A authorization and role policy

**Sequence (all server-authorized, durable, explicit):**

1. A currently authenticated **non-guest administrator**, with fresh server-side User.role = admin, **proposes** exactly one existing, email-verified, non-guest User.role = lawyer to a known opaque Project ID, with narrow purpose = project_staff_collaboration, staff role = lawyer, and a versioned customer notice. Proposal is not assignment, disclosure, acceptance or engagement.
2. The **actual StudyJourneyProject.ownerUserId** (not a member, administrator, proxy or AI) reviews the exact assignee ID/identity, Project, role, purpose and notice version, then **explicitly approves**. Persist who approved, when, which immutable proposal snapshot/hash/notice and operation identity. Reject stale proposal or changed assignee/purpose. Customer approval is **consent to the staff relationship and minimal shell only**, not M4-004 resource disclosure.
3. The **same named lawyer account** accepts the approved invitation using its authenticated current identity and valid lawyer role/email verification. Only then does an assignment become **active** and staff receive a restricted Project shell.
4. Before active, the admin may withdraw only the proposal they created, the owner may decline or revoke, and the named lawyer may decline. After active the owner may revoke, the lawyer may resign, and the currently authorized admin who proposed it may administratively revoke **only that assignment**, without obtaining Project data or general owner powers. Terminal states never reactivate; new relationship requires a fresh proposal/consent/acceptance sequence and new immutable identity.
5. No other assignment path is authorized, including owner-created direct invitation, auto-assignment from LawyerClarificationRequest, ConsultationRequest, membership, global staff role, or Stripe/VIP. Do not add a new education-agent role or assert Australian legal registration/competence from the user role.

**Candidate lifecycle:** proposed → owner_approved → active; proposed/owner_approved → declined/revoked; active → revoked. Explicitly define declines/resignation/withdrawal in typed transitions. A proposal is invisible to lawyer as an actionable invitation until owner approval. Proposed/owner-approved are **not** staff Project visibility permissions.

**Project staff rights for M4-002:** only an active lawyer, after current role/Project/assignment reauthorization, may receive a **minimal DTO**: opaque projectId, assignmentId, assignmentRole = lawyer, assignmentStatus = active, Project lifecycle = active and non-sensitive assignment timestamps. No Project name/title, owner/member/customer names or emails, private AI Chats, Fact values/keys, document names/counts/bytes, tasks, requirements, messages, financial records, engagement status, approvals, or other protected content. If identity recognition is needed for owner approval, show the assignee's reviewed identity (ID + appropriate verified/masked account identifier), not unverified professional credentials.

**Admin rights:** proposer accesses only the assignment record(s) **they created** and those records' limited status; admin must supply the opaque Project ID and cannot list/search arbitrary customer Projects or retrieve any Project shell/customer metadata. Unknown/foreign/closed Project inputs must not leak existence through distinguishable public responses. Apply server-side anti-enumeration / bounded rate limits using existing conventions. Admin role has **zero blanket Project data access**.

**Owner rights:** existing Project owner controls own proposal approvals/declines and own assignment revocation; does not gain another member's private Chats. Current Project member without ownership cannot approve or delegate these actions. **Professional authority:** current lawyer account/verified email enables assignment and shell only; it is **not** verified practising status or authority to approve any package. M5 requires a separate verified professional gate and exact-version lawyer review.

## 1. Bounded offline implementation deliverables

### Schema and migrations (author, DO NOT execute)

- Add a small, additive ProjectStaffAssignment table with Project ID, staff User ID, proposedByAdminUserId, immutable staff/purpose/role/notice snapshot or hash, status, ownerApprovedByUserId/time, lawyerAcceptedAt/time, revoked/declined actor/reason/time, expected revision and timestamps. Use a minimal append-only transition record **only if needed** to preserve actor/time and historical decisions beyond existing ProjectOperation/Event; demonstrate why it is needed.
- Enforce Project and User references, permitted lifecycle transitions, uniqueness for a concurrently live proposal/active assignment per exact Project/lawyer/purpose, non-empty identity, lifecycle consistency, and appropriate scoped indexes. Preserve terminal evidence and avoid cascade deletion of authorizations.
- Reuse ProjectOperation claim/idempotent replay, canonical request hash, Project and User row locks, Project revision CAS, and a **single ProjectEvent per (projectId, projectRevision)**, with type-safe actor/operation/result/subject bindings. Respect lock acquisition order (operation claim → Project → relevant User/assignment) and avoid deadlocks and stale replays.
- Schema.ts operation/result/event unions and SQL CHECK constraints are **closed lists**. Source-confirm latest migration journal first (at planning checkpoint last entry idx 40, tag 0040_phase13_m3_education_catalog); produce the next additive migration and matching journal entry, preserving 0030/0035/0039 actor, event and provenance guarantees. If new operation-event binding needs a narrow trigger, implement it without broadening legacy actors. Never use schema push, modify earlier migration files or execute SQL.
- An admin proposal is a narrowly authorized mutation on a known Project ID even though admin is not a customer member. Build a **separate, explicit staff workflow authorization path**, not a blanket bypass in customer-only Project Foundation. Keep existing ProjectMembership and Chat authorization unchanged. Admin-only proposal must not expose Project fields on response/errors.

### Services / route APIs / projection

- Reuse existing Next.js auth, guest and emailVerifiedAt checks, server-only handlers, Project transaction patterns and typed errors. Inspect existing routing patterns before adding only the smallest endpoints. Do not trust role/user identity or owner approval fields from client payloads.
- Support propose, owner list pending proposals for owned Project, owner approve/decline/revoke, named lawyer list/accept/decline its owner-approved invitation, authorized admin list/revoke **its own** proposals, and active lawyer minimal shell. No staff Project-wide discovery API. No new front-end page necessary in M4-002; minimal HTTP routes/projection sufficient.
- Add a standalone typed future M4-004 disclosure authorizer returning **DENY** for every protected Project Fact/document/Chat/resource request; do not introduce disclosure-capable routes or actual access to such resources. Owner's assignment consent only authorizes shell and relationship, not resource sharing.
- Every request and state mutation recomputes current server-side role, owner, assignment, lifecycle, exact identity and expected revision. Re-validate at transaction commit and on operation replay. Revocation, closed Project, demoted lawyer, owner change, stale consent/snapshot or disabled feature flag denies future staff operations.
- New routes default OFF under a separate server flag (e.g. PHASE13_PROJECT_STAFF_ASSIGNMENT_ENABLED) and do not alter PHASE13_PROJECT_CHAT_ENABLED, standalone/Project Chat ingress, existing lawyer request, consultations, AI feedback, policy intelligence or VIP billing.

## 2. Offline checks / acceptance criteria

- Focused unit and route tests: whole propose→owner approves→named lawyer accepts→minimal shell chain; proposed/owner-approved cannot view shell; wrong Project and guessed ID indistinguishable; owner delegation/membership spoofing denied; unauthorized/foreign admin, admin without proposer relation, unassigned lawyer and staff with no current role denied; proposal target must have email-verified non-guest lawyer role; wrong lawyer cannot accept; duplicate proposals/races, replay same op hash vs changed payload, stale Project revision, concurrent revoke/demotion/closure; terminal state never resurrects.
- Verify no customer PII, Project title, Fact/document name/count/body, private Chat, AI context or payment/review status in staff/admin DTO, logs or error responses. Exact private member Chat ownership and existing M1/M2 permissions remain unchanged.
- Schema/static tests include typed event/result/actor and migration journal consistency, named SQL CHECK/error scenario design for 23514, unique ProjectEvent revision scenario 23505, and valid-FK fixture design so 23503 is never mistaken for 23514. **Do not claim DB integration PASS from offline mocks**. No SQL, pg_isready or connection to host, Docker, isolated, staging or prod PostgreSQL; no migrations applied even on ephemeral DB in this task.
- Run targeted Node/unit tests and existing pnpm unit suite where safely available **offline**; run changed-path Biome, git diff --check and TypeScript diagnostics against known baseline (historically 44), distinguishing old errors from any new touched-path errors. No dependency installation, external network, paid model calls, customer files or AWS.
- M4-002 completion requires independent review of exact patch and disclosed test limits. It can be **OFFLINE ACCEPTED_WITH_LIMITATIONS** later if code and tests support it, but never production-ready because SQL integration not executed.

## 3. Exclusions and authorization ceiling

NO M4-003 human thread/recipient consent; NO M4-004 engagement/contracts/signatures/protected-resource disclosure; NO M4-005 payment; NO M4-006 legal professional review/approval; NO M4-007 full integration; NO M5 school/visa application/submission, Offer/CoE claims, real professional verification or customer intake; NO admin customer Project listing, Project document/Fact/Chat reads; NO UI implementation beyond bounded API; NO changes to legacy lawyer requests/consultation, Stripe VIP, legal LLM routes, existing M2/M3 semantics; NO DB connection/migration execution, AWS/S3, production, live HTTP/DNS, payment or signing provider.

## 4. Codex delivery / patch contract

- Run from /home/rico/immigration_ai on phase13-study-journey-project-centric; report actual HEAD and clean status before work. Do not overwrite existing uncommitted user files. **Do not git add, commit, push, merge, rebase, reset, branch-switch or deploy**.
- Create a **complete standalone review patch** under **/home/rico/phase13_m4_002_review.patch** OUTSIDE the repository, including all tracked modifications and **all untracked new files** (source, tests, migrations, journal and generated documentation as applicable). Plain git diff omits untracked files; include them with untracked-aware binary/new-file diffs. Patch headers must use repository-relative a/ and b/ paths; verify it applies to the unchanged baseline with a non-destructive check (e.g. git apply --check). Do not stage files just to produce patch.
- Return: branch and HEAD, exact changed and untracked paths, patch path and SHA-256, summary of schema/service/routes/tests, full commands/results and skip reasons, baseline and newly introduced diagnostics, constraints/limitations and database/network operations **NOT RUN**. Stop after M4-002; await independent ChatGPT patch review and owner approval before any commit/push.

## 5. Stop and escalation

If a truly required new database migration **execution**, external permission, real professional/legal policy, caller data visibility or another trust boundary lies outside this contract, **stop that part and report the concrete blocker**; keep the safe offline work reviewable. Do not silently invent a legal/business role, expose personal data, force-test on a normal database or expand milestones.

