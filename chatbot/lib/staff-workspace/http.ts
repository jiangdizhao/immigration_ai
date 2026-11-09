import {
  STAFF_ROLE_LAWYER,
  type StaffProjectShell,
  type StaffWorkspaceSummary,
} from "./staff-queue";
import type { StaffReviewDetail } from "./staff-review-detail";

/**
 * Phase 13 M9-B — bounded HTTP surface for the Staff/Lawyer review workspace.
 *
 *   GET /api/staff/workspace                         → authorized queue
 *   GET /api/staff/workspace/{projectId}             → scoped Project review detail
 *
 * The role check here is the *first* gate only: it mirrors the existing lawyer portal
 * (`lawyerQueueAccessForActor`) and never replaces the assignment, disclosure and
 * M4-006 authority checks the loader performs. A non-lawyer receives 403 without any
 * data read, and an unauthenticated request receives 401.
 */

export type StaffWorkspaceLoadResult =
  | { readonly kind: "ok"; readonly summary: StaffWorkspaceSummary }
  | { readonly kind: "not_staff" }
  | { readonly kind: "unavailable" };

export type StaffDetailLoadResult =
  | { readonly kind: "ok"; readonly detail: StaffReviewDetail }
  | { readonly kind: "not_staff" }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable" };

export type StaffWorkspaceHandlerDependencies = {
  readonly authenticate: () => Promise<{
    readonly userId: string;
    readonly role: string;
  } | null>;
  readonly loadQueue: (input: {
    readonly actorUserId: string;
    readonly actorRole: string;
  }) => Promise<StaffWorkspaceLoadResult>;
  readonly loadDetail: (input: {
    readonly actorUserId: string;
    readonly actorRole: string;
    readonly projectId: string;
  }) => Promise<StaffDetailLoadResult>;
  /** Optional navigation shells for a client that opens one Project at a time. */
  readonly loadShells?: (input: {
    readonly actorUserId: string;
    readonly actorRole: string;
  }) => Promise<readonly StaffProjectShell[]>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

export function createStaffWorkspaceHandlers(
  deps: StaffWorkspaceHandlerDependencies
) {
  async function prepare(requireLawyer: boolean) {
    const session = await deps.authenticate();
    if (!session) {
      return {
        ok: false as const,
        response: jsonResponse({ error: "Authentication required." }, 401),
      };
    }
    if (requireLawyer && session.role !== STAFF_ROLE_LAWYER) {
      // No data is read for a non-staff actor, so nothing about Projects is disclosed.
      return {
        ok: false as const,
        response: jsonResponse({ error: "Lawyer access required." }, 403),
      };
    }
    return { ok: true as const, session };
  }

  return {
    async getQueue(_request: Request): Promise<Response> {
      const prepared = await prepare(true);
      if (!prepared.ok) {
        return prepared.response;
      }
      const result = await deps.loadQueue({
        actorRole: prepared.session.role,
        actorUserId: prepared.session.userId,
      });
      if (result.kind === "not_staff") {
        return jsonResponse({ error: "Lawyer access required." }, 403);
      }
      if (result.kind === "unavailable") {
        return jsonResponse(
          { error: "Staff workspace is temporarily unavailable." },
          503
        );
      }
      return jsonResponse({ workspace: result.summary });
    },

    async getProjectDetail(
      _request: Request,
      projectId: string
    ): Promise<Response> {
      const prepared = await prepare(true);
      if (!prepared.ok) {
        return prepared.response;
      }
      if (!UUID_RE.test(projectId)) {
        return jsonResponse({ error: "Project not found." }, 404);
      }
      const result = await deps.loadDetail({
        actorRole: prepared.session.role,
        actorUserId: prepared.session.userId,
        projectId,
      });
      if (result.kind === "not_staff") {
        return jsonResponse({ error: "Lawyer access required." }, 403);
      }
      if (result.kind === "not_found") {
        // An unassigned Project and an absent Project are indistinguishable on purpose.
        return jsonResponse({ error: "Project not found." }, 404);
      }
      if (result.kind === "unavailable") {
        return jsonResponse(
          { error: "Staff workspace is temporarily unavailable." },
          503
        );
      }
      return jsonResponse({ detail: result.detail });
    },
  };
}
