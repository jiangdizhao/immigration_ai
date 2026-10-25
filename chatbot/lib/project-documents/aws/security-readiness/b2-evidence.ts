import "server-only";

import type {
  B2ObservationFinding,
  B2ReadOnlyOperation,
  B2Scope,
} from "./b2-types";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function own(value: unknown, key: string): unknown {
  if (!record(value)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value")
    ? descriptor.value
    : undefined;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (record(value)) {
    return value;
  }
  if (typeof value !== "string" || value.length > 128 * 1024) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return record(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] | null {
  if (typeof value === "string" && value.length <= 512) {
    return [value];
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 32 &&
    value.every((entry) => typeof entry === "string" && entry.length <= 512)
  ) {
    return value as string[];
  }
  return null;
}

/** Match the bounded IAM glob syntax needed for this one SQS action. */
function iamGlobMatches(pattern: string, target: string): boolean | null {
  if (
    pattern.length > 512 ||
    !/^[a-z0-9:/*?._-]+$/iu.test(pattern) ||
    !/^[a-z0-9:/*?._-]+$/iu.test(target)
  ) {
    return null;
  }
  const normalizedPattern = pattern.toLowerCase();
  const normalizedTarget = target.toLowerCase();
  let patternIndex = 0;
  let targetIndex = 0;
  let starIndex = -1;
  let retryTargetIndex = -1;

  while (targetIndex < normalizedTarget.length) {
    const token = normalizedPattern[patternIndex];
    if (token === normalizedTarget[targetIndex] || token === "?") {
      patternIndex += 1;
      targetIndex += 1;
    } else if (token === "*") {
      starIndex = patternIndex;
      retryTargetIndex = targetIndex;
      patternIndex += 1;
    } else if (starIndex >= 0) {
      patternIndex = starIndex + 1;
      retryTargetIndex += 1;
      targetIndex = retryTargetIndex;
    } else {
      return false;
    }
  }

  while (normalizedPattern[patternIndex] === "*") {
    patternIndex += 1;
  }
  return patternIndex === normalizedPattern.length;
}

function finding(
  operation: B2ReadOnlyOperation,
  status: B2ObservationFinding["status"],
  reasonCode: string,
  observedAt: string,
  evidenceFingerprint: string,
  outstandingAction: string
): B2ObservationFinding {
  return {
    requirement: operation,
    source: "fixture_executor",
    status,
    reasonCode,
    observedAt,
    evidenceFingerprint,
    outstandingAction,
  };
}

function incomplete(
  operation: B2ReadOnlyOperation,
  observedAt: string,
  fingerprint: string,
  reasonCode = "STATIC_REVIEW_REQUIRED"
) {
  return finding(
    operation,
    "INCOMPLETE",
    reasonCode,
    observedAt,
    fingerprint,
    "Use only the sanitized evidence for independent static review; this observation cannot prove effective permissions or source authenticity."
  );
}

function statusFinding(
  operation: B2ReadOnlyOperation,
  matched: boolean | null,
  observedAt: string,
  fingerprint: string,
  passCode: string,
  failCode: string,
  incompleteCode: string,
  passAction: string,
  failAction: string
) {
  if (matched === null) {
    return finding(
      operation,
      "INCOMPLETE",
      incompleteCode,
      observedAt,
      fingerprint,
      "Capture a complete bounded response and review it with the owner; do not widen permissions automatically."
    );
  }
  return finding(
    operation,
    matched ? "PASS" : "FAIL",
    matched ? passCode : failCode,
    observedAt,
    fingerprint,
    matched ? passAction : failAction
  );
}

function exactArray(value: unknown, expected: string) {
  if (!Array.isArray(value)) {
    return null;
  }
  const values = stringList(value);
  if (!values) {
    return null;
  }
  return values.length === 1 && values[0] === expected;
}

function eventPatternMatch(value: unknown, scope: B2Scope): boolean | null {
  const pattern = parseObject(value);
  if (!pattern) {
    return null;
  }
  const rawResources = own(pattern, "resources");
  const resourceValues = Array.isArray(rawResources)
    ? stringList(rawResources)
    : null;
  const sourceMatch = exactArray(own(pattern, "source"), "aws.guardduty");
  const typeMatch = exactArray(
    own(pattern, "detail-type"),
    "GuardDuty Malware Protection Object Scan Result"
  );
  const accountMatch = exactArray(
    own(pattern, "account"),
    scope.approvedAccountId
  );
  const regionMatch = exactArray(own(pattern, "region"), scope.region);
  if (
    sourceMatch === null ||
    typeMatch === null ||
    accountMatch === null ||
    regionMatch === null ||
    resourceValues === null
  ) {
    return null;
  }
  return (
    sourceMatch &&
    typeMatch &&
    accountMatch &&
    regionMatch &&
    resourceValues.length === 1 &&
    resourceValues[0] === scope.resourceSelectors.guardDutyPlanArn
  );
}

function exactSqsEventBridgeGrant(policyValue: unknown, scope: B2Scope) {
  const policy = parseObject(policyValue);
  if (!policy || own(policy, "Version") !== "2012-10-17") {
    return null;
  }
  if (
    Object.keys(policy).some(
      (key) => !["Version", "Statement", "Id"].includes(key)
    )
  ) {
    return null;
  }
  const rawStatements = own(policy, "Statement");
  const statements = Array.isArray(rawStatements)
    ? rawStatements
    : rawStatements === undefined
      ? []
      : [rawStatements];
  if (statements.length === 0 || statements.length > 128) {
    return null;
  }
  let exactGrant = false;
  for (const statement of statements) {
    if (!record(statement)) {
      return null;
    }
    if (
      Object.keys(statement).some(
        (key) =>
          ![
            "Sid",
            "Effect",
            "Principal",
            "Action",
            "Resource",
            "Condition",
          ].includes(key)
      )
    ) {
      return null;
    }
    const effect = own(statement, "Effect");
    if (effect !== "Allow" && effect !== "Deny") {
      return null;
    }
    const action = own(statement, "Action");
    const actions = typeof action === "string" ? [action] : stringList(action);
    if (!actions) {
      return null;
    }
    const actionMatches = actions.map((item) =>
      iamGlobMatches(item, "sqs:SendMessage")
    );
    if (actionMatches.some((matched) => matched === null)) {
      return null;
    }
    const canSend = actionMatches.some(Boolean);
    if (!canSend) {
      continue;
    }

    const resources = stringList(own(statement, "Resource"));
    if (!resources) {
      return null;
    }
    const resourceMatches = resources.map((resource) =>
      iamGlobMatches(resource, scope.resourceSelectors.queueArn)
    );
    if (resourceMatches.some((matched) => matched === null)) {
      return null;
    }
    const appliesToQueue = resourceMatches.some(Boolean);
    if (!appliesToQueue) {
      continue;
    }
    if (effect === "Deny") {
      // This bounded check does not evaluate Deny conditions: a matching
      // explicit Deny on this queue makes a static Allow unusable/ambiguous.
      return false;
    }

    const principal = own(statement, "Principal");
    const principalExact =
      record(principal) &&
      Reflect.ownKeys(principal).length === 1 &&
      own(principal, "Service") === "events.amazonaws.com";
    const condition = own(statement, "Condition");
    const arnEquals = record(condition) ? own(condition, "ArnEquals") : null;
    const stringEquals = record(condition)
      ? own(condition, "StringEquals")
      : null;
    const conditionExact =
      record(condition) &&
      Reflect.ownKeys(condition).length === 2 &&
      record(arnEquals) &&
      Reflect.ownKeys(arnEquals).length === 1 &&
      own(arnEquals, "aws:SourceArn") ===
        scope.resourceSelectors.eventRuleArn &&
      record(stringEquals) &&
      Reflect.ownKeys(stringEquals).length === 1 &&
      own(stringEquals, "aws:SourceAccount") === scope.approvedAccountId;
    const actionExact =
      actions.length === 1 && actions[0] === "sqs:SendMessage";
    const resourceExact =
      resources !== null &&
      resources.length === 1 &&
      resources[0] === scope.resourceSelectors.queueArn;
    if (principalExact && conditionExact && actionExact && resourceExact) {
      exactGrant = true;
    } else {
      return false;
    }
  }
  return exactGrant;
}

/** Evaluate only directly observed static facts. The overall decision stays NO_GO. */
export function evaluateB2ApiResponse(
  scope: B2Scope,
  operation: B2ReadOnlyOperation,
  response: unknown,
  observedAt: string,
  evidenceFingerprint: string
): B2ObservationFinding {
  if (!record(response)) {
    return incomplete(
      operation,
      observedAt,
      evidenceFingerprint,
      "RESPONSE_SHAPE_INCOMPLETE"
    );
  }

  if (operation === "s3:GetBucketVersioning") {
    const status = own(response, "Status");
    return statusFinding(
      operation,
      status === "Enabled" ? true : status === "Suspended" ? false : null,
      observedAt,
      evidenceFingerprint,
      "S3_VERSIONING_ENABLED",
      "S3_VERSIONING_NOT_ENABLED",
      "S3_VERSIONING_UNKNOWN",
      "The captured bucket Versioning state is Enabled; account-level and object-retention requirements remain separate.",
      "Enablement cannot be inferred from missing or Suspended Versioning; record NO_GO and obtain separately approved remediation."
    );
  }

  if (operation === "s3:GetBucketLocation") {
    const location = own(response, "LocationConstraint");
    const observedRegion =
      location === null || location === undefined ? "us-east-1" : location;
    return statusFinding(
      operation,
      typeof observedRegion === "string"
        ? observedRegion === scope.region
        : null,
      observedAt,
      evidenceFingerprint,
      "S3_REGION_MATCHED",
      "S3_REGION_MISMATCH",
      "S3_REGION_UNKNOWN",
      "The bucket location matches the pinned region.",
      "The bucket location does not match the pinned region."
    );
  }

  if (operation === "s3:GetPublicAccessBlock") {
    const config = own(response, "PublicAccessBlockConfiguration");
    if (!record(config)) {
      return incomplete(
        operation,
        observedAt,
        evidenceFingerprint,
        "PUBLIC_ACCESS_BLOCK_MISSING"
      );
    }
    const values = [
      own(config, "BlockPublicAcls"),
      own(config, "IgnorePublicAcls"),
      own(config, "BlockPublicPolicy"),
      own(config, "RestrictPublicBuckets"),
    ];
    const matched = values.every((value) => value === true)
      ? true
      : values.some((value) => value === false)
        ? false
        : null;
    return statusFinding(
      operation,
      matched,
      observedAt,
      evidenceFingerprint,
      "BUCKET_PUBLIC_ACCESS_BLOCKED",
      "BUCKET_PUBLIC_ACCESS_NOT_BLOCKED",
      "BUCKET_PUBLIC_ACCESS_INCOMPLETE",
      "All four bucket-level public-access block settings are enabled; account and organization controls remain unverified.",
      "At least one bucket-level public-access block setting is disabled."
    );
  }

  if (operation === "s3:GetBucketEncryption") {
    const config = own(response, "ServerSideEncryptionConfiguration");
    const rules = record(config) ? own(config, "Rules") : null;
    if (!Array.isArray(rules) || rules.length !== 1 || !record(rules[0])) {
      return incomplete(
        operation,
        observedAt,
        evidenceFingerprint,
        "BUCKET_ENCRYPTION_INCOMPLETE"
      );
    }
    const defaultEncryption = own(
      rules[0],
      "ApplyServerSideEncryptionByDefault"
    );
    const algorithm = record(defaultEncryption)
      ? own(defaultEncryption, "SSEAlgorithm")
      : null;
    const keyId = record(defaultEncryption)
      ? own(defaultEncryption, "KMSMasterKeyID")
      : null;
    if (algorithm === "AES256") {
      return statusFinding(
        operation,
        true,
        observedAt,
        evidenceFingerprint,
        "BUCKET_SSE_S3_ENABLED",
        "BUCKET_ENCRYPTION_MISMATCH",
        "BUCKET_ENCRYPTION_UNKNOWN",
        "The captured default encryption is SSE-S3.",
        "The captured default encryption does not match the approved encryption scope."
      );
    }
    if (algorithm === "aws:kms") {
      const matched =
        typeof keyId !== "string" || !scope.resourceSelectors.kmsKeyArn
          ? null
          : keyId === scope.resourceSelectors.kmsKeyArn;
      return statusFinding(
        operation,
        matched,
        observedAt,
        evidenceFingerprint,
        "BUCKET_KMS_KEY_MATCHED",
        "BUCKET_KMS_KEY_MISMATCH",
        "BUCKET_KMS_KEY_UNVERIFIED",
        "The captured default encryption key matches the approved KMS selector.",
        "The captured KMS key is not the exact approved key."
      );
    }
    return incomplete(
      operation,
      observedAt,
      evidenceFingerprint,
      "BUCKET_ENCRYPTION_UNSUPPORTED"
    );
  }

  if (operation === "s3:GetBucketPolicyStatus") {
    const policyStatus = own(response, "PolicyStatus");
    const isPublic = record(policyStatus)
      ? own(policyStatus, "IsPublic")
      : null;
    return statusFinding(
      operation,
      typeof isPublic === "boolean" ? !isPublic : null,
      observedAt,
      evidenceFingerprint,
      "BUCKET_POLICY_NOT_PUBLIC",
      "BUCKET_POLICY_PUBLIC",
      "BUCKET_POLICY_STATUS_UNKNOWN",
      "S3 reports the bucket policy is not public; ACL/account-level exposure still needs review.",
      "S3 reports that the bucket policy is public."
    );
  }

  if (operation === "guardduty:GetMalwareProtectionPlan") {
    const plan = parseObject(
      own(response, "MalwareProtectionPlan") ?? response
    );
    if (!plan) {
      return incomplete(
        operation,
        observedAt,
        evidenceFingerprint,
        "GUARDDUTY_PLAN_MISSING"
      );
    }
    const protectedResource = own(plan, "ProtectedResource");
    const bucket = record(protectedResource)
      ? own(protectedResource, "S3Bucket")
      : null;
    const rawPrefixes = record(bucket) ? own(bucket, "ObjectPrefixes") : null;
    const prefixes = Array.isArray(rawPrefixes)
      ? stringList(rawPrefixes)
      : null;
    const expectedBucket = scope.resourceSelectors.bucket;
    const bucketName = record(bucket) ? own(bucket, "BucketName") : null;
    const idMatches =
      own(plan, "MalwareProtectionPlanId") ===
      scope.resourceSelectors.guardDutyPlanId;
    const arnMatches =
      own(plan, "Arn") === scope.resourceSelectors.guardDutyPlanArn;
    const status = own(plan, "Status");
    if (
      prefixes === null ||
      typeof bucketName !== "string" ||
      typeof status !== "string"
    ) {
      return incomplete(
        operation,
        observedAt,
        evidenceFingerprint,
        "GUARDDUTY_PLAN_SCOPE_INCOMPLETE"
      );
    }
    const scoped =
      idMatches &&
      arnMatches &&
      bucketName === expectedBucket &&
      prefixes.length === 1 &&
      prefixes[0] === scope.resourceSelectors.projectDocumentPrefix;
    return statusFinding(
      operation,
      scoped && status === "ACTIVE",
      observedAt,
      evidenceFingerprint,
      "GUARDDUTY_PLAN_SCOPE_MATCHED",
      scoped ? "GUARDDUTY_PLAN_NOT_ACTIVE" : "GUARDDUTY_PLAN_SCOPE_MISMATCH",
      "GUARDDUTY_PLAN_SCOPE_INCOMPLETE",
      "The captured plan is active and scoped to the exact bucket and Project prefix; event origin remains unproven.",
      "The captured GuardDuty plan is inactive or does not match the exact approved bucket and prefix."
    );
  }

  if (operation === "events:DescribeEventBus") {
    return statusFinding(
      operation,
      own(response, "Arn") === scope.resourceSelectors.eventBusArn,
      observedAt,
      evidenceFingerprint,
      "DEFAULT_EVENT_BUS_MATCHED",
      "EVENT_BUS_MISMATCH",
      "EVENT_BUS_IDENTITY_UNKNOWN",
      "The captured EventBridge bus matches the pinned default bus.",
      "The captured EventBridge bus ARN does not match the pinned default bus."
    );
  }

  if (operation === "events:DescribeRule") {
    const arnMatches =
      own(response, "Arn") === scope.resourceSelectors.eventRuleArn;
    const busMatches = own(response, "EventBusName") === "default";
    const enabled = own(response, "State") === "ENABLED";
    const patternMatch = eventPatternMatch(
      own(response, "EventPattern"),
      scope
    );
    const match =
      patternMatch === null
        ? null
        : arnMatches && busMatches && enabled && patternMatch;
    return statusFinding(
      operation,
      match,
      observedAt,
      evidenceFingerprint,
      "EVENT_RULE_SCOPE_MATCHED",
      "EVENT_RULE_SCOPE_OR_STATE_MISMATCH",
      "EVENT_RULE_PATTERN_INCOMPLETE",
      "The captured rule identity, enabled state and static pattern match the approved scope; source authenticity remains unproven.",
      "The captured EventBridge rule identity, state or pattern does not match the approved scope."
    );
  }

  if (operation === "events:ListTargetsByRule") {
    const targets = own(response, "Targets");
    if (
      !Array.isArray(targets) ||
      targets.length === 0 ||
      targets.length > 32
    ) {
      return incomplete(
        operation,
        observedAt,
        evidenceFingerprint,
        "EVENT_RULE_TARGETS_INCOMPLETE"
      );
    }
    const arns: unknown[] = [];
    for (const target of targets) {
      if (!record(target)) {
        return incomplete(
          operation,
          observedAt,
          evidenceFingerprint,
          "EVENT_RULE_TARGET_SHAPE_INVALID"
        );
      }
      const keys = Reflect.ownKeys(target);
      if (
        keys.some((key) =>
          ["Input", "InputPath", "InputTransformer"].includes(String(key))
        )
      ) {
        return incomplete(
          operation,
          observedAt,
          evidenceFingerprint,
          "EVENT_RULE_TARGET_INPUT_TRANSFORMATION_UNREVIEWED"
        );
      }
      if (
        keys.some(
          (key) => typeof key !== "string" || !["Arn", "Id"].includes(key)
        )
      ) {
        return incomplete(
          operation,
          observedAt,
          evidenceFingerprint,
          "EVENT_RULE_TARGET_METADATA_UNREVIEWED"
        );
      }
      const arn = own(target, "Arn");
      const id = own(target, "Id");
      if (
        typeof arn !== "string" ||
        (Object.hasOwn(target, "Id") &&
          (typeof id !== "string" || id.length === 0 || id.length > 512))
      ) {
        return incomplete(
          operation,
          observedAt,
          evidenceFingerprint,
          "EVENT_RULE_TARGET_SHAPE_INVALID"
        );
      }
      arns.push(arn);
    }
    const matched =
      arns.length === 1 && arns[0] === scope.resourceSelectors.queueArn;
    return statusFinding(
      operation,
      matched,
      observedAt,
      evidenceFingerprint,
      "EVENT_RULE_TARGET_MATCHED",
      "EVENT_RULE_TARGET_MISMATCH",
      "EVENT_RULE_TARGETS_INCOMPLETE",
      "The rule has exactly one target and it is the pinned SQS queue.",
      "The rule target set is not exactly the pinned SQS queue."
    );
  }

  if (operation === "sqs:GetQueueAttributes") {
    const attributes = own(response, "Attributes");
    if (!record(attributes)) {
      return incomplete(
        operation,
        observedAt,
        evidenceFingerprint,
        "QUEUE_ATTRIBUTES_INCOMPLETE"
      );
    }
    const queueMatches =
      own(attributes, "QueueArn") === scope.resourceSelectors.queueArn;
    const redrive = parseObject(own(attributes, "RedrivePolicy"));
    const dlqMatches = record(redrive)
      ? own(redrive, "deadLetterTargetArn") === scope.resourceSelectors.dlqArn
      : null;
    const managedEncryption =
      own(attributes, "SqsManagedSseEnabled") === "true";
    const kmsKeyId = own(attributes, "KmsMasterKeyId");
    const kmsMatches = managedEncryption
      ? true
      : typeof kmsKeyId !== "string" ||
          scope.resourceSelectors.kmsKeyArn === null
        ? null
        : kmsKeyId === scope.resourceSelectors.kmsKeyArn
          ? true
          : kmsKeyId.startsWith("arn:")
            ? false
            : null;
    const policyStatus = exactSqsEventBridgeGrant(
      own(attributes, "Policy"),
      scope
    );
    if (dlqMatches === null || policyStatus === null) {
      return incomplete(
        operation,
        observedAt,
        evidenceFingerprint,
        "QUEUE_POLICY_OR_REDRIVE_INCOMPLETE"
      );
    }
    if (kmsMatches === null) {
      return incomplete(
        operation,
        observedAt,
        evidenceFingerprint,
        "QUEUE_ENCRYPTION_KEY_UNRESOLVED"
      );
    }
    const matched = queueMatches && dlqMatches && kmsMatches && policyStatus;
    return statusFinding(
      operation,
      matched,
      observedAt,
      evidenceFingerprint,
      "QUEUE_SCOPE_POLICY_REDRIVE_MATCHED",
      "QUEUE_SCOPE_POLICY_REDRIVE_MISMATCH",
      "QUEUE_ATTRIBUTES_INCOMPLETE",
      "The static queue ARN, EventBridge service grant, source conditions, DLQ and encryption match; effective permissions remain unverified.",
      "The queue identity, exact EventBridge service grant, DLQ or encryption does not match the pinned scope."
    );
  }

  if (operation === "iam:GetRole") {
    const role = parseObject(own(response, "Role"));
    if (!role) {
      return incomplete(
        operation,
        observedAt,
        evidenceFingerprint,
        "IAM_ROLE_RESPONSE_INCOMPLETE"
      );
    }
    return statusFinding(
      operation,
      own(role, "Arn") === scope.resourceSelectors.applicationRoleArn,
      observedAt,
      evidenceFingerprint,
      "APPLICATION_ROLE_MATCHED",
      "APPLICATION_ROLE_MISMATCH",
      "APPLICATION_ROLE_UNKNOWN",
      "The selected role ARN matches the approved selector; trust and effective permissions require additional review.",
      "The returned IAM role ARN does not match the exact approved selector."
    );
  }

  if (operation === "kms:DescribeKey") {
    const metadata = own(response, "KeyMetadata");
    if (!record(metadata) || scope.resourceSelectors.kmsKeyArn === null) {
      return incomplete(
        operation,
        observedAt,
        evidenceFingerprint,
        "KMS_KEY_METADATA_INCOMPLETE"
      );
    }
    return statusFinding(
      operation,
      own(metadata, "Arn") === scope.resourceSelectors.kmsKeyArn &&
        own(metadata, "KeyState") === "Enabled",
      observedAt,
      evidenceFingerprint,
      "KMS_KEY_ENABLED_AND_MATCHED",
      "KMS_KEY_DISABLED_OR_MISMATCHED",
      "KMS_KEY_METADATA_UNKNOWN",
      "The captured KMS key identity matches and the key is enabled; policy and grants still need review.",
      "The captured KMS key is disabled or does not match the exact approved selector."
    );
  }

  return incomplete(operation, observedAt, evidenceFingerprint);
}
