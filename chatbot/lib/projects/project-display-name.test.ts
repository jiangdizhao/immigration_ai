import assert from "node:assert/strict";
import { test } from "node:test";
import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";
import {
  normalizeOptionalProjectDisplayName,
  PROJECT_DISPLAY_NAME_MAX_LENGTH,
  requireProjectDisplayName,
} from "./project-display-name";

function isInvalidRequest(error: unknown): boolean {
  return (
    error instanceof ProjectFoundationError && error.code === "invalid_request"
  );
}

test("optional creation names are trimmed, absent-aware and bounded by code points", () => {
  assert.equal(normalizeOptionalProjectDisplayName(null), null);
  assert.equal(normalizeOptionalProjectDisplayName(undefined), null);
  assert.equal(normalizeOptionalProjectDisplayName("   "), null);
  assert.equal(
    normalizeOptionalProjectDisplayName("  2027 Application  "),
    "2027 Application"
  );

  const max = "课".repeat(PROJECT_DISPLAY_NAME_MAX_LENGTH);
  assert.equal(normalizeOptionalProjectDisplayName(max), max);
  assert.throws(
    () => normalizeOptionalProjectDisplayName(`${max}课`),
    isInvalidRequest
  );

  // Unicode code points, not UTF-16 units: 100 astral characters are exactly 100.
  const emoji = "🎓".repeat(PROJECT_DISPLAY_NAME_MAX_LENGTH);
  assert.equal(normalizeOptionalProjectDisplayName(emoji), emoji);
  assert.throws(
    () => normalizeOptionalProjectDisplayName(`${emoji}🎓`),
    isInvalidRequest
  );
});

test("control characters, line breaks and unsafe input are rejected", () => {
  const rejected = [
    "line\nbreak",
    "tab\tname",
    "nul\u0000name",
    "del\u007Fname",
    "line-separator\u2028name",
    "paragraph-separator\u2029name",
  ];
  for (const value of rejected) {
    assert.throws(
      () => normalizeOptionalProjectDisplayName(value),
      isInvalidRequest,
      JSON.stringify(value)
    );
  }

  // Plain text is stored verbatim (React escapes it on render); nothing is
  // HTML-interpreted, stripped or silently truncated by this rule.
  assert.equal(
    normalizeOptionalProjectDisplayName("R&D <b>2027</b>"),
    "R&D <b>2027</b>"
  );

  for (const value of [42, true, {}, [], ["name"]]) {
    assert.throws(
      () => normalizeOptionalProjectDisplayName(value),
      isInvalidRequest
    );
    assert.throws(() => requireProjectDisplayName(value), isInvalidRequest);
  }
});

test("an explicit rename always requires a non-empty normalized name", () => {
  assert.equal(requireProjectDisplayName("  Renamed  "), "Renamed");
  assert.equal(
    requireProjectDisplayName("2027 Student 500 申请"),
    "2027 Student 500 申请"
  );
  for (const value of [null, undefined, "", "   "]) {
    assert.throws(() => requireProjectDisplayName(value), isInvalidRequest);
  }
});
