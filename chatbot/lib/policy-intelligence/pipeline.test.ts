import assert from "node:assert/strict";
import test from "node:test";
import {
  APICallError,
  JSONParseError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
  TypeValidationError,
} from "ai";
import { z } from "zod";
import type { OfficialSourceAcquisition } from "../../scripts/policy-intelligence-acquisition";
import type { DiscoveryCandidate } from "../../scripts/policy-intelligence-discovery";
import type {
  PolicyAnalysisAttemptContext,
  PolicyAnalysisExecutionResult,
} from "./analysis-diagnostics";
import {
  classifyPolicyAnalysisFailure,
  POLICY_ANALYSIS_RETRY_TIMEOUT_MS,
  POLICY_ANALYSIS_TIMEOUT_MS,
  PolicyAnalysisDiagnosticError,
  withPolicyAnalysisTimeoutRetry,
} from "./analysis-diagnostics";
import {
  evaluatePolicyPublicationDecision,
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
import {
  isCurrentPublishedPolicyRevision,
  isPublishedRevisionStaleAgainstLatestSnapshot,
} from "./currentness";
import { createInMemoryPolicyIntelligenceRepository } from "./memory-repository";
import {
  computePolicyAnalysisFingerprint,
  createPolicyModelMetadata,
  runPolicyIntelligenceSync,
} from "./pipeline";

const now = "2026-09-30T01:00:00.000Z";
const analysisAttemptContext: PolicyAnalysisAttemptContext = {
  evidencePacketCount: 1,
  totalEvidenceChars: 417,
  approximateInputChars: 932,
  modelName: "gpt-5.6-sol",
  reasoningEffort: "high",
};
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
    ) =>
      | PolicyAnalysis
      | PolicyAnalysisExecutionResult<PolicyAnalysis>
      | Promise<PolicyAnalysis | PolicyAnalysisExecutionResult<PolicyAnalysis>>;
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

