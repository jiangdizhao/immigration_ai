import assert from "node:assert/strict";
import test from "node:test";
import type { OfficialSourceAcquisition } from "../../scripts/policy-intelligence-acquisition";
import type { DiscoveryCandidate } from "../../scripts/policy-intelligence-discovery";
import {
  evaluatePublicationGate,
  POLICY_ANALYSIS_SCHEMA,
  POLICY_ANALYZER_VERSION,
  POLICY_VERIFICATION_SCHEMA,
  POLICY_VERIFIER_VERSION,
  type PolicyAnalysis,
  type PolicyEvidencePacketItem,
  type PolicyVerification,
  policyAnalysisSchema,
  validatePolicyVerification,
} from "./contracts";
import { isCurrentPublishedPolicyRevision } from "./currentness";
import { createInMemoryPolicyIntelligenceRepository } from "./memory-repository";
import {
  computePolicyAnalysisFingerprint,
  createPolicyModelMetadata,
  runPolicyIntelligenceSync,
} from "./pipeline";

const now = "2026-09-30T01:00:00.000Z";
const candidate: DiscoveryCandidate = {
  schemaVersion: "policy-intelligence.discovery-candidate.v1",
  candidateId: "candidate-1",
  sourceConfigId: "home-affairs-guidance",
  authority: "Department of Home Affairs",
  canonicalUrl: "https://immi.homeaffairs.gov.au/policy/example",
  retrievedAt: now,
  contentType: "text/html",
  contentHash: "candidate-hash",
  discoveryStrategy: "listing_links",
  sourceMetadata: {
    httpStatus: 200,
    redirectChain: [],
    urlProvenance: "fetched_page",
  },
};
function analysis(
  ref: string,
  patch: Partial<PolicyAnalysis> = {}
): PolicyAnalysis {
  const text = {
    "zh-CN": "经来源核实的说明。",
    en: "A source-grounded explanation.",
  };
  const linkedText = { ...text, claimRefs: ["claim-1"], uncertainty: null };
  const item = (
    id: string,
    kind: "source_fact" | "practical_interpretation" = "source_fact"
  ) => ({
    id,
    kind,
    text: linkedText,
    evidenceRefs: [ref],
  });
  return policyAnalysisSchema.parse({
    schemaVersion: POLICY_ANALYSIS_SCHEMA,
    publicationEligibility: {
      id: "policy-relevance",
      classification: "policy_relevant",
      evidenceRefs: [ref],
    },
    title: { ...item("title"), text: { ...linkedText } },
    executiveSummary: { ...item("executive-summary"), text: { ...linkedText } },
    keyChanges: [item("change-1")],
    affectedGroups: [item("group-1")],
    practicalImpacts: [item("impact-1", "practical_interpretation")],
    recommendedActions: [item("action-1", "practical_interpretation")],
    transitionInfo: null,
    uncertainties: [item("uncertainty-1", "practical_interpretation")],
    relatedSnapshotRefs: [],
    sourceStatus: {
      id: "source-status",
      value: "announced",
      certain: true,
      claimRef: "claim-1",
      evidenceRefs: [ref],
    },
    materialClaims: [
      {
        id: "claim-1",
        kind: "source_fact",
        decisive: true,
        conditional: false,
        text,
        uncertainty: null,
        evidenceRefs: [ref],
      },
    ],
    importance: {
      affectedPopulation: 3,
      legalForce: "official_guidance",
      immediacy: 3,
      serviceRelevance: 4,
      proceduralImpact: 2,
    },
    ...patch,
  });
}
function verification(
  draft: PolicyAnalysis,
  overrides: Record<string, "supported" | "partial" | "unsupported"> = {}
): PolicyVerification {
  const units = [
    ...draft.materialClaims.map((claim) => ({
      id: claim.id,
      evidenceRefs: claim.evidenceRefs,
    })),
    draft.title,
    draft.executiveSummary,
    ...draft.keyChanges,
    ...draft.affectedGroups,
    ...draft.practicalImpacts,
    ...draft.recommendedActions,
    ...(draft.transitionInfo ? [draft.transitionInfo] : []),
    ...draft.uncertainties,
    draft.publicationEligibility,
    draft.sourceStatus,
  ];
  return {
    schemaVersion: POLICY_VERIFICATION_SCHEMA,
    assessments: units.map((unit) => {
      const verdict = overrides[unit.id] ?? "supported";
      return {
        unitId: unit.id,
        verdict,
        evidenceRefs: verdict === "unsupported" ? [] : [...unit.evidenceRefs],
        reasonCode:
          verdict === "supported"
            ? "direct_support"
            : verdict === "partial"
              ? "qualified_support"
              : "insufficient_support",
      };
    }),
  };
}
function acquisition(
  hash: string,
  evidenceTruncated = false,
  canonicalUrl = candidate.canonicalUrl
): OfficialSourceAcquisition {
  return {
    sourceConfigId: candidate.sourceConfigId,
    sourceId: "candidate-content-id",
    authority: candidate.authority,
    canonicalUrl,
    officialTitle: "Example official policy page",
    retrievedAt: now,
    contentType: "text/html",
    httpStatus: 200,
    etag: null,
    lastModified: null,
    sourceDate: null,
    effectiveDate: "2026-01-15",
    evidenceTruncated,
    normalizedEvidence: `Official evidence version ${hash}.`,
    contentHash: hash,
    sourceMetadata: {
      requestedUrl: candidate.canonicalUrl,
      finalUrl: canonicalUrl,
      redirectChain: [],
      bytesReceived: 140,
      evidenceTruncated,
    },
  };
}
function dependencies(
  options: {
    hashes?: string[];
    evidenceTruncated?: boolean;
    analyze?: (
      evidence: readonly PolicyEvidencePacketItem[]
    ) => PolicyAnalysis | Promise<PolicyAnalysis>;
    verify?: (
      analysis: PolicyAnalysis,
      evidence: readonly PolicyEvidencePacketItem[]
    ) => PolicyVerification | Promise<PolicyVerification>;
    discoveredCandidate?: DiscoveryCandidate;
    acquiredCanonicalUrl?: string;
    acquire?: (
      candidate: DiscoveryCandidate
    ) => Promise<OfficialSourceAcquisition>;
  } = {}
) {
  const store = createInMemoryPolicyIntelligenceRepository();
  let hashIndex = 0;
  let idIndex = 0;
  let analyzeCalls = 0;
  let verifyCalls = 0;
  const deps = {
    repository: store.repository,
    discover: async () => [options.discoveredCandidate ?? candidate],
    acquire: async (selectedCandidate: DiscoveryCandidate) =>
      options.acquire
        ? options.acquire(selectedCandidate)
        : acquisition(
            options.hashes?.[hashIndex++] ?? "same-hash",
            options.evidenceTruncated ?? false,
            options.acquiredCanonicalUrl ?? selectedCandidate.canonicalUrl
          ),
    analyzer: {
      analyze: ({
        evidence,
      }: {
        evidence: readonly PolicyEvidencePacketItem[];
      }) => {
        analyzeCalls++;
        return options.analyze
          ? options.analyze(evidence)
          : analysis(evidence[0].evidenceRef);
      },
    },
    verifier: {
      verify: ({
        analysis: draft,
        evidence,
      }: {
        analysis: PolicyAnalysis;
        evidence: readonly PolicyEvidencePacketItem[];
      }) => {
        verifyCalls++;
        return options.verify
          ? options.verify(draft, evidence)
          : verification(draft);
      },
    },
    modelMetadata: createPolicyModelMetadata({
      provider: "fixture",
      model: "fixture",
      reasoningEffort: "none",
      timeoutMs: 0,
      maxOutputTokens: 0,
    }),
    mode: "fixture" as const,
    now: () => now,
    makeId: () => `run-${++idIndex}`,
  };
  return { deps, store, calls: () => ({ analyzeCalls, verifyCalls }) };
}
test("unchanged source hash skips duplicate snapshot, analysis and publication", async () => {
  const h = dependencies();
  const first = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const second = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(first.run.publishedCount, 1);
  assert.equal(second.run.unchangedCount, 1);
  assert.equal(h.store.snapshots.size, 1);
  assert.equal(h.store.revisions.size, 1);
  assert.deepEqual(h.calls(), { analyzeCalls: 1, verifyCalls: 1 });
});
test("changed source hash creates immutable snapshot and superseding revision", async () => {
  const h = dependencies({ hashes: ["hash-one", "hash-two"] });
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  assert.equal(h.store.snapshots.size, 2);
  assert.equal(h.store.revisions.size, 2);
  const revisions = [...h.store.revisions.values()].sort(
    (a, b) => a.revisionNumber - b.revisionNumber
  );
  assert.equal(revisions[0].editorialStatus, "superseded");
  assert.equal(revisions[0].supersededAt, now);
  assert.equal(revisions[1].editorialStatus, "published");
});
test("a held newer analysis preserves history but is not publicly current", async () => {
  let analyzeCount = 0;
  const h = dependencies({
    hashes: ["first", "second"],
    analyze: (evidence) => {
      analyzeCount++;
      const result = analysis(evidence[0].evidenceRef);
      return analyzeCount === 1
        ? result
        : {
            ...result,
            sourceStatus: {
              ...result.sourceStatus,
              value: "in_force",
              certain: false,
            },
          };
    },
  });
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  const item = [...h.store.items.values()][0];
  const priorPublishedId = item.latestPublishedRevisionId;
  assert.ok(priorPublishedId);
  const priorPublished = h.store.revisions.get(priorPublishedId);
  assert.ok(priorPublished);
  const priorSnapshot = h.store.snapshots.get(priorPublished.snapshotId);
  assert.ok(priorSnapshot);

  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  const held = [...h.store.revisions.values()].find(
    (revision) => revision.editorialStatus === "review_required"
  );
  assert.ok(held);
  assert.equal(held.snapshotId, item.latestSnapshotId);
  assert.equal(item.editorialStatus, "review_required");
  assert.equal(item.latestPublishedRevisionId, priorPublishedId);
  assert.equal(priorPublished.editorialStatus, "published");
  assert.equal(h.store.revisions.has(priorPublishedId), true);
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item,
      revision: priorPublished,
      snapshot: priorSnapshot,
    }),
    false
  );
});

