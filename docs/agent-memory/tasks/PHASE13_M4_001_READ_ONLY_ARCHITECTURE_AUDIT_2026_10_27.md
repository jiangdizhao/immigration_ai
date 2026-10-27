# PHASE13 M4-001 — Read-only staff collaboration / professional engagement architecture audit

**Date:** 2026-10-27  
**Implementation branch:** `phase13-study-journey-project-centric`  
**Planning baseline:** `d1490a849045c50ef3ff8babf65109d1a1ff2664`; on execution, record and audit the actual synchronized HEAD.  
**Status:** `DISPATCHED / DOCUMENTATION-ONLY` — M4-002 onward are NOT authorized.  
**Primary authorities:** `AGENTS.md`, `docs/agent-memory/PHASE13_STUDY_JOURNEY_ROADMAP.md`, [M4 breakdown](../PHASE13_M4_STAFF_COLLABORATION_WORKBREAKDOWN_2026_10_27.md), `DECISIONS.md`, `CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md`, Phase 13 UI blueprint, Phase 13 M2/M3 accepted contracts. Actual repository source overrides historical summaries on implementation claims.

## Mission

**Inspect, do not implement.** Establish a grounded `as-is` inventory and a clearly labelled **proposed** minimal M4 `to-be` design for (i) project-scoped professional assignment and authorized dashboard data, (ii) durable human messages, (iii) engagement/contracts/consents, (iv) staff-confirmed off-platform payment, (v) version-bound professional review/approval and audit, and (vi) M5 managed school handoff preconditions. Separate existing code, proposed reuse, missing code, and undecided legal/business rules.

## 1. Required read-only audit surfaces

- M1 Project/membership/Chat ownership and route ingress, operation idempotency, locks/revisions, closed/disabled feature-flag behavior; server-side `ProjectConversation` identity.
- M2 `stableProjection().authorizedForAI`, `ProjectFacts`, explicit publish/AI grants, revoke/stale/conflict suppression, document evidence/scanning trust; **customer-to-staff disclosure must be a separate decision**, not inferred from AI grants or Project membership.
- Existing staff role model, lawyer workspace, admin routing, `LawyerClarificationRequest`, consultation booking/assignment, conversation-first lawyer audit vs customer-facing professional review; distinguish each existing object/role.
- Existing person-to-person message/thread features if any, attachment provenance/authorization, retention/deletion, notifications and ownership. Do not infer a service exists from a UI mockup.
- Existing Stripe VIP subscriptions/entitlements, any actual engagement/contract/signature/off-platform receipt concepts. Document absence explicitly; never access or mutate payment information.
- Existing audit/event conventions, immutable versioning, permission checks, test harnesses, Drizzle migrations and baseline diagnostics. Examine known MatterDocument `securityStatus` risk as a documented threat/dependency only, not a bug-fix task.

For every architectural claim include a **repository-relative path plus symbol/line range when feasible**, and clearly distinguish `IMPLEMENTED`, `PARTIAL`, `NOT FOUND`, and `PROPOSED`.

## 2. Required deliverables — docs ONLY

Create two *new* uncommitted Markdown documents (do not modify canonical state during execution):

1. `docs/agent-memory/audits/PHASE13_M4_001_AS_IS_REUSE_AND_GAP_AUDIT_2026_10_27.md`
   - Pinned local HEAD/branch/status and access constraints.
   - As-is entrypoints and entity inventory, owner/access scope, exact source citations and reuse decisions.
   - Explicit 'existing vs new' matrix across staff, assignment, messaging, engagement, signature, payment, review, audit.
   - Concrete negative access / TOCTOU / cross-Project / replay / version / consent / immutable audit risks, with severity and evidence.
   - Dependencies on deferred M2/M3 real-world gates; none claimed satisfied.
2. `docs/agent-memory/PHASE13_M4_ARCHITECTURE_PROPOSAL_2026_10_27.md`
   - Proposed minimal diagram and interfaces/reuse hierarchy; avoid second Chat/ConversationTurn or second universal audit framework.
   - Candidate bounded entities and constraints: e.g., `ProjectStaffAssignment`, `ProjectHumanThread/Message`, `ServiceEngagement`, `AgreementVersion`, `SignatureEvidence`, `CustomerDisclosureConsent`, `PaymentAttestation`, `ProfessionalReview/Approval`, `ProjectAuditEvent`, **only where gaps justify them**.
   - RBAC+ABAC action matrix: customer owner/member, assigned lawyer/education representative, principal/admin and other staff; Project, Chat, Fact, document, message, contract, review and approval as separate scopes. Current role names must be source-verified.
   - State-transition tables, revocation, append-only evidence, version invalidation, optimistic concurrency and server-side access recomputation; do not infer signed/paid/approved from LLM/free text.
   - Exact meaning of managed vs self-service preconditions; M5 fail-closed *interface proposal* only, no actual submission implementation.
   - Negative/positive test matrix and proposed incremental M4-002–M4-007 boundaries, migration/backfill/rollback *design only*, proposed M4-002 bounded Task Packet outline.
   - Open decisions for product owner and authorized lawyer/education professional (e.g., staff duties/licensing, document disclosures, signature enforceability, payment custody/attestation, retention/residency). Mark them `PENDING PROFESSIONAL/OWNER REVIEW`, not binding policy.

## 3. Hard scope limits

- Do not change application source, existing tests, `AGENTS.md`, migrations, the production build, or existing canonical docs; only the two new audit/proposal Markdown files may be created.
- No `git add`, commit, push, merge, rebase, reset, cherry-pick, force update or branch creation. Preserve all existing uncommitted files; stop and report a conflicting worktree.
- No real database or even historical isolated database access, SQL operations, migration execution, S3/GuardDuty/AWS/Stripe access, live DNS/HTTP fetch, customer files/data, external email, AI provider requests, deployment, real document signing or payment. Local `rg`, `git` read-only, `sed`, `find` and pure static checks are allowed; do not install dependencies.
- No hardcoded immigration eligibility or unapproved education/legal standards. No customer-visible capability statements or production acceptance.
- If a needed artifact is absent or path has moved, search repository and record the discrepancy rather than inventing it.

## 4. Audit acceptance and handoff

The reviewer must be able to trace:
- Project authority (source role, assignment, active membership, exact resource/owner, customer-to-staff disclosure and current revision) to each read/write/approve operation.
- Human message distinct from AI Chat, episodic clarification, consultation booking and formal approval.
- Contract version/signature consent/payment attestation backed by independently authorized evidence, with independent Stripe/VIP scope.
- Exact target/version/professional reviewer and mutation-invalidation for approval; M5 hard gates fail closed.
- Negative cases: unassigned staff, foreign Project, member private Chat, closed/revoked membership, revoked consent/grant, stale document, wrong owner, replay/duplicate, concurrent revoke, invalid signature/payment/approval, AI-invented status.
- An explicit list of unknowns/no-go rules and a **small M4-002 implementation proposal** for owner approval, not an implemented feature.

Run only static/document checks (e.g. `git diff --check`, `git status --short`). Report branch, HEAD, exactly two new paths, `sha256sum` for each, number of source files reviewed, any tests `NOT RUN (READ-ONLY TASK)`, and deferred verification. Provide the uncommitted/unpushed text/patch for independent review. **Stop after M4-001; do not start M4-002.**
