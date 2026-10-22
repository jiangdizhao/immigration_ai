# Phase 13 M0-002 — Project Data, Document Ownership, and Authorization Contracts

**Status:** READY TO ASSIGN; NOT IMPLEMENTED / NOT OWNER ACCEPTED.  
**Branch:** `phase13-study-journey-project-centric`.  
**Prerequisite M0-001:** source audit committed at `0d17ab34db7ceae55ad6df57ebce0b6a850b31f7`. ChatGPT has reviewed and accepted the architecture **audit as input** to M0-002; this is **not** final owner signoff of schema/business rules.  
**Task type:** architecture/specification documents **only**. No code, migration, deployment, database mutation, or paid calls.  
**Source of scope:** [Roadmap](../PHASE13_STUDY_JOURNEY_ROADMAP.md), [M0-001 source audit](./PHASE13_M0_001_AUDIT_RESULT.md), `AGENTS.md`, `DECISIONS.md` and six `doc/` reference assets.

## Goal

Deliver a precise, reviewable architecture contract for data ownership, lifecycle, access control, and professional engagement across standalone Chat and opt-in Study Journey Projects, before any M1 implementation. The design must remain provider/visa-extensible and accept later lawyer/agent standards changes.

## Design positions to test (not yet schema-approved)

1. Prefer **Project-owned logical document assets** for new Project uploads, with immutable versions and per-scope grants. Uploading via Project Chat must not cause Chat deletion to delete Project assets; Standalone Chat retains its current deletion semantics. Explicit import from a Standalone Chat should create a distinct Project-owned asset/copy (or an equivalently safe durable ownership transfer), preserving provenance and auditable user consent. Debate at least one realistic alternative. Do not assume an unreferenced MatterDocument FK is sufficient.
2. Start with **one primary student/applicant plus related people**, without baking in a single-person-only database invariant that prevents later family/secondary applicants or school applications. Model person vs User account explicitly and note where school and visa applications have different applicant sets.
3. **Professional identities vs capabilities:** current lawyer and admin identities exist; the firm may use the same person as lawyer and education agent. Model action-scoped permissions/assignments rather than granting every staff member blanket access; preserve existing verified-account checks. Separate customer-visible messages, internal staff notes, and formally approved legal judgments.
4. Managed-school and managed-visa application packages each require exact-version lawyer approval, customer authorization, and applicable active engagement/contract/offline-payment terms; the institution/government decides actual outcomes. Self-service does not require engagement or lawyer approval, but must not claim to be lawyer-reviewed; Free/VIP entitlements remain unrelated.
5. Four provisional school/Student-500 fact/document baseline matrices are **changeable templates**, not laws. Versioned lawyer/agent standards and current official source evidence must remain separate. Proposal includes partial/stale/conflict cases and impact propagation.

## Questions to resolve at specification level

### A — Entity model / ERD

Present a Mermaid ERD plus written cardinality/owner, PK/FK candidate, uniqueness/nullable rules and data lifecycle for:
- `StudyJourneyProject`, ProjectMembership/Assignment and `ProjectConversation` (never conflate with `LegalMatter`);
- `ApplicantPerson` / family or related-party link; `SchoolApplication` (multiple provider/intakes), `VisaApplication`;
- `ProjectDocumentAsset`, immutable `DocumentAssetVersion`, Chat intake/import/Project grant and evidence/extraction reference, package evidence binding;
- `FactAssertion` with provenance, review status, supersession/dispute and per-person/application scope;
- `RequirementTemplateVersion`, `RequirementInstance`, source snapshot/policy reference and eventual task dependencies;
- `ProjectMessage`, staff notes, `ReviewTask`, immutable `ApplicationPackageVersion`, package-bound `LawyerApproval`;
- `ServiceEngagement`, `ContractVersion`, `ContractAcceptance`, `OfflinePaymentConfirmation`, `CustomerSubmissionAuthorization`, `SubmissionRecord`, append-only audit events.

Keep entity count proportional to real invariants; clearly identify which may be folded together without weakening audit/security.

### B — Ownership, file lifecycle and privacy

