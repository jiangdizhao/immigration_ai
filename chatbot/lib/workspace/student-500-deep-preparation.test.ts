import assert from "node:assert/strict";
import test from "node:test";
import { student500DeepCopy } from "@/lib/workspace-copy";
import {
  deepPreparationPath,
  parseDeepPreparationView,
  resolveDeepPreparationLocale,
} from "./student-500-deep-preparation";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";

test("deep preparation path is Project and application scoped", () => {
  assert.equal(
    deepPreparationPath(PROJECT_ID, APPLICATION_ID),
    `/api/projects/${PROJECT_ID}/student-500-applications/${APPLICATION_ID}/deep-preparation`
  );
});

test("the client refuses any payload that is not not_submission_ready", () => {
  assert.equal(parseDeepPreparationView(null), null);
  assert.equal(
    parseDeepPreparationView({
      editorialReviews: [],
      scenario: {},
      submissionStatus: "submission_ready",
      tasks: [],
    }),
    null
  );
  assert.ok(
    parseDeepPreparationView({
      editorialReviews: [],
      scenario: { complexity: "standard", scenarioKinds: [] },
      submissionStatus: "not_submission_ready",
      tasks: [],
    })
  );
});

test("the deep preparation section follows the real site locale", () => {
  assert.equal(resolveDeepPreparationLocale("en"), "en");
  assert.equal(resolveDeepPreparationLocale("zh-Hans"), "zh-Hans");
  assert.equal(resolveDeepPreparationLocale("zh-CN"), "zh-Hans");
  assert.equal(resolveDeepPreparationLocale("zh-Hant"), "zh-Hant");
  assert.equal(resolveDeepPreparationLocale("zh-TW"), "zh-Hant");
  assert.equal(resolveDeepPreparationLocale("fr"), "en");
  assert.equal(resolveDeepPreparationLocale(null), "en");
  // Every locale must carry the consent copy, so no fallback can hide a gap.
  for (const locale of ["en", "zh-Hans", "zh-Hant"] as const) {
    const copy = student500DeepCopy[locale];
    assert.ok(copy.consentCheckbox.length > 0, locale);
    assert.ok(copy.consentHeading.length > 0, locale);
    assert.equal(copy.notSubmissionReady.length > 0, true, locale);
  }
});
