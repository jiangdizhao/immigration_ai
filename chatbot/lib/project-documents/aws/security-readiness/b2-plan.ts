import "server-only";

import { createHash } from "node:crypto";
import { b2ScopeFingerprint, validateB2Scope } from "./b2-scope";
import type {
  B2ReadOnlyOperation,
  B2ReadOnlyRequest,
  B2Scope,
} from "./b2-types";

const MAX_RESPONSE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 2000;
const MAX_PLAN_PAGES = 3;

type RequestTemplate = {
  operation: B2ReadOnlyOperation;
  input: (scope: B2Scope) => Record<string, string | number | string[]>;
  maxPages?: number;
};

const REQUEST_TEMPLATES: RequestTemplate[] = [
  { operation: "sts:GetCallerIdentity", input: () => ({}) },
  {
    operation: "s3:GetBucketLocation",
    input: (s) => ({
      Bucket: s.resourceSelectors.bucket,
      ExpectedBucketOwner: s.approvedAccountId,
    }),
  },
  {
    operation: "s3:GetBucketVersioning",
    input: (s) => ({
      Bucket: s.resourceSelectors.bucket,
      ExpectedBucketOwner: s.approvedAccountId,
    }),
  },
  {
    operation: "s3:GetPublicAccessBlock",
    input: (s) => ({
      Bucket: s.resourceSelectors.bucket,
      ExpectedBucketOwner: s.approvedAccountId,
    }),
  },
  {
    operation: "s3:GetBucketEncryption",
    input: (s) => ({
      Bucket: s.resourceSelectors.bucket,
      ExpectedBucketOwner: s.approvedAccountId,
    }),
  },
  {
    operation: "s3:GetBucketPolicyStatus",
    input: (s) => ({
      Bucket: s.resourceSelectors.bucket,
      ExpectedBucketOwner: s.approvedAccountId,
    }),
  },
  {
    operation: "s3:GetBucketPolicy",
    input: (s) => ({
      Bucket: s.resourceSelectors.bucket,
      ExpectedBucketOwner: s.approvedAccountId,
    }),
  },
  {
    operation: "guardduty:GetMalwareProtectionPlan",
    input: (s) => ({
      MalwareProtectionPlanId: s.resourceSelectors.guardDutyPlanId,
    }),
  },
  {
    operation: "events:DescribeEventBus",
    input: (s) => ({ Name: s.resourceSelectors.eventBusName }),
  },
  {
    operation: "events:DescribeRule",
    input: (s) => ({
      Name: s.resourceSelectors.eventRuleName,
      EventBusName: s.resourceSelectors.eventBusName,
    }),
  },
  {
    operation: "events:ListTargetsByRule",
    input: (s) => ({
      Rule: s.resourceSelectors.eventRuleName,
      EventBusName: s.resourceSelectors.eventBusName,
    }),
    maxPages: MAX_PLAN_PAGES,
  },
  {
    operation: "sqs:GetQueueAttributes",
    input: (s) => ({
      QueueUrl: s.resourceSelectors.queueUrl,
      AttributeNames: [
        "QueueArn",
        "Policy",
        "RedrivePolicy",
        "KmsMasterKeyId",
        "SqsManagedSseEnabled",
      ],
    }),
  },
  {
    operation: "iam:GetRole",
    input: (s) => ({
      RoleName: s.resourceSelectors.applicationRoleArn.split("/").at(-1) ?? "",
    }),
  },
  {
    operation: "iam:ListAttachedRolePolicies",
    input: (s) => ({
      RoleName: s.resourceSelectors.applicationRoleArn.split("/").at(-1) ?? "",
      MaxItems: 100,
    }),
  },
  {
    operation: "iam:ListRolePolicies",
    input: (s) => ({
      RoleName: s.resourceSelectors.applicationRoleArn.split("/").at(-1) ?? "",
      MaxItems: 100,
    }),
  },
  {
    operation: "kms:DescribeKey",
    input: (s): Record<string, string | number | string[]> => {
      if (!s.resourceSelectors.kmsKeyArn) {
        return {};
      }
      return { KeyId: s.resourceSelectors.kmsKeyArn };
    },
  },
  {
    operation: "kms:GetKeyPolicy",
    input: (s): Record<string, string | number | string[]> => {
      if (!s.resourceSelectors.kmsKeyArn) {
        return {};
      }
      return { KeyId: s.resourceSelectors.kmsKeyArn, PolicyName: "default" };
    },
  },
  {
    operation: "kms:ListGrants",
    input: (s): Record<string, string | number | string[]> => {
      if (!s.resourceSelectors.kmsKeyArn) {
        return {};
      }
      return { KeyId: s.resourceSelectors.kmsKeyArn, Limit: 100 };
    },
    maxPages: MAX_PLAN_PAGES,
  },
];