test("a later current publication restores visibility and stale held work cannot downgrade it", async () => {
  let analyzeCount = 0;
  const h = dependencies({
    hashes: ["hash-a", "hash-b", "hash-c"],
    analyze: (evidence) => {
      analyzeCount++;
      const result = analysis(evidence[0].evidenceRef);
      return analyzeCount === 2
        ? {
            ...result,
            sourceStatus: { ...result.sourceStatus, certain: false },
          }
        : result;
    },
  });
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  const item = [...h.store.items.values()][0];
  const originalPublishedId = item.latestPublishedRevisionId;
  assert.ok(originalPublishedId);
  const originalPublished = h.store.revisions.get(originalPublishedId);
  assert.ok(originalPublished);
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  assert.equal(item.editorialStatus, "review_required");
  const heldB = [...h.store.revisions.values()].find(
    (revision) => revision.editorialStatus === "review_required"
  );
  assert.ok(heldB);
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);

  const currentPublishedId = item.latestPublishedRevisionId;
  assert.ok(currentPublishedId);
  const currentC = h.store.revisions.get(currentPublishedId);
  assert.ok(currentC);
  assert.equal(item.editorialStatus, "published");
  assert.equal(currentC.snapshotId, item.latestSnapshotId);
  assert.equal(currentC.editorialStatus, "published");
  assert.equal(originalPublished.editorialStatus, "superseded");
  assert.equal(h.store.revisions.has(heldB.id), true);
  const currentSnapshot = h.store.snapshots.get(currentC.snapshotId);
  assert.ok(currentSnapshot);
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item,
      revision: currentC,
      snapshot: currentSnapshot,
    }),
    true
  );

  const alternateMetadata = createPolicyModelMetadata({
    provider: "fixture",
    model: "delayed-stale-analysis",
    reasoningEffort: "none",
    timeoutMs: 0,
    maxOutputTokens: 0,
  });
  const staleWrite = await h.store.repository.saveHeldRevision({
    itemId: item.id,
    snapshotId: heldB.snapshotId,
    analysisFingerprint: computePolicyAnalysisFingerprint(
      heldB.snapshotId,
      alternateMetadata
    ),
    analysis: heldB.analysis,
    verification: heldB.verification,
    modelMetadata: alternateMetadata,
    editorialStatus: "review_required",
    generatedAt: "2026-09-30T02:00:00.000Z",
  });
  assert.equal(staleWrite.created, true);
  assert.equal(item.editorialStatus, "published");
  assert.equal(item.latestPublishedRevisionId, currentC.id);
});

