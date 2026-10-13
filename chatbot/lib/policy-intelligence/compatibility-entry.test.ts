import assert from "node:assert/strict";
import test from "node:test";
import type { PolicyEntry } from "../policy-intelligence";
import {
  COMPATIBILITY_IMPORT_ATTRIBUTION,
  COMPATIBILITY_IMPORT_IDEMPOTENCY_PREFIX,
  compatibilityEntryToHumanContent,
  compatibilityImportIdempotencyKey,
  importCompatibilityEntryForEntry,
  toAdminCompatibilitySourceEntry,
} from "./compatibility-entry";
import {
  attributionImpersonatesOfficialAuthority,
  policyHumanRevisionContentSchema,
} from "./contracts";
import {
  createInMemoryEditorialRepository,
  createInMemoryEditorialStore,
} from "./editorial-memory";
import { createPolicyEditorialService } from "./editorial-service";

/**
 * A registry-shaped fixture. The bundled registry itself is server-only, so its
 * mapping is additionally asserted against the real entries by the
 * react-server-conditioned integration suite.
 */
function compatibilityEntry(overrides: Partial<PolicyEntry> = {}): PolicyEntry {
  const base: PolicyEntry = {
    id: "manual-fixture",
    slug: "fixture-compatibility-policy",
    sourceStatus: "in_force",
    editorialStatus: "published",
    origin: "manual",
    source: {
      authority: "Federal Register of Legislation",
      officialTitle: "Migration (Fixture) Instrument 2026",
      officialUrl: "https://www.legislation.gov.au/F2026L00001/asmade",
      sourceDate: "2026-09-24",
      effectiveDate: "2026-09-25",
      jurisdiction: "Australia",
      category: "Fixture category",
    },
    copy: {
      "zh-CN": {
        title: "兼容内容标题",
        summary: "兼容内容摘要",
        affectedGroup: "受影响群体",
        practicalRelevance: "实际相关性",
      },
      en: {
        title: "Compatibility title",
        summary: "Compatibility summary",
        affectedGroup: "Affected group",
        practicalRelevance: "Practical relevance",
      },
    },
    lawyerCommentary: null,
    discovery: {
      method: "manual-reviewed-official-source",
      discoveredAt: "2026-10-01T00:00:00.000Z",
    },
  };
  return { ...base, ...overrides };
}

const ADMIN = {
  userId: "user-admin",
  role: "admin" as const,
  email: "admin@example.test",
  emailVerifiedAt: new Date("2026-09-01T00:00:00.000Z"),
};

const CONSUMER = {
  userId: "user-customer",
  role: "user" as const,
  email: "customer@example.test",
  emailVerifiedAt: new Date("2026-09-01T00:00:00.000Z"),
};

function setup() {
  const store = createInMemoryEditorialStore();
  store.actors.set(ADMIN.userId, ADMIN);
  store.actors.set(CONSUMER.userId, CONSUMER);
  const repository = createInMemoryEditorialRepository(store);
  const service = createPolicyEditorialService(repository);
  return { store, repository, service };
}

test("a compatibility entry maps to a valid, honest human-revision draft", () => {
  const entry = compatibilityEntry();
  const content = compatibilityEntryToHumanContent(entry);
  // The mapped draft must satisfy the same contract the Policy Editor enforces.
  assert.doesNotThrow(() => policyHumanRevisionContentSchema.parse(content));
  // Source identity is preserved exactly as curated.
  assert.equal(content.sourceReferences[0]?.url, entry.source.officialUrl);
  assert.equal(content.sourceReferences[0]?.authority, entry.source.authority);
  assert.equal(content.sourceReferences[0]?.title, entry.source.officialTitle);
  assert.equal(content.sourceReferences[0]?.date, entry.source.sourceDate);
  assert.equal(content.sourceStatus, entry.sourceStatus);
  assert.equal(content.officialSourceDate, entry.source.sourceDate);
  assert.equal(content.commencementDate, entry.source.effectiveDate ?? null);
  assert.equal(content.reviewedAsOfDate, null);
  // Editorial honesty: labelled as a platform-compiled summary, never as
  // official or verified government text.
  assert.equal(content.attribution, COMPATIBILITY_IMPORT_ATTRIBUTION);
  assert.equal(
    attributionImpersonatesOfficialAuthority(content.attribution),
    false
  );
  assert.equal(content.commentary, null);
  assert.equal(content.title.en, entry.copy.en.title);
  assert.equal(content.overview["zh-CN"], entry.copy["zh-CN"].summary);
  assert.equal(content.body?.en, entry.copy.en.practicalRelevance);
  assert.equal(
    content.implications[0]?.text["zh-CN"],
    entry.copy["zh-CN"].practicalRelevance
  );
  // The admin projection carries storage/provenance labels for the registry.
  const adminEntry = toAdminCompatibilitySourceEntry(entry);
  assert.equal(adminEntry.slug, entry.slug);
  assert.equal(adminEntry.source.officialUrl, entry.source.officialUrl);
  assert.equal(adminEntry.copy.en.title, entry.copy.en.title);
});

