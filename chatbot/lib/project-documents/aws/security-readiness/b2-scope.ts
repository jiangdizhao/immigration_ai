import "server-only";

import { createHash } from "node:crypto";
import type { B2ApprovalRecord, B2Scope } from "./b2-types";

const BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{1,61})[a-z0-9]$/u;
const ARN_ACCOUNT_PATTERN = /^\d{12}$/u;
const PROFILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u;
const REGION_PATTERN = /^[a-z]{2}(?:-[a-z0-9]+)+-\d$/u;
const PLAN_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/u;
const RULE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/u;
const QUEUE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,75}(?:\.fifo)?$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Reflect.ownKeys(value);
  return (
    actual.length === keys.length &&
    actual.every((key) => typeof key === "string" && keys.includes(key)) &&
    actual.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && Object.hasOwn(descriptor, "value");
    })
  );
}

function arn(value: unknown, pattern: RegExp): value is string {
  return (
    typeof value === "string" &&
    value.length <= 512 &&
    !/[\s*?]/u.test(value) &&
    pattern.test(value)
  );
}

function expectedQueueUrl(
  value: unknown,
  region: string,
  accountId: string,
  queueName: string,
  partition: string
) {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const parsed = new URL(value);
    const suffix =
      partition === "aws-cn" ? "amazonaws.com.cn" : "amazonaws.com";
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.hostname === `sqs.${region}.${suffix}` &&
      parsed.pathname === `/${accountId}/${queueName}`
    );
  } catch {
    return false;
  }
}

function validRegionPartition(region: string, partition: string) {
  if (region.length > 64 || !REGION_PATTERN.test(region)) {
    return false;
  }
  if (partition === "aws-cn") {
    return region.startsWith("cn-");
  }
  if (partition === "aws-us-gov") {
    return region.startsWith("us-gov-");
  }
  return !region.startsWith("cn-") && !region.startsWith("us-gov-");
}

