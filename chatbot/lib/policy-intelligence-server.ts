import "server-only";

import { MANUAL_POLICY_ENTRIES } from "../content/policy-intelligence/registry";
import {
  type ConversationPolicyBindingView,
  conversationPolicyTopicContextEntry,
} from "./policy-intelligence/conversation-policy-binding";
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
  policyTopicContextEntry,
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

export async function getPolicyTopicContextEntry(
  slug: string | undefined
): Promise<ReturnType<typeof policyTopicContextEntry>> {
  if (!slug) {
    return null;
  }
  return policyTopicContextEntry(await getPolicyWorkspaceReference(slug));
}

/**
 * Phase 12 Stage 2 R1 — the model-side topic context for a bound conversation.
 *
 * It is built from the server-persisted binding snapshot, so the topic survives
 * the original publication being withdrawn, archived or superseded. The live
 * published revision is looked up *best effort*: a failure or a missing entry
 * adds nothing and, critically, never removes the conversation's topic. The
 * current revision is reported as a separate line so a historical snapshot is
 * never silently presented as current law.
 */
export async function resolveConversationPolicyTopicContextEntry(input: {
  binding: ConversationPolicyBindingView | null;
}): Promise<ReturnType<typeof conversationPolicyTopicContextEntry>> {
  if (!input.binding) {
    return null;
  }
  let current: Awaited<ReturnType<typeof getPolicyWorkspaceReference>> = null;
  try {
    current = await getPolicyWorkspaceReference(input.binding.policySlug);
  } catch {
    // A live publication read must never remove the durable topic context.
    current = null;
  }
  return conversationPolicyTopicContextEntry({
    binding: input.binding,
    current,
  });
}
