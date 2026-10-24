# DECISIONS

<!-- BEGIN DECISION_PHASE13_M1_4_UX_DIRECTION_2026_10_24 -->
## D-P13-007 — Project-centric UX direction and bounded M1.4 start

**Date:** 2026-10-24
**Status:** OWNER ACCEPTED — UX PRODUCT DIRECTION; M1.4 BOUNDED UI IMPLEMENTATION AUTHORIZED; later-stage technical/legal contracts NOT approved by implication.

Owner accepted the lawyer-inspired left-hand step navigation, project-wide and step-scoped conversations, documents with provenance and independent AI/user/professional review status, project fact cards, truthful progress vs submission readiness, workflow/task gates, and self vs managed service distinction as the **target** product direction. These appear progressively only where backing domain contracts and server-side authorization exist, according to the canonical Phase 13 roadmap (M2 data/facts/documents; M3 education intelligence; M4 professional/engagement; M5–M8 applications/reviews/gates; M9 integrated interface; M10 pilot). This does NOT approve any provisional lawyer/school/visa baseline, evidence requirements, finance handling, or external submission.

Owner authorizes M1.4 to use the existing customer AI Workspace only for explicit Project create/select and individually owned Project Chat create/open, distinguish it from Standalone, and preserve the read-only closed/feature-disable fallback, with default Chinese/English switch and responsive layout. No Project name/type/step/progress/document/fact/shared AI context or lawyer task may be fabricated where the existing model lacks a field or reviewed logic. Preserve all M1.3 authorization and server default-off Project Chat write/turn flag.

References: `PHASE13_UI_PRODUCT_BLUEPRINT_2026_10_24.md`; `tasks/PHASE13_M1_004_MINIMAL_CUSTOMER_WORKSPACE_CONTRACT.md`; decisions D-P13-002–D-P13-006.
<!-- END DECISION_PHASE13_M1_4_UX_DIRECTION_2026_10_24 -->


<!-- BEGIN DECISION_PHASE13_M0_PROVISIONAL_2026_10_23 -->
## D-P13-001 - Study Journey Project and provisional legal baselines

**Date:** 2026-10-23  
**Status:** OWNER-APPROVED PRODUCT DIRECTION; TECHNICAL CONTRACT AND LEGAL STANDARDS PENDING M0 / LAWYER SIGNOFF.

Owner authorizes designing a Project-Centric Study Journey architecture on `phase13-study-journey-project-centric`. A Study Journey exists only upon explicit Project creation; Standalone Chat stays independent and is never silently migrated. Project does not equal Legal Matter. Phase 12 D-009's no-Project rule was phase-limited, and is superseded **only for Phase 13 architecture/design and future separately approved implementation**. All prior data ownership, file sharing, persisted-turn, entitlement, evidence, security and human-editor rules remain in force unless explicitly amended after review.

The two source PDFs committed under `doc/` are provisional review inputs, **not lawyer-approved regulations**. The newer owner requirements amend the V2 PDF: lawyer review of each managed school application package before authorized education representative submission; minimum school and visa Intake with dynamic conditions; GS individualized drafts edited/approved by lawyer in managed service; staff-wide assigned-case dashboard, permissioned edits and continuous human chat; separate management of signed professional contract and staff-verified offline payment, unrelated to Stripe VIP; user-authorized self-submission with legally reviewed disclosure, distinct from Managed Service. Human reviewer decisions and third-party submission receipts cannot be inferred from AI output. Unknown rules are not silently passed.

Roadmap and acceptance conditions: [PHASE13_STUDY_JOURNEY_ROADMAP.md](./PHASE13_STUDY_JOURNEY_ROADMAP.md). M0 authorizes **read-only audit and documents only**; no API, database, migration, production changes, lawyer signoff or live external application submission is approved by this record.
<!-- END DECISION_PHASE13_M0_PROVISIONAL_2026_10_23 -->

<!-- BEGIN DECISION_PHASE13_M0_OWNER_ACCEPTANCE_2026_10_24 -->
## D-P13-002 — Project and Chat dual authorization

**Date:** 2026-10-24

**Status:** OWNER ACCEPTED — TECHNICAL CONTRACT

Following M0-004 finding F-01, the owner accepts this authorization contract. One Project may have multiple customer members. Each Project-linked Chat remains owned by its individual authenticated creator; Project membership does not grant access to another member's Chat transcript. Every Project-linked history, detail, update, widget-turn, and other relevant operation must verify both current Chat ownership and current Project authorization, including Project lifecycle and membership status. Membership revocation denies subsequent Project Chat operations. Existing Standalone Chats are never silently linked to a Project. Browser-supplied Project IDs and roles are selectors, not authority. This decision establishes a technical contract only; implementation and security/regression verification remain pending.

This decision is consistent with the durable owner-history and shared turn requirements in D-009 and D-010. It does not approve unrelated M0-004 recommendations or authorize M1 implementation.

## D-P13-003 — Project rollback and durable Chat history

**Date:** 2026-10-24

**Status:** OWNER ACCEPTED — TECHNICAL CONTRACT

Following M0-004 finding F-02, the owner accepts this rollback contract. Emergency Project feature disablement must not delete or orphan persisted Chat/Turn records. Authenticated Chat owners retain read-only history through a clearly identified Project-origin fallback, subject to current authorization and every existing restriction. The fallback permits no new Project writes, Project AI context, or model turns; it does not reclassify a Project Chat as Standalone or bypass membership revocation. Feature rollback, normal Project closure, and membership revocation remain distinct states and must not be treated as equivalent. Case-specific closure access, retention, and privacy policy remain explicitly pending owner/privacy review; this decision does not determine them.

This decision preserves the durable history and turn-lifecycle requirements in D-009 and D-010. It is a technical contract only; implementation and security/regression verification remain pending, and M1 is not authorized.
<!-- END DECISION_PHASE13_M0_OWNER_ACCEPTANCE_2026_10_24 -->

<!-- BEGIN DECISION_PHASE13_M1_FOUNDATION_2026_10_24 -->
## D-P13-004 — Phase 13 M1 Foundation Owner Decisions

**Date:** 2026-10-24

**Status:** OWNER ACCEPTED — TECHNICAL CONTRACT

On 2026-10-24, the owner accepted Decisions C–G below as bounded M1 technical contracts. They supplement D-P13-002 (Project/Chat dual authorization) and D-P13-003 (feature-rollback history fallback); they do not reverse either decision or authorize implementation.

**C — Project ownership and cardinality.** A User may own multiple `StudyJourneyProject` records. Each Project has exactly one canonical owner in `StudyJourneyProject.ownerUserId`; owner authority derives from this field and is not duplicated as a removable `ProjectMembership` row. `ProjectMembership` contains additional customer members only. The owner cannot be removed through membership revocation. Ownership transfer is unsupported in M1. Project, Chat and LegalMatter identities remain distinct.

**D — Customer membership lifecycle.** The Project Owner may invite an existing registered account, and that account must explicitly accept before receiving Project access. Membership states distinguish `pending`, `active` and `revoked`; pending and revoked memberships have no Project access. The Owner may revoke another customer's membership, and revocation denies subsequent Project operations immediately. M1 requires no email invitation system. Customer membership grants no staff, lawyer, agent or global administrator capability. Account targeting and invitation APIs must avoid account enumeration and identity disclosure.

**E — Project closure and history.** M1 closes Projects softly. A closed Project rejects new Project Chats, AI turns and business mutations. Existing users who remain authorized may read only Project Chats they personally own; a revoked member cannot regain access through closure or fallback. Closure, membership revocation and emergency feature disablement are distinct. Persisted Chat and Turn data are not deleted or reclassified as Standalone. Physical deletion, legal hold, retention periods, erasure and long-term recovery remain subject to later privacy/records approval; no deletion period or unrestricted read access is promised. This adds the normal-closure read-only contract to D-P13-003. Any earlier proposal that closure categorically denies all reads is superseded for M1 by this decision.

**F — Minimal M1 frontend.** Reuse the existing customer AI Workspace for only minimal Project creation, Project selection, and creation/opening of Project-linked Chats. Keep Project Chat origin visibly distinct from Standalone Chat; preserve existing Standalone creation and history; do not provide cross-member transcript sharing. Membership lifecycle may be API-first in M1; a member-management dashboard and a complete customer portal or lawyer workspace are not required.

**G — Idempotency and transaction integrity.** Project creation, membership-changing operations and Project Chat creation/linkage use a server-validated operation identifier scoped to the authenticated actor and operation, bound to a canonical request hash. An identical replay returns the existing outcome; reuse with different content conflicts; concurrent identical requests cannot create duplicates. Project Chat creation, its `ImmigrationConversation`, `ProjectConversation` association and required audit event commit atomically. Partial failure leaves no orphaned or cross-owner records. Keep the existing durable turn ledger; do not create a second turn-persistence system. Key expiry, retention and storage details may be bounded implementation choices but cannot weaken these guarantees.

These are technical decisions only. They do not approve legal/admissions rules, financial custody, professional scope, privacy/retention policy or later-stage workflow details.

## D-P13-005 — Phase 13 M0 Technical Foundation Freeze

**Date:** 2026-10-24

**Status:** OWNER ACCEPTED — TECHNICAL FOUNDATION FROZEN FOR BOUNDED M1 PREPARATION

Together, D-P13-002, D-P13-003 and D-P13-004 freeze the following technical foundation for bounded M1 preparation:

1. Explicit Project identity, canonical ownership and the accepted active/closed lifecycle.
2. Customer membership identity, pending/active/revoked authorization and immediate subsequent-operation denial after revocation.
3. Project Chat association only for newly created Project Chats, with Project/Chat dual authorization.
4. Existing Chat ownership and the durable shared turn-ledger contract; no parallel Project turn store.
5. Soft closure, owner-only-per-Chat read access for users who remain authorized, and denial for revoked members.
6. Project-origin read-only history under D-P13-003 during feature rollback, with no reclassification or authorization bypass.
7. Actor/operation-scoped idempotency, canonical request-hash conflict detection, transaction integrity and the minimal M1 Workspace boundary.
8. Separation of this foundation from later Project evidence, workflows, professional review, financial custody and payments.
9. M0-001/M0-002/M0-003/M0-004 technical invariants to the extent consistent with these accepted decisions; unaccepted proposal details are not incorporated by implication.

This freeze authorizes preparation of the bounded M1.1 task contract and independent review only. **It does not authorize M1.1 implementation, code changes, migration generation/application, database changes or deployment.** ApplicationParty/Role normalization, staged application-subtype enforcement, evidence grants, full staff authorization, and other M2–M8 contracts remain for their respective owner decisions and gates. The four legal/admissions matrices and all applicable legal, education-agent, financial, privacy/records and other professional decisions remain provisional or pending.
<!-- END DECISION_PHASE13_M1_FOUNDATION_2026_10_24 -->



<!-- BEGIN DECISION_PHASE13_M1_2_OWNER_ACCEPTANCE_2026_10_24 -->
## D-P13-006 — Phase 13 M1.2 Membership and Invitation Decisions

**Date:** 2026-10-24

**Status:** OWNER ACCEPTED — M1.2 TECHNICAL CONTRACT FROZEN

These decisions supplement D-P13-002 through D-P13-005 and finalize the bounded M1.2 membership/invitation contract. They do not authorize code, schema, migration, database, deployment or live-system changes. The frozen contract is [PHASE13_M1_002_MEMBERSHIP_AUTHORIZATION_CONTRACT.md](./tasks/PHASE13_M1_002_MEMBERSHIP_AUTHORIZATION_CONTRACT.md); it is ready for separate bounded implementation authorization.

**M1.2-A — No reinvitation of revoked members.** M1.2 does not support reinvitation or reactivation. Keep the unique (projectId,userId) membership row and preserve its audit history. Never transition revoked back to pending or active, delete it, or create a replacement row. Any future reinvitation workflow requires a separate design and owner decision.

**M1.2-B — Recipient-shared User ID targeting.** The recipient signs in and shares their opaque User ID with the Project Owner through an external communication channel. The Owner supplies that User ID to the invitation endpoint. Invite only existing registered customer accounts. Provide no global user search, email lookup, email delivery, invitation link or token, or new invitation table. Pending invitations appear only in the authenticated recipient’s invitation inbox, and the recipient must explicitly accept before Project access is granted. A convenient copy-User-ID UI belongs to M1.4, not M1.2. A supplied target User ID never impersonates the authenticated actor.

**M1.2-C — No additional email-verification requirement.** M1.2 adds no User.emailVerifiedAt prerequisite for invitation or acceptance and introduces no verification email, OTP, confirmation link or verification screen. Require an existing authenticated, non-guest, registered customer identity and verify the current User row plus applicable Project/Membership authorization. Do not trust browser-supplied identity, role or membership claims. Do not bypass or change the application-wide login policy: the existing Credentials login may already require verified email, and that behavior remains outside M1.2.

These decisions supersede the unapproved recommendations in the earlier prepared M1.2 contract. Legal/admissions requirements, financial custody, document retention and later application workflows remain outside this technical freeze and subject to their existing gates.
<!-- END DECISION_PHASE13_M1_2_OWNER_ACCEPTANCE_2026_10_24 -->

<!-- BEGIN AWS_STAGING_STAGE3_DEPLOYED_2026_10_14 -->
## Operational decision — Phase 12 Stage 3 AWS Staging accepted (2026-10-14)

**Owner decision: ACCEPT the completed Stage 3 AWS Staging deployment and stop further optional testing for this rollout.** This operational acceptance updates the older Stage 3 closeout note stating staging was not yet deployed; it **does not** turn unexecuted tests into PASS, approve production, authorize follow-up AWS activity, or close formal Gates 1–3.

Evidence: Secure RDS `chatbot` migration **0023 → 0029** verified current after an encrypted snapshot; ECS Web `:44` rolling deployment `COMPLETED` with healthy ALB; Fast/Legal Check/Premium owner-browser answers and Legal Service HTTP 200; Policy Sync `:11` configured for `gpt-6.1-sol`, EventBridge Scheduler enabled and retargeted to `:11`. **First scheduled Policy Sync run is not observed**. Optional persistence/editorial browser test expansion was waived by owner; none is falsely reported as performed. Source commit `b760c028674efe4fd40190d8b212167729e74348` on `codex/phase12-stage3-policy-intelligence`.

**Operational boundary:** No production deploy, Stripe/WeChat/Alipay activation, extra regression runs, forced restart, ad hoc Policy Sync execution or migration is authorized by this record. Keep old ECS `:43`, Policy Sync `:10` and encrypted snapshot as recovery references; AWS Fargate routine maintenance notice does not call for a new Web rollout. See [deployment and handoff record](./deployments/AWS_STAGING_PHASE12_STAGE3_2026-10-14.md). Future concrete defects are triaged individually on request.
<!-- END AWS_STAGING_STAGE3_DEPLOYED_2026_10_14 -->


<!-- BEGIN PHASE12_STAGE3_OWNER_SIGNOFF_2026_10_14 -->
## Stage 3 owner acceptance — 2026-10-14 (supersedes historical stage-in-progress notes)

**Status:** ACCEPTED — Stage 3 core functionality, *not* full formal Gate 3 or release authorization.

The owner explicitly concludes Stage 3 feature development and local functional acceptance, preferring rapid closure and defect-driven follow-up during real lawyer usage over further proactive tests. D-065, D-070, D-071, D-072 and D-073 remain authoritative. Preserve the later Archive/Restore strict-payload repair and direct **Publish Official Source** without an AI revision, with genuine snapshot provenance, audit, idempotency, RBAC, and human protection. AI relevance and verifier judgments are advisory rather than an editorial veto.

Acceptance evidence: LIN 26/061 compatibility import, edit, human publication and protection; corrected Archive/Restore with public count `4 -> 3 -> 4` and no compatibility resurrection. A local one-time Home Affairs sync recorded 8 full-analysis and 2 source-first publications (10 discovered). The owner accepts the other Stage 3 features, including blank manual creation, Grant/Revoke, Force Publish, official URL submissions and direct source publication, **without requiring additional individual owner-browser tests**. Do not misdescribe those waived tests as executed PASS.

Formal Gate 3 stays NOT ACCEPTED (deferred integration/security/staging/environment checks); prior Gate 1/2 exceptions likewise remain. No automatic daily scheduler, production readiness, merge/deployment or payment activation is inferred. Next action: commit/push the full uncommitted Stage 3 worktree and these docs on its existing branch, verify remote SHA; handle new issues only with observed evidence.
<!-- END PHASE12_STAGE3_OWNER_SIGNOFF_2026_10_14 -->


Durable decisions for future ChatGPT/Cline/Codex sessions. Do not silently reverse an ACCEPTED decision. If new evidence requires a change, add a superseding decision record.

## D-009 — User-owned durable history is server-authoritative; Projects are interface-reserved only

**Date:** 2026-10-11
**Status:** ACCEPTED

A user's authenticated account is the durable owner/authorization root for their entitled conversation history and uploaded files. Server PostgreSQL (and the private object store for file bytes) is authoritative; React state, browser localStorage and device caches are caches only. There must be no silent history truncation, no false "saved" acknowledgment, and no device-bound-only content.

Account-wide *visibility* of a user's own retained files is explicitly NOT the same as cross-conversation AI context sharing: a document uploaded into conversation A stays available to its owner on every device, but conversation B does not automatically receive A's document evidence.

GPT-like Projects are reserved as typed interfaces only (`projectId: null`) in Phase 12. No Project table, membership, shared memory, Project UI or parallel file store may be added, and a future user Project must never be conflated with the legal `Matter`.

