import { z } from "zod";
import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import { importCompatibilityEntry } from "@/lib/policy-intelligence/compatibility-import";
import {
  crossSiteEditorialRequestGuard,
  editorialErrorResponse,
  invalidEditorialBody,
  readBoundedEditorialJsonBody,
} from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialRepository } from "@/lib/policy-intelligence/editorial-repository";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

const importSchema = z
  .object({ slug: z.string().trim().min(1).max(120) })
  .strict();

/**
 * Phase 12 Stage 3 owner-host correction — controlled, idempotent import of one
 * bundled compatibility entry into normal Policy Editor management.
 *
 * The import creates a *draft* manual revision through the audited editorial
 * service (verified Admin or a granted lawyer only, re-verified from the
 * database). Nothing publishes automatically, an existing durable item for the
 * slug is reported as already managed, and retries resolve through the recorded
 * idempotency key instead of duplicating content.
 */
export async function POST(request: Request) {
  const crossSite = crossSiteEditorialRequestGuard(request);
  if (crossSite) {
    return crossSite;
  }
  const admin = await requireAdminUser();
  if (admin instanceof Response) {
    return admin;
  }
  const body = await readBoundedEditorialJsonBody(request);
  if (body instanceof Response) {
    return body;
  }
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return invalidEditorialBody("slug");
  }
  const result = await importCompatibilityEntry({
    actorUserId: admin.id,
    slug: parsed.data.slug,
    service: policyEditorialService,
    repository: policyEditorialRepository,
  });
  if (result.status === "error") {
    return editorialErrorResponse(result);
  }
  return Response.json(result.value);
}