export type B2Plan = {
  schema: "phase13.project_document.aws_b2_plan.v1";
  mode: "plan";
  scopeFingerprint: string | null;
  callsUpperBound: number;
  totalDeadlineMs: number;
  requests: Array<{
    sequence: number;
    operation: B2ReadOnlyOperation;
    selectors: Array<{ parameter: string; fingerprint: string }>;
    maxPages: number;
    maxResponseBytes: number;
    timeoutMs: number;
    retries: 0;
  }>;
  dependentRequestPlan: Array<{
    operation: "iam:GetRolePolicy" | "iam:GetPolicy" | "iam:GetPolicyVersion";
    selectorSource: string;
    maximumItems: number;
    maxPages: 1;
    maxResponseBytes: number;
    timeoutMs: number;
    retries: 0;
  }>;
  missingInputs: string[];
  deniedOperations: string[];
  decision: "NO_GO";
};

function canonicalStaticValue(value: string | number | string[]) {
  return JSON.stringify(value);
}

function planFromValidatedScope(scope: B2Scope): B2Plan {
  const templates = REQUEST_TEMPLATES.filter(
    (template) =>
      scope.resourceSelectors.kmsKeyArn !== null ||
      !template.operation.startsWith("kms:")
  );
  const requests = templates.map((template, index) => {
    const input = template.input(scope);
    return {
      sequence: index + 1,
      operation: template.operation,
      selectors: Object.entries(input).map(([parameter, value]) => ({
        parameter,
        fingerprint: createHash("sha256")
          .update(canonicalStaticValue(value))
          .digest("hex"),
      })),
      maxPages: template.maxPages ?? 1,
      maxResponseBytes: MAX_RESPONSE_BYTES,
      timeoutMs: REQUEST_TIMEOUT_MS,
      retries: 0 as const,
    };
  });
  return {
    schema: "phase13.project_document.aws_b2_plan.v1",
    mode: "plan",
    scopeFingerprint: b2ScopeFingerprint(scope),
    callsUpperBound:
      requests.reduce((sum, request) => sum + request.maxPages, 0) + 12,
    totalDeadlineMs: 30_000,
    requests,
    dependentRequestPlan: [
      {
        operation: "iam:GetRolePolicy",
        selectorSource:
          "PolicyNames returned for the exact selected role; at most 4 names, otherwise INCOMPLETE",
        maximumItems: 4,
        maxPages: 1,
        maxResponseBytes: MAX_RESPONSE_BYTES,
        timeoutMs: REQUEST_TIMEOUT_MS,
        retries: 0,
      },
      {
        operation: "iam:GetPolicy",
        selectorSource:
          "PolicyArn returned for an attached policy on the exact selected role; at most 4 ARNs",
        maximumItems: 4,
        maxPages: 1,
        maxResponseBytes: MAX_RESPONSE_BYTES,
        timeoutMs: REQUEST_TIMEOUT_MS,
        retries: 0,
      },
      {
        operation: "iam:GetPolicyVersion",
        selectorSource:
          "DefaultVersionId returned by GetPolicy for the exact attached policy ARN",
        maximumItems: 4,
        maxPages: 1,
        maxResponseBytes: MAX_RESPONSE_BYTES,
        timeoutMs: REQUEST_TIMEOUT_MS,
        retries: 0,
      },
    ],
    missingInputs: [
      "No B2-1 owner approval is included; live collection remains blocked",
      ...(scope.resourceSelectors.kmsKeyArn
        ? []
        : ["KMS key ARN omitted; KMS evidence will remain INCOMPLETE"]),
    ],
    deniedOperations: [
      "s3:ListBuckets",
      "s3:ListObjects",
      "s3:GetObject",
      "sqs:ReceiveMessage",
      "sqs:SendMessage",
      "sqs:DeleteMessage",
      "events:PutEvents",
      "events:PutRule",
      "events:PutTargets",
      "iam:SimulatePrincipalPolicy",
      "sts:AssumeRole",
      "kms:Decrypt",
      "all PostgreSQL operations",
    ],
    decision: "NO_GO",
  };
}

/** Emits a redacted ordered plan. It never performs AWS, DB, or file access. */
export function createB2ReadOnlyPlan(input?: unknown): B2Plan {
  if (input === undefined) {
    const missingInputs = [
      "approvedAccountId",
      "partition",
      "region",
      "non-default awsProfile",
      "expectedCallerArn",
      "exact bucket and fixed project-document/ prefix",
      "GuardDuty plan ID and ARN",
      "default EventBridge bus and exact rule",
      "exact SQS queue, URL and DLQ",
      "selected application role ARN",
      "optional KMS key ARN or explicit omission",
      "time-bounded owner approval record (required for later B2-1 only)",
    ];
    return {
      schema: "phase13.project_document.aws_b2_plan.v1",
      mode: "plan",
      scopeFingerprint: null,
      callsUpperBound: 0,
      totalDeadlineMs: 30_000,
      requests: [],
      dependentRequestPlan: [],
      missingInputs,
      deniedOperations: [
        "all AWS operations in B2-0",
        "all PostgreSQL operations",
      ],
      decision: "NO_GO",
    };
  }
  try {
    return planFromValidatedScope(validateB2Scope(input));
  } catch {
    return {
      ...createB2ReadOnlyPlan(),
      missingInputs: [
        "scope rejected: provide a complete exact-selector scope",
      ],
    };
  }
}

