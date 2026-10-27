# Phase 13 M4 — Staff collaboration and professional engagement architecture proposal

**Date:** 2026-10-27 (Australia/Sydney)
**Status:** **PROPOSED — NOT ACCEPTED ARCHITECTURE.** This M4-001 design grants no implementation, migration, data, live-service or production authority.
**Grounding:** M4-001 as-is audit, M4 work breakdown, Phase 13 roadmap, M1/M2 contracts and M3 architecture. The audit describes current code.

## 1. Design objective and invariants

M4 should establish a Project-scoped human/professional relationship with separate authorities for identity, assignment, customer disclosure, engagement, signature, payment evidence, professional review and human communication. No record substitutes for another.

1. A Project, Chat, LegalMatter, customer membership, staff assignment, engagement and VIP subscription are distinct objects.
2. A global lawyer/admin role does not grant Project access. A current Project assignment does not grant access to every Project resource.
3. Customer AI-use or document-import permission is not customer-to-staff disclosure consent.
4. Every staff read/write/approve action checks current actor identity, professional authority if required, Project assignment, action scope, data disclosure, exact resource/owner and current version/lifecycle at the server boundary.
5. Project member access is not Chat sharing. Human Project messages are separate from AI Chat messages, one-off clarification messages, consultations and formal reviews.
6. Agreement signature, payment, review, approval and external submission require scoped evidence; none may be asserted by AI or UI prose. The accepted Phase 13 Roadmap §1.6 baseline requires an identified authorized lawyer to review the exact version of every managed per-school application package and Student 500 package (docs/agent-memory/PHASE13_STUDY_JOURNEY_ROADMAP.md:43). Education-specific review may be additional and cannot replace that lawyer review; changing the baseline requires a separately accepted architecture decision.
7. ProjectOperation/Event, immutable document versions, Fact versions, expected revision, request hashing, transaction locks and canonical artifact hashes are patterns to evaluate for reuse, not automatically adequate M4 policy.
8. Phase 13 remains live/production NO_GO. Legal, privacy, professional, payment, retention or real-world claims remain subject to owner/professional review.

## 2. Minimal authority flow

Customer owner → explicitly authorizes the named staff assignment and purpose → an actor allowed by the separately approved assignment-authority policy creates/invites that assignment → staff accepts. Who may initiate or delegate assignment creation remains pending owner approval.

Global staff/admin role alone never grants Project access. For protected data: verified required authority + active customer-owner-authorized Project assignment + separately approved assignment authority + current M4-004 disclosure grant + exact resource/version + open/allowed service state → narrowly scoped staff operation.

Immutable agreement version + authentic signature evidence + separately attested contractual payment condition (when applicable) + customer authorization + identified authorized lawyer review of the exact managed school or Student 500 package version → candidate M5 managed-handoff readiness. A future M5 service recomputes every input and fails closed; M4 does not submit anything.

## 3. Proposed reuse hierarchy and bounded domain

### Reuse first

- **Project Foundation:** Project identity, ownership, active/closed lifecycle, expected revision, actor-scoped idempotency, canonical request hashes, transaction events and customer membership. Add staff-specific policy; do not make staff a ProjectMembership or Chat owner.
- **Project documents/Facts:** immutable version identity, provenance, customer confirmation, conflict/stale suppression, exact-version evidence and separate AI grants. Preserve the separate customer-to-staff consent check.
- **Existing request/consultation patterns:** verified-account checks, scoped assignment lookup, transition validation, revision checks and event emission. Their IDs and scopes remain request/booking-specific.
- **Audit/version patterns:** ProjectOperation/Event for transaction correlation; M2 assertion/version history; M3 immutable snapshot, source identity and payload hash. Use typed existing systems where suitable; do not introduce a second universal audit substrate without need.
- **Phase 7 ReviewArtifact:** reuse canonical hash, typed payload, version and supersession techniques only. It remains learning/control-plane evidence and is not a Project approval record.
- **VIP:** no M4 entitlement or payment reuse. Stripe billing remains a separate product boundary.

