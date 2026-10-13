// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertion helpers are invoked only from tests.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import { MANUAL_POLICY_ENTRIES } from "@/content/policy-intelligence/registry";
import {
  POLICY_ANALYZER_VERSION,
  POLICY_SOURCE_FIRST_SCHEMA,
  POLICY_VERIFIER_VERSION,
} from "./contracts";
import {
  compatibilityEntryToHumanContent,
  compatibilityImportIdempotencyKey,
} from "./compatibility-entry";
import { importCompatibilityEntry } from "./compatibility-import";
import {
  attributionImpersonatesOfficialAuthority,
  type PolicyAnalysis,
  type PolicyVerification,
  policyHumanRevisionContentSchema,
} from "./contracts";

/**
 * Phase 12 Stage 3 PostgreSQL integration coverage.
 *
 * Destructive work runs ONLY against the isolated disposable database created
 * by `scripts/phase12-stage1-test-db.ts` (identified by name), and the test
 * refuses to touch any other database. Without `PHASE12_TEST_DATABASE_URL` the
 * whole file is skipped with an explicit reason — never reported as passed.
 *
 * Run with:
 *   PHASE12_TEST_DATABASE_URL=… pnpm run test:phase12:stage3:integration
 */

const TEST_DATABASE_URL = process.env.PHASE12_TEST_DATABASE_URL?.trim() ?? "";
const skipReason = TEST_DATABASE_URL
  ? false
  : "PHASE12_TEST_DATABASE_URL is not configured (isolated test database required)";

const EXPECTED_DATABASE = "immigration_ai_phase12_stage1_test";

function assertIsolatedTarget(url: string) {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//u, "");
  assert.equal(
    database,
    EXPECTED_DATABASE,
    "refusing to run destructive Stage 3 integration work against a non-isolated database"
  );
}

const RUN = randomUUID().slice(0, 8);
const SOURCE = `it-stage3-${RUN}`;
const SLUG_PREFIX = `it-stage3-${RUN}`;
const USER_EMAILS = {
  admin: `it3-admin-${RUN}@example.test`,
  adminUnverified: `it3-admin-unverified-${RUN}@example.test`,
  editor: `it3-editor-${RUN}@example.test`,
  editorTwo: `it3-editor-two-${RUN}@example.test`,
  other: `it3-other-${RUN}@example.test`,
  never: `it3-never-${RUN}@example.test`,
  unverified: `it3-unverified-${RUN}@example.test`,
  customer: `it3-customer-${RUN}@example.test`,
};

type Fixtures = {
  adminId: string;
  unverifiedAdminId: string;
  editorId: string;
  editorTwoId: string;
  otherId: string;
  neverId: string;
  unverifiedId: string;
  customerId: string;
};

async function seed(sql: ReturnType<typeof postgres>): Promise<Fixtures> {
  const insertUser = async (email: string, role: string, verified = true) => {
    const [row] = await sql<{ id: string }[]>`
      insert into "User" ("email", "password", "role", "emailVerifiedAt")
      values (${email}, ${"x".repeat(64)}, ${role}, ${verified ? sql`now()` : null})
      returning "id"
    `;
    return row.id;
  };
  const adminId = await insertUser(USER_EMAILS.admin, "admin");
  // An administrator whose identity is not verified: never has authority.
  const unverifiedAdminId = await insertUser(
    USER_EMAILS.adminUnverified,
    "admin",
    false
  );
  const editorId = await insertUser(USER_EMAILS.editor, "lawyer");
  const editorTwoId = await insertUser(USER_EMAILS.editorTwo, "lawyer");
  const otherId = await insertUser(USER_EMAILS.other, "lawyer");
  // A verified lawyer who is never granted the Policy Editor capability: the
  // R3 revoke regression target.
  const neverId = await insertUser(USER_EMAILS.never, "lawyer");
  const unverifiedId = await insertUser(
    USER_EMAILS.unverified,
    "lawyer",
    false
  );
  const customerId = await insertUser(USER_EMAILS.customer, "user");
  await sql`
    insert into "PolicyEditorGrant" ("userId", "grantedByUserId", "grantedAt")
    values (${editorId}, ${adminId}, now()), (${editorTwoId}, ${adminId}, now())
  `;
  // Improperly assigned grants that must never confer publication authority.
  await sql`
    insert into "PolicyEditorGrant" ("userId", "grantedByUserId", "grantedAt")
    values (${unverifiedId}, ${adminId}, now()), (${customerId}, ${adminId}, now())
  `;
  return {
    adminId,
    unverifiedAdminId,
    editorId,
    editorTwoId,
    otherId,
    neverId,
    unverifiedId,
    customerId,
  };
}

async function cleanup(sql: ReturnType<typeof postgres>, fixtures: Fixtures) {
  const userIds = [
    fixtures.adminId,
    fixtures.unverifiedAdminId,
    fixtures.editorId,
    fixtures.editorTwoId,
    fixtures.otherId,
    fixtures.neverId,
    fixtures.unverifiedId,
    fixtures.customerId,
  ];
  const itemIds = (
    await sql<{ id: string }[]>`
      select "id" from "PolicyIntelligenceItem"
      where "primarySourceConfigId" = ${SOURCE}
         or "slug" like ${`${SLUG_PREFIX}%`}
         or "createdByUserId" = any(${sql.array(userIds)}::uuid[])
    `
  ).map((row) => row.id);
  // Editorial events reference items and revisions, so they are removed first.
  if (itemIds.length) {
    await sql`
      delete from "PolicyIntelligenceEditorialEvent"
      where "itemId" = any(${sql.array(itemIds)}::uuid[])
    `;
  }
  await sql`
    delete from "PolicyIntelligenceEditorialEvent"
    where "actorUserId" = any(${sql.array(userIds)}::uuid[])
  `;
  if (itemIds.length) {
    await sql`
      delete from "PolicyIntelligenceDraftSnapshot"
      where "itemId" = any(${sql.array(itemIds)}::uuid[])
    `;
    await sql`
      delete from "PolicyIntelligenceAnalysisRevision"
      where "itemId" = any(${sql.array(itemIds)}::uuid[]) and "baseRevisionId" is not null
    `;
    await sql`
      delete from "PolicyIntelligenceAnalysisRevision"
      where "itemId" = any(${sql.array(itemIds)}::uuid[])
    `;
    await sql`
      delete from "PolicyIntelligenceSourceSnapshot"
      where "itemId" = any(${sql.array(itemIds)}::uuid[])
    `;
    await sql`
      delete from "ConversationPolicyBinding"
      where "policyItemId" = any(${sql.array(itemIds)}::text[])
    `;
    await sql`
      delete from "PolicyIntelligenceItem"
      where "id" = any(${sql.array(itemIds)}::uuid[])
    `;
  }
  await sql`delete from "PolicyIntelligenceOperatorSubmission" where "submittedByUserId" = any(${sql.array(userIds)}::uuid[])`;
  await sql`delete from "PolicyEditorGrant" where "userId" = any(${sql.array(userIds)}::uuid[])`;
  await sql`delete from "PolicyIntelligenceSyncRun" where "sourceConfigId" = ${SOURCE}`;
  await sql`delete from "PolicyIntelligenceSyncRun" where "sourceConfigId" = ${"operator-submitted-official-url"}`;
  await sql`delete from "ConversationPolicyBinding" where "userId" = any(${sql.array(userIds)}::uuid[])`;
  await sql`delete from "User" where "id" = any(${sql.array(userIds)}::uuid[])`;
}

type SyncCandidate = {
  candidateId: string;
  canonicalUrl: string;
};

function candidateFor(canonicalUrl: string): SyncCandidate & {
  schemaVersion: "policy-intelligence.discovery-candidate.v1";
  sourceConfigId: string;
  authority: string;
  retrievedAt: string;
  contentType: string;
  contentHash: string;
  discoveryStrategy: "listing_links";
  sourceMetadata: {
    httpStatus: number;
    redirectChain: string[];
    urlProvenance: "fetched_page";
  };
} {
  return {
    schemaVersion: "policy-intelligence.discovery-candidate.v1",
    candidateId: `it-candidate-${canonicalUrl.slice(-24)}`,
    sourceConfigId: SOURCE,
    authority: "Department of Home Affairs",
    canonicalUrl,
    retrievedAt: "2026-10-02T00:00:00.000Z",
    contentType: "text/html",
    contentHash: `hash-${canonicalUrl.length}`,
    discoveryStrategy: "listing_links",
    sourceMetadata: {
      httpStatus: 200,
      redirectChain: [],
      urlProvenance: "fetched_page",
    },
  };
}

function acquisitionFor(canonicalUrl: string, evidence: string, hash: string) {
  return {
    sourceConfigId: SOURCE,
    sourceId: `it-source-${canonicalUrl.length}`,
    authority: "Department of Home Affairs",
    canonicalUrl,
    officialTitle: `IT Stage 3 official page ${canonicalUrl.slice(-6)}`,
    retrievedAt: "2026-10-02T00:00:00.000Z",
    contentType: "text/html",
    httpStatus: 200,
    etag: null,
    lastModified: null,
    sourceDate: "2026-10-01",
    effectiveDate: null,
    evidenceTruncated: false,
    normalizedEvidence: evidence,
    contentHash: hash,
    sourceMetadata: {
      requestedUrl: canonicalUrl,
      finalUrl: canonicalUrl,
      redirectChain: [],
      bytesReceived: evidence.length,
      evidenceTruncated: false,
    },
  };
}

