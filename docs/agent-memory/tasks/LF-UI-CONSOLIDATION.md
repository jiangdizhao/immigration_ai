# LF-UI-CONSOLIDATION — Lawyer Feedback UI/Product Consolidation

**Status:** ACTIVE — LF-01  
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

## 4. LF-01 — Public Experience Consolidation — ACTIVE

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

## 5. LF-02 — AI Workspace Consolidation — PLANNED

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

## 6. LF-03 — Policy-to-AI Continuity + Final Product Integration — PLANNED

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
