# Phase 15 — Guided Project Workflows, Durable Project State & Global AI Assistant

**Date:** 2026-11-21 (Australia/Sydney)  
**Owner decision:** Five-milestone Phase-15 plan APPROVED; documentation/branch setup AUTHORISED.  
**Implementation:** NOT STARTED. No M1 Codex task packet or implementation prompt has been issued.  
**Branch:** phase15-guided-project-workflows  
**Base:** phase14-b-project-document-cross-chat @ f23094b3dda90d304db81f99401a44dfc3e3e8ac  
**Release:** LIVE_PRODUCTION_NO_GO remains. A planned engineering milestone is not a live customer capability.

## 1. Why this phase exists

Recent owner screenshots and lawyer/customer-workflow feedback show three fundamental product problems:

1. A Project Home and School Application page expose numerous technical states but do not answer a customer's first question: where am I, what should I do next, why, and who acts?
2. A customer may have already entered school/course/application data, yet a new Chat inside the same Project behaves as if the project is blank. Prompting only with confirmed Project Facts and authorized document excerpts does not amount to full project awareness.
3. One fixed School → Admissions → Student 500 route cannot represent DIY applications, a customer who already has an external Offer or CoE, a visa-only engagement, several simultaneous school applications, or agent-mediated school admissions.

The owner additionally requires the assistant to understand the project as a whole, use current and relevant official school and Australian migration material, answer arbitrary project questions, selectively elicit missing facts only after the user expresses an intent, and—with explicit preview and confirmation—help update real business drafts. The signed-service workflow must serve direct school agents, external Australian first-tier agents and possibly domestic Chinese referral/preparation partners; DIY users must keep a viable separate route. AI should lower the training burden for responsible English-capable domestic staff, without substituting for authority, consent or real-world evidence.

**Phase objective:** One durable, authorized project state drives both the customer workspace and a capable project-wide assistant. The assistant can explain and act on that state (only through authorised, confirmable operations), with a visible, branching work journey and staff/partner workflows. This is not a chatbot-only UI rewrite.

## 2. Five integrated milestones

| Order | Milestone | Primary product outcome | Acceptance owner |
| --- | --- | --- | --- |
| **M1** | Durable Project State & Progress Engine | Project status survives chat closure and reflects authorized business changes and dependencies | Owner + technical reviewer |
| **M2** | Global Project AI Assistant & Official Intelligence | Any new Project Chat can answer open-ended project questions and reason from current records plus relevant official sources | Owner + legal/domain reviewer where material |
| **M3** | Central Guided Workspace & Confirmed AI Actions | Main canvas shows the applicable journey; chat and UI update the same real drafts following explicit confirmation | Owner + UX reviewer |
| **M4** | DIY, Engagement Scope, Partner Routes & School Handoffs | Each school application follows the correct DIY/direct-agent/first-tier-agent route with real forms, roles and receipts | Owner + business/lawyer reviewer |
| **M5** | Domestic Staff Copilot & Integrated Acceptance | Assigned workers can handle normal intake with less re-entry, while the client sees trustworthy progress | Owner + new worker + business/lawyer reviewer |

These are exactly five substantive milestones, NOT dozens of micro-phases. A bounded correction may be accepted within the same milestone when evidence shows a main-path, data-integrity, legal or authorization defect; do not start indefinite cosmetic subprojects.

### M1 — Durable Project State & Progress Engine

**Goal.** Establish a backend-owned, persistent and reproducible account of what the Project and each individual application are trying to achieve, what has happened, what remains, who is responsible, what is blocked, and what evidence supports that conclusion. The state must be correct even with no active chat.

**In scope.**
- Define canonical ownership of project goal, service scope, each School/Admissions/Student 500 application, stage, dependencies, current status, responsibility, missing requirements, authorized next actions, status history, timestamps and provenance. Project-level overview must compose several applications without silently merging their private records.
- Reuse existing Study Journey Project, School Application, Admissions, Student 500, Project Facts, versioned submission packages, review/operation/events and authorization boundaries. Prefer a typed projection/reducer over these records rather than inventing a second mutable source of truth.
- Distinguish draft / user-reported / confirmed / document-supported / external receipt / professionally reviewed; distinguish no data from unavailable data, conflicts, inapplicability, waiting, and blocked. Never equate generated package, agent acknowledgement and school receipt.
- Recompute affected progress/next steps after permitted draft edits, file/version invalidation, partner actions, official requirement changes where evidenced, authorization revocation and staff/customer updates. Preserve idempotency, CAS/concurrency controls, independent per-school identities and readback after restart.
- Expose one permission-aware state and drill-down contract that M2 and M3 can both consume. A valid visa-only or externally obtained Offer/CoE path must not require a platform-created School Application.

