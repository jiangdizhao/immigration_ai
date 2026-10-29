# Phase 13 M4-004 — R2 review corrections (offline, fail-closed)

**Recorded:** 2026-10-29, Australia/Sydney
**Branch:** `phase13-study-journey-project-centric`
**Base HEAD (unchanged):** `b64b201536e23e79cd8e9e7be6909328237c40e3`
**Reviewed R1 patch SHA-256:** `be236deebf3fdc46c312e58f6bc5c06172bafd0f95830ccd0a8c0b2a691cb997`
**Disposition:** IMPLEMENTED / UNCOMMITTED / **PENDING INDEPENDENT RE-REVIEW**. Advisory record; acceptance belongs to the independent reviewer and project owner.

## Corrections delivered

| ID | Correction | Implementation |
| --- | --- | --- |
| R2-01 | List/detail authorization parity | One shared predicate `recipientGrantMetadataEligible` now gates both `runListDisclosureGrants` (recipient branch) and `loadDisclosureAccessContext`. It requires an eligible verified lawyer account, the exact active assignment (id/project/staff user/purpose/email-hash), a still-`granted` and unexpired grant, **and** current resource-owner eligibility. The list SQL pre-filters cheap dimensions only, resolves owner eligibility in a batch (`eligibleResourceOwnerIds`), then filters **before** `slice`/`hasMore`, so revoked/expired/reassigned/owner-ineligible grants cannot leak through items, page size or pagination flags. Owner audit semantics unchanged. |
| R2-02 | Exact draft agreement binding | `buildOperatorAuthorityInput` now takes the pre-generated `agreementVersionId` from the draft target and emits it (plus `agreementVersionStatus: "draft"`) into the canonical authority request. Both `loadServiceOperatorContext` and `runCreateAgreementVersion` pass it, and the mutation re-derives the hash under lock, so draft A can never authorize draft B with identical terms/scope. |
| R2-03 | No staff Engagement detail | `runGetEngagement` is owner-only; every other actor (staff with an active assignment, member, admin, guest) receives the same `notFound`. Assignment never discloses Engagement existence, ids, revision, timestamps, mode, scope or status. The staff metadata policy constant is retained as the documented blocked position; the projection was renamed `engagementMetadataView` and is reachable only with the owner policy. |
| R2-04 | Launcher + guard repair | The child environment is now derived from the approved URL (`buildM4_004_ChildEnvironment`) and re-verified (`assertM4_004_ChildEnvironment`); `POSTGRES_URL` **is set** to the approved database (the R2 bug: it was cleared while runtime repositories require it) and `DATABASE_URL`, `PGURL`, `POSTGRES_URL_UNPOOLED`, `PHASE13_M4_002_TEST_DATABASE_URL`, `PHASE13_M4_003_TEST_DATABASE_URL` are cleared. Preflight verifies approval token, exact loopback URL (incl. non-empty password, no query/fragment), Docker container name/tag/label/port binding/tmpfs/no-data-dir-mount/running/image-id consistency, PostgreSQL database/role/major (17.x)/restricted privileges (no superuser, `CREATEDB`, `CREATEROLE`, `CREATE` on `public`), the Drizzle ledger head, and the pinned Migration 0043 bytes/time. |
| R2-05 | Genuinely executable integration suite | Rewritten: fixtures use `hashServiceEngagementOperationRequest`-derived stable hashes and obtain authority bindings through the repository's own `loadServiceOperatorContext` / `loadSignatureVerificationTarget` read paths; grants use a real observation hash plus an explicit test-only revalidator. New PostgreSQL assertions cover staff denial, grant list/detail parity, owner-membership revocation, draft-id/authority mismatch, empty-scope CHECK, composite current-agreement FK, signature skew boundary, idempotency and concurrent transitions. |

## Verification (offline, exact)

| Check | Result |
| --- | --- |
| `pnpm test:phase13:m4-004:offline` | **59 pass / 0 fail / 0 skip** |
| `pnpm test:phase13:m4-004:guard` | **6 pass / 0 fail** |
| `pnpm test:phase13:m4-003:offline` / `:guard` | **27 pass** / **13 pass** |
| `pnpm test:phase13:m4-002:guard` | **13 pass** |
| `pnpm test:unit` | **991 pass / 0 fail / 0 skip, exit 0** |
| `pnpm db:check` | `Everything's fine` |
| `pnpm exec tsc --noEmit` | 0 errors in M4-004 files; 44 pre-existing errors in 9 untouched test files |
| Biome on all changed M4-004 paths | clean |
| `lib/db/service-engagement.integration.test.ts` | **12 SKIPPED — not executed, not passed** |

## Still unverified / out of scope

Migration 0043 **not executed**; no database contacted, no container created, no
migration applied. Signature authenticity/enforceability, professional authority,
protected-content access, staging and production remain unverified.

## Remaining limitation (explicit R1-05 boundary)

The revalidator in the guarded suite is an in-process test double. Atomicity against
a real source store is **not** established: a future verified adapter must prove a
locked or serializable snapshot re-read inside the same transaction (including
storage-level version/ETag concurrency) and be separately authorized per category.
Production keeps `unsupportedProjectResourceDisclosureResolver` with no revalidator,
so grant creation and all Fact/Document/Chat content access remain closed.

## Open policy items

Signature provider/enforceability/retention; contract-operator, issuer and
verification-operator delegation; post-departure grant revocation procedure (former
owner receives `403`, no Project access restored); per-resource sharing granularity;
whether any staff Engagement disclosure policy should ever exist.
