# Phase 13 M0-001 — As-Is Architecture Audit and Draft Boundary Proposal

**Disposition:** DRAFT DELIVERED — AWAITING OWNER REVIEW; NOT ACCEPTED. This is an implementation proposal, not a schema decision, legal approval, or authorization to implement.

**Audit checkpoint:** branch `phase13-study-journey-project-centric`; HEAD `88385f2c0bff0ad636bfca7439d40ccc673ae2ef`; worktree clean before this documentation change. The branch is ahead of the task packet's owner-known start SHA `8b963eea1aa4023d30f31eba816a545efaa65e3d` by the Phase 13 documentation initiation commit. No tests, DB probe, paid model call, external service, migration, or runtime validation was performed. `git diff --check` is the only requested validation and is recorded after the final edits.

## 1. Evidence envelope

### Inspected inputs

- Repository instructions and status: `AGENTS.md`; `docs/agent-memory/CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md`, `DECISIONS.md`; `docs/agent-memory/PHASE13_STUDY_JOURNEY_ROADMAP.md`; `docs/agent-memory/tasks/PHASE13_M0_ARCHITECTURE_AUDIT.md`.
- Design references: `doc/Immigration_AI_Study_Journey_Project_Centric_Architecture_V2_2026-10-22.pdf`; `doc/Study_Journey_School_and_Student500_Facts_Documents_Lawyer_Review_V0.1_2026-10-22.pdf`; `doc/Picture1.png`, `Picture2.png`, `Picture3.png`, `doc/mermaid-diagram.png`. The PDFs were text-extracted locally; PNG diagrams were visually inspected. The PDFs and fact/document matrices are provisional lawyer-review material, not approved legal requirements.
- Source examined: `chatbot/lib/db/schema.ts`, Drizzle journal/migrations, conversation scope/history/turn-ledger/runtime and queries, matter-document services/evidence packet/deletion, Policy Intelligence binding/source revisions, customer/lawyer portals, lawyer clarification/consultation services and RBAC, assistant mode entitlement and payment models, and the focused tests listed below.
- Project-path source search found no checked-in Phase 13 `StudyJourneyProject`, `ProjectDocument`, `FactAssertion`, `ApplicationPackage`, `SubmissionGate`, or `ServiceEngagement` implementation. This describes the inspected repository source only; it is not a statement about deployed systems or untracked external services.

### Product baseline and confidence labels

- **VERIFIED:** Immigration conversations and their document evidence are currently chat-scoped. A Project business-workflow model and cross-chat Project evidence resolver were not found in the inspected source.
- **VERIFIED:** Phase 12 D-009 deliberately kept `projectId` null and refused cross-conversation AI context. D-P13-001 and the Phase 13 roadmap authorize *design preparation* for a new Project workflow only; they do not change old records or authorize code/schema work.
- **VERIFIED:** the existing durable turn ledger is shared by Fast, Legal Check, and Premium widget routes, with `(chatId, clientTurnId)` idempotency and fenced execution. Project context must not weaken those guarantees.
- **INFERRED:** the lowest-risk route is an additive Project aggregate referencing existing conversations and reusing the existing document processing/evidence pipeline behind an explicit Project grant. The present document deletion contract makes a bare cross-chat document pointer insufficient; lifecycle design is a prerequisite.
- **NOT VERIFIED:** actual production/local DB contents, deployment topology, lawyer/agent approval of the matrices, education-source licensing/availability, external submission access, and any uninspected external app behavior.

## 2. As-is data model, APIs, and authority boundaries

### Applications, identity, and durable conversations