## D-010 — One shared durable turn contract for Fast, Legal Check and Premium

**Date:** 2026-10-11
**Status:** ACCEPTED

The three widget answer modes persist through one owner-authorized, idempotent turn contract (`lib/conversations/turn-ledger.ts` + `widget-turn.ts`) keyed by a stable `clientTurnId` with a unique `(chatId, clientTurnId)` database constraint. The user turn is durable before the model stage; the assistant turn and its metadata are durable after it; an already-answered turn is replayed from storage; an interrupted turn is repaired from a persisted pending payload without repeating the model call; a persistence failure is reported to the client instead of being swallowed. No database transaction is held open across the model stage. A future mode must adopt this contract rather than adding a fourth persistence path.

## D-011 — Declared browser MIME is advisory for allowlisted containers; content identity decides

**Date:** 2026-10-11
**Status:** ACCEPTED

Upload validation keeps the extension allowlist, file-size/decompression/macro limits and real content identity checks (OOXML Word/Excel container, OLE streams, magic bytes). A declared MIME that is unknown or nonstandard must not by itself reject an otherwise valid file; a declared MIME from a positively conflicting family still fails fast, and the accepted MIME stored/served is always the canonical one. Upload success (durable storage) and extraction success (usable evidence units) are separate states in the API and UI.

## D-015 — Archived (legacy) chats are read-only in the UI, and the server stays the authority

**Date:** 2026-10-11
**Status:** ACCEPTED

Stage 1 keeps pre-conversation history visible, so some listed chats have messages but no `ImmigrationConversation` row (`origin: "legacy_chat"`). Such a chat cannot accept a new turn: the answer route requires the immigration conversation row. The product contract is now:

- The UI derives every capability from one shared contract (`lib/workspace/conversation-origin.ts`) rather than from ad-hoc status checks: read-only follows the **applied** conversation origin, so a delayed or stale detail response can never leave the workspace in the wrong mode.
- An archived chat is clearly labelled read-only in Chinese and English, keeps full browsing (messages, timestamps, citations, files, older-message pagination), and replaces the composer with an explicit "start a new conversation" action. Submission, guided intake, uploads, lawyer-review requests and consultation booking are unavailable there.
- Opening or reading an archived chat never creates or modifies an `ImmigrationConversation` row, and no backfill or migration is performed. Normal conversations keep their full interactive workflow.
- Disabled controls are a courtesy, not a security boundary: the server still rejects any attempt to write into a chat that has no immigration conversation row.

Within the same authorized closure, the retained-VIP projection declares its real return type: `getRetainedPrepaidVipEntitlement()` returns `RetainedPrepaidVipEntitlement` (`membershipTier: VipMembershipTier`, `vipExpiresAt: Date | null`). The previous `Pick<EntitlementUser, ...>` declaration widened the expiry to `Date | string | null`, which did not match the database timestamp column and blocked the production build. This is a typing-only correction: billing, Stripe events, subscription handling and VIP eligibility are unchanged.
## D-014 — Assistant persistence is atomic and fenced by the whole execution token

**Date:** 2026-10-11
**Status:** ACCEPTED (R2 amendment of D-012; does not reverse it)

The durable turn contract's fence is the pair `(executionOwnerId, executionAttempt)`, and assistant persistence is a single database transaction:

- Acquisition increments a monotonic `executionAttempt`. Renewal, pending-payload write, finalization and failure all require **both** values, so a superseded attempt can never write, renew, fail, re-complete or clear another owner's payload — and cannot regain authority by re-acquiring an expired lease with an old token.
- `finalizeConversationTurnAtomic` locks the turn row (`SELECT … FOR UPDATE`), verifies the fence inside that concurrency boundary, and commits the assistant message row, the terminal `assistant_persisted` transition and the clearing of the pending payload together. An identical stored message is reused unchanged; a different message owning the deterministic id fails with `message_conflict` and writes nothing. There is no separate non-atomic terminal write.
- Expiry alone does not revoke authority: the current owner may renew after expiry while no takeover has occurred, and a live lease can never be stolen. Takeover is what revokes authority, and takeover requires an expired lease.
- A failed finalization transaction rolls back completely, leaving the turn `user_persisted` with its pending payload, and releases the lease (fenced) so an immediate retry resumes the stored answer without another model call.
- No database transaction is ever held open across model execution.

## D-012 — Exactly one execution per client turn (durable lease + fencing); a turn is "saved" only when both messages are durable and linked

**Date:** 2026-10-11
**Status:** ACCEPTED (R1 correction to D-010/D-009 semantics; does not reverse them)

A unique turn row does not make *execution* exclusive. The durable turn contract therefore owns an execution lease as well:

- `ConversationTurn` carries `executionOwnerId` (fencing token), `executionLeaseExpiresAt`, `executionStartedAt` and `executionAttempt`. A lease is claimed by one atomic compare-and-set update and renewed by a fenced heartbeat while the model stage runs; the lease is never held inside a database transaction across that stage.
- Exactly one concurrent request per client turn may execute the model. Losing duplicates get `409 client_turn_in_progress` with a retry hint; they never generate an answer and never create a second assistant message. An already-answered turn is replayed instead.
- Every terminal write (pending payload, completion, failure) is fenced by the lease owner, so an obsolete attempt whose lease expired or was taken over cannot overwrite, re-complete or fail a newer attempt's result. A failed turn releases its lease so a retry can proceed immediately.
- Assistant and durable user message identity are server-controlled and deterministic per turn, so retries converge on the same rows instead of accumulating duplicates.
- A message id collision is an idempotent retry only for the same immutable message (same id, chat, role, canonical parts fingerprint, empty attachments). Anything else fails deterministically and never counts as durable.
- For an authenticated conversation, a failed user-message write (or an unverifiable ownership/link read) fails closed: the route answers retryably and does not run the model. A turn is reported as saved only when the user message and the assistant answer are both durable and linked; guest/unscoped requests make no durability claim at all.

## D-013 — Legacy chats without an immigration conversation row are readable history; reads never backfill data

**Date:** 2026-10-11
**Status:** ACCEPTED

The pre-Phase-12 `Chat` rows that hold messages but have no `ImmigrationConversation` row belong to real customers (read-only audit: 20 messages in 4 chats, all owned by registered accounts). They are listed for their owner as `origin: "legacy_chat"` with `legalMatterId: null` and are readable and paginated through the existing owner-authorized message endpoint, while chats with neither a conversation row nor messages stay excluded from history. Read paths must never create, rewrite or backfill a conversation row or a message, and `totalCount` must describe exactly the same eligible set as the listing. Any future backfill requires a separate explicit approval, a migration and owner sign-off.

## D-001 — Phase 11 product target

**Date:** 2026-09-19  
**Status:** ACCEPTED

The product target is a **Chinese-first Australian Immigration & Study Service Platform**, not a chatbot-only or simple legal-Q&A website.

AI is the low-friction intake/analysis layer inside a broader service platform.

## D-002 — Main repo is functional authority; temporary UI is design authority

**Date:** 2026-09-19  
**Status:** ACCEPTED

`jiangdizhao/immigration_ai` is the production functional authority.

`jiangdizhao/immigration_temporal_ui`, especially `codex/fidelity-completion-v4@8abbba2`, is a design, composition, terminology, and user-journey reference only.

Do not wholesale-copy the Vite prototype or let mock data override production contracts.

## D-003 — Chinese default with one-click English

**Date:** 2026-09-19  
**Status:** ACCEPTED

The website UI defaults to `zh-CN` and supports one-click English switching.

Initial implementation must avoid locale-prefixed route migration. UI locale is independent from user question language and legal answer language.

## D-004 — Matter is the UX center

**Date:** 2026-09-19  
**Status:** ACCEPTED

Matter continuity is the center of the product experience. Conversation, facts, sources, lawyer escalation, and future materials should appear continuous across AI and human service.

Do not redesign the database solely to achieve this presentation. Reuse current conversation and legal-matter identity first.

## D-005 — Phase 11 does not redesign legal reasoning

**Date:** 2026-09-19  
**Status:** ACCEPTED

Phase 11 UI tasks do not authorize changes to Fast, Legal Check/Default, Premium, Phase-6, evidence identity, legal retrieval, ReasoningBank governance, political/privacy gating, or provider budget policy.

Backend changes require a separately approved task.

## D-006 — Provenance must be visible

**Date:** 2026-09-19  
**Status:** ACCEPTED

Production UI must preserve the semantic distinction:

```text
Official / Original Law != AI Analysis != Lawyer Advice
```

No UI styling may imply that AI-generated analysis is statutory text or a lawyer's advice.

## D-007 — Prototype claims are not production facts

**Date:** 2026-09-19  
**Status:** ACCEPTED

Temporary-UI lawyer names, credentials, office address, performance statistics, testimonials, response-time/SLA claims, success claims, privilege wording, and similar demonstration content are not verified production facts unless separately confirmed.

They must not be copied into production unqualified.

## D-008 — Incremental rebase; no big-bang frontend replacement

**Date:** 2026-09-19  
**Status:** ACCEPTED

Phase 11 is implemented through bounded Task Packets.

Shared shell and locale foundation come first. Public pages follow. Policy Intelligence follows. The high-risk AI Workspace is refactored later and incrementally.

## D-009 — Repository is the shared external memory

**Date:** 2026-09-19  
**Status:** ACCEPTED

Adopt the repository-first shared project-state workflow:

- conversations are temporary working memory;
- Git/code/tests and concise Markdown records are durable state;
- coding agents verify Git before editing;
- meaningful tasks have Task Packets;
- coding agents update `CURRENT_HANDOFF.md` before ending;
- ChatGPT reviews implementation against source/diff/tests rather than accepting narrative claims;
- correction work gets a new `-R1`, `-R2`, etc. Task Packet instead of silently rewriting an in-progress/completed task contract.

## D-010 — No deployment implied by Phase 11 documentation work

**Date:** 2026-09-19  
**Status:** ACCEPTED

Creating the Phase 11 branch and project-memory documents does not deploy AWS, run migrations, or change production/staging state.

Deployment remains a separately authorized operation.

## D-011 — Placeholder brand remains Sovereign Nexus Legal

**Date:** 2026-09-19  
**Status:** ACCEPTED

Until the real firm/platform branding is confirmed, the public UI may continue to use **Sovereign Nexus Legal** as an explicit placeholder brand.

Do not infer that this is the final production brand. Future replacement must be centralized and low-risk.

## D-012 — Public positioning is service-platform first

**Date:** 2026-09-19  
**Status:** ACCEPTED

The public website should primarily present an **Australian immigration and study one-stop service platform**.

AI is an important first-contact and intake capability; it must not dominate the public positioning as if the product were only an AI legal chatbot.

Preferred product story:

```text
service discovery -> AI-assisted intake -> structured matter context
-> human lawyer escalation when needed -> continuing service
```

## D-013 — Initial public service catalogue uses six service families

**Date:** 2026-09-19  
**Status:** ACCEPTED

P11-002 may organize the first public service catalogue around six provisional families:

1. 留学与学生签证 / Study & Student Visa
2. 技术移民与雇主担保 / Skilled Migration & Employer Sponsorship
3. 配偶与家庭类 / Partner & Family
4. 签证拒签与 ART 复审 / Visa Refusal & ART Review
5. 永居与公民相关服务 / Permanent Residence & Citizenship-related Services
6. 复杂案件与个案策略咨询 / Complex Matters & Case Strategy

These are product-navigation categories, not legal conclusions or service guarantees. A lawyer may later refine, merge, rename or remove categories.

## D-014 — Lawyer-team UI may use explicit mock profiles only

**Date:** 2026-09-19  
**Status:** ACCEPTED

P11-002 may include lawyer/team card structure so the production layout can be reviewed before real lawyer information is available.

Any temporary lawyer profile must be visibly and structurally identified as **mock / placeholder / awaiting confirmation**.

Do not present invented names, qualifications, practising-certificate details, years of experience, achievements, case counts, success rates or specialisations as production truth.

Use replaceable placeholder avatars rather than implying a real person's identity.

## D-015 — No invented public contact coordinates

**Date:** 2026-09-19  
**Status:** ACCEPTED

Until real contact details are confirmed, public pages must not invent a phone number, street address, WeChat account, email address or office location.

Use action-oriented contact/consultation CTAs that lead into the existing website workflow. Real coordinates can be added later after confirmation.

## D-016 — V4 is a strong visual reference, not a pixel-copy mandate

**Date:** 2026-09-19  
**Status:** ACCEPTED

The temporary V4 UI should strongly influence visual hierarchy, section composition, semantic color roles and overall premium/legal-service tone.

The production Next.js implementation may adapt layout and components to preserve existing auth, routing, responsive behavior and maintainability. Pixel-perfect copying is not required.

## D-017 — Unknown subjective content must be escalated, not silently decided

**Date:** 2026-09-19  
**Status:** ACCEPTED

When a Phase 11 task encounters an unresolved product/content decision that is not determined by repository authority, the coding agent must not silently convert a plausible guess into production truth.

Examples include lawyer identity, qualifications, contact details, pricing, service commitments, testimonials, branding claims, legal/commercial promises and materially subjective user-facing wording.

If the information is not needed for the active task, leave it untouched.

If a visible placeholder is necessary for structural development, use an explicit replaceable placeholder consistent with `docs/product/CONTENT_POLICY.md`.

If the choice affects architecture, legal/commercial meaning, product positioning or long-term information architecture, stop and ask the project owner.

## D-018 — P11-002A accepted; P11-002B is presentation-only refinement

**Date:** 2026-09-19  
**Status:** ACCEPTED

P11-002A at `d0964924be003fd61902fca760bd71aca53abe4f` is accepted as the structural baseline for the public platform pages after Git review and browser review of Home, Services, Process, Contact, plus English locale switching.

P11-002B may refine visual hierarchy, spacing, typography, responsive behavior, reusable presentation primitives, and restrained interaction polish for those public pages.

P11-002B must not reopen the accepted service catalogue, locale architecture, route structure, content-governance rules, auth/entitlement behavior, legal backend behavior, or introduce unverified business/lawyer facts merely for visual fidelity.

## D-019 — Policy Intelligence starts manual-first and is automation-ready

**Date:** 2026-09-19  
**Status:** ACCEPTED

Policy Intelligence will follow option **C**:

1. **Initial implementation:** manually curated policy entries only.
2. **Future architecture:** data contracts must be ready for automated discovery from authoritative sources plus human review/publication.
3. **No automatic publication:** future automated discovery or AI summarisation must not become public legal/policy content without an explicit review/publication gate.

P11-003A therefore builds the public Policy Intelligence experience and a provenance-safe typed content model without adding live crawlers, background jobs, database migrations or automated publication.

P11-003B is reserved for the future official-source discovery / curation / review workflow.

## D-020 — Policy source status and editorial publication status are separate

**Date:** 2026-09-19  
**Status:** ACCEPTED

Policy Intelligence must not collapse the legal/source status of an item into the platform's editorial workflow.

The model must distinguish, conceptually:

- **source/legal status** — for example in force, announced, proposed, consultation, superseded;
- **publication/review status** — for example draft, review required, published, archived.

A proposal/consultation must never be styled or worded as current law merely because the platform has published an explanation of it.

Only explicitly publishable entries may appear in public Policy Intelligence routes.

Official source facts, AI-assisted analysis and lawyer commentary remain visually and semantically distinct.

## D-021 — P11-003A accepted after provenance hardening

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003A is accepted after:

- implementation commit `f7fa6363e4f2ee326306b20203692dd73e45cebd`;
- provenance-hardening correction `4f232fe40161a7adad104bcbf6c382b846425936`.

The accepted model keeps:

- source/legal status separate from editorial publication status;
- public selectors restricted to published entries;
- production policy registry empty until real records are manually verified;
- official verbatim excerpt data owned by source/provenance identity rather than localized copy;
- AI analysis and lawyer commentary separate from official source material.

## D-022 — Policy curation remains repository-backed before database/admin-write work

**Date:** 2026-09-20  
**Status:** ACCEPTED

The next Policy Intelligence step will use a repository-backed manual curation workflow rather than introducing a database migration or runtime admin editor.

Reasons:

- Phase 11 does not currently authorize a Policy Intelligence database migration;
- real lawyer/policy editorial workflow is still being validated;
- the public UI already has a typed manual-first model;
- repository-backed review provides traceability through Git while content volume is low.

This is an interim operational model, not a permanent CMS decision.

A future task may move Policy Intelligence persistence into a database/admin workflow after explicit approval.

## D-023 — Unpublished policy content must remain server-only

**Date:** 2026-09-20  
**Status:** ACCEPTED

Draft, review-required, archived, or otherwise unpublished Policy Intelligence records must not be shipped into public browser bundles merely because client-side selectors hide them.

The curation boundary must therefore separate:

- shared public-safe policy types/projections;
- server-only editorial registry/content;
- public published projection passed to client-rendered presentation where necessary.

The server-only boundary should use existing Next.js conventions such as `server-only` and server components/loaders.

Public pages may receive published policy data, but must not receive unpublished editorial records.

## D-024 — Automated discovery is deferred until the manual publication boundary is hardened

**Date:** 2026-09-20  
**Status:** ACCEPTED

The earlier P11-003B scope is split:

- **P11-003B:** repository-backed manual curation + server-only publication boundary;
- **P11-003C:** automated official-source discovery into non-public candidates, with no automatic publication.

P11-003C must not begin automatically after P11-003B. Automated discovery requires separate review of source scope, scheduling, deduplication, freshness, and lawyer/admin review semantics.

