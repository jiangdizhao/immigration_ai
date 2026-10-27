<!-- BEGIN PHASE13_M4_002_OPTION_A_OFFLINE_DISPATCH_2026_10_27 -->
**Superseded draft notice (2026-10-27):** Owner explicitly chose **Option A**. This document is the historical candidate draft and no longer the active execution contract. Use [M4-002 Option A frozen offline Task Packet](./PHASE13_M4_002_OPTION_A_STAFF_ASSIGNMENT_OFFLINE_IMPLEMENTATION_2026_10_27.md) and D-P13-016. Offline implementation only; migration execution, customer/AWS data and production still not authorized.
<!-- END PHASE13_M4_002_OPTION_A_OFFLINE_DISPATCH_2026_10_27 -->


# Phase 13 M4-002 — Project Staff Assignment and Authorization Foundation

**Status: DRAFT / NOT DISPATCHED / NO CODING AUTHORIZED**  
**Prepared:** 2026-10-27  
**Basis:** M4-001 accepted audit and R1-corrected, still-proposed architecture at 5ac4c85f8066d16b5561f14728d8f3a1c418dc58; Phase 13 roadmap, M4 work breakdown, AGENTS.md, canonical DECISIONS.md.

## 0. Owner decisions required BEFORE contract freeze
1. **Assignment initiation:** choose either (A) verified, authorized operations administrator **proposes** one named staff/role/purpose → Project owner explicitly authorizes → staff accepts, or (B) Project owner creates a named invitation → staff accepts. Both require scope-bound customer-owner consent; neither is selected by this draft. No administrative role alone confers Project access.
2. **Eligible staff identity:** current account roles are user, lawyer, admin. Decide lawyer-only first shell access (not professional approval authority) versus independently designed education representative identity. Do not fake professional credentials or treat User.role as licensing evidence.
3. **Principal/admin powers:** specify which assignment metadata can be listed/managed by staff without allowing customer Project documents, Fact values, Chat transcripts or other content. Default deny unapproved admin case access and any break-glass.
4. **Minimum staff shell DTO:** conservative candidate opaque Project ID, assignment ID/status/role and nonsensitive lifecycle/timestamps only. No customer name/email, Project title, filenames/counts, Fact values, private Chats, human messages, contract/payment/approval indicators.

These policy decisions must be recorded in DECISIONS.md and reflected in a separately accepted implementation packet; Codex must not invent them.

## 1. Candidate bounded implementation scope, after authorization

### Data, DB and consistency
- Add minimal ProjectStaffAssignment (or clearly justified equivalent), binding exact Project, real staff User, requested role/purpose, owner authorization, invitation and acceptance/revocation evidence, status, actor, timestamps/revision, operation references. Do not create a staff ProjectMembership or acquire Chat ownership.
- Reuse ProjectOperation/Event actor-key-hash/idempotent result, Project row locking, current role checks, Project revision, immutable auditing. Extend TypeScript and additive SQL CHECK allowlists for operation/result/event/subject and actor bindings; preserve migrations 0035/0039 prior semantics. ProjectEvent permits only **one event per (projectId, projectRevision)**. No schema push and no unauthorized migration execution.
- Unique active assignment, exact Project FK, replay and CAS/revision conditions; consistent lock order. Never hold DB locks across external I/O. After I/O/replay check current owner authorization/role/assignment before completing an operation.

### Services, APIs, security
- Owner-authorized, policy-permitted propose/invite/owner approve/staff accept/revoke workflow, driven by authenticated server identity. Reject foreign Project, spoofed client scope, stale or revoked owner approval, staff role demotion, closed Project, and duplicate operation with conflicting payload.
- Minimal staff assignment/shell DTO only for currently active accepted assignment under approved role policy. No customer PII or protected data; assignment consent is **not** M4-004 Fact/document disclosure consent.
- Server default-off feature flag for all new staff routes; no global admin/lawyer bypass. Typed future protected-resource disclosure guard must return DENY until independently implemented and authorized in M4-004. Keep private Project and standalone chats untouched.
- M4-003 thread messaging and exact-thread consent are deferred; no Chat/member privacy broadening.

### Tests and evidence
- Offline unit tests for role/owner assignment, closed/revoked/missing permission, incorrect Project/resource, fabricated role, replay, stale revision, concurrent revoke, unauthorized admin access, allowed shell-only DTO and existing M1/M2 regressions.
- Plan dedicated isolated-DB migration tests verifying named CHECK/trigger SQLSTATE 23514 and unique ProjectEvent revision SQLSTATE 23505, with valid seeded referents so FK errors cannot mask constraint tests. **Any DB migration or test requires later explicit owner authorization for exact isolated database/ledger.** M4-002 mock tests do not prove PG behavior.
- Report full unit test baseline and TypeScript touched-path versus pre-existing diagnostics separately; no skipped integration test may count as PASS.

## 2. Explicit exclusions
M4-003 human messaging/thread consent; M4-004 disclosure, engagement, contracts and signatures; M4-005 off-platform payment; M4-006 professional reviews; M4-007 integration; M5 admissions/visa application or human submission; existing client Chat, legacy lawyer clarification, consultation, M2 AI grants, M3 education catalog, Stripe VIP; AWS, real customer/staging/production resources.

## 3. Future Codex implementation handoff (not yet active)
On separate owner approval, Codex must leave all changes **uncommitted/unpushed**, save a complete patch of **tracked and untracked files** under **/home/rico/phase13_m4_002_review.patch** (never inside repo), validate reviewable a/ and b/ repo-relative paths, and report SHA-256, exact Git branch/HEAD, all changed/untracked files and tests/skips. Plain git diff alone omits untracked files; use a non-mutating method including git diff --no-index /dev/null for each new file. User uploads the patch into ChatGPT project files for independent task/source review. Do not git add, commit, push, merge, rebase, reset or deploy.

**STOP: This is a draft plan, not M4-002 execution authority.**
