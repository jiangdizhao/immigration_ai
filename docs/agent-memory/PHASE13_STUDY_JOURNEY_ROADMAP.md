<!-- BEGIN PHASE13_M4_002_OPTION_A_OFFLINE_DISPATCH_2026_10_27 -->
**Current Phase 13 M4 (2026-10-27):** M4-001 read-only audit accepted. Owner selected Option A admin-proposed / customer-owner-approved / lawyer-accepted staff assignment; [M4-002 offline implementation contract](./tasks/PHASE13_M4_002_OPTION_A_STAFF_ASSIGNMENT_OFFLINE_IMPLEMENTATION_2026_10_27.md) is frozen/dispatched for source/test/unapplied migration authoring only. M4-003–007 and any DB execution or production remain unauthorized. This updates earlier time-local M4 planning pointers below without changing the canonical M0–M10 milestone scope.
<!-- END PHASE13_M4_002_OPTION_A_OFFLINE_DISPATCH_2026_10_27 -->


# Phase 13 - Study Journey Project-Centric Roadmap (PROVISIONAL)

<!-- BEGIN PHASE13_M4_WORKBREAKDOWN_POINTER_2026_10_27 -->
**Latest active Phase 13 work (2026-10-27):** M3 was formally closed `OFFLINE ACCEPTED_WITH_LIMITATIONS` at `d1490a849045c50ef3ff8babf65109d1a1ff2664` (not real-world/production acceptance). [M4-001–M4-007 work breakdown](./PHASE13_M4_STAFF_COLLABORATION_WORKBREAKDOWN_2026_10_27.md) expands the **existing M4 row without changing M0–M10 numbering**. Only [M4-001 read-only audit](./tasks/PHASE13_M4_001_READ_ONLY_ARCHITECTURE_AUDIT_2026_10_27.md) is dispatched; M4-002–007 are proposed and not authorized for coding. Historic statements below about M0 being current and M3 not yet implemented are time-local history.
<!-- END PHASE13_M4_WORKBREAKDOWN_POINTER_2026_10_27 -->


<!-- BEGIN PHASE13_M3_ARCHITECTURE_POINTER_2026_10_27 -->
**2026-10-27 M3 architecture freeze:** Owner requested immediate M3 design and task dispatch without another design-review round. [Education Intelligence architecture](./PHASE13_M3_EDUCATION_INTELLIGENCE_ARCHITECTURE_2026_10_27.md) freezes source/identity/evidence/freshness/matching boundaries; [M3-001 offline task](./tasks/PHASE13_M3_001_OFFLINE_SOURCE_CONTRACT_AND_FIXTURES_2026_10_27.md) is first dispatch. M3 is NOT already implemented. M2 offline acceptance and Phase 13 production NO_GO remain intact; existing M0–M10 milestone numbering and professional approval requirements are unchanged.
<!-- END PHASE13_M3_ARCHITECTURE_POINTER_2026_10_27 -->


<!-- BEGIN PHASE13_UI_PRODUCT_BLUEPRINT_POINTER_2026_10_24 -->
**2026-10-24 owner-accepted UX elaboration:** [PHASE13_UI_PRODUCT_BLUEPRINT_2026_10_24.md](./PHASE13_UI_PRODUCT_BLUEPRINT_2026_10_24.md) maps the lawyer's step-centric mockups into *existing* roadmap phases without renumbering or prematurely implementing lawyer review/Project documents. [M1.4 bounded UI task](./tasks/PHASE13_M1_004_MINIMAL_CUSTOMER_WORKSPACE_CONTRACT.md) covers only genuine Project create/select and own Project Chat entry on the existing Workspace. No new migration, legal approval, professional review or production enablement is authorized by this design note.
<!-- END PHASE13_UI_PRODUCT_BLUEPRINT_POINTER_2026_10_24 -->


**Date:** 2026-10-23  
**Branch:** `phase13-study-journey-project-centric`  
**Starting commit:** `8b963eea1aa4023d30f31eba816a545efaa65e3d`  
**Owner status:** Development preparation authorized; lawyer / education-agent review of the legal and admissions baselines **PENDING**. This document is a milestone plan, not code acceptance, legal approval, migration or deployment authorization.

## 0. Authority, inputs, and precedence

