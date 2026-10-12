import { DEFAULT_CHAT_MODEL } from "../ai/models";
import type { AssistantMode } from "../assistant-mode";

/**
 * Phase 12 Stage 2 hotfix — request construction for one widget turn.
 *
 * The same body is posted to all three widget routes (Fast, Legal Check and
 * Premium), so this module owns the single construction path they all consume.
 * It exists as a pure function so the real request contract can be tested without
 * a browser or a mocked fetch.
 */

export type WidgetTurnRequestBody = {
  id: string;
  frontendChatId: string;
  clientTurnId?: string;
  matterId: string | null;
  intakeFacts: Record<string, unknown>;
  currentIntakeFacts: Record<string, unknown>;
  answerPreference: string;
  selectedChatModel: string;
  assistantMode: AssistantMode;
  /**
   * Present only for a conversation that has a persisted policy binding for this
   * exact conversation id. Absent — never JSON `null` — when there is no policy.
   */
  policySlug?: string;
  messages: Array<{
    id: string;
    role: string;
    parts: Array<{ type: "text"; text: string }>;
  }>;
};

/**
 * The request-scoped policy hint: the conversation's own persisted binding slug.
 *
 * It is only a topic hint for the backend, which resolves the binding again from
 * storage, so this value can never widen access, invent a policy identity or
 * adopt a policy from a URL parameter. A binding for a different conversation is
 * ignored.
 */
export function requestPolicySlugForConversation(input: {
  conversationId: string;
  bindingChatId: string | null | undefined;
  bindingSlug: string | null | undefined;
}): string | null {
  if (!input.bindingChatId || !input.bindingSlug) {
    return null;
  }
  return input.bindingChatId === input.conversationId
    ? input.bindingSlug
    : null;
}

/**
 * Builds the widget turn body.
 *
 * `policySlug` is **omitted** when the conversation has no persisted binding.
 * Sending an explicit `null` used to be rejected by the route schemas and broke
 * ordinary conversations; omitting the field expresses the same "no hint" state
 * without inventing a policy. A real binding slug is forwarded unchanged.
 */
export function buildWidgetTurnRequestBody(input: {
  conversationId: string;
  clientTurnId?: string;
  matterId: string | null;
  intakeFacts: Record<string, unknown>;
  currentIntakeFacts: Record<string, unknown>;
  answerPreference: string;
  assistantMode: AssistantMode;
  policySlug: string | null;
  messages: Array<{ id: string; role: string; text: string }>;
  selectedChatModel?: string;
}): WidgetTurnRequestBody {
  const body: WidgetTurnRequestBody = {
    id: input.conversationId,
    frontendChatId: input.conversationId,
    matterId: input.matterId,
    intakeFacts: input.intakeFacts,
    currentIntakeFacts: input.currentIntakeFacts,
    answerPreference: input.answerPreference,
    selectedChatModel: input.selectedChatModel ?? DEFAULT_CHAT_MODEL,
    assistantMode: input.assistantMode,
    messages: input.messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: "text", text: message.text }],
    })),
  };
  if (input.clientTurnId) {
    body.clientTurnId = input.clientTurnId;
  }
  if (input.policySlug) {
    body.policySlug = input.policySlug;
  }
  return body;
}
