# Phase 13 M4 — PERSISTENT INTEGRATION ACCEPTANCE CONTRACT (2026-10-30)

**Status:** `FROZEN` — written before implementation. It **adds to** and does not weaken
`PHASE13_M4_006_007_FROZEN_ACCEPTANCE_CONTRACT.md` (11 `REV-*`, 18 `SYS-*`).

**Scope of this round:** durable M4-006 persistence, one consistent read-only M4-007
snapshot, and the authoritative-data resolutions that the offline foundation left open.
No migration execution, no database contact, no M4-005 repair.

| Item | Value |
|---|---|
| Branch / HEAD | `phase13-study-journey-project-centric` / `3d5467193e161fe4359f2bbe69e3b0507d2fa156` |
| Worktree | 63 uncommitted paths at start |
| Journal head at start | idx 44 · `0044_phase13_m4_005_service_payment` · `when=1793258050571` → next is **0045** |
| Frozen M4-005 | Migration 0044 SHA-256 `d90ebf497dd049cb4f6fc221d2129639714028849a819e7dbb6e5b32a6146f0e`; `DATABASE VALIDATED / FUNCTIONAL VALIDATION INCOMPLETE / FEATURE OFF` |
| Feature flags | all Phase 13 flags OFF |

## 1. Source-of-truth mapping (frozen)

| Domain | Authoritative source | Absent (definitive) | Unavailable/untrusted (indeterminate) | Positive result allowed? |
|---|---|---|---|---|
| Project | `StudyJourneyProject.status/revision` | `project_not_found` → NOT_READY | `project_state_unavailable` → UNKNOWN | yes (status=active) |
| Customer membership | `ProjectMembership` (owner = `StudyJourneyProject.ownerUserId`) | `membership_missing`/`actor_not_authorized` → NOT_READY | `membership_unavailable` → UNKNOWN | yes (owner or active membership) |
| Membership expiry | **no persisted expiry column exists** | n/a | never inferred; `expiresAt` reported as `null` and documented as not-persisted | yes, without an invented expiry |
| Lawyer assignment | `ProjectStaffAssignment` (`purpose='project_staff_collaboration'`, `assignmentRole='lawyer'`) | `lawyer_assignment_missing` → NOT_READY | `lawyer_assignment_unavailable` → UNKNOWN | only `status='active'` |
| Engagement | `ServiceEngagement` (live row: `status <> 'terminated'`) | `engagement_missing`/`engagement_superseded` → NOT_READY | `engagement_unavailable` → UNKNOWN | only `status='active'` **and** `serviceMode='managed'` |
| Engagement scope | `ServiceEngagement.scopeCodes` ⊆ `{school_admissions, student_500_visa}` | `engagement_scope_mismatch` → NOT_READY | — | only when the target kind's scope is present |
| Agreement | `ServiceAgreementVersion` + `ServiceAgreementAcceptance` for `ServiceEngagement.currentAgreementVersionId` | `agreement_missing`/`agreement_not_accepted` → NOT_READY | `agreement_unavailable` → UNKNOWN | only `status='issued'`, accepted, `termsSha256` equal |
| Signature | `ServiceSignatureEvidence` for that exact agreement version + terms hash | `signature_missing`/`signature_unverified` → NOT_READY | `signature_authority_unavailable` → UNKNOWN | only `verificationStatus='verified'` under a trusted authority policy |
| Resource disclosure | `ProjectResourceDisclosureGrant` for `resourceCategory='engagement_record'`, the exact engagement id/version and `purposeCode='service_delivery'`, recipient = reviewing staff | `resource_disclosure_missing`/`resource_disclosure_expired` → NOT_READY | `resource_disclosure_unavailable` → UNKNOWN | only `status='granted'`, unexpired, fingerprint present |
| Payment | Frozen M4-005 rows (`ServicePaymentCondition`/`Evidence`/`Resolution`) read through `evaluateServicePaymentFacts` | `payment_condition_missing`/`payment_required_unsatisfied`/`payment_evidence_pending`/`payment_disputed`/`payment_reversed`/`payment_void` → NOT_READY | `payment_state_unavailable` → UNKNOWN | **no** positive assertion in production — see §3 |
| Professional review | New `ProfessionalReviewRequest` + `ProfessionalReviewRevision` (this round) | `review_missing` → NOT_READY | `review_state_unavailable` → UNKNOWN | only a persisted `approved` revision whose exact target still matches |
| Professional credential | `ProfessionalCredentialVerifier` port (production: unavailable) | `professional_credential_unverified` → NOT_READY | `professional_credential_unavailable` → UNKNOWN | **never** in production (no registry integration) |
| Application package | `ManagedTargetProvider` (production: unavailable) | `target_not_found`/`target_kind_unsupported`/`target_metadata_untrusted` → NOT_READY | `target_provider_unavailable` → UNKNOWN | **never** in production (no M5/M7/M8 provider) |
| Customer confirmation | `CustomerConfirmationPolicy` port (production: unresolved) | `customer_confirmation_missing` → NOT_READY | `customer_confirmation_policy_unknown` → UNKNOWN | only when an authoritative policy states `not_required` or `required+confirmed` |