## D-025 — P11-003B server-only publication boundary accepted

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003B at `081ef46dd040b6131d475750d0968c9f2e461bb2` is accepted.

The repository-backed Policy Intelligence editorial source is now server-only. Public Home/list/detail surfaces receive only explicit published public-safe projections from server loaders. Draft, review-required, archived, discovery and origin metadata are not delivered to public client presentation.

The production registry remains intentionally empty until real policy records are verified and approved.

## D-026 — Automated discovery creates non-public candidates only

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003C may automate discovery from allowlisted official sources, but discovery output is **candidate evidence**, not a publishable Policy Intelligence entry.

Automated discovery must not:

- infer or assert legal effect/status when the official source does not explicitly establish it;
- create public AI analysis;
- create lawyer commentary;
- change an editorial record to `published`;
- write into the public editorial registry automatically.

Candidate promotion remains a deliberate human-reviewed step.

## D-027 — First discovery implementation is operator-run and offline-safe

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003C will be an operator-run discovery tool/CLI, not a web-request runtime feature and not a scheduler.

It may use controlled live HTTP fetches only when explicitly invoked by the operator and only against an allowlisted official-source configuration grounded in repository authority. Deterministic tests must use local fixtures and must not depend on network availability.

P11-003C must not modify `legal-service/`; it may inspect the existing official-source registry as design authority but must keep the Policy Intelligence discovery implementation isolated from answer-time legal retrieval.

## D-028 — Home Affairs discovery uses structured site data, not generic page-link crawling

**Date:** 2026-09-20  
**Status:** ACCEPTED

A live smoke against the configured Home Affairs Student 500 seed established that the page is a valid Home Affairs response but is a poor generic `listing_links` discovery surface.

Observed evidence from the downloaded page:

- decoded HTML size is approximately 1.43 MB;
- ordinary same-host anchors are mostly the current page, homepage, SharePoint `FIXUPREDIRECT.ASPX` links, and conditions-of-use/navigation material;
- the page embeds a large `<script id="siteData" type="application/json">` payload;
- that payload contains structured `alertItems` records with fields such as title, content, category/type, URLs and update date.

Therefore the Home Affairs discovery strategy should parse bounded structured `siteData.alertItems` evidence rather than treat normal `<a href>` links as policy candidates.

This is a source-specific acquisition strategy. It does not change the human publication gate.

## D-029 — Discovery response limits apply to decoded bodies and may be source-strategy specific

**Date:** 2026-09-20  
**Status:** ACCEPTED

The discovery fetch boundary limits the decoded response body, not merely compressed network bytes. This is intentional because the safety boundary must also constrain decompression expansion.

The prior 128 KB per-response limit is too small for the observed Home Affairs seed page, whose decoded HTML is approximately 1.43 MB.

P11-003C-R2 may introduce a tightly bounded source/strategy-specific limit sufficient for the known Home Affairs structured seed, with an absolute ceiling around 2 MiB for that strategy, while retaining stricter limits for smaller sources where practical.

Increasing the limit must not remove or weaken:

- full-operation timeout;
- total-run byte cap;
- page-count/fan-out limits;
- redirect revalidation;
- DNS/private-network checks;
- exact host allowlisting.

## D-030 — Home Affairs alert dates remain raw candidate evidence

**Date:** 2026-09-20  
**Status:** ACCEPTED

Fields such as Home Affairs `siteData.alertItems.updateDate` are discovery evidence only.

They must not be automatically converted into:

- legal effective dates;
- commencement dates;
- `PolicySourceStatus` values;
- public publication status.

Any later mapping into a production `PolicyEntry` remains a human review decision.

## D-031 — Home Affairs relative alert URLs are valid provenance after safe resolution

**Date:** 2026-09-20  
**Status:** ACCEPTED

Review of the real Home Affairs `siteData.alertItems` payload showed that `alertItems.urls` commonly contains root-relative paths such as `/Visa-subsite/Pages/work/...`, not absolute URLs.

For Home Affairs structured discovery:

- a relative alert URL may be resolved against the already allowlisted fetched Home Affairs page URL;
- the resolved absolute URL must then pass the same HTTPS, exact-host allowlist and canonicalisation checks;
- out-of-scope absolute or resolved URLs remain rejected;
- alert URLs remain provenance pointers only and are not fetched in P11-003C;
- seed fallback is used only when no usable alert URL remains after safe resolution.

Generic fetched-page provenance must not be mislabeled as seed provenance.

## D-032 — P11-003C official-source discovery accepted after R1-R3 hardening

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003C is accepted at checkpoint `fa02295675dc4343430ae0a109722141e669bbf9` after the base implementation plus R1, R2, and R3 corrections.

The accepted discovery boundary is:

- operator-run only; no scheduler or public request-time execution;
- configured allowlisted official sources only; no arbitrary URL mode;
- HTTPS/exact-host enforcement with redirect revalidation;
- DNS/private/local/link-local rejection and full-operation request deadlines;
- bounded decoded response sizes, page counts, candidate counts, and runtime;
- Home Affairs uses one bounded structured `siteData.alertItems` seed parse rather than generic link crawling;
- Home Affairs alert URLs are provenance pointers only, safely resolved/canonicalised and never fetched in this phase;
- `alertItems.updateDate` remains raw source metadata and is not converted into legal/effective/publication status;
- discovery candidates remain non-public and separate from `PolicyEntry`;
- no LLM interpretation, lawyer commentary, automatic promotion, automatic publication, database migration, or `legal-service` change.

R3 also makes URL provenance explicit as `alert`, `seed`, or `fetched_page`.

The remaining observation that the live Home Affairs alert feed includes operational/navigation items as well as policy-like items is not a discovery-safety blocker because candidates remain non-public and require human review. Any automated relevance/legal-importance filtering requires a separate future decision.

## D-033 — Phase 11 task granularity is coarser from P11-004 onward

**Date:** 2026-09-24  
**Status:** ACCEPTED

From P11-004 onward, Phase 11 work should avoid proliferating small lettered/correction tasks for normal implementation refinement.

Each major milestone should normally have one Task Packet, for example `P11-004.md`, with a small number of internal implementation stages and review gates.

Create a separate correction task only when review exposes a materially new architecture/security boundary, a distinct rollback unit, or a change that cannot reasonably remain inside the active major task.

This does not weaken the existing inspect -> commit/push -> GitHub review workflow.

## D-034 — P11-004 is a presentation rebase around preserved production behavior

**Date:** 2026-09-24  
**Status:** ACCEPTED

P11-004 will redesign the AI Workspace presentation while preserving its current functional controller and production contracts.

The rebase must preserve:

- conversation creation, history, reopening and ownership;
- frontend chat / legal matter identity continuity;
- Fast / Legal Check / Premium access policy and route selection;
- political/privacy gate and sanitized history behavior;
- guided intake submission;
- citations/source rendering;
- lawyer-request action and persisted assistant-message identity;
- VIP/server entitlement boundaries;
- existing legal-service and answer-lane contracts.

P11-004 is not authorization to change legal reasoning, provider/model routing, database schema, billing, lawyer workflow semantics, or booking infrastructure.

## D-035 — AI Workspace uses a dedicated bilingual operational shell

**Date:** 2026-09-24  
**Status:** ACCEPTED

The production AI Workspace should use a denser operational layout inspired by the approved V4 reference rather than stacking public-marketing hero sections around the chat.

Desktop direction:

```text
shared site header
    ->
compact workspace toolbar / answer mode
    ->
left: conversations
center: active consultation/chat
right: matter facts + source context + lawyer handoff
```

The existing shared site header/account controls remain production authority.

Static workspace chrome follows the persisted site locale (`zh-CN` default, English switch). User question language and assistant answer language remain independent from the site locale.

The real appointment flow remains owned by P11-007; P11-004 must not invent a booking integration.

## D-036 — Secure matter documents precede the Client Portal

**Date:** 2026-09-24  
**Status:** ACCEPTED

The Phase 11 roadmap is rebaselined from P11-005 onward because a real matter-centered service platform requires secure customer document handling before the Client Portal is consolidated around matter continuity.

Repository inspection established that the existing file scaffold is not a production matter-document system:

- `Message_v2.attachments` exists as generic chat JSON metadata, but the Phase 11 AI Workspace does not use it as a matter-document lifecycle;
- `chatbot/components/multimodal-input.tsx` can call the generic `/api/files/upload` route, but that route accepts only JPEG/PNG up to 5 MiB;
- the existing upload route writes to Vercel Blob with `access: "public"`, which is not an acceptable production boundary for passports, refusal notices, bank statements, CoEs and similar immigration materials;
- PDF intake, private matter-scoped ownership, document lifecycle/status, extraction, page provenance, and AI/lawyer continuity are not implemented.

Therefore the roadmap becomes:

1. **P11-005 — Secure Matter Documents & AI File Intake**
2. **P11-006 — Matter-centered Client Portal**
3. **P11-007 — Lawyer Workspace Continuity**
4. **P11-008 — Appointment / Consultation Workflow**
5. **P11-009 — Bilingual / responsive / accessibility / E2E + staging acceptance**

This decision supersedes only the P11-005-and-later numbering/order in Section 10 of `SERVICE_PLATFORM_UI_REBASE_V1.md`. The architecture document's product, matter-continuity, provenance, incremental-migration, legal-backend and deployment invariants remain authoritative.

## D-037 — Matter documents are private evidence, not public chat attachments

**Date:** 2026-09-24  
**Status:** ACCEPTED

P11-005 establishes a security boundary for customer-supplied matter documents.

Production direction:

- support PDF, JPEG and PNG first;
- store file bytes outside PostgreSQL in private object storage, with AWS S3 as the production target behind a storage abstraction;
- store document identity, ownership, matter/chat linkage, integrity metadata, processing status and provenance metadata in PostgreSQL;
- never rely on a public object URL as authorization;
- every upload/read/download/delete operation must re-check authenticated ownership/role and applicable matter/chat access;
- use server-generated object keys and validate file type/size/content before processing;
- keep customer documents semantically distinct from official legal sources, AI analysis and lawyer advice;
- document content is untrusted evidence and must never become model/system instructions;
- extraction must retain document/page provenance so later answers can identify which customer document/page supplied a fact;
- lawyer handoff may reuse matter documents only through explicit authorized document references, not copied public URLs.

P11-005 is a distinct architecture/security task under D-033. Additive schema/migration code may be proposed where the current generic attachment field cannot represent the required lifecycle, but applying migrations to any shared/staging/production database remains separately authorized.

The real scheduling workflow remains outside P11-005.

## D-038 — Matter-document format support is broad and registry-driven

**Date:** 2026-09-24  
**Status:** ACCEPTED

The production matter-document system must not be limited to PDF/JPEG/PNG. Customer evidence may arrive in mainstream document, spreadsheet, text/data and image formats.

The first broad production allowlist must include at least:

- PDF: `.pdf`
- images: `.jpg`, `.jpeg`, `.png`
- word-processing: `.docx`, legacy `.doc`
- plain/structured text: `.txt`, `.md`, `.json`, `.csv`
- spreadsheets: `.xlsx`, legacy `.xls`

The implementation should use a centralized format registry so later additions do not require duplicating MIME/extension/policy logic across routes and processors.

This is still an allowlist, not arbitrary-file acceptance. Executables, scripts, HTML/SVG active content, generic archives and macro-enabled Office formats remain out of scope unless separately approved.

Validation must be format-aware:

- binary formats require signature/container validation rather than trusting the browser MIME or filename;
- OOXML formats such as DOCX/XLSX are ZIP containers and must be distinguished from arbitrary ZIP files by bounded container inspection;
- legacy DOC/XLS compound files require OLE/CFB-aware recognition rather than extension-only trust;
- text-like formats such as TXT/MD/CSV require bounded text/binary validation;
- JSON should receive bounded structural validation;
- files remain untrusted/pending until the later security/processing gates permit downstream use.

Stage 2 document understanding must eventually cover the accepted Stage 1 formats rather than silently processing only PDF/images.

## D-039 — Conversation deletion must not orphan private document objects

**Date:** 2026-09-24  
**Status:** ACCEPTED

Matter-document metadata and private object bytes must have an explicit lifecycle relationship.

A normal Chat / ImmigrationConversation deletion must not cascade away the only database reference while silently leaving the corresponding private object permanently orphaned in object storage.

P11-005 Stage 1 must close this lifecycle gap before acceptance. The implementation may use an explicit cleanup/tombstone/outbox/retention-safe design consistent with the existing architecture, but it must be deterministic, tested, and must not depend on best-effort memory-only cleanup.

The migration remains unapplied. If the lifecycle correction requires a new SQL change after the already-pushed `0018` migration, prefer generating a follow-up migration rather than silently rewriting an already-pushed migration history, unless repository migration tooling clearly requires otherwise.

## D-040 — P11-005 production-readiness gates are deferred, not waived

**Date:** 2026-09-25  
**Status:** ACCEPTED

All three P11-005 implementation stages are accepted. The owner explicitly chose to defer the remaining deployment/operational production-readiness gates to P11-009 AWS/staging acceptance so P11-006 product work can proceed.

The deferred gates remain mandatory:

- deployment-compatible `@napi-rs/canvas` native binding/package trace;
- authorized migrations `0018`–`0021` plus DB-backed smoke;
- private S3/IAM/Block Public Access verification;
- retention/purge and stale storage-intent recovery operations;
- malware/quarantine/scanning strategy.

This decision does **not** mark P11-005 VERIFIED and does not authorize deployment, migration application, live OpenAI document vision or production claims.

P11-009 must explicitly carry and close these gates before staging/production acceptance.

## D-041 — P11-006 is an aggregation-first, matter-centered customer portal

**Date:** 2026-09-25  
**Status:** ACCEPTED

P11-006 will build a registered-customer portal using existing authoritative production data before considering any new schema.

Portal identity rules:

- exact non-null `legalMatterId` is the strongest existing matter grouping key;
- conversations sharing the same exact `legalMatterId` may be presented as one portal matter group;
- a conversation without a legal matter ID remains a provisional conversation-backed portal group and must not be presented as a fully established legal matter;
- the portal must not create or rewrite legal-matter identity merely for UI convenience.

Data authority rules:

- chatbot PostgreSQL remains authority for customer ownership, conversations, MatterDocuments, lawyer requests and VIP/billing state;
- legal-service Matter data may be projected only after the chatbot has established that the requested `legalMatterId` is linked to an owned conversation;
- raw legal-service `metadata_json`, hidden traces and provider/debug data must never be exposed to the browser;
- confirmed/user-origin facts and unresolved/missing facts must remain visibly distinct;
- customer-document text must not be copied into the portal overview;
- no inferred deadline, case-status, lawyer-status or legal conclusion may be invented by the portal.

P11-006 is a continuity and navigation layer. AI Workspace, lawyer-request detail, VIP billing, future lawyer workspace and future appointment workflow remain their own authorities.

## D-042 — Client Portal degrades explicitly when deferred document schema is unavailable

**Date:** 2026-09-25  
**Status:** ACCEPTED

Because P11-005 migrations `0018`–`0021` are intentionally deferred to P11-009, P11-006 must not treat the MatterDocument schema as a hard prerequisite for rendering the customer portal.

The accepted rollout-compatibility behavior is:

- the document-summary query may fail soft for the expected missing-schema condition;
- the public projection exposes document availability explicitly and must not translate unavailable data into an authoritative zero-document count;
- the portal continues to expose safe owned conversation, lawyer-request and membership state;
- Legal Service Matter unavailability remains an independent per-matter fail-soft condition;
- unrelated database failures must not be broadly swallowed.

This decision is a compatibility bridge only. It does not apply migrations, weaken P11-005 security, or mark P11-005 production-ready. D-040 remains fully in force.

## D-043 — Lawyer continuity is request-scoped, not matter-wide staff access

**Date:** 2026-09-25  
**Status:** ACCEPTED

P11-007 improves the assigned-lawyer workspace using the existing immutable `LawyerClarificationRequest` handoff contract.

Assignment authorizes the lawyer to work on that request; it does **not** automatically authorize unrestricted access to the customer's:

- full conversation history;
- all conversations sharing a `legalMatterId`;
- raw MatterDocuments or private object downloads;
- all document extraction/evidence units;
- raw Legal Service `Matter.metadata_json`;
- internal AI traces outside the existing request/learning workflow.

The accepted lawyer continuity package is the request itself plus its bounded immutable snapshot, clarification thread and existing disposition/learning fields.

P11-007 may restructure and safely project that data for human usability, but must not silently widen the authorization model. Any future matter-wide staff workspace or generic document browsing requires a separate architecture/security decision.

Official/legal evidence, AI analysis, customer-document evidence and lawyer advice must remain visibly separate in the lawyer UI.

## D-044 — P11-008 uses a first-party request/proposal/confirmation workflow

**Date:** 2026-09-25  
**Status:** ACCEPTED

P11-008 will implement a real appointment/consultation workflow without pretending that the repository already has an external calendar, real-time lawyer availability, verified office hours, consultation pricing, meeting-provider configuration, or public contact coordinates.

The accepted model is:

- a registered, verified, non-guest customer submits a consultation request with timezone, up to three preferred future windows, method preference, and an optional bounded note;
- admin remains the assignment authority and may assign a verified lawyer;
- the assigned lawyer or admin proposes a concrete slot and consultation method/instructions;
- the customer explicitly confirms the proposal or requests rescheduling;
- confirmed consultations can be completed or cancelled by authorized staff;
- same-lawyer proposed/confirmed slot overlap must be rejected transactionally;
- immutable consultation events record assignment and status/slot transitions.

