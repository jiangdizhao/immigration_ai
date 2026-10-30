# Phase 13 M4-005 — R1 consolidated correction record

**Recorded:** 2026-10-29 (Australia/Sydney)
**Branch:** `phase13-study-journey-project-centric`
**Base HEAD:** `3d5467193e161fe4359f2bbe69e3b0507d2fa156` (unchanged; nothing committed, pushed, reset or rebased)
**Scope:** one consolidated correction round for the five independent-review findings. No PostgreSQL access, no migration execution, no Docker resources, no deployment.
**Patch:** `/home/rico/phase13_m4_005_R1_review.patch` (cumulative against the base HEAD; its SHA-256 and size are reported in the delivery message because a patch cannot embed its own digest).

## FIX-01 — condition replacement was an impossible ordering (production defect, confirmed)

**Defect.** The repository inserted the replacement condition and only then retired the previous one, while Migration 0044 enforced `UNIQUE (projectId, engagementId) WHERE supersededAt IS NULL` immediately, and the INSERT trigger required the predecessor to still be live. No order satisfied all three.

**Correction (schema + repository jointly coherent):**

1. Order is now **retire → insert**: the retiring `UPDATE` sets `supersededAt`, `supersededByConditionId` (a pre-generated successor id), `supersededProjectRevision` and `supersededOperationRecordId`; the successor `INSERT` then names the retired predecessor.
2. The cross-row lineage check moved from the immediate `BEFORE` trigger to a **deferred constraint trigger** `ServicePaymentCondition_supersession_lineage` (`AFTER INSERT OR UPDATE ... DEFERRABLE INITIALLY DEFERRED`), and the successor pointer became a **deferrable self-referencing foreign key** `ServicePaymentCondition_superseded_by_fk` → `(id, projectId)`.
3. The `INSERT` guard now requires the predecessor to be retired *by this exact successor*, so the reverse direction is checked immediately and the forward direction at COMMIT.
4. The partial unique index, the all-or-none supersession CHECK, content immutability and one-way supersession are all preserved.
5. The repository locks the newest condition row `FOR UPDATE`, refuses a stale retry with `state_conflict`, and translates any residual live-slot unique violation into `state_conflict`.

**PostgreSQL note for reviewers:** `UNIQUE` *indexes* cannot be deferred and partial unique *constraints* do not exist, which is why the live-slot index stays immediate and the cross-row lineage is deferred instead.

**Coverage:** first creation (no predecessor), replacement (both lineages + exactly one live), failed replacement (no orphan operation/condition, revision unchanged), concurrent replacement, and direct SQL tampering (one-sided supersession rejected immediately; dangling successor rejected at COMMIT).

## FIX-02 — staff payment-status disclosure

- New port `ServicePaymentStatusReadAuthority` + `denyAllServicePaymentStatusReadAuthority` (production) and `createSyntheticServicePaymentStatusReadAuthority` (test-only, per-engagement scoped).
- `loadPaymentStatus` now: owner ⇒ allowed; any other actor ⇒ current M4-002 assignment **and** an explicit action-scoped decision, otherwise an existence-hiding `not_found`.
- The decision request is canonical and bound to actor + project + engagement + scope; the operator view exposes which authority allowed the read (`provenance.readAuthorityCode`).
- `runtime.ts` composes only the deny-all read authority; the repository default is deny-all.
- Regression tests: assigned lawyer without disclosure → `not_found`; owner still reads; scoped synthetic grant → operator view; grant pinned to another engagement → `not_found`.

## FIX-03 — complete effective-status evaluation

- The 50-row window is now explicitly **display-only** (`loadPaymentHistory`).
- The authoritative facts come from complete queries: the live condition is selected by `supersededAt IS NULL` (never by timestamp alone), full resolution lineage is reduced in memory so correction chains are complete, and the satisfying evidence is the newest verified row matching amount/currency that is not invalidated.
- New pure entry point `evaluateServicePaymentFacts`; `evaluateServicePaymentState` is now a list wrapper that delegates to it, so precedence has one implementation.
- The whole status read runs in a `repeatable read` transaction (single snapshot) and any failure propagates as an error rather than a fabricated status; missing/exhausted history yields `UNKNOWN`.
- Regression tests: an old `VOID` after 55 later records; an uncorrected `DISPUTE` after 55 later records; correction lineage complete beyond the window; facts-based `UNKNOWN` never becomes satisfaction.

## FIX-04 — contract currentness during verification

- Before any `pending → verified|rejected` transition the repository now revalidates, under lock: current agreement version is `issued` and is the engagement's current version; the condition is live; condition/evidence agreement version and terms hash all match the current version; engagement status is still eligible; actor is a current operator and is not the submitter.
- Stale or superseded contract ⇒ `state_conflict`; the evidence stays `pending` and the effective status becomes `UNKNOWN / contract_not_current`.
- Documented boundary: historical reconciliation (refunds/reversals on a superseded contract) is **not** implemented; resolutions currently require a live condition. That is a finance-policy decision, not an oversight.

## FIX-05 — complete canonical idempotency