## 2. Adapter obligations (binding for every adapter above)

1. **Scope**: every read is scoped by the exact authenticated `projectId` and, where applicable, `actorUserId`; no adapter may widen admin/lawyer reach.
2. **Ownership**: the adapter that owns the table performs its own authority check; the evaluator never re-derives authority from a projection.
3. **Currentness**: revisions come from the owning row (`project.revision`, `engagement.revision`, `assignment.lastProjectRevision`, `review.revision`) or, where no revision exists (`ProjectMembership`, `ProjectResourceDisclosureGrant`), the row identity is used and reported as an identity, never as a fabricated number.
4. **Provenance**: each observation carries the opaque source reference used in `evidenceRefs`; no document content, bank reference, agreement text or review note text.
5. **Absent vs unavailable**: `missing`-class states are definitive NOT_READY; `unavailable`-class states are UNKNOWN. A missing row never becomes `unavailable` and vice versa.
6. **Positive capability**: an adapter may return a positive only when the frozen condition in §1 is satisfied *and* its own authority policy is approved. Otherwise it must return `unavailable`.
7. **Redaction**: results carry opaque references only (`engagement:<uuid>`, `agreement:<uuid>`, `professional-review:<uuid>`, `payment-condition:<uuid>`, `disclosure:<uuid>`), never content.
8. **Read-only**: M4-007 adapters issue SELECTs only. No adapter writes, repairs, expires or normalises authoritative data.

## 3. Resolved contract issue A — engagement scope (was provisional, now authoritative)

The earlier constant `managed_application_handoff` **does not exist** in the M4-004 schema.
`ServiceEngagement.scopeCodes` is CHECK-constrained to a subset of
`{school_admissions, student_500_visa}` and `serviceMode` to `{self_service, managed}`.

**Frozen resolution:**

```yaml
scope_by_target_kind:
  managed_school_application: school_admissions
  student_500_visa_application: student_500_visa
required_engagement_service_mode: managed
unknown_target_kind_result: NOT_READY engagement_scope_mismatch
missing_scope_result: NOT_READY engagement_scope_mismatch
wrong_service_mode_result: NOT_READY engagement_service_mode_mismatch
```

No invented scope value may ever be accepted; an unknown target kind cannot map to a scope
and therefore cannot be READY.

## 4. Resolved contract issue B — customer confirmation (caller input is not authority)

A caller-supplied `customerConfirmation` field is **removed** from the evaluation payload. The
requirement and the evidence come from two distinct, authoritative observations:

| Observation | Meaning | Result |
|---|---|---|
| `not_required` | an approved policy states no customer confirmation is needed | pass |
| `required_and_confirmed` | policy requires it and a recorded confirmation exists | pass |
| `required_not_confirmed` | policy requires it, no recorded confirmation | NOT_READY `customer_confirmation_missing` |
| `policy_unknown` | no approved requirement policy exists (production today) | UNKNOWN `customer_confirmation_policy_unknown` |
| `unavailable` | the policy/confirmation source cannot be read | UNKNOWN `customer_confirmation_policy_unknown` |

