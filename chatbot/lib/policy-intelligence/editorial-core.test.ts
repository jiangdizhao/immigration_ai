import assert from "node:assert/strict";
import test from "node:test";
import {
  POLICY_HUMAN_REVISION_SCHEMA,
  type PolicyHumanRevisionContent,
} from "./contracts";
import {
  buildHumanContentChangeSet,
  DRAFT_SNAPSHOT_MAX_BYTES_PER_REVISION,
  DRAFT_SNAPSHOT_MAX_PER_REVISION,
  EDITORIAL_AUDIT_DIFF_LIMIT_BYTES,
  humanContentSnapshotMeta,
  planDraftSnapshotPrune,
  resolveAutomaticPublicationOutcome,
  resolveHeldRevisionItemStatus,
} from "./editorial-core";

/**
 * Phase 12 Stage 3 R1 — deterministic core decisions.
 *
 * The automatic-publication decision lives here so the "human publication
 * protection" rule is unit-testable without a database, and the audit change
 * set is proven to carry reconstructible old/new values.
 */

test("an eligible revision publishes automatically when the item is unprotected", () => {
  assert.deepEqual(
    resolveAutomaticPublicationOutcome({
      gateEligible: true,
      publicationMode: "automatic",
      itemArchived: false,
    }),
    { outcome: "publish" }
  );
});

test("a gate-rejected revision is held, not published", () => {
  assert.deepEqual(
    resolveAutomaticPublicationOutcome({
      gateEligible: false,
      publicationMode: "automatic",
      itemArchived: false,
    }),
    { outcome: "hold", reasonCode: "publication_gate_rejected" }
  );
});

test("an eligible revision is held while the item is editor-protected", () => {
  assert.deepEqual(
    resolveAutomaticPublicationOutcome({
      gateEligible: true,
      publicationMode: "human_protected",
      itemArchived: false,
    }),
    { outcome: "hold", reasonCode: "human_publication_protected" }
  );
});

test("an archived item suppresses both automatic outcomes", () => {
  for (const publicationMode of ["automatic", "human_protected"] as const) {
    assert.deepEqual(
      resolveAutomaticPublicationOutcome({
        gateEligible: true,
        publicationMode,
        itemArchived: true,
      }),
      { outcome: "suppress", reasonCode: "item_archived" }
    );
  }
});

function content(
  overrides: Partial<PolicyHumanRevisionContent> = {}
): PolicyHumanRevisionContent {
  return {
    schemaVersion: POLICY_HUMAN_REVISION_SCHEMA,
    title: { "zh-CN": "旧标题", en: "Old title" },
    overview: { "zh-CN": "摘要", en: "Overview" },
    keyChanges: [
      { id: "change-1", text: { "zh-CN": "旧变化", en: "Old change" } },
      { id: "change-2", text: { "zh-CN": "保留", en: "Keep" } },
    ],
    affectedGroups: [],
    implications: [],
    recommendedActions: [],
    body: null,
    commentary: null,
    attribution: "示例律师团队",
    sourceStatus: "announced",
    sourceReferences: [],
    officialSourceDate: null,
    commencementDate: null,
    reviewedAsOfDate: null,
    ...overrides,
  };
}

test("the audit change set records old and new values, not just hashes", () => {
  const changeSet = buildHumanContentChangeSet(
    content(),
    content({
      title: { "zh-CN": "新标题", en: "New title" },
      sourceStatus: "in_force",
      keyChanges: [
        { id: "change-1", text: { "zh-CN": "新变化", en: "New change" } },
        { id: "change-2", text: { "zh-CN": "保留", en: "Keep" } },
        { id: "change-3", text: { "zh-CN": "新增", en: "Added" } },
      ],
      officialSourceDate: "2026-09-01",
    })
  );
  assert.deepEqual(changeSet.changedFields.includes("title"), true);
  assert.deepEqual(changeSet.changedFields.includes("sourceStatus"), true);
  assert.deepEqual(
    changeSet.changedFields.includes("officialSourceDate"),
    true
  );
  const titleChange = changeSet.scalarChanges.find(
    (change) => change.field === "title"
  );
  assert.ok(titleChange);
  assert.match(titleChange.before ?? "", /旧标题/);
  assert.match(titleChange.after ?? "", /新标题/);
  const sectionChanges = changeSet.narrativeChanges.find(
    (section) => section.section === "keyChanges"
  );
  assert.ok(sectionChanges);
  assert.deepEqual(sectionChanges.addedIds, ["change-3"]);
  assert.deepEqual(sectionChanges.removedIds, []);
  assert.equal(sectionChanges.modified.length, 1);
  assert.equal(sectionChanges.modified[0].id, "change-1");
  assert.match(sectionChanges.modified[0].before, /旧变化/);
  assert.match(sectionChanges.modified[0].after, /新变化/);
  assert.equal(changeSet.truncated, false);
});