- New shared identity builders in `policy.ts`: `servicePaymentConditionRequestIdentity`, `servicePaymentEvidenceRequestIdentity`, `servicePaymentVerificationRequestIdentity`, `servicePaymentResolutionRequestIdentity`. They bind every material field: contract version + terms hash, requirement, amount, currency, contractual basis, contract observation, evidence category, reference digest, paid time, verification status/method/provider/reason, resolution kind, reason, exact superseded resolution, evidence target and expected project revision.
- The HTTP layer and the repository call the **same** builders. The repository re-derives the hash from the rows it locked and refuses a mismatching caller hash with `integrity_conflict` instead of trusting it.
- Operation claiming happens after the authoritative reads, so a replay is only recognised for the exact semantic request; a revoked actor is rejected before any replay path.
- A `correction` may no longer name evidence at any layer (policy predicate, repository, `ServicePaymentResolution_target_check`), so a correction can never invalidate the payment it restores.
- Integration fixtures (condition, evidence, verification, resolution, idempotency and replay scenarios) now build the same canonical identities as HTTP instead of arbitrary `sha256(label)` values.

## Migration 0044 changes (still the only additive migration)

| Item | Before R1 | After R1 |
| --- | --- | --- |
| SHA-256 | `d0912c0e…556e7f67` | `763cab7c4f3c00b7a9592a24a6df06870057ae13fc2a1e1740a43d0f73caafa0` |
| Lines | 512 | 559 |
| Triggers | 4 | **5** (adds the deferred `ServicePaymentCondition_supersession_lineage`) |
| Indexes | 20 | 20 (unchanged; reuse of `(id, projectId)` as the FK target) |
| CHECK constraints | 25 | 25 (`ServicePaymentResolution_target_check` now requires `correction ⇒ evidenceId IS NULL`) |
| New FK | — | `ServicePaymentCondition_superseded_by_fk` (deferrable, SQL-only like M4-004's `ServiceEngagement_current_agreement_fk`) |

## Revised PostgreSQL acceptance matrix (35 guarded scenarios, still never executed)

| Group | Scenarios |
| --- | --- |
| A schema/audit | preflight identity; digest-only columns; CHECK probe (amount/currency/requirement) |
| B contract binding | exact version binding + supersession; replaced agreement → `contract_not_current`; explicit `NOT_REQUIRED`/`UNKNOWN` |
| C authority | unassigned lawyer/admin/customer denied; forged authority binding; customer cannot submit/verify |
| D evidence | amount mismatch (repository + FK); pending + self-verify; duplicate digest; rejected receipt |
| E correction/reversal | satisfied → refund → `REVERSED`; correction restores; refund replay idempotent |
| F concurrency | exact replay; changed request conflict; stale revision; concurrent conditions; single-shot verification |
| G isolation | cross-project isolation; acceptance ≠ payment |
| H safety | deny-by-default verifier; append-only DB guards |
| **R1 FIX-01** | first creation; replacement with both lineages; failed replacement rollback; SQL tampering |
| **R1 FIX-02** | lawyer without disclosure denied; scoped synthetic disclosure allowed |
| **R1 FIX-03** | void > window; uncorrected dispute > window |
| **R1 FIX-04** | verification fails closed after agreement replacement |
| **R1 FIX-05** | correction naming evidence refused; same key + changed semantics conflicts |

Every positive fixture now derives the same canonical request identity as the HTTP layer, so each is executable against the SQL constraints; each negative expectation names the earliest failing gate and asserts its exact error.

## Validation actually executed (offline)

| Check | Command | Result |
| --- | --- | --- |
| M4-005 offline | `pnpm test:phase13:m4-005:offline` | 83 pass / 0 fail / 0 skip (exit 0) |
| M4-005 guard | `pnpm test:phase13:m4-005:guard` | 13 pass / 0 fail (exit 0) |
| M4-004 offline + guard | `pnpm test:phase13:m4-004:*` | 61 pass / 7 pass, 0 fail |
| M4-003 offline + guard | `pnpm test:phase13:m4-003:*` | 27 pass / 13 pass, 0 fail |
| M4-002 guard | `pnpm test:phase13:m4-002:guard` | 13 pass / 0 fail |
| Full unit suite | `pnpm test:unit` | 991 pass / 0 fail / 0 skip (exit 0) |
| Drizzle consistency | `pnpm db:check` | clean |
| TypeScript | `pnpm exec tsc --noEmit` | 44 pre-existing errors in 9 untouched files, **0 new** |
| Changed-path Biome | `pnpm exec biome check …` | clean |
| Patch hygiene | `git diff --check` | clean |

## Still unresolved (no invention attempted)

Who may assert a contractual payment requirement; who may attest/verify off-platform money and with what independence; which external observations are authoritative for settlement/refund/reversal; financial evidence retention/redaction/accounting; whether a revised contract carries a condition forward (current behaviour: it does not); the customer dispute workflow; and historical reconciliation of superseded contracts.

Phase 13 remains **LIVE/PRODUCTION NO_GO**; `PHASE13_SERVICE_PAYMENT_ENABLED` defaults OFF; all four production authorities remain deny-only.
