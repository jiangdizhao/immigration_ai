import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import type { OfficialSourceAcquisition } from "../../scripts/policy-intelligence-acquisition";
import type { DiscoveryCandidate } from "../../scripts/policy-intelligence-discovery";
import {
  deriveSourceFirstSourceStatus,
  evaluatePolicyPublicationDecision,
  POLICY_ANALYSIS_SCHEMA,
  POLICY_SOURCE_FIRST_SCHEMA,
  POLICY_VERIFICATION_SCHEMA,
  type PolicyAnalysis,
  type PolicyEvidencePacketItem,
  type PolicyVerification,
  policyAnalysisSchema,
  validatePolicyVerification,
} from "./contracts";
import { createInMemoryPolicyIntelligenceRepository } from "./memory-repository";
import {
  computePolicyAnalysisFingerprint,
  createPolicyModelMetadata,
  runPolicyIntelligenceSync,
} from "./pipeline";
import { buildAdminSourceSyncPublicationMetrics } from "./publication-diagnostics";
import { boundedOfficialExcerpt, excerptLanguage } from "./source-first";

/**
 * Phase 12 Stage 3 D-072 regression suite — "the system must demonstrably
 * publish authentic proposed/consultation policy updates without requiring AI
 * to approve their subjective usefulness".
 *
 * Each test proves one required property of the corrected publication policy:
 * subjective AI signals are advisory, source identity is the only blocker, an
 * authentic source update always reaches the public page (full analysis or an
 * honest source-first notice), and the retained safeguards still hold.
 */

const now = "2026-10-14T01:00:00.000Z";
const candidate: DiscoveryCandidate = {
  schemaVersion: "policy-intelligence.discovery-candidate.v1",
  candidateId: "candidate-consultation",
  sourceConfigId: "home-affairs-guidance",
  authority: "Department of Home Affairs",
  canonicalUrl: "https://immi.homeaffairs.gov.au/policy/consultation-example",
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

function acquisition(
  hash = "same-hash",
  canonicalUrl = candidate.canonicalUrl
): OfficialSourceAcquisition {
  return {
    sourceConfigId: candidate.sourceConfigId,
    sourceId: "fixture-source",
    authority: candidate.authority,
    canonicalUrl,
    officialTitle: "Consultation on skilled visa processing priorities",
    retrievedAt: now,
    contentType: "text/html",
    httpStatus: 200,
    etag: null,
    lastModified: null,
    sourceDate: "2026-10-10",
    effectiveDate: null,
    evidenceTruncated: false,
    normalizedEvidence:
      "The department has opened a public consultation on proposed changes to skilled visa processing priorities. Submissions close on 30 November 2026 and the proposed changes would commence no earlier than 1 July 2027, subject to government consideration. This page describes the proposal only; it is not yet law. The consultation paper outlines the proposed priority order for the relevant skilled visa subclasses and explains how feedback will be considered before any instrument is made. Interested parties may lodge a submission through the department's online consultation portal.",
    contentHash: hash,
    sourceMetadata: {
      requestedUrl: canonicalUrl,
      finalUrl: canonicalUrl,
      redirectChain: [],
      bytesReceived: 640,
      evidenceTruncated: false,
    },
  };
}

function analysis(
  ref: string,
  patch: Partial<PolicyAnalysis> = {}
): PolicyAnalysis {
  const text = {
    "zh-CN": "官方已就拟议变更公开征询意见。",
    en: "The official source opened a public consultation on the proposed change.",
  };
  const linked = { ...text, claimRefs: ["claim-1"], uncertainty: null };
  const unit = (
    id: string,
    kind: "source_fact" | "practical_interpretation" = "source_fact"
  ) => ({ id, kind, text: linked, evidenceRefs: [ref] });
  return policyAnalysisSchema.parse({
    schemaVersion: POLICY_ANALYSIS_SCHEMA,
    publicationEligibility: {
      id: "policy-relevance",
      classification: "policy_relevant",
      evidenceRefs: [ref],
    },
    title: unit("title"),
    executiveSummary: unit("executive-summary"),
    keyChanges: [unit("change-1")],
    affectedGroups: [unit("group-1")],
    practicalImpacts: [unit("impact-1", "practical_interpretation")],
    recommendedActions: [unit("action-1", "practical_interpretation")],
    transitionInfo: null,
    uncertainties: [unit("uncertainty-1", "practical_interpretation")],
    relatedSnapshotRefs: [],
    sourceStatus: {
      id: "source-status",
      value: "consultation",
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
      legalForce: "legislative_instrument",
      immediacy: 3,
      serviceRelevance: 4,
      proceduralImpact: 3,
    },
    ...patch,
  });
}

function verification(
  draft: PolicyAnalysis,
  overrides: Record<string, "supported" | "partial" | "unsupported"> = {}
): PolicyVerification {
  const units = [
    ...draft.materialClaims,
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
          verdict === "unsupported"
            ? ("insufficient_support" as const)
            : verdict === "partial"
              ? ("qualified_support" as const)
              : ("direct_support" as const),
      };
    }),
  };
}