Produce an explicit lifecycle matrix for upload (project vs standalone), parse/security gate, chat deletion, revoke project access, document remove, project delete, package retention and lawful retention/legal hold (rules **pending lawyer advice**). Explain storage key/object refcount or copy-on-import alternatives and clean/pending GuardDuty evidence behavior. Specify separation of logical visibility, physical object retention and source authority. No copied Project document may be silently lost when source Chat is deleted. Existing document preview/history APIs must remain compatible. Do not claim unapproved legal-retention periods.

### C — Access/capability matrix

Actors: owner/customer, authorized assigned lawyer, authorized professional with education-agent capability (possibly same person), principal-lawyer admin, support role if actually warranted, model/service account. Operations: project create, link Chat, read/edit fact, inspect/download docs, project human chat, internal notes, review, contract send, accept, confirm offline payment, approve package, record external submission, export, delete. State server checks and negative cases, including revoked member/token and concurrent package modification. Keep existing lawyer-clarification attachment opt-in boundaries.

### D — Proposed typed contracts and transitions

Specify type-shapes (pseudo-schema, **not executable code**) and pre/postconditions for: `CreateProject`, `LinkConversation`, `ProjectDocumentUpload/Import`, `ProjectContextResolver`, `FactAssertion`, `RequirementTemplateVersion`, `LawyerReview`, `ServiceEngagement`, `SubmissionGate`, `ExternalReceipt`. Distinguish individual source/provenance, current official applicability and human approval. Include optimistic concurrency, idempotency, hash binding, audit events, and source-unknown/failed extraction outcomes.

### E — Plan for rollout and updates

Outline additive migration files/ordering and rollback concept **without writing SQL or applying migrations**; component ownership (Next.js API/DB vs FastAPI legal reasoning), facade/adapter points into chat/evidence/turn ledger, feature flags and legacy unaffected path. Note `MatterDocument.chatId` required and current chat-deletion S3 cleanup. Define transition for existing Project files/legacy uploads with **no automatic backfill**. Lawyer-provided new PDF/standards -> source import -> comparison -> reviewed template version -> affected Project re-evaluation -> package approval invalidation, preserving history.

## Deliverable

Create `docs/agent-memory/tasks/PHASE13_M0_002_DATA_AUTH_DESIGN.md` with:
1. Evidence and assumptions ledger (VERIFIED vs PROPOSED vs LAWYER PENDING).
2. Mermaid ERD and precise relational contracts.
3. Document lifecycle decision record: primary option, alternatives, race/error/rollback.
4. Identity/capability matrix and denial tests.
5. Typed API/service contracts and state-transition tables.
6. Self-service vs managed authorization truth tables for both school and visa; VIP isolation.
7. Additive migration/backfill/rollback + dependency impact diagram.
8. Open owner/legal/agent questions with **recommended defaults** and clearly marked non-decisions.
9. Specific M0-003 workflow/policy tasks and gate recommendations.

Update `CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md` only to record the factual M0-002 output status (AWAITING OWNER REVIEW, not passed). Do **not** add ACCEPTED decisions to `DECISIONS.md` without the owner explicitly adopting them.

## Acceptance criteria

- Source-grounded existing schema/functions with paths/line refs; all new items labelled PROPOSED.
- Document shared-lifecycle corner cases and deletion/privacy semantics fully mapped.
- One preferred and one alternative implementation compared with migration risk and technical debt.
- One primary + related persons, multi-school and future visas modeled without hardcoded scenarios.
- Explicit staff-only vs customer-visible communications and audit, least-privilege Project membership.
- Lawyer approval cannot be fabricated and is bound to exact version; payment confirmation is staff-only, not VIP.
- Unknown legal standard, stale official content, failed security/processing states cannot masquerade as approved or complete.
- Schema changes, application code, external submission and live operations are **zero**.
- Deliverable ready for independent owner/ChatGPT review and targeted correction before M0-003.

**Required stop:** after spec documents and `git diff --check`; report changed files, scope gaps, concrete owner questions, and local commit/push commands. Do not commit/push or start M0-003.
