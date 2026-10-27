<!-- BEGIN PHASE13_M4_001_ACCEPTED_M4_002_DRAFT_2026_10_27 -->
**Latest status (2026-10-27): M4-001 ACCEPTED** at 5ac4c85f8066d16b5561f14728d8f3a1c418dc58; [final acceptance](./tasks/PHASE13_M4_001_R1_FINAL_ACCEPTANCE_2026_10_27.md). A corrected proposed architecture is a basis for subsequent owner decisions, **not fully accepted binding business policy**. [M4-002 draft](./tasks/PHASE13_M4_002_STAFF_ASSIGNMENT_AUTHORIZATION_DRAFT_2026_10_27.md) is **NOT DISPATCHED / NO CODING AUTHORIZATION**. Later M4-003–007 remain planned. Earlier statements below saying M4-001 is still active are historical. Phase 13 production NO_GO.
<!-- END PHASE13_M4_001_ACCEPTED_M4_002_DRAFT_2026_10_27 -->

# Phase 13 M4 — Staff Collaboration and Professional Engagement: bounded work breakdown

**Date:** 2026-10-27 (Australia/Sydney)  
**Branch:** `phase13-study-journey-project-centric`  
**Planning base:** `d1490a849045c50ef3ff8babf65109d1a1ff2664` (M3 final documentation checkpoint)  
**Authority:** [Phase 13 roadmap](./PHASE13_STUDY_JOURNEY_ROADMAP.md) M4; [UI/product blueprint](./PHASE13_UI_PRODUCT_BLUEPRINT_2026_10_24.md); [AGENTS.md](../../AGENTS.md).  
**Decision:** M4 subtask planning recorded. **Only M4-001, the read-only architecture audit/document deliverable, is currently dispatched.** M4-002–M4-007 are `PLANNED / NOT AUTHORIZED TO IMPLEMENT`; this plan does not itself approve any migrations, data access, production activation or live operations.

## 1. Milestone objective and dependencies

M4 creates the **human/professional relationship and accountability foundation** for a Study Journey Project: scoped staff assignments and dashboard data; durable person-to-person Project messages (not AI Chat nor `LawyerClarificationRequest`); engagement/contract versions and genuine signing evidence; staff-attested off-platform payment separate from VIP/Stripe; express customer authorization; and reusable version/scope-bound review, approval and append-only audit contracts. M4 precedes the **managed submission** portion of M5; M8 later strengthens version-bound submission approval.

M4 does **not** implement school admission submission, visa submission, lawyer legal-advice decisions, school Offer/CoE issuance, actual contract signature provider, payment processor, client production onboarding or broad employee access.

### Non-negotiable boundaries

1. **Identity and scope:** `Project != Chat != LegalMatter != VIP/Stripe subscription`. A global `lawyer`, `admin` or future education-staff role never automatically acquires access to every Project or member's private Chats.
2. **Authorizations are independent:** owner/member/Chat ownership, Project staff assignment, customer-to-staff disclosure of each protected data class, M2 Fact publication/AI grants, AI context use, signing and professional approval are separate authorities. Customer-to-AI consent is **not** customer-to-staff consent.
3. **Evidence not assertion:** AI, client free-text and service UI cannot confer employment role, signature, paid status, licensed/professional authority, consent, review or approval by themselves. Maintain provenance, actor, exact scope, version, revocation and audit.
4. **Default deny and revocation:** closed Project, revoked membership/assignment/disclosure, scope mismatch, stale version, ownership change or replay cannot silently preserve privileged access or an approval; apply fresh checks at the protected operation boundary.
5. **Preserve existing systems:** existing `Chat`/`ConversationTurn`, `LawyerClarification*`, consultation, lawyer-review/AI-quality audit, M2 document/fact authorization and Stripe/VIP workflows are not implicitly modified, merged or replaced.
6. **Managed vs self-service:** managed downstream handoff must fail closed without active scoped engagement, required contract/signature/customer authority, any contractually required staff-attested payment, exact package professional approval and legally authorized human submitter. Self-service never displays false professional approval; all external submission belongs to future milestones.
7. **Scope and evidence:** live/prod remains `NO_GO`. M2/M3 `ACCEPTED_WITH_LIMITATIONS` are offline engineering findings, not proof of real customer/data/source or professional correctness.