### Candidate entities, only for verified gaps

These names are illustrative. Owner and professional review should refine them before any migration.

| Candidate | Required content and constraints | Reason |
| --- | --- | --- |
| **ProjectStaffAssignment** | Project ID, staff user ID, assignment purpose/role, explicit customer-owner authorization evidence, actor authorized by the separately approved assignment-authority policy, status, invited/accepted/revoked timestamps, scope-policy version, revision and operation/event references. Unique active assignment per Project/user/role or an explicitly reviewed equivalent. | No Project staff assignment exists. Consultation and clarification assignments do not provide continuing Project scope. A global role alone is insufficient. |
| **ProjectProfessionalAuthority** or verified authority reference | Authority type/discipline, verifier/source, credential identifier only if necessary, jurisdiction/scope, checked time, expiry, status and evidence reference. Never accept caller-typed verified=true. Prefer an independently controlled verifier if one exists. | Account role is not licensing, registration, competence or scope evidence. Verification process is not found and is an M4 gate. |
| **ProjectDisclosureConsent / ProjectDisclosureGrant** | Project owner actor, recipient or reviewed recipient class, assignment ID, purpose, data class, exact resource/version, notice/consent version, accepted time/provenance, status, revocation and operation ID. Composite foreign keys bind resources to the same Project. No wildcard scope in the first release. | No ongoing Project customer-to-staff disclosure capability exists. One typed consent/grant record is acceptable only if lifecycle and immutable history are explicit. |
| **ProjectHumanThread / ProjectHumanMessage** | Project/thread ID, participants derived from current assignment and explicit customer-owner `ProjectThreadParticipationConsent` for the named recipient(s), author actor, server-generated sequence, operation ID, body and attachment references, createdAt and retention status. Consent records thread, recipient(s), communication scope, notice version, authorizing owner, time and revocation. | M4-003 consent permits only participation in and receipt of messages in that exact thread. It discloses no Project Facts, Documents, private AI Chats or other protected resources; attachments require a separate M4-004 resource grant. Do not store this in Message_v2, private AI Chat or clarification request. |
| **ServiceEngagement** | Project ID, service mode (self_service or managed only after owner review), contracted scope, responsible organization/staff assignment, current AgreementVersion ID, lifecycle, effective/end dates, revision and evidence links. | Project has no service mode or engagement record; M5 needs a scoped relationship. |
| **AgreementVersion / SignatureEvidence** | Immutable version number, canonical terms hash, author/publisher, scope, notice version, effective date and supersession link; separately verified signatory, exact target version/hash, identity/e-sign provider reference, signed bytes/hash, signedAt, verifier and evidence provenance. Corrections are new evidence/events, not edits. | No service contract or signature evidence path exists. Provider and enforceability decisions remain pending. |
| **PaymentAttestation** | Engagement/contract condition reference, verified amount/currency/date, external receipt reference/hash, attesting staff actor and authority, evidence-review method, status and correction/reversal lineage. No bank/card credentials or raw financial secret. | No service payment record exists; Stripe VIP represents a separate AI subscription. |
| **ProfessionalReview / ProfessionalApproval** | Exact Project, target kind/id, immutable target version/hash, review scope, reviewer identity/current authority reference, decision, reason code, timestamps, customer confirmation if required, operation ID, invalidation state/reason and superseding review link. Prefer one typed review record with decision states. For every managed per-school application package and Student 500 package, the baseline decision must be by an identified authorized lawyer on the exact version; education review is additional only. | No Project package review or approval exists; AI-quality review targets an answer trace, not a Project deliverable. The lawyer-review baseline is fixed by the accepted roadmap, not an open design choice. |
| **ProjectAuditEvent** | **Not the default recommendation.** First assess extending typed ProjectOperation/Event for transaction correlation and add purpose-specific immutable evidence rows for agreements, signatures, payment and approvals. Add another event table only if M4 guarantees/queries cannot be met otherwise. | Avoid a second universal audit framework; current ProjectEvent is narrow and has no M4 vocabulary. |

