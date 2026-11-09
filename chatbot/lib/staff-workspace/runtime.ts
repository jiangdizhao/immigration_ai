import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { projectStaffAssignmentRepository } from "@/lib/db/project-staff-assignment-repository";
import { projectStaffAssignmentSchemaAvailable } from "@/lib/db/project-staff-assignment-schema-availability";
import {
  denyAllProfessionalReviewAuthority,
  unavailableProfessionalCredentialVerifier,
} from "@/lib/professional-review/authority";
import { unavailableManagedTargetProvider } from "@/lib/professional-review/target-provider";
import { describeProfessionalReviewAvailability } from "@/lib/review/professional-review-availability";
import { unsupportedProjectResourceDisclosureResolver } from "@/lib/service-engagement/disclosure";
import { createStaffWorkspaceHandlers } from "./http";
import {
  buildStaffWorkspaceSummary,
  emptyStaffCategories,
  emptyStaffWorkspaceSummary,
  MAX_STAFF_QUEUE_ENTRIES,
  STAFF_ROLE_LAWYER,
  type StaffCategoryView,
  type StaffQueueEntry,
  type StaffWorkspaceSummary,
} from "./staff-queue";
import { buildStaffReviewDetail } from "./staff-review-detail";

/**
 * Phase 13 M9-B runtime composition for the Staff/Lawyer workspace.
 *
 * Every read is an existing authorized read:
 *
 *   - `listLawyerInvitations` → owner-approved invitations addressed to this lawyer;
 *   - `listActiveStaffAssignmentCandidates` → identifiers of this lawyer's active
 *     assignments (a candidate grants nothing);
 *   - `getStaffShell` → the locked, authoritative minimal Project shell per assignment.
 *
 * A candidate whose shell refuses (revoked, project closed, proposal stale, account no
 * longer a lawyer) produces no queue entry, so revocation is enforced by the same code
 * path that authorizes the read.
 *
 * Categories this composition cannot read are reported as `unsupported` with an explicit
 * reason instead of appearing empty. Professional review is `unavailable` because the
 * M4-006 authority is deny-all, so the queue never claims a review task exists.
 */

const professionalAvailability = describeProfessionalReviewAvailability({
  authorityCode: denyAllProfessionalReviewAuthority.code,
  credentialVerifierCode: unavailableProfessionalCredentialVerifier.code,
  enabled:
    process.env.PHASE13_PROFESSIONAL_REVIEW_ENABLED?.trim().toLowerCase() ===
    "true",
  targetProviderCode: unavailableManagedTargetProvider.code,
});

function staffWorkspaceEnabled(): boolean {
  return (
    process.env.PHASE13_STAFF_WORKSPACE_ENABLED?.trim().toLowerCase() === "true"
  );
}

async function schemaAvailable(): Promise<boolean> {
  try {
    return (
      (await projectFoundationSchemaAvailable()) &&
      (await projectStaffAssignmentSchemaAvailable())
    );
  } catch {
    return false;
  }
}

type QueueResult =
  | { kind: "ok"; summary: StaffWorkspaceSummary }
  | { kind: "not_staff" }
  | { kind: "unavailable" };