export function isB2ReadOnlyOperation(
  value: unknown
): value is B2ReadOnlyOperation {
  return (
    typeof value === "string" &&
    [
      "sts:GetCallerIdentity",
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
      "s3:GetPublicAccessBlock",
      "s3:GetBucketEncryption",
      "s3:GetBucketPolicyStatus",
      "s3:GetBucketPolicy",
      "guardduty:GetMalwareProtectionPlan",
      "events:DescribeEventBus",
      "events:DescribeRule",
      "events:ListTargetsByRule",
      "sqs:GetQueueAttributes",
      "iam:GetRole",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:GetRolePolicy",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "kms:DescribeKey",
      "kms:GetKeyPolicy",
      "kms:ListGrants",
    ].includes(value)
  );
}

export function b2RequestTemplates(scopeInput: unknown): B2ReadOnlyRequest[] {
  const scope = validateB2Scope(scopeInput);
  return REQUEST_TEMPLATES.filter(
    (template) =>
      scope.resourceSelectors.kmsKeyArn !== null ||
      !template.operation.startsWith("kms:")
  ).map((template) => ({
    operation: template.operation,
    input: template.input(scope),
    maxPages: template.maxPages ?? 1,
    maxResponseBytes: MAX_RESPONSE_BYTES,
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxAttempts: 1,
  }));
}

export function fingerprintB2Evidence(value: unknown) {
  const serialized = canonicalizeB2Evidence(value);
  if (serialized === null) {
    throw new Error("B2_EVIDENCE_NOT_JSON_OR_BOUNDED");
  }
  return createHash("sha256").update(serialized).digest("hex");
}

/** Canonical bounded JSON for hashing; accessors, cycles and SDK class instances fail closed. */
export function canonicalizeB2Evidence(value: unknown): string | null {
  const seen = new WeakSet<object>();
  let nodes = 0;
  let outputBytes = 0;

  function append(value: string): string {
    outputBytes += Buffer.byteLength(value, "utf8");
    if (outputBytes > MAX_RESPONSE_BYTES) {
      throw new Error("B2_RESPONSE_TOO_LARGE");
    }
    return value;
  }

  function visit(current: unknown, depth: number): string {
    nodes += 1;
    if (nodes > 12_000 || depth > 18) {
      throw new Error("B2_RESPONSE_SHAPE_LIMIT");
    }
    if (current === null || typeof current === "boolean") {
      return append(JSON.stringify(current));
    }
    if (typeof current === "string") {
      if (current.length > 16_384) {
        throw new Error("B2_RESPONSE_STRING_LIMIT");
      }
      return append(JSON.stringify(current));
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new Error("B2_RESPONSE_NUMBER_INVALID");
      }
      return append(JSON.stringify(current));
    }
    if (typeof current !== "object") {
      throw new Error("B2_RESPONSE_TYPE_INVALID");
    }
    if (seen.has(current)) {
      throw new Error("B2_RESPONSE_CYCLE");
    }
    seen.add(current);

    if (Array.isArray(current)) {
      if (current.length > 1000) {
        throw new Error("B2_RESPONSE_ARRAY_LIMIT");
      }
      const keys = Reflect.ownKeys(current);
      if (
        keys.length !== current.length + 1 ||
        keys.some(
          (key) =>
            typeof key !== "string" ||
            (key !== "length" &&
              (!/^\d+$/u.test(key) || Number(key) >= current.length))
        )
      ) {
        throw new Error("B2_RESPONSE_ARRAY_SHAPE_INVALID");
      }
      let serialized = append("[");
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          current,
          String(index)
        );
        if (!descriptor || !Object.hasOwn(descriptor, "value")) {
          throw new Error("B2_RESPONSE_ACCESSOR_INVALID");
        }
        if (index > 0) {
          serialized += append(",");
        }
        serialized += visit(descriptor.value, depth + 1);
      }
      return serialized + append("]");
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("B2_RESPONSE_PROTOTYPE_INVALID");
    }
    const keys = Reflect.ownKeys(current);
    if (
      keys.length > 1000 ||
      keys.some((key) => typeof key !== "string" || key.length > 256)
    ) {
      throw new Error("B2_RESPONSE_OBJECT_LIMIT");
    }
    const entries = keys.slice().sort() as string[];
    let serialized = append("{");
    for (const [index, key] of entries.entries()) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) {
        throw new Error("B2_RESPONSE_ACCESSOR_INVALID");
      }
      if (index > 0) {
        serialized += append(",");
      }
      serialized += `${append(JSON.stringify(key))}${append(":")}${visit(descriptor.value, depth + 1)}`;
    }
    return serialized + append("}");
  }

  try {
    return visit(value, 0);
  } catch {
    return null;
  }
}