function evidencePacket(
  snapshotId: string,
  ref: string
): PolicyEvidencePacketItem {
  return {
    evidenceRef: ref,
    snapshotId,
    sourceConfigId: candidate.sourceConfigId,
    sourceId: "fixture-source",
    authority: candidate.authority,
    canonicalUrl: candidate.canonicalUrl,
    officialTitle: "Consultation on skilled visa processing priorities",
    retrievedAt: now,
    contentHash: "hash-1",
    sourceDate: "2026-10-10",
    effectiveDate: null,
    evidenceTruncated: false,
    text: acquisition().normalizedEvidence,
  };
}

function dependencies(
  options: {
    analyze?: (
      evidence: readonly PolicyEvidencePacketItem[]
    ) => PolicyAnalysis | Promise<PolicyAnalysis>;
    verify?: (
      draft: PolicyAnalysis,
      evidence: readonly PolicyEvidencePacketItem[]
    ) => PolicyVerification | Promise<PolicyVerification>;
    hashes?: string[];
  } = {}
) {
  const store = createInMemoryPolicyIntelligenceRepository();
  let hashIndex = 0;
  let idIndex = 0;
  const deps = {
    repository: store.repository,
    discover: async () => [candidate],
    acquire: async () =>
      acquisition(options.hashes?.[hashIndex++] ?? "same-hash"),
    analyzer: {
      analyze: ({
        evidence,
      }: {
        evidence: readonly PolicyEvidencePacketItem[];
      }) =>
        options.analyze
          ? options.analyze(evidence)
          : analysis(evidence[0].evidenceRef),
    },
    verifier: {
      verify: ({
        analysis: draft,
        evidence,
      }: {
        analysis: PolicyAnalysis;
        evidence: readonly PolicyEvidencePacketItem[];
      }) =>
        options.verify
          ? options.verify(draft, evidence)
          : validatePolicyVerification(
              verification(draft),
              draft,
              new Set(evidence.map((entry) => entry.evidenceRef))
            ),
    },
    modelMetadata: createPolicyModelMetadata({
      provider: "fixture" as const,
      model: "fixture",
      reasoningEffort: "none",
      timeoutMs: 0,
      maxOutputTokens: 0,
    }),
    mode: "fixture" as const,
    now: () => now,
    makeId: () => `run-${++idIndex}`,
  };
  return { deps, store };
}

