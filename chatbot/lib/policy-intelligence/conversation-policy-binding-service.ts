import "server-only";

import {
  createImmigrationConversationWithPolicyBinding,
  findOwnedConversationByPolicyLaunchId,
  getImmigrationConversationByChatId,
  getOwnedConversationPolicyBinding,
  listOwnedConversationPolicyBindings,
} from "@/lib/db/queries";
import { resolvePublishedWorkspaceReference } from "../policy-intelligence-product";
import { getPolicyIntelligenceProductState } from "../policy-intelligence-server";
import {
  type ConversationPolicyBindingView,
  conversationPolicyBindingDraft,
  policyWorkspaceReferenceFromBinding,
  projectPolicyBindingView,
  resolveConversationPolicyTopic,
} from "./conversation-policy-binding";
import { conversationPolicyBindingSchemaAvailable } from "./conversation-policy-binding-schema";

/**
 * Phase 12 Stage 2 — durable, owner-authorized policy-to-conversation binding.
 *
 * The client may only *request* a policy by slug. Every persisting path resolves
 * that slug here, against the trusted published policy read, and stores the
 * server's own snapshot. A forged, mismatched or cross-user slug therefore
 * cannot create an authoritative binding, and a binding can only ever be read
 * back through the conversation its owner is authorized to open.
 */

