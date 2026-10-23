# Phase 13 M0-003 — Study Journey Workflow and Requirements Governance Contract

**Status:** READY TO ASSIGN; NOT STARTED / NOT OWNER ACCEPTED  
**Branch:** `phase13-study-journey-project-centric`  
**Prerequisite M0-002-R1:** committed `355721919d049d16070dfc887105d3c2a943afaa`; independent design review **PASS WITH FOLLOW-UP CONDITIONS**, not schema freeze, lawyer approval or production authorization.  
**Scope:** documentation/design only. No implementation, migration, DB mutation, AWS/S3/Stripe activity, external submission or paid model calls.

## 1. Sources and authority

Read `AGENTS.md`, `docs/agent-memory/{CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE,DECISIONS,PHASE13_STUDY_JOURNEY_ROADMAP}.md`, [M0-001 audit](./PHASE13_M0_001_AUDIT_RESULT.md), [M0-002 design](./PHASE13_M0_002_DATA_AUTH_DESIGN.md), [M0-002 task contract](./PHASE13_M0_002_DATA_AUTH_CONTRACT.md) and all six `doc/` reference PDFs/PNGs. The two PDF documents are **PROVISIONAL**, not official/current-law assertions or lawyer/education-agent approved rules. Inspect source for actual Policy Intelligence source/revision conventions, conversation binding, evidence provenance, lawyer editorial authority, durable turns, and document lifecycle as needed. Record observed paths/functions; do not confuse proposed M0 contracts with currently shipped features.

Business direction already agreed: explicit opt-in Project, legacy Standalone Chat independent; shared Project facts/docs via authorized resolver; one primary applicant plus related persons; simultaneous independent school applications; Student 500 may begin with valid pre-existing CoE or other legally verified exception; school and visa workflows have reviewed fixed high-level stages and AI-proposed dynamic tasks; professional-managed packages require exact-version lawyer signoff, contract coverage, fee condition where applicable, customer authorization and human submission. Free/VIP is separate. School/visa requirements are dynamic and source-specific.

## 2. Main objective

Produce a precise **workflow and policy/requirements governance specification** usable to implement M3/M5/M6/M7/M8 progressively. Keep the base workflow deterministic and testable, while AI adds or prioritizes *bounded tasks/clarifications*, requests sources and drafts; AI may not self-certify laws, remove hard guards, approve packages, claim actual submission or invent dates/receipts.

### A — Two workflows and entry routes

Document **separate versioned state machines** for School Admissions and Student 500, with:
- Project-level journey orchestration (not identical to either application), multiple school/provider/campus/intake applications and their own state;
- baseline routes: (i) no Offer, (ii) existing Offer, (iii) existing CoE (or separately qualified alternative where law permits);
- visa feasibility/risk screening early *before costly school commitment*, no unsupported guarantee of eligibility;
- university/course search, eligibility, evidence, school application package, customer review, managed lawyer review, external authorized school submission, receipt/status, offer evaluation, conditions, acceptance, CoE, refusal/withdrawal/defer/reissue, follow-up;
- Student 500: applicant/party, substantive/bridging and onshore/offshore/context facts as *candidate* checks, official current requirements and applicable dates, Document Checklist Tool provider/dependent variation, GS AI draft, customer fact confirmation, managed lawyer edits/signoff, OSHC, English/finances where applicable, immutable package, submission authorization, human lodge/receipt and post-lodgement changes;
- historical event-time vs current effective law and third-party issuance; never synthesize a CoE, offer, receipt, case status or visa grant;
- concurrent applications and cross-workflow dependencies (e.g., school CoE handoff to visa) without collapsing application states or automatically reusing an irrelevant school-specific requirement;
- termination, retries, suspension, edit/reopen, cancellations, later course/provider changes and client leaving professional service.

Provide Mermaid state diagrams plus tables with permitted transition, actor, evidence, guard, audit and invalidation. Diagram static syntax must be validated to the extent tool support permits; report when no Mermaid renderer is available.

### B — Deterministic orchestration + AI adaptive task planning

