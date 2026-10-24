# Phase 13 M0-004 — Independent Architecture Review and Technical Contract Freeze Proposal

## Final Owner Acceptance and Technical Freeze Addendum — 2026-10-24

**Current status:** **M0 TECHNICAL FOUNDATION ACCEPTED — M1.1 TASK PREPARATION READY.** M0-004 independent architecture review: **PASS**. D-P13-002 through D-P13-005 record the seven accepted technical decisions and the bounded foundation freeze. **M1.1 IMPLEMENTATION NOT YET AUTHORIZED.** The implementation and security/regression verification have not occurred.

**Finding disposition:** F-01 and F-02 are **RESOLVED AT THE OWNER-DECISION LEVEL** by D-P13-002 and D-P13-003. Required implementation and regression/security verification remain pending.

**Accepted owner decisions:** D-P13-002 and D-P13-003 remain accepted for dual Project/Chat authorization and durable rollback history. D-P13-004 records C–G: canonical owner and cardinality; customer membership lifecycle; soft closure with read-only access to only the still-authorized caller's own Project Chat; minimal existing-Workspace Project UI with no member dashboard; and actor/operation-scoped idempotency with canonical request hashes and atomic Project Chat/event creation. D-P13-005 freezes these with the existing Chat/turn-ledger contract and the separation of later evidence, workflows, professional review and payments.

**Normal-closure resolution:** D-P13-004/E adds read-only history after normal closure for a user who remains authorized, limited to that user's own Project Chats. A closed Project permits no new Chat, AI turn or business mutation. Revoked membership denies subsequent access and cannot be restored by closure or feature rollback. This supersedes any earlier proposal that closure denies all reads; it does not change D-P13-003's separate emergency feature-disable fallback. Neither state deletes or relabels persisted Chat/Turn rows.

### M0 exit checklist evidence

| Roadmap M0 criterion | Evidence and disposition |
|---|---|
| Source/repository map at a pinned checkpoint | M0-001 and this review cite source paths at the stated checkpoint; inspected source confirms current implementation boundaries. |
| Four provisional matrices mapped to versioned source references | M0-003 and the lawyer-feedback delta record the proposed mapping and source/provenance handling. Matrices remain **PROVISIONAL**, not approved rules. |
| Self/managed modes and admission entry routes represented | M0-003 documents these pathways and distinct gates; this is architecture evidence, not live workflow validation. |
| Project vs Chat vs LegalMatter, migration and rollback boundaries | M0-002/M0-004 plus D-P13-002–D-P13-005 define identity separation, no legacy linking, additive foundation, durable history and rollback. |
| Staff, document sharing, GS, project messaging and per-school review boundaries | Covered as proposed later-stage contracts in M0-002/M0-003; not authorized or implemented by this freeze. |
| Version-bound review/submission guards | M0-003 documents candidate controls; professional approval and any external action remain pending. |
| Policy/source governance and impact handling | M0-003 documents the candidate versioned governance contract; operative rules remain subject to qualified review. |
| Unverified assertions and legal/professional limits explicit | M0-001–M0-004 and the lawyer-feedback delta preserve the pending approvals; no approval or live operation is fabricated. |
| Owner acceptance for bounded M1 foundation | D-P13-002–D-P13-005 accept the seven named technical decisions and freeze only the listed foundation. They do not accept every M0-002/M0-003 proposal or authorize implementation. |

The documented M0 exit is satisfied **for the bounded technical foundation**. Matrix/professional criteria are satisfied only as documented provisional boundaries; they are not operative legal or admissions approval.

### Frozen M1 foundation and later-stage candidates

Frozen for bounded preparation: explicit Project and canonical owner; additional customer membership with pending/active/revoked states; new Project Chat association; current owner-plus-Project authorization at linked-Chat operations; no transcript access across members; existing durable Chat/turn identity; soft closure and restricted read-only history; separate rollback fallback; durable operation idempotency; minimal Project creation/selection/Chat entry in the existing Workspace; and no Project-to-LegalMatter or Project-to-VIP conflation.

ApplicationParty/Role normalization, staged application subtype enforcement, Project evidence/document grants, full staff authorization, requirement/source registries, education/visa workflows, professional engagement, financial custody, GS/OSHC rules, package review, submission and remaining M2–M8 details stay outside this freeze and require their applicable owner or professional gates. Lawyer/admissions matrices remain **PROVISIONAL**; financial custody and privacy/retention decisions remain pending.

**M1.1 task:** [PHASE13_M1_001_PROJECT_FOUNDATION_CONTRACT.md](./PHASE13_M1_001_PROJECT_FOUNDATION_CONTRACT.md) is prepared as **READY FOR INDEPENDENT REVIEW — NOT AUTHORIZED FOR IMPLEMENTATION**. It specifies the additive database foundation and future isolated migration/security tests only. No code, migration, test, database, cloud, payment or live operation was performed for this addendum or task-contract preparation.

The earlier disposition and A/B-only Owner Decision Addendum below are retained as history. This final addendum supersedes their freeze and outstanding-decision status with D-P13-004/D-P13-005.

**Disposition (updated 2026-10-24):** M0-004 independent architecture review: **PASS**. Owner decisions A and B are accepted as technical contracts; see the Owner Decision Addendum. The technical freeze remains a **CANDIDATE** pending complete owner acceptance of the named contracts. M1 is **NOT YET AUTHORIZED**. No legal, admissions, financial, privacy, or professional approval is inferred.

**Repository checkpoint:** branch phase13-study-journey-project-centric; HEAD 5984a99b52974ee47bcb8107c73a6ba44856a475; worktree was clean at review start. The branch and SHA match the M0-004 brief.

**Review date:** 2026-10-23 (repository source records and supplied brief date). No branch, code, migration, database, cloud, payment, external source, or customer data was changed or accessed.

## Owner Decision Addendum — 2026-10-24

The owner accepted Decisions A and B on 2026-10-24. The durable records are [D-P13-002 and D-P13-003](../DECISIONS.md).

- **A — Project and Chat dual authorization: ACCEPTED.** One Project may have multiple customer members; each Project Chat remains owned by its authenticated creator; membership gives no access to another member's transcript. Every Project-linked history, detail, update, widget-turn, and other relevant operation must check both current Chat ownership and current Project authorization, including lifecycle and membership status. Existing Standalone Chats are not linked. Revocation denies subsequent Project Chat operations, and browser Project IDs/roles are selectors only.
- **B — Rollback and durable Chat history: ACCEPTED.** Feature disablement preserves persisted Chat/Turn records and authenticated Chat-owner read-only history via a clearly identified Project-origin fallback. The fallback enables no Project writes, Project AI context, or model turns, does not reclassify Chats as Standalone, and does not bypass revocation or another current restriction. Rollback, closure, and revocation remain distinct; case-specific closure access and retention/privacy policy remain pending.
- **Finding disposition:** F-01 and F-02 are resolved at the owner-decision level. Implementation and security/regression verification remain pending; no code or security test is claimed as passed.
- **§5.A decisions not included in A/B:** Project/account cardinality and transfer details; whether the owner also has a membership row; invitation and acceptance mechanics; detailed closure access, deletion, retention, and legal-hold policy; normal active-Project Chat entry/history UI scope; and Project/create-link idempotency details. These remain open only for the corresponding M1 contracts or behaviors; do not infer acceptance from the recommendations below.
- **Recommended M1 foundation boundary:** Additive Project identity/membership/Project-Chat association only; reuse existing Chat and durable turn ledger; enforce D-P13-002 on every linked-Chat path; associate only newly created Project Chats; preserve the D-P13-003 read-only Project-origin fallback under current authorization. Keep Project context, documents/uploads, applications, staff workflows, payments, and submissions out of M1. Define synthetic security/regression cases for dual checks, revocation, rollback, and Standalone compatibility. This is a recommendation, not implementation authorization.

M0-004 independent review is **PASS**; owner decisions A/B are **ACCEPTED**; technical freeze is a **CANDIDATE** pending complete owner acceptance of the named contracts; M1 is **NOT YET AUTHORIZED**. Lawyer/admissions matrices remain **PROVISIONAL**. Financial custody, privacy/retention, GS, and OSHC decisions remain pending with applicable owners and professionals.

