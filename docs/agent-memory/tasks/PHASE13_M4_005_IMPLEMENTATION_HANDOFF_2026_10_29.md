# Phase 13 M4-005 — staff-attested off-platform service payment conditions

**Recorded:** 2026-10-29 (Australia/Sydney)
**Branch:** `phase13-study-journey-project-centric`
**Base HEAD:** `3d5467193e161fe4359f2bbe69e3b0507d2fa156` (`feat(phase 13): complete M4-004 service engagement`), clean worktree at start
**Status:** `M4-005 IMPLEMENTED / OFFLINE VALIDATED / DATABASE NOT TESTED / PENDING INDEPENDENT REVIEW`
**Review patch:** `/home/rico/phase13_m4_005_review.patch` — cumulative against the base HEAD. Its SHA-256 and byte size are reported in the delivery message, because a patch cannot contain its own digest.
**Authorization:** source implementation, additive migration authoring, offline validation and *preparation* of a guarded PostgreSQL suite. No database connection, no migration execution, no container creation, no deployment, no commit/push.

## 1. Inherited contract findings (verified against source, not summaries)

1. `ServiceAgreementVersion.termsPayload` is a **free-text clause document** (`clauseId`/`heading`/`body`). There is **no machine-readable payment schedule, amount, currency or deadline anywhere in M4-004**. Any payment requirement must therefore come from an explicit authority decision — never from clause keywords, an LLM reading, agreement acceptance, a VIP/Stripe entitlement, a chat message or a browser boolean.
2. `ServiceEngagement.currentAgreementVersionId` is the authoritative "current contract" pointer, and `runIssueAgreementVersion` supersedes the previous version in the same transaction. That is the only reliable invalidation signal for a payment condition.
3. M4-002 assignment eligibility (active assignment + verified non-guest lawyer email + `project_staff_collaboration` purpose) is the accepted operator gate; a global `lawyer`/`admin` role is insufficient.
4. M4-004 production composition is deny-by-default for every external port (`denyAllServiceOperatorAuthority`, `denyAllServiceSignatureEvidenceVerifier`, `unsupportedProjectResourceDisclosureResolver`, no revalidator). M4-005 mirrors that pattern exactly.
5. `ProjectOperation` is the idempotency/audit spine; `ProjectEvent` is the per-revision audit trail; `ProjectOperation_type_check`, `ProjectOperation_result_kind_check`, `ProjectOperation_actor_type_check`, `ProjectEvent_type_check` and `ProjectEvent_subject_check` are CHECK constraints that must be extended additively for new operation/event vocabulary.
6. Migration journal head at task start was index 43 / `0043_phase13_m4_004_service_engagement` (44 entries), so M4-005 is **0044** (verified, not assumed).

## 2. Design and state machine

### Tables (additive, Migration 0044)

| Table | Purpose | Protection |
| --- | --- | --- |
| `ServicePaymentCondition` | one contractual payment requirement bound to the exact agreement version + terms hash | append-only; a single one-way supersession transition; exactly one live condition per engagement (partial unique index) |
| `ServicePaymentEvidence` | bounded external payment observation and its one independent evaluation | append-only; one `pending -> verified\|rejected` transition; submitter can never be the verifier; one verified settlement per condition |
| `ServicePaymentResolution` | immutable dispute/refund/reversal/void/correction history | fully append-only; corrections supersede exactly one earlier resolution |

No mutable "paid" column exists anywhere. There is no `isPaid`. The effective status is always **derived** by `evaluateServicePaymentState`.

### Effective-status projection (frozen precedence)

```text
UNKNOWN > VOID > DISPUTED > REVERSED > SATISFIED > EVIDENCE_PENDING > REQUIRED_UNSATISFIED
```

plus `NOT_REQUIRED`, which only an explicit contract-authority decision can produce.

Reason codes: `condition_absent`, `condition_superseded`, `contract_not_current`, `contract_requirement_unknown`, `engagement_terminated`, `contractually_not_required`, `condition_voided`, `payment_disputed`, `payment_reversed`, `payment_refunded`, `evidence_verified`, `evidence_pending`, `no_evidence`.

Key consequences (all unit-tested):

- a replaced agreement version makes the old condition `UNKNOWN / contract_not_current`, so an earlier satisfaction cannot survive a new contract;
- a refund or reversal removes satisfaction (`REVERSED`) while the original `verified` attestation stays in history;
- a `void` outranks everything, so a condition can never be simultaneously payable and void;
- a `correction` restores a mistaken dispute/reversal by superseding one earlier resolution, never by editing history.

### Entities not implemented (deliberate)

- no invoice, checkout, Stripe action, bank connection, email or UI;
- no M4-006 professional review and no M4-007 handoff gate;
- no automatic payment detection of any kind.

## 3. Authority and observation ports (production deny-all)

| Port | Production implementation | Test-only implementation |
| --- | --- | --- |
| `ServicePaymentContractAuthority` | `denyAllServicePaymentContractAuthority` (`contract_authority_unavailable`) | `createSyntheticServicePaymentContractAuthority` |
| `ServicePaymentFinanceAuthority` | `denyAllServicePaymentFinanceAuthority` (`finance_authority_unavailable`) | `createSyntheticServicePaymentFinanceAuthority` (action-scoped, revocable) |
| `ServicePaymentEvidenceVerifier` | `denyAllServicePaymentEvidenceVerifier` (`verification_provider_unavailable`) | `createSyntheticServicePaymentEvidenceVerifier` |
| `ServicePaymentReversalResolver` | `unsupportedServicePaymentReversalResolver` (`reversal_provider_unavailable`) | `createSyntheticServicePaymentReversalResolver` |

