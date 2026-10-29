import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISCLOSURE_DECISION_REASON_CODES,
  evaluateProjectResourceDisclosure,
  type ProjectResourceDisclosureRequest,
  unsupportedProjectResourceDisclosureResolver,
} from "./disclosure";

const NOW = "2026-10-29T00:00:00.000Z";
const FINGERPRINT = "doc-v3-abcdef";

function baseRequest(): ProjectResourceDisclosureRequest {
  return {
    now: NOW,
    action: "read_metadata",
    projectId: "project-a",
    projectActive: true,
    resourceOwnerEligible: true,
    actor: {
      userId: "lawyer-a",
      role: "lawyer",
      nonGuest: true,
      emailVerified: true,
      staffEmailSha256: "a".repeat(64),
    },
    assignment: {
      assignmentId: "assignment-a",
      projectId: "project-a",
      staffUserId: "lawyer-a",
      staffEmailSha256: "a".repeat(64),
      status: "active",
      purpose: "project_staff_collaboration",
    },
    grant: {
      grantId: "grant-a",
      projectId: "project-a",
      resourceOwnerUserId: "owner-a",
      recipientAssignmentId: "assignment-a",
      recipientUserId: "lawyer-a",
      resourceCategory: "project_document",
      resourceId: "11111111-1111-4111-8111-111111111111",
      resourceVersion: 3,
      resourceFingerprint: FINGERPRINT,
      purposeCode: "professional_review",
      status: "granted",
      expiresAt: null,
    },
    resource: {
      found: true,
      projectId: "project-a",
      ownerUserId: "owner-a",
      version: 3,
      category: "project_document",
      fingerprint: FINGERPRINT,
    },
    requested: {
      resourceCategory: "project_document",
      resourceId: "11111111-1111-4111-8111-111111111111",
      resourceVersion: 3,
      purposeCode: "professional_review",
    },
  };
}

function decideWith(
  mutate: (request: ProjectResourceDisclosureRequest) => void
) {
  const request = baseRequest();
  mutate(request);
  return evaluateProjectResourceDisclosure(request);
}

test("a complete current authorization set is the only ALLOW path", () => {
  assert.deepEqual(evaluateProjectResourceDisclosure(baseRequest()), {
    decision: "ALLOW",
    reasonCode: "allowed",
  });
});

test("project state, action and account eligibility fail closed", () => {
  assert.equal(
    decideWith((request) => {
      request.projectActive = false;
    }).reasonCode,
    "project_inactive"
  );
  // Content delivery is not connected in this slice, even with a valid grant.
  assert.equal(
    decideWith((request) => {
      request.action = "read_content";
    }).reasonCode,
    "content_access_not_available"
  );
  assert.equal(
    decideWith((request) => {
      request.actor.role = "user";
    }).reasonCode,
    "actor_not_staff_account"
  );
  assert.equal(
    decideWith((request) => {
      request.actor.role = "admin";
    }).reasonCode,
    "actor_not_staff_account"
  );
  assert.equal(
    decideWith((request) => {
      request.actor.nonGuest = false;
    }).reasonCode,
    "actor_not_staff_account"
  );
  assert.equal(
    decideWith((request) => {
      request.actor.emailVerified = false;
    }).reasonCode,
    "actor_not_verified"
  );
});

test("an active M4-002 assignment is necessary but never sufficient", () => {
  // Thread participation consent or an M2 AI grant provides no assignment record.
  assert.equal(
    decideWith((request) => {
      request.assignment = null;
    }).reasonCode,
    "assignment_missing"
  );
  // Active assignment, but no M4-004 disclosure grant (for example only a
  // thread consent or an AI-context grant exists).
  assert.equal(
    decideWith((request) => {
      request.grant = null;
    }).reasonCode,
    "grant_missing"
  );
  // Revoked or expired assignment denies even with a still-granted disclosure.
  assert.equal(
    decideWith((request) => {
      if (request.assignment) {
        request.assignment.status = "revoked";
      }
    }).reasonCode,
    "assignment_inactive"
  );
  assert.equal(
    decideWith((request) => {
      if (request.assignment) {
        request.assignment.status = "owner_approved";
      }
    }).reasonCode,
    "assignment_inactive"
  );
  assert.equal(
    decideWith((request) => {
      if (request.assignment) {
        request.assignment.purpose = "project_review";
      }
    }).reasonCode,
    "assignment_purpose_mismatch"
  );
  assert.equal(
    decideWith((request) => {
      if (request.assignment) {
        request.assignment.staffUserId = "lawyer-b";
      }
    }).reasonCode,
    "assignment_recipient_mismatch"
  );
  // Role/email-hash change on the account invalidates the assignment binding.
  assert.equal(
    decideWith((request) => {
      request.actor.staffEmailSha256 = "b".repeat(64);
    }).reasonCode,
    "assignment_account_mismatch"
  );
});

