# Phase 13 M4-004–007 — Unified implementation and integration plan

**Recorded:** 2026-10-29, Australia/Sydney
**Branch:** phase13-study-journey-project-centric
**Planning baseline:** 8af7848e435c52c86540846c24e7a50382d35d46 (M4-003 26-path implementation already pushed)
**Disposition:** DETAILED IMPLEMENTATION PLAN RECORDED / NOT DISPATCHED. This record approves documentation of a consolidated future work package, **not** Codex coding, database access/migration, customer data handling, third-party integration, production enablement or deployment.
**Parent authority:** ../PHASE13_STUDY_JOURNEY_ROADMAP.md (existing M4, without renumbering M0–M10); ../PHASE13_M4_STAFF_COLLABORATION_WORKBREAKDOWN_2026_10_27.md; ../PHASE13_M4_ARCHITECTURE_PROPOSAL_2026_10_27.md (parts still proposed); ../../../AGENTS.md; ../DECISIONS.md (D-P13-016 through D-P13-019).
**Reviewer boundary:** Owner decides policy and scope; ChatGPT reviews source/tests; Codex implements a single bounded integrated patch only after separate dispatch. Legal/professional/privacy/signature-provider policies are not certified by this plan.

## 1. Why one integrated development round

M4-001 architecture audit is accepted. M4-002 named-lawyer assignment and M4-003 consented human Project messaging are DATABASE VALIDATED / ACCEPTED_WITH_LIMITATIONS in separately owner-authorized isolated PostgreSQL tests. Their role/assignment/message consent boundaries are already established. M4-003's implementation commit 8af7848 was pushed after the earlier acceptance records that described the 26-path patch as local; those statements remain historical and must not guide current Git operations.

Develop **M4-004 Engagement + contract/consent/disclosure**, **M4-005 staff-attested offline payment condition**, **M4-006 scoped professional review/approval**, and **M4-007 integration + fail-closed M5 handoff** as **one cohesive implementation/review batch**, not four separate Codex sessions or separate mini-milestone gates. Internally the implementation may be organized in domain modules, but its contracts, database migration sequence, authorization and integration tests must be designed together.

Outcome: a durable, auditable Project service relationship that cannot be manufactured by model output, casual chat, admin global role, a VIP subscription, or stale authorization. It must not yet submit school or visa applications.

## 2. Frozen inherited invariants; no accidental expansion

1. Project, Chat, LegalMatter, service engagement, staff assignment, human thread, professional review and VIP billing have different IDs and scopes. Standalone Chat and legacy lawyer consultations/reviews continue untouched.
2. M4-002 Option A: admin proposes a named verified-email lawyer for an exact Project/purpose; actual customer owner expressly approves; that same lawyer accepts. Admin has no implied customer file/chat access. Current lawyer role/email checks identify an account, not a verified practitioner qualification.
3. M4-003 thread-specific consent permits human conversation **only**. It never authorizes viewing protected Project Facts, Documents, member/private AI Chats, agreements, or review materials. M4-004 requires separate resource-class/purpose/version disclosure decisions.
4. M2 facts/document AI-context grants and extraction are independent of customer-to-staff disclosure. Resource owner controls any required disclosure; an owning Project account cannot silently disclose another member's private material. No cross-Project, cross-owner or cross-member access via association alone.
5. Closed Project, expired/revoked membership, revoked assignment/consent, stale terms or target versions, incompatible actor role/scope, and uncertain professional authority must fail closed. Recompute at the server boundary and under appropriate transaction locks before persisted mutations. Keep append-only historical provenance.
6. Managed school-package and Student 500 package submission require **identified authorized lawyer review of the exact package version** under the accepted Phase 13 roadmap. Education representative review may supplement but cannot replace lawyer review. Neither AI output nor User.role=lawyer alone establishes real professional qualification.
7. Self-Service differs from Managed Service: personal self-submission may later be supported with accurate notices; it must not be labeled lawyer-approved. Neither route permits this M4 implementation to send external applications.
8. No production/staging activation, real payments, real signature-provider operations, real customer documents, or authority certification under this document. Phase 13 LIVE/PRODUCTION NO_GO; feature flags default OFF.

## 3. Unified data and authorization contract (candidate schema, to validate against latest source before coding)

Reuse existing ProjectOperation/ProjectEvent, expectedRevision/CAS, immutable versions and existing M4-002/M4-003 repositories. Add only the minimum necessary entities; final SQL names and migration number are **candidates**, not yet frozen:

| Domain candidate | Immutable identity / minimum fields | Owner / writer | Validity and protection |
| --- | --- | --- | --- |
| ServiceEngagement | projectId; engagementId; managed/self-service intent; exact authorized service scope (school(s), Student 500 or explicit combination); status and revisions; contract links | customer owner + separately eligible service operator, according to accepted transition | no active managed entitlement without genuine contract/consent; never derived from VIP |
| AgreementVersion | engagementId, versionId, canonical terms hash and source, version, notice/scope, effective/replaced time | trusted contract operator; customer views only own authorized version | immutable version; amendment is replacement, not in-place edit |
| SignatureEvidence | exact agreement version/hash, signing actor/identity, evidence/ref/hash, timestamp, verification method and status | verified signing evidence receiver or explicitly authorized manual evidence verifier | unverified/pending/failed evidence cannot produce signed state; provider/legal enforceability policy unresolved |
| ProjectResourceDisclosureGrant | projectId; owner of resource; exact recipient/active assignment; data class, purpose, item/version selector; allow/deny, validity, event/revocation | actual authorized resource owner; not admin or AI | distinct from AI grants and M4-003 thread consent; no wildcard Project/private-chat sharing |
| ContractPaymentCondition + PaymentAttestation | engagement/contract conditionId, amount/currency if required, external reference digest and evidence method; attesting staff actor/time; verified/void/corrected lineage | staff with explicit finance-attestation authority | never customer/AI-confirmed; append-only correction, refunds/reversals invalidate satisfaction |
| ProfessionalReview / ApprovalDecision | projectId; exact target kind/id/version and canonical hash; scoped decision; reviewer account and independently checked professional-authority reference; decision evidence/time, invalidation lineage | assigned reviewer with action-specific verified authority | only valid for exact immutable package; material revision/role/revocation makes stale |
| ManagedHandoffAssessment | read-only evaluated snapshot of required conditions, reason codes, supporting record IDs and checked revisions | deterministic server evaluator | **not** evidence of real submission or lawyer approval; independently recompute at downstream action |

Do not instantiate this table wholesale without reviewing the M4-001 as-is audit and current source. Prefer existing suitable tables; record any deliberate exclusions. Only actual Project/customer/resource identities from server persistence are authoritative. Browser-supplied projectId, consent flags, roles or approval booleans are never authorization proof. Consider semantic revocation and resource-version changes in indexes, uniqueness and foreign keys. New migrations must be additive and journaled, after verifying current head is 0042; do **not** assume a specific next migration identifier without checking the journal.

## 4. M4-004 — Engagement, versioned contract, explicit consent and disclosure

**Business flow (managed):**
a) Open an engagement draft for an authorized Project and a precisely described service scope, without automatic entitlement.
b) Issue immutable service agreement version and customer-facing notices; the customer accepts that exact version and express service scope.
c) Record authentic signature evidence for the named signatory and matching version/hash, independently of AI/user free-text; pending/unverified evidence stays pending.
d) Authorize only named scope-limited professional collaboration and specific protected-resource disclosures (purpose, recipient, owner, data class, resource/version), independently from M4-003 message participation.
e) Revoke/expire disclosure; replace agreement version; terminate/cancel engagement with immutable history and downstream invalidation.

**Proposed states (not implementation authority):** engagement DRAFT → AWAITING_CUSTOMER_ACTION → ACTIVE only after verified conditions, then SUSPENDED / TERMINATED; agreement DRAFT → ISSUED → SUPERSEDED; signature PENDING → VERIFIED / REJECTED / REVOKED; disclosure GRANTED → REVOKED / EXPIRED. Never implement ambiguous “signed=true” based on UI clicks.

**Interfaces:** bounded customer own-engagement read/accept/consent/disclosure endpoints; narrowly authorized staff agreement issuance/evidence verification; server-side allow/deny disclosure decision by exact resource. No raw third-party signing API integration until provider, evidence source, identity binding, privacy and legal effect are approved. A dry-run manual evidence import path, if included, must be explicitly marked synthetic/not legally attested.

**Failure tests:** wrong agreement hash, previous version, stale terms, forged signature payload, user/member impostor, unauthorized admin, thread consent without data consent, revoked assignment while reading, cross-Project/other-member file, consent revocation during write, retry/replay and competing agreement replacement all deny or preserve immutable history.

## 5. M4-005 — Staff-attested payment conditions outside Stripe VIP

**Business flow:** Define whether the **engagement contract** requires a service payment before managed handoff. For a required condition, staff with verified finance scope records independent external evidence (reference digest/amount/currency/time as applicable) and attests to it; apply a documented verification protocol. State can move from unsatisfied to satisfied only on accepted evidence; refund, correction, dispute, reversal, contract change or authority revocation causes recalculation or invalidation.

