import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runB2Cli } from "./b2-cli";
import { evaluateB2SnapshotWithB1 } from "./b2-evaluator-bridge";
import { evaluateB2ApiResponse } from "./b2-evidence";
import { collectB2FixtureObservation } from "./b2-fixture-collector";
import {
  canonicalizeB2Evidence,
  createB2ReadOnlyPlan,
  isB2ReadOnlyOperation,
} from "./b2-plan";
import { validateB2Approval, validateB2Scope } from "./b2-scope";
import {
  B2_READ_ONLY_OPERATIONS,
  type B2ApprovalRecord,
  type B2FixtureExecutor,
  type B2ReadOnlyRequest,
  type B2Scope,
  PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA,
} from "./b2-types";
import { isB2Observation } from "./b2-validation";
import { PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA } from "./types";

const now = Date.parse("2026-10-25T05:00:00.000Z");

function scopeFixture(): B2Scope {
  const accountId = "123456789012";
  const region = "ap-southeast-2";
  const bucket = "phase13-b2-sandbox-documents";
  const planId = "plan-12345678";
  const ruleName = "project-document-scan";
  const queueName = "project-document-scan";
  return {
    schema: "phase13.project_document.aws_b2_scope.v1",
    environment: "isolated_sandbox",
    approvedAccountId: accountId,
    region,
    partition: "aws",
    awsProfile: "phase13-b2-readonly",
    expectedCallerArn: `arn:aws:sts::${accountId}:assumed-role/Phase13ReadOnly/operator-session`,
    resourceSelectors: {
      bucket,
      projectDocumentPrefix: "project-document/",
      guardDutyPlanId: planId,
      guardDutyPlanArn: `arn:aws:guardduty:${region}:${accountId}:malware-protection-plan/${planId}`,
      eventBusName: "default",
      eventBusArn: `arn:aws:events:${region}:${accountId}:event-bus/default`,
      eventRuleName: ruleName,
      eventRuleArn: `arn:aws:events:${region}:${accountId}:rule/${ruleName}`,
      queueName,
      queueArn: `arn:aws:sqs:${region}:${accountId}:${queueName}`,
      queueUrl: `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`,
      dlqArn: `arn:aws:sqs:${region}:${accountId}:${queueName}-dlq`,
      applicationRoleArn: `arn:aws:iam::${accountId}:role/project-document-worker`,
      kmsKeyArn: `arn:aws:kms:${region}:${accountId}:key/11111111-2222-4333-8444-555555555555`,
    },
  };
}

function approvalFixture(scope = scopeFixture()): B2ApprovalRecord {
  return {
    schema: "phase13.project_document.aws_b2_approval.v1",
    approvalId: "aabbbccc-dddd-4eee-8fff-000000000001",
    approvedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 30 * 60_000).toISOString(),
    approvedScope: scope,
    scope: "read_only",
    acknowledgements: {
      nonproductionOnly: true,
      noMutation: true,
      noObjectAccess: true,
      noMessageConsumption: true,
    },
  };
}

function queuePolicyFinding(scope: B2Scope, policy: unknown) {
  return evaluateB2ApiResponse(
    scope,
    "sqs:GetQueueAttributes",
    {
      Attributes: {
        QueueArn: scope.resourceSelectors.queueArn,
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: scope.resourceSelectors.dlqArn,
          maxReceiveCount: "3",
        }),
        SqsManagedSseEnabled: "true",
        Policy: JSON.stringify(policy),
      },
    },
    new Date(now).toISOString(),
    "a".repeat(64)
  );
}

function exactEventBridgeQueueGrant(scope: B2Scope) {
  return {
    Effect: "Allow",
    Principal: { Service: "events.amazonaws.com" },
    Action: "sqs:SendMessage",
    Resource: scope.resourceSelectors.queueArn,
    Condition: {
      ArnEquals: { "aws:SourceArn": scope.resourceSelectors.eventRuleArn },
      StringEquals: { "aws:SourceAccount": scope.approvedAccountId },
    },
  };
}

function targetFinding(scope: B2Scope, targets: unknown) {
  return evaluateB2ApiResponse(
    scope,
    "events:ListTargetsByRule",
    { Targets: targets },
    new Date(now).toISOString(),
    "b".repeat(64)
  );
}