**Acceptance.** Synthetic Project A contains two school applications plus a visa matter. With chats closed, change intake date in school A using a normal business route; after readback and process restart, A's dependent package becomes stale, B stays unchanged, actor/waiting status is accurate, and history explains why. Retry the same operation and test concurrent edits. A visa-only Project can mark School Application not applicable and proceed to the actual prerequisites; access revocation changes the next read. No false success when source data or authorization is absent.

**Exit:** M1 engineering evidence + owner review. Does not imply the future assistant, visual route, or live deployment is ready.

### M2 — Global Project AI Assistant & Official Intelligence

**Goal.** On any new conversation inside a Project, answer the user's open-ended questions in the context of the whole authorized Project—not merely the chat transcript or the handful of facts that happened to fit a static prompt.

**In scope.**
- Resolve authenticated actor + persisted ProjectConversation/Chat owner at the server; retrieve from M1 the overview and query-relevant details: school applications, dates, materials and versions, Student 500 status, progress, blockers, event history, assigned responsibility, authorized facts and documents when trusted.
- Use bounded on-demand retrieval rather than placing all raw project data in every prompt. Separate project truth, user assumptions, proposed changes, official rules, and conclusions. Refresh authorization and material state before the provider; preserve existing distinct Fast / Legal Check / Premium contracts and no cross-Project/Standalone/staff-private leakage.
- Support natural questions such as “Which school is waiting?”, “Why ask for the same transcript again?”, “What changed since last week?”, “What if I defer a semester?”, “What can I do while the agent is waiting?”, and “Does current policy affect this pathway?”. Clarify which application only when ambiguity materially affects the answer.
- After the user first states intent/facts, intelligently search/recheck relevant **official** university/CRICOS/education and Australian migration sources, including versions, source dates, commencement, transitional cases and official uncertainty as relevant. Do not interrogate the user on entry. Ask only impactful missing questions, cite actual applicable evidence, and flag unavailable/stale/conflicting sources. A plan or earlier retrieval is not permanent proof of current law.
- Proactively suggest *questions or next actions* within the active interaction, without unsolicited notification loops or unauthorized edits. Offer a precise contextual lawyer consultation/message when domain-specific professional judgment is needed; public advice and a contracted lawyer's response remain separate.
- Persist only the appropriate verified/confirmed state via M1; hypothetical analysis must never mutate the application. M2 can recommend draft changes but actual write-back is gated until M3.

**Acceptance.** A fresh Project Chat, with no previous thread context, correctly answers multi-school status, duplicate document request, deferred intake impact, responsibility and policy questions using source identity. Test with owner-created paraphrases not copied into prompts. Hypothetical “what if” makes no DB writes. Run one official-rule-update scenario and one official-source-unavailable scenario with honest answers; revoked member, unrelated Project and standalone chat do not see private state. Material legal claims require the existing evidence/safety paths.

**Exit:** Owner accepts truthful project-wide assistant behavior in bounded test scope; no assumption that all legal sources are complete or current without real checks.

### M3 — Central Guided Workspace & Confirmed AI Actions

**Goal.** Make the main content area—not a narrow left rail—the primary guide to the user's entire applicable journey, while enabling chat-led clarification and safe work on the underlying forms.

**In scope.**
- Main canvas renders a large, accessible, responsive, branching step graph with arrows, status text and color+icon semantics for complete, active, waiting on person, blocked and not applicable. Current step expands to tell the user what it is, why it matters, who acts, and the one most useful next action; parallel School A/B and visa activity remain visible. Sidebar remains for navigation.
- Use exactly M1's permissioned state and M2's assistant context. Project Home, application detail, chat and refresh must agree. External Offer/CoE, visa-only and DIY routes are real graph alternatives, not fake “skip then blocked later” behavior.
- Convert uncertain natural inputs (e.g. “university of wolloongong” and “computer vision”) into sourced school candidates and *proposed* updates. Correct spelling only after user approval; preserve “computer vision” as an interest until an actual course is selected. The target Project, specific application, field, prior value, suggested value and implications are previewed.
- For any proposed mutation, require affirmative confirmation, use existing business services and idempotency/revision checks, report success only after persistent readback, and invalidate dependent versions/steps as appropriate. Cancellation, stale page, concurrent changes, retries and partial errors fail safely. The assistant must never write a different school's record from a vague reference.
- Add context-aware request-a-lawyer entry where available, with recipient/visible content preview and actual permission and engagement checks. Do not promise an unimplemented lawyer chat feature.

