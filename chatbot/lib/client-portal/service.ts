import "server-only";
import { consultationSchemaAvailability } from "@/lib/consultations/schema-availability";
import { listCustomerConsultations } from "@/lib/consultations/service";
import { consultationRequestView } from "@/lib/consultations/views";
import {
  getConsultationUserIdentity,
  getLiveVipSubscriptionForUser,
  getUserEntitlementById,
  listImmigrationConversations,
  listLawyerClarificationRequestsForUser,
  listMatterDocumentsForPortal,
} from "@/lib/db/queries";
import type { SiteLocale } from "@/lib/site-locale";
import { fetchLegalMatterSnapshot } from "./matter-fetch";
import {
  buildClientPortalViewWithDependencies,
  type ClientPortalDependencies,
} from "./portal-builder";

export { fetchLegalMatterSnapshot } from "./matter-fetch";
export { ClientPortalRoleError } from "./portal-builder";

function fetchOwnedMatterSnapshot(matterId: string) {
  return fetchLegalMatterSnapshot(matterId, {
    baseUrl: process.env.LEGAL_SERVICE_URL ?? "http://127.0.0.1:8000",
    apiKey: process.env.LEGAL_SERVICE_API_KEY,
  });
}

const defaultDependencies: ClientPortalDependencies = {
  listConversations: listImmigrationConversations,
  listDocuments: listMatterDocumentsForPortal,
  listLawyerRequests: listLawyerClarificationRequestsForUser,
  getEntitlement: getUserEntitlementById,
  getSubscription: getLiveVipSubscriptionForUser,
  fetchMatter: fetchOwnedMatterSnapshot,
  getConsultationCustomerIdentity: getConsultationUserIdentity,
  getConsultationAvailability: consultationSchemaAvailability,
  listConsultations: async (userId) =>
    (await listCustomerConsultations(userId)).map((record) => {
      const item = consultationRequestView(record);
      return {
        consultationId: item.id,
        status: item.status,
        updatedAt: item.updatedAt,
        scheduledStartAt: item.scheduledStartAt,
        scheduledEndAt: item.scheduledEndAt,
        assigned: item.assigned,
      };
    }),
};

export function buildClientPortalView(
  identity: { userId: string; email: string },
  locale: SiteLocale,
  dependencies: ClientPortalDependencies = defaultDependencies
) {
  return buildClientPortalViewWithDependencies(identity, locale, dependencies);
}