test("grant binding is exact: project, owner, recipient, resource, version, purpose", () => {
  assert.equal(
    decideWith((request) => {
      if (request.grant) {
        request.grant.projectId = "project-b";
      }
    }).reasonCode,
    "grant_project_mismatch"
  );
  // Cross-Project staff access is always denied.
  assert.equal(
    decideWith((request) => {
      if (request.assignment) {
        request.assignment.projectId = "project-b";
      }
    }).reasonCode,
    "assignment_project_mismatch"
  );
  assert.equal(
    decideWith((request) => {
      request.resource = {
        found: true,
        projectId: "project-b",
        ownerUserId: "owner-a",
        version: 3,
        category: "project_document",
        fingerprint: FINGERPRINT,
      };
    }).reasonCode,
    "resource_project_mismatch"
  );
  // Another member's private resource cannot be disclosed under this owner's grant.
  assert.equal(
    decideWith((request) => {
      if (request.grant) {
        request.grant.resourceOwnerUserId = "owner-b";
      }
    }).reasonCode,
    "grant_owner_mismatch"
  );
  assert.equal(
    decideWith((request) => {
      if (request.grant) {
        request.grant.recipientUserId = "lawyer-b";
      }
    }).reasonCode,
    "grant_recipient_mismatch"
  );
  assert.equal(
    decideWith((request) => {
      if (request.grant) {
        request.grant.recipientAssignmentId = "assignment-b";
      }
    }).reasonCode,
    "grant_assignment_mismatch"
  );
  assert.equal(
    decideWith((request) => {
      if (request.grant) {
        request.grant.resourceCategory = "project_fact";
      }
    }).reasonCode,
    "grant_category_mismatch"
  );
  assert.equal(
    decideWith((request) => {
      if (request.grant) {
        request.grant.resourceId = "22222222-2222-4222-8222-222222222222";
      }
    }).reasonCode,
    "grant_resource_mismatch"
  );
  assert.equal(
    decideWith((request) => {
      if (request.grant) {
        request.grant.purposeCode = "service_delivery";
      }
    }).reasonCode,
    "grant_purpose_mismatch"
  );
});

test("revocation, expiry, unsupported categories and stale versions deny", () => {
  assert.equal(
    decideWith((request) => {
      if (request.grant) {
        request.grant.status = "revoked";
      }
    }).reasonCode,
    "grant_revoked"
  );
  assert.equal(
    decideWith((request) => {
      if (request.grant) {
        request.grant.status = "expired";
      }
    }).reasonCode,
    "grant_expired"
  );
  assert.equal(
    decideWith((request) => {
      if (request.grant) {
        request.grant.expiresAt = "2026-10-28T23:59:59.000Z";
      }
    }).reasonCode,
    "grant_expired"
  );
  // A future expiry remains valid.
  assert.equal(
    decideWith((request) => {
      if (request.grant) {
        request.grant.expiresAt = "2026-10-30T00:00:00.000Z";
      }
    }).reasonCode,
    "allowed"
  );

  // Private AI Chats and financial/engagement records are not grantable here.
  for (const category of [
    "private_chat",
    "financial_record",
    "engagement_record",
    "unknown_category",
  ]) {
    assert.equal(
      decideWith((request) => {
        request.requested.resourceCategory = category;
      }).reasonCode,
      "requested_category_not_supported"
    );
  }

  // A newer resource version does not extend the old grant.
  assert.equal(
    decideWith((request) => {
      request.resource = {
        found: true,
        projectId: "project-a",
        ownerUserId: "owner-a",
        version: 4,
        category: "project_document",
        fingerprint: "doc-v4-abcdef",
      };
    }).reasonCode,
    "resource_version_stale"
  );
  // A stale client-supplied selector is also denied.
  assert.equal(
    decideWith((request) => {
      request.requested.resourceVersion = 2;
    }).reasonCode,
    "resource_version_stale"
  );
});

test("missing or unavailable resource sources deny without leaking content", () => {
  assert.equal(
    decideWith((request) => {
      request.resource = {
        found: false,
        reasonCode: "resource_source_unavailable",
      };
    }).reasonCode,
    "resource_source_unavailable"
  );
  assert.equal(
    decideWith((request) => {
      request.resource = { found: false, reasonCode: "resource_not_found" };
    }).reasonCode,
    "resource_not_found"
  );
  assert.deepEqual(
    unsupportedProjectResourceDisclosureResolver.resolve({
      projectId: "project-a",
      resourceCategory: "project_document",
      resourceId: "11111111-1111-4111-8111-111111111111",
    }),
    { found: false, reasonCode: "resource_source_unavailable" }
  );
});

test("every decision returns a reason code from the closed vocabulary", () => {
  const decisions = [
    evaluateProjectResourceDisclosure(baseRequest()),
    decideWith((request) => {
      request.projectActive = false;
    }),
    decideWith((request) => {
      request.grant = null;
    }),
  ];
  for (const decision of decisions) {
    assert.ok(
      (DISCLOSURE_DECISION_REASON_CODES as readonly string[]).includes(
        decision.reasonCode
      ),
      decision.reasonCode
    );
    assert.ok(!("content" in decision), "decision must not carry content");
  }
});
