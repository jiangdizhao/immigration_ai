import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  POLICY_ANALYSIS_SCHEMA,
  POLICY_HUMAN_REVISION_SCHEMA,
  POLICY_VERIFICATION_SCHEMA,
  type PolicyHumanRevisionContent,
} from "./contracts";
import { isCurrentPublishedPolicyRevision } from "./currentness";
import {
  createInMemoryEditorialRepository,
  createInMemoryEditorialStore,
  type InMemoryEditorialStore,
  seedEditorialActor,
  seedEditorialGrant,
  seedEditorialItem,
  seedEditorialRevision,
} from "./editorial-memory";
import { createPolicyEditorialService } from "./editorial-service";

const VERIFIED_AT = new Date("2026-09-01T00:00:00.000Z");
const admin = {
  userId: "user-admin",
  role: "admin" as const,
  email: "admin@example.test",
  emailVerifiedAt: VERIFIED_AT,
};
const editor = {
  userId: "user-editor",
  role: "lawyer" as const,
  email: "editor@example.test",
  emailVerifiedAt: VERIFIED_AT,
};
const plainLawyer = {
  userId: "user-lawyer",
  role: "lawyer" as const,
  email: "lawyer@example.test",
  emailVerifiedAt: VERIFIED_AT,
};
const unverifiedLawyer = {
  userId: "user-lawyer-unverified",
  role: "lawyer" as const,
  email: "unverified@example.test",
  emailVerifiedAt: null,
};
const unverifiedAdmin = {
  userId: "user-admin-unverified",
  role: "admin" as const,
  email: "admin-unverified@example.test",
  emailVerifiedAt: null,
};
/** A second verified, granted lawyer (concurrent-publication scenarios). */
const secondEditor = {
  userId: "user-editor-two",
  role: "lawyer" as const,
  email: "editor-two@example.test",
  emailVerifiedAt: new Date("2026-09-01T00:00:00.000Z"),
};
const customer = {
  userId: "user-customer",
  role: "user" as const,
  email: "customer@example.test",
  emailVerifiedAt: VERIFIED_AT,
};

function bilingual(zh: string, en: string) {
  return { "zh-CN": zh, en };
}

function humanContent(
  overrides: Partial<PolicyHumanRevisionContent> = {}
): PolicyHumanRevisionContent {
  return {
    schemaVersion: POLICY_HUMAN_REVISION_SCHEMA,
    title: bilingual("有牌照律师政策评论", "Licensed lawyer policy commentary"),
    overview: bilingual("概述内容", "Overview content"),
    keyChanges: [
      { id: "change-1", text: bilingual("变化说明", "Change note") },
    ],
    affectedGroups: [
      { id: "group-1", text: bilingual("受影响人群", "Affected group") },
    ],
    implications: [
      { id: "implication-1", text: bilingual("实际影响", "Practical impact") },
    ],
    recommendedActions: [],
    body: null,
    commentary: bilingual("评论内容", "Commentary content"),
    attribution: "授权律师团队",
    sourceStatus: "announced",
    sourceReferences: [],
    officialSourceDate: null,
    commencementDate: null,
    reviewedAsOfDate: null,
    ...overrides,
  };
}

function failingAiAnalysis(evidenceRef: string) {
  const text = bilingual("AI 分析文本", "AI analysis text");
  const linked = { ...text, claimRefs: ["claim-1"], uncertainty: null };
  const unit = (id: string) => ({
    id,
    kind: "source_fact" as const,
    text: linked,
    evidenceRefs: [evidenceRef],
  });
  return {
    schemaVersion: POLICY_ANALYSIS_SCHEMA,
    publicationEligibility: {
      id: "policy-relevance",
      classification: "unrelated" as const,
      evidenceRefs: [evidenceRef],
    },
    title: unit("title"),
    executiveSummary: unit("summary"),
    keyChanges: [unit("change-1")],
    affectedGroups: [unit("group-1")],
    practicalImpacts: [unit("impact-1")],
    recommendedActions: [unit("action-1")],
    transitionInfo: null,
    uncertainties: [unit("uncertainty-1")],
    relatedSnapshotRefs: [],
    sourceStatus: {
      id: "source-status",
      value: "announced" as const,
      certain: true,
      claimRef: "claim-1",
      evidenceRefs: [evidenceRef],
    },
    materialClaims: [
      {
        id: "claim-1",
        kind: "source_fact" as const,
        decisive: true,
        conditional: false,
        text,
        uncertainty: null,
        evidenceRefs: [evidenceRef],
      },
    ],
    importance: {
      affectedPopulation: 2,
      legalForce: "official_guidance" as const,
      immediacy: 2,
      serviceRelevance: 4,
      proceduralImpact: 2,
    },
  };
}

function failingVerification(evidenceRef: string) {
  const verdicts: [string, "supported" | "unsupported"][] = [
    ["policy-relevance", "unsupported"],
    ["title", "supported"],
    ["summary", "supported"],
    ["change-1", "supported"],
    ["group-1", "supported"],
    ["impact-1", "supported"],
    ["action-1", "supported"],
    ["uncertainty-1", "supported"],
    ["source-status", "supported"],
    ["claim-1", "supported"],
  ];
  return {
    schemaVersion: POLICY_VERIFICATION_SCHEMA,
    assessments: verdicts.map(([unitId, verdict]) => ({
      unitId,
      verdict,
      evidenceRefs: [evidenceRef],
      reasonCode: "insufficient_support" as const,
    })),
  };
}

function seedStore(): InMemoryEditorialStore {
  const store = createInMemoryEditorialStore();
  seedEditorialActor(store, admin);
  seedEditorialActor(store, editor);
  seedEditorialActor(store, plainLawyer);
  seedEditorialActor(store, unverifiedLawyer);
  seedEditorialActor(store, unverifiedAdmin);
  seedEditorialActor(store, customer);
  seedEditorialActor(store, secondEditor);
  seedEditorialGrant(store, editor.userId, admin.userId);
  seedEditorialGrant(store, secondEditor.userId, admin.userId);
  return store;
}

test("the editorial core has no AI/provider dependency by construction", () => {
  for (const file of [
    "editorial-core.ts",
    "editorial-service.ts",
    "editorial-api.ts",
    "operator-submission.ts",
  ]) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /@ai-sdk|from "ai"|from "\.\/provider"/u, file);
  }
});

