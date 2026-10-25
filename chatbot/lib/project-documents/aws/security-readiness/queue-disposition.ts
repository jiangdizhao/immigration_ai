import "server-only";

import { isTrustedScanDeliveryContextForBody } from "../delivery-context";

/**
 * Future-port assertions supplied to a pure disposition planner. The planner
 * checks the accepted A1.2-A capability against the exact raw body, but it
 * does not authenticate transport, consume SQS, acknowledge messages, or call
 * A1.1 persistence.
 */
export type QueueMessageAssessment = {
  rawBody: unknown;
  deliveryContext: unknown;
  message: unknown;
  /** Assertion from a future trusted persistence integration; the planner
   * cannot independently verify that a database transaction committed. */
  persistenceAssertion: unknown;
  acknowledgement: unknown;
  attempt: unknown;
  maximumAttempts: unknown;
};

export type QueueMessageDisposition =
  | { action: "deny_untrusted"; acknowledge: false; promoteClean: false }
  | {
      action: "quarantine_or_dlq";
      acknowledge: false;
      promoteClean: false;
      securityIncident: true;
    }
  | {
      action: "retry";
      acknowledge: false;
      promoteClean: false;
      boundedAttempt: number;
      replayMustBeIdempotent: boolean;
    }
  | {
      action: "dlq_exhausted";
      acknowledge: false;
      promoteClean: false;
      securityIncident: false;
    }
  | {
      action: "ack";
      acknowledge: true;
      promoteClean: false;
      idempotentReplay: boolean;
    };

const MAX_RETRY_BUDGET = 1000;
const MESSAGES = new Set([
  "well_formed",
  "malformed",
  "forged_or_cross_account",
  "identity_mismatch",
  "conflicting_duplicate",
  "transient_failure",
]);
const PERSISTENCE_ASSERTIONS = new Set([
  "not_attempted",
  "not_committed",
  "committed",
  "identical_replay",
]);
const ACKNOWLEDGEMENTS = new Set([
  "not_attempted",
  "succeeded",
  "failed_after_commit",
]);
const ASSESSMENT_FIELDS = [
  "rawBody",
  "deliveryContext",
  "message",
  "persistenceAssertion",
  "acknowledgement",
  "attempt",
  "maximumAttempts",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ParsedAssessment = {
  kind: "assessment";
  attempt: unknown;
  maximumAttempts: unknown;
  message: unknown;
  persistenceAssertion: unknown;
  acknowledgement: unknown;
};

function parseAssessment(
  input: unknown
): { kind: "untrusted" } | { kind: "invalid" } | ParsedAssessment {
  if (!isRecord(input)) {
    return { kind: "untrusted" };
  }
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return { kind: "untrusted" };
    }
    const rawBody = Object.getOwnPropertyDescriptor(input, "rawBody");
    const deliveryContext = Object.getOwnPropertyDescriptor(
      input,
      "deliveryContext"
    );
    if (
      !rawBody ||
      !Object.hasOwn(rawBody, "value") ||
      !deliveryContext ||
      !Object.hasOwn(deliveryContext, "value") ||
      !isTrustedScanDeliveryContextForBody(
        deliveryContext.value,
        rawBody.value as string | Uint8Array
      )
    ) {
      return { kind: "untrusted" };
    }

    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== ASSESSMENT_FIELDS.length ||
      keys.some(
        (key) => typeof key !== "string" || !ASSESSMENT_FIELDS.includes(key)
      )
    ) {
      return { kind: "invalid" };
    }

    const values: Record<string, unknown> = {};
    for (const field of ASSESSMENT_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) {
        return { kind: "invalid" };
      }
      values[field] = descriptor.value;
    }
    return {
      kind: "assessment",
      attempt: values.attempt,
      maximumAttempts: values.maximumAttempts,
      message: values.message,
      persistenceAssertion: values.persistenceAssertion,
      acknowledgement: values.acknowledgement,
    };
  } catch {
    return { kind: "untrusted" };
  }
}

function validAttempt(value: unknown) {
  return (
    Number.isSafeInteger(value) &&
    typeof value === "number" &&
    value >= 1 &&
    value <= MAX_RETRY_BUDGET
  );
}

function quarantine(): QueueMessageDisposition {
  return {
    action: "quarantine_or_dlq",
    acknowledge: false,
    promoteClean: false,
    securityIncident: true,
  };
}

function retry(
  attempt: number,
  replayMustBeIdempotent: boolean
): QueueMessageDisposition {
  return {
    action: "retry",
    acknowledge: false,
    promoteClean: false,
    boundedAttempt: attempt,
    replayMustBeIdempotent,
  };
}

/** Pure SQS disposition state machine; no consumer, client, or persistence. */
export function planQueueMessageDisposition(
  input: unknown
): QueueMessageDisposition {
  const parsed = parseAssessment(input);
  if (parsed.kind === "untrusted") {
    return {
      action: "deny_untrusted",
      acknowledge: false,
      promoteClean: false,
    };
  }
  if (parsed.kind === "invalid") {
    return quarantine();
  }

  const {
    attempt,
    maximumAttempts,
    message,
    persistenceAssertion,
    acknowledgement,
  } = parsed;
  if (
    !validAttempt(attempt) ||
    !validAttempt(maximumAttempts) ||
    typeof attempt !== "number" ||
    typeof maximumAttempts !== "number" ||
    attempt > maximumAttempts ||
    typeof message !== "string" ||
    !MESSAGES.has(message) ||
    typeof persistenceAssertion !== "string" ||
    !PERSISTENCE_ASSERTIONS.has(persistenceAssertion) ||
    typeof acknowledgement !== "string" ||
    !ACKNOWLEDGEMENTS.has(acknowledgement)
  ) {
    return quarantine();
  }

  if (
    message === "malformed" ||
    message === "forged_or_cross_account" ||
    message === "identity_mismatch" ||
    message === "conflicting_duplicate"
  ) {
    return quarantine();
  }

  const committed =
    persistenceAssertion === "committed" ||
    persistenceAssertion === "identical_replay";
  const idempotentReplay = persistenceAssertion === "identical_replay";

  // These persistence outcomes are assertions from a future integration port.
  // Acknowledgement is never allowed before that port reports commit/replay.
  if (
    (acknowledgement === "succeeded" && !committed) ||
    (acknowledgement === "failed_after_commit" && !committed) ||
    (message === "transient_failure" && committed) ||
    (message === "transient_failure" && acknowledgement !== "not_attempted") ||
    (message !== "well_formed" && committed)
  ) {
    return quarantine();
  }

  if (committed) {
    if (
      acknowledgement === "succeeded" ||
      acknowledgement === "not_attempted"
    ) {
      return {
        action: "ack",
        acknowledge: true,
        promoteClean: false,
        idempotentReplay,
      };
    }
    if (attempt >= maximumAttempts) {
      return {
        action: "dlq_exhausted",
        acknowledge: false,
        promoteClean: false,
        securityIncident: false,
      };
    }
    return retry(attempt, true);
  }

  if (acknowledgement !== "not_attempted") {
    return quarantine();
  }
  if (attempt >= maximumAttempts) {
    return {
      action: "dlq_exhausted",
      acknowledge: false,
      promoteClean: false,
      securityIncident: false,
    };
  }
  return retry(attempt, false);
}
