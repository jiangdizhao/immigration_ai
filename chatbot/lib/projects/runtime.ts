import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { createProjectFoundationHandlers } from "./http";

export const projectFoundationHandlers = createProjectFoundationHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { userId: session.user.id, type: session.user.type };
  },
  isRegisteredCustomer: (userId) =>
    projectFoundationRepository.isRegisteredCustomer(userId),
  schemaAvailable: projectFoundationSchemaAvailable,
  repository: projectFoundationRepository,
  async rateLimit({ actorUserId, ipAddress, action }) {
    const invite = action === "invite";
    const options = invite
      ? { maxRequests: 10, ttlSeconds: 60 * 60 }
      : { maxRequests: 60, ttlSeconds: 60 * 60 };
    try {
      await checkIpRateLimit(actorUserId, {
        ...options,
        keyPrefix: `phase13-m1-2-${action}-actor`,
      });
      if (ipAddress) {
        await checkIpRateLimit(ipAddress, {
          maxRequests: options.maxRequests * 2,
          ttlSeconds: options.ttlSeconds,
          keyPrefix: `phase13-m1-2-${action}-ip`,
        });
      }
      return true;
    } catch (error) {
      return !(error instanceof ChatbotError && error.type === "rate_limit");
    }
  },
});
