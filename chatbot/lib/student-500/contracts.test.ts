// biome-ignore-all lint/suspicious/noMisplacedAssertion: helpers raise assertions inside test scope.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_STUDENT_500_CONTEXT,
  normalizeStudent500AsOfDate,
  normalizeStudent500Context,
  STUDENT_500_DISCLOSURE_CODES,
  Student500Error,
  student500ApplicationsEnabled,
  student500ContextSha256,
  student500RequestSha256,
} from "./contracts";

/**
 * Phase 13 M6.1 contract tests.
 *
 * These pin the honesty rules that the rest of the milestone relies on: unknown is
 * a first-class state, structurally impossible CoE/route combinations are refused,
 * and no capability token can accidentally enable the surface.
 */

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof Student500Error, String(error));
    return error.code;
  }
  throw new Error("expected a Student500Error");
}

test("an empty context is all-unknown, never a negative answer", () => {
  const context = normalizeStudent500Context({});
  assert.deepEqual(context, EMPTY_STUDENT_500_CONTEXT);
  assert.equal(context.applicationPlace, "unknown");
  assert.equal(context.coeStatus, "unknown");
  assert.equal(context.historyDeclaration, "not_declared");
  assert.equal(context.asOfDate, null);
});

test("as-of dates must be real, bounded calendar dates", () => {
  assert.equal(normalizeStudent500AsOfDate("2026-11-03"), "2026-11-03");
  assert.equal(normalizeStudent500AsOfDate(null), null);
  assert.equal(
    code(() => normalizeStudent500AsOfDate("2026-02-31")),
    "invalid_request"
  );
  assert.equal(
    code(() => normalizeStudent500AsOfDate("1900-01-01")),
    "invalid_request"
  );
  assert.equal(
    code(() => normalizeStudent500AsOfDate("03/11/2026")),
    "invalid_request"
  );
});

test("impossible CoE/route combinations are refused", () => {
  assert.equal(
    code(() =>
      normalizeStudent500Context({
        coeStatus: "reported_not_held",
        entryRoute: "existing_coe",
      })
    ),
    "invalid_request"
  );
  assert.equal(
    code(() =>
      normalizeStudent500Context({
        coeStatus: "reported_held",
        entryRoute: "offer_only",
      })
    ),
    "invalid_request"
  );
  assert.equal(
    code(() => normalizeStudent500Context({ coeStatus: "reported_held" })),
    "invalid_request"
  );
  assert.equal(
    code(() =>
      normalizeStudent500Context({
        entryRoute: "no_school_application",
        schoolApplicationId: "11111111-1111-4111-8111-111111111111",
      })
    ),
    "invalid_request"
  );
});

test("history flags require an explicit declared_some declaration", () => {
  assert.equal(
    code(() =>
      normalizeStudent500Context({
        historyFlags: [{ flag: "prior_visa_refusal" }],
      })
    ),
    "invalid_request"
  );
  assert.equal(
    code(() =>
      normalizeStudent500Context({
        historyDeclaration: "declared_some",
        historyFlags: [],
      })
    ),
    "invalid_request"
  );
  assert.equal(
    code(() =>
      normalizeStudent500Context({
        historyDeclaration: "declared_some",
        historyFlags: [
          { flag: "prior_visa_refusal" },
          { flag: "prior_visa_refusal" },
        ],
      })
    ),
    "invalid_request"
  );
  const ok = normalizeStudent500Context({
    historyDeclaration: "declared_some",
    historyFlags: [
      { flag: "prior_visa_cancellation", reportedOn: "2024-05-01" },
    ],
  });
  assert.equal(ok.historyFlags.length, 1);
  assert.equal(ok.historyFlags[0]?.reportedOn, "2024-05-01");
});

test("unknown enum values are rejected instead of coerced", () => {
  assert.equal(
    code(() => normalizeStudent500Context({ applicationPlace: "mars" })),
    "invalid_request"
  );
  assert.equal(
    code(() => normalizeStudent500Context({ applicantAgeBand: "minor" })),
    "invalid_request"
  );
});

test("the request digest covers only authored fields and is stable", () => {
  const context = normalizeStudent500Context({
    applicationPlace: "offshore",
    asOfDate: "2026-11-03",
    entryRoute: "offer_only",
  });
  const left = student500RequestSha256({
    context,
    operationType: "student_500_create",
    projectId: "22222222-2222-4222-8222-222222222222",
  });
  const right = student500RequestSha256({
    context: normalizeStudent500Context({
      applicationPlace: "offshore",
      asOfDate: "2026-11-03",
      entryRoute: "offer_only",
    }),
    operationType: "student_500_create",
    projectId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(left, right);
  assert.match(left, /^[0-9a-f]{64}$/u);
  assert.match(student500ContextSha256(context), /^[0-9a-f]{64}$/u);
  assert.notEqual(
    left,
    student500RequestSha256({
      context,
      operationType: "student_500_create",
      projectId: "33333333-3333-4333-8333-333333333333",
    })
  );
});

test("the capability gate is strict and production-safe", () => {
  assert.equal(student500ApplicationsEnabled(undefined, "development"), true);
  assert.equal(student500ApplicationsEnabled(undefined, "test"), true);
  assert.equal(student500ApplicationsEnabled(undefined, "production"), false);
  assert.equal(student500ApplicationsEnabled("", "development"), true);
  assert.equal(student500ApplicationsEnabled("true", "production"), true);
  assert.equal(student500ApplicationsEnabled("false", "development"), false);
  // A typo must never enable a production-sensitive capability.
  assert.equal(student500ApplicationsEnabled("flase", "development"), false);
  assert.equal(student500ApplicationsEnabled("yes", "production"), true);
});

test("disclosures always include the non-authority statements", () => {
  for (const required of [
    "preliminary_screening_only",
    "not_legal_advice",
    "not_professionally_reviewed",
    "not_government_submission",
    "no_eligibility_determination",
  ] as const) {
    assert.ok(
      (STUDENT_500_DISCLOSURE_CODES as readonly string[]).includes(required),
      required
    );
  }
});