## 4. Authorization model: RBAC plus ABAC

### Effective authorization predicate

For a Project staff read or mutation, require all applicable conditions:

**Authenticated actor** AND **enabled/non-guest account** AND **current staff role** AND (for a professional act) **verified, in-scope professional authority** AND **active ProjectStaffAssignment for this Project/action** AND **active disclosure grant for this recipient, purpose, data class and resource/version** AND **resource belongs to this Project and permitted owner/scope** AND **Project/engagement lifecycle permits the action** AND **expected revision/current version matches**.

Recompute authorization server-side for each request and again before committing a mutation after external I/O. Never cache a positive decision beyond assignment, consent, Project, authority or resource-version changes.

### Action matrix (proposed)

| Actor | Project shell | Project Facts/documents | AI Chats | Human Project thread | Agreement/payment | Review/approval |
| --- | --- | --- | --- | --- | --- | --- |
| **Owner customer** | Existing owner permissions. | Existing customer permissions; separately opts in to each staff disclosure. | Own private Chats only. Project owner does not own a member's private Chat. | Participates in own Project thread; selects recipients under accepted policy. | Views/accepts own versioned terms and consent; cannot self-attest staff-confirmed payment. | May confirm personal statements/package acceptance where required; cannot represent professional review. |
| **Active customer member** | Existing M1 member permissions only; cannot manage staff by implication. | Existing Project access per M1/M2; no automatic staff or cross-member disclosure. Cannot grant staff access unless owner-delegation policy is separately approved. | Only the member's own Project Chats. | Access only if added as participant under owner-approved policy. | No authority to bind owner without separately verified delegation. | No professional approval authority. |
| **Assigned lawyer** | Allowlisted minimal dashboard only for assigned Project. | Deny unless exact current disclosure grant covers resource/purpose/version. | Deny private member Chats; default deny all Project AI Chats. | Only threads where lawyer is an authorized participant. | Read exact scoped active agreement/evidence as authorized; cannot attest payment without separate finance authority. | Review/approve only with current lawyer authority, assignment scope and exact target version. |
| **Assigned education representative** | Allowlisted minimal dashboard only for assigned Project. | Same per-resource disclosure rule; no blanket access. | Deny private Chats. | Only authorized participant threads. | Access education terms only if scope allows; payment attestation needs separate finance authority. | Only education actions expressly authorized after professional review; no lawyer-only decision by implication. |
| **Project principal/operations admin** | Manage assignment only if owner-approved role policy permits. | No blanket case-data access from admin role. Exceptional access needs explicit, time-bounded, reasoned and audited authority; absent approval, deny. | Deny. | Deny unless explicitly a participant. | No signing/payment verification by admin role alone. | No professional approval by admin role. |
| **Unassigned lawyer, unrelated staff, another customer** | Deny. | Deny. | Deny. | Deny. | Deny. | Deny. |
| **AI/model/provider** | No identity or assignment authority. | Receives only M2-authorized AI context and bounded evidence; never creates staff consent or professional state. | Operates within current Chat/turn authorization. | Cannot post as human or create professional act. | Cannot infer engagement, signature or payment. | Cannot approve, sign or submit. |

Current source roles include user/lawyer/admin only. An education representative role and trusted professional credential-verification source are absent. Until owner/legal review defines authority evidence and its lifecycle, assignment can support only non-professional operational access; it must not satisfy M5 review gates.

## 5. Proposed state transitions and evidence rules

The following are candidates, not frozen business semantics.

