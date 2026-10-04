# LF-UI-CONSOLIDATION — Lawyer Feedback UI/Product Consolidation

**Status:** ACTIVE — LF-03  
**Activated:** 2026-10-04  
**Parent branch:** `phase11-chinese-service-platform-ui-rebase`  
**Parent checkpoint before activation:** `8cb4ca34cb9eef698843190945ec7cf2e34d41f9`  
**Authority:** current Phase-11 architecture/content/provenance records, accepted P11-006/P11-007/P11-008 behavior, accepted P11-009 source/deployment records, and the owner's 2026-10-04 lawyer-feedback review.

## 1. Objective

Implement the lawyer-requested whole-site simplification without reopening accepted backend workflows or the paused Policy Intelligence verifier/publication investigation.

The product should present four primary public destinations:

1. Home
2. AI Workspace
3. Services & Contact
4. Legal Updates

The AI Workspace remains the core interactive product. Human lawyer services remain distinct from AI analysis and must reuse existing reviewed workflows rather than be simulated through copy.

## 2. Non-negotiable preservation boundaries

Do not:

- reset/clean/overwrite the local-only Policy Intelligence admin revision-detail WIP;
- modify Policy Intelligence analyzer, verifier, publication gate, discovery, scheduler, DB schema or automatic-maintenance semantics;
- weaken `Official Source != AI Analysis != Lawyer Advice`;
- remove accepted auth/RBAC/ownership boundaries;
- redesign Fast / Legal Check / Premium provider/model policy;
- change billing/VIP entitlement semantics;
- replace P11-007 request-scoped lawyer authority with matter-wide staff access;
- replace P11-008 consultation workflow with invented real-time lawyer chat;
- remove secure MatterDocument provenance/security boundaries;
- apply DB migrations, mutate AWS, or deploy during LF-01/LF-02/LF-03 source implementation unless separately authorised.

Preferred development isolation: a separate local worktree/branch created from the updated remote Phase-11 branch.

## 3. Anti-loop execution discipline

This task deliberately uses **three coarse development stages only**.

- Do not create A/B/C micro-substages, R1/R2/R3 chains, or one-task-per-component plans.
- Implement all strongly related changes inside the active stage before concentrated validation.
- Non-blocking polish defects go into a stage-end/final polish list.
- Interrupt a stage only for a true blocker: broken route, build/compile failure caused by the change, auth/data-boundary regression, severe responsive overflow, broken bilingual semantics, or loss of an accepted user workflow.
- Each stage should normally produce one implementation commit and at most one necessary correction commit after review.
- Repeated correction commits indicate the design/implementation should be reassessed instead of patched indefinitely.

## 4. LF-01 — Public Experience Consolidation — VERIFIED

### Goal

Simplify the public information architecture and align Home / Services & Contact / Legal Updates with the lawyer feedback in one implementation unit.

### Required implementation

#### Navigation

Public primary navigation becomes:

- 首页 / Home
- AI 工作台 / AI Workspace
- 服务与联系 / Services & Contact
- 法律动态 / Legal Updates

Keep account-menu routes such as Client Portal, consultations, lawyer/admin portals and VIP outside this four-item public navigation; they remain functional.

#### Services / Process / Contact consolidation

Use the current clean Contact surface as the canonical base.

The combined page should:

- briefly explain the service process;
- succinctly show available immigration/legal service categories;
- retain two clear primary actions: AI consultation and lawyer consultation;
- avoid large dense marketing/team blocks.

Preserve old `/services` and `/process` inbound links with safe redirects to the canonical combined surface rather than deleting route compatibility.

#### Home

Keep the existing Sydney Opera House visual asset/direction, but:

- reduce the darkness of the image/overlay;
- maintain a coherent deep-navy visual system;
- avoid long runs of plain white space;
- place latest immigration/legal updates immediately after the hero;
- move/compact service material later in the page;
- preserve clear AI and lawyer/contact CTAs.

#### Legal Updates public presentation

Do not change internal `PolicySourceStatus` or provenance semantics.

Map the detailed internal state into only two primary public groups:

- Published / In force
- Proposed / Planned

Historical/superseded records do not need to become a third primary marketing group; preserve them wherever current detail/history/admin semantics require them.

Do not change analyzer/verifier/publication behavior in order to make the grouping easier.

### LF-01 source constraints

- Prefer adapting existing components/content models over introducing a parallel public-site system.
- Preserve zh-CN default and English switching.
- Keep desktop/mobile usable.
- No DB migration.
- No AWS deployment.
- No Policy Intelligence backend work.

### LF-01 concentrated validation

Run one bounded validation batch after implementation, not after every component edit.

