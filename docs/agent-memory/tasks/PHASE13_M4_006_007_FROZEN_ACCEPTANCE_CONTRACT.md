# Phase 13 — M4-006 / M4-007 FROZEN ACCEPTANCE CONTRACT (2026-10-30)

**Status:** `FROZEN` — produced before implementation. Implementations must satisfy
this document; this document must not be weakened to match an implementation.

**Frozen inputs**

| Item | Value |
|---|---|
| Branch | `phase13-study-journey-project-centric` |
| Baseline HEAD | `3d5467193e161fe4359f2bbe69e3b0507d2fa156` |
| M4-005 status | `DATABASE VALIDATED / FUNCTIONAL VALIDATION INCOMPLETE / FEATURE OFF` (frozen) |
| Migration 0044 SHA-256 | `d90ebf497dd049cb4f6fc221d2129639714028849a819e7dbb6e5b32a6146f0e` |
| M4-005 ledger / Stage 3B | 45 entries · 29 pass / 12 fail / 1 cancelled · exit 124 |
| Feature flags | `PHASE13_SERVICE_PAYMENT_ENABLED` OFF; M4-006/M4-007 flags OFF |

## 0. Freeze rules

1. Expected outcomes below are fixed. An implementation that cannot meet one
   records it as `FEATURE_INCOMPLETE`/`BLOCKED` in the risk register instead of
   weakening the row.
2. Negative controls are mandatory and may not be deleted.
3. A synthetic (test-only injected) authority may never be reported as real
   authority; a synthetic `READY` is never proof of professional, legal, payment
   or production readiness.
4. Where no approved policy exists, the safe outcome is fixed here as `UNKNOWN`,
   `NOT_READY` or `DENY` (see §5).
5. Test pass counts are not the success criterion; scenario outcomes are.
6. Tests may be corrected only for genuine harness syntax/execution defects and
   only where the frozen expectation is unchanged; each correction is recorded in
   the final report.

## 1. Categories and delivery

`B` business · `S` authorization/security · `P` persistence/audit ·
`I` integration · `O` operational.
`delivery`: `deny_only` (production surface, must fail closed) · `synthetic_only`
(requires explicitly injected test-only adapters) · `offline_both`.

## 2. M4-006 scenarios (`REV-*`)

