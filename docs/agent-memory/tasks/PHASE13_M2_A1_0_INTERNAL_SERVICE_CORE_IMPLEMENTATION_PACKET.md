# Phase 13 M2-A1.0 — Implement Internal Project Document Service Core (Bounded)

**Prepared:** 2026-10-25  
**Status:** READY FOR EXPLICIT OWNER IMPLEMENTATION AUTHORIZATION. No code authorized solely by publication of this packet.  
**Required Git checkpoint:** the new documentation-only commit containing this packet, as verified after its push.  
**Authority:** `PHASE13_M2_A1_PROJECT_DOCUMENT_SERVICE_ARCHITECTURE_CONTRACT.md` and architect-owned M2-001 R1. Stop if any detail conflicts with M1.1–M1.4 source or migration 0031.

## One narrow deliverable

Create an **internal, synthetic-data-only, injected-port service/domain core** for a Project document. The scope is not a live uploader. Implement pure typed lifecycle decisions, failure outcomes, version/generation and scanner attestation proof checks, and private-per-purpose authorization gates. The service must have no route/runtime consumers and must not import or instantiate a live storage/scanner client.

## Permitted work

1. Create `chatbot/lib/project-documents/` with typed interfaces for current authenticated actor, Project authorization callback, exact individual source-Chat ownership callback, immutable file identity, ProjectDocumentAsset/Version state, ProjectDocumentGrant purpose, durable intent contract, version/generation CAS contract, scanner attestation verification, and a private object-store port.
2. Implement explicit service methods operating on **injected fake repository, fake storage, fake attestation verifier** to simulate: create direct-upload intent; explicit authorized source-document import/copy; conditional write of unique object key; hash+length check; pending->stored finalization without security promotion; scan completed/failed/rejected transitions only with a valid exact-version trusted attestation; private creator-grant simulation; listing/reading only through explicit purpose grant and a verified clean version; withdrawal/revocation and cleanup-pending.
3. Implement deterministic failure-safe replay and state transition behavior. Include no-op terminal result replay and reject conflicting same-event payload and stale generation. Failed writes and cleanup must never return success or a usable file.
4. Reuse existing Phase12 bounded file validation as a **pure validation dependency** only where suitable. Do not reuse the existing MatterDocument persistence, scanner or storage status transitions.
5. Add focused unit tests for the negative matrix in the A1 architecture contract; test that new modules are unreachable from public API/widget paths and cannot access AWS without injection.
6. Append truthful status to three state files; do not mark A1 or A1.0 accepted.

## Absolutely forbidden

No schema changes or migrations 0032; no changes to migrations 0030/0031; no SQL writes to actual application DB; no ProjectOperation/ProjectEvent extension; no API routes; no customer UI; no real files; no S3/GuardDuty/reconciliation external calls; no professional or Project audience grants; no AI-context or future_package permissions; no M2-A2 extraction or FactAssertions; no default-on flags; no Phase12 MatterDocument mutation; no paid AI; no deploy, commit or push.

If real durable idempotency/revision/audit cannot be implemented without DB changes, model the **repository port and deterministic in-memory fake**, and document that actual DB atomicity is unimplemented until A1.1. Do not claim production-grade persistence.

## Validation and handoff

Run focused unit tests, relevant Project existing regression, Biome for changed files, `git diff --check` and static non-reachability checks. `pnpm test:unit` is optional; distinguish skipped/not-run. No DB or S3 operation is needed. Confirm unchanged `schema.ts` and migration journal. Export cumulative uncommitted patch including untracked files to `~/phase13_m2_a1_0_review.patch`. Report exact files, tests, branch/HEAD, no consumers and unresolved blockers. Stop for independent ChatGPT review.