At minimum:

- closest navigation/site-locale/public-content focused tests;
- closest Policy Intelligence product/presentation focused tests affected by the two-group mapping;
- `pnpm build`;
- `git diff --check`;
- focused changed-file formatter/linter check if already used by this repository.

Perform one representative desktop/mobile visual inspection of:

- Home;
- Services & Contact;
- Legal Updates;
- primary/mobile navigation.

Treat only blockers as reasons to reopen source immediately. Record minor polish for the later consolidated pass.

### LF-01 stop boundary

Stop after implementation + concentrated validation.

Report:

- exact changed files;
- redirects/route compatibility;
- two-group status mapping;
- tests/build/diff results;
- any real blocker;
- minor non-blocking polish notes.

Leave implementation **uncommitted and unpushed** for independent review unless the owner explicitly instructs otherwise.

Do not start LF-02.

## 5. LF-02 — AI Workspace Consolidation — VERIFIED

One implementation unit:

- fixed desktop application shell;
- only relevant internal panes scroll;
- central message list remains independently scrollable;
- simplify right rail to Known information + To confirm;
- remove customer-visible AI confidence and confidence note;
- add explicit user-triggered Generate case summary under To Confirm;
- prefer existing matter/conversation/snapshot data for summary generation;
- preserve backend confidence field if existing contracts rely on it;
- preserve answer-level legal sources/citations;
- expose lawyer answer review and P11-008 one-to-one consultation as distinct VIP/human-service paths;
- do not call the consultation path “real-time lawyer chat” unless that product is separately built.

## 6. LF-03 — Policy-to-AI Continuity + Final Product Integration — ACTIVE

One implementation unit:

- Legal Update “Ask AI” creates a **new conversation**;
- selected policy/topic reference is attached to that conversation/context;
- workspace shows only a lightweight assistant opener;
- opening the page/reference alone does **not** invoke Fast, Legal Check, Premium or another model analysis;
- the user's subsequent question enters the normal existing answer flow;
- finish consistent naming/navigation/footer/account/mobile presentation.

## 7. Final acceptance + deployment

After LF-01/LF-02/LF-03 are accepted:

1. freeze feature work;
2. run one consolidated matrix across Home, Legal Updates, Policy -> AI, AI Workspace, manual case summary, lawyer review, lawyer consultation and Services & Contact;
3. cover representative desktop/mobile and zh-CN/English states;
4. run the full repository-appropriate unit/focused checks, `pnpm build`, and `git diff --check`;
5. if accepted, perform one reviewed commit/push sequence and one authorised deployment;
6. perform one production smoke/visual review.

Do not convert the final acceptance into many independent micro-gates unless a real blocker requires isolation.

## 8. Paused Policy Intelligence resume point

After this UI consolidation is complete, resume the 2026-10-03 Policy Intelligence diagnostic plan from its preserved checkpoint:

- validate/review the local admin revision-detail endpoint;
- commit/deploy it separately if accepted;
- retrieve full stored analysis + verification for subclass 494;
- only then decide whether verifier/publication logic needs a minimal correction.

Do not relax the legal evidence gate merely to force publication.


## 2026-10-04 LF-01 verified / LF-02 activated

### LF-01 acceptance record

LF-01 is closed/verified at remote commit `5719cee319ac022a6c6c4761820e8892779e6039`.

Evidence:

- 46 focused tests passed, 0 failed;
- production build passed;
- changed-file Biome passed;
- `git diff --check` passed;
- source review passed;
- desktop/mobile visual smoke passed;
- remote commit boundary verified.

Do not reopen LF-01 for minor cosmetic observations.

### LF-02 implementation contract

#### Desktop shell

- Make `/ai-workspace` an application surface on desktop.
- Constrain the desktop workspace to the viewport below `SiteHeader`; remove/omit `SiteFooter` from the application surface if required.
- Outer desktop page should not scroll in normal use.
- Mode controls remain visible.
- Left conversation history may scroll internally.
- Central message list scrolls independently; composer remains visible.
- Right rail may scroll internally.
- Mobile remains stacked/naturally scrollable and usable.

#### Right rail

The final customer-facing right rail contains only:

- **Known information**: all available entries from the latest `interactionPlan.known_facts_summary`, with localized labels and safe value rendering.
- **To confirm**: all current `interactionPlan.requested_facts`, preserving backend prompt/label semantics and inventing nothing.
- **Generate case summary**: explicit user action.

Remove from the right rail:

- current matter;
- matter/operation type;
- next action;
- AI confidence/confidence note;
- duplicate latest sources;
- generic lawyer handoff promo;
- the one-item-only requested-fact treatment.