## 2. Planned submilestones (bounded sequence)

| ID | Deliverable | Acceptance criterion | Authorization |
| --- | --- | --- | --- |
| **M4-001** | **Read-only as-is audit and proposed to-be architecture.** Inventory real Project/M1, M2 grants, existing lawyer/admin/consultations/clarification/review, message, contract/payment and audit facilities; propose reuse map, schema boundaries, RBAC/ABAC, state machines, threat matrix, minimal incremental path and M4-002 implementation contract outline. | Every asserted existing facility cites exact files/functions; unknowns and legal/professional decisions are explicit; negative access, revocation, racing and replay tests are planned; reviewer/owner can accept or request correction before implementation. No code or migration. | **DISPATCHED: documentation-only audit.** |
| **M4-002** | Project-scoped professional identity/assignment, invitation/acceptance/revocation and protected staff read/edit scopes; minimal dashboard read DTO. | Only assigned and expressly authorized actors access a Project/data class; staff role by itself grants no Project data; stale/revoked/closed cases rejected transactionally; traceable audit. | PLANNED / NOT AUTHORIZED |
| **M4-003** | Durable Project human messages independent of AI Chats, consultation and episodic clarification, with author/recipient, ownership, retention and attachment-consent policy. | Cross-Project/owner and revoked staff read/post fail; delivery/replay/ordering durable; no message counts as formal review/contract approval; no implicit private-file sharing. | PLANNED / NOT AUTHORIZED |
| **M4-004** | Versioned `Engagement`/agreement/contract with explicit customer authorization and authentic signature evidence references; scoped service terms and lifecycle. | Cannot infer signed/engaged from AI or messages; exact contract version, authorized signatory, consent, timestamps and revocation are audited; legal enforceability/signature provider separately reviewed. | PLANNED / NOT AUTHORIZED |
| **M4-005** | Independently attested off-platform service payments or payment-condition records, with staff identity and supporting evidence; isolated from existing Stripe VIP billing. | No client/AI self-attestation or fabricated payment; reversal/correction auditable; no changes to `invoice.paid`, VIP entitlement or subscription webhooks. | PLANNED / NOT AUTHORIZED |
| **M4-006** | Generic project-scoped immutable review/approval/audit domain and exact target/version binding; explicit professional authority. | Wrong actor/scope/target/version rejected; material revision or revoked authority invalidates affected approval; free messages and AI feedback are never professional approvals. | PLANNED / NOT AUTHORIZED |
| **M4-007** | Offline integrated negative/positive contracts across assignment, human messaging, engagement, payment attestations, consents and reviews; M5 managed-handoff gate interface. | Deny-by-default test matrix passes, including membership and grants changes during operations; standalone and legacy paths unchanged; accurate acceptance matrix distinguishes synthetic/DB/live verification. | PLANNED / NOT AUTHORIZED |

**Sequence:** M4-001 audit/owner architecture approval → narrowly specified M4-002 → M4-003 → M4-004 → M4-005 → M4-006 → M4-007, with explicit separate task packet, review and owner authorization per step. Any migration execution, test database access, real customer data or AWS/Stripe interaction always needs separate exact-target authorization.

## 3. M4-001 output, review and promotion gate

Execute only [M4-001 task contract](./tasks/PHASE13_M4_001_READ_ONLY_ARCHITECTURE_AUDIT_2026_10_27.md). Codex should produce **uncommitted/unpushed** audit and proposed design documentation with exact code citations. ChatGPT performs independent source review; owner resolves open architectural, privacy, professional and commercial choices before marking the architecture frozen. Do **not** silently treat the candidate entities or draft state machines as accepted legal rules.

The eventual M4 exit gate remains that of the parent Roadmap: scoped lawyer/education representative view/edit; durable human messages; truthfully evidenced contract/consent/payment; no unauthorized approval; legacy lawyer requests and Stripe intact; managed submission blocked without complete scope-bound human authority. This is not a release approval.