## 1. Review scope, evidence, and source authority

This was a documentation-only independent cross-review of the Phase 13 M0-001 audit, M0-002-R1 data/authorization design, M0-003-R2 workflow/policy design, their task contracts, the provisional roadmap, the 2026-10-23 lawyer-feedback delta, the current project status documents, the Phase 13 decision record, and the relevant checked-in implementation paths.

Repository evidence was checked directly at the stated HEAD. The actual implementation is authoritative for what exists; M0 reports are proposals unless they cite source code; D-P13-001 records the owner-approved product direction and design preparation scope, not final technical acceptance. The legal/admissions matrices and LF-01 through LF-08 are provisional. The feedback delta says the separately annotated PDF was not found locally and that the checked-in V0.1 PDF contains URL-link annotations only. This review treats the feedback delta as provisional practitioner input and does not attribute the comments to the unannotated PDF.

Relevant implementation evidence includes:

- chatbot/lib/db/schema.ts:19-40,540-618 — User, Chat, ImmigrationConversation, and durable ConversationTurn; Chat has a required user owner; turns are uniquely keyed by (chatId, clientTurnId).
- chatbot/lib/db/queries.ts:2360-2379,2390-2445 — owner-scoped conversation lookup and transactional Chat + ImmigrationConversation + policy-binding creation.
- chatbot/lib/conversations/turn-ledger.ts:95-112,255-285 and chatbot/lib/conversations/widget-turn.ts:167-245,290-343 — owner-checked turn start and fenced durable completion.
- chatbot/app/api/immigration-conversations/route.ts:4-18, chatbot/lib/conversations/conversation-http.ts:152-277, and chatbot/components/immigration-ai-workspace.tsx:950-985 — current authenticated standalone conversation API and UI creation path.
- chatbot/lib/conversations/scope.ts:1-88 — Project scope is presently fixed to projectId: null; document and memory scope remain conversation-bound.
- chatbot/lib/db/queries.ts:2565-2585, chatbot/lib/matter-documents/service.ts:141-178, and chatbot/lib/matter-documents/security-reconciliation.ts:24-70 — the source-level storage/scanner state contradiction described in M0-002.
- chatbot/lib/db/migrations/ and chatbot/lib/db/migrations/meta/_journal.json — checked-in migration convention; latest checked-in migration is 0029.

No Project, ProjectMembership, ProjectConversation, Project document, Project workflow, or Project authorization implementation was found in the inspected source. No live database, production scanner delivery, current external law, institution policy, staff credentials, payment custody, retention process, or external submission path was verified. No tests were run; they were not required for this documentation-only task.

## 2. M0-001 / M0-002 / M0-003 consistency matrix

| Contract area | M0-001 as-is boundary | M0-002 proposal | M0-003-R2 proposal | Independent result |
|---|---|---|---|---|
| Project, Chat, LegalMatter identity | Existing Chats are User-owned; Project and LegalMatter are distinct. | Add Project-owned aggregate and separate Chat association; never infer a Project from a Matter or Standalone Chat. | Project journey orchestrates independent application workflows; Project creation remains explicit. | Consistent. Keep the distinct identifiers and authority roots. |
| Ownership and memberships | Existing source has no Project membership. | One owner per Project; ProjectMembership is scoped, unique by Project/User, revocable; owner authority comes from Project.ownerUserId. | Owner/member and later staff capabilities are Project/application scoped; no global lawyer/admin access. | Coherent direction, but membership admission/lifecycle and its combination with current owner-only Chat access need an M1 decision; see F-01. |
| Project chats and turns | Existing conversation history and turn ledger are owner-scoped and durable. | Link only newly created Project chats atomically; reuse Chat, ImmigrationConversation, and turn ledger. | Project-created chats remain inside the existing turn lifecycle; Project context is server-resolved later. | Compatible only with an explicit dual authorization contract at history, detail, update, and all widget turn entry points. An association row alone grants no access. |
| Legacy chat/document scope | Existing MatterDocument is Chat-scoped; deletion removes the Chat's document objects/rows. | No old-chat relink or automatic backfill; selected future imports create independent Project-owned copies. | Standalone remains isolated; Project data is introduced by milestone, not by broadening existing context. | Consistent and privacy-preserving. |
| Project document ownership and evidence | No Project assets/evidence exist in code. | Prefer Project-owned logical assets, immutable versions, explicit grants, typed evidence refs and independent Project lifecycle. | Project evidence remains version-bound; same-Project application grants and admission-anchor links are separate typed relationships. | Consistent. Use this only from M2 onward, after the scanner issue in F-06 is addressed for Project data. |
| Fact assertions and people | Existing User is an account identity, not a Project applicant/guardian model. | ProjectPerson separates person identity from User; application parties bind people to applications; FactAssertion carries evidence and confirmation/verification provenance. | Applicant-specific facts and family roles are preserved; confirmations, extraction, source verification and applicability remain separate. | Consistent. Resolve the ApplicationParty key/role normalization in the freeze candidate below. |
| Generic application and subtypes | No Project applications exist in source. | Generic ProjectApplication with SchoolApplication and VisaApplication subtypes; the initial ERD suggests an exactly-one-subtype constraint. | Introduces the generic scope at M2 and subtype tables only with later workflow milestones; proposes a provisioning state and stage-wise enforcement. | Earlier immediate exactly-one language conflicts with staged introduction. M0-003 supplies the coherent staged correction; owner choice remains before M2 (F-04). |
| Evidence/document verification | Existing document processing has separate processing and security fields, with a source-level defect. | Project storage/security are independent; evidence is exact-version and grant scoped. | Separates security, extraction completeness, authenticity/issuer basis and professional sufficiency. | Consistent proposed contract. Do not let any one dimension imply another. |
| Workflow and task authority | No Study Journey workflow or task planner exists in source. | Proposes generic tasks, requirements and human approval records, not current behavior. | Fixed versioned stages; deterministic required-task materialization; bounded AI task suggestions with cursor/backlog; constrained service principals. | Consistent and well-bounded. The four registries remain provisional; no AI actor can add a gate or confer human authority. |
| Rules, dates, publication and impact | Existing Policy Intelligence has source/revision patterns, not Project eligibility decisions. | Proposes versioned source/template references and scoped invalidation. | Adds three-valued applicability, event-time evaluation, atomic publication plus transactional outbox and dependency-scoped reevaluation. | Consistent. Reuse provenance patterns only; do not duplicate the Policy Intelligence legal source authority. |
| Offer, acceptance, conditions and CoE | No such workflow exists in source. | Future application outcome records are separate from approval/submission. | Separates Offer authenticity/version, customer decision, conditions, institution acknowledgement and actual CoE. | Semantics are coherent in prose; one diagram edge remains ambiguous for condition-first procedures (F-05). |
| Packages, GS, self/managed | No Project package or submission records exist. | Immutable package/hash, customer authorization, exact lawyer approval and human receipt concepts. | Preliminary export is distinct from confirmation, exact-hash approval, managed readiness and external action; two GS artifacts have distinct purposes. | Consistent. Comprehensive GS material is not implicitly the form answer set or an accepted attachment. |
| Engagement and money | Existing VIP/Stripe records are AI entitlement/payment only. | Professional service engagement and fee conditions are separate from VIP. | One PaymentEvent may fund multiple service-fee obligations through PaymentAllocation; third-party tuition/deposit custody and direct school payment are separate concepts. | Consistent as a proposed ledger. No accounting, trust, custody, account-type or money-movement approval exists. |
| Closure, deletion and rollback | Existing same-account conversation history is durable; legacy Chat deletion has its current document semantics. | Project closure/deletion/retention are unresolved; proposed rollback quarantines Project rows/objects. | Keeps append-only histories and requires staged rollback, but does not settle how Project-created Chat turns remain owner-accessible if Project features are disabled. | Requires an M1 durability clarification (F-02); do not interpret feature rollback as permission to strand user-owned turns. |