test("a source reverting to an older hash at a later time creates A-B-A history", async () => {
  const observations = [
    { hash: "hash-a", retrievedAt: "2026-09-30T01:00:00.000Z" },
    { hash: "hash-b", retrievedAt: "2026-09-30T01:01:00.000Z" },
    { hash: "hash-a", retrievedAt: "2026-09-30T01:02:00.000Z" },
  ];
  const h = dependencies({
    acquire: () => {
      const observation = observations.shift();
      assert.ok(observation);
      return Promise.resolve({
        ...acquisition(observation.hash),
        retrievedAt: observation.retrievedAt,
      });
    },
  });
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  const snapshots = [...h.store.snapshots.values()].sort((a, b) =>
    a.retrievedAt.localeCompare(b.retrievedAt)
  );
  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.contentHash),
    ["hash-a", "hash-b", "hash-a"]
  );
  assert.equal(snapshots[2].previousSnapshotId, snapshots[1].id);
  assert.equal(h.store.revisions.size, 3);
});

test("provider failure can be retried against the same snapshot without duplication", async () => {
  let attempts = 0;
  const h = dependencies({
    analyze: (evidence) => {
      attempts++;
      if (attempts === 1) {
        throw new Error("temporary provider issue");
      }
      return analysis(evidence[0].evidenceRef);
    },
  });
  const first = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const second = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(first.run.failureCount, 1);
  assert.equal(second.run.publishedCount, 1);
  assert.equal(second.run.snapshottedCount, 0);
  assert.equal(h.store.snapshots.size, 1);
  assert.equal(h.store.revisions.size, 1);
});

