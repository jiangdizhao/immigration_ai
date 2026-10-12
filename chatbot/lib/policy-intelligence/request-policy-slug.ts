import { z } from "zod";
import { POLICY_SLUG_PATTERN } from "../policy-intelligence-product";

/**
 * Phase 12 Stage 2 hotfix — the widget request's optional policy-topic hint.
 *
 * An ordinary conversation has no persisted policy binding, so the widget omits
 * `policySlug` entirely; an older or stale client bundle may still send an
 * explicit JSON `null`. Both must mean "no client policy hint" and must never
 * fail the request. The backend resolves the conversation's topic from the
 * persisted binding (`resolveConversationPolicyTopicContext`); the client value
 * is only ever a hint and never an authority for which policy applies.
 *
 * A present non-null value must still be a well-formed policy slug: invalid types
 * and malformed strings stay rejected, so the hint cannot invent a policy
 * identity or smuggle anything else into the field.
 */
export const requestPolicySlugSchema = z
  .union([z.string().regex(POLICY_SLUG_PATTERN), z.null()])
  .optional()
  .transform((value) => value ?? null);

export type RequestPolicySlug = z.infer<typeof requestPolicySlugSchema>;
