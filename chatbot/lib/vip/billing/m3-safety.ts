// Pure safety helpers shared by the Phase 9 M3 acceptance runner and tests.

export const M3_BILLING_METADATA = {
  phase: "phase9_m3",
} as const;

/** Accept only an unmistakable Stripe test secret. Never log the value. */
export function isSafeStripeTestSecret(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^sk_test_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value.trim())
  );
}

export function m3RunMetadata(runId: string): Record<string, string> {
  return {
    immigration_ai_phase: M3_BILLING_METADATA.phase,
    immigration_ai_m3_run_id: runId,
  };
}

export function m3SyntheticPlanPriceId(runId: string): string {
  return `price-local-m3-${runId}`;
}

export function m3StripeObjectId(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string"
  ) {
    return value.id;
  }
  return null;
}

export function m3AcceptanceOverall(input: {
  stripeCredentialBlocked: boolean;
  stripeContractFailed?: boolean;
  stripeTestClockAttempted: boolean;
  renewalPass?: boolean;
  failurePass?: boolean;
  cancellationPass?: boolean;
}): "BLOCKED_BY_TEST_CREDENTIAL" | "FAIL" | "PARTIAL" | "PASS" {
  if (input.stripeCredentialBlocked) {
    return "BLOCKED_BY_TEST_CREDENTIAL";
  }
  if (input.stripeContractFailed) {
    return "FAIL";
  }
  if (
    input.stripeTestClockAttempted &&
    (input.renewalPass !== true ||
      input.failurePass !== true ||
      input.cancellationPass !== true)
  ) {
    return "PARTIAL";
  }
  return "PASS";
}
