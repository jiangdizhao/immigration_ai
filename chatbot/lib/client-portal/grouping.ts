import type { PortalConversation, PortalMatterGroup } from "./types";

export const MAX_PORTAL_CONVERSATIONS = 80;
export const MAX_PORTAL_GROUPS = 50;

export type OwnedConversationInput = {
  chatId: string;
  legalMatterId?: string | null;
  title?: string | null;
  chatTitle?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

function timeValue(value: string | Date | null | undefined) {
  if (!value) {
    return 0;
  }
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function portalGroupKey(chatId: string, legalMatterId?: string | null) {
  return legalMatterId !== null && legalMatterId !== undefined
    ? `matter:${legalMatterId}`
    : `chat:${chatId}`;
}

export function groupOwnedConversations(
  rows: OwnedConversationInput[],
  {
    conversationLimit = MAX_PORTAL_CONVERSATIONS,
    groupLimit = MAX_PORTAL_GROUPS,
  } = {}
): PortalMatterGroup[] {
  const conversations = rows
    .map(
      (row): PortalConversation => ({
        chatId: row.chatId,
        legalMatterId: row.legalMatterId ?? null,
        title: (row.title ?? row.chatTitle ?? "Immigration conversation").slice(
          0,
          160
        ),
        createdAt: row.createdAt ?? null,
        updatedAt: row.updatedAt ?? null,
      })
    )
    .sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt))
    .slice(
      0,
      Math.min(MAX_PORTAL_CONVERSATIONS, Math.max(0, conversationLimit))
    );

  const groups = new Map<string, PortalMatterGroup>();
  for (const conversation of conversations) {
    const groupKey = portalGroupKey(
      conversation.chatId,
      conversation.legalMatterId
    );
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        groupKey,
        legalMatterId: conversation.legalMatterId,
        provisional: conversation.legalMatterId === null,
        displayTitle: conversation.title,
        conversations: [],
        defaultContinuationChatId: conversation.chatId,
        latestActivityAt: conversation.updatedAt,
        matterSnapshot: null,
        matterSnapshotUnavailable: false,
        documents: [],
        lawyerRequests: [],
      };
      groups.set(groupKey, group);
    }
    group.conversations.push(conversation);
  }

  return [...groups.values()]
    .sort(
      (a, b) => timeValue(b.latestActivityAt) - timeValue(a.latestActivityAt)
    )
    .slice(0, Math.min(MAX_PORTAL_GROUPS, Math.max(0, groupLimit)));
}

export function preservePortalGroupSelection(
  groups: Pick<PortalMatterGroup, "groupKey">[],
  currentGroupKey: string | null
): string | null {
  if (
    currentGroupKey &&
    groups.some((group) => group.groupKey === currentGroupKey)
  ) {
    return currentGroupKey;
  }
  return groups[0]?.groupKey ?? null;
}
