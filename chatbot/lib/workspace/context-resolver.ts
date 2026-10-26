import "server-only";

import {
  getImmigrationConversationByChatId,
  listMessagesForChatPage,
} from "@/lib/db/queries";
import {
  buildConversationDocumentContext,
  type ConversationDocumentStatusSummary,
  type CustomerDocumentEvidence,
  type CustomerDocumentManifest,
  EMPTY_CONVERSATION_DOCUMENT_STATUS,
} from "@/lib/matter-documents/ai-evidence";
import type {
  ConversationPolicyBindingView,
  ConversationPolicyTopicResolution,
} from "@/lib/policy-intelligence/conversation-policy-binding";
import {
  getOwnedPolicyBindingView,
  resolveConversationPolicyTopicContext,
} from "@/lib/policy-intelligence/conversation-policy-binding-service";
import type { ResolvedProjectContext } from "@/lib/projects/context-resolver";
import { resolveProjectContext } from "@/lib/projects/context-resolver";
import type { ProjectContextPacket } from "@/lib/projects/project-context";

/**
 * Phase 12 Stage 2 — one typed, authenticated context resolver shared by Fast,
 * Legal Check (AgentRuntime and legacy serving) and Premium.
 *
 * The three answer modes keep their own research and answer policy, but they
 * must receive the *same* trusted scope: the authenticated user, the authorized
 * conversation, the server-persisted policy topic and the usable evidence of the
 * conversation's own documents. Scoping is enforced here, once, instead of being
 * re-derived per route.
 *
 * Project identity and any cross-Chat facts are resolved server-side from the
 * persisted ProjectConversation association. Chat history and legacy document
 * evidence remain scoped to this exact Chat.
 */

export const DEFAULT_CONTEXT_HISTORY_LIMIT = 200;
export const MAX_CONTEXT_HISTORY_LIMIT = 400;

export type WorkspaceContextScope = {
  userId: string;
  conversationId: string | null;
  matterId: string | null;
  projectId: string | null;
};

export type WorkspaceContextConversation = {
  chatId: string;
  legalMatterId: string | null;
  title: string | null;
  origin: "immigration" | "legacy_chat";
  authorized: true;
};

export type WorkspaceContext = {
  scope: WorkspaceContextScope;
  conversation: WorkspaceContextConversation | null;
  policyBinding: ConversationPolicyBindingView | null;
  policyTopic: ConversationPolicyTopicResolution;
  documents: {
    /** Bounded, request-scoped evidence packet (max 8 documents / 64 units). */
    evidence: CustomerDocumentEvidence;
    /** Provenance of exactly the units packaged for the model. */
    manifest: CustomerDocumentManifest[];
    /** Counts + bounded filenames; never evidence and never a citation. */
    status: ConversationDocumentStatusSummary;
  };
  history: { messageCount: number; hasOlder: boolean };
  projectContext: ProjectContextPacket | null;
  projectContextDiagnostic: ResolvedProjectContext["diagnostic"] | "standalone";
  refreshProjectContextBeforeProvider(): Promise<ProjectContextPacket | null>;
};

function emptyContext(scope: WorkspaceContextScope): WorkspaceContext {
  return {
    scope,
    conversation: null,
    policyBinding: null,
    policyTopic: { slug: null, source: "none", bindingAvailable: false },
    documents: {
      evidence: { documents: [] },
      manifest: [],
      status: { ...EMPTY_CONVERSATION_DOCUMENT_STATUS, unusableFilenames: [] },
    },
    history: { messageCount: 0, hasOlder: false },
    projectContext: null,
    projectContextDiagnostic: "standalone",
    refreshProjectContextBeforeProvider: () => Promise.resolve(null),
  };
}

/**
 * Resolves the trusted context for one turn.
 *
 * An unowned or unknown conversation resolves to an empty context rather than an
 * error: the widget routes already authorize the conversation before calling
 * this, and the resolver must never widen scope for a chat the caller does not
 * own.
 */
export async function resolveWorkspaceContext(input: {
  userId: string;
  chatId: string | null;
  matterId?: string | null;
  clientPolicySlug?: unknown;
  historyLimit?: number;
}): Promise<WorkspaceContext> {
  const conversationId = input.chatId;
  const scope: WorkspaceContextScope = {
    userId: input.userId,
    conversationId,
    matterId: input.matterId ?? null,
    projectId: null,
  };
  if (!conversationId) {
    return emptyContext(scope);
  }

  const conversation = await getImmigrationConversationByChatId({
    chatId: conversationId,
    userId: input.userId,
    allowProject: true,
  });
  if (!conversation) {
    return emptyContext(scope);
  }

  const projectContext = await resolveProjectContext({
    actorUserId: input.userId,
    chatId: conversationId,
  });
  const [policyBinding, policyTopic, documents, history] = await Promise.all([
    getOwnedPolicyBindingView({ userId: input.userId, chatId: conversationId }),
    resolveConversationPolicyTopicContext({
      userId: input.userId,
      chatId: conversationId,
      clientSlug: input.clientPolicySlug,
    }),
    buildConversationDocumentContext({
      userId: input.userId,
      chatId: conversationId,
    }),
    listMessagesForChatPage({
      chatId: conversationId,
      userId: input.userId,
      limit: Math.min(
        input.historyLimit ?? DEFAULT_CONTEXT_HISTORY_LIMIT,
        MAX_CONTEXT_HISTORY_LIMIT
      ),
      olderThan: null,
    }),
  ]);

  return {
    scope: {
      ...scope,
      matterId: input.matterId ?? conversation.legalMatterId ?? null,
      projectId: projectContext.projectId,
    },
    conversation: {
      chatId: conversation.chatId,
      legalMatterId: conversation.legalMatterId ?? null,
      title: conversation.title ?? null,
      origin: "immigration",
      authorized: true,
    },
    policyBinding,
    policyTopic,
    documents: {
      evidence: documents.evidence,
      manifest: documents.manifest,
      status: documents.status,
    },
    history: {
      messageCount: history.messages.length,
      hasOlder: history.hasOlder,
    },
    projectContext: projectContext.packet,
    projectContextDiagnostic: projectContext.diagnostic,
    refreshProjectContextBeforeProvider: projectContext.refreshBeforeProvider,
  };
}
