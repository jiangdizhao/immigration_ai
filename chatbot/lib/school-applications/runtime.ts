import "server-only";

import { auth } from "@/app/(auth)/auth";
import { schoolApplicationSchemaAvailable } from "@/lib/db/school-application-schema-availability";
import { schoolApplicationsEnabled } from "./contracts";
import { createSchoolApplicationHandlers } from "./http";
import {
  postgresSchoolApplicationCatalogResolver,
  postgresSchoolApplicationReferenceResolver,
  postgresSchoolApplicationStore,
} from "./postgres-repository";
import { createSchoolApplicationService } from "./service";

/**
 * Phase 13 M5.1 runtime wiring.
 *
 * The capability is default-OFF (`PHASE13_SCHOOL_APPLICATIONS_ENABLED`), so the
 * whole surface is absent from production until an explicit owner decision. The
 * schema probe fails closed because migration 0046 is unapplied here.
 */
export const schoolApplicationService = createSchoolApplicationService({
  catalogResolver: postgresSchoolApplicationCatalogResolver,
  referenceResolver: postgresSchoolApplicationReferenceResolver,
  store: postgresSchoolApplicationStore,
});

export const schoolApplicationHandlers = createSchoolApplicationHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { type: session.user.type, userId: session.user.id };
  },
  enabled: () => schoolApplicationsEnabled(),
  schemaAvailable: schoolApplicationSchemaAvailable,
  service: schoolApplicationService,
});
