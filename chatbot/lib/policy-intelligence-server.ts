import "server-only";

import { MANUAL_POLICY_ENTRIES } from "../content/policy-intelligence/registry";
import {
  type PublicPolicyPreview,
  type PublicPolicyProjection,
  projectPublishedPolicies,
  projectPublishedPolicyBySlug,
  validatePolicyEntries,
} from "./policy-intelligence";

validatePolicyEntries(MANUAL_POLICY_ENTRIES);

export function getPublishedPolicyProjections(): PublicPolicyProjection[] {
  return projectPublishedPolicies(MANUAL_POLICY_ENTRIES);
}

export function getPublishedPolicyPreviewProjections(): PublicPolicyPreview[] {
  return getPublishedPolicyProjections().map(
    ({ id, slug, sourceStatus, source, copy }) => ({
      id,
      slug,
      sourceStatus,
      source: {
        sourceDate: source.sourceDate,
        category: source.category,
      },
      copy: {
        "zh-CN": {
          title: copy["zh-CN"].title,
          summary: copy["zh-CN"].summary,
        },
        en: {
          title: copy.en.title,
          summary: copy.en.summary,
        },
      },
    })
  );
}

export function getPublishedPolicyProjectionBySlug(
  slug: string
): PublicPolicyProjection | null {
  return projectPublishedPolicyBySlug(slug, MANUAL_POLICY_ENTRIES);
}
