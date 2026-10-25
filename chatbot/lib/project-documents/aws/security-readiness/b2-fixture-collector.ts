import "server-only";

import { evaluateB2ApiResponse } from "./b2-evidence";
import {
  b2RequestTemplates,
  canonicalizeB2Evidence,
  fingerprintB2Evidence,
} from "./b2-plan";
import {
  b2ScopeFingerprint,
  validateB2Approval,
  validateB2Scope,
} from "./b2-scope";
import {
  B2_READ_ONLY_OPERATIONS,
  type B2ApprovalRecord,
  type B2FixtureExecutor,
  type B2Observation,
  type B2ObservationFinding,
  type B2ReadOnlyRequest,
  type B2Scope,
  PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA,
} from "./b2-types";

const MAX_TOTAL_MS = 30_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const LIMITATION =
  "This offline fixture observation is not verified production consent, authenticated AWS identity, effective IAM proof, or GuardDuty source attestation. Live deployment remains NO_GO; no trusted delivery capability is created.";

export type B2FixtureCollectionInput = {
  collectReadOnly: unknown;
  confirmedAccountId: string;
  scope: unknown;
  approval: unknown;
  now?: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUncollectedPages(value: unknown) {
  if (!record(value)) {
    return false;
  }
  for (const field of ["NextToken", "NextMarker"]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor && Object.hasOwn(descriptor, "value") && descriptor.value) {
      return true;
    }
  }
  const truncated = Object.getOwnPropertyDescriptor(value, "IsTruncated");
  if (
    truncated &&
    Object.hasOwn(truncated, "value") &&
    truncated.value === true
  ) {
    return true;
  }
  const marker = Object.getOwnPropertyDescriptor(value, "Truncated");
  return (
    marker !== undefined &&
    Object.hasOwn(marker, "value") &&
    marker.value === true
  );
}

function finding(
  requirement: string,
  status: B2ObservationFinding["status"],
  reasonCode: string,
  observedAt: string,
  evidenceFingerprint: string | null,
  outstandingAction: string
): B2ObservationFinding {
  return {
    requirement,
    source: "fixture_executor",
    status,
    reasonCode,
    observedAt,
    evidenceFingerprint,
    outstandingAction,
  };
}

function failedObservation(reasonCode: string, now: number): B2Observation {
  const timestamp = new Date(now).toISOString();
  return {
    schema: PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA,
    source: "fixture",
    scopeFingerprint: null,
    findings: [
      finding(
        "collection_preflight",
        "INCOMPLETE",
        reasonCode,
        timestamp,
        null,
        "Correct the local offline fixture inputs; B2-1 authorization is separate."
      ),
    ],
    liveDecision: "NO_GO",
    requiresLiveOwnerVerification: true,
    limitation: LIMITATION,
  };
}

function allowedRequest(request: B2ReadOnlyRequest) {
  return (
    B2_READ_ONLY_OPERATIONS.includes(request.operation) &&
    request.maxAttempts === 1 &&
    request.timeoutMs > 0 &&
    request.timeoutMs <= 2000 &&
    request.maxResponseBytes > 0 &&
    request.maxResponseBytes <= MAX_RESPONSE_BYTES &&
    request.maxPages >= 1 &&
    request.maxPages <= 3 &&
    !Object.keys(request).some((key) =>
      /endpoint|command|shell|credential|urlOverride/iu.test(key)
    )
  );
}

/**
 * Fixture-only model of the future guarded sequence. No AWS executor is
 * implemented or exported; callers can supply only the explicitly branded
 * offline port. A real collector requires a separately reviewed B2-1 change.
 */