function fixtureExecutor(
  responses: (request: B2ReadOnlyRequest) => unknown = (request) => ({
    operation: request.operation,
    observed: true,
  })
) {
  const calls: Array<{
    request: B2ReadOnlyRequest;
    profile: string;
    region: string;
  }> = [];
  const signals: AbortSignal[] = [];
  const executor: B2FixtureExecutor = {
    kind: "fixture_only",
    execute(request, options) {
      calls.push({ request, profile: options.profile, region: options.region });
      signals.push(options.signal);
      return Promise.resolve(responses(request));
    },
  };
  return { executor, calls, signals };
}

test("plan is deterministic, redacted, ordered, and contains only read-only API names", () => {
  const scope = scopeFixture();
  const plan = createB2ReadOnlyPlan(scope);
  assert.equal(plan.mode, "plan");
  assert.equal(plan.decision, "NO_GO");
  assert.equal(plan.requests[0]?.operation, "sts:GetCallerIdentity");
  assert.ok(plan.callsUpperBound >= plan.requests.length);
  assert.equal(plan.totalDeadlineMs, 30_000);
  assert.ok(plan.requests.every((request) => request.retries === 0));
  assert.ok(plan.requests.every((request) => request.timeoutMs <= 2000));
  assert.ok(
    plan.requests.every((request) => request.maxResponseBytes <= 256 * 1024)
  );
  assert.ok(
    plan.requests.every((request) =>
      request.selectors.every((selector) =>
        /^[0-9a-f]{64}$/u.test(selector.fingerprint)
      )
    )
  );
  assert.ok(
    plan.missingInputs.some((input) => input.includes("No B2-1 owner approval"))
  );
  assert.ok(
    plan.requests.every((request) =>
      B2_READ_ONLY_OPERATIONS.includes(request.operation)
    )
  );
  assert.ok(
    plan.requests.some(
      (request) => request.operation === "s3:GetBucketEncryption"
    )
  );
  assert.doesNotMatch(
    JSON.stringify(plan),
    /123456789012|phase13-b2-sandbox|amazonaws\.com/u
  );
  assert.ok(plan.deniedOperations.includes("events:PutEvents"));
  assert.ok(plan.deniedOperations.includes("sqs:ReceiveMessage"));
  assert.ok(plan.deniedOperations.includes("all PostgreSQL operations"));
  assert.ok(
    plan.dependentRequestPlan.every(
      (request) => request.retries === 0 && request.maxPages === 1
    )
  );
  const noKms = {
    ...scope,
    resourceSelectors: { ...scope.resourceSelectors, kmsKeyArn: null },
  };
  const withoutKms = createB2ReadOnlyPlan(noKms);
  assert.ok(
    withoutKms.missingInputs.some((input) =>
      input.includes("KMS key ARN omitted")
    )
  );
  assert.ok(
    withoutKms.requests.every(
      (request) => !request.operation.startsWith("kms:")
    )
  );
  assert.equal(createB2ReadOnlyPlan().requests.length, 0);
  assert.ok(createB2ReadOnlyPlan().missingInputs.length > 0);
});

test("scope pins exact account, partition, region and selectors; rejects fallback and injection", () => {
  const scope = scopeFixture();
  assert.deepEqual(validateB2Scope(scope), scope);
  for (const altered of [
    { ...scope, awsProfile: "default" },
    { ...scope, awsProfile: "$(aws sts get-caller-identity)" },
    { ...scope, partition: "aws-cn" },
    {
      ...scope,
      resourceSelectors: {
        ...scope.resourceSelectors,
        eventBusName: "custom-bus",
      },
    },
    {
      ...scope,
      resourceSelectors: {
        ...scope.resourceSelectors,
        queueArn: "arn:aws:sqs:ap-southeast-1:123456789012:other",
      },
    },
    {
      ...scope,
      resourceSelectors: {
        ...scope.resourceSelectors,
        queueUrl: "https://attacker.invalid/123456789012/queue",
      },
    },
  ]) {
    assert.throws(() => validateB2Scope(altered), /B2_SCOPE_INVALID/u);
  }
});

