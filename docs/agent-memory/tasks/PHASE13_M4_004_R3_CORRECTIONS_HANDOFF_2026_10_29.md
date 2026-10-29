# Phase 13 M4-004 — R3 final review corrections (offline, fail-closed)

**Recorded:** 2026-10-29, Australia/Sydney
**Branch:** `phase13-study-journey-project-centric`
**Base HEAD (unchanged):** `b64b201536e23e79cd8e9e7be6909328237c40e3`
**Reviewed R2 patch SHA-256:** `5bf4fb0021a693acd564b15dcc87de9507a7575317bb085760968ccccf1f5f37`
**Disposition:** IMPLEMENTED / UNCOMMITTED / **PENDING INDEPENDENT RE-REVIEW**. Advisory record; acceptance belongs to the independent reviewer and project owner.

## Corrections delivered

| ID | Correction | Implementation |
| --- | --- | --- |
| FIX-01 | M4-002 fixture workflow | `seedFixture` creates a separate synthetic **admin** account and executes the accepted Option A sequence (admin proposes → owner approves → lawyer accepts), and it first proves that an owner-actor proposal is refused. Every one of the 15 guarded scenarios now builds state through that workflow; production authorization untouched. |
| FIX-02 | Membership-revocation assertions | After the resource owner's membership is revoked, the recipient detail read now expects `not_found` (no grant metadata at all) instead of a context with `resourceOwnerEligible: false`; the recipient list is asserted empty with `hasMore: false`, and the recorded owner's independent `resource_owner_audit` view and `403`-on-revoke behaviour are still asserted. |
| FIX-03 | Canonical agreement terms | New `canonicalTerms()` fixture uses `parseServiceAgreementTerms`; payload + hash are used consistently in authority requests, draft creation, issue and acceptance (all six former `{"clauses":[],…}` literals removed). New `serviceAgreementTermsWriteMatches()` is enforced at the repository write boundary: non-canonical bytes, mismatched hash, mismatched scope or mismatched mode → `invalid_request` before any row is written. Positive and negative coverage in both offline and guarded suites. |
| FIX-04 | Grant pagination | Recipient-list eligibility is now a SQL predicate (`recipientGrantOwnerEligibilitySql`: owner account currency via a shared guest constant + owner/`ProjectMembership` relationship), so `LIMIT limit + 1` selects authorized rows in the canonical order. The shared JS predicate still post-checks. Guarded test interleaves eligible/ineligible grants and asserts `limit: 1` yields an authorized row with `hasMore: true` and `limit: 2` yields exactly the authorized pair. |
| FIX-DB | Executable constraint assertions | Empty-scope CHECK and the cross-engagement composite FK are now exercised executably: the *deployed* definitions are read from `pg_catalog` and replayed on `pg_temp` probe tables, then a violating `INSERT` must fail `23514` / `23503` with the probe constraint name. Direct writes to the production tables stay impossible (append-only guards), which is separately asserted. |

## Verification (offline, exact)

| Check | Result |
| --- | --- |
| `pnpm test:phase13:m4-004:offline` | **61 pass / 0 fail / 0 skip** |
| `pnpm test:phase13:m4-004:guard` | **6 pass / 0 fail** |
| `pnpm test:phase13:m4-003:offline` / `:guard` | **27 pass** / **13 pass** |
| `pnpm test:phase13:m4-002:guard` | **13 pass** |
| `pnpm test:unit` | **991 pass / 0 fail / 0 skip** |
| `pnpm db:check` | clean |
| `pnpm exec tsc --noEmit` | 0 errors in M4-004 files; 44 pre-existing errors in 9 untouched files |
| Biome on all changed M4-004 paths | clean |
| `lib/db/service-engagement.integration.test.ts` | **15 SKIPPED — not executed, not passed** |

## Still unverified / out of scope

Migration 0043 **not executed**; no database contacted, no container created, no
migration applied. Signature authenticity/enforceability, professional authority,
protected-content access, staging and production remain unverified.

## Remaining limitation (explicit R1-05 boundary)

The guarded suite's revalidator is an in-process double. Atomicity against a real
source store is **not** established: a future adapter must prove a locked or
serializable snapshot re-read inside the same transaction (including storage-level
version/ETag concurrency) and be separately authorized per category. Production keeps
`unsupportedProjectResourceDisclosureResolver` with no revalidator, so grant creation
and all Fact/Document/Chat content access remain closed.

## Open policy items

Signature provider/enforceability/retention; contract-operator, issuer and
verification-operator delegation; post-departure grant revocation procedure; per-resource
sharing granularity; whether any staff Engagement disclosure policy should exist.