test("publication authority: verified granted lawyer and verified Admin; others denied (D-070)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  // D-070: the Admin account is the firm's principal lawyer and holds inherent
  // editorial authority — no grant is required, and it still manages grants.
  assert.equal(await service.canEdit(admin.userId), true);
  assert.equal(await service.isAdministrator(admin.userId), true);
  assert.equal(await service.isAdministrator(editor.userId), false);
  assert.equal(await service.canEdit(editor.userId), true);
  assert.equal(await service.canEdit(plainLawyer.userId), false);
  assert.equal(await service.canEdit(customer.userId), false);
  assert.equal(await service.canEdit(unverifiedLawyer.userId), false);
  assert.equal(await service.canEdit(unverifiedAdmin.userId), false);
  assert.equal(await service.canEdit("unknown-user"), false);

  // The verified Admin can author a manual policy without any grant row.
  const adminAttempt = await service.createManualDraft({
    actorUserId: admin.userId,
    content: humanContent(),
  });
  assert.equal(adminAttempt.status, "ok");
  assert.equal(store.grants.has(admin.userId), false);

  // An unverified lawyer is refused even if a grant row exists for it.
  seedEditorialGrant(store, unverifiedLawyer.userId, admin.userId);
  assert.equal(await service.canEdit(unverifiedLawyer.userId), false);
  const unverifiedAttempt = await service.createManualDraft({
    actorUserId: unverifiedLawyer.userId,
    content: humanContent(),
  });
  assert.equal(unverifiedAttempt.status, "error");
  if (unverifiedAttempt.status === "error") {
    assert.equal(unverifiedAttempt.code, "identity_not_verified");
  }

  // An unverified Admin is refused as well (verification is DB-authoritative).
  const unverifiedAdminAttempt = await service.createManualDraft({
    actorUserId: unverifiedAdmin.userId,
    content: humanContent(),
  });
  assert.equal(unverifiedAdminAttempt.status, "error");
  if (unverifiedAdminAttempt.status === "error") {
    assert.equal(unverifiedAdminAttempt.code, "identity_not_verified");
  }

  // An ordinary user with a forged grant row is refused by role.
  seedEditorialGrant(store, customer.userId, admin.userId);
  const customerAttempt = await service.createManualDraft({
    actorUserId: customer.userId,
    content: humanContent(),
  });
  assert.equal(customerAttempt.status, "error");
  if (customerAttempt.status === "error") {
    assert.equal(customerAttempt.code, "publication_authority_required");
  }

  // Revoking an ordinary grant does not touch the Admin's inherent authority.
  const revokeAdmin = await service.revokePolicyEditor({
    actorUserId: admin.userId,
    email: admin.email,
  });
  assert.equal(revokeAdmin.status, "ok");
  if (revokeAdmin.status === "ok") {
    assert.equal(revokeAdmin.value.outcome, "not_granted");
  }
  assert.equal(await service.canEdit(admin.userId), true);
  assert.equal(await service.isAdministrator(admin.userId), true);

  const revoked = await service.revokePolicyEditor({
    actorUserId: admin.userId,
    email: editor.email,
  });
  assert.equal(revoked.status, "ok");
  assert.equal(await service.canEdit(editor.userId), false);

  const result = await service.createManualDraft({
    actorUserId: editor.userId,
    content: humanContent(),
  });
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.equal(result.code, "capability_required");
  }
});

test("a grant on a customer account is refused and can never publish", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  // Simulate an improperly assigned/forged grant row for a customer account.
  seedEditorialGrant(store, customer.userId, admin.userId);
  assert.equal(await service.canEdit(customer.userId), false);
  const attempt = await service.createManualDraft({
    actorUserId: customer.userId,
    content: humanContent(),
  });
  assert.equal(attempt.status, "error");
  if (attempt.status === "error") {
    assert.equal(attempt.code, "publication_authority_required");
  }
  // Granting publication authority to a customer account is refused outright.
  const refused = await service.grantPolicyEditor({
    actorUserId: admin.userId,
    email: customer.email,
  });
  assert.equal(refused.status, "error");
  if (refused.status === "error") {
    assert.equal(refused.code, "grant_target_not_eligible");
    assert.equal(refused.detail, "not_a_lawyer");
  }
  const unverifiedRefused = await service.grantPolicyEditor({
    actorUserId: admin.userId,
    email: unverifiedLawyer.email,
  });
  assert.equal(unverifiedRefused.status, "error");
  if (unverifiedRefused.status === "error") {
    assert.equal(unverifiedRefused.detail, "unverified");
  }
});

test("grant/revoke are administrator-only and audited", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const denied = await service.grantPolicyEditor({
    actorUserId: editor.userId,
    email: plainLawyer.email,
  });
  assert.equal(denied.status, "error");
  if (denied.status === "error") {
    assert.equal(denied.code, "admin_required");
  }
  const missing = await service.grantPolicyEditor({
    actorUserId: admin.userId,
    email: "nobody@example.test",
  });
  assert.equal(missing.status, "error");
  if (missing.status === "error") {
    assert.equal(missing.code, "user_not_found");
  }
  const granted = await service.grantPolicyEditor({
    actorUserId: admin.userId,
    email: plainLawyer.email.toUpperCase(),
  });
  assert.equal(granted.status, "ok");
  assert.equal(await service.canEdit(plainLawyer.userId), true);
  assert.deepEqual(
    store.audit.map((event) => event.action),
    ["grant_policy_editor"]
  );
  const grants = await service.listPolicyEditorGrants();
  // Three grants exist in the fixture: the seeded editor, the second granted
  // lawyer added for the R2 concurrency scenarios, and the just-granted lawyer.
  assert.equal(grants.length, 3);
  assert.ok(grants.some((grant) => grant.userId === plainLawyer.userId));
});

