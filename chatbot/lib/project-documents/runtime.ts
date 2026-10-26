import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { createProjectDocumentHandlers } from "./http";

/**
 * Customer routes are deliberately non-operational until independent B2 producer
 * authentication, privacy/retention consent and runtime adapters are approved.
 * Enabling the ordinary feature flag cannot supply that missing capability.
 */
export const projectDocumentHandlers = createProjectDocumentHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { userId: session.user.id, type: session.user.type };
  },
  isRegisteredCustomer: projectFoundationRepository.isRegisteredCustomer,
  schemaAvailable: projectFoundationSchemaAvailable,
  featureEnabled: () =>
    process.env.PHASE13_PROJECT_DOCUMENTS_ENABLED?.trim().toLowerCase() ===
    "true",
  trustedLiveReadiness: async () => false,
  application: null,
  async rateLimit({ actorUserId, projectId, action }) {
    try {
      await checkIpRateLimit(actorUserId, {
        maxRequests: action === "download" || action === "upload" ? 10 : 30,
        ttlSeconds: 60 * 60,
        keyPrefix: `phase13-project-documents-${action}-${projectId}`,
      });
      return true;
    } catch {
      return false;
    }
  },
});
