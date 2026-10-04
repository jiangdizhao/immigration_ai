import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkspaceCaseSummary,
  shouldClearWorkspaceCaseSummary,
} from "./workspace-case-summary";

test("conversation boundary clears only when the loaded chat changes", () => {
  assert.equal(shouldClearWorkspaceCaseSummary("chat-a", "chat-a"), false);
  assert.equal(shouldClearWorkspaceCaseSummary("chat-a", "chat-b"), true);
  assert.equal(shouldClearWorkspaceCaseSummary(null, "chat-a"), true);
});

test("case summary includes every known and requested fact with available labels", () => {
  const summary = buildWorkspaceCaseSummary(
    {
      completion_date: "2026-09-30",
      course_cricos_registered: true,
      australian_study_requirement_met: false,
      custom_fact: 0,
      optional_fact: "",
    },
    [
      {
        key: "notification_date",
        label: "Notification date",
        prompt: "When were you notified?",
        why_needed: "The date may affect the next step.",
      },
      { key: "current_location", label: "Current location" },
    ],
    { completion_date: "Course completion date" },
    "en"
  );

  assert.deepEqual(
    summary.knownFacts.map(({ key }) => key),
    [
      "completion_date",
      "course_cricos_registered",
      "australian_study_requirement_met",
      "custom_fact",
      "optional_fact",
    ]
  );
  assert.equal(summary.knownFacts[0]?.label, "Course completion date");
  assert.equal(summary.knownFacts[1]?.value, "Yes");
  assert.equal(summary.knownFacts[2]?.value, "No");
  assert.equal(summary.knownFacts[3]?.value, "0");
  assert.equal(summary.knownFacts[4]?.value, "—");
  assert.equal(summary.requestedFacts[0]?.prompt, "When were you notified?");
  assert.equal(
    summary.requestedFacts[0]?.whyNeeded,
    "The date may affect the next step."
  );
  assert.equal(summary.requestedFacts[1]?.prompt, "Current location");
});

test("case summary formats Chinese boolean values and preserves empty states", () => {
  const summary = buildWorkspaceCaseSummary(
    { refusal_notice_available: false, notification_date: null },
    [],
    { refusal_notice_available: "是否有拒签通知" },
    "zh-CN"
  );

  assert.equal(summary.knownFacts[0]?.value, "否");
  assert.equal(summary.knownFacts[1]?.value, "—");
  assert.deepEqual(summary.requestedFacts, []);
});
