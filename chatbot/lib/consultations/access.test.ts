import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessConsultation,
  canAssignConsultationLawyer,
  canManageConsultationAssignments,
  consultationContinuityLinksMatch,
  consultationLinkOwnedBy,
  customerAccessForIdentity,
} from "./access-policy";

const verified = {
  id: "customer",
  email: "person@example.com",
  role: "user",
  emailVerifiedAt: new Date(),
};

test("customer creation access requires authenticated verified non-guest user role", () => {
  assert.deepEqual(customerAccessForIdentity(null), {
    allowed: false,
    status: 401,
    error: "A registered account is required.",
  });
  assert.equal(
    customerAccessForIdentity({ ...verified, email: "guest-1234567890123" })
      .allowed,
    false
  );
  assert.equal(
    customerAccessForIdentity({ ...verified, emailVerifiedAt: null }).allowed,
    false
  );
  assert.equal(
    customerAccessForIdentity({ ...verified, role: "lawyer" }).allowed,
    false
  );
  assert.equal(
    customerAccessForIdentity({ ...verified, role: "admin" }).allowed,
    false
  );
  assert.deepEqual(customerAccessForIdentity(verified), { allowed: true });
});

test("consultation reads and mutations are owner and assignment scoped", () => {
  const record = { userId: "customer-a", assignedLawyerUserId: "lawyer-a" };
  assert.equal(
    canAccessConsultation({ id: "customer-a", role: "customer" }, record),
    true
  );
  assert.equal(
    canAccessConsultation({ id: "customer-b", role: "customer" }, record),
    false
  );
  assert.equal(
    canAccessConsultation({ id: "lawyer-a", role: "lawyer" }, record),
    true
  );
  assert.equal(
    canAccessConsultation({ id: "lawyer-b", role: "lawyer" }, record),
    false
  );
  assert.equal(
    canAccessConsultation({ id: "admin-a", role: "admin" }, record),
    true
  );
});

test("assignment accepts only verified, non-guest lawyer accounts", () => {
  assert.equal(
    canAssignConsultationLawyer({
      id: "lawyer",
      email: "lawyer@example.com",
      role: "lawyer",
      emailVerifiedAt: new Date(),
    }),
    true
  );
  assert.equal(
    canAssignConsultationLawyer({
      id: "user",
      email: "user@example.com",
      role: "user",
      emailVerifiedAt: new Date(),
    }),
    false
  );
  assert.equal(
    canAssignConsultationLawyer({
      id: "lawyer",
      email: "lawyer@example.com",
      role: "lawyer",
      emailVerifiedAt: null,
    }),
    false
  );
  assert.equal(
    canAssignConsultationLawyer({
      id: "guest",
      email: "guest-1234567890123",
      role: "lawyer",
      emailVerifiedAt: new Date(),
    }),
    false
  );
});

test("linked continuity references require exact owner identity", () => {
  assert.equal(consultationLinkOwnedBy("customer-a", "customer-a"), true);
  assert.equal(consultationLinkOwnedBy("customer-a", "customer-b"), false);
});

test("continuity links agree when both references point to different chats", () => {
  assert.equal(consultationContinuityLinksMatch(undefined, "chat-a"), true);
  assert.equal(consultationContinuityLinksMatch("chat-a", null), true);
  assert.equal(consultationContinuityLinksMatch("chat-a", "chat-a"), true);
  assert.equal(consultationContinuityLinksMatch("chat-a", "chat-b"), false);
});

test("only admins may assign consultations", () => {
  assert.equal(canManageConsultationAssignments("admin"), true);
  assert.equal(canManageConsultationAssignments("lawyer"), false);
  assert.equal(canManageConsultationAssignments("user"), false);
});