test("successful unchanged sync runs remain visible in the bounded admin projection", async () => {
  const h = dependencies();
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);

  const [latestRun] = await h.store.adminService.listSourceSyncRuns();
  assert.deepEqual(latestRun, {
    sourceConfigId: candidate.sourceConfigId,
    status: "complete",
    startedAt: now,
    completedAt: now,
    discoveredCount: 1,
    snapshottedCount: 0,
    unchangedCount: 1,
    analyzedCount: 0,
    publishedCount: 0,
    heldCount: 0,
    failureCount: 0,
    safeErrorCode: null,
    // Phase 12 Stage 3 D-072 publication metrics.
    fullAnalysisPublishedCount: 0,
    sourceFirstPublishedCount: 0,
    advisoryCount: 0,
    advisoryReasons: [],
  });
  const [adminItem] = await h.store.adminService.listItems();
  assert.equal(adminItem?.sourceSyncDiagnostic, null);
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
test("an uncertain newer source status publishes honestly instead of a subjective hold", async () => {
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

  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);
  // D-072: status uncertainty is an advisory, never a veto. The newer official
  // source revision is published, the asserted (uncertain) legal force is
  // reported honestly as `unknown`, and the prior revision is superseded.
  const published = [...h.store.revisions.values()].filter(
    (revision) => revision.editorialStatus === "published"
  );
  assert.equal(published.length, 1);
  assert.equal(item.editorialStatus, "published");
  assert.equal(item.sourceStatus, "unknown");
  assert.equal(published[0].snapshotId, item.latestSnapshotId);
  assert.equal(published[0].analysis?.sourceStatus.value, "unknown");
  assert.equal(
    published[0].modelMetadata.advisories?.includes(
      "source_status_recorded_as_uncertain"
    ),
    true
  );
  assert.equal(priorPublished.editorialStatus, "superseded");
  assert.equal(h.store.revisions.has(priorPublishedId), true);
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
  // D-072: the second revision publishes (with the uncertain status reported as
  // unknown) instead of being held for review.
  assert.equal(item.editorialStatus, "published");
  const secondPublished = [...h.store.revisions.values()].find(
    (revision) =>
      revision.editorialStatus === "published" &&
      revision.snapshotId === item.latestSnapshotId
  );
  assert.ok(secondPublished);
  const secondSnapshotId = secondPublished.snapshotId;
  await runPolicyIntelligenceSync(h.deps, candidate.sourceConfigId);

  const currentPublishedId = item.latestPublishedRevisionId;
  assert.ok(currentPublishedId);
  const currentC = h.store.revisions.get(currentPublishedId);
  assert.ok(currentC);
  assert.equal(item.editorialStatus, "published");
  assert.equal(currentC.snapshotId, item.latestSnapshotId);
  assert.equal(currentC.editorialStatus, "published");
  assert.equal(originalPublished.editorialStatus, "superseded");
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
  // A late-arriving held write for an older snapshot must never downgrade the
  // newer published revision or move the published pointer backwards.
  const staleWrite = await h.store.repository.saveHeldRevision({
    itemId: item.id,
    snapshotId: secondSnapshotId,
    contentKind: "ai_analysis",
    schemaVersion: secondPublished.analysis?.schemaVersion ?? "",
    analysisFingerprint: computePolicyAnalysisFingerprint(
      secondSnapshotId,
      alternateMetadata
    ),
    analysis: secondPublished.analysis ?? originalPublished.analysis!,
    verification:
      secondPublished.verification ?? originalPublished.verification!,
    modelMetadata: alternateMetadata,
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

test("provider failure yields a source-first publication that is then enriched by analysis", async () => {
  let attempts = 0;
  const h = dependencies({
    analyze: (evidence) => {
      attempts++;
      if (attempts === 1) {
        // D-073: a recoverable provider failure (timeout/provider class), not
        // an unexpected internal error, is what falls back to a notice.
        throw new DOMException("temporary provider issue", "AbortError");
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
  // D-072: an analyzer outage degrades to an honest source-first publication
  // (never to an empty feed and never to a failed publication) ...
  assert.equal(first.run.failureCount, 0);
  assert.equal(first.run.publishedCount, 1);
  assert.equal(first.run.sourceFirstPublishedCount, 1);
  // ... and the later successful analysis enriches the same item without
  // duplicating the snapshot or erasing the earlier notice.
  assert.equal(second.run.publishedCount, 1);
  assert.equal(second.run.sourceFirstPublishedCount, 0);
  assert.equal(second.run.snapshottedCount, 0);
  assert.equal(h.store.snapshots.size, 1);
  assert.equal(h.store.revisions.size, 2);
  const revisions = [...h.store.revisions.values()];
  assert.equal(
    revisions.filter((revision) => revision.contentKind === "source_first").length,
    1
  );
  assert.equal(
    revisions.filter((revision) => revision.contentKind === "ai_analysis").length,
    1
  );
});

test("malformed analyzer output and schema-invalid analyses publish source-first", async () => {
  const malformed = dependencies({
    analyze: () => ({ schemaVersion: "wrong" }) as unknown as PolicyAnalysis,
  });
  const result = await runPolicyIntelligenceSync(
    malformed.deps,
    candidate.sourceConfigId
  );
  // D-072: malformed output must not hide an authentic official source.
  assert.equal(result.run.failureCount, 0);
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.sourceFirstPublishedCount, 1);
  assert.equal(result.outcomes[0].outcome, "source_first_published");
  assert.equal(result.outcomes[0].reasonCode, "analysis_invalid");
  const [notice] = [...malformed.store.revisions.values()];
  assert.equal(notice.contentKind, "source_first");
  assert.equal(notice.analysis, null);
  assert.equal(notice.verification, null);
  assert.equal(notice.modelMetadata.sourceFirst?.reason, "analysis_invalid");

  const missing = dependencies({
    analyze: (e) =>
      ({
        ...analysis(e[0].evidenceRef),
        executiveSummary: { en: "only English" },
      }) as unknown as PolicyAnalysis,
  });
  const missingResult = await runPolicyIntelligenceSync(
    missing.deps,
    candidate.sourceConfigId
  );
  assert.equal(missingResult.run.publishedCount, 1);
  assert.equal(missingResult.run.sourceFirstPublishedCount, 1);
  assert.equal(missingResult.run.failureCount, 0);
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
test("unknown evidence refs publish the source instead of the unusable analysis", async () => {
  const h = dependencies({ analyze: () => analysis("invented-ref") });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  // D-072: analysis prose that cites unretrieved evidence is never published,
  // but the authentic source update itself still reaches the public page.
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.sourceFirstPublishedCount, 1);
  assert.equal(result.outcomes[0].outcome, "source_first_published");
  assert.equal(result.outcomes[0].reasonCode, "analysis_evidence_mismatch");
  const [notice] = [...h.store.revisions.values()];
  assert.equal(notice.contentKind, "source_first");
  assert.equal(notice.analysis, null);
  assert.equal(
    h.store.adminService.listCompatibilityEntries !== undefined,
    true
  );
});

test("an unsupported decisive claim is withheld while the source still publishes", async () => {
  const h = dependencies({
    verify: (draft) => verification(draft, { "claim-1": "unsupported" }),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  // D-072: every narrative unit depends on claim-1 in this fixture, so the
  // unsupported claim empties the required sections and the item is published
  // as a source-first notice - never as unverified prose and never held.
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.heldCount, 0);
  assert.equal(result.run.failureCount, 0);
  const [revision] = [...h.store.revisions.values()];
  assert.equal(revision.editorialStatus, "published");
  assert.equal(revision.contentKind, "source_first");
  assert.equal(result.outcomes[0].reasonCode, "analysis_unusable");
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
  // D-072: the relevance classification is advisory. Every authentic official
  // source update publishes, and each classification is recorded for review.
  for (const result of results) {
    assert.equal(result.run.publishedCount, 1);
    assert.equal(result.run.heldCount, 0);
    assert.equal(result.run.failureCount, 0);
  }
  assert.equal(
    operational.store.items.values().next().value?.editorialStatus,
    "published"
  );
  const [operationalRevision] = [
    ...operational.store.revisions.values(),
  ];
  assert.equal(
    operationalRevision.modelMetadata.advisories?.includes(
      "publication_eligibility_operational_notice"
    ),
    true
  );
  // An uncertain classification is a recorded advisory, never a veto.
  const [uncertainRevision] = [...uncertain.store.revisions.values()];
  assert.equal(uncertainRevision.contentKind, "ai_analysis");
  assert.equal(
    uncertainRevision.modelMetadata.advisories?.includes(
      "publication_eligibility_uncertain"
    ),
    true
  );
  // Verifier disagreement with the classification does not remove the update.
  const [unsupportedRevision] = [...unsupported.store.revisions.values()];
  assert.equal(unsupportedRevision.contentKind, "ai_analysis");
  assert.equal(
    unsupportedRevision.modelMetadata.advisories?.includes(
      "publication_eligibility_not_verified"
    ),
    true
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
  // D-072: structurally incomplete verification makes the analysis prose
  // unusable, so the source publishes as a source-first notice; an unsupported
  // uncertainty unit is withheld from the analysis. Neither is a failed
  // publication and neither is a subjective hold.
  assert.equal(missing.run.publishedCount, 1);
  assert.equal(missing.run.sourceFirstPublishedCount, 1);
  assert.equal(missing.run.failureCount, 0);
  assert.equal(missing.run.heldCount, 0);
  assert.equal(unsupported.run.publishedCount, 1);
  assert.equal(unsupported.run.failureCount, 0);
  assert.equal(unsupported.run.heldCount, 0);
});

test("an unsupported narrative addition is withheld while the source publishes", async () => {
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
    verify: (draft) =>
      verification(draft, { "change-1": "unsupported" }),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  // D-072: the unsupported addition is withheld; the item is never held for
  // review solely because the verifier disagreed with one narrative unit.
  assert.equal(result.run.heldCount, 0);
  assert.equal(result.run.failureCount, 0);
  assert.equal(result.run.publishedCount, 1);
  const [revision] = [...h.store.revisions.values()];
  assert.equal(revision.editorialStatus, "published");
  assert.equal(
    revision.modelMetadata.withheld?.some(
      (entry) => entry.unitId === "change-1" && entry.reasonCode === "unsupported_narrative_unit"
    ),
    true
  );
  if (revision.analysis) {
    // The withheld unit is absent from the published analysis.
    assert.equal(
      revision.analysis.keyChanges.some((unit) => unit.id === "change-1"),
      false
    );
  }
});

test("a scope-shifting narrative unit is withheld while the source publishes", async () => {
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
              en: "Visa applications are prioritized; applicants are priority recipients.",
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

  // D-072: the scope-shifting unit is withheld from the published analysis and
  // the official source update still publishes; nothing is held for review.
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.heldCount, 0);
  assert.equal(result.run.failureCount, 0);
  const [revision] = [...h.store.revisions.values()];
  assert.equal(revision.editorialStatus, "published");
  assert.equal(
    revision.modelMetadata.withheld?.some((entry) => entry.unitId === "change-1"),
    true
  );
});

test("inferred applicant impact can publish only as a qualified practical interpretation", async () => {
  const uncertainty = {
    "zh-CN": "来源没有明确说明相关申请人都会获得优先处理。",
    en: "The source does not establish that associated applicants will receive priority.",
  };
  const h = dependencies({
    analyze: (e) => {
      const draft = analysis(e[0].evidenceRef);
      return {
        ...draft,
        keyChanges: [
          {
            ...draft.keyChanges[0],
            kind: "practical_interpretation",
            text: {
              "zh-CN": "优先处理这些申请可能影响相关申请人的等待时间。",
              en: "Prioritizing these applications may affect associated applicants' waiting times.",
              claimRefs: ["claim-2"],
              uncertainty,
            },
          },
        ],
        materialClaims: [
          ...draft.materialClaims,
          {
            id: "claim-2",
            kind: "practical_interpretation",
            decisive: false,
            conditional: true,
            text: {
              "zh-CN": "优先处理这些申请可能影响相关申请人的等待时间。",
              en: "Prioritizing these applications may affect associated applicants' waiting times.",
            },
            uncertainty,
            evidenceRefs: [e[0].evidenceRef],
          },
        ],
      };
    },
    verify: (draft) =>
      verification(draft, { "claim-2": "partial", "change-1": "partial" }),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );

  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.heldCount, 0);
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

  // D-072: truncation is bounded-acquisition metadata, never a veto. The
  // decision publishes the full analysis and never reports it as blocked.
  const truncatedAnalysis = analysis(`policy-snapshot:${snapshot.id}`);
  const decision = evaluatePolicyPublicationDecision({
    analysis: truncatedAnalysis,
    verification: verification(truncatedAnalysis),
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
  });
  assert.equal(decision.mode, "full_analysis");
  assert.deepEqual(decision.blockers, []);
  assert.equal(decision.advisories.includes("source_evidence_truncated"), false);
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
      contentKind: "ai_analysis",
      schemaVersion: draft.schemaVersion,
    }),
    store.repository.publishRevision({
      ...revisionInput,
      contentKind: "ai_analysis",
      schemaVersion: draft.schemaVersion,
    }),
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
        contentKind: "ai_analysis",
        schemaVersion: POLICY_ANALYSIS_SCHEMA,
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

test("verifier reason-code contradictions are normalized without changing support", () => {
  const draft = analysis("policy-snapshot:contradiction");
  const bad = verification(draft);
  bad.assessments[0] = {
    ...bad.assessments[0],
    verdict: "supported",
    reasonCode: "contradicted",
  };
  const normalized = validatePolicyVerification(
    bad,
    draft,
    new Set(["policy-snapshot:contradiction"])
  );
  assert.equal(normalized.assessments[0].verdict, "supported");
  assert.equal(normalized.assessments[0].reasonCode, "direct_support");

  const disallowedPartial = verification(draft);
  disallowedPartial.assessments[0] = {
    ...disallowedPartial.assessments[0],
    verdict: "partial",
    reasonCode: "qualified_support",
  };
  const failClosed = validatePolicyVerification(
    disallowedPartial,
    draft,
    new Set(["policy-snapshot:contradiction"])
  );
  assert.equal(failClosed.assessments[0].verdict, "unsupported");
  assert.equal(failClosed.assessments[0].reasonCode, "unclear");
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
  const decision = evaluatePolicyPublicationDecision({
    analysis: conditional,
    verification: verification(conditional, {
      "claim-1": "partial",
      "impact-1": "partial",
    }),
    evidence,
  });
  assert.equal(decision.mode, "full_analysis");
  assert.deepEqual(decision.withheld, []);
  const stripped = policyAnalysisSchema.parse({
    ...conditional,
    materialClaims: [
      { ...conditional.materialClaims[0], uncertainty: null },
      conditional.materialClaims[1],
    ],
  });
  // D-072: a partially supported conditional claim without its bilingual
  // qualification is withheld from publication (never published as certain and
  // never a whole-item veto).
  const strippedDecision = evaluatePolicyPublicationDecision({
    analysis: stripped,
    verification: verification(stripped, { "claim-1": "partial" }),
    evidence,
  });
  assert.equal(
    strippedDecision.withheld.some(
      (entry) =>
        entry.unitId === "claim-1" &&
        entry.reasonCode === "partial_claim_missing_bilingual_uncertainty"
    ),
    true
  );
  assert.notEqual(strippedDecision.mode, "blocked");
});
test("a recoverable verifier provider failure publishes the source safely", async () => {
  const h = dependencies({
    verify: () => {
      // A provider outage (abort/timeout class) is recoverable; D-073 keeps the
      // source-first fallback for it, while unexpected internal errors fail.
      throw new DOMException(
        "provider failed https://secret.example/?key=do-not-log",
        "AbortError"
      );
    },
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  // D-072: an unavailable verifier must not withhold the authentic source.
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.sourceFirstPublishedCount, 1);
  assert.equal(result.run.failureCount, 0);
  assert.equal(result.outcomes[0].reasonCode, "verification_unavailable");
  // Raw provider text is still never stored; only safe codes are recorded.
  assert.doesNotMatch(JSON.stringify(result.run), /secret|key=|https:/i);
  assert.doesNotMatch(
    JSON.stringify([...h.store.revisions.values()]),
    /secret|key=|https:/i
  );
});

test("analysis failure after snapshot publishes source-first with item and snapshot context", async () => {
  const h = dependencies({
    analyze: () => {
      throw new DOMException(
        "provider timeout with private response",
        "AbortError"
      );
    },
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  // D-072: the analyzer outage is recorded as an advisory warning with exact
  // item/snapshot context, and the official source is published source-first.
  assert.equal(result.run.failureCount, 0);
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.sourceFirstPublishedCount, 1);
  const warning = result.run.candidateWarnings.find(
    (entry) => entry.reasonCode === "provider_timeout"
  );
  assert.ok(warning);
  assert.equal(warning.itemId, "fixture-1");
  assert.equal(warning.snapshotId, "fixture-2");
  assert.equal(warning.sourceConfigId, candidate.sourceConfigId);
  assert.equal(warning.stage, "analysis");
  assert.equal(
    warning.message,
    "The analysis provider exceeded its configured timeout during source sync."
  );
  assert.equal(warning.timestamp, now);
  const [revision] = [...h.store.revisions.values()];
  assert.equal(revision.contentKind, "source_first");
  assert.equal(revision.modelMetadata.sourceFirst?.reason, "analysis_unavailable");
  const [adminItem] = await h.store.adminService.listItems();
  assert.equal(adminItem.publicationDiagnostics.published, true);
});

test("an unexpected verifier internal error remains a genuine failure", async () => {
  const h = dependencies({
    verify: () => {
      throw new Error("verifier internal error");
    },
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  // D-073: an unexpected internal error must not be silently converted into a
  // normal fallback publication.
  assert.equal(result.run.failureCount, 1);
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.run.sourceFirstPublishedCount, 0);
  assert.equal(result.run.candidateFailures[0].stage, "verification");
  assert.equal(result.run.candidateFailures[0].errorCode, "pipeline_error");
  assert.equal(
    result.run.candidateFailures[0].message,
    "The analysis could not be verified."
  );
  assert.equal(h.store.revisions.size, 0);
});

test("unknown candidate exception is sanitized and does not leak secrets", async () => {
  const secret = "sk-live-secret-token-123";
  const h = dependencies({
    analyze: () => {
      throw new Error(
        `provider response ${secret} https://private.example/?api_key=${secret}`
      );
    },
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const serialized = JSON.stringify({
    run: result.run,
    outcomes: result.outcomes,
  });
  // D-073: an unexpected internal error is a genuine engineering failure, not
  // normal AI unavailability; it is recorded with a safe message and never
  // converted into a fallback publication.
  assert.equal(
    result.run.candidateFailures[0].errorCode,
    "analysis_internal_error"
  );
  assert.equal(
    result.run.candidateFailures[0].message,
    "An internal error prevented policy analysis from completing."
  );
  assert.equal(result.run.failureCount, 1);
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.run.sourceFirstPublishedCount, 0);
  assert.doesNotMatch(
    serialized,
    /sk-live-secret-token|private\.example|api_key/i
  );
});

test("analysis abort and timeout errors receive safe provider_timeout diagnostics", async () => {
  const aborted = dependencies({
    analyze: () => {
      throw new DOMException("sensitive request detail", "AbortError");
    },
  });
  const abortedResult = await runPolicyIntelligenceSync(
    aborted.deps,
    candidate.sourceConfigId
  );
  // D-072: the classification is unchanged but is recorded as an advisory
  // warning; the official source still publishes source-first.
  assert.equal(abortedResult.run.failureCount, 0);
  assert.equal(abortedResult.run.sourceFirstPublishedCount, 1);
  assert.equal(
    abortedResult.run.candidateWarnings.some(
      (warning) => warning.reasonCode === "provider_timeout"
    ),
    true
  );

  const sdkAbort = new RetryError({
    message: "private retry detail",
    reason: "abort",
    errors: [new Error("private provider detail")],
  });
  const timedOut = dependencies({ analyze: () => Promise.reject(sdkAbort) });
  const timeoutResult = await runPolicyIntelligenceSync(
    timedOut.deps,
    candidate.sourceConfigId
  );
  assert.equal(
    timeoutResult.run.candidateWarnings.some(
      (warning) => warning.reasonCode === "provider_timeout"
    ),
    true
  );
  assert.equal(timeoutResult.run.sourceFirstPublishedCount, 1);
});

test("AI SDK structured-output errors are classified without storing model text", async () => {
  const rawModelText = "private raw model output with token sk-private-123";
  const error = new NoObjectGeneratedError({
    cause: new JSONParseError({
      text: rawModelText,
      cause: new Error("parse detail"),
    }),
    text: rawModelText,
    response: {} as never,
    usage: {} as never,
    finishReason: "stop",
  });
  const h = dependencies({ analyze: () => Promise.reject(error) });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  // D-072: classified as a warning, published source-first, never failed.
  const warning = result.run.candidateWarnings.find(
    (entry) => entry.reasonCode === "structured_output_error"
  );
  assert.ok(warning);
  assert.equal(result.run.failureCount, 0);
  assert.equal(result.run.sourceFirstPublishedCount, 1);
  assert.doesNotMatch(
    JSON.stringify(result.run),
    /private raw model output|sk-private-123/
  );
});

test("Zod and AI SDK type validation errors map to schema_validation_error", async () => {
  let zodError: unknown;
  try {
    z.object({ title: z.string() }).parse({ title: 42 });
  } catch (error) {
    zodError = error;
  }
  const zodFailure = dependencies({ analyze: () => Promise.reject(zodError) });
  const zodResult = await runPolicyIntelligenceSync(
    zodFailure.deps,
    candidate.sourceConfigId
  );
  assert.equal(
    zodResult.run.candidateWarnings.some(
      (warning) => warning.reasonCode === "schema_validation_error"
    ),
    true
  );
  assert.equal(zodResult.run.sourceFirstPublishedCount, 1);

  const typeError = TypeValidationError.wrap({
    value: "private model output",
    cause: new Error("private validation detail"),
  });
  const typedFailure = dependencies({
    analyze: () => Promise.reject(typeError),
  });
  const typedResult = await runPolicyIntelligenceSync(
    typedFailure.deps,
    candidate.sourceConfigId
  );
  assert.equal(
    typedResult.run.candidateWarnings.some(
      (warning) => warning.reasonCode === "schema_validation_error"
    ),
    true
  );
  assert.equal(typedResult.run.sourceFirstPublishedCount, 1);
});

test("provider and empty-output failures are classified by AI SDK error types", async () => {
  const providerError = new APICallError({
    message: "private response body and key=secret",
    url: "https://provider.invalid/private",
    requestBodyValues: { prompt: "private prompt" },
    responseBody: "private raw provider response",
    statusCode: 503,
  });
  const providerFailure = dependencies({
    analyze: async () =>
      await withPolicyAnalysisTimeoutRetry(
        async () => Promise.reject(providerError),
        90_000,
        analysisAttemptContext
      ),
  });
  const providerResult = await runPolicyIntelligenceSync(
    providerFailure.deps,
    candidate.sourceConfigId
  );
  const providerJson = JSON.stringify(providerResult.run);
  // D-072: recorded as a warning with the same classification; the source
  // still publishes and no failure is reported.
  assert.equal(
    providerResult.run.candidateWarnings.some(
      (warning) => warning.reasonCode === "provider_error"
    ),
    true
  );
  assert.equal(providerResult.run.failureCount, 0);
  assert.equal(providerResult.run.sourceFirstPublishedCount, 1);
  assert.equal(
    providerResult.run.analysisAttempts[0].outcome,
    "provider_error"
  );
  assert.doesNotMatch(
    providerJson,
    /provider\.invalid|private prompt|private raw provider|secret|Official evidence version|Analyze these official-source snapshots/
  );

  const emptyFailure = dependencies({
    analyze: async () =>
      await withPolicyAnalysisTimeoutRetry(
        async () => Promise.reject(new NoOutputGeneratedError()),
        90_000,
        analysisAttemptContext
      ),
  });
  const emptyResult = await runPolicyIntelligenceSync(
    emptyFailure.deps,
    candidate.sourceConfigId
  );
  assert.equal(
    emptyResult.run.candidateWarnings.some(
      (warning) => warning.reasonCode === "empty_model_output"
    ),
    true
  );
  assert.equal(
    emptyResult.run.analysisAttempts[0].outcome,
    "empty_model_output"
  );
  assert.equal(emptyResult.run.sourceFirstPublishedCount, 1);
});

test("analysis provider uses one call when the first attempt succeeds", async () => {
  assert.equal(POLICY_ANALYSIS_TIMEOUT_MS, 90_000);
  const calls: number[] = [];
  const h = dependencies({
    analyze: async (evidence) =>
      await withPolicyAnalysisTimeoutRetry(
        async (timeoutMs) => {
          calls.push(timeoutMs);
          return analysis(evidence[0].evidenceRef);
        },
        90_000,
        analysisAttemptContext
      ),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.deepEqual(calls, [90_000]);
  assert.equal(result.run.publishedCount, 1);
  assert.equal(h.calls().verifyCalls, 1);
  assert.equal(result.run.analysisAttempts.length, 1);
  assert.equal(result.run.analysisAttempts[0].attemptNumber, 1);
  assert.equal(result.run.analysisAttempts[0].outcome, "success");
  assert.equal(typeof result.run.analysisAttempts[0].elapsedMs, "number");
  assert.equal(result.run.analysisAttempts[0].totalEvidenceChars, 417);
  assert.equal(result.run.analysisAttempts[0].approximateInputChars, 932);
  const [adminItem] = await h.store.adminService.listItems();
  assert.equal(adminItem.analysisAttempts.length, 1);
  assert.equal(adminItem.analysisAttempts[0].modelName, "gpt-5.6-sol");
});

test("analysis timeout retries once at 120 seconds then continues the pipeline", async () => {
  assert.equal(POLICY_ANALYSIS_RETRY_TIMEOUT_MS, 120_000);
  const calls: number[] = [];
  const h = dependencies({
    analyze: async (evidence) =>
      await withPolicyAnalysisTimeoutRetry(
        async (timeoutMs) => {
          calls.push(timeoutMs);
          if (calls.length === 1) {
            throw classifyPolicyAnalysisFailure(
              new DOMException("private source-related detail", "AbortError"),
              true
            );
          }
          return analysis(evidence[0].evidenceRef);
        },
        90_000,
        analysisAttemptContext
      ),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.deepEqual(calls, [90_000, 120_000]);
  assert.equal(result.run.publishedCount, 1);
  assert.deepEqual(result.run.candidateFailures, []);
  assert.deepEqual(
    result.run.analysisAttempts.map(
      ({ attemptNumber, timeoutSeconds, outcome }) => ({
        attemptNumber,
        timeoutSeconds,
        outcome,
      })
    ),
    [
      { attemptNumber: 1, timeoutSeconds: 90, outcome: "provider_timeout" },
      { attemptNumber: 2, timeoutSeconds: 120, outcome: "success" },
    ]
  );
  assert.equal(result.run.analysisAttempts[1].elapsedMs >= 0, true);
  assert.equal(h.calls().verifyCalls, 1);
});

test("a repeated analysis timeout publishes source-first and records attempt telemetry", async () => {
  const calls: number[] = [];
  const h = dependencies({
    analyze: async () =>
      await withPolicyAnalysisTimeoutRetry(
        async (timeoutMs) => {
          calls.push(timeoutMs);
          throw classifyPolicyAnalysisFailure(
            new DOMException("secret and raw provider response", "AbortError"),
            true
          );
        },
        90_000,
        analysisAttemptContext
      ),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  // D-072: the retry policy is unchanged (one retry at 120s), and a repeated
  // timeout now degrades to a source-first publication instead of an empty feed.
  assert.deepEqual(calls, [90_000, 120_000]);
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.sourceFirstPublishedCount, 1);
  assert.equal(result.run.failureCount, 0);
  assert.deepEqual(
    result.run.analysisAttempts.map((attempt) => attempt.outcome),
    ["provider_timeout", "provider_timeout"]
  );
  assert.deepEqual(
    result.run.analysisAttempts.map((attempt) => attempt.timeoutSeconds),
    [90, 120]
  );
  assert.doesNotMatch(
    JSON.stringify(result.run),
    /secret|raw provider response/
  );
  assert.equal(h.store.snapshots.size, 1);
  assert.equal(h.store.revisions.size, 1);
  const [revision] = [...h.store.revisions.values()];
  assert.equal(revision.contentKind, "source_first");
  const [adminItem] = await h.store.adminService.listItems();
  assert.deepEqual(
    adminItem.analysisAttempts.map((attempt) => attempt.timeoutSeconds),
    [90, 120]
  );
});

test("source-wide timeout stays separate from a successful item's publication diagnostics", async () => {
  const secondCandidate: DiscoveryCandidate = {
    ...candidate,
    candidateId: "candidate-2",
    canonicalUrl: "https://immi.homeaffairs.gov.au/policy/another-example",
  };
  let analysisCount = 0;
  const h = dependencies({
    analyze: async (evidence) => {
      analysisCount += 1;
      if (analysisCount === 2) {
        return await withPolicyAnalysisTimeoutRetry(
          async () => {
            throw classifyPolicyAnalysisFailure(
              new DOMException("private provider payload", "AbortError"),
              true
            );
          },
          90_000,
          analysisAttemptContext
        );
      }
      return analysis(evidence[0].evidenceRef);
    },
  });
  h.deps.discover = async () => [candidate, secondCandidate];

  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  // D-072: both candidates publish (one full analysis, one source-first); the
  // source-wide timeout stays a source-scoped diagnostic and never becomes an
  // item-level failure or a held publication.
  assert.equal(result.run.publishedCount, 2);
  assert.equal(result.run.sourceFirstPublishedCount, 1);
  assert.equal(result.run.failureCount, 0);
  const items = await h.store.adminService.listItems();
  const publishedItems = items.filter(
    (item) => item.editorialStatus === "published"
  );
  assert.equal(publishedItems.length, 2);
  for (const item of publishedItems) {
    assert.deepEqual(item.pipelineFailures, []);
    assert.equal(item.publicationDiagnostics.published, true);
    assert.equal(
      item.publicationDiagnostics.reasons.some(
        ({ reasonCode }) => reasonCode === "provider_timeout"
      ),
      false
    );
  }
  assert.equal(result.run.failureCount, 0);
  assert.equal(result.run.sourceFirstPublishedCount, 1);
  assert.doesNotMatch(
    JSON.stringify(result.run),
    /private provider payload|official-source snapshots|經來源核實/
  );
});

test("only the analysis timeout retries; other failures and unrelated aborts do not", async () => {
  let schemaError: unknown;
  try {
    z.object({ value: z.string() }).parse({ value: 7 });
  } catch (error) {
    schemaError = error;
  }
  const structuredError = new NoObjectGeneratedError({
    cause: new JSONParseError({
      text: "private model text",
      cause: new Error("private parse detail"),
    }),
    text: "private model text",
    response: {} as never,
    usage: {} as never,
    finishReason: "stop",
  });
  const providerError = new APICallError({
    message: "private provider message",
    url: "https://provider.invalid/secret",
    requestBodyValues: { prompt: "private prompt" },
    responseBody: "private provider response",
    statusCode: 503,
  });
  const cases = [
    { error: schemaError, code: "schema_validation_error" },
    { error: structuredError, code: "structured_output_error" },
    { error: providerError, code: "provider_error" },
    {
      error: new DOMException("unrelated abort", "AbortError"),
      code: "provider_timeout",
    },
    {
      error: new Error("private unknown source content"),
      code: "analysis_internal_error",
    },
  ] as const;

  for (const entry of cases) {
    let calls = 0;
    await assert.rejects(
      withPolicyAnalysisTimeoutRetry(
        async () => {
          calls += 1;
          throw entry.error;
        },
        90_000,
        analysisAttemptContext
      ),
      (error: unknown) =>
        error instanceof PolicyAnalysisDiagnosticError &&
        error.errorCode === entry.code
    );
    assert.equal(calls, 1);
  }
});

test("successful candidate retains publication behavior without failure diagnostics", async () => {
  const h = dependencies();
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 1);
  assert.deepEqual(result.run.candidateFailures, []);
  assert.deepEqual(result.run.analysisAttempts, []);
  const [adminItem] = await h.store.adminService.listItems();
  assert.deepEqual(adminItem.pipelineFailures, []);
});

test("malformed verifier claim sets publish source-first instead of failing", async () => {
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
  // D-072: unusable verification withholds the analysis prose, not the update.
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.sourceFirstPublishedCount, 1);
  assert.equal(result.run.failureCount, 0);
  assert.equal(result.outcomes[0].reasonCode, "verification_unusable");
  const [revision] = [...h.store.revisions.values()];
  assert.equal(revision.contentKind, "source_first");
});

test("source status is independently assessed and announced status may publish", async () => {
  const h = dependencies();
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const revision = [...h.store.revisions.values()][0];
  assert.equal(result.run.publishedCount, 1);
  assert.deepEqual(revision.analysis?.sourceStatus.value, "announced");
  assert.deepEqual(
    revision.verification?.assessments.find(
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

test("official published guidance may publish without asserting legislative force", async () => {
  const h = dependencies({
    analyze: (evidence) => {
      const draft = analysis(evidence[0].evidenceRef);
      return {
        ...draft,
        sourceStatus: { ...draft.sourceStatus, value: "published_guidance" },
        materialClaims: draft.materialClaims.map((claim) => ({
          ...claim,
          text: {
            "zh-CN": "移民局已发布此官方指引。",
            en: "The Department has published this official guidance.",
          },
        })),
      };
    },
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const revision = [...h.store.revisions.values()][0];

  assert.equal(result.run.publishedCount, 1);
  assert.equal(revision.analysis?.sourceStatus.value, "published_guidance");
  assert.equal(revision.analysis?.sourceStatus.certain, true);
  assert.equal(revision.analysis?.sourceStatus.claimRef, "claim-1");
  assert.equal(POLICY_ANALYSIS_SCHEMA, "policy-intelligence.analysis.v2");
});

test("directly supported Federal Register in-force status remains publishable", async () => {
  const federalCandidate: DiscoveryCandidate = {
    ...candidate,
    candidateId: "federal-register-candidate",
    sourceConfigId: "federal-register-legislation",
    authority: "Federal Register of Legislation",
    canonicalUrl: "https://www.legislation.gov.au/C2026A00001/latest/text",
    discoveryStrategy: "federal_register_api",
  };
  const h = dependencies({
    discoveredCandidate: federalCandidate,
    acquire: async (selected) => ({
      ...acquisition("federal-register-hash", false, selected.canonicalUrl),
      sourceConfigId: selected.sourceConfigId,
      authority: selected.authority,
      normalizedEvidence: "The Act is in force.",
    }),
    analyze: (evidence) => {
      const draft = analysis(evidence[0].evidenceRef);
      return {
        ...draft,
        sourceStatus: { ...draft.sourceStatus, value: "in_force" },
        materialClaims: draft.materialClaims.map((claim) => ({
          ...claim,
          text: {
            "zh-CN": "该法案现已生效。",
            en: "The Act is in force.",
          },
        })),
      };
    },
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    federalCandidate.sourceConfigId
  );
  const revision = [...h.store.revisions.values()][0];

  assert.equal(result.run.publishedCount, 1);
  assert.equal(revision.analysis?.sourceStatus.value, "in_force");
  assert.equal(
    revision.verification?.assessments.find(
      (assessment) => assessment.unitId === "source-status"
    )?.verdict,
    "supported"
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
      item,
      revision,
      snapshot: { ...snapshot, id: "different-snapshot" },
    }),
    false
  );
  // A newer captured snapshot no longer removes the published revision
  // (Stage 3 fix); the mismatch is reported as a currentness signal instead.
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: { ...item, latestSnapshotId: "a-newer-snapshot" },
      revision,
      snapshot,
    }),
    true
  );
  assert.equal(
    isPublishedRevisionStaleAgainstLatestSnapshot({
      item: { ...item, latestSnapshotId: "a-newer-snapshot" },
      revision,
    }),
    true
  );
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: { ...item, editorialStatus: "archived" },
      revision,
      snapshot,
    }),
    false
  );
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item: { ...item, latestPublishedRevisionId: "a-different-revision" },
      revision,
      snapshot,
    }),
    false
  );
});

test("an unsupported in-force status is reported as unknown instead of blocking", async () => {
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
    revision.verification?.assessments.find((unit) => unit.unitId === "claim-1")
      ?.verdict,
    "supported"
  );
  // D-072: the unsupported legal force is never asserted; the published status
  // is the honest `unknown` and the update still publishes.
  assert.equal(revision.analysis?.sourceStatus.value, "unknown");
  assert.equal(revision.analysis?.sourceStatus.certain, false);
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.heldCount, 0);
  assert.equal(
    revision.modelMetadata.advisories?.includes("source_status_not_verified"),
    true
  );
});

test("an unsupported source status publishes with honest unknown status", async () => {
  const h = dependencies({
    verify: (draft) => verification(draft, { "source-status": "unsupported" }),
  });
  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const [revision] = [...h.store.revisions.values()];
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.heldCount, 0);
  assert.equal(result.run.failureCount, 0);
  assert.equal(revision.analysis?.sourceStatus.value, "unknown");
  assert.equal(
    revision.modelMetadata.advisories?.includes("source_status_not_verified"),
    true
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
    [...h.store.revisions.values()][0].analysis?.uncertainties.length,
    0
  );
  assert.equal(
    [...h.store.revisions.values()][0].analysis?.recommendedActions.length,
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
  assert.equal(metadata.analyzerVersion, "policy-intelligence.analyzer.v2.3");
  assert.equal(metadata.verifierVersion, "policy-intelligence.verifier.v2.3");
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
  const previousMetadata = {
    ...metadata,
    analyzerVersion: "policy-intelligence.analyzer.v2.1",
    verifierVersion: "policy-intelligence.verifier.v2.1",
  };
  const changedAnalyzer = {
    ...previousMetadata,
    analyzerVersion: "policy-intelligence.analyzer.v2.3",
  };
  const changedVerifier = {
    ...previousMetadata,
    verifierVersion: "policy-intelligence.verifier.v2.3",
  };
  const base = computePolicyAnalysisFingerprint(
    "same-snapshot",
    previousMetadata
  );
  assert.notEqual(
    computePolicyAnalysisFingerprint("same-snapshot", metadata),
    base
  );
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

test("v2.3 reanalyzes the same snapshot captured under v2.1", async () => {
  const h = dependencies();
  const currentMetadata = h.deps.modelMetadata;
  h.deps.modelMetadata = {
    ...currentMetadata,
    analyzerVersion: "policy-intelligence.analyzer.v2.1",
    verifierVersion: "policy-intelligence.verifier.v2.1",
  };

  const first = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const oldRevision = [...h.store.revisions.values()][0];
  const snapshotId = oldRevision.snapshotId;
  assert.equal(first.run.publishedCount, 1);
  assert.equal(h.store.snapshots.size, 1);
  assert.deepEqual(h.calls(), { analyzeCalls: 1, verifyCalls: 1 });

  h.deps.modelMetadata = currentMetadata;
  const second = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const revisions = [...h.store.revisions.values()].sort(
    (left, right) => left.revisionNumber - right.revisionNumber
  );

  assert.equal(second.run.publishedCount, 1);
  assert.equal(second.run.snapshottedCount, 0);
  assert.equal(second.run.unchangedCount, 1);
  assert.equal(h.store.snapshots.size, 1);
  assert.equal([...h.store.snapshots.values()][0].contentHash, "same-hash");
  assert.equal(h.store.revisions.size, 2);
  assert.equal(revisions[0].snapshotId, snapshotId);
  assert.equal(revisions[1].snapshotId, snapshotId);
  assert.notEqual(
    revisions[0].analysisFingerprint,
    revisions[1].analysisFingerprint
  );
  assert.equal(
    revisions[0].modelMetadata.analyzerVersion,
    "policy-intelligence.analyzer.v2.1"
  );
  assert.equal(
    revisions[0].modelMetadata.verifierVersion,
    "policy-intelligence.verifier.v2.1"
  );
  assert.equal(
    revisions[1].modelMetadata.analyzerVersion,
    "policy-intelligence.analyzer.v2.3"
  );
  assert.equal(
    revisions[1].modelMetadata.verifierVersion,
    "policy-intelligence.verifier.v2.3"
  );
  assert.deepEqual(h.calls(), { analyzeCalls: 2, verifyCalls: 2 });
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
  // D-072: an uncertain status is published honestly as `unknown` with an
  // advisory (never silently asserted as in force, and never a review hold).
  assert.equal(item.sourceStatus, "unknown");
  assert.equal(item.editorialStatus, "published");
  const [revision] = [...h.store.revisions.values()];
  assert.equal(revision.analysis?.sourceStatus.value, "unknown");
  assert.equal(revision.analysis?.sourceStatus.certain, false);
  assert.equal(
    revision.modelMetadata.advisories?.includes(
      "source_status_recorded_as_uncertain"
    ),
    true
  );
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
test("archived published items disappear publicly, retain history, suppress sync, and restore for future publication", async () => {
  const h = dependencies({ hashes: ["archive-baseline", "post-restore"] });
  const first = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(first.run.publishedCount, 1);

  const item = [...h.store.items.values()][0];
  assert.ok(item);
  const oldRevision = h.store.revisions.get(
    item.latestPublishedRevisionId ?? ""
  );
  const oldSnapshot = oldRevision
    ? h.store.snapshots.get(oldRevision.snapshotId)
    : undefined;
  assert.ok(oldRevision);
  assert.ok(oldSnapshot);
  const historyCounts = {
    snapshots: h.store.snapshots.size,
    revisions: h.store.revisions.size,
  };
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item,
      revision: oldRevision,
      snapshot: oldSnapshot,
    }),
    true
  );

  const archived = await h.store.adminService.updateItem(item.id, "archive");
  assert.deepEqual(archived, {
    status: "updated",
    editorialStatus: "archived",
  });
  assert.equal(
    isCurrentPublishedPolicyRevision({
      item,
      revision: oldRevision,
      snapshot: oldSnapshot,
    }),
    false
  );
  assert.deepEqual(
    { snapshots: h.store.snapshots.size, revisions: h.store.revisions.size },
    historyCounts
  );

  const suppressed = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(suppressed.run.failureCount, 0);
  assert.equal(suppressed.run.publishedCount, 0);
  assert.deepEqual(suppressed.outcomes, [
    {
      candidateId: candidate.candidateId,
      outcome: "suppressed",
      reasonCode: "item_archived",
    },
  ]);
  assert.equal(item.editorialStatus, "archived");
  assert.deepEqual(
    { snapshots: h.store.snapshots.size, revisions: h.store.revisions.size },
    historyCounts
  );
  assert.deepEqual(h.calls(), { analyzeCalls: 1, verifyCalls: 1 });

  const restored = await h.store.adminService.updateItem(item.id, "restore");
  assert.deepEqual(restored, {
    status: "updated",
    editorialStatus: "published",
  });
  const republished = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  assert.equal(republished.run.publishedCount, 1);
  assert.equal(item.editorialStatus, "published");
  assert.equal(h.store.revisions.size, historyCounts.revisions + 1);
});

test("archive during in-flight analysis cannot be undone by publication", async () => {
  const h = dependencies();
  h.deps.analyzer.analyze = ({ evidence }) => {
    const item = [...h.store.items.values()][0];
    assert.ok(item);
    item.editorialStatus = "archived";
    return analysis(evidence[0].evidenceRef);
  };

  const result = await runPolicyIntelligenceSync(
    h.deps,
    candidate.sourceConfigId
  );
  const item = [...h.store.items.values()][0];
  assert.ok(item);
  assert.equal(item.editorialStatus, "archived");
  assert.equal(result.run.failureCount, 0);
  assert.equal(result.run.publishedCount, 0);
  assert.deepEqual(result.outcomes[0], {
    candidateId: candidate.candidateId,
    outcome: "suppressed",
    reasonCode: "item_archived",
  });
  assert.equal(h.store.snapshots.size, 1);
  assert.equal(h.store.revisions.size, 0);
});
