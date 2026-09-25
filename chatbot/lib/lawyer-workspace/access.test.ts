import assert from "node:assert/strict";
import test from "node:test";
import {
  lawyerDetailAccessForActor,
  lawyerQueueAccessForActor,
} from "./access";

test("unauthenticated, customer, and admin actors cannot use the lawyer queue", () => {
  assert.deepEqual(lawyerQueueAccessForActor({ authenticated: false }), {
    allowed: false,
    status: 401,
    error: "Authentication required.",
  });
  const customer = lawyerQueueAccessForActor({
    authenticated: true,
    role: "user",
    id: "customer-1",
  });
  assert.equal(customer.allowed, false);
  assert.equal(customer.status, 403);
  const admin = lawyerQueueAccessForActor({
    authenticated: true,
    role: "admin",
    id: "admin-1",
  });
  assert.equal(admin.allowed, false);
  assert.equal(admin.status, 403);
  assert.deepEqual(
    lawyerQueueAccessForActor({
      authenticated: true,
      role: "lawyer",
      id: "lawyer-1",
    }),
    { allowed: true, status: 200, error: null }
  );
});

test("only the assigned lawyer can read and update a lawyer request", () => {
  const assigned = lawyerDetailAccessForActor(
    { authenticated: true, role: "lawyer", id: "lawyer-1" },
    "lawyer-1"
  );
  assert.deepEqual(assigned, { allowed: true, status: 200, error: null });

  const otherLawyer = lawyerDetailAccessForActor(
    { authenticated: true, role: "lawyer", id: "lawyer-2" },
    "lawyer-1"
  );
  assert.equal(otherLawyer.allowed, false);
  assert.equal(otherLawyer.status, 403);

  const unassigned = lawyerDetailAccessForActor(
    { authenticated: true, role: "lawyer", id: "lawyer-1" },
    null
  );
  assert.equal(unassigned.allowed, false);
  assert.equal(unassigned.status, 403);

  const customerDetail = lawyerDetailAccessForActor(
    { authenticated: true, role: "user", id: "customer-1" },
    "lawyer-1"
  );
  assert.equal(customerDetail.allowed, false);
  assert.equal(customerDetail.status, 403);

  const adminDetail = lawyerDetailAccessForActor(
    { authenticated: true, role: "admin", id: "admin-1" },
    "lawyer-1"
  );
  assert.equal(adminDetail.allowed, false);
  assert.equal(adminDetail.status, 403);

  const unauthenticated = lawyerDetailAccessForActor(
    { authenticated: false },
    "lawyer-1"
  );
  assert.equal(unauthenticated.allowed, false);
  assert.equal(unauthenticated.status, 401);
});
