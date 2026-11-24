# Phase 15 M3 Extended — Multi-Workflow AI Interactive Workspace

**Date:** 2026-11-23 (Australia/Sydney)  
**Decision:** Owner-approved **M3 planning amendment**, within the existing five-milestone Phase 15. This document establishes the target UI and E1–E4 delivery sequence; it does **not** authorize code execution, migrations, model calls, production flags, Git deployment, or M4/M5 execution. Codex prompts will be issued separately by the owner.  
**Repository / branch:** \`jiangdizhao/immigration_ai\` / \`phase15-guided-project-workflows\`  
**Committed implementation baseline when this plan was written:** M1 at \`6b7c531ee2839e9a955dfd992b5e19a560fa6064\`. M2, M3-01 (Composer/Premium reliability), and M3-02 (initial central journey) have been implemented in the owner's **uncommitted local working tree**, not integrated into this remote baseline. M2 owner acceptance and M3-02 authenticated-browser acceptance remain pending.  
**Release:** \`LIVE_PRODUCTION_NO_GO\`.

**Governing roadmap:** [Phase 15 five-milestone roadmap](./PHASE15_GUIDED_PROJECT_WORKFLOWS_ROADMAP_2026_11_21.md). M1, M2, M4 and M5 keep their original responsibilities; M3 is extended, not replaced by a new milestone.

## 1. Product intent and prototype interpretation

The lawyer/business owner's source is the document **《总的框架 law ai》**, illustrated with three **school-application** screens: (1) project planning/starting information including an existing Offer, (2) detailed university/course search and comparison, and (3) an illustrative funding-material document/revision workspace. The source says the left side is a persistent step guide, the centre is a step-aware AI conversation, and the right side is a changing, task-specific operating area. The detailed admissions-preparation/funding procedure is **not yet frozen** by that document. The screenshots' counts, generated documents, approvals, source assertions and completed operations are demonstrations, not evidence that the current product can perform them.

**Owner clarification:** These screens are an **example of a School Application Project**, not a template that must be copied for a **Student 500 Visa Application Project**. Both must use the same interaction framework but have **different workflows, applicability and task-specific right-hand tools**. A Project may also have two concurrent School Applications and a Student 500 matter; a visa-only or external Offer/CoE path must work without a platform-created School Application.

**Primary outcome:** Replace the M3-02 graph-centric Project Home as the user's main interaction with a usable **three-region, step-aware AI workbench**. Reuse the M3-02 deterministic projection, navigation and provenance logic where valuable rather than discarding it.

## 2. Universal interaction shell — shared across workflow profiles

The same shell serves School Application, Student 500 and genuinely composed Projects:

1. **Project header (always visible):** authoritative Project name/identity, short task-context message, **top-right overall progress indicator** (completed/known-applicable count and a progress bar only when justified) and a distinct **“查看项目进度 / View Project Progress”** action. That action opens the complete, status-grounded dependency/progress view without losing the current chat or right-side work.
2. **Left stage rail:** compact ordered and **branch-aware** steps: complete, active, waiting, blocked, not applicable, unknown and available-to-work-in-parallel. Show the actual selected step and current responsible actor when supported. It is navigation, not the only place where work happens. A project's step list comes from its applicable workflow profile(s), not a universal School→Admissions→500 checklist. The rail remains usable on mobile via the existing sheet/navigation pattern.
3. **Centre AI conversation:** one persistent conversational controller with **active step + business-target context** layered on top of M2's project-wide authorized context. Step-specific conversations/bindings may be used where supported, but the agent retains project awareness and can handle cross-step questions. The M3-01 Composer stays spacious, multiline and free of permanent help/unavailable-file messages. Attach the currently referenced field/document/version as a concise context chip where genuinely available.
4. **Right dynamic task panel:** selects a real, authorized business tool by workflow kind, active step, specific application or visa matter, service capabilities and read/write authority—not just by a generic tab. It may show an onboarding form, sourced course search/compare, requirements, GS draft, finance file/revision viewer, proposal preview or available professional handoff. When the necessary service is unavailable, show an honest read-only/unavailable state instead of fabricated buttons or outcomes.
5. **Draggable divider between centre and right:** pointer/keyboard-accessible splitter, min/max widths, no text overlap, and saved **client-only layout preference**. The user can widen the right for comparison/document work or widen the centre for long AI answers. Dragging must not remount chat, lose drafts or issue business writes. On small screens, use accessible chat/work tabs or a responsive sheet, not an unusable tiny splitter.

The user's desired visual hierarchy is the lawyer prototype's compact left journey, substantial AI conversation, substantial dynamic right workspace, and top progress strip. Follow its interaction philosophy, not fictional screenshots' state claims.

## 3. Domain model — Project, workflow profile, business matter

- **Project** is the customer's overall, authoritatively recorded goal/scope and owner/member boundary. Project display name or a single school record alone **does not** prove purpose. Current M1 \`project.purpose\` remains \`unknown\` until an accepted source of confirmed goal is introduced.
- **Workflow Profile** is a versioned, conditionally applicable set of steps and business tools, e.g. \`school_application\` and \`student_500\`. Multiple profiles may be composed within one Project **only** when authorized business facts support that relationship; separate Projects of the same user must never auto-merge.
- **Business Matter** is an actual School Application, Admissions Case, Student 500 Application/preparation, document/version, service engagement or permitted Project Fact, with stable identity, provenance and independent revisions.
- **Selected Step Context** binds user-facing navigation and the answer/tool target to \`projectId + workflowKind + stepKey + targetKind/targetId + optional artifact/version\`. Selection is not proof that an operation is allowed; all reads/writes reauthorize on the server.

The **workflow engine is a deterministic projection/registry over M1**, not a second mutable LLM-authored Project State or an invented new legal-rule engine. Whether new goal/task records or a migration are truly necessary must be justified by an E2 contract review and separately authorized.

## 4. Initial workflow profiles (product templates, not universal legal checklists)

### 4.1 School Application Project — based on the owner's example

| Candidate step | Right-side workspace | Conditional behavior |
| --- | --- | --- |
| Planning / starting point | Existing Offer/CoE, desired study, location, study goals, known background; editable confirmed fields | An existing verified/reported Offer/CoE may bypass school discovery; show evidence/provenance honestly |
| School and course discovery | AI-assisted university/course search, official links, region/degree/specialty/budget filters, favorites and **course-level** comparison; select actual course | Research interest (“computer vision”) is **not** a registered course; unverified intake/tuition remains unverified |
| Admissions/academic readiness | School-specific requirements, GPA/transcripts, document status and timelines | Per application; School A and B must remain independent |
| Language preparation | Requirement, evidence and examination planning when applicable | Not every user or program needs the same task |
| Finance/document preparation | Requirement context, uploaded materials where authorized, versions, missing items and proposed changes | Do not promise upload/review or a generated v3 when Project Document capability is unavailable |
| Statements and application documents | Actual application-specific drafts and revisions, where a supported service exists | Lawyer approval and external provider receipt are separate states |
| Pre-submission preparation | Accurate readiness, missing items, allowed next actions and real channel | A prepared package is neither proof of submission nor university receipt |

This is a **workflow starting catalog**, not a fixed seven-step denominator or imposed sequence. Many tasks can run in parallel; admission routes from external Offer/CoE are first-class.

### 4.2 Student 500 Visa Application Project — first-class independent workflow

| Candidate step | Right-side workspace | Conditional behavior |
| --- | --- | --- |
| Visa planning / personal circumstances | Current visa, location, declared history, intended study and route | No forced School Application entry |
| Study evidence and CoE | CoE/offer identity and validity/freshness, institution/course/intake and source | May link to School/Admissions **only when recorded**; external CoE and visa-only routes are valid |
| Genuine Student preparation | Applicable GS questions/notes, evidence consistency, customer draft/version review | A generated draft is not a verified or professionally approved statement |
| Financial capacity | Applicable financial evidence questions, authorized material list and gaps | Requirements and amounts depend on current official sources and case facts |
| Conditional supporting requirements | English, OSHC, identity, health, character and other **applicable** items | Never turn illustrative list into a universal, conclusively required legal checklist |
| Pre-lodgement check | Known conditions, unresolved applicability, stale documents, user/professional review | Does not imply government eligibility or approval |
| Lodgement and subsequent events | Actual external lodgement reference, requests and verified status where recorded | Do not claim submission, visa grant or receipt from a local draft |

This profile uses the **same centre AI / dynamic right workspace / progress header / step-aware context**, but its own tools, dependencies, wording and task applicability. It does not inherit university search as a required first step.

### 4.3 Composed, alternative and unknown cases

Test two parallel schools plus Student 500 in one Project, DIY school work with a visa-only engagement, existing Offer or CoE, stand-alone visa-only, closed/archived, and unknown goal. Unknown purpose triggers honest planning/confirmation, **not** an automatic School workflow. If one source is restricted/unavailable, retain known data from other sources and label uncertainty; do not reinterpret missing data as no work.

## 5. Backend and AI integration — incremental only

### M1 extension (E2; keep M1 source-of-truth)

- Reuse \`phase15.project-state.v1\`, its actor authorization, source capabilities, revisions, issues, next actions, and bounded source reads. Add **versioned goal/workflow/task-progress projections** on top; do not rewrite M1 or auto-create new canonical status storage.
- Derive task applicability and complete/active/waiting/blocked/unknown states **from business facts and approved rule definitions**. Stage display alone is not evidence of completion.
- The top progress denominator is **only known-applicable tasks** under a named workflow-definition version. Unknown applicability, unreadable tasks, conditional tasks and excluded/not-applicable tasks must be counted or labeled separately. Show \`completed / applicable\` and a percentage only when coverage is sufficient to avoid false completeness; otherwise show “progress not fully determined” and the known partial counts.
- An actual confirmed Project goal may require a minimal persisted contract. Current M1 marks purpose \`unknown\`; do not infer and silently persist from the name. Determine whether existing Project Facts/other accepted service can own it before proposing a migration.
- Preserve scoped, independent multi-school record identity, external Offer/CoE routes, original source revisions, history truncation, staleness and capability limits. E2 must measure and test full-state read costs.

### M2 extension (E3; preserve native research and three modes)

- Preserve M2's Project Context Broker and existing **Fast / Default / Premium**, including native Agentic Web Search and applicable legal evidence/citation mechanics; do not build a separate AI stack, compulsory intent router or static public crawler as a prerequisite.
- Supply **ActiveStepContext** as a strictly server-resolved, bounded overlay. The assistant understands the current step, exact target and permitted relevant draft/artifact while retaining whole-Project context. Changing step must not cross Project or authorization boundaries or silently erase conversation history.
- Add a typed, grounded **research-candidate presentation contract** for the right side: school + concrete course + real source identity/URL + observed fields + currency/verification status. Model-generated candidates do **not** become confirmed official course/catalog records or saved selections without authorization.
- Add a typed, **non-executing modification proposal**: exact Project and business target, field, old value, proposed value, source/assumption, base revision, affected dependencies and confirmation status. An LLM cannot write business tables by inventing a tool call or JSON.
- Real provider response quality must be evaluated separately from mocked contract integrity; existing Premium timeout/recovery optimizations remain in force.

### M3 interaction and business writes (E3)

- Implement step-aware right-panel selection and two-way conversation↔form/document navigation.
- Proposal → visible diff/target → **explicit user confirmation** → existing authorized business Service with CAS/revision + idempotency → durable readback → refresh the workflow, progress, right panel and AI context. Cancel, stale view, conflict, wrong application, revoked access and retry must not cause unintended writes.
- Complete at least one supported **School Application field update** and one supported **Student 500 draft field update** against the isolated synthetic DB. If an authorized Student 500 write route does not yet exist, the smallest specifically justified service extension needs its own approval; do not bypass the business layer.
- AI may draft/research/compare without applying changes. Files/GS drafts and professional interactions are available **only** if the underlying accepted versioned/document/review services allow them. Project Documents currently remain fail-closed in unavailable environments.

### M4/M5 unchanged

M4 remains responsible for DIY versus Managed engagement, partner routes, external school-agent forms and actual handoff/receipt authority. M5 remains responsible for staff copilots, role/assignment queues and comprehensive organizational acceptance. M3 Extended must not invent partner privileges, perform external submissions, send lawyer messages or certify professional review.

## 6. Interface contracts to freeze during E2/E3

Illustrative, **not** a final migration or API declaration:

- \`WorkflowDefinitionV1\`: \`kind\`, \`version\`, \`stepKey\`, \`panelKind\`, conditional applicability rule ID, target types and grounded dependencies.
- \`WorkflowTaskProjectionV1\`: \`taskId\`, \`projectId\`, \`workflowKind\`, \`stepKey\`, \`targetKind/id\`, \`applicability\`, \`progress\`, \`responsibleActor\`, \`reasonCodes\`, \`sourceRevision\`, \`actionability\`.
- \`ProjectProgressV1\`: \`completedKnownApplicable\`, \`knownApplicableTotal\`, \`unknownApplicabilityCount\`, \`unavailableCount\`, \`coverage\`, \`definitionVersion\`. Percentage is nullable when incomplete.
- \`ActiveStepContextV1\`: authenticated Project/Chat origin, versioned step key, exact selected target and optional artifact/version. Browser selection is untrusted input.
- \`ResearchCandidateV1\`: exact observed university/course, genuine official source(s), source as-of/freshness, unknown fields and client UI selection state.
- \`ActionProposalV1\`: \`proposalId\`, \`projectId\`, \`targetKind/id\`, \`fieldPath\`, \`oldValue\`, \`proposedValue\`, \`baseRevision\`, \`impact\`, \`status\`; confirmation must be linked to an authorized real business operation, not a model-only message.

Avoid unbounded prose/XML as action data. Fix validation, identifiers, caps, error variants and security scopes before enabling actual writes. E1 requires **no new DB schema** and must not pre-empt those later contract decisions.

## 7. Four M3 Extended delivery increments

| Increment | Must actually deliver | Boundary / acceptance gate |
| --- | --- | --- |
| **M3-E1 — Universal three-region UI shell** | The same top header, left workflow rail, step-aware centre chat mount, dynamic-right-panel registry and accessible resizable centre/right splitter for **both** School and Student 500 examples; mobile task/chat mode; reuse the accepted M3-01 Composer and M3-02 graph/project-state loader | Read-only UI/navigation first; no invented completed steps, Project goal or fake document capability. Browser screenshots at desktop/mobile, no cross-Project stale render, no chat loss on resize |
| **M3-E2 — Workflow Profiles, task progress and task-specific panels** | Conditional School and Student 500 step definitions, composed/visa-only/Offer/CoE branches, valid M1 task/progress derivation, real top-right progress/details, right-side planning/School/visa panels wired to actual authorized data | M1 additive projection + any narrowly justified confirmed-goal persistence; source unavailable/unknown prevents fake progress; test true readback and performance |
| **M3-E3 — Contextual AI and confirmed actions** | Step-aware Project Chat overlay, structured official course candidates and compare, proposal preview/confirmation, school and Student 500 draft field update through authorized services and durable readback; synchronize left/middle/right/top | M2 additive contracts and M3 sanctioned writes only, exact target/CAS/idempotency, cancellation/no-write, mode regression and no fake source/receipt |
| **M3-E4 — End-to-end user and engineering acceptance** | Real authenticated browser on isolated database for School-only, Student 500-only, combined and alternative paths; responsive splitter/keyboard; cross-chat, form-readback, adverse source/permission and genuine source/citation scenarios | Distinguish offline PASS, PostgreSQL PASS, browser PASS, paid-provider test status and production NO-GO; fix scoped defects only; no unapproved AWS/live release |

These are four **delivery increments within M3**, not four new Phase-15 milestones. After each, the owner reviews code, screenshots and actual behavior before issuing the next Codex execution contract. E1–E4 are planning-approved **but not implementation-authorized by this document alone**.

## 8. Integrated acceptance matrix

1. **School Application Project:** user begins with an Offer; skip/reclassify school search only when appropriate; searches/compares actual courses; select one source-backed option; two School Applications stay independent; confirmed intake change updates only target application, invalidates necessary package versions, and refreshes all visible surfaces.
2. **Student 500-only Project:** user with external CoE starts directly at visa planning; no forced School Application or admissions record; GS/financial/conditional document steps reflect real current data; confirmed Student 500 draft edit re-reads correctly; no false grant/lodgement/compliance claim.
3. **Combined Project:** two parallel School Applications, one Admissions case and independent Student 500 context; only actual dependencies are connected; progress denominator is not double-counted; task-switching does not lose separate step chat history.
4. **Unavailable and alternative data:** missing goal, disabled Project Documents, unavailable/refused source, user-reported Offer/CoE, historical/truncated references, revoked permissions, closed Project, failed research, stale action version, cancel and concurrent edits remain truthful.
5. **UX and continuity:** desktop around 1280×800 and mobile around 390×844; centre/right splitter pointer + keyboard + persistence; Project A→B while a request is in flight; chat or form input survives resizing; top progress details return to the same work state; bilingual labels, accessible focus/status text.
6. **Provider/legal behavior:** Fast/Default/Premium preserve M2 real project awareness and native research within their accepted serving boundaries; genuine official sources/citations and applicability remain distinct from proposed or customer-reported facts. Model mock quality is not labeled as real provider validation.

Use synthetic data and a guarded isolated PostgreSQL target. No automatic migrations, production flags, external handoffs, paid provider tests or deployment without separately granted execution authority.

## 9. Existing work and adoption/transition

- **Retain:** M1 \`ProjectState\`, M2 project assistant context, M3-01 Composer/Premium reliability, M3-02 read-model projection and genuine dependency/navigation logic, existing business services and auth/permission checks.
- **Recompose:** M3-02's central graph-heavy Home should become the **top-right “View Project Progress” details** and/or left stage projection; do not display two competing full Project dashboards. Main focus becomes centre AI + right task workspace.
- **Do not silently activate:** existing Product Documents, signed partner routing, external provider submissions, lawyer messaging, staff privileges, or unverified school/course catalog data.
- **Historical status:** M1 engineering accepted and committed; M2 owner acceptance remains outstanding; M3-01 code review passed with owner browser/provider signoff still outstanding; M3-02 offline engineering completed with real authenticated browser/form-readback outstanding. Those are not automatically accepted by planning approval.
- **Avoid local Git conflicts:** this remote planning update intentionally does **not** change locally dirty \`CURRENT_HANDOFF.md\`, \`CURRENT_MILESTONE.md\`, \`PROJECT_STATE.md\` or \`DECISIONS.md\`. Reconcile those records during a later controlled local closeout.

## 10. Decisions reserved for implementation contracts

- Exact Project Goal owner and whether an additive migration is necessary.
- Fine-grained Step Chat binding and whether some steps use an existing conversation instead of adding persisted chat keys.
- Exact rules and source coverage for complete/applicable task counts in each workflow; no fixed 7/12-task promise.
- Course search result persistence (favorites, comparison lists, chosen course) and official-evidence freshness.
- Which GS, finance, document generation/edit/review capabilities actually exist and may be enabled.
- Explicitly authorized Student 500 draft field-write service, business revisions and dependency invalidation.
- Mobile panel switcher design, splitter width defaults and user preference storage.
- Business/lawyer-approved concrete legal/professional scope where an action might require it.

## 11. R3 implementation amendment — tiered course-research evidence (2026-11-24)

Under owner decision [D-P15-006](./DECISIONS.md), M3-E3 R3 may display bounded model research leads (L1) and same-request, exact-host official citations with field-scoped attribution (L2); selective trusted acquisition may produce exact per-field observations (L3). L3 is not a prerequisite for ordinary discovery or comparison. The strict independently-observed `ResearchCandidateV1` contract remains unchanged, and candidate selection remains a customer-confirmed proposal through the existing authorized School Application service.

The R3 source implementation keeps Fast and Premium unchanged, adds optional candidate output to Default's existing stage, and uses current request evidence for source binding. No source manifest has been approved for live institution-page verification in this route; the reviewed manifest registry is empty, so the current field-verification path has synthetic fixture coverage but no real-source L3 acceptance. D-P15-003's native-search privacy limitations remain explicit.

**Current R3 checkpoint (2026-11-24):** `PHASE15_M3_E3_R3_IMPLEMENTED_PENDING_INDEPENDENT_REVIEW / LIVE_PRODUCTION_NO_GO`. The cumulative local implementation is based on `fa26428ad585110ea80070c7e6085017c06ed439` and remains uncommitted. Focused offline/provider-stub tests, TypeScript baseline comparison, Ruff, Biome, schema check and whitespace check are recorded in the implementation report. Synthetic Chromium did not start under the sandbox's Chrome socket restrictions. Guarded PostgreSQL preflight stopped because the approved hostless `POSTGRES_URL` was absent; no database connection or write occurred. Build could not fetch Geist fonts. Authenticated browser, real public-source acquisition, real provider quality and production remain NOT VERIFIED. E4 has not started; owner acceptance remains pending.

## 12. R5 implementation amendment — runtime binding and diagnostics (2026-11-24)

The R5 implementation keeps course research in Default's existing answer stage. On the exact server-selected School discovery task, the bounded sidecar container is required and explicitly distinguishes `not_performed` from completed-empty research; ordinary questions, Fast and Premium remain outside this contract. Python validates candidate identity and fields independently, discards unsafe/unresolvable source associations without dropping otherwise valid L1 leads, and promotes L2 only from genuine same-request provider evidence. R5 does not add a model call, source-manifest approval or business write.

The end-to-end synthetic regression independently constructs the TypeScript active task and Python request, runs a fake Responses provider through terminal submission and source binding, then verifies TypeScript revision binding, persisted metadata reload and Workspace task/selection projection. It confirmed a latent object-key-order mismatch in the former TypeScript revision comparison. A content-free diagnostics contract is persisted only when `NEXT_PUBLIC_WIDGET_DEBUG=true`; an owner-authenticated, read-only endpoint returns only its validated fields and the candidate count parsed from the latest persisted assistant result, bounded to five pages.

**Current checkpoint (2026-11-24):** `PHASE15_M3_E3_R5_IMPLEMENTED_PENDING_INDEPENDENT_REVIEW / LIVE_PRODUCTION_NO_GO`. Historical R5 failure stage remains unknown; a null persisted result did not retain provider tool arguments. Focused synthetic verification passed; no paid provider, database, retained Project or authenticated browser was used. Playwright test bodies could not run because Chrome launch failed at sandbox Crashpad setup; build could not fetch Google Fonts. The expected R4 patch artifact was absent, so its supplied SHA is unverified. M3 remains partial and E4 has not started.

**Current next step:** independent review of the cumulative R5 patch/report, followed by owner-run authenticated real-provider browser acceptance. Do not start E4 before the owner separately authorizes it.

## 13. Final M3-E3 owner acceptance and E4 integration acceptance handoff (2026-11-24)

**Status:** `PHASE15_M3_E3_OWNER_ACCEPTED_WITH_LIMITATIONS / PHASE15_M3_E4_NOT_STARTED / PHASE15_M2_OWNER_ACCEPTANCE_PENDING / LIVE_PRODUCTION_NO_GO`. M3 overall remains open pending E4. The accepted E3 code is committed on `phase15-guided-project-workflows` at `ace73515a21b87c7b35f763d31dcbccc7b43c7f7` (78 code/test/runner files). Historical R3/R5 sections above record their then-current pending checkpoints; this final owner decision supersedes those statuses without rewriting their evidence.

**Accepted evidence:** owner local production Build and mounted Workspace Playwright regression PASS; owner authenticated browser request capture resolved the correct School Discovery task and target revision; local cross-runtime integration 14/14 PASS. Default structured course suggestion, explicit confirmation and School intake update passed in the owner browser. Northbridge became July 2027 at revision 2 while Harbour remained unchanged. Real-provider research produced three candidates that Python and Next.js bound, persisted and restored after refresh; client/server/Python task-scope fingerprints matched. Course comparison and genuine source-link presentation passed. Incomplete research preserved unknown fields and returned two bounded leads. Linked Admissions/Student 500 course-replacement restrictions were observed. An independent synthetic School changed from Initial Test Course to UTS Master of Artificial Intelligence; unknown intake remained unset, the change persisted after refresh at revision 3, its preparation package became stale, and Northbridge/Harbour remained unchanged.

**PostgreSQL acceptance:** `PG-E3-R3_ACCEPTED_VIA_GUARDED_RESUME`. Real PostgreSQL preview, confirmation, durable readback, replay protection, stale conflict, package invalidation, School B isolation and fresh-process M1/E2 projection passed. Acceptance used the guarded retained-scope resume, not a clean single-run execution. Student 500 write-path evidence remains the R1 guarded PostgreSQL acceptance with its original limitations.

**Limitations:** historical R4/R5 failure causes were not fully reconstructed; L2 official-source coverage is limited, live L3 verification manifests are unconfigured, and real course-field accuracy is not independently established. Fast/Premium structured course output remains unsupported; some requests end with incomplete research under current budgets; some English text remains in Chinese UI. Task selection/Chat restoration after refresh and a brief post-confirm unavailable-task state need E4 integration review. A non-blocking Node `TimeoutNegativeWarning` was observed with cause unverified. M2 native-search privacy and owner-acceptance limitations are unchanged.

### E4 handoff — acceptance only, no implementation begun

Use a separately authorized, real authenticated browser and exact-target isolated database. Verify the integrated School-only, Student 500-only, combined and alternative/Offer paths; shared effective task and target-revision resolution across browser/Next.js/Python; Chat restoration and task selection across refresh and Project navigation; desktop/mobile splitters and keyboard controls; explicit proposal confirmation, CAS conflict, package staleness and durable form/readback updates; linked Admissions/Student 500 restrictions; source identity/citations and honest incomplete-research behavior; and unavailable/revoked/archived boundaries. Include an end-to-end regression for the brief unavailable-task state and a bounded observation of the Node timeout warning. Keep owner authenticated browser, mounted Playwright, PostgreSQL, cross-runtime and real-provider results separately labeled; do not infer production safety from these tests.

E4 implementation has not started and is not authorized by this documentation closeout. M2 remains pending owner acceptance. No production flags, migrations, paid provider runs, AWS or deployment are approved. Preserve `LIVE_PRODUCTION_NO_GO`.
