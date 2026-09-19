import assert from "node:assert/strict";
import test from "node:test";
import {
  getPublishedPolicies,
  getPublishedPolicyBySlug,
  MANUAL_POLICY_ENTRIES,
  type PolicyEntry,
  validatePolicyEntries,
} from "./policy-intelligence";

function fixture(overrides: Partial<PolicyEntry> = {}): PolicyEntry {
  return {
    id: "fixture-policy-id",
    slug: "fixture-policy-slug",
    sourceStatus: "in_force",
    editorialStatus: "published",
    origin: "manual",
    source: {
      authority: "Fixture authority",
      officialTitle: "Fixture official title",
      officialUrl: "https://example.test/fixture",
      sourceDate: "2026-09-01",
      effectiveDate: null,
      jurisdiction: "Fixture jurisdiction",
      category: "Fixture category",
    },
    copy: {
      "zh-CN": {
        title: "测试政策标题",
        summary: "测试政策摘要。",
      },
      en: {
        title: "Fixture policy title",
        summary: "Fixture policy summary.",
      },
    },
    ...overrides,
  };
}

test("production manual policy registry starts empty", () => {
  assert.deepEqual(MANUAL_POLICY_ENTRIES, []);
  assert.deepEqual(getPublishedPolicies(), []);
});

test("published selector hides draft, review-required, and archived entries", () => {
  const entries = [
    fixture({ id: "draft", slug: "draft", editorialStatus: "draft" }),
    fixture({
      id: "review",
      slug: "review",
      editorialStatus: "review_required",
    }),
    fixture({ id: "archived", slug: "archived", editorialStatus: "archived" }),
    fixture({ id: "published", slug: "published" }),
  ];

  assert.deepEqual(
    getPublishedPolicies(entries).map((entry) => entry.id),
    ["published"]
  );
});

test("source status and editorial status remain independent", () => {
  const entry = fixture({
    sourceStatus: "proposed",
    editorialStatus: "published",
  });
  assert.equal(getPublishedPolicies([entry]).length, 1);
  assert.equal(
    getPublishedPolicies([
      fixture({ sourceStatus: "in_force", editorialStatus: "review_required" }),
    ]).length,
    0
  );
});

test("published entries are ordered by source date, then stable slug", () => {
  const entries = [
    fixture({
      id: "older",
      slug: "older",
      source: { ...fixture().source, sourceDate: "2026-01-01" },
    }),
    fixture({
      id: "newer-b",
      slug: "newer-b",
      source: { ...fixture().source, sourceDate: "2026-09-01" },
    }),
    fixture({
      id: "newer-a",
      slug: "newer-a",
      source: { ...fixture().source, sourceDate: "2026-09-01" },
    }),
  ];

  assert.deepEqual(
    getPublishedPolicies(entries).map((entry) => entry.id),
    ["newer-a", "newer-b", "older"]
  );
});

test("duplicate ids and slugs are rejected", () => {
  assert.throws(() =>
    validatePolicyEntries([fixture(), fixture({ slug: "different-slug" })])
  );
  assert.throws(() =>
    validatePolicyEntries([fixture(), fixture({ id: "different-id" })])
  );
});

test("published entries require bilingual titles and summaries", () => {
  const entry = fixture();
  assert.ok(entry.copy["zh-CN"].title.length > 0);
  assert.ok(entry.copy["zh-CN"].summary.length > 0);
  assert.ok(entry.copy.en.title.length > 0);
  assert.ok(entry.copy.en.summary.length > 0);
  assert.doesNotThrow(() => validatePolicyEntries([entry]));
  assert.throws(() =>
    validatePolicyEntries([
      fixture({
        copy: {
          ...entry.copy,
          en: { title: "", summary: "" },
        },
      }),
    ])
  );
});

test("unpublished and unknown slugs do not resolve", () => {
  const entries = [
    fixture({ id: "hidden", slug: "hidden", editorialStatus: "draft" }),
    fixture({ id: "visible", slug: "visible" }),
  ];

  assert.equal(getPublishedPolicyBySlug("hidden", entries), null);
  assert.equal(getPublishedPolicyBySlug("missing", entries), null);
  assert.equal(getPublishedPolicyBySlug("visible", entries)?.id, "visible");
});