**Reference artifacts (retained, not overwritten):**
- `doc/Immigration_AI_Study_Journey_Project_Centric_Architecture_V2_2026-10-22.pdf` (15-page architecture review, **historical V2 design draft**).
- `doc/Study_Journey_School_and_Student500_Facts_Documents_Lawyer_Review_V0.1_2026-10-22.pdf` (four proposed fact/document matrices, **PROVISIONAL**, not official universal legal requirements).
- `doc/Picture1.png`, `doc/Picture2.png`, `doc/Picture3.png`, `doc/mermaid-diagram.png` (UI/flow references, not functional specifications).
- Existing `AGENTS.md`, `docs/agent-memory/{CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE,DECISIONS}.md` and live repository source (implementation/operational truth).
- Additional **2026-10-22/23 owner decisions recorded here supersede gaps in the V2 PDF**: school-side lawyer approval; education agent/lawyer represented by an authorized professional service role but permission scope still checked per action; school intake screening; signed service agreement and staff-confirmed offline payment for managed submissions; independent Free/VIP AI entitlements; opt-in self-submission with reviewed disclaimer; project-scoped staff dashboard and persistent human chat.

**Authority boundary:** A PDF requirement, AI-generated rule, lawyer draft, and official legal rule are not interchangeable. A new/updated government or school requirement must retain URL/authority, retrieved and effective dates when known, applicability, checked evidence and human review status. A lawyer can amend the business baseline without silently rewriting authoritative source text. Where official access/meaning is unresolved, store `UNVERIFIED` and generate a review task; do not claim legal compliance.

**Legacy D-009 note:** Its no-Project restriction was explicitly scoped to Phase 12. Phase 13 now authorizes *design* of an additive Project container, subject to owner approval of concrete migrations. Never convert old chats/files automatically or equate Project with Legal Matter.

## 1. Non-negotiable product contract

1. **Two independent entry points.** Standalone Chat preserves existing answer modes, ownership and conversation-file isolation. A Study Journey workflow, case registry, admissions/visa application, progress, document checklist and managed-service engagement exist **only after explicit Project creation**.
2. **Project = isolated case container.** Multiple independent Chat threads share designated Project documents, sourced and confirmed facts, applicable official/education intelligence, requirements and tasks. Even the same user's different Projects do not auto-share personal records. Explicit imports require authorization/provenance. Project is not `LegalMatter`.
3. **One journey, two process templates.** School Admissions (may contain many independent school applications) and Student 500 Visa; an already eligible CoE/official alternative can bypass school application; existing Offer enters the Offer route. Early visa feasibility screening precedes major school commitments. Stage skeleton is versioned and approved; GPT-6 adapts sub-tasks and evidence needs, not hard submission gates.
4. **Four provisional registries.** School facts, school evidence, Student 500 facts and visa evidence. Intake supports baseline-required / conditionally required / optional; separate *answered*, *evidenced*, *verified*, *applicable*, *completed*, and *approved*. School-specific forms and Home Affairs case-specific checklist override any universal-document assumption.
5. **Autonomous AI, bounded authority.** GPT-6 researches, extracts, reconciles, drafts and plans, with source/date/evidence provenance. It cannot self-approve legal professional checkpoints, forge receipts, silently promote extracted facts to verified, modify required guards or represent third-party decision/status as fact.
6. **Professional review at BOTH submission boundaries.** For managed services, per-school application package and Student 500 package require identified authorized lawyer review of the exact version; GS final answers require lawyer editing/review and customer confirmation. If a specifically mandatory lawyer decision arises earlier, it blocks the affected managed path until resolved. Changes invalidate dependent approvals.
7. **Service modes are separate from subscriptions.** `Self-Service` users (Free or VIP) may prepare and **submit themselves** subject to appropriate disclosed scope/risks/consents and jurisdictional legal review of public-facing copy. They must not receive a false lawyer-approval label. `Managed Service` requires matching active engagement/contract, staff-verified payment condition (if contractual), customer authorization, scoped package lawyer approval, and authorized human submission. Stripe VIP must remain untouched and separate.
8. **Human submission.** Authorized education representative submits to each institution through its allowed channel; suitable legally authorized professional submits visa application via approved route. School issues Offer/CoE, Home Affairs decides visa. Receipt/CoE/decision statuses require real evidence. No invented unified admission API, autonomous external submission or legal outcome guarantee.
9. **Project-level staff and communication.** Authorized principal lawyer/admin may see scoped case dashboard; assigned professional sees only authorized Projects. Reuse existing `LawyerClarification*`/consultations where suitable, but create a separate ongoing project-human-message contract; free messages are NOT formal reviews. Sensitive document access requires lawful scope/consent, auditable revisions and authorization.
10. **Privacy and safe migration.** Legacy file/chat scopes unchanged; no implicit broadening of customer-to-lawyer sharing, no PDF prompt-injection authority. Unresolved historical bugs remain recorded; only defects blocking Phase 13 or presenting imminent security/data-integrity risk are addressed with separately approved fixes.

