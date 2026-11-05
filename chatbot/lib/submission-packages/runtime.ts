import "server-only";

import { auth } from "@/app/(auth)/auth";
import { submissionPackageSchemaAvailable } from "@/lib/db/submission-package-schema-availability";
import { projectChatWritesEnabled } from "@/lib/projects/chat-policy";
import { schoolApplicationService } from "@/lib/school-applications/runtime";
import { student500PreparationService } from "@/lib/student-500/preparation/runtime";
import { submissionPackagesEnabled } from "./contracts";
import { createSubmissionPackageHandlers } from "./http";
import { createPostgresSubmissionPackageStore } from "./postgres-repository";
import { createSubmissionPackageService } from "./service";
import { createSubmissionTargetReader } from "./targets";

/**
 * Phase 13 M8.1 runtime wiring.
 *
 * Reuses the accepted M5.1 School Application service and the accepted M6.2 Student
 * 500 preparation service as the only upstream authorities, so a package can never
 * describe content those services would not authorize for this actor. The capability
 * is default-OFF (`PHASE13_SUBMISSION_PACKAGES_ENABLED`) and the schema probe fails
 * closed until migration 0051 is applied.
 */

const store = createPostgresSubmissionPackageStore();

const readTarget = createSubmissionTargetReader({
  school: {
    get: (input) => schoolApplicationService.get(input),
    // Exact frozen version, authorized and hash-verified by M5.1 itself.
    readPackageSnapshot: (input) =>
      schoolApplicationService.readPackageSnapshot(input),
  },
  student500: {
    // Exact pinned draft version: the M6.2 service applies present-time redaction,
    // so M8 never reconstructs content the actor may no longer read.
    get: (input) => student500PreparationService.get(input),
    getDraft: (input) => student500PreparationService.getDraft(input),
  },
});

export const submissionPackageService = createSubmissionPackageService({
  readTarget,
  store,
});

export const submissionPackageHandlers = createSubmissionPackageHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { type: session.user.type, userId: session.user.id };
  },
  enabled: () => submissionPackagesEnabled(),
  projectWritesEnabled: projectChatWritesEnabled,
  schemaAvailable: submissionPackageSchemaAvailable,
  service: submissionPackageService,
});
