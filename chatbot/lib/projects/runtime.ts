import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { projectChatWritesEnabled } from "./chat-policy";
import { projectCreateRateLimit } from "./create-limit";
import { createProjectFoundationHandlers } from "./http";

export const projectFoundationHandlers = createProjectFoundationHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { userId: session.user.id, type: session.user.type };
  },
  schemaAvailable: projectFoundationSchemaAvailable,
  writesEnabled: projectChatWritesEnabled,
  repository: projectFoundationRepository,
  async rateLimit({ actorType, actorUserId, ipAddress, action }) {
    try {
      if (action === "project_create") {
        // Correction B: bounded creation. Guests get the stricter tier, and the
        // authoritative bound remains the per-actor active-Project cap enforced
        // inside the repository transaction.
        const limits = projectCreateRateLimit(actorType);
        await checkIpRateLimit(actorUserId, {
          maxRequests: limits.actor,
          ttlSeconds: limits.ttlSeconds,
          keyPrefix: "phase13-p1-project-create-actor",
        });
        if (ipAddress) {
          // Best-effort only: x-forwarded-for is not verified attribution, so
          // this is an abuse speed bump, never a security boundary.
          await checkIpRateLimit(ipAddress, {
            maxRequests: limits.ip,
            ttlSeconds: limits.ttlSeconds,
            keyPrefix: "phase13-p1-project-create-ip",
          });
        }
        return true;
      }
      const invite = action === "invite";
      const options = invite
        ? { maxRequests: 10, ttlSeconds: 60 * 60 }
        : { maxRequests: 60, ttlSeconds: 60 * 60 };
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