## 3. Ranked findings

### F-01 — OWNER DECISION ACCEPTED; IMPLEMENTATION VERIFICATION PENDING (review-time M1 blocker)

**Affected design:** M0-002 §§2, 4 (ProjectMembership and ProjectConversation), 6, 7 (CreateProject and LinkConversation), 11; M0-003 §§1.3, 2, 6.3 and 15; Phase 13 roadmap §§1–2.

**Source evidence:** Chat requires userId in schema.ts:540-550; getOwnedImmigrationConversation filters by chat.userId in queries.ts:2362-2377; the turn-ledger repository resolves ownership through getOwnedConversation in turn-ledger.ts:95-100,271-285. The standalone history API likewise authenticates a user and queries their conversations.

**Conflicting invariant / gap:** Project designs require current Project membership and ProjectConversation linkage, while existing history/turn paths authorize by Chat owner alone. The documents do not say whether a Project membership grants access to another member's Chat transcript, whether a member's own Project chat remains usable after membership revocation, or how Project-created chats are presented through existing history paths. ProjectConversation alone is not an authorization check.

**Consequence if implemented as written:** A future Project route could accept a valid Project ID but fail to preserve Chat owner constraints; a member whose Project access was revoked could still use an owner-created Chat through existing owner-only turn routes; or a member could be granted another person's full pre-existing history by linking a Chat. Conversely, an authorized Project member who is not the Chat owner may be denied by existing queries.

**Narrow resolution proposed:** Before M1, adopt all of these defaults:

1. StudyJourneyProject.ownerUserId is the single canonical owner. A User may own many Projects; no ownership transfer is in M1. ProjectMembership is unique per (projectId,userId) and represents additional customer principals, with explicit pending/active/revoked state if invitations are supported. The owner cannot be removed or revoked through the member path.
2. A Project conversation must be newly created in the same transaction as its ProjectConversation association. The authenticated creator must be the Chat owner and either the Project owner or an active customer member. A Chat can have at most one ProjectConversation. Existing Standalone/legacy Chats are never linked.
3. For every Project-linked history read, detail, update, and widget turn, require both Chat.userId == authenticatedUserId and current access to the associated active Project as owner or active member. Revocation or Project closure denies the next operation. Project membership does not grant another member's full Chat transcript in M1; each Project Chat remains owner-only. Sharing transcript history needs a later explicit contract.
4. A Project ID or membership claim supplied by the browser is a selector only; authorization comes from current server records. Keep the standalone branch unchanged for Chats without a ProjectConversation.
5. Define whether Project-created Chats appear in the standalone history UI. Recommended default: Project-specific creation/listing uses a distinct Project entry and origin; existing Standalone creation never creates an association. If account history includes Project chats, it must label and route them without implying Project context or cross-member access.

**Owner-decision disposition (2026-10-24):** Accepted as D-P13-002. The M0-004 finding is resolved at the owner-decision level.

**Implementation status:** Dual authorization, revocation behavior, and Standalone compatibility still require implementation and security/regression verification. M1 remains unauthorized pending a separate implementation task and authorization.

### F-02 — OWNER DECISION ACCEPTED; IMPLEMENTATION VERIFICATION PENDING (review-time M1 blocker)

**Affected design:** M0-002 §11 rollback paragraph and §11 compatibility contract; D-009 and D-010 in docs/agent-memory/DECISIONS.md; M0-001 §2; M1 requirements in the M0-004 brief.

**Conflicting invariant / ambiguity:** M0-002 proposes disabling Project routes and leaving Project rows/objects “quarantined and access-denied by default.” D-009/D-010 require durable owner-authorized conversation history and one shared idempotent/fenced turn contract. A Project-created Chat and its ConversationTurn rows are existing User-owned durable data, not merely Project-specific evidence. The design does not specify whether rollback quarantines only Project control/context or also blocks the owner from their Chat history.

**Consequence if implemented broadly:** Feature rollback could strand previously persisted user messages or make “saved” turns inaccessible, contrary to durable-history guarantees; exposing them as ordinary standalone conversations without Project-origin state could also misrepresent their scope.

**Narrow resolution proposed:** A Project feature kill switch disables new Project writes, Project context, and Project-specific operations. It must not delete or orphan Chat/turn rows. Preserve authenticated owner access to existing Project Chat history, at least read-only, through a clearly labelled fallback that does not reclassify the Chat as Standalone and does not provide Project data context. Keep Project metadata dormant/quarantined; no membership broadening. Define recovery/re-enable separately. This is a product durability choice, not a database rollback.

**Owner-decision disposition (2026-10-24):** Accepted as D-P13-003, consistent with D-009/D-010. The M0-004 finding is resolved at the owner-decision level.

**Implementation status:** Durable fallback, Project-origin labeling, no-write/no-context behavior, and preservation of existing restrictions still require implementation and security/regression verification. M1 remains unauthorized pending a separate implementation task and authorization.

### F-03 — NONBLOCKING_REFINEMENT: ApplicationParty identity and role uniqueness needed normalization

**Affected design:** M0-002 §3 ERD and §4 ApplicationParty/relational constraint 6; M0-003 §13.1; M0-002 task contract §A.

**Conflicting invariant:** M0-002's UNIQUE(applicationId,personId,partyRole) cannot support the proposed FactAssertion FK that identifies an application party by project/application/person without partyRole. Fact identity should not vary with whether the same person is applicant, guardian, or representative.

**Consequence:** The stated composite FK has no matching unique target, or facts become role-bound and duplicated.

**Narrow resolution proposed:** Use one ApplicationParty row per (projectId,applicationId,personId) and a child ApplicationPartyRole relation for one or more roles. Put the at-most-one principal-applicant uniqueness rule on the role relation. Fact assertions reference the party identity independent of role. This adopts the preferred M0-003 §13.1 option; the role-set-on-party-row alternative is not recommended because role-level provenance becomes harder.

**Milestone:** freeze candidate now; validate constraints and stage-wise negative tests in M2.

**Blocks:** no M1 work. The technical defect is precisely resolved in M0-003's proposal but still needs owner acceptance.

### F-04 — DEFERRED_LATER_MILESTONE: Application subtype constraint must follow staged introduction

**Affected design:** M0-002 §§3–4 subtype tables and exact-one deferred trigger; M0-002 §11 staged introduction; M0-003 §§2, 13.2, 15, 17.

**Conflicting statements:** M0-002 describes a generic ProjectApplication introduced in M2 and school/visa subtype tables in later milestones, while also proposing a deferred constraint that requires exactly one matching subtype at transaction end. M0-003 correctly notes that this would reject the valid M2 provisioning row before those subtype tables/workflows exist.

**Consequence:** Either M2 cannot create its planned generic scope rows, or incomplete applications could incorrectly reach active gates if enforcement is simply omitted.

**Narrow resolution proposed:** Adopt M0-003 §13.2's staged model: M2 generic row begins provisioning; it may have no subtype and cannot enter any readiness gate. When each workflow is introduced, base and matching subtype are created atomically. An active row must have exactly the matching enabled subtype, with stage-specific validated constraints and migration preflight. Introduce a final cross-subtype invariant only after both types exist. Prefer the staged subtype-table approach; retain the single wide discriminated-row alternative only for explicit owner rejection of that default.

**Milestone:** owner choice before M2; stage tests in M5 and M6–M7.

**Blocks:** neither M1 nor the current freeze proposal if the proposed default is accepted; do not freeze this as an already-approved owner decision.

### F-05 — NONBLOCKING_REFINEMENT: Offer diagram's unconditional decision edge is ambiguous

**Affected design:** M0-003 §4.3 supplementary Mermaid diagram and §4.1 Offer transition table.

**Conflicting statements:** The prose and transition table allow the customer decision only when the verified institution procedure permits it; if conditions must precede that decision, the customer first satisfies the condition. The diagram still draws a direct OfferVerified --> CustomerDecision edge and a second conditional path through ConditionSatisfied. A reader can interpret the direct edge as universal.