- `chatbot/lib/db/schema.ts:19-39` defines `User`, global roles (`user`, `lawyer`, `admin`) and AI `membershipTier`/`vipExpiresAt`. No education-agent role or Project membership entity appears in the inspected schema. VIP purchase/plan/subscription entities are in `schema.ts:96-190` and represent AI entitlement/payment state, not professional services.
- `schema.ts:540-618` defines `Chat`, `ImmigrationConversation`, and `ConversationTurn`; the turn has a unique chat/client-turn key. `schema.ts:627-724` defines ConsultationRequest/Event. `schema.ts:325-481` defines LawyerClarificationRequest, its messages/events, and trace linkage.
- `chatbot/lib/conversations/scope.ts:1-89` defines the present `ProjectScope` as `projectId: null`; conversation-document resolution is exact-conversation scoped. `history-runtime.ts:20-100,117-120` creates/lists current conversations and reads old Chat history as legacy without backfill. `lib/db/queries.ts:2300-2447` provides owner-scoped create/read and creation with a policy binding.
- `chatbot/lib/conversations/turn-ledger.ts` documents the shared durable idempotent turn contract; `widget-turn.ts:167+` begins a fenced turn and `:290+` completes it. Fast, Legal Check, and Premium routes call this shared lifecycle (`app/api/widget-chat/route.ts`, `widget-chat-fast/route.ts`, `widget-chat-direct/route.ts`; exact calls found at their `beginWidgetTurn`/`completeWidgetTurn` sites). The separate general `/api/chat` route persists ordinary `Message_v2` messages and is not the immigration-widget turn protocol.

### Documents and evidence

- `schema.ts:729-854` defines `MatterDocument`, `DocumentProcessingRun`, and `DocumentEvidenceUnit`. A stored document requires both `userId` and `chatId`; the chat FK is restrictive. Processing runs retain run status/history and evidence units carry locator/provenance/text, but there is no Project asset, application-package version, or logical document-version entity in this model.
- `lib/matter-documents/service.ts:117-132,192-219` verifies conversation ownership on upload, lists by `userId + chatId`, and labels account-history results `projectId: null` / `evidenceScope: conversation`. `queries.ts:2594-2690` uses owner/chat scope for evidence lookup and owner scope for portal/download/delete paths.
- `lib/matter-documents/ai-evidence.ts:22-45` selects the server-owned evidence source. `ai-evidence-packet.ts:3-8,80-145` applies bounded limits (8 documents, 16 units per document, 64 units total, 6,000 characters per unit, 20,000 per document, 64,000 total) and selects only owned, same-chat, clean, stored, non-deleted evidence. `legal-service/app/services/customer_document_context.py:8-23,83-102` treats customer uploads as untrusted data and authorizes only canonical request-provided document IDs.
- **Lifecycle blocker:** `lib/matter-documents/chat-deletion.ts:19-73` removes original objects and rows during chat deletion; `lib/db/queries.ts:2812-2840` deletes MatterDocument rows along with chat data. Cross-chat Project references therefore cannot promise retention unless Project ownership and chat deletion are reconciled explicitly. A foreign key or read resolver alone will not solve the deletion behavior.

### Policy, lawyer, portal, and payment surfaces

- `schema.ts:1010+`, `1096+`, `1148+` store Policy Intelligence items, source snapshots, and revisions. `schema.ts:1409-1460` defines `ConversationPolicyBinding`, a chat-keyed topic/revision snapshot; binding-service lookup is server-side. It is a topic/context pointer, not a Project legal finding or legal decision.
- `app/api/client-portal/route.ts:10-38` and `lib/client-portal/service.ts:30-58` authorize the signed-in customer and aggregate existing chats, documents, requests, consultations, and VIP state. No Study Journey workflow was found there.
- Lawyer clarification is an episodic answer-related request with messages/events (`schema.ts:325-481`), not Project-level staff messaging or package review. Attachment consent is explicit and tied to the server-persisted answer-turn manifest (`app/api/lawyer-requests/route.ts:43-55`; snapshot flow in `lib/lawyer-requests/snapshot.ts:247+`). `lib/lawyer-requests/rbac.ts:1-20` restricts access to admins and assigned lawyers; assignment is admin-controlled. Lawyer portal access is assigned-request scoped (`lib/lawyer-workspace/access.ts:7-50`), not a Project dashboard.
- ConsultationRequest/Event stores scheduling and state history (`schema.ts:627-724`; `lib/consultations/service.ts:97+`), not continuous real-time chat. The existing bounded clarification/consultation workflow must not be described as real-time lawyer chat.
- Existing mode access is in `chatbot/lib/assistant-mode-access.ts` (and its route/service callers): Fast access is not a professional engagement; Legal Check/Premium follow account entitlement. Stripe VIP models and `chatbot/lib/assistant-mode-access.ts` concern AI modes only. No professional service contract, staff-confirmed offline fee, or customer authorization record was found. Professional fees must remain separate from VIP/Stripe.