test("1. an official consultation publishes as consultation while enactment is uncertain", async () => {
  const { deps, store } = dependencies();
  const result = await runPolicyIntelligenceSync(
    deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.sourceFirstPublishedCount, 0);
  assert.equal(result.run.heldCount, 0);
  const [revision] = [...store.revisions.values()];
  assert.equal(revision.contentKind, "ai_analysis");
  assert.equal(revision.analysis?.sourceStatus.value, "consultation");
  // The published copy states the proposal honestly; no commencement date or
  // legal force is invented for the future change.
  assert.equal(
    revision.verification?.assessments.length,
    revision.verification?.assessments.length
  );
  assert.equal([...store.items.values()][0].sourceStatus, "consultation");
});

test("2. an uncertain relevance classification does not veto the publication", async () => {
  const { deps, store } = dependencies({
    analyze: (evidence) =>
      analysis(evidence[0].evidenceRef, {
        publicationEligibility: {
          id: "policy-relevance",
          classification: "uncertain",
          evidenceRefs: [evidence[0].evidenceRef],
        },
      }),
  });
  const result = await runPolicyIntelligenceSync(
    deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.heldCount, 0);
  const [revision] = [...store.revisions.values()];
  assert.equal(revision.contentKind, "ai_analysis");
  assert.equal(
    revision.modelMetadata.advisories?.includes(
      "publication_eligibility_uncertain"
    ),
    true
  );
});

test("3. verifier disagreement is advisory and never vetoes an authentic update", async () => {
  const { deps, store } = dependencies({
    verify: (draft) =>
      verification(draft, {
        "policy-relevance": "unsupported",
        "source-status": "unsupported",
      }),
  });
  const result = await runPolicyIntelligenceSync(
    deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 1);
  assert.equal(result.run.heldCount, 0);
  assert.equal(result.run.failureCount, 0);
  const [revision] = [...store.revisions.values()];
  // The unverifiable legal status is reported honestly as unknown instead of
  // being asserted, and the item is still public.
  assert.equal(revision.analysis?.sourceStatus.value, "unknown");
  assert.equal(
    revision.modelMetadata.advisories?.includes("source_status_not_verified"),
    true
  );
});

test("4. unsupported legal claims are never published as established facts", () => {
  const ref = "policy-snapshot:snap-1";
  const draft = analysis(ref, {
    materialClaims: [
      {
        id: "claim-1",
        kind: "source_fact",
        decisive: true,
        conditional: false,
        text: {
          "zh-CN": "该提案已经成为法律。",
          en: "The proposal has become law.",
        },
        uncertainty: null,
        evidenceRefs: [ref],
      },
    ],
  });
  const decision = evaluatePolicyPublicationDecision({
    analysis: draft,
    verification: verification(draft, { "claim-1": "unsupported" }),
    evidence: [evidencePacket("snap-1", ref)],
  });
  assert.notEqual(decision.mode, "blocked");
  assert.equal(
    decision.withheld.some(
      (entry) =>
        entry.unitId === "claim-1" &&
        entry.reasonCode === "unsupported_material_claim"
    ),
    true
  );
  if (decision.mode === "full_analysis") {
    assert.equal(
      decision.analysis.materialClaims.some((claim) => claim.id === "claim-1"),
      false
    );
  }
});

test("5. analyzer timeout or malformed output still publishes an honest source-first notice", async () => {
  const timedOut = dependencies({
    analyze: () => {
      throw new DOMException("provider timeout", "AbortError");
    },
  });
  const timeoutResult = await runPolicyIntelligenceSync(
    timedOut.deps,
    candidate.sourceConfigId
  );
  assert.equal(timeoutResult.run.publishedCount, 1);
  assert.equal(timeoutResult.run.sourceFirstPublishedCount, 1);
  assert.equal(timeoutResult.run.failureCount, 0);
  const [notice] = [...timedOut.store.revisions.values()];
  assert.equal(notice.contentKind, "source_first");
  assert.equal(notice.schemaVersion, POLICY_SOURCE_FIRST_SCHEMA);
  assert.equal(notice.analysis, null);
  assert.equal(notice.verification, null);
  assert.equal(
    notice.modelMetadata.sourceFirst?.reason,
    "analysis_unavailable"
  );
  // The public item status is honest: no legal force is asserted.
  const [item] = [...timedOut.store.items.values()];
  assert.equal(item.sourceStatus, "unknown");

  const malformed = dependencies({
    analyze: () => ({ schemaVersion: "wrong" }) as unknown as PolicyAnalysis,
  });
  const malformedResult = await runPolicyIntelligenceSync(
    malformed.deps,
    candidate.sourceConfigId
  );
  assert.equal(malformedResult.run.sourceFirstPublishedCount, 1);
  assert.equal(
    [...malformed.store.revisions.values()][0].schemaVersion,
    POLICY_SOURCE_FIRST_SCHEMA
  );
});