test("manual authoring: create draft, save with concurrency, publish, revise", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const created = await service.createManualDraft({
    actorUserId: editor.userId,
    content: humanContent(),
  });
  assert.equal(created.status, "ok");
  if (created.status !== "ok") {
    return;
  }
  assert.equal(created.value.slug, "licensed-lawyer-policy-commentary");
  const item = store.items.get(created.value.itemId);
  assert.ok(item);
  assert.equal(item.origin, "manual");
  assert.equal(item.editorialStatus, "draft");
  assert.equal(item.latestPublishedRevisionId, null);
  assert.equal(created.value.revisionNumber, 1);

  // A retried create (same author, same content) is an idempotent replay.
  const retried = await service.createManualDraft({
    actorUserId: editor.userId,
    content: humanContent(),
  });
  assert.equal(retried.status, "ok");
  if (retried.status === "ok") {
    assert.equal(retried.value.itemId, created.value.itemId);
    assert.equal(retried.value.revisionId, created.value.revisionId);
  }

  // Drafts never satisfy the public currentness contract.
  const draftRevision = store.revisions.get(created.value.revisionId);
  assert.ok(draftRevision);
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: store.items.get(created.value.itemId) ?? item,
      revision: { ...draftRevision, editorialStatus: "draft" },
      snapshot: null,
    }),
    false
  );

  // Concurrency: an unknown content version cannot silently overwrite.
  const stale = await service.saveManualDraft({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    content: humanContent({
      overview: bilingual("并发修改", "Concurrent edit"),
    }),
    expectedContentVersion: "0".repeat(64),
  });
  assert.equal(stale.status, "error");
  if (stale.status === "error") {
    assert.equal(stale.code, "stale_draft_conflict");
  }

  const saved = await service.saveManualDraft({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    content: humanContent({
      overview: bilingual("更新后的概述", "Updated overview"),
    }),
    expectedContentVersion: created.value.contentVersion,
  });
  assert.equal(saved.status, "ok");
  if (saved.status !== "ok") {
    return;
  }

  // A stale publish must fail rather than publish unseen content.
  const stalePublish = await service.publishManualRevision({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    expectedContentVersion: created.value.contentVersion,
  });
  assert.equal(stalePublish.status, "error");
  if (stalePublish.status === "error") {
    assert.equal(stalePublish.code, "stale_draft_conflict");
  }

  const published = await service.publishManualRevision({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    expectedContentVersion: saved.value.contentVersion,
    idempotencyKey: "publish-manual-0001",
  });
  assert.equal(published.status, "ok");
  const publishedItem = store.items.get(created.value.itemId);
  assert.ok(publishedItem);
  assert.equal(publishedItem.editorialStatus, "published");
  assert.equal(
    publishedItem.latestPublishedRevisionId,
    created.value.revisionId
  );
  assert.equal(publishedItem.sourceStatus, "announced");
  const publishedRevision = store.revisions.get(created.value.revisionId);
  assert.ok(publishedRevision);
  assert.ok(publishedRevision.publishedAt);
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: publishedItem,
      revision: publishedRevision,
      snapshot: null,
    }),
    true
  );

  // Retried publish resolves to the same revision with a single audit event.
  const republish = await service.publishManualRevision({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    expectedContentVersion: saved.value.contentVersion,
    idempotencyKey: "publish-manual-0001",
  });
  assert.equal(republish.status, "ok");
  assert.equal(
    store.audit.filter((event) => event.action === "publish_manual_policy")
      .length,
    1
  );

  // A later revision supersedes the previous one.
  const revisionDraft = await service.createManualRevision({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
  });
  assert.equal(revisionDraft.status, "ok");
  if (revisionDraft.status !== "ok") {
    return;
  }
  assert.equal(revisionDraft.value.revisionNumber, 2);
  const revisionRow = store.revisions.get(revisionDraft.value.revisionId);
  assert.ok(revisionRow);
  await service.publishManualRevision({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: revisionDraft.value.revisionId,
    expectedContentVersion: revisionRow.analysisFingerprint,
  });
  const previous = store.revisions.get(created.value.revisionId);
  assert.ok(previous);
  assert.equal(previous.editorialStatus, "superseded");
  const itemAfter = store.items.get(created.value.itemId);
  assert.ok(itemAfter);
  assert.equal(
    itemAfter.latestPublishedRevisionId,
    revisionDraft.value.revisionId
  );
});

test("force publish sets durable human-publication protection (R1)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const { item, revision } = seedHeldAiItem(store);
  assert.equal(item.publicationMode, "automatic");
  const result = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: "Correct the automated relevance verdict",
    content: humanContent(),
  });
  assert.equal(result.status, "ok");
  const protectedItem = store.items.get(item.id);
  assert.ok(protectedItem);
  assert.equal(protectedItem.publicationMode, "human_protected");
  assert.equal(protectedItem.protectionSetByUserId, editor.userId);
  assert.ok(protectedItem.protectionSetAt);
  const audit = store.audit.find(
    (event) => event.action === "force_publish_revision"
  );
  assert.ok(audit);
  assert.equal(audit.detail.publicationModeAfter, "human_protected");
  // The audit carries the server-derived editor identity, not a body field.
  assert.equal(audit.detail.editorUserId, editor.userId);
  assert.equal(audit.detail.editorEmail, editor.email);
  assert.equal(audit.detail.editorRole, "lawyer");
});

test("manual publication also protects the item and audits editor identity (R1)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const created = await service.createManualDraft({
    actorUserId: editor.userId,
    content: humanContent(),
  });
  assert.equal(created.status, "ok");
  if (created.status !== "ok") {
    return;
  }
  const published = await service.publishManualRevision({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    expectedContentVersion: created.value.contentVersion,
  });
  assert.equal(published.status, "ok");
  const item = store.items.get(created.value.itemId);
  assert.ok(item);
  assert.equal(item.publicationMode, "human_protected");
  const audit = store.audit.find(
    (event) => event.action === "publish_manual_policy"
  );
  assert.ok(audit);
  assert.equal(audit.detail.editorUserId, editor.userId);
  assert.equal(audit.detail.publicationModeAfter, "human_protected");
});

test("archive and restore keep the protection decision intact (R1)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const { item, revision } = seedHeldAiItem(store);
  await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: "Publish the corrected revision",
    content: humanContent(),
  });
  const archived = await service.archiveItem({
    actorUserId: editor.userId,
    itemId: item.id,
    reason: "Withdrawn for review",
  });
  assert.equal(archived.status, "ok");
  assert.equal(store.items.get(item.id)?.publicationMode, "human_protected");
  const restored = await service.restoreItem({
    actorUserId: editor.userId,
    itemId: item.id,
  });
  assert.equal(restored.status, "ok");
  const after = store.items.get(item.id);
  assert.ok(after);
  assert.equal(after.publicationMode, "human_protected");
  assert.equal(after.editorialStatus, "published");
  const restoreAudit = store.audit.find(
    (event) => event.action === "restore_policy_item"
  );
  assert.ok(restoreAudit);
  assert.equal(restoreAudit.detail.publicationMode, "human_protected");
});

test("releasing protection is explicit, audited, idempotent and authorized (R1)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const { item, revision } = seedHeldAiItem(store);

  // Only publication authority may release protection. Per D-070 a verified
  // Admin (principal lawyer) may; an ordinary user and a lawyer without a
  // grant may not.
  for (const actorUserId of [customer.userId, plainLawyer.userId]) {
    const denied = await service.releasePublicationProtection({
      actorUserId,
      itemId: item.id,
    });
    assert.equal(denied.status, "error", actorUserId);
  }
  const adminRelease = await service.releasePublicationProtection({
    actorUserId: admin.userId,
    itemId: item.id,
    reason: "Principal lawyer check",
  });
  // The item is not protected yet, so this is the idempotent no-op result —
  // proving the Admin passed the authority gate instead of being refused.
  assert.equal(adminRelease.status, "ok");
  if (adminRelease.status === "ok") {
    assert.equal(adminRelease.value.changed, false);
    assert.equal(adminRelease.value.publicationMode, "automatic");
  }

  await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: "Publish the corrected revision",
    content: humanContent(),
  });
  const released = await service.releasePublicationProtection({
    actorUserId: editor.userId,
    itemId: item.id,
    reason: "The automated pipeline may take over again",
  });
  assert.equal(released.status, "ok");
  if (released.status === "ok") {
    assert.equal(released.value.publicationMode, "automatic");
    assert.equal(released.value.changed, true);
  }
  const afterRelease = store.items.get(item.id);
  assert.ok(afterRelease);
  assert.equal(afterRelease.publicationMode, "automatic");
  assert.equal(afterRelease.protectionSetAt, null);
  assert.equal(afterRelease.protectionSetByUserId, null);
  assert.equal(
    store.audit.filter(
      (event) => event.action === "release_publication_protection"
    ).length,
    1
  );
  const audit = store.audit.find(
    (event) => event.action === "release_publication_protection"
  );
  assert.ok(audit);
  assert.equal(audit.detail.publicationModeBefore, "human_protected");
  assert.equal(
    audit.overrideReason,
    "The automated pipeline may take over again"
  );

  // A second release changes nothing and writes no second audit row.
  const again = await service.releasePublicationProtection({
    actorUserId: editor.userId,
    itemId: item.id,
  });
  assert.equal(again.status, "ok");
  if (again.status === "ok") {
    assert.equal(again.value.changed, false);
  }
  assert.equal(
    store.audit.filter(
      (event) => event.action === "release_publication_protection"
    ).length,
    1
  );
});

