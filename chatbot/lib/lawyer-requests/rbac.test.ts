import assert from "node:assert/strict";
import test from "node:test";
import {
  canCustomerReplyToLawyerRequest,
  canLawyerAccessAssignedRequest,
  canManageLawyerAssignments,
  canManageLawyerRoles,
  hasConsultationRequestTable,
} from "./rbac";

test("lawyer RBAC keeps staff access distinct from admin access", () => {
  assert.equal(canManageLawyerAssignments("lawyer"), false);
  assert.equal(canManageLawyerRoles("lawyer"), false);
  assert.equal(canManageLawyerAssignments("admin"), true);
  assert.equal(
    canLawyerAccessAssignedRequest({
      actorId: "a",
      actorRole: "lawyer",
      assignedLawyerUserId: "a",
    }),
    true
  );
  assert.equal(
    canLawyerAccessAssignedRequest({
      actorId: "a",
      actorRole: "lawyer",
      assignedLawyerUserId: "b",
    }),
    false
  );
  assert.equal(
    canLawyerAccessAssignedRequest({
      actorId: "a",
      actorRole: "lawyer",
      assignedLawyerUserId: null,
    }),
    false
  );
  assert.equal(
    canLawyerAccessAssignedRequest({
      actorId: "a",
      actorRole: "admin",
      assignedLawyerUserId: null,
    }),
    true
  );
});

test("missing consultation table skips only consultation availability checks", () => {
  assert.equal(hasConsultationRequestTable(null), false);
  assert.equal(hasConsultationRequestTable('"ConsultationRequest"'), true);
});

test("customer replies are owner-bound and limited to requested information", () => {
  assert.equal(
    canCustomerReplyToLawyerRequest({
      ownerId: "a",
      actorId: "a",
      status: "needs_more_information",
    }),
    true
  );
  assert.equal(
    canCustomerReplyToLawyerRequest({
      ownerId: "b",
      actorId: "a",
      status: "needs_more_information",
    }),
    false
  );
  assert.equal(
    canCustomerReplyToLawyerRequest({
      ownerId: "a",
      actorId: "a",
      status: "confirmed",
    }),
    false
  );
});