### Relevant regression suites (inspected, not run)

`lib/conversations/turn-ledger.test.ts`, `postgres-history.integration.test.ts`, `widget-route-contract.test.ts`; `lib/matter-documents/ai-evidence-packet.test.ts`, `customer-document-provenance.test.ts`, `chat-deletion.test.ts`, `conversation-document-context.integration.test.ts`; Policy Intelligence conversation-binding unit/integration tests; lawyer attachment selection and RBAC tests; consultation access/state/event tests; and Client Portal tests. No Phase 13 tests exist in the inspected paths. No test result is implied here.


## 3. Reuse / adapt / new boundary

| Capability | Current reusable foundation | Phase 13 gap and proposed boundary |
|---|---|---|
| Project and Chat | `Chat`, `ImmigrationConversation`, owner-scoped history and durable turn ledger | **PROPOSED:** add explicit Study Journey Project aggregate and membership; associate selected project conversations through a separate link. Keep standalone chats standalone and preserve the shared turn ledger unchanged. |
| Cross-chat files | MatterDocument upload, scanning/processing, evidence provenance, bounded packet and owner controls | **ADAPT:** add explicit Project grants and a Project context resolver that passes only authorized document/evidence IDs. Resolve chat deletion/original object lifecycle before sharing across chats. No implicit account-wide evidence. |
| Facts and requirements | Existing document evidence and source/revision provenance | **NEW:** sourced, versioned FactAssertion records; versioned RequirementTemplate/RequirementInstance and task dependencies. AI extraction remains a proposed assertion until a human confirms or a trusted source verifies it. |
| School admissions | None of the inspected Project-specific application/package workflow | **NEW:** one SchoolApplication per applicant-school-intake combination, with requirements and package snapshots. Keep admissions requirements provisional until education-agent/lawyer review. |
| Visa | Existing immigration legal-research and policy-source infrastructure; no Study Journey visa case/application workflow | **ADAPT/NEW:** keep LegalMatter distinct; link an optional visa application to Project and applicant, reuse source evidence/revision identities, and require legal review gates. Do not reinterpret general chat as a case. |
| Staff communication and queue | LawyerClarificationRequest/messages/events, assigned lawyer queue, ConsultationRequest/Event | **ADAPT/NEW:** preserve request-specific clarification and scheduling semantics. Add Project-level staff collaboration/dashboard and audit events only under explicit Project authorization; do not overload consultation or clarification tables. |
| Contract and fees | Stripe-backed AI VIP purchase/subscription | **NEW:** professional ServiceEngagement, contract version/acceptance, offline-payment confirmation, scope, customer authorization, and lawyer approval. Keep unrelated to VIP entitlements and do not add an assumed payment rail. |
| Package approval/submission | Answer-turn attachment consent is limited to lawyer review; no external application submission model found | **NEW:** immutable package versions and hash-bound approvals; submission gate must refuse external submission in this phase. Future receipts are distinct from approval and are stored only after an authorized real external response. |

## 4. Draft minimal relationship map (PROPOSED, no SQL)