test("approval must exactly match scope and be finite, current, and fully acknowledged", () => {
  const scope = scopeFixture();
  const approval = approvalFixture(scope);
  assert.equal(validateB2Approval(approval, scope, now), true);
  assert.equal(
    validateB2Approval(approval, scope, Date.parse(approval.expiresAt)),
    false
  );
  assert.equal(
    validateB2Approval(
      {
        ...approval,
        acknowledgements: { ...approval.acknowledgements, noMutation: false },
      },
      scope,
      now
    ),
    false
  );
  assert.equal(
    validateB2Approval(
      { ...approval, approvedScope: { ...scope, awsProfile: "other" } },
      scope,
      now
    ),
    false
  );
  assert.equal(
    validateB2Approval(
      { ...approval, expiresAt: new Date(now + 2 * 60 * 60_000).toISOString() },
      scope,
      now
    ),
    false
  );
});

test("CLI help and plan never invoke an executor; collection refuses before any API call", () => {
  const help = runB2Cli(["--help"]);
  const plan = runB2Cli(["plan"]);
  const denied = runB2Cli(["--collect-read-only"]);
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /offline only/u);
  assert.equal(plan.exitCode, 0);
  assert.match(plan.stdout, /NO_GO/u);
  assert.equal(denied.exitCode, 2);
  assert.match(denied.stderr, /B2_1_SEPARATE_AUTHORIZATION_REQUIRED/u);
  assert.equal(runB2Cli(["--aws", "s3", "ls"]).exitCode, 2);
});

test("CLI import and plan modules contain no AWS client, process, or fetch executor", () => {
  const entry = readFileSync(
    new URL(
      "../../../../scripts/phase13-b2-aws-security-readiness.ts",
      import.meta.url
    ),
    "utf8"
  );
  const cli = readFileSync(new URL("./b2-cli.ts", import.meta.url), "utf8");
  const plan = readFileSync(new URL("./b2-plan.ts", import.meta.url), "utf8");
  const source = `${entry}\n${cli}\n${plan}`;
  assert.doesNotMatch(
    source,
    /@aws-sdk|node:child_process|fetch\s*\(|process\.env/u
  );
});

test("fixture collection performs identity first and never follows a wrong-account STS result", async () => {
  const scope = scopeFixture();
  const fake = fixtureExecutor((request) =>
    request.operation === "sts:GetCallerIdentity"
      ? {
          Account: "999999999999",
          Arn: scope.expectedCallerArn,
          UserId: "opaque-test-user",
        }
      : { data: "must-not-be-read" }
  );
  const observation = await collectB2FixtureObservation(
    {
      collectReadOnly: true,
      confirmedAccountId: scope.approvedAccountId,
      scope,
      approval: approvalFixture(scope),
      now,
    },
    fake.executor
  );
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0]?.request.operation, "sts:GetCallerIdentity");
  assert.equal(observation.liveDecision, "NO_GO");
  assert.equal(observation.source, "fixture");
  assert.equal(observation.findings[0]?.status, "FAIL");
  assert.doesNotMatch(
    JSON.stringify(observation),
    /999999999999|123456789012|phase13-b2-sandbox/u
  );
  assert.equal("deliveryContext" in observation, false);
});

test("fixture collection requires explicit opt-in, matching approval, and a fixture-only executor", async () => {
  const scope = scopeFixture();
  const fake = fixtureExecutor();
  const base = {
    collectReadOnly: true as const,
    confirmedAccountId: scope.approvedAccountId,
    scope,
    approval: approvalFixture(scope),
    now,
  };
  const noConsent = await collectB2FixtureObservation(
    { ...base, collectReadOnly: false },
    fake.executor
  );
  assert.equal(fake.calls.length, 0);
  assert.equal(
    noConsent.findings[0]?.reasonCode,
    "COLLECTION_CONFIRMATION_OR_EXECUTOR_INVALID"
  );

  const wrongApproval = await collectB2FixtureObservation(
    { ...base, approval: approvalFixture({ ...scope, awsProfile: "other" }) },
    fake.executor
  );
  assert.equal(fake.calls.length, 0);
  assert.equal(
    wrongApproval.findings[0]?.reasonCode,
    "APPROVAL_INVALID_OR_EXPIRED"
  );

  const wrongAccount = await collectB2FixtureObservation(
    { ...base, confirmedAccountId: "999999999999" },
    fake.executor
  );
  assert.equal(fake.calls.length, 0);
  assert.equal(
    wrongAccount.findings[0]?.reasonCode,
    "COLLECTION_CONFIRMATION_OR_EXECUTOR_INVALID"
  );
});