## 2. Phased milestones and acceptance gates (rebaselined from V2 PDF)

| ID | Milestone and deliverables | Gate to close milestone |
| --- | --- | --- |
| **M0** | **Read-only as-is audit + to-be contract freeze**: inventory schema/APIs and deployment baselines; map six reference artifacts; define Project/admissions/visa/staff/engagement boundaries, minimal fact/evidence schema and provenance; workflows, review and submission guard invariants; migration/backfill/rollback plan; lawyer-review change protocol; test matrix. | Owner accepts specific architecture documents; every proposed entity has owner/scope/version/authority; end-to-end paths include self/managed, no Offer/Offer/CoE, multi-school, age/family, policy changes; major unresolved decisions called out. **No code, migration, DB mutation or deployment.** |
| **M1** | **Project foundation**: additive Project / membership and Chat association, controlled Project CRUD and entry modes; protected standalone chats, permission enforcement, safe legacy view; ownership/migration policy. | Same Project threads share only authorized context; cross-Project, cross-owner and standalone isolation negative tests PASS; no old-chat auto migration; explicit fallback. |
| **M2** | **Project fact, documents and requirement foundation**: scoped document references (preserve existing uploads), extraction with provenance and source locators, versioned/contradiction-aware facts, four provisional template registries, requirement states, cross-Chat resolver, explicit confirmation. | Actual file/chat examples extract into schema with provenance; contradictions not overwritten; deletes/revisions invalidate affected facts/tasks; lawyer template change can be applied without schema rewrite; no cross-Project access. |
| **M3** | **Education intelligence**: CRICOS/Study Australia/individual school source identity, course/location/intake/fees/prerequisites/deadlines, source/date tracking, freshness/uncertainty, admissions eligibility and option matching. | Sample school/ELICOS/VET/undergrad/masters/research cases compared with official institution source; stale/unknown status explicit; no hallucinated fee, deadline or promise of admission. |
| **M4** | **Staff collaboration and professional engagement foundation**: scoped staff dashboard summary and assignments; project human messaging independent of AI and episodic clarification; contract version/signature evidence; staff-confirmed off-platform payment, separate from VIP; customer authorization; generic review and audit objects. | Lawyer/agent view/edit rights validated, messages durable, contracts/payments not AI-asserted, cannot approve outside scope; legacy lawyer requests and Stripe unaffected; no formal managed submission without all authorized records. |
| **M5** | **School admissions workflow**: fixed high-level skeleton, GPT-6 dynamic tasks, multiple school applications, per-school fact/document package, AI assessment, lawyer reviewed version, authorized intermediary handoff, external submission receipts; conditional/full Offer review and acceptance, CoE/exception handoff, self-service alternative. | At least three concurrent applications correctly isolated per school; managed school submission blocked unless contract/payment-condition/consent/lawyer approval; self path never masquerades as reviewed; no Offer, existing Offer, existing CoE routes; no synthetic receipt marked real. |
| **M6** | **Student 500 legal intelligence**: reuse Phase 12 policy infrastructure and current legal retrieval; official evidence/effective dates, Schedule 1+2 and instruments, transition rules, tailored Home Affairs checklist, rule-version diff and task invalidation. | Applicability/effective date/source traceable; policy change reopens only impacted tasks; official checklist unavailable yields unknown/human check, not false completeness; include current/legacy and onshore/offshore variants. |
| **M7** | **Student 500 preparation workflow**: fixed main skeleton, applicant facts and requirements, AI research/follow-up, evidence completeness, GS personal fact-grounded draft, lawyer edits, dynamic tasks and stage gates. | All identified current 500 branches routable (incl. underage/family/complex visa history/special categories); no missing/contradictory material falsely completes gate; final GS cannot be branded lawyer-approved before review and applicant confirmation. |
| **M8** | **Versioned submission authorization**: immutable school and visa packages, lawyer approval of exact version, invalidation after material change, customer statement confirmations, managed/self-service submission modes, handoff to staff, external receipts. | Impossible to mark managed submission if a hard guard fails; self-submission has explicit responsibility/notice and distinct status; VIP unrelated; no automated government submission; race/replay/permission tests. |
| **M9** | **Integrated bilingual customer/staff workspace**: project home/progress (preparation % separate from readiness), file/fact/task/versions, multiple school applications, reviews, conversations, contract/payment state, activity history; existing UI images guide only. | Owner browser acceptance for CN/EN, mobile/desktop, permissions and empty/stale/conflict states; all 3 creation entry routes and both service modes intelligible. |
| **M10** | **End-to-end reliability + lawyer/agent pilot**: policy/version regression, de-identified/synthetic scenarios, real-format extraction tests, multi-school to CoE to 500, staff handoff and self-service; scoped release/security review and staged deployment approvals. | Acceptance matrix against reviewed requirements; zero known unauthorized access or invalid hard-gate passage in tested paths; source/rule coverage and extraction metrics reported honestly; lawyer/agent signoff obtained for externally managed real-case launch. |