`null` is never proof that confirmation is unnecessary. Production supplies no policy, so this
predicate always yields UNKNOWN and a production READY is impossible on this predicate alone.

## 5. M4-006 persistence contract (frozen)

Two tables, minimal and purpose-built — no generic workflow engine.

- `ProfessionalReviewRequest` — immutable identity: `id`, `projectId`, target kind/id/version/SHA-256,
  `targetBindingSha256`, `reviewPurpose`, `reviewScope`, plus the **controlled current projection**
  `state`, `revision`, `reviewerUserId`, `authorityCode`, `credentialCode`, `requestSha256`,
  `operationId`, `requestedByUserId`, `requestedAt`, `updatedAt`, `invalidatedAt`,
  `invalidationReasonCode`.
- `ProfessionalReviewRevision` — **append-only** history: one row per accepted action with
  `reviewRequestId`, `revision`, `state`, `action`, `operationId`, `requestSha256`,
  `decidedByUserId`, `decidedAt`, `boundTargetVersion`, `boundTargetSha256`, `authorityCode`,
  `credentialCode`, `commentSha256`, `reasonCode`.

**Database-enforced invariants (not in-process mutexes):**

1. `projectId` FK → `StudyJourneyProject.id` (restrict) ⇒ cross-Project isolation.
2. `requestedByUserId` / `reviewerUserId` / `decidedByUserId` FK → `User.id` (restrict).
3. `ProfessionalReviewRevision.reviewRequestId` FK → `ProfessionalReviewRequest.id` (restrict, cascade-free).
4. `unique (projectId, operationId)` — one operation id per Project, so an operation id can never be
   reused across Projects and a duplicate insert is a database conflict.
5. `unique (reviewRequestId, revision)` — a revision number can never be written twice.
6. `unique (reviewRequestId, operationId)` — exact replay returns the stored row; a changed request
   under the same operation id is rejected by hash comparison inside the same transaction.
7. `CHECK revision > 0`, `CHECK cardinality(reviewScope) between 1 and 4` with scope ⊆ the four accepted codes,
   `CHECK targetSha256/targetBindingSha256/requestSha256 ~ '^[0-9a-f]{64}$'`, `CHECK state in (...)`.
8. Trigger `ProfessionalReviewRevision_append_only_guard` — rejects UPDATE and DELETE on the revision table.
9. Trigger `ProfessionalReviewRequest_projection_guard` — on UPDATE requires `revision = old.revision + 1`,
   immutable target binding, and a transition present in the frozen graph; on DELETE raises.
10. Optimistic concurrency is `SELECT … FOR UPDATE` on the request row inside one transaction, then CAS on
    `revision`; two concurrent writers cannot both advance the same revision.
11. Any failure rolls the whole transaction back: no revision row without its request projection update and
    vice versa.

**In-memory store** stays test-only. It is never wired into `runtime.ts` and is not durable persistence.

## 6. M4-007 snapshot consistency contract (frozen)

- One `loadManagedHandoffSnapshot({ projectId, actorUserId, targetKind, targetId })` call reads every
database-backed predicate inside **one** transaction at `repeatable read`, issuing SELECTs only.
- The deterministic evaluator is **not** replaced: the snapshot is converted into the existing
  `ManagedHandoffPorts` contract by a pure function, so business rules stay in `evaluator.ts`.
- The snapshot also records the observation revision vector actually seen, so the result's
  `revalidationToken` binds real observed values.
- Post-query re-reads of Project and Engagement revisions inside the same snapshot are compared; a change
  observed during evaluation yields `concurrent_revision_change` (UNKNOWN) and can never be READY.
- The snapshot is an **assessment input**, not durable permission. It is never cached as an entitlement.
- No adapter in this round can return a positive for: payment validity, professional credential,
  application package, customer-confirmation policy.