async function loadQueue(input: {
  actorUserId: string;
  actorRole: string;
}): Promise<QueueResult> {
  if (input.actorRole !== STAFF_ROLE_LAWYER) {
    return { kind: "not_staff" };
  }
  if (!staffWorkspaceEnabled()) {
    return {
      kind: "ok",
      summary: emptyStaffWorkspaceSummary({
        actorRole: input.actorRole,
        actorUserId: input.actorUserId,
        professionalReview: {
          reasonCode: "staff_workspace_disabled",
          state: "disabled",
        },
        reasonCode: "staff_workspace_disabled",
        state: "disabled",
      }),
    };
  }
  if (!(await schemaAvailable())) {
    return {
      kind: "ok",
      summary: emptyStaffWorkspaceSummary({
        actorRole: input.actorRole,
        actorUserId: input.actorUserId,
        professionalReview: {
          reasonCode: "staff_workspace_schema_unavailable",
          state: "unavailable",
        },
        reasonCode: "staff_workspace_schema_unavailable",
        state: "unavailable",
      }),
    };
  }

  const entries: StaffQueueEntry[] = [];
  const categories = emptyStaffCategories(
    "unsupported",
    "category_not_integrated"
  ) as Record<string, StaffCategoryView>;

  try {
    const invitations =
      await projectStaffAssignmentRepository.listLawyerInvitations({
        actorUserId: input.actorUserId,
      });
    categories.project_assignments = {
      count: null,
      reasonCode: null,
      state: "available",
    };
    for (const invitation of invitations) {
      entries.push({
        bucket: "needs_review",
        category: "project_assignments",
        id: invitation.assignmentId,
        kind: "project_assignment",
        labelCode: "staffInvitationPending",
        projectId: invitation.projectId,
        reasonCode: null,
        statusCode: invitation.assignmentStatus,
        updatedAt: (
          invitation.ownerApprovedAt ?? invitation.createdAt
        ).toISOString(),
      });
    }
  } catch {
    categories.project_assignments = {
      count: null,
      reasonCode: "staff_invitations_unavailable",
      state: "unavailable",
    };
  }

  // Active assignments: identifiers first, then the authoritative locked shell per
  // Project, so a revoked or stale assignment yields no entry at all.
  let candidates: {
    assignmentId: string;
    projectId: string;
    updatedAt: Date;
  }[] = [];
  try {
    candidates =
      await projectStaffAssignmentRepository.listActiveStaffAssignmentCandidates(
        {
          actorUserId: input.actorUserId,
          limit: MAX_STAFF_QUEUE_ENTRIES,
        }
      );
    categories.project_assignments = {
      count: null,
      reasonCode: null,
      state: "available",
    };
  } catch {
    // A refused candidate list leaves whatever the invitation read established.
  }
  for (const candidate of candidates) {
    try {
      const shell = await projectStaffAssignmentRepository.getStaffShell({
        actorUserId: input.actorUserId,
        projectId: candidate.projectId,
      });
      entries.push({
        bucket: "assigned_projects",
        category: "project_assignments",
        id: shell.assignmentId,
        kind: "project_assignment",
        labelCode: "staffAssignedProject",
        projectId: shell.projectId,
        reasonCode: null,
        statusCode: shell.assignmentStatus,
        updatedAt: candidate.updatedAt.toISOString(),
      });
    } catch {
      // Revoked / closed / stale: the shell refuses, so nothing is listed.
    }
  }

  categories.professional_reviews =
    professionalAvailability.state === "available"
      ? {
          count: null,
          reasonCode: "review_enumeration_unavailable",
          state: "unsupported",
        }
      : {
          count: null,
          reasonCode: professionalAvailability.reasonCode,
          state:
            professionalAvailability.state === "disabled"
              ? "disabled"
              : "unavailable",
        };

  return {
    kind: "ok",
    summary: buildStaffWorkspaceSummary({
      actorRole: input.actorRole,
      actorUserId: input.actorUserId,
      categories: categories as never,
      entries,
      professionalReview: {
        reasonCode: professionalAvailability.reasonCode,
        state: professionalAvailability.state,
      },
    }),
  };
}

/**
 * Staff Project review detail.
 *
 * The shell is the only read that proves the assignment; the content gate is the existing
 * M4-004 evaluator, whose production resolver is
 * `unsupported_no_verified_source_adapter`, so ALLOW is currently impossible and the
 * review items are never returned. The reason is reported verbatim so a reviewer can see
 * exactly which authority is missing.
 */
async function loadDetail(input: {
  actorUserId: string;
  actorRole: string;
  projectId: string;
}): Promise<
  | { kind: "ok"; detail: ReturnType<typeof buildStaffReviewDetail> }
  | { kind: "not_staff" }
  | { kind: "not_found" }
  | { kind: "unavailable" }
> {
  if (input.actorRole !== STAFF_ROLE_LAWYER) {
    return { kind: "not_staff" };
  }
  if (!staffWorkspaceEnabled()) {
    return { kind: "not_found" };
  }
  if (!(await schemaAvailable())) {
    return { kind: "unavailable" };
  }
  let shell: Awaited<
    ReturnType<typeof projectStaffAssignmentRepository.getStaffShell>
  >;
  try {
    shell = await projectStaffAssignmentRepository.getStaffShell({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
    });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    // "not_found" is the documented refusal for an unassigned, revoked, closed or stale
    // assignment, so it is reported as an indistinguishable not-found.
    if (code === "not_found" || code === "forbidden") {
      return { kind: "not_found" };
    }
    return { kind: "unavailable" };
  }

  // The M4-004 content gate. Its production resolver is the unsupported adapter, so the
  // decision is a deterministic DENY and no protected material is read.
  const disclosureDecision = await Promise.resolve(
    unsupportedProjectResourceDisclosureResolver.resolve({
      projectId: input.projectId,
      resourceCategory: "project_document",
      resourceId: input.projectId,
    })
  );

  return {
    kind: "ok",
    detail: buildStaffReviewDetail({
      actorRole: input.actorRole,
      assignmentStatus: "active",
      disclosure: {
        decision: "DENY",
        reasonCode:
          disclosureDecision.found === false
            ? disclosureDecision.reasonCode
            : "disclosure_source_unverified",
      },
      professionalReview: {
        reasonCode: professionalAvailability.reasonCode,
        state: professionalAvailability.state,
      },
      projectId: input.projectId,
      projectLifecycle: shell.projectLifecycle,
      review: null,
      shell: {
        acceptedAt: shell.acceptedAt ? shell.acceptedAt.toISOString() : null,
        assignmentId: shell.assignmentId,
        assignmentRole: shell.assignmentRole,
        assignmentStatus: "active",
        projectId: shell.projectId,
        projectLifecycle: "active",
        updatedAt: shell.updatedAt ? shell.updatedAt.toISOString() : null,
      },
    }),
  };
}

export const staffWorkspaceHandlers = createStaffWorkspaceHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { role: session.user.role ?? "user", userId: session.user.id };
  },
  loadDetail,
  loadQueue,
});