Provide localized empty states for Known and To Confirm.

#### Manual case summary

For LF-02, “Generate case summary” means a deterministic UI snapshot of the currently visible structured context, not an LLM task.

- No model/provider call.
- No new API endpoint.
- No database write.
- No automatic generation.
- Clicking the button captures the current Known + To Confirm values into a visible structured summary.
- Later chat changes do not silently mutate the already-generated snapshot.
- User may explicitly regenerate to update it.
- The summary must not infer legal conclusions or present itself as lawyer advice.
- Prefer a small pure helper/data structure so snapshot behavior can be unit-tested.

#### Human service paths

Preserve existing `LawyerRequestAction` entitlement and persisted-answer semantics.

When VIP review access is allowed, make both existing paths clear in the answer-associated human-service UI:

1. request lawyer review of this answer;
2. one-to-one lawyer consultation via existing `consultationCreateHref(chatId)`.

Do not alter consultation lifecycle, consultation route availability elsewhere, billing/VIP entitlement, lawyer-request RBAC/snapshot rules, or claim real-time lawyer chat.

#### Preserve

Do not regress or redesign:

- conversation list/create/load;
- `chatId` continuity;
- Fast / Legal Check / Premium mode access;
- mode provider/routing policy;
- political gate;
- guided intake;
- MatterDocuments;
- answer-level source/citation presentation;
- consultation continuity;
- auth/session/RBAC;
- backend response contracts.

The backend `confidence` value may continue to exist; only its customer-facing UI is removed.

#### LF-02 validation

Run one concentrated batch after implementation:

- workspace copy/helper tests;
- new deterministic context-summary tests;
- consultation customer-UI continuity tests;
- relevant lawyer-request/VIP tests;
- any directly affected existing tests;
- production build;
- changed-file Biome;
- `git diff --check`.

Visual smoke with the linked local environment:

- desktop outer page does not scroll;
- message list scrolls and composer remains visible;
- right rail has only Known / To Confirm / manual summary;
- all requested facts are visible, not only the first;
- no AI confidence is customer-visible;
- lawyer-review and one-to-one consultation paths are distinct;
- mobile has no severe overflow and remains usable;
- zh-CN / English switching remains intact.

#### LF-02 stop boundary

Leave LF-02 source uncommitted and unpushed for independent review. Do not start LF-03 or deploy.


## 2026-10-04 LF-02 verified / LF-03 activated

### LF-02 acceptance record

LF-02 is closed/verified at remote commit `1fab2376fb72dc02587b46b1f6b9157379a5b3ee`.

Evidence:

- final focused tests: 23 passed, 0 failed;
- standard unit suite: 497 passed, 0 failed, 0 skipped;
- production build passed;
- changed-file Biome passed;
- `git diff --check` passed;
- desktop visual smoke passed;
- 390px mobile visual smoke passed;
- independent source review passed after one bounded correction for cross-conversation case-summary leakage.

The accepted case-summary invariant is: same-chat context changes do not silently rewrite a generated snapshot; explicit regenerate updates it; switching/new conversation clears it.


### LF-03 — Policy-to-AI Continuity + Final Product Integration — ACTIVE

LF-03 is the final feature stage before the consolidated acceptance/deployment gate. Keep it as one bounded implementation unit.

#### A. Policy -> AI must create exactly one fresh conversation

The Legal Updates detail CTA remains the entry point, but it must carry an explicit one-time launch intent in addition to the validated policy slug.

Recommended bounded contract:

- `policyWorkspaceHref(slug)` includes a one-time launch marker, e.g. `/ai-workspace?policy=<slug>&launch=policy`;
- guest-auth redirect preserves both the policy slug and launch marker;
- after the server resolves a valid published `PolicyWorkspaceReference`, the workspace creates one new conversation through the existing immigration-conversation POST path;
- use a bounded localized policy-derived conversation title where practical;
- after successful creation, replace the URL with `policy=<slug>&chatId=<new id>` and remove the launch marker;
- reload of that consumed URL must load the same conversation and must not create another conversation;
- invalid/unpublished policy slugs degrade safely to the ordinary AI Workspace and must not create a policy-linked conversation.

Do not use a random/timestamp launch token and do not create multiple conversations from React rerenders.

#### B. Topic reference and lightweight opener

The selected published policy reference is a topic pointer, not legal evidence.

The linked conversation should show one concise deterministic opener/reference derived from the existing server-resolved public `PolicyWorkspaceReference`:

- localized policy title;
- official title/source identity;
- optional official-source link;
- a short bilingual instruction inviting the user to ask a question.

