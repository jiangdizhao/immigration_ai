# AI Workspace Emergency Hotfix — 2026-10-06

**Status:** ACTIVE  
**Canonical branch:** `phase11-chinese-service-platform-ui-rebase`  
**Runtime application base:** `3a5e821e38c0ad5d52e041ac3ea46c34d6441c6d`  
**Priority:** emergency / small / fast / one-pass

## Objective

Fix exactly two owner-observed defects in one bounded implementation pass. Do not reopen the broader Phase 11, RR-01, RR-02, upload architecture, or Policy Intelligence architecture.

## Bug 1 — reclaim workspace height for the AI conversation

Owner-confirmed screenshot semantics:

- **A = AI conversation display** and must become materially taller;
- **B = message composer** should remain functionally and visually compact;
- the old document/upload block above A is expendable UI chrome.

Current layout already gives A `flex-1`, so the correct solution is **not** to hard-code a larger A height. Reclaim vertical space from the always-visible document panel and let the existing flex layout assign that space to A.

### Approved UI direction

Use a ChatGPT-style attachment affordance:

- remove the standalone idle `MatterDocumentsPanel` block above A;
- place a compact `+` attachment/upload control at the lower-left of the composer;
- do **not** permanently display supported types, the 25 MiB limit, generic “customer access required” copy, or an empty `Documents: — / 文件：—` state in the main workspace;
- when there are no documents, the document feature should consume essentially no additional vertical space beyond the `+` control;
- when actual documents exist, expose them as a compact attachment/status row or chips near/above the composer;
- preserve actionable states and existing behavior: upload, processing/security status, selection, retry/reprocess/download/delete/manage as currently supported;
- put format/size explanatory text inside the attachment/upload/manage interaction if it is still needed;
- do not change accepted file types, size limits, upload APIs, document processing, provenance/security rules, or database behavior;
- do not increase composer B merely to host the attachment control.

Expected files: primarily `chatbot/components/immigration-ai-workspace.tsx` and `chatbot/components/matter-documents-panel.tsx`, with the smallest supporting test change if needed.

### UI acceptance

- With zero documents, the old multi-row “案件文件” block is gone.
- A is visibly taller because reclaimed space flows to the existing `flex-1` message list.
- B remains compact and usable.
- The `+` control can still initiate the existing upload flow.
- Existing real document state remains accessible without recreating a large permanent panel.
- Desktop is the primary acceptance surface; do a quick narrow/mobile sanity check only, not a separate redesign cycle.

## Bug 2 — policy-linked first turn loses topic before semantic routing

The existing frontend/server handoff is already mostly correct:

`policyWorkspaceHref -> /ai-workspace?policy=<slug>&launch=policy -> policyReference -> policySlug -> getPolicyTopicContextEntry()`.

The request routes append a bounded, server-resolved `role=system, policy_topic_reference=true` entry to `frontend_messages`. Premium direct history and `ConversationMemoryService` already understand that entry and keep it out of normal persisted user/assistant history.

The observed gap is earlier in the normal Fast/Legal path: `QueryService._analyze_semantic_turn()` currently gives semantic analysis only backend `current_state.conversation_history`. In a fresh policy-linked conversation that history is empty, so “请详细介绍一下这项政策” can be classified before the selected policy hint exists in router context.

### Approved minimal backend fix

- before calling `semantic_turn_service.analyze()`, inspect `payload.frontend_messages`;
- take **at most one** entry that is both `role=system` and `policy_topic_reference=true`, with non-empty bounded text;
- include that existing topic hint in the semantic-turn context used for routing;
- keep the actual user question byte-for-byte/semantically unchanged;
- do not inject the whole public policy detail or raw source body;
- do not treat the topic hint as legal evidence;
- do not persist it as a fake user or assistant message;
- do not weaken source verification or publication rules;
- do not redesign `ConversationMemoryService`, PFVD, AgentRuntime, Fast, Legal Check, or Premium;
- ordinary conversations without a policy topic reference must behave exactly as before.

Expected backend file: `legal-service/app/services/query_service.py`, plus one focused regression test in the nearest existing query/semantic-turn test file.

### Context acceptance

1. Open a real Legal Update detail and click **就这项政策向 AI 提问**.
2. Ask **“请详细介绍一下这项政策”**.
3. AI identifies/uses the selected policy context and does **not** ask the user to specify which policy.
4. A follow-up such as **“这个变化对学生有什么影响？”** retains the same selected topic.
5. A normal new conversation with no policy link receives no synthetic policy context.
6. Existing guarantees remain: no automatic model call on handoff, no fake persisted policy chat message, no policy-context leakage after switching/creating another conversation.

## Hard scope boundaries

Target roughly **3–6 source/test files total**. Prefer the smallest coherent implementation over abstraction work.

Do not touch:

- Policy Intelligence discovery/analyzer/verifier/publication gate;
- RR-01/RR-02 semantics;
- database schema or migrations;
- AWS resources/deployment;
- upload formats/limits/security pipeline;
- consultation/lawyer-review/billing;
- protected branch `policy-intelligence-admin-detail-wip-20261004`;
- unrelated lint, formatting, dependency upgrades, refactors, or copy polish.

## One-pass execution and validation

Implement both bugs together, then run a concentrated gate:

- focused frontend tests naturally covering the attachment/workspace behavior if an existing test surface supports it;
- focused legal-service regression test for policy topic availability during semantic routing;
- relevant existing policy-continuity tests;
- chatbot production build;
- `git diff --check`;
- one local browser smoke covering:
  - zero-document workspace height and `+` upload affordance;
  - one policy-detail -> Ask AI first-turn question and one follow-up;
  - one ordinary conversation without policy context.

If these pass and no core correctness regression is visible, **STOP and report the patch for owner review.** Do not start broad review, cosmetic polishing, or a chain of micro-fixes.

## Deliverable discipline

Leave the completed patch uncommitted/unpushed for owner review unless explicitly told otherwise. Report:

- exact changed files;
- concise explanation of both fixes;
- focused test results;
- build/diff-check result;
- smoke result or exact blocker;
- any genuine remaining release blocker only.