**Candidate states:** REQUIRED_UNSATISFIED, EVIDENCE_PENDING, SATISFIED, DISPUTED, VOID / CORRECTED. For a contract explicitly not requiring advance payment, store NOT_REQUIRED with exact contract authority; do not fake a zero-dollar payment.

**Constraints:** AI, customer message, generic lawyer role and Stripe invoice.paid/VIP entitlement do not create payment evidence. Preserve existing Stripe webhooks and subscription tables untouched. No checkout, bank API or money movement is authorized. Protect financial evidence with redacted references, audit provenance and retention decisions; never put raw card/bank details in Git, trace or model prompts.

**Tests:** forged paid flag, unprivileged staff attestation, duplicate same operation replay, two different receipts/amounts, refund after satisfaction, agreement supersession, project closure, cross-Project evidence, existing VIP unaffected; errors must fail closed, not award access.

## 6. M4-006 — Scoped immutable professional review/approval

**Business flow:** Create a review request for an immutable target package (managed school application per institution or Student 500 package), exact version/hash and purpose; resolve the current assigned reviewer and independent professional-authorization evidence; record review disposition and comments/evidence without editing the target; only an authorized lawyer can produce the mandatory lawyer approval for either managed package type; any substantive package change or expired authority invalidates a prior approval. Customer confirmation remains a separate record if required.

**Proposed states:** REQUESTED → IN_REVIEW → CHANGES_REQUESTED / APPROVED / REJECTED / INVALIDATED; never silently revalidate an older approval. Keep rejected and superseded decisions append-only; distinguish “lawyer marked review complete” from “legally qualified reviewer verified” and from actual government/school outcome.

**Scope:** current M4 may define a **generic exact-version review target interface and synthetic package fixture**, not implement M5/M7/M8 real school/visa submission packages. A future package provider must return deterministic immutable identity/hash and validity; unknown/future package type or absent verified authorization produces NOT_READY/DENY. AI-quality audit, M4-003 human messages, old clarification requests, an admin click or education-agent-only review are not substitutes.

**Tests:** wrong target/hash/version, cross-project item, stale/revoked assignment, user.role change, unverified professional credential, lawyer review on altered package, substitute education review, double decision, concurrent invalidation, withdrawn customer authority and closed Project; all prevent an “approved” handoff.

## 7. M4-007 — Integrated fail-closed M5 managed-handoff interface

Compose M4-002 + M4-003 + M4-004/005/006 in one deterministic read-only gate. It returns readiness *for a future managed handoff* only, never approval or submission by itself. The intended return contract includes: projectId; engagementId and scope; specific intended school/package kind and exact version/hash; immutable checked revisions; READY / NOT_READY / UNKNOWN; stable reason codes; evidence references safe for the caller; checkedAt; and a required revalidation token/transaction rule to avoid TOCTOU.

**All must hold for READY:**
- active Project and appropriate customer owner/authorized participant; active, purpose-matching M4-002 named-lawyer assignment and separate necessary M4-004 resource disclosures;
- genuine current engagement and customer service authorization; valid accepted contract version and **verified** signing evidence under an owner/professional-approved signing policy;
- contractual payment condition either genuinely NOT_REQUIRED or verified SATISFIED with no effective reversal;
- exact target identity/version/hash and required authorized **lawyer** approval still current; required customer confirmation current;
- identity, resource permissions and reviewer professional status verified for this action; no stale/grant conflict.
- if future package has an authorized submission actor requirement, that actor must also be independently verified before any actual M5/M8 external action. The M4 gate never issues receipts or submits.

A missing professional credential verifier, signature-verification policy, real target-package provider or legal rule must yield **UNKNOWN/NOT_READY**, not fabricated READY. M4-003 messages are optional communication, not a mandatory business authorization predicate. Audit the gate decision without copying customer document contents. Future M5 must re-check the gate immediately before its own state transition and never rely on a cached green UI badge.

**Required scenarios:** no engagement; inactive staff; thread consent only; no disclosure; unsigned/stale contract; payment pending/reversed; wrong reviewer; stale review target; revoked consent during check; two concurrent conflicting operations; replay/idempotency; legacy Standalone Chat and separate Projects untouched; synthetic all-green path only when a **test-only trusted professional/signature authority** is explicitly injected and never mistaken for live authority.

## 8. Unified Codex implementation/review workflow (single round)

