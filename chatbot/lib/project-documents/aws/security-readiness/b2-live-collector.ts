import "server-only";

import { createHash } from "node:crypto";
import { evaluateB2ApiResponse } from "./b2-evidence";
import {
  B2_LIVE_MAX_RESPONSE_BYTES,
  B2_LIVE_REQUEST_TIMEOUT_MS,
  B2_LIVE_TOTAL_DEADLINE_MS,
  B2AwsCliFailure,
  type B2DependentIamRequest,
  type B2LiveCommandRequest,
  type B2LiveExecutor,
  hasB2LiveControlCharacters,
} from "./b2-live-executor";
import {
  b2RequestTemplates,
  canonicalizeB2Evidence,
  createB2ReadOnlyPlan,
} from "./b2-plan";
import {
  b2ScopeFingerprint,
  validateB2Approval,
  validateB2Scope,
} from "./b2-scope";
import type {
  B2ApprovalRecord,
  B2Observation,
  B2ObservationFinding,
  B2ReadOnlyOperation,
  B2ReadOnlyRequest,
  B2Scope,
} from "./b2-types";
import { PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA } from "./b2-types";

const LIVE_LIMITATION =
  "The local approval is self-attested workflow evidence, not independently verified owner consent. Read-only AWS configuration is not authenticated GuardDuty delivery, scanned object-byte proof, effective IAM proof, production consent, or production readiness. Live decision stays NO_GO; no trusted delivery capability is created.";
const IAM_POLICY_NAME_PATTERN = /^[A-Za-z0-9_+=,.@-]{1,128}$/u;
const IAM_VERSION_ID_PATTERN = /^v[1-9][0-9]{0,8}$/u;

export class B2LivePreflightError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "B2LivePreflightError";
    this.code = code;
  }
}

export type B2LiveCollectionInput = {
  scope: unknown;
  approval: unknown;
  confirmedAccountId: unknown;
  now?: number;
  clock?: () => number;
  signal?: AbortSignal;
};

export type B2ValidatedLiveInput = {
  scope: B2Scope;
  approval: B2ApprovalRecord;
  now: number;
  clock: () => number;
};

function dataRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string") {
        return false;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && Object.hasOwn(descriptor, "value");
    });
  } catch {
    return false;
  }
}

function own(value: unknown, key: string): unknown {
  if (!dataRecord(value)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value")
    ? descriptor.value
    : undefined;
}

function dataArray(value: unknown, maximum = 1000): unknown[] | null {
  if (!Array.isArray(value) || value.length > maximum) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== value.length + 1 ||
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (key !== "length" &&
            (!/^\d+$/u.test(key) || Number(key) >= value.length))
      )
    ) {
      return null;
    }
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, "value")) {
        return null;
      }
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

function timestamp(now: number): string {
  return new Date(now).toISOString();
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
    requirement: requirement.toLowerCase(),
    source: "live_executor",
    status,
    reasonCode,
    observedAt,
    evidenceFingerprint,
    outstandingAction,
  };
}