```yaml
- id: REV-01
  category: [B]
  delivery: offline_both
  preconditions: An immutable managed-application target is resolvable from a trusted provider; the actor is an active named lawyer on the Project.
  inputs: projectId, targetKind, targetId, targetVersion, targetSha256, reviewPurpose, reviewScope, operationId
  expected: A review request is created in state `requested`, bound to the exact target identity/hash.
  negative_controls: [target provider untrusted, target kind unsupported, projectId/target mismatch, empty scope]
  component: professional-review/service#createReviewRequest
  evidence: state=requested and targetSha256 equals the canonical identity hash; no decision present
- id: REV-02
  category: [B, S]
  delivery: deny_only
  expected: DENY (`review_authority_unavailable`); nothing persisted.
  negative_controls: [lawyer_global_role_supplied, admin_role_supplied, forged assignment id]
  component: professional-review/authority
  evidence: decision.allowed=false, reason review_authority_unavailable
- id: REV-03
  category: [B, S]
  delivery: synthetic_only
  preconditions: Scoped test-only authority authorizes approve for reviewer A on exactly this Project+target.
  expected: state approved; decision immutably binds decision target version/hash, authorityCode, credentialCode.
  negative_controls: [reviewer B not scoped, wrong project, wrong target kind, wrong target version]
  component: professional-review/service#recordDecision
  evidence: boundTargetVersion/boundTargetSha256 equal the reviewed target; prior states retained in history
- id: REV-04
  category: [B]
  delivery: offline_both
  expected: Only the frozen graph is accepted - requested->in_review; in_review->changes_requested|approved|rejected; any open state->invalidated.
  negative_controls: [approve from requested, request_changes from requested, decide after invalidated, decide after approved]
  component: professional-review/policy#professionalReviewTransitionAllowed
  evidence: illegal transitions rejected with state_conflict
- id: REV-05
  category: [P]
  delivery: offline_both
  expected: Two decisions with the same expectedRevision - exactly one wins (CAS); the other fails revision_conflict; history append-only.
  negative_controls: [missing expectedRevision, stale revision, revision regression]
  component: professional-review/store + service
  evidence: one record at N+1; loser error revision_conflict; history grows by exactly one
- id: REV-06
  category: [P]
  delivery: offline_both
  expected: Exact replay (operationId, requestSha256) returns the stored record with replayed=true; changed semantic request fails idempotency_conflict.
  negative_controls: [same operationId different action, different target, different comment digest]
  component: professional-review/service#recordDecision
  evidence: replay identical id/revision; conflict raises idempotency_conflict
- id: REV-07
  category: [B]
  delivery: offline_both
  expected: After the target becomes V2/H2 a V1/H1 approval is invalid (review_target_changed); never silently revalidated or transferred.
  negative_controls: [same version different hash, same hash different version, hash prefix match]
  component: professional-review/policy#evaluateProfessionalReviewValidity
  evidence: validity.status=invalid, reason review_target_changed; stored record unchanged
- id: REV-08
  category: [S]
  delivery: offline_both
  expected: Credential unverified -> invalid; credential verifier unavailable -> unknown; never valid.
  negative_controls: [verifier throws, credential for another project, credential for another target kind]
  component: professional-review/policy#evaluateProfessionalReviewValidity
  evidence: status in {invalid, unknown} with professional_credential_* reason
- id: REV-09
  category: [S]
  delivery: offline_both
  expected: Assignment revoked/missing -> invalid; assignment source unavailable -> unknown; never valid.
  negative_controls: [assignment for another project, assignment for another reviewer]
  component: professional-review/policy#evaluateProfessionalReviewValidity
  evidence: reason review_authority_revoked|review_state_unavailable
- id: REV-10
  category: [S]
  delivery: deny_only
  expected: Unauthorized status/history read is 401/403/404 with no existence or payload disclosure.
  negative_controls: [unauthenticated, non-owner member, other Project owner]
  component: professional-review/http
  evidence: only 401/403/404 responses; no record payload
- id: REV-11
  category: [P]
  delivery: offline_both
  expected: Explicit invalidate sets state invalidated with a stable reason code; audit history preserved; later decisions refused.
  negative_controls: [invalidate without reason, double invalidate, approve after invalidate]
  component: professional-review/service#recordDecision
  evidence: prior decision retained; subsequent decision rejected
```

## 3. M4-007 system scenarios (`SYS-01` ... `SYS-18`)