export async function collectB2FixtureObservation(
  input: B2FixtureCollectionInput,
  executor: B2FixtureExecutor
): Promise<B2Observation> {
  const now = input.now ?? Date.now();
  let scope: B2Scope;
  try {
    scope = validateB2Scope(input.scope);
  } catch {
    return failedObservation("SCOPE_INVALID", now);
  }
  if (
    executor?.kind !== "fixture_only" ||
    input.collectReadOnly !== true ||
    input.confirmedAccountId !== scope.approvedAccountId
  ) {
    return failedObservation(
      "COLLECTION_CONFIRMATION_OR_EXECUTOR_INVALID",
      now
    );
  }
  if (!validateB2Approval(input.approval, scope, now)) {
    return failedObservation("APPROVAL_INVALID_OR_EXPIRED", now);
  }

  const findings: B2ObservationFinding[] = [];
  const requests = b2RequestTemplates(scope);
  const startedAt = Date.now();
  if (requests[0]?.operation !== "sts:GetCallerIdentity") {
    return failedObservation("STS_FIRST_INVARIANT_FAILED", now);
  }
  for (const [index, request] of requests.entries()) {
    const remainingMs = MAX_TOTAL_MS - (Date.now() - startedAt);
    if (!allowedRequest(request) || remainingMs <= 0) {
      findings.push(
        finding(
          `request_${index + 1}`,
          "INCOMPLETE",
          "REQUEST_BOUNDS_OR_TOTAL_DEADLINE",
          new Date(now).toISOString(),
          null,
          "Review the allowlisted request plan and finite deadline."
        )
      );
      break;
    }

    let response: unknown;
    try {
      const controller = new AbortController();
      const timeoutMs = Math.min(request.timeoutMs, remainingMs);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await Promise.race([
          executor.execute(request, {
            signal: controller.signal,
            profile: scope.awsProfile,
            region: scope.region,
          }),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener(
              "abort",
              () => reject(new Error("B2_REQUEST_TIMEOUT")),
              { once: true }
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const reasonCode =
        error instanceof Error && error.message === "B2_REQUEST_TIMEOUT"
          ? "API_TIMEOUT"
          : "API_DENIED_OR_UNAVAILABLE";
      findings.push(
        finding(
          request.operation,
          "INCOMPLETE",
          reasonCode,
          new Date(now).toISOString(),
          null,
          "Record only the bounded AWS error code and obtain separate owner review; do not widen permissions automatically."
        )
      );
      if (index === 0) {
        break;
      }
      continue;
    }

    const serializedResponse = canonicalizeB2Evidence(response);
    if (
      serializedResponse === null ||
      Buffer.byteLength(serializedResponse, "utf8") > request.maxResponseBytes
    ) {
      findings.push(
        finding(
          request.operation,
          "INCOMPLETE",
          "RESPONSE_SIZE_LIMIT",
          new Date(now).toISOString(),
          null,
          "Capture a bounded response; do not retain raw policy or infrastructure payloads in the sanitized report."
        )
      );
      if (index === 0) {
        break;
      }
      continue;
    }

    const evidenceFingerprint = fingerprintB2Evidence(response);
    if (index === 0) {
      const identity = record(response) ? response : {};
      const arn = typeof identity.Arn === "string" ? identity.Arn : "";
      const expectedArn = scope.expectedCallerArn;
      const callerAccount =
        typeof identity.Account === "string" ? identity.Account : "";
      const matches =
        callerAccount === scope.approvedAccountId &&
        arn === expectedArn &&
        arn.startsWith(`arn:${scope.partition}:`);
      findings.push(
        finding(
          "caller_identity",
          matches ? "PASS" : "FAIL",
          matches ? "IDENTITY_SCOPE_MATCHED" : "IDENTITY_SCOPE_MISMATCH",
          new Date(now).toISOString(),
          evidenceFingerprint,
          matches
            ? "Identity check is fixture evidence only; a live operator must independently verify account and role."
            : "Stop before all resource reads and resolve the exact account, partition, and caller identity."
        )
      );
      if (!matches) {
        break;
      }
      continue;
    }

    if (hasUncollectedPages(response)) {
      findings.push(
        finding(
          request.operation,
          "INCOMPLETE",
          "PAGINATION_REMAINS_UNCOLLECTED",
          new Date(now).toISOString(),
          evidenceFingerprint,
          "A continuation token or truncation flag remains; do not infer a complete inventory or issue an unbounded follow-up."
        )
      );
    } else {
      findings.push(
        evaluateB2ApiResponse(
          scope,
          request.operation,
          response,
          new Date(now).toISOString(),
          evidenceFingerprint
        )
      );
    }
  }

  const timestamp = new Date(now).toISOString();
  findings.push(
    finding(
      "eventbridge_source_semantics",
      "INCOMPLETE",
      "DEFAULT_BUS_AND_API_TOPOLOGY_REVIEW_REQUIRED",
      timestamp,
      null,
      "Do not generalize the EventBridge V2/custom-bus aws. source reservation to every default-bus, legacy PutEvents, forwarding, SQS, or mutation path."
    ),
    finding(
      "direct_sqs_injection_and_mutation",
      "INCOMPLETE",
      "EFFECTIVE_PERMISSION_INVENTORY_REQUIRED",
      timestamp,
      null,
      "Independently assess direct SendMessage, queue policy changes, rule/target mutation, PassRole, organization controls, and cross-account paths."
    ),
    finding(
      "guardduty_origin_and_live_activation",
      "INCOMPLETE",
      "NO_CRYPTOGRAPHIC_SOURCE_ATTESTATION",
      timestamp,
      null,
      "A matching event payload, policy snapshot, or STS identity does not authenticate GuardDuty delivery or mint TrustedScanDeliveryContext."
    ),
    finding(
      "database_runtime_role",
      "INCOMPLETE",
      "DATABASE_EVIDENCE_OUT_OF_SCOPE",
      timestamp,
      null,
      "Database identity and grants are not queried in B2-0; obtain separately authorized evidence in a later gate."
    ),
    finding(
      "selected_application_role_policy_documents",
      "INCOMPLETE",
      "DEPENDENT_POLICY_DOCUMENTS_REQUIRE_BOUNDED_REVIEW",
      timestamp,
      null,
      "Inspect only policy names and ARNs returned for the selected role, cap each set at four, and leave truncation or effective-permission ambiguity incomplete."
    )
  );

  return {
    schema: PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA,
    source: "fixture",
    scopeFingerprint: b2ScopeFingerprint(scope),
    findings,
    liveDecision: "NO_GO",
    requiresLiveOwnerVerification: true,
    limitation: LIMITATION,
  };
}

export function isB2ApprovalRecord(value: unknown): value is B2ApprovalRecord {
  return (
    record(value) &&
    value.schema === "phase13.project_document.aws_b2_approval.v1"
  );
}
