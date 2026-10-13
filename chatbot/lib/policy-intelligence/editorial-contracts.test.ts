import assert from "node:assert/strict";
import test from "node:test";
import {
  attributionImpersonatesOfficialAuthority,
  POLICY_HUMAN_REVISION_SCHEMA,
  type PolicyHumanRevisionContent,
  policyHumanRevisionContentSchema,
} from "./contracts";

/**
 * Phase 12 Stage 3 R1 — human-revision contract tests.
 *
 * Covers the author-stated date model (kept distinct from platform-observed
 * official snapshot dates) and the deterministic guard that stops a public
 * byline from impersonating an official government authority.
 */

function content(
  overrides: Partial<PolicyHumanRevisionContent> = {}
): Record<string, unknown> {
  return {
    schemaVersion: POLICY_HUMAN_REVISION_SCHEMA,
    title: { "zh-CN": "标题", en: "Title" },
    overview: { "zh-CN": "摘要", en: "Overview" },
    keyChanges: [],
    affectedGroups: [],
    implications: [],
    recommendedActions: [],
    body: null,
    commentary: null,
    attribution: "示例律师事务所移民团队",
    sourceStatus: "proposed",
    sourceReferences: [],
    ...overrides,
  };
}

test("author-stated dates default to null and accept real calendar dates", () => {
  const withoutDates = policyHumanRevisionContentSchema.parse(content());
  // A stored draft written before R1 (no date fields) still parses.
  assert.equal(withoutDates.officialSourceDate, null);
  assert.equal(withoutDates.commencementDate, null);
  assert.equal(withoutDates.reviewedAsOfDate, null);

  const withDates = policyHumanRevisionContentSchema.parse(
    content({
      officialSourceDate: "2026-09-01",
      commencementDate: "2026-11-01",
      reviewedAsOfDate: "2026-09-20",
    })
  );
  assert.equal(withDates.officialSourceDate, "2026-09-01");
  assert.equal(withDates.commencementDate, "2026-11-01");
  assert.equal(withDates.reviewedAsOfDate, "2026-09-20");
});

test("a proposed policy without an established commencement date stays null", () => {
  const proposed = policyHumanRevisionContentSchema.parse(
    content({ sourceStatus: "proposed", commencementDate: null })
  );
  assert.equal(proposed.commencementDate, null);
  assert.equal(proposed.sourceStatus, "proposed");
});

test("impossible or malformed dates are rejected", () => {
  for (const bad of ["2026-02-31", "01-09-2026", "2026-9-1", "not-a-date"]) {
    const parsed = policyHumanRevisionContentSchema.safeParse(
      content({ commencementDate: bad })
    );
    assert.equal(parsed.success, false, bad);
  }
});

test("a byline may not impersonate an official government authority", () => {
  const impersonations = [
    "Department of Home Affairs",
    "内政部政策团队",
    "Australian Government Migration Team",
    "Migration Agents Registration Authority",
  ];
  for (const attribution of impersonations) {
    assert.equal(
      attributionImpersonatesOfficialAuthority(attribution),
      true,
      attribution
    );
    const parsed = policyHumanRevisionContentSchema.safeParse(
      content({ attribution })
    );
    assert.equal(parsed.success, false, attribution);
    if (!parsed.success) {
      assert.equal(
        parsed.error.issues.some((issue) =>
          issue.message.includes("impersonate_official_authority")
        ),
        true
      );
    }
  }
});

test("legitimate firm, team and practitioner bylines are accepted", () => {
  for (const attribution of [
    "示例律师事务所移民团队",
    "Example Migrant Law Practice",
    "Jane Citizen, Registered Migration Agent MARN 0000000",
    "Homeward Legal",
  ]) {
    assert.equal(
      attributionImpersonatesOfficialAuthority(attribution),
      false,
      attribution
    );
    const parsed = policyHumanRevisionContentSchema.safeParse(
      content({ attribution })
    );
    assert.equal(parsed.success, true, attribution);
  }
});

test("human revisions remain limited to eight references", () => {
  const reference = (index: number) => ({
    authority: `Authority ${index}`,
    title: `Title ${index}`,
    url: `https://example.test/${index}`,
    date: null,
    citation: null,
  });
  assert.equal(
    policyHumanRevisionContentSchema.safeParse(
      content({
        sourceReferences: Array.from({ length: 8 }, (_, index) =>
          reference(index)
        ),
      })
    ).success,
    true
  );
  assert.equal(
    policyHumanRevisionContentSchema.safeParse(
      content({
        sourceReferences: Array.from({ length: 9 }, (_, index) =>
          reference(index)
        ),
      })
    ).success,
    false
  );
});