test("fixture collection uses the fixed operation allowlist and bounded request controls", async () => {
  const scope = scopeFixture();
  const fake = fixtureExecutor((request) =>
    request.operation === "sts:GetCallerIdentity"
      ? {
          Account: scope.approvedAccountId,
          Arn: scope.expectedCallerArn,
          UserId: "opaque-test-user",
        }
      : { statementCount: 1 }
  );
  const observation = await collectB2FixtureObservation(
    {
      collectReadOnly: true,
      confirmedAccountId: scope.approvedAccountId,
      scope,
      approval: approvalFixture(scope),
      now,
    },
    fake.executor
  );
  assert.equal(fake.calls[0]?.request.operation, "sts:GetCallerIdentity");
  assert.ok(fake.calls.length > 1);
  assert.ok(
    fake.calls.every(({ request }) => isB2ReadOnlyOperation(request.operation))
  );
  assert.ok(
    fake.calls.every(
      ({ request }) =>
        request.maxAttempts === 1 &&
        request.timeoutMs <= 2000 &&
        request.maxPages <= 3
    )
  );
  assert.ok(
    fake.calls.every(
      (call) =>
        call.profile === scope.awsProfile && call.region === scope.region
    )
  );
  assert.ok(fake.signals.every((signal) => signal instanceof AbortSignal));
  assert.equal(
    observation.findings.find(
      (finding) => finding.requirement === "caller_identity"
    )?.status,
    "PASS"
  );
  assert.equal(observation.liveDecision, "NO_GO");
  assert.ok(
    observation.findings.some(
      (finding) =>
        finding.requirement === "direct_sqs_injection_and_mutation" &&
        finding.status === "INCOMPLETE"
    )
  );
  assert.ok(
    observation.findings.some(
      (finding) =>
        finding.requirement === "guardduty_origin_and_live_activation" &&
        finding.status === "INCOMPLETE"
    )
  );
  assert.ok(
    observation.findings.some(
      (finding) =>
        finding.requirement === "eventbridge_source_semantics" &&
        finding.status === "INCOMPLETE"
    )
  );
  assert.doesNotMatch(
    JSON.stringify(observation),
    /phase13-b2-sandbox|project-document-scan|123456789012/u
  );
});

test("static S3, GuardDuty, EventBridge and SQS findings enforce exact scope but never produce live GO", async () => {
  const scope = scopeFixture();
  const queuePolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "events.amazonaws.com" },
        Action: "sqs:SendMessage",
        Resource: scope.resourceSelectors.queueArn,
        Condition: {
          ArnEquals: { "aws:SourceArn": scope.resourceSelectors.eventRuleArn },
          StringEquals: { "aws:SourceAccount": scope.approvedAccountId },
        },
      },
    ],
  };
  const fake = fixtureExecutor((request) => {
    switch (request.operation) {
      case "sts:GetCallerIdentity":
        return {
          Account: scope.approvedAccountId,
          Arn: scope.expectedCallerArn,
        };
      case "s3:GetBucketVersioning":
        return { Status: "Enabled" };
      case "guardduty:GetMalwareProtectionPlan":
        return {
          MalwareProtectionPlan: {
            Arn: scope.resourceSelectors.guardDutyPlanArn,
            Status: "ACTIVE",
            ProtectedResource: {
              S3Bucket: {
                BucketName: scope.resourceSelectors.bucket,
                ObjectPrefixes: [scope.resourceSelectors.projectDocumentPrefix],
              },
            },
          },
        };
      case "events:DescribeRule":
        return {
          Arn: scope.resourceSelectors.eventRuleArn,
          EventBusName: "default",
          State: "ENABLED",
          EventPattern: {
            source: ["aws.guardduty"],
            "detail-type": ["GuardDuty Malware Protection Object Scan Result"],
            account: [scope.approvedAccountId],
            region: [scope.region],
            resources: [scope.resourceSelectors.guardDutyPlanArn],
          },
        };
      case "events:ListTargetsByRule":
        return { Targets: [{ Arn: scope.resourceSelectors.queueArn }] };
      case "sqs:GetQueueAttributes":
        return {
          Attributes: {
            QueueArn: scope.resourceSelectors.queueArn,
            RedrivePolicy: JSON.stringify({
              deadLetterTargetArn: scope.resourceSelectors.dlqArn,
              maxReceiveCount: "3",
            }),
            SqsManagedSseEnabled: "true",
            Policy: JSON.stringify(queuePolicy),
          },
        };
      default:
        return { observed: true };
    }
  });
  const observation = await collectB2FixtureObservation(
    {
      collectReadOnly: true,
      confirmedAccountId: scope.approvedAccountId,
      scope,
      approval: approvalFixture(scope),
      now,
    },
    fake.executor
  );
  const result = (requirement: string) =>
    observation.findings.find((finding) => finding.requirement === requirement)
      ?.status;
  assert.equal(result("s3:GetBucketVersioning"), "PASS");
  assert.equal(result("guardduty:GetMalwareProtectionPlan"), "PASS");
  assert.equal(result("events:DescribeRule"), "PASS");
  assert.equal(result("events:ListTargetsByRule"), "PASS");
  assert.equal(result("sqs:GetQueueAttributes"), "PASS");
  assert.equal(result("iam:GetRole"), "INCOMPLETE");
  assert.equal(result("iam:ListAttachedRolePolicies"), "INCOMPLETE");
  assert.equal(result("kms:DescribeKey"), "INCOMPLETE");
  assert.equal(result("eventbridge_source_semantics"), "INCOMPLETE");
  assert.equal(result("direct_sqs_injection_and_mutation"), "INCOMPLETE");
  assert.equal(result("guardduty_origin_and_live_activation"), "INCOMPLETE");
  assert.equal(observation.liveDecision, "NO_GO");
  assert.doesNotMatch(
    JSON.stringify(observation),
    /123456789012|phase13-b2-sandbox|project-document-scan/u
  );
});

