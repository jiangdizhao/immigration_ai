import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionLawyerClarification,
  validateLawyerClarificationUpdate,
} from "./status";

test("lawyer clarification status machine permits the bounded forward paths", () => {
  assert.equal(canTransitionLawyerClarification("pending", "in_review"), true);
  assert.equal(
    canTransitionLawyerClarification("in_review", "corrected"),
    true
  );
  assert.equal(
    canTransitionLawyerClarification("needs_more_information", "in_review"),
    true
  );
  assert.equal(canTransitionLawyerClarification("confirmed", "pending"), false);
  assert.equal(canTransitionLawyerClarification("closed", "in_review"), false);
});

test("substantive dispositions require human text and corrections require a corrected answer", () => {
  assert.match(
    validateLawyerClarificationUpdate(
      { status: "pending" },
      { status: "confirmed" }
    ) ?? "",
    /substantive lawyer response/
  );
  assert.match(
    validateLawyerClarificationUpdate(
      { status: "pending" },
      { status: "corrected", lawyerResponse: "The answer needs a change." }
    ) ?? "",
    /corrected answer/
  );
  assert.equal(
    validateLawyerClarificationUpdate(
      { status: "pending" },
      {
        status: "confirmed",
        lawyerResponse: "The answer is supported by the reviewed material.",
      }
    ),
    null
  );
});