test("a retried create after the draft was edited never duplicates the item (R1)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const key = "create-session-0001";
  const created = await service.createManualDraft({
    actorUserId: editor.userId,
    content: humanContent(),
    idempotencyKey: key,
  });
  assert.equal(created.status, "ok");
  if (created.status !== "ok") {
    return;
  }
  const saved = await service.saveManualDraft({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    content: humanContent({
      title: bilingual("已编辑的标题", "Edited title"),
    }),
    expectedContentVersion: created.value.contentVersion,
  });
  assert.equal(saved.status, "ok");
  // Retry the original create request with the same key. The content version no
  // longer matches the first revision, which previously created a duplicate.
  const retried = await service.createManualDraft({
    actorUserId: editor.userId,
    content: humanContent(),
    idempotencyKey: key,
  });
  assert.equal(retried.status, "ok");
  if (retried.status === "ok") {
    assert.equal(retried.value.itemId, created.value.itemId);
    assert.equal(retried.value.revisionId, created.value.revisionId);
  }
  assert.equal(store.items.size, 1);
});

test("the workspace paginates deterministically and reports more pages (R1)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  for (const [index, slug] of ["alpha", "beta", "gamma"].entries()) {
    seedEditorialItem(store, {
      id: `item-${slug}`,
      slug,
      origin: "manual",
      editorialStatus: "published",
      updatedAt: new Date(`2026-10-0${index + 1}T00:00:00.000Z`),
    });
  }
  const firstPage = await service.listWorkspacePaginated({ limit: 2 });
  assert.equal(firstPage.items.length, 2);
  assert.equal(firstPage.items[0].slug, "gamma");
  assert.equal(firstPage.page.hasMore, true);
  assert.equal(firstPage.page.nextOffset, 2);
  const secondPage = await service.listWorkspacePaginated({
    limit: 2,
    offset: firstPage.page.nextOffset ?? 0,
  });
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.items[0].slug, "alpha");
  assert.equal(secondPage.page.hasMore, false);
  assert.equal(secondPage.page.nextOffset, null);
  // Every item remains reachable, and the row limit is bounded.
  const bounded = await service.listWorkspacePaginated({ limit: 100_000 });
  assert.equal(bounded.page.limit, 200);
  assert.equal(bounded.items.length, 3);
});

test("saving a draft records a reconstructible audit change set (R1)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const created = await service.createManualDraft({
    actorUserId: editor.userId,
    content: humanContent(),
  });
  assert.equal(created.status, "ok");
  if (created.status !== "ok") {
    return;
  }
  const saved = await service.saveManualDraft({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    content: humanContent({
      title: bilingual("新的标题", "New title"),
      sourceReferences: [
        {
          authority: "Example authority",
          title: "Example source",
          url: "https://example.test/source",
          date: "2026-09-01",
          citation: "F2026L00001",
        },
      ],
      reviewedAsOfDate: "2026-09-21",
    }),
    expectedContentVersion: created.value.contentVersion,
  });
  assert.equal(saved.status, "ok");
  const audit = store.audit.find(
    (event) => event.action === "save_manual_draft"
  );
  assert.ok(audit);
  const changeSet = audit.detail.changeSet as {
    changedFields: string[];
    scalarChanges: {
      field: string;
      before: string | null;
      after: string | null;
    }[];
    truncated: boolean;
  };
  assert.ok(changeSet.changedFields.includes("title"));
  assert.ok(changeSet.changedFields.includes("sourceReferences"));
  assert.ok(changeSet.changedFields.includes("reviewedAsOfDate"));
  const titleChange = changeSet.scalarChanges.find(
    (change) => change.field === "title"
  );
  assert.ok(titleChange);
  assert.match(titleChange.before ?? "", /有牌照律师政策评论/);
  assert.match(titleChange.after ?? "", /新的标题/);
  assert.equal(changeSet.truncated, false);
  // The audit never stores only hashes: the two fingerprints are still present.
  assert.equal(typeof audit.detail.contentVersion, "string");
  assert.equal(typeof audit.detail.previousContentVersion, "string");
});

test("item detail explains an unreadable AI analysis and still allows correction (R1)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const item = seedEditorialItem(store, {
    id: "item-broken-ai",
    slug: "broken-ai-policy",
    origin: "automated",
    editorialStatus: "review_required",
    latestSnapshotId: "snap-broken",
  });
  const revision = seedEditorialRevision(store, {
    id: "rev-broken",
    itemId: item.id,
    revisionNumber: 1,
    snapshotId: "snap-broken",
    contentKind: "ai_analysis",
    editorialStatus: "review_required",
    // Stored AI analysis that can no longer be parsed at all.
    analysis: { schemaVersion: "policy-intelligence.analysis.v0" },
    verification: null,
  });
  store.evidence.set("snap-broken", {
    evidenceRef: "policy-snapshot:snap-broken",
    snapshotId: "snap-broken",
    sourceConfigId: "home-affairs-guidance",
    sourceId: "source-broken",
    authority: "Department of Home Affairs",
    canonicalUrl: "https://immi.homeaffairs.gov.au/policy/broken",
    officialTitle: "Official broken page",
    retrievedAt: "2026-10-01T00:00:00.000Z",
    contentHash: "hash-broken",
    sourceDate: "2026-10-01",
    effectiveDate: null,
    evidenceTruncated: false,
    text: "Official text.",
  });
  const detail = await service.getItemDetail(item.id);
  assert.ok(detail);
  assert.equal(detail.overrideSeedStatus, "analysis_unavailable");
  assert.equal(
    detail.overrideSeed?.officialSource?.url,
    "https://immi.homeaffairs.gov.au/policy/broken"
  );
  assert.equal(detail.overrideSeed?.title.en, "");

  // Human correction still works on the same revision.
  const repaired = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason:
      "Stored analysis is unreadable; publishing a lawyer revision",
    content: humanContent(),
  });
  assert.equal(repaired.status, "ok");
  assert.equal(store.items.get(item.id)?.publicationMode, "human_protected");
});

function seedHeldAiItem(
  store: InMemoryEditorialStore,
  options: { withEvidence?: boolean } = {}
) {
  const item = seedEditorialItem(store, {
    id: "item-ai",
    slug: "ai-held-policy",
    origin: "automated",
    editorialStatus: "review_required",
    latestSnapshotId: "snap-1",
  });
  const revision = seedEditorialRevision(store, {
    id: "rev-ai-1",
    itemId: item.id,
    revisionNumber: 1,
    snapshotId: "snap-1",
    contentKind: "ai_analysis",
    editorialStatus: "review_required",
    analysis: failingAiAnalysis("policy-snapshot:snap-1"),
    verification: failingVerification("policy-snapshot:snap-1"),
  });
  if (options.withEvidence !== false) {
    store.evidence.set("snap-1", {
      evidenceRef: "policy-snapshot:snap-1",
      snapshotId: "snap-1",
      sourceConfigId: "home-affairs-guidance",
      sourceId: "source-1",
      authority: "Department of Home Affairs",
      canonicalUrl: "https://immi.homeaffairs.gov.au/policy/example",
      officialTitle: "Official policy page",
      retrievedAt: "2026-10-01T00:00:00.000Z",
      contentHash: "hash-1",
      sourceDate: "2026-10-01",
      effectiveDate: null,
      evidenceTruncated: false,
      text: "Official policy page content.",
    });
  }
  return { item, revision };
}