test("SQS queue policy rejects wildcard, broad-principal and conflicting Deny grants", () => {
  const scope = scopeFixture();
  const patterns = ["sqs:Send*", "sqs:SendMess?ge", "sqs:*", "*"];
  for (const action of patterns) {
    const finding = queuePolicyFinding(scope, {
      Version: "2012-10-17",
      Statement: [
        exactEventBridgeQueueGrant(scope),
        {
          Effect: "Allow",
          Principal: { AWS: "*" },
          Action: action,
          Resource: "*",
        },
      ],
    });
    assert.equal(finding.status, "FAIL", `${action} must not be ignored`);
  }

  const unsupportedWildcard = queuePolicyFinding(scope, {
    Version: "2012-10-17",
    Statement: [
      exactEventBridgeQueueGrant(scope),
      {
        Effect: "Allow",
        Principal: "*",
        Action: "sqs:SendMessage{unsupported}",
        Resource: "*",
      },
    ],
  });
  assert.equal(unsupportedWildcard.status, "INCOMPLETE");

  const broadPrincipal = queuePolicyFinding(scope, {
    Version: "2012-10-17",
    Statement: [
      exactEventBridgeQueueGrant(scope),
      {
        Effect: "Allow",
        Principal: "*",
        Action: "sqs:SendMessage",
        Resource: scope.resourceSelectors.queueArn,
      },
    ],
  });
  assert.equal(broadPrincipal.status, "FAIL");

  const explicitDeny = queuePolicyFinding(scope, {
    Version: "2012-10-17",
    Statement: [
      exactEventBridgeQueueGrant(scope),
      {
        Effect: "Deny",
        Principal: "*",
        Action: "sqs:SendMessage",
        Resource: scope.resourceSelectors.queueArn,
      },
    ],
  });
  assert.equal(explicitDeny.status, "FAIL");

  const narrowGrant = queuePolicyFinding(scope, {
    Version: "2012-10-17",
    Statement: [exactEventBridgeQueueGrant(scope)],
  });
  assert.equal(narrowGrant.status, "PASS");
});

