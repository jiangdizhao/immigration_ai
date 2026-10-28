import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { projectHumanMessagingRepository } from "@/lib/db/project-human-messaging-repository";
import { projectHumanMessagingSchemaAvailable } from "@/lib/db/project-human-messaging-schema-availability";
import { projectStaffAssignmentSchemaAvailable } from "@/lib/db/project-staff-assignment-schema-availability";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimitStrict } from "@/lib/ratelimit";
import { createProjectHumanMessagingHandlers } from "./http";

export const projectHumanMessagingHandlers =
  createProjectHumanMessagingHandlers({
    async authenticate() {
      const session = await auth();
      if (!session?.user?.id) {
        return null;
      }
      return { userId: session.user.id, type: session.user.type };
    },
    async schemaAvailable() {
      return (
        (await projectFoundationSchemaAvailable()) &&
        (await projectStaffAssignmentSchemaAvailable()) &&
        (await projectHumanMessagingSchemaAvailable())
      );
    },
    repository: projectHumanMessagingRepository,
    async rateLimit({ actorUserId, ipAddress, action }) {
      const mutation = [
        "thread_create",
        "message_send",
        "consent_withdraw",
      ].includes(action);
      const options = mutation
        ? { maxRequests: 30, ttlSeconds: 60 * 60 }
        : { maxRequests: 120, ttlSeconds: 60 * 60 };
      try {
        await checkIpRateLimitStrict(actorUserId, {
          ...options,
          keyPrefix: `phase13-m4-003-${action}-actor`,
        });
        if (ipAddress) {
          await checkIpRateLimitStrict(ipAddress, {
            maxRequests: options.maxRequests * 2,
            ttlSeconds: options.ttlSeconds,
            keyPrefix: `phase13-m4-003-${action}-ip`,
          });
        }
        return true;
      } catch (error) {
        if (error instanceof ChatbotError && error.type === "rate_limit") {
          return false;
        }
        throw error;
      }
    },
  });
