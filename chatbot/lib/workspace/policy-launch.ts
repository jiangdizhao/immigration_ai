/**
 * Phase 12 Stage 2 — client-side launch identity for a policy question.
 *
 * A policy launch creates exactly one conversation. The browser remembers the
 * launch id for the policy it is currently launching so a retry after a failed
 * request, a double click or a React re-render resolves to the same server-side
 * launch instead of creating a second empty conversation.
 *
 * The id is only an idempotency key: it never authorizes anything, and the
 * server still resolves the policy and the conversation owner itself.
 */
export type PolicyLaunchIdStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function policyLaunchStorageKey(slug: string): string {
  return `policy-launch:${slug}`;
}

export function readPolicyLaunchId(
  store: PolicyLaunchIdStore,
  slug: string
): string | null {
  try {
    const value = store.getItem(policyLaunchStorageKey(slug));
    return value && value.trim().length >= 8 ? value : null;
  } catch {
    return null;
  }
}

export function writePolicyLaunchId(
  store: PolicyLaunchIdStore,
  slug: string,
  launchId: string
): void {
  try {
    store.setItem(policyLaunchStorageKey(slug), launchId);
  } catch {
    // Private mode or a full quota: the launch still works, it is only less
    // resilient against a manual retry.
  }
}

/**
 * Returns the launch id for this policy, creating and remembering one when the
 * browser has not attempted this policy launch yet.
 */
export function readOrCreatePolicyLaunchId(
  store: PolicyLaunchIdStore,
  slug: string,
  generateId: () => string
): string {
  const existing = readPolicyLaunchId(store, slug);
  if (existing) {
    return existing;
  }
  const created = generateId();
  writePolicyLaunchId(store, slug, created);
  return created;
}

/**
 * Clears the remembered launch id once the launch succeeded, so an explicit
 * later launch of the same policy starts a new conversation.
 */
export function clearPolicyLaunchId(
  store: PolicyLaunchIdStore,
  slug: string
): void {
  try {
    store.removeItem(policyLaunchStorageKey(slug));
  } catch {
    // Ignore: a stale id only affects duplicate suppression, not correctness.
  }
}

export type PolicyLaunchFailure = {
  code: string;
  retryable: boolean;
  /** The database has not received migration 0026 in this environment. */
  schemaUnavailable: boolean;
};

export const POLICY_LAUNCH_FAILURE_UNKNOWN: PolicyLaunchFailure = {
  code: "policy_launch_failed",
  retryable: true,
  schemaUnavailable: false,
};

/**
 * Decodes the conversation API's policy failure into an explicit, recoverable
 * state. Unknown shapes are treated as a retryable failure rather than as
 * success, so a policy launch never silently becomes a generic conversation.
 */
export function decodePolicyLaunchFailure(input: {
  status?: number;
  body?: unknown;
}): PolicyLaunchFailure {
  const body =
    input.body && typeof input.body === "object"
      ? (input.body as Record<string, unknown>)
      : {};
  const code = typeof body.code === "string" ? body.code : null;
  const retryable =
    typeof body.retryable === "boolean"
      ? body.retryable
      : input.status === undefined
        ? true
        : input.status >= 500;
  if (code === "policy_binding_unavailable") {
    return { code, retryable: true, schemaUnavailable: true };
  }
  if (code === "policy_launch_in_progress") {
    return { code, retryable: true, schemaUnavailable: false };
  }
  if (code === "policy_topic_unavailable") {
    return { code, retryable, schemaUnavailable: false };
  }
  return {
    code: code ?? POLICY_LAUNCH_FAILURE_UNKNOWN.code,
    retryable,
    schemaUnavailable: false,
  };
}