test("EventBridge target finding requires one exact, untransformed SQS target", () => {
  const scope = scopeFixture();
  const exact = { Id: "guardduty-scan", Arn: scope.resourceSelectors.queueArn };
  assert.equal(targetFinding(scope, [exact]).status, "PASS");

  for (const transformation of ["Input", "InputPath", "InputTransformer"]) {
    const finding = targetFinding(scope, [
      { ...exact, [transformation]: { unreviewed: true } },
    ]);
    assert.equal(finding.status, "INCOMPLETE", transformation);
    assert.equal(
      finding.reasonCode,
      "EVENT_RULE_TARGET_INPUT_TRANSFORMATION_UNREVIEWED"
    );
  }

  for (const malformed of [null, "not-a-target", { Arn: 17 }]) {
    assert.equal(targetFinding(scope, [malformed]).status, "INCOMPLETE");
  }
  assert.equal(
    targetFinding(scope, [{ ...exact, RoleArn: "arn:unexpected:role" }]).status,
    "INCOMPLETE"
  );
  assert.equal(targetFinding(scope, [exact, exact]).status, "FAIL");
  assert.equal(
    targetFinding(scope, [{ ...exact, Arn: "arn:aws:sqs:other-queue" }]).status,
    "FAIL"
  );
});

test("missing S3 Versioning, mismatched GuardDuty scope and broad SQS principals fail closed", async () => {
  const scope = scopeFixture();
  const fake = fixtureExecutor((request) => {
    if (request.operation === "sts:GetCallerIdentity") {
      return { Account: scope.approvedAccountId, Arn: scope.expectedCallerArn };
    }
    if (request.operation === "s3:GetBucketVersioning") {
      return { Status: "Suspended" };
    }
    if (request.operation === "guardduty:GetMalwareProtectionPlan") {
      return {
        MalwareProtectionPlan: {
          Arn: scope.resourceSelectors.guardDutyPlanArn,
          Status: "ACTIVE",
          ProtectedResource: {
            S3Bucket: {
              BucketName: "other-sandbox-bucket",
              ObjectPrefixes: ["project-document/", "unrelated/"],
            },
          },
        },
      };
    }
    if (request.operation === "sqs:GetQueueAttributes") {
      return {
        Attributes: {
          QueueArn: scope.resourceSelectors.queueArn,
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: scope.resourceSelectors.dlqArn,
          }),
          SqsManagedSseEnabled: "true",
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { AWS: "*" },
                Action: "sqs:SendMessage",
                Resource: "*",
              },
            ],
          }),
        },
      };
    }
    return { observed: true };
  });
  const observation = await collectB2FixtureObservation(
    {
      collectReadOnly: true,
      confirmedAccountId: scope.approvedAccountId,
      scope,
      approval: approvalFixture(scope),
      now,
    },
    fake.executor
  );
  const result = (requirement: string) =>
    observation.findings.find((finding) => finding.requirement === requirement)
      ?.status;
  assert.equal(result("s3:GetBucketVersioning"), "FAIL");
  assert.equal(result("guardduty:GetMalwareProtectionPlan"), "FAIL");
  assert.equal(result("sqs:GetQueueAttributes"), "FAIL");
  assert.equal(observation.liveDecision, "NO_GO");
});

test("pagination markers remain incomplete and are never exposed in the report", async () => {
  const scope = scopeFixture();
  const fake = fixtureExecutor((request) => {
    if (request.operation === "sts:GetCallerIdentity") {
      return { Account: scope.approvedAccountId, Arn: scope.expectedCallerArn };
    }
    if (request.operation === "events:ListTargetsByRule") {
      return { NextToken: "sensitive-continuation-token", Targets: [] };
    }
    return { result: true };
  });
  const observation = await collectB2FixtureObservation(
    {
      collectReadOnly: true,
      confirmedAccountId: scope.approvedAccountId,
      scope,
      approval: approvalFixture(scope),
      now,
    },
    fake.executor
  );
  assert.ok(
    observation.findings.some(
      (finding) => finding.reasonCode === "PAGINATION_REMAINS_UNCOLLECTED"
    )
  );
  assert.doesNotMatch(
    JSON.stringify(observation),
    /sensitive-continuation-token/u
  );
});