test("5b. the source-first excerpt is verbatim official text with an honest language hint", () => {
  const excerpt = boundedOfficialExcerpt(acquisition().normalizedEvidence);
  assert.ok(excerpt);
  assert.equal(
    acquisition().normalizedEvidence.startsWith(excerpt.slice(0, 40)),
    true
  );
  assert.equal(excerptLanguage(excerpt), "en");
  assert.equal(
    excerptLanguage("官方就拟议变更公开征询意见，说明后续安排。"),
    "zh-CN"
  );
  // Too little source text never produces a fabricated excerpt.
  assert.equal(boundedOfficialExcerpt("short page"), null);
});

test("6. missing or unsafe source identity is still blocked and never fabricated", async () => {
  const { deps } = dependencies();
  const blocked = evaluatePolicyPublicationDecision({
    analysis: analysis("policy-snapshot:snap-1"),
    verification: verification(analysis("policy-snapshot:snap-1")),
    evidence: [
      {
        ...evidencePacket("snap-1", "policy-snapshot:snap-1"),
        canonicalUrl: "",
      },
    ],
  });
  assert.equal(blocked.mode, "blocked");
  assert.deepEqual(blocked.blockers, ["source_identity_incomplete"]);
  assert.equal(blocked.analysis, null);

  // An acquisition without a canonical HTTPS identity fails before any item or
  // revision is created.
  deps.acquire = async () => ({ ...acquisition(), contentHash: "" });
  const result = await runPolicyIntelligenceSync(
    deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.run.sourceFirstPublishedCount, 0);
  assert.equal(result.run.failureCount, 1);
});

test("7. repeated syncs stay idempotent for analysis and source-first publications", async () => {
  const analyses = dependencies();
  await runPolicyIntelligenceSync(analyses.deps, candidate.sourceConfigId);
  const secondAnalysis = await runPolicyIntelligenceSync(
    analyses.deps,
    candidate.sourceConfigId
  );
  assert.equal(secondAnalysis.run.unchangedCount, 1);
  assert.equal(analyses.store.revisions.size, 1);

  const fallback = dependencies({
    analyze: () => {
      throw new DOMException("provider timeout", "AbortError");
    },
  });
  await runPolicyIntelligenceSync(fallback.deps, candidate.sourceConfigId);
  const secondFallback = await runPolicyIntelligenceSync(
    fallback.deps,
    candidate.sourceConfigId
  );
  assert.equal(secondFallback.run.unchangedCount, 1);
  assert.equal(fallback.store.revisions.size, 1);
  assert.equal(fallback.store.snapshots.size, 1);
});

test("8. archived items are not republished by a later sync", async () => {
  const { deps, store } = dependencies();
  await runPolicyIntelligenceSync(deps, candidate.sourceConfigId);
  const [item] = [...store.items.values()];
  item.editorialStatus = "archived";
  const archived = await runPolicyIntelligenceSync(
    deps,
    candidate.sourceConfigId
  );
  assert.equal(archived.outcomes[0].outcome, "suppressed");
  assert.equal(archived.outcomes[0].reasonCode, "item_archived");
  assert.equal(archived.run.publishedCount, 0);
  assert.equal(archived.run.heldCount, 0);
  assert.equal(item.editorialStatus, "archived");
  // The earlier publication history is retained for audit; nothing new is made
  // public while the item is archived.
  assert.equal(store.revisions.size, 1);
});