**Consequence:** An implementation copied from the diagram could offer acceptance before a known condition-first procedure permits it. A repeated-decision loop is correctly rejected by the prose but should remain visually impossible.

**Narrow correction:** Replace the direct edge with OfferVerified --> InstitutionProcedureGate; branch to CustomerDecision only when the captured, scoped procedure permits decision now; branch to OfferConditionsTracked when a condition is required first; branch to NeedsReview when sequence is unknown. ConditionSatisfied may enable an as-yet-unrecorded decision only. It never loops back to record an acceptance already made for that Offer version. Keep acknowledgement and actual CoE as separate issuer events.

**Milestone:** correct before M5 workflow implementation.

**Blocks:** no M1 work and no substantive state-machine redesign.

### F-06 — DEFERRED_LATER_MILESTONE: Existing stored-to-clean scanner transition is unsafe for Project document use

**Affected source:** chatbot/lib/matter-documents/service.ts:141-178; chatbot/lib/db/queries.ts:2565-2585; scanner reconciliation in chatbot/lib/matter-documents/security-reconciliation.ts:24-70 and its adapter in queries.ts:3398-3407. M0-002 §5/R1-1 and M0-003 §§1.2, 5.3, 14, 16.

**Conflicting invariant:** Upload initializes security state as pending, but the checked-in storage transition sets securityStatus=clean when storageStatus becomes stored. The security reconciliation path is a separate scanner-verdict transition. This review confirms the source contradiction; it did not establish deployed scanner behavior.

**Consequence:** If a future Project document adapter reuses the existing transition semantics as evidence of a scanner verdict, stored bytes could be admitted to extraction/context without an authenticated clean result.

**Narrow resolution proposed:** Keep the M0-002 Project contract: storage completion only changes storage state; only the trusted scanner reconciliation path can set security state for the exact immutable version. Do not use the existing MatterDocument stored flag as scan evidence. Project M1 must include no uploads, extraction, document context, import, or document APIs. Authorize and test any separate legacy scanner remediation before real Project document use.

**Milestone:** M2 document foundation, before Project evidence processing with actual customer data; separate authorization for any legacy code repair.

**Blocks:** no M1 Project-only foundation; blocks actual Project document use until fixed and tested.

### F-07 — PROFESSIONAL_APPROVAL_PENDING: feedback and provisional matrices remain non-operative

**Affected design:** roadmap §§0–1, 4a; lawyer delta §§2–6; M0-003 §§1, 8, 16–17; M0-002 §§8, 13.

**Conflict status:** No technical inconsistency was found. The risk is authority: provisional matrix categories, owner-supplied lawyer comments, current-source applicability, institution processes, GS requirements, evidence sufficiency, disclosure and money custody are not approved rules.

**Consequence if treated as operative:** The system could encode an unverified legal/admissions rule, infer an exemption or adverse finding from nationality/family/migration plans, misstate an Offer/CoE sequence, present an unapproved GS form, or mishandle company-held third-party funds.

**Resolution:** Keep the four matrices provisional; preserve source and reviewer provenance; obtain decision-specific approval from the appropriate lawyer, education agent, finance, owner, or privacy/records authority before operative templates, real-case professional service, or money custody. LF-07 does not establish a nationality rule. LF-08 does not establish current form questions or attachment acceptance.

**Milestone:** as mapped in the decision ledger; no effect on synthetic M1 Project identity/chat tests.

**Blocks:** later operative feature or release only; not M1 technical development.

## 4. Recommended technical freeze candidate matrix

Statuses below describe the review-time recommendation. The 2026-10-24 Owner Decision Addendum and §5.A statuses govern current owner acceptance for A/B; no other recommendation is accepted by implication. FREEZE_CANDIDATE means a contract was ready for owner acceptance; OWNER_DECISION_REQUIRED means a product choice remains; PROFESSIONAL_PENDING means a domain authority must decide before operative use; DEFERRED_IMPLEMENTATION_DETAIL means the invariant is defined but its implementation belongs to a later milestone.

