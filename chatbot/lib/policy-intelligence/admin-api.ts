import { z } from "zod";
import type { AdminPublicationDiagnostics } from "./publication-diagnostics";

export type AdminPolicyIntelligenceSnapshot = {
  sourceUrl: string;
  retrievedAt: string;
  sourceTitle: string;
};

export type AdminPolicyIntelligenceRevision = {
  revisionNumber: number;
  generatedAt: string;
  editorialStatus: string;
};

export type AdminPolicyIntelligenceItem = {
  id: string;
  slug: string;
  title: string | null;
  authority: string | null;
  sourceConfigId: string;
  sourceStatus: string;
  editorialStatus: string;
  publishedAt: string | null;
  updatedAt: string;
  latestSnapshot: AdminPolicyIntelligenceSnapshot | null;
  latestRevision: AdminPolicyIntelligenceRevision | null;
  publicationDiagnostics: AdminPublicationDiagnostics;
};

export type AdminPolicyIntelligenceUpdate =
  | {
      status: "updated";
      editorialStatus: "archived" | "published" | "review_required";
    }
  | { status: "not_found" }
  | { status: "not_archived" };

export type AdminPolicyIntelligenceService = {
  listItems(): Promise<AdminPolicyIntelligenceItem[]>;
  updateItem(
    itemId: string,
    action: "archive" | "restore"
  ): Promise<AdminPolicyIntelligenceUpdate>;
};

export type PolicyAdminAuthenticator = () => Promise<
  { userId: string | null } | Response
>;

const itemIdSchema = z.string().uuid();
const actionSchema = z
  .object({
    itemId: itemIdSchema,
    action: z.enum(["archive", "restore"]),
  })
  .strict();

export async function handleAdminPolicyIntelligenceGet({
  requireAdmin,
  service,
}: {
  requireAdmin: PolicyAdminAuthenticator;
  service: Pick<AdminPolicyIntelligenceService, "listItems">;
}): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }
  return Response.json({ items: await service.listItems() });
}

export async function handleAdminPolicyIntelligenceUpdate({
  requireAdmin,
  service,
  request,
}: {
  requireAdmin: PolicyAdminAuthenticator;
  service: Pick<AdminPolicyIntelligenceService, "updateItem">;
  request: Request;
}): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid policy item action." },
      { status: 400 }
    );
  }

  const result = await service.updateItem(
    parsed.data.itemId,
    parsed.data.action
  );
  if (result.status === "not_found") {
    return Response.json({ error: "Policy item not found." }, { status: 404 });
  }
  if (result.status === "not_archived") {
    return Response.json(
      { error: "Only archived policy items can be restored." },
      { status: 409 }
    );
  }
  return Response.json({
    id: parsed.data.itemId,
    editorialStatus: result.editorialStatus,
  });
}