| Record | Candidate state model | Guard and revocation behavior |
| --- | --- | --- |
| **Staff assignment** | invited → active → revoked; invited → expired; active → suspended → active/revoked | An actor allowed by the separately approved assignment-authority policy creates the invitation only after explicit customer-owner authorization of the named staff member and purpose; staff acceptance is authenticated. Check role/authority at assignment, each use and approval. Revocation immediately denies future requests and invalidates any approval whose policy requires current reviewer authority. Who may initiate or delegate assignment creation remains pending owner approval. |
| **Disclosure consent/grant** | offered → active → revoked/expired; no reactivation of old grant | Consent binds recipient or reviewed staff group, purpose, class, resource/version, notice and actor. New scope requires new consent. Revocation increments scope revision and blocks future read/download/retrieval. Previously viewed/downloaded material cannot be recalled; retention rules require review. |
| **Human message** | created → delivered → read (delivery states only) | Server binds author and allowed recipients at write; append-only message content; thread sequence and operation key prevent duplicate/reordered writes. Message body never changes engagement, signature, payment, review, approval or submission state. |
| **Engagement/agreement** | draft → offered → accepted/signed → active → suspended/terminated/expired; agreement versions draft → published → superseded | Engagement activation derives from current scope, fully executed exact AgreementVersion, required consents and any contractual condition. Signing is independently verified per signatory/version. New terms create a new version and require fresh signatures. |
| **Payment attestation** | evidence_pending → verified → reversed/corrected | Only separately authorized finance/staff actor attests after reviewing evidence; customer receipt or AI claim alone is not paid state. Corrections append evidence/events and preserve prior attestation. A contract may have no payment prerequisite; do not invent one. |
| **Professional review** | pending → approved / rejected / revision_requested; terminal review → invalidated when inputs or authority change | Reviewer and authority are current; decision binds exact target type/id/version/hash, Project, scope and evidence. A new target version, relevant material input, revoked consent, revoked assignment, expired authority or scope change makes prior approval stale for current readiness while preserving history. |

No free-form message, generated summary, customer-entered status, imported PDF, display name or LLM output may transition these states.

## 6. Consent, privacy and staff communication

1. **Default deny.** Assignment is a relationship record, not data authorization. Consent is independently required for each protected class/resource.
2. **Named scope.** Start with explicit data classes and purposes; no “all Project data” checkbox. A grant identifies Project, acting owner, recipient/assignment, data class, resource/version when applicable, purpose, notice version, timestamp and consent evidence reference.
3. **Keep private Chats private.** Do not expose Chat histories to staff through Project IDs. The first staff dashboard contains no Chat transcript, Fact value, document filename/excerpt, identity number or member-private data. Future Chat sharing needs a separate owner/creator-scoped contract and is not in M4-002.
4. **Keep M2 grants separate.** ProjectFactUseGrant with purpose ai_context, ProjectFactPublication and ProjectDocumentGrant never satisfy staff disclosure. An exact document version may need both M2/processing authority and an independent M4 disclosure grant.
5. **Revocation boundary.** Recheck on list, detail, download, export, message attachment and approval. Revocation denies subsequent operations. Previously viewed/downloaded material cannot be recalled; staff retention, local-copy, notification and legal-hold semantics need privacy review.
6. **M4-003 thread participation consent.** Before a staff member joins or receives messages in a Project human thread, record explicit customer-owner consent for that exact thread and named recipient(s), with communication scope, notice version, authorizer, timestamp and revocation. It permits only participation in and receipt of messages in that thread; it does not disclose Project Facts, Documents, private AI Chats or other protected Project resources. Do not share attachments under this consent; any later resource disclosure requires the separate M4-004 grant. Resolve recipients from current assignment plus this consent; do not assume every employee sees every message.
7. **Notifications.** Send minimal identifiers and nonsensitive status only. Avoid file content, private Chat text, Fact values or sensitive payment evidence in email/push.
8. **Minor/guardian cases.** Do not infer guardian authority from relationship text or account membership. Define identity, capacity, delegation and consent requirements before live handling.

## 7. Event, concurrency, version and audit design

