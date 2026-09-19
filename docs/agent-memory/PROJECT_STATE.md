# PROJECT_STATE

**Updated:** 2026-09-19  
**Project:** Immigration AI / Australian immigration & study service platform  
**Repository:** `jiangdizhao/immigration_ai`

## Current product state

The repository is a working full-stack immigration-service system, not a UI-only prototype.

Main technology split:

- `chatbot/` — Next.js frontend, authentication, customer workspace, VIP/billing, lawyer/admin surfaces.
- `legal-service/` — FastAPI legal backend, legal retrieval/reasoning, evidence contracts, Phase-6 checker and control-plane functionality.

The current product already has real capabilities that Phase 11 must reuse rather than recreate:

- guest and registered accounts;
- persistent conversation history;
- legal matter identity linked from customer conversations;
- Fast / Legal Check / Premium answer modes;
- server-side mode/entitlement access;
- VIP recurring billing;
- transactional email;
- lawyer clarification/request flow;
- lawyer portal and lawyer-review/admin workflows;
- legal citations/source UX;
- political/privacy gating.

## Current source baseline

The Phase 11 branch was created from:

- source branch: `phase10.2-stream-termination-observability`
- source commit: `3b3653202f9b067fbed4adfd410edc02cb7215cc`
- commit message: `fix: uncap fast Luna output and expose stream termination diagnostics`

That Phase 10.2 commit resolves the Fast-lane mandatory output-cap defect by omitting `max_output_tokens` by default and adds content-free stream termination diagnostics.

The Phase 11 implementation branch is:

- `phase11-chinese-service-platform-ui-rebase`

## Current frontend state

The frontend already includes a service-oriented shell:

- `chatbot/components/immigration-service-home.tsx`
- `chatbot/components/site-header.tsx`
- `chatbot/components/site-footer.tsx`
- `chatbot/app/(chat)/services/`
- `chatbot/app/(chat)/process/`
- `chatbot/app/(chat)/contact/`
- `chatbot/app/(chat)/ai-workspace/`

The AI workspace is functional and materially stateful. `chatbot/components/immigration-ai-workspace.tsx` currently owns significant behavior including conversation persistence, new/reopen conversation UX, request submission, political-history sanitization, guided intake, source rendering, and lawyer escalation surfaces.

Therefore Phase 11 must treat AI Workspace as a high-blast-radius component and rebase it incrementally.

P11-001 has now established a typed site-wide `zh-CN` / `en` locale foundation for the shared shell. Chinese is the default, the desktop/mobile header exposes a language switch, and the selection persists through the site-locale cookie. Public page bodies remain largely English until P11-002 and later tasks connect them to the locale/content model.

## Current answer-lane state

Current product-level lane model:

- **Fast** — GPT-5.6 Luna direct Responses path, low reasoning, optional native web search, no silent lane fallback.
- **Legal Check / Default** — bounded source-aware Luna legal workflow with request-scoped evidence and Phase-6 checker.
- **Premium** — GPT-5.6 Sol direct/research path with configured Luna fallback and separate budget semantics.

Phase 10.1 added a bounded fresh terminal recovery for a narrow Default terminal-timeout condition.

Phase 10.2 confirmed the Fast failure root cause on a complex case was the former application-level 1200 output-token cap and removed that default cap.

The Premium budget-partition problem documented on 2026-09-12 remains a separate open backend issue; Phase 11 UI work must not disguise it as a UI defect.

## Deployment state

Phase 11 project-memory/bootstrap work does not deploy anything.

The 2026-09-12 handoff recorded the last confirmed production-style ECS state as Phase 10 task definition rev29 and explicitly did not claim that Phase 10.1/10.2 had been rolled out to AWS. Do not infer deployment state from Git state.

Any AWS rollout requires separate explicit authorization and current topology verification.

## Phase 11 product target

The accepted Phase 11 target is a Chinese-first Australian immigration and study service platform.

The temporary repository `jiangdizhao/immigration_temporal_ui` at `codex/fidelity-completion-v4@8abbba2` is a design/journey reference. The main repository remains the functional authority.

Matter continuity is the central UX concept:

```text
content -> AI intake -> matter context -> lawyer escalation -> continuing service
```

See `docs/architecture/SERVICE_PLATFORM_UI_REBASE_V1.md`.

## Current Phase 11 execution state

- **P11-001 — VERIFIED:** Chinese-first locale + shared shell foundation.
- Verified implementation checkpoint: `4bc039c60f72e61e2e3b6a7cc26a88a862d5c1e3`.
- Local validation reported 154 unit tests passed, production build passed, changed-file Biome passed, and `git diff --check` passed. Repository-wide lint still reports 22 pre-existing unrelated diagnostics.
- User browser smoke confirmed the expected P11-001 boundary: shared header/footer localize correctly while page-body translation remains intentionally deferred.
- Next executable work is **P11-002A — Public content model + bilingual public-page structural rebase**.
- P11-002B will handle higher-fidelity visual refinement after P11-002A structure/content behavior is stable.

Public-content governance is defined in `docs/product/CONTENT_POLICY.md`.

## Shared project memory

Durable project state now lives in:

- `AGENTS.md`
- canonical architecture/spec documents
- `docs/agent-memory/PROJECT_STATE.md`
- `docs/agent-memory/CURRENT_MILESTONE.md`
- `docs/agent-memory/CURRENT_HANDOFF.md`
- `docs/agent-memory/DECISIONS.md`
- `docs/agent-memory/tasks/`
- `.cline/rules/project-workflow.md`

Conversations are working memory only.

## Known high-risk areas

- large `ImmigrationAIWorkspace` component with both UI and behavior;
- auth/account navigation that must survive translation/restructure;
- VIP and server-side entitlement boundaries;
- lawyer-request ownership and snapshots;
- preserving provenance semantics while adding Policy Intelligence;
- accidental reuse of mock credentials/claims from the temporary UI;
- route redesign that could break auth redirects or existing links;
- database/schema changes made prematurely for presentation goals.