test("malformed analyzer output and missing bilingual fields fail closed", async () => {
  const malformed = dependencies({
    analyze: () => ({ schemaVersion: "wrong" }) as unknown as PolicyAnalysis,
  });
  const result = await runPolicyIntelligenceSync(
    malformed.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.run.failureCount, 1);
  const missing = dependencies({
    analyze: (e) =>
      ({
        ...analysis(e[0].evidenceRef),
        executiveSummary: { en: "only English" },
      }) as PolicyAnalysis,
  });
  const missingResult = await runPolicyIntelligenceSync(
    missing.deps,
    candidate.sourceConfigId
  );
  assert.equal(missingResult.run.publishedCount, 0);
  assert.equal(missingResult.run.failureCount, 1);
});
test("AI output cannot add official excerpts or lawyer commentary", () => {
  const valid = analysis("policy-snapshot:x");
  assert.equal(
    policyAnalysisSchema.safeParse({ ...valid, officialExcerpt: "AI text" })
      .success,
    false
  );
  assert.equal(
    policyAnalysisSchema.safeParse({
      ...valid,
      lawyerCommentary: { en: "advice" },
    }).success,
    false
  );
});
test("unknown evidence refs fail closed before publication", async () => {
  const h = dependencies({ analyze: () => analysis("invented-ref") });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.outcomes[0].reasonCode, "unknown_analysis_evidence_ref");
});
test("unsupported decisive claim is held for review", async () => {
  const h = dependencies({
    verify: (draft) => verification(draft, { "claim-1": "unsupported" }),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.heldCount, 1);
  assert.equal(result.run.publishedCount, 0);
  assert.equal(
    [...h.store.revisions.values()][0].editorialStatus,
    "review_required"
  );
});
test("policy relevance classification permits only verified policy-relevant material", async () => {
  const operational = dependencies({
    analyze: (e) =>
      analysis(e[0].evidenceRef, {
        title: {
          ...analysis(e[0].evidenceRef).title,
          text: {
            ...analysis(e[0].evidenceRef).title.text,
            "zh-CN": "网站维护通知",
            en: "Website maintenance notice",
          },
        },
        publicationEligibility: {
          id: "policy-relevance",
          classification: "operational_notice",
          evidenceRefs: [e[0].evidenceRef],
        },
      }),
  });
  const uncertain = dependencies({
    analyze: (e) =>
      analysis(e[0].evidenceRef, {
        publicationEligibility: {
          id: "policy-relevance",
          classification: "uncertain",
          evidenceRefs: [e[0].evidenceRef],
        },
      }),
  });
  const unsupported = dependencies({
    verify: (draft) =>
      verification(draft, { "policy-relevance": "unsupported" }),
  });
  const genuine = dependencies();
  const results = await Promise.all([
    runPolicyIntelligenceSync(genuine.deps, candidate.sourceConfigId),
    runPolicyIntelligenceSync(operational.deps, candidate.sourceConfigId),
    runPolicyIntelligenceSync(uncertain.deps, candidate.sourceConfigId),
    runPolicyIntelligenceSync(unsupported.deps, candidate.sourceConfigId),
  ]);
  assert.equal(results[0].run.publishedCount, 1);
  for (const result of results.slice(1)) {
    assert.equal(result.run.publishedCount, 0);
    assert.equal(result.run.heldCount, 1);
  }
  assert.equal(
    operational.store.items.values().next().value?.editorialStatus,
    "review_required"
  );
});

test("every visible narrative, including uncertainty units, requires verification", async () => {
  const missingNarrative = dependencies({
    verify: (draft) => ({
      ...verification(draft),
      assessments: verification(draft).assessments.filter(
        (assessment) => assessment.unitId !== "title"
      ),
    }),
  });
  const uncertaintyNotSupported = dependencies({
    verify: (draft) => verification(draft, { "uncertainty-1": "unsupported" }),
  });
  const [missing, unsupported] = await Promise.all([
    runPolicyIntelligenceSync(missingNarrative.deps, candidate.sourceConfigId),
    runPolicyIntelligenceSync(
      uncertaintyNotSupported.deps,
      candidate.sourceConfigId
    ),
  ]);
  assert.equal(missing.run.failureCount, 1);
  assert.equal(missing.run.publishedCount, 0);
  assert.equal(unsupported.run.heldCount, 1);
  assert.equal(unsupported.run.publishedCount, 0);
});

test("unsupported narrative addition blocks publication despite its supported linked claim", async () => {
  const h = dependencies({
    analyze: (e) => {
      const draft = analysis(e[0].evidenceRef);
      return {
        ...draft,
        keyChanges: [
          {
            ...draft.keyChanges[0],
            text: {
              ...draft.keyChanges[0].text,
              en: `${draft.keyChanges[0].text.en} Every application will be refused.`,
            },
          },
        ],
      };
    },
    verify: (draft) => verification(draft, { "change-1": "unsupported" }),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.run.heldCount, 1);
  assert.equal(result.outcomes[0].outcome, "held");
});

test("truncated evidence stays auditable but is not a publication veto", async () => {
  let analyzerSawTruncation = false;
  const h = dependencies({
    evidenceTruncated: true,
    analyze: (e) => {
      analyzerSawTruncation = e[0].evidenceTruncated;
      return analysis(e[0].evidenceRef);
    },
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const snapshot = [...h.store.snapshots.values()][0];
  assert.equal(analyzerSawTruncation, true);
  assert.equal(snapshot.evidenceTruncated, true);
  assert.equal(result.run.heldCount, 0);
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.outcomes[0].outcome, "published");

  const gate = evaluatePublicationGate({
    analysis: analysis(`policy-snapshot:${snapshot.id}`),
    verification: verification(analysis(`policy-snapshot:${snapshot.id}`)),
    evidence: [
      {
        evidenceRef: `policy-snapshot:${snapshot.id}`,
        snapshotId: snapshot.id,
        sourceConfigId: snapshot.sourceConfigId,
        sourceId: snapshot.sourceId,
        authority: snapshot.authority,
        canonicalUrl: snapshot.canonicalUrl,
        officialTitle: snapshot.officialTitle,
        retrievedAt: snapshot.retrievedAt,
        contentHash: snapshot.contentHash,
        sourceDate: snapshot.sourceDate,
        effectiveDate: snapshot.effectiveDate,
        evidenceTruncated: snapshot.evidenceTruncated,
        text: snapshot.normalizedEvidence,
      },
    ],
    acquisitionComplete: false,
  });
  assert.equal(gate.eligible, true);
  assert.equal(gate.reasons.includes("source_acquisition_incomplete"), false);
  assert.equal(gate.reasons.includes("source_evidence_truncated"), false);
});

test("same-current-content concurrent requests reuse one current snapshot", async () => {
  const store = createInMemoryPolicyIntelligenceRepository();
  const item = store.repository.createItem({
    slug: "fixture-policy",
    sourceConfigId: candidate.sourceConfigId,
    sourceId: "fixture-source",
    canonicalOfficialUrl: candidate.canonicalUrl,
    sourceStatus: "announced",
    editorialStatus: "draft",
  });
  const source = acquisition("hash-concurrent");
  const input = { ...source, itemId: item.id, sourceId: item.sourceId };
  const results = await Promise.all([
    store.repository.acquireSnapshot(input),
    store.repository.acquireSnapshot(input),
  ]);
  assert.equal(store.snapshots.size, 1);
  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(results.filter((result) => !result.created).length, 1);
  assert.equal(results[0].snapshot.id, results[1].snapshot.id);
});

test("an older out-of-order acquisition reuses latest without inserting or regressing it", async () => {
  const store = createInMemoryPolicyIntelligenceRepository();
  const item = store.repository.createItem({
    slug: "ordered-source",
    sourceConfigId: candidate.sourceConfigId,
    sourceId: "ordered-source",
    canonicalOfficialUrl: candidate.canonicalUrl,
    sourceStatus: "announced",
    editorialStatus: "draft",
  });
  const newest = await store.repository.acquireSnapshot({
    ...acquisition("hash-newer"),
    retrievedAt: "2026-09-30T10:01:00.000Z",
    itemId: item.id,
    sourceId: item.sourceId,
  });
  const stale = await store.repository.acquireSnapshot({
    ...acquisition("hash-older"),
    retrievedAt: "2026-09-30T10:00:00.000Z",
    itemId: item.id,
    sourceId: item.sourceId,
  });
  assert.equal(newest.created, true);
  assert.equal(stale.created, false);
  assert.equal(stale.staleAcquisition, true);
  assert.equal(stale.snapshot.id, newest.snapshot.id);
  assert.equal(stale.snapshot.contentHash, "hash-newer");
  assert.equal(store.snapshots.size, 1);
  assert.equal(item.latestSnapshotId, newest.snapshot.id);
});

test("a stale pipeline run analyzes the repository-authoritative latest snapshot", async () => {
  const acquisitions = [
    { hash: "hash-newer", retrievedAt: "2026-09-30T10:01:00.000Z" },
    { hash: "hash-older", retrievedAt: "2026-09-30T10:00:00.000Z" },
  ];
  const analyzedHashes: string[] = [];
  const h = dependencies({
    acquire: () => {
      const observation = acquisitions.shift();
      assert.ok(observation);
      return Promise.resolve({
        ...acquisition(observation.hash),
        retrievedAt: observation.retrievedAt,
      });
    },
    analyze: (evidence) => {
      analyzedHashes.push(evidence[0].contentHash);
      return analysis(evidence[0].evidenceRef);
    },
  });
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  h.deps.modelMetadata = createPolicyModelMetadata({
    provider: "fixture",
    model: "new-implementation",
    reasoningEffort: "none",
    timeoutMs: 0,
    maxOutputTokens: 0,
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 1);
  assert.deepEqual(analyzedHashes, ["hash-newer", "hash-newer"]);
  assert.equal(h.store.snapshots.size, 1);
  assert.equal(
    [...h.store.revisions.values()][1].snapshotId,
    [...h.store.snapshots.values()][0].id
  );
});

test("revision allocation remains unique under concurrent in-memory writes", async () => {
  const store = createInMemoryPolicyIntelligenceRepository();
  const item = store.repository.createItem({
    slug: "revision-sequence",
    sourceConfigId: candidate.sourceConfigId,
    sourceId: "revision-source",
    canonicalOfficialUrl: candidate.canonicalUrl,
    sourceStatus: "announced",
    editorialStatus: "draft",
  });
  const { snapshot } = await store.repository.acquireSnapshot({
    ...acquisition("revision-hash"),
    itemId: item.id,
    sourceId: item.sourceId,
  });
  const draft = analysis(`policy-snapshot:${snapshot.id}`);
  const modelMetadata = createPolicyModelMetadata({
    provider: "fixture",
    model: "fixture",
    reasoningEffort: "none",
    timeoutMs: 0,
    maxOutputTokens: 0,
  });
  const revisionInput = {
    itemId: item.id,
    snapshotId: snapshot.id,
    analysisFingerprint: computePolicyAnalysisFingerprint(
      snapshot.id,
      modelMetadata
    ),
    analysis: draft,
    verification: verification(draft),
    modelMetadata: createPolicyModelMetadata({
      provider: "fixture",
      model: "fixture",
      reasoningEffort: "none",
      timeoutMs: 0,
      maxOutputTokens: 0,
    }),
    generatedAt: now,
  };
  const revisions = await Promise.all([
    store.repository.saveHeldRevision({
      ...revisionInput,
      editorialStatus: "review_required",
    }),
    store.repository.publishRevision(revisionInput),
  ]);
  assert.equal(store.revisions.size, 1);
  assert.equal(revisions.filter((write) => write.created).length, 1);
  assert.deepEqual(
    revisions.map((write) => write.revision.revisionNumber),
    [1, 1]
  );
});

test("cross-item item pointers are rejected by the in-memory repository", async () => {
  const store = createInMemoryPolicyIntelligenceRepository();
  const first = store.repository.createItem({
    slug: "pointer-source",
    sourceConfigId: candidate.sourceConfigId,
    sourceId: "pointer-source",
    canonicalOfficialUrl: candidate.canonicalUrl,
    sourceStatus: "announced",
    editorialStatus: "draft",
  });
  const second = store.repository.createItem({
    slug: "pointer-target",
    sourceConfigId: candidate.sourceConfigId,
    sourceId: "pointer-target",
    canonicalOfficialUrl:
      "https://immi.homeaffairs.gov.au/policy/pointer-target",
    sourceStatus: "announced",
    editorialStatus: "draft",
  });
  const { snapshot } = await store.repository.acquireSnapshot({
    ...acquisition("pointer-hash"),
    itemId: first.id,
    sourceId: first.sourceId,
  });
  second.latestSnapshotId = snapshot.id;
  assert.throws(
    () =>
      store.repository.acquireSnapshot({
        ...acquisition("another-hash"),
        itemId: second.id,
        sourceId: second.sourceId,
      }),
    /latest_snapshot_pointer_mismatch/
  );
});

test("cross-item snapshot/revision mismatch fails closed", async () => {
  const store = createInMemoryPolicyIntelligenceRepository();
  const first = store.repository.createItem({
    slug: "first-item",
    sourceConfigId: candidate.sourceConfigId,
    sourceId: "first-source",
    canonicalOfficialUrl: candidate.canonicalUrl,
    sourceStatus: "announced",
    editorialStatus: "draft",
  });
  const second = store.repository.createItem({
    slug: "second-item",
    sourceConfigId: candidate.sourceConfigId,
    sourceId: "second-source",
    canonicalOfficialUrl: "https://immi.homeaffairs.gov.au/policy/other",
    sourceStatus: "announced",
    editorialStatus: "draft",
  });
  const { snapshot } = await store.repository.acquireSnapshot({
    ...acquisition("item-one-hash"),
    itemId: first.id,
    sourceId: first.sourceId,
  });
  assert.throws(
    () =>
      store.repository.publishRevision({
        itemId: second.id,
        snapshotId: snapshot.id,
        analysisFingerprint: computePolicyAnalysisFingerprint(
          snapshot.id,
          createPolicyModelMetadata({
            provider: "fixture",
            model: "fixture",
            reasoningEffort: "none",
            timeoutMs: 0,
            maxOutputTokens: 0,
          })
        ),
        analysis: analysis(`policy-snapshot:${snapshot.id}`),
        verification: verification(analysis(`policy-snapshot:${snapshot.id}`)),
        modelMetadata: createPolicyModelMetadata({
          provider: "fixture",
          model: "fixture",
          reasoningEffort: "none",
          timeoutMs: 0,
          maxOutputTokens: 0,
        }),
        generatedAt: now,
      }),
    /revision_snapshot_item_mismatch/
  );
  assert.equal(second.latestPublishedRevisionId, null);
});

test("verifier verdict and reason code contradictions are rejected", () => {
  const draft = analysis("policy-snapshot:contradiction");
  const bad = verification(draft);
  bad.assessments[0] = {
    ...bad.assessments[0],
    verdict: "supported",
    reasonCode: "contradicted",
  };
  assert.throws(
    () =>
      validatePolicyVerification(
        bad,
        draft,
        new Set(["policy-snapshot:contradiction"])
      ),
    /verdict_reason_mismatch/
  );
});

test("partial support can publish only with explicit bilingual conditional uncertainty", () => {
  const base = analysis("policy-snapshot:1");
  const uncertainty = {
    "zh-CN": "部分情况尚未明确。",
    en: "Some applicability remains unclear.",
  };
  const qualifyText = (value: PolicyAnalysis["title"]["text"]) => ({
    ...value,
    uncertainty,
  });
  const qualifyUnit = (value: PolicyAnalysis["title"]) => ({
    ...value,
    text: qualifyText(value.text),
  });
  const conditional = policyAnalysisSchema.parse({
    ...base,
    title: qualifyUnit(base.title),
    executiveSummary: qualifyUnit(base.executiveSummary),
    keyChanges: base.keyChanges.map((item) => ({
      ...item,
      text: qualifyText(item.text),
    })),
    affectedGroups: base.affectedGroups.map((item) => ({
      ...item,
      text: qualifyText(item.text),
    })),
    practicalImpacts: base.practicalImpacts.map((item) => ({
      ...item,
      text: qualifyText(item.text),
    })),
    recommendedActions: base.recommendedActions.map((item) => ({
      ...item,
      text: qualifyText(item.text),
    })),
    uncertainties: base.uncertainties.map((item) => ({
      ...item,
      text: qualifyText(item.text),
    })),
    materialClaims: [
      {
        ...base.materialClaims[0],
        kind: "practical_interpretation",
        conditional: true,
        uncertainty,
      },
      {
        ...base.materialClaims[0],
        id: "status-claim",
        conditional: false,
        uncertainty: null,
      },
    ],
    sourceStatus: { ...base.sourceStatus, claimRef: "status-claim" },
  });
  const evidence: PolicyEvidencePacketItem[] = [
    {
      evidenceRef: "policy-snapshot:1",
      snapshotId: "1",
      sourceConfigId: candidate.sourceConfigId,
      sourceId: "source",
      authority: candidate.authority,
      canonicalUrl: candidate.canonicalUrl,
      officialTitle: "Title",
      retrievedAt: now,
      contentHash: "hash",
      sourceDate: null,
      effectiveDate: null,
      evidenceTruncated: false,
      text: "The source",
    },
  ];
  const gate = evaluatePublicationGate({
    analysis: conditional,
    verification: verification(conditional, {
      "claim-1": "partial",
      "impact-1": "partial",
    }),
    evidence,
    acquisitionComplete: true,
  });
  assert.equal(gate.eligible, true);
  const stripped = policyAnalysisSchema.parse({
    ...conditional,
    materialClaims: [
      { ...conditional.materialClaims[0], uncertainty: null },
      conditional.materialClaims[1],
    ],
  });
  assert.ok(
    evaluatePublicationGate({
      analysis: stripped,
      verification: verification(stripped, { "claim-1": "partial" }),
      evidence,
      acquisitionComplete: true,
    }).reasons.includes("partial_claim_missing_bilingual_uncertainty")
  );
});
test("verifier failure fails closed and telemetry stores only a safe code", async () => {
  const h = dependencies({
    verify: () => {
      throw new Error("provider failed https://secret.example/?key=do-not-log");
    },
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.run.failureCount, 1);
  assert.equal(result.run.safeErrorCode, "pipeline_error");
  assert.doesNotMatch(JSON.stringify(result.run), /secret|key=|https:/i);
});
test("malformed verifier claim sets fail closed", async () => {
  const h = dependencies({
    verify: () => ({
      schemaVersion: POLICY_VERIFICATION_SCHEMA,
      assessments: [],
    }),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.run.failureCount, 1);
});

test("source status is independently assessed and announced status may publish", async () => {
  const h = dependencies();
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const revision = [...h.store.revisions.values()][0];
  assert.equal(result.run.publishedCount, 1);
  assert.deepEqual(revision.analysis.sourceStatus.value, "announced");
  assert.deepEqual(
    revision.verification.assessments.find(
      (unit) => unit.unitId === "source-status"
    ),
    {
      unitId: "source-status",
      verdict: "supported",
      evidenceRefs: ["policy-snapshot:fixture-2"],
      reasonCode: "direct_support",
    }
  );
});

test("current published read requires revision snapshot and joined snapshot ownership to match", async () => {
  const h = dependencies();
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  const item = [...h.store.items.values()][0];
  const latestPublishedRevisionId = item.latestPublishedRevisionId;
  assert.ok(latestPublishedRevisionId);
  const revision = h.store.revisions.get(latestPublishedRevisionId);
  assert.ok(revision);
  const snapshot = h.store.snapshots.get(revision.snapshotId);
  assert.ok(snapshot);
  assert.equal(
    isCurrentPublishedPolicyRevision({ item, revision, snapshot }),
    true
  );
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item,
      revision,
      snapshot: { ...snapshot, itemId: "another-item" },
    }),
    false
  );
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: { ...item, latestSnapshotId: "a-newer-snapshot" },
      revision,
      snapshot,
    }),
    false
  );
});