Separate `WorkflowTemplateVersion` / fixed stage contracts, `WorkflowInstance`/application state, `TaskPlanProposal`, reviewed `TaskInstance`, requirements and gates; justify reusing `ProjectTask` instead of unnecessary new entities. Typed pseudo-input/output for a bounded **TaskPlanner** and deterministic **TaskPolicyValidator**:
- proposal origin, objective, parent stage, source/evidence refs, triggering fact or missing requirement, suggested actor, dependencies, priority, expected outcome, idempotency key, estimated risk/currentness and provenance;
- max task budget and de-duplication, cycle detection, no unbounded re-planning, explicit user confirmation when requesting sensitive information, rate/cost control;
- monotonic gates for approval/recording external states, dynamic branching without hardcoded regex or country/visa keyword shortcuts;
- automatic retries/cancel/replan after facts/documents/source change, staff overrides with reason, unresolved or inconsistent facts remain visible and block only the appropriate professional gate;
- user-readable progress must distinguish **activity completion**, **document completeness**, **requirement readiness**, **professional submission readiness**; percentages cannot imply immigration/admission success probability.

### C — Source authority, applicability and temporal governance

Define source identity and precedence without inventing current law or universal school policies. Distinguish:
- Australian legislation/instruments and their commencement/transitional provisions, Home Affairs official guidance/checklist, CRICOS and each institution's official policy/course/intake requirements, human-provided professional standards (internal), AI/web/research candidates;
- exact captured source snapshot + canonical URL/issuer, retrieval time, source publication date, effective date/period, version/hash, claimant context and uncertainties;
- operative law vs proposed/announced/withdrawn guidance and historical effective-time treatment;
- source unavailability, stale or contradictory sources, official requirements that differ by specific provider/applicant and institutional/ImmiAccount documentation availability;
- trusted server retrieval and snapshot identity; untrusted provider/customer documents cannot override platform instructions/permissions, approval status or provenance;
- existing Phase 12 Policy Intelligence source/revision/attestation surfaces are reusable *patterns*, not automatically approved eligibility decisions.

Specify human authority for rules review/publish, why and when source changes trigger reassessment, and what cannot be marked approved if legally uncertain. Lawyer feedback can arrive after foundational M1/M2 development; do not mandate universal lawyer signoff of *technical* milestones.

### D — Requirement template governance and four baseline matrices

Map identifiers/categories in the provisional school-facts, school-documents, Student-500-facts, Student-500-documents PDF to **machine-readable versioned candidate templates**. No need to transcribe full PDF if not necessary, but provide exact mapping conventions, sample rows across required/conditional/optional/outcome. Distinguish:
- `intake_requested`, `answered`, `evidenced`, `source_consistency_checked`, `customer_confirmed`, `professional_verified`, `applicable`, `requirement_satisfied`, `package_approved`;
- validated rule expressions with typed operands and explicit unknown/false/true (three-valued logic), dependency graph, cycle checking, source/effective-date pinning;
- institution-specific admissions vs Home Affairs application-specific evidence; do not invent universal document list or requirements;
- changes to lawyer-provided files: append version, compare field/condition/source, mark proposal pending, qualified approval for applicability, scoped publication, evaluate which applications/tasks/packages changed, append new assessments and preserve past records.

Produce a concrete **rule-change impact algorithm** and worked examples: English-evidence waiver, institution updated deadline/intake, Student 500 applicable financial/GS or dependant condition with uncertain legal commencement, and corrected user fact after package approval.

### E — Three independent purposes and two service modes

Reconcile M0-002's three distinct outcomes:
1. AI preparation/export availability (safe, owned, correctly labelled; provisional advisory gaps do not block output);
2. informational/requirement status (unknown or incomplete is visible; never legal compliance certification);
3. managed professional submission gate (strict, deterministic, exact approved package/hash, current reviewed material sources, current assignment, scope-specific contract/customer acceptance, fee terms, customer authorization and required lawyer approval).

Provide four-path truth tables (School/Student500 × Self/Managed), ownership and hazard scenarios. Self-Service customers perform external submission themselves; product may prepare labelled export without imposed managed engagement/approval. Managed human submitter handles permitted external lodge with verified external receipt; no automated external calls. GS must record AI origin, customer-confirmed personal facts/final statements and lawyer-edited, exact-version approved text. One appropriately verified individual may hold both lawyer and education-agent capabilities, but each action uses its own authorized capacity. No default second reviewer.

### F — Professional engagement and account flows