function fingerprintPages(pages: unknown[]): string | null {
  const hash = createHash("sha256");
  for (const page of pages) {
    const canonical = canonicalizeB2Evidence(page);
    if (canonical === null) {
      return null;
    }
    hash.update(String(Buffer.byteLength(canonical, "utf8")));
    hash.update(":");
    hash.update(canonical);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function responseSizeOk(value: unknown, maximum: number): boolean {
  const canonical = canonicalizeB2Evidence(value);
  return canonical !== null && Buffer.byteLength(canonical, "utf8") <= maximum;
}

function safeFailureCode(error: unknown): string {
  if (error instanceof B2LivePreflightError) {
    return error.code;
  }
  return error instanceof B2AwsCliFailure ? error.code : "AWS_EXECUTION_FAILED";
}

function errorAction(code: string) {
  if (code === "AWS_ACCESS_DENIED") {
    return "The selected read-only identity was denied. Do not broaden permissions; record the denied operation for owner review.";
  }
  if (code === "AWS_RESOURCE_MISSING") {
    return "The pinned resource was not returned. Do not discover or substitute another resource; confirm its existence with the owner.";
  }
  if (code === "AWS_CLI_TIMEOUT") {
    return "The bounded request timed out. Do not retry automatically or extend the collection deadline.";
  }
  return "The bounded CLI request did not produce an acceptable response. Do not retain raw stderr or widen the request scope.";
}

export function validateB2LiveCollectionInput(
  input: B2LiveCollectionInput,
  executor: B2LiveExecutor
): B2ValidatedLiveInput {
  let scope: B2Scope;
  try {
    scope = validateB2Scope(input.scope);
  } catch {
    throw new B2LivePreflightError("SCOPE_INVALID");
  }
  const clock = input.clock ?? (() => input.now ?? Date.now());
  const now = input.now ?? clock();
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) {
    throw new B2LivePreflightError("CLOCK_INVALID");
  }
  if (executor?.kind !== "aws_cli_v2") {
    throw new B2LivePreflightError("LIVE_EXECUTOR_INVALID");
  }
  if (input.confirmedAccountId !== scope.approvedAccountId) {
    throw new B2LivePreflightError("CONFIRMED_ACCOUNT_MISMATCH");
  }
  if (!validateB2Approval(input.approval, scope, now)) {
    throw new B2LivePreflightError("APPROVAL_INVALID_OR_EXPIRED");
  }
  return {
    scope,
    approval: input.approval,
    now,
    clock,
  };
}

function paginationInfo(
  operation: B2ReadOnlyOperation,
  response: unknown
): { token: string | null; malformed: boolean; unhandled: boolean } {
  const nextToken = own(response, "NextToken");
  const marker = own(response, "Marker");
  const nextMarker = own(response, "NextMarker");
  const truncated =
    own(response, "IsTruncated") === true ||
    own(response, "Truncated") === true;
  if (operation === "events:ListTargetsByRule") {
    if (nextToken === undefined || nextToken === null || nextToken === "") {
      return { token: null, malformed: truncated, unhandled: false };
    }
    return typeof nextToken === "string" &&
      nextToken.length <= 2048 &&
      !nextToken.startsWith("-") &&
      !hasB2LiveControlCharacters(nextToken)
      ? { token: nextToken, malformed: false, unhandled: false }
      : { token: null, malformed: true, unhandled: false };
  }
  if (operation === "kms:ListGrants") {
    if (!truncated) {
      return {
        token: null,
        malformed: marker !== undefined || nextMarker !== undefined,
        unhandled: false,
      };
    }
    const token = marker ?? nextMarker;
    return typeof token === "string" &&
      token.length > 0 &&
      token.length <= 2048 &&
      !token.startsWith("-") &&
      !hasB2LiveControlCharacters(token)
      ? { token, malformed: false, unhandled: false }
      : { token: null, malformed: true, unhandled: false };
  }
  const anyCursor =
    (typeof nextToken === "string" && nextToken.length > 0) ||
    (typeof marker === "string" && marker.length > 0) ||
    (typeof nextMarker === "string" && nextMarker.length > 0) ||
    truncated;
  return { token: null, malformed: false, unhandled: anyCursor };
}

function mergePages(operation: B2ReadOnlyOperation, pages: unknown[]) {
  if (pages.length === 1) {
    return pages[0];
  }
  if (!pages.every(dataRecord)) {
    return null;
  }
  const arrayField =
    operation === "events:ListTargetsByRule"
      ? "Targets"
      : operation === "kms:ListGrants"
        ? "Grants"
        : null;
  if (!arrayField) {
    return null;
  }
  const merged: Record<string, unknown> = { ...pages[0] };
  const allEntries: unknown[] = [];
  for (const page of pages) {
    const entries = dataArray(own(page, arrayField));
    if (entries === null || allEntries.length + entries.length > 1000) {
      return null;
    }
    allEntries.push(...entries);
  }
  merged[arrayField] = allEntries;
  for (const key of [
    "NextToken",
    "NextMarker",
    "Marker",
    "IsTruncated",
    "Truncated",
  ]) {
    delete merged[key];
  }
  return merged;
}

function makeDependentRequest(
  operation: B2DependentIamRequest["operation"],
  input: Record<string, string>
): B2DependentIamRequest {
  return { kind: "dependent_iam", operation, input };
}

function iamRoleName(scope: B2Scope) {
  return scope.resourceSelectors.applicationRoleArn.split("/").at(-1) ?? "";
}

function policyArnAllowed(scope: B2Scope, value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) {
    return false;
  }
  const pattern = new RegExp(
    `^arn:${scope.partition}:iam::(?:${scope.approvedAccountId}|aws):policy\\/[A-Za-z0-9_+=,.@/-]{1,512}$`,
    "u"
  );
  return pattern.test(value);
}