test("9. an editor-protected item is never silently replaced by an automated revision", async () => {
  const { deps, store } = dependencies();
  const originalHeld = store.repository.saveHeldRevision.bind(store.repository);
  // Simulate the durable human-publication protection: the repository records
  // the newer revision as pending review instead of publishing it.
  store.repository.publishRevision = async (revision) => ({
    ...(await originalHeld({
      ...revision,
      contentKind: "ai_analysis",
      analysis: revision.analysis ?? analysis("policy-snapshot:snap-1"),
      verification:
        revision.verification ??
        verification(analysis("policy-snapshot:snap-1")),
    })),
    heldForHumanProtection: true,
  });
  const result = await runPolicyIntelligenceSync(
    deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.run.heldCount, 1);
  assert.equal(result.outcomes[0].outcome, "held");
  assert.equal(result.outcomes[0].reasonCode, "human_publication_protected");
  const [revision] = [...store.revisions.values()];
  assert.equal(revision.editorialStatus, "review_required");
  assert.equal(
    result.run.candidateWarnings.some(
      (warning) => warning.reasonCode === "human_publication_protected"
    ),
    true
  );
});

test("10. public projections render source-first notices with honest labels", async () => {
  const { deps, store } = dependencies({
    analyze: () => {
      throw new DOMException("provider timeout", "AbortError");
    },
  });
  await runPolicyIntelligenceSync(deps, candidate.sourceConfigId);
  const [snapshot] = [...store.snapshots.values()];
  assert.ok(snapshot);
  const excerpt = boundedOfficialExcerpt(snapshot.normalizedEvidence);
  assert.ok(excerpt);

  const { projectLivePolicy } = await import("../policy-intelligence-product");
  const { getPolicyProductCopy } = await import(
    "../policy-intelligence-product-copy"
  );
  const product = projectLivePolicy({
    id: "item-1",
    slug: "consultation-example",
    origin: "automated",
    provenance: "official_source_update",
    sourceStatus: "unknown",
    source: {
      authority: candidate.authority,
      officialTitle: "Consultation on skilled visa processing priorities",
      officialUrl: candidate.canonicalUrl,
      sourceDate: "2026-10-10",
      effectiveDate: null,
      jurisdiction: "Australia",
      category: "home-affairs-guidance",
    },
    analysis: null,
    humanContent: null,
    sourceFirst: {
      reason: "analysis_unavailable",
      excerpt,
      excerptLanguage: excerptLanguage(excerpt),
      advisories: ["provider_timeout"],
    },
    revision: {
      id: "rev-1",
      number: 1,
      generatedAt: now,
      publishedAt: now,
    },
    publicAttribution: null,
    publicationMode: "automatic",
    editorialDates: null,
    newerSourcePendingReview: false,
  });

  assert.equal(product.provenance, "official_source_update");
  assert.equal(product.analysisPending, true);
  // A source-first notice is never presented as AI interpretation, never as
  // official-excerpt-verified analysis, and never as lawyer commentary.
  assert.equal(product.aiGenerated, false);
  assert.equal(product.lawyerCommentary, null);
  assert.equal(product.importance, null);
  assert.deepEqual(product.analysis.keyChanges, []);
  assert.equal(product.source.officialUrl, candidate.canonicalUrl);
  assert.equal(
    product.source.officialTitle,
    "Consultation on skilled visa processing priorities"
  );
  assert.ok(product.officialExcerpt?.text);
  assert.equal(
    snapshot.normalizedEvidence.startsWith(
      product.officialExcerpt.text.slice(0, 40)
    ),
    true
  );
  // The public copy distinguishes the official source from AI analysis and
  // lawyer commentary in both locales.
  for (const locale of ["en", "zh-CN"] as const) {
    const copy = getPolicyProductCopy(locale);
    assert.ok(copy.provenanceOfficialSourceUpdate.length > 0);
    assert.ok(copy.analysisPendingLabel.length > 0);
    assert.ok(copy.analysisPendingNotice.length > 0);
    assert.ok(copy.sourceExcerptNotice.length > 0);
  }
});