Formalize Project-level engagement spanning explicit school+visa coverages, school-by-school review and approval, terms revisions and application-specific guards. **Resolve M0-002 follow-up:** one real off-platform payment may satisfy allocated fee obligations across several covered services without duplicating cash receipts, by distinguishing immutable `PaymentEvent` and `PaymentAllocation/Satisfaction` (or carefully justified equivalent). Specify partial payment, credit, waiver, refund/reversal, scope amendment, contract acceptance and cancellation effects. These are design records only; professional fee terms and legal compliance remain owner/lawyer pending. Keep Stripe VIP untouched.

### G — Close three M0-002 technical follow-ups without unsafe early implementation

1. `ApplicationParty` target candidate key: the M0-002 design claims a `FactAssertion(projectId,applicationId,personId)` FK to `ApplicationParty`, but the defined uniqueness includes `partyRole`. Propose precise fix/alternative for multiple roles, relational integrity and at most one principal applicant.
2. Generic ProjectApplication first appears M2 while School/Visa subtype tables are staged M5/M7, conflicting with a blanket immediate deferred exactly-one-subtype trigger. Recommend an incremental invariant strategy (single discriminated base row versus staged type-specific constraints) and stage-wise negative tests. No migration.
3. Contract payment allocation as above. Include owner-decision ledger: recommend technical defaults, label PRODUCT OWNER PENDING where appropriate. **Do not silently mark proposed choices as approved**.

### H — Security, test and release boundaries

Include policy source prompt injection, cross-Project task/evidence leakage, race between policy update and package approval, stale/out-of-order source updates, duplicate task proposals, two concurrent reviewer decisions, contract/scope/payment reversal, consent withdrawal and report/receipt forgery. The currently source-verified legacy storageStatus->securityStatus clean bug must remain explicitly recorded; do not replicate it or claim it is fixed in code. Separate code remediation prerequisite before any Project file processing with actual customer data from the M0 design work.

## 3. Required output

Create `docs/agent-memory/tasks/PHASE13_M0_003_WORKFLOW_POLICY_DESIGN.md` containing:
1. Evidence, invariants and provisional/legal authority boundaries.
2. Project/school/visa end-to-end state diagrams with transition tables and 3 entry routes.
3. Fixed-stage orchestration and adaptive AI planner contracts, validation, limits, failure and retry.
4. Source/effective-time authority matrix and requirements governance with concrete candidate mappings from all four PDFs.
5. Rule DSL / three-valued applicability evaluation and impact/invalidation algorithm.
6. Versioned packet review/GS/collaboration and A/B/C gate truth tables.
7. Contract coverage/payment allocation model and authorization states.
8. Three M0-002 relational follow-up resolutions with recommended technical choice and explicit owner decisions.
9. Threat model and scenario-oriented test/acceptance matrix, including self/managed × school/visa.
10. M0-004 architecture-freeze checklist and outstanding lawyer/agent signoff list.

Update `CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md` **only as needed** to truthfully say M0-003 design delivered, **AWAITING INDEPENDENT OWNER REVIEW**. The M0-002-R1 deliverable was independently reviewed with conditions and committed at `3557219...`; preserve that history. Do not change `DECISIONS.md` to claim professional approval or final M0 freeze.

## 4. Acceptance and stopping conditions

- User can trace every high-level transition to concrete actor, preconditions, provenance, history and failure; multiple schools do not overwrite one another.
- AI proposed tasks are bounded and allowed to operate autonomously without conferring human approval or removing fixed legal/professional gates.
- Unknown date/status/provisional rule cannot become an affirmative legal-compliance claim, but does not alone block self-service AI draft/export.
- Version changes invalidate *only relevant* active requirements/packages; historical submissions remain immutable.
- School/visa, self/managed, no Offer/existing Offer/existing CoE, family/GS, changes/cancellation, 2+ school applications covered by explicit test cases.
- Multi-application contract/payment allocation correctly represents a single real payment plus split obligations, revisions and reversals.
- M0-002 FK/subtype staging inconsistencies have precise proposed solutions and explicit non-decisions.
- No AI-generated approval or submission; source status and effective dates not fabricated.
- No code, SQL migration, test DB, live AWS, external submission, paid calls, no new standalone customer sharing.
- Run `git diff --check`, identify all changed files, record tests **not run** and what could not be independently validated.
- **Do not commit/push** without separate owner authorization. Do not begin M0-004 or M1. Stop for independent review.