const overrideContent = () =>
  humanContent({
    sourceStatus: "in_force",
    sourceReferences: [
      {
        authority: "Department of Home Affairs",
        title: "Official policy page",
        url: "https://immi.homeaffairs.gov.au/policy/example",
        date: "2026-10-01",
        citation: null,
      },
    ],
  });

const OVERRIDE_REASON = "AI relevance judgement is wrong for this source";

test("force publish overrides an AI-held revision and records the AI decision", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const { item, revision } = seedHeldAiItem(store);

  const denied = await service.forcePublishOverride({
    actorUserId: plainLawyer.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: OVERRIDE_REASON,
    content: humanContent(),
  });
  assert.equal(denied.status, "error");
  if (denied.status === "error") {
    assert.equal(denied.code, "capability_required");
  }

  const result = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: OVERRIDE_REASON,
    content: overrideContent(),
    idempotencyKey: "force-publish-0001",
  });
  assert.equal(result.status, "ok");
  if (result.status !== "ok") {
    return;
  }

  const updatedItem = store.items.get(item.id);
  assert.ok(updatedItem);
  assert.equal(updatedItem.editorialStatus, "published");
  assert.equal(updatedItem.latestPublishedRevisionId, result.value.revisionId);
  assert.equal(updatedItem.sourceStatus, "in_force");

  const override = store.revisions.get(result.value.revisionId);
  assert.ok(override);
  assert.equal(override.contentKind, "lawyer_override");
  assert.equal(override.baseRevisionId, revision.id);
  assert.equal(override.overrideReason, OVERRIDE_REASON);
  assert.equal(override.analysis, null);
  assert.equal(override.verification, null);
  assert.ok(override.publishedAt);
  const decision = override.aiDecision as {
    gateEligible: boolean | null;
    gateReasons: string[];
    publicationMode: string | null;
    verificationVerdicts: { unitId: string; verdict: string }[];
    note: string | null;
  };
  // D-072: the AI relevance opinion is recorded as an advisory on the override
  // record. It no longer reads as a publication veto, and the automated path
  // would have published this revision as a full analysis.
  assert.equal(decision.gateEligible, true);
  assert.equal(decision.publicationMode, "full_analysis");
  assert.ok(decision.gateReasons.includes("publication_eligibility_unrelated"));
  assert.ok(decision.gateReasons.includes("publication_eligibility_not_verified"));
  assert.ok(
    decision.verificationVerdicts.some(
      (entry) =>
        entry.unitId === "policy-relevance" && entry.verdict === "unsupported"
    )
  );

  // The AI revision was never published and is now superseded.
  const superseded = store.revisions.get(revision.id);
  assert.ok(superseded);
  assert.equal(superseded.editorialStatus, "superseded");

  // The override is the publicly current revision.
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: updatedItem,
      revision: override,
      snapshot: { id: "snap-1", itemId: item.id },
    }),
    true
  );

  const audit = store.audit.at(-1);
  assert.ok(audit);
  assert.equal(audit.action, "force_publish_revision");
  assert.equal(audit.actorUserId, editor.userId);
  assert.equal(audit.overrideReason, OVERRIDE_REASON);
  // D-072: the recorded AI decision mirrors the corrected decision contract.
  assert.equal(
    (audit.detail.aiDecision as { gateEligible: boolean }).gateEligible,
    true
  );

  // A retried identical force publish is idempotent (no duplicate event).
  const auditCount = store.audit.length;
  const retry = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: OVERRIDE_REASON,
    content: overrideContent(),
    idempotencyKey: "force-publish-0001",
  });
  assert.equal(retry.status, "ok");
  if (retry.status === "ok") {
    assert.equal(retry.value.revisionId, result.value.revisionId);
  }
  assert.equal(store.audit.length, auditCount);

  // A reused key with different content is rejected, not silently applied.
  const reused = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: "different reason",
    content: humanContent({
      overview: bilingual("不同内容", "Different content"),
    }),
    idempotencyKey: "force-publish-0001",
  });
  assert.equal(reused.status, "error");
  if (reused.status === "error") {
    assert.equal(reused.code, "idempotency_key_reused");
  }
});

test("force publish succeeds when the AI decision cannot even be recomputed", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const { item, revision } = seedHeldAiItem(store, { withEvidence: false });
  const result = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: "Publish while the verifier is unavailable",
    content: humanContent(),
  });
  assert.equal(result.status, "ok");
  if (result.status !== "ok") {
    return;
  }
  const override = store.revisions.get(result.value.revisionId);
  assert.ok(override);
  const decision = override.aiDecision as { note: string | null };
  assert.equal(decision.note, "snapshot_evidence_unavailable");
  const updatedItem = store.items.get(item.id);
  assert.ok(updatedItem);
  assert.equal(updatedItem.editorialStatus, "published");
});

test("stale or archived overrides are rejected instead of overwriting newer work", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const { item, revision } = seedHeldAiItem(store);

  const wrongNumber = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 7,
    expectedPublishedRevisionId: null,
    overrideReason: "stale base",
    content: humanContent(),
  });
  assert.equal(wrongNumber.status, "error");
  if (wrongNumber.status === "error") {
    assert.equal(wrongNumber.code, "stale_base_revision_conflict");
  }

  const wrongPointer = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: "11111111-1111-4111-8111-111111111111",
    overrideReason: "stale publication",
    content: humanContent(),
  });
  assert.equal(wrongPointer.status, "error");
  if (wrongPointer.status === "error") {
    assert.equal(wrongPointer.code, "stale_publication_conflict");
  }

  const emptyReason = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: " x ",
    content: humanContent(),
  });
  assert.equal(emptyReason.status, "error");
  if (emptyReason.status === "error") {
    assert.equal(emptyReason.code, "validation_failed");
  }

  const invalidContent = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: OVERRIDE_REASON,
    content: { schemaVersion: POLICY_HUMAN_REVISION_SCHEMA },
  });
  assert.equal(invalidContent.status, "error");
  if (invalidContent.status === "error") {
    assert.equal(invalidContent.code, "validation_failed");
  }

  await service.archiveItem({ actorUserId: editor.userId, itemId: item.id });
  const archived = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: OVERRIDE_REASON,
    content: humanContent(),
  });
  assert.equal(archived.status, "error");
  if (archived.status === "error") {
    assert.equal(archived.code, "item_archived");
  }
});

