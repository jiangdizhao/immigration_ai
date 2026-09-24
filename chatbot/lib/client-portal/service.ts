import "server-only";
import {
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
};

export function buildClientPortalView(
  identity: { userId: string; email: string },
  locale: SiteLocale,
  dependencies: ClientPortalDependencies = defaultDependencies
) {
  return buildClientPortalViewWithDependencies(identity, locale, dependencies);
}
