import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import type { PolicyDiscoverySource } from "./policy-intelligence-discovery";

loadDotenv({ path: resolve(process.cwd(), ".env.local") });

const sourceIds = [
  "home-affairs-guidance",
  "federal-register-legislation",
  "art-immigration-review",
] as const;
type SourceId = (typeof sourceIds)[number];
function parseArgs(args: string[]) {
  let sourceId: SourceId | undefined;
  let fixture = false;
  let skipNext = false;
  for (const [index, arg] of args.entries()) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--") {
      continue;
    }
    if (arg === "--source") {
      const value = args[index + 1];
      skipNext = true;
      if (!sourceIds.includes(value as SourceId)) {
        throw new Error("invalid_source");
      }
      sourceId = value as SourceId;
    } else if (arg === "--fixture") {
      fixture = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: pnpm policy:sync -- --source <home-affairs-guidance|federal-register-legislation|art-immigration-review> [--fixture]"
      );
      process.exit(0);
    } else {
      throw new Error("unknown_option");
    }
  }
  if (!sourceId) {
    throw new Error("source_required");
  }
  return { sourceId, fixture };
}

const detailHtml =
  "<!doctype html><html><head><title>Synthetic policy source fixture</title></head><body><main><h1>Synthetic policy source fixture</h1><p>This document is a deterministic fictional fixture for testing the Immigration AI Policy Intelligence pipeline. It is not an official government rule, not Australian law, and must never be used as legal advice. The example page describes a hypothetical administrative update solely to exercise source acquisition, normalized evidence capture, bilingual analysis, evidence reference verification, and publication gating. No actual visa subclass, person, policy change, commencement date, eligibility criterion, or legal consequence is represented here.</p></main></body></html>";

