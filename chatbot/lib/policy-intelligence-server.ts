import "server-only";

import { MANUAL_POLICY_ENTRIES } from "../content/policy-intelligence/registry";
import {
  getPublishedPolicyIntelligenceHistory,
  getPublishedPolicyIntelligenceList,
} from "./policy-intelligence/read-service";
import { policyIntelligenceSchemaAvailable } from "./policy-intelligence/schema-availability";
import {
  boundedPolicyPreview,
  diffPublishedPolicies,
  loadPolicyProductState,
  type PolicyProductPreviewState,
  type PolicyProductState,
  type PublicPolicyDetail,
  type PublicPolicyHistoryEntry,
  projectLivePolicy,
  projectPublicPolicyHistoryEntry,
  resolvePublishedWorkspaceReference,
} from "./policy-intelligence-product";

export async function getPolicyIntelligenceProductState(): Promise<PolicyProductState> {
  return await loadPolicyProductState({
    checkSchema: policyIntelligenceSchemaAvailable,
    readLive: getPublishedPolicyIntelligenceList,
    manualEntries: MANUAL_POLICY_ENTRIES,
  });
}

export async function getPolicyIntelligenceHomePreview(): Promise<PolicyProductPreviewState> {
  const state = await getPolicyIntelligenceProductState();
  return boundedPolicyPreview(state);
}

export async function getPolicyIntelligenceProductBySlug(
  slug: string
): Promise<PublicPolicyDetail | null> {
  const state = await getPolicyIntelligenceProductState();
  const policy = state.policies.find((entry) => entry.slug === slug);
  if (!policy) {
    return null;
  }
  if (policy.origin === "manual") {
    return { ...policy, history: [], diff: [] };
  }

  const rawHistory = await getPublishedPolicyIntelligenceHistory(slug);
  if (!rawHistory) {
    return null;
  }
  const fullHistory = rawHistory.revisions
    .filter(
      (revision) =>
        revision.editorialStatus === "published" ||
        revision.editorialStatus === "superseded"
    )
    .map((revision) => ({
      editorialStatus: revision.editorialStatus,
      policy: projectLivePolicy({
        id: rawHistory.id,
        slug: rawHistory.slug,
        sourceStatus: revision.sourceStatus,
        source: revision.source,
        analysis: revision.analysis,
        revision: revision.revision,
      }),
    }));
  const currentIndex = fullHistory.findIndex(
    ({ policy: revision }) =>
      revision.revision.number === policy.revision.number &&
      revision.revision.publishedAt === policy.revision.publishedAt
  );
  if (currentIndex < 0) {
    return null;
  }
  const currentHistory = fullHistory.splice(currentIndex, 1)[0];
  if (!currentHistory) {
    return null;
  }
  const orderedHistory = [currentHistory, ...fullHistory];
  const previous = orderedHistory[1]?.policy ?? null;
  const diff = diffPublishedPolicies(policy, previous);
  const history: PublicPolicyHistoryEntry[] = orderedHistory.map(
    ({ policy: revision, editorialStatus }) =>
      projectPublicPolicyHistoryEntry(revision, editorialStatus)
  );
  return { ...policy, history, diff };
}

export async function getPolicyWorkspaceReference(slug: string) {
  return await resolvePublishedWorkspaceReference(
    slug,
    async (selectedSlug) => {
      const state = await getPolicyIntelligenceProductState();
      return (
        state.policies.find((policy) => policy.slug === selectedSlug) ?? null
      );
    }
  );
}