Opening the policy handoff must not call Fast, Legal Check, Premium, the legal-service backend, or another model.

Prefer a deterministic UI opener over persisting a fake assistant answer. It must not become a lawyer-reviewable AI answer or claim that legal analysis has already occurred.

Avoid showing both a large policy banner and a second large opener; consolidate the continuity presentation into one clear compact surface.

#### C. Policy context enters the normal answer flow only after the user asks

A question such as “Does this affect me?” must retain the selected topic context without treating the policy-page AI interpretation as verified legal evidence.

Use the existing published policy slug/reference as a bounded topic hint only.

Recommended safe path:

- while the current `chatId` is the policy-linked chat, include the policy slug as an optional bounded request field;
- after the normal political gate/auth/ownership checks, server-side code resolves that slug through the existing published-policy resolver before using it;
- if resolution succeeds, include a small system/topic-context entry in the legal-service `frontend_messages` (or the closest existing shared context mechanism) containing only the published topic identity needed for continuity;
- do not replace or rewrite the user's visible question;
- do not persist the topic hint as a fake user/assistant message;
- do not use the policy-page AI summary as authoritative evidence;
- normal Fast / Legal Check / Premium research/source behavior remains responsible for the actual answer;
- if server-side resolution fails, answer the user's question normally without policy context rather than trusting client-supplied title/source text.

Keep the implementation shared/bounded where practical rather than copy-pasting divergent policy-context logic across three answer routes.

#### D. Conversation-boundary isolation

Policy continuity must belong only to the launched chat.

- Switching to another existing conversation must stop applying the policy context.
- Clicking the normal New Conversation button must create an ordinary conversation and clear the active policy continuity from client URL/state.
- Reloading the policy-linked chat URL keeps the policy reference for that chat.
- Do not allow one policy handoff to leak into another conversation.
- LF-03 does not require a new DB column or migration unless current source proves a durable server field already exists and is clearly safer to reuse. Do not invent a schema migration merely for this UI handoff.

This stage guarantees immediate/reload continuity for the launched policy chat; cross-device archival policy linkage is not being introduced here.

#### E. Preserve LF-01 / LF-02 accepted behavior

Do not regress:

- four-item primary public navigation;
- canonical Services & Contact surface and legacy redirects;
- Home hierarchy and two-group Legal Updates presentation;
- fixed desktop AI Workspace shell and internal scrolling;
- Known / To Confirm rail;
- manual frozen case-summary snapshot semantics and conversation isolation;
- Fast / Legal Check / Premium access/routing;
- political gate;
- guided intake;
- documents and evidence provenance;
- answer-level citations/sources;
- lawyer-review persisted message identity/RBAC;
- P11-008 consultation continuity;
- auth/session/VIP billing boundaries;
- Policy Intelligence provenance/publication semantics.

Do not resume verifier/publication-gate diagnostics or merge the separate Policy WIP branch.

#### F. Final product integration polish

Within the same LF-03 stage, perform only bounded integration polish directly related to the lawyer feedback:

- consistent Home / AI Workspace / Services & Contact / Legal Updates naming in zh-CN and English;
- consistent CTA wording between Legal Updates and AI Workspace;
- no duplicate policy-continuity cards;
- no obvious desktop/mobile overflow introduced by LF-03;
- account/header/footer behavior remains consistent with the accepted LF-01 information architecture;
- do not launch unrelated design rewrites.

Minor unrelated polish remains deferred to the final acceptance batch.

#### G. LF-03 concentrated validation

At minimum cover:

- policy workspace href + guest redirect helper tests;
- published-policy reference resolver tests;
- one-time launch/idempotence pure helper tests;
- policy-chat boundary/URL-state helper tests;
- any new bounded policy-topic request-context helper tests;
- relevant workspace/conversation tests;
- all three answer-mode request-schema/context tests if they are touched;
- existing political-gate tests affected by request-context handling;
- `pnpm test:unit` once after final LF-03 source changes;
- production build;
- changed-file Biome;
- `git diff --check`.

Visual smoke should verify:

- clicking Ask AI from a policy detail creates one new conversation;
- the linked topic/opener is visible without an automatic answer/model call;
- refreshing does not create a second conversation;
- user question then receives a normal answer through the selected mode;
- switching conversation/new conversation clears policy context;
- desktop application shell remains non-scrolling;
- mobile remains usable;
- zh-CN / English copy remains coherent.

#### H. Stop boundary

Leave LF-03 source uncommitted and unpushed for independent review.

Do not deploy yet. After LF-03 source review/commit/push, enter one consolidated final acceptance/deployment gate across LF-01/LF-02/LF-03.