```text
User (owner) ──< ProjectMembership >── StudyJourneyProject
                                      ├──< ProjectConversation >── Chat / ImmigrationConversation
                                      ├──< ProjectDocumentGrant >── MatterDocument
                                      ├──< Applicant >──< SchoolApplication >── RequirementInstance
                                      │                         └──< ApplicationPackageVersion
                                      ├──< VisaApplication >── RequirementInstance
                                      ├──< FactAssertion >── EvidenceRef
                                      ├──< ProjectMessage / ProjectEvent
                                      ├──< ServiceEngagement >── ContractAcceptance / PaymentConfirmation
                                      └──< ReviewTask >── PackageApproval (hash + version bound)

ApplicationPackageVersion ──< SubmissionRecord (future; external submission disabled in this phase)
LegalMatter remains a separate legal workflow and may be explicitly linked to a VisaApplication.
```

Every item above that does not already exist under the audited names is **PROPOSED**. Keep ownership explicit: Project is customer-owned; memberships are role-bearing and project-specific; Applicant is a person/fact scope and should avoid duplicating account identity; school and visa applications belong to a Project but have independent lifecycle; requirement template versions are immutable; task instances bind to one application and template version; package versions are immutable snapshots; approval references one exact package hash/version and authorized reviewer. Do not make project membership equivalent to access to a user's unrelated chats.

### Document ownership recommendation and alternatives

**Provisional recommendation:** introduce a Project-owned logical document asset/grant that references the existing MatterDocument processing pipeline and immutable processing/evidence versions. A source upload may begin in a chat, but Project sharing requires a distinct explicit grant, server-side authorization, and an auditable link to the source. Project retention must survive deletion of a source conversation without deleting shared bytes or invalidating historical package evidence. Existing conversation evidence remains conversation-scoped unless separately granted to the Project.

Before M0-002 freezes the contract, choose one compatible lifecycle implementation:

1. **Project asset owns bytes; MatterDocument remains a conversation intake/evidence record.** Copy or promote an accepted upload into a Project-owned asset with its own lifecycle and immutable evidence reference. Strongest isolation/retention semantics; requires an additive asset model and careful deduplication/versioning.
2. **Decouple physical object/evidence ownership from source Chat, then add explicit Project grants.** Less duplication and likely reuse of current rows, but changes assumptions across deletion, history, and foreign keys. Requires broad compatibility and rollback review.
3. **Retain source Chat as a tombstone while any Project/package references it.** Lowest initial schema disturbance, but complicates deletion/privacy expectations and requires clear user-visible lifecycle and retention rules.

Do not implement a simple `ProjectDocument -> MatterDocument` pointer until one option is approved: current chat deletion deletes both rows and underlying objects, and a nullable `projectId` alone would not establish grant semantics or safe retention.

## 5. Proposed v1 input/output contracts

These are design shapes for M0-002/M0-003 review, not existing APIs.

