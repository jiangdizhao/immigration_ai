import "server-only";

import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaStatus } from "@/lib/db/project-foundation-schema-availability";
import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";
import {
  countImmigrationConversations,
  createImmigrationConversation,
  getImmigrationConversationByChatId,
  getOwnedLegacyChatSummary,
  getOwnedProjectChatHistorySummary,
  listImmigrationConversationsPage,
  listMessagesForChatPage,
  updateImmigrationConversation,
} from "@/lib/db/queries";
import {
  createPolicyBoundConversation,
  getOwnedPolicyBindingView,
  listOwnedPolicyBindingViews,
} from "@/lib/policy-intelligence/conversation-policy-binding-service";
import type { ConversationHistoryRepository } from "./conversation-http";
import { createConversationHistoryHandlers } from "./conversation-http";

async function projectSchemaReadyOrAbsent() {
  const status = await projectFoundationSchemaStatus();
  if (status === "partial") {
    throw new Error("Project schema identity is incomplete.");
  }
  return status === "ready";
}

const repository: ConversationHistoryRepository = {
  async listConversations({ userId, limit, cursor }) {
    const projectSchemaAvailable = await projectSchemaReadyOrAbsent();
    return listImmigrationConversationsPage({
      userId,
      limit,
      cursor,
      projectSchemaAvailable,
    });
  },
  async countConversations({ userId }) {
    const projectSchemaAvailable = await projectSchemaReadyOrAbsent();
    return countImmigrationConversations({ userId, projectSchemaAvailable });
  },
  async createConversation({ userId, title, policySlug, policyLaunchId }) {
    /**
     * Phase 12 Stage 2: a policy launch creates the conversation together with
     * its durable binding in one transaction. The slug is resolved server-side
     * and a repeated/racing launch with the same launch id resolves to the same
     * conversation instead of creating a second empty one.
     */
    if (policySlug) {
      const outcome = await createPolicyBoundConversation({
        userId,
        title,
        slug: policySlug,
        launchId: policyLaunchId ?? null,
      });
      if (outcome.status === "resolved") {
        return {
          ok: true,
          conversation: {
            chatId: outcome.conversation.chatId,
            legalMatterId: outcome.conversation.legalMatterId,
            title: outcome.conversation.title,
            chatTitle: outcome.conversation.title ?? title,
            createdAt: outcome.conversation.createdAt,
            updatedAt: outcome.conversation.updatedAt,
            origin: "immigration" as const,
          },
          policyBinding: outcome.binding,
        };
      }
      if (outcome.status === "schema_unavailable") {
        /**
         * Rollout compatibility: the binding table is not deployed in this
         * database, so the launch cannot be persisted. No conversation is
         * created here at all — a policy launch must never degrade into an
         * apparently successful generic conversation.
         */
        return {
          ok: false,
          status: 503,
          code: "policy_binding_unavailable",
          retryable: true,
          unavailable: "policy_binding_schema",
        };
      }
      if (outcome.status === "launch_in_progress") {
        return {
          ok: false,
          status: 409,
          code: "policy_launch_in_progress",
          retryable: true,
        };
      }
      // `resolve_failed`: never create an apparently successful conversation
      // for a policy that cannot be resolved.
      return {
        ok: false,
        status: 404,
        code: "policy_topic_unavailable",
        retryable: false,
      };
    }

    const created = await createImmigrationConversation({ userId, title });
    return {
      ok: true,
      conversation: {
        chatId: created.chatId,
        legalMatterId: created.legalMatterId ?? null,
        title: created.title ?? null,
        chatTitle: created.title ?? title,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        origin: "immigration" as const,
      },
      policyBinding: null,
    };
  },
  async getConversation({ chatId, userId }) {
    const projectSchemaAvailable = await projectSchemaReadyOrAbsent();
    if (projectSchemaAvailable) {
      const origin =
        await projectFoundationRepository.getProjectChatOrigin(chatId);
      if (origin) {
        return await getOwnedProjectChatHistorySummary({ chatId, userId });
      }
    }
    const conversation = await getImmigrationConversationByChatId({
      chatId,
      userId,
    });
    if (conversation) {
      return {
        chatId: conversation.chatId,
        legalMatterId: conversation.legalMatterId ?? null,
        title: conversation.title ?? null,
        chatTitle: conversation.chatTitle,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        origin: "immigration" as const,
      };
    }
    // Phase 12 Stage 1 R1: a legacy owner chat that holds messages but has no
    // immigration conversation row stays readable. Messages are still
    // authorized by Chat ownership and nothing is created or repaired here.
    return await getOwnedLegacyChatSummary({ chatId, userId });
  },
  async listMessages({ chatId, userId, limit, olderThan }) {
    const projectSchemaAvailable = await projectSchemaReadyOrAbsent();
    return listMessagesForChatPage({
      chatId,
      userId,
      limit,
      olderThan,
      projectSchemaAvailable,
    });
  },
  /**
   * Phase 12 Stage 2: the policy topic card is recovered from the persisted
   * binding on every read path (reload, history reopening, second device). The
   * lookups are owner-scoped, so a guessed chat id can never leak another
   * account's policy topic.
   */
  getPolicyBinding: ({ chatId, userId }) =>
    getOwnedPolicyBindingView({ chatId, userId }),
  listPolicyBindings: ({ userId, chatIds }) =>
    listOwnedPolicyBindingViews({ userId, chatIds }),
  async updateConversation(input) {
    const projectSchemaAvailable = await projectSchemaReadyOrAbsent();
    if (projectSchemaAvailable) {
      const origin = await projectFoundationRepository.getProjectChatOrigin(
        input.chatId
      );
      if (origin) {
        let updated: Awaited<
          ReturnType<typeof projectFoundationRepository.updateOwnedProjectChat>
        >;
        try {
          updated = await projectFoundationRepository.updateOwnedProjectChat({
            actorUserId: input.userId,
            chatId: input.chatId,
            title: input.title,
            legalMatterId: input.legalMatterId,
          });
        } catch (error) {
          if (
            error instanceof ProjectFoundationError &&
            ["project_forbidden", "project_closed", "invalid_request"].includes(
              error.code
            )
          ) {
            return null;
          }
          throw error;
        }
        return updated
          ? {
              chatId: updated.chatId,
              legalMatterId: null,
              title: updated.title,
              chatTitle: updated.title ?? "Project conversation",
              createdAt: updated.createdAt,
              updatedAt: updated.updatedAt,
              origin: "project" as const,
              projectId: updated.projectId,
              readOnly: false,
            }
          : null;
      }
    }
    const updated = await updateImmigrationConversation(input);
    return updated
      ? {
          chatId: updated.chatId,
          legalMatterId: updated.legalMatterId ?? null,
          title: updated.title ?? null,
          chatTitle: updated.title ?? "Immigration conversation",
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        }
      : null;
  },
};

export function getConversationHistoryRepository() {
  return repository;
}

export function createDatabaseConversationHistoryHandlers(
  authenticate: Parameters<
    typeof createConversationHistoryHandlers
  >[0]["authenticate"]
) {
  return createConversationHistoryHandlers({ authenticate, repository });
}
