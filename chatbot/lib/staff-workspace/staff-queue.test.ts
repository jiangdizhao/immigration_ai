import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStaffWorkspaceSummary,
  emptyStaffCategories,
  emptyStaffWorkspaceSummary,
  type StaffCategoryView,
  type StaffQueueCategory,
  type StaffQueueEntry,
  staffProjectAccessDecision,
} from "./staff-queue";

/**
 * Phase 13 M9-B staff workspace contract.
 *
 * Negative cases come first: unassigned staff, a foreign Project, a revoked assignment and
 * a Project that is not active must all fail closed, and a category the server could not
 * read must never look like an empty one.
 */

const projectA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function entry(overrides: Partial<StaffQueueEntry> = {}): StaffQueueEntry {
  return {
    bucket: "assigned_projects",
    category: "project_assignments",
    id: "assignment-1",
    kind: "project_assignment",
    labelCode: "staffAssignedProject",
    projectId: projectA,
    reasonCode: null,
    statusCode: "active",
    updatedAt: "2026-11-08T00:00:00.000Z",
    ...overrides,
  };
}

function categories(
  overrides: Partial<Record<StaffQueueCategory, StaffCategoryView>> = {}
): Record<StaffQueueCategory, StaffCategoryView> {
  return {
    ...emptyStaffCategories("unsupported", "category_not_integrated"),
    project_assignments: { count: null, reasonCode: null, state: "available" },
    ...overrides,
  };
}

test("staff access is denied before any assignment is considered", () => {
  for (const role of ["user", "admin", "guest"]) {
    assert.deepEqual(
      staffProjectAccessDecision({
        actorRole: role,
        assignmentStatus: "active",
        projectLifecycle: "active",
      }),
      { allowed: false, reasonCode: "staff_role_required" }
    );
  }
});

test("only a current active assignment on an active Project is allowed", () => {
  assert.deepEqual(
    staffProjectAccessDecision({
      actorRole: "lawyer",
      assignmentStatus: "active",
      projectLifecycle: "active",
    }),
    { allowed: true }
  );
  for (const status of [
    "proposed",
    "owner_approved",
    "declined",
    "withdrawn",
    "revoked",
  ] as const) {
    assert.deepEqual(
      staffProjectAccessDecision({
        actorRole: "lawyer",
        assignmentStatus: status,
        projectLifecycle: "active",
      }),
      { allowed: false, reasonCode: "staff_assignment_inactive" }
    );
  }
  assert.deepEqual(
    staffProjectAccessDecision({
      actorRole: "lawyer",
      assignmentStatus: "missing",
      projectLifecycle: "active",
    }),
    { allowed: false, reasonCode: "staff_assignment_missing" }
  );
  assert.deepEqual(
    staffProjectAccessDecision({
      actorRole: "lawyer",
      assignmentStatus: "unavailable",
      projectLifecycle: "active",
    }),
    { allowed: false, reasonCode: "staff_assignment_unavailable" }
  );
  assert.deepEqual(
    staffProjectAccessDecision({
      actorRole: "lawyer",
      assignmentStatus: "active",
      projectLifecycle: "closed",
    }),
    { allowed: false, reasonCode: "project_not_active" }
  );
  assert.deepEqual(
    staffProjectAccessDecision({
      actorRole: "lawyer",
      assignmentStatus: "active",
      projectLifecycle: "missing",
    }),
    { allowed: false, reasonCode: "project_not_found" }
  );
});

test("an entry from a category that could not be read is dropped", () => {
  const summary = buildStaffWorkspaceSummary({
    actorRole: "lawyer",
    actorUserId: "u-1",
    categories: categories({
      professional_reviews: {
        count: null,
        reasonCode: "professional_authority_unavailable",
        state: "unavailable",
      },
    }),
    entries: [
      entry(),
      entry({
        category: "professional_reviews",
        id: "review-1",
        kind: "professional_review",
        labelCode: "staffReview",
        projectId: projectB,
      }),
    ],
    professionalReview: {
      reasonCode: "professional_authority_unavailable",
      state: "unavailable",
    },
  });
  assert.equal(summary.counts.all, 1);
  assert.deepEqual(
    summary.entries.map((item) => item.id),
    ["assignment-1"]
  );
  assert.equal(summary.categories.professional_reviews.state, "unavailable");
  assert.equal(summary.categories.professional_reviews.count, null);
});

test("one entry per record, deterministic order, bounded length", () => {
  const summary = buildStaffWorkspaceSummary({
    actorRole: "lawyer",
    actorUserId: "u-1",
    categories: categories(),
    entries: [
      entry({ id: "a", updatedAt: "2026-11-08T00:00:00.000Z" }),
      entry({ id: "a", updatedAt: "2026-11-08T00:00:00.000Z" }),
      entry({
        bucket: "needs_review",
        id: "b",
        updatedAt: "2026-11-07T00:00:00.000Z",
      }),
    ],
    professionalReview: { reasonCode: null, state: "available" },
  });
  assert.deepEqual(
    summary.entries.map((item) => item.id),
    ["b", "a"]
  );
  assert.deepEqual(summary.counts, {
    all: 2,
    assigned_projects: 1,
    awaiting_customer: 0,
    blocked: 0,
    needs_review: 1,
    reviewed: 0,
  });

  const many = buildStaffWorkspaceSummary({
    actorRole: "lawyer",
    actorUserId: "u-1",
    categories: categories(),
    entries: Array.from({ length: 80 }, (_, index) =>
      entry({ id: `assignment-${index}` })
    ),
    professionalReview: { reasonCode: null, state: "available" },
  });
  assert.equal(many.entries.length, many.limits.maxEntries);
});

test("an actor with no readable category gets a labelled empty summary", () => {
  const summary = emptyStaffWorkspaceSummary({
    actorRole: "lawyer",
    actorUserId: "u-1",
    reasonCode: "staff_workspace_schema_unavailable",
  });
  assert.deepEqual(summary.entries, []);
  assert.equal(summary.counts.all, 0);
  for (const view of Object.values(summary.categories)) {
    assert.equal(view.state, "unavailable");
    assert.equal(view.reasonCode, "staff_workspace_schema_unavailable");
    assert.equal(view.count, null);
  }
});