| Owner / layer | Contract and purpose | Identity, Project/application scope | Version / lifecycle invariant | Authorized actors | Existing infrastructure interaction | First milestone / later dependency | Acceptance criterion | Status |
|---|---|---|---|---|---|---|---|---|
| Product / API + DB | StudyJourneyProject identity and lifecycle | One Project has one canonical ownerUserId; one User may own many Projects; never a LegalMatter or Chat | Active to closed/tombstoned; revisioned; no owner transfer or hard deletion in M1 | Authenticated registered customer; owner derives from session | New additive entity referencing User; no change to Chat identity | M1; retention/deletion depends on privacy decision | Two Projects for one User remain isolated; Project cannot be inferred from chat or legalMatterId | FREEZE_CANDIDATE |
| Product / authorization | ProjectMembership | Unique Project/User; additional customer member only; explicit pending/active/revoked | Revocation effective on next authorization check; owner cannot be revoked; no staff grants in M1 | Owner invites; invitee accepts; owner revokes; exact invite lifecycle requires owner choice | No global lawyer/admin or VIP access; actor identity from auth | M1; staff assignments in M4 | Revoked/expired member loses every Project route immediately; invite/accept cannot reveal data before acceptance | PARTIALLY ACCEPTED: current membership checks and revocation effect accepted; invitation mechanics and other lifecycle details pending |
| Conversation / authorization | ProjectConversation | One Chat linked to at most one Project; linked Chat's owner is the authenticated creator; link target must be active Project | Create Chat + ImmigrationConversation + association + audit atomically; no old-chat linking | Project owner or active customer member creates own Chat | Reuse User/Chat/ImmigrationConversation and existing owner-scoped turn ledger; Project association adds a membership check | M1; any cross-member transcript sharing is separate later decision | Duplicate link denied; cross-owner link denied; failed transaction leaves no Chat or dangling association | PARTIALLY ACCEPTED — D-P13-002 accepts creator ownership, dual authorization, and no silent Standalone linking; other association details remain recommendations |
| Conversation / compatibility | Project chat and history separation | Project-created Chat stays associated; its transcript stays owned by its Chat creator | No implicit relabeling as Standalone; current Project authorization includes lifecycle/membership; exact closure behavior remains pending; rollback fallback preserves owner history under current authorization | Creator can read own history while Project authorization permits it | Extend shared authorization boundary around history/detail/update/widget calls; do not fork turn ledger | M1; Project evidence resolver is M2 | Project chat uses same turn IDs, replay, lease/fencing, message durability; existing standalone behavior and account history remain correct | PARTIALLY ACCEPTED — D-P13-002/D-P13-003; implementation and remaining UI/closure details pending |
| Product / authorization | Project membership and Project closure | Membership/project scope; no application scope in M1 | Closure behavior remains a separate choice from feature rollback and membership revocation; no hard delete until retention is decided | Owner/member authority and any close action require a later scoped contract | Add Project lifecycle events; no legal-matter side effect | M1; production retention and erasure need privacy/records decision | Rollback access does not decide normal closure access; closure and retention behavior require owner/privacy review | PARTIALLY ACCEPTED: rollback, closure, and revocation must remain distinct; detailed closure access and retention remain pending |
| Conversation persistence | Shared turn ledger | Existing (chatId,clientTurnId) identity; actor User separately recorded | Preserve one durable user turn, one fenced assistant terminal write, replay/idempotency | Authenticated Chat owner and current Project owner/member as applicable | Reuse turn-ledger implementation; add authorization before turn acquisition; no second persistence table/path | M1 | Same-turn retry replays; conflicting reuse denied; revocation between requests denies next turn; standalone turns unchanged | FREEZE_CANDIDATE |
| Person / application | ProjectPerson, ApplicationParty, ApplicationPartyRole | Person is not User; party is scoped by Project + application + person | One party row per identity; roles are separate, versioned/audited role assignments; at most one principal applicant per application | Customer supplies; qualified staff verifies only when authorized | No User-table overloading; no Visa-specific hard-coded person schema | M2; school/visa workflows M5–M7 | One person with multiple roles shares person-level fact identity; cross-Project and cross-application references fail | FREEZE_CANDIDATE |
| Application / DB | Discriminated ProjectApplication base and subtype enforcement | One common Project/application identity; school and visa subtype rows same Project | M2 provisioning may lack subtype and is never gate-ready; active enabled kind requires exactly its matching subtype | Server workflow service; owner starts application in later milestone | No tables in M1; use composite same-Project FKs | M2 then M5 and M6–M7 | Provisioning allowed only before kind activation; active school/visa cannot lack or carry wrong subtype | OWNER_DECISION_REQUIRED |
| Documents / evidence | Project asset/version/grant | Project-owned assets; explicit Project/application/conversation grant; exact evidence source identity | Immutable bytes/versions/runs; grants revocable; storage and scanner state separate | Owner/member with scoped document capability; scanner adapter only for verdict | New Project processing adapter; do not reuse MatterDocument chat FK as ownership | M2; M3 and M5–M7 consume evidence | No implicit account history; no cross-Project ref; no extraction before clean scan; source Chat deletion cannot delete imported Project copy | FREEZE_CANDIDATE |
| Evidence / provenance | ProjectEvidenceRef and assertions | Typed same-Project ref to exact document unit, approved policy snapshot, or scoped source snapshot; application scope explicit | Evidence, fact assertions, confirmations and verification events append/version; conflict is preserved | Server issues refs; customer confirms own facts; authorized professional verifies scoped claims | Reuse Policy Intelligence provenance patterns without promoting it to a Project rule engine | M2; legal/applicability review M3/M6–M7 | Invented, cross-Project, stale, revoked, or wrong-version refs are rejected; source dates are never fabricated | FREEZE_CANDIDATE |
| Workflow / policy | RequirementTemplateVersion and three-valued assessment | Scoped to workflow, provider/course/intake or application; facts and source dates bind to an assessment | Immutable source/template versions; applicability true/false/unknown; unknown is not satisfied | Qualified publisher for operative templates; AI can propose only | Reuse existing source identities where appropriate; no generic new policy microservice | M2/M3 then M5–M7, operative rules after professional approval | Same facts/sources/template reproduce same assessment; only affected dependencies re-open; unknown material managed state denies gate | PROFESSIONAL_PENDING |
| Workflow / tasks | Fixed stages, required task materializer, bounded planner | Task scoped to Project and optional exact application/dependency set | Required tasks are deterministic; AI suggestions are bounded, idempotent, resumable; deferred work remains visible | Server rule principal or validated user/staff; AI proposals only | Reuse one ProjectTask + dependency model; no permanent per-stage task tables | M2 task foundation; M5–M7 workflow | Required item cannot be dropped by AI cap; invalid refs/cycles fail; budget pause is not completion; principal cannot approve or submit | FREEZE_CANDIDATE |
| Policy change / operations | Version publish plus transactional outbox | Change digest contains scoped keys and affected Project/app set | Version/pointer/outbox commit atomically; async reevaluation is idempotent; stale affected gate denied | Verified scoped human publisher; worker handles only committed event | Existing DB transaction/revision patterns; no mandatory new microservice | M2/M3 design; operative worker later | Worker/notification failure leaves visible retryable outbox and cannot make affected app appear current | FREEZE_CANDIDATE |
| Cross-application evidence | AdmissionAnchorLink | Same Project, exact source school outcome/version/hash, target visa application and matching person | Link revisions immutable; source correction/reissue stales only dependent target | Customer reports; authorized human/source verifier validates | Separate from a document permission grant and separate from LegalMatter identity | M5/M6–M7 | Wrong Project/person or Offer-as-CoE link denied; missing anchor leaves preparation available but affected Managed gate closed when material | FREEZE_CANDIDATE |
| Admissions procedure | Offer and CoE event model | Exact school application, applicant and institution procedure/source | Offer version/authenticity, one decision per version, conditions, acknowledgement and actual CoE are separate | Customer decides; institution emits records; assigned human verifies | No invented admission API; human action/real evidence only | M5; provider policy requires education-agent/lawyer review | Condition-first and unknown-sequence fixtures follow F-05; acceptance does not synthesize acknowledgement or CoE | OWNER_DECISION_REQUIRED |
| Package / GS | Immutable package candidate and exact-hash decision | Per application; evidence and output refs pin to exact package hash | New content creates new version; customer confirmation and lawyer approval bind to that version | Applicant confirms; assigned qualified lawyer approves exact version; human submits | No answer-history or clarification message acts as approval | M8; GS structures begin M6–M7 | Edited package loses current approval; Comprehensive GS Working Draft is distinct from form-specific Official GS Question Answers | FREEZE_CANDIDATE |
| Service engagement | ServiceEngagementVersion + per-application coverage | One Project engagement may name multiple exact applications/services | Accepted terms/coverage immutable; new scope requires new version and acceptance | Customer accepts; assigned staff manages | Independent of VIP/Stripe; no Stripe migration | M4; packages and gates later | Adding an application never inherits coverage; acceptance is distinct from fee, approval and authorization | OWNER_DECISION_REQUIRED |
| Firm fee ledger | PaymentEvent / PaymentAllocation / ServiceFeeObligation | One cash receipt, allocations to exact covered obligations; no cloned event | Append-only adjustment/reversal; amount/currency cannot over-allocate net event | Assigned finance/authorized staff confirm; model cannot attest | Separate from Stripe/VIP and directly paid school fees | M4 or later; actual terms need finance/counsel | One event can fund multiple obligations; reversal recalculates gate; customer payment to school creates no company receipt | OWNER_DECISION_REQUIRED |
| Third-party funds and direct payment | Conceptual custody/transfer records distinct from firm-fee ledger | Payer, owner basis, beneficiary, purpose and receiving-account category are explicit but unresolved until reviewed | Receipt, transfer, refund, reconciliation and exceptions separately evidenced; no money movement implied | Finance/owner/counsel determine permitted records and actor | Not a VIP, service-fee or general revenue ledger | Before any company-held tuition/deposit feature; design in M4+ | Direct payment is not company custody; company-held funds cannot satisfy a fee obligation | PROFESSIONAL_PENDING |
| Governance / privacy | Project audit and retention contract | Project-scoped actor, target, version and request identity; minimize sensitive payload | Append-only audit; closure and deletion are separate; legal hold and retention remain unknown | Owner/privacy/records/counsel define; server records actions | Reuse authenticated identity and safe audit patterns; no raw documents or prompt content in audit | Minimal events M1; full lifecycle before real customer records | No hard-delete promise, hidden staff access, or sensitive text in audit; deletion and rollback are tested | OWNER_DECISION_REQUIRED |

## 5. Explicit owner decision table

### A. Must be decided before M1