- **`ProjectContextResolver`** input: authenticated `userId`, `projectId`, `chatId`, requested operation and bounded conversation state. Validate active membership, ownership, explicit Chat association, Project status, and grants. Output: versioned compact Project facts, application/task references, and bounded authorized `EvidenceRef`s with provenance; never raw unrelated account history. Deny cross-user, cross-project, unlinked-chat, revoked-grant, deleted, unsafe, or unprocessed evidence.
- **`RequirementTemplate`** input: stable template key, version, jurisdiction/provider, application type, effective interval, source references, reviewer and approval status. Output: immutable published version and typed requirement definitions with applicability conditions, required evidence kinds, dependencies, and gate policy. Draft templates are not actionable; superseding a template creates a version, not an in-place rewrite. No checklist item becomes mandatory merely because it appears in either provisional PDF.
- **`FactAssertion`** input: stable fact key, subject/application scope, typed value, origin (`user`, `document_extraction`, `provider`, `official_source`, `staff`), evidence refs, observed/effective dates, confidence/verification state, author and revision. Output: append-only assertion revision plus state (`unverified`, `customer_confirmed`, `source_verified`, `disputed`, `superseded`). Provider/model claims are never silently promoted to verified facts; preserve source and human-confirmation lineage.
- **`EvidenceRef`** input: server-issued opaque reference to a Project-authorized MatterDocument/evidence unit or authoritative source snapshot/revision. Output: origin, owner/project grant, source/version/hash where available, processing/security state, locator and dates. Reject model-invented refs, cross-request refs, revoked grants, untrusted/unsafe documents, and unavailable evidence. Do not invent hashes, source dates, or legal version metadata.
- **`ReviewTask`** input: application/package version, requirement or gate, assigned authorized reviewer, reason, deadline/status and event history. Output: explicit pending/approved/rejected/changes-requested state with reviewer identity, timestamp and exact reviewed object hash. Assignment does not imply approval; stale package hashes invalidate a prior approval.
- **`ServiceEngagement`** input: Project, service scope (managed school, managed visa, or another expressly approved scope), contract version, customer acceptance, professional fee terms, offline-payment confirmation and authorizing staff member. Output: auditable state (`draft`, `offered`, `accepted`, `payment_pending`, `staff_payment_confirmed`, `active`, `closed`, `cancelled`) with immutable events. VIP is not an input or substitute for this record. No contract/payment state should be inferred from chat text.
- **`SubmissionGate`** input: exact application and immutable package version/hash, pathway (`self_service` or `managed`), required customer authorization, disclosure acknowledgement, engagement/payment state where managed, required lawyer approval bound to that hash, and current blocking conditions. Output: deterministic allow/deny with typed missing prerequisites and audit record. M0/M1 must have no live submission adapter; allow only explicit preparation/export as separately approved, and never represent a draft as submitted. Self-service must not display fictitious lawyer approval.

## 6. Workflow and guard matrix (PROPOSED)

| Scenario | Project/application state | Gate and required behavior |
|---|---|---|
| No school Offer | Project has applicant; one or more school applications may exist; no offer fact is confirmed | Permit evidence gathering and drafting. Do not create a CoE or imply offer acceptance. Requirements depend on the approved template version and confirmed provider facts. |
| Offer received | Offer evidence is attached to the matching school application and is verified/confirmed | Create/refresh relevant requirement instances only after source/evidence review. Preserve offer version/date; changes invalidate dependent tasks/package snapshots. |
| CoE received | CoE is linked to the correct school application and exact applicant | Treat as a milestone/evidence fact, not an automatic visa approval or submission permission. Visa application may proceed only through its own requirements and gates. |
| Multiple school applications | Separate SchoolApplication per provider/intake | Keep facts, documents, offers, task status and packages scoped to the relevant application. Sharing a Project does not make one school's offer satisfy another school's requirement absent a reviewed rule. |
| Self-submission | Customer independently prepares/submits | Independent of VIP and professional service engagement. Require explicit scope/risk disclosure and customer authorization; no lawyer approval badge or claim of lawyer review unless actually recorded. No external submit in M0/M1. |
| Managed submission | Professional is retained for an exact service scope | Require accepted contract, staff-confirmed offline professional fee where applicable, explicit customer authorization, complete exact package, and lawyer approval bound to package hash at both managed school and managed visa gates. VIP alone never opens this gate. |
| Staff review or messaging | Active Project membership/assignment and relevant role | Enforce project-scoped access and audit every membership, assignment, message and decision. Do not treat an existing consultation or answer clarification as Project authorization. |
| Project/file access | Caller is authenticated and has active Project role plus explicit file/package scope | Deny cross-user, cross-Project, unrelated Chat, revoked membership/grant, unsafe or deleted evidence. Project sharing is opt-in and never inferred from account ownership or AI context. |

The school/visa fact and document IDs in the provisional V0.1 PDF (SC/SD/VC/VD, conditional SX/VX, optional SO/VO, and outcome IDs) are candidate template material only. The PDF itself separates intake facts, evidence, and gates; conditional and optional rows are not a universal checklist. Each item needs education-agent/lawyer applicability, source, version, and effective-date review before it can become an approved requirement.

## 7. Change impact, compatibility, and security

### D-009 scope and existing answer paths