**Acceptance.** First-time desktop/mobile users locate the active application, the responsible party and next step without explanation. A mistaken university name is clarified and correctly saved to one application, and project home/new chat show the same value. Test multi-school same-field input, no-confirm/no-write, stale edits, retry, switch, unavailable records and unassigned lawyers. The screen must never show a fake submitted/approved status.

**Exit:** UX + real DB-backed action acceptance; no claim of broad legal/professional authorization.

### M4 — DIY, Engagement Scope, Partner Routes & School Handoffs

**Goal.** Model how a **specific application** is served and passed between parties. Contracted services and partner resources must not be assumed for DIY users.

**In scope.**
- Distinguish independent service engagement per scope/application: DIY school application with optional visa-only engagement; signed Managed school service; our direct school representation; or use of an external Australian first-tier school agent. A domestic Chinese partner can participate in *prior* student intake and document preparation alongside the latter two contracted channels.
- A dedicated partner registry records organization type, school representation, valid period and school/channel-specific stamped application form/version. Each application references its approved route, materials and delivery target; an applicant may pursue different schools via different channels. Reuse M4/M5/M8 engagement/package/handoff sources with actual permission checks, not an uncontrolled partner database.
- Draft creation, preparation and internal review may proceed without a universal “partner + lead lawyer double signature”. Never silently equate ordinary School admission review with a mandatory lawyer legal opinion. Signatures, sharing, explicit external transfer, professional advice and contract obligations require per-action scope and accountable authority. Precise external-form stamping and approval rules remain subject to business-owner confirmation; no assumed grant.
- Record the exact package revision, form revision, actor, recipient and evidence for each transition: prepared → sent to first-tier agent → agent acknowledged → school acknowledged → actual school outcome. These are not equivalent statuses. Direct representation and DIY paths have their own valid submission/receipt transitions; no fabricated receipts.
- DIY users can follow published school instructions, prepare drafts and log external proof without seeing contractual partner resources. Converting DIY to Managed requires a confirmed contract/scope/consent before sharing old drafts.

**Acceptance.** With desensitized examples from the business owner, run direct-agent School A and first-tier-agent School B, including one domestic intake partner. A visa-engaged customer self-manages school applications without being blocked. A user asks “Has the school received it?” when only the agent's acknowledgement exists; response says exactly that the agent received it and the school receipt is unverified. Wrong/expired form, wrong recipient, withdrawn grant and unsigned disclosure all block the affected external action only.

**Dependency still pending:** Business owner/lawyer must confirm actual stamped-form acquisition workflow, authorized signatures, precise external-handoff rules, and provide one anonymized sample of each channel before those exact rules are frozen. Phase 15 planning may proceed without inventing that answer.

### M5 — Domestic Staff Copilot & Integrated Acceptance

**Goal.** AI-assisted staff can carry out routine document collection and school application preparation with lower experience demands, while escalation, authorizations and client visibility remain reliable.

**In scope.**
- Role- and assignment-scoped staff queue: needs verification, waiting for student, ready for team, and requires business/lawyer escalation. Show relevant original material beside AI-extracted/proposed values, differences, freshness, source location and client consent.
- Draft bilingual outreach, missing-document requests, status follow-ups and handoff summaries. Human sends through an authorised channel after checking; student response updates the precise Project/application tasks and de-duplicates reminders. Do not grant staff broad member-wide access or lawyer authority merely because they are partners.
- Run three consolidated end-to-end journeys: (a) DIY school selection, official research and confirmation, (b) multiple schools + Student 500 or external Offer/CoE, (c) domestic intake → internal preparation → Australian partner/direct delivery and actual receipts.
- Baseline and compare time to next action, redundant questions, manual re-entry, minutes per correct package, rework, field correctness, missed exceptions and harmful unauthorized steps. The owner/business reviewer defines reasonable targets before comparing. The scenario is passed only if the novice worker knows when to escalate and can finish a correct handoff.

**Acceptance.** One responsible English-capable novice runs anonymized synthetic tasks without expert coaching and produces an accurate reviewable package, with less duplicate work than baseline. Client home and a fresh Project chat reflect relevant changes. All paths test privacy, role access, impersonation, cross-project separation, accidental legal conclusion, absent partner receipt and cancellation. Record separately what was verified offline, in a disposable PG database, in browser, by staff/lawyer, and in AWS.

**Exit:** Integrated engineering + user/business acceptance report; *separate* owner release/production authorization required.

## 3. Cross-cutting engineering and legal invariants