| Decision | Recommended default | Why M1 needs it | Owner decision status |
|---|---|---|---|
| Project/account cardinality and owner | One immutable ownerUserId per Project; one account may own many Projects; no ownership transfer in M1 | Determines every read/write authorization and recovery path | PARTIALLY ACCEPTED: one Project may have multiple customer members; account cardinality, immutable ownership, and transfer policy remain unaccepted |
| Whether owner is represented by a membership row | Canonical owner access derives from ownerUserId; ProjectMembership is for additional customer principals; reject duplicate owner membership | Avoids disagreement between owner field and membership role | PENDING |
| Customer member lifecycle | Owner may invite only a known account; invited account must accept before access; owner may revoke; owner cannot be revoked; pending and revoked members have no access | Required to implement immediate-revocation guarantee without silently granting another account access | PARTIALLY ACCEPTED: current membership status and subsequent-operation denial after revocation accepted; invite/accept mechanics and other lifecycle details remain pending |
| Chat owner + membership rule | The creator must own the new Chat and be Project owner or active member. Every Project-linked read/turn checks both Chat ownership and current Project access. No old Chat linking | Existing turn/history code checks Chat owner only | ACCEPTED — D-P13-002: dual authorization, current lifecycle/membership checks, and no silent Standalone linking |
| Shared transcript behavior | Default is no cross-member transcript access in M1; each Project Chat is visible to its creator only. Project membership is not a transcript grant | Avoids broadening current whole-Chat authorization/history semantics | ACCEPTED — D-P13-002: membership does not grant access to another member's Chat transcript |
| Project-chat entry/history behavior | Project chat is created/listed through a Project entry. Keep its origin visible; do not reclassify it as Standalone. If account history lists it, label it and route to its Project | Avoids confusing Project association with ordinary standalone creation/context | PARTIALLY ACCEPTED: no silent linking or rollback reclassification; Project-origin fallback accepted under D-P13-003; normal UI placement/listing remains pending |
| Close and delete behavior | M1 supports active/closed only; close blocks new Project writes. No hard delete, retention promise, or cleanup until privacy/records policy is accepted | Prevents irreversible lifecycle behavior while retention/legal hold is unresolved | PARTIALLY ACCEPTED: rollback, normal closure, and revocation must remain distinct; detailed closure access, deletion, retention, and legal-hold policy remain pending |
| Idempotency and failed association | Persist a per-actor operation key and request hash; exact retry returns same resource; same key with different payload conflicts. Create Chat/conversation/link/event in one transaction | Required to prevent duplicate Projects, duplicate links, and orphan chats on retry/failure | PENDING |
| M1 UI scope | API and tests are sufficient for the foundation. Add only a small Project create/select/new-chat entry in the existing workspace if needed to validate customer flow | Keeps M1 bounded; avoids a separate portal/dashboard | PENDING |

### B. Must be decided before later technical milestones

| Decision | Recommended default | Needed by | Owner status |
|---|---|---|---|
| ApplicationParty model | One party identity per Project/application/person; roles in a child relation; one principal applicant per application | M2 schema | PENDING |
| Application subtype strategy | M2 provisioning base row; later active subtype rows introduced atomically and enforced per enabled kind | M2/M5/M6–M7 schema | PENDING |
| Project document ownership | Project-owned immutable asset/version with explicit grants; selected standalone import copies bytes and provenance | M2 | PENDING |
| Cross-application evidence | Permission grant and admission outcome link are distinct; outcome link pins same-Project source version and target applicant | M2/M5/M6–M7 | PENDING |
| Requirement engine and source lifecycle | Typed three-valued rules, immutable template/source versions, event-time applicability, transaction outbox, affected-scope reevaluation | M2/M3, operative rules M5–M7 | PENDING |
| Task budgets | Deterministic required lane plus bounded configurable AI proposals, stable cursor and visible backlog; exact budgets are configuration/benchmark decisions | M2/M5–M7 | PENDING |
| Staff assignment and role verification | Action-scoped capabilities, current verified identity, application-specific assignments, no global lawyer/admin access | M4 | PENDING |
| Contract, fee and package boundary | Exact accepted coverage per application; fee ledger separate from third-party funds; exact immutable package review in the later package milestone | M4/M8 | PENDING |
| Project-chat sharing beyond creator | Do not share transcript by default; any shared-room access requires an explicit, separately tested member authorization contract | Any milestone that asks for shared chat | PENDING |

### C. Requires lawyer, agent, finance, privacy, or records approval before operative/live use

| Topic | Needed decision/evidence | Responsible capability | First affected milestone | M1 effect |
|---|---|---|---|---|
| Four SC/SD/VC/VD matrices | Row-level classification, applicability facts, source identity, effective dates and review outcome; the PDFs remain provisional | Qualified lawyer and education agent by domain | Before operative templates / real managed cases | None for synthetic Project foundation |
| LF-01 intake deferral | Confirm which answers can wait and which must be collected at each later intake gate | Owner + lawyer/agent | M2/M5/M7 intake | None |
| LF-02 authenticity / partner verification | Decide whether original sighting is required for a scoped purpose, trusted partner basis and attestation/audit limits | Lawyer + owner; privacy for partner records | M2/M4 | None |
| LF-03 finance / English instruments | Identify actual applicable source versions and facts; do not encode a numeric or generalized waiver from the comment | Lawyer + source reviewer | M6–M7 | None |
| LF-04 early review | Define evidence-backed, non-determinative review suggestions and disclosure treatment; no adverse inference from migration plans, age or Australian relatives alone | Lawyer + owner | M4/M7 | None |
| LF-05 customer notices | Review real self-service/managed scope, responsibility and consent text before relevant customer release | Lawyer + owner | Before live self-service or managed service | Project creation still needs approved privacy notice if it collects personal data |
| LF-06 payment custody | Decide direct-to-school versus company-held funds, owner/basis, account category, licensing, segregation, transfer, refund, reconciliation, evidence access and permitted combinations; no trust-account conclusion is presumed | Owner + finance/accountant + counsel + privacy | Before any company-held institution funds; design in M4+ | None |
| LF-07 OSHC comment | Verify actual official source, event-time scope and applicant facts before publishing an applicable rule; keep separate from English/finance | Lawyer + legal-source reviewer | M6–M7 | None |
| LF-08 GS outputs | Verify actual current online form, question identifiers/constraints, official answer format, lawyer edit/confirmation and any permitted attachment use | Lawyer + owner | M6–M8 | None |
| LF-D09 annotated source record | Preserve the actual annotated file under approved provenance, hash, confidentiality and access controls before treating it as formal professional evidence | Owner / records administrator; verify reviewer identity/capacity | Before professional acceptance of feedback | None |
| Retention, erasure, legal hold, guardian authority, source licensing | Decide duration, customer notice/rights, account closure, staff departure, guardian consent and lawful source/file handling | Privacy/records owner + counsel | Before real customer documents or live service | Synthetic data only; M1 cannot promise deletion/retention periods |

## 6. Lawyer and domain feedback decision ledger

Every LF and LF-D item is mapped below. “Design support” means a technical structure is proposed; it does not mean the comment or rule is approved. The latest annotated PDF itself was unavailable for this review, as recorded in the feedback delta.

| Feedback / decision | Related technical contract and current support | Remaining question and approver | When answer is needed | M1 effect |
|---|---|---|---|---|
| LF-01 / LF-D01 — “1. 好像没有” on deferrable intake answers | M0-003 §8 preserves baseline/conditional/optional as candidate template categories and avoids making baseline rows hard pre-export gates. Technical design supports deferral flags, not a settled intake policy. | Clarify which inputs are required at first intake, later preparation, and before a specific gate. Owner + lawyer/agent; do not turn ambiguity into “nothing may be deferred.” | M2 intake template; before operational School/500 intake | None |
| LF-02 / LF-D02 — originals and trusted partners | M0-003 §5.3 separates scan security, extraction, authenticity basis (original sighted, partner/certified basis, scan-only, unknown) and professional sufficiency. | Which document and purpose requires original sighting; partner qualification, attestation scope and audit/privacy rules. Lawyer + owner. | Design in M2/M4; before real evidence verification | None |
| LF-03 / LF-D03 — legal instruments govern finance/English | M0-003 §7 and §8 keep source identity, event time, applicant facts and unknown applicability; no threshold or exemption is embedded. | Identify exact applicable instrument/source and event-time scope; lawyer + source reviewer. | Before finance/English template publication and M6–M7 operative use | None |
| LF-04 / LF-D04 — refusals, unusual study plan, migration intent, relatives | M0-003 §5.3 supports a scoped professional-review suggestion for sourced material refusal/inconsistency/unusual course path and forbids an adverse conclusion from migration intention, age or Australian relatives alone. | Confirm which evidence triggers review, professional scope, escalation and notice; lawyer + owner. | M4/M7 design; before real managed case use | None |
| LF-05 / LF-D05 — customer liability/disclosure | Roadmap §1 and M0-003 §§3–5 distinguish Self-Service from Managed and avoid implying lawyer approval or guaranteed outcomes. Actual wording is absent. | Approve accurate, jurisdiction-reviewed copy and consent events. Lawyer + owner. | Before real customer self-service/managed release; privacy notice before personal Project collection | No legal-service decision in M1; a live Project UI still needs an approved privacy notice |
| LF-06 / LF-D06 — professional fees versus tuition/deposits | M0-003 §§12.2–12.4 separates one fee PaymentEvent, allocations, fee obligations, company-held third-party funds and direct-to-school payment. | Determine legal/beneficial owner, company authority, account category, custody/licensing/trust duties, combinations, reconciliation, reversals and access to evidence. Owner + finance + counsel + privacy. | Before any funds feature or company receipt; no movement is approved | None |
| LF-07 / LF-D07 — OSHC comment | M0-003 §8.3 maps VD-03 to a generic candidate applicability rule and records the comment as provisional; no nationality hardcode. | Verify current official source, date, applicant-specific conditions and qualified approval. Lawyer + legal-source reviewer. | Before Student 500 template publication, M6–M7 | None |
| LF-08 / LF-D08 — comprehensive GS | M0-003 §5.2 defines separate Comprehensive GS Working Draft and Official GS Question Answers with provenance, form version, lawyer edits, customer confirmation and package hash. | Confirm current form fields/limits and whether an extra narrative is accepted for the case. Lawyer + owner. | M6–M8, before operative GS workflow | None |
| LF-D09 — preserve annotated source | Feedback delta records source identity/hash and explicitly says the annotated copy was not in repo; V0.1 is not that source. M0-003 retains the distinction. | Preserve distinct original, record reviewer role/capacity and confidentiality/access class; owner/records administrator. | Before formal evidence acceptance of lawyer feedback | None |