D-009's Phase 12 no-Project boundary is a compatibility constraint for legacy rows and current serving context, not a bar to the separately authorized Phase 13 design. D-P13-001/roadmap allow only new, explicit Project design. Keep legacy chats read-only/no-backfill (`history-runtime.ts:117-120`); do not infer a Project from shared account ownership, old Chat history, a legal matter, or a document. The change should be additive: Projects are opt-in and standalone Chat behavior is unchanged.

Keep the Fast, Legal Check, and Premium widget routes on their current shared turn lifecycle and `(chatId, clientTurnId)` uniqueness (`turn-ledger.ts`, `widget-turn.ts`, route callers). Project context should be a separately authorized resolver input to the existing answer path, not a new answer engine, a new turn ledger, a mode bypass, or a silent cross-chat merge. Preserve request-scoped evidence identity and bounded document evidence rules. Do not change VIP guards or Stripe webhook semantics to represent professional engagement.

### Authorization and privacy negatives required

At minimum, later implementation must prove denial for: unauthenticated user; guessed Project ID; a different customer's Project; Project membership revoked between request and read; member role without that capability; a Chat owned by the user but not linked to the Project; a Chat linked to another Project; document owned by the same account but not explicitly granted; grant revoked after a cached context; cross-user document ID; unsafe/pending/deleted/unprocessed file; stale package or evidence version; unassigned lawyer/staff member; staff trying to assign self; education agent lacking the explicit role/capability; forged customer confirmation, offline payment, or approval; and request retry attempting to replace a stored turn or package decision.

Only project-scoped staff roles should expose Project records; global `lawyer` role or VIP membership alone must not grant access. Staff message visibility must be explicit and auditable, including whether the customer can see the message. Customer files shared to staff need a purpose and scope record, following the existing explicit-consent pattern rather than implicitly sharing all context.

### Migration and rollback strategy (PROPOSED)

Use additive, nullable/new tables and explicit adapters first; do not rewrite or backfill Phase 12 chats/documents. Preserve the old conversation evidence resolver as the default when no explicit Project context is present. Introduce a feature flag/config gate for Project routes and resolver; retain a fast rollback path that disables Project entry points while leaving legacy conversation records untouched. Migrations require the repository's controlled migration process and explicit environment authorization; this audit applies none. Before schema freeze, define retention/deletion, membership revocation, evidence grant revocation, package snapshot retention, and how a Project can be exported/deleted without violating legal hold or customer privacy expectations.

Policy Intelligence source snapshots/revisions can supply traceable source references, but a topic binding is not a current-law finding. Requirement templates need separate provider/admissions provenance and legal source applicability. Changing a source/template/fact or evidence file should invalidate affected requirement decisions and package approvals by dependency, while preserving immutable historical versions and review records.

## 8. Risks and owner/lawyer/agent decisions

### Owner decisions required before M0-002 freezes contracts

1. Confirm Project is a new top-level product object, which account creates it, how applicants relate to the account, whether a Project can contain more than one student/applicant, and what happens when account identity changes.
2. Select document lifecycle option (Project-owned asset, decoupled object with grants, or retained Chat tombstone); define Project deletion, file deletion, legal hold, retention and user-visible revocation semantics.
3. Specify Project member roles and scopes: owner, internal admin, assigned lawyer, education agent, support/operations; who can invite/remove, assign work, see messages/files, confirm payment, and approve a package. Decide whether internal staff collaboration is customer-visible or private.
4. Define managed service scopes and contract versioning, accepted signature/authorization evidence, exact offline-payment confirmation authority, refund/cancellation effects, and which staff roles may activate engagement. Do not reuse VIP or infer a contract from conversation.
5. Define self-service disclosure and authorizations; confirm what actions the product may enable when no professional engagement exists. Confirm external submission remains disabled until a later explicitly approved phase.
6. Choose requirement-template publication and update authority, supported provider/intake identification, source/effective-date capture, and invalidation policy. Confirm that existing source docs remain provisional until signoff.
7. Decide whether/how to associate an existing LegalMatter with a visa application and how to avoid treating any legacy chat as a Project without explicit customer action.

