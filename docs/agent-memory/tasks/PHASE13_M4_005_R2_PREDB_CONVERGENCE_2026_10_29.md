# Phase 13 M4-005 — R2 final pre-database convergence

**Recorded:** 2026-10-29 (Australia/Sydney)
**Branch:** `phase13-study-journey-project-centric`
**Base HEAD:** `3d5467193e161fe4359f2bbe69e3b0507d2fa156` (unchanged; nothing committed, pushed, reset or rebased)
**Scope:** exactly the three review corrections. No architecture reopening, no PostgreSQL access, no migration execution, no containers, no provider access.
**Patch:** `/home/rico/phase13_m4_005_R2_review.patch` (cumulative vs the base HEAD; SHA-256 reported in the delivery message).

## Correction A — one correction per resolution

- New partial unique index `ServicePaymentResolution_superseded_target_unique` on `(supersedesResolutionId) WHERE supersedesResolutionId is not null`, declared consistently in `lib/db/schema.ts`, Migration 0044, the 0044 Drizzle snapshot and the availability probe (`requiredIndexes` 20 → 21).
- Existing control-plane trigger checks are untouched: append-only (`UPDATE`/`DELETE` refused), same-condition target, non-correction target, verified-evidence target and the "already superseded" pre-check.
- The repository still pre-checks with `state_conflict`, and now also maps the residual `23505` on that index to `state_conflict` through a shared `uniqueViolationConstraint` helper, so concurrent or direct-SQL double corrections fail closed as a domain conflict.
- No earlier migration touched.

## Correction B — complete persisted request identity

Four persisted audit values were previously outside the canonical identity. They are now bound:

| Persisted field | Identity field | Source of truth |
| --- | --- | --- |
| `ServicePaymentCondition.contractAuthorityCode` | `contractAuthorityCode` | authority decision code (HTTP + repository) |
| `ServicePaymentResolution.financeAuthorityCode` | `financeAuthorityCode` | finance decision code |
| `ServicePaymentResolution.observationCode` | `observationCode` | normalized to the persisted width by `servicePaymentPersistedObservationCode` |
| `ServicePaymentEvidence.verificationProvenance` | `verificationProvenanceSha256` | domain-separated digest via `servicePaymentVerificationProvenanceSha256` |

- HTTP and the repository pass the same material values into the same shared builders, so a caller hash is always re-derivable and a `requestHash` mismatch is `integrity_conflict`.
- Same operation id + identical request stays idempotent; same operation id + a materially different request is `idempotency_conflict` (new integration scenario for observation codes).
- Raw provenance text never enters a stored hash input, a log or telemetry: only its digest does, and the identity payload is asserted not to contain the raw text.
- The `correction ⇒ evidenceId IS NULL` rule is now also expressed in `schema.ts` (`ServicePaymentResolution_target_check`), matching Migration 0044. Drizzle v7 snapshots do not persist CHECK bodies, so schema + migration are the two authoritative layers for that rule.

## Correction C — select the live condition directly

- `runRecordPaymentCondition()` now locks `engagementId = current engagement AND supersededAt IS NULL` (`FOR UPDATE`) instead of ordering by `createdAt`/`id` and filtering afterwards.
- Unchanged: Project lock, Condition lock, deferred successor FK, deferred lineage trigger, partial live-slot unique index and the atomic retire-then-insert sequence.
- New integration regression asserts a three-hop replacement chain where every hop retires its live predecessor, exactly one row stays live, and the retired rows can never be selected as replacement targets.

## Validation (offline only)

| Check | Result |
| --- | --- |
| `pnpm test:phase13:m4-005:offline` | **89 pass / 0 fail** (policy 30, authority 13, http 20, schema-contract 26) |
| `pnpm test:phase13:m4-005:guard` | **13 pass / 0 fail** (with the re-pinned Migration 0044 SHA-256) |
| `pnpm test:phase13:m4-004:offline` / `:guard` | 61 pass / 7 pass, 0 fail |
| `pnpm test:phase13:m4-003:offline` / `:guard` | 27 pass / 13 pass, 0 fail |
| `pnpm test:phase13:m4-002:guard` | 13 pass / 0 fail |
| `pnpm test:unit` | **991 pass / 0 fail / 0 skip** |
| `pnpm db:check` | clean |
| `pnpm exec tsc --noEmit` | 44 pre-existing errors in 9 untouched files, **0 new** |
| Changed-path Biome / `git diff --check` | clean |

Migration 0044 is now 563 lines, 21 indexes, 5 triggers, 40 `ADD CONSTRAINT` clauses, SHA-256 `c9fab5b11e1546d1964eaff5f1cb551c9651f1b9aa6a01e0d61b1b5ca34d14f3`.

## PostgreSQL acceptance matrix: 40 guarded scenarios (still never executed)

The 35 R1 scenarios are unchanged; five were added:

1. Correction A — catalog proof (unique + partial index) plus a successful first correction.
2. Correction A — a second correction of the same resolution is `state_conflict`.
3. Correction A — concurrent corrections: exactly one commits, the other is `state_conflict`, DB holds one correction row.
4. Correction B — changed persisted observation code with the same operation id is `idempotency_conflict`.
5. Correction C — replacement always targets the live condition through a three-hop chain.

## Still unresolved (unchanged, no invention)

Contract-requirement assertion authority, finance attestation/verification roles and independence, authoritative settlement/refund/reversal observations, financial evidence retention/redaction/accounting, condition carry-forward on a revised contract, the customer dispute workflow, and historical reconciliation of superseded contracts. Phase 13 remains LIVE/PRODUCTION NO_GO; `PHASE13_SERVICE_PAYMENT_ENABLED` is OFF and every production port is deny-only.
