import assert from "node:assert/strict";
import test from "node:test";
import {
  addEditorialFormReference,
  contentFromEditorialForm,
  type EditorialHumanContent,
  emptyEditorialForm,
  formFromEditorialSeed,
  formFromHumanContent,
  removeEditorialFormReference,
  updateEditorialFormReference,
} from "./editorial-form";

/**
 * Phase 12 Stage 3 R1 — serialization tests for the editorial form module.
 *
 * These exercise exactly the functions the workspace component uses, so the UI
 * contract is covered without a browser: multi-reference round trips, genuinely
 * bilingual input, visible over-limit errors and author-stated dates.
 */

function reference(index: number) {
  return {
    authority: `Authority ${index}`,
    title: `Reference title ${index}`,
    url: `https://example.test/reference-${index}`,
    date: `2026-09-0${String((index % 9) + 1)}`,
    citation: `F2026L0000${index}`,
  };
}

function fullContent(): EditorialHumanContent {
  return {
    schemaVersion: "policy-intelligence.human-revision.v1",
    title: { "zh-CN": "标题", en: "Title" },
    overview: { "zh-CN": "摘要", en: "Overview" },
    keyChanges: [
      { id: "change-a", text: { "zh-CN": "变化一", en: "Change one" } },
      { id: "change-b", text: { "zh-CN": "变化二", en: "Change two" } },
    ],
    affectedGroups: [{ id: "group-a", text: { "zh-CN": "人群", en: "Group" } }],
    implications: [
      { id: "implication-a", text: { "zh-CN": "影响", en: "Impact" } },
    ],
    recommendedActions: [],
    body: { "zh-CN": "正文", en: "Body" },
    commentary: null,
    attribution: "示例律师事务所移民团队 / Example Migration Team",
    sourceStatus: "enacted_not_commenced",
    sourceReferences: Array.from({ length: 8 }, (_, index) =>
      reference(index + 1)
    ),
    officialSourceDate: "2026-09-01",
    commencementDate: null,
    reviewedAsOfDate: "2026-09-20",
  };
}

test("form round trip preserves all eight references, citations and dates", () => {
  const content = fullContent();
  const form = formFromHumanContent(content);
  assert.equal(form.references.length, 8);
  assert.equal(form.officialSourceDate, "2026-09-01");
  assert.equal(form.commencementDate, "");
  assert.equal(form.reviewedAsOfDate, "2026-09-20");

  const serialized = contentFromEditorialForm(form);
  assert.equal(serialized.status, "ok");
  if (serialized.status !== "ok") {
    return;
  }
  assert.equal(serialized.content.sourceReferences.length, 8);
  for (const [index, entry] of serialized.content.sourceReferences.entries()) {
    const original = content.sourceReferences[index];
    assert.equal(entry.authority, original.authority);
    assert.equal(entry.title, original.title);
    assert.equal(entry.url, original.url);
    assert.equal(entry.date, original.date);
    assert.equal(entry.citation, original.citation);
  }
  assert.equal(serialized.content.officialSourceDate, "2026-09-01");
  // An unset commencement date stays unset: the platform never infers it.
  assert.equal(serialized.content.commencementDate, null);
  assert.equal(serialized.content.reviewedAsOfDate, "2026-09-20");
  assert.equal(serialized.content.sourceStatus, "enacted_not_commenced");
  assert.equal(serialized.content.body?.en, "Body");
});

test("a second round trip is stable (no drift, no lost references)", () => {
  const first = contentFromEditorialForm(formFromHumanContent(fullContent()));
  assert.equal(first.status, "ok");
  if (first.status !== "ok") {
    return;
  }
  const second = contentFromEditorialForm(formFromHumanContent(first.content));
  assert.equal(second.status, "ok");
  if (second.status !== "ok") {
    return;
  }
  assert.deepEqual(second.content, first.content);
});

