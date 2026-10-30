# Phase 13 M4 — Owner-Accepted Engineering Baseline and Deferred M5 School-Application Acceptance

**Decision date:** 2026-10-30 (Australia/Sydney)  
**Owner decision:** Accept the present M4 engineering baseline **with explicit blockers**; stop the M4 test/patch loop; defer the specified unsuccessful validations to a distinct, gated end-to-end acceptance stage **after M5 School Admissions workflow implementation**.  
**Disposition:** `PHASE13_M4_ENGINEERING_CLOSED_WITH_BLOCKERS / BASELINE_ACCEPTED_FOR_M5_DEVELOPMENT / LIVE_PRODUCTION_NO_GO`.  
**Branch:** `phase13-study-journey-project-centric`.  
**Code baseline when decision recorded:** local M4 changes remain uncommitted; remote branch at `3d5467193e161fe4359f2bbe69e3b0507d2fa156` before this documentation commit. The subsequent local implementation commit and push are a separate explicit owner action.  
**Supersedes for next-step planning:** any older time-local instruction implying that all M4 tests must be made green before M5 development can begin. **Does not overwrite or reclassify** the historical closeout, logs, failed assertions, or security restrictions.

## 1. Scope of acceptance (no false PASS)

The owner accepts **engineering progress and a stable development baseline**, not production readiness or full M4 functional certification.

- **M4-002 / M4-003:** retain prior isolated-PostgreSQL acceptances with limitations.
- **M4-004:** engagement/agreement/signature/disclosure implementation and prior accepted isolated tests are preserved; real signing authority and full positive school-submission chain are not certified.
- **M4-005:** Migration 0044 installed and schema/permissions validated in an isolated PostgreSQL 17 instance; payment/refund/correction positive-path validation remains incomplete; feature remains OFF and finance authority deny-only. Historical Stage 3B evidence: 29 pass, 12 fail, process timeout/cancelled; no retrospective reclassification.
- **M4-006:** Migration 0045 installed with 46-record ledger; durable review request/history, concurrency CAS and idempotency have passing PostgreSQL evidence. Exact approval persistence, authority revocation validity and selected database post-condition assertions remain unverified due to shared-fixture/harness failures.
- **M4-007:** deterministic readiness and conservative absence/UNKNOWN paths have offline and some database evidence; full production READY is impossible by construction with currently unavailable professional credential, signature/payment verification, customer-confirmation policy and package provider.
- **Final M4 isolated validation:** 17 scenarios ran, **12 PASS / 5 FAIL**, exit 1. Failed: `INT-06`, `INT-07`, `INT-12`, `DB-01`, `DB-02`. Migration 0045 and its database installation passed. The five failures are **not accepted as passes**.
- **Production:** `NO_GO`; all relevant feature flags OFF and production authority adapters deny-only. No actual external school submission, fee transaction, signing, licensing assertion or genuine application receipt is authorized by this decision.

**Artifact provenance:** the authoritative M4 closeout is `docs/agent-memory/tasks/PHASE13_M4_FINAL_CLOSEOUT_2026_10_30.md` in the local implementation worktree; the latest run's sanitized logs were reported at `/tmp/phase13-m4-final/harness.sanitized.log` and `/tmp/phase13-m4-final/migrate.sanitized.log`. Logs on the developer machine are evidence, not asserted to be committed. The recorded final-run migration hash for 0045 is `1f50752a19df80a538ce50a58e47d852c3373881a133bb3ebe3e556fff8f11ac`; 0044 remains `d90ebf497dd049cb4f6fc221d2129639714028849a819e7dbb6e5b32a6146f0e`.

## 2. Deferred validations: explicit traceability

**Do not delete, skip silently, relabel PASS or patch tests only to manufacture green results.** Defer diagnosis and outcome adjudication until M5's separate School-Application End-to-End Acceptance stage.

| Deferred ID | Source / previous evidence | Required future proof |
| --- | --- | --- |
| M4-FINAL-INT-06 | Approval version/hash test failed from reused `changes_requested` fixture | Fresh independent authorized approval workflow from requested through in_review to approved, persisted exact version/hash |
| M4-FINAL-INT-07 | Dependent on INT-06's missing approved record | Independent approved record followed by assignment/authority revocation: approval no longer valid |
| M4-FINAL-INT-12 | Concurrent revision expected UNKNOWN but obtained fail-closed NOT_READY | Frozen business-precedence contract: verify no stale READY; assess status semantics without weakening definitive denial |
| M4-FINAL-DB-01 | UPDATE/DELETE append-only probes rejected as intended; final fixed row-count expectation failed | Isolated append-only negative probes, dynamic history count and unchanged audit chain |
| M4-FINAL-DB-02 | Three illegal transition probes rejected; fixture-head constant mismatched | Independent transaction/invariant probes and unchanged head/revision after failed mutations |
| M4-005-STAGE3B | Prior 29 PASS / 12 FAIL, process exit 124 | Targeted contractual payment condition, evidence, reversal/refund, correction and authority behavior when M5 managed submission needs these states; normal runner cleanup/exit |
| M4-005-OFFLINE-JOURNAL | Six preexisting head/entry-count assertions became stale after additive 0045 | Adapt only test infrastructure to the current migration journal; preserve payment business invariants |
| CROSS-MODULE | Current provider/credential/signature/payment policy unresolved | Exact-version review, permission revocation, contract/payment/currentness and provider provenance end-to-end; fail-closed where policy remains unavailable |