/** Strictly validates a JSON scope. It never consults environment credentials. */
export function validateB2Scope(input: unknown): B2Scope {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "schema",
      "environment",
      "approvedAccountId",
      "region",
      "partition",
      "awsProfile",
      "expectedCallerArn",
      "resourceSelectors",
    ])
  ) {
    throw new Error("B2_SCOPE_INVALID");
  }
  const {
    schema,
    environment,
    approvedAccountId,
    region,
    partition,
    awsProfile,
    expectedCallerArn,
    resourceSelectors,
  } = input;
  if (
    schema !== "phase13.project_document.aws_b2_scope.v1" ||
    environment !== "isolated_sandbox" ||
    typeof approvedAccountId !== "string" ||
    !ARN_ACCOUNT_PATTERN.test(approvedAccountId) ||
    typeof region !== "string" ||
    typeof partition !== "string" ||
    !["aws", "aws-us-gov", "aws-cn"].includes(partition) ||
    !validRegionPartition(region, partition) ||
    typeof awsProfile !== "string" ||
    !PROFILE_PATTERN.test(awsProfile) ||
    awsProfile.toLowerCase() === "default" ||
    typeof expectedCallerArn !== "string" ||
    !arn(
      expectedCallerArn,
      new RegExp(
        `^arn:${partition}:sts::${approvedAccountId}:assumed-role\\/[^/]+\\/[^/]+$|^arn:${partition}:iam::${approvedAccountId}:user\\/.+$`,
        "u"
      )
    ) ||
    !isRecord(resourceSelectors)
  ) {
    throw new Error("B2_SCOPE_INVALID");
  }

  const selectorKeys = [
    "bucket",
    "projectDocumentPrefix",
    "guardDutyPlanId",
    "guardDutyPlanArn",
    "eventBusName",
    "eventBusArn",
    "eventRuleName",
    "eventRuleArn",
    "queueName",
    "queueArn",
    "queueUrl",
    "dlqArn",
    "applicationRoleArn",
    "kmsKeyArn",
  ];
  if (!hasExactKeys(resourceSelectors, selectorKeys)) {
    throw new Error("B2_SCOPE_INVALID");
  }
  const s = resourceSelectors;
  const planArnPattern = new RegExp(
    `^arn:${partition}:guardduty:${region}:${approvedAccountId}:malware-protection-plan\\/${PLAN_ID_PATTERN.source.slice(1, -1)}$`,
    "u"
  );
  const eventRuleArn = `arn:${partition}:events:${region}:${approvedAccountId}:rule/${String(s.eventRuleName)}`;
  const eventBusArn = `arn:${partition}:events:${region}:${approvedAccountId}:event-bus/default`;
  const queueArnPattern = new RegExp(
    `^arn:${partition}:sqs:${region}:${approvedAccountId}:${QUEUE_NAME_PATTERN.source.slice(1, -1)}$`,
    "u"
  );
  const rolePattern = new RegExp(
    `^arn:${partition}:iam::${approvedAccountId}:role\\/.+$`,
    "u"
  );
  const kmsPattern = new RegExp(
    `^arn:${partition}:kms:${region}:${approvedAccountId}:key\\/[A-Za-z0-9-]{1,128}$`,
    "u"
  );
  if (
    typeof s.bucket !== "string" ||
    !BUCKET_PATTERN.test(s.bucket) ||
    s.bucket.includes("..") ||
    s.bucket.includes(".-") ||
    s.bucket.includes("-.") ||
    /^[0-9.]+$/u.test(s.bucket) ||
    s.bucket.startsWith("xn--") ||
    s.bucket.endsWith("-s3alias") ||
    s.bucket.endsWith("--ol-s3") ||
    s.projectDocumentPrefix !== "project-document/" ||
    typeof s.guardDutyPlanId !== "string" ||
    !PLAN_ID_PATTERN.test(s.guardDutyPlanId) ||
    !arn(s.guardDutyPlanArn, planArnPattern) ||
    s.guardDutyPlanArn.endsWith(`/${s.guardDutyPlanId}`) === false ||
    s.eventBusName !== "default" ||
    s.eventBusArn !== eventBusArn ||
    typeof s.eventRuleName !== "string" ||
    !RULE_NAME_PATTERN.test(s.eventRuleName) ||
    s.eventRuleArn !== eventRuleArn ||
    typeof s.queueName !== "string" ||
    !QUEUE_NAME_PATTERN.test(s.queueName) ||
    !arn(s.queueArn, queueArnPattern) ||
    !expectedQueueUrl(
      s.queueUrl,
      region,
      approvedAccountId,
      s.queueName,
      partition
    ) ||
    typeof s.queueUrl !== "string" ||
    s.queueUrl.length > 1024 ||
    !arn(s.dlqArn, queueArnPattern) ||
    s.dlqArn === s.queueArn ||
    !arn(s.applicationRoleArn, rolePattern) ||
    (s.kmsKeyArn !== null && !arn(s.kmsKeyArn, kmsPattern)) ||
    s.queueArn !==
      `arn:${partition}:sqs:${region}:${approvedAccountId}:${s.queueName}`
  ) {
    throw new Error("B2_SCOPE_INVALID");
  }

  return input as unknown as B2Scope;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function b2ScopeFingerprint(scope: B2Scope) {
  return createHash("sha256").update(canonicalJson(scope)).digest("hex");
}

/** Approval is local workflow evidence only, not proof of identity or consent. */
export function validateB2Approval(
  input: unknown,
  scope: B2Scope,
  now = Date.now()
): input is B2ApprovalRecord {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "schema",
      "approvalId",
      "approvedAt",
      "expiresAt",
      "approvedScope",
      "scope",
      "acknowledgements",
    ]) ||
    input.schema !== "phase13.project_document.aws_b2_approval.v1" ||
    typeof input.approvalId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      input.approvalId
    ) ||
    input.scope !== "read_only" ||
    !isRecord(input.acknowledgements) ||
    !hasExactKeys(input.acknowledgements, [
      "nonproductionOnly",
      "noMutation",
      "noObjectAccess",
      "noMessageConsumption",
    ]) ||
    input.acknowledgements.nonproductionOnly !== true ||
    input.acknowledgements.noMutation !== true ||
    input.acknowledgements.noObjectAccess !== true ||
    input.acknowledgements.noMessageConsumption !== true
  ) {
    return false;
  }
  if (
    typeof input.approvedAt !== "string" ||
    typeof input.expiresAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(
      input.approvedAt
    ) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(
      input.expiresAt
    )
  ) {
    return false;
  }
  let approvedScope: B2Scope;
  try {
    approvedScope = validateB2Scope(input.approvedScope);
  } catch {
    return false;
  }
  const approvedAt = Date.parse(input.approvedAt);
  const expiresAt = Date.parse(input.expiresAt);
  const maximumWindowMs = 60 * 60 * 1000;
  return (
    b2ScopeFingerprint(approvedScope) === b2ScopeFingerprint(scope) &&
    Number.isFinite(approvedAt) &&
    Number.isFinite(expiresAt) &&
    approvedAt <= now &&
    expiresAt > now &&
    expiresAt > approvedAt &&
    expiresAt - approvedAt <= maximumWindowMs
  );
}