**Dependencies:** M0 -> M1 -> M2. M3 can be investigated alongside M2; M4 must precede the managed school submission portion of M5. M6 may begin research in parallel but its gating interfaces depend on M2. M8 completes/strengthens the generic review contract from M4 for both workflows. M9 UI may be developed in thin slices alongside each milestone; M10 is the final overall gate. A milestone may be sub-divided into small reviewable tasks, but owners accept each milestone independently. Do not equate an implemented feature with passed acceptance.

## 2a. M4 bounded work packages (2026-10-27)

M4 is the existing Roadmap milestone **Staff Collaboration and Professional Engagement Foundation**. Its accepted *planning decomposition* is [M4-001 through M4-007](./PHASE13_M4_STAFF_COLLABORATION_WORKBREAKDOWN_2026_10_27.md): **001** grounded read-only architecture/permissions/reuse audit; **002** staff assignment/authorization; **003** durable human Project messaging; **004** engagement, agreement/version/signature/customer disclosure; **005** evidenced staff-attested off-platform payment distinct from Stripe VIP; **006** immutable scoped professional review/approval/audit; **007** cross-module offline integration and fail-closed M5 handoff interface. Only **M4-001** has a [dispatched contract](./tasks/PHASE13_M4_001_READ_ONLY_ARCHITECTURE_AUDIT_2026_10_27.md). M4-002–007 remain **PLANNED / NOT AUTHORIZED TO IMPLEMENT**, and M4 schema/state-machines are not frozen until evidence-backed audit and owner/professional decisions. Live/production remain **NO_GO**.

## 3. M0 work breakdown (the current active milestone)

- **M0-001**: source-and-code architecture audit ONLY. Compare the PDF baselines and the six current `doc/` assets with actual branch source. Deliver as-is architecture, reuse matrix, detailed risks/assumptions, core open decisions, proposed interfaces and bounded M0-002 follow-up. **No implementation or config changes.** See [M0 task contract](./tasks/PHASE13_M0_ARCHITECTURE_AUDIT.md).
- **M0-002**: agree data / auth / source contracts. Define Project, Chat membership, Application (school/visa), multi-school, FactAssertion/Evidence/Requirement, RequirementTemplateVersion/PolicySnapshot, staff access, ServiceEngagement, Approval, SubmissionRecord, EventAudit. Document unique constraints, provenance, RBAC/ABAC, delete policy, migration & rollback without applying it.
- **M0-003**: agree workflow semantics and source governance. State diagrams, legal-date applicability, official/education retrieval reliability, data extraction, review triggers, human decisions, self/managed guard truth tables, rules diff/invalidation, baseline updates from lawyer.
- **M0-004**: independent architecture review and owner acceptance. Cross-check M0 checklist; mark unresolved lawyer-dependent requirements provisional, freeze platform interfaces only. Owner decides exact M1 implementation; no automatic promotion of legal rules to approved.