test("an entry without practical-relevance text still maps cleanly", () => {
  const entry = compatibilityEntry({
    copy: {
      "zh-CN": { title: "标题", summary: "摘要" },
      en: { title: "Title", summary: "Summary" },
    },
  });
  const content = compatibilityEntryToHumanContent(entry);
  assert.doesNotThrow(() => policyHumanRevisionContentSchema.parse(content));
  assert.equal(content.body, null);
  assert.deepEqual(content.affectedGroups, []);
  assert.deepEqual(content.implications, []);
});

test("importing creates a draft under Policy Editor management and never publishes", async () => {
  const { store, repository, service } = setup();
  const entry = compatibilityEntry();
  const result = await importCompatibilityEntryForEntry({
    entry,
    actorUserId: ADMIN.userId,
    service,
    repository,
  });
  assert.equal(result.status, "ok");
  if (result.status !== "ok") {
    return;
  }
  assert.equal(result.value.outcome, "draft_created");
  assert.equal(result.value.slug, entry.slug);
  const item = store.items.get(result.value.itemId);
  assert.ok(item);
  // The durable item owns the compatibility slug but publishes nothing yet.
  assert.equal(item.slug, entry.slug);
  assert.equal(item.origin, "manual");
  assert.equal(item.latestPublishedRevisionId, null);
  assert.equal(item.editorialStatus, "draft");
  const revision = result.value.revisionId
    ? store.revisions.get(result.value.revisionId)
    : null;
  assert.ok(revision);
  assert.equal(revision.contentKind, "lawyer_authored");
  assert.equal(revision.editorialStatus, "draft");
  assert.equal(
    revision.idempotencyKey,
    compatibilityImportIdempotencyKey(entry.slug)
  );
  assert.equal(
    compatibilityImportIdempotencyKey(entry.slug).startsWith(
      COMPATIBILITY_IMPORT_IDEMPOTENCY_PREFIX
    ),
    true
  );
  const content = policyHumanRevisionContentSchema.parse(revision.humanContent);
  assert.equal(content.title.en, entry.copy.en.title);
  assert.equal(content.sourceReferences[0]?.url, entry.source.officialUrl);
  // The import itself is audited with the server-authoritative actor.
  const audit = store.audit.find(
    (event) => event.action === "create_manual_policy"
  );
  assert.ok(audit);
  assert.equal(audit.actorUserId, ADMIN.userId);
});

test("importing is idempotent: an already managed slug is reported, never duplicated", async () => {
  const { store, repository, service } = setup();
  const entry = compatibilityEntry();
  const first = await importCompatibilityEntryForEntry({
    entry,
    actorUserId: ADMIN.userId,
    service,
    repository,
  });
  assert.equal(first.status, "ok");
  const second = await importCompatibilityEntryForEntry({
    entry,
    actorUserId: ADMIN.userId,
    service,
    repository,
  });
  assert.equal(second.status, "ok");
  if (second.status === "ok" && first.status === "ok") {
    assert.equal(second.value.outcome, "already_managed");
    assert.equal(second.value.itemId, first.value.itemId);
    assert.equal(second.value.revisionId, null);
  }
  assert.equal(store.items.size, 1);
  assert.equal(store.revisions.size, 1);
});

test("importing requires real editorial authority (D-070 preserved)", async () => {
  const { store, repository, service } = setup();
  const denied = await importCompatibilityEntryForEntry({
    entry: compatibilityEntry(),
    actorUserId: CONSUMER.userId,
    service,
    repository,
  });
  assert.equal(denied.status, "error");
  if (denied.status === "error") {
    assert.equal(denied.code, "publication_authority_required");
  }
  assert.equal(store.items.size, 0);
  assert.equal(store.audit.length, 0);
});
