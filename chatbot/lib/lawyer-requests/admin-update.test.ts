import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentEventType,
  classifyAdminLawyerRequestPatch,
} from "./admin-update";

test("admin assignment and review patches remain separate mutations", () => {
  assert.equal(
    classifyAdminLawyerRequestPatch({ assignedLawyerUserId: "lawyer-a" }),
    "assignment"
  );
  assert.equal(
    classifyAdminLawyerRequestPatch({
      status: "confirmed",
      lawyerResponse: "Reviewed.",
    }),
    "review"
  );
  assert.equal(
    classifyAdminLawyerRequestPatch({
      assignedLawyerUserId: "lawyer-a",
      status: "not-a-status",
    }),
    "mixed"
  );
  assert.equal(
    classifyAdminLawyerRequestPatch({
      assignedLawyerUserId: null,
      correctedAnswer: "Invalid review payload",
    }),
    "mixed"
  );
});

test("assignment audit event types stay correct across assignment changes", () => {
  assert.equal(assignmentEventType(null, "lawyer-a"), "assigned");
  assert.equal(assignmentEventType("lawyer-a", "lawyer-b"), "reassigned");
  assert.equal(assignmentEventType("lawyer-b", null), "unassigned");
});
