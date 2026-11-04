import "server-only";

import { auth } from "@/app/(auth)/auth";
import { student500SchemaAvailable } from "@/lib/db/student-500-schema-availability";
import { projectChatWritesEnabled } from "@/lib/projects/chat-policy";
import { student500ApplicationsEnabled } from "./contracts";
import { createStudent500Handlers } from "./http";
import { resolveStudent500LegalSourceProvider } from "./legal-source-provider";
import {
  createPostgresStudent500Store,
  postgresStudent500SchoolApplicationLinkResolver,
} from "./postgres-repository";
import { createStudent500RequirementResolver } from "./requirement-resolver";
import { createStudent500Service } from "./service";

/**
 * Phase 13 M6.1 runtime wiring.
 *
 * Provider selection is delegated to `resolveStudent500LegalSourceProvider()` so
 * the manifest adapter is what the customer surface actually uses, and
 * `STUDENT_500_LEGAL_SOURCE_PROVIDER=declared` restores the conservative catalog.
 *
 * The capability is default-OFF in production-like environments
 * (`PHASE13_STUDENT500_ENABLED` may override), so the surface is absent from
 * production until an explicit owner decision. The schema probe fails closed
 * because migration 0048 is unapplied here.
 */
export const student500Service = createStudent500Service({
  resolver: createStudent500RequirementResolver({
    provider: resolveStudent500LegalSourceProvider(),
  }),
  schoolApplicationLink: postgresStudent500SchoolApplicationLinkResolver,
  store: createPostgresStudent500Store(),
});

export const student500Handlers = createStudent500Handlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { type: session.user.type, userId: session.user.id };
  },
  enabled: () => student500ApplicationsEnabled(),
  projectWritesEnabled: projectChatWritesEnabled,
  schemaAvailable: student500SchemaAvailable,
  service: student500Service,
});