Every request hash is domain-separated, canonical (`canonicalProjectOperationRequest`) and bound to actor, project, engagement, exact agreement version, terms hash, condition, evidence, amount, currency, action and observation digest. The repository **re-derives** the binding from the rows it locked and refuses any mismatch with `authority_denied`.

`lib/service-payment/runtime.ts` imports only the deny-all ports; `schema-contract.test.ts` asserts that no production module imports `synthetic-authorities.ts`.

## 4. API surface (feature flag OFF by default)

Flag: `PHASE13_SERVICE_PAYMENT_ENABLED` (unset/anything but `true` = disabled, routes answer an existence-hiding 404).

| Method | Route | Capability |
| --- | --- | --- |
| GET | `/api/projects/[projectId]/engagements/[engagementId]/payments` | owner-safe or operator status projection |
| POST | `.../payments/condition` | record the contractual requirement |
| POST | `.../payments/evidence` | submit bounded external evidence |
| POST | `.../payments/evidence/[evidenceId]/verification` | independent finance evaluation |
| POST | `.../payments/resolutions` | dispute / refund / reversal / void / correction |

All handlers: authentication -> guest rejection -> flag -> rate limit -> schema availability -> validation -> authority port -> repository binding re-check. Non-authorized actors receive `not_found`, never a distinguishable 403, so engagement/condition/evidence existence is not leaked.

## 5. Verification actually performed (offline only)

| Check | Command | Result |
| --- | --- | --- |
| M4-005 offline policy/authority/http/schema-contract | `pnpm test:phase13:m4-005:offline` | **63 pass / 0 fail / 0 skip** |
| M4-005 launcher guard | `pnpm test:phase13:m4-005:guard` | **13 pass / 0 fail** |
| M4-004 offline regression | `pnpm test:phase13:m4-004:offline` | 61 pass / 0 fail |
| M4-004 guard regression | `pnpm test:phase13:m4-004:guard` | 7 pass / 0 fail |
| M4-003 offline / guard | `pnpm test:phase13:m4-003:*` | 27 pass / 13 pass |
| M4-002 guard | `pnpm test:phase13:m4-002:guard` | 13 pass / 0 fail |
| Full unit suite | `pnpm test:unit` | 991 pass / 0 fail / 0 skip |
| Drizzle consistency | `pnpm db:check` | clean |
| TypeScript | `pnpm exec tsc --noEmit` | 44 pre-existing errors in 9 untouched files, **0 new** |
| Biome (changed paths) | `pnpm exec biome check ...` | clean |
| Patch hygiene | `git diff --check` | clean |

## 6. PostgreSQL readiness — written, not executed

- `scripts/phase13-m4-005-db-test-guard.ts` — pure preflight validators (URL, approval token vs variable name, child env derivation, journal + pinned Migration 0044 hash, DB identity incl. SELECT-only Drizzle ledger, Docker container/image/mount/port identity).
- `scripts/phase13-m4-005-db-test.ts` — the guarded launcher mirroring the accepted M4-004 design. **Never executed.**
- `lib/db/service-payment.integration.test.ts` — 22 guarded scenarios across groups A–H. **Never executed**; every scenario is skipped unless the guarded runner marker is present.
- Proposed (NOT approved) isolated target in the guard: container `phase13-m4-005-pg`, image `postgres:17`, `127.0.0.1:55445`, database `immigration_ai_phase13_m4_005_test`, role `phase13_m4_005_tester`, ledger 45 rows / head index 44, Migration 0044 SHA-256 `d0912c0e17f54f57f9d01ab53c14d8d80cfc260751f27c7c3424ff8d556e7f67`.
- The accepted M4-004 database must **not** be reused: its ledger stops at 0043.

## 7. Remaining policy decisions (unresolved, deliberately not invented)

1. **Who may assert the contractual payment requirement** and against which approved clause/schedule authority.
2. **Who may attest/verify off-platform payments** (role, independence, dual control) and which evidence standard is acceptable.
3. **Authoritative observation sources** for settlement, refund, reversal and chargeback.
4. **Financial evidence retention, redaction and erasure** rules, and accounting/tax treatment.
5. **Whether a revised contract needs a re-issued payment condition** or may carry one forward (currently: a replaced version invalidates the old condition, by design).
6. **Customer dispute/refund request workflow** (who may raise a dispute, with what SLA).

Until 1–4 are decided, production remains deny-only: no condition can be recorded, no evidence can be verified, no satisfaction can exist.

## 8. Minimal edits to previously accepted files (justified)

| File | Change | Why |
| --- | --- | --- |
| `lib/db/schema.ts` | three new tables; extended `PROJECT_OPERATION_TYPES`, `PROJECT_OPERATION_RESULT_KINDS`, `PROJECT_EVENT_TYPES`, `PROJECT_EVENT_SUBJECT_KINDS`, and the matching CHECK expressions | additive vocabulary required by M4-005 |
| `chatbot/package.json` | three test scripts | same pattern as M4-002/003/004 |
| `lib/service-engagement/schema-contract.test.ts` | "0043 is the additive journal successor" now pins entry 43 by index instead of requiring it to be last | an authorized additive migration 0044 now follows it; 0043 content is unchanged |
| `scripts/phase13-m4-004-db-test-guard.ts` / `.test.ts` | journal validation accepts `entries.length >= 44` and locates 0043 by index; the missing-entry negative control removes the pinned entry | same reason; the M4-004 **target database** ledger expectation (44 rows, head 43) is unchanged |

Nothing in M4-002/003/004 authorization, Stripe/VIP billing, AI chat, retrieval or document handling was modified.

## 9. Next authorized step

Independent source review of `/home/rico/phase13_m4_005_review.patch`, then a **separate** owner authorization for one isolated PostgreSQL target (container + database + Migration 0044 + one guarded Stage 3B run). No live or production activation is implied.