1. **Owner's future explicit dispatch (not granted here):** identify allowed branch/worktree, base HEAD, source paths, accepted policy decisions, and whether test-only DB/migration work is separately authorized. Codex first checks AGENTS.md, actual M4-002/M4-003 source, schema/migration journal and latest Git state.
2. **One coherent implementation pass:** model transitions and checks as services/repositories; write additive migrations and API adapters, bounded DTOs, feature-off gates, typed events, tests, and a single integrated M4-007 gate. Do not turn each of 004/005/006/007 into separate review/commit cycles. Reuse M4-002/003 optimistic concurrency/locks; fix only evidence-backed defects.
3. **Static focused validation:** changed-path Biome/TypeScript delta, journal/schema check, permission & lifecycle unit tests, replay/race negatives, then full unit test with existing failures classified against clean HEAD. Preserve historical baseline instead of asserting any failing suite is harmless.
4. **Independent review:** Codex produces one complete tracked+untracked patch under the user's local home directory plus summary, changed-file inventory, candidate SQL hashes, test commands/results and risk register. **Codex must not commit/push or touch live DB**; ChatGPT reviews the actual patch, contract and all sources; one bounded correction round if genuine blocker.
5. **Database evidence separately authorized:** owner approves precise disposable PostgreSQL host/port/db/role/container, allowed migration set and guarded test command. Run only in that isolated environment; inspect ledger, guards, race results, audit integrity and failure rollback. No normal localhost:5432, customer DB, staging, AWS or production migration by implication.
6. **Single acceptance closeout:** update status with exact SHA/patch, pass/fail/skip, environment/provenance, known limitations and independently reviewed evidence; only owner authorizes commit/push, feature enablement or next release gate.

Do not promise a fixed migration number, sample-size adequacy, production readiness, signature-provider legal validity or professional licensing from offline tests.

## 9. Acceptance matrix — minimum release-blocking checks

| Group | Positive control | Required negative controls |
| --- | --- | --- |
| A: schema/audit | additive versioned records, FK/check/unique, immutable event chain | audit/approved row mutation or deletion, orphan target, stale revision |
| B: M4-004 | exact owner+contract+verified evidence+scoped disclosure | thread consent only, forged signature, wrong actor/hash, revoked grant, cross-member/private file |
| C: M4-005 | staff-attested contractual payment satisfied | customer/AI asserted paid, void/refund, duplicate conflict, unrelated VIP entitlement |
| D: M4-006 | true authorized lawyer reviews exact immutable version | unverified license, other target, education-only signoff, stale version/review after change |
| E: M4-007 | synthetic complete genuine-contract fixture computes READY | every single missing predicate denies; missing source/authority = UNKNOWN/NOT_READY |
| F: races | exact replay idempotent; properly serialized independent events | send/consent revoke, assignment revoke, agreement supersede, payment reversal, review invalidation, gate-vs-revoke |
| G: boundaries | existing M4-002/M4-003 legitimate actions preserved | old Chat/AI-quality/clarification/VIP flows altered, owner/member/cross-Project disclosure |
| H: operational | flags default OFF, sanitized errors/logs, guarded disposable DB | external I/O without authorization, production DB touched, provider mock misrepresented as live |

**M4-007 exit:** unit/schema/guarded DB suites and independent review all support a precise OFFLINE ACCEPTED_WITH_LIMITATIONS claim; append acceptance matrix identifying tests that were *not* run. Only separately approved professional/legal, real-service, privacy, signing/payment and deployment gates can ever lift Phase 13 LIVE/PRODUCTION NO_GO.

## 10. Open decisions that must be resolved before code claims ACTIVE/APPROVED/READY

- Exact scope of managed school vs Student 500 engagement, authorized operator that issues terms, whether and when customer/member can sign or delegate.
- Signature verification evidence, approved provider/manual reconciliation, legal enforceability, retention and erasure requirements.
- Which staff can verify off-platform payment; permitted evidence fields, disputes, refunds, and contractually required payment semantics.
- Independently accepted professional credential verification and eligible lawyer authority; what to do while authority is UNKNOWN.
- Protected resource disclosure granularity, expiration, re-consent on new document/version, staff attachments, and emergency access policy (default DENY).
- Canonical target-package provider and hashing/approval invalidation for M5/M7/M8; how M5 recomputes current gate state.
- Privacy, data residency, retention and support-audit role access; no blanket admin customer-content visibility.

**These are explicit policy review items, not instructions for Codex to invent answers.** Until resolved, implement deny-only/test-only adapters, not fake “verified” records in a real customer path.

## 11. Documentation authority and immediate next step

This is the single detailed M4-004–007 implementation-plan document. Other current-state and roadmap documents reference it rather than copying its requirements. Historical dated acceptance notes remain historical. The very next user action after this docs-only commit is safe local fast-forward synchronization, *not* automatic Codex dispatch. New implementation requires a separate explicit user instruction and bounded task authorization.