### M0 exit checklist (all required)

- [ ] Source/repo map cites exact paths and pinned branch HEAD; no assumptions presented as implemented behavior.
- [ ] All four provisional checklists mapped into versioned source references without hardcoded per-visa strings or fabricated obligations.
- [ ] Two service modes and three admission entry routes represented without contradictory gates.
- [ ] Data contract has Project vs LegalMatter vs Chat distinctions and clear migration/rollback.
- [ ] Staff permissions, document-sharing consent, GS lawyer editing, project messaging and per-school approval covered.
- [ ] Approval and external submission guards are per package/version with audit/negative authorization cases.
- [ ] Policy/requirements governance handles lawyer-provided replacement/additions, effective dates, prior projects, provenance and audit.
- [ ] Explicit verified/unverified assertions and deferred legal sign-off recorded; no fake approvals or live operations.
- [ ] Owner has explicitly reviewed and accepted M0 outputs for M1 work.

## 4. Lawyer/education-agent standards update protocol

All legal/admission requirement sources can be updated **at any time**, but changes are reviewed and published deliberately:

1. Keep original files unchanged in `doc/` (or dated versioned `doc/lawyer-review/`); add newly received lawyer/agent files with source identity, date, author/role, scope, confidentiality classification, and hashes. Never overwrite an authoritative old source silently.
2. Record a new version of affected `RequirementsTemplate` / `WorkflowTemplate` / professional authorization rule, with `draft -> reviewed -> approved -> effective -> superseded` status. These labels describe **human business approval**, not automatic statutory force.
3. Generate a field/rule diff: new required vs conditional vs optional, applicability, evidence, effective date, affected projects and gates, supporting official/legal source, unresolved conflict.
4. Obtain correct human acceptance on substantive legal changes; resolve conflict with current official sources; never let AI decide a lawyer's approval.
5. Publish atomically; re-evaluate affected **active Project** requirements and approvals, preserve prior version/receipts, mark only affected tasks `STALE` or `NEEDS_REVIEW` and notify case staff/customer as appropriate.
6. Regression check all source scopes and role permissions; track which template version each package/decision used. Rollback a rules version deliberately without deleting source history.

A future PDF can be more recent than the current checklist, but **recency alone does not override applicable law, a published rule version or an approved customer package**. Lawyer-supplied standards may amend the workflow proposal at M0 or any later milestone, via an explicit decision record and review.

## 4a. Lawyer feedback intake (2026-10-23; not approved rules)

A later annotated copy of the provisional school/Student-500 review PDF contains practitioner comments on intake and evidence review, fee versus tuition custody, OSHC and comprehensive GS preparation. These comments are transcribed with page mapping, source hash, caveats and owner/professional follow-ups in [PHASE13_LAWYER_FEEDBACK_DELTA_2026_10_23.md](./tasks/PHASE13_LAWYER_FEEDBACK_DELTA_2026_10_23.md).

**Status: CAPTURED / PENDING REVIEW.** No legal/admissions matrix is approved; no tuition-custody or bank account/legal category is authorized; no country-specific OSHC rule is published. The linked feedback must be reconciled with M0-003-R2 and carried to M0-004 as explicit pending decisions. Do not expand M1, override a same-named unannotated PDF, or amend accepted R1 source contracts by implication.

## 5. Development / Git policy

- Work exclusively on `phase13-study-journey-project-centric` unless the owner explicitly creates another implementation branch. The source and existing 6 reference assets remain committed and retained.
- Shared state authority: update `CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md`, `DECISIONS.md` plus milestone/task docs when decisions actually change; do not claim tests or acceptance without evidence.
- Standard workflow: Codex bounded implementation -> report exact diff/tests/skips/deferred -> owner local validation -> commit/push with commands -> independently verify remote SHA -> next task. Preserve `AGENTS.md` invariants, existing environment, mode and payment behaviors.
- No force push/merge/rebase, no migrations/DB mutations, no AWS/Stripe/live agent calls or paid models without separate explicit owner authorization. M0-001 is strictly read-only except agreed documentation outputs.
- Existing known bugs are deferred unless directly blocking these deliverables or a concrete security/data-integrity exposure requires separately authorized action.