test("archive and restore preserve the editorial decision and audit history", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const { item, revision } = seedHeldAiItem(store);
  const published = await service.forcePublishOverride({
    actorUserId: editor.userId,
    itemId: item.id,
    baseRevisionId: revision.id,
    expectedBaseRevisionNumber: 1,
    expectedPublishedRevisionId: null,
    overrideReason: OVERRIDE_REASON,
    content: overrideContent(),
  });
  assert.equal(published.status, "ok");
  if (published.status !== "ok") {
    return;
  }

  const archived = await service.archiveItem({
    actorUserId: editor.userId,
    itemId: item.id,
    reason: "Awaiting corrected source",
  });
  assert.equal(archived.status, "ok");
  const archivedItem = store.items.get(item.id);
  assert.ok(archivedItem);
  assert.equal(archivedItem.editorialStatus, "archived");
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: archivedItem,
      revision: store.revisions.get(published.value.revisionId) ?? revision,
      snapshot: { id: "snap-1", itemId: item.id },
    }),
    false
  );

  const restored = await service.restoreItem({
    actorUserId: editor.userId,
    itemId: item.id,
  });
  assert.equal(restored.status, "ok");
  const restoredItem = store.items.get(item.id);
  assert.ok(restoredItem);
  assert.equal(restoredItem.editorialStatus, "published");
  assert.equal(
    restoredItem.latestPublishedRevisionId,
    published.value.revisionId
  );
  const restoredRevision = store.revisions.get(published.value.revisionId);
  assert.ok(restoredRevision);
  assert.equal(restoredRevision.editorialStatus, "published");
  assert.equal(restoredRevision.overrideReason, OVERRIDE_REASON);

  const again = await service.restoreItem({
    actorUserId: editor.userId,
    itemId: item.id,
  });
  assert.equal(again.status, "error");
  if (again.status === "error") {
    assert.equal(again.code, "item_not_archived");
  }

  const actions = store.audit.map((event) => event.action);
  assert.deepEqual(actions, [
    "force_publish_revision",
    "archive_policy_item",
    "restore_policy_item",
  ]);
  const trail = await service.listAuditTrail(item.id);
  assert.equal(trail.length, 3);
  assert.equal(trail[1].detail.reason, "Awaiting corrected source");
});

test("concurrent manual publication: a stale draft cannot supersede a newer publication (R2)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  // Lawyer A publishes V1 of a manual policy.
  const created = await service.createManualDraft({
    actorUserId: editor.userId,
    content: humanContent(),
  });
  assert.equal(created.status, "ok");
  if (created.status !== "ok") {
    return;
  }
  const publishedV1 = await service.publishManualRevision({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    expectedContentVersion: created.value.contentVersion,
  });
  assert.equal(publishedV1.status, "ok");

  // Two lawyers each open a draft based on V1.
  const draftA = await service.createManualRevision({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
  });
  const draftB = await service.createManualRevision({
    actorUserId: secondEditor.userId,
    itemId: created.value.itemId,
  });
  assert.equal(draftA.status, "ok");
  assert.equal(draftB.status, "ok");
  if (draftA.status !== "ok" || draftB.status !== "ok") {
    return;
  }
  const revisionA = store.revisions.get(draftA.value.revisionId);
  assert.ok(revisionA);
  assert.equal(
    revisionA.baseRevisionId,
    created.value.revisionId,
    "the draft records the published revision it was based on"
  );

  // Lawyer B publishes V2 first.
  const revisionB = store.revisions.get(draftB.value.revisionId);
  assert.ok(revisionB);
  const publishedV2 = await service.publishManualRevision({
    actorUserId: secondEditor.userId,
    itemId: created.value.itemId,
    revisionId: draftB.value.revisionId,
    expectedContentVersion: revisionB.analysisFingerprint,
  });
  assert.equal(publishedV2.status, "ok");

  // Lawyer A now attempts to publish the older draft: rejected, V2 stays current.
  const stalePublish = await service.publishManualRevision({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: draftA.value.revisionId,
    expectedContentVersion: revisionA.analysisFingerprint,
  });
  assert.equal(stalePublish.status, "error");
  if (stalePublish.status === "error") {
    assert.equal(stalePublish.code, "stale_publication_conflict");
    assert.equal(stalePublish.detail, "draft_baseline_superseded");
  }
  const item = store.items.get(created.value.itemId);
  assert.ok(item);
  assert.equal(item.latestPublishedRevisionId, draftB.value.revisionId);
  assert.equal(
    store.revisions.get(draftB.value.revisionId)?.editorialStatus,
    "published"
  );
  assert.equal(
    store.revisions.get(draftA.value.revisionId)?.editorialStatus,
    "draft"
  );
  assert.equal(
    store.revisions.get(created.value.revisionId)?.editorialStatus,
    "superseded"
  );
});

test("manual creation returns a controlled conflict instead of a database error (R2)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const first = await service.createManualDraft({
    actorUserId: editor.userId,
    slug: "contested-slug",
    content: humanContent(),
    idempotencyKey: "create-first-0001",
  });
  assert.equal(first.status, "ok");
  // A different author requesting the same slug is a *different* policy, so it
  // receives a deterministic alternative slug — a controlled response, never an
  // uncaught unique-violation error — and uniqueness is preserved.
  const alternate = await service.createManualDraft({
    actorUserId: secondEditor.userId,
    slug: "contested-slug",
    content: humanContent({
      title: bilingual("另一位律师的标题", "Other lawyer title"),
    }),
    idempotencyKey: "create-second-0001",
  });
  assert.equal(alternate.status, "ok");
  if (alternate.status === "ok") {
    assert.equal(alternate.value.slug, "contested-slug-2");
  }
  assert.equal(store.items.size, 2);
  // The same author retrying the same request still resolves idempotently.
  const replay = await service.createManualDraft({
    actorUserId: editor.userId,
    slug: "contested-slug",
    content: humanContent(),
    idempotencyKey: "create-first-0001",
  });
  assert.equal(replay.status, "ok");
  if (replay.status === "ok" && first.status === "ok") {
    assert.equal(replay.value.itemId, first.value.itemId);
  }
  assert.equal(store.items.size, 2);

  // A genuine, exhausted conflict is still reported as a controlled 409.
  const blockedSlug = "exhausted-slug";
  seedEditorialItem(store, { id: "blocked-0", slug: blockedSlug });
  for (let attempt = 2; attempt <= 50; attempt += 1) {
    seedEditorialItem(store, {
      id: `blocked-${attempt}`,
      slug: `${blockedSlug}-${attempt}`,
    });
  }
  const exhausted = await service.createManualDraft({
    actorUserId: editor.userId,
    slug: blockedSlug,
    content: humanContent({
      title: bilingual("耗尽标题", "Exhausted title"),
    }),
    idempotencyKey: "create-exhausted-0001",
  });
  assert.equal(exhausted.status, "error");
  if (exhausted.status === "error") {
    assert.equal(exhausted.code, "slug_unavailable");
  }
});

