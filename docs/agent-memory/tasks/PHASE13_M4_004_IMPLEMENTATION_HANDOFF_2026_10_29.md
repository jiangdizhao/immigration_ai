# Phase 13 M4-004 — implementation handoff (offline, fail-closed)

**Recorded:** 2026-10-29, Australia/Sydney
**Branch:** `phase13-study-journey-project-centric`
**Implementation base HEAD:** `b64b201536e23e79cd8e9e7be6909328237c40e3`
**Disposition:** IMPLEMENTED / UNCOMMITTED / **PENDING INDEPENDENT REVIEW**. This document is an advisory implementation record, not an acceptance. Acceptance belongs to the independent reviewer and project owner.
**Parent authority:** ../PHASE13_STUDY_JOURNEY_ROADMAP.md; ../PHASE13_M4_ARCHITECTURE_PROPOSAL_2026_10_27.md; [M4-004–007 unified implementation plan](./PHASE13_M4_004_007_UNIFIED_IMPLEMENTATION_PLAN_2026_10_29.md); ../../../AGENTS.md; ../DECISIONS.md.

## 1. Scope delivered

M4-004 only: service engagement, immutable versioned agreements with signature-evidence plumbing, and customer-to-staff protected resource disclosure. M4-005 (payment attestation), M4-006 (professional review), M4-007 (managed-handoff gate) are **not implemented**; only typed boundary placeholders exist in documentation. Live/production remains **NO_GO** and the feature flag defaults OFF.

## 2. Authority boundaries (implemented, deny-by-default)

| Capability | Production authority | Result today |
| --- | --- | --- |
| Engagement draft creation | current Project owner (server-derived) | allowed when flag+schema exist |
| Agreement authoring/issuance | `denyAllServiceAgreementIssuanceAuthority` | always denied (403) |
| Signature evidence verification | `denyAllServiceSignatureEvidenceVerifier` | always unavailable (503); evidence stays `pending` |
| Managed activation | requires `verified` signature evidence for the exact current version | unreachable in production |
| Self-service activation | requires accepted current version only | reachable in production (no professional claim) |
| Protected resource resolution | `unsupportedProjectResourceDisclosureResolver` | always unavailable (409); no grant can be created |
| Disclosure evaluation | pure deterministic evaluator | ALLOW only when every predicate holds |

No global `admin`/`lawyer` role, M4-002 assignment, M4-003 thread consent, M2 AI-context grant, VIP tier, chat message or AI output can create an engagement, acceptance, verified signature or disclosure grant.

## 3. Data model (Migration 0043, additive)

`ServiceEngagement`, `ServiceAgreementVersion`, `ServiceAgreementAcceptance`, `ServiceSignatureEvidence`, `ProjectResourceDisclosureGrant`, plus 12 typed operation types, 5 result kinds, 13 event types and 5 subject kinds coordinated in the existing `ProjectOperation`/`ProjectEvent` CHECK allowlists, one new event-subject binding CHECK, 33 table CHECK constraints, 22 indexes (six partial), five append-only guard triggers and one deferred operation-completeness constraint trigger.

Lifecycle: `draft → awaiting_customer_action → active → suspended ↔ active → terminated`; agreement `draft → issued → superseded`; signature `pending → verified|rejected`; disclosure `granted → revoked|expired`. Each M4-004 operation advances the Project revision once and emits exactly one typed event.

## 4. Unresolved policy (fail closed, deliberately not invented)

Signature provider, identity binding, legal enforceability and retention; contract-operator/delegation authority; protected-resource source adapters and per-resource sharing granularity; whether any self-service activation should exist at all. Each is expressed as an injected port with a deny-by-default production implementation.

## 5. Deliberate limitations

- No protected content is served: `read_content` always denies and no Fact/Document/Chat endpoint was connected.
- M4-003 thread consent and M2 grants are structurally absent from the disclosure evaluator input.
- The staff view of an engagement is metadata-only (no terms, acceptance or evidence).
- Migration was authored and statically validated only; it was **not executed**.

## 6. Validation evidence and its limits

| Area | State |
| --- | --- |
| Offline unit suite for M4-004 (`pnpm test:phase13:m4-004:offline`) | 39/39 pass |
| M4-004 guard suite (`pnpm test:phase13:m4-004:guard`) | 3/3 pass |
| M4-002 guard + M4-003 offline/guard regression | 13 + 27 + 13 pass |
| `drizzle-kit check` | clean |
| `tsc --noEmit` | 0 errors in M4-004 files; 44 pre-existing errors in 9 untouched test files |
| Real PostgreSQL migration/integration | **NOT EXECUTED** (harness and exact commands prepared) |
| Signature/legal validity, professional authority, content access | **NOT VERIFIED** |
| Staging/production | **NOT TESTED** |

## 7. Two intentional edits outside the new module

Appending migration 0043 necessarily invalidated two pre-existing "journal tail is 0042" assertions. Both were changed to pin the 0042 entry by index (intent preserved, no authorization logic touched):

1. `lib/project-human-messaging/schema-contract.test.ts` — 0042 entry lookup instead of `entries.at(-1)`.
2. `scripts/phase13-m4-003-db-test-guard.ts` — locate entry index 42 and accept a longer journal; the M4-003 DB ledger assertion is unchanged.

`lib/education-intelligence/schema-contract.test.ts` still asserts a 0040 journal tail and was already failing at the implementation base HEAD; it was **not** modified.

## 8. Next action

Independent review of the uncommitted patch, then owner decision on unresolved policy before any flag enablement, migration execution or protected-resource integration.