Historical failures remain open **with evidence**, and may be retired only by a later independently recorded verification outcome. This acceptance does not authorize any immediate repair or rerun.

## 3. M5 School Admissions workflow: authorized development boundary

M5 may begin **development** of the school-application feature according to `docs/agent-memory/PHASE13_STUDY_JOURNEY_ROADMAP.md` and the M4 frozen contracts. This decision does **not** authorize unsupervised external submission, real provider I/O, production deployment, new DB migration or changes to frozen M4 authorities; those require their own scoped approval.

M5 development should cover, subject to a separately approved implementation task:

1. Multiple isolated school applications within one Project (at least three concurrent schools); school/intake/course identity and source provenance.
2. Versioned per-school facts, documents, requirements, applicability/verification, application-package snapshots and change invalidation.
3. AI-assisted eligibility and preparation with explicit uncertainty; no invented eligibility, admission or fee assertions.
4. Distinct **Self-Service** vs **Managed Service** preparation, notices, permissions and transitions. VIP subscription does not imply managed-service entitlement.
5. Per-school exact-version professional review request/decision and customer authorization where policy requires; no generic lawyer role as approval proof.
6. Conditional pathways: no offer, existing offer, received offer, CoE or approved exception; real third-party receipt/offer/CoE must have provenance, never be synthesized as genuine.
7. Future approved external submission/receipt ports with default DENY / not_connected until separate owner authorization. No direct real school submission in this scope.

**Developer gating rule:** M5 can implement and test its own preparation/workflow features while M4 limitations are outstanding. **Do not allow any managed external school submission, production READY, professional-approval claim, binding payment assertion or real receipt issuance** using an unverified M4 capability. Every uncertain upstream prerequisite remains `NOT_READY` or `UNKNOWN`. Self-Service must not masquerade as professionally reviewed; any genuine self-submission exposure remains separately policy/authorization-gated.

## 4. One separate post-M5 school-application E2E acceptance stage

After M5 application functionality is implemented, hold a **separate, expressly authorized and frozen-contract end-to-end test stage** before any external school submission or production activation.

That stage combines:
- **M5 business scenarios:** at least three concurrent school applications, per-school identity/isolation, exact package version/hash, requirements, disclosures, document/source provenance, school response/offer/CoE paths, and distinct self/managed modes.
- **M4 deferred assertions:** independent, isolated and order-insensitive replay of INT-06, INT-07, INT-12, DB-01, DB-02 and the M4-005 payment-validation cases relevant to actual managed submission.
- **Hard safety negatives:** unauthorized staff, missing or revoked approval/disclosure, changed package version, invalid signature/payment/credential, stale project/member/assignment/engagement, concurrent revocation, and no fake external receipt.
- **Operational proof:** known-good isolation, exact migration ledger/hash, transaction integrity, sanitized evidence, bounded test runtime, graceful connection cleanup and zero hidden SKIP for mandatory scenarios.

Freeze inputs/outcomes **before** E2E execution. A test infrastructure defect is recorded separately from a product/security defect. Do not alter required negative expectations after running solely to achieve PASS.

### Explicit stopping/decision rule

Run the E2E stage only under a separate owner authorization with a declared disposable environment and bounded attempts. If required security/business gates fail, **release remains BLOCKED**; record evidence and decide whether to defer, redesign or authorize a discrete remediation. Do not automatically reopen the old M4 micro-patch loop.

The E2E stage may certify implemented/synthetic workflows only to the degree actually exercised. **Real-world provider/legal/payment/signature/credential policy approvals are separate prerequisites** for production and any external submission, regardless of synthetic E2E outcomes.

## 5. Git and milestone handoff

1. Preserve the uncommitted M4 implementation files and existing `PHASE13_M4_FINAL_CLOSEOUT_2026_10_30.md`.
2. Commit the existing local M4 changes once, after staged-file review and secret checks.
3. Incorporate this documentation commit via a normal fetch + rebase/fast-forward (never hard reset or force push) so local M4 code and owner acceptance coexist on the same feature branch.
4. Push `phase13-study-journey-project-centric`, verify remote HEAD and clean worktree.
5. Start M5 **on a new branch based on the pushed M4 baseline** with an explicit school-admissions implementation scope; do not silently merge M4 into production.

**End state:** `M4 ENGINEERING CLOSED_WITH_BLOCKERS / OWNER ACCEPTS BASELINE FOR M5 DEVELOPMENT / POST-M5 E2E DEFERRED / LIVE_PRODUCTION NO_GO`.