test("draft save history is lossless and recoverable (R2)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const longBodyZh = "正文".repeat(1200);
  // The contract trims trailing whitespace; keep the comparison exact after trim.
  const longBodyEn = "body ".repeat(1500).trim();
  const created = await service.createManualDraft({
    actorUserId: editor.userId,
    content: humanContent({
      body: bilingual(longBodyZh, longBodyEn),
      sourceReferences: [
        {
          authority: "Authority one",
          title: "Original source",
          url: "https://example.test/original",
          date: "2026-09-01",
          citation: "F2026L00001",
        },
      ],
      keyChanges: [
        { id: "change-1", text: bilingual("保留条目", "Kept entry") },
        { id: "change-2", text: bilingual("将被删除", "Removed entry") },
      ],
    }),
  });
  assert.equal(created.status, "ok");
  if (created.status !== "ok") {
    return;
  }
  // A later edit: amended citation, removed narrative item, removed reference.
  const saved = await service.saveManualDraft({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    content: humanContent({
      body: bilingual(longBodyZh, longBodyEn),
      sourceReferences: [
        {
          authority: "Authority one",
          title: "Original source",
          url: "https://example.test/amended",
          date: "2026-09-02",
          citation: "F2026L00009",
        },
      ],
      keyChanges: [
        { id: "change-1", text: bilingual("保留条目", "Kept entry") },
      ],
    }),
    expectedContentVersion: created.value.contentVersion,
  });
  assert.equal(saved.status, "ok");

  const history = await service.getDraftHistory({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
  });
  assert.equal(history.status, "ok");
  if (history.status !== "ok") {
    return;
  }
  assert.equal(history.value.snapshots.length, 2);
  for (const snapshot of history.value.snapshots) {
    assert.equal(snapshot.contentValid, true);
  }
  const original = history.value.snapshots[0];
  const amended = history.value.snapshots[1];
  assert.equal(original.saveNumber, 1);
  assert.equal(amended.saveNumber, 2);
  // The previous complete document is recoverable, including the long bilingual
  // body, the original citation and the content that was later removed.
  assert.equal(original.humanContent?.body?.["zh-CN"], longBodyZh);
  assert.equal(original.humanContent?.body?.en, longBodyEn);
  assert.equal(
    original.humanContent?.sourceReferences[0].citation,
    "F2026L00001"
  );
  assert.equal(
    original.humanContent?.sourceReferences[0].url,
    "https://example.test/original"
  );
  assert.equal(original.humanContent?.keyChanges.length, 2);
  assert.equal(original.humanContent?.keyChanges[1].text.en, "Removed entry");
  assert.equal(
    amended.humanContent?.sourceReferences[0].citation,
    "F2026L00009"
  );
  assert.equal(amended.humanContent?.keyChanges.length, 1);
  assert.notEqual(original.contentDigest, amended.contentDigest);
  // The audit row links the durable snapshot instead of claiming that its own
  // truncated previews are the history.
  const saveAudit = store.audit.find(
    (event) => event.action === "save_manual_draft"
  );
  assert.ok(saveAudit);
  assert.equal(saveAudit.detail.snapshotId, amended.id);
  assert.equal(saveAudit.detail.snapshotSaveNumber, 2);
});

test("draft history retention is bounded and never loses the newest save (R2)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const created = await service.createManualDraft({
    actorUserId: editor.userId,
    content: humanContent(),
  });
  assert.equal(created.status, "ok");
  if (created.status !== "ok") {
    return;
  }
  let version = created.value.contentVersion;
  for (let index = 1; index <= 30; index += 1) {
    const saved = await service.saveManualDraft({
      actorUserId: editor.userId,
      itemId: created.value.itemId,
      revisionId: created.value.revisionId,
      content: humanContent({
        overview: bilingual(`第 ${index} 次修改`, `Edit number ${index}`),
      }),
      expectedContentVersion: version,
    });
    assert.equal(saved.status, "ok");
    if (saved.status !== "ok") {
      return;
    }
    version = saved.value.contentVersion;
  }
  const history = await service.getDraftHistory({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
  });
  assert.equal(history.status, "ok");
  if (history.status !== "ok") {
    return;
  }
  assert.equal(history.value.snapshots.length, 25);
  assert.equal(history.value.snapshots.at(-1)?.saveNumber, 31);
  assert.equal(
    history.value.snapshots.at(-1)?.humanContent?.overview?.en,
    "Edit number 30"
  );
  assert.equal(history.value.snapshots[0].saveNumber, 7);
});

test("draft history requires publication authority and published content stays immutable (R2)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  const created = await service.createManualDraft({
    actorUserId: editor.userId,
    content: humanContent(),
  });
  assert.equal(created.status, "ok");
  if (created.status !== "ok") {
    return;
  }
  const denied = await service.getDraftHistory({
    actorUserId: plainLawyer.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
  });
  assert.equal(denied.status, "error");
  if (denied.status === "error") {
    assert.equal(denied.code, "capability_required");
  }
  const published = await service.publishManualRevision({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    expectedContentVersion: created.value.contentVersion,
  });
  assert.equal(published.status, "ok");
  const history = await service.getDraftHistory({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
  });
  assert.equal(history.status, "ok");
  if (history.status === "ok") {
    assert.equal(history.value.snapshots.length, 1);
    assert.equal(
      history.value.snapshots[0].humanContent?.title.en,
      "Licensed lawyer policy commentary"
    );
  }
  // Published content itself is immutable: a further save is refused.
  const immutability = await service.saveManualDraft({
    actorUserId: editor.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    content: humanContent({
      overview: bilingual("不应写入", "Must not be written"),
    }),
    expectedContentVersion: created.value.contentVersion,
  });
  assert.equal(immutability.status, "error");
  if (immutability.status === "error") {
    assert.equal(immutability.code, "not_a_draft");
  }
});

test("unverified administrators cannot manage grants (R2)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  assert.equal(await service.isAdministrator(unverifiedAdmin.userId), false);
  assert.equal(await service.isAdministrator(admin.userId), true);
  const granted = await service.grantPolicyEditor({
    actorUserId: unverifiedAdmin.userId,
    email: plainLawyer.email,
  });
  assert.equal(granted.status, "error");
  if (granted.status === "error") {
    assert.equal(granted.code, "identity_not_verified");
  }
  const revoked = await service.revokePolicyEditor({
    actorUserId: unverifiedAdmin.userId,
    email: editor.email,
  });
  assert.equal(revoked.status, "error");
  if (revoked.status === "error") {
    assert.equal(revoked.code, "identity_not_verified");
  }
  // The verified administrator still manages the capability (and the unverified
  // admin never gains publication authority).
  assert.equal(await service.canEdit(unverifiedAdmin.userId), false);
  const verifiedGrant = await service.grantPolicyEditor({
    actorUserId: admin.userId,
    email: plainLawyer.email,
  });
  assert.equal(verifiedGrant.status, "ok");
  assert.equal(await service.canEdit(plainLawyer.userId), true);
});