A new additive consultation schema is justified because `LawyerClarificationRequest` is an answer-review/handoff contract and does not model time-window negotiation or confirmed appointments. P11-008 must not overload that table.

Authorization is independent and least-privilege:

- customers see only their own consultation requests;
- admins may manage all requests;
- lawyers see only consultations assigned to them;
- appointment assignment does not grant access to the customer's full chat history, MatterDocuments, unrelated lawyer requests, or arbitrary Legal Service matter data.

Optional chat/lawyer-request continuity links must be ownership-checked and server-derived. They are references, not authorization capabilities.

No consultation price, VIP-only entitlement, external calendar provider, video provider, office location, phone number, SLA, or real-time availability claim is introduced by this decision. Those require separate verified business/integration authority.

Stage 1 may create the next additive migration artifact, but applying it to any database remains separately authorized.

## D-045 — P11-008 Stage 2 is customer-only and availability-aware before migration 0022

**Date:** 2026-09-26  
**Status:** ACCEPTED

P11-008 Stage 1 source is accepted at `83506156546dcff2944b21edef16423a5b402d54`, but migration `0022_first_slayback.sql` remains intentionally unapplied.

Stage 2 may proceed as a customer-facing source/UI implementation without applying 0022, provided the rollout boundary is explicit:

- consultation schema availability is checked server-side through an exact catalog/`to_regclass` test;
- absence of `ConsultationRequest` is represented as **unavailable**, never as an authoritative empty consultation history;
- existing Client Portal, lawyer-request and account workflows must continue when 0022 is absent;
- unrelated database errors must not be swallowed;
- real migrated-DB create/confirm/reschedule/cancel E2E remains deferred until a separately authorized migrated/disposable environment exists.

Stage 2 is customer-only:

- `/consultations`, `/consultations/new`, and `/consultations/[id]`;
- customer status-valid actions only;
- AI Workspace / Contact / Client Portal entry points;
- no admin or lawyer scheduling UI;
- no notification implementation.

Continuity remains exact-reference and least-privilege. AI Workspace and Client Portal may pass an owned `chatId` as a hint; the server re-authorizes ownership and derives any matter identity. Client code must never supply a trusted `legalMatterId`.

The initial time-entry UI uses browser-local `datetime-local` values with the browser-resolved IANA timezone displayed to the customer. It must not label browser-local times as a different arbitrary timezone. A future editable timezone selector requires a correct timezone-aware conversion layer.

This decision does not authorize migration application, pricing, VIP-only booking, external calendar/video/phone providers, office hours, real-time availability claims, or Legal Service changes.

## D-046 — P11-008 Stage 3 separates staff scheduling source work from the migrated-DB runtime gate

**Date:** 2026-09-26  
**Status:** ACCEPTED

P11-008 Stage 2 source is accepted at `2d91c17a483c0fd30a434536f87b64bc7cf6fe94`. Migration `0022_first_slayback.sql` remains intentionally unapplied.

Stage 3 may proceed with staff scheduling UI and consultation-specific notification source work without applying 0022, provided rollout compatibility remains explicit.

Staff consultation routes are distinct from P11-007 lawyer-review request routes:

- `/admin-portal/consultations[/id]`;
- `/lawyer-portal/consultations[/id]`.

The existing `/lawyer-portal/[id]` remains a LawyerClarificationRequest detail route and must not become polymorphic.

Admin authority follows the frozen Stage-1 state machine. Lawyer authority remains assigned-only. Appointment assignment never grants matter-wide conversation, MatterDocument, unrelated lawyer-request or Legal Service access.

Staff proposal time entry uses the staff browser/device timezone and absolute ISO timestamps. UI must clearly distinguish customer preferred windows from staff-proposed times and must not represent preferences as live availability.

Consultation notifications are a separate contract from lawyer-request notifications. They reuse the existing email transport but are disabled by default and fail-neutral after the database mutation commits. Email content is generic and contains no customer note, document/chat content, legal facts, private matter metadata, provider credentials or meeting-provider claims.

Stage 3 source/UI acceptance is not the migrated-DB runtime acceptance. P11-008 overall verification requires a separately authorized disposable/migrated DB gate covering real transitions, concurrency/rollback and customer/admin/lawyer E2E.

## D-047 — P11-008 runtime acceptance uses a disposable cloned chatbot database

**Date:** 2026-09-26  
**Status:** ACCEPTED

P11-008 Stage 3 source is accepted at `5304742196f08894d249138c30b2245977a52e9b`. The next gate is real migrated PostgreSQL/runtime acceptance.

The normal local chatbot database, staging and production are not authorized migration targets for this gate.

A fresh disposable clone of the chatbot database must be created. The repository migration runner may apply the clone's missing migrations through `0022_first_slayback.sql`, including 0018–0021 when absent.

`chatbot/.env.local` must not be edited. Gate commands and the local runtime must receive the clone through a shell-scoped `POSTGRES_URL`. Credentials must not be printed, pasted, committed or written into handoff artifacts.

The clone must be retained until external review completes.

The gate must verify real transaction semantics: request/event atomicity, optimistic revision conflict handling, same-lawyer advisory-lock overlap serialization, half-open interval behavior, assignment/demotion safety and the full customer/admin/lawyer state machine.

Rollback atomicity may use a temporary fault-injection trigger or constraint only inside the disposable clone. Such a fault must never enter repository migration files and must be removed before continuing.

Notification fail-neutral runtime acceptance must avoid real delivery. A deliberately unsupported local email provider and dummy `.test` target may be used so the notification path fails before SES/network activity while the already-committed mutation remains successful.

Applying 0018–0021 to the disposable clone is compatibility testing only. It does not close D-040, does not verify P11-005 production readiness and does not authorize deployment.

If a source defect is discovered, stop the runtime gate and return to the normal local patch -> external review -> commit/push workflow. Do not mutate data manually to hide a failing invariant.

## D-048 — Live Policy Intelligence may auto-publish verified AI analysis from authoritative sources

**Date:** 2026-09-30  
**Status:** ACCEPTED

The previous P11-003 Policy Intelligence publication workflow required a human to manually promote every discovery candidate into a typed `PolicyEntry` before anything could be public. That manual workflow was intentionally conservative while the discovery and provenance boundaries were being established, but it is no longer the target production operating model.

The accepted production direction is an automated, evidence-grounded Policy Intelligence pipeline:

```text
allowlisted official-source discovery
    -> backend-controlled official-source acquisition
    -> immutable/versioned source snapshot
    -> structured bilingual AI analysis
    -> claim/evidence verification
    -> fail-closed publication gate
    -> published Policy Intelligence revision
```

Mandatory invariants:

- Official/legal facts must be established only from backend-held, allowlisted authoritative sources. The model must not invent an authority, source date, effective date, legal status, commencement rule or source text.
- Provider-native/open-ended web search is not a publication authority path. Any related source used to support publication must first enter through the backend-controlled allowlisted acquisition boundary and become a source snapshot.
- Official source text, AI analysis and lawyer commentary are separate provenance classes in storage, APIs and UI.
- AI-generated analysis may be published without mandatory lawyer pre-review only after the evidence-verification gate passes.
- AI analysis must be explicitly labelled as AI-generated interpretation and must never be presented as lawyer advice or as verbatim official law.
- Lawyer commentary is optional and may be populated only from actual lawyer-authored/reviewed content; the AI pipeline must not fabricate it.
- Automatic publication is fail-closed. Uncertain legal/source status, ambiguous effective/commencement semantics, unresolved applicability, malformed source metadata, unsupported decisive claims, verifier failure, provider failure or incomplete evidence must hold the revision for review rather than publish it.
- Source snapshots and analysis revisions are immutable/versioned. A changed official-source content hash creates a new snapshot/revision; history is not silently overwritten.
- The existing `MANUAL_POLICY_ENTRIES` registry may remain temporarily as compatibility/editorial fallback during migration, but it is not the target canonical store for live automatically maintained policy intelligence.
- Public presentation may summarize official material and link to the official source, but must preserve the provenance distinction and must not mislabel AI text as an official excerpt.

This decision supersedes only the mandatory manual-promotion/publication requirement of the earlier P11-003 workflow. The existing allowlist, SSRF/network-safety, source/legal-status separation, public-safe projection and no-fabricated-law invariants remain authoritative.

## D-049 — P11-009 expands to Live Policy Intelligence plus Phase 11 production closure

**Date:** 2026-09-30  
**Status:** ACCEPTED

P11-009 is no longer only a final bilingual/responsive/accessibility/E2E and AWS/staging acceptance task. The owner explicitly expanded the milestone because live, current Policy Intelligence is now a launch-critical product requirement.

P11-009 is one large milestone with four sequential stages:

1. **Stage 1 — Live Policy Intelligence backend:** durable policy/source/revision/sync state, official-source acquisition, structured bilingual AI analysis, evidence verification, fail-closed auto-publication semantics and an operator sync path.
2. **Stage 2 — Policy Intelligence product activation:** production list/detail/home experience, richer Sovereign Nexus-inspired intelligence presentation, history/diff/importance behavior and Policy Intelligence -> AI Workspace continuity.
3. **Stage 3 — Whole-platform production hardening:** close D-040/P11-005 deployment/security gates and run bilingual/responsive/accessibility/E2E regression.
4. **Stage 4 — AWS staging rollout and acceptance:** inspect actual topology/migration state, migrate to the then-current latest repository migration, deploy exact images, configure/verify scheduled policy sync and complete staging acceptance.

Stage 1 is the active implementation unit. Later stages must not be started implicitly by the Stage-1 coding task.

The lawyer-provided `chatbot/UI_template/OPEN_ME_Sovereign_Nexus_UI.html` is a product/visual reference, not functional or legal authority. Mock names, credentials, statistics, lawyer claims, office details, availability claims and prototype behavior from that artifact must not be copied as production facts.

D-040 remains fully in force. Expanding P11-009 does not waive any deferred P11-005 production-readiness gate.

## D-050 — P11-009 Stage 2 activates live Policy Intelligence through a rollout-safe public projection

**Date:** 2026-09-30  
**Status:** ACCEPTED

Stage 1 is accepted at `0dae9e7ea46712c18357e3a9c009157c8cf0c8a1` after external source review and a 12/12 disposable-PostgreSQL runtime gate.

Stage 2 activates that backend in the public product without weakening provenance or requiring migration 0023 to be present in the current normal database.

Accepted Stage-2 rules:

- when the Stage-1 schema is available, the current published PostgreSQL revision is canonical;
- schema unavailable is an explicit rollout state and is not equivalent to an available store with zero publications;
- existing published `MANUAL_POLICY_ENTRIES` may serve only as compatibility/editorial fallback when the live schema is unavailable;
- unexpected database errors are not silently converted into manual data;
- automated public projections expose only presentation-safe structured analysis/source/revision fields and never raw source evidence, verifier internals, model metadata, fingerprints, held/draft revisions or sync failure telemetry;
- official source, AI interpretation and actual lawyer commentary remain separate provenance classes in data and UI;
- public revision history contains only revisions that were actually public, and public diff is deterministic from structured published revisions rather than model-generated;
- importance ordering is deterministic from bounded Stage-1 dimensions and is not presented as a 0–100 confidence/probability score;
- Policy Intelligence -> AI Workspace continuity carries only a stable slug/reference and is resolved server-side; Policy Intelligence analysis does not become official legal evidence, durable known facts or a hidden authority bypass for the answer pipeline;
- public Policy Intelligence reads must use a dynamic/no-store freshness boundary appropriate for an operator-maintained live feed.

Stage 2 creates no schema migration and does not authorize applying 0023, running live paid-provider/source sync, scheduling, deployment, AWS changes, P11-005 production-readiness closure, or Legal Service reasoning/model-routing changes.

The Sovereign Nexus template remains visual/product reference only; its mock facts, people, credentials and prototype behavior are not production authority.

## D-051 — Stage 3 hardens production mechanisms; Stage 4 supplies environment-specific AWS/staging attestations

**Date:** 2026-09-30  
**Status:** ACCEPTED

P11-009 Stage 2 is accepted at `0afa4cb7921e74ee6a2263b66743a875c5cf3e07`.

Stage 3 is the whole-platform production-hardening stage. It must implement and source-validate the production artifact, explicit migration/start separation, native document-parser self-checking, MatterDocument retention/stale-storage recovery, malware/quarantine fail-closed enforcement and scanner boundary, private-S3 preflight tooling, and concentrated bilingual/responsive/accessibility/E2E regression.

This decision clarifies the D-040/D-049 boundary without waiving any gate:

- Stage 3 owns the repository mechanisms and local/deterministic hardening needed to make the deferred P11-005 gates executable and auditable.
- Stage 3 normal service startup must not run shared-database migrations implicitly.
- MatterDocuments remain untrusted and must not enter processing, AI evidence or lawyer handoff until `securityStatus` is explicitly `clean`.
- Retention/purge has no invented legal default; destructive purge is operator-controlled, bounded and dry-run by default.
- Stage 3 may define provider-neutral malware/S3 verification contracts but must not fabricate a clean verdict or cloud state.

Environment-specific proof remains Stage 4 / separately authorized acceptance:

- actual staging migration to the then-current repository migration head;
- actual ECS/Fargate task architecture and production-image `@napi-rs/canvas` native load;
- actual private S3 bucket/IAM/encryption/Block Public Access verification;
- concrete malware-scanning service/configuration and real reconciliation;
- exact deployed-image and rollback/staging E2E evidence.

Accordingly, Stage-3 source acceptance alone does not mark D-040 closed and does not mark P11-005 VERIFIED. Those statuses require the mandatory environment evidence to be recorded later.

## D-052 — P11-009 Stage 3 is accepted; Stage 4 begins with read-only authoritative reconnaissance

**Date:** 2026-09-30  
**Status:** ACCEPTED

P11-009 Stage 3 is accepted at `e3b42c2004054da1eb3a6fd81c9f21dccdeb6b75`.

The acceptance basis is cumulative rather than one brittle Playwright assertion:

- reviewed Stage-3 production-hardening source at the pushed checkpoint;
- passed production-image/native-runtime, stock migration/preflight, disposable-PostgreSQL security, migration-safety, startup-separation and S3-preflight gates;
- authenticated customer/admin/lawyer RBAC, ownership and assignment evidence;
- bilingual and representative desktop/mobile runtime evidence;
- deterministic unit/build/lint/diff validation;
- bounded accessibility corrections confirmed in source and by owner browser verification on the current checkpoint.

The final automated targeted Gate-I rerun stopped when its temporary harness failed to observe a sidebar control. Subsequent owner browser verification on the current checkpoint confirmed the control is visible with the expected accessible name, together with the other bounded accessibility corrections. This is not treated as a demonstrated product regression. The harness settlement issue may be revisited only if staging reproduces a real failure; it must not trigger an indefinite local micro-fix loop.

Stage-3 acceptance does not close D-040 and does not mark P11-005 VERIFIED.

Stage 4 therefore starts with a **read-only authoritative staging reconnaissance gate**. Historical notes and local Compose must not be used to infer live AWS topology. Before any staging mutation, the project must inspect the actual ECS/Fargate, image, database, S3/IAM/BPA/encryption, malware-scanning, scheduler and routing state and produce an exact rollout/rollback plan.

Stage-4 reconnaissance itself does not authorize deployment, migration, image push, ECS/task-definition updates, S3/IAM changes, scanner configuration, scheduler changes or DNS/routing changes. Those require a separate explicit owner authorization after the reconnaissance report.

## D-053 — Policy Intelligence uses automatic daily maintenance with exception-only admin control

**Date:** 2026-10-01  
**Status:** ACCEPTED

The owner rejected manual-only Policy Intelligence maintenance as the steady-state product model. The accepted operating model is automatic official-source maintenance with lawyer/admin intervention only for exceptions.

The minimal implementation is intentionally three steps:

1. **Step A:** one all-source serial operator command reusing the existing discovery -> acquisition -> AI analysis -> evidence verification -> publication pipeline for Home Affairs, Federal Register and ART. Existing publication-gate semantics remain authoritative: verified/eligible revisions may auto-publish; uncertain or unsupported revisions remain held/`review_required`. One source failure must not block attempts for the others.
2. **Step B:** a minimal authenticated admin surface for archive/unpublish and restore. Existing `archived` lifecycle state should be reused where possible. Archived items are explicit suppression tombstones and must not be silently republished by later automatic sync until an authorized restore.
3. **Step C:** one EventBridge Scheduler entry launches one independent ECS one-off Policy Intelligence operator task daily at **06:00 Australia/Sydney**. Scheduled sync must not run inside the long-lived web service.

Manual reviewed fallback entries remain valid disaster-recovery content and must remain public-capable when the live pipeline is unavailable. Automated ingestion failure must never blank or retract existing reviewed/published content.

The project must not add mandatory lawyer pre-publication review, queues/multi-worker orchestration, extra AI reviewer layers or a new Policy Intelligence architecture merely to achieve scheduling. Reuse the existing durable item/snapshot/revision/sync-run model and verifier/publication gate.

Step A is the active coding unit. Step B and Step C require separate implementation/review and must not be bundled into Step A.

## D-054 — Automatic Policy Intelligence maintenance is operational

**Date:** 2026-10-01  
**Status:** ACCEPTED

The owner-approved automatic-maintenance model defined by D-053 is now implemented and deployed.

Accepted steady state:

