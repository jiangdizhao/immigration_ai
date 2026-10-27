# Phase 13 M4-002 — Isolated PostgreSQL Verification Plan

**Date:** 2026-10-28  
**Status:** **DRAFT / NOT DISPATCHED / NO DATABASE ACCESS AUTHORIZED**  
**Source checkpoint:** `079804f02486f5c3acab75f3a8270e676fd679ec`  
**Linked acceptance:** [M4-002 R1 offline acceptance](./PHASE13_M4_002_R1_OFFLINE_ACCEPTANCE_2026_10_28.md)

## Purpose and authorization boundary

Validate only the previously reviewed M4-002 Option A migration `chatbot/lib/db/migrations/0041_phase13_m4_002_staff_assignments.sql`, the `0041` Drizzle snapshot/journal, DB constraints and transaction behavior. This document **does not** authorize connecting to, creating, resetting, migrating or dropping any database. Do not silently use the existing PostgreSQL `immigration_legal`, existing `chatbot` business database, Docker fallback, staging, production, or a customer-data clone.

**Owner must explicitly approve, in advance:** exact isolated host/port/database/user/expected ledger, whether disposable DB creation and applying migrations through 0041 is allowed, data destruction/cleanup policy, permitted connection mechanism, permitted test commands and execution environment, and network/credential secrecy constraints. The database must contain no production/personal data. Refuse execution if its identity, expected migration journal or isolation cannot be proven.

## Proposed verification work (NOT authorized to run)

1. Confirm clean Git branch and exact source SHA; feature flag remains OFF; identify all environment variables affecting DB routing without exposing secrets. Capture a nonsecret server/database identity preflight and effective migration journal. Abort on any mismatch.
2. Bootstrap only an explicitly approved disposable PostgreSQL target at the expected previous schema baseline. Apply the approved additive migration sequence through 0041 **to that database only**. No direct app startup, customer data or provider calls.
3. Verify `ProjectStaffAssignment` table, status, owner approval snapshot, foreign keys, uniqueness of active/same-scope assignments, indexes, immutable identity/terminal states, exact Project/actor/operation/event constraints and typed SQL CHECKs using valid seeded project/user/operation fixtures.
4. Confirm erroneous CHECK and trigger writes fail with SQLSTATE 23514 and the **specific intended named constraint**; distinguish missing foreign key SQLSTATE 23503. Confirm duplicate `ProjectEvent` Project/revision rows fail with 23505 and `ProjectEvent_project_revision_unique`. Preserve preexisting M2/migration 0039 operation-event binding.
5. Confirm normal Option A lifecycle with separately seeded admin, actual Project owner, named lawyer and unrelated customer; ensure owner approval/accepted assignment precedes shell and never authorizes M2 Facts/Project Documents/Chat. Revoked, wrong-Project, role-demoted, replay/conflicting idempotency, stale version and Project closure scenarios deny.
6. **Gap regression:** staff proposal writes Project revision N, an unrelated authorized Project operation advances to N+1, customer approval at N+2 succeeds; verify stored lastProjectRevision = N+2, one correct event per global revision and operation-to-event identity.
7. Concurrent proposals/owner approval/lawyer acceptance/revocation with distinct actor accounts and replayed operation keys: no duplicate active grants, hidden cross-Project permission, inconsistent event ledger or post-revoke authorization. Test transaction isolation and lock-order hazards, not just single-thread mocks.
8. Check default-off staff feature flag and fail-closed denied protected resources at the API boundary. Real Redis integration is a **separate** authorization requirement; the offline strict-limiter tests alone do not establish Redis service deployment availability.
9. Record exact test count, PASS/FAIL/SKIP, SQLSTATE/constraint names, journal before/after, database identity and absence of external calls. Stop on discrepancy. No production release, no customer-facing rollout.
10. On a separately approved isolated test database only, document how an unactivated service rolls back by disabling the feature without destroying evidence or applying a destructive migration. Do not run a destructive rollback unless explicitly authorized.

## Independent unit-suite reconciliation

In an equivalent constrained environment, compare failures on source baseline `eab171c` to source `079804f02486f5c3acab75f3a8270e676fd679ec` without changing production settings. The three existing failed suites are S3 preflight stderr, Stage 3 hardening CLI exit status and loopback listen EPERM. If baseline comparison cannot be established, keep all three FAIL/UNCLASSIFIED; never rewrite history as full test-suite PASS.

## Stop criteria / outcome

A successful isolated SQL test result does **not** authorize migration of an existing database, operational enabling of M4 staff routes, professional credential trust, M4-003, or live/production deployment. Update acceptance status only after independently reviewing exact logs, affected SQL, test evidence and confirmed database identity.