test("revoking never grants: revoke is update-only and reports honest outcomes (R3)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  // P0 regression: revoking a verified lawyer who was never granted the
  // capability must not create an active grant.
  const neverGranted = await service.revokePolicyEditor({
    actorUserId: admin.userId,
    email: plainLawyer.email,
  });
  assert.equal(neverGranted.status, "ok");
  if (neverGranted.status === "ok") {
    assert.equal(neverGranted.value.outcome, "not_granted");
  }
  assert.equal(
    store.grants.has(plainLawyer.userId),
    false,
    "a revoke must never create a grant row"
  );
  assert.equal(await service.canEdit(plainLawyer.userId), false);

  // An explicitly authorized grant still works and reports a fresh activation.
  const granted = await service.grantPolicyEditor({
    actorUserId: admin.userId,
    email: plainLawyer.email,
  });
  assert.equal(granted.status, "ok");
  if (granted.status === "ok") {
    assert.equal(granted.value.reactivated, false);
  }
  assert.equal(await service.canEdit(plainLawyer.userId), true);

  // Revoking an active grant deactivates it.
  const revoked = await service.revokePolicyEditor({
    actorUserId: admin.userId,
    email: plainLawyer.email,
  });
  assert.equal(revoked.status, "ok");
  if (revoked.status === "ok") {
    assert.equal(revoked.value.outcome, "revoked");
  }
  assert.equal(await service.canEdit(plainLawyer.userId), false);
  assert.notEqual(store.grants.get(plainLawyer.userId)?.revokedAt ?? null, null);

  // Repeated revocation is a safe, idempotent no-op.
  const repeated = await service.revokePolicyEditor({
    actorUserId: admin.userId,
    email: plainLawyer.email,
  });
  assert.equal(repeated.status, "ok");
  if (repeated.status === "ok") {
    assert.equal(repeated.value.outcome, "already_revoked");
  }
  assert.equal(await service.canEdit(plainLawyer.userId), false);

  // A subsequent explicitly authorized re-grant reactivates the capability.
  const regranted = await service.grantPolicyEditor({
    actorUserId: admin.userId,
    email: plainLawyer.email,
  });
  assert.equal(regranted.status, "ok");
  if (regranted.status === "ok") {
    assert.equal(regranted.value.reactivated, true);
  }
  assert.equal(await service.canEdit(plainLawyer.userId), true);
  assert.equal(store.grants.get(plainLawyer.userId)?.revokedAt ?? null, null);

  // Every action keeps server-authoritative actor identity and is audited with
  // its real outcome.
  const events = store.audit.filter(
    (event) =>
      event.action === "revoke_policy_editor" ||
      event.action === "grant_policy_editor"
  );
  assert.deepEqual(
    events.map((event) => [event.action, event.detail.outcome ?? event.detail.reactivated]),
    [
      ["revoke_policy_editor", "not_granted"],
      ["grant_policy_editor", false],
      ["revoke_policy_editor", "revoked"],
      ["revoke_policy_editor", "already_revoked"],
      ["grant_policy_editor", true],
    ]
  );
  for (const event of events) {
    assert.equal(event.actorUserId, admin.userId);
    assert.equal(event.detail.editorEmail, admin.email);
    assert.equal(event.detail.targetUserId, plainLawyer.userId);
  }
});

test("verified Admin exercises the full editorial workflow and keeps it without a grant (D-070)", async () => {
  const store = seedStore();
  const service = createPolicyEditorialService(
    createInMemoryEditorialRepository(store)
  );
  // (1) A verified Admin manually creates and publishes a policy with no grant.
  const created = await service.createManualDraft({
    actorUserId: admin.userId,
    content: humanContent(),
    idempotencyKey: "admin-manual-0001",
  });
  assert.equal(created.status, "ok");
  if (created.status !== "ok") {
    return;
  }
  const published = await service.publishManualRevision({
    actorUserId: admin.userId,
    itemId: created.value.itemId,
    revisionId: created.value.revisionId,
    expectedContentVersion: created.value.contentVersion,
  });
  assert.equal(published.status, "ok");
  assert.equal(store.grants.has(admin.userId), false);
  const publicRecord = await service.getItemDetail(created.value.itemId);
  assert.equal(
    publicRecord?.activePublishedRevision?.humanContent?.title.en,
    "Licensed lawyer policy commentary"
  );

  // (2) The Admin can force publish an AI-held item (human override).
  const { item: heldItem, revision: heldRevision } = seedHeldAiItem(store);
  const override = await service.forcePublishOverride({
    actorUserId: admin.userId,
    itemId: heldItem.id,
    baseRevisionId: heldRevision.id,
    expectedBaseRevisionNumber: heldRevision.revisionNumber,
    expectedPublishedRevisionId: null,
    overrideReason: "Principal lawyer override of the held AI analysis",
    content: humanContent(),
  });
  assert.equal(override.status, "ok");
  if (override.status === "ok") {
    // The Admin's publication is protected against later automated revisions.
    assert.equal(store.items.get(heldItem.id)?.publicationMode, "human_protected");
  }

  // (3) The Admin may release publication protection and archive/restore.
  const released = await service.releasePublicationProtection({
    actorUserId: admin.userId,
    itemId: heldItem.id,
    reason: "Automatic publication may resume",
  });
  assert.equal(released.status, "ok");
  if (released.status === "ok") {
    assert.equal(released.value.publicationMode, "automatic");
    assert.equal(released.value.changed, true);
  }
  const archived = await service.archiveItem({
    actorUserId: admin.userId,
    itemId: heldItem.id,
    reason: "Principal lawyer archive",
  });
  assert.equal(archived.status, "ok");
  const restored = await service.restoreItem({
    actorUserId: admin.userId,
    itemId: heldItem.id,
  });
  assert.equal(restored.status, "ok");

  // (4) The Admin manages grants and can relax/restore another lawyer's access.
  const granted = await service.grantPolicyEditor({
    actorUserId: admin.userId,
    email: plainLawyer.email,
  });
  assert.equal(granted.status, "ok");
  assert.equal(await service.canEdit(plainLawyer.userId), true);
  const lawyerDraft = await service.createManualDraft({
    actorUserId: plainLawyer.userId,
    content: humanContent(),
  });
  assert.equal(lawyerDraft.status, "ok");
  const lawyerRevoked = await service.revokePolicyEditor({
    actorUserId: admin.userId,
    email: plainLawyer.email,
  });
  assert.equal(lawyerRevoked.status, "ok");
  assert.equal(await service.canEdit(plainLawyer.userId), false);

  // (5) Ordinary grant revocation never removes the Admin's inherent authority.
  const adminStillEditing = await service.createManualDraft({
    actorUserId: admin.userId,
    content: humanContent({ title: bilingual("管理员第二次撰写", "Admin second draft") }),
  });
  assert.equal(adminStillEditing.status, "ok");
  assert.equal(await service.canEdit(admin.userId), true);

  // Every admin action is audited with the server-authoritative actor identity.
  const adminActions = store.audit.filter(
    (event) => event.actorUserId === admin.userId
  );
  for (const action of [
    "create_manual_policy",
    "publish_manual_policy",
    "force_publish_revision",
    "release_publication_protection",
    "archive_policy_item",
    "restore_policy_item",
    "grant_policy_editor",
    "revoke_policy_editor",
  ]) {
    assert.ok(
      adminActions.some((event) => event.action === action),
      action
    );
  }
});