- Reuse actor-scoped idempotency and canonical request hashes from ProjectOperation. Every invite, accept, revoke, consent, engagement transition, signature import, payment attestation, review and message send receives a unique operation key and stable result. Same key/same request returns the same result after reauthorization; same key/different request conflicts.
- Use a documented lock order consistent across Project transactions: claim/lock operation identity, lock Project, then assignment/membership and consent, then target/version/evidence rows. Hold no database locks across provider, model, external signature/payment verification or object-store calls. After I/O, reread exact identifiers and current authority before commit.
- Increment Project revision for access, assignment, consent, engagement, contract, payment-condition and approval-affecting changes. Use per-thread sequence/idempotency for message ordering rather than making every message a global Project revision write.
- `ProjectOperation` and `ProjectEvent` use closed operation/result/event/subject vocabularies and named SQL CHECKs. An additive M4 migration must coordinate the TypeScript unions, matching CHECK allowlists, actor/type rules and any event-to-operation/result/subject binding. Human staff operations use authenticated user actors subject to assignment policy; the existing service actor allowlist is limited to the two document workers. Do not introduce a generic staff/service actor by implication. The current round-two trigger binds only extraction/fact events to matching user actors and operation results; preserve that behavior while defining any new M4 event binding.
- `ProjectEvent_project_revision_unique` permits only one event per Project revision. Emit one canonical ProjectEvent for each incremented Project revision; retain the existing per-thread sequence and operation idempotency for message ordering without incrementing the global Project revision for each message. If multiple event rows per revision are required, that needs a separately accepted schema decision. Store detailed evidence in domain rows with hashes/provenance; avoid an arbitrary JSON event log. Add database append-only enforcement for records that must be immutable; repository conventions alone are insufficient.
- Store role/authority and assignment references used for each approval. Current authority is recomputed before use; historical authority basis remains visible.
- Bind review to Project ID + target kind + target ID + immutable target version + canonical SHA-256 + reviewer + authority scope + decision + operation ID. Keep prior reviews. A status projection may say current approval is invalidated, but it must not erase the historic decision.
- A changed target version/hash always requires new review. Which upstream Facts/documents/catalog snapshots invalidate a package is a domain decision; proposed first rule: any input explicitly cited in the package version hash invalidates it. Unrelated new source observations do not rewrite an old package.
- Revocation/closure/suspension takes effect synchronously for future authorization through row locks and current checks. External transfers or in-flight callbacks are reconciled by idempotent follow-up operations; never restore access from stale callbacks.

## 8. M5 managed handoff boundary

M4 prepares only a typed, read-only readiness interface. It does not implement school submission, visa submission, a legal decision or an external API.

Candidate request: Project ID, engagement ID, workflow/application target ID, immutable package version ID and SHA-256, institution target, action scope and caller identity.

Candidate result: READY or deterministic NOT_READY reason codes. READY requires, at evaluation time:

1. Project and engagement are active; engagement scope includes the exact target/action.
2. AgreementVersion is the active accepted/signed version and covers the action.
3. Required customer disclosure and submission consents are active for exact participants/data classes.
4. Any payment prerequisite in that agreement is independently attested; no payment requirement is guessed.
5. Current professional assignment and externally verified professional authority allow the required review/action.
6. Professional approval targets the same immutable package version/hash, remains valid and still satisfies authority/consent.
7. Customer confirmations required for declarations are bound to the same package version/hash.
8. Project, owner, assignment, consent, evidence, package and revision relationships are consistent and current.
9. A future M5 workflow identifies an authorized human submitter; AI never submits.

Any missing, stale, conflicted, unavailable or ambiguous condition returns NOT_READY. M3 education options are not an application package and cannot be treated as an offer, CoE, submission receipt or approval. Self-service must not display false professional approval. Exact professional and customer gates remain **PENDING PROFESSIONAL/OWNER REVIEW**.

## 9. Negative and positive acceptance matrix

These tests are proposals for later authorized implementation; none were run for M4-001.

