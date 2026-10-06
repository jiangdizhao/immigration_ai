# AI Workspace Emergency Hotfix — 2026-10-06

**Status:** ACTIVE  
**Canonical branch:** `phase11-chinese-service-platform-ui-rebase`  
**Runtime base:** `3a5e821e38c0ad5d52e041ac3ea46c34d6441c6d`  
**Priority:** emergency / small / fast

## Goal

Fix exactly two owner-observed defects without reopening the wider Phase 11 or Policy Intelligence architecture.

### Bug 1 — conversation area is squeezed by the document panel

Owner correction to the screenshot:

- **A = AI conversation display** and should be larger;
- **B = message composer** and should remain intact;
- the area **above A** (case-file/document upload panel) is consuming too much vertical space.

Current source confirms `MatterDocumentsPanel` sits immediately above the flexing message list. Therefore reducing its idle height directly gives A more space without redesigning B.

Small fix:

- keep the case-file title and Upload button;
- when there are no documents, collapse the panel to a compact row;
- remove the always-visible supported-format list from the workspace surface;
- remove the idle `文件：— / Documents: —` line;
- do not show generic unverified-file explanatory copy before a document exists;
- preserve real document cards, processing/security status, selection, retry/reprocess/download/delete, and concise actionable errors when relevant;
- do not change accepted file types, size limits, upload APIs, processing, security, or database behavior.

Primary file expected: `chatbot/components/matter-documents-panel.tsx`.

Acceptance: on desktop the visible conversation region A is materially taller, the composer B is unchanged, and upload still works as before.

## Bug 2 — Ask AI from a policy detail loses the policy before first-turn routing

The existing handoff already carries the correct policy slug/reference:

`policyWorkspaceHref -> /ai-workspace?policy=<slug>&launch=policy -> policyReference -> policySlug -> getPolicyTopicContextEntry()`.

The request routes already append a bounded server-resolved `policy_topic_reference` system entry to `frontend_messages`. Premium direct history and `ConversationMemoryService` already know how to consume that entry without persisting it as normal chat history.

The observed defect is earlier in the normal Fast/Legal pipeline: `QueryService._analyze_semantic_turn()` currently sends only backend `current_state.conversation_history` to semantic analysis. On a fresh policy-linked conversation that history is empty, so a first question such as “请详细介绍一下这项政策” can be routed before the policy topic hint is available.

Small fix:

- before semantic analysis, extract at most the existing validated/bounded `role=system && policy_topic_reference=true` entry from `payload.frontend_messages`;
- include that topic hint in semantic-turn context for the first turn;
- keep the user's actual question unchanged;
- do not copy the whole policy brief into the prompt;
- do not treat the topic reference as legal evidence;
- do not persist it as a fake user/assistant chat message;
- do not relax source verification;
- do not redesign `ConversationMemoryService`, PFVD, AgentRuntime, Fast, Legal Check, or Premium.

Primary backend file expected: `legal-service/app/services/query_service.py`, with the smallest targeted regression test needed.

Acceptance:

1. From a real Legal Update detail, click **就这项政策向 AI 提问**.
2. Ask **“请详细介绍一下这项政策”**.
3. AI must understand which policy is referenced and answer it instead of asking the user to name the policy.
4. A follow-up such as **“这个变化对学生有什么影响？”** should retain the same policy topic.
5. An ordinary new conversation with no policy link must not invent a policy context.

## Scope / stop rule

Target production change: approximately **2–4 source/test files**.

Do not touch:

- Policy Intelligence discovery/analyzer/verifier/publication gate;
- RR-01/RR-02 behavior;
- database schema or migrations;
- AWS resources;
- upload formats/limits/security pipeline;
- consultation/lawyer-review/billing code;
- protected branch `policy-intelligence-admin-detail-wip-20261004`;
- unrelated lint/format/refactor work.

Validation should be concentrated, not iterative:

- focused tests for policy-topic semantic routing and any lightweight UI regression test already natural to the codebase;
- chatbot production build;
- `git diff --check`;
- one local browser smoke covering the two acceptance scenarios.

If those pass and no core regression is visible, **STOP**. Do not start another broad review or polishing loop.