function fixtureIndex(
  sourceId: SourceId,
  source: PolicyDiscoverySource
): { body: string; contentType: string } {
  if (sourceId === "home-affairs-guidance") {
    return {
      body: `<html><script id="siteData" type="application/json">${JSON.stringify({ alertItems: [{ title: "Synthetic policy source fixture", content: "Fictional fixture only", urls: [{ url: "/policy-intelligence-fixture" }] }] })}</script></html>`,
      contentType: "text/html",
    };
  }
  if (sourceId === "federal-register-legislation") {
    return {
      body: `<urlset><url><loc>${new URL("/policy-intelligence-fixture", source.seedUrls[0]).toString()}</loc></url></urlset>`,
      contentType: "application/xml",
    };
  }
  return {
    body: `<html><a href="/policy-intelligence-fixture">Synthetic policy source fixture</a></html>`,
    contentType: "text/html",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [
    { discoverPolicyCandidates, getPolicyDiscoverySource },
    { acquireOfficialPolicySource },
    { runPolicyIntelligenceSync, createPolicyModelMetadata },
    { createInMemoryPolicyIntelligenceRepository },
    { POLICY_ANALYSIS_SCHEMA, POLICY_VERIFICATION_SCHEMA },
    provider,
  ] = await Promise.all([
    import("./policy-intelligence-discovery"),
    import("./policy-intelligence-acquisition"),
    import("../lib/policy-intelligence/pipeline"),
    import("../lib/policy-intelligence/memory-repository"),
    import("../lib/policy-intelligence/contracts"),
    import("../lib/policy-intelligence/provider"),
  ]);
  const source = getPolicyDiscoverySource(options.sourceId);
  let repository: import("../lib/policy-intelligence/pipeline").PolicyIntelligenceRepository;
  let analyzer: import("../lib/policy-intelligence/provider").PolicyAnalyzer;
  let verifier: import("../lib/policy-intelligence/provider").PolicyAnalysisVerifier;
  let modelMetadata: import("../lib/policy-intelligence/pipeline").PolicyRevisionRecord["modelMetadata"];
  let mode: "fixture" | "live";
  let discover: () => Promise<
    readonly import("./policy-intelligence-discovery").DiscoveryCandidate[]
  >;
  let acquire: (
    candidate: import("./policy-intelligence-discovery").DiscoveryCandidate
  ) => Promise<
    import("./policy-intelligence-acquisition").OfficialSourceAcquisition
  >;

  if (options.fixture) {
    const memory = createInMemoryPolicyIntelligenceRepository();
    repository = memory.repository;
    const index = fixtureIndex(options.sourceId, source);
    const fixtureFetch: import("./policy-intelligence-discovery").DiscoveryFetchOptions =
      {
        lookupHost: () => Promise.resolve(["203.0.113.10"]),
        fetchImpl: (input) => {
          const url = new URL(String(input));
          const isSeed = source.seedUrls.some(
            (seed) => new URL(seed).pathname === url.pathname
          );
          const selected = isSeed
            ? index
            : { body: detailHtml, contentType: "text/html" };
          return Promise.resolve(
            new Response(selected.body, {
              status: 200,
              headers: { "content-type": selected.contentType },
            })
          );
        },
      };
    discover = async () =>
      (
        await discoverPolicyCandidates({
          sourceId: options.sourceId,
          fetchOptions: fixtureFetch,
        })
      ).candidates.filter(
        (candidate) =>
          !(
            (candidate.discoveryStrategy === "sitemap_links" ||
              candidate.discoveryStrategy === "listing_links") &&
            candidate.sourceMetadata.urlProvenance === "seed"
          )
      );
    acquire = (candidate) =>
      acquireOfficialPolicySource({
        candidate,
        fetchOptions: fixtureFetch,
        retrievedAt: new Date().toISOString(),
      });
    analyzer = {
      analyze({ evidence }) {
        const ref = evidence[0]?.evidenceRef;
        if (!ref) {
          throw new Error("fixture_evidence_missing");
        }
        const localized = {
          "zh-CN": "这是虚构的结构测试内容，不代表真实政策。",
          en: "This is fictional structural test content and does not represent real policy.",
        };
        const linkedText = {
          ...localized,
          claimRefs: ["fixture-claim"],
          uncertainty: null,
        };
        const row = (
          id: string,
          kind: "source_fact" | "practical_interpretation" = "source_fact"
        ) => ({ id, kind, text: linkedText, evidenceRefs: [ref] });
        return {
          schemaVersion: POLICY_ANALYSIS_SCHEMA,
          publicationEligibility: {
            id: "policy-relevance",
            classification: "policy_relevant",
            evidenceRefs: [ref],
          },
          title: { ...row("fixture-title"), text: linkedText },
          executiveSummary: { ...row("fixture-summary"), text: linkedText },
          keyChanges: [row("fixture-change")],
          affectedGroups: [row("fixture-group")],
          practicalImpacts: [row("fixture-impact", "practical_interpretation")],
          recommendedActions: [
            row("fixture-action", "practical_interpretation"),
          ],
          transitionInfo: null,
          uncertainties: [
            row("fixture-uncertainty", "practical_interpretation"),
          ],
          relatedSnapshotRefs: [],
          sourceStatus: {
            id: "source-status",
            value: "announced",
            certain: true,
            claimRef: "fixture-claim",
            evidenceRefs: [ref],
          },
          materialClaims: [
            {
              id: "fixture-claim",
              kind: "source_fact",
              decisive: true,
              conditional: false,
              text: localized,
              uncertainty: null,
              evidenceRefs: [ref],
            },
          ],
          importance: {
            affectedPopulation: 1,
            legalForce: "other",
            immediacy: 1,
            serviceRelevance: 1,
            proceduralImpact: 1,
          },
        };
      },
    };
    verifier = {
      verify({ analysis }) {
        const units = [
          ...analysis.materialClaims,
          analysis.title,
          analysis.executiveSummary,
          ...analysis.keyChanges,
          ...analysis.affectedGroups,
          ...analysis.practicalImpacts,
          ...analysis.recommendedActions,
          ...(analysis.transitionInfo ? [analysis.transitionInfo] : []),
          ...analysis.uncertainties,
          analysis.publicationEligibility,
          analysis.sourceStatus,
        ];
        return {
          schemaVersion: POLICY_VERIFICATION_SCHEMA,
          assessments: units.map((unit) => ({
            unitId: unit.id,
            verdict: "supported" as const,
            evidenceRefs: unit.evidenceRefs,
            reasonCode: "direct_support" as const,
          })),
        };
      },
    };
    modelMetadata = createPolicyModelMetadata({
      provider: "fixture",
      model: "deterministic-fixture",
      reasoningEffort: "none",
      timeoutMs: 0,
      maxOutputTokens: 0,
    });
    mode = "fixture";
  } else {
    if (!process.env.POSTGRES_URL) {
      throw new Error("POSTGRES_URL is required for live sync");
    }
    const configuration = provider.getPolicyIntelligenceModelConfig();
    if (!configuration.enabled || !process.env.OPENAI_API_KEY?.trim()) {
      throw new Error("policy_intelligence_provider_not_enabled");
    }
    const [{ policyIntelligenceRepository }] = await Promise.all([
      import("../lib/policy-intelligence/repository"),
    ]);
    repository = policyIntelligenceRepository;
    analyzer = provider.createOpenAIPolicyAnalyzer(configuration);
    verifier = provider.createOpenAIPolicyAnalysisVerifier(configuration);
    modelMetadata = createPolicyModelMetadata({
      provider: "openai",
      model: configuration.model,
      reasoningEffort: configuration.reasoningEffort,
      timeoutMs: configuration.timeoutMs,
      maxOutputTokens: configuration.maxOutputTokens,
    });
    mode = "live";
    discover = async () =>
      (
        await discoverPolicyCandidates({ sourceId: options.sourceId })
      ).candidates.filter(
        (candidate) =>
          !(
            (candidate.discoveryStrategy === "sitemap_links" ||
              candidate.discoveryStrategy === "listing_links") &&
            candidate.sourceMetadata.urlProvenance === "seed"
          )
      );
    acquire = (candidate) => acquireOfficialPolicySource({ candidate });
  }

  const dependencies = {
    repository,
    discover,
    acquire,
    analyzer,
    verifier,
    modelMetadata,
    mode,
  };
  const result = await runPolicyIntelligenceSync(
    dependencies,
    options.sourceId
  );
  let idempotence = "not_checked";
  if (options.fixture) {
    const second = await runPolicyIntelligenceSync(
      dependencies,
      options.sourceId
    );
    if (
      result.run.snapshottedCount === 0 ||
      second.run.unchangedCount !== result.run.snapshottedCount ||
      second.run.snapshottedCount !== 0 ||
      second.run.analyzedCount !== 0 ||
      second.run.publishedCount !== 0 ||
      second.run.failureCount !== 0
    ) {
      console.error(
        JSON.stringify({
          fixtureIdempotence: {
            first: {
              discovered: result.run.discoveredCount,
              snapshotted: result.run.snapshottedCount,
              published: result.run.publishedCount,
              failed: result.run.failureCount,
            },
            second: {
              discovered: second.run.discoveredCount,
              unchanged: second.run.unchangedCount,
              snapshotted: second.run.snapshottedCount,
              analyzed: second.run.analyzedCount,
              published: second.run.publishedCount,
              failed: second.run.failureCount,
            },
          },
        })
      );
      throw new Error("fixture_idempotence_failed");
    }
    idempotence = "pass";
  }
  await new Promise<void>((resolve) => {
    process.stdout.write(
      `${JSON.stringify({ mode, sourceConfigId: options.sourceId, run: result.run, outcomes: result.outcomes.map(({ candidateId: _candidateId, ...outcome }) => outcome), idempotence })}\n`,
      () => resolve()
    );
  });
  // This is a one-shot operator CLI. The live repository keeps a database
  // client handle open, so an explicit successful exit is required after all
  // awaited writes and output have completed.
  process.exit(0);
}

main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^[a-z0-9_]{1,80}$/.test(error.message)
      ? error.message
      : "policy_sync_failed";
  process.stderr.write(`Policy sync failed: ${code}\n`, () => process.exit(1));
});
