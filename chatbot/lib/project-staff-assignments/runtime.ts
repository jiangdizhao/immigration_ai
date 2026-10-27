import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { projectStaffAssignmentRepository } from "@/lib/db/project-staff-assignment-repository";
import { projectStaffAssignmentSchemaAvailable } from "@/lib/db/project-staff-assignment-schema-availability";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimitStrict } from "@/lib/ratelimit";
import { createProjectStaffAssignmentHandlers } from "./http";

export const projectStaffAssignmentHandlers =
  createProjectStaffAssignmentHandlers({
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
        (await projectStaffAssignmentSchemaAvailable())
      );
    },
    repository: projectStaffAssignmentRepository,
    async rateLimit({ actorUserId, ipAddress, action }) {
      const mutation = [
        "admin_propose",
        "admin_transition",
        "owner_transition",
        "lawyer_transition",
      ].includes(action);
      const options = mutation
        ? { maxRequests: 12, ttlSeconds: 60 * 60 }
        : { maxRequests: 60, ttlSeconds: 60 * 60 };
      try {
        await checkIpRateLimitStrict(actorUserId, {
          ...options,
          keyPrefix: `phase13-m4-002-${action}-actor`,
        });
        if (ipAddress) {
          await checkIpRateLimitStrict(ipAddress, {
            maxRequests: options.maxRequests * 2,
            ttlSeconds: options.ttlSeconds,
            keyPrefix: `phase13-m4-002-${action}-ip`,
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