test("the audit change set is bounded for very large edits", () => {
  const section = (prefix: string, label: string) =>
    Array.from({ length: 8 }, (_, index) => ({
      id: `${prefix}-${index + 1}`,
      text: {
        "zh-CN": `${label}${index}：${"长".repeat(300)}`,
        en: `${label}${index} before/after ${"x".repeat(300)}`,
      },
    }));
  const before = content({
    keyChanges: section("change", "变化"),
    affectedGroups: section("group", "人群"),
    implications: section("implication", "影响"),
    recommendedActions: section("action", "措施"),
  });
  const after: PolicyHumanRevisionContent = {
    ...before,
    keyChanges: before.keyChanges.map((unit) => ({
      ...unit,
      text: { "zh-CN": unit.text["zh-CN"], en: `${unit.text.en} CHANGED` },
    })),
    affectedGroups: before.affectedGroups.map((unit) => ({
      ...unit,
      text: { "zh-CN": unit.text["zh-CN"], en: `${unit.text.en} CHANGED` },
    })),
    implications: before.implications.map((unit) => ({
      ...unit,
      text: { "zh-CN": unit.text["zh-CN"], en: `${unit.text.en} CHANGED` },
    })),
    recommendedActions: before.recommendedActions.map((unit) => ({
      ...unit,
      text: { "zh-CN": unit.text["zh-CN"], en: `${unit.text.en} CHANGED` },
    })),
  };
  const changeSet = buildHumanContentChangeSet(before, after);
  assert.equal(changeSet.truncated, true);
  assert.ok(
    JSON.stringify(changeSet).length <= EDITORIAL_AUDIT_DIFF_LIMIT_BYTES + 4000,
    "bounded change set"
  );
  // Even when truncated, each recorded change stays provable: previews carry an
  // explicit ellipsis and the full-text digests differ.
  const firstSection = changeSet.narrativeChanges[0];
  assert.equal(firstSection.modified.length, 5);
  assert.equal(firstSection.modified[0].beforeTruncated, true);
  assert.notEqual(
    firstSection.modified[0].beforeDigest,
    firstSection.modified[0].afterDigest
  );
  assert.match(firstSection.modified[0].before, /…$/u);
});

test("an unchanged draft produces an empty change set", () => {
  const changeSet = buildHumanContentChangeSet(content(), content());
  assert.deepEqual(changeSet.changedFields, []);
  assert.deepEqual(changeSet.scalarChanges, []);
  assert.deepEqual(changeSet.narrativeChanges, []);
});

test("a held AI analysis keeps the item status of an editor-protected publication (R2)", () => {
  // Unprotected items keep the historical behaviour.
  assert.equal(
    resolveHeldRevisionItemStatus({
      currentStatus: "published",
      publicationMode: "automatic",
      hasPublishedRevision: true,
    }),
    "review_required"
  );
  assert.equal(
    resolveHeldRevisionItemStatus({
      currentStatus: "draft",
      publicationMode: "automatic",
      hasPublishedRevision: false,
    }),
    "review_required"
  );
  // A human-protected item that publishes an approved revision is not rewritten
  // by a newly held automated revision.
  assert.equal(
    resolveHeldRevisionItemStatus({
      currentStatus: "published",
      publicationMode: "human_protected",
      hasPublishedRevision: true,
    }),
    "published"
  );
  // A protected item with nothing published yet still reports the hold.
  assert.equal(
    resolveHeldRevisionItemStatus({
      currentStatus: "draft",
      publicationMode: "human_protected",
      hasPublishedRevision: false,
    }),
    "review_required"
  );
});

test("snapshot metadata is byte-stable and digestible (R2)", () => {
  const first = humanContentSnapshotMeta(content());
  const second = humanContentSnapshotMeta(content());
  assert.equal(first.serialized, second.serialized);
  assert.equal(first.digest, second.digest);
  assert.equal(first.bytes, Buffer.byteLength(first.serialized, "utf8"));
  assert.match(first.digest, /^[0-9a-f]{16}$/u);
  const changed = humanContentSnapshotMeta(
    content({ title: { "zh-CN": "新标题", en: "New title" } })
  );
  assert.notEqual(changed.digest, first.digest);
});

test("draft-history retention keeps the newest saves and prunes the oldest (R2)", () => {
  const snapshots = Array.from({ length: 40 }, (_, index) => ({
    id: `snap-${index + 1}`,
    saveNumber: index + 1,
    contentBytes: 1024,
  }));
  const pruned = planDraftSnapshotPrune(snapshots);
  assert.equal(pruned.length, 40 - DRAFT_SNAPSHOT_MAX_PER_REVISION);
  assert.deepEqual(
    [...pruned].sort(),
    snapshots
      .slice(0, 15)
      .map((snapshot) => snapshot.id)
      .sort()
  );
  // The newest snapshot is never pruned, so the current draft is always safe.
  assert.equal(pruned.includes("snap-40"), false);
  // The byte budget also bounds retention for large documents.
  const large = Array.from({ length: 5 }, (_, index) => ({
    id: `large-${index + 1}`,
    saveNumber: index + 1,
    contentBytes: Math.floor(DRAFT_SNAPSHOT_MAX_BYTES_PER_REVISION / 3),
  }));
  const bytePruned = planDraftSnapshotPrune(large);
  assert.deepEqual(bytePruned, ["large-1", "large-2"]);
  assert.deepEqual(planDraftSnapshotPrune([]), []);
  assert.deepEqual(planDraftSnapshotPrune([snapshots[0]]), []);
});