test("supported announced claim cannot support mismatched in-force source status", async () => {
  const h = dependencies({
    analyze: (evidence) => {
      const draft = analysis(evidence[0].evidenceRef);
      return {
        ...draft,
        sourceStatus: { ...draft.sourceStatus, value: "in_force" },
        materialClaims: draft.materialClaims.map((claim) => ({
          ...claim,
          text: {
            "zh-CN": "该提案已经公布。",
            en: "The proposal has been announced.",
          },
        })),
      };
    },
    verify: (draft) => verification(draft, { "source-status": "unsupported" }),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const revision = [...h.store.revisions.values()][0];
  assert.equal(
    revision.verification.assessments.find((unit) => unit.unitId === "claim-1")
      ?.verdict,
    "supported"
  );
  assert.equal(revision.analysis.sourceStatus.value, "in_force");
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.run.heldCount, 1);
  assert.equal(
    result.outcomes[0].reasonCode,
    "source_status_not_fully_supported"
  );
});

test("unsupported source status is held despite supported material claims", async () => {
  const h = dependencies({
    verify: (draft) => verification(draft, { "source-status": "unsupported" }),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.run.heldCount, 1);
  assert.equal(
    result.outcomes[0].reasonCode,
    "source_status_not_fully_supported"
  );
});

test("empty uncertainty and recommended-action lists are valid when absent from the evidence", async () => {
  const h = dependencies({
    analyze: (evidence) => ({
      ...analysis(evidence[0].evidenceRef),
      uncertainties: [],
      recommendedActions: [],
    }),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 1);
  assert.equal(
    [...h.store.revisions.values()][0].analysis.uncertainties.length,
    0
  );
  assert.equal(
    [...h.store.revisions.values()][0].analysis.recommendedActions.length,
    0
  );
});

test("audit model metadata is derived from the v2 analysis and verification contracts", () => {
  const metadata = createPolicyModelMetadata({
    provider: "openai",
    model: "unchanged-selected-model",
    reasoningEffort: "high",
    timeoutMs: 45_000,
    maxOutputTokens: 8000,
  });
  assert.equal(metadata.analyzerVersion, POLICY_ANALYZER_VERSION);
  assert.equal(metadata.verifierVersion, POLICY_VERIFIER_VERSION);
  assert.equal(POLICY_ANALYSIS_SCHEMA, "policy-intelligence.analysis.v2");
  assert.equal(
    POLICY_VERIFICATION_SCHEMA,
    "policy-intelligence.verification.v2"
  );
  assert.equal(metadata.analyzerVersion, "policy-intelligence.analyzer.v2.1");
  assert.equal(metadata.verifierVersion, "policy-intelligence.verifier.v2.1");
  assert.notEqual(metadata.analyzerVersion, POLICY_ANALYSIS_SCHEMA);
  assert.notEqual(metadata.verifierVersion, POLICY_VERIFICATION_SCHEMA);
  assert.equal(metadata.model, "unchanged-selected-model");
});

test("analysis fingerprint changes with implementation versions independently of schema and snapshot", () => {
  const metadata = createPolicyModelMetadata({
    provider: "fixture",
    model: "fixture",
    reasoningEffort: "none",
    timeoutMs: 0,
    maxOutputTokens: 0,
  });
  const changedAnalyzer = {
    ...metadata,
    analyzerVersion: "policy-intelligence.analyzer.v2.2",
  };
  const changedVerifier = {
    ...metadata,
    verifierVersion: "policy-intelligence.verifier.v2.2",
  };
  const base = computePolicyAnalysisFingerprint("same-snapshot", metadata);
  assert.notEqual(
    computePolicyAnalysisFingerprint("same-snapshot", changedAnalyzer),
    base
  );
  assert.notEqual(
    computePolicyAnalysisFingerprint("same-snapshot", changedVerifier),
    base
  );
  assert.equal(POLICY_ANALYSIS_SCHEMA, "policy-intelligence.analysis.v2");
  assert.equal(
    POLICY_VERIFICATION_SCHEMA,
    "policy-intelligence.verification.v2"
  );
});

test("overlapping equivalent syncs write one canonical automated revision", async () => {
  const h = dependencies();
  let began = 0;
  let release: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.deps.analyzer.analyze = async ({ evidence }) => {
    began++;
    if (began === 2) {
      release?.();
    }
    await barrier;
    return analysis(evidence[0].evidenceRef);
  };
  const [first, second] = await Promise.all([
    runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId),
    runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId),
  ]);
  assert.equal(h.store.snapshots.size, 1);
  assert.equal(h.store.revisions.size, 1);
  assert.equal(first.run.publishedCount + second.run.publishedCount, 1);
  assert.equal(first.run.unchangedCount + second.run.unchangedCount, 1);
});

test("changed analysis configuration permits a new revision from the same snapshot", async () => {
  const h = dependencies();
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  const oldFingerprint = [...h.store.revisions.values()][0].analysisFingerprint;
  h.deps.modelMetadata = createPolicyModelMetadata({
    provider: "fixture",
    model: "fixture-v2-config",
    reasoningEffort: "none",
    timeoutMs: 0,
    maxOutputTokens: 0,
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 1);
  assert.equal(h.store.snapshots.size, 1);
  assert.equal(h.store.revisions.size, 2);
  const revisions = [...h.store.revisions.values()].sort(
    (a, b) => a.revisionNumber - b.revisionNumber
  );
  assert.equal(revisions[0].editorialStatus, "superseded");
  assert.notEqual(revisions[1].analysisFingerprint, oldFingerprint);
});

test("safe redirect final URL becomes item identity and later direct discovery reuses it", async () => {
  const finalUrl = "https://immi.homeaffairs.gov.au/policy/final-canonical";
  const h = dependencies({ acquiredCanonicalUrl: finalUrl });
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  const firstItem = [...h.store.items.values()][0];
  assert.equal(firstItem.canonicalOfficialUrl, finalUrl);
  const directCandidate = {
    ...candidate,
    candidateId: "candidate-final",
    canonicalUrl: finalUrl,
  };
  h.deps.discover = async () => [directCandidate];
  h.deps.acquire = async () => acquisition("same-hash", false, finalUrl);
  const next = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(next.run.unchangedCount, 1);
  assert.equal(h.store.items.size, 1);
  assert.equal([...h.store.items.values()][0].id, firstItem.id);
});

test("unsafe redirect acquisition fails before creating a policy item", async () => {
  const h = dependencies({
    acquire: () => Promise.reject(new Error("redirect_outside_allowed_hosts")),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.failureCount, 1);
  assert.equal(h.store.items.size, 0);
});

test("concurrent first item creation converges without overwriting identity", async () => {
  const store = createInMemoryPolicyIntelligenceRepository();
  const identity = {
    slug: "first-item",
    sourceConfigId: candidate.sourceConfigId,
    sourceId: "first-source",
    canonicalOfficialUrl: candidate.canonicalUrl,
    sourceStatus: "announced" as const,
    editorialStatus: "draft" as const,
  };
  const [first, second] = await Promise.all([
    store.repository.getOrCreateItem(identity),
    store.repository.getOrCreateItem({
      ...identity,
      editorialStatus: "archived",
    }),
  ]);
  assert.equal(store.items.size, 1);
  assert.equal(first.id, second.id);
  assert.equal(second.editorialStatus, "draft");
  assert.throws(
    () =>
      store.repository.getOrCreateItem({
        ...identity,
        sourceId: "different-source",
      }),
    /policy_item_identity_conflict/
  );
});

test("uncertain source status keeps source status separate from editorial review state", async () => {
  const h = dependencies({
    analyze: (e) => ({
      ...analysis(e[0].evidenceRef),
      sourceStatus: {
        id: "source-status",
        value: "in_force",
        certain: false,
        claimRef: "claim-1",
        evidenceRefs: [e[0].evidenceRef],
      },
    }),
  });
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  const item = [...h.store.items.values()][0];
  assert.equal(item.sourceStatus, "announced");
  assert.equal(item.editorialStatus, "review_required");
});
test("fixture sync is repeatable and idempotent with bounded telemetry", async () => {
  const h = dependencies();
  const first = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const again = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(first.run.status, "complete");
  assert.equal(again.run.unchangedCount, 1);
  assert.equal(h.store.runs.size, 2);
  for (const run of h.store.runs.values()) {
    assert.ok(run.discoveredCount <= 10);
    assert.equal(run.mode, "fixture");
  }
});
