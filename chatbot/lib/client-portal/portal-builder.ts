import type {
  getLiveVipSubscriptionForUser,
  getUserEntitlementById,
  listImmigrationConversations,
  listLawyerClarificationRequestsForUser,
  listMatterDocumentsForPortal,
} from "@/lib/db/queries";
import type { SiteLocale } from "@/lib/site-locale";
import { isMatterDocumentSchemaUnavailable } from "./document-schema";
import { groupOwnedConversations, MAX_PORTAL_CONVERSATIONS } from "./grouping";
import {
  projectLawyerRequests,
  projectMatterSnapshot,
  projectMembership,
  projectPortalDocuments,
} from "./projections";
import type {
  ClientPortalView,
  PortalActivity,
  PortalMatterGroup,
} from "./types";

const MAX_DOCUMENTS = 400;
const MAX_LAWYER_REQUESTS = 100;
const MAX_RECENT_ACTIVITY = 20;
const MATTER_FETCH_CONCURRENCY = 4;

export class ClientPortalRoleError extends Error {
  constructor() {
    super("Customer portal access is required.");
    this.name = "ClientPortalRoleError";
  }
}

function timestamp(value: string | Date | null | undefined) {
  if (!value) {
    return 0;
  }
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  map: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= values.length) {
          return;
        }
        results[index] = await map(values[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

export type ClientPortalDependencies = {
  listConversations: typeof listImmigrationConversations;
  listDocuments: typeof listMatterDocumentsForPortal;
  listLawyerRequests: typeof listLawyerClarificationRequestsForUser;
  getEntitlement: typeof getUserEntitlementById;
  getSubscription: typeof getLiveVipSubscriptionForUser;
  fetchMatter: (matterId: string) => Promise<unknown | null>;
};

function attachRecordData(
  groups: PortalMatterGroup[],
  documents: ReturnType<typeof projectPortalDocuments>,
  lawyerRequests: ReturnType<typeof projectLawyerRequests>
) {
  const groupByChat = new Map<string, PortalMatterGroup>();
  for (const group of groups) {
    for (const conversation of group.conversations) {
      groupByChat.set(conversation.chatId, group);
    }
  }
  for (const document of documents) {
    groupByChat.get(document.chatId)?.documents.push(document);
  }
  const groupByMatter = new Map<string, PortalMatterGroup>();
  for (const group of groups) {
    if (group.legalMatterId) {
      groupByMatter.set(group.legalMatterId, group);
    }
  }
  for (const request of lawyerRequests) {
    const group = request.chatId
      ? groupByChat.get(request.chatId)
      : request.legalMatterId
        ? groupByMatter.get(request.legalMatterId)
        : undefined;
    group?.lawyerRequests.push(request);
  }
  return groupByChat;
}

function recentActivity(groups: PortalMatterGroup[]): PortalActivity[] {
  const events: PortalActivity[] = [];
  for (const group of groups) {
    for (const conversation of group.conversations) {
      events.push({
        id: `conversation:${conversation.chatId}`,
        kind: "conversation",
        groupKey: group.groupKey,
        chatId: conversation.chatId,
        occurredAt: conversation.updatedAt,
      });
    }
    for (const document of group.documents) {
      events.push({
        id: `document:${document.documentId}`,
        kind: "document",
        groupKey: group.groupKey,
        chatId: document.chatId,
        occurredAt: document.updatedAt,
      });
    }
    for (const request of group.lawyerRequests) {
      events.push({
        id: `lawyer-request:${request.requestId}`,
        kind: "lawyer_request",
        groupKey: group.groupKey,
        chatId: request.chatId ?? group.defaultContinuationChatId,
        requestId: request.requestId,
        occurredAt: request.updatedAt,
      });
    }
  }
  return events
    .sort((a, b) => timestamp(b.occurredAt) - timestamp(a.occurredAt))
    .slice(0, MAX_RECENT_ACTIVITY);
}

export async function buildClientPortalViewWithDependencies(
  { userId, email }: { userId: string; email: string },
  locale: SiteLocale,
  dependencies: ClientPortalDependencies
): Promise<ClientPortalView> {
  // This owner-scoped conversation query is deliberately the first data read.
  const ownedConversations = await dependencies.listConversations({
    userId,
    limit: MAX_PORTAL_CONVERSATIONS,
  });
  const groups = groupOwnedConversations(ownedConversations);
  const chatIds = new Set(
    groups.flatMap((group) => group.conversations.map((item) => item.chatId))
  );
  const groupLegalMatterIdByChat = new Map<string, string | null>();
  for (const group of groups) {
    for (const conversation of group.conversations) {
      groupLegalMatterIdByChat.set(conversation.chatId, group.legalMatterId);
    }
  }

  const documentQuery = Promise.resolve()
    .then(() =>
      dependencies.listDocuments({
        userId,
        chatIds: [...chatIds],
        limit: MAX_DOCUMENTS,
      })
    )
    .then((rows) => ({ available: true as const, rows }))
    .catch((error: unknown) => {
      if (!isMatterDocumentSchemaUnavailable(error)) {
        throw error;
      }
      return { available: false as const, rows: [] };
    });
  const [documentResult, lawyerRows, entitlement, subscription] =
    await Promise.all([
      documentQuery,
      dependencies.listLawyerRequests({ userId }),
      dependencies.getEntitlement(userId),
      dependencies.getSubscription(userId),
    ]);
  if (entitlement?.role !== "user") {
    throw new ClientPortalRoleError();
  }

  const documents = projectPortalDocuments(documentResult.rows, {
    userId,
    chatIds,
    groupLegalMatterIdByChat,
  }).slice(0, MAX_DOCUMENTS);
  const lawyerRequests = projectLawyerRequests(lawyerRows, {
    userId,
    chatIds,
    legalMatterIds: new Set(
      groups.flatMap((group) =>
        group.legalMatterId ? [group.legalMatterId] : []
      )
    ),
  }).slice(0, MAX_LAWYER_REQUESTS);
  attachRecordData(groups, documents, lawyerRequests);
  const activityTime = (value: string | Date | null) => timestamp(value);
  for (const group of groups) {
    const relatedTimestamps = [
      ...group.documents.map((item) => item.updatedAt),
      ...group.lawyerRequests.map((item) => item.updatedAt),
    ];
    for (const candidate of relatedTimestamps) {
      if (activityTime(candidate) > activityTime(group.latestActivityAt)) {
        group.latestActivityAt = candidate;
      }
    }
  }
  groups.sort(
    (a, b) => timestamp(b.latestActivityAt) - timestamp(a.latestActivityAt)
  );

  // Matter IDs originate only from groups built from the owned conversation rows.
  const matterIds = [
    ...new Set(
      groups.flatMap((group) =>
        group.legalMatterId ? [group.legalMatterId] : []
      )
    ),
  ];
  const fetchedSnapshots = await mapWithConcurrency(
    matterIds,
    MATTER_FETCH_CONCURRENCY,
    async (matterId) => {
      try {
        return [matterId, await dependencies.fetchMatter(matterId)] as const;
      } catch {
        return [matterId, null] as const;
      }
    }
  );
  const snapshotByMatterId = new Map(fetchedSnapshots);
  for (const group of groups) {
    if (!group.legalMatterId) {
      continue;
    }
    const rawSnapshot = snapshotByMatterId.get(group.legalMatterId) ?? null;
    group.matterSnapshot = projectMatterSnapshot(
      rawSnapshot,
      group.legalMatterId,
      locale
    );
    group.matterSnapshotUnavailable = group.matterSnapshot === null;
  }

  const membership = projectMembership({
    role: entitlement.role,
    membershipTier: entitlement.membershipTier,
    vipExpiresAt: entitlement.vipExpiresAt,
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
  });
  return {
    account: { email: email.slice(0, 254) },
    summary: {
      matterGroupCount: groups.length,
      conversationCount: groups.reduce(
        (sum, group) => sum + group.conversations.length,
        0
      ),
      documentCount: documentResult.available ? documents.length : null,
      lawyerRequestCount: lawyerRequests.length,
    },
    documentsAvailable: documentResult.available,
    membership,
    matterGroups: groups,
    recentActivity: recentActivity(groups),
  };
}