| Scenario | Expected result |
| --- | --- |
| Active lawyer role, no Project assignment | Deny Project list, detail, read, write, download and approval. |
| Assigned lawyer for Project A requests Project B or unknown ID | Deny without revealing whether foreign resource exists. |
| Assigned lawyer but no customer-to-staff consent for Facts/documents | Deny protected values/content; return only approved metadata DTO. |
| AI context grant or Project membership presented as staff consent | Deny. |
| Owner authorizes exact document version, caller requests another version/purpose | Deny. |
| Project member asks staff to read their private Project Chat | Deny absent a separately approved owner/creator-scoped sharing contract. |
| Assignment revoked before read, during download, before mutation commit, or during approval | Recheck and deny; no stale result or approval. |
| Consent revoked before read, during I/O, before attachment download or approval | Deny future access; preserve evidence without reactivating grant. |
| Project closed, engagement suspended/terminated/expired, or authority expired | Deny writes/managed readiness; archive access only under reviewed retention policy. |
| Member revoked/closed while staff request is in flight | Fresh authorization fails; no commit with stale membership. |
| Duplicate operation key and identical canonical request | One durable result; authorized idempotent replay. |
| Duplicate key with changed Project, recipient, target version, amount, consent or decision | Conflict; no second mutation. |
| Concurrent staff revoke and message/read/approval | Consistent lock order yields current state; no post-revoke authorization. |
| Forged signature, wrong signatory/version/hash, duplicate provider event or unverified provider result | Reject; engagement inactive. |
| Customer/AI says paid without staff evidence; receipt belongs elsewhere or wrong amount/currency | Reject attestation/readiness; VIP state unchanged. |
| Payment reversal/refund/chargeback after attestation | Append correction/reversal, recompute condition/readiness and retain history. |
| Review by admin/unassigned/out-of-scope person or expired/unverified lawyer | Reject professional approval. |
| Target changes after approval, including same ID with changed bytes/version | Mark prior approval stale for readiness; require exact-version review. |
| AI/customer message/Consultation claims approved, submitted, Offer or CoE | No Project professional/third-party state transition. |
| Foreign Project ID in attachment, message, Fact/evidence reference or M3 option | Reject through composite Project and ownership checks. |
| Standalone Chat, clarification, consultation or VIP purchase replayed into Project | No implicit assignment, consent, engagement, payment or approval. |
| Self-service package without lawyer approval | Never label managed or professionally approved; future self-service policy is separate. |

Positive cases should prove owner can grant/revoke exact scope, assigned authorized staff sees only allowlisted current data, exact agreement/signature evidence activates only its scope, exact approved package yields READY only while all guards remain active, and unrelated valid resources remain available after another grant is revoked.

## 10. Migration and rollback considerations — design only

- Add only new tables/indexes/checks/foreign keys in additive migrations after owner accepts design and a concrete M4-002 contract. Derive the next migration ID from the repository journal at that later time. Do not use schema push.
- Use composite Project/resource/version foreign keys. Restrict deletion for signed, payment, review and audit references; represent withdrawal/revocation as new states/events. Add DB-level immutability/transition constraints for legally material records with tests asserting named constraints.
- Do not backfill existing clarification, consultation, Stripe/VIP, M2 AI grants or Project membership into M4 assignment, agreement, disclosure, signature, payment or approval. No migration should broaden historical visibility.
- Roll out schema dark/default-off. Enable assignment and dashboard routes only after RBAC/ABAC evidence. Keep independently feature-gated. If disabled, stop new staff operations and deny staff reads/writes; retain owner/customer behavior as M1 defines it.
- Rollback disables new service paths and preserves additive evidence rows. Do not delete assignments, consents, contracts, signatures, payments or reviews to simulate rollback. Do not translate Project records to legacy lawyer requests, consultations or VIP billing.
- Database-backed verification requires later separate authorization for an exact disposable database and identity/ledger guard. M4-001 did not connect to any database.

## 11. Open decisions — PENDING PROFESSIONAL/OWNER REVIEW

Nothing below is binding until accepted by the owner and relevant Australian lawyer/education professional/privacy and finance advisers:

- Professional service taxonomy, licensing/registration authority, credential verifier, jurisdiction, education-representative scope and conflict process.
- Who may appoint/revoke staff, accept assignments, authorize each data class, delegate owner consent and manage guardian/minor consent.
- Whether any platform admin can access a Project and, if so, the narrow emergency basis, reason, notice, duration, approval and audit rule.
- Customer-facing disclosure language/notice version, consent duration, recipient granularity, withdrawal effect, staff-export restrictions and access notification.
- Private Chat/member data treatment; document/Fact classes; permissible exact-version snapshots; residency, retention, deletion, legal hold, breach response and post-termination copy destruction.
- Contract contents and execution provider; signature/identity/capacity proof; variation, withdrawal and cancellation; enforceability and evidence retention.
- Payment custody, accepted verification instruments, responsible finance staff, tax/accounting, reversal/chargeback treatment, and whether payment is a managed-service condition.
- Whether education-specific review is additionally required, which package fields need customer confirmation, and what changes invalidate approval. The identified-authorized-lawyer exact-version review for managed school application and Student 500 packages is the accepted baseline; changing it requires a separately accepted architecture decision.
- M5 self-service notice, managed-submission duties, allowed channels and proof of authorized human submission.

Until resolved, no customer-facing M4 capability promise, legal/compliance assertion, signed/paid/approved badge or managed M5 handoff may be presented.

## 12. Bounded proposed M4-002 task packet — owner approval required

This is an outline only, not dispatched implementation authority.

**Objective:** add the smallest Project staff identity/assignment and deny-by-default authorization foundation plus a minimal staff dashboard DTO.

**Scope candidate:**

1. Add a ProjectStaffAssignment lifecycle and typed ProjectOperation/Event references; do not reuse ProjectMembership. Coordinate the TypeScript operation/result/event/subject types and the corresponding named SQL CHECK and event-binding constraints in an additive migration; preserve existing actor restrictions and event history.
2. Add server-only staff assignment create/invite, accept and revoke services using authenticated user actor IDs, expected Project revision, operation ID/hash, Project/assignment locks and current account-role checks. Require explicit customer-owner authorization for the named assignee, purpose and role, plus an actor allowed by the separately approved assignment-authority policy. Whether the owner acts directly or delegates assignment initiation remains pending owner approval.
3. Add one read-only staff dashboard endpoint returning only an allowlisted shell and assignment status after current owner authorization and approved assignment authority are both established. Do not return protected Project data; until M4-004 exists, fail closed for Facts, Documents, private AI Chats, human messages and other protected resources.
4. Require current active assignment and approved staff authority for each allowed read; global staff/admin role alone never grants Project access. Protected data additionally requires the applicable M4-004 disclosure grant. Do not expose education-representative approval as a substitute for the required lawyer review.
5. Define an interface for future disclosure checks but fail closed because M4-004 consent does not yet exist. Do not broaden customer grants.
6. Prepare offline service/route/schema validation for unassigned/foreign Project, missing owner authorization, unauthorized assignment initiator, role demotion, revoked/closed state, wrong revision, replay, duplicate operation and concurrent revoke. Planned database tests must seed valid Project/operation/result references; assert SQLSTATE `23514` and named constraints for invalid M4 type, actor and event binding, and SQLSTATE `23505` with `ProjectEvent_project_revision_unique` for a duplicate Project revision. They must isolate checks from foreign-key failures. Any later database tests require separate exact-target authorization.

**Explicit exclusions:** human Project messaging (M4-003, including its narrow thread-only participation/recipient consent); broader customer data disclosure/consent and document sharing (M4-004); contract/signature/payment (M4-004/005); professional review/approval (M4-006); M5 application/submission; UI beyond bounded read DTO; changes to standalone Chats, clarification, consultations, AI-quality review, M2 grants, M3 catalog or Stripe VIP; AWS, live services and customer migrations.

**Acceptance gate:** independent review of this M4-001 audit/proposal; owner/professional decisions on role verification, who may initiate/delegate assignment, default admin behavior and minimum dashboard data; separate approved M4-002 task packet naming exact files, schema, migration policy, tests and execution target. Resulting code remains uncommitted/unpushed for independent review and is not production-ready by implication.

## 13. M4-001 stop condition

M4-001 ends with these two uncommitted documentation files. No M4-002 code, migration, tests, database, external integration or deployment is started. Wait for independent architecture review and explicit authorization.