type ExecutionBudget = {
  callCount: number;
  maxCalls: number;
  deadlineAt: number;
  scope: B2Scope;
  approval: B2ApprovalRecord;
  clock: () => number;
  authorizationExpired: boolean;
};

async function executeBounded(
  executor: B2LiveExecutor,
  scope: B2Scope,
  command: B2LiveCommandRequest,
  budget: ExecutionBudget,
  signal?: AbortSignal
): Promise<unknown> {
  if (budget.authorizationExpired) {
    throw new B2LivePreflightError("APPROVAL_EXPIRED_DURING_COLLECTION");
  }
  const authorizationNow = budget.clock();
  if (
    !Number.isFinite(authorizationNow) ||
    !validateB2Approval(budget.approval, budget.scope, authorizationNow)
  ) {
    budget.authorizationExpired = true;
    throw new B2LivePreflightError("APPROVAL_EXPIRED_DURING_COLLECTION");
  }
  if (signal?.aborted) {
    throw new B2AwsCliFailure("AWS_CLI_ABORTED");
  }
  if (budget.callCount >= budget.maxCalls) {
    throw new B2AwsCliFailure("AWS_CALL_LIMIT_REACHED");
  }
  const remainingMs = budget.deadlineAt - performance.now();
  if (remainingMs <= 0) {
    throw new B2AwsCliFailure("AWS_CLI_TIMEOUT");
  }
  budget.callCount += 1;
  const controller = new AbortController();
  const timeoutMs = Math.max(
    1,
    Math.min(B2_LIVE_REQUEST_TIMEOUT_MS, remainingMs)
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });
  try {
    return await Promise.race([
      executor.execute(command, {
        signal: controller.signal,
        profile: scope.awsProfile,
        region: scope.region,
      }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () =>
            reject(
              new B2AwsCliFailure(
                signal?.aborted ? "AWS_CLI_ABORTED" : "AWS_CLI_TIMEOUT"
              )
            ),
          { once: true }
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}

function pushIncomplete(
  findings: B2ObservationFinding[],
  requirement: string,
  reasonCode: string,
  now: number,
  fingerprint: string | null = null,
  action = "Obtain bounded owner-reviewed evidence; do not expand access or infer production readiness."
) {
  findings.push(
    finding(
      requirement,
      "INCOMPLETE",
      reasonCode,
      timestamp(now),
      fingerprint,
      action
    )
  );
}

type CollectedPrimary = {
  response: unknown;
  complete: boolean;
};

async function collectPrimary(
  executor: B2LiveExecutor,
  scope: B2Scope,
  request: B2ReadOnlyRequest,
  findings: B2ObservationFinding[],
  budget: ExecutionBudget,
  now: number,
  signal?: AbortSignal
): Promise<CollectedPrimary | null> {
  const pages: unknown[] = [];
  let pageToken: string | undefined;
  let complete = true;
  for (let pageIndex = 0; pageIndex < request.maxPages; pageIndex += 1) {
    let response: unknown;
    try {
      response = await executeBounded(
        executor,
        scope,
        {
          kind: "primary",
          request,
          ...(pageToken ? { pageToken } : {}),
        },
        budget,
        signal
      );
    } catch (error) {
      const code = safeFailureCode(error);
      pushIncomplete(
        findings,
        request.operation,
        code,
        now,
        fingerprintPages(pages),
        errorAction(code)
      );
      return null;
    }
    if (!responseSizeOk(response, request.maxResponseBytes)) {
      pushIncomplete(
        findings,
        request.operation,
        "AWS_RESPONSE_SIZE_OR_SHAPE_LIMIT",
        now
      );
      return null;
    }
    pages.push(response);
    const pagination = paginationInfo(request.operation, response);
    if (pagination.malformed || pagination.unhandled) {
      complete = false;
      break;
    }
    if (pagination.token === null) {
      break;
    }
    if (pageIndex + 1 === request.maxPages) {
      complete = false;
      break;
    }
    pageToken = pagination.token;
  }

  const merged = mergePages(request.operation, pages);
  const fingerprint = fingerprintPages(pages);
  if (merged === null || fingerprint === null) {
    pushIncomplete(
      findings,
      request.operation,
      "AWS_PAGINATED_RESPONSE_SHAPE_INVALID",
      now,
      fingerprint
    );
    return null;
  }
  if (!complete) {
    pushIncomplete(
      findings,
      request.operation,
      "PAGINATION_INCOMPLETE",
      now,
      fingerprint,
      "The fixed page limit or response shape prevented a complete bounded listing; do not infer a complete resource inventory."
    );
    return { response: merged, complete: false };
  }
  const evaluated = evaluateB2ApiResponse(
    scope,
    request.operation,
    merged,
    timestamp(now),
    fingerprint
  );
  findings.push({
    ...evaluated,
    requirement: evaluated.requirement.toLowerCase(),
    source: "live_executor",
  });
  return { response: merged, complete: true };
}

async function executeDependent(
  executor: B2LiveExecutor,
  scope: B2Scope,
  request: B2DependentIamRequest,
  findings: B2ObservationFinding[],
  budget: ExecutionBudget,
  now: number,
  signal?: AbortSignal
): Promise<unknown | null> {
  try {
    const response = await executeBounded(
      executor,
      scope,
      request,
      budget,
      signal
    );
    if (!responseSizeOk(response, B2_LIVE_MAX_RESPONSE_BYTES)) {
      pushIncomplete(
        findings,
        request.operation,
        "AWS_RESPONSE_SIZE_OR_SHAPE_LIMIT",
        now
      );
      return null;
    }
    const fingerprint = fingerprintPages([response]);
    if (!fingerprint) {
      pushIncomplete(
        findings,
        request.operation,
        "AWS_RESPONSE_FINGERPRINT_FAILED",
        now
      );
      return null;
    }
    pushIncomplete(
      findings,
      request.operation,
      "IAM_POLICY_DOCUMENT_REVIEW_REQUIRED",
      now,
      fingerprint,
      "The dependent document was captured by a bounded read; policy semantics, external controls and effective permissions still require independent review."
    );
    return response;
  } catch (error) {
    const code = safeFailureCode(error);
    pushIncomplete(
      findings,
      request.operation,
      code,
      now,
      null,
      errorAction(code)
    );
    return null;
  }
}

function policyNames(
  response: unknown
): { names: string[]; limited: boolean } | null {
  const values = dataArray(own(response, "PolicyNames"), 100);
  if (
    !values ||
    values.some(
      (value) =>
        typeof value !== "string" || !IAM_POLICY_NAME_PATTERN.test(value)
    )
  ) {
    return null;
  }
  const names = values as string[];
  return { names: [...new Set(names)].slice(0, 4), limited: names.length > 4 };
}

function attachedPolicyArns(
  scope: B2Scope,
  response: unknown
): { arns: string[]; limited: boolean } | null {
  const values = dataArray(own(response, "AttachedPolicies"), 100);
  if (!values) {
    return null;
  }
  const arns: string[] = [];
  for (const value of values) {
    const arn = own(value, "PolicyArn");
    if (!policyArnAllowed(scope, arn)) {
      return null;
    }
    arns.push(arn);
  }
  const unique = [...new Set(arns)];
  return { arns: unique.slice(0, 4), limited: unique.length > 4 };
}

async function collectDependentIamEvidence(
  executor: B2LiveExecutor,
  scope: B2Scope,
  responses: Map<B2ReadOnlyOperation, CollectedPrimary>,
  findings: B2ObservationFinding[],
  budget: ExecutionBudget,
  now: number,
  signal?: AbortSignal
) {
  const roleName = iamRoleName(scope);
  const inlinePrimary = responses.get("iam:ListRolePolicies");
  if (inlinePrimary) {
    const list = policyNames(inlinePrimary.response);
    if (list) {
      if (list.limited || !inlinePrimary.complete) {
        pushIncomplete(
          findings,
          "iam:GetRolePolicy",
          "IAM_INLINE_POLICY_LIMIT_OR_TRUNCATION",
          now
        );
      }
      for (const name of list.names) {
        await executeDependent(
          executor,
          scope,
          makeDependentRequest("iam:GetRolePolicy", {
            RoleName: roleName,
            PolicyName: name,
          }),
          findings,
          budget,
          now,
          signal
        );
        if (
          signal?.aborted ||
          budget.authorizationExpired ||
          performance.now() >= budget.deadlineAt
        ) {
          break;
        }
      }
    } else {
      pushIncomplete(
        findings,
        "iam:GetRolePolicy",
        "IAM_INLINE_POLICY_NAMES_INVALID",
        now
      );
    }
  }

  const attachedPrimary = responses.get("iam:ListAttachedRolePolicies");
  if (!attachedPrimary) {
    return;
  }
  const attached = attachedPolicyArns(scope, attachedPrimary.response);
  if (!attached) {
    pushIncomplete(
      findings,
      "iam:GetPolicy",
      "IAM_ATTACHED_POLICY_ARNS_INVALID",
      now
    );
    return;
  }
  if (attached.limited || !attachedPrimary.complete) {
    pushIncomplete(
      findings,
      "iam:GetPolicy",
      "IAM_ATTACHED_POLICY_LIMIT_OR_TRUNCATION",
      now
    );
  }
  for (const policyArn of attached.arns) {
    const policyResponse = await executeDependent(
      executor,
      scope,
      makeDependentRequest("iam:GetPolicy", { PolicyArn: policyArn }),
      findings,
      budget,
      now,
      signal
    );
    const policy = own(policyResponse, "Policy");
    const returnedArn = own(policy, "Arn");
    const versionId = own(policy, "DefaultVersionId");
    if (
      returnedArn !== policyArn ||
      typeof versionId !== "string" ||
      !IAM_VERSION_ID_PATTERN.test(versionId)
    ) {
      pushIncomplete(
        findings,
        "iam:GetPolicyVersion",
        "IAM_POLICY_IDENTITY_OR_VERSION_INVALID",
        now
      );
      continue;
    }
    await executeDependent(
      executor,
      scope,
      makeDependentRequest("iam:GetPolicyVersion", {
        PolicyArn: policyArn,
        VersionId: versionId,
      }),
      findings,
      budget,
      now,
      signal
    );
    if (
      signal?.aborted ||
      budget.authorizationExpired ||
      performance.now() >= budget.deadlineAt
    ) {
      break;
    }
  }
}

function addUnconditionalNoGoFindings(
  findings: B2ObservationFinding[],
  now: number
) {
  findings.push(
    finding(
      "eventbridge_source_semantics",
      "INCOMPLETE",
      "DEFAULT_BUS_AND_API_TOPOLOGY_REVIEW_REQUIRED",
      timestamp(now),
      null,
      "Read-only configuration cannot establish all default-bus injection, forwarding, queue-policy mutation or administrative paths."
    ),
    finding(
      "direct_sqs_injection_and_mutation",
      "INCOMPLETE",
      "EFFECTIVE_PERMISSION_INVENTORY_REQUIRED",
      timestamp(now),
      null,
      "Read-only snapshots cannot establish effective SCP, boundary, session, cross-account or administrative permissions."
    ),
    finding(
      "guardduty_origin_and_live_activation",
      "INCOMPLETE",
      "NO_CRYPTOGRAPHIC_SOURCE_ATTESTATION",
      timestamp(now),
      null,
      "No configuration or event payload authenticates GuardDuty delivery or mints a trusted scan context."
    ),
    finding(
      "database_runtime_role",
      "INCOMPLETE",
      "DATABASE_EVIDENCE_OUT_OF_SCOPE",
      timestamp(now),
      null,
      "Database identity and grants are not queried by this AWS-only executor."
    ),
    finding(
      "selected_application_role_effective_permissions",
      "INCOMPLETE",
      "EFFECTIVE_PERMISSION_SEMANTICS_UNRESOLVED",
      timestamp(now),
      null,
      "Captured policy documents do not account for every AWS control plane or prove effective permissions."
    )
  );
}

function liveObservation(
  scope: B2Scope,
  findings: B2ObservationFinding[]
): B2Observation {
  return {
    schema: PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA,
    source: "live_operator_readonly",
    scopeFingerprint: b2ScopeFingerprint(scope),
    findings,
    liveDecision: "NO_GO",
    requiresLiveOwnerVerification: true,
    limitation: LIVE_LIMITATION,
  };
}

/**
 * Runs the B2-1 collection protocol against the injected CLI executor. The
 * only first request is STS; identity mismatch prevents all resource calls.
 */
export async function collectB2LiveObservation(
  input: B2LiveCollectionInput,
  executor: B2LiveExecutor
): Promise<B2Observation> {
  const validated = validateB2LiveCollectionInput(input, executor);
  const { scope, now, clock } = validated;
  const requests = b2RequestTemplates(scope);
  if (requests[0]?.operation !== "sts:GetCallerIdentity") {
    throw new B2LivePreflightError("STS_FIRST_INVARIANT_FAILED");
  }
  const findings: B2ObservationFinding[] = [];
  const responses = new Map<B2ReadOnlyOperation, CollectedPrimary>();
  const plan = createB2ReadOnlyPlan(scope);
  const budget: ExecutionBudget = {
    callCount: 0,
    maxCalls: plan.callsUpperBound,
    deadlineAt: performance.now() + B2_LIVE_TOTAL_DEADLINE_MS,
    scope,
    approval: validated.approval,
    clock,
    authorizationExpired: false,
  };
  const identityRequest = requests[0];
  let identityResponse: unknown;
  try {
    identityResponse = await executeBounded(
      executor,
      scope,
      { kind: "primary", request: identityRequest },
      budget,
      input.signal
    );
  } catch (error) {
    const code = safeFailureCode(error);
    pushIncomplete(
      findings,
      "caller_identity",
      code,
      now,
      null,
      errorAction(code)
    );
    addUnconditionalNoGoFindings(findings, now);
    return liveObservation(scope, findings);
  }
  if (!responseSizeOk(identityResponse, identityRequest.maxResponseBytes)) {
    pushIncomplete(
      findings,
      "caller_identity",
      "IDENTITY_RESPONSE_SHAPE_OR_SIZE_INVALID",
      now
    );
    addUnconditionalNoGoFindings(findings, now);
    return liveObservation(scope, findings);
  }
  const identityFingerprint = fingerprintPages([identityResponse]);
  const account = own(identityResponse, "Account");
  const callerArn = own(identityResponse, "Arn");
  if (typeof account !== "string" || typeof callerArn !== "string") {
    pushIncomplete(
      findings,
      "caller_identity",
      "IDENTITY_RESPONSE_SHAPE_INVALID",
      now,
      identityFingerprint
    );
    addUnconditionalNoGoFindings(findings, now);
    return liveObservation(scope, findings);
  }
  const identityMatches =
    account === scope.approvedAccountId &&
    callerArn === scope.expectedCallerArn &&
    callerArn.startsWith(`arn:${scope.partition}:`);
  findings.push(
    finding(
      "caller_identity",
      identityMatches ? "PASS" : "FAIL",
      identityMatches ? "IDENTITY_SCOPE_MATCHED" : "IDENTITY_SCOPE_MISMATCH",
      timestamp(now),
      identityFingerprint,
      identityMatches
        ? "The pinned account and exact caller ARN matched; this does not establish production authorization or effective permissions."
        : "Stop: the actual account or caller ARN did not exactly match the approved scope. No resource requests were made."
    )
  );
  if (!identityMatches) {
    addUnconditionalNoGoFindings(findings, now);
    return liveObservation(scope, findings);
  }

  for (const request of requests.slice(1)) {
    if (budget.authorizationExpired) {
      pushIncomplete(
        findings,
        request.operation,
        "APPROVAL_EXPIRED_DURING_COLLECTION",
        now,
        null,
        "The bounded authorization expired; no further AWS requests were initiated."
      );
      continue;
    }
    if (input.signal?.aborted) {
      pushIncomplete(
        findings,
        request.operation,
        "COLLECTION_CANCELLED",
        now,
        null,
        "The local operator cancelled collection; unrequested evidence remains incomplete."
      );
      continue;
    }
    if (performance.now() >= budget.deadlineAt) {
      pushIncomplete(
        findings,
        request.operation,
        "TOTAL_DEADLINE_EXCEEDED",
        now
      );
      continue;
    }
    const collected = await collectPrimary(
      executor,
      scope,
      request,
      findings,
      budget,
      now,
      input.signal
    );
    if (collected) {
      responses.set(request.operation, collected);
    }
  }

  if (
    !input.signal?.aborted &&
    !budget.authorizationExpired &&
    performance.now() < budget.deadlineAt
  ) {
    await collectDependentIamEvidence(
      executor,
      scope,
      responses,
      findings,
      budget,
      now,
      input.signal
    );
  } else {
    pushIncomplete(
      findings,
      "selected_application_role_policy_documents",
      input.signal?.aborted
        ? "COLLECTION_CANCELLED"
        : budget.authorizationExpired
          ? "APPROVAL_EXPIRED_DURING_COLLECTION"
          : "TOTAL_DEADLINE_EXCEEDED",
      now,
      null,
      budget.authorizationExpired
        ? "The bounded authorization expired; no further AWS requests were initiated."
        : "Obtain bounded owner-reviewed evidence; do not expand access or infer production readiness."
    );
  }
  addUnconditionalNoGoFindings(findings, now);
  return liveObservation(scope, findings);
}
