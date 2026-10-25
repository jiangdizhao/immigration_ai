import "server-only";

import {
  type AwsPolicyStatement,
  PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA,
  type ProjectDocumentAwsSecurityEvidenceV1,
  type ProjectDocumentAwsSecurityFinding,
  type ProjectDocumentAwsSecurityFindingResult,
  type ProjectDocumentAwsSecurityReadinessReport,
} from "./types";

const MAX_POLICY_STATEMENTS = 128;
const MAX_PRINCIPALS = 128;
const MAX_TEXT_LENGTH = 2048;
const MAX_EVIDENCE_NODES = 12_000;
const MAX_EVIDENCE_DEPTH = 18;
const LIMITATION =
  "Supplied static policy snapshots cannot establish live identity or effective AWS permissions. SCPs, permission boundaries, session policies, resource grants, organization controls, administrators, and delivery provenance require independent live owner verification.";

type JsonRecord = Record<string, unknown>;
type ParsedPolicy = {
  statements: AwsPolicyStatement[];
  incomplete: boolean;
  broad: boolean;
  unsupported: boolean;
};
type ParsedPrincipal = {
  entries: Array<{ category: string; values: string[] }>;
  incomplete: boolean;
  broad: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accept only bounded JSON-shaped data before any policy traversal. */
function isBoundedEvidenceJson(input: unknown): boolean {
  const visited = new WeakSet<object>();
  let nodes = 0;

  function visit(value: unknown, depth: number): boolean {
    nodes += 1;
    if (nodes > MAX_EVIDENCE_NODES || depth > MAX_EVIDENCE_DEPTH) {
      return false;
    }
    if (value === null || typeof value === "boolean") {
      return true;
    }
    if (typeof value === "string") {
      return value.length <= MAX_TEXT_LENGTH;
    }
    if (typeof value === "number") {
      return Number.isFinite(value);
    }
    if (typeof value !== "object") {
      return false;
    }
    if (visited.has(value)) {
      return false;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      if (value.length > MAX_EVIDENCE_NODES) {
        return false;
      }
      const keys = Reflect.ownKeys(value);
      if (
        keys.some(
          (key) =>
            typeof key !== "string" ||
            (key !== "length" &&
              (!/^\d+$/u.test(key) || Number(key) >= value.length))
        )
      ) {
        return false;
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index)
        );
        if (
          !descriptor ||
          !Object.hasOwn(descriptor, "value") ||
          !visit(descriptor.value, depth + 1)
        ) {
          return false;
        }
      }
      return true;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_EVIDENCE_NODES) {
      return false;
    }
    for (const key of keys) {
      if (typeof key !== "string" || key.length > MAX_TEXT_LENGTH) {
        return false;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !Object.hasOwn(descriptor, "value") ||
        !visit(descriptor.value, depth + 1)
      ) {
        return false;
      }
    }
    return true;
  }

  try {
    return visit(input, 0);
  } catch {
    return false;
  }
}

function boundedString(value: unknown, max = MAX_TEXT_LENGTH): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_PRINCIPALS) {
    return null;
  }
  if (value.some((item) => !boundedString(item, 512))) {
    return null;
  }
  return value as string[];
}

function isValidTimestamp(value: unknown): value is string {
  return (
    boundedString(value, 64) &&
    Number.isFinite(Date.parse(value)) &&
    value.includes("T")
  );
}

function stringList(value: unknown): string[] | null {
  if (typeof value === "string" && boundedString(value)) {
    return [value];
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_POLICY_STATEMENTS &&
    value.every((item) => boundedString(item))
  ) {
    return value as string[];
  }
  return null;
}