## 7. M1 bounded implementation specification

### M1 objective and exclusions

M1 adds only an explicit Project identity/lifecycle foundation, customer membership access, a one-Project association for newly created Project Chats, minimal lifecycle/audit events, server-side authorization, and compatibility with existing standalone modes. It does not create Project people/applications, documents/uploads/imports, facts, requirements, tasks, education/legal intelligence, staff roles/dashboard, engagements, payments, packages, lawyer approval, or submission records. There is no legacy Chat/document backfill.

A Project Chat in M1 uses the existing Chat and ImmigrationConversation identity and the existing turn-ledger protocol. Project membership adds an authorization check; it does not create a second turn persistence system. No Project-scoped evidence or cross-chat context is made available to the answer model in M1. Existing ProjectScope remains null for answer context until a separately authorized M2 resolver exists.

### Proposed M1 subtask sequence

#### M1.0 — Owner decision and bounded task authorization

- **Objective:** Accept or revise the owner/member/Chat/rollback decisions in §5.A, then authorize the concrete M1 packet.
- **Expected modules:** No code changes. Update the durable decision log only after explicit owner decisions; M0-004 itself does not update DECISIONS.md.
- **Data footprint:** None.
- **Tests and negative cases:** None in this subtask.
- **Acceptance evidence:** Named accepted architecture version, exact M1 scope, owner decisions, and a clean branch/HEAD preflight.
- **Rollback/compatibility:** None; documentation only.
- **Dependencies / stop conditions:** Stop before code if owner/member semantics, dual authorization, Project-chat fallback, or M1 boundary are unresolved.

#### M1.1 — Additive Project records and constraints

- **Objective:** Add the minimum Project, customer membership, ProjectConversation, and lifecycle-event records.
- **Expected files/interfaces:** chatbot/lib/db/schema.ts; next append-only SQL migration under chatbot/lib/db/migrations/ plus the matching Drizzle migration journal/snapshot; repository queries in chatbot/lib/db/queries.ts. Use the existing migration sequence after 0029 when this future task is authorized.
- **Data/migration footprint (proposal):** New StudyJourneyProject with ownerUserId, lifecycle/revision/timestamps; ProjectMembership with Project/User identity, status and invitation/revocation provenance if approved; ProjectConversation with projectId, chatId, linkedBy/creator and unique chatId; minimal ProjectEvent with redacted actor/object/request IDs. FKs point to existing User/Chat. No existing row backfill or old-table rewrite.
- **Tests:** Schema/migration constraints; many Projects per owner; one Chat association only; owner/member Project scoping; duplicate membership and cross-project FK negatives; migration on an isolated disposable database with synthetic rows.
- **Acceptance evidence:** Migration review and isolated forward-upgrade proof; constraints reject cross-owner or duplicate links; existing migration history untouched.
- **Rollback/compatibility:** Disable Project routes and leave additive tables dormant. Do not drop the migration or delete records as rollback. No change to legacy documents, VIP, LegalMatter strings or turn rows.
- **Dependencies / stop conditions:** No migration file/application before a separate M1 authorization. Stop if constraints cannot make association ownership/project scope unambiguous.

#### M1.2 — Project service, membership lifecycle, and authorization

- **Objective:** Implement authenticated create/list/read/update/close operations and the owner-approved membership invite/accept/revoke lifecycle. Derive owner and actor from server auth; never trust client role, ownerUserId or membership status.
- **Expected files/interfaces:** New Project API routes under chatbot/app/api/ after authorization; a small domain/access module in the existing chatbot/lib/ or chatbot/lib/conversations/ structure; repository methods in chatbot/lib/db/queries.ts; authenticated identity from the existing auth layer.
- **Data footprint:** Project and membership rows plus minimal append-only events. Owner creation and Project-created audit event commit together. Operation keys/hash make create/revoke retries idempotent; same key/different payload conflicts.
- **Tests:** Anonymous/guest denied; User A cannot discover/read/update User B's Project; guessed IDs return no data; pending invite cannot read; accept requires the invited identity; revoked membership denied on the next request; owner cannot be removed through member revoke; closed Project rejects writes; duplicate/replayed create or membership commands have one stable outcome.
- **Acceptance evidence:** Route/service tests prove authorization comes from DB/session and fails before reading unrelated Project state; transaction and idempotency tests show no duplicate Project/member events.
- **Rollback/compatibility:** Feature flag disables Project mutations; user-owned standalone routes remain unchanged; preserve Project rows/events.
- **Dependencies / stop conditions:** Membership invitation/acceptance must match §5.A. Stop if an email/invitation channel, identity matching or revocation behavior is being guessed.

#### M1.3 — Atomic Project Chat creation and dual access enforcement

- **Objective:** Create only new Project Chats and ensure every linked-chat operation checks both Chat ownership and current Project authorization.
- **Expected files/interfaces:** A Project Chat create/list endpoint under chatbot/app/api/; transactional repository helper near chatbot/lib/conversations/history-runtime.ts and chatbot/lib/db/queries.ts; authorization adapter used by conversation detail/update and the widget routes chatbot/app/api/widget-chat/route.ts, widget-chat-fast/route.ts, and widget-chat-direct/route.ts; preserve chatbot/lib/conversations/turn-ledger.ts and widget-turn.ts contracts. Existing app/api/immigration-conversations handlers are the compatibility boundary to review.
- **Data/migration footprint:** Create Chat, ImmigrationConversation, ProjectConversation and audit event in one DB transaction. Chat.userId equals the authenticated creator; creator is Project owner or an active Project member; unique chatId prevents a second association. Existing Standalone Chat IDs cannot be submitted for linking. No Project context/evidence joins are added.
- **Tests:** Nonmember cannot link even their own Chat; active member cannot link another User's Chat; creator with revoked membership cannot list/read/update/turn through Project routes; closed Project denies turns; a member does not gain another member's transcript; link/create failure rolls back all rows; retry with same operation ID returns the same Chat; turn replay/idempotency/fencing remains unchanged.
- **Acceptance evidence:** Cross-owner and revoked-membership negatives pass at create, history/detail, update and every widget route; positive Project Chat uses the existing (chatId,clientTurnId) turn key and durable replay; standalone tests pass unchanged.
- **Rollback/compatibility:** Disable Project write/context routes; retain creator's authenticated read-only history via the accepted fallback, with Project origin preserved. Do not expose Project membership/context to Standalone Chat. No new-turn behavior is enabled if the Project membership/status check is unavailable.
- **Dependencies / stop conditions:** Requires F-01/F-02 owner decisions. Stop if any route can bypass the dual check or if adding project context changes standalone turn semantics.

#### M1.4 — Minimal customer flow, only if needed for acceptance

