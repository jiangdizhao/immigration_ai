import assert from "node:assert/strict";
import { test } from "node:test";
import { hashProjectOperationRequest } from "@/lib/db/project-foundation-utils";
import {
  authorizeProjectStaffDisclosure,
  buildStaffAssignmentOperationRequest,
  hashStaffEmail,
  maskVerifiedStaffEmail,
  PROJECT_STAFF_ASSIGNMENT_NOTICE,
  PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256,
  PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
  projectStaffAssignmentsEnabled,
  projectStaffTransitionAllowed,
} from "./policy";

test("staff assignment feature gate is separate and defaults off", () => {
  assert.equal(projectStaffAssignmentsEnabled(undefined), false);
  assert.equal(projectStaffAssignmentsEnabled("false"), false);
  assert.equal(projectStaffAssignmentsEnabled("TRUE"), true);
});

test("notice is versioned and exact normalized email identity is hashed", () => {
  assert.equal(
    PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
    "m4-002-staff-assignment-notice-v1"
  );
  assert.match(PROJECT_STAFF_ASSIGNMENT_NOTICE_SHA256, /^[0-9a-f]{64}$/u);
  assert.match(PROJECT_STAFF_ASSIGNMENT_NOTICE, /minimal Project shell/u);
  assert.match(
    PROJECT_STAFF_ASSIGNMENT_NOTICE,
    /does not share Project Facts/u
  );
  assert.equal(
    hashStaffEmail(" Lawyer@Example.com "),
    hashStaffEmail("lawyer@example.com")
  );
  assert.equal(
    maskVerifiedStaffEmail("lawyer@example.com"),
    "l***@example.com"
  );
});

test("assignment transitions are one-way and terminal states cannot reactivate", () => {
  assert.equal(
    projectStaffTransitionAllowed("proposed", "owner_approve"),
    true
  );
  assert.equal(
    projectStaffTransitionAllowed("owner_approved", "lawyer_accept"),
    true
  );
  assert.equal(projectStaffTransitionAllowed("active", "owner_revoke"), true);
  assert.equal(
    projectStaffTransitionAllowed("revoked", "lawyer_accept"),
    false
  );
  assert.equal(
    projectStaffTransitionAllowed("declined", "owner_approve"),
    false
  );
  assert.equal(
    projectStaffTransitionAllowed("withdrawn", "admin_revoke"),
    false
  );
});

test("operation request hashes omit absent owner-consent fields and support admin revisions", () => {
  const actions = [
    "owner_approve",
    "owner_decline",
    "owner_revoke",
    "lawyer_accept",
    "lawyer_decline",
    "lawyer_resign",
    "admin_withdraw",
    "admin_revoke",
  ] as const;
  for (const action of actions) {
    const request = buildStaffAssignmentOperationRequest({
      action,
      assignmentId: "assignment",
      projectId: "project",
    });
    assert.match(hashProjectOperationRequest(request), /^[0-9a-f]{64}$/u);
    assert.equal(
      Object.hasOwn(request, "proposalSha256"),
      action === "owner_approve"
    );
  }
});

test("M4-004 disclosure authorizer denies every protected resource", () => {
  for (const resource of [
    "project_fact",
    "project_document",
    "private_chat",
    "task",
    "requirement",
    "message",
    "financial_record",
    "engagement_record",
    "other_project_resource",
  ] as const) {
    assert.deepEqual(
      authorizeProjectStaffDisclosure({
        assignmentId: "assignment",
        projectId: "project",
        staffUserId: "staff",
        resource,
      }),
      { decision: "DENY", reason: "m4_004_disclosure_policy_pending" }
    );
  }
});