test("narrative ids are deterministic across round trips", () => {
  const firstRun = contentFromEditorialForm(
    formFromHumanContent(fullContent())
  );
  const secondRun = contentFromEditorialForm(
    formFromHumanContent(fullContent())
  );
  assert.equal(firstRun.status, "ok");
  assert.equal(secondRun.status, "ok");
  if (firstRun.status !== "ok" || secondRun.status !== "ok") {
    return;
  }
  assert.deepEqual(
    firstRun.content.keyChanges.map((unit) => unit.id),
    secondRun.content.keyChanges.map((unit) => unit.id)
  );
  for (const unit of firstRun.content.keyChanges) {
    assert.match(unit.id, /^change-[0-9a-f]{8}$/u);
  }
});

test("missing translations are reported instead of auto-copied", () => {
  const form = {
    ...emptyEditorialForm(),
    titleZh: "仅中文标题",
    titleEn: "",
    overviewZh: "仅中文摘要",
    overviewEn: "",
    attribution: "示例律师团队",
    changes: "仅中文变化",
  };
  const serialized = contentFromEditorialForm(form);
  assert.equal(serialized.status, "error");
  if (serialized.status !== "error") {
    return;
  }
  const messages = serialized.issues.map((issue) => issue.message).join("\n");
  assert.match(messages, /English text is required/);
  assert.match(messages, /第 1 行必须同时提供中文与英文/);
});

test("over-limit narrative lists are reported, never truncated", () => {
  const lines = Array.from(
    { length: 9 },
    (_, index) => `变化 ${index + 1} | Change ${index + 1}`
  ).join("\n");
  const form = {
    ...emptyEditorialForm(),
    titleZh: "标题",
    titleEn: "Title",
    overviewZh: "摘要",
    overviewEn: "Overview",
    attribution: "示例律师团队",
    changes: lines,
  };
  const serialized = contentFromEditorialForm(form);
  assert.equal(serialized.status, "error");
  if (serialized.status !== "error") {
    return;
  }
  assert.match(serialized.issues[0].message, /最多 8 条，当前 9 条/);
});

test("incomplete or non-HTTPS references are refused, not dropped", () => {
  let form = emptyEditorialForm();
  form = addEditorialFormReference(form);
  form = updateEditorialFormReference(form, 0, {
    authority: "Example authority",
    title: "Official page",
    url: "http://insecure.example.test/page",
  });
  const invalid = contentFromEditorialForm({
    ...form,
    titleZh: "标题",
    titleEn: "Title",
    overviewZh: "摘要",
    overviewEn: "Overview",
    attribution: "示例律师团队",
  });
  assert.equal(invalid.status, "error");
  if (invalid.status !== "error") {
    return;
  }
  assert.match(invalid.issues[0].message, /必须是 HTTPS/);
});

test("removing a reference removes exactly one entry and keeps the rest", () => {
  const form = formFromHumanContent(fullContent());
  const reduced = removeEditorialFormReference(form, 0);
  assert.equal(reduced.references.length, 7);
  assert.equal(reduced.references[0].authority, "Authority 2");
});

test("author-stated dates must be real calendar dates", () => {
  const base = {
    ...formFromHumanContent(fullContent()),
    commencementDate: "2026-02-31",
  };
  const serialized = contentFromEditorialForm(base);
  assert.equal(serialized.status, "error");
  if (serialized.status !== "error") {
    return;
  }
  assert.match(serialized.issues[0].message, /Invalid calendar date/);
});

test("the override seed falls back to a blank bilingual form with source facts", () => {
  const blank = formFromEditorialSeed(null, "示例律师团队");
  assert.equal(blank.titleEn, "");
  assert.equal(blank.attribution, "示例律师团队");
  const seeded = formFromEditorialSeed(
    {
      title: { "zh-CN": "", en: "" },
      overview: { "zh-CN": "", en: "" },
      keyChanges: [],
      affectedGroups: [],
      implications: [],
      recommendedActions: [],
      sourceStatus: "announced",
      officialSource: {
        authority: "Department of Home Affairs",
        title: "Official page",
        url: "https://immi.homeaffairs.gov.au/policy",
        date: "2026-09-01",
      },
    },
    "示例律师团队"
  );
  assert.equal(seeded.references.length, 1);
  assert.equal(seeded.references[0].date, "2026-09-01");
  // The blank title still fails validation, which is what forces the lawyer to
  // author the text rather than inherit machine output.
  const serialized = contentFromEditorialForm(seeded);
  assert.equal(serialized.status, "error");
});