test("denied, oversized and timed-out API results remain incomplete and expose no raw payload", async () => {
  const scope = scopeFixture();
  const denied = fixtureExecutor((request) => {
    if (request.operation === "sts:GetCallerIdentity") {
      return { Account: scope.approvedAccountId, Arn: scope.expectedCallerArn };
    }
    throw new Error("AccessDenied: policy contains secret-principal");
  });
  const deniedObservation = await collectB2FixtureObservation(
    {
      collectReadOnly: true,
      confirmedAccountId: scope.approvedAccountId,
      scope,
      approval: approvalFixture(scope),
      now,
    },
    denied.executor
  );
  assert.ok(
    deniedObservation.findings.some(
      (finding) => finding.reasonCode === "API_DENIED_OR_UNAVAILABLE"
    )
  );
  assert.doesNotMatch(
    JSON.stringify(deniedObservation),
    /AccessDenied|secret-principal/u
  );

  const oversized = fixtureExecutor((request) =>
    request.operation === "sts:GetCallerIdentity"
      ? { Account: scope.approvedAccountId, Arn: scope.expectedCallerArn }
      : { content: "x".repeat(256 * 1024) }
  );
  const oversizedObservation = await collectB2FixtureObservation(
    {
      collectReadOnly: true,
      confirmedAccountId: scope.approvedAccountId,
      scope,
      approval: approvalFixture(scope),
      now,
    },
    oversized.executor
  );
  assert.ok(
    oversizedObservation.findings.some(
      (finding) => finding.reasonCode === "RESPONSE_SIZE_LIMIT"
    )
  );
  assert.doesNotMatch(JSON.stringify(oversizedObservation), /x{100}/u);

  const timeout = fixtureExecutor((_request) => new Promise(() => undefined));
  const timeoutObservation = await collectB2FixtureObservation(
    {
      collectReadOnly: true,
      confirmedAccountId: scope.approvedAccountId,
      scope,
      approval: approvalFixture(scope),
      now,
    },
    timeout.executor
  );
  assert.equal(timeout.calls.length, 1);
  assert.ok(
    timeoutObservation.findings.some(
      (finding) => finding.reasonCode === "API_TIMEOUT"
    )
  );
});

test("B2 to B1 bridge requires matching fixture provenance and retains unconditional NO_GO", () => {
  const observation = {
    schema: PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA,
    source: "fixture",
    scopeFingerprint: "a".repeat(64),
    findings: [],
    liveDecision: "NO_GO",
    requiresLiveOwnerVerification: true,
    limitation: "fixture",
  };
  const snapshot = {
    schema: PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA,
    source: "fixture",
  };
  const report = evaluateB2SnapshotWithB1(observation, snapshot);
  assert.equal(report.staticPolicyAssessment, "NO_GO");
  assert.equal(report.evidenceSource, "fixture");
  assert.throws(
    () =>
      evaluateB2SnapshotWithB1(observation, {
        ...snapshot,
        source: "operator_export",
      }),
    /B2_B1_PROVENANCE_MISMATCH/u
  );
  assert.throws(
    () =>
      evaluateB2SnapshotWithB1(
        { ...observation, liveDecision: "GO" },
        snapshot
      ),
    /B2_OBSERVATION_INVALID/u
  );
  let sourceGetterCalled = false;
  const accessorSnapshot = {
    schema: PROJECT_DOCUMENT_AWS_SECURITY_EVIDENCE_SCHEMA,
  };
  Object.defineProperty(accessorSnapshot, "source", {
    get() {
      sourceGetterCalled = true;
      return "fixture";
    },
  });
  assert.throws(
    () => evaluateB2SnapshotWithB1(observation, accessorSnapshot),
    /B1_STATIC_SNAPSHOT_INVALID/u
  );
  assert.equal(sourceGetterCalled, false);
});

test("observation validation and evidence fingerprints reject malformed objects without invoking getters", () => {
  const observation = {
    schema: PROJECT_DOCUMENT_AWS_B2_OBSERVATION_SCHEMA,
    source: "fixture",
    scopeFingerprint: null,
    findings: [],
    liveDecision: "NO_GO",
    requiresLiveOwnerVerification: true,
    limitation: "offline fixture",
  };
  assert.equal(isB2Observation(observation), true);
  assert.equal(isB2Observation({ ...observation, liveDecision: "GO" }), false);
  assert.equal(
    isB2Observation({ ...observation, findings: new Array(1) }),
    false
  );

  let getterCalled = false;
  const accessor = Object.defineProperty({}, "secret", {
    get() {
      getterCalled = true;
      return "sensitive";
    },
  });
  assert.equal(canonicalizeB2Evidence(accessor), null);
  assert.equal(getterCalled, false);
  const first = canonicalizeB2Evidence({ b: 2, a: 1 });
  const second = canonicalizeB2Evidence({ a: 1, b: 2 });
  assert.equal(first, second);
});