function hasWildcard(value: string) {
  return value.includes("*") || value.includes("?");
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

function hasDuplicateStrings(values: string[] | null) {
  return values !== null && new Set(values).size !== values.length;
}

function parsePrincipal(value: unknown): ParsedPrincipal | null {
  if (typeof value === "string") {
    if (!boundedString(value)) {
      return null;
    }
    return {
      entries: [
        {
          category: value === "*" ? "Wildcard" : "Unqualified",
          values: [value],
        },
      ],
      incomplete: value !== "*",
      broad: hasWildcard(value),
    };
  }
  if (!isRecord(value)) {
    return null;
  }
  const entries: ParsedPrincipal["entries"] = [];
  let incomplete = Object.keys(value).length === 0;
  let broad = false;
  const supportedCategories = new Set([
    "AWS",
    "Service",
    "Federated",
    "CanonicalUser",
  ]);
  for (const [kind, raw] of Object.entries(value)) {
    if (!boundedString(kind, 32)) {
      return null;
    }
    const values = stringList(raw);
    if (!values) {
      return null;
    }
    if (!supportedCategories.has(kind)) {
      incomplete = true;
    }
    if (hasDuplicateStrings(values)) {
      incomplete = true;
    }
    if (values.some(hasWildcard)) {
      broad = true;
    }
    entries.push({ category: kind, values });
  }
  if (entries.length > 1) {
    incomplete = true;
  }
  return entries.length > 0 &&
    entries.reduce((total, entry) => total + entry.values.length, 0) <=
      MAX_PRINCIPALS
    ? { entries, incomplete, broad }
    : null;
}

function hasExactPrincipal(
  principal: ParsedPrincipal | null,
  category: string,
  value: string
) {
  return (
    principal !== null &&
    !principal.incomplete &&
    principal.entries.length === 1 &&
    principal.entries[0]?.category === category &&
    principal.entries[0]?.values.length === 1 &&
    principal.entries[0]?.values[0] === value
  );
}

function hasPrincipalValue(
  principal: ParsedPrincipal | null,
  category: string,
  value: string
) {
  return (
    principal !== null &&
    !principal.incomplete &&
    principal.entries.some(
      (entry) => entry.category === category && entry.values.includes(value)
    )
  );
}

function parsePolicy(value: unknown): ParsedPolicy {
  if (!isRecord(value) || value.Version !== "2012-10-17") {
    return {
      statements: [],
      incomplete: true,
      broad: false,
      unsupported: true,
    };
  }
  const rawStatements = Array.isArray(value.Statement)
    ? value.Statement
    : [value.Statement];
  if (
    rawStatements.length === 0 ||
    rawStatements.length > MAX_POLICY_STATEMENTS
  ) {
    return {
      statements: [],
      incomplete: true,
      broad: false,
      unsupported: true,
    };
  }
  let incomplete = false;
  let broad = false;
  let unsupported = false;
  if (
    Object.keys(value).some(
      (key) => !["Version", "Statement", "Id"].includes(key)
    )
  ) {
    incomplete = true;
    unsupported = true;
  }
  const statementFingerprints = new Set<string>();
  const statements: AwsPolicyStatement[] = [];
  for (const raw of rawStatements) {
    if (!isRecord(raw)) {
      incomplete = true;
      unsupported = true;
      continue;
    }
    const fingerprint = canonicalJson(raw);
    if (statementFingerprints.has(fingerprint)) {
      incomplete = true;
      unsupported = true;
    }
    statementFingerprints.add(fingerprint);
    const actions = stringList(raw.Action);
    const resources = stringList(raw.Resource);
    const principal =
      raw.Principal === undefined ? null : parsePrincipal(raw.Principal);
    if (
      (raw.Effect !== "Allow" && raw.Effect !== "Deny") ||
      !actions ||
      !resources ||
      (raw.Principal !== undefined && !principal)
    ) {
      incomplete = true;
      unsupported = true;
      continue;
    }
    if (hasDuplicateStrings(actions) || hasDuplicateStrings(resources)) {
      incomplete = true;
      unsupported = true;
    }
    if (principal?.incomplete) {
      incomplete = true;
      unsupported = true;
    }
    if (
      "NotAction" in raw ||
      "NotResource" in raw ||
      "NotPrincipal" in raw ||
      Object.keys(raw).some(
        (key) =>
          ![
            "Effect",
            "Action",
            "Resource",
            "Principal",
            "Condition",
            "Sid",
          ].includes(key)
      )
    ) {
      incomplete = true;
      unsupported = true;
    }
    if ([...actions, ...resources].some(hasWildcard) || principal?.broad) {
      broad = true;
    }
    if (raw.Condition !== undefined) {
      if (isRecord(raw.Condition)) {
        for (const [operator, conditions] of Object.entries(raw.Condition)) {
          if (
            !["ArnEquals", "StringEquals"].includes(operator) ||
            !isRecord(conditions) ||
            Object.values(conditions).some(
              (condition) =>
                stringList(condition) === null ||
                hasDuplicateStrings(stringList(condition))
            )
          ) {
            incomplete = true;
            unsupported = true;
          } else if (
            Object.values(conditions).some((condition) =>
              (stringList(condition) ?? []).some(hasWildcard)
            )
          ) {
            broad = true;
          }
        }
      } else {
        incomplete = true;
        unsupported = true;
      }
    }
    statements.push(raw as AwsPolicyStatement);
  }
  return { statements, incomplete, broad, unsupported };
}

function conditionValues(
  statement: AwsPolicyStatement,
  operator: string,
  key: string
): string[] | null {
  const condition = statement.Condition;
  if (!condition) {
    return null;
  }
  const values = condition[operator]?.[key];
  return stringList(values);
}

function hasExactSqsEventBridgeGrant(policy: ParsedPolicy, scope: JsonRecord) {
  const expectedQueue = scope.queueArn;
  const expectedRule = scope.eventRuleArn;
  const expectedAccount = scope.accountId;
  return policy.statements.some((statement) => {
    const actions = stringList(statement.Action) ?? [];
    const resources = stringList(statement.Resource) ?? [];
    const principal = parsePrincipal(statement.Principal);
    return (
      statement.Effect === "Allow" &&
      actions.length === 1 &&
      actions[0] === "sqs:SendMessage" &&
      resources.length === 1 &&
      resources[0] === expectedQueue &&
      hasExactPrincipal(principal, "Service", "events.amazonaws.com") &&
      conditionValues(statement, "ArnEquals", "aws:SourceArn")?.length === 1 &&
      conditionValues(statement, "ArnEquals", "aws:SourceArn")?.[0] ===
        String(expectedRule) &&
      conditionValues(statement, "StringEquals", "aws:SourceAccount")
        ?.length === 1 &&
      conditionValues(statement, "StringEquals", "aws:SourceAccount")?.[0] ===
        String(expectedAccount)
    );
  });
}

function sqsPolicyRisks(policy: ParsedPolicy, expected: JsonRecord) {
  const reasons: string[] = [];
  for (const statement of policy.statements) {
    if (statement.Effect !== "Allow") {
      continue;
    }
    const actions = stringList(statement.Action) ?? [];
    const resources = stringList(statement.Resource) ?? [];
    const principal = parsePrincipal(statement.Principal);
    if (!resources.includes(String(expected.queueArn))) {
      continue;
    }
    if (
      actions.some((action) =>
        [
          "sqs:SetQueueAttributes",
          "sqs:AddPermission",
          "sqs:RemovePermission",
          "sqs:DeleteQueue",
          "sqs:PurgeQueue",
        ].includes(action)
      )
    ) {
      reasons.push("QUEUE_MUTATION_PERMISSION_PRESENT");
    }
    if (
      actions.includes("sqs:SendMessage") ||
      actions.includes("sqs:SendMessageBatch")
    ) {
      const eventBridgeIdentity =
        actions.length === 1 &&
        actions[0] === "sqs:SendMessage" &&
        resources.length === 1 &&
        hasExactPrincipal(principal, "Service", "events.amazonaws.com");
      const sourceConditionsMatch =
        conditionValues(statement, "ArnEquals", "aws:SourceArn")?.length ===
          1 &&
        conditionValues(statement, "ArnEquals", "aws:SourceArn")?.[0] ===
          String(expected.eventRuleArn) &&
        conditionValues(statement, "StringEquals", "aws:SourceAccount")
          ?.length === 1 &&
        conditionValues(statement, "StringEquals", "aws:SourceAccount")?.[0] ===
          String(expected.accountId);
      if (!eventBridgeIdentity) {
        reasons.push("QUEUE_DIRECT_SEND_PRINCIPAL_UNEXPECTED");
      } else if (!sourceConditionsMatch && !policy.unsupported) {
        reasons.push("QUEUE_EVENTBRIDGE_SOURCE_CONDITION_MISSING");
      }
    } else {
      reasons.push("QUEUE_POLICY_UNEXPECTED_ALLOW");
    }
  }
  return reasons;
}

function hasForbiddenPermission(
  policy: ParsedPolicy,
  actions: string[],
  resource: unknown | undefined
) {
  return policy.statements.some((statement) => {
    if (statement.Effect !== "Allow") {
      return false;
    }
    const allowedActions = stringList(statement.Action) ?? [];
    const resources = stringList(statement.Resource) ?? [];
    return (
      allowedActions.some((action) =>
        actions.some((forbidden) => action === forbidden || action === "*")
      ) &&
      resources.some(
        (candidate) =>
          resource === undefined || candidate === resource || candidate === "*"
      )
    );
  });
}

function hasPolicyGrant(
  policy: ParsedPolicy,
  action: string,
  resource: string,
  principal: string
) {
  return policy.statements.some((statement) => {
    if (statement.Effect !== "Allow") {
      return false;
    }
    return (
      (stringList(statement.Action) ?? []).includes(action) &&
      (stringList(statement.Resource) ?? []).includes(resource) &&
      hasPrincipalValue(parsePrincipal(statement.Principal), "AWS", principal)
    );
  });
}

function principalsWithPolicyGrant(
  policy: ParsedPolicy,
  action: string,
  resource: string
) {
  return policy.statements
    .filter((statement) => {
      return (
        statement.Effect === "Allow" &&
        (stringList(statement.Action) ?? []).includes(action) &&
        (stringList(statement.Resource) ?? []).includes(resource)
      );
    })
    .flatMap((statement) => {
      const principal = parsePrincipal(statement.Principal);
      return (
        principal?.entries.flatMap((entry) =>
          entry.values.map((value) => ({ category: entry.category, value }))
        ) ?? []
      );
    })
    .sort((left, right) =>
      `${left.category}:${left.value}`.localeCompare(
        `${right.category}:${right.value}`
      )
    );
}

function nullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function validExpectedScope(expected: JsonRecord) {
  const accountId = expected.accountId;
  const partition = expected.partition;
  const region = expected.region;
  if (
    typeof accountId !== "string" ||
    !/^\d{12}$/u.test(accountId) ||
    typeof partition !== "string" ||
    !/^[a-z0-9-]{1,32}$/u.test(partition) ||
    typeof region !== "string" ||
    !/^[a-z]{2}(?:-[a-z0-9]+)+-\d$/u.test(region) ||
    typeof expected.bucketPrefix !== "string" ||
    !expected.bucketPrefix.startsWith("project-document/") ||
    !expected.bucketPrefix.endsWith("/") ||
    expected.bucketPrefix.includes("..") ||
    expected.bucketPrefix.includes("*")
  ) {
    return false;
  }
  const scopedArns: [unknown, RegExp][] = [
    [
      expected.bucketArn,
      new RegExp(`^arn:${partition}:s3:::[a-z0-9.-]{3,63}$`, "u"),
    ],
    [
      expected.planArn,
      new RegExp(
        `^arn:${partition}:guardduty:${region}:${accountId}:malware-protection-plan\\/.+$`,
        "u"
      ),
    ],
    [
      expected.eventRuleArn,
      new RegExp(
        `^arn:${partition}:events:${region}:${accountId}:rule\\/.+$`,
        "u"
      ),
    ],
    [
      expected.eventBusArn,
      new RegExp(
        `^arn:${partition}:events:${region}:${accountId}:event-bus\\/.+$`,
        "u"
      ),
    ],
    [
      expected.queueArn,
      new RegExp(
        `^arn:${partition}:sqs:${region}:${accountId}:[A-Za-z0-9_-]{1,80}$`,
        "u"
      ),
    ],
    [
      expected.dlqArn,
      new RegExp(
        `^arn:${partition}:sqs:${region}:${accountId}:[A-Za-z0-9_-]{1,80}$`,
        "u"
      ),
    ],
    [
      expected.workerRoleArn,
      new RegExp(`^arn:${partition}:iam::${accountId}:role\\/.+$`, "u"),
    ],
    [
      expected.scanPlanRoleArn,
      new RegExp(`^arn:${partition}:iam::${accountId}:role\\/.+$`, "u"),
    ],
    [
      expected.kmsKeyArn,
      new RegExp(`^arn:${partition}:kms:${region}:${accountId}:key\\/.+$`, "u"),
    ],
  ];
  return scopedArns.every(
    ([arn, pattern]) =>
      typeof arn === "string" && !hasWildcard(arn) && pattern.test(arn)
  );
}

function safeEnvelope(
  value: unknown
): value is ProjectDocumentAwsSecurityEvidenceV1 {
  if (
    !isRecord(value) ||
    value.schema !== PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA
  ) {
    return false;
  }
  if (
    value.environment !== "sandbox" ||
    (value.source !== "operator_export" && value.source !== "fixture") ||
    !isValidTimestamp(value.capturedAt) ||
    !isRecord(value.expected) ||
    !isRecord(value.observed)
  ) {
    return false;
  }
  const expected = value.expected;
  const observed = value.observed;
  if (!validExpectedScope(expected)) {
    return false;
  }
  const account = observed.account;
  const bucket = observed.bucket;
  const plan = observed.guardDutyPlan;
  const eventBridge = observed.eventBridge;
  const queue = observed.queue;
  const worker = observed.worker;
  const kms = observed.kms;
  const databaseRole = observed.databaseRole;
  const requiredStrings = [
    expected.accountId,
    expected.partition,
    expected.region,
    expected.bucketArn,
    expected.bucketPrefix,
    expected.planArn,
    expected.scanPlanRoleArn,
    expected.eventRuleArn,
    expected.eventBusArn,
    expected.queueArn,
    expected.dlqArn,
    expected.workerRoleArn,
    expected.kmsKeyArn,
    ...(isRecord(account) ? Object.values(account) : []),
    ...(isRecord(bucket)
      ? [bucket.arn, bucket.ownerAccountId, bucket.region, bucket.prefix]
      : []),
    ...(isRecord(plan)
      ? [
          ...Object.values(plan).filter((item) => typeof item === "string"),
          plan.roleArn,
        ]
      : []),
    ...(isRecord(eventBridge)
      ? [eventBridge.ruleArn, eventBridge.eventBusArn]
      : []),
    ...(isRecord(queue) ? [queue.arn, queue.region] : []),
    ...(isRecord(worker) ? [worker.roleArn] : []),
    ...(isRecord(kms) ? [kms.keyArn] : []),
  ];
  if (requiredStrings.some((item) => !boundedString(item))) {
    return false;
  }
  if (
    !isRecord(account) ||
    !isRecord(bucket) ||
    !isRecord(plan) ||
    !isRecord(eventBridge) ||
    !isRecord(queue) ||
    !isRecord(worker) ||
    !isRecord(kms) ||
    !isRecord(databaseRole)
  ) {
    return false;
  }
  const arrays: unknown[] = [
    eventBridge.source,
    eventBridge.detailType,
    eventBridge.account,
    eventBridge.region,
    eventBridge.planArns,
    eventBridge.targetArns,
    eventBridge.ruleMutationPrincipals,
    eventBridge.putEventsPrincipals,
    queue.directSendMessagePrincipals,
    queue.queueMutationPrincipals,
    worker.unexpectedPrincipals,
    worker.passRolePrincipals,
    kms.decryptPrincipals,
    kms.grantPrincipals,
    observed.unknownSurfaces,
  ];
  if (arrays.some((item) => item !== null && asStringArray(item) === null)) {
    return false;
  }
  const requiredArrays = [
    eventBridge.source,
    eventBridge.detailType,
    eventBridge.account,
    eventBridge.region,
    eventBridge.planArns,
    eventBridge.targetArns,
  ];
  if (requiredArrays.some((item) => asStringArray(item) === null)) {
    return false;
  }
  const booleanFields = [
    bucket.publicAccessBlocked,
    eventBridge.enabled,
    worker.policySnapshotComplete,
    worker.principalsInventoryComplete,
    kms.grantsReviewed,
    databaseRole.migrationRoleSeparated,
    databaseRole.runtimeIsSuperuser,
    databaseRole.runtimeOwnsProtectedTables,
    databaseRole.runtimeCanTruncateOrAlter,
    databaseRole.auditMutationLimited,
  ];
  if (booleanFields.some((item) => !nullableBoolean(item))) {
    return false;
  }
  return true;
}

function finding(
  requirement: string,
  result: ProjectDocumentAwsSecurityFindingResult,
  reasonCodes: string[],
  note: string
): ProjectDocumentAwsSecurityFinding {
  return { requirement, result, reasonCodes, note };
}

function compareFacts(
  pairs: [unknown, unknown][],
  incompleteReason: string,
  mismatchReason: string
): ProjectDocumentAwsSecurityFinding {
  if (
    pairs.some(
      ([expected, observed]) =>
        !boundedString(expected) || !boundedString(observed)
    )
  ) {
    return finding(
      "resource_scope",
      "INCOMPLETE",
      [incompleteReason],
      "Required scope evidence is absent or invalid."
    );
  }
  if (pairs.some(([expected, observed]) => expected !== observed)) {
    return finding(
      "resource_scope",
      "FAIL",
      [mismatchReason],
      "Observed resource identity does not match the declared scope."
    );
  }
  return finding(
    "resource_scope",
    "PASS",
    [],
    "Supplied resource identities match the declared static scope."
  );
}

function policyFinding(
  requirement: string,
  parsed: ParsedPolicy,
  extraReasons: string[],
  note: string
): ProjectDocumentAwsSecurityFinding {
  const reasons = [...extraReasons];
  if (parsed.broad) {
    reasons.push("POLICY_WILDCARD_PERMISSION");
  }
  if (parsed.unsupported) {
    reasons.push("POLICY_SEMANTICS_UNSUPPORTED");
  }
  if (reasons.some((code) => code === "POLICY_WILDCARD_PERMISSION")) {
    return finding(requirement, "FAIL", [...new Set(reasons)], note);
  }
  if (
    reasons.some((code) =>
      /MISMATCH|UNEXPECTED|_RISK|BROAD|NOT_ENABLED|_FAILED|PRINCIPAL_PRESENT|PERMISSION_PRESENT|SOURCE_CONDITION_MISSING|REQUIRED.*MISSING/u.test(
        code
      )
    )
  ) {
    return finding(requirement, "FAIL", [...new Set(reasons)], note);
  }
  if (parsed.incomplete || reasons.length > 0) {
    return finding(requirement, "INCOMPLETE", [...new Set(reasons)], note);
  }
  return finding(requirement, "PASS", [], note);
}

/**
 * Reviews bounded, supplied static evidence only. It never reads environment,
 * files, credentials, AWS APIs, or returns a transport/trusted-delivery value.
 */
export function evaluateProjectDocumentAwsSecurityEvidence(
  input: unknown
): ProjectDocumentAwsSecurityReadinessReport {
  const boundedJson = isBoundedEvidenceJson(input);
  const source =
    boundedJson &&
    isRecord(input) &&
    (input.source === "fixture" || input.source === "operator_export")
      ? input.source
      : "unrecognized";
  const capturedAt =
    boundedJson && isRecord(input) && isValidTimestamp(input.capturedAt)
      ? input.capturedAt
      : null;
  const findings: ProjectDocumentAwsSecurityFinding[] = [];

  if (!boundedJson || !safeEnvelope(input)) {
    findings.push(
      finding(
        "evidence_envelope",
        "INCOMPLETE",
        ["EVIDENCE_MALFORMED_OR_INCOMPLETE"],
        "Evidence envelope is missing required bounded fields or uses an unsupported shape."
      )
    );
    findings.push(
      finding(
        "live_origin_and_effective_permissions",
        "INCOMPLETE",
        ["LIVE_VERIFICATION_REQUIRED"],
        "Static supplied evidence cannot establish authenticated delivery or effective permissions."
      )
    );
    return {
      schema: PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA,
      toolVersion: "1.0.0",
      capturedAt,
      evidenceSource: source,
      findings,
      staticPolicyAssessment: "NO_GO",
      requires_live_owner_verification: true,
      limitation: LIMITATION,
    };
  }

  const { expected, observed } = input;
  findings.push(
    finding(
      "account_partition_region",
      "PASS",
      [],
      "Supplied account, partition, and region match the declared static scope."
    )
  );
  if (
    expected.accountId !== observed.account.accountId ||
    expected.partition !== observed.account.partition ||
    expected.region !== observed.account.region
  ) {
    findings[0] = finding(
      "account_partition_region",
      "FAIL",
      ["ACCOUNT_PARTITION_REGION_MISMATCH"],
      "Observed account identity does not match the declared static scope."
    );
  }

  const bucketIdentity = compareFacts(
    [
      [expected.bucketArn, observed.bucket.arn],
      [expected.accountId, observed.bucket.ownerAccountId],
      [expected.region, observed.bucket.region],
      [expected.bucketPrefix, observed.bucket.prefix],
    ],
    "BUCKET_SCOPE_EVIDENCE_MISSING",
    "BUCKET_SCOPE_MISMATCH"
  );
  findings.push({
    ...bucketIdentity,
    requirement: "bucket_owner_region_prefix",
  });
  findings.push(
    observed.bucket.versioning === "Enabled"
      ? finding(
          "s3_versioning",
          "PASS",
          [],
          "Supplied bucket versioning state is Enabled."
        )
      : observed.bucket.versioning === "Unknown"
        ? finding(
            "s3_versioning",
            "INCOMPLETE",
            ["S3_VERSIONING_UNVERIFIED"],
            "Bucket versioning state is unknown."
          )
        : finding(
            "s3_versioning",
            "FAIL",
            ["S3_VERSIONING_NOT_ENABLED"],
            "Bucket versioning is not Enabled."
          )
  );
  findings.push(
    observed.bucket.publicAccessBlocked === true
      ? finding(
          "bucket_public_access",
          "PASS",
          [],
          "Supplied public-access block state is enabled."
        )
      : observed.bucket.publicAccessBlocked === false
        ? finding(
            "bucket_public_access",
            "FAIL",
            ["BUCKET_PUBLIC_ACCESS_NOT_BLOCKED"],
            "Supplied public-access block state is disabled."
          )
        : finding(
            "bucket_public_access",
            "INCOMPLETE",
            ["BUCKET_PUBLIC_ACCESS_UNKNOWN"],
            "Public-access block evidence is missing."
          )
  );
  if (
    observed.bucket.encryption === "SSE_KMS" &&
    observed.bucket.kmsKeyArn !== expected.kmsKeyArn
  ) {
    findings.push(
      finding(
        "bucket_encryption",
        "FAIL",
        ["KMS_KEY_SCOPE_MISMATCH"],
        "Bucket encryption key does not match the declared key scope."
      )
    );
  } else if (observed.bucket.encryption === "SSE_S3") {
    findings.push(
      finding(
        "bucket_encryption",
        "PASS",
        [],
        "Supplied bucket encryption is SSE-S3."
      )
    );
  } else if (observed.bucket.encryption === "SSE_KMS") {
    findings.push(
      finding(
        "bucket_encryption",
        "PASS",
        [],
        "Supplied bucket encryption uses the declared KMS key."
      )
    );
  } else {
    findings.push(
      finding(
        "bucket_encryption",
        "INCOMPLETE",
        ["BUCKET_ENCRYPTION_UNKNOWN"],
        "Encryption evidence is missing or unsupported."
      )
    );
  }

  const planMatches =
    observed.guardDutyPlan.arn === expected.planArn &&
    observed.guardDutyPlan.accountId === expected.accountId &&
    observed.guardDutyPlan.region === expected.region &&
    observed.guardDutyPlan.bucketArn === expected.bucketArn &&
    observed.guardDutyPlan.prefix === expected.bucketPrefix &&
    observed.guardDutyPlan.roleArn === expected.scanPlanRoleArn;
  findings.push(
    observed.guardDutyPlan.status === "UNKNOWN"
      ? finding(
          "guardduty_plan",
          "INCOMPLETE",
          ["PLAN_STATUS_UNKNOWN"],
          "GuardDuty plan status evidence is incomplete."
        )
      : planMatches
        ? observed.guardDutyPlan.status === "ACTIVE"
          ? finding(
              "guardduty_plan",
              "PASS",
              [],
              "Supplied GuardDuty plan is active and scoped to the declared bucket prefix."
            )
          : finding(
              "guardduty_plan",
              "FAIL",
              ["PLAN_NOT_ACTIVE"],
              "GuardDuty plan is not active."
            )
        : finding(
            "guardduty_plan",
            "FAIL",
            ["PLAN_SCOPE_MISMATCH"],
            "GuardDuty plan identity or scope does not match the declared resources."
          )
  );

  const event = observed.eventBridge;
  const eventRuleMismatch =
    event.ruleArn !== expected.eventRuleArn ||
    event.eventBusArn !== expected.eventBusArn ||
    event.source.length !== 1 ||
    event.source[0] !== "aws.guardduty" ||
    event.detailType.length !== 1 ||
    event.detailType[0] !== "GuardDuty Malware Protection Object Scan Result" ||
    event.account.length !== 1 ||
    event.account[0] !== expected.accountId ||
    event.region.length !== 1 ||
    event.region[0] !== expected.region ||
    event.planArns.length !== 1 ||
    event.planArns[0] !== expected.planArn ||
    event.targetArns.length !== 1 ||
    event.targetArns[0] !== expected.queueArn;
  findings.push(
    event.enabled === null
      ? finding(
          "eventbridge_rule",
          "INCOMPLETE",
          ["EVENT_RULE_STATE_UNKNOWN"],
          "EventBridge rule state evidence is missing."
        )
      : eventRuleMismatch
        ? finding(
            "eventbridge_rule",
            "FAIL",
            ["EVENT_RULE_SCOPE_OR_TARGET_MISMATCH"],
            "EventBridge rule does not exactly match the declared source, plan, account, bus, and queue."
          )
        : event.enabled
          ? finding(
              "eventbridge_rule",
              "PASS",
              [],
              "Supplied EventBridge rule has the exact declared static pattern and target."
            )
          : finding(
              "eventbridge_rule",
              "FAIL",
              ["EVENT_RULE_DISABLED"],
              "EventBridge rule is disabled."
            )
  );

  const queuePolicy = parsePolicy(observed.queue.resourcePolicy);
  const queueGrantPresent = hasExactSqsEventBridgeGrant(queuePolicy, expected);
  const queuePolicyReasons = [
    ...(observed.queue.arn !== expected.queueArn ||
    observed.queue.region !== expected.region
      ? ["QUEUE_SCOPE_MISMATCH"]
      : []),
    ...(observed.queue.dlqArn !== expected.dlqArn
      ? ["QUEUE_DLQ_MISMATCH"]
      : []),
    ...(observed.queue.encryptionKeyArn !== expected.kmsKeyArn
      ? ["QUEUE_ENCRYPTION_KEY_MISMATCH"]
      : []),
    ...(!queueGrantPresent && !queuePolicy.unsupported
      ? ["QUEUE_EVENTBRIDGE_SOURCE_CONDITION_MISSING"]
      : []),
    ...(observed.queue.directSendMessagePrincipals?.some(
      (principal) => principal !== "events.amazonaws.com"
    )
      ? ["QUEUE_DIRECT_SEND_PRINCIPAL_UNEXPECTED"]
      : observed.queue.directSendMessagePrincipals === null
        ? ["QUEUE_DIRECT_SEND_INVENTORY_INCOMPLETE"]
        : []),
    ...(observed.queue.queueMutationPrincipals?.length
      ? ["QUEUE_MUTATION_PRINCIPAL_PRESENT"]
      : observed.queue.queueMutationPrincipals === null
        ? ["QUEUE_MUTATION_INVENTORY_INCOMPLETE"]
        : []),
    ...sqsPolicyRisks(queuePolicy, expected),
  ];
  findings.push(
    policyFinding(
      "sqs_resource_policy",
      queuePolicy,
      queuePolicyReasons,
      "Only an exact EventBridge rule and source account grant is accepted by the static policy check."
    )
  );

  const workerPolicy = parsePolicy(observed.worker.permissionsPolicy);
  const workerReasons = [
    ...(observed.worker.roleArn !== expected.workerRoleArn
      ? ["WORKER_ROLE_MISMATCH"]
      : []),
    ...(observed.worker.permissionsBoundaryArn === null
      ? ["WORKER_BOUNDARY_MISSING"]
      : []),
    ...(observed.worker.policySnapshotComplete === false
      ? ["IAM_POLICY_SNAPSHOT_INCOMPLETE"]
      : []),
    ...(observed.worker.policySnapshotComplete === null
      ? ["IAM_POLICY_SNAPSHOT_UNKNOWN"]
      : []),
    ...(observed.worker.principalsInventoryComplete !== true
      ? ["PRINCIPAL_INVENTORY_INCOMPLETE"]
      : []),
    ...(observed.worker.unexpectedPrincipals?.length
      ? ["UNEXPECTED_IAM_PRINCIPAL"]
      : []),
    ...(observed.worker.passRolePrincipals?.length
      ? ["IAM_PASS_ROLE_RISK"]
      : []),
    ...(hasForbiddenPermission(
      workerPolicy,
      [
        "sqs:SendMessage",
        "sqs:SendMessageBatch",
        "sqs:SetQueueAttributes",
        "sqs:*",
      ],
      expected.queueArn
    ) ||
    hasForbiddenPermission(
      workerPolicy,
      [
        "events:PutEvents",
        "events:PutRule",
        "events:PutTargets",
        "events:DeleteRule",
        "events:RemoveTargets",
      ],
      expected.eventBusArn
    ) ||
    hasForbiddenPermission(
      workerPolicy,
      [
        "events:PutRule",
        "events:PutTargets",
        "events:DeleteRule",
        "events:RemoveTargets",
      ],
      expected.eventRuleArn
    ) ||
    hasForbiddenPermission(workerPolicy, ["iam:PassRole"], undefined)
      ? ["BROAD_WORKER_PERMISSION"]
      : []),
  ];
  findings.push(
    policyFinding(
      "worker_iam_snapshot",
      workerPolicy,
      workerReasons,
      "This static worker-policy review does not evaluate effective IAM or organization controls."
    )
  );

  const spoofingRisks = [
    ...(event.ruleMutationPrincipals?.length
      ? ["EVENT_RULE_MUTATION_PRINCIPAL_PRESENT"]
      : []),
    ...(event.ruleMutationPrincipals === null
      ? ["EVENT_RULE_MUTATION_INVENTORY_INCOMPLETE"]
      : []),
    ...(event.putEventsPrincipals?.length
      ? ["EVENT_BUS_PUT_EVENTS_PRINCIPAL_PRESENT"]
      : []),
    ...(event.putEventsPrincipals === null
      ? ["EVENT_BUS_PUT_EVENTS_INVENTORY_INCOMPLETE"]
      : []),
    ...(observed.worker.passRolePrincipals?.length
      ? ["IAM_PASS_ROLE_RISK"]
      : []),
    ...(observed.worker.passRolePrincipals === null
      ? ["IAM_PASS_ROLE_INVENTORY_INCOMPLETE"]
      : []),
    ...(observed.unknownSurfaces?.length
      ? ["UNASSESSED_MUTABLE_SECURITY_SURFACE"]
      : []),
    ...(observed.unknownSurfaces === null
      ? ["SECURITY_SURFACE_INVENTORY_INCOMPLETE"]
      : []),
  ];
  findings.push(
    spoofingRisks.some(
      (code) =>
        code.endsWith("PRESENT") ||
        code === "IAM_PASS_ROLE_RISK" ||
        code === "UNASSESSED_MUTABLE_SECURITY_SURFACE"
    )
      ? finding(
          "event_injection_and_policy_mutation",
          "FAIL",
          [...new Set(spoofingRisks)],
          "A supplied principal can modify or inject into a security-sensitive delivery surface, or a surface is explicitly unassessed."
        )
      : spoofingRisks.length > 0
        ? finding(
            "event_injection_and_policy_mutation",
            "INCOMPLETE",
            [...new Set(spoofingRisks)],
            "The supplied evidence does not completely enumerate event injection and mutation surfaces."
          )
        : finding(
            "event_injection_and_policy_mutation",
            "PASS",
            [],
            "No supplied event injection or policy mutation principal was identified in this static snapshot."
          )
  );

  const kmsPolicy = parsePolicy(observed.kms.keyPolicy);
  const requiredKmsPrincipals = [
    expected.workerRoleArn,
    expected.scanPlanRoleArn,
  ].sort();
  const policyDecryptPrincipals = principalsWithPolicyGrant(
    kmsPolicy,
    "kms:Decrypt",
    expected.kmsKeyArn
  );
  const observedDecryptPrincipals = observed.kms.decryptPrincipals
    ?.slice()
    .sort();
  const observedGrantPrincipals = observed.kms.grantPrincipals?.slice().sort();
  findings.push(
    policyFinding(
      "kms_key_policy",
      kmsPolicy,
      [
        ...(!kmsPolicy.incomplete &&
        !requiredKmsPrincipals.every((principal) =>
          hasPolicyGrant(
            kmsPolicy,
            "kms:Decrypt",
            expected.kmsKeyArn,
            principal
          )
        )
          ? ["KMS_REQUIRED_DECRYPT_PRINCIPAL_MISSING"]
          : []),
        ...(policyDecryptPrincipals.some(
          ({ category, value }) =>
            category !== "AWS" || !requiredKmsPrincipals.includes(value)
        )
          ? ["UNEXPECTED_KMS_KEY_POLICY_PRINCIPAL"]
          : []),
        ...(hasForbiddenPermission(
          kmsPolicy,
          [
            "kms:PutKeyPolicy",
            "kms:CreateGrant",
            "kms:RevokeGrant",
            "kms:DisableKey",
            "kms:ScheduleKeyDeletion",
            "kms:CancelKeyDeletion",
            "kms:DisableKeyRotation",
          ],
          expected.kmsKeyArn
        )
          ? ["KMS_POLICY_MUTATION_PERMISSION_PRESENT"]
          : []),
      ],
      "The supplied key policy must name only bounded explicit decrypt principals for static review."
    )
  );
  const kmsReasons = [
    ...(observed.kms.keyArn !== expected.kmsKeyArn
      ? ["KMS_KEY_SCOPE_MISMATCH"]
      : []),
    ...(observed.bucket.encryption === "SSE_KMS" &&
    observed.bucket.kmsKeyArn !== expected.kmsKeyArn
      ? ["BUCKET_KMS_KEY_MISMATCH"]
      : []),
    ...(observed.kms.decryptPrincipals === null ||
    observed.kms.grantPrincipals === null
      ? ["KMS_DECRYPT_POLICY_INCOMPLETE"]
      : []),
    ...(observedDecryptPrincipals &&
    (requiredKmsPrincipals.some(
      (principal) => !observedDecryptPrincipals.includes(principal)
    ) ||
      observedDecryptPrincipals.some(
        (principal) => !requiredKmsPrincipals.includes(principal)
      ))
      ? ["KMS_DECRYPT_PRINCIPAL_SET_MISMATCH"]
      : []),
    ...(observedGrantPrincipals?.length
      ? ["UNEXPECTED_KMS_GRANT_PRINCIPAL"]
      : []),
    ...(observed.kms.grantsReviewed === null
      ? ["KMS_GRANTS_REVIEW_INCOMPLETE"]
      : []),
    ...(observed.kms.grantsReviewed === false
      ? ["KMS_GRANTS_REVIEW_FAILED"]
      : []),
  ];
  findings.push(
    kmsReasons.some(
      (code) =>
        code.includes("MISMATCH") ||
        code.includes("UNEXPECTED") ||
        code.includes("NOT_LISTED") ||
        code.includes("FAILED")
    )
      ? finding(
          "kms_permissions",
          "FAIL",
          kmsReasons,
          "KMS key scope or supplied decrypt/grant evidence is inconsistent."
        )
      : kmsReasons.length > 0
        ? finding(
            "kms_permissions",
            "INCOMPLETE",
            kmsReasons,
            "KMS permission and grant evidence is incomplete."
          )
        : finding(
            "kms_permissions",
            "PASS",
            [],
            "Supplied KMS key and worker decrypt principal match the declared scope."
          )
  );

  const databaseRole = observed.databaseRole;
  const databaseRoleFailures = [
    ...(databaseRole.migrationRoleSeparated === false
      ? ["DB_MIGRATION_ROLE_NOT_SEPARATE"]
      : []),
    ...(databaseRole.runtimeIsSuperuser === true
      ? ["DB_RUNTIME_ROLE_SUPERUSER"]
      : []),
    ...(databaseRole.runtimeOwnsProtectedTables === true
      ? ["DB_RUNTIME_ROLE_OWNS_AUDIT_TABLES"]
      : []),
    ...(databaseRole.runtimeCanTruncateOrAlter === true
      ? ["DB_RUNTIME_ROLE_HAS_DDL_OR_TRUNCATE"]
      : []),
    ...(databaseRole.auditMutationLimited === false
      ? ["DB_AUDIT_MUTATION_PRIVILEGES_TOO_BROAD"]
      : []),
  ];
  const databaseRoleUnknown = [
    databaseRole.migrationRoleSeparated,
    databaseRole.runtimeIsSuperuser,
    databaseRole.runtimeOwnsProtectedTables,
    databaseRole.runtimeCanTruncateOrAlter,
    databaseRole.auditMutationLimited,
  ].some((value) => value === null);
  findings.push(
    databaseRoleFailures.length > 0
      ? finding(
          "database_runtime_role",
          "FAIL",
          databaseRoleFailures,
          "Supplied database privilege evidence violates the proposed runtime-role boundary."
        )
      : databaseRoleUnknown
        ? finding(
            "database_runtime_role",
            "INCOMPLETE",
            ["DB_RUNTIME_ROLE_EVIDENCE_INCOMPLETE"],
            "The runtime and migration privilege boundary has not been fully supplied."
          )
        : finding(
            "database_runtime_role",
            "PASS",
            [],
            "Supplied database role facts match the proposed least-privilege boundary."
          )
  );

  findings.push(
    finding(
      "live_origin_and_effective_permissions",
      "INCOMPLETE",
      ["LIVE_VERIFICATION_REQUIRED"],
      "Static fixtures and operator exports do not authenticate GuardDuty delivery or prove effective IAM permissions."
    )
  );
  return {
    schema: PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA,
    toolVersion: "1.0.0",
    capturedAt: input.capturedAt,
    evidenceSource: input.source,
    findings,
    staticPolicyAssessment: "NO_GO",
    requires_live_owner_verification: true,
    limitation: LIMITATION,
  };
}