### Lawyer and education-agent signoff required

- Review the six supplied visual/design assets and all SC/SD/VC/VD plus conditional/optional/outcome matrix entries; approve applicability and identify items that are not required, missing, conditional, or provider-specific.
- Establish authoritative admissions sources and update cadence for school/provider requirements, offer/CoE interpretation, translations/certification and evidence acceptability; identify who confirms school-side facts.
- Establish legal source hierarchy, visa application requirements, effective-date/transitional handling, escalation criteria and the legal meaning of each managed lawyer review gate. The AI must not determine these policy choices.
- Define scope of education-agent vs lawyer work, separation of duties, reviewer assignment/qualification, when a second reviewer is necessary, and what constitutes approval for the exact package hash.
- Review customer-facing self-service limitations, managed-service representations, professional engagement terms, privacy, document retention, and any disclosure that could otherwise imply legal advice or guaranteed outcome.

These are approval questions, not decisions this audit makes. No new decision is recorded in `DECISIONS.md`; M0-001 remains a draft awaiting owner review.

## 9. M0-002 work items and minimum pre-M1 validation (not performed)

1. Resolve the owner/lawyer/agent decisions above; record accepted decisions and non-goals in the roadmap/decision log. Convert only reviewed requirements into approved template candidates with source, version, effective interval and responsible approver.
2. Freeze principal/role/capability matrix, Project and applicant ownership, explicit Chat linking, document grant/revocation semantics, file/object deletion behavior, retention and legal-hold rules.
3. Freeze entity contracts and state transitions for Project, membership, school application, visa application/LegalMatter link, sourced FactAssertion, RequirementTemplate/version/instance, Project messages/events, ServiceEngagement, immutable package version, ReviewTask, approval, and future receipt.
4. Define application/task dependency and invalidation rules, including changed applicant facts, changed provider offer/CoE, changed requirement template/source, replaced/deleted evidence, revoked access, and any package edit after lawyer review.
5. Define additive schema/route rollout and rollback plan; document old-chat/no-backfill behavior and preserve existing read/list APIs. Do not apply migrations during design.
6. Specify test contracts before M1: unauthenticated and cross-user/project denials; no explicit grant; revocation races; Chat deletion with shared evidence; safe/unsafe processing states; evidence provenance and bounds; legacy no-Project Fast/Legal Check/Premium behavior; duplicate/retried turns; template immutability; assertion provenance/dispute/supersession; package hash approval invalidation; managed vs self-service gates; VIP/fee separation; offline payment spoof rejection; staff role/assignment boundaries; no live submission; migration forward/rollback rehearsal in an isolated authorized test DB.
7. Add representative school and visa scenarios only after domain review, including no Offer, Offer, CoE, multiple schools, self-service, managed service, missing evidence, changed facts and stale approval. Keep these as workflow fixtures, not hard-coded routing rules.
8. After M0-004 independent review and explicit owner acceptance, authorize M1 separately. Before then, make no Phase 13 code, migration, DB, deployment, external-submission or paid-provider changes.

## 10. Audit outcome

**M0-001: DRAFT DELIVERED — AWAITING OWNER REVIEW; NOT ACCEPTED.** The principal implementation boundary is clear enough for review: add explicit Project/application structures and a Project evidence grant/resolver, preserve existing chat-scoped behavior and durable turns, keep professional engagement separate from VIP, and bind human approvals to immutable package versions. The document lifecycle conflict is a material M0-002 contract decision: the existing chat deletion flow removes MatterDocument rows and bytes, so a Project cross-chat pointer cannot be treated as safe retention.

Owner review should first decide the Project/document ownership contract, roles/memberships, applicant/application cardinality, and managed/self-service/legal-review rules. Lawyer/education-agent review should then determine the admissible facts and requirements; no PDF checklist is approved by this report. No code, tests, database access/mutation, migration, paid model, external service, or live submission was performed. Do not commit or push automatically.