- one daily EventBridge Scheduler invocation at 06:00 `Australia/Sydney`;
- one dedicated ECS/Fargate one-off Policy Intelligence operator task;
- one accepted `policy:sync-all` execution covering Home Affairs, Federal Register and ART serially;
- existing evidence verifier/publication gate remains authoritative for automatic publication;
- admin archive/restore is the exception-control mechanism;
- archived items remain suppressed until explicit restore;
- manual reviewed fallback content remains available for public continuity.

Deployment identifiers:

- source commit: `dc8595d365b565c869bcc82f2f02bc9cfd8ab9ec`;
- operator image digest: `sha256:3caad29bc292b79de2508a4e0fdebb086a97824a709f45309e959b3fb369f28c`;
- ECS task definition: `immigration-ai-staging-policy-sync:1`;
- schedule: `immigration-ai-staging-policy-sync-daily`.

The first live operator run completed successfully with container exit code 0 and all three configured sources reported succeeded. D-053 implementation is therefore accepted as operational.

## D-055 — Scheduler deployment is accepted; first natural trigger remains an observation item

**Date:** 2026-10-01  
**Status:** ACCEPTED

D-054 is clarified as follows.

The automatic Policy Intelligence operator itself has passed live execution: the manually launched ECS task completed with container exit code 0 and all three configured sources succeeded. The AWS CLI `tasks-stopped` waiter timed out before that completion, but authoritative ECS state later confirmed success; the waiter timeout is not treated as an operator timeout or failure.

The EventBridge Scheduler `immigration-ai-staging-policy-sync-daily` has been created, verified and is `ENABLED` for `cron(0 6 * * ? *)` in timezone `Australia/Sydney`.

Because the schedule was created after the current day's 06:00 trigger point, no naturally Scheduler-triggered execution has yet been observed. This does not reopen implementation or deployment. It remains a single operational observation item: confirm the next scheduled ECS task launches and completes normally.

## D-056 — China VIP payments stay on Stripe: Alipay recurring when approved, WeChat prepaid

**Date:** 2026-10-10  
**Status:** ACCEPTED

The next commercial-completion task extends the existing VIP billing system for mainland-China-friendly payment methods while preserving the current trusted Stripe billing boundary.

Accepted product contract:

- the current AUD card monthly subscription remains unchanged;
- Alipay is offered as a CNY monthly recurring VIP option only when the live Stripe account/configuration has the required recurring-Alipay capability/approval; otherwise that option remains unavailable/fail-closed;
- WeChat Pay is offered through Stripe as a CNY one-time prepaid purchase for exactly 30 days in the first release, with no recurring-payment claim;
- a successful prepaid renewal extends VIP from `max(now, current vipExpiresAt)` by 30 days;
- only verified server-side Stripe payment/webhook evidence can grant or extend entitlement; browser success/cancel query parameters never grant VIP;
- webhook/payment replay must remain idempotent and existing AUD subscription/cancellation/billing-portal behavior must not regress.

This is a fast one-pass product extension, not a billing rewrite. Direct Alipay SDK integration, direct WeChat Pay SDK integration, automatic FX conversion, additional prepaid durations, and a generic multi-provider payment framework are explicitly out of scope. A minimal additive migration is permitted if the existing schema cannot safely represent both flows, but applying any new migration outside an authorized local/disposable environment remains a separate operation.

## D-057 — Phase 12 three-stage reliability and Policy Intelligence plan

**Date:** 2026-10-11
**Status:** ACCEPTED — PLAN ONLY; Stage 1 execution NOT YET AUTHORIZED

The owner rejects excessive micro-milestone splitting and accepts **exactly three** coherent implementation stages, each with concentrated rigorous test and independent owner approval gates, as defined in `docs/agent-memory/tasks/PHASE12_USER_DATA_WORKSPACE_POLICY_2026-10-11.md`:

1. Durable user-centred conversation/file history across Ubuntu/Windows/Android, reliable message persistence, pagination and DOCX handling, plus **interfaces only** for future optional Projects.
2. Unified authorized conversation/document/policy context across Fast/Legal Check/Premium, persisted policy identity, and chat-priority/responsive file UI.
3. Broader official proposed-policy discovery and lawyer-authorized editorial correction/approval, status/currentness clarity and integrated staging acceptance.

Same-account historical visibility and file retrieval must be complete for retained authorized records, but independent-chat model contexts remain isolated. Existing customer files, histories and legal Matter boundaries remain protected; no destructive migration or cross-user access. A future GPT-like Project does not exist in this Phase.

**Prior decision clarification:** D-053/D-054's existing automated Policy Intelligence publishing pipeline remains operational; D-057 permits a separately authorized lawyer editorial **exception** pathway and broader official candidate discovery without imposing a mandatory lawyer review step on every automatically eligible policy. Manual review does not allow unsupported legal facts or fake effective dates to be labeled verified. Previous architecture/safety and evidence rules remain in force.

**Scope restriction:** This acceptance authorizes creating the Phase 12 branch and committing plan/state documents, **not** implementing Stage 1, merging, deploying, applying migrations or changing Stripe settings. Existing WeChat/Alipay payment activation hold remains in effect. Owner will request Stage 1 coding-model prompt after local sync.

## D-058 — Stage 3 includes independent lawyer-authored manual policy publication

**Date:** 2026-10-11
**Status:** ACCEPTED — PLAN ADDITION; no implementation authorized

The lawyer requested and the owner explicitly approved **first-class, fully manual policy authoring and publication** as part of **Phase 12 Stage 3** (not a separate fourth milestone). An expressly authorized lawyer/Policy Editor can create a new policy from scratch in the web UI, write the text and bilingual fields personally, assign accurate proposed/announced/in-force status and source references, save a draft, preview, publish and later edit/archive/restore. The manual creation/publishing workflow is **independent of AI**: no discovery candidate, AI generation, AI relevance score, AI verification, `evaluatePublicationGate()` automated eligibility or LLM API call is a prerequisite or side effect.

Manual content must be durable first-class policy content in the normal public index/detail alongside automated entries (not just `registry.ts` fallback), clearly labeled human authored and never AI-generated. Preserve explicit source/provenance, human editorial accountability, bilingual text entered by the lawyer or an explicit non-AI locale policy, verifiable temporal/legal status, append-only audit trail and published revision history, server-side RBAC, safe text/URL validation and concurrent editing protections. Deterministic mechanical validation and human editorial responsibility remain; no claim that a manual publication itself proves a proposal is law.

**Relationship to D-053/D-054/D-057:** Scheduled automated policy discovery/publication and separately authorized human override of blocked AI candidates remain operational, but **are distinct workflows** from independent original human policy creation. No mandatory lawyer gate is added to previously trusted automated publishing. Project remains optional-interface-only, Stage 1 and Stage 2 scopes are unchanged. This records scope only; no code, database, migration, merge, deployment or payment action is authorized by this decision.

**Specification and Gate 3 tests:** `docs/agent-memory/tasks/PHASE12_USER_DATA_WORKSPACE_POLICY_2026-10-11.md`. Stage 3 cannot be accepted without real no-AI manual create/draft/preview/publish/reload/security/audit/regression tests.

## D-059 — Stage 2 context contract: server-authoritative policy binding, snapshot-is-not-law, and one owner-authorized document view

**Date:** 2026-10-12
**Status:** IMPLEMENTED on `codex/phase12-stage2-context-ui` (uncommitted); awaiting independent review and owner acceptance. No merge, deploy or live migration.

