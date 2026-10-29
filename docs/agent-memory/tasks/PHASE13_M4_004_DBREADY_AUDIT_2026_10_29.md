# Phase 13 M4-004 — final offline DB-readiness audit (R0–R3 preserved)

**Recorded:** 2026-10-29, Australia/Sydney
**Branch:** `phase13-study-journey-project-centric`
**Base HEAD (unchanged):** `b64b201536e23e79cd8e9e7be6909328237c40e3`
**Reviewed R3 patch SHA-256:** `ffaad15e3ae9ceee424f37a66f6500ee564b6cdc775f20eb10bc1edc45b0ae5b`
**Disposition:** IMPLEMENTED / UNCOMMITTED / **PENDING INDEPENDENT REVIEW**. Advisory record only.

## Scope of this pass

Only `chatbot/lib/db/service-engagement.integration.test.ts` (plus documentation)
changed. **No production business code, migration, guard, launcher, flag or
authority configuration was modified**, because every defect found was a defect in
the test fixtures/assertions rather than in the implementation.

## Confirmed defects corrected

| # | Defect | Correction |
| --- | --- | --- |
| D1 | Composite-FK "positive control" inserted `id = randomUUID()` with a version owned by `engagementA`, so the *positive* row itself violated the FK | Positive row now uses `id = engagementA`; negative row uses `id = engagementB` with the same version and must fail `23503` |
| D2 | Probe engagement table carried an unused `engagementId` column and the inserts wrote it | Removed; the probe now models only `(id, currentAgreementVersionId)` |
| D3 | Temporary tables were created through a pooled client (`max: 2`) with no session reservation, so `CREATE TEMP TABLE` and later statements could land on different backends | The whole scenario runs on one `sql.reserve()` connection, released in `finally` |
| D4 | Probe FK was pasted from `pg_get_constraintdef`, relying implicitly on `pg_temp` shadowing to redirect the reference | Probe FK is now constructed explicitly against the temporary relation, and `confrelid` is verified to equal that relation, to live in `pg_my_temp_schema()`, and to differ from the permanent table OID |
| D5 | Deparsed-text assertions were brittle: PostgreSQL prints `id` unquoted, so `FOREIGN KEY ("currentAgreementVersionId", "id")` never matches | Replaced with `pg_constraint`/`pg_attribute` identity: `contype='f'`, source/target OID equality, ordered column mapping, `NOT DEFERRABLE`, `ON DELETE RESTRICT ON UPDATE NO ACTION` |
| D6 | Idempotency-conflict case used `action: "suspend"` under the `terminate` operation id; the operation key includes the operation type, so it created a new operation and failed with `revision_conflict`, not `idempotency_conflict` | Same action, same operation id, different request hash |
| D7 | Memberships were written with raw `INSERT INTO "ProjectMembership"` and grants reused the pre-membership Project revision | `inviteProjectMember` → `acceptProjectMembership` (with exact revision assertions `+1`/`+2`), and `revokeProjectMembership` for removal; grant revisions now follow the actual mutations |
| D8 | Guard-trigger scenario asserted only the SQLSTATE, with no proof the row survived, and no note that the attempted scope value was itself valid | Row and scope are re-read after both rejections; comment explains why `23514` must come from the guard, not the CHECK |
| D9 | Scope-CHECK scenario blurred metadata and behaviour, and the FK definition lookup was not scoped to a relation | Split: scenario 9 = catalog identity only; scenario 15 = behaviour on the deployed expression bound to the exact relation OID |
| D10 | Resource snapshot objects were built by spreading an unrelated fixture type (extra `resourceCategory`/`resourceId` keys) | Explicit `resourceSnapshot()`/`resourceObservation()` helpers and a literal `"project_document"` category type |
| D11 | Scenario 15 did not prove it left permanent data untouched | Row counts of `public."ServiceAgreementVersion"`/`public."ServiceEngagement"` are captured before and after and must match |

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
| Biome on the changed paths | clean |
| `git diff --check` | clean |
| `lib/db/service-engagement.integration.test.ts` | **15 SKIPPED — never executed, never passed** |

## Remaining uncertainty (resolvable only with real PostgreSQL)

1. The guarded suite has **never run**; static readiness is not execution evidence.
2. `pg_get_constraintdef` output for the CHECK is replayed verbatim on a probe table
   whose column is named `"scopeCodes"`. If a future PostgreSQL version changed that
   deparse form, the probe (not the production table) would fail loudly.
3. The probe verifies a **catalog-verified equivalent** constraint; it does not
   exercise the production table's append-only triggers or operation/event
   bookkeeping, which are covered by scenarios elsewhere in the suite.
4. Serialization expectations assume default `READ COMMITTED` with `FOR UPDATE`
   row locks, as implemented; an isolation-level change would need re-verification.
5. Signature/legal effect, professional authority, protected-content access, staging
   and production remain unverified; all ports stay deny-by-default and flags OFF.