| ID | Cat | Delivery | Expected frozen outcome | Required negative controls | Component |
|---|---|---|---|---|---|
| SYS-01 | B | synthetic_only | `NOT_READY` `engagement_missing`; unavailable source -> `UNKNOWN` `engagement_source_unavailable` | engagement of another Project; superseded engagement; unavailable source | managed-handoff/evaluator |
| SYS-02 | S | synthetic_only | `NOT_READY` `lawyer_assignment_missing`/`lawyer_assignment_revoked`; unavailable -> `UNKNOWN` | assignment on another Project; pending approval; non-lawyer staff member | managed-handoff/evaluator |
| SYS-03 | S | synthetic_only | `NOT_READY` `resource_disclosure_missing` even when M4-003 messaging consent exists | disclosure for another resource; expired disclosure; messaging-consent-only | managed-handoff/evaluator |
| SYS-04 | B | synthetic_only | `NOT_READY` `signature_unverified`; untrusted/unavailable authority -> `UNKNOWN` `signature_authority_unavailable` | signature on superseded agreement version; untrusted provider | managed-handoff/evaluator |
| SYS-05 | B | synthetic_only | `NOT_READY` `payment_required_unsatisfied` while the contract requires payment and no verified satisfaction exists | evidence pending; submitted but unverified; satisfied then reversed | managed-handoff/evaluator |
| SYS-06 | B | synthetic_only | `NOT_READY` `payment_reversed`/`payment_disputed`/`payment_void` | reversal on another condition; dispute downgraded by an unverified record | managed-handoff/evaluator |
| SYS-07 | B | synthetic_only | payment predicate evaluates to `NOT_REQUIRED` under an explicit contractual-basis code with no fabricated zero-amount payment; overall readiness driven by remaining predicates | NOT_REQUIRED without basis code; NOT_REQUIRED carrying an amount | managed-handoff/evaluator |
| SYS-08 | B | synthetic_only | `NOT_READY` `review_target_changed` after target version/hash change | hash change only; version change only | managed-handoff/evaluator |
| SYS-09 | S | synthetic_only | `UNKNOWN` `professional_credential_unavailable` or `NOT_READY` `professional_credential_unverified`; global lawyer role alone insufficient | global lawyer role only; credential for another project; expired credential | managed-handoff/evaluator |
| SYS-10 | S | deny_only | `DENY` for an unauthorized approver; production review authority denies every request | customer attempts approval; admin attempts approval; education-agent-only review | professional-review/authority + http |
| SYS-11 | S | synthetic_only | cross-Project or undisclosed protected material is not authorized and readiness is never `READY` | member of another Project; disclosure for a different resource version | managed-handoff/evaluator |
| SYS-12 | S | synthetic_only | revoked reviewer authority -> approval not valid -> `NOT_READY` `review_authority_revoked` | self-asserted revocation; revocation of another reviewer | managed-handoff/evaluator |
| SYS-13 | B,I | synthetic_only | concurrent revocation between snapshot and decision never yields `READY`; `UNKNOWN` `concurrent_revision_change` or `NOT_READY` | revision change on project/membership/engagement/agreement/target | managed-handoff/evaluator |
| SYS-14 | P | synthetic_only | exact replay idempotent; same operationId with changed semantic request rejected `idempotency_conflict` | different action; different target; different comment digest; different revision | professional-review/service |
| SYS-15 | S | synthetic_only | VIP subscription or M4-003 consent alone never establishes readiness | VIP entitlement fixture; messaging consent fixture | managed-handoff/evaluator |
| SYS-16 | B | synthetic_only | `READY` only with every predicate supplied by injected test-only adapters and the result marked synthetic (`evidenceProvenance=synthetic_test`) | any adapter withdrawn; any adapter unavailable | managed-handoff/evaluator |
| SYS-17 | O | deny_only | production (absent/deny-only) providers never produce `READY`; `UNKNOWN`/`NOT_READY` with stable reason codes | flag disabled; every port unavailable | managed-handoff/runtime |
| SYS-18 | I | offline_both | no behavioural regression for legacy chat or M4-002/003/004; no imports from serving/agent/Phase-6 paths; no M4-005 rule change; flags OFF | module-graph scan; migration/journal unchanged; deny-all authorities intact | integration scan + existing suites |

## 4. Evidence required per claim

| Claim | Required evidence |
|---|---|
| Business correctness | Observable evaluator/review outcome equals the frozen row |
| Authorization and security | Negative control yields the frozen denial/uncertainty outcome |
| Persistence and audit | Append-only history, revision CAS and operation idempotency proven behaviourally |
| Integration compatibility | Module-graph scan + unchanged migration/journal/flags + M4-002/003/004 regression suites green |
| Operational readiness | Production composition is deny-only; synthetic adapters unreachable from runtime |

Acceptance of this contract does **not** establish real professional credentials,
real signature authority, real payment verification, legal correctness of any
review, government/school acceptance, or production readiness.

## 5. Unresolved policy dependencies (frozen safe outcomes)

| ID | Missing policy | Frozen safe outcome |
|---|---|---|
| POL-01 | Real professional credential verification | `UNKNOWN` `professional_credential_unavailable` |
| POL-02 | Real signature-verification authority | `UNKNOWN` `signature_authority_unavailable` |
| POL-03 | Approved payment-validity authority (M4-005 frozen, functionally incomplete) | `UNKNOWN` `payment_state_unavailable` unless a trustworthy reader is injected |
| POL-04 | Real managed-application package provider (M5/M7/M8) | `NOT_READY` `target_provider_unavailable` / `target_kind_unsupported` |
| POL-05 | Customer-confirmation requirement policy | `UNKNOWN` `customer_confirmation_policy_unknown` when asserted as required without policy |
| POL-06 | Disclosure granularity for managed packages | `NOT_READY` unless the M4-004 disclosure contract supplies the exact resource |
| POL-07 | Submission-actor verification (future M5) | out of scope; result must be revalidated before any future submission |
