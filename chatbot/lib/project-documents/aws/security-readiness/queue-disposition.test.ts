import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { TrustedScanDeliveryContext } from "../delivery-context";
import { createFakeTrustedScanDeliveryContext } from "../testing";
import type { QueueMessageAssessment } from "./queue-disposition";
import { planQueueMessageDisposition } from "./queue-disposition";

const rawBody = JSON.stringify({
  synthetic: true,
  eventId: "test-event-1",
});
const trustedContext = createFakeTrustedScanDeliveryContext(rawBody);
const base = {
  message: "well_formed" as const,
  persistenceAssertion: "committed" as const,
  acknowledgement: "succeeded" as const,
  attempt: 1,
  maximumAttempts: 5,
};

async function assessment(
  overrides: Partial<QueueMessageAssessment> = {}
): Promise<QueueMessageAssessment> {
  return {
    rawBody,
    deliveryContext: await trustedContext,
    ...base,
    ...overrides,
  };
}

test("missing or fabricated string transport proof cannot authorize acknowledgement", async () => {
  const absent = await assessment({ deliveryContext: undefined });
  assert.deepEqual(planQueueMessageDisposition(absent), {
    action: "deny_untrusted",
    acknowledge: false,
    promoteClean: false,
  });

  const forged = {
    ...absent,
    transportProof: "independently_authenticated_by_future_transport_port",
  };
  assert.equal(planQueueMessageDisposition(forged).action, "deny_untrusted");
  assert.notEqual(planQueueMessageDisposition(forged).action, "ack");
});

test("manually constructed or cast delivery contexts are rejected", async () => {
  for (const manualContext of [
    {},
    Object.freeze(Object.create(null)),
  ] as unknown[]) {
    const input = await assessment({
      deliveryContext: manualContext as TrustedScanDeliveryContext,
    });
    assert.equal(planQueueMessageDisposition(input).action, "deny_untrusted");
  }

  const stringContext = await assessment({ deliveryContext: "trusted" });
  assert.equal(
    planQueueMessageDisposition(stringContext).action,
    "deny_untrusted"
  );
});

test("trusted context is bound to the exact raw message body", async () => {
  const input = await assessment({ rawBody: `${rawBody} ` });
  assert.equal(planQueueMessageDisposition(input).action, "deny_untrusted");
});

test("legitimate test-only authenticated context preserves commit-before-ack behavior", async () => {
  assert.deepEqual(planQueueMessageDisposition(await assessment()), {
    action: "ack",
    acknowledge: true,
    promoteClean: false,
    idempotentReplay: false,
  });
  assert.deepEqual(
    planQueueMessageDisposition(
      await assessment({ persistenceAssertion: "identical_replay" })
    ),
    {
      action: "ack",
      acknowledge: true,
      promoteClean: false,
      idempotentReplay: true,
    }
  );
  assert.deepEqual(
    planQueueMessageDisposition(
      await assessment({ acknowledgement: "not_attempted" })
    ),
    {
      action: "ack",
      acknowledge: true,
      promoteClean: false,
      idempotentReplay: false,
    }
  );
});

test("transient persistence failure retries within bounded attempt budget", async () => {
  assert.deepEqual(
    planQueueMessageDisposition(
      await assessment({
        message: "transient_failure",
        persistenceAssertion: "not_committed",
        acknowledgement: "not_attempted",
      })
    ),
    {
      action: "retry",
      acknowledge: false,
      promoteClean: false,
      boundedAttempt: 1,
      replayMustBeIdempotent: false,
    }
  );
});

test("malformed, forged, mismatched, and conflicting deliveries quarantine", async () => {
  for (const message of [
    "malformed",
    "forged_or_cross_account",
    "identity_mismatch",
    "conflicting_duplicate",
  ] as const) {
    assert.equal(
      planQueueMessageDisposition(await assessment({ message })).action,
      "quarantine_or_dlq"
    );
  }
});

test("failed acknowledgement after commit retries with an idempotent replay requirement", async () => {
  assert.deepEqual(
    planQueueMessageDisposition(
      await assessment({ acknowledgement: "failed_after_commit" })
    ),
    {
      action: "retry",
      acknowledge: false,
      promoteClean: false,
      boundedAttempt: 1,
      replayMustBeIdempotent: true,
    }
  );
  assert.deepEqual(
    planQueueMessageDisposition(
      await assessment({
        persistenceAssertion: "identical_replay",
        acknowledgement: "succeeded",
        attempt: 2,
      })
    ),
    {
      action: "ack",
      acknowledge: true,
      promoteClean: false,
      idempotentReplay: true,
    }
  );
});

test("runtime-invalid and inconsistent assessments fail closed without invoking accessors", async () => {
  assert.equal(planQueueMessageDisposition(undefined).action, "deny_untrusted");
  assert.equal(
    planQueueMessageDisposition(
      await assessment({ persistenceAssertion: "unknown" })
    ).action,
    "quarantine_or_dlq"
  );
  assert.equal(
    planQueueMessageDisposition(
      await assessment({
        persistenceAssertion: "not_committed",
        acknowledgement: "succeeded",
      })
    ).action,
    "quarantine_or_dlq"
  );
  assert.deepEqual(
    planQueueMessageDisposition(
      await assessment({
        persistenceAssertion: "not_committed",
        acknowledgement: "not_attempted",
      })
    ),
    {
      action: "retry",
      acknowledge: false,
      promoteClean: false,
      boundedAttempt: 1,
      replayMustBeIdempotent: false,
    }
  );

  let getterCalled = false;
  const accessorAssessment = await assessment();
  Object.defineProperty(accessorAssessment, "message", {
    get() {
      getterCalled = true;
      return "well_formed";
    },
  });
  assert.equal(
    planQueueMessageDisposition(accessorAssessment).action,
    "quarantine_or_dlq"
  );
  assert.equal(getterCalled, false);
});

test("exhausted temporary failures reach DLQ without a security incident", async () => {
  assert.deepEqual(
    planQueueMessageDisposition(
      await assessment({
        attempt: 5,
        maximumAttempts: 5,
        message: "transient_failure",
        persistenceAssertion: "not_committed",
        acknowledgement: "not_attempted",
      })
    ),
    {
      action: "dlq_exhausted",
      acknowledge: false,
      promoteClean: false,
      securityIncident: false,
    }
  );
});

test("invalid retry bounds quarantine, and committed acknowledgement exhaustion stays idempotent", async () => {
  assert.equal(
    planQueueMessageDisposition(
      await assessment({ attempt: 1001, maximumAttempts: 1001 })
    ).action,
    "quarantine_or_dlq"
  );
  assert.deepEqual(
    planQueueMessageDisposition(
      await assessment({
        persistenceAssertion: "committed",
        acknowledgement: "failed_after_commit",
        attempt: 5,
        maximumAttempts: 5,
      })
    ),
    {
      action: "dlq_exhausted",
      acknowledge: false,
      promoteClean: false,
      securityIncident: false,
    }
  );
});

test("production planner imports no test authenticator, SQS client, or scan persistence bridge", () => {
  const source = readFileSync(
    new URL("./queue-disposition.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /(?:from|import).*testing/u);
  assert.doesNotMatch(
    source,
    /SQSClient|ReceiveMessage|DeleteMessage|finalizeScan/u
  );
});