export type PolicyLaunchConversation = {
  chatId: string;
  legalMatterId: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PolicyLaunchOutcome =
  | { status: "not_requested" }
  | {
      status: "resolved";
      binding: ConversationPolicyBindingView;
      conversation: PolicyLaunchConversation;
    }
  | { status: "resolve_failed" }
  | { status: "schema_unavailable" }
  | { status: "launch_in_progress" };

let cachedSchemaAvailability: boolean | null = null;

export async function conversationBindingSchemaAvailable(): Promise<boolean> {
  if (cachedSchemaAvailability !== null) {
    return cachedSchemaAvailability;
  }
  cachedSchemaAvailability = await conversationPolicyBindingSchemaAvailable();
  return cachedSchemaAvailability;
}

/** Test-only reset so the probe cache cannot leak across cases. */
export function resetConversationBindingSchemaCache() {
  cachedSchemaAvailability = null;
}

/**
 * Resolves a client-requested slug into the persisted snapshot using the same
 * trusted publication gate the policy detail page uses. A slug that is not a
 * currently published policy resolves to `null`, so a launch can never invent
 * a binding for an unknown, archived or unpublished topic.
 */
export async function resolvePolicyBindingDraft(input: {
  slug: string;
  launchId?: string | null;
}) {
  const state = await getPolicyIntelligenceProductState();
  const reference = await resolvePublishedWorkspaceReference(
    input.slug,
    async (slug) =>
      state.policies.find((policy) => policy.slug === slug) ?? null
  );
  if (!reference || reference.slug !== input.slug) {
    return null;
  }
  const policy = state.policies.find((entry) => entry.slug === reference.slug);
  if (!policy) {
    return null;
  }
  return conversationPolicyBindingDraft({ policy, launchId: input.launchId });
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Creates (or resolves) the conversation for a policy launch.
 *
 * `launchId` makes a retried or racing launch idempotent: the second caller gets
 * the conversation the first caller created instead of a second empty one. A new
 * launch uses a new `launchId`, so the user keeps an explicit way to start a
 * separate conversation about the same policy.
 */
export async function createPolicyBoundConversation(input: {
  userId: string;
  title: string;
  slug: string;
  launchId?: string | null;
}): Promise<PolicyLaunchOutcome> {
  if (!(await conversationBindingSchemaAvailable())) {
    return { status: "schema_unavailable" };
  }
  if (input.launchId) {
    const existing = await findOwnedConversationByPolicyLaunchId({
      userId: input.userId,
      launchId: input.launchId,
    });
    if (existing) {
      return {
        status: "resolved",
        binding: projectPolicyBindingView(existing.binding),
        conversation: {
          chatId: existing.chatId,
          legalMatterId: existing.legalMatterId ?? null,
          title: existing.title ?? null,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        },
      };
    }
  }
  const draft = await resolvePolicyBindingDraft({
    slug: input.slug,
    launchId: input.launchId ?? null,
  });
  if (!draft) {
    return { status: "resolve_failed" };
  }
  try {
    const created = await createImmigrationConversationWithPolicyBinding({
      userId: input.userId,
      title: input.title,
      binding: draft,
    });
    return {
      status: "resolved",
      binding: projectPolicyBindingView(created.binding),
      conversation: {
        chatId: created.conversation.chatId,
        legalMatterId: created.conversation.legalMatterId ?? null,
        title: created.conversation.title ?? null,
        createdAt: created.conversation.createdAt,
        updatedAt: created.conversation.updatedAt,
      },
    };
  } catch (error) {
    // A concurrent identical launch can win the unique launch index. That is a
    // duplicate-suppression outcome, not an error: return the winning row.
    if (input.launchId && isUniqueViolation(error)) {
      const existing = await findOwnedConversationByPolicyLaunchId({
        userId: input.userId,
        launchId: input.launchId,
      });
      if (existing) {
        return {
          status: "resolved",
          binding: projectPolicyBindingView(existing.binding),
          conversation: {
            chatId: existing.chatId,
            legalMatterId: existing.legalMatterId ?? null,
            title: existing.title ?? null,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
          },
        };
      }
      return { status: "launch_in_progress" };
    }
    throw error;
  }
}

export async function getOwnedPolicyBindingView(input: {
  userId: string;
  chatId: string;
}): Promise<ConversationPolicyBindingView | null> {
  if (input.chatId && !(await conversationBindingSchemaAvailable())) {
    return null;
  }
  const record = await getOwnedConversationPolicyBinding(input);
  return record ? projectPolicyBindingView(record) : null;
}

export async function listOwnedPolicyBindingViews(input: {
  userId: string;
  chatIds: string[];
}): Promise<Map<string, ConversationPolicyBindingView>> {
  const result = new Map<string, ConversationPolicyBindingView>();
  if (!input.chatIds.length) {
    return result;
  }
  if (!(await conversationBindingSchemaAvailable())) {
    return result;
  }
  const rows = await listOwnedConversationPolicyBindings(input);
  for (const row of rows) {
    result.set(row.chatId, projectPolicyBindingView(row));
  }
  return result;
}

/**
 * The workspace topic reference for an owned conversation, used for the visible
 * policy card and for the request-scoped topic hint.
 */
export async function getConversationPolicyWorkspaceReference(input: {
  userId: string;
  chatId: string;
}) {
  const binding = await getOwnedPolicyBindingView(input);
  return binding ? policyWorkspaceReferenceFromBinding(binding) : null;
}

/**
 * Resolves the request-scoped policy topic for a widget turn.
 *
 * Returns the stored binding's slug when the conversation is owned, and only
 * falls back to a client-supplied slug while the binding table is absent from
 * the deployed schema (pre-migration rollout). The fallback stays restricted to
 * conversations the caller owns, and never applies to a cross-user chat.
 */
export async function resolveConversationPolicyTopicContext(input: {
  userId: string;
  chatId: string | null;
  clientSlug?: unknown;
}) {
  let binding: ConversationPolicyBindingView | null = null;
  let ownedConversation = false;
  const schemaAvailable = await conversationBindingSchemaAvailable();
  if (input.chatId) {
    const conversation = await getImmigrationConversationByChatId({
      chatId: input.chatId,
      userId: input.userId,
    });
    ownedConversation = Boolean(conversation);
    if (ownedConversation && schemaAvailable) {
      binding = await getOwnedPolicyBindingView({
        userId: input.userId,
        chatId: input.chatId,
      });
    }
  }
  return resolveConversationPolicyTopic({
    binding,
    bindingSchemaAvailable: schemaAvailable,
    ownedConversation,
    clientSlug: input.clientSlug,
  });
}