test("11. publication metrics distinguish releases from technical holds", () => {
  const metrics = buildAdminSourceSyncPublicationMetrics({
    publishedCount: 3,
    heldCount: 1,
    failureCount: 0,
    metadata: {
      sourceFirstPublishedCount: 1,
      advisoryReasons: {
        source_status_not_verified: 1,
        publication_eligibility_uncertain: 2,
      },
    },
  });
  assert.equal(metrics.fullAnalysisPublishedCount, 2);
  assert.equal(metrics.sourceFirstPublishedCount, 1);
  assert.equal(metrics.heldCount, 1);
  assert.equal(metrics.failureCount, 0);
  assert.equal(metrics.advisoryCount, 3);
  assert.deepEqual(metrics.advisoryReasons, [
    { reasonCode: "publication_eligibility_uncertain", count: 2 },
    { reasonCode: "source_status_not_verified", count: 1 },
  ]);
  // Unknown metadata never inflates or hides the funnel.
  const empty = buildAdminSourceSyncPublicationMetrics({
    publishedCount: 0,
    heldCount: 0,
    failureCount: 0,
    metadata: null,
  });
  assert.deepEqual(empty.advisoryReasons, []);
  assert.equal(empty.sourceFirstPublishedCount, 0);
  assert.equal(empty.fullAnalysisPublishedCount, 0);
});

test("12. status derivation is honest: allowlisted only, otherwise unknown", () => {
  assert.equal(
    deriveSourceFirstSourceStatus({ declaredSourceStatus: "consultation" }),
    "consultation"
  );
  assert.equal(
    deriveSourceFirstSourceStatus({ declaredSourceStatus: "in_force" }),
    "in_force"
  );
  assert.equal(deriveSourceFirstSourceStatus({}), "unknown");
  assert.equal(
    deriveSourceFirstSourceStatus({
      declaredSourceStatus: "totally_new_status",
    }),
    "unknown"
  );
  assert.equal(
    deriveSourceFirstSourceStatus({ declaredSourceStatus: "unknown" }),
    "unknown"
  );
});

test("13. D-073: source-first fingerprints are stable across different failure reasons", async () => {
  let attempt = 0;
  const { deps, store } = dependencies({
    analyze: () => {
      attempt += 1;
      if (attempt === 1) {
        // Run A: analyzer unavailable (timeout class), recoverable.
        throw new DOMException("provider timeout", "AbortError");
      }
      // Run B: a different recoverable AI problem (schema validation).
      return z
        .object({ value: z.string() })
        .parse({ value: 7 }) as unknown as PolicyAnalysis;
    },
  });
  const first = await runPolicyIntelligenceSync(deps, candidate.sourceConfigId);
  assert.equal(first.run.sourceFirstPublishedCount, 1);
  const [notice] = [...store.revisions.values()];
  assert.ok(notice);
  assert.equal(
    notice.modelMetadata.sourceFirst?.reason,
    "analysis_unavailable"
  );

  const second = await runPolicyIntelligenceSync(
    deps,
    candidate.sourceConfigId
  );
  // Same snapshot + same source-first contract => the same publication
  // revision. The second run may re-analyze (the analysis fingerprint is only
  // satisfied by a full analysis, so a later success can still enrich the
  // item), but it must not create a second source-first revision and it must
  // not change the recorded diagnostic reason.
  assert.equal(store.revisions.size, 1);
  assert.equal(second.run.publishedCount, 0);
  assert.equal(second.run.sourceFirstPublishedCount, 0);
  assert.equal(second.outcomes[0].outcome, "unchanged");
  assert.equal(
    notice.modelMetadata.sourceFirst?.reason,
    "analysis_unavailable"
  );

  // The identity is the snapshot plus the source-first content contract; the
  // AI failure reason is diagnostic metadata only.
  const stableIdentity = computePolicyAnalysisFingerprint(
    notice.snapshotId,
    deps.modelMetadata,
    { contentKind: "source_first" }
  );
  assert.equal(notice.analysisFingerprint, stableIdentity);

  // A later successful analysis is still a distinct, enriching revision for the
  // same item (one public policy, no duplicate card).
  deps.analyzer.analyze = ({
    evidence,
  }: {
    evidence: readonly PolicyEvidencePacketItem[];
  }) => analysis(evidence[0].evidenceRef);
  const third = await runPolicyIntelligenceSync(deps, candidate.sourceConfigId);
  assert.equal(third.run.publishedCount, 1);
  assert.equal(third.run.sourceFirstPublishedCount, 0);
  assert.equal(store.revisions.size, 2);
  const [item] = [...store.items.values()];
  assert.equal(item.latestPublishedRevisionId !== notice.id, true);
});