**Decision (policy binding).** A policy-to-conversation association is durable, server-owned state, not transient client state. It is stored in the additive table `ConversationPolicyBinding`, written in the same transaction that creates the conversation, and read back on every path (create/list/detail and the widget routes' topic hint). The browser may only submit a **slug**; the server resolves the published policy through the same publication gate the policy page uses, so an unpublished, archived or unknown slug creates nothing (404 `policy_topic_unavailable`) instead of a conversation that silently lacks its topic. Launch is idempotent per `(userId, launchId)` so retries and races resolve to one conversation and cannot produce empty duplicate rows, while an explicit new launch remains possible. When a requested policy cannot be persisted, the UI must show an explicit recoverable state and create no generic conversation — there is no silent downgrade.

**Decision (snapshot semantics).** The stored binding is a **creation-time snapshot of the topic and its cited revision**, deliberately including the revision/token and the publication timestamp so a reopened conversation can say what it was created from. It is never presented as currently effective law: the card always displays the revision and the snapshot notice. Policy currentness must be re-checked against the live policy page; a snapshot must not be used to claim a proposal's current status.

**Decision (rollout safety).** The application code probes for the binding relation (`to_regclass`) and degrades to a `503 policy_binding_unavailable` API answer when migration `0026` is absent, so Stage 2 code can be deployed before the migration without data loss or false success. Migration source `0026_phase12_stage2_conversation_policy_binding.sql` is **unapplied** outside the isolated disposable test database and remains an explicit owner-authorized step.

**Decision (one context resolver).** Fast, Legal Check and Premium must consume the **same** authenticated resolver output for the account, conversation ownership, matter, policy topic and document evidence. A route may not assemble its own wider or weaker context, and an unowned chat yields an empty context rather than widened scope. Customer documents enter the model only as bounded, clearly labelled **untrusted customer data, never legal authority**, and always with their processing state.

**Decision (document availability truthfulness).** Backend serving paths receive a bounded availability summary (`customer_document_summary`) as **control data distinct from evidence**. When a conversation has files but no usable extracted text, the model is told deterministically not to describe, summarise or claim to have read them, and to state the recovery step. Consequently, "evidence used" telemetry must be truthful: `customer_document_evidence_used` is only true when document evidence was actually present **and** a real answer was accepted **and** the turn was not safety-blocked — a summary alone never counts as use. The previously silent gap where the Default AgentRuntime received no customer document evidence at all is a defect and is not to be reintroduced for any mode.

**Decision (guest and account truthfulness).** An account without file capability (guest) is told plainly that managing files requires signing in, and the document APIs are not called for that account; the UI must not surface a raw unlocalized API authorisation error, and the UI must not claim AI usability of a file whose extraction did not finish.

**Non-effects.** This decision does not alter legal reasoning architecture, Phase-6 checker semantics, evidence-identity rules, ReasoningBank governance, the political/privacy gate, billing or S3 semantics. It records Stage 2 implementation scope only; it does not authorize a merge, a migration application, a deployment or any change to customer data.

### D-059-R1 addendum — independent review corrections (2026-10-12)

Three reviewer findings were corrected without reversing D-059. The addendum is the binding interpretation of D-059 where the original wording was ambiguous.

1. **Use is verified, never assumed (finding R1-1).** Availability, packaging or the existence of an answer never makes `customer_document_evidence_used` true. The serving path reports the tri-state `customer_document_usage` (`not_supplied` / `supplied_unconfirmed` / `confirmed`); `confirmed` requires an explicit model acknowledgement whose document id is a member of **this request's** authorized manifest. Single-shot modes with no acknowledgement channel (Fast, Premium direct, legacy reasoning, V2) report `supplied_unconfirmed` with the strict boolean `False`. **Consequence:** a Fast/Premium answer no longer auto-attaches the customer's document manifest to a lawyer request, because that attachment was gated on the same conflated flag. Widening it requires a separate approved provenance rule and remains with the owner.
2. **Topic context is durable (finding R1-2).** The model-side policy topic is rebuilt from the **persisted binding snapshot** (slug, bilingual titles, official source title/URL, creation-time revision, publication date and status), never from a live lookup that can fail. The historical snapshot is topic context only, is never current-law proof, and must not be presented as evidence. When the live publication still resolves, the current revision is shown as a separate line; a revision change is stated, never silent.
3. **Long-lived conversations are first-class (finding R1-3).** Availability counts are bounded only to stay finite (`MAX_CUSTOMER_DOCUMENT_COUNT = 100_000`), never at a value that rejects an ordinary question. The summary distinguishes **all** stored/usable files from the **packaged** subset supplied to one model turn, and states both partial packaging and mixed readable/unreadable status honestly. Per-turn cost is bounded: one batched read of the latest run per document, with extraction text fetched lazily for the packaged packet only.

**Scope note.** These corrections change serving metadata and prompt context only; they do not add research, tools, migrations or customer-visible text changes, and they do not authorize commit/merge/deploy/migration.

### D-059-R2 addendum — final focused corrections (2026-10-12)

The second independent review accepted R1-2 (durable policy topic) and R1-3 (large document counts) at the static design level and required two bounded corrections, which are now the binding refinement of D-059/R1.

1. **Per-document provenance (R2-A).** A boolean is not provenance. The serving response now carries `customer_document_used_ids`: the bounded ids the answering model acknowledged **and** this request authorized. `confirmed` and the ids exist only for acknowledgement-based use; telemetry names that basis (`model_acknowledged` / `none`) so it is never read as independent evidence verification. Consumers must subset their own request-scoped manifest by those ids; one acknowledged document never makes the packaged packet "used", and a forged or cross-conversation id can never introduce a document. Fast/Premium keep `supplied_unconfirmed` with an empty id list until an explicit acknowledgement mechanism exists.
2. **Lawyer-request categories stay distinct (R2-A compatibility).** A lawyer snapshot may carry the bounded, server-built manifest persisted with the answered turn — the conversation-authorized attachments — and must mark each entry `used_by_answer`, true only for the acknowledged subset. This restores the file context that R1's stricter flag removed entirely from Fast/Premium requests **without** widening access: only the persisted turn manifest is read (at most 4 documents, acknowledged first), the exact-reconstruction authorization contract is unchanged, an unacknowledged attachment that is no longer available is skipped, and an acknowledged one that cannot be reconstructed still fails closed. Existing stored answers keep their stored behaviour.
3. **Customer filenames never enter routine traces or archives (R2-B).** Trace and archive request copies are filename-free by construction: the evidence packet is dropped, the summary is reduced to numeric counts, availability/packaging states and the count of withheld filenames, and the same sanitization covers the `matter_id`-fallback path, direct `build_snapshot` callers and the archive hand-off. The authenticated application keeps showing customers their own filenames because it reads the application database, not these traces.

**Scope note (R2).** These corrections change serving metadata, lawyer-snapshot provenance labelling and trace/archive sanitization only. They add no research, tools, migrations, dependencies or legally-relevant behaviour, and they do not authorize commit/merge/deploy/migration.

### D-060 — Lawyer attachments require explicit per-document customer consent (owner-selected Option A, 2026-10-12)

The owner reviewed the R2 residual risk (a Fast/Premium answer could attach the conversation's documents to a lawyer request without the AI acknowledging use) and chose **Option A: the customer selects the attachments**. This is now the binding contract.

1. **Nothing is shared by default.** Requesting a lawyer review never implies permission to share files. The customer sees the eligible documents for that answered answer (filename, processing status, whether the AI answer acknowledged using it), every checkbox starts unchecked, and only the checked documents and their permitted excerpts are shared.
2. **The selection is explicit and server-validated.** The request API accepts `attachments: { consent: true, selectedDocumentIds }`; a missing decision means no attachments. Ids are validated against the server-persisted manifest of that specific answered turn and against the owner's own rows (ownership, conversation, document/run identity, retained status, exact hash-verified reconstruction). Forged, cross-conversation, stale, deleted, duplicate or over-limit selections are explicit errors.
3. **No silent truncation.** The four-document limit, the 12 000-character excerpt budget and the exact reconstruction contract are unchanged, but exceeding the limit or selecting an unavailable document fails loudly instead of dropping it, and an acknowledged document the customer did not check is never added. The customer sees which acknowledged documents they are withholding.
4. **Bounded evidence of the decision.** Each request stores a filename-free `customer_document_selection` record (version, mode, eligible/acknowledged/selected/shared/withheld counts, limit). Withheld filenames and excerpts are never persisted for the lawyer; the customer's own view shows their own shared filenames.
5. **Idempotency preserved.** A repeat submission of the same answer returns the already-created request unchanged; the stored selection cannot be rewritten. Existing submitted requests are never altered retroactively.

**Non-effects.** No migration, no schema change (the record lives inside the existing `evidenceSnapshot` JSON; the snapshot version constant is now `phase12.s2.consent.v1`), no change to legal reasoning, Phase-6 checker semantics, evidence identity, ReasoningBank, the political/privacy gate, billing or AWS. This decision does not authorize commit/merge/deploy/migration.

#### D-060 addendum — final review corrections A + B (2026-10-12, uncommitted)

The independent review of `54ec8e3` found two remaining defects in the consent workflow. Both are corrected inside D-060's contract; no scope was widened.

- **A — a failed attachment load must not permit submission.** Submission is now gated on a *successful* eligibility load (`canSubmitLawyerRequestWithAttachments`), and the decision payload (`attachmentDecisionPayload`) is `null` for `idle`, `loading`, `failed` and `already_requested`. A network error, an error response, invalid JSON, a missing/unknown `attachmentSelection` shape or a malformed body therefore blocks submission instead of silently becoming "the customer consented to share nothing". The UI shows a localized error, a blocked-submission notice and a clearly labelled retry control (重新加载附件 / Retry loading attachments). An explicitly confirmed zero-document selection is still sent as `{ consent: true, selectedDocumentIds: [] }`. Malformed, duplicated or over-limit selections are refused, never sliced.
- **B — an existing request is its own state.** `already_requested` is a first-class client state that refuses submission and replaces the new-request interface. Its shared-document count is read from the persisted `documentSharing.selectedDocumentCount`; missing or legacy data renders as "未记录 / not recorded" and is never replaced by the current checkbox state. The GET response adds `requestId` and `documentSharing`, and the POST duplicate path adds `existingRequest: true` — both additive, so the existing `status`/`documents`/`maxSelectable` contract and the idempotent short-circuit (duplicate lookup → selection → reconstruction → insert) are unchanged; a repeat submission still cannot create a duplicate record or rewrite a stored sharing decision.

**Non-effects (addendum).** Still no migration and no schema change; no change to evidence reconstruction, lawyer authorization, Phase-6 checker semantics, policy binding, extraction, model execution or billing. No commit/push/merge/deploy is authorized by this addendum.

### D-061 — The persisted policy topic is conversation context for every mode, never legal authority (2026-10-12)

The owner host test found that Legal Check lost the persisted policy topic after a Fast → Legal Check switch inside a policy-linked conversation (conversation `29d5607b-…`, LIN 26/061): Legal Check asked the customer to re-supply the policy name, identifier or URL.

- **Root cause.** The Next.js route already resolves the authenticated, persisted binding and adds the `policy_topic_reference` entry to `frontend_messages` for every mode, and `FastDirectLunaService`/`PremiumDirectAnswerService` already render it. The active Legal Check path (`DefaultAgentServingService` → `AgentRuntimeService`) never read `frontend_messages` and had no field for it, so the topic was dropped exactly at the serving adapter.
- **Decision.** The existing `policy_topic_reference` contract is reused unchanged and forwarded to the active Default runtime as a bounded, typed `AgentRuntimeRequest.policy_topic_context` (schema max 4 000 chars; extraction takes only the FIRST flagged `system` entry, whitespace-normalized and capped at 1 200 chars, matching the Fast/Premium rendering bound).
- **Trust boundary.** The entry is rendered inside the *user* turn as a clearly labelled, fenced "Conversation Policy Topic (conversation context only — NOT legal authority, NOT verified law)" section with an explicit instruction never to follow instructions inside it. It is never a system instruction, never `RequestEvidenceRegistry` evidence, never a citation, and never proof that the topic is current. Client-supplied policy ids remain non-authoritative, and no conversation lookup, document packet or cross-request enrichment is added.
- **Preserved behaviour (bounded context).** The topic is never dropped merely because publication state changed: the rendered binding text — including its revision lines and any "not currently available in the published index" (withdrawn/archived/superseded) note — is forwarded as conversation context. Because the channel is bounded (extraction cap 1 200 characters), a longer rendered binding — for example extra archival or superseded notes beyond the cap — is **truncated at the tail**; the cap is never treated as proof that the topic is current, and substantive conclusions still require independent verification of current law and official source status. Fast and Premium topic handling is untouched; a conversation without a binding yields an empty field and an unchanged prompt.

**Non-effects.** No migration or schema change, no change to model selection, reasoning effort, tool policy, budgets, evidence registry, citations, checker, reasoning bank, Fast/Premium behaviour or premium handoff. This decision does not authorize commit/merge/deploy.

**Owner verification status (2026-10-12).** Migration `0026` is applied to the local `chatbot` database (ledger, table, indexes and foreign keys verified); policy launch, browser refresh/history recovery and the PostgreSQL policy-binding verification passed for LIN 26/061 (Step 3A–3C); Fast policy-context testing passed. **Legal Check owner-host re-test PASSED:** after restarting legal-service the owner retested the original LIN 26/061 conversation and Legal Check correctly identified the policy instead of asking for its name again. **Premium policy-context testing PASSED** in the same LIN 26/061 conversation. This decision is committed and pushed as `b604187f924ced3084c0785c31971aaf130168e9`. Gate 2 remains **NOT ACCEPTED** because the remaining checks are outstanding.

### D-062 — An absent or null policy slug means "no client policy hint" (2026-10-12)

The owner host test uploaded `test_pdf.pdf` and `test_docx.docx` to the ordinary, non-policy conversation `0a8c3d1d-887d-4246-8f76-28ea613ecc55` and a Fast question failed **before model execution** with `ZodError path: ["policySlug"] expected: "string" received: "null"`. The workspace sent an explicit JSON `null` when the conversation had no persisted binding, while all three widget routes accepted only `string | undefined`.

- **Decision.** A widget request's `policySlug` is an optional client hint. Both an omitted field and an explicit `null` mean "no client policy hint" and must be normalised to the same no-policy state; ordinary conversations must work without a policy binding. The client omits the field entirely (it never sends `null`), and the shared rule lives in `lib/policy-intelligence/request-policy-slug.ts`.
- **Strictness preserved.** A present non-null value must still match the shared `POLICY_SLUG_PATTERN`; invalid types and malformed slugs are still rejected. The three widget request schemas moved verbatim into `lib/conversations/widget-turn-schemas.ts` so one contract and one strictness apply to Fast, Legal Check and Premium, and so the real contract can be tested without importing Next.js route modules.
- **Authority unchanged.** The slug is only a hint: the backend still resolves the conversation's topic from the persisted, owner-scoped binding (`resolveConversationPolicyTopicContext`), so no URL parameter, client value or spoofed body can select a policy or widen access. The existing pre-migration client-fallback path is unchanged.
- **Non-effects.** No change to durable-turn, authentication, authorization, policy-binding persistence, document evidence, political gate, S3/AWS, database, migrations, deployment or the Python legal service. No commit/push/merge/deploy is authorized by this decision.

**Owner verification status (2026-10-12).** This decision removes the pre-execution request-contract failure (`ZodError path: ["policySlug"]`); **owner browser verification of the document flow remains pending**, and this decision is the only uncommitted change set on the branch (D-061 is committed as `b604187`).

### D-063 — Phase 12 Stage 2 core functional completion with explicit gate deferrals (2026-10-13)

**Status:** OWNER FUNCTIONAL SIGN-OFF; **NOT** full original Gate 2 acceptance.

**Owner decision.** After D-061 and D-062 were committed and the owner tested the same ordinary conversation with saved PDF/DOCX in Fast, Legal Check and Premium, the owner declared Stage 2 functionally complete and directed closure of Stage 2 feature development. This decision is an acceptance of the **tested core scope**, not an assertion that every original Gate 2 requirement passed or that Stage 3 implementation is automatically authorized.

**Verified evidence.** Owner browser screenshots in ordinary, non-policy conversation `0a8c3d1d-887d-4246-8f76-28ea613ecc55` show `test_pdf.pdf` → `BLUE-314`, 14 March 2026 (intended arrival); `test_docx.docx` → `GREEN-729`, 30 November 2026 (insurance expiry). Fast, Legal Check (active AgentRuntime), and Premium all returned the expected values from both saved files, identified customer-file provenance rather than official law, and reused the same conversation without reupload. LIN 26/061 linked-conversation launch, refresh/history restore and DB binding check passed; Fast, Legal Check (after D-061 restart) and Premium each correctly retained policy topic. Git code checkpoint `7031b37292410597c4411b8a9b60f10bdf35b823`; the owner reported local/remote SHA equality and clean working tree. Independent static review of D-061 and D-062 fixes had passed; reported tests include 754/754 chatbot unit and 1302/1302 legal-service backend.

**Storage and cleanup.** The temporary independent S3 test Bucket `immigration-ai-localtest-documents-747452892291-ap-southeast-2` (ap-southeast-2, AES256, Public Access Block enabled) passed read-only `s3:preflight` with `{"ok":true,"failures":[]}`. Its test objects are still needed until closeout; cleanup and removal of this test Bucket are the **second pending owner-supervised task**, with a prior check for local database file records/download impacts. No bucket deletion or database cleanup is part of this docs commit.

**Explicit non-acceptance and deferral.** The screenshots establish user-visible end-to-end answer behaviour, not a separate database evidence-unit audit, original-byte download, source-link click check, malicious-file testing, alternative legacy Legal Check runtime, cross-device durability, or AWS staging/production acceptance. Cross-device checks were explicitly DEFERRED BY OWNER; other outstanding original Gate 2 checks (including staging/production S3, negative authorization, original-byte download and remaining environment/UI cases) are NOT RUN/NOT ACCEPTED. Stage 1 formal Gate 1 remains open. The original all-items Gate 2 was not satisfied; no unrun check is marked PASS. Stage 3 remains not started; any change to the original hard-gate sequencing requires a separate explicit decision. No AWS staging/production operation, merge, migration, database deletion or code change is authorized by this documentation decision.

### D-064 — Retain the isolated AWS S3 local-test Bucket for future development (2026-10-13)

**Status:** OWNER-APPROVED — RETAIN; no AWS operation authorized here.

**Decision:** Keep the independently created local-development Bucket rather than delete it after the Stage 2 experiment, so future PDF/DOCX, provenance, three-mode and access-control regression tests can reuse the existing S3 object store. The owner prefers deletion only if actual operating costs become material or the Bucket is no longer needed. **Supersession:** This retention decision **supersedes only** D-063's proposed second closeout task to clean up/delete the temporary Bucket; it does not alter D-063's Stage 2 functional sign-off, Gate 2 non-acceptance, or outstanding environment checks. No automatic cleanup is scheduled.

**Connection and security parameters:**

| Parameter | Recorded value |
| --- | --- |
| Purpose | Dedicated **local-development test** S3 object store for PDF/DOCX intake, extraction, AI-mode testing; **not** the existing staging/production bucket |
| AWS account | `747452892291` |
| AWS CLI profile | `aulawyers-staging` (workstation-local credential resolution; do not store credentials in repository) |
| AWS Region | `ap-southeast-2` (Sydney) |
| S3 Bucket | `immigration-ai-localtest-documents-747452892291-ap-southeast-2` |
| Bucket ARN | `arn:aws:s3:::immigration-ai-localtest-documents-747452892291-ap-southeast-2` |
| Environment variables, for local Next.js process only | `AWS_PROFILE=aulawyers-staging`, `AWS_REGION=ap-southeast-2`, `MATTER_DOCUMENTS_S3_BUCKET=immigration-ai-localtest-documents-747452892291-ap-southeast-2` |
| Encryption | Default SSE-S3 `AES256`; existing app also requests AES256 on PUT |
| Public access | BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, RestrictPublicBuckets all enabled |
| Validation | `pnpm run s3:preflight` with the three env vars above returned `{"ok":true,"failures":[]}` (2026-10-12) |
| Dataset | Synthetic `test_pdf.pdf` and `test_docx.docx` in the local test conversation `0a8c3d1d-887d-4246-8f76-28ea613ecc55`; no real client documents |
| Scope isolation | Do **not** connect this Bucket to AWS staging/production ECS; do not mix with `immigration-ai-staging-matter-documents-747452892291`; this Bucket does not automatically contain original bytes of older local DB file records |

**Reuse command (process-local only; do not modify protected environment files):**

```bash
cd ~/immigration_ai/chatbot

AWS_PROFILE=aulawyers-staging \
AWS_REGION=ap-southeast-2 \
MATTER_DOCUMENTS_S3_BUCKET=immigration-ai-localtest-documents-747452892291-ap-southeast-2 \
pnpm run s3:preflight

# Start Next.js in a foreground terminal, only after stopping the old instance.
AWS_PROFILE=aulawyers-staging \
AWS_REGION=ap-southeast-2 \
MATTER_DOCUMENTS_S3_BUCKET=immigration-ai-localtest-documents-747452892291-ap-southeast-2 \
pnpm exec next dev --turbo -p 3000
```

**Cost, isolation, safety and deletion:** **Retention/cost decision (owner, 2026-10-13):** RETAIN this isolated test Bucket after Stage 2 for future development/regression tests; do **not** delete it during closeout. Ordinary S3 general-purpose buckets have no separate creation fee or minimum charge; pay-as-you-go charges depend on stored bytes, requests and applicable transfer/optional AWS features. The two observed test uploads were only about 24.2 KB and 10.0 KB, so at that scale the expected recurring storage cost is negligible compared with an actively running ECS/RDS stack. This is an estimate, **not** a verified bucket-attributed AWS bill. Keep only synthetic test data, inspect storage and billing periodically, and consider deletion if costs grow or the Bucket becomes unnecessary. No lifecycle auto-delete, AWS change, deletion or credential rotation is authorized by this documentation update. Deletion requires separate owner confirmation after inspecting objects, versioning/multipart state and database download/reference implications. Do not assume the two visible PDFs/DOCX represent the Bucket's exact inventory. ```bash
# Read-only, reports object count and total bytes without listing object names.
aws s3api list-objects-v2 \
  --bucket immigration-ai-localtest-documents-747452892291-ap-southeast-2 \
  --profile aulawyers-staging \
  --region ap-southeast-2 \
  --query '{Objects:length(Contents),Bytes:sum(Contents[].Size)}' \
  --output json
```
 Never put real client documents or credentials here; keep the Bucket separate from Staging/production. The existing local DB may retain file metadata pointing at this Bucket; deleting objects or the Bucket can break original downloads and must be reviewed before any later deletion. Bucket versioning and actual billing attribution were not independently checked by this documentation update.

## D-065 — Authorized lawyer holds final Policy Intelligence editorial and publication authority

**Date:** 2026-10-13  
**Status:** ACCEPTED — owner-approved Stage 3 design correction; DOCUMENTATION ONLY, implementation not yet authorized

**Decision / precedence.** An expressly authorized **Policy Editor lawyer** has the final editorial and professional decision on the relevance, interpretation, correction and publication of Policy Intelligence content. AI Analyzer, AI Verifier, `source_not_policy_relevant`, `review_required`, weak/missing-evidence judgments, and `evaluatePublicationGate()` are advisory for a lawyer-initiated override, **not a backend veto over the lawyer**. D-065 supersedes conflicting restrictions in D-057, D-058 and the original Stage 3 task language that prohibited `forcePublish=true` on AI substantive-verification or source-sufficiency grounds.

1. **Actual lawyer-final override.** Expose an explicit, server-authorized `forcePublish=true` (or equivalent) on AI-held, rejected or verification-failed items. The authorized lawyer may correct/rewrite an AI analysis, change its relevance assessment and lawyer-stated source/legal status, and publish despite the AI result. No rerun, approval, positive relevance score, sufficient-source rating or passing `evaluatePublicationGate()` is required. The backend must not quietly reintroduce a substantive AI legal-quality veto or mandatory second AI review.
2. **Independent manual path.** Preserve D-058's fully human-authored create/draft/preview/publish/revise/archive/restore workflow without crawler candidates or any LLM/AI verifier. An expressly authorized lawyer may publish professional analysis/commentary even without a traceable official-source record; absent citations or rejected AI authority assessments must not become a substantive publication blocker.
3. **Accurate attribution, not AI censorship.** Human-created/overridden work must identify the responsible human author/editor, dates and public content provenance. When an actual official source is supplied, render it faithfully; never fabricate statutory wording, source URLs, citations, commencement dates or an independently verified-law badge. When no source is established, publish as **lawyer-authored analysis/commentary**, not as authenticated verbatim law or automatically verified official legislation. A human editorial approval alone does not transform an announced or proposed measure into enacted law; the lawyer remains responsible for their asserted legal-status description. AI warnings/reasons overridden remain available internally for audit rather than silently disappearing.
4. **Technical safeguards remain mandatory.** The server enforces explicit Policy Editor capability (not every lawyer), authenticated actor and tenancy, CSRF protection, safe request types, supplied URL syntax/security, sanitization, concurrency/version conflicts, resource bounds and immutable revision/audit history (actor, timestamp, old/new values, overridden AI verdict, override reason). A technically unauthorized or malformed operation may be rejected; **disagreement with the lawyer's legal judgment is not a technical validation failure**.
5. **Keep trusted automatic publishing.** The current automatic discovery → acquisition → AI analysis → verifier → automatic gate → publication process and its automatic eligibility tests remain unchanged. No blanket lawyer-approval gate is introduced. Manual-original and lawyer-override publication are separate first-class paths; preserve archive control and current approved public revision stability when a newer source snapshot is held.

**Stage 3 acceptance correction.** Explicitly test a legitimate lawyer `forcePublish` on both a `source_not_policy_relevant` case and an AI-evidence/verifier-held case while the verifier remains rejecting or unavailable; the lawyer's publish must succeed without LLM calls. Also test an uncited, correctly attributed lawyer opinion, RBAC denials, audit/version history, concurrency and content/URL safety. Keep automatic-publication regression tests. This correction is **inside existing Stage 3**, not an extra Stage.

## D-066 — Stage 3 implementation authorized on a dedicated branch with Gate 1/Gate 2 checks still open

**Date:** 2026-10-13
**Status:** ACCEPTED — owner-authorized implementation sequencing; Stage 3 implemented on `codex/phase12-stage3-policy-intelligence` at base `a61fcddfa9dcbb3fbf6fb72d2aff093c6d7d7419`

**Decision.** The owner explicitly authorizes full Phase 12 **Stage 3 (Policy Intelligence Completion)** implementation on the dedicated branch `codex/phase12-stage3-policy-intelligence` while the previously deferred verification items remain **open**:

- Stage 1 **Gate 1** (cross-device continuity, original-byte download, DOCX end-to-end and documented failure paths on the owner host) is still NOT ACCEPTED.
- The original Stage 2 **Gate 2** checks remain NOT ACCEPTED (unexecuted/deferred items only; core scope stays OWNER SIGNED OFF).
- Neither gate is retroactively marked as passed by this decision, and this authorization does not convert them to PASS.

**Implementation scope realized under this decision (subject to independent review, not yet committed/pushed):**

1. **Three coexisting publication pathways** on one public read model: automatic trusted publication (unchanged eligibility path), authorized-lawyer override/force publish (no AI re-run, no verifier approval, no gate PASS), and fully manual bilingual lawyer authoring with draft/preview/publish/revise/archive/restore independent of crawlers, AI availability and official sources.
2. **Published revision stability:** `isCurrentPublishedPolicyRevision` no longer requires the published revision's snapshot to equal the item's latest snapshot. An approved published revision stays public while a newer source snapshot is held, and the newer-source condition is exposed as an honest `newerSourcePendingReview` currentness signal. Archive suppression, pointer integrity, source identity and history remain enforced.
3. **Explicit, revocable Policy Editor capability** (`PolicyEditorGrant`) enforced server-side; administrators are the grantors; ordinary lawyers and customers are denied; the authenticated session is the only actor source (body actor/role fields are strict-schema rejections).
4. **Data model additions** (additive migration `0027_phase12_stage3_policy_editorial.sql`): item `origin`/nullable official identity/`createdByUserId`; revision `contentKind` discriminator with nullable snapshot/analysis/verification/modelMetadata and durable `humanContent`, `baseRevisionId`, `aiDecision`, `overrideReason`, `idempotencyKey`; new `PolicyEditorGrant`, `PolicyIntelligenceEditorialEvent` (immutable audit) and `PolicyIntelligenceOperatorSubmission` tables. No human content is forced into fabricated official snapshots or AI metadata.
5. **Discovery expansion:** new controlled sources for Home Affairs announcements/consultations, ministerial announcements and parliamentary bills, plus an operator-submission source that admits any allowlisted official `.gov.au` host through the existing HTTPS/SSRF/redirect/byte/timeout protections; authorized staff submit URLs that the existing sync pipeline consumes on its next run.
6. **Coexistence guarantees:** automatic sync never deletes/overwrites/unpublishes human work; held AI revisions never silently replace an approved human override; archive/restore preserve intentional editorial decisions and audit history.

**Evidence recorded in the repository at implementation time (see CURRENT_HANDOFF for the exact commands/counts):** new unit suites for currentness stability, editorial service/API contracts, capability RBAC and operator-submission/discovery safety; a PostgreSQL integration suite on the isolated disposable database covering automatic publication, held-source stability, verifier-unavailable force publish, LLM-free manual authoring, sync coexistence, concurrency, archive/restore and durable audit; `tsc --noEmit` at the same 45 pre-existing diagnostics as the base commit; and the owner-host acceptance steps listed in the handoff.

**Non-effects and safeguards.** No migration was applied to the owner's development/staging/production databases (only the isolated disposable test database was created/migrated for validation). No AWS/billing/customer-data/deployment change. Nothing was committed or pushed by this implementation; independent review and owner-host functional acceptance happen before any commit/push decision. Protected branches and the immutable recovery branch were not touched.

**Non-effects.** Documentation change only. Stage 3 implementation still requires a separate owner authorization and a decision on Stage 1/2 deferred gate sequencing. Stage 2 core functionality remains OWNER SIGNED OFF; Stage 1 Gate 1 and original Stage 2 Gate 2 remain NOT ACCEPTED. No code, DB migration, customer data, AWS, billing or deployment is changed by D-065.

## D-067 — Stage 3 R1 review corrections: human-publication protection, verified-lawyer publication authority, editorial content integrity

**Date:** 2026-10-13
**Status:** ACCEPTED — independent-review corrections implemented on `codex/phase12-stage3-policy-intelligence` (uncommitted, review pending)

**Context.** An independent review of the Stage 3 patch identified issues that the first implementation did not cover. They are corrected within Stage 3 (no new milestone, no architecture redesign).

**Decisions.**

1. **Durable human-publication protection (P0).** `PolicyIntelligenceItem.publicationMode` (`automatic` | `human_protected`, plus `protectionSetAt`/`protectionSetByUserId`) is the explicit per-item protection state, additive migration `0028_phase12_stage3_r1_publication_protection.sql`. Any authorized lawyer publication (force publish/override or manual publish) sets `human_protected`. While protected, an eligible automated revision is still discovered, acquired, analyzed and verified normally, but the write path stores it as `review_required` (pending review), never moves the published pointer, never changes the item's published status or editor-approved source status, and the sync run reports the outcome as `held` with reason `human_publication_protected`. Unprotected items keep publishing automatically; automatic publication was not weakened globally.
2. **Editor-controlled exit and entry.** An authorized Policy Editor publishes a newer revision (force publish on the pending AI revision, which keeps protection on) or explicitly releases protection (`releasePublicationProtection` + `POST /api/policy-editor/protection`), which returns the item to `automatic` under audit; the release is idempotent and writes no duplicate audit row. Archive/restore never change the protection decision.
3. **Publication authority is verified-lawyer-plus-grant (P1).** `requirePublicationAuthority` requires (a) a verified identity (`emailVerifiedAt`), (b) `role === "lawyer"`, and (c) an active `PolicyEditorGrant` — checked in-transaction on every editorial mutation and on operator-URL submission. Administrator role alone never confers publication authority; administrators manage grants (`isAdministrator`, admin-only grant/revoke/list, only verified lawyer accounts are eligible targets) and monitor. Grants on customer accounts, grants on unverified accounts, revoked grants and administrator-only accounts cannot publish, and the negative cases are covered by unit and PostgreSQL integration tests.
4. **Editorial content integrity (P1).** The workspace loads and saves *all* stored source references (max 8, with citations and dates); narrative over-limit or missing-translation input is reported as a visible error instead of being truncated or auto-copied between languages; bilingual fields must be genuinely provided. Deterministic narrative ids are derived from the bilingual text so round trips are stable.
5. **Author-stated dates, kept distinct (P1).** The human revision contract adds nullable `officialSourceDate`, `commencementDate` and `reviewedAsOfDate`, stored and displayed separately from platform-observed official snapshot `sourceDate`/`effectiveDate`; the platform never infers or fabricates a legal date, and "no established commencement date" is an explicit display state.
6. **Provenance and request hardening (P1).** The server-derived editor identity (`editorUserId`/`editorEmail`/`editorRole`) is persisted in the audit trail independently of the lawyer-entered public byline, and the contract rejects bylines that impersonate an official government authority while keeping firm/team attribution possible. Request bodies are read under a real byte budget on the stream (not a trusted `Content-Length`), the legacy admin policy route no longer buffers an unbounded JSON body, and the same-origin (Origin + `Sec-Fetch-Site`) guard covers every editorial mutation.
7. **Audit and scalability (P2).** Draft saves record a bounded, reconstructible change set (old/new values, narrative added/removed/modified with previews and full-text digests), not just fingerprints; a retried create after editing the draft resolves to the same item (no duplicate manual entries); the editorial workspace paginates deterministically (bounded limit/offset with `hasMore`/`nextOffset`) instead of a hard 100-item cut; and an unreadable stored AI analysis no longer blocks human correction (the override editor opens a blank bilingual draft seeded only with official-source facts and explains why).

**Non-effects and safeguards.** Only the isolated disposable test database (`immigration_ai_phase12_stage1_test`) received migration `0028`; no owner development/staging/production database was migrated. Nothing was committed, pushed, merged or deployed; Gates 1–3 remain NOT ACCEPTED. Stage 2 continuity was re-verified against the Stage 3 schema.

## D-068 — Stage 3 R2 corrections: concurrent manual publication, lossless draft history, admin-UI/permission alignment, hold consistency

**Date:** 2026-10-13
**Status:** ACCEPTED — second independent-review corrections implemented on `codex/phase12-stage3-policy-intelligence` (uncommitted, review pending)

**Context.** A second independent review of `stage3-r1-full.patch` accepted the overall architecture (lawyer-final force publication, human protection, manual authoring, additive migrations 0027/0028) and required targeted corrections. They are implemented within Stage 3.

**Decisions.**

1. **Concurrent manual publication is rejected, never silently superseding (P1).** `createManualRevision` records the published revision the draft was based on in the existing `baseRevisionId`; `publishManualRevision` compares that baseline with the item's current published revision **under the item row lock** and returns the existing domain-level 409 `stale_publication_conflict` (detail `draft_baseline_superseded`) when another lawyer has published in the meantime. The initial unpublished manual draft keeps a null baseline, so first publication is unaffected. An isolated PostgreSQL integration scenario (published V1 → draft A → draft B → B publishes V2 → A publishes → 409 → V2 remains current, draft A stays a draft) is recorded.
2. **Lossless, bounded, durable draft history (P1).** New append-only table `PolicyIntelligenceDraftSnapshot` (migration `0029`) stores the *complete* validated document of every human draft save (create and each save), with `saveNumber`, `contentVersion`, a canonical `contentDigest`, `contentBytes`, the server-authoritative `savedByUserId` and a timestamp. Retention is bounded deterministically per revision (25 snapshots / 2 MB, newest never pruned; `planDraftSnapshotPrune`); pruning happens in the same transaction and only removes that revision's own oldest snapshots. `saveManualDraft`'s audit row keeps its bounded change *summary* and now links `snapshotId`/`snapshotSaveNumber`; the summary is explicitly documented as a preview-based summary and is **not** described as reconstructible history. An authorized editor retrieves the complete previous documents through `getDraftHistory` + `GET /api/policy-editor/drafts/history` (publication authority enforced) and the workspace offers a "load saved version" action. Published revisions remain immutable: their content stays in the revision row and later saves cannot modify them.
3. **Administrator UI and identity consistency (P1).** The Admin Policy Intelligence page no longer offers Archive/Restore controls (the route enforces lawyer publication authority and remains available for non-UI callers); it is now read-only monitoring plus grant management, with explicit copy pointing editorial actions to the Policy Editor workspace. Grant management (grant/revoke/list) additionally requires a **verified** administrator identity at the service level — an unverified admin receives `identity_not_verified` and `isAdministrator` is false for it; ordinary admins still never gain publication authority.
4. **Held-revision consistency for protected items (P1).** `saveHeldRevision` now uses `resolveHeldRevisionItemStatus`: on a `human_protected` item that already publishes an editor-approved revision, a newly held AI analysis no longer rewrites the item status to `review_required` (the held revision itself remains `review_required`, so the pending-review signal and the public currentness warning stay honest). Unprotected items keep the original hold behaviour, and automatic publication for unprotected items is unchanged. The integration suite covers V4-L protected → failing-verification hold → still `published` + protected + public with the pending-review signal + coherent archive/restore + workspace detail, plus the unprotected release-then-hold path.
5. **Concurrent manual creation is always controlled (P1).** Idempotent replay detection is unchanged, but item insertion is now conflict-free (`insertItemIfSlugAvailable` → `ON CONFLICT DO NOTHING` on the slug unique index): a lost slug race resolves to a deterministic alternative slug or the existing 409 `slug_unavailable`/replay outcome instead of an uncaught unique-violation error. Covered by unit tests, a service-level concurrent-create test and a PostgreSQL race test (two concurrent creates; identical same-author replays resolve to one item; the primitive returns `slug_taken`).

**Non-effects and safeguards.** Only the isolated disposable `immigration_ai_phase12_stage1_test` database received migration `0029`; no owner development/staging/production database was migrated. No commit, push, merge, rebase, force-push, deployment, AWS or Stripe change. Gates 1, 2 and 3 remain NOT ACCEPTED.

## D-069 — Stage 3 R3 security corrections: revoke can never grant, operator listing authorization, bounded recovery wording

**Date:** 2026-10-13
**Status:** ACCEPTED — third independent-review security corrections implemented on `codex/phase12-stage3-policy-intelligence` (uncommitted, review pending)

**Context.** Independent review of the R2 patch found one P0 permission defect and one P1 authorization gap, and asked that the draft-history retention be described honestly. Migrations 0027–0029 and the Stage 3 architecture remain unchanged.

**Decisions.**

1. **P0 — revoke can never grant (permission inversion).** The previous `upsertPolicyEditorGrant({ revoked })` inserted `revokedAt: null` and applied revoke semantics only through `onConflictDoUpdate`, so revoking a verified lawyer with no existing row **created an active grant**. Grant/revoke are now two explicit intents: `activatePolicyEditorGrant` (insert-or-explicitly-reactivate, reporting `reactivated`) and `revokePolicyEditorGrant` (**update-only** — a plain `UPDATE` that structurally cannot insert). Revoking a never-granted user returns the controlled outcome `not_granted` and creates nothing; repeated revocation returns `already_revoked` (idempotent); an active grant becomes inactive with `revokedAt`/`revokedByUserId` set; an explicit re-grant reactivates and reports `reactivated: true`. Both paths keep the server-authoritative admin actor identity, timestamps and durable audit events carrying the real outcome. Concurrency: the revoke's `UPDATE` takes the row lock, so a racing grant's `ON CONFLICT DO UPDATE` blocks and then re-applies its explicit activation — the stored state always reflects the last explicit admin intent, never an implicit grant, and no path throws on conflict.
2. **P1 — operator submission listing now authorizes.** `list()` previously authenticated the caller but returned the queue to anyone. Submission and listing now share one substantive authority contract (`requireOperatorWorkflowAuthority`): **verified lawyer account + currently active Policy Editor grant**, enforced inside the service (so the API route *and* the server-rendered page both pass through it). Ordinary customers, unprivileged lawyers, unverified lawyers, revoked Policy Editors and administrators without lawyer publication capability are refused with `403` (`publication_authority_required` / `capability_required` / `identity_not_verified`), while an authorized verified Policy Editor keeps the intended workflow. The admin/editor UI now reports the real grant/revoke outcomes (activation vs reactivation, revoked vs already-revoked vs never-granted) instead of implying a change.
3. **P2 — retention described honestly.** Draft history is documented and labelled everywhere (module docs, service docs, workspace UI) as a **bounded recovery window** (≤ 25 saves / 2 MB per revision, newest never pruned, older snapshots pruned automatically) — not permanent complete draft history. The retention design itself is unchanged.

**Non-effects and safeguards.** No schema or migration change in R3; migrations 0027–0029 were **not** applied to any new database (the isolated disposable test database already carried them). No commit, push, merge, rebase, force-push, deployment, AWS or Stripe change. Gates 1, 2 and 3 remain NOT ACCEPTED.

## D-070 — Admin Is Principal Lawyer and Has Inherent Policy Editorial Authority

**Date:** 2026-10-13
**Status:** ACCEPTED — owner-directed authority-model correction implemented on `codex/phase12-stage3-policy-intelligence` (uncommitted, review pending)
**Supersedes:** the part of D-065 (and its R1/R2/R3 restatements) that treated the administrator role as *never* conferring publication authority.

**Owner ruling.** The Admin account represents the law firm's **principal lawyer**, not a non-lawyer technical administrator. A **verified** Admin therefore holds complete Policy Intelligence editorial authority inherently. It needs no `PolicyEditorGrant`, and ordinary grant revocation can never remove that authority. The separate lawyer-grant system is retained for other staff.

**Corrected permission matrix** (role and verification are always read from the database actor row — never from session claims, client bodies, or forged grants):

| Account | Editorial / publication authority | Grant management |
| --- | --- | --- |
| **Verified Admin** (principal lawyer) | Full: manual authoring, draft save/publish, Force Publish override, archive/restore, publication-protection set/release, operator official-URL submission **and** queue listing | Yes (grant/revoke/list) |
| **Verified Lawyer with an active `PolicyEditorGrant`** | Same editorial/publication capabilities | No |
| **Verified Lawyer without a grant** | None (`capability_required`) | No |
| **Ordinary user** (any grant row included) | None (`publication_authority_required`) | No |
| **Unverified account (admin or lawyer)** | None (`identity_not_verified`) | No (for admins: `identity_not_verified`) |
| **Unknown / unauthenticated** | None (`unauthenticated`) | No |

**Implementation.** `requirePublicationAuthority()` and `canEdit()` in `lib/policy-intelligence/editorial-service.ts`, and `requireOperatorWorkflowAuthority()` in `lib/policy-intelligence/operator-submission.ts`, now short-circuit to allow a verified `role === "admin"` before the lawyer-grant checks; every entry point that already delegated to those helpers inherits the correction (manual create/draft/publish/revise, force publish, archive/restore, protection set/release, workspace listing, operator submit/list, `/policy-editor` page access). `isAdministrator()` still means grant management and remains verified-admin-only. The Admin Policy Intelligence page restores its audited Archive/Restore controls (now genuinely permitted) and the surrounding copy describes the principal-lawyer model. D-065's substantive rule is retained: human legal-editorial decisions take precedence over AI judgments, and all R1–R3 security fixes (verified identity, protection, revision-concurrency 409s, idempotency, lossless-bounded draft recovery, audit history, revoke-never-grants) remain in force.

**Non-effects.** No database or migration change; migrations 0027–0029 remain confined to the isolated disposable test database and were **not** applied to the owner's `chatbot` database by this task (owner-run one-time instructions provided). No commit, push, merge, deployment, AWS or Stripe change. Gates 1, 2 and 3 remain NOT ACCEPTED.

## D-071 — Durable and Compatibility Policy Content Coexist on the Public Page

**Decision.** The public Policy Intelligence page shows durable (database-backed) published policies **and** the bundled compatibility registry (`content/policy-intelligence/registry.ts`) at the same time. The merge is deterministic and slug-keyed:

- A durable published revision always wins for a matching slug (precedence); there is never a duplicate card for one slug.
- A slug whose durable item has **ever published** a revision but is not currently public (archived, withdrawn, held) is suppressed: an obsolete compatibility entry can never reappear as if it were current.
- A durable item that has only ever held drafts does **not** hide the compatibility entry (importing an entry must not blank the public card before the lawyer publishes).
- Compatibility entries stay visible before the first durable publication.

**Provenance.** Bundled entries keep their own honest label (`curated_reviewed` → "已审核的兼容内容（人工汇编，非官方原文）" / "Reviewed compatibility entry (human-compiled, not official source text)"). Manually compiled commentary is never presented as AI-verified analysis or as official/verified legal text.

**Import bridge.** A single compatibility entry can be brought under normal Policy Editor management through a controlled, idempotent action: verified Admin or granted lawyer only (database-authoritative), it creates a **draft** manual revision from the bundled entry (preserving source identity: authority, title, URL, source/commencement dates; attribution explicitly states it is a platform-compiled summary), reports an existing durable item with the same slug as `already_managed` instead of duplicating, audits the action, and never publishes by itself. The Admin page lists durable and compatibility content separately with explicit storage/provenance labels.

## D-073 — Minimal Structural Exclusion, Default Publication, Lawyer Final Authority

**Date:** 2026-10-14
**Status:** ACCEPTED — owner-directed correction, implemented on `codex/phase12-stage3-policy-intelligence` (worktree only).
**Builds on:** D-072 (no subjective AI publication veto) remains authoritative and unchanged in intent.

**Owner ruling.** The platform exists to publish Australian immigration policy developments promptly — enacted legislation, proposed reforms, consultations, announcements, future changes that have not commenced, official guidance and procedural change. AI gathers and explains; it does not decide whether an official update deserves publication. The owner explicitly rejects complex automated editorial screening. No new Event Admission architecture, keyword filtering, regex title classification, importance threshold, AI ranking gate or operator-approval queue may be introduced.

**1. Public visibility (P0).** `getPolicyPresentationGroup` is now a total function over the status vocabulary with three visible groups: `published` (in_force, published_guidance, announced), `proposed` (proposed, consultation) and the new `official_update` (enacted_not_commenced, superseded, withdrawn, unknown, and any future unmapped status). A published record can no longer disappear from `/intelligence` merely because its legal-effect status is `unknown`; the third group is rendered as “Official updates (not in force or awaiting confirmation) / 官方更新（尚未生效或待确认）”, appears in the status filter, and official updates always display their exact honest badge (“Legal effect not yet verified”, “Enacted, not yet commenced”, “Superseded”, “Withdrawn”) and are never labelled as legislation in force. No persistence or status-taxonomy change was needed (the existing domain model already carries `enacted_not_commenced`).

**2. Structural exclusion of presentation components (P0).** Minimal, deterministic and structural only:
- listing extraction ignores `<nav>`/`<header>`/`<footer>` regions, elements whose own `class`/`id`/`data-*` declares a structural display token (banner, masthead, hero, promo, carousel, breadcrumb, nav, menu, …), anchors with a presentational ARIA role or `aria-hidden="true"`, and fragment-only/`javascript:` navigation wrappers;
- Home Affairs alert items are excluded only when the source-provided `type`/`category` names a display component outright (`banner`, `site-banner`, `campaign-banner`, `advertisement`, `promotion(al)`, `display`, `navigation`, `menu`).
Titles, candidate text, AI opinions, uncertainty, proposed/consultative status, low importance and procedural topics never exclude anything; unknown values keep the candidate. Destinations are never blacklisted: a page referenced from substantive content (or another substantive alert) is still discovered, and the destination of an excluded component remains discoverable through the source's normal listing/sitemap strategies. **Limitation, stated honestly:** this handles structurally identifiable cases only; a URL referenced *exclusively* by a presentation-typed component, or a component whose own markup is indistinguishable from content, is not excluded. Some low-value content may still be published and can be archived by the lawyer.

**3. Source-first fingerprint stability (P1).** The source-first revision identity is now the snapshot plus the content kind (`computePolicyAnalysisFingerprint(..., { contentKind: "source_first" })`); the AI failure reason (`analysis_unavailable` vs `verification_unavailable` vs …) is diagnostic metadata only. Different failure reasons on the same snapshot therefore never create two source-first revisions. A later successful analysis still produces a distinct analysis revision that enriches the same policy without a duplicate public card. Revision history, archived-item suppression and human-protected publication semantics are unchanged.

**4. Provider failures vs programming errors (P1).** Recoverable, typed provider/model failures (timeout/abort, provider error, empty or invalid structured output, schema/type validation, model output citing unknown evidence) keep the source-first fallback. Unexpected internal errors (`analysis_internal_error`, plain untyped exceptions) remain genuine engineering failures recorded in the candidate-failure diagnostics — they are never silently converted into a normal fallback publication. Operator-disabled providers keep their explicit failure. The verifier uses the same rule (typed provider/output failure → source-first; unexpected internal error → failure). No new error-handling framework was added.

**5. Protections preserved.** D-065 human publication protection, D-070 Admin-as-principal-lawyer authority, explicit grants, D-071 compatibility registry/import, D-072's removal of subjective vetoes, all Admin/lawyer draft/publish/force-publish/archive/restore/override workflows, and official-source provenance requirements are unchanged.

**Testing.** Deliberately minimal and targeted: presentation-group/visibility assertions (product-copy + a source-first visibility case), three structural-exclusion cases in the discovery suite (chrome excluded, content kept, shared destination preserved, source-provided display type excluded, title text never used), source-first fingerprint stability, unexpected-error failure semantics, and the retained lawyer-protection suites. Plus the routine unit suite and production build. No live Federal Register sync, no paid provider experiment, no bulk discovery/publication run, no disposable database, no destructive integration run, no new browser suite.

**No migration required.** All changes are code-level (discovery regex structure handling, presentation groups/labels, fingerprint identity, error classification). No DDL, no new table, no new queue.

### D-073 owner-host correction — Admin Archive/Unpublish failed with `validation_failed` (2026-10-14)

**Observed:** the verified principal-lawyer Admin clicked `Archive / Unpublish` on the Manual, published, editor-protected policy `evisitor-application-arrangements-lin-26-061` on `/admin/policy-intelligence` and received `validation_failed`; the record stayed published and visible on `/intelligence`.

**Root cause:** `app/api/admin/policy-intelligence` (PATCH) dispatched on `body.action` and then forwarded the **entire** parsed body — including the routing field `action` — into `handleArchivePolicyItem`/`handleRestorePolicyItem`. Those handler schemas are strict (`{ itemId, reason? }` / `{ itemId }`), so the extra key failed `safeParse` and `invalidEditorialBody()` returned `400 { error: "validation_failed", detail: null }` before any authorization, service call or audit write. The unit-tested legacy `handleAdminPolicyIntelligenceUpdate` (whose schema *does* accept `{ itemId, action }`) is not wired to any route, which is why the suite passed while the browser failed. The Policy Editor workspace was unaffected because its dedicated `/api/policy-editor/archive|restore` routes post `{ itemId }` only.

**Correction:** the Admin dispatch is now the exported, testable `handleAdminPolicyItemAction` in `lib/policy-intelligence/editorial-api.ts`. It validates the composite payload **once** with a strict discriminated union (`{ action: "archive", itemId, reason? }` | `{ action: "restore", itemId }`) and re-presents only the handler payload to the shared handlers; the route is a thin delegation. No validation, authorization, CSRF, concurrency, protection or audit rule was weakened, and the strict schemas still reject unknown keys, wrong id types (e.g. a slug) and unknown actions.

### D-073 follow-up — Publish Official Source (lawyer direct publication of an official snapshot, 2026-10-14)

**Observed:** a real sync discovered/snapshotted 10 Home Affairs candidates (9 analysed, 8 full-analysis publications, 2 source-first, 0 failures), yet items such as `Migration (Student Visa Applications to Be Made from outside Australia) Instrument 2026` stayed `draft` with a stored snapshot and **no** analysis revision (`analysis_revision_unavailable`). The existing Force Publish path requires an AI analysis revision to override, so the principal lawyer could not publish an authentic official source that had no analysis. That contradicts lawyer-final editorial authority.

**Ruling:** an authorized editor may publish the item's persisted official snapshot directly, reusing D-072's source-first representation — no AI, no analyzer, no verifier, no publication gate.

**Implementation (reuses D-072's persistence representation, no new table):**
- `editorial-core.ts`: new `EditorialSourceSnapshotRow` + tx method `getSourceSnapshotForItem({ itemId, snapshotId })` (the item's `latestSnapshotId` when present, else the newest stored snapshot), `insertRevision` now accepts optional `schemaVersion`/`modelMetadata` (existing callers unchanged), and `officialSourceRevisionFingerprint({ itemId, snapshotId })` (snapshot + source-first contract only, so the unique `(snapshotId, analysisFingerprint)` index makes repeats idempotent).
- `editorial-repository.ts` / `editorial-memory.ts`: implement the lookup and revision fields (postgres query on `PolicyIntelligenceSourceSnapshot`; in-memory `sourceSnapshots` map + `seedEditorialSourceSnapshot`).
- `editorial-service.ts`: `publishOfficialSource({ actorUserId, itemId })` — `requirePublicationAuthority` (admin inherent / verified lawyer with an active grant), item row locked `FOR UPDATE`, archived refused (`item_archived`), no snapshot refused (`validation_failed: no_source_snapshot`), an identical already-published revision returns `unchanged` with **no** new revision or audit row, otherwise the previous published revision is superseded, a `source_first` revision is inserted (`schemaVersion: POLICY_SOURCE_FIRST_SCHEMA`, `modelMetadata.sourceFirst.reason = "lawyer_source_publication"`, `analysis`/`verification` null), the item becomes `published` with an honest `sourceStatus` (`deriveSourceFirstSourceStatus(declaredSourceStatusFromMetadata(snapshot.sourceMetadata))`; an unestablished legal effect stays `unknown`) plus `publicationMode: human_protected` and protection metadata, and one `publish_official_source` audit event records actor/timestamp/snapshot/previous state.
- `contracts.ts`: `PolicySourceFirstReason` gains `"lawyer_source_publication"`; `publication-diagnostics.ts` adds its operator explanation.
- `editorial-api.ts`: `publishSourceSchema` + `handlePublishOfficialSource`, and the Admin action union accepts `{ action: "publish_source", itemId }`; new editor route `app/api/policy-editor/publish-source`; Admin UI gains an inline-confirmed **Publish Official Source / 发布官方来源** button (shown when a snapshot exists and the item is not archived).

**Public effect:** `read-service` maps the stored `source_first` kind to provenance `official_source_update` with the official title/URL/dates and a verbatim excerpt and `analysisPending: true`; an `unknown` legal effect renders in D-073's `official_update` group with the badge "Legal effect not yet verified" — never as legislation in force. **Protection:** the same transaction sets `human_protected`, so the pipeline's existing hold branch stores any later AI revision as `review_required` instead of replacing the editor-approved publication; edit/revise/archive/restore/explicit release are unchanged and no lawyer-authored analysis is fabricated.

**Tests (focused, 6 new in `editorial-api.test.ts`):** Admin publishes a snapshot-only item with no grant and no analysis; granted editor publishes while plain lawyer / unverified admin / cross-site requests stay 403 with zero revisions or audit rows; the stored revision is D-072's `source_first` with `analysis`/`verification` null and no provider/model identity; idempotent repeat returns `unchanged` with no duplicate revision/audit; archived items stay archived; missing snapshot is a controlled 400; an explicit `declaredSourceStatus: "in_force"` is honoured while the default stays `unknown`; a held automated revision (the postgres hold outcome) cannot disturb the human publication or cause duplicates. Validation: `pnpm test:unit` **877/877 pass, 0 fail, 0 skip**, `pnpm build` **exit 0**, `tsc --noEmit` 44 (below the 45 baseline), Biome clean. No migration, no new table, no live sync, no paid call, no database mutation.

**Known limitation (stated honestly):** the in-memory pipeline repository is a test double and does not implement the `human_protected` hold that the production postgres repository enforces; the hold is therefore verified by code review plus the existing stubbed unit test and the owner-run isolated integration suite rather than by a new unit test.

### Behaviour record — Admin archive/restore regression evidence

The raw `{ itemId, action }` body forwarded straight into the archive handler still returns `validation_failed` (the documented root cause above); the Admin payload now archives a published, editor-protected Manual policy with no Policy Editor grant, preserving `publicationMode: human_protected` and `latestPublishedRevisionId`, and appends exactly one durable `archive_policy_item` audit event with the actor and previous status; Admin restore returns the item to `published` from its intact published revision with one `restore_policy_item` event; unverified admins, ungranted lawyers and cross-site requests remain 403 with no state change. D-071 compatibility suppression is unchanged (archiving keeps `latestPublishedRevisionId`, so the durability index still suppresses the obsolete bundled entry for that slug).



## D-072 — AI Must Not Hold Subjective Editorial Veto Over Official Policy Updates

**Date:** 2026-10-14
**Status:** ACCEPTED — owner-directed correction, implemented on `codex/phase12-stage3-policy-intelligence` (worktree only).
**Supersedes:** the subjective-AI publication-veto policy expressed by the pre-D-072 automatic publication gate (`evaluatePublicationGate`) and its downstream hold reasons.

**Owner ruling.** The AI must not possess subjective editorial veto authority over automatically discovered official policy updates. The product objective is timely publication of official Australian immigration policy intelligence — including proposals, consultations, announcements, bills, future changes, guidance and enacted laws. The previous gate repeatedly withheld information the principal lawyer considered valuable, producing prolonged periods with no newly published items; that is a product failure.

**Removed veto conditions (now advisory metadata only).** `publicationEligibility.classification !== "policy_relevant"`, `sourceStatus.certain === false`, `publication_eligibility_not_supported`, `source_status_not_fully_supported`, verifier disagreement about partial/uncertain interpretations, and evidence truncation no longer withhold an item. They are recorded as advisories (on the revision metadata and the sync-run telemetry), they may withhold individual unsupported prose units, and they may downgrade an unverifiable legal-effect status to `unknown`.

**Structural safeguards retained.** HTTPS official-source allowlists, SSRF and redirect protection, acquisition limits, provenance/snapshot identity, unreadable-source handling, deduplication and idempotency, archived-item suppression, durable human-publication protection, D-065/D-070/D-071, and the honest distinction between AI analysis, official-source notices and lawyer-authored content. `source_identity_incomplete` (which official source this content came from cannot be established) remains the only blocking condition; without it nothing is published.

**Two independent questions.** (A) Is the source an authentic, eligible official update? (B) What legal status, commencement, scope and effect can be established? If A passes, the item is ordinarily publishable even when B is partly uncertain. Uncertainty about future enactment is never treated as uncertainty about whether a consultation or proposal exists. Status is never upgraded: proposals and consultations are never presented as enacted, commencement dates are never invented, and an unestablished status is displayed as `unknown` ("Legal effect not yet verified" / "法律效力状态待确认"). `unknown` was added to the status vocabulary (no migration: the column is a plain varchar without CHECK constraints).

**Source-first publication fallback.** For authentic, readable, allowlisted sources the pipeline now publishes a minimal typed `source_first` revision instead of holding or failing when the analyzer is unavailable/invalid, when its output cites unretrieved evidence, or when verification is unusable: verified source identity and canonical URL, the official title, retrieval date, an available bounded verbatim official excerpt, explicit official-vs-AI-vs-legal-advice labelling, honest status, and a clear "AI analysis pending" notice. No analysis object, `keyChanges`, affected groups, dates or legal effects are fabricated to satisfy the analysis schema. A later successful analysis publishes a distinct newer revision of the same item (fingerprint includes the content kind) and therefore enriches the item without duplicating it or erasing the earlier revision; repeated identical runs remain idempotent. Provider-disabled runs still fail explicitly rather than publishing notices for every item.

**Publication metrics.** `publishedCount` remains the count of successful automatic releases and `sourceFirstPublishedCount` (stored in the existing sync-run metadata JSON, no migration) is the subset published source-first; `fullAnalysisPublishedCount = publishedCount − sourceFirstPublishedCount`. `heldCount` now counts genuine technical holds and human-publication protection only. Analyzer/verifier warnings are recorded in `candidateWarnings` (bounded) and are never reported as failed publications. The Admin sync-run table and the item diagnostics panel display the split and the advisory breakdown.

**Non-effects.** No schema migration (the new `contentKind = "source_first"` value and the `unknown` status are type-level varchar enums). No commit/push/deploy. Gates 1–3 remain NOT ACCEPTED.


**Rationale.** Owner-host browser acceptance found the public page and the Admin page sourcing different data (compatibility-only public list vs durable-only admin list); the exclusivity was a genuine product inconsistency, not an intended state. Existing schemas and editorial services are reused; no parallel publishing system was added, no migration is required, and no existing local database record is mutated by the import (it only creates a new draft).

## Owner-selected normal local development workflow (Phase 12 Stage 3 acceptance)

The owner rejects an extra disposable database and a non-standard port for ordinary manual browser acceptance. The canonical local acceptance environment is the existing repository-local setup:

- PostgreSQL database: **`chatbot`** on the existing local server (the repository's normal `POSTGRES_URL` target).
- Website: the existing local dev server on **port 3000**.
- Accounts: the **existing local user accounts** (no extra generated test accounts).
- Documents: the existing local-test S3 bucket `immigration-ai-localtest-documents-747452892291-ap-southeast-2`, AWS profile `aulawyers-staging`, region `ap-southeast-2`.

Rules: do not clone the database and do not create extra accounts for ordinary browser testing. The isolated `immigration_ai_phase12_stage1_test` database remains acceptable **only** for destructive automated integration tests. Migrations are applied to `chatbot` once, by the owner, with the preflight/acknowledgement flow documented in `CURRENT_HANDOFF.md`.