## 7. TOCTOU and revalidation contract (frozen)

`revalidationToken = SHA-256(canonicalJson({ projectId, actorUserId, target{kind,id,version,hash},
paymentPredicate, status, reasonCodes, checkedRevisions, policyVersions }))` where
`checkedRevisions` is the full observed vector:

| Field | Source | When unavailable |
|---|---|---|
| `project` | `StudyJourneyProject.revision` | `null` |
| `membership` | `ProjectMembership.id` (identity — no revision column exists) | `null` |
| `assignment` | `ProjectStaffAssignment.lastProjectRevision` + assignment id | `null` |
| `engagement` | `ServiceEngagement.revision` | `null` |
| `agreement` | current agreement version id + `termsSha256` | `null` |
| `disclosure` | live grant id (identity) | `null` |
| `payment` | live condition id | `null` |
| `review` | persisted `ProfessionalReviewRequest.revision` | `null` |
| `target` | `<kind>:<id>@<version>:<sha256>` from the provider | `null` |
| `policyVersions` | M4-006 review, M4-007 handoff, M4-005 payment policy versions observed | always present |

A future M5 submission MUST re-load and re-evaluate inside its own protected transaction immediately before
any state change and compare the token; a cached green result is never sufficient. This read-only gate does
**not** claim to eliminate every race. M5 is not implemented here.

## 8. Added acceptance scenarios (`INT-*`)

These extend the frozen `REV-*`/`SYS-*` sets and are proven offline unless marked otherwise.

| ID | Scenario | Expected | Evidence |
|---|---|---|---|
| INT-01 | Review request survives a new connection/session | request + revisions readable with identical identity | DB-authorized harness only (offline: plan + schema contract) |
| INT-02 | Immutable history reconstructable | every revision row present, ordered, append-only trigger present | offline structure + DB harness |
| INT-03 | Concurrent decisions at the same revision | exactly one wins; loser `revision_conflict` | offline planner + DB harness |
| INT-04 | Exact replay creates no duplicate audit row | `replayed=true`, row count unchanged | offline planner + DB harness |
| INT-05 | Changed replay rejected | `idempotency_conflict`, no new row | offline planner |
| INT-06 | Approval V1/H1 not valid for V2/H2 | `review_target_changed` | offline (existing REV-07) + snapshot |
| INT-07 | Revoked assignment invalidates review validity | `review_authority_revoked` | offline snapshot mapping |
| INT-08 | Real read model projects Project/Engagement state | ports produced from a snapshot equal the authoritative values | offline snapshot→ports mapping |
| INT-09 | Undisclosed private resource not authorized | `resource_disclosure_missing` / not-authorized | offline mapping + DB harness |
| INT-10 | Customer-confirmation policy unavailable | UNKNOWN `customer_confirmation_policy_unknown` | offline |
| INT-11 | Unapproved signature/payment/credential sources cannot make READY | UNKNOWN/NOT_READY, never READY | offline |
| INT-12 | Concurrent revision change not promoted into permission | UNKNOWN `concurrent_revision_change` | offline |
| INT-13 | Synthetic all-positive path | READY, `evidenceProvenance=synthetic_test` | offline |
| INT-14 | Production composition | never READY | offline |
| INT-15 | M4-002/003/004 unaffected | their suites still green; no behavioural code touched | offline |
| INT-16 | M4-005 Stage 3B failures remain unresolved | 29/41 recorded, not rerun, not counted as passing | record only |

## 9. Awaiting separate database authorization

- Applying Migration 0045 and verifying its constraints/triggers/grants live.
- INT-01, INT-02 (live rows), INT-03/INT-04/INT-05 under real concurrent sessions,
  INT-08/INT-09 against a seeded isolated PostgreSQL 17 instance.
- Any claim that M4-006 is durable in a real deployment, or that M4-007 integrates real authoritative
  state end to end.

Prepare the harness in this round; **do not execute it**.