test("14. D-073: an unexpected internal error is never converted into a fallback publication", async () => {
  const { deps, store } = dependencies({
    analyze: () => {
      throw new Error("unexpected programming failure");
    },
  });
  const result = await runPolicyIntelligenceSync(
    deps,
    candidate.sourceConfigId
  );
  assert.equal(result.run.failureCount, 1);
  assert.equal(result.run.publishedCount, 0);
  assert.equal(result.run.sourceFirstPublishedCount, 0);
  assert.equal(
    result.run.candidateFailures[0].errorCode,
    "analysis_internal_error"
  );
  assert.equal(store.revisions.size, 0);
  assert.equal(store.items.size, 1);
  assert.equal([...store.items.values()][0].editorialStatus, "draft");
});

test("15. D-073: a source-first record with unknown legal effect is publicly visible", async () => {
  const { projectLivePolicy } = await import("../policy-intelligence-product");
  const { getPolicyPresentationGroup, getPolicyPresentationStatusLabel } =
    await import("../policy-intelligence-product-copy");
  const product = projectLivePolicy({
    id: "item-1",
    slug: "notice-example",
    origin: "automated",
    provenance: "official_source_update",
    sourceStatus: "unknown",
    source: {
      authority: candidate.authority,
      officialTitle: "Consultation on skilled visa processing priorities",
      officialUrl: candidate.canonicalUrl,
      sourceDate: "2026-10-10",
      effectiveDate: null,
      jurisdiction: "Australia",
      category: "home-affairs-guidance",
    },
    analysis: null,
    humanContent: null,
    sourceFirst: {
      reason: "analysis_unavailable",
      excerpt: boundedOfficialExcerpt(acquisition().normalizedEvidence),
      excerptLanguage: "en",
      advisories: ["provider_timeout"],
    },
    revision: { id: "rev-1", number: 1, generatedAt: now, publishedAt: now },
    publicAttribution: null,
    publicationMode: "automatic",
    editorialDates: null,
    newerSourcePendingReview: false,
  });
  // The record belongs to a visible public group (never filtered out) and its
  // badge states the honest status instead of implying legal force.
  assert.equal(
    getPolicyPresentationGroup(product.sourceStatus),
    "official_update"
  );
  assert.equal(
    getPolicyPresentationStatusLabel(product.sourceStatus, "en"),
    "Legal effect not yet verified"
  );
  assert.equal(
    getPolicyPresentationStatusLabel(product.sourceStatus, "zh-CN"),
    "法律效力状态待确认"
  );
  assert.equal(product.analysisPending, true);
  assert.equal(product.aiGenerated, false);
});