function analysisFor(
  evidenceRef: string,
  classification: "policy_relevant" | "unrelated"
): PolicyAnalysis {
  const text = {
    "zh-CN": "集成测试分析文本。",
    en: "Integration test analysis text.",
  };
  const linked = { ...text, claimRefs: ["claim-1"], uncertainty: null };
  const unit = (
    id: string,
    kind: "source_fact" | "practical_interpretation" = "source_fact"
  ) => ({ id, kind, text: linked, evidenceRefs: [evidenceRef] });
  return {
    schemaVersion: "policy-intelligence.analysis.v2" as const,
    publicationEligibility: {
      id: "policy-relevance",
      classification,
      evidenceRefs: [evidenceRef],
    },
    title: unit("title"),
    executiveSummary: unit("summary"),
    keyChanges: [unit("change-1")],
    affectedGroups: [unit("group-1")],
    practicalImpacts: [unit("impact-1", "practical_interpretation")],
    recommendedActions: [unit("action-1", "practical_interpretation")],
    transitionInfo: null,
    uncertainties: [unit("uncertainty-1", "practical_interpretation")],
    relatedSnapshotRefs: [],
    sourceStatus: {
      id: "source-status" as const,
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

function verificationFor(
  evidenceRef: string,
  unitIds: string[],
  publicationVerdict: "supported" | "unsupported"
): PolicyVerification {
  return {
    schemaVersion: "policy-intelligence.verification.v2" as const,
    assessments: unitIds.map((unitId) => ({
      unitId,
      verdict:
        unitId === "policy-relevance"
          ? publicationVerdict
          : ("supported" as const),
      evidenceRefs: [evidenceRef],
      reasonCode:
        unitId === "policy-relevance" && publicationVerdict === "unsupported"
          ? ("contradicted" as const)
          : ("direct_support" as const),
    })),
  };
}

const ANALYSIS_UNIT_IDS = [
  "policy-relevance",
  "title",
  "summary",
  "change-1",
  "group-1",
  "impact-1",
  "action-1",
  "uncertainty-1",
  "source-status",
  "claim-1",
];

test(
  "Stage 3: automatic publication, held-source stability, lawyer force publish, manual authoring, coexistence and audit",
  { skip: skipReason },
  async () => {
    assertIsolatedTarget(TEST_DATABASE_URL);
    process.env.POSTGRES_URL = TEST_DATABASE_URL;
    const sql = postgres(TEST_DATABASE_URL, {
      max: 4,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
    });
    let fixtures: Fixtures | null = null;
    try {
      const [
        { policyIntelligenceRepository },
        { runPolicyIntelligenceSync, createPolicyModelMetadata },
        { policyEditorialRepository },
        { createPolicyEditorialService },
        {
          getPublishedPolicyIntelligenceList,
          getPublishedPolicyIntelligenceHistory,
        },
        { conversationPolicyBindingDraft },
        { operatorSubmissionRepository },
        { createOperatorSubmissionService },
      ] = await Promise.all([
        import("./repository"),
        import("./pipeline"),
        import("./editorial-repository"),
        import("./editorial-service"),
        import("./read-service"),
        import("./conversation-policy-binding"),
        import("./operator-submission-repository"),
        import("./operator-submission"),
      ]);
      const operatorSubmissionService = createOperatorSubmissionService(
        operatorSubmissionRepository
      );

      // Schema identity: the Stage 3 tables/columns exist in this database.
      const [{ present }] = await sql<{ present: boolean }[]>`
        select
          to_regclass('public."PolicyEditorGrant"') is not null
          and to_regclass('public."PolicyIntelligenceEditorialEvent"') is not null
          and to_regclass('public."PolicyIntelligenceOperatorSubmission"') is not null
          and exists (
            select 1 from information_schema.columns
            where table_name = 'PolicyIntelligenceAnalysisRevision'
              and column_name = 'humanContent'
          ) as present
      `;
      assert.equal(present, true);

      fixtures = await seed(sql);
      const {
        adminId,
        unverifiedAdminId,
        editorId,
        editorTwoId,
        otherId,
        neverId,
        unverifiedId,
        customerId,
      } = fixtures;

      const urlA = `https://immi.homeaffairs.gov.au/it/${RUN}/policy-a`;
      const syncDependencies = (options: {
        analysisClassification: "policy_relevant" | "unrelated";
        publicationVerdict: "supported" | "unsupported";
        evidence: string;
        hash: string;
      }) => ({
        repository: policyIntelligenceRepository,
        discover: () => Promise.resolve([candidateFor(urlA)]),
        acquire: () =>
          Promise.resolve(acquisitionFor(urlA, options.evidence, options.hash)),
        analyzer: {
          analyze({
            evidence,
          }: {
            evidence: readonly { evidenceRef: string }[];
          }) {
            return analysisFor(
              evidence[0].evidenceRef,
              options.analysisClassification
            );
          },
        },
        verifier: {
          verify({
            evidence,
          }: {
            evidence: readonly { evidenceRef: string }[];
          }) {
            return verificationFor(
              evidence[0].evidenceRef,
              ANALYSIS_UNIT_IDS,
              options.publicationVerdict
            );
          },
        },
        modelMetadata: createPolicyModelMetadata({
          provider: "fixture" as const,
          model: "stage3-integration-fixture",
          reasoningEffort: "none",
          timeoutMs: 0,
          maxOutputTokens: 0,
        }),
        mode: "fixture" as const,
        now: () => "2026-10-02T00:00:00.000Z",
      });

      // --- Phase A: the automatic pathway still publishes -------------------
      const firstRun = await runPolicyIntelligenceSync(
        syncDependencies({
          analysisClassification: "policy_relevant",
          publicationVerdict: "supported",
          evidence: "V3 official evidence text",
          hash: "hash-v3",
        }),
        SOURCE
      );
      assert.equal(firstRun.run.publishedCount, 1);
      const listV3 = await getPublishedPolicyIntelligenceList();
      const recordV3 = listV3.find(
        (record) => record.source.officialUrl === urlA
      );
      assert.ok(recordV3);
      assert.equal(recordV3.provenance, "automated_verified");
      assert.equal(recordV3.newerSourcePendingReview, false);

      // --- Phase B: a newer captured source that is held must not remove the
      // published revision ---------------------------------------------------
      const secondRun = await runPolicyIntelligenceSync(
        syncDependencies({
          analysisClassification: "unrelated",
          publicationVerdict: "unsupported",
          evidence: "V4 official evidence text with changed wording",
          hash: "hash-v4",
        }),
        SOURCE
      );
      assert.equal(secondRun.run.heldCount, 1);
      assert.equal(secondRun.run.publishedCount, 0);

      const listWhileHeld = await getPublishedPolicyIntelligenceList();
      const recordWhileHeld = listWhileHeld.find(
        (record) => record.source.officialUrl === urlA
      );
      assert.ok(recordWhileHeld);
      assert.equal(recordWhileHeld.provenance, "automated_verified");
      assert.equal(recordWhileHeld.newerSourcePendingReview, true);
      assert.equal(recordWhileHeld.revision.id, recordV3.revision.id);

      const [heldRow] = await sql<
        { held_id: string; revision_number: number }[]
      >`
        select "id" as held_id, "revisionNumber" as revision_number
        from "PolicyIntelligenceAnalysisRevision"
        where "editorialStatus" = 'review_required'
          and "itemId" = (
            select "id" from "PolicyIntelligenceItem"
            where "canonicalOfficialUrl" = ${urlA}
          )
      `;
      assert.ok(heldRow);
      assert.equal(heldRow.revision_number, 2);

      // Simulate an AI artifact that can no longer be re-read (verifier
      // unavailable / corrupted record): the lawyer must still publish.
      await sql`
        update "PolicyIntelligenceAnalysisRevision"
        set "verification" = '"not-a-verification-object"'::json
        where "id" = ${heldRow.held_id}
      `;

      // --- Phase C: authorized lawyer force publish -------------------------
      const editorialService = createPolicyEditorialService(
        policyEditorialRepository
      );
      assert.equal(await editorialService.canEdit(editorId), true);
      assert.equal(await editorialService.canEdit(otherId), false);

      const [itemRow] = await sql<{ item_id: string }[]>`
        select "id" as item_id from "PolicyIntelligenceItem"
        where "canonicalOfficialUrl" = ${urlA}
      `;
      const overrideContent = {
        schemaVersion: "policy-intelligence.human-revision.v1" as const,
        title: {
          "zh-CN": "律师修订后的政策说明",
          en: "Lawyer-revised policy explanation",
        },
        overview: { "zh-CN": "经修订的概述", en: "Revised overview" },
        keyChanges: [],
        affectedGroups: [],
        implications: [],
        recommendedActions: [],
        body: null,
        commentary: {
          "zh-CN": "该来源与移民政策直接相关。",
          en: "This source is directly relevant to migration policy.",
        },
        attribution: "测试授权律师",
        sourceStatus: "in_force" as const,
        sourceReferences: [
          {
            authority: "Department of Home Affairs",
            title: "Official page",
            url: urlA,
            date: "2026-10-01",
            citation: null,
          },
        ],
      };
      const forced = await editorialService.forcePublishOverride({
        actorUserId: editorId,
        itemId: itemRow.item_id,
        baseRevisionId: heldRow.held_id,
        expectedBaseRevisionNumber: 2,
        expectedPublishedRevisionId: recordV3.revision.id,
        overrideReason: "AI relevance verdict is wrong for this source",
        content: overrideContent,
        idempotencyKey: `force-${RUN}-1`,
      });
      assert.equal(forced.status, "ok");
      if (forced.status !== "ok") {
        return;
      }
      const forceRetry = await editorialService.forcePublishOverride({
        actorUserId: editorId,
        itemId: itemRow.item_id,
        baseRevisionId: heldRow.held_id,
        expectedBaseRevisionNumber: 2,
        expectedPublishedRevisionId: recordV3.revision.id,
        overrideReason: "AI relevance verdict is wrong for this source",
        content: overrideContent,
        idempotencyKey: `force-${RUN}-1`,
      });
      assert.equal(forceRetry.status, "ok");
      if (forceRetry.status === "ok") {
        assert.equal(forceRetry.value.revisionId, forced.value.revisionId);
      }
      const [forceAudit] = await sql<{ count: string }[]>`
        select count(*)::text as count
        from "PolicyIntelligenceEditorialEvent"
        where "action" = 'force_publish_revision'
          and "revisionId" = ${forced.value.revisionId}
      `;
      assert.equal(forceAudit.count, "1");

      const postOverrideList = await getPublishedPolicyIntelligenceList();
      const overrideRecord = postOverrideList.find(
        (record) => record.source.officialUrl === urlA
      );
      assert.ok(overrideRecord);
      assert.equal(overrideRecord.provenance, "lawyer_override");
      assert.equal(overrideRecord.sourceStatus, "in_force");
      assert.equal(overrideRecord.newerSourcePendingReview, false);
      assert.equal(overrideRecord.humanContent?.attribution, "测试授权律师");
      assert.equal(overrideRecord.analysis, null);

      const history = await getPublishedPolicyIntelligenceHistory(
        overrideRecord.slug
      );
      assert.ok(history);
      assert.equal(history.revisions.length, 2);
      assert.equal(history.revisions[0].editorialStatus, "published");
      assert.equal(history.revisions[0].record.provenance, "lawyer_override");
      assert.equal(history.revisions[1].editorialStatus, "superseded");
      assert.equal(
        history.revisions[1].record.provenance,
        "automated_verified"
      );

      // --- Phase D: fully manual, LLM-free authoring ------------------------
      const manualSlug = `${SLUG_PREFIX}-commentary`;
      const manualContent = {
        schemaVersion: "policy-intelligence.human-revision.v1" as const,
        title: {
          "zh-CN": "授权律师对近期变化的专业评论",
          en: "Authorized lawyer commentary on recent changes",
        },
        overview: {
          "zh-CN": "这是律师撰写的分析概述，没有官方来源链接。",
          en: "This is a lawyer-authored analysis overview with no official source link.",
        },
        keyChanges: [
          {
            id: "change-1",
            text: {
              "zh-CN": "审理实践中的可观察变化",
              en: "An observable change in decision practice",
            },
          },
        ],
        affectedGroups: [],
        implications: [
          {
            id: "implication-1",
            text: {
              "zh-CN": "申请人应更早准备材料",
              en: "Applicants should prepare documents earlier",
            },
          },
        ],
        recommendedActions: [],
        body: {
          "zh-CN": "详细正文内容。",
          en: "Detailed body content.",
        },
        commentary: null,
        attribution: "授权律师团队",
        sourceStatus: "published_guidance" as const,
        sourceReferences: [],
      };
      const draft = await editorialService.createManualDraft({
        actorUserId: editorId,
        slug: manualSlug,
        content: manualContent,
        idempotencyKey: `draft-${RUN}-1`,
      });
      assert.equal(draft.status, "ok");
      if (draft.status !== "ok") {
        return;
      }
      const listWithDraft = await getPublishedPolicyIntelligenceList();
      assert.equal(
        listWithDraft.some((record) => record.slug === manualSlug),
        false,
        "an unpublished draft must never appear in the public projection"
      );

      const publishDraft = await editorialService.publishManualRevision({
        actorUserId: editorId,
        itemId: draft.value.itemId,
        revisionId: draft.value.revisionId,
        expectedContentVersion: draft.value.contentVersion,
        idempotencyKey: `publish-${RUN}-1`,
      });
      assert.equal(publishDraft.status, "ok");

      const listWithManual = await getPublishedPolicyIntelligenceList();
      const manualRecord = listWithManual.find(
        (record) => record.slug === manualSlug
      );
      assert.ok(manualRecord);
      assert.equal(manualRecord.provenance, "lawyer_authored");
      assert.equal(manualRecord.origin, "manual");
      assert.equal(manualRecord.source.officialUrl, null);
      assert.equal(manualRecord.source.officialTitle, null);
      assert.equal(manualRecord.publicAttribution, "授权律师团队");
      assert.equal(manualRecord.newerSourcePendingReview, false);

      // Stage 2 continuity: the published manual policy produces a durable
      // topic binding draft (with an honest "no official source" state).
      const { projectLivePolicy } = await import(
        "../policy-intelligence-product"
      );
      const manualProduct = projectLivePolicy(manualRecord);
      const bindingDraft = conversationPolicyBindingDraft({
        policy: manualProduct,
        launchId: `launch-${RUN}-1`,
      });
      assert.ok(bindingDraft);
      assert.equal(bindingDraft.policyOrigin, "manual");
      assert.equal(bindingDraft.officialUrl, "");
      assert.equal(bindingDraft.policyRevisionNumber, 1);
      const automatedProduct = projectLivePolicy(overrideRecord);
      const automatedBindingDraft = conversationPolicyBindingDraft({
        policy: automatedProduct,
        launchId: `launch-${RUN}-2`,
      });
      assert.ok(automatedBindingDraft);
      assert.equal(automatedBindingDraft.officialUrl, urlA);

      // --- Phase E: automatic synchronization cannot erase human work -------
      const unchangedRun = await runPolicyIntelligenceSync(
        syncDependencies({
          analysisClassification: "unrelated",
          publicationVerdict: "unsupported",
          evidence: "V4 official evidence text with changed wording",
          hash: "hash-v4",
        }),
        SOURCE
      );
      assert.equal(unchangedRun.run.unchangedCount, 1);
      assert.equal(unchangedRun.run.publishedCount, 0);
      assert.equal(unchangedRun.run.heldCount, 0);

      const [manualAfterSync] = await sql<
        { editorial_status: string; published_revision: string | null }[]
      >`
        select "editorialStatus" as editorial_status,
               "latestPublishedRevisionId" as published_revision
        from "PolicyIntelligenceItem"
        where "slug" = ${manualSlug}
      `;
      assert.equal(manualAfterSync.editorial_status, "published");
      assert.equal(manualAfterSync.published_revision, draft.value.revisionId);
      const listAfterSync = await getPublishedPolicyIntelligenceList();
      const manualAfterSyncRecord = listAfterSync.find(
        (record) => record.slug === manualSlug
      );
      assert.ok(manualAfterSyncRecord);
      assert.deepEqual(
        manualAfterSyncRecord.humanContent,
        manualRecord.humanContent
      );
      const overrideAfterSync = listAfterSync.find(
        (record) => record.source.officialUrl === urlA
      );
      assert.ok(overrideAfterSync);
      assert.equal(overrideAfterSync.provenance, "lawyer_override");

      // --- Phase F: concurrency and stale-write protection ------------------
      const revisionDraft = await editorialService.createManualRevision({
        actorUserId: editorId,
        itemId: draft.value.itemId,
      });
      assert.equal(revisionDraft.status, "ok");
      if (revisionDraft.status !== "ok") {
        return;
      }
      const staleDraft = await editorialService.saveManualDraft({
        actorUserId: editorId,
        itemId: draft.value.itemId,
        revisionId: revisionDraft.value.revisionId,
        content: { ...manualContent, body: null },
        expectedContentVersion: "f".repeat(64),
      });
      assert.equal(staleDraft.status, "error");
      if (staleDraft.status === "error") {
        assert.equal(staleDraft.code, "stale_draft_conflict");
      }
      // Editing a published revision is not a draft edit at all.
      const publishedEdit = await editorialService.saveManualDraft({
        actorUserId: editorId,
        itemId: draft.value.itemId,
        revisionId: draft.value.revisionId,
        content: manualContent,
        expectedContentVersion: draft.value.contentVersion,
      });
      assert.equal(publishedEdit.status, "error");
      if (publishedEdit.status === "error") {
        assert.equal(publishedEdit.code, "not_a_draft");
      }
      const staleOverride = await editorialService.forcePublishOverride({
        actorUserId: editorId,
        itemId: itemRow.item_id,
        baseRevisionId: heldRow.held_id,
        expectedBaseRevisionNumber: 1,
        expectedPublishedRevisionId: null,
        overrideReason: "stale attempt",
        content: overrideContent,
      });
      assert.equal(staleOverride.status, "error");
      if (staleOverride.status === "error") {
        assert.equal(staleOverride.code, "stale_base_revision_conflict");
      }

      // --- Phase G: archive and restore -------------------------------------
      const archived = await editorialService.archiveItem({
        actorUserId: editorId,
        itemId: draft.value.itemId,
        reason: "Temporarily withdrawn for review",
      });
      assert.equal(archived.status, "ok");
      const listAfterArchive = await getPublishedPolicyIntelligenceList();
      assert.equal(
        listAfterArchive.some((record) => record.slug === manualSlug),
        false
      );
      const restored = await editorialService.restoreItem({
        actorUserId: editorId,
        itemId: draft.value.itemId,
      });
      assert.equal(restored.status, "ok");
      if (restored.status === "ok") {
        assert.equal(restored.value.editorialStatus, "published");
      }
      const listAfterRestore = await getPublishedPolicyIntelligenceList();
      assert.equal(
        listAfterRestore.some((record) => record.slug === manualSlug),
        true
      );

      // --- Phase H: durable audit trail -------------------------------------
      const auditRows = await sql<
        { action: string; actor_id: string; created_at: Date }[]
      >`
        select "action", "actorUserId" as actor_id, "createdAt" as created_at
        from "PolicyIntelligenceEditorialEvent"
        where "itemId" in (${itemRow.item_id}, ${draft.value.itemId})
        order by "createdAt" asc
      `;
      const actions = auditRows.map((row) => row.action);
      for (const expectedAction of [
        "force_publish_revision",
        "create_manual_policy",
        "publish_manual_policy",
        "archive_policy_item",
        "restore_policy_item",
      ]) {
        assert.ok(actions.includes(expectedAction), expectedAction);
      }
      for (const row of auditRows) {
        assert.equal(row.actor_id, editorId);
        assert.ok(row.created_at instanceof Date);
      }
      // Capability changes are administrator-only and audited as well.
      const granted = await editorialService.grantPolicyEditor({
        actorUserId: adminId,
        email: USER_EMAILS.other,
      });
      assert.equal(granted.status, "ok");
      assert.equal(await editorialService.canEdit(otherId), true);
      const revoked = await editorialService.revokePolicyEditor({
        actorUserId: adminId,
        email: USER_EMAILS.other,
      });
      assert.equal(revoked.status, "ok");
      assert.equal(await editorialService.canEdit(otherId), false);
      const deniedGrant = await editorialService.grantPolicyEditor({
        actorUserId: otherId,
        email: USER_EMAILS.admin,
      });
      assert.equal(deniedGrant.status, "error");
      if (deniedGrant.status === "error") {
        assert.equal(deniedGrant.code, "admin_required");
      }
      const [capabilityAudit] = await sql<{ count: string }[]>`
        select count(*)::text as count
        from "PolicyIntelligenceEditorialEvent"
        where "action" in ('grant_policy_editor', 'revoke_policy_editor')
          and "actorUserId" = ${adminId}
      `;
      assert.equal(capabilityAudit.count, "2");

      // --- Phase I: durable human-publication protection (R1) ---------------
      // The item currently publishes the lawyer revision from Phase C. A new
      // source version (V5) independently passes the automatic gate; it must be
      // captured and held instead of replacing the lawyer-approved revision.
      const [protectedItemRow] = await sql<{ publication_mode: string }[]>`
        select "publicationMode" as publication_mode
        from "PolicyIntelligenceItem" where "id" = ${itemRow.item_id}
      `;
      assert.equal(protectedItemRow.publication_mode, "human_protected");

      const v5Run = await runPolicyIntelligenceSync(
        syncDependencies({
          analysisClassification: "policy_relevant",
          publicationVerdict: "supported",
          evidence: "V5 official evidence text",
          hash: "hash-v5",
        }),
        SOURCE
      );
      assert.equal(v5Run.run.publishedCount, 0);
      assert.equal(v5Run.run.heldCount, 1);
      assert.equal(v5Run.outcomes[0].outcome, "held");
      assert.equal(
        v5Run.outcomes[0].reasonCode,
        "human_publication_protected",
        "the automated run must report the human-protection hold reason"
      );

      const listWhileProtected = await getPublishedPolicyIntelligenceList();
      const protectedRecord = listWhileProtected.find(
        (record) => record.source.officialUrl === urlA
      );
      assert.ok(protectedRecord);
      assert.equal(protectedRecord.provenance, "lawyer_override");
      assert.equal(
        protectedRecord.revision.id,
        forced.value.revisionId,
        "the lawyer-approved revision stays public"
      );
      assert.equal(protectedRecord.newerSourcePendingReview, true);

      const pendingRows = await sql<
        { id: string; revision_number: number; status: string }[]
      >`
        select "id", "revisionNumber" as revision_number,
               "editorialStatus" as status
        from "PolicyIntelligenceAnalysisRevision"
        where "itemId" = ${itemRow.item_id}
          and "editorialStatus" = 'review_required'
        order by "revisionNumber"
      `;
      assert.ok(pendingRows.length >= 1);
      const v5Revision = pendingRows.at(-1);
      assert.ok(v5Revision);
      assert.ok(v5Revision.revision_number > 3);
      const [stillPublished] = await sql<{ status: string }[]>`
        select "editorialStatus" as status
        from "PolicyIntelligenceAnalysisRevision"
        where "id" = ${forced.value.revisionId}
      `;
      assert.equal(stillPublished.status, "published");
      const [forceAuditAfterHold] = await sql<{ count: string }[]>`
        select count(*)::text as count
        from "PolicyIntelligenceEditorialEvent"
        where "action" = 'force_publish_revision'
          and "itemId" = ${itemRow.item_id}
      `;
      assert.equal(forceAuditAfterHold.count, "1");

      // --- Phase J: publish the newer revision, then release protection -----
      const publishNewer = await editorialService.forcePublishOverride({
        actorUserId: editorId,
        itemId: itemRow.item_id,
        baseRevisionId: v5Revision.id,
        expectedBaseRevisionNumber: v5Revision.revision_number,
        expectedPublishedRevisionId: forced.value.revisionId,
        overrideReason: "Reviewed the newer official source and republished",
        content: overrideContent,
        idempotencyKey: `force-${RUN}-2`,
      });
      assert.equal(publishNewer.status, "ok");
      if (publishNewer.status !== "ok") {
        return;
      }
      const afterNewerPublication = await getPublishedPolicyIntelligenceList();
      const newerRecord = afterNewerPublication.find(
        (record) => record.source.officialUrl === urlA
      );
      assert.ok(newerRecord);
      assert.equal(newerRecord.provenance, "lawyer_override");
      assert.equal(newerRecord.revision.id, publishNewer.value.revisionId);
      assert.equal(newerRecord.newerSourcePendingReview, false);

      // Only publication authority may release protection. Per D-070 the
      // verified Admin (principal lawyer) is allowed; an ordinary user and an
      // unverified lawyer are not.
      for (const actorUserId of [customerId, unverifiedId]) {
        const deniedRelease =
          await editorialService.releasePublicationProtection({
            actorUserId,
            itemId: itemRow.item_id,
          });
        assert.equal(deniedRelease.status, "error", actorUserId);
      }

      const released = await editorialService.releasePublicationProtection({
        actorUserId: editorId,
        itemId: itemRow.item_id,
        reason: "Automatic publication may resume",
      });
      assert.equal(released.status, "ok");
      if (released.status === "ok") {
        assert.equal(released.value.publicationMode, "automatic");
        assert.equal(released.value.changed, true);
      }
      const [releaseAudit] = await sql<{ count: string; mode: string }[]>`
        select count(*)::text as count,
               max("detail"->>'publicationModeAfter') as mode
        from "PolicyIntelligenceEditorialEvent"
        where "action" = 'release_publication_protection'
          and "itemId" = ${itemRow.item_id}
      `;
      assert.equal(releaseAudit.count, "1");
      assert.equal(releaseAudit.mode, "automatic");

      // With protection released, an eligible newer revision publishes
      // automatically again — proving the release restored normal behaviour.
      const v6Run = await runPolicyIntelligenceSync(
        syncDependencies({
          analysisClassification: "policy_relevant",
          publicationVerdict: "supported",
          evidence: "V6 official evidence text",
          hash: "hash-v6",
        }),
        SOURCE
      );
      assert.equal(v6Run.run.publishedCount, 1);
      assert.equal(v6Run.outcomes[0].outcome, "published");
      const afterReleaseList = await getPublishedPolicyIntelligenceList();
      const releasedRecord = afterReleaseList.find(
        (record) => record.source.officialUrl === urlA
      );
      assert.ok(releasedRecord);
      assert.equal(releasedRecord.provenance, "automated_verified");

      // --- Phase K: publication authority per D-070 -------------------------
      // A verified Admin is the firm's principal lawyer: inherent editorial
      // authority without any grant. Ordinary users and unverified identities
      // remain refused.
      const adminDraft = await editorialService.createManualDraft({
        actorUserId: adminId,
        content: overrideContent,
      });
      assert.equal(adminDraft.status, "ok");
      assert.equal(adminDraft.value.revisionNumber, 1);
      const [adminGrantRow] = await sql<{ count: string }[]>`
        select count(*)::text as count from "PolicyEditorGrant"
        where "userId" = ${adminId}
      `;
      assert.equal(
        adminGrantRow.count,
        "0",
        "the Admin needs no grant row for inherent authority"
      );
      const customerDraft = await editorialService.createManualDraft({
        actorUserId: customerId,
        content: overrideContent,
      });
      assert.equal(customerDraft.status, "error");
      if (customerDraft.status === "error") {
        assert.equal(customerDraft.code, "publication_authority_required");
      }
      const unverifiedDraft = await editorialService.createManualDraft({
        actorUserId: unverifiedId,
        content: overrideContent,
      });
      assert.equal(unverifiedDraft.status, "error");
      if (unverifiedDraft.status === "error") {
        assert.equal(unverifiedDraft.code, "identity_not_verified");
      }
      const unverifiedAdminDraft = await editorialService.createManualDraft({
        actorUserId: unverifiedAdminId,
        content: overrideContent,
      });
      assert.equal(unverifiedAdminDraft.status, "error");
      if (unverifiedAdminDraft.status === "error") {
        assert.equal(unverifiedAdminDraft.code, "identity_not_verified");
      }
      assert.equal(await editorialService.canEdit(adminId), true);
      assert.equal(await editorialService.canEdit(unverifiedAdminId), false);
      assert.equal(await editorialService.canEdit(customerId), false);
      assert.equal(await editorialService.isAdministrator(adminId), true);
      const adminSubmission = await operatorSubmissionService.submit({
        actorUserId: adminId,
        url: `https://immi.homeaffairs.gov.au/it/${RUN}/admin-official-url`,
      });
      assert.equal(adminSubmission.status, "ok");
      const adminListing = await operatorSubmissionService.list({
        actorUserId: adminId,
      });
      assert.equal(adminListing.status, "ok");

      // --- Phase L: manual authoring with dates, references and pagination --
      const datedSlug = `${SLUG_PREFIX}-dated`;
      const datedContent = {
        ...manualContent,
        title: {
          "zh-CN": "带日期的律师政策说明",
          en: "Lawyer policy briefing with dates",
        },
        attribution: "测试授权律师团队 / Test Authorized Legal Team",
        sourceStatus: "proposed" as const,
        sourceReferences: [
          {
            authority: "Department of Home Affairs",
            title: "Consultation paper",
            url: `https://immi.homeaffairs.gov.au/it/${RUN}/consultation`,
            date: "2026-09-05",
            citation: "Consultation paper 2026/3",
          },
          {
            authority: "Federal Register of Legislation",
            title: "Migration Amendment (Example) Regulations 2026",
            url: `https://www.legislation.gov.au/it/${RUN}/example`,
            date: "2026-09-10",
            citation: "F2026L00003",
          },
        ],
        officialSourceDate: "2026-09-05",
        // A proposed policy has no established commencement date: it stays null
        // rather than being inferred by the platform.
        commencementDate: null,
        reviewedAsOfDate: "2026-09-20",
      };
      const datedDraft = await editorialService.createManualDraft({
        actorUserId: editorId,
        slug: datedSlug,
        content: datedContent,
        idempotencyKey: `dated-create-${RUN}`,
      });
      assert.equal(datedDraft.status, "ok");
      if (datedDraft.status !== "ok") {
        return;
      }
      const [dateAudit] = await sql<{ detail: Record<string, unknown> }[]>`
        select "detail" from "PolicyIntelligenceEditorialEvent"
        where "action" = 'create_manual_policy'
          and "itemId" = ${datedDraft.value.itemId}
      `;
      assert.equal(dateAudit.detail.sourceReferenceCount, 2);
      assert.equal(dateAudit.detail.commencementDate, null);
      assert.equal(dateAudit.detail.officialSourceDate, "2026-09-05");
      assert.equal(dateAudit.detail.reviewedAsOfDate, "2026-09-20");

      // A retry of the create request after the draft was edited must resolve to
      // the same item instead of creating a duplicate.
      const editedSave = await editorialService.saveManualDraft({
        actorUserId: editorId,
        itemId: datedDraft.value.itemId,
        revisionId: datedDraft.value.revisionId,
        expectedContentVersion: datedDraft.value.contentVersion,
        content: {
          ...datedContent,
          title: { "zh-CN": "编辑后的标题", en: "Edited title" },
        },
      });
      assert.equal(editedSave.status, "ok");
      const createRetry = await editorialService.createManualDraft({
        actorUserId: editorId,
        slug: datedSlug,
        content: datedContent,
        idempotencyKey: `dated-create-${RUN}`,
      });
      assert.equal(createRetry.status, "ok");
      if (createRetry.status === "ok") {
        assert.equal(createRetry.value.itemId, datedDraft.value.itemId);
      }
      const [datedCount] = await sql<{ count: string }[]>`
        select count(*)::text as count from "PolicyIntelligenceItem"
        where "slug" = ${datedSlug}
      `;
      assert.equal(datedCount.count, "1");

      // The saved draft change is reconstructible from the durable audit row.
      const [saveAudit] = await sql<{ detail: Record<string, unknown> }[]>`
        select "detail" from "PolicyIntelligenceEditorialEvent"
        where "action" = 'save_manual_draft'
          and "itemId" = ${datedDraft.value.itemId}
      `;
      const changeSet = saveAudit.detail.changeSet as {
        changedFields: string[];
        scalarChanges: {
          field: string;
          before: string | null;
          after: string | null;
        }[];
      };
      assert.ok(changeSet.changedFields.includes("title"));
      const titleChange = changeSet.scalarChanges.find(
        (change) => change.field === "title"
      );
      assert.ok(titleChange);
      assert.match(titleChange.after ?? "", /编辑后的标题/);

      const datedPublish = await editorialService.publishManualRevision({
        actorUserId: editorId,
        itemId: datedDraft.value.itemId,
        revisionId: datedDraft.value.revisionId,
        expectedContentVersion:
          editedSave.status === "ok"
            ? editedSave.value.contentVersion
            : datedDraft.value.contentVersion,
      });
      assert.equal(datedPublish.status, "ok");
      const datedList = await getPublishedPolicyIntelligenceList();
      const datedRecord = datedList.find((record) => record.slug === datedSlug);
      assert.ok(datedRecord);
      assert.equal(
        datedRecord.editorialDates?.officialSourceDate,
        "2026-09-05"
      );
      assert.equal(datedRecord.editorialDates?.commencementDate, null);
      assert.equal(datedRecord.editorialDates?.reviewedAsOfDate, "2026-09-20");
      assert.equal(datedRecord.publicationMode, "human_protected");
      assert.equal(datedRecord.humanContent?.sourceReferences.length, 2);
      assert.equal(
        datedRecord.humanContent?.sourceReferences[1].citation,
        "F2026L00003"
      );

      // Workspace pagination keeps every item (including older ones) reachable.
      const firstWorkspacePage = await editorialService.listWorkspacePaginated({
        limit: 1,
      });
      assert.equal(firstWorkspacePage.items.length, 1);
      assert.equal(firstWorkspacePage.page.hasMore, true);
      assert.equal(firstWorkspacePage.page.nextOffset, 1);
      const secondWorkspacePage = await editorialService.listWorkspacePaginated(
        {
          limit: 1,
          offset: 1,
        }
      );
      assert.equal(secondWorkspacePage.items.length, 1);
      assert.notEqual(
        secondWorkspacePage.items[0].id,
        firstWorkspacePage.items[0].id
      );
      const wholeWorkspace = await editorialService.listWorkspacePaginated({
        limit: 200,
      });
      const workspaceIds = new Set(wholeWorkspace.items.map((item) => item.id));
      assert.equal(workspaceIds.has(datedDraft.value.itemId), true);
      assert.equal(workspaceIds.has(itemRow.item_id), true);

      // --- Phase M (R2): concurrent manual publication ----------------------
      // Published V1 → lawyer A creates draft A → lawyer B creates draft B →
      // B publishes V2 → A attempts to publish → 409 → V2 remains current.
      const concurrentSlug = `${SLUG_PREFIX}-concurrent`;
      const concurrentV1 = await editorialService.createManualDraft({
        actorUserId: editorId,
        slug: concurrentSlug,
        content: manualContent,
        idempotencyKey: `concurrent-create-${RUN}`,
      });
      assert.equal(concurrentV1.status, "ok");
      if (concurrentV1.status !== "ok") {
        return;
      }
      const concurrentPublishedV1 =
        await editorialService.publishManualRevision({
          actorUserId: editorId,
          itemId: concurrentV1.value.itemId,
          revisionId: concurrentV1.value.revisionId,
          expectedContentVersion: concurrentV1.value.contentVersion,
        });
      assert.equal(concurrentPublishedV1.status, "ok");

      const concurrentDraftA = await editorialService.createManualRevision({
        actorUserId: editorId,
        itemId: concurrentV1.value.itemId,
      });
      const concurrentDraftB = await editorialService.createManualRevision({
        actorUserId: editorTwoId,
        itemId: concurrentV1.value.itemId,
      });
      assert.equal(concurrentDraftA.status, "ok");
      assert.equal(concurrentDraftB.status, "ok");
      if (
        concurrentDraftA.status !== "ok" ||
        concurrentDraftB.status !== "ok"
      ) {
        return;
      }
      const [draftBaselineA] = await sql<{ base_revision_id: string | null }[]>`
        select "baseRevisionId" as base_revision_id
        from "PolicyIntelligenceAnalysisRevision"
        where "id" = ${concurrentDraftA.value.revisionId}
      `;
      assert.equal(
        draftBaselineA.base_revision_id,
        concurrentV1.value.revisionId,
        "the draft records the published revision it was based on"
      );

      const [draftBRow] = await sql<{ fingerprint: string }[]>`
        select "analysisFingerprint" as fingerprint
        from "PolicyIntelligenceAnalysisRevision"
        where "id" = ${concurrentDraftB.value.revisionId}
      `;
      const concurrentPublishedV2 =
        await editorialService.publishManualRevision({
          actorUserId: editorTwoId,
          itemId: concurrentV1.value.itemId,
          revisionId: concurrentDraftB.value.revisionId,
          expectedContentVersion: draftBRow.fingerprint,
        });
      assert.equal(concurrentPublishedV2.status, "ok");

      const [draftARow] = await sql<{ fingerprint: string }[]>`
        select "analysisFingerprint" as fingerprint
        from "PolicyIntelligenceAnalysisRevision"
        where "id" = ${concurrentDraftA.value.revisionId}
      `;
      const staleConcurrentPublish =
        await editorialService.publishManualRevision({
          actorUserId: editorId,
          itemId: concurrentV1.value.itemId,
          revisionId: concurrentDraftA.value.revisionId,
          expectedContentVersion: draftARow.fingerprint,
        });
      assert.equal(staleConcurrentPublish.status, "error");
      if (staleConcurrentPublish.status === "error") {
        assert.equal(staleConcurrentPublish.code, "stale_publication_conflict");
        assert.equal(
          staleConcurrentPublish.detail,
          "draft_baseline_superseded"
        );
      }
      const [concurrentItem] = await sql<
        { published_revision_id: string | null }[]
      >`
        select "latestPublishedRevisionId" as published_revision_id
        from "PolicyIntelligenceItem"
        where "id" = ${concurrentV1.value.itemId}
      `;
      assert.equal(
        concurrentItem.published_revision_id,
        concurrentDraftB.value.revisionId,
        "V2 remains the current publication"
      );
      const [draftAStatus] = await sql<{ status: string }[]>`
        select "editorialStatus" as status
        from "PolicyIntelligenceAnalysisRevision"
        where "id" = ${concurrentDraftA.value.revisionId}
      `;
      assert.equal(draftAStatus.status, "draft");

      // --- Phase N (R2): lossless draft history in PostgreSQL ---------------
      // Each localized field is contract-bounded at 8000 characters; both are
      // long enough that a truncated preview could never reconstruct them.
      const longBodyZh = "正文".repeat(1400);
      const longBodyEn = "body ".repeat(1500).trim();
      const historyDraft = await editorialService.createManualDraft({
        actorUserId: editorId,
        slug: `${SLUG_PREFIX}-history`,
        content: {
          ...manualContent,
          body: { "zh-CN": longBodyZh, en: longBodyEn },
          sourceReferences: [
            {
              authority: "Department of Home Affairs",
              title: "Original consultation",
              url: `https://immi.homeaffairs.gov.au/it/${RUN}/history-original`,
              date: "2026-09-01",
              citation: "F2026L00001",
            },
          ],
          keyChanges: [
            {
              id: "change-keep",
              text: { "zh-CN": "保留条目", en: "Kept entry" },
            },
            {
              id: "change-remove",
              text: { "zh-CN": "将被删除", en: "Removed entry" },
            },
          ],
        },
        idempotencyKey: `history-create-${RUN}`,
      });
      assert.equal(historyDraft.status, "ok", "history draft creation");
      if (historyDraft.status !== "ok") {
        return;
      }
      const historySave = await editorialService.saveManualDraft({
        actorUserId: editorId,
        itemId: historyDraft.value.itemId,
        revisionId: historyDraft.value.revisionId,
        expectedContentVersion: historyDraft.value.contentVersion,
        content: {
          ...manualContent,
          body: { "zh-CN": longBodyZh, en: longBodyEn },
          sourceReferences: [
            {
              authority: "Department of Home Affairs",
              title: "Original consultation",
              url: `https://immi.homeaffairs.gov.au/it/${RUN}/history-amended`,
              date: "2026-09-02",
              citation: "F2026L00009",
            },
          ],
          keyChanges: [
            {
              id: "change-keep",
              text: { "zh-CN": "保留条目", en: "Kept entry" },
            },
          ],
        },
      });
      assert.equal(historySave.status, "ok");
      if (historySave.status !== "ok") {
        return;
      }

      const [snapshotCount] = await sql<{ count: string }[]>`
        select count(*)::text as count
        from "PolicyIntelligenceDraftSnapshot"
        where "revisionId" = ${historyDraft.value.revisionId}
      `;
      assert.equal(snapshotCount.count, "2");
      const [firstSnapshot] = await sql<
        { content: Record<string, unknown>; digest: string }[]
      >`
        select "humanContent" as content, "contentDigest" as digest
        from "PolicyIntelligenceDraftSnapshot"
        where "revisionId" = ${historyDraft.value.revisionId}
          and "saveNumber" = 1
      `;
      const firstContent = firstSnapshot.content as {
        body: { en: string };
        keyChanges: { id: string }[];
        sourceReferences: { citation: string | null; url: string }[];
      };
      assert.equal(firstContent.body.en, longBodyEn);
      assert.equal(firstContent.sourceReferences[0].citation, "F2026L00001");
      assert.match(firstContent.sourceReferences[0].url, /history-original$/u);
      assert.equal(firstContent.keyChanges.length, 2);

      const draftHistoryResult = await editorialService.getDraftHistory({
        actorUserId: editorId,
        itemId: historyDraft.value.itemId,
        revisionId: historyDraft.value.revisionId,
      });
      assert.equal(draftHistoryResult.status, "ok");
      if (draftHistoryResult.status !== "ok") {
        return;
      }
      assert.equal(draftHistoryResult.value.snapshots.length, 2);
      assert.equal(
        draftHistoryResult.value.snapshots[0].humanContent?.body?.en,
        longBodyEn,
        "the previous complete document is recoverable after a later edit"
      );
      assert.equal(
        draftHistoryResult.value.snapshots[0].humanContent?.keyChanges[1].text
          .en,
        "Removed entry"
      );

      // A further save must not mutate earlier snapshots.
      const historySaveTwo = await editorialService.saveManualDraft({
        actorUserId: editorId,
        itemId: historyDraft.value.itemId,
        revisionId: historyDraft.value.revisionId,
        expectedContentVersion: historySave.value.contentVersion,
        content: {
          ...manualContent,
          body: { "zh-CN": longBodyZh, en: longBodyEn },
          sourceReferences: [],
          keyChanges: [],
        },
      });
      assert.equal(historySaveTwo.status, "ok");
      const [firstSnapshotAfter] = await sql<{ digest: string }[]>`
        select "contentDigest" as digest
        from "PolicyIntelligenceDraftSnapshot"
        where "revisionId" = ${historyDraft.value.revisionId}
          and "saveNumber" = 1
      `;
      assert.equal(firstSnapshotAfter.digest, firstSnapshot.digest);
      const historyAfter = await editorialService.getDraftHistory({
        actorUserId: editorId,
        itemId: historyDraft.value.itemId,
        revisionId: historyDraft.value.revisionId,
      });
      assert.equal(historyAfter.status, "ok");
      if (historyAfter.status === "ok") {
        assert.equal(historyAfter.value.snapshots.length, 3);
        assert.equal(historyAfter.value.snapshots.at(-1)?.saveNumber, 3);
        assert.equal(
          historyAfter.value.snapshots[0].humanContent?.body?.en,
          longBodyEn
        );
      }

      // --- Phase O (R2): protected-item HOLD consistency -------------------
      // The urlA item currently publishes automated V6. Force publish it to
      // protect the item, then let a *failing verification* run enter the
      // original saveHeldRevision path: the editor-approved publication must
      // stay public and the item must not be relabelled as unreviewed.
      const [v6Row] = await sql<{ id: string; revision_number: number }[]>`
        select "id", "revisionNumber" as revision_number
        from "PolicyIntelligenceAnalysisRevision"
        where "itemId" = ${itemRow.item_id}
          and "editorialStatus" = 'published'
      `;
      const protectOverride = await editorialService.forcePublishOverride({
        actorUserId: editorId,
        itemId: itemRow.item_id,
        baseRevisionId: v6Row.id,
        expectedBaseRevisionNumber: v6Row.revision_number,
        expectedPublishedRevisionId: v6Row.id,
        overrideReason: "Protect the reviewed publication before the next sync",
        content: overrideContent,
        idempotencyKey: `force-${RUN}-3`,
      });
      assert.equal(protectOverride.status, "ok");
      if (protectOverride.status !== "ok") {
        return;
      }

      const holdRun = await runPolicyIntelligenceSync(
        syncDependencies({
          analysisClassification: "unrelated",
          publicationVerdict: "unsupported",
          evidence: "V7 official evidence text",
          hash: "hash-v7",
        }),
        SOURCE
      );
      assert.equal(holdRun.run.publishedCount, 0);
      assert.equal(holdRun.run.heldCount, 1);
      assert.equal(holdRun.outcomes[0].outcome, "held");

      const [protectedAfterHold] = await sql<
        {
          status: string;
          publication_mode: string;
          published_revision_id: string | null;
        }[]
      >`
        select "editorialStatus" as status,
               "publicationMode" as publication_mode,
               "latestPublishedRevisionId" as published_revision_id
        from "PolicyIntelligenceItem"
        where "id" = ${itemRow.item_id}
      `;
      assert.equal(
        protectedAfterHold.status,
        "published",
        "a held AI analysis must not relabel an editor-approved publication"
      );
      assert.equal(protectedAfterHold.publication_mode, "human_protected");
      assert.equal(
        protectedAfterHold.published_revision_id,
        protectOverride.value.revisionId
      );
      const listAfterHold = await getPublishedPolicyIntelligenceList();
      const afterHoldRecord = listAfterHold.find(
        (record) => record.source.officialUrl === urlA
      );
      assert.ok(afterHoldRecord);
      assert.equal(
        afterHoldRecord.revision.id,
        protectOverride.value.revisionId
      );
      assert.equal(afterHoldRecord.provenance, "lawyer_override");
      assert.equal(afterHoldRecord.newerSourcePendingReview, true);

      const protectedDetail = await editorialService.getItemDetail(
        itemRow.item_id
      );
      assert.ok(protectedDetail);
      assert.equal(protectedDetail.publicationMode, "human_protected");
      assert.equal(protectedDetail.editorialStatus, "published");
      assert.ok(protectedDetail.heldAiRevision);
      assert.equal(
        protectedDetail.heldAiRevision.editorialStatus,
        "review_required"
      );

      // Archive/restore stay coherent for a protected item with a held revision.
      const archiveProtected = await editorialService.archiveItem({
        actorUserId: editorId,
        itemId: itemRow.item_id,
        reason: "R2 hold-consistency check",
      });
      assert.equal(archiveProtected.status, "ok");
      const hiddenWhileArchived = await getPublishedPolicyIntelligenceList();
      assert.equal(
        hiddenWhileArchived.some(
          (record) => record.source.officialUrl === urlA
        ),
        false
      );
      const restoreProtected = await editorialService.restoreItem({
        actorUserId: editorId,
        itemId: itemRow.item_id,
      });
      assert.equal(restoreProtected.status, "ok");
      if (restoreProtected.status === "ok") {
        assert.equal(restoreProtected.value.editorialStatus, "published");
      }
      const [afterRestore] = await sql<
        { status: string; publication_mode: string }[]
      >`
        select "editorialStatus" as status, "publicationMode" as publication_mode
        from "PolicyIntelligenceItem"
        where "id" = ${itemRow.item_id}
      `;
      assert.equal(afterRestore.status, "published");
      assert.equal(afterRestore.publication_mode, "human_protected");

      // Unprotected items keep the original hold behaviour: releasing protection
      // and running the failing sync moves the item to review_required while the
      // reviewed publication stays public.
      const releaseAfterHold =
        await editorialService.releasePublicationProtection({
          actorUserId: editorId,
          itemId: itemRow.item_id,
          reason: "R2 unprotected hold behaviour check",
        });
      assert.equal(releaseAfterHold.status, "ok");
      const unprotectedHoldRun = await runPolicyIntelligenceSync(
        syncDependencies({
          analysisClassification: "unrelated",
          publicationVerdict: "unsupported",
          evidence: "V8 official evidence text",
          hash: "hash-v8",
        }),
        SOURCE
      );
      assert.equal(unprotectedHoldRun.run.heldCount, 1);
      const [unprotectedAfterHold] = await sql<{ status: string }[]>`
        select "editorialStatus" as status
        from "PolicyIntelligenceItem"
        where "id" = ${itemRow.item_id}
      `;
      assert.equal(unprotectedAfterHold.status, "review_required");
      const listAfterUnprotectedHold =
        await getPublishedPolicyIntelligenceList();
      assert.ok(
        listAfterUnprotectedHold.some(
          (record) => record.source.officialUrl === urlA
        ),
        "the reviewed publication stays public while the newer source is held"
      );

      // --- Phase P (R2): concurrent creation is always controlled ----------
      const raceSlug = `${SLUG_PREFIX}-race`;
      const raceResults = await Promise.all([
        editorialService.createManualDraft({
          actorUserId: editorId,
          slug: raceSlug,
          content: manualContent,
          idempotencyKey: `race-a-${RUN}`,
        }),
        editorialService.createManualDraft({
          actorUserId: editorTwoId,
          slug: raceSlug,
          content: {
            ...manualContent,
            title: { "zh-CN": "并发创建标题", en: "Concurrent creation title" },
          },
          idempotencyKey: `race-b-${RUN}`,
        }),
      ]);
      for (const outcome of raceResults) {
        assert.equal(
          outcome.status,
          "ok",
          "a lost slug race must resolve to a controlled response, never an error"
        );
      }
      const [raceCount] = await sql<{ count: string }[]>`
        select count(*)::text as count from "PolicyIntelligenceItem"
        where "slug" like ${`${raceSlug}%`}
      `;
      assert.equal(raceCount.count, "2");

      // Two concurrent creates with identical content by the same author are the
      // same policy: they resolve to one durable item.
      const replaySlug = `${SLUG_PREFIX}-race-replay`;
      const replayRequest = () =>
        editorialService.createManualDraft({
          actorUserId: editorId,
          slug: replaySlug,
          content: manualContent,
          idempotencyKey: `race-same-${RUN}`,
        });
      const replayResults = await Promise.all([
        replayRequest(),
        replayRequest(),
      ]);
      assert.equal(
        replayResults.every((outcome) => outcome.status === "ok"),
        true
      );
      const replayItemIds = new Set(
        replayResults.map((outcome) =>
          outcome.status === "ok" ? outcome.value.itemId : "error"
        )
      );
      assert.equal(
        replayItemIds.size,
        1,
        "an identical create replay resolves to one item"
      );
      const [replayCount] = await sql<{ count: string }[]>`
        select count(*)::text as count from "PolicyIntelligenceItem"
        where "slug" like ${`${replaySlug}%`}
      `;
      assert.equal(replayCount.count, "1");

      // The underlying primitive is conflict-free even when the row already
      // exists: no uncaught unique violation, a controlled `slug_taken`.
      const primitive = await policyEditorialRepository.run(async (tx) => {
        const first = await tx.insertItemIfSlugAvailable({
          slug: `${SLUG_PREFIX}-primitive`,
          origin: "manual",
          editorialStatus: "draft",
          sourceStatus: "announced",
          createdByUserId: editorId,
        });
        const second = await tx.insertItemIfSlugAvailable({
          slug: `${SLUG_PREFIX}-primitive`,
          origin: "manual",
          editorialStatus: "draft",
          sourceStatus: "announced",
          createdByUserId: editorTwoId,
        });
        return { first: first.status, second: second.status };
      });
      assert.equal(primitive.first, "created");
      assert.equal(primitive.second, "slug_taken");

      // --- Phase Q (R3 P0): revoke can never grant --------------------------
      // A verified lawyer with no grant row at all: revoking must be a
      // documented no-op that creates nothing and leaves the account without
      // capability (the pre-R3 upsert created an *active* grant here).
      const neverRevoke = await editorialService.revokePolicyEditor({
        actorUserId: adminId,
        email: USER_EMAILS.never,
      });
      assert.equal(neverRevoke.status, "ok");
      if (neverRevoke.status === "ok") {
        assert.equal(neverRevoke.value.outcome, "not_granted");
      }
      const [neverGrantRows] = await sql<{ count: string }[]>`
        select count(*)::text as count from "PolicyEditorGrant"
        where "userId" = ${neverId}
      `;
      assert.equal(
        neverGrantRows.count,
        "0",
        "revoking a never-granted user must not create a grant row"
      );
      assert.equal(await editorialService.canEdit(neverId), false);
      const [neverRevokeAudit] = await sql<
        { actor_id: string; outcome: string }[]
      >`
        select "actorUserId" as actor_id, "detail" ->> 'outcome' as outcome
        from "PolicyIntelligenceEditorialEvent"
        where "action" = 'revoke_policy_editor'
          and "detail" ->> 'targetUserId' = ${neverId}
      `;
      assert.equal(neverRevokeAudit.actor_id, adminId);
      assert.equal(neverRevokeAudit.outcome, "not_granted");

      // Repeated revocation of an already-revoked grant is idempotent.
      const repeatedRevoke = await editorialService.revokePolicyEditor({
        actorUserId: adminId,
        email: USER_EMAILS.other,
      });
      assert.equal(repeatedRevoke.status, "ok");
      if (repeatedRevoke.status === "ok") {
        assert.equal(repeatedRevoke.value.outcome, "already_revoked");
      }
      assert.equal(await editorialService.canEdit(otherId), false);

      // An explicit re-grant reactivates, then a revoke deactivates for real.
      const reactivated = await editorialService.grantPolicyEditor({
        actorUserId: adminId,
        email: USER_EMAILS.other,
      });
      assert.equal(reactivated.status, "ok");
      if (reactivated.status === "ok") {
        assert.equal(reactivated.value.reactivated, true);
      }
      assert.equal(await editorialService.canEdit(otherId), true);
      const activeRevoke = await editorialService.revokePolicyEditor({
        actorUserId: adminId,
        email: USER_EMAILS.other,
      });
      assert.equal(activeRevoke.status, "ok");
      if (activeRevoke.status === "ok") {
        assert.equal(activeRevoke.value.outcome, "revoked");
      }
      assert.equal(await editorialService.canEdit(otherId), false);
      const [revokedRow] = await sql<
        { revoked_at: Date | null; revoked_by: string | null }[]
      >`
        select "revokedAt" as revoked_at, "revokedByUserId" as revoked_by
        from "PolicyEditorGrant"
        where "userId" = ${otherId}
      `;
      assert.ok(revokedRow.revoked_at instanceof Date);
      assert.equal(revokedRow.revoked_by, adminId);

      // Concurrent opposite intents must never throw, never lose the row, and
      // never leave a half-revoked state: the stored state reflects whichever
      // explicit admin action committed last.
      await Promise.all([
        editorialService.grantPolicyEditor({
          actorUserId: adminId,
          email: USER_EMAILS.other,
        }),
        editorialService.revokePolicyEditor({
          actorUserId: adminId,
          email: USER_EMAILS.other,
        }),
      ]);
      const [raceRow] = await sql<{ count: string }[]>`
        select count(*)::text as count
        from "PolicyEditorGrant"
        where "userId" = ${otherId}
      `;
      const [raceState] = await sql<
        { revoked_at: Date | null; revoked_by: string | null }[]
      >`
        select "revokedAt" as revoked_at, "revokedByUserId" as revoked_by
        from "PolicyEditorGrant"
        where "userId" = ${otherId}
        limit 1
      `;
      assert.equal(raceRow.count, "1");
      assert.equal(
        (raceState.revoked_at === null) === (raceState.revoked_by === null),
        true,
        "a grant row is either active or revoked, never half-written"
      );
      // Leave the fixture in a deterministic, deactivated state.
      await editorialService.revokePolicyEditor({
        actorUserId: adminId,
        email: USER_EMAILS.other,
      });
      assert.equal(await editorialService.canEdit(otherId), false);

      // --- Phase R (R3 P1): operator listing authorization -------------------
      // The authorized editor submits one official URL, then the same
      // authority contract must gate *reading* the queue.
      const r3Url = `https://immi.homeaffairs.gov.au/it-${RUN}/r3-listing`;
      const r3Submission = await operatorSubmissionService.submit({
        actorUserId: editorId,
        url: r3Url,
        note: "R3 listing authorization",
      });
      assert.equal(r3Submission.status, "ok");
      const allowedList = await operatorSubmissionService.list({
        actorUserId: editorId,
      });
      assert.equal(allowedList.status, "ok");
      if (allowedList.status === "ok") {
        assert.ok(
          allowedList.value.some((row) => row.submittedUrl === r3Url),
          "the authorized Policy Editor sees the operator queue"
        );
      }
      const listDenials: [string, string, string][] = [
        ["customer", customerId, "publication_authority_required"],
        ["unprivileged lawyer", otherId, "capability_required"],
        ["unverified lawyer", unverifiedId, "identity_not_verified"],
        [
          "unverified administrator",
          unverifiedAdminId,
          "identity_not_verified",
        ],
        ["never granted lawyer", neverId, "capability_required"],
      ];
      for (const [label, actor, expectedCode] of listDenials) {
        const denied = await operatorSubmissionService.list({
          actorUserId: actor,
        });
        assert.equal(denied.status, "error", label);
        if (denied.status === "error") {
          assert.equal(denied.code, expectedCode, label);
        }
      }
      // A revoked Policy Editor loses the workflow again (real revoked row).
      const regrantForListing = await editorialService.grantPolicyEditor({
        actorUserId: adminId,
        email: USER_EMAILS.other,
      });
      assert.equal(regrantForListing.status, "ok");
      const beforeRevokeList = await operatorSubmissionService.list({
        actorUserId: otherId,
      });
      assert.equal(beforeRevokeList.status, "ok");
      await editorialService.revokePolicyEditor({
        actorUserId: adminId,
        email: USER_EMAILS.other,
      });
      const afterRevokeList = await operatorSubmissionService.list({
        actorUserId: otherId,
      });
      assert.equal(afterRevokeList.status, "error");
      if (afterRevokeList.status === "error") {
        assert.equal(afterRevokeList.code, "capability_required");
      }
      // Denied reads never leaked rows or wrote privileged audit records.
      const [listingAudit] = await sql<{ count: string }[]>`
        select count(*)::text as count
        from "PolicyIntelligenceEditorialEvent"
        where "action" not in ('submit_official_url')
          and "actorUserId" = ${otherId}
          and "detail" ->> 'targetUserId' is null
      `;
      assert.equal(listingAudit.count, "0");
    } finally {
      try {
        if (fixtures) {
          await cleanup(sql, fixtures);
        }
      } finally {
        await sql.end({ timeout: 5 });
        // The lazy application database client must be closed as well, or an
        // idle pooled connection keeps the test process alive.
        const runtimeClient = await import("@/lib/db/runtime-client");
        await runtimeClient.closeLazyDatabase();
      }
    }
  }
);

test(
  "Stage 3: bundled compatibility entries import into durable drafts idempotently",
  { skip: skipReason },
  async () => {
    assertIsolatedTarget(TEST_DATABASE_URL);
    process.env.POSTGRES_URL = TEST_DATABASE_URL;
    const sql = postgres(TEST_DATABASE_URL, {
      max: 4,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
    });
    const email = `compat-admin-${Date.now()}@example.test`;
    let adminId: string | null = null;
    try {
      const [{ policyEditorialRepository }, { createPolicyEditorialService }] =
        await Promise.all([
          import("./editorial-repository"),
          import("./editorial-service"),
        ]);
      const policyEditorialService = createPolicyEditorialService(
        policyEditorialRepository
      );
      // Same identity shape the destructive-suite fixture uses.
      const [admin] = await sql<{ id: string }[]>`
        insert into "User" ("email", "password", "role", "emailVerifiedAt")
        values (${email}, ${"x".repeat(64)}, 'admin', now())
        returning "id"
      `;
      adminId = admin.id;

      // Every bundled entry must map to content the Policy Editor contract
      // accepts, with honest attribution and preserved source identity.
      for (const entry of MANUAL_POLICY_ENTRIES) {
        const content = compatibilityEntryToHumanContent(entry);
        const parsed = policyHumanRevisionContentSchema.safeParse(content);
        assert.equal(
          parsed.success,
          true,
          parsed.success ? "" : JSON.stringify(parsed.error.issues)
        );
        assert.equal(
          attributionImpersonatesOfficialAuthority(content.attribution),
          false
        );
        assert.equal(
          content.sourceReferences[0]?.url,
          entry.source.officialUrl
        );
      }

      const entry = MANUAL_POLICY_ENTRIES[0];
      assert.ok(entry);
      const first = await importCompatibilityEntry({
        actorUserId: adminId,
        slug: entry.slug,
        service: policyEditorialService,
        repository: policyEditorialRepository,
      });
      assert.equal(first.status, "ok");
      if (first.status !== "ok") {
        return;
      }
      assert.equal(first.value.outcome, "draft_created");
      const [item] = await sql`
        select slug, origin, "editorialStatus", "latestPublishedRevisionId"
        from "PolicyIntelligenceItem"
        where slug = ${entry.slug}
      `;
      assert.equal(item.slug, entry.slug);
      assert.equal(item.origin, "manual");
      assert.equal(item.editorialStatus, "draft");
      // Importing never publishes: the durable card cannot appear on its own.
      assert.equal(item.latestPublishedRevisionId, null);
      const [revision] = await sql`
        select "contentKind", "editorialStatus", "idempotencyKey", "humanContent"
        from "PolicyIntelligenceAnalysisRevision"
        where "itemId" = ${first.value.itemId}
      `;
      assert.equal(revision.contentKind, "lawyer_authored");
      assert.equal(revision.editorialStatus, "draft");
      assert.equal(
        revision.idempotencyKey,
        compatibilityImportIdempotencyKey(entry.slug)
      );
      const humanContent = policyHumanRevisionContentSchema.parse(
        revision.humanContent
      );
      assert.equal(humanContent.title.en, entry.copy.en.title);

      // A second import is idempotent: same item, no duplicate rows.
      const second = await importCompatibilityEntry({
        actorUserId: adminId,
        slug: entry.slug,
        service: policyEditorialService,
        repository: policyEditorialRepository,
      });
      assert.equal(second.status, "ok");
      if (second.status === "ok") {
        assert.equal(second.value.outcome, "already_managed");
        assert.equal(second.value.itemId, first.value.itemId);
      }
      const [counts] = await sql`
        select
          (select count(*) from "PolicyIntelligenceItem" where slug = ${entry.slug})::int as items,
          (select count(*) from "PolicyIntelligenceAnalysisRevision" where "itemId" = ${first.value.itemId})::int as revisions
      `;
      assert.equal(counts.items, 1);
      assert.equal(counts.revisions, 1);
    } finally {
      if (adminId) {
        await sql`delete from "PolicyIntelligenceEditorialEvent" where "actorUserId" = ${adminId}`;
        await sql`delete from "PolicyIntelligenceAnalysisRevision" where "itemId" in (select id from "PolicyIntelligenceItem" where "createdByUserId" = ${adminId})`;
        await sql`delete from "PolicyIntelligenceItem" where "createdByUserId" = ${adminId}`;
        await sql`delete from "PolicyEditorGrant" where "userId" = ${adminId}`;
        await sql`delete from "User" where id = ${adminId}`;
      }
      await sql.end({ timeout: 5 });
      // The lazy application database client must be closed as well, or an

test(
  "Stage 3 D-072: a source-first publication is readable through the public projections",
  { skip: skipReason },
  async () => {
    assertIsolatedTarget(TEST_DATABASE_URL);
    process.env.POSTGRES_URL = TEST_DATABASE_URL;
    const sql = postgres(TEST_DATABASE_URL, {
      max: 4,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
    });
    const email = `source-first-${Date.now()}@example.test`;
    let adminId: string | null = null;
    try {
      const [
        { policyIntelligenceRepository },
        { createPolicyEditorialService },
        { getPublishedPolicyIntelligenceList },
        { toLivePolicyRecord },
      ] = await Promise.all([
        import("./repository"),
        import("./editorial-service"),
        import("./read-service"),
        import("./read-service"),
      ]);
      // The editorial service is only used to obtain the authenticated actor
      // plumbing; the source-first revision itself is written by the automated
      // repository path exactly as the pipeline does.
      void createPolicyEditorialService;
      const [admin] = await sql<{ id: string }[]>`
        insert into "User" ("email", "password", "role", "emailVerifiedAt")
        values (${email}, ${"x".repeat(64)}, 'admin', now())
        returning "id"
      `;
      adminId = admin.id;

      const item = await policyIntelligenceRepository.createItem({
        slug: `it-source-first-${Date.now()}`,
        sourceConfigId: "home-affairs-guidance",
        sourceId: "it-source-first-source",
        canonicalOfficialUrl:
          "https://immi.homeaffairs.gov.au/policy/it-source-first",
        sourceStatus: "announced",
        editorialStatus: "draft",
      });
      const { snapshot } = await policyIntelligenceRepository.acquireSnapshot({
        sourceConfigId: "home-affairs-guidance",
        sourceId: "it-source-first-source",
        authority: "Department of Home Affairs",
        canonicalUrl: "https://immi.homeaffairs.gov.au/policy/it-source-first",
        officialTitle: "Consultation on skilled visa processing priorities",
        retrievedAt: new Date().toISOString(),
        contentType: "text/html",
        httpStatus: 200,
        etag: null,
        lastModified: null,
        sourceDate: "2026-10-10",
        effectiveDate: null,
        evidenceTruncated: false,
        normalizedEvidence:
          "The department has opened a public consultation on proposed changes to skilled visa processing priorities. The page describes the proposal only and does not establish that any change has commenced.",
        contentHash: "it-source-first-hash",
        sourceMetadata: {
          requestedUrl:
            "https://immi.homeaffairs.gov.au/policy/it-source-first",
          finalUrl: "https://immi.homeaffairs.gov.au/policy/it-source-first",
          redirectChain: [],
          bytesReceived: 240,
          evidenceTruncated: false,
        },
        itemId: item.id,
      });
      const write = await policyIntelligenceRepository.publishRevision({
        itemId: item.id,
        snapshotId: snapshot.id,
        contentKind: "source_first",
        schemaVersion: POLICY_SOURCE_FIRST_SCHEMA,
        analysisFingerprint: createHash("sha256")
          .update(`source-first:${snapshot.id}`)
          .digest("hex"),
        analysis: null,
        verification: null,
        modelMetadata: {
          provider: "fixture",
          model: "fixture",
          reasoningEffort: "none",
          timeoutMs: 0,
          maxOutputTokens: 0,
          analyzerVersion: POLICY_ANALYZER_VERSION,
          verifierVersion: POLICY_VERIFIER_VERSION,
          sourceFirst: { reason: "analysis_unavailable" },
          advisories: ["provider_timeout"],
        },
        generatedAt: new Date().toISOString(),
      });
      assert.equal(write.created, true);
      assert.equal(write.revision.contentKind, "source_first");

      const published = await getPublishedPolicyIntelligenceList();
      const record = published.find((entry) => entry.slug === item.slug);
      assert.ok(record, "the source-first publication must be publicly listed");
      assert.equal(record.provenance, "official_source_update");
      assert.equal(record.analysis, null);
      assert.equal(record.sourceFirst?.reason, "analysis_unavailable");
      assert.ok(record.sourceFirst?.excerpt);
      assert.equal(record.sourceStatus, "unknown");

      const [row] = await sql<{ publicationMode: string }[]>`
        select "publicationMode" from "PolicyIntelligenceItem" where id = ${item.id}
      `;
      assert.equal(row.publicationMode, "automatic");
      void toLivePolicyRecord;
    } finally {
      if (adminId) {
        await sql`delete from "PolicyIntelligenceEditorialEvent" where "actorUserId" = ${adminId}`;
        await sql`delete from "PolicyIntelligenceAnalysisRevision" where "itemId" in (select id from "PolicyIntelligenceItem" where slug like 'it-source-first-%')`;
        await sql`delete from "PolicyIntelligenceSourceSnapshot" where "itemId" in (select id from "PolicyIntelligenceItem" where slug like 'it-source-first-%')`;
        await sql`delete from "PolicyIntelligenceItem" where slug like 'it-source-first-%'`;
        await sql`delete from "User" where id = ${adminId}`;
      }
      await sql.end({ timeout: 5 });
      const runtimeClient = await import("@/lib/db/runtime-client");
      await runtimeClient.closeLazyDatabase();
    }
  }
);

      // idle pooled connection keeps the test process alive.
      const runtimeClient = await import("@/lib/db/runtime-client");
      await runtimeClient.closeLazyDatabase();
    }
  }
);
