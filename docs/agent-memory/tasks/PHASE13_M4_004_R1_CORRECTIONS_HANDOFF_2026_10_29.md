# Phase 13 M4-004 — R1 review corrections (offline, fail-closed)

**Recorded:** 2026-10-29, Australia/Sydney
**Branch:** `phase13-study-journey-project-centric`
**Base HEAD (unchanged):** `b64b201536e23e79cd8e9e7be6909328237c40e3`
**Disposition:** IMPLEMENTED / UNCOMMITTED / **PENDING INDEPENDENT RE-REVIEW**. This document is advisory; acceptance belongs to the independent reviewer and project owner.
**Supersedes nothing:** the R0 record (`PHASE13_M4_004_IMPLEMENTATION_HANDOFF_2026_10_29.md`) still describes the accepted architecture; this file records only the six required corrections.

## Corrections delivered

| ID | Correction | Implementation |
| --- | --- | --- |
| R1-01 | Staff metadata authorization | `SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY` (all fields denied) + separate owner policy; `staffEngagementView(row, policy)` returns `null` for denied fields and always reports `metadataPolicyCode`. Assignment alone discloses nothing. |
| R1-02 | Disclosure metadata after revocation | `loadDisclosureAccessContext` computes `accessRole` (`recipient_current` / `resource_owner_audit`) and `metadataAuthorized` from current state. Former recipients get `404` with no metadata; owner audit returns `auditOnly: true` and `decision: null`, never an access decision. |
| R1-03 | Resource-owner membership revocation | New evaluator input `resourceOwnerEligible` (server-derived) with reason `resource_owner_ineligible`, checked before all recipient predicates. Revocation distinguishes `404` (not the owner) from `403` (owner without current eligibility); no Project access is restored. |
| R1-04 | Scope-specific operator authority | `ServiceOperatorAuthority` (`author_draft` / `issue` / `verify_signature`) receives the exact persisted target + operator assignment state/eligibility + canonical `requestSha256`. `loadServiceOperatorContext` (and `loadSignatureVerificationTarget`) build it; mutations re-derive it under lock and refuse mismatch (`integrity_conflict`) or a non-assigned operator (`forbidden`). No role-only path remains. |
| R1-05 | Resource disclosure TOCTOU | Adapter `fingerprint` + `resourceObservationSha256` bind the grant to one observation; persisted as `resourceFingerprint`; re-derived in the transaction; `ProjectResourceDisclosureRevalidator` must re-read inside the transaction (production composes none → `resource_unavailable`). Evaluator denies `resource_observation_mismatch`. |
| R1-06 | Migration integrity | `cardinality()` scope CHECKs (empty array now rejected), composite `ServiceEngagement_current_agreement_fk` → `(id, engagementId)` with `ServiceAgreementVersion_id_engagement_unique`, and `declaredSignedAt <= submittedAt + interval '5 minutes'` matching the shared TypeScript constant. Schema, migration, snapshot and availability probe updated together. |

## Verification (offline, exact)

| Check | Result |
| --- | --- |
| `pnpm test:phase13:m4-004:offline` (includes `r1-corrections.test.ts`) | **57 pass / 0 fail / 0 skip** |
| `pnpm test:phase13:m4-004:guard` | **3 pass / 0 fail** |
| `pnpm test:phase13:m4-003:offline` / `:guard` (regression) | **27 pass** / **13 pass** |
| `pnpm test:phase13:m4-002:guard` (regression) | **13 pass** |
| `pnpm test:unit` | **991 pass / 0 fail / 0 skip, exit 0** |
| `pnpm db:check` | `Everything's fine` |
| Next `drizzle-kit generate` | `No schema changes, nothing to migrate` (snapshot matches schema.ts) |
| `tsc --noEmit` | 0 errors in M4-004 files; 44 pre-existing errors in 9 untouched test files |
| Biome on all changed M4-004 files | clean |
| `lib/db/service-engagement.integration.test.ts` | **10 SKIPPED — not executed, not passed** |

## Still unverified

Migration 0043 **not executed**; no database contacted. Signature authenticity/enforceability, professional authority, protected-content access, staging and production remain unverified. The R1 corrections are static/offline-verified only.

## Remaining integration requirement (explicit)

Disclosure still has no real source adapter. A verified adapter must (a) return the exact version and an opaque fingerprint, (b) implement `revalidate` with a locked or serializable re-read, and (c) be explicitly authorized for the category. Until then `unsupportedProjectResourceDisclosureResolver` and the absent revalidator keep grant creation and content access closed.

## Remaining unresolved policy

Signature provider/enforceability/retention; contract operator, issuer and verification-operator delegation; post-departure (no-longer-eligible owner) grant revocation procedure; per-resource sharing granularity.