1. **Truthful state:** a persisted source-of-truth and reproducible derived progress; do not create a second mutable AI-owned status database, imaginary deadlines, receipt, lawyer approval, or universal linear workflow.
2. **Scoped privacy:** current actor, Project, individual Chat ownership, application, service engagement, document version and grants determine access. Authorized Project-wide awareness is not unlimited access to raw customer or partner material; one Project cannot read another.
3. **Mode preservation:** existing Fast/Legal Check/Premium serving, legal evidence/checker boundaries and bounded provider contracts remain distinct unless separately approved after evidence. Existing premium direct research is not forcibly routed into Default's local RAG.
4. **Honest knowledge:** official/current school and immigration sources have provenance, dates and applicability conditions; uploaded content and customer-reported facts are not law. Unknown/uncertain data remain explicit, subject to professional review where required.
5. **Consent and writes:** AI suggestions are not edits. Preview + explicit authorized human confirmation + idempotent transaction + readback are required before material draft changes or disclosure. Distinguish user fact confirmation from lawyer approval and external receipt.
6. **Conditional workflows:** DIY, Managed, already-offered, already-CoE, visa-only, parallel schools and foreign/domestic partner involvement are independent dimensions. A step is required only if its business/legal prerequisites actually apply.
7. **Fail closed on existing gates:** Phase 13/14 limitations remain, including trusted Project Documents DENY without authenticated clean-scan production issuer, M4 professional/contract authority gaps, M6 legal coverage PARTIAL, M8 staff-private-package permission pending, and Post-M5 E2E limitations. Implementation or flag change alone is NOT an authorization to clear them.
8. **No silent external operations:** No real school, agent, immigration, payment, document transfer, lawyer message or governmental submission without a separately approved authenticated action and required consent.
9. **No unnecessary rewrites:** Reuse current Next.js/Drizzle/PostgreSQL 17, FastAPI, Project foundation, School Admissions, Student 500, Project Facts, Policy/Education Intelligence, Case/Review and existing account/billing flows. Do not replatform the backend or replace legal inference architecture to implement UX.
10. **Verification truth:** unit PASS ≠ PostgreSQL PASS ≠ browser PASS ≠ staff pilot PASS ≠ production release. Fixed 5 milestones, bounded tests and explicit carryover blockers; no endless task fragmentation.

## 4. Scope & authorization at this planning checkpoint

- **Authorized now:** Create the Phase-15 branch and write/update repository planning, state, decision and handoff documentation. Owner reviews and locally synchronizes.
- **NOT authorized now:** Codex/Cline implementation, issuing the M1 implementation prompt, source changes, schema/migration creation or application, data writes, feature flag changes, paid provider calls, real customer materials, partner/Stripe operations, AWS or production rollout.
- After owner inspection, only the owner's separate instruction will authorize an M1 implementation task packet/prompt and subsequent execution. Later milestones are gated on the owner accepting preceding evidence; they are not pre-authorized merely by this roadmap.
- Base branch is a recorded planning starting point, not a claim that Phase 14-B production trusted file operations are accepted. A future engineering start should recheck Git ref, actual code/tests, local dirty worktree and production restrictions.

## 5. Repository authority, validation and review procedure

- Primary authority: [AGENTS.md](../../AGENTS.md), [DECISIONS.md](./DECISIONS.md), and this Phase-15 plan. This roadmap is a **product/milestone contract**, not executable Codex instructions.
- Baselines: [Phase 13 roadmap](./PHASE13_STUDY_JOURNEY_ROADMAP.md), [M5 school admissions integrated plan](./PHASE13_M5_SCHOOL_ADMISSIONS_INTEGRATED_PLAN_2026_10_30.md), [M10 acceptance report](./PHASE13_M10_CONSOLIDATED_ACCEPTANCE_REPORT_2026_11_10.md), [Phase 14-B contract](./tasks/PHASE14_B_PROJECT_DOCUMENT_FACTS_CROSS_CHAT_CONTRACT_2026_11_11.md).
- Relevant source families to inspect when implementation is separately commissioned: chatbot/lib/{projects,workspace,school-applications,school-admissions,student-500,project-facts,project-documents}; chatbot/components/{immigration-ai-workspace,project-workspace-home}; legal-service/app/services/project_context.py and schemas/query.py. File paths are navigation hints, not proof that a given capability has passed live acceptance.
- Normal implementation workflow *later*: owner-approved bounded M1 scope → coding-agent patch/tests, no autonomous push → independent review → owner local/isolated validation → owner-approved commit/push → independent remote SHA check → explicit milestone acceptance. Follow the actual repo state and migration/test target guard; do not assume old handoff prose is current.
- Current Phase-15 status must always be the newest dated section of CURRENT_MILESTONE, CURRENT_HANDOFF and PROJECT_STATE. Historical “not started” or “pending commit” narratives from older branches are snapshots, not live status.