- **Objective:** Allow an owner to create/select a Project and open a newly associated Project Chat; keep UI to the smallest entry/selection affordance.
- **Expected files/interfaces:** Existing chatbot/components/immigration-ai-workspace.tsx and, if necessary, a small component in chatbot/components/; use Project APIs from M1.2–M1.3. Do not turn the current workspace into a staff portal.
- **Data footprint:** No new tables beyond M1.1.
- **Tests:** Owner can select only their authorized Projects; a Project Chat is visibly associated; opening Standalone “new conversation” continues through the current endpoint and never links a Project.
- **Acceptance evidence:** Focused component/API tests and a browser walkthrough with synthetic accounts, including empty and revoked states.
- **Rollback/compatibility:** Hide Project controls under the feature flag; preserve existing standalone controls and history.
- **Dependencies / stop conditions:** Optional for API/data foundation; required only if owner acceptance makes a customer flow part of M1. Stop if the UI implies documents, legal review, application status, or submission capabilities that do not exist.

### M1 security and regression acceptance plan

Use only synthetic/de-identified accounts and Project metadata. No real customer documents, paid calls, production mutation, or external submission. Required later tests:

- User A cannot list/read/update/close User B's Project; guessed and malformed Project IDs expose no data.
- Membership create/invite/accept/revoke commands are owner-authorized, identity-bound, replay-safe and audited. Pending or revoked memberships cannot access any Project route; revocation is checked from current DB state.
- Project owner identity and customer membership cannot diverge; owner cannot be revoked or duplicated as a second owner.
- A Chat owned by User B cannot be associated by User A, even if A belongs to the target Project. A Chat creator without current Project access cannot use the linked Project Chat. A member cannot read another member's transcript.
- Existing Standalone Chat remains unassociated, owner-scoped and functional; projectId remains null in its context and standalone creation does not create a Project.
- Project Chat history/detail/update and Fast/Default/Premium widget calls enforce owner plus current Project access, including after revocation or Project closure.
- Existing ConversationTurn unique identity, replay, lease/fencing, durable user message, terminal assistant write and failed-persistence behavior remain unchanged. Duplicate Project creation/association with an identical operation key returns the original result; changed payload conflicts; partial transaction failure creates no inaccessible Chat or dangling link.
- The existing history API does not silently reclassify Project Chats as Standalone. Verify the accepted Project-origin list/route behavior.
- Project endpoints expose no upload, import, extraction, document/evidence, FactAssertion, requirements, staff, engagement, payment, package, review, policy-intelligence extension or managed-submission action in M1.
- Feature-disable fallback preserves creator's owner-authorized Chat/turn history without exposing Project-only data or silently relinking the Chat.

## 8. Rollback, isolation, and legacy compatibility requirements

- Migrations are additive and introduced only through the separately authorized migration procedure. No existing Chat, MatterDocument, LegalMatter identifier, ConversationTurn, VIP, Policy Intelligence, consultation, lawyer-request or Stripe record is rewritten or backfilled.
- A failed create/link transaction leaves no partial Chat, ImmigrationConversation, ProjectConversation or event. Object storage is not part of M1.
- Project authorization is checked server-side before Project reads and writes. The Project route checks authenticated actor, current Project owner/member state, Project lifecycle, Chat ownership and association. No long-lived membership cache is trusted for a turn.
- Standalone Chats retain current semantics and API success behavior. Project membership never changes Chat.userId; a Project association does not itself grant transcript access.
- Disable/rollback prevents new Project writes and Project authority/context. It preserves owner access to already-persisted Project Chat history under the agreed fallback, with explicit Project origin. It does not turn those chats into new Standalone context or delete/quarantine user-owned turn rows.
- Project closure in M1 is a soft status transition that denies new Project operations. Physical erasure, retention duration, legal hold, ownership transfer after account closure, and staff recovery remain pending; no promise is made.
- M2 Project documents must use independent storage/security state. The existing scanner contradiction is not implicitly fixed by M1 and cannot be used as a reason to add file features early.

## 9. Technical-freeze and M1 readiness recommendation

**Technical freeze:** The review supports a coherent freeze candidate for platform boundaries. Owner decisions A/B now accept the F-01 dual-authorization and F-02 rollback-history contracts at the technical-decision level. A complete technical freeze remains a **CANDIDATE** pending owner acceptance of all named contracts; the other §5.A choices remain unaccepted unless explicitly listed as accepted in the addendum. Before M2, the owner must choose the normalized ApplicationParty and staged ProjectApplication strategy. The Offer diagram must be corrected before M5. Legal/admissions matrices, LF comments, custody, customer disclosures, privacy/retention and professional responsibilities remain outside technical approval.

**M1 readiness:** **NOT YET AUTHORIZED.** F-01 and F-02 are resolved at the owner-decision level, but implementation and security/regression verification remain pending. Invitation mechanics, detailed closure policy, normal Project Chat UI scope, idempotency details, and other §5.A choices remain open for the corresponding M1 behaviors. Do not turn an optional UI choice into a blocker if an explicitly authorized API-only scope omits that behavior; do not implement a membership, closure, or retry behavior whose contract is still unspecified. Any M1 requires a separate explicit implementation task and authorization and should use synthetic/de-identified fixtures. M1 excludes real customer file processing, managed service, payment, lawyer review, legal decisions, and external submissions.

## 10. Independent-review and owner-acceptance checklist

### Independent architecture review — PASS (2026-10-24)

- [x] Review completed against the stated branch/HEAD and cited source paths; the independent findings and source evidence in §§1–8 are retained.
- [x] F-01/F-02 owner-decision gap resolved by D-P13-002/D-P13-003. This does not mean implementation or security/regression tests passed.
- [x] Remaining recommendations and professional decisions remain visibly pending; the scanner-state issue remains an M2 Project-document prerequisite, not an M1 code change.

### Product owner acceptance

- [x] Accept decisions A/B: dual Project/Chat authorization and durable read-only Project-origin history fallback — D-P13-002 and D-P13-003.
- [ ] Resolve remaining applicable §5.A choices: project/account cardinality and owner representation, invitation/acceptance mechanics, detailed closure/retention access, ordinary Project Chat UI scope, and idempotency/failure semantics.
- [ ] Accept or revise the freeze-candidate contracts in §4; unresolved alternatives remain visibly pending.
- [ ] Accept the M1 bounded scope and tests in §7, or issue a separate revised M1 task.
- [ ] Explicitly authorize M1 implementation in a subsequent task; this review itself does not authorize code or migrations.
- [ ] Keep the four matrices and LF comments separate from owner-approved technical contracts; no professional, financial, privacy or legal approval is claimed.

## 11. Review-time validation and changed-file inventory (2026-10-23)

Review-time preflight matched the expected branch/HEAD and found a clean worktree. Documentation-only changes were made in the existing task and agent-memory directories. No tests were run, as this M0-004 task calls for documentation review and static validation. No migrations were created or applied; no database, AWS/S3, Stripe, paid AI, production, legal-source fetch, or external submission was used.

Validation performed:

- git diff --check: PASS.
- git status --short: exactly the four expected documentation paths below.
- git diff --stat: the three tracked status documents have 30 insertions; the untracked report is not included in Git's diff stat.
- Direct trailing-whitespace scan of the untracked report: PASS, no matches.
- No tests run; no migrations created or applied and no external or live systems accessed.

Expected changed files:

- docs/agent-memory/tasks/PHASE13_M0_004_ARCHITECTURE_FREEZE_REVIEW.md
- docs/agent-memory/CURRENT_HANDOFF.md
- docs/agent-memory/CURRENT_MILESTONE.md
- docs/agent-memory/PROJECT_STATE.md

DECISIONS.md is intentionally unchanged because this review contains no new owner decision. Historical status entries are preserved.

Review-time disposition as of 2026-10-23: M0-004 REVIEW DELIVERED — AWAITING INDEPENDENT ARCHITECTURE AND OWNER ACCEPTANCE. The 2026-10-24 Owner Decision Addendum above updates this status without changing the original review evidence.
